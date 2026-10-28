-- ==============================================================================
-- TriPro ERP - Master Synchronization Script
-- تاريخ التحديث: 2026-10-21
-- الغرض: مزامنة بنية القاعدة العامة (استاد وملك) وتطابقها التام 100% مع قاعدة لينزا
-- البيئة المستهدفة: pjvphxfschfllpawfewn (قاعدة الشركات العامة)
-- ==============================================================================

BEGIN;

-- 1. إضافة الأعمدة المفقودة
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES public.shifts(id) ON DELETE SET NULL;
ALTER TABLE public.receipt_vouchers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.receipt_vouchers ADD COLUMN IF NOT EXISTS date DATE;
ALTER TABLE public.payment_vouchers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.payment_vouchers ADD COLUMN IF NOT EXISTS date DATE;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hr_scope TEXT DEFAULT 'all'::text;


-- 2. تعريف الدوال البرمجية والإجراءات المخزنة (25 دالة)

-- Function: add_opening_balance(p_id uuid, p_type text, p_amount numeric, p_date date, p_name text)
CREATE OR REPLACE FUNCTION public.add_opening_balance(p_id uuid, p_type text, p_amount numeric, p_date date, p_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_org_id uuid;
    v_mappings jsonb;
    v_opening_bal_acc_id uuid;
    v_partner_acc_id uuid;
    v_journal_id uuid;
    v_ref text;
    v_desc text;
    v_user_id uuid;
    v_abs_amount numeric;
BEGIN
    -- 1. التحقق من المؤسسة ونوع الشريك
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

    -- 2. تحديد حساب الأرصدة الافتتاحية (OPENING_BALANCES: 3999 أو 313)
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    IF v_mappings IS NOT NULL AND v_mappings->>'OPENING_BALANCES' IS NOT NULL THEN
        v_opening_bal_acc_id := (v_mappings->>'OPENING_BALANCES')::uuid;
    END IF;

    IF v_opening_bal_acc_id IS NULL THEN
        SELECT id INTO v_opening_bal_acc_id 
        FROM public.accounts 
        WHERE code IN ('3999', '313', '3103') 
          AND (organization_id = v_org_id OR organization_id IS NULL) 
        ORDER BY organization_id NULLS LAST 
        LIMIT 1;
    END IF;

    -- 3. تحديد حساب العملاء أو الموردين
    IF p_type = 'customer' THEN
        IF v_mappings IS NOT NULL AND v_mappings->>'CUSTOMERS' IS NOT NULL THEN
            v_partner_acc_id := (v_mappings->>'CUSTOMERS')::uuid;
        END IF;
        IF v_partner_acc_id IS NULL THEN
            SELECT id INTO v_partner_acc_id 
            FROM public.accounts 
            WHERE code IN ('1221', '1102', '121') 
              AND (organization_id = v_org_id OR organization_id IS NULL) 
            ORDER BY organization_id NULLS LAST 
            LIMIT 1;
        END IF;
    ELSE
        IF v_mappings IS NOT NULL AND v_mappings->>'SUPPLIERS' IS NOT NULL THEN
            v_partner_acc_id := (v_mappings->>'SUPPLIERS')::uuid;
        END IF;
        IF v_partner_acc_id IS NULL THEN
            SELECT id INTO v_partner_acc_id 
            FROM public.accounts 
            WHERE code IN ('2201', '201', '2101', '211') 
              AND (organization_id = v_org_id OR organization_id IS NULL) 
            ORDER BY organization_id NULLS LAST 
            LIMIT 1;
        END IF;
    END IF;

    -- 4. إزالة أي قيود سابقة لهذا الشريك لضمان idempotency
    DELETE FROM public.journal_entries 
    WHERE (organization_id = v_org_id OR organization_id IS NULL)
      AND (
          (related_document_id = p_id AND related_document_type = 'opening_balance')
          OR reference = v_ref
      );

    -- إذا كان المبلغ صفراً لا داعي لإنشاء قيد
    IF p_amount IS NULL OR p_amount = 0 THEN
        IF p_type = 'customer' THEN
            UPDATE public.customers SET opening_balance = 0 WHERE id = p_id;
        ELSE
            UPDATE public.suppliers SET opening_balance = 0 WHERE id = p_id;
        END IF;
        RETURN;
    END IF;

    -- محاولة الحصول على مستخدم نشط للقيد
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        SELECT id INTO v_user_id FROM auth.users ORDER BY created_at ASC LIMIT 1;
    END IF;

    v_abs_amount := ABS(p_amount);

    -- 5. إنشاء القيد اليومي الرئيسي
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
        v_user_id
    ) 
    RETURNING id INTO v_journal_id;

    -- 6. بنود القيد المتوازنة بدقة وفق الإشارات المحاسبية (موجب دائن، سالب مدين للمورد)
    IF v_opening_bal_acc_id IS NOT NULL AND v_partner_acc_id IS NOT NULL THEN
        IF p_type = 'customer' THEN
            IF p_amount >= 0 THEN
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
                VALUES (v_journal_id, v_partner_acc_id, v_abs_amount, 0, v_desc, v_org_id);
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
                VALUES (v_journal_id, v_opening_bal_acc_id, 0, v_abs_amount, v_desc, v_org_id);
            ELSE
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
                VALUES (v_journal_id, v_opening_bal_acc_id, v_abs_amount, 0, v_desc, v_org_id);
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
                VALUES (v_journal_id, v_partner_acc_id, 0, v_abs_amount, v_desc, v_org_id);
            END IF;
        ELSE
            IF p_amount >= 0 THEN
                -- مورد رصيد موجب (دائن): مدين أرصدة افتتاحية / دائن موردين
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
                VALUES (v_journal_id, v_opening_bal_acc_id, v_abs_amount, 0, v_desc, v_org_id);
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
                VALUES (v_journal_id, v_partner_acc_id, 0, v_abs_amount, v_desc, v_org_id);
            ELSE
                -- مورد رصيد سالب (مدين / دفعات مقدمة): مدين موردين / دائن أرصدة افتتاحية
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
                VALUES (v_journal_id, v_partner_acc_id, v_abs_amount, 0, v_desc, v_org_id);
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
                VALUES (v_journal_id, v_opening_bal_acc_id, 0, v_abs_amount, v_desc, v_org_id);
            END IF;
        END IF;
    END IF;

    -- 7. تحديث بطاقة الشريك
    IF p_type = 'customer' THEN
        UPDATE public.customers 
        SET opening_balance = p_amount,
            balance = COALESCE(balance, 0)
        WHERE id = p_id;
    ELSE
        UPDATE public.suppliers 
        SET opening_balance = p_amount,
            balance = COALESCE(balance, 0)
        WHERE id = p_id;
    END IF;

END;
$function$
;
GRANT EXECUTE ON FUNCTION public.add_opening_balance(p_id uuid, p_type text, p_amount numeric, p_date date, p_name text) TO anon, authenticated, service_role;

-- Function: approve_payment_voucher(p_voucher_id uuid, p_debit_account_id uuid)
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

    -- أ. تحويل القيد القديم المرتبط إلى مسودة لتجاوز حراس منع التعديل/الحذف
    UPDATE public.journal_entries 
    SET status = 'draft', is_posted = false 
    WHERE organization_id = v_org_id 
      AND (id = v_voucher.related_journal_entry_id 
           OR related_document_id = p_voucher_id 
           OR (reference = v_voucher.voucher_number AND related_document_type = 'payment_voucher'));

    -- ب. حذف أسطر القيد القديم
    DELETE FROM public.journal_lines 
    WHERE journal_entry_id IN (
        SELECT id FROM public.journal_entries 
        WHERE organization_id = v_org_id 
          AND (id = v_voucher.related_journal_entry_id 
               OR related_document_id = p_voucher_id 
               OR (reference = v_voucher.voucher_number AND related_document_type = 'payment_voucher'))
    );

    -- ج. حذف رأس القيد القديم
    DELETE FROM public.journal_entries 
    WHERE organization_id = v_org_id 
      AND (id = v_voucher.related_journal_entry_id 
           OR related_document_id = p_voucher_id 
           OR (reference = v_voucher.voucher_number AND related_document_type = 'payment_voucher'));

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
$function$
;
GRANT EXECUTE ON FUNCTION public.approve_payment_voucher(p_voucher_id uuid, p_debit_account_id uuid) TO anon, authenticated, service_role;

-- Function: approve_receipt_voucher(p_voucher_id uuid, p_credit_account_id uuid)
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

    -- تنظيف أي قيود قديمة مرتبطة
    UPDATE public.journal_entries 
    SET status = 'draft', is_posted = false 
    WHERE organization_id = v_org_id 
      AND (id = v_voucher.related_journal_entry_id 
           OR related_document_id = p_voucher_id 
           OR (reference = v_voucher.voucher_number AND related_document_type = 'receipt_voucher'));

    DELETE FROM public.journal_lines 
    WHERE journal_entry_id IN (
        SELECT id FROM public.journal_entries 
        WHERE organization_id = v_org_id 
          AND (id = v_voucher.related_journal_entry_id 
               OR related_document_id = p_voucher_id 
               OR (reference = v_voucher.voucher_number AND related_document_type = 'receipt_voucher'))
    );

    DELETE FROM public.journal_entries 
    WHERE organization_id = v_org_id 
      AND (id = v_voucher.related_journal_entry_id 
           OR related_document_id = p_voucher_id 
           OR (reference = v_voucher.voucher_number AND related_document_type = 'receipt_voucher'));

    -- تحديد الحساب الدائن (تأمين أو عميل أو إيراد)
    IF v_voucher.voucher_type = 'security_deposit' THEN
        v_final_credit_acc_id := COALESCE(
            (v_mappings->>'SECURITY_DEPOSIT_ACCOUNT')::uuid,
            (SELECT id FROM public.accounts WHERE code = '226' AND organization_id = v_org_id LIMIT 1)
        );
    ELSE
        v_final_credit_acc_id := p_credit_account_id;
    END IF;

    IF v_final_credit_acc_id IS NULL THEN 
        RAISE EXCEPTION 'الحساب الدائن غير محدد لسند القبض.'; 
    END IF;

    -- إنشاء القيد كمسودة
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

    -- سطر الدائن (العميل أو التأمين)
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
$function$
;
GRANT EXECUTE ON FUNCTION public.approve_receipt_voucher(p_voucher_id uuid, p_credit_account_id uuid) TO anon, authenticated, service_role;

