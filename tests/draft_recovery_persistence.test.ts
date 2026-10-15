import { describe, it, expect, beforeEach, vi } from 'vitest';
import { secureStorage } from '../utils/securityMiddleware';

export const STOCK_TRANSFER_DRAFT_KEY = 'tripro_stock_transfer_draft_v2';
export const LEGACY_STOCK_TRANSFER_DRAFT_KEY = 'tripro_stock_transfer_draft';

export const SALES_INVOICE_DRAFT_KEY = 'tripro_sales_invoice_draft_v2';
export const LEGACY_SALES_INVOICE_DRAFT_KEY = 'tripro_sales_invoice_draft';

export interface StockTransferDraftData {
  formData: {
    date?: string;
    fromWarehouseId?: string;
    toWarehouseId?: string;
    notes?: string;
  };
  items: Array<{
    productId: string;
    productName: string;
    sku?: string;
    baseUnit: string;
    baseQuantity: number;
    selectedUnit: string;
    enteredQty: number;
    conversionRatio: number;
    packagingNote?: string;
    uomId?: string;
    quantity: number;
  }>;
}

export interface SalesInvoiceDraftData {
  formData: {
    customerId?: string;
    invoiceNumber?: string;
    warehouseId?: string;
    salespersonId?: string;
    costCenterId?: string;
    date?: string;
    dueDate?: string;
    notes?: string;
    status?: string;
    paidAmount?: number;
    treasuryId?: string;
    discountType?: 'percentage' | 'fixed';
    discountValue?: number;
    currency?: string;
    exchangeRate?: number;
  };
  items: any[];
  pricingTier?: 'retail' | 'wholesale' | 'half';
  customerSearchTerm?: string;
}

export const getStockTransferDraft = (): StockTransferDraftData | null => {
  try {
    let raw = secureStorage.getItem<any>(STOCK_TRANSFER_DRAFT_KEY);
    if (!raw) {
      raw = secureStorage.getItem<any>(LEGACY_STOCK_TRANSFER_DRAFT_KEY);
    }
    if (!raw && typeof window !== 'undefined' && window.localStorage) {
      const direct = window.localStorage.getItem(STOCK_TRANSFER_DRAFT_KEY) || window.localStorage.getItem(LEGACY_STOCK_TRANSFER_DRAFT_KEY);
      if (direct) {
        try { raw = JSON.parse(direct); } catch { raw = direct; }
      }
    }
    if (!raw) return null;
    while (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch {
        break;
      }
    }
    if (raw && typeof raw === 'object') {
      return raw as StockTransferDraftData;
    }
    return null;
  } catch {
    return null;
  }
};

export const clearStockTransferDraft = () => {
  try {
    secureStorage.removeItem(STOCK_TRANSFER_DRAFT_KEY);
    secureStorage.removeItem(LEGACY_STOCK_TRANSFER_DRAFT_KEY);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(STOCK_TRANSFER_DRAFT_KEY);
      window.localStorage.removeItem(LEGACY_STOCK_TRANSFER_DRAFT_KEY);
    }
  } catch {}
};

export const getSalesInvoiceDraft = (): SalesInvoiceDraftData | null => {
  try {
    let raw = secureStorage.getItem<any>(SALES_INVOICE_DRAFT_KEY);
    if (!raw) {
      raw = secureStorage.getItem<any>(LEGACY_SALES_INVOICE_DRAFT_KEY);
    }
    if (!raw && typeof window !== 'undefined' && window.localStorage) {
      const direct = window.localStorage.getItem(SALES_INVOICE_DRAFT_KEY) || window.localStorage.getItem(LEGACY_SALES_INVOICE_DRAFT_KEY);
      if (direct) {
        try { raw = JSON.parse(direct); } catch { raw = direct; }
      }
    }
    if (!raw) return null;
    while (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch {
        break;
      }
    }
    if (raw && typeof raw === 'object') {
      return raw as SalesInvoiceDraftData;
    }
    return null;
  } catch {
    return null;
  }
};

export const clearSalesInvoiceDraft = () => {
  try {
    secureStorage.removeItem(SALES_INVOICE_DRAFT_KEY);
    secureStorage.removeItem(LEGACY_SALES_INVOICE_DRAFT_KEY);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(SALES_INVOICE_DRAFT_KEY);
      window.localStorage.removeItem(LEGACY_SALES_INVOICE_DRAFT_KEY);
    }
  } catch {}
};

