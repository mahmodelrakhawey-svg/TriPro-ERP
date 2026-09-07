-- 🌟 دالة اعتماد مرتجع المشتريات الآمنة (Secure Purchase Return Approval RPC)
-- هذا الملف يجب تنفيذه في Supabase SQL Editor

-- 1. التأكد من وجود عمود لربط المرتجع بالقيد
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_returns' AND column_name = 'related_journal_entry_id') THEN 
        ALTER TABLE public.purchase_returns ADD COLUMN related_journal_entry_id uuid REFERENCES public.journal_entries(id); 
    END IF; 
END $$;

-- 2. إنشاء الدالة
CREATE OR REPLACE FUNCTION public.approve_purchase_return(p_return_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_return record;
    v_item record;
    v_org_id uuid;
    v_inventory_acc_id uuid;
    v_vat_acc_id uuid;
    v_supplier_acc_id uuid;
    v_journal_id uuid;
    v_mappings jsonb; -- 🚀 مضاف للربط المحاسبي
BEGIN
    -- أ. التحقق من المرتجع
    SELECT * INTO v_return FROM public.purchase_returns WHERE id = p_return_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'مرتجع المشتريات غير موجود'; END IF;
    IF v_return.status = 'posted' THEN RAISE EXCEPTION 'المرتجع مرحل بالفعل'; END IF;

    -- تحديد المنظمة من المرتجع لضمان عزل البيانات في نظام SaaS
    v_org_id := v_return.organization_id;

    -- ب. جلب الحسابات
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_inventory_acc_id := COALESCE((v_mappings->>'INVENTORY_RAW_MATERIALS')::uuid, (SELECT id FROM public.accounts WHERE code = '10301' AND organization_id = v_org_id LIMIT 1));
    v_vat_acc_id := COALESCE((v_mappings->>'VAT_INPUT')::uuid, (v_mappings->>'VAT')::uuid, (SELECT id FROM public.accounts WHERE code = '1241' AND organization_id = v_org_id LIMIT 1));
    v_supplier_acc_id := COALESCE((v_mappings->>'SUPPLIERS')::uuid, (SELECT id FROM public.accounts WHERE code = '201' AND organization_id = v_org_id LIMIT 1));

    IF v_inventory_acc_id IS NULL OR v_supplier_acc_id IS NULL THEN
        RAISE EXCEPTION 'حسابات المخزون أو الموردين غير معرّفة في دليل الحسابات';
    END IF;

    -- ج. تحديث المخزون (خصم الكميات)
    FOR v_item IN SELECT * FROM public.purchase_return_items WHERE purchase_return_id = p_return_id LOOP
        UPDATE public.products 
        SET stock = stock - v_item.quantity,
            warehouse_stock = jsonb_set(
                COALESCE(warehouse_stock, '{}'::jsonb), 
                ARRAY[v_return.warehouse_id::text], 
                to_jsonb(COALESCE((warehouse_stock->>v_return.warehouse_id::text)::numeric, 0) - v_item.quantity)
            )
        WHERE id = v_item.product_id;
    END LOOP;

    -- د. إنشاء قيد اليومية
    INSERT INTO public.journal_entries (
        transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted
    ) VALUES (
        v_return.return_date, 
        'مرتجع مشتريات رقم ' || COALESCE(v_return.return_number, '-'), 
        v_return.return_number, 
        'posted', 
        v_org_id,
        p_return_id,
        'purchase_return',
        true
    ) RETURNING id INTO v_journal_id;

    -- هـ. إنشاء أسطر القيد
    -- 1. المدين: المورد (تخفيض الالتزام)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_journal_id, v_supplier_acc_id, v_return.total_amount, 0, 'مرتجع مشتريات - ' || v_return.return_number, v_org_id);

    -- 2. الدائن: المخزون (صافي القيمة لكل منتج حسب حسابه الخاص)
    FOR v_item IN 
        SELECT 
            COALESCE(p.inventory_account_id, v_inventory_acc_id) as acc_id,
            SUM(pri.total) as total_cost
        FROM public.purchase_return_items pri
        JOIN public.products p ON pri.product_id = p.id
        WHERE pri.purchase_return_id = p_return_id
        GROUP BY COALESCE(p.inventory_account_id, v_inventory_acc_id)
    LOOP
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_item.acc_id, 0, v_item.total_cost, 'مخزون - مرتجع مشتريات ' || v_return.return_number, v_org_id);
    END LOOP;

    -- 3. الدائن: ضريبة المدخلات (عكس)
    IF COALESCE(v_return.tax_amount, 0) > 0 AND v_vat_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_vat_acc_id, 0, v_return.tax_amount, 'ضريبة مدخلات (عكس) - مرتجع ' || v_return.return_number, v_org_id);
    END IF;

    -- و. تحديث حالة المرتجع
    UPDATE public.purchase_returns 
    SET status = 'posted',
        related_journal_entry_id = v_journal_id
    WHERE id = p_return_id;
END;
$$;