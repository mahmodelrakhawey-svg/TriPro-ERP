-- ==============================================================================
-- Migration: Add shift_id to employees table (ربط الموظف بالوردية)
-- التاريخ: 2026-10-03
-- ==============================================================================

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'employees' AND column_name = 'shift_id'
    ) THEN
        ALTER TABLE public.employees ADD COLUMN shift_id UUID REFERENCES public.hr_shifts(id) ON DELETE SET NULL;
    END IF;
END $$;

-- فهرس لسرعة الاستعلام والربط
CREATE INDEX IF NOT EXISTS idx_employees_shift_id ON public.employees(shift_id);

-- تعيين الوردية الافتراضية للموظفين الحاليين الذين ليس لديهم وردية
DO $$ 
DECLARE
    v_default_shift_id UUID;
BEGIN
    SELECT id INTO v_default_shift_id FROM public.hr_shifts WHERE code = 'SHIFT-MORN' LIMIT 1;
    IF v_default_shift_id IS NOT NULL THEN
        UPDATE public.employees 
        SET shift_id = v_default_shift_id 
        WHERE shift_id IS NULL;
    END IF;
END $$;
