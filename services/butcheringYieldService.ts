/**
 * ==============================================================================
 * Meat Disassembly & Butchering Yield Service (خدمة تشفية وتفكيك اللحوم والدواجن)
 * TriPro ERP — services/butcheringYieldService.ts
 * ==============================================================================
 * الغرض:
 * إدارة أوامر التشفية والتفكيك للذبائح والدواجن والأسماك مع التوزيع الدقيق للتكلفة،
 * واحتساب نسب الهدر والفاقد، والربط التلقائي بالمخازن والقيود المحاسبية وتكاليف الوجبات.
 * مزود بطبقة حماية وسقوط آلي محلي (Local Fallback Resilience) في حال لم يتم
 * تشغيل الـ SQL Migration على Supabase بعد.
 * ==============================================================================
 */

import { supabase } from '../supabaseClient';
import { AccountingEngine } from './accountingEngine';
import { secureStorage } from '../utils/securityMiddleware';

export interface ButcheringTemplateItem {
  id?: string;
  template_id?: string;
  output_product_id?: string | null;
  output_name: string;
  expected_yield_pct: number; // النسبة المعيارية المتوقعة من إجمالي وزن الذبيحة %
  relative_value_weight: number; // معامل القيمة السوقية (مثال: الفلتو 2.2، المفروم 1.0، العظم 0.15)
  is_by_product?: boolean; // منتج ثانوي كالعظم والدهن
  standard_unit_price?: number;
  notes?: string;
  sort_order?: number;
}

export interface ButcheringTemplate {
  id?: string;
  organization_id?: string;
  name: string;
  description?: string;
  category: 'beef' | 'poultry' | 'lamb' | 'fish' | 'other';
  source_product_id?: string | null;
  default_expected_yield_pct: number;
  default_max_shrinkage_pct: number;
  cost_allocation_method: 'relative_value' | 'by_product_deduction' | 'weight_equal';
  is_active?: boolean;
  items?: ButcheringTemplateItem[];
}

export interface ButcheringOrderItem {
  id?: string;
  order_id?: string;
  output_product_id?: string | null;
  output_name: string;
  actual_weight: number; // الوزن الفعلي المستخرج (كجم)
  yield_pct?: number; // نسبة الاستخراج الفعلية %
  relative_value_weight: number;
  allocated_cost_per_kg: number; // التكلفة المحسوبة بدقة للكيلو الواحد
  total_allocated_cost: number; // إجمالي التكلفة المحملة
  is_by_product?: boolean;
  standard_expected_weight?: number;
  variance_weight?: number;
  notes?: string;
}

export interface ButcheringOrder {
  id?: string;
  organization_id?: string;
  order_number: string;
  template_id?: string | null;
  source_product_id: string;
  source_product_name?: string;
  warehouse_id?: string | null;
  destination_warehouse_id?: string | null;
  order_date: string;
  
  // مدخلات التكلفة والوزن
  input_weight: number;
  input_cost_per_kg: number;
  total_input_cost: number;
  additional_labor_cost: number;
  additional_overhead_cost: number;
  total_net_cost: number;
  
  // المخرجات والفاقد
  total_output_weight: number;
  shrinkage_weight: number;
  shrinkage_pct: number;
  useful_yield_pct: number;
  
  cost_allocation_method: 'relative_value' | 'by_product_deduction' | 'weight_equal';
  status: 'draft' | 'completed' | 'cancelled';
  journal_entry_id?: string | null;
  butcher_name?: string;
  notes?: string;
  created_by?: string;
  created_at?: string;
  items?: ButcheringOrderItem[];
}

export interface CostCalculationInput {
  total_net_cost: number;
  input_weight: number;
  method: 'relative_value' | 'by_product_deduction' | 'weight_equal';
  items: Array<{
    output_name: string;
    actual_weight: number;
    relative_value_weight: number;
    is_by_product?: boolean;
    standard_unit_price?: number;
  }>;
}

export interface CostCalculationOutputItem {
  output_name: string;
  actual_weight: number;
  yield_pct: number;
  allocated_cost_per_kg: number;
  total_allocated_cost: number;
  relative_value_weight: number;
  is_by_product: boolean;
}

export interface CostCalculationResult {
  total_output_weight: number;
  shrinkage_weight: number;
  shrinkage_pct: number;
  useful_yield_pct: number;
  total_allocated_cost: number;
  items: CostCalculationOutputItem[];
}

