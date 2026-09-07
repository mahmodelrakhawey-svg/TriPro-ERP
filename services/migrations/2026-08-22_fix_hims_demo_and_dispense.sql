-- ==============================================================================
-- 🏥 إصلاح دالة صرف الأدوية وتوليد الديمو الفاخر للمستشفيات HIMS
-- التاريخ: 2026-08-22
-- ==============================================================================

-- 1. ترقية دالة صرف الأدوية (hims_dispense_prescription)
CREATE OR REPLACE FUNCTION public.hims_dispense_prescription(p_prescription_id uuid, p_warehouse_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_med record; 
    v_org_id uuid; 
    v_visit_id uuid;
    v_visit_type text;
    v_final_wh_id uuid;
    v_sales_price numeric; 
    v_product_name text;
    v_bill_status text; 
    v_ins_id uuid;
    v_total_cogs numeric(18,2) := 0; 
    v_cogs_acc_id uuid; 
    v_inv_acc_id uuid;
    v_mappings jsonb; 
    v_cost_price numeric; 
    v_journal_id uuid;
BEGIN
    -- 1. جلب معلومات المنظمة والزيارة
    SELECT p.organization_id, p.visit_id, v.visit_type 
      INTO v_org_id, v_visit_id, v_visit_type
      FROM public.hims_prescriptions p
      LEFT JOIN public.hims_visits v ON v.id = p.visit_id
     WHERE p.id = p_prescription_id;
    
    -- 🔄 تحديث الفاتورة فوراً لضمان إدخال بنود الأدوية
    PERFORM public.hims_prepare_invoice(v_visit_id);
    
    -- 🛡️ حماية مالية ذكية:
    -- يُسمح بالصرف في الحالات التالية:
    -- أ. وضع الاختبار أو المحاكاة (app.restore_mode = 'on')
    -- ب. المرضى المؤمن عليهم (Insurance)
    -- ج. حالات الطوارئ والتنويم الداخلي (Inpatient / Emergency يتم المحاسبة عند الخروج)
    -- د. الروشتات المسددة بالخزينة
    SELECT payment_status, insurance_provider_id INTO v_bill_status, v_ins_id 
      FROM public.hims_billing WHERE visit_id = v_visit_id;

    IF COALESCE(current_setting('app.restore_mode', true), 'off') != 'on' THEN
        IF v_ins_id IS NULL 
           AND (v_visit_type NOT IN ('inpatient', 'emergency') OR v_visit_type IS NULL) 
           AND (v_bill_status IS NULL OR v_bill_status != 'paid') THEN
            RAISE EXCEPTION '⚠️ خطأ أمني: لا يمكن صرف الدواء للعيادات الخارجية قبل سداد قيمة الروشتة بالخزينة أولاً.';
        END IF;
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
        SELECT name, sales_price, COALESCE(cost, 0) INTO v_product_name, v_sales_price, v_cost_price
        FROM public.products WHERE id = v_med.product_id;

        -- خصم المخزون بنظام الصيدلية السريرية
        PERFORM public.hims_fefo_deduct_inventory(v_med.product_id, v_final_wh_id, v_med.qty);
        
        v_total_cogs := v_total_cogs + (v_cost_price * v_med.qty);
    END LOOP;

    -- تحديث حالة الروشتة إلى مصروفة
    UPDATE public.hims_prescriptions 
       SET status = 'dispensed', dispensed_at = now() 
     WHERE id = p_prescription_id;

    -- تحديث الفاتورة النهائية
    PERFORM public.hims_prepare_invoice(v_visit_id);
END;
$$;


-- 2. ترقية دالة توليد سيناريو المستشفى الفاخر (hims_generate_premium_demo)
CREATE OR REPLACE FUNCTION public.hims_generate_premium_demo(p_org_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_id uuid := COALESCE(
        p_org_id, 
        public.get_my_org(), 
        (SELECT organization_id FROM public.profiles WHERE id = auth.uid()),
        (SELECT id FROM public.organizations ORDER BY created_at DESC LIMIT 1)
    );
    v_pat_id uuid; 
    v_doc_id uuid; 
    v_visit_id uuid; 
    v_bill_id uuid;
    v_presc_id uuid;
    v_med_id uuid; 
    v_wh_id uuid; 
    v_cash_acc uuid;
BEGIN
    IF v_org_id IS NULL THEN RAISE EXCEPTION 'يجب تحديد المنظمة المستهدفة.'; END IF;
    PERFORM set_config('app.restore_mode', 'on', true);
    
    SELECT id INTO v_wh_id FROM public.warehouses WHERE organization_id = v_org_id AND deleted_at IS NULL LIMIT 1;
    IF v_wh_id IS NULL THEN
        INSERT INTO public.warehouses (organization_id, name, location)
        VALUES (v_org_id, 'مستودع الصيدلية الرئيسي', 'المبنى الطبي الرئيسي')
        RETURNING id INTO v_wh_id;
    END IF;

    SELECT id INTO v_cash_acc FROM public.accounts WHERE organization_id = v_org_id AND code = '1231' LIMIT 1;
    IF v_cash_acc IS NULL THEN
        SELECT id INTO v_cash_acc FROM public.accounts WHERE organization_id = v_org_id AND code LIKE '123%' LIMIT 1;
    END IF;

    -- 1. إنشاء/تحديث طبيب
    INSERT INTO public.hims_doctors (organization_id, specialization, consultation_fee, profile_id)
    VALUES (v_org_id, 'استشاري جراحة قلب', 1000, auth.uid())
    ON CONFLICT (profile_id) DO UPDATE SET specialization = EXCLUDED.specialization
    RETURNING id INTO v_doc_id;

    -- 2. تجهيز دواء اختبار وضخ رصيد مخزني له
    SELECT id INTO v_med_id FROM public.products WHERE name = 'Premium Medication (Demo)' AND organization_id = v_org_id;
    IF v_med_id IS NULL THEN
        INSERT INTO public.products (name, sales_price, cost, stock, organization_id, product_type)
        VALUES ('Premium Medication (Demo)', 250, 150, 50, v_org_id, 'STOCK')
        RETURNING id INTO v_med_id;
    ELSE
        UPDATE public.products
        SET sales_price = 250, cost = 150, stock = 50, product_type = 'STOCK'
        WHERE id = v_med_id;
    END IF;

    -- 3. تسجيل مريض في آي بي
    INSERT INTO public.hims_patients (organization_id, full_name, national_id, dob, gender, blood_type)
    VALUES (v_org_id, 'عميل في آي بي (تجريبي)', '29001010000000', '1990-01-01', 'male', 'B+')
    ON CONFLICT (organization_id, national_id) DO UPDATE 
    SET full_name = EXCLUDED.full_name, dob = EXCLUDED.dob, gender = EXCLUDED.gender, blood_type = EXCLUDED.blood_type
    RETURNING id INTO v_pat_id;

    -- تنظيف بيانات الزيارات السابقة لهذا المريض
    DELETE FROM public.hims_billing_items WHERE billing_id IN (SELECT id FROM public.hims_billing WHERE visit_id IN (SELECT id FROM public.hims_visits WHERE patient_id = v_pat_id AND organization_id = v_org_id));
    DELETE FROM public.hims_billing WHERE visit_id IN (SELECT id FROM public.hims_visits WHERE patient_id = v_pat_id AND organization_id = v_org_id);
    DELETE FROM public.hims_prescriptions WHERE visit_id IN (SELECT id FROM public.hims_visits WHERE patient_id = v_pat_id AND organization_id = v_org_id);
    DELETE FROM public.hims_lab_orders WHERE visit_id IN (SELECT id FROM public.hims_visits WHERE patient_id = v_pat_id AND organization_id = v_org_id);
    DELETE FROM public.hims_visits WHERE patient_id = v_pat_id AND organization_id = v_org_id;

    -- 4. إنشاء زيارة طوارئ/تنويم
    INSERT INTO public.hims_visits (organization_id, patient_id, doctor_id, visit_type, triage_level, status, chief_complaint, admission_date)
    VALUES (v_org_id, v_pat_id, v_doc_id, 'emergency', 'level_1_resuscitation', 'in_consultation', 'فحص شامل وتنويم تجريبي', now() - interval '2 days')
    RETURNING id INTO v_visit_id;

    -- 5. فحص معملي
    INSERT INTO public.hims_lab_orders (organization_id, visit_id, test_id, status, result_value)
    SELECT v_org_id, v_visit_id, id, 'completed', '95 mg/dL' FROM public.hims_lab_tests WHERE organization_id = v_org_id LIMIT 1;

    -- 6. روشتة وصرف الدواء
    INSERT INTO public.hims_prescriptions (organization_id, visit_id, doctor_id, diagnosis, medications)
    VALUES (v_org_id, v_visit_id, v_doc_id, 'حالة مستقرة تحت الملاحظة', jsonb_build_array(jsonb_build_object('product_id', v_med_id, 'qty', 2)))
    RETURNING id INTO v_presc_id;
    
    PERFORM public.hims_dispense_prescription(v_presc_id, v_wh_id);
    PERFORM public.hims_add_billing_item(v_visit_id, 'accommodation', 'إقامة جناح ملكي - ليلتان', 2, 1500);
    PERFORM public.hims_process_discharge(v_visit_id, 'MANAGER_OVERRIDE');

    -- 7. تحصيل وسداد الفاتورة بالخزينة
    SELECT id INTO v_bill_id FROM public.hims_billing WHERE visit_id = v_visit_id;
    IF v_bill_id IS NOT NULL AND v_cash_acc IS NOT NULL THEN 
        PERFORM public.hims_finalize_billing(v_bill_id, v_cash_acc); 
    END IF;

    PERFORM public.recalculate_stock_rpc(v_org_id);
    PERFORM set_config('app.restore_mode', 'off', true);

    RETURN jsonb_build_object('status', 'success', 'message', 'تم توليد سيناريو طبي ومالي كامل للمستشفى بنجاح 🚀');
END;
$$;

GRANT EXECUTE ON FUNCTION public.hims_generate_premium_demo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hims_dispense_prescription(uuid, uuid) TO authenticated;
