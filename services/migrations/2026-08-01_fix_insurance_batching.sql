-- Migration: Fix HIMS Insurance Batching Function
-- Date: 2026-08-01
-- Description: Updates hims_create_insurance_batch to remove the conflicting 'payment_status != paid' condition. 
--              This allows bills that have been finalized/paid by the cashier to be claimed from the insurance provider.

CREATE OR REPLACE FUNCTION public.hims_create_insurance_batch(
    p_insurance_provider_id uuid,
    p_batch_ref text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_claim_id uuid;
    v_total numeric := 0;
    v_org_id uuid := public.get_my_org();
BEGIN
    -- حساب إجمالي الفواتير غير المطالب بها لشركة التأمين (تم إزالة شرط payment_status != 'paid' لأن الفواتير المرحلة والجاهزة للمطالبة تكون حالتها paid)
    SELECT SUM(insurance_covered_amount) INTO v_total
    FROM public.hims_billing
    WHERE insurance_provider_id = p_insurance_provider_id
    AND insurance_claim_id IS NULL
    AND organization_id = v_org_id;

    IF v_total IS NULL OR v_total = 0 THEN
        RAISE EXCEPTION '⚠️ لا توجد فواتير معلقة لهذه الشركة لتجميعها حالياً.';
    END IF;

    INSERT INTO public.hims_insurance_claims (
        organization_id, insurance_provider_id, batch_reference, 
        status, total_claim_amount, submission_date
    ) VALUES (
        v_org_id, p_insurance_provider_id, p_batch_ref,
        'submitted', v_total, CURRENT_DATE
    ) RETURNING id INTO v_claim_id;

    -- ربط الفواتير بالمطالبة
    UPDATE public.hims_billing
    SET insurance_claim_id = v_claim_id
    WHERE insurance_provider_id = p_insurance_provider_id
    AND insurance_claim_id IS NULL
    AND organization_id = v_org_id;

    RETURN v_claim_id;
END; $$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.hims_create_insurance_batch(uuid, text) TO authenticated;
