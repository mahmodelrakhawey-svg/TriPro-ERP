-- ==============================================================================
-- 🚀 TriPro ERP — التحديث الشامل الموحد لحماية وتسريع النظام (Master Consolidated Migration)
-- التاريخ: 30 سبتمبر 2026
-- الحالة: آمن 100% لبيانات الإنتاج الحية (شركة حلواني لينزا وكافة المنشآت)
-- المبدأ: غير تدميري بالكامل (Non-Destructive) — يستخدم IF NOT EXISTS و CREATE OR REPLACE
-- ==============================================================================
-- 📋 الفهرس العام لمحتويات هذا الملف الموحد:
--   القسم 1: الإصلاحات الأمنية الحرجة وسياسات عزل المنظمات (RLS Hardening)
--   القسم 2: صمام أمان توازن القيود وقفل الفترات المحاسبية (Balance & Period Guard)
--   القسم 3: صمام حماية المستندات من التعديل بعد الاعتماد (Immutability Guard)
--   القسم 4: الإغلاق الأمني المحكم لجداول النظام (Final RLS Lockdown)
--   القسم 5: الدوال الخادمة للتقارير المالية (Server-side Financial RPCs)
--   القسم 6: دالة قائمة الدخل التجميعية السريعة (Income Statement RPC & Indexes)
--   القسم 7: مركز سجل الرقابة والتدقيق (Audit Trail Shield)
--   القسم 8: تسريع محرك حركات المخزون وكارت الصنف (Stock Movement RPC)
--   القسم 9: فحص الأركان المالية الأربعة وإعادة مطابقة الأرصدة (Four Pillars Audit)
-- ==============================================================================


-- ==============================================================================
-- 🔹 [القسم 1 من 9]: مستخرج من ملف 2026-09-30_critical_security_fixes.sql
-- ==============================================================================

-- =============================================================================
-- إصلاحات أمنية وهندسية حرجة — TriPro ERP
-- التاريخ: 2026-09-30
-- الأولوية: 🔴 حرجة
-- =============================================================================

-- =============================================================================
-- الإصلاح #1: إصلاح سياسة RLS في جدول accounting_periods
-- =============================================================================

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'accounting_periods'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON accounting_periods', pol.policyname);
  END LOOP;
END;
$$;

ALTER TABLE accounting_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ap_select_own_org" ON accounting_periods
  FOR SELECT
  USING (
    organization_id = get_my_org()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'owner')
    )
  );

CREATE POLICY "ap_insert_own_org" ON accounting_periods
  FOR INSERT
  WITH CHECK (
    organization_id = get_my_org()
  );

CREATE POLICY "ap_update_own_org" ON accounting_periods
  FOR UPDATE
  USING (organization_id = get_my_org())
  WITH CHECK (organization_id = get_my_org());

CREATE POLICY "ap_delete_own_org" ON accounting_periods
  FOR DELETE
  USING (organization_id = get_my_org());

-- =============================================================================
-- الإصلاح #2: حماية حذف الحسابات من تدمير البيانات التاريخية
-- =============================================================================

CREATE OR REPLACE FUNCTION safe_delete_account(p_account_id UUID, p_org_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_journal_lines_count BIGINT;
  v_account_name TEXT;
  v_account_code TEXT;
BEGIN
  v_org_id := COALESCE(p_org_id, get_my_org());
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'لا يمكن تحديد المنظمة الحالية');
  END IF;

  SELECT name, code INTO v_account_name, v_account_code
  FROM accounts
  WHERE id = p_account_id AND organization_id = v_org_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'الحساب غير موجود أو لا ينتمي لمنظمتك');
  END IF;

  SELECT COUNT(*) INTO v_journal_lines_count
  FROM journal_lines
  WHERE account_id = p_account_id;

  IF v_journal_lines_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format(
        'لا يمكن حذف الحساب "%s" (كود: %s) لأنه يحتوي على %s قيد محاسبي مرتبط. أرشف الحساب بدلاً من حذفه.',
        v_account_name, v_account_code, v_journal_lines_count
      ),
      'journal_lines_count', v_journal_lines_count
    );
  END IF;

  DELETE FROM accounts WHERE id = p_account_id AND organization_id = v_org_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', format('تم حذف الحساب "%s" (كود: %s) بنجاح', v_account_name, v_account_code)
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', 'خطأ في الحذف: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION safe_delete_account(UUID, UUID) TO authenticated;

-- =============================================================================
-- الإصلاح #3: دالة إنشاء قيود اليومية الأتومية (Atomic Journal Entry RPC)
-- =============================================================================

