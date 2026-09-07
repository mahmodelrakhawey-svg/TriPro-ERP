-- التأكد من وجود أعمدة الربط بالفواتير الأصلية في جداول المرتجعات
DO $$
BEGIN
    -- 1. لمرتجع المبيعات (sales_returns)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_returns' AND column_name = 'original_invoice_id') THEN
        ALTER TABLE public.sales_returns ADD COLUMN original_invoice_id uuid REFERENCES public.invoices(id);
    END IF;

    -- 2. لمرتجع المشتريات (purchase_returns)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_returns' AND column_name = 'original_invoice_id') THEN
        ALTER TABLE public.purchase_returns ADD COLUMN original_invoice_id uuid REFERENCES public.purchase_invoices(id);
    END IF;
END $$;