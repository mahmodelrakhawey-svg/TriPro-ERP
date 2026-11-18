import { describe, it, expect, beforeEach } from 'vitest';
import { 
  getInventoryCountDraft, 
  clearInventoryCountDraft, 
  createCountItem,
  InventoryCountDraftData,
  CountTableItem 
} from './InventoryCountForm';
import { getProductWarehouseStock } from '../../components/ProductSearchSelect';
import { secureStorage } from '../../utils/securityMiddleware';

describe('InventoryCountForm Draft & Restoration Tests', () => {
  const DRAFT_KEY = 'tripro_inventory_count_draft_v1';
  const LEGACY_KEY = 'tripro_inventory_count_draft';

  beforeEach(() => {
    clearInventoryCountDraft();
  });

  it('should return null when no draft exists', () => {
    expect(getInventoryCountDraft()).toBeNull();
  });

  it('should save and restore an inventory count draft accurately', () => {
    const mockItems: CountTableItem[] = [
      {
        productId: 'prod-123',
        productName: 'صنف اختبار',
        productDescription: 'وصف صنف',
        sku: 'SKU-001',
        barcode: '6221234567890',
        barcode2: '',
        categoryId: 'cat-1',
        categoryName: 'مواد غذائية',
        unit: 'قطعة',
        purchasePrice: 25.5,
        systemQty: 50,
        actualQty: 48,
        difference: -2,
        notes: 'عجز طفيف',
        isCounted: true,
        searchableText: 'صنف اختبار SKU-001 6221234567890'
      }
    ];

    const draftData: InventoryCountDraftData = {
      warehouseId: 'wh-main',
      date: '2026-10-18',
      items: mockItems,
      includeServices: false,
      savedAt: '10:30:00 ص',
      savedAtTimestamp: 1729236600000
    };

    secureStorage.setItem(DRAFT_KEY, draftData);

    const restored = getInventoryCountDraft();
    expect(restored).not.toBeNull();
    expect(restored?.warehouseId).toBe('wh-main');
    expect(restored?.date).toBe('2026-10-18');
    expect(restored?.items.length).toBe(1);
    expect(restored?.items[0].actualQty).toBe(48);
    expect(restored?.items[0].difference).toBe(-2);
    expect(restored?.items[0].productName).toBe('صنف اختبار');
    expect(restored?.savedAt).toBe('10:30:00 ص');
  });

  it('should clear the draft properly on clearInventoryCountDraft()', () => {
    const draftData: InventoryCountDraftData = {
      warehouseId: 'wh-2',
      date: '2026-10-18',
      items: []
    };
    secureStorage.setItem(DRAFT_KEY, draftData);
    expect(getInventoryCountDraft()).not.toBeNull();

    clearInventoryCountDraft();
    expect(getInventoryCountDraft()).toBeNull();
  });

  it('should support legacy draft key fallback if new key is absent', () => {
    const legacyDraft: InventoryCountDraftData = {
      warehouseId: 'wh-legacy',
      date: '2026-10-17',
      items: []
    };
    secureStorage.setItem(LEGACY_KEY, legacyDraft);

    const restored = getInventoryCountDraft();
    expect(restored).not.toBeNull();
    expect(restored?.warehouseId).toBe('wh-legacy');
  });

  it('should safely return null for corrupted storage data without throwing', () => {
    localStorage.setItem(DRAFT_KEY, 'invalid-json{{{');
    expect(() => getInventoryCountDraft()).not.toThrow();
    expect(getInventoryCountDraft()).toBeNull();
  });

  it('🛡️ يجب أن يكون الرصيد الدفتري صفراً للمستودع المختار إذا كان الصنف غير موجود به حتى لو كان رصيد الشركة الكلي 21', () => {
    // صنف "أرز" لديه رصيد كلي 21 في مخزن رئيسي، لكنه غير موجود في "مخزن الدور الثالث"
    const productRice = {
      id: 'prod-rice-01',
      name: 'أرز فاخر',
      stock: 21, // إجمالي رصيد الشركة عبر جميع المخازن
      warehouse_stock: {
        'wh-main': 21
        // 'wh-3rd-floor' غير موجود برصيد
      },
      sku: 'RICE-01',
      barcode: '6221111222',
      purchase_price: 30,
      unit: 'كيلو'
    };

    // 1. فحص دالة اختيار الصنف (Dropdown)
    const dropdownQty = getProductWarehouseStock(productRice, 'wh-3rd-floor');
    expect(dropdownQty).toBe(0);

    // 2. فحص بناء الصنف في جدول كشف الجرد للمستودع المحدد
    const countItem = createCountItem(productRice, 'wh-3rd-floor');
    expect(countItem.systemQty).toBe(0); // يجب أن يكون 0 وليس 21!
    expect(countItem.actualQty).toBe(0); // والكمية الفعلية الافتراضية 0
    expect(countItem.difference).toBe(0); // والفرق صفر

    // 3. مطابقة تامة بين القائمة المنسدلة وشاشة الجرد
    expect(countItem.systemQty).toBe(dropdownQty);
  });

  it('🛡️ يجب أن يظهر الرصيد الدفتري بدقة إذا كان الصنف مسجلاً بالمستودع', () => {
    const productRice = {
      id: 'prod-rice-01',
      name: 'أرز فاخر',
      stock: 21,
      warehouse_stock: {
        'wh-main': 16,
        'wh-3rd-floor': 5
      },
      sku: 'RICE-01',
      barcode: '6221111222',
      purchase_price: 30,
      unit: 'كيلو'
    };

    const countItem = createCountItem(productRice, 'wh-3rd-floor');
    expect(countItem.systemQty).toBe(5);
    expect(countItem.actualQty).toBe(5);
    expect(countItem.difference).toBe(0);
  });
});
