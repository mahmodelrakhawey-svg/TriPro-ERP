-- ==============================================================================
-- 🍰 توجيه أصناف التورت والجاتوهات والشرقي إلى حساب مخزون الإنتاج التام (10302)
-- المنظمة: حلواني لينزا (2d9b24d6-f5cf-4bd9-b8b6-0a85d1c9c967)
-- ==============================================================================

DO $$
DECLARE
    v_org_id UUID := '2d9b24d6-f5cf-4bd9-b8b6-0a85d1c9c967';
    v_inv_fg UUID := '90685bba-b765-4fe4-96a5-b3963a4ec085';  -- حساب مخزون الإنتاج التام (10302)
    v_updated_cats INT := 0;
    v_updated_prods INT := 0;
BEGIN

    -- 1. تحديث الحساب الافتراضي للتصنيفات التابعة للإنتاج التام
    UPDATE public.item_categories
    SET default_inventory_account_id = v_inv_fg,
        updated_at = NOW()
    WHERE organization_id = v_org_id
      AND name IN (
          'التورتات الغربية الفاخرة',
          'الجاتوهات والقطع',
          'الحلويات الشرقية',
          'الشيكولاتة الفاخرة والهدايا',
          'الآيس كريم والمثلجات'
      );
    GET DIAGNOSTICS v_updated_cats = ROW_COUNT;
    RAISE NOTICE 'تم تحديث % تصنيف لترتبط افتراضياً بحساب مخزون الإنتاج التام (10302)', v_updated_cats;

    -- 2. توجيه كافة أصناف التورت، الجاتوهات، والشرقي إلى حساب مخزون الإنتاج التام (10302)
    UPDATE public.products
    SET inventory_account_id = v_inv_fg,
        updated_at = NOW()
    WHERE organization_id = v_org_id
      AND category_id IN (
          SELECT id FROM public.item_categories 
          WHERE organization_id = v_org_id 
            AND name IN (
                'التورتات الغربية الفاخرة',
                'الجاتوهات والقطع',
                'الحلويات الشرقية',
                'الشيكولاتة الفاخرة والهدايا',
                'الآيس كريم والمثلجات'
            )
      )
      AND (inventory_account_id IS NULL OR inventory_account_id != v_inv_fg);
    GET DIAGNOSTICS v_updated_prods = ROW_COUNT;
    RAISE NOTICE 'تم بنجاح توجيه % صنف إلى حساب مخزون الإنتاج التام (10302)', v_updated_prods;

END $$;
