-- =================================================================
-- TriPro ERP - Restaurant Accounting Integration
-- التاريخ: 15 مارس 2026
-- الوصف: دالة RPC لترحيل مبيعات المطعم محاسبياً، بما في ذلك خصم تكلفة المواد الخام.
-- =================================================================

CREATE OR REPLACE FUNCTION public.post_restaurant_sale_to_accounting(
    p_order_id UUID,
    p_treasury_account_id UUID,
    p_payment_method TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_order_items RECORD[];
    v_cogs_account_id UUID;
    v_sales_account_id UUID;
    v_vat_account_id UUID;
    v_raw_material_account_id UUID;
    v_total_cogs NUMERIC := 0;
    v_journal_entry_id UUID;
    v_raw_materials_cost_map JSONB := '{}'::jsonb;
    v_bom_item RECORD;
    v_raw_material RECORD;
    v_item_cost NUMERIC;
    v_journal_lines JSONB[] := ARRAY[]::JSONB[];
BEGIN
    -- 1. جلب بيانات الطلب
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    -- 2. جلب الحسابات المحاسبية الأساسية
    v_sales_account_id := (SELECT id FROM public.accounts WHERE code = '411'); -- إيراد المبيعات
    v_vat_account_id := (SELECT id FROM public.accounts WHERE code = '2231'); -- ضريبة القيمة المضافة (مخرجات)
    v_cogs_account_id := (SELECT id FROM public.accounts WHERE code = '511'); -- تكلفة البضاعة المباعة
    v_raw_material_account_id := (SELECT id FROM public.accounts WHERE code = '10301'); -- مخزون المواد الخام

    IF v_sales_account_id IS NULL OR v_cogs_account_id IS NULL THEN
        RAISE EXCEPTION 'System accounts for Sales (411) or COGS (511) are not defined.';
    END IF;

    -- 3. حساب تكلفة البضاعة المباعة (COGS) بناءً على الوصفات (Recipes)
    FOR v_order_items IN SELECT oi.* FROM public.order_items oi WHERE oi.order_id = p_order_id LOOP
        FOR v_bom_item IN SELECT * FROM public.recipes WHERE product_id = v_order_items.product_id LOOP
            -- جلب تكلفة المادة الخام
            SELECT cost INTO v_item_cost FROM public.products WHERE id = v_bom_item.ingredient_id;
            v_item_cost := COALESCE(v_item_cost, 0);

            -- حساب التكلفة الإجمالية لهذه المادة في هذا الصنف
            DECLARE
                ingredient_total_cost NUMERIC;
            BEGIN
                ingredient_total_cost := v_item_cost * v_bom_item.quantity_required * v_order_items.quantity;
                v_total_cogs := v_total_cogs + ingredient_total_cost;

                -- تجميع تكاليف المواد الخام حسب حسابها المخزني
                DECLARE
                    raw_material_inv_acc_id UUID;
                BEGIN
                    SELECT inventory_account_id INTO raw_material_inv_acc_id FROM public.products WHERE id = v_bom_item.ingredient_id;
                    raw_material_inv_acc_id := COALESCE(raw_material_inv_acc_id, v_raw_material_account_id);

                    IF raw_material_inv_acc_id IS NOT NULL THEN
                        v_raw_materials_cost_map := jsonb_set(
                            v_raw_materials_cost_map,
                            ARRAY[raw_material_inv_acc_id::text],
                            (COALESCE((v_raw_materials_cost_map->>raw_material_inv_acc_id::text)::numeric, 0) + ingredient_total_cost)::text::jsonb
                        );
                    END IF;
                END;
            END;
        END LOOP;
    END LOOP;

    -- 4. بناء أسطر القيد المحاسبي
    -- قيد المبيعات
    v_journal_lines := array_append(v_journal_lines, jsonb_build_object('account_id', p_treasury_account_id, 'debit', v_order.grand_total, 'credit', 0));
    v_journal_lines := array_append(v_journal_lines, jsonb_build_object('account_id', v_sales_account_id, 'debit', 0, 'credit', v_order.subtotal));
    IF v_order.total_tax > 0 AND v_vat_account_id IS NOT NULL THEN
        v_journal_lines := array_append(v_journal_lines, jsonb_build_object('account_id', v_vat_account_id, 'debit', 0, 'credit', v_order.total_tax));
    END IF;

    -- قيد تكلفة المبيعات
    IF v_total_cogs > 0 THEN
        v_journal_lines := array_append(v_journal_lines, jsonb_build_object('account_id', v_cogs_account_id, 'debit', v_total_cogs, 'credit', 0));
        -- الطرف الدائن (خصم من حسابات مخزون المواد الخام)
        DECLARE
            key TEXT;
            value NUMERIC;
        BEGIN
            FOR key, value IN SELECT * FROM jsonb_each_text(v_raw_materials_cost_map) LOOP
                v_journal_lines := array_append(v_journal_lines, jsonb_build_object('account_id', key::uuid, 'debit', 0, 'credit', value));
            END LOOP;
        END;
    END IF;

    -- 5. إنشاء القيد المجمع
    v_journal_entry_id := public.create_journal_entry(
        v_order.created_at,
        'ترحيل آلي لمبيعات المطعم - طلب رقم ' || v_order.order_number,
        'POS-' || v_order.order_number,
        v_journal_lines,
        'posted'
    );

    -- 6. تحديث الطلب لربطه بالقيد المحاسبي
    UPDATE public.orders SET related_journal_entry_id = v_journal_entry_id WHERE id = p_order_id;

    RETURN jsonb_build_object('success', true, 'journal_entry_id', v_journal_entry_id, 'total_cogs', v_total_cogs);
END;
$$;