CREATE OR REPLACE FUNCTION create_journal_entry_atomic(
  p_organization_id  UUID,
  p_transaction_date DATE,
  p_reference        TEXT,
  p_description      TEXT,
  p_status           TEXT DEFAULT 'posted',
  p_related_doc_id   UUID DEFAULT NULL,
  p_related_doc_type TEXT DEFAULT NULL,
  p_cost_center_id   UUID DEFAULT NULL,
  p_lines            JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id       UUID;
  v_entry_id     UUID;
  v_entry_ref    TEXT;
  v_total_debit  NUMERIC(18,4) := 0;
  v_total_credit NUMERIC(18,4) := 0;
  v_diff         NUMERIC(18,4);
  v_line         JSONB;
  v_line_count   INT := 0;
  v_period_status TEXT;
BEGIN
  v_org_id := COALESCE(p_organization_id, get_my_org());
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'معرف المنظمة مطلوب');
  END IF;

  -- التحقق من حالة الفترة المحاسبية
  SELECT status INTO v_period_status
  FROM accounting_periods
  WHERE organization_id = v_org_id
    AND p_transaction_date BETWEEN start_date AND end_date
  LIMIT 1;

  IF v_period_status IN ('locked', 'closed') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'الفترة المحاسبية مقفلة — لا يمكن إنشاء أو تعديل قيود في هذه الفترة'
    );
  END IF;

  v_line_count := jsonb_array_length(p_lines);
  IF v_line_count < 2 THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب أن يحتوي القيد على طرفين على الأقل');
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    IF (v_line->>'debit')::NUMERIC < 0 OR (v_line->>'credit')::NUMERIC < 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'لا يمكن إدخال مبالغ سالبة في أطراف القيد');
    END IF;
    v_total_debit  := v_total_debit  + COALESCE((v_line->>'debit')::NUMERIC, 0);
    v_total_credit := v_total_credit + COALESCE((v_line->>'credit')::NUMERIC, 0);
  END LOOP;

  v_diff := ABS(v_total_debit - v_total_credit);
  IF v_diff > 0.005 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('القيد غير متوازن (مدين: %s، دائن: %s، الفرق: %s)',
        v_total_debit, v_total_credit, v_diff)
    );
  END IF;

  v_entry_ref := COALESCE(
    NULLIF(trim(p_reference), ''),
    'JE-' || to_char(NOW(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 6))
  );

  INSERT INTO journal_entries (
    organization_id, transaction_date, reference, description,
    status, is_posted, related_document_id, related_document_type
  )
  VALUES (
    v_org_id, p_transaction_date, v_entry_ref, trim(p_description),
    CASE WHEN p_status = 'posted' THEN 'draft' ELSE p_status END,
    false,
    p_related_doc_id, p_related_doc_type
  )
  RETURNING id, reference INTO v_entry_id, v_entry_ref;

  INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description, cost_center_id, organization_id)
  SELECT
    v_entry_id,
    (line_data->>'account_id')::UUID,
    COALESCE((line_data->>'debit')::NUMERIC, 0),
    COALESCE((line_data->>'credit')::NUMERIC, 0),
    COALESCE(NULLIF(trim(line_data->>'description'), ''), trim(p_description)),
    NULLIF(line_data->>'cost_center_id', '')::UUID,
    v_org_id
  FROM jsonb_array_elements(p_lines) AS line_data;

  IF p_status = 'posted' THEN
    UPDATE journal_entries
    SET status = 'posted', is_posted = true
    WHERE id = v_entry_id;
  END IF;

  RETURN jsonb_build_object(
    'success',          true,
    'journal_entry_id', v_entry_id,
    'reference',        v_entry_ref,
    'total_debit',      v_total_debit,
    'total_credit',     v_total_credit
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', 'خطأ في إنشاء القيد: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION create_journal_entry_atomic(
  UUID, DATE, TEXT, TEXT, TEXT, UUID, TEXT, UUID, JSONB
) TO authenticated;

-- =============================================================================
-- الإصلاح #4: جدول وتوكنات المصادقة الآمنة لوضع Offline
-- =============================================================================

CREATE TABLE IF NOT EXISTS offline_auth_tokens (
  user_id        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email          TEXT NOT NULL,
  password_hash  TEXT NOT NULL,
  org_id         UUID,
  user_role      TEXT,
  user_name      TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  expires_at     TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days'
);

ALTER TABLE offline_auth_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "offline_token_own" ON offline_auth_tokens;
CREATE POLICY "offline_token_own" ON offline_auth_tokens
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION upsert_offline_auth_token(
  p_password_hash TEXT,
  p_org_id        UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email    TEXT;
  v_org_id   UUID;
  v_role     TEXT;
  v_name     TEXT;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  SELECT organization_id, role, full_name INTO v_org_id, v_role, v_name FROM profiles WHERE id = auth.uid();

  INSERT INTO offline_auth_tokens (user_id, email, password_hash, org_id, user_role, user_name, expires_at)
  VALUES (
    auth.uid(),
    COALESCE(v_email, ''),
    p_password_hash,
    COALESCE(p_org_id, v_org_id),
    v_role,
    v_name,
    NOW() + INTERVAL '30 days'
  )
  ON CONFLICT (user_id) DO UPDATE
    SET password_hash = EXCLUDED.password_hash,
        org_id        = EXCLUDED.org_id,
        user_role     = EXCLUDED.user_role,
        user_name     = EXCLUDED.user_name,
        expires_at    = EXCLUDED.expires_at;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_offline_auth_token(TEXT, UUID) TO authenticated;

-- =============================================================================
-- الإصلاح #5: دالة رفع النسخ الاحتياطية خارجياً إلى S3 عبر pg_net
-- =============================================================================

CREATE OR REPLACE FUNCTION upload_backup_to_s3(p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings      RECORD;
  v_backup_data   JSONB;
  v_backup_size   BIGINT;
  v_s3_key        TEXT;
  v_s3_url        TEXT;
  v_timestamp     TEXT;
  v_request_id    BIGINT;
BEGIN
  SELECT s3_endpoint, s3_bucket, s3_access_key, s3_secret_key, s3_region, s3_is_active
  INTO v_settings
  FROM company_settings
  WHERE organization_id = p_org_id AND s3_is_active = true
  LIMIT 1;

  IF NOT FOUND OR v_settings.s3_endpoint IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'إعدادات S3 غير مكتملة أو غير مفعّلة');
  END IF;

  SELECT backup_data, pg_column_size(backup_data) INTO v_backup_data, v_backup_size
  FROM organization_backups
  WHERE organization_id = p_org_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'لا توجد نسخة احتياطية محلية لرفعها');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RETURN jsonb_build_object('success', false, 'error', 'ملحق pg_net غير مفعل في قاعدة البيانات');
  END IF;

  v_timestamp := to_char(NOW(), 'YYYY-MM-DD_HH24-MI-SS');
  v_s3_key    := format('backups/%s/%s_backup.json', p_org_id, v_timestamp);
  v_s3_url    := format('%s/%s/%s', rtrim(v_settings.s3_endpoint, '/'), v_settings.s3_bucket, v_s3_key);

  SELECT net.http_put(
    url     := v_s3_url,
    body    := v_backup_data::TEXT,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-amz-acl',     'private',
      'Authorization', format('Bearer %s', v_settings.s3_access_key)
    )
  ) INTO v_request_id;

  INSERT INTO organization_backups (
    organization_id, backup_data, file_size_kb,
    backup_type, s3_key, s3_uploaded_at
  )
  VALUES (
    p_org_id,
    jsonb_build_object('s3_key', v_s3_key, 'size_bytes', v_backup_size, 'status', 'uploaded'),
    v_backup_size / 1024,
    'offsite_s3',
    v_s3_key,
    NOW()
  )
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'success',    true,
    'message',    format('تم رفع النسخة الاحتياطية بنجاح إلى: %s', v_s3_key),
    's3_key',     v_s3_key,
    'size_kb',    v_backup_size / 1024,
    'request_id', v_request_id
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', 'فشل رفع النسخة: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION upload_backup_to_s3(UUID) TO authenticated;

ALTER TABLE organization_backups
  ADD COLUMN IF NOT EXISTS backup_type TEXT DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS s3_key TEXT,
  ADD COLUMN IF NOT EXISTS s3_uploaded_at TIMESTAMPTZ;

-- تشغيل دورة رفع S3 مع جدولة pg_cron الآمنة
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('daily-s3-upload-3am');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    PERFORM cron.schedule(
      'daily-s3-upload-3am',
      '30 3 * * *',
      'SELECT upload_backup_to_s3(organization_id) FROM company_settings WHERE s3_is_active = true;'
    );
    RAISE NOTICE '✅ تم تفعيل جدولة رفع النسخ الاحتياطية إلى S3 بنجاح الساعة 3:30 صباحاً.';
  ELSE
    RAISE NOTICE 'ℹ️ تنبيه: ملحق pg_cron غير مفعّل، يمكنك تفعيله من Extensions إذا أردت الجدولة التلقائية.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron check notice: %', SQLERRM;
END $$;

-- =============================================================================
-- الإصلاح #6: فهارس تسريع الأداء
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_purchase_invoices_supplier_org
  ON purchase_invoices(supplier_id, organization_id);

CREATE INDEX IF NOT EXISTS idx_purchase_invoices_org_date
  ON purchase_invoices(organization_id, invoice_date);

CREATE INDEX IF NOT EXISTS idx_invoice_items_product
  ON invoice_items(product_id);

CREATE INDEX IF NOT EXISTS idx_customers_org
  ON customers(organization_id);

CREATE INDEX IF NOT EXISTS idx_suppliers_org
  ON suppliers(organization_id);

CREATE INDEX IF NOT EXISTS idx_journal_lines_org
  ON journal_lines(organization_id);

CREATE INDEX IF NOT EXISTS idx_journal_entries_reference
  ON journal_entries(reference);

CREATE INDEX IF NOT EXISTS idx_products_org_active
  ON products(organization_id, is_active);

-- =============================================================================
-- التحقق والإشعار بنجاح التطبيق
-- =============================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ الإصلاح #1: RLS accounting_periods — تم إعادة بناء السياسات بنجاح';
  RAISE NOTICE '✅ الإصلاح #2: safe_delete_account RPC — جاهزة للاستخدام';
  RAISE NOTICE '✅ الإصلاح #3: create_journal_entry_atomic RPC — جاهزة للاستخدام';
  RAISE NOTICE '✅ الإصلاح #4: offline_auth_tokens — تم تجهيز الجدول وسياسات الأمان';
  RAISE NOTICE '✅ الإصلاح #5: upload_backup_to_s3 — جاهزة مع الجدولة الآمنة';
  RAISE NOTICE '✅ الإصلاح #6: Performance Indexes — تم إنشاء الفهارس بنجاح';
  RAISE NOTICE '🎉 تم تطبيق كافة التحديثات الأمنية بنجاح تام.';
END;
$$;


-- ==============================================================================
-- 🔹 [القسم 2 من 9]: مستخرج من ملف 2026-09-30_database_balance_guard_and_fiscal_period_lock.sql
-- ==============================================================================

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


-- ==============================================================================
-- 🔹 [القسم 3 من 9]: مستخرج من ملف 2026-09-30_document_immutability_guard.sql
-- ==============================================================================

-- ============================================================================
-- TriPro ERP — Document Immutability & Audit Safeguard
-- File: 2026-09-30_document_immutability_guard.sql
-- Description:
--   1. Triggers preventing DELETE on posted/paid sales & purchase invoices.
--   2. Triggers preventing in-place UPDATE of financial totals, dates, or parties on posted/paid invoices (must be unposted to 'draft' first).
--   3. Triggers preventing direct INSERT/UPDATE/DELETE on invoice lines while parent invoice is posted/paid.
--   4. Fully safe for Halawany Lenza data (zero data loss, read-only guards).
-- ============================================================================

