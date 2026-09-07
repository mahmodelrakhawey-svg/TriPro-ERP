-- ==============================================================================
-- 🏟️ تحديث دوال مطابقة أرصدة العملاء والموردين لدمج مديول الاستاد الرياضي
-- التاريخ: 2026-08-23
-- الغرض: توحيد منطق حساب أرصدة العملاء والموردين في قاعدة البيانات لدعم مديول الاستاد
-- ==============================================================================

BEGIN;

-- 1. دالة حساب رصيد العميل مع دعم مديول الاستاد والشيكات بالاسم
CREATE OR REPLACE FUNCTION public.get_customer_balance(p_customer_id uuid, p_org_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_opening_balance       NUMERIC := 0;
    v_gross_invoices        NUMERIC := 0;  -- إجمالي الفواتير
    v_immediate_payments    NUMERIC := 0;  -- تحصيل فوري من الفواتير
    v_project_billings      NUMERIC := 0;  -- مستخلصات مشاريع المقاولات
    v_receipts              NUMERIC := 0;  -- سندات القبض المستقلة (غير الشيكات)
    v_cheques               NUMERIC := 0;  -- شيكات واردة غير مرفوضة
    v_returns               NUMERIC := 0;  -- مرتجعات مبيعات
    v_credit_notes          NUMERIC := 0;  -- إشعارات دائنة
    v_cust_name             TEXT := '';
BEGIN
    -- أ. الرصيد الافتتاحي واسم العميل
    SELECT COALESCE(opening_balance, 0), COALESCE(name, '')
      INTO v_opening_balance, v_cust_name
      FROM public.customers
     WHERE id = p_customer_id AND organization_id = p_org_id;

    -- ب. إجمالي فواتير البيع المرحلة
    SELECT COALESCE(SUM(total_amount), 0)
      INTO v_gross_invoices
      FROM public.invoices
     WHERE customer_id = p_customer_id
       AND organization_id = p_org_id
       AND status NOT IN ('draft', 'cancelled');

    -- ج. المبالغ المحصلة فوراً من داخل الفواتير
    SELECT COALESCE(SUM(COALESCE(paid_amount, 0)), 0)
      INTO v_immediate_payments
      FROM public.invoices
     WHERE customer_id = p_customer_id
       AND organization_id = p_org_id
       AND status NOT IN ('draft', 'cancelled');

    -- د. مستخلصات مشاريع المقاولات
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'project_progress_billings'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'customer_id'
    ) THEN
        SELECT COALESCE(SUM(ppb.net_amount), 0)
          INTO v_project_billings
          FROM public.project_progress_billings ppb
          JOIN public.projects pr ON ppb.project_id = pr.id
         WHERE pr.customer_id = p_customer_id
           AND pr.organization_id = p_org_id
           AND ppb.status NOT IN ('draft', 'cancelled');
    END IF;

    -- هـ. سندات القبض المستقلة
    SELECT COALESCE(SUM(amount), 0)
      INTO v_receipts
      FROM public.receipt_vouchers
     WHERE customer_id = p_customer_id
       AND organization_id = p_org_id
       AND COALESCE(payment_method, 'cash') != 'cheque'
       AND (voucher_number NOT LIKE 'CHQ-%' OR voucher_number IS NULL);

    -- و. الشيكات الواردة غير المرفوضة (بما فيها شيكات الاستاد المطابقة بالاسم أو المعرف)
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'cheques'
    ) THEN
        SELECT COALESCE(SUM(amount), 0)
          INTO v_cheques
          FROM public.cheques
         WHERE organization_id = p_org_id
           AND type = 'incoming'
           AND status != 'rejected'
           AND (
             party_id = p_customer_id
             OR (v_cust_name != '' AND party_name ILIKE '%' || v_cust_name || '%')
           );
    END IF;

    -- ز. مرتجعات المبيعات
    SELECT COALESCE(SUM(total_amount), 0)
      INTO v_returns
      FROM public.sales_returns
     WHERE customer_id = p_customer_id
       AND organization_id = p_org_id
       AND status NOT IN ('draft', 'cancelled');

    -- ح. الإشعارات الدائنة
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'credit_notes'
    ) THEN
        SELECT COALESCE(SUM(total_amount), 0)
          INTO v_credit_notes
          FROM public.credit_notes
         WHERE customer_id = p_customer_id
           AND organization_id = p_org_id
           AND status = 'posted';
    END IF;

    RETURN v_opening_balance
         + v_gross_invoices
         + v_project_billings
         - v_immediate_payments
         - v_receipts
         - v_cheques
         - v_returns
         - v_credit_notes;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_customer_balance(uuid, uuid) TO authenticated;

