generateagoratoken
===================

Supabase Edge Function (Deno) to generate Agora RTC tokens.

What it does
- Expects a POST JSON body: { channelName, uid, role?, expireSeconds? }
- Returns JSON: { token, appId, uid, channelName }

Secrets required
- AGORA_APP_ID
- AGORA_APP_CERTIFICATE

Deployment
1. Ensure you have the Supabase CLI installed and are authenticated:
   - https://supabase.com/docs/guides/cli
2. From the repo root, deploy the function:
   - supabase functions deploy generateagoratoken --project-ref <your-project-ref>

Set secrets (one-time; replace values):
- supabase secrets set AGORA_APP_ID="<your-app-id>" AGORA_APP_CERTIFICATE="<your-app-cert>"

Testing
- After deploy you can call the function via the Supabase client or the invoke command:
  supabase functions invoke generateagoratoken --body '{"channelName":"test","uid":123,"role":"publisher"}'

Notes
- The function uses the npm package `agora-access-token` via esm.sh to avoid bundling.
- If you prefer different token semantics (string user IDs, RTM tokens, or role mappings) edit index.ts accordingly.
