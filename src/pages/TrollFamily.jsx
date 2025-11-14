import React, { useState, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function TrollFamily() {
  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: async () => {
    const { data } = await supabase.auth.getUser();
    return data?.user || null;
  }});

  const [familyName, setFamilyName] = useState('');
  const [joining, setJoining] = useState(false);
  const [families, setFamilies] = useState([]);

  useEffect(() => { fetchFamilies(); }, []);

  const fetchFamilies = async () => {
    const { data, error } = await supabase.from('troll_families').select('*').order('created_date', { ascending: false }).limit(100);
    if (!error) setFamilies(data || []);
  };

  const createFamily = async () => {
    if (!familyName.trim()) return;
    const { data, error } = await supabase.from('troll_families').insert([{ name: familyName, created_date: new Date().toISOString() }]).select('*');
    if (!error) {
      setFamilyName('');
      fetchFamilies();
    }
  };

  const joinFamily = async (id) => {
    if (!user) return;
    setJoining(true);
    const { error } = await supabase.from('troll_family_members').insert([{ family_id: id, user_id: user.id, joined_date: new Date().toISOString() }]);
    setJoining(false);
    if (!error) fetchFamilies();
  };

  return (
    <main className="min-h-screen p-6 bg-gradient-to-br from-[#06060a] to-[#0a0910]">
      <div className="max-w-4xl mx-auto space-y-4">
        <h1 className="text-2xl text-white font-bold">Troll Families</h1>
        <Card className="p-4 bg-[#0b0b10]">
          <div className="flex gap-2">
            <Input value={familyName} onChange={(e) => setFamilyName(e.target.value)} placeholder="New family name" className="bg-[#0a0a0f] text-white" />
            <Button onClick={createFamily} className="bg-emerald-600">Create</Button>
          </div>
        </Card>

        <div className="space-y-3">
          {families.length === 0 ? (
            <Card className="p-4 bg-[#0b0b10]">No families yet.</Card>
          ) : (
            families.map(f => (
              <Card key={f.id} className="p-4 bg-[#0b0b10] flex items-center justify-between">
                <div>
                  <div className="text-white font-semibold">{f.name}</div>
                  <div className="text-xs text-gray-400">Created: {f.created_date ? new Date(f.created_date).toLocaleDateString() : '—'}</div>
                </div>
                <div>
                  <Button onClick={() => joinFamily(f.id)} disabled={joining} className="bg-blue-600">Join</Button>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
