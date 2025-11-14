# Troll Officer & Family Payouts — Deployment & Setup Guide

## Overview
This guide covers the complete setup for Troll Officer moderation, family weekly payouts, and integration with your app.

---

## 1. Database Migration

Run the SQL migration to add new tables and columns:

```bash
cd supabase
supabase db push
```

Or apply manually via Supabase Dashboard → SQL Editor:
- File: `supabase/migrations/20251113_troll_officer_family_payouts.sql`
- Creates: `family_weekly_payouts`, `payouts` tables (if missing)
- Adds: `is_kicked`, `kicked_at`, `chat_disabled`, `officer_pay_rate` columns to `profiles`

**Verify:**
```sql
SELECT column_name FROM information_schema.columns WHERE table_name = 'profiles';
-- Should include: is_kicked, kicked_at, chat_disabled, officer_pay_rate
```

---

## 2. Deploy Edge Function for Weekly Payouts

Deploy the Edge Function that generates weekly family payouts:

```bash
cd supabase
supabase functions deploy generateWeeklyFamilyPayout
```

**Test the function manually:**
```bash
curl -X POST https://<PROJECT_ID>.supabase.co/functions/v1/generateWeeklyFamilyPayout \
  -H "Authorization: Bearer <ANON_KEY>"
```

Or use the Supabase Dashboard → Edge Functions → "generateWeeklyFamilyPayout" → Invoke.

---

## 3. Schedule Weekly Execution (Cron)

### Option A: Using Supabase Scheduled Functions (Recommended)

Set up a cron job to invoke the function every Friday at 12:00 PM UTC:

1. **Via Supabase CLI:**
   ```bash
   supabase functions deploy generateWeeklyFamilyPayout --schedule "0 12 * * FRI"
   ```

2. **Via Dashboard:**
   - Go to Supabase Dashboard → Edge Functions
   - Select `generateWeeklyFamilyPayout`
   - Set Schedule: `0 12 * * FRI` (Cron expression)
   - Click "Save"

### Option B: Using External Cron Service (e.g., EasyCron, AWS EventBridge)

**Example using cURL (EasyCron):**
```bash
# Create a cron job at https://www.easycron.com/
# URL: https://<PROJECT_ID>.supabase.co/functions/v1/generateWeeklyFamilyPayout
# Headers: Authorization: Bearer <ANON_KEY>
# Frequency: Every Friday 12:00 PM UTC
```

### Option C: Self-Hosted Cron (Node.js)

Use `node-cron` in your backend:
```javascript
import cron from 'node-cron';
import fetch from 'node-fetch';

// Run every Friday at 12:00 PM UTC
cron.schedule('0 12 * * FRI', async () => {
  try {
    const response = await fetch('https://<PROJECT_ID>.supabase.co/functions/v1/generateWeeklyFamilyPayout', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
      }
    });
    const result = await response.json();
    console.log('Weekly payout generated:', result);
  } catch (err) {
    console.error('Payout generation failed:', err);
  }
});
```

---

## 4. Features & Access Control

### Troll Officer Access

- **Who can access?** Admins and users with `is_troll_officer = true` and `permissions` including `"moderate_chat"`, `"kick_users"`, `"ban_users"`
- **How to grant?** Admin approves a Troll Officer application in `AdminDashboardPage` → they're assigned `is_troll_officer = true` + permissions
- **Pages:**
  - `/TrollOfficers` — Officer pay settings & moderation controls
  - `/FamilyPayouts` — Admin-only view of weekly family payouts

### Moderation Features

