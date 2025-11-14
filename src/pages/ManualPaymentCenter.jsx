import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { CheckCircle, XCircle, Eye, Clock, DollarSign, User, Mail } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { creditCoins } from "@/lib/coins";

export default function ManualPaymentCenter() {
  const queryClient = useQueryClient();
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [adminNotes, setAdminNotes] = useState("");
  const [filterStatus, setFilterStatus] = useState("pending");

  // Check if user is admin
  const { data: currentUser } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => supabase.auth.me(),
    retry: false,
  });

  const isAdmin = currentUser?.user_metadata?.role === "admin" || currentUser?.role === "admin";

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-6">
        <Card className="bg-[#1a1a24] border-[#2a2a3a] p-8 text-center max-w-md">
          <h2 className="text-2xl font-bold text-white mb-4">Access Denied</h2>
          <p className="text-gray-400">Only admins can access the Manual Payment Center.</p>
        </Card>
      </div>
    );
  }

  // Fetch manual payment requests
  const { data: paymentRequests = [], isLoading, refetch } = useQuery({
    queryKey: ["manualPaymentRequests", filterStatus],
    queryFn: async () => {
      let query = supabase.from("manual_payment_requests").select("*");
      
      if (filterStatus !== "all") {
        query = query.eq("status", filterStatus);
      }
      
      const { data, error } = await query.order("created_date", { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!isAdmin,
  });

  // Approve payment mutation
  const approveMutation = useMutation(
    async ({ requestId, coinsToAdd }) => {
      if (!selectedRequest?.user_id) throw new Error("No user ID");

      // 1. Update manual_payment_requests status to approved
      const { error: updateError } = await supabase
        .from("manual_payment_requests")
        .update({
          status: "approved",
          admin_notes: adminNotes,
          approved_by: currentUser?.id,
          approved_at: new Date().toISOString(),
          updated_date: new Date().toISOString(),
        })
        .eq("id", requestId);

      if (updateError) throw updateError;

      // 2. Credit coins using centralized helper (creates transaction + updates profile)
      await creditCoins(selectedRequest.user_id, coinsToAdd, { source: 'manual_payment', reference: requestId });

      // Fetch new total for UI
      const { data: profileAfter } = await supabase.from('profiles').select('purchased_coins').eq('id', selectedRequest.user_id).single();
      const newTotal = profileAfter?.purchased_coins || 0;

      return { requestId, coinsAdded: coinsToAdd, newTotal };
    },
    {
      onSuccess: (data) => {
        toast.success(
          `✅ Payment approved! Added ${data.coinsAdded} coins to user (total: ${data.newTotal})`
        );
        setSelectedRequest(null);
        setAdminNotes("");
        setShowPreview(false);
        queryClient.invalidateQueries(["manualPaymentRequests"]);
        refetch();
      },
      onError: (err) => {
        toast.error(`Failed to approve payment: ${err.message}`);
      },
    }
  );

  // Reject payment mutation
  const rejectMutation = useMutation(
    async (requestId) => {
      const { error } = await supabase
        .from("manual_payment_requests")
        .update({
          status: "rejected",
          admin_notes: adminNotes,
          updated_date: new Date().toISOString(),
        })
        .eq("id", requestId);

      if (error) throw error;
      return requestId;
    },
    {
      onSuccess: () => {
        toast.success("✅ Payment rejected.");
        setSelectedRequest(null);
        setAdminNotes("");
        setShowPreview(false);
        queryClient.invalidateQueries(["manualPaymentRequests"]);
        refetch();
      },
      onError: (err) => {
        toast.error(`Failed to reject payment: ${err.message}`);
      },
    }
  );

  const handleApprove = (coinsAmount) => {
    approveMutation.mutate({ requestId: selectedRequest.id, coinsToAdd: coinsAmount });
  };

  const handleReject = () => {
    rejectMutation.mutate(selectedRequest.id);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Manual Payment Center (MPC)</h1>
          <p className="text-gray-400">Review and verify manual coin purchase payments</p>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-6">
          {["pending", "approved", "rejected", "all"].map((status) => (
            <Button
              key={status}
              type="button"
              onClick={() => setFilterStatus(status)}
              variant={filterStatus === status ? "default" : "outline"}
              className={
                filterStatus === status
                  ? "bg-purple-600"
                  : "border-[#2a2a3a] text-gray-400 hover:text-white"
              }
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Button>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-[#1a1a24] border-[#2a2a3a] p-4">
            <p className="text-gray-400 text-sm mb-1">Pending</p>
            <p className="text-3xl font-bold text-yellow-400">
              {paymentRequests.filter((r) => r.status === "pending").length}
            </p>
          </Card>
          <Card className="bg-[#1a1a24] border-[#2a2a3a] p-4">
            <p className="text-gray-400 text-sm mb-1">Approved</p>
            <p className="text-3xl font-bold text-green-400">
              {paymentRequests.filter((r) => r.status === "approved").length}
            </p>
          </Card>
          <Card className="bg-[#1a1a24] border-[#2a2a3a] p-4">
            <p className="text-gray-400 text-sm mb-1">Rejected</p>
            <p className="text-3xl font-bold text-red-400">
              {paymentRequests.filter((r) => r.status === "rejected").length}
            </p>
          </Card>
          <Card className="bg-[#1a1a24] border-[#2a2a3a] p-4">
            <p className="text-gray-400 text-sm mb-1">Total Pending USD</p>
            <p className="text-3xl font-bold text-blue-400">
              $
              {paymentRequests
                .filter((r) => r.status === "pending")
                .reduce((sum, r) => sum + (Number(r.usd_amount) || 0), 0)
                .toFixed(2)}
            </p>
          </Card>
        </div>

        {/* Payment Requests List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-purple-500" />
          </div>
        ) : paymentRequests.length === 0 ? (
          <Card className="bg-[#1a1a24] border-[#2a2a3a] p-12 text-center">
            <p className="text-gray-500 text-lg">No payment requests found</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {paymentRequests.map((req) => (
              <motion.div
                key={req.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <Card
                  className={`bg-[#1a1a24] border-2 p-4 cursor-pointer transition-all hover:border-purple-500 ${
                    req.status === "pending"
                      ? "border-yellow-500/50"
                      : req.status === "approved"
                      ? "border-green-500/50"
                      : "border-red-500/50"
                  }`}
                  onClick={() => {
                    setSelectedRequest(req);
                    setShowPreview(true);
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* User Info */}
                      <div className="flex items-center gap-2 mb-2">
                        <User className="w-4 h-4 text-purple-400 flex-shrink-0" />
                        <p className="text-white font-semibold truncate">{req.username}</p>
                        <Badge
                          className={`flex-shrink-0 ${
                            req.status === "pending"
                              ? "bg-yellow-500"
                              : req.status === "approved"
                              ? "bg-green-500"
                              : "bg-red-500"
                          }`}
                        >
                          {req.status.toUpperCase()}
                        </Badge>
                      </div>

                      {/* Email */}
                      <div className="flex items-center gap-2 mb-2">
                        <Mail className="w-4 h-4 text-gray-500 flex-shrink-0" />
                        <p className="text-gray-400 text-sm truncate">{req.user_email}</p>
                      </div>

                      {/* Payment Details */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                          <p className="text-gray-500 text-xs">Amount</p>
                          <p className="text-yellow-400 font-bold">${req.usd_amount.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs">Coins</p>
                          <p className="text-blue-400 font-bold">{req.coin_amount}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs">Method</p>
                          <p className="text-gray-300 capitalize">{req.payment_method}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs">Date</p>
                          <p className="text-gray-300 text-sm">
                            {new Date(req.created_date).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      {/* Account Info */}
                      {req.payment_account && (
                        <div className="mt-2 bg-[#0a0a0f] rounded p-2">
                          <p className="text-gray-500 text-xs">Payment Account:</p>
                          <p className="text-gray-300 text-sm">{req.payment_account}</p>
                        </div>
                      )}
                    </div>

                    {/* Action Button */}
                    <Button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedRequest(req);
                        setShowPreview(true);
                      }}
                      className="flex-shrink-0 bg-purple-600 hover:bg-purple-700"
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      View
                    </Button>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Preview & Action Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="bg-[#1a1a24] border-[#2a2a3a] max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white text-2xl flex items-center gap-2">
              <User className="w-6 h-6 text-purple-400" />
              Payment Review: {selectedRequest?.username}
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Review user details and payment screenshot before approving
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-6 my-4">
              {/* User & Payment Details */}
              <div className="grid grid-cols-2 gap-4">
                <Card className="bg-[#0a0a0f] border-[#2a2a3a] p-4">
                  <p className="text-gray-500 text-xs mb-1">Username</p>
                  <p className="text-white font-semibold">{selectedRequest.username}</p>
                </Card>
                <Card className="bg-[#0a0a0f] border-[#2a2a3a] p-4">
                  <p className="text-gray-500 text-xs mb-1">Email</p>
                  <p className="text-white font-semibold text-sm">{selectedRequest.user_email}</p>
                </Card>
                <Card className="bg-[#0a0a0f] border-[#2a2a3a] p-4">
                  <p className="text-gray-500 text-xs mb-1 flex items-center gap-1">
                    <DollarSign className="w-3 h-3" />
                    USD Amount
                  </p>
                  <p className="text-yellow-400 font-bold text-lg">
                    ${selectedRequest.usd_amount.toFixed(2)}
                  </p>
                </Card>
                <Card className="bg-[#0a0a0f] border-[#2a2a3a] p-4">
                  <p className="text-gray-500 text-xs mb-1">Coins</p>
                  <p className="text-blue-400 font-bold text-lg">{selectedRequest.coin_amount}</p>
                </Card>
                <Card className="bg-[#0a0a0f] border-[#2a2a3a] p-4">
                  <p className="text-gray-500 text-xs mb-1">Payment Method</p>
                  <p className="text-white capitalize font-semibold">{selectedRequest.payment_method}</p>
                </Card>
                <Card className="bg-[#0a0a0f] border-[#2a2a3a] p-4">
                  <p className="text-gray-500 text-xs mb-1">Payment Account</p>
                  <p className="text-white font-semibold text-sm">{selectedRequest.payment_account || "N/A"}</p>
                </Card>
              </div>

              {/* Payment Screenshot */}
              {selectedRequest.payment_proof_url && (
                <Card className="bg-[#0a0a0f] border-[#2a2a3a] p-4">
                  <p className="text-gray-400 text-sm mb-3 font-semibold">Payment Proof Screenshot</p>
                  <img
                    src={selectedRequest.payment_proof_url}
                    alt="Payment proof"
                    className="w-full rounded border border-[#2a2a3a] max-h-96 object-cover"
                  />
                </Card>
              )}

              {/* Admin Notes */}
              <Card className="bg-[#0a0a0f] border-[#2a2a3a] p-4">
                <p className="text-gray-400 text-sm mb-2 font-semibold">Admin Notes</p>
                <Textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Add notes (e.g., verified payment, reason for rejection, etc.)"
                  className="bg-[#1a1a24] border-[#2a2a3a] text-white min-h-24"
                />
              </Card>

              {/* Status & Actions */}
              {selectedRequest.status === "pending" ? (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                  <p className="text-yellow-300 font-semibold mb-4">⏳ This payment is awaiting approval</p>
                  <div className="flex gap-3">
                    <Button
                      type="button"
                      onClick={() => handleApprove(selectedRequest.coin_amount)}
                      disabled={approveMutation.isPending || rejectMutation.isPending}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Approve & Credit Coins
                    </Button>
                    <Button
                      type="button"
                      onClick={handleReject}
                      disabled={approveMutation.isPending || rejectMutation.isPending}
                      className="flex-1 bg-red-600 hover:bg-red-700"
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Reject
                    </Button>
                  </div>
                </div>
              ) : (
                <Card
                  className={`p-4 border-2 ${
                    selectedRequest.status === "approved"
                      ? "bg-green-500/10 border-green-500/30"
                      : "bg-red-500/10 border-red-500/30"
                  }`}
                >
                  <p
                    className={`font-semibold mb-2 ${
                      selectedRequest.status === "approved" ? "text-green-300" : "text-red-300"
                    }`}
                  >
                    {selectedRequest.status === "approved" ? "✅ Approved" : "❌ Rejected"}
                  </p>
                  {selectedRequest.approved_at && (
                    <p className="text-gray-400 text-sm mb-1">
                      <Clock className="w-3 h-3 inline mr-1" />
                      {new Date(selectedRequest.approved_at).toLocaleString()}
                    </p>
                  )}
                  {selectedRequest.admin_notes && (
                    <div className="mt-2 bg-black/30 rounded p-2">
                      <p className="text-gray-300 text-sm">{selectedRequest.admin_notes}</p>
                    </div>
                  )}
                </Card>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
