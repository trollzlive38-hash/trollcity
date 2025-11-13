
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { createStripeCheckout, confirmStripePayment, testStripeConnection, getFunctionsUrl, isFunctionsHostReachable } from "@/api/stripe";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Coins,
  ShoppingCart,
  Sparkles,
  Gift,
  CreditCard,
  Loader2,
  DollarSign,
  CheckCircle,
  XCircle,
  X,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/utils";
import { createPageUrl } from "@/utils";

// Shared rarity color mapping for both StorePage and RandomEntranceOffers
const rarityColors = {
  common: "from-gray-500 to-slate-500",
  rare: "from-blue-500 to-cyan-500",
  epic: "from-purple-500 to-pink-500",
  legendary: "from-yellow-500 to-orange-500",
};

export default function StorePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("coins");
  const [customAmount, setCustomAmount] = useState("");
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [testResults, setTestResults] = useState(null);
  const [isTesting, setIsTesting] = useState(false);

  // Detect if Supabase Functions are available in this environment
  const supabaseConfigError = typeof window !== 'undefined' ? !!window.__SUPABASE_CONFIG_ERROR__ : false;
  const functionsBase = getFunctionsUrl();
  const functionsEnabled = !!functionsBase && !supabaseConfigError;

  // FIXED: Enhanced payment return handling with Stripe confirmation
  useEffect(() => {
    const handlePaymentReturn = async () => {
      if (isProcessingPayment) return;
      
      const urlParams = new URLSearchParams(window.location.search);
      const paymentStatus = urlParams.get("payment");
      const sessionId = urlParams.get("session_id");
      const coinAmount = urlParams.get("coinAmount");
      const userId = urlParams.get("userId");

      console.log("🔍 [Store] URL params:", { paymentStatus, sessionId, coinAmount, userId });

      if (paymentStatus === "stripe_success" && sessionId) {
        setIsProcessingPayment(true);
        
        try {
          toast.loading("🎯 Confirming your Stripe payment and crediting coins...", { id: "payment-capture" });

          console.log("📞 [Store] Calling confirmStripePayment with session_id:", sessionId);
          const result = await confirmStripePayment({ session_id: sessionId });

          console.log("✅ [Store] Stripe confirmation response:", result);

          if (result?.success || result?.alreadyProcessed) {
            // Force refresh all relevant queries
            await Promise.all([
              queryClient.invalidateQueries(["currentUser"]),
              queryClient.invalidateQueries(["coinPurchases"]),
              queryClient.invalidateQueries(["adminAllCoinPurchases"]),
              queryClient.invalidateQueries(["adminAllUsers"]),
            ]);

            // Wait for data to propagate
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Force refetch user data
            await queryClient.refetchQueries(["currentUser"]);

            const coinsAdded = result?.coinAmount || parseInt(coinAmount) || 0;
            
            toast.success(
              `🎉 Payment successful! ${coinsAdded.toLocaleString()} Troll Coins added to your account!`,
              { id: "payment-capture", duration: 6000 }
            );
            
            setActiveTab("history");
          } else {
            throw new Error(result?.error || "Stripe payment confirmation failed");
          }
        } catch (error) {
          console.error("❌ [Store] Stripe confirmation error:", error);
          toast.error(
            `⚠️ Stripe processing issue: ${error.message}. Your coins may take a moment to appear. Please refresh the page or check your purchase history.`,
            { id: "payment-capture", duration: 10000 }
          );
        } finally {
          setIsProcessingPayment(false);
          // Clean up URL
          const newUrl = window.location.origin + window.location.pathname + window.location.hash.split('?')[0];
          window.history.replaceState({}, "", newUrl);
        }
      } else if (paymentStatus === "stripe_cancel") {
        toast.info("❌ Stripe checkout cancelled - no charges made");
        // Clean up URL
        const newUrl = window.location.origin + window.location.pathname + window.location.hash.split('?')[0];
        window.history.replaceState({}, "", newUrl);
      }
    };
    
    handlePaymentReturn();
  }, [queryClient, isProcessingPayment]);

  const { data: user } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => supabase.auth.me(),
    refetchInterval: 2000,
  });

  const { data: gifts = [] } = useQuery({
    queryKey: ["gifts"],
    queryFn: async () => {
      const { data, error } = await supabase.from('gifts').select('*');
      if (error) { console.warn('Failed to fetch gifts:', error.message); return []; }
      return data || [];
    },
    initialData: [],
  });

  const { data: entranceEffects = [] } = useQuery({
    queryKey: ["entranceEffects"],
    queryFn: async () => {
      const { data, error } = await supabase.from('entrance_effects').select('*');
      if (error) { console.warn('Failed to fetch entrance effects:', error.message); return []; }
      return data || [];
    },
    initialData: [],
  });

  const { data: userEffects = [] } = useQuery({
    queryKey: ["userEffects", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_entrance_effects')
        .select('*')
        .eq('user_id', user.id);
      if (error) { console.warn('Failed to fetch user entrance effects:', error.message); return []; }
      return data || [];
    },
    initialData: [],
    enabled: !!user?.id,
  });

  const { data: purchaseHistory = [] } = useQuery({
    queryKey: ["coinPurchases", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('coin_purchases')
        .select('*')
        .eq('user_id', user.id)
        .order('created_date', { ascending: false })
        .limit(50);
      if (error) { console.warn('Failed to fetch coin purchases:', error.message); return []; }
      return data || [];
    },
    enabled: !!user?.id,
    initialData: [],
    refetchInterval: 1000,
  });

  // Stripe server connectivity test (admin-only helper)
  const testStripe = async () => {
    setIsTesting(true);
    setTestResults(null);
    try {
      const data = await testStripeConnection();
      setTestResults(data);
      toast.success('Stripe test completed!');
    } catch (error) {
      toast.error('Stripe test failed: ' + (error?.message || 'Unknown error'));
      setTestResults({
        overallStatus: '❌ ERROR',
        error: error?.message || 'Unknown error',
        tests: []
      });
    } finally {
      setIsTesting(false);
    }
  };

  const purchaseEffectMutation = useMutation({
    mutationFn: async (effect) => {
      const coinCost = effect.coin_price;
      const currentUser = await supabase.auth.me();
      if ((currentUser.coins || 0) < coinCost) {
        throw new Error("Not enough coins.");
      }
      const freeCoinsUsed = Math.min(currentUser.free_coins || 0, coinCost);
      const purchasedCoinsUsed = coinCost - freeCoinsUsed;
      await supabase.auth.updateMe({
        coins: (currentUser.coins || 0) - coinCost,
        free_coins: (currentUser.free_coins || 0) - freeCoinsUsed,
        purchased_coins: (currentUser.purchased_coins || 0) - purchasedCoinsUsed,
      });
      const { error } = await supabase
        .from('user_entrance_effects')
        .insert({
          user_id: currentUser.id,
          user_name: currentUser.full_name,
          effect_id: effect.id,
          effect_name: effect.name,
          animation_type: effect.animation_type,
          purchased_price: effect.coin_price,
          is_active: false,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["currentUser"]);
      queryClient.invalidateQueries(["userEffects"]);
      toast.success("Entrance effect purchased!");
    },
    onError: (error) => {
      toast.error(error.message || "Purchase failed");
    },
  });

  const purchaseCoinsMutation = useMutation({
    mutationFn: async ({ amount, coinAmount }) => {
      if (!user?.id) {
        throw new Error("User not logged in");
      }

      console.log("🛒 [Store] Initiating Stripe purchase:", { amount, coinAmount, userId: user.id });

      // Preflight: ensure Supabase Functions are configured and reachable
      const functionsUrl = getFunctionsUrl();
      const urlOk = !!functionsUrl;
      const keyOk = !!import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!urlOk || !keyOk || (typeof window !== 'undefined' && window.__SUPABASE_CONFIG_ERROR__)) {
        throw new Error("Payments are temporarily unavailable: Supabase Functions not configured.");
      }
      const reachable = await isFunctionsHostReachable(1500);
      if (!reachable) {
        throw new Error("Payments are temporarily unavailable: Supabase Functions host unreachable.");
      }
      try {
        // Quick connectivity check to avoid net::ERR_FAILED during checkout creation
        await testStripeConnection();
      } catch (e) {
        const reason = e?.message || String(e);
        throw new Error(`Payments are temporarily unavailable: ${reason}`);
      }

      const returnUrl = `${window.location.origin}${window.location.pathname}?payment=stripe_success&coinAmount=${parseInt(coinAmount)}&userId=${user.id}`;
      const cancelUrl = `${window.location.origin}${window.location.pathname}?payment=stripe_cancel`;

      const session = await createStripeCheckout({
        amount: parseFloat(amount).toFixed(2),
        currency: 'USD',
        return_url: returnUrl,
        cancel_url: cancelUrl,
        user_id: user.id,
        coin_amount: parseInt(coinAmount),
      });

      if (!session?.url) {
        console.error('❌ [Store] Stripe response missing checkout URL:', session);
        throw new Error("Payment initialization failed: no Stripe checkout URL returned.");
      }

      return { url: session.url };
    },
    onSuccess: ({ url }) => {
      console.log("✅ [Store] Stripe session created, redirecting to:", url);
      toast.success("Redirecting to Stripe checkout...", { duration: 2000 });
      setTimeout(() => {
        window.location.href = url;
      }, 500);
    },
    onError: (error) => {
      console.error('❌ [Store] Stripe mutation error:', error);
      toast.dismiss("payment-checkout");
      
      let errorMsg = "Payment setup failed: ";
      if (error?.message) {
        errorMsg += error.message;
      } else {
        errorMsg += "Unknown error. Please try again.";
      }
      toast.error(errorMsg, { duration: 8000 });
    }
  });

  const calculateCoinsForAmount = (amount) => {
    if (amount >= 279.99) return 39900;
    if (amount >= 139.99) return 19700;
    if (amount >= 49.99) return 6850;
    if (amount >= 19.99) return 3140;
    if (amount >= 12.99) return 1370;
    if (amount >= 6.49) return 500;
    return Math.floor(amount * 77);
  };

  const coinPackages = [
    { id: 1, coins: 500, price: 6.49, popular: false, emoji: "🪙", bonus: 0 },
    { id: 2, coins: 1370, price: 12.99, popular: true, emoji: "💰", bonus: 70 },
    { id: 3, coins: 3140, price: 19.99, popular: false, emoji: "💎", bonus: 140 },
    { id: 4, coins: 6850, price: 49.99, popular: false, emoji: "🏆", bonus: 850 },
    { id: 5, coins: 19700, price: 139.99, popular: false, emoji: "👑", bonus: 5700 },
    { id: 6, coins: 39900, price: 279.99, popular: false, emoji: "💸", bonus: 11900 },
  ];

  const handlePurchaseEffect = (effect) => {
    const owned = userEffects.some((e) => e.effect_id === effect.id);
    if (owned) {
      toast.error("You already own this effect");
      return;
    }
    purchaseEffectMutation.mutate(effect);
  };

  const handlePurchaseCoins = (pkg) => {
    if (!user) {
      toast.error("Please login to purchase coins");
      return;
    }
    setSelectedPackage(pkg);
    setShowPaymentDialog(true);
  };

  const confirmPurchase = () => {
    console.log("🔵 [Store] confirmPurchase called");
    console.log("📦 [Store] Selected package:", selectedPackage);
    console.log("👤 [Store] User:", user);
    
    if (!selectedPackage) {
      console.error("❌ [Store] No package selected");
      toast.error("No package selected");
      return;
    }
    
    if (!user) {
      console.error("❌ [Store] User not logged in");
      toast.error("Please login to purchase");
      return;
    }
    
    const totalCoins = selectedPackage.coins + (selectedPackage.bonus || 0);
    const amount = selectedPackage.price.toFixed(2);

    console.log("💰 [Store] Purchase details:", { 
      amount, 
      coinAmount: totalCoins,
      userId: user.id,
      userEmail: user.email
    });

    toast.loading("Setting up Stripe checkout...", { id: "payment-checkout" });
    
    try {
      if (!functionsEnabled) {
        throw new Error("Checkout unavailable: Supabase Functions not configured");
      }
      purchaseCoinsMutation.mutate({
        amount: amount,
        coinAmount: totalCoins
      });
      
      setShowPaymentDialog(false);
      console.log("✅ [Store] Mutation triggered successfully");
    } catch (error) {
      console.error("❌ [Store] Error triggering mutation:", error);
      toast.error("Failed to start payment: " + error.message);
    }
  };

  const handleCustomPurchase = () => {
    const amount = parseFloat(customAmount);
    if (isNaN(amount) || amount < 1.00) {
      toast.error("Minimum purchase is $1.00");
      return;
    }
    const totalCoins = calculateCoinsForAmount(amount);
    setSelectedPackage({ coins: totalCoins, bonus: 0, price: amount, emoji: "💰" });
    setShowPaymentDialog(true);
  };

  const getCustomTotal = () => {
    const amount = parseFloat(customAmount);
    return isNaN(amount) ? 0 : calculateCoinsForAmount(amount);
  };

  const getCoinsPerDollar = () => {
    const amount = parseFloat(customAmount);
    if (isNaN(amount) || amount === 0) return 0;
    return Math.floor(calculateCoinsForAmount(amount) / amount);
  };

  // rarityColors moved to module scope for shared usage

  return (
    <div className="min-h-screen bg-[#0a0a0f] p-6 md:p-8">
      <style>{`.neon-troll { color: #00ff88; text-shadow: 0 0 10px #00ff88, 0 0 20px #00ff88; }`}</style>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <ShoppingCart className="w-10 h-10 text-yellow-400" />
            <div>
              <h1 className="text-4xl font-bold">
                <span className="neon-troll">Troll</span> <span className="text-yellow-400">Store</span>
              </h1>
              <p className="text-sm text-gray-400 mt-1">
                💰 Purchased Troll Coins have REAL VALUE and can be cashed out by streamers
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <Card className="bg-[#1a1a24] border-[#2a2a3a] px-6 py-3">
                <div className="flex items-center gap-3">
                  <Coins className="w-6 h-6 text-yellow-400" />
                  <div>
                    <p className="text-xs text-gray-400">Total Balance</p>
                    <p className="text-xl font-bold text-yellow-400">
                      {(user.coins || 0).toLocaleString()}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs">
                      <span className="text-green-400 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> {(user.purchased_coins || 0).toLocaleString()} Troll
                      </span>
                      <span className="text-red-400 flex items-center gap-1">
                        <XCircle className="w-3 h-3" /> {(user.free_coins || 0).toLocaleString()} Free
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            )}
            {user?.role === 'admin' && (
              <Button
                onClick={() => setShowTestDialog(true)}
                variant="outline"
                className="border-blue-500 text-blue-400 hover:bg-blue-500/10"
              >
                <AlertCircle className="w-4 h-4 mr-2" />
                Test Stripe
              </Button>
            )}
          </div>
        </div>

        {/* Payment Banner */}
        <Card className="bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border-blue-500 p-4 mb-6">
          <div className="flex items-center gap-3">
            <CreditCard className="w-5 h-5 text-blue-400 flex-shrink-0" />
            <div>
              <h3 className="text-base font-bold text-white">💳 Secure Payment via Stripe</h3>
              <p className="text-sm text-blue-200">
                All payments processed securely through Stripe — Credit/Debit cards accepted
              </p>
            </div>
          </div>
        </Card>

        {/* Balance Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border-yellow-500/50 p-6">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-gray-400 text-sm">Total Balance</p>
                <p className="text-3xl font-bold text-yellow-400">
                  {(user?.coins || 0).toLocaleString()}
                </p>
              </div>
              <Coins className="w-12 h-12 text-yellow-400/50" />
            </div>
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-2 mt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-300">Total Value:</span>
                <span className="text-lg font-bold text-green-400">
                  ${((user?.coins || 0) * 0.00625).toFixed(2)}
                </span>
              </div>
            </div>
          </Card>
          <Card className="bg-gradient-to-br from-green-500/20 to-emerald-500/20 border-green-500/50 p-6">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-gray-400 text-sm">Troll Coins</p>
                <p className="text-3xl font-bold text-green-400">
                  {(user?.purchased_coins || 0).toLocaleString()}
                </p>
              </div>
              <div className="text-2xl">✓</div>
            </div>
            <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-2 mt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-300">Value:</span>
                <span className="text-lg font-bold text-purple-400">
                  ${((user?.purchased_coins || 0) * 0.00625).toFixed(2)}
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">Real value • Can spend</p>
          </Card>
          <Card className="bg-gradient-to-br from-red-500/20 to-pink-500/20 border-red-500/50 p-6">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-gray-400 text-sm">Free Coins</p>
                <p className="text-3xl font-bold text-red-400">
                  {(user?.free_coins || 0).toLocaleString()}
                </p>
              </div>
              <X className="w-12 h-12 text-red-400/50" />
            </div>
            <div className="bg-gray-500/10 border border-gray-500/30 rounded-lg p-2 mt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-300">Value:</span>
                <span className="text-lg font-bold text-gray-400">$0.00</span>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">No cash value • Can spend</p>
          </Card>
        </div>

        {/* Tabs */}
        <div className="mb-6">
          <div className="flex gap-2 bg-[#1a1a24] border border-[#2a2a3a] rounded-lg p-1 w-fit">
            <button
              onClick={() => setActiveTab("coins")}
              className={`px-6 py-2 rounded-md font-semibold transition-colors ${
                activeTab === "coins" ? "bg-purple-500 text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              Coins & Gifts
            </button>
            <button
              onClick={() => setActiveTab("effects")}
              className={`px-6 py-2 rounded-md font-semibold transition-colors ${
                activeTab === "effects" ? "bg-purple-500 text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              Entrance Effects
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`px-6 py-2 rounded-md font-semibold transition-colors ${
                activeTab === "history" ? "bg-purple-500 text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              Purchase History
            </button>
          </div>
        </div>

        {/* Coins Tab */}
        {activeTab === "coins" && (
          <div className="space-y-8">
            {/* Coin Packages */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-yellow-400" />
                Troll Coin Packages
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {coinPackages.map((pkg) => {
                  const totalCoins = pkg.coins + pkg.bonus;
                  return (
                    <motion.div
                      key={pkg.id}
                      whileHover={{ scale: 1.05, y: -5 }}
                      transition={{ type: "spring", stiffness: 300 }}
                    >
                      <Card
                        className={`relative overflow-hidden cursor-pointer transition-all duration-300 ${
                          pkg.popular
                            ? "bg-gradient-to-br from-purple-900/50 to-pink-900/50 border-2 border-purple-500 shadow-xl shadow-purple-500/30"
                            : "bg-[#1a1a24] border-[#2a2a3a] hover:border-purple-500/50"
                        }`}
                      >
                        {pkg.popular && (
                          <div className="absolute top-0 right-0 bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-1 text-xs font-bold rounded-bl-lg">
                            MOST POPULAR
                          </div>
                        )}
                        <div className="p-6">
                          <div className="text-center mb-4">
                            <div className="text-6xl mb-3">{pkg.emoji}</div>
                            <div className="text-4xl font-bold text-yellow-400 mb-2 flex items-center justify-center gap-2">
                              <Coins className="w-8 h-8" /> {totalCoins.toLocaleString()}
                            </div>
                            {pkg.bonus > 0 && (
                              <div className="inline-block bg-gradient-to-r from-green-500 to-emerald-500 text-white px-3 py-1 rounded-full text-sm font-bold">
                                +{pkg.bonus} BONUS
                              </div>
                            )}
                            <div className="text-2xl font-bold text-white mt-2">
                              ${pkg.price.toFixed(2)}
                            </div>
                            <p className="text-xs text-gray-400 mt-1">
                              {Math.floor(totalCoins / pkg.price)} Troll Coins per $1
                            </p>
                            <Button
                              onClick={() => handlePurchaseCoins(pkg)}
                              className={`w-full mt-4 ${
                                pkg.popular
                                  ? "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                                  : "bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700"
                              }`}
                            >
                              <ShoppingCart className="w-4 h-4 mr-2" />
                              Purchase Now
                            </Button>
                          </div>
                        </div>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Custom Amount */}
            <Card className="bg-[#1a1a24] border-[#2a2a3a] p-8">
              <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                <DollarSign className="w-6 h-6 text-green-400" />
                Custom Amount - Buy Any Amount You Want!
              </h2>
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-6">
                <p className="text-blue-300 text-sm">
                  💰 <strong>No minimum or maximum!</strong> Buy exactly the amount you need, from $1.00 to any amount you want.
                </p>
              </div>

              {/* Test Payment Section */}
              <div className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 border-2 border-purple-500 rounded-lg p-6 mb-6">
                <div className="flex items-start gap-4">
                  <AlertCircle className="w-8 h-8 text-purple-400 flex-shrink-0 mt-1" />
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-white mb-3">🧪 Test Payment System ($0.01)</h3>
                    <p className="text-purple-200 text-sm mb-4">
                      Test our payment system with a $0.01 transaction. This will be automatically refunded to your account within 24 hours.
                    </p>
                    <div className="bg-purple-900/30 rounded-lg p-4 mb-4">
                      <div className="space-y-2 text-sm">
                        <p className="text-purple-300">
                          <strong>What you get:</strong> 1 Troll Coin (0.13 coins per $1)
                        </p>
                        <p className="text-purple-300">
                          <strong>Cost:</strong> $0.01
                        </p>
                        <p className="text-green-400">
                          <strong>Refund:</strong> Full $0.01 refunded within 24 hours
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={() => {
                        setSelectedPackage({
                          coins: 1,
                          bonus: 0,
                          price: 0.01,
                          emoji: "🧪",
                          isTest: true
                        });
                        setShowPaymentDialog(true);
                      }}
                      className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                    >
                      <CreditCard className="w-5 h-5 mr-2" />
                      Test Payment - $0.01 (Refunded)
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-gray-400 mb-2 block">Enter Amount (USD)</label>
                  <Input
                    type="number"
                    placeholder="1.00"
                    min="1.00"
                    step="0.01"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    className="bg-[#0a0a0f] border-[#2a2a3a] text-white text-2xl py-6"
                  />
                  <p className="text-xs text-gray-500 mt-2">Minimum $1.00 - no maximum limit!</p>
                </div>
                
                <Card className="bg-[#0a0a0f] border-[#2a2a3a] p-6">
                  <h3 className="text-lg font-bold text-white mb-4">You'll Receive:</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between text-yellow-400 text-2xl">
                      <span className="font-bold">Total:</span>
                      <span className="font-bold flex items-center gap-2">
                        <Coins className="w-6 h-6" />
                        {getCustomTotal().toLocaleString()}
                      </span>
                    </div>
                    <div className="text-center text-sm text-gray-400">
                      {getCoinsPerDollar()} Troll Coins per $1
                    </div>
                  </div>
                  
                  <div className="mt-6 bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                    <p className="text-green-300 text-sm font-bold mb-2">✅ These are PAID Troll Coins</p>
                    <p className="text-green-200 text-xs">
                      • Have real cash value ($0.00625 per coin)
                    </p>
                    <p className="text-green-200 text-xs">
                      • Can be used for EVERYTHING (gifts, messages, etc)
                    </p>
                    <p className="text-green-200 text-xs">
                      • Streamers can cash them out for real money
                    </p>
                  </div>

                  <Button
                    onClick={handleCustomPurchase}
                    disabled={!customAmount || parseFloat(customAmount) < 1.00}
                    className="w-full mt-6 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 py-6 text-lg font-bold"
                  >
                    <CreditCard className="w-5 h-5 mr-2" />
                    Purchase {getCustomTotal().toLocaleString()} Troll Coins
                  </Button>
                </Card>
              </div>
            </Card>

            {/* Gifts Preview */}
            <div>
              <h2 className="text-2xl font-bold text-white mb-4">Available Gifts</h2>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
                {gifts.slice(0, 12).map((gift) => (
                  <Card key={gift.id} className="bg-[#1a1a24] border-[#2a2a3a] p-4 text-center">
                    <div className="text-4xl mb-2">{gift.emoji}</div>
                    <p className="text-white text-sm font-semibold">{gift.name}</p>
                    <div className="flex items-center justify-center gap-1 mt-1">
                      <Coins className="w-3 h-3 text-yellow-400" />
                      <span className="text-yellow-400 text-xs">{gift.coin_value}</span>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Effects Tab */}
        {activeTab === "effects" && (
          <div>
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-purple-400" />
              Entrance Effects
            </h2>
            {/* Random Entrance Offers */}
            <RandomEntranceOffers
              effects={entranceEffects}
              userEffects={userEffects}
              onPurchase={(offer) => purchaseEffectMutation.mutate({ ...offer.effect, coin_price: offer.price })}
            />
            {entranceEffects.length === 0 ? (
              <Card className="bg-[#1a1a24] border-[#2a2a3a] p-12 text-center">
                <Sparkles className="w-16 h-16 text-gray-700 mx-auto mb-4" />
                <p className="text-gray-500 text-lg">No entrance effects available yet</p>
                <p className="text-gray-600 text-sm mt-2">Check back soon for amazing effects!</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {entranceEffects.map((effect) => {
                  if (!effect || (effect.id == null && effect.effect_id == null)) return null;
                  const effectId = effect.id ?? effect.effect_id;
                  const owned = Array.isArray(userEffects) && userEffects.some((e) => e.effect_id === effectId);
                  const coinPriceNum = Number(effect.coin_price);
                  const hasPrice = Number.isFinite(coinPriceNum) && coinPriceNum > 0;
                  const rarityKey = String(effect.rarity || 'common').toLowerCase();
                  
                  return (
                    <Card key={effect.id} className={`bg-[#1a1a24] border-[#2a2a3a] overflow-hidden ${
                      owned ? 'opacity-50' : ''
                    }`}>
                      <div className="p-6">
                        <Badge className={`bg-gradient-to-r ${rarityColors[rarityKey] || 'from-gray-500 to-slate-500'} border-0 text-white mb-3`}>
                          {rarityKey}
                        </Badge>
                        <h3 className="text-xl font-bold text-white mb-2">{effect.name}</h3>
                        <p className="text-gray-400 text-sm mb-4">{effect.description}</p>
                        
                        {hasPrice ? (
                          <div className="flex items-center justify-between mb-4">
                            <span className="text-yellow-400 flex items-center gap-1 text-2xl font-bold">
                              <Coins className="w-6 h-6" />
                              {coinPriceNum}
                            </span>
                            <span className="text-gray-500 text-sm">
                              (NO CASH VALUE)
                            </span>
                          </div>
                        ) : (
                          <div className="mb-4 bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
                            <p className="text-purple-300 text-sm text-center">
                              ✨ Contact Admin for Pricing
                            </p>
                          </div>
                        )}
                        
                        <Button
                          onClick={() => hasPrice ? handlePurchaseEffect(effect) : toast.info("Please contact admin to purchase this effect")}
                          disabled={owned || purchaseEffectMutation.isPending || !hasPrice}
                          className={`w-full ${
                            owned 
                              ? 'bg-gray-600 cursor-not-allowed' 
                              : hasPrice
                              ? 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
                              : 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700'
                          }`}
                        >
                          {owned ? 'Owned' : hasPrice ? `Purchase (${coinPriceNum} coins)` : 'Contact Admin'}
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Purchase History Tab */}
        {activeTab === "history" && (
          <div>
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
              <DollarSign className="w-6 h-6 text-green-400" />
              Purchase History
            </h2>
            
            {purchaseHistory.length === 0 ? (
              <Card className="bg-[#1a1a24] border-[#2a2a3a] p-12 text-center">
                <ShoppingCart className="w-16 h-16 text-gray-700 mx-auto mb-4" />
                <p className="text-gray-500 text-lg">No purchases yet</p>
                <p className="text-gray-600 text-sm mt-2">Your purchase history will appear here</p>
              </Card>
            ) : (
              <Card className="bg-[#1a1a24] border-[#2a2a3a] p-6">
                <div className="space-y-3">
                  {purchaseHistory.map((purchase) => (
                    <motion.div
                      key={purchase.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="bg-[#0a0a0f] rounded-lg p-4 border border-[#2a2a3a]"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-full flex items-center justify-center">
                            <Coins className="w-6 h-6 text-white" />
                          </div>
                          <div>
                            <p className="text-white font-bold text-lg">
                              {purchase.coin_amount.toLocaleString()} Coins
                            </p>
                            <p className="text-gray-400 text-sm">{purchase.package_type}</p>
                            <p className="text-gray-500 text-xs mt-1">
                              {format(new Date(purchase.created_date), 'MMM d, yyyy h:mm a')}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-green-400 font-bold text-xl">
                            {formatCurrency(purchase.usd_amount)}
                          </p>
                          <Badge className={
                            purchase.status === 'completed' ? 'bg-green-500' :
                            purchase.status === 'pending' ? 'bg-yellow-500' :
                            'bg-red-500'
                          }>
                            {purchase.status === 'completed' && <CheckCircle className="w-3 h-3 mr-1" />}
                            {purchase.status}
                          </Badge>
                          <p className="text-gray-500 text-xs mt-1">Stripe</p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Summary Stats */}
                <div className="mt-6 pt-6 border-t border-[#2a2a3a] grid grid-cols-2 gap-4">
                  <div className="bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border border-yellow-500/50 rounded-lg p-4">
                    <p className="text-gray-400 text-sm mb-1">Total Spent</p>
                    <p className="text-3xl font-bold text-green-400">
                      {formatCurrency(purchaseHistory.filter(p => p.status === 'completed').reduce((sum, p) => sum + (Number(p.usd_amount) || 0), 0))}
                    </p>
                  </div>
                  <div className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/50 rounded-lg p-4">
                    <p className="text-gray-400 text-sm mb-1">Total Coins Bought</p>
                    <p className="text-3xl font-bold text-yellow-400">
                      {purchaseHistory.filter(p => p.status === 'completed').reduce((sum, p) => sum + p.coin_amount, 0).toLocaleString()}
                    </p>
                  </div>
                </div>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="bg-[#1a1a24] border-[#2a2a3a]">
          <DialogHeader>
            <DialogTitle className="text-white text-2xl">Confirm Purchase</DialogTitle>
            <DialogDescription className="text-gray-400">
              Review your purchase and proceed to manual payment submission
            </DialogDescription>
          </DialogHeader>
          
          {selectedPackage && (
            <div className="space-y-6 my-4">
              <div className="bg-[#0a0a0f] rounded-lg p-4">
                <div className="text-center mb-3">
                  <div className="text-4xl mb-2">{selectedPackage.emoji}</div>
                  <div className="text-2xl font-bold text-yellow-400">
                    {(selectedPackage.coins + (selectedPackage.bonus || 0)).toLocaleString()} Troll Coins
                  </div>
                  <div className="text-xl text-white mt-1">
                    ${selectedPackage.price.toFixed(2)}
                  </div>
                  {selectedPackage.isTest && (
                    <div className="mt-3 bg-green-500/20 border border-green-500/30 rounded-lg p-3">
                      <p className="text-green-300 text-sm">
                        ✅ <strong>Test Payment - Full Refund</strong>
                      </p>
                      <p className="text-green-200 text-xs mt-1">
                        This $0.01 will be refunded to your account within 24 hours
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-white font-semibold block mb-2">Payment Method:</label>
                
                <div className="w-full p-4 rounded-lg border-2 border-blue-500 bg-blue-500/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
                        <CreditCard className="w-6 h-6 text-white" />
                      </div>
                      <div className="text-left">
                        <p className="text-white font-semibold">Manual Payment</p>
                        <p className="text-gray-300 text-sm">PayPal, CashApp, Zelle, Venmo, Bank Transfer</p>
                        <p className="text-green-300 text-xs mt-1">✅ Receipt upload and admin verification</p>
                      </div>
                    </div>
                    <CheckCircle className="w-6 h-6 text-blue-400" />
                  </div>
                </div>
                
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                  <p className="text-blue-300 text-xs">
                    🧾 <strong>Manual Receipt Submission</strong><br/>
                    • Upload your payment receipt and include your handle (e.g., PayPal email, $Cashtag)<br/>
                    • Admin reviews and verifies the payment
                    <br/>
                    • Coins credited after verification
                  </p>
                </div>
              </div>

              <Button
                onClick={() => {
                  // Redirect to manual payment flow instead of Stripe
                  setShowPaymentDialog(false);
                  navigate(createPageUrl("Manual Coins Payment"));
                }}
                className="w-full py-6 text-lg font-bold bg-blue-600 hover:bg-blue-700"
              >
                <>
                  <CreditCard className="w-5 h-5 mr-2" />
                  Proceed to Manual Payment
                </>
              </Button>
              {!functionsEnabled && (
                <div className="mt-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                  <p className="text-yellow-300 text-xs">
                    ℹ️ Note: Manual payment flow does not require Stripe Functions. The Stripe notice applies only to card checkout.
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Test Stripe Connection Dialog */}
      <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
        <DialogContent className="bg-[#1a1a24] border-[#2a2a3a] max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white text-2xl flex items-center gap-2">
              <AlertCircle className="w-6 h-6 text-blue-400" />
              Stripe Connection Test
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Diagnose Stripe integration issues and get exact steps to fix them
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-4">
            {!testResults && !isTesting && (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CreditCard className="w-8 h-8 text-blue-400" />
                </div>
                <p className="text-gray-300 mb-4">Click the button below to test your Stripe integration</p>
                <Button
                  onClick={testStripe}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Run Connection Test
                </Button>
              </div>
            )}

            {isTesting && (
              <div className="text-center py-8">
                <Loader2 className="w-12 h-12 text-blue-400 animate-spin mx-auto mb-4" />
                <p className="text-gray-300">Testing Stripe connection...</p>
                <p className="text-gray-500 text-sm mt-2">This may take a few seconds</p>
              </div>
            )}

            {testResults && (
              <div className="space-y-4">
                {/* Overall Status */}
                <Card className={`p-6 ${testResults.overallStatus.includes('✅') ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                  <div className="flex items-center gap-3 mb-2">
                    {testResults.overallStatus.includes('✅') ? (
                      <CheckCircle className="w-8 h-8 text-green-400" />
                    ) : (
                      <XCircle className="w-8 h-8 text-red-400" />
                    )}
                    <div>
                      <h3 className="text-xl font-bold text-white">{testResults.overallStatus}</h3>
                      {testResults.summary && (
                        <p className="text-sm text-gray-300 mt-1">{testResults.summary}</p>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">Test completed at: {new Date(testResults.timestamp).toLocaleString()}</p>
                </Card>

                {/* Test Results */}
                <div className="space-y-3">
                  {testResults.tests.map((test, idx) => (
                    <Card key={idx} className="bg-[#0a0a0f] border-[#2a2a3a] p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{test.status}</span>
                          <h4 className="text-white font-semibold">{test.name}</h4>
                        </div>
                      </div>

                      {test.message && (
                        <p className="text-gray-300 text-sm mb-3">{test.message}</p>
                      )}

                      {test.details && (
                        <div className="bg-black/30 rounded-lg p-3">
                          <p className="text-gray-500 text-xs font-semibold mb-2">Details:</p>
                          <pre className="text-xs text-gray-400 overflow-x-auto whitespace-pre-wrap">
                            {JSON.stringify(test.details, null, 2)}
                          </pre>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>

                {/* Retry Button */}
                <div className="flex gap-3">
                  <Button
                    onClick={() => setShowTestDialog(false)}
                    variant="outline"
                    className="flex-1 border-[#2a2a3a] text-white hover:bg-[#2a2a3a]"
                  >
                    Close
                  </Button>
                  <Button
                    onClick={testStripe}
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                  >
                    Run Test Again
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Random Entrance Offers component
function RandomEntranceOffers({ effects = [], userEffects = [], onPurchase }) {
  const [offers, setOffers] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    try {
      if (Array.isArray(effects) && effects.length > 0) {
        generateOffers();
      } else {
        setOffers([]);
      }
    } catch (e) {
      console.warn('RandomEntranceOffers init error:', e?.message || e);
      setOffers([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effects]);

  function priceFor(effect) {
    const baseVal = Number(effect?.coin_price);
    const base = baseVal && baseVal > 0 ? baseVal : 500;
    const rarity = String(effect?.rarity || '').toLowerCase();
    let min = 0.8, max = 1.3;
    if (rarity.includes('legend')) { min = 1.2; max = 2.0; }
    else if (rarity.includes('epic')) { min = 1.0; max = 1.6; }
    else if (rarity.includes('rare')) { min = 0.9; max = 1.4; }
    else { min = 0.6; max = 1.2; }
    const mult = min + Math.random() * (max - min);
    const raw = base * mult;
    const rounded = Math.max(50, Math.round(raw / 10) * 10);
    return rounded;
  }

  function generateOffers() {
    setRefreshing(true);
    try {
      const pool = Array.isArray(effects) ? effects.filter((e) => e && (e.id ?? e.effect_id)) : [];
      // Shuffle
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const selected = pool.slice(0, Math.min(6, pool.length)).map((effect, idx) => {
        const id = effect.id ?? effect.effect_id ?? idx;
        return {
          id: `rand-${id}-${idx}`,
          effect,
          price: priceFor(effect),
        };
      });
      setOffers(selected);
    } finally {
      setRefreshing(false);
    }
  }

  if (!Array.isArray(effects) || effects.length === 0) return null;

  const safeOffers = Array.isArray(offers)
    ? offers.filter((o) => o && o.effect && (o.effect.id ?? o.effect.effect_id))
    : [];

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xl font-bold text-white flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-pink-400" />
          Random Entrance Offers
        </h3>
        <Button onClick={generateOffers} disabled={refreshing} className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700">
          {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Shuffle'}
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {safeOffers.map((offer) => {
          const effectId = offer.effect.id ?? offer.effect.effect_id;
          const owned = Array.isArray(userEffects) && userEffects.some((e) => e.effect_id === effectId);
          const rarityKey = String(offer.effect.rarity || 'common').toLowerCase();
          const rarityClass = rarityColors[rarityKey] || 'from-gray-500 to-slate-500';
          const name = offer.effect.name || offer.effect.effect_name || 'Unknown Effect';
          const desc = offer.effect.description || '';
          const handlePurchase = () => {
            if (owned) return;
            if (typeof onPurchase === 'function') {
              try {
                onPurchase(offer);
              } catch (err) {
                console.warn('RandomEntranceOffers purchase error:', err?.message || err);
                toast.error('Failed to start purchase for this offer');
              }
            } else {
              toast.error('Purchase handler is unavailable');
            }
          };
          return (
            <Card key={offer.id} className={`bg-[#14141d] border-[#2a2a3a] overflow-hidden ${owned ? 'opacity-50' : ''}`}>
              <div className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <Badge className="bg-gradient-to-r from-pink-600 to-fuchsia-600 border-0 text-white">Random Offer</Badge>
                  <Badge className={`bg-gradient-to-r ${rarityClass} border-0 text-white`}>
                    {rarityKey}
                  </Badge>
                </div>
                <h4 className="text-lg font-bold text-white mb-1">{name}</h4>
                <p className="text-gray-400 text-sm mb-4">{desc}</p>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-yellow-400 flex items-center gap-1 text-2xl font-bold">
                    <Coins className="w-6 h-6" />
                    {offer.price}
                  </span>
                  <span className="text-gray-500 text-sm">(NO CASH VALUE)</span>
                </div>
                <Button
                  onClick={handlePurchase}
                  disabled={owned}
                  className={`w-full ${owned ? 'bg-gray-600 cursor-not-allowed' : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'}`}
                >
                  {owned ? 'Owned' : `Purchase (${offer.price} coins)`}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