-- Function: auto_reconcile_all_vouchers_with_gl(p_org_id uuid)
CREATE OR REPLACE FUNCTION public.auto_reconcile_all_vouchers_with_gl(p_org_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_org_id uuid;
    v_pv record;
    v_rv record;
    v_fixed_pv integer := 0;
    v_fixed_rv integer := 0;
    v_mismatched_pv integer := 0;
    v_mismatched_rv integer := 0;
    v_debit_acc_id uuid;
    v_credit_acc_id uuid;
    v_entry_treasury_acc_id uuid;
    v_entry_amount numeric;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    IF v_org_id IS NULL THEN
        SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
    END IF;

    -- أ. فحص وإصلاح سندات الصرف (payment_vouchers)
    FOR v_pv IN 
        SELECT pv.* 
        FROM public.payment_vouchers pv
        WHERE (v_org_id IS NULL OR pv.organization_id = v_org_id)
          AND pv.deleted_at IS NULL
    LOOP
        SELECT jl.account_id, jl.credit INTO v_entry_treasury_acc_id, v_entry_amount
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON jl.journal_entry_id = je.id
        WHERE je.id = v_pv.related_journal_entry_id
          AND jl.credit > 0
        LIMIT 1;

        IF v_entry_treasury_acc_id IS NULL 
           OR v_entry_treasury_acc_id <> v_pv.treasury_account_id 
           OR ABS(COALESCE(v_entry_amount, 0) - v_pv.amount) > 0.01 THEN
            
            v_mismatched_pv := v_mismatched_pv + 1;

            SELECT account_id INTO v_debit_acc_id 
            FROM public.journal_lines 
            WHERE journal_entry_id = v_pv.related_journal_entry_id AND debit > 0 
            LIMIT 1;

            IF v_debit_acc_id IS NULL THEN
                IF v_pv.supplier_id IS NOT NULL THEN
                    SELECT id INTO v_debit_acc_id FROM public.accounts 
                    WHERE organization_id = v_pv.organization_id AND (code = '201' OR code LIKE '201%') LIMIT 1;
                ELSE
                    SELECT id INTO v_debit_acc_id FROM public.accounts 
                    WHERE organization_id = v_pv.organization_id AND (code = '5251' OR code LIKE '5%') LIMIT 1;
                END IF;
            END IF;

            IF v_debit_acc_id IS NOT NULL AND v_pv.treasury_account_id IS NOT NULL THEN
                BEGIN
                    PERFORM public.approve_payment_voucher(v_pv.id, v_debit_acc_id);
                    v_fixed_pv := v_fixed_pv + 1;
                EXCEPTION WHEN OTHERS THEN
                    -- استمرار العملية دون توقف
                END;
            END IF;
        END IF;
    END LOOP;

    -- ب. فحص وإصلاح سندات القبض (receipt_vouchers)
    FOR v_rv IN 
        SELECT rv.* 
        FROM public.receipt_vouchers rv
        WHERE (v_org_id IS NULL OR rv.organization_id = v_org_id)
          AND rv.deleted_at IS NULL
    LOOP
        SELECT jl.account_id, jl.debit INTO v_entry_treasury_acc_id, v_entry_amount
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON jl.journal_entry_id = je.id
        WHERE je.id = v_rv.related_journal_entry_id
          AND jl.debit > 0
        LIMIT 1;

        IF v_entry_treasury_acc_id IS NULL 
           OR v_entry_treasury_acc_id <> v_rv.treasury_account_id 
           OR ABS(COALESCE(v_entry_amount, 0) - v_rv.amount) > 0.01 THEN
            
            v_mismatched_rv := v_mismatched_rv + 1;

            SELECT account_id INTO v_credit_acc_id 
            FROM public.journal_lines 
            WHERE journal_entry_id = v_rv.related_journal_entry_id AND credit > 0 
            LIMIT 1;

            IF v_credit_acc_id IS NULL THEN
                SELECT id INTO v_credit_acc_id FROM public.accounts 
                WHERE organization_id = v_rv.organization_id AND (code = '1221' OR code LIKE '1221%') LIMIT 1;
            END IF;

            IF v_credit_acc_id IS NOT NULL AND v_rv.treasury_account_id IS NOT NULL THEN
                BEGIN
                    PERFORM public.approve_receipt_voucher(v_rv.id, v_credit_acc_id);
                    v_fixed_rv := v_fixed_rv + 1;
                EXCEPTION WHEN OTHERS THEN
                    -- استمرار العملية دون توقف
                END;
            END IF;
        END IF;
    END LOOP;

    -- ج. إعادة احتساب أرصدة الحسابات إذا تم تصحيح أي سندات
    IF (v_fixed_pv > 0 OR v_fixed_rv > 0) AND EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'recalculate_all_system_balances' AND pronamespace = 'public'::regnamespace
    ) THEN
        PERFORM public.recalculate_all_system_balances(v_org_id);
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'organization_id', v_org_id,
        'mismatched_payment_vouchers', v_mismatched_pv,
        'fixed_payment_vouchers', v_fixed_pv,
        'mismatched_receipt_vouchers', v_mismatched_rv,
        'fixed_receipt_vouchers', v_fixed_rv
    );
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.auto_reconcile_all_vouchers_with_gl(p_org_id uuid) TO anon, authenticated, service_role;