// ---------------------------------------------------------------------------
// القوالب المعيارية الافتراضية الجاهزة للاستخدام في المطاعم
// ---------------------------------------------------------------------------
export const DEFAULT_BUTCHERING_TEMPLATES: ButcheringTemplate[] = [
  {
    name: 'تشفية عجل بلدي كامل (Whole Beef Carcass)',
    category: 'beef',
    description: 'قالب تفكيك وتشفية عجل بلدي كامل إلى قطعيات فاخرة ومفروم وعظام',
    default_expected_yield_pct: 95.0,
    default_max_shrinkage_pct: 5.0,
    cost_allocation_method: 'relative_value',
    items: [
      { output_name: 'عرق فلتو بقري (Tenderloin / Fillet)', expected_yield_pct: 4.0, relative_value_weight: 2.2, is_by_product: false },
      { output_name: 'إنتركوت وريب آي (Ribeye / Striploin)', expected_yield_pct: 8.5, relative_value_weight: 1.8, is_by_product: false },
      { output_name: 'كباب حلة ومكعبات خضار (Beef Stew Cubes)', expected_yield_pct: 26.0, relative_value_weight: 1.35, is_by_product: false },
      { output_name: 'لحم مفروم بلدي ممتاز (Minced Beef)', expected_yield_pct: 28.5, relative_value_weight: 1.0, is_by_product: false },
      { output_name: 'موزة وشوربة (Beef Shank)', expected_yield_pct: 8.0, relative_value_weight: 1.15, is_by_product: false },
      { output_name: 'دوش ودهن ناعم (Beef Fat / Suet)', expected_yield_pct: 8.0, relative_value_weight: 0.5, is_by_product: true },
      { output_name: 'عظم للمرق والشوربة (Soup Bones)', expected_yield_pct: 12.0, relative_value_weight: 0.12, is_by_product: true }
    ]
  },
  {
    name: 'تشفية ربع خلفي بقري (Beef Hindquarter)',
    category: 'beef',
    description: 'تشفية الربع الخلفي (الفخذ + الفلتو + الإنتركوت + السمانة)',
    default_expected_yield_pct: 96.0,
    default_max_shrinkage_pct: 4.0,
    cost_allocation_method: 'relative_value',
    items: [
      { output_name: 'عرق فلتو (Fillet)', expected_yield_pct: 7.5, relative_value_weight: 2.2, is_by_product: false },
      { output_name: 'وش فخذ وستيك (Topside / Rump)', expected_yield_pct: 28.0, relative_value_weight: 1.5, is_by_product: false },
      { output_name: 'سمانة وعرق تربيانكو (Eye of Round)', expected_yield_pct: 18.0, relative_value_weight: 1.4, is_by_product: false },
      { output_name: 'مفروم ربع خلفي (Minced Meat)', expected_yield_pct: 24.5, relative_value_weight: 1.0, is_by_product: false },
      { output_name: 'موزة خلفية (Hind Shank)', expected_yield_pct: 7.0, relative_value_weight: 1.2, is_by_product: false },
      { output_name: 'عظم فخذ ومفاصل (Bones)', expected_yield_pct: 11.0, relative_value_weight: 0.1, is_by_product: true }
    ]
  },
  {
    name: 'تفكيك وتشريح دواجن وفراخ كاملة (Whole Fresh Chicken)',
    category: 'poultry',
    description: 'تفكيك الدجاج الكامل إلى صدور بانيه وشاورما ودبابيس وأجنحة وهياكل',
    default_expected_yield_pct: 95.0,
    default_max_shrinkage_pct: 5.0,
    cost_allocation_method: 'relative_value',
    items: [
      { output_name: 'صدور دجاج مخلية (بانيه / شاورما)', expected_yield_pct: 35.0, relative_value_weight: 1.75, is_by_product: false },
      { output_name: 'أوراك ودبابيس دجاج (Thighs & Drumsticks)', expected_yield_pct: 30.0, relative_value_weight: 1.25, is_by_product: false },
      { output_name: 'أجنحة دجاج (Chicken Wings)', expected_yield_pct: 10.0, relative_value_weight: 0.85, is_by_product: false },
      { output_name: 'هياكل وعظام دجاج للشوربة (Chicken Bones)', expected_yield_pct: 16.0, relative_value_weight: 0.2, is_by_product: true },
      { output_name: 'كبد وقوانص (Giblets)', expected_yield_pct: 4.0, relative_value_weight: 0.9, is_by_product: false }
    ]
  },
  {
    name: 'تشفية خروف / ضأن كامل (Whole Lamb Carcass)',
    category: 'lamb',
    description: 'تشفية الذبيحة الضاني إلى ريش وفخذ وكتف ومفروم ولية',
    default_expected_yield_pct: 96.0,
    default_max_shrinkage_pct: 4.0,
    cost_allocation_method: 'relative_value',
    items: [
      { output_name: 'ريش ضاني ممتازة (Lamb Chops / Rack)', expected_yield_pct: 18.0, relative_value_weight: 2.0, is_by_product: false },
      { output_name: 'فخذ ضاني للشوي (Leg of Lamb)', expected_yield_pct: 25.0, relative_value_weight: 1.6, is_by_product: false },
      { output_name: 'كتف وموزة ضاني (Lamb Shoulder & Shank)', expected_yield_pct: 22.0, relative_value_weight: 1.35, is_by_product: false },
      { output_name: 'لحم مفروم ضاني للكفتة (Minced Lamb)', expected_yield_pct: 18.0, relative_value_weight: 1.1, is_by_product: false },
      { output_name: 'لية ودهن ضاني (Lamb Tail Fat)', expected_yield_pct: 8.0, relative_value_weight: 0.9, is_by_product: false },
      { output_name: 'عظام ضاني (Lamb Bones)', expected_yield_pct: 5.0, relative_value_weight: 0.1, is_by_product: true }
    ]
  },
  {
    name: 'تشفية سمك سلمون / أسماك كاملة (Whole Salmon / Fish)',
    category: 'fish',
    description: 'تشفية سمك السلمون الكامل إلى فيليه وبطن ورأس وعظام',
    default_expected_yield_pct: 94.0,
    default_max_shrinkage_pct: 6.0,
    cost_allocation_method: 'relative_value',
    items: [
      { output_name: 'فيليه سلمون ممتاز بدون شوك (Salmon Fillet)', expected_yield_pct: 60.0, relative_value_weight: 1.8, is_by_product: false },
      { output_name: 'أطراف وبطن السلمون (Salmon Belly / Trim)', expected_yield_pct: 12.0, relative_value_weight: 1.0, is_by_product: false },
      { output_name: 'رأس وهيكل سمك للشوربة (Fish Head & Frame)', expected_yield_pct: 22.0, relative_value_weight: 0.15, is_by_product: true }
    ]
  }
];

