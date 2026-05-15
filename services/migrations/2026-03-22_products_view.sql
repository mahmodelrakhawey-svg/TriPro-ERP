-- تحسين: إضافة حقل "has_modifiers" لتسهيل العمل على الـ Front-end

CREATE OR REPLACE VIEW public.products_with_modifiers_flag AS
SELECT 
    p.*,
    EXISTS (
        SELECT 1 
        FROM public.modifier_groups mg 
        WHERE mg.product_id = p.id
    ) as has_modifiers
FROM public.products p;