-- Function: create_organization_backup(p_org_id uuid, p_notes text)
CREATE OR REPLACE FUNCTION public.create_organization_backup(p_org_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET statement_timeout TO '300s'
AS $function$
DECLARE
    v_backup_data jsonb := '{}'::jsonb;
    v_table_name text;
    v_table_data jsonb;
    v_backup_id uuid;
    v_org_name text;
BEGIN
    SELECT name INTO v_org_name FROM public.organizations WHERE id = p_org_id;

    v_backup_data := jsonb_build_object(
        'metadata', jsonb_build_object(
            'version', '2.1',
            'org_id', p_org_id,
            'org_name', COALESCE(v_org_name, 'Unknown'),
            'created_at', now()
        )
    );

    -- مسح الجداول عبر pg_catalog فائق السرعة
    FOR v_table_name IN
        SELECT DISTINCT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid
        WHERE n.nspname = 'public'
          AND c.relkind = 'r' -- جداول فعلية فقط (BASE TABLE)
          AND a.attname = 'organization_id'
          AND NOT a.attisdropped
          AND c.relname NOT IN (
              'organizations', 
              'organization_backups', 
              'profiles', 
              'system_error_logs', 
              'audit_logs'
          )
    LOOP
        BEGIN
            EXECUTE format(
                'SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM public.%I t WHERE t.organization_id = %L', 
                v_table_name, 
                p_org_id
            ) INTO v_table_data;
            
            -- دمج بيانات الجدول في كائن النسخة الاحتياطية
            v_backup_data := v_backup_data || jsonb_build_object(v_table_name, COALESCE(v_table_data, '[]'::jsonb));
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END LOOP;

    INSERT INTO public.organization_backups (
        organization_id, 
        backup_data, 
        file_size_kb, 
        user_id, 
        notes,
        backup_date,
        created_at
    ) VALUES (
        p_org_id,
        v_backup_data,
        ROUND((pg_column_size(v_backup_data) / 1024.0)::numeric, 2),
        auth.uid(),
        COALESCE(p_notes, 'نسخة احتياطية يومية آلية: ' || COALESCE(v_org_name, '')),
        now(),
        now()
    ) RETURNING id INTO v_backup_id;

    -- تطبيق سياسة الاستبقاء: الإبقاء على آخر نسختين فقط
    PERFORM public.clean_old_organization_backups(p_org_id);

    RETURN v_backup_id;
END; 
$function$
;
GRANT EXECUTE ON FUNCTION public.create_organization_backup(p_org_id uuid, p_notes text) TO anon, authenticated, service_role;

-- Function: fn_delete_organization_safe(p_org_id uuid)
CREATE OR REPLACE FUNCTION public.fn_delete_organization_safe(p_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_tables text[] := ARRAY[
        -- المرفقات والتفاصيل الدقيقة
        'notification_audit_log', 'cheque_attachments', 'receipt_voucher_attachments', 
        'payment_voucher_attachments', 'journal_attachments', 'notification_preferences', 
        'security_logs', 'audit_logs', 'organization_backups',
        
        -- موديول التصنيع (Manufacturing)
        'mfg_step_materials', 'mfg_step_attachments', 'mfg_production_order_materials', 
        'mfg_production_order_steps', 'mfg_scrap_records', 'mfg_qc_inspections',
        'mfg_production_orders', 'mfg_routings', 'mfg_work_centers',
        
        -- موديول المطاعم والكاشير والورديات
        'order_item_modifiers', 'order_items', 'kitchen_orders', 'orders', 
        'table_sessions', 'shifts', 'restaurant_tables', 'modifiers', 'modifier_groups',
        
        -- موديول الاستاد والمشاريع والصحة
        'stadium_court_pricing', 'stadium_subscriptions', 'stadium_bookings', 'stadium_academy_trainees',
        'stadium_courts', 'stadium_members', 'stadium_academies',
        'construction_boq_items', 'construction_progress_billings', 'construction_subcontracts', 'construction_projects',
        'hims_prescription_items', 'hims_invoice_items', 'hims_lab_order_items', 'hims_radiology_order_items',
        'hims_vital_signs', 'hims_visits', 'hims_inpatient_admissions', 'hims_appointments',
        'hims_patients', 'hims_doctors', 'hims_departments', 'hims_rooms', 'hims_beds',

        -- فواتير المبيعات والمشتريات والتسويات
        'invoice_items', 'purchase_invoice_items', 'sales_return_items', 'purchase_return_items', 
        'stock_adjustment_items', 'payroll_variables', 'payroll_items', 'journal_lines',
        'delivery_orders', 'payments', 'invoices', 'purchase_invoices', 'sales_returns', 'purchase_returns', 
        'journal_entries', 'payrolls', 'stock_adjustments', 'cheques', 'receipt_vouchers', 'payment_vouchers', 
        'work_orders', 'bill_of_materials', 'credit_notes', 'debit_notes', 'promotions', 'retail_promotions',
        'opening_inventories',
        
        -- السجلات الرئيسية للشركة
        'assets', 'products', 'customers', 'suppliers', 'employees', 'accounts', 
        'cost_centers', 'warehouses', 'invitations', 'budgets', 'company_settings'
    ];
    v_t text;
    v_dyn RECORD;
    v_caller_role text;
BEGIN
    -- أ. التحقق من المدخلات
    IF p_org_id IS NULL THEN
        RAISE EXCEPTION 'معرف الشركة غير صالح أو فارغ.';
    END IF;

    -- ب. التحقق من صلاحية المستخدم (super_admin أو admin أو owner)
    v_caller_role := COALESCE(public.get_my_role(), auth.jwt() ->> 'role', '');
    IF v_caller_role NOT IN ('super_admin', 'admin', 'owner') 
       AND COALESCE(auth.jwt() ->> 'role', '') NOT IN ('super_admin', 'service_role') THEN
        RAISE EXCEPTION '⚠️ خطأ أمني: غير مصرح لك بحذف المنظمات من هذا المستوى.';
    END IF;

    -- ج. تفعيل وضع التجاوز (Restore Mode) لتعطيل موانع الحذف
    PERFORM set_config('app.restore_mode', 'on', true);

    -- د. فك ارتباط كافة المستخدمين بالمنظمة في جدول profiles لمنع تعارض المفتاح الأجنبي
    BEGIN
        UPDATE public.profiles 
        SET organization_id = NULL 
        WHERE organization_id = p_org_id;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- هـ. حذف صلاحيات وأدوار المنظمة
    BEGIN
        DELETE FROM public.role_permissions WHERE organization_id = p_org_id;
        DELETE FROM public.roles WHERE organization_id = p_org_id;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- و. المسح المتسلسل لكافة الجداول المعروفة
    FOREACH v_t IN ARRAY v_tables
    LOOP
        BEGIN
            EXECUTE format('DELETE FROM public.%I WHERE organization_id = %L', v_t, p_org_id);
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END LOOP;

    -- ز. شبكة الأمان الديناميكية: فحص وحذف أي جدول آخر بقاعدة البيانات مرتبط بمفتاح أجنبي مع organizations
    FOR v_dyn IN (
        SELECT DISTINCT
            c.conrelid::regclass::text AS tbl,
            a.attname AS col
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
        WHERE c.confrelid = 'public.organizations'::regclass
          AND c.contype = 'f'
          AND c.conrelid::regclass::text NOT IN ('public.organizations', 'public.profiles')
    ) LOOP
        BEGIN
            EXECUTE format('DELETE FROM %s WHERE %I = %L', v_dyn.tbl, v_dyn.col, p_org_id);
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END LOOP;

    -- ح. حذف سجل المنظمة نهائياً
    DELETE FROM public.organizations WHERE id = p_org_id;

    -- ط. إعادة وضع الحماية الطبيعي
    PERFORM set_config('app.restore_mode', 'off', true);

END; $function$
;
GRANT EXECUTE ON FUNCTION public.fn_delete_organization_safe(p_org_id uuid) TO anon, authenticated, service_role;

-- Function: fn_guard_journal_entry_balance()
CREATE OR REPLACE FUNCTION public.fn_guard_journal_entry_balance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_sum_debit NUMERIC;
    v_sum_credit NUMERIC;
    v_line_count INTEGER;
BEGIN
    IF (NEW.status = 'posted' OR NEW.is_posted = true) THEN
        SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0), COUNT(*)
          INTO v_sum_debit, v_sum_credit, v_line_count
          FROM public.journal_lines
         WHERE journal_entry_id = NEW.id;

        IF TG_OP = 'UPDATE' THEN
            IF (NEW.status = 'posted' AND (OLD.status IS DISTINCT FROM 'posted' OR OLD.is_posted IS DISTINCT FROM true))
               OR (NEW.is_posted = true AND OLD.is_posted IS DISTINCT FROM true) THEN
                
                IF v_line_count < 2 THEN
                    RAISE EXCEPTION '⚠️ صمام أمان توازن القيود: لا يمكن ترحيل القيد (%) لأنه لا يحتوي على طرفين محاسبيين على الأقل (مدين ودائن).', 
                        COALESCE(NEW.reference, NEW.id::text);
                END IF;

                IF ABS(v_sum_debit - v_sum_credit) > 0.05 THEN
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
$function$
;
GRANT EXECUTE ON FUNCTION public.fn_guard_journal_entry_balance() TO anon, authenticated, service_role;

-- Function: fn_guard_journal_lines_balance()
CREATE OR REPLACE FUNCTION public.fn_guard_journal_lines_balance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
    IF v_entry_id IS NULL THEN RETURN NULL; END IF;

    SELECT status, is_posted, reference INTO v_status, v_is_posted, v_reference
      FROM public.journal_entries WHERE id = v_entry_id;

    IF NOT FOUND THEN RETURN NULL; END IF;

    IF v_status = 'posted' OR v_is_posted = true THEN
        SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0), COUNT(*)
          INTO v_sum_debit, v_sum_credit, v_line_count
          FROM public.journal_lines WHERE journal_entry_id = v_entry_id;

        IF v_line_count = 0 THEN
            RAISE EXCEPTION '⚠️ صمام أمان توازن القيود: لا يمكن ترك القيد المرحل (%) بدون أسطر محاسبية.',
                COALESCE(v_reference, v_entry_id::text);
        END IF;

        IF ABS(v_sum_debit - v_sum_credit) > 0.05 THEN
            RAISE EXCEPTION '⚠️ صمام أمان توازن القيود: عملية التعديل أو الحذف تجعل القيد المرحل (%) غير متوازن! (إجمالي المدين: %, إجمالي الدائن: %, الفرق: %).',
                COALESCE(v_reference, v_entry_id::text), v_sum_debit, v_sum_credit, ABS(v_sum_debit - v_sum_credit);
        END IF;

        IF v_sum_debit <= 0 THEN
            RAISE EXCEPTION '⚠️ صمام أمان توازن القيود: لا يمكن حفظ أسطر القيد المرحل (%) بمبالغ صفرية أو سالبة.',
                COALESCE(v_reference, v_entry_id::text);
        END IF;
    END IF;
    RETURN NULL;
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.fn_guard_journal_lines_balance() TO anon, authenticated, service_role;

-- Function: fn_prevent_duplicate_voucher_reference()
CREATE OR REPLACE FUNCTION public.fn_prevent_duplicate_voucher_reference()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- إذا كان القيد يدوياً ويحمل مرجع يشبه سند صرف أو فاتورة مسجلة بالفعل
    IF (NEW.related_document_type IS NULL OR NEW.related_document_type = 'manual')
       AND NEW.reference IS NOT NULL 
       AND (NEW.reference LIKE 'PV-%' OR NEW.reference LIKE 'EXP-%' OR NEW.reference LIKE 'RV-%') THEN
       
        IF EXISTS (
            SELECT 1 FROM public.journal_entries 
            WHERE organization_id = NEW.organization_id 
              AND reference = NEW.reference 
              AND id != NEW.id
              AND status = 'posted'
        ) THEN
            RAISE EXCEPTION 'تنبيه رقابي: يوجد قيد محاسبي مرحل مسبقاً بنفس المرجع (%). لا يمكن إنشاء قيود مكررة لنفس السند.', NEW.reference;
        END IF;
    END IF;
    RETURN NEW;
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.fn_prevent_duplicate_voucher_reference() TO anon, authenticated, service_role;

-- Function: fn_prevent_rogue_warehouse_duplicates()
CREATE OR REPLACE FUNCTION public.fn_prevent_rogue_warehouse_duplicates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- منع إنشاء أي مستودع وهمي إذا كان مكرراً أو إذا كانت الشركة لديها مستودعات فعلية بالفعل
    IF NEW.name = 'المستودع الرئيسي' AND EXISTS (
        SELECT 1 FROM public.warehouses w 
        WHERE w.organization_id = NEW.organization_id 
        AND w.id IS DISTINCT FROM NEW.id
    ) THEN
        RETURN NULL; -- يتجاهل الإدراج تماماً وبدون أخطاء
    END IF;
    RETURN NEW;
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.fn_prevent_rogue_warehouse_duplicates() TO anon, authenticated, service_role;

-- Function: fn_protect_accounts_with_entries()
CREATE OR REPLACE FUNCTION public.fn_protect_accounts_with_entries()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_count INTEGER;
BEGIN
    -- السماح بالتجاوز أثناء مسح المنظمة
    IF current_setting('app.restore_mode', true) = 'on' THEN
        RETURN OLD;
    END IF;

    SELECT COUNT(*) INTO v_count FROM public.journal_lines WHERE account_id = OLD.id;
    IF v_count > 0 THEN
        RAISE EXCEPTION 'لا يمكن حذف الحساب (% - %) لوجود % حركة/حركات محاسبية مسجلة عليه.', OLD.code, OLD.name, v_count;
    END IF;
    RETURN OLD;
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.fn_protect_accounts_with_entries() TO anon, authenticated, service_role;

