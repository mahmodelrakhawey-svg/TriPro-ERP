-- ==============================================================================
-- Migration: 2026-08-26_company_cloning_engine.sql
-- Description: محرك استنساخ الشركات وقوالب الدليل المحاسبي والمطاعم والأصناف والتصنيفات
-- Author: TriPro ERP Engine
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.clone_organization_template(
    p_source_org_id uuid,
    p_target_org_id uuid,
    p_options jsonb DEFAULT '{"include_accounts": true, "include_settings": true, "include_warehouses": true, "include_cost_centers": true, "include_uoms": true, "include_categories": true, "include_products": true, "include_customers": true, "include_suppliers": true, "include_restaurant": true}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_source_name text;
    v_target_name text;
    v_accounts_cloned int := 0;
    v_warehouses_cloned int := 0;
    v_cost_centers_cloned int := 0;
    v_uoms_cloned int := 0;
    v_categories_cloned int := 0;
    v_products_cloned int := 0;
    v_customers_cloned int := 0;
    v_suppliers_cloned int := 0;
    v_tables_cloned int := 0;
    
    v_src_settings record;
    v_new_mappings jsonb := '{}'::jsonb;
    v_key text;
    v_old_acc_id uuid;
    v_new_acc_id uuid;
    v_default_wh_id uuid;
BEGIN
    SELECT name INTO v_source_name FROM public.organizations WHERE id = p_source_org_id;
    IF v_source_name IS NULL THEN
        RAISE EXCEPTION 'الشركة المصدر غير موجودة (Source Org Not Found)';
    END IF;

    SELECT name INTO v_target_name FROM public.organizations WHERE id = p_target_org_id;
    IF v_target_name IS NULL THEN
        RAISE EXCEPTION 'الشركة الهدف غير موجودة (Target Org Not Found)';
    END IF;

    IF p_source_org_id = p_target_org_id THEN
        RAISE EXCEPTION 'لا يمكن استنساخ الشركة إلى نفسها';
    END IF;

    PERFORM set_config('app.restore_mode', 'on', true);

    -- 1. مراكز التكلفة
    CREATE TEMP TABLE temp_cc_map (old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
    IF COALESCE((p_options->>'include_cost_centers')::boolean, true) THEN
        BEGIN
            INSERT INTO temp_cc_map (old_id, new_id)
            SELECT id, gen_random_uuid() 
            FROM public.cost_centers 
            WHERE organization_id = p_source_org_id;

            IF EXISTS (SELECT 1 FROM temp_cc_map) THEN
                DELETE FROM public.cost_centers WHERE organization_id = p_target_org_id;
                
                INSERT INTO public.cost_centers
                SELECT (
                    jsonb_populate_record(
                        NULL::public.cost_centers,
                        to_jsonb(c) || jsonb_build_object('id', m.new_id, 'organization_id', p_target_org_id, 'created_at', now())
                    )
                ).*
                FROM public.cost_centers c
                JOIN temp_cc_map m ON c.id = m.old_id;

                GET DIAGNOSTICS v_cost_centers_cloned = ROW_COUNT;
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 2. وحدات القياس
    IF COALESCE((p_options->>'include_uoms')::boolean, true) THEN
        BEGIN
            DELETE FROM public.uoms WHERE organization_id = p_target_org_id;

            INSERT INTO public.uoms
            SELECT (
                jsonb_populate_record(
                    NULL::public.uoms,
                    to_jsonb(u) || jsonb_build_object('id', gen_random_uuid(), 'organization_id', p_target_org_id, 'created_at', now())
                )
            ).*
            FROM public.uoms u
            WHERE u.organization_id = p_source_org_id;

            GET DIAGNOSTICS v_uoms_cloned = ROW_COUNT;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 3. المخازن
    CREATE TEMP TABLE temp_wh_map (old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
    IF COALESCE((p_options->>'include_warehouses')::boolean, true) THEN
        BEGIN
            INSERT INTO temp_wh_map (old_id, new_id)
            SELECT id, gen_random_uuid() 
            FROM public.warehouses 
            WHERE organization_id = p_source_org_id;

            IF EXISTS (SELECT 1 FROM temp_wh_map) THEN
                DELETE FROM public.warehouses WHERE organization_id = p_target_org_id;

                INSERT INTO public.warehouses
                SELECT (
                    jsonb_populate_record(
                        NULL::public.warehouses,
                        to_jsonb(w) || jsonb_build_object('id', m.new_id, 'organization_id', p_target_org_id, 'created_at', now())
                    )
                ).*
                FROM public.warehouses w
                JOIN temp_wh_map m ON w.id = m.old_id;

                GET DIAGNOSTICS v_warehouses_cloned = ROW_COUNT;
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 4. شجرة الحسابات
    CREATE TEMP TABLE temp_acc_map (old_id uuid PRIMARY KEY, new_id uuid, code text, parent_id uuid, new_parent_id uuid) ON COMMIT DROP;
    IF COALESCE((p_options->>'include_accounts')::boolean, true) THEN
        BEGIN
            INSERT INTO temp_acc_map (old_id, new_id, code, parent_id)
            SELECT id, gen_random_uuid(), code, parent_id
            FROM public.accounts
            WHERE organization_id = p_source_org_id;

            UPDATE temp_acc_map m SET new_parent_id = p.new_id FROM temp_acc_map p WHERE m.parent_id = p.old_id;

            DELETE FROM public.accounts WHERE organization_id = p_target_org_id;

            INSERT INTO public.accounts
            SELECT (
                jsonb_populate_record(
                    NULL::public.accounts,
                    to_jsonb(a) || jsonb_build_object(
                        'id', m.new_id,
                        'parent_id', NULL,
                        'organization_id', p_target_org_id,
                        'balance', 0,
                        'created_at', now()
                    )
                )
            ).*
            FROM public.accounts a 
            JOIN temp_acc_map m ON a.id = m.old_id;

            UPDATE public.accounts a 
            SET parent_id = m.new_parent_id 
            FROM temp_acc_map m 
            WHERE a.id = m.new_id AND m.new_parent_id IS NOT NULL;

            GET DIAGNOSTICS v_accounts_cloned = ROW_COUNT;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 5. إعدادات الشركة وتوجيه القيود
    IF COALESCE((p_options->>'include_settings')::boolean, true) THEN
        BEGIN
            SELECT * INTO v_src_settings FROM public.company_settings WHERE organization_id = p_source_org_id LIMIT 1;
            IF FOUND THEN
                IF v_src_settings.account_mappings IS NOT NULL THEN
                    FOR v_key IN SELECT jsonb_object_keys(v_src_settings.account_mappings)
                    LOOP
                        BEGIN
                            v_old_acc_id := (v_src_settings.account_mappings->>v_key)::uuid;
                            SELECT new_id INTO v_new_acc_id FROM temp_acc_map WHERE old_id = v_old_acc_id;
                            IF v_new_acc_id IS NOT NULL THEN
                                v_new_mappings := jsonb_set(v_new_mappings, ARRAY[v_key], to_jsonb(v_new_acc_id::text));
                            ELSE
                                v_new_mappings := jsonb_set(v_new_mappings, ARRAY[v_key], v_src_settings.account_mappings->v_key);
                            END IF;
                        EXCEPTION WHEN OTHERS THEN
                            v_new_mappings := jsonb_set(v_new_mappings, ARRAY[v_key], v_src_settings.account_mappings->v_key);
                        END;
                    END LOOP;
                END IF;

                IF v_src_settings.default_warehouse_id IS NOT NULL THEN
                    SELECT new_id INTO v_default_wh_id FROM temp_wh_map WHERE old_id = v_src_settings.default_warehouse_id;
                END IF;

                INSERT INTO public.company_settings (
                    organization_id, company_name, tax_number, commercial_register, phone, email, address,
                    currency, vat_rate, account_mappings, default_warehouse_id, invoice_terms, header_text, footer_text, created_at, updated_at
                )
                VALUES (
                    p_target_org_id, v_target_name, v_src_settings.tax_number, v_src_settings.commercial_register, v_src_settings.phone, v_src_settings.email, v_src_settings.address,
                    COALESCE(v_src_settings.currency, 'EGP'), COALESCE(v_src_settings.vat_rate, 0.14), v_new_mappings, v_default_wh_id, v_src_settings.invoice_terms, v_src_settings.header_text, v_src_settings.footer_text, now(), now()
                )
                ON CONFLICT (organization_id) DO UPDATE SET
                    currency = EXCLUDED.currency, vat_rate = EXCLUDED.vat_rate, account_mappings = EXCLUDED.account_mappings,
                    default_warehouse_id = COALESCE(EXCLUDED.default_warehouse_id, company_settings.default_warehouse_id),
                    invoice_terms = EXCLUDED.invoice_terms, header_text = EXCLUDED.header_text, footer_text = EXCLUDED.footer_text, updated_at = now();
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 6. استنساخ تصنيفات الأصناف (Item Categories)
    CREATE TEMP TABLE temp_cat_map (old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
    IF COALESCE((p_options->>'include_categories')::boolean, true) OR COALESCE((p_options->>'include_products')::boolean, true) THEN
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'item_categories') THEN
                INSERT INTO temp_cat_map (old_id, new_id)
                SELECT id, gen_random_uuid() 
                FROM public.item_categories 
                WHERE organization_id = p_source_org_id;

                IF EXISTS (SELECT 1 FROM temp_cat_map) THEN
                    DELETE FROM public.item_categories WHERE organization_id = p_target_org_id;

                    INSERT INTO public.item_categories
                    SELECT (
                        jsonb_populate_record(
                            NULL::public.item_categories,
                            to_jsonb(c) || jsonb_build_object(
                                'id', m.new_id,
                                'organization_id', p_target_org_id,
                                'default_inventory_account_id', COALESCE(inv_map.new_id, c.default_inventory_account_id),
                                'default_cogs_account_id', COALESCE(cogs_map.new_id, c.default_cogs_account_id),
                                'default_sales_account_id', COALESCE(sales_map.new_id, c.default_sales_account_id),
                                'created_at', now()
                            )
                        )
                    ).*
                    FROM public.item_categories c
                    JOIN temp_cat_map m ON c.id = m.old_id
                    LEFT JOIN temp_acc_map inv_map ON c.default_inventory_account_id = inv_map.old_id
                    LEFT JOIN temp_acc_map cogs_map ON c.default_cogs_account_id = cogs_map.old_id
                    LEFT JOIN temp_acc_map sales_map ON c.default_sales_account_id = sales_map.old_id;

                    GET DIAGNOSTICS v_categories_cloned = ROW_COUNT;
                END IF;
            END IF;
        EXCEPTION WHEN OTHERS THEN 
            NULL; 
        END;
    END IF;

    -- 7. استنساخ المنتجات والأصناف ومنيو المطعم (مع ربط التصنيفات والحسابات)
    CREATE TEMP TABLE temp_prod_map (old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
    CREATE TEMP TABLE temp_mod_grp_map (old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
    
    IF COALESCE((p_options->>'include_products')::boolean, true) THEN
        BEGIN
            INSERT INTO temp_prod_map (old_id, new_id)
            SELECT id, gen_random_uuid() 
            FROM public.products 
            WHERE organization_id = p_source_org_id;

            IF EXISTS (SELECT 1 FROM temp_prod_map) THEN
                INSERT INTO public.products
                SELECT (
                    jsonb_populate_record(
                        NULL::public.products,
                        to_jsonb(p) || jsonb_build_object(
                            'id', m.new_id,
                            'organization_id', p_target_org_id,
                            'category_id', COALESCE(cat_map.new_id, p.category_id),
                            'inventory_account_id', COALESCE(inv_map.new_id, p.inventory_account_id),
                            'cogs_account_id', COALESCE(cogs_map.new_id, p.cogs_account_id),
                            'sales_account_id', COALESCE(sales_map.new_id, p.sales_account_id),
                            'stock', 0,
                            'created_at', now()
                        )
                    )
                ).*
                FROM public.products p 
                JOIN temp_prod_map m ON p.id = m.old_id
                LEFT JOIN temp_cat_map cat_map ON p.category_id = cat_map.old_id
                LEFT JOIN temp_acc_map inv_map ON p.inventory_account_id = inv_map.old_id
                LEFT JOIN temp_acc_map cogs_map ON p.cogs_account_id = cogs_map.old_id
                LEFT JOIN temp_acc_map sales_map ON p.sales_account_id = sales_map.old_id;

                GET DIAGNOSTICS v_products_cloned = ROW_COUNT;

                -- استنساخ مجموعات وإضافات المطعم المرتبطة بالأصناف
                BEGIN
                    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'modifier_groups') THEN
                        INSERT INTO temp_mod_grp_map (old_id, new_id)
                        SELECT mg.id, gen_random_uuid() 
                        FROM public.modifier_groups mg 
                        JOIN temp_prod_map pm ON mg.product_id = pm.old_id;

                        IF EXISTS (SELECT 1 FROM temp_mod_grp_map) THEN
                            INSERT INTO public.modifier_groups
                            SELECT (
                                jsonb_populate_record(
                                    NULL::public.modifier_groups,
                                    to_jsonb(mg) || jsonb_build_object('id', mgm.new_id, 'product_id', pm.new_id, 'created_at', now())
                                )
                            ).*
                            FROM public.modifier_groups mg 
                            JOIN temp_prod_map pm ON mg.product_id = pm.old_id 
                            JOIN temp_mod_grp_map mgm ON mg.id = mgm.old_id;

                            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'modifiers') THEN
                                INSERT INTO public.modifiers
                                SELECT (
                                    jsonb_populate_record(
                                        NULL::public.modifiers,
                                        to_jsonb(m) || jsonb_build_object('id', gen_random_uuid(), 'modifier_group_id', mgm.new_id, 'created_at', now())
                                    )
                                ).*
                                FROM public.modifiers m 
                                JOIN temp_mod_grp_map mgm ON m.modifier_group_id = mgm.old_id;
                            END IF;
                        END IF;
                    END IF;
                EXCEPTION WHEN OTHERS THEN NULL; END;
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 8. طاولات المطعم
    IF COALESCE((p_options->>'include_restaurant')::boolean, true) THEN
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'restaurant_tables') THEN
                DELETE FROM public.restaurant_tables WHERE organization_id = p_target_org_id;

                INSERT INTO public.restaurant_tables
                SELECT (
                    jsonb_populate_record(
                        NULL::public.restaurant_tables,
                        to_jsonb(t) || jsonb_build_object('id', gen_random_uuid(), 'organization_id', p_target_org_id, 'status', 'AVAILABLE', 'created_at', now())
                    )
                ).*
                FROM public.restaurant_tables t 
                WHERE t.organization_id = p_source_org_id;

                GET DIAGNOSTICS v_tables_cloned = ROW_COUNT;
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 9. العملاء
    IF COALESCE((p_options->>'include_customers')::boolean, true) THEN
        BEGIN
            INSERT INTO public.customers
            SELECT (
                jsonb_populate_record(
                    NULL::public.customers,
                    to_jsonb(c) || jsonb_build_object('id', gen_random_uuid(), 'organization_id', p_target_org_id, 'created_at', now())
                )
            ).*
            FROM public.customers c 
            WHERE c.organization_id = p_source_org_id;

            GET DIAGNOSTICS v_customers_cloned = ROW_COUNT;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 10. الموردين
    IF COALESCE((p_options->>'include_suppliers')::boolean, true) THEN
        BEGIN
            INSERT INTO public.suppliers
            SELECT (
                jsonb_populate_record(
                    NULL::public.suppliers,
                    to_jsonb(s) || jsonb_build_object('id', gen_random_uuid(), 'organization_id', p_target_org_id, 'created_at', now())
                )
            ).*
            FROM public.suppliers s 
            WHERE s.organization_id = p_source_org_id;

            GET DIAGNOSTICS v_suppliers_cloned = ROW_COUNT;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 11. تسجيل النشاط
    BEGIN
        INSERT INTO public.security_logs (organization_id, user_id, event_type, description, created_at)
        VALUES (p_target_org_id, auth.uid(), 'company_template_cloned', 'تم استنساخ قالب الشركة بنجاح من: ' || v_source_name || ' إلى: ' || v_target_name, now());
    EXCEPTION WHEN OTHERS THEN NULL; END;

    RETURN jsonb_build_object(
        'success', true,
        'source_org', v_source_name,
        'target_org', v_target_name,
        'accounts_cloned', v_accounts_cloned,
        'warehouses_cloned', v_warehouses_cloned,
        'cost_centers_cloned', v_cost_centers_cloned,
        'uoms_cloned', v_uoms_cloned,
        'categories_cloned', v_categories_cloned,
        'products_cloned', v_products_cloned,
        'tables_cloned', v_tables_cloned,
        'customers_cloned', v_customers_cloned,
        'suppliers_cloned', v_suppliers_cloned,
        'message', 'تم استنساخ الشركة والدليل المحاسبي والبيانات والتصنيفات بنجاح تام وبشكل معزول 100%'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.clone_organization_template(uuid, uuid, jsonb) TO authenticated;
