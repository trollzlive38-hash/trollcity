
import React, { useState, useEffect } from "react";
import { supabase } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
  import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, Users, DollarSign, FileText, CheckCircle, XCircle, Clock, AlertCircle, Ban, Crown, Coins, Bell, TrendingUp, ShoppingCart, CreditCard, RefreshCw, Loader2, Radio, Eye, Sparkles } from "lucide-react";
  import { toast } from "sonner";
  import SystemHealthPanel from "@/components/admin/SystemHealthPanel";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Link, useNavigate } from "react-router-dom"; // Added useNavigate
import { createPageUrl } from "@/utils";
import { getCurrentUserProfile } from "@/api/supabaseHelpers";
import { executeCommand, UNIVERSAL_COMMAND_PROMPT } from "@/api/commandEngine";

import AccessDenied from "@/components/AccessDenied"; // 👈 create this or use your existing denied UI
import { useAppConfig } from "@/context/AppConfigContext";
import { safeFormatDate, safeToLocaleString, formatCurrency } from "@/lib/utils";
// Removed dropdown menu in favor of two visible navigation sections

export default function AdminDashboard() {
  const queryClient = useQueryClient();
  const navigate = useNavigate(); // Initialize useNavigate
  const { applyLocalConfig, refresh } = useAppConfig();
  // ✅ Get current user profile for admin gating
  const { data: user, isLoading } = useQuery({
    queryKey: ["currentUser"],
    queryFn: getCurrentUserProfile,
  });

  // Disable actions when Supabase is not configured
  const supabaseConfigError = typeof window !== 'undefined' ? window.__SUPABASE_CONFIG_ERROR__ : null;
  const actionsDisabled = !supabase.__isConfigured || !!supabaseConfigError;

  // Helper: resolve role from profile (supports `role` or `user_role`)
  const getRole = (u) => (u?.role ?? u?.user_role ?? null);

  // Helper: map legacy entity names to table names for supabase.from fallback
  const tableMap = {
    TrollOfficerApplication: "troll_officer_applications",
    TrollFamilyApplication: "troll_family_applications",
    Payout: "payouts",
    // Profiles table stores user fields in this project
    User: "profiles",
    CoinPurchase: "coin_purchases",
    ModerationAction: "moderation_actions",
    ModerationSettings: "moderation_settings",
  };

  // Safe list helper using supabase.from
  const listTable = async (entityName, order = null, limit = null) => {
    const table = tableMap[entityName];
    if (!table) return [];
    let query = supabase.from(table).select("*");
    if (order && order.startsWith("-")) {
      query = query.order(order.slice(1), { ascending: false });
    } else if (order) {
      query = query.order(order, { ascending: true });
    }
    if (limit) {
      query = query.limit(limit);
    }
    const { data, error } = await query;
    if (error) {
      console.warn(`Error listing ${table}:`, error.message);
      return [];
    }
    return data || [];
  };

  // Safe filter helper using supabase.from
  const filterTable = async (entityName, conditions = {}) => {
    const table = tableMap[entityName];
    if (!table) return [];
    let query = supabase.from(table).select("*");
    Object.entries(conditions).forEach(([k, v]) => {
      query = query.eq(k, v);
    });
    const { data, error } = await query;
    if (error) {
      console.warn(`Error filtering ${table}:`, error.message);
      return [];
    }
    return data || [];
  };

  // Avoid early returns that change hook order; compute flags instead
  const isAdmin = !!user && getRole(user) === "admin";
  // Effective admin flag: respects UI override to allow admin-only queries/actions
  const effectiveIsAdmin = isAdmin || adminOverrideEnabled;
  const loading = isLoading;
  // Admin override to bypass disabled actions when Supabase is misconfigured
  const [adminOverrideEnabled, setAdminOverrideEnabled] = useState(false);
  const effectiveActionsDisabled = actionsDisabled && !(isAdmin && adminOverrideEnabled);
  const [selectedApp, setSelectedApp] = useState(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [banReason, setBanReason] = useState("");
  const [banDuration, setBanDuration] = useState("permanent");
  const [manualPayoutUser, setManualPayoutUser] = useState(null);
  const [manualPayoutAmount, setManualPayoutAmount] = useState("");
  const [addCoinsUserId, setAddCoinsUserId] = useState(null);
  const [addCoinsAmount, setAddCoinsAmount] = useState("");
  const [addCoinsCoinType, setAddCoinsCoinType] = useState("free");
  const [addLevelUserId, setAddLevelUserId] = useState(null);
  const [addLevelAmount, setAddLevelAmount] = useState("");
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [revenueShareUserId, setRevenueShareUserId] = useState(null);
  const [revenueSharePercentage, setRevenueSharePercentage] = useState("");
  const [activeTab, setActiveTab] = useState("connections");
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [deleteHandle, setDeleteHandle] = useState("");

  // NEW: Per-user purchase history dialog state
  const [viewPurchasesUserId, setViewPurchasesUserId] = useState(null);

  const [paymentVerificationResult, setPaymentVerificationResult] = useState(null);
  const [isVerifyingPayments, setIsVerifyingPayments] = useState(false);

  const [agoraVerificationResult, setAgoraVerificationResult] = useState(null);
  const [isVerifyingAgora, setIsVerifyingAgora] = useState(false);

  const [reconciliationResult, setReconciliationResult] = useState(null);
  const [isReconciling, setIsReconciling] = useState(false);

  const [supabaseVerificationResult, setSupabaseVerificationResult] = useState(null);
  const [isVerifyingSupabase, setIsVerifyingSupabase] = useState(false);

  // NEW: Payout search state
  const [payoutSearchQuery, setPayoutSearchQuery] = useState("");
  const [payoutUserSuggestions, setPayoutUserSuggestions] = useState([]);

  // user is already fetched above

  const { data: applications = [] } = useQuery({
    queryKey: ['trollOfficerApplications'],
    queryFn: () =>
      supabase.entities?.TrollOfficerApplication?.list
        ? supabase.entities.TrollOfficerApplication.list("-created_date")
        : listTable('TrollOfficerApplication', "-created_date"),
    initialData: [],
    enabled: getRole(user) === "admin",
  });

  // Quick action: elevate current user to admin
  const makeMeAdminMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("No current user found");
      const response = await supabase.functions.invoke('assignadmin', {
        body: { userId: user.id },
      });
      if (response.error) throw new Error(response.error.message || 'Failed to assign admin');
      if (!response.data?.success) throw new Error(response.data?.error || 'Admin assignment failed');
      return response.data;
    },
    onSuccess: () => {
      toast.success("You are now an admin.");
      queryClient.invalidateQueries({ queryKey: ["currentUser"] });
    },
    onError: (err) => {
      toast.error(err?.message || "Failed to grant admin role");
    },
  });

  // NEW: Query for Troll Family Applications
  const { data: familyApplications = [] } = useQuery({
    queryKey: ['trollFamilyApplications'],
    queryFn: () =>
      supabase.entities?.TrollFamilyApplication?.list
        ? supabase.entities.TrollFamilyApplication.list("-created_at")
        : listTable('TrollFamilyApplication', "-created_at"),
    initialData: [],
    enabled: getRole(user) === "admin",
  });

  // Realtime: refresh Users on new profiles
  useEffect(() => {
    if (!isAdmin) return;
    const channel = supabase
      .channel('profiles-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profiles' }, (payload) => {
        console.log('🟣 New user signed up:', payload.new);
        queryClient.invalidateQueries(['adminAllUsers']);
      })
      .subscribe();
    return () => { try { supabase.removeChannel(channel); } catch {} };
  }, [isAdmin]);

  // Realtime: refresh family applications on new INSERTs
  useEffect(() => {
    if (!isAdmin) return;
    const channel = supabase
      .channel('family-applications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'troll_family_applications' }, (payload) => {
        console.log('🟣 New Troll Family Application:', payload.new);
        queryClient.invalidateQueries(['trollFamilyApplications']);
      })
      .subscribe();
    return () => { try { supabase.removeChannel(channel); } catch {} };
  }, [isAdmin]);

  const { data: payouts = [] } = useQuery({
    queryKey: ['allPayouts'],
    queryFn: () =>
      supabase.entities?.Payout?.list
        ? supabase.entities.Payout.list("-created_date")
        : listTable('Payout', "-created_date"),
    initialData: [],
    enabled: getRole(user) === "admin",
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['adminAllUsers'],
    queryFn: () =>
      supabase.entities?.User?.list
        ? supabase.entities.User.list("-created_at", 1000)
        : listTable('User', "-created_at", 1000),
    initialData: [],
    enabled: getRole(user) === "admin",
    refetchInterval: 2000, // Live updates for user balances
  });

  // Per-user purchases for dialog
  const { data: userPurchases = [], isFetching: isLoadingUserPurchases } = useQuery({
    queryKey: ['userPurchases', viewPurchasesUserId],
    enabled: !!viewPurchasesUserId && getRole(user) === 'admin',
    queryFn: async () => {
      if (!viewPurchasesUserId) return [];
      const { data, error } = await supabase
        .from('coin_purchases')
        .select('*')
        .eq('user_id', viewPurchasesUserId)
        .order('created_date', { ascending: false })
        .limit(100);
      if (error) {
        console.warn('Error fetching user purchases:', error.message);
        return [];
      }
      return data || [];
    },
  });

  // Ensure current admin user is always present in user lists (even if older than recent fetch window)
  const allUsersWithCurrent = React.useMemo(() => {
    if (!user) return allUsers;
    const exists = (allUsers || []).some(u => u.id === user.id);
    const merged = exists ? allUsers : [user, ...(allUsers || [])];
    // Deduplicate by id in case of overlap
    const seen = new Set();
    return merged.filter(u => {
      if (seen.has(u.id)) return false;
      seen.add(u.id);
      return true;
    });
  }, [allUsers, user]);

  // Filtered users for search by username, full name, or email
  const filteredUsers = (allUsersWithCurrent || []).filter((u) => {
    if (!userSearchQuery) return true;
    const q = userSearchQuery.toLowerCase();
    return (
      (u.username?.toLowerCase().includes(q)) ||
      (u.full_name?.toLowerCase().includes(q)) ||
      (u.email?.toLowerCase().includes(q))
    );
  });

  // Server-side search across entire profiles table to ensure older users (including admin) are found
  const isActiveSearch = userSearchQuery.trim().length >= 2;
  const { data: searchedUsers = [], isFetching: isSearchingUsers } = useQuery({
    queryKey: ['adminUsersSearch', userSearchQuery],
    queryFn: async () => {
      const q = userSearchQuery.trim();
      if (!q) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .or(`username.ilike.%${q}%,full_name.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(50);
      if (error) {
        console.warn('Error searching users:', error.message);
        return [];
      }
      return data || [];
    },
    enabled: isAdmin && isActiveSearch,
  });
  const displayUsers = isActiveSearch ? searchedUsers : filteredUsers;

  const { data: allPayouts = [] } = useQuery({
    queryKey: ['adminAllPayouts'],
    queryFn: () =>
      supabase.entities?.Payout?.list
        ? supabase.entities.Payout.list("-created_date", 500)
        : listTable('Payout', "-created_date", 500),
    initialData: [],
    enabled: getRole(user) === "admin",
  });

  // NEW: Query for all coin purchases
  const { data: allCoinPurchases = [] } = useQuery({
    queryKey: ['adminAllCoinPurchases'],
    queryFn: () =>
      supabase.entities?.CoinPurchase?.list
        ? supabase.entities.CoinPurchase.list("-created_date", 500)
        : listTable('CoinPurchase', "-created_date", 500),
    initialData: [],
    enabled: getRole(user) === "admin",
    refetchInterval: 2000, // Update every 2 seconds for live updates
  });

  // Create a test Troll Family application for verification
  const createTestFamilyApplicationMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("No current user");
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const name = `Test Family ${ts.slice(0, 19)}`;
      const values = {
        user_id: user.id,
        family_name: name,
        family_description: 'Admin test application',
        status: 'pending',
      };
      const { data, error } = await supabase
        .from('troll_family_applications')
        .insert(values)
        .select('*');
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('✅ Test Troll Family application sent');
      queryClient.invalidateQueries(['trollFamilyApplications']);
    },
    onError: (error) => {
      toast.error(error?.message || 'Failed to send test application');
    }
  });

  // Delete an approved Troll Family (remove application and clear owner profile flags)
  const deleteFamilyApplicationMutation = useMutation({
    mutationFn: async (appId) => {
      // Fetch application to obtain owner
      const { data: appRows, error: fetchErr } = await supabase
        .from('troll_family_applications')
        .select('*')
        .eq('id', appId)
        .limit(1);
      if (fetchErr) throw fetchErr;
      const app = (appRows || [])[0];

      // Delete the application
      const { error: delErr } = await supabase
        .from('troll_family_applications')
        .delete()
        .eq('id', appId);
      if (delErr) throw delErr;

      // Clear owner profile flags if available
      if (app?.user_id) {
        try {
          await supabase
            .from('profiles')
            .update({ owns_troll_family: false, troll_family_id: null, troll_family_name: null })
            .eq('id', app.user_id);
        } catch (e) {
          console.warn('Failed to clear owner profile after family delete:', e?.message || e);
        }
      }

      return { ok: true };
    },
    onSuccess: () => {
      toast.success('🗑️ Troll family deleted');
      queryClient.invalidateQueries(['trollFamilyApplications']);
      queryClient.invalidateQueries(['adminAllUsers']);
    },
    onError: (error) => {
      toast.error(error?.message || 'Failed to delete family');
    }
  });

  // Cancel a Troll Family application (any status)
  const cancelFamilyApplicationMutation = useMutation({
    mutationFn: async (appId) => {
      // Reuse delete logic; for pending/rejected there are no profile flags to clear
      return await deleteFamilyApplicationMutation.mutateAsync(appId);
    },
    onSuccess: () => {
      toast.success('🚫 Troll family application cancelled');
      queryClient.invalidateQueries(['trollFamilyApplications']);
    },
    onError: (error) => {
      toast.error(error?.message || 'Failed to cancel family application');
    }
  });

  // Auto-backfill: ensure all users have a canonical role in real-time
  const backfillRolesMutation = useMutation({
    mutationFn: async (usersNeedingRole) => {
      for (const u of usersNeedingRole) {
        // Try updating 'role' first; fallback to legacy 'user_role'
        const { error } = await supabase
          .from('profiles')
          .update({ role: 'user' })
          .eq('id', u.id);
        if (error) {
          await supabase
            .from('profiles')
            .update({ user_role: 'user' })
            .eq('id', u.id)
            .catch(() => {});
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['adminAllUsers']);
    }
  });

  React.useEffect(() => {
    if (!Array.isArray(allUsers) || allUsers.length === 0) return;
    // Find users with missing role information
    const needingRole = allUsers.filter((u) => !u.role && !u.user_role);
    if (needingRole.length > 0 && getRole(user) === 'admin' && !backfillRolesMutation.isLoading) {
      backfillRolesMutation.mutate(needingRole);
    }
  }, [allUsers, user]);

  const { data: moderationActions = [] } = useQuery({
    queryKey: ['moderationActions'],
    queryFn: () =>
      supabase.entities?.ModerationAction?.list
        ? supabase.entities.ModerationAction.list("-created_date", 100)
        : listTable('ModerationAction', "-created_date", 100),
    initialData: [],
    enabled: effectiveIsAdmin,
  });

  const { data: moderationSettings = [] } = useQuery({
    queryKey: ['moderationSettings'],
    queryFn: () =>
      supabase.entities?.ModerationSettings?.filter
        ? supabase.entities.ModerationSettings.filter({ setting_key: 'global_moderation' })
        : filterTable('ModerationSettings', { setting_key: 'global_moderation' }),
    initialData: [],
    enabled: effectiveIsAdmin,
  });

  // Local, optimistic settings state to ensure dropdowns and toggles take effect immediately
  const defaultModerationSettings = {
    enabled: true,
    auto_delete_enabled: true,
    auto_delete_threshold: 'high',
    notify_admins: true,
    notify_threshold: 'medium',
    strict_mode: false,
  };
  const [moderationSettingsState, setModerationSettingsState] = React.useState(defaultModerationSettings);
  React.useEffect(() => {
    const server = moderationSettings[0];
    if (server && typeof server === 'object') {
      setModerationSettingsState({ ...defaultModerationSettings, ...server });
    }
  }, [Array.isArray(moderationSettings) ? moderationSettings.length : moderationSettings]);

  // Realtime: auto-refresh admin user list when new profiles are created
  useEffect(() => {
    if (getRole(user) !== 'admin') return;
    const channel = supabase
      .channel('profiles-changes-admin')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'profiles' },
        () => {
          try { queryClient.invalidateQueries(['adminAllUsers']); } catch {}
        }
      )
      .subscribe();

    return () => {
      try { supabase.removeChannel(channel); } catch {}
    };
  }, [user?.id]);

  const updateModerationSettingsMutation = useMutation({
    mutationFn: async (settings) => {
      const existing = moderationSettings[0];
      if (existing?.id) {
        const { error } = await supabase
          .from('moderation_settings')
          .update(settings)
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const payload = { setting_key: 'global_moderation', ...settings };
        const { error } = await supabase
          .from('moderation_settings')
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      // Optimistically reflect the server-accepted settings in local state
      if (variables && typeof variables === 'object') {
        setModerationSettingsState((prev) => ({ ...prev, ...variables }));
      }
      queryClient.invalidateQueries(['moderationSettings']);
      toast.success("Moderation settings updated");
    },
    onError: (error) => {
      const msg = String(error?.message || error || 'Failed to update settings');
      toast.error(msg);
    }
  });

  const reviewModerationMutation = useMutation({
    mutationFn: async ({ actionId, falsePositive, adminNotes }) => {
      const { error } = await supabase
        .from('moderation_actions')
        .update({
          reviewed_by_admin: true,
          false_positive: falsePositive,
          admin_notes: adminNotes,
        })
        .eq('id', actionId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['moderationActions']);
      toast.success("Moderation action reviewed");
    },
    onError: (error) => {
      const msg = String(error?.message || error || 'Failed to review moderation');
      toast.error(msg);
    }
  });

  // NEW: Cancel purchase mutation
  const cancelPurchaseMutation = useMutation({
    mutationFn: async (purchaseId) => {
      await supabase.entities.CoinPurchase.update(purchaseId, {
        status: 'cancelled'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['adminAllCoinPurchases']);
      toast.success("Purchase cancelled");
    },
    onError: (error) => {
      toast.error("Failed to cancel purchase");
    }
  });

  // NEW: Delete payout mutation
  const deletePayoutMutation = useMutation({
    mutationFn: async (payoutId) => {
      if (!confirm('Permanently delete this payout record?')) {
        throw new Error('Cancelled');
      }
      await supabase.entities.Payout.delete(payoutId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['allPayouts']);
      queryClient.invalidateQueries(['adminAllPayouts']);
      toast.success("Payout deleted");
    },
    onError: (error) => {
      if (error.message !== 'Cancelled') {
        toast.error("Failed to delete payout");
      }
    }
  });

  // Calculate comprehensive revenue statistics
  const calculateRevenue = () => {
    const completedPayouts = allPayouts.filter(p => p.status === "completed");
    const totalPayoutsAmount = completedPayouts.reduce((sum, p) => sum + (p.payout_amount || 0), 0);
    const totalFeesCollected = completedPayouts.reduce((sum, p) => sum + (p.fee_amount || 0), 0);

    // Calculate from actual coin purchases
    const completedPurchases = allCoinPurchases.filter(p => p.status === 'completed');
    const totalPurchasedCoins = completedPurchases.reduce((sum, p) => sum + (p.coin_amount || 0), 0);
    const totalCoinsRevenue = completedPurchases.reduce((sum, p) => sum + (p.usd_amount || 0), 0);

    // Calculate from user balances (live data)
    const totalFreeCoins = allUsers.reduce((sum, u) => sum + (u.free_coins || 0), 0);
    const totalEarnedCoins = allUsers.reduce((sum, u) => sum + (u.earned_coins || 0), 0);
    const totalUserPurchasedCoins = allUsers.reduce((sum, u) => sum + (u.purchased_coins || 0), 0);
    const totalCoins = allUsers.reduce((sum, u) => sum + (u.coins || 0), 0);

    // Platform profit = Coin sales revenue - Payouts made
    const platformProfit = totalCoinsRevenue - totalPayoutsAmount;

    // Average purchase per user
    const usersWhoPurchased = new Set(completedPurchases.map(p => p.user_id)).size;
    const avgPurchasePerUser = usersWhoPurchased > 0 ? totalCoinsRevenue / usersWhoPurchased : 0;

    // Total value of all coins in circulation
    const totalCoinsValue = totalCoins * 0.00625;
    const earnedCoinsValue = totalEarnedCoins * 0.00625;
    const purchasedCoinsValue = totalUserPurchasedCoins * 0.00625;

    return {
      totalPayoutsAmount,
      totalFeesCollected,
      totalCoinsRevenue,
      totalPurchasedCoins,
      totalUserPurchasedCoins,
      totalFreeCoins,
      totalEarnedCoins,
      totalCoins,
      platformProfit,
      usersWhoPurchased,
      avgPurchasePerUser,
      totalCoinsValue,
      earnedCoinsValue,
      purchasedCoinsValue,
      totalPurchases: completedPurchases.length
    };
  };

  const revenue = calculateRevenue();

  // Client-only PayPal checkout test (no Edge Function)
  const [isRunningClientPayPalTest, setIsRunningClientPayPalTest] = useState(false);
  const loadPayPalSdk = async () => {
    if (window.paypal) return true;
    const cid = import.meta.env.VITE_PAYPAL_CLIENT_ID;
    if (!cid) {
      toast.error('Missing VITE_PAYPAL_CLIENT_ID');
      return false;
    }

    // Remove any stale SDK scripts before injecting a new one
    [...document.querySelectorAll('script[src*="paypal.com/sdk/js"],[data-pp-sdk]')].forEach((el) => el.parentNode?.removeChild(el));

    const params = new URLSearchParams({
      'client-id': encodeURIComponent(cid),
      currency: 'USD',
      intent: 'capture',
      components: 'buttons'
    });

    const src = `https://www.paypal.com/sdk/js?${params.toString()}`;
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = (e) => {
        console.error('PayPal SDK load error', e, src);
        toast.error('Failed to load PayPal SDK. Check ad-blockers/network.');
        resolve(false);
      };
      document.body.appendChild(script);
    });
  };

  const runClientCheckoutTest = async () => {
    setIsRunningClientPayPalTest(true);
    const ok = await loadPayPalSdk();
    if (!ok) { setIsRunningClientPayPalTest(false); return; }
    try {
      toast.loading('Initializing PayPal Buttons...', { id: 'paypal-client-test' });
      const containerId = '#paypal-client-test-container';
      const container = document.querySelector(containerId);
      if (!container) {
        toast.error('Test container not found');
        setIsRunningClientPayPalTest(false);
        return;
      }
      container.innerHTML = '';
      window.paypal.Buttons({
        style: { layout: 'horizontal', color: 'blue', shape: 'rect', label: 'paypal' },
        createOrder: (data, actions) => {
          return actions.order.create({
            purchase_units: [{ amount: { value: '0.01' } }]
          });
        },
        onApprove: async (data, actions) => {
          try {
            const capture = await actions.order.capture();
            toast.success('Client checkout completed', { id: 'paypal-client-test' });
            console.log('PayPal capture:', capture);
          } catch (e) {
            console.error('Capture error', e);
            toast.error('Capture failed');
          }
        },
        onError: (err) => {
          console.error('PayPal Buttons error', err);
          toast.error('PayPal checkout error', { id: 'paypal-client-test' });
        }
      }).render(containerId);
    } finally {
      setIsRunningClientPayPalTest(false);
    }
  };

  const verifyPaymentSystems = async () => {
    setIsVerifyingPayments(true);
    setPaymentVerificationResult(null);

    toast.loading("Checking PayPal client configuration...", { id: 'verify-payments' });

    const cid = import.meta.env.VITE_PAYPAL_CLIENT_ID;
    const mode = import.meta.env.VITE_PAYPAL_MODE || 'sandbox';
    const hasClientId = !!cid;

    const result = {
      source: 'fallback', // client-only check; no Edge Function
      results: {
        paypal: {
          status: hasClientId ? 'needs_attention' : 'not_configured',
          details: hasClientId
            ? { message: mode === 'Live' || mode === 'live'
                ? 'Client ID detected; server secrets required for Live processing'
                : 'Client ID detected (sandbox); client-only mode', mode }
            : { error: 'Missing VITE_PAYPAL_CLIENT_ID', mode }
        }
      }
    };

    setPaymentVerificationResult(result);
    toast.dismiss('verify-payments');

    if (!hasClientId) {
      toast.error('Missing VITE_PAYPAL_CLIENT_ID');
    } else if ((mode === 'Live' || mode === 'live')) {
      // No toast in live mode to avoid persistent warning in Admin
    } else {
      toast.success('PayPal client configured for sandbox (no server calls)');
    }

    setIsVerifyingPayments(false);
  };

  const verifyAgoraConnection = async () => {
    setIsVerifyingAgora(true);
    setAgoraVerificationResult(null);

    try {
      toast.loading("Checking Agora client configuration...", { id: 'verify-agora' });

      const appId = import.meta.env.VITE_AGORA_APP_ID;
      const hasAppId = !!appId;

      const result = {
        source: 'fallback',
        results: {
          agora: {
            status: hasAppId ? 'connected' : 'not_configured',
            details: hasAppId
              ? { message: 'Agora App ID present; server token required for streaming', appId }
              : { error: 'Missing VITE_AGORA_APP_ID' }
          }
        }
      };

      setAgoraVerificationResult(result);
      toast.dismiss('verify-agora');

      if (!hasAppId) {
        toast.error('Missing VITE_AGORA_APP_ID');
      }
    } catch (e) {
      console.error('verifyAgoraConnection error', e);
      toast.dismiss('verify-agora');
      toast.error(e?.message || 'Failed to check Agora config');
    } finally {
      setIsVerifyingAgora(false);
    }
  };

  const verifySupabaseConnection = async () => {
    setIsVerifyingSupabase(true);
    setSupabaseVerificationResult(null);

    try {
      // Skip server calls when offline or Supabase not configured
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setSupabaseVerificationResult({ source: 'client', results: { supabase: { status: 'offline', details: { error: 'Device offline' } } } });
        toast.warning('Offline — skipping DB test');
        return;
      }
      const urlOk = !!import.meta.env.VITE_SUPABASE_URL;
      const keyOk = !!import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!urlOk || !keyOk || (typeof window !== 'undefined' && window.__SUPABASE_CONFIG_ERROR__)) {
        setSupabaseVerificationResult({ source: 'client', results: { supabase: { status: 'not_configured', details: { error: 'Supabase not configured' } } } });
        toast.warning('Supabase not configured — skipping DB test');
        return;
      }
      toast.loading("Testing Supabase connection...", { id: 'verify-supabase' });

      const response = await supabase.functions.invoke('testSupabaseConnection', { body: {} });

      console.log('Supabase Verification Response:', response?.data);

      toast.dismiss('verify-supabase');

      const runSupabaseFallback = async () => {
        try {
          const { data, count, error } = await supabase
            .from('profiles')
            .select('id', { count: 'exact' })
            .limit(1);
          if (error) throw error;
          return {
            source: 'fallback',
            results: {
              supabase: {
                status: 'connected',
                details: {
                  message: 'Supabase query succeeded',
                  user_profiles_count: typeof count === 'number' ? count : (data?.length || 0)
                }
              }
            }
          };
        } catch (e) {
          const url = import.meta.env.VITE_SUPABASE_URL;
          const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
          const configured = !!url && !!anon;
          return {
            source: 'fallback',
            results: {
              supabase: {
                status: configured ? 'needs_attention' : 'not_configured',
                details: {
                  error: e?.message || 'Connection failed',
                  message: configured ? 'Supabase reachable but query failed' : 'Missing VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY'
                }
              }
            }
          };
        }
      };

      if (response?.data) {
        setSupabaseVerificationResult({ ...response.data, source: 'edge' });

        if (response.data.results?.supabase?.status === 'connected') {
          toast.success("✅ Supabase database connected!");
        } else if (response.data.results?.supabase?.status === 'not_configured') {
          toast.warning("⚠️ Supabase not configured");
        } else {
          toast.warning("⚠️ Supabase needs attention");
        }
      } else {
        // Fallback
        const fb = await runSupabaseFallback();
        setSupabaseVerificationResult(fb);
        toast.warning("⚠️ Using local Supabase fallback (direct query)");
      }
    } catch (error) {
      console.error('Supabase verification error:', error);
      toast.dismiss('verify-supabase');
      const fb = await runSupabaseFallback();
      setSupabaseVerificationResult(fb);
      toast.error(`Test failed: ${error.message}. Used local fallback.`);
    } finally {
      setIsVerifyingSupabase(false);
    }
  };

  // Agora server test: call generateAgoraToken edge function
  const [agoraServerTestResult, setAgoraServerTestResult] = useState(null);
  const [isRunningAgoraServerTest, setIsRunningAgoraServerTest] = useState(false);
  const runAgoraServerTest = async () => {
    setIsRunningAgoraServerTest(true);
    setAgoraServerTestResult(null);
    try {
      toast.loading('Contacting Agora server...', { id: 'agora-server-test' });
      const channelName = user?.id ? `admin_${user.id}_${Date.now()}` : `admin_test_${Date.now()}`;
      // Include apikey header to satisfy some deployments' preflight/CORS checks
      const { generateAgoraToken } = await import('../api/agora.js');
      const data = await generateAgoraToken(channelName, 'publisher', user?.id || 1);
      console.log('Agora server test raw data (direct-fetch):', data);
      toast.dismiss('agora-server-test');
      // Normalize common response shapes from different implementations
      let normalizedAppId = data?.appId ?? data?.agoraAppId ?? import.meta.env.VITE_AGORA_APP_ID;
      let normalizedToken = data?.token ?? data?.rtcToken ?? data?.data?.token ?? null;
      let normalizedUid = data?.uid ?? data?.userId ?? data?.data?.uid ?? null;

      if (normalizedAppId && normalizedToken) {
        setAgoraServerTestResult({ source: 'edge', status: 'connected', details: { message: 'Token generated successfully', uid: normalizedUid } });
        toast.success('✅ Agora server reachable');
      } else {
        // If first attempt didn't return usable data, try common alternate function name (lowercase)
        // No fallback needed; direct fetch already targets the functions domain correctly

        // Build detailed reason instead of generic 'Unexpected response'
        let reason = '';
        const keys = data ? Object.keys(data) : [];

        if (!data) {
          reason = 'No data returned from edge function. Possible CORS/preflight failure or non-JSON response.';
        } else if (typeof data === 'string') {
          reason = 'Function returned text; expected JSON with { appId, token, uid }.';
        } else if (data?.error) {
          const errVal = data.error;
          reason = typeof errVal === 'string' ? errVal : (errVal?.message || JSON.stringify(errVal));
        } else if (Array.isArray(data?.tests)) {
          const failures = (data.tests || []).filter(t => t?.ok === false || t?.status === 'fail');
          reason = failures.length
            ? `One or more tests failed: ${failures.map(f => f?.name || 'unnamed').join(', ')}`
            : 'Tests array present but could not determine success.';
        } else if (!normalizedToken) {
          reason = `Missing token in response. Expected 'token' or 'rtcToken'. Received keys: ${keys.join(', ')}`;
        } else if (!normalizedAppId) {
          reason = `Missing appId in response. Expected 'appId'. Using client fallback: ${import.meta.env.VITE_AGORA_APP_ID || 'unset'}`;
        } else {
          reason = `Unexpected response shape. Received keys: ${keys.join(', ')}`;
        }

        setAgoraServerTestResult({ source: 'edge', status: 'needs_attention', details: { error: reason, raw: data } });
        toast.warning('⚠️ Agora server test needs attention');
      }
    } catch (error) {
      console.error('Agora server test error:', error);
      toast.dismiss('agora-server-test');
      setAgoraServerTestResult({ source: 'edge', status: 'not_configured', details: { error: error?.message || 'Request failed' } });
      toast.error(`Agora server test failed: ${error?.message || 'Request failed'}`);
    } finally {
      setIsRunningAgoraServerTest(false);
    }
  };

  // Stripe server test: call testStripeConnection edge function
  const [paypalServerTestResult, setPayPalServerTestResult] = useState(null);
  const [isRunningPayPalServerTest, setIsRunningPayPalServerTest] = useState(false);
  const runPayPalServerTest = async () => {
    setIsRunningPayPalServerTest(true);
    setPayPalServerTestResult(null);
    try {
      toast.loading('Contacting Stripe server...', { id: 'stripe-server-test' });
      const { data } = await supabase.functions.invoke(
        'teststripeconnection',
        { body: {}, headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY } }
      );
      toast.dismiss('stripe-server-test');
      const isSuccess = !!(
        data && (
          data.overallStatus === '✅ OK' ||
          data.status === 'ok' ||
          data.ok === true
        )
      );

      if (isSuccess) {
        const mode = data?.mode || (Array.isArray(data?.tests) ? data.tests.find(t => t?.name?.toLowerCase().includes('mode'))?.result : undefined);
        setPayPalServerTestResult({ source: 'edge', status: 'connected', details: { message: 'Server reachable and API authenticated', mode: mode || 'unknown' } });
        toast.success('✅ Stripe server reachable');
      } else {
        const msg = data?.error || (Array.isArray(data?.tests) ? 'One or more tests failed' : 'Unexpected response');
        setPayPalServerTestResult({ source: 'edge', status: 'needs_attention', details: { error: msg, raw: data } });
        toast.warning('⚠️ Stripe server test needs attention');
      }
    } catch (error) {
      console.error('Stripe server test error:', error);
      toast.dismiss('stripe-server-test');
      setPayPalServerTestResult({ source: 'edge', status: 'not_configured', details: { error: error?.message || 'Request failed' } });
      toast.error(`Stripe server test failed: ${error?.message || 'Request failed'}`);
    } finally {
      setIsRunningPayPalServerTest(false);
    }
  };

  const banUserMutation = useMutation({
    mutationFn: async ({ userId, reason, duration }) => {
      const banExpires = duration === "permanent" ? null :
        duration === "1day" ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() :
        duration === "7days" ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() :
        duration === "30days" ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() :
        null;

      await supabase.entities.User.update(userId, {
        is_banned: true,
        ban_reason: reason,
        ban_expires: banExpires,
        banned_by: user.email
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['adminAllUsers']);
      setSelectedUser(null); // Close ban dialog after success
      setBanReason("");
      setBanDuration("permanent"); // Reset ban duration
      toast.success("User banned");
    },
    onError: (error) => {
      console.error("Failed to ban user:", error);
      toast.error("Failed to ban user");
    }
  });

  const unbanUserMutation = useMutation({
    mutationFn: async (userId) => {
      await supabase.entities.User.update(userId, {
        is_banned: false,
        ban_reason: null,
        ban_expires: null,
        banned_by: null
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['adminAllUsers']);
      toast.success("User unbanned");
    },
    onError: (error) => {
      console.error("Failed to unban user:", error);
      toast.error("Failed to unban user");
    }
  });

  // Admin: Delete user (soft-delete + ban to fully disable the account)
  const deleteUserMutation = useMutation({
    mutationFn: async ({ userId }) => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const anonymized = `deleted_${timestamp.slice(0,19)}`;
      await supabase.entities.User.update(userId, {
        is_deleted: true,
        deleted_date: new Date().toISOString(),
        is_banned: true,
        ban_reason: 'Account deleted by admin',
        ban_expires: null,
        banned_by: user?.email || 'admin',
        user_role: 'user',
        role: 'user',
        permissions: [],
        username: anonymized,
        full_name: null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['adminAllUsers']);
      toast.success('User deleted (soft-delete + ban)');
    },
    onError: (error) => {
      console.error('Failed to delete user:', error);
      toast.error(error?.message || 'Failed to delete user');
    }
  });

  const updateUserRoleMutation = useMutation({
    mutationFn: async ({ userId, role, permissions }) => {
      await supabase.entities.User.update(userId, {
        user_role: role,
        permissions: permissions || []
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['adminAllUsers']);
      toast.success("User role updated");
    },
    onError: (error) => {
      console.error("Failed to update user role:", error);
      toast.error("Failed to update role");
    }
  });

  const createManualPayoutMutation = useMutation({
    mutationFn: async ({ userId, amount }) => {
      const userToPayOut = allUsersWithCurrent.find(u => u.id === userId);
      if (!userToPayOut) throw new Error("User not found");

      const usdAmount = parseFloat(amount);
      if (isNaN(usdAmount) || usdAmount <= 0) {
        throw new Error("Invalid payout amount");
      }

      const feePercent = 0.05; // 5% fee
      const feeAmount = usdAmount * feePercent;
      const payoutAmount = usdAmount - feeAmount;

      await supabase.entities.Payout.create({
        user_id: userId,
        user_name: userToPayOut.username || userToPayOut.full_name,
        user_email: userToPayOut.email,
        coin_amount: 0, // Manual payouts might not be tied to coins directly
        usd_amount: usdAmount,
        fee_amount: feeAmount,
        payout_amount: payoutAmount,
        payment_method: userToPayOut.payment_method || "manual",
        payment_details: userToPayOut.payment_email || userToPayOut.payment_username || "Manual payout",
        status: "pending",
        admin_notes: `Manual payout created by admin (${user.email})`
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['allPayouts']);
      queryClient.invalidateQueries(['adminAllPayouts']); // Invalidate the new query too
      setManualPayoutUser(null);
      setManualPayoutAmount("");
      toast.success("Manual payout created");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create payout");
    }
  });

  const addCoinsMutation = useMutation({
    mutationFn: async ({ userId, amount, coinType }) => { // coinType added
      const userToUpdate = allUsersWithCurrent.find(u => u.id === userId);
      if (!userToUpdate) throw new Error("User not found");

      const coinsToAdd = parseFloat(amount);
      if (isNaN(coinsToAdd) || coinsToAdd <= 0) {
        throw new Error("Invalid coin amount. Must be a positive number.");
      }

      const updates = {
        coins: (userToUpdate.coins || 0) + coinsToAdd
      };

      if (coinType === "free") {
        updates.free_coins = (userToUpdate.free_coins || 0) + coinsToAdd;
      } else { // 'paid'
        updates.purchased_coins = (userToUpdate.purchased_coins || 0) + coinsToAdd;
      }

      await supabase.entities.User.update(userId, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['adminAllUsers']);
      setAddCoinsUserId(null);
      setAddCoinsAmount("");
      toast.success("Coins added successfully");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to add coins");
    }
  });

  const addLevelMutation = useMutation({
    mutationFn: async ({ userId, levels }) => {
      const userToUpdate = allUsersWithCurrent.find(u => u.id === userId);
      if (!userToUpdate) throw new Error("User not found");

      const levelsToAdd = parseInt(levels);
      if (isNaN(levelsToAdd) || levelsToAdd <= 0) {
        throw new Error("Invalid level amount. Must be a positive integer.");
      }

      await supabase.entities.User.update(userId, {
        level: (userToUpdate.level || 1) + levelsToAdd
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['adminAllUsers']);
      setAddLevelUserId(null);
      setAddLevelAmount("");
      toast.success("Levels added successfully");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to add levels");
    }
  });

  const reviewApplicationMutation = useMutation({
    mutationFn: async ({ appId, status, notes }) => {
      await supabase.entities.TrollOfficerApplication.update(appId, {
        status: status,
        admin_notes: notes,
        reviewed_by: user.email,
        reviewed_date: new Date().toISOString()
      });

      // If approved, update user to be a troll officer and assign permissions
      if (status === "approved") {
        const app = applications.find(a => a.id === appId);
        if (app) {
          await supabase.entities.User.update(app.user_id, {
            is_troll_officer: true,
            user_role: "troll_officer",
            permissions: ["moderate_chat", "kick_users", "ban_users", "mute_users"] // Assign specific permissions
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['trollOfficerApplications']);
      queryClient.invalidateQueries(['adminAllUsers']);
      setSelectedApp(null);
      setAdminNotes("");
      toast.success("Application reviewed");
    },
    onError: (error) => {
      console.error("Failed to review application:", error);
      toast.error("Failed to review application");
    }
  });

  // Delete/demote a Troll Officer and remove their application
  const deleteOfficerApplicationMutation = useMutation({
    mutationFn: async (appId) => {
      // Fetch the application row to identify the user
      const { data: rows, error: fetchErr } = await supabase
        .from('troll_officer_applications')
        .select('*')
        .eq('id', appId)
        .limit(1);
      if (fetchErr) throw fetchErr;
      const app = (rows || [])[0];

      // Delete the officer application
      const { error: delErr } = await supabase
        .from('troll_officer_applications')
        .delete()
        .eq('id', appId);
      if (delErr) throw delErr;

      // Demote the user and clear permissions/role flags
      if (app?.user_id) {
        try {
          await supabase
            .from('profiles')
            .update({
              is_troll_officer: false,
              user_role: 'user',
              role: 'user',
              permissions: []
            })
            .eq('id', app.user_id);
        } catch (e) {
          console.warn('Failed to demote user after officer delete:', e?.message || e);
        }
      }

      return { ok: true };
    },
    onSuccess: () => {
      toast.success('🗑️ Troll officer deleted and demoted');
      queryClient.invalidateQueries(['trollOfficerApplications']);
      queryClient.invalidateQueries(['adminAllUsers']);
    },
    onError: (error) => {
      toast.error(error?.message || 'Failed to delete officer');
    }
  });

  // Cancel a Troll Officer application (any status)
  const cancelOfficerApplicationMutation = useMutation({
    mutationFn: async (appId) => {
      // Reuse delete logic; if approved, this will also demote
      return await deleteOfficerApplicationMutation.mutateAsync(appId);
    },
    onSuccess: () => {
      toast.success('🚫 Troll officer application cancelled');
      queryClient.invalidateQueries(['trollOfficerApplications']);
    },
    onError: (error) => {
      toast.error(error?.message || 'Failed to cancel officer application');
    }
  });

  const updatePayoutMutation = useMutation({
    mutationFn: async ({ payoutId, status, notes }) => {
      await supabase.entities.Payout.update(payoutId, {
        status: status,
        admin_notes: notes,
        processed_by: user.email,
        processed_date: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['allPayouts']);
      queryClient.invalidateQueries(['adminAllPayouts']); // Invalidate the new query too
      toast.success("Payout updated");
    },
    onError: (error) => {
      console.error("Failed to update payout:", error);
      toast.error("Failed to update payout");
    }
  });

  // AI Message Center state and handlers
  const aiInstructionRef = React.useRef(null);
  const aiOutputRef = React.useRef(null);

  const aiRunMutation = useMutation({
    mutationFn: async (instruction) => {
      const res = await supabase.integrations.Core.InvokeLLM({ prompt: UNIVERSAL_COMMAND_PROMPT(instruction) });
      return res.text;
    },
    onSuccess: async (text) => {
      if (aiOutputRef.current) aiOutputRef.current.textContent = text;
      // Try to parse JSON from the AI output
      let payload = null;
      try {
        const jsonStart = text.indexOf('{');
        const jsonEnd = text.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          const jsonStr = text.slice(jsonStart, jsonEnd + 1);
          payload = JSON.parse(jsonStr);
        }
      } catch {}

      if (payload && typeof payload === 'object') {
        try {
          if (payload.commands || payload.command) {
            await executeCommand(payload, user);
            toast.success('Commands executed');
            try { await refresh(); } catch {}
            queryClient.invalidateQueries(['adminAllUsers']);
            queryClient.invalidateQueries(['adminAllPayouts']);
            queryClient.invalidateQueries(['adminAllCoinPurchases']);
          } else {
            const { error } = await supabase.from('app_configs').upsert({
              key: 'global',
              config: payload,
              updated_at: new Date().toISOString(),
            });
            if (!error) {
              toast.success('Config updated via AI');
              try { await refresh(); } catch {}
            } else {
              try {
                applyLocalConfig(payload);
                toast.warning('Saved locally (DB table missing or blocked).');
              } catch (e) {
                toast.error('Failed to apply config');
              }
            }
          }
        } catch (err) {
          console.error('AI command execution error:', err);
          toast.error(err.message || 'Command execution failed');
        }
      } else {
        toast.warning('AI did not return valid JSON; showing raw text.');
      }
    },
    onError: (e) => {
      toast.error(e.message || 'AI invocation failed');
    },
  });

  // AI Fix Assistant state and handlers
  const aiFixInstructionRef = React.useRef(null);
  const aiFixOutputRef = React.useRef(null);
  const aiFixMutation = useMutation({
    mutationFn: async (description) => {
      const res = await supabase.integrations.Core.InvokeLLM({ prompt: UNIVERSAL_COMMAND_PROMPT(`FIX: ${description}`) });
      return res.text;
    },
    onSuccess: async (text) => {
      if (aiFixOutputRef.current) aiFixOutputRef.current.textContent = text;
      let payload = null;
      try {
        const jsonStart = text.indexOf('{');
        const jsonEnd = text.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          const jsonStr = text.slice(jsonStart, jsonEnd + 1);
          payload = JSON.parse(jsonStr);
        }
      } catch {}

      if (payload && typeof payload === 'object' && (payload.commands || payload.command)) {
        try {
          await executeCommand(payload, user);
          toast.success('AI fix commands executed');
          try { await refresh(); } catch {}
        } catch (e) {
          toast.error(e?.message || 'Failed to execute fix commands');
        }
      }
    },
    onError: (error) => {
      toast.error(error?.message || 'Failed to run AI fix');
    }
  });

  const previewConfig = async () => {
    // Try DB first
    const { data, error } = await supabase.from('app_configs').select('*').eq('key', 'global').limit(1);
    let cfg = null;
    if (!error) {
      cfg = data?.[0]?.config || null;
    } else {
      // Fallback to local
      try {
        const raw = localStorage.getItem('app_config:global');
        cfg = raw ? JSON.parse(raw) : null;
        toast.warning('Loaded local config fallback');
      } catch {}
    }
    if (aiOutputRef.current) aiOutputRef.current.textContent = cfg ? JSON.stringify(cfg, null, 2) : 'No config saved yet.';
  };

  const sendBroadcastMutation = useMutation({
    mutationFn: async ({ title, message }) => {
      if (!title.trim() || !message.trim()) {
        throw new Error("Please provide both title and message");
      }

      // Send notification to all users (ensure current admin included)
      for (const u of allUsersWithCurrent) {
        await supabase.entities.Notification.create({
          user_id: u.id,
          type: "system",
          title: title,
          message: message,
          icon: "📢",
          is_read: false
        });
      }
    },
    onSuccess: () => {
      setBroadcastTitle("");
      setBroadcastMessage("");
      toast.success(`Broadcast sent to ${allUsersWithCurrent.length} users!`);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to send broadcast");
    }
  });

  const setRevenueShareMutation = useMutation({
    mutationFn: async ({ userId, percentage }) => {
      const userToUpdate = allUsersWithCurrent.find(u => u.id === userId);
      if (!userToUpdate) throw new Error("User not found");

      const percentValue = parseFloat(percentage);
      if (isNaN(percentValue) || percentValue < 0 || percentValue > 100) {
        throw new Error("Invalid percentage. Must be between 0 and 100.");
      }

      await supabase.entities.User.update(userId, {
        revenue_share_percentage: percentValue
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['adminAllUsers']);
      setRevenueShareUserId(null);
      setRevenueSharePercentage("");
      toast.success("Revenue share percentage set");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to set revenue share");
    }
  });

  const sendTestPaymentsMutation = useMutation({
    mutationFn: async () => {
      if (!confirm(`Send $0.01 test payment via PayPal to all ${allUsersWithCurrent.length} users?`)) {
        throw new Error("Cancelled");
      }

      // Use createPayPalPayment function for each user
      for (const u of allUsersWithCurrent) {
        try {
          // Create a PayPal payment for $0.01
          const response = await supabase.functions.invoke(
            'createPayPalPayment',
            {
              body: {
                usdAmount: 0.01, // Use consistent payload key expected by the edge function
                coinAmount: 1, // Placeholder coin amount for test, can be 0 or 1
                userId: u.id,
              },
              headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
            }
          );

          // Create payout record
          await supabase.entities.Payout.create({
            user_id: u.id,
            user_name: u.username || u.full_name,
            user_email: u.email,
            coin_amount: 0, // No real coins associated with this test payout
            usd_amount: 0.01,
            fee_amount: 0.00,
            payout_amount: 0.01,
            payment_method: u.payment_method || "paypal", // Assume PayPal as the default for this test
            payment_details: u.payment_email || u.payment_username || "Test Payment",
            status: "pending", // Payment initiated, awaiting PayPal confirmation
            admin_notes: `Test payment $0.01 sent via PayPal by admin (${user.email})`,
            processed_by: user.email,
            processed_date: new Date().toISOString()
          });
        } catch (error) {
          console.error(`Failed to send test payment to ${u.email}:`, error);
          toast.error(`Failed to send test payment to ${u.username || u.email}`);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['allPayouts']);
      queryClient.invalidateQueries(['adminAllPayouts']);
      toast.success(`Test payments initiated for ${allUsersWithCurrent.length} users! Check PayPal for processing.`);
    },
    onError: (error) => {
      if (error.message !== "Cancelled") {
        toast.error(error.message || "Failed to send test payments");
      }
    }
  });

  // New: Send a $0.01 PayPal test payment to a single user
  const sendTestPaymentToUserMutation = useMutation({
    mutationFn: async (userId) => {
      const target = allUsersWithCurrent.find(x => x.id === userId);
      if (!target) throw new Error("User not found");

      if (!confirm(`Send $0.01 PayPal test payment to @${target.username || target.email}?`)) {
        throw new Error("Cancelled");
      }

      const response = await supabase.functions.invoke(
        'createPayPalPayment',
        {
          body: {
            usdAmount: 0.01,
            coinAmount: 1,
            userId: target.id,
          },
          headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
        }
      );

      await supabase.entities.Payout.create({
        user_id: target.id,
        user_name: target.username || target.full_name,
        user_email: target.email,
        coin_amount: 0,
        usd_amount: 0.01,
        fee_amount: 0.00,
        payout_amount: 0.01,
        payment_method: target.payment_method || "paypal",
        payment_details: target.payment_email || target.payment_username || "Test Payment",
        status: "pending",
        admin_notes: `Per-user test $0.01 via PayPal by admin (${user.email})`,
      });

      return response;
    },
    onSuccess: (_, userId) => {
      try { queryClient.invalidateQueries(['adminAllUsers']); } catch {}
      toast.success("Test payout initiated for user");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to send test payout");
    }
  });

  const fixUserCoinsMutation = useMutation({
    mutationFn: async ({ userId, makeAllFree }) => {
      const userToUpdate = allUsersWithCurrent.find(u => u.id === userId);
      if (!userToUpdate) throw new Error("User not found");

      if (makeAllFree) {
        // Convert all coins to free coins
        await supabase.entities.User.update(userId, {
          free_coins: (userToUpdate.coins || 0), // coins should already be total
          purchased_coins: 0,
          earned_coins: 0
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['adminAllUsers']);
      toast.success("User coins fixed successfully");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to fix coins");
    }
  });

  const resetAllRevenueMutation = useMutation({
    mutationFn: async () => {
      if (!confirm(`Reset ALL revenue to $0? This will convert all users' purchased coins to free coins.`)) {
        throw new Error("Cancelled");
      }

      // Convert all users' purchased coins to free coins
      for (const u of allUsers) {
        if ((u.purchased_coins || 0) > 0) {
          await supabase.entities.User.update(u.id, {
            free_coins: (u.free_coins || 0) + (u.purchased_coins || 0),
            purchased_coins: 0
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['adminAllUsers']);
      toast.success("All revenue reset to $0! All users now have free coins only.");
    },
    onError: (error) => {
      if (error.message !== "Cancelled") {
        toast.error(error.message || "Failed to reset revenue");
      }
    }
  });

  // NEW: Erase all app stats mutation
  const eraseAllStatsMutation = useMutation({
    mutationFn: async () => {
      if (!confirm('⚠️ DANGER: This will erase ALL app statistics including streams, gifts, purchases, payouts, and moderation actions. This CANNOT be undone! Are you absolutely sure?')) {
        throw new Error("Cancelled");
      }

      if (!confirm('This is your FINAL WARNING. Type YES in your mind and click OK to proceed with PERMANENT deletion of all stats.')) {
        throw new Error("Cancelled");
      }

      // Delete all non-user entities
      const allStreams = await supabase.entities.Stream.list();
      for (const s of allStreams) {
        await supabase.entities.Stream.delete(s.id).catch(console.error);
      }

      const allGifts = await supabase.entities.StreamGift.list();
      for (const g of allGifts) {
        await supabase.entities.StreamGift.delete(g.id).catch(console.error);
      }

      const allPurchases = await supabase.entities.CoinPurchase.list();
      for (const p of allPurchases) {
        await supabase.entities.CoinPurchase.delete(p.id).catch(console.error);
      }

      const allPayoutsData = await supabase.entities.Payout.list();
      for (const p of allPayoutsData) {
        await supabase.entities.Payout.delete(p.id).catch(console.error);
      }

      const allModeration = await supabase.entities.ModerationAction.list();
      for (const m of allModeration) {
        await supabase.entities.ModerationAction.delete(m.id).catch(console.error);
      }

      const allChatMessages = await supabase.entities.ChatMessage.list();
      for (const m of allChatMessages) {
        await supabase.entities.ChatMessage.delete(m.id).catch(console.error);
      }

      const allStreamLikes = await supabase.entities.StreamLike.list();
      for (const l of allStreamLikes) {
        await supabase.entities.StreamLike.delete(l.id).catch(console.error);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['adminAllUsers']);
      queryClient.invalidateQueries(['adminAllPayouts']);
      queryClient.invalidateQueries(['adminAllCoinPurchases']);
      queryClient.invalidateQueries(['streams']); // Assuming a 'streams' query exists
      queryClient.invalidateQueries(['moderationActions']);
      toast.success("🗑️ All app statistics erased successfully");
    },
    onError: (error) => {
      if (error.message !== "Cancelled") {
        toast.error(error.message || "Failed to erase stats");
      }
    }
  });

  // NEW: Erase all users coins mutation
  const eraseAllCoinsMutation = useMutation({
    mutationFn: async () => {
      if (!confirm('⚠️ WARNING: This will set ALL users\' coins to 0 (total, free, purchased, and earned). This CANNOT be undone! Are you sure?')) {
        throw new Error("Cancelled");
      }

      if (!confirm('Final confirmation: Click OK to permanently erase all coins from all user accounts.')) {
        throw new Error("Cancelled");
      }

      // Reset all coin balances to 0
      for (const u of allUsers) {
        await supabase.entities.User.update(u.id, {
          coins: 0,
          free_coins: 0,
          purchased_coins: 0,
          earned_coins: 0
        }).catch(console.error);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['adminAllUsers']);
      toast.success("💰 All user coins have been reset to 0");
    },
    onError: (error) => {
      if (error.message !== "Cancelled") {
        toast.error(error.message || "Failed to erase coins");
      }
    }
  });

  // NEW: Coin Reconciliation
  const reconcileAllCoins = async () => {
    setIsReconciling(true);
    setReconciliationResult(null);

    try {
      toast.loading("Reconciling all coins...", { id: 'reconcile-coins' });

      const response = await supabase.functions.invoke('reconcileAllCoins', { body: {} });

      console.log('Reconciliation Response:', response?.data);

      toast.dismiss('reconcile-coins');

      if (response?.data?.success) {
        setReconciliationResult(response.data);
        
        // Refresh all user data
        queryClient.invalidateQueries(['adminAllUsers']);
        queryClient.invalidateQueries(['adminAllCoinPurchases']);
        
        toast.success(`✅ Reconciliation complete! Updated ${response.data.results.usersUpdated} users`);
      } else {
        toast.error("Reconciliation failed: " + (response?.data?.error || "Unknown error"));
      }
    } catch (error) {
      console.error('Reconciliation error:', error);
      toast.dismiss('reconcile-coins');
      toast.error(`Reconciliation failed: ${error.message}`);
    } finally {
      setIsReconciling(false);
    }
  };

  const reviewFamilyApplicationMutation = useMutation({
    mutationFn: async ({ appId, status, notes }) => {
      // Robust update: progressively drop unknown columns to avoid PostgREST errors
      const fullPayload = {
        status: status,
        admin_notes: notes,
        reviewed_by: user?.email || null,
        reviewed_date: new Date().toISOString()
      };

      let payload = { ...fullPayload };
      for (let attempt = 0; attempt < 4; attempt++) {
        const { error } = await supabase
          .from('troll_family_applications')
          .update(payload)
          .eq('id', appId);
        if (!error) break; // success

        const msg = String(error?.message || error);
        // Detect missing column and remove it, otherwise fallback to just status
        const missingColumnMatch = msg.match(/column\s+"?(\w+)"?\s+does\s+not\s+exist/i);
        const schemaCacheColumnMatch = msg.match(/Could not find the '([^']+)' column of 'troll_family_applications' in the schema cache/i);
        const missingCol = (missingColumnMatch && missingColumnMatch[1]) || (schemaCacheColumnMatch && schemaCacheColumnMatch[1]);
        if (missingCol && payload.hasOwnProperty(missingCol)) {
          delete payload[missingCol];
          continue;
        }
        // Fallback: update only status
        payload = { status };
      }

      // If approved, attempt to mark user as owning a troll family, with fallbacks
      if (status === 'approved') {
        const app = familyApplications.find(a => a.id === appId);
        if (app) {
          try {
            const { error: userErr } = await supabase
              .from('profiles')
              .update({ owns_troll_family: true, troll_family_name: app.family_name })
              .eq('id', app.user_id);
            if (userErr) {
              // Retry with minimal/fallback fields
              await supabase
                .from('profiles')
                .update({ troll_family_id: app.id })
                .eq('id', app.user_id);
            }
          } catch (e) {
            console.warn('Profile update for family ownership failed:', e?.message || e);
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['trollFamilyApplications']);
      queryClient.invalidateQueries(['adminAllUsers']);
      setSelectedApp(null);
      setAdminNotes("");
      toast.success("Family application reviewed");
    },
    onError: (error) => {
      console.error("Failed to review family application:", error);
      const msg = error?.message || 'Failed to review application';
      toast.error(msg);
    }
  });

  // NEW: Username search for payouts
  useEffect(() => {
    if (payoutSearchQuery.length >= 2) { // Changed to 2 characters for suggestions
      const suggestions = allUsersWithCurrent
        .filter(u => 
          (u.username?.toLowerCase().includes(payoutSearchQuery.toLowerCase())) ||
          (u.full_name?.toLowerCase().includes(payoutSearchQuery.toLowerCase()))
        )
        .slice(0, 5);
      setPayoutUserSuggestions(suggestions);
    } else {
      setPayoutUserSuggestions([]);
    }
  }, [payoutSearchQuery, allUsersWithCurrent]);

  // Filter payouts by search query
  const filteredPayouts = payoutSearchQuery.length >= 2
    ? payouts.filter(p => 
        p.user_name?.toLowerCase().includes(payoutSearchQuery.toLowerCase()) ||
        p.user_email?.toLowerCase().includes(payoutSearchQuery.toLowerCase())
      )
    : payouts;

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#1a0a1f] to-[#0a0a0f] flex items-center justify-center">
        <p className="text-white">Please log in</p>
      </div>
    );
  }

  if (user.role !== "admin") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#1a0a1f] to-[#0a0a0f] flex items-center justify-center">
        <Card className="bg-[#1a1a24] border-[#2a2a3a] p-8 text-center">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-gray-400">You need admin privileges to access this page</p>
        </Card>
      </div>
    );
  }

  const pendingApps = applications.filter(a => a.status === "pending");
  const pendingFamilyApps = familyApplications.filter(a => a.status === "pending");
  const pendingPayouts = payouts.filter(p => p.status === "pending");
  const trollOfficers = allUsers.filter(u => u.is_troll_officer);
  const ogMembers = allUsers.filter(u => u.is_og);

  const currentSettings = moderationSettingsState;

  const pendingModeration = moderationActions.filter(a => !a.reviewed_by_admin);
  const criticalFlags = moderationActions.filter(a => a.severity === 'critical' && !a.reviewed_by_admin);

  const statusColors = {
    pending: "bg-yellow-500/20 text-yellow-300 border-yellow-500",
    approved: "bg-green-500/20 text-green-300 border-green-500",
    rejected: "bg-red-500/20 text-red-300 border-red-500",
    processing: "bg-blue-500/20 text-blue-300 border-blue-500",
    completed: "bg-green-500/20 text-green-300 border-green-500",
    cancelled: "bg-gray-500/20 text-gray-300 border-gray-500"
  };

  const roleColors = {
    admin: "bg-red-500",
    troll_officer: "bg-orange-500",
    moderator: "bg-blue-500",
    user: "bg-gray-500"
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#1a0a1f] to-[#0a0a0f] p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Shield className="w-10 h-10 text-purple-400" />
            <h1 className="text-4xl font-bold text-white">Admin Dashboard</h1>
          </div>
          <p className="text-gray-400">Manage TrollCity platform</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
          <Card className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 border-purple-500/50 p-6">
            <div className="flex items-center justify-between mb-2">
              <Users className="w-8 h-8 text-purple-400" />
              <Badge className="bg-purple-500">{allUsers.length}</Badge>
            </div>
            <p className="text-white font-bold text-2xl">{allUsers.length}</p>
            <p className="text-gray-400 text-sm">Total Users</p>
          </Card>

          <Card className="bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border-yellow-500/50 p-6">
            <div className="flex items-center justify-between mb-2">
              <FileText className="w-8 h-8 text-yellow-400" />
              <Badge className="bg-yellow-500">{pendingApps.length + pendingFamilyApps.length}</Badge>
            </div>
            <p className="text-white font-bold text-2xl">{pendingApps.length + pendingFamilyApps.length}</p>
            <p className="text-gray-400 text-sm">Pending Apps</p>
          </Card>

          <Card className="bg-gradient-to-br from-green-500/20 to-emerald-500/20 border-green-500/50 p-6">
            <div className="flex items-center justify-between mb-2">
              <DollarSign className="w-8 h-8 text-green-400" />
              <Badge className="bg-green-500">{pendingPayouts.length}</Badge>
            </div>
            <p className="text-white font-bold text-2xl">{pendingPayouts.length}</p>
            <p className="text-gray-400 text-sm">Pending Payouts</p>
          </Card>

          <Card className="bg-gradient-to-br from-orange-500/20 to-red-500/20 border-orange-500/50 p-6">
            <div className="flex items-center justify-between mb-2">
              <Shield className="w-8 h-8 text-orange-400" />
              <Badge className="bg-orange-500">{trollOfficers.length}</Badge>
            </div>
            <p className="text-white font-bold text-2xl">{trollOfficers.length}</p>
            <p className="text-gray-400 text-sm">Troll Officers</p>
          </Card>

          <Card className="bg-gradient-to-br from-red-500/20 to-orange-500/20 border-red-500/50 p-6">
            <div className="flex items-center justify-between mb-2">
              <Shield className="w-8 h-8 text-red-400" />
              <Badge className="bg-red-500">{pendingModeration.length}</Badge>
            </div>
            <p className="text-white font-bold text-2xl">{moderationActions.length}</p>
            <p className="text-gray-400 text-sm">AI Flags</p>
          </Card>
        </div>

        {/* Coin Economy Stats - LIVE UPDATES */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <Coins className="w-7 h-7 text-yellow-400" />
              Coin Economy (Live)
            </h2>
            <div className="flex items-center gap-2">
              <Badge className="bg-green-500 text-white animate-pulse">
                Live Updates
              </Badge>
              <Button
                onClick={() => {
                  queryClient.invalidateQueries(['adminAllUsers']);
                  queryClient.invalidateQueries(['adminAllCoinPurchases']);
                  toast.success('Data refreshed!');
                }}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700"
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                Refresh
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card className="bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border-yellow-500/50 p-6">
              <div className="flex items-center justify-between mb-2">
                <ShoppingCart className="w-8 h-8 text-yellow-400" />
              </div>
              <p className="text-white font-bold text-2xl">{revenue.totalPurchasedCoins.toLocaleString()}</p>
              <p className="text-gray-400 text-sm">Purchased (Transactions)</p>
              <p className="text-green-400 text-xs mt-1">${revenue.totalCoinsRevenue.toFixed(2)} revenue</p>
              <p className="text-gray-500 text-xs">{revenue.totalPurchases} purchases</p>
            </Card>

            <Card className="bg-gradient-to-br from-green-500/20 to-emerald-500/20 border-green-500/50 p-6">
              <div className="flex items-center justify-between mb-2">
                <Coins className="w-8 h-8 text-green-400" />
              </div>
              <p className="text-white font-bold text-2xl">{revenue.totalUserPurchasedCoins.toLocaleString()}</p>
              <p className="text-gray-400 text-sm">Purchased (User Balances)</p>
              <p className="text-green-400 text-xs mt-1">${revenue.purchasedCoinsValue.toFixed(2)} value</p>
              <p className="text-gray-500 text-xs">In user accounts</p>
            </Card>

            <Card className="bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border-blue-500/50 p-6">
              <div className="flex items-center justify-between mb-2">
                <Coins className="w-8 h-8 text-blue-400" />
              </div>
              <p className="text-white font-bold text-2xl">{revenue.totalEarnedCoins.toLocaleString()}</p>
              <p className="text-gray-400 text-sm">Earned Coins</p>
              <p className="text-orange-400 text-xs mt-1">${revenue.earnedCoinsValue.toFixed(2)} value</p>
            </Card>

            <Card className="bg-gradient-to-br from-red-500/20 to-pink-500/20 border-red-500/50 p-6">
              <div className="flex items-center justify-between mb-2">
                <Coins className="w-8 h-8 text-red-400" />
              </div>
              <p className="text-white font-bold text-2xl">{revenue.totalFreeCoins.toLocaleString()}</p>
              <p className="text-gray-400 text-sm">Free Coins</p>
              <p className="text-gray-500 text-xs mt-1">No cash value</p>
            </Card>
          </div>

          {/* Total Coins Summary */}
          <div className="mt-6">
            <Card className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 border-purple-500/50 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm mb-1">Total Coins in Circulation</p>
                  <p className="text-4xl font-bold text-white">{revenue.totalCoins.toLocaleString()}</p>
                  <p className="text-cyan-400 text-sm mt-2">Total Value: ${revenue.totalCoinsValue.toFixed(2)}</p>
                </div>
                <TrendingUp className="w-12 h-12 text-purple-400" />
              </div>
              <div className="grid grid-cols-3 gap-4 mt-4">
                <div className="bg-[#0a0a0f] rounded-lg p-3">
                  <p className="text-gray-400 text-xs">Purchased</p>
                  <p className="text-green-400 font-bold">{revenue.totalCoins > 0 ? ((revenue.totalUserPurchasedCoins / revenue.totalCoins) * 100).toFixed(1) : 0}%</p>
                </div>
                <div className="bg-[#0a0a0f] rounded-lg p-3">
                  <p className="text-gray-400 text-xs">Earned</p>
                  <p className="text-blue-400 font-bold">{revenue.totalCoins > 0 ? ((revenue.totalEarnedCoins / revenue.totalCoins) * 100).toFixed(1) : 0}%</p>
                </div>
                <div className="bg-[#0a0a0f] rounded-lg p-3">
                  <p className="text-gray-400 text-xs">Free</p>
                  <p className="text-red-400 font-bold">{revenue.totalCoins > 0 ? ((revenue.totalFreeCoins / revenue.totalCoins) * 100).toFixed(1) : 0}%</p>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Revenue Stats - LIVE UPDATES */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <DollarSign className="w-7 h-7 text-green-400" />
              Revenue & Finance (Live)
            </h2>
            <Badge className="bg-green-500 text-white animate-pulse">
              Auto-updating
            </Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card className="bg-gradient-to-br from-green-500/20 to-emerald-500/20 border-green-500/50 p-6">
              <div className="flex items-center justify-between mb-2">
                <CreditCard className="w-8 h-8 text-green-400" />
              </div>
              <p className="text-white font-bold text-2xl">${revenue.totalCoinsRevenue.toFixed(2)}</p>
              <p className="text-gray-400 text-sm">Coin Sales Revenue</p>
              <p className="text-gray-500 text-xs mt-1">{revenue.usersWhoPurchased} users purchased</p>
            </Card>

            <Card className="bg-gradient-to-br from-red-500/20 to-pink-500/20 border-red-500/50 p-6">
              <div className="flex items-center justify-between mb-2">
                <DollarSign className="w-8 h-8 text-red-400" />
              </div>
              <p className="text-white font-bold text-2xl">${revenue.totalPayoutsAmount.toFixed(2)}</p>
              <p className="text-gray-400 text-sm">Total Payouts</p>
              <p className="text-gray-500 text-xs mt-1">{allPayouts.filter(p => p.status === "completed").length} completed</p>
            </Card>

            <Card className="bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border-blue-500/50 p-6">
              <div className="flex items-center justify-between mb-2">
                <DollarSign className="w-8 h-8 text-blue-400" />
              </div>
              <p className="text-white font-bold text-2xl">${revenue.totalFeesCollected.toFixed(2)}</p>
              <p className="text-gray-400 text-sm">Fees Collected</p>
              <p className="text-gray-500 text-xs mt-1">Platform fees</p>
            </Card>

            <Card className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 border-purple-500/50 p-6">
              <div className="flex items-center justify-between mb-2">
                <TrendingUp className="w-8 h-8 text-purple-400" />
              </div>
              <p className={`font-bold text-2xl ${revenue.platformProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ${revenue.platformProfit.toFixed(2)}
              </p>
              <p className="text-gray-400 text-sm">Platform Profit</p>
              <p className="text-gray-500 text-xs mt-1">Sales - Payouts</p>
            </Card>
          </div>

          {/* Additional Metrics - LIVE */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
            <Card className="bg-[#1a1a24] border-[#2a2a3a] p-6">
              <h3 className="text-lg font-bold text-white mb-4">Purchase Metrics (Live)</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-400">Avg Purchase/User:</span>
                  <span className="text-green-400 font-bold">${revenue.avgPurchasePerUser.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Users Who Purchased:</span>
                  <span className="text-blue-400 font-bold">{revenue.usersWhoPurchased}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Purchase Rate:</span>
                  <span className="text-purple-400 font-bold">
                    {allUsers.length > 0 ? ((revenue.usersWhoPurchased / allUsers.length) * 100).toFixed(1) : 0}%
                  </span>
                </div>
              </div>
            </Card>

            <Card className="bg-[#1a1a24] border-[#2a2a3a] p-6">
              <h3 className="text-lg font-bold text-white mb-4">Coin Distribution (Live)</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-400">Purchased:</span>
                  <span className="text-yellow-400 font-bold">
                    {revenue.totalCoins > 0 ? ((revenue.totalUserPurchasedCoins / revenue.totalCoins) * 100).toFixed(1) : 0}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Earned:</span>
                  <span className="text-blue-400 font-bold">
                    {revenue.totalCoins > 0 ? ((revenue.totalEarnedCoins / revenue.totalCoins) * 100).toFixed(1) : 0}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Free:</span>
                  <span className="text-red-400 font-bold">
                    {revenue.totalCoins > 0 ? ((revenue.totalFreeCoins / revenue.totalCoins) * 100).toFixed(1) : 0}%
                  </span>
                </div>
              </div>
            </Card>

            <Card className="bg-[#1a1a24] border-[#2a2a3a] p-6">
              <h3 className="text-lg font-bold text-white mb-4">Value Breakdown (Live)</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Value:</span>
                  <span className="text-cyan-400 font-bold">${revenue.totalCoinsValue.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Purchased Value:</span>
                  <span className="text-green-400 font-bold">${revenue.purchasedCoinsValue.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Earned Value:</span>
                  <span className="text-orange-400 font-bold">${revenue.earnedCoinsValue.toFixed(2)}</span>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Header actions */}
        <div className="flex items-center justify-end mb-4">
          <Button
            variant="default"
            className="bg-green-600 hover:bg-green-700 metallic-outline"
            disabled={makeMeAdminMutation.isPending || getRole(user) === "admin"}
            onClick={() => makeMeAdminMutation.mutate()}
          >
            {getRole(user) === "admin" ? "You are Admin" : "Make Me Admin"}
          </Button>
        </div>

        {/* Navigation Sections (replaces dropdown) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Section 1: Admin Navigation */}
          <Card className="bg-[#1a1a24] border-[#2a2a3a] p-6">
            <h3 className="text-lg font-bold text-white mb-4">Admin Navigation</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Button variant="outline" className="metallic-outline" onClick={() => setActiveTab("connections")}>Connections</Button>
              <Button variant="outline" className="metallic-outline" onClick={() => setActiveTab("payouts")}>Payouts</Button>
              <Button variant="outline" className="metallic-outline" onClick={() => setActiveTab("purchases")}>Purchases</Button>
              <Button variant="outline" className="metallic-outline" onClick={() => setActiveTab("verification")}>Verification</Button>
              <Button variant="outline" className="metallic-outline" onClick={() => setActiveTab("users")}>Users</Button>
              <Button variant="outline" className="metallic-outline" onClick={() => setActiveTab("broadcasters")}>Broadcasters</Button>
              <Button variant="outline" className="metallic-outline" onClick={() => setActiveTab("families")}>Families</Button>
              <Button variant="outline" className="metallic-outline" onClick={() => setActiveTab("moderation")}>AI Moderation</Button>
              <Button variant="outline" className="metallic-outline" onClick={() => setActiveTab("gambling")}>Gambling</Button>
              <Button variant="outline" className="metallic-outline" onClick={() => setActiveTab("settings")}>Settings</Button>
              <Button variant="outline" className="metallic-outline" onClick={() => setActiveTab("ai")}>AI App Editor</Button>
              <Button variant="outline" className="metallic-outline" onClick={() => setActiveTab("ai-fix")}>AI Fix Assistant</Button>
            </div>
          </Card>

          {/* Section 2: Admin Links */}
          <Card className="bg-[#1a1a24] border-[#2a2a3a] p-6">
            <h3 className="text-lg font-bold text-white mb-4">Admin Links</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Button variant="outline" className="metallic-outline" onClick={() => navigate(createPageUrl("OfficerApp"))}>Open Troll Officer Page</Button>
              <Button variant="outline" className="metallic-outline" onClick={() => navigate(createPageUrl("OfficerChat"))}>Open Officer Commands</Button>
            </div>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          {/* Tab triggers removed in favor of dropdown navigation */}

          {/* NEW: System Connections Tab */}
          <TabsContent value="connections">
            <div className="space-y-6">
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-6">
                <p className="text-blue-300 text-sm font-bold mb-2">
                  🔌 <strong>System Health Check</strong>
                </p>
                <p className="text-blue-200 text-xs">
                  Test all critical system connections to ensure TrollCity is running smoothly. Click each test button below to verify configuration.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Agora Streaming Test */}
                <Card className="bg-[#1a1a24] border-[#2a2a3a]">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2 text-lg">
                      <Radio className="w-5 h-5 text-red-400" />
                      Agora Live Streaming
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="bg-[#0a0a0f] rounded-lg p-3">
                      <p className="text-gray-400 text-xs mb-2">Client Variables:</p>
                      <div className="space-y-1">
                        <p className="text-purple-400 font-mono text-xs">VITE_AGORA_APP_ID</p>
                        <p className="text-gray-500 text-[11px]">Payouts require server-side secrets (not needed for client checkout)</p>
                      </div>
                    </div>

                    <Button
                      onClick={verifyAgoraConnection}
                      disabled={isVerifyingAgora}
                      className="w-full bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700"
                    >
                      {isVerifyingAgora ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Testing...
                        </>
                      ) : (
                        <>
                          <Radio className="w-4 h-4 mr-2" />
                          Check Agora Config
                        </>
                      )}
                    </Button>

                    <Button
                      onClick={runAgoraServerTest}
                      disabled={isRunningAgoraServerTest}
                      className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700"
                    >
                      {isRunningAgoraServerTest ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Contacting server...
                        </>
                      ) : (
                        <>
                          <Radio className="w-4 h-4 mr-2" />
                          Test Agora Server
                        </>
                      )}
                    </Button>

                    {agoraVerificationResult && (
                      <div className={`rounded-lg p-3 border-2 ${
                        agoraVerificationResult.results?.agora?.status === 'connected'
                          ? 'border-green-500 bg-green-500/10'
                          : 'border-red-500 bg-red-500/10'
                      }`}>
                        <div className="flex items-center gap-2 mb-2">
                          {agoraVerificationResult.results?.agora?.status === 'connected' ? (
                            <CheckCircle className="w-5 h-5 text-green-400" />
                          ) : (
                            <XCircle className="w-5 h-5 text-red-400" />
                          )}
                          <p className="text-white font-semibold text-sm">
                            {agoraVerificationResult.results?.agora?.status?.toUpperCase()}
                          </p>
                        </div>
                        <p className={`text-xs ${
                          agoraVerificationResult.results?.agora?.status === 'connected'
                            ? 'text-green-300'
                            : 'text-red-300'
                        }`}>
                          {agoraVerificationResult.results?.agora?.details?.message || 
                           agoraVerificationResult.results?.agora?.details?.error}
                        </p>
                        {agoraVerificationResult?.source && (
                          <p className="text-gray-400 text-[11px] mt-1">
                            Source: {agoraVerificationResult.source === 'edge' ? 'Edge Function' : 'Local Fallback'}
                          </p>
                        )}
                      </div>
                    )}

                    {agoraServerTestResult && (
                      <div className={`rounded-lg p-3 border-2 ${
                        agoraServerTestResult.status === 'connected'
                          ? 'border-green-500 bg-green-500/10'
                          : 'border-yellow-500 bg-yellow-500/10'
                      }`}>
                        <div className="flex items-center gap-2 mb-2">
                          {agoraServerTestResult.status === 'connected' ? (
                            <CheckCircle className="w-5 h-5 text-green-400" />
                          ) : (
                            <AlertCircle className="w-5 h-5 text-yellow-400" />
                          )}
                          <p className="text-white font-semibold text-sm">
                            {agoraServerTestResult.status?.toUpperCase()}
                          </p>
                        </div>
                        <p className={`text-xs ${
                          agoraServerTestResult.status === 'connected' ? 'text-green-300' : 'text-yellow-300'
                        }`}>
                          {agoraServerTestResult.details?.message || agoraServerTestResult.details?.error}
                        </p>
                        {agoraServerTestResult.status !== 'connected' && agoraServerTestResult.details?.raw && (
                          <pre className="mt-2 text-[11px] text-gray-300 bg-black/20 p-2 rounded overflow-x-auto">
                            {JSON.stringify(agoraServerTestResult.details.raw, null, 2)}
                          </pre>
                        )}
                        {agoraServerTestResult?.source && (
                          <p className="text-gray-400 text-[11px] mt-1">Source: Edge Function</p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Payments & Cashouts */}
                <Card className="bg-[#1a1a24] border-[#2a2a3a]">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2 text-lg">
                      <DollarSign className="w-5 h-5 text-green-400" />
                      Payments & Cashouts (Stripe payouts)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="bg-[#0a0a0f] rounded-lg p-3">
                      <p className="text-gray-400 text-xs mb-2">Stripe Integration (server)</p>
                      <div className="space-y-1">
                        <p className="text-purple-400 font-mono text-xs">functions: teststripeconnection</p>
                        <p className="text-purple-400 font-mono text-xs">functions: createstripecheckout</p>
                        <p className="text-purple-400 font-mono text-xs">functions: confirmstripepayment</p>
                        <p className="text-gray-500 text-[11px]">Stripe runs via Supabase Edge Functions. No client keys required.</p>
                      </div>
                    </div>

                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-3">
                      <p className="text-yellow-300 text-xs">
                        Payments must be accurate to ensure payout. Confirm amounts, currency, and successful order capture.
                        Verification is available via the Stripe server test.
                      </p>
                    </div>

                    <div className="bg-[#0a0a0f] rounded-lg p-3">
                      <p className="text-gray-300 text-xs mb-2">Stripe Server Test</p>
                      <div className="flex items-center gap-2 mb-3">
                        <Button
                          onClick={runPayPalServerTest}
                          disabled={isRunningPayPalServerTest}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          {isRunningPayPalServerTest ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Contacting Stripe...
                            </>
                          ) : (
                            <>
                              <CreditCard className="w-4 h-4 mr-2" />
                              Run Stripe Server Test
                            </>
                          )}
                        </Button>
                        <p className="text-xs text-gray-400">
                          Verifies Stripe connectivity and credentials via Edge Function.
                        </p>
                      </div>
                      {paypalServerTestResult && (
                        <div className={`rounded-md p-3 ${paypalServerTestResult.status === 'connected' ? 'bg-green-500/10 border border-green-500/30' : 'bg-yellow-500/10 border border-yellow-500/30'}`}>
                          <p className="text-white font-semibold text-sm">{(paypalServerTestResult.status || '').toUpperCase()}</p>
                          <p className="text-gray-300 text-xs">
                            {paypalServerTestResult.details?.message || paypalServerTestResult.details?.error}
                          </p>
                          {paypalServerTestResult.details?.mode && (
                            <p className="text-gray-400 text-[11px] mt-1">Mode: {paypalServerTestResult.details.mode}</p>
                          )}
                          {paypalServerTestResult.status !== 'connected' && paypalServerTestResult.details?.raw && (
                            <pre className="mt-2 text-[11px] text-gray-300 bg-black/20 p-2 rounded overflow-x-auto">{JSON.stringify(paypalServerTestResult.details.raw, null, 2)}</pre>
                          )}
                          {paypalServerTestResult?.source && (
                            <p className="text-gray-400 text-[11px] mt-1">Source: Edge Function</p>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Supabase Database Test */}
                <Card className="bg-[#1a1a24] border-[#2a2a3a]">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2 text-lg">
                      <Shield className="w-5 h-5 text-purple-400" />
                      Supabase Database
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="bg-[#0a0a0f] rounded-lg p-3">
                      <p className="text-gray-400 text-xs mb-2">Required Variables:</p>
                      <div className="space-y-1">
                        <p className="text-purple-400 font-mono text-xs">SUPABASE_URL</p>
                        <p className="text-purple-400 font-mono text-xs">SUPABASE_ANON_KEY</p>
                      </div>
                    </div>

                    <Button
                      onClick={verifySupabaseConnection}
                      disabled={isVerifyingSupabase}
                      className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
                    >
                      {isVerifyingSupabase ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Testing...
                        </>
                      ) : (
                        <>
                          <Shield className="w-4 h-4 mr-2" />
                          Test Supabase
                        </>
                      )}
                    </Button>

                    {supabaseVerificationResult && (
                      <div className={`rounded-lg p-3 border-2 ${
                        supabaseVerificationResult.results?.supabase?.status === 'connected'
                          ? 'border-green-500 bg-green-500/10'
                          : supabaseVerificationResult.results?.supabase?.status === 'not_configured'
                          ? 'border-yellow-500 bg-yellow-500/10'
                          : 'border-red-500 bg-red-500/10'
                      }`}>
                        <div className="flex items-center gap-2 mb-2">
                          {supabaseVerificationResult.results?.supabase?.status === 'connected' ? (
                            <CheckCircle className="w-5 h-5 text-green-400" />
                          ) : (
                            <XCircle className="w-5 h-5 text-red-400" />
                          )}
                          <p className="text-white font-semibold text-sm">
                            {supabaseVerificationResult.results?.supabase?.status?.toUpperCase().replace('_', ' ')}
                          </p>
                        </div>
                        <p className={`text-xs mb-2 ${
                          supabaseVerificationResult.results?.supabase?.status === 'connected'
                            ? 'text-green-300'
                            : 'text-red-300'
                        }`}>
                          {supabaseVerificationResult.results?.supabase?.details?.message || 
                           supabaseVerificationResult.results?.supabase?.details?.error}
                        </p>
                        {supabaseVerificationResult.results?.supabase?.details?.user_profiles_count !== undefined && (
                          <div className="text-xs text-gray-400 space-y-1 mt-2">
                            <p>👥 Users: {supabaseVerificationResult.results.supabase.details.user_profiles_count}</p>
                            <p>📺 Streams: {supabaseVerificationResult.results.supabase.details.streams_count}</p>
                          </div>
                        )}
                        {supabaseVerificationResult?.source && (
                          <p className="text-gray-400 text-[11px] mt-1">
                            Source: {supabaseVerificationResult.source === 'edge' ? 'Edge Function' : 'Local Fallback'}
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Stream Cleanup Test */}
                <Card className="bg-[#1a1a24] border-[#2a2a3a]">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2 text-lg">
                      <Eye className="w-5 h-5 text-cyan-400" />
                      Stream Cleanup & Viewers
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="bg-[#0a0a0f] rounded-lg p-3">
                      <p className="text-gray-400 text-xs mb-2">What this does:</p>
                      <ul className="text-gray-300 text-xs space-y-1">
                        <li>✅ Ends stale streams</li>
                        <li>✅ Removes disconnected viewers</li>
                        <li>✅ Updates viewer counts</li>
                        <li>✅ Cleans up heartbeats</li>
                      </ul>
                    </div>

                    <Button
                      onClick={async () => {
                        try {
                          toast.loading('Running cleanup...', { id: 'cleanup' });
                          const response = await supabase.functions.invoke('cleanupStreams', { body: {} });
                          toast.dismiss('cleanup');
                          
                          if (response?.data?.success) {
                            toast.success(`✅ Cleaned ${response.data.cleaned} streams`);
                          } else {
                            toast.error('Cleanup failed');
                          }
                        } catch (error) {
                          toast.dismiss('cleanup');
                          toast.error('Cleanup error: ' + error.message);
                        }
                      }}
                      className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Run Cleanup
                    </Button>

                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-3">
                      <p className="text-yellow-300 text-xs">
                        💡 This runs automatically every 30s on the Home page
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Test All Systems Button */}
              <Card className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 border-purple-500/50">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <CheckCircle className="w-6 h-6 text-purple-400" />
                    Test All Systems
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={async () => {
                      toast.loading('Testing all systems...', { id: 'test-all' });
                      
                      await verifyAgoraConnection();
                      await new Promise(resolve => setTimeout(resolve, 1000));
                      
                      // Payment verification disabled per policy. Ensure payment amounts/capture are accurate for payouts.
                      
                      await verifySupabaseConnection();
                      
                      toast.dismiss('test-all');
                      toast.success('✅ All system tests completed!');
                    }}
                    disabled={isVerifyingAgora || isVerifyingSupabase}
                    className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-lg py-6"
                  >
                    {(isVerifyingAgora || isVerifyingSupabase) ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Testing All Systems...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-5 h-5 mr-2" />
                        Test All Connections
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* System Health & Fees Panel */}
              <div className="mt-6">
                <SystemHealthPanel />
              </div>
            </div>
          </TabsContent>

          {/* Payouts Tab - ENHANCED */}
          <TabsContent value="payouts">
            <Card className="bg-[#1a1a24] border-[#2a2a3a] p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white">Payout Requests</h3>
                <div className="flex items-center gap-3">
                  <Input
                    value={payoutSearchQuery}
                    onChange={(e) => setPayoutSearchQuery(e.target.value)}
                    placeholder="Search by username or email..."
                    className="bg-[#0a0a0f] border-[#2a2a3a] text-white w-64"
                  />
                  {payoutSearchQuery && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setPayoutSearchQuery("")}
                      className="text-gray-400"
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>

              {/* Username Suggestions */}
              {payoutSearchQuery.length >= 2 && payoutUserSuggestions.length > 0 && (
                <div className="mb-4 bg-[#0a0a0f] rounded-lg p-3">
                  <p className="text-gray-400 text-xs mb-2">Suggested users:</p>
                  <div className="flex flex-wrap gap-2">
                    {payoutUserSuggestions.map(u => (
                      <Button
                        key={u.id}
                        size="sm"
                        variant="outline"
                        onClick={() => setPayoutSearchQuery(u.username || u.full_name)}
                        className="border-purple-500 text-purple-400 hover:bg-purple-500/10"
                      >
                        @{u.username || u.full_name}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {filteredPayouts.length === 0 ? (
                <div className="text-center py-12">
                  <DollarSign className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-500">
                    {payoutSearchQuery 
                      ? `No payouts found for "${payoutSearchQuery}"` 
                      : "No payout requests yet"}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredPayouts.map((payout) => (
                    <div key={payout.id} className="bg-[#0a0a0f] rounded-lg p-4">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h4 className="text-white font-bold">{payout.user_name}</h4>
                          <p className="text-gray-400 text-sm">{payout.user_email}</p>
                          <p className="text-gray-500 text-xs mt-1">
                            {safeFormatDate(payout.created_date, { dateStyle: 'medium' })}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={statusColors[payout.status]}>
                            {payout.status}
                          </Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deletePayoutMutation.mutate(payout.id)}
                            disabled={deletePayoutMutation.isPending}
                            className="text-red-400 hover:text-red-300"
                          >
                            <XCircle className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div>
                          <p className="text-gray-400 text-sm">Coins</p>
                          <p className="text-white font-semibold">{payout.coin_amount?.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-gray-400 text-sm">Value</p>
                          <p className="text-white font-semibold">${payout.usd_amount?.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-gray-400 text-sm">Fee</p>
                          <p className="text-red-400 font-semibold">-${payout.fee_amount?.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-gray-400 text-sm">Payout</p>
                          <p className="text-green-400 font-semibold">${payout.payout_amount?.toFixed(2)}</p>
                        </div>
                      </div>

                      <div className="bg-blue-500/10 border border-blue-500/30 rounded p-3 mb-4">
                        <p className="text-blue-300 text-sm">
                          💳 {payout.payment_method}: {payout.payment_details}
                        </p>
                      </div>

                      {payout.status === "pending" && (
                        <div className="flex gap-2">
                          <Select
                            onValueChange={(value) => {
                              if (value === 'delete') {
                                deletePayoutMutation.mutate(payout.id);
                              } else {
                                updatePayoutMutation.mutate({
                                  payoutId: payout.id,
                                  status: value,
                                  notes: value === 'processing' ? 'Payment being processed' :
                                         value === 'completed' ? 'Payment completed' :
                                         value === 'rejected' ? 'Payment rejected' : ''
                                });
                              }
                            }}
                          >
                            <SelectTrigger className="bg-[#0a0a0f] border-[#2a2a3a] text-white w-48">
                              <SelectValue placeholder="Change status..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="processing">
                                <Clock className="w-4 h-4 inline mr-2" />
                                Processing
                              </SelectItem>
                              <SelectItem value="completed">
                                <CheckCircle className="w-4 h-4 inline mr-2 text-green-400" />
                                Complete
                              </SelectItem>
                              <SelectItem value="rejected">
                                <XCircle className="w-4 h-4 inline mr-2 text-red-400" />
                                Reject
                              </SelectItem>
                              <SelectItem value="delete">
                                <XCircle className="w-4 h-4 inline mr-2 text-red-500" />
                                Delete
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {payout.status !== "pending" && (
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deletePayoutMutation.mutate(payout.id)}
                            disabled={deletePayoutMutation.isPending}
                            className="text-red-400 hover:text-red-300"
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            Delete
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>

          {/* Purchases Tab - ENHANCED */}
          <TabsContent value="purchases">
            <Card className="bg-[#1a1a24] border-[#2a2a3a] p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white">Coin Purchases (Live)</h3>
                <div className="flex items-center gap-3">
                  <Badge className="bg-green-500 text-white animate-pulse">
                    Auto-updating
                  </Badge>
                  <Button
                    onClick={async () => {
                      const pendingPurchases = allCoinPurchases.filter(p => p.status === 'pending');
                      
                      if (pendingPurchases.length === 0) {
                        toast.info('No pending purchases to capture');
                        return;
                      }
                      
                      if (!confirm(`Attempt to capture ${pendingPurchases.length} pending purchases?`)) {
                        return;
                      }
                      
                      toast.loading(`Capturing ${pendingPurchases.length} pending purchases...`, { id: 'capture-pending' });
                      
                      let successCount = 0;
                      let errorCount = 0;
                      
                      for (const purchase of pendingPurchases) {
                        try {
                          const response = await supabase.functions.invoke(
                            'capturepaypalpayment',
                            { body: { orderId: purchase.paypal_order_id }, headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY } }
                          );
                          
                          if (response.data.success || response.data.alreadyProcessed) {
                            successCount++;
                          } else {
                            errorCount++;
                          }
                        } catch (error) {
                          console.error('Capture error:', error);
                          errorCount++;
                        }
                      }
                      
                      queryClient.invalidateQueries(['adminAllCoinPurchases']);
                      queryClient.invalidateQueries(['adminAllUsers']);
                      
                      toast.dismiss('capture-pending');
                      
                      if (errorCount === 0) {
                        toast.success(`✅ Successfully captured ${successCount} payments!`);
                      } else {
                        toast.warning(`⚠️ Captured ${successCount} payments. ${errorCount} failed or already processed.`);
                      }
                    }}
                    disabled={allCoinPurchases.filter(p => p.status === 'pending').length === 0}
                    className="bg-orange-600 hover:bg-orange-700"
                  >
                    <CreditCard className="w-4 h-4 mr-2" />
                    Capture Pending ({allCoinPurchases.filter(p => p.status === 'pending').length})
                  </Button>
                </div>
              </div>

              {allCoinPurchases.length === 0 ? (
                <div className="text-center py-12">
                  <ShoppingCart className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-500">No purchases yet</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {allCoinPurchases.map((purchase) => (
                    <div key={purchase.id} className="bg-[#0a0a0f] rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <Link
                            to={`${createPageUrl('PublicProfile')}?userId=${purchase.user_id}`}
                            className="text-white font-bold hover:text-purple-400 transition-colors"
                          >
                            {purchase.user_name}
                          </Link>
                          <p className="text-gray-400 text-sm">{purchase.user_email}</p>
                          <p className="text-gray-500 text-xs mt-1">
                            {safeFormatDate(purchase.created_date, { dateStyle: 'medium', timeStyle: 'medium' })}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={
                            purchase.status === 'completed' ? 'bg-green-500' :
                            purchase.status === 'pending' ? 'bg-yellow-500' :
                            purchase.status === 'cancelled' ? 'bg-gray-500' :
                            'bg-red-500'
                          }>
                            {purchase.status}
                          </Badge>
                          {purchase.status === 'pending' && (
                            <>
                              <Button
                                size="sm"
                                onClick={async () => {
                                  try {
                                    toast.loading('Capturing payment...', { id: 'capture-single' });
                                    
                                    const response = await supabase.functions.invoke(
                                      'capturepaypalpayment',
                                      { body: { orderId: purchase.paypal_order_id }, headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY } }
                                    );
                                    
                                    if (response.data.success || response.data.alreadyProcessed) {
                                      toast.success('✅ Payment captured!', { id: 'capture-single' });
                                      queryClient.invalidateQueries(['adminAllCoinPurchases']);
                                      queryClient.invalidateQueries(['adminAllUsers']);
                                    } else {
                                      throw new Error(response.data.error || 'Capture failed');
                                    }
                                  } catch (error) {
                                    toast.error('❌ ' + error.message, { id: 'capture-single' });
                                  }
                                }}
                                className="bg-orange-600 hover:bg-orange-700"
                              >
                                <CreditCard className="w-3 h-3 mr-1" />
                                Capture
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => cancelPurchaseMutation.mutate(purchase.id)}
                                disabled={cancelPurchaseMutation.isPending}
                                className="text-red-400 hover:text-red-300"
                              >
                                <XCircle className="w-3 h-3 mr-1" />
                                Cancel
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 mt-3">
                        <div>
                          <p className="text-gray-400 text-sm">Coins</p>
                          <p className="text-yellow-400 font-semibold">{purchase.coin_amount.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-gray-400 text-sm">Amount</p>
                          <p className="text-green-400 font-semibold">{formatCurrency(purchase.usd_amount)}</p>
                        </div>
                        <div>
                          <p className="text-gray-400 text-sm">Package</p>
                          <p className="text-purple-400 text-sm">{purchase.package_type}</p>
                        </div>
                      </div>

                      {purchase.paypal_order_id && (
                        <div className="mt-3 bg-blue-500/10 border border-blue-500/30 rounded p-2">
                          <p className="text-blue-300 text-xs font-mono">
                            PayPal: {purchase.paypal_order_id}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>

        {/* Verification Tab (was Troll Officer Applications) */}
          <TabsContent value="verification">
            <Card className="bg-[#1a1a24] border-[#2a2a3a] p-6">
                <h3 className="text-xl font-bold text-white mb-6">Troll Officer Applications</h3>

                {applications.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-500">No officer applications yet</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {applications.map((app) => (
                      <div key={app.id} className="bg-[#0a0a0f] rounded-lg p-4">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <h4 className="text-white font-bold">{app.username}</h4>
                            <p className="text-gray-400 text-sm">{app.user_email}</p>
                            <p className="text-gray-500 text-xs mt-1">
                              Level {app.user_level} • {app.streaming_hours?.toFixed(1) || 0}hrs streamed
                            </p>
                          </div>
                          <Badge className={statusColors[app.status]}>
                            {app.status}
                          </Badge>
                        </div>

                        <div className="space-y-3 mb-4">
                          <div>
                            <p className="text-gray-400 text-sm mb-1">Why Apply:</p>
                            <p className="text-white text-sm">{app.why_apply}</p>
                          </div>
                          <div>
                            <p className="text-gray-400 text-sm mb-1">Experience:</p>
                            <p className="text-white text-sm">{app.experience}</p>
                          </div>
                          <div>
                            <p className="text-gray-400 text-sm mb-1">Availability:</p>
                            <p className="text-white text-sm">{app.availability}</p>
                          </div>
                        </div>

                        {app.status === "pending" && (
                          <div className="flex gap-3">
                            <Textarea
                              placeholder="Admin notes (optional)..."
                              value={selectedApp === app.id ? adminNotes : ""}
                              onChange={(e) => {
                                setSelectedApp(app.id);
                                setAdminNotes(e.target.value);
                              }}
                              className="bg-[#1a1a24] border-[#2a2a3a] text-white text-sm"
                              rows={2}
                            />
                            <div className="flex flex-col gap-2">
                              <Button
                                onClick={() => {
                                  reviewApplicationMutation.mutate({
                                    appId: app.id,
                                    status: "approved",
                                    notes: selectedApp === app.id ? adminNotes : ""
                                  });
                                }}
                                disabled={reviewApplicationMutation.isPending}
                                className="bg-green-600 hover:bg-green-700"
                                size="sm"
                              >
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Approve
                              </Button>
                              <Button
                                onClick={() => {
                                  reviewApplicationMutation.mutate({
                                    appId: app.id,
                                    status: "rejected",
                                    notes: selectedApp === app.id ? adminNotes : ""
                                  });
                                }}
                                disabled={reviewApplicationMutation.isPending}
                                variant="destructive"
                                size="sm"
                              >
                              <XCircle className="w-4 h-4 mr-1" />
                              Reject
                              </Button>
                              <Button
                                onClick={() => {
                                  if (window.confirm(`Cancel officer application for "${app.username}"?`)) {
                                    cancelOfficerApplicationMutation.mutate(app.id);
                                  }
                                }}
                                disabled={cancelOfficerApplicationMutation.isPending}
                                variant="outline"
                                size="sm"
                              >
                                Cancel Application
                              </Button>
                            </div>
                          </div>
                        )}

                        {app.status === "approved" && (
                          <div className="flex justify-end mt-2">
                            <Button
                              onClick={() => {
                                if (window.confirm(`Delete troll officer "${app.username}"? This will demote them.`)) {
                                  deleteOfficerApplicationMutation.mutate(app.id);
                                }
                              }}
                              disabled={deleteOfficerApplicationMutation.isPending}
                              className="bg-red-600 hover:bg-red-700"
                              size="sm"
                            >
                              Delete Troll Officer
                            </Button>
                          </div>
                        )}

                        {app.admin_notes && (
                          <div className="mt-4 bg-blue-500/10 border border-blue-500/30 rounded p-3">
                            <p className="text-blue-300 text-sm">
                              <strong>Admin Notes:</strong> {app.admin_notes}
                            </p>
                          </div>
                        )}

                        {app.status === "approved" && (
                          <div className="flex justify-end mt-2">
                            <Button
                              onClick={() => {
                                if (window.confirm(`Delete approved family "${app.family_name}"? This cannot be undone.`)) {
                                  deleteFamilyApplicationMutation.mutate(app.id);
                                }
                              }}
                              disabled={deleteFamilyApplicationMutation.isPending}
                              className="bg-red-600 hover:bg-red-700"
                              size="sm"
                            >
                              Delete Troll Family
                            </Button>
                          </div>
                        )}

                        {app.status === "approved" && (
                          <div className="flex justify-end mt-2">
                            <Button
                              onClick={() => {
                                if (window.confirm(`Delete troll officer "${app.username}"? This will demote them.`)) {
                                  deleteOfficerApplicationMutation.mutate(app.id);
                                }
                              }}
                              disabled={deleteOfficerApplicationMutation.isPending}
                              className="bg-red-600 hover:bg-red-700"
                              size="sm"
                            >
                              Delete Troll Officer
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Troll Family Applications (also shown under Verification) */}
              <Card className="bg-[#1a1a24] border-[#2a2a3a] p-6 mt-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <Users className="w-6 h-6 text-purple-400" />
                    <h3 className="text-xl font-bold text-white">Troll Family Applications</h3>
                  </div>
                  <Button
                    onClick={() => createTestFamilyApplicationMutation.mutate()}
                    disabled={createTestFamilyApplicationMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700 h-9 text-sm"
                  >
                    {createTestFamilyApplicationMutation.isPending ? 'Sending...' : 'Create Test Application'}
                  </Button>
                </div>

                {familyApplications.length === 0 ? (
                  <div className="text-center py-12">
                    <Users className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-500">No family applications yet</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                        {familyApplications.map((app) => (
                          <div key={app.id} className="bg-[#0a0a0f] rounded-lg p-4">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <h4 className="text-white font-bold text-lg">{app.family_name}</h4>
                            <p className="text-gray-400 text-sm">by @{app.username}</p>
                            <p className="text-gray-500 text-xs mt-1">
                              Level {app.user_level} • {app.user_email}
                            </p>
                          </div>
                          <Badge className={statusColors[app.status]}>
                            {app.status}
                          </Badge>
                        </div>

                        <div className="space-y-3 mb-4">
                          <div>
                            <p className="text-gray-400 text-sm mb-1">Family Description:</p>
                            <p className="text-white text-sm">{app.family_description}</p>
                          </div>
                          {app.why_create_family && (
                            <div>
                              <p className="text-gray-400 text-sm mb-1">Why Create:</p>
                              <p className="text-white text-sm">{app.why_create_family}</p>
                            </div>
                          )}
                        </div>

                        {app.status === "pending" && (
                          <div className="flex gap-3">
                            <Textarea
                              placeholder="Admin notes (optional)..."
                              value={selectedApp === app.id ? adminNotes : ""}
                              onChange={(e) => {
                                setSelectedApp(app.id);
                                setAdminNotes(e.target.value);
                              }}
                              className="bg-[#1a1a24] border-[#2a2a3a] text-white text-sm"
                              rows={2}
                            />
                            <div className="flex flex-col gap-2">
                              <Button
                                onClick={() => {
                                  reviewFamilyApplicationMutation.mutate({
                                    appId: app.id,
                                    status: "approved",
                                    notes: selectedApp === app.id ? adminNotes : ""
                                  });
                                }}
                                disabled={reviewFamilyApplicationMutation.isPending}
                                className="bg-green-600 hover:bg-green-700"
                                size="sm"
                              >
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Approve
                              </Button>
                              <Button
                                onClick={() => {
                                  reviewFamilyApplicationMutation.mutate({
                                    appId: app.id,
                                    status: "rejected",
                                    notes: selectedApp === app.id ? adminNotes : ""
                                  });
                                }}
                                disabled={reviewFamilyApplicationMutation.isPending}
                                variant="destructive"
                                size="sm"
                              >
                              <XCircle className="w-4 h-4 mr-1" />
                              Reject
                              </Button>
                              <Button
                                onClick={() => {
                                  if (window.confirm(`Cancel family application "${app.family_name}"?`)) {
                                    cancelFamilyApplicationMutation.mutate(app.id);
                                  }
                                }}
                                disabled={cancelFamilyApplicationMutation.isPending}
                                variant="outline"
                                size="sm"
                              >
                                Cancel Application
                              </Button>
                            </div>
                          </div>
                        )}

                        {app.admin_notes && (
                          <div className="mt-4 bg-blue-500/10 border border-blue-500/30 rounded p-3">
                            <p className="text-blue-300 text-sm">
                              <strong>Admin Notes:</strong> {app.admin_notes}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
          </TabsContent>

          {/* Users Tab (renamed from Officers) */}
          <TabsContent value="users">
            <Card className="bg-[#1a1a24] border-[#2a2a3a] p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <h3 className="text-xl font-bold text-white">All Users</h3>
                  <Input
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    placeholder="Search by username, email, or name..."
                    className="bg-[#0a0a0f] border-[#2a2a3a] text-white w-72"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (!user) return;
                      setUserSearchQuery(user.email || user.username || '');
                    }}
                    className="border-purple-500 text-purple-400 hover:bg-purple-500/10"
                  >
                    Find Me
                  </Button>
                  {userSearchQuery && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setUserSearchQuery("")}
                      className="text-gray-400"
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => {
                      queryClient.invalidateQueries(['adminAllUsers']);
                      queryClient.invalidateQueries(['currentUser']);
                      toast.success('Users refreshed');
                    }}
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <RefreshCw className="w-4 h-4 mr-1" />
                    Refresh Users
                  </Button>
                  {/* Quick Delete by @username */}
                  <Input
                    value={deleteHandle}
                    onChange={(e) => setDeleteHandle(e.target.value)}
                    placeholder="Delete by @username"
                    className="bg-[#0a0a0f] border-[#2a2a3a] text-white w-56"
                  />
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={async () => {
                      const raw = (deleteHandle || '').trim();
                      if (!raw) return;
                      const handle = raw.startsWith('@') ? raw.slice(1) : raw;
                      try {
                        const { data, error } = await supabase
                          .from('profiles')
                          .select('*')
                          .ilike('username', handle)
                          .limit(1);
                        if (error) throw error;
                        const target = (data || [])[0];
                        if (!target) {
                          toast.warning(`User @${handle} not found`);
                          return;
                        }
                        if (!confirm(`Delete user @${target.username}? This will ban and mark as deleted.`)) return;
                        await deleteUserMutation.mutateAsync({ userId: target.id });
                        setDeleteHandle('');
                      } catch (err) {
                        console.error('Delete by username failed:', err);
                        toast.error(err?.message || 'Failed to delete by username');
                      }
                    }}
                  >
                    Delete
                  </Button>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                    disabled={makeMeAdminMutation.isPending || getRole(user) === "admin"}
                    onClick={() => makeMeAdminMutation.mutate()}
                  >
                    <Shield className="w-4 h-4 mr-1" />
                    {getRole(user) === "admin" ? "You are Admin" : "Make Me Admin"}
                  </Button>
                </div>
              </div>

              {isSearchingUsers && (
                <div className="text-center py-4 text-gray-400 text-sm">Searching users...</div>
              )}
              {displayUsers.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-500">No users found for "{userSearchQuery}"</p>
                </div>
              ) : (
              <div className="space-y-3">
                {displayUsers.map((u) => (
                  <div key={u.id} className="bg-[#0a0a0f] rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        {u.avatar ? (
                          <img src={u.avatar} alt={u.username} className="w-12 h-12 rounded-full object-cover" />
                        ) : (
                          <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                            <span className="text-white font-bold">{u.username?.[0]?.toUpperCase() || "U"}</span>
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <Link
                              to={`${createPageUrl('PublicProfile')}?userId=${u.id}`}
                              className="text-white font-bold hover:text-purple-400 transition-colors"
                            >
                              @{u.username || "NoUsername"}
                            </Link>
                            {u.is_og && (
                              <Badge className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white">
                                <Crown className="w-3 h-3 mr-1" />
                                OG
                              </Badge>
                            )}
                            {u.is_banned && (
                              <Badge className="bg-red-500">
                                <Ban className="w-3 h-3 mr-1" />
                                BANNED
                              </Badge>
                            )}
                          </div>
                          <p className="text-gray-400 text-sm">{u.email}</p>
                          <div className="flex gap-2 mt-2">
                            <Badge className="bg-purple-500">Level {u.level || 1}</Badge>
                            <Badge className={roleColors[getRole(u) || "user"]}>
                              {getRole(u) || "user"}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-yellow-400 font-semibold">{(u.coins || 0).toLocaleString()} coins</p>
                        <p className="text-green-400 text-sm">${((u.earned_coins || 0) * 0.00625).toFixed(2)} earned</p>
                        <div className="flex gap-2 mt-2">
                          <Dialog open={viewPurchasesUserId === u.id} onOpenChange={(isOpen) => {
                            if (!isOpen) setViewPurchasesUserId(null);
                          }}>
                            <DialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-yellow-500 text-yellow-400"
                                onClick={() => setViewPurchasesUserId(u.id)}
                              >
                                <CreditCard className="w-3 h-3 mr-1" />
                                View Purchases
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="bg-[#1a1a24] border-[#2a2a3a]">
                              <DialogHeader>
                                <DialogTitle className="text-white">Purchase History — {u.username}</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-3">
                                {isLoadingUserPurchases ? (
                                  <div className="text-gray-400 text-sm">Loading purchases...</div>
                                ) : userPurchases.length === 0 ? (
                                  <div className="text-gray-400 text-sm">No purchases found.</div>
                                ) : (
                                  <div className="space-y-2">
                                    {userPurchases.map((p) => (
                                      <div key={p.id} className="bg-[#0a0a0f] border border-[#2a2a3a] rounded p-3">
                                        <div className="flex justify-between text-sm">
                                          <span className="text-white font-medium">{safeToLocaleString(p.created_date || p.created_at || p.created)}</span>
                                          <span className={p.status === 'COMPLETED' || p.status === 'success' ? 'text-green-400' : 'text-yellow-400'}>
                                            {p.status || 'unknown'}
                                          </span>
                                        </div>
                                        <div className="mt-1 text-gray-300 text-sm">
                                          <span>Coins: {(p.coins || p.coins_purchased || p.amount_coins || 0).toLocaleString()}</span>
                                          {typeof p.amount === 'number' && (
                                            <span className="ml-3">Amount: ${p.amount.toFixed(2)}</span>
                                          )}
                                          {p.order_id && (
                                            <span className="ml-3">Order: {p.order_id}</span>
                                          )}
                                          {p.paypal_order_id && (
                                            <span className="ml-3">PayPal: {p.paypal_order_id}</span>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </DialogContent>
                          </Dialog>
                          <Button
                            size="sm"
                            className="bg-blue-600 hover:bg-blue-700"
                            disabled={sendTestPaymentToUserMutation.isPending}
                            onClick={() => sendTestPaymentToUserMutation.mutate(u.id)}
                          >
                            <DollarSign className="w-3 h-3 mr-1" />
                            Test User Payout ($0.01)
                          </Button>
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button size="sm" variant="outline" className="border-blue-500 text-blue-400">
                                <Shield className="w-3 h-3 mr-1" />
                                Role
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="bg-[#1a1a24] border-[#2a2a3a]">
                              <DialogHeader>
                                <DialogTitle className="text-white">Update Role: {u.username}</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div>
                                  <Label className="text-white">Role</Label>
                                  <Select
                                    defaultValue={getRole(u) || "user"}
                                    onValueChange={(role) => {
                                      const permissions = role === "admin" ? ["all"] :
                                        role === "troll_officer" ? ["moderate_chat", "kick_users"] :
                                        role === "moderator" ? ["moderate_chat"] : [];

                                      updateUserRoleMutation.mutate({
                                        userId: u.id,
                                        role: role,
                                        permissions: permissions
                                      });
                                    }}
                                  >
                                    <SelectTrigger className="bg-[#0a0a0f] border-[#2a2a3a] text-white">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="user">User</SelectItem>
                                      <SelectItem value="moderator">Moderator</SelectItem>
                                      <SelectItem value="troll_officer">Troll Officer</SelectItem>
                                      <SelectItem value="admin">Admin</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>

                          {u.is_banned ? (
                            <Button
                              size="sm"
                              onClick={() => unbanUserMutation.mutate(u.id)}
                              disabled={unbanUserMutation.isPending}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Unban
                            </Button>
                          ) : (
                            <Dialog open={selectedUser === u.id} onOpenChange={(isOpen) => {
                                if (!isOpen) {
                                    setSelectedUser(null);
                                    setBanReason("");
                                    setBanDuration("permanent");
                                }
                            }}>
                              <DialogTrigger asChild>
                                <Button size="sm" variant="destructive" onClick={() => setSelectedUser(u.id)}>
                                  <Ban className="w-3 h-3 mr-1" />
                                  Ban
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="bg-[#1a1a24] border-[#2a2a3a]">
                                <DialogHeader>
                                  <DialogTitle className="text-white">Ban User: {u.username}</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4">
                                  <div>
                                    <Label className="text-white">Reason</Label>
                                    <Textarea
                                      value={banReason}
                                      onChange={(e) => setBanReason(e.target.value)}
                                      placeholder="Reason for ban..."
                                      className="bg-[#0a0a0f] border-[#2a2a3a] text-white"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-white">Duration</Label>
                                    <Select value={banDuration} onValueChange={setBanDuration}>
                                      <SelectTrigger className="bg-[#0a0a0f] border-[#2a2a3a] text-white">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="1day">1 Day</SelectItem>
                                        <SelectItem value="7days">7 Days</SelectItem>
                                        <SelectItem value="30days">30 Days</SelectItem>
                                        <SelectItem value="permanent">Permanent</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <Button
                                    onClick={() => {
                                      banUserMutation.mutate({
                                        userId: u.id,
                                        reason: banReason,
                                        duration: banDuration
                                      });
                                    }}
                                    disabled={!banReason.trim() || banUserMutation.isPending}
                                    variant="destructive"
                                    className="w-full"
                                  >
                                    Confirm Ban
                                  </Button>
                                </div>
                              </DialogContent>
                            </Dialog>
                          )}
                          {/* Per-user Delete (soft-delete + ban) */}
                          <Button
                            size="sm"
                            variant="destructive"
                            className="bg-red-700 hover:bg-red-800"
                            onClick={() => {
                              if (!confirm(`Delete user @${u.username}? This will ban and mark as deleted.`)) return;
                              deleteUserMutation.mutate({ userId: u.id });
                            }}
                          >
                            <XCircle className="w-3 h-3 mr-1" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              )}
            </Card>
          </TabsContent>

          {/* Broadcasters Tab - UPDATED WITH DROPDOWN INTERFACE */}
          <TabsContent value="broadcasters">
            <div className="space-y-6">
              {/* NEW: Coin Reconciliation Card */}
              <Card className="bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border-yellow-500/50 p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 bg-yellow-500/30 rounded-lg flex items-center justify-center flex-shrink-0">
                    <RefreshCw className="w-6 h-6 text-yellow-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                      Reconcile All Coins
                    </h3>
                    <p className="text-gray-300 text-sm mb-3">
                      Scans the entire app for gifts, purchases, and payments, then updates all user balances accordingly.
                    </p>
                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-4">
                      <p className="text-blue-300 text-sm">
                        <strong>What this does:</strong>
                      </p>
                      <ul className="text-blue-200 text-xs space-y-1 mt-2">
                        <li>• ✅ Processes all StreamGift records</li>
                        <li>• ✅ Verifies coin purchases are credited</li>
                        <li>• ✅ Updates earned_coins and free_coins</li>
                        <li>• ✅ Ensures broadcaster balances are correct</li>
                        <li>• ✅ Handles message payments and fees</li>
                      </ul>
                    </div>
                    <Button
                      onClick={() => {
                        if (confirm('Reconcile all coins across the entire platform? This will update all user balances.')) {
                          reconcileAllCoins();
                        }
                      }}
                      disabled={isReconciling}
                      className="w-full bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700"
                    >
                      {isReconciling ? (
                        <>
                          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                          Reconciling...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-5 h-5 mr-2" />
                          Reconcile All Coins
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Reconciliation Results */}
                {reconciliationResult && (
                  <div className="mt-6 space-y-4">
                    <h4 className="text-white font-semibold text-lg">Reconciliation Results:</h4>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Card className="bg-[#0a0a0f] border-green-500/50 p-4">
                        <p className="text-gray-400 text-xs mb-1">Gifts Processed</p>
                        <p className="text-2xl font-bold text-green-400">
                          {reconciliationResult.results.giftsProcessed}
                        </p>
                      </Card>
                      <Card className="bg-[#0a0a0f] border-blue-500/50 p-4">
                        <p className="text-gray-400 text-xs mb-1">Users Updated</p>
                        <p className="text-2xl font-bold text-blue-400">
                          {reconciliationResult.results.usersUpdated}
                        </p>
                      </Card>
                      <Card className="bg-[#0a0a0f] border-yellow-500/50 p-4">
                        <p className="text-gray-400 text-xs mb-1">Coins Added</p>
                        <p className="text-2xl font-bold text-yellow-400">
                          {reconciliationResult.results.coinsAdded.toLocaleString()}
                        </p>
                      </Card>
                      <Card className="bg-[#0a0a0f] border-purple-500/50 p-4">
                        <p className="text-gray-400 text-xs mb-1">Purchases Verified</p>
                        <p className="text-2xl font-bold text-purple-400">
                          {reconciliationResult.results.purchasesVerified}
                        </p>
                      </Card>
                    </div>

                    {reconciliationResult.results.errors.length > 0 && (
                      <Card className="bg-red-500/10 border-red-500/30 p-4">
                        <h5 className="text-red-300 font-semibold mb-2">Errors:</h5>
                        <div className="space-y-1">
                          {reconciliationResult.results.errors.slice(0, 10).map((error, idx) => (
                            <p key={idx} className="text-red-200 text-xs">• {typeof error === 'string' ? error : (error?.message || JSON.stringify(error))}</p>
                          ))}
                          {reconciliationResult.results.errors.length > 10 && (
                            <p className="text-red-300 text-xs font-semibold">
                              + {reconciliationResult.results.errors.length - 10} more errors
                            </p>
                          )}
                        </div>
                      </Card>
                    )}

                    <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                      <p className="text-green-300 text-sm">
                        ✅ Reconciliation completed at {safeToLocaleString(reconciliationResult.timestamp)}
                      </p>
                    </div>
                  </div>
                )}
              </Card>

              {/* Broadcast Message */}
              <Card className="bg-[#1a1a24] border-[#2a2a3a] p-6">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <Bell className="w-6 h-6 text-blue-400" />
                  Broadcast Message to All Users
                </h3>
                <div className="space-y-4">
                  <div>
                    <Label className="text-white">Title</Label>
                    <Input
                      value={broadcastTitle}
                      onChange={(e) => setBroadcastTitle(e.target.value)}
                      placeholder="Announcement title..."
                      className="bg-[#0a0a0f] border-[#2a2a3a] text-white"
                    />
                  </div>
                  <div>
                    <Label className="text-white">Message</Label>
                    <Textarea
                      value={broadcastMessage}
                      onChange={(e) => setBroadcastMessage(e.target.value)}
                      placeholder="Your message to all users..."
                      className="bg-[#0a0a0f] border-[#2a2a3a] text-white min-h-[120px]"
                    />
                  </div>
                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                    <p className="text-yellow-300 text-sm">
                      ⚠️ This will send a notification to all {allUsersWithCurrent.length} users
                    </p>
                  </div>
                  <Button
                    onClick={() => {
                      if (!broadcastTitle.trim() || !broadcastMessage.trim()) {
                        toast.error("Please enter both title and message");
                        return;
                      }
                      if (confirm(`Send broadcast to ${allUsersWithCurrent.length} users?`)) {
                        sendBroadcastMutation.mutate({
                          title: broadcastTitle,
                          message: broadcastMessage
                        });
                      }
                    }}
                    disabled={!broadcastTitle.trim() || !broadcastMessage.trim() || sendBroadcastMutation.isPending}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                    {sendBroadcastMutation.isPending ? "Sending..." : "Send Broadcast"}
                  </Button>
                </div>
              </Card>

              {/* Admin Tools - Compact Dropdown Style */}
              {actionsDisabled && (
                <div className="bg-yellow-900/40 border border-yellow-700/40 rounded p-3 mb-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-yellow-300 text-xs">
                      Supabase is not configured. Admin actions {effectiveActionsDisabled ? 'are' : 'were'} disabled in local development.
                    </p>
                    {isAdmin && (
                      <label className="flex items-center gap-2 text-xs text-yellow-200">
                        <input
                          type="checkbox"
                          checked={adminOverrideEnabled}
                          onChange={(e) => setAdminOverrideEnabled(e.target.checked)}
                        />
                        Override (Admin only)
                      </label>
                    )}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Manual Payout */}
                <Card className="bg-[#1a1a24] border-[#2a2a3a] p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                      <DollarSign className="w-5 h-5 text-green-400" />
                    </div>
                    <h4 className="text-white font-bold text-sm">Manual Payout</h4>
                  </div>
                  <div className="space-y-3">
                    <Select value={manualPayoutUser || ""} onValueChange={setManualPayoutUser}>
                      <SelectTrigger className="bg-[#0a0a0f] border-[#2a2a3a] text-white text-sm h-9">
                        <SelectValue placeholder="Select user..." />
                      </SelectTrigger>
                      <SelectContent>
                        {allUsersWithCurrent.map(u => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.username || u.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      value={manualPayoutAmount}
                      onChange={(e) => setManualPayoutAmount(e.target.value)}
                      placeholder="Amount (USD)"
                      className="bg-[#0a0a0f] border-[#2a2a3a] text-white text-sm h-9"
                    />
                    <Button
                      onClick={() => {
                        if (!manualPayoutUser || !manualPayoutAmount) {
                          toast.error("Select user and enter amount");
                          return;
                        }
                        createManualPayoutMutation.mutate({
                          userId: manualPayoutUser,
                          amount: manualPayoutAmount
                        });
                      }}
                      disabled={!manualPayoutUser || !manualPayoutAmount || createManualPayoutMutation.isPending || effectiveActionsDisabled}
                      className="w-full bg-green-600 hover:bg-green-700 h-9 text-sm"
                    >
                      Create Payout
                    </Button>
                  </div>
                </Card>

                {/* Add Coins */}
                <Card className="bg-[#1a1a24] border-[#2a2a3a] p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-yellow-500/20 rounded-lg flex items-center justify-center">
                      <Coins className="w-5 h-5 text-yellow-400" />
                    </div>
                    <h4 className="text-white font-bold text-sm">Add Coins</h4>
                  </div>
                  <div className="space-y-3">
                    <Select value={addCoinsUserId || ""} onValueChange={setAddCoinsUserId}>
                      <SelectTrigger className="bg-[#0a0a0f] border-[#2a2a3a] text-white text-sm h-9">
                        <SelectValue placeholder="Select user..." />
                      </SelectTrigger>
                      <SelectContent>
                        {allUsersWithCurrent.map(u => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.username || u.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={addCoinsCoinType} onValueChange={setAddCoinsCoinType}>
                      <SelectTrigger className="bg-[#0a0a0f] border-[#2a2a3a] text-white text-sm h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="free">Free Coins</SelectItem>
                        <SelectItem value="paid">Paid Coins</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      value={addCoinsAmount}
                      onChange={(e) => setAddCoinsAmount(e.target.value)}
                      placeholder="Amount"
                      className="bg-[#0a0a0f] border-[#2a2a3a] text-white text-sm h-9"
                    />
                    <Button
                      onClick={() => {
                        if (!addCoinsUserId || !addCoinsAmount) {
                          toast.error("Select user and enter amount");
                          return;
                        }
                        addCoinsMutation.mutate({
                          userId: addCoinsUserId,
                          amount: addCoinsAmount,
                          coinType: addCoinsCoinType
                        });
                      }}
                      disabled={!addCoinsUserId || !addCoinsAmount || addCoinsMutation.isPending || effectiveActionsDisabled}
                      className={`w-full h-9 text-sm ${addCoinsCoinType === "free" ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"}`}
                    >
                      Add Coins
                    </Button>
                  </div>
                </Card>

                {/* Add Levels */}
                <Card className="bg-[#1a1a24] border-[#2a2a3a] p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                      <Crown className="w-5 h-5 text-purple-400" />
                    </div>
                    <h4 className="text-white font-bold text-sm">Add Levels</h4>
                  </div>
                  <div className="space-y-3">
                    <Select value={addLevelUserId || ""} onValueChange={setAddLevelUserId}>
                      <SelectTrigger className="bg-[#0a0a0f] border-[#2a2a3a] text-white text-sm h-9">
                        <SelectValue placeholder="Select user..." />
                      </SelectTrigger>
                      <SelectContent>
                        {allUsersWithCurrent.map(u => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.username || u.full_name} (Lv {u.level || 1})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      value={addLevelAmount}
                      onChange={(e) => setAddLevelAmount(e.target.value)}
                      placeholder="Levels"
                      className="bg-[#0a0a0f] border-[#2a2a3a] text-white text-sm h-9"
                    />
                    <Button
                      onClick={() => {
                        if (!addLevelUserId || !addLevelAmount) {
                          toast.error("Select user and enter levels");
                          return;
                        }
                        addLevelMutation.mutate({
                          userId: addLevelUserId,
                          levels: addLevelAmount
                        });
                      }}
                      disabled={!addLevelUserId || !addLevelAmount || addLevelMutation.isPending || effectiveActionsDisabled}
                      className="w-full bg-purple-600 hover:bg-purple-700 h-9 text-sm"
                    >
                      Add Levels
                    </Button>
                  </div>
                </Card>

                {/* Revenue Share */}
                <Card className="bg-[#1a1a24] border-[#2a2a3a] p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-indigo-500/20 rounded-lg flex items-center justify-center">
                      <DollarSign className="w-5 h-5 text-indigo-400" />
                    </div>
                    <h4 className="text-white font-bold text-sm">Revenue Share</h4>
                  </div>
                  <div className="space-y-3">
                    <Select value={revenueShareUserId || ""} onValueChange={setRevenueShareUserId}>
                      <SelectTrigger className="bg-[#0a0a0f] border-[#2a2a3a] text-white text-sm h-9">
                        <SelectValue placeholder="Select user..." />
                      </SelectTrigger>
                      <SelectContent>
                        {allUsersWithCurrent.map(u => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.username || u.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      value={revenueSharePercentage}
                      onChange={(e) => setRevenueSharePercentage(e.target.value)}
                      placeholder="Percentage"
                      min="0"
                      max="100"
                      step="0.1"
                      className="bg-[#0a0a0f] border-[#2a2a3a] text-white text-sm h-9"
                    />
                    <Button
                      onClick={() => {
                        if (!revenueShareUserId || !revenueSharePercentage) {
                          toast.error("Select user and enter percentage");
                          return;
                        }
                        setRevenueShareMutation.mutate({
                          userId: revenueShareUserId,
                          percentage: revenueSharePercentage
                        });
                      }}
                      disabled={!revenueShareUserId || !revenueSharePercentage || setRevenueShareMutation.isPending || effectiveActionsDisabled}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 h-9 text-sm"
                    >
                      Set Share
                    </Button>
                  </div>
                </Card>

                {/* Reset Revenue */}
                <Card className="bg-[#1a1a24] border-[#2a2a3a] p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-red-400" />
                    </div>
                    <h4 className="text-white font-bold text-sm">Reset Revenue</h4>
                  </div>
                  <div className="space-y-3">
                    <div className="bg-red-500/10 border border-red-500/30 rounded p-2">
                      <p className="text-red-300 text-xs">
                        ⚠️ Converts all paid coins to free
                      </p>
                    </div>
                    <div className="bg-[#0a0a0f] rounded p-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">Current:</span>
                        <span className="text-green-400 font-bold">${revenue.totalCoinsRevenue.toFixed(2)}</span>
                      </div>
                    </div>
                    <Button
                      onClick={() => resetAllRevenueMutation.mutate()}
                      disabled={resetAllRevenueMutation.isPending || revenue.totalCoinsRevenue === 0 || effectiveActionsDisabled}
                      className="w-full bg-red-600 hover:bg-red-700 h-9 text-sm"
                    >
                      {resetAllRevenueMutation.isPending ? "Resetting..." : "Reset to $0"}
                    </Button>
                  </div>
                </Card>

                {/* Test Payments */}
                <Card className="bg-[#1a1a24] border-[#2a2a3a] p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                      <Coins className="w-5 h-5 text-blue-400" />
                    </div>
                    <h4 className="text-white font-bold text-sm">Test Payments</h4>
                  </div>
                  <div className="space-y-3">
                    <div className="bg-blue-500/10 border border-blue-500/30 rounded p-2">
                      <p className="text-blue-300 text-xs">
                        💳 Send $0.01 to all {allUsers.length} users
                      </p>
                    </div>
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-2">
                      <p className="text-yellow-300 text-xs">
                        Total: ${(allUsers.length * 0.01).toFixed(2)}
                      </p>
                    </div>
                    <Button
                      onClick={() => sendTestPaymentsMutation.mutate()}
                      disabled={sendTestPaymentsMutation.isPending}
                      className="w-full bg-blue-600 hover:bg-blue-700 h-9 text-sm"
                    >
                      {sendTestPaymentsMutation.isPending ? "Sending..." : "Send Test"}
                    </Button>
                  </div>
                </Card>
              </div>

              {/* Fix User Coins Section */}
              <Card className="bg-[#1a1a24] border-[#2a2a3a] p-6">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <Coins className="w-5 h-5 text-orange-400" />
                  Fix User Coin Balances
                </h3>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {allUsers.filter(u => (u.purchased_coins || 0) > 0).map(u => (
                    <div key={u.id} className="bg-[#0a0a0f] rounded-lg p-3 flex items-center justify-between">
                      <div>
                        <p className="text-white font-semibold text-sm">@{u.username || u.full_name}</p>
                        <div className="flex gap-2 text-xs mt-1">
                          <span className="text-yellow-400">{(u.coins || 0).toLocaleString()} total</span>
                          <span className="text-green-400">{(u.purchased_coins || 0).toLocaleString()} paid</span>
                          <span className="text-red-400">{(u.free_coins || 0).toLocaleString()} free</span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => {
                          if (confirm(`Convert all ${u.coins} coins to free coins for ${u.username}?`)) {
                            fixUserCoinsMutation.mutate({ userId: u.id, makeAllFree: true });
                          }
                        }}
                        disabled={fixUserCoinsMutation.isPending}
                        className="bg-orange-600 hover:bg-orange-700 h-8 text-xs"
                      >
                        Make All Free
                      </Button>
                    </div>
                  ))}
                  {allUsers.filter(u => (u.purchased_coins || 0) > 0).length === 0 && (
                    <div className="text-center py-6 text-gray-500">
                      <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
                      <p className="text-sm">All users have correct coin balances!</p>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </TabsContent>

          {/* Families Tab (was Troll Family Applications from Applications tab) */}
          <TabsContent value="families">
            <Card className="bg-[#1a1a24] border-[#2a2a3a] p-6">
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                  <Users className="w-6 h-6 text-purple-400" />
                  Troll Family Applications
                </h3>

                {familyApplications.length === 0 ? (
                  <div className="text-center py-12">
                    <Users className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-500">No family applications yet</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {familyApplications.map((app) => (
                      <div key={app.id} className="bg-[#0a0a0f] rounded-lg p-4">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <h4 className="text-white font-bold text-lg">{app.family_name}</h4>
                            <p className="text-gray-400 text-sm">by @{app.username}</p>
                            <p className="text-gray-500 text-xs mt-1">
                              Level {app.user_level} • {app.user_email}
                            </p>
                          </div>
                          <Badge className={statusColors[app.status]}>
                            {app.status}
                          </Badge>
                        </div>

                        <div className="space-y-3 mb-4">
                          <div>
                            <p className="text-gray-400 text-sm mb-1">Family Description:</p>
                            <p className="text-white text-sm">{app.family_description}</p>
                          </div>
                          {app.why_create_family && (
                            <div>
                              <p className="text-gray-400 text-sm mb-1">Why Create:</p>
                              <p className="text-white text-sm">{app.why_create_family}</p>
                            </div>
                          )}
                        </div>

                        {app.status === "pending" && (
                          <div className="flex gap-3">
                            <Textarea
                              placeholder="Admin notes (optional)..."
                              value={selectedApp === app.id ? adminNotes : ""}
                              onChange={(e) => {
                                setSelectedApp(app.id);
                                setAdminNotes(e.target.value);
                              }}
                              className="bg-[#1a1a24] border-[#2a2a3a] text-white text-sm"
                              rows={2}
                            />
                            <div className="flex flex-col gap-2">
                              <Button
                                onClick={() => {
                                  reviewFamilyApplicationMutation.mutate({
                                    appId: app.id,
                                    status: "approved",
                                    notes: selectedApp === app.id ? adminNotes : ""
                                  });
                                }}
                                disabled={reviewFamilyApplicationMutation.isPending}
                                className="bg-green-600 hover:bg-green-700"
                                size="sm"
                              >
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Approve
                              </Button>
                              <Button
                                onClick={() => {
                                  reviewFamilyApplicationMutation.mutate({
                                    appId: app.id,
                                    status: "rejected",
                                    notes: selectedApp === app.id ? adminNotes : ""
                                  });
                                }}
                                disabled={reviewFamilyApplicationMutation.isPending}
                                variant="destructive"
                                size="sm"
                              >
                                <XCircle className="w-4 h-4 mr-1" />
                                Reject
                              </Button>
                            </div>
                          </div>
                        )}

                        {app.admin_notes && (
                          <div className="mt-4 bg-blue-500/10 border border-blue-500/30 rounded p-3">
                            <p className="text-blue-300 text-sm">
                              <strong>Admin Notes:</strong> {app.admin_notes}
                            </p>
                          </div>
                        )}

                        {app.status === "approved" && (
                          <div className="flex justify-end mt-2">
                            <Button
                              onClick={() => {
                                if (window.confirm(`Delete approved family "${app.family_name}"? This cannot be undone.`)) {
                                  deleteFamilyApplicationMutation.mutate(app.id);
                                }
                              }}
                              disabled={deleteFamilyApplicationMutation.isPending}
                              className="bg-red-600 hover:bg-red-700"
                              size="sm"
                            >
                              Delete Troll Family
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
          </TabsContent>

          {/* NEW: AI Moderation Tab */}
          <TabsContent value="moderation">
            <div className="space-y-6">
              {/* Moderation Settings */}
              <Card className="bg-[#1a1a24] border-[#2a2a3a] p-6">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <Shield className="w-6 h-6 text-green-400" />
                  AI Moderation Settings
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div className="bg-[#0a0a0f] rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-white font-semibold">AI Moderation</label>
                      <Button
                        size="sm"
                        variant={currentSettings.enabled ? "default" : "outline"}
                        onClick={() => {
                          const next = { ...currentSettings, enabled: !currentSettings.enabled };
                          setModerationSettingsState(next);
                          updateModerationSettingsMutation.mutate(next);
                        }}
                        className={currentSettings.enabled ? "bg-green-600 hover:bg-green-700" : "bg-gray-700 hover:bg-gray-600"}
                      >
                        {currentSettings.enabled ? "Enabled" : "Disabled"}
                      </Button>
                    </div>
                    <p className="text-gray-400 text-xs">Enable AI-powered content moderation</p>
                  </div>

                  <div className="bg-[#0a0a0f] rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-white font-semibold">Auto-Delete</label>
                      <Button
                        size="sm"
                        variant={currentSettings.auto_delete_enabled ? "default" : "outline"}
                        onClick={() => {
                          const next = { ...currentSettings, auto_delete_enabled: !currentSettings.auto_delete_enabled };
                          setModerationSettingsState(next);
                          updateModerationSettingsMutation.mutate(next);
                        }}
                        className={currentSettings.auto_delete_enabled ? "bg-red-600 hover:bg-red-700" : "bg-gray-700 hover:bg-gray-600"}
                      >
                        {currentSettings.auto_delete_enabled ? "On" : "Off"}
                      </Button>
                    </div>
                    <p className="text-gray-400 text-xs">Automatically delete flagged messages</p>
                  </div>

                  <div className="bg-[#0a0a0f] rounded-lg p-4">
                    <label className="text-white font-semibold mb-2 block">Auto-Delete Threshold</label>
                    <Select
                      value={currentSettings.auto_delete_threshold}
                      onValueChange={(value) => {
                        const next = { ...currentSettings, auto_delete_threshold: value };
                        setModerationSettingsState(next);
                        updateModerationSettingsMutation.mutate(next);
                      }}
                    >
                      <SelectTrigger className="bg-[#1a1a24] border-[#2a2a3a] text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#0a0a0f] border-[#2a2a3a]">
                        <SelectItem value="medium">Medium & Above</SelectItem>
                        <SelectItem value="high">High & Critical Only</SelectItem>
                        <SelectItem value="critical">Critical Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="bg-[#0a0a0f] rounded-lg p-4">
                    <label className="text-white font-semibold mb-2 block">Admin Notification Threshold</label>
                    <Select
                      value={currentSettings.notify_threshold}
                      onValueChange={(value) => {
                        const next = { ...currentSettings, notify_threshold: value };
                        setModerationSettingsState(next);
                        updateModerationSettingsMutation.mutate(next);
                      }}
                    >
                      <SelectTrigger className="bg-[#1a1a24] border-[#2a2a3a] text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#0a0a0f] border-[#2a2a3a]">
                        <SelectItem value="low">All Flags</SelectItem>
                        <SelectItem value="medium">Medium & Above</SelectItem>
                        <SelectItem value="high">High & Critical</SelectItem>
                        <SelectItem value="critical">Critical Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="bg-[#0a0a0f] rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-white font-semibold">Strict Mode</label>
                      <Button
                        size="sm"
                        variant={currentSettings.strict_mode ? "default" : "outline"}
                        onClick={() => {
                          const next = { ...currentSettings, strict_mode: !currentSettings.strict_mode };
                          setModerationSettingsState(next);
                          updateModerationSettingsMutation.mutate(next);
                        }}
                        className={currentSettings.strict_mode ? "bg-orange-600 hover:bg-orange-700" : "bg-gray-700 hover:bg-gray-600"}
                      >
                        {currentSettings.strict_mode ? "On" : "Off"}
                      </Button>
                    </div>
                    <p className="text-gray-400 text-xs">More aggressive content filtering</p>
                  </div>

                  <div className="bg-[#0a0a0f] rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-white font-semibold">Admin Notifications</label>
                      <Button
                        size="sm"
                        variant={currentSettings.notify_admins ? "default" : "outline"}
                        onClick={() => {
                          const next = { ...currentSettings, notify_admins: !currentSettings.notify_admins };
                          setModerationSettingsState(next);
                          updateModerationSettingsMutation.mutate(next);
                        }}
                        className={currentSettings.notify_admins ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-700 hover:bg-gray-600"}
                      >
                        {currentSettings.notify_admins ? "On" : "Off"}
                      </Button>
                    </div>
                    <p className="text-gray-400 text-xs">Notify admins of flagged content</p>
                  </div>
                </div>
              </Card>

              {/* Flagged Messages */}
              <Card className="bg-[#1a1a24] border-[#2a2a3a] p-6">
                <h3 className="text-xl font-bold text-white mb-4">Flagged Messages ({moderationActions.length})</h3>

                {moderationActions.length === 0 ? (
                  <div className="text-center py-12">
                    <Shield className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-500">No flagged messages yet</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[600px] overflow-y-auto">
                    {moderationActions.map((action) => (
                      <div key={action.id} className="bg-[#0a0a0f] rounded-lg p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Link
                                to={`${createPageUrl('PublicProfile')}?userId=${action.user_id}`}
                                className="text-white font-semibold hover:text-purple-400 transition-colors"
                              >
                                @{action.username}
                              </Link>
                              <Badge className={
                                action.severity === 'critical' ? 'bg-red-500' :
                                action.severity === 'high' ? 'bg-orange-500' :
                                action.severity === 'medium' ? 'bg-yellow-500' :
                                'bg-blue-500'
                              }>
                                {action.severity}
                              </Badge>
                              <Badge variant="outline" className="text-xs border-gray-600 text-gray-400">
                                {action.violation_type}
                              </Badge>
                              {action.reviewed_by_admin && (
                                <Badge className="bg-green-500">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Reviewed
                                </Badge>
                              )}
                              {action.false_positive && (
                                <Badge className="bg-blue-500">False Positive</Badge>
                              )}
                            </div>
                            <p className="text-gray-400 text-sm mb-2">{action.original_message}</p>
                            <p className="text-gray-500 text-xs italic">AI: {action.ai_reason}</p>
                            <p className="text-gray-600 text-xs mt-1">
                              {safeFormatDate(action.created_date, { dateStyle: 'medium', timeStyle: 'short' })}
                            </p>
                          </div>
                        </div>

                        {!action.reviewed_by_admin && (
                          <div className="flex gap-2 mt-3">
                            <Button
                              size="sm"
                              onClick={() => reviewModerationMutation.mutate({
                                actionId: action.id,
                                falsePositive: true,
                                adminNotes: 'Marked as false positive by admin'
                              })}
                              className="bg-blue-600 hover:bg-blue-700"
                              disabled={reviewModerationMutation.isPending || effectiveActionsDisabled}
                            >
                              False Positive
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => reviewModerationMutation.mutate({
                                actionId: action.id,
                                falsePositive: false,
                                adminNotes: 'Confirmed violation'
                              })}
                              className="bg-red-600 hover:bg-red-700"
                              disabled={reviewModerationMutation.isPending || effectiveActionsDisabled}
                            >
                              Confirm Violation
                            </Button>
                          </div>
                        )}

                        {/* Removed misplaced Delete Family action from moderation list */}

                        {action.admin_notes && (
                          <div className="mt-3 bg-blue-500/10 border border-blue-500/30 rounded p-2">
                            <p className="text-blue-300 text-xs">
                              <strong>Admin:</strong> {action.admin_notes}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </TabsContent>

          {/* NEW: Gambling Tab */}
          <TabsContent value="gambling">
            <div className="space-y-6">
              <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4 mb-6">
                <p className="text-purple-300 text-sm font-bold mb-2">
                  🎲 <strong>Gambling/Entertainment System</strong>
                </p>
                <p className="text-purple-200 text-xs">
                  Monitor coin conversions, game activity, and ensure legal compliance. All coins have no cash value and are for entertainment only.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Quick Access */}
                <Card className="bg-[#1a1a24] border-[#2a2a3a]">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2 text-lg">
                      <Sparkles className="w-5 h-5 text-yellow-400" />
                      Quick Access
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Gambling quick access disabled until further notice */}
                  </CardContent>
                </Card>

                {/* Supabase Status */}
                <Card className="bg-[#1a1a24] border-[#2a2a3a]">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2 text-lg">
                      <Shield className="w-5 h-5 text-purple-400" />
                      Supabase Status
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="bg-[#0a0a0f] rounded-lg p-3">
                      <p className="text-gray-400 text-xs mb-2">Required Tables:</p>
                      <div className="space-y-1">
                        <p className="text-purple-400 font-mono text-xs">gambling_users</p>
                        <p className="text-purple-400 font-mono text-xs">gambling_wallets</p>
                        <p className="text-purple-400 font-mono text-xs">gambling_purchases</p>
                        <p className="text-purple-400 font-mono text-xs">gambling_conversions</p>
                        <p className="text-purple-400 font-mono text-xs">gambling_transactions</p>
                      </div>
                    </div>
                    <Button
                      onClick={verifySupabaseConnection}
                      disabled={isVerifyingSupabase}
                      variant="outline"
                      className="w-full border-purple-500 text-purple-400"
                    >
                      {isVerifyingSupabase ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Testing...
                        </>
                      ) : (
                        <>
                          <Shield className="w-4 h-4 mr-2" />
                          Test Connection
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>

                {/* Setup Instructions */}
                <Card className="bg-[#1a1a24] border-[#2a2a3a]">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2 text-lg">
                      <AlertCircle className="w-5 h-5 text-blue-400" />
                      Setup Required
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3 text-xs">
                      <div className="bg-blue-500/10 border border-blue-500/30 rounded p-3">
                        <p className="text-blue-300 font-bold mb-2">📋 Setup Steps:</p>
                        <ol className="text-blue-200 space-y-1">
                          <li>1. Go to Supabase SQL Editor</li>
                          <li>2. Copy supabase-gambling-schema.sql</li>
                          <li>3. Paste and click "Run"</li>
                          <li>4. Test connection above</li>
                          <li>5. Access via "Games" link in sidebar</li>
                        </ol>
                      </div>
                      <div className="bg-red-500/10 border border-red-500/30 rounded p-3">
                        <p className="text-red-300 text-xs">
                          ⚠️ <strong>Legal:</strong> All coins have zero cash value. Entertainment only.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Schema Reference */}
              <Card className="bg-[#1a1a24] border-[#2a2a3a]">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <FileText className="w-6 h-6 text-green-400" />
                    Supabase Schema Reference
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-[#0a0a0f] rounded-lg p-4">
                    <p className="text-gray-400 text-sm mb-3">
                      📄 <strong>File:</strong> supabase-gambling-schema.sql
                    </p>
                    <p className="text-gray-300 text-sm mb-4">
                      Copy this schema and run it in your Supabase SQL Editor to create all required tables for the gambling system.
                    </p>
                    <div className="bg-black/50 rounded p-3 max-h-96 overflow-auto">
                      <pre className="text-green-400 font-mono text-xs">
{`-- Copy this to Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create gambling_users table
CREATE TABLE gambling_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supabase_user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id),
    email TEXT UNIQUE NOT NULL,
    age_verified BOOLEAN DEFAULT FALSE,
    country TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create gambling_wallets table
CREATE TABLE gambling_wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES public.gambling_users(id),
    free_coin_balance BIGINT DEFAULT 0 NOT NULL,
    real_coin_balance BIGINT DEFAULT 0 NOT NULL,
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    stats JSONB DEFAULT '{}'::jsonb NOT NULL, -- e.g., {'total_wagered': 1000, 'total_won': 900}
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create gambling_purchases table
CREATE TABLE gambling_purchases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.gambling_users(id),
    transaction_id TEXT UNIQUE NOT NULL, -- Reference to external payment gateway transaction ID
    amount_usd NUMERIC(10, 2) NOT NULL,
    real_coins_purchased BIGINT NOT NULL, -- Coins purchased with real money
    free_coins_bonus BIGINT DEFAULT 0 NOT NULL, -- Bonus coins given with purchase
    total_coins_credited BIGINT NOT NULL,
    payment_status TEXT DEFAULT 'pending' NOT NULL, -- 'pending', 'completed', 'failed', 'refunded'
    currency TEXT DEFAULT 'USD' NOT NULL,
    purchase_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    processor_details JSONB DEFAULT '{}'::jsonb, -- e.g., PayPal order details
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create gambling_conversions table (for converting real_coins to free_coins for use in games)
CREATE TABLE gambling_conversions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.gambling_users(id),
    real_coins_converted BIGINT NOT NULL,
    free_coins_received BIGINT NOT NULL,
    conversion_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create gambling_transactions table (for game play, wins, losses, etc.)
CREATE TABLE gambling_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.gambling_users(id),
    wallet_id UUID NOT NULL REFERENCES public.gambling_wallets(id),
    type TEXT NOT NULL, -- 'wager', 'win', 'loss', 'bonus', 'deposit', 'withdrawal' (to free_coins), 'refund'
    game_id UUID, -- Reference to specific game if applicable
    amount BIGINT NOT NULL, -- Amount of coins for this transaction (positive for credit, negative for debit)
    balance_before BIGINT NOT NULL,
    balance_after BIGINT NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb, -- e.g., {'game_result': 'win', 'multiplier': 2.5}
    transaction_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE gambling_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE gambling_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE gambling_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE gambling_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gambling_transactions ENABLE ROW LEVEL SECURITY;

-- Policies for gambling_users
CREATE POLICY "Public users can view their own gambling user profile" ON gambling_users
  FOR SELECT USING (auth.uid() = supabase_user_id);
CREATE POLICY "Users can insert their own gambling user profile" ON gambling_users
  FOR INSERT WITH CHECK (auth.uid() = supabase_user_id);
CREATE POLICY "Users can update their own gambling user profile" ON gambling_users
  FOR UPDATE USING (auth.uid() = supabase_user_id);

-- Policies for gambling_wallets
CREATE POLICY "Public users can view their own gambling wallet" ON gambling_wallets
  FOR SELECT USING ((SELECT supabase_user_id FROM gambling_users WHERE id = user_id) = auth.uid());
CREATE POLICY "Users can update their own gambling wallet" ON gambling_wallets
  FOR UPDATE USING ((SELECT supabase_user_id FROM gambling_users WHERE id = user_id) = auth.uid());

-- Policies for gambling_purchases
CREATE POLICY "Public users can view their own gambling purchases" ON gambling_purchases
  FOR SELECT USING ((SELECT supabase_user_id FROM gambling_users WHERE id = user_id) = auth.uid());
CREATE POLICY "Users can insert their own gambling purchases" ON gambling_purchases
  FOR INSERT WITH CHECK ((SELECT supabase_user_id FROM gambling_users WHERE id = user_id) = auth.uid());

-- Policies for gambling_conversions
CREATE POLICY "Public users can view their own gambling conversions" ON gambling_conversions
  FOR SELECT USING ((SELECT supabase_user_id FROM gambling_users WHERE id = user_id) = auth.uid());
CREATE POLICY "Users can insert their own gambling conversions" ON gambling_conversions
  FOR INSERT WITH CHECK ((SELECT supabase_user_id FROM gambling_users WHERE id = user_id) = auth.uid());

-- Policies for gambling_transactions
CREATE POLICY "Public users can view their own gambling transactions" ON gambling_transactions
  FOR SELECT USING ((SELECT supabase_user_id FROM gambling_users WHERE id = user_id) = auth.uid());
CREATE POLICY "Users can insert their own gambling transactions" ON gambling_transactions
  FOR INSERT WITH CHECK ((SELECT supabase_user_id FROM gambling_users WHERE id = user_id) = auth.uid());

-- Functions:
-- Ensure you have functions for handling coin changes, e.g., decrementing real_coins, incrementing free_coins, logging transactions.
-- Example: A function for converting real coins to free coins
CREATE OR REPLACE FUNCTION convert_real_to_free_coins(
    p_user_id UUID,
    p_real_coins_amount BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_gambling_user_id UUID;
    v_current_real_balance BIGINT;
    v_current_free_balance BIGINT;
BEGIN
    -- Get gambling_user_id from supabase_user_id
    SELECT id INTO v_gambling_user_id FROM gambling_users WHERE supabase_user_id = p_user_id;

    IF v_gambling_user_id IS NULL THEN
        RAISE EXCEPTION 'Gambling user not found for supabase_user_id: %', p_user_id;
    END IF;

    -- Lock the wallet row to prevent race conditions
    SELECT real_coin_balance, free_coin_balance INTO v_current_real_balance, v_current_free_balance
    FROM gambling_wallets
    WHERE user_id = v_gambling_user_id
    FOR UPDATE;

    -- Check if user has enough real coins
    IF v_current_real_balance < p_real_coins_amount THEN
        RAISE EXCEPTION 'Insufficient real coins for conversion. Available: %, Requested: %', v_current_real_balance, p_real_coins_amount;
    END IF;

    -- Update balances
    UPDATE gambling_wallets
    SET
        real_coin_balance = real_coin_balance - p_real_coins_amount,
        free_coin_balance = free_coin_balance + p_real_coins_amount,
        updated_at = timezone('utc'::text, now())
    WHERE user_id = v_gambling_user_id;

    -- Log the conversion
    INSERT INTO gambling_conversions (user_id, real_coins_converted, free_coins_received)
    VALUES (v_gambling_user_id, p_real_coins_amount, p_real_coins_amount);

    -- Log transaction for real coins decrement
    INSERT INTO gambling_transactions (user_id, wallet_id, type, amount, balance_before, balance_after, description)
    SELECT v_gambling_user_id, id, 'withdrawal', -p_real_coins_amount, v_current_real_balance, v_current_real_balance - p_real_coins_amount, 'Convert real to free'
    FROM gambling_wallets WHERE user_id = v_gambling_user_id;

    -- Log transaction for free coins increment
    INSERT INTO gambling_transactions (user_id, wallet_id, type, amount, balance_before, balance_after, description)
    SELECT v_gambling_user_id, id, 'deposit', p_real_coins_amount, v_current_free_balance, v_current_free_balance + p_real_coins_amount, 'Receive from real coin conversion'
    FROM gambling_wallets WHERE user_id = v_gambling_user_id;

END;
$$;


-- Triggers:
-- For updating 'updated_at' column automatically
CREATE TRIGGER set_timestamp
BEFORE UPDATE ON gambling_users
FOR EACH ROW
EXECUTE PROCEDURE trigger_set_timestamp();

CREATE TRIGGER set_timestamp
BEFORE UPDATE ON gambling_wallets
FOR EACH ROW
EXECUTE PROCEDURE trigger_set_timestamp();

CREATE TRIGGER set_timestamp
BEFORE UPDATE ON gambling_purchases
FOR EACH ROW
EXECUTE PROCEDURE trigger_set_timestamp();


-- Recommended indexes for performance
CREATE INDEX IF NOT EXISTS gambling_users_supabase_user_id_idx ON gambling_users (supabase_user_id);
CREATE INDEX IF NOT EXISTS gambling_wallets_user_id_idx ON gambling_wallets (user_id);
CREATE INDEX IF NOT EXISTS gambling_purchases_user_id_idx ON gambling_purchases (user_id);
CREATE INDEX IF NOT EXISTS gambling_purchases_transaction_id_idx ON gambling_purchases (transaction_id);
CREATE INDEX IF NOT EXISTS gambling_conversions_user_id_idx ON gambling_conversions (user_id);
CREATE INDEX IF NOT EXISTS gambling_transactions_user_id_idx ON gambling_transactions (user_id);
CREATE INDEX IF NOT EXISTS gambling_transactions_game_id_idx ON gambling_transactions (game_id);

-- Location: supabase-gambling-schema.sql`}
                      </pre>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Legal Compliance */}
              <Card className="bg-red-500/10 border-red-500/50">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <AlertCircle className="w-6 h-6 text-red-400" />
                    Legal Compliance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="bg-red-500/20 border-2 border-red-500 rounded-lg p-4">
                      <p className="text-red-300 font-bold text-sm mb-2">
                        ⚠️ ENTERTAINMENT ONLY - NO CASH VALUE
                      </p>
                      <p className="text-red-200 text-xs">
                        All purchases convert immediately into free in-app coins used only for entertainment. 
                        Free coins have no cash value and cannot be redeemed, transferred, or exchanged.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-[#0a0a0f] rounded-lg p-3">
                        <p className="text-green-400 font-bold text-sm mb-2">✅ Implemented:</p>
                        <ul className="text-green-300 text-xs space-y-1">
                          <li>• Legal banner on page</li>
                          <li>• Age gate (18+ verification)</li>
                          <li>• Terms checkbox required</li>
                          <li>• No cash redemption</li>
                          <li>• Entertainment purpose clear</li>
                        </ul>
                      </div>
                      <div className="bg-[#0a0a0f] rounded-lg p-3">
                        <p className="text-yellow-400 font-bold text-sm mb-2">⚠️ Important:</p>
                        <ul className="text-yellow-300 text-xs space-y-1">
                          <li>• Must be 18+ to access</li>
                          <li>• Region restrictions may apply</li>
                          <li>• Check local gambling laws</li>
                          <li>• For demo/prototype only</li>
                          <li>• Consult legal counsel</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* NEW: Settings Tab */}
        <TabsContent value="settings">
            <div className="space-y-6">
              {/* CRITICAL: Danger Zone */}
              <Card className="bg-gradient-to-br from-red-500/20 to-orange-500/20 border-red-500/50">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <AlertCircle className="w-6 h-6 text-red-400" />
                    🚨 Danger Zone
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-red-500/20 border-2 border-red-500 rounded-lg p-4">
                    <p className="text-red-300 font-bold mb-2">
                      ⚠️ DESTRUCTIVE ACTIONS - CANNOT BE UNDONE
                    </p>
                    <p className="text-red-200 text-sm">
                      These actions will permanently delete data from your platform. Use with extreme caution.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Erase App Stats */}
                    <Card className="bg-[#1a1a24] border-red-500/50 p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
                          <XCircle className="w-5 h-5 text-red-400" />
                        </div>
                        <h4 className="text-white font-bold text-sm">Erase App Stats</h4>
                      </div>
                      <div className="space-y-3">
                        <div className="bg-red-500/10 border border-red-500/30 rounded p-2">
                          <p className="text-red-300 text-xs">
                            ⚠️ Deletes ALL:
                          </p>
                          <ul className="text-red-200 text-xs mt-1 space-y-1">
                            <li>• Streams</li>
                            <li>• Gifts</li>
                            <li>• Purchases</li>
                            <li>• Payouts</li>
                            <li>• Chat messages</li>
                            <li>• Moderation logs</li>
                          </ul>
                        </div>
                        <Button
                          onClick={() => eraseAllStatsMutation.mutate()}
                          disabled={eraseAllStatsMutation.isPending}
                          className="w-full bg-red-600 hover:bg-red-700 h-9 text-sm"
                        >
                          {eraseAllStatsMutation.isPending ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                              Erasing...
                            </>
                          ) : (
                            <>
                              <XCircle className="w-4 h-4 mr-1" />
                              Erase All Stats
                            </>
                          )}
                        </Button>
                      </div>
                    </Card>

                    {/* Erase All Coins */}
                    <Card className="bg-[#1a1a24] border-red-500/50 p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
                          <Coins className="w-5 h-5 text-red-400" />
                        </div>
                        <h4 className="text-white font-bold text-sm">Erase All Coins</h4>
                      </div>
                      <div className="space-y-3">
                        <div className="bg-red-500/10 border border-red-500/30 rounded p-2">
                          <p className="text-red-300 text-xs">
                            ⚠️ Sets to 0 for ALL users:
                          </p>
                          <ul className="text-red-200 text-xs mt-1 space-y-1">
                            <li>• Total coins</li>
                            <li>• Free coins</li>
                            <li>• Purchased coins</li>
                            <li>• Earned coins</li>
                          </ul>
                        </div>
                        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-2">
                          <p className="text-yellow-300 text-xs">
                            💰 Current: {revenue.totalCoins.toLocaleString()} coins
                          </p>
                          <p className="text-yellow-200 text-xs">
                            Value: ${revenue.totalCoinsValue.toFixed(2)}
                          </p>
                        </div>
                        <Button
                          onClick={() => eraseAllCoinsMutation.mutate()}
                          disabled={eraseAllCoinsMutation.isPending || revenue.totalCoins === 0}
                          className="w-full bg-red-600 hover:bg-red-700 h-9 text-sm"
                        >
                          {eraseAllCoinsMutation.isPending ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                              Erasing...
                            </>
                          ) : (
                            <>
                              <Coins className="w-4 h-4 mr-1" />
                              Erase All Coins
                            </>
                          )}
                        </Button>
                      </div>
                    </Card>
                  </div>

                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                    <p className="text-blue-300 text-sm">
                      💡 <strong>Note:</strong> User accounts will NOT be deleted. Only stats and coin balances will be reset.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
        </TabsContent>

        {/* AI App Editor Tab */}
        {/* AI Fix Assistant Tab */}
        <TabsContent value="ai-fix">
          <Card className="bg-[#1a1a24] border-[#2a2a3a] p-6">
            <h3 className="text-xl font-bold text-white mb-2">AI Fix Assistant</h3>
            <p className="text-gray-400 mb-4 text-sm">Describe a broken behavior or error. The assistant will propose and execute safe admin fixes where possible (config changes, repairs, reconciliations). For code/schema changes, it will propose a plan without making changes directly.</p>

            <div className="space-y-3">
              <textarea ref={aiFixInstructionRef} className="w-full bg-[#0a0a0f] border-[#2a2a3a] text-white rounded p-3 min-h-[120px]" placeholder="Examples: Fix coins showing negative balances. Repair purchases stuck in pending. Unstick live stream that never ends. Reset Agora tokens for channel 'foo'." />
              <div className="flex gap-2">
                <Button onClick={() => aiFixMutation.mutate(aiFixInstructionRef.current?.value || '')} className="bg-orange-600 hover:bg-orange-700">Run AI Fix</Button>
                <Button onClick={() => aiFixOutputRef.current && (aiFixOutputRef.current.textContent = '')} variant="outline" className="border-[#2a2a3a]">Clear Output</Button>
              </div>
            </div>

            <div ref={aiFixOutputRef} className="mt-4 bg-[#0a0a0f] border-[#2a2a3a] rounded p-3 text-sm text-gray-300 whitespace-pre-wrap"></div>
          </Card>
        </TabsContent>

        <TabsContent value="ai">
          <Card className="bg-[#1a1a24] border-[#2a2a3a] p-6">
            <h3 className="text-xl font-bold text-white mb-4">AI App Editor</h3>
            <p className="text-gray-400 mb-4 text-sm">Type what you want to change, add, or edit. The AI can update app settings and execute admin-level data operations without a code editor. For schema or code changes, it will propose a plan you can review.</p>

            <div className="space-y-3">
              <textarea ref={aiInstructionRef} className="w-full bg-[#0a0a0f] border-[#2a2a3a] text-white rounded p-3 min-h-[120px]" placeholder="Examples: Increase daily reward to 50 coins. Enable entrance effect banner. Add 100 coins to @alice. Ban user with id=123 for 24h. Create broadcast 'New update live now'." />
              <div className="flex gap-2">
                <Button onClick={() => aiRunMutation.mutate(aiInstructionRef.current?.value || '')} className="bg-purple-600 hover:bg-purple-700">Run AI Action</Button>
                <Button onClick={previewConfig} variant="outline" className="border-[#2a2a3a]">Preview Current Config</Button>
              </div>
            </div>

            <div ref={aiOutputRef} className="mt-4 bg-[#0a0a0f] border-[#2a2a3a] rounded p-3 text-sm text-gray-300 whitespace-pre-wrap"></div>

          </Card>
        </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
