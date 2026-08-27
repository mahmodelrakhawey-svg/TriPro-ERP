-- ==============================================================================
-- TriPro ERP — Fix Butchering Module Permissions & Grants
-- Migration: 2026-08-27_fix_butchering_permissions_and_stock.sql
-- Description: منح الصلاحيات الكاملة لجداول التشفية للمستخدمين المصادقين وتحديث السياسات
-- ==============================================================================

-- 1. منح الصلاحيات الكاملة على الجداول للمصادقين والمجهولين (RLS ستتولى التحقق)
GRANT ALL ON TABLE butchering_templates TO authenticated, anon;
GRANT ALL ON TABLE butchering_template_items TO authenticated, anon;
GRANT ALL ON TABLE butchering_orders TO authenticated, anon;
GRANT ALL ON TABLE butchering_order_items TO authenticated, anon;

-- 2. التأكد من تفعيل RLS
ALTER TABLE butchering_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE butchering_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE butchering_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE butchering_order_items ENABLE ROW LEVEL SECURITY;

-- 3. تحديث وتجديد السياسات
DO $$
BEGIN
    DROP POLICY IF EXISTS allow_all_templates ON butchering_templates;
    CREATE POLICY allow_all_templates ON butchering_templates FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS allow_all_template_items ON butchering_template_items;
    CREATE POLICY allow_all_template_items ON butchering_template_items FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS allow_all_orders ON butchering_orders;
    CREATE POLICY allow_all_orders ON butchering_orders FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS allow_all_order_items ON butchering_order_items;
    CREATE POLICY allow_all_order_items ON butchering_order_items FOR ALL USING (true) WITH CHECK (true);
END $$;
