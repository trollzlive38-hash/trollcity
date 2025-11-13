
import React, { useState, useRef, useMemo, useEffect } from "react"; // Added useEffect
import { supabase } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  User, Edit, Save, Camera, Coins, DollarSign, Radio, 
  Trophy, Crown, Users, Calendar, Settings, ChevronDown, ChevronUp,
  CreditCard, Check, Sparkles, X, Clock // Added Clock
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import TrollFamilyBadge from "../components/TrollFamilyBadge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const avatarInputRef = useRef(null);
  
  // Safely format dates to avoid runtime crashes on invalid/undefined values
  const formatDateOrUnknown = (value, pattern = 'MMMM d, yyyy') => {
    try {
      if (!value) return 'Unknown';
      const date = new Date(value);
      if (isNaN(date.getTime())) return 'Unknown';
      return format(date, pattern);
    } catch {
      return 'Unknown';
    }
  };
  
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("");
  const [paymentDetails, setPaymentDetails] = useState("");
  
  // Accordion states
  const [openSections, setOpenSections] = useState({
    profile: true,
    stats: false,
    streams: false,
    effects: false,
    payment: false,
    settings: false
  });

  const toggleSection = (section) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const { data: user, isLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => supabase.auth.me(),
    refetchInterval: 5000,
  });

  const { data: myStreams = [] } = useQuery({
    queryKey: ['myStreams', user?.id],
    queryFn: async () => {
      if (!user) return [];
      return await supabase.entities.Stream.filter({ streamer_id: user.id }, "-created_date", 10);
    },
    enabled: !!user,
    initialData: [],
  });

  // FIXED: Calculate total streaming hours
  const totalStreamingHours = useMemo(() => {
    if (!myStreams.length) return 0;
    
    // Calculate total hours from all streams
    let totalMinutes = 0;
    myStreams.forEach(stream => {
      if (stream.created_date) {
        const startTime = new Date(stream.created_date);
        const endTime = stream.updated_date ? new Date(stream.updated_date) : new Date();
        const durationMs = endTime - startTime;
        totalMinutes += Math.floor(durationMs / 1000 / 60);
      }
    });
    
    return (totalMinutes / 60).toFixed(1);
  }, [myStreams]);

  const { data: userEffects = [] } = useQuery({
    queryKey: ['userEffects', user?.id],
    queryFn: () => supabase.entities.UserEntranceEffect.filter({ user_id: user.id }),
    initialData: [],
    enabled: !!user?.id,
  });

  const { data: paymentVerifications = [] } = useQuery({
    queryKey: ['paymentVerifications', user?.id],
    queryFn: async () => {
      if (!user) return [];
      return await supabase.entities.PaymentVerification.filter({ user_id: user.id });
    },
    enabled: !!user,
    initialData: [],
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data) => {
      const updates = { ...data };

      // Sanitize and enforce username rules, plus uniqueness check
      if (typeof updates.username === 'string') {
        const raw = updates.username;
        const sanitized = raw.toLowerCase().replace(/[^a-z0-9_]/g, '');
        if (sanitized.length < 3) {
          throw new Error('Username must be at least 3 characters and use a-z, 0-9, _');
        }
        // Check if username is already taken by another user
        const { data: taken } = await supabase
          .from('profiles')
          .select('id')
          .ilike('username', sanitized)
          .neq('id', user.id)
          .limit(1);
        if (Array.isArray(taken) && taken.length > 0) {
          throw new Error('Username is already taken. Please choose another.');
        }
        updates.username = sanitized;
      }

      // Try to update all fields at once
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id);
      if (!error) return;

      // Per-field fallback: update one key at a time, skipping any invalid columns
      const keys = Object.keys(updates);
      let anySuccess = false;
      let lastErr = error;
      for (const key of keys) {
        const single = { [key]: updates[key] };
        const { error: e } = await supabase
          .from('profiles')
          .update(single)
          .eq('id', user.id);
        if (!e) {
          anySuccess = true;
        } else {
          lastErr = e;
        }
      }
      if (!anySuccess && lastErr) throw lastErr;
    },
    onSuccess: async (_, variables) => {
      // Optimistically update the cached currentUser to reflect changes immediately
      const optimistic = { ...variables };
      if (typeof optimistic.username === 'string') {
        optimistic.username = optimistic.username.toLowerCase().replace(/[^a-z0-9_]/g, '');
      }
      queryClient.setQueryData(['currentUser'], (prev) => prev ? { ...prev, ...optimistic } : prev);

      // Fetch authoritative profile from server to prevent flicker/revert
      try {
        const { data: fresh } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        if (fresh) {
          queryClient.setQueryData(['currentUser'], (prev) => prev ? { ...prev, ...fresh } : prev);
        }
      } catch (_) {}

      queryClient.invalidateQueries(['currentUser']);
      setIsEditing(false);
      toast.success("Profile updated successfully!");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update profile");
    }
  });

  const activateEffectMutation = useMutation({
    mutationFn: async (effectId) => {
      await supabase.entities.UserEntranceEffect.filter({ user_id: user.id }).then(effects => {
        effects.forEach(e => supabase.entities.UserEntranceEffect.update(e.id, { is_active: false }));
      });

      const targetEffect = userEffects.find(e => e.id === effectId);
      await supabase.entities.UserEntranceEffect.update(effectId, { is_active: true });
      // Update profile with active effect metadata directly in profiles table
      const { error } = await supabase
        .from('profiles')
        .update({
          active_entrance_effect: targetEffect?.animation_type || null,
          active_entrance_effect_name: targetEffect?.effect_name || null,
        })
        .eq('id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['userEffects']);
      queryClient.invalidateQueries(['currentUser']);
      toast.success("Entrance effect activated!");
    }
  });

  const startPaymentVerificationMutation = useMutation({
    mutationFn: async ({ method, details }) => {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      await supabase.entities.PaymentVerification.create({
        user_id: user.id,
        user_name: user.full_name,
        payment_method: method,
        payment_details: details,
        verification_code: code,
        verified_by_user: false,
        verified_by_admin: false
      });
      return code;
    },
    onSuccess: (code) => {
      queryClient.invalidateQueries(['paymentVerifications']);
      toast.success(`Verification started! Code: ${code}`);
      setSelectedPaymentMethod("");
      setPaymentDetails("");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to start verification");
    }
  });

  const verifyCodeMutation = useMutation({
    mutationFn: async ({ verificationId, code }) => {
      const verification = paymentVerifications.find(v => v.id === verificationId);
      if (verification.verification_code !== code) {
        throw new Error("Invalid verification code");
      }
      await supabase.entities.PaymentVerification.update(verificationId, {
        verified_by_user: true,
        verification_date: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['paymentVerifications']);
      toast.success("Payment method verified! Awaiting admin approval.");
      setVerificationCode("");
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      await supabase.entities.User.update(user.id, {
        is_deleted: true,
        deleted_date: new Date().toISOString()
      });
      await supabase.auth.signOut();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete account");
    }
  });

  // Stripe Connect onboarding: start and redirect
  const connectStripeMutation = useMutation({
    mutationFn: async () => {
      const base = typeof window !== 'undefined' ? window.location.origin : '';
      const payload = {
        user_id: user.id,
        user_email: user.email,
        return_url: `${base}/profile?connected=stripe`,
        refresh_url: `${base}/profile?connect=retry`,
      };
      // Ensure we call the Edge Function with proper body/options and parse standard supabase-js response shape
      const { data, error } = await supabase.functions.invoke('createstripeconnect', {
        body: payload,
        headers: {
          // Provide apikey for environments that require explicit key header
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
          'x-client-info': 'trollcity-web',
        },
      });
      if (error) throw error;
      const url = data?.url || data?.onboarding_url || null;
      if (url) return url;
      throw new Error('Failed to start Stripe onboarding: missing URL from function');
    },
    onSuccess: (url) => {
      try {
        window.location.href = url;
      } catch {
        toast.error('Unable to redirect to Stripe onboarding');
      }
    },
    onError: (error) => {
      toast.error(error?.message || 'Failed to start Stripe onboarding');
    }
  });

  // Toast success on return from Stripe onboarding
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('connected') === 'stripe') {
        toast.success("Payouts connected with Stripe. You're all set!");
        // Optionally refetch profile to reflect stripe_account_id persistence
        queryClient.invalidateQueries(['currentUser']);
      }
    } catch (_) {
      // ignore
    }
  }, [queryClient]);

  // Resize the image client-side to control dimensions and file size
  const resizeImage = (file, { maxWidth = 512, maxHeight = 512, mimeType = 'image/jpeg', quality = 0.9 } = {}) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();

      reader.onload = (e) => {
        img.src = e.target.result;
      };
      reader.onerror = reject;

      img.onload = () => {
        const width = img.width;
        const height = img.height;
        const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
        const targetW = Math.round(width * ratio);
        const targetH = Math.round(height * ratio);

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, targetW, targetH);

        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error('Failed to resize image'));
          const ext = mimeType.includes('png') ? 'png' : 'jpg';
          const baseName = (file.name || 'avatar').replace(/\.[^/.]+$/, '');
          const resizedFile = new File([blob], `${baseName}.${ext}`, { type: mimeType });
          resolve(resizedFile);
        }, mimeType, quality);
      };
      img.onerror = reject;

      reader.readAsDataURL(file);
    });
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    try {
      setIsUploadingAvatar(true);
      // Resize large images to a sane avatar size, preserving aspect ratio
      const resizedFile = await resizeImage(file, { maxWidth: 512, maxHeight: 512, mimeType: 'image/jpeg', quality: 0.9 });

      // Upload via Supabase integrations, preferring the 'avatars' bucket
      const { file_url } = await supabase.integrations.Core.UploadFile({ file: resizedFile, bucket: 'avatars', pathPrefix: 'avatars' });

      // Update profile with the new avatar URL
      const { error } = await supabase
        .from('profiles')
        .update({ avatar: file_url })
        .eq('id', user.id);
      if (error) throw error;

      queryClient.invalidateQueries(['currentUser']);
      toast.success('Avatar updated!');
    } catch (error) {
      const msg = error?.message || 'Failed to upload avatar';
      toast.error(msg);
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const getTierInfo = (level) => {
    if (level >= 1 && level <= 9) return { tier: 1, color: "from-gray-500 to-slate-500", name: "Newbie" };
    if (level >= 10 && level <= 19) return { tier: 2, color: "from-blue-500 to-cyan-500", name: "Rising Star" };
    if (level >= 20 && level <= 29) return { tier: 3, color: "from-purple-500 to-pink-500", name: "Elite" };
    if (level >= 30) return { tier: 4, color: "from-yellow-500 to-orange-500", name: "Legend" };
    return { tier: 1, color: "from-gray-500 to-slate-500", name: "Newbie" };
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-purple-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
        <Card className="bg-[#1a1a24] border-[#2a2a3a] p-8 text-center max-w-md w-full">
          <h2 className="text-2xl font-bold text-white mb-4">Please login to view profile</h2>
          <Button onClick={() => supabase.auth.redirectToLogin()}>Login</Button>
        </Card>
      </div>
    );
  }

  const tierInfo = getTierInfo(user.level || 1);

  return (
    <div className="min-h-screen bg-[#0a0a0f] p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Profile Header - Always Visible */}
        <Card className="bg-[#1a1a24] border-[#2a2a3a] p-6">
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              {user.avatar ? (
                <img src={user.avatar} alt={user.username} className="w-24 h-24 rounded-full object-cover" />
              ) : (
                <div className="w-24 h-24 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-3xl font-bold">{user.username?.[0]?.toUpperCase()}</span>
                </div>
              )}
              <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
              <Button size="icon" onClick={() => avatarInputRef.current?.click()} disabled={isUploadingAvatar} className="absolute bottom-0 right-0 rounded-full bg-purple-600 hover:bg-purple-700">
                <Camera className="w-4 h-4" />
              </Button>
            </div>

            <div className="text-center">
              <h1 className="text-2xl font-bold text-white">@{user.username || user.full_name}</h1>
              <p className="text-gray-400 text-sm">{user.email}</p>
              <div className="flex items-center justify-center gap-2 mt-2">
                <Badge className={`bg-gradient-to-r ${tierInfo.color} text-white`}>
                  Level {user.level || 1} • {tierInfo.name}
                </Badge>
                <TrollFamilyBadge user={user} />
              </div>
            </div>
          </div>
        </Card>

        {/* Profile Info - Collapsible */}
        <Collapsible open={openSections.profile} onOpenChange={() => toggleSection('profile')}>
          <Card className="bg-[#1a1a24] border-[#2a2a3a]">
            <CollapsibleTrigger className="w-full p-4 flex items-center justify-between hover:bg-white/5">
              <div className="flex items-center gap-2">
                <User className="w-5 h-5 text-purple-400" />
                <span className="text-white font-semibold">Profile Info</span>
              </div>
              {openSections.profile ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="p-4 pt-0 space-y-4">
                {!isEditing ? (
                  <>
                    {user.bio && <p className="text-gray-300 text-sm">{user.bio}</p>}
                    <Button onClick={() => { setIsEditing(true); setEditData({ bio: user.bio || '', username: user.username || '' }); }} className="w-full bg-purple-600 hover:bg-purple-700">
                      <Edit className="w-4 h-4 mr-2" />Edit Profile
                    </Button>
                  </>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="text-gray-400 text-sm mb-1 block">Username</label>
                      <Input value={editData.username} onChange={(e) => setEditData({...editData, username: e.target.value})} className="bg-[#0a0a0f] border-[#2a2a3a] text-white" />
                    </div>
                    <div>
                      <label className="text-gray-400 text-sm mb-1 block">Bio</label>
                      <Textarea value={editData.bio} onChange={(e) => setEditData({...editData, bio: e.target.value})} className="bg-[#0a0a0f] border-[#2a2a3a] text-white h-20" maxLength={200} />
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => updateProfileMutation.mutate(editData)} disabled={updateProfileMutation.isPending} className="flex-1 bg-green-600 hover:bg-green-700">
                        <Save className="w-4 h-4 mr-2" />Save
                      </Button>
                      <Button onClick={() => setIsEditing(false)} variant="outline" className="flex-1 border-[#2a2a3a]">Cancel</Button>
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Stats - Collapsible */}
        <Collapsible open={openSections.stats} onOpenChange={() => toggleSection('stats')}>
          <Card className="bg-[#1a1a24] border-[#2a2a3a]">
            <CollapsibleTrigger className="w-full p-4 flex items-center justify-between hover:bg-white/5">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-400" />
                <span className="text-white font-semibold">Stats</span>
              </div>
              {openSections.stats ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="p-4 pt-0 grid grid-cols-2 gap-3">
                <div className="bg-[#0a0a0f] rounded-lg p-3 text-center">
                  <Coins className="w-6 h-6 text-yellow-400 mx-auto mb-1" />
                  <p className="text-gray-400 text-xs">Coins</p>
                  <p className="text-white font-bold">{(user.coins || 0).toLocaleString()}</p>
                </div>
                <div className="bg-[#0a0a0f] rounded-lg p-3 text-center">
                  <DollarSign className="w-6 h-6 text-green-400 mx-auto mb-1" />
                  <p className="text-gray-400 text-xs">Earned</p>
                  <p className="text-white font-bold">{(user.earned_coins || 0).toLocaleString()}</p>
                </div>
                <div className="bg-[#0a0a0f] rounded-lg p-3 text-center">
                  <Users className="w-6 h-6 text-blue-400 mx-auto mb-1" />
                  <p className="text-gray-400 text-xs">Followers</p>
                  <p className="text-white font-bold">{user.follower_count || 0}</p>
                </div>
                <div className="bg-[#0a0a0f] rounded-lg p-3 text-center">
                  <Radio className="w-6 h-6 text-red-400 mx-auto mb-1" />
                  <p className="text-gray-400 text-xs">Streams</p>
                  <p className="text-white font-bold">{myStreams.length}</p>
                </div>
                <div className="bg-[#0a0a0f] rounded-lg p-3 text-center col-span-2">
                  <Clock className="w-6 h-6 text-purple-400 mx-auto mb-1" />
                  <p className="text-gray-400 text-xs">Hours Streamed</p>
                  <p className="text-white font-bold">{totalStreamingHours}h</p>
                </div>
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Recent Streams - Collapsible */}
        <Collapsible open={openSections.streams} onOpenChange={() => toggleSection('streams')}>
          <Card className="bg-[#1a1a24] border-[#2a2a3a]">
            <CollapsibleTrigger className="w-full p-4 flex items-center justify-between hover:bg-white/5">
              <div className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-red-400" />
                <span className="text-white font-semibold">Recent Streams</span>
                <Badge className="bg-red-500">{myStreams.length}</Badge>
              </div>
              {openSections.streams ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="p-4 pt-0 space-y-2">
                    {myStreams.length === 0 ? (
                      <p className="text-gray-500 text-sm text-center py-4">No streams yet</p>
                    ) : (
                      myStreams.map(stream => (
                        <div key={stream.id} className="bg-[#0a0a0f] rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <h3 className="text-white font-semibold text-sm">{stream.title}</h3>
                            {stream.is_live && <Badge className="bg-red-500 text-xs">LIVE</Badge>}
                          </div>
                          <p className="text-gray-400 text-xs">{formatDateOrUnknown(stream.created_date, 'MMM d, yyyy')}</p>
                        </div>
                      ))
                    )}
                  </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Entrance Effects - Collapsible */}
        <Collapsible open={openSections.effects} onOpenChange={() => toggleSection('effects')}>
          <Card className="bg-[#1a1a24] border-[#2a2a3a]">
            <CollapsibleTrigger className="w-full p-4 flex items-center justify-between hover:bg-white/5">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400" />
                <span className="text-white font-semibold">Entrance Effects</span>
                <Badge className="bg-purple-500">{userEffects.length}</Badge>
              </div>
              {openSections.effects ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="p-4 pt-0 space-y-2">
                {userEffects.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-4">No effects owned</p>
                ) : (
                  userEffects.map(effect => (
                    <div key={effect.id} className="bg-[#0a0a0f] rounded-lg p-3 flex items-center justify-between">
                      <div>
                        <h3 className="text-white font-semibold text-sm">{effect.effect_name}</h3>
                        <p className="text-gray-400 text-xs">{effect.animation_type}</p>
                      </div>
                      <Button size="sm" onClick={() => activateEffectMutation.mutate(effect.id)} disabled={effect.is_active} className={effect.is_active ? "bg-green-600" : "bg-purple-600 hover:bg-purple-700"}>
                        {effect.is_active ? <><Check className="w-3 h-3 mr-1" />Active</> : "Activate"}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Payment Methods - Collapsible */}
        <Collapsible open={openSections.payment} onOpenChange={() => toggleSection('payment')}>
          <Card className="bg-[#1a1a24] border-[#2a2a3a]">
            <CollapsibleTrigger className="w-full p-4 flex items-center justify-between hover:bg-white/5">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-green-400" />
                <span className="text-white font-semibold">Payment Methods</span>
              </div>
              {openSections.payment ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="p-4 pt-0 space-y-3">
                {/* Stripe Connect – creator payouts */}
                <div className="bg-[#0a0a0f] rounded-lg p-4">
                  <label className="text-white font-medium mb-2 block text-sm">Creator Payouts</label>
                  <p className="text-gray-400 text-xs mb-3">Connect a Stripe account to receive payouts.</p>
                  <Button
                    onClick={() => connectStripeMutation.mutate()}
                    disabled={connectStripeMutation.isPending}
                    className="w-full bg-purple-600 hover:bg-purple-700"
                  >
                    <CreditCard className="w-4 h-4 mr-2" />Connect with Stripe
                  </Button>
                </div>
                {/* FIXED: Android-friendly payment method selector */}
                <div className="bg-[#0a0a0f] rounded-lg p-4">
                  <label className="text-white font-medium mb-3 block text-sm">Add Payment Method</label>
                  
                  <div className="space-y-2 mb-3">
                    {['paypal', 'cashapp', 'zelle', 'venmo', 'bank_transfer'].map(method => (
                      <button
                        key={method}
                        onClick={() => setSelectedPaymentMethod(method)}
                        className={`w-full p-3 rounded-lg text-left transition-all ${
                          selectedPaymentMethod === method 
                            ? 'bg-purple-600 text-white border-2 border-purple-400' 
                            : 'bg-[#1a1a24] text-gray-300 border-2 border-[#2a2a3a] hover:border-purple-500'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium capitalize">{method.replace('_', ' ')}</span>
                          {selectedPaymentMethod === method && (
                            <Check className="w-5 h-5 text-white" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>

                  {selectedPaymentMethod && (
                    <div className="space-y-2">
                      <Input 
                        value={paymentDetails} 
                        onChange={(e) => setPaymentDetails(e.target.value)}
                        placeholder={`Enter your ${selectedPaymentMethod.replace('_', ' ')} details`}
                        className="bg-[#1a1a24] border-[#2a2a3a] text-white"
                      />
                      <Button 
                        onClick={() => startPaymentVerificationMutation.mutate({ 
                          method: selectedPaymentMethod, 
                          details: paymentDetails 
                        })}
                        disabled={!paymentDetails || startPaymentVerificationMutation.isPending}
                        className="w-full bg-green-600 hover:bg-green-700"
                      >
                        Start Verification
                      </Button>
                    </div>
                  )}
                </div>

                {paymentVerifications.map(v => (
                  <div key={v.id} className="bg-[#0a0a0f] rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-white font-semibold text-sm capitalize">{v.payment_method.replace('_', ' ')}</p>
                      <Badge className={v.verified_by_admin ? "bg-green-500" : v.verified_by_user ? "bg-yellow-500" : "bg-gray-500"}>
                        {v.verified_by_admin ? "Verified" : v.verified_by_user ? "Pending" : "Unverified"}
                      </Badge>
                    </div>
                    {!v.verified_by_user && (
                      <div className="flex gap-2 mt-2">
                        <Input 
                          value={verificationCode} 
                          onChange={(e) => setVerificationCode(e.target.value)} 
                          placeholder="Enter code" 
                          className="bg-[#1a1a24] border-[#2a2a3a] text-white text-sm" 
                        />
                        <Button 
                          size="sm" 
                          onClick={() => verifyCodeMutation.mutate({ verificationId: v.id, code: verificationCode })}
                        >
                          Verify
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Settings - Collapsible */}
        <Collapsible open={openSections.settings} onOpenChange={() => toggleSection('settings')}>
          <Card className="bg-[#1a1a24] border-[#2a2a3a]">
            <CollapsibleTrigger className="w-full p-4 flex items-center justify-between hover:bg-white/5">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-gray-400" />
                <span className="text-white font-semibold">Account Settings</span>
              </div>
              {openSections.settings ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="p-4 pt-0 space-y-3">
                <div className="bg-[#0a0a0f] rounded-lg p-3">
                  <p className="text-gray-400 text-xs mb-1">Member Since</p>
                  <p className="text-white text-sm">{formatDateOrUnknown(user.created_date, 'MMMM d, yyyy')}</p>
                </div>
                <Button onClick={() => { if(confirm('Delete account? This cannot be undone!')) deleteAccountMutation.mutate(); }} variant="destructive" className="w-full">
                  <X className="w-4 h-4 mr-2" />Delete Account
                </Button>
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </div>
    </div>
  );
}
