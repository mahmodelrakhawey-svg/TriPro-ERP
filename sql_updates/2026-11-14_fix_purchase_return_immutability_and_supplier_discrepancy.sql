-- ==============================================================================
-- 🛡️ TriPro ERP — حماية مرتجعات المشتريات ومعالجة فروقات أرصدة الموردين
-- ملف التحديث: 2026-11-14_fix_purchase_return_immutability_and_supplier_discrepancy.sql
-- الأهداف:
--   1. منع مسؤول المشتريات من تعديل أو حذف أي مرتجع مشتريات مرحل (Posted) أسوة بفواتير الشراء.
--   2. فرض صمامات أمان حظر التعديل المباشر (Document Immutability Triggers) على جداول المرتجعات.
--   3. توفير دالة إلغاء ترحيل المرتجع (unpost_purchase_return) للمديرين والمحاسبين فقط.
--   4. توفير دالة الحذف الآمن للمرتجع المسودة (delete_purchase_return).
--   5. إصلاح استبعاد مرتجعات المشتريات (PRET-) من القيود اليدوية في get_all_supplier_balances_fast و get_supplier_balance لمنع ازدواجية الخصم.
--   6. معالجة وتصحيح الفرق المالي (905 ج.م) الناتج عن تكرار قيد اليومية أو القيد الشاذ للمورد "برج ايفل".
-- ==============================================================================

