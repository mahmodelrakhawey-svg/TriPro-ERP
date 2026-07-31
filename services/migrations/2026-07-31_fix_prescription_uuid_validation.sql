-- Migration: Fix prescription UUID validation in allergy and drug interaction triggers
-- Date: 2026-07-31
-- Description: Prevents 400 Bad Request error when inserting prescriptions with empty/invalid product_ids by validating UUID format before casting in triggers.

CREATE OR REPLACE FUNCTION public.fn_hims_check_allergy_before_prescription()
RETURNS TRIGGER AS $$
DECLARE
    v_allergies text[];
    v_med jsonb;
    v_med_name text;
    v_allergy text;
BEGIN
    -- 1. جلب قائمة الحساسية المسجلة للمريض
    SELECT allergies INTO v_allergies 
    FROM public.hims_patients 
    WHERE id = (SELECT patient_id FROM public.hims_visits WHERE id = NEW.visit_id);

    -- 2. التحقق من كل دواء في الوصفة
    FOR v_med IN SELECT * FROM jsonb_array_elements(NEW.medications) LOOP
        -- التأكد من أن المعرف موجود وصالح قبل التحويل لتجنب أخطاء UUID 400
        IF (v_med->>'product_id') IS NOT NULL AND (v_med->>'product_id') != '' AND (v_med->>'product_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            SELECT name INTO v_med_name FROM public.products WHERE id = (v_med->>'product_id')::uuid;
            
            FOREACH v_allergy IN ARRAY v_allergies LOOP
                IF v_med_name ILIKE '%' || v_allergy || '%' THEN
                    RAISE EXCEPTION '🚨 خطأ طبي حرج: المريض لديه حساسية مسجلة من (%). لا يمكن اعتماد الوصفة.', v_allergy;
                END IF;
            END LOOP;
        END IF;
    END LOOP;

    RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.fn_hims_check_drug_interactions()
RETURNS TRIGGER AS $$
DECLARE
    v_med jsonb;
    v_existing_meds uuid[];
    v_conflict_name text;
BEGIN
    -- جلب الأدوية الحالية للمريض من الزيارات النشطة (مع التحقق من صحة الـ UUID لمنع أخطاء Cast)
    SELECT array_agg((m->>'product_id')::uuid) INTO v_existing_meds
    FROM public.hims_prescriptions p, jsonb_array_elements(p.medications) m
    WHERE p.visit_id = NEW.visit_id AND p.status = 'dispensed'
    AND (m->>'product_id') IS NOT NULL AND (m->>'product_id') != '' AND (m->>'product_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

    FOR v_med IN SELECT * FROM jsonb_array_elements(NEW.medications) LOOP
        IF (v_med->>'product_id') IS NOT NULL AND (v_med->>'product_id') != '' AND (v_med->>'product_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            IF EXISTS (SELECT 1 FROM public.hims_drug_interactions WHERE (product_a_id = (v_med->>'product_id')::uuid AND product_b_id = ANY(v_existing_meds)) OR (product_b_id = (v_med->>'product_id')::uuid AND product_a_id = ANY(v_existing_meds))) THEN
                SELECT name INTO v_conflict_name FROM public.products WHERE id = (v_med->>'product_id')::uuid;
                RAISE EXCEPTION '🚨 تنبيه تفاعل دوائي خطير: الدواء (%) يتعارض مع علاجات المريض الحالية.', v_conflict_name;
            END IF;
        END IF;
    END LOOP;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;
