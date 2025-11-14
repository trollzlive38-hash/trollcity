const fetch = global.fetch || require('node-fetch');

// This Edge Function expects env vars:
// - SQUARE_ACCESS_TOKEN
// - SQUARE_LOCATION_ID
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY

module.exports = async (req, res) => {
  try {
    const body = req.body || (await new Promise(r => { let d=''; req.on('data',c=>d+=c); req.on('end',()=>r(JSON.parse(d))); }));

    const {
      amount, // cents
      currency = 'USD',
      sourceId,
      description,
      userId,
      metadata = {},
      idempotency_key,
    } = body;

    const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
    const SQUARE_LOCATION_ID = process.env.SQUARE_LOCATION_ID;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SQUARE_ACCESS_TOKEN || !SQUARE_LOCATION_ID) {
      return res.status(500).json({ error: 'Square not configured' });
    }

    if (!amount || !sourceId) {
      return res.status(400).json({ error: 'Missing payment information' });
    }

    const idemp = idempotency_key || `sq-${Date.now()}-${Math.random().toString(36).slice(2,9)}`;

    // Build Square payments request
    const paymentPayload = {
      idempotency_key: idemp,
      amount_money: { amount: Number(amount), currency },
      source_id: sourceId,
      location_id: SQUARE_LOCATION_ID,
      note: description || 'TrollCity payment',
    };

    const squareResp = await fetch('https://connect.squareup.com/v2/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
        'Accept': 'application/json',
      },
      body: JSON.stringify(paymentPayload),
    });

    const squareData = await squareResp.json();
    if (!squareResp.ok) {
      console.error('Square API error', squareData);
      return res.status(500).json({ error: squareData });
    }

    const payment = squareData.payment;

    // Compute fees (Square may return processing fee info in payment.processing_fee)
    let feeAmount = 0;
    if (payment.processing_fee && Array.isArray(payment.processing_fee)) {
      feeAmount = payment.processing_fee.reduce((sum, f) => sum + (f.amount_money?.amount || 0), 0);
    }

    const netAmount = (payment.amount_money?.amount || 0) - feeAmount;

    // Optional: record transaction to Supabase using service role
    try {
      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        const insertResp = await fetch(`${SUPABASE_URL}/rest/v1/square_transactions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({
            user_id: userId || null,
            amount_cents: payment.amount_money?.amount || amount,
            status: payment.status || 'COMPLETED',
            square_charge_id: payment.id,
            square_idempotency_key: idemp,
            fee_cents: feeAmount,
            net_payout_cents: netAmount,
            currency: payment.amount_money?.currency || currency,
            created_at: new Date().toISOString(),
            metadata: metadata || {}
          })
        });
        // ignore result - just log in function
        if (!insertResp.ok) {
          const errBody = await insertResp.text();
          console.warn('Failed to write square_transactions row:', errBody);
        }
      }
    } catch (e) {
      console.warn('Supabase logging failed:', e?.message || e);
    }

    return res.status(200).json({
      transactionId: payment.id,
      paymentId: payment.id,
      amount: payment.amount_money?.amount,
      currency: payment.amount_money?.currency,
      feeAmount,
      netAmount,
      receiptUrl: payment.receipt_url || null,
      raw: payment,
    });
  } catch (error) {
    console.error('processSquarePayment function error:', error);
    return res.status(500).json({ error: String(error?.message || error) });
  }
};
