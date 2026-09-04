-- ==============================================================================
-- 🏦 سكريبت إنشاء حسابات خطابات الضمان والاعتمادات المستندية والمستخلصات
-- TriPro ERP — services/migrations/seed_missing_guarantee_and_lc_accounts.sql
-- ==============================================================================
-- يقوم هذا السكربت بإنشاء وتأكيد وجود كافة الحسابات التخصصية في شجرة الحسابات (دليل الحسابات)
-- لكافة الشركات الموجودة في قاعدة البيانات، لربطها تلقائياً في شاشة توجيه الحسابات الآلي.
-- ==============================================================================

DO $$
DECLARE
    r RECORD;
    v_asset_12_id UUID;
    v_asset_124_id UUID;
    v_asset_122_id UUID;
    v_liab_22_id UUID;
    v_rev_41_id UUID;
    v_rev_42_id UUID;
BEGIN
    FOR r IN SELECT id FROM public.organizations LOOP
        -- 1. التأكد من وجود الحسابات الأب
        SELECT id INTO v_asset_12_id FROM public.accounts WHERE organization_id = r.id AND code = '12' LIMIT 1;
        SELECT id INTO v_asset_124_id FROM public.accounts WHERE organization_id = r.id AND code = '124' LIMIT 1;
        SELECT id INTO v_asset_122_id FROM public.accounts WHERE organization_id = r.id AND code = '122' LIMIT 1;
        SELECT id INTO v_liab_22_id FROM public.accounts WHERE organization_id = r.id AND code = '22' LIMIT 1;
        SELECT id INTO v_rev_41_id FROM public.accounts WHERE organization_id = r.id AND code = '41' LIMIT 1;
        SELECT id INTO v_rev_42_id FROM public.accounts WHERE organization_id = r.id AND code = '42' LIMIT 1;

        -- 2. إنشاء حساب 1248: غطاء خطابات ضمان لدى البنوك
        INSERT INTO public.accounts (organization_id, code, name, type, is_group, parent_id, is_active)
        VALUES (r.id, '1248', 'غطاء خطابات ضمان لدى البنوك', 'asset', false, v_asset_124_id, true)
        ON CONFLICT (organization_id, code) DO UPDATE SET name = EXCLUDED.name, is_active = true;

        -- 3. إنشاء حساب 1246: اعتمادات مستندية لشراء بضائع
        INSERT INTO public.accounts (organization_id, code, name, type, is_group, parent_id, is_active)
        VALUES (r.id, '1246', 'اعتمادات مستندية لشراء بضائع', 'asset', false, v_asset_124_id, true)
        ON CONFLICT (organization_id, code) DO UPDATE SET name = EXCLUDED.name, is_active = true;

        -- 4. إنشاء حساب 1249: محتجز ضمان لدى الغير (عملاء)
        INSERT INTO public.accounts (organization_id, code, name, type, is_group, parent_id, is_active)
        VALUES (r.id, '1249', 'محتجز ضمان لدى الغير (عملاء)', 'asset', false, v_asset_124_id, true)
        ON CONFLICT (organization_id, code) DO UPDATE SET name = EXCLUDED.name, is_active = true;

        -- 5. إنشاء حساب 1245: دفعات مقدمة للمقاولين والموردين
        INSERT INTO public.accounts (organization_id, code, name, type, is_group, parent_id, is_active)
        VALUES (r.id, '1245', 'دفعات مقدمة للمقاولين والموردين', 'asset', false, v_asset_124_id, true)
        ON CONFLICT (organization_id, code) DO UPDATE SET name = EXCLUDED.name, is_active = true;

        -- 6. إنشاء حساب 2229: محتجز ضمان لمقاولي الباطن
        INSERT INTO public.accounts (organization_id, code, name, type, is_group, parent_id, is_active)
        VALUES (r.id, '2229', 'محتجز ضمان لمقاولي الباطن', 'liability', false, v_liab_22_id, true)
        ON CONFLICT (organization_id, code) DO UPDATE SET name = EXCLUDED.name, is_active = true;

        -- 7. إنشاء حساب 425: إيراد تشغيل معدات داخلي
        INSERT INTO public.accounts (organization_id, code, name, type, is_group, parent_id, is_active)
        VALUES (r.id, '425', 'إيراد تشغيل معدات داخلي', 'revenue', false, v_rev_42_id, true)
        ON CONFLICT (organization_id, code) DO UPDATE SET name = EXCLUDED.name, is_active = true;

        -- 8. إنشاء حساب 441: زيادة الصندوق (إيرادات متنوعة)
        INSERT INTO public.accounts (organization_id, code, name, type, is_group, parent_id, is_active)
        VALUES (r.id, '441', 'زيادة الصندوق (إيرادات متنوعة)', 'revenue', false, v_rev_42_id, true)
        ON CONFLICT (organization_id, code) DO UPDATE SET name = EXCLUDED.name, is_active = true;

        -- 9. إنشاء حساب 41103: إيراد عقود ومشاريع (مستخلصات)
        INSERT INTO public.accounts (organization_id, code, name, type, is_group, parent_id, is_active)
        VALUES (r.id, '41103', 'إيراد عقود ومشاريع (مستخلصات)', 'revenue', false, v_rev_41_id, true)
        ON CONFLICT (organization_id, code) DO UPDATE SET name = EXCLUDED.name, is_active = true;

        -- 10. إنشاء حساب 41104: إيرادات رسوم الخدمة (المطاعم)
        INSERT INTO public.accounts (organization_id, code, name, type, is_group, parent_id, is_active)
        VALUES (r.id, '41104', 'إيرادات رسوم الخدمة (المطاعم)', 'revenue', false, v_rev_41_id, true)
        ON CONFLICT (organization_id, code) DO UPDATE SET name = EXCLUDED.name, is_active = true;

        -- 11. إنشاء حساب 41101: إيرادات تشغيل وخدمات متنوعة
        INSERT INTO public.accounts (organization_id, code, name, type, is_group, parent_id, is_active)
        VALUES (r.id, '41101', 'إيرادات تشغيل وخدمات متنوعة', 'revenue', false, v_rev_41_id, true)
        ON CONFLICT (organization_id, code) DO UPDATE SET name = EXCLUDED.name, is_active = true;

        -- 12. إنشاء حساب 122101: ذمم شركات التأمين الطبي
        INSERT INTO public.accounts (organization_id, code, name, type, is_group, parent_id, is_active)
        VALUES (r.id, '122101', 'ذمم شركات التأمين الطبي', 'asset', false, v_asset_122_id, true)
        ON CONFLICT (organization_id, code) DO UPDATE SET name = EXCLUDED.name, is_active = true;

    END LOOP;
END $$;
