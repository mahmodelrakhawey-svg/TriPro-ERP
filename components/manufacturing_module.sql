-- services/manufacturing_module.sql
-- هذا الملف يحتوي على الدوال والجداول الخاصة بمديول التصنيع.

-- Assuming mfg_production_orders table exists
CREATE TABLE IF NOT EXISTS public.mfg_production_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    quantity_to_produce NUMERIC(15,3) NOT NULL,
    warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'completed', 'cancelled')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Assuming mfg_order_progress table exists
CREATE TABLE IF NOT EXISTS public.mfg_order_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_order_id UUID NOT NULL REFERENCES public.mfg_production_orders(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    produced_qty NUMERIC(15,3) DEFAULT 0,
    labor_cost_actual NUMERIC(15,2) DEFAULT 0,
    status TEXT DEFAULT 'in_progress',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Assuming mfg_actual_material_usage table exists
CREATE TABLE IF NOT EXISTS public.mfg_actual_material_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_progress_id UUID NOT NULL REFERENCES public.mfg_order_progress(id) ON DELETE CASCADE,
    raw_material_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    standard_quantity NUMERIC(15,3) DEFAULT 0,
    actual_quantity NUMERIC(15,3) NOT NULL,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Function to finalize a manufacturing order
CREATE OR REPLACE FUNCTION public.mfg_finalize_order(
    p_order_id UUID,
    p_status TEXT,
    p_notes TEXT
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_order RECORD;
    v_total_actual_cost NUMERIC := 0;
    v_estimated_cost_baseline NUMERIC := 0;
    v_cost_overrun_percentage NUMERIC := 0;
    v_product_name TEXT;
    v_org_id UUID;
BEGIN
    SELECT mpo.*, p.name as product_name, p.cost as product_standard_cost
    INTO v_order
    FROM public.mfg_production_orders mpo
    JOIN public.products p ON mpo.product_id = p.id
    WHERE mpo.id = p_order_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Production order with ID % not found.', p_order_id;
    END IF;

    v_org_id := v_order.organization_id;
    v_product_name := v_order.product_name;

    -- Calculate total actual cost for the order
    SELECT COALESCE(SUM(mop.labor_cost_actual), 0) INTO v_total_actual_cost
    FROM public.mfg_order_progress mop
    WHERE mop.production_order_id = p_order_id;

    SELECT v_total_actual_cost + COALESCE(SUM(ma.actual_quantity * p_raw.weighted_average_cost), 0) INTO v_total_actual_cost
    FROM public.mfg_actual_material_usage ma
    JOIN public.mfg_order_progress mop ON ma.order_progress_id = mop.id
    JOIN public.products p_raw ON ma.raw_material_id = p_raw.id
    WHERE mop.production_order_id = p_order_id;

    -- For simplicity, let's assume estimated cost is product's standard cost * quantity to produce
    v_estimated_cost_baseline := v_order.product_standard_cost * v_order.quantity_to_produce;

    -- Check for cost overrun (e.g., if actual cost exceeds estimated by more than 10%)
    IF v_estimated_cost_baseline > 0 AND v_total_actual_cost > v_estimated_cost_baseline * 1.10 THEN
        v_cost_overrun_percentage := ((v_total_actual_cost - v_estimated_cost_baseline) / v_estimated_cost_baseline) * 100;
        
        PERFORM public.create_notification_from_sql(
            v_org_id, NULL, 'تجاوز تكاليف أمر تصنيع ⚠️',
            'أمر التصنيع #' || v_order.id || ' للمنتج "' || v_product_name || '" تجاوز التكاليف بنسبة ' || ROUND(v_cost_overrun_percentage, 2) || '%.' ||
            ' التكلفة الفعلية: ' || ROUND(v_total_actual_cost, 2) || '، التكلفة التقديرية: ' || ROUND(v_estimated_cost_baseline, 2) || '.',
            'manufacturing_cost_overrun', 'high', '/mfg/orders/' || p_order_id
        );
    END IF;

    UPDATE public.mfg_production_orders SET status = p_status, notes = p_notes, updated_at = NOW() WHERE id = p_order_id;

    -- تحديث تكلفة المخزون وتوليد القيد المالي فور الإغلاق
    PERFORM public.recalculate_stock_rpc(v_org_id);
    -- ملاحظة: يفترض وجود دالة generate_mfg_journal_entry في ملف المحرك المالي
END;
$$;

GRANT EXECUTE ON FUNCTION public.mfg_finalize_order(UUID, TEXT, TEXT) TO authenticated;