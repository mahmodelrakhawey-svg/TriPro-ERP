-- ==============================================================================
-- 🧾 TriPro ERP - Purchase Invoices: Item & Invoice Discounts & Attachments Support
-- Date: 2026-09-24
-- Purpose:
--   1. Add overall invoice discount columns (discount_type, discount_value, items_discount_amount)
--      and JSON attachments column to public.purchase_invoices.
--   2. Add line-item discount & tax columns (discount, discount_percent, tax_rate, tax_amount)
--      to public.purchase_invoice_items.
--   3. Create public.purchase_invoice_attachments table with multi-tenant RLS for
--      supplier invoice receipts, PDFs, and Egyptian Tax Authority (ETA) e-invoices.
--   4. Update public.save_purchase_invoice_draft RPC function to handle all new fields atomically.
--   5. Configure permissions and RLS policies for tenant isolation.
-- ==============================================================================

-- 1. تحديث جدول فواتير المشتريات (purchase_invoices)
DO $$
BEGIN
    -- خصم إجمالي الفاتورة
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'purchase_invoices' AND column_name = 'discount_type'
    ) THEN
        ALTER TABLE public.purchase_invoices 
        ADD COLUMN discount_type text DEFAULT 'fixed' 
        CHECK (discount_type IN ('fixed', 'percentage'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'purchase_invoices' AND column_name = 'discount_value'
    ) THEN
        ALTER TABLE public.purchase_invoices 
        ADD COLUMN discount_value numeric(15,4) DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'purchase_invoices' AND column_name = 'discount_amount'
    ) THEN
        ALTER TABLE public.purchase_invoices 
        ADD COLUMN discount_amount numeric(15,4) DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'purchase_invoices' AND column_name = 'items_discount_amount'
    ) THEN
        ALTER TABLE public.purchase_invoices 
        ADD COLUMN items_discount_amount numeric(15,4) DEFAULT 0;
    END IF;

    -- مصفوفة المرفقات السريعة بتنسيق JSONB
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'purchase_invoices' AND column_name = 'attachments'
    ) THEN
        ALTER TABLE public.purchase_invoices 
        ADD COLUMN attachments jsonb DEFAULT '[]'::jsonb;
    END IF;
END $$;

-- 2. تحديث جدول بنود فواتير المشتريات (purchase_invoice_items)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'purchase_invoice_items' AND column_name = 'discount'
    ) THEN
        ALTER TABLE public.purchase_invoice_items 
        ADD COLUMN discount numeric(15,4) DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'purchase_invoice_items' AND column_name = 'discount_percent'
    ) THEN
        ALTER TABLE public.purchase_invoice_items 
        ADD COLUMN discount_percent numeric(7,4) DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'purchase_invoice_items' AND column_name = 'tax_rate'
    ) THEN
        ALTER TABLE public.purchase_invoice_items 
        ADD COLUMN tax_rate numeric(7,4) DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'purchase_invoice_items' AND column_name = 'tax_amount'
    ) THEN
        ALTER TABLE public.purchase_invoice_items 
        ADD COLUMN tax_amount numeric(15,4) DEFAULT 0;
    END IF;
END $$;

-- 3. إنشاء جدول مرفقات فواتير المشتريات (purchase_invoice_attachments)
CREATE TABLE IF NOT EXISTS public.purchase_invoice_attachments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL,
    purchase_invoice_id uuid NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE CASCADE,
    file_name text NOT NULL,
    file_path text NOT NULL,
    file_type text,
    file_size bigint,
    uploaded_by uuid,
    created_at timestamptz DEFAULT now()
);

-- فهارس لتحسين سرعة الاستعلام
CREATE INDEX IF NOT EXISTS idx_purchase_invoice_attachments_invoice 
ON public.purchase_invoice_attachments(purchase_invoice_id);

CREATE INDEX IF NOT EXISTS idx_purchase_invoice_attachments_org 
ON public.purchase_invoice_attachments(organization_id);

-- منح الصلاحيات
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.purchase_invoice_attachments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.purchase_invoice_attachments TO anon;
GRANT ALL ON TABLE public.purchase_invoice_attachments TO service_role;

-- تفعيل RLS
ALTER TABLE public.purchase_invoice_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_purchase_invoice_attachments ON public.purchase_invoice_attachments;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.purchase_invoice_attachments;

CREATE POLICY tenant_isolation_purchase_invoice_attachments ON public.purchase_invoice_attachments
FOR ALL USING (
    organization_id = public.get_my_org() 
    OR public.get_my_org() IS NULL 
    OR organization_id IS NULL
);

-- 4. تحديث دالة save_purchase_invoice_draft لتخزين كافة تفاصيل الخصومات والمرفقات
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
    v_att jsonb;
    v_saved_invoice record;
    v_attachments jsonb;
