-- 🧪 [Migration] [2026-08-02] إصلاح دمج مستلزمات المختبر بالفاتورة ومنع الحذف تلقائياً
-- الغرض: منع دالة hims_prepare_invoice من حذف بنود مستلزمات المختبر المضافة (lab consumables)
-- وضمان احتساب تكلفة المستلزمات في إجمالي الفاتورة وصافي التكاليف.

CREATE OR REPLACE FUNCTION public.hims_prepare_invoice(p_visit_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_patient_id uuid; v_doc_fee numeric := 0; v_med_cost numeric := 0;
    v_lab_cost numeric := 0; v_rad_cost numeric := 0; v_stay_cost numeric := 0;
    v_blood_cost numeric := 0; v_surgery_cost numeric := 0; 
    v_lab_consumables_cost numeric := 0; -- تكلفة مستهلكات المختبر
    v_subtotal numeric := 0; v_tax numeric := 0; 
    v_vat_rate numeric; v_total numeric := 0; v_bill_id uuid; v_org_id uuid;
BEGIN
    -- 1. التحقق وجلب المنظمة وبيانات المريض
    SELECT organization_id, patient_id INTO v_org_id, v_patient_id FROM public.hims_visits WHERE id = p_visit_id;
    SELECT COALESCE(vat_rate, 0.14) INTO v_vat_rate FROM public.company_settings WHERE organization_id = v_org_id;
    
    -- 2. رسوم الطبيب (سعر الكشف المخصص للطبيب)
    SELECT COALESCE(consultation_fee, 0) INTO v_doc_fee FROM public.hims_doctors 
    WHERE id = (SELECT doctor_id FROM public.hims_visits WHERE id = p_visit_id);

    -- 3. تكلفة الأدوية الموصوفة (سواء كانت pending بانتظار الصرف أو dispensed تم صرفها بالفعل للدعم المسبق)
    SELECT COALESCE(SUM((m->>'qty')::numeric * p.sales_price), 0) INTO v_med_cost
    FROM public.hims_prescriptions pr, jsonb_array_elements(pr.medications) AS m
    JOIN public.products p ON p.id = (m->>'product_id')::uuid
    WHERE pr.visit_id = p_visit_id;

    -- 4. تكلفة تحاليل المختبر (جميع التحاليل الموصوفة بانتظار الدفع المسبق بالخزينة)
    SELECT COALESCE(SUM(t.price), 0) INTO v_lab_cost
    FROM public.hims_lab_orders o
    JOIN public.hims_lab_tests t ON t.id = o.test_id
    WHERE o.visit_id = p_visit_id;

    -- 5. تكلفة الأشعة والفحوصات التصويرية (تأصيل ودعم سعر الأشعة الموصوفة)
    SELECT COALESCE(SUM(o.price), 0) INTO v_rad_cost
    FROM public.hims_radiology_orders o
    WHERE o.visit_id = p_visit_id;

    -- 6. تكلفة الإقامة بالغرف والأسرة
    v_stay_cost := public.hims_calculate_stay_cost(p_visit_id);

    -- 7. تكلفة نقل الدم
    SELECT COALESCE(COUNT(id) * 150, 0) INTO v_blood_cost 
    FROM public.hims_blood_transfusions 
    WHERE visit_id = p_visit_id;

    -- 7.5. تكلفة العمليات الجراحية المكتملة المرفقة بالفاتورة
    SELECT COALESCE(SUM(bi.total_price), 0) INTO v_surgery_cost
    FROM public.hims_billing_items bi
    JOIN public.hims_billing b ON b.id = bi.billing_id
    WHERE b.visit_id = p_visit_id AND bi.item_type = 'surgery';

    -- 7.6. تكلفة مستهلكات المختبر المرفقة بالفاتورة (التي تحتوي على product_id)
    SELECT COALESCE(SUM(bi.total_price), 0) INTO v_lab_consumables_cost
    FROM public.hims_billing_items bi
    JOIN public.hims_billing b ON b.id = bi.billing_id
    WHERE b.visit_id = p_visit_id 
      AND bi.item_type = 'lab' 
      AND bi.product_id IS NOT NULL;

    -- 8. حساب الإجماليات والضرائب
    v_subtotal := COALESCE(v_doc_fee, 0) + COALESCE(v_med_cost, 0) + COALESCE(v_lab_cost, 0) + COALESCE(v_rad_cost, 0) + COALESCE(v_stay_cost, 0) + v_blood_cost + v_surgery_cost + v_lab_consumables_cost;
    v_tax := v_subtotal * v_vat_rate;
    v_total := v_subtotal + v_tax;

    -- 9. تحديث أو إدراج الفاتورة في جدول المحاسبة الطبية
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
    -- نقوم بحذف البنود المكررة باستثناء العمليات ومستهلكات المختبر المدخلة يدوياً لضمان عدم حذفها
    DELETE FROM public.hims_billing_items 
    WHERE billing_id = v_bill_id 
      AND item_type != 'surgery'
      AND NOT (item_type = 'lab' AND product_id IS NOT NULL);
    
    -- أ. بند الكشف الطبي
    IF v_doc_fee > 0 THEN
        INSERT INTO public.hims_billing_items (billing_id, item_type, description, quantity, unit_price, organization_id)
        VALUES (v_bill_id, 'consultation', 'كشف عيادة خارجية', 1, v_doc_fee, v_org_id);
    END IF;
    
    -- ب. بنود الأدوية (يتوافق نوع البند مع 'pharmacy' في قيد التحقق ويحتوي على معطيات المستودع والوحدة فقط عند الصرف الفعلي)
    INSERT INTO public.hims_billing_items (
        billing_id, item_type, description, quantity, unit_price, organization_id, product_id, warehouse_id, uom_id
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
        CASE WHEN pr.status = 'dispensed' THEN p.base_uom_id ELSE NULL END
    FROM public.hims_prescriptions pr, jsonb_array_elements(pr.medications) AS m
    JOIN public.products p ON p.id = (m->>'product_id')::uuid
    WHERE pr.visit_id = p_visit_id;

    -- ج. بنود تحاليل المختبر (الفحوصات نفسها)
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
