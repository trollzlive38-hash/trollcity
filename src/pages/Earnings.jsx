import React, { useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Gift, Heart, Users, Zap, DollarSign, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { processSquarePayment } from '@/api/square';

const DEFAULT_TIERS = [
  { id: 'bronze', name: 'Bronze', requirement: 1000, coins: '1000', payout: 50, color: 'from-amber-600 to-amber-700' },
  { id: 'silver', name: 'Silver', requirement: 5000, coins: '5,000', payout: 250, color: 'from-gray-400 to-gray-500' },
  { id: 'gold', name: 'Gold', requirement: 20000, coins: '20,000', payout: 1200, color: 'from-yellow-400 to-yellow-600' },
  { id: 'platinum', name: 'Platinum', requirement: 100000, coins: '100,000', payout: 8000, color: 'from-blue-400 to-purple-600' },
];

const EARNING_METHODS = [
  { icon: <Gift className="w-5 h-5" />, title: 'Receive Gifts', desc: 'Viewers send you gifts during streams', earning: '100-500 coins' },
  { icon: <Heart className="w-5 h-5" />, title: 'Get Likes', desc: 'Each like from viewers earns coins', earning: '10-50 coins' },
  { icon: <Users className="w-5 h-5" />, title: 'Followers Bonus', desc: 'Earn coins per follower milestone', earning: '50-200 coins' },
  { icon: <Zap className="w-5 h-5" />, title: 'Streamer Bonus', desc: 'Stream time multiplier bonuses', earning: '500+ coins' },
];

export default function Earnings() {
  const [coins, setCoins] = useState('');
  const [payoutRequested, setPayoutRequested] = useState(false);
  const [sourceId, setSourceId] = useState(''); // Will store Square nonce/token from payment form
    const queryClient = useQueryClient(); // Initialize query client
  const coinsNum = parseInt(coins || '0', 10) || 0;

  // Fetch current user profile
  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      return profile;
    },
  });

  // Fetch earnings config from database
  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ['earningsConfig'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('earnings_config')
        .select('*')
        .eq('id', 1)
        .single();
      if (error) {
        console.warn('Failed to load earnings config, using defaults:', error.message);
        return null;
      }
      return data;
    },
    staleTime: 60000, // Cache for 1 minute
  });

  // Build tiers array from config or defaults
  const TIERS = config ? [
    { id: 'bronze', name: 'Bronze', requirement: config.bronze_tier_requirement, coins: config.bronze_tier_requirement.toLocaleString(), payout: config.bronze_tier_payout, color: 'from-amber-600 to-amber-700' },
    { id: 'silver', name: 'Silver', requirement: config.silver_tier_requirement, coins: config.silver_tier_requirement.toLocaleString(), payout: config.silver_tier_payout, color: 'from-gray-400 to-gray-500' },
    { id: 'gold', name: 'Gold', requirement: config.gold_tier_requirement, coins: config.gold_tier_requirement.toLocaleString(), payout: config.gold_tier_payout, color: 'from-yellow-400 to-yellow-600' },
    { id: 'platinum', name: 'Platinum', requirement: config.platinum_tier_requirement, coins: config.platinum_tier_requirement.toLocaleString(), payout: config.platinum_tier_payout, color: 'from-blue-400 to-purple-600' },
  ] : DEFAULT_TIERS;

  // Calculate transaction fees
  const calculateNetPayout = (grossPayout) => {
    if (!config) return grossPayout;
    const grossCents = Math.round(grossPayout * 100);
    const percentageFee = Math.round((grossCents * config.transaction_fee_percentage) / 100);
    const totalFee = percentageFee + config.transaction_fee_fixed_cents;
    return (grossCents - totalFee) / 100;
  };

  // Safe fee fallbacks when config is missing
  const feePercentage = config?.transaction_fee_percentage ?? 2.9;
  const feeFixedCents = Number.isFinite(config?.transaction_fee_fixed_cents) ? config.transaction_fee_fixed_cents : 30;

  // Compute tier estimates with net payout and unlocked state
  const estimated = TIERS.map((t) => {
    const requirement = Number(t.requirement) || 0;
    const grossPayout = Number(t.payout) || 0;
    const netPayout = calculateNetPayout(grossPayout) ?? grossPayout;
    const meets = coinsNum >= requirement;
    return {
      ...t,
      requirement,
      payout: grossPayout,
      netPayout,
      meets,
    };
  });

  // Determine current unlocked tier (highest unlocked) and next tier to reach
  const unlockedTiers = estimated.filter(t => t.meets);
  const currentTier = unlockedTiers.length > 0 ? unlockedTiers[unlockedTiers.length - 1] : null;
  const nextTier = estimated.find(t => !t.meets) || null;

  // Payout request mutation
  const requestPayoutMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser) throw new Error('Not authenticated');
      if (!currentTier) throw new Error('No eligible tier unlocked');
      if (!sourceId) throw new Error('Payment method required');

      const amountCents = Math.round(currentTier.netPayout * 100);
      
      // Call Square payment processing
      const result = await processSquarePayment({
        amount: amountCents,
        currency: 'USD',
        sourceId,
        description: `TrollCity Payout - ${currentTier.name} Tier`,
        userId: currentUser.id,
        metadata: {
          tier: currentTier.id,
          type: 'broadcaster_payout',
          idempotency_key: `payout-${currentUser.id}-${Date.now()}`,
        },
      });

      if (!result.success) throw new Error('Payment processing failed');

      // Create payout record
      const { error: payoutErr } = await supabase
        .from('payouts')
        .insert({
          user_id: currentUser.id,
          user_name: currentUser.username,
          user_email: currentUser.email,
          coin_amount: coinsNum,
          usd_amount: currentTier.netPayout,
          fee_amount: currentTier.payout - currentTier.netPayout,
          payout_amount: currentTier.netPayout,
          payment_method: 'square',
          payment_details: result.paymentId,
          status: 'completed',
          admin_notes: `Square payment ${result.transactionId}`,
        });

      if (payoutErr) throw payoutErr;
      return result;
    },
    onSuccess: (result) => {
      toast.success(`✅ Payout of $${currentTier.netPayout.toFixed(2)} processed successfully!`);
      queryClient.invalidateQueries(['currentUser']);
      setPayoutRequested(false);
      setSourceId('');
    },
    onError: (err) => {
      toast.error(`❌ Payout failed: ${err?.message || 'Unknown error'}`);
    },
  });

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#09090d] to-[#07060a] py-10 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">💰 Earnings & Payout Tiers</h1>
          <p className="text-gray-400">Track your coins and unlock higher payout tiers</p>
        </div>

        {/* Coin Calculator */}
        <Card className="bg-gradient-to-r from-[#1a1a24] to-[#0f0f14] border-[#2a2a3a] p-6 mb-6">
          <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            Coin Calculator
          </h2>
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1">
              <label className="text-gray-400 text-sm mb-2 block">Enter Your Current Coins</label>
              <Input 
                value={coins} 
                onChange={(e) => setCoins(e.target.value)} 
                placeholder="e.g., 12500" 
                className="bg-[#0a0a0f] border-[#2a2a3a] text-white text-lg"
              />
            </div>
            <Button onClick={() => setCoins('')} variant="outline" className="bg-[#0a0a0f] border-[#2a2a3a] text-white hover:bg-[#1a1a24]">
              Clear
            </Button>
          </div>

          {/* Tier Status */}
          {coins && (
            <div className="mt-6 p-4 bg-[#0a0a0f] rounded-lg border border-[#2a2a3a]">
              {currentTier ? (
                <>
                  <p className="text-gray-300 mb-2">
                    ✅ You've unlocked <span className="font-bold text-green-400">{currentTier.name}</span> tier!
                  </p>
                  <p className="text-sm text-gray-500">
                    Gross payout: <span className="text-yellow-400 font-semibold">${currentTier.payout.toFixed(2)}</span>
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    After fees ({(config?.transaction_fee_percentage || 2.9).toFixed(2)}% + ${((config?.transaction_fee_fixed_cents || 30) / 100).toFixed(2)}): <span className="text-emerald-300 font-semibold">${currentTier.netPayout.toFixed(2)}</span>
                  </p>
                </>
              ) : nextTier ? (
                <>
                  <p className="text-gray-300 mb-2">
                    Next tier: <span className="font-bold text-cyan-400">{nextTier.name}</span>
                  </p>
                  <p className="text-sm text-gray-500">
                    Earn <span className="text-emerald-400 font-semibold">{(nextTier.requirement - coinsNum).toLocaleString()}</span> more coins to unlock ${nextTier.payout.toFixed(2)} payout
                  </p>
                </>
              ) : null}
            </div>
          )}
        </Card>

        {/* Payout Request Section */}
        {currentTier && (
          <Card className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border-purple-500/30 p-6 mb-6">
            <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-400" />
              Request Payout
            </h2>
            {!payoutRequested ? (
              <Button
                onClick={() => setPayoutRequested(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Request ${currentTier.netPayout.toFixed(2)} Payout
              </Button>
            ) : (
              <div className="space-y-4">
                <div className="bg-[#0a0a0f] p-4 rounded-lg border border-[#2a2a3a]">
                  <label className="text-gray-300 text-sm block mb-2">Square Payment Token (from Web Payments SDK)</label>
                  <Input
                    type="text"
                    value={sourceId}
                    onChange={(e) => setSourceId(e.target.value)}
                    placeholder="Enter tokenized payment method"
                    className="bg-[#0f0f16] border-[#2a2a3a] text-white text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    💡 In production, integrate Square Web Payments SDK to generate this token securely.
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button
                    onClick={() => setPayoutRequested(false)}
                    variant="outline"
                    className="border-[#2a2a3a] text-gray-300 hover:bg-[#1a1a24] flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => requestPayoutMutation.mutate()}
                    disabled={!sourceId || requestPayoutMutation.isPending}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white flex-1"
                  >
                    {requestPayoutMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <DollarSign className="w-4 h-4 mr-2" />
                        Process Payment
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Payout Tiers Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {estimated.map(t => (
            <Card key={t.id} className={`border-2 bg-gradient-to-br ${t.meets ? `border-green-500 ${t.color}` : 'border-[#2a2a3a] from-[#1a1a24] to-[#0f0f14]'} p-6 transition-all ${t.meets ? 'shadow-lg shadow-green-500/20' : 'opacity-70'}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className={`font-bold text-lg ${t.meets ? 'text-white' : 'text-gray-300'}`}>{t.name}</h3>
                {t.meets && <Badge className="bg-green-500 text-white">✓ Unlocked</Badge>}
              </div>
              
              <div className="mb-4 p-3 bg-black/30 rounded">
                <p className="text-xs text-gray-400 mb-1">Requirement</p>
                <p className={`text-xl font-bold ${t.meets ? 'text-green-400' : 'text-gray-300'}`}>{t.coins}</p>
              </div>

              <div className="mb-4 p-3 bg-black/30 rounded">
                <p className="text-xs text-gray-400 mb-1">Gross Payout</p>
                <p className="text-2xl font-bold text-yellow-400">${t.payout.toFixed(2)}</p>
              </div>

              <div className="mb-4 p-3 bg-black/20 rounded border border-purple-500/20">
                <p className="text-xs text-gray-400 mb-1">After Fees</p>
                <p className="text-lg font-bold text-emerald-300">${t.netPayout.toFixed(2)}</p>
                <p className="text-xs text-gray-500 mt-1">Fee: ${(t.payout - t.netPayout).toFixed(2)}</p>
              </div>

              {t.meets ? (
                <p className="text-green-300 text-xs font-semibold">You qualify for this tier</p>
              ) : (
                <p className="text-gray-400 text-xs">Need {t.coins} coins</p>
              )}
            </Card>
          ))}
        </div>

        {/* How to Earn Coins */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">📈 How to Earn Coins</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {EARNING_METHODS.map((method, idx) => (
              <Card key={idx} className="bg-[#0f1014] border-[#2a2a3a] p-5 hover:border-cyan-500 transition-colors">
                <div className="text-cyan-400 mb-3">{method.icon}</div>
                <h3 className="text-white font-semibold mb-2">{method.title}</h3>
                <p className="text-gray-400 text-sm mb-3">{method.desc}</p>
                <p className="text-emerald-400 font-bold text-sm">{method.earning}</p>
              </Card>
            ))}
          </div>
        </div>

        {/* Earnings Examples */}
        <Card className="bg-[#0f1014] border-[#2a2a3a] p-6 mb-6">
          <h3 className="text-white font-semibold mb-4">💡 Earnings Example</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between p-3 bg-[#0a0a0f] rounded">
              <span className="text-gray-400">Stream for 2 hours</span>
              <span className="text-emerald-400 font-semibold">+500 coins</span>
            </div>
            <div className="flex justify-between p-3 bg-[#0a0a0f] rounded">
              <span className="text-gray-400">Receive 10 gifts from viewers</span>
              <span className="text-emerald-400 font-semibold">+2,500 coins</span>
            </div>
            <div className="flex justify-between p-3 bg-[#0a0a0f] rounded">
              <span className="text-gray-400">Get 200 likes during stream</span>
              <span className="text-emerald-400 font-semibold">+400 coins</span>
            </div>
            <div className="flex justify-between p-3 bg-[#1a1a24] rounded border border-emerald-500/30">
              <span className="text-emerald-400 font-semibold">Total from one stream</span>
              <span className="text-emerald-400 font-bold">+3,400 coins</span>
            </div>
          </div>
        </Card>

        {/* Payout Information */}
        <Card className="bg-[#0f1014] border-[#2a2a3a] p-6">
          <h3 className="text-white font-semibold mb-4">💰 Payout Information</h3>
          <ul className="text-gray-400 text-sm space-y-3">
            <li className="flex gap-2">
              <span className="text-emerald-400">✓</span>
              <span>Payout amounts are estimates and subject to platform fees.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-400">✓</span>
              <span>Minimum payout is $50 (Bronze tier)</span>
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-400">✓</span>
              <span>Payout eligibility may depend on account standing and verification.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-cyan-400">📱</span>
              <span className="font-semibold text-emerald-400">All payouts are processed via CashApp only. <a href="/profile" className="text-cyan-300 hover:underline">Set up your CashApp</a> in your profile (format: $25.00 or $CashAppTag).</span>
            </li>
            <li className="flex gap-2">
              <span className="text-yellow-400">⏱️</span>
              <span>Payouts are processed within 5-7 business days after approval.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-blue-400">❓</span>
              <span>Contact the admin team for questions about earnings and payouts.</span>
            </li>
          </ul>
        </Card>
      </div>
    </main>
  );
}
