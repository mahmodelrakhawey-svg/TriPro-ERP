-- 🛠️ إضافة عمود original_invoice_id لجدول مرتجعات المبيعات
-- هذا العمود ضروري لربط المرتجع بالفاتورة الأصلية وتمييز المرتجعات الحرة

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'sales_returns'
        AND column_name = 'original_invoice_id'
    ) THEN
        ALTER TABLE public.sales_returns ADD COLUMN original_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;
    END IF;
END $$;