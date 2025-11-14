import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

serve(async (req: Request) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: { 'content-type': 'application/json' } });
    }
    const body = await req.json().catch(() => ({}));
    const input = body?.input || body?.prompt || '';
    const model = body?.model || 'gpt-5-nano';

    const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY') || Deno.env.get('VITE_OPENAI_API_KEY') || '';
    if (!OPENAI_KEY) {
      return new Response(JSON.stringify({ error: 'Missing OPENAI_API_KEY in environment' }), { status: 500, headers: { 'content-type': 'application/json' } });
    }

    const payload = {
      model,
      input,
      // store flag if provided
      store: !!body?.store,
    };

    const resp = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await resp.json().catch(() => ({}));
    return new Response(JSON.stringify(data), { status: resp.status || 200, headers: { 'content-type': 'application/json' } });
  } catch (err) {
    console.error('openaiResponse error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
});
