-- ============================================
-- إصلاح مشاكل المصادقة والملفات الشخصية
-- ============================================

-- خطوة 1: إصلاح المستخدمين الذين لا يملكون ملفات شخصية
DO $$ 
DECLARE
    v_user record;
    v_org_id uuid;
BEGIN
    FOR v_user IN 
        SELECT u.id, u.email, u.raw_user_meta_data->>'org_id' as metadata_org_id
        FROM auth.users u
        LEFT JOIN public.profiles p ON u.id = p.id
        WHERE p.id IS NULL
    LOOP
        -- حاول الحصول على org_id من metadata
        v_org_id := (v_user.metadata_org_id)::uuid;
        
        -- إذا لم يكن هناك org_id، استخدم أول منظمة
        IF v_org_id IS NULL THEN
            SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
        END IF;
        
        IF v_org_id IS NOT NULL THEN
            INSERT INTO public.profiles (id, organization_id, role, full_name)
            VALUES (v_user.id, v_org_id, 'admin', COALESCE(v_user.email, 'Unknown'))
            ON CONFLICT (id) DO NOTHING;
            
            RAISE NOTICE 'تم إنشاء ملف شخصي للمستخدم: %', v_user.email;
        ELSE
            RAISE WARNING 'لا توجد منظمات لإسناد المستخدم: %', v_user.email;
        END IF;
    END LOOP;
END $$;

-- خطوة 2: إصلاح الملفات الشخصية التي تملك NULL organization_id
DO $$
DECLARE
    v_profile record;
    v_org_id uuid;
BEGIN
    FOR v_profile IN 
        SELECT id FROM public.profiles WHERE organization_id IS NULL
    LOOP
        -- احصل على أول منظمة متاحة
        SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
        
        IF v_org_id IS NOT NULL THEN
            UPDATE public.profiles 
            SET organization_id = v_org_id 
            WHERE id = v_profile.id;
            
            RAISE NOTICE 'تم تحديث organization_id للملف الشخصي: %', v_profile.id;
        ELSE
            RAISE WARNING 'لا توجد منظمات متاحة للملف الشخصي: %', v_profile.id;
        END IF;
    END LOOP;
END $$;

-- خطوة 3: التحقق من النتائج
SELECT 
    COUNT(*) as total_users,
    COUNT(CASE WHEN p.id IS NOT NULL THEN 1 END) as with_profiles,
    COUNT(CASE WHEN p.organization_id IS NOT NULL THEN 1 END) as with_org_id
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id;

-- خطوة 4: إعادة فعالية وحدات RLS
ALTER TABLE public.products DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.invoices DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

SELECT 'تم تحديث RLS بنجاح' as status;
