import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Trash2, Slash } from "lucide-react";
import UserBadges from "@/components/UserBadges";

export default function ChatBox({ stream, user, canModerate, isStreamer }) {
  const navigate = useNavigate();
  const streamId = stream?.id;
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");

  // Fetch currently active stream bans for this streamer
  const { data: streamBans = [] } = useQuery({
    queryKey: ["streamBans", stream?.id],
    queryFn: async () => {
      if (!stream?.streamer_id) return [];
      const { data, error } = await supabase
        .from('user_stream_bans')
        .select('*')
        .eq('streamer_id', stream.streamer_id)
        .eq('is_active', true);
      if (error) { console.warn('Failed to fetch stream bans:', error.message); return []; }
      return data || [];
    },
    enabled: !!stream?.streamer_id,
    refetchInterval: 5000,
  });

  const isUserBanned = (userId) => {

    const unkickMutation = useMutation(async (targetUserId) => {
      if (!streamId) throw new Error('Missing stream id');
      const { data: authData } = await supabase.auth.getUser();
      const current = authData?.user || null;
      if (!current) throw new Error('Not authenticated');
      if (current.id !== (stream?.streamer_id || stream?.broadcaster_id)) throw new Error('Only the broadcaster can unkick');

      const { error } = await supabase
        .from('user_stream_bans')
        .update({ is_active: false, removed_date: new Date().toISOString() })
        .eq('streamer_id', current.id)
        .eq('user_id', targetUserId)
        .eq('is_active', true);
      if (error) throw error;
      return targetUserId;
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries(["streamBans", stream?.id]);
        toast.success('User unbanned from this stream');
      },
      onError: (err) => {
        console.error('Unkick failed', err);
        toast.error(err?.message || 'Failed to unkick user');
      }
    });
    if (!userId) return false;
    return Array.isArray(streamBans) && streamBans.some(b => String(b.user_id) === String(userId) && b.is_active);
  };

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["streamChat", streamId],
    queryFn: async () => {
      if (!streamId) return [];
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("stream_id", streamId)
        .order("created_date", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: !!streamId,
    refetchInterval: 3000,
  });

  const sendMutation = useMutation(async (text) => {
    if (!streamId || !user) throw new Error("Missing stream or user");
    const payload = {
      stream_id: streamId,
      user_id: user.id,
      username: user.username || user.full_name || "Anon",
      message_type: "chat",
      message: text,
    };
    const { error } = await supabase.from("chat_messages").insert(payload);
    if (error) throw error;
    return payload;
  }, {
    onSuccess: () => {
      setMessage("");
      queryClient.invalidateQueries(["streamChat", streamId]);
    },
    onError: (err) => {
      console.error("send message failed", err);
      toast.error("Failed to send message");
    }
  });

  const deleteMutation = useMutation(async (messageId) => {
    const { error } = await supabase
      .from("chat_messages")
      .delete()
      .eq("id", messageId);
    if (error) throw error;
    return messageId;
  }, {
    onSuccess: () => {
      queryClient.invalidateQueries(["streamChat", streamId]);
      toast.success("Message deleted");
    },
    onError: (err) => {
      console.error("delete message failed", err);
      toast.error("Failed to delete message");
    }
  });

  const permanentKickMutation = useMutation(async (targetUserId) => {
    if (!streamId) throw new Error('Missing stream id');
    // Ensure current user is streamer
    const { data: authData } = await supabase.auth.getUser();
    const current = authData?.user || null;
    if (!current) throw new Error('Not authenticated');
    if (current.id !== (stream?.streamer_id || stream?.broadcaster_id)) throw new Error('Only the broadcaster can perform a permanent kick');

    // Perform server-side secured permanent kick using RPC
    const { error: rpcErr } = await supabase.rpc('perform_permanent_kick', {
      broadcaster_id: current.id,
      target_user_id: targetUserId,
      stream_id: streamId || null,
      coin_cost: 1000,
    });
    if (rpcErr) throw rpcErr;

    return { targetUserId };
  }, {
    onSuccess: async () => {
      queryClient.invalidateQueries(["streamChat", streamId]);
      queryClient.invalidateQueries(["viewerStreamBans", streamId]);
      queryClient.invalidateQueries(["streamByIdOrStreamer", streamId]);
      queryClient.invalidateQueries(["streamBans", stream?.id]);
      queryClient.invalidateQueries(["currentUser"]);
      toast.success('✅ Permanent kick applied — user removed from this broadcast until you unkick them');
    },
    onError: (err) => {
      console.error('Permanent kick failed', err);
      toast.error(err?.message || 'Failed to apply permanent kick — ensure you have 1000 paid coins');
    }
  });

  const handleDeleteMessage = (messageId) => {
    if (confirm("Delete this message?")) {
      deleteMutation.mutate(messageId);
    }
  };

  const handleUsernameClick = (username) => {
    if (!username) return;
    // Find the user by username to get their ID
    navigate(`${createPageUrl("PublicProfile")}?username=${encodeURIComponent(username)}`);
  };

  const handleSend = async () => {
    if (!message.trim()) return;
    // Check if user has chat disabled
    if (user?.chat_disabled) {
      toast.error("Your chat has been disabled by moderators");
      return;
    }

    // AI Moderation: Check message for inappropriate content
    try {
      const moderationResponse = await supabase.functions.invoke("openaiResponse", {
        body: {
          prompt: `You are a family-friendly stream moderator. Analyze this chat message for appropriateness. Reply with ONLY one word: 'approved' if safe, 'flag' if questionable, or 'delete' if clearly inappropriate.

Message: "${message.trim()}"

Remember: This is a family-friendly live stream. Check for profanity, harassment, inappropriate content, spam, or self-promotion.`,
          model: "gpt-4o-mini",
          max_tokens: 10
        }
      });

      const moderationResult = moderationResponse?.data?.choices?.[0]?.message?.content?.trim()?.toLowerCase() || "approved";

      if (moderationResult === "delete") {
        toast.error("❌ Message blocked: Contains inappropriate content for family-friendly stream");
        setMessage("");
        return;
      }

      if (moderationResult === "flag") {
        // Auto-report to moderation queue but allow message to send
        try {
          await supabase.from("moderation_actions").insert({
            stream_id: streamId,
            user_id: user?.id,
            action_type: "message_flagged",
            reason: "AI flagged for potential issue",
            message_content: message.trim(),
            status: "pending_review",
            flagged_by: "ai_moderation"
          });
        } catch (err) {
          console.warn("Failed to log moderation action", err);
        }
        toast.info("⚠️ Message flagged for review by moderators");
      }

      // Message approved or flagged (but allowed), send it
      sendMutation.mutate(message.trim());
    } catch (err) {
      console.error("AI moderation error", err);
      // Fallback: allow message if moderation service fails
      toast.warning("⚠️ Moderation check skipped, message sent");
      sendMutation.mutate(message.trim());
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isChatDisabled = user?.chat_disabled;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-3 bg-[#07070a]">
        {isLoading ? (
          <div className="text-gray-500">Loading chat…</div>
        ) : messages.length === 0 ? (
          <div className="text-gray-500">No messages yet</div>
        ) : (
          <div className="flex flex-col-reverse gap-2">
            {messages.map((m) => (
              <div key={m.id} className="text-sm flex items-start justify-between gap-2 group hover:bg-[#1a1a24] p-1 rounded transition-colors">
                <div className="flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => handleUsernameClick(m.username)}
                    className="text-white hover:text-blue-400 hover:underline font-semibold cursor-pointer mr-2 transition-colors flex items-center gap-1"
                  >
                    {m.username}
                    <UserBadges user={m} size="xs" />
                  </button>
                  <span className="text-gray-300 break-words">{m.message}</span>
                </div>
                <div className="flex items-center gap-2">
                  {(user?.id === m.user_id || canModerate) && (
                    <button
                      type="button"
                      onClick={() => handleDeleteMessage(m.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-500 flex-shrink-0"
                      title="Delete message"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}

                  {/* Streamer-only: pay 1000 paid coins to permanently kick this user from your broadcast */}
                  {isStreamer && m.user_id && m.user_id !== user?.id && (
                    isUserBanned(m.user_id) ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (!confirm('Unkick this user from your broadcast? They will be allowed to rejoin. Proceed?')) return;
                          unkickMutation.mutate(m.user_id);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-green-400 hover:text-green-500 flex-shrink-0"
                        title="Unkick user"
                      >
                        <Slash className="w-4 h-4 rotate-180" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          if (!confirm('Permanently kick this user from your broadcast for 1000 paid coins? They will remain kicked until you unkick them. Proceed?')) return;
                          permanentKickMutation.mutate(m.user_id);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-yellow-400 hover:text-yellow-500 flex-shrink-0"
                        title="Permanent Kick (1000 paid coins)"
                      >
                        <Slash className="w-4 h-4" />
                      </button>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-3 border-t border-[#222] bg-[#040405]">
        {isChatDisabled ? (
          <div className="text-red-400 text-sm p-3 bg-red-900/20 rounded">
            ⚠️ Your chat has been disabled by moderators.
          </div>
        ) : (
          <div className="flex gap-2">
            <Input 
              value={message} 
              onChange={(e) => setMessage(e.target.value)} 
              onKeyDown={handleKeyDown}
              placeholder="Say something… (Enter to send, Shift+Enter for newline)" 
            />
            <Button type="button" onClick={handleSend} disabled={!message.trim()}>Send</Button>
          </div>
        )}
      </div>
    </div>
  );
}