BEGIN
    v_invoice_id := NULLIF(p_invoice->>'id', '')::uuid;
    IF v_invoice_id IS NULL THEN
        v_invoice_id := gen_random_uuid();
    END IF;

    v_org_id := NULLIF(p_invoice->>'organization_id', '')::uuid;
    IF v_org_id IS NULL THEN
        v_org_id := public.get_my_org();
    END IF;

    v_attachments := COALESCE(p_invoice->'attachments', '[]'::jsonb);

    -- إذا كانت الفاتورة مرحلة مسبقاً، نلغي ترحيلها قبل إعادة الحفظ كمسودة
    IF EXISTS (SELECT 1 FROM public.purchase_invoices WHERE id = v_invoice_id AND status = 'posted') THEN
        IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'unpost_purchase_invoice' AND pronamespace = 'public'::regnamespace) THEN
            PERFORM public.unpost_purchase_invoice(v_invoice_id, v_org_id);
        END IF;
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
            discount_type = COALESCE(p_invoice->>'discount_type', 'fixed'),
            discount_value = COALESCE((p_invoice->>'discount_value')::numeric, 0),
            discount_amount = COALESCE((p_invoice->>'discount_amount')::numeric, 0),
            items_discount_amount = COALESCE((p_invoice->>'items_discount_amount')::numeric, 0),
            paid_amount = COALESCE((p_invoice->>'paid_amount')::numeric, 0),
            treasury_account_id = NULLIF(p_invoice->>'treasury_account_id', '')::uuid,
            notes = p_invoice->>'notes',
            status = 'draft',
            currency = COALESCE(p_invoice->>'currency', 'EGP'),
            exchange_rate = COALESCE((p_invoice->>'exchange_rate')::numeric, 1),
            attachments = v_attachments,
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
            discount_type,
            discount_value,
            discount_amount,
            items_discount_amount,
            paid_amount,
            treasury_account_id,
            notes,
            status,
            currency,
            exchange_rate,
            attachments,
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
            COALESCE(p_invoice->>'discount_type', 'fixed'),
            COALESCE((p_invoice->>'discount_value')::numeric, 0),
            COALESCE((p_invoice->>'discount_amount')::numeric, 0),
            COALESCE((p_invoice->>'items_discount_amount')::numeric, 0),
            COALESCE((p_invoice->>'paid_amount')::numeric, 0),
            NULLIF(p_invoice->>'treasury_account_id', '')::uuid,
            p_invoice->>'notes',
            'draft',
            COALESCE(p_invoice->>'currency', 'EGP'),
            COALESCE((p_invoice->>'exchange_rate')::numeric, 1),
            v_attachments,
            NOW()
        );
    END IF;

    -- إعادة إدراج بنود الفاتورة مع الخصومات والضرائب التفصيلية
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
                discount,
                discount_percent,
                tax_rate,
                tax_amount,
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
                COALESCE((v_item->>'discount')::numeric, 0),
                COALESCE((v_item->>'discount_percent')::numeric, 0),
                COALESCE((v_item->>'tax_rate')::numeric, 0),
                COALESCE((v_item->>'tax_amount')::numeric, 0),
                (v_item->>'total')::numeric,
                v_item->>'batch_number',
                NULLIF(v_item->>'expiry_date', '')::date
            );
        END LOOP;
    END IF;

    -- مزامنة المرفقات في جدول purchase_invoice_attachments إن وجدت في المصفوفة
    IF jsonb_typeof(v_attachments) = 'array' AND jsonb_array_length(v_attachments) > 0 THEN
        FOR v_att IN SELECT * FROM jsonb_array_elements(v_attachments)
        LOOP
            IF NULLIF(v_att->>'file_path', '') IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM public.purchase_invoice_attachments 
                WHERE purchase_invoice_id = v_invoice_id AND file_path = v_att->>'file_path'
            ) THEN
                INSERT INTO public.purchase_invoice_attachments (
                    organization_id,
                    purchase_invoice_id,
                    file_name,
                    file_path,
                    file_type,
                    file_size
                ) VALUES (
                    v_org_id,
                    v_invoice_id,
                    COALESCE(v_att->>'file_name', 'مرفق'),
                    v_att->>'file_path',
                    v_att->>'file_type',
                    NULLIF(v_att->>'file_size', '')::bigint
                );
            END IF;
        END LOOP;
    END IF;

    SELECT * INTO v_saved_invoice FROM public.purchase_invoices WHERE id = v_invoice_id;
    RETURN to_jsonb(v_saved_invoice);
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_purchase_invoice_draft(jsonb, jsonb) TO authenticated, anon, service_role;
