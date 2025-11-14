import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Swords } from "lucide-react";
import { supabase } from "@/api/supabaseClient";

function saveLS(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }
function loadLS(key, def) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch { return def; } }

export default function TrollOfficerApplication() {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [experience, setExperience] = useState("");
  const [statement, setStatement] = useState("");
  const [status, setStatus] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setStatus("");
    const payload = { name, username, email, experience, statement, created_at: new Date().toISOString(), type: "officer" };
    const list = loadLS("tc_apps_officer", []);
    saveLS("tc_apps_officer", [payload, ...list]);
    if (supabase.__isConfigured) {
      try {
        const values = { user_name: name, user_username: username, user_email: email, experience, statement, status: 'pending' };
        await supabase.from("troll_officer_applications").insert(values);
        const { data: admins } = await supabase.from('profiles').select('*').eq('role','admin').limit(10);
        if (Array.isArray(admins)) {
          const rows = admins.map(a => ({
            user_id: a.id,
            type: 'officer_application',
            title: 'New Troll Officer Application',
            message: `${username || name} submitted an officer application`,
            is_read: false,
            created_date: new Date().toISOString(),
          }));
          await supabase.from('notifications').insert(rows).catch(()=>{});
        }
      } catch {}
    }
    setStatus("Submitted");
    setName(""); setUsername(""); setEmail(""); setExperience(""); setStatement("");
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#120a1f] to-[#0a0a0f] py-10 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center">
            <Swords className="w-5 h-5 text-black" />
          </div>
          <h1 className="text-2xl font-bold text-white">Troll Officer Application</h1>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="bg-[#11121a] border-[#2a2a3a] p-6 lg:col-span-2 rounded-xl">
            <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Full Name" className="bg-[#0f0f16] border-[#2a2a3a] text-white" />
              <Input value={username} onChange={(e)=>setUsername(e.target.value)} placeholder="Username" className="bg-[#0f0f16] border-[#2a2a3a] text-white" />
              <Input value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="Email" className="bg-[#0f0f16] border-[#2a2a3a] text-white md:col-span-2" />
              <Textarea value={experience} onChange={(e)=>setExperience(e.target.value)} placeholder="Experience" className="bg-[#0f0f16] border-[#2a2a3a] text-white md:col-span-2" />
              <Textarea value={statement} onChange={(e)=>setStatement(e.target.value)} placeholder="Why you’re a good fit" className="bg-[#0f0f16] border-[#2a2a3a] text-white md:col-span-2" />
              <div className="md:col-span-2 flex items-center justify-between">
                {status && <p className="text-emerald-400 text-sm">{status}</p>}
                <Button type="submit" className="bg-emerald-500 hover:bg-emerald-600 text-black">Submit Application</Button>
              </div>
            </form>
          </Card>
          <Card className="bg-[#11121a] border-[#2a2a3a] p-6 rounded-xl">
            <div className="space-y-4">
              <div className="bg-[#0b1116] p-3 rounded border border-[#222]">
                <p className="text-sm font-semibold text-white">Compensation</p>
                <p className="text-xs text-gray-400">Base weekly payment: <span className="text-yellow-400 font-bold">$10 / week</span></p>
                <p className="text-xs text-gray-400">Plus earnings from gifts you help moderate or manage while on shift.</p>
              </div>

              <p className="text-white font-semibold">Guidelines</p>
              <p className="text-gray-400 text-sm">Provide accurate contact info and a concise summary of your moderation experience.</p>
              <p className="text-gray-400 text-sm">Applications are reviewed periodically. You will be contacted via email.</p>

              <hr className="border-t border-[#222] my-2" />

              <div>
                <p className="text-white font-semibold">Role Tiers & Potential Earnings</p>
                <div className="mt-2 space-y-2">
                  <div className="bg-[#0f0f16] p-3 rounded border border-[#2a2a3a]">
                    <p className="text-sm font-semibold text-white">Junior Officer</p>
                    <p className="text-xs text-gray-400">Requirements: 1+ months moderation experience, active in chat, good community standing.</p>
                    <p className="text-sm text-yellow-400 font-bold mt-1">Potential: $50 – $200 / month + bonuses</p>
                  </div>
                  <div className="bg-[#0f0f16] p-3 rounded border border-[#2a2a3a]">
                    <p className="text-sm font-semibold text-white">Senior Officer</p>
                    <p className="text-xs text-gray-400">Requirements: 6+ months experience, proven moderation track record, reliable schedule.</p>
                    <p className="text-sm text-yellow-400 font-bold mt-1">Potential: $200 – $600 / month + revenue share</p>
                  </div>
                  <div className="bg-[#0f0f16] p-3 rounded border border-[#2a2a3a]">
                    <p className="text-sm font-semibold text-white">Lead Officer</p>
                    <p className="text-xs text-gray-400">Requirements: Team leadership, policy knowledge, incident handling experience.</p>
                    <p className="text-sm text-yellow-400 font-bold mt-1">Potential: $600+ / month + higher bonuses</p>
                  </div>
                </div>
              </div>

              <div className="text-sm text-gray-400">
                <p className="mt-2">Notes: Exact compensation depends on activity, hours covered, and platform revenue share. Filling out the application thoroughly helps speed review.</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}
