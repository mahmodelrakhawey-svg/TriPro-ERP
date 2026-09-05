-- =====================================================================
-- 🛡️ TriPro-ERP: Atomic Invoice Operations (Phase 3 Migration)
-- Date: 2026-09-05
-- Purpose:
--   1. Provide single-roundtrip, atomic database transactions for:
--      - unpost_sales_invoice
--      - delete_sales_invoice
--      - unpost_purchase_invoice
--      - delete_purchase_invoice
--   2. Eliminate orphaned journal entries and partial stock updates.
--   3. Unify function signatures to prevent PGRST203 candidate ambiguity.
-- =====================================================================

-- 1. إلغاء ترحيل فاتورة مبيعات (Unpost Sales Invoice)
CREATE OR REPLACE FUNCTION public.unpost_sales_invoice(
    p_invoice_id uuid,
    p_org_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invoice record;
    v_org_id uuid;
    v_item record;
    v_base_qty numeric;
BEGIN
    -- أ. التحقق من وجود الفاتورة
    SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'فاتورة المبيعات غير موجودة (ID: %)', p_invoice_id;
    END IF;

    -- إذا كانت الفاتورة مسودة بالفعل، لا حاجة لإلغاء الترحيل
    IF v_invoice.status = 'draft' THEN
        RETURN true;
    END IF;

    v_org_id := COALESCE(p_org_id, v_invoice.organization_id);

    -- ب. عكس أثر المخزون لجميع بنود الفاتورة وإعادة الكميات للمستودع
    FOR v_item IN 
        SELECT product_id, quantity, uom_id 
        FROM public.invoice_items 
        WHERE invoice_id = p_invoice_id AND product_id IS NOT NULL AND quantity > 0
    LOOP
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'uom_convert' AND pronamespace = 'public'::regnamespace) THEN
                v_base_qty := public.uom_convert(
                    v_item.quantity, 
                    v_item.uom_id, 
                    (SELECT base_uom_id FROM public.products WHERE id = v_item.product_id)
                );
            ELSE
                v_base_qty := v_item.quantity;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_base_qty := v_item.quantity;
        END;

        IF v_base_qty IS NULL OR v_base_qty <= 0 THEN
            v_base_qty := v_item.quantity;
        END IF;

        -- إعادة الكمية للمخزون العام ومخزون المستودع
        IF v_invoice.warehouse_id IS NOT NULL THEN
            UPDATE public.products
            SET 
                stock = COALESCE(stock, 0) + v_base_qty,
                warehouse_stock = jsonb_set(
                    COALESCE(warehouse_stock, '{}'::jsonb),
                    ARRAY[v_invoice.warehouse_id::text],
                    to_jsonb(
                        COALESCE((warehouse_stock->>v_invoice.warehouse_id::text)::numeric, 0) + v_base_qty
                    )
                )
            WHERE id = v_item.product_id;
        ELSE
            UPDATE public.products
            SET stock = COALESCE(stock, 0) + v_base_qty
            WHERE id = v_item.product_id;
        END IF;
    END LOOP;

    -- ج. حذف القيد المحاسبي المرتبط وسطور القيد
    IF v_invoice.related_journal_entry_id IS NOT NULL THEN
        DELETE FROM public.journal_lines WHERE journal_entry_id = v_invoice.related_journal_entry_id;
        DELETE FROM public.journal_entries WHERE id = v_invoice.related_journal_entry_id;
    ELSE
        DELETE FROM public.journal_lines 
        WHERE journal_entry_id IN (
            SELECT id FROM public.journal_entries 
            WHERE reference = v_invoice.invoice_number 
              AND (v_org_id IS NULL OR organization_id = v_org_id)
        );
        DELETE FROM public.journal_entries 
        WHERE reference = v_invoice.invoice_number 
          AND (v_org_id IS NULL OR organization_id = v_org_id);
    END IF;

    -- د. إعادة حالة الفاتورة إلى مسودة وإلغاء الربط بالقيد
    UPDATE public.invoices
    SET 
        status = 'draft',
        related_journal_entry_id = NULL
    WHERE id = p_invoice_id;

    RETURN true;
END;
$$;

