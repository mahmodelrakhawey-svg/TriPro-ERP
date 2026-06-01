-- 🏭 مديول محاسبة التكاليف المتقدم (Advanced Cost Accounting)
-- ℹ️ الوصف: النسخة الشاملة والموحدة لمحرك تكاليف المراحل (Process Costing)
-- 🛡️ الميزات: الإنتاج المعادل، تسوية WIP للأستاذ العام، نقاط الفحص، والتحكم في نقاط إضافة المواد.
-- 📅 تاريخ التحديث: 2024-06-03

-- ================================================================
-- 1. تحديث الهيكل لدعم محاسبة التكاليف (Schema Enhancements)
-- ================================================================
DO $$ 
BEGIN
    -- إضافة نسبة الإتمام المتوقعة لكل خطوة في المسار الإنتاجي
    ALTER TABLE public.mfg_routing_steps ADD COLUMN IF NOT EXISTS conversion_weight numeric DEFAULT 0;
    ALTER TABLE public.mfg_routing_steps ADD COLUMN IF NOT EXISTS material_addition_point numeric DEFAULT 0;
    ALTER TABLE public.mfg_routing_steps ADD COLUMN IF NOT EXISTS inspection_point numeric DEFAULT 100; -- افتراضياً الفحص في نهاية المرحلة
    ALTER TABLE public.mfg_production_orders ADD COLUMN IF NOT EXISTS is_continuous boolean DEFAULT false; -- هل الطلب مستمر من فترة سابقة؟
    
    -- إضافة نسبة الإتمام الفعلية في سجلات التقدم للإنتاج تحت التشغيل
    ALTER TABLE public.mfg_order_progress ADD COLUMN IF NOT EXISTS material_completion_pct numeric DEFAULT 0;
    ALTER TABLE public.mfg_order_progress ADD COLUMN IF NOT EXISTS conversion_completion_pct numeric DEFAULT 0;

    -- تطوير جدول التالف للتمييز بين المسموح وغير المسموح
    ALTER TABLE public.mfg_scrap_logs ADD COLUMN IF NOT EXISTS is_abnormal boolean DEFAULT false;
    ALTER TABLE public.mfg_scrap_logs ADD COLUMN IF NOT EXISTS salvage_value_per_unit numeric DEFAULT 0;
    ALTER TABLE public.mfg_scrap_logs ADD COLUMN IF NOT EXISTS recovery_account_id uuid REFERENCES public.accounts(id);

    -- إضافة عمود معدل الساعة للموظفين لدعم حسابات الأجور الفعلية
    ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS hourly_rate numeric DEFAULT 0;

    -- تأمين أعمدة الربط في القيود المحاسبية لضمان عمل محرك التوزيع
    ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS related_document_id uuid;
    ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS related_document_type text;
END $$;

