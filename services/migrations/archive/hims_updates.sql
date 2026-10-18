-- 🏥 ترقية محرك الفوترة والتحصيل المالي والدفع المسبق (HIMS Billing Upgrades)
-- يرجى تنفيذ هذا الكود في محرر SQL بـ Supabase (Supabase SQL Editor) لتثبيته في قاعدة البيانات.

-- =========================================================================
-- 1. دالة إصدار الفاتورة اللحظية المحدثة (hims_prepare_invoice)
-- =========================================================================
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
    -- نقوم بالحفاظ على القيمة المدفوعة سابقاً (patient_paid_amount) لمنع تصفيرها أو تكرارها
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
    -- نقوم بحذف البنود غير الجراحية فقط للحفاظ على العمليات التي تم إغلاقها وصرف مستلزماتها
    DELETE FROM public.hims_billing_items WHERE billing_id = v_bill_id AND item_type != 'surgery';
    
    -- أ. بند الكشف الطبي
    IF v_doc_fee > 0 THEN
        INSERT INTO public.hims_billing_items (billing_id, item_type, description, quantity, unit_price, organization_id)
        VALUES (v_bill_id, 'consultation', 'كشف عيادة خارجية', 1, v_doc_fee, v_org_id);
    END IF;
    
    -- ب. بنود الأدوية (يتوافق نوع البند مع 'pharmacy' في قيد التحقق)
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

    -- هـ. بند الإقامة بالقسم الداخلي (يتوافق نوع البند مع 'accommodation' في قيد التحقق)
    IF v_stay_cost > 0 THEN
        INSERT INTO public.hims_billing_items (billing_id, item_type, description, quantity, unit_price, organization_id)
        VALUES (v_bill_id, 'accommodation', 'إقامة بالقسم الداخلي والأجنحة', 1, v_stay_cost, v_org_id);
    END IF;

    -- و. بنود نقل الدم (تصنيف 'other' أو 'accommodation' حسب المناسب)
    IF v_blood_cost > 0 THEN
        INSERT INTO public.hims_billing_items (billing_id, item_type, description, quantity, unit_price, organization_id)
        VALUES (v_bill_id, 'other', 'خدمة نقل دم - بنك الدم', (v_blood_cost/150)::int, 150, v_org_id);
    END IF;

    RETURN v_bill_id;
END; $$;


