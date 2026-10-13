-- ==============================================================================
-- TriPro ERP Migration: User Allowed Treasuries / Cash Safe Scope
-- Date: 2026-10-14
-- Description:
--   إضافة عمود allowed_treasury_ids لجدول profiles للتحكم في نطاق الخزن النقدية
--   المصرح بها للمستخدم، بحيث يرى فقط حركات خزنته المحددة (مثل خزينة ياسر)
--   وحجب باقي الخزن والبنوك والمحافظ الرقمية عنه، مع بقاء النظام عاماً لأي شركة.
-- ==============================================================================

-- 1. إضافة العمود إذا لم يكن موجوداً
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS allowed_treasury_ids text[] DEFAULT NULL;

COMMENT ON COLUMN public.profiles.allowed_treasury_ids IS 'قائمة معرفات الحسابات النقدية والخزن المصرح للمستخدم بالتعامل معها ورؤية حركاتها';

-- 2. إسناد خزينة أ-ياسر لحساب الموظف ياسر في منشأة لينزا
DO $$
DECLARE
    v_yaser_user_id uuid;
    v_yaser_acc_id uuid;
BEGIN
    SELECT id INTO v_yaser_user_id 
    FROM public.profiles 
    WHERE full_name ILIKE '%yaser%' OR full_name ILIKE '%ياسر%'
    LIMIT 1;

    SELECT id INTO v_yaser_acc_id 
    FROM public.accounts 
    WHERE code = '1235' OR name ILIKE '%خزينه%ياسر%' OR name ILIKE '%خزينة%ياسر%'
    LIMIT 1;

    IF v_yaser_user_id IS NOT NULL AND v_yaser_acc_id IS NOT NULL THEN
        UPDATE public.profiles 
        SET allowed_treasury_ids = ARRAY[v_yaser_acc_id::text]
        WHERE id = v_yaser_user_id;
        
        RAISE NOTICE 'Assigned treasury % to user %', v_yaser_acc_id, v_yaser_user_id;
    END IF;
END $$;

-- 3. تحديث كاش البوستغريست
NOTIFY pgrst, 'reload schema';
