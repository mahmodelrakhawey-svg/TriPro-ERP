-- 🛠️ سكربت إصلاح وتوحيد أرصدة العملاء والموردين وتنبيهات حد الائتمان
-- يقوم هذا السكربت بإعادة بناء دوال احتساب الأرصدة وتنبيهات حد الائتمان لضمان دقتها 100%
-- وربط مشغلات تلقائية لتحديث الأرصدة فورياً عند أي حركة مالية.

BEGIN;

-- 1. دالة حساب رصيد العميل المحدثة (تطابق كشف الحساب)
CREATE OR REPLACE FUNCTION public.get_customer_balance(p_customer_id uuid, p_org_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_balance numeric := 0;
    v_opening_balance numeric := 0;
    v_invoices numeric := 0;
    v_receipts numeric := 0;
    v_returns numeric := 0;
    v_credit_notes numeric := 0;
    v_cheques numeric := 0;
BEGIN
    -- أ. الرصيد الافتتاحي للعميل
    SELECT COALESCE(opening_balance, 0) INTO v_opening_balance
    FROM public.customers
    WHERE id = p_customer_id AND organization_id = p_org_id;

    -- ب. إجمالي الفواتير المرحلة وغير المسودة (مدين +) - (المبلغ المدفوع فورياً عند إنشاء الفاتورة)
    SELECT COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0) INTO v_invoices
    FROM public.invoices
    WHERE customer_id = p_customer_id AND organization_id = p_org_id 
      AND status IN ('posted', 'paid', 'partial')
      AND related_journal_entry_id IS NOT NULL;

    -- ج. إجمالي سندات القبض المرحلة (دائن -)
    SELECT COALESCE(SUM(amount), 0) INTO v_receipts
    FROM public.receipt_vouchers
    WHERE customer_id = p_customer_id AND organization_id = p_org_id
      AND related_journal_entry_id IS NOT NULL
      AND (voucher_number NOT LIKE 'DEP-%' OR voucher_number IS NULL);

    -- د. إجمالي مرتجعات المبيعات المرحلة (دائن -)
    SELECT COALESCE(SUM(total_amount), 0) INTO v_returns
    FROM public.sales_returns
    WHERE customer_id = p_customer_id AND organization_id = p_org_id 
      AND status = 'posted'
      AND related_journal_entry_id IS NOT NULL;

    -- هـ. إجمالي الإشعارات الدائنة المرحلة (دائن -)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'credit_notes') THEN
        SELECT COALESCE(SUM(total_amount), 0) INTO v_credit_notes
        FROM public.credit_notes
        WHERE customer_id = p_customer_id AND organization_id = p_org_id 
          AND status = 'posted'
          AND related_journal_entry_id IS NOT NULL;
    END IF;

    -- و. إجمالي الشيكات الواردة غير المرفوضة (دائن -)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cheques') THEN
        SELECT COALESCE(SUM(amount), 0) INTO v_cheques
        FROM public.cheques
        WHERE party_id = p_customer_id AND organization_id = p_org_id 
          AND type = 'incoming' AND status != 'rejected'
          AND related_journal_entry_id IS NOT NULL;
    END IF;

    -- الرصيد النهائي للعميل
    v_balance := v_opening_balance + v_invoices - v_receipts - v_returns - v_credit_notes - v_cheques;
    RETURN v_balance;
END; $$;

