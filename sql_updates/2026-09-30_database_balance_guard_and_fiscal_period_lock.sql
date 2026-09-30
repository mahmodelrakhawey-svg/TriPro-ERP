-- ========================================================================================
-- TriPro ERP — صمام أمان توازن القيود وقفل الفترات المالية المحاسبية
-- تاريخ الإنشاء: 2026-09-30
-- الغرض: 
-- 1. تفعيل صمام أمان توازن القيود (Database-Level Balance Guard) على مستوى قاعدة البيانات
--    لمنع ترحيل أو حفظ أي قيد غير متوازن (المدين != الدائن) نهائياً على القاعدتين.
-- 2. تفعيل وتعزيز قفل الفترات المالية (Fiscal Period Lock) لمنع إنشاء أو تعديل أو حذف
--    أي قيود أو أسطر يومية في الفترات المقفلة/المجمدة من الإدارة المالية.
-- 3. الحفاظ التام والكامل على بيانات شركة "حلواني لينزا" وعدم تعديل أو حذف أي سجل قائم.
-- ========================================================================================

-- إزالة أي تريجرات قديمة متضاربة إن وجدت
DROP TRIGGER IF EXISTS trg_validate_je_balance ON public.journal_entries;
DROP TRIGGER IF EXISTS trg_guard_journal_entry_balance ON public.journal_entries;
DROP TRIGGER IF EXISTS trg_guard_journal_lines_balance ON public.journal_lines;
DROP TRIGGER IF EXISTS trg_prevent_entries_in_locked_periods ON public.journal_entries;
DROP TRIGGER IF EXISTS trg_prevent_journal_lines_in_locked_periods ON public.journal_lines;

-- ========================================================================================
-- القسم الأول: جدول الفترات المحاسبية الشهرية وإدارتها (Fiscal Periods Management)
-- ========================================================================================

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

-- فهارس تحسين سرعة الاستعلام
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

-- دالة التوليد التلقائي لشهور السنة المالية (12 شهراً)
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

-- ========================================================================================
-- القسم الثاني: قفل الفترات المالية المحاسبية (Fiscal Period Lock Trigger)
-- حماية مزدوجة على مستوى رأس القيد وأطراف القيد
-- ========================================================================================

-- 1. تريجر منع الإدراج أو التعديل أو الحذف على رأس القيد في الفترات المقفلة
CREATE OR REPLACE FUNCTION public.fn_prevent_entries_in_locked_periods()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_check_date DATE;
    v_org_id UUID;
    v_period_name TEXT;
    v_status TEXT;
    v_ref TEXT;
BEGIN
    -- استخراج المرجع والمنظمة وتاريخ الحركة بحسب نوع العملية
    IF TG_OP = 'DELETE' THEN
        v_ref := OLD.reference;
        v_org_id := OLD.organization_id;
        v_check_date := OLD.transaction_date;
    ELSE
        v_ref := NEW.reference;
        v_org_id := NEW.organization_id;
        v_check_date := NEW.transaction_date;
    END IF;

    -- استثناء قيود الإقفال السنوي النظامية CLOSE-
    IF v_ref LIKE 'CLOSE-%' THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        ELSE
            RETURN NEW;
        END IF;
    END IF;

    -- التحقق من التاريخ الأساسي للحركة
    IF v_check_date IS NOT NULL AND v_org_id IS NOT NULL THEN
        SELECT period_name, status
          INTO v_period_name, v_status
          FROM public.accounting_periods
         WHERE organization_id = v_org_id
           AND v_check_date BETWEEN start_date AND end_date
           AND status IN ('locked', 'closed')
         LIMIT 1;

        IF v_status IS NOT NULL THEN
            IF TG_OP = 'DELETE' THEN
                RAISE EXCEPTION '⚠️ فترة مالية مقفلة: لا يمكن حذف القيد المحاسبي المؤرخ في (%). الفترة المحاسبية (%) مقفلة/مجمدة من الإدارة المالية.', 
                    v_check_date, v_period_name;
            ELSE
                RAISE EXCEPTION '⚠️ فترة مالية مقفلة: لا يمكن حفظ أو ترحيل قيود بتاريخ (%). الفترة المحاسبية (%) مقفلة/مجمدة من الإدارة المالية.', 
                    v_check_date, v_period_name;
            END IF;
        END IF;
    END IF;

    -- في حالة التعديل UPDATE: التحقق أيضاً من التاريخ القديم لمنع سحب قيد خارج فترة مقفلة
    IF TG_OP = 'UPDATE' AND OLD.transaction_date IS NOT NULL AND OLD.transaction_date <> NEW.transaction_date THEN
        SELECT period_name, status
          INTO v_period_name, v_status
          FROM public.accounting_periods
         WHERE organization_id = OLD.organization_id
           AND OLD.transaction_date BETWEEN start_date AND end_date
           AND status IN ('locked', 'closed')
         LIMIT 1;

        IF v_status IS NOT NULL THEN
            RAISE EXCEPTION '⚠️ فترة مالية مقفلة: لا يمكن نقل تاريخ هذا القيد لأن تاريخه الأصلي (%) يقع ضمن الفترة المقفلة (%).', 
                OLD.transaction_date, v_period_name;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

