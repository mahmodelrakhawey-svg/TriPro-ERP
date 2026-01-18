-- إنشاء دالة دائمة لإصلاح هيكل جداول المرتجعات
-- يمكن استدعاؤها في أي وقت عبر: SELECT fix_returns_schema();

CREATE OR REPLACE FUNCTION public.fix_returns_schema()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    result_msg text := '';
BEGIN
    -- 1. إصلاح جدول sales_return_items
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_return_items' AND column_name = 'return_id') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_return_items' AND column_name = 'sales_return_id') THEN
            ALTER TABLE public.sales_return_items RENAME COLUMN return_id TO sales_return_id;
            result_msg := result_msg || 'تم تصحيح sales_return_items. ';
        END IF;
    END IF;

    -- 2. إصلاح جدول purchase_return_items
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_return_items' AND column_name = 'return_id') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_return_items' AND column_name = 'purchase_return_id') THEN
            ALTER TABLE public.purchase_return_items RENAME COLUMN return_id TO purchase_return_id;
            result_msg := result_msg || 'تم تصحيح purchase_return_items. ';
        END IF;
    END IF;

    IF result_msg = '' THEN
        RETURN 'الهيكل سليم بالفعل.';
    END IF;

    RETURN result_msg;
END;
$$;