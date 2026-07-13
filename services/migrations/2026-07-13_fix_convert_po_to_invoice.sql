-- 🛠️ تحديث دالة تحويل أمر الشراء إلى فاتورة مشتريات (Fix convert_po_to_invoice)
-- المشكلة: كان يتم نقل البنود بدون نسخ وحدة القياس (uom_id) وبدون احتساب قيمة حقل الإجمالي (total) مما يسبب قيد محاسبي غير متزن (الجانب المدين للمخزون قيمته صفر).
-- الحل: تعديل الدالة لنسخ uom_id واحتساب total = quantity * unit_price بشكل آلي لضمان صحة واتزان القيود المحاسبية.
-- تم تعديل شرط المطابقة ليعتمد على order_id ليتوافق مع بنية الجدول الحالية للمستخدم.

DROP FUNCTION IF EXISTS public.convert_po_to_invoice(uuid, uuid);
DROP FUNCTION IF EXISTS public.convert_po_to_invoice(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.convert_po_to_invoice(p_po_id uuid, p_warehouse_id uuid DEFAULT NULL, p_org_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_po record; v_invoice_id uuid; v_inv_num text; v_target_org_id uuid;
BEGIN
    -- 🛡️ تحديد المنظمة لضمان ظهور الفاتورة في السجل الصحيح
    v_target_org_id := COALESCE(p_org_id, public.get_my_org());

    SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'أمر الشراء غير موجود'; END IF;
    v_target_org_id := COALESCE(v_target_org_id, v_po.organization_id);

    v_inv_num := 'PI-FROM-' || COALESCE(v_po.order_number, substring(p_po_id::text, 1, 8));

    -- 🛡️ إنشاء رأس فاتورة المشتريات كمسودة
    INSERT INTO public.purchase_invoices (
        invoice_number, supplier_id, user_id, invoice_date, total_amount, tax_amount, subtotal,
        status, warehouse_id, organization_id, notes, currency, exchange_rate
    ) VALUES (
        v_inv_num, 
        v_po.supplier_id, 
        auth.uid(), -- user_id
        now()::date, -- invoice_date
        COALESCE(v_po.total_amount, 0), 
        COALESCE(v_po.tax_amount, 0),
        COALESCE(v_po.total_amount, 0) - COALESCE(v_po.tax_amount, 0),
        'draft',
        COALESCE(p_warehouse_id, (SELECT id FROM public.warehouses WHERE organization_id = v_target_org_id AND deleted_at IS NULL ORDER BY name ASC LIMIT 1)),
        v_target_org_id,
        'محولة من أمر شراء رقم: ' || COALESCE(v_po.order_number, 'بدون رقم'),
        'EGP', 
        1
    ) RETURNING id INTO v_invoice_id;

    -- 3. نقل البنود مع الحفاظ على وحدة القياس والإجماليات لضمان صحة القيود المحاسبية
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
    WHERE order_id = p_po_id;

    -- 4. تحديث حالة الطلب لضمان عدم تكرار الفوترة
    UPDATE public.purchase_orders SET status = 'invoiced' WHERE id = p_po_id;

    RETURN v_invoice_id;
END; $$;

-- 🔓 إعادة منح الصلاحيات
GRANT EXECUTE ON FUNCTION public.convert_po_to_invoice(uuid, uuid, uuid) TO authenticated;
