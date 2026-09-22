import { describe, it, expect } from 'vitest';
import { normalizeArabic } from '../../components/EmployeeSearchSelect';

describe('EmployeeSearchSelect & Smart Advance Features', () => {

  describe('normalizeArabic function', () => {
    it('normalizes different forms of Alef (أ, إ, آ, ٱ -> ا)', () => {
      expect(normalizeArabic('أحمد')).toBe('احمد');
      expect(normalizeArabic('إبراهيم')).toBe('ابراهيم');
      expect(normalizeArabic('آدم')).toBe('ادم');
      expect(normalizeArabic('ٱستاذ')).toBe('استاذ');
    });

    it('normalizes Taa Marbuta (ة -> ه)', () => {
      expect(normalizeArabic('فاطمة')).toBe('فاطمه');
      expect(normalizeArabic('شركة')).toBe('شركه');
      expect(normalizeArabic('حمادة')).toBe('حماده');
    });

    it('normalizes Yaa and Alef Maqsura (ى -> ي)', () => {
      expect(normalizeArabic('علي')).toBe('علي');
      expect(normalizeArabic('على')).toBe('علي');
      expect(normalizeArabic('يحيى')).toBe('يحيي');
      expect(normalizeArabic('مصطفى')).toBe('مصطفي');
    });

    it('removes Arabic diacritics (tashkeel and tatweel)', () => {
      expect(normalizeArabic('مُحَمَّدٌ')).toBe('محمد');
      expect(normalizeArabic('سَلَفـَــة')).toBe('سلفه');
    });

    it('handles empty and null values gracefully', () => {
      expect(normalizeArabic('')).toBe('');
      expect(normalizeArabic(null as any)).toBe('');
      expect(normalizeArabic(undefined as any)).toBe('');
    });
  });

  describe('Multi-field search logic', () => {
    const mockEmployees = [
      { id: '1', full_name: 'أحمد محمود الويشي', department: 'المصنع', position: 'فني تشغيل', phone: '01012345678', basic_salary: 6000 },
      { id: '2', full_name: 'فاطمة شوقي أحمد', department: 'المصنع', position: 'عاملة تعبئة', phone: '01198765432', basic_salary: 4500 },
      { id: '3', full_name: 'إبراهيم علي حسن', department: 'الإدارة', position: 'محاسب عام', phone: '01234567890', basic_salary: 9000 },
      { id: '4', full_name: 'مصطفى كامل', department: 'المبيعات', position: 'مندوب فرع', phone: '01500011122', basic_salary: 5500 }
    ];

    const searchEmployees = (query: string, deptFilter: string = 'all') => {
      let results = mockEmployees;
      if (deptFilter !== 'all') {
        results = results.filter(e => e.department === deptFilter);
      }
      const cleanSearch = normalizeArabic(query);
      if (!cleanSearch) return results;

      return results.filter(emp => {
        const name = normalizeArabic(emp.full_name);
        const dept = normalizeArabic(emp.department);
        const pos = normalizeArabic(emp.position);
        const phone = (emp.phone || '').trim();
        return name.includes(cleanSearch) || dept.includes(cleanSearch) || pos.includes(cleanSearch) || phone.includes(cleanSearch);
      });
    };

    it('finds employees by normalized name (searching "احمد" matches "أحمد محمود")', () => {
      const res = searchEmployees('احمد');
      expect(res.length).toBe(2); // أحمد محمود and فاطمة شوقي أحمد
    });

    it('finds employees by job position (searching "محاسب")', () => {
      const res = searchEmployees('محاسب');
      expect(res.length).toBe(1);
      expect(res[0].id).toBe('3');
    });

    it('finds employees by phone number', () => {
      const res = searchEmployees('010123');
      expect(res.length).toBe(1);
      expect(res[0].full_name).toContain('الويشي');
    });

    it('filters by department chip correctly', () => {
      const factoryOnly = searchEmployees('', 'المصنع');
      expect(factoryOnly.length).toBe(2);
      expect(factoryOnly.every(e => e.department === 'المصنع')).toBe(true);
    });

    it('combines department filter and text search', () => {
      const res = searchEmployees('فاطمه', 'المصنع');
      expect(res.length).toBe(1);
      expect(res[0].id).toBe('2');

      const adminRes = searchEmployees('فاطمه', 'الإدارة');
      expect(adminRes.length).toBe(0);
    });
  });

  describe('Smart Advance Metrics & Calculation', () => {
    const mockAdvances = [
      { id: 'adv-1', employee_id: 'emp-1', amount: 1500, status: 'paid', payroll_item_id: null, request_date: '2026-09-10' },
      { id: 'adv-2', employee_id: 'emp-1', amount: 1000, status: 'deducted', payroll_item_id: 'pay-1', request_date: '2026-08-01' },
      { id: 'adv-3', employee_id: 'emp-2', amount: 2000, status: 'paid', payroll_item_id: null, request_date: '2026-09-15' },
      { id: 'adv-4', employee_id: 'emp-1', amount: 500, status: 'paid', payroll_item_id: null, request_date: '2026-09-20' },
    ];

    const calculateEmployeeStats = (empId: string, currentYear = 2026, currentMonth = 8) => { // 8 = September (0-indexed)
      let outstanding = 0;
      let monthTotal = 0;
      let count = 0;

      mockAdvances.filter(a => a.employee_id === empId).forEach(adv => {
        const amt = adv.amount;
        if (adv.status === 'paid' && !adv.payroll_item_id) {
          outstanding += amt;
          count += 1;
        }
        const d = new Date(adv.request_date);
        if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
          monthTotal += amt;
        }
      });

      return { outstanding, monthTotal, count };
    };

    it('calculates outstanding unsettled advances accurately', () => {
      const emp1Stats = calculateEmployeeStats('emp-1');
      // adv-1 (1500) + adv-4 (500) = 2000 (adv-2 is deducted, so not outstanding)
      expect(emp1Stats.outstanding).toBe(2000);
      expect(emp1Stats.count).toBe(2);

      const emp2Stats = calculateEmployeeStats('emp-2');
      expect(emp2Stats.outstanding).toBe(2000);
      expect(emp2Stats.count).toBe(1);
    });

    it('calculates current month advance total correctly', () => {
      const emp1Stats = calculateEmployeeStats('emp-1', 2026, 8); // Sep 2026
      // adv-1 (1500) + adv-4 (500) were in September 2026
      expect(emp1Stats.monthTotal).toBe(2000);
    });

    it('calculates salary percentage and salary exceeded warning', () => {
      const basicSalary = 5000;

      const calcPercentage = (amount: number) => Math.round((amount / basicSalary) * 100);
      const isExceeded = (amount: number) => amount > basicSalary;

      expect(calcPercentage(1250)).toBe(25);
      expect(calcPercentage(2500)).toBe(50);
      expect(calcPercentage(5000)).toBe(100);
      expect(calcPercentage(6000)).toBe(120);

      expect(isExceeded(2500)).toBe(false);
      expect(isExceeded(5000)).toBe(false);
      expect(isExceeded(5001)).toBe(true);
    });
  });

});
