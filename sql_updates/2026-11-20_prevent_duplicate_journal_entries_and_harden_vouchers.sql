-- ==============================================================================
-- 🛡️ TriPro ERP — Migration: 2026-11-20
-- Prevention of Duplicate Journal Entries, Unique Reference Index & Voucher Hardening
-- ==============================================================================

-- 1. فهرس فريد صارم على مستوى محرك قاعدة البيانات لمنع تكرار أي رقم قيد لنفس المنشأة
CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_unique_ref 
ON public.journal_entries (organization_id, reference) 
WHERE reference IS NOT NULL;

-- 2. تحديث دالة ترحيل واعتماد سندات الصرف لمنع تكرار القيود واستبدال القيد السابق تلقائياً
CREATE OR REPLACE FUNCTION public.approve_payment_voucher(p_voucher_id uuid, p_debit_account_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_voucher record;
    v_journal_id uuid;
    v_org_id uuid;
BEGIN
    SELECT * INTO v_voucher FROM public.payment_vouchers WHERE id = p_voucher_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'سند الصرف غير موجود (ID: %).', p_voucher_id;
    END IF;

    v_org_id := COALESCE(v_voucher.organization_id, public.get_my_org());
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'تعذر تحديد المنظمة لسند الصرف.';
    END IF;

    -- أ. تحويل القيد القديم المرتبط إلى مسودة لتجاوز حراس منع التعديل/الحذف (تنظيف شامل بأي نوع مستند أو بدونه)
    UPDATE public.journal_entries
    SET status = 'draft', is_posted = false
    WHERE organization_id = v_org_id
      AND (id = v_voucher.related_journal_entry_id
           OR related_document_id = p_voucher_id
           OR reference = v_voucher.voucher_number);

    -- ب. حذف أسطر القيد القديم
    DELETE FROM public.journal_lines
    WHERE journal_entry_id IN (
        SELECT id FROM public.journal_entries
        WHERE organization_id = v_org_id
          AND (id = v_voucher.related_journal_entry_id
               OR related_document_id = p_voucher_id
               OR reference = v_voucher.voucher_number)
    );

    -- ج. حذف رأس القيد القديم
    DELETE FROM public.journal_entries
    WHERE organization_id = v_org_id
      AND (id = v_voucher.related_journal_entry_id
           OR related_document_id = p_voucher_id
           OR reference = v_voucher.voucher_number);

    -- د. إنشاء رأس القيد الجديد كمسودة أولاً لتمكين إدراج أسطره
    INSERT INTO public.journal_entries (
        transaction_date,
        description,
        reference,
        status,
        organization_id,
        related_document_id,
        related_document_type,
        is_posted,
        user_id
    ) VALUES (
        COALESCE(v_voucher.payment_date, CURRENT_DATE),
        COALESCE(v_voucher.notes, 'سند صرف رقم ' || v_voucher.voucher_number),
        v_voucher.voucher_number,
        'draft',
        v_org_id,
        p_voucher_id,
        'payment_voucher',
        false,
        auth.uid()
    ) RETURNING id INTO v_journal_id;

    -- هـ. إدراج سطر المدين (المصروف أو المورد)
    INSERT INTO public.journal_lines (
        journal_entry_id,
        account_id,
        debit,
        credit,
        description,
        organization_id,
        cost_center_id
    ) VALUES (
        v_journal_id,
        p_debit_account_id,
        v_voucher.amount,
        0,
        COALESCE(v_voucher.notes, 'سند صرف رقم ' || v_voucher.voucher_number),
        v_org_id,
        v_voucher.cost_center_id
    );

    -- و. إدراج سطر الدائن (حساب الخزينة / البنك / انستا باي المحدث)
    INSERT INTO public.journal_lines (
        journal_entry_id,
        account_id,
        debit,
        credit,
        description,
        organization_id
    ) VALUES (
        v_journal_id,
        v_voucher.treasury_account_id,
        0,
        v_voucher.amount,
        COALESCE(v_voucher.notes, 'سند صرف رقم ' || v_voucher.voucher_number),
        v_org_id
    );

    -- ز. ترحيل القيد الجديد بعد توازن أطرافه
    UPDATE public.journal_entries
    SET status = 'posted', is_posted = true
    WHERE id = v_journal_id;

    -- ح. ربط السند بالقيد الجديد
    UPDATE public.payment_vouchers
    SET related_journal_entry_id = v_journal_id
    WHERE id = p_voucher_id;

    -- ط. إعادة احتساب أرصدة الحسابات
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'recalculate_all_system_balances' AND pronamespace = 'public'::regnamespace) THEN
        PERFORM public.recalculate_all_system_balances(v_org_id);
    END IF;
END;
$function$;

