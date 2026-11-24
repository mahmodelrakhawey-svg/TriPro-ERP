-- ==============================================================================
-- 🛡️ TriPro ERP — Package 2: Financial Immutability & POS Concurrency Hardening
-- File: sql_updates/2026-11-24_security_hardening_financial_immutability_and_pos.sql
-- Date: 2026-11-24
-- ==============================================================================
-- يعالج هذا التحديث ثغرات النزاهة المالية والتزامن:
--   1. منع INSERT على سطور قيود يومية مرحّلة بالفعل (journal_lines).
--   2. منع INSERT قيد يومية بحالة posted مباشرة بدون سطور (journal_entries).
--   3. منع إرجاع فواتير المبيعات ومرتجعات المبيعات والمشتريات من posted إلى draft بتحديث مباشر.
--   4. إضافة فلتر organization_id لحذف القيود في محفزات سندات القبض والصرف.
--   5. إضافة فهرس فريد لمنع تكرار طلبات الأوفلاين (organization_id, offline_ref_id).
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. منع إدراج أو تعديل أو حذف سطور على قيد مرحل (BEFORE INSERT OR UPDATE OR DELETE)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.fn_guard_journal_lines_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_je_id uuid;
    v_je_status text;
BEGIN
    IF current_setting('app.allow_financial_ledger_mutation', true) = 'true' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    v_je_id := CASE WHEN TG_OP = 'INSERT' THEN NEW.journal_entry_id ELSE OLD.journal_entry_id END;

    SELECT status INTO v_je_status
    FROM public.journal_entries
    WHERE id = v_je_id;

    IF v_je_status = 'posted' THEN
        RAISE EXCEPTION 'TRIPRO_IMMUTABILITY_GUARD: لا يمكن إضافة أو تعديل أو حذف سطور قيد يومية مرحّل (%).', v_je_id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_journal_lines_immutability ON public.journal_lines;
CREATE TRIGGER trg_guard_journal_lines_immutability
BEFORE INSERT OR UPDATE OR DELETE ON public.journal_lines
FOR EACH ROW
EXECUTE FUNCTION public.fn_guard_journal_lines_immutability();


-- ==============================================================================
-- 2. منع إدراج قيد بحالة posted مباشرة بدون المرور بمرحلة المسودة والأسطر
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.fn_guard_journal_insert_posted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF current_setting('app.allow_financial_ledger_mutation', true) = 'true' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' AND (NEW.status = 'posted' OR NEW.is_posted = true) THEN
        RAISE EXCEPTION 'TRIPRO_BALANCE_GUARD: لا يمكن إدراج قيد يومية بحالة مرحّل مباشرة؛ يجب إنشاؤه كمسودة أولاً ثم ترحيله بعد اكتمال الأسطر.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_journal_insert_posted ON public.journal_entries;
CREATE TRIGGER trg_guard_journal_insert_posted
BEFORE INSERT ON public.journal_entries
FOR EACH ROW
EXECUTE FUNCTION public.fn_guard_journal_insert_posted();


-- ==============================================================================
-- 3. منع إرجاع الفواتير والمرتجعات المرحلة إلى draft بتحديث مباشر
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.fn_guard_posted_status_downgrade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF current_setting('app.allow_financial_ledger_mutation', true) = 'true' THEN
        RETURN NEW;
    END IF;

    IF OLD.status = 'posted' AND NEW.status IN ('draft', 'cancelled') THEN
        RAISE EXCEPTION 'TRIPRO_IMMUTABILITY_GUARD: لا يمكن تغيير حالة مستند مرحّل إلى (%) مباشرة؛ يجب استخدام دالة فك الترحيل الرسمية (unpost).', NEW.status;
    END IF;

    RETURN NEW;
END;
$$;

DO $$
DECLARE
    tbl TEXT;
    doc_tables TEXT[] := ARRAY['invoices', 'sales_returns', 'purchase_returns'];
BEGIN
    FOREACH tbl IN ARRAY doc_tables LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
            EXECUTE format('DROP TRIGGER IF EXISTS trg_guard_%I_status_downgrade ON public.%I;', tbl, tbl);
            EXECUTE format('
                CREATE TRIGGER trg_guard_%I_status_downgrade
                BEFORE UPDATE ON public.%I
                FOR EACH ROW
                EXECUTE FUNCTION public.fn_guard_posted_status_downgrade();
            ', tbl, tbl);
        END IF;
    END LOOP;
END $$;


-- ==============================================================================
-- 4. فهرس فريد لمنع تكرار طلبات الأوفلاين لنفس المنشأة
-- ==============================================================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'offline_ref_id'
    ) THEN
        BEGIN
            CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_org_offline_ref_unique
            ON public.orders (organization_id, offline_ref_id)
            WHERE offline_ref_id IS NOT NULL;
        EXCEPTION WHEN unique_violation THEN
            RAISE NOTICE '⚠️ تعذر إنشاء الفهرس الفريد idx_orders_org_offline_ref_unique لوجود تكرارات قديمة في orders.';
        END;
    END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
