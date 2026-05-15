-- 🔧 ملف إصلاح الحسابات المفقودة (Fix Missing Accounts)
-- يقوم هذا الملف بفحص الحسابات الأساسية في النظام وإنشائها إذا كانت مفقودة.
-- يعتمد على دليل الحسابات المصري القياسي المستخدم في النظام.

-- نوع مادة للتخزين المؤقت لحسابات النظام.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_template') THEN
        CREATE TYPE account_template AS (
            code text,
            name text,
            type text,
            is_group boolean,
            parent_code text
        );
    END IF;
END$$;

DO $$
DECLARE
    v_org_id uuid;
    v_parent_id uuid;
    v_count integer := 0;
    v_created integer := 0;
    
    -- نوع مؤقت لتخزين بيانات الحساب
    v_acc account_template;
    v_accounts account_template[];
BEGIN
    RAISE NOTICE '🚀 بدء فحص وإصلاح الحسابات المفقودة...';

    -- الحصول على معرف المنظمة (أول منظمة)
    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
    
    IF v_org_id IS NULL THEN
        -- إنشاء منظمة افتراضية إذا لم توجد
        INSERT INTO public.organizations (name) VALUES ('الشركة الافتراضية') RETURNING id INTO v_org_id;
        RAISE NOTICE '✅ تم إنشاء منظمة افتراضية.';
    END IF;

    -- تعريف قائمة الحسابات الأساسية (مرتبة حسب المستوى لضمان وجود الأب)
    v_accounts := ARRAY[
        -- المستوى الأول (الجذور)
        ROW('1', 'الأصول', 'ASSET', true, NULL::text),
        ROW('2', 'الخصوم (الإلتزامات)', 'LIABILITY', true, NULL::text),
        ROW('3', 'حقوق الملكية', 'EQUITY', true, NULL::text),
        ROW('4', 'الإيرادات', 'REVENUE', true, NULL::text),
        ROW('5', 'المصروفات', 'EXPENSE', true, NULL::text),

        -- المستوى الثاني (مجموعات رئيسية)
        ROW('11', 'الأصول غير المتداولة', 'ASSET', true, '1'),
        ROW('12', 'الأصول المتداولة', 'ASSET', true, '1'),
        ROW('21', 'الخصوم غير المتداولة', 'LIABILITY', true, '2'),
        ROW('22', 'الخصوم المتداولة', 'LIABILITY', true, '2'),
        ROW('31', 'رأس المال', 'EQUITY', false, '3'),
        ROW('32', 'الأرباح المبقاة / المرحلة', 'EQUITY', false, '3'),
        ROW('41', 'إيرادات النشاط (المبيعات)', 'REVENUE', true, '4'),
        ROW('42', 'إيرادات أخرى', 'REVENUE', true, '4'),
        ROW('51', 'تكلفة المبيعات (COGS)', 'EXPENSE', true, '5'),
        ROW('52', 'مصروفات البيع والتسويق', 'EXPENSE', true, '5'),
        ROW('53', 'المصروفات الإدارية والعمومية', 'EXPENSE', true, '5'),

        -- المستوى الثالث والرابع (حسابات النظام SYSTEM_ACCOUNTS)
        -- الأصول
        ROW('111', 'الأصول الثابتة (بالصافي)', 'ASSET', true, '11'),
        ROW('1119', 'مجمع إهلاك الأصول الثابتة', 'ASSET', false, '111'),
        ROW('103', 'المخزون', 'ASSET', true, '12'),
        ROW('10301', 'مخزون المواد الخام', 'ASSET', false, '103'),
        ROW('10302', 'مخزون المنتج التام', 'ASSET', false, '103'),
        ROW('10303', 'مخزون إنتاج تحت التشغيل (WIP)', 'ASSET', false, '103'),
        ROW('122', 'العملاء والمدينون', 'ASSET', true, '12'),
        ROW('1221', 'العملاء', 'ASSET', false, '122'),
        ROW('1222', 'أوراق القبض (شيكات تحت التحصيل)', 'ASSET', false, '122'),
        ROW('1223', 'سلف الموظفين', 'ASSET', false, '122'),
        ROW('123', 'النقدية وما في حكمها', 'ASSET', true, '12'),
        ROW('1231', 'النقدية بالصندوق (الخزينة الرئيسية)', 'ASSET', false, '123'),
        ROW('1232', 'البنوك (حسابات جارية)', 'ASSET', true, '123'),
        ROW('124', 'أرصدة مدينة أخرى', 'ASSET', true, '12'),
        ROW('1241', 'ضريبة القيمة المضافة (مدخلات)', 'ASSET', false, '124'),

        -- الخصوم
        ROW('221', 'الموردين', 'LIABILITY', false, '22'),
        ROW('222', 'أوراق الدفع (شيكات صادرة)', 'LIABILITY', false, '22'),
        ROW('223', 'مصلحة الضرائب (التزامات)', 'LIABILITY', true, '22'),
        ROW('2231', 'ضريبة القيمة المضافة (مخرجات)', 'LIABILITY', false, '223'),
        ROW('2232', 'ضريبة الخصم والتحصيل (علينا)', 'LIABILITY', false, '223'),
        ROW('224', 'هيئة التأمينات الاجتماعية', 'LIABILITY', false, '22'),
        ROW('226', 'تأمينات ودفعات مقدمة من العملاء', 'LIABILITY', false, '22'),

        -- حقوق الملكية
        ROW('3999', 'الأرصدة الافتتاحية (حساب وسيط)', 'EQUITY', false, '3'),

        -- الإيرادات
        ROW('411', 'إيراد المبيعات', 'REVENUE', false, '41'),
        ROW('412', 'مردودات المبيعات', 'REVENUE', false, '41'),
        ROW('413', 'خصم مسموح به', 'REVENUE', false, '41'),
        ROW('421', 'إيرادات متنوعة', 'REVENUE', false, '42'),
        ROW('422', 'إيراد خصومات وجزاءات الموظفين', 'REVENUE', false, '42'),
        ROW('423', 'فوائد بنكية دائنة', 'REVENUE', false, '42'),

        -- المصروفات
        ROW('511', 'تكلفة البضاعة المباعة', 'EXPENSE', false, '51'),
        ROW('512', 'تسويات الجرد (عجز المخزون)', 'EXPENSE', false, '51'),
        ROW('531', 'الرواتب والأجور', 'EXPENSE', false, '53'),
        ROW('5312', 'مكافآت وحوافز', 'EXPENSE', false, '53'),
        ROW('533', 'إهلاك الأصول الثابتة', 'EXPENSE', false, '53'),
        ROW('534', 'مصروفات بنكية', 'EXPENSE', false, '53'),
        ROW('541', 'تسوية عجز الصندوق', 'EXPENSE', false, '53')
    ];

    -- التكرار على القائمة
    FOREACH v_acc IN ARRAY v_accounts
    LOOP
        -- التحقق من وجود الحساب
        IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = v_acc.code) THEN
            -- البحث عن معرف الأب
            v_parent_id := NULL;
            IF v_acc.parent_code IS NOT NULL THEN
                SELECT id INTO v_parent_id FROM public.accounts WHERE code = v_acc.parent_code;
                
                -- إذا لم يوجد الأب، لا يمكن إنشاء الابن (يجب أن يكون الأب قد تم إنشاؤه في دورة سابقة لأن القائمة مرتبة)
                IF v_parent_id IS NULL THEN
                    RAISE NOTICE '⚠️ تخطي الحساب % (%) لعدم وجود الحساب الرئيسي %', v_acc.name, v_acc.code, v_acc.parent_code;
                    CONTINUE;
                END IF;
            END IF;

            -- إنشاء الحساب
            INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) 
            VALUES (v_acc.code, v_acc.name, v_acc.type, v_acc.is_group, v_parent_id, v_org_id);
            
            v_created := v_created + 1;
            RAISE NOTICE '✅ تم إنشاء الحساب: % - %', v_acc.code, v_acc.name;
        END IF;
    END LOOP;

    RAISE NOTICE '--------------------------------------------------';
    IF v_created > 0 THEN
        RAISE NOTICE '🎉 تم إصلاح وإنشاء % حساب مفقود بنجاح.', v_created;
    ELSE
        RAISE NOTICE '✨ النظام سليم! جميع الحسابات الأساسية موجودة.';
    END IF;
END $$;