-- =========================================================================
-- 2. دالة تحصيل واعتماد الفاتورة المحاسبية المحدثة (hims_finalize_billing)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.hims_finalize_billing(p_billing_id uuid, p_cash_acc uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_bill RECORD; v_je_id uuid; v_org_id uuid; v_mappings jsonb;
    v_rev_acc uuid; v_vat_acc uuid; v_cust_acc uuid;
    v_to_pay numeric(15,2) := 0; v_vat_rate numeric;
    v_tax_to_pay numeric(15,2) := 0; v_rev_to_pay numeric(15,2) := 0;
BEGIN
    -- 1. جلب بيانات الفاتورة
    SELECT * INTO v_bill FROM public.hims_billing WHERE id = p_billing_id;
    IF NOT FOUND THEN RAISE EXCEPTION '⚠️ الفاتورة غير موجودة.'; END IF;

    v_org_id := v_bill.organization_id;
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    SELECT COALESCE(vat_rate, 0.14) INTO v_vat_rate FROM public.company_settings WHERE organization_id = v_org_id;

    -- 🏥 تحديد حساب الإيرادات وحساب الضريبة والعميل
    v_rev_acc := public.resolve_leaf_account(COALESCE(
        (v_mappings->>'HIMS_REVENUE')::uuid, 
        (SELECT id FROM public.accounts WHERE code = '4115' AND organization_id = v_org_id LIMIT 1), 
        (v_mappings->>'SALES_REVENUE')::uuid
    ));
    v_vat_acc := public.resolve_leaf_account(COALESCE(
        (v_mappings->>'VAT')::uuid, 
        (SELECT id FROM public.accounts WHERE code = '2231' AND organization_id = v_org_id LIMIT 1)
    ));
    v_cust_acc := (SELECT customer_id FROM public.hims_patients WHERE id = v_bill.patient_id);

    -- 2. حساب القيمة المتبقية المطلوب دفعها حالياً من قبل المريض
    v_to_pay := v_bill.total_amount - COALESCE(v_bill.insurance_covered_amount, 0) - COALESCE(v_bill.patient_paid_amount, 0);

    -- إذا كانت الفاتورة مرحلة لأول مرة (related_journal_entry_id IS NULL)
    IF v_bill.related_journal_entry_id IS NULL THEN
        -- 🛡️ التحقق من ذمم التأمين إذا وجد مبلغ مغطى
        DECLARE
            v_insurance_receivable_acc uuid;
        BEGIN
            IF COALESCE(v_bill.insurance_covered_amount, 0) > 0 THEN
                SELECT default_insurance_account INTO v_insurance_receivable_acc FROM public.hims_settings WHERE organization_id = v_org_id;
                IF v_insurance_receivable_acc IS NULL THEN
                    SELECT id INTO v_insurance_receivable_acc FROM public.accounts WHERE code = '122101' AND organization_id = v_org_id LIMIT 1;
                    IF v_insurance_receivable_acc IS NULL THEN
                        RAISE EXCEPTION '⚠️ لم يتم تحديد حساب ذمم التأمين في إعدادات HIMS أو في دليل الحسابات.';
                    END IF;
                END IF;
                v_insurance_receivable_acc := public.resolve_leaf_account(v_insurance_receivable_acc);
            END IF;

            -- إنشاء القيد المحاسبي الأساسي للفاتورة (الإيرادات والضرائب بالكامل)
            INSERT INTO public.journal_entries (
                transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type
            )
            VALUES (
                CURRENT_DATE, 
                'فاتورة علاج مريض - زيارة رقم ' || v_bill.visit_id, 
                'HIMS-' || substring(v_bill.id::text, 1, 8), 
                'posted', 
                v_org_id, 
                true, 
                p_billing_id, 
                'hims_billing'
            )
            RETURNING id INTO v_je_id;

            -- أ. من ح/ النقدية (الجزء المدفوع كاش من المريض حالياً إن وجد)
            IF v_to_pay > 0.01 THEN
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
                VALUES (v_je_id, public.resolve_leaf_account(p_cash_acc), v_to_pay, 0, v_org_id, 'تحصيل نقدي من مريض - HIMS');
            END IF;

            -- ب. من ح/ ذمم شركات التأمين (الجزء المغطى تأمينياً إن وجد)
            IF COALESCE(v_bill.insurance_covered_amount, 0) > 0 THEN
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
                VALUES (v_je_id, v_insurance_receivable_acc, COALESCE(v_bill.insurance_covered_amount, 0), 0, v_org_id, 'مستحق من شركة التأمين - HIMS');
            END IF;

            -- ج. إلى ح/ إيرادات الخدمات الطبية (الصافي الإجمالي للفاتورة)
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
            VALUES (v_je_id, v_rev_acc, 0, (v_bill.total_amount - v_bill.tax_amount), v_org_id, 'إيرادات طبية صافية - HIMS');

            -- د. إلى ح/ ضريبة القيمة المضافة (إجمالي الضريبة للفاتورة)
            IF v_bill.tax_amount > 0 THEN
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
                VALUES (v_je_id, v_vat_acc, 0, v_bill.tax_amount, v_org_id, 'ضريبة مخرجات - HIMS');
            END IF;

            -- تحديث رأس الفاتورة
            UPDATE public.hims_billing 
            SET related_journal_entry_id = v_je_id, 
                payment_status = 'paid', 
                patient_paid_amount = COALESCE(patient_paid_amount, 0) + GREATEST(0, v_to_pay)
            WHERE id = p_billing_id;
        END;

    -- إذا كانت الفاتورة قد تم ترحيلها مسبقاً بالفعل ويوجد دفعات/خدمات إضافية جديدة
    ELSE
        -- 🛡️ حماية التكرار: إذا كان المتبقي 0 أو سالب، نمنع تنفيذ القيد
        IF v_to_pay <= 0.01 THEN
            RAISE EXCEPTION '⚠️ هذه الفاتورة مدفوعة ومرحلة بالكامل مسبقاً (قيد رقم: %). لا توجد فروقات سداد جديدة.',
                COALESCE(v_bill.related_journal_entry_id::text, 'HIMS-' || substring(v_bill.id::text, 1, 8));
        END IF;

        -- حساب تفريعة القيد الجديد للدفعة الإضافية
        v_tax_to_pay := v_to_pay - (v_to_pay / (1 + v_vat_rate));
        v_rev_to_pay := v_to_pay - v_tax_to_pay;

        -- إنشاء قيد اليومية لدفعة التحصيل الإضافية
        INSERT INTO public.journal_entries (
            transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type
        )
        VALUES (
            CURRENT_DATE, 
            'دفعة تحصيل إضافية مريض - زيارة رقم ' || v_bill.visit_id, 
            'HIMS-ADJ-' || substring(v_bill.id::text, 1, 8), 
            'posted', 
            v_org_id, 
            true, 
            p_billing_id, 
            'hims_billing'
        )
        RETURNING id INTO v_je_id;

        -- من ح/ النقدية بالصندوق (القيمة المسددة الآن)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
        VALUES (v_je_id, public.resolve_leaf_account(p_cash_acc), v_to_pay, 0, v_org_id, 'تحصيل نقدي إضافي من مريض - HIMS');

        -- إلى ح/ إيرادات الخدمات الطبية (صافي القيمة الحالية)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
        VALUES (v_je_id, v_rev_acc, 0, v_rev_to_pay, v_org_id, 'إيرادات طبية صافية إضافية - HIMS');

        -- إلى ح/ ضريبة القيمة المضافة (قيمة الضريبة الحالية)
        IF v_tax_to_pay > 0 THEN
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
            VALUES (v_je_id, v_vat_acc, 0, v_tax_to_pay, v_org_id, 'ضريبة مخرجات إضافية - HIMS');
        END IF;

        -- تحديث الفاتورة: زيادة المدفوع الإجمالي
        UPDATE public.hims_billing 
        SET payment_status = 'paid', 
            patient_paid_amount = COALESCE(patient_paid_amount, 0) + v_to_pay
        WHERE id = p_billing_id;
    END IF;

END; $$;


-- =========================================================================
-- 3. دالة صرف الروشتة الطبية المحدثة (hims_dispense_prescription)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.hims_dispense_prescription(p_prescription_id uuid, p_warehouse_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_med record; v_org_id uuid; v_visit_id uuid;
    v_final_wh_id uuid;
    v_sales_price numeric; v_product_name text;
    v_bill_status text; v_ins_id uuid;
    v_total_cogs numeric(18,2) := 0; v_cogs_acc_id uuid; v_inv_acc_id uuid;
    v_mappings jsonb; v_cost_price numeric; v_journal_id uuid;
BEGIN
    -- 1. جلب معلومات المنظمة والزيارة
    SELECT organization_id, visit_id INTO v_org_id, v_visit_id 
    FROM public.hims_prescriptions WHERE id = p_prescription_id;
    
    -- 🔄 إعادة احتساب وتحديث الفاتورة فوراً لضمان إدخال بنود الأدوية وحساب الفروقات المالية المحدثة
    PERFORM public.hims_prepare_invoice(v_visit_id);
    
    -- 🛡️ حماية مالية: التحقق من حالة دفع الفاتورة للمرضى النقديين أو وجود جهة تأمين
    SELECT payment_status, insurance_provider_id INTO v_bill_status, v_ins_id 
    FROM public.hims_billing WHERE visit_id = v_visit_id;

    -- يجب أن تكون الفاتورة مسددة بالكامل أو مريض تأميني معتمد للصرف
    IF v_ins_id IS NULL AND (v_bill_status IS NULL OR v_bill_status != 'paid') THEN
        RAISE EXCEPTION '⚠️ خطأ أمني: لا يمكن صرف الدواء قبل سداد قيمة الروشتة بالخزينة أولاً.';
    END IF;

    -- تحديد المستودع: الممرر صراحة > إعدادات الصيدلية > أول مستودع متاح للمنظمة
    v_final_wh_id := COALESCE(
        p_warehouse_id,
        (SELECT default_pharmacy_warehouse FROM public.hims_settings WHERE organization_id = v_org_id),
        (SELECT id FROM public.warehouses WHERE organization_id = v_org_id AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1)
    );

    IF v_final_wh_id IS NULL THEN
        RAISE EXCEPTION '⚠️ فشل الصرف: لم يتم العثور على مستودع صيدلية معرف لهذه المنظمة.';
    END IF;

    -- جلب إعدادات الربط المحاسبي للمنظمة للترحيل المزدوج للتكلفة
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_cogs_acc_id := public.resolve_leaf_account(COALESCE((v_mappings->>'COGS')::uuid, (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '511' LIMIT 1)));
    v_inv_acc_id := public.resolve_leaf_account(COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '10302' LIMIT 1)));

    FOR v_med IN SELECT * FROM jsonb_to_recordset((SELECT medications FROM public.hims_prescriptions WHERE id = p_prescription_id)) 
        AS x(product_id uuid, qty numeric)
    LOOP
        -- رقابة مزدوجة: (الكمية + الصلاحية)
        IF EXISTS (
            SELECT 1 FROM public.products 
            WHERE id = v_med.product_id 
            AND organization_id = v_org_id 
            AND (expiry_date < CURRENT_DATE)
        ) THEN
            RAISE EXCEPTION '⚠️ خطأ أمني: الدواء (%) منتهي الصلاحية ولا يمكن صرفه طبياً.', 
                (SELECT name FROM public.products WHERE id = v_med.product_id);
        END IF;

        IF (SELECT stock FROM public.products WHERE id = v_med.product_id AND organization_id = v_org_id) < v_med.qty THEN
            RAISE EXCEPTION '⚠️ عجز مخزني: لا يتوفر رصيد كافٍ للدواء (%). الرصيد المتوفر (%) فقط.', 
                (SELECT name FROM public.products WHERE id = v_med.product_id),
                (SELECT stock FROM public.products WHERE id = v_med.product_id AND organization_id = v_org_id);
        END IF;

        -- جلب البيانات المالية وتكلفة الصنف
        SELECT name, sales_price, 
               COALESCE(NULLIF(weighted_average_cost, 0), NULLIF(cost, 0), NULLIF(purchase_price, 0), 0), 
               COALESCE(inventory_account_id, v_inv_acc_id)
        INTO v_product_name, v_sales_price, v_cost_price, v_inv_acc_id
        FROM public.products WHERE id = v_med.product_id;

        -- 1. خصم الكمية من المخزن
        UPDATE public.products SET stock = stock - v_med.qty 
        WHERE id = v_med.product_id AND organization_id = v_org_id;

        -- حساب التكلفة الإجمالية للصرف (COGS)
        v_total_cogs := COALESCE(v_total_cogs, 0) + (v_med.qty * COALESCE(v_cost_price, 0));

        -- 2. ترحيل البند فوراً لفاتورة المريض لضمان الشفافية المحاسبية
        PERFORM public.hims_add_billing_item(
            v_visit_id,
            'pharmacy',
            v_product_name,
            v_med.qty,
            v_sales_price,
            v_med.product_id,
            v_final_wh_id,
            (SELECT base_uom_id FROM public.products WHERE id = v_med.product_id)
        );
    END LOOP;

    -- 🛡️ توليد قيد اليومية المزدوج لإثبات تكلفة صرف الأدوية
    IF v_total_cogs > 0.01 THEN
        INSERT INTO public.journal_entries (organization_id, transaction_date, description, reference, status, related_document_id, related_document_type, is_posted)
        VALUES (v_org_id, CURRENT_DATE, 'إثبات تكلفة أدوية مصروفة - روشتة: ' || p_prescription_id::TEXT, 'PHARM-' || substring(p_prescription_id::TEXT, 1, 8), 'posted', p_prescription_id, 'hims_prescription', true)
        RETURNING id INTO v_journal_id;

        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
        VALUES 
            (v_journal_id, v_cogs_acc_id, v_total_cogs, 0, v_org_id, 'تكلفة أدوية مباعة'),
            (v_journal_id, v_inv_acc_id, 0, v_total_cogs, v_org_id, 'تخفيض مخزون الصيدلية');
    END IF;

    UPDATE public.hims_prescriptions SET status = 'dispensed' WHERE id = p_prescription_id;
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- =========================================================================
-- 3. نظام طلبات الدم وتكاملها مع بنك الدم (Blood Requests Integration)
-- =========================================================================

