-- 🛠️ دالة حذف تحويل مالي بين الخزن والبنوك (Treasury Transfer Revert/Delete)
CREATE OR REPLACE FUNCTION public.delete_treasury_transfer(
  p_journal_entry_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_ref text;
BEGIN
  -- 1. التأكد من أن القيد يخص تحويل مالي
  SELECT organization_id, reference INTO v_org_id, v_ref
  FROM public.journal_entries
  WHERE id = p_journal_entry_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'قيد اليومية غير موجود.';
  END IF;

  IF v_ref IS NULL OR NOT (v_ref LIKE 'TRF-%') THEN
    RAISE EXCEPTION 'هذا القيد ليس قيد تحويل مالي بين الخزن والبنوك';
  END IF;

  -- 2. حذف أسطر القيد
  DELETE FROM public.journal_lines
  WHERE journal_entry_id = p_journal_entry_id;

  -- 3. حذف رأس القيد
  DELETE FROM public.journal_entries
  WHERE id = p_journal_entry_id;

  -- 4. إعادة حساب الأرصدة للشركة
  PERFORM public.recalculate_all_system_balances(v_org_id);
END;
$$;

-- 🛠️ دالة تعديل تحويل مالي بين الخزن والبنوك (Treasury Transfer Update)
CREATE OR REPLACE FUNCTION public.update_treasury_transfer(
  p_journal_entry_id uuid,
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount numeric,
  p_transfer_date date,
  p_notes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_ref text;
BEGIN
  -- 1. التأكد من أن القيد يخص تحويل مالي
  SELECT organization_id, reference INTO v_org_id, v_ref
  FROM public.journal_entries
  WHERE id = p_journal_entry_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'قيد اليومية غير موجود.';
  END IF;

  IF v_ref IS NULL OR NOT (v_ref LIKE 'TRF-%') THEN
    RAISE EXCEPTION 'هذا القيد ليس قيد تحويل مالي بين الخزن والبنوك';
  END IF;

  -- 2. تحديث رأس القيد المحاسبي
  UPDATE public.journal_entries
  SET transaction_date = p_transfer_date,
      description = p_notes
  WHERE id = p_journal_entry_id;

  -- 3. حذف أسطر القيد القديمة لإعادة بنائها
  DELETE FROM public.journal_lines
  WHERE journal_entry_id = p_journal_entry_id;

  -- 4. سطر القيد المدين (الخزينة المستلمة تزيد)
  INSERT INTO public.journal_lines (
    journal_entry_id,
    account_id,
    debit,
    credit,
    description,
    organization_id
  ) VALUES (
    p_journal_entry_id,
    p_to_account_id,
    p_amount,
    0,
    'تحويل وارد: ' || p_notes,
    v_org_id
  );

  -- 5. سطر القيد الدائن (الخزينة المحولة تنقص)
  INSERT INTO public.journal_lines (
    journal_entry_id,
    account_id,
    debit,
    credit,
    description,
    organization_id
  ) VALUES (
    p_journal_entry_id,
    p_from_account_id,
    0,
    p_amount,
    'تحويل صادر: ' || p_notes,
    v_org_id
  );

  -- 6. إعادة حساب الأرصدة للشركة
  PERFORM public.recalculate_all_system_balances(v_org_id);
END;
$$;

-- منح صلاحيات التنفيذ للمستخدمين المسجلين
GRANT EXECUTE ON FUNCTION public.delete_treasury_transfer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_treasury_transfer(uuid, uuid, uuid, numeric, date, text) TO authenticated;
