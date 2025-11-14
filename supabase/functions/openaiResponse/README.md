openaiResponse
===================

Edge Function proxy for calling the OpenAI Responses API from secure server-side environment.

Usage
- POST JSON { model, input, store? }
- Requires `OPENAI_API_KEY` secret set in Supabase functions secrets.

Deploy
- supabase functions deploy openaiResponse
- supabase secrets set OPENAI_API_KEY="<your-key>"
