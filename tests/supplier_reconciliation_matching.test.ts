import { describe, it, expect } from 'vitest';

describe('Supplier Matching Logic Test', () => {
  const suppliers = [
    { id: 'supp-ice', name: 'مورد ثلج' },
    { id: 'supp-cash', name: 'مورد نقدى' },
    { id: 'supp-baraka', name: 'احمد ابراهيم البركة' },
    { id: 'supp-shehab', name: 'مصنع شهاب(أحمد شهاب)' },
  ];

  const stopWords = new Set([
    'شركة', 'مؤسسة', 'مصنع', 'مجموعة', 'توكيلات', 'تجارة', 'توزيع', 'توريد', 'توريدات',
    'صناعة', 'صناعات', 'استيراد', 'تصدير', 'خدمات', 'العامة', 'الحديثة', 'الدولية',
    'المتحدة', 'الغذائية', 'للتجارة', 'للتوزيع'
  ]);

  it('demonstrates the bug: "مورد ثلج" falsely matches any general entry containing "مورد"', () => {
    // Unlinked journal entry: "فاتورة مشتريات خامات مورد عام"
    const desc = 'فاتورة مشتريات خامات مورد عام';
    const lowerDesc = desc.toLowerCase();

    // OLD buggy logic from SupplierBalanceReconciliation.tsx
    const matchedSupp = suppliers.find(s => {
      if (!s.name) return false;
      const sName = s.name.trim().toLowerCase();
      if (lowerDesc.includes(sName)) return true;
      const distinctWords = sName.split(' ').filter(w => w.length > 3 && !stopWords.has(w));
      return distinctWords.length > 0 && distinctWords.some(w => lowerDesc.includes(w));
    });

    // It matches "مورد ثلج" because "مورد" has length 4 and is NOT in stopWords!
    expect(matchedSupp?.id).toBe('supp-ice');
  });

  it('proves the fix: with comprehensive stopWords and full-name/strict matching, general entries do NOT match "مورد ثلج"', () => {
    const desc = 'فاتورة مشتريات خامات مورد عام';
    const cleanDesc = desc.toLowerCase().trim();

    const enhancedStopWords = new Set([
      'شركة', 'مؤسسة', 'مصنع', 'مجموعة', 'توكيلات', 'تجارة', 'توزيع', 'توريد', 'توريدات',
      'صناعة', 'صناعات', 'استيراد', 'تصدير', 'خدمات', 'العامة', 'الحديثة', 'الدولية',
      'المتحدة', 'الغذائية', 'للتجارة', 'للتوزيع',
      'مورد', 'موردين', 'موردي', 'المورد', 'الموردين', 'عميل', 'عملاء', 'العميل', 'العملاء',
      'حساب', 'الحساب', 'نقد', 'نقدي', 'نقدى', 'عام', 'شيك', 'سداد', 'فاتورة', 'قيد', 'تسوية'
    ]);

    // NEW corrected logic:
    // 1. Full normalized name match (longest match first)
    const norm = (str: string) => str.toLowerCase().replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/[ىي]/g, 'ي').trim();

    const normDesc = norm(desc);

    const sortedSuppliers = [...suppliers].sort((a, b) => b.name.length - a.name.length);

    // Exact full name match in description
    let matchedSupp = sortedSuppliers.find(s => {
      const sNorm = norm(s.name);
      return sNorm.length >= 3 && normDesc.includes(sNorm);
    });

    // If no full name match, do not falsely assign to a random supplier based on generic words!
    expect(matchedSupp).toBeUndefined(); // Remains unlinked! Correct!
  });
});
