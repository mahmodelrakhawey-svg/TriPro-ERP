-- ==============================================================================
-- 🛡️ TriPro ERP — تحصين عزل المنشآت وحصانة المرتجعات ومنع تصعيد الصلاحيات (SEC-RETURN-TENANT-01)
-- تاريخ التحديث: 14 نوفمبر 2026
-- الأولوية: حرجة (CRITICAL SECURITY & TENANT ISOLATION HARDENING)
-- التوافق: متوافق 100% مع بيئة شركة لينزا وكافة المنشآت النشطة (Zero Impact on Production)
-- ==============================================================================
-- 📋 أهداف التحديث:
--   1. سد ثغرة (Cross-Tenant IDOR) في حذف مرتجعات المشتريات والمبيعات عبر فرض فحص تطابق المنشأة.
--   2. التحقق الإجباري من هوية المستخدم المتصل (auth.uid) ومنع استدعاء الدوال دون مصادقة.
--   3. تثبيت دوال الهوية الموثوقة get_my_role() و get_my_org() لمنع التلاعب عبر user_metadata.
--   4. تحديث كاش واجهة البرمجة (pgrst reload).
-- ==============================================================================

BEGIN;

-- 0. تفعيل تصريح تعديل القيود المالية للجلسة
SELECT set_config('app.allow_financial_ledger_mutation', 'true', true);