-- جدول المنتجات العرضية (By-products Logs) لتحميل قيمتها كتخفيض للتكاليف
CREATE TABLE IF NOT EXISTS public.mfg_byproducts_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_progress_id uuid REFERENCES public.mfg_order_progress(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric NOT NULL DEFAULT 0,
    market_value_per_unit numeric DEFAULT 0,
    organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

-- جدول أرصدة أول المدة للإنتاج تحت التشغيل (Beginning WIP Inventory)
-- يستخدم للأوامر المستمرة من شهر لآخر لضمان عدم ضياع التكاليف التاريخية
CREATE TABLE IF NOT EXISTS public.mfg_beginning_wip_inventory (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id uuid REFERENCES public.mfg_production_orders(id) ON DELETE CASCADE,
    material_cost_bf numeric DEFAULT 0, -- Brought Forward
    conversion_cost_bf numeric DEFAULT 0,
    organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

-- 🛡️ جدول سجل التنبيهات الصناعية التاريخي (Historical Manufacturing Alerts)
CREATE TABLE IF NOT EXISTS public.mfg_alerts_log (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id uuid REFERENCES public.mfg_production_orders(id) ON DELETE CASCADE,
    alert_type text NOT NULL, -- cost_overrun, efficiency_drop, variance_critical
    title text,
    message text,
    actual_value numeric,
    threshold_value numeric,
    organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

-- جدول لقطات تكاليف الفترة (Period Cost Snapshots) للتقييم التاريخي لـ WIP
CREATE TABLE IF NOT EXISTS public.mfg_period_cost_snapshots (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    period_name text NOT NULL,
    order_id uuid REFERENCES public.mfg_production_orders(id),
    material_unit_cost numeric DEFAULT 0,
    conversion_unit_cost numeric DEFAULT 0,
    wip_valuation numeric DEFAULT 0,
    finished_goods_valuation numeric DEFAULT 0,
    abnormal_scrap_loss numeric DEFAULT 0,
    organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

-- ================================================================
-- 1.5 تكامل الأجور الفعلية (Labor Integration Logic)
-- ================================================================

-- 📊 رؤية الأجور الفعلية بناءً على بيانات الموارد البشرية
CREATE OR REPLACE VIEW public.v_mfg_actual_labor_costs WITH (security_invoker = true) AS
SELECT 
    op.id as progress_id,
    op.production_order_id,
    op.employee_id,
    e.full_name as employee_name,
    -- حساب ساعات العمل الفعلية بالدقائق وتحويلها لساعات
    EXTRACT(EPOCH FROM (op.actual_end_time - op.actual_start_time)) / 3600.0 as actual_hours_worked,
    -- جلب معدل الساعة الحقيقي (أو الراتب مقسوماً على 240 ساعة شهرية)
    COALESCE(
        e.hourly_rate, 
        (NULLIF(e.salary, 0) / 240.0), 
        wc.hourly_rate
    ) as employee_actual_rate,
    -- التكلفة الفعلية = الساعات * المعدل الحقيقي
    ROUND(
        (EXTRACT(EPOCH FROM (op.actual_end_time - op.actual_start_time)) / 3600.0) * 
        COALESCE(e.hourly_rate, (NULLIF(e.salary, 0) / 240.0), wc.hourly_rate), 
        2
    ) as actual_labor_cost
FROM public.mfg_order_progress op
JOIN public.employees e ON op.employee_id = e.id
JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
WHERE op.status = 'completed';

-- ================================================================
-- 2. الرؤى التقاريرية (Cost Accounting Views)
-- ================================================================

-- 📊 1. تقرير الإنتاج المعادل التفصيلي (Step 2 of Process Costing)
DROP VIEW IF EXISTS public.v_mfg_equivalent_units CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_equivalent_units WITH (security_invoker = true) AS
WITH stage_data AS (
    SELECT 
        op.production_order_id,
        rs.operation_name,
        op.produced_qty as units_in_process,
        op.status,
        CASE 
            WHEN op.status = 'completed' THEN op.produced_qty
            WHEN op.material_completion_pct >= rs.material_addition_point THEN op.produced_qty
            ELSE (op.produced_qty * (op.material_completion_pct / 100))
        END as material_eq_units,
        CASE 
            WHEN op.status = 'completed' THEN op.produced_qty
            ELSE (op.produced_qty * (op.conversion_completion_pct / 100))
        END as conversion_eq_units
    FROM public.mfg_order_progress op
    JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
)
SELECT 
    po.id as order_id,
    po.order_number,
    -- إضافة وحدات أول المدة (Beginning WIP) إذا كان الطلب مستمراً
    COALESCE(SUM(sd.material_eq_units), 0) + COALESCE((SELECT COUNT(*) FROM public.mfg_batch_serials WHERE production_order_id = po.id AND status = 'wip'), 0) as total_material_eq_units,
    COALESCE(SUM(sd.conversion_eq_units), 0) + COALESCE((SELECT COUNT(*) FROM public.mfg_batch_serials WHERE production_order_id = po.id AND status = 'wip'), 0) as total_conversion_eq_units,
    po.organization_id
FROM public.mfg_production_orders po
LEFT JOIN stage_data sd ON po.id = sd.production_order_id
GROUP BY po.id, po.order_number, po.organization_id;

-- 🛠️ دالة توزيع المصاريف الصناعية غير المباشرة الفعلية (Actual Overhead Allocation)
-- تقوم بجلب المصاريف من الأستاذ العام وتوزيعها على الأوامر النشطة بناءً على وحدات التحويل المعادلة
CREATE OR REPLACE FUNCTION public.mfg_allocate_actual_overhead(p_period_start date, p_period_end date, p_description text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_org_id uuid := public.get_my_org();
    v_total_actual_overhead numeric;
    v_total_eq_units numeric;
    v_overhead_per_unit numeric;
    v_je_id uuid;
    v_wip_acc uuid;
    v_applied_ovh_acc uuid;
BEGIN
    -- 1. حساب إجمالي المصاريف الصناعية غير المباشرة الفعلية (أكواد تبدأ بـ 514)
    SELECT COALESCE(SUM(debit - credit), 0) INTO v_total_actual_overhead
    FROM public.journal_lines_view 
    WHERE organization_id = v_org_id AND account_code LIKE '514%' 
    AND transaction_date BETWEEN p_period_start AND p_period_end
    AND (related_document_type IS NULL OR related_document_type != 'mfg_overhead'); -- تجنب الازدواجية بشكل برمجي دقيق

    -- 2. حساب إجمالي وحدات التحويل المعادلة لكافة الأوامر النشطة في الفترة
    SELECT SUM(total_conversion_eq_units) INTO v_total_eq_units 
    FROM public.v_mfg_equivalent_units WHERE organization_id = v_org_id;


    v_wip_acc := public.resolve_leaf_account((SELECT (account_mappings->>'INVENTORY_WIP')::uuid 
                 FROM public.company_settings WHERE organization_id = v_org_id));
    -- جلب أول حساب فرعي متاح تحت "التكاليف الصناعية غير المباشرة" (514) بدلاً من الحساب الرئيسي
    v_applied_ovh_acc := public.resolve_leaf_account((
        SELECT id FROM public.accounts 
        WHERE organization_id = v_org_id AND code LIKE '514%' AND is_group = false 
        ORDER BY code LIMIT 1
        ));


    IF v_total_eq_units > 0 AND v_total_actual_overhead > 0 THEN
        v_overhead_per_unit := v_total_actual_overhead / v_total_eq_units;

        -- 4. إنشاء قيد التوزيع في الأستاذ العام
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_type)
        VALUES (p_period_end, 'توزيع أعباء صناعية فعلية: ' || p_description, 'OVH-ALLOC', 'posted', v_org_id, true, 'mfg_overhead')
        RETURNING id INTO v_je_id;

        -- تحميل الـ WIP (مدين)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
        VALUES (v_je_id, v_wip_acc, v_total_actual_overhead, 0, v_org_id, 'تحميل المصاريف الفعلية على الإنتاج');

        -- إقفال حساب الأعباء الموزعة أو المصاريف (دائن)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
        VALUES (v_je_id, v_applied_ovh_acc, 0, v_total_actual_overhead, v_org_id, 'إقفال حساب الأعباء الموزعة');

        RETURN v_je_id;
    END IF;
    RETURN NULL;
END; $$;

-- 📊 2. تقرير المصالحة النهائية (Step 5: Cost Reconciliation) - نسخة Weighted Average
-- يقوم هذا التقرير بجمع تكاليف الفترة مع أول المدة وتوزيعها على الوحدات التامة وتحت التشغيل
DROP VIEW IF EXISTS public.v_mfg_cost_reconciliation_report CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_cost_reconciliation_report WITH (security_invoker = true) AS
WITH period_costs AS (
    SELECT 
        vop.order_id,
        -- إجمالي التكاليف = تكاليف أول المدة المنقولة + تكاليف الفترة الحالية
        COALESCE(bw.material_cost_bf, 0) + (vop.total_actual_cost * 0.7) as total_material_to_account,
        COALESCE(bw.conversion_cost_bf, 0) + (vop.total_actual_cost * 0.3) as total_conversion_to_account,
        vop.total_actual_cost + COALESCE(bw.material_cost_bf, 0) + COALESCE(bw.conversion_cost_bf, 0) as grand_total_to_account
    FROM public.v_mfg_order_profitability vop
    LEFT JOIN public.mfg_beginning_wip_inventory bw ON vop.order_id = bw.order_id
),
eq_units AS ( SELECT * FROM public.v_mfg_equivalent_units ),
unit_cost_calc AS (
    SELECT 
        pc.order_id,
        -- حساب تكلفة الوحدة المعادلة (المتوسط المرجح)
        CASE WHEN eu.total_material_eq_units > 0 THEN pc.total_material_to_account / eu.total_material_eq_units ELSE 0 END as unit_cost_mat,
        CASE WHEN eu.total_conversion_eq_units > 0 THEN pc.total_conversion_to_account / eu.total_conversion_eq_units ELSE 0 END as unit_cost_conv,
        pc.grand_total_to_account
    FROM period_costs pc
    JOIN eq_units eu ON pc.order_id = eu.order_id
),
allocation AS (
    SELECT 
        ucc.order_id,
        ucc.grand_total_to_account,
        ucc.unit_cost_mat,
        ucc.unit_cost_conv,
        -- 1. تكلفة الوحدات التامة (Finished Goods)
        COALESCE((
            SELECT SUM(produced_qty * (ucc.unit_cost_mat + ucc.unit_cost_conv))
            FROM public.mfg_order_progress WHERE production_order_id = ucc.order_id AND status = 'completed'
        ), 0) as cost_finished,
        -- 2. تكلفة الإنتاج تحت التشغيل (Ending WIP)
        COALESCE((
            SELECT SUM(
                (produced_qty * (material_completion_pct/100) * ucc.unit_cost_mat) +
                (produced_qty * (conversion_completion_pct/100) * ucc.unit_cost_conv)
            )
            FROM public.mfg_order_progress WHERE production_order_id = ucc.order_id AND status = 'active'
        ), 0) as cost_wip,
        -- 3. تكلفة التالف غير المسموح (Abnormal Scrap)
        COALESCE((
            SELECT SUM(sl.quantity * (ucc.unit_cost_mat + ucc.unit_cost_conv))
            FROM public.mfg_scrap_logs sl
            JOIN public.mfg_order_progress op ON sl.order_progress_id = op.id
            WHERE op.production_order_id = ucc.order_id AND sl.is_abnormal = true
        ), 0) as cost_abnormal
    FROM unit_cost_calc ucc
)
SELECT 
    po.id as order_id,
    po.order_number,
    p.name as product_name,
    a.grand_total_to_account as total_to_account_for,
    ROUND(a.cost_finished, 2) as cost_assigned_to_finished_goods,
    ROUND(a.cost_wip, 2) as cost_assigned_to_wip,
    ROUND(a.cost_abnormal, 2) as cost_assigned_to_abnormal_scrap,
    -- إجمالي التكاليف الموزعة (يجب أن يطابق total_to_account_for)
    ROUND(a.cost_finished + a.cost_wip + a.cost_abnormal, 2) as total_accounted_for,
    (a.unit_cost_mat + a.unit_cost_conv) as actual_unit_cost,
    a.unit_cost_mat as cost_per_material_eq,
    a.unit_cost_conv as cost_per_conversion_eq,
    po.organization_id
FROM public.mfg_production_orders po
JOIN public.products p ON po.product_id = p.id
JOIN allocation a ON po.id = a.order_id;

-- 📊 3. تقرير انحرافات التكاليف (Variance per EQ Unit)
DROP VIEW IF EXISTS public.v_mfg_unit_cost_variance CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_unit_cost_variance AS
SELECT 
    cr.order_number,
    cr.product_name,
    ROUND((cr.total_to_account_for / NULLIF(eu.total_material_eq_units, 0)), 2) as actual_unit_cost,
    p.manufacturing_cost as standard_unit_cost,
    ROUND((cr.total_to_account_for / NULLIF(eu.total_material_eq_units, 0)) - p.manufacturing_cost, 2) as variance_amount,
    cr.organization_id
FROM public.v_mfg_cost_reconciliation_report cr
JOIN public.mfg_production_orders po ON cr.order_id = po.id
JOIN public.products p ON po.product_id = p.id
JOIN public.v_mfg_equivalent_units eu ON cr.order_id = eu.order_id;

-- 📊 4. رؤية اتجاهات التكاليف الشهيرة (Cost Trends)
DROP VIEW IF EXISTS public.v_mfg_cost_trends CASCADE;
CREATE VIEW public.v_mfg_cost_trends WITH (security_invoker = true) AS
SELECT 
    to_char(date_trunc('month', po.created_at), 'YYYY-MM') as month_period,
    po.organization_id,
    AVG(cr.actual_unit_cost)::numeric as avg_actual_unit_cost,
    AVG(p.manufacturing_cost)::numeric as avg_standard_unit_cost,
    SUM(cr.total_to_account_for)::numeric as total_actual_cost,
    CASE 
        WHEN SUM(p.manufacturing_cost * po.quantity_to_produce) > 0 
        THEN ROUND(((SUM(cr.total_to_account_for) - SUM(p.manufacturing_cost * po.quantity_to_produce)) / SUM(p.manufacturing_cost * po.quantity_to_produce) * 100), 2)
        ELSE 0 
    END::numeric as variance_pct
FROM public.mfg_production_orders po
JOIN public.products p ON po.product_id = p.id
JOIN public.v_mfg_cost_reconciliation_report cr ON po.id = cr.order_id
GROUP BY 1, 2;

-- 📊 5. تقرير كمية الإنتاج (Units Flow)
DROP VIEW IF EXISTS public.v_mfg_production_quantity_report CASCADE;
CREATE VIEW public.v_mfg_production_quantity_report AS
SELECT 
    po.order_number,
    po.quantity_to_produce as units_started,
    CASE WHEN po.status = 'completed' THEN po.quantity_to_produce ELSE COALESCE((SELECT MAX(produced_qty) FROM public.mfg_order_progress WHERE production_order_id = po.id AND status = 'completed'), 0) END::numeric as units_completed,
    CASE WHEN po.status = 'completed' THEN 0 ELSE po.quantity_to_produce - COALESCE((SELECT MAX(produced_qty) FROM public.mfg_order_progress WHERE production_order_id = po.id AND status = 'completed'), 0) END::numeric as units_in_wip,
    (SELECT COALESCE(SUM(quantity), 0) FROM public.mfg_scrap_logs sl JOIN public.mfg_order_progress op ON sl.order_progress_id = op.id WHERE op.production_order_id = po.id AND sl.is_abnormal = false) as normal_scrap,
    (SELECT COALESCE(SUM(quantity), 0) FROM public.mfg_scrap_logs sl JOIN public.mfg_order_progress op ON sl.order_progress_id = op.id WHERE op.production_order_id = po.id AND sl.is_abnormal = true) as abnormal_scrap,
    po.organization_id
FROM public.mfg_production_orders po;

-- 📊 5. رؤية تشريح تكلفة الوحدة (Unit Cost Anatomy)
-- تفكيك تكلفة القطعة الواحدة إلى عناصرها الأساسية (خامات، أجور فعلية، أعباء)
-- تدعم طريقة المتوسط المرجح بدمج تكاليف أول المدة مع الفترة الحالية للحصول على دقة محاسبية عالمية
CREATE OR REPLACE VIEW public.v_mfg_unit_cost_anatomy WITH (security_invoker = true) AS
WITH mat_totals AS (
    SELECT 
        po.id as order_id,
        COALESCE(bc.material_cost_bf, 0) + 
        COALESCE((
            SELECT SUM(amu.actual_quantity * COALESCE(p.weighted_average_cost, p.cost, 0))
            FROM public.mfg_actual_material_usage amu
            JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id
            JOIN public.products p ON amu.raw_material_id = p.id
            WHERE op.production_order_id = po.id
        ), 0) as total_mat
    FROM public.mfg_production_orders po
    LEFT JOIN public.mfg_beginning_wip_inventory bc ON po.id = bc.order_id
),
conv_totals AS (
    SELECT 
        po.id as order_id,
        -- الأجور الفعلية المسحوبة من مديول الرواتب
        COALESCE((SELECT SUM(labor_cost_actual) FROM public.mfg_order_progress WHERE production_order_id = po.id), 0) as total_lab,
        -- الأعباء الصناعية المحملة (أول مدة + الحالي)
        COALESCE(bc.conversion_cost_bf, 0) + 
        COALESCE((
            SELECT SUM((rs.standard_time_minutes / 60.0) * op.produced_qty * wc.overhead_rate)
            FROM public.mfg_order_progress op
            JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
            JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
            WHERE op.production_order_id = po.id
        ), 0) as total_ovh
    FROM public.mfg_production_orders po
    LEFT JOIN public.mfg_beginning_wip_inventory bc ON po.id = bc.order_id
)
SELECT 
    po.id as order_id,
    po.order_number,
    p.name as product_name,
    COALESCE(ROUND(mt.total_mat / NULLIF(eu.total_material_eq_units, 0), 2), 0) as material_unit_cost,
    COALESCE(ROUND(ct.total_lab / NULLIF(eu.total_conversion_eq_units, 0), 2), 0) as labor_unit_cost,
    COALESCE(ROUND(ct.total_ovh / NULLIF(eu.total_conversion_eq_units, 0), 2), 0) as overhead_unit_cost,
    COALESCE(ROUND(
        (mt.total_mat / NULLIF(eu.total_material_eq_units, 0)) + 
        ((ct.total_lab + ct.total_ovh) / NULLIF(eu.total_conversion_eq_units, 0))
    , 2), 0) as total_actual_unit_cost,
    p.manufacturing_cost as standard_unit_cost,
    po.organization_id
FROM public.mfg_production_orders po
JOIN public.products p ON po.product_id = p.id
JOIN public.v_mfg_equivalent_units eu ON po.id = eu.order_id
JOIN mat_totals mt ON po.id = mt.order_id
JOIN conv_totals ct ON po.id = ct.order_id;

-- ================================================================
-- 3. الدوال المحاسبية المتقدمة (Advanced Costing Logic)
-- ================================================================

-- 🛠️ دالة المحرك الخماسي لتكاليف المراحل
CREATE OR REPLACE FUNCTION public.mfg_calculate_order_cost_reconciliation(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_total_cost numeric; v_eq_material numeric; v_eq_conversion numeric;
    v_cost_per_mat numeric; v_cost_per_conv numeric; v_finished_qty numeric; v_result jsonb;
BEGIN
    SELECT total_actual_cost INTO v_total_cost FROM public.v_mfg_order_profitability WHERE order_id = p_order_id;
    SELECT total_material_eq_units, total_conversion_eq_units INTO v_eq_material, v_eq_conversion FROM public.v_mfg_equivalent_units WHERE order_id = p_order_id;
    
    v_cost_per_mat := CASE WHEN v_eq_material > 0 THEN (v_total_cost * 0.7) / v_eq_material ELSE 0 END;
    v_cost_per_conv := CASE WHEN v_eq_conversion > 0 THEN (v_total_cost * 0.3) / v_eq_conversion ELSE 0 END;
    SELECT SUM(produced_qty) INTO v_finished_qty FROM public.mfg_order_progress WHERE production_order_id = p_order_id AND status = 'completed';

    v_result := jsonb_build_object(
        'order_id', p_order_id,
        'total_to_account_for', v_total_cost,
        'unit_costs', jsonb_build_object('material', ROUND(v_cost_per_mat, 4), 'conversion', ROUND(v_cost_per_conv, 4)),
        'allocation', jsonb_build_object('finished_goods', ROUND(v_finished_qty * (v_cost_per_mat + v_cost_per_conv), 2), 'wip', ROUND(v_total_cost - (v_finished_qty * (v_cost_per_mat + v_cost_per_conv)), 2))
    );
    RETURN v_result;
END; $$;

-- 🛠️ دالة مزامنة تكاليف العمالة الفعلية من مديول HR
-- تقوم بتحديث حقل labor_cost_actual في سجلات التقدم بناءً على بيانات الرواتب الحقيقية
CREATE OR REPLACE FUNCTION public.mfg_sync_actual_labor_costs(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.mfg_order_progress op
    SET labor_cost_actual = alc.actual_labor_cost
    FROM public.v_mfg_actual_labor_costs alc
    WHERE op.id = alc.progress_id
    AND op.production_order_id = p_order_id;
END; $$;

-- 🛠️ تعديل دالة كشف حساب المرحلة لاستخدام الأجور الفعلية المحدثة
CREATE OR REPLACE FUNCTION public.mfg_get_stage_cost_ledger(p_order_id uuid)
RETURNS TABLE (
    stage_name text,
    material_cost numeric,
    labor_cost numeric,
    overhead_cost numeric,
    total_stage_cost numeric
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- نقوم بمزامنة الأجور أولاً قبل جلب التقرير لضمان أحدث البيانات من HR
    PERFORM public.mfg_sync_actual_labor_costs(p_order_id);
    
    RETURN QUERY
    SELECT 
        rs.operation_name,
        -- خامات المرحلة
        COALESCE((SELECT SUM(amu.actual_quantity * COALESCE(p.weighted_average_cost, p.cost, 0)) 
                  FROM public.mfg_actual_material_usage amu 
                  JOIN public.products p ON amu.raw_material_id = p.id 
                  WHERE amu.order_progress_id = op.id), 0) as material_cost,
        -- الأجور الفعلية المسحوبة من HR
        COALESCE(op.labor_cost_actual, 0) as labor_cost,
        -- مصاريف صناعية (الأعباء لا تزال تُحمل بناءً على معدل مركز العمل)
        ROUND(COALESCE((rs.standard_time_minutes / 60.0) * op.produced_qty * wc.overhead_rate, 0), 2) as overhead_cost,
        -- الإجمالي الكلي للمرحلة
        ROUND(
            COALESCE((SELECT SUM(amu.actual_quantity * COALESCE(p.weighted_average_cost, p.cost, 0)) FROM public.mfg_actual_material_usage amu JOIN public.products p ON amu.raw_material_id = p.id WHERE amu.order_progress_id = op.id), 0) +
            COALESCE(op.labor_cost_actual, 0) +
            COALESCE((rs.standard_time_minutes / 60.0) * op.produced_qty * wc.overhead_rate, 0)
        , 2) as total_stage_cost
    FROM public.mfg_order_progress op
    JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
    JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
    WHERE op.production_order_id = p_order_id;
END; $$;

-- 🛠️ دالة تسجيل التالف المتقدم
CREATE OR REPLACE FUNCTION public.mfg_record_scrap_advanced(p_progress_id uuid, p_material_id uuid, p_qty numeric, p_is_abnormal boolean, p_salvage_value numeric DEFAULT 0, p_reason text DEFAULT NULL) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org_id uuid; v_cost_per_unit numeric; v_je_id uuid; v_mappings jsonb; v_wip_acc uuid; v_loss_acc uuid; v_scrap_inv_acc uuid;
BEGIN
    SELECT organization_id INTO v_org_id FROM public.mfg_order_progress WHERE id = p_progress_id;
    SELECT COALESCE(weighted_average_cost, cost, 0) INTO v_cost_per_unit FROM public.products WHERE id = p_material_id;
    INSERT INTO public.mfg_scrap_logs (order_progress_id, product_id, quantity, is_abnormal, salvage_value_per_unit, reason, organization_id) VALUES (p_progress_id, p_material_id, p_qty, p_is_abnormal, p_salvage_value, p_reason, v_org_id);
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_wip_acc := public.resolve_leaf_account((v_mappings->>'INVENTORY_WIP')::uuid);
    v_loss_acc := public.resolve_leaf_account((SELECT id FROM public.accounts WHERE code = '5121' AND organization_id = v_org_id LIMIT 1));
    v_scrap_inv_acc := public.resolve_leaf_account((SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code LIKE '124%' AND is_group = false ORDER BY code DESC LIMIT 1));

    IF p_is_abnormal THEN
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type)
        VALUES (now()::date, 'إثبات تالف غير مسموح - ' || p_reason, 'ABN-SCRAP', 'posted', v_org_id, p_progress_id, 'mfg_scrap') RETURNING id INTO v_je_id;
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id) VALUES (v_je_id, v_loss_acc, (p_qty * (v_cost_per_unit - p_salvage_value)), 0, v_org_id);
        IF p_salvage_value > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id) VALUES (v_je_id, v_scrap_inv_acc, (p_qty * p_salvage_value), 0, v_org_id); END IF;
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id) VALUES (v_je_id, v_wip_acc, 0, (p_qty * v_cost_per_unit), v_org_id);
    ELSIF p_salvage_value > 0 THEN
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type)
        VALUES (now()::date, 'قيمة استردادية لتالف مسموح', 'NORM-SCRAP', 'posted', v_org_id, p_progress_id, 'mfg_scrap') RETURNING id INTO v_je_id;
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id) VALUES (v_je_id, v_scrap_inv_acc, (p_qty * p_salvage_value), 0, v_org_id);
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id) VALUES (v_je_id, v_wip_acc, 0, (p_qty * p_salvage_value), v_org_id);
    END IF;
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- 🛠️ دالة تسجيل المنتج العرضي (By-product) وتخفيض التكلفة
CREATE OR REPLACE FUNCTION public.mfg_record_byproduct(p_progress_id uuid, p_product_id uuid, p_qty numeric, p_market_value numeric) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org_id uuid; v_je_id uuid; v_mappings jsonb;
BEGIN
    SELECT organization_id INTO v_org_id FROM public.mfg_order_progress WHERE id = p_progress_id;
    
    INSERT INTO public.mfg_byproducts_logs (order_progress_id, product_id, quantity, market_value_per_unit, organization_id)
    VALUES (p_progress_id, p_product_id, p_qty, p_market_value, v_org_id);

    -- محاسبياً: قيمة المنتج العرضي تخفض تكلفة المنتج الرئيسي (WIP)
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type)
    VALUES (now()::date, 'إثبات منتج عرضي مخفض للتكلفة', 'BY-PROD', 'posted', v_org_id, p_progress_id, 'mfg_byproduct')
    RETURNING id INTO v_je_id;

    -- من ح/ المخزون (المنتج العرضي)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, 
            COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1)), 
            (p_qty * p_market_value), 0, 'مخزون منتج عرضي', v_org_id);

    -- إلى ح/ الإنتاج تحت التشغيل (تخفيض تكلفة الأمر الرئيسي)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, 
            COALESCE((v_mappings->>'INVENTORY_WIP')::uuid, (SELECT id FROM public.accounts WHERE code = '10303' AND organization_id = v_org_id LIMIT 1)), 
            0, (p_qty * p_market_value), 'تخفيض تكلفة WIP بمنتج عرضي', v_org_id);

    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- 🛠️ دالة تحديث نسب الإتمام يدوياً (لشاشة واجهة المستخدم)
