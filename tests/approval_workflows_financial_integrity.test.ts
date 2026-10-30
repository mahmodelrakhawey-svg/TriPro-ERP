import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('🛡️ Approval Workflows Financial Integrity and Statements Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('يجب تصفية واستبعاد سندات الصرف المرفوضة والمعلقة من كشف حساب المورد', () => {
    const rawPayments = [
      { id: '1', voucher_number: 'PV-101', amount: 5000, notes: 'سداد دفعة أولى للمورد', status: 'posted', deleted_at: null },
      { id: '2', voucher_number: 'PV-224290', amount: 3000, notes: '[مرفوض من الاعتماد: مرفوض]', status: 'rejected', deleted_at: '2026-10-30T08:05:26Z' },
      { id: '3', voucher_number: 'PV-103', amount: 1500, notes: '[معلق للاعتماد: مسار المدفوعات] سداد قيد المراجعة', status: 'pending_approval', deleted_at: null },
      { id: '4', voucher_number: 'PV-104', amount: 2000, notes: 'سند محذوف', status: 'posted', deleted_at: '2026-10-29T10:00:00Z' }
    ];

    const validPayments = rawPayments.filter((p: Record<string, any>) => {
      if (p.deleted_at) return false;
      const st = (p.status || '').toLowerCase();
      if (st === 'rejected' || st === 'cancelled' || st === 'draft' || st === 'pending_approval') return false;
      const notes = (p.notes || '').trim();
      if (notes.startsWith('[مرفوض') || notes.startsWith('[معلق للاعتماد')) return false;
      return true;
    });

    // يجب أن يبقى فقط السند المعتمد والنشط رقم PV-101
    expect(validPayments.length).toBe(1);
    expect(validPayments[0].voucher_number).toBe('PV-101');
    expect(validPayments[0].amount).toBe(5000);
  });

  it('يجب استبعاد فواتير المشتريات المسودة والملغاة والمرفوضة من كشف حساب المورد', () => {
    const rawInvoices = [
      { id: 'inv-1', invoice_number: 'PUR-958376', total_amount: 218880.06, status: 'posted' },
      { id: 'inv-2', invoice_number: 'PUR-DRAFT', total_amount: 15000, status: 'draft' },
      { id: 'inv-3', invoice_number: 'PUR-REJECTED', total_amount: 8000, status: 'rejected' },
      { id: 'inv-4', invoice_number: 'PUR-CANCELLED', total_amount: 12000, status: 'cancelled' }
    ];

    const validInvoices = rawInvoices.filter(i => ['posted', 'paid'].includes(i.status));

    expect(validInvoices.length).toBe(1);
    expect(validInvoices[0].invoice_number).toBe('PUR-958376');
  });

  it('يجب إزالة وسم [قيد معلق للاعتماد] من البيان عند اعتماد قيد اليومية', () => {
    const originalDescription = '[قيد معلق للاعتماد: 1000] تاسيسات';
    const cleanedDesc = originalDescription.replace(/^\[قيد معلق للاعتماد:[^\]]*\]\s*/, '').trim();

    expect(cleanedDesc).toBe('تاسيسات');

    const multiLineDesc = '[قيد معلق للاعتماد: مسار الاعتماد المالي] إثبات مصروفات صيانة الآلات والمعدات';
    const cleanedMulti = multiLineDesc.replace(/^\[قيد معلق للاعتماد:[^\]]*\]\s*/, '').trim();
    expect(cleanedMulti).toBe('إثبات مصروفات صيانة الآلات والمعدات');
  });

  it('دفتر الأستاذ العام يجب أن يستبعد أي قيود مرفوضة وينظف البيان للقيود المعتمدة', () => {
    const periodLines = [
      {
        id: 'line-1',
        debit: 2000,
        credit: 0,
        journal_entries: { id: 'je-1', status: 'posted', description: '[قيد معلق للاعتماد: 1000] تاسيسات' }
      },
      {
        id: 'line-2',
        debit: 3000,
        credit: 0,
        journal_entries: { id: 'je-2', status: 'rejected', description: '[مرفوض من الاعتماد: مرفوض]' }
      },
      {
        id: 'line-3',
        debit: 0,
        credit: 1500,
        journal_entries: { id: 'je-3', status: 'draft', description: 'قيد مسودة لم يرحل' }
      }
    ];

    let running = 10000;
    const processed = periodLines
      .filter(item => {
        const je = item.journal_entries;
        if (!je || je.status !== 'posted') return false;
        const desc = (je.description || '').trim();
        if (desc.startsWith('[مرفوض')) return false;
        return true;
      })
      .map(item => {
        if (item.journal_entries?.description) {
          item.journal_entries.description = item.journal_entries.description.replace(/^\[قيد معلق للاعتماد:[^\]]*\]\s*/, '').trim();
        }
        running += (item.debit - item.credit);
        return { ...item, balance: running };
      });

    // سطر واحد فقط يجب أن يظهر (line-1 المعتمد مع تنظيف بيانه)
    expect(processed.length).toBe(1);
    expect(processed[0].journal_entries.description).toBe('تاسيسات');
    expect(processed[0].balance).toBe(12000);
  });
});
