import { describe, it, expect } from 'vitest';
import { etaService } from '../../services/etaService';

describe('Egyptian Tax Authority (ETA) e-Invoicing Canonical Serialization', () => {
  it('يجب ترتيب المفاتيح تصاعدياً وفق الحروف الأبجدية وتحويلها لأحرف كبيرة في الـ Canonical String', () => {
    const rawObj = {
      name: "TriPro",
      age: 5,
      city: "Cairo"
    };

    // Sorted order: "AGE" -> "CITY" -> "NAME"
    const canonical = etaService.generateCanonicalString(rawObj);

    // Expected sequence: "AGE""5""CITY""Cairo""NAME""TriPro"
    expect(canonical).toBe('"AGE""5""CITY""Cairo""NAME""TriPro"');
  });

  it('يجب معالجة الكائنات المتداخلة (Nested Objects) والمصفوفات بالشكل القانوني لـ ETA', () => {
    const doc = {
      issuer: {
        id: "100200300",
        type: "B"
      },
      lines: [
        { code: "ITEM1", qty: 10 }
      ]
    };

    const canonical = etaService.generateCanonicalString(doc);

    expect(canonical).toContain('"ISSUER"');
    expect(canonical).toContain('"ID""100200300"');
    expect(canonical).toContain('"TYPE""B"');
    expect(canonical).toContain('"LINES"');
    expect(canonical).toContain('"CODE""ITEM1"');
    expect(canonical).toContain('"QTY""10"');
  });

  it('يجب بناء هيكل وثيقة الفاتورة الضريبية وفق متطلبات مصلحة الضرائب المصرية (v1.0)', () => {
    const mockInvoice = {
      invoice_date: '2026-09-12T10:00:00Z',
      currency: 'EGP',
      subtotal: 1000,
      discount_amount: 0,
      tax_amount: 140,
      total_amount: 1140,
      customers: {
        name: 'عميل تجريبي',
        customer_type: 'company',
        taxpayer_id: '999888777',
        governorate: 'Giza',
        city: 'Dokki',
        street: 'Mossaddak',
        building_number: '12'
      }
    };

    const mockItems = [
      {
        quantity: 2,
        unit_price: 500,
        total: 1000,
        discount_amount: 0,
        products: {
          name: 'شيكولاتة خام لينزا فاخرة',
          sku: 'CHOC-001',
          item_code_type: 'EGS'
        },
        uoms: { code: 'KGM' }
      }
    ];

    const mockSettings = {
      eta_taxpayer_id: '123456789',
      company_name: 'حلواني لينزا',
      eta_activity_code: '1071',
      governorate: 'Cairo',
      city: 'Nasr City',
      street: 'Makram Ebeid',
      building_number: '5'
    };

    const etaDoc = etaService.formatToETADocument(mockInvoice, mockItems, mockSettings);

    expect(etaDoc.issuer.id).toBe('123456789');
    expect(etaDoc.issuer.type).toBe('B');
    expect(etaDoc.receiver.id).toBe('999888777');
    expect(etaDoc.documentType).toBe('I');
    expect(etaDoc.invoiceLines).toHaveLength(1);
    expect(etaDoc.invoiceLines[0].taxableItems[0].taxType).toBe('T1');
    expect(etaDoc.invoiceLines[0].taxableItems[0].subType).toBe('V009');
    expect(etaDoc.invoiceLines[0].taxableItems[0].rate).toBe(14);
    expect(etaDoc.totalAmount).toBe(1140);
  });
});
