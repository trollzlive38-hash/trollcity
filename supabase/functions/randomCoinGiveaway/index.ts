import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing environment variables");
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface Profile {
  id: string;
  username: string;
  email: string;
  free_coins: number;
}

interface GiveawayRecord {
  user_id: string;
  amount: number;
  created_date: string;
}

// Random free coin giveaway: Select 5 random users and give them 10,000 free coins each
async function randomCoinGiveaway(): Promise<Record<string, unknown>> {
  console.log("Starting random coin giveaway...");

  // Get all verified users with age verification
  const { data: allUsers, error: userErr } = await supabase
    .from("profiles")
    .select("id, username, email, free_coins")
    .eq("is_age_verified", true)
    .gt("coins", 0) // Only users with some activity
    .limit(1000);

  if (userErr) {
    console.error("Error fetching users:", userErr);
    throw userErr;
  }

  const users = (allUsers || []) as Profile[];
  
  if (users.length === 0) {
    console.log("No eligible users found for giveaway");
    return { success: false, message: "No eligible users" };
  }

  // Randomly select 5 users (or fewer if not enough users)
  const giveawayCount = Math.min(5, users.length);
  const selectedUsers: Profile[] = [];
  const usedIndices = new Set<number>();

  for (let i = 0; i < giveawayCount; i++) {
    let randomIdx: number;
    do {
      randomIdx = Math.floor(Math.random() * users.length);
    } while (usedIndices.has(randomIdx));
    usedIndices.add(randomIdx);
    selectedUsers.push(users[randomIdx]);
  }

  const GIVEAWAY_AMOUNT = 10000;
  const results: GiveawayRecord[] = [];
  const now = new Date().toISOString();

  // Credit coins to each selected user
  for (const user of selectedUsers) {
    try {
      // Insert transaction
      const { error: txErr } = await supabase.from("coin_transactions").insert({
        user_id: user.id,
        amount: GIVEAWAY_AMOUNT,
        type: "credit",
        reason: "giveaway",
        source: "random_giveaway",
        created_date: now,
      });

      if (txErr) {
        console.error(`Failed to insert transaction for ${user.email}:`, txErr);
        continue;
      }

      // Update profile balance
      const newFreeCoins = (user.free_coins || 0) + GIVEAWAY_AMOUNT;
      const { error: updateErr } = await supabase
        .from("profiles")
        .update({
          free_coins: newFreeCoins,
          coins: (user.free_coins || 0) + GIVEAWAY_AMOUNT, // Update total as well
          updated_date: now,
        })
        .eq("id", user.id);

      if (updateErr) {
        console.error(`Failed to update profile for ${user.email}:`, updateErr);
        continue;
      }

      // Record giveaway
      const { error: recordErr } = await supabase.from("giveaway_records").insert({
        user_id: user.id,
        amount: GIVEAWAY_AMOUNT,
        created_date: now,
      });

      if (recordErr) {
        console.error(`Failed to record giveaway for ${user.email}:`, recordErr);
      }

      results.push({
        user_id: user.id,
        amount: GIVEAWAY_AMOUNT,
        created_date: now,
      });

      console.log(
        `✅ Gave ${GIVEAWAY_AMOUNT} coins to ${user.username} (${user.email})`
      );
    } catch (error) {
      console.error(
        `Error processing giveaway for ${user.email}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  console.log(`🎉 Giveaway complete: ${results.length} users received ${GIVEAWAY_AMOUNT} coins each`);
  return {
    success: true,
    users_count: results.length,
    amount_per_user: GIVEAWAY_AMOUNT,
    total_distributed: results.length * GIVEAWAY_AMOUNT,
    winners: results.map(r => r.user_id),
  };
}

serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const result = await randomCoinGiveaway();
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
