import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing environment variables");
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface Gift {
  coin_value: number;
  recipient?: {
    id: string;
    troll_family_id: string;
    troll_family_name: string;
  };
}

interface FamilyData {
  family_id: string;
  family_name: string;
  total_coins: number;
}

// Generate weekly family payout: find top family by gifts received in the prior week
async function generateWeeklyFamilyPayout(referenceDate = new Date()) {
  const ref = new Date(referenceDate);
  const day = ref.getDay();
  const daysSinceFriday = day >= 5 ? day - 5 : 7 - (5 - day);
  const lastFriday = new Date(ref);
  lastFriday.setDate(ref.getDate() - daysSinceFriday);
  lastFriday.setHours(0, 0, 0, 0);
  const weekStart = new Date(lastFriday.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekEnd = new Date(lastFriday.getTime());

  console.log(`Generating weekly payout for week: ${weekStart.toISOString()} to ${weekEnd.toISOString()}`);

  // Fetch gifts for the week, grouped by family
  const { data: gifts, error: giftErr } = await supabase
    .from("stream_gifts")
    .select("*, recipient:recipient_id(id, troll_family_id, troll_family_name)")
    .gte("created_date", weekStart.toISOString())
    .lt("created_date", weekEnd.toISOString());

  if (giftErr) {
    console.error("Error fetching gifts:", giftErr);
    throw giftErr;
  }

  const byFamily: Record<string, FamilyData> = {};
  (gifts || []).forEach((g: Gift) => {
    const fam = g.recipient?.troll_family_id;
    if (!fam) return;
    const name = g.recipient?.troll_family_name || "Unknown";
    if (!byFamily[fam]) {
      byFamily[fam] = { family_id: fam, family_name: name, total_coins: 0 };
    }
    byFamily[fam].total_coins += Number(g.coin_value || 0);
  });

  const arr = Object.values(byFamily).sort((a: FamilyData, b: FamilyData) => b.total_coins - a.total_coins);
  if (arr.length === 0) {
    console.log("No families qualified for payout this week");
    return { success: false, message: "No families qualified" };
  }

  const top = arr[0];
  const TOTAL_USD = 50;

  // Get family members
  const { data: members, error: memErr } = await supabase
    .from("profiles")
    .select("id, username, email")
    .eq("troll_family_id", top.family_id);

  if (memErr) {
    console.error("Error fetching family members:", memErr);
    throw memErr;
  }

  const memberCount = (members || []).length;
  if (memberCount === 0) {
    console.log("Family has no members");
    return { success: false, message: "Family has no members" };
  }

  const perMember = parseFloat((TOTAL_USD / memberCount).toFixed(2));

  // Insert weekly payout summary (with UPSERT to prevent duplicates)
  const { error: insertErr } = await supabase.from("family_weekly_payouts").upsert(
    {
      family_id: top.family_id,
      family_name: top.family_name,
      total_coins_received: top.total_coins,
      payout_amount_total: TOTAL_USD,
      payout_per_member: perMember,
      week_start: weekStart.toISOString(),
      week_end: weekEnd.toISOString(),
      created_date: new Date().toISOString(),
    },
    { onConflict: "family_id,week_start" }
  );

  if (insertErr) {
    console.error("Error inserting weekly payout summary:", insertErr);
    throw insertErr;
  }

  // Create individual Payout rows (check for duplicates by user + week)
  for (const m of members) {
    // Check if payout already exists for this user+week to avoid duplicates
    const { data: existing } = await supabase
      .from("payouts")
      .select("id")
      .eq("user_id", m.id)
      .gte("created_date", weekStart.toISOString())
      .lt("created_date", weekEnd.toISOString())
      .eq("payment_details", `Family weekly payout ${top.family_name}`);

    if (existing && existing.length > 0) {
      console.log(`Payout for ${m.email} already exists for this week`);
      continue;
    }

    const { error: payoutErr } = await supabase.from("payouts").insert({
      user_id: m.id,
      user_name: m.username || m.email,
      user_email: m.email || null,
      coin_amount: 0,
      usd_amount: perMember,
      fee_amount: 0,
      payout_amount: perMember,
      payment_method: "manual",
      payment_details: `Family weekly payout ${top.family_name}`,
      status: "pending",
      admin_notes: `Family weekly payout for week ${weekStart.toISOString()} - ${weekEnd.toISOString()}`,
      created_date: new Date().toISOString(),
    });

    if (payoutErr) {
      console.error(`Error creating payout for ${m.email}:`, payoutErr);
    }
  }

  console.log(`✅ Generated payout for family ${top.family_name}: $${perMember} per member`);
  return {
    success: true,
    family_name: top.family_name,
    member_count: memberCount,
    payout_per_member: perMember,
    total_payout: TOTAL_USD,
  };
}

serve(async (req: Request) => {
  try {
    // Only allow POST requests
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const result = await generateWeeklyFamilyPayout();
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
