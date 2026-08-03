-- 🧪 [Migration] [2026-08-03] إصلاح القيود غير المتزنة نتيجة فروقات التسويات السالبة في الفوترة الطبية وتصحيح توجيه تحصيل التأمين لبنك مصر
-- الغرض:
-- 1. تعديل دالة public.hims_finalize_billing لدعم فروقات التسويات السالبة (مثل إلغاء أو تخفيض تغطية التأمين، أو تقليل قيمة الخدمات الطبية)
--    بحيث يتم إثبات التسويات العكسية في الجانب المقابل (مدين/دائن) بدلاً من إهمالها، مما يمنع توليد قيود محاسبية غير متزنة.
-- 2. تصحيح القيد المحاسبي غير المتزن رقم HIMS-2cb2cc67 بإضافة سطر شركة التأمين الدائن بقيمة 10,000 ج.م.
-- 3. تصحيح قيد تحصيل المطالبة CLAIM-SETTLE-BATCH-1785756511783 بتغيير حساب التحصيل من الخزينة إلى بنك مصر (123202) بناءً على رغبة المستخدم.

-- 1. إسقاط الدالة القديمة لضمان إعادة البناء السليم
DROP FUNCTION IF EXISTS public.hims_finalize_billing(uuid, uuid);
DROP FUNCTION IF EXISTS public.hims_finalize_billing(uuid, uuid, numeric);

