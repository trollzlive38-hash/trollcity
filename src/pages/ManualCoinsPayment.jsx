import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { getCurrentUserProfile } from "@/api/supabaseHelpers";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";
import { AlertCircle, Coins, DollarSign, Upload } from "lucide-react";
import { motion } from "framer-motion";

const PAYMENT_METHODS = {
  paypal: { label: "PayPal", icon: "🅿️", sendTo: null, askFor: "your PayPal email to verify" },
  cashapp: { label: "Cash App", icon: "💵", sendTo: "$TrollCityLLC", askFor: "your CashApp handle (for verification)" },
  venmo: { label: "Venmo", icon: "Ⓥ", sendTo: null, askFor: "your Venmo username (for verification)" },
  zelle: { label: "Zelle", icon: "💳", sendTo: null, askFor: "your Zelle email or phone" },
  bank_transfer: { label: "Bank Transfer", icon: "🏦", sendTo: null, askFor: "your bank details (for verification)" },
};

const COIN_PRESETS = [
  { coins: 500, usd: 6.49 },
  { coins: 1370, usd: 12.99 },
  { coins: 3140, usd: 19.99 },
  { coins: 6850, usd: 49.99 },
  { coins: 19700, usd: 139.99 },
  { coins: 39900, usd: 279.99 },
];

