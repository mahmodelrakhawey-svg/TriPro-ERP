-- ==============================================================================
-- TriPro ERP Migration: Granular Financial Reports Permissions
-- Date: 2026-10-12
-- Description:
--   إضافة صلاحيات مستقلة ومفصلة لكل تقرير مالي على حدة في جدول الصلاحيات permissions
--   لتوفير إمكانية تخصيص وعزل صلاحية كل تقرير (مثل كشف الحساب متعدد العملات وحركة الصندوق)
--   لكل مستخدم مباشرة في مصفوفة الصلاحيات (UserPermissionsEditor).
-- ==============================================================================

-- 1. تسجيل الصلاحيات المعيارية للتقارير في جدول permissions
INSERT INTO public.permissions (module, action, description, is_sensitive)
VALUES 
    ('reports', 'multi_currency_statement', 'عرض تقرير كشف حساب (متعدد العملات)', true),
    ('reports', 'cash_bank_movement', 'عرض تقرير حركة الصندوق والبنوك', true),
    ('reports', 'income_statement', 'عرض تقرير قائمة الدخل الشامل (IFRS 18)', true),
    ('reports', 'balance_sheet', 'عرض تقرير قائمة المركز المالي (الميزانية العمومية)', true),
    ('reports', 'trial_balance', 'عرض تقرير ميزان المراجعة', true),
    ('reports', 'cash_flow', 'عرض تقرير قائمة التدفقات النقدية (IAS 7)', true),
    ('reports', 'changes_in_equity', 'عرض تقرير قائمة التغير في حقوق الملكية', true),
    ('reports', 'general_ledger', 'عرض تقرير دفتر الأستاذ العام', true),
    ('reports', 'view_financial', 'عرض تقارير الإدارة العليا والتقارير المالية الهامة', true),
    ('reports', 'financial_ratios', 'عرض تقرير النسب المالية ومؤشرات الأداء', false),
    ('reports', 'tax_return', 'عرض تقرير الإقرار الضريبي (VAT)', true),
    ('reports', 'customer_aging', 'عرض تقرير أعمار ديون العملاء', false),
    ('reports', 'supplier_aging', 'عرض تقرير أعمار ديون الموردين', false),
    ('reports', 'customer_statement', 'عرض تقرير كشف حساب عميل', false),
    ('reports', 'supplier_statement', 'عرض تقرير كشف حساب مورد', false),
    ('reports', 'employee_statement', 'عرض تقرير كشف حساب موظف', false),
    ('reports', 'sales_summary', 'عرض تقارير وتحليلات المبيعات', false),
    ('reports', 'export_data', 'تصدير التقارير المالية والبيانات إلى Excel', true)
ON CONFLICT (module, action) DO UPDATE 
SET 
    description = EXCLUDED.description,
    is_sensitive = EXCLUDED.is_sensitive;

-- 2. إسناد الصلاحيات الجديدة تلقائياً لدور المحاسب (accountant) ومسؤول النظام (admin)
DO $$
DECLARE
    r RECORD;
    p RECORD;
    v_has_org_in_rp boolean;
BEGIN
    -- التحقق هل يحتوي جدول role_permissions على عمود organization_id
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'role_permissions' 
          AND column_name = 'organization_id'
    ) INTO v_has_org_in_rp;

    -- منح الصلاحيات للأدوار الإدارية والمحاسبية
    FOR r IN (
        SELECT id, organization_id, name 
        FROM public.roles 
        WHERE name IN ('admin', 'accountant', 'general_manager', 'cfo')
    ) LOOP
        FOR p IN (
            SELECT id FROM public.permissions WHERE module = 'reports'
        ) LOOP
            IF v_has_org_in_rp THEN
                INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
                VALUES (r.id, p.id, r.organization_id)
                ON CONFLICT DO NOTHING;
            ELSE
                INSERT INTO public.role_permissions (role_id, permission_id)
                VALUES (r.id, p.id)
                ON CONFLICT DO NOTHING;
            END IF;
        END LOOP;
    END LOOP;

    RAISE NOTICE 'Granular reports permissions successfully provisioned and linked to accounting roles.';
END $$;
