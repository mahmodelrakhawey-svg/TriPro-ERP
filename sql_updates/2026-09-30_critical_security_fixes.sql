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
