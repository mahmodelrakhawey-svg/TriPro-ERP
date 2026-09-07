-- 🌟 إنشاء جدول إقفال الصندوق (Cash Closing Table)
-- قم بتشغيل هذا الملف في Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.cash_closings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    closing_date timestamptz DEFAULT now(),
    treasury_account_id uuid REFERENCES public.accounts(id),
    system_balance numeric DEFAULT 0,
    actual_balance numeric DEFAULT 0,
    difference numeric DEFAULT 0,
    notes text,
    status text DEFAULT 'closed',
    user_id uuid REFERENCES public.profiles(id),
    organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
-- ملاحظة: سيتم إضافة created_by كعمود افتراضي عبر سكربت updated_system_stabilization