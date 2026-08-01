-- Migration: HIMS Public Patient Visit Portal RPC
-- Date: 2026-08-01
-- Description: Create a secure, SECURITY DEFINER function to retrieve visit, prescription, billing, and order details for guest users via QR code.

CREATE OR REPLACE FUNCTION public.hims_get_public_visit_portal_data(p_visit_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_visit RECORD;
    v_patient RECORD;
    v_doctor RECORD;
    v_billing RECORD;
    v_prescriptions jsonb;
    v_labs jsonb;
    v_radiology jsonb;
    v_org RECORD;
BEGIN
    -- 1. Fetch visit
    SELECT * INTO v_visit FROM public.hims_visits WHERE id = p_visit_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'الزيارة الطبية المطلوبة غير موجودة');
    END IF;

    -- 2. Fetch organization
    SELECT name, logo_url INTO v_org FROM public.organizations WHERE id = v_visit.organization_id;

    -- 3. Fetch patient details (safely excluding sensitive identifiers like national_id or phone)
    SELECT full_name, blood_type INTO v_patient FROM public.hims_patients WHERE id = v_visit.patient_id;

    -- 5. Fetch doctor details
    SELECT pr.full_name as doctor_name, d.specialty INTO v_doctor
    FROM public.hims_doctors d
    JOIN public.profiles pr ON d.profile_id = pr.id
    WHERE d.id = v_visit.doctor_id;

    -- 6. Fetch billing
    SELECT total_amount, tax_amount, patient_paid_amount, insurance_covered_amount, payment_status, insurance_provider_id
    INTO v_billing
    FROM public.hims_billing WHERE visit_id = p_visit_id;

    -- 7. Fetch prescriptions (enriched with product/drug names)
    SELECT jsonb_agg(jsonb_build_object(
        'id', pr.id,
        'medications', (
            SELECT jsonb_agg(jsonb_build_object(
                'drug_name', p.name,
                'qty', (med->>'qty')::numeric,
                'dosage', med->>'dosage',
                'frequency', med->>'frequency'
            ))
            FROM jsonb_array_elements(pr.medications) med
            JOIN public.products p ON p.id = (med->>'product_id')::uuid
        ),
        'status', pr.status,
        'created_at', pr.created_at
    )) INTO v_prescriptions
    FROM public.hims_prescriptions pr
    WHERE pr.visit_id = p_visit_id;

    -- 8. Fetch labs
    SELECT jsonb_agg(jsonb_build_object(
        'id', o.id,
        'test_name', t.test_name,
        'status', o.status,
        'result', o.result,
        'created_at', o.created_at
    )) INTO v_labs
    FROM public.hims_lab_orders o
    JOIN public.hims_lab_tests t ON o.test_id = t.id
    WHERE o.visit_id = p_visit_id;

    -- 9. Fetch radiology
    SELECT jsonb_agg(jsonb_build_object(
        'id', o.id,
        'scan_type', o.scan_type,
        'status', o.status,
        'report', o.report,
        'created_at', o.created_at
    )) INTO v_radiology
    FROM public.hims_radiology_orders o
    WHERE o.visit_id = p_visit_id;

    RETURN jsonb_build_object(
        'hospital_name', COALESCE(v_org.name, 'مستشفى التخصصي'),
        'hospital_logo', v_org.logo_url,
        'patient_name', COALESCE(v_patient.full_name, 'مريض مجهول'),
        'patient_blood', COALESCE(v_patient.blood_type, '-'),
        'doctor_name', COALESCE(v_doctor.doctor_name, '-'),
        'specialty', COALESCE(v_doctor.specialty, '-'),
        'check_in_time', v_visit.check_in_time,
        'visit_status', v_visit.status,
        'billing', CASE WHEN v_billing.total_amount IS NULL THEN NULL ELSE
            jsonb_build_object(
                'total_amount', v_billing.total_amount,
                'patient_paid_amount', v_billing.patient_paid_amount,
                'insurance_covered_amount', v_billing.insurance_covered_amount,
                'payment_status', v_billing.payment_status,
                'has_insurance', v_billing.insurance_provider_id IS NOT NULL
            ) END,
        'prescriptions', COALESCE(v_prescriptions, '[]'::jsonb),
        'labs', COALESCE(v_labs, '[]'::jsonb),
        'radiology', COALESCE(v_radiology, '[]'::jsonb)
    );
END; $$;

-- Grant execution to public guest (anon) and authenticated users
GRANT EXECUTE ON FUNCTION public.hims_get_public_visit_portal_data(uuid) TO anon, authenticated;
