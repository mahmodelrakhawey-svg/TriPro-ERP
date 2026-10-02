import { logger } from '../../../utils/logger';
import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../../../supabaseClient';
import { useAccounting, SYSTEM_ACCOUNTS } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import { hrEnterpriseService } from '../../../services/hrEnterpriseService';
import { PayslipModal, PayslipData } from './PayslipModal';
import {
  Banknote,
  Play,
  Loader2,
  Save,
  User,
  Wallet,
  Calendar,
  AlertCircle,
  Clock,
  CheckCircle2,
  Info,
  Printer,
  ShieldAlert,
  Award,
  FileSpreadsheet,
  Building2,
  Filter
} from 'lucide-react';
import {
  payrollRunSchema,
  payrollItemSchema,
  payrollAccrualSchema,
  payrollDisbursementSchema
} from '../../../utils/validationSchemas';

type PayrollItem = {
  employee_id: string;
  full_name: string;
  department?: string;
  gross_salary: number;
  additions: number;
  advances_deducted: number;
  payroll_tax: number;
  other_deductions: number;
  net_salary: number;
  advances_ids: string[];
  unpaid_leave_days: number;
  unpaid_leave_deduction: number;
  absence_days: number;
  overtime_hours: number;
  penalty_amount?: number;
  reward_amount?: number;
};