-- 2. دالة حساب رصيد المورد مع دعم مديول الاستاد
CREATE OR REPLACE FUNCTION public.get_supplier_balance(p_supplier_id uuid, p_org_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_opening_balance       NUMERIC := 0;
    v_gross_purchases       NUMERIC := 0;  -- إجمالي فواتير الشراء
    v_immediate_payments    NUMERIC := 0;  -- سداد فوري من الفواتير
    v_subcontractor_bills   NUMERIC := 0;  -- مستخلصات مقاولي الباطن
    v_payments              NUMERIC := 0;  -- سندات الصرف المستقلة (غير الشيكات)
    v_cheques               NUMERIC := 0;  -- شيكات صادرة غير مرفوضة
    v_returns               NUMERIC := 0;  -- مرتجعات مشتريات
    v_debit_notes           NUMERIC := 0;  -- إشعارات مدينة
    v_supp_name             TEXT := '';
BEGIN
    -- أ. الرصيد الافتتاحي واسم المورد
    SELECT COALESCE(opening_balance, 0), COALESCE(name, '')
      INTO v_opening_balance, v_supp_name
      FROM public.suppliers
     WHERE id = p_supplier_id AND organization_id = p_org_id;

    -- ب. إجمالي فواتير الشراء المرحلة
    SELECT COALESCE(SUM(total_amount), 0)
      INTO v_gross_purchases
      FROM public.purchase_invoices
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND status NOT IN ('draft', 'cancelled');

    -- ج. المبالغ المسددة فوراً من داخل الفواتير
    SELECT COALESCE(SUM(COALESCE(paid_amount, 0)), 0)
      INTO v_immediate_payments
      FROM public.purchase_invoices
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND status NOT IN ('draft', 'cancelled');

    -- د. مستخلصات مقاولي الباطن
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'subcontractor_billings'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'subcontractors' AND column_name = 'supplier_id'
    ) THEN
        SELECT COALESCE(SUM(sb.net_amount), 0)
          INTO v_subcontractor_bills
          FROM public.subcontractor_billings sb
          JOIN public.subcontractor_contracts sc ON sb.contract_id = sc.id
          JOIN public.subcontractors s ON sc.subcontractor_id = s.id
         WHERE s.supplier_id = p_supplier_id
           AND sb.organization_id = p_org_id
           AND sb.status NOT IN ('draft', 'cancelled');
    END IF;

    -- هـ. سندات الصرف المستقلة
    SELECT COALESCE(SUM(amount), 0)
      INTO v_payments
      FROM public.payment_vouchers
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND COALESCE(payment_method, 'cash') != 'cheque'
       AND (voucher_number NOT LIKE 'CHQ-%' OR voucher_number IS NULL);

    -- و. الشيكات الصادرة غير المرفوضة
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'cheques'
    ) THEN
        SELECT COALESCE(SUM(amount), 0)
          INTO v_cheques
          FROM public.cheques
         WHERE organization_id = p_org_id
           AND type = 'outgoing'
           AND status != 'rejected'
           AND (
             party_id = p_supplier_id
             OR (v_supp_name != '' AND party_name ILIKE '%' || v_supp_name || '%')
           );
    END IF;

    -- ز. مرتجعات المشتريات
    SELECT COALESCE(SUM(total_amount), 0)
      INTO v_returns
      FROM public.purchase_returns
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND status NOT IN ('draft', 'cancelled');

    -- ح. الإشعارات المدينة
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'debit_notes'
    ) THEN
        SELECT COALESCE(SUM(total_amount), 0)
          INTO v_debit_notes
          FROM public.debit_notes
         WHERE supplier_id = p_supplier_id
           AND organization_id = p_org_id
           AND status = 'posted';
    END IF;

    RETURN v_opening_balance
         + v_gross_purchases
         + v_subcontractor_bills
         - v_immediate_payments
         - v_payments
         - v_cheques
         - v_returns
         - v_debit_notes;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_supplier_balance(uuid, uuid) TO authenticated;

COMMIT;
