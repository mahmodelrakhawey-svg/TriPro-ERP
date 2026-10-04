-- =============================================================================
-- ملف هجرة قاعدة البيانات | Database Migration File
-- =============================================================================
-- الغرض  | Purpose : تطبيق ثلاثة حراس أمان محاسبي على مستوى قاعدة البيانات
--                     Implement three database-level accounting safety guards
-- الإصدار | Version : fix2
-- التاريخ | Date    : 2026-10-04
-- المشروع | Project : TriPro-ERP
-- المؤلف  | Author  : Database Migration System
-- =============================================================================
-- الحراس المضمّنون | Guards Included:
--   1. فرض توازن القيود اليومية قبل الترحيل
--      Journal balance enforcement before posting
--   2. حماية ثبات فواتير الترحيل من التعديل
--      Immutable snapshot protection for posted/paid invoices
--   3. قفل الفترات المحاسبية المغلقة
--      Fiscal period lock enforcement
-- =============================================================================


-- =============================================================================
-- GUARD 1 | الحارس الأول
-- فرض توازن القيد اليومي عند الترحيل
-- Journal Balance Enforcement Trigger on journal_entries
-- =============================================================================

-- حذف الـ trigger القديم إن وُجد | Drop old trigger if exists
DROP TRIGGER IF EXISTS trg_enforce_journal_balance ON public.journal_entries;

-- حذف الدالة القديمة إن وُجدت | Drop old function if exists
DROP FUNCTION IF EXISTS public.fn_enforce_journal_balance_on_post();

-- إنشاء دالة الحارس الأول | Create Guard 1 function
CREATE OR REPLACE FUNCTION public.fn_enforce_journal_balance_on_post()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total_debit   NUMERIC(20, 6) := 0;
    v_total_credit  NUMERIC(20, 6) := 0;
    v_difference    NUMERIC(20, 6) := 0;
    v_negative_cnt  INTEGER        := 0;
    v_ref_number    TEXT;
BEGIN
    -- فحص: هل هذا الحدث هو انتقال إلى حالة 'posted'؟
    -- Check: Is this transition TO 'posted' status?
    IF NEW.status = 'posted' AND (OLD.status IS NULL OR OLD.status != 'posted') THEN

        -- الحصول على الرقم المرجعي للقيد | Get the reference number
        v_ref_number := COALESCE(NEW.reference_number, NEW.id::TEXT, 'UNKNOWN');

        -- فحص الأرقام السالبة في بنود القيد | Check for negative amounts in journal lines
        SELECT COUNT(*)
        INTO v_negative_cnt
        FROM public.journal_lines
        WHERE journal_entry_id = NEW.id
          AND (debit < 0 OR credit < 0);

        IF v_negative_cnt > 0 THEN
            RAISE EXCEPTION
                'NEGATIVE_AMOUNT_IN_JOURNAL_LINE: القيد [%] يحتوي على مبالغ سالبة في % سطر/سطور. '
                'Journal entry [%] contains negative amounts in % line(s).',
                v_ref_number, v_negative_cnt,
                v_ref_number, v_negative_cnt;
        END IF;

        -- حساب مجموع المدين والدائن | Calculate total debit and credit
        SELECT
            COALESCE(SUM(debit),  0),
            COALESCE(SUM(credit), 0)
        INTO
            v_total_debit,
            v_total_credit
        FROM public.journal_lines
        WHERE journal_entry_id = NEW.id;

        -- حساب الفرق المطلق | Calculate absolute difference
        v_difference := ABS(v_total_debit - v_total_credit);

        -- رفع الخطأ إذا تجاوز الفرق الحد المسموح به (0.005)
        -- Raise exception if difference exceeds tolerance (0.005)
        IF v_difference > 0.005 THEN
            RAISE EXCEPTION
                'JOURNAL_IMBALANCED: القيد غير متوازن — المرجع: [%] | '
                'المدين: % | الدائن: % | الفرق: %. '
                'Journal entry not balanced — Reference: [%] | '
                'Total Debit: % | Total Credit: % | Difference: %.',
                v_ref_number, v_total_debit, v_total_credit, v_difference,
                v_ref_number, v_total_debit, v_total_credit, v_difference;
        END IF;

    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_enforce_journal_balance_on_post() IS
    'الحارس الأول: يمنع ترحيل أي قيد يومي غير متوازن أو يحتوي على مبالغ سالبة. '
    'Guard 1: Prevents posting any journal entry that is unbalanced or contains negative amounts.';

