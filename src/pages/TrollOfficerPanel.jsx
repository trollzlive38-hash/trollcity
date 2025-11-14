import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

export default function TrollOfficerPanel() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: currentUser } = useQuery({ queryKey: ['currentUser'], queryFn: () => supabase.auth.me() });

  // only admin or troll officer can access
  const isAllowed = currentUser?.user_metadata?.role === 'admin' || currentUser?.role === 'admin' || currentUser?.is_troll_officer;

  const { data: officers = [] } = useQuery({
    queryKey: ['trollOfficers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('is_troll_officer', true).order('created_date', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!isAllowed,
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['allUsersSample'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').limit(200).order('created_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!isAllowed,
  });

  const updateProfileMutation = useMutation({
    mutationFn: async ({ userId, updates }) => {
      const { error } = await supabase.from('profiles').update(updates).eq('id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['trollOfficers']);
      queryClient.invalidateQueries(['allUsersSample']);
      toast.success('Update saved');
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to update');
    }
  });

  const handleBan = (u) => {
    if (!confirm(`Ban ${u.username || u.full_name || u.email}?`)) return;
    // Prevent Troll Officers from banning trollers (only admins can)
    if (u.role === 'troller' || u.is_troller) {
      if (!(currentUser?.role === 'admin' || currentUser?.user_role === 'admin')) {
        toast.error('Only admins can ban trollers');
        return;
      }
    }
    updateProfileMutation.mutate({ userId: u.id, updates: { is_banned: true, banned_by: currentUser?.id } });
  };
  const handleUnban = (u) => {
    updateProfileMutation.mutate({ userId: u.id, updates: { is_banned: false, banned_by: null } });
  };
  const handleKick = (u) => {
    if (!confirm(`Kick ${u.username || u.full_name || u.email}? This will temporarily disable their access.`)) return;
    // Prevent Troll Officers from kicking trollers (only admins can)
    if (u.role === 'troller' || u.is_troller) {
      if (!(currentUser?.role === 'admin' || currentUser?.user_role === 'admin')) {
        toast.error('Only admins can kick trollers');
        return;
      }
    }
    updateProfileMutation.mutate({ userId: u.id, updates: { is_kicked: true, kicked_at: new Date().toISOString() } });
  };
  const handleUnkick = (u) => {
    updateProfileMutation.mutate({ userId: u.id, updates: { is_kicked: false } });
  };
  const handleDisableChat = (u) => {
    updateProfileMutation.mutate({ userId: u.id, updates: { chat_disabled: true } });
  };
  const handleEnableChat = (u) => {
    updateProfileMutation.mutate({ userId: u.id, updates: { chat_disabled: false } });
  };

  const [selectedOfficerPay, setSelectedOfficerPay] = useState(null);
  const handleSetPay = (userId, amount) => {
    updateProfileMutation.mutate({ userId, updates: { officer_pay_rate: Number(amount || 0) } });
  };

  if (!isAllowed) {
    return (
      <div className="min-h-screen p-6 flex items-center justify-center">
        <Card className="p-8">
          <h2 className="text-lg font-bold">Access Denied</h2>
          <p className="text-sm text-gray-500">Only admins and approved Troll Officers can access this area.</p>
          <div className="mt-4">
            <Button onClick={() => navigate('/')}>Back Home</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">Troll Officers — Pay & Settings</h1>

        <Card className="p-4">
          <h3 className="text-lg font-semibold mb-2">Officer Pay</h3>
          <p className="text-sm text-gray-400 mb-4">Set or view officer pay rates. Payments are handled via admin payouts (no automatic sending).</p>
          <div className="grid grid-cols-1 gap-3">
            {officers.map(o => (
              <div key={o.id} className="flex items-center justify-between gap-4 p-3 bg-[#0f0f16] rounded">
                <div>
                  <p className="font-semibold">@{o.username || o.full_name}</p>
                  <p className="text-xs text-gray-400">{o.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Input type="number" value={o.officer_pay_rate || ''} onChange={(e) => setSelectedOfficerPay({ id: o.id, value: e.target.value })} placeholder="USD" className="w-28" />
                  <Button onClick={() => handleSetPay(o.id, selectedOfficerPay?.id === o.id ? selectedOfficerPay.value : o.officer_pay_rate || 0)}>Save</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-lg font-semibold mb-2">Moderation Actions</h3>
          <p className="text-sm text-gray-400 mb-4">As a Troll Officer you can ban/kick users and enable/disable chat for problematic accounts.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold mb-2">All Users (sample)</h4>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {allUsers.map(u => (
                  <div key={u.id} className="flex items-center justify-between p-2 bg-[#0a0a0f] rounded">
                    <div>
                      <p className="font-semibold">{u.username || u.full_name}</p>
                      <p className="text-xs text-gray-400">{u.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {u.is_banned ? <Badge className="bg-red-600">Banned</Badge> : null}
                      {u.is_kicked ? <Badge className="bg-yellow-600">Kicked</Badge> : null}
                      {u.chat_disabled ? <Badge className="bg-gray-600">Chat Disabled</Badge> : null}

                      {u.is_banned ? (
                        <Button size="sm" onClick={() => handleUnban(u)}>Unban</Button>
                      ) : (
                        <Button size="sm" onClick={() => handleBan(u)}>Ban</Button>
                      )}

                      {u.is_kicked ? (
                        <Button size="sm" onClick={() => handleUnkick(u)}>Unkick</Button>
                      ) : (
                        <Button size="sm" onClick={() => handleKick(u)}>Kick</Button>
                      )}

                      {u.chat_disabled ? (
                        <Button size="sm" onClick={() => handleEnableChat(u)}>Enable Chat</Button>
                      ) : (
                        <Button size="sm" onClick={() => handleDisableChat(u)}>Disable Chat</Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Officers</h4>
              <div className="space-y-2">
                {officers.map(o => (
                  <div key={o.id} className="flex items-center justify-between p-2 bg-[#0a0a0f] rounded">
                    <div>
                      <p className="font-semibold">{o.username || o.full_name}</p>
                      <p className="text-xs text-gray-400">{o.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-emerald-600">Officer</Badge>
                      <Button size="sm" onClick={() => toast.success('Open payment flow in Admin Dashboard (admins only)')}>Request Payout</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
