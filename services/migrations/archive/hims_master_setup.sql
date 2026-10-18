-- =============================================
-- Title: HIMS SaaS Module Activation Script
-- Description: يؤهل هذا السكربت نظام الساس لدعم نشاط المستشفيات (HIMS)
-- =============================================

-- 0. التأكد من وجود جداول البنية التحتية لنظام الساس
CREATE TABLE IF NOT EXISTS public.saas_business_activities (
    code TEXT PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name_ar TEXT NOT NULL,
    name_en TEXT,
    icon TEXT,
    module_key TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.saas_modules (
    key TEXT PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name_ar TEXT NOT NULL,
    parent_key TEXT REFERENCES public.saas_modules(key),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 🛡️ [Security Healing] ترميم جداول البنية التحتية للساس
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='saas_business_activities' AND column_name='organization_id') THEN
        ALTER TABLE public.saas_business_activities ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='saas_modules' AND column_name='organization_id') THEN
        ALTER TABLE public.saas_modules ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org();
    END IF;
END $$;

-- 1. إضافة "مستشفى / مركز طبي" إلى قائمة الأنشطة المتاحة في منصة الساس
INSERT INTO saas_business_activities (code, name_ar, name_en, icon, module_key)
VALUES ('HOSPITAL', 'مستشفى / مركز طبي متكامل', 'Integrated Hospital / Medical Center', 'HospitalOutlined', 'hims')
ON CONFLICT (code) DO NOTHING;

-- 2. تعريف المديولات الفرعية التابعة لنشاط المستشفيات
-- 🛡️ أولاً: تعريف المديول الرئيسي (Root Module) لتجنب خطأ قيد المفتاح الأجنبي
INSERT INTO saas_modules (key, name_ar, parent_key)
VALUES ('hims', 'مديول المستشفيات المتكامل', NULL)
ON CONFLICT (key) DO NOTHING;

INSERT INTO saas_modules (key, name_ar, parent_key)
VALUES 
  ('hims_core', 'نظام إدارة المرضى والزيارات', 'hims'),
  ('hims_clinical', 'العيادات والسجل الطبي الإلكتروني', 'hims'),
  ('hims_inpatient', 'إدارة التنويم والعمليات', 'hims'),
  ('hims_ancillary', 'المختبرات والأشعة وبنك الدم', 'hims'),
  ('hims_billing', 'الفوترة الطبية والتأمين', 'hims')
ON CONFLICT (key) DO NOTHING;

-- 3. دالة تهيئة الشركة الجديدة (Seed Data) عند اختيار نشاط المستشفى
CREATE OR REPLACE FUNCTION public.initialize_hospital_data(p_org_id UUID)
RETURNS VOID AS $$
BEGIN
    -- تفعيل مديول hims في قائمة المديولات المسموح بها للمنظمة
    UPDATE public.organizations 
    SET allowed_modules = array_append(allowed_modules, 'hims')
    WHERE id = p_org_id AND NOT ('hims' = ANY(allowed_modules));

    -- إدراج أجنحة افتراضية
    INSERT INTO hims_wards (organization_id, name, floor, ward_type)
    VALUES 
      (p_org_id, 'جناح الجراحة العام', 'الطابق الثاني', 'surgical'),
      (p_org_id, 'وحدة العناية المركزة', 'الطابق الأول', 'icu'),
      (p_org_id, 'قسم الطوارئ والاستقبال', 'الطابق الأرضي', 'emergency');

    -- إدراج تحاليل مختبر وأشعة افتراضية (Service Catalog)
    INSERT INTO hims_lab_tests (organization_id, test_name, code, normal_range, unit, price)
    VALUES 
      (p_org_id, 'صورة دم كاملة (CBC)', 'LAB-001', '12.0 - 16.0', 'g/dL', 250),
      (p_org_id, 'سكر صائم', 'LAB-002', '70 - 100', 'mg/dL', 100),
      (p_org_id, 'وظائف كبد (ALT)', 'LAB-003', '7 - 56', 'U/L', 150);

    -- إدراج أنواع أشعة افتراضية في نفس جدول الخدمات بفلتر الأشعة
    INSERT INTO hims_lab_tests (organization_id, test_name, code, category, price)
    VALUES 
      (p_org_id, 'أشعة سينية صدر (X-Ray)', 'RAD-001', 'radiology', 350),
      (p_org_id, 'أشعة مقطعية (CT Scan)', 'RAD-002', 'radiology', 1200);

    -- 🛡️ [V52.9] ضبط الحسابات الافتراضية للفوترة الطبية (Smart Accounting Alignment)
    -- نعتمد على الحسابات المولدة في initialize_egyptian_coa لضمان التناغم
    INSERT INTO hims_settings (organization_id, default_revenue_account, default_insurance_account, default_pharmacy_warehouse)
    SELECT 
        p_org_id, 
        -- حساب إيرادات المبيعات (411) كبديل للإيرادات الطبية
        (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '411' LIMIT 1),
        -- حساب محتجز ضمان عملاء (1249) أو حساب ذمم التأمين
        (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1249' LIMIT 1),
        -- أول مستودع يتم إنشاؤه للمنظمة
        (SELECT id FROM public.warehouses WHERE organization_id = p_org_id AND deleted_at IS NULL LIMIT 1)
    ON CONFLICT (organization_id) DO UPDATE SET
        default_revenue_account = EXCLUDED.default_revenue_account,
        default_insurance_account = EXCLUDED.default_insurance_account;
END;
$$ LANGUAGE plpgsql;

-- 4. ربط الدالة بـ Trigger إنشاء الشركة في نظام الساس
-- (هذا الجزء يعتمد على اسم الـ Trigger الحالي في نظامك، سأضعه كتعليق للتوضيح)
/*
CREATE TRIGGER trg_on_company_create_hims
AFTER INSERT ON organizations
FOR EACH ROW
WHEN (NEW.business_activity = 'HOSPITAL')
EXECUTE FUNCTION initialize_hospital_data(NEW.id);
*/

COMMENT ON FUNCTION initialize_hospital_data IS 'تقوم هذه الدالة بإنشاء البيانات الأساسية للمستشفى فور إنشاء شركة جديدة بنشاط طبي';