-- ==============================================================================
-- 🎂 سكريبت إدخال وصفات ومسارات تصنيع 30 تورتة (مرحلة واحدة لكل تورتة)
-- المنظمة: حلواني لينزا (2d9b24d6-f5cf-4bd9-b8b6-0a85d1c9c967)
-- ==============================================================================

DO $$
DECLARE
    v_org_id UUID := '2d9b24d6-f5cf-4bd9-b8b6-0a85d1c9c967';
    v_inv_raw UUID := '00bc8443-0ace-40ba-82c1-ce97f6a02e15'; -- مخزون المواد الخام
    v_inv_fg UUID := '90685bba-b765-4fe4-96a5-b3963a4ec085';  -- مخزون المنتج التام
    v_cogs UUID := 'faae6e36-00ec-44e5-aaf9-1e5faa8d2b90';
    v_sales UUID := 'dd1ebdec-0552-4185-b90f-fd633a1195b6';
    v_cat_torte UUID := '6e1aeb44-6db7-4b32-92a0-fafa471af881'; -- التورتات الغربية الفاخرة
    v_cat_raw UUID := 'd79def49-3230-4967-aae0-fba145a4a4eb';   -- خامات الحلويات الأولية
    
    v_prod_id UUID;
    v_mat_id UUID;
    v_routing_id UUID;
    v_step_id UUID;
