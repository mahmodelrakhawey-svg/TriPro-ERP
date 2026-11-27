import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DailyBatchProduction from './DailyBatchProduction';
import {
  calculateBatchMaterialRequirements,
  convertUomQuantity,
  deleteShiftTemplate,
  filterManufacturableProducts,
  loadShiftTemplates,
  saveShiftTemplate,
} from '../utils/dailyBatchUtils';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';

vi.mock('../../../context/AccountingContext', () => ({
  useAccounting: vi.fn(),
}));

vi.mock('../../../context/ToastContext', () => ({
  useToast: vi.fn(),
}));

vi.mock('../../../services/tenantContext', () => ({
  getActiveOrgIdSync: vi.fn(() => 'org-lenza-test'),
  resolveActiveOrgId: vi.fn(async () => 'org-lenza-test'),
}));

vi.mock('../../../services/queryClient', () => ({
  invalidateProducts: vi.fn(),
}));

const mockProducts = [
  {
    id: 'prod-torte-1',
    name: 'تورتة 20*20 هاف',
    sku: 'TRT-001',
    product_type: 'MANUFACTURED',
    item_type: 'MANUFACTURED',
    mfg_type: 'standard',
    category_id: 'cat-torte',
    unit: 'قطعة',
    cost: 120,
    stock: 5,
  },
  {
    id: 'prod-torte-2',
    name: 'تورتة شوكولاتة مدورة',
    sku: 'TRT-002',
    product_type: 'MANUFACTURED',
    item_type: 'MANUFACTURED',
    mfg_type: 'standard',
    category_id: 'cat-torte',
    unit: 'قطعة',
    cost: 150,
    stock: 2,
  },
  {
    id: 'prod-gateau-1',
    name: 'جاتوه فانيليا دستة',
    sku: 'GAT-001',
    product_type: 'MANUFACTURED',
    item_type: 'MANUFACTURED',
    mfg_type: 'standard',
    category_id: 'cat-gateau',
    unit: 'دستة',
    cost: 90,
    stock: 0,
  },
  {
    id: 'raw-cream',
    name: 'كريمة تجليس ابيض',
    sku: 'RAW-001',
    product_type: 'RAW_MATERIAL',
    item_type: 'STOCK',
    mfg_type: 'raw',
    category_id: 'cat-raw',
    unit: 'كجم',
    base_uom_id: 'uom-kg',
    cost: 100,
    weighted_average_cost: 100,
    stock: 3, // Less than 10*0.2 + 10*0.15 = 3.5 -> shortage 0.5
  },
  {
    id: 'raw-choc',
    name: 'جناش شوكولاتة',
    sku: 'RAW-002',
    product_type: 'RAW_MATERIAL',
    item_type: 'STOCK',
    mfg_type: 'raw',
    category_id: 'cat-raw',
    unit: 'كجم',
    base_uom_id: 'uom-kg',
    cost: 200,
    weighted_average_cost: 200,
    stock: 10,
  },
];

const mockCategories = [
  { id: 'cat-torte', name: 'التورتات' },
  { id: 'cat-gateau', name: 'الجاتوهات' },
];

const mockWarehouses = [
  { id: 'wh-1', name: 'مخزن المصنع الرئيسي', is_default: true },
];

const mockUoms = [
  { id: 'uom-kg', name: 'كجم', ratio: 1, uom_type: 'reference' },
  { id: 'uom-g', name: 'جرام', ratio: 1000, uom_type: 'smaller' },
];

const mockRoutings = [
  { id: 'rt-1', product_id: 'prod-torte-1', name: 'مسار تورتة 1', is_default: true, deleted_at: null },
  { id: 'rt-2', product_id: 'prod-torte-2', name: 'مسار تورتة 2', is_default: true, deleted_at: null },
];

const mockRoutingSteps = [
  { id: 'st-1', routing_id: 'rt-1', step_order: 1, operation_name: 'التجهيز والتزيين' },
  { id: 'st-2', routing_id: 'rt-2', step_order: 1, operation_name: 'التجهيز والتزيين' },
];

const mockStepMaterials = [
  { step_id: 'st-1', raw_material_id: 'raw-cream', quantity_required: 0.2, uom_id: 'uom-kg' },
  { step_id: 'st-2', raw_material_id: 'raw-cream', quantity_required: 150, uom_id: 'uom-g' }, // 0.15 kg
  { step_id: 'st-2', raw_material_id: 'raw-choc', quantity_required: 0.1, uom_id: 'uom-kg' },
];

