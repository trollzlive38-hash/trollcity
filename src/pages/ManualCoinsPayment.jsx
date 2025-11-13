import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { getCurrentUserProfile } from "@/api/supabaseHelpers";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";

export default function ManualCoinsPayment() {
  const navigate = useNavigate();
  const { data: currentUser } = useQuery({
    queryKey: ["currentUser"],
    queryFn: getCurrentUserProfile,
  });

  // CashApp-only flow per request
  const [method] = useState("cashapp");
  const [details] = useState("$TrollCityLLC");
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentUser?.id) {
      toast.error("Please log in to submit a receipt");
      supabase.auth.redirectToLogin?.();
      return;
    }
    // CashApp handle/details are fixed; only require receipt screenshot
    if (!file) {
      toast.error("Attach a receipt screenshot (image)");
      return;
    }

    try {
      setSubmitting(true);

      // Upload receipt to Storage: try 'images' first, then fallback to 'avatars' on RLS/bucket issues
      const userId = currentUser.id;
      const ext = file.name?.split(".").pop() || "jpg";
      const path = `receipts/${userId}/${Date.now()}.${ext}`;
      const candidates = ["images", "avatars"]; // buckets that exist in your project
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
            // Try next candidate bucket
            continue;
          }
          // Other error types: surface immediately
          throw uploadError;
        }
        const { data: pub } = await supabase.storage.from(bucketName).getPublicUrl(path);
        file_url = pub?.publicUrl || "";
        usedBucket = bucketName;
        break;
      }
      if (!usedBucket) {
        throw new Error(
          `Upload blocked or bucket missing. Allow authenticated insert on one of [${candidates.join(", ")}] or make the bucket public. Details: ${lastError?.message || lastError}`
        );
      }

      // Create a PaymentVerification entry for admin review
      const verification_code = Math.floor(100000 + Math.random() * 900000).toString();
      const payment_details = `method=${method}; handle=${details}; receipt_url=${file_url}`;
      {
        const { error: pvErr } = await supabase
          .from('payment_verifications')
          .insert({
            user_id: currentUser.id,
            user_name: currentUser.full_name,
            payment_method: method,
            payment_details,
            verification_code,
            verified_by_user: true,
            verified_by_admin: false,
            verification_date: new Date().toISOString(),
          });
        if (pvErr) throw pvErr;
      }

      // Find an admin to message
      const adminRes = await supabase
        .from("profiles")
        .select("*")
        .eq("role", "admin")
        .limit(1);
      const admin = Array.isArray(adminRes.data) ? adminRes.data[0] : null;

      if (admin?.id) {
        // Ensure a conversation exists
        const { data: existingA } = await supabase
          .from('conversations')
          .select('*')
          .eq('participant1_id', currentUser.id)
          .eq('participant2_id', admin.id)
          .limit(1);
        const { data: existingB } = await supabase
          .from('conversations')
          .select('*')
          .eq('participant1_id', admin.id)
          .eq('participant2_id', currentUser.id)
          .limit(1);
        let conversation = (existingA && existingA[0]) || (existingB && existingB[0]);

        let convId = conversation?.id;
        if (!convId) {
          // Robust insert: progressively drop unknown columns to match actual schema
          const basePayload = {
            participant1_id: currentUser.id,
            participant2_id: admin.id,
          };
          let payload = {
            ...basePayload,
            participant1_name: currentUser.full_name,
            participant1_username: currentUser.username,
            participant1_avatar: currentUser.avatar,
            participant1_created_date: currentUser.created_date,
            participant1_troll_family_id: currentUser.troll_family_id,
            participant1_troll_family_name: currentUser.troll_family_name,
            participant2_name: admin.full_name,
            participant2_username: admin.username,
            participant2_avatar: admin.avatar,
            participant2_created_date: admin.created_date,
            participant2_troll_family_id: admin.troll_family_id,
            participant2_troll_family_name: admin.troll_family_name,
          };

          let createdConv = null;
          for (let attempt = 0; attempt < 8; attempt++) {
            const { data, error } = await supabase
              .from('conversations')
              .insert(payload)
              .select()
              .single();
            if (!error) { createdConv = data; break; }
            const msg = String(error?.message || error);
            // Detect missing column and remove it, else fall back to minimal base
            const schemaCacheMatch = msg.match(/Could not find the '([^']+)' column of 'conversations' in the schema cache/i);
            const missingColumnMatch = msg.match(/column\s+"?(\w+)"?\s+does not exist/i);
            const col = schemaCacheMatch?.[1] || missingColumnMatch?.[1] || null;
            if (col && payload.hasOwnProperty(col)) {
              delete payload[col];
              continue;
            }
            // If we cannot identify the column, try minimal payload
            payload = { ...basePayload };
          }

          if (!createdConv) {
            // Final attempt with minimal payload
            const { data: minimalData } = await supabase
              .from('conversations')
              .insert(basePayload)
              .select()
              .single();
            createdConv = minimalData || null;
          }

          convId = createdConv?.id || null;
          conversation = createdConv || conversation; // keep a reference to the effective conversation
          if (!convId) {
            // Refetch just in case
            const { data: refetch } = await supabase
              .from('conversations')
              .select('*')
              .eq('participant1_id', currentUser.id)
              .eq('participant2_id', admin.id)
              .limit(1);
            convId = refetch?.[0]?.id || null;
            if (refetch && refetch[0]) conversation = refetch[0];
          }
        }

        if (convId) {
          const messageText = `Manual coins payment submitted.\n\n` +
            `Method: ${method}\n` +
            `Handle: ${details}\n` +
            `Receipt: ${file_url}\n` +
            `Verification Code: ${verification_code}`;
          {
            // Try sending a direct message; if the table doesn't exist, fall back to officer_chats
            try {
              // Build payload including created_date to satisfy Messages ordering
              let dmPayload = {
                conversation_id: convId,
                sender_id: currentUser.id,
                sender_name: currentUser.full_name,
                sender_username: currentUser.username || currentUser.full_name,
                sender_avatar: currentUser.avatar,
                receiver_id: admin.id,
                receiver_name: admin.full_name,
                message: messageText,
                is_read: false,
                created_date: new Date().toISOString(),
              };
              let sent = false;
              for (let attempt = 0; attempt < 4 && !sent; attempt++) {
                const { error: dmErr } = await supabase
                  .from('direct_messages')
                  .insert(dmPayload);
                if (!dmErr) { sent = true; break; }
                const m = String(dmErr?.message || dmErr);
                const schemaCacheMatch = m.match(/Could not find the '([^']+)' column of 'direct_messages' in the schema cache/i);
                const missingColumnMatch = m.match(/column\s+"?(\w+)"?\s+does not exist/i);
                const col = schemaCacheMatch?.[1] || missingColumnMatch?.[1] || null;
                if (col && Object.prototype.hasOwnProperty.call(dmPayload, col)) {
                  delete dmPayload[col];
                  continue;
                }
                throw dmErr; // unexpected error
              }
              if (!sent) throw new Error('Failed to insert DM after adaptive attempts');
            } catch (e) {
              const msg = String(e?.message || e);
              if (
                msg.includes("Could not find the table 'public.direct_messages' in the schema cache") ||
                msg.includes('PGRST205') ||
                msg.includes('relation')
              ) {
                // Fallback: notify officers/admins using officer_chats
                // Robust insert: progressively drop unknown columns to match actual officer_chats schema
                let ocPayload = {
                  sender_id: currentUser.id,
                  sender_email: currentUser.email || null,
                  sender_name: currentUser.full_name || currentUser.username || 'User',
                  sender_username: currentUser.username || currentUser.full_name || null,
                  sender_avatar: currentUser.avatar || null,
                  is_admin: (currentUser.role === 'admin' || currentUser.user_role === 'admin') || false,
                  message: `[Manual Coins] ${messageText}`,
                  message_type: 'text',
                };
                let inserted = false;
                for (let attempt = 0; attempt < 6 && !inserted; attempt++) {
                  const { error: ocErr } = await supabase
                    .from('officer_chats')
                    .insert(ocPayload);
                  if (!ocErr) { inserted = true; break; }
                  const m = String(ocErr?.message || ocErr);
                  const schemaCacheMatch = m.match(/Could not find the '([^']+)' column of 'officer_chats' in the schema cache/i);
                  const missingColumnMatch = m.match(/column\s+"?(\w+)"?\s+does not exist/i);
                  const col = schemaCacheMatch?.[1] || missingColumnMatch?.[1] || null;
                  if (col && ocPayload.hasOwnProperty(col)) {
                    delete ocPayload[col];
                    continue;
                  }
                  break; // Not a missing column error; exit loop
                }
                if (!inserted) {
                  // Final fallback: ultra-minimal payload (only message)
                  const minimal = {
                    message: `[Manual Coins] ${messageText}`,
                  };
                  const { error: finalErr } = await supabase
                    .from('officer_chats')
                    .insert(minimal);
                  if (finalErr) throw finalErr;
                }
              } else {
                throw e;
              }
            }

            // Additional fallback: notify admin via Notifications so it always surfaces in UI
            try {
              let notif = {
                user_id: admin.id,
                type: 'message',
                title: 'Manual Coins Payment Submitted',
                message: `User ${currentUser.full_name || currentUser.username || currentUser.email} submitted a manual payment. Verification Code: ${verification_code}.`,
                link_url: createPageUrl('Messages'),
                is_read: false,
                created_date: new Date().toISOString(),
              };
              let notified = false;
              for (let attempt = 0; attempt < 6 && !notified; attempt++) {
                const { error: nErr } = await supabase
                  .from('notifications')
                  .insert(notif);
                if (!nErr) { notified = true; break; }
                const m = String(nErr?.message || nErr);
                const schemaCacheMatch = m.match(/Could not find the '([^']+)' column of 'notifications' in the schema cache/i);
                const missingColumnMatch = m.match(/column\s+"?(\w+)"?\s+does not exist/i);
                const col = schemaCacheMatch?.[1] || missingColumnMatch?.[1] || null;
                if (col && Object.prototype.hasOwnProperty.call(notif, col)) {
                  delete notif[col];
                  continue;
                }
                break;
              }
              if (!notified) {
                const minimalNotif = {
                  user_id: admin.id,
                  message: `[Manual Coins] ${messageText}`,
                  type: 'message',
                  link_url: createPageUrl('Messages'),
                };
                const { error: finalNotifErr } = await supabase
                  .from('notifications')
                  .insert(minimalNotif);
                if (finalNotifErr) {
                  // Non-blocking: if notifications table is missing entirely, ignore
                  const msgN = String(finalNotifErr?.message || finalNotifErr);
                  if (!msgN.includes('schema cache') && !msgN.includes('relation')) throw finalNotifErr;
                }
              }
            } catch (_) {
              // Swallow notifications errors; primary path already messaged via DM or officer chat
            }
          }

          // Try to update conversation metadata, but fall back gracefully if columns are missing
          try {
            const isP1 = conversation?.participant1_id === currentUser.id;
            const updateObj = {
              last_message: messageText.substring(0, 100),
              last_message_time: new Date().toISOString(),
              ...(isP1
                ? { unread_count_p2: (conversation?.unread_count_p2 || 0) + 1 }
                : { unread_count_p1: (conversation?.unread_count_p1 || 0) + 1 }
              ),
            };
            const { error: upErr } = await supabase
              .from('conversations')
              .update(updateObj)
              .eq('id', convId);
            if (upErr) throw upErr;
          } catch (e) {
            const msg = e?.message || String(e);
            // Ignore schema-cache/column-missing errors to avoid blocking flow
            if (
              msg.includes("schema cache") ||
              msg.includes("Could not find the 'last_message' column") ||
              msg.includes("last_message_time") ||
              msg.includes("unread_count_p1") ||
              msg.includes("unread_count_p2")
            ) {
              console.warn("Conversation metadata columns missing; skipping update.");
            } else {
              // Re-throw unexpected errors
              throw e;
            }
          }
        }
      }

      toast.success("Receipt submitted. A conversation with admin was created.");
      // Navigate to Messages so the user can see the DM thread
      navigate(createPageUrl("Messages"));
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Failed to submit manual payment");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#1a0a1f] to-[#0a0a0f] p-6 md:p-8">
      <div className="max-w-2xl mx-auto">
        <Card className="bg-[#1a1a24] border-[#2a2a3a] p-6">
          <h2 className="text-2xl font-bold text-white mb-2">Manual Coins Payment</h2>
          <p className="text-gray-400 text-sm mb-6">
            Send funds via Cash App to <span className="text-white font-semibold">$TrollCityLLC</span>, then upload a receipt screenshot.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-[#0a0a0f] rounded-lg p-4 border border-[#2a2a3a]">
              <p className="text-gray-300 text-sm">Send via Cash App</p>
              <p className="text-white font-bold">$TrollCityLLC</p>
            </div>

            <div>
              <label className="text-white text-sm mb-1 block">Receipt screenshot (images only)</label>
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="bg-[#0a0a0f] border-[#2a2a3a] text-white"
              />
            </div>

            <div className="flex items-center justify-between">
              <Badge className="bg-blue-600">Manual Review</Badge>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-green-600 hover:bg-green-700"
              >
                {submitting ? "Submitting..." : "Submit & Message Admin"}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
