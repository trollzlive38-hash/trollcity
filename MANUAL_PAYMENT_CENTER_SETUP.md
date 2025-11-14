# Manual Payment Center (MPC) - Complete Setup Guide

## Overview

The **Manual Payment Center (MPC)** is a complete admin-only payment management system that allows admins to review and verify manual coin purchases, then credit coins directly to user accounts.

### Key Features:
- **User-Friendly Payment Form** – Users can choose from multiple payment methods (PayPal, Cash App, Venmo, Zelle, Bank Transfer) and upload payment proof
- **Admin Dashboard** – Admins see all pending manual payment requests with user details and payment screenshots
- **Verification & Approval** – Admins can approve payments and instantly credit coins to users
- **Payment Tracking** – View payment history with status (pending, approved, rejected)
- **Real-Time Updates** – Uses React Query for instant dashboard updates

---

## 1. Database Setup

### SQL Schema for `manual_payment_requests`

Run this SQL in your Supabase SQL Editor:

```sql
-- Create manual_payment_requests table
CREATE TABLE IF NOT EXISTS public.manual_payment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  user_email TEXT NOT NULL,
  coin_amount INTEGER NOT NULL,
  usd_amount DECIMAL(10, 2) NOT NULL,
  payment_method TEXT NOT NULL, -- 'paypal', 'cashapp', 'venmo', 'zelle', 'bank_transfer'
  payment_proof_url TEXT, -- URL to uploaded screenshot
  payment_account TEXT, -- user's PayPal email, $CashTag, Venmo handle, etc.
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  admin_notes TEXT,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMP,
  created_date TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMP DEFAULT NOW(),
  CONSTRAINT valid_status CHECK (status IN ('pending', 'approved', 'rejected'))
);

-- Create indexes for faster queries
CREATE INDEX idx_manual_payment_requests_status ON public.manual_payment_requests(status);
CREATE INDEX idx_manual_payment_requests_user_id ON public.manual_payment_requests(user_id);
CREATE INDEX idx_manual_payment_requests_created_date ON public.manual_payment_requests(created_date DESC);

-- Enable Row Level Security
ALTER TABLE public.manual_payment_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users can view their own payment requests
CREATE POLICY "Users can view their own payment requests" 
  ON public.manual_payment_requests FOR SELECT 
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND (role = 'admin' OR is_admin = true)
    )
  );

-- Users can insert their own payment requests
CREATE POLICY "Users can insert their own payment requests" 
  ON public.manual_payment_requests FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Admins can update payment requests
CREATE POLICY "Admins can update payment requests" 
  ON public.manual_payment_requests FOR UPDATE 
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND (role = 'admin' OR is_admin = true)
    )
  );
```

---

## 2. File Structure & Components

### Created Files:

#### `src/pages/ManualPaymentCenter.jsx` (Admin Dashboard)
- **Purpose:** Admin-only page to review and approve manual payments
- **Features:**
  - Admin authentication check (redirects if not admin)
  - Pending/approved/rejected payment filters
  - Payment request cards with user info and payment details
  - Preview dialog showing payment screenshot
  - Admin approval/rejection UI with coin credit input
  - Stats dashboard (pending count, total USD value)
  - Real-time updates using React Query

#### `src/pages/ManualCoinsPayment.jsx` (Updated User Payment Form)
- **Purpose:** Multi-method payment form for users to submit manual payments
- **Features:**
  - Payment method selection (PayPal, Cash App, Venmo, Zelle, Bank Transfer)
  - User's payment account input (email, handle, bank details, etc.)
  - Coin amount selector with preset options
  - USD amount input field
  - Payment proof screenshot upload with drag-and-drop support
  - Optional description field
  - Form validation and error handling
  - Direct insertion into `manual_payment_requests` table

### Modified Files:

#### `src/pages/index.jsx`
- Added import for `ManualPaymentCenter`
- Added routes:
  - `/ManualPaymentCenter` (CamelCase)
  - `/manual-payment-center` (kebab-case)

---

## 3. User Flow

### How Users Submit Manual Payments:

1. **User navigates to Store** → Clicks "Purchase Coins"
2. **Payment dialog appears** → User chooses payment method option
3. **Redirected to ManualCoinsPayment page** with:
   - Step 1: Choose payment method (PayPal, Cash App, Venmo, Zelle, Bank Transfer)
   - Step 2: Enter payment account (email/handle/bank details)
   - Step 3: Select coin amount (presets or custom)
   - Step 4: Upload payment proof screenshot
   - Step 5: Optional notes
4. **Form submitted** → Payment request saved to `manual_payment_requests` table as "pending"
5. **Success toast** → User redirected to Store page
6. **Admin notification** → Pending payment appears in ManualPaymentCenter dashboard

---

## 4. Admin Flow

### How Admins Manage Manual Payments:

1. **Admin navigates to ManualPaymentCenter** via admin menu or direct URL `/ManualPaymentCenter`
2. **Authentication check** – If not admin, access denied message shown
3. **Dashboard displays:**
   - Stats: Pending count, approved count, rejected count, total pending USD value
   - Filter buttons: Pending, Approved, Rejected, All
   - Payment request cards with:
     - User avatar, username, email
     - Amount (USD and coin count)
     - Payment method and account
     - Submission date
     - Current status badge