export const BUTCHERING_SQL_SCHEMA = `-- كود إنشاء جداول التشفية وتفكيك الذبائح في Supabase SQL Editor:
CREATE TABLE IF NOT EXISTS butchering_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) DEFAULT 'beef',
    source_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    default_expected_yield_pct NUMERIC(6, 2) DEFAULT 95.00,
    default_max_shrinkage_pct NUMERIC(6, 2) DEFAULT 5.00,
    cost_allocation_method VARCHAR(50) DEFAULT 'relative_value',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS butchering_template_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES butchering_templates(id) ON DELETE CASCADE,
    output_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    output_name VARCHAR(255) NOT NULL,
    expected_yield_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    relative_value_weight NUMERIC(6, 2) NOT NULL DEFAULT 1.00,
    is_by_product BOOLEAN DEFAULT FALSE,
    standard_unit_price NUMERIC(15, 4) DEFAULT 0.00,
    notes TEXT,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS butchering_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    order_number VARCHAR(100) NOT NULL UNIQUE,
    template_id UUID REFERENCES butchering_templates(id) ON DELETE SET NULL,
    source_product_id UUID NOT NULL REFERENCES products(id),
    warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
    destination_warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    input_weight NUMERIC(12, 3) NOT NULL,
    input_cost_per_kg NUMERIC(15, 4) NOT NULL,
    total_input_cost NUMERIC(15, 4) NOT NULL,
    additional_labor_cost NUMERIC(15, 4) DEFAULT 0.00,
    additional_overhead_cost NUMERIC(15, 4) DEFAULT 0.00,
    total_net_cost NUMERIC(15, 4) NOT NULL,
    total_output_weight NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    shrinkage_weight NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    shrinkage_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    useful_yield_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    cost_allocation_method VARCHAR(50) DEFAULT 'relative_value',
    status VARCHAR(50) DEFAULT 'completed',
    journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
    butcher_name VARCHAR(255),
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS butchering_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES butchering_orders(id) ON DELETE CASCADE,
    output_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    output_name VARCHAR(255) NOT NULL,
    actual_weight NUMERIC(12, 3) NOT NULL,
    yield_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    relative_value_weight NUMERIC(6, 2) NOT NULL DEFAULT 1.00,
    allocated_cost_per_kg NUMERIC(15, 4) NOT NULL,
    total_allocated_cost NUMERIC(15, 4) NOT NULL,
    is_by_product BOOLEAN DEFAULT FALSE,
    standard_expected_weight NUMERIC(12, 3) DEFAULT 0.000,
    variance_weight NUMERIC(12, 3) DEFAULT 0.000,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE butchering_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE butchering_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE butchering_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE butchering_order_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
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

GRANT ALL ON TABLE butchering_templates TO authenticated, anon;
GRANT ALL ON TABLE butchering_template_items TO authenticated, anon;
GRANT ALL ON TABLE butchering_orders TO authenticated, anon;
GRANT ALL ON TABLE butchering_order_items TO authenticated, anon;
`;

const LOCAL_STORAGE_ORDERS_KEY = 'tripro_butchering_orders_v1';
const LOCAL_STORAGE_TEMPLATES_KEY = 'tripro_butchering_templates_v1';

// ---------------------------------------------------------------------------
// فئة الخدمة المركزية مع طبقة التوافق التلقائي (Local Fallback Resilience)
// ---------------------------------------------------------------------------
class ButcheringYieldService {
  private isTableMissingError(error: any): boolean {
    if (!error) return false;
    const msg = (error.message || '').toLowerCase();
    const code = error.code || '';
    return (
      code === 'PGRST205' ||
      code === '42P01' ||
      msg.includes('schema cache') ||
      msg.includes('relation') ||
      msg.includes('does not exist') ||
      msg.includes('could not find the table')
    );
  }

