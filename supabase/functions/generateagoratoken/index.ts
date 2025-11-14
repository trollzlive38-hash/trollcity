import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
// Using esm.sh to provide the Agora token helpers in Deno
import { RtcTokenBuilder, RtcRole } from "https://esm.sh/agora-access-token@1.2.1";

const APP_ID = Deno.env.get("AGORA_APP_ID") || Deno.env.get("VITE_AGORA_APP_ID") || "";
const APP_CERT = Deno.env.get("AGORA_APP_CERTIFICATE") || Deno.env.get("VITE_AGORA_APP_CERTIFICATE") || "";

serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: { "content-type": "application/json" } });
    }
    const body = await req.json().catch(() => ({}));
    const channelName = body?.channelName || body?.channel || "default_channel";
    // uid can be numeric (uid) or string userId; if string, Agora allows using a string token variant but
    // for simplicity we coerce to a numeric uid when possible, otherwise default to 0
    let uid = 0;
    if (typeof body?.uid === "number") uid = body.uid;
    else if (typeof body?.uid === "string") {
      // try to coerce numeric suffix
      const parsed = parseInt(body.uid, 10);
      uid = Number.isNaN(parsed) ? 0 : parsed;
    }
    const roleStr = (body?.role || "publisher").toLowerCase();
    const role = roleStr === "publisher" || roleStr === "host" ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;

    if (!APP_ID || !APP_CERT) {
      return new Response(JSON.stringify({ error: "Missing Agora secrets on server. Set AGORA_APP_ID and AGORA_APP_CERTIFICATE." }), { status: 500, headers: { "content-type": "application/json" } });
    }

    const expireSeconds = Number(body?.expireSeconds ?? 3600); 
    const currentTs = Math.floor(Date.now() / 1000);
    const privilegeExpireTs = currentTs + expireSeconds;

    // Build token with numeric uid (0 is allowed for simplicity)
    const token = RtcTokenBuilder.buildTokenWithUid(APP_ID, APP_CERT, channelName, uid, role, privilegeExpireTs);

    const resp = { token, appId: APP_ID, uid, channelName };
    return new Response(JSON.stringify(resp), { status: 200, headers: { "content-type": "application/json" } });
  } catch (err) {
    console.error("generateagoratoken error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { "content-type": "application/json" } });
  }
});
