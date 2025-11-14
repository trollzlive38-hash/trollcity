import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { getCurrentUserProfile } from '@/api/supabaseHelpers';
import { toast } from 'sonner';

export default function TOCommand() {
  const queryClient = useQueryClient();
  const { data: currentUser } = useQuery({ queryKey: ['currentUser'], queryFn: getCurrentUserProfile });
  const isOfficer = currentUser?.role === 'admin' || currentUser?.is_troll_officer || currentUser?.is_admin;

  const { data: settings = [] } = useQuery({
    queryKey: ['moderationSettingsForTO'],
    queryFn: async () => {
      const { data, error } = await supabase.from('moderation_settings').select('*').eq('setting_key', 'global_moderation').limit(1);
      if (error) return [];
      return data || [];
    },
    enabled: !!isOfficer,
  });

  const { data: queue = [] } = useQuery({
    queryKey: ['moderationQueue'],
    queryFn: async () => {
      const { data, error } = await supabase.from('moderation_actions').select('*').eq('reviewed_by_admin', false).order('created_date', { ascending: false }).limit(200);
      if (error) return [];
      return data || [];
    },
    enabled: !!isOfficer,
    refetchInterval: 5000,
  });

  const defaultState = { new_features: '', ban_fee_usd: 0, updates: '' };
  const [local, setLocal] = useState(defaultState);

  useEffect(() => {
    const s = settings[0];
    if (s && typeof s === 'object') {
      setLocal((prev) => ({ ...prev, new_features: s.new_features || '', ban_fee_usd: s.ban_fee_usd || 0, updates: s.updates || '' }));
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (payload) => {
      const existing = settings[0];
      if (existing?.id) {
        const { error } = await supabase.from('moderation_settings').update(payload).eq('id', existing.id);
        if (error) throw error;
      } else {
        const insert = { setting_key: 'global_moderation', ...payload };
        const { error } = await supabase.from('moderation_settings').insert(insert);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['moderationSettingsForTO']);
      toast.success('T-O settings saved');
    },
    onError: (e) => toast.error(String(e?.message || e || 'Failed to save')),
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, falsePositive, notes }) => {
      const { error } = await supabase.from('moderation_actions').update({ reviewed_by_admin: true, false_positive: !!falsePositive, admin_notes: notes }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries(['moderationQueue']); toast.success('Marked reviewed'); },
    onError: (e) => toast.error(String(e?.message || e || 'Failed to mark reviewed')),
  });

  if (!isOfficer) return (
    <main className="min-h-screen p-6">
      <Card className="p-6 bg-[#0b0b10]">Access denied — T-O Command Center is for Troll Officers and Admins only.</Card>
    </main>
  );

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#06060a] to-[#0a0910] p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-white">T-O Command Center</h1>

        <Card className="p-4 bg-[#0b0b10]">
          <h2 className="text-lg text-white font-semibold mb-2">New Features & Updates</h2>
          <p className="text-sm text-gray-400 mb-2">Use this panel to publish notes about new features and platform updates that officers should be aware of.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-300">New Features (markdown/text)</label>
              <Textarea value={local.new_features} onChange={(e) => setLocal({ ...local, new_features: e.target.value })} className="bg-[#0a0a0f] text-white" />
            </div>
            <div>
              <label className="text-xs text-gray-300">Recent/Important Updates</label>
              <Textarea value={local.updates} onChange={(e) => setLocal({ ...local, updates: e.target.value })} className="bg-[#0a0a0f] text-white" />
            </div>
            <div>
              <label className="text-xs text-gray-300">Ban Fee (USD)</label>
              <Input type="number" value={local.ban_fee_usd} onChange={(e) => setLocal({ ...local, ban_fee_usd: Number(e.target.value || 0) })} className="bg-[#0a0a0f] text-white" />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button onClick={() => saveMutation.mutate(local)} className="bg-emerald-500">Save</Button>
            <Button variant="outline" onClick={() => { setLocal(defaultState); }}>Reset</Button>
          </div>
        </Card>

        <Card className="p-4 bg-[#0b0b10]">
          <h2 className="text-lg text-white font-semibold mb-2">Moderation Queue</h2>
          <p className="text-sm text-gray-400 mb-2">Unreviewed moderation actions (reported/auto-moderation). Review and mark as handled.</p>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {queue.length === 0 ? (
              <div className="text-gray-400 text-sm">No items in the queue.</div>
            ) : (
              queue.map(item => (
                <div key={item.id} className="p-3 bg-[#0f1116] rounded border border-[#222]">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-white font-semibold">{item.action} — {item.target_type}</div>
                      <div className="text-xs text-gray-400">User: {item.user_id} • Target: {item.target_id} • {new Date(item.created_date).toLocaleString()}</div>
                      <div className="mt-2 text-sm text-gray-200">Notes: {item.notes || '—'}</div>
                    </div>
                    <div className="flex flex-col gap-2 ml-4">
                      <Button size="sm" className="bg-green-600" onClick={() => reviewMutation.mutate({ id: item.id, falsePositive: false, notes: 'Reviewed and handled' })}>Mark Reviewed</Button>
                      <Button size="sm" variant="destructive" onClick={() => reviewMutation.mutate({ id: item.id, falsePositive: true, notes: 'Marked false positive' })}>False Positive</Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="p-4 bg-[#0b0b10]">
          <h2 className="text-lg font-semibold text-white mb-2">Quick Actions</h2>
          <p className="text-sm text-gray-400 mb-2">Broadcast announcements or send admin notifications to users.</p>
          <QuickBroadcast currentUser={currentUser} onSent={() => queryClient.invalidateQueries(['moderationSettingsForTO'])} />
        </Card>
      </div>
    </main>
  );
}

function QuickBroadcast({ currentUser, onSent }) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const qc = useQueryClient();

  const send = async () => {
    if (!title.trim() || !message.trim()) { toast.error('Title and message required'); return; }
    try {
      await supabase.from('notifications').insert([{ user_id: null, type: 'admin_broadcast', title, message, is_read: false, created_date: new Date().toISOString() }]);
      toast.success('Broadcast queued');
      setTitle(''); setMessage('');
      qc.invalidateQueries(['notifications']);
      if (onSent) onSent();
    } catch (e) { toast.error(String(e?.message || e || 'Failed to send')); }
  };

  return (
    <div className="space-y-2">
      <Input placeholder="Announcement title" value={title} onChange={(e) => setTitle(e.target.value)} className="bg-[#0a0a0f] text-white" />
      <Textarea placeholder="Message body" value={message} onChange={(e) => setMessage(e.target.value)} className="bg-[#0a0a0f] text-white" />
      <div className="flex gap-2">
        <Button onClick={send} className="bg-blue-600">Send Broadcast</Button>
        <Button variant="outline" onClick={() => { setTitle(''); setMessage(''); }}>Clear</Button>
      </div>
    </div>
  );
}