-- 2. دالة حساب رصيد المورد المحدثة (تطابق كشف الحساب)
CREATE OR REPLACE FUNCTION public.get_supplier_balance(p_supplier_id uuid, p_org_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_balance numeric := 0;
    v_opening_balance numeric := 0;
    v_invoices numeric := 0;
    v_payments numeric := 0;
    v_returns numeric := 0;
    v_debit_notes numeric := 0;
BEGIN
    -- أ. الرصيد الافتتاحي للمورد
    SELECT COALESCE(opening_balance, 0) INTO v_opening_balance
    FROM public.suppliers
    WHERE id = p_supplier_id AND organization_id = p_org_id;

    -- ب. إجمالي فواتير المشتريات المرحلة (دائن +)
    SELECT COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0) INTO v_invoices
    FROM public.purchase_invoices
    WHERE supplier_id = p_supplier_id AND organization_id = p_org_id 
      AND status IN ('posted', 'paid', 'partial')
      AND related_journal_entry_id IS NOT NULL;

    -- ج. إجمالي سندات الصرف المرحلة (مدين -)
    SELECT COALESCE(SUM(amount), 0) INTO v_payments
    FROM public.payment_vouchers
    WHERE supplier_id = p_supplier_id AND organization_id = p_org_id
      AND related_journal_entry_id IS NOT NULL;

    -- د. إجمالي مرتجعات المشتريات المرحلة (مدين -)
    SELECT COALESCE(SUM(total_amount), 0) INTO v_returns
    FROM public.purchase_returns
    WHERE supplier_id = p_supplier_id AND organization_id = p_org_id 
      AND status = 'posted'
      AND related_journal_entry_id IS NOT NULL;

    -- هـ. إجمالي الإشعارات المدينة المرحلة (مدين -)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'debit_notes') THEN
        SELECT COALESCE(SUM(total_amount), 0) INTO v_debit_notes
        FROM public.debit_notes
        WHERE supplier_id = p_supplier_id AND organization_id = p_org_id 
          AND status = 'posted'
          AND related_journal_entry_id IS NOT NULL;
    END IF;

    -- الرصيد النهائي للمورد
    v_balance := v_opening_balance + v_invoices - v_payments - v_returns - v_debit_notes;
    RETURN v_balance;
END; $$;

