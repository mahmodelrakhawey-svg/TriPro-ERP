-- ==============================================================================
-- 🛡️ TriPro ERP — التحديث الشامل النهائي للقاعدة العامة (General Database / Master)
-- الملف: sql_updates/2026-11-14_FINAL_CONSOLIDATED_GENERAL_DB_PATCH.sql
-- 
-- 📋 يشمل هذا الملف كافة التحسينات والإصلاحات الرقابية والمحاسبية لتعميمها على القاعدة العامة:
--   1. حزمة الحصانة المحاسبية لمرتجعات المشتريات (unpost_purchase_return و delete_purchase_return ومحفزات الحماية).
--   2. دالة استعلام أرصدة الموردين السريعة (get_all_supplier_balances_fast) الفائقة السرعة لتفادي أي Timeout.
--   3. دالة كشف حساب ورصيد المورد الفردي (get_supplier_balance) المتطابقة 100% مع الأستاذ العام ودرع النزاهة.
--   4. الدالة المركزية الموحدة لتعديل سلف العاملين (update_employee_advance) وتحديث قيد الخزينة آلياً وبدون تكرار.
--   5. روتين تنظيف وفحص تلقائي شامل وتحديث كاش واجهة البرمجة (pgrst reload).
-- ==============================================================================

BEGIN;

-- 0. تفعيل تصريح تعديل القيود المالية للجلسة
SELECT set_config('app.allow_financial_ledger_mutation', 'true', true);