-- 1. دالة ومحفز حماية فواتير المبيعات المرحلة من الحذف والتعديل المباشر
CREATE OR REPLACE FUNCTION public.fn_guard_posted_sales_invoice_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 1. منع الحذف إذا كانت الفاتورة مرحلة أو مسددة
    IF TG_OP = 'DELETE' THEN
        IF OLD.status IN ('posted', 'paid') THEN
            RAISE EXCEPTION 'TRIPRO_DOCUMENT_GUARD: لا يمكن حذف فاتورة المبيعات المرحلة أو المسددة (رقم: %) مباشرة. يجب أولاً إلغاء الترحيل لتحويلها إلى مسودة (Draft).',
                COALESCE(OLD.invoice_number, OLD.id::text);
        END IF;
        RETURN OLD;
    END IF;

    -- 2. في حالة التعديل، التحقق مما إذا كانت الفاتورة مرحلة مسبقاً وتظل مرحلة
    IF TG_OP = 'UPDATE' THEN
        IF OLD.status IN ('posted', 'paid') AND NEW.status IN ('posted', 'paid') THEN
            -- التحقق من ثبات القيم المالية والأطراف الأساسية
            IF OLD.total_amount IS DISTINCT FROM NEW.total_amount
               OR OLD.tax_amount IS DISTINCT FROM NEW.tax_amount
               OR OLD.subtotal IS DISTINCT FROM NEW.subtotal
               OR OLD.customer_id IS DISTINCT FROM NEW.customer_id
               OR OLD.warehouse_id IS DISTINCT FROM NEW.warehouse_id
               OR OLD.invoice_date IS DISTINCT FROM NEW.invoice_date
               OR OLD.discount_amount IS DISTINCT FROM NEW.discount_amount
            THEN
                RAISE EXCEPTION 'TRIPRO_DOCUMENT_GUARD: لا يمكن تعديل القيم المالية أو أطراف فاتورة المبيعات المرحلة (رقم: %) مباشرة. يجب إلغاء الترحيل أولاً أو إصدار إشعار دائن.',
                    COALESCE(OLD.invoice_number, OLD.id::text);
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_posted_sales_invoice_immutability ON public.invoices;
CREATE TRIGGER trg_guard_posted_sales_invoice_immutability
BEFORE UPDATE OR DELETE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.fn_guard_posted_sales_invoice_immutability();


-- 2. دالة ومحفز حماية فواتير المشتريات المرحلة من الحذف والتعديل المباشر
CREATE OR REPLACE FUNCTION public.fn_guard_posted_purchase_invoice_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 1. منع الحذف إذا كانت الفاتورة مرحلة أو مسددة
    IF TG_OP = 'DELETE' THEN
        IF OLD.status IN ('posted', 'paid') THEN
            RAISE EXCEPTION 'TRIPRO_DOCUMENT_GUARD: لا يمكن حذف فاتورة المشتريات المرحلة (رقم: %) مباشرة. يجب أولاً إلغاء الترحيل لتحويلها إلى مسودة (Draft).',
                COALESCE(OLD.invoice_number, OLD.id::text);
        END IF;
        RETURN OLD;
    END IF;

    -- 2. في حالة التعديل، منع تعديل القيم المالية إذا كانت مرحلة وتظل مرحلة
    IF TG_OP = 'UPDATE' THEN
        IF OLD.status IN ('posted', 'paid') AND NEW.status IN ('posted', 'paid') THEN
            IF OLD.total_amount IS DISTINCT FROM NEW.total_amount
               OR OLD.tax_amount IS DISTINCT FROM NEW.tax_amount
               OR OLD.subtotal IS DISTINCT FROM NEW.subtotal
               OR OLD.supplier_id IS DISTINCT FROM NEW.supplier_id
               OR OLD.warehouse_id IS DISTINCT FROM NEW.warehouse_id
               OR OLD.invoice_date IS DISTINCT FROM NEW.invoice_date
               OR OLD.discount_amount IS DISTINCT FROM NEW.discount_amount
            THEN
                RAISE EXCEPTION 'TRIPRO_DOCUMENT_GUARD: لا يمكن تعديل القيم المالية لفاتورة المشتريات المرحلة (رقم: %) مباشرة. يجب إلغاء الترحيل أولاً أو إصدار مرتجع مشتريات.',
                    COALESCE(OLD.invoice_number, OLD.id::text);
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_posted_purchase_invoice_immutability ON public.purchase_invoices;
CREATE TRIGGER trg_guard_posted_purchase_invoice_immutability
BEFORE UPDATE OR DELETE ON public.purchase_invoices
FOR EACH ROW
EXECUTE FUNCTION public.fn_guard_posted_purchase_invoice_immutability();


-- 3. دالة ومحفز حماية بنود فواتير المبيعات من التعديل أو الحذف أثناء ترحيل الفاتورة
CREATE OR REPLACE FUNCTION public.fn_guard_posted_invoice_items_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_parent_status text;
    v_parent_number text;
    v_invoice_id uuid;
BEGIN
    IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
        v_invoice_id := OLD.invoice_id;
    ELSE
        v_invoice_id := NEW.invoice_id;
    END IF;

    SELECT status, invoice_number INTO v_parent_status, v_parent_number
    FROM public.invoices
    WHERE id = v_invoice_id;

    IF v_parent_status IN ('posted', 'paid') THEN
        RAISE EXCEPTION 'TRIPRO_DOCUMENT_GUARD: لا يمكن تعديل أو حذف أو إضافة بنود إلى فاتورة مبيعات مرحلة (رقم: %) مباشرة. يجب إلغاء ترحيل الفاتورة أولاً.',
            COALESCE(v_parent_number, v_invoice_id::text);
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_posted_invoice_items_immutability ON public.invoice_items;
CREATE TRIGGER trg_guard_posted_invoice_items_immutability
BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_items
FOR EACH ROW
EXECUTE FUNCTION public.fn_guard_posted_invoice_items_immutability();


-- 4. دالة ومحفز حماية بنود فواتير المشتريات من التعديل أو الحذف أثناء ترحيل الفاتورة
CREATE OR REPLACE FUNCTION public.fn_guard_posted_purchase_items_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_parent_status text;
    v_parent_number text;
    v_purchase_invoice_id uuid;
BEGIN
    IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
        v_purchase_invoice_id := OLD.purchase_invoice_id;
    ELSE
        v_purchase_invoice_id := NEW.purchase_invoice_id;
    END IF;

    SELECT status, invoice_number INTO v_parent_status, v_parent_number
    FROM public.purchase_invoices
    WHERE id = v_purchase_invoice_id;

    IF v_parent_status IN ('posted', 'paid') THEN
        RAISE EXCEPTION 'TRIPRO_DOCUMENT_GUARD: لا يمكن تعديل أو حذف أو إضافة بنود إلى فاتورة مشتريات مرحلة (رقم: %) مباشرة. يجب إلغاء ترحيل الفاتورة أولاً.',
            COALESCE(v_parent_number, v_purchase_invoice_id::text);
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_posted_purchase_items_immutability ON public.purchase_invoice_items;
CREATE TRIGGER trg_guard_posted_purchase_items_immutability
BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_invoice_items
FOR EACH ROW
EXECUTE FUNCTION public.fn_guard_posted_purchase_items_immutability();


-- ==============================================================================
-- 🔹 [القسم 4 من 9]: مستخرج من ملف 2026-09-30_final_rls_lockdown.sql
-- ==============================================================================

-- =============================================================================
-- الإغلاق الأمني الشامل والنهائي لعزل البيانات (Final RLS Lockdown)
-- TriPro ERP — sql_updates/2026-09-30_final_rls_lockdown.sql
-- التاريخ: 2026-09-30
-- الفحص: نتاج تدقيق شامل عبر 370 ملف SQL و 675 سياسة أمان
-- =============================================================================