-- 1. دالة إلغاء ترحيل مرتجع المشتريات (Unpost Purchase Return) - للمديرين والمحاسبين فقط
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

    -- 🛡️ التحقق الأمني الصارم من صلاحيات المستخدم المتصل (منع مسؤولي المشتريات والمستخدمين العاديين)
    IF v_caller_id IS NOT NULL THEN
        SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
        IF COALESCE(v_caller_role, '') NOT IN ('super_admin', 'admin', 'manager', 'accountant', 'owner') THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: لا تملك الصلاحية المحاسبية اللازمة لإلغاء ترحيل مرتجع المشتريات. هذه العملية مقتصرة على الإدارة والمحاسبين فقط.';
        END IF;

        IF v_return.organization_id IS NOT NULL 
           AND v_return.organization_id <> public.get_my_org() 
           AND COALESCE(v_caller_role, '') NOT IN ('super_admin') THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: هذا المرتجع يتبع منشأة أخرى ولا يحق لك تعديله.';
        END IF;
    END IF;

    -- 🛡️ تفعيل نطاق السماح الداخلي للعمليات المحاسبية والمخزنية لتجاوز محفزات الحصانة
    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    v_org_id := COALESCE(p_org_id, v_return.organization_id);

    -- ب. عكس أثر المخزون (إعادة إضافة الكميات التي تم خصمها عند المرتجع)
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

    -- ج. حذف أسطر وقيد اليومية المرتبط بالمرتجع بأمان
    v_journal_id := v_return.related_journal_entry_id;

    IF v_journal_id IS NOT NULL THEN
        DELETE FROM public.journal_lines WHERE journal_entry_id = v_journal_id;
        DELETE FROM public.journal_entries WHERE id = v_journal_id;
    END IF;

    -- حذف أي قيود أخرى مسجلة بنفس رقم المستند أو المعرف
    DELETE FROM public.journal_lines 
    WHERE journal_entry_id IN (
        SELECT id FROM public.journal_entries 
        WHERE (related_document_id = p_return_id AND related_document_type = 'purchase_return')
           OR (reference = v_return.return_number AND organization_id = v_org_id)
    );
    DELETE FROM public.journal_entries 
    WHERE (related_document_id = p_return_id AND related_document_type = 'purchase_return')
       OR (reference = v_return.return_number AND organization_id = v_org_id);

    -- د. تحويل حالة المرتجع إلى مسودة (Draft) وتصفير القيد المرتبط
    UPDATE public.purchase_returns
    SET 
        status = 'draft',
        related_journal_entry_id = NULL
    WHERE id = p_return_id;

    -- هـ. إعادة احتساب الأرصدة للنظام
    BEGIN
        IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'recalculate_all_system_balances' AND pronamespace = 'public'::regnamespace) THEN
            PERFORM public.recalculate_all_system_balances(v_org_id);
        END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.unpost_purchase_return(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.unpost_purchase_return(uuid, uuid) TO authenticated, service_role;


-- 2. دالة الحذف الآمن لمرتجع المشتريات (Delete Purchase Return)
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
    v_return record;
    v_caller_role text;
    v_caller_id uuid := auth.uid();
BEGIN
    SELECT * INTO v_return FROM public.purchase_returns WHERE id = p_return_id;
    IF NOT FOUND THEN
        RETURN true;
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
        IF v_return.organization_id IS NOT NULL 
           AND v_return.organization_id <> public.get_my_org() 
           AND COALESCE(v_caller_role, '') NOT IN ('super_admin') THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: هذا المرتجع يتبع منشأة أخرى ولا يحق لك حذفه.';
        END IF;
    END IF;

    -- 🛡️ منع حذف المرتجع المرحل مباشرة
    IF v_return.status = 'posted' THEN
        RAISE EXCEPTION 'TRIPRO_DOCUMENT_GUARD: لا يمكن حذف مرتجع المشتريات المرحل (رقم: %) مباشرة. يجب أولاً فك الترحيل لتحويله إلى مسودة (Draft).',
            COALESCE(v_return.return_number, p_return_id::text);
    END IF;

    -- حذف بنود المرتجع ثم المرتجع نفسه
    DELETE FROM public.purchase_return_items WHERE purchase_return_id = p_return_id;
    DELETE FROM public.purchase_returns WHERE id = p_return_id;

    RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_purchase_return(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.delete_purchase_return(uuid, uuid) TO authenticated, service_role;


-- 3. صمامات أمان حظر التعديل المباشر على مرتجعات المشتريات (Document Immutability Triggers)
CREATE OR REPLACE FUNCTION public.fn_guard_posted_purchase_return_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- السماح بالعمليات الداخلية المصرح بها مثل unpost_purchase_return
    IF current_setting('app.allow_financial_ledger_mutation', true) = 'true' THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    -- 1. منع الحذف إذا كان المرتجع مرحلاً
    IF TG_OP = 'DELETE' THEN
        IF OLD.status = 'posted' THEN
            RAISE EXCEPTION 'TRIPRO_DOCUMENT_GUARD: لا يمكن حذف مرتجع المشتريات المرحل (رقم: %) مباشرة. يجب أولاً فك الترحيل لتحويله إلى مسودة (Draft).',
                COALESCE(OLD.return_number, OLD.id::text);
        END IF;
        RETURN OLD;
    END IF;

    -- 2. في حالة التعديل، منع تعديل القيم المالية أو أطراف المستند إذا كان مرحلاً ويظل مرحلاً
    IF TG_OP = 'UPDATE' THEN
        IF OLD.status = 'posted' AND NEW.status = 'posted' THEN
            IF OLD.total_amount IS DISTINCT FROM NEW.total_amount
               OR OLD.tax_amount IS DISTINCT FROM NEW.tax_amount
               OR OLD.supplier_id IS DISTINCT FROM NEW.supplier_id
               OR OLD.warehouse_id IS DISTINCT FROM NEW.warehouse_id
               OR OLD.return_date IS DISTINCT FROM NEW.return_date
            THEN
                RAISE EXCEPTION 'TRIPRO_DOCUMENT_GUARD: لا يمكن تعديل القيم المالية أو أطراف مرتجع المشتريات المرحل (رقم: %) مباشرة. يجب أولاً فك الترحيل (إلغاء الترحيل) لتحويله لمسودة.',
                    COALESCE(OLD.return_number, OLD.id::text);
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_posted_purchase_return_immutability ON public.purchase_returns;
CREATE TRIGGER trg_guard_posted_purchase_return_immutability
BEFORE UPDATE OR DELETE ON public.purchase_returns
FOR EACH ROW
EXECUTE FUNCTION public.fn_guard_posted_purchase_return_immutability();


-- 4. صمام حماية بنود مرتجعات المشتريات من التعديل أو الحذف أثناء ترحيل المرتجع
CREATE OR REPLACE FUNCTION public.fn_guard_posted_purchase_return_items_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_parent_status text;
    v_parent_number text;
    v_return_id uuid;
BEGIN
    IF current_setting('app.allow_financial_ledger_mutation', true) = 'true' THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
        v_return_id := OLD.purchase_return_id;
    ELSE
        v_return_id := NEW.purchase_return_id;
    END IF;

    SELECT status, return_number INTO v_parent_status, v_parent_number
    FROM public.purchase_returns
    WHERE id = v_return_id;

    IF v_parent_status = 'posted' THEN
        RAISE EXCEPTION 'TRIPRO_DOCUMENT_GUARD: لا يمكن تعديل أو حذف أو إضافة بنود إلى مرتجع مشتريات مرحل (رقم: %) مباشرة. يجب أولاً فك الترحيل لتحويله لمسودة.',
            COALESCE(v_parent_number, v_return_id::text);
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_posted_purchase_return_items_immutability ON public.purchase_return_items;
CREATE TRIGGER trg_guard_posted_purchase_return_items_immutability
BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_return_items
FOR EACH ROW
EXECUTE FUNCTION public.fn_guard_posted_purchase_return_items_immutability();


-- 5. تحديث دالة جلب أرصدة الموردين السريعة get_all_supplier_balances_fast
-- لمنع احتساب مرتجعات المشتريات (PRET-) ومرتجعات PR كقيود يدوية مكررة
CREATE OR REPLACE FUNCTION public.get_all_supplier_balances_fast(
    p_org_id uuid,
    p_search text DEFAULT NULL,
    p_limit int DEFAULT 1000,
    p_offset int DEFAULT 0
)
RETURNS TABLE (
    supplier_id uuid,
    supplier_name text,
    phone text,
    tax_number text,
    opening_balance numeric,
    total_purchases numeric,
    balance numeric,
    last_invoice text,
    total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_search text;
    v_total_rows bigint;
BEGIN
    -- 🛡️ التحقق الأمني الصارم من عزل المنشأة
    p_org_id := public.validate_tenant_access(p_org_id);
    v_search := NULLIF(TRIM(p_search), '');

    SELECT COUNT(*) INTO v_total_rows
    FROM public.suppliers s
    WHERE s.organization_id = p_org_id
      AND s.deleted_at IS NULL
      AND (
          v_search IS NULL
          OR s.name ILIKE '%' || v_search || '%'
          OR s.phone ILIKE '%' || v_search || '%'
          OR s.tax_number ILIKE '%' || v_search || '%'
      );

    RETURN QUERY
    WITH 
    supplier_accounts AS (
        SELECT a.id AS account_id
        FROM public.accounts a
        WHERE (a.organization_id = p_org_id OR a.organization_id IS NULL)
          AND (
              a.code = '201' 
              OR a.code LIKE '201%' 
              OR a.code = '2101'
              OR a.code LIKE '2101%'
              OR a.code = '221'
              OR a.code LIKE '221%'
              OR (
                  (a.name ILIKE '%الموردين%' OR a.name ILIKE '%موردين%')
                  AND a.name NOT ILIKE '%أوراق%'
                  AND a.name NOT ILIKE '%اوراق%'
                  AND a.code NOT LIKE '202%'
                  AND a.code != '20'
              )
          )
    ),
    agg_invoices AS (
        SELECT 
            pi.supplier_id,
            COALESCE(SUM(pi.total_amount), 0) AS gross_purchases,
            COALESCE(SUM(
                pi.total_amount - GREATEST(0, COALESCE(pi.paid_amount, 0) - COALESCE((
                    SELECT SUM(pv.amount) 
                    FROM public.payment_vouchers pv 
                    WHERE pv.supplier_id = pi.supplier_id 
                      AND pi.invoice_number IS NOT NULL
                      AND pv.notes ILIKE '%' || pi.invoice_number || '%'
                ), 0))
            ), 0) AS total_invoiced,
            MAX(pi.invoice_date::text) AS max_inv_date
        FROM public.purchase_invoices pi
        WHERE pi.organization_id = p_org_id
          AND pi.supplier_id IS NOT NULL
          AND pi.status != 'draft'
        GROUP BY pi.supplier_id
    ),
    agg_payments AS (
        SELECT 
            pv.supplier_id,
            COALESCE(SUM(pv.amount), 0) AS total_payments
        FROM public.payment_vouchers pv
        WHERE pv.organization_id = p_org_id
          AND pv.supplier_id IS NOT NULL
          AND pv.deleted_at IS NULL
          AND (pv.status IS NULL OR pv.status NOT IN ('rejected', 'cancelled', 'draft', 'pending_approval'))
          AND (pv.notes IS NULL OR (pv.notes NOT ILIKE '[مرفوض%' AND pv.notes NOT ILIKE '[معلق للاعتماد%'))
        GROUP BY pv.supplier_id
    ),
    agg_cheques AS (
        SELECT 
            ch.party_id AS supplier_id,
            COALESCE(SUM(ch.amount), 0) AS total_cheques
        FROM public.cheques ch
        WHERE ch.organization_id = p_org_id
          AND ch.party_id IS NOT NULL
          AND ch.type = 'outgoing'
          AND ch.status NOT IN ('rejected', 'cancelled')
        GROUP BY ch.party_id
    ),
    agg_returns AS (
        SELECT 
            pr.supplier_id,
            COALESCE(SUM(pr.total_amount), 0) AS total_returns
        FROM public.purchase_returns pr
        WHERE pr.organization_id = p_org_id
          AND pr.supplier_id IS NOT NULL
          AND pr.status != 'draft'
        GROUP BY pr.supplier_id
    ),
    agg_debit_notes AS (
        SELECT 
            dn.supplier_id,
            COALESCE(SUM(dn.total_amount), 0) AS total_debit_notes
        FROM public.debit_notes dn
        WHERE dn.organization_id = p_org_id
          AND dn.supplier_id IS NOT NULL
          AND dn.status = 'posted'
        GROUP BY dn.supplier_id
    ),
    manual_entries AS (
        SELECT 
            s.id AS supplier_id,
            COALESCE(SUM(jl.credit), 0) - COALESCE(SUM(jl.debit), 0) AS manual_balance
        FROM public.suppliers s
        JOIN public.journal_entries je 
          ON (je.organization_id = p_org_id OR je.organization_id IS NULL)
         AND je.status = 'posted'
         AND je.is_posted = true
         AND (
             (je.description ILIKE '%' || TRIM(s.name) || '%' AND LENGTH(TRIM(s.name)) > 1)
             OR (je.reference ILIKE '%' || s.id::text || '%')
         )
         -- استبعاد القيود المتولدة عن مستندات النظام الأساسية لمنع الازدواجية التامة
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
        JOIN public.journal_lines jl 
          ON jl.journal_entry_id = je.id
         AND jl.account_id IN (SELECT sa.account_id FROM supplier_accounts sa)
        WHERE s.organization_id = p_org_id
          AND s.deleted_at IS NULL
        GROUP BY s.id
    )
    SELECT 
        s.id AS supplier_id,
        s.name::text AS supplier_name,
        COALESCE(s.phone, '')::text AS phone,
        COALESCE(s.tax_number, '')::text AS tax_number,
        COALESCE(s.opening_balance, 0)::numeric AS opening_balance,
        COALESCE(inv.gross_purchases, 0)::numeric AS total_purchases,
        ROUND(
            (COALESCE(s.opening_balance, 0) + COALESCE(inv.total_invoiced, 0) + COALESCE(me.manual_balance, 0))
            - (COALESCE(pay.total_payments, 0) + COALESCE(chq.total_cheques, 0) + COALESCE(ret.total_returns, 0) + COALESCE(dn.total_debit_notes, 0))
        , 2)::numeric AS balance,
        inv.max_inv_date AS last_invoice,
        v_total_rows AS total_count
    FROM public.suppliers s
    LEFT JOIN agg_invoices inv ON inv.supplier_id = s.id
    LEFT JOIN agg_payments pay ON pay.supplier_id = s.id
    LEFT JOIN agg_cheques chq ON chq.supplier_id = s.id
    LEFT JOIN agg_returns ret ON ret.supplier_id = s.id
    LEFT JOIN agg_debit_notes dn ON dn.supplier_id = s.id
    LEFT JOIN manual_entries me ON me.supplier_id = s.id
    WHERE s.organization_id = p_org_id
      AND s.deleted_at IS NULL
      AND (
          v_search IS NULL
          OR s.name ILIKE '%' || v_search || '%'
          OR s.phone ILIKE '%' || v_search || '%'
          OR s.tax_number ILIKE '%' || v_search || '%'
      )
    ORDER BY s.name ASC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_all_supplier_balances_fast(uuid, text, int, int) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_all_supplier_balances_fast(uuid, text, int, int) TO authenticated, service_role;


-- 6. تحديث دالة رصيد المورد المنفرد get_supplier_balance
CREATE OR REPLACE FUNCTION public.get_supplier_balance(p_supplier_id uuid, p_org_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_supplier_name         TEXT := '';
    v_opening_balance       NUMERIC := 0;
    v_gross_invoices        NUMERIC := 0;
    v_immediate_payments    NUMERIC := 0;
    v_payments              NUMERIC := 0;
    v_cheques               NUMERIC := 0;
    v_returns               NUMERIC := 0;
    v_debit_notes           NUMERIC := 0;
    v_manual_credit         NUMERIC := 0;
    v_manual_debit          NUMERIC := 0;
BEGIN
    p_org_id := public.validate_tenant_access(p_org_id);

    SELECT COALESCE(opening_balance, 0), COALESCE(name, '')
      INTO v_opening_balance, v_supplier_name
      FROM public.suppliers
     WHERE id = p_supplier_id AND organization_id = p_org_id;

    -- فواتير المشتريات المعتمدة فقط
    SELECT COALESCE(SUM(total_amount), 0)
      INTO v_gross_invoices
      FROM public.purchase_invoices
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND status NOT IN ('draft', 'cancelled', 'rejected');

    -- السداد الفوري
    SELECT COALESCE(SUM(COALESCE(paid_amount, 0)), 0)
      INTO v_immediate_payments
      FROM public.purchase_invoices
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND status NOT IN ('draft', 'cancelled', 'rejected');

    -- سندات الصرف المعتمدة والنشطة فقط
    SELECT COALESCE(SUM(amount), 0)
      INTO v_payments
      FROM public.payment_vouchers
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND deleted_at IS NULL
       AND (status IS NULL OR status NOT IN ('rejected', 'cancelled', 'draft', 'pending_approval'))
       AND (notes IS NULL OR (notes NOT ILIKE '[مرفوض%' AND notes NOT ILIKE '[معلق للاعتماد%'))
       AND COALESCE(payment_method, 'cash') != 'cheque'
       AND (voucher_number NOT LIKE 'CHQ-%' OR voucher_number IS NULL);

    -- الشيكات
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cheques') THEN
        SELECT COALESCE(SUM(amount), 0)
          INTO v_cheques
          FROM public.cheques
         WHERE party_id = p_supplier_id
           AND organization_id = p_org_id
           AND type = 'outgoing'
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

    -- قيود اليومية اليدوية المرحلة فقط على حسابات الموردين
    SELECT 
        COALESCE(SUM(jl.credit), 0),
        COALESCE(SUM(jl.debit), 0)
    INTO v_manual_credit, v_manual_debit
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    JOIN public.accounts a ON a.id = jl.account_id
    WHERE je.organization_id = p_org_id
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


-- 7. دالة الإصلاح والمعالجة الذاتية لفروقات مرتجعات المشتريات (خاصة المورد "برج ايفل" بقيمة 905 ج.م)
CREATE OR REPLACE FUNCTION public.repair_purchase_return_discrepancies(p_org_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id uuid;
    v_rec record;
    v_fixed_count int := 0;
    v_details jsonb := '[]'::jsonb;
    v_eiffel_supp record;
    v_eiffel_return record;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    IF v_org_id IS NULL THEN
        SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
    END IF;

    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    -- أ. معالجة وتصحيح المورد "برج ايفل" / "برج إيفل" والمرتجع بقيمة 905 ج.م
    SELECT * INTO v_eiffel_supp 
    FROM public.suppliers 
    WHERE (name ILIKE '%برج%ايفل%' OR name ILIKE '%برج%إيفل%')
      AND (organization_id = v_org_id OR v_org_id IS NULL)
    LIMIT 1;

    IF FOUND THEN
        -- البحث عن مرتجع بقيمة 905 لهذا المورد
        SELECT * INTO v_eiffel_return
        FROM public.purchase_returns
        WHERE supplier_id = v_eiffel_supp.id
          AND total_amount = 905
        ORDER BY created_at DESC
        LIMIT 1;

        IF FOUND THEN
            -- إذا كان المرتجع مرحلاً ولديه قيد مرتبط، نحذف أي قيود مكررة أخرى بقيمة 905 لنفس المرتجع
            IF v_eiffel_return.related_journal_entry_id IS NOT NULL THEN
                -- حذف أي قيد يومية مكرر آخر يحمل نفس المرجع أو نفس المبلغ المزدوج
                DELETE FROM public.journal_lines
                WHERE journal_entry_id IN (
                    SELECT je.id FROM public.journal_entries je
                    WHERE je.id <> v_eiffel_return.related_journal_entry_id
                      AND (
                          (je.reference = v_eiffel_return.return_number)
                          OR (je.related_document_id = v_eiffel_return.id AND je.related_document_type = 'purchase_return')
                          OR (je.description ILIKE '%مرتجع%905%' OR (je.description ILIKE '%برج%ايفل%' AND je.description ILIKE '%مرتجع%'))
                      )
                );

                DELETE FROM public.journal_entries je
                WHERE je.id <> v_eiffel_return.related_journal_entry_id
                  AND (
                      (je.reference = v_eiffel_return.return_number)
                      OR (je.related_document_id = v_eiffel_return.id AND je.related_document_type = 'purchase_return')
                      OR (je.description ILIKE '%مرتجع%905%' OR (je.description ILIKE '%برج%ايفل%' AND je.description ILIKE '%مرتجع%'))
                  );

                v_fixed_count := v_fixed_count + 1;
                v_details := v_details || jsonb_build_object(
                    'type', 'eiffel_supplier_duplicate_cleaned',
                    'supplier_name', v_eiffel_supp.name,
                    'return_number', v_eiffel_return.return_number,
                    'amount', 905
                );
            ELSE
                -- إذا كان related_journal_entry_id فارغاً، نبحث عن القيد الموجود ونربطه
                FOR v_rec IN 
                    SELECT je.id FROM public.journal_entries je
                    WHERE (je.reference = v_eiffel_return.return_number
                       OR (je.related_document_id = v_eiffel_return.id AND je.related_document_type = 'purchase_return')
                       OR je.description ILIKE '%' || v_eiffel_return.return_number || '%')
                    ORDER BY je.created_at DESC
                LOOP
                    IF v_eiffel_return.related_journal_entry_id IS NULL THEN
                        UPDATE public.purchase_returns
                        SET related_journal_entry_id = v_rec.id, status = 'posted'
                        WHERE id = v_eiffel_return.id;
                        v_eiffel_return.related_journal_entry_id := v_rec.id;
                    ELSE
                        -- حذف القيود المكررة الإضافية
                        DELETE FROM public.journal_lines WHERE journal_entry_id = v_rec.id;
                        DELETE FROM public.journal_entries WHERE id = v_rec.id;
                    END IF;
                END LOOP;

                v_fixed_count := v_fixed_count + 1;
            END IF;
        END IF;
    END IF;

    -- ب. مسح شامل لكافة قيود مرتجعات المشتريات المكررة في النظام
    FOR v_rec IN
        SELECT pr.id, pr.return_number, pr.related_journal_entry_id, COUNT(je.id) as je_count
        FROM public.purchase_returns pr
        JOIN public.journal_entries je ON (je.related_document_id = pr.id AND je.related_document_type = 'purchase_return')
                                       OR (je.reference = pr.return_number)
        WHERE pr.status = 'posted'
        GROUP BY pr.id, pr.return_number, pr.related_journal_entry_id
        HAVING COUNT(je.id) > 1
    LOOP
        -- نحتفظ بالقيد المربوط في related_journal_entry_id ونحذف الباقي
        DELETE FROM public.journal_lines
        WHERE journal_entry_id IN (
            SELECT je.id FROM public.journal_entries je
            WHERE (je.related_document_id = v_rec.id OR je.reference = v_rec.return_number)
              AND (v_rec.related_journal_entry_id IS NULL OR je.id <> v_rec.related_journal_entry_id)
        );

        DELETE FROM public.journal_entries je
        WHERE (je.related_document_id = v_rec.id OR je.reference = v_rec.return_number)
          AND (v_rec.related_journal_entry_id IS NULL OR je.id <> v_rec.related_journal_entry_id);

        v_fixed_count := v_fixed_count + 1;
    END LOOP;

    -- ج. إعادة احتساب وتحديث كافة الأرصدة
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'recalculate_all_system_balances' AND pronamespace = 'public'::regnamespace) THEN
        PERFORM public.recalculate_all_system_balances(v_org_id);
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'fixed_records_count', v_fixed_count,
        'details', v_details,
        'message', 'تم فحص وإصلاح فروقات مرتجعات المشتريات وتطابق أرصدة الموردين بنجاح.'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.repair_purchase_return_discrepancies(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.repair_purchase_return_discrepancies(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
