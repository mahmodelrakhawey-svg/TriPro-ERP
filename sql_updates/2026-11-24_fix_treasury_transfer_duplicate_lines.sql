-- ==============================================================================
-- 🔧 TriPro ERP — إصلاح عاجل: تكرار أسطر قيد التحويل المالي
-- الملف: sql_updates/2026-11-24_fix_treasury_transfer_duplicate_lines.sql
-- التاريخ: 2026-11-24
-- ==============================================================================

-- ============================================================
-- الجزء الأول: إصلاح القيد المكرر الحالي TRF-261124-081749-197
-- نستخدم مفتاح التجاوز الرسمي للنظام:
--   app.allow_financial_ledger_mutation = 'true'
-- ============================================================

DO $$
DECLARE
  v_entry_id  uuid;
  v_org_id    uuid;
BEGIN
  -- 1. تفعيل مفتاح التجاوز الرسمي (local = داخل هذه العملية فقط)
  PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

  -- 2. جلب معرّف القيد
  SELECT id, organization_id
  INTO v_entry_id, v_org_id
  FROM public.journal_entries
  WHERE reference = 'TRF-261124-081749-197'
  LIMIT 1;

  IF v_entry_id IS NULL THEN
    RAISE NOTICE 'القيد TRF-261124-081749-197 غير موجود، لا حاجة للتنظيف.';
    RETURN;
  END IF;

  -- 3. حذف السطرين المكررين (نُبقي على أول سطرين فقط بحسب موضعهما الفيزيائي)
  DELETE FROM public.journal_lines
  WHERE id IN (
    SELECT id FROM public.journal_lines
    WHERE journal_entry_id = v_entry_id
    ORDER BY ctid
    OFFSET 2
  );

  RAISE NOTICE '✅ تم حذف الأسطر المكررة من القيد: %', v_entry_id;

  -- 4. إعادة احتساب الأرصدة
  PERFORM public.recalculate_all_system_balances(v_org_id);
  RAISE NOTICE '✅ تمت إعادة احتساب الأرصدة للمنشأة: %', v_org_id;

  -- 5. إغلاق مفتاح التجاوز
  PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
END;
$$;


-- ============================================================
-- الجزء الثاني: إصلاح دالة add_treasury_transfer جذرياً
-- المبدأ: أنشئ القيد draft → أضف الأسطر → رحّله (UPDATE)
-- هكذا لا يرى أي Trigger على INSERT حالةَ posted أبداً
-- ============================================================

CREATE OR REPLACE FUNCTION public.add_treasury_transfer(
  p_from_account_id  uuid,
  p_to_account_id    uuid,
  p_amount           numeric,
  p_transfer_date    date,
  p_notes            text,
  p_org_id           uuid,
  p_user_id          uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_entry_id uuid;
  v_ref      text;
BEGIN
  -- 0. توليد مرجع فريد (يتضمن الثواني + كود عشوائي)
  v_ref := 'TRF-' || TO_CHAR(NOW(), 'YYMMDD-HH24MISS') || '-' || LPAD(FLOOR(RANDOM() * 1000)::text, 3, '0');

  -- 1. إنشاء رأس القيد بحالة DRAFT أولاً (لتجنب إطلاق أي Trigger على حالة posted عند INSERT)
  INSERT INTO public.journal_entries (
    transaction_date,
    description,
    status,
    is_posted,
    organization_id,
    user_id,
    reference,
    related_document_type
  ) VALUES (
    p_transfer_date,
    p_notes,
    'draft',   -- ← draft أولاً لتجنب Trigger balances guard عند INSERT
    false,
    p_org_id,
    p_user_id,
    v_ref,
    'treasury_transfer'
  ) RETURNING id INTO v_entry_id;

  -- 2. سطر القيد المدين (الخزينة المستلمة تزيد)
  INSERT INTO public.journal_lines (
    journal_entry_id,
    account_id,
    debit,
    credit,
    description,
    organization_id
  ) VALUES (
    v_entry_id,
    p_to_account_id,
    p_amount,
    0,
    'تحويل وارد: ' || COALESCE(p_notes, ''),
    p_org_id
  );

  -- 3. سطر القيد الدائن (الخزينة المحولة تنقص)
  INSERT INTO public.journal_lines (
    journal_entry_id,
    account_id,
    debit,
    credit,
    description,
    organization_id
  ) VALUES (
    v_entry_id,
    p_from_account_id,
    0,
    p_amount,
    'تحويل صادر: ' || COALESCE(p_notes, ''),
    p_org_id
  );

  -- 4. ترحيل القيد الآن بعد أن أسطره مكتملة (UPDATE → لا INSERT trigger على posted)
  UPDATE public.journal_entries
  SET status    = 'posted',
      is_posted = true
  WHERE id = v_entry_id;

  -- 5. إعادة احتساب الأرصدة
  PERFORM public.recalculate_all_system_balances(p_org_id);

  RETURN v_entry_id;
END;
$$;

-- منح الصلاحيات
GRANT EXECUTE ON FUNCTION public.add_treasury_transfer(uuid, uuid, numeric, date, text, uuid, uuid) TO authenticated;

-- ============================================================
-- تحقق نهائي: عدد أسطر قيد اليوم يجب أن يكون 2
-- ============================================================
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON jl.journal_entry_id = je.id
  WHERE je.reference = 'TRF-261124-081749-197';

  IF v_count = 2 THEN
    RAISE NOTICE '✅ تحقق ناجح: القيد TRF-261124-081749-197 يحتوي على % سطرين بشكل صحيح.', v_count;
  ELSE
    RAISE WARNING '⚠️ تحذير: القيد TRF-261124-081749-197 يحتوي على % سطر — يرجى المراجعة اليدوية.', v_count;
  END IF;
END;
$$;
