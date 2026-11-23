-- ==============================================================================
-- 🚀 TriPro ERP — Enterprise Incident & Crash Telemetry Hub Migration
-- services/migrations/2026-11-23_system_telemetry_incidents.sql
-- ==============================================================================
-- الغرض:
--   1. إنشاء جدول مخصص للحوادث التشغيلية (system_telemetry_incidents)
--   2. دمج تكرارات الخطأ ذكياً عبر بصمة التشفير (error_fingerprint & occurrence_count)
--   3. تسجيل تفاصيل الجهاز والشاشة والفرع والخطورة (FATAL, CRITICAL, WARNING, INFO)
--   4. تتبع حالة المعالجة (open, investigating, resolved)
--   5. توفير إجراء مخزن RPC ذري (report_telemetry_incident) لتسجيل الحادثة بدون أخطاء
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.system_telemetry_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    error_fingerprint TEXT NOT NULL,
    error_message TEXT NOT NULL,
    error_stack TEXT,
    component_stack TEXT,
    severity TEXT NOT NULL DEFAULT 'CRITICAL' CHECK (severity IN ('FATAL', 'CRITICAL', 'WARNING', 'INFO')),
    module_name TEXT NOT NULL DEFAULT 'ApplicationCore',
    route_url TEXT,
    device_info JSONB DEFAULT '{}'::jsonb,
    user_id UUID,
    user_name TEXT,
    branch_name TEXT,
    occurrence_count INTEGER NOT NULL DEFAULT 1,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved')),
    resolution_notes TEXT,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- فهارس الأداء السريع
CREATE INDEX IF NOT EXISTS idx_telemetry_incidents_org ON public.system_telemetry_incidents(organization_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_incidents_fingerprint ON public.system_telemetry_incidents(error_fingerprint);
CREATE INDEX IF NOT EXISTS idx_telemetry_incidents_status_sev ON public.system_telemetry_incidents(status, severity);
CREATE INDEX IF NOT EXISTS idx_telemetry_incidents_last_seen ON public.system_telemetry_incidents(last_seen_at DESC);

-- إجراء الإبلاغ والتجميع الذري
CREATE OR REPLACE FUNCTION public.report_telemetry_incident(
    p_error_fingerprint TEXT,
    p_error_message TEXT,
    p_severity TEXT DEFAULT 'CRITICAL',
    p_module_name TEXT DEFAULT 'ApplicationCore',
    p_error_stack TEXT DEFAULT NULL,
    p_component_stack TEXT DEFAULT NULL,
    p_route_url TEXT DEFAULT NULL,
    p_device_info JSONB DEFAULT '{}'::jsonb,
    p_organization_id UUID DEFAULT NULL,
    p_user_id UUID DEFAULT NULL,
    p_user_name TEXT DEFAULT NULL,
    p_branch_name TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_incident_id UUID;
    v_occurrence_count INT;
    v_existing_status TEXT;
    v_is_new BOOLEAN := false;
BEGIN
    -- البحث عن حادثة نشطة غير محلولة لنفس البصمة والمنشأة
    SELECT id, occurrence_count, status
    INTO v_incident_id, v_occurrence_count, v_existing_status
    FROM public.system_telemetry_incidents
    WHERE error_fingerprint = p_error_fingerprint
      AND organization_id IS NOT DISTINCT FROM p_organization_id
      AND status != 'resolved'
    ORDER BY last_seen_at DESC
    LIMIT 1;

    IF v_incident_id IS NOT NULL THEN
        -- تحديث الحادثة القائمة ورفع عدد مرات التكرار وتحديث آخر ظهور
        UPDATE public.system_telemetry_incidents
        SET occurrence_count = occurrence_count + 1,
            last_seen_at = now(),
            route_url = COALESCE(p_route_url, route_url),
            device_info = COALESCE(p_device_info, device_info),
            error_message = p_error_message,
            error_stack = COALESCE(p_error_stack, error_stack),
            metadata = system_telemetry_incidents.metadata || p_metadata
        WHERE id = v_incident_id;

        v_occurrence_count := v_occurrence_count + 1;
    ELSE
        -- إنشاء حادثة جديدة
        INSERT INTO public.system_telemetry_incidents (
            organization_id,
            error_fingerprint,
            error_message,
            error_stack,
            component_stack,
            severity,
            module_name,
            route_url,
            device_info,
            user_id,
            user_name,
            branch_name,
            occurrence_count,
            first_seen_at,
            last_seen_at,
            status,
            metadata
        ) VALUES (
            p_organization_id,
            p_error_fingerprint,
            p_error_message,
            p_error_stack,
            p_component_stack,
            COALESCE(p_severity, 'CRITICAL'),
            COALESCE(p_module_name, 'ApplicationCore'),
            p_route_url,
            COALESCE(p_device_info, '{}'::jsonb),
            p_user_id,
            p_user_name,
            p_branch_name,
            1,
            now(),
            now(),
            'open',
            COALESCE(p_metadata, '{}'::jsonb)
        )
        RETURNING id INTO v_incident_id;

        v_occurrence_count := 1;
        v_is_new := true;
    END IF;

    RETURN jsonb_build_object(
        'id', v_incident_id,
        'occurrence_count', v_occurrence_count,
        'is_new', v_is_new
    );
END;
$$;

-- سياسات الأمان والحماية (RLS)
ALTER TABLE public.system_telemetry_incidents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Allow anon and auth insert for telemetry incidents" ON public.system_telemetry_incidents;
    DROP POLICY IF EXISTS "Allow members and admins read telemetry incidents" ON public.system_telemetry_incidents;
    DROP POLICY IF EXISTS "Allow admins update telemetry incidents" ON public.system_telemetry_incidents;
END $$;

CREATE POLICY "Allow anon and auth insert for telemetry incidents"
ON public.system_telemetry_incidents
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow members and admins read telemetry incidents"
ON public.system_telemetry_incidents
FOR SELECT
TO authenticated
USING (
  organization_id IS NULL OR
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ) OR
  EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'manager')
  )
);

CREATE POLICY "Allow admins update telemetry incidents"
ON public.system_telemetry_incidents
FOR UPDATE
TO authenticated
USING (
  organization_id IS NULL OR
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ) OR
  EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'manager')
  )
);

GRANT ALL ON public.system_telemetry_incidents TO authenticated, service_role;
GRANT INSERT ON public.system_telemetry_incidents TO anon;
GRANT EXECUTE ON FUNCTION public.report_telemetry_incident TO anon, authenticated, service_role;
