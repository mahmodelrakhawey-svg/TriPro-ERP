-- Database Migration: Create add_product_with_opening_balance RPC
-- Date: 2026-07-17
-- Reason: Define the missing RPC function called by the opening stock inventory screen to register new products with opening stock and generate balanced journal entries.

CREATE OR REPLACE FUNCTION public.add_product_with_opening_balance(
    p_name text,
    p_sku text,
    p_sales_price numeric,
    p_purchase_price numeric,
    p_stock numeric,
    p_unit text,
    p_org_id uuid,
    p_item_type text,
    p_inventory_account_id uuid,
    p_cogs_account_id uuid,
    p_sales_account_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_product_id uuid;
    v_mappings jsonb;
    v_opening_bal_acc_id uuid;
    v_journal_id uuid;
    v_total_cost numeric;
    v_desc text;
    v_ref text;
BEGIN
    -- 1. إدراج المنتج في جدول المنتجات
    INSERT INTO public.products (
        name,
        sku,
        sales_price,
        purchase_price,
        stock,
        unit,
        organization_id,
        item_type,
        product_type,
        inventory_account_id,
        cogs_account_id,
        sales_account_id,
        cost,
        weighted_average_cost
    ) 
    VALUES (
        p_name,
        p_sku,
        p_sales_price,
        p_purchase_price,
        p_stock,
        p_unit,
        p_org_id,
        p_item_type,
        p_item_type,
        p_inventory_account_id,
        p_cogs_account_id,
        p_sales_account_id,
        p_purchase_price,
        p_purchase_price
    )
    RETURNING id INTO v_product_id;

    -- 2. إثبات القيد الافتتاحي إذا كان هناك كمية وسعر تكلفة
    v_total_cost := COALESCE(p_stock, 0) * COALESCE(p_purchase_price, 0);
    
    IF v_total_cost > 0 THEN
        -- جلب إعدادات الحسابات لتحديد حساب المقابل للأرصدة الافتتاحية
        SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = p_org_id;
        IF v_mappings IS NOT NULL THEN
            v_opening_bal_acc_id := (v_mappings->>'OPENING_BALANCES')::uuid;
        END IF;

        IF v_opening_bal_acc_id IS NULL THEN
            SELECT id INTO v_opening_bal_acc_id FROM public.accounts 
            WHERE (code IN ('3999', '313', '39') OR name LIKE '%أرصدة افتتاحية%')
              AND organization_id = p_org_id LIMIT 1;
        END IF;

        IF v_opening_bal_acc_id IS NULL THEN
            RAISE EXCEPTION 'حساب الأرصدة الافتتاحية (كود 3999) غير معرف في النظام لهذه المنظمة.';
        END IF;

        v_ref := 'OP-PROD-' || v_product_id;
        v_desc := 'رصيد مخزون افتتاحي للمنتج: ' || p_name || ' (الكمية: ' || p_stock || ')';

        -- إنشاء رأس قيد اليومية
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
            now()::date, 
            v_desc, 
            v_ref, 
            'posted', 
            p_org_id, 
            v_product_id, 
            'opening_inventory', 
            true, 
            auth.uid()
        ) 
        RETURNING id INTO v_journal_id;

        -- مدين: حساب المخزون
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_journal_id, p_inventory_account_id, v_total_cost, 0, v_desc, p_org_id);
        
        -- دائن: حساب الأرصدة الافتتاحية
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_journal_id, v_opening_bal_acc_id, 0, v_total_cost, v_desc, p_org_id);
        
        -- إعادة احتساب أرصدة الحسابات المتأثرة
        PERFORM public.recalculate_all_system_balances(p_org_id);
    END IF;

    RETURN v_product_id;
END;
$$;

-- منح صلاحيات التشغيل
GRANT EXECUTE ON FUNCTION public.add_product_with_opening_balance TO authenticated;
