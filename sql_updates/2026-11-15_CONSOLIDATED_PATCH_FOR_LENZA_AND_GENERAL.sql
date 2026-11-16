-- ==============================================================================
-- 🛡️ TriPro ERP — الباتش الرقابي والمحاسبي الموحد والشامل (2026-11-15)
-- الملف: sql_updates/2026-11-15_CONSOLIDATED_PATCH_FOR_LENZA_AND_GENERAL.sql
-- 
-- 🎯 الهدف:
--   تنفيذ هذا الملف على (قاعدة بيانات لينزا) و (القاعدة العامة) لتفعيل:
--   1. الحصانة المحاسبية لمرتجعات المبيعات والمشتريات (unpost / delete RPCs).
--   2. دالة استعلام أرصدة الموردين السريعة (get_all_supplier_balances_fast).
--   3. دالة كشف حساب ورصيد المورد الفردي (get_supplier_balance).
--   4. الدالة المركزية الموحدة لسلف الموظفين (update_employee_advance).
--   5. مزامنة الأستاذ العام ودرع النزاهة المحاسبي (recalculate_supplier_balances).
--   6. إنشاء جدول تتبع الإصدارات (_schema_migrations).
-- ==============================================================================

BEGIN;

-- تفعيل تصريح تعديل القيود المالية للجلسة الحالية
SELECT set_config('app.allow_financial_ledger_mutation', 'true', true);

-- -----------------------------------------------------------------------------
-- 0. جدول تتبع الإصدارات البرمجية (_schema_migrations)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public._schema_migrations (
    version text PRIMARY KEY,
    filename text NOT NULL,
    checksum text,
    applied_at timestamptz DEFAULT now()
);
GRANT SELECT ON public._schema_migrations TO authenticated;
GRANT ALL ON public._schema_migrations TO service_role;

-- -----------------------------------------------------------------------------
-- 1. دوال الهوية المركزية الموثوقة (get_my_role & get_my_org)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_role() 
RETURNS text 
LANGUAGE sql 
STABLE 
SECURITY DEFINER 
SET search_path = public 
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.profiles WHERE id = auth.uid()),
    'authenticated'
  );
$$;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated, service_role, anon;

CREATE OR REPLACE FUNCTION public.get_my_org() 
RETURNS uuid 
LANGUAGE sql 
STABLE 
SECURITY DEFINER 
SET search_path = public 
AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.get_my_org() TO authenticated, service_role, anon;

-- -----------------------------------------------------------------------------
-- 2. دوال حصانة وإلغاء وحذف مرتجعات المشتريات (Purchase Returns)
-- -----------------------------------------------------------------------------
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

    IF v_caller_id IS NULL AND auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: تم رفض الوصول. يجب تسجيل الدخول لحذف مرتجع المشتريات.';
    END IF;

    IF v_caller_id IS NOT NULL THEN
        SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
        IF COALESCE(v_caller_role, '') NOT IN ('super_admin', 'admin', 'manager', 'accountant', 'owner') THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: لا تملك الصلاحية اللازمة لحذف مرتجع المشتريات.';
        END IF;

        IF v_org_id IS NOT NULL 
           AND v_org_id <> public.get_my_org() 
           AND COALESCE(v_caller_role, '') NOT IN ('super_admin') THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: هذا المرتجع يتبع منشأة أخرى ولا يحق لك حذفه.';
        END IF;
    END IF;

    IF v_status NOT IN ('draft', 'cancelled') THEN
        RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: لا يمكن حذف مرتجع مشتريات مرحل (%s). يجب إلغاء ترحيله أولاً لإعادته كمسودة ثم حذفه.', v_status;
    END IF;

    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    DELETE FROM public.purchase_return_items WHERE return_id = p_return_id;
    DELETE FROM public.purchase_returns WHERE id = p_return_id;

    RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.delete_purchase_return(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.delete_purchase_return(uuid, uuid) TO authenticated, service_role;

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

    IF v_caller_id IS NULL AND auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: تم رفض الوصول. يجب تسجيل الدخول لإلغاء ترحيل المرتجع.';
    END IF;

    IF v_caller_id IS NOT NULL THEN
        SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
        IF COALESCE(v_caller_role, '') NOT IN ('super_admin', 'admin', 'manager', 'accountant', 'owner') THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: لا تملك الصلاحية المحاسبية اللازمة لإلغاء ترحيل المرتجع.';
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
        WHERE return_id = p_return_id AND product_id IS NOT NULL AND quantity > 0
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
                    to_jsonb(
                        COALESCE((warehouse_stock->>v_return.warehouse_id::text)::numeric, 0) + v_base_qty
                    )
                )
            WHERE id = v_item.product_id;
        ELSE
            UPDATE public.products
            SET stock = COALESCE(stock, 0) + v_base_qty
            WHERE id = v_item.product_id;
        END IF;
    END LOOP;

    -- حذف القيد المحاسبي المرتبط من الأستاذ العام
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

    -- إعادة المرتجع إلى مسودة (draft)
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