-- إنشاء الـ trigger | Create the trigger
CREATE TRIGGER trg_enforce_journal_balance
    BEFORE UPDATE
    ON public.journal_entries
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_enforce_journal_balance_on_post();

DO $$ BEGIN
    RAISE NOTICE '[✓] Guard 1 installed | الحارس الأول مثبّت: trg_enforce_journal_balance → fn_enforce_journal_balance_on_post()';
END $$;


-- =============================================================================
-- GUARD 2 | الحارس الثاني
-- حماية الفواتير المرحّلة أو المدفوعة من التعديل غير المصرّح به
-- Immutable Snapshot for Posted/Paid Invoices
-- =============================================================================

-- حذف الـ trigger القديم إن وُجد | Drop old trigger if exists
DROP TRIGGER IF EXISTS trg_protect_posted_invoice ON public.invoices;

-- حذف الدالة القديمة إن وُجدت | Drop old function if exists
DROP FUNCTION IF EXISTS public.fn_protect_posted_invoice();

-- إنشاء دالة الحارس الثاني | Create Guard 2 function
CREATE OR REPLACE FUNCTION public.fn_protect_posted_invoice()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- فحص: هل الفاتورة القديمة في حالة مرحّلة أو مدفوعة؟
    -- Check: Is the OLD invoice in 'posted' or 'paid' status?
    IF OLD.status IN ('posted', 'paid') THEN

        -- فحص تغيير المبلغ الإجمالي | Check total_amount change
        IF NEW.total_amount IS DISTINCT FROM OLD.total_amount THEN
            RAISE EXCEPTION
                'CANNOT_MODIFY_POSTED_INVOICE: الحقل % تغيّر من % إلى %. '
                'Field % changed from % to %.',
                'total_amount', OLD.total_amount, NEW.total_amount,
                'total_amount', OLD.total_amount, NEW.total_amount;
        END IF;

        -- فحص تغيير المجموع الفرعي | Check subtotal change
        IF NEW.subtotal IS DISTINCT FROM OLD.subtotal THEN
            RAISE EXCEPTION
                'CANNOT_MODIFY_POSTED_INVOICE: الحقل % تغيّر من % إلى %. '
                'Field % changed from % to %.',
                'subtotal', OLD.subtotal, NEW.subtotal,
                'subtotal', OLD.subtotal, NEW.subtotal;
        END IF;

        -- فحص تغيير مبلغ الضريبة | Check tax_amount change
        IF NEW.tax_amount IS DISTINCT FROM OLD.tax_amount THEN
            RAISE EXCEPTION
                'CANNOT_MODIFY_POSTED_INVOICE: الحقل % تغيّر من % إلى %. '
                'Field % changed from % to %.',
                'tax_amount', OLD.tax_amount, NEW.tax_amount,
                'tax_amount', OLD.tax_amount, NEW.tax_amount;
        END IF;

        -- فحص تغيير العميل | Check customer_id change
        IF NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
            RAISE EXCEPTION
                'CANNOT_MODIFY_POSTED_INVOICE: الحقل % تغيّر من % إلى %. '
                'Field % changed from % to %.',
                'customer_id', OLD.customer_id, NEW.customer_id,
                'customer_id', OLD.customer_id, NEW.customer_id;
        END IF;

        -- فحص تغيير تاريخ الفاتورة | Check invoice_date change
        IF NEW.invoice_date IS DISTINCT FROM OLD.invoice_date THEN
            RAISE EXCEPTION
                'CANNOT_MODIFY_POSTED_INVOICE: الحقل % تغيّر من % إلى %. '
                'Field % changed from % to %.',
                'invoice_date', OLD.invoice_date, NEW.invoice_date,
                'invoice_date', OLD.invoice_date, NEW.invoice_date;
        END IF;

        -- الحقول المسموح بتعديلها على الفواتير المرحّلة:
        -- Allowed changes on posted invoices:
        --   notes, warehouse_id, related_journal_entry_id,
        --   status (for paid transition), paid_amount

    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_protect_posted_invoice() IS
    'الحارس الثاني: يمنع تعديل الحقول المالية الجوهرية في الفواتير المرحّلة أو المدفوعة. '
    'Guard 2: Prevents modification of core financial fields on posted or paid invoices. '
    'Allowed changes: notes, warehouse_id, related_journal_entry_id, status, paid_amount.';

