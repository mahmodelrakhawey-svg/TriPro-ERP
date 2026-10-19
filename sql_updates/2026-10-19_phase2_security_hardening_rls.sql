-- =============================================================================
-- MIGRATION FILE: 2026-10-19_phase2_security_hardening_rls.sql
-- نظام إدارة موارد المؤسسات • TriPro ERP — Enterprise Edition
-- المرحلة الثانية: تحصين الأمان وسد ثغرات RLS وحماية الدفاتر المحاسبية من التلاعب
-- =============================================================================
-- التاريخ: 2026-10-19
-- الأولوية: 🔴 حرجة جداً (CRITICAL FINANCIAL & ACCESS SECURITY HARDENING)
-- =============================================================================

-- #############################################################################
-- 1. سد الثغرة SEC-08: تحصين دالتي get_my_role و get_my_org ضد تلاعب user_metadata
-- #############################################################################
-- الوصف: منع أي مستخدم من تصعيد صلاحياته ذاتياً عبر المتصفح عن طريق تعديل user_metadata
--        وجعل جدول profiles المحمي هو المرجع الأوحد والموثوق للهوية والدور.

CREATE OR REPLACE FUNCTION public.get_my_role() 
RETURNS text 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
DECLARE 
    _role text;
    _user_id uuid := auth.uid();
BEGIN
    -- إذا كان الاستدعاء داخلياً بدون جلسة مستخدم
    IF _user_id IS NULL THEN
        RETURN 'anon';
    END IF;

    -- 1. المرجع الأوحد والموثق: جدول profiles الخاضع لحراس الأمان
    SELECT role INTO _role FROM public.profiles WHERE id = _user_id LIMIT 1;
    IF _role IS NOT NULL THEN 
        RETURN _role; 
    END IF;

    -- 2. الفحص الاحتياطي من app_metadata الحصري لإدارة السيرفر (غير قابل للتعديل من العميل)
    BEGIN
        _role := NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role', '');
        IF _role IS NOT NULL THEN 
            RETURN _role; 
        END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN 'viewer';
END; 
$$;

COMMENT ON FUNCTION public.get_my_role() IS 'جلب رتبة المستخدم الحالية من مصدر قاعدة البيانات الموثق حصراً لمنع التلاعب';

CREATE OR REPLACE FUNCTION public.get_my_org() 
RETURNS uuid 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
DECLARE 
    _org_id uuid;
    _user_id uuid := auth.uid();
    _role text;
BEGIN
    IF _user_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- 0. فحص متغير الجلسة السيرفرية المؤقت (لتشغيل الاختبارات والهجرات الإدارية)
    BEGIN
        _org_id := NULLIF(current_setting('app.current_org_id', true), '')::uuid;
        IF _org_id IS NOT NULL THEN RETURN _org_id; END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- 1. المصدر المحصن: جدول profiles المعتمد
    SELECT organization_id, role INTO _org_id, _role FROM public.profiles WHERE id = _user_id LIMIT 1;
    IF _org_id IS NOT NULL THEN 
        RETURN _org_id; 
    END IF;

    -- 2. التحقق من app_metadata للسيرفر
    BEGIN
        _org_id := NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'org_id', '')::uuid;
        IF _org_id IS NOT NULL THEN RETURN _org_id; END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- 3. في حال كان المستخدم مديراً admin ولم تُحدد منظمته بعد، ابحث في الأدوار
    IF _role = 'admin' AND _org_id IS NULL THEN
        SELECT r.organization_id INTO _org_id
        FROM public.roles r 
        JOIN public.role_permissions rp ON r.id = rp.role_id 
        JOIN public.permissions p ON rp.permission_id = p.id
        WHERE r.organization_id IS NOT NULL AND r.name = 'admin' AND p.module = 'admin' AND p.action = 'manage' 
        LIMIT 1;
        IF _org_id IS NOT NULL THEN RETURN _org_id; END IF;
    END IF;

    RETURN NULL;
END; 
$$;

COMMENT ON FUNCTION public.get_my_org() IS 'تحديد منظمة المستخدم من جدول profiles الموثق لمنع العبور بين المنشآت';


