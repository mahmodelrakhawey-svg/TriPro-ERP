-- ==============================================================================
-- 🚀 TriPro ERP - Migration: Synchronize Purchase Order Status with Purchase Invoices
-- When a PO is converted -> status becomes 'converted'
-- When the Invoice is approved/posted -> status becomes 'posted' (مرحل / مكتمل)
-- ==============================================================================

-- 1. التأكد من وجود عمود purchase_order_id في جدول فواتير المشتريات
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_invoices' AND column_name = 'purchase_order_id') THEN 
        ALTER TABLE public.purchase_invoices ADD COLUMN purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL; 
    END IF; 
END $$;

-- 2. تحديث دالة تحويل أمر الشراء إلى فاتورة (convert_po_to_invoice)
CREATE OR REPLACE FUNCTION public.convert_po_to_invoice(
    p_po_id uuid, 
    p_warehouse_id uuid DEFAULT NULL, 
    p_org_id uuid DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_po record; 
    v_invoice_id uuid; 
    v_inv_num text; 
    v_target_org_id uuid;
    v_wh_id uuid;
BEGIN
    SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'أمر الشراء غير موجود'; END IF;

    v_target_org_id := COALESCE(p_org_id, v_po.organization_id, public.get_my_org());
    v_inv_num := 'PI-FROM-' || COALESCE(v_po.po_number, v_po.order_number, substring(p_po_id::text, 1, 8));

    v_wh_id := COALESCE(
        p_warehouse_id, 
        v_po.warehouse_id, 
        (SELECT id FROM public.warehouses WHERE organization_id = v_target_org_id AND deleted_at IS NULL ORDER BY name ASC LIMIT 1)
    );

    -- إنشاء رأس فاتورة المشتريات مع ربط مباشر برقم أمر الشراء
    INSERT INTO public.purchase_invoices (
        invoice_number, supplier_id, user_id, invoice_date, total_amount, tax_amount, subtotal,
        status, warehouse_id, organization_id, notes, currency, exchange_rate, purchase_order_id
    ) VALUES (
        v_inv_num, 
        v_po.supplier_id, 
        auth.uid(),
        now()::date,
        COALESCE(v_po.total_amount, 0), 
        COALESCE(v_po.tax_amount, 0),
        COALESCE(v_po.subtotal, COALESCE(v_po.total_amount, 0) - COALESCE(v_po.tax_amount, 0)),
        'draft',
        v_wh_id,
        v_target_org_id,
        'محولة من أمر شراء رقم: ' || COALESCE(v_po.po_number, v_po.order_number, 'بدون رقم'),
        'EGP', 
        1,
        p_po_id
    ) RETURNING id INTO v_invoice_id;

    -- نقل البنود بدقة باستخدام purchase_order_id و order_id معاً
    INSERT INTO public.purchase_invoice_items (
        purchase_invoice_id, product_id, quantity, unit_price, uom_id, total, organization_id
    )
    SELECT 
        v_invoice_id, 
        product_id, 
        quantity, 
        unit_price, 
        uom_id, 
        COALESCE(total, quantity * unit_price), 
        v_target_org_id
    FROM public.purchase_order_items 
    WHERE COALESCE(purchase_order_id, order_id) = p_po_id;

    -- تحديث حالة أمر الشراء إلى محول لفاتورة (converted)
    UPDATE public.purchase_orders SET status = 'converted' WHERE id = p_po_id;

    RETURN v_invoice_id;
END; $$;

-- 3. دالة المزامنة التلقائية لحالة أمر الشراء مع حالة الفاتورة
CREATE OR REPLACE FUNCTION public.fn_sync_purchase_order_status_from_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_po_id uuid;
BEGIN
    v_po_id := COALESCE(NEW.purchase_order_id, OLD.purchase_order_id);
    
    -- إذا لم يكن الربط بالمعرف موجوداً، نبحث بالرقم أو الملاحظات
    IF v_po_id IS NULL AND (NEW.invoice_number IS NOT NULL OR NEW.notes IS NOT NULL) THEN
        SELECT id INTO v_po_id FROM public.purchase_orders
        WHERE ('PI-FROM-' || COALESCE(po_number, order_number) = NEW.invoice_number)
           OR ('PI-FROM-' || substring(id::text, 1, 8) = NEW.invoice_number)
           OR (NEW.notes ILIKE '%' || COALESCE(po_number, order_number) || '%')
        LIMIT 1;
    END IF;

    IF v_po_id IS NOT NULL THEN
        IF TG_OP = 'DELETE' THEN
            -- عند حذف الفاتورة نعيد الأمر لحالة مرسل
            UPDATE public.purchase_orders SET status = 'sent' WHERE id = v_po_id;
        ELSE
            -- عند ترحيل الفاتورة تصبح حالة أمر الشراء مرحل (posted)
            IF NEW.status IN ('posted', 'paid') THEN
                UPDATE public.purchase_orders SET status = 'posted' WHERE id = v_po_id;
            -- عند بقاء الفاتورة كمسودة تكون الحالة محول لفاتورة (converted)
            ELSIF NEW.status = 'draft' THEN
                UPDATE public.purchase_orders SET status = 'converted' WHERE id = v_po_id;
            END IF;
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- ربط التريجر بجدول فواتير المشتريات
DROP TRIGGER IF EXISTS trg_sync_purchase_order_status ON public.purchase_invoices;
CREATE TRIGGER trg_sync_purchase_order_status
AFTER INSERT OR UPDATE OF status, purchase_order_id OR DELETE ON public.purchase_invoices
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_purchase_order_status_from_invoice();

-- 🚀 4. ترميم ومزامنة الحالات الحالية لجميع أوامر الشراء فوراً
DO $$
DECLARE
    r RECORD;
    v_inv record;
BEGIN
    FOR r IN SELECT * FROM public.purchase_orders LOOP
        -- البحث عن الفاتورة المرتبطة بأمر الشراء
        SELECT * INTO v_inv FROM public.purchase_invoices
        WHERE purchase_order_id = r.id
           OR ('PI-FROM-' || COALESCE(r.po_number, r.order_number) = invoice_number)
           OR ('PI-FROM-' || substring(r.id::text, 1, 8) = invoice_number)
           OR (notes ILIKE '%' || COALESCE(r.po_number, r.order_number) || '%')
        ORDER BY created_at DESC LIMIT 1;

        IF v_inv.id IS NOT NULL THEN
            -- تحديث ربط الفاتورة بأمر الشراء
            UPDATE public.purchase_invoices SET purchase_order_id = r.id WHERE id = v_inv.id AND purchase_order_id IS NULL;

            -- تحديث حالة أمر الشراء
            IF v_inv.status IN ('posted', 'paid') THEN
                UPDATE public.purchase_orders SET status = 'posted' WHERE id = r.id;
            ELSE
                UPDATE public.purchase_orders SET status = 'converted' WHERE id = r.id;
            END IF;
        END IF;
    END LOOP;

    NOTIFY pgrst, 'reload schema';
END $$;