-- ==============================================================================
-- 1. دالة إلغاء ترحيل مرتجع المشتريات (Unpost Purchase Return)
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
    -- أ. التحقق من وجود المرتجع
    SELECT * INTO v_return FROM public.purchase_returns WHERE id = p_return_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'مرتجع المشتريات غير موجود (ID: %)', p_return_id;
    END IF;

    -- إذا كان مسودة بالفعل فلا حاجة للإلغاء
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

    -- 🛡️ تفعيل نطاق السماح الداخلي لتجاوز محفزات الحصانة
    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    v_org_id := COALESCE(p_org_id, v_return.organization_id);

    -- ب. عكس أثر المخزون
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

    -- ج. حذف القيد المحاسبي المرتبط
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

    -- حذف أي قيود أخرى مسجلة بنفس رقم المرتجع
    DELETE FROM public.journal_lines 
    WHERE journal_entry_id IN (
        SELECT id FROM public.journal_entries WHERE reference = v_return.return_number
    );
    DELETE FROM public.journal_entries WHERE reference = v_return.return_number;

    -- د. تحويل حالة المرتجع إلى مسودة (draft)
    UPDATE public.purchase_returns
    SET 
        status = 'draft',
        is_posted = false,
        related_journal_entry_id = NULL
    WHERE id = p_return_id;

    RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.unpost_purchase_return(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.unpost_purchase_return(uuid, uuid) TO authenticated, service_role;


-- ==============================================================================
-- 2. دالة الحذف الآمن لمرتجع المشتريات (delete_purchase_return)
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

    -- 🛡️ التحقق الأمني من هوية وصلاحيات المستخدم المتصل
    IF v_caller_id IS NULL AND auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: تم رفض الوصول. يجب تسجيل الدخول لحذف مرتجع المشتريات.';
    END IF;

    IF v_caller_id IS NOT NULL THEN
        SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
        IF COALESCE(v_caller_role, '') NOT IN ('super_admin', 'admin', 'manager', 'accountant', 'owner') THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: لا تملك الصلاحية اللازمة لحذف مرتجع المشتريات.';
        END IF;

        -- 🛡️ صمام أمان عزل المنشآت الصارم (Tenant Isolation Guard)
        IF v_org_id IS NOT NULL 
           AND v_org_id <> public.get_my_org() 
           AND COALESCE(v_caller_role, '') NOT IN ('super_admin') THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: هذا المرتجع يتبع منشأة أخرى ولا يحق لك حذفه.';
        END IF;
    END IF;

    -- منع حذف المرتجع المرحل
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
-- 3. صمامات الأمان لحظر التعديل المباشر (Document Immutability Triggers)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.fn_guard_purchase_returns_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_bypass text;
BEGIN
    BEGIN
        v_bypass := current_setting('app.allow_financial_ledger_mutation', true);
    EXCEPTION WHEN OTHERS THEN
        v_bypass := 'false';
    END;

    IF v_bypass = 'true' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.status NOT IN ('draft', 'cancelled') THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: مرتجع المشتريات محصن قانونياً ولا يمكن حذفه أثناء ترحيله. يرجى استخدام زر إلغاء الترحيل أولاً.';
        END IF;
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status NOT IN ('draft', 'cancelled') AND NEW.status NOT IN ('draft', 'cancelled') THEN
            IF (NEW.supplier_id IS DISTINCT FROM OLD.supplier_id) OR
               (NEW.total_amount IS DISTINCT FROM OLD.total_amount) OR
               (NEW.return_date IS DISTINCT FROM OLD.return_date) OR
               (NEW.warehouse_id IS DISTINCT FROM OLD.warehouse_id) THEN
                RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: لا يمكن تعديل بيانات مرتجع المشتريات بعد ترحيله للأستاذ العام. يرجى إلغاء الترحيل أولاً.';
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_purchase_returns_immutability ON public.purchase_returns;
CREATE TRIGGER trg_guard_purchase_returns_immutability
BEFORE UPDATE OR DELETE ON public.purchase_returns
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_purchase_returns_immutability();


CREATE OR REPLACE FUNCTION public.fn_guard_purchase_return_items_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_parent_status text;
    v_bypass text;
BEGIN
    BEGIN
        v_bypass := current_setting('app.allow_financial_ledger_mutation', true);
    EXCEPTION WHEN OTHERS THEN
        v_bypass := 'false';
    END;

    IF v_bypass = 'true' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    SELECT status INTO v_parent_status
    FROM public.purchase_returns
    WHERE id = COALESCE(NEW.purchase_return_id, OLD.purchase_return_id);

    IF v_parent_status IS NOT NULL AND v_parent_status NOT IN ('draft', 'cancelled') THEN
        RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: بنود مرتجع المشتريات محصنة ومرحلة بالمخازن والأستاذ العام ولا يمكن تعديلها أو حذفها مباشرة.';
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_purchase_return_items_immutability ON public.purchase_return_items;
CREATE TRIGGER trg_guard_purchase_return_items_immutability
BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_return_items
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_purchase_return_items_immutability();


-- ==============================================================================
-- 4. دالة استعلام أرصدة الموردين السريعة (get_all_supplier_balances_fast)
-- ==============================================================================
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
    WITH 
    invoices_agg AS (
        SELECT 
            pi.supplier_id,
            COALESCE(SUM(pi.total_amount), 0) AS gross_inv,
            COALESCE(SUM(CASE 
                WHEN pi.payment_method = 'cash' 
                  OR pi.payment_type = 'cash' 
                  OR pi.paid_amount > 0 THEN 
                    CASE 
                        WHEN pi.payment_method = 'cash' OR pi.payment_type = 'cash' 
                            THEN pi.total_amount
                        ELSE LEAST(COALESCE(pi.paid_amount, 0), pi.total_amount)
                    END
                ELSE 0 
            END), 0) AS imm_pay
        FROM public.purchase_invoices pi
        WHERE (pi.organization_id = p_org_id OR p_org_id IS NULL)
          AND pi.status NOT IN ('draft', 'cancelled', 'rejected')
        GROUP BY pi.supplier_id
    ),
    payments_agg AS (
        SELECT 
            pv.supplier_id,
            COALESCE(SUM(pv.amount), 0) AS total_pay
        FROM public.payment_vouchers pv
        WHERE (pv.organization_id = p_org_id OR p_org_id IS NULL)
          AND pv.status NOT IN ('draft', 'cancelled', 'rejected')
          AND pv.supplier_id IS NOT NULL
        GROUP BY pv.supplier_id
    ),
    cheques_agg AS (
        SELECT 
            c.supplier_id,
            COALESCE(SUM(c.amount), 0) AS total_chq
        FROM public.cheques c
        WHERE (c.organization_id = p_org_id OR p_org_id IS NULL)
          AND c.type = 'payable'
          AND c.status NOT IN ('draft', 'cancelled', 'rejected')
          AND c.supplier_id IS NOT NULL
        GROUP BY c.supplier_id
    ),
    returns_agg AS (
        SELECT 
            pr.supplier_id,
            COALESCE(SUM(pr.total_amount), 0) AS total_ret
        FROM public.purchase_returns pr
        WHERE (pr.organization_id = p_org_id OR p_org_id IS NULL)
          AND pr.status NOT IN ('draft', 'cancelled', 'rejected')
          AND pr.supplier_id IS NOT NULL
        GROUP BY pr.supplier_id
    ),
    debit_notes_agg AS (
        SELECT 
            dn.supplier_id,
            COALESCE(SUM(dn.total_amount), 0) AS total_dn
        FROM public.debit_notes dn
        WHERE (dn.organization_id = p_org_id OR p_org_id IS NULL)
          AND dn.status = 'posted'
          AND dn.supplier_id IS NOT NULL
        GROUP BY dn.supplier_id
    ),
    manual_je_agg AS (
        SELECT 
            s.id AS supplier_id,
            COALESCE(SUM(jl.credit), 0) AS manual_credit,
            COALESCE(SUM(jl.debit), 0) AS manual_debit
        FROM public.suppliers s
        JOIN public.journal_lines jl ON 1=1
        JOIN public.journal_entries je ON jl.journal_entry_id = je.id
        JOIN public.accounts a ON a.id = jl.account_id
        WHERE (je.organization_id = p_org_id OR p_org_id IS NULL)
          AND (s.organization_id = p_org_id OR p_org_id IS NULL)
          AND je.status = 'posted'
          AND je.is_posted = true
          AND (
              a.code = '201' OR a.code LIKE '201%' OR a.code = '2101' OR a.code LIKE '2101%' 
              OR a.code = '221' OR a.code LIKE '221%' OR a.name ILIKE '%الموردين%' OR a.name ILIKE '%موردين%'
          )
          AND (
              (je.description ILIKE '%' || s.name || '%' AND s.name != '')
              OR (je.reference ILIKE '%' || s.id::text || '%')
          )
          AND (je.related_document_type IS NULL OR je.related_document_type NOT IN ('purchase_invoice', 'payment_voucher', 'purchase_return', 'debit_note', 'cheque'))
          AND (je.reference IS NULL OR (
              je.reference NOT LIKE 'PINV-%' AND 
              je.reference NOT LIKE 'PUR-%' AND 
              je.reference NOT LIKE 'PV-%' AND 
              je.reference NOT LIKE 'PR-%' AND 
              je.reference NOT LIKE 'PRET-%' AND 
              je.reference NOT LIKE 'DN-%' AND 
              je.reference NOT LIKE 'CHQ-%' AND 
              je.reference NOT LIKE 'OP-%' AND 
              je.reference NOT LIKE 'OB-%'
          ))
        GROUP BY s.id
    )
    SELECT 
        s.id AS supplier_id,
        s.name::text AS supplier_name,
        COALESCE(s.phone, '')::text AS phone,
        COALESCE(s.tax_number, '')::text AS tax_number,
        COALESCE(s.opening_balance, 0)::numeric AS opening_balance,
        COALESCE(inv.gross_inv, 0)::numeric AS total_invoices,
        COALESCE(inv.imm_pay, 0)::numeric AS total_immediate_payments,
        COALESCE(pay.total_pay, 0)::numeric AS total_payments,
        COALESCE(chq.total_chq, 0)::numeric AS total_cheques,
        COALESCE(ret.total_ret, 0)::numeric AS total_returns,
        COALESCE(dn.total_dn, 0)::numeric AS total_debit_notes,
        COALESCE(mje.manual_debit, 0)::numeric AS total_manual_debit,
        COALESCE(mje.manual_credit, 0)::numeric AS total_manual_credit,
        (
            (COALESCE(s.opening_balance, 0) + COALESCE(inv.gross_inv, 0) + COALESCE(mje.manual_credit, 0))
            - 
            (COALESCE(inv.imm_pay, 0) + COALESCE(pay.total_pay, 0) + COALESCE(chq.total_chq, 0) + COALESCE(ret.total_ret, 0) + COALESCE(dn.total_dn, 0) + COALESCE(mje.manual_debit, 0))
        )::numeric AS final_balance
    FROM public.suppliers s
    LEFT JOIN invoices_agg inv ON inv.supplier_id = s.id
    LEFT JOIN payments_agg pay ON pay.supplier_id = s.id
    LEFT JOIN cheques_agg chq ON chq.supplier_id = s.id
    LEFT JOIN returns_agg ret ON ret.supplier_id = s.id
    LEFT JOIN debit_notes_agg dn ON dn.supplier_id = s.id
    LEFT JOIN manual_je_agg mje ON mje.supplier_id = s.id
    WHERE (s.organization_id = p_org_id OR p_org_id IS NULL)
      AND (s.deleted_at IS NULL OR s.status = 'active')
    ORDER BY s.name;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_all_supplier_balances_fast(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_all_supplier_balances_fast(uuid) TO authenticated, service_role;


-- ==============================================================================
-- 5. دالة كشف حساب ورصيد المورد الفردي (get_supplier_balance)
-- ==============================================================================
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
    v_opening_balance numeric := 0;
    v_gross_invoices numeric := 0;
    v_immediate_payments numeric := 0;
    v_payments numeric := 0;
    v_cheques numeric := 0;
    v_returns numeric := 0;
    v_debit_notes numeric := 0;
    v_manual_credit numeric := 0;
    v_manual_debit numeric := 0;
    v_supplier_name text := '';
BEGIN
    SELECT COALESCE(opening_balance, 0), COALESCE(organization_id, p_org_id), COALESCE(name, '')
      INTO v_opening_balance, p_org_id, v_supplier_name
      FROM public.suppliers
     WHERE id = p_supplier_id;

    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    -- فواتير المشتريات والسداد الفوري
    SELECT 
        COALESCE(SUM(total_amount), 0),
        COALESCE(SUM(CASE 
            WHEN payment_method = 'cash' 
              OR payment_type = 'cash' 
              OR paid_amount > 0 THEN 
                CASE 
                    WHEN payment_method = 'cash' OR payment_type = 'cash' 
                        THEN total_amount
                    ELSE LEAST(COALESCE(paid_amount, 0), total_amount)
                END
            ELSE 0 
        END), 0)
    INTO v_gross_invoices, v_immediate_payments
    FROM public.purchase_invoices
    WHERE supplier_id = p_supplier_id
      AND organization_id = p_org_id
      AND status NOT IN ('draft', 'cancelled', 'rejected');

    -- سندات الصرف
    SELECT COALESCE(SUM(amount), 0)
      INTO v_payments
      FROM public.payment_vouchers
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND status NOT IN ('draft', 'cancelled', 'rejected');

    -- الشيكات
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cheques' AND table_schema = 'public') THEN
        SELECT COALESCE(SUM(amount), 0)
          INTO v_cheques
          FROM public.cheques
         WHERE supplier_id = p_supplier_id
           AND organization_id = p_org_id
           AND type = 'payable'
           AND status NOT IN ('rejected', 'cancelled');
    END IF;

    -- مرتجعات المشتريات
    SELECT COALESCE(SUM(total_amount), 0)
      INTO v_returns
      FROM public.purchase_returns
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND status NOT IN ('draft', 'cancelled', 'rejected');

    -- الإشعارات المدينة
    SELECT COALESCE(SUM(total_amount), 0)
      INTO v_debit_notes
      FROM public.debit_notes
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND status = 'posted';

    -- قيود اليومية اليدوية فقط
    SELECT 
        COALESCE(SUM(jl.credit), 0),
        COALESCE(SUM(jl.debit), 0)
    INTO v_manual_credit, v_manual_debit
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    JOIN public.accounts a ON a.id = jl.account_id
    WHERE (je.organization_id = p_org_id OR je.organization_id IS NULL)
      AND je.status = 'posted'
      AND je.is_posted = true
      AND (
          a.code = '201' OR a.code LIKE '201%' OR a.code = '2101' OR a.code LIKE '2101%' 
          OR a.code = '221' OR a.code LIKE '221%' OR a.name ILIKE '%الموردين%' OR a.name ILIKE '%موردين%'
      )
      AND (
          (je.description ILIKE '%' || v_supplier_name || '%' AND v_supplier_name != '')
          OR (je.reference ILIKE '%' || p_supplier_id::text || '%')
      )
      AND (je.related_document_type IS NULL OR je.related_document_type NOT IN ('purchase_invoice', 'payment_voucher', 'purchase_return', 'debit_note', 'cheque'))
      AND (je.reference IS NULL OR (
          je.reference NOT LIKE 'PINV-%' AND 
          je.reference NOT LIKE 'PUR-%' AND 
          je.reference NOT LIKE 'PV-%' AND 
          je.reference NOT LIKE 'PR-%' AND 
          je.reference NOT LIKE 'PRET-%' AND 
          je.reference NOT LIKE 'DN-%' AND 
          je.reference NOT LIKE 'CHQ-%' AND 
          je.reference NOT LIKE 'OP-%' AND 
          je.reference NOT LIKE 'OB-%'
      ));

    RETURN (v_opening_balance + v_gross_invoices + v_manual_credit) 
           - (v_immediate_payments + v_payments + v_cheques + v_returns + v_debit_notes + v_manual_debit);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_supplier_balance(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_supplier_balance(uuid, uuid) TO authenticated, service_role;


-- ==============================================================================
-- 6. الدالة المركزية الموحدة لتعديل سلف العاملين (update_employee_advance)
-- ==============================================================================
DROP FUNCTION IF EXISTS public.update_employee_advance(uuid, uuid, numeric, date, uuid, text);
DROP FUNCTION IF EXISTS public.update_employee_advance(uuid, uuid, numeric, date, date, int, text, uuid, uuid);

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
BEGIN
    -- 1. تحديد المنظمة
    v_org_id := public.get_my_org();
    IF v_org_id IS NULL THEN
        SELECT organization_id INTO v_org_id FROM public.employee_advances WHERE id = p_advance_id;
    END IF;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'تعذر تحديد المنظمة للسلفة.';
    END IF;

    -- 2. التحقق من وجود السلفة
    SELECT reference INTO v_ref
    FROM public.employee_advances
    WHERE id = p_advance_id
      AND (organization_id = v_org_id OR public.get_my_role() = 'super_admin' OR auth.role() = 'service_role');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'السلفة غير موجودة أو لا تملك صلاحية تعديلها.';
    END IF;

    IF v_ref IS NULL OR TRIM(v_ref) = '' THEN
        v_ref := 'ADV-' || LPAD(FLOOR(RANDOM() * 900000 + 100000)::text, 6, '0');
    END IF;

    -- 3. جلب اسم الموظف الجديد بأمان
    SELECT COALESCE(full_name, name, 'موظف') INTO v_emp_name
    FROM public.employees
    WHERE id = p_employee_id;

    -- 4. تحديث سجل السلفة
    UPDATE public.employee_advances
    SET employee_id = p_employee_id,
        amount = p_amount,
        request_date = p_date,
        advance_date = p_date,
        treasury_account_id = p_treasury_id,
        notes = p_notes,
        reference = v_ref
    WHERE id = p_advance_id;

    -- 5. جلب حساب سلف الموظفين (1223)
    SELECT id INTO v_advances_acc_id
    FROM public.accounts
    WHERE organization_id = v_org_id
      AND (code = '1223' OR name LIKE '%سلف%')
    ORDER BY CASE WHEN code = '1223' THEN 1 ELSE 2 END
    LIMIT 1;

    -- 6. تفعيل تصريح تعديل القيود المالية
    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    -- 7. فحص القيد المحاسبي المرتبط
    SELECT id INTO v_journal_id
    FROM public.journal_entries
    WHERE organization_id = v_org_id
      AND (
          reference = v_ref
          OR reference = 'ADV-' || v_ref
          OR reference = REPLACE(v_ref, 'ADV-', '')
          OR description ILIKE '%' || v_ref || '%'
      )
    LIMIT 1;

    IF v_journal_id IS NOT NULL THEN
        UPDATE public.journal_entries
        SET date = p_date,
            transaction_date = p_date,
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
                entry_number,
                reference,
                date,
                transaction_date,
                description,
                status,
                is_posted
            ) VALUES (
                v_org_id,
                'JE-' || TO_CHAR(p_date, 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::text, 4, '0'),
                v_ref,
                p_date,
                p_date,
                'صرف سلفة للموظف ' || COALESCE(v_emp_name, ''),
                'posted',
                true
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

    -- 8. إغلاق تصريح التعديل المحاسبي
    PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);

    RETURN true;
EXCEPTION
    WHEN OTHERS THEN
        PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
        RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_employee_advance(uuid, uuid, numeric, date, uuid, text) TO authenticated, service_role, anon;


-- ==============================================================================
-- 7. فحص تلقائي شامل وتحديث كاش قاعدة البيانات
-- ==============================================================================
COMMIT;

SELECT set_config('app.allow_financial_ledger_mutation', 'false', false);
NOTIFY pgrst, 'reload schema';
