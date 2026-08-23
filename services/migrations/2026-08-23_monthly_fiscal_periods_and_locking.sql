-- ========================================================================================
-- TriPro ERP — Monthly Fiscal Periods Management & Locking
-- تاريخ الإنشاء: 2026-08-23
-- الغرض: إدارة وقفل الفترات المالية الشهرية ومنع تسجيل أي حركات مالية في الفترات المغلقة
-- ========================================================================================

-- 1. جدول الفترات المالية الشهرية (Monthly Accounting Periods)
CREATE TABLE IF NOT EXISTS public.accounting_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    period_name TEXT NOT NULL,
    fiscal_year INTEGER NOT NULL,
    period_number INTEGER NOT NULL CHECK (period_number BETWEEN 1 AND 12),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'locked', 'closed')),
    closed_at TIMESTAMPTZ,
    closed_by UUID,
    reopened_at TIMESTAMPTZ,
    reopened_by UUID,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_org_year_period UNIQUE (organization_id, fiscal_year, period_number)
);

-- فهارس للسرعة
CREATE INDEX IF NOT EXISTS idx_accounting_periods_lookup 
ON public.accounting_periods (organization_id, fiscal_year, status);

CREATE INDEX IF NOT EXISTS idx_accounting_periods_dates 
ON public.accounting_periods (organization_id, start_date, end_date);

-- تفعيل سياسات الأمان RLS
ALTER TABLE public.accounting_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "accounting_periods_org_isolation" ON public.accounting_periods;
CREATE POLICY "accounting_periods_org_isolation" ON public.accounting_periods
    FOR ALL
    USING (organization_id = auth.uid() OR organization_id IS NOT NULL)
    WITH CHECK (organization_id = auth.uid() OR organization_id IS NOT NULL);


-- 2. دالة التوليد التلقائي لشهور السنة المالية (12 شهراً)
CREATE OR REPLACE FUNCTION public.initialize_fiscal_year_periods(p_org_id UUID, p_year INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_month INTEGER;
    v_start_date DATE;
    v_end_date DATE;
    v_month_names TEXT[] := ARRAY[
        'يناير (شهر 1)', 'فبراير (شهر 2)', 'مارس (شهر 3)', 'أبريل (شهر 4)',
        'مايو (شهر 5)', 'يونيو (شهر 6)', 'يوليو (شهر 7)', 'أغسطس (شهر 8)',
        'سبتمبر (شهر 9)', 'أكتوبر (شهر 10)', 'نوفمبر (شهر 11)', 'ديسمبر (شهر 12)'
    ];
BEGIN
    FOR v_month IN 1..12 LOOP
        v_start_date := MAKE_DATE(p_year, v_month, 1);
        v_end_date := (v_start_date + INTERVAL '1 month - 1 day')::DATE;

        INSERT INTO public.accounting_periods (
            organization_id,
            period_name,
            fiscal_year,
            period_number,
            start_date,
            end_date,
            status
        ) VALUES (
            p_org_id,
            v_month_names[v_month] || ' ' || p_year,
            p_year,
            v_month,
            v_start_date,
            v_end_date,
            'open'
        )
        ON CONFLICT (organization_id, fiscal_year, period_number) DO NOTHING;
    END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.initialize_fiscal_year_periods(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.initialize_fiscal_year_periods(UUID, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION public.initialize_fiscal_year_periods(UUID, INTEGER) TO service_role;


-- 3. تريجر حماية الفترات المغلقة: منع إنشاء أو تعديل قيود في فترات مقفلة
CREATE OR REPLACE FUNCTION public.fn_prevent_entries_in_locked_periods()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_period_name TEXT;
    v_status TEXT;
BEGIN
    -- تخطي قيود الإقفال السنوي ذات البادئة CLOSE-
    IF NEW.reference LIKE 'CLOSE-%' THEN
        RETURN NEW;
    END IF;

    SELECT period_name, status
      INTO v_period_name, v_status
      FROM public.accounting_periods
     WHERE organization_id = NEW.organization_id
       AND NEW.transaction_date BETWEEN start_date AND end_date
       AND status IN ('locked', 'closed')
     LIMIT 1;

    IF v_status IS NOT NULL THEN
        RAISE EXCEPTION 'لا يمكن حفظ أو ترحيل قيود بتاريخ (%). الفترة المحاسبية (%) مقفلة/مجمدة من الإدارة المالية.', 
            NEW.transaction_date, v_period_name;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_entries_in_locked_periods ON public.journal_entries;
CREATE TRIGGER trg_prevent_entries_in_locked_periods
BEFORE INSERT OR UPDATE OF transaction_date, status ON public.journal_entries
FOR EACH ROW
EXECUTE FUNCTION public.fn_prevent_entries_in_locked_periods();
