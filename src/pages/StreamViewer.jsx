import React, { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import ChatBox from "@/components/stream/ChatBox";
import AgoraRTC from "agora-rtc-sdk-ng";
import { getAgoraToken } from "@/utils/agora";
import EntranceEffect from "@/components/stream/EntranceEffect";

const StreamViewer = ({
  appId,
  channelName,
  token,
  uid,
  isStreamer,
  stream,
  isApprovedCoHost,
}) => {
  const agoraClientRef = useRef(null);
  const localTracksRef = useRef({ audio: null, video: null });
  const remoteUsersRef = useRef({});
  const videoContainerRef = useRef(null);
  const shownEntrancesRef = useRef(new Set());
  const joinSentRef = useRef(false);
  const [entranceUser, setEntranceUser] = useState(null);
  const [viewerToken, setViewerToken] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [derivedAppId, setDerivedAppId] = useState(null);

  // Derive streamId from query params when routed via pages like Home/AdminLiveControl
  const searchParams = new URLSearchParams(window.location.search);
  const queryStreamId = searchParams.get("id") || searchParams.get("streamId");

  // Fetch current user (viewer)
  const { data: currentUser } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => supabase.auth.me(),
    retry: false,
    staleTime: 10000,
  });

  // Fetch stream details if not provided via props
  const { data: fetchedStream } = useQuery({
    queryKey: ["streamByIdOrStreamer", queryStreamId],
    queryFn: async () => {
      if (!queryStreamId) return null;
      // First try by stream id
      let rows = await supabase.entities.Stream.filter({ id: queryStreamId }, undefined, 1);
      let found = rows?.[0] || null;
      if (found) return found;
      // Fallback: some links may pass streamer_id instead of stream.id
      rows = await supabase.entities.Stream.filter({ streamer_id: queryStreamId }, "-created_at", 1);
      return rows?.[0] || null;
    },
    enabled: !!queryStreamId,
    initialData: null,
    staleTime: 3000,
    refetchInterval: 5000,
  });

  const effectiveStream = stream || fetchedStream;
  const isUserStreamer = !!(currentUser && effectiveStream && currentUser.id === effectiveStream.streamer_id);
  const effectiveIsStreamer = !!(isStreamer || isUserStreamer);

  // Compute moderation capability for viewer
  const canModerate = !!(
    (currentUser?.user_role === "admin" || currentUser?.role === "admin") ||
    currentUser?.is_troll_officer ||
    currentUser?.permissions?.includes("moderate_chat") ||
    currentUser?.permissions?.includes("kick_users") ||
    currentUser?.permissions?.includes("ban_users") ||
    isUserStreamer
  );

  // Derive effective Agora credentials from props, stream row, or env
  const effectiveAppId = appId || derivedAppId || import.meta.env.VITE_AGORA_APP_ID;
  const effectiveChannelName = channelName || effectiveStream?.agora_channel_name || effectiveStream?.agora_channel_name || effectiveStream?.agora_channel;
  const effectiveToken = token || effectiveStream?.agora_token;
  useEffect(() => {
    setViewerToken(effectiveToken || null);
  }, [effectiveToken]);
  const effectiveUid = uid || currentUser?.id || 0;

  // Initialize Agora client
  const initAgoraClient = async () => {
    if (!effectiveAppId || !effectiveChannelName) {
      console.warn("[Agora] Missing credentials:", { effectiveAppId, effectiveChannelName });
      return;
    }

    setConnecting(true);

    const client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
    agoraClientRef.current = client;

    // Handle remote users joining
    client.on("user-published", async (remoteUser, mediaType) => {
      console.log("[Agora] user-published:", remoteUser.uid, mediaType);

      // 🧠 Guard: only subscribe when connected
      if (!client || client.connectionState !== "CONNECTED") {
        console.warn(
          "⚠️ Skipping subscribe — invalid connection state:",
          client.connectionState
        );
        return;
      }

      try {
        await client.subscribe(remoteUser, mediaType);
        console.log("[Agora] subscribed to user:", remoteUser.uid);

        if (mediaType === "video") {
          const remoteContainer = document.createElement("div");
          remoteContainer.id = `remote-${remoteUser.uid}`;
          remoteContainer.style.width = "100%";
          remoteContainer.style.height = "100%";
          videoContainerRef.current.appendChild(remoteContainer);
          remoteUser.videoTrack.play(remoteContainer);
        }

        if (mediaType === "audio" && remoteUser.audioTrack) {
          remoteUser.audioTrack.play();
        }

        remoteUsersRef.current[remoteUser.uid] = remoteUser;
      } catch (error) {
        console.error("❌ Failed to subscribe:", error);
      }
    });

    // Handle remote users leaving
    client.on("user-unpublished", (remoteUser) => {
      console.log("[Agora] user-unpublished:", remoteUser.uid);
      const remoteContainer = document.getElementById(`remote-${remoteUser.uid}`);
      if (remoteContainer) remoteContainer.remove();
      delete remoteUsersRef.current[remoteUser.uid];
    });

    client.on("connection-state-change", (curState, prevState) => {
      console.log(`[Agora] Connection state changed: ${prevState} -> ${curState}`);
    });

    // Join the channel
    try {
      let tokenToUse = viewerToken;
      let appIdToUse = effectiveAppId;
      if (!tokenToUse) {
        try {
          const tokenData = await getAgoraToken(effectiveChannelName, effectiveUid);
          tokenToUse = tokenData?.token ?? tokenData?.rtcToken ?? tokenData?.data?.token ?? null;
          appIdToUse = appIdToUse || tokenData?.appId || tokenData?.agoraAppId || tokenData?.data?.appId || null;
          if (tokenToUse) setViewerToken(tokenToUse);
          if (appIdToUse) setDerivedAppId(appIdToUse);
        } catch (tErr) {
          console.warn("[Agora] Initial token fetch failed:", tErr);
        }
      }

      if (!appIdToUse) {
        console.warn("[Agora] Missing App ID — set VITE_AGORA_APP_ID or return 'appId' from token API.");
        setConnecting(false);
        return;
      }

      await client.join(appIdToUse, effectiveChannelName, tokenToUse, effectiveUid);
      console.log("[Agora] Joined channel:", effectiveChannelName);
      setConnecting(false);

      // Streamer or Co-host publishes local tracks
      if (isStreamer || isApprovedCoHost) {
        const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
        localTracksRef.current = { audio: audioTrack, video: videoTrack };
        await client.publish(Object.values(localTracksRef.current));
        videoTrack.play(videoContainerRef.current);
        console.log("[Agora] Local tracks published");
      }
    } catch (error) {
      console.error("[Agora] Join error:", error);
      const msg = String(error?.message || "").toUpperCase();
      const code = Number(error?.code);
      const isTokenExpired = msg.includes("DYNAMIC_KEY_EXPIRED") || msg.includes("TOKEN_EXPIRED") || code === 109;
      if (isTokenExpired) {
        console.warn("[Agora] Token expired, attempting to refresh token...");
        try {
          const tokenData = await getAgoraToken(effectiveChannelName, effectiveUid);
          const newToken = tokenData?.token ?? tokenData?.rtcToken ?? tokenData?.data?.token ?? null;
          const newAppId = tokenData?.appId || tokenData?.agoraAppId || tokenData?.data?.appId || effectiveAppId;
          if (!newToken) {
            console.warn("[Agora] No token returned from fallback token fetch.");
          } else {
            setViewerToken(newToken);
            if (newAppId) setDerivedAppId(newAppId);
            await client.join(newAppId, effectiveChannelName, newToken, effectiveUid);
            console.log("[Agora] Re-joined channel after token refresh:", effectiveChannelName);
            if (isStreamer || isApprovedCoHost) {
              const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
              localTracksRef.current = { audio: audioTrack, video: videoTrack };
              await client.publish(Object.values(localTracksRef.current));
              videoTrack.play(videoContainerRef.current);
              console.log("[Agora] Local tracks published (after refresh)");
            }
            setConnecting(false);
          }
        } catch (refreshErr) {
          console.error("[Agora] Token refresh failed:", refreshErr);
        }
      }
      setConnecting(false);
    }
  };

  // Clean up Agora
  const cleanupAgora = async () => {
    const client = agoraClientRef.current;
    if (client) {
      try {
        console.log("[Agora] Cleaning up Agora client...");
        client.removeAllListeners();
        Object.values(remoteUsersRef.current).forEach((user) => {
          const el = document.getElementById(`remote-${user.uid}`);
          if (el) el.remove();
        });
        remoteUsersRef.current = {};

        const { audio, video } = localTracksRef.current;
        if (audio) audio.close();
        if (video) video.close();
        localTracksRef.current = {};

        await client.leave();
        console.log("[Agora] Left the channel cleanly");
      } catch (e) {
        console.error("Leave error:", e);
      } finally {
        agoraClientRef.current = null;
      }
    }
  };

  // Effect to handle connection
  // Normalize live status across boolean/string/number forms
  const normalizedIsLive = (
    effectiveStream?.is_live === true ||
    effectiveStream?.is_live === "true" ||
    effectiveStream?.is_live === 1 ||
    effectiveStream?.status === "live"
  );

  useEffect(() => {
    const shouldAttemptJoin = !effectiveIsStreamer && (
      normalizedIsLive || !!effectiveChannelName
    ) && !!effectiveAppId;

    if (shouldAttemptJoin) {
      const timer = setTimeout(() => {
        initAgoraClient();
      }, 1000);

      return () => {
        clearTimeout(timer);
        cleanupAgora();
      };
    }
  }, [normalizedIsLive, effectiveStream?.status, effectiveIsStreamer, effectiveAppId, effectiveChannelName, viewerToken]);

  // Emit a join chat message when a viewer enters the stream (once per session)
  useEffect(() => {
    const sendJoinMessage = async () => {
      try {
        if (!effectiveStream?.id || !currentUser?.id) return;
        if (effectiveIsStreamer) return; // streamer should not emit viewer join
        if (joinSentRef.current) return;

        await supabase.entities.ChatMessage.create({
          stream_id: effectiveStream.id,
          user_id: currentUser.id,
          username: currentUser.username || currentUser.full_name,
          message_type: "join",
        });
        joinSentRef.current = true;
        console.log("👋 Sent join message for viewer:", currentUser.username || currentUser.full_name);
      } catch (e) {
        console.warn("Failed to send join message:", e?.message || e);
      }
    };

    sendJoinMessage();
  }, [effectiveStream?.id, currentUser?.id, effectiveIsStreamer]);

  // Fetch chat messages to detect join events and show entrance effects on viewer side
  const { data: chatMessages = [] } = useQuery({
    queryKey: ["viewerStreamChat", effectiveStream?.id],
    queryFn: async () => {
      if (!effectiveStream?.id) return [];
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("stream_id", effectiveStream.id)
        .order("created_date", { ascending: false })
        .limit(100);
      if (error) { console.warn("fetch viewer chat error:", error.message); return []; }
      return data || [];
    },
    initialData: [],
    refetchInterval: 3000,
    enabled: !!effectiveStream?.id,
    staleTime: 2000,
  });

  useEffect(() => {
    const joins = chatMessages.filter(m => m.message_type === "join" && !shownEntrancesRef.current.has(m.id));
    if (joins.length === 0) return;

    const latestJoin = joins[0];
    (async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", latestJoin.user_id)
          .limit(1);
        if (error) throw error;
        const joiningUser = Array.isArray(data) ? data[0] : null;
        if (joiningUser && joiningUser.active_entrance_effect) {
          setEntranceUser(joiningUser);
          shownEntrancesRef.current.add(latestJoin.id);
          setTimeout(() => setEntranceUser(null), 4000);
        }
      } catch (e) {
        console.error("viewer entrance effect lookup failed:", e);
      }
    })();
  }, [chatMessages]);

  return (
    <div style={{ width: "100%", height: "100%", background: "#000", display: "flex", flexDirection: "row" }}>
      {/* Entrance effect overlay for viewers */}
      {entranceUser && (
        <EntranceEffect user={entranceUser} durationMs={4000} onComplete={() => setEntranceUser(null)} />
      )}
      <div
        ref={videoContainerRef}
        id="video-container"
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <p style={{ color: "#fff" }}>
          {connecting
            ? "Connecting to live stream..."
            : effectiveStream == null
              ? "Loading stream..."
              : (!effectiveChannelName || !effectiveAppId)
                ? "Missing streaming credentials. Set VITE_AGORA_APP_ID or join with a valid channel."
                : normalizedIsLive
                  ? "Connecting to live stream..."
                  : "Stream not live"}
        </p>
      </div>

      {/* Chat sidebar */}
      <div style={{ width: 360, borderLeft: "1px solid #222", background: "#0a0a0f" }}>
        {effectiveStream ? (
          <ChatBox stream={effectiveStream} user={currentUser} canModerate={canModerate} />
        ) : (
          <div style={{ color: "#bbb", padding: 12 }}>Loading chat…</div>
        )}
      </div>
    </div>
  );
};

export default StreamViewer;
