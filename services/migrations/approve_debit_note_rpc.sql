-- 🌟 إعداد وتأمين الإشعارات المدينة (Debit Notes)

-- 1. التأكد من وجود الجدول والأعمدة اللازمة
CREATE TABLE IF NOT EXISTS public.debit_notes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    debit_note_number text,
    supplier_id uuid REFERENCES public.suppliers(id),
    note_date date,
    amount_before_tax numeric,
    tax_amount numeric,
    total_amount numeric,
    notes text,
    status text DEFAULT 'draft',
    related_journal_entry_id uuid REFERENCES public.journal_entries(id),
    created_at timestamptz DEFAULT now()
);

-- 2. دالة اعتماد الإشعار المدين
CREATE OR REPLACE FUNCTION public.approve_debit_note(p_note_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_note record;
    v_org_id uuid;
    v_purchase_discount_acc_id uuid;
    v_vat_acc_id uuid;
    v_supplier_acc_id uuid;
    v_journal_id uuid;
BEGIN
    -- أ. التحقق من الإشعار
    SELECT * INTO v_note FROM public.debit_notes WHERE id = p_note_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'الإشعار المدين غير موجود'; END IF;
    IF v_note.status = 'posted' THEN RAISE EXCEPTION 'الإشعار مرحل بالفعل'; END IF;

    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;

    -- ب. جلب الحسابات
    -- 5101: المشتريات (نجعله دائن لتخفيض التكلفة) أو حساب خصم مكتسب
    SELECT id INTO v_purchase_discount_acc_id FROM public.accounts WHERE code = '5101' LIMIT 1;
    
    -- ضريبة المدخلات (1205) أو الضريبة العامة (2103)
    SELECT id INTO v_vat_acc_id FROM public.accounts WHERE code = '1205' LIMIT 1;
    IF v_vat_acc_id IS NULL THEN
        SELECT id INTO v_vat_acc_id FROM public.accounts WHERE code = '2103' LIMIT 1;
    END IF;

    SELECT id INTO v_supplier_acc_id FROM public.accounts WHERE code = '2201' LIMIT 1; -- الموردين

    IF v_purchase_discount_acc_id IS NULL OR v_supplier_acc_id IS NULL THEN
        RAISE EXCEPTION 'حسابات المشتريات أو الموردين غير معرّفة';
    END IF;

    -- ج. إنشاء قيد اليومية
    INSERT INTO public.journal_entries (
        transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted
    ) VALUES (
        v_note.note_date, 
        'إشعار مدين رقم ' || COALESCE(v_note.debit_note_number, '-'), 
        v_note.debit_note_number, 
        'posted', 
        v_org_id,
        p_note_id,
        'debit_note',
        true
    ) RETURNING id INTO v_journal_id;

    -- د. إنشاء أسطر القيد
    -- 1. المدين: المورد (تخفيض الالتزام)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_journal_id, v_supplier_acc_id, v_note.total_amount, 0, 'إشعار مدين للمورد - ' || v_note.debit_note_number, v_org_id);

    -- 2. الدائن: المشتريات/الخصم (المبلغ قبل الضريبة)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_journal_id, v_purchase_discount_acc_id, 0, v_note.amount_before_tax, 'تسوية مشتريات - ' || v_note.debit_note_number, v_org_id);

    -- 3. الدائن: ضريبة المدخلات (عكس الأصل الضريبي)
    IF COALESCE(v_note.tax_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_vat_acc_id, 0, v_note.tax_amount, 'ضريبة (إشعار مدين) - ' || v_note.debit_note_number, v_org_id);
    END IF;

    -- هـ. تحديث حالة الإشعار
    UPDATE public.debit_notes 
    SET status = 'posted',
        related_journal_entry_id = v_journal_id
    WHERE id = p_note_id;
END;
$$;