  /**
   * محرك الحساب الرياضي لتوزيع التكلفة واحتساب الفاقد
   */
  public calculateCostAllocation(input: CostCalculationInput): CostCalculationResult {
    const { total_net_cost, input_weight, method, items } = input;

    let total_output_weight = 0;
    for (const it of items) {
      total_output_weight += Number(it.actual_weight || 0);
    }

    const shrinkage_weight = Math.max(0, input_weight - total_output_weight);
    const shrinkage_pct = input_weight > 0 ? (shrinkage_weight / input_weight) * 100 : 0;
    const useful_yield_pct = input_weight > 0 ? (total_output_weight / input_weight) * 100 : 0;

    const outputItems: CostCalculationOutputItem[] = [];

    if (total_output_weight <= 0 || total_net_cost <= 0) {
      return {
        total_output_weight,
        shrinkage_weight,
        shrinkage_pct: Number(shrinkage_pct.toFixed(2)),
        useful_yield_pct: Number(useful_yield_pct.toFixed(2)),
        total_allocated_cost: 0,
        items: items.map(i => ({
          output_name: i.output_name,
          actual_weight: i.actual_weight,
          yield_pct: 0,
          allocated_cost_per_kg: 0,
          total_allocated_cost: 0,
          relative_value_weight: i.relative_value_weight,
          is_by_product: Boolean(i.is_by_product)
        }))
      };
    }

    if (method === 'weight_equal') {
      // 1. طريقة التوزيع بالتساوي على الوزن
      const costPerKg = total_net_cost / total_output_weight;
      let allocatedSum = 0;

      items.forEach(it => {
        const itemWeight = Number(it.actual_weight || 0);
        const itemYieldPct = input_weight > 0 ? (itemWeight / input_weight) * 100 : 0;
        const totalItemCost = Number((itemWeight * costPerKg).toFixed(4));
        allocatedSum += totalItemCost;

        outputItems.push({
          output_name: it.output_name,
          actual_weight: itemWeight,
          yield_pct: Number(itemYieldPct.toFixed(2)),
          allocated_cost_per_kg: Number(costPerKg.toFixed(4)),
          total_allocated_cost: totalItemCost,
          relative_value_weight: it.relative_value_weight,
          is_by_product: Boolean(it.is_by_product)
        });
      });
    } else if (method === 'by_product_deduction') {
      // 2. طريقة استبعاد المنتجات العرضية (By-Product Deduction)
      let byProductsValue = 0;
      let primeOutputsTotalScore = 0;

      items.forEach(it => {
        const itemWeight = Number(it.actual_weight || 0);
        if (it.is_by_product) {
          const unitPrice = Number(it.standard_unit_price || (total_net_cost / input_weight) * 0.15);
          byProductsValue += itemWeight * unitPrice;
        } else {
          primeOutputsTotalScore += itemWeight * Number(it.relative_value_weight || 1.0);
        }
      });

      const netPrimeCost = Math.max(0, total_net_cost - byProductsValue);

      items.forEach(it => {
        const itemWeight = Number(it.actual_weight || 0);
        const itemYieldPct = input_weight > 0 ? (itemWeight / input_weight) * 100 : 0;

        if (it.is_by_product) {
          const unitPrice = Number(it.standard_unit_price || (total_net_cost / input_weight) * 0.15);
          const totalCost = Number((itemWeight * unitPrice).toFixed(4));
          outputItems.push({
            output_name: it.output_name,
            actual_weight: itemWeight,
            yield_pct: Number(itemYieldPct.toFixed(2)),
            allocated_cost_per_kg: Number(unitPrice.toFixed(4)),
            total_allocated_cost: totalCost,
            relative_value_weight: it.relative_value_weight,
            is_by_product: true
          });
        } else {
          const itemScore = itemWeight * Number(it.relative_value_weight || 1.0);
          const share = primeOutputsTotalScore > 0 ? itemScore / primeOutputsTotalScore : 0;
          const totalCost = Number((netPrimeCost * share).toFixed(4));
          const costPerKg = itemWeight > 0 ? totalCost / itemWeight : 0;

          outputItems.push({
            output_name: it.output_name,
            actual_weight: itemWeight,
            yield_pct: Number(itemYieldPct.toFixed(2)),
            allocated_cost_per_kg: Number(costPerKg.toFixed(4)),
            total_allocated_cost: totalCost,
            relative_value_weight: it.relative_value_weight,
            is_by_product: false
          });
        }
      });
    } else {
      // 3. طريقة القيمة النسبية والسوقية (Relative Sales Value Method - الافتراضية والقياسية)
      let totalValueScore = 0;
      items.forEach(it => {
        const itemWeight = Number(it.actual_weight || 0);
        const relWeight = Math.max(0.01, Number(it.relative_value_weight || 1.0));
        totalValueScore += itemWeight * relWeight;
      });

      items.forEach(it => {
        const itemWeight = Number(it.actual_weight || 0);
        const relWeight = Math.max(0.01, Number(it.relative_value_weight || 1.0));
        const itemScore = itemWeight * relWeight;
        const itemYieldPct = input_weight > 0 ? (itemWeight / input_weight) * 100 : 0;

        const share = totalValueScore > 0 ? itemScore / totalValueScore : 0;
        const totalItemCost = Number((total_net_cost * share).toFixed(4));
        const costPerKg = itemWeight > 0 ? totalItemCost / itemWeight : 0;

        outputItems.push({
          output_name: it.output_name,
          actual_weight: itemWeight,
          yield_pct: Number(itemYieldPct.toFixed(2)),
          allocated_cost_per_kg: Number(costPerKg.toFixed(4)),
          total_allocated_cost: totalItemCost,
          relative_value_weight: it.relative_value_weight,
          is_by_product: Boolean(it.is_by_product)
        });
      });
    }

    // تسوية أي كسر بسيط لضمان مطابقة التكلفة الإجمالية بدقة 100%
    const currentSum = outputItems.reduce((acc, item) => acc + item.total_allocated_cost, 0);
    const diff = Number((total_net_cost - currentSum).toFixed(4));
    if (Math.abs(diff) > 0.0001 && outputItems.length > 0) {
      const largestItem = [...outputItems].sort((a, b) => b.total_allocated_cost - a.total_allocated_cost)[0];
      if (largestItem) {
        largestItem.total_allocated_cost = Number((largestItem.total_allocated_cost + diff).toFixed(4));
        if (largestItem.actual_weight > 0) {
          largestItem.allocated_cost_per_kg = Number((largestItem.total_allocated_cost / largestItem.actual_weight).toFixed(4));
        }
      }
    }

    const finalAllocatedTotal = outputItems.reduce((acc, item) => acc + item.total_allocated_cost, 0);

    return {
      total_output_weight: Number(total_output_weight.toFixed(3)),
      shrinkage_weight: Number(shrinkage_weight.toFixed(3)),
      shrinkage_pct: Number(shrinkage_pct.toFixed(2)),
      useful_yield_pct: Number(useful_yield_pct.toFixed(2)),
      total_allocated_cost: Number(finalAllocatedTotal.toFixed(2)),
      items: outputItems
    };
  }