const mockBomLines = [
  // Should not double-count prod-torte-1 since it has routing steps
  { product_id: 'prod-torte-1', raw_material_id: 'raw-cream', quantity_required: 0.2, uom_id: 'uom-kg' },
  // BOM-only item (no routing)
  { product_id: 'prod-gateau-1', raw_material_id: 'raw-cream', quantity_required: 0.3, uom_id: 'uom-kg' },
];

let insertedOrders: any[] = [];
let rpcCalls: Array<{ fn: string; params: any }> = [];

function createChainableResult(data: any) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    is: vi.fn(() => chain),
    ilike: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    range: vi.fn(async () => ({ data, error: null })),
    then: vi.fn((cb: any) => Promise.resolve({ data, error: null }).then(cb)),
  };
  return chain;
}

vi.mock('../../../supabaseClient', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'uoms') return createChainableResult(mockUoms);
      if (table === 'mfg_routings') return createChainableResult(mockRoutings);
      if (table === 'mfg_routing_steps') return createChainableResult(mockRoutingSteps);
      if (table === 'mfg_step_materials') return createChainableResult(mockStepMaterials);
      if (table === 'bill_of_materials') return createChainableResult(mockBomLines);
      if (table === 'mfg_production_orders') {
        return {
          select: vi.fn(() => createChainableResult([])),
          insert: vi.fn(async (payload: any) => {
            insertedOrders.push(payload);
            return { data: payload, error: null };
          }),
          delete: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
        };
      }
      if (table === 'mfg_order_progress') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({
                data: [{ id: 'prog-1', step_id: 'st-1', status: 'pending' }],
                error: null,
              })),
            })),
          })),
          delete: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
        };
      }
      if (table === 'mfg_material_requests') {
        return {
          insert: vi.fn(async () => ({ error: null })),
          delete: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
        };
      }
      if (table === 'mfg_material_request_items') {
        return {
          insert: vi.fn(async () => ({ error: null })),
        };
      }
      return createChainableResult([]);
    }),
    rpc: vi.fn(async (fn: string, params: any) => {
      rpcCalls.push({ fn, params });
      return { data: null, error: null };
    }),
  },
}));

