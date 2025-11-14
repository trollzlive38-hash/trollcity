-- Manual Payment Center Database Schema
-- Copy and run this entire script in your Supabase SQL Editor

-- ============================================================================
-- CREATE TABLE: manual_payment_requests
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.manual_payment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  user_email TEXT NOT NULL,
  coin_amount INTEGER NOT NULL,
  usd_amount DECIMAL(10, 2) NOT NULL,
  payment_method TEXT NOT NULL,
  payment_proof_url TEXT,
  payment_account TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_notes TEXT,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMP,
  created_date TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMP DEFAULT NOW(),
  CONSTRAINT valid_status CHECK (status IN ('pending', 'approved', 'rejected'))
);

-- ============================================================================
-- CREATE INDEXES
-- ============================================================================
CREATE INDEX idx_manual_payment_requests_status 
  ON public.manual_payment_requests(status);

CREATE INDEX idx_manual_payment_requests_user_id 
  ON public.manual_payment_requests(user_id);

CREATE INDEX idx_manual_payment_requests_created_date 
  ON public.manual_payment_requests(created_date DESC);

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE public.manual_payment_requests ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Policy 1: Users can view their own payment requests + Admins can view all
CREATE POLICY "Users can view their own payment requests" 
  ON public.manual_payment_requests 
  FOR SELECT 
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND (role = 'admin' OR is_admin = true)
    )
  );

-- Policy 2: Users can insert their own payment requests
CREATE POLICY "Users can insert their own payment requests" 
  ON public.manual_payment_requests 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Policy 3: Admins can update payment requests
CREATE POLICY "Admins can update payment requests" 
  ON public.manual_payment_requests 
  FOR UPDATE 
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND (role = 'admin' OR is_admin = true)
    )
  );

-- ============================================================================
-- VERIFY TABLE CREATION
-- ============================================================================
-- Run this query to verify the table was created successfully:
-- SELECT * FROM public.manual_payment_requests LIMIT 1;

-- ============================================================================
-- SAMPLE DATA (Optional - for testing)
-- ============================================================================
-- Don't run this in production. Only for testing/development:

-- INSERT INTO public.manual_payment_requests (
--   user_id,
--   username,
--   user_email,
--   coin_amount,
--   usd_amount,
--   payment_method,
--   payment_account,
--   status
-- ) VALUES (
--   'user-uuid-here',
--   'testuser',
--   'test@example.com',
--   5000,
--   49.99,
--   'paypal',
--   'test@paypal.com',
--   'pending'
-- );
