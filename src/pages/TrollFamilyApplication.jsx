import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Users } from "lucide-react";
import { supabase } from "@/api/supabaseClient";

function saveLS(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }
function loadLS(key, def) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch { return def; } }

export default function TrollFamilyApplication() {
  const [familyName, setFamilyName] = useState("");
  const [contact, setContact] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setStatus("");
    const payload = { family_name: familyName, contact, description, created_at: new Date().toISOString(), type: "family" };
    const list = loadLS("tc_apps_family", []);
    saveLS("tc_apps_family", [payload, ...list]);
    if (supabase.__isConfigured) {
      try {
        const values = { user_id: null, family_name: familyName, family_description: description, contact, status: 'pending' };
        await supabase.from("troll_family_applications").insert(values);
        const { data: admins } = await supabase.from('profiles').select('*').eq('role','admin').limit(10);
        if (Array.isArray(admins)) {
          const rows = admins.map(a => ({
            user_id: a.id,
            type: 'family_application',
            title: 'New Troll Family Application',
            message: `${familyName} submitted a family application`,
            is_read: false,
            created_date: new Date().toISOString(),
          }));
          await supabase.from('notifications').insert(rows).catch(()=>{});
        }
      } catch {}
    }
    setStatus("Submitted");
    setFamilyName(""); setContact(""); setDescription("");
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#120a1f] to-[#0a0a0f] py-10 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
            <Users className="w-5 h-5 text-black" />
          </div>
          <h1 className="text-2xl font-bold text-white">Troll Family Application</h1>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="bg-[#11121a] border-[#2a2a3a] p-6 lg:col-span-2 rounded-xl">
            <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input value={familyName} onChange={(e)=>setFamilyName(e.target.value)} placeholder="Family Name" className="bg-[#0f0f16] border-[#2a2a3a] text-white md:col-span-2" />
              <Input value={contact} onChange={(e)=>setContact(e.target.value)} placeholder="Contact" className="bg-[#0f0f16] border-[#2a2a3a] text-white md:col-span-2" />
              <Textarea value={description} onChange={(e)=>setDescription(e.target.value)} placeholder="Description" className="bg-[#0f0f16] border-[#2a2a3a] text-white md:col-span-2" />
              <div className="md:col-span-2 flex items-center justify-between">
                {status && <p className="text-emerald-400 text-sm">{status}</p>}
                <Button type="submit" className="bg-cyan-500 hover:bg-cyan-600 text-black">Submit Application</Button>
              </div>
            </form>
          </Card>
          <Card className="bg-[#11121a] border-[#2a2a3a] p-6 rounded-xl">
            <div className="space-y-2">
              <p className="text-white font-semibold">About</p>
              <p className="text-gray-400 text-sm">Share key details about your family group, contact methods, and goals.</p>
              <p className="text-gray-400 text-sm">We will review and contact you if more information is required.</p>
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}