-- إنشاء الـ trigger | Create the trigger
CREATE TRIGGER trg_protect_posted_invoice
    BEFORE UPDATE
    ON public.invoices
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_protect_posted_invoice();

DO $$ BEGIN
    RAISE NOTICE '[✓] Guard 2 installed | الحارس الثاني مثبّت: trg_protect_posted_invoice → fn_protect_posted_invoice()';
END $$;


-- =============================================================================
-- GUARD 3 | الحارس الثالث
-- قفل الفترات المحاسبية المغلقة
-- Fiscal Period Lock Enforcement
-- =============================================================================

-- حذف triggers القديمة إن وُجدت | Drop old triggers if they exist
DROP TRIGGER IF EXISTS trg_prevent_entries_in_locked_periods  ON public.journal_entries;
DROP TRIGGER IF EXISTS trg_prevent_lines_in_locked_periods    ON public.journal_lines;

-- حذف الدالة القديمة إن وُجدت | Drop old function if exists
DROP FUNCTION IF EXISTS public.fn_check_fiscal_period_lock();

-- إنشاء دالة الحارس الثالث | Create Guard 3 function
CREATE OR REPLACE FUNCTION public.fn_check_fiscal_period_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_transaction_date  DATE;
    v_organization_id   UUID;
    v_period_name       TEXT;
    v_fiscal_year       TEXT;
    v_period_status     TEXT;
    v_parent_entry      RECORD;
BEGIN
    -- =====================================================================
    -- تحديد نوع الجدول الذي أطلق الـ trigger
    -- Determine which table fired the trigger
    -- =====================================================================

    IF TG_TABLE_NAME = 'journal_entries' THEN
        -- جلب بيانات القيد مباشرةً | Fetch directly from journal entry
        v_transaction_date := NEW.transaction_date;
        v_organization_id  := NEW.organization_id;

    ELSIF TG_TABLE_NAME = 'journal_lines' THEN
        -- جلب بيانات القيد الأب من journal_entries
        -- Fetch parent journal entry for date and organization
        SELECT je.transaction_date, je.organization_id
        INTO v_parent_entry
        FROM public.journal_entries je
        WHERE je.id = NEW.journal_entry_id;

        IF NOT FOUND THEN
            -- القيد الأب غير موجود، نتجاوز الفحص بأمان
            -- Parent entry not found, safely skip the check
            RETURN NEW;
        END IF;

        v_transaction_date := v_parent_entry.transaction_date;
        v_organization_id  := v_parent_entry.organization_id;

    ELSE
        -- جدول غير معروف، نتجاوز | Unknown table, skip
        RETURN NEW;
    END IF;

    -- =====================================================================
    -- البحث عن فترة مالية مغلقة أو مقفلة تحتوي على هذا التاريخ
    -- Search for a locked or closed fiscal period containing this date
    -- =====================================================================
    SELECT
        ap.period_name,
        ap.fiscal_year::TEXT,
        ap.status
    INTO
        v_period_name,
        v_fiscal_year,
        v_period_status
    FROM public.accounting_periods ap
    WHERE ap.organization_id = v_organization_id
      AND ap.start_date      <= v_transaction_date
      AND ap.end_date        >= v_transaction_date
      AND ap.status          IN ('locked', 'closed')
    LIMIT 1;

    -- إذا وُجدت فترة مغلقة، يُرفع خطأ | If a locked period found, raise exception
    IF FOUND THEN
        RAISE EXCEPTION
            'FISCAL_PERIOD_LOCKED: لا يمكن إنشاء قيود يومية في فترة مالية مقفلة — '
            'الفترة: % (%). الحالة: %. '
            'Cannot create journal entries in period % (%). Status: %.',
            v_period_name, v_fiscal_year, v_period_status,
            v_period_name, v_fiscal_year, v_period_status;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_check_fiscal_period_lock() IS
    'الحارس الثالث: يمنع إدراج أو تعديل القيود اليومية وبنودها في فترات مالية مغلقة أو مقفلة. '
    'Guard 3: Prevents INSERT/UPDATE on journal_entries and journal_lines in locked or closed fiscal periods.';