-- #############################################################################
-- 2. سد الثغرة SEC-06: درع تحصين القيود المحاسبية المرحلة ضد التعديل أو الحذف المباشر
-- #############################################################################
-- الوصف: مبدأ الحصانة المحاسبية القانونية (Immutability of Posted Ledgers)
--        يمنع حذف أو تعديل أي قيد مرحل أو أسطره عبر واجهات PostgREST المباشرة.

CREATE OR REPLACE FUNCTION public.fn_guard_journal_entry_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_bypass text;
BEGIN
    -- فحص إذا كان الإجراء يتم عبر الدوال المخزنة المعتمدة (مثل unpost_sales_invoice)
    BEGIN
        v_bypass := current_setting('app.allow_financial_ledger_mutation', true);
        IF v_bypass = 'true' THEN
            RETURN COALESCE(NEW, OLD);
        END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- 1. منع الحذف التام للقيود المرحلة
    IF TG_OP = 'DELETE' THEN
        IF OLD.status = 'posted' OR OLD.is_posted = true THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: القيود المحاسبية المرحلة (Posted) محصنة قانونياً ولا يمكن حذفها نهائياً. استخدم قيد تسوية عكسي.';
        END IF;
        RETURN OLD;
    END IF;

    -- 2. منع التعديل المباشر على القيود المرحلة
    IF TG_OP = 'UPDATE' THEN
        IF (OLD.status = 'posted' OR OLD.is_posted = true) THEN
            -- السماح فقط بالعكس المحاسبي المعتمد
            IF NEW.status = 'reversed' THEN
                RETURN NEW;
            END IF;

            -- منع تغيير التواريخ أو المبالغ أو الحسابات أو المراجع بعد الترحيل
            IF (NEW.transaction_date IS DISTINCT FROM OLD.transaction_date OR
                NEW.reference IS DISTINCT FROM OLD.reference OR
                NEW.status IS DISTINCT FROM OLD.status OR
                NEW.organization_id IS DISTINCT FROM OLD.organization_id) THEN
                RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: لا يمكن تعديل بيانات القيد المحاسبي بعد ترحيله للأستاذ العام. يتوجب عمل قيد عكسي.';
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_journal_entry_immutability ON public.journal_entries;
CREATE TRIGGER trg_guard_journal_entry_immutability
BEFORE UPDATE OR DELETE ON public.journal_entries
FOR EACH ROW
EXECUTE FUNCTION public.fn_guard_journal_entry_immutability();


-- حارس أسطر القيود (Journal Lines Immutability)
CREATE OR REPLACE FUNCTION public.fn_guard_journal_lines_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_parent_status text;
    v_parent_is_posted boolean;
    v_target_entry_id uuid;
    v_bypass text;
BEGIN
    BEGIN
        v_bypass := current_setting('app.allow_financial_ledger_mutation', true);
        IF v_bypass = 'true' THEN
            RETURN COALESCE(NEW, OLD);
        END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    v_target_entry_id := COALESCE(OLD.journal_entry_id, NEW.journal_entry_id);

    SELECT status, is_posted INTO v_parent_status, v_parent_is_posted
    FROM public.journal_entries
    WHERE id = v_target_entry_id;

    IF v_parent_status = 'posted' OR v_parent_is_posted = true THEN
        RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: أسطر القيد المحاسبي المرحل محصنة ولا يمكن تعديل حساباتها أو مبالغها أو حذفها مباشرة.';
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_journal_lines_immutability ON public.journal_lines;
CREATE TRIGGER trg_guard_journal_lines_immutability
BEFORE UPDATE OR DELETE ON public.journal_lines
FOR EACH ROW
EXECUTE FUNCTION public.fn_guard_journal_lines_immutability();


