-- ==============================================================================
-- TriPro ERP — Phase 3: Server-Authoritative Atomic Invoicing & Depreciation RPCs
-- File: sql_updates/2026-10-02_phase3_atomic_invoicing_and_depreciation_rpcs.sql
-- ==============================================================================
-- الغرض:
-- 1. ترحيل وحفظ فواتير المبيعات ذرياً بطلب شبكي واحد (Save & Post Atomic).
-- 2. ترحيل وحفظ فواتير المشتريات ذرياً بطلب شبكي واحد.
-- 3. معالجة وحل استدعاء run_monthly_depreciation لدعم إهلاك أصل محدد أو الفترة كاملة.
-- 4. توفير غلاف آمن لـ recalculate_product_stock متطابق مع recalculate_stock_rpc.
-- ==============================================================================

-- 1. دالة حفظ واعتماد فاتورة المبيعات في معاملة ذرية موحدة (Save & Post Sales Invoice)
CREATE OR REPLACE FUNCTION public.save_and_post_sales_invoice_atomic(
    p_invoice jsonb,
    p_items jsonb,
    p_warehouse_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_saved jsonb;
    v_invoice_id uuid;
    v_org_id uuid;
    v_wh_id uuid;
BEGIN
    -- أ. حفظ الفاتورة وبنودها كمسودة أولاً ضمن نفس المعاملة الآمنة
    v_saved := public.save_sales_invoice_draft(p_invoice, p_items);
    v_invoice_id := (v_saved->>'id')::uuid;
    v_org_id := (v_saved->>'organization_id')::uuid;
    
    IF v_invoice_id IS NULL THEN
        RAISE EXCEPTION '❌ فشل إنشاء مسودة الفاتورة في المعاملة الذرية.';
    END IF;

    v_wh_id := COALESCE(p_warehouse_id, (v_saved->>'warehouse_id')::uuid);

    -- ب. اعتماد وترحيل الفاتورة وتوليد القيد وخصم المخزون ذرياً
    PERFORM public.post_sales_invoice(
        v_invoice_id,
        v_org_id,
        v_wh_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'invoice_id', v_invoice_id,
        'invoice_number', v_saved->>'invoice_number',
        'status', 'posted'
    );
END;
$$;

-- 2. دالة حفظ واعتماد فاتورة المشتريات في معاملة ذرية موحدة (Save & Post Purchase Invoice)
CREATE OR REPLACE FUNCTION public.save_and_post_purchase_invoice_atomic(
    p_invoice jsonb,
    p_items jsonb,
    p_warehouse_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_saved jsonb;
    v_invoice_id uuid;
    v_org_id uuid;
    v_wh_id uuid;
BEGIN
    -- أ. حفظ مسودة فاتورة المشتريات وبنودها
    v_saved := public.save_purchase_invoice_draft(p_invoice, p_items);
    v_invoice_id := (v_saved->>'id')::uuid;
    v_org_id := (v_saved->>'organization_id')::uuid;

    IF v_invoice_id IS NULL THEN
        RAISE EXCEPTION '❌ فشل إنشاء مسودة فاتورة المشتريات في المعاملة الذرية.';
    END IF;

    v_wh_id := COALESCE(p_warehouse_id, (v_saved->>'warehouse_id')::uuid);

    -- ب. اعتماد وترحيل فاتورة المشتريات وتحديث التكلفة والمخزون والقيود
    PERFORM public.approve_purchase_invoice(
        v_invoice_id,
        v_org_id,
        v_wh_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'invoice_id', v_invoice_id,
        'invoice_number', v_saved->>'invoice_number',
        'status', 'posted'
    );
END;
$$;

-- 3. دالة إهلاك الأصل الشهري أو الجماعي (run_monthly_depreciation)
CREATE OR REPLACE FUNCTION public.run_monthly_depreciation(
    p_asset_id uuid DEFAULT NULL,
    p_amount numeric DEFAULT NULL,
    p_date date DEFAULT CURRENT_DATE,
    p_org_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_asset record;
    v_org_id uuid;
    v_dep_amount numeric;
    v_journal_id uuid;
    v_dep_exp_acc_id uuid;
    v_acc_dep_acc_id uuid;
BEGIN
    -- إذا لم يُحدد أصل معين، يتم تنفيذ إهلاك الفترة بالكامل للأصول النشطة
    IF p_asset_id IS NULL THEN
        v_org_id := COALESCE(p_org_id, public.get_my_org());
        RETURN public.run_period_depreciation(p_date, v_org_id);
    END IF;

    -- في حال تحديد أصل معين
    SELECT * INTO v_asset FROM public.assets WHERE id = p_asset_id AND deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'الأصل غير موجود (ID: %)', p_asset_id;
    END IF;

    v_org_id := COALESCE(p_org_id, v_asset.organization_id, public.get_my_org());
    
    -- تحديد قيمة الإهلاك (القيمة الممررة أو المحسوبة شهرياً)
    IF p_amount IS NOT NULL AND p_amount > 0 THEN
        v_dep_amount := round(p_amount, 2);
    ELSIF v_asset.useful_life > 0 THEN
        v_dep_amount := round((v_asset.purchase_cost - v_asset.salvage_value) / (v_asset.useful_life * 12), 2);
    ELSE
        v_dep_amount := 0;
    END IF;

    IF v_dep_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'قيمة الإهلاك المحسوبة تساوي صفراً.');
    END IF;

    -- الحسابات
    v_dep_exp_acc_id := COALESCE(v_asset.depreciation_expense_account_id, (SELECT id FROM public.accounts WHERE code = '5202' AND organization_id = v_org_id LIMIT 1));
    v_acc_dep_acc_id := COALESCE(v_asset.accumulated_depreciation_account_id, (SELECT id FROM public.accounts WHERE code = '1399' AND organization_id = v_org_id LIMIT 1));

    IF v_dep_exp_acc_id IS NULL OR v_acc_dep_acc_id IS NULL THEN
        RAISE EXCEPTION 'تعذر العثور على حساب مصروف الإهلاك أو مجمع الإهلاك للأصل "%"', v_asset.name;
    END IF;

    -- قيد اليومية
    INSERT INTO public.journal_entries (
        transaction_date, description, reference, status, is_posted,
        organization_id, related_document_id, related_document_type
    ) VALUES (
        p_date,
        'إهلاك شهري للأصل: ' || v_asset.name,
        'DEP-' || substring(v_asset.id::text, 1, 6) || '-' || to_char(p_date, 'YYYYMM'),
        'posted', true,
        v_org_id, v_asset.id, 'asset_depreciation'
    ) RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_journal_id, v_dep_exp_acc_id, v_dep_amount, 0, 'مصروف إهلاك - ' || v_asset.name, v_org_id);

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_journal_id, v_acc_dep_acc_id, 0, v_dep_amount, 'مجمع إهلاك - ' || v_asset.name, v_org_id);

    -- تحديث القيمة الحالية للأصل
    UPDATE public.assets
    SET current_value = GREATEST(salvage_value, current_value - v_dep_amount)
    WHERE id = p_asset_id;

    RETURN jsonb_build_object(
        'success', true,
        'journal_id', v_journal_id,
        'depreciation_amount', v_dep_amount,
        'asset_id', p_asset_id
    );
END;
$$;

-- 4. غلاف متطابق لـ recalculate_product_stock لضمان التوافقية
CREATE OR REPLACE FUNCTION public.recalculate_product_stock(
    p_product_id uuid DEFAULT NULL,
    p_org_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN public.recalculate_stock_rpc(p_product_id, COALESCE(p_org_id, public.get_my_org()));
END;
$$;

-- 5. منح الصلاحيات
GRANT EXECUTE ON FUNCTION public.save_and_post_sales_invoice_atomic(jsonb, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_and_post_purchase_invoice_atomic(jsonb, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.run_monthly_depreciation(uuid, numeric, date, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recalculate_product_stock(uuid, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
