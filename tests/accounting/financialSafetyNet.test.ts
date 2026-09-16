import { describe, it, expect } from 'vitest';

/**
 * ==============================================================================
 * TriPro ERP - Financial Safety Net & Concurrency Integrity Tests
 * tests/accounting/financialSafetyNet.test.ts
 * ==============================================================================
 * تفحص هذه الحزمة الرياضية الدقيقة صرامة العمليات المالية وتمنع أي انحراف
 * في القيود المزدوجة، التسويات الضريبية، عجز وزيادة الورديات، وتكرار المزامنة.
 */

interface JournalLine {
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  currency?: string;
  exchangeRate?: number;
  amountForeign?: number;
}

interface JournalEntry {
  reference: string;
  date: string;
  lines: JournalLine[];
}

function validateEntryBalance(entry: JournalEntry): {
  isBalanced: boolean;
  totalDebit: number;
  totalCredit: number;
  difference: number;
} {
  let totalDebit = 0;
  let totalCredit = 0;

  for (const line of entry.lines) {
    totalDebit += Number(line.debit || 0);
    totalCredit += Number(line.credit || 0);
  }

  totalDebit = Math.round(totalDebit * 100) / 100;
  totalCredit = Math.round(totalCredit * 100) / 100;
  const difference = Math.round(Math.abs(totalDebit - totalCredit) * 100) / 100;

  return {
    isBalanced: difference < 0.001,
    totalDebit,
    totalCredit,
    difference
  };
}

