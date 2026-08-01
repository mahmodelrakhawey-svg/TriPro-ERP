-- Migration: Smart Batch & Expiry Tracking (FEFO) in HIMS Pharmacy
-- Date: 2026-08-01
-- Description: Alter tables to support batch tracking, create product_batches table, and update purchase invoice approval, prescription dispensing (FEFO), and billing invoice preparation functions.

-- 1. Database Schema Alterations
ALTER TABLE public.purchase_invoice_items ADD COLUMN IF NOT EXISTS batch_number text;
ALTER TABLE public.purchase_invoice_items ADD COLUMN IF NOT EXISTS expiry_date date;
ALTER TABLE public.hims_billing_items ADD COLUMN IF NOT EXISTS batch_number text;

-- 2. Create product_batches table
CREATE TABLE IF NOT EXISTS public.product_batches (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE CASCADE,
    batch_number text NOT NULL,
    expiry_date date NOT NULL,
    quantity numeric NOT NULL DEFAULT 0,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT unique_batch_per_product_warehouse UNIQUE (product_id, warehouse_id, batch_number)
);

CREATE INDEX IF NOT EXISTS idx_product_batches_expiry ON public.product_batches (product_id, warehouse_id, expiry_date);

-- 3. Redefine approve_purchase_invoice to register batch stock
CREATE OR REPLACE FUNCTION public.approve_purchase_invoice(
    p_invoice_id uuid,
    p_org_id uuid DEFAULT NULL,
    p_warehouse_id uuid DEFAULT NULL,
    p_skip_recalc boolean DEFAULT false
) RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER 
AS $$
DECLARE
    v_invoice record; v_item record; v_org_id uuid; v_inventory_acc_id uuid; v_vat_in_id uuid; v_supplier_acc_id uuid;
    v_journal_id uuid; v_mappings jsonb; v_exchange_rate numeric;
    v_wh_id uuid;
