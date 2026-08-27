import { describe, it, expect } from 'vitest';
import { butcheringYieldService } from '../services/butcheringYieldService';

describe('Butchering Yield & Cost Allocation Engine (محرك تشفية وتفكيك اللحوم والدواجن)', () => {
  it('should accurately calculate poultry yield, shrinkage, and relative value cost allocation', () => {
    const inputWeight = 50; // 50 كجم فراخ خام
    const totalCost = 5000;  // 100 ج/كجم

    const result = butcheringYieldService.calculateCostAllocation({
      total_net_cost: totalCost,
      input_weight: inputWeight,
      method: 'relative_value',
      items: [
        { output_name: 'صدور دجاج مخلية', actual_weight: 17.5, relative_value_weight: 1.75, is_by_product: false },
        { output_name: 'أوراك دجاج', actual_weight: 15.0, relative_value_weight: 1.25, is_by_product: false },
        { output_name: 'أجنحة دجاج', actual_weight: 5.0, relative_value_weight: 0.85, is_by_product: false },
        { output_name: 'هياكل وعظام', actual_weight: 8.0, relative_value_weight: 0.2, is_by_product: true },
        { output_name: 'كبد وقوانص', actual_weight: 2.0, relative_value_weight: 0.9, is_by_product: false }
      ]
    });

    // 1. Total output weight = 17.5 + 15 + 5 + 8 + 2 = 47.5 kg
    expect(result.total_output_weight).toBe(47.5);

    // 2. Shrinkage = 50 - 47.5 = 2.5 kg (5%)
    expect(result.shrinkage_weight).toBe(2.5);
    expect(result.shrinkage_pct).toBe(5);
    expect(result.useful_yield_pct).toBe(95);

    // 3. Total allocated cost matches 100% (5000 LE)
    expect(Math.abs(result.total_allocated_cost - totalCost)).toBeLessThanOrEqual(0.01);

    // 4. Prime cuts have higher allocated cost per kg than by-products
    const breast = result.items.find(i => i.output_name === 'صدور دجاج مخلية')!;
    const bones = result.items.find(i => i.output_name === 'هياكل وعظام')!;

    expect(breast.allocated_cost_per_kg).toBeGreaterThan(bones.allocated_cost_per_kg);
    expect(breast.allocated_cost_per_kg).toBeGreaterThan(100); // Prime cut absorbs shrinkage cost
    expect(bones.allocated_cost_per_kg).toBeLessThan(100); // By-product has lower relative weight
  });

  it('should handle by_product_deduction method correctly', () => {
    const inputWeight = 100;
    const totalCost = 10000;

    const result = butcheringYieldService.calculateCostAllocation({
      total_net_cost: totalCost,
      input_weight: inputWeight,
      method: 'by_product_deduction',
      items: [
        { output_name: 'لحم صافي', actual_weight: 80, relative_value_weight: 1.0, is_by_product: false },
        { output_name: 'عظم ودهن', actual_weight: 15, relative_value_weight: 0.1, is_by_product: true, standard_unit_price: 10 }
      ]
    });

    expect(result.total_output_weight).toBe(95);
    expect(result.shrinkage_weight).toBe(5);
    expect(Math.abs(result.total_allocated_cost - totalCost)).toBeLessThanOrEqual(0.01);

    const byProduct = result.items.find(i => i.is_by_product)!;
    expect(byProduct.total_allocated_cost).toBe(15 * 10); // 150 LE
  });

  it('should handle zero outputs gracefully without crashing', () => {
    const result = butcheringYieldService.calculateCostAllocation({
      total_net_cost: 1000,
      input_weight: 10,
      method: 'relative_value',
      items: []
    });

    expect(result.total_output_weight).toBe(0);
    expect(result.total_allocated_cost).toBe(0);
  });
});