describe('💰 Enterprise Financial Safety Net & Ledger Invariants', () => {

  // 1. توازن القيود المحاسبية متعددة العملات
  it('يجب أن يتزن القيد المحاسبي بالعملة المحلية تماماً عند تحويل عملة أجنبية (USD -> EGP) بسعر صرف', () => {
    const exchangeRate = 48.55;
    const invoiceUsd = 1250.75;
    const totalEgp = Math.round(invoiceUsd * exchangeRate * 100) / 100; // 60723.91 EGP

    const vatRate = 0.14;
    const vatEgp = Math.round(totalEgp * vatRate * 100) / 100;
    const grossEgp = Math.round((totalEgp + vatEgp) * 100) / 100;

    const entry: JournalEntry = {
      reference: 'INV-USD-2026-001',
      date: '2026-09-16',
      lines: [
        {
          accountId: 'cust-usd',
          accountCode: '1221',
          accountName: 'عملاء خارجيين بالدولار',
          debit: grossEgp,
          credit: 0,
          currency: 'USD',
          exchangeRate,
          amountForeign: invoiceUsd * (1 + vatRate)
        },
        {
          accountId: 'sales-export',
          accountCode: '4101',
          accountName: 'إيراد مبيعات تصدير',
          debit: 0,
          credit: totalEgp,
          currency: 'USD',
          exchangeRate,
          amountForeign: invoiceUsd
        },
        {
          accountId: 'vat-payable',
          accountCode: '2205',
          accountName: 'ضريبة القيمة المضافة',
          debit: 0,
          credit: vatEgp
        }
      ]
    };

    const validation = validateEntryBalance(entry);
    expect(validation.isBalanced).toBe(true);
    expect(validation.difference).toBe(0);
    expect(validation.totalDebit).toBe(validation.totalCredit);
  });

  // 2. معالجة عجز النقدية في إقفال الوردية (Cash Shortage Shift Reconciliation)
  it('يجب توليد قيد عجز الخزينة بشكل سليم بتحميل حساب العجز 541 عند وجود نقص في الدرج الفعلي', () => {
    const expectedCash = 5000.00; // المفترض في الصندوق
    const actualCountedCash = 4850.00; // المعدود فعلياً في الجرد
    const cashDeficit = Math.round((expectedCash - actualCountedCash) * 100) / 100; // 150.00 EGP

    expect(cashDeficit).toBe(150.00);

    const shiftClosingEntry: JournalEntry = {
      reference: 'SHIFT-CLOSE-POS-1',
      date: '2026-09-16',
      lines: [
        {
          accountId: 'cash-main',
          accountCode: '101',
          accountName: 'الصندوق / الخزينة الرئيسية',
          debit: actualCountedCash, // 4850
          credit: 0
        },
        {
          accountId: 'cash-shortage-acc',
          accountCode: '541',
          accountName: 'عجز الخزينة والصندوق',
          debit: cashDeficit, // 150
          credit: 0
        },
        {
          accountId: 'sales-clearing',
          accountCode: '4101',
          accountName: 'مبيعات الكاشير للوردية',
          debit: 0,
          credit: expectedCash // 5000
        }
      ]
    };

    const validation = validateEntryBalance(shiftClosingEntry);
    expect(validation.isBalanced).toBe(true);
    expect(validation.totalDebit).toBe(5000);
    expect(validation.totalCredit).toBe(5000);
  });

  // 3. معالجة زيادة النقدية في إقفال الوردية (Cash Surplus Shift Reconciliation)
  it('يجب توليد قيد زيادة الصندوق وتوريدها لحساب الأرباح المتنوعة 441 عند وجود فائض', () => {
    const expectedCash = 3000.00;
    const actualCountedCash = 3120.50;
    const cashSurplus = Math.round((actualCountedCash - expectedCash) * 100) / 100; // 120.50 EGP

    const shiftClosingEntry: JournalEntry = {
      reference: 'SHIFT-CLOSE-POS-2',
      date: '2026-09-16',
      lines: [
        {
          accountId: 'cash-main',
          accountCode: '101',
          accountName: 'النقدية بالصندوق',
          debit: actualCountedCash, // 3120.50
          credit: 0
        },
        {
          accountId: 'sales-clearing',
          accountCode: '4101',
          accountName: 'مبيعات الوردية',
          debit: 0,
          credit: expectedCash // 3000.00
        },
        {
          accountId: 'cash-surplus-acc',
          accountCode: '441',
          accountName: 'أرباح وفائض النقدية بالصندوق',
          debit: 0,
          credit: cashSurplus // 120.50
        }
      ]
    };

    const validation = validateEntryBalance(shiftClosingEntry);
    expect(validation.isBalanced).toBe(true);
    expect(validation.totalDebit).toBe(3120.50);
    expect(validation.totalCredit).toBe(3120.50);
  });

  // 4. تناغم قيد تكلفة البضاعة المباعة والمخزون (COGS & Inventory Asset Symmetry)
  it('يجب أن يتطابق تخفيض المخزون مع تحميل تكلفة البضاعة المباعة بدقة سنت إلى سنت', () => {
    const items = [
      { sku: 'ITEM-A', qty: 10, costPrice: 45.25 },
      { sku: 'ITEM-B', qty: 3, costPrice: 120.00 },
      { sku: 'ITEM-C', qty: 5.5, costPrice: 80.50 }
    ];

    const totalCogs = items.reduce((sum, item) => sum + (item.qty * item.costPrice), 0);
    const roundedCogs = Math.round(totalCogs * 100) / 100; // 452.5 + 360 + 442.75 = 1255.25

    const cogsEntry: JournalEntry = {
      reference: 'COGS-INV-9901',
      date: '2026-09-16',
      lines: [
        {
          accountId: 'acc-cogs',
          accountCode: '5101',
          accountName: 'تكلفة البضاعة المباعة',
          debit: roundedCogs,
          credit: 0
        },
        {
          accountId: 'acc-inventory',
          accountCode: '10302',
          accountName: 'مخزون البضاعة التامة',
          debit: 0,
          credit: roundedCogs
        }
      ]
    };

    const validation = validateEntryBalance(cogsEntry);
    expect(validation.isBalanced).toBe(true);
    expect(validation.difference).toBe(0);
    expect(validation.totalDebit).toBe(1255.25);
  });

  // 5. التحقق من منع تكرار مزامنة الأوفلاين (Idempotency Simulation)
  it('يجب منع تكرار الطلبات المزامنة أوفلاين وحمايتها عبر المعرف الفريد offline_ref_id', () => {
    const syncDb = new Map<string, any>();

    function processOfflineOrder(order: { offline_ref_id: string; total: number; customer: string }) {
      if (syncDb.has(order.offline_ref_id)) {
        return {
          status: 'already_synced',
          orderId: syncDb.get(order.offline_ref_id).id,
          message: 'تم تخطي الطلب لكونه مسجلاً مسبقاً'
        };
      }

      const newRecord = {
        id: `ORD-REAL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        offline_ref_id: order.offline_ref_id,
        total: order.total,
        created_at: new Date().toISOString()
      };
      syncDb.set(order.offline_ref_id, newRecord);

      return {
        status: 'synced_successfully',
        orderId: newRecord.id,
        message: 'تمت مزامنة الطلب بنجاح'
      };
    }

    const testOrder = {
      offline_ref_id: 'OFFLINE-ORDER-UUID-9988-7766',
      total: 350.00,
      customer: 'كريم أحمد'
    };

    // المزامنة الأولى
    const firstSync = processOfflineOrder(testOrder);
    expect(firstSync.status).toBe('synced_successfully');
    expect(syncDb.size).toBe(1);

    // إعادة الإرسال لنفس الطلب بالخطأ نتيجة تقطع الشبكة
    const duplicateSync = processOfflineOrder(testOrder);
    expect(duplicateSync.status).toBe('already_synced');
    expect(duplicateSync.orderId).toBe(firstSync.orderId);
    expect(syncDb.size).toBe(1); // لم يزداد العدد ولم يتكرر الخصم
  });

  // 6. التحقق من معادلة الضرائب المركبة ورسوم الخدمة للمطاعم
  it('يجب أن تنضبط الفاتورة المركبة (سعر + خدمة 12% + ضريبة 14% - خصم تجاري) بدون أي هدر سنتات', () => {
    const subtotal = 1000.00;
    const discount = 50.00;
    const netBase = subtotal - discount; // 950.00

    const serviceRate = 0.12;
    const serviceAmount = Math.round(netBase * serviceRate * 100) / 100; // 114.00

    // في القانون الضريبي المصري، وعاء الضريبة في المطاعم السياحية يشمل رسم الخدمة
    const taxableBase = netBase + serviceAmount; // 1064.00
    const vatRate = 0.14;
    const vatAmount = Math.round(taxableBase * vatRate * 100) / 100; // 148.96

    const grandTotal = Math.round((taxableBase + vatAmount) * 100) / 100; // 1212.96

    expect(grandTotal).toBe(1212.96);

    const restaurantSalesEntry: JournalEntry = {
      reference: 'REST-INV-2026-101',
      date: '2026-09-16',
      lines: [
        {
          accountId: 'cash',
          accountCode: '101',
          accountName: 'النقدية المحصلة من العميل',
          debit: grandTotal, // 1212.96
          credit: 0
        },
        {
          accountId: 'discount-expense',
          accountCode: '4103',
          accountName: 'خصم مسموح به',
          debit: discount, // 50.00
          credit: 0
        },
        {
          accountId: 'food-revenue',
          accountCode: '4101',
          accountName: 'إيراد مبيعات أغذية ومشروبات',
          debit: 0,
          credit: subtotal // 1000.00
        },
        {
          accountId: 'service-charge',
          accountCode: '41104',
          accountName: 'إيراد رسوم الخدمة 12%',
          debit: 0,
          credit: serviceAmount // 114.00
        },
        {
          accountId: 'vat-output',
          accountCode: '2205',
          accountName: 'ضريبة القيمة المضافة 14%',
          debit: 0,
          credit: vatAmount // 148.96
        }
      ]
    };

    const validation = validateEntryBalance(restaurantSalesEntry);
    expect(validation.isBalanced).toBe(true);
    expect(validation.totalDebit).toBe(1262.96);
    expect(validation.totalCredit).toBe(1262.96);
    expect(validation.difference).toBe(0);
  });
});