BEGIN
    SELECT * INTO v_invoice FROM public.purchase_invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'فاتورة المشتريات غير موجودة'; END IF;

    v_org_id := COALESCE(p_org_id, v_invoice.organization_id, public.get_my_org());
    v_exchange_rate := COALESCE(v_invoice.exchange_rate, 1);
    IF v_exchange_rate <= 0 THEN v_exchange_rate := 1; END IF;

    -- حذف القيد القديم إذا كان موجوداً لمنع التكرار
    DELETE FROM public.journal_entries WHERE related_document_id = p_invoice_id AND related_document_type = 'purchase_invoice';

    -- تحديد وتحديث المستودع
    v_wh_id := COALESCE(p_warehouse_id, v_invoice.warehouse_id);
    IF p_warehouse_id IS NOT NULL THEN
        UPDATE public.purchase_invoices SET warehouse_id = p_warehouse_id WHERE id = p_invoice_id;
    END IF;

    -- تحديث متوسط التكلفة (WAC) وتسجيل الدفعات
    FOR v_item IN SELECT product_id, quantity, unit_price, uom_id, batch_number, expiry_date FROM public.purchase_invoice_items WHERE purchase_invoice_id = p_invoice_id LOOP
        DECLARE
            v_base_qty numeric := public.uom_convert(v_item.quantity, v_item.uom_id, (SELECT base_uom_id FROM public.products WHERE id = v_item.product_id));
            v_unit_cost_base numeric := (v_item.unit_price * v_item.quantity) / NULLIF(v_base_qty, 0);
        BEGIN
            UPDATE public.products p SET 
                purchase_price = v_unit_cost_base,
                cost = v_unit_cost_base,
                weighted_average_cost = CASE 
                    WHEN (COALESCE(p.stock, 0) + v_base_qty) > 0 
                    THEN ROUND(((COALESCE(p.stock, 0) * COALESCE(NULLIF(p.weighted_average_cost, 0), NULLIF(p.cost, 0), p.purchase_price, v_unit_cost_base)) + (v_base_qty * v_unit_cost_base)) / (COALESCE(p.stock, 0) + v_base_qty), 4)
                    ELSE v_unit_cost_base 
                END
            WHERE id = v_item.product_id;

            -- تسجيل التشغيلة وتاريخ الصلاحية في جدول الدفعات للمستودع المحدد بالفاتورة
            IF v_item.batch_number IS NOT NULL AND v_item.expiry_date IS NOT NULL AND v_wh_id IS NOT NULL THEN
                INSERT INTO public.product_batches (organization_id, product_id, warehouse_id, batch_number, expiry_date, quantity)
                VALUES (v_org_id, v_item.product_id, v_wh_id, v_item.batch_number, v_item.expiry_date, v_base_qty)
                ON CONFLICT (product_id, warehouse_id, batch_number) 
                DO UPDATE SET 
                    quantity = public.product_batches.quantity + EXCLUDED.quantity,
                    expiry_date = EXCLUDED.expiry_date;
            END IF;
        END;
    END LOOP;

    -- توليد القيد المحاسبي
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_inventory_acc_id := COALESCE((v_mappings->>'INVENTORY_RAW_MATERIALS')::uuid, (SELECT id FROM public.accounts WHERE code = '10301' AND organization_id = v_org_id LIMIT 1));
    v_vat_in_id := COALESCE((v_mappings->>'VAT_INPUT')::uuid, (v_mappings->>'VAT')::uuid, (SELECT id FROM public.accounts WHERE code = '1241' AND organization_id = v_org_id LIMIT 1));
    v_supplier_acc_id := COALESCE((v_mappings->>'SUPPLIERS')::uuid, (SELECT id FROM public.accounts WHERE code = '201' AND organization_id = v_org_id LIMIT 1));

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_invoice.invoice_date, 'فاتورة مشتريات رقم ' || COALESCE(v_invoice.invoice_number, '-'), v_invoice.invoice_number, 'posted', v_org_id, p_invoice_id, 'purchase_invoice', true) RETURNING id INTO v_journal_id;
    
    -- 1. المدين: المخزون
    FOR v_item IN 
        SELECT 
            COALESCE(p.inventory_account_id, v_inventory_acc_id) as acc_id,
            SUM(pii.total) as total_cost
        FROM public.purchase_invoice_items pii
        JOIN public.products p ON pii.product_id = p.id
        WHERE pii.purchase_invoice_id = p_invoice_id
        GROUP BY COALESCE(p.inventory_account_id, v_inventory_acc_id)
    LOOP
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_item.acc_id, v_item.total_cost * v_exchange_rate, 0, 'إثبات مشتريات - مخزون', v_org_id);
    END LOOP;

    -- 2. المدين: ضريبة المدخلات
    IF COALESCE(v_invoice.tax_amount, 0) > 0 AND v_vat_in_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_journal_id, v_vat_in_id, v_invoice.tax_amount * v_exchange_rate, 0, 'ضريبة مدخلات', v_org_id);
    END IF;

    -- 3. الدائن: المورد
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_journal_id, v_supplier_acc_id, 0, v_invoice.total_amount * v_exchange_rate, 'استحقاق مورد', v_org_id);

    -- 4. إثبات السداد الفوري
    IF COALESCE(v_invoice.paid_amount, 0) > 0 AND v_invoice.treasury_account_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_supplier_acc_id, v_invoice.paid_amount * v_exchange_rate, 0, 'سداد فوري - فاتورة مشتريات ' || v_invoice.invoice_number, v_org_id);

        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_invoice.treasury_account_id, 0, v_invoice.paid_amount * v_exchange_rate, 'دفع نقدي - فاتورة مشتريات ' || v_invoice.invoice_number, v_org_id);
        
        IF ABS(COALESCE(v_invoice.paid_amount, 0) - COALESCE(v_invoice.total_amount, 0)) < 0.01 THEN
            UPDATE public.purchase_invoices SET status = 'paid', related_journal_entry_id = v_journal_id WHERE id = p_invoice_id;
        ELSE
            UPDATE public.purchase_invoices SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_invoice_id;
        END IF;
    ELSE
        UPDATE public.purchase_invoices SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_invoice_id;
    END IF;

    IF NOT p_skip_recalc THEN
        PERFORM public.recalculate_stock_rpc(v_org_id);
    END IF;

    PERFORM public.recalculate_all_system_balances(v_org_id);
