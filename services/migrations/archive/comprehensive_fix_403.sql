-- ============================================
-- حل شامل لمشكلة 403 في الدخول
-- ============================================

-- الخطوة 1: التأكد من وجود منظمة واحدة على الأقل
DO $$
DECLARE
    v_org_id uuid;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.organizations) THEN
        INSERT INTO public.organizations (name) VALUES ('الشركة الافتراضية')
        RETURNING id INTO v_org_id;
        RAISE NOTICE 'تم إنشاء منظمة افتراضية: %', v_org_id;
    ELSE
        SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
        RAISE NOTICE 'توجد منظمة موجودة بالفعل: %', v_org_id;
    END IF;
END $$;

-- الخطوة 2: إنشاء ملفات شخصية لكل مستخدم مشهود بدونها
DO $$
DECLARE
    v_user record;
    v_org_id uuid;
    v_created_count integer := 0;
BEGIN
    -- احصل على أول منظمة
    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
    
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'لا توجد منظمات! تأكد من تشغيل الخطوة 1 أولاً';
    END IF;
    
    -- للمستخدمين بدون ملفات شخصية
    FOR v_user IN
        SELECT u.id, u.email, u.raw_user_meta_data->>'full_name' as full_name
        FROM auth.users u
        LEFT JOIN public.profiles p ON u.id = p.id
        WHERE p.id IS NULL
    LOOP
        INSERT INTO public.profiles (id, organization_id, role, full_name)
        VALUES (
            v_user.id,
            v_org_id,
            'admin',
            COALESCE(v_user.full_name, v_user.email, 'مستخدم')
        );
        
        v_created_count := v_created_count + 1;
        RAISE NOTICE 'تم إنشاء ملف شخصي: % (%)', v_user.email, v_user.id;
    END LOOP;
    
    RAISE NOTICE 'تم إنشاء % ملف شخصي جديد', v_created_count;
END $$;

-- الخطوة 3: تحديث الملفات الشخصية بدون organization_id
DO $$
DECLARE
    v_org_id uuid;
    v_updated_count integer := 0;
BEGIN
    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
    
    UPDATE public.profiles
    SET organization_id = v_org_id
    WHERE organization_id IS NULL;
    
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    RAISE NOTICE 'تم تحديث % ملف شخصي يملك NULL organization_id', v_updated_count;
END $$;

-- الخطوة 4: التحقق من النتائج
SELECT 
    'عدد مستخدمي المصادقة' as الفحص,
    COUNT(*) as العدد
FROM auth.users
UNION ALL
SELECT 'عدد الملفات الشخصية', COUNT(*) FROM public.profiles
UNION ALL
SELECT 'عدد المنظمات', COUNT(*) FROM public.organizations
UNION ALL
SELECT 'الملفات بدون organization_id', COUNT(*) FROM public.profiles WHERE organization_id IS NULL;

-- الخطوة 5: إعادة تفعيل RLS على الجداول المهمة
ALTER TABLE public.products DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.suppliers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.invoices DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

-- النتيجة النهائية
SELECT '✅ تم الانتهاء من الإصلاح بنجاح! تم إعادة تفعيل RLS على جميع الجداول' as النتيجة;
