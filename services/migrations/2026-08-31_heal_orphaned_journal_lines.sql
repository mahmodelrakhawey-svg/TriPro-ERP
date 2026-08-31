-- ==============================================================================
-- 🩺 TriPro ERP - إصلاح ومعالجة القيود المحاسبية ذات الحسابات المفقودة أو المحذوفة
-- تاريخ التنفيذ: 2026-08-31
-- ==============================================================================

DO $$
DECLARE
    r RECORD;
    v_org_id uuid;
    v_rec_acc uuid;
    v_sales_acc uuid;
    v_comm_acc uuid;
    v_default_acc uuid;
    v_repaired_count integer := 0;
BEGIN
    RAISE NOTICE 'بدء فحص وتصحيح أسطر القيود المحاسبية المفقودة...';

    FOR r IN 
        SELECT jl.id AS line_id, jl.description, jl.debit, jl.credit, je.organization_id
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON je.id = jl.journal_entry_id
        WHERE jl.account_id NOT IN (SELECT id FROM public.accounts)
    LOOP
        v_org_id := r.organization_id;

        -- 1. البحث عن حساب العملاء / المدينين
        SELECT id INTO v_rec_acc 
        FROM public.accounts 
        WHERE organization_id = v_org_id 
          AND (code IN ('1221', '122', '102') OR (type = 'asset' AND name LIKE '%عملاء%'))
          AND is_group = false 
        ORDER BY code ASC LIMIT 1;

        -- 2. البحث عن حساب إيراد المبيعات (حسابات الإيرادات فقط code 4 واستبعاد الأصول 1244)
        SELECT id INTO v_sales_acc 
        FROM public.accounts 
        WHERE organization_id = v_org_id 
          AND (code IN ('411', '4101', '41101', '41', '401') OR (type = 'revenue' AND name LIKE '%مبيعات%'))
          AND code NOT LIKE '1%'
          AND is_group = false 
        ORDER BY code ASC LIMIT 1;

        -- 3. البحث عن حساب مصروف العمولات والتسويق (استبعاد تكلفة المبيعات 51)
        SELECT id INTO v_comm_acc 
        FROM public.accounts 
        WHERE organization_id = v_org_id 
          AND (code IN ('522', '5221', '5204', '52', '53') OR (type = 'expense' AND (name LIKE '%عمول%' OR name LIKE '%تسويق%' OR name LIKE '%توزيع%')))
          AND code NOT IN ('51', '511')
          AND is_group = false 
        ORDER BY code ASC LIMIT 1;

        -- 4. حساب افتراضي عام
        SELECT id INTO v_default_acc 
        FROM public.accounts 
        WHERE organization_id = v_org_id AND is_group = false 
        LIMIT 1;

        -- التوجيه الذكي للحساب بناءً على وصف السطر وطبيعة الحركة
        IF r.description ILIKE '%عمولة%' OR r.description ILIKE '%تسويق%' THEN
            UPDATE public.journal_lines 
            SET account_id = COALESCE(v_comm_acc, v_default_acc)
            WHERE id = r.line_id;
            v_repaired_count := v_repaired_count + 1;

        ELSIF r.description ILIKE '%مستحق على منصة%' OR r.description ILIKE '%صافي%' OR r.description ILIKE '%منصة%' OR (r.debit > 0) THEN
            UPDATE public.journal_lines 
            SET account_id = COALESCE(v_rec_acc, v_default_acc)
            WHERE id = r.line_id;
            v_repaired_count := v_repaired_count + 1;

        ELSIF r.description ILIKE '%إيراد%' OR r.description ILIKE '%مبيعات%' OR r.credit > 0 THEN
            UPDATE public.journal_lines 
            SET account_id = COALESCE(v_sales_acc, v_default_acc)
            WHERE id = r.line_id;
            v_repaired_count := v_repaired_count + 1;

        ELSE
            UPDATE public.journal_lines 
            SET account_id = v_default_acc
            WHERE id = r.line_id;
            v_repaired_count := v_repaired_count + 1;
        END IF;

    END LOOP;

    RAISE NOTICE 'تم بنجاح إصلاح وتصحيح % سطر محاسبي وربطه بالحسابات الصحيحة في شجرة الحسابات ✅', v_repaired_count;
END $$;