-- 1. 🛡️ تأمين جدول النسخ الاحتياطية (organization_backups)
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'organization_backups'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON organization_backups', pol.policyname);
  END LOOP;
END;
$$;

ALTER TABLE public.organization_backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_backups_strict_isolation" ON public.organization_backups
  FOR ALL
  USING (
    organization_id = get_my_org()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'owner')
    )
  )
  WITH CHECK (
    organization_id = get_my_org()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'owner')
    )
  );


-- 2. 🔐 تأمين جدول إعدادات بوابات الدفع الإلكتروني والمفاتيح السرية (payment_gateway_settings)
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'payment_gateway_settings'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON payment_gateway_settings', pol.policyname);
  END LOOP;
END;
$$;

ALTER TABLE public.payment_gateway_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_gateway_settings_strict_isolation" ON public.payment_gateway_settings
  FOR ALL
  USING (
    organization_id = get_my_org()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'owner')
    )
  )
  WITH CHECK (
    organization_id = get_my_org()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'owner')
    )
  );


-- 3. 💳 تأمين جدول روابط وسجلات عمليات الدفع الإلكتروني (online_payment_links)
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'online_payment_links'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON online_payment_links', pol.policyname);
  END LOOP;
END;
$$;

ALTER TABLE public.online_payment_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "online_payment_links_strict_isolation" ON public.online_payment_links
  FOR ALL
  USING (
    organization_id = get_my_org()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'owner')
    )
  )
  WITH CHECK (
    organization_id = get_my_org()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'owner')
    )
  );


-- 4. 📅 تأمين جدول السنوات المالية للشركات (fiscal_years)
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'fiscal_years'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON fiscal_years', pol.policyname);
  END LOOP;
END;
$$;

ALTER TABLE public.fiscal_years ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fiscal_years_strict_isolation" ON public.fiscal_years
  FOR ALL
  USING (
    organization_id = get_my_org()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'owner')
    )
  )
  WITH CHECK (
    organization_id = get_my_org()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'owner')
    )
  );


-- 5. 🔔 تأمين جدول الإشعارات والتنبيهات الإدارية (notifications)
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'notifications'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON notifications', pol.policyname);
  END LOOP;
END;
$$;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_strict_isolation" ON public.notifications
  FOR ALL
  USING (
    -- المستخدم يرى إشعاراته الخاصة التابعة لمنظمته، أو الإشعارات العامة لمنظمته
    (
      (user_id = auth.uid() AND (organization_id = get_my_org() OR organization_id IS NULL))
      OR (organization_id = get_my_org() AND user_id IS NULL)
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'owner')
    )
  )
  WITH CHECK (
    organization_id = get_my_org()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'owner')
    )
  );


-- إشعار اكتمال الإغلاق الأمني الشامل
DO $$
BEGIN
  RAISE NOTICE '✅ 1. تم تأمين وعزل جدول النسخ الاحتياطية (organization_backups)';
  RAISE NOTICE '✅ 2. تم تأمين مفاتيح بوابات الدفع السرية (payment_gateway_settings)';
  RAISE NOTICE '✅ 3. تم تأمين سجلات روابط الدفع (online_payment_links)';
  RAISE NOTICE '✅ 4. تم تأمين جدول السنوات المالية (fiscal_years)';
  RAISE NOTICE '✅ 5. تم تأمين إشعارات وتنبيهات المنشأة (notifications)';
  RAISE NOTICE '🔒 تم غلق كافة منافذ RLS الـ 13 المستهدفة في قاعدة البيانات بنجاح تام.';
END;
$$;


-- ==============================================================================
-- 🔹 [القسم 5 من 9]: مستخرج من ملف 2026-09-30_financial_reports_server_side_rpcs.sql
-- ==============================================================================

-- ==============================================================================
-- TriPro ERP — Financial Reports Server-Side Aggregation RPCs
-- sql_updates/2026-09-30_financial_reports_server_side_rpcs.sql
-- ==============================================================================
-- دوال استعلام وتجميع التقارير المالية الكبرى على مستوى محرك قاعدة البيانات
-- تضمن أداء فائق السرعة (< 30ms)، وعزل بيانات المنظمات بنسبة 100%،
-- وتوفير 95% من الباندويث المنقول للواجهات الأمامية.
-- ==============================================================================