-- 2. حذف فاتورة مبيعات بالكامل (Delete Sales Invoice)
CREATE OR REPLACE FUNCTION public.delete_sales_invoice(
    p_invoice_id uuid,
    p_org_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- أ. إلغاء ترحيل الفاتورة أولاً إذا كانت مرحلة (لعكس المخزون وحذف القيد)
    PERFORM public.unpost_sales_invoice(p_invoice_id, p_org_id);

    -- ب. حذف بنود الفاتورة
    DELETE FROM public.invoice_items WHERE invoice_id = p_invoice_id;

    -- ج. حذف سجل الفاتورة الرئيسي
    DELETE FROM public.invoices WHERE id = p_invoice_id;

    RETURN true;
END;
$$;

-- 3. إلغاء ترحيل فاتورة مشتريات (Unpost Purchase Invoice)
CREATE OR REPLACE FUNCTION public.unpost_purchase_invoice(
    p_invoice_id uuid,
    p_org_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invoice record;
    v_org_id uuid;
    v_item record;
    v_base_qty numeric;
BEGIN
    -- أ. التحقق من وجود الفاتورة
    SELECT * INTO v_invoice FROM public.purchase_invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'فاتورة المشتريات غير موجودة (ID: %)', p_invoice_id;
    END IF;

    IF v_invoice.status = 'draft' THEN
        RETURN true;
    END IF;

    v_org_id := COALESCE(p_org_id, v_invoice.organization_id);

    -- ب. عكس أثر المخزون لجميع بنود الفاتورة وخصم الكميات المضافة
    FOR v_item IN 
        SELECT product_id, quantity, uom_id 
        FROM public.purchase_invoice_items 
        WHERE purchase_invoice_id = p_invoice_id AND product_id IS NOT NULL AND quantity > 0
    LOOP
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'uom_convert' AND pronamespace = 'public'::regnamespace) THEN
                v_base_qty := public.uom_convert(
                    v_item.quantity, 
                    v_item.uom_id, 
                    (SELECT base_uom_id FROM public.products WHERE id = v_item.product_id)
                );
            ELSE
                v_base_qty := v_item.quantity;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_base_qty := v_item.quantity;
        END;

        IF v_base_qty IS NULL OR v_base_qty <= 0 THEN
            v_base_qty := v_item.quantity;
        END IF;

        IF v_invoice.warehouse_id IS NOT NULL THEN
            UPDATE public.products
            SET 
                stock = GREATEST(0, COALESCE(stock, 0) - v_base_qty),
                warehouse_stock = jsonb_set(
                    COALESCE(warehouse_stock, '{}'::jsonb),
                    ARRAY[v_invoice.warehouse_id::text],
                    to_jsonb(
                        GREATEST(0, COALESCE((warehouse_stock->>v_invoice.warehouse_id::text)::numeric, 0) - v_base_qty)
                    )
                )
            WHERE id = v_item.product_id;
        ELSE
            UPDATE public.products
            SET stock = GREATEST(0, COALESCE(stock, 0) - v_base_qty)
            WHERE id = v_item.product_id;
        END IF;
    END LOOP;

    -- ج. حذف القيد المحاسبي المرتبط
    IF v_invoice.related_journal_entry_id IS NOT NULL THEN
        DELETE FROM public.journal_lines WHERE journal_entry_id = v_invoice.related_journal_entry_id;
        DELETE FROM public.journal_entries WHERE id = v_invoice.related_journal_entry_id;
    ELSE
        DELETE FROM public.journal_lines 
        WHERE journal_entry_id IN (
            SELECT id FROM public.journal_entries 
            WHERE reference = v_invoice.invoice_number 
              AND (v_org_id IS NULL OR organization_id = v_org_id)
        );
        DELETE FROM public.journal_entries 
        WHERE reference = v_invoice.invoice_number 
          AND (v_org_id IS NULL OR organization_id = v_org_id);
    END IF;

    -- د. إعادة الحالة إلى مسودة
    UPDATE public.purchase_invoices
    SET 
        status = 'draft',
        related_journal_entry_id = NULL
    WHERE id = p_invoice_id;

    RETURN true;
END;
$$;

-- 4. حذف فاتورة مشتريات بالكامل (Delete Purchase Invoice)
CREATE OR REPLACE FUNCTION public.delete_purchase_invoice(
    p_invoice_id uuid,
    p_org_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- أ. عكس المخزون وحذف القيد إن كانت مرحلة
    PERFORM public.unpost_purchase_invoice(p_invoice_id, p_org_id);

    -- ب. حذف بنود الفاتورة
    DELETE FROM public.purchase_invoice_items WHERE purchase_invoice_id = p_invoice_id;

    -- ج. حذف الفاتورة
    DELETE FROM public.purchase_invoices WHERE id = p_invoice_id;

    RETURN true;
END;
$$;

-- 5. منح الصلاحيات الشاملة للدوال الذرية
GRANT EXECUTE ON FUNCTION public.unpost_sales_invoice(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unpost_sales_invoice(uuid, uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.delete_sales_invoice(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_sales_invoice(uuid, uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.unpost_purchase_invoice(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unpost_purchase_invoice(uuid, uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.delete_purchase_invoice(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_purchase_invoice(uuid, uuid) TO anon;
