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
BEGIN
    -- العمل فقط عند تحويل الحالة إلى COMPLETED
    IF NEW.status = 'COMPLETED' AND (OLD.status IS DISTINCT FROM 'COMPLETED') THEN
        
        -- 1. المرور على كل صنف في الطلب
        FOR v_item IN SELECT * FROM public.order_items WHERE order_id = NEW.id LOOP
            
            -- 2. البحث عن وصفة الصنف (Recipes/BOM)
            -- إذا كان المنتج يباع كما هو (Direct Product) أو له مكونات
            FOR v_recipe IN SELECT * FROM public.recipes WHERE product_id = v_item.product_id LOOP
                
                -- 3. خصم كمية المادة الخام من المخزون
                -- المعادلة: المخزون الحالي - (كمية المكون في الوصفة * كمية الصنف في الطلب)
                UPDATE public.products 
                SET stock = stock - (v_recipe.quantity_required * v_item.quantity)
                WHERE id = v_recipe.ingredient_id;
                
            END LOOP;

            -- (اختياري) إذا كان المنتج نفسه مخزونياً وليس له وصفة (مثل علبة كولا)
            IF NOT EXISTS (SELECT 1 FROM public.recipes WHERE product_id = v_item.product_id) THEN
                 UPDATE public.products 
                 SET stock = stock - v_item.quantity
                 WHERE id = v_item.product_id AND item_type = 'STOCK';
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
