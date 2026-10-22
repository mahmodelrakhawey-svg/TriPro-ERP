-- ==============================================================================
-- إضافة عمود payment_method إلى جدول orders إذا لم يكن موجوداً
-- لضمان التوافق التام مع استعلامات التقارير والمبيعات في كل القواعد
-- ==============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'orders' 
          AND column_name = 'payment_method'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN payment_method text DEFAULT 'CASH';
        RAISE NOTICE 'Column payment_method added to public.orders successfully.';
    END IF;
END $$;
