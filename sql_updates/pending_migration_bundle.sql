-- ==============================================================================
-- 🛡️ TriPro ERP — Consolidated Pending Migrations Bundle
-- تاريخ التوليد: 2026-11-24T22:47:40.899Z
-- عدد الملفات المعلقة المجمعة: 1
-- ==============================================================================

-- ==============================================================================
-- TriPro ERP — Migration Version Tracking Table
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public._schema_migrations (
    version text PRIMARY KEY,
    filename text NOT NULL,
    checksum text,
    applied_at timestamptz DEFAULT now()
);

-- تأمين الصلاحيات وتفعيل درع RLS لمنع ثغرات الوصول غير المصرح به
ALTER TABLE public._schema_migrations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public._schema_migrations FROM anon;
REVOKE ALL ON public._schema_migrations FROM public;

GRANT SELECT ON public._schema_migrations TO anon, authenticated;
GRANT ALL ON public._schema_migrations TO service_role;

DROP POLICY IF EXISTS "schema_migrations_read_policy" ON public._schema_migrations;
CREATE POLICY "schema_migrations_read_policy" ON public._schema_migrations
    FOR SELECT TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "schema_migrations_write_policy" ON public._schema_migrations;
CREATE POLICY "schema_migrations_write_policy" ON public._schema_migrations
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);


-- ------------------------------------------------------------------------------
-- [1/1] الملف: 2026-11-25_fix_journal_guards_for_security_definer_rpcs.sql
-- ------------------------------------------------------------------------------
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

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-11-25_fix_journal_guards_for_security_definer_rpcs', '2026-11-25_fix_journal_guards_for_security_definer_rpcs.sql', '028837c1a5e40ef42f9db088ae51f51fe19aa7a44fc09e7b0cd66f70d78557fc', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

