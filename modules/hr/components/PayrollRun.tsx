import React, { useState, useEffect, useMemo } from 'react';
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
  Award
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

  // مزامنة السنة المختارة مع السنة المالية للنظام
  useEffect(() => {
    if (selectedFiscalYear) {
      setSelectedYear(selectedFiscalYear);
    }
  }, [selectedFiscalYear]);

  // جلب الخزائن والبنوك المتاحة
  useEffect(() => {
    const fetchTreasuries = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id || currentSelectedOrgId || (currentUser as any)?.organization_id;
      
      let query = supabase
        .from('accounts')
        .select('id, name, code')
        .ilike('type', '%asset%')
        .or('code.like.123%,code.like.101%,name.ilike.%صندوق%,name.ilike.%خزينة%,name.ilike.%بنك%');
      
      if (userOrgId) {
        query = query.eq('organization_id', userOrgId);
      }
      const { data } = await query;
      if (data) setTreasuryAccounts(data);
    };
    fetchTreasuries();
  }, [currentSelectedOrgId, currentUser]);

  // فحص ما إذا كان هناك مسير مسجل سابقاً لنفس الشهر والسنة
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
        console.error("Error fetching payroll:", error);
        return;
      }

      if (data && data.length > 0) {
        const payroll = data[0];
        setExistingPayroll(payroll);
        if (payroll.accrual_date) setAccrualDate(payroll.accrual_date);
        if (payroll.payment_date) setPaymentDate(payroll.payment_date);
        if (payroll.treasury_account_id) setTreasuryId(payroll.treasury_account_id);

        // جلب بنود المسير المسجلة إذا كانت الشاشة فارغة
        const { data: items } = await supabase
          .from('payroll_items')
          .select('*, employees(full_name, position, department)')
          .eq('payroll_id', payroll.id);

        if (items && items.length > 0) {
          const mappedItems: PayrollItem[] = items.map((it: any) => ({
            employee_id: it.employee_id,
            full_name: it.employees?.full_name || 'موظف',
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
      console.error(err);
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

      // التحقق من وجود مسير سابق لنفس الشهر
      if (existingPayroll?.status === 'paid') {
        if (!window.confirm(`تنبيه: مسير رواتب شهر ${selectedMonth}/${selectedYear} تم صرفه بالكامل مسبقاً.\nهل تريد إعادة احتساب وتجهيز البيانات؟`)) {
          setLoading(false);
          return;
        }
      } else if (existingPayroll?.status === 'accrued') {
        if (!window.confirm(`تنبيه: يوجد مسير مسجل كـ [استحقاق معتمد] لشهر ${selectedMonth}/${selectedYear}.\nهل تريد إعادة احتساب البيانات وتحديث قيد الاستحقاق؟`)) {
          setLoading(false);
          return;
        }
      }

      // تحديد النطاق الزمني لشهر المسير
      const monthStartStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
      const lastDayNumber = new Date(selectedYear, selectedMonth, 0).getDate();
      const monthEndStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDayNumber).padStart(2, '0')}`;

      // 🛡️ عزل نطاق الإشراف للموارد البشرية والرواتب (HR Supervisory Scope)
      let empQuery = supabase.from('employees').select('*').eq('status', 'active').eq('organization_id', targetOrg);
      const hrScope = currentUser?.hr_scope || (currentUser as any)?.user_metadata?.hr_scope || 'all';

      const isFactoryDept = (dept: any) => {
        const d = String(dept || '').trim().toLowerCase();
        return d === 'المصنع' || d === 'مصنع' || d === 'factory';
      };

      if (hrScope === 'factory') {
        empQuery = empQuery.in('department', ['المصنع', 'مصنع']);
      } else if (hrScope === 'branches') {
        empQuery = empQuery.not('department', 'in', '("المصنع","مصنع")');
      }

      // جلب البيانات بالتوازي: الموظفين، السلف، الإجازات، الحضور، الجزاءات والمكافآت
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

        // أ) السلف غير المخصومة
        const empAdvances = advances.filter(adv => adv.employee_id === emp.id);
        const totalAdvances = empAdvances.reduce((sum, adv) => sum + Number(adv.amount || 0), 0);

        // ب) الإجازات بدون راتب المعتمدة لشهر المسير
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

        // ج) سجلات الغياب غير المبرر وساعات الإضافي
        const empAttendance = attendanceLogs.filter(att => att.employee_id === emp.id);
        const absenceDays = empAttendance.filter(a => a.status === 'ABSENT').length;
        const absenceDeduction = Math.round(absenceDays * dailyRate * 100) / 100;

        const totalOvertimeHours = empAttendance.reduce((sum, a) => sum + Number(a.overtime_hours || 0), 0);
        const overtimePay = Math.round(totalOvertimeHours * hourlyRate * 1.5 * 100) / 100;

        // د) الجزاءات والمكافآت المعتمدة خلال الشهر
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

        // هـ) التجميع النهائي للإضافي والاستقطاعات
        const additions = overtimePay + totalRewardAmount;
        const otherDeductions = unpaidLeaveDeduction + absenceDeduction + totalPenaltyAmount;

        // و) ضريبة كسب العمل التقديرية (افتراضياً 0 أو حسب الإعدادات)
        const payrollTax = 0;

        const netSalary = Math.max(0, Math.round((basicSalary + additions - totalAdvances - otherDeductions - payrollTax) * 100) / 100);

        return {
          employee_id: emp.id,
          full_name: emp.full_name,
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
      showToast(`تم احتساب مسير رواتب شهر ${selectedMonth}/${selectedYear} بنجاح لعدد ${preparedData.length} موظف.`, 'success');
    } catch (err: any) {
      console.error(err);
      showToast('حدث خطأ أثناء احتساب المسير: ' + err.message, 'error');
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

  // التحقق من الحسابات المطلوبة
  const checkRequiredAccounts = async () => {
    const requiredAccounts = [
      { code: SYSTEM_ACCOUNTS.SALARIES_EXPENSE, name: 'الرواتب والأجور' },
      { code: SYSTEM_ACCOUNTS.EMPLOYEE_BONUSES, name: 'مكافآت وحوافز' },
      { code: SYSTEM_ACCOUNTS.EMPLOYEE_DEDUCTIONS, name: 'خصومات وجزاءات' },
      { code: SYSTEM_ACCOUNTS.EMPLOYEE_ADVANCES, name: 'سلف الموظفين' },
      { code: SYSTEM_ACCOUNTS.PAYROLL_TAX, name: 'ضريبة كسب العمل' },
      { code: SYSTEM_ACCOUNTS.ACCRUED_SALARIES, name: 'رواتب وأجور مستحقة' }
    ];

    const missingAccounts = requiredAccounts.filter(req => !accounts.find(a => a.code === req.code));

    if (missingAccounts.length > 0) {
      const confirmCreate = window.confirm(
        `عذراً، لا يمكن إتمام العملية.\nالحسابات التالية غير موجودة في الدليل المحاسبي:\n${missingAccounts.map(a => `- ${a.name} (كود: ${a.code})`).join('\n')}\n\nهل تريد إنشاء هذه الحسابات تلقائياً الآن؟`
      );

      if (confirmCreate) {
        try {
          const result = await createMissingSystemAccounts();
          if (result?.success) {
            showToast(result.message + "\nتم تحديث الحسابات بنجاح. يمكنك الآن إعادة المحاولة.", 'success');
          } else {
            showToast('تم تحديث دليل الحسابات. يرجى المحاولة مرة أخرى.', 'info');
          }
        } catch (error: any) {
          showToast('حدث خطأ أثناء إنشاء الحسابات: ' + error.message, 'error');
        }
      }
      return false;
    }
    return true;
  };

  // 1️⃣ إثبات قيد الاستحقاق (نهاية الشهر - حـ/ 2251)
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
        showToast(`خطأ في بيانات الموظف ${item.full_name}: ${itemValidationResult.error.issues[0].message}`, 'warning');
        return;
      }
    }

    const accountsOk = await checkRequiredAccounts();
    if (!accountsOk) return;

    const confirmMsg = `تأكيد ترحيل قيد استحقاق الرواتب لشهر ${selectedMonth}/${selectedYear}:\n` +
      `- تاريخ الاستحقاق: ${accrualDate}\n` +
      `- إجمالي الصافي المستحق: ${totals.net.toLocaleString()} ج.م\n` +
      `- الحساب الدائن: (2251) رواتب وأجور مستحقة\n\n` +
      `💡 ملاحظة: يثبت هذا القيد مصروف الرواتب بنهاية الشهر دون خصم أي نقدية من الخزينة حتى تاريخ الصرف الفعلي.\n\nهل تريد المتابعة؟`;

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

      showToast(`تم ترحيل قيد استحقاق رواتب شهر ${selectedMonth}/${selectedYear} بنجاح (حـ/ 2251 دائن) 📋✅`, 'success');
      await fetchExistingPayroll(selectedMonth, selectedYear);
    } catch (error: any) {
      console.error(error);
      showToast('فشل ترحيل قيد الاستحقاق: ' + error.message, 'error');
    } finally {
      setSavingAccrual(false);
    }
  };

  // 2️⃣ صرف الرواتب المستحقة وترحيل قيد النقدية
  const handlePayAccrued = async () => {
    if (!existingPayroll && payrollData.length === 0) {
      showToast('لا توجد بيانات مسير للصرف.', 'warning');
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
    const treasuryName = treasuryObj ? `${treasuryObj.name} (${treasuryObj.code || ''})` : 'الخزينة المحددة';
    const netAmount = existingPayroll?.total_net_salary || totals.net;

    const confirmMsg = `تأكيد صرف الرواتب وترحيل قيد النقدية:\n` +
      `- عن شهر: ${selectedMonth}/${selectedYear}\n` +
      `- تاريخ الصرف الفعلي: ${paymentDate}\n` +
      `- المبلغ المنصرف: ${Number(netAmount).toLocaleString()} ج.م\n` +
      `- حساب الصرف: ${treasuryName}\n` +
      `- القيد المحاسبي: من حـ/ 2251 (رواتب مستحقة) إلى حـ/ ${treasuryName}\n\n` +
      `هل تريد إتمام الصرف الآن؟`;

    if (!window.confirm(confirmMsg)) return;

    setSavingPayment(true);
    try {
      const orgId = currentSelectedOrgId || (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;

      // إذا لم يكن المسير مستحقاً بعد، يتم ترحيل قيد الاستحقاق أولاً
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

      showToast(`تم صرف رواتب شهر ${selectedMonth}/${selectedYear} بنجاح وترحيل قيد النقدية من ${treasuryName} 💰✅`, 'success');
      await fetchExistingPayroll(selectedMonth, selectedYear);
    } catch (error: any) {
      console.error(error);
      showToast('فشل صرف الرواتب: ' + error.message, 'error');
    } finally {
      setSavingPayment(false);
    }
  };

  // 3️⃣ الصرف المباشر الفوري (استحقاق + نقدية بخطوة واحدة)
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
        showToast(`خطأ في بيانات الموظف ${item.full_name}: ${itemValidationResult.error.issues[0].message}`, 'warning');
        return;
      }
    }

    const accountsOk = await checkRequiredAccounts();
    if (!accountsOk) return;

    const treasuryObj = treasuryAccounts.find(t => t.id === treasuryId);
    const treasuryName = treasuryObj ? `${treasuryObj.name} (${treasuryObj.code || ''})` : 'الخزينة المحددة';

    if (!window.confirm(`هل أنت متأكد من صرف مسير الرواتب مباشرة وخصم (${totals.net.toLocaleString()} ج.م) فورياً من ${treasuryName}؟`)) return;

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

      showToast('تم تنفيذ مسير الرواتب وترحيل القيد المحاسبي بنجاح 💰✅', 'success');
      await fetchExistingPayroll(selectedMonth, selectedYear);
    } catch (error: any) {
      console.error(error);
      showToast('فشل تنفيذ المسير: ' + error.message, 'error');
    } finally {
      setSavingPayment(false);
    }
  };

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

  if (currentUser?.role === 'demo') {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-slate-500 bg-white rounded-3xl border border-slate-200 shadow-sm">
        <Banknote size={64} className="mb-4 text-slate-300" />
        <h2 className="text-xl font-bold text-slate-700">مسير الرواتب غير متاح</h2>
        <p className="text-sm mt-2">لا يمكن الوصول لبيانات الرواتب في النسخة التجريبية.</p>
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
              مسير الرواتب والأجور الشهري (Payroll Processing)
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              يدعم إثبات قيد الاستحقاق في نهاية الشهر (حـ/ 2251) ثم تنفيذ قيد الصرف الفعلي من الخزينة/البنك
            </p>
          </div>
        </div>

        {currentUser?.hr_scope && currentUser?.hr_scope !== 'all' && (
          <div className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 border ${
            currentUser.hr_scope === 'factory'
              ? 'bg-amber-50 text-amber-800 border-amber-200'
              : 'bg-sky-50 text-sky-800 border-sky-200'
          }`}>
            <span>نطاق إشراف المسير:</span>
            <span>{currentUser.hr_scope === 'factory' ? '🏭 طاقم المصنع فقط' : '🏪 طاقم الفروع فقط'}</span>
          </div>
        )}
      </div>

      {/* Control Panel */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-blue-600" /> عن شهر
            </label>
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(Number(e.target.value))}
              className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-800 bg-white outline-none focus:ring-2 focus:ring-blue-500"
            >
              {[
                '1 - يناير', '2 - فبراير', '3 - مارس', '4 - أبريل', '5 - مايو', '6 - يونيو',
                '7 - يوليو', '8 - أغسطس', '9 - سبتمبر', '10 - أكتوبر', '11 - نوفمبر', '12 - ديسمبر'
              ].map((mName, i) => (
                <option key={i + 1} value={i + 1}>{mName}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">السنة المالية</label>
            <input
              type="number"
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-bold font-mono text-slate-800 bg-white outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-indigo-600" /> تاريخ الاستحقاق (نهاية الشهر)
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
              <Calendar className="w-3.5 h-3.5 text-emerald-600" /> تاريخ الصرف الفعلي
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
              <Wallet className="w-3.5 h-3.5 text-emerald-600" /> حساب الصرف (الخزينة/البنك)
            </label>
            <select
              value={treasuryId}
              onChange={e => setTreasuryId(e.target.value)}
              className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-800 bg-white outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- اختر حساب الصرف --</option>
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
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> جاري التحقق من حالة المسير...
              </span>
            ) : existingPayroll?.status === 'paid' ? (
              <span className="text-emerald-700 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> مسير شهر {selectedMonth}/{selectedYear} منصرف ومرحل بالكامل بتاريخ {existingPayroll.payment_date}
              </span>
            ) : existingPayroll?.status === 'accrued' ? (
              <span className="text-amber-700 font-bold flex items-center gap-1">
                <Clock className="w-4 h-4 text-amber-600" /> مسير شهر {selectedMonth}/{selectedYear} مسجل كـ [قيد استحقاق معتمد] بتاريخ {existingPayroll.accrual_date} (بانتظار الصرف)
              </span>
            ) : (
              <span className="text-slate-500">
                💡 اضغط "تجهيز واحتساب المسير" لجلب الموظفين والبدلات والسلف والإضافي تلقائياً.
              </span>
            )}
          </div>

          <button
            onClick={preparePayroll}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-md shadow-blue-600/20 transition"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {existingPayroll ? 'إعادة احتساب وتجهيز المسير' : 'تجهيز واحتساب المسير'}
          </button>
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
                <span className="font-bold text-slate-800 text-sm">مسير معتمد كـ استحقاق (بانتظار الصرف)</span>
                <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-amber-300">قيد استحقاق مسجل</span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                تم إثبات مصروف الرواتب لشهر {selectedMonth}/{selectedYear} بتاريخ ({existingPayroll.accrual_date}) ومحمل على حـ/ 2251 (رواتب وأجور مستحقة) بإجمالي صافي <strong className="text-amber-800 font-mono">{Number(existingPayroll.total_net_salary).toLocaleString()} ج.م</strong>.
              </p>
            </div>
          </div>
          <div className="text-xs text-slate-600 font-semibold bg-white/70 px-3 py-1.5 rounded-xl border border-amber-200">
            الصرف: حدد الخزينة وتاريخ الصرف ثم اضغط "صرف الرواتب وترحيل قيد النقدية" أدناه 👇
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
                <span className="font-bold text-slate-800 text-sm">تم صرف المسير وترحيل قيد النقدية بالكامل</span>
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-emerald-300">منصرف ومغلق</span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                تم صرف هذا المسير بتاريخ ({existingPayroll.payment_date || 'مسجل'}) بإجمالي صافي <strong className="text-emerald-800 font-mono">{Number(existingPayroll.total_net_salary).toLocaleString()} ج.م</strong>.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      {payrollData.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
            <span className="text-[11px] text-slate-500 font-bold block">إجمالي الأساسي</span>
            <span className="text-sm font-black text-slate-800 font-mono mt-1 block">
              {totals.gross.toLocaleString()} ج.م
            </span>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-emerald-100 shadow-sm">
            <span className="text-[11px] text-emerald-700 font-bold block">إجمالي الإضافي (+)</span>
            <span className="text-sm font-black text-emerald-600 font-mono mt-1 block">
              +{totals.additions.toLocaleString()} ج.م
            </span>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-rose-100 shadow-sm">
            <span className="text-[11px] text-rose-700 font-bold block">السلف المستقطعة (-)</span>
            <span className="text-sm font-black text-rose-600 font-mono mt-1 block">
              -{totals.advances.toLocaleString()} ج.م
            </span>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-rose-100 shadow-sm">
            <span className="text-[11px] text-rose-700 font-bold block">الخصومات والجزاءات (-)</span>
            <span className="text-sm font-black text-rose-600 font-mono mt-1 block">
              -{totals.deductions.toLocaleString()} ج.م
            </span>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-rose-100 shadow-sm">
            <span className="text-[11px] text-rose-700 font-bold block">ضريبة كسب العمل (-)</span>
            <span className="text-sm font-black text-rose-600 font-mono mt-1 block">
              -{totals.taxes.toLocaleString()} ج.م
            </span>
          </div>

          <div className="bg-emerald-50 p-3.5 rounded-2xl border border-emerald-200 shadow-sm">
            <span className="text-[11px] text-emerald-800 font-bold block">صافي الرواتب المستحق</span>
            <span className="text-base font-black text-emerald-700 font-mono mt-1 block">
              {totals.net.toLocaleString()} ج.م
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
                <th className="p-3.5">الموظف</th>
                <th className="p-3.5 text-center">الراتب الأساسي</th>
                <th className="p-3.5 text-center">إضافي ومكافآت (+)</th>
                <th className="p-3.5 text-center">السلف (-)</th>
                <th className="p-3.5 text-center">ضريبة كسب عمل (-)</th>
                <th className="p-3.5 text-center">خصومات وجزاءات (-)</th>
                <th className="p-3.5 text-center bg-emerald-50/50 text-emerald-800">صافي المستحق</th>
                <th className="p-3.5 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payrollData.map((emp) => (
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
                            {emp.overtime_hours > 0 && <span>إضافي {emp.overtime_hours} س</span>}
                            {(emp.reward_amount || 0) > 0 && <span>• مكافأة {emp.reward_amount} ج</span>}
                          </div>
                        )}
                      </div>
                    </div>
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
                        خصم {emp.unpaid_leave_days} يوم إجازة ({emp.unpaid_leave_deduction.toFixed(2)} ج)
                      </span>
                    )}
                  </td>

                  <td className="p-3.5 text-center font-mono font-black text-sm text-emerald-700 bg-emerald-50/30">
                    {emp.net_salary.toLocaleString()} ج.م
                  </td>

                  <td className="p-3.5 text-center">
                    <button
                      onClick={() => setSelectedPayslip({
                        employee_name: emp.full_name,
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
                      title="طباعة قسيمة الراتب"
                    >
                      <Printer className="w-3 h-3 text-blue-600" /> مفردات
                    </button>
                  </td>
                </tr>
              ))}

              {payrollData.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-slate-400 space-y-2">
                    <Info className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="font-bold text-slate-600">لم يتم تجهيز المسير بعد</p>
                    <p className="text-[11px] text-slate-400">
                      حدد الشهر والسنة ثم اضغط على "تجهيز واحتساب المسير" لجلب بيانات الموظفين والبدلات والسلف والغياب آلياً.
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
              إجمالي الموظفين: <strong>{payrollData.length}</strong> | إجمالي صافي الرواتب:{' '}
              <strong className="text-emerald-700 font-mono text-sm">{totals.net.toLocaleString()} ج.م</strong>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {existingPayroll?.status === 'paid' ? (
              <div className="flex items-center gap-2 bg-emerald-50 text-emerald-800 border border-emerald-200 px-5 py-2.5 rounded-xl text-xs font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                تم صرف هذا المسير وترحيل قيد النقدية بالكامل ✅
              </div>
            ) : existingPayroll?.status === 'accrued' ? (
              <>
                <button
                  onClick={handleRunAccrual}
                  disabled={savingAccrual || savingPayment}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 border border-slate-300 transition"
                  title="إعادة احتساب وتحديث قيد الاستحقاق بقيم المسير المعروضة"
                >
                  {savingAccrual ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  تحديث قيد الاستحقاق
                </button>

                <button
                  onClick={handlePayAccrued}
                  disabled={savingPayment || savingAccrual}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/25 transition"
                >
                  {savingPayment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
                  {savingPayment ? 'جاري تنفيذ قيد الصرف...' : 'صرف الرواتب وترحيل قيد النقدية (حـ/ 2251 ← الخزينة/البنك)'}
                </button>
              </>
            ) : (
              <>
                {/* زر إثبات قيد الاستحقاق المنفصل */}
                <button
                  onClick={handleRunAccrual}
                  disabled={savingAccrual || savingPayment}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg shadow-indigo-600/25 transition"
                >
                  {savingAccrual ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {savingAccrual ? 'جاري ترحيل الاستحقاق...' : '1. إثبات قيد الاستحقاق (حـ/ 2251 رواتب مستحقة)'}
                </button>

                {/* زر الصرف المباشر الفوري */}
                <button
                  onClick={handleRunPayrollDirect}
                  disabled={savingPayment || savingAccrual}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/25 transition"
                >
                  {savingPayment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
                  {savingPayment ? 'جاري الصرف المباشر...' : '2. صرف مباشر فوري (استحقاق + نقدية)'}
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
