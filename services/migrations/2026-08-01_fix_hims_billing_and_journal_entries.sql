-- Migration: Fix HIMS Finalize Billing GL Integration & Patient/Insurance Journal Entries Mapping & Stock Recalculation
-- Date: 2026-08-01
-- Description: Drop old hims_finalize_billing signatures, deploy corrected hims_prepare_invoice and hims_finalize_billing, ensuring billing items have product_id/warehouse_id when dispensed, and add related_journal_entry_id to hims_insurance_claims.

-- 1. ALTER TABLE to add related_journal_entry_id to hims_insurance_claims
ALTER TABLE public.hims_insurance_claims ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL;

-- 2. DROP old function versions if they exist
DROP FUNCTION IF EXISTS public.hims_finalize_billing(uuid, uuid);
DROP FUNCTION IF EXISTS public.hims_finalize_billing(uuid, uuid, numeric);

-- 3. CREATE corrected public.hims_prepare_invoice function
CREATE OR REPLACE FUNCTION public.hims_prepare_invoice(p_visit_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_patient_id uuid; v_doc_fee numeric := 0; v_med_cost numeric := 0;
    v_lab_cost numeric := 0; v_rad_cost numeric := 0; v_stay_cost numeric := 0;
    v_blood_cost numeric := 0; v_surgery_cost numeric := 0; v_subtotal numeric := 0; v_tax numeric := 0; 
    v_vat_rate numeric; v_total numeric := 0; v_bill_id uuid; v_org_id uuid;
BEGIN
    -- 1. التحقق وجلب المنظمة وبيانات المريض
    SELECT organization_id, patient_id INTO v_org_id, v_patient_id FROM public.hims_visits WHERE id = p_visit_id;
    SELECT COALESCE(vat_rate, 0.14) INTO v_vat_rate FROM public.company_settings WHERE organization_id = v_org_id;
    
    -- 2. رسوم الطبيب (سعر الكشف المخصص للطبيب)
    SELECT COALESCE(consultation_fee, 0) INTO v_doc_fee FROM public.hims_doctors 
    WHERE id = (SELECT doctor_id FROM public.hims_visits WHERE id = p_visit_id);

    -- 3. تكلفة الأدوية الموصوفة (سواء كانت pending بانتظار الصرف أو dispensed تم صرفها بالفعل للدعم المسبق)
    SELECT COALESCE(SUM((m->>'qty')::numeric * p.sales_price), 0) INTO v_med_cost
    FROM public.hims_prescriptions pr, jsonb_array_elements(pr.medications) AS m
    JOIN public.products p ON p.id = (m->>'product_id')::uuid
    WHERE pr.visit_id = p_visit_id;

    -- 4. تكلفة تحاليل المختبر (جميع التحاليل الموصوفة بانتظار الدفع المسبق بالخزينة)
    SELECT COALESCE(SUM(t.price), 0) INTO v_lab_cost
    FROM public.hims_lab_orders o
    JOIN public.hims_lab_tests t ON t.id = o.test_id
    WHERE o.visit_id = p_visit_id;

    -- 5. تكلفة الأشعة والفحوصات التصويرية (تأصيل ودعم سعر الأشعة الموصوفة)
    SELECT COALESCE(SUM(o.price), 0) INTO v_rad_cost
    FROM public.hims_radiology_orders o
    WHERE o.visit_id = p_visit_id;

    -- 6. تكلفة الإقامة بالغرف والأسرة
    v_stay_cost := public.hims_calculate_stay_cost(p_visit_id);

    -- 7. تكلفة نقل الدم
    SELECT COALESCE(COUNT(id) * 150, 0) INTO v_blood_cost 
    FROM public.hims_blood_transfusions 
    WHERE visit_id = p_visit_id;

    -- 7.5. تكلفة العمليات الجراحية المكتملة المرفقة بالفاتورة
    SELECT COALESCE(SUM(bi.total_price), 0) INTO v_surgery_cost
    FROM public.hims_billing_items bi
    JOIN public.hims_billing b ON b.id = bi.billing_id
    WHERE b.visit_id = p_visit_id AND bi.item_type = 'surgery';

    -- 8. حساب الإجماليات والضرائب
    v_subtotal := COALESCE(v_doc_fee, 0) + COALESCE(v_med_cost, 0) + COALESCE(v_lab_cost, 0) + COALESCE(v_rad_cost, 0) + COALESCE(v_stay_cost, 0) + v_blood_cost + v_surgery_cost;
    v_tax := v_subtotal * v_vat_rate;
    v_total := v_subtotal + v_tax;

    -- 9. تحديث أو إدراج الفاتورة في جدول المحاسبة الطبية
    INSERT INTO public.hims_billing (
        visit_id, patient_id, total_amount, tax_amount, patient_paid_amount, payment_status, organization_id
    )
    VALUES (
        p_visit_id, v_patient_id, v_total, v_tax, 0, 'unpaid', v_org_id
    )
    ON CONFLICT (visit_id) DO UPDATE SET 
        total_amount = EXCLUDED.total_amount,
        tax_amount = EXCLUDED.tax_amount,
        payment_status = CASE 
            WHEN (EXCLUDED.total_amount - COALESCE(public.hims_billing.insurance_covered_amount, 0) - COALESCE(public.hims_billing.patient_paid_amount, 0)) <= 0.01 THEN 'paid'
            ELSE 'unpaid'
        END
    RETURNING id INTO v_bill_id;

    -- 10. تفكيك وبناء تفاصيل بنود الفاتورة للشفافية المطلقة (Billing Items Breakdown)
    DELETE FROM public.hims_billing_items WHERE billing_id = v_bill_id AND item_type != 'surgery';
    
    -- أ. بند الكشف الطبي
    IF v_doc_fee > 0 THEN
        INSERT INTO public.hims_billing_items (billing_id, item_type, description, quantity, unit_price, organization_id)
        VALUES (v_bill_id, 'consultation', 'كشف عيادة خارجية', 1, v_doc_fee, v_org_id);
    END IF;
    
    -- ب. بنود الأدوية (يتوافق نوع البند مع 'pharmacy' في قيد التحقق ويحتوي على معطيات المستودع والوحدة فقط عند الصرف الفعلي)
    INSERT INTO public.hims_billing_items (
        billing_id, item_type, description, quantity, unit_price, organization_id, product_id, warehouse_id, uom_id
    )
    SELECT 
        v_bill_id, 
        'pharmacy', 
        p.name, 
        (m->>'qty')::numeric, 
        p.sales_price, 
        v_org_id,
        CASE WHEN pr.status = 'dispensed' THEN p.id ELSE NULL END,
        CASE WHEN pr.status = 'dispensed' THEN COALESCE(
            (SELECT default_pharmacy_warehouse FROM public.hims_settings WHERE organization_id = v_org_id),
            (SELECT id FROM public.warehouses WHERE organization_id = v_org_id AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1)
        ) ELSE NULL END,
        CASE WHEN pr.status = 'dispensed' THEN p.base_uom_id ELSE NULL END
    FROM public.hims_prescriptions pr, jsonb_array_elements(pr.medications) AS m
    JOIN public.products p ON p.id = (m->>'product_id')::uuid
    WHERE pr.visit_id = p_visit_id;

    -- ج. بنود تحاليل المختبر
    INSERT INTO public.hims_billing_items (billing_id, item_type, description, quantity, unit_price, organization_id)
    SELECT v_bill_id, 'lab', t.test_name, 1, t.price, v_org_id
    FROM public.hims_lab_orders o
    JOIN public.hims_lab_tests t ON t.id = o.test_id
    WHERE o.visit_id = p_visit_id;

    -- د. بنود الفحوصات الشعاعية
    INSERT INTO public.hims_billing_items (billing_id, item_type, description, quantity, unit_price, organization_id)
    SELECT v_bill_id, 'radiology', o.scan_type, 1, o.price, v_org_id
    FROM public.hims_radiology_orders o
    WHERE o.visit_id = p_visit_id;

    -- هـ. بند الإقامة بالقسم الداخلي
    IF v_stay_cost > 0 THEN
        INSERT INTO public.hims_billing_items (billing_id, item_type, description, quantity, unit_price, organization_id)
        VALUES (v_bill_id, 'accommodation', 'إقامة بالقسم الداخلي والأجنحة', 1, v_stay_cost, v_org_id);
    END IF;

    -- و. بنود نقل الدم
    IF v_blood_cost > 0 THEN
        INSERT INTO public.hims_billing_items (billing_id, item_type, description, quantity, unit_price, organization_id)
        VALUES (v_bill_id, 'other', 'خدمة نقل دم - بنك الدم', (v_blood_cost/150)::int, 150, v_org_id);
    END IF;

    RETURN v_bill_id;
END; $$;

-- 4. CREATE updated hims_finalize_billing function (accepting 3 parameters for frontend compatibility)
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
    
    v_to_pay numeric(15,2) := 0; -- حصة المريض النقدية الحالية
    v_insurance_to_post numeric(15,2) := 0; -- حصة التأمين الحالية
    v_revenue_to_post numeric(15,2) := 0; -- الإيرادات الحالية
    v_vat_to_post numeric(15,2) := 0; -- الضريبة الحالية
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

    -- 2. احتساب المبالغ التي تم ترحيلها مسبقاً في القيود السابقة المرتبطة بهذه الفاتورة (باستخدام أكواد الحسابات العامة لضمان المرونة)
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

    -- إذا كانت كل الفروقات صفر أو سالبة، نمنع تنفيذ القيد تلافياً للتكرار
    IF ABS(v_to_pay) < 0.01 AND ABS(v_insurance_to_post) < 0.01 AND ABS(v_revenue_to_post) < 0.01 AND ABS(v_vat_to_post) < 0.01 THEN
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

    -- أ. سطر مديونية وسداد المريض لحصة الكاش المتبقية (إن وجدت)
    IF v_to_pay > 0.01 THEN
        -- مدين: حساب العملاء (مديونية المريض)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
        VALUES (v_je_id, v_cust_gl_acc_id, v_to_pay, 0, v_org_id, 'تحميل المريض - فاتورة علاج HIMS');

        -- دائن: حساب العملاء (سداد المريض)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
        VALUES (v_je_id, v_cust_gl_acc_id, 0, v_to_pay, v_org_id, 'سداد نقدي مريض - HIMS');

        -- مدين: حساب النقدية بالخزينة (تحصيل الصندوق)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
        VALUES (v_je_id, public.resolve_leaf_account(p_cash_acc), v_to_pay, 0, v_org_id, 'تحصيل نقدي من مريض - HIMS');
    END IF;

    -- ب. سطر مديونية شركة التأمين للمبلغ المتبقي (إن وجد)
    IF v_insurance_to_post > 0.01 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
        VALUES (v_je_id, v_insurance_receivable_acc, v_insurance_to_post, 0, v_org_id, 'مستحق من شركة التأمين - HIMS');
    END IF;

    -- ج. سطر إيرادات الخدمات الطبية للمبلغ المتبقي (إن وجد)
    IF v_revenue_to_post > 0.01 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
        VALUES (v_je_id, v_rev_acc, 0, v_revenue_to_post, v_org_id, 'إيرادات طبية صافية - HIMS');
    END IF;

    -- د. سطر ضريبة القيمة المضافة للمبلغ المتبقي (إن وجد)
    IF v_vat_to_post > 0.01 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
        VALUES (v_je_id, v_vat_acc, 0, v_vat_to_post, v_org_id, 'ضريبة مخرجات - HIMS');
    END IF;

    -- 5. تحديث رأس الفاتورة في قاعدة البيانات
    UPDATE public.hims_billing 
    SET related_journal_entry_id = v_je_id, 
        payment_status = 'paid', 
        patient_paid_amount = COALESCE(patient_paid_amount, 0) + GREATEST(0, v_to_pay)
    WHERE id = p_billing_id;

END; $$;

-- 5. CREATE OR REPLACE public.hims_settle_insurance_claim function with related_journal_entry_id updates
CREATE OR REPLACE FUNCTION public.hims_settle_insurance_claim(
    p_claim_id uuid,
    p_received_amount numeric,
    p_bank_acc_id uuid
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_claim RECORD;
    v_je_id uuid;
    v_org_id uuid;
    v_insurance_receivable_acc uuid;
    v_description text;
    v_uncollected_amount numeric;
    v_loss_acc_id uuid;
BEGIN
    SELECT * INTO v_claim FROM public.hims_insurance_claims WHERE id = p_claim_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION '⚠️ المطالبة التأمينية غير موجودة.';
    END IF;

    v_org_id := v_claim.organization_id;
    
    -- جلب حساب "خسائر مطالبات التأمين" (كود 5121 أو ما شابه)
    v_loss_acc_id := public.resolve_leaf_account(COALESCE(
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '5121' LIMIT 1),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND type = 'expense' ORDER BY code DESC LIMIT 1)
    ));

    -- جلب حساب ذمم التأمين
    SELECT default_insurance_account INTO v_insurance_receivable_acc FROM public.hims_settings WHERE organization_id = v_org_id;
    IF v_insurance_receivable_acc IS NULL THEN
        SELECT id INTO v_insurance_receivable_acc FROM public.accounts WHERE code = '122101' AND organization_id = v_org_id LIMIT 1;
        IF v_insurance_receivable_acc IS NULL THEN
            RAISE EXCEPTION '⚠️ لم يتم تحديد حساب ذمم التأمين في إعدادات HIMS أو في دليل الحسابات.';
        END IF;
    END IF;

    v_insurance_receivable_acc := public.resolve_leaf_account(v_insurance_receivable_acc);
    p_bank_acc_id := public.resolve_leaf_account(p_bank_acc_id);

    -- 1. إنشاء قيد اليومية لتحصيل المبلغ
    v_description := format('تحصيل مطالبة تأمين رقم %s من شركة التأمين %s', v_claim.batch_reference, (SELECT name FROM public.customers WHERE id = v_claim.insurance_provider_id));
    
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type)
    VALUES (CURRENT_DATE, v_description, 'CLAIM-SETTLE-' || substring(v_claim.batch_reference, 7), 'posted', v_org_id, true, p_claim_id, 'hims_insurance_claims')
    RETURNING id INTO v_je_id;

    -- Calculate any uncollected amount
    v_uncollected_amount := ROUND(COALESCE(v_claim.total_claim_amount, 0) - p_received_amount, 2);

    -- إقفال مبلغ الرفض كخسارة
    IF v_uncollected_amount >= 0.01 THEN 
        UPDATE public.hims_insurance_claims
        SET rejected_amount = COALESCE(rejected_amount, 0) + v_uncollected_amount,
            rejection_notes = COALESCE(rejection_notes, '') || format(' (تم إقفال مبلغ مرفوض: %s)', v_uncollected_amount)
        WHERE id = p_claim_id;

        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
        VALUES (v_je_id, v_loss_acc_id, v_uncollected_amount, 0, v_org_id, 'خسائر ناتجة عن رفض مطالبة تأمين');
        
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
        VALUES (v_je_id, v_insurance_receivable_acc, 0, v_uncollected_amount, v_org_id, 'تصفير ذمم المبلغ المرفوض');
    END IF;

    -- قيد البنك
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
    VALUES (v_je_id, p_bank_acc_id, ROUND(p_received_amount, 2), 0, v_org_id, 'تحصيل مبلغ المطالبة التأمينية');

    -- قيد ذمم التأمين
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
    VALUES (v_je_id, v_insurance_receivable_acc, 0, ROUND(p_received_amount, 2), v_org_id, 'تخفيض ذمم التأمين');

    -- 2. تحديث حالة المطالبة وتسجيل القيد
    UPDATE public.hims_insurance_claims
    SET status = CASE WHEN p_received_amount >= v_claim.total_claim_amount THEN 'paid' ELSE 'partially_paid' END,
        payment_date = CURRENT_DATE,
        total_collected_amount = COALESCE(total_collected_amount, 0) + p_received_amount,
        related_journal_entry_id = v_je_id
    WHERE id = p_claim_id;

    -- 3. تحديث الفواتير المرتبطة
    UPDATE public.hims_billing
    SET payment_status = 'paid_by_insurance'
    WHERE insurance_claim_id = p_claim_id;

    -- 4. إرسال إخطار للمحاسب
    PERFORM public.create_notification_from_sql(
        p_org_id     => v_org_id::uuid, 
        p_user_id    => (SELECT id FROM public.profiles WHERE organization_id = v_org_id AND role = 'accountant' LIMIT 1),
        p_title      => 'تم تحصيل مطالبة تأمين ✅'::text, 
        p_message    => format('تم تحصيل مبلغ %s من مطالبة التأمين رقم %s.', p_received_amount, v_claim.batch_reference)::text,
        p_type       => 'success'::public.notification_type, 
        p_priority   => 'medium'::public.notification_priority, 
        p_action_url => '/hims/insurance-claims'::text,
        p_related_id => p_claim_id
    );

END; $$;
