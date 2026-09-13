-- ==============================================================================
-- 🛡️ TriPro ERP - Enterprise Security Hardening Migration
-- Date: 2026-09-13
-- Purpose:
--   1. Revoke public/anon access to destructive and sensitive business functions
--   2. Reinforce Row Level Security (RLS) on critical financial tables
--   3. Secure delete_journal_entry_safe with strict organization & caller checks
-- ==============================================================================

-- 1. سحب صلاحيات التنفيذ المجهولة (anon / public) عن الدوال المحاسبية والتنفيذية الحساسة
DO $$
BEGIN
    -- سحب صلاحيات حذف القيود من المستخدمين غير المسجلين
    BEGIN
        REVOKE EXECUTE ON FUNCTION public.delete_journal_entry_safe(uuid, uuid) FROM anon, public;
        GRANT EXECUTE ON FUNCTION public.delete_journal_entry_safe(uuid, uuid) TO authenticated, service_role;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- سحب صلاحيات حذف بيانات اختبار الضغط
    BEGIN
        REVOKE EXECUTE ON FUNCTION public.delete_stress_test_data(uuid) FROM anon, public;
        GRANT EXECUTE ON FUNCTION public.delete_stress_test_data(uuid) TO authenticated, service_role;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- سحب صلاحيات ترحيل واعتماد الفواتير من العامة
    BEGIN
        REVOKE EXECUTE ON FUNCTION public.post_sales_invoice(uuid) FROM anon, public;
        GRANT EXECUTE ON FUNCTION public.post_sales_invoice(uuid) TO authenticated, service_role;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    BEGIN
        REVOKE EXECUTE ON FUNCTION public.post_purchase_invoice(uuid) FROM anon, public;
        GRANT EXECUTE ON FUNCTION public.post_purchase_invoice(uuid) TO authenticated, service_role;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    BEGIN
        REVOKE EXECUTE ON FUNCTION public.approve_purchase_invoice(uuid, uuid, uuid) FROM anon, public;
        GRANT EXECUTE ON FUNCTION public.approve_purchase_invoice(uuid, uuid, uuid) TO authenticated, service_role;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    BEGIN
        REVOKE EXECUTE ON FUNCTION public.convert_so_to_invoice(uuid, uuid) FROM anon, public;
        GRANT EXECUTE ON FUNCTION public.convert_so_to_invoice(uuid, uuid) TO authenticated, service_role;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    BEGIN
        REVOKE EXECUTE ON FUNCTION public.initialize_fiscal_year_periods(UUID, INTEGER) FROM anon, public;
        GRANT EXECUTE ON FUNCTION public.initialize_fiscal_year_periods(UUID, INTEGER) TO authenticated, service_role;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    BEGIN
        REVOKE EXECUTE ON FUNCTION public.run_period_depreciation(date, uuid) FROM anon, public;
        GRANT EXECUTE ON FUNCTION public.run_period_depreciation(date, uuid) TO authenticated, service_role;
    EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

-- 2. تأمين دالة حذف القيود المحاسبية بالتحقق من هوية المنظمة ومستخدم السوبر أدمن
CREATE OR REPLACE FUNCTION public.delete_journal_entry_safe(p_entry_id uuid, p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_role text;
    v_caller_org uuid;
BEGIN
    -- أ. التحقق من وجود جلسة مستخدم مسجل
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول للقيام بحذف القيود المحاسبية.';
    END IF;

    -- ب. استخراج هوية ودور ومؤسسة المستخدم المتصل
    SELECT role, organization_id INTO v_caller_role, v_caller_org
      FROM public.profiles
     WHERE id = auth.uid();

    -- ج. منع المستخدمين من التلاعب بقيود مؤسسات أخرى
    IF v_caller_role <> 'super_admin' AND (v_caller_org IS NULL OR v_caller_org <> p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: لا يمكنك حذف قيود محاسبية تابعة لمؤسسة أخرى.';
    END IF;

    -- د. إلغاء ترحيل القيد أولاً لتخطي مشغل حماية القيود المرحلة
    UPDATE public.journal_entries 
       SET status = 'draft', is_posted = false 
     WHERE id = p_entry_id 
       AND (v_caller_role = 'super_admin' OR organization_id = p_org_id);

    -- هـ. حذف أسطر القيد
    DELETE FROM public.journal_lines 
     WHERE journal_entry_id = p_entry_id 
       AND (v_caller_role = 'super_admin' OR organization_id = p_org_id);

    -- و. حذف رأس القيد
    DELETE FROM public.journal_entries 
     WHERE id = p_entry_id 
       AND (v_caller_role = 'super_admin' OR organization_id = p_org_id);

    -- ز. إعادة موازنة الأرصدة
    BEGIN
        PERFORM public.recalculate_all_system_balances(p_org_id);
    EXCEPTION WHEN OTHERS THEN
        BEGIN
            PERFORM public.recalculate_all_balances(p_org_id);
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END;

    RETURN 'تم حذف القيد المحاسبي وتحديث الأرصدة بنجاح ✅';
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_journal_entry_safe(uuid, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.delete_journal_entry_safe(uuid, uuid) FROM anon, public;

-- 3. تفعيل RLS على كافة الجداول المالية والتنظيمية الحساسة
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cashier_shifts ENABLE ROW LEVEL SECURITY;

-- 4. إشعار PostgREST بتحديث المخطط فورياً
NOTIFY pgrst, 'reload schema';
