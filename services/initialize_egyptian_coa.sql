-- دالة تأسيس دليل الحسابات المصري الشامل لشركة جديدة
-- 🇪🇬 دالة تأسيس دليل الحسابات المصري الشامل (النسخة الذهبية المتكاملة)
-- تاريخ التحديث: 2024-05-20
-- تشمل: أوراق القبض، المحافظ الإلكترونية، تفاصيل البنوك المصرية، وكافة المصروفات.

-- 1. حذف النسخ القديمة لضمان تحديث توقيع الدالة (Signature)
DROP FUNCTION IF EXISTS public.initialize_egyptian_coa(UUID);
DROP FUNCTION IF EXISTS public.initialize_egyptian_coa(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.initialize_egyptian_coa(p_org_id UUID, p_activity_type TEXT DEFAULT 'commercial', p_admin_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public, auth
AS $$
DECLARE v_vat_rate numeric; v_admin_id uuid; v_org_name text;
    v_cash_id uuid; v_sales_id uuid; v_cust_id uuid; v_cogs_id uuid; v_inv_id uuid; v_vat_id uuid; v_supp_id uuid; v_vat_in_id uuid; v_disc_id uuid;
    v_wht_pay_id uuid; v_payroll_tax_id uuid; v_wht_rec_id uuid; v_sal_ret_id uuid;
    v_sal_exp_id uuid; v_bonus_id uuid; v_ded_id uuid; v_adv_id uuid; v_retained_id uuid;
    v_raw_id uuid; v_wip_id uuid; v_labor_mfg_id uuid; v_wastage_id uuid;
    v_notes_rec_id uuid; v_notes_pay_id uuid; v_cash_deficit_id uuid; v_overhead_mfg_id uuid;
    v_dep_exp_id uuid; v_acc_dep_id uuid; v_fixed_assets_id uuid; v_opening_bal_id uuid;
    v_prepaid_exp_id uuid; v_accrued_exp_id uuid;
    v_social_ins_id uuid; v_bank_main_id uuid; v_rev_other_id uuid; v_exp_gen_id uuid; v_security_deposit_id uuid;
    v_sal_allow_id uuid;
BEGIN
    v_vat_rate := CASE 
        WHEN p_activity_type = 'construction' THEN 0.05 
        WHEN p_activity_type = 'charity' THEN 0.00 
        ELSE 0.14 
    END;
    SELECT name INTO v_org_name FROM public.organizations WHERE id = p_org_id;
    CREATE TEMPORARY TABLE coa_temp (
        code text PRIMARY KEY,
        name text NOT NULL,
        type text NOT NULL,
        is_group boolean NOT NULL,
        parent_code text
    ) ON COMMIT DROP;

    INSERT INTO coa_temp (code, name, type, is_group, parent_code) VALUES
        -- ============================================================
    -- المستوى 1: الحسابات الرئيسية (الأصول، الخصوم، إلخ)
    -- ============================================================
    ('1', 'الأصول', 'asset', true, NULL),
    ('2', 'الخصوم (الإلتزامات)', 'liability', true, NULL),
    ('3', 'حقوق الملكية', 'equity', true, NULL),
    ('4', 'الإيرادات', 'revenue', true, NULL),
    ('5', 'المصروفات', 'expense', true, NULL),
        -- ============================================================
    -- المستوى 2: تصنيفات رئيسية (متداولة، غير متداولة، إلخ)
    -- ============================================================
    ('11', 'الأصول غير المتداولة', 'asset', true, '1'),
    ('12', 'الأصول المتداولة', 'asset', true, '1'),
    ('21', 'الخصوم غير المتداولة', 'liability', true, '2'),
    ('22', 'الخصوم المتداولة', 'liability', true, '2'),
    ('31', 'رأس المال والاحتياطيات', 'equity', true, '3'),
        ('32', 'الأرباح المبقاة / المرحلة', 'equity', false, '3'), -- تم نقلها هنا
    ('33', 'جاري الشركاء', 'equity', false, '3'), -- تم نقلها هنا
    ('34', 'احتياطيات', 'equity', false, '3'), -- تم نقلها هنا
    ('41', 'إيرادات النشاط (المبيعات)', 'revenue', true, '4'),
    ('42', 'إيرادات أخرى', 'revenue', true, '4'),
    ('51', 'تكلفة المبيعات (COGS)', 'expense', true, '5'),
    ('52', 'مصروفات البيع والتسويق', 'expense', true, '5'),
    ('53', 'المصروفات الإدارية والعمومية', 'expense', true, '5'),
       -- ============================================================
    -- المستوى 3: حسابات تجميعية فرعية
    -- ============================================================
    ('111', 'الأصول الثابتة (بالصافي)', 'asset', true, '11'),
    ('103', 'المخزون', 'asset', true, '12'), -- استخدام 103 للمخزون
    ('122', 'العملاء والمدينون', 'asset', true, '12'),
    ('123', 'النقدية وما في حكمها', 'asset', true, '12'),
    ('1232', 'البنوك - حسابات جارية', 'asset', true, '123'),
    ('1233', 'المحافظ الإلكترونية', 'asset', true, '123'),
    ('124', 'أرصدة مدينة أخرى', 'asset', true, '12'),
    ('223', 'مصلحة الضرائب (التزامات)', 'liability', true, '22'),
    ('225', 'مصروفات مستحقة', 'liability', true, '22'),
    ('525', 'عمولات تحصيل إلكتروني', 'expense', true, '52'),

    -- ============================================================
    -- المستوى 4 وما بعده: حسابات الحركة والتفاصيل
    -- ============================================================
    -- الأصول الثابتة
    ('1111', 'الأراضي', 'asset', false, '111'),
    ('1112', 'المباني والإنشاءات', 'asset', false, '111'),
    ('1113', 'الآلات والمعدات', 'asset', false, '111'),
        ('1114', 'وسائل النقل والانتقال', 'asset', false, '111'),
    ('1115', 'الأثاث والتجهيزات المكتبية', 'asset', false, '111'),
    ('1116', 'أجهزة حاسب آلي وبرمجيات', 'asset', false, '111'),
    ('1119', 'مجمع إهلاك الأصول الثابتة', 'asset', false, '111'),
        -- المخزون

    ('10301', 'مخزون المواد الخام', 'asset', false, '103'),
    ('10302', 'مخزون المنتج التام', 'asset', false, '103'),
    ('10303', 'مخزون إنتاج تحت التشغيل (WIP)', 'asset', false, '103'),
        -- العملاء والمدينون

    ('1221', 'العملاء', 'asset', false, '122'),
    ('1222', 'أوراق القبض (شيكات تحت التحصيل)', 'asset', false, '122'),
    ('1223', 'سلف الموظفين', 'asset', false, '122'),
        ('1224', 'عهد موظفين', 'asset', false, '122'),
    -- النقدية والبنوك والمحافظ
    ('1231', 'النقدية بالصندوق (الرئيسية)', 'asset', false, '123'),
    ('123201', 'البنك الأهلي المصري', 'asset', false, '1232'),
    ('123202', 'بنك مصر', 'asset', false, '1232'),
    ('123203', 'البنك التجاري الدولي (CIB)', 'asset', false, '1232'),
        ('123204', 'بنك QNB الأهلي', 'asset', false, '1232'),
    ('123205', 'بنك القاهرة', 'asset', false, '1232'),
    ('123206', 'بنك فيصل الإسلامي', 'asset', false, '1232'),
    ('123207', 'بنك الإسكندرية', 'asset', false, '1232'),
    ('123301', 'فودافون كاش', 'asset', false, '1233'),
    ('123302', 'اتصالات كاش (Etisalat Cash)', 'asset', false, '1233'),
    ('123303', 'أورنج كاش (Orange Cash)', 'asset', false, '1233'),
    ('123304', 'وي باي (WE Pay)', 'asset', false, '1233'),
    ('123305', 'انستا باي (InstaPay)', 'asset', false, '1233'),
    -- أرصدة مدينة أخرى
    ('1241', 'ضريبة القيمة المضافة (مدخلات)', 'asset', false, '124'),
    ('1242', 'ضريبة الخصم والتحصيل (لنا)', 'asset', false, '124'),
    ('1243', 'مصروفات مدفوعة مقدماً', 'asset', true, '124'),
    ('124301', 'إيجار مقدم', 'asset', false, '1243'),
    ('124302', 'تأمين طبي مقدم', 'asset', false, '1243'),
    ('124303', 'اشتراكات برامج وسيرفرات مقدمة', 'asset', false, '1243'),
    ('124304', 'حملات إعلانية مقدمة', 'asset', false, '1243'),
    ('124305', 'عقود صيانة مقدمة', 'asset', false, '1243'),
    ('1244', 'إيرادات مستحقة', 'asset', true, '124'),
    ('124401', 'إيرادات خدمات مستحقة (غير مفوترة)', 'asset', false, '1244'),
    ('124402', 'فوائد بنكية مستحقة القبض', 'asset', false, '1244'),
    ('124403', 'إيجارات دائنة مستحقة', 'asset', false, '1244'),
    ('124404', 'إيرادات أوراق مالية مستحقة', 'asset', false, '1244'),
    -- الخصوم
    ('201', 'الموردين', 'liability', false, '22'),
    ('222', 'أوراق الدفع (شيكات صادرة)', 'liability', false, '22'),
    ('2231', 'ضريبة القيمة المضافة (مخرجات)', 'liability', false, '223'),
    ('2232', 'ضريبة الخصم والتحصيل (علينا)', 'liability', false, '223'),
    ('2233', 'ضريبة كسب العمل', 'liability', false, '223'),
    ('224', 'هيئة التأمينات الاجتماعية', 'liability', false, '22'),
    ('2251', 'رواتب وأجور مستحقة', 'liability', false, '225'),
    ('2252', 'إيجارات مستحقة', 'liability', false, '225'),
    ('2253', 'كهرباء ومياه وغاز مستحقة', 'liability', false, '225'),
    ('2254', 'أتعاب مهنية ومراجعة مستحقة', 'liability', false, '225'),
    ('2255', 'عمولات بيع مستحقة', 'liability', false, '225'),
    ('2256', 'فوائد بنكية مستحقة', 'liability', false, '225'),
    ('2257', 'اشتراكات وتراخيص مستحقة', 'liability', false, '225'),
    ('226', 'تأمينات ودفعات مقدمة من العملاء', 'liability', false, '22'),
    -- حقوق الملكية
    ('311', 'رأس المال المدفوع', 'equity', false, '31'), -- تحت رأس المال والاحتياطيات
    ('3999', 'الأرصدة الافتتاحية (حساب وسيط)', 'equity', false, '3'),
    -- الإيرادات

    ('411', 'إيراد مبيعات بضاعة', 'revenue', false, '41'),
    ('412', 'مردودات ومسموحات مبيعات', 'revenue', false, '41'),
    ('413', 'خصم مسموح به', 'revenue', false, '41'),
    ('421', 'إيرادات متنوعة', 'revenue', false, '42'),
    ('422', 'إيراد خصومات وجزاءات الموظفين', 'revenue', false, '42'),
    ('423', 'فوائد بنكية دائنة', 'revenue', false, '42'),
    -- المصروفات
    ('511', 'تكلفة البضاعة المباعة', 'expense', false, '51'),
    ('512', 'تسويات الجرد (عجز المخزون)', 'expense', false, '51'),
    ('5121', 'تكلفة الهالك والفاقد', 'expense', false, '51'), -- متاح الآن لكل الشركات
    ('513', 'أجور عمال الإنتاج المباشرة', 'expense', false, '51'), -- متاح الآن لكل الشركات
    -- لإضافة حساب جديد: ('CODE', 'NAME', 'TYPE', IS_GROUP, 'PARENT_CODE')
    
    ('514', 'تكاليف صناعية غير مباشرة', 'expense', true, '51'),
    ('5141', 'إهلاك آلات ومعدات المصنع', 'expense', false, '514'),
    ('5142', 'صيانة وإصلاح المصنع', 'expense', false, '514'),
    ('5143', 'كهرباء وقوى محركة للمصنع', 'expense', false, '514'),
    ('521', 'دعاية وإعلان', 'expense', false, '52'),
    ('522', 'عمولات بيع وتسويق', 'expense', false, '52'),
    ('523', 'نقل ومشال للخارج', 'expense', false, '52'),
    ('524', 'تعبئة وتغليف', 'expense', false, '52'),
    ('5251', 'عمولة فودافون كاش', 'expense', false, '525'),
    ('5252', 'عمولة فوري', 'expense', false, '525'),
    ('5253', 'عمولة تحويلات بنكية', 'expense', false, '525'),
    ('531', 'الرواتب والأجور', 'expense', false, '53'),
    ('5312', 'مكافآت وحوافز', 'expense', false, '53'),
    ('5311', 'بدلات وانتقالات', 'expense', false, '53'),
    ('532', 'إيجار مقرات إدارية', 'expense', false, '53'),
    ('533', 'مصروف إهلاك الأصول الثابتة', 'expense', false, '53'),
    ('534', 'مصروفات بنكية', 'expense', false, '53'),
    ('535', 'كهرباء ومياه وغاز', 'expense', false, '53'),
    ('536', 'اتصالات وإنترنت', 'expense', false, '53'),
    ('537', 'صيانة وإصلاح', 'expense', false, '53'),
    ('538', 'أدوات مكتبية ومطبوعات', 'expense', false, '53'),
    ('539', 'ضيافة واستقبال', 'expense', false, '53'),
    ('541', 'تسوية عجز الصندوق', 'expense', false, '53'),
    ('542', 'إكراميات', 'expense', false, '53'),
    ('543', 'مصاريف نظافة', 'expense', false, '53');
    -- 2. تخصيص حسابات بناءً على النشاط
    IF p_activity_type = 'restaurant' THEN
        INSERT INTO coa_temp (code, name, type, is_group, parent_code) VALUES
        ('4111', 'إيرادات مبيعات (صالة)', 'revenue', false, '41'),
        ('4112', 'إيرادات مبيعات (توصيل)', 'revenue', false, '41');
    END IF;

    -- 3. حقن الحسابات في الجدول الرئيسي (public.accounts)
    INSERT INTO public.accounts (organization_id, code, name, type, is_group, is_active)
    SELECT p_org_id, code, name, type, is_group, true
    FROM coa_temp
    ORDER BY length(code), code
    ON CONFLICT (organization_id, code) 
    DO UPDATE SET 
        is_group = EXCLUDED.is_group,
        type = EXCLUDED.type,
        name = EXCLUDED.name,
        is_active = true;

    -- 4. تحديث روابط Parent_ID بشكل جماعي وذكي (بعد إدراج جميع الحسابات)
    UPDATE public.accounts a
    SET parent_id = p.id
    FROM coa_temp t
    JOIN public.accounts p ON p.organization_id = a.organization_id AND p.code = t.parent_code
    WHERE a.organization_id = p_org_id 
      AND a.code = t.code 
      -- تحديث الرابط دائماً لضمان الصحة حتى لو كان مربوطاً خطأ
      AND (a.parent_id IS NULL OR a.parent_id != p.id);

    -- 🛡️ إصلاح أمني: نستخدم المعرف الممرر فقط لتعيين المدير.
    -- نتجنب auth.uid() هنا لأن المستدعي غالباً هو السوبر أدمن ولا نريد تغيير بياناته.
    v_admin_id := p_admin_id;
    IF v_admin_id IS NOT NULL THEN
        
            -- التأكد من وجود دور admin لهذه الشركة
        INSERT INTO public.roles (organization_id, name, description)
        VALUES (p_org_id, 'admin', 'مدير النظام')
        ON CONFLICT (name, organization_id) DO NOTHING;

        UPDATE public.profiles 
        SET role = 'admin', 
            organization_id = p_org_id, 
            is_active = true,
            role_id = (SELECT id FROM public.roles WHERE organization_id = p_org_id AND name = 'admin' LIMIT 1)
        WHERE id = v_admin_id;    
        
        -- تحديث Metadata الهوية لضمان ظهور الأزرار في الواجهة فوراً دون الحاجة لتدخل يدوي
        UPDATE auth.users SET raw_user_meta_data = 
            COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('org_id', p_org_id, 'role', 'admin')
        WHERE id = v_admin_id;
    END IF;

    v_cash_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1231' LIMIT 1);
    v_sales_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '411' LIMIT 1);
    v_cust_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1221' LIMIT 1);
    v_cogs_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '511' LIMIT 1);
    v_inv_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '10302' LIMIT 1);
    v_vat_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '2231' LIMIT 1);
    v_supp_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '201' LIMIT 1);
    v_sal_ret_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '412' LIMIT 1);
    v_vat_in_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1241' LIMIT 1);
    v_disc_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '413' LIMIT 1);
    v_wht_pay_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '2232' LIMIT 1);
    v_payroll_tax_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '2233' LIMIT 1);
    v_wht_rec_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1242' LIMIT 1);
    v_sal_exp_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '531' LIMIT 1);
    v_bonus_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '5312' LIMIT 1);
    v_ded_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '422' LIMIT 1);
    v_adv_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1223' LIMIT 1);
    v_retained_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '32' LIMIT 1);
    v_raw_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '10301' LIMIT 1);
    v_wip_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '10303' LIMIT 1);
    v_notes_rec_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1222' LIMIT 1);
    v_notes_pay_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '222' LIMIT 1);
    v_cash_deficit_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '541' LIMIT 1);
    v_dep_exp_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '533' LIMIT 1);
    v_acc_dep_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1119' LIMIT 1);
    v_fixed_assets_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '111' LIMIT 1);
    v_opening_bal_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '3999' LIMIT 1);
    v_prepaid_exp_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1243' LIMIT 1);
    v_accrued_exp_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '225' LIMIT 1);
    v_social_ins_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '224' LIMIT 1);
    v_bank_main_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '123201' LIMIT 1);
    v_rev_other_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '421' LIMIT 1);
    v_exp_gen_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '53' LIMIT 1);
    v_security_deposit_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '226' LIMIT 1);
    v_sal_allow_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '412' LIMIT 1);

    -- ضمان وجود دور الـ admin وكافة الصلاحيات قبل ربط الإعدادات
    INSERT INTO public.roles (organization_id, name, description)
    VALUES (p_org_id, 'admin', 'مدير النظام')
    ON CONFLICT (name, organization_id) DO NOTHING;

    INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
    SELECT (SELECT id FROM public.roles WHERE organization_id = p_org_id AND name = 'admin' LIMIT 1), id, p_org_id
    FROM public.permissions ON CONFLICT DO NOTHING;

    INSERT INTO public.company_settings (organization_id, activity_type, vat_rate, company_name, account_mappings)
    VALUES (p_org_id, p_activity_type, v_vat_rate, v_org_name, 
        jsonb_build_object(
            'CASH', v_cash_id, 'SALES_REVENUE', v_sales_id, 'CUSTOMERS', v_cust_id, 'COGS', v_cogs_id, 'INVENTORY_FINISHED_GOODS', v_inv_id,
            'VAT', v_vat_id, 'SUPPLIERS', v_supp_id, 'SALES_RETURNS', v_sal_ret_id, 'VAT_INPUT', v_vat_in_id, 'SALES_DISCOUNT', v_disc_id,
            'WHT_PAYABLE', v_wht_pay_id, 'PAYROLL_TAX', v_payroll_tax_id, 'WHT_RECEIVABLE', v_wht_rec_id,
            'SALARIES_EXPENSE', v_sal_exp_id, 'EMPLOYEE_BONUSES', v_bonus_id, 'EMPLOYEE_DEDUCTIONS', v_ded_id, 'EMPLOYEE_ADVANCES', v_adv_id,
            'RETAINED_EARNINGS', v_retained_id, 
            'NOTES_RECEIVABLE', v_notes_rec_id,
            'NOTES_PAYABLE', v_notes_pay_id,
            'CASH_SHORTAGE', v_cash_deficit_id,
            'INVENTORY_RAW_MATERIALS', v_raw_id,
            'INVENTORY_WIP', v_wip_id,
            'LABOR_COST_ALLOCATED', v_labor_mfg_id,
            'MANUFACTURING_OVERHEAD', v_overhead_mfg_id,
            'WASTAGE_EXPENSE', v_wastage_id,
            'DEPRECIATION_EXPENSE', v_dep_exp_id,
            'ACCUMULATED_DEPRECIATION', v_acc_dep_id,
            'ASSETS_FIXED', v_fixed_assets_id,
            'OPENING_BALANCES', v_opening_bal_id,
            'PREPAID_EXPENSES', v_prepaid_exp_id,
            'ACCRUED_EXPENSES', v_accrued_exp_id,
            'SOCIAL_INSURANCE', v_social_ins_id,
            'BANK_MAIN', v_bank_main_id,
            'REVENUE_OTHER', v_rev_other_id,
            'EXPENSE_GENERAL', v_exp_gen_id,
            'SECURITY_DEPOSIT_ACCOUNT', v_security_deposit_id,
            'SALES_ALLOWANCES', v_sal_allow_id
        )
    ) ON CONFLICT (organization_id) DO UPDATE SET activity_type = EXCLUDED.activity_type, vat_rate = EXCLUDED.vat_rate, company_name = EXCLUDED.company_name, account_mappings = EXCLUDED.account_mappings;

    -- تأسيس الأدوار الافتراضية للمنظمة لضمان ظهورها في شاشة الصلاحيات
    INSERT INTO public.roles (organization_id, name, description) VALUES
    (p_org_id, 'admin', 'مدير النظام'),
    (p_org_id, 'accountant', 'محاسب'),
    (p_org_id, 'cashier', 'كاشير / بائع'),
    (p_org_id, 'chef', 'شيف / مطبخ')
    ON CONFLICT (name, organization_id) DO NOTHING;

    -- 🚀 ضمان منح كافة الصلاحيات لدور الـ admin الخاص بهذه المنظمة
    INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
    SELECT (SELECT id FROM public.roles WHERE organization_id = p_org_id AND name = 'admin' LIMIT 1),
           id,
           p_org_id
    FROM public.permissions
    ON CONFLICT DO NOTHING;

    RETURN '✅ تم تأسيس الدليل المحاسبي وربط الحسابات السيادية بنجاح.';

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