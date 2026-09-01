-- ==============================================================================
-- Migration: Enterprise Fixed Assets & Construction Equipment Suite (10/10)
-- التاريخ: 2026-09-01
-- الميزات: الجرد الميداني بالباركود، استوديو ملصقات QR، ربط معدات المقاولات بالمشاريع، ومناقلات المواقع
-- ==============================================================================

-- 1. ترقية جدول الأصول الثابتة وحقول الربط الميداني والمقاولات
DO $$ BEGIN
    -- كود الباركود / التاج
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets' AND column_name = 'asset_tag') THEN
        ALTER TABLE public.assets ADD COLUMN asset_tag VARCHAR(100);
    END IF;

    -- الرقم التسلسلي
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets' AND column_name = 'serial_number') THEN
        ALTER TABLE public.assets ADD COLUMN serial_number VARCHAR(100);
    END IF;

    -- التصنيف
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets' AND column_name = 'category') THEN
        ALTER TABLE public.assets ADD COLUMN category VARCHAR(100) DEFAULT 'MACHINERY';
    END IF;

    -- مشروع المقاولات المرتبط به الأصل حالياً
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets' AND column_name = 'project_id') THEN
        ALTER TABLE public.assets ADD COLUMN project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets' AND column_name = 'project_name') THEN
        ALTER TABLE public.assets ADD COLUMN project_name VARCHAR(255);
    END IF;

    -- الموقع الميداني الحالي
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets' AND column_name = 'current_location') THEN
        ALTER TABLE public.assets ADD COLUMN current_location VARCHAR(255) DEFAULT 'الموقع الرئيسي';
    END IF;

    -- المسؤول عن العهدة
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets' AND column_name = 'custodian_id') THEN
        ALTER TABLE public.assets ADD COLUMN custodian_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets' AND column_name = 'custodian_name') THEN
        ALTER TABLE public.assets ADD COLUMN custodian_name VARCHAR(255);
    END IF;

    -- الحالة الفنية للأصل
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets' AND column_name = 'asset_condition') THEN
        ALTER TABLE public.assets ADD COLUMN asset_condition VARCHAR(50) DEFAULT 'GOOD'; -- EXCELLENT, GOOD, FAIR, NEEDS_MAINTENANCE, DAMAGED, OUT_OF_SERVICE
    END IF;

    -- تكلفة تشغيل ساعة المعدة في مشاريع المقاولات
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets' AND column_name = 'hourly_operating_cost') THEN
        ALTER TABLE public.assets ADD COLUMN hourly_operating_cost NUMERIC(15,2) DEFAULT 0.00;
    END IF;

    -- تاريخ وحالة آخر جرد ميداني
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets' AND column_name = 'last_audit_date') THEN
        ALTER TABLE public.assets ADD COLUMN last_audit_date TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets' AND column_name = 'last_audit_status') THEN
        ALTER TABLE public.assets ADD COLUMN last_audit_status VARCHAR(50) DEFAULT 'UNVERIFIED'; -- VERIFIED, RELOCATED, MISSING, MAINTENANCE_REQUIRED, UNVERIFIED
    END IF;
END $$;

-- 2. جدول عمليات وسجلات الجرد الميداني بالباركود (Asset Physical Audits)
CREATE TABLE IF NOT EXISTS public.asset_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
    asset_tag VARCHAR(100),
    asset_name VARCHAR(255) NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    project_name VARCHAR(255),
    scanned_location VARCHAR(255),
    audit_status VARCHAR(50) NOT NULL, -- VERIFIED, RELOCATED, MISSING, MAINTENANCE_REQUIRED
    auditor_id UUID,
    auditor_name VARCHAR(255),
    condition VARCHAR(50) DEFAULT 'GOOD',
    notes TEXT,
    audit_timestamp TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. جدول مناقلات ونقل الأصول والمعدات بين مشاريع المقاولات والفروع (Asset & Equipment Transfers)
CREATE TABLE IF NOT EXISTS public.asset_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    transfer_number VARCHAR(100) NOT NULL,
    asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
    asset_name VARCHAR(255) NOT NULL,
    from_project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    from_project_name VARCHAR(255),
    to_project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    to_project_name VARCHAR(255) NOT NULL,
    from_location VARCHAR(255),
    to_location VARCHAR(255) NOT NULL,
    from_custodian_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    to_custodian_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(50) DEFAULT 'COMPLETED', -- PENDING, IN_TRANSIT, COMPLETED, CANCELLED
    driver_name VARCHAR(255),
    transport_vehicle VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. تفعيل سياسات الأمان RLS
ALTER TABLE public.asset_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_asset_audits" ON public.asset_audits;
CREATE POLICY "allow_all_asset_audits" ON public.asset_audits FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_asset_transfers" ON public.asset_transfers;
CREATE POLICY "allow_all_asset_transfers" ON public.asset_transfers FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.asset_audits TO authenticated, anon;
GRANT ALL ON public.asset_transfers TO authenticated, anon;

-- 5. توليد أكواد باركود مبدئية للأصول التي لا تحتوي على باركود
UPDATE public.assets
SET asset_tag = 'AST-' || UPPER(SUBSTRING(id::text, 1, 8))
WHERE asset_tag IS NULL OR asset_tag = '';

SELECT '✅ تم تجهيز وتحديث قاعدة بيانات الأصول الثابتة ومعدات المقاولات بنجاح (10/10 EAM Suite)' as status;
