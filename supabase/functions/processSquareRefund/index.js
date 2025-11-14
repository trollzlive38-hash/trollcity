const fetch = global.fetch || require('node-fetch');

// Expects env vars: SQUARE_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
module.exports = async (req, res) => {
  try {
    const body = req.body || (await new Promise(r => { let d=''; req.on('data',c=>d+=c); req.on('end',()=>r(JSON.parse(d))); }));
    const { paymentId, amountCents = null, reason = '' } = body;
    const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SQUARE_ACCESS_TOKEN) return res.status(500).json({ error: 'Square not configured' });
    if (!paymentId) return res.status(400).json({ error: 'paymentId required' });

    const refundPayload = {
      idempotency_key: `refund-${Date.now()}-${Math.random().toString(36).slice(2,9)}`,
      payment_id: paymentId,
    };
    if (amountCents) refundPayload.amount_money = { amount: Number(amountCents), currency: 'USD' };

    const squareResp = await fetch('https://connect.squareup.com/v2/refunds', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(refundPayload),
    });

    const data = await squareResp.json();
    if (!squareResp.ok) {
      console.error('Square refund error', data);
      return res.status(500).json({ error: data });
    }

    // Optionally update Supabase record for refund
    try {
      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        // Insert refund record into square_transactions with negative amount or update existing
        await fetch(`${SUPABASE_URL}/rest/v1/square_transactions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Prefer': 'return=representation',
          },
          body: JSON.stringify({
            user_id: null,
            amount_cents: -(amountCents || 0),
            status: 'refunded',
            square_charge_id: paymentId,
            created_at: new Date().toISOString(),
            metadata: { reason }
          })
        }).catch(()=>{});
      }
    } catch (e) {
      console.warn('Failed to log refund to Supabase', e?.message || e);
    }

    return res.status(200).json({ success: true, raw: data });
  } catch (err) {
    console.error('processSquareRefund error', err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
};