-- -----------------------------------------------------------------------------
-- 3. دوال حصانة وإلغاء وحذف مرتجعات المبيعات (Sales Returns)
-- -----------------------------------------------------------------------------
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

    IF v_caller_id IS NULL AND auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: تم رفض الوصول. يجب تسجيل الدخول لحذف مرتجع المبيعات.';
    END IF;

    IF v_caller_id IS NOT NULL THEN
        SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
        IF COALESCE(v_caller_role, '') NOT IN ('super_admin', 'admin', 'manager', 'accountant', 'owner') THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: لا تملك الصلاحية اللازمة لحذف مرتجع المبيعات.';
        END IF;

        IF v_org_id IS NOT NULL 
           AND v_org_id <> public.get_my_org() 
           AND COALESCE(v_caller_role, '') NOT IN ('super_admin') THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: هذا المرتجع يتبع منشأة أخرى ولا يحق لك حذفه.';
        END IF;
    END IF;

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

    -- عكس أثر المخزون
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

    -- إعادة حالة المرتجع إلى مسودة (draft)
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

-- -----------------------------------------------------------------------------
-- 4. دالة استعلام أرصدة الموردين السريعة (get_all_supplier_balances_fast)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_all_supplier_balances_fast(p_org_id uuid)
RETURNS TABLE(
    supplier_id uuid,
    supplier_name text,
    phone text,
    tax_number text,
    opening_balance numeric,
    total_invoices numeric,
    total_immediate_payments numeric,
    total_payments numeric,
    total_cheques numeric,
    total_returns numeric,
    total_debit_notes numeric,
    total_manual_debit numeric,
    total_manual_credit numeric,
    final_balance numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH supp_base AS (
        SELECT s.id, s.name, s.phone, s.tax_number, COALESCE(s.opening_balance, 0)::numeric AS op_bal
        FROM public.suppliers s
        WHERE (s.organization_id = p_org_id OR s.organization_id IS NULL)
          AND s.deleted_at IS NULL
    ),
    inv_agg AS (
        SELECT 
            pi.supplier_id, 
            COALESCE(SUM(pi.total_amount), 0)::numeric AS tot_inv,
            COALESCE(SUM(pi.paid_amount), 0)::numeric AS tot_imm_paid
        FROM public.purchase_invoices pi
        WHERE (pi.organization_id = p_org_id OR pi.organization_id IS NULL)
          AND pi.status IN ('posted', 'paid')
        GROUP BY pi.supplier_id
    ),
    pv_agg AS (
        SELECT 
            pv.supplier_id,
            COALESCE(SUM(pv.amount), 0)::numeric AS tot_pv
        FROM public.payment_vouchers pv
        WHERE (pv.organization_id = p_org_id OR pv.organization_id IS NULL)
          AND pv.deleted_at IS NULL
          AND pv.supplier_id IS NOT NULL
          AND pv.status NOT IN ('rejected', 'cancelled', 'draft', 'pending_approval')
          AND NOT (COALESCE(pv.notes, '') LIKE '[مرفوض%' OR COALESCE(pv.notes, '') LIKE '[معلق للاعتماد%')
        GROUP BY pv.supplier_id
    ),
    ret_agg AS (
        SELECT 
            pr.supplier_id,
            COALESCE(SUM(pr.total_amount), 0)::numeric AS tot_ret
        FROM public.purchase_returns pr
        WHERE (pr.organization_id = p_org_id OR pr.organization_id IS NULL)
          AND pr.status NOT IN ('cancelled', 'draft')
        GROUP BY pr.supplier_id
    ),
    dn_agg AS (
        SELECT 
            dn.supplier_id,
            COALESCE(SUM(dn.total_amount), 0)::numeric AS tot_dn
        FROM public.debit_notes dn
        WHERE (dn.organization_id = p_org_id OR dn.organization_id IS NULL)
          AND dn.status = 'posted'
        GROUP BY dn.supplier_id
    ),
    chq_agg AS (
        SELECT 
            c.party_id AS supplier_id,
            COALESCE(SUM(c.amount), 0)::numeric AS tot_chq
        FROM public.cheques c
        WHERE (c.organization_id = p_org_id OR c.organization_id IS NULL)
          AND c.type = 'outgoing'
          AND c.status NOT IN ('rejected', 'cancelled')
          AND c.party_id IS NOT NULL
        GROUP BY c.party_id
    )
    SELECT 
        s.id AS supplier_id,
        s.name AS supplier_name,
        s.phone,
        s.tax_number,
        s.op_bal AS opening_balance,
        COALESCE(i.tot_inv, 0)::numeric AS total_invoices,
        COALESCE(i.tot_imm_paid, 0)::numeric AS total_immediate_payments,
        COALESCE(p.tot_pv, 0)::numeric AS total_payments,
        COALESCE(c.tot_chq, 0)::numeric AS total_cheques,
        COALESCE(r.tot_ret, 0)::numeric AS total_returns,
        COALESCE(d.tot_dn, 0)::numeric AS total_debit_notes,
        0::numeric AS total_manual_debit,
        0::numeric AS total_manual_credit,
        (s.op_bal + COALESCE(i.tot_inv, 0) - COALESCE(i.tot_imm_paid, 0) - COALESCE(p.tot_pv, 0) - COALESCE(c.tot_chq, 0) - COALESCE(r.tot_ret, 0) - COALESCE(d.tot_dn, 0))::numeric AS final_balance
    FROM supp_base s
    LEFT JOIN inv_agg i ON s.id = i.supplier_id
    LEFT JOIN pv_agg p ON s.id = p.supplier_id
    LEFT JOIN ret_agg r ON s.id = r.supplier_id
    LEFT JOIN dn_agg d ON s.id = d.supplier_id
    LEFT JOIN chq_agg c ON s.id = c.supplier_id
    ORDER BY s.name ASC;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_all_supplier_balances_fast(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_all_supplier_balances_fast(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. دالة كشف حساب ورصيد المورد الفردي (get_supplier_balance)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_supplier_balance(
    p_supplier_id uuid,
    p_org_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_op_balance numeric := 0;
    v_invoices numeric := 0;
    v_imm_paid numeric := 0;
    v_payments numeric := 0;
    v_cheques numeric := 0;
    v_returns numeric := 0;
    v_debit_notes numeric := 0;
    v_final numeric := 0;
BEGIN
    SELECT COALESCE(opening_balance, 0) INTO v_op_balance
    FROM public.suppliers
    WHERE id = p_supplier_id AND deleted_at IS NULL;

    SELECT 
        COALESCE(SUM(total_amount), 0),
        COALESCE(SUM(paid_amount), 0)
    INTO v_invoices, v_imm_paid
    FROM public.purchase_invoices
    WHERE supplier_id = p_supplier_id
      AND status IN ('posted', 'paid')
      AND (p_org_id IS NULL OR organization_id = p_org_id);

    SELECT COALESCE(SUM(amount), 0) INTO v_payments
    FROM public.payment_vouchers
    WHERE supplier_id = p_supplier_id
      AND deleted_at IS NULL
      AND status NOT IN ('rejected', 'cancelled', 'draft', 'pending_approval')
      AND NOT (COALESCE(notes, '') LIKE '[مرفوض%' OR COALESCE(notes, '') LIKE '[معلق للاعتماد%')
      AND (p_org_id IS NULL OR organization_id = p_org_id);

    SELECT COALESCE(SUM(amount), 0) INTO v_cheques
    FROM public.cheques
    WHERE party_id = p_supplier_id
      AND type = 'outgoing'
      AND status NOT IN ('rejected', 'cancelled')
      AND (p_org_id IS NULL OR organization_id = p_org_id);

    SELECT COALESCE(SUM(total_amount), 0) INTO v_returns
    FROM public.purchase_returns
    WHERE supplier_id = p_supplier_id
      AND status NOT IN ('cancelled', 'draft')
      AND (p_org_id IS NULL OR organization_id = p_org_id);

    SELECT COALESCE(SUM(total_amount), 0) INTO v_debit_notes
    FROM public.debit_notes
    WHERE supplier_id = p_supplier_id
      AND status = 'posted'
      AND (p_org_id IS NULL OR organization_id = p_org_id);

    v_final := v_op_balance + v_invoices - v_imm_paid - v_payments - v_cheques - v_returns - v_debit_notes;
    RETURN COALESCE(v_final, 0);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_supplier_balance(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_supplier_balance(uuid, uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6. الدالة المركزية الموحدة لتعديل سلف العاملين (update_employee_advance)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.update_employee_advance(uuid, uuid, numeric, date, date, integer, text, uuid, uuid);
DROP FUNCTION IF EXISTS public.update_employee_advance(uuid, numeric, integer, text, uuid);
DROP FUNCTION IF EXISTS public.update_employee_advance(uuid, uuid, numeric, date, uuid, text);

CREATE OR REPLACE FUNCTION public.update_employee_advance(
    p_advance_id uuid,
    p_employee_id uuid,
    p_amount numeric,
    p_date date,
    p_treasury_id uuid,
    p_notes text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id uuid;
    v_ref text;
    v_journal_id uuid;
    v_emp_name text;
    v_advances_acc_id uuid;
    v_caller_id uuid := auth.uid();
    v_caller_role text;
BEGIN
    IF v_caller_id IS NOT NULL THEN
        SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
        IF COALESCE(v_caller_role, '') NOT IN ('super_admin', 'admin', 'manager', 'accountant', 'owner') THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: لا تملك الصلاحية المالية اللازمة لتعديل السلفة.';
        END IF;
    END IF;

    v_org_id := public.get_my_org();
    IF v_org_id IS NULL THEN
        SELECT organization_id INTO v_org_id FROM public.employee_advances WHERE id = p_advance_id;
    END IF;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'تعذر تحديد المنظمة للسلفة.';
    END IF;

    SELECT reference, organization_id INTO v_ref, v_org_id
    FROM public.employee_advances
    WHERE id = p_advance_id
      AND (organization_id = v_org_id OR public.get_my_role() = 'super_admin' OR auth.role() = 'service_role');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'السلفة غير موجودة أو لا تملك صلاحية تعديلها.';
    END IF;

    IF v_ref IS NULL OR TRIM(v_ref) = '' THEN
        v_ref := 'ADV-' || LPAD(FLOOR(RANDOM() * 900000 + 100000)::text, 6, '0');
    END IF;

    SELECT COALESCE(full_name, name, 'موظف') INTO v_emp_name
    FROM public.employees
    WHERE id = p_employee_id;

    UPDATE public.employee_advances
    SET employee_id = p_employee_id,
        amount = p_amount,
        request_date = p_date,
        advance_date = p_date,
        treasury_account_id = p_treasury_id,
        notes = p_notes,
        reference = v_ref
    WHERE id = p_advance_id;

    SELECT id INTO v_advances_acc_id
    FROM public.accounts
    WHERE organization_id = v_org_id
      AND (code = '1223' OR name LIKE '%سلف%')
    ORDER BY CASE WHEN code = '1223' THEN 1 ELSE 2 END
    LIMIT 1;

    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    SELECT id INTO v_journal_id
    FROM public.journal_entries
    WHERE organization_id = v_org_id
      AND (
          (related_document_id = p_advance_id AND related_document_type = 'employee_advance')
          OR reference = v_ref
          OR reference = 'ADV-' || v_ref
          OR reference = REPLACE(v_ref, 'ADV-', '')
          OR description ILIKE '%' || v_ref || '%'
      )
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_journal_id IS NOT NULL THEN
        UPDATE public.journal_entries
        SET transaction_date = p_date,
            description = 'صرف سلفة للموظف ' || COALESCE(v_emp_name, '')
        WHERE id = v_journal_id;

        DELETE FROM public.journal_lines
        WHERE journal_entry_id = v_journal_id;

        IF v_advances_acc_id IS NOT NULL AND p_treasury_id IS NOT NULL THEN
            INSERT INTO public.journal_lines (
                journal_entry_id, account_id, debit, credit, description, organization_id
            ) VALUES (
                v_journal_id, v_advances_acc_id, p_amount, 0, 'سلفة موظف - ' || COALESCE(v_emp_name, ''), v_org_id
            );

            INSERT INTO public.journal_lines (
                journal_entry_id, account_id, debit, credit, description, organization_id
            ) VALUES (
                v_journal_id, p_treasury_id, 0, p_amount, 'صرف نقدية لسلفة', v_org_id
            );
        END IF;
    ELSE
        IF v_advances_acc_id IS NOT NULL AND p_treasury_id IS NOT NULL THEN
            INSERT INTO public.journal_entries (
                organization_id,
                reference,
                transaction_date,
                description,
                status,
                is_posted,
                related_document_id,
                related_document_type
            ) VALUES (
                v_org_id,
                v_ref,
                p_date,
                'صرف سلفة للموظف ' || COALESCE(v_emp_name, ''),
                'posted',
                true,
                p_advance_id,
                'employee_advance'
            ) RETURNING id INTO v_journal_id;

            INSERT INTO public.journal_lines (
                journal_entry_id, account_id, debit, credit, description, organization_id
            ) VALUES (
                v_journal_id, v_advances_acc_id, p_amount, 0, 'سلفة موظف - ' || COALESCE(v_emp_name, ''), v_org_id
            );

            INSERT INTO public.journal_lines (
                journal_entry_id, account_id, debit, credit, description, organization_id
            ) VALUES (
                v_journal_id, p_treasury_id, 0, p_amount, 'صرف نقدية لسلفة', v_org_id
            );
        END IF;
    END IF;

    PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);

    RETURN true;
EXCEPTION
    WHEN OTHERS THEN
        PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
        RAISE;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.update_employee_advance(uuid, uuid, numeric, date, uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.update_employee_advance(uuid, uuid, numeric, date, uuid, text) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7. تحديث كاش واجهة البرمجة (PGRST Schema Reload)
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;
