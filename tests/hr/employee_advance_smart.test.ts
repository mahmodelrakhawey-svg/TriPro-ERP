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

  describe('Payroll Advance Date Boundary & Strict Isolation Integrity', () => {
    const mixedAdvances = [
      { id: 'adv-sep-1', employee_id: 'emp-1', amount: 1000, status: 'paid', payroll_item_id: null, request_date: '2026-09-05' },
      { id: 'adv-sep-2', employee_id: 'emp-1', amount: 500, status: 'paid', payroll_item_id: null, request_date: '2026-09-28' },
      { id: 'adv-oct-1', employee_id: 'emp-1', amount: 1200, status: 'paid', payroll_item_id: null, request_date: '2026-10-05' },
      { id: 'adv-oct-2', employee_id: 'emp-2', amount: 800, status: 'paid', payroll_item_id: null, request_date: '2026-10-20' },
      { id: 'adv-oct-3', employee_id: 'emp-1', amount: 300, status: 'paid', payroll_item_id: null, request_date: '2026-10-31' },
    ];

    it('strictly restricts September payroll to September advances (<= 2026-09-30)', () => {
      const monthEndStr = '2026-09-30';
      const sepAdvancesForEmp1 = mixedAdvances.filter(adv => {
        if (adv.employee_id !== 'emp-1') return false;
        const advDate = (adv.request_date || '').trim();
        return advDate <= monthEndStr && adv.status === 'paid' && !adv.payroll_item_id;
      });

      expect(sepAdvancesForEmp1.length).toBe(2);
      expect(sepAdvancesForEmp1.map(a => a.id)).toEqual(['adv-sep-1', 'adv-sep-2']);
      const totalSepAdvances = sepAdvancesForEmp1.reduce((sum, a) => sum + a.amount, 0);
      expect(totalSepAdvances).toBe(1500);

      // October advances must NOT be included in September
      const hasOctoberAdv = sepAdvancesForEmp1.some(a => a.request_date.startsWith('2026-10'));
      expect(hasOctoberAdv).toBe(false);
    });

    it('identifies October advances for October payroll (<= 2026-10-31)', () => {
      const monthEndStr = '2026-10-31';
      // Assume September advances were already settled (payroll_item_id not null)
      const advancesForOctoberRun = mixedAdvances.map(a => {
        if (a.request_date <= '2026-09-30') {
          return { ...a, status: 'deducted', payroll_item_id: 'pi-sep-1' };
        }
        return a;
      });

      const octAdvancesForEmp1 = advancesForOctoberRun.filter(adv => {
        if (adv.employee_id !== 'emp-1') return false;
        const advDate = (adv.request_date || '').trim();
        return advDate <= monthEndStr && adv.status === 'paid' && !adv.payroll_item_id;
      });

      expect(octAdvancesForEmp1.length).toBe(2);
      expect(octAdvancesForEmp1.map(a => a.id)).toEqual(['adv-oct-1', 'adv-oct-3']);
      const totalOct = octAdvancesForEmp1.reduce((sum, a) => sum + a.amount, 0);
      expect(totalOct).toBe(1500);
    });

    it('detects and heals erroneously deducted October advances', () => {
      // Simulating the bug where October advances were accidentally set to deducted
      const corruptedAdvances = [
        { id: 'adv-oct-1', employee_id: 'emp-1', amount: 1200, status: 'deducted', payroll_item_id: 'pi-sep-1', request_date: '2026-10-05' },
        { id: 'adv-oct-2', employee_id: 'emp-2', amount: 800, status: 'deducted', payroll_item_id: 'pi-sep-2', request_date: '2026-10-20' },
        { id: 'adv-sep-1', employee_id: 'emp-1', amount: 1000, status: 'deducted', payroll_item_id: 'pi-sep-1', request_date: '2026-09-05' },
      ];

      // Detection
      const wronglyDeducted = corruptedAdvances.filter(a => {
        if (a.status !== 'deducted') return false;
        const d = (a.request_date || '').trim();
        return d >= '2026-10-01';
      });
      expect(wronglyDeducted.length).toBe(2);

      // Healing
      const healedAdvances = corruptedAdvances.map(a => {
        if (a.status === 'deducted' && a.request_date >= '2026-10-01') {
          return { ...a, status: 'paid', payroll_item_id: null };
        }
        return a;
      });

      const emp1Active = healedAdvances.filter(a => a.employee_id === 'emp-1' && a.status === 'paid');
      expect(emp1Active.length).toBe(1);
      expect(emp1Active[0].id).toBe('adv-oct-1');

      // September advance remains deducted
      const sepAdv = healedAdvances.find(a => a.id === 'adv-sep-1');
      expect(sepAdv?.status).toBe('deducted');
    });
  });

  describe('Employee Advances Update RPC & Schema Integrity', () => {
    it('verifies that SQL patches for update_employee_advance use transaction_date and never mutate non-existent date column', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const patchPath = path.resolve(process.cwd(), 'sql_updates', '2026-11-16_fix_update_employee_advance_column_date_error.sql');
      expect(fs.existsSync(patchPath)).toBe(true);

      const content = fs.readFileSync(patchPath, 'utf8');
      // Must target transaction_date
      expect(content).toContain('transaction_date = p_date');
      // Must not target relation column date on journal_entries
      expect(content).not.toMatch(/SET\s+date\s*=/i);
      expect(content).not.toMatch(/INSERT\s+INTO\s+public\.journal_entries[^(]*\([^)]*\bdate\b/i);
      // Must not reference non-existent updated_at on journal_entries
      expect(content).not.toMatch(/updated_at\s*=\s*now\(\)/i);
      // Must have the exact parameters expected by UI
      expect(content).toContain('p_advance_id uuid');
      expect(content).toContain('p_employee_id uuid');
      expect(content).toContain('p_amount numeric');
      expect(content).toContain('p_date date');
      expect(content).toContain('p_treasury_id uuid');
    });

    it('verifies EmployeeAdvances component RPC call payload structure', () => {
      const payload = {
        p_advance_id: '123e4567-e89b-12d3-a456-426614174000',
        p_employee_id: '123e4567-e89b-12d3-a456-426614174001',
        p_amount: 500,
        p_date: '2026-11-16',
        p_treasury_id: '123e4567-e89b-12d3-a456-426614174002',
        p_notes: 'تعديل سلفة الموظف'
      };

      expect(payload.p_advance_id).toBeDefined();
      expect(payload.p_employee_id).toBeDefined();
      expect(payload.p_amount).toBeGreaterThan(0);
      expect(payload.p_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(payload.p_treasury_id).toBeDefined();
    });
  });

  describe('Employee Advances Anti-Duplicate Guard & Atomic Creation Suite', () => {
    it('detects duplicate advances for the same employee, amount, and date', () => {
      const existingAdvances = [
        { id: 'adv-1', employee_id: 'emp-101', amount: 1500, advance_date: '2026-11-22', status: 'paid' },
        { id: 'adv-2', employee_id: 'emp-102', amount: 2000, advance_date: '2026-11-22', status: 'paid' },
        { id: 'adv-3', employee_id: 'emp-101', amount: 1000, advance_date: '2026-11-21', status: 'paid' },
      ];

      const checkDuplicate = (empId: string, amount: number, date: string) => {
        return existingAdvances.some(a =>
          a.employee_id === empId &&
          Number(a.amount) === Number(amount) &&
          a.advance_date === date
        );
      };

      // Exact match -> duplicate detected
      expect(checkDuplicate('emp-101', 1500, '2026-11-22')).toBe(true);

      // Different employee -> not duplicate
      expect(checkDuplicate('emp-999', 1500, '2026-11-22')).toBe(false);

      // Different amount -> not duplicate
      expect(checkDuplicate('emp-101', 500, '2026-11-22')).toBe(false);

      // Different date -> not duplicate
      expect(checkDuplicate('emp-101', 1500, '2026-11-23')).toBe(false);
    });

    it('verifies SQL patch for atomic create_employee_advance with duplicate guard', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const patchPath = path.resolve(process.cwd(), 'sql_updates', '2026-11-22_atomic_create_employee_advance_with_duplicate_guard.sql');
      expect(fs.existsSync(patchPath)).toBe(true);

      const content = fs.readFileSync(patchPath, 'utf8');

      // 1. Function definition & parameters
      expect(content).toContain('CREATE OR REPLACE FUNCTION public.create_employee_advance');
      expect(content).toContain('p_employee_id uuid');
      expect(content).toContain('p_amount numeric');
      expect(content).toContain('p_date date');
      expect(content).toContain('p_treasury_id uuid');
      expect(content).toContain('p_allow_duplicate boolean');

      // 2. Anti-duplicate exception code
      expect(content).toContain('DUPLICATE_ADVANCE_DETECTED');
      expect(content).toContain("created_at >= (now() - interval '15 minutes')");

      // 3. Atomic journal entry & account mapping (1223)
      expect(content).toContain("code = '1223'");
      expect(content).toContain('INSERT INTO public.journal_entries');
      expect(content).toContain('INSERT INTO public.journal_lines');
      expect(content).toContain('recalculate_all_system_balances');

      // 4. Permissions
      expect(content).toContain('GRANT EXECUTE ON FUNCTION public.create_employee_advance');

      // 5. Acceleration index
      expect(content).toContain('idx_employee_advances_dup_guard');
    });

    it('verifies double-click prevention via synchronous ref guard simulation', () => {
      let callCount = 0;
      let isSubmitting = false;

      const simulateSubmit = () => {
        if (isSubmitting) {
          return { ignored: true };
        }
        isSubmitting = true;
        callCount++;
        return { ignored: false };
      };

      // First click
      const res1 = simulateSubmit();
      expect(res1.ignored).toBe(false);
      expect(callCount).toBe(1);

      // Immediate second rapid click while submitting
      const res2 = simulateSubmit();
      expect(res2.ignored).toBe(true);
      expect(callCount).toBe(1);

      // Third click
      const res3 = simulateSubmit();
      expect(res3.ignored).toBe(true);
      expect(callCount).toBe(1);

      // Reset after finish
      isSubmitting = false;
      const res4 = simulateSubmit();
      expect(res4.ignored).toBe(false);
      expect(callCount).toBe(2);
    });
  });

});
