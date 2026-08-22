-- ==============================================================================
-- 🚀 إصلاح دالة get_supplier_balance ودعم الحذف الآمن لقيود اليومية
-- التاريخ: 2026-08-22
-- ==============================================================================

-- 1. تصحيح دالة get_supplier_balance (استبدال subcontract_id بـ contract_id)
CREATE OR REPLACE FUNCTION public.get_supplier_balance(p_supplier_id uuid, p_org_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_opening_balance       NUMERIC := 0;
    v_gross_invoices        NUMERIC := 0;
    v_immediate_payments    NUMERIC := 0;
    v_sub_billings          NUMERIC := 0;
    v_payments              NUMERIC := 0;
    v_cheques               NUMERIC := 0;
    v_returns               NUMERIC := 0;
    v_debit_notes           NUMERIC := 0;
BEGIN
    -- أ. الرصيد الافتتاحي للمورد
    SELECT COALESCE(opening_balance, 0)
      INTO v_opening_balance
      FROM public.suppliers
     WHERE id = p_supplier_id AND organization_id = p_org_id;

    -- ب. إجمالي فواتير المشتريات المرحلة
    SELECT COALESCE(SUM(total_amount), 0)
      INTO v_gross_invoices
      FROM public.purchase_invoices
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND status NOT IN ('draft', 'cancelled');

    -- ج. المبالغ المسددة فوراً من داخل فواتير المشتريات
    SELECT COALESCE(SUM(COALESCE(paid_amount, 0)), 0)
      INTO v_immediate_payments
      FROM public.purchase_invoices
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND status NOT IN ('draft', 'cancelled');

    -- د. مستخلصات مقاولي الباطن المرتبطين بهذا المورد
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'subcontractor_billings'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'subcontractors' AND column_name = 'supplier_id'
    ) THEN
        SELECT COALESCE(SUM(sb.net_amount), 0)
          INTO v_sub_billings
          FROM public.subcontractor_billings sb
          JOIN public.subcontractor_contracts sc ON (sb.contract_id = sc.id)
          JOIN public.subcontractors s ON sc.subcontractor_id = s.id
         WHERE s.supplier_id = p_supplier_id
           AND sb.organization_id = p_org_id
           AND sb.status NOT IN ('draft', 'cancelled');
    END IF;

    -- هـ. سندات الصرف المستقلة (غير الشيكات)
    SELECT COALESCE(SUM(amount), 0)
      INTO v_payments
      FROM public.payment_vouchers
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND payment_method != 'cheque';

    -- و. الشيكات الصادرة غير المرفوضة
    SELECT COALESCE(SUM(amount), 0)
      INTO v_cheques
      FROM public.cheques
     WHERE party_id = p_supplier_id
       AND organization_id = p_org_id
       AND type = 'outgoing'
       AND status != 'rejected';

    -- ز. مرتجعات المشتريات
    SELECT COALESCE(SUM(total_amount), 0)
      INTO v_returns
      FROM public.purchase_returns
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND status NOT IN ('draft', 'cancelled');

    -- ح. الإشعارات المدينة
    SELECT COALESCE(SUM(total_amount), 0)
      INTO v_debit_notes
      FROM public.debit_notes
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND status = 'posted';

    -- المعادلة النهائية
    RETURN (v_opening_balance + v_gross_invoices + v_sub_billings) 
         - (v_immediate_payments + v_payments + v_cheques + v_returns + v_debit_notes);
END;
$$;

-- 2. دالة الحذف الآمن لقيد اليومية (مع تجاوز قيود الحماية وتحديث الأرصدة)
CREATE OR REPLACE FUNCTION public.delete_journal_entry_safe(p_entry_id uuid, p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- أ. حذف الأسطر أولاً
    DELETE FROM public.journal_lines 
     WHERE journal_entry_id = p_entry_id 
       AND organization_id = p_org_id;

    -- ب. حذف رأس القيد
    DELETE FROM public.journal_entries 
     WHERE id = p_entry_id 
       AND organization_id = p_org_id;

    -- ج. إعادة موازنة الأرصدة
    PERFORM public.recalculate_all_balances(p_org_id);

    RETURN 'تم حذف القيد المحاسبي وتحديث الأرصدة بنجاح ✅';
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_journal_entry_safe(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_supplier_balance(uuid, uuid) TO authenticated;
