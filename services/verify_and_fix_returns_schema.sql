-- 🛠️ فحص وإصلاح شامل لأسماء أعمدة المرتجعات
-- يقوم هذا السكربت بتوحيد أسماء مفاتيح الربط لتكون sales_return_id و purchase_return_id

DO $$
BEGIN
    -- 1. التحقق من sales_return_items وتصحيحه
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sales_return_items' AND column_name = 'return_id'
    ) THEN
        ALTER TABLE public.sales_return_items RENAME COLUMN return_id TO sales_return_id;
        RAISE NOTICE 'تم تصحيح اسم العمود في sales_return_items إلى sales_return_id';
    END IF;

    -- 2. التحقق من purchase_return_items وتصحيحه
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'purchase_return_items' AND column_name = 'return_id'
    ) THEN
        ALTER TABLE public.purchase_return_items RENAME COLUMN return_id TO purchase_return_id;
        RAISE NOTICE 'تم تصحيح اسم العمود في purchase_return_items إلى purchase_return_id';
    END IF;
END $$;