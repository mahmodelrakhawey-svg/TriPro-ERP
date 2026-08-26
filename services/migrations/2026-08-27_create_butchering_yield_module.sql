-- ==============================================================================
-- TriPro ERP — Butchering & Meat Disassembly Yield Module Migration
-- Migration: 2026-08-27_create_butchering_yield_module.sql
-- Description: إنشاء جداول وقوالب تشفية اللحوم وتفكيك الذبائح والدواجن والأسماك
-- ==============================================================================

-- 1. جدول قوالب التشفية والتشريح القياسية (Butchering Templates)
CREATE TABLE IF NOT EXISTS butchering_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) DEFAULT 'beef', -- beef, poultry, lamb, fish, other
    source_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    default_expected_yield_pct NUMERIC(6, 2) DEFAULT 95.00, -- نسبة اللحم النافع المعيارية
    default_max_shrinkage_pct NUMERIC(6, 2) DEFAULT 5.00,   -- أقصى نسبة فاقد/هالك مسموح بها
    cost_allocation_method VARCHAR(50) DEFAULT 'relative_value', -- relative_value, by_product_deduction, weight_equal
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. جدول مخرجات القوالب القياسية (Butchering Template Items)
CREATE TABLE IF NOT EXISTS butchering_template_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES butchering_templates(id) ON DELETE CASCADE,
    output_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    output_name VARCHAR(255) NOT NULL,
    expected_yield_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00, -- النسبة المتوقعة من إجمالي وزن الذبيحة
    relative_value_weight NUMERIC(6, 2) NOT NULL DEFAULT 1.00, -- معامل القيمة النسبية لتوزيع التكلفة
    is_by_product BOOLEAN DEFAULT FALSE, -- هل هو منتج ثانوي (عظم، دهن، أحشاء)
    standard_unit_price NUMERIC(15, 4) DEFAULT 0.00, -- القيمة التقديرية للوحدة
    notes TEXT,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. جدول أوامر وجلسات التشفية الفعلية (Butchering Work Orders)
CREATE TABLE IF NOT EXISTS butchering_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    order_number VARCHAR(100) NOT NULL UNIQUE,
    template_id UUID REFERENCES butchering_templates(id) ON DELETE SET NULL,
    source_product_id UUID NOT NULL REFERENCES products(id),
    warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
    destination_warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- الأوزان والتكاليف المدخلة (Input)
    input_weight NUMERIC(12, 3) NOT NULL, -- الوزن الإجمالي للذبيحة أو الدواجن (كجم)
    input_cost_per_kg NUMERIC(15, 4) NOT NULL, -- تكلفة الكيلو وقت الشراء
    total_input_cost NUMERIC(15, 4) NOT NULL, -- إجمالي تكلفة المادة الخام
    additional_labor_cost NUMERIC(15, 4) DEFAULT 0.00, -- مصاريف جزارة وعمالة إضافية
    additional_overhead_cost NUMERIC(15, 4) DEFAULT 0.00, -- مصاريف تشغيل / تبريد / نقل
    total_net_cost NUMERIC(15, 4) NOT NULL, -- إجمالي التكلفة الكلية القابلة للتوزيع
    
    -- نتائج المخرجات والفاقد (Outputs Summary)
    total_output_weight NUMERIC(12, 3) NOT NULL DEFAULT 0.000, -- مجموع أوزان المخرجات الفعلية
    shrinkage_weight NUMERIC(12, 3) NOT NULL DEFAULT 0.000, -- وزن الفاقد / الهالك الفعلي (input - output)
    shrinkage_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00, -- نسبة الفاقد الفعلية
    useful_yield_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00, -- نسبة الاستخراج النافع الفعلية
    
    -- التكلفة والمحاسبة
    cost_allocation_method VARCHAR(50) DEFAULT 'relative_value',
    status VARCHAR(50) DEFAULT 'completed', -- draft, completed, cancelled
    journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
    
    -- بيانات إدارية
    butcher_name VARCHAR(255), -- اسم الشيف أو الجزار المسؤول
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. جدول بنود ومخرجات أمر التشفية الفعلي (Butchering Order Items)
CREATE TABLE IF NOT EXISTS butchering_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES butchering_orders(id) ON DELETE CASCADE,
    output_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    output_name VARCHAR(255) NOT NULL,
    actual_weight NUMERIC(12, 3) NOT NULL, -- الوزن الفعلي المستخرج (كجم)
    yield_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00, -- نسبة الاستخراج الفعلية من الذبيحة
    relative_value_weight NUMERIC(6, 2) NOT NULL DEFAULT 1.00,
    allocated_cost_per_kg NUMERIC(15, 4) NOT NULL, -- التكلفة المحسوبة بدقة للكيلو الواحد
    total_allocated_cost NUMERIC(15, 4) NOT NULL, -- إجمالي التكلفة المحملة على هذا الصنف
    is_by_product BOOLEAN DEFAULT FALSE,
    standard_expected_weight NUMERIC(12, 3) DEFAULT 0.000, -- الوزن المعياري المتوقع للمقارنة
    variance_weight NUMERIC(12, 3) DEFAULT 0.000, -- فرق الوزن عن المعياري
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- إنشاء الفهارس لتسريع البحث والأداء (Indexes)
CREATE INDEX IF NOT EXISTS idx_butchering_orders_org ON butchering_orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_butchering_orders_date ON butchering_orders(order_date);
CREATE INDEX IF NOT EXISTS idx_butchering_orders_status ON butchering_orders(status);
CREATE INDEX IF NOT EXISTS idx_butchering_order_items_order ON butchering_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_butchering_templates_org ON butchering_templates(organization_id);

-- تفعيل سياسات الأمان RLS
ALTER TABLE butchering_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE butchering_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE butchering_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE butchering_order_items ENABLE ROW LEVEL SECURITY;

-- سياسات الوصول
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'butchering_templates' AND policyname = 'allow_all_templates') THEN
        CREATE POLICY allow_all_templates ON butchering_templates FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'butchering_template_items' AND policyname = 'allow_all_template_items') THEN
        CREATE POLICY allow_all_template_items ON butchering_template_items FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'butchering_orders' AND policyname = 'allow_all_orders') THEN
        CREATE POLICY allow_all_orders ON butchering_orders FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'butchering_order_items' AND policyname = 'allow_all_order_items') THEN
        CREATE POLICY allow_all_order_items ON butchering_order_items FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;