-- إعادة إنشاء الدالة المحسّنة لدعم التسويات السالبة بالكامل
CREATE OR REPLACE FUNCTION public.hims_finalize_billing(p_billing_id uuid, p_cash_acc uuid, p_custom_amount numeric DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_bill RECORD; v_je_id uuid; v_org_id uuid; v_mappings jsonb;
    v_rev_acc uuid; v_vat_acc uuid; v_cust_acc uuid;
    v_vat_rate numeric;
    v_cust_gl_acc_id uuid;
    v_insurance_receivable_acc uuid;
    
    -- حسابات الفروقات والمبالغ المتبقية للترحيل
    v_already_paid_cash numeric(15,2) := 0;
    v_already_posted_insurance numeric(15,2) := 0;
    v_already_posted_revenue numeric(15,2) := 0;
    v_already_posted_vat numeric(15,2) := 0;
    
    v_to_pay numeric(15,2) := 0; -- حصة المريض النقدية الحالية حسب الفاتورة
    v_insurance_to_post numeric(15,2) := 0; -- حصة التأمين الحالية
    v_revenue_to_post numeric(15,2) := 0; -- الإيرادات الحالية
    v_vat_to_post numeric(15,2) := 0; -- الضريبة الحالية
    
    v_cash_received numeric(15,2) := 0; -- المبلغ المقبوض فعلياً
    v_charge_patient numeric(15,2) := 0; -- مديونية المريض المضافة
BEGIN
    -- 1. جلب بيانات الفاتورة
    SELECT * INTO v_bill FROM public.hims_billing WHERE id = p_billing_id;
    IF NOT FOUND THEN RAISE EXCEPTION '⚠️ الفاتورة غير موجودة.'; END IF;

    -- 🛡️ تحديث إجماليات الفاتورة برمجياً قبل الترحيل المالي لضمان المزامنة وإلغاء أي تعارض
    PERFORM public.hims_prepare_invoice(v_bill.visit_id);

    -- إعادة جلب الفاتورة بقيمها المحدثة
    SELECT * INTO v_bill FROM public.hims_billing WHERE id = p_billing_id;

    v_org_id := v_bill.organization_id;
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    SELECT COALESCE(vat_rate, 0.14) INTO v_vat_rate FROM public.company_settings WHERE organization_id = v_org_id;

    -- 🏥 تحديد حساب الإيرادات وحساب الضريبة والعميل (الربط الصحيح مع إعدادات المنشأة)
    v_rev_acc := public.resolve_leaf_account(COALESCE(
        (v_mappings->>'HIMS_BILLING_REVENUE')::uuid, 
        (SELECT id FROM public.accounts WHERE code = '41101' AND organization_id = v_org_id LIMIT 1), 
        (SELECT id FROM public.accounts WHERE code = '4115' AND organization_id = v_org_id LIMIT 1), 
        (v_mappings->>'SALES_REVENUE')::uuid
    ));
    v_vat_acc := public.resolve_leaf_account(COALESCE(
        (v_mappings->>'VAT')::uuid, 
        (SELECT id FROM public.accounts WHERE code = '2231' AND organization_id = v_org_id LIMIT 1)
    ));
    
    -- جلب العميل (المرتبط بالملف الطبي للمريض)
    v_cust_acc := (SELECT customer_id FROM public.hims_patients WHERE id = v_bill.patient_id);

    -- جلب حساب العملاء العام (الذمم المدينة للمريض)
    v_cust_gl_acc_id := public.resolve_leaf_account(COALESCE(
        (v_mappings->>'CUSTOMERS')::uuid,
        (SELECT id FROM public.accounts WHERE code = '1221' AND organization_id = v_org_id LIMIT 1)
    ));

    -- جلب حساب ذمم شركات التأمين (كود 122101 المربوط بإعدادات المنشأة)
    v_insurance_receivable_acc := public.resolve_leaf_account(COALESCE(
        (v_mappings->>'HIMS_INSURANCE_RECEIVABLE')::uuid,
        (SELECT default_insurance_account FROM public.hims_settings WHERE organization_id = v_org_id LIMIT 1),
        (SELECT id FROM public.accounts WHERE code = '122101' AND organization_id = v_org_id LIMIT 1),
        v_cust_gl_acc_id
    ));

    -- 2. احتساب المبالغ التي تم ترحيلها مسبقاً في القيود السابقة المرتبطة بهذه الفاتورة
    SELECT COALESCE(SUM(jl.debit), 0) INTO v_already_paid_cash
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON je.id = jl.journal_entry_id
    JOIN public.accounts a ON a.id = jl.account_id
    WHERE je.related_document_id = p_billing_id AND je.status = 'posted'
      AND (a.code LIKE '123%' OR a.id = public.resolve_leaf_account(p_cash_acc));

    SELECT COALESCE(SUM(jl.debit), 0) INTO v_already_posted_insurance
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON je.id = jl.journal_entry_id
    JOIN public.accounts a ON a.id = jl.account_id
    WHERE je.related_document_id = p_billing_id AND je.status = 'posted'
      AND (a.code = '122101' OR a.id = v_insurance_receivable_acc);

    SELECT COALESCE(SUM(jl.credit), 0) INTO v_already_posted_revenue
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON je.id = jl.journal_entry_id
    JOIN public.accounts a ON a.id = jl.account_id
    WHERE je.related_document_id = p_billing_id AND je.status = 'posted'
      AND (a.code LIKE '4%' OR a.id = v_rev_acc);

    SELECT COALESCE(SUM(jl.credit), 0) INTO v_already_posted_vat
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON je.id = jl.journal_entry_id
    JOIN public.accounts a ON a.id = jl.account_id
    WHERE je.related_document_id = p_billing_id AND je.status = 'posted'
      AND (a.code = '2231' OR a.id = v_vat_acc);

    -- 3. حساب الفروقات المتبقية المطلوب ترحيلها الآن
    v_to_pay := (v_bill.total_amount - COALESCE(v_bill.insurance_covered_amount, 0)) - v_already_paid_cash;
    v_insurance_to_post := COALESCE(v_bill.insurance_covered_amount, 0) - v_already_posted_insurance;
    v_revenue_to_post := (v_bill.total_amount - v_bill.tax_amount) - v_already_posted_revenue;
    v_vat_to_post := v_bill.tax_amount - v_already_posted_vat;

    -- تحديد المقبوض الفعلي ومستحق التحميل على ذمم العميل
    -- إذا كان p_custom_amount ممرراً نستخدمه، وإلا نستخدم المقبوض المتبقي (شريطة ألا يكون سالباً)
    v_cash_received := COALESCE(p_custom_amount, CASE WHEN v_to_pay > 0 THEN v_to_pay ELSE 0 END);
    -- معادلة التوازن المحاسبي الذهبية: ذمم العميل = صافي التغير في الإيرادات والضريبة مطروحاً منه تغير التأمين
    v_charge_patient := v_revenue_to_post + v_vat_to_post - v_insurance_to_post;

    -- التحقق من وجود تغيرات فعلية تستحق الترحيل لتجنب القيود الفارغة
    IF ABS(v_cash_received) < 0.01 AND ABS(v_charge_patient) < 0.01 AND ABS(v_insurance_to_post) < 0.01 AND ABS(v_revenue_to_post) < 0.01 AND ABS(v_vat_to_post) < 0.01 THEN
        RAISE EXCEPTION '⚠️ هذه الفاتورة مدفوعة ومرحلة بالكامل مسبقاً بالتأمين والنقدية. لا توجد فروقات سداد جديدة.';
    END IF;

    -- 4. إنشاء قيد اليومية
    INSERT INTO public.journal_entries (
        organization_id, transaction_date, description, reference, status, is_posted, related_document_id, related_document_type
    )
    VALUES (
        v_org_id,
        CURRENT_DATE, 
        'تسوية وفاتورة علاج مريض - زيارة رقم ' || v_bill.visit_id, 
        'HIMS-' || substring(v_bill.id::text, 1, 8), 
        'posted', 
        true, 
        p_billing_id, 
        'hims_billing'
    )
    RETURNING id INTO v_je_id;

    -- أ. سطر مديونية المريض بالفاتورة (تحميل المريض بالذمم المدينة)
    IF v_charge_patient > 0.01 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
        VALUES (v_je_id, v_cust_gl_acc_id, v_charge_patient, 0, v_org_id, 'تحميل المريض - فاتورة علاج HIMS');
    ELSIF v_charge_patient < -0.01 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
        VALUES (v_je_id, v_cust_gl_acc_id, 0, ABS(v_charge_patient), v_org_id, 'تعديل/تخفيض حساب المريض - HIMS');
    END IF;

    -- ب. سطر سداد المريض النقدي بالخزينة (إن دفع مبلغاً أو استرد)
    IF v_cash_received > 0.01 THEN
        -- دائن: حساب العملاء (إثبات سداد المريض)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
        VALUES (v_je_id, v_cust_gl_acc_id, 0, v_cash_received, v_org_id, 'سداد نقدي مريض - HIMS');

        -- مدين: حساب النقدية بالخزينة (تحصيل الصندوق)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
        VALUES (v_je_id, public.resolve_leaf_account(p_cash_acc), v_cash_received, 0, v_org_id, 'تحصيل نقدي من مريض - HIMS');
    ELSIF v_cash_received < -0.01 THEN
        -- مدين: حساب العملاء (إرجاع سداد المريض)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
        VALUES (v_je_id, v_cust_gl_acc_id, ABS(v_cash_received), 0, v_org_id, 'إرجاع سداد مريض - HIMS');

        -- دائن: حساب النقدية بالخزينة (صرف الصندوق لمرتجع المريض)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
        VALUES (v_je_id, public.resolve_leaf_account(p_cash_acc), 0, ABS(v_cash_received), v_org_id, 'صرف نقدي مرتجع لمريض - HIMS');
    END IF;

    -- ج. سطر مديونية شركة التأمين للمبلغ المتبقي (إن وجد)
    IF v_insurance_to_post > 0.01 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
        VALUES (v_je_id, v_insurance_receivable_acc, v_insurance_to_post, 0, v_org_id, 'مستحق من شركة التأمين - HIMS');
    ELSIF v_insurance_to_post < -0.01 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
        VALUES (v_je_id, v_insurance_receivable_acc, 0, ABS(v_insurance_to_post), v_org_id, 'تخفيض مستحق شركة التأمين - HIMS');
    END IF;

    -- د. سطر إيرادات الخدمات الطبية للمبلغ المتبقي (إن وجد)
    IF v_revenue_to_post > 0.01 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
        VALUES (v_je_id, v_rev_acc, 0, v_revenue_to_post, v_org_id, 'إيرادات طبية صافية - HIMS');
    ELSIF v_revenue_to_post < -0.01 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
        VALUES (v_je_id, v_rev_acc, ABS(v_revenue_to_post), 0, v_org_id, 'تعديل/تخفيض إيرادات طبية - HIMS');
    END IF;

    -- هـ. سطر ضريبة القيمة المضافة للمبلغ المتبقي (إن وجد)
    IF v_vat_to_post > 0.01 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
        VALUES (v_je_id, v_vat_acc, 0, v_vat_to_post, v_org_id, 'ضريبة مخرجات - HIMS');
    ELSIF v_vat_to_post < -0.01 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
        VALUES (v_je_id, v_vat_acc, ABS(v_vat_to_post), 0, v_org_id, 'تعديل/تخفيض ضريبة مخرجات - HIMS');
    END IF;

    -- 5. تحديث رأس الفاتورة في قاعدة البيانات
    UPDATE public.hims_billing 
    SET related_journal_entry_id = v_je_id, 
        payment_status = 'paid', 
        patient_paid_amount = COALESCE(patient_paid_amount, 0) + v_cash_received
    WHERE id = p_billing_id;

END; $$;


-- ==========================================
-- 2. سكريبت تصحيح القيد غير المتزن رقم HIMS-2cb2cc67
-- ==========================================
DO $$
DECLARE
    v_je_id uuid;
    v_org_id uuid;
    v_ins_acc_id uuid;
BEGIN
    SELECT id, organization_id INTO v_je_id, v_org_id
    FROM public.journal_entries 
    WHERE reference = 'HIMS-2cb2cc67'
      AND description LIKE '%زيارة رقم 60a7877d-187c-4079-8e25-cc0a9da6893e%'
      AND (
          SELECT COUNT(*) 
          FROM public.journal_lines 
          WHERE journal_entry_id = journal_entries.id
      ) = 5 -- القيد غير المتزن يحتوي على 5 سطور فقط حالياً
    LIMIT 1;

    IF v_je_id IS NOT NULL THEN
        -- جلب حساب ذمم شركات التأمين (كود 122101)
        SELECT id INTO v_ins_acc_id 
        FROM public.accounts 
        WHERE code = '122101' 
          AND organization_id = v_org_id 
        LIMIT 1;

        IF v_ins_acc_id IS NOT NULL THEN
            -- التحقق من عدم وجود السطر مسبقاً تجنباً للتكرار
            IF NOT EXISTS (
                SELECT 1 FROM public.journal_lines 
                WHERE journal_entry_id = v_je_id 
                  AND account_id = v_ins_acc_id
            ) THEN
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
                VALUES (v_je_id, v_ins_acc_id, 0, 10000.00, v_org_id, 'تخفيض مستحق شركة التأمين - HIMS (تصحيح تلقائي لعدم التوازن)');
            END IF;
        END IF;
    END IF;
END $$;


-- ==========================================
-- 3. سكريبت تصحيح حركة بنك مصر الناقصة لحركة تحصيل التأمين
-- ==========================================
DO $$
DECLARE
    v_je_id uuid;
    v_org_id uuid;
    v_bank_acc_id uuid;
BEGIN
    SELECT id, organization_id INTO v_je_id, v_org_id
    FROM public.journal_entries
    WHERE reference = 'CLAIM-SETTLE-BATCH-1785756511783'
    LIMIT 1;

    IF v_je_id IS NOT NULL THEN
        -- جلب حساب بنك مصر (123202)
        SELECT id INTO v_bank_acc_id
        FROM public.accounts
        WHERE code = '123202'
          AND organization_id = v_org_id
        LIMIT 1;

        IF v_bank_acc_id IS NOT NULL THEN
            -- تعديل حساب الطرف المدين (الذي كان موجهاً للخزينة 1231) ليوجه للبنك مباشرة
            UPDATE public.journal_lines
            SET account_id = v_bank_acc_id
            WHERE journal_entry_id = v_je_id
              AND debit > 0;
        END IF;
    END IF;
END $$;
