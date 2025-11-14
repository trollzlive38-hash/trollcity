import { supabase } from "@/api/supabaseClient";

// Centralized coin operations: credit and debit.
// Each operation inserts a row into `coin_transactions` and updates the `profiles` row.

export async function creditCoins(userId, amount, opts = {}) {
  if (!userId) throw new Error("creditCoins: missing userId");
  amount = Number(amount) || 0;
  if (amount <= 0) throw new Error("creditCoins: amount must be > 0");

  const now = new Date().toISOString();

  // Insert transaction record
  const txPayload = {
    user_id: userId,
    amount: amount,
    type: 'credit',
    reason: opts.reason || opts.source || 'credit',
    source: opts.source || null,
    reference_id: opts.reference || null,
    created_date: now,
  };

  const { error: txErr } = await supabase.from('coin_transactions').insert(txPayload);
  if (txErr) {
    console.warn('creditCoins: failed to insert transaction', txErr.message || txErr);
    throw txErr;
  }

  // Update profile balances
  const { data: profileData, error: pErr } = await supabase
    .from('profiles')
    .select('coins, purchased_coins')
    .eq('id', userId)
    .single();
  if (pErr) {
    console.warn('creditCoins: failed to fetch profile', pErr.message || pErr);
    throw pErr;
  }

  const newCoins = (profileData?.coins || 0) + amount;
  const newPurchased = (profileData?.purchased_coins || 0) + amount;

  const { error: updErr } = await supabase
    .from('profiles')
    .update({ coins: newCoins, purchased_coins: newPurchased, updated_date: now })
    .eq('id', userId);
  if (updErr) {
    console.warn('creditCoins: failed to update profile', updErr.message || updErr);
    throw updErr;
  }

  return { userId, newCoins, newPurchased };
}

export async function debitCoins(userId, amount, opts = {}) {
  if (!userId) throw new Error("debitCoins: missing userId");
  amount = Number(amount) || 0;
  if (amount <= 0) throw new Error("debitCoins: amount must be > 0");

  const now = new Date().toISOString();

  const { data: profileData, error: pErr } = await supabase
    .from('profiles')
    .select('coins, free_coins, purchased_coins')
    .eq('id', userId)
    .single();
  if (pErr) {
    console.warn('debitCoins: failed to fetch profile', pErr.message || pErr);
    throw pErr;
  }

  const available = (profileData?.coins || 0);
  if (available < amount) throw new Error('Insufficient coins');

  // Insert transaction record
  const txPayload = {
    user_id: userId,
    amount: amount,
    type: 'debit',
    reason: opts.reason || opts.source || 'debit',
    source: opts.source || null,
    reference_id: opts.reference || null,
    created_date: now,
  };

  const { error: txErr } = await supabase.from('coin_transactions').insert(txPayload);
  if (txErr) {
    console.warn('debitCoins: failed to insert transaction', txErr.message || txErr);
    throw txErr;
  }

  const newCoins = (profileData?.coins || 0) - amount;
  const newPurchased = (profileData?.purchased_coins || 0) - Math.min(profileData?.purchased_coins || 0, amount);

  const { error: updErr } = await supabase
    .from('profiles')
    .update({ coins: newCoins, purchased_coins: newPurchased, updated_date: now })
    .eq('id', userId);
  if (updErr) {
    console.warn('debitCoins: failed to update profile', updErr.message || updErr);
    throw updErr;
  }

  return { userId, newCoins, newPurchased };
}

export default { creditCoins, debitCoins };
