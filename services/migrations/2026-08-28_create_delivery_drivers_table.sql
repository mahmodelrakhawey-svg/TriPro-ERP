-- ==============================================================================
-- Migration: Create Delivery Drivers Directory (دليل كباتن التوصيل)
-- التاريخ: 2026-08-28
-- الهدف: حفظ وإدارة كباتن وسائقي التوصيل مرة واحدة واختيارهم مباشرة مع إمكانية الحذف والإلغاء
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.delivery_drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    vehicle_type TEXT DEFAULT 'موتوسيكل',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.delivery_drivers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "delivery_drivers_org_policy" ON public.delivery_drivers;
CREATE POLICY "delivery_drivers_org_policy" ON public.delivery_drivers
    FOR ALL TO authenticated, anon
    USING (true)
    WITH CHECK (true);

GRANT ALL ON public.delivery_drivers TO authenticated, anon;

SELECT '✅ تم إنشاء جدول كباتن التوصيل delivery_drivers بنجاح' as status;