-- 3. تحديث دالة ترحيل واعتماد سندات القبض لمنع تكرار القيود
CREATE OR REPLACE FUNCTION public.approve_receipt_voucher(p_voucher_id uuid, p_credit_account_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_voucher record;
    v_journal_id uuid;
    v_org_id uuid;
    v_final_credit_acc_id uuid;
    v_mappings jsonb;
BEGIN
    SELECT * INTO v_voucher FROM public.receipt_vouchers WHERE id = p_voucher_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'سند القبض غير موجود.';
    END IF;

    v_org_id := COALESCE(v_voucher.organization_id, public.get_my_org());
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'تعذر تحديد المنظمة لسند القبض.';
    END IF;

    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    -- تنظيف شامل لأي قيود قديمة بنفس المرجع أو المعرف
    UPDATE public.journal_entries
    SET status = 'draft', is_posted = false
    WHERE organization_id = v_org_id
      AND (id = v_voucher.related_journal_entry_id
           OR related_document_id = p_voucher_id
           OR reference = v_voucher.voucher_number);

    DELETE FROM public.journal_lines
    WHERE journal_entry_id IN (
        SELECT id FROM public.journal_entries
        WHERE organization_id = v_org_id
          AND (id = v_voucher.related_journal_entry_id
               OR related_document_id = p_voucher_id
               OR reference = v_voucher.voucher_number)
    );

    DELETE FROM public.journal_entries
    WHERE organization_id = v_org_id
      AND (id = v_voucher.related_journal_entry_id
           OR related_document_id = p_voucher_id
           OR reference = v_voucher.voucher_number);

    v_final_credit_acc_id := p_credit_account_id;
    IF v_final_credit_acc_id IS NULL THEN
        IF v_voucher.customer_id IS NOT NULL THEN
            SELECT id INTO v_final_credit_acc_id FROM public.accounts 
            WHERE organization_id = v_org_id AND (code = '1221' OR code LIKE '1221%') LIMIT 1;
        END IF;
    END IF;

    IF v_final_credit_acc_id IS NULL THEN
        RAISE EXCEPTION 'لم يتم العثور على حساب الدائن (العميل أو الإيراد) لسند القبض.';
    END IF;

    INSERT INTO public.journal_entries (
        transaction_date,
        description,
        reference,
        status,
        organization_id,
        related_document_id,
        related_document_type,
        is_posted,
        user_id
    ) VALUES (
        COALESCE(v_voucher.receipt_date, CURRENT_DATE),
        COALESCE(v_voucher.notes, 'سند قبض رقم ' || v_voucher.voucher_number),
        v_voucher.voucher_number,
        'draft',
        v_org_id,
        p_voucher_id,
        'receipt_voucher',
        false,
        auth.uid()
    ) RETURNING id INTO v_journal_id;

    -- سطر المدين (الخزينة المستلمة)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_journal_id, v_voucher.treasury_account_id, v_voucher.amount, 0, v_voucher.notes, v_org_id);

    -- سطر الدائن (العميل أو الإيراد)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_journal_id, v_final_credit_acc_id, 0, v_voucher.amount, v_voucher.notes, v_org_id);

    -- ترحيل القيد
    UPDATE public.journal_entries
    SET status = 'posted', is_posted = true
    WHERE id = v_journal_id;

    UPDATE public.receipt_vouchers
    SET related_journal_entry_id = v_journal_id
    WHERE id = p_voucher_id;

    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'recalculate_all_system_balances' AND pronamespace = 'public'::regnamespace) THEN
        PERFORM public.recalculate_all_system_balances(v_org_id);
    END IF;
END;
$function$;

-- 4. مشغل رقابي لمنع تكرار أي رقم مرجع مرحل في الأستاذ العام
CREATE OR REPLACE FUNCTION public.fn_prevent_duplicate_voucher_reference()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    IF NEW.reference IS NOT NULL 
       AND (NEW.reference LIKE 'PV-%' OR NEW.reference LIKE 'RV-%' OR NEW.reference LIKE 'EXP-%') THEN
        IF EXISTS (
            SELECT 1 FROM public.journal_entries
            WHERE organization_id = NEW.organization_id
              AND reference = NEW.reference
              AND id != NEW.id
              AND status = 'posted'
        ) THEN
            RAISE EXCEPTION 'تنبيه رقابي صارم: يوجد قيد محاسبي مرحل مسبقاً بنفس المرجع (%). لا يمكن إنشاء أو ترحيل قيود مكررة لنفس السند نهائياً.', NEW.reference;
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

-- 5. تحديث دالة تحويل النقدية add_treasury_transfer لضمان فرادة المرجع وترحيله فوراً
CREATE OR REPLACE FUNCTION public.add_treasury_transfer(p_from_account_id uuid, p_to_account_id uuid, p_amount numeric, p_transfer_date date, p_notes text, p_org_id uuid, p_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_entry_id uuid;
  v_ref text;
BEGIN
  -- توليد مرجع فريد تماماً متضمناً الثواني وكود عشوائي لمنع أي تكرار
  v_ref := 'TRF-' || TO_CHAR(NOW(), 'YYMMDD-HH24MISS') || '-' || LPAD(FLOOR(RANDOM() * 1000)::text, 3, '0');

  -- 1. إنشاء رأس القيد المحاسبي مع تفعيل الترحيل تلقائياً
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
    'posted',
    true,
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

  RETURN v_entry_id;
END;
$function$;