-- Function: fn_protect_customers_with_transactions()
CREATE OR REPLACE FUNCTION public.fn_protect_customers_with_transactions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_inv_count INTEGER;
    v_rv_count INTEGER;
BEGIN
    -- السماح بالتجاوز أثناء مسح المنظمة
    IF current_setting('app.restore_mode', true) = 'on' THEN
        RETURN OLD;
    END IF;

    SELECT COUNT(*) INTO v_inv_count FROM public.invoices WHERE customer_id = OLD.id;
    SELECT COUNT(*) INTO v_rv_count FROM public.receipt_vouchers WHERE customer_id = OLD.id;
    
    IF (v_inv_count + v_rv_count) > 0 THEN
        RAISE EXCEPTION 'لا يمكن الحذف النهائي للعميل (%) لوجود مستندات مالية مرتبطة به. استخدم الحذف المنطقي (Archive/Soft Delete).', OLD.name;
    END IF;
    RETURN OLD;
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.fn_protect_customers_with_transactions() TO anon, authenticated, service_role;

-- Function: fn_protect_suppliers_with_transactions()
CREATE OR REPLACE FUNCTION public.fn_protect_suppliers_with_transactions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_pi_count INTEGER;
    v_pv_count INTEGER;
BEGIN
    -- السماح بالتجاوز أثناء مسح المنظمة
    IF current_setting('app.restore_mode', true) = 'on' THEN
        RETURN OLD;
    END IF;

    SELECT COUNT(*) INTO v_pi_count FROM public.purchase_invoices WHERE supplier_id = OLD.id;
    SELECT COUNT(*) INTO v_pv_count FROM public.payment_vouchers WHERE supplier_id = OLD.id;
    
    IF (v_pi_count + v_pv_count) > 0 THEN
        RAISE EXCEPTION 'لا يمكن الحذف النهائي للمورد (%) لوجود مستندات مالية مرتبطة به.', OLD.name;
    END IF;
    RETURN OLD;
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.fn_protect_suppliers_with_transactions() TO anon, authenticated, service_role;

-- Function: fn_sync_employee_names()
CREATE OR REPLACE FUNCTION public.fn_sync_employee_names()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- مزامنة الاسم الكامل والاسم المختصر
    NEW.full_name := COALESCE(NEW.full_name, NEW.name);
    NEW.name := COALESCE(NEW.name, NEW.full_name);
    
    -- مزامنة الراتب بين basic_salary و salary تلقائياً
    IF NEW.basic_salary IS NULL AND NEW.salary IS NOT NULL THEN
        NEW.basic_salary := NEW.salary;
    ELSIF NEW.salary IS NULL AND NEW.basic_salary IS NOT NULL THEN
        NEW.salary := NEW.basic_salary;
    ELSIF NEW.basic_salary IS NOT NULL THEN
        NEW.salary := NEW.basic_salary;
    END IF;
    
    RETURN NEW;
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.fn_sync_employee_names() TO anon, authenticated, service_role;

-- Function: fn_sync_payment_voucher_journal()
CREATE OR REPLACE FUNCTION public.fn_sync_payment_voucher_journal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_journal_id uuid;
    v_debit_acc_id uuid;
    v_org_id uuid;
BEGIN
    -- منع التكرار اللانهائي (إذا كان الاستدعاء داخلياً من إجراء ترحيل آخر)
    IF pg_trigger_depth() > 1 THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    -- أ. معالجة الحذف الناعم (Soft Delete)
    IF TG_OP = 'UPDATE' AND NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
        v_journal_id := COALESCE(NEW.related_journal_entry_id, OLD.related_journal_entry_id);
        IF v_journal_id IS NOT NULL THEN
            UPDATE public.journal_entries SET status = 'draft', is_posted = false WHERE id = v_journal_id;
            DELETE FROM public.journal_lines WHERE journal_entry_id = v_journal_id;
            DELETE FROM public.journal_entries WHERE id = v_journal_id;
        END IF;
        RETURN NEW;
    END IF;

    -- ب. معالجة الحذف الفعلي (Hard Delete)
    IF TG_OP = 'DELETE' THEN
        v_journal_id := OLD.related_journal_entry_id;
        IF v_journal_id IS NOT NULL THEN
            UPDATE public.journal_entries SET status = 'draft', is_posted = false WHERE id = v_journal_id;
            DELETE FROM public.journal_lines WHERE journal_entry_id = v_journal_id;
            DELETE FROM public.journal_entries WHERE id = v_journal_id;
        END IF;
        RETURN OLD;
    END IF;

    -- ج. معالجة التعديل (UPDATE)
    IF TG_OP = 'UPDATE' THEN
        -- التحقق من أي تعديل في حساب الخزينة أو المبلغ أو التاريخ أو البيان أو مركز التكلفة
        IF (OLD.treasury_account_id IS DISTINCT FROM NEW.treasury_account_id)
           OR (OLD.amount IS DISTINCT FROM NEW.amount)
           OR (OLD.payment_date IS DISTINCT FROM NEW.payment_date)
           OR (OLD.notes IS DISTINCT FROM NEW.notes)
           OR (OLD.cost_center_id IS DISTINCT FROM NEW.cost_center_id) THEN

            v_journal_id := NEW.related_journal_entry_id;
            v_org_id := COALESCE(NEW.organization_id, OLD.organization_id, public.get_my_org());

            IF v_journal_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.journal_entries WHERE id = v_journal_id) THEN
                -- استخراج حساب المدين المسجل بالقيد (سواء مصروف أو مورد)
                SELECT account_id INTO v_debit_acc_id 
                FROM public.journal_lines 
                WHERE journal_entry_id = v_journal_id AND debit > 0 
                LIMIT 1;

                IF v_debit_acc_id IS NULL AND NEW.supplier_id IS NOT NULL THEN
                    SELECT id INTO v_debit_acc_id 
                    FROM public.accounts 
                    WHERE organization_id = v_org_id AND (code = '201' OR code LIKE '201%' OR name ILIKE '%مورد%') 
                    LIMIT 1;
                END IF;

                IF v_debit_acc_id IS NOT NULL AND NEW.treasury_account_id IS NOT NULL THEN
                    PERFORM public.approve_payment_voucher(NEW.id, v_debit_acc_id);
                END IF;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.fn_sync_payment_voucher_journal() TO anon, authenticated, service_role;

-- Function: fn_sync_receipt_voucher_journal()
CREATE OR REPLACE FUNCTION public.fn_sync_receipt_voucher_journal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_journal_id uuid;
    v_credit_acc_id uuid;
    v_org_id uuid;
BEGIN
    IF pg_trigger_depth() > 1 THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    -- أ. معالجة الحذف الناعم (Soft Delete)
    IF TG_OP = 'UPDATE' AND NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
        v_journal_id := COALESCE(NEW.related_journal_entry_id, OLD.related_journal_entry_id);
        IF v_journal_id IS NOT NULL THEN
            UPDATE public.journal_entries SET status = 'draft', is_posted = false WHERE id = v_journal_id;
            DELETE FROM public.journal_lines WHERE journal_entry_id = v_journal_id;
            DELETE FROM public.journal_entries WHERE id = v_journal_id;
        END IF;
        RETURN NEW;
    END IF;

    -- ب. معالجة الحذف الفعلي (Hard Delete)
    IF TG_OP = 'DELETE' THEN
        v_journal_id := OLD.related_journal_entry_id;
        IF v_journal_id IS NOT NULL THEN
            UPDATE public.journal_entries SET status = 'draft', is_posted = false WHERE id = v_journal_id;
            DELETE FROM public.journal_lines WHERE journal_entry_id = v_journal_id;
            DELETE FROM public.journal_entries WHERE id = v_journal_id;
        END IF;
        RETURN OLD;
    END IF;

    -- ج. معالجة التعديل (UPDATE)
    IF TG_OP = 'UPDATE' THEN
        IF (OLD.treasury_account_id IS DISTINCT FROM NEW.treasury_account_id)
           OR (OLD.amount IS DISTINCT FROM NEW.amount)
           OR (OLD.receipt_date IS DISTINCT FROM NEW.receipt_date)
           OR (OLD.notes IS DISTINCT FROM NEW.notes) THEN

            v_journal_id := NEW.related_journal_entry_id;
            v_org_id := COALESCE(NEW.organization_id, OLD.organization_id, public.get_my_org());

            IF v_journal_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.journal_entries WHERE id = v_journal_id) THEN
                SELECT account_id INTO v_credit_acc_id 
                FROM public.journal_lines 
                WHERE journal_entry_id = v_journal_id AND credit > 0 
                LIMIT 1;

                IF v_credit_acc_id IS NULL AND NEW.customer_id IS NOT NULL THEN
                    SELECT id INTO v_credit_acc_id 
                    FROM public.accounts 
                    WHERE organization_id = v_org_id AND (code = '1221' OR code LIKE '1221%' OR name ILIKE '%عملاء%') 
                    LIMIT 1;
                END IF;

                IF v_credit_acc_id IS NOT NULL AND NEW.treasury_account_id IS NOT NULL THEN
                    PERFORM public.approve_receipt_voucher(NEW.id, v_credit_acc_id);
                END IF;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.fn_sync_receipt_voucher_journal() TO anon, authenticated, service_role;

-- Function: fn_sync_voucher_dates()
CREATE OR REPLACE FUNCTION public.fn_sync_voucher_dates()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF TG_TABLE_NAME = 'payment_vouchers' THEN
        IF NEW.payment_date IS NOT NULL AND NEW.date IS NULL THEN
            NEW.date := NEW.payment_date;
        ELSIF NEW.date IS NOT NULL AND NEW.payment_date IS NULL THEN
            NEW.payment_date := NEW.date;
        END IF;
    ELSIF TG_TABLE_NAME = 'receipt_vouchers' THEN
        IF NEW.receipt_date IS NOT NULL AND NEW.date IS NULL THEN
            NEW.date := NEW.receipt_date;
        ELSIF NEW.date IS NOT NULL AND NEW.receipt_date IS NULL THEN
            NEW.receipt_date := NEW.date;
        END IF;
    END IF;
    RETURN NEW;
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.fn_sync_voucher_dates() TO anon, authenticated, service_role;