const PayrollRun = () => {
  const {
    runPayroll: runPayrollFromContext,
    runPayrollAccrual,
    payAccruedPayroll,
    currentUser,
    currentSelectedOrgId,
    accounts,
    createMissingSystemAccounts,
    selectedFiscalYear,
    organization
  } = useAccounting();

  const { showToast } = useToast();
  const [payrollData, setPayrollData] = useState<PayrollItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingAccrual, setSavingAccrual] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(selectedFiscalYear || new Date().getFullYear());
  const [treasuryId, setTreasuryId] = useState('');
  const [treasuryAccounts, setTreasuryAccounts] = useState<any[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState('all');

  // Function to calculate last day of a month
  const getLastDayOfMonth = (year: number, month: number) => {
    const lastDay = new Date(year, month, 0).getDate();
    return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  };

  const [accrualDate, setAccrualDate] = useState(() =>
    getLastDayOfMonth(selectedFiscalYear || new Date().getFullYear(), new Date().getMonth() + 1)
  );
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Existing Payroll in DB for selected month & year
  const [existingPayroll, setExistingPayroll] = useState<any | null>(null);
  const [checkingExisting, setCheckingExisting] = useState(false);

  // Payslip Modal State
  const [selectedPayslip, setSelectedPayslip] = useState<PayslipData | null>(null);

  // Ù…Ø²Ø§Ù…Ù†Ø© Ø§Ù„Ø³Ù†Ø© Ø§Ù„Ù…Ø®ØªØ§Ø±Ø© Ù…Ø¹ Ø§Ù„Ø³Ù†Ø© Ø§Ù„Ù…Ø§Ù„ÙŠØ© Ù„Ù„Ù†Ø¸Ø§Ù…
  useEffect(() => {
    if (selectedFiscalYear) {
      setSelectedYear(selectedFiscalYear);
    }
  }, [selectedFiscalYear]);

  // Ø¬Ù„Ø¨ Ø§Ù„Ø®Ø²Ø§Ø¦Ù† ÙˆØ§Ù„Ø¨Ù†ÙˆÙƒ Ø§Ù„Ù…ØªØ§Ø­Ø©
  useEffect(() => {
    const fetchTreasuries = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id || currentSelectedOrgId || (currentUser as any)?.organization_id;
      
      let query = supabase
        .from('accounts')
        .select('id, name, code')
        .ilike('type', '%asset%')
        .or('code.like.123%,code.like.101%,name.ilike.%ØµÙ†Ø¯ÙˆÙ‚%,name.ilike.%Ø®Ø²ÙŠÙ†Ø©%,name.ilike.%Ø¨Ù†Ùƒ%');
      
      if (userOrgId) {
        query = query.eq('organization_id', userOrgId);
      }
      const { data } = await query;
      if (data) setTreasuryAccounts(data);
    };
    fetchTreasuries();
  }, [currentSelectedOrgId, currentUser]);

  // ÙØ­Øµ Ù…Ø§ Ø¥Ø°Ø§ ÙƒØ§Ù† Ù‡Ù†Ø§Ùƒ Ù…Ø³ÙŠØ± Ù…Ø³Ø¬Ù„ Ø³Ø§Ø¨Ù‚Ø§Ù‹ Ù„Ù†ÙØ³ Ø§Ù„Ø´Ù‡Ø± ÙˆØ§Ù„Ø³Ù†Ø©
  const fetchExistingPayroll = async (month: number, year: number) => {
    setCheckingExisting(true);
    try {
      const targetOrg = currentSelectedOrgId || (currentUser as any)?.organization_id;
      let query = supabase
        .from('payrolls')
        .select('*')
        .eq('payroll_month', month)
        .eq('payroll_year', year);

      if (targetOrg) {
        query = query.eq('organization_id', targetOrg);
      }

      const { data, error } = await query.order('created_at', { ascending: false }).limit(1);

      if (error) {
        logger.error("Error fetching payroll:", error);
        return;
      }

      if (data && data.length > 0) {
        const payroll = data[0];
        setExistingPayroll(payroll);
        if (payroll.accrual_date) setAccrualDate(payroll.accrual_date);
        if (payroll.payment_date) setPaymentDate(payroll.payment_date);
        if (payroll.treasury_account_id) setTreasuryId(payroll.treasury_account_id);

        // Ø¬Ù„Ø¨ Ø¨Ù†ÙˆØ¯ Ø§Ù„Ù…Ø³ÙŠØ± Ø§Ù„Ù…Ø³Ø¬Ù„Ø© Ø¥Ø°Ø§ ÙƒØ§Ù†Øª Ø§Ù„Ø´Ø§Ø´Ø© ÙØ§Ø±ØºØ©
        const { data: items } = await supabase
          .from('payroll_items')
          .select('*, employees(full_name, position, department)')
          .eq('payroll_id', payroll.id);

        if (items && items.length > 0) {
          const mappedItems: PayrollItem[] = items.map((it: Record<string, any>) => ({
            employee_id: it.employee_id,
            full_name: it.employees?.full_name || 'Ù…ÙˆØ¸Ù',
            department: it.employees?.department || '-',
            gross_salary: Number(it.gross_salary || 0),
            additions: Number(it.additions || 0),
            advances_deducted: Number(it.advances_deducted || 0),
            payroll_tax: Number(it.payroll_tax || 0),
            other_deductions: Number(it.other_deductions || 0),
            net_salary: Number(it.net_salary || 0),
            advances_ids: [],
            unpaid_leave_days: 0,
            unpaid_leave_deduction: 0,
            absence_days: 0,
            overtime_hours: 0
          }));
          setPayrollData(mappedItems);
        }
      } else {
        setExistingPayroll(null);
      }
    } catch (err) {
      logger.error(err);
    } finally {
      setCheckingExisting(false);
    }
  };

  useEffect(() => {
    setAccrualDate(getLastDayOfMonth(selectedYear, selectedMonth));
    fetchExistingPayroll(selectedMonth, selectedYear);
  }, [selectedMonth, selectedYear, currentSelectedOrgId, currentUser]);

  const preparePayroll = async () => {
    setLoading(true);
    try {
      const targetOrg = currentSelectedOrgId || (currentUser as any)?.organization_id;

      // Ø§Ù„ØªØ­Ù‚Ù‚ Ù…Ù† ÙˆØ¬ÙˆØ¯ Ù…Ø³ÙŠØ± Ø³Ø§Ø¨Ù‚ Ù„Ù†ÙØ³ Ø§Ù„Ø´Ù‡Ø±
      if (existingPayroll?.status === 'paid') {
        if (!window.confirm(`ØªÙ†Ø¨ÙŠÙ‡: Ù…Ø³ÙŠØ± Ø±ÙˆØ§ØªØ¨ Ø´Ù‡Ø± ${selectedMonth}/${selectedYear} ØªÙ… ØµØ±ÙÙ‡ Ø¨Ø§Ù„ÙƒØ§Ù…Ù„ Ù…Ø³Ø¨Ù‚Ø§Ù‹.\nÙ‡Ù„ ØªØ±ÙŠØ¯ Ø¥Ø¹Ø§Ø¯Ø© Ø§Ø­ØªØ³Ø§Ø¨ ÙˆØªØ¬Ù‡ÙŠØ² Ø§Ù„Ø¨ÙŠØ§Ù†Ø§ØªØŸ`)) {
          setLoading(false);
          return;
        }
      } else if (existingPayroll?.status === 'accrued') {
        if (!window.confirm(`ØªÙ†Ø¨ÙŠÙ‡: ÙŠÙˆØ¬Ø¯ Ù…Ø³ÙŠØ± Ù…Ø³Ø¬Ù„ ÙƒÙ€ [Ø§Ø³ØªØ­Ù‚Ø§Ù‚ Ù…Ø¹ØªÙ…Ø¯] Ù„Ø´Ù‡Ø± ${selectedMonth}/${selectedYear}.\nÙ‡Ù„ ØªØ±ÙŠØ¯ Ø¥Ø¹Ø§Ø¯Ø© Ø§Ø­ØªØ³Ø§Ø¨ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª ÙˆØªØ­Ø¯ÙŠØ« Ù‚ÙŠØ¯ Ø§Ù„Ø§Ø³ØªØ­Ù‚Ø§Ù‚ØŸ`)) {
          setLoading(false);
          return;
        }
      }

      // ØªØ­Ø¯ÙŠØ¯ Ø§Ù„Ù†Ø·Ø§Ù‚ Ø§Ù„Ø²Ù…Ù†ÙŠ Ù„Ø´Ù‡Ø± Ø§Ù„Ù…Ø³ÙŠØ±
      const monthStartStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
      const lastDayNumber = new Date(selectedYear, selectedMonth, 0).getDate();
      const monthEndStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDayNumber).padStart(2, '0')}`;

      // ðŸ›¡ï¸ Ø¹Ø²Ù„ Ù†Ø·Ø§Ù‚ Ø§Ù„Ø¥Ø´Ø±Ø§Ù Ù„Ù„Ù…ÙˆØ§Ø±Ø¯ Ø§Ù„Ø¨Ø´Ø±ÙŠØ© ÙˆØ§Ù„Ø±ÙˆØ§ØªØ¨ (HR Supervisory Scope)
      let empQuery = supabase.from('employees').select('*').eq('status', 'active').eq('organization_id', targetOrg);
      const hrScope = currentUser?.hr_scope || (currentUser as any)?.user_metadata?.hr_scope || 'all';

      const isFactoryDept = (dept: Record<string, any>) => {
        const d = String(dept || '').trim().toLowerCase();
        return d === 'Ø§Ù„Ù…ØµÙ†Ø¹' || d === 'Ù…ØµÙ†Ø¹' || d === 'factory';
      };

      if (hrScope === 'factory') {
        empQuery = empQuery.in('department', ['Ø§Ù„Ù…ØµÙ†Ø¹', 'Ù…ØµÙ†Ø¹']);
      } else if (hrScope === 'branches') {
        empQuery = empQuery.not('department', 'in', '("Ø§Ù„Ù…ØµÙ†Ø¹","Ù…ØµÙ†Ø¹")');
      }

      // Ø¬Ù„Ø¨ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø¨Ø§Ù„ØªÙˆØ§Ø²ÙŠ: Ø§Ù„Ù…ÙˆØ¸ÙÙŠÙ†ØŒ Ø§Ù„Ø³Ù„ÙØŒ Ø§Ù„Ø¥Ø¬Ø§Ø²Ø§ØªØŒ Ø§Ù„Ø­Ø¶ÙˆØ±ØŒ Ø§Ù„Ø¬Ø²Ø§Ø¡Ø§Øª ÙˆØ§Ù„Ù…ÙƒØ§ÙØ¢Øª
      const [empRes, advRes, leavesRes, attRes, penRes] = await Promise.all([
        empQuery,
        supabase.from('employee_advances').select('*').eq('status', 'paid').is('payroll_item_id', null).eq('organization_id', targetOrg),
        supabase.from('hr_leave_requests').select('*').eq('organization_id', targetOrg).eq('status', 'APPROVED'),
        supabase.from('hr_attendance_logs').select('*').eq('organization_id', targetOrg).gte('log_date', monthStartStr).lte('log_date', monthEndStr),
        hrEnterpriseService.getPenaltiesRewards(targetOrg)
      ]);

      if (empRes.error) throw empRes.error;
      const rawEmployees = empRes.data || [];
      const employees = hrScope === 'factory'
        ? rawEmployees.filter(e => isFactoryDept(e.department))
        : hrScope === 'branches'
          ? rawEmployees.filter(e => !isFactoryDept(e.department))
          : rawEmployees;
      const advances = advRes.data || [];
      const approvedLeaves = leavesRes.data || [];
      const attendanceLogs = attRes.data || [];
      const penaltiesRewards = penRes || [];

      const preparedData: PayrollItem[] = employees.map(emp => {
        const basicSalary = Number(emp.basic_salary || 0);
        const dailyRate = basicSalary > 0 ? basicSalary / 30 : 0;
        const hourlyRate = dailyRate > 0 ? dailyRate / 8 : 0;

        // Ø£) Ø§Ù„Ø³Ù„Ù ØºÙŠØ± Ø§Ù„Ù…Ø®ØµÙˆÙ…Ø©
        const empAdvances = advances.filter(adv => adv.employee_id === emp.id);
        const totalAdvances = empAdvances.reduce((sum, adv) => sum + Number(adv.amount || 0), 0);

        // Ø¨) Ø§Ù„Ø¥Ø¬Ø§Ø²Ø§Øª Ø¨Ø¯ÙˆÙ† Ø±Ø§ØªØ¨ Ø§Ù„Ù…Ø¹ØªÙ…Ø¯Ø© Ù„Ø´Ù‡Ø± Ø§Ù„Ù…Ø³ÙŠØ±
        const empUnpaidLeaves = approvedLeaves.filter(
          l => l.employee_id === emp.id && (l.leave_type === 'UNPAID' || l.is_paid === false)
        );

        let totalUnpaidLeaveDays = 0;
        empUnpaidLeaves.forEach(leave => {
          const reqStart = leave.start_date;
          const reqEnd = leave.end_date;
          const overlapStart = reqStart > monthStartStr ? reqStart : monthStartStr;
          const overlapEnd = reqEnd < monthEndStr ? reqEnd : monthEndStr;

          if (overlapStart <= overlapEnd) {
            const d1 = new Date(overlapStart).getTime();
            const d2 = new Date(overlapEnd).getTime();
            const days = Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
            totalUnpaidLeaveDays += Math.max(0, days);
          }
        });

        const unpaidLeaveDeduction = Math.round(totalUnpaidLeaveDays * dailyRate * 100) / 100;

        // Ø¬) Ø³Ø¬Ù„Ø§Øª Ø§Ù„ØºÙŠØ§Ø¨ ØºÙŠØ± Ø§Ù„Ù…Ø¨Ø±Ø± ÙˆØ³Ø§Ø¹Ø§Øª Ø§Ù„Ø¥Ø¶Ø§ÙÙŠ
        const empAttendance = attendanceLogs.filter(att => att.employee_id === emp.id);
        const absenceDays = empAttendance.filter(a => a.status === 'ABSENT').length;
        const absenceDeduction = Math.round(absenceDays * dailyRate * 100) / 100;

        const totalOvertimeHours = empAttendance.reduce((sum, a) => sum + Number(a.overtime_hours || 0), 0);
        const overtimePay = Math.round(totalOvertimeHours * hourlyRate * 1.5 * 100) / 100;

        // Ø¯) Ø§Ù„Ø¬Ø²Ø§Ø¡Ø§Øª ÙˆØ§Ù„Ù…ÙƒØ§ÙØ¢Øª Ø§Ù„Ù…Ø¹ØªÙ…Ø¯Ø© Ø®Ù„Ø§Ù„ Ø§Ù„Ø´Ù‡Ø±
        const empPenaltiesRewards = penaltiesRewards.filter(pr => {
          if (pr.employee_id !== emp.id) return false;
          if (pr.status && pr.status !== 'APPROVED') return false;
          const actionDate = pr.created_at || pr.action_date || '';
          return actionDate >= monthStartStr && actionDate <= monthEndStr;
        });

        const totalPenaltyAmount = empPenaltiesRewards
          .filter(pr => pr.type === 'PENALTY')
          .reduce((sum, pr) => sum + Number(pr.calculated_amount || pr.amount_value || (pr as any).amount || 0), 0);

        const totalRewardAmount = empPenaltiesRewards
          .filter(pr => pr.type === 'REWARD')
          .reduce((sum, pr) => sum + Number(pr.calculated_amount || pr.amount_value || (pr as any).amount || 0), 0);

        // Ù‡Ù€) Ø§Ù„ØªØ¬Ù…ÙŠØ¹ Ø§Ù„Ù†Ù‡Ø§Ø¦ÙŠ Ù„Ù„Ø¥Ø¶Ø§ÙÙŠ ÙˆØ§Ù„Ø§Ø³ØªÙ‚Ø·Ø§Ø¹Ø§Øª
        const additions = overtimePay + totalRewardAmount;
        const otherDeductions = unpaidLeaveDeduction + absenceDeduction + totalPenaltyAmount;

        // Ùˆ) Ø¶Ø±ÙŠØ¨Ø© ÙƒØ³Ø¨ Ø§Ù„Ø¹Ù…Ù„ Ø§Ù„ØªÙ‚Ø¯ÙŠØ±ÙŠØ© (Ø§ÙØªØ±Ø§Ø¶ÙŠØ§Ù‹ 0 Ø£Ùˆ Ø­Ø³Ø¨ Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª)
        const payrollTax = 0;

        const netSalary = Math.max(0, Math.round((basicSalary + additions - totalAdvances - otherDeductions - payrollTax) * 100) / 100);

        return {
          employee_id: emp.id,
          full_name: emp.full_name,
          department: emp.department || '-',
          gross_salary: basicSalary,
          additions,
          advances_deducted: totalAdvances,
          payroll_tax: payrollTax,
          other_deductions: otherDeductions,
          net_salary: netSalary,
          advances_ids: empAdvances.map(a => a.id),
          unpaid_leave_days: totalUnpaidLeaveDays,
          unpaid_leave_deduction: unpaidLeaveDeduction,
          absence_days: absenceDays,
          overtime_hours: totalOvertimeHours,
          penalty_amount: totalPenaltyAmount,
          reward_amount: totalRewardAmount
        };
      });

      setPayrollData(preparedData);
      showToast(`ØªÙ… Ø§Ø­ØªØ³Ø§Ø¨ Ù…Ø³ÙŠØ± Ø±ÙˆØ§ØªØ¨ Ø´Ù‡Ø± ${selectedMonth}/${selectedYear} Ø¨Ù†Ø¬Ø§Ø­ Ù„Ø¹Ø¯Ø¯ ${preparedData.length} Ù…ÙˆØ¸Ù.`, 'success');
    } catch (err) {
      logger.error(err);
      showToast('Ø­Ø¯Ø« Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ Ø§Ø­ØªØ³Ø§Ø¨ Ø§Ù„Ù…Ø³ÙŠØ±: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGrossChange = (employeeId: string, value: number) => {
    setPayrollData(prev => prev.map(emp => {
      if (emp.employee_id === employeeId) {
        const newNet = value + emp.additions - emp.advances_deducted - emp.other_deductions - emp.payroll_tax;
        return { ...emp, gross_salary: value, net_salary: Math.round(newNet * 100) / 100 };
      }
      return emp;
    }));
  };

  const handleAdditionsChange = (employeeId: string, value: number) => {
    setPayrollData(prev => prev.map(emp => {
      if (emp.employee_id === employeeId) {
        const newNet = emp.gross_salary + value - emp.advances_deducted - emp.other_deductions - emp.payroll_tax;
        return { ...emp, additions: value, net_salary: Math.round(newNet * 100) / 100 };
      }
      return emp;
    }));
  };

  const handleDeductionChange = (employeeId: string, value: number) => {
    setPayrollData(prev => prev.map(emp => {
      if (emp.employee_id === employeeId) {
        const newNet = emp.gross_salary + emp.additions - emp.advances_deducted - value - emp.payroll_tax;
        return { ...emp, other_deductions: value, net_salary: Math.round(newNet * 100) / 100 };
      }
      return emp;
    }));
  };

  const handleTaxChange = (employeeId: string, value: number) => {
    setPayrollData(prev => prev.map(emp => {
      if (emp.employee_id === employeeId) {
        const newNet = emp.gross_salary + emp.additions - emp.advances_deducted - emp.other_deductions - value;
        return { ...emp, payroll_tax: value, net_salary: Math.round(newNet * 100) / 100 };
      }
      return emp;
    }));
  };

  // Ø§Ù„ØªØ­Ù‚Ù‚ Ù…Ù† Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ù…Ø·Ù„ÙˆØ¨Ø©
  const checkRequiredAccounts = async () => {
    const requiredAccounts = [
      { code: SYSTEM_ACCOUNTS.SALARIES_EXPENSE, name: 'Ø§Ù„Ø±ÙˆØ§ØªØ¨ ÙˆØ§Ù„Ø£Ø¬ÙˆØ±' },
      { code: SYSTEM_ACCOUNTS.EMPLOYEE_BONUSES, name: 'Ù…ÙƒØ§ÙØ¢Øª ÙˆØ­ÙˆØ§ÙØ²' },
      { code: SYSTEM_ACCOUNTS.EMPLOYEE_DEDUCTIONS, name: 'Ø®ØµÙˆÙ…Ø§Øª ÙˆØ¬Ø²Ø§Ø¡Ø§Øª' },
      { code: SYSTEM_ACCOUNTS.EMPLOYEE_ADVANCES, name: 'Ø³Ù„Ù Ø§Ù„Ù…ÙˆØ¸ÙÙŠÙ†' },
      { code: SYSTEM_ACCOUNTS.PAYROLL_TAX, name: 'Ø¶Ø±ÙŠØ¨Ø© ÙƒØ³Ø¨ Ø§Ù„Ø¹Ù…Ù„' },
      { code: SYSTEM_ACCOUNTS.ACCRUED_SALARIES, name: 'Ø±ÙˆØ§ØªØ¨ ÙˆØ£Ø¬ÙˆØ± Ù…Ø³ØªØ­Ù‚Ø©' }
    ];

    const missingAccounts = requiredAccounts.filter(req => !accounts.find(a => a.code === req.code));

    if (missingAccounts.length > 0) {
      const confirmCreate = window.confirm(
        `Ø¹Ø°Ø±Ø§Ù‹ØŒ Ù„Ø§ ÙŠÙ…ÙƒÙ† Ø¥ØªÙ…Ø§Ù… Ø§Ù„Ø¹Ù…Ù„ÙŠØ©.\nØ§Ù„Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„ØªØ§Ù„ÙŠØ© ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯Ø© ÙÙŠ Ø§Ù„Ø¯Ù„ÙŠÙ„ Ø§Ù„Ù…Ø­Ø§Ø³Ø¨ÙŠ:\n${missingAccounts.map(a => `- ${a.name} (ÙƒÙˆØ¯: ${a.code})`).join('\n')}\n\nÙ‡Ù„ ØªØ±ÙŠØ¯ Ø¥Ù†Ø´Ø§Ø¡ Ù‡Ø°Ù‡ Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ Ø§Ù„Ø¢Ù†ØŸ`
      );

      if (confirmCreate) {
        try {
          const result = await createMissingSystemAccounts();
          if (result?.success) {
            showToast(result.message + "\nØªÙ… ØªØ­Ø¯ÙŠØ« Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª Ø¨Ù†Ø¬Ø§Ø­. ÙŠÙ…ÙƒÙ†Ùƒ Ø§Ù„Ø¢Ù† Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø©.", 'success');
          } else {
            showToast('ØªÙ… ØªØ­Ø¯ÙŠØ« Ø¯Ù„ÙŠÙ„ Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª. ÙŠØ±Ø¬Ù‰ Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø© Ù…Ø±Ø© Ø£Ø®Ø±Ù‰.', 'info');
          }
        } catch (error) {
          showToast('Ø­Ø¯Ø« Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª: ' + error.message, 'error');
        }
      }
      return false;
    }
    return true;
  };

  // 1ï¸âƒ£ Ø¥Ø«Ø¨Ø§Øª Ù‚ÙŠØ¯ Ø§Ù„Ø§Ø³ØªØ­Ù‚Ø§Ù‚ (Ù†Ù‡Ø§ÙŠØ© Ø§Ù„Ø´Ù‡Ø± - Ø­Ù€/ 2251)
  const handleRunAccrual = async () => {
    const accrualValidation = payrollAccrualSchema.safeParse({
      hasData: payrollData.length > 0,
      month: selectedMonth,
      year: selectedYear
    });

    if (!accrualValidation.success) {
      showToast(accrualValidation.error.issues[0].message, 'warning');
      return;
    }

    for (const item of payrollData) {
      const itemValidationResult = payrollItemSchema.safeParse(item);
      if (!itemValidationResult.success) {
        showToast(`Ø®Ø·Ø£ ÙÙŠ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…ÙˆØ¸Ù ${item.full_name}: ${itemValidationResult.error.issues[0].message}`, 'warning');
        return;
      }
    }

    const accountsOk = await checkRequiredAccounts();
    if (!accountsOk) return;

    const confirmMsg = `ØªØ£ÙƒÙŠØ¯ ØªØ±Ø­ÙŠÙ„ Ù‚ÙŠØ¯ Ø§Ø³ØªØ­Ù‚Ø§Ù‚ Ø§Ù„Ø±ÙˆØ§ØªØ¨ Ù„Ø´Ù‡Ø± ${selectedMonth}/${selectedYear}:\n` +
      `- ØªØ§Ø±ÙŠØ® Ø§Ù„Ø§Ø³ØªØ­Ù‚Ø§Ù‚: ${accrualDate}\n` +
      `- Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„ØµØ§ÙÙŠ Ø§Ù„Ù…Ø³ØªØ­Ù‚: ${totals.net.toLocaleString()} Ø¬.Ù…\n` +
      `- Ø§Ù„Ø­Ø³Ø§Ø¨ Ø§Ù„Ø¯Ø§Ø¦Ù†: (2251) Ø±ÙˆØ§ØªØ¨ ÙˆØ£Ø¬ÙˆØ± Ù…Ø³ØªØ­Ù‚Ø©\n\n` +
      `ðŸ’¡ Ù…Ù„Ø§Ø­Ø¸Ø©: ÙŠØ«Ø¨Øª Ù‡Ø°Ø§ Ø§Ù„Ù‚ÙŠØ¯ Ù…ØµØ±ÙˆÙ Ø§Ù„Ø±ÙˆØ§ØªØ¨ Ø¨Ù†Ù‡Ø§ÙŠØ© Ø§Ù„Ø´Ù‡Ø± Ø¯ÙˆÙ† Ø®ØµÙ… Ø£ÙŠ Ù†Ù‚Ø¯ÙŠØ© Ù…Ù† Ø§Ù„Ø®Ø²ÙŠÙ†Ø© Ø­ØªÙ‰ ØªØ§Ø±ÙŠØ® Ø§Ù„ØµØ±Ù Ø§Ù„ÙØ¹Ù„ÙŠ.\n\nÙ‡Ù„ ØªØ±ÙŠØ¯ Ø§Ù„Ù…ØªØ§Ø¨Ø¹Ø©ØŸ`;

    if (!window.confirm(confirmMsg)) return;

    setSavingAccrual(true);
    try {
      const orgId = currentSelectedOrgId || (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;
      await runPayrollAccrual(
        selectedMonth,
        selectedYear,
        accrualDate,
        payrollData,
        orgId
      );

      showToast(`ØªÙ… ØªØ±Ø­ÙŠÙ„ Ù‚ÙŠØ¯ Ø§Ø³ØªØ­Ù‚Ø§Ù‚ Ø±ÙˆØ§ØªØ¨ Ø´Ù‡Ø± ${selectedMonth}/${selectedYear} Ø¨Ù†Ø¬Ø§Ø­ (Ø­Ù€/ 2251 Ø¯Ø§Ø¦Ù†) ðŸ“‹âœ…`, 'success');
      await fetchExistingPayroll(selectedMonth, selectedYear);
    } catch (error) {
      logger.error(error);
      showToast('ÙØ´Ù„ ØªØ±Ø­ÙŠÙ„ Ù‚ÙŠØ¯ Ø§Ù„Ø§Ø³ØªØ­Ù‚Ø§Ù‚: ' + error.message, 'error');
    } finally {
      setSavingAccrual(false);
    }
  };

  // 2ï¸âƒ£ ØµØ±Ù Ø§Ù„Ø±ÙˆØ§ØªØ¨ Ø§Ù„Ù…Ø³ØªØ­Ù‚Ø© ÙˆØªØ±Ø­ÙŠÙ„ Ù‚ÙŠØ¯ Ø§Ù„Ù†Ù‚Ø¯ÙŠØ©
  const handlePayAccrued = async () => {
    if (!existingPayroll && payrollData.length === 0) {
      showToast('Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¨ÙŠØ§Ù†Ø§Øª Ù…Ø³ÙŠØ± Ù„Ù„ØµØ±Ù.', 'warning');
      return;
    }

    const disbValidation = payrollDisbursementSchema.safeParse({
      treasuryId,
      paymentDate
    });

    if (!disbValidation.success) {
      showToast(disbValidation.error.issues[0].message, 'warning');
      return;
    }

    const treasuryObj = treasuryAccounts.find(t => t.id === treasuryId);
    const treasuryName = treasuryObj ? `${treasuryObj.name} (${treasuryObj.code || ''})` : 'Ø§Ù„Ø®Ø²ÙŠÙ†Ø© Ø§Ù„Ù…Ø­Ø¯Ø¯Ø©';
    const netAmount = existingPayroll?.total_net_salary || totals.net;

    const confirmMsg = `ØªØ£ÙƒÙŠØ¯ ØµØ±Ù Ø§Ù„Ø±ÙˆØ§ØªØ¨ ÙˆØªØ±Ø­ÙŠÙ„ Ù‚ÙŠØ¯ Ø§Ù„Ù†Ù‚Ø¯ÙŠØ©:\n` +
      `- Ø¹Ù† Ø´Ù‡Ø±: ${selectedMonth}/${selectedYear}\n` +
      `- ØªØ§Ø±ÙŠØ® Ø§Ù„ØµØ±Ù Ø§Ù„ÙØ¹Ù„ÙŠ: ${paymentDate}\n` +
      `- Ø§Ù„Ù…Ø¨Ù„Øº Ø§Ù„Ù…Ù†ØµØ±Ù: ${Number(netAmount).toLocaleString()} Ø¬.Ù…\n` +
      `- Ø­Ø³Ø§Ø¨ Ø§Ù„ØµØ±Ù: ${treasuryName}\n` +
      `- Ø§Ù„Ù‚ÙŠØ¯ Ø§Ù„Ù…Ø­Ø§Ø³Ø¨ÙŠ: Ù…Ù† Ø­Ù€/ 2251 (Ø±ÙˆØ§ØªØ¨ Ù…Ø³ØªØ­Ù‚Ø©) Ø¥Ù„Ù‰ Ø­Ù€/ ${treasuryName}\n\n` +
      `Ù‡Ù„ ØªØ±ÙŠØ¯ Ø¥ØªÙ…Ø§Ù… Ø§Ù„ØµØ±Ù Ø§Ù„Ø¢Ù†ØŸ`;

    if (!window.confirm(confirmMsg)) return;

    setSavingPayment(true);
    try {
      const orgId = currentSelectedOrgId || (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;

      // Ø¥Ø°Ø§ Ù„Ù… ÙŠÙƒÙ† Ø§Ù„Ù…Ø³ÙŠØ± Ù…Ø³ØªØ­Ù‚Ø§Ù‹ Ø¨Ø¹Ø¯ØŒ ÙŠØªÙ… ØªØ±Ø­ÙŠÙ„ Ù‚ÙŠØ¯ Ø§Ù„Ø§Ø³ØªØ­Ù‚Ø§Ù‚ Ø£ÙˆÙ„Ø§Ù‹
      if (!existingPayroll || existingPayroll.status !== 'accrued') {
        await runPayrollAccrual(selectedMonth, selectedYear, accrualDate, payrollData, orgId);
      }

      await payAccruedPayroll({
        payrollId: existingPayroll?.id,
        month: selectedMonth,
        year: selectedYear,
        paymentDate,
        treasuryId,
        orgId
      });

      showToast(`ØªÙ… ØµØ±Ù Ø±ÙˆØ§ØªØ¨ Ø´Ù‡Ø± ${selectedMonth}/${selectedYear} Ø¨Ù†Ø¬Ø§Ø­ ÙˆØªØ±Ø­ÙŠÙ„ Ù‚ÙŠØ¯ Ø§Ù„Ù†Ù‚Ø¯ÙŠØ© Ù…Ù† ${treasuryName} ðŸ’°âœ…`, 'success');
      await fetchExistingPayroll(selectedMonth, selectedYear);
    } catch (error) {
      logger.error(error);
      showToast('ÙØ´Ù„ ØµØ±Ù Ø§Ù„Ø±ÙˆØ§ØªØ¨: ' + error.message, 'error');
    } finally {
      setSavingPayment(false);
    }
  };

  // 3ï¸âƒ£ Ø§Ù„ØµØ±Ù Ø§Ù„Ù…Ø¨Ø§Ø´Ø± Ø§Ù„ÙÙˆØ±ÙŠ (Ø§Ø³ØªØ­Ù‚Ø§Ù‚ + Ù†Ù‚Ø¯ÙŠØ© Ø¨Ø®Ø·ÙˆØ© ÙˆØ§Ø­Ø¯Ø©)
  const handleRunPayrollDirect = async () => {
    const generalValidationResult = payrollRunSchema.safeParse({
      treasuryId,
      hasData: payrollData.length > 0,
      month: selectedMonth,
      year: selectedYear
    });

    if (!generalValidationResult.success) {
      showToast(generalValidationResult.error.issues[0].message, 'warning');
      return;
    }

    for (const item of payrollData) {
      const itemValidationResult = payrollItemSchema.safeParse(item);
      if (!itemValidationResult.success) {
        showToast(`Ø®Ø·Ø£ ÙÙŠ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…ÙˆØ¸Ù ${item.full_name}: ${itemValidationResult.error.issues[0].message}`, 'warning');
        return;
      }
    }

    const accountsOk = await checkRequiredAccounts();
    if (!accountsOk) return;

    const treasuryObj = treasuryAccounts.find(t => t.id === treasuryId);
    const treasuryName = treasuryObj ? `${treasuryObj.name} (${treasuryObj.code || ''})` : 'Ø§Ù„Ø®Ø²ÙŠÙ†Ø© Ø§Ù„Ù…Ø­Ø¯Ø¯Ø©';

    if (!window.confirm(`Ù‡Ù„ Ø£Ù†Øª Ù…ØªØ£ÙƒØ¯ Ù…Ù† ØµØ±Ù Ù…Ø³ÙŠØ± Ø§Ù„Ø±ÙˆØ§ØªØ¨ Ù…Ø¨Ø§Ø´Ø±Ø© ÙˆØ®ØµÙ… (${totals.net.toLocaleString()} Ø¬.Ù…) ÙÙˆØ±ÙŠØ§Ù‹ Ù…Ù† ${treasuryName}ØŸ`)) return;

    setSavingPayment(true);
    try {
      const orgId = currentSelectedOrgId || (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;

      await runPayrollFromContext(
        selectedMonth,
        selectedYear,
        paymentDate,
        treasuryId,
        payrollData,
        orgId
      );

      showToast('ØªÙ… ØªÙ†ÙÙŠØ° Ù…Ø³ÙŠØ± Ø§Ù„Ø±ÙˆØ§ØªØ¨ ÙˆØªØ±Ø­ÙŠÙ„ Ø§Ù„Ù‚ÙŠØ¯ Ø§Ù„Ù…Ø­Ø§Ø³Ø¨ÙŠ Ø¨Ù†Ø¬Ø§Ø­ ðŸ’°âœ…', 'success');
      await fetchExistingPayroll(selectedMonth, selectedYear);
    } catch (error) {
      logger.error(error);
      showToast('ÙØ´Ù„ ØªÙ†ÙÙŠØ° Ø§Ù„Ù…Ø³ÙŠØ±: ' + error.message, 'error');
    } finally {
      setSavingPayment(false);
    }
  };

  const departments = useMemo(() => {
    const set = new Set<string>();
    payrollData.forEach(p => {
      const dept = (p.department || '').trim();
      if (dept && dept !== '-') set.add(dept);
    });
    return Array.from(set).sort();
  }, [payrollData]);

  const filteredPayrollData = useMemo(() => {
    if (selectedDepartment === 'all') return payrollData;
    return payrollData.filter(p => (p.department || 'Ø¨Ø¯ÙˆÙ† ÙØ±Ø¹').trim() === selectedDepartment);
  }, [payrollData, selectedDepartment]);

  const totals = useMemo(() => {
    return payrollData.reduce(
      (acc, item) => ({
        gross: acc.gross + Number(item.gross_salary || 0),
        additions: acc.additions + Number(item.additions || 0),
        advances: acc.advances + Number(item.advances_deducted || 0),
        taxes: acc.taxes + Number(item.payroll_tax || 0),
        deductions: acc.deductions + Number(item.other_deductions || 0),
        net: acc.net + Number(item.net_salary || 0)
      }),
      { gross: 0, additions: 0, advances: 0, taxes: 0, deductions: 0, net: 0 }
    );
  }, [payrollData]);

  const displayedTotals = useMemo(() => {
    return filteredPayrollData.reduce(
      (acc, item) => ({
        gross: acc.gross + Number(item.gross_salary || 0),
        additions: acc.additions + Number(item.additions || 0),
        advances: acc.advances + Number(item.advances_deducted || 0),
        taxes: acc.taxes + Number(item.payroll_tax || 0),
        deductions: acc.deductions + Number(item.other_deductions || 0),
        net: acc.net + Number(item.net_salary || 0)
      }),
      { gross: 0, additions: 0, advances: 0, taxes: 0, deductions: 0, net: 0 }
    );
  }, [filteredPayrollData]);

  // ØªØµØ¯ÙŠØ± ÙƒØ´Ù Ù…Ø³ÙŠØ± Ø§Ù„Ø±ÙˆØ§ØªØ¨ Ø¥Ù„Ù‰ Excel Ø¨Ø¯Ù‚Ø© Ù…ØªÙ†Ø§Ù‡ÙŠØ© ÙˆØªÙ†Ø³ÙŠÙ‚ Ø§Ø­ØªØ±Ø§ÙÙŠ
  const handleExportExcel = () => {
    if (filteredPayrollData.length === 0) {
      showToast('Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¨ÙŠØ§Ù†Ø§Øª Ù…Ø³ÙŠØ± Ù„Ù„ØªØµØ¯ÙŠØ±ØŒ ÙŠØ±Ø¬Ù‰ ØªØ¬Ù‡ÙŠØ² Ø§Ù„Ù…Ø³ÙŠØ± Ø£ÙˆÙ„Ø§Ù‹', 'warning');
      return;
    }

    const rows = filteredPayrollData.map((item, idx) => ({
      'Ù…': idx + 1,
      'Ø§Ø³Ù… Ø§Ù„Ù…ÙˆØ¸Ù': item.full_name,
      'Ø§Ù„ÙØ±Ø¹ / Ø§Ù„Ù‚Ø³Ù…': item.department && item.department !== '-' ? item.department : 'Ø¨Ø¯ÙˆÙ† ÙØ±Ø¹',
      'Ø§Ù„Ø±Ø§ØªØ¨ Ø§Ù„Ø£Ø³Ø§Ø³ÙŠ (Ø¬.Ù…)': Number(item.gross_salary) || 0,
      'Ø³Ø§Ø¹Ø§Øª Ø§Ù„Ø¥Ø¶Ø§ÙÙŠ': Number(item.overtime_hours) || 0,
      'Ù‚ÙŠÙ…Ø© Ø§Ù„Ø¥Ø¶Ø§ÙÙŠ ÙˆØ§Ù„Ù…ÙƒØ§ÙØ¢Øª (Ø¬.Ù…)': Number(item.additions) || 0,
      'Ø£ÙŠØ§Ù… Ø¥Ø¬Ø§Ø²Ø© Ø¨Ø¯ÙˆÙ† Ø±Ø§ØªØ¨': Number(item.unpaid_leave_days) || 0,
      'Ø®ØµÙ… Ø¥Ø¬Ø§Ø²Ø§Øª Ø¨Ø¯ÙˆÙ† Ø±Ø§ØªØ¨ (Ø¬.Ù…)': Number(item.unpaid_leave_deduction) || 0,
      'Ø£ÙŠØ§Ù… Ø§Ù„ØºÙŠØ§Ø¨': Number(item.absence_days) || 0,
      'Ø®ØµÙˆÙ…Ø§Øª Ø£Ø®Ø±Ù‰ ÙˆØ¬Ø²Ø§Ø¡Ø§Øª (Ø¬.Ù…)': Number(item.other_deductions) || 0,
      'Ø§Ù„Ø³Ù„Ù Ø§Ù„Ù…Ø®ØµÙˆÙ…Ø© (Ø¬.Ù…)': Number(item.advances_deducted) || 0,
      'Ø¶Ø±ÙŠØ¨Ø© ÙƒØ³Ø¨ Ø§Ù„Ø¹Ù…Ù„ (Ø¬.Ù…)': Number(item.payroll_tax) || 0,
      'ØµØ§ÙÙŠ Ø§Ù„Ø±Ø§ØªØ¨ Ø§Ù„Ù…Ø³ØªØ­Ù‚ (Ø¬.Ù…)': Number(item.net_salary) || 0
    }));

    // Ø¥Ø¶Ø§ÙØ© ØµÙ Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ
    rows.push({
      'Ù…': '' as any,
      'Ø§Ø³Ù… Ø§Ù„Ù…ÙˆØ¸Ù': `Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ ${selectedDepartment !== 'all' ? `(${selectedDepartment})` : 'Ø§Ù„Ø¹Ø§Ù…'} (${filteredPayrollData.length} Ù…ÙˆØ¸Ù)`,
      'Ø§Ù„ÙØ±Ø¹ / Ø§Ù„Ù‚Ø³Ù…': selectedDepartment !== 'all' ? selectedDepartment : 'ÙƒÙ„ Ø§Ù„ÙØ±ÙˆØ¹ ÙˆØ§Ù„Ø£Ù‚Ø³Ø§Ù…',
      'Ø§Ù„Ø±Ø§ØªØ¨ Ø§Ù„Ø£Ø³Ø§Ø³ÙŠ (Ø¬.Ù…)': displayedTotals.gross,
      'Ø³Ø§Ø¹Ø§Øª Ø§Ù„Ø¥Ø¶Ø§ÙÙŠ': filteredPayrollData.reduce((s, i) => s + (Number(i.overtime_hours) || 0), 0),
      'Ù‚ÙŠÙ…Ø© Ø§Ù„Ø¥Ø¶Ø§ÙÙŠ ÙˆØ§Ù„Ù…ÙƒØ§ÙØ¢Øª (Ø¬.Ù…)': displayedTotals.additions,
      'Ø£ÙŠØ§Ù… Ø¥Ø¬Ø§Ø²Ø© Ø¨Ø¯ÙˆÙ† Ø±Ø§ØªØ¨': filteredPayrollData.reduce((s, i) => s + (Number(i.unpaid_leave_days) || 0), 0),
      'Ø®ØµÙ… Ø¥Ø¬Ø§Ø²Ø§Øª Ø¨Ø¯ÙˆÙ† Ø±Ø§ØªØ¨ (Ø¬.Ù…)': filteredPayrollData.reduce((s, i) => s + (Number(i.unpaid_leave_deduction) || 0), 0),
      'Ø£ÙŠØ§Ù… Ø§Ù„ØºÙŠØ§Ø¨': filteredPayrollData.reduce((s, i) => s + (Number(i.absence_days) || 0), 0),
      'Ø®ØµÙˆÙ…Ø§Øª Ø£Ø®Ø±Ù‰ ÙˆØ¬Ø²Ø§Ø¡Ø§Øª (Ø¬.Ù…)': displayedTotals.deductions,
      'Ø§Ù„Ø³Ù„Ù Ø§Ù„Ù…Ø®ØµÙˆÙ…Ø© (Ø¬.Ù…)': displayedTotals.advances,
      'Ø¶Ø±ÙŠØ¨Ø© ÙƒØ³Ø¨ Ø§Ù„Ø¹Ù…Ù„ (Ø¬.Ù…)': displayedTotals.taxes,
      'ØµØ§ÙÙŠ Ø§Ù„Ø±Ø§ØªØ¨ Ø§Ù„Ù…Ø³ØªØ­Ù‚ (Ø¬.Ù…)': displayedTotals.net
    });

    const ws = XLSX.utils.json_to_sheet(rows);

    ws['!cols'] = [
      { wch: 6 },  // Ù…
      { wch: 26 }, // Ø§Ø³Ù… Ø§Ù„Ù…ÙˆØ¸Ù
      { wch: 20 }, // Ø§Ù„ÙØ±Ø¹ / Ø§Ù„Ù‚Ø³Ù…
      { wch: 18 }, // Ø§Ù„Ø±Ø§ØªØ¨ Ø§Ù„Ø£Ø³Ø§Ø³ÙŠ
      { wch: 14 }, // Ø³Ø§Ø¹Ø§Øª Ø§Ù„Ø¥Ø¶Ø§ÙÙŠ
      { wch: 22 }, // Ù‚ÙŠÙ…Ø© Ø§Ù„Ø¥Ø¶Ø§ÙÙŠ ÙˆØ§Ù„Ù…ÙƒØ§ÙØ¢Øª
      { wch: 18 }, // Ø£ÙŠØ§Ù… Ø¥Ø¬Ø§Ø²Ø© Ø¨Ø¯ÙˆÙ† Ø±Ø§ØªØ¨
      { wch: 22 }, // Ø®ØµÙ… Ø¥Ø¬Ø§Ø²Ø§Øª Ø¨Ø¯ÙˆÙ† Ø±Ø§ØªØ¨
      { wch: 12 }, // Ø£ÙŠØ§Ù… Ø§Ù„ØºÙŠØ§Ø¨
      { wch: 22 }, // Ø®ØµÙˆÙ…Ø§Øª Ø£Ø®Ø±Ù‰ ÙˆØ¬Ø²Ø§Ø¡Ø§Øª
      { wch: 18 }, // Ø§Ù„Ø³Ù„Ù Ø§Ù„Ù…Ø®ØµÙˆÙ…Ø©
      { wch: 18 }, // Ø¶Ø±ÙŠØ¨Ø© ÙƒØ³Ø¨ Ø§Ù„Ø¹Ù…Ù„
      { wch: 22 }  // ØµØ§ÙÙŠ Ø§Ù„Ø±Ø§ØªØ¨ Ø§Ù„Ù…Ø³ØªØ­Ù‚
    ];

    const wb = XLSX.utils.book_new();
    const deptSuffix = selectedDepartment !== 'all' ? `_${selectedDepartment}` : '';
    XLSX.utils.book_append_sheet(wb, ws, `Ù…Ø³ÙŠØ±_${selectedMonth}_${selectedYear}`);
    XLSX.writeFile(wb, `Ù…Ø³ÙŠØ±_Ø±ÙˆØ§ØªØ¨_Ø´Ù‡Ø±_${selectedMonth}_Ø³Ù†Ø©_${selectedYear}${deptSuffix}.xlsx`);
    showToast(`ØªÙ… ØªØµØ¯ÙŠØ± Ù…Ø³ÙŠØ± Ø±ÙˆØ§ØªØ¨ Ø´Ù‡Ø± ${selectedMonth}/${selectedYear} Ù„Ø¹Ø¯Ø¯ ${filteredPayrollData.length} Ù…ÙˆØ¸Ù Ø¥Ù„Ù‰ Excel Ø¨Ù†Ø¬Ø§Ø­ âœ…`, 'success');
  };

  if (currentUser?.role === 'demo') {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-slate-500 bg-white rounded-3xl border border-slate-200 shadow-sm">
        <Banknote size={64} className="mb-4 text-slate-300" />
        <h2 className="text-xl font-bold text-slate-700">Ù…Ø³ÙŠØ± Ø§Ù„Ø±ÙˆØ§ØªØ¨ ØºÙŠØ± Ù…ØªØ§Ø­</h2>
        <p className="text-sm mt-2">Ù„Ø§ ÙŠÙ…ÙƒÙ† Ø§Ù„ÙˆØµÙˆÙ„ Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø±ÙˆØ§ØªØ¨ ÙÙŠ Ø§Ù„Ù†Ø³Ø®Ø© Ø§Ù„ØªØ¬Ø±ÙŠØ¨ÙŠØ©.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl text-white shadow-md">
            <Banknote className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800">
              Ù…Ø³ÙŠØ± Ø§Ù„Ø±ÙˆØ§ØªØ¨ ÙˆØ§Ù„Ø£Ø¬ÙˆØ± Ø§Ù„Ø´Ù‡Ø±ÙŠ (Payroll Processing)
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              ÙŠØ¯Ø¹Ù… Ø¥Ø«Ø¨Ø§Øª Ù‚ÙŠØ¯ Ø§Ù„Ø§Ø³ØªØ­Ù‚Ø§Ù‚ ÙÙŠ Ù†Ù‡Ø§ÙŠØ© Ø§Ù„Ø´Ù‡Ø± (Ø­Ù€/ 2251) Ø«Ù… ØªÙ†ÙÙŠØ° Ù‚ÙŠØ¯ Ø§Ù„ØµØ±Ù Ø§Ù„ÙØ¹Ù„ÙŠ Ù…Ù† Ø§Ù„Ø®Ø²ÙŠÙ†Ø©/Ø§Ù„Ø¨Ù†Ùƒ
            </p>
          </div>
        </div>

        {currentUser?.hr_scope && currentUser?.hr_scope !== 'all' && (
          <div className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 border ${
            currentUser.hr_scope === 'factory'
              ? 'bg-amber-50 text-amber-800 border-amber-200'
              : 'bg-sky-50 text-sky-800 border-sky-200'
          }`}>
            <span>Ù†Ø·Ø§Ù‚ Ø¥Ø´Ø±Ø§Ù Ø§Ù„Ù…Ø³ÙŠØ±:</span>
            <span>{currentUser.hr_scope === 'factory' ? 'ðŸ­ Ø·Ø§Ù‚Ù… Ø§Ù„Ù…ØµÙ†Ø¹ ÙÙ‚Ø·' : 'ðŸª Ø·Ø§Ù‚Ù… Ø§Ù„ÙØ±ÙˆØ¹ ÙÙ‚Ø·'}</span>
          </div>
        )}
      </div>

      {/* Control Panel */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-blue-600" /> Ø¹Ù† Ø´Ù‡Ø±
            </label>
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(Number(e.target.value))}
              className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-800 bg-white outline-none focus:ring-2 focus:ring-blue-500"
            >
              {[
                '1 - ÙŠÙ†Ø§ÙŠØ±', '2 - ÙØ¨Ø±Ø§ÙŠØ±', '3 - Ù…Ø§Ø±Ø³', '4 - Ø£Ø¨Ø±ÙŠÙ„', '5 - Ù…Ø§ÙŠÙˆ', '6 - ÙŠÙˆÙ†ÙŠÙˆ',
                '7 - ÙŠÙˆÙ„ÙŠÙˆ', '8 - Ø£ØºØ³Ø·Ø³', '9 - Ø³Ø¨ØªÙ…Ø¨Ø±', '10 - Ø£ÙƒØªÙˆØ¨Ø±', '11 - Ù†ÙˆÙÙ…Ø¨Ø±', '12 - Ø¯ÙŠØ³Ù…Ø¨Ø±'
              ].map((mName, i) => (
                <option key={i + 1} value={i + 1}>{mName}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Ø§Ù„Ø³Ù†Ø© Ø§Ù„Ù…Ø§Ù„ÙŠØ©</label>
            <input
              type="number"
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-bold font-mono text-slate-800 bg-white outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-indigo-600" /> ØªØ§Ø±ÙŠØ® Ø§Ù„Ø§Ø³ØªØ­Ù‚Ø§Ù‚ (Ù†Ù‡Ø§ÙŠØ© Ø§Ù„Ø´Ù‡Ø±)
            </label>
            <input
              type="date"
              value={accrualDate}
              onChange={e => setAccrualDate(e.target.value)}
              className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-bold font-mono text-slate-800 bg-white outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-emerald-600" /> ØªØ§Ø±ÙŠØ® Ø§Ù„ØµØ±Ù Ø§Ù„ÙØ¹Ù„ÙŠ
            </label>
            <input
              type="date"
              value={paymentDate}
              onChange={e => setPaymentDate(e.target.value)}
              className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-bold font-mono text-slate-800 bg-white outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
              <Wallet className="w-3.5 h-3.5 text-emerald-600" /> Ø­Ø³Ø§Ø¨ Ø§Ù„ØµØ±Ù (Ø§Ù„Ø®Ø²ÙŠÙ†Ø©/Ø§Ù„Ø¨Ù†Ùƒ)
            </label>
            <select
              value={treasuryId}
              onChange={e => setTreasuryId(e.target.value)}
              className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-800 bg-white outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Ø§Ø®ØªØ± Ø­Ø³Ø§Ø¨ Ø§Ù„ØµØ±Ù --</option>
              {treasuryAccounts.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.name} {acc.code ? `(${acc.code})` : ''}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between pt-2 border-t border-slate-100 gap-3">
          <div className="text-xs text-slate-500">
            {checkingExisting ? (
              <span className="flex items-center gap-1 text-slate-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Ø¬Ø§Ø±ÙŠ Ø§Ù„ØªØ­Ù‚Ù‚ Ù…Ù† Ø­Ø§Ù„Ø© Ø§Ù„Ù…Ø³ÙŠØ±...
              </span>
            ) : existingPayroll?.status === 'paid' ? (
              <span className="text-emerald-700 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Ù…Ø³ÙŠØ± Ø´Ù‡Ø± {selectedMonth}/{selectedYear} Ù…Ù†ØµØ±Ù ÙˆÙ…Ø±Ø­Ù„ Ø¨Ø§Ù„ÙƒØ§Ù…Ù„ Ø¨ØªØ§Ø±ÙŠØ® {existingPayroll.payment_date}
              </span>
            ) : existingPayroll?.status === 'accrued' ? (
              <span className="text-amber-700 font-bold flex items-center gap-1">
                <Clock className="w-4 h-4 text-amber-600" /> Ù…Ø³ÙŠØ± Ø´Ù‡Ø± {selectedMonth}/{selectedYear} Ù…Ø³Ø¬Ù„ ÙƒÙ€ [Ù‚ÙŠØ¯ Ø§Ø³ØªØ­Ù‚Ø§Ù‚ Ù…Ø¹ØªÙ…Ø¯] Ø¨ØªØ§Ø±ÙŠØ® {existingPayroll.accrual_date} (Ø¨Ø§Ù†ØªØ¸Ø§Ø± Ø§Ù„ØµØ±Ù)
              </span>
            ) : (
              <span className="text-slate-500">
                ðŸ’¡ Ø§Ø¶ØºØ· "ØªØ¬Ù‡ÙŠØ² ÙˆØ§Ø­ØªØ³Ø§Ø¨ Ø§Ù„Ù…Ø³ÙŠØ±" Ù„Ø¬Ù„Ø¨ Ø§Ù„Ù…ÙˆØ¸ÙÙŠÙ† ÙˆØ§Ù„Ø¨Ø¯Ù„Ø§Øª ÙˆØ§Ù„Ø³Ù„Ù ÙˆØ§Ù„Ø¥Ø¶Ø§ÙÙŠ ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹.
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {payrollData.length > 0 && (
              <button
                type="button"
                onClick={handleExportExcel}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition active:scale-95"
                title="ØªØµØ¯ÙŠØ± Ù…Ø³ÙŠØ± Ø§Ù„Ø±ÙˆØ§ØªØ¨ Ø¥Ù„Ù‰ Excel"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>ØªØµØ¯ÙŠØ± Ø§Ù„Ù…Ø³ÙŠØ± Excel</span>
              </button>
            )}
            <button
              onClick={preparePayroll}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-md shadow-blue-600/20 transition active:scale-95"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {existingPayroll ? 'Ø¥Ø¹Ø§Ø¯Ø© Ø§Ø­ØªØ³Ø§Ø¨ ÙˆØªØ¬Ù‡ÙŠØ² Ø§Ù„Ù…Ø³ÙŠØ±' : 'ØªØ¬Ù‡ÙŠØ² ÙˆØ§Ø­ØªØ³Ø§Ø¨ Ø§Ù„Ù…Ø³ÙŠØ±'}
            </button>
          </div>
        </div>
      </div>

      {/* Status Alert Banner */}
      {existingPayroll?.status === 'accrued' && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-800 text-sm">Ù…Ø³ÙŠØ± Ù…Ø¹ØªÙ…Ø¯ ÙƒÙ€ Ø§Ø³ØªØ­Ù‚Ø§Ù‚ (Ø¨Ø§Ù†ØªØ¸Ø§Ø± Ø§Ù„ØµØ±Ù)</span>
                <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-amber-300">Ù‚ÙŠØ¯ Ø§Ø³ØªØ­Ù‚Ø§Ù‚ Ù…Ø³Ø¬Ù„</span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                ØªÙ… Ø¥Ø«Ø¨Ø§Øª Ù…ØµØ±ÙˆÙ Ø§Ù„Ø±ÙˆØ§ØªØ¨ Ù„Ø´Ù‡Ø± {selectedMonth}/{selectedYear} Ø¨ØªØ§Ø±ÙŠØ® ({existingPayroll.accrual_date}) ÙˆÙ…Ø­Ù…Ù„ Ø¹Ù„Ù‰ Ø­Ù€/ 2251 (Ø±ÙˆØ§ØªØ¨ ÙˆØ£Ø¬ÙˆØ± Ù…Ø³ØªØ­Ù‚Ø©) Ø¨Ø¥Ø¬Ù…Ø§Ù„ÙŠ ØµØ§ÙÙŠ <strong className="text-amber-800 font-mono">{Number(existingPayroll.total_net_salary).toLocaleString()} Ø¬.Ù…</strong>.
              </p>
            </div>
          </div>
          <div className="text-xs text-slate-600 font-semibold bg-white/70 px-3 py-1.5 rounded-xl border border-amber-200">
            Ø§Ù„ØµØ±Ù: Ø­Ø¯Ø¯ Ø§Ù„Ø®Ø²ÙŠÙ†Ø© ÙˆØªØ§Ø±ÙŠØ® Ø§Ù„ØµØ±Ù Ø«Ù… Ø§Ø¶ØºØ· "ØµØ±Ù Ø§Ù„Ø±ÙˆØ§ØªØ¨ ÙˆØªØ±Ø­ÙŠÙ„ Ù‚ÙŠØ¯ Ø§Ù„Ù†Ù‚Ø¯ÙŠØ©" Ø£Ø¯Ù†Ø§Ù‡ ðŸ‘‡
          </div>
        </div>
      )}

      {existingPayroll?.status === 'paid' && (
        <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-800 text-sm">ØªÙ… ØµØ±Ù Ø§Ù„Ù…Ø³ÙŠØ± ÙˆØªØ±Ø­ÙŠÙ„ Ù‚ÙŠØ¯ Ø§Ù„Ù†Ù‚Ø¯ÙŠØ© Ø¨Ø§Ù„ÙƒØ§Ù…Ù„</span>
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-emerald-300">Ù…Ù†ØµØ±Ù ÙˆÙ…ØºÙ„Ù‚</span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                ØªÙ… ØµØ±Ù Ù‡Ø°Ø§ Ø§Ù„Ù…Ø³ÙŠØ± Ø¨ØªØ§Ø±ÙŠØ® ({existingPayroll.payment_date || 'Ù…Ø³Ø¬Ù„'}) Ø¨Ø¥Ø¬Ù…Ø§Ù„ÙŠ ØµØ§ÙÙŠ <strong className="text-emerald-800 font-mono">{Number(existingPayroll.total_net_salary).toLocaleString()} Ø¬.Ù…</strong>.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Branch / Department Filter Pills */}
      {departments.length > 0 && (
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 ml-2">
            <Building2 className="w-4 h-4 text-indigo-600" />
            <span>ØªØµÙÙŠØ© Ø­Ø³Ø¨ Ø§Ù„ÙØ±Ø¹ / Ø§Ù„Ù‚Ø³Ù…:</span>
          </div>
          <button
            type="button"
            onClick={() => setSelectedDepartment('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              selectedDepartment === 'all'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <span>ÙƒÙ„ Ø§Ù„ÙØ±ÙˆØ¹ ÙˆØ§Ù„Ø£Ù‚Ø³Ø§Ù…</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${selectedDepartment === 'all' ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-600'}`}>
              {payrollData.length}
            </span>
          </button>
          {departments.map((dept) => {
            const count = payrollData.filter(p => (p.department || 'Ø¨Ø¯ÙˆÙ† ÙØ±Ø¹').trim() === dept).length;
            const isSelected = selectedDepartment === dept;
            return (
              <button
                key={dept}
                type="button"
                onClick={() => setSelectedDepartment(dept)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span>{dept}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isSelected ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-600'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Summary Cards */}
      {filteredPayrollData.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
            <span className="text-[11px] text-slate-500 font-bold block">Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø£Ø³Ø§Ø³ÙŠ</span>
            <span className="text-sm font-black text-slate-800 font-mono mt-1 block">
              {displayedTotals.gross.toLocaleString()} Ø¬.Ù…
            </span>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-emerald-100 shadow-sm">
            <span className="text-[11px] text-emerald-700 font-bold block">Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø¥Ø¶Ø§ÙÙŠ (+)</span>
            <span className="text-sm font-black text-emerald-600 font-mono mt-1 block">
              +{displayedTotals.additions.toLocaleString()} Ø¬.Ù…
            </span>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-rose-100 shadow-sm">
            <span className="text-[11px] text-rose-700 font-bold block">Ø§Ù„Ø³Ù„Ù Ø§Ù„Ù…Ø³ØªÙ‚Ø·Ø¹Ø© (-)</span>
            <span className="text-sm font-black text-rose-600 font-mono mt-1 block">
              -{displayedTotals.advances.toLocaleString()} Ø¬.Ù…
            </span>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-rose-100 shadow-sm">
            <span className="text-[11px] text-rose-700 font-bold block">Ø§Ù„Ø®ØµÙˆÙ…Ø§Øª ÙˆØ§Ù„Ø¬Ø²Ø§Ø¡Ø§Øª (-)</span>
            <span className="text-sm font-black text-rose-600 font-mono mt-1 block">
              -{displayedTotals.deductions.toLocaleString()} Ø¬.Ù…
            </span>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-rose-100 shadow-sm">
            <span className="text-[11px] text-rose-700 font-bold block">Ø¶Ø±ÙŠØ¨Ø© ÙƒØ³Ø¨ Ø§Ù„Ø¹Ù…Ù„ (-)</span>
            <span className="text-sm font-black text-rose-600 font-mono mt-1 block">
              -{displayedTotals.taxes.toLocaleString()} Ø¬.Ù…
            </span>
          </div>

          <div className="bg-emerald-50 p-3.5 rounded-2xl border border-emerald-200 shadow-sm">
            <span className="text-[11px] text-emerald-800 font-bold block">ØµØ§ÙÙŠ Ø§Ù„Ø±ÙˆØ§ØªØ¨ Ø§Ù„Ù…Ø³ØªØ­Ù‚</span>
            <span className="text-base font-black text-emerald-700 font-mono mt-1 block">
              {displayedTotals.net.toLocaleString()} Ø¬.Ù…
            </span>
          </div>
        </div>
      )}

      {/* Table Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-600 font-bold">
                <th className="p-3.5">Ø§Ù„Ù…ÙˆØ¸Ù</th>
                <th className="p-3.5 text-center">Ø§Ù„ÙØ±Ø¹ / Ø§Ù„Ù‚Ø³Ù…</th>
                <th className="p-3.5 text-center">Ø§Ù„Ø±Ø§ØªØ¨ Ø§Ù„Ø£Ø³Ø§Ø³ÙŠ</th>
                <th className="p-3.5 text-center">Ø¥Ø¶Ø§ÙÙŠ ÙˆÙ…ÙƒØ§ÙØ¢Øª (+)</th>
                <th className="p-3.5 text-center">Ø§Ù„Ø³Ù„Ù (-)</th>
                <th className="p-3.5 text-center">Ø¶Ø±ÙŠØ¨Ø© ÙƒØ³Ø¨ Ø¹Ù…Ù„ (-)</th>
                <th className="p-3.5 text-center">Ø®ØµÙˆÙ…Ø§Øª ÙˆØ¬Ø²Ø§Ø¡Ø§Øª (-)</th>
                <th className="p-3.5 text-center bg-emerald-50/50 text-emerald-800">ØµØ§ÙÙŠ Ø§Ù„Ù…Ø³ØªØ­Ù‚</th>
                <th className="p-3.5 text-center">Ø¥Ø¬Ø±Ø§Ø¡Ø§Øª</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPayrollData.map((emp) => (
                <tr key={emp.employee_id} className="hover:bg-slate-50/60 transition">
                  <td className="p-3.5 font-bold text-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs">
                        <User className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <span>{emp.full_name}</span>
                        {(emp.overtime_hours > 0 || (emp.reward_amount || 0) > 0) && (
                          <div className="flex items-center gap-1 mt-0.5 text-[10px] text-emerald-600">
                            {emp.overtime_hours > 0 && <span>Ø¥Ø¶Ø§ÙÙŠ {emp.overtime_hours} Ø³</span>}
                            {(emp.reward_amount || 0) > 0 && <span>â€¢ Ù…ÙƒØ§ÙØ£Ø© {emp.reward_amount} Ø¬</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="p-3.5 text-center">
                    <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold border border-slate-200 inline-flex items-center gap-1">
                      <Building2 className="w-3 h-3 text-slate-400" />
                      {emp.department && emp.department !== '-' ? emp.department : 'Ø¨Ø¯ÙˆÙ† ÙØ±Ø¹'}
                    </span>
                  </td>

                  <td className="p-3.5 text-center">
                    <input
                      type="number"
                      value={emp.gross_salary}
                      onChange={e => handleGrossChange(emp.employee_id, Number(e.target.value))}
                      className="w-24 text-center border rounded-lg p-1 font-mono font-bold text-slate-700 bg-white"
                      disabled={existingPayroll?.status === 'paid'}
                    />
                  </td>

                  <td className="p-3.5 text-center">
                    <input
                      type="number"
                      value={emp.additions}
                      onChange={e => handleAdditionsChange(emp.employee_id, Number(e.target.value))}
                      className="w-20 text-center border rounded-lg p-1 font-mono font-bold text-emerald-600 bg-white"
                      disabled={existingPayroll?.status === 'paid'}
                    />
                  </td>

                  <td className="p-3.5 text-center font-mono font-bold text-rose-600">
                    {emp.advances_deducted > 0 ? `-${emp.advances_deducted.toLocaleString()}` : '-'}
                  </td>

                  <td className="p-3.5 text-center">
                    <input
                      type="number"
                      value={emp.payroll_tax}
                      onChange={e => handleTaxChange(emp.employee_id, Number(e.target.value))}
                      className="w-20 text-center border rounded-lg p-1 font-mono font-bold text-rose-600 bg-white"
                      disabled={existingPayroll?.status === 'paid'}
                    />
                  </td>

                  <td className="p-3.5 text-center">
                    <input
                      type="number"
                      value={emp.other_deductions}
                      onChange={e => handleDeductionChange(emp.employee_id, Number(e.target.value))}
                      className="w-20 text-center border rounded-lg p-1 font-mono font-bold text-rose-600 bg-white"
                      disabled={existingPayroll?.status === 'paid'}
                    />
                    {emp.unpaid_leave_days > 0 && (
                      <span className="text-[10px] text-rose-600 block mt-0.5">
                        Ø®ØµÙ… {emp.unpaid_leave_days} ÙŠÙˆÙ… Ø¥Ø¬Ø§Ø²Ø© ({emp.unpaid_leave_deduction.toFixed(2)} Ø¬)
                      </span>
                    )}
                  </td>

                  <td className="p-3.5 text-center font-mono font-black text-sm text-emerald-700 bg-emerald-50/30">
                    {emp.net_salary.toLocaleString()} Ø¬.Ù…
                  </td>

                  <td className="p-3.5 text-center">
                    <button
                      onClick={() => setSelectedPayslip({
                        employee_name: emp.full_name,
                        department: emp.department && emp.department !== '-' ? emp.department : undefined,
                        month: selectedMonth,
                        year: selectedYear,
                        gross_salary: emp.gross_salary,
                        additions: emp.additions,
                        advances_deducted: emp.advances_deducted,
                        payroll_tax: emp.payroll_tax,
                        other_deductions: emp.other_deductions,
                        net_salary: emp.net_salary,
                        unpaid_leave_days: emp.unpaid_leave_days,
                        unpaid_leave_deduction: emp.unpaid_leave_deduction,
                        company_name: organization?.name
                      })}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border rounded-lg text-[10px] font-bold inline-flex items-center gap-1 transition"
                      title="Ø·Ø¨Ø§Ø¹Ø© Ù‚Ø³ÙŠÙ…Ø© Ø§Ù„Ø±Ø§ØªØ¨"
                    >
                      <Printer className="w-3 h-3 text-blue-600" /> Ù…ÙØ±Ø¯Ø§Øª
                    </button>
                  </td>
                </tr>
              ))}

              {filteredPayrollData.length === 0 && !loading && (
                <tr>
                  <td colSpan={9} className="p-10 text-center text-slate-400 space-y-2">
                    <Info className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="font-bold text-slate-600">
                      {payrollData.length === 0 ? 'Ù„Ù… ÙŠØªÙ… ØªØ¬Ù‡ÙŠØ² Ø§Ù„Ù…Ø³ÙŠØ± Ø¨Ø¹Ø¯' : 'Ù„Ø§ ÙŠÙˆØ¬Ø¯ Ù…ÙˆØ¸ÙÙˆÙ† ÙÙŠ Ù‡Ø°Ø§ Ø§Ù„ÙØ±Ø¹ / Ø§Ù„Ù‚Ø³Ù…'}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {payrollData.length === 0 
                        ? 'Ø­Ø¯Ø¯ Ø§Ù„Ø´Ù‡Ø± ÙˆØ§Ù„Ø³Ù†Ø© Ø«Ù… Ø§Ø¶ØºØ· Ø¹Ù„Ù‰ "ØªØ¬Ù‡ÙŠØ² ÙˆØ§Ø­ØªØ³Ø§Ø¨ Ø§Ù„Ù…Ø³ÙŠØ±" Ù„Ø¬Ù„Ø¨ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…ÙˆØ¸ÙÙŠÙ† ÙˆØ§Ù„Ø¨Ø¯Ù„Ø§Øª ÙˆØ§Ù„Ø³Ù„Ù ÙˆØ§Ù„ØºÙŠØ§Ø¨ Ø¢Ù„ÙŠØ§Ù‹.'
                        : 'ÙŠÙ…ÙƒÙ†Ùƒ Ø§Ø®ØªÙŠØ§Ø± "ÙƒÙ„ Ø§Ù„ÙØ±ÙˆØ¹ ÙˆØ§Ù„Ø£Ù‚Ø³Ø§Ù…" Ù„Ø¹Ø±Ø¶ ÙƒØ§ÙØ© Ù…ÙˆØ¸ÙÙŠ Ø§Ù„Ù…Ø³ÙŠØ±.'}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Action Footer */}
      {payrollData.length > 0 && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap justify-between items-center gap-4">
          <div className="text-xs text-slate-600 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>
              Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ù…ÙˆØ¸ÙÙŠÙ†: <strong>{payrollData.length}</strong> | Ø¥Ø¬Ù…Ø§Ù„ÙŠ ØµØ§ÙÙŠ Ø§Ù„Ø±ÙˆØ§ØªØ¨:{' '}
              <strong className="text-emerald-700 font-mono text-sm">{totals.net.toLocaleString()} Ø¬.Ù…</strong>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleExportExcel}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition active:scale-95"
              title="ØªØµØ¯ÙŠØ± Ù…Ø³ÙŠØ± Ø§Ù„Ø±ÙˆØ§ØªØ¨ Ø¥Ù„Ù‰ Excel"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>ØªØµØ¯ÙŠØ± Excel</span>
            </button>
            {existingPayroll?.status === 'paid' ? (
              <div className="flex items-center gap-2 bg-emerald-50 text-emerald-800 border border-emerald-200 px-5 py-2.5 rounded-xl text-xs font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ØªÙ… ØµØ±Ù Ù‡Ø°Ø§ Ø§Ù„Ù…Ø³ÙŠØ± ÙˆØªØ±Ø­ÙŠÙ„ Ù‚ÙŠØ¯ Ø§Ù„Ù†Ù‚Ø¯ÙŠØ© Ø¨Ø§Ù„ÙƒØ§Ù…Ù„ âœ…
              </div>
            ) : existingPayroll?.status === 'accrued' ? (
              <>
                <button
                  onClick={handleRunAccrual}
                  disabled={savingAccrual || savingPayment}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 border border-slate-300 transition"
                  title="Ø¥Ø¹Ø§Ø¯Ø© Ø§Ø­ØªØ³Ø§Ø¨ ÙˆØªØ­Ø¯ÙŠØ« Ù‚ÙŠØ¯ Ø§Ù„Ø§Ø³ØªØ­Ù‚Ø§Ù‚ Ø¨Ù‚ÙŠÙ… Ø§Ù„Ù…Ø³ÙŠØ± Ø§Ù„Ù…Ø¹Ø±ÙˆØ¶Ø©"
                >
                  {savingAccrual ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  ØªØ­Ø¯ÙŠØ« Ù‚ÙŠØ¯ Ø§Ù„Ø§Ø³ØªØ­Ù‚Ø§Ù‚
                </button>

                <button
                  onClick={handlePayAccrued}
                  disabled={savingPayment || savingAccrual}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/25 transition"
                >
                  {savingPayment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
                  {savingPayment ? 'Ø¬Ø§Ø±ÙŠ ØªÙ†ÙÙŠØ° Ù‚ÙŠØ¯ Ø§Ù„ØµØ±Ù...' : 'ØµØ±Ù Ø§Ù„Ø±ÙˆØ§ØªØ¨ ÙˆØªØ±Ø­ÙŠÙ„ Ù‚ÙŠØ¯ Ø§Ù„Ù†Ù‚Ø¯ÙŠØ© (Ø­Ù€/ 2251 â† Ø§Ù„Ø®Ø²ÙŠÙ†Ø©/Ø§Ù„Ø¨Ù†Ùƒ)'}
                </button>
              </>
            ) : (
              <>
                {/* Ø²Ø± Ø¥Ø«Ø¨Ø§Øª Ù‚ÙŠØ¯ Ø§Ù„Ø§Ø³ØªØ­Ù‚Ø§Ù‚ Ø§Ù„Ù…Ù†ÙØµÙ„ */}
                <button
                  onClick={handleRunAccrual}
                  disabled={savingAccrual || savingPayment}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg shadow-indigo-600/25 transition"
                >
                  {savingAccrual ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {savingAccrual ? 'Ø¬Ø§Ø±ÙŠ ØªØ±Ø­ÙŠÙ„ Ø§Ù„Ø§Ø³ØªØ­Ù‚Ø§Ù‚...' : '1. Ø¥Ø«Ø¨Ø§Øª Ù‚ÙŠØ¯ Ø§Ù„Ø§Ø³ØªØ­Ù‚Ø§Ù‚ (Ø­Ù€/ 2251 Ø±ÙˆØ§ØªØ¨ Ù…Ø³ØªØ­Ù‚Ø©)'}
                </button>

                {/* Ø²Ø± Ø§Ù„ØµØ±Ù Ø§Ù„Ù…Ø¨Ø§Ø´Ø± Ø§Ù„ÙÙˆØ±ÙŠ */}
                <button
                  onClick={handleRunPayrollDirect}
                  disabled={savingPayment || savingAccrual}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/25 transition"
                >
                  {savingPayment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
                  {savingPayment ? 'Ø¬Ø§Ø±ÙŠ Ø§Ù„ØµØ±Ù Ø§Ù„Ù…Ø¨Ø§Ø´Ø±...' : '2. ØµØ±Ù Ù…Ø¨Ø§Ø´Ø± ÙÙˆØ±ÙŠ (Ø§Ø³ØªØ­Ù‚Ø§Ù‚ + Ù†Ù‚Ø¯ÙŠØ©)'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Payslip Modal */}
      {selectedPayslip && (
        <PayslipModal data={selectedPayslip} onClose={() => setSelectedPayslip(null)} />
      )}
    </div>
  );
};

export default PayrollRun;
