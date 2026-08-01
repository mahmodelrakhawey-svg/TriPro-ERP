-- Migration: HIMS Lab Specimen Auto-Creation Trigger
-- Date: 2026-08-01
-- Description: Automatically creates a lab specimen tracking row whenever a lab order is created by a doctor.

CREATE OR REPLACE FUNCTION public.trg_hims_on_lab_order_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_category text;
    v_specimen_type text := 'دم';
    v_barcode_id text;
BEGIN
    -- Get test category to map appropriate specimen type
    SELECT category INTO v_category FROM public.hims_lab_tests WHERE id = NEW.test_id;
    
    IF v_category = 'urine' THEN
        v_specimen_type := 'بول';
    ELSIF v_category = 'swab' THEN
        v_specimen_type := 'مسحة';
    ELSE
        v_specimen_type := 'دم';
    END IF;

    -- Generate a unique readable barcode
    v_barcode_id := 'LAB-' || upper(substring(gen_random_uuid()::text from 1 for 8));
    
    INSERT INTO public.hims_lab_specimens (
        organization_id,
        lab_order_id,
        specimen_type,
        barcode_id,
        status
    ) VALUES (
        NEW.organization_id,
        NEW.id,
        v_specimen_type,
        v_barcode_id,
        'pending_collection'
    );
    
    RETURN NEW;
END; $$;

-- Bind trigger to hims_lab_orders
DROP TRIGGER IF EXISTS trg_hims_lab_order_created ON public.hims_lab_orders;

CREATE TRIGGER trg_hims_lab_order_created
AFTER INSERT ON public.hims_lab_orders
FOR EACH ROW
EXECUTE FUNCTION public.trg_hims_on_lab_order_created();