-- أ. إنشاء جدول طلبات نقل الدم
CREATE TABLE IF NOT EXISTS public.hims_blood_requests (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    visit_id uuid REFERENCES public.hims_visits(id) ON DELETE CASCADE,
    blood_type text NOT NULL,
    units numeric DEFAULT 1,
    urgency text DEFAULT 'normal',
    status text DEFAULT 'pending', -- pending, completed, cancelled
    created_at timestamptz DEFAULT now()
);

-- منح الصلاحيات
GRANT ALL ON public.hims_blood_requests TO authenticated;

-- ب. تحديث دالة إرسال طلب نقل الدم من الطبيب لتسجيل الطلب في الجدول الجديد
CREATE OR REPLACE FUNCTION public.hims_request_blood(
    p_visit_id uuid,
    p_blood_type text,
    p_units numeric,
    p_urgency text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- 1. تسجيل السجل الأمني
    INSERT INTO public.security_logs (event_type, description, organization_id, metadata)
    VALUES (
        'blood_request',
        format('طلب نقل دم (%s وحدات فصيلة %s) للزيارة %s', p_units, p_blood_type, p_visit_id),
        public.get_my_org(),
        jsonb_build_object('visit_id', p_visit_id, 'blood_type', p_blood_type, 'units', p_units, 'urgency', p_urgency)
    );

    -- 2. إدخال الطلب الفعلي في جدول طلبات الدم ليعمل بنك الدم بشكل سليم
    INSERT INTO public.hims_blood_requests (visit_id, blood_type, units, urgency, organization_id)
    VALUES (p_visit_id, p_blood_type, p_units, p_urgency, public.get_my_org());
END; $$;

-- ج. دالة تلبية وصرف طلب الدم من قبل فني بنك الدم
CREATE OR REPLACE FUNCTION public.hims_fulfill_blood_request(
    p_request_id uuid,
    p_bag_id uuid
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_req RECORD;
    v_bag RECORD;
BEGIN
    -- 1. جلب بيانات الطلب والتحقق منه
    SELECT * INTO v_req FROM public.hims_blood_requests WHERE id = p_request_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION '⚠️ طلب نقل الدم غير موجود.';
    END IF;
    IF v_req.status != 'pending' THEN
        RAISE EXCEPTION '⚠️ هذا الطلب تم صرفه أو إلغاؤه مسبقاً.';
    END IF;

    -- 2. جلب بيانات كيس الدم والتحقق من صلاحيته وتوافقه
    SELECT d.*, donor.blood_type 
    INTO v_bag 
    FROM public.hims_blood_donations d
    JOIN public.hims_blood_donors donor ON d.donor_id = donor.id
    WHERE d.id = p_bag_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION '⚠️ كيس الدم المحدد غير موجود.';
    END IF;
    IF v_bag.status != 'available' THEN
        RAISE EXCEPTION '⚠️ كيس الدم المحدد غير متاح للصرف حالياً.';
    END IF;
    IF v_bag.blood_type != v_req.blood_type THEN
        RAISE EXCEPTION '⚠️ فصيلة الدم في الكيس (%s) لا تطابق الفصيلة المطلوبة (%s).', v_bag.blood_type, v_req.blood_type;
    END IF;

    -- 3. تحديث حالة كيس الدم إلى مستخدم (used)
    UPDATE public.hims_blood_donations 
    SET status = 'used' 
    WHERE id = p_bag_id;

    -- 4. تسجيل عملية نقل الدم الفعلية (transfusion) للمريض
    INSERT INTO public.hims_blood_transfusions (
        visit_id, 
        bag_id, 
        doctor_id, 
        notes, 
        organization_id
    )
    VALUES (
        v_req.visit_id, 
        p_bag_id, 
        (SELECT doctor_id FROM public.hims_visits WHERE id = v_req.visit_id), 
        'صرف وتلبية طلب الدم بالكامل بنجاح', 
        v_req.organization_id
    );

    -- 5. تحديث حالة الطلب إلى مكتمل
    UPDATE public.hims_blood_requests 
    SET status = 'completed' 
    WHERE id = p_request_id;

    -- 6. استدعاء محرك الفوترة الطبية لإضافة تكلفة كيس الدم تلقائياً لفاتورة المريض
    PERFORM public.hims_prepare_invoice(v_req.visit_id);

END; $$;

-- منح الصلاحيات للدالة الجديدة
GRANT EXECUTE ON FUNCTION public.hims_fulfill_blood_request TO authenticated;

-- =========================================================================
-- 4. تحديث عرض المهام الطبية المتأخرة ليشمل نوع الزيارة ورقم السرير وموقعه وهويته
-- =========================================================================
DROP VIEW IF EXISTS public.v_hims_overdue_nurse_tasks CASCADE;

CREATE VIEW public.v_hims_overdue_nurse_tasks AS
SELECT 
    t.id as task_id,
    t.visit_id,
    t.task_type,
    p.full_name as patient_name,
    v.visit_type,
    b.bed_number,
    w.name as ward_name,
    t.description,
    t.due_at,
    EXTRACT(EPOCH FROM (now() - t.due_at))/60 as delay_minutes,
    t.organization_id
FROM public.hims_nurse_tasks t
JOIN public.hims_visits v ON t.visit_id = v.id
JOIN public.hims_patients p ON v.patient_id = p.id
LEFT JOIN public.hims_beds b ON v.id = b.current_visit_id
LEFT JOIN public.hims_wards w ON b.ward_id = w.id
WHERE t.status = 'pending' AND t.due_at < now();

GRANT SELECT ON public.v_hims_overdue_nurse_tasks TO authenticated;