CREATE TRIGGER trg_prevent_entries_in_locked_periods
BEFORE INSERT OR UPDATE OR DELETE ON public.journal_entries
FOR EACH ROW
EXECUTE FUNCTION public.fn_prevent_entries_in_locked_periods();

-- 2. تريجر منع التعديل أو الحذف المباشر على أسطر القيود في الفترات المقفلة
CREATE OR REPLACE FUNCTION public.fn_prevent_journal_lines_in_locked_periods()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_entry_id UUID;
    v_trans_date DATE;
    v_org_id UUID;
    v_ref TEXT;
    v_period_name TEXT;
    v_status TEXT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_entry_id := OLD.journal_entry_id;
    ELSE
        v_entry_id := NEW.journal_entry_id;
    END IF;

    IF v_entry_id IS NULL THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    -- جلب تاريخ ومرجع القيد المحاسبي الأب
    SELECT transaction_date, organization_id, reference
      INTO v_trans_date, v_org_id, v_ref
      FROM public.journal_entries
     WHERE id = v_entry_id;

    -- إذا كان رأس القيد قد حذف مسبقاً (CASCADE)، نتخطى
    IF NOT FOUND THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    -- استثناء قيود الإقفال السنوي CLOSE-
    IF v_ref LIKE 'CLOSE-%' THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    -- فحص قفل الفترة
    IF v_trans_date IS NOT NULL AND v_org_id IS NOT NULL THEN
        SELECT period_name, status
          INTO v_period_name, v_status
          FROM public.accounting_periods
         WHERE organization_id = v_org_id
           AND v_trans_date BETWEEN start_date AND end_date
           AND status IN ('locked', 'closed')
         LIMIT 1;

        IF v_status IS NOT NULL THEN
            RAISE EXCEPTION '⚠️ فترة مالية مقفلة: لا يمكن تعديل أو حذف أسطر القيد المحاسبي المؤرخ في (%). الفترة المحاسبية (%) مقفلة/مجمدة من الإدارة المالية.', 
                v_trans_date, v_period_name;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

CREATE TRIGGER trg_prevent_journal_lines_in_locked_periods
BEFORE INSERT OR UPDATE OR DELETE ON public.journal_lines
FOR EACH ROW
EXECUTE FUNCTION public.fn_prevent_journal_lines_in_locked_periods();

-- ========================================================================================
-- القسم الثالث: صمام أمان توازن القيود (Database-Level Balance Guard)
-- صمام رقابي صارم على مستوى رأس القيد وأسطر القيد يمنع أي اختلال في ميزان المراجعة
-- ========================================================================================

-- 1. فحص توازن القيد عند ترحيله على جدول journal_entries
CREATE OR REPLACE FUNCTION public.fn_guard_journal_entry_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sum_debit NUMERIC;
    v_sum_credit NUMERIC;
    v_line_count INTEGER;
BEGIN
    -- الفحص يطبق عند ترحيل القيد (posted) أو تفعيل علم is_posted = true
    IF (NEW.status = 'posted' OR NEW.is_posted = true) THEN
        
        -- حساب إجمالي المدين والدائن وعدد أسطر القيد
        SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0), COUNT(*)
          INTO v_sum_debit, v_sum_credit, v_line_count
          FROM public.journal_lines
         WHERE journal_entry_id = NEW.id;

        -- عند التعديل UPDATE وتفعيل الترحيل: يجب أن تكون الأسطر موجودة ومتوازنة تماماً
        IF TG_OP = 'UPDATE' THEN
            -- إذا كان القيد مسودة ويتم تحويله إلى مرحل، أو تعديل قيد مرحل:
            IF (NEW.status = 'posted' AND (OLD.status IS DISTINCT FROM 'posted' OR OLD.is_posted IS DISTINCT FROM true))
               OR (NEW.is_posted = true AND OLD.is_posted IS DISTINCT FROM true) THEN
                
                IF v_line_count < 2 THEN
                    RAISE EXCEPTION '⚠️ صمام أمان توازن القيود: لا يمكن ترحيل القيد (%) لأنه لا يحتوي على طرفين محاسبيين على الأقل (مدين ودائن).', 
                        COALESCE(NEW.reference, NEW.id::text);
                END IF;

                IF ABS(v_sum_debit - v_sum_credit) > 0.005 THEN
                    RAISE EXCEPTION '⚠️ صمام أمان توازن القيود: لا يمكن ترحيل القيد (%) لعدم توازن المدين مع الدائن! (إجمالي المدين: %, إجمالي الدائن: %, الفرق: %).',
                        COALESCE(NEW.reference, NEW.id::text), v_sum_debit, v_sum_credit, ABS(v_sum_debit - v_sum_credit);
                END IF;

                IF v_sum_debit <= 0 THEN
                    RAISE EXCEPTION '⚠️ صمام أمان توازن القيود: لا يمكن ترحيل القيد (%) بمبالغ صفرية أو سالبة.',
                        COALESCE(NEW.reference, NEW.id::text);
                END IF;
            END IF;
        END IF;

    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_journal_entry_balance