CREATE OR REPLACE FUNCTION public.mfg_update_progress_completion(p_progress_id uuid, p_material_pct numeric, p_conversion_pct numeric) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF p_material_pct < 0 OR p_material_pct > 100 OR p_conversion_pct < 0 OR p_conversion_pct > 100 THEN RAISE EXCEPTION 'يجب أن تكون النسب بين 0 و 100'; END IF;
    UPDATE public.mfg_order_progress SET material_completion_pct = p_material_pct, conversion_completion_pct = p_conversion_pct WHERE id = p_progress_id AND (organization_id = public.get_my_org() OR public.is_super_admin());
END; $$;

-- 🛠️ دالة ضبط إعدادات المرحلة (نقطة إضافة المواد + نقطة الفحص)
CREATE OR REPLACE FUNCTION public.mfg_config_step_parameters(
    p_step_id uuid,
    p_material_point numeric,
    p_inspection_point numeric
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF p_material_point < 0 OR p_material_point > 100 OR p_inspection_point < 0 OR p_inspection_point > 100 THEN
        RAISE EXCEPTION 'النسب يجب أن تكون بين 0 و 100';
    END IF;

    UPDATE public.mfg_routing_steps 
    SET material_addition_point = p_material_point,
        inspection_point = p_inspection_point
    WHERE id = p_step_id AND (organization_id = public.get_my_org() OR public.is_super_admin());
END; $$;

-- 🛠️ دالة جلب "كشف حساب مركز تكلفة إنتاجي" (Stage Cost Ledger)
-- تعطي تفصيل حقيقي لما تم صرفه على كل مرحلة (خامات، عمالة، مصاريف)
CREATE OR REPLACE FUNCTION public.mfg_get_stage_cost_ledger(p_order_id uuid)
RETURNS TABLE (
    stage_name text,
    material_cost numeric,
    labor_cost numeric,
    overhead_cost numeric,
    total_stage_cost numeric
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT 
        rs.operation_name,
        -- خامات المرحلة (بناءً على AMU)
        COALESCE((SELECT SUM(amu.actual_quantity * COALESCE(p.weighted_average_cost, p.cost, 0)) 
                  FROM public.mfg_actual_material_usage amu 
                  JOIN public.products p ON amu.raw_material_id = p.id 
                  WHERE amu.order_progress_id = op.id), 0) as material_cost,
        -- عمالة فعلية مسجلة
        COALESCE(op.labor_cost_actual, 0) as labor_cost,
        -- مصاريف صناعية محملة بناءً على ساعات العمل ومعدل المركز
        ROUND(COALESCE((rs.standard_time_minutes / 60.0) * op.produced_qty * wc.overhead_rate, 0), 2) as overhead_cost,
        -- الإجمالي الكلي للمرحلة
        ROUND(
            COALESCE((SELECT SUM(amu.actual_quantity * COALESCE(p.weighted_average_cost, p.cost, 0)) FROM public.mfg_actual_material_usage amu JOIN public.products p ON amu.raw_material_id = p.id WHERE amu.order_progress_id = op.id), 0) +
            COALESCE(op.labor_cost_actual, 0) +
            COALESCE((rs.standard_time_minutes / 60.0) * op.produced_qty * wc.overhead_rate, 0)
        , 2) as total_stage_cost
    FROM public.mfg_order_progress op
    JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
    JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
    WHERE op.production_order_id = p_order_id;
END; $$;

-- 🛠️ دالة تقرير تحليل الانحرافات للمراحل (Detailed Stage Variance Report)
-- تقارن بين التكلفة المعيارية المسموح بها للإنتاج المحقق وبين التكاليف الفعلية المسجلة
CREATE OR REPLACE FUNCTION public.mfg_get_stage_variance_report(p_order_id uuid)
RETURNS TABLE (
    stage_name text,
    actual_material numeric,
    standard_material numeric,
    material_variance numeric,
    actual_labor numeric,
    standard_labor numeric,
    labor_variance numeric,
    actual_overhead numeric,
    standard_overhead numeric,
    overhead_variance numeric,
    total_actual numeric,
    total_standard numeric,
    total_variance numeric
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    WITH stage_stats AS (
        SELECT 
            rs.operation_name as s_name,
            -- التكاليف الفعلية
            COALESCE((SELECT SUM(amu.actual_quantity * COALESCE(p.weighted_average_cost, p.cost, 0)) 
                      FROM public.mfg_actual_material_usage amu 
                      JOIN public.products p ON amu.raw_material_id = p.id 
                      WHERE amu.order_progress_id = op.id), 0) as act_mat,
            COALESCE(op.labor_cost_actual, 0) as act_lab,
            ROUND(COALESCE((rs.standard_time_minutes / 60.0) * op.produced_qty * wc.overhead_rate, 0), 2) as act_ovh,
            -- التكاليف المعيارية المسموح بها (Standard Allowed for Actual Output)
            COALESCE((SELECT SUM(sm.quantity_required * op.produced_qty * COALESCE(p.weighted_average_cost, p.cost, 0))
                      FROM public.mfg_step_materials sm
                      JOIN public.products p ON sm.raw_material_id = p.id
                      WHERE sm.step_id = rs.id), 0) as std_mat,
            ROUND(COALESCE((rs.standard_time_minutes / 60.0) * op.produced_qty * wc.hourly_rate, 0), 2) as std_lab,
            ROUND(COALESCE((rs.standard_time_minutes / 60.0) * op.produced_qty * wc.overhead_rate, 0), 2) as std_ovh
        FROM public.mfg_order_progress op
        JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
        JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
        WHERE op.production_order_id = p_order_id
    )
    SELECT 
        s_name,
        act_mat, std_mat, (act_mat - std_mat),
        act_lab, std_lab, (act_lab - std_lab),
        act_ovh, std_ovh, (act_ovh - std_ovh),
        (act_mat + act_lab + act_ovh), (std_mat + std_lab + std_ovh),
        ((act_mat + act_lab + act_ovh) - (std_mat + std_lab + std_ovh))
    FROM stage_stats;
END; $$;

CREATE OR REPLACE FUNCTION public.mfg_auto_post_wip_progress(p_org_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_final_org uuid;
BEGIN
    v_final_org := COALESCE(p_org_id, public.get_my_org());
    UPDATE public.mfg_order_progress op
    SET 
        material_completion_pct = CASE 
            WHEN rs.material_addition_point <= 0 THEN 100
            WHEN rs.material_addition_point >= 100 THEN 0
            ELSE material_completion_pct
        END,
        conversion_completion_pct = CASE 
            WHEN op.actual_start_time IS NULL THEN 10 -- حد أدنى طالما بدأت
            ELSE LEAST(
                GREATEST(
                    COALESCE(ROUND((EXTRACT(EPOCH FROM (now() - op.actual_start_time)) / 60.0) / NULLIF(rs.standard_time_minutes, 0) * 100), 50), 
                    20
                ), 90
            )
        END
    FROM public.mfg_routing_steps rs
    WHERE op.step_id = rs.id 
      AND op.status = 'active'
      AND (v_final_org IS NULL OR op.organization_id = v_final_org);
END; $$;

-- 🛠️ دالة ترحيل فروق تكاليف الفترة (Period Closing)
CREATE OR REPLACE FUNCTION public.mfg_post_period_cost_adjustment(p_period_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_order record; v_recon jsonb; v_org_id uuid; v_je_id uuid; v_wip_acc uuid;
BEGIN
    v_org_id := public.get_my_org();
    v_wip_acc := (SELECT (account_mappings->>'INVENTORY_WIP')::uuid FROM public.company_settings WHERE organization_id = v_org_id);
    FOR v_order IN SELECT id, order_number FROM public.mfg_production_orders WHERE status = 'in_progress' AND organization_id = v_org_id LOOP
        v_recon := public.mfg_calculate_order_cost_reconciliation(v_order.id);
        INSERT INTO public.mfg_period_cost_snapshots (period_name, order_id, material_unit_cost, conversion_unit_cost, wip_valuation, finished_goods_valuation, organization_id)
        VALUES (p_period_name, v_order.id, (v_recon->'unit_costs'->>'material')::numeric, (v_recon->'unit_costs'->>'conversion')::numeric, (v_recon->'allocation'->>'wip')::numeric, (v_recon->'allocation'->>'finished_goods')::numeric, v_org_id);
        
        UPDATE public.products SET weighted_average_cost = ((COALESCE(stock,0) * weighted_average_cost) + (v_recon->'allocation'->>'finished_goods')::numeric) / NULLIF(COALESCE(stock,0) + (SELECT SUM(produced_qty) FROM public.mfg_order_progress WHERE production_order_id = v_order.id AND status = 'completed'), 0)
        WHERE id = (SELECT product_id FROM public.mfg_production_orders WHERE id = v_order.id);
    END LOOP;
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- 🛠️ دالة إغلاق الفترة التكاليفية وترحيل الأرصدة (Period Closing & Carry-over)
-- هذه الدالة هي "الميزان" الذي ينقل تكاليف WIP لتصبح "أول مدة" للشهر القادم
CREATE OR REPLACE FUNCTION public.mfg_close_costing_period(p_period_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_org_id uuid := public.get_my_org();
    v_order record;
    v_wip_val record;
    v_count int := 0;
BEGIN
    -- 1. التأكد من عدم إغلاق الفترة مرتين
    IF EXISTS (SELECT 1 FROM public.mfg_period_cost_snapshots WHERE period_name = p_period_name AND organization_id = v_org_id) THEN
        RAISE EXCEPTION 'هذه الفترة مغلقة مسبقاً: %', p_period_name;
    END IF;

    -- 2. المرور على كافة الأوامر التي لا تزال "تحت التشغيل"
    FOR v_order IN SELECT id, order_number FROM public.mfg_production_orders 
                  WHERE status IN ('in_progress', 'draft') AND organization_id = v_org_id 
    LOOP
        -- جلب تقييم الـ WIP الحالي للأمر
        SELECT cost_assigned_to_wip, cost_per_material_eq, cost_per_conversion_eq 
        INTO v_wip_val 
        FROM public.v_mfg_cost_reconciliation_report WHERE order_id = v_order.id;

        IF v_wip_val.cost_assigned_to_wip > 0 THEN
            -- أ. أخذ لقطة تاريخية للفترة
            INSERT INTO public.mfg_period_cost_snapshots (
                period_name, order_id, material_unit_cost, conversion_unit_cost, wip_valuation, organization_id
            ) VALUES (
                p_period_name, v_order.id, v_wip_val.cost_per_material_eq, v_wip_val.cost_per_conversion_eq, v_wip_val.cost_assigned_to_wip, v_org_id
            );

            -- ب. ترحيل الرصيد كـ "أول مدة" (Beginning WIP) للفترة القادمة
            -- نمسح السجل القديم للأمر (إذا كان مرحلاً من شهر أسبق) ونضع الجديد
            DELETE FROM public.mfg_beginning_wip_inventory WHERE order_id = v_order.id;
            
            INSERT INTO public.mfg_beginning_wip_inventory (
                order_id, material_cost_bf, conversion_cost_bf, organization_id
            ) VALUES (
                v_order.id, 
                (v_wip_val.cost_assigned_to_wip * 0.7), -- افتراضياً 70% مواد
                (v_wip_val.cost_assigned_to_wip * 0.3), -- و 30% تحويل
                v_org_id
            );
            v_count := v_count + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('status', 'success', 'orders_migrated', v_count, 'period', p_period_name);
END; $$;

-- 🛠️ دالة تسوية حساب الإنتاج تحت التشغيل مع الأستاذ العام (WIP to GL Settlement)
-- هذه الدالة هي "الضربة القاضية" لمحاسب التكاليف: تطابق الأرقام الدفترية مع الواقع الفعلي
CREATE OR REPLACE FUNCTION public.mfg_post_wip_gl_settlement(p_order_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_recon record; v_org_id uuid; v_je_id uuid; v_mappings jsonb;
    v_wip_acc uuid; v_variance_acc uuid; v_gl_wip_balance numeric; v_calculated_wip numeric; v_diff numeric;
BEGIN
    SELECT organization_id INTO v_org_id FROM public.mfg_production_orders WHERE id = p_order_id;
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    
    -- 1. جلب حسابات الربط (مع إضافة حساب انحراف WIP)
    v_wip_acc := public.resolve_leaf_account((v_mappings->>'INVENTORY_WIP')::uuid);
    v_variance_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'WIP_VARIANCE_ACCOUNT')::uuid, (SELECT id FROM public.accounts WHERE code = '511' AND organization_id = v_org_id LIMIT 1)));

    -- 2. حساب رصيد الحساب الحالي في الأستاذ العام (Book Value)
    SELECT COALESCE(SUM(debit - credit), 0) INTO v_gl_wip_balance 
    FROM public.journal_lines_view 
    WHERE account_id = v_wip_acc AND organization_id = v_org_id;

    -- 3. جلب القيمة "الواقعية" بناءً على الإنتاج المعادل (Calculated Value)
    SELECT cost_assigned_to_wip INTO v_calculated_wip 
    FROM public.v_mfg_cost_reconciliation_report WHERE order_id = p_order_id;

    v_diff := v_calculated_wip - v_gl_wip_balance;

    IF ABS(v_diff) < 1 THEN RETURN NULL; END IF; -- لا حاجة لتسوية الفروق الزهيدة

    -- 4. إنشاء قيد التسوية
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type)
    VALUES (now()::date, 'قيد تسوية انحراف تكاليف WIP - أمر رقم ' || (SELECT order_number FROM public.mfg_production_orders WHERE id = p_order_id), 'WIP-SETTLE', 'posted', v_org_id, true, p_order_id, 'mfg_settlement')
    RETURNING id INTO v_je_id;

    IF v_diff > 0 THEN
        -- نحتاج لزيادة WIP (مدين) وخفض الانحراف (دائن)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_wip_acc, v_diff, 0, 'تسوية زيادة قيمة WIP فعلياً', v_org_id),
               (v_je_id, v_variance_acc, 0, v_diff, 'إثبات انحراف تكاليف ملائم', v_org_id);
    ELSE
        -- نحتاج لخفض WIP (دائن) وزيادة الانحراف/المصروف (مدين)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_variance_acc, ABS(v_diff), 0, 'تحميل انحراف تكاليف غير ملائم', v_org_id),
               (v_je_id, v_wip_acc, 0, ABS(v_diff), 'تعديل قيمة WIP دفترياً', v_org_id);
    END IF;

    RETURN v_je_id;
END; $$;

-- ================================================================
-- 4. منح الصلاحيات (Grants)
-- ================================================================
GRANT SELECT ON public.v_mfg_production_quantity_report TO authenticated;
GRANT SELECT ON public.v_mfg_equivalent_units TO authenticated;
GRANT SELECT ON public.v_mfg_cost_reconciliation_report TO authenticated;
GRANT SELECT ON public.v_mfg_unit_cost_anatomy TO authenticated;
GRANT SELECT ON public.v_mfg_unit_cost_variance TO authenticated;

-- 🔄 إجبار المحرك على تحديث كاش النظام (Force Schema Cache Reload)
NOTIFY pgrst, 'reload config';
GRANT SELECT ON public.mfg_period_cost_snapshots TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_record_scrap_advanced(uuid, uuid, numeric, boolean, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_record_byproduct(uuid, uuid, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_config_step_parameters(uuid, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_post_period_cost_adjustment(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_update_progress_completion(uuid, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_auto_post_wip_progress(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_get_stage_cost_ledger(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_get_stage_variance_report(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_post_wip_gl_settlement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_close_costing_period(text) TO authenticated;

-- 🛠️ دالة التراجع عن إغلاق الفترة التكاليفية (Undo Period Close)
-- تسمح بفتح الفترة مرة أخرى عن طريق حذف اللقطات التاريخية
CREATE OR REPLACE FUNCTION public.mfg_undo_costing_period_close(p_period_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_org_id uuid := public.get_my_org();
    v_count int;
BEGIN
    -- 1. حذف اللقطات التاريخية لهذه الفترة
    DELETE FROM public.mfg_period_cost_snapshots 
    WHERE period_name = p_period_name AND organization_id = v_org_id;
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN jsonb_build_object('status', 'success', 'snapshots_removed', v_count, 'period', p_period_name);
END; $$;

-- ================================================================
-- 🛡️ نظام التنبيهات الذكية لتجاوز التكاليف أثناء التشغيل (Pre-emptive Control)
-- ================================================================
CREATE OR REPLACE FUNCTION public.mfg_check_active_cost_overruns(p_threshold_pct numeric DEFAULT 15)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_row record;
    v_alert_count integer := 0;
    v_admin_id uuid;
    v_org_id uuid;
    v_std_cost_unit numeric;
    v_std_total numeric;
    v_overrun_pct numeric;
BEGIN
    -- فحص كافة الأوامر التي لا تزال "قيد التشغيل"
    FOR v_row IN
        SELECT 
            po.id, po.order_number, po.product_id, po.quantity_to_produce, po.organization_id,
            p.name as product_name,
            vop.total_actual_cost
        FROM public.mfg_production_orders po
        JOIN public.products p ON po.product_id = p.id
        JOIN public.v_mfg_order_profitability vop ON po.id = vop.order_id
        WHERE po.status = 'in_progress'
    LOOP
        v_org_id := v_row.organization_id;
        v_std_cost_unit := public.mfg_calculate_standard_cost(v_row.product_id, v_org_id);
        v_std_total := v_std_cost_unit * v_row.quantity_to_produce;
        
        IF v_std_total > 0 THEN
            v_overrun_pct := ((v_row.total_actual_cost - v_std_total) / v_std_total) * 100;
            
            -- إذا تجاوز الانحراف النسبة المحددة (مثلاً 15% لتصل لـ 115%)
            IF v_overrun_pct > p_threshold_pct THEN
                -- منع تكرار الإرسال: لا نرسل تنبيهاً لنفس الأمر إذا تم إرسال واحد في آخر 12 ساعة
                IF NOT EXISTS (
                    SELECT 1 FROM public.notifications 
                    WHERE organization_id = v_org_id 
                    AND type = 'cost_overrun'
                    AND message LIKE '%' || v_row.order_number || '%'
                    AND created_at > (now() - interval '12 hours')
                ) THEN
                    -- 1. التسجيل في السجل التاريخي الدائم
                    INSERT INTO public.mfg_alerts_log (
                        order_id, alert_type, title, message, actual_value, threshold_value, organization_id
                    ) VALUES (
                        v_row.id, 'cost_overrun', 'تجاوز تكلفة تشغيلي',
                        format('تجاوز بنسبة %s%%', ROUND(v_overrun_pct, 1)),
                        v_row.total_actual_cost, v_std_total, v_org_id
                    );

                    -- 2. إرسال الإشعار اللحظي للمديرين
                    FOR v_admin_id IN SELECT id FROM public.profiles WHERE organization_id = v_org_id AND role IN ('admin', 'manager') LOOP
                        INSERT INTO public.notifications (user_id, title, message, priority, organization_id, type)
                        VALUES (
                            v_admin_id,
                            'تنبيه: تجاوز تكلفة نشط ⚠️',
                            format('الأمر (%s) للمنتج (%s) تجاوز التكلفة المعيارية بنسبة %s%% أثناء التشغيل. فعلي: %s | معياري: %s',
                                   v_row.order_number, v_row.product_name, ROUND(v_overrun_pct, 1), v_row.total_actual_cost, v_std_total),
                            'high', v_org_id, 'cost_overrun'
                        );
                    END LOOP;
                    v_alert_count := v_alert_count + 1;
                END IF;
            END IF;
        END IF;
    END LOOP;
    RETURN v_alert_count;
END; $$;

GRANT EXECUTE ON FUNCTION public.mfg_undo_costing_period_close(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_check_active_cost_overruns(numeric) TO authenticated;

-- 🕒 جدولة الترحيل الآلي
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'cron') THEN
        -- التحقق من وجود المهمة قبل محاولة إلغاء جدولتها لتجنب الخطأ في أول تشغيل
        IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mfg-daily-wip-snapshot') THEN
            PERFORM cron.unschedule('mfg-daily-wip-snapshot');
        END IF;
        
        IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mfg-active-cost-check') THEN
            PERFORM cron.unschedule('mfg-active-cost-check');
        END IF;

        PERFORM cron.schedule('mfg-daily-wip-snapshot', '55 23 * * *', 'SELECT public.mfg_auto_post_wip_progress(NULL);');
        -- تشغيل فحص تجاوز التكاليف كل ساعة
        PERFORM cron.schedule('mfg-active-cost-check', '0 * * * *', 'SELECT public.mfg_check_active_cost_overruns(15);');
    END IF;
END $$;

DO $$ 
BEGIN
    RAISE NOTICE '✅ تم تثبيت مديول محاسبة التكاليف المتقدم (النسخة المستقرة) بنجاح.';
    NOTIFY pgrst, 'reload config';
END $$;