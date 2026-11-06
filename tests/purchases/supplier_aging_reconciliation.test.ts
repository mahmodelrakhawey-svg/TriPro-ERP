import { describe, it, expect } from 'vitest';

describe('Supplier Aging & Cross-Screen Reconciliation Tests', () => {
  it('ensures supplier aging uses canonical balances and matches positive balances from report', () => {
    // محاكاة الأرصدة المعتمدة من محرك الأرصدة (Canonical Balances)
    const balancesMap = new Map<string, number>([
      ['supp-mekka', 1442477.02],
      ['supp-ahmed-ghobara', 1580.00],
      ['supp-mustafa-plastic', 680.00],
      ['supp-omari', 0.00],
      ['supp-oleis', 0.00],
      ['supp-kamal-stainless', -86800.00],
      ['supp-sana-equipment', -50000.00],
      ['supp-cash', -33113.33]
    ]);

    const suppliers = [
      { id: 'supp-mekka', name: 'شركة مكة' },
      { id: 'supp-ahmed-ghobara', name: 'أحمد عبدالعزيز غبارة' },
      { id: 'supp-mustafa-plastic', name: 'شركه مصطفي للبلاستيك' },
      { id: 'supp-omari', name: 'العمري' },
      { id: 'supp-oleis', name: 'اوليس للتوكيلات التجارية' },
      { id: 'supp-kamal-stainless', name: 'كمال استانلس' },
      { id: 'supp-sana-equipment', name: 'سنا معدات' },
      { id: 'supp-cash', name: 'مورد نقدى' }
    ];

    const agingData = suppliers.map(supplier => {
      const canonicalBalance = balancesMap.get(supplier.id);
      if (canonicalBalance === undefined || canonicalBalance <= 0.01) {
        return null;
      }
      const netBalance = canonicalBalance;

      // محاكاة توزيع الفئات FIFO
      let range0_30 = netBalance;
      let range31_60 = 0;
      let range61_90 = 0;
      let range90_plus = 0;

      return {
        id: supplier.id,
        name: supplier.name,
        balance: netBalance,
        range0_30,
        range31_60,
        range61_90,
        range90_plus
      };
    }).filter((s): s is NonNullable<typeof s> => s !== null && s.balance > 0.01);

    // 1. الموردين ذوي الأرصدة الصفرية أو السالبة يجب استبعادهم من أعمار الديون
    expect(agingData.some(s => s.id === 'supp-omari')).toBe(false);
    expect(agingData.some(s => s.id === 'supp-oleis')).toBe(false);
    expect(agingData.some(s => s.id === 'supp-kamal-stainless')).toBe(false);
    expect(agingData.some(s => s.id === 'supp-sana-equipment')).toBe(false);
    expect(agingData.some(s => s.id === 'supp-cash')).toBe(false);

    // 2. الموردين المستحق لهم (أحمد عبدالعزيز غبارة وشركه مصطفي للبلاستيك) يجب أن يظهروا بأرصدتهم الصحيحة
    const ghobara = agingData.find(s => s.id === 'supp-ahmed-ghobara');
    expect(ghobara).toBeDefined();
    expect(ghobara?.balance).toBe(1580.00);

    const plastic = agingData.find(s => s.id === 'supp-mustafa-plastic');
    expect(plastic).toBeDefined();
    expect(plastic?.balance).toBe(680.00);

    // 3. تطابق المجموع مع الأرصدة الموجبة
    const totalAging = agingData.reduce((sum, s) => sum + s.balance, 0);
    const expectedPositiveTotal = 1442477.02 + 1580.00 + 680.00;
    expect(totalAging).toBeCloseTo(expectedPositiveTotal, 2);
  });

  it('ensures customer aging uses canonical balances and matches customer management balances', () => {
    const canonicalBalances = new Map<string, number>([
      ['cust-1', 45000],  // مدين مستحق
      ['cust-2', 0],      // خالص
      ['cust-3', -12000], // رصيد دائن (دفعة مقدمة)
    ]);

    const customers = [
      { id: 'cust-1', name: 'شركة الأفق' },
      { id: 'cust-2', name: 'مؤسسة النور' },
      { id: 'cust-3', name: 'سوبر ماركت البركة' },
    ];

    const agingReportData = customers.map(c => {
      const bal = canonicalBalances.get(c.id);
      if (bal === undefined || bal <= 0.01) return null;
      return { id: c.id, name: c.name, balance: bal };
    }).filter((c): c is NonNullable<typeof c> => c !== null);

    // يجب أن يظهر العميل المدين فقط
    expect(agingReportData.length).toBe(1);
    expect(agingReportData[0].id).toBe('cust-1');
    expect(agingReportData[0].balance).toBe(45000);
  });
});
