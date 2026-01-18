-- 🛠️ إصلاح عدم تطابق أسماء الأعمدة في جداول المرتجعات
-- يقوم هذا السكربت بتوحيد أسماء أعمدة الربط لتكون sales_return_id و purchase_return_id

DO $$
BEGIN
    -- 1. إصلاح جدول sales_return_items
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_return_items' AND column_name = 'return_id') THEN
        ALTER TABLE public.sales_return_items RENAME COLUMN return_id TO sales_return_id;
    END IF;

    -- 2. إصلاح جدول purchase_return_items
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_return_items' AND column_name = 'return_id') THEN
        ALTER TABLE public.purchase_return_items RENAME COLUMN return_id TO purchase_return_id;
    END IF;
END $$;