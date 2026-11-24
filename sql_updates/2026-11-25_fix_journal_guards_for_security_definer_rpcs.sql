-- ==============================================================================
-- 🛠️ TriPro ERP — Hotfix: Allow SECURITY DEFINER RPCs in Journal Insert Guards
-- File: sql_updates/2026-11-25_fix_journal_guards_for_security_definer_rpcs.sql
-- Date: 2026-11-25
-- ==============================================================================
-- السبب:
--   بعض الدوال السيادية (SECURITY DEFINER مثل add_journal_entry) تنشئ رأس القيد
--   بحالة posted أولاً ثم تدرج السطور في نفس المعاملة الذرية دون تعيين متغير الجلسة.
-- الحل:
--   السماح لدوال الخادم (current_user IN ('postgres', 'service_role', 'supabase_admin'))
--   مع استمرار المنع الصارم لأي إدراج أو تعديل مباشر من المتصفح (authenticated / anon).
-- ==============================================================================

BEGIN;

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
    IF current_setting('app.allow_financial_ledger_mutation', true) = 'true'
       OR current_user IN ('postgres', 'service_role', 'supabase_admin')
       OR auth.role() = 'service_role' THEN
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

CREATE OR REPLACE FUNCTION public.fn_guard_journal_insert_posted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF current_setting('app.allow_financial_ledger_mutation', true) = 'true'
       OR current_user IN ('postgres', 'service_role', 'supabase_admin')
       OR auth.role() = 'service_role' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' AND (NEW.status = 'posted' OR NEW.is_posted = true) THEN
        RAISE EXCEPTION 'TRIPRO_BALANCE_GUARD: لا يمكن إدراج قيد يومية بحالة مرحّل مباشرة؛ يجب إنشاؤه كمسودة أولاً ثم ترحيله بعد اكتمال الأسطر.';
    END IF;

    RETURN NEW;
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
