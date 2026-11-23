-- ==============================================================================
-- 🚀 TriPro ERP — Annual Fiscal Archiving & Historical Ledger Engine
-- sql_updates/2026-11-23_annual_data_archiving_and_historical_ledger.sql
-- ==============================================================================
-- الغرض:
--   1. إنشاء جداول الأرشيف المعزول للبيانات التاريخية القديمة:
--      - public.annual_fiscal_archives (سجل الأرشفة الرسمي والرقابي)
--      - public.archived_journal_entries (أرشيف رؤوس القيود المحاسبية)
--      - public.archived_journal_lines (أرشيف أسطر دفتر الأستاذ العام)
--      - public.archived_stock_ledger (أرشيف حركات دفتر المخزون)
--   2. إنشاء View موحد ذكي للاستعلام التاريخي دون أي انقطاع:
--      - public.v_comprehensive_journal_ledger
--   3. بناء إجراء مخزن ذكي للأرشفة الآمنة بدون توقف (Zero-Downtime Safe RPC):
--      - public.archive_closed_fiscal_year_rpc
-- ==============================================================================

-- 1. جدول سجل الأرشفة السنوي
CREATE TABLE IF NOT EXISTS public.annual_fiscal_archives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    fiscal_year_id UUID NOT NULL,
    fiscal_year_name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_by UUID,
    journal_entries_count BIGINT DEFAULT 0,
    journal_lines_count BIGINT DEFAULT 0,
    stock_ledger_count BIGINT DEFAULT 0,
    total_debit NUMERIC(19,4) DEFAULT 0,
    total_credit NUMERIC(19,4) DEFAULT 0,
    checksum TEXT,
    status TEXT NOT NULL DEFAULT 'COMPLETED',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_annual_fiscal_archives_org_year UNIQUE (organization_id, fiscal_year_id)
);

CREATE INDEX IF NOT EXISTS idx_annual_archives_lookup 
ON public.annual_fiscal_archives(organization_id, start_date, end_date);

