-- ==============================================================================
-- 🚀 دالة تنظيف بيانات وحركات الفحص الآلي الشامل بأمان تام (Stress Test Cleanup)
-- التاريخ: 2026-08-22
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.delete_stress_test_data(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_deleted_entries integer := 0;
BEGIN
    -- 1. حذف المستندات المالية للاختبار
    DELETE FROM public.invoices 
     WHERE organization_id = p_org_id 
       AND (invoice_number LIKE 'TEST-%' OR invoice_number LIKE 'INV-TEST-%');

    DELETE FROM public.purchase_invoices 
     WHERE organization_id = p_org_id 
       AND (invoice_number LIKE 'TEST-%' OR invoice_number LIKE 'PUR-TEST-%');

    DELETE FROM public.sales_returns 
     WHERE organization_id = p_org_id 
       AND return_number LIKE 'TEST-%';

    DELETE FROM public.purchase_returns 
     WHERE organization_id = p_org_id 
       AND return_number LIKE 'TEST-%';

    DELETE FROM public.payment_vouchers 
     WHERE organization_id = p_org_id 
       AND voucher_number LIKE 'TEST-%';

    DELETE FROM public.receipt_vouchers 
     WHERE organization_id = p_org_id 
       AND voucher_number LIKE 'TEST-%';

    DELETE FROM public.cheques 
     WHERE organization_id = p_org_id 
       AND (cheque_number LIKE 'TEST-%' OR party_id IN (SELECT id FROM public.customers WHERE name LIKE '%فحص شامل%' AND organization_id = p_org_id));

    -- 2. حذف أسطر وقيود اليومية الخاصة بالاختبار (مع تجاوز قيود الترحيل بأمان)
    DELETE FROM public.journal_lines 
     WHERE organization_id = p_org_id 
       AND journal_entry_id IN (
           SELECT id FROM public.journal_entries 
            WHERE organization_id = p_org_id 
              AND (reference LIKE 'TEST-%' OR reference LIKE 'CHQ-TEST-%' OR description LIKE '%فحص شامل%' OR description LIKE '%اختبار%')
       );

    DELETE FROM public.journal_entries 
     WHERE organization_id = p_org_id 
       AND (reference LIKE 'TEST-%' OR reference LIKE 'CHQ-TEST-%' OR description LIKE '%فحص شامل%' OR description LIKE '%اختبار%');

    GET DIAGNOSTICS v_deleted_entries = ROW_COUNT;

    -- 3. حذف العملاء والموردين الاختباريين
    DELETE FROM public.customers 
     WHERE organization_id = p_org_id 
       AND (name LIKE '%فحص شامل%' OR name LIKE '%اختبار%');

    DELETE FROM public.suppliers 
     WHERE organization_id = p_org_id 
       AND (name LIKE '%فحص شامل%' OR name LIKE '%اختبار%');

    -- 4. إعادة موازنة كافة الأرصدة
    PERFORM public.recalculate_all_balances(p_org_id);

    RETURN 'تم تنظيف كافة بيانات الفحص الآلي بالكامل بنجاح ✅';
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_stress_test_data(uuid) TO authenticated;