END; 
$$;

-- 4. Redefine hims_dispense_prescription to implement FEFO batch stock consumption
CREATE OR REPLACE FUNCTION public.hims_dispense_prescription(p_prescription_id uuid, p_warehouse_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_med record; v_org_id uuid; v_visit_id uuid;
    v_final_wh_id uuid;
    v_sales_price numeric; v_product_name text;
    v_bill_status text; v_ins_id uuid;
    v_total_cogs numeric(18,2) := 0; v_cogs_acc_id uuid; v_inv_acc_id uuid;
    v_mappings jsonb; v_cost_price numeric; v_journal_id uuid;
BEGIN
    -- 1. جلب معلومات المنظمة والزيارة
    SELECT organization_id, visit_id INTO v_org_id, v_visit_id 
    FROM public.hims_prescriptions WHERE id = p_prescription_id;
    
    -- 🔄 إعادة احتساب وتحديث الفاتورة فوراً لضمان إدخال بنود الأدوية وحساب الفروقات المالية المحدثة
    PERFORM public.hims_prepare_invoice(v_visit_id);
    
    -- 🛡️ حماية مالية: التحقق من حالة دفع الفاتورة للمرضى النقديين أو وجود جهة تأمين
    SELECT payment_status, insurance_provider_id INTO v_bill_status, v_ins_id 
    FROM public.hims_billing WHERE visit_id = v_visit_id;

    IF v_ins_id IS NULL AND (v_bill_status IS NULL OR v_bill_status != 'paid') THEN
        RAISE EXCEPTION '⚠️ خطأ أمني: لا يمكن صرف الدواء قبل سداد قيمة الروشتة بالخزينة أولاً.';
    END IF;

    -- تحديد المستودع
    v_final_wh_id := COALESCE(
        p_warehouse_id,
        (SELECT default_pharmacy_warehouse FROM public.hims_settings WHERE organization_id = v_org_id),
        (SELECT id FROM public.warehouses WHERE organization_id = v_org_id AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1)
    );

    IF v_final_wh_id IS NULL THEN
        RAISE EXCEPTION '⚠️ فشل الصرف: لم يتم العثور على مستودع صيدلية معرف لهذه المنظمة.';
    END IF;

    -- جلب إعدادات الربط المحاسبي
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_cogs_acc_id := public.resolve_leaf_account(COALESCE((v_mappings->>'COGS')::uuid, (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '511' LIMIT 1)));
    v_inv_acc_id := public.resolve_leaf_account(COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '10302' LIMIT 1)));

    FOR v_med IN SELECT * FROM jsonb_to_recordset((SELECT medications FROM public.hims_prescriptions WHERE id = p_prescription_id)) 
        AS x(product_id uuid, qty numeric)
    LOOP
        -- رقابة مزدوجة: (الصلاحية والأرصدة العامة)
        IF EXISTS (
            SELECT 1 FROM public.products 
            WHERE id = v_med.product_id 
            AND organization_id = v_org_id 
            AND (expiry_date < CURRENT_DATE)
        ) THEN
            RAISE EXCEPTION '⚠️ خطأ أمني: الدواء (%) منتهي الصلاحية ولا يمكن صرفه طبياً.', 
                (SELECT name FROM public.products WHERE id = v_med.product_id);
        END IF;

        IF (SELECT stock FROM public.products WHERE id = v_med.product_id AND organization_id = v_org_id) < v_med.qty THEN
            RAISE EXCEPTION '⚠️ عجز مخزني: لا يتوفر رصيد كافٍ للدواء (%). الرصيد المتوفر (%) فقط.', 
                (SELECT name FROM public.products WHERE id = v_med.product_id),
                (SELECT stock FROM public.products WHERE id = v_med.product_id AND organization_id = v_org_id);
        END IF;

        -- جلب البيانات المالية وتكلفة الصنف
        SELECT name, sales_price, 
               COALESCE(NULLIF(weighted_average_cost, 0), NULLIF(cost, 0), NULLIF(purchase_price, 0), 0), 
               COALESCE(inventory_account_id, v_inv_acc_id)
        INTO v_product_name, v_sales_price, v_cost_price, v_inv_acc_id
        FROM public.products WHERE id = v_med.product_id;

        -- 🚀 خوارزمية FEFO: خصم الكمية من التشغيلات المتوفرة بالمستودع الأقرب لانتهاء الصلاحية أولاً
        DECLARE
            v_remaining_qty_to_dispense numeric := v_med.qty;
            v_batch RECORD;
            v_dispensed_from_batch numeric;
            v_first_batch_number text := NULL;
        BEGIN
            FOR v_batch IN 
                SELECT id, batch_number, quantity, expiry_date 
                FROM public.product_batches
                WHERE product_id = v_med.product_id 
                  AND warehouse_id = v_final_wh_id
                  AND quantity > 0
                ORDER BY expiry_date ASC, created_at ASC
            LOOP
                EXIT WHEN v_remaining_qty_to_dispense <= 0;

                IF v_batch.quantity >= v_remaining_qty_to_dispense THEN
                    UPDATE public.product_batches 
                    SET quantity = quantity - v_remaining_qty_to_dispense 
                    WHERE id = v_batch.id;

                    v_dispensed_from_batch := v_remaining_qty_to_dispense;
                    v_remaining_qty_to_dispense := 0;
                ELSE
                    UPDATE public.product_batches 
                    SET quantity = 0 
                    WHERE id = v_batch.id;

                    v_dispensed_from_batch := v_batch.quantity;
                    v_remaining_qty_to_dispense := v_remaining_qty_to_dispense - v_batch.quantity;
                END IF;

                IF v_first_batch_number IS NULL THEN
                    v_first_batch_number := v_batch.batch_number;
                END IF;

                -- تسجيل الحركة في سجل إعطاء الدواء
                INSERT INTO public.hims_medication_log (visit_id, medication_name, dosage, administered_by, organization_id, batch_number)
                VALUES (v_visit_id, v_product_name, v_dispensed_from_batch::text || ' ' || COALESCE((SELECT unit FROM public.products WHERE id = v_med.product_id), 'قطعة'), auth.uid(), v_org_id, v_batch.batch_number);
            END LOOP;

            -- حالة احتياطية لضمان تسجيل الصرف حتى عند عدم إدخال شحنات مشتريات تفصيلية
            IF v_remaining_qty_to_dispense > 0 THEN
                INSERT INTO public.hims_medication_log (visit_id, medication_name, dosage, administered_by, organization_id, batch_number)
                VALUES (v_visit_id, v_product_name, v_remaining_qty_to_dispense::text || ' ' || COALESCE((SELECT unit FROM public.products WHERE id = v_med.product_id), 'قطعة'), auth.uid(), v_org_id, 'SYSTEM-AUTO');
            END IF;

            -- 1. خصم الكمية من مخزن المنتجات العام
            UPDATE public.products SET stock = stock - v_med.qty 
            WHERE id = v_med.product_id AND organization_id = v_org_id;

            -- حساب التكلفة الإجمالية للصرف (COGS)
            v_total_cogs := COALESCE(v_total_cogs, 0) + (v_med.qty * COALESCE(v_cost_price, 0));

            -- 2. ترحيل البند لفاتورة المريض
            PERFORM public.hims_add_billing_item(
                v_visit_id,
                'pharmacy',
                v_product_name,
                v_med.qty,
                v_sales_price,
                v_med.product_id,
                v_final_wh_id,
                (SELECT base_uom_id FROM public.products WHERE id = v_med.product_id)
            );

            -- تحديث رقم التشغيلة المصروفة في سطر الفاتورة
            UPDATE public.hims_billing_items 
            SET batch_number = COALESCE(v_first_batch_number, 'SYSTEM-AUTO')
            WHERE billing_id = (SELECT id FROM public.hims_billing WHERE visit_id = v_visit_id)
              AND product_id = v_med.product_id
              AND item_type = 'pharmacy';
        END;
    END LOOP;

    -- 🛡️ توليد قيد اليومية المزدوج لإثبات التكلفة
    IF v_total_cogs > 0.01 THEN
        INSERT INTO public.journal_entries (organization_id, transaction_date, description, reference, status, related_document_id, related_document_type, is_posted)
        VALUES (v_org_id, CURRENT_DATE, 'إثبات تكلفة أدوية مصروفة - روشتة: ' || p_prescription_id::TEXT, 'PHARM-' || substring(p_prescription_id::TEXT, 1, 8), 'posted', p_prescription_id, 'hims_prescription', true)
        RETURNING id INTO v_journal_id;

        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
        VALUES 
            (v_journal_id, v_cogs_acc_id, v_total_cogs, 0, v_org_id, 'تكلفة أدوية مباعة'),
            (v_journal_id, v_inv_acc_id, 0, v_total_cogs, v_org_id, 'تخفيض مخزون الصيدلية');
    END IF;

    UPDATE public.hims_prescriptions SET status = 'dispensed' WHERE id = p_prescription_id;
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- 5. Redefine hims_prepare_invoice to preserve batch numbers in breakdown
CREATE OR REPLACE FUNCTION public.hims_prepare_invoice(p_visit_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_patient_id uuid; v_doc_fee numeric := 0; v_med_cost numeric := 0;
    v_lab_cost numeric := 0; v_rad_cost numeric := 0; v_stay_cost numeric := 0;
    v_blood_cost numeric := 0; v_surgery_cost numeric := 0; v_subtotal numeric := 0; v_tax numeric := 0; 
    v_vat_rate numeric; v_total numeric := 0; v_bill_id uuid; v_org_id uuid;
BEGIN
    SELECT organization_id, patient_id INTO v_org_id, v_patient_id FROM public.hims_visits WHERE id = p_visit_id;
    SELECT COALESCE(vat_rate, 0.14) INTO v_vat_rate FROM public.company_settings WHERE organization_id = v_org_id;
    
    SELECT COALESCE(consultation_fee, 0) INTO v_doc_fee FROM public.hims_doctors 
    WHERE id = (SELECT doctor_id FROM public.hims_visits WHERE id = p_visit_id);

    SELECT COALESCE(SUM((m->>'qty')::numeric * p.sales_price), 0) INTO v_med_cost
    FROM public.hims_prescriptions pr, jsonb_array_elements(pr.medications) AS m
    JOIN public.products p ON p.id = (m->>'product_id')::uuid
    WHERE pr.visit_id = p_visit_id;

    SELECT COALESCE(SUM(t.price), 0) INTO v_lab_cost
    FROM public.hims_lab_orders o
    JOIN public.hims_lab_tests t ON t.id = o.test_id
    WHERE o.visit_id = p_visit_id;

    SELECT COALESCE(SUM(o.price), 0) INTO v_rad_cost
    FROM public.hims_radiology_orders o
    WHERE o.visit_id = p_visit_id;

    v_stay_cost := public.hims_calculate_stay_cost(p_visit_id);

    SELECT COALESCE(COUNT(id) * 150, 0) INTO v_blood_cost 
    FROM public.hims_blood_transfusions 
    WHERE visit_id = p_visit_id;

    SELECT COALESCE(SUM(bi.total_price), 0) INTO v_surgery_cost
    FROM public.hims_billing_items bi
    JOIN public.hims_billing b ON b.id = bi.billing_id
    WHERE b.visit_id = p_visit_id AND bi.item_type = 'surgery';

    v_subtotal := COALESCE(v_doc_fee, 0) + COALESCE(v_med_cost, 0) + COALESCE(v_lab_cost, 0) + COALESCE(v_rad_cost, 0) + COALESCE(v_stay_cost, 0) + v_blood_cost + v_surgery_cost;
    v_tax := v_subtotal * v_vat_rate;
    v_total := v_subtotal + v_tax;

    INSERT INTO public.hims_billing (
        visit_id, patient_id, total_amount, tax_amount, patient_paid_amount, payment_status, organization_id
    )
    VALUES (
        p_visit_id, v_patient_id, v_total, v_tax, 0, 'unpaid', v_org_id
    )
    ON CONFLICT (visit_id) DO UPDATE SET 
        total_amount = EXCLUDED.total_amount,
        tax_amount = EXCLUDED.tax_amount,
        payment_status = CASE 
            WHEN (EXCLUDED.total_amount - COALESCE(public.hims_billing.insurance_covered_amount, 0) - COALESCE(public.hims_billing.patient_paid_amount, 0)) <= 0.01 THEN 'paid'
            ELSE 'unpaid'
        END
    RETURNING id INTO v_bill_id;

    -- 10. تفكيك وبناء تفاصيل بنود الفاتورة للشفافية المطلقة (Billing Items Breakdown)
    DELETE FROM public.hims_billing_items WHERE billing_id = v_bill_id AND item_type != 'surgery';
    
    -- أ. بند الكشف الطبي
    IF v_doc_fee > 0 THEN
        INSERT INTO public.hims_billing_items (billing_id, item_type, description, quantity, unit_price, organization_id)
        VALUES (v_bill_id, 'consultation', 'كشف عيادة خارجية', 1, v_doc_fee, v_org_id);
    END IF;
    
    -- ب. بنود الأدوية (يتوافق نوع البند مع 'pharmacy' ويسترجع رقم التشغيلة المصروفة من سجل العلاج ml.administered_at)
    INSERT INTO public.hims_billing_items (
        billing_id, item_type, description, quantity, unit_price, organization_id, product_id, warehouse_id, uom_id, batch_number
    )
    SELECT 
        v_bill_id, 
        'pharmacy', 
        p.name, 
        (m->>'qty')::numeric, 
        p.sales_price, 
        v_org_id,
        CASE WHEN pr.status = 'dispensed' THEN p.id ELSE NULL END,
        CASE WHEN pr.status = 'dispensed' THEN COALESCE(
            (SELECT default_pharmacy_warehouse FROM public.hims_settings WHERE organization_id = v_org_id),
            (SELECT id FROM public.warehouses WHERE organization_id = v_org_id AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1)
        ) ELSE NULL END,
        CASE WHEN pr.status = 'dispensed' THEN p.base_uom_id ELSE NULL END,
        CASE WHEN pr.status = 'dispensed' THEN (
            SELECT ml.batch_number 
            FROM public.hims_medication_log ml 
            WHERE ml.visit_id = pr.visit_id 
              AND ml.medication_name = p.name 
            ORDER BY ml.administered_at DESC 
            LIMIT 1
        ) ELSE NULL END
    FROM public.hims_prescriptions pr, jsonb_array_elements(pr.medications) AS m
    JOIN public.products p ON p.id = (m->>'product_id')::uuid
    WHERE pr.visit_id = p_visit_id;

    -- ج. بنود تحاليل المختبر
    INSERT INTO public.hims_billing_items (billing_id, item_type, description, quantity, unit_price, organization_id)
    SELECT v_bill_id, 'lab', t.test_name, 1, t.price, v_org_id
    FROM public.hims_lab_orders o
    JOIN public.hims_lab_tests t ON t.id = o.test_id
    WHERE o.visit_id = p_visit_id;

    -- د. بنود الفحوصات الشعاعية
    INSERT INTO public.hims_billing_items (billing_id, item_type, description, quantity, unit_price, organization_id)
    SELECT v_bill_id, 'radiology', o.scan_type, 1, o.price, v_org_id
    FROM public.hims_radiology_orders o
    WHERE o.visit_id = p_visit_id;

    -- هـ. بند الإقامة بالقسم الداخلي
    IF v_stay_cost > 0 THEN
        INSERT INTO public.hims_billing_items (billing_id, item_type, description, quantity, unit_price, organization_id)
        VALUES (v_bill_id, 'accommodation', 'إقامة بالقسم الداخلي والأجنحة', 1, v_stay_cost, v_org_id);
    END IF;

    -- و. بنود نقل الدم
    IF v_blood_cost > 0 THEN
        INSERT INTO public.hims_billing_items (billing_id, item_type, description, quantity, unit_price, organization_id)
        VALUES (v_bill_id, 'other', 'خدمة نقل دم - بنك الدم', (v_blood_cost/150)::int, 150, v_org_id);
    END IF;

    RETURN v_bill_id;
END; $$;