describe('🛡️ Draft Recovery & Page Reload Persistence Engine', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('📦 Stock Transfer Draft Recovery', () => {
    it('يسترجع مسودة التحويل المخزني كاملة عند حفظها ككائن', () => {
      const mockDraft: StockTransferDraftData = {
        formData: {
          date: '2026-10-15',
          fromWarehouseId: 'wh-main',
          toWarehouseId: 'wh-branch-1',
          notes: 'تحويل بضاعة عاجل للمستودع الفرعي'
        },
        items: [
          {
            productId: 'prod-001',
            productName: 'سكر أبيض 50 كجم',
            baseUnit: 'كجم',
            baseQuantity: 100,
            selectedUnit: 'شيكارة',
            enteredQty: 2,
            conversionRatio: 50,
            quantity: 100
          }
        ]
      };

      secureStorage.setItem(STOCK_TRANSFER_DRAFT_KEY, mockDraft);

      const recovered = getStockTransferDraft();
      expect(recovered).not.toBeNull();
      expect(recovered?.formData.fromWarehouseId).toBe('wh-main');
      expect(recovered?.formData.toWarehouseId).toBe('wh-branch-1');
      expect(recovered?.formData.notes).toBe('تحويل بضاعة عاجل للمستودع الفرعي');
      expect(recovered?.items).toHaveLength(1);
      expect(recovered?.items[0].productName).toBe('سكر أبيض 50 كجم');
      expect(recovered?.items[0].enteredQty).toBe(2);
    });

    it('يسترجع مسودة التحويل بنجاح حتى لو تم عمل JSON.stringify مزدوج عليها', () => {
      const mockDraft: StockTransferDraftData = {
        formData: {
          date: '2026-10-15',
          fromWarehouseId: 'wh-raw',
          toWarehouseId: 'wh-factory',
          notes: 'صرف خامات تشغيل'
        },
        items: [
          {
            productId: 'prod-002',
            productName: 'دقيق فاخر',
            baseUnit: 'كجم',
            baseQuantity: 50,
            selectedUnit: 'كجم',
            enteredQty: 50,
            conversionRatio: 1,
            quantity: 50
          }
        ]
      };

      // محاكاة الخطأ الشائع: JSON.stringify يدوياً داخل setItem التي تستدعي JSON.stringify مجدداً
      localStorage.setItem(STOCK_TRANSFER_DRAFT_KEY, JSON.stringify(JSON.stringify(mockDraft)));

      const recovered = getStockTransferDraft();
      expect(recovered).not.toBeNull();
      expect(recovered?.formData.fromWarehouseId).toBe('wh-raw');
      expect(recovered?.items[0].productName).toBe('دقيق فاخر');
    });

    it('يسترجع المسودة من المفتاح القديم tripro_stock_transfer_draft إذا لم يوجد v2', () => {
      const mockLegacyDraft: StockTransferDraftData = {
        formData: {
          date: '2026-10-10',
          fromWarehouseId: 'wh-old',
          toWarehouseId: 'wh-new',
          notes: 'من مسودة قديمة'
        },
        items: [
          {
            productId: 'prod-003',
            productName: 'زيت ذرة 1 لتر',
            baseUnit: 'لتر',
            baseQuantity: 12,
            selectedUnit: 'كرتونة',
            enteredQty: 1,
            conversionRatio: 12,
            quantity: 12
          }
        ]
      };

      secureStorage.setItem(LEGACY_STOCK_TRANSFER_DRAFT_KEY, mockLegacyDraft);

      const recovered = getStockTransferDraft();
      expect(recovered).not.toBeNull();
      expect(recovered?.formData.fromWarehouseId).toBe('wh-old');
      expect(recovered?.items).toHaveLength(1);
    });

    it('يمسح مسودة التحويل بالكامل من جميع المفاتيح عند استدعاء clearStockTransferDraft', () => {
      secureStorage.setItem(STOCK_TRANSFER_DRAFT_KEY, { formData: {}, items: [] });
      secureStorage.setItem(LEGACY_STOCK_TRANSFER_DRAFT_KEY, { formData: {}, items: [] });

      clearStockTransferDraft();

      expect(getStockTransferDraft()).toBeNull();
      expect(localStorage.getItem(STOCK_TRANSFER_DRAFT_KEY)).toBeNull();
      expect(localStorage.getItem(LEGACY_STOCK_TRANSFER_DRAFT_KEY)).toBeNull();
    });
  });

  describe('🧾 Sales Invoice Draft Recovery', () => {
    it('يسترجع مسودة فاتورة البيع كاملة بالأصناف والعميل والملاحظات والخصم ونظام التسعير', () => {
      const mockSalesDraft: SalesInvoiceDraftData = {
        formData: {
          customerId: 'cust-uuid-123',
          warehouseId: 'wh-sales-1',
          date: '2026-10-15',
          notes: 'فاتورة توريد عميل كبار السن مع خصم خاص',
          discountType: 'percentage',
          discountValue: 5,
          paidAmount: 500,
          treasuryId: 'treasury-main'
        },
        items: [
          {
            productId: 'item-101',
            productName: 'شاشة سامسونج 55 بوصة',
            quantity: 2,
            unitPrice: 15000,
            discount: 500,
            total: 29500
          },
          {
            productId: 'item-102',
            productName: 'حامل شاشة متحرك',
            quantity: 2,
            unitPrice: 450,
            discount: 0,
            total: 900
          }
        ],
        pricingTier: 'wholesale',
        customerSearchTerm: 'شركة الأمل للتجارة'
      };

      secureStorage.setItem(SALES_INVOICE_DRAFT_KEY, mockSalesDraft);

      const recovered = getSalesInvoiceDraft();
      expect(recovered).not.toBeNull();
      expect(recovered?.formData.customerId).toBe('cust-uuid-123');
      expect(recovered?.formData.warehouseId).toBe('wh-sales-1');
      expect(recovered?.formData.discountValue).toBe(5);
      expect(recovered?.formData.paidAmount).toBe(500);
      expect(recovered?.pricingTier).toBe('wholesale');
      expect(recovered?.customerSearchTerm).toBe('شركة الأمل للتجارة');
      expect(recovered?.items).toHaveLength(2);
      expect(recovered?.items[0].productName).toBe('شاشة سامسونج 55 بوصة');
      expect(recovered?.items[1].quantity).toBe(2);
    });

    it('يسترجع مسودة فاتورة البيع المحفوظة بالصيغة القديمة tripro_sales_invoice_draft بسلاسة', () => {
      const legacySalesDraft = {
        formData: {
          customerId: 'cust-legacy-456',
          notes: 'مسودة قديمة'
        },
        items: [
          {
            productId: 'item-legacy',
            productName: 'منتج قديم',
            quantity: 1,
            unitPrice: 100
          }
        ]
      };

      // تخزين مزدوج السلسلة كما كان يحدث سابقاً
      localStorage.setItem(LEGACY_SALES_INVOICE_DRAFT_KEY, JSON.stringify(JSON.stringify(legacySalesDraft)));

      const recovered = getSalesInvoiceDraft();
      expect(recovered).not.toBeNull();
      expect(recovered?.formData.customerId).toBe('cust-legacy-456');
      expect(recovered?.items).toHaveLength(1);
      expect(recovered?.items[0].productName).toBe('منتج قديم');
    });

    it('يمسح مسودة فاتورة البيع من جميع المفاتيح عند استدعاء clearSalesInvoiceDraft', () => {
      secureStorage.setItem(SALES_INVOICE_DRAFT_KEY, { formData: {}, items: [] });
      secureStorage.setItem(LEGACY_SALES_INVOICE_DRAFT_KEY, { formData: {}, items: [] });

      clearSalesInvoiceDraft();

      expect(getSalesInvoiceDraft()).toBeNull();
      expect(localStorage.getItem(SALES_INVOICE_DRAFT_KEY)).toBeNull();
      expect(localStorage.getItem(LEGACY_SALES_INVOICE_DRAFT_KEY)).toBeNull();
    });
  });

  describe('🔄 Page Reload Simulation (حماية الحالة المبدئية من التصفير العرضي)', () => {
    it('التهيئة الكسولة (Lazy Initializer) تسترجع بنود التحويل فوراً في أول دورة تصيير لمنع الكتابة بمصفوفة فارغة', () => {
      const mockDraft: StockTransferDraftData = {
        formData: {
          fromWarehouseId: 'wh-source',
          toWarehouseId: 'wh-target',
          notes: 'ملاحظة مهمة'
        },
        items: [
          {
            productId: 'p-1',
            productName: 'صنف 1',
            baseUnit: 'قطعة',
            baseQuantity: 10,
            selectedUnit: 'قطعة',
            enteredQty: 10,
            conversionRatio: 1,
            quantity: 10
          }
        ]
      };
      secureStorage.setItem(STOCK_TRANSFER_DRAFT_KEY, mockDraft);

      // محاكاة دالة useState الكسولة
      const initialItems = (() => {
        const draft = getStockTransferDraft();
        return draft?.items && draft.items.length > 0 ? draft.items : [];
      })();

      const initialFormData = (() => {
        const draft = getStockTransferDraft();
        return draft?.formData || { fromWarehouseId: '', toWarehouseId: '', notes: '' };
      })();

      // التحقق من أن الحالة ليست فارغة عند التحميل
      expect(initialItems).toHaveLength(1);
      expect(initialFormData.fromWarehouseId).toBe('wh-source');
    });
  });
});
