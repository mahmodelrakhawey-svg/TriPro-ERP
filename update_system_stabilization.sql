-- 🛠️ ملف استقرار النظام (System Stabilization)
-- يدمج منطق التريجرات الموزعة ويضمن تجانس العمليات

-- 1. دمج تريجر خصم المخزون اللحظي (Inventory Deduction)
-- مأخوذ من الملف المنفصل 2026-03-25_realtime_inventory_deduction.sql

CREATE OR REPLACE FUNCTION public.trigger_handle_stock_on_order()
RETURNS TRIGGER AS $$
BEGIN
    -- منطق الخصم اللحظي للمواد الخام والمنتجات الجاهزة
    IF NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED' THEN
        PERFORM public.mfg_deduct_stock_from_order(NEW.id);
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- 2. قيود سلامة البيانات المالية
-- تأكد من عدم وجود تكرار في أرقام القيود أو الفواتير داخل المنظمة الواحدة
-- [تحديث الفهارس الفريدة هنا]

-- 3. إشعار النظام بالتحديثات
COMMENT ON SCHEMA public IS 'System stabilized at ' || now();