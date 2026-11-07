import { describe, it, expect, beforeEach, vi } from 'vitest';
import { itemAvailabilityGuard } from '../../services/itemAvailabilityGuard';
import { secureStorage } from '../../utils/securityMiddleware';

// Mock Supabase
vi.mock('../../supabaseClient', () => ({
  supabase: {
    from: () => ({
      update: () => ({
        eq: () => Promise.resolve({ error: null })
      })
    })
  }
}));

describe('🍳 ItemAvailabilityGuard (حساب رصيد الوجبات الجاهزة والإيقاف التلقائي واليدوي 86)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('يجب حساب رصيد الصنف المباشر بدقة إذا لم تكن له وصفة خامات (BOM)', () => {
    const productsMap = {
      'coke-can': {
        name: 'كانز كولا 330 مل',
        stock: 24
      }
    };

    const result = itemAvailabilityGuard.calculateMaxPortions('coke-can', [], productsMap);

    expect(result.isAvailable).toBe(true);
    expect(result.is86).toBe(false);
    expect(result.maxPortionsAvailable).toBe(24);
  });

  it('يجب إيقاف الصنف المباشر (86) إذا كان رصيد المستودع صفر أو سالب', () => {
    const productsMap = {
      'coke-zero': {
        name: 'كولا زيرو',
        stock: 0
      }
    };

    const result = itemAvailabilityGuard.calculateMaxPortions('coke-zero', [], productsMap);

    expect(result.isAvailable).toBe(false);
    expect(result.is86).toBe(true);
    expect(result.maxPortionsAvailable).toBe(0);
  });

  it('يجب مراعاة رصيد المستودع المحدد (Warehouse Specific Stock) عند تمرير warehouseId', () => {
    const productsMap = {
      'prod-water': {
        name: 'مياه معدنية',
        stock: 100, // رصيد عام لجميع الفروع
        warehouse_stock: {
          'wh-branch-1': 5,
          'wh-branch-2': 0
        }
      }
    };

    const branch1Result = itemAvailabilityGuard.calculateMaxPortions('prod-water', [], productsMap, 'wh-branch-1');
    expect(branch1Result.isAvailable).toBe(true);
    expect(branch1Result.maxPortionsAvailable).toBe(5);

    const branch2Result = itemAvailabilityGuard.calculateMaxPortions('prod-water', [], productsMap, 'wh-branch-2');
    expect(branch2Result.isAvailable).toBe(false);
    expect(branch2Result.is86).toBe(true);
    expect(branch2Result.maxPortionsAvailable).toBe(0);
  });

  it('يجب حساب الأطباق المتبقية بناءً على المكون الحرج الأقل رصيداً في الوصفة (Bottleneck Ingredient)', () => {
    // وجبة برجر دبل تحتاج: 2 شريحة لحم + 1 خبز برجر + 1 جبنة شيدر
    const bomIngredients = [
      { raw_material_id: 'raw-patty', raw_material_name: 'شريحة لحم برجر', quantity_required: 2 },
      { raw_material_id: 'raw-bun', raw_material_name: 'خبز برجر بالسمسم', quantity_required: 1 },
      { raw_material_id: 'raw-cheese', raw_material_name: 'جبنة شيدر شرائح', quantity_required: 1 }
    ];

    const productsMap = {
      'burger-double': { name: 'برجر دبل بيف' },
      'raw-patty': { name: 'شريحة لحم برجر', stock: 15 }, // يكفي لـ 7 وجبات (15 / 2 = 7)
      'raw-bun': { name: 'خبز برجر بالسمسم', stock: 20 },  // يكفي لـ 20 وجبة
      'raw-cheese': { name: 'جبنة شيدر شرائح', stock: 4 }  // المكون الحرج! يكفي فقط لـ 4 وجبات
    };

    const result = itemAvailabilityGuard.calculateMaxPortions('burger-double', bomIngredients, productsMap);

    expect(result.isAvailable).toBe(true);
    expect(result.is86).toBe(false);
    expect(result.maxPortionsAvailable).toBe(4);
    expect(result.criticalRawMaterialName).toBe('جبنة شيدر شرائح');
    expect(result.criticalRawMaterialStock).toBe(4);
  });

  it('يجب إيقاف الوجبة فوراً (is86 = true) إذا نفد أحد مكونات الوصفة الأساسية تماماً', () => {
    const bomIngredients = [
      { raw_material_id: 'raw-chicken', raw_material_name: 'دجاج متبل', quantity_required: 0.25 },
      { raw_material_id: 'raw-oil', raw_material_name: 'زيت قلي', quantity_required: 0.05 }
    ];

    const productsMap = {
      'meal-chicken': { name: 'وجبة دجاج مقلي' },
      'raw-chicken': { name: 'دجاج متبل', stock: 10 },
      'raw-oil': { name: 'زيت قلي', stock: 0 } // نفد الزيت
    };

    const result = itemAvailabilityGuard.calculateMaxPortions('meal-chicken', bomIngredients, productsMap);

    expect(result.isAvailable).toBe(false);
    expect(result.is86).toBe(true);
    expect(result.maxPortionsAvailable).toBe(0);
    expect(result.criticalRawMaterialName).toBe('زيت قلي');
  });

  it('يجب أن يعطي الإيقاف اليدوي (Manual 86) أولوية مطلقة حتى لو كانت الخامات متوفرة', () => {
    const productsMap = {
      'pizza-special': { name: 'بيتزا سوبر سوبريم', stock: 100 }
    };

    // تفعيل الإيقاف اليدوي للصنف
    itemAvailabilityGuard.setManual86('pizza-special', true);

    const result = itemAvailabilityGuard.calculateMaxPortions('pizza-special', [], productsMap);

    expect(result.isAvailable).toBe(false);
    expect(result.is86).toBe(true);
    expect(result.maxPortionsAvailable).toBe(0);

    // إلغاء الإيقاف اليدوي وإعادة تفعيله
    itemAvailabilityGuard.setManual86('pizza-special', false);
    const restoredResult = itemAvailabilityGuard.calculateMaxPortions('pizza-special', [], productsMap);

    expect(restoredResult.isAvailable).toBe(true);
    expect(restoredResult.is86).toBe(false);
    expect(restoredResult.maxPortionsAvailable).toBe(100);
  });
});