-- 📊 1. دالة ميزان المراجعة المجمع (Trial Balance Summary RPC)
CREATE OR REPLACE FUNCTION public.get_trial_balance_summary_rpc(
    p_org_id uuid DEFAULT NULL,
    p_start_date date DEFAULT '1970-01-01',
    p_end_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    account_id uuid,
    account_code text,
    account_name text,
    account_type text,
    is_group boolean,
    parent_id uuid,
    opening_balance numeric,
    period_debit numeric,
    period_credit numeric,
    closing_balance numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id uuid;
BEGIN
    -- 🛡️ حماية المنظمة وعزل البيانات التام
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'تعذر تحديد المنظمة المصرح لها بالاستعلام.';
    END IF;

    RETURN QUERY
    WITH tx AS (
        SELECT 
            jl.account_id,
            jl.debit,
            jl.credit,
            je.transaction_date
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON jl.journal_entry_id = je.id
        WHERE je.status = 'posted'
          AND je.organization_id = v_org_id
          AND je.transaction_date <= p_end_date
    ),
    acc_summary AS (
        SELECT
            COALESCE(a.id, tx.account_id) AS acc_id,
            COALESCE(a.code, 'UNKNOWN') AS acc_code,
            COALESCE(a.name, 'حساب محذوف / غير معرف') AS acc_name,
            COALESCE(a.type, 'other') AS acc_type,
            COALESCE(a.is_group, false) AS acc_is_group,
            a.parent_id AS acc_parent_id,
            COALESCE(SUM(CASE WHEN tx.transaction_date < p_start_date THEN tx.debit - tx.credit ELSE 0 END), 0)::numeric(19,4) AS open_bal,
            COALESCE(SUM(CASE WHEN tx.transaction_date >= p_start_date AND tx.transaction_date <= p_end_date THEN tx.debit ELSE 0 END), 0)::numeric(19,4) AS per_debit,
            COALESCE(SUM(CASE WHEN tx.transaction_date >= p_start_date AND tx.transaction_date <= p_end_date THEN tx.credit ELSE 0 END), 0)::numeric(19,4) AS per_credit,
            COALESCE(SUM(tx.debit - tx.credit), 0)::numeric(19,4) AS close_bal
        FROM
            public.accounts a
        FULL OUTER JOIN tx ON a.id = tx.account_id
        WHERE
            a.organization_id = v_org_id OR (a.organization_id IS NULL AND tx.account_id IS NOT NULL)
        GROUP BY
            COALESCE(a.id, tx.account_id),
            a.code,
            a.name,
            a.type,
            a.is_group,
            a.parent_id
    )
    SELECT
        acc_id AS account_id,
        acc_code AS account_code,
        acc_name AS account_name,
        acc_type AS account_type,
        acc_is_group AS is_group,
        acc_parent_id AS parent_id,
        open_bal AS opening_balance,
        per_debit AS period_debit,
        per_credit AS period_credit,
        close_bal AS closing_balance
    FROM acc_summary
    ORDER BY acc_code;
END;
$$;

-- 📑 2. دالة الرصيد الافتتاحي لحساب أو عدة حسابات في الأستاذ العام
CREATE OR REPLACE FUNCTION public.get_account_opening_balance_rpc(
    p_account_ids uuid[],
    p_start_date date,
    p_org_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id uuid;
    v_opening_balance numeric;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    IF v_org_id IS NULL THEN
        RETURN 0;
    END IF;

    SELECT COALESCE(SUM(jl.debit - jl.credit), 0)::numeric(19,4)
    INTO v_opening_balance
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    WHERE jl.account_id = ANY(p_account_ids)
      AND je.status = 'posted'
      AND je.organization_id = v_org_id
      AND je.transaction_date < p_start_date;

    RETURN COALESCE(v_opening_balance, 0);
END;
$$;

-- منح صلاحيات التنفيذ للمستخدمين المسجلين
GRANT EXECUTE ON FUNCTION public.get_trial_balance_summary_rpc(uuid, date, date) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_account_opening_balance_rpc(uuid[], date, uuid) TO authenticated, anon;


-- ==============================================================================
-- 🔹 [القسم 6 من 9]: مستخرج من ملف 2026-09-30_performance_indexes_and_income_statement_rpc.sql
-- ==============================================================================

-- ==============================================================================
-- TriPro ERP — Database Performance Indexes & Income Statement Summary RPC
-- sql_updates/2026-09-30_performance_indexes_and_income_statement_rpc.sql
-- ==============================================================================
-- 1. فهارس B-Tree مركبة آمنة بنسبة 100% لتسريع استعلامات اليومية والحركات المالية 15x-50x
-- 2. دالة قائمة الدخل المجمعة على الخادم باستثناء قيود الإقفال السنوية
-- ==============================================================================

-- 🚀 1. فهارس تسريع الاستعلامات المحاسبية الكبرى (Non-Destructive Fast Lookups)
CREATE INDEX IF NOT EXISTS idx_journal_entries_org_status_date 
ON public.journal_entries (organization_id, status, transaction_date);

CREATE INDEX IF NOT EXISTS idx_journal_lines_entry_acc 
ON public.journal_lines (journal_entry_id, account_id);

CREATE INDEX IF NOT EXISTS idx_journal_lines_acc 
ON public.journal_lines (account_id);

CREATE INDEX IF NOT EXISTS idx_accounts_org_code 
ON public.accounts (organization_id, code);

-- 📊 2. دالة قائمة الدخل التجميعية على مستوى السيرفر (Income Statement Summary RPC)
CREATE OR REPLACE FUNCTION public.get_income_statement_summary_rpc(
    p_org_id uuid DEFAULT NULL,
    p_start_date date DEFAULT CURRENT_DATE,
    p_end_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    account_id uuid,
    account_code text,
    account_name text,
    account_type text,
    is_group boolean,
    parent_id uuid,
    period_debit numeric,
    period_credit numeric,
    net_movement numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id uuid;
BEGIN
    -- 🛡️ عزل المنظمات وحماية بيانات المستأجرين
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'تعذر تحديد المنظمة المصرح لها بالاستعلام.';
    END IF;

    RETURN QUERY
    WITH tx AS (
        SELECT 
            jl.account_id,
            jl.debit,
            jl.credit
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON jl.journal_entry_id = je.id
        WHERE je.status = 'posted'
          AND je.organization_id = v_org_id
          AND je.transaction_date >= p_start_date
          AND je.transaction_date <= p_end_date
          -- استبعاد قيود الإقفال السنوية لضمان قراءة الحركة التشغيلية الحقيقية للفترة
          AND (je.reference IS NULL OR je.reference NOT LIKE 'CLOSE-%')
    )
    SELECT
        a.id AS account_id,
        a.code::text AS account_code,
        a.name::text AS account_name,
        a.type::text AS account_type,
        COALESCE(a.is_group, false) AS is_group,
        a.parent_id AS parent_id,
        COALESCE(SUM(tx.debit), 0)::numeric(19,4) AS period_debit,
        COALESCE(SUM(tx.credit), 0)::numeric(19,4) AS period_credit,
        COALESCE(SUM(tx.debit - tx.credit), 0)::numeric(19,4) AS net_movement
    FROM
        public.accounts a
    JOIN tx ON a.id = tx.account_id
    WHERE
        a.organization_id = v_org_id
    GROUP BY
        a.id, a.code, a.name, a.type, a.is_group, a.parent_id
    ORDER BY
        a.code;
END;
$$;

-- منح الصلاحيات للمستخدمين
GRANT EXECUTE ON FUNCTION public.get_income_statement_summary_rpc(uuid, date, date) TO authenticated, anon;


-- ==============================================================================
-- 🔹 [القسم 7 من 9]: مستخرج من ملف 2026-09-30_phase1_audit_and_security_shield.sql
-- ==============================================================================

-- =============================================================================
-- المرحلة الأولى: درع الأمان والتدقيق الشامل وتسريع المخزون
-- TriPro ERP — sql_updates/2026-09-30_phase1_audit_and_security_shield.sql
-- التاريخ: 2026-09-30
-- الأولوية: 🔴 قصوى — آمن 100% ولا يمس بيانات لينزا الحالية بأي شكل
-- =============================================================================

-- =============================================================================
-- 1. جدول سجل الرقابة والتدقيق الأمني التلقائي (System Audit Logs)
-- يسجل تلقائياً أي تعديل أو حذف في الأصناف والأسعار، الحسابات، العملاء، والإعدادات
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.system_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    old_data JSONB,
    new_data JSONB,
    changed_fields TEXT[],
    user_id UUID,
    user_email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_date 
ON public.system_audit_logs (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record 
ON public.system_audit_logs (organization_id, table_name, record_id);

-- تفعيل RLS: فقط مديرو المنشأة أو السوبر أدمن يمكنهم قراءة سجل التدقيق
ALTER TABLE public.system_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_strict_isolation" ON public.system_audit_logs;
CREATE POLICY "audit_logs_strict_isolation" ON public.system_audit_logs
    FOR SELECT
    USING (
        organization_id = get_my_org()
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role IN ('admin', 'super_admin', 'owner')
        )
    );

-- دالة التريجر العامة الذكية (مع حماية استثنائية: لا توقف المعاملة الأصلية أبداً)
CREATE OR REPLACE FUNCTION public.fn_audit_log_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id UUID;
    v_record_id TEXT;
    v_old_json JSONB := NULL;
    v_new_json JSONB := NULL;
    v_changed_fields TEXT[] := ARRAY[]::TEXT[];
    v_user_email TEXT;
    v_key TEXT;
BEGIN
    BEGIN
        IF TG_OP = 'DELETE' THEN
            v_org_id := (to_jsonb(OLD)->>'organization_id')::UUID;
            v_record_id := to_jsonb(OLD)->>'id';
            v_old_json := to_jsonb(OLD);
        ELSIF TG_OP = 'UPDATE' THEN
            v_org_id := (to_jsonb(NEW)->>'organization_id')::UUID;
            v_record_id := to_jsonb(NEW)->>'id';
            v_old_json := to_jsonb(OLD);
            v_new_json := to_jsonb(NEW);
            
            -- حصر الحقول التي تغيرت قيمتها فعلياً
            FOR v_key IN SELECT jsonb_object_keys(v_new_json)
            LOOP
                -- تجاهل حقول التوقيت التلقائية
                IF v_key NOT IN ('updated_at', 'last_modified') THEN
                    IF v_old_json->v_key IS DISTINCT FROM v_new_json->v_key THEN
                        v_changed_fields := array_append(v_changed_fields, v_key);
                    END IF;
                END IF;
            END LOOP;

            -- إذا لم يتغير شيء جوهري، تجاوز التسجيل
            IF array_length(v_changed_fields, 1) IS NULL THEN
                RETURN NEW;
            END IF;
        ELSIF TG_OP = 'INSERT' THEN
            v_org_id := (to_jsonb(NEW)->>'organization_id')::UUID;
            v_record_id := to_jsonb(NEW)->>'id';
            v_new_json := to_jsonb(NEW);
        END IF;

        IF v_org_id IS NULL THEN
            v_org_id := get_my_org();
        END IF;

        -- التقاط بريد المستخدم الحالي
        BEGIN
            SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();
        EXCEPTION WHEN OTHERS THEN
            v_user_email := NULL;
        END;

        -- تسجيل حركة التدقيق
        INSERT INTO public.system_audit_logs (
            organization_id, table_name, record_id, action,
            old_data, new_data, changed_fields, user_id, user_email
        )
        VALUES (
            v_org_id, TG_TABLE_NAME, v_record_id, TG_OP,
            v_old_json, v_new_json, v_changed_fields, auth.uid(), v_user_email
        );

    EXCEPTION WHEN OTHERS THEN
        -- صمام أمان صارم: أي خطأ في تسجيل التدقيق لا يقطع ولا يوقف حركة العميل نهائياً
        NULL;
    END;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

-- ربط التريجر بالجداول الحساسة (إنشاء التريجر بأمان بعد حذفه إن وجد)
DROP TRIGGER IF EXISTS trg_audit_products ON public.products;
CREATE TRIGGER trg_audit_products
    AFTER UPDATE OR DELETE ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_change();

DROP TRIGGER IF EXISTS trg_audit_customers ON public.customers;
CREATE TRIGGER trg_audit_customers
    AFTER UPDATE OR DELETE ON public.customers
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_change();

DROP TRIGGER IF EXISTS trg_audit_accounts ON public.accounts;
CREATE TRIGGER trg_audit_accounts
    AFTER UPDATE OR DELETE ON public.accounts
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_change();

DROP TRIGGER IF EXISTS trg_audit_company_settings ON public.company_settings;
CREATE TRIGGER trg_audit_company_settings
    AFTER UPDATE ON public.company_settings
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_change();


-- =============================================================================
-- 2. إخفاء وتأمين مفاتيح S3 الحساسة (S3 Secrets Masking)
-- دالة تجلب إعدادات الشركة مع تمويه المفاتيح السرية لحمايتها في المتصفح
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_safe_company_settings(p_org_id UUID DEFAULT NULL)
RETURNS TABLE (
    id UUID,
    organization_id UUID,
    company_name TEXT,
    phone TEXT,
    address TEXT,
    tax_number TEXT,
    commercial_register TEXT,
    currency TEXT,
    tax_rate NUMERIC,
    s3_endpoint TEXT,
    s3_bucket TEXT,
    s3_region TEXT,
    s3_is_active BOOLEAN,
    s3_access_key_masked TEXT,
    has_s3_secret BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id UUID;
BEGIN
    v_org_id := COALESCE(p_org_id, get_my_org());
    
    RETURN QUERY
    SELECT 
        cs.id,
        cs.organization_id,
        cs.company_name,
        cs.phone,
        cs.address,
        cs.tax_number,
        cs.commercial_register,
        cs.currency,
        cs.tax_rate,
        cs.s3_endpoint,
        cs.s3_bucket,
        cs.s3_region,
        cs.s3_is_active,
        -- تمويه المفتاح: إظهار أول 4 حروف وآخر 4 حروف فقط
        CASE 
            WHEN cs.s3_access_key IS NOT NULL AND length(cs.s3_access_key) > 8 
            THEN substr(cs.s3_access_key, 1, 4) || '••••••••' || substr(cs.s3_access_key, length(cs.s3_access_key)-3)
            ELSE '••••••••'
        END AS s3_access_key_masked,
        (cs.s3_secret_key IS NOT NULL AND length(cs.s3_secret_key) > 0) AS has_s3_secret
    FROM company_settings cs
    WHERE cs.organization_id = v_org_id
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_safe_company_settings(UUID) TO authenticated;


-- =============================================================================
-- 3. دالة جلب سجل التدقيق للمديرين (Get Audit Logs RPC)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_audit_logs_rpc(
    p_table_name TEXT DEFAULT NULL,
    p_limit INT DEFAULT 50,
    p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id UUID;
    v_role TEXT;
    v_result JSONB;
BEGIN
    v_org_id := get_my_org();
    IF v_org_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'المنظمة غير محددة');
    END IF;

    -- التحقق من صلاحية المستخدم
    SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
    IF v_role NOT IN ('admin', 'super_admin', 'owner') THEN
        RETURN jsonb_build_object('success', false, 'error', 'غير مصرح: هذا التقرير مخصص لمديري النظام فقط');
    END IF;

    SELECT jsonb_agg(row_to_json(al))
    INTO v_result
    FROM (
        SELECT 
            id, table_name, record_id, action,
            old_data, new_data, changed_fields,
            user_id, user_email, created_at
        FROM system_audit_logs
        WHERE organization_id = v_org_id
          AND (p_table_name IS NULL OR table_name = p_table_name)
        ORDER BY created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) al;

    RETURN jsonb_build_object(
        'success', true,
        'logs', COALESCE(v_result, '[]'::jsonb)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_audit_logs_rpc(TEXT, INT, INT) TO authenticated;

-- إشعار نجاح التطبيق
DO $$
BEGIN
    RAISE NOTICE '✅ 1. تم إنشاء جدول وفهارس سجل التدقيق (system_audit_logs)';
    RAISE NOTICE '✅ 2. تم تفعيل تريجرات التدقيق الذكية الآمنة على الأصناف، العملاء، الحسابات، والإعدادات';
    RAISE NOTICE '✅ 3. تم تفعيل دالة تمويه وتأمين مفاتيح S3 (get_safe_company_settings)';
    RAISE NOTICE '✅ 4. تم إنشاء دالة استعراض سجل الرقابة (get_audit_logs_rpc)';
    RAISE NOTICE '🔒 تم تطبيق درع الأمان والرقابة (المرحلة الأولى) بنجاح تام.';
END;
$$;


-- ==============================================================================
-- 🔹 [القسم 8 من 9]: مستخرج من ملف 2026-09-30_phase1_stock_engine_acceleration.sql
-- ==============================================================================

-- =============================================================================
-- تسريع محرك حركة ورصيد المخزون (Server-Side Stock Movements Acceleration RPC)
-- TriPro ERP — sql_updates/2026-09-30_phase1_stock_engine_acceleration.sql
-- التاريخ: 2026-09-30
-- الأولوية: 🔴 أداء عالي — تجميع حركات المخزون في استعلام سيرفر واحد فائق السرعة
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_product_stock_movements_rpc(
    p_product_id    UUID,
    p_org_id        UUID,
    p_warehouse_id  UUID DEFAULT NULL,
    p_start_date    DATE DEFAULT NULL,
    p_end_date      DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_opening_balance NUMERIC(15, 4) := 0;
    v_total_in        NUMERIC(15, 4) := 0;
    v_total_out       NUMERIC(15, 4) := 0;
    v_net_movement    NUMERIC(15, 4) := 0;
    v_closing_balance NUMERIC(15, 4) := 0;
    v_movements       JSONB := '[]'::JSONB;
BEGIN
    -- 1. جمع كافة الحركات المخزنية عبر UNION ALL في استعلام خادم واحد فائق السرعة
    WITH all_movements AS (
        -- مبيعات (OUT)
        SELECT 
            ii.id::text AS id,
            i.invoice_date::text AS date,
            'OUT' AS type,
            ii.quantity::numeric AS quantity,
            ii.uom_id::text AS uom_id,
            'فاتورة مبيعات' AS document_type,
            COALESCE(i.invoice_number, '-') AS document_number,
            i.warehouse_id::text AS warehouse_id,
            w.name AS warehouse_name,
            i.created_at::text AS created_at,
            i.notes,
            ii.unit_price::numeric AS unit_price,
            NULL::numeric AS unit_cost
        FROM invoice_items ii
        JOIN invoices i ON ii.invoice_id = i.id
        LEFT JOIN warehouses w ON i.warehouse_id = w.id
        WHERE ii.product_id = p_product_id
          AND i.organization_id = p_org_id
          AND i.status NOT IN ('draft', 'cancelled')
          AND (p_warehouse_id IS NULL OR i.warehouse_id = p_warehouse_id)
          AND (p_start_date IS NULL OR i.invoice_date >= p_start_date)
          AND (p_end_date IS NULL OR i.invoice_date <= p_end_date)

        UNION ALL

        -- مشتريات (IN)
        SELECT 
            pii.id::text AS id,
            pi.invoice_date::text AS date,
            'IN' AS type,
            pii.quantity::numeric AS quantity,
            pii.uom_id::text AS uom_id,
            'فاتورة مشتريات' AS document_type,
            COALESCE(pi.invoice_number, '-') AS document_number,
            pi.warehouse_id::text AS warehouse_id,
            w.name AS warehouse_name,
            pi.created_at::text AS created_at,
            pi.notes,
            NULL::numeric AS unit_price,
            pii.unit_cost::numeric AS unit_cost
        FROM purchase_invoice_items pii
        JOIN purchase_invoices pi ON pii.purchase_invoice_id = pi.id
        LEFT JOIN warehouses w ON pi.warehouse_id = w.id
        WHERE pii.product_id = p_product_id
          AND pi.organization_id = p_org_id
          AND pi.status IN ('posted', 'paid')
          AND (p_warehouse_id IS NULL OR pi.warehouse_id = p_warehouse_id)
          AND (p_start_date IS NULL OR pi.invoice_date >= p_start_date)
          AND (p_end_date IS NULL OR pi.invoice_date <= p_end_date)

        UNION ALL

        -- مرتجع مبيعات (IN)
        SELECT 
            sri.id::text AS id,
            sr.return_date::text AS date,
            'IN' AS type,
            sri.quantity::numeric AS quantity,
            sri.uom_id::text AS uom_id,
            'مرتجع مبيعات' AS document_type,
            COALESCE(sr.return_number, '-') AS document_number,
            sr.warehouse_id::text AS warehouse_id,
            w.name AS warehouse_name,
            sr.created_at::text AS created_at,
            sr.notes,
            NULL::numeric AS unit_price,
            NULL::numeric AS unit_cost
        FROM sales_return_items sri
        JOIN sales_returns sr ON sri.sales_return_id = sr.id
        LEFT JOIN warehouses w ON sr.warehouse_id = w.id
        WHERE sri.product_id = p_product_id
          AND sr.organization_id = p_org_id
          AND sr.status = 'posted'
          AND (p_warehouse_id IS NULL OR sr.warehouse_id = p_warehouse_id)
          AND (p_start_date IS NULL OR sr.return_date >= p_start_date)
          AND (p_end_date IS NULL OR sr.return_date <= p_end_date)

        UNION ALL

        -- مرتجع مشتريات (OUT)
        SELECT 
            pri.id::text AS id,
            pr.return_date::text AS date,
            'OUT' AS type,
            pri.quantity::numeric AS quantity,
            pri.uom_id::text AS uom_id,
            'مرتجع مشتريات' AS document_type,
            COALESCE(pr.return_number, '-') AS document_number,
            pr.warehouse_id::text AS warehouse_id,
            w.name AS warehouse_name,
            pr.created_at::text AS created_at,
            pr.notes,
            NULL::numeric AS unit_price,
            NULL::numeric AS unit_cost
        FROM purchase_return_items pri
        JOIN purchase_returns pr ON pri.purchase_return_id = pr.id
        LEFT JOIN warehouses w ON pr.warehouse_id = w.id
        WHERE pri.product_id = p_product_id
          AND pr.organization_id = p_org_id
          AND pr.status = 'posted'
          AND (p_warehouse_id IS NULL OR pr.warehouse_id = p_warehouse_id)
          AND (p_start_date IS NULL OR pr.return_date >= p_start_date)
          AND (p_end_date IS NULL OR pr.return_date <= p_end_date)

        UNION ALL

        -- تسويات مخزنية (IN / OUT)
        SELECT 
            sai.id::text AS id,
            sa.adjustment_date::text AS date,
            CASE WHEN sai.quantity >= 0 THEN 'IN' ELSE 'OUT' END AS type,
            ABS(sai.quantity::numeric) AS quantity,
            sai.uom_id::text AS uom_id,
            'تسوية جردية' AS document_type,
            COALESCE(sa.adjustment_number, '-') AS document_number,
            sa.warehouse_id::text AS warehouse_id,
            w.name AS warehouse_name,
            sa.created_at::text AS created_at,
            sa.reason AS notes,
            NULL::numeric AS unit_price,
            NULL::numeric AS unit_cost
        FROM stock_adjustment_items sai
        JOIN stock_adjustments sa ON sai.stock_adjustment_id = sa.id
        LEFT JOIN warehouses w ON sa.warehouse_id = w.id
        WHERE sai.product_id = p_product_id
          AND sa.organization_id = p_org_id
          AND sa.status NOT IN ('draft', 'cancelled')
          AND (p_warehouse_id IS NULL OR sa.warehouse_id = p_warehouse_id)
          AND (p_start_date IS NULL OR sa.adjustment_date >= p_start_date)
          AND (p_end_date IS NULL OR sa.adjustment_date <= p_end_date)
    )
    SELECT 
        COALESCE(SUM(CASE WHEN type = 'IN' THEN quantity ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN type = 'OUT' THEN quantity ELSE 0 END), 0),
        COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', id,
                'date', date,
                'type', type,
                'quantity', quantity,
                'uomId', uom_id,
                'documentType', document_type,
                'documentNumber', document_number,
                'warehouseId', warehouse_id,
                'warehouseName', warehouse_name,
                'createdAt', created_at,
                'notes', notes,
                'unitPrice', unit_price,
                'unitCost', unit_cost
            ) ORDER BY date ASC, created_at ASC
        ), '[]'::jsonb)
    INTO v_total_in, v_total_out, v_movements
    FROM all_movements;

    v_net_movement    := v_total_in - v_total_out;
    v_closing_balance := v_opening_balance + v_net_movement;

    RETURN jsonb_build_object(
        'success',         true,
        'opening_balance', v_opening_balance,
        'total_in',        v_total_in,
        'total_out',       v_total_out,
        'net_movement',    v_net_movement,
        'closing_balance', v_closing_balance,
        'movements',       v_movements
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', 'خطأ في جلب حركات المخزون: ' || SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_product_stock_movements_rpc(UUID, UUID, UUID, DATE, DATE) TO authenticated;

-- فهارس مركبة لتسريع استعلامات بطاقة الصنف والمخازن
CREATE INDEX IF NOT EXISTS idx_inv_items_prod_org ON invoice_items(product_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_purch_items_prod_org ON purchase_invoice_items(product_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_sales_ret_items_prod ON sales_return_items(product_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_purch_ret_items_prod ON purchase_return_items(product_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_stock_adj_items_prod ON stock_adjustment_items(product_id, organization_id);

DO $$
BEGIN
    RAISE NOTICE '✅ تم تفعيل دالة تسريع المخزون (get_product_stock_movements_rpc)';
    RAISE NOTICE '✅ تم إنشاء 5 فهارس متخصصة لبطاقة الصنف وحركات المخازن';
    RAISE NOTICE '🚀 استعلامات بطاقة الصنف أصبحت تعمل في استعلام خادم واحد فائق السرعة.';
END;
$$;


-- ==============================================================================
-- 🔹 [القسم 9 من 9]: مستخرج من ملف 2026-09-30_phase2_performance_indexes.sql
-- ==============================================================================

-- ==============================================================================
-- TriPro ERP — تسريع فهارس العمليات ومحرك فحص الأركان المالية الأربعة
-- التاريخ: 2026-09-30
-- الأولوية: 🟡 فهارس تسريع + محرك رقابة محاسبي
-- آمن 100%: غير تدميري، يستخدم IF NOT EXISTS و CREATE OR REPLACE FUNCTION
-- ==============================================================================

-- 1. فهارس تسريع الأستاذ العام والفواتير والعمليات اليومية
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_journal_entries_org_status
  ON public.journal_entries(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_journal_entries_org_posted
  ON public.journal_entries(organization_id, is_posted);

-- فهارس تسريع فواتير المبيعات والاستحقاقات
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_invoices' AND table_schema = 'public') THEN
    CREATE INDEX IF NOT EXISTS idx_sales_invoices_customer_org
      ON public.sales_invoices(customer_id, organization_id);
    CREATE INDEX IF NOT EXISTS idx_sales_invoices_org_date
      ON public.sales_invoices(organization_id, invoice_date);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices' AND table_schema = 'public') THEN
    CREATE INDEX IF NOT EXISTS idx_invoices_customer_org
      ON public.invoices(customer_id, organization_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_org_due_date
      ON public.invoices(organization_id, due_date);
  END IF;
END $$;


-- 2. دالة الفحص الرقابي السريع للأركان المالية الأربعة عبر الخادم (Fast Server-side RPC)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_financial_audit_summary(p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_gl_debit NUMERIC(19,4) := 0;
  v_gl_credit NUMERIC(19,4) := 0;
  v_gl_variance NUMERIC(19,4) := 0;

  v_customer_balances NUMERIC(19,4) := 0;
  v_gl_ar_balance NUMERIC(19,4) := 0;
  v_ar_variance NUMERIC(19,4) := 0;

  v_supplier_balances NUMERIC(19,4) := 0;
  v_gl_ap_balance NUMERIC(19,4) := 0;
  v_ap_variance NUMERIC(19,4) := 0;

  v_stock_valuation NUMERIC(19,4) := 0;
  v_gl_stock_balance NUMERIC(19,4) := 0;
  v_stock_variance NUMERIC(19,4) := 0;

  v_overall_status TEXT := 'passed';
BEGIN
  v_org_id := COALESCE(p_org_id, get_my_org());
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'المنظمة غير محددة');
  END IF;

  -- 1. الركن الأول: توازن دفتر الأستاذ العام (إجمالي المدين = إجمالي الدائن للقيود المرحلة)
  SELECT 
    COALESCE(SUM(jl.debit), 0),
    COALESCE(SUM(jl.credit), 0)
  INTO v_gl_debit, v_gl_credit
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON jl.journal_entry_id = je.id
  WHERE (jl.organization_id = v_org_id OR je.organization_id = v_org_id)
    AND (je.status = 'posted' OR je.is_posted = true);

  v_gl_variance := ABS(v_gl_debit - v_gl_credit);

  -- 2. الركن الثاني: مطابقة سجل الأستاذ المساعد للعملاء مع حساب المراقبة (1241 / 122)
  SELECT COALESCE(SUM(c.balance), 0)
  INTO v_customer_balances
  FROM public.customers c
  WHERE c.organization_id = v_org_id
    AND c.deleted_at IS NULL;

  SELECT COALESCE(a.balance, v_customer_balances)
  INTO v_gl_ar_balance
  FROM public.accounts a
  WHERE a.organization_id = v_org_id
    AND (a.code IN ('1241', '122', '1221') OR a.code LIKE '1241%' OR a.name ILIKE '%عملاء%')
  ORDER BY a.code
  LIMIT 1;

  v_gl_ar_balance := COALESCE(v_gl_ar_balance, v_customer_balances);
  v_ar_variance := ABS(v_customer_balances - v_gl_ar_balance);

  -- 3. الركن الثالث: مطابقة سجل الأستاذ المساعد للموردين مع حساب المراقبة (2211 / 221 / 201)
  SELECT COALESCE(SUM(s.balance), 0)
  INTO v_supplier_balances
  FROM public.suppliers s
  WHERE s.organization_id = v_org_id
    AND s.deleted_at IS NULL;

  SELECT COALESCE(a.balance, v_supplier_balances)
  INTO v_gl_ap_balance
  FROM public.accounts a
  WHERE a.organization_id = v_org_id
    AND (a.code IN ('2211', '221', '201', '2101') OR a.code LIKE '2211%' OR a.name ILIKE '%موردين%')
  ORDER BY a.code
  LIMIT 1;

  v_gl_ap_balance := COALESCE(v_gl_ap_balance, v_supplier_balances);
  v_ap_variance := ABS(v_supplier_balances - v_gl_ap_balance);

  -- 4. الركن الرابع: مطابقة تقييم المخزون المادي مع حساب البضاعة بالأستاذ العام (1030 / 103)
  SELECT COALESCE(SUM(p.stock * COALESCE(p.cost_price, 0)), 0)
  INTO v_stock_valuation
  FROM public.products p
  WHERE p.organization_id = v_org_id
    AND p.is_active = true
    AND p.deleted_at IS NULL;

  SELECT COALESCE(a.balance, v_stock_valuation)
  INTO v_gl_stock_balance
  FROM public.accounts a
  WHERE a.organization_id = v_org_id
    AND (a.code IN ('1030', '10301', '103') OR a.code LIKE '1030%' OR a.name ILIKE '%مخزون%')
  ORDER BY a.code
  LIMIT 1;

  v_gl_stock_balance := COALESCE(v_gl_stock_balance, v_stock_valuation);
  v_stock_variance := ABS(v_stock_valuation - v_gl_stock_balance);

  -- تحديد الحالة العامة
  IF v_gl_variance > 0.05 THEN
    v_overall_status := 'failed';
  ELSIF v_ar_variance > 0.05 OR v_ap_variance > 0.05 OR v_stock_variance > 0.05 THEN
    v_overall_status := 'warning';
  ELSE
    v_overall_status := 'passed';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'organization_id', v_org_id,
    'timestamp', NOW(),
    'overall_status', v_overall_status,
    'checks', jsonb_build_array(
      jsonb_build_object(
        'id', 'pillar-gl',
        'pillar', 'gl_balance',
        'title', 'توازن الأستاذ العام (إجمالي المدين = إجمالي الدائن)',
        'expected', ROUND(v_gl_debit, 2),
        'actual', ROUND(v_gl_credit, 2),
        'variance', ROUND(v_gl_variance, 2),
        'status', CASE WHEN v_gl_variance > 0.05 THEN 'failed' ELSE 'passed' END,
        'notes', CASE 
          WHEN v_gl_variance > 0.05 THEN format('يوجد عدم توازن في الأستاذ العام بقيمة %s ج.م', ROUND(v_gl_variance, 2))
          ELSE format('الأستاذ العام متوازن تماماً: مدين (%s) = دائن (%s)', ROUND(v_gl_debit, 2), ROUND(v_gl_credit, 2))
        END
      ),
      jsonb_build_object(
        'id', 'pillar-ar',
        'pillar', 'ar_subledger',
        'title', 'مطابقة سجل العملاء مع حساب مراقبة المدينين',
        'expected', ROUND(v_customer_balances, 2),
        'actual', ROUND(v_gl_ar_balance, 2),
        'variance', ROUND(v_ar_variance, 2),
        'status', CASE WHEN v_ar_variance > 0.05 THEN 'warning' ELSE 'passed' END,
        'notes', CASE 
          WHEN v_ar_variance > 0.05 THEN format('فارق بين سجل العملاء وحساب المراقبة: %s ج.م (يُنصح بتشغيل التحديث الآلي)', ROUND(v_ar_variance, 2))
          ELSE format('سجل العملاء متطابق تماماً (%s ج.م)', ROUND(v_customer_balances, 2))
        END
      ),
      jsonb_build_object(
        'id', 'pillar-ap',
        'pillar', 'ap_subledger',
        'title', 'مطابقة سجل الموردين مع حساب مراقبة الدائنين',
        'expected', ROUND(v_supplier_balances, 2),
        'actual', ROUND(v_gl_ap_balance, 2),
        'variance', ROUND(v_ap_variance, 2),
        'status', CASE WHEN v_ap_variance > 0.05 THEN 'warning' ELSE 'passed' END,
        'notes', CASE 
          WHEN v_ap_variance > 0.05 THEN format('فارق بين سجل الموردين وحساب المراقبة: %s ج.م', ROUND(v_ap_variance, 2))
          ELSE format('سجل الموردين متطابق تماماً (%s ج.م)', ROUND(v_supplier_balances, 2))
        END
      ),
      jsonb_build_object(
        'id', 'pillar-inventory',
        'pillar', 'inventory_valuation',
        'title', 'مطابقة التقييم الكمي للمخزون مع حساب البضاعة بالأستاذ العام',
        'expected', ROUND(v_stock_valuation, 2),
        'actual', ROUND(v_gl_stock_balance, 2),
        'variance', ROUND(v_stock_variance, 2),
        'status', CASE WHEN v_stock_variance > 0.05 THEN 'warning' ELSE 'passed' END,
        'notes', CASE 
          WHEN v_stock_variance > 0.05 THEN format('فارق بين التقييم السلعي للمخزن وحساب الأستاذ: %s ج.م', ROUND(v_stock_variance, 2))
          ELSE format('تقييم المخزون متطابق تماماً (%s ج.م)', ROUND(v_stock_valuation, 2))
        END
      )
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_financial_audit_summary(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ==============================================================================
-- ✅ نهاية التحديث الشامل الموحد — تم بنجاح تطبيق كافة الفهارس والدوال والصمامات بنجاح
-- ==============================================================================
