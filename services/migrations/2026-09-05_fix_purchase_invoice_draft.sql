-- ==============================================================================
-- 🚀 تصحيح دالة حفظ مسودات فواتير المشتريات (Fix Purchase Invoice Draft RPC)
-- التاريخ: 05 سبتمبر 2026
-- ==============================================================================
-- حل مشكلة الخطأ 400 (PGRST204): إزالة عمود cost غير الموجود في جدول purchase_invoice_items
-- والاعتماد على unit_price المطابق للمخطط الفعلي لقاعدة البيانات.

BEGIN;

CREATE OR REPLACE FUNCTION public.save_purchase_invoice_draft(
    p_invoice jsonb,
    p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invoice_id uuid;
    v_org_id uuid;
    v_item jsonb;
    v_saved_invoice record;
BEGIN
    v_invoice_id := NULLIF(p_invoice->>'id', '')::uuid;
    IF v_invoice_id IS NULL THEN
        v_invoice_id := gen_random_uuid();
    END IF;

    v_org_id := NULLIF(p_invoice->>'organization_id', '')::uuid;
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'معرف المنظمة مطلوب (organization_id is required)';
    END IF;

    -- إذا كانت الفاتورة موجودة مسبقاً وكانت مرحلة، نقوم بعكسها أولاً لضمان اتزان الأرصدة
    IF EXISTS (SELECT 1 FROM public.purchase_invoices WHERE id = v_invoice_id AND status = 'posted') THEN
        PERFORM public.unpost_purchase_invoice(v_invoice_id, v_org_id);
    END IF;

    IF EXISTS (SELECT 1 FROM public.purchase_invoices WHERE id = v_invoice_id) THEN
        UPDATE public.purchase_invoices
        SET
            organization_id = v_org_id,
            invoice_number = COALESCE(p_invoice->>'invoice_number', invoice_number),
            supplier_id = (p_invoice->>'supplier_id')::uuid,
            warehouse_id = (p_invoice->>'warehouse_id')::uuid,
            invoice_date = (p_invoice->>'invoice_date')::date,
            total_amount = (p_invoice->>'total_amount')::numeric,
            tax_amount = COALESCE((p_invoice->>'tax_amount')::numeric, 0),
            subtotal = COALESCE((p_invoice->>'subtotal')::numeric, 0),
            paid_amount = COALESCE((p_invoice->>'paid_amount')::numeric, 0),
            treasury_account_id = NULLIF(p_invoice->>'treasury_account_id', '')::uuid,
            notes = p_invoice->>'notes',
            status = 'draft',
            currency = COALESCE(p_invoice->>'currency', 'EGP'),
            exchange_rate = COALESCE((p_invoice->>'exchange_rate')::numeric, 1),
            related_journal_entry_id = NULL
        WHERE id = v_invoice_id;
    ELSE
        INSERT INTO public.purchase_invoices (
            id,
            organization_id,
            invoice_number,
            supplier_id,
            warehouse_id,
            invoice_date,
            total_amount,
            tax_amount,
            subtotal,
            paid_amount,
            treasury_account_id,
            notes,
            status,
            currency,
            exchange_rate,
            user_id,
            created_at
        ) VALUES (
            v_invoice_id,
            v_org_id,
            p_invoice->>'invoice_number',
            (p_invoice->>'supplier_id')::uuid,
            (p_invoice->>'warehouse_id')::uuid,
            COALESCE((p_invoice->>'invoice_date')::date, CURRENT_DATE),
            (p_invoice->>'total_amount')::numeric,
            COALESCE((p_invoice->>'tax_amount')::numeric, 0),
            COALESCE((p_invoice->>'subtotal')::numeric, 0),
            COALESCE((p_invoice->>'paid_amount')::numeric, 0),
            NULLIF(p_invoice->>'treasury_account_id', '')::uuid,
            p_invoice->>'notes',
            'draft',
            COALESCE(p_invoice->>'currency', 'EGP'),
            COALESCE((p_invoice->>'exchange_rate')::numeric, 1),
            NULLIF(p_invoice->>'user_id', '')::uuid,
            NOW()
        );
    END IF;

    -- مسح البنود القديمة وإعادة إدراج بنود المشتريات الجديدة ذرياً
    DELETE FROM public.purchase_invoice_items WHERE purchase_invoice_id = v_invoice_id;

    IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' AND jsonb_array_length(p_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
        LOOP
            INSERT INTO public.purchase_invoice_items (
                id,
                organization_id,
                purchase_invoice_id,
                product_id,
                quantity,
                unit_price,
                uom_id,
                total,
                batch_number,
                expiry_date
            ) VALUES (
                gen_random_uuid(),
                v_org_id,
                v_invoice_id,
                (v_item->>'product_id')::uuid,
                (v_item->>'quantity')::numeric,
                (v_item->>'unit_price')::numeric,
                NULLIF(v_item->>'uom_id', '')::uuid,
                (v_item->>'total')::numeric,
                v_item->>'batch_number',
                NULLIF(v_item->>'expiry_date', '')::date
            );
        END LOOP;
    END IF;

    SELECT * INTO v_saved_invoice FROM public.purchase_invoices WHERE id = v_invoice_id;
    RETURN to_jsonb(v_saved_invoice);
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_purchase_invoice_draft(jsonb, jsonb) TO authenticated, service_role, anon;

COMMIT;