BEGIN

    -- ========================================================
    -- 🍰 تورتة 20*20 هاف
    -- ========================================================
    SELECT id INTO v_prod_id FROM public.products WHERE organization_id = v_org_id AND name = 'تورتة 20*20 هاف' LIMIT 1;
    IF v_prod_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تورتة 20*20 هاف', 'MANUFACTURED', 'MANUFACTURED', 'قطعة', v_cat_torte, v_inv_fg, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_prod_id;
    END IF;

    -- مسار ومرحلة التصنيع في موديول التصنيع
    SELECT id INTO v_routing_id FROM public.mfg_routings WHERE product_id = v_prod_id AND organization_id = v_org_id AND is_default = true LIMIT 1;
    IF v_routing_id IS NULL THEN
        INSERT INTO public.mfg_routings (product_id, name, is_default, organization_id)
        VALUES (v_prod_id, 'مسار تصنيع تورتة 20*20 هاف', true, v_org_id)
        RETURNING id INTO v_routing_id;
    END IF;

    SELECT id INTO v_step_id FROM public.mfg_routing_steps WHERE routing_id = v_routing_id AND step_order = 1 LIMIT 1;
    IF v_step_id IS NULL THEN
        INSERT INTO public.mfg_routing_steps (routing_id, step_order, operation_name, standard_time_minutes, organization_id)
        VALUES (v_routing_id, 1, 'مرحلة التجهيز والتصنيع', 15, v_org_id)
        RETURNING id INTO v_step_id;
    END IF;

    -- تنظيف خامات المرحلة السابقة لتفادي التكرار
    DELETE FROM public.mfg_step_materials WHERE step_id = v_step_id;
    DELETE FROM public.bill_of_materials WHERE product_id = v_prod_id;

    -- المكون: ديسك 25*25
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ديسك 25*25' OR name ILIKE '%ديسك 25*25%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ديسك 25*25', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: كريمة تجليس ابيض
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس ابيض' OR name ILIKE '%كريمة تجليس ابيض%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس ابيض', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.15, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.15, v_org_id);

    -- المكون: كريمة تجليس بني
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس بني' OR name ILIKE '%كريمة تجليس بني%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس بني', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: جناش تزيين
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'جناش تزيين' OR name ILIKE '%جناش تزيين%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('جناش تزيين', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: توت احمر
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'توت احمر' OR name ILIKE '%توت احمر%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('توت احمر', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.01, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.01, v_org_id);

    -- المكون: ميلك
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ميلك' OR name ILIKE '%ميلك%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ميلك', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.2, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.2, v_org_id);

    -- المكون: شوكولاتة مكعبات
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'شوكولاتة مكعبات' OR name ILIKE '%شوكولاتة مكعبات%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('شوكولاتة مكعبات', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: تفاح احمر
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'تفاح احمر' OR name ILIKE '%تفاح احمر%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تفاح احمر', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: تفاح اخضر
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'تفاح اخضر' OR name ILIKE '%تفاح اخضر%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تفاح اخضر', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: مانجا
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'مانجا' OR name ILIKE '%مانجا%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('مانجا', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.5, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.5, v_org_id);

    -- المكون: اناناس
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'اناناس' OR name ILIKE '%اناناس%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('اناناس', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.25, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.25, v_org_id);

    -- المكون: برقوق
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'برقوق' OR name ILIKE '%برقوق%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('برقوق', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);


    -- ========================================================
    -- 🍰 تورتة 25*25 هاف
    -- ========================================================
    SELECT id INTO v_prod_id FROM public.products WHERE organization_id = v_org_id AND name = 'تورتة 25*25 هاف' LIMIT 1;
    IF v_prod_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تورتة 25*25 هاف', 'MANUFACTURED', 'MANUFACTURED', 'قطعة', v_cat_torte, v_inv_fg, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_prod_id;
    END IF;

    -- مسار ومرحلة التصنيع في موديول التصنيع
    SELECT id INTO v_routing_id FROM public.mfg_routings WHERE product_id = v_prod_id AND organization_id = v_org_id AND is_default = true LIMIT 1;
    IF v_routing_id IS NULL THEN
        INSERT INTO public.mfg_routings (product_id, name, is_default, organization_id)
        VALUES (v_prod_id, 'مسار تصنيع تورتة 25*25 هاف', true, v_org_id)
        RETURNING id INTO v_routing_id;
    END IF;

    SELECT id INTO v_step_id FROM public.mfg_routing_steps WHERE routing_id = v_routing_id AND step_order = 1 LIMIT 1;
    IF v_step_id IS NULL THEN
        INSERT INTO public.mfg_routing_steps (routing_id, step_order, operation_name, standard_time_minutes, organization_id)
        VALUES (v_routing_id, 1, 'مرحلة التجهيز والتصنيع', 15, v_org_id)
        RETURNING id INTO v_step_id;
    END IF;

    -- تنظيف خامات المرحلة السابقة لتفادي التكرار
    DELETE FROM public.mfg_step_materials WHERE step_id = v_step_id;
    DELETE FROM public.bill_of_materials WHERE product_id = v_prod_id;

    -- المكون: ديسك 25*25
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ديسك 25*25' OR name ILIKE '%ديسك 25*25%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ديسك 25*25', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: كريمة تجليس ابيض
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس ابيض' OR name ILIKE '%كريمة تجليس ابيض%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس ابيض', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.15, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.15, v_org_id);

    -- المكون: كريمة تجليس بني
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس بني' OR name ILIKE '%كريمة تجليس بني%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس بني', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: جناش تزيين
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'جناش تزيين' OR name ILIKE '%جناش تزيين%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('جناش تزيين', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.5, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.5, v_org_id);

    -- المكون: توت احمر
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'توت احمر' OR name ILIKE '%توت احمر%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('توت احمر', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.01, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.01, v_org_id);

    -- المكون: ميلك
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ميلك' OR name ILIKE '%ميلك%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ميلك', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.2, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.2, v_org_id);

    -- المكون: شوكولاتة كيندر
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'شوكولاتة كيندر' OR name ILIKE '%شوكولاتة كيندر%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('شوكولاتة كيندر', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: تفاح احمر
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'تفاح احمر' OR name ILIKE '%تفاح احمر%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تفاح احمر', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: تفاح اخضر
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'تفاح اخضر' OR name ILIKE '%تفاح اخضر%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تفاح اخضر', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: مانجا
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'مانجا' OR name ILIKE '%مانجا%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('مانجا', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.2, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.2, v_org_id);

    -- المكون: اناناس
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'اناناس' OR name ILIKE '%اناناس%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('اناناس', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.15, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.15, v_org_id);

    -- المكون: برقوق
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'برقوق' OR name ILIKE '%برقوق%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('برقوق', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);


    -- ========================================================
    -- 🍰 تورتة M#M م 18
    -- ========================================================
    SELECT id INTO v_prod_id FROM public.products WHERE organization_id = v_org_id AND name = 'تورتة M#M م 18' LIMIT 1;
    IF v_prod_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تورتة M#M م 18', 'MANUFACTURED', 'MANUFACTURED', 'قطعة', v_cat_torte, v_inv_fg, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_prod_id;
    END IF;

    -- مسار ومرحلة التصنيع في موديول التصنيع
    SELECT id INTO v_routing_id FROM public.mfg_routings WHERE product_id = v_prod_id AND organization_id = v_org_id AND is_default = true LIMIT 1;
    IF v_routing_id IS NULL THEN
        INSERT INTO public.mfg_routings (product_id, name, is_default, organization_id)
        VALUES (v_prod_id, 'مسار تصنيع تورتة M#M م 18', true, v_org_id)
        RETURNING id INTO v_routing_id;
    END IF;

    SELECT id INTO v_step_id FROM public.mfg_routing_steps WHERE routing_id = v_routing_id AND step_order = 1 LIMIT 1;
    IF v_step_id IS NULL THEN
        INSERT INTO public.mfg_routing_steps (routing_id, step_order, operation_name, standard_time_minutes, organization_id)
        VALUES (v_routing_id, 1, 'مرحلة التجهيز والتصنيع', 15, v_org_id)
        RETURNING id INTO v_step_id;
    END IF;

    -- تنظيف خامات المرحلة السابقة لتفادي التكرار
    DELETE FROM public.mfg_step_materials WHERE step_id = v_step_id;
    DELETE FROM public.bill_of_materials WHERE product_id = v_prod_id;

    -- المكون: ديسك م 18
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ديسك م 18' OR name ILIKE '%ديسك م 18%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ديسك م 18', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: كريمة تجليس بني
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس بني' OR name ILIKE '%كريمة تجليس بني%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس بني', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: جناش تزيين
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'جناش تزيين' OR name ILIKE '%جناش تزيين%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('جناش تزيين', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: شوكولاتة كيندر
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'شوكولاتة كيندر' OR name ILIKE '%شوكولاتة كيندر%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('شوكولاتة كيندر', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: شوكولاتة كيت كات
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'شوكولاتة كيت كات' OR name ILIKE '%شوكولاتة كيت كات%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('شوكولاتة كيت كات', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 2, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 2, v_org_id);

    -- المكون: شوكولاتة مكعبات
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'شوكولاتة مكعبات' OR name ILIKE '%شوكولاتة مكعبات%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('شوكولاتة مكعبات', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 2, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 2, v_org_id);

    -- المكون: شوكولاتة روشية
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'شوكولاتة روشية' OR name ILIKE '%شوكولاتة روشية%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('شوكولاتة روشية', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: بسكوت اوريو
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'بسكوت اوريو' OR name ILIKE '%بسكوت اوريو%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('بسكوت اوريو', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.5, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.5, v_org_id);

    -- المكون: شوكولاتة M#M
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'شوكولاتة M#M' OR name ILIKE '%شوكولاتة M#M%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('شوكولاتة M#M', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);


    -- ========================================================
    -- 🍰 تورتة M#M م 24
    -- ========================================================
    SELECT id INTO v_prod_id FROM public.products WHERE organization_id = v_org_id AND name = 'تورتة M#M م 24' LIMIT 1;
    IF v_prod_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تورتة M#M م 24', 'MANUFACTURED', 'MANUFACTURED', 'قطعة', v_cat_torte, v_inv_fg, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_prod_id;
    END IF;

    -- مسار ومرحلة التصنيع في موديول التصنيع
    SELECT id INTO v_routing_id FROM public.mfg_routings WHERE product_id = v_prod_id AND organization_id = v_org_id AND is_default = true LIMIT 1;
    IF v_routing_id IS NULL THEN
        INSERT INTO public.mfg_routings (product_id, name, is_default, organization_id)
        VALUES (v_prod_id, 'مسار تصنيع تورتة M#M م 24', true, v_org_id)
        RETURNING id INTO v_routing_id;
    END IF;

    SELECT id INTO v_step_id FROM public.mfg_routing_steps WHERE routing_id = v_routing_id AND step_order = 1 LIMIT 1;
    IF v_step_id IS NULL THEN
        INSERT INTO public.mfg_routing_steps (routing_id, step_order, operation_name, standard_time_minutes, organization_id)
        VALUES (v_routing_id, 1, 'مرحلة التجهيز والتصنيع', 15, v_org_id)
        RETURNING id INTO v_step_id;
    END IF;

    -- تنظيف خامات المرحلة السابقة لتفادي التكرار
    DELETE FROM public.mfg_step_materials WHERE step_id = v_step_id;
    DELETE FROM public.bill_of_materials WHERE product_id = v_prod_id;

    -- المكون: ديسك م 24
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ديسك م 24' OR name ILIKE '%ديسك م 24%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ديسك م 24', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: كريمة تجليس بني
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس بني' OR name ILIKE '%كريمة تجليس بني%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس بني', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.16, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.16, v_org_id);

    -- المكون: جناش تزيين
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'جناش تزيين' OR name ILIKE '%جناش تزيين%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('جناش تزيين', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.15, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.15, v_org_id);

    -- المكون: شوكولاتة كيندر
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'شوكولاتة كيندر' OR name ILIKE '%شوكولاتة كيندر%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('شوكولاتة كيندر', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: شوكولاتة كيت كات
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'شوكولاتة كيت كات' OR name ILIKE '%شوكولاتة كيت كات%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('شوكولاتة كيت كات', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 2, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 2, v_org_id);

    -- المكون: شوكولاتة مكعبات
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'شوكولاتة مكعبات' OR name ILIKE '%شوكولاتة مكعبات%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('شوكولاتة مكعبات', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 2, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 2, v_org_id);

    -- المكون: شوكولاتة روشية
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'شوكولاتة روشية' OR name ILIKE '%شوكولاتة روشية%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('شوكولاتة روشية', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: بسكوت اوريو
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'بسكوت اوريو' OR name ILIKE '%بسكوت اوريو%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('بسكوت اوريو', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: شوكولاتة M#M
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'شوكولاتة M#M' OR name ILIKE '%شوكولاتة M#M%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('شوكولاتة M#M', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.2, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.2, v_org_id);


    -- ========================================================
    -- 🍰 تورتة 8 سيزن
    -- ========================================================
    SELECT id INTO v_prod_id FROM public.products WHERE organization_id = v_org_id AND name = 'تورتة 8 سيزن' LIMIT 1;
    IF v_prod_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تورتة 8 سيزن', 'MANUFACTURED', 'MANUFACTURED', 'قطعة', v_cat_torte, v_inv_fg, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_prod_id;
    END IF;

    -- مسار ومرحلة التصنيع في موديول التصنيع
    SELECT id INTO v_routing_id FROM public.mfg_routings WHERE product_id = v_prod_id AND organization_id = v_org_id AND is_default = true LIMIT 1;
    IF v_routing_id IS NULL THEN
        INSERT INTO public.mfg_routings (product_id, name, is_default, organization_id)
        VALUES (v_prod_id, 'مسار تصنيع تورتة 8 سيزن', true, v_org_id)
        RETURNING id INTO v_routing_id;
    END IF;

    SELECT id INTO v_step_id FROM public.mfg_routing_steps WHERE routing_id = v_routing_id AND step_order = 1 LIMIT 1;
    IF v_step_id IS NULL THEN
        INSERT INTO public.mfg_routing_steps (routing_id, step_order, operation_name, standard_time_minutes, organization_id)
        VALUES (v_routing_id, 1, 'مرحلة التجهيز والتصنيع', 15, v_org_id)
        RETURNING id INTO v_step_id;
    END IF;

    -- تنظيف خامات المرحلة السابقة لتفادي التكرار
    DELETE FROM public.mfg_step_materials WHERE step_id = v_step_id;
    DELETE FROM public.bill_of_materials WHERE product_id = v_prod_id;

    -- المكون: صوص لوتس
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'صوص لوتس' OR name ILIKE '%صوص لوتس%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('صوص لوتس', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: بسكوت لوتس
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'بسكوت لوتس' OR name ILIKE '%بسكوت لوتس%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('بسكوت لوتس', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.01, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.01, v_org_id);

    -- المكون: صوص نوتيلا
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'صوص نوتيلا' OR name ILIKE '%صوص نوتيلا%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('صوص نوتيلا', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: شوكولاتة كيندر
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'شوكولاتة كيندر' OR name ILIKE '%شوكولاتة كيندر%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('شوكولاتة كيندر', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: جناش تزيين
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'جناش تزيين' OR name ILIKE '%جناش تزيين%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('جناش تزيين', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: شوكولاتة كيت كات
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'شوكولاتة كيت كات' OR name ILIKE '%شوكولاتة كيت كات%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('شوكولاتة كيت كات', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: جيلي مانجا
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'جيلي مانجا' OR name ILIKE '%جيلي مانجا%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('جيلي مانجا', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: مانجا قطع
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'مانجا قطع' OR name ILIKE '%مانجا قطع%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('مانجا قطع', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.05, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.05, v_org_id);

    -- المكون: سبريد بلو بيري
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'سبريد بلو بيري' OR name ILIKE '%سبريد بلو بيري%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('سبريد بلو بيري', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: مونوار
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'مونوار' OR name ILIKE '%مونوار%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('مونوار', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: روشية
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'روشية' OR name ILIKE '%روشية%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('روشية', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: صوص كراميل
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'صوص كراميل' OR name ILIKE '%صوص كراميل%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('صوص كراميل', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: عين جمل
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'عين جمل' OR name ILIKE '%عين جمل%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('عين جمل', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.01, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.01, v_org_id);

    -- المكون: جيلي فراولة
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'جيلي فراولة' OR name ILIKE '%جيلي فراولة%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('جيلي فراولة', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: توت احمر
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'توت احمر' OR name ILIKE '%توت احمر%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('توت احمر', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.01, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.01, v_org_id);

    -- المكون: ديسك م 28
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ديسك م 28' OR name ILIKE '%ديسك م 28%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ديسك م 28', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: كريمة تجليس ابيض
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس ابيض' OR name ILIKE '%كريمة تجليس ابيض%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس ابيض', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.15, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.15, v_org_id);

    -- المكون: كريمة تجليس بني
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس بني' OR name ILIKE '%كريمة تجليس بني%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس بني', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.05, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.05, v_org_id);


    -- ========================================================
    -- 🍰 تورتة هاف كراميل فرنساوي
    -- ========================================================
    SELECT id INTO v_prod_id FROM public.products WHERE organization_id = v_org_id AND name = 'تورتة هاف كراميل فرنساوي' LIMIT 1;
    IF v_prod_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تورتة هاف كراميل فرنساوي', 'MANUFACTURED', 'MANUFACTURED', 'قطعة', v_cat_torte, v_inv_fg, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_prod_id;
    END IF;

    -- مسار ومرحلة التصنيع في موديول التصنيع
    SELECT id INTO v_routing_id FROM public.mfg_routings WHERE product_id = v_prod_id AND organization_id = v_org_id AND is_default = true LIMIT 1;
    IF v_routing_id IS NULL THEN
        INSERT INTO public.mfg_routings (product_id, name, is_default, organization_id)
        VALUES (v_prod_id, 'مسار تصنيع تورتة هاف كراميل فرنساوي', true, v_org_id)
        RETURNING id INTO v_routing_id;
    END IF;

    SELECT id INTO v_step_id FROM public.mfg_routing_steps WHERE routing_id = v_routing_id AND step_order = 1 LIMIT 1;
    IF v_step_id IS NULL THEN
        INSERT INTO public.mfg_routing_steps (routing_id, step_order, operation_name, standard_time_minutes, organization_id)
        VALUES (v_routing_id, 1, 'مرحلة التجهيز والتصنيع', 15, v_org_id)
        RETURNING id INTO v_step_id;
    END IF;

    -- تنظيف خامات المرحلة السابقة لتفادي التكرار
    DELETE FROM public.mfg_step_materials WHERE step_id = v_step_id;
    DELETE FROM public.bill_of_materials WHERE product_id = v_prod_id;

    -- المكون: ديسك م 28
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ديسك م 28' OR name ILIKE '%ديسك م 28%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ديسك م 28', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: كريمة تجليس بني
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس بني' OR name ILIKE '%كريمة تجليس بني%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس بني', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: كريمة تجليس ابيض
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس ابيض' OR name ILIKE '%كريمة تجليس ابيض%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس ابيض', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: مانجا
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'مانجا' OR name ILIKE '%مانجا%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('مانجا', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.2, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.2, v_org_id);

    -- المكون: تفاح احمر
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'تفاح احمر' OR name ILIKE '%تفاح احمر%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تفاح احمر', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: تفاح اخضر
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'تفاح اخضر' OR name ILIKE '%تفاح اخضر%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تفاح اخضر', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: كيوي
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كيوي' OR name ILIKE '%كيوي%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كيوي', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.2, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.2, v_org_id);

    -- المكون: برقوق
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'برقوق' OR name ILIKE '%برقوق%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('برقوق', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: مكسرات
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'مكسرات' OR name ILIKE '%مكسرات%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('مكسرات', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.2, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.2, v_org_id);


    -- ========================================================
    -- 🍰 تورتة ميني هاف
    -- ========================================================
    SELECT id INTO v_prod_id FROM public.products WHERE organization_id = v_org_id AND name = 'تورتة ميني هاف' LIMIT 1;
    IF v_prod_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تورتة ميني هاف', 'MANUFACTURED', 'MANUFACTURED', 'قطعة', v_cat_torte, v_inv_fg, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_prod_id;
    END IF;

    -- مسار ومرحلة التصنيع في موديول التصنيع
    SELECT id INTO v_routing_id FROM public.mfg_routings WHERE product_id = v_prod_id AND organization_id = v_org_id AND is_default = true LIMIT 1;
    IF v_routing_id IS NULL THEN
        INSERT INTO public.mfg_routings (product_id, name, is_default, organization_id)
        VALUES (v_prod_id, 'مسار تصنيع تورتة ميني هاف', true, v_org_id)
        RETURNING id INTO v_routing_id;
    END IF;

    SELECT id INTO v_step_id FROM public.mfg_routing_steps WHERE routing_id = v_routing_id AND step_order = 1 LIMIT 1;
    IF v_step_id IS NULL THEN
        INSERT INTO public.mfg_routing_steps (routing_id, step_order, operation_name, standard_time_minutes, organization_id)
        VALUES (v_routing_id, 1, 'مرحلة التجهيز والتصنيع', 15, v_org_id)
        RETURNING id INTO v_step_id;
    END IF;

    -- تنظيف خامات المرحلة السابقة لتفادي التكرار
    DELETE FROM public.mfg_step_materials WHERE step_id = v_step_id;
    DELETE FROM public.bill_of_materials WHERE product_id = v_prod_id;

    -- المكون: ديسك م 24
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ديسك م 24' OR name ILIKE '%ديسك م 24%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ديسك م 24', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: كريمة تجليس بني
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس بني' OR name ILIKE '%كريمة تجليس بني%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس بني', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.08, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.08, v_org_id);

    -- المكون: كريمة تجليس ابيض
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس ابيض' OR name ILIKE '%كريمة تجليس ابيض%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس ابيض', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.08, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.08, v_org_id);

    -- المكون: مانجا
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'مانجا' OR name ILIKE '%مانجا%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('مانجا', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: تفاح احمر
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'تفاح احمر' OR name ILIKE '%تفاح احمر%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تفاح احمر', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.15, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.15, v_org_id);

    -- المكون: تفاح اخضر
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'تفاح اخضر' OR name ILIKE '%تفاح اخضر%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تفاح اخضر', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: اناناس
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'اناناس' OR name ILIKE '%اناناس%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('اناناس', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: جناش تزيين
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'جناش تزيين' OR name ILIKE '%جناش تزيين%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('جناش تزيين', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.05, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.05, v_org_id);

    -- المكون: روشيه
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'روشيه' OR name ILIKE '%روشيه%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('روشيه', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.5, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.5, v_org_id);

    -- المكون: ميلك
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ميلك' OR name ILIKE '%ميلك%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ميلك', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.2, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.2, v_org_id);


    -- ========================================================
    -- 🍰 تورتة ميني فور سيزون
    -- ========================================================
    SELECT id INTO v_prod_id FROM public.products WHERE organization_id = v_org_id AND name = 'تورتة ميني فور سيزون' LIMIT 1;
    IF v_prod_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تورتة ميني فور سيزون', 'MANUFACTURED', 'MANUFACTURED', 'قطعة', v_cat_torte, v_inv_fg, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_prod_id;
    END IF;

    -- مسار ومرحلة التصنيع في موديول التصنيع
    SELECT id INTO v_routing_id FROM public.mfg_routings WHERE product_id = v_prod_id AND organization_id = v_org_id AND is_default = true LIMIT 1;
    IF v_routing_id IS NULL THEN
        INSERT INTO public.mfg_routings (product_id, name, is_default, organization_id)
        VALUES (v_prod_id, 'مسار تصنيع تورتة ميني فور سيزون', true, v_org_id)
        RETURNING id INTO v_routing_id;
    END IF;

    SELECT id INTO v_step_id FROM public.mfg_routing_steps WHERE routing_id = v_routing_id AND step_order = 1 LIMIT 1;
    IF v_step_id IS NULL THEN
        INSERT INTO public.mfg_routing_steps (routing_id, step_order, operation_name, standard_time_minutes, organization_id)
        VALUES (v_routing_id, 1, 'مرحلة التجهيز والتصنيع', 15, v_org_id)
        RETURNING id INTO v_step_id;
    END IF;

    -- تنظيف خامات المرحلة السابقة لتفادي التكرار
    DELETE FROM public.mfg_step_materials WHERE step_id = v_step_id;
    DELETE FROM public.bill_of_materials WHERE product_id = v_prod_id;

    -- المكون: ديسك م 24
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ديسك م 24' OR name ILIKE '%ديسك م 24%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ديسك م 24', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: كريمة تجليس بني
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس بني' OR name ILIKE '%كريمة تجليس بني%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس بني', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.08, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.08, v_org_id);

    -- المكون: كريمة تجليس ابيض
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس ابيض' OR name ILIKE '%كريمة تجليس ابيض%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس ابيض', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.08, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.08, v_org_id);

    -- المكون: جيلي مانجا
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'جيلي مانجا' OR name ILIKE '%جيلي مانجا%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('جيلي مانجا', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: جيلي فراولة
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'جيلي فراولة' OR name ILIKE '%جيلي فراولة%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('جيلي فراولة', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: صوص كراميل
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'صوص كراميل' OR name ILIKE '%صوص كراميل%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('صوص كراميل', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: ميلك
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ميلك' OR name ILIKE '%ميلك%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ميلك', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: جناش تزيين
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'جناش تزيين' OR name ILIKE '%جناش تزيين%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('جناش تزيين', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.2, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.2, v_org_id);

    -- المكون: روشيه
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'روشيه' OR name ILIKE '%روشيه%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('روشيه', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.5, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.5, v_org_id);

    -- المكون: كريمة تزيين
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تزيين' OR name ILIKE '%كريمة تزيين%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تزيين', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);


    -- ========================================================
    -- 🍰 تورتة قلب هاف
    -- ========================================================
    SELECT id INTO v_prod_id FROM public.products WHERE organization_id = v_org_id AND name = 'تورتة قلب هاف' LIMIT 1;
    IF v_prod_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تورتة قلب هاف', 'MANUFACTURED', 'MANUFACTURED', 'قطعة', v_cat_torte, v_inv_fg, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_prod_id;
    END IF;

    -- مسار ومرحلة التصنيع في موديول التصنيع
    SELECT id INTO v_routing_id FROM public.mfg_routings WHERE product_id = v_prod_id AND organization_id = v_org_id AND is_default = true LIMIT 1;
    IF v_routing_id IS NULL THEN
        INSERT INTO public.mfg_routings (product_id, name, is_default, organization_id)
        VALUES (v_prod_id, 'مسار تصنيع تورتة قلب هاف', true, v_org_id)
        RETURNING id INTO v_routing_id;
    END IF;

    SELECT id INTO v_step_id FROM public.mfg_routing_steps WHERE routing_id = v_routing_id AND step_order = 1 LIMIT 1;
    IF v_step_id IS NULL THEN
        INSERT INTO public.mfg_routing_steps (routing_id, step_order, operation_name, standard_time_minutes, organization_id)
        VALUES (v_routing_id, 1, 'مرحلة التجهيز والتصنيع', 15, v_org_id)
        RETURNING id INTO v_step_id;
    END IF;

    -- تنظيف خامات المرحلة السابقة لتفادي التكرار
    DELETE FROM public.mfg_step_materials WHERE step_id = v_step_id;
    DELETE FROM public.bill_of_materials WHERE product_id = v_prod_id;

    -- المكون: ديسك م 24
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ديسك م 24' OR name ILIKE '%ديسك م 24%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ديسك م 24', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: كريمة تجليس بني
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس بني' OR name ILIKE '%كريمة تجليس بني%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس بني', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.08, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.08, v_org_id);

    -- المكون: كريمة تجليس ابيض
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس ابيض' OR name ILIKE '%كريمة تجليس ابيض%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس ابيض', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.08, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.08, v_org_id);

    -- المكون: مانجا
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'مانجا' OR name ILIKE '%مانجا%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('مانجا', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.2, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.2, v_org_id);

    -- المكون: تفاح احمر
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'تفاح احمر' OR name ILIKE '%تفاح احمر%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تفاح احمر', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: تفاح اخضر
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'تفاح اخضر' OR name ILIKE '%تفاح اخضر%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تفاح اخضر', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: شوكولاتة كيت كات
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'شوكولاتة كيت كات' OR name ILIKE '%شوكولاتة كيت كات%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('شوكولاتة كيت كات', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: جناش تزيين
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'جناش تزيين' OR name ILIKE '%جناش تزيين%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('جناش تزيين', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: اناناس
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'اناناس' OR name ILIKE '%اناناس%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('اناناس', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);


    -- ========================================================
    -- 🍰 تورتةكيت كات م 24
    -- ========================================================
    SELECT id INTO v_prod_id FROM public.products WHERE organization_id = v_org_id AND name = 'تورتةكيت كات م 24' LIMIT 1;
    IF v_prod_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تورتةكيت كات م 24', 'MANUFACTURED', 'MANUFACTURED', 'قطعة', v_cat_torte, v_inv_fg, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_prod_id;
    END IF;

    -- مسار ومرحلة التصنيع في موديول التصنيع
    SELECT id INTO v_routing_id FROM public.mfg_routings WHERE product_id = v_prod_id AND organization_id = v_org_id AND is_default = true LIMIT 1;
    IF v_routing_id IS NULL THEN
        INSERT INTO public.mfg_routings (product_id, name, is_default, organization_id)
        VALUES (v_prod_id, 'مسار تصنيع تورتةكيت كات م 24', true, v_org_id)
        RETURNING id INTO v_routing_id;
    END IF;

    SELECT id INTO v_step_id FROM public.mfg_routing_steps WHERE routing_id = v_routing_id AND step_order = 1 LIMIT 1;
    IF v_step_id IS NULL THEN
        INSERT INTO public.mfg_routing_steps (routing_id, step_order, operation_name, standard_time_minutes, organization_id)
        VALUES (v_routing_id, 1, 'مرحلة التجهيز والتصنيع', 15, v_org_id)
        RETURNING id INTO v_step_id;
    END IF;

    -- تنظيف خامات المرحلة السابقة لتفادي التكرار
    DELETE FROM public.mfg_step_materials WHERE step_id = v_step_id;
    DELETE FROM public.bill_of_materials WHERE product_id = v_prod_id;

    -- المكون: ديسك م 24
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ديسك م 24' OR name ILIKE '%ديسك م 24%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ديسك م 24', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: كريمة تجليس بني
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس بني' OR name ILIKE '%كريمة تجليس بني%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس بني', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.18, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.18, v_org_id);

    -- المكون: بسكوت اوريو
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'بسكوت اوريو' OR name ILIKE '%بسكوت اوريو%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('بسكوت اوريو', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: جناش تزيين
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'جناش تزيين' OR name ILIKE '%جناش تزيين%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('جناش تزيين', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: صوص كراميل
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'صوص كراميل' OR name ILIKE '%صوص كراميل%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('صوص كراميل', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: شوكولاتة  M#M
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'شوكولاتة  M#M' OR name ILIKE '%شوكولاتة  M#M%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('شوكولاتة  M#M', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: روشيه
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'روشيه' OR name ILIKE '%روشيه%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('روشيه', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: شوكولاة كيندر
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'شوكولاة كيندر' OR name ILIKE '%شوكولاة كيندر%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('شوكولاة كيندر', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: شوكولاتة مالتيزر
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'شوكولاتة مالتيزر' OR name ILIKE '%شوكولاتة مالتيزر%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('شوكولاتة مالتيزر', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.2, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.2, v_org_id);

    -- المكون: شوكولاتة كيت كات
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'شوكولاتة كيت كات' OR name ILIKE '%شوكولاتة كيت كات%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('شوكولاتة كيت كات', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 23, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 23, v_org_id);


    -- ========================================================
    -- 🍰 تورتة 30*30 هاف
    -- ========================================================
    SELECT id INTO v_prod_id FROM public.products WHERE organization_id = v_org_id AND name = 'تورتة 30*30 هاف' LIMIT 1;
    IF v_prod_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تورتة 30*30 هاف', 'MANUFACTURED', 'MANUFACTURED', 'قطعة', v_cat_torte, v_inv_fg, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_prod_id;
    END IF;

    -- مسار ومرحلة التصنيع في موديول التصنيع
    SELECT id INTO v_routing_id FROM public.mfg_routings WHERE product_id = v_prod_id AND organization_id = v_org_id AND is_default = true LIMIT 1;
    IF v_routing_id IS NULL THEN
        INSERT INTO public.mfg_routings (product_id, name, is_default, organization_id)
        VALUES (v_prod_id, 'مسار تصنيع تورتة 30*30 هاف', true, v_org_id)
        RETURNING id INTO v_routing_id;
    END IF;

    SELECT id INTO v_step_id FROM public.mfg_routing_steps WHERE routing_id = v_routing_id AND step_order = 1 LIMIT 1;
    IF v_step_id IS NULL THEN
        INSERT INTO public.mfg_routing_steps (routing_id, step_order, operation_name, standard_time_minutes, organization_id)
        VALUES (v_routing_id, 1, 'مرحلة التجهيز والتصنيع', 15, v_org_id)
        RETURNING id INTO v_step_id;
    END IF;

    -- تنظيف خامات المرحلة السابقة لتفادي التكرار
    DELETE FROM public.mfg_step_materials WHERE step_id = v_step_id;
    DELETE FROM public.bill_of_materials WHERE product_id = v_prod_id;

    -- المكون: ديسك م 30*30
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ديسك م 30*30' OR name ILIKE '%ديسك م 30*30%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ديسك م 30*30', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: كريمة تجليس بني
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس بني' OR name ILIKE '%كريمة تجليس بني%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس بني', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.15, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.15, v_org_id);

    -- المكون: كريمة تجليس ابيض
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس ابيض' OR name ILIKE '%كريمة تجليس ابيض%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس ابيض', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.15, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.15, v_org_id);

    -- المكون: جناش تزيين
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'جناش تزيين' OR name ILIKE '%جناش تزيين%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('جناش تزيين', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: ميلك
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ميلك' OR name ILIKE '%ميلك%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ميلك', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.25, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.25, v_org_id);

    -- المكون: شوكولاتة  مكعبات
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'شوكولاتة  مكعبات' OR name ILIKE '%شوكولاتة  مكعبات%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('شوكولاتة  مكعبات', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: تفاح احمر
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'تفاح احمر' OR name ILIKE '%تفاح احمر%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تفاح احمر', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.15, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.15, v_org_id);

    -- المكون: تفاح اخضر
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'تفاح اخضر' OR name ILIKE '%تفاح اخضر%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تفاح اخضر', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.15, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.15, v_org_id);

    -- المكون: برقوق
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'برقوق' OR name ILIKE '%برقوق%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('برقوق', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.15, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.15, v_org_id);

    -- المكون: مانجا
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'مانجا' OR name ILIKE '%مانجا%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('مانجا', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: اناناس
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'اناناس' OR name ILIKE '%اناناس%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('اناناس', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.2, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.2, v_org_id);


    -- ========================================================
    -- 🍰 تورتة هاف فرنساوي 28
    -- ========================================================
    SELECT id INTO v_prod_id FROM public.products WHERE organization_id = v_org_id AND name = 'تورتة هاف فرنساوي 28' LIMIT 1;
    IF v_prod_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تورتة هاف فرنساوي 28', 'MANUFACTURED', 'MANUFACTURED', 'قطعة', v_cat_torte, v_inv_fg, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_prod_id;
    END IF;

    -- مسار ومرحلة التصنيع في موديول التصنيع
    SELECT id INTO v_routing_id FROM public.mfg_routings WHERE product_id = v_prod_id AND organization_id = v_org_id AND is_default = true LIMIT 1;
    IF v_routing_id IS NULL THEN
        INSERT INTO public.mfg_routings (product_id, name, is_default, organization_id)
        VALUES (v_prod_id, 'مسار تصنيع تورتة هاف فرنساوي 28', true, v_org_id)
        RETURNING id INTO v_routing_id;
    END IF;

    SELECT id INTO v_step_id FROM public.mfg_routing_steps WHERE routing_id = v_routing_id AND step_order = 1 LIMIT 1;
    IF v_step_id IS NULL THEN
        INSERT INTO public.mfg_routing_steps (routing_id, step_order, operation_name, standard_time_minutes, organization_id)
        VALUES (v_routing_id, 1, 'مرحلة التجهيز والتصنيع', 15, v_org_id)
        RETURNING id INTO v_step_id;
    END IF;

    -- تنظيف خامات المرحلة السابقة لتفادي التكرار
    DELETE FROM public.mfg_step_materials WHERE step_id = v_step_id;
    DELETE FROM public.bill_of_materials WHERE product_id = v_prod_id;

    -- المكون: ديسك م 28
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ديسك م 28' OR name ILIKE '%ديسك م 28%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ديسك م 28', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: كريمة تجليس بني
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس بني' OR name ILIKE '%كريمة تجليس بني%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس بني', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: كريمة تجليس ابيض
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس ابيض' OR name ILIKE '%كريمة تجليس ابيض%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس ابيض', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: مانجا
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'مانجا' OR name ILIKE '%مانجا%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('مانجا', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.3, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.3, v_org_id);

    -- المكون: برقوق
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'برقوق' OR name ILIKE '%برقوق%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('برقوق', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.2, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.2, v_org_id);

    -- المكون: اناناس
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'اناناس' OR name ILIKE '%اناناس%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('اناناس', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: مكعبات
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'مكعبات' OR name ILIKE '%مكعبات%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('مكعبات', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 4, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 4, v_org_id);

    -- المكون: ميلك
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ميلك' OR name ILIKE '%ميلك%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ميلك', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.2, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.2, v_org_id);


    -- ========================================================
    -- 🍰 تورتة هاف فرنساوي بابلي
    -- ========================================================
    SELECT id INTO v_prod_id FROM public.products WHERE organization_id = v_org_id AND name = 'تورتة هاف فرنساوي بابلي' LIMIT 1;
    IF v_prod_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تورتة هاف فرنساوي بابلي', 'MANUFACTURED', 'MANUFACTURED', 'قطعة', v_cat_torte, v_inv_fg, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_prod_id;
    END IF;

    -- مسار ومرحلة التصنيع في موديول التصنيع
    SELECT id INTO v_routing_id FROM public.mfg_routings WHERE product_id = v_prod_id AND organization_id = v_org_id AND is_default = true LIMIT 1;
    IF v_routing_id IS NULL THEN
        INSERT INTO public.mfg_routings (product_id, name, is_default, organization_id)
        VALUES (v_prod_id, 'مسار تصنيع تورتة هاف فرنساوي بابلي', true, v_org_id)
        RETURNING id INTO v_routing_id;
    END IF;

    SELECT id INTO v_step_id FROM public.mfg_routing_steps WHERE routing_id = v_routing_id AND step_order = 1 LIMIT 1;
    IF v_step_id IS NULL THEN
        INSERT INTO public.mfg_routing_steps (routing_id, step_order, operation_name, standard_time_minutes, organization_id)
        VALUES (v_routing_id, 1, 'مرحلة التجهيز والتصنيع', 15, v_org_id)
        RETURNING id INTO v_step_id;
    END IF;

    -- تنظيف خامات المرحلة السابقة لتفادي التكرار
    DELETE FROM public.mfg_step_materials WHERE step_id = v_step_id;
    DELETE FROM public.bill_of_materials WHERE product_id = v_prod_id;

    -- المكون: ديسك م 28
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ديسك م 28' OR name ILIKE '%ديسك م 28%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ديسك م 28', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: كريمة تجليس بني
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس بني' OR name ILIKE '%كريمة تجليس بني%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس بني', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: كريمة تجليس ابيض
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس ابيض' OR name ILIKE '%كريمة تجليس ابيض%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس ابيض', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: مانجا
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'مانجا' OR name ILIKE '%مانجا%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('مانجا', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.3, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.3, v_org_id);

    -- المكون: برقوق
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'برقوق' OR name ILIKE '%برقوق%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('برقوق', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.2, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.2, v_org_id);

    -- المكون: اناناس
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'اناناس' OR name ILIKE '%اناناس%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('اناناس', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: شوكولاتة بابلي
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'شوكولاتة بابلي' OR name ILIKE '%شوكولاتة بابلي%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('شوكولاتة بابلي', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 4, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 4, v_org_id);

    -- المكون: ميلك
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ميلك' OR name ILIKE '%ميلك%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ميلك', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.2, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.2, v_org_id);


    -- ========================================================
    -- 🍰 تورتة هاف فرنساوي كيندر
    -- ========================================================
    SELECT id INTO v_prod_id FROM public.products WHERE organization_id = v_org_id AND name = 'تورتة هاف فرنساوي كيندر' LIMIT 1;
    IF v_prod_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تورتة هاف فرنساوي كيندر', 'MANUFACTURED', 'MANUFACTURED', 'قطعة', v_cat_torte, v_inv_fg, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_prod_id;
    END IF;

    -- مسار ومرحلة التصنيع في موديول التصنيع
    SELECT id INTO v_routing_id FROM public.mfg_routings WHERE product_id = v_prod_id AND organization_id = v_org_id AND is_default = true LIMIT 1;
    IF v_routing_id IS NULL THEN
        INSERT INTO public.mfg_routings (product_id, name, is_default, organization_id)
        VALUES (v_prod_id, 'مسار تصنيع تورتة هاف فرنساوي كيندر', true, v_org_id)
        RETURNING id INTO v_routing_id;
    END IF;

    SELECT id INTO v_step_id FROM public.mfg_routing_steps WHERE routing_id = v_routing_id AND step_order = 1 LIMIT 1;
    IF v_step_id IS NULL THEN
        INSERT INTO public.mfg_routing_steps (routing_id, step_order, operation_name, standard_time_minutes, organization_id)
        VALUES (v_routing_id, 1, 'مرحلة التجهيز والتصنيع', 15, v_org_id)
        RETURNING id INTO v_step_id;
    END IF;

    -- تنظيف خامات المرحلة السابقة لتفادي التكرار
    DELETE FROM public.mfg_step_materials WHERE step_id = v_step_id;
    DELETE FROM public.bill_of_materials WHERE product_id = v_prod_id;

    -- المكون: ديسك م 28
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ديسك م 28' OR name ILIKE '%ديسك م 28%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ديسك م 28', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: كريمة تجليس بني
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس بني' OR name ILIKE '%كريمة تجليس بني%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس بني', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: كريمة تجليس ابيض
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس ابيض' OR name ILIKE '%كريمة تجليس ابيض%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس ابيض', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: مانجا
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'مانجا' OR name ILIKE '%مانجا%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('مانجا', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.3, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.3, v_org_id);

    -- المكون: برقوق
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'برقوق' OR name ILIKE '%برقوق%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('برقوق', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.2, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.2, v_org_id);

    -- المكون: اناناس
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'اناناس' OR name ILIKE '%اناناس%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('اناناس', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: شوكولاتة كيندر
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'شوكولاتة كيندر' OR name ILIKE '%شوكولاتة كيندر%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('شوكولاتة كيندر', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 4, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 4, v_org_id);

    -- المكون: ميلك
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ميلك' OR name ILIKE '%ميلك%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ميلك', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.2, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.2, v_org_id);


    -- ========================================================
    -- 🍰 تورتة هاف فرنساوي روشية
    -- ========================================================
    SELECT id INTO v_prod_id FROM public.products WHERE organization_id = v_org_id AND name = 'تورتة هاف فرنساوي روشية' LIMIT 1;
    IF v_prod_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تورتة هاف فرنساوي روشية', 'MANUFACTURED', 'MANUFACTURED', 'قطعة', v_cat_torte, v_inv_fg, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_prod_id;
    END IF;

    -- مسار ومرحلة التصنيع في موديول التصنيع
    SELECT id INTO v_routing_id FROM public.mfg_routings WHERE product_id = v_prod_id AND organization_id = v_org_id AND is_default = true LIMIT 1;
    IF v_routing_id IS NULL THEN
        INSERT INTO public.mfg_routings (product_id, name, is_default, organization_id)
        VALUES (v_prod_id, 'مسار تصنيع تورتة هاف فرنساوي روشية', true, v_org_id)
        RETURNING id INTO v_routing_id;
    END IF;

    SELECT id INTO v_step_id FROM public.mfg_routing_steps WHERE routing_id = v_routing_id AND step_order = 1 LIMIT 1;
    IF v_step_id IS NULL THEN
        INSERT INTO public.mfg_routing_steps (routing_id, step_order, operation_name, standard_time_minutes, organization_id)
        VALUES (v_routing_id, 1, 'مرحلة التجهيز والتصنيع', 15, v_org_id)
        RETURNING id INTO v_step_id;
    END IF;

    -- تنظيف خامات المرحلة السابقة لتفادي التكرار
    DELETE FROM public.mfg_step_materials WHERE step_id = v_step_id;
    DELETE FROM public.bill_of_materials WHERE product_id = v_prod_id;

    -- المكون: ديسك م 28
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ديسك م 28' OR name ILIKE '%ديسك م 28%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ديسك م 28', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: كريمة تجليس بني
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس بني' OR name ILIKE '%كريمة تجليس بني%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس بني', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: كريمة تجليس ابيض
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس ابيض' OR name ILIKE '%كريمة تجليس ابيض%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس ابيض', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: مانجا
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'مانجا' OR name ILIKE '%مانجا%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('مانجا', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.3, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.3, v_org_id);

    -- المكون: برقوق
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'برقوق' OR name ILIKE '%برقوق%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('برقوق', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.2, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.2, v_org_id);

    -- المكون: اناناس
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'اناناس' OR name ILIKE '%اناناس%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('اناناس', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: شوكولاتة روشية
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'شوكولاتة روشية' OR name ILIKE '%شوكولاتة روشية%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('شوكولاتة روشية', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 3, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 3, v_org_id);

    -- المكون: ميلك
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ميلك' OR name ILIKE '%ميلك%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ميلك', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.2, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.2, v_org_id);


    -- ========================================================
    -- 🍰 تورتة هاف فرنساوي مالتيزر
    -- ========================================================
    SELECT id INTO v_prod_id FROM public.products WHERE organization_id = v_org_id AND name = 'تورتة هاف فرنساوي مالتيزر' LIMIT 1;
    IF v_prod_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تورتة هاف فرنساوي مالتيزر', 'MANUFACTURED', 'MANUFACTURED', 'قطعة', v_cat_torte, v_inv_fg, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_prod_id;
    END IF;

    -- مسار ومرحلة التصنيع في موديول التصنيع
    SELECT id INTO v_routing_id FROM public.mfg_routings WHERE product_id = v_prod_id AND organization_id = v_org_id AND is_default = true LIMIT 1;
    IF v_routing_id IS NULL THEN
        INSERT INTO public.mfg_routings (product_id, name, is_default, organization_id)
        VALUES (v_prod_id, 'مسار تصنيع تورتة هاف فرنساوي مالتيزر', true, v_org_id)
        RETURNING id INTO v_routing_id;
    END IF;

    SELECT id INTO v_step_id FROM public.mfg_routing_steps WHERE routing_id = v_routing_id AND step_order = 1 LIMIT 1;
    IF v_step_id IS NULL THEN
        INSERT INTO public.mfg_routing_steps (routing_id, step_order, operation_name, standard_time_minutes, organization_id)
        VALUES (v_routing_id, 1, 'مرحلة التجهيز والتصنيع', 15, v_org_id)
        RETURNING id INTO v_step_id;
    END IF;

    -- تنظيف خامات المرحلة السابقة لتفادي التكرار
    DELETE FROM public.mfg_step_materials WHERE step_id = v_step_id;
    DELETE FROM public.bill_of_materials WHERE product_id = v_prod_id;

    -- المكون: ديسك م 28
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ديسك م 28' OR name ILIKE '%ديسك م 28%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ديسك م 28', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: كريمة تجليس بني
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس بني' OR name ILIKE '%كريمة تجليس بني%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس بني', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: كريمة تجليس ابيض
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس ابيض' OR name ILIKE '%كريمة تجليس ابيض%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس ابيض', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: مانجا
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'مانجا' OR name ILIKE '%مانجا%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('مانجا', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.3, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.3, v_org_id);

    -- المكون: برقوق
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'برقوق' OR name ILIKE '%برقوق%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('برقوق', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.2, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.2, v_org_id);

    -- المكون: اناناس
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'اناناس' OR name ILIKE '%اناناس%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('اناناس', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: شوكولاتة مالتيزر
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'شوكولاتة مالتيزر' OR name ILIKE '%شوكولاتة مالتيزر%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('شوكولاتة مالتيزر', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.15, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.15, v_org_id);

    -- المكون: ميلك
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ميلك' OR name ILIKE '%ميلك%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ميلك', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.2, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.2, v_org_id);


    -- ========================================================
    -- 🍰 تورتة هاف فرنساوي كراميل
    -- ========================================================
    SELECT id INTO v_prod_id FROM public.products WHERE organization_id = v_org_id AND name = 'تورتة هاف فرنساوي كراميل' LIMIT 1;
    IF v_prod_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تورتة هاف فرنساوي كراميل', 'MANUFACTURED', 'MANUFACTURED', 'قطعة', v_cat_torte, v_inv_fg, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_prod_id;
    END IF;

    -- مسار ومرحلة التصنيع في موديول التصنيع
    SELECT id INTO v_routing_id FROM public.mfg_routings WHERE product_id = v_prod_id AND organization_id = v_org_id AND is_default = true LIMIT 1;
    IF v_routing_id IS NULL THEN
        INSERT INTO public.mfg_routings (product_id, name, is_default, organization_id)
        VALUES (v_prod_id, 'مسار تصنيع تورتة هاف فرنساوي كراميل', true, v_org_id)
        RETURNING id INTO v_routing_id;
    END IF;

    SELECT id INTO v_step_id FROM public.mfg_routing_steps WHERE routing_id = v_routing_id AND step_order = 1 LIMIT 1;
    IF v_step_id IS NULL THEN
        INSERT INTO public.mfg_routing_steps (routing_id, step_order, operation_name, standard_time_minutes, organization_id)
        VALUES (v_routing_id, 1, 'مرحلة التجهيز والتصنيع', 15, v_org_id)
        RETURNING id INTO v_step_id;
    END IF;

    -- تنظيف خامات المرحلة السابقة لتفادي التكرار
    DELETE FROM public.mfg_step_materials WHERE step_id = v_step_id;
    DELETE FROM public.bill_of_materials WHERE product_id = v_prod_id;

    -- المكون: ديسك م 28
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ديسك م 28' OR name ILIKE '%ديسك م 28%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ديسك م 28', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: كريمة تجليس بني
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس بني' OR name ILIKE '%كريمة تجليس بني%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس بني', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: كريمة تجليس ابيض
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس ابيض' OR name ILIKE '%كريمة تجليس ابيض%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس ابيض', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: مانجا
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'مانجا' OR name ILIKE '%مانجا%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('مانجا', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.3, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.3, v_org_id);

    -- المكون: برقوق
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'برقوق' OR name ILIKE '%برقوق%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('برقوق', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.2, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.2, v_org_id);

    -- المكون: اناناس
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'اناناس' OR name ILIKE '%اناناس%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('اناناس', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: شوكولاتة مالتيزر
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'شوكولاتة مالتيزر' OR name ILIKE '%شوكولاتة مالتيزر%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('شوكولاتة مالتيزر', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.15, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.15, v_org_id);

    -- المكون: صوص كراميل
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'صوص كراميل' OR name ILIKE '%صوص كراميل%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('صوص كراميل', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.2, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.2, v_org_id);

    -- المكون: مكسرات
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'مكسرات' OR name ILIKE '%مكسرات%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('مكسرات', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.2, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.2, v_org_id);


    -- ========================================================
    -- 🍰 تورتة ريد فيلفت عالي 18
    -- ========================================================
    SELECT id INTO v_prod_id FROM public.products WHERE organization_id = v_org_id AND name = 'تورتة ريد فيلفت عالي 18' LIMIT 1;
    IF v_prod_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تورتة ريد فيلفت عالي 18', 'MANUFACTURED', 'MANUFACTURED', 'قطعة', v_cat_torte, v_inv_fg, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_prod_id;
    END IF;

    -- مسار ومرحلة التصنيع في موديول التصنيع
    SELECT id INTO v_routing_id FROM public.mfg_routings WHERE product_id = v_prod_id AND organization_id = v_org_id AND is_default = true LIMIT 1;
    IF v_routing_id IS NULL THEN
        INSERT INTO public.mfg_routings (product_id, name, is_default, organization_id)
        VALUES (v_prod_id, 'مسار تصنيع تورتة ريد فيلفت عالي 18', true, v_org_id)
        RETURNING id INTO v_routing_id;
    END IF;

    SELECT id INTO v_step_id FROM public.mfg_routing_steps WHERE routing_id = v_routing_id AND step_order = 1 LIMIT 1;
    IF v_step_id IS NULL THEN
        INSERT INTO public.mfg_routing_steps (routing_id, step_order, operation_name, standard_time_minutes, organization_id)
        VALUES (v_routing_id, 1, 'مرحلة التجهيز والتصنيع', 15, v_org_id)
        RETURNING id INTO v_step_id;
    END IF;

    -- تنظيف خامات المرحلة السابقة لتفادي التكرار
    DELETE FROM public.mfg_step_materials WHERE step_id = v_step_id;
    DELETE FROM public.bill_of_materials WHERE product_id = v_prod_id;

    -- المكون: ديسك م 18
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ديسك م 18' OR name ILIKE '%ديسك م 18%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ديسك م 18', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: كريمة تجليس ابيض
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس ابيض' OR name ILIKE '%كريمة تجليس ابيض%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس ابيض', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.15, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.15, v_org_id);

    -- المكون: جيلي فراولة
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'جيلي فراولة' OR name ILIKE '%جيلي فراولة%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('جيلي فراولة', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.2, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.2, v_org_id);

    -- المكون: كريمة تزيين
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تزيين' OR name ILIKE '%كريمة تزيين%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تزيين', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);


    -- ========================================================
    -- 🍰 تورتة فرحه م 18
    -- ========================================================
    SELECT id INTO v_prod_id FROM public.products WHERE organization_id = v_org_id AND name = 'تورتة فرحه م 18' LIMIT 1;
    IF v_prod_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تورتة فرحه م 18', 'MANUFACTURED', 'MANUFACTURED', 'قطعة', v_cat_torte, v_inv_fg, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_prod_id;
    END IF;

    -- مسار ومرحلة التصنيع في موديول التصنيع
    SELECT id INTO v_routing_id FROM public.mfg_routings WHERE product_id = v_prod_id AND organization_id = v_org_id AND is_default = true LIMIT 1;
    IF v_routing_id IS NULL THEN
        INSERT INTO public.mfg_routings (product_id, name, is_default, organization_id)
        VALUES (v_prod_id, 'مسار تصنيع تورتة فرحه م 18', true, v_org_id)
        RETURNING id INTO v_routing_id;
    END IF;

    SELECT id INTO v_step_id FROM public.mfg_routing_steps WHERE routing_id = v_routing_id AND step_order = 1 LIMIT 1;
    IF v_step_id IS NULL THEN
        INSERT INTO public.mfg_routing_steps (routing_id, step_order, operation_name, standard_time_minutes, organization_id)
        VALUES (v_routing_id, 1, 'مرحلة التجهيز والتصنيع', 15, v_org_id)
        RETURNING id INTO v_step_id;
    END IF;

    -- تنظيف خامات المرحلة السابقة لتفادي التكرار
    DELETE FROM public.mfg_step_materials WHERE step_id = v_step_id;
    DELETE FROM public.bill_of_materials WHERE product_id = v_prod_id;

    -- المكون: ديسك م 18
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ديسك م 18' OR name ILIKE '%ديسك م 18%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ديسك م 18', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: كريمة تجليس بني
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس بني' OR name ILIKE '%كريمة تجليس بني%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس بني', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.15, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.15, v_org_id);

    -- المكون: ميلك
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ميلك' OR name ILIKE '%ميلك%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ميلك', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.2, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.2, v_org_id);

    -- المكون: شوكولاتة مكعبات
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'شوكولاتة مكعبات' OR name ILIKE '%شوكولاتة مكعبات%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('شوكولاتة مكعبات', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: شوكولاتة كيندر
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'شوكولاتة كيندر' OR name ILIKE '%شوكولاتة كيندر%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('شوكولاتة كيندر', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 2, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 2, v_org_id);


    -- ========================================================
    -- 🍰 تورتة هاف روتانا
    -- ========================================================
    SELECT id INTO v_prod_id FROM public.products WHERE organization_id = v_org_id AND name = 'تورتة هاف روتانا' LIMIT 1;
    IF v_prod_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تورتة هاف روتانا', 'MANUFACTURED', 'MANUFACTURED', 'قطعة', v_cat_torte, v_inv_fg, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_prod_id;
    END IF;

    -- مسار ومرحلة التصنيع في موديول التصنيع
    SELECT id INTO v_routing_id FROM public.mfg_routings WHERE product_id = v_prod_id AND organization_id = v_org_id AND is_default = true LIMIT 1;
    IF v_routing_id IS NULL THEN
        INSERT INTO public.mfg_routings (product_id, name, is_default, organization_id)
        VALUES (v_prod_id, 'مسار تصنيع تورتة هاف روتانا', true, v_org_id)
        RETURNING id INTO v_routing_id;
    END IF;

    SELECT id INTO v_step_id FROM public.mfg_routing_steps WHERE routing_id = v_routing_id AND step_order = 1 LIMIT 1;
    IF v_step_id IS NULL THEN
        INSERT INTO public.mfg_routing_steps (routing_id, step_order, operation_name, standard_time_minutes, organization_id)
        VALUES (v_routing_id, 1, 'مرحلة التجهيز والتصنيع', 15, v_org_id)
        RETURNING id INTO v_step_id;
    END IF;

    -- تنظيف خامات المرحلة السابقة لتفادي التكرار
    DELETE FROM public.mfg_step_materials WHERE step_id = v_step_id;
    DELETE FROM public.bill_of_materials WHERE product_id = v_prod_id;

    -- المكون: اناناس
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'اناناس' OR name ILIKE '%اناناس%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('اناناس', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: مانجا
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'مانجا' OR name ILIKE '%مانجا%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('مانجا', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: تفاح اخضر
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'تفاح اخضر' OR name ILIKE '%تفاح اخضر%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تفاح اخضر', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: تفاح احمر
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'تفاح احمر' OR name ILIKE '%تفاح احمر%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تفاح احمر', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.15, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.15, v_org_id);

    -- المكون: شوكولاتة روشية
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'شوكولاتة روشية' OR name ILIKE '%شوكولاتة روشية%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('شوكولاتة روشية', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: جناش تزيين
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'جناش تزيين' OR name ILIKE '%جناش تزيين%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('جناش تزيين', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: ميلك
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ميلك' OR name ILIKE '%ميلك%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ميلك', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.2, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.2, v_org_id);

    -- المكون: ديسك م 28
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ديسك م 28' OR name ILIKE '%ديسك م 28%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ديسك م 28', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: كريمة تجليس ابيض
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس ابيض' OR name ILIKE '%كريمة تجليس ابيض%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس ابيض', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: كريمة تجليس بني
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس بني' OR name ILIKE '%كريمة تجليس بني%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس بني', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);


    -- ========================================================
    -- 🍰 تورتةاوريو عالي م 18
    -- ========================================================
    SELECT id INTO v_prod_id FROM public.products WHERE organization_id = v_org_id AND name = 'تورتةاوريو عالي م 18' LIMIT 1;
    IF v_prod_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تورتةاوريو عالي م 18', 'MANUFACTURED', 'MANUFACTURED', 'قطعة', v_cat_torte, v_inv_fg, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_prod_id;
    END IF;

    -- مسار ومرحلة التصنيع في موديول التصنيع
    SELECT id INTO v_routing_id FROM public.mfg_routings WHERE product_id = v_prod_id AND organization_id = v_org_id AND is_default = true LIMIT 1;
    IF v_routing_id IS NULL THEN
        INSERT INTO public.mfg_routings (product_id, name, is_default, organization_id)
        VALUES (v_prod_id, 'مسار تصنيع تورتةاوريو عالي م 18', true, v_org_id)
        RETURNING id INTO v_routing_id;
    END IF;

    SELECT id INTO v_step_id FROM public.mfg_routing_steps WHERE routing_id = v_routing_id AND step_order = 1 LIMIT 1;
    IF v_step_id IS NULL THEN
        INSERT INTO public.mfg_routing_steps (routing_id, step_order, operation_name, standard_time_minutes, organization_id)
        VALUES (v_routing_id, 1, 'مرحلة التجهيز والتصنيع', 15, v_org_id)
        RETURNING id INTO v_step_id;
    END IF;

    -- تنظيف خامات المرحلة السابقة لتفادي التكرار
    DELETE FROM public.mfg_step_materials WHERE step_id = v_step_id;
    DELETE FROM public.bill_of_materials WHERE product_id = v_prod_id;

    -- المكون: ديسك م 18
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ديسك م 18' OR name ILIKE '%ديسك م 18%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ديسك م 18', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: كريمة تجليس بني
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس بني' OR name ILIKE '%كريمة تجليس بني%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس بني', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.15, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.15, v_org_id);

    -- المكون: ميلك
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ميلك' OR name ILIKE '%ميلك%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ميلك', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.25, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.25, v_org_id);

    -- المكون: جناش تزيين
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'جناش تزيين' OR name ILIKE '%جناش تزيين%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('جناش تزيين', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.5, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.5, v_org_id);

    -- المكون: صوص كراميل
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'صوص كراميل' OR name ILIKE '%صوص كراميل%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('صوص كراميل', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.05, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.05, v_org_id);

    -- المكون: بسكوت اوريو اصلي
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'بسكوت اوريو اصلي' OR name ILIKE '%بسكوت اوريو اصلي%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('بسكوت اوريو اصلي', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.05, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.05, v_org_id);


    -- ========================================================
    -- 🍰 تورتة 20*30 هاف
    -- ========================================================
    SELECT id INTO v_prod_id FROM public.products WHERE organization_id = v_org_id AND name = 'تورتة 20*30 هاف' LIMIT 1;
    IF v_prod_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تورتة 20*30 هاف', 'MANUFACTURED', 'MANUFACTURED', 'قطعة', v_cat_torte, v_inv_fg, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_prod_id;
    END IF;

    -- مسار ومرحلة التصنيع في موديول التصنيع
    SELECT id INTO v_routing_id FROM public.mfg_routings WHERE product_id = v_prod_id AND organization_id = v_org_id AND is_default = true LIMIT 1;
    IF v_routing_id IS NULL THEN
        INSERT INTO public.mfg_routings (product_id, name, is_default, organization_id)
        VALUES (v_prod_id, 'مسار تصنيع تورتة 20*30 هاف', true, v_org_id)
        RETURNING id INTO v_routing_id;
    END IF;

    SELECT id INTO v_step_id FROM public.mfg_routing_steps WHERE routing_id = v_routing_id AND step_order = 1 LIMIT 1;
    IF v_step_id IS NULL THEN
        INSERT INTO public.mfg_routing_steps (routing_id, step_order, operation_name, standard_time_minutes, organization_id)
        VALUES (v_routing_id, 1, 'مرحلة التجهيز والتصنيع', 15, v_org_id)
        RETURNING id INTO v_step_id;
    END IF;

    -- تنظيف خامات المرحلة السابقة لتفادي التكرار
    DELETE FROM public.mfg_step_materials WHERE step_id = v_step_id;
    DELETE FROM public.bill_of_materials WHERE product_id = v_prod_id;

    -- المكون: ديسك م 30*30
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ديسك م 30*30' OR name ILIKE '%ديسك م 30*30%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ديسك م 30*30', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: كريمة تجليس بني
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس بني' OR name ILIKE '%كريمة تجليس بني%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس بني', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.15, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.15, v_org_id);

    -- المكون: كريمة تجليس ابيض
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس ابيض' OR name ILIKE '%كريمة تجليس ابيض%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس ابيض', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.15, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.15, v_org_id);

    -- المكون: جناش تزيين
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'جناش تزيين' OR name ILIKE '%جناش تزيين%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('جناش تزيين', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: ميلك
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ميلك' OR name ILIKE '%ميلك%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ميلك', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.25, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.25, v_org_id);

    -- المكون: بسكوت روشية
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'بسكوت روشية' OR name ILIKE '%بسكوت روشية%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('بسكوت روشية', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.5, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.5, v_org_id);

    -- المكون: توت احمر
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'توت احمر' OR name ILIKE '%توت احمر%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('توت احمر', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.01, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.01, v_org_id);

    -- المكون: مانجا
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'مانجا' OR name ILIKE '%مانجا%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('مانجا', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: اناناس
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'اناناس' OR name ILIKE '%اناناس%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('اناناس', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: تفاح احمر
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'تفاح احمر' OR name ILIKE '%تفاح احمر%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تفاح احمر', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: تفاح اخضر
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'تفاح اخضر' OR name ILIKE '%تفاح اخضر%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تفاح اخضر', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: كيوي
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كيوي' OR name ILIKE '%كيوي%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كيوي', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.05, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.05, v_org_id);

    -- المكون: برقوق
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'برقوق' OR name ILIKE '%برقوق%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('برقوق', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.05, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.05, v_org_id);


    -- ========================================================
    -- 🍰 تورتة هاف 18
    -- ========================================================
    SELECT id INTO v_prod_id FROM public.products WHERE organization_id = v_org_id AND name = 'تورتة هاف 18' LIMIT 1;
    IF v_prod_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تورتة هاف 18', 'MANUFACTURED', 'MANUFACTURED', 'قطعة', v_cat_torte, v_inv_fg, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_prod_id;
    END IF;

    -- مسار ومرحلة التصنيع في موديول التصنيع
    SELECT id INTO v_routing_id FROM public.mfg_routings WHERE product_id = v_prod_id AND organization_id = v_org_id AND is_default = true LIMIT 1;
    IF v_routing_id IS NULL THEN
        INSERT INTO public.mfg_routings (product_id, name, is_default, organization_id)
        VALUES (v_prod_id, 'مسار تصنيع تورتة هاف 18', true, v_org_id)
        RETURNING id INTO v_routing_id;
    END IF;

    SELECT id INTO v_step_id FROM public.mfg_routing_steps WHERE routing_id = v_routing_id AND step_order = 1 LIMIT 1;
    IF v_step_id IS NULL THEN
        INSERT INTO public.mfg_routing_steps (routing_id, step_order, operation_name, standard_time_minutes, organization_id)
        VALUES (v_routing_id, 1, 'مرحلة التجهيز والتصنيع', 15, v_org_id)
        RETURNING id INTO v_step_id;
    END IF;

    -- تنظيف خامات المرحلة السابقة لتفادي التكرار
    DELETE FROM public.mfg_step_materials WHERE step_id = v_step_id;
    DELETE FROM public.bill_of_materials WHERE product_id = v_prod_id;

    -- المكون: ديسك م 18
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ديسك م 18' OR name ILIKE '%ديسك م 18%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ديسك م 18', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: كريمة تجليس بني
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس بني' OR name ILIKE '%كريمة تجليس بني%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس بني', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.07, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.07, v_org_id);

    -- المكون: كريمة تجليس ابيض
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس ابيض' OR name ILIKE '%كريمة تجليس ابيض%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس ابيض', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.07, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.07, v_org_id);

    -- المكون: جناش تزيين
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'جناش تزيين' OR name ILIKE '%جناش تزيين%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('جناش تزيين', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.05, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.05, v_org_id);

    -- المكون: ميلك
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ميلك' OR name ILIKE '%ميلك%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ميلك', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.15, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.15, v_org_id);

    -- المكون: بسكوت مكعبات
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'بسكوت مكعبات' OR name ILIKE '%بسكوت مكعبات%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('بسكوت مكعبات', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: مانجا
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'مانجا' OR name ILIKE '%مانجا%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('مانجا', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: تفاح احمر
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'تفاح احمر' OR name ILIKE '%تفاح احمر%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تفاح احمر', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: تفاح اخضر
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'تفاح اخضر' OR name ILIKE '%تفاح اخضر%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تفاح اخضر', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: برقوق
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'برقوق' OR name ILIKE '%برقوق%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('برقوق', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.05, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.05, v_org_id);


    -- ========================================================
    -- 🍰 تورتة م 18 كراميل
    -- ========================================================
    SELECT id INTO v_prod_id FROM public.products WHERE organization_id = v_org_id AND name = 'تورتة م 18 كراميل' LIMIT 1;
    IF v_prod_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تورتة م 18 كراميل', 'MANUFACTURED', 'MANUFACTURED', 'قطعة', v_cat_torte, v_inv_fg, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_prod_id;
    END IF;

    -- مسار ومرحلة التصنيع في موديول التصنيع
    SELECT id INTO v_routing_id FROM public.mfg_routings WHERE product_id = v_prod_id AND organization_id = v_org_id AND is_default = true LIMIT 1;
    IF v_routing_id IS NULL THEN
        INSERT INTO public.mfg_routings (product_id, name, is_default, organization_id)
        VALUES (v_prod_id, 'مسار تصنيع تورتة م 18 كراميل', true, v_org_id)
        RETURNING id INTO v_routing_id;
    END IF;

    SELECT id INTO v_step_id FROM public.mfg_routing_steps WHERE routing_id = v_routing_id AND step_order = 1 LIMIT 1;
    IF v_step_id IS NULL THEN
        INSERT INTO public.mfg_routing_steps (routing_id, step_order, operation_name, standard_time_minutes, organization_id)
        VALUES (v_routing_id, 1, 'مرحلة التجهيز والتصنيع', 15, v_org_id)
        RETURNING id INTO v_step_id;
    END IF;

    -- تنظيف خامات المرحلة السابقة لتفادي التكرار
    DELETE FROM public.mfg_step_materials WHERE step_id = v_step_id;
    DELETE FROM public.bill_of_materials WHERE product_id = v_prod_id;

    -- المكون: ديسك م 18
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ديسك م 18' OR name ILIKE '%ديسك م 18%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ديسك م 18', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: كريمة تجليس بني
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس بني' OR name ILIKE '%كريمة تجليس بني%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس بني', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.15, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.15, v_org_id);

    -- المكون: جناش تزيين
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'جناش تزيين' OR name ILIKE '%جناش تزيين%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('جناش تزيين', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.025, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.025, v_org_id);

    -- المكون: بسكوت روشية
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'بسكوت روشية' OR name ILIKE '%بسكوت روشية%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('بسكوت روشية', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.5, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.5, v_org_id);

    -- المكون: صوص كراميل
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'صوص كراميل' OR name ILIKE '%صوص كراميل%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('صوص كراميل', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.2, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.2, v_org_id);


    -- ========================================================
    -- 🍰 تورتة م 18 روشية
    -- ========================================================
    SELECT id INTO v_prod_id FROM public.products WHERE organization_id = v_org_id AND name = 'تورتة م 18 روشية' LIMIT 1;
    IF v_prod_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تورتة م 18 روشية', 'MANUFACTURED', 'MANUFACTURED', 'قطعة', v_cat_torte, v_inv_fg, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_prod_id;
    END IF;

    -- مسار ومرحلة التصنيع في موديول التصنيع
    SELECT id INTO v_routing_id FROM public.mfg_routings WHERE product_id = v_prod_id AND organization_id = v_org_id AND is_default = true LIMIT 1;
    IF v_routing_id IS NULL THEN
        INSERT INTO public.mfg_routings (product_id, name, is_default, organization_id)
        VALUES (v_prod_id, 'مسار تصنيع تورتة م 18 روشية', true, v_org_id)
        RETURNING id INTO v_routing_id;
    END IF;

    SELECT id INTO v_step_id FROM public.mfg_routing_steps WHERE routing_id = v_routing_id AND step_order = 1 LIMIT 1;
    IF v_step_id IS NULL THEN
        INSERT INTO public.mfg_routing_steps (routing_id, step_order, operation_name, standard_time_minutes, organization_id)
        VALUES (v_routing_id, 1, 'مرحلة التجهيز والتصنيع', 15, v_org_id)
        RETURNING id INTO v_step_id;
    END IF;

    -- تنظيف خامات المرحلة السابقة لتفادي التكرار
    DELETE FROM public.mfg_step_materials WHERE step_id = v_step_id;
    DELETE FROM public.bill_of_materials WHERE product_id = v_prod_id;

    -- المكون: ديسك م 18
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ديسك م 18' OR name ILIKE '%ديسك م 18%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ديسك م 18', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: كريمة تجليس بني
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس بني' OR name ILIKE '%كريمة تجليس بني%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس بني', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.15, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.15, v_org_id);

    -- المكون: جناش تزيين
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'جناش تزيين' OR name ILIKE '%جناش تزيين%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('جناش تزيين', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.025, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.025, v_org_id);

    -- المكون: بسكوت روشية
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'بسكوت روشية' OR name ILIKE '%بسكوت روشية%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('بسكوت روشية', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 2, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 2, v_org_id);


    -- ========================================================
    -- 🍰 تورتة فرنسي م 24
    -- ========================================================
    SELECT id INTO v_prod_id FROM public.products WHERE organization_id = v_org_id AND name = 'تورتة فرنسي م 24' LIMIT 1;
    IF v_prod_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تورتة فرنسي م 24', 'MANUFACTURED', 'MANUFACTURED', 'قطعة', v_cat_torte, v_inv_fg, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_prod_id;
    END IF;

    -- مسار ومرحلة التصنيع في موديول التصنيع
    SELECT id INTO v_routing_id FROM public.mfg_routings WHERE product_id = v_prod_id AND organization_id = v_org_id AND is_default = true LIMIT 1;
    IF v_routing_id IS NULL THEN
        INSERT INTO public.mfg_routings (product_id, name, is_default, organization_id)
        VALUES (v_prod_id, 'مسار تصنيع تورتة فرنسي م 24', true, v_org_id)
        RETURNING id INTO v_routing_id;
    END IF;

    SELECT id INTO v_step_id FROM public.mfg_routing_steps WHERE routing_id = v_routing_id AND step_order = 1 LIMIT 1;
    IF v_step_id IS NULL THEN
        INSERT INTO public.mfg_routing_steps (routing_id, step_order, operation_name, standard_time_minutes, organization_id)
        VALUES (v_routing_id, 1, 'مرحلة التجهيز والتصنيع', 15, v_org_id)
        RETURNING id INTO v_step_id;
    END IF;

    -- تنظيف خامات المرحلة السابقة لتفادي التكرار
    DELETE FROM public.mfg_step_materials WHERE step_id = v_step_id;
    DELETE FROM public.bill_of_materials WHERE product_id = v_prod_id;

    -- المكون: ديسك م 24
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ديسك م 24' OR name ILIKE '%ديسك م 24%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ديسك م 24', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: كريمة تجليس بني
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس بني' OR name ILIKE '%كريمة تجليس بني%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس بني', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.18, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.18, v_org_id);

    -- المكون: جناش تزيين
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'جناش تزيين' OR name ILIKE '%جناش تزيين%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('جناش تزيين', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.05, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.05, v_org_id);

    -- المكون: بسكوت روشية
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'بسكوت روشية' OR name ILIKE '%بسكوت روشية%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('بسكوت روشية', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 2, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 2, v_org_id);


    -- ========================================================
    -- 🍰 تورتة 25*25 فور سيزون
    -- ========================================================
    SELECT id INTO v_prod_id FROM public.products WHERE organization_id = v_org_id AND name = 'تورتة 25*25 فور سيزون' LIMIT 1;
    IF v_prod_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تورتة 25*25 فور سيزون', 'MANUFACTURED', 'MANUFACTURED', 'قطعة', v_cat_torte, v_inv_fg, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_prod_id;
    END IF;

    -- مسار ومرحلة التصنيع في موديول التصنيع
    SELECT id INTO v_routing_id FROM public.mfg_routings WHERE product_id = v_prod_id AND organization_id = v_org_id AND is_default = true LIMIT 1;
    IF v_routing_id IS NULL THEN
        INSERT INTO public.mfg_routings (product_id, name, is_default, organization_id)
        VALUES (v_prod_id, 'مسار تصنيع تورتة 25*25 فور سيزون', true, v_org_id)
        RETURNING id INTO v_routing_id;
    END IF;

    SELECT id INTO v_step_id FROM public.mfg_routing_steps WHERE routing_id = v_routing_id AND step_order = 1 LIMIT 1;
    IF v_step_id IS NULL THEN
        INSERT INTO public.mfg_routing_steps (routing_id, step_order, operation_name, standard_time_minutes, organization_id)
        VALUES (v_routing_id, 1, 'مرحلة التجهيز والتصنيع', 15, v_org_id)
        RETURNING id INTO v_step_id;
    END IF;

    -- تنظيف خامات المرحلة السابقة لتفادي التكرار
    DELETE FROM public.mfg_step_materials WHERE step_id = v_step_id;
    DELETE FROM public.bill_of_materials WHERE product_id = v_prod_id;

    -- المكون: ديسك م 25*25
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ديسك م 25*25' OR name ILIKE '%ديسك م 25*25%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ديسك م 25*25', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: كريمة تجليس بني
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس بني' OR name ILIKE '%كريمة تجليس بني%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس بني', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.25, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.25, v_org_id);

    -- المكون: جناش تزيين
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'جناش تزيين' OR name ILIKE '%جناش تزيين%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('جناش تزيين', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.2, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.2, v_org_id);

    -- المكون: صوص كراميل
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'صوص كراميل' OR name ILIKE '%صوص كراميل%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('صوص كراميل', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: سبريد لوتس
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'سبريد لوتس' OR name ILIKE '%سبريد لوتس%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('سبريد لوتس', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: صوص فراولة
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'صوص فراولة' OR name ILIKE '%صوص فراولة%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('صوص فراولة', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: نوتيلا
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'نوتيلا' OR name ILIKE '%نوتيلا%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('نوتيلا', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);

    -- المكون: بسكون اوريو
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'بسكون اوريو' OR name ILIKE '%بسكون اوريو%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('بسكون اوريو', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.015, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.015, v_org_id);

    -- المكون: بسكوت لوتس
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'بسكوت لوتس' OR name ILIKE '%بسكوت لوتس%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('بسكوت لوتس', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.025, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.025, v_org_id);

    -- المكون: عين جمل
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'عين جمل' OR name ILIKE '%عين جمل%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('عين جمل', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.01, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.01, v_org_id);


    -- ========================================================
    -- 🍰 تورتة كراميل عين جمل م 24
    -- ========================================================
    SELECT id INTO v_prod_id FROM public.products WHERE organization_id = v_org_id AND name = 'تورتة كراميل عين جمل م 24' LIMIT 1;
    IF v_prod_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تورتة كراميل عين جمل م 24', 'MANUFACTURED', 'MANUFACTURED', 'قطعة', v_cat_torte, v_inv_fg, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_prod_id;
    END IF;

    -- مسار ومرحلة التصنيع في موديول التصنيع
    SELECT id INTO v_routing_id FROM public.mfg_routings WHERE product_id = v_prod_id AND organization_id = v_org_id AND is_default = true LIMIT 1;
    IF v_routing_id IS NULL THEN
        INSERT INTO public.mfg_routings (product_id, name, is_default, organization_id)
        VALUES (v_prod_id, 'مسار تصنيع تورتة كراميل عين جمل م 24', true, v_org_id)
        RETURNING id INTO v_routing_id;
    END IF;

    SELECT id INTO v_step_id FROM public.mfg_routing_steps WHERE routing_id = v_routing_id AND step_order = 1 LIMIT 1;
    IF v_step_id IS NULL THEN
        INSERT INTO public.mfg_routing_steps (routing_id, step_order, operation_name, standard_time_minutes, organization_id)
        VALUES (v_routing_id, 1, 'مرحلة التجهيز والتصنيع', 15, v_org_id)
        RETURNING id INTO v_step_id;
    END IF;

    -- تنظيف خامات المرحلة السابقة لتفادي التكرار
    DELETE FROM public.mfg_step_materials WHERE step_id = v_step_id;
    DELETE FROM public.bill_of_materials WHERE product_id = v_prod_id;

    -- المكون: ديسك م 24
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ديسك م 24' OR name ILIKE '%ديسك م 24%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ديسك م 24', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: كريمة تجليس بني
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس بني' OR name ILIKE '%كريمة تجليس بني%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس بني', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.18, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.18, v_org_id);

    -- المكون: جناش تزيين
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'جناش تزيين' OR name ILIKE '%جناش تزيين%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('جناش تزيين', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.05, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.05, v_org_id);

    -- المكون: بسكوت روشية
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'بسكوت روشية' OR name ILIKE '%بسكوت روشية%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('بسكوت روشية', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 2, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 2, v_org_id);

    -- المكون: صوص كراميل
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'صوص كراميل' OR name ILIKE '%صوص كراميل%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('صوص كراميل', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.25, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.25, v_org_id);

    -- المكون: مكسرات
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'مكسرات' OR name ILIKE '%مكسرات%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('مكسرات', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.15, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.15, v_org_id);


    -- ========================================================
    -- 🍰 تورتة فادج م 24
    -- ========================================================
    SELECT id INTO v_prod_id FROM public.products WHERE organization_id = v_org_id AND name = 'تورتة فادج م 24' LIMIT 1;
    IF v_prod_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تورتة فادج م 24', 'MANUFACTURED', 'MANUFACTURED', 'قطعة', v_cat_torte, v_inv_fg, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_prod_id;
    END IF;

    -- مسار ومرحلة التصنيع في موديول التصنيع
    SELECT id INTO v_routing_id FROM public.mfg_routings WHERE product_id = v_prod_id AND organization_id = v_org_id AND is_default = true LIMIT 1;
    IF v_routing_id IS NULL THEN
        INSERT INTO public.mfg_routings (product_id, name, is_default, organization_id)
        VALUES (v_prod_id, 'مسار تصنيع تورتة فادج م 24', true, v_org_id)
        RETURNING id INTO v_routing_id;
    END IF;

    SELECT id INTO v_step_id FROM public.mfg_routing_steps WHERE routing_id = v_routing_id AND step_order = 1 LIMIT 1;
    IF v_step_id IS NULL THEN
        INSERT INTO public.mfg_routing_steps (routing_id, step_order, operation_name, standard_time_minutes, organization_id)
        VALUES (v_routing_id, 1, 'مرحلة التجهيز والتصنيع', 15, v_org_id)
        RETURNING id INTO v_step_id;
    END IF;

    -- تنظيف خامات المرحلة السابقة لتفادي التكرار
    DELETE FROM public.mfg_step_materials WHERE step_id = v_step_id;
    DELETE FROM public.bill_of_materials WHERE product_id = v_prod_id;

    -- المكون: ديسك م 24
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ديسك م 24' OR name ILIKE '%ديسك م 24%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ديسك م 24', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: كريمة تجليس بني
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس بني' OR name ILIKE '%كريمة تجليس بني%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس بني', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.18, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.18, v_org_id);

    -- المكون: شوكولاتة كيت كات
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'شوكولاتة كيت كات' OR name ILIKE '%شوكولاتة كيت كات%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('شوكولاتة كيت كات', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 4, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 4, v_org_id);

    -- المكون: ميلك
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ميلك' OR name ILIKE '%ميلك%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ميلك', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.25, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.25, v_org_id);

    -- المكون: صوص نوتيلا
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'صوص نوتيلا' OR name ILIKE '%صوص نوتيلا%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('صوص نوتيلا', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.1, v_org_id);


    -- ========================================================
    -- 🍰 تورتة قلب شوكولاتة م 28
    -- ========================================================
    SELECT id INTO v_prod_id FROM public.products WHERE organization_id = v_org_id AND name = 'تورتة قلب شوكولاتة م 28' LIMIT 1;
    IF v_prod_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('تورتة قلب شوكولاتة م 28', 'MANUFACTURED', 'MANUFACTURED', 'قطعة', v_cat_torte, v_inv_fg, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_prod_id;
    END IF;

    -- مسار ومرحلة التصنيع في موديول التصنيع
    SELECT id INTO v_routing_id FROM public.mfg_routings WHERE product_id = v_prod_id AND organization_id = v_org_id AND is_default = true LIMIT 1;
    IF v_routing_id IS NULL THEN
        INSERT INTO public.mfg_routings (product_id, name, is_default, organization_id)
        VALUES (v_prod_id, 'مسار تصنيع تورتة قلب شوكولاتة م 28', true, v_org_id)
        RETURNING id INTO v_routing_id;
    END IF;

    SELECT id INTO v_step_id FROM public.mfg_routing_steps WHERE routing_id = v_routing_id AND step_order = 1 LIMIT 1;
    IF v_step_id IS NULL THEN
        INSERT INTO public.mfg_routing_steps (routing_id, step_order, operation_name, standard_time_minutes, organization_id)
        VALUES (v_routing_id, 1, 'مرحلة التجهيز والتصنيع', 15, v_org_id)
        RETURNING id INTO v_step_id;
    END IF;

    -- تنظيف خامات المرحلة السابقة لتفادي التكرار
    DELETE FROM public.mfg_step_materials WHERE step_id = v_step_id;
    DELETE FROM public.bill_of_materials WHERE product_id = v_prod_id;

    -- المكون: ديسك م 28
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'ديسك م 28' OR name ILIKE '%ديسك م 28%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('ديسك م 28', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 1, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 1, v_org_id);

    -- المكون: كريمة تجليس بني
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'كريمة تجليس بني' OR name ILIKE '%كريمة تجليس بني%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('كريمة تجليس بني', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.2, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.2, v_org_id);

    -- المكون: بسكوت روشية
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'بسكوت روشية' OR name ILIKE '%بسكوت روشية%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('بسكوت روشية', 'RAW_MATERIAL', 'RAW_MATERIAL', 'عدد', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 2, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 2, v_org_id);

    -- المكون: جناش تزيين
    SELECT id INTO v_mat_id FROM public.products WHERE organization_id = v_org_id AND (name = 'جناش تزيين' OR name ILIKE '%جناش تزيين%') LIMIT 1;
    IF v_mat_id IS NULL THEN
        INSERT INTO public.products (name, product_type, item_type, unit, category_id, inventory_account_id, cogs_account_id, sales_account_id, organization_id, is_active)
        VALUES ('جناش تزيين', 'RAW_MATERIAL', 'RAW_MATERIAL', 'كجم', v_cat_raw, v_inv_raw, v_cogs, v_sales, v_org_id, true)
        RETURNING id INTO v_mat_id;
    END IF;
    -- إضافة إلى شجرة المكونات BOM ومرحلة التصنيع
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_prod_id, v_mat_id, 0.05, v_org_id);
    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_mat_id, 0.05, v_org_id);


    RAISE NOTICE '✅ تم بنجاح إدخال وصفات ومسارات ومراحل الـ 30 تورتة بنجاح!';
END $$;