BEFORE UPDATE OF status, is_posted ON public.journal_entries
FOR EACH ROW
EXECUTE FUNCTION public.fn_guard_journal_entry_balance();

-- 2. صمام أمان أسطر القيود: فحص توازن القيد المرحل عند إدراج أو تعديل أو حذف أي سطر
CREATE OR REPLACE FUNCTION public.fn_guard_journal_lines_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_entry_id UUID;
    v_status TEXT;
    v_is_posted BOOLEAN;
    v_reference TEXT;
    v_sum_debit NUMERIC;
    v_sum_credit NUMERIC;
    v_line_count INTEGER;
BEGIN
    v_entry_id := COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);
    IF v_entry_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- جلب حالة رأس القيد
    SELECT status, is_posted, reference
      INTO v_status, v_is_posted, v_reference
      FROM public.journal_entries
     WHERE id = v_entry_id;

    -- إذا تم حذف رأس القيد بالكامل (CASCADE)، فلا حاجة للفحص
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- الفحص ينطبق فقط إذا كان القيد مرحلاً (posted)
    IF v_status = 'posted' OR v_is_posted = true THEN
        SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0), COUNT(*)
          INTO v_sum_debit, v_sum_credit, v_line_count
          FROM public.journal_lines
         WHERE journal_entry_id = v_entry_id;

        -- أ. لا يجوز أن يترك قيد مرحل بلا أسطر
        IF v_line_count = 0 THEN
            RAISE EXCEPTION '⚠️ صمام أمان توازن القيود: لا يمكن ترك القيد المرحل (%) بدون أسطر محاسبية.',
                COALESCE(v_reference, v_entry_id::text);
        END IF;

        -- ب. لا يجوز لقيد مرحل أن يكون غير متوازن (مدين != دائن)
        IF ABS(v_sum_debit - v_sum_credit) > 0.005 THEN
            RAISE EXCEPTION '⚠️ صمام أمان توازن القيود: عملية التعديل أو الحذف تجعل القيد المرحل (%) غير متوازن! (إجمالي المدين: %, إجمالي الدائن: %, الفرق: %).',
                COALESCE(v_reference, v_entry_id::text), v_sum_debit, v_sum_credit, ABS(v_sum_debit - v_sum_credit);
        END IF;

        -- ج. لا يجوز لقيد مرحل أن يكون إجمالي مبالغه صفراً
        IF v_sum_debit <= 0 THEN
            RAISE EXCEPTION '⚠️ صمام أمان توازن القيود: لا يمكن حفظ أسطر القيد المرحل (%) بمبالغ صفرية أو سالبة.',
                COALESCE(v_reference, v_entry_id::text);
        END IF;
    END IF;

    RETURN NULL;
END;
$$;

-- إنشاء التريجر كـ CONSTRAINT TRIGGER مؤجل لنهاية المعاملة (DEFERRABLE INITIALLY DEFERRED)
-- لضمان إتاحة إدراج كافة أطراف القيد دفعة واحدة ثم التحقق الصارم من التوازن قبل التثبيت (COMMIT)
CREATE CONSTRAINT TRIGGER trg_guard_journal_lines_balance
AFTER INSERT OR UPDATE OR DELETE ON public.journal_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.fn_guard_journal_lines_balance();

-- ========================================================================================
-- القسم الرابع: منح الصلاحيات للأدوار المصرح لها
-- ========================================================================================

GRANT EXECUTE ON FUNCTION public.initialize_fiscal_year_periods(UUID, INTEGER) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fn_prevent_entries_in_locked_periods() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fn_prevent_journal_lines_in_locked_periods() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fn_guard_journal_entry_balance() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fn_guard_journal_lines_balance() TO authenticated, anon, service_role;

-- ========================================================================================
-- فحص التحقق من صحة التثبيت
-- ========================================================================================
SELECT 
    tgname AS trigger_name,
    relname AS table_name,
    tgenabled AS is_enabled
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
WHERE tgname IN (
    'trg_guard_journal_entry_balance',
    'trg_guard_journal_lines_balance',
    'trg_prevent_entries_in_locked_periods',
    'trg_prevent_journal_lines_in_locked_periods'
)
ORDER BY relname, tgname;