export default function ManualCoinsPayment() {
  const navigate = useNavigate();
  const { data: currentUser } = useQuery({
    queryKey: ["currentUser"],
    queryFn: getCurrentUserProfile,
  });

  // CashApp only flow
  const method = "cashapp"; // Hardcoded to CashApp only
  const [paymentAccount, setPaymentAccount] = useState("");
  const [file, setFile] = useState(null);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [coinAmount, setCoinAmount] = useState("");
  const [usdAmount, setUsdAmount] = useState("");
  const [selectedPreset, setSelectedPreset] = useState(null);

  // Auto-calculate USD from coins preset
  useEffect(() => {
    if (selectedPreset) {
      setCoinAmount(selectedPreset.coins.toString());
      setUsdAmount(selectedPreset.usd.toString());
    }
  }, [selectedPreset]);


  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!currentUser?.id) {
      toast.error("Please log in to submit a payment request");
      supabase.auth.redirectToLogin?.();
      return;
    }

    // Validation
    if (!paymentAccount || paymentAccount.trim() === "") {
      toast.error("Enter your CashApp handle");
      return;
    }
    if (!file) {
      toast.error("Upload a payment proof screenshot");
      return;
    }
    if (!coinAmount || parseInt(coinAmount) < 1) {
      toast.error("Enter coin amount (minimum 1 coin)");
      return;
    }
    if (!usdAmount || parseFloat(usdAmount) < 0.01) {
      toast.error("Enter USD amount (minimum $0.01)");
      return;
    }

    try {
      setSubmitting(true);
      toast.loading("Uploading payment proof...", { id: "payment-upload" });

      // Upload payment proof screenshot
      const userId = currentUser.id;
      const ext = file.name?.split(".").pop() || "jpg";
      const path = `manual-payments/${userId}/${Date.now()}.${ext}`;
      const candidates = ["images", "avatars"];
      let file_url = "";
      let usedBucket = null;
      let lastError = null;

      for (const bucketName of candidates) {
        const { error: uploadError } = await supabase.storage
          .from(bucketName)
          .upload(path, file, {
            contentType: file.type || "application/octet-stream",
            upsert: true,
          });

        if (uploadError) {
          lastError = uploadError;
          const msg = (uploadError?.message || "").toLowerCase();
          const isBucketMissing = msg.includes("bucket") && msg.includes("not found");
          const isRlsDenied = msg.includes("row-level security") || msg.includes("permission denied") || msg.includes("policy");
          if (isBucketMissing || isRlsDenied) {
            continue;
          }
          throw uploadError;
        }

        const { data: pub } = await supabase.storage.from(bucketName).getPublicUrl(path);
        file_url = pub?.publicUrl || "";
        usedBucket = bucketName;
        break;
      }

      if (!usedBucket) {
        throw new Error(
          `Upload failed: ${lastError?.message || "No suitable storage bucket available"}`
        );
      }

      toast.loading("Creating payment request...", { id: "payment-upload" });

      // Insert into manual_payment_requests table
      const { error: insertError } = await supabase
        .from("manual_payment_requests")
        .insert({
          user_id: currentUser.id,
          username: currentUser.username || currentUser.full_name || currentUser.email.split("@")[0],
          user_email: currentUser.email,
          coin_amount: parseInt(coinAmount),
          usd_amount: parseFloat(usdAmount).toFixed(2),
          payment_method: method,
          payment_account: paymentAccount,
          payment_proof_url: file_url,
          status: "pending",
          created_date: new Date().toISOString(),
        });

      if (insertError) throw insertError;

      toast.success(
        "✅ Payment request submitted! Admins will review your proof and credit coins to your account.",
        { id: "payment-upload", duration: 5000 }
      );

      // Navigate to Store page
      setTimeout(() => {
        navigate(createPageUrl("Store"));
      }, 2000);
    } catch (err) {
      console.error("❌ Manual payment error:", err);
      toast.error(err?.message || "Failed to submit payment request", { id: "payment-upload", duration: 6000 });
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <div className="min-h-screen bg-[#0a0a0f] p-6 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <Coins className="w-8 h-8 text-yellow-400" />
            <h1 className="text-4xl font-bold text-white">Manual Coin Payment</h1>
          </div>
          <p className="text-gray-400 text-lg">
            Send payment via CashApp to <span className="text-green-400 font-semibold">$TrollCityLLC</span>, then upload proof. Our admins will verify and credit your account.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="lg:col-span-2"
          >
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* CashApp Payment Instructions & Account */}
              <Card className="bg-[#1a1a24] border-[#2a2a3a] p-6">
                {/* Send Payment To */}
                <div className="mb-6 bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 rounded-lg p-4">
                  <p className="text-gray-400 text-sm mb-1">💰 Send Payment To:</p>
                  <p className="text-2xl font-bold text-green-400">$TrollCityLLC</p>
                  <p className="text-xs text-green-300 mt-2">This is where you send the payment for your coins</p>
                </div>

                {/* Your CashApp Handle */}
                <h2 className="text-xl font-bold text-white mb-4">Step 1: Your CashApp Handle</h2>
                <div>
                  <label className="text-gray-400 text-sm mb-2 block">
                    Your CashApp Handle
                  </label>
                  <Input
                    type="text"
                    placeholder="$YourHandle"
                    value={paymentAccount}
                    onChange={(e) => setPaymentAccount(e.target.value)}
                    className="bg-[#0a0a0f] border-[#2a2a3a] text-white text-lg py-3"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Your CashApp handle so we can verify the payment came from your account
                  </p>
                </div>
              </Card>

              {/* Coin Amount */}
              <Card className="bg-[#1a1a24] border-[#2a2a3a] p-6">
                                <h2 className="text-xl font-bold text-white mb-4">Step 2: Choose Coin Package</h2>
                <div className="mb-4">
                  <p className="text-gray-400 text-sm mb-3">Quick Presets:</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {COIN_PRESETS.map((preset) => (
                      <motion.button
                        key={preset.coins}
                        type="button"
                        onClick={() => setSelectedPreset(preset)}
                        whileHover={{ scale: 1.05 }}
                        className={`p-3 rounded-lg border-2 transition-all text-center ${
                          selectedPreset?.coins === preset.coins
                            ? "border-green-500 bg-green-500/20"
                            : "border-[#2a2a3a] bg-[#0a0a0f] hover:border-[#3a3a4a]"
                        }`}
                      >
                        <div className="text-yellow-400 font-bold">{preset.coins.toLocaleString()}</div>
                        <div className="text-gray-400 text-xs">${preset.usd.toFixed(2)}</div>
                      </motion.button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-gray-400 text-sm mb-2 block">Coins</label>
                    <Input
                      type="number"
                      placeholder="500"
                      min="1"
                      value={coinAmount}
                      onChange={(e) => setCoinAmount(e.target.value)}
                      className="bg-[#0a0a0f] border-[#2a2a3a] text-white text-lg py-3"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm mb-2 block">USD Amount ($)</label>
                    <Input
                      type="number"
                      placeholder="6.49"
                      min="0.01"
                      step="0.01"
                      value={usdAmount}
                      onChange={(e) => setUsdAmount(e.target.value)}
                      className="bg-[#0a0a0f] border-[#2a2a3a] text-white text-lg py-3"
                    />
                  </div>
                </div>
              </Card>

              {/* Payment Proof Upload */}
              <Card className="bg-[#1a1a24] border-[#2a2a3a] p-6">
                <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <Upload className="w-5 h-5 text-blue-400" />
                  Step 3: Upload Payment Proof
                </h2>
                <div className="bg-[#0a0a0f] border-2 border-dashed border-[#2a2a3a] rounded-lg p-8 text-center cursor-pointer hover:border-[#3a3a4a] transition-colors">
                  <label className="cursor-pointer">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                    {file ? (
                      <div>
                        <div className="text-2xl mb-2">✅</div>
                        <p className="text-white font-semibold">{file.name}</p>
                        <p className="text-gray-400 text-sm">{(file.size / 1024).toFixed(2)} KB</p>
                      </div>
                    ) : (
                      <div>
                        <div className="text-4xl mb-3">📸</div>
                        <p className="text-white font-semibold">Click to upload screenshot</p>
                        <p className="text-gray-400 text-sm">or drag & drop</p>
                        <p className="text-gray-500 text-xs mt-2">PNG, JPG, JPEG, GIF (Max 10MB)</p>
                      </div>
                    )}
                  </label>
                </div>
              </Card>

              {/* Optional Description */}
              <Card className="bg-[#1a1a24] border-[#2a2a3a] p-6">
                <h2 className="text-xl font-bold text-white mb-4">Step 4: Additional Notes (Optional)</h2>
                <Textarea
                  placeholder="e.g., Purchased 1,370 coins via PayPal on Jan 15"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="bg-[#0a0a0f] border-[#2a2a3a] text-white min-h-24"
                />
              </Card>

              {/* Submit Button */}
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button
                  type="submit"
                  disabled={submitting || !file || !coinAmount || !usdAmount || !paymentAccount}
                  className="w-full py-6 text-lg font-bold bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? "Processing..." : "Submit Payment Request"}
                </Button>
              </motion.div>
            </form>
          </motion.div>

          {/* Sidebar - Info */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-4"
          >
            {/* Summary Card */}
            <Card className="bg-gradient-to-br from-purple-900/50 to-pink-900/50 border-purple-500/50 p-6 sticky top-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Coins className="w-5 h-5 text-yellow-400" />
                Summary
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Coins:</span>
                  <span className="text-2xl font-bold text-yellow-400">{coinAmount || "0"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">USD Amount:</span>
                  <span className="text-2xl font-bold text-green-400">${usdAmount || "0.00"}</span>
                </div>
                <div className="bg-[#0a0a0f] rounded-lg p-3 mt-4 border border-[#2a2a3a]">
                  <p className="text-gray-500 text-xs mb-1">Rate:</p>
                  <p className="text-white font-semibold">
                    {usdAmount && coinAmount
                      ? (parseInt(coinAmount) / parseFloat(usdAmount)).toFixed(0)
                      : "0"}{" "}
                    coins per $1
                  </p>
                </div>
              </div>
            </Card>

            {/* Process Info */}
            <Card className="bg-[#1a1a24] border-[#2a2a3a] p-6">
              <h3 className="text-lg font-bold text-white mb-4">How It Works</h3>
              <div className="space-y-3 text-sm">
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-purple-500/20 border border-purple-500 flex items-center justify-center flex-shrink-0">
                    <span className="text-purple-400 font-bold text-xs">1</span>
                  </div>
                  <div>
                    <p className="text-white font-semibold">Choose Method</p>
                    <p className="text-gray-500 text-xs">Select your payment method (we'll show you where to send payment)</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-purple-500/20 border border-purple-500 flex items-center justify-center flex-shrink-0">
                    <span className="text-purple-400 font-bold text-xs">2</span>
                  </div>
                  <div>
                    <p className="text-white font-semibold">Send Payment</p>
                    <p className="text-gray-500 text-xs">Send funds to the specified payment account</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-purple-500/20 border border-purple-500 flex items-center justify-center flex-shrink-0">
                    <span className="text-purple-400 font-bold text-xs">3</span>
                  </div>
                  <div>
                    <p className="text-white font-semibold">Your Account Info</p>
                    <p className="text-gray-500 text-xs">Enter your account info so we can verify it was from you</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-purple-500/20 border border-purple-500 flex items-center justify-center flex-shrink-0">
                    <span className="text-purple-400 font-bold text-xs">4</span>
                  </div>
                  <div>
                    <p className="text-white font-semibold">Upload Proof</p>
                    <p className="text-gray-500 text-xs">Screenshot showing payment sent</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-purple-500/20 border border-purple-500 flex items-center justify-center flex-shrink-0">
                    <span className="text-purple-400 font-bold text-xs">5</span>
                  </div>
                  <div>
                    <p className="text-white font-semibold">Admin Reviews</p>
                    <p className="text-gray-500 text-xs">Within 24-48 hours</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-green-500/20 border border-green-500 flex items-center justify-center flex-shrink-0">
                    <span className="text-green-400 font-bold text-xs">✓</span>
                  </div>
                  <div>
                    <p className="text-white font-semibold">Coins Added</p>
                    <p className="text-gray-500 text-xs">Instantly credited to account</p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Warning */}
            <Card className="bg-yellow-500/10 border-yellow-500/30 p-4">
              <div className="flex gap-2">
                <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-yellow-300 text-sm font-semibold">Admin Review Required</p>
                  <p className="text-yellow-200 text-xs mt-1">
                    Payment requests are manually reviewed by admins. Please be patient while we verify your payment proof.
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