-- 2. جدول أرشيف رؤوس القيود
CREATE TABLE IF NOT EXISTS public.archived_journal_entries (
    id UUID PRIMARY KEY,
    archive_id UUID NOT NULL REFERENCES public.annual_fiscal_archives(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    reference VARCHAR(100),
    description TEXT,
    status VARCHAR(50) DEFAULT 'posted',
    transaction_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    source VARCHAR(100),
    source_id UUID,
    archived_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_archived_je_lookup 
ON public.archived_journal_entries(organization_id, transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_archived_je_archive_id 
ON public.archived_journal_entries(archive_id);

-- 3. جدول أرشيف أسطر دفتر الأستاذ المحاسبي
CREATE TABLE IF NOT EXISTS public.archived_journal_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    archive_id UUID NOT NULL REFERENCES public.annual_fiscal_archives(id) ON DELETE CASCADE,
    journal_entry_id UUID NOT NULL REFERENCES public.archived_journal_entries(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
    debit NUMERIC(19,4) NOT NULL DEFAULT 0,
    credit NUMERIC(19,4) NOT NULL DEFAULT 0,
    description TEXT,
    cost_center_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_archived_jl_account 
ON public.archived_journal_lines(organization_id, account_id);

CREATE INDEX IF NOT EXISTS idx_archived_jl_entry 
ON public.archived_journal_lines(journal_entry_id);

CREATE INDEX IF NOT EXISTS idx_archived_jl_archive 
ON public.archived_journal_lines(archive_id);

-- 4. جدول أرشيف دفتر الأستاذ المخزني
CREATE TABLE IF NOT EXISTS public.archived_stock_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    archive_id UUID NOT NULL REFERENCES public.annual_fiscal_archives(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
    posting_date DATE NOT NULL,
    transaction_time TIMESTAMPTZ NOT NULL,
    voucher_type VARCHAR(50) NOT NULL,
    voucher_id UUID NOT NULL,
    voucher_line_id UUID,
    voucher_no VARCHAR(100),
    direction VARCHAR(3) NOT NULL,
    quantity NUMERIC(15, 4) NOT NULL,
    quantity_delta NUMERIC(15, 4),
    uom_id UUID,
    unit_cost NUMERIC(15, 4) DEFAULT 0,
    unit_price NUMERIC(15, 4) DEFAULT 0,
    total_cost NUMERIC(15, 4),
    batch_no VARCHAR(100),
    expiry_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    archived_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_archived_stock_lookup 
ON public.archived_stock_ledger(organization_id, product_id, warehouse_id, posting_date DESC);

CREATE INDEX IF NOT EXISTS idx_archived_stock_archive 
ON public.archived_stock_ledger(archive_id);

-- 5. تفعيل أمان مستوى الصفوف (Row Level Security - RLS)
ALTER TABLE public.annual_fiscal_archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archived_journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archived_journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archived_stock_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "archives_org_read" ON public.annual_fiscal_archives;
CREATE POLICY "archives_org_read" ON public.annual_fiscal_archives 
FOR SELECT USING (true);

DROP POLICY IF EXISTS "archived_je_org_read" ON public.archived_journal_entries;
CREATE POLICY "archived_je_org_read" ON public.archived_journal_entries 
FOR SELECT USING (true);

DROP POLICY IF EXISTS "archived_jl_org_read" ON public.archived_journal_lines;
CREATE POLICY "archived_jl_org_read" ON public.archived_journal_lines 
FOR SELECT USING (true);

DROP POLICY IF EXISTS "archived_sl_org_read" ON public.archived_stock_ledger;
CREATE POLICY "archived_sl_org_read" ON public.archived_stock_ledger 
FOR SELECT USING (true);

-- منح الصلاحيات
GRANT SELECT ON public.annual_fiscal_archives TO authenticated, anon;
GRANT SELECT ON public.archived_journal_entries TO authenticated, anon;
GRANT SELECT ON public.archived_journal_lines TO authenticated, anon;
GRANT SELECT ON public.archived_stock_ledger TO authenticated, anon;

GRANT ALL ON public.annual_fiscal_archives TO service_role;
GRANT ALL ON public.archived_journal_entries TO service_role;
GRANT ALL ON public.archived_journal_lines TO service_role;
GRANT ALL ON public.archived_stock_ledger TO service_role;

-- 6. عرض الاستعلام التاريخي الموحد (Smart Unified Ledger View)
CREATE OR REPLACE VIEW public.v_comprehensive_journal_ledger AS
-- الحركات النشطة الحالية
SELECT 
    jl.id AS line_id,
    je.id AS entry_id,
    je.organization_id,
    je.reference,
    je.description AS entry_description,
    je.status,
    je.transaction_date,
    jl.account_id,
    jl.debit,
    jl.credit,
    jl.description AS line_description,
    jl.created_at,
    false AS is_archived,
    NULL::UUID AS archive_id
FROM public.journal_lines jl
JOIN public.journal_entries je ON jl.journal_entry_id = je.id

UNION ALL

-- الحركات المؤرشفة التاريخية
SELECT 
    ajl.id AS line_id,
    aje.id AS entry_id,
    aje.organization_id,
    aje.reference,
    aje.description AS entry_description,
    aje.status,
    aje.transaction_date,
    ajl.account_id,
    ajl.debit,
    ajl.credit,
    ajl.description AS line_description,
    ajl.created_at,
    true AS is_archived,
    ajl.archive_id
FROM public.archived_journal_lines ajl
JOIN public.archived_journal_entries aje ON ajl.journal_entry_id = aje.id;

GRANT SELECT ON public.v_comprehensive_journal_ledger TO authenticated, anon, service_role;

-- 7. الإجراء المخزن الذكي للأرشفة بدون توقف (Zero-Downtime Safe Batch Archiving RPC)
CREATE OR REPLACE FUNCTION public.archive_closed_fiscal_year_rpc(
    p_org_id UUID,
    p_fiscal_year_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_fy RECORD;
    v_archive_id UUID;
    v_entries_count BIGINT := 0;
    v_lines_count BIGINT := 0;
    v_stock_count BIGINT := 0;
    v_total_debit NUMERIC(19,4) := 0;
    v_total_credit NUMERIC(19,4) := 0;
    v_checksum TEXT;
BEGIN
    -- 1. التحقق من وجود المنشأة
    IF p_org_id IS NULL THEN
        RAISE EXCEPTION 'معرف المنظمة مطلوب لإجراء الأرشفة';
    END IF;

    -- 2. التحقق من وجود السنة المالية وحالتها (يجب أن تكون مقفلة)
    SELECT * INTO v_fy
    FROM public.fiscal_years
    WHERE id = p_fiscal_year_id AND organization_id = p_org_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'السنة المالية المحددة غير موجودة في هذه المنظمة';
    END IF;

    IF COALESCE(v_fy.is_closed, false) = false THEN
        RAISE EXCEPTION 'لا يمكن أرشفة سنة مالية مفتوحة. يجب إقفال السنة المالية أولاً وترحيل الأرباح والخسائر.';
    END IF;

    -- 3. التحقق من عدم وجود أرشفة سابقة لنفس السنة
    IF EXISTS (
        SELECT 1 FROM public.annual_fiscal_archives 
        WHERE organization_id = p_org_id AND fiscal_year_id = p_fiscal_year_id
    ) THEN
        RAISE EXCEPTION 'تمت أرشفة هذه السنة المالية مسبقاً في جدول الأرشيف الرسمي.';
    END IF;

    -- 4. إحصاء الحركات والتحقق من التوازن المالي التام
    SELECT 
        COUNT(DISTINCT je.id),
        COUNT(jl.id),
        COALESCE(SUM(jl.debit), 0),
        COALESCE(SUM(jl.credit), 0)
    INTO 
        v_entries_count,
        v_lines_count,
        v_total_debit,
        v_total_credit
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    WHERE je.organization_id = p_org_id
      AND je.transaction_date >= v_fy.start_date
      AND je.transaction_date <= v_fy.end_date
      AND je.status = 'posted';

    IF v_total_debit <> v_total_credit THEN
        RAISE EXCEPTION 'فشل أمان الأرشفة: قيود السنة المالية غير متوازنة (مدين: % | دائن: %). تم إيقاف العملية لمنع تشوه البيانات.', v_total_debit, v_total_credit;
    END IF;

    -- 5. إنشاء بصمة التحقق الرقمية (SHA-256 Checksum)
    v_checksum := encode(digest(
        p_org_id::text || '_' || p_fiscal_year_id::text || '_' || v_lines_count::text || '_' || v_total_debit::text,
        'sha256'
    ), 'hex');

    -- 6. إنشاء سجل الأرشيف في جدول الرقابة
    INSERT INTO public.annual_fiscal_archives (
        organization_id,
        fiscal_year_id,
        fiscal_year_name,
        start_date,
        end_date,
        archived_by,
        journal_entries_count,
        journal_lines_count,
        stock_ledger_count,
        total_debit,
        total_credit,
        checksum,
        status,
        notes
    ) VALUES (
        p_org_id,
        p_fiscal_year_id,
        COALESCE(v_fy.name, 'السنة المالية ' || v_fy.start_date || ' - ' || v_fy.end_date),
        v_fy.start_date,
        v_fy.end_date,
        auth.uid(),
        v_entries_count,
        v_lines_count,
        0,
        v_total_debit,
        v_total_credit,
        v_checksum,
        'PROCESSING',
        p_notes
    ) RETURNING id INTO v_archive_id;

    -- 7. نقل رؤوس القيود إلى جدول الأرشيف
    INSERT INTO public.archived_journal_entries (
        id,
        archive_id,
        organization_id,
        reference,
        description,
        status,
        transaction_date,
        created_at,
        created_by,
        source,
        source_id
    )
    SELECT 
        je.id,
        v_archive_id,
        je.organization_id,
        je.reference,
        je.description,
        je.status,
        je.transaction_date,
        je.created_at,
        je.created_by,
        je.source,
        je.source_id
    FROM public.journal_entries je
    WHERE je.organization_id = p_org_id
      AND je.transaction_date >= v_fy.start_date
      AND je.transaction_date <= v_fy.end_date
      AND je.status = 'posted'
    ON CONFLICT (id) DO NOTHING;

    -- 8. نقل أسطر القيود إلى جدول الأرشيف
    INSERT INTO public.archived_journal_lines (
        id,
        archive_id,
        journal_entry_id,
        organization_id,
        account_id,
        debit,
        credit,
        description,
        cost_center_id,
        created_at
    )
    SELECT 
        jl.id,
        v_archive_id,
        jl.journal_entry_id,
        p_org_id,
        jl.account_id,
        jl.debit,
        jl.credit,
        jl.description,
        jl.cost_center_id,
        jl.created_at
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    WHERE je.organization_id = p_org_id
      AND je.transaction_date >= v_fy.start_date
      AND je.transaction_date <= v_fy.end_date
      AND je.status = 'posted'
    ON CONFLICT (id) DO NOTHING;

    -- 9. نقل حركات الأستاذ المخزني إلى جدول أرشيف المخزون (إن وجدت)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stock_ledger') THEN
        INSERT INTO public.archived_stock_ledger (
            id,
            archive_id,
            organization_id,
            product_id,
            warehouse_id,
            posting_date,
            transaction_time,
            voucher_type,
            voucher_id,
            voucher_line_id,
            voucher_no,
            direction,
            quantity,
            quantity_delta,
            uom_id,
            unit_cost,
            unit_price,
            total_cost,
            batch_no,
            expiry_date,
            notes,
            created_at,
            created_by
        )
        SELECT 
            sl.id,
            v_archive_id,
            sl.organization_id,
            sl.product_id,
            sl.warehouse_id,
            sl.posting_date,
            sl.transaction_time,
            sl.voucher_type,
            sl.voucher_id,
            sl.voucher_line_id,
            sl.voucher_no,
            sl.direction,
            sl.quantity,
            sl.quantity_delta,
            sl.uom_id,
            sl.unit_cost,
            sl.unit_price,
            sl.total_cost,
            sl.batch_no,
            sl.expiry_date,
            sl.notes,
            sl.created_at,
            sl.created_by
        FROM public.stock_ledger sl
        WHERE sl.organization_id = p_org_id
          AND sl.posting_date >= v_fy.start_date
          AND sl.posting_date <= v_fy.end_date
        ON CONFLICT (id) DO NOTHING;

        GET DIAGNOSTICS v_stock_count = ROW_COUNT;
    END IF;

    -- 10. تفريغ الحركات المؤرشفة من الجداول النشطة بأمان بعد تأكيد نسخها في الأرشيف
    DELETE FROM public.journal_lines
    WHERE id IN (
        SELECT id FROM public.archived_journal_lines WHERE archive_id = v_archive_id
    );

    DELETE FROM public.journal_entries
    WHERE id IN (
        SELECT id FROM public.archived_journal_entries WHERE archive_id = v_archive_id
    );

    IF v_stock_count > 0 THEN
        DELETE FROM public.stock_ledger
        WHERE id IN (
            SELECT id FROM public.archived_stock_ledger WHERE archive_id = v_archive_id
        );
    END IF;

    -- 11. تحديث حالة الأرشيف إلى مكتمل
    UPDATE public.annual_fiscal_archives
    SET 
        status = 'COMPLETED',
        stock_ledger_count = v_stock_count
    WHERE id = v_archive_id;

    RETURN jsonb_build_object(
        'success', true,
        'archive_id', v_archive_id,
        'fiscal_year_id', p_fiscal_year_id,
        'fiscal_year_name', v_fy.name,
        'journal_entries_count', v_entries_count,
        'journal_lines_count', v_lines_count,
        'stock_ledger_count', v_stock_count,
        'total_debit', v_total_debit,
        'total_credit', v_total_credit,
        'checksum', v_checksum
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_closed_fiscal_year_rpc(UUID, UUID, TEXT) 
TO authenticated, service_role;
