-- دالة تأسيس دليل الحسابات المصري الشامل لشركة جديدة
-- الاستدعاء: SELECT public.initialize_egyptian_coa('uuid-here', 'restaurant');

-- 1. حذف النسخ القديمة لضمان تحديث توقيع الدالة (Signature)
DROP FUNCTION IF EXISTS public.initialize_egyptian_coa(UUID);
DROP FUNCTION IF EXISTS public.initialize_egyptian_coa(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.initialize_egyptian_coa(p_org_id UUID, p_activity_type TEXT DEFAULT 'commercial')
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER -- تشغيل الصلاحيات كأدمن لضمان نجاح التأسيس
AS $$
DECLARE
    v_row_count int;
    v_vat_rate numeric;
BEGIN
    -- تحديد نسبة الضريبة الافتراضية بناءً على نوع النشاط (المعايير المصرية)
    IF p_activity_type = 'construction' THEN
        v_vat_rate := 0.05; -- ضريبة الجدول للمقاولات والإنشاءات
    ELSIF p_activity_type = 'charity' THEN
        v_vat_rate := 0.00; -- إعفاء ضريبي للجمعيات الخيرية
    ELSE
        v_vat_rate := 0.14; -- النسبة العامة القياسية 14% (تجاري، مطاعم، إلخ)
    END IF;

    -- 1. إدراج المستوى الأول (الحسابات الرئيسية)
    INSERT INTO public.accounts (organization_id, code, name, type, is_group, is_active)
    VALUES
        (p_org_id, '1', 'الأصول', 'asset', true, true),
        (p_org_id, '2', 'الخصوم', 'liability', true, true),
        (p_org_id, '3', 'حقوق الملكية', 'equity', true, true),
        (p_org_id, '4', 'الإيرادات', 'revenue', true, true),
        (p_org_id, '5', 'المصروفات', 'expense', true, true)
    ON CONFLICT (organization_id, code) DO NOTHING;

    -- 2. إدراج المستوى الثاني (الأصول المتداولة، الخصوم المتداولة، إلخ)
    -- نستخدم الاستعلام الفرعي لجلب id الأب الصحيح داخل نفس الشركة
    INSERT INTO public.accounts (organization_id, code, name, type, is_group, parent_id, is_active)
    VALUES
        (p_org_id, '11', 'الأصول غير المتداولة', 'asset', true, (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1'), true),
        (p_org_id, '12', 'الأصول المتداولة', 'asset', true, (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1'), true),
        (p_org_id, '21', 'الخصوم غير المتداولة', 'liability', true, (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '2'), true),
        (p_org_id, '22', 'الخصوم المتداولة', 'liability', true, (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '2'), true),
        (p_org_id, '31', 'رأس المال والاحتياطيات', 'equity', true, (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '3'), true),
        (p_org_id, '41', 'إيرادات النشاط', 'revenue', true, (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '4'), true),
        (p_org_id, '51', 'تكاليف النشاط', 'expense', true, (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '5'), true),
        (p_org_id, '52', 'مصروفات إدارية وعمومية', 'expense', true, (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '5'), true)
    ON CONFLICT (organization_id, code) DO NOTHING;

    -- 3. إدراج المستوى الثالث (الحسابات الرئيسية الوسيطة)
    -- حسابات مشتركة لجميع الأنشطة
    INSERT INTO public.accounts (organization_id, code, name, type, is_group, parent_id, is_active)
    VALUES
        (p_org_id, '31', 'رأس المال والاحتياطيات', 'equity', true, (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '3'), true),
        (p_org_id, '312', 'الأرباح المبقاة (المرحلة)', 'equity', false, (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '31'), true),
        (p_org_id, '313', 'جاري الشركاء', 'equity', false, (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '31'), true),
        (p_org_id, '3999', 'الأرصدة الافتتاحية', 'equity', false, (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '3'), true),
        (p_org_id, '122', 'العملاء والمدينون', 'asset', true, (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '12'), true),
        (p_org_id, '123', 'النقدية وما في حكمها', 'asset', true, (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '12'), true),
        (p_org_id, '201', 'الموردين', 'liability', false, (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '22'), true)
    ON CONFLICT (organization_id, code) DO NOTHING;

    -- 4. إدراج حسابات متخصصة بناءً على نوع النشاط
    IF p_activity_type = 'restaurant' THEN
        -- قالب المطاعم
        INSERT INTO public.accounts (organization_id, code, name, type, is_group, parent_id, is_active)
        VALUES
            (p_org_id, '121', 'مخزون الأغذية والمشروبات', 'asset', true, (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '12'), true),
            (p_org_id, '411', 'إيرادات المبيعات (صالة/تيك أوي)', 'revenue', false, (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '4'), true),
            (p_org_id, '412', 'إيرادات التوصيل (Delivery)', 'revenue', false, (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '4'), true),
            (p_org_id, '511', 'تكلفة المواد الخام المستهلكة', 'expense', false, (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '5'), true),
            (p_org_id, '512', 'تكلفة الهالك والضيافة', 'expense', false, (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '5'), true)
        ON CONFLICT (organization_id, code) DO NOTHING;
    -- يمكنك إضافة باقي القطاعات هنا بنفس الطريقة
    ELSIF p_activity_type = 'construction' THEN
        -- قالب المقاولات
        INSERT INTO public.accounts (organization_id, code, name, type, is_group, parent_id, is_active)
        VALUES
            (p_org_id, '121', 'مخزون تشوينات المواقع', 'asset', true, (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '12'), true),
            (p_org_id, '125', 'مشروعات تحت التنفيذ', 'asset', true, (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '12'), true),
            (p_org_id, '411', 'إيرادات المستخلصات المعتمدة', 'revenue', false, (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '4'), true),
            (p_org_id, '511', 'تكلفة خامات ومواد مباشرة', 'expense', false, (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '5'), true),
            (p_org_id, '512', 'مصروفات مقاولي الباطن', 'expense', false, (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '5'), true)
        ON CONFLICT (organization_id, code) DO NOTHING;

    ELSE
        -- القالب التجاري العام (Default)
        INSERT INTO public.accounts (organization_id, code, name, type, is_group, parent_id, is_active)
        VALUES
            (p_org_id, '121', 'المخزون السلعي', 'asset', true, (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '12'), true),
            (p_org_id, '411', 'إيراد مبيعات بضاعة', 'revenue', false, (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '4'), true),
            (p_org_id, '511', 'تكلفة البضاعة المباعة', 'expense', false, (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '5'), true)
        ON CONFLICT (organization_id, code) DO NOTHING;
    END IF;

    -- 5. إدراج حسابات الأنظمة الأساسية (المستويات الفرعية الأخيرة)
    INSERT INTO public.accounts (organization_id, code, name, type, is_group, parent_id, is_active)
    VALUES
        (p_org_id, '1231', 'النقدية بالصندوق', 'asset', false, (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '123'), true),
        (p_org_id, '123201', 'البنك الأهلي المصري', 'asset', false, (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '123'), true),
        (p_org_id, '2231', 'ضريبة القيمة المضافة - مخرجات', 'liability', false, (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '22'), true)
    ON CONFLICT (organization_id, code) DO NOTHING;

    -- إدراج تفاصيل المخزون بناءً على النشاط
    IF p_activity_type = 'restaurant' THEN
        INSERT INTO public.accounts (organization_id, code, name, type, is_group, parent_id, is_active)
        VALUES
            (p_org_id, '10301', 'مخزون الخامات (خضروات/لحوم)', 'asset', false, (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '121'), true),
            (p_org_id, '10302', 'مخزون المشروبات والسلع الجاهزة', 'asset', false, (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '121'), true)
        ON CONFLICT (organization_id, code) DO NOTHING;
    ELSE
        INSERT INTO public.accounts (organization_id, code, name, type, is_group, parent_id, is_active)
        VALUES
            (p_org_id, '10301', 'مخزون المواد الخام', 'asset', false, (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '121'), true),
            (p_org_id, '10302', 'مخزون المنتج التام', 'asset', false, (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '121'), true)
        ON CONFLICT (organization_id, code) DO NOTHING;
    END IF;

    -- 6. تحديث إعدادات الشركة بنوع النشاط المختار لضمان حفظه تلقائياً واسترجاعه لاحقاً
    INSERT INTO public.company_settings (organization_id, activity_type, vat_rate, company_name)
    VALUES (p_org_id, p_activity_type, v_vat_rate, (SELECT name FROM public.organizations WHERE id = p_org_id))
    ON CONFLICT (organization_id) 
    DO UPDATE SET 
        activity_type = EXCLUDED.activity_type,
        vat_rate = EXCLUDED.vat_rate;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    RETURN 'تم تأسيس دليل الحسابات لقالب (' || p_activity_type || ') بنجاح وضبط الضريبة الافتراضية بنسبة ' || (v_vat_rate * 100) || '%. السجلات المتأثرة: ' || v_row_count;

EXCEPTION WHEN OTHERS THEN
    -- تسجيل الخطأ في جدول سجلات الأخطاء (System Error Logs)
    INSERT INTO public.system_error_logs (
        error_message, 
        error_code, 
        context, 
        function_name, 
        organization_id, 
        user_id
    )
    VALUES (
        SQLERRM, 
        SQLSTATE, 
        jsonb_build_object('org_id', p_org_id, 'activity_type', p_activity_type), 
        'initialize_egyptian_coa', 
        p_org_id,
        auth.uid()
    );
    
    -- إعادة إلقاء الخطأ (Raise) لضمان توقف العملية وإبلاغ الواجهة الأمامية بوجود مشكلة
    RAISE EXCEPTION 'فشل تأسيس دليل الحسابات: % (كود: %)', SQLERRM, SQLSTATE;
END;
$$;