-- ==============================================================================
-- 1. دالة الحذف الآمن لمرتجع المشتريات (delete_purchase_return)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.delete_purchase_return(
    p_return_id uuid,
    p_org_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_status text;
    v_org_id uuid;
    v_caller_role text;
    v_caller_id uuid := auth.uid();
BEGIN
    SELECT status, organization_id INTO v_status, v_org_id
    FROM public.purchase_returns 
    WHERE id = p_return_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'مرتجع المشتريات غير موجود (ID: %)', p_return_id;
    END IF;

    -- 🛡️ 1. التحقق الأمني من هوية المستخدم المتصل
    IF v_caller_id IS NULL AND auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: تم رفض الوصول. يجب تسجيل الدخول لحذف مرتجع المشتريات.';
    END IF;

    IF v_caller_id IS NOT NULL THEN
        SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
        IF COALESCE(v_caller_role, '') NOT IN ('super_admin', 'admin', 'manager', 'accountant', 'owner') THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: لا تملك الصلاحية اللازمة لحذف مرتجع المشتريات.';
        END IF;

        -- 🛡️ 2. صمام أمان عزل المنشآت الصارم (Tenant Isolation Guard)
        IF v_org_id IS NOT NULL 
           AND v_org_id <> public.get_my_org() 
           AND COALESCE(v_caller_role, '') NOT IN ('super_admin') THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: هذا المرتجع يتبع منشأة أخرى ولا يحق لك حذفه.';
        END IF;
    END IF;

    -- 🛡️ 3. منع حذف المرتجع المرحل
    IF v_status NOT IN ('draft', 'cancelled') THEN
        RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: لا يمكن حذف مرتجع مشتريات مرحل (%s). يجب إلغاء ترحيله أولاً لإعادته كمسودة ثم حذفه.', v_status;
    END IF;

    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    DELETE FROM public.purchase_return_items WHERE purchase_return_id = p_return_id;
    DELETE FROM public.purchase_returns WHERE id = p_return_id;

    RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_purchase_return(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.delete_purchase_return(uuid, uuid) TO authenticated, service_role;


-- ==============================================================================
-- 2. دالة الحذف الآمن لمرتجع المبيعات (delete_sales_return)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.delete_sales_return(
    p_return_id uuid,
    p_org_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_status text;
    v_org_id uuid;
    v_caller_role text;
    v_caller_id uuid := auth.uid();
BEGIN
    SELECT status, organization_id INTO v_status, v_org_id
    FROM public.sales_returns 
    WHERE id = p_return_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'مرتجع المبيعات غير موجود (ID: %)', p_return_id;
    END IF;

    -- 🛡️ 1. التحقق الأمني من هوية المستخدم المتصل
    IF v_caller_id IS NULL AND auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: تم رفض الوصول. يجب تسجيل الدخول لحذف مرتجع المبيعات.';
    END IF;

    IF v_caller_id IS NOT NULL THEN
        SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
        IF COALESCE(v_caller_role, '') NOT IN ('super_admin', 'admin', 'manager', 'accountant', 'owner') THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: لا تملك الصلاحية اللازمة لحذف مرتجع المبيعات.';
        END IF;

        -- 🛡️ 2. صمام أمان عزل المنشآت الصارم (Tenant Isolation Guard)
        IF v_org_id IS NOT NULL 
           AND v_org_id <> public.get_my_org() 
           AND COALESCE(v_caller_role, '') NOT IN ('super_admin') THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: هذا المرتجع يتبع منشأة أخرى ولا يحق لك حذفه.';
        END IF;
    END IF;

    -- 🛡️ 3. منع حذف المرتجع المرحل
    IF v_status NOT IN ('draft', 'cancelled') THEN
        RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: لا يمكن حذف مرتجع مبيعات مرحل (%s). يجب إلغاء ترحيله أولاً لإعادته كمسودة ثم حذفه.', v_status;
    END IF;

    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    DELETE FROM public.sales_return_items WHERE sales_return_id = p_return_id;
    DELETE FROM public.sales_returns WHERE id = p_return_id;

    RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_sales_return(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.delete_sales_return(uuid, uuid) TO authenticated, service_role;


-- ==============================================================================
-- 3. دالة إلغاء ترحيل مرتجع المشتريات (unpost_purchase_return)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.unpost_purchase_return(
    p_return_id uuid,
    p_org_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_return record;
    v_item record;
    v_org_id uuid;
    v_journal_id uuid;
    v_caller_role text;
    v_caller_id uuid := auth.uid();
    v_base_qty numeric;
BEGIN
    SELECT * INTO v_return FROM public.purchase_returns WHERE id = p_return_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'مرتجع المشتريات غير موجود (ID: %)', p_return_id;
    END IF;

    IF v_return.status = 'draft' THEN
        RETURN true;
    END IF;

    -- 🛡️ التحقق الأمني الصارم من هوية وصلاحيات المستخدم المتصل
    IF v_caller_id IS NULL AND auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: تم رفض الوصول. يجب تسجيل الدخول لإلغاء ترحيل مرتجع المشتريات.';
    END IF;

    IF v_caller_id IS NOT NULL THEN
        SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
        IF COALESCE(v_caller_role, '') NOT IN ('super_admin', 'admin', 'manager', 'accountant', 'owner') THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: لا تملك الصلاحية المحاسبية اللازمة لإلغاء ترحيل مرتجع المشتريات.';
        END IF;

        IF v_return.organization_id IS NOT NULL 
           AND v_return.organization_id <> public.get_my_org() 
           AND COALESCE(v_caller_role, '') NOT IN ('super_admin') THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: هذا المرتجع يتبع منشأة أخرى ولا يحق لك تعديله.';
        END IF;
    END IF;

    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    v_org_id := COALESCE(p_org_id, v_return.organization_id);

    -- عكس أثر المخزون
    FOR v_item IN 
        SELECT product_id, quantity, uom_id 
        FROM public.purchase_return_items 
        WHERE purchase_return_id = p_return_id AND product_id IS NOT NULL AND quantity > 0
    LOOP
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'uom_convert' AND pronamespace = 'public'::regnamespace) THEN
                v_base_qty := public.uom_convert(
                    v_item.quantity, 
                    v_item.uom_id, 
                    (SELECT base_uom_id FROM public.products WHERE id = v_item.product_id)
                );
            ELSE
                v_base_qty := v_item.quantity;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_base_qty := v_item.quantity;
        END;

        IF v_return.warehouse_id IS NOT NULL THEN
            UPDATE public.products
            SET 
                stock = COALESCE(stock, 0) + v_base_qty,
                warehouse_stock = jsonb_set(
                    COALESCE(warehouse_stock, '{}'::jsonb),
                    ARRAY[v_return.warehouse_id::text],
                    to_jsonb(COALESCE((warehouse_stock->>v_return.warehouse_id::text)::numeric, 0) + v_base_qty)
                )
            WHERE id = v_item.product_id;
        ELSE
            UPDATE public.products
            SET stock = COALESCE(stock, 0) + v_base_qty
            WHERE id = v_item.product_id;
        END IF;
    END LOOP;

    -- حذف القيد المحاسبي المرتبط
    v_journal_id := v_return.related_journal_entry_id;

    IF v_journal_id IS NULL THEN
        SELECT id INTO v_journal_id 
        FROM public.journal_entries 
        WHERE (related_document_id = p_return_id AND related_document_type = 'purchase_return')
           OR (reference = v_return.return_number)
        LIMIT 1;
    END IF;

    IF v_journal_id IS NOT NULL THEN
        DELETE FROM public.journal_lines WHERE journal_entry_id = v_journal_id;
        DELETE FROM public.journal_entries WHERE id = v_journal_id;
    END IF;

    DELETE FROM public.journal_lines 
    WHERE journal_entry_id IN (
        SELECT id FROM public.journal_entries WHERE reference = v_return.return_number
    );
    DELETE FROM public.journal_entries WHERE reference = v_return.return_number;

    -- تحويل حالة المرتجع إلى مسودة (draft)
    UPDATE public.purchase_returns
    SET 
        status = 'draft',
        related_journal_entry_id = NULL
    WHERE id = p_return_id;

    RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.unpost_purchase_return(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.unpost_purchase_return(uuid, uuid) TO authenticated, service_role;


-- ==============================================================================
-- 4. دالة إلغاء ترحيل مرتجع المبيعات (unpost_sales_return)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.unpost_sales_return(
    p_return_id uuid,
    p_org_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_return record;
    v_item record;
    v_org_id uuid;
    v_journal_id uuid;
    v_caller_role text;
    v_caller_id uuid := auth.uid();
    v_base_qty numeric;
BEGIN
    SELECT * INTO v_return FROM public.sales_returns WHERE id = p_return_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'مرتجع المبيعات غير موجود (ID: %)', p_return_id;
    END IF;

    IF v_return.status = 'draft' THEN
        RETURN true;
    END IF;

    -- 🛡️ التحقق الأمني الصارم من هوية وصلاحيات المستخدم المتصل
    IF v_caller_id IS NULL AND auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: تم رفض الوصول. يجب تسجيل الدخول لإلغاء ترحيل مرتجع المبيعات.';
    END IF;

    IF v_caller_id IS NOT NULL THEN
        SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
        IF COALESCE(v_caller_role, '') NOT IN ('super_admin', 'admin', 'manager', 'accountant', 'owner') THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: لا تملك الصلاحية المحاسبية اللازمة لإلغاء ترحيل مرتجع المبيعات.';
        END IF;

        IF v_return.organization_id IS NOT NULL 
           AND v_return.organization_id <> public.get_my_org() 
           AND COALESCE(v_caller_role, '') NOT IN ('super_admin') THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: هذا المرتجع يتبع منشأة أخرى ولا يحق لك تعديله.';
        END IF;
    END IF;

    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    v_org_id := COALESCE(p_org_id, v_return.organization_id);

    -- عكس أثر المخزون: خصم الكميات التي كانت قد أضيفت عند الإرجاع
    FOR v_item IN 
        SELECT product_id, quantity, uom_id 
        FROM public.sales_return_items 
        WHERE sales_return_id = p_return_id AND product_id IS NOT NULL AND quantity > 0
    LOOP
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'uom_convert' AND pronamespace = 'public'::regnamespace) THEN
                v_base_qty := public.uom_convert(
                    v_item.quantity, 
                    v_item.uom_id, 
                    (SELECT base_uom_id FROM public.products WHERE id = v_item.product_id)
                );
            ELSE
                v_base_qty := v_item.quantity;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_base_qty := v_item.quantity;
        END;

        IF v_return.warehouse_id IS NOT NULL THEN
            UPDATE public.products
            SET 
                stock = GREATEST(0, COALESCE(stock, 0) - v_base_qty),
                warehouse_stock = jsonb_set(
                    COALESCE(warehouse_stock, '{}'::jsonb),
                    ARRAY[v_return.warehouse_id::text],
                    to_jsonb(
                        GREATEST(0, COALESCE((warehouse_stock->>v_return.warehouse_id::text)::numeric, 0) - v_base_qty)
                    )
                )
            WHERE id = v_item.product_id;
        ELSE
            UPDATE public.products
            SET stock = GREATEST(0, COALESCE(stock, 0) - v_base_qty)
            WHERE id = v_item.product_id;
        END IF;
    END LOOP;

    -- حذف القيد المحاسبي المرتبط من الأستاذ العام
    v_journal_id := v_return.related_journal_entry_id;

    IF v_journal_id IS NULL THEN
        SELECT id INTO v_journal_id 
        FROM public.journal_entries 
        WHERE (related_document_id = p_return_id AND related_document_type = 'sales_return')
           OR (reference = v_return.return_number)
        LIMIT 1;
    END IF;

    IF v_journal_id IS NOT NULL THEN
        DELETE FROM public.journal_lines WHERE journal_entry_id = v_journal_id;
        DELETE FROM public.journal_entries WHERE id = v_journal_id;
    END IF;

    DELETE FROM public.journal_lines 
    WHERE journal_entry_id IN (
        SELECT id FROM public.journal_entries WHERE reference = v_return.return_number
    );
    DELETE FROM public.journal_entries WHERE reference = v_return.return_number;

    -- تحويل حالة المرتجع إلى مسودة (draft)
    UPDATE public.sales_returns
    SET 
        status = 'draft',
        related_journal_entry_id = NULL
    WHERE id = p_return_id;

    RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.unpost_sales_return(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.unpost_sales_return(uuid, uuid) TO authenticated, service_role;


-- ==============================================================================
-- 5. تثبيت دوال الهوية المركزية الموثوقة (get_my_role & get_my_org)
-- ==============================================================================
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

CREATE OR REPLACE FUNCTION public.get_my_org() 
RETURNS uuid 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
DECLARE 
    _org_id uuid;
    _user_id uuid := auth.uid();
BEGIN
    IF _user_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- 0. فحص متغير الجلسة السيرفرية المؤقت (لتشغيل الاختبارات والهجرات الإدارية)
    BEGIN
        _org_id := NULLIF(current_setting('app.current_org_id', true), '')::uuid;
        IF _org_id IS NOT NULL THEN
            RETURN _org_id;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- 1. المرجع الأوحد والموثق: جدول profiles المحمي
    SELECT organization_id INTO _org_id FROM public.profiles WHERE id = _user_id LIMIT 1;
    IF _org_id IS NOT NULL THEN 
        RETURN _org_id; 
    END IF;

    -- 2. الفحص الاحتياطي من app_metadata الحصري لإدارة السيرفر
    BEGIN
        _org_id := NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'org_id', '')::uuid;
        IF _org_id IS NOT NULL THEN 
            RETURN _org_id; 
        END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN NULL;
END; 
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_my_org() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_org() TO authenticated, service_role;

-- تحديث كاش واجهة البرمجة لـ PostgREST
NOTIFY pgrst, 'reload schema';

COMMIT;
