-- 🌟 إنشاء جدول لتسجيل محاولات الإقفال المرفوضة
-- This table will log attempts to close the cash register with a deficit exceeding the allowed limit.

CREATE TABLE IF NOT EXISTS public.rejected_cash_closings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    rejection_date timestamptz DEFAULT now(),
    treasury_account_id uuid REFERENCES public.accounts(id),
    system_balance numeric NOT NULL,
    actual_balance numeric NOT NULL,
    difference numeric NOT NULL,
    notes text,
    rejected_by uuid REFERENCES auth.users(id),
    max_allowed_deficit numeric
);