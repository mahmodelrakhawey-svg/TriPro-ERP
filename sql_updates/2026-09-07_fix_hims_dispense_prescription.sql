-- ==============================================================================
-- تاريخ التحديث: 2026-09-07
-- الميزة / التعديل: حل خطأ 400 وإضافة عمود dispensed_at وضبط دالة صرف الروشتات
-- سبب الإصلاح: إضافة عمود dispensed_at الناقص في جدول hims_prescriptions ومنع تضارب الدوال
-- البيئة: بيئة تطوير معزولة
-- ==============================================================================

-- 1. إضافة عمود توثيق وقت الصرف في جدول الروشتات إن لم يكن موجوداً
ALTER TABLE public.hims_prescriptions ADD COLUMN IF NOT EXISTS dispensed_at timestamptz DEFAULT now();

-- 2. حذف كافة النسخ والتوقيعات القديمة لإلغاء أي تضارب نهائياً
DROP FUNCTION IF EXISTS public.hims_dispense_prescription(uuid);
DROP FUNCTION IF EXISTS public.hims_dispense_prescription(uuid, uuid);
DROP FUNCTION IF EXISTS public.hims_dispense_prescription(uuid, uuid, uuid);

-- 3. إنشاء الدالة الواحدة الموحدة (تقبل استدعاءً بمعامل واحد أو معاملين بسلاسة تامة)
CREATE OR REPLACE FUNCTION public.hims_dispense_prescription(
    p_prescription_id uuid, 
    p_warehouse_id uuid DEFAULT NULL
)
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- 4. منح الصلاحيات لدور المستخدمين
GRANT EXECUTE ON FUNCTION public.hims_dispense_prescription(uuid, uuid) TO authenticated, anon, service_role;

-- 5. إجبار PostgREST على تحديث الكاش فوراً
NOTIFY pgrst, 'reload schema';