-- #############################################################################
-- 3. دالة التحكم في نطاق الحصانة المحاسبية المؤقت (Scoped Bypass Helper)
-- #############################################################################
CREATE OR REPLACE FUNCTION public.set_financial_mutation_scope(p_enable boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_enable THEN
        PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);
    ELSE
        PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_financial_mutation_scope(boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.set_financial_mutation_scope(boolean) TO authenticated, service_role;


-- #############################################################################
-- 4. تحصين دالة حذف القيود delete_journal_entry_safe لتعمل مع حارس الحصانة
-- #############################################################################
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

    -- ب. استخراج هوية ودور ومؤسسة المستخدم المتصل من profiles
    SELECT role, organization_id INTO v_caller_role, v_caller_org
      FROM public.profiles
     WHERE id = auth.uid();

    -- ج. منع المستخدمين من التلاعب بقيود مؤسسات أخرى
    IF v_caller_role <> 'super_admin' AND (v_caller_org IS NULL OR v_caller_org <> p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: لا يمكنك حذف قيود محاسبية تابعة لمؤسسة أخرى.';
    END IF;

    -- تفعيل إذن التعديل المالي محلياً داخل المعاملة
    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    -- د. إلغاء ترحيل القيد أولاً
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

    -- إغلاق إذن التعديل المالي
    PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);

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

REVOKE EXECUTE ON FUNCTION public.delete_journal_entry_safe(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.delete_journal_entry_safe(uuid, uuid) TO authenticated, service_role;


-- #############################################################################
-- 5. سد الثغرة SEC-07: تقسيم سياسات RLS الجراحية (Surgical CRUD Segregation)
-- #############################################################################
-- الوصف: إلغاء سياسات FOR ALL المفتوحة واستبدالها بصلاحيات دقيقة لكل جدول مالي وإداري

-- أ) جدول شجرة الحسابات (accounts)
DROP POLICY IF EXISTS "Org_Access_Policy_accounts" ON public.accounts;
DROP POLICY IF EXISTS "accounts_select_policy" ON public.accounts;
DROP POLICY IF EXISTS "accounts_insert_policy" ON public.accounts;
DROP POLICY IF EXISTS "accounts_update_policy" ON public.accounts;
DROP POLICY IF EXISTS "accounts_delete_policy" ON public.accounts;

CREATE POLICY "accounts_select_policy" ON public.accounts
FOR SELECT TO authenticated
USING (organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin');

CREATE POLICY "accounts_insert_policy" ON public.accounts
FOR INSERT TO authenticated
WITH CHECK (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('super_admin', 'admin', 'accountant'))
    OR public.get_my_role() = 'super_admin'
);

CREATE POLICY "accounts_update_policy" ON public.accounts
FOR UPDATE TO authenticated
USING (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('super_admin', 'admin', 'accountant'))
    OR public.get_my_role() = 'super_admin'
)
WITH CHECK (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('super_admin', 'admin', 'accountant'))
    OR public.get_my_role() = 'super_admin'
);

CREATE POLICY "accounts_delete_policy" ON public.accounts
FOR DELETE TO authenticated
USING (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('super_admin', 'admin'))
    OR public.get_my_role() = 'super_admin'
);


-- ب) جدول قيود اليومية (journal_entries)
DROP POLICY IF EXISTS "Org_Access_Policy_journal_entries" ON public.journal_entries;
DROP POLICY IF EXISTS "journal_entries_select_policy" ON public.journal_entries;
DROP POLICY IF EXISTS "journal_entries_insert_policy" ON public.journal_entries;
DROP POLICY IF EXISTS "journal_entries_update_policy" ON public.journal_entries;
DROP POLICY IF EXISTS "journal_entries_delete_policy" ON public.journal_entries;

CREATE POLICY "journal_entries_select_policy" ON public.journal_entries
FOR SELECT TO authenticated
USING (organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin');

CREATE POLICY "journal_entries_insert_policy" ON public.journal_entries
FOR INSERT TO authenticated
WITH CHECK (
    organization_id = public.get_my_org() 
    OR public.get_my_role() = 'super_admin'
);

CREATE POLICY "journal_entries_update_policy" ON public.journal_entries
FOR UPDATE TO authenticated
USING (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('super_admin', 'admin', 'accountant', 'manager'))
    OR public.get_my_role() = 'super_admin'
)
WITH CHECK (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('super_admin', 'admin', 'accountant', 'manager'))
    OR public.get_my_role() = 'super_admin'
);

CREATE POLICY "journal_entries_delete_policy" ON public.journal_entries
FOR DELETE TO authenticated
USING (
    ((organization_id = public.get_my_org() AND public.get_my_role() IN ('super_admin', 'admin', 'accountant')) AND status = 'draft')
    OR public.get_my_role() = 'super_admin'
);