  /**
   * جلب قوالب التشفية المحفوظة مع دعم السقوط الآلي
   */
  public async getTemplates(organizationId?: string): Promise<ButcheringTemplate[]> {
    try {
      let query = supabase
        .from('butchering_templates')
        .select(`
          *,
          items:butchering_template_items(*)
        `)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (organizationId) {
        query = query.or(`organization_id.eq.${organizationId},organization_id.is.null`);
      }

      const { data, error } = await query;
      if (error) {
        if (this.isTableMissingError(error)) {
          // جلب من التخزين المحلي
          return this.getLocalTemplates();
        }
        return this.getLocalTemplates();
      }

      if (!data || data.length === 0) {
        return this.getLocalTemplates();
      }

      return data as ButcheringTemplate[];
    } catch (err) {
      return this.getLocalTemplates();
    }
  }

  private getLocalTemplates(): ButcheringTemplate[] {
    try {
      const stored = secureStorage.getItem<ButcheringTemplate[]>(LOCAL_STORAGE_TEMPLATES_KEY);
      if (stored && Array.isArray(stored) && stored.length > 0) {
        return stored;
      }
    } catch (e) {
      console.warn('Error reading local templates:', e);
    }
    return DEFAULT_BUTCHERING_TEMPLATES;
  }

  /**
   * حفظ أو تحديث قالب تشفية
   */
  public async saveTemplate(template: ButcheringTemplate, organizationId?: string): Promise<ButcheringTemplate> {
    const templatePayload = {
      organization_id: organizationId || null,
      name: template.name.trim(),
      description: template.description || null,
      category: template.category || 'beef',
      source_product_id: template.source_product_id || null,
      default_expected_yield_pct: template.default_expected_yield_pct || 95.0,
      default_max_shrinkage_pct: template.default_max_shrinkage_pct || 5.0,
      cost_allocation_method: template.cost_allocation_method || 'relative_value',
      is_active: true,
      updated_at: new Date().toISOString()
    };

    let templateId = template.id || `local_tmpl_${Date.now()}`;

    try {
      if (template.id && !template.id.startsWith('local_')) {
        const { error } = await supabase
          .from('butchering_templates')
          .update(templatePayload)
          .eq('id', templateId);
        if (error && !this.isTableMissingError(error)) throw error;
      } else {
        const { data, error } = await supabase
          .from('butchering_templates')
          .insert(templatePayload)
          .select()
          .single();
        if (error && !this.isTableMissingError(error)) throw error;
        if (data) templateId = data.id;
      }

      // حفظ البنود إذا كان الجدول موجوداً
      if (template.items && template.items.length > 0 && !templateId.startsWith('local_')) {
        await supabase.from('butchering_template_items').delete().eq('template_id', templateId);

        const itemsToInsert = template.items.map((it, idx) => ({
          template_id: templateId,
          output_product_id: it.output_product_id || null,
          output_name: it.output_name.trim(),
          expected_yield_pct: Number(it.expected_yield_pct || 0),
          relative_value_weight: Number(it.relative_value_weight || 1.0),
          is_by_product: Boolean(it.is_by_product),
          standard_unit_price: Number(it.standard_unit_price || 0),
          notes: it.notes || null,
          sort_order: idx
        }));

        const { error: itemsError } = await supabase.from('butchering_template_items').insert(itemsToInsert);
        if (itemsError && !this.isTableMissingError(itemsError)) throw itemsError;
      }
    } catch (e) {
      console.warn('Database error while saving template, saving to local storage:', e);
    }

    // حفظ في التخزين المحلي دائماً لضمان عدم الضياع
    const savedTemplate: ButcheringTemplate = { ...template, id: templateId };
    try {
      const local = this.getLocalTemplates();
      const filtered = local.filter(t => t.id !== templateId && t.name !== savedTemplate.name);
      secureStorage.setItem(LOCAL_STORAGE_TEMPLATES_KEY, [savedTemplate, ...filtered]);
    } catch (e) {
      console.error('Failed to save template to secureStorage:', e);
    }

    return savedTemplate;
  }

