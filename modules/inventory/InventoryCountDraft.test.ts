import { describe, it, expect, beforeEach } from 'vitest';
import { 
  getInventoryCountDraft, 
  clearInventoryCountDraft, 
  InventoryCountDraftData,
  CountTableItem 
} from './InventoryCountForm';
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
});
