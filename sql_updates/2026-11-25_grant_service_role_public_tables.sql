-- ==============================================================================
-- 🛡️ TriPro ERP — Ensure service_role Privileges on Public Schema Tables & Sequences
-- File: sql_updates/2026-11-25_grant_service_role_public_tables.sql
-- Date: 2026-11-25
-- ==============================================================================
-- السبب:
--   بعض الترحيلات الأمنية السابقة سحبت صلاحيات الجداول دون منح service_role
--   صراحةً على جداول مثل profiles و organizations، مما يسبب خطأ 42501 عند
--   استخدام service_role في دوال الخادم أو اختبارات التكامل.
-- الحل:
--   منح service_role صلاحية الوصول الكاملة على schema public (دون أي تغيير
--   على صلاحيات anon أو authenticated المحصّنة).
-- ==============================================================================

BEGIN;

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
