-- Migration: Fix mfg_record_scrap function
-- Reason: Remove non-existent "scrap_date" column from insertion into mfg_scrap_logs table.

CREATE OR REPLACE FUNCTION public.mfg_record_scrap(p_progress_id uuid, p_material_id uuid, p_qty numeric, p_reason text) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org_id uuid; v_material_name text; v_cost numeric := 0; v_scrap_acc uuid; v_wip_acc uuid; v_je_id uuid; v_mappings jsonb;
BEGIN
    SELECT organization_id INTO v_org_id FROM public.mfg_order_progress WHERE id = p_progress_id;
    SELECT name INTO v_material_name FROM public.products WHERE id = p_material_id;

    SELECT COALESCE(NULLIF(weighted_average_cost, 0), NULLIF(cost, 0), NULLIF(purchase_price, 0), 0) INTO v_cost 
    FROM public.products WHERE id = p_material_id AND organization_id = v_org_id;

    INSERT INTO public.mfg_scrap_logs (order_progress_id, product_id, quantity, reason, organization_id)
    VALUES (p_progress_id, p_material_id, p_qty, p_reason, v_org_id);

    UPDATE public.products SET stock = stock - p_qty WHERE id = p_material_id AND organization_id = v_org_id;

    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    v_scrap_acc := public.resolve_leaf_account(COALESCE(
        (v_mappings->>'WASTAGE_EXPENSE')::uuid,
        (SELECT id FROM public.accounts WHERE code = '5121' AND organization_id = v_org_id LIMIT 1)
    ));
    v_wip_acc := public.resolve_mfg_wip_account(v_org_id);

    IF v_scrap_acc IS NOT NULL AND v_cost > 0 AND v_wip_acc IS NOT NULL THEN
        INSERT INTO public.journal_entries (
            transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type
        ) VALUES (
            now()::date,
            'إثبات تالف صناعي: ' || v_material_name || ' - ' || p_reason,
            'MFG-SCRAP-' || substring(gen_random_uuid()::text, 1, 8),
            'posted', v_org_id, true, p_progress_id, 'mfg_scrap'
        ) RETURNING id INTO v_je_id;
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_scrap_acc, (p_qty * v_cost), 0, 'تكلفة هالك تصنيع مسموح به', v_org_id);
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_wip_acc, 0, (p_qty * v_cost), 'تحويل من WIP لحساب الهالك', v_org_id);
    END IF;

    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;
