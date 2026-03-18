-- =================================================================
-- TriPro ERP - Real-time Inventory Deduction (Operational Only)
-- التاريخ: 25 مارس 2026
-- الوصف: خصم المخزون (الكميات فقط) لحظياً عند اكتمال الطلب
-- =================================================================

CREATE OR REPLACE FUNCTION public.trigger_deduct_inventory_on_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item RECORD;
    v_recipe RECORD;
    v_has_recipe BOOLEAN;
BEGIN
    -- العمل فقط عند تحويل الحالة إلى COMPLETED
    IF NEW.status = 'COMPLETED' AND (OLD.status IS DISTINCT FROM 'COMPLETED') THEN
        
        -- 1. المرور على كل صنف في الطلب
        FOR v_item IN SELECT * FROM public.order_items WHERE order_id = NEW.id LOOP
            
            -- 2. التحقق هل الصنف له وصفة تصنيع؟
            SELECT EXISTS(SELECT 1 FROM public.recipes WHERE product_id = v_item.product_id) INTO v_has_recipe;

            IF v_has_recipe THEN
                -- الحالة أ: المنتج له وصفة (مثل البرجر) -> خصم المكونات
                FOR v_recipe IN SELECT * FROM public.recipes WHERE product_id = v_item.product_id LOOP
                    UPDATE public.products 
                    SET stock = stock - (v_recipe.quantity_required * v_item.quantity)
                    WHERE id = v_recipe.ingredient_id;
                END LOOP;
            ELSE
                -- الحالة ب: المنتج جاهز وليس له وصفة (مثل المشروبات الغازية) -> خصم المنتج نفسه
                -- شرط مهم: يجب أن يكون نوع المنتج STOCK لضمان أنه منتج مخزني وليس خدمة
                UPDATE public.products 
                SET stock = stock - v_item.quantity
                WHERE id = v_item.product_id AND item_type IN ('STOCK', 'RAW_MATERIAL');
            END IF;

        END LOOP;
        
    END IF;
    RETURN NEW;
END;
$$;

-- إنشاء التريجر على جدول الطلبات
DROP TRIGGER IF EXISTS on_order_complete_deduct_stock ON public.orders;
CREATE TRIGGER on_order_complete_deduct_stock
    AFTER UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_deduct_inventory_on_complete();