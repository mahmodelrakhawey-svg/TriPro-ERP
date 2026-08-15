-- ==============================================================================
-- 🚀 مزامنة مقاولي الباطن مع جدول الموردين (Subcontractors to Suppliers Sync)
-- التاريخ: 15 أغسطس 2026
-- ==============================================================================

-- 1. إضافة عمود supplier_id في جدول subcontractors إذا لم يكن موجوداً
ALTER TABLE public.subcontractors 
ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL;

-- 2. مزامنة مقاولي الباطن الحاليين مع جدول الموردين
DO $$
DECLARE
    v_sub RECORD;
    v_supp_id UUID;
BEGIN
    FOR v_sub IN SELECT * FROM public.subcontractors LOOP
        -- البحث عن مورد بنفس الاسم في نفس المؤسسة
        SELECT id INTO v_supp_id 
        FROM public.suppliers 
        WHERE organization_id = v_sub.organization_id AND name = v_sub.name 
        LIMIT 1;

        IF v_supp_id IS NULL THEN
            INSERT INTO public.suppliers (
                organization_id, name, phone, address, contact_person, opening_balance, balance
            ) VALUES (
                v_sub.organization_id, 
                v_sub.name, 
                v_sub.phone, 
                CASE WHEN v_sub.specialty IS NOT NULL THEN 'تخصص: ' || v_sub.specialty ELSE NULL END,
                'مقاول باطن',
                0, 
                0
            ) RETURNING id INTO v_supp_id;
        END IF;

        -- ربط المقاول بالمورد
        UPDATE public.subcontractors 
        SET supplier_id = v_supp_id 
        WHERE id = v_sub.id;
    END LOOP;
END $$;

-- 3. تريجر تلقائي لإنشاء المورد فور إضافة أي مقاول باطن جديد
CREATE OR REPLACE FUNCTION public.fn_sync_subcontractor_to_supplier()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_supp_id UUID;
BEGIN
    -- البحث عن مورد موجود
    SELECT id INTO v_supp_id 
    FROM public.suppliers 
    WHERE organization_id = NEW.organization_id AND name = NEW.name 
    LIMIT 1;

    IF v_supp_id IS NULL THEN
        INSERT INTO public.suppliers (
            organization_id, name, phone, address, contact_person, opening_balance, balance
        ) VALUES (
            NEW.organization_id, 
            NEW.name, 
            NEW.phone, 
            CASE WHEN NEW.specialty IS NOT NULL THEN 'تخصص: ' || NEW.specialty ELSE NULL END,
            'مقاول باطن',
            0, 
            0
        ) RETURNING id INTO v_supp_id;
    ELSE
        UPDATE public.suppliers 
        SET phone = COALESCE(NEW.phone, phone),
            address = COALESCE(CASE WHEN NEW.specialty IS NOT NULL THEN 'تخصص: ' || NEW.specialty ELSE NULL END, address)
        WHERE id = v_supp_id;
    END IF;

    NEW.supplier_id := v_supp_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_subcontractor_to_supplier ON public.subcontractors;
CREATE TRIGGER trg_sync_subcontractor_to_supplier
BEFORE INSERT OR UPDATE OF name, phone, specialty ON public.subcontractors
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_subcontractor_to_supplier();