4. **Admin clicks "View" button** → Preview dialog opens showing:
   - Full user/payment details
   - Payment proof screenshot preview (large image)
   - Admin notes textarea
   - Approve / Reject action buttons
5. **Admin approves payment** by:
   - (Optional) Adding admin notes
   - Clicking "Approve & Credit Coins"
   - Coins instantly credited to user's `purchased_coins` field
   - Request status updated to "approved"
   - Record shows when approved and by which admin
6. **Admin rejects payment** by:
   - Adding rejection reason in admin notes
   - Clicking "Reject"
   - Status updated to "rejected"
7. **Approved/rejected payments** can be viewed in history with full audit trail

---

## 5. Payment Method Details

### Supported Methods:

| Method | Icon | Placeholder | Use Case |
|--------|------|-------------|----------|
| PayPal | 🅿️ | your.email@example.com | Email-based transfers |
| Cash App | 💵 | $YourHandle | Mobile payment app |
| Venmo | Ⓥ | @yourvenmohandle | P2P transfers |
| Zelle | 💳 | phone@example.com | Bank-integrated transfers |
| Bank Transfer | 🏦 | Your Bank Details | Direct deposit |

Users provide their payment account details, which are stored securely in the database.

---

## 6. Admin Approval Process

### Coin Credit Logic:

When admin approves a payment:

1. **Read current coins** from user's profile (`purchased_coins` field)
2. **Add coin amount** specified in the approval
3. **Update user's coin balance** in `profiles` table
4. **Update payment request** status to "approved"
5. **Record admin info** (`approved_by`, `approved_at`)
6. **Timestamp all changes** for audit trail

### Example:
- User has: 1000 purchased coins
- Admin approves payment for: 5000 coins
- User now has: 6000 purchased coins ✅

---

## 7. UI Components Used

- **Card** – Container for payment requests and sections
- **Button** – Action buttons (View, Approve, Reject)
- **Badge** – Status indicators (Pending, Approved, Rejected)
- **Input** – Text fields for amounts and account details
- **Textarea** – Multi-line notes field
- **Dialog** – Modal for payment preview/approval
- **Icons** – Lucide icons for visual indicators
- **Motion** – Framer Motion animations for smooth transitions

---

## 8. Error Handling

### Upload Errors:
- Tries multiple storage buckets (images, avatars)
- Clear error messages if upload fails
- Validation of file types and sizes

### Database Errors:
- Handles constraint violations
- User-friendly error toasts
- Logs detailed errors to console

### Auth Errors:
- Redirects non-admins to access denied page
- Checks both `role` and `is_admin` fields for flexibility

---

## 9. Security Features

### Row Level Security (RLS):
- Users can only **view** their own payment requests
- Users can only **insert** their own payment requests
- Only **admins** can **update** payment requests (approve/reject)

### Authentication:
- Admin check on MPC page prevents unauthorized access
- Payment requests associated with authenticated user
- Admin approval requires admin role

### Data Protection:
- Payment details stored securely in database
- Screenshots uploaded to secure Supabase storage
- Audit trail (approved_by, approved_at)

---

## 10. Testing Checklist

- [ ] User can access ManualCoinsPayment page from Store
- [ ] All 5 payment methods available for selection
- [ ] Payment method changes placeholder text appropriately
- [ ] Coin presets auto-populate USD amount
- [ ] File upload works with drag-and-drop and click
- [ ] Form validation prevents submission without required fields
- [ ] Payment request inserted into database with "pending" status
- [ ] Admin can access ManualPaymentCenter page
- [ ] Non-admin gets access denied on MPC page
- [ ] Pending payments display in MPC dashboard
- [ ] Admin can preview payment with screenshot
- [ ] Admin can approve payment and coin amount is added to user
- [ ] Approved payment shows in history with admin info
- [ ] Admin can reject payment with notes
- [ ] Payment request status updates in real-time

---

## 11. Future Enhancements

- [ ] Email notification when payment approved/rejected
- [ ] Stripe integration for automatic processing
- [ ] Payment status notifications in user account
- [ ] Batch approval for multiple payments
- [ ] Export payment history as CSV
- [ ] Payment analytics dashboard
- [ ] Refund processing workflow
- [ ] Payment method verification (confirm PayPal email, etc.)

---

## 12. Support & Troubleshooting

### Common Issues:

**Q: Admins not appearing in MPC dashboard**
- A: Check user profile has `role = 'admin'` or `is_admin = true`

**Q: Payment screenshot not uploading**
- A: Ensure storage bucket has proper RLS policies. Check file size limits.

**Q: Coins not crediting after approval**
- A: Verify user's `profiles` table has `purchased_coins` column. Check RLS policies.

**Q: Payment requests not appearing**
- A: Verify `manual_payment_requests` table exists and RLS policies allow reads.

---

## Summary

The Manual Payment Center provides a complete, secure workflow for users to submit manual payments and admins to verify and credit coins instantly. All data is encrypted, audited, and follows Supabase security best practices.

**Live URLs:**
- User Payment Form: `/ManualCoinsPayment`
- Admin Dashboard: `/ManualPaymentCenter`