describe('🎂 DailyBatchProduction Utilities & Screen', () => {
  const mockShowToast = vi.fn();
  const mockRefreshProducts = vi.fn(async () => {});

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    insertedOrders = [];
    rpcCalls = [];

    (useAccounting as any).mockReturnValue({
      products: mockProducts,
      warehouses: mockWarehouses,
      categories: mockCategories,
      organization: { id: 'org-lenza-test', name: 'حلواني لينزا' },
      currentUser: { id: 'usr-1', organization_id: 'org-lenza-test' },
      currentSelectedOrgId: 'org-lenza-test',
      refreshProducts: mockRefreshProducts,
    });

    (useToast as any).mockReturnValue({
      showToast: mockShowToast,
    });
  });

  describe('Pure Calculation & Template Helpers', () => {
    it('يستبعد الخامات ويبقي فقط الأصناف المصنعة والوسيطة', () => {
      const filtered = filterManufacturableProducts(mockProducts as any);
      expect(filtered.map((p) => p.id)).toEqual(['prod-torte-1', 'prod-torte-2', 'prod-gateau-1']);
    });

    it('يحول وحدات القياس بشكل مطابق لدالة uom_convert', () => {
      const map = new Map(mockUoms.map((u) => [u.id, u as any]));
      expect(convertUomQuantity(250, 'uom-g', 'uom-kg', map)).toBe(0.25);
      expect(convertUomQuantity(2, 'uom-kg', 'uom-kg', map)).toBe(2);
    });

    it('يجمع احتياجات الخامات من عدة أصناف ويحسب العجز دون تكرار بين routing و BOM', () => {
      const result = calculateBatchMaterialRequirements({
        rows: [
          { rowId: '1', productId: 'prod-torte-1', quantity: 10, warehouseId: 'wh-1', notes: '' }, // 10 * 0.2 = 2 kg cream
          { rowId: '2', productId: 'prod-torte-2', quantity: 10, warehouseId: 'wh-1', notes: '' }, // 10 * 0.15 = 1.5 kg cream + 1 kg choc
        ],
        products: mockProducts as any,
        uoms: mockUoms as any,
        routings: mockRoutings,
        routingSteps: mockRoutingSteps,
        stepMaterials: mockStepMaterials,
        bomLines: mockBomLines,
      });

      expect(result.totalUnits).toBe(20);
      const creamReq = result.materialRequirements.find((m) => m.rawMaterialId === 'raw-cream');
      expect(creamReq?.requiredQty).toBe(3.5);
      expect(creamReq?.availableStock).toBe(3);
      expect(creamReq?.shortageQty).toBe(0.5);

      const chocReq = result.materialRequirements.find((m) => m.rawMaterialId === 'raw-choc');
      expect(chocReq?.requiredQty).toBe(1);
      expect(chocReq?.shortageQty).toBe(0);
      expect(result.shortages).toHaveLength(1);
    });

    it('يدعم حفظ وتحميل وحذف قوالب الورديات اليومية', () => {
      const saved = saveShiftTemplate('org-1', 'وردية الصباح - التورتات', [
        { productId: 'prod-torte-1', quantity: 25 },
        { productId: 'prod-torte-2', quantity: 15 },
      ]);
      expect(saved).toHaveLength(1);
      expect(loadShiftTemplates('org-1')[0].name).toBe('وردية الصباح - التورتات');

      const afterDelete = deleteShiftTemplate('org-1', saved[0].id);
      expect(afterDelete).toHaveLength(0);
    });
  });

  describe('DailyBatchProduction Component Flow', () => {
    it('يحمل تصنيف التورتات كاملاً ويعرض فحص توفر الخامات وينفذ دفعة متعددة الأصناف مرة واحدة', async () => {
      render(<DailyBatchProduction />);

      await waitFor(() => {
        expect(screen.getByText(/أمر الإنتاج اليومي المجمّع/)).toBeDefined();
      });

      // Select "التورتات" category and load
      const categorySelect = screen.getByDisplayValue('-- اختر التصنيف (تورتات / جاتوه / شرقي) --');
      fireEvent.change(categorySelect, { target: { value: 'cat-torte' } });
      fireEvent.click(screen.getByRole('button', { name: /^تحميل$/ }));

      await waitFor(() => {
        expect(screen.getByText('تورتة 20*20 هاف')).toBeDefined();
        expect(screen.getByText('تورتة شوكولاتة مدورة')).toBeDefined();
      });

      // Fill quantities: 10 for each torte
      const qty1 = screen.getByLabelText('كمية تورتة 20*20 هاف');
      const qty2 = screen.getByLabelText('كمية تورتة شوكولاتة مدورة');
      fireEvent.change(qty1, { target: { value: '10' } });
      fireEvent.change(qty2, { target: { value: '10' } });

      // Pre-flight shortage should appear (3.5 required vs 3 available => 0.5 shortage)
      await waitFor(() => {
        expect(screen.getByText(/عجز 0\.5 كجم/)).toBeDefined();
      });

      // Execute batch and verify double-click guard
      const executeBtn = screen.getByRole('button', { name: /اعتماد وتصنيع الكل \(2\)/ });
      fireEvent.click(executeBtn);
      fireEvent.click(executeBtn);

      await waitFor(() => {
        expect(insertedOrders).toHaveLength(2);
      });

      // Both orders share the same unified DAILY-BATCH-* reference
      expect(insertedOrders[0].batch_number).toMatch(/^DAILY-BATCH-/);
      expect(insertedOrders[0].batch_number).toBe(insertedOrders[1].batch_number);

      // Final stock recalculation called once at the end of the batch
      const recalcCalls = rpcCalls.filter((c) => c.fn === 'recalculate_stock_rpc');
      expect(recalcCalls).toHaveLength(1);
      expect(mockRefreshProducts).toHaveBeenCalledTimes(1);
    });

    it('يتيح اختيار صنف له مسار ومراحل تصنيع (BOM/Routing) من القائمة المخصصة', async () => {
      render(<DailyBatchProduction />);

      await waitFor(() => {
        expect(screen.getByLabelText('مسار ومراحل التصنيع (BOM/Routing)')).toBeDefined();
      });

      const routingSelect = screen.getByLabelText('مسار ومراحل التصنيع (BOM/Routing)');
      await waitFor(() => {
        expect(screen.getByText(/تورتة 20\*20 هاف \(مسار: 1 مرحلة\)/)).toBeDefined();
      });

      fireEvent.change(routingSelect, { target: { value: 'prod-torte-1' } });

      await waitFor(() => {
        expect(screen.getByText('تورتة 20*20 هاف')).toBeDefined();
      });
    });
  });
});