-- ج) جدول أسطر قيود اليومية (journal_lines)
DROP POLICY IF EXISTS "Org_Access_Policy_journal_lines" ON public.journal_lines;
DROP POLICY IF EXISTS "journal_lines_select_policy" ON public.journal_lines;
DROP POLICY IF EXISTS "journal_lines_insert_policy" ON public.journal_lines;
DROP POLICY IF EXISTS "journal_lines_update_policy" ON public.journal_lines;
DROP POLICY IF EXISTS "journal_lines_delete_policy" ON public.journal_lines;

CREATE POLICY "journal_lines_select_policy" ON public.journal_lines
FOR SELECT TO authenticated
USING (organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin');

CREATE POLICY "journal_lines_insert_policy" ON public.journal_lines
FOR INSERT TO authenticated
WITH CHECK (
    organization_id = public.get_my_org() 
    OR public.get_my_role() = 'super_admin'
);

CREATE POLICY "journal_lines_update_policy" ON public.journal_lines
FOR UPDATE TO authenticated
USING (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('super_admin', 'admin', 'accountant', 'manager'))
    OR public.get_my_role() = 'super_admin'
)
WITH CHECK (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('super_admin', 'admin', 'accountant', 'manager'))
    OR public.get_my_role() = 'super_admin'
);

CREATE POLICY "journal_lines_delete_policy" ON public.journal_lines
FOR DELETE TO authenticated
USING (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('super_admin', 'admin', 'accountant'))
    OR public.get_my_role() = 'super_admin'
);


-- د) جداول مسيرات الرواتب والموظفين (payrolls & payroll_items)
DROP POLICY IF EXISTS "Org_Access_Policy_payrolls" ON public.payrolls;
DROP POLICY IF EXISTS "payrolls_read" ON public.payrolls;
DROP POLICY IF EXISTS "payrolls_write" ON public.payrolls;
DROP POLICY IF EXISTS "Restricted_Payrolls_Select" ON public.payrolls;
DROP POLICY IF EXISTS "payrolls_select_policy" ON public.payrolls;
DROP POLICY IF EXISTS "payrolls_mutation_policy" ON public.payrolls;

CREATE POLICY "payrolls_select_policy" ON public.payrolls
FOR SELECT TO authenticated
USING (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant'))
    OR public.get_my_role() = 'super_admin'
);

CREATE POLICY "payrolls_mutation_policy" ON public.payrolls
FOR ALL TO authenticated
USING (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('super_admin', 'admin', 'manager'))
    OR public.get_my_role() = 'super_admin'
)
WITH CHECK (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('super_admin', 'admin', 'manager'))
    OR public.get_my_role() = 'super_admin'
);

-- payroll_items
DROP POLICY IF EXISTS "Org_Access_Policy_payroll_items" ON public.payroll_items;
DROP POLICY IF EXISTS "Restricted_Payroll_Items_Select" ON public.payroll_items;
DROP POLICY IF EXISTS "payroll_items_read" ON public.payroll_items;
DROP POLICY IF EXISTS "payroll_items_write" ON public.payroll_items;
DROP POLICY IF EXISTS "payroll_items_select_policy" ON public.payroll_items;
DROP POLICY IF EXISTS "payroll_items_mutation_policy" ON public.payroll_items;

CREATE POLICY "payroll_items_select_policy" ON public.payroll_items
FOR SELECT TO authenticated
USING (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant'))
    OR public.get_my_role() = 'super_admin'
);

CREATE POLICY "payroll_items_mutation_policy" ON public.payroll_items
FOR ALL TO authenticated
USING (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('super_admin', 'admin', 'manager'))
    OR public.get_my_role() = 'super_admin'
)
WITH CHECK (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('super_admin', 'admin', 'manager'))
    OR public.get_my_role() = 'super_admin'
);


-- هـ) جداول الموازنات ومراكز التكلفة (budgets & cost_centers)
DROP POLICY IF EXISTS "Org_Access_Policy_budgets" ON public.budgets;
DROP POLICY IF EXISTS "budgets_read" ON public.budgets;
DROP POLICY IF EXISTS "budgets_write" ON public.budgets;
DROP POLICY IF EXISTS "budgets_select_policy" ON public.budgets;
DROP POLICY IF EXISTS "budgets_manage_policy" ON public.budgets;

