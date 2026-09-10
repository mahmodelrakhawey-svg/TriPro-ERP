-- ==============================================================================
-- تاريخ التحديث: 2026-09-10
-- الميزة: إضافة حقل المورد المفضل (supplier_id) لجدول الأصناف (products)
-- الغرض: ربط كل صنف بمورده المفضل لاستخدامه في أوامر الشراء التلقائية وحد الطلب
-- ==============================================================================

-- 1. إضافة عمود supplier_id في جدول products إذا لم يكن موجوداً
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'supplier_id'
    ) THEN
        ALTER TABLE products ADD COLUMN supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_products_supplier_id ON products(supplier_id);
    END IF;
END $$;

-- 2. تحديث كاش PostgREST
NOTIFY pgrst, 'reload schema';
