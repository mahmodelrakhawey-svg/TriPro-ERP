-- هذا الملف يجب تنفيذه في Supabase SQL Editor
-- 2026-07-09_add_opening_balance_rpc.sql

CREATE OR REPLACE FUNCTION public.add_opening_balance(
    p_id uuid,
    p_type text,
    p_amount numeric,
    p_date date,
    p_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_org_id uuid;
    v_mappings jsonb;
    v_opening_bal_acc_id uuid;
    v_partner_acc_id uuid;
    v_journal_id uuid;
    v_ref text;
    v_desc text;
BEGIN
    -- 1. الحصول على معرف المؤسسة من سجل العميل أو المورد
    IF p_type = 'customer' THEN
        SELECT organization_id INTO v_org_id FROM public.customers WHERE id = p_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'العميل غير موجود.';
        END IF;
        v_ref := 'OP-CUST-' || p_id;
        v_desc := 'رصيد افتتاحي للعميل: ' || p_name;
    ELSIF p_type = 'supplier' THEN
        SELECT organization_id INTO v_org_id FROM public.suppliers WHERE id = p_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'المورد غير موجود.';
        END IF;
        v_ref := 'OP-SUPP-' || p_id;
        v_desc := 'رصيد افتتاحي للمورد: ' || p_name;
    ELSE
        RAISE EXCEPTION 'نوع الشريك غير صالح. يجب أن يكون customer أو supplier.';
    END IF;

    -- 2. جلب شجرة حسابات المؤسسة
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    IF v_mappings IS NULL THEN
        RAISE EXCEPTION 'لم يتم العثور على إعدادات الحسابات لهذه المؤسسة.';
    END IF;

    -- 3. تحديد حساب الأرصدة الافتتاحية (OPENING_BALANCES)
    v_opening_bal_acc_id := (v_mappings->>'OPENING_BALANCES')::uuid;
    IF v_opening_bal_acc_id IS NULL THEN
        -- خيار بديل للبحث عن الحساب بالكود (كود 3999 أو 313)
        SELECT id INTO v_opening_bal_acc_id FROM public.accounts WHERE code IN ('3999', '313') AND organization_id = v_org_id LIMIT 1;
        IF v_opening_bal_acc_id IS NULL THEN
            RAISE EXCEPTION 'حساب الأرصدة الافتتاحية غير معرف في إعدادات الشركة (كود 3999).';
        END IF;
    END IF;

    -- 4. تحديد حساب العملاء أو الموردين
    IF p_type = 'customer' THEN
        v_partner_acc_id := (v_mappings->>'CUSTOMERS')::uuid;
        IF v_partner_acc_id IS NULL THEN
            SELECT id INTO v_partner_acc_id FROM public.accounts WHERE code IN ('1221', '1102', '121') AND organization_id = v_org_id LIMIT 1;
        END IF;
        IF v_partner_acc_id IS NULL THEN
            RAISE EXCEPTION 'حساب العملاء غير معرف في إعدادات الشركة (كود 1221).';
        END IF;
    ELSE
        v_partner_acc_id := (v_mappings->>'SUPPLIERS')::uuid;
        IF v_partner_acc_id IS NULL THEN
            SELECT id INTO v_partner_acc_id FROM public.accounts WHERE code IN ('2201', '201', '211') AND organization_id = v_org_id LIMIT 1;
        END IF;
        IF v_partner_acc_id IS NULL THEN
            RAISE EXCEPTION 'حساب الموردين غير معرف في إعدادات الشركة (كود 2201).';
        END IF;
    END IF;

    -- 5. حذف القيود السابقة لهذا الرصيد الافتتاحي (idempotency)
    DELETE FROM public.journal_entries 
    WHERE organization_id = v_org_id 
      AND related_document_id = p_id 
      AND related_document_type = 'opening_balance';

    -- 6. إنشاء القيد اليومي الرئيسي للرصيد الافتتاحي
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
    ) 
    VALUES (
        p_date, 
        v_desc, 
        v_ref, 
        'posted', 
        v_org_id, 
        p_id, 
        'opening_balance', 
        true, 
        auth.uid()
    ) 
    RETURNING id INTO v_journal_id;

    -- 7. إدراج بنود القيد اليومي المتوازن (Debit / Credit)
    IF p_type = 'customer' THEN
        -- مدين: حساب العملاء
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_journal_id, v_partner_acc_id, p_amount, 0, v_desc, v_org_id);
        
        -- دائن: حساب الأرصدة الافتتاحية
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_journal_id, v_opening_bal_acc_id, 0, p_amount, v_desc, v_org_id);
    ELSE
        -- مدين: حساب الأرصدة الافتتاحية
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_journal_id, v_opening_bal_acc_id, p_amount, 0, v_desc, v_org_id);
        
        -- دائن: حساب الموردين
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_journal_id, v_partner_acc_id, 0, p_amount, v_desc, v_org_id);
    END IF;

    -- 8. تحديث الرصيد الحالي للعميل أو المورد
    IF p_type = 'customer' THEN
        UPDATE public.customers 
        SET balance = public.get_customer_balance(p_id, v_org_id) 
        WHERE id = p_id;
    ELSE
        UPDATE public.suppliers 
        SET balance = public.get_supplier_balance(p_id, v_org_id) 
        WHERE id = p_id;
    END IF;

    -- 9. إعادة احتساب كافة أرصدة النظام لضمان المزامنة
    PERFORM public.recalculate_all_system_balances(v_org_id);

END;
$$;

-- منح صلاحيات التشغيل للمستخدمين المسجلين
GRANT EXECUTE ON FUNCTION public.add_opening_balance(uuid, text, numeric, date, text) TO authenticated;

-- تشغيل إصلاح استرجاعي لتوليد القيود المفقودة لكافة العملاء والموردين ذوي الأرصدة الافتتاحية السابقة
DO $$
DECLARE
    r RECORD;
BEGIN
    -- العملاء
    FOR r IN 
        SELECT id, name, opening_balance, created_at::date as date
        FROM public.customers 
        WHERE COALESCE(opening_balance, 0) != 0 
          AND id NOT IN (
              SELECT related_document_id 
              FROM public.journal_entries 
              WHERE related_document_type = 'opening_balance'
          )
    LOOP
        PERFORM public.add_opening_balance(r.id, 'customer', r.opening_balance, r.date, r.name);
        RAISE NOTICE 'تم توليد قيد رصيد افتتاحي للعميل: % بقيمة %', r.name, r.opening_balance;
    END LOOP;

    -- الموردين
    FOR r IN 
        SELECT id, name, opening_balance, created_at::date as date
        FROM public.suppliers 
        WHERE COALESCE(opening_balance, 0) != 0 
          AND id NOT IN (
              SELECT related_document_id 
              FROM public.journal_entries 
              WHERE related_document_type = 'opening_balance'
          )
    LOOP
        PERFORM public.add_opening_balance(r.id, 'supplier', r.opening_balance, r.date, r.name);
        RAISE NOTICE 'تم توليد قيد رصيد افتتاحي للمورد: % بقيمة %', r.name, r.opening_balance;
    END LOOP;
END;
$$;