-- Function: get_all_supplier_balances_fast(p_org_id uuid, p_search text, p_limit integer, p_offset integer)
CREATE OR REPLACE FUNCTION public.get_all_supplier_balances_fast(p_org_id uuid, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 1000, p_offset integer DEFAULT 0)
 RETURNS TABLE(supplier_id uuid, supplier_name text, phone text, tax_number text, opening_balance numeric, total_purchases numeric, balance numeric, last_invoice text, total_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
    v_search text;
    v_total_rows bigint;
BEGIN
    v_search := NULLIF(TRIM(p_search), '');

    SELECT COUNT(*) INTO v_total_rows
    FROM public.suppliers s
    WHERE s.organization_id = p_org_id
      AND s.deleted_at IS NULL
      AND (
          v_search IS NULL
          OR s.name ILIKE '%' || v_search || '%'
          OR s.phone ILIKE '%' || v_search || '%'
          OR s.tax_number ILIKE '%' || v_search || '%'
      );

    RETURN QUERY
    WITH 
    supplier_accounts AS (
        SELECT a.id AS account_id
        FROM public.accounts a
        WHERE (a.organization_id = p_org_id OR a.organization_id IS NULL)
          AND (a.code LIKE '201%' OR a.code LIKE '2101%' OR a.code LIKE '221%')
    ),
    agg_invoices AS (
        SELECT 
            pi.supplier_id,
            COALESCE(SUM(pi.total_amount), 0) AS gross_purchases,
            COALESCE(SUM(
                pi.total_amount - GREATEST(0, COALESCE(pi.paid_amount, 0) - COALESCE((
                    SELECT SUM(pv.amount) 
                    FROM public.payment_vouchers pv 
                    WHERE pv.supplier_id = pi.supplier_id 
                      AND pi.invoice_number IS NOT NULL
                      AND pv.notes ILIKE '%' || pi.invoice_number || '%'
                ), 0))
            ), 0) AS total_invoiced,
            MAX(pi.invoice_date::text) AS max_inv_date
        FROM public.purchase_invoices pi
        WHERE pi.organization_id = p_org_id AND pi.status != 'draft'
        GROUP BY pi.supplier_id
    ),
    agg_payments AS (
        SELECT pv.supplier_id, COALESCE(SUM(pv.amount), 0) AS total_payments
        FROM public.payment_vouchers pv
        WHERE pv.organization_id = p_org_id
        GROUP BY pv.supplier_id
    ),
    agg_returns AS (
        SELECT pr.supplier_id, COALESCE(SUM(pr.total_amount), 0) AS total_returns
        FROM public.purchase_returns pr
        WHERE pr.organization_id = p_org_id AND pr.status != 'draft'
        GROUP BY pr.supplier_id
    ),
    agg_debit_notes AS (
        SELECT dn.supplier_id, COALESCE(SUM(dn.total_amount), 0) AS total_debit_notes
        FROM public.debit_notes dn
        WHERE dn.organization_id = p_org_id AND dn.status = 'posted'
        GROUP BY dn.supplier_id
    ),
    agg_cheques AS (
        SELECT ch.party_id AS supplier_id, COALESCE(SUM(ch.amount), 0) AS total_cheques
        FROM public.cheques ch
        WHERE ch.organization_id = p_org_id AND ch.type = 'outgoing' AND ch.status != 'rejected'
        GROUP BY ch.party_id
    ),
    agg_rebates AS (
        SELECT vrs.vendor_id AS supplier_id, COALESCE(SUM(vrs.total_claim_amount), 0) AS total_rebates
        FROM public.vendor_rebate_settlements vrs
        WHERE vrs.organization_id = p_org_id AND vrs.status IN ('APPROVED', 'SETTLED')
        GROUP BY vrs.vendor_id
    ),
    manual_entries AS (
        SELECT 
            s.id AS supplier_id,
            COALESCE(SUM(jl.credit), 0) AS manual_credit,
            COALESCE(SUM(jl.debit), 0) AS manual_debit
        FROM public.suppliers s
        JOIN public.journal_entries je ON (je.organization_id = p_org_id OR je.organization_id IS NULL)
         AND (je.status IS NULL OR je.status NOT IN ('cancelled', 'rejected'))
         AND (
             je.related_document_id = s.id
             OR (
                 (je.description ILIKE '%' || TRIM(s.name) || '%' OR je.reference ILIKE '%' || TRIM(s.name) || '%')
                 AND NOT EXISTS (
                     SELECT 1 FROM public.suppliers s2 
                     WHERE s2.organization_id = p_org_id AND s2.id != s.id AND s2.deleted_at IS NULL
                       AND (je.description ILIKE '%' || TRIM(s2.name) || '%' OR je.reference ILIKE '%' || TRIM(s2.name) || '%')
                       AND LENGTH(TRIM(s2.name)) > LENGTH(TRIM(s.name))
                 )
             )
         )
         AND (je.reference IS NULL OR (je.reference NOT LIKE 'PINV-%' AND je.reference NOT LIKE 'PUR-%' AND je.reference NOT LIKE 'PV-%' AND je.reference NOT LIKE 'PR-%' AND je.reference NOT LIKE 'DN-%' AND je.reference NOT LIKE 'CHQ-%' AND je.reference NOT LIKE 'OP-%' AND je.reference NOT LIKE 'OB-%'))
         AND (je.description IS NULL OR je.description NOT ILIKE '%رصيد افتتاحي%')
        JOIN public.journal_lines jl ON jl.journal_entry_id = je.id AND jl.account_id IN (SELECT sa.account_id FROM supplier_accounts sa)
        WHERE s.organization_id = p_org_id AND s.deleted_at IS NULL
        GROUP BY s.id
    ),
    opening_check AS (
        SELECT 
            s.id AS supplier_id,
            COUNT(*) AS op_count,
            COALESCE(SUM(jl.credit - jl.debit), 0) AS op_amount
        FROM public.suppliers s
        JOIN public.journal_entries je ON (je.organization_id = p_org_id OR je.organization_id IS NULL)
         AND (je.status IS NULL OR je.status NOT IN ('cancelled', 'rejected'))
         AND (
             je.related_document_id = s.id
             OR je.reference = 'OP-SUPP-' || s.id::text
             OR (
                 (je.description ILIKE '%' || TRIM(s.name) || '%' OR je.reference ILIKE '%' || TRIM(s.name) || '%')
                 AND NOT EXISTS (
                     SELECT 1 FROM public.suppliers s2 
                     WHERE s2.organization_id = p_org_id AND s2.id != s.id AND s2.deleted_at IS NULL
                       AND (je.description ILIKE '%' || TRIM(s2.name) || '%' OR je.reference ILIKE '%' || TRIM(s2.name) || '%')
                       AND LENGTH(TRIM(s2.name)) > LENGTH(TRIM(s.name))
                 )
             )
         )
         AND (je.description ILIKE '%رصيد افتتاحي%' OR je.reference ILIKE 'OP-%' OR je.reference ILIKE 'OB-%' OR je.related_document_type = 'opening_balance')
        JOIN public.journal_lines jl ON jl.journal_entry_id = je.id AND jl.account_id IN (SELECT sa.account_id FROM supplier_accounts sa)
        WHERE s.organization_id = p_org_id AND s.deleted_at IS NULL
        GROUP BY s.id
    )
    SELECT 
        s.id AS supplier_id,
        s.name::text AS supplier_name,
        COALESCE(s.phone, '')::text AS phone,
        COALESCE(s.tax_number, '')::text AS tax_number,
        COALESCE(s.opening_balance, 0)::numeric AS opening_balance,
        COALESCE(inv.gross_purchases, 0)::numeric AS total_purchases,
        ROUND(
            (CASE WHEN COALESCE(oc.op_count, 0) > 0 THEN COALESCE(oc.op_amount, 0) ELSE COALESCE(s.opening_balance, 0) END)
            + COALESCE(inv.total_invoiced, 0)
            + COALESCE(me.manual_credit, 0)
            - COALESCE(me.manual_debit, 0)
            - COALESCE(pay.total_payments, 0)
            - COALESCE(ret.total_returns, 0)
            - COALESCE(deb.total_debit_notes, 0)
            - COALESCE(chq.total_cheques, 0)
            - COALESCE(reb.total_rebates, 0),
            2
        )::numeric AS balance,
        COALESCE(inv.max_inv_date, '')::text AS last_invoice,
        v_total_rows AS total_count
    FROM public.suppliers s
    LEFT JOIN agg_invoices inv ON inv.supplier_id = s.id
    LEFT JOIN agg_payments pay ON pay.supplier_id = s.id
    LEFT JOIN agg_returns ret ON ret.supplier_id = s.id
    LEFT JOIN agg_debit_notes deb ON deb.supplier_id = s.id
    LEFT JOIN agg_cheques chq ON chq.supplier_id = s.id
    LEFT JOIN agg_rebates reb ON reb.supplier_id = s.id
    LEFT JOIN manual_entries me ON me.supplier_id = s.id
    LEFT JOIN opening_check oc ON oc.supplier_id = s.id
    WHERE s.organization_id = p_org_id AND s.deleted_at IS NULL
      AND (v_search IS NULL OR s.name ILIKE '%' || v_search || '%' OR s.phone ILIKE '%' || v_search || '%')
    ORDER BY balance DESC
    LIMIT p_limit OFFSET p_offset;
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.get_all_supplier_balances_fast(p_org_id uuid, p_search text, p_limit integer, p_offset integer) TO anon, authenticated, service_role;

-- Function: hims_dispense_prescription(p_prescription_id uuid, p_warehouse_id uuid)
CREATE OR REPLACE FUNCTION public.hims_dispense_prescription(p_prescription_id uuid, p_warehouse_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE 
    v_med record; 
    v_org_id uuid; 
    v_visit_id uuid;
    v_visit_type text;
    v_final_wh_id uuid;
    v_sales_price numeric; 
    v_product_name text;
    v_bill_status text; 
    v_ins_id uuid;
    v_total_cogs numeric(18,2) := 0; 
    v_cogs_acc_id uuid; 
    v_inv_acc_id uuid;
    v_mappings jsonb; 
    v_cost_price numeric; 
    v_journal_id uuid;
    v_meds jsonb;
BEGIN
    -- أ. جلب بيانات الروشتة والأدوية والزيارة
    SELECT p.organization_id, p.visit_id, v.visit_type, p.medications
      INTO v_org_id, v_visit_id, v_visit_type, v_meds
      FROM public.hims_prescriptions p
      LEFT JOIN public.hims_visits v ON v.id = p.visit_id
     WHERE p.id = p_prescription_id;
    
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION '⚠️ خطأ: لم يتم العثور على الروشتة الطبية المحددة.';
    END IF;

    -- ب. التحقق المالي الذكي:
    -- يُسمح بالصرف فوراً إذا:
    -- 1. وضع المحاكاة / الاستعادة مفعل (app.restore_mode = 'on')
    -- 2. المريض لديه جهة تأمين مسجلة (Insurance)
    -- 3. المريض حالة طوارئ أو تنويم داخلي (يُحاسب لاحقاً عند الخروج)
    -- 4. الفاتورة مسددة بالكامل أو مسددة جزئياً بالخزينة
    SELECT payment_status, insurance_provider_id 
      INTO v_bill_status, v_ins_id 
      FROM public.hims_billing 
     WHERE visit_id = v_visit_id;

    IF COALESCE(current_setting('app.restore_mode', true), 'off') != 'on' THEN
        IF v_ins_id IS NULL 
           AND (v_visit_type NOT IN ('inpatient', 'emergency') OR v_visit_type IS NULL) 
           AND (v_bill_status IS NULL OR v_bill_status NOT IN ('paid', 'partially_paid')) THEN
            RAISE EXCEPTION '⚠️ خطأ أمني: لا يمكن صرف الدواء للعيادات الخارجية قبل سداد قيمة الروشتة بالخزينة أولاً.';
        END IF;
    END IF;

    -- ج. تحديد المستودع (الممرر صراحة > إعدادات الصيدلية > أول مستودع متاح)
    v_final_wh_id := COALESCE(
        p_warehouse_id,
        (SELECT default_pharmacy_warehouse FROM public.hims_settings WHERE organization_id = v_org_id),
        (SELECT id FROM public.warehouses WHERE organization_id = v_org_id AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1)
    );

    IF v_final_wh_id IS NULL THEN
        RAISE EXCEPTION '⚠️ فشل الصرف: لم يتم العثور على مستودع صيدلية معرف لهذه المنظمة.';
    END IF;

    -- د. جلب حسابات التكلفة والمخزون للربط المالي
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    IF v_mappings IS NOT NULL THEN
        BEGIN
            v_cogs_acc_id := public.resolve_leaf_account(COALESCE((v_mappings->>'COGS')::uuid, (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '511' LIMIT 1)));
            v_inv_acc_id := public.resolve_leaf_account(COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '10302' LIMIT 1)));
        EXCEPTION WHEN OTHERS THEN
            v_cogs_acc_id := NULL;
            v_inv_acc_id := NULL;
        END;
    END IF;

    -- هـ. خصم الأدوية من المخزون
    IF v_meds IS NOT NULL AND jsonb_array_length(v_meds) > 0 THEN
        FOR v_med IN 
            SELECT * FROM jsonb_to_recordset(v_meds) 
            AS x(product_id uuid, qty numeric)
        LOOP
            -- 1. التأكد من تاريخ الصلاحية
            IF EXISTS (
                SELECT 1 FROM public.products 
                WHERE id = v_med.product_id 
                  AND organization_id = v_org_id 
                  AND expiry_date IS NOT NULL 
                  AND expiry_date < CURRENT_DATE
            ) THEN
                RAISE EXCEPTION '⚠️ خطأ أمني: الدواء (%) منتهي الصلاحية ولا يمكن صرفه طبياً.', 
                    (SELECT name FROM public.products WHERE id = v_med.product_id);
            END IF;

            -- 2. التأكد من توفر الرصيد الكافي بالمخزن
            IF (SELECT COALESCE(stock, 0) FROM public.products WHERE id = v_med.product_id AND organization_id = v_org_id) < v_med.qty THEN
                RAISE EXCEPTION '⚠️ عجز مخزني: لا يتوفر رصيد كافٍ للدواء (%). الرصيد المتوفر (%) فقط.', 
                    (SELECT name FROM public.products WHERE id = v_med.product_id),
                    (SELECT COALESCE(stock, 0) FROM public.products WHERE id = v_med.product_id AND organization_id = v_org_id);
            END IF;

            SELECT name, sales_price, COALESCE(cost, 0) 
              INTO v_product_name, v_sales_price, v_cost_price
              FROM public.products 
             WHERE id = v_med.product_id;

            -- خصم الكمية من رصيد المنتج
            UPDATE public.products 
               SET stock = stock - v_med.qty 
             WHERE id = v_med.product_id 
               AND organization_id = v_org_id;

            -- خصم التشغيلات FEFO إن كانت مفعلة
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'product_batches') THEN
                DECLARE
                    v_rem numeric := v_med.qty;
                    v_b RECORD;
                BEGIN
                    FOR v_b IN 
                        SELECT id, quantity 
                        FROM public.product_batches
                        WHERE product_id = v_med.product_id 
                          AND warehouse_id = v_final_wh_id
                          AND quantity > 0
                        ORDER BY expiry_date ASC, created_at ASC
                    LOOP
                        EXIT WHEN v_rem <= 0;
                        IF v_b.quantity >= v_rem THEN
                            UPDATE public.product_batches SET quantity = quantity - v_rem WHERE id = v_b.id;
                            v_rem := 0;
                        ELSE
                            UPDATE public.product_batches SET quantity = 0 WHERE id = v_b.id;
                            v_rem := v_rem - v_b.quantity;
                        END IF;
                    END LOOP;
                END;
            END IF;

            v_total_cogs := v_total_cogs + (v_cost_price * v_med.qty);
        END LOOP;
    END IF;

    -- و. تحديث حالة الروشتة إلى "مصروفة" وتثبيت تاريخ الصرف
    UPDATE public.hims_prescriptions 
       SET status = 'dispensed', 
           dispensed_at = now() 
     WHERE id = p_prescription_id;

    -- ز. تسجيل قيد محاسبي لتكلفة البضاعة المباعة إن وُجدت حسابات
    IF v_total_cogs > 0.01 AND v_cogs_acc_id IS NOT NULL AND v_inv_acc_id IS NOT NULL THEN
        BEGIN
            INSERT INTO public.journal_entries (organization_id, transaction_date, description, reference, status, related_document_id, related_document_type, is_posted)
            VALUES (v_org_id, CURRENT_DATE, 'إثبات تكلفة أدوية مصروفة - روشتة: ' || p_prescription_id::TEXT, 'PHARM-' || substring(p_prescription_id::TEXT, 1, 8), 'posted', p_prescription_id, 'hims_prescription', true)
            RETURNING id INTO v_journal_id;

            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
            VALUES 
                (v_journal_id, v_cogs_acc_id, v_total_cogs, 0, v_org_id, 'تكلفة أدوية مباعة'),
                (v_journal_id, v_inv_acc_id, 0, v_total_cogs, v_org_id, 'تخفيض مخزون الصيدلية');
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;

    -- ح. إعادة احتساب الأرصدة التراكمية
    BEGIN
        PERFORM public.recalculate_stock_rpc(v_org_id);
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.hims_dispense_prescription(p_prescription_id uuid, p_warehouse_id uuid) TO anon, authenticated, service_role;