-- =====================================================================
-- إنشاء triggers الحارس الثالث بعد التحقق من وجود جدول accounting_periods
-- Create Guard 3 triggers after verifying accounting_periods table exists
-- =====================================================================

DO $$
DECLARE
    v_table_exists BOOLEAN;
BEGIN
    -- التحقق من وجود جدول الفترات المحاسبية
    -- Check if accounting_periods table exists
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name   = 'accounting_periods'
    ) INTO v_table_exists;

    IF v_table_exists THEN

        -- Trigger على journal_entries (INSERT أو UPDATE)
        -- Trigger on journal_entries (INSERT or UPDATE)
        EXECUTE $trig$
            CREATE TRIGGER trg_prevent_entries_in_locked_periods
                BEFORE INSERT OR UPDATE
                ON public.journal_entries
                FOR EACH ROW
                EXECUTE FUNCTION public.fn_check_fiscal_period_lock();
        $trig$;

        -- Trigger على journal_lines (INSERT أو UPDATE)
        -- Trigger on journal_lines (INSERT or UPDATE)
        EXECUTE $trig$
            CREATE TRIGGER trg_prevent_lines_in_locked_periods
                BEFORE INSERT OR UPDATE
                ON public.journal_lines
                FOR EACH ROW
                EXECUTE FUNCTION public.fn_check_fiscal_period_lock();
        $trig$;

        RAISE NOTICE '[✓] Guard 3 installed | الحارس الثالث مثبّت: '
                     'trg_prevent_entries_in_locked_periods & trg_prevent_lines_in_locked_periods '
                     '→ fn_check_fiscal_period_lock()';

    ELSE
        RAISE NOTICE '[⚠] Guard 3 SKIPPED | الحارس الثالث تم تخطيه: '
                     'جدول accounting_periods غير موجود. '
                     'Table accounting_periods does not exist — triggers not created.';
    END IF;
END $$;


-- =============================================================================
-- ملخص التثبيت | Installation Summary
-- =============================================================================
DO $$ BEGIN
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'Migration 2026-10-04_fix2 completed | اكتملت هجرة 2026-10-04_fix2';
    RAISE NOTICE 'Guards installed:';
    RAISE NOTICE '  [1] trg_enforce_journal_balance        → fn_enforce_journal_balance_on_post()';
    RAISE NOTICE '  [2] trg_protect_posted_invoice         → fn_protect_posted_invoice()';
    RAISE NOTICE '  [3] trg_prevent_entries_in_locked_periods & trg_prevent_lines_in_locked_periods';
    RAISE NOTICE '                                         → fn_check_fiscal_period_lock()';
    RAISE NOTICE '=================================================================';
END $$;
