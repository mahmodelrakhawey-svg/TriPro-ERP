-- 🌟 إعداد وتأمين الإشعارات الدائنة (Credit Notes)

-- 1. التأكد من وجود الجدول والأعمدة اللازمة
CREATE TABLE IF NOT EXISTS public.credit_notes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    credit_note_number text,
    customer_id uuid REFERENCES public.customers(id),
    note_date date,
    amount_before_tax numeric,
    tax_amount numeric,
    total_amount numeric,
    notes text,
    status text DEFAULT 'draft',
    related_journal_entry_id uuid REFERENCES public.journal_entries(id),
    created_at timestamptz DEFAULT now()
);

-- 2. دالة اعتماد الإشعار الدائن
CREATE OR REPLACE FUNCTION public.approve_credit_note(p_note_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_note record;
    v_org_id uuid;
    v_sales_allowance_acc_id uuid;
    v_vat_acc_id uuid;
    v_customer_acc_id uuid;
    v_journal_id uuid;
BEGIN
    -- أ. التحقق من الإشعار
    SELECT * INTO v_note FROM public.credit_notes WHERE id = p_note_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'الإشعار الدائن غير موجود'; END IF;
    IF v_note.status = 'posted' THEN RAISE EXCEPTION 'الإشعار مرحل بالفعل'; END IF;

    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;

    -- ب. جلب الحسابات
    -- 4102: خصم مسموح به / مسموحات مبيعات
    SELECT id INTO v_sales_allowance_acc_id FROM public.accounts WHERE code = '4102' LIMIT 1;
    -- إذا لم يوجد، نستخدم حساب المبيعات (4101) كبديل (تخفيض للإيراد)
    IF v_sales_allowance_acc_id IS NULL THEN
        SELECT id INTO v_sales_allowance_acc_id FROM public.accounts WHERE code = '4101' LIMIT 1;
    END IF;

    SELECT id INTO v_vat_acc_id FROM public.accounts WHERE code = '2103' LIMIT 1; -- ضريبة القيمة المضافة
    SELECT id INTO v_customer_acc_id FROM public.accounts WHERE code = '1102' LIMIT 1; -- العملاء

    IF v_sales_allowance_acc_id IS NULL OR v_customer_acc_id IS NULL THEN
        RAISE EXCEPTION 'حسابات المبيعات أو العملاء غير معرّفة';
    END IF;

    -- ج. إنشاء قيد اليومية
    INSERT INTO public.journal_entries (
        transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted
    ) VALUES (
        v_note.note_date, 
        'إشعار دائن رقم ' || COALESCE(v_note.credit_note_number, '-'), 
        v_note.credit_note_number, 
        'posted', 
        v_org_id,
        p_note_id,
        'credit_note',
        true
    ) RETURNING id INTO v_journal_id;

    -- د. إنشاء أسطر القيد
    -- 1. المدين: مسموحات المبيعات (المبلغ قبل الضريبة)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_journal_id, v_sales_allowance_acc_id, v_note.amount_before_tax, 0, 'مسموحات مبيعات - ' || v_note.credit_note_number, v_org_id);

    -- 2. المدين: ضريبة القيمة المضافة (تخفيض الالتزام الضريبي)
    IF COALESCE(v_note.tax_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_vat_acc_id, v_note.tax_amount, 0, 'ضريبة (إشعار دائن) - ' || v_note.credit_note_number, v_org_id);
    END IF;

    -- 3. الدائن: العميل (تخفيض المديونية)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_journal_id, v_customer_acc_id, 0, v_note.total_amount, 'إشعار دائن للعميل - ' || v_note.credit_note_number, v_org_id);

    -- هـ. تحديث حالة الإشعار
    UPDATE public.credit_notes 
    SET status = 'posted',
        related_journal_entry_id = v_journal_id
    WHERE id = p_note_id;
END;
$$;