-- Function: mfg_record_qc_inspection(p_notes_client text, p_progress_id_client uuid, p_status_client text)
CREATE OR REPLACE FUNCTION public.mfg_record_qc_inspection(p_notes_client text, p_progress_id_client uuid, p_status_client text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- استدعاء الدالة الأصلية بالترتيب الصحيح للمعاملات
    PERFORM public.mfg_record_qc_inspection(p_progress_id_client, p_status_client, p_notes_client, NULL);
END; $function$
;
GRANT EXECUTE ON FUNCTION public.mfg_record_qc_inspection(p_notes_client text, p_progress_id_client uuid, p_status_client text) TO anon, authenticated, service_role;

-- Function: mfg_record_qc_inspection(p_progress_id uuid, p_status text, p_notes text, p_defect_type text)
CREATE OR REPLACE FUNCTION public.mfg_record_qc_inspection(p_progress_id uuid, p_status text, p_notes text, p_defect_type text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    INSERT INTO public.mfg_qc_inspections (progress_id, inspector_id, status, notes, defect_type, organization_id)
    VALUES (p_progress_id, auth.uid(), p_status, p_notes, p_defect_type, public.get_my_org());

    -- تحديث حالة التقدم بناءً على نتيجة الفحص
    UPDATE public.mfg_order_progress
    SET
        qc_verified = CASE
            WHEN p_status = 'pass' THEN true
            WHEN p_status = 'rework' THEN NULL
            ELSE false
        END,
        status = CASE WHEN p_status = 'rework' THEN 'active' ELSE status END -- تم التعديل: عند إعادة التشغيل، تعود الحالة إلى 'active'
    WHERE id = p_progress_id;
END; $function$
;
GRANT EXECUTE ON FUNCTION public.mfg_record_qc_inspection(p_progress_id uuid, p_status text, p_notes text, p_defect_type text) TO anon, authenticated, service_role;

-- Function: recalculate_all_products_wac()
CREATE OR REPLACE FUNCTION public.recalculate_all_products_wac()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    IF v_org_id IS NOT NULL THEN
        PERFORM public.recalculate_all_products_wac(v_org_id);
    END IF;
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.recalculate_all_products_wac() TO anon, authenticated, service_role;

-- Function: recalculate_all_products_wac(p_org_id uuid)
CREATE OR REPLACE FUNCTION public.recalculate_all_products_wac(p_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_prod record;
BEGIN
    FOR v_prod IN SELECT id FROM public.products WHERE organization_id = p_org_id LOOP
        PERFORM public.recalculate_product_wac(v_prod.id, p_org_id);
    END LOOP;
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.recalculate_all_products_wac(p_org_id uuid) TO anon, authenticated, service_role;

-- Function: recalculate_product_wac(p_product_id uuid)
CREATE OR REPLACE FUNCTION public.recalculate_product_wac(p_product_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    RETURN public.recalculate_product_wac(p_product_id, v_org_id);
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.recalculate_product_wac(p_product_id uuid) TO anon, authenticated, service_role;

-- Function: recalculate_product_wac(p_product_id uuid, p_org_id uuid)
CREATE OR REPLACE FUNCTION public.recalculate_product_wac(p_product_id uuid, p_org_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_org_id uuid;
    v_current_stock numeric := 0;
    v_current_wac numeric := 0;
    v_base_uom_id uuid;
    v_rec record;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    
    SELECT base_uom_id, COALESCE(purchase_price, cost, 0) INTO v_base_uom_id, v_current_wac 
    FROM public.products 
    WHERE id = p_product_id;
    
    DROP TABLE IF EXISTS temp_moves;
    CREATE TEMP TABLE temp_moves (
        move_id uuid,
        tx_table text,
        tx_item_id uuid,
        tx_date timestamp with time zone,
        type text,
        qty numeric,
        unit_price numeric
    );
    
    -- 2.1 رصيد أول المدة
    INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
    SELECT oi.id, 'opening', oi.id, oi.created_at, 'IN', 
           public.uom_convert(oi.quantity, oi.uom_id, v_base_uom_id),
           COALESCE(oi.cost, 0)
    FROM public.opening_inventories oi
    WHERE oi.product_id = p_product_id AND oi.organization_id = v_org_id;

    -- 2.2 فواتير المشتريات
    INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
    SELECT pii.id, 'purchase', pii.id, pi.invoice_date::timestamp with time zone, 'IN',
           public.uom_convert(pii.quantity, pii.uom_id, v_base_uom_id),
           CASE WHEN pii.quantity > 0 THEN (pii.unit_price * pii.quantity) / NULLIF(public.uom_convert(pii.quantity, pii.uom_id, v_base_uom_id), 0) ELSE 0 END
    FROM public.purchase_invoice_items pii
    JOIN public.purchase_invoices pi ON pii.purchase_invoice_id = pi.id
    WHERE pii.product_id = p_product_id AND pi.status IN ('posted', 'paid') AND pi.organization_id = v_org_id;

    -- 2.3 فواتير المبيعات المباشرة
    INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
    SELECT ii.id, 'sale', ii.id, i.invoice_date::timestamp with time zone, 'OUT',
           public.uom_convert(ii.quantity, ii.uom_id, v_base_uom_id),
           0
    FROM public.invoice_items ii
    JOIN public.invoices i ON ii.invoice_id = i.id
    WHERE ii.product_id = p_product_id AND i.status IN ('posted', 'paid') AND i.organization_id = v_org_id
;

    -- 2.3b مكونات فواتير المبيعات (خامات التصنيع المباشر)
    INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
    SELECT ii.id, 'sale_bom', ii.id, i.invoice_date::timestamp with time zone, 'OUT',
           public.uom_convert(ii.quantity, ii.uom_id, (SELECT base_uom_id FROM public.products WHERE id = ii.product_id)) * bom.quantity_required,
           0
    FROM public.invoice_items ii
    JOIN public.invoices i ON ii.invoice_id = i.id
    JOIN public.bill_of_materials bom ON bom.product_id = ii.product_id
    WHERE bom.raw_material_id = p_product_id AND i.status IN ('posted', 'paid') AND i.organization_id = v_org_id;

    -- 2.4 مرتجعات المبيعات
    INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
    SELECT sri.id, 'sales_return', sri.id, sr.return_date::timestamp with time zone, 'IN',
           public.uom_convert(sri.quantity, sri.uom_id, v_base_uom_id),
           COALESCE((SELECT cost FROM public.invoice_items WHERE product_id = p_product_id AND invoice_id = sr.original_invoice_id LIMIT 1), v_current_wac)
    FROM public.sales_return_items sri
    JOIN public.sales_returns sr ON sri.sales_return_id = sr.id
    WHERE sri.product_id = p_product_id AND sr.status = 'posted' AND sr.organization_id = v_org_id;

    -- 2.5 مرتجعات المشتريات
    INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
    SELECT pri.id, 'purchase_return', pri.id, pr.return_date::timestamp with time zone, 'OUT',
           public.uom_convert(pri.quantity, pri.uom_id, v_base_uom_id),
           0
    FROM public.purchase_return_items pri
    JOIN public.purchase_returns pr ON pri.purchase_return_id = pr.id
    WHERE pri.product_id = p_product_id AND pr.status = 'posted' AND pr.organization_id = v_org_id;

    -- 2.6 تسويات المخزون
    INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
    SELECT sai.id, 'adjustment', sai.id, sa.adjustment_date::timestamp with time zone,
           CASE WHEN sai.quantity >= 0 THEN 'IN' ELSE 'OUT' END,
           ABS(public.uom_convert(sai.quantity, sai.uom_id, v_base_uom_id)),
           COALESCE((SELECT purchase_price FROM public.products WHERE id = sai.product_id), 0)
    FROM public.stock_adjustment_items sai
    JOIN public.stock_adjustments sa ON sai.stock_adjustment_id = sa.id
    WHERE sai.product_id = p_product_id AND sa.status = 'posted' AND sa.organization_id = v_org_id;

    -- 2.7 إنتاج التصنيع
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mfg_production_orders') THEN
        INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
        SELECT po.id, 'manufacturing_fg', po.id, po.end_date::timestamp with time zone, 'IN',
               po.quantity_to_produce,
               COALESCE(
                   (SELECT total_actual_cost / NULLIF(qty, 0) FROM public.v_mfg_order_profitability WHERE order_id = po.id),
                   (SELECT estimated_cost / NULLIF(qty, 0) FROM public.v_mfg_order_profitability WHERE order_id = po.id),
                   0
               )
        FROM public.mfg_production_orders po
        WHERE po.product_id = p_product_id AND po.status = 'completed' AND po.organization_id = v_org_id;
    END IF;

    -- 2.8 استهلاك خامات التصنيع
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mfg_actual_material_usage') THEN
        INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
        SELECT amu.id, 'manufacturing_raw', amu.id, amu.created_at, 'OUT',
               public.uom_convert(amu.actual_quantity, amu.uom_id, v_base_uom_id),
               0
        FROM public.mfg_actual_material_usage amu
        JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id
        JOIN public.mfg_production_orders po ON op.production_order_id = po.id
        WHERE amu.raw_material_id = p_product_id AND po.status = 'completed' AND amu.organization_id = v_org_id;
    END IF;

    -- 2.9 مبيعات المطاعم والكافيهات
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'order_items') THEN
        INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
        SELECT oi.id, 'restaurant', oi.id, o.created_at, 'OUT',
               public.uom_convert(oi.quantity, oi.uom_id, v_base_uom_id),
               0
        FROM public.order_items oi
        JOIN public.orders o ON oi.order_id = o.id
        WHERE oi.product_id = p_product_id AND o.status IN ('PAID', 'COMPLETED') AND o.organization_id = v_org_id
          AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = oi.product_id);

        INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
        SELECT oi.id, 'restaurant_bom', oi.id, o.created_at, 'OUT',
               public.uom_convert(oi.quantity, oi.uom_id, (SELECT base_uom_id FROM public.products WHERE id = oi.product_id)) * bom.quantity_required,
               0
        FROM public.order_items oi
        JOIN public.orders o ON oi.order_id = o.id
        JOIN public.bill_of_materials bom ON bom.product_id = oi.product_id
        WHERE bom.raw_material_id = p_product_id AND o.status IN ('PAID', 'COMPLETED') AND o.organization_id = v_org_id;
    END IF;

    -- 2.10 استهلاك وصرف المستلزمات الطبية HIMS
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'hims_billing_items') THEN
        INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
        SELECT hbi.id, 'hims', hbi.id, hbi.created_at, 'OUT',
               public.uom_convert(hbi.quantity, hbi.uom_id, v_base_uom_id),
               0
        FROM public.hims_billing_items hbi
        WHERE hbi.product_id = p_product_id AND hbi.organization_id = v_org_id;
    END IF;

    -- 3. معالجة الحركات تتابعياً لحساب متوسط التكلفة
    FOR v_rec IN SELECT * FROM temp_moves ORDER BY tx_date ASC, type DESC LOOP
        IF v_rec.type = 'IN' THEN
            IF (v_current_stock + v_rec.qty) > 0 THEN
                v_current_wac := ((v_current_stock * v_current_wac) + (v_rec.qty * v_rec.unit_price)) / (v_current_stock + v_rec.qty);
            ELSE
                v_current_wac := v_rec.unit_price;
            END IF;
            v_current_stock := v_current_stock + v_rec.qty;
        ELSE
            v_current_stock := v_current_stock - v_rec.qty;
            
            IF v_rec.tx_table = 'sale' OR v_rec.tx_table = 'sale_bom' THEN
                UPDATE public.invoice_items SET cost = ROUND(v_current_wac, 4) WHERE id = v_rec.tx_item_id;
            ELSIF v_rec.tx_table = 'restaurant' OR v_rec.tx_table = 'restaurant_bom' THEN
                UPDATE public.order_items SET unit_cost = ROUND(v_current_wac, 4) WHERE id = v_rec.tx_item_id;
            ELSIF v_rec.tx_table = 'purchase_return' THEN
                UPDATE public.purchase_return_items SET unit_price = ROUND(v_current_wac, 4) WHERE id = v_rec.tx_item_id;
            ELSIF v_rec.tx_table = 'hims' THEN
                UPDATE public.hims_billing_items SET unit_cost = ROUND(v_current_wac, 4) WHERE id = v_rec.tx_item_id;
            END IF;
        END IF;
    END LOOP;

    UPDATE public.products 
    SET weighted_average_cost = ROUND(v_current_wac, 4), 
        cost = ROUND(v_current_wac, 4) 
    WHERE id = p_product_id;

    DROP TABLE IF EXISTS temp_moves;
    RETURN ROUND(v_current_wac, 4);
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.recalculate_product_wac(p_product_id uuid, p_org_id uuid) TO anon, authenticated, service_role;

-- Function: recalculate_supplier_balances(p_org_id uuid)
CREATE OR REPLACE FUNCTION public.recalculate_supplier_balances(p_org_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_org_id uuid;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    IF v_org_id IS NULL THEN
        SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
    END IF;

    UPDATE public.suppliers s
    SET balance = COALESCE(public.get_supplier_balance(s.id, v_org_id), 0)
    WHERE s.organization_id = v_org_id
      AND s.deleted_at IS NULL;
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.recalculate_supplier_balances(p_org_id uuid) TO anon, authenticated, service_role;

-- Function: run_daily_backups_all_orgs()
CREATE OR REPLACE FUNCTION public.run_daily_backups_all_orgs()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET statement_timeout TO '300s'
AS $function$
DECLARE
    v_org record;
    v_success_count int := 0;
BEGIN
    -- 1. أخذ نسخة لكل منظمة (مع دعم الشركات التي قيمة is_active لها null أو true)
    FOR v_org IN 
        SELECT id, name 
        FROM public.organizations 
        WHERE COALESCE(is_active, true) = true 
    LOOP
        BEGIN
            PERFORM public.create_organization_backup(
                v_org.id, 
                'نسخة احتياطية يومية آلية - ' || v_org.name || ' (' || to_char(now() AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD HH24:MI') || ')'
            );
            v_success_count := v_success_count + 1;
        EXCEPTION WHEN OTHERS THEN
            BEGIN
                INSERT INTO public.system_error_logs (error_message, context, function_name, organization_id)
                VALUES (SQLERRM, jsonb_build_object('org_id', v_org.id, 'step', 'auto_backup'), 'run_daily_backups_all_orgs', v_org.id);
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
        END;
    END LOOP;

    -- 2. تنظيف إضافي لضمان بقاء آخر نسختين فقط
    FOR v_org IN SELECT id FROM public.organizations LOOP
        PERFORM public.clean_old_organization_backups(v_org.id);
    END LOOP;

    -- 3. تنظيف الإشعارات المقروءة والقديمة
    BEGIN
        DELETE FROM public.notifications WHERE is_read = true;
        DELETE FROM public.notifications WHERE created_at < (now() - interval '2 days');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    RETURN 'Success: Processed ' || v_success_count || ' organizations.';
END; 
$function$
;
GRANT EXECUTE ON FUNCTION public.run_daily_backups_all_orgs() TO anon, authenticated, service_role;

-- Function: update_employee_advance(p_advance_id uuid, p_employee_id uuid, p_amount numeric, p_date date, p_treasury_id uuid, p_notes text)
CREATE OR REPLACE FUNCTION public.update_employee_advance(p_advance_id uuid, p_employee_id uuid, p_amount numeric, p_date date, p_treasury_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_org_id uuid;
    v_ref text;
    v_journal_id uuid;
    v_emp_name text;
    v_advances_acc_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    IF v_org_id IS NULL THEN
        -- Fallback إذا لم يتم جلب المنظمة من الـ JWT
        SELECT organization_id INTO v_org_id FROM public.employee_advances WHERE id = p_advance_id;
    END IF;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'تعذر تحديد المنظمة الحالية للسلفة.';
    END IF;

    -- 1. التأكد من وجود السلفة
    SELECT reference INTO v_ref
    FROM public.employee_advances
    WHERE id = p_advance_id
      AND (organization_id = v_org_id OR public.get_my_role() = 'super_admin');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'السلفة غير موجودة أو ليس لديك صلاحية تعديلها.';
    END IF;

    -- 2. تحديث سجل السلفة
    UPDATE public.employee_advances
    SET employee_id = p_employee_id,
        amount = p_amount,
        request_date = p_date,
        advance_date = p_date,
        treasury_account_id = p_treasury_id,
        notes = p_notes
    WHERE id = p_advance_id;

    -- 3. جلب اسم الموظف
    SELECT COALESCE(full_name, name, 'موظف') INTO v_emp_name
    FROM public.employees
    WHERE id = p_employee_id;

    -- 4. جلب حساب سلف الموظفين (1223)
    SELECT id INTO v_advances_acc_id
    FROM public.accounts
    WHERE organization_id = v_org_id
      AND (code = '1223' OR name LIKE '%سلف%')
    ORDER BY CASE WHEN code = '1223' THEN 1 ELSE 2 END
    LIMIT 1;

    -- 5. مزامنة القيد المحاسبي إن وجد مرجع
    IF v_ref IS NOT NULL AND v_ref <> '' THEN
        SELECT id INTO v_journal_id
        FROM public.journal_entries
        WHERE reference = v_ref
          AND (organization_id = v_org_id OR public.get_my_role() = 'super_admin')
        LIMIT 1;

        IF v_journal_id IS NOT NULL THEN
            -- فك الترحيل مؤقتاً لتخطي حماية أسطر القيود المرحّلة
            UPDATE public.journal_entries
            SET status = 'draft',
                is_posted = false,
                transaction_date = p_date,
                description = 'صرف سلفة للموظف ' || COALESCE(v_emp_name, '')
            WHERE id = v_journal_id;

            -- حذف الأسطر القديمة
            DELETE FROM public.journal_lines
            WHERE journal_entry_id = v_journal_id;

            -- إدراج الأسطر الجديدة
            IF v_advances_acc_id IS NOT NULL AND p_treasury_id IS NOT NULL THEN
                -- مدين: سلف العاملين
                INSERT INTO public.journal_lines (
                    journal_entry_id, account_id, debit, credit, description, organization_id
                ) VALUES (
                    v_journal_id, v_advances_acc_id, p_amount, 0, 'سلفة موظف - ' || COALESCE(v_emp_name, ''), v_org_id
                );

                -- دائن: الخزينة أو البنك
                INSERT INTO public.journal_lines (
                    journal_entry_id, account_id, debit, credit, description, organization_id
                ) VALUES (
                    v_journal_id, p_treasury_id, 0, p_amount, 'صرف نقدية لسلفة', v_org_id
                );
            END IF;

            -- إعادة ترحيل القيد
            UPDATE public.journal_entries
            SET status = 'posted',
                is_posted = true
            WHERE id = v_journal_id;
        END IF;
    END IF;

    RETURN true;
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.update_employee_advance(p_advance_id uuid, p_employee_id uuid, p_amount numeric, p_date date, p_treasury_id uuid, p_notes text) TO anon, authenticated, service_role;

-- 3. تعريف المشغلات التلقائية (Triggers)

-- Trigger: trg_prevent_rogue_warehouse_duplicates on warehouses
DROP TRIGGER IF EXISTS trg_prevent_rogue_warehouse_duplicates ON public.warehouses;
CREATE TRIGGER trg_prevent_rogue_warehouse_duplicates BEFORE INSERT ON public.warehouses FOR EACH ROW EXECUTE FUNCTION fn_prevent_rogue_warehouse_duplicates();

-- Trigger: trg_sync_receipt_voucher_dates on receipt_vouchers
DROP TRIGGER IF EXISTS trg_sync_receipt_voucher_dates ON public.receipt_vouchers;
CREATE TRIGGER trg_sync_receipt_voucher_dates BEFORE INSERT OR UPDATE ON public.receipt_vouchers FOR EACH ROW EXECUTE FUNCTION fn_sync_voucher_dates();

-- Trigger: trg_sync_receipt_voucher_journal on receipt_vouchers
DROP TRIGGER IF EXISTS trg_sync_receipt_voucher_journal ON public.receipt_vouchers;
CREATE TRIGGER trg_sync_receipt_voucher_journal AFTER DELETE OR UPDATE ON public.receipt_vouchers FOR EACH ROW EXECUTE FUNCTION fn_sync_receipt_voucher_journal();

-- Trigger: trg_prevent_duplicate_voucher_reference on journal_entries
DROP TRIGGER IF EXISTS trg_prevent_duplicate_voucher_reference ON public.journal_entries;
CREATE TRIGGER trg_prevent_duplicate_voucher_reference BEFORE INSERT OR UPDATE OF reference ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION fn_prevent_duplicate_voucher_reference();

-- Trigger: trg_sync_payment_voucher_dates on payment_vouchers
DROP TRIGGER IF EXISTS trg_sync_payment_voucher_dates ON public.payment_vouchers;
CREATE TRIGGER trg_sync_payment_voucher_dates BEFORE INSERT OR UPDATE ON public.payment_vouchers FOR EACH ROW EXECUTE FUNCTION fn_sync_voucher_dates();

-- Trigger: trg_sync_payment_voucher_journal on payment_vouchers
DROP TRIGGER IF EXISTS trg_sync_payment_voucher_journal ON public.payment_vouchers;
CREATE TRIGGER trg_sync_payment_voucher_journal AFTER DELETE OR UPDATE ON public.payment_vouchers FOR EACH ROW EXECUTE FUNCTION fn_sync_payment_voucher_journal();

COMMIT;