Officers can:
- **Ban/Unban** users: Sets `is_banned = true/false`
- **Kick/Unkick** users: Sets `is_kicked = true/false` (redirects to payment page)
- **Disable/Enable Chat**: Sets `chat_disabled = true/false` (user can't send messages)
- **Set Officer Pay**: Updates `officer_pay_rate` (used for manual admin payouts)

### Enforcement

- **`is_banned`**: User redirected to payment page (Layout.jsx)
- **`is_kicked`**: User redirected to payment page (Layout.jsx)
- **`chat_disabled`**: User can't send messages (ChatBox.jsx)

---

## 5. Family Weekly Payouts

### How It Works

1. **Every Friday at 12:00 PM UTC**, the Edge Function runs:
   - Finds the family with the most gifts received in the past week
   - Creates a `family_weekly_payouts` summary record
   - Creates individual `payouts` rows ($50 split among members)

2. **Family Members** can view their pending payouts in the Earnings section

3. **Admins** approve payouts manually via AdminDashboard → Payouts section

### Admin: Trigger Manual Payout

Go to `/FamilyPayouts` (sidebar link visible to admins) and click "Run Weekly Payout Now" to test.

### Client-Side Integration

The family payout generation is also available in `src/lib/families.js`:

```javascript
import { generateWeeklyFamilyPayout } from '@/lib/families';

// Call from admin actions
const result = await generateWeeklyFamilyPayout();
console.log(`Payout: ${result.family_name} — $${result.perMember} per member`);
```

---

## 6. Admins Dashboard Panel (Optional)

You can add a quick stats section to the AdminDashboard:

```jsx
// In AdminDashboardPage.jsx
const { data: recentFamilyPayouts } = useQuery({
  queryKey: ['familyPayoutsRecent'],
  queryFn: async () => {
    const { data } = await supabase
      .from('family_weekly_payouts')
      .select('*')
      .order('created_date', { ascending: false })
      .limit(5);
    return data || [];
  }
});

// Render:
<Card className="p-4 bg-[#1a1a24]">
  <h3 className="text-lg font-semibold mb-4">Recent Family Payouts</h3>
  {recentFamilyPayouts.map(p => (
    <div key={p.id} className="flex justify-between p-2 bg-[#0a0a0f] rounded mb-2">
      <span>{p.family_name}</span>
      <span className="text-green-400">${p.payout_per_member} each</span>
    </div>
  ))}
</Card>
```

---

## 7. Testing Checklist

- [ ] Database migration applied (check columns exist)
- [ ] Edge Function deployed and testable
- [ ] Cron schedule set (verify in Supabase Dashboard)
- [ ] Officer role assignment works (admin approves app)
- [ ] Officer page accessible at `/TrollOfficers`
- [ ] Ban/Kick/Chat controls update profiles correctly
- [ ] Banned user redirected to payment page
- [ ] Kicked user redirected to payment page
- [ ] Chat disabled prevents message sending
- [ ] Family payout generation works (manual trigger)
- [ ] Payouts appear in admin Earnings section
- [ ] Family members can view pending payouts

---

## 8. Troubleshooting

**Function not running?**
- Check Supabase Dashboard → Edge Functions logs
- Verify cron expression syntax
- Ensure service role key has proper permissions

**Duplicates in payouts table?**
- Edge Function checks for existing payouts before inserting
- If duplicates exist, delete them: `DELETE FROM payouts WHERE ...`

**Users not redirected on ban?**
- Check `Layout.jsx` — `is_banned`/`is_kicked` logic
- Verify `profiles` table has the columns

**Chat still enabled when disabled?**
- Verify `chat_disabled` column exists in `profiles`
- Check `ChatBox.jsx` for `isChatDisabled` logic

---

## 9. Security Notes

- Edge Function uses `SUPABASE_SERVICE_ROLE_KEY` (private, server-only)
- Client-side admin UI uses `SUPABASE_ANON_KEY` (RLS controls access)
- Ban/Kick/Chat actions require admin/officer role (enforced in UI + DB RLS)
- Weekly payout generation is idempotent (UNIQUE constraint on `family_id + week_start`)

---

## Next Steps

1. Run migration
2. Deploy Edge Function
3. Set up cron schedule (pick Option A, B, or C above)
4. Test officer features
5. Monitor logs for errors
6. Refine pay rates / payout amounts as needed

Questions? Check `src/pages/TrollOfficerPanel.jsx`, `src/lib/families.js`, and `src/pages/FamilyPayoutsAdmin.jsx` for implementation details.
