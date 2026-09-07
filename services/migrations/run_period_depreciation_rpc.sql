-- 🌟 دالة تشغيل إهلاك الفترة (Bulk Depreciation Run)
-- تقوم بحساب وتسجيل إهلاك جميع الأصول النشطة لشهر معين

-- 1. التأكد من وجود عمود الحالة (status) في جدول الأصول (assets)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'assets' 
          AND column_name = 'status'
    ) THEN
        ALTER TABLE public.assets ADD COLUMN status text DEFAULT 'active';
    END IF;
END $$;

-- 2. إنشاء/تحديث دالة تشغيل الإهلاك للفترة
CREATE OR REPLACE FUNCTION public.run_period_depreciation(
    p_date date,
    p_org_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER -- 🛡️ تشغيل الصلاحيات بمستوى صلاحيات المنشئ لتخطي قيود RLS عند إدخال قيود اليومية
AS $$
DECLARE
    v_asset record;
    v_monthly_depreciation numeric;
    v_journal_id uuid;
    v_processed_count integer := 0;
    v_skipped_count integer := 0;
    v_dep_exp_acc_id uuid;
    v_acc_dep_acc_id uuid;
BEGIN
    -- المرور على جميع الأصول النشطة التي لم يتم إهلاكها بالكامل
    FOR v_asset IN 
        SELECT * FROM public.assets 
        WHERE COALESCE(status, 'active') = 'active' 
        AND (purchase_cost - salvage_value) > 0
        AND organization_id = p_org_id
        AND deleted_at IS NULL
    LOOP
        -- 1. التحقق مما إذا كان قد تم إهلاك هذا الأصل في هذا الشهر بالفعل
        PERFORM 1 FROM public.journal_entries 
        WHERE related_document_id = v_asset.id 
        AND related_document_type = 'asset_depreciation'
        AND to_char(transaction_date, 'YYYY-MM') = to_char(p_date, 'YYYY-MM');
        
        IF FOUND THEN
            v_skipped_count := v_skipped_count + 1;
            CONTINUE;
        END IF;

        -- 2. حساب قسط الإهلاك الشهري (القسط الثابت)
        -- (التكلفة - الخردة) / (العمر الإنتاجي بالسنوات * 12)
        IF v_asset.useful_life > 0 THEN
            v_monthly_depreciation := (v_asset.purchase_cost - v_asset.salvage_value) / (v_asset.useful_life * 12);
        ELSE
            v_monthly_depreciation := 0;
        END IF;

        -- تقريب القيمة لخانين عشريين لمنع مشاكل الكسور الطويلة في القيود
        v_monthly_depreciation := round(v_monthly_depreciation, 2);

        IF v_monthly_depreciation > 0 THEN
            -- 3. تحديد الحسابات
            -- استخدام حسابات الأصل المحددة أو الافتراضية
            v_dep_exp_acc_id := COALESCE(v_asset.depreciation_expense_account_id, (SELECT id FROM public.accounts WHERE code = '5202' LIMIT 1));
            v_acc_dep_acc_id := COALESCE(v_asset.accumulated_depreciation_account_id, (SELECT id FROM public.accounts WHERE code = '1399' LIMIT 1));

            IF v_dep_exp_acc_id IS NOT NULL AND v_acc_dep_acc_id IS NOT NULL THEN
                -- 4. إنشاء قيد اليومية
                INSERT INTO public.journal_entries (
                    transaction_date, description, reference, status, is_posted, 
                    organization_id, related_document_id, related_document_type
                ) VALUES (
                    p_date, 
                    'إهلاك شهري للأصل: ' || v_asset.name, 
                    'DEP-' || substring(v_asset.id::text, 1, 6) || '-' || to_char(p_date, 'YYYYMM'), 
                    'posted', true, 
                    p_org_id, v_asset.id, 'asset_depreciation'
                ) RETURNING id INTO v_journal_id;

                -- 5. إنشاء أسطر القيد
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_dep_exp_acc_id, v_monthly_depreciation, 0, 'مصروف إهلاك - ' || v_asset.name, p_org_id);
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_dep_acc_id, 0, v_monthly_depreciation, 'مجمع إهلاك - ' || v_asset.name, p_org_id);

                v_processed_count := v_processed_count + 1;
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('processed', v_processed_count, 'skipped', v_skipped_count);
END;
$$;

-- 3. منح الصلاحيات للمستخدمين لتشغيل الدالة
GRANT EXECUTE ON FUNCTION public.run_period_depreciation(date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_period_depreciation(date, uuid) TO service_role;

-- 4. تحديث ذاكرة التخزين المؤقت (Cache) لـ PostgREST فوراً
NOTIFY pgrst, 'reload schema';