-- 3. تحديث دالة تنبيه حد الائتمان (تستبعد حد 0 وتستخدم الحساب المحدث)
DROP FUNCTION IF EXISTS public.get_over_limit_customers(uuid);
CREATE OR REPLACE FUNCTION public.get_over_limit_customers(p_org_id uuid)
RETURNS TABLE (
    id uuid,
    name text,
    phone text,
    total_debt numeric,
    credit_limit numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT c.id, c.name, c.phone, COALESCE(c.balance, 0) as total_debt, COALESCE(c.credit_limit, 0) as credit_limit
    FROM public.customers c
    WHERE c.organization_id = p_org_id 
      AND COALESCE(c.credit_limit, 0) > 0 
      AND COALESCE(c.balance, 0) > COALESCE(c.credit_limit, 0) 
      AND (c.deleted_at IS NULL);
END;
$$;

-- 4. تحديث دالة إعادة احتساب كافة الأرصدة لتستخدم المنطق المحدث
CREATE OR REPLACE FUNCTION public.recalculate_all_balances(p_org_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_id uuid;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    IF v_org_id IS NULL THEN RETURN; END IF;

    -- أ. تحديث أرصدة الحسابات العامة (دفتر الأستاذ العام)
    UPDATE public.accounts a
    SET balance = (
        SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON jl.journal_entry_id = je.id
        WHERE jl.account_id = a.id 
          AND je.status = 'posted'
          AND je.organization_id = v_org_id
    )
    WHERE a.organization_id = v_org_id;

    -- ب. تحديث أرصدة العملاء بناءً على الميزان الجديد
    UPDATE public.customers c
    SET balance = public.get_customer_balance(c.id, v_org_id)
    WHERE c.organization_id = v_org_id;

    -- ج. تحديث أرصدة الموردين بناءً على الميزان الجديد
    UPDATE public.suppliers s
    SET balance = public.get_supplier_balance(s.id, v_org_id)
    WHERE s.organization_id = v_org_id;
    
    -- د. إعادة حساب كميات وتكاليف المخزون
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- 5. إنشاء مشغل التزامن الفوري للطرفين (العميل والمورد) عند أي عملية مالية
CREATE OR REPLACE FUNCTION public.sync_partner_balance_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_partner_id uuid;
    v_org_id uuid;
    v_is_customer boolean := true;
BEGIN
    IF TG_TABLE_NAME = 'cheques' THEN
        IF TG_OP = 'DELETE' THEN
            v_partner_id := OLD.party_id;
            v_org_id := OLD.organization_id;
        ELSE
            v_partner_id := NEW.party_id;
            v_org_id := NEW.organization_id;
        END IF;
        IF EXISTS (SELECT 1 FROM public.suppliers WHERE id = v_partner_id) THEN
            v_is_customer := false;
        END IF;
    ELSIF TG_TABLE_NAME IN ('purchase_invoices', 'payment_vouchers', 'purchase_returns', 'debit_notes') THEN
        v_is_customer := false;
        IF TG_OP = 'DELETE' THEN
            v_partner_id := OLD.supplier_id;
            v_org_id := OLD.organization_id;
        ELSE
            v_partner_id := NEW.supplier_id;
            v_org_id := NEW.organization_id;
        END IF;
    ELSE
        IF TG_OP = 'DELETE' THEN
            v_partner_id := OLD.customer_id;
            v_org_id := OLD.organization_id;
        ELSE
            v_partner_id := NEW.customer_id;
            v_org_id := NEW.organization_id;
        END IF;
    END IF;

    IF v_partner_id IS NOT NULL AND v_org_id IS NOT NULL THEN
        IF v_is_customer THEN
            UPDATE public.customers 
            SET balance = public.get_customer_balance(v_partner_id, v_org_id)
            WHERE id = v_partner_id;
        ELSE
            UPDATE public.suppliers 
            SET balance = public.get_supplier_balance(v_partner_id, v_org_id)
            WHERE id = v_partner_id;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. ربط المشغل بالجداول المعنية
-- أ. جداول العملاء
DROP TRIGGER IF EXISTS trg_sync_customer_balance_invoice ON public.invoices;
CREATE TRIGGER trg_sync_customer_balance_invoice
AFTER INSERT OR UPDATE OR DELETE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.sync_partner_balance_trigger();

DROP TRIGGER IF EXISTS trg_sync_customer_balance_receipt ON public.receipt_vouchers;
CREATE TRIGGER trg_sync_customer_balance_receipt
AFTER INSERT OR UPDATE OR DELETE ON public.receipt_vouchers
FOR EACH ROW EXECUTE FUNCTION public.sync_partner_balance_trigger();

DROP TRIGGER IF EXISTS trg_sync_customer_balance_return ON public.sales_returns;
CREATE TRIGGER trg_sync_customer_balance_return
AFTER INSERT OR UPDATE OR DELETE ON public.sales_returns
FOR EACH ROW EXECUTE FUNCTION public.sync_partner_balance_trigger();

-- ب. جداول الموردين
DROP TRIGGER IF EXISTS trg_sync_supplier_balance_invoice ON public.purchase_invoices;
CREATE TRIGGER trg_sync_supplier_balance_invoice
AFTER INSERT OR UPDATE OR DELETE ON public.purchase_invoices
FOR EACH ROW EXECUTE FUNCTION public.sync_partner_balance_trigger();

DROP TRIGGER IF EXISTS trg_sync_supplier_balance_payment ON public.payment_vouchers;
CREATE TRIGGER trg_sync_supplier_balance_payment
AFTER INSERT OR UPDATE OR DELETE ON public.payment_vouchers
FOR EACH ROW EXECUTE FUNCTION public.sync_partner_balance_trigger();

DROP TRIGGER IF EXISTS trg_sync_supplier_balance_return ON public.purchase_returns;
CREATE TRIGGER trg_sync_supplier_balance_return
AFTER INSERT OR UPDATE OR DELETE ON public.purchase_returns
FOR EACH ROW EXECUTE FUNCTION public.sync_partner_balance_trigger();

-- ج. جدول الشيكات المشترك
DROP TRIGGER IF EXISTS trg_sync_partner_balance_cheque ON public.cheques;
CREATE TRIGGER trg_sync_partner_balance_cheque
AFTER INSERT OR UPDATE OR DELETE ON public.cheques
FOR EACH ROW EXECUTE FUNCTION public.sync_partner_balance_trigger();

-- د. تحديث تلقائي عند تعديل الأرصدة الافتتاحية للعملاء والموردين
CREATE OR REPLACE FUNCTION public.fn_sync_customer_opening_balance()
RETURNS TRIGGER AS $$
BEGIN
    NEW.balance := public.get_customer_balance(NEW.id, NEW.organization_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_customer_opening_balance ON public.customers;
CREATE TRIGGER trg_sync_customer_opening_balance
BEFORE INSERT OR UPDATE OF opening_balance ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_customer_opening_balance();

CREATE OR REPLACE FUNCTION public.fn_sync_supplier_opening_balance()
RETURNS TRIGGER AS $$
BEGIN
    NEW.balance := public.get_supplier_balance(NEW.id, NEW.organization_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_supplier_opening_balance ON public.suppliers;
CREATE TRIGGER trg_sync_supplier_opening_balance
BEFORE INSERT OR UPDATE OF opening_balance ON public.suppliers
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_supplier_opening_balance();

-- 7. تشغيل التحديث الشامل لكافة الأرصدة الآن لتصحيح البيانات الحالية
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id FROM public.organizations LOOP
        PERFORM public.recalculate_all_balances(r.id);
    END LOOP;
END $$;

-- 8. دالة تنظيف البيانات الكاملة للمنظمة للتخلص من البيانات التجريبية
CREATE OR REPLACE FUNCTION public.clear_organization_data_completely(p_org_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- 1. حذف بيانات التصنيع بذكاء
    EXECUTE 'DO $clear_mfg$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = ''mfg_batch_serials'') THEN
            DELETE FROM public.mfg_batch_serials WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.mfg_actual_material_usage WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.mfg_scrap_logs WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.mfg_production_variances WHERE organization_id = ' || quote_literal(p_org_id) || ';
        END IF;
        
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = ''mfg_qc_inspections'') THEN
            DELETE FROM public.mfg_qc_inspections WHERE organization_id = ' || quote_literal(p_org_id) || ';
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = ''mfg_material_requests'') THEN
            DELETE FROM public.mfg_material_request_items WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.mfg_material_requests WHERE organization_id = ' || quote_literal(p_org_id) || ';
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = ''mfg_production_orders'') THEN
            DELETE FROM public.mfg_order_progress WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.mfg_production_orders WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.mfg_step_materials WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.mfg_routing_steps WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.mfg_routings WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.mfg_work_centers WHERE organization_id = ' || quote_literal(p_org_id) || ';
        END IF;
    END $clear_mfg$;';

    DELETE FROM public.bill_of_materials WHERE organization_id = p_org_id;

    -- 2. حذف بيانات المقاولات والمشاريع
    EXECUTE 'DO $clear_const$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = ''project_material_issue_items'') THEN
            DELETE FROM public.project_material_issue_items WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.project_material_issues WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.project_daily_reports WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.project_custody_expenses WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.project_custodies WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.subcontractor_billings WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.subcontractor_contracts WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.subcontractors WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.project_progress_billings WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.project_boq WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.project_milestones WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.projects WHERE organization_id = ' || quote_literal(p_org_id) || ';
        END IF;
    END $clear_const$;';

    -- 3. حذف الفواتير والمستندات والقيود
    DELETE FROM public.invoice_items WHERE organization_id = p_org_id;
    DELETE FROM public.invoices WHERE organization_id = p_org_id;
    
    DELETE FROM public.purchase_invoice_items WHERE organization_id = p_org_id;
    DELETE FROM public.purchase_invoices WHERE organization_id = p_org_id;
    
    DELETE FROM public.sales_returns WHERE organization_id = p_org_id;
    DELETE FROM public.purchase_returns WHERE organization_id = p_org_id;
    
    DELETE FROM public.receipt_vouchers WHERE organization_id = p_org_id;
    DELETE FROM public.payment_vouchers WHERE organization_id = p_org_id;
    
    DELETE FROM public.order_items WHERE organization_id = p_org_id;
    DELETE FROM public.orders WHERE organization_id = p_org_id;
    
    DELETE FROM public.stock_adjustments WHERE organization_id = p_org_id;
    DELETE FROM public.opening_inventories WHERE organization_id = p_org_id;
    DELETE FROM public.cheques WHERE organization_id = p_org_id;
    DELETE FROM public.credit_notes WHERE organization_id = p_org_id;
    DELETE FROM public.debit_notes WHERE organization_id = p_org_id;
    DELETE FROM public.payrolls WHERE organization_id = p_org_id;
    DELETE FROM public.employee_advances WHERE organization_id = p_org_id;
    DELETE FROM public.assets WHERE organization_id = p_org_id;
    
    -- 4. حذف القيود الدفترية (Journal Entries)
    DELETE FROM public.journal_lines WHERE organization_id = p_org_id;
    DELETE FROM public.journal_entries WHERE organization_id = p_org_id;

    -- 5. حذف المنتجات والشركاء والموظفين
    DELETE FROM public.products WHERE organization_id = p_org_id;
    DELETE FROM public.customers WHERE organization_id = p_org_id;
    DELETE FROM public.suppliers WHERE organization_id = p_org_id;
    DELETE FROM public.employees WHERE organization_id = p_org_id;
    
    -- 6. حذف تهيئة المطاعم والورديات
    DELETE FROM public.restaurant_tables WHERE organization_id = p_org_id;
    DELETE FROM public.shifts WHERE organization_id = p_org_id;

    -- 7. إعادة احتساب الأرصدة للحسابات العامة إلى 0
    UPDATE public.accounts SET balance = 0 WHERE organization_id = p_org_id;

    RETURN 'تم تنظيف كافة بيانات المنظمة بالكامل والتخلص من البيانات التجريبية ✅';
END;
$$;

-- 9. دالة حذف بيانات العمليات والمنتجات التجريبية للاختبارات فقط (دون مسح البيانات الحقيقية)
CREATE OR REPLACE FUNCTION public.delete_unit_test_data(p_org_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- أ. حذف الحركات والتفاصيل للمنتجات والعملاء الخاصين بالاختبارات
    DELETE FROM public.invoice_items 
    WHERE organization_id = p_org_id 
      AND product_id IN (
          SELECT id FROM public.products 
          WHERE organization_id = p_org_id 
            AND name IN ('وجبة اختبار شامل', 'قهوة QR', 'بيتزا اختبار', 'Test Material Construction', 'حديد خام اختبار', 'باب حديد مصنع', 'Secret Product A', 'Panadol Test', 'خبز تجريبي', 'لحم تجريبي', 'وجبة برجر اختبارية')
      );
      
    DELETE FROM public.purchase_invoice_items 
    WHERE organization_id = p_org_id 
      AND product_id IN (
          SELECT id FROM public.products 
          WHERE organization_id = p_org_id 
            AND name IN ('وجبة اختبار شامل', 'قهوة QR', 'بيتزا اختبار', 'Test Material Construction', 'حديد خام اختبار', 'باب حديد مصنع', 'Secret Product A', 'Panadol Test', 'خبز تجريبي', 'لحم تجريبي', 'وجبة برجر اختبارية')
      );

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_material_issue_items') THEN
        DELETE FROM public.project_material_issue_items 
        WHERE product_id IN (
            SELECT id FROM public.products 
            WHERE organization_id = p_org_id 
              AND name IN ('وجبة اختبار شامل', 'قهوة QR', 'بيتزا اختبار', 'Test Material Construction', 'حديد خام اختبار', 'باب حديد مصنع', 'Secret Product A', 'Panadol Test', 'خبز تجريبي', 'لحم تجريبي', 'وجبة برجر اختبارية')
        );
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mfg_actual_material_usage') THEN
        DELETE FROM public.mfg_actual_material_usage 
        WHERE raw_material_id IN (
            SELECT id FROM public.products 
            WHERE organization_id = p_org_id 
              AND name IN ('وجبة اختبار شامل', 'قهوة QR', 'بيتزا اختبار', 'Test Material Construction', 'حديد خام اختبار', 'باب حديد مصنع', 'Secret Product A', 'Panadol Test', 'خبز تجريبي', 'لحم تجريبي', 'وجبة برجر اختبارية')
        );
    END IF;

    DELETE FROM public.opening_inventories 
    WHERE organization_id = p_org_id 
      AND product_id IN (
          SELECT id FROM public.products 
          WHERE organization_id = p_org_id 
            AND name IN ('وجبة اختبار شامل', 'قهوة QR', 'بيتزا اختبار', 'Test Material Construction', 'حديد خام اختبار', 'باب حديد مصنع', 'Secret Product A', 'Panadol Test', 'خبز تجريبي', 'لحم تجريبي', 'وجبة برجر اختبارية')
      );

    -- ب. حذف المشاريع ومخططاتها الخاصة بالاختبارات
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projects') THEN
        DELETE FROM public.project_progress_billings WHERE project_id IN (SELECT id FROM public.projects WHERE name = 'Test Project Construction' AND organization_id = p_org_id);
        DELETE FROM public.project_material_issues WHERE project_id IN (SELECT id FROM public.projects WHERE name = 'Test Project Construction' AND organization_id = p_org_id);
        DELETE FROM public.project_boq WHERE project_id IN (SELECT id FROM public.projects WHERE name = 'Test Project Construction' AND organization_id = p_org_id);
        DELETE FROM public.projects WHERE organization_id = p_org_id AND name = 'Test Project Construction';
    END IF;

    -- ج. حذف المستندات المالية والورديات التجريبية الخاصة بالاختبارات
    DELETE FROM public.invoices WHERE organization_id = p_org_id AND (invoice_number LIKE 'INV-TEST-%' OR invoice_number LIKE 'LT-INV-%');
    DELETE FROM public.purchase_invoices WHERE organization_id = p_org_id AND (invoice_number LIKE 'WAC-INV-%' OR invoice_number LIKE 'PI-TEST-%');
    
    DELETE FROM public.journal_lines WHERE organization_id = p_org_id AND journal_entry_id IN (
        SELECT id FROM public.journal_entries 
        WHERE organization_id = p_org_id 
          AND (description LIKE '%اختبار%' OR reference LIKE 'SHIFT-%' OR reference LIKE 'LT-%')
    );
    DELETE FROM public.journal_entries 
    WHERE organization_id = p_org_id 
      AND (description LIKE '%اختبار%' OR reference LIKE 'SHIFT-%' OR reference LIKE 'LT-%');

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mfg_production_orders') THEN
        DELETE FROM public.mfg_production_orders WHERE organization_id = p_org_id;
    END IF;

    -- د. حذف الأصناف والعملاء والموظفين الاختباريين أنفسهم
    DELETE FROM public.products 
    WHERE organization_id = p_org_id 
      AND name IN ('وجبة اختبار شامل', 'قهوة QR', 'بيتزا اختبار', 'Test Material Construction', 'حديد خام اختبار', 'باب حديد مصنع', 'Secret Product A', 'Panadol Test', 'خبز تجريبي', 'لحم تجريبي', 'وجبة برجر اختبارية');

    DELETE FROM public.customers 
    WHERE organization_id = p_org_id 
      AND name IN ('عميل توصيل تجريبي', 'Construction Test Customer');

    DELETE FROM public.employees 
    WHERE organization_id = p_org_id 
      AND full_name IN ('سائق توصيل تجريبي');
      
    DELETE FROM public.restaurant_tables 
    WHERE organization_id = p_org_id 
      AND name IN ('Table-Test', 'Table-QR-Test');

    DELETE FROM public.shifts 
    WHERE organization_id = p_org_id 
      AND notes LIKE '%اختبار%';

    DELETE FROM public.uom_categories 
    WHERE organization_id = p_org_id 
      AND name IN ('أوزان اختبار', 'وحدات طبية اختبارية');

    DELETE FROM public.accounts 
    WHERE organization_id = p_org_id 
      AND code IN ('1231-TEST', '1231-QR');

    -- هـ. إعادة مزامنة الأرصدة
    PERFORM public.recalculate_all_balances(p_org_id);

    RETURN 'تم حذف كافة البيانات والمنتجات التجريبية للاختبارات بنجاح، وظلت بياناتك الحقيقية سليمة ومحفوظة ✅';
END;
$$;

COMMIT;