  /**
   * جلب قائمة أوامر التشفية مع دعم السقوط الآلي
   */
  public async getOrders(organizationId?: string, limit = 50): Promise<ButcheringOrder[]> {
    try {
      let query = supabase
        .from('butchering_orders')
        .select(`
          *,
          items:butchering_order_items(*)
        `)
        .order('order_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit);

      if (organizationId) {
        query = query.eq('organization_id', organizationId);
      }

      const { data, error } = await query;
      if (error) {
        console.warn('Notice loading orders from database, using fallback:', error.message);
        return this.getLocalOrders();
      }

      // جلب أسماء الأصناف الخام لتجنب أخطاء PostgREST
      const productIds = Array.from(
        new Set((data || []).map((r: any) => r.source_product_id).filter(Boolean))
      );

      const productMap: Record<string, string> = {};
      if (productIds.length > 0) {
        try {
          const { data: prods } = await supabase
            .from('products')
            .select('id, name')
            .in('id', productIds);
          if (prods) {
            prods.forEach((p: any) => {
              productMap[p.id] = p.name;
            });
          }
        } catch (pe) {
          console.warn('Could not map product names:', pe);
        }
      }

      const dbOrders = (data || []).map((row: any) => ({
        ...row,
        source_product_name: productMap[row.source_product_id] || row.source_product_name || 'صنف ذبيحة خام'
      })) as ButcheringOrder[];

      // دمج الأوامر المحلية إن وجدت
      const localOrders = this.getLocalOrders();
      const combined = [...dbOrders];
      localOrders.forEach(loc => {
        if (!combined.some(o => o.order_number === loc.order_number)) {
          combined.push(loc);
        }
      });

      return combined;
    } catch (err) {
      return this.getLocalOrders();
    }
  }

  private getLocalOrders(): ButcheringOrder[] {
    try {
      const stored = secureStorage.getItem<ButcheringOrder[]>(LOCAL_STORAGE_ORDERS_KEY);
      if (stored && Array.isArray(stored)) {
        return stored;
      }
    } catch (e) {
      console.warn('Error reading local orders:', e);
    }
    return [];
  }

  /**
   * إنشاء وترحيل أمر تشفية جديد مع التأثير المخزني والمحاسبي
   */
  public async createAndPostOrder(params: {
    order: ButcheringOrder;
    items: ButcheringOrderItem[];
    organizationId: string;
    userId?: string;
    autoPostAccounting?: boolean;
    rawMaterialAccountId?: string;
    finishedGoodsAccountId?: string;
    laborPayableAccountId?: string;
  }): Promise<{
    success: boolean;
    orderId: string;
    journalEntryId?: string;
    journalError?: string;
    stockAdjusted?: boolean;
    deductedWeight?: number;
    addedItemsCount?: number;
    error?: string;
  }> {
    const {
      order,
      items,
      organizationId,
      userId,
      autoPostAccounting = true,
      rawMaterialAccountId,
      finishedGoodsAccountId,
      laborPayableAccountId
    } = params;

    try {
      const orderNumber = order.order_number || `BUT-${Date.now().toString().slice(-6)}`;
      let orderId = `local_ord_${Date.now()}`;
      let journalEntryId: string | undefined;
      let journalError: string | undefined;
      let stockAdjusted = false;
      let addedItemsCount = 0;

      // 1. محاولة إدخال رأس الأمر في جدول butchering_orders في Supabase
      try {
        const { data: createdOrder, error: orderErr } = await supabase
          .from('butchering_orders')
          .insert({
            organization_id: organizationId || null,
            order_number: orderNumber,
            template_id: (order.template_id && !order.template_id.startsWith('local_')) ? order.template_id : null,
            source_product_id: order.source_product_id,
            warehouse_id: order.warehouse_id || null,
            destination_warehouse_id: order.destination_warehouse_id || order.warehouse_id || null,
            order_date: order.order_date || new Date().toISOString().split('T')[0],
            input_weight: Number(order.input_weight),
            input_cost_per_kg: Number(order.input_cost_per_kg),
            total_input_cost: Number(order.total_input_cost),
            additional_labor_cost: Number(order.additional_labor_cost || 0),
            additional_overhead_cost: Number(order.additional_overhead_cost || 0),
            total_net_cost: Number(order.total_net_cost),
            total_output_weight: Number(order.total_output_weight),
            shrinkage_weight: Number(order.shrinkage_weight),
            shrinkage_pct: Number(order.shrinkage_pct),
            useful_yield_pct: Number(order.useful_yield_pct),
            cost_allocation_method: order.cost_allocation_method || 'relative_value',
            status: 'completed',
            butcher_name: order.butcher_name || null,
            notes: order.notes || null,
            created_by: userId || null
          })
          .select('id')
          .single();

        if (!orderErr && createdOrder) {
          orderId = createdOrder.id;

          // إدخال البنود
          const itemsToInsert = items.map(it => ({
            order_id: orderId,
            output_product_id: it.output_product_id || null,
            output_name: it.output_name,
            actual_weight: Number(it.actual_weight),
            yield_pct: Number(it.yield_pct || 0),
            relative_value_weight: Number(it.relative_value_weight || 1.0),
            allocated_cost_per_kg: Number(it.allocated_cost_per_kg),
            total_allocated_cost: Number(it.total_allocated_cost),
            is_by_product: Boolean(it.is_by_product),
            standard_expected_weight: Number(it.standard_expected_weight || 0),
            variance_weight: Number(it.variance_weight || 0),
            notes: it.notes || null
          }));

          await supabase.from('butchering_order_items').insert(itemsToInsert);
        }
      } catch (dbErr) {
        console.warn('Database butchering_orders insert notice (falling back to local storage):', dbErr);
      }

      // 2. حفظ في التخزين الآمن لضمان وجود السجل فوراً حتى بدون سوبابايز
      const fullOrderRecord: ButcheringOrder = {
        ...order,
        id: orderId,
        order_number: orderNumber,
        items: items.map(it => ({ ...it, order_id: orderId }))
      };

      try {
        const localOrders = this.getLocalOrders();
        secureStorage.setItem(LOCAL_STORAGE_ORDERS_KEY, [fullOrderRecord, ...localOrders]);
      } catch (e) {
        console.error('Error saving order to secureStorage:', e);
      }

      // 3. التأثير المخزني الفعلي (تحديث الأرصدة وإدراج تسويات المخزون الرسمية)
      const primaryWarehouseId = order.warehouse_id || order.destination_warehouse_id || null;
      const destinationWhId = order.destination_warehouse_id || order.warehouse_id || null;

      // أ) تسجيل حركة تسوية مخزنية رسمية (Stock Adjustment) ليظهر الأثر في كارت الصنف وتقارير المخزون
      try {
        const isSeparateWarehouses = Boolean(primaryWarehouseId && destinationWhId && primaryWarehouseId !== destinationWhId);

        if (isSeparateWarehouses) {
          // 1. إذن صرف خام من مستودع المصدر
          if (order.source_product_id && Number(order.input_weight) > 0) {
            const adjOutNumber = `ADJ-OUT-${orderNumber}`;
            const { data: docOut } = await supabase
              .from('stock_adjustments')
              .insert({
                warehouse_id: primaryWarehouseId,
                adjustment_date: order.order_date || new Date().toISOString().split('T')[0],
                reason: `صرف خامات لجلسة تشفية #${orderNumber} (${order.butcher_name || 'الشيف'})`,
                adjustment_number: adjOutNumber,
                status: 'posted',
                created_by: userId || null,
                organization_id: organizationId || null
              })
              .select('id')
              .single();

            if (docOut) {
              await supabase.from('stock_adjustment_items').insert([{
                stock_adjustment_id: docOut.id,
                product_id: order.source_product_id,
                quantity: -Math.abs(Number(order.input_weight)),
                type: 'out',
                organization_id: organizationId || null
              }]);
              stockAdjusted = true;
            }
          }

          // 2. إذن إضافة قطعيات مشفاة إلى مستودع المطبخ / المقصد
          const inItems = items.filter(it => it.output_product_id && Number(it.actual_weight) > 0);
          if (inItems.length > 0) {
            const adjInNumber = `ADJ-IN-${orderNumber}`;
            const { data: docIn } = await supabase
              .from('stock_adjustments')
              .insert({
                warehouse_id: destinationWhId,
                adjustment_date: order.order_date || new Date().toISOString().split('T')[0],
                reason: `توريد قطعيات ناتجة من تشفية #${orderNumber} (${order.butcher_name || 'الشيف'})`,
                adjustment_number: adjInNumber,
                status: 'posted',
                created_by: userId || null,
                organization_id: organizationId || null
              })
              .select('id')
              .single();

            if (docIn) {
              const adjInPayload = inItems.map(it => ({
                stock_adjustment_id: docIn.id,
                product_id: it.output_product_id,
                quantity: Math.abs(Number(it.actual_weight)),
                type: 'in',
                organization_id: organizationId || null
              }));
              await supabase.from('stock_adjustment_items').insert(adjInPayload);
              addedItemsCount = inItems.length;
              stockAdjusted = true;
            }
          }
        } else {
          // مستودع واحد للسحب والتوريد
          const adjNumber = `ADJ-${orderNumber}`;
          const { data: adjDoc, error: adjErr } = await supabase
            .from('stock_adjustments')
            .insert({
              warehouse_id: primaryWarehouseId,
              adjustment_date: order.order_date || new Date().toISOString().split('T')[0],
              reason: `جلسة تشفية وتفكيك #${orderNumber} (${order.butcher_name || 'الشيف المسؤول'})`,
              adjustment_number: adjNumber,
              status: 'posted',
              created_by: userId || null,
              organization_id: organizationId || null
            })
            .select('id')
            .single();

          if (!adjErr && adjDoc) {
            const adjItems: any[] = [];

            // بند صرف الخام (خروج - out)
            if (order.source_product_id && Number(order.input_weight) > 0) {
              adjItems.push({
                stock_adjustment_id: adjDoc.id,
                product_id: order.source_product_id,
                quantity: -Math.abs(Number(order.input_weight)),
                type: 'out',
                organization_id: organizationId || null
              });
            }

            // بنود إضافة القطعيات الناتجة (دخول + in)
            for (const it of items) {
              if (it.output_product_id && Number(it.actual_weight) > 0) {
                adjItems.push({
                  stock_adjustment_id: adjDoc.id,
                  product_id: it.output_product_id,
                  quantity: Math.abs(Number(it.actual_weight)),
                  type: 'in',
                  organization_id: organizationId || null
                });
                addedItemsCount++;
              }
            }

            if (adjItems.length > 0) {
              await supabase.from('stock_adjustment_items').insert(adjItems);
              stockAdjusted = true;
            }
          }
        }
      } catch (adjExc) {
        console.warn('Stock adjustment creation notice:', adjExc);
      }

      // ب) التحديث المباشر لأرصدة جدول products لضمان انعكاس الكميات فوراً
      try {
        // 1. خصم المادة الخام من المستودع ومن إجمالي الرصيد
        if (order.source_product_id && Number(order.input_weight) > 0) {
          const { data: rawProd } = await supabase
            .from('products')
            .select('id, stock, warehouse_stock')
            .eq('id', order.source_product_id)
            .single();

          if (rawProd) {
            const curStock = Number(rawProd.stock || 0);
            const inputWeightNum = Number(order.input_weight);
            const newStock = curStock - inputWeightNum;
            const whStock = { ...(rawProd.warehouse_stock || {}) };
            if (primaryWarehouseId) {
              const curWh = Number(whStock[primaryWarehouseId] || 0);
              whStock[primaryWarehouseId] = curWh - inputWeightNum;
            }

            await supabase
              .from('products')
              .update({
                stock: newStock,
                warehouse_stock: whStock,
                updated_at: new Date().toISOString()
              })
              .eq('id', order.source_product_id);

            stockAdjusted = true;
          }
        }

        // 2. إضافة كميات القطعيات الناتجة وتحديث تكلفة الكيلو
        for (const it of items) {
          if (it.output_product_id) {
            const { data: outProd } = await supabase
              .from('products')
              .select('id, stock, warehouse_stock')
              .eq('id', it.output_product_id)
              .single();

            const unitCost = Number(it.allocated_cost_per_kg || 0);
            const addedWeight = Number(it.actual_weight || 0);

            if (outProd) {
              const curStock = Number(outProd.stock || 0);
              const newStock = curStock + addedWeight;
              const whStock = { ...(outProd.warehouse_stock || {}) };
              if (destinationWhId) {
                const curWh = Number(whStock[destinationWhId] || 0);
                whStock[destinationWhId] = curWh + addedWeight;
              }

              await supabase
                .from('products')
                .update({
                  stock: newStock,
                  warehouse_stock: whStock,
                  cost: unitCost > 0 ? unitCost : undefined,
                  purchase_price: unitCost > 0 ? unitCost : undefined,
                  updated_at: new Date().toISOString()
                })
                .eq('id', it.output_product_id);
            } else if (unitCost > 0) {
              await supabase
                .from('products')
                .update({
                  cost: unitCost,
                  purchase_price: unitCost,
                  updated_at: new Date().toISOString()
                })
                .eq('id', it.output_product_id);
            }
          }
        }
      } catch (pUpdateErr) {
        console.warn('Direct product quantities update notice:', pUpdateErr);
      }

      // 4. إنشاء وترحيل قيد اليومية المحاسبي التلقائي (Balanced Journal Entry)
      if (autoPostAccounting) {
        if (!rawMaterialAccountId || !finishedGoodsAccountId) {
          journalError = 'لم يتم إنشاء القيد المحاسبي لعدم تحديد حسابات المخزون (الخام أو التام).';
        } else {
          const totalNetCost = Number(order.total_net_cost);
          const totalInputCost = Number(order.total_input_cost);
          const additionalLabor = Number(order.additional_labor_cost || 0) + Number(order.additional_overhead_cost || 0);

          const journalLines: Array<{
            accountId: string;
            debit: number;
            credit: number;
            description: string;
          }> = [
            {
              accountId: finishedGoodsAccountId,
              debit: totalNetCost,
              credit: 0,
              description: `إثبات إنتاج لحوم مشفاة ومجهزة - أمر تشفية رقم ${orderNumber}`
            },
            {
              accountId: rawMaterialAccountId,
              debit: 0,
              credit: totalInputCost,
              description: `صرف ذبائح ولحوم خام للتشفية - أمر تشفية رقم ${orderNumber}`
            }
          ];

          if (additionalLabor > 0) {
            if (laborPayableAccountId) {
              journalLines.push({
                accountId: laborPayableAccountId,
                debit: 0,
                credit: additionalLabor,
                description: `أجور ومصاريف جزارة وتشفية - أمر رقم ${orderNumber}`
              });
            } else {
              // ضمان توازن القيد بدمج مصاريف التشغيل مع المادة الخام في الطرف الدائن إذا لم يُحدد حساب أجور
              journalLines[1].credit = totalNetCost;
            }
          }

          // التحقق الصارم من التوازن قبل الترحيل
          const sumDebit = journalLines.reduce((acc, l) => acc + Number(l.debit || 0), 0);
          const sumCredit = journalLines.reduce((acc, l) => acc + Number(l.credit || 0), 0);
          const diff = Math.abs(sumDebit - sumCredit);

          if (diff > 0.01) {
            journalError = `تعذر ترحيل القيد: القيد غير متوازن (المدين: ${sumDebit.toFixed(2)}، الدائن: ${sumCredit.toFixed(2)}).`;
          } else {
            try {
              // محاولة 1: استدعاء add_journal_entry RPC المعتمدة في النظام
              const rpcLines = journalLines.map(l => ({
                account_id: l.accountId,
                accountId: l.accountId,
                debit: l.debit,
                credit: l.credit,
                description: l.description
              }));

              const { data: rpcId, error: rpcErr } = await supabase.rpc('add_journal_entry', {
                date: order.order_date,
                reference: `JE-${orderNumber}`,
                description: `قيد تشفية وتفكيك ذبائح - أمر تشفية #${orderNumber} (${order.butcher_name || 'الشيف المسؤول'})`,
                status: 'posted',
                lines: rpcLines,
                p_org_id: organizationId || null
              });

              if (!rpcErr && rpcId) {
                journalEntryId = rpcId;
              } else {
                // محاولة 2: استخدام Central AccountingEngine
                const journalResult = await AccountingEngine.createJournalEntry({
                  organizationId: organizationId || '',
                  transactionDate: order.order_date,
                  reference: `JE-${orderNumber}`,
                  description: `قيد تشفية وتفكيك ذبائح - أمر تشفية #${orderNumber} (${order.butcher_name || 'الشيف المسؤول'})`,
                  lines: journalLines,
                  relatedDocumentId: orderId.startsWith('local_') ? null : orderId,
                  relatedDocumentType: 'butchering_order',
                  status: 'posted'
                });

                if (journalResult.success && journalResult.journalEntryId) {
                  journalEntryId = journalResult.journalEntryId;
                } else if (journalResult.error) {
                  journalError = journalResult.error;
                }
              }

              if (journalEntryId && !orderId.startsWith('local_')) {
                await supabase
                  .from('butchering_orders')
                  .update({ journal_entry_id: journalEntryId })
                  .eq('id', orderId);
              }
            } catch (jErr: any) {
              console.warn('Journal entry creation notice:', jErr);
              journalError = jErr.message || 'خطأ أثناء ترحيل قيد اليومية';
            }
          }
        }
      }

      return {
        success: true,
        orderId,
        journalEntryId,
        journalError,
        stockAdjusted,
        deductedWeight: Number(order.input_weight),
        addedItemsCount
      };
    } catch (err: any) {
      console.error('Error creating butchering order:', err);
      return {
        success: false,
        orderId: '',
        error: err.message || 'حدث خطأ أثناء ترحيل أمر التشفية'
      };
    }
  }

  /**
   * حذف أمر تشفية
   */
  public async deleteOrder(orderId: string): Promise<void> {
    try {
      if (!orderId.startsWith('local_')) {
        await supabase.from('butchering_orders').delete().eq('id', orderId);
      }
    } catch (e) {
      console.warn('Database delete notice:', e);
    }

    try {
      const local = this.getLocalOrders().filter(o => o.id !== orderId);
      secureStorage.setItem(LOCAL_STORAGE_ORDERS_KEY, local);
    } catch (e) {
      console.error('Error deleting from secureStorage:', e);
    }
  }
}

export const butcheringYieldService = new ButcheringYieldService();