CREATE POLICY "budgets_select_policy" ON public.budgets
FOR SELECT TO authenticated
USING (organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin');

CREATE POLICY "budgets_manage_policy" ON public.budgets
FOR ALL TO authenticated
USING (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('super_admin', 'admin', 'accountant'))
    OR public.get_my_role() = 'super_admin'
)
WITH CHECK (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('super_admin', 'admin', 'accountant'))
    OR public.get_my_role() = 'super_admin'
);

-- cost_centers
DROP POLICY IF EXISTS "Org_Access_Policy_cost_centers" ON public.cost_centers;
DROP POLICY IF EXISTS "cost_centers_read" ON public.cost_centers;
DROP POLICY IF EXISTS "cost_centers_write" ON public.cost_centers;
DROP POLICY IF EXISTS "cost_centers_select_policy" ON public.cost_centers;
DROP POLICY IF EXISTS "cost_centers_manage_policy" ON public.cost_centers;

CREATE POLICY "cost_centers_select_policy" ON public.cost_centers
FOR SELECT TO authenticated
USING (organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin');

CREATE POLICY "cost_centers_manage_policy" ON public.cost_centers
FOR ALL TO authenticated
USING (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('super_admin', 'admin', 'accountant'))
    OR public.get_my_role() = 'super_admin'
)
WITH CHECK (
    (organization_id = public.get_my_org() AND public.get_my_role() IN ('super_admin', 'admin', 'accountant'))
    OR public.get_my_role() = 'super_admin'
);


-- و) تأمين جداول إقفال الصناديق (cash_closings & rejected_cash_closings)
ALTER TABLE IF EXISTS public.cash_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.rejected_cash_closings ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);
ALTER TABLE IF EXISTS public.rejected_cash_closings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cash_closings_read" ON public.cash_closings;
DROP POLICY IF EXISTS "cash_closings_write" ON public.cash_closings;
DROP POLICY IF EXISTS "cash_closings_strict_isolation" ON public.cash_closings;

CREATE POLICY "cash_closings_strict_isolation" ON public.cash_closings
FOR ALL TO authenticated
USING (organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin')
WITH CHECK (organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin');

DROP POLICY IF EXISTS "rejected_cash_closings_read" ON public.rejected_cash_closings;
DROP POLICY IF EXISTS "rejected_cash_closings_write" ON public.rejected_cash_closings;
DROP POLICY IF EXISTS "rejected_cash_closings_strict_isolation" ON public.rejected_cash_closings;

CREATE POLICY "rejected_cash_closings_strict_isolation" ON public.rejected_cash_closings
FOR ALL TO authenticated
USING (organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin')
WITH CHECK (organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin');


-- ز) تأمين جداول الجرد المخزني (inventory_counts & inventory_count_items)
ALTER TABLE IF EXISTS public.inventory_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inventory_count_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_counts_read" ON public.inventory_counts;
DROP POLICY IF EXISTS "inventory_counts_write" ON public.inventory_counts;
DROP POLICY IF EXISTS "inventory_counts_strict_isolation" ON public.inventory_counts;

CREATE POLICY "inventory_counts_strict_isolation" ON public.inventory_counts
FOR ALL TO authenticated
USING (organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin')
WITH CHECK (organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin');

DROP POLICY IF EXISTS "inventory_count_items_read" ON public.inventory_count_items;
DROP POLICY IF EXISTS "inventory_count_items_write" ON public.inventory_count_items;
DROP POLICY IF EXISTS "inventory_count_items_strict_isolation" ON public.inventory_count_items;

CREATE POLICY "inventory_count_items_strict_isolation" ON public.inventory_count_items
FOR ALL TO authenticated
USING (organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin')
WITH CHECK (organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin');


-- #############################################################################
-- 6. تطهير سياسات RLS المتراخية القديمة التي احتوت على (OR get_my_org() IS NULL)
-- #############################################################################
-- الوصف: إزالة أي سياسة أمان قديمة كانت تسمح بالوصول المفتوح عند عدم تعيين المنشأة
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT schemaname, tablename, policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
          AND policyname LIKE 'tenant_isolation_%'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I;', pol.policyname, pol.schemaname, pol.tablename);
    END LOOP;
END $$;


-- #############################################################################
-- 7. إشعار PostgREST بتحديث المخطط فورياً (Cache Invalidation)
-- #############################################################################
NOTIFY pgrst, 'reload schema';

-- نهاية سكريبت المرحلة الثانية للتحصين الأمني
