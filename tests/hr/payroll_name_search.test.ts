import { describe, it, expect } from 'vitest';

describe('Payroll Name Search & Filtering Logic (البحث بالاسم في مسير الرواتب)', () => {
  const mockPayrollItems = [
    {
      employee_id: 'emp-1',
      full_name: 'أحمد محمود علي',
      department: 'المصنع',
      gross_salary: 5000,
      additions: 500,
      advances_deducted: 300,
      other_deductions: 200,
      payroll_tax: 150,
      net_salary: 4850
    },
    {
      employee_id: 'emp-2',
      full_name: 'محمد عبد الله الشربيني',
      department: 'فرع الدقي',
      gross_salary: 7000,
      additions: 1000,
      advances_deducted: 500,
      other_deductions: 0,
      payroll_tax: 250,
      net_salary: 7250
    },
    {
      employee_id: 'emp-3',
      full_name: 'كريم أحمد سالم',
      department: 'المصنع',
      gross_salary: 4500,
      additions: 200,
      advances_deducted: 0,
      other_deductions: 100,
      payroll_tax: 100,
      net_salary: 4500
    },
    {
      employee_id: 'emp-4',
      full_name: 'سارة إبراهيم حسن',
      department: 'الإدارة العامة',
      gross_salary: 9000,
      additions: 1500,
      advances_deducted: 1000,
      other_deductions: 0,
      payroll_tax: 400,
      net_salary: 9100
    }
  ];

  const filterPayroll = (
    items: typeof mockPayrollItems,
    selectedDepartment: string,
    searchTerm: string
  ) => {
    return items.filter(p => {
      const matchDept = selectedDepartment === 'all' || (p.department || 'بدون فرع').trim() === selectedDepartment;
      const term = searchTerm.trim().toLowerCase();
      const matchSearch = !term ||
        (p.full_name || '').toLowerCase().includes(term) ||
        (p.department || '').toLowerCase().includes(term);
      return matchDept && matchSearch;
    });
  };

  it('يعيد جميع الموظفين عندما يكون حقل البحث فارغاً والقسم "الكل"', () => {
    const results = filterPayroll(mockPayrollItems, 'all', '');
    expect(results).toHaveLength(4);
  });

  it('يبحث بدقة عن موظف بالاسم (مثل: "أحمد")', () => {
    const results = filterPayroll(mockPayrollItems, 'all', 'أحمد');
    // يتطابق مع "أحمد محمود علي" و "كريم أحمد سالم"
    expect(results).toHaveLength(2);
    expect(results.map(r => r.full_name)).toEqual(['أحمد محمود علي', 'كريم أحمد سالم']);
  });

  it('يبحث بجزء من الاسم (مثل: "الشربيني")', () => {
    const results = filterPayroll(mockPayrollItems, 'all', 'الشربيني');
    expect(results).toHaveLength(1);
    expect(results[0].full_name).toBe('محمد عبد الله الشربيني');
    expect(results[0].net_salary).toBe(7250);
  });

  it('يدمج فلترة الفرع/القسم مع البحث بالاسم', () => {
    // نبحث عن "أحمد" داخل قسم "المصنع" فقط
    const factoryAhmed = filterPayroll(mockPayrollItems, 'المصنع', 'أحمد');
    expect(factoryAhmed).toHaveLength(2);

    // نبحث عن "أحمد" داخل فرع "الدقي" (غير موجود)
    const dokkiAhmed = filterPayroll(mockPayrollItems, 'فرع الدقي', 'أحمد');
    expect(dokkiAhmed).toHaveLength(0);
  });

  it('يحسب إجماليات الصافي والأساسي بدقة للنتائج المصفاة فقط', () => {
    const searchResults = filterPayroll(mockPayrollItems, 'all', 'سارة');
    expect(searchResults).toHaveLength(1);

    const filteredTotalNet = searchResults.reduce((acc, curr) => acc + curr.net_salary, 0);
    expect(filteredTotalNet).toBe(9100);
  });

  it('يعيد مصفوفة فارغة إذا لم يوجد أي تطابق لاسم الموظف', () => {
    const results = filterPayroll(mockPayrollItems, 'all', 'اسم غير موجود إطلاقاً');
    expect(results).toHaveLength(0);
  });
});
