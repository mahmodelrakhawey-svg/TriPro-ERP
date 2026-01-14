-- 🌟 إعداد نظام تكلفة المخزون (Weighted Average Cost)

-- 1. إضافة عمود متوسط التكلفة المرجح لجدول المنتجات
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS weighted_average_cost numeric DEFAULT 0;

-- تحديث القيم الحالية (مبدئياً نستخدم التكلفة الحالية أو سعر الشراء)
UPDATE public.products 
SET weighted_average_cost = COALESCE(cost, purchase_price, 0) 
WHERE weighted_average_cost = 0;

-- 2. دالة إعادة تقييم تكلفة المخزون يدوياً
CREATE OR REPLACE FUNCTION public.revalue_product_cost(
    p_product_id uuid,
    p_new_cost numeric,
    p_revaluation_date date,
    p_notes text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_product record;
    v_old_cost numeric;
    v_stock numeric;
    v_value_difference numeric;
    v_inventory_acc_id uuid;
    v_adjustment_acc_id uuid;
    v_org_id uuid;
    v_journal_id uuid;
BEGIN
    -- 1. جلب بيانات المنتج
    SELECT * INTO v_product FROM public.products WHERE id = p_product_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'المنتج غير موجود.'; END IF;

    v_old_cost := COALESCE(v_product.weighted_average_cost, v_product.cost, 0);
    v_stock := COALESCE(v_product.stock, 0);

    -- 2. حساب فرق القيمة
    v_value_difference := (p_new_cost - v_old_cost) * v_stock;

    -- 3. تحديث تكلفة المنتج
    UPDATE public.products SET weighted_average_cost = p_new_cost, cost = p_new_cost WHERE id = p_product_id;

    -- 4. إذا كان هناك فرق، أنشئ قيد محاسبي
    IF ABS(v_value_difference) > 0.01 THEN
        SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
        SELECT id INTO v_inventory_acc_id FROM public.accounts WHERE code = '1105'; -- المخزون
        SELECT id INTO v_adjustment_acc_id FROM public.accounts WHERE code = '5301'; -- فروقات جرد وتسويات

        IF v_inventory_acc_id IS NULL OR v_adjustment_acc_id IS NULL THEN RAISE EXCEPTION 'حساب المخزون (1105) أو حساب التسويات (5301) غير موجود.'; END IF;

        INSERT INTO public.journal_entries (transaction_date, description, reference, status, is_posted, organization_id)
        VALUES (p_revaluation_date, 'إعادة تقييم تكلفة الصنف: ' || v_product.name, 'REVAL-' || v_product.sku, 'posted', true, v_org_id)
        RETURNING id INTO v_journal_id;

        IF v_value_difference > 0 THEN
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description) VALUES (v_journal_id, v_inventory_acc_id, v_value_difference, 0, 'زيادة قيمة المخزون - ' || v_product.name);
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description) VALUES (v_journal_id, v_adjustment_acc_id, 0, v_value_difference, 'مقابل زيادة قيمة المخزون - ' || p_notes);
        ELSE
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description) VALUES (v_journal_id, v_adjustment_acc_id, ABS(v_value_difference), 0, 'تخفيض قيمة المخزون - ' || p_notes);
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description) VALUES (v_journal_id, v_inventory_acc_id, 0, ABS(v_value_difference), 'تخفيض قيمة المخزون - ' || v_product.name);
        END IF;
    END IF;
END;
$$;

