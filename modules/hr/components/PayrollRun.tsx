import { logger } from '../../../utils/logger';
import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../../../supabaseClient';
import { useAccounting, SYSTEM_ACCOUNTS } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import { hrEnterpriseService } from '../../../services/hrEnterpriseService';
import { fetchCompleteDataset } from '../../../services/balanceService';
import { getActiveOrgIdSync, resolveActiveOrgId } from '../../../services/tenantContext';
import { PayslipModal, PayslipData } from './PayslipModal';
import { BulkPayslipsModal } from './BulkPayslipsModal';
import {
  PayrollItem,
  calcPayrollNetSalary as calcNetSalary,
  sumPayrollTotals,
  exportPayrollToExcel,
  applyImportedPayrollRows
} from '../utils/payrollExcelUtils';
import { PayrollSummaryAndFilters } from './PayrollSummaryAndFilters';
import { PayrollTableSection } from './PayrollTableSection';
import { PayrollActionFooter } from './PayrollActionFooter';
import {
  Banknote,
  Play,
  Loader2,
  Wallet,
  Calendar,
  Clock,
  CheckCircle2,
  Printer,
  FileSpreadsheet,
  FileUp
} from 'lucide-react';
import {
  payrollRunSchema,
  payrollItemSchema,
  payrollAccrualSchema,
  payrollDisbursementSchema
} from '../../../utils/validationSchemas';

export type { PayrollItem };

const PayrollRun = () => {
  const {
    runPayroll: runPayrollFromContext,
    runPayrollAccrual,
    payAccruedPayroll,
    cancelPayrollAccrual,
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
  const [cancellingAccrual, setCancellingAccrual] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(selectedFiscalYear || new Date().getFullYear());
  const [treasuryId, setTreasuryId] = useState('');
  const [treasuryAccounts, setTreasuryAccounts] = useState<any[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [tableMode, setTableMode] = useState<'detailed' | 'summary'>('detailed');
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const isPayrollActionRef = React.useRef(false);
  const [importingExcel, setImportingExcel] = useState(false);

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
  const [showBulkPayslips, setShowBulkPayslips] = useState(false);

  // مزامنة السنة المختارة مع السنة المالية للنظام
  useEffect(() => {
    if (selectedFiscalYear) {
      setSelectedYear(selectedFiscalYear);
    }
  }, [selectedFiscalYear]);

  // جلب الخزائن والبنوك المتاحة
  useEffect(() => {
    const fetchTreasuries = async () => {
      const userOrgId = getActiveOrgIdSync(currentSelectedOrgId || (currentUser as any)?.organization_id) || await resolveActiveOrgId(currentSelectedOrgId || (currentUser as any)?.organization_id);
      
      let query = supabase
        .from('accounts')
        .select('id, name, code')
        .eq('is_group', false)
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
        logger.error("Error fetching payroll:", error);
        return;
      }

      if (data && data.length > 0) {
        const payroll = data[0];
        setExistingPayroll(payroll);
        if (payroll.accrual_date) setAccrualDate(payroll.accrual_date);
        if (payroll.payment_date) setPaymentDate(payroll.payment_date);
        if (payroll.treasury_account_id) setTreasuryId(payroll.treasury_account_id);

        // جلب بنود المسير المسجلة إذا كانت الشاشة فارغة بالتجزئة الكاملة
        const items = await fetchCompleteDataset<any>(async (from, to) => {
          return supabase
            .from('payroll_items')
            .select('*, employees(full_name, position, department)')
            .eq('payroll_id', payroll.id)
            .order('id', { ascending: true })
            .range(from, to);
        });

        if (items && items.length > 0) {
          // جلب السلف المرتبطة بهذه البنود فعلياً لحفظ معرفاتها الدقيقة
          let linkedAdvancesByEmp: Record<string, string[]> = {};
          try {
            const itemIds = items.map((i: { id: string }) => i.id);
            const { data: advData } = await supabase
              .from('employee_advances')
              .select('id, employee_id, payroll_item_id')
              .in('payroll_item_id', itemIds);
            if (advData) {
              advData.forEach((a: { id: string; employee_id: string }) => {
                if (!linkedAdvancesByEmp[a.employee_id]) linkedAdvancesByEmp[a.employee_id] = [];
                linkedAdvancesByEmp[a.employee_id].push(a.id);
              });
            }
          } catch (e) {
            logger.warn('Could not load linked advances:', e);
          }

          const mappedItems: PayrollItem[] = items.map((it: Record<string, any>) => ({
            employee_id: it.employee_id,
            full_name: it.employees?.full_name || 'موظف',
            department: it.employees?.department || '-',
            gross_salary: Number(it.gross_salary || 0),
            overtime_hours: Number(it.overtime_hours || 0),
            overtime_pay: Number(it.overtime_pay || 0),
            reward_amount: Number(it.reward_amount || 0),
            additions: Number(it.additions || 0),
            advances_deducted: Number(it.advances_deducted || 0),
            payroll_tax: Number(it.payroll_tax || 0),
            social_insurance: Number(it.social_insurance || 0),
            phone: it.employees?.phone || undefined,
            other_deductions: Number(it.other_deductions || 0),
            net_salary: Number(it.net_salary || 0),
            advances_ids: linkedAdvancesByEmp[it.employee_id] || [],
            unpaid_leave_days: Number(it.unpaid_leave_days || 0),
            unpaid_leave_deduction: Number(it.unpaid_leave_deduction || 0),
            absence_days: Number(it.absence_days || 0),
            absence_deduction: Number(it.absence_deduction || 0),
            late_minutes: Number(it.late_minutes || 0),
            late_deduction: Number(it.late_deduction || 0),
            penalty_amount: Number(it.penalty_amount || 0),
            // ✅ قيم الأيام الفعلية من السجل المحفوظ (أو المحسوبة من gross_salary إذا لم تُحفظ بعد)
            effective_days: Number(it.effective_days || 30),
            effective_salary: Number(it.effective_salary || it.net_salary || 0)
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
    const endOfMonth = getLastDayOfMonth(selectedYear, selectedMonth);
    setAccrualDate(endOfMonth);
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
      const hrScope = currentUser?.hr_scope || (currentUser as any)?.user_metadata?.hr_scope || 'all';

      const isFactoryDept = (dept: unknown) => {
        const d = String(dept || '').trim().toLowerCase();
        return d === 'المصنع' || d === 'مصنع' || d === 'factory';
      };

      // جلب معرفات بنود المسير الحالي إن وُجد
      let currentPayrollItemIds: string[] = [];
      if (existingPayroll?.id) {
        const { data: exItems } = await supabase.from('payroll_items').select('id').eq('payroll_id', existingPayroll.id);
        if (exItems) currentPayrollItemIds = exItems.map((i: { id: string }) => i.id);
      }

      // 🚀 جلب البيانات بالتوازي مع ضمان التجزئة الكاملة (fetchCompleteDataset) لمنع سقف 1000 سجل
      const [rawEmployees, advances, approvedLeaves, attendanceLogs, penaltiesRewards] = await Promise.all([
        fetchCompleteDataset<any>(async (from, to) => {
          // ✅ جلب النشطين + من تحولوا لغير نشط أو انتهت خدمتهم خلال شهر المسير
          let q = supabase
            .from('employees')
            .select('*')
            
            .order('id', { ascending: true });
          if (targetOrg) q = q.eq('organization_id', targetOrg);
          if (hrScope === 'factory') {
            q = q.in('department', ['المصنع', 'مصنع']);
          } else if (hrScope === 'branches') {
            q = q.not('department', 'in', '("المصنع","مصنع")');
          }
          return q.range(from, to);
        }),
        fetchCompleteDataset<any>(async (from, to) => {
          let q = supabase.from('employee_advances').select('*').order('id', { ascending: true });
          if (targetOrg) q = q.eq('organization_id', targetOrg);
          return q.range(from, to);
        }),
        fetchCompleteDataset<any>(async (from, to) => {
          let q = supabase.from('hr_leave_requests').select('*').eq('status', 'APPROVED').order('id', { ascending: true });
          if (targetOrg) q = q.eq('organization_id', targetOrg);
          return q.range(from, to);
        }),
        fetchCompleteDataset<any>(async (from, to) => {
          let q = supabase.from('hr_attendance_logs').select('*').gte('log_date', monthStartStr).lte('log_date', monthEndStr).order('log_date', { ascending: true });
          if (targetOrg) q = q.eq('organization_id', targetOrg);
          return q.range(from, to);
        }),
        hrEnterpriseService.getPenaltiesRewards(targetOrg)
      ]);

      // استخراج تاريخ انتهاء الخدمة أو الإيقاف إن وجد من أي حقل متاح أو الملاحظات
      const getTerminationDate = (e: Record<string, any>): string | null => {
        if (e.termination_date) return String(e.termination_date).slice(0, 10);
        if (e.last_working_date) return String(e.last_working_date).slice(0, 10);
        if (e.inactive_date) return String(e.inactive_date).slice(0, 10);
        if (e.deleted_at) return String(e.deleted_at).slice(0, 10);
        if (e.notes) {
          const match = String(e.notes).match(/\d{4}-\d{2}-\d{2}/);
          if (match) return match[0];
        }
        return null;
      };

      // ✅ تصفية الموظفين المستحقين: النشطين، أو من أوقفوا/انتهت خدمتهم خلال أو بعد هذا الشهر
      const eligibleEmployees = rawEmployees.filter((e: Record<string, any>) => {
        const st = String(e.status || 'active').toLowerCase();
        const termDate = getTerminationDate(e);
        // إذا كان الموظف غير نشط أو منتهي الخدمة أو محذوف
        if (st === 'inactive' || st === 'terminated' || st === 'resigned' || e.deleted_at) {
          // إذا لم يسجل تاريخ أو كان تاريخ تركه العمل قبل بداية هذا الشهر، يستبعد من المسير
          if (!termDate || termDate < monthStartStr) return false;
          // إذا كان تاريخ تركه العمل خلال أو بعد هذا الشهر، يتم ضمه لاحتساب أيامه المستحقة
          return true;
        }
        return true;
      });

      const employees = hrScope === 'factory'
        ? eligibleEmployees.filter((e: Record<string, unknown>) => isFactoryDept(e.department))
        : hrScope === 'branches'
          ? eligibleEmployees.filter((e: Record<string, unknown>) => !isFactoryDept(e.department))
          : eligibleEmployees;

      // ✅ دالة مساعدة: حساب الأيام الفعلية للموظف في الشهر
      // تأخذ في الاعتبار: تاريخ التعيين، تاريخ انتهاء الخدمة، وتغييرات الحالة
      const calcEffectiveWorkDays = (e: Record<string, any>): number => {
        // بداية العمل الفعلية: إما أول الشهر أو تاريخ التعيين أيهما أحدث
        const hireRaw = e.hire_date ? String(e.hire_date).slice(0, 10) : monthStartStr;
        const effectiveStart = hireRaw > monthStartStr ? hireRaw : monthStartStr;

        // نهاية العمل الفعلية: آخر يوم عمل أو تاريخ انتهاء الخدمة أو نهاية الشهر
        const termDate = getTerminationDate(e);
        const effectiveEnd = (termDate && termDate < monthEndStr) ? termDate : monthEndStr;

        if (effectiveStart > effectiveEnd) return 0;
        const msPerDay = 1000 * 60 * 60 * 24;
        const days = Math.round((new Date(effectiveEnd).getTime() - new Date(effectiveStart).getTime()) / msPerDay) + 1;
        return Math.max(0, Math.min(30, days));
      };

      const preparedData: PayrollItem[] = employees.map(emp => {
        const basicSalary = Number(emp.basic_salary || 0);
        const dailyRate = basicSalary > 0 ? basicSalary / 30 : 0;
        const hourlyRate = dailyRate > 0 ? dailyRate / 8 : 0;

        // ✅ حساب الأيام الفعلية بناءً على تاريخ التعيين، انتهاء الخدمة، أو الإيقاف المؤقت
        const effectiveDays = calcEffectiveWorkDays(emp);
        // الراتب المستحق فعلاً = (الراتب الأساسي / 30) × أيام العمل الفعلية
        const effectiveSalary = Math.round(effectiveDays * dailyRate * 100) / 100;

        // أ) السلف غير المخصومة لشهر المسير وما قبله (حتى نهاية شهر المسير المحدد فقط)
        const empAdvances = advances.filter(adv => {
          if (adv.employee_id !== emp.id) return false;
          const advDate = (adv.request_date || adv.advance_date || adv.date || (adv.created_at ? adv.created_at.split('T')[0] : '')).trim();
          // 🛡️ شرط صارم: منع خصم أي سلفة تاريخها يتجاوز نهاية شهر المسير المحدد
          if (advDate > monthEndStr) return false;
          // مؤهلة إذا كانت غير مخصومة أو مخصومة في نفس هذا المسير الحالي المعاد احتسابه
          const isEligible = (adv.status === 'paid' && !adv.payroll_item_id) ||
            (existingPayroll && currentPayrollItemIds.includes(adv.payroll_item_id));
          return isEligible;
        });
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

        // ج) سجلات الغياب غير المبرر والمصرح به وساعات الإضافي
        const empAttendance = attendanceLogs.filter((att: Record<string, unknown>) => att.employee_id === emp.id);
        const isAbsentRecord = (a: Record<string, unknown>) => {
          const s = String(a.status || '').trim().toUpperCase();
          if (
            s === 'ABSENT' ||
            s === 'UNEXCUSED_ABSENCE' ||
            s === 'EXCUSED_ABSENCE' ||
            s === 'غائب' ||
            s === 'غياب' ||
            s === 'غياب بإذن' ||
            s === 'غياب باذن' ||
            s === 'غياب بدون إذن' ||
            s === 'غياب بدون اذن' ||
            s.includes('غياب')
          ) {
            return true;
          }
          // إذا كانت الحالة مسجلة كإجازة بدون راتب في سجل الحضور
          if (s === 'ON_LEAVE' && (
            String(a.notes || '').includes('بدون راتب') || 
            String(a.notes || '').includes('بدون مرتب') || 
            String(a.notes || '').includes('غير مدفوع')
          )) {
            return true;
          }
          return false;
        };

        const absenceDays = empAttendance.filter(isAbsentRecord).length;
        const absenceDeduction = Math.round(absenceDays * dailyRate * 100) / 100;

        const totalLateMinutes = empAttendance.reduce((sum, a) => sum + Number(a.late_minutes || 0), 0);
        const lateHours = totalLateMinutes / 60;
        const lateDeduction = Math.round(lateHours * hourlyRate * 100) / 100;

        const totalOvertimeHours = empAttendance.reduce((sum, a) => sum + Number(a.overtime_hours || 0), 0);
        const overtimePay = Math.round(totalOvertimeHours * hourlyRate * 1.5 * 100) / 100;

        // د) الجزاءات والمكافآت المعتمدة خلال الشهر
        // يُعطى الأولوية لـ payroll_month/payroll_year المحفوظة، ثم action_date المحدد من المستخدم
        const empPenaltiesRewards = penaltiesRewards.filter(pr => {
          if (pr.employee_id !== emp.id) return false;
          if (pr.status && pr.status !== 'APPROVED') return false;
          // إذا كان payroll_month و payroll_year محفوظان - استخدمهما مباشرة
          if (pr.payroll_month && pr.payroll_year) {
            return Number(pr.payroll_month) === selectedMonth && Number(pr.payroll_year) === selectedYear;
          }
          // وإلا نستخدم action_date (التاريخ المحدد من المستخدم) وليس created_at
          const actionDate = pr.action_date || pr.created_at || '';
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
        const otherDeductions = Math.round((unpaidLeaveDeduction + absenceDeduction + lateDeduction + totalPenaltyAmount) * 100) / 100;

        // و) ضريبة كسب العمل التقديرية (افتراضياً 0 أو حسب الإعدادات)
        const socialInsurance = Number(emp.social_insurance || emp.insurance_amount || 0);
        const payrollTax = 0;

        // ✅ الصافي يعتمد على effectiveSalary (الراتب المستحق فعلاً) لا basicSalary الكامل
        const netSalary = Math.max(0, Math.round((effectiveSalary + additions - totalAdvances - otherDeductions - payrollTax - socialInsurance) * 100) / 100);

        return {
          employee_id: emp.id,
          full_name: emp.full_name,
          department: emp.department || '-',
          gross_salary: basicSalary,
          // ✅ الأيام والراتب الفعلي — مراعاةً لتاريخ التعيين/الإيقاف/انتهاء الخدمة
          effective_days: effectiveDays,
          effective_salary: effectiveSalary,
          additions,
          advances_deducted: totalAdvances,
          payroll_tax: payrollTax,
          social_insurance: socialInsurance,
          phone: emp.phone || undefined,
          other_deductions: otherDeductions,
          net_salary: netSalary,
          advances_ids: empAdvances.map(a => a.id),
          unpaid_leave_days: totalUnpaidLeaveDays,
          unpaid_leave_deduction: unpaidLeaveDeduction,
          absence_days: absenceDays,
          absence_deduction: absenceDeduction,
          late_minutes: totalLateMinutes,
          late_deduction: lateDeduction,
          overtime_hours: totalOvertimeHours,
          overtime_pay: overtimePay,
          penalty_amount: totalPenaltyAmount,
          reward_amount: totalRewardAmount
        };
      });

      setPayrollData(preparedData);
      showToast(`تم احتساب مسير رواتب شهر ${selectedMonth}/${selectedYear} بنجاح لعدد ${preparedData.length} موظف.`, 'success');
    } catch (err) {
      logger.error(err);
      showToast('حدث خطأ أثناء احتساب المسير: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };


  const handleGrossChange = (employeeId: string, value: number) => {
    setPayrollData(prev => prev.map(emp => {
      if (emp.employee_id === employeeId) {
        const val = Number(value) || 0;
        const days = emp.effective_days ?? 30;
        const effectiveSal = Math.round((val / 30) * days * 100) / 100;
        const newNet = calcNetSalary(
          effectiveSal,
          emp.additions,
          emp.advances_deducted,
          emp.other_deductions,
          emp.payroll_tax,
          emp.social_insurance || 0
        );
        return { ...emp, gross_salary: val, effective_salary: effectiveSal, net_salary: newNet };
      }
      return emp;
    }));
  };

  const handleEffectiveDaysChange = (employeeId: string, days: number) => {
    setPayrollData(prev => prev.map(emp => {
      if (emp.employee_id === employeeId) {
        const d = Math.max(0, Math.min(31, Number(days) || 0));
        const dailyRate = emp.gross_salary > 0 ? emp.gross_salary / 30 : 0;
        const effectiveSal = Math.round(d * dailyRate * 100) / 100;
        const newNet = calcNetSalary(
          effectiveSal,
          emp.additions,
          emp.advances_deducted,
          emp.other_deductions,
          emp.payroll_tax,
          emp.social_insurance || 0
        );
        return {
          ...emp,
          effective_days: d,
          effective_salary: effectiveSal,
          net_salary: newNet
        };
      }
      return emp;
    }));
  };

  const handleOvertimePayChange = (employeeId: string, value: number) => {
    setPayrollData(prev => prev.map(emp => {
      if (emp.employee_id === employeeId) {
        const val = Number(value) || 0;
        const newAdditions = Math.round((val + (emp.reward_amount || 0)) * 100) / 100;
        const baseSal = emp.effective_salary ?? emp.gross_salary;
        const newNet = calcNetSalary(
          baseSal,
          newAdditions,
          emp.advances_deducted,
          emp.other_deductions,
          emp.payroll_tax,
          emp.social_insurance || 0
        );
        return { ...emp, overtime_pay: val, additions: newAdditions, net_salary: newNet };
      }
      return emp;
    }));
  };

  const handleRewardChange = (employeeId: string, value: number) => {
    setPayrollData(prev => prev.map(emp => {
      if (emp.employee_id === employeeId) {
        const val = Number(value) || 0;
        const newAdditions = Math.round(((emp.overtime_pay || 0) + val) * 100) / 100;
        const baseSal = emp.effective_salary ?? emp.gross_salary;
        const newNet = calcNetSalary(
          baseSal,
          newAdditions,
          emp.advances_deducted,
          emp.other_deductions,
          emp.payroll_tax,
          emp.social_insurance || 0
        );
        return { ...emp, reward_amount: val, additions: newAdditions, net_salary: newNet };
      }
      return emp;
    }));
  };

  const handleAdditionsChange = (employeeId: string, value: number) => {
    setPayrollData(prev => prev.map(emp => {
      if (emp.employee_id === employeeId) {
        const val = Number(value) || 0;
        const baseSal = emp.effective_salary ?? emp.gross_salary;
        const newNet = calcNetSalary(
          baseSal,
          val,
          emp.advances_deducted,
          emp.other_deductions,
          emp.payroll_tax,
          emp.social_insurance || 0
        );
        return { ...emp, additions: val, net_salary: newNet };
      }
      return emp;
    }));
  };

  const handleAbsenceDaysChange = (employeeId: string, days: number) => {
    setPayrollData(prev => prev.map(emp => {
      if (emp.employee_id === employeeId) {
        const d = Math.max(0, Number(days) || 0);
        const dailyRate = emp.gross_salary > 0 ? emp.gross_salary / 30 : 0;
        const newDeduction = Math.round(d * dailyRate * 100) / 100;
        const newOtherDeductions = Math.round((newDeduction + (emp.late_deduction || 0) + (emp.penalty_amount || 0) + (emp.unpaid_leave_deduction || 0)) * 100) / 100;
        const baseSal = emp.effective_salary ?? emp.gross_salary;
        const newNet = calcNetSalary(
          baseSal,
          emp.additions,
          emp.advances_deducted,
          newOtherDeductions,
          emp.payroll_tax,
          emp.social_insurance || 0
        );
        return {
          ...emp,
          absence_days: d,
          absence_deduction: newDeduction,
          other_deductions: newOtherDeductions,
          net_salary: newNet
        };
      }
      return emp;
    }));
  };

  const handleAbsenceDeductionChange = (employeeId: string, value: number) => {
    setPayrollData(prev => prev.map(emp => {
      if (emp.employee_id === employeeId) {
        const val = Number(value) || 0;
        const dailyRate = emp.gross_salary > 0 ? emp.gross_salary / 30 : 0;
        const updatedDays = dailyRate > 0 ? Math.round((val / dailyRate) * 10) / 10 : emp.absence_days;
        const newOtherDeductions = Math.round((val + (emp.late_deduction || 0) + (emp.penalty_amount || 0) + (emp.unpaid_leave_deduction || 0)) * 100) / 100;
        const baseSal = emp.effective_salary ?? emp.gross_salary;
        const newNet = calcNetSalary(
          baseSal,
          emp.additions,
          emp.advances_deducted,
          newOtherDeductions,
          emp.payroll_tax,
          emp.social_insurance || 0
        );
        return { 
          ...emp, 
          absence_days: updatedDays,
          absence_deduction: val, 
          other_deductions: newOtherDeductions, 
          net_salary: newNet 
        };
      }
      return emp;
    }));
  };

  const handleLateDeductionChange = (employeeId: string, value: number) => {
    setPayrollData(prev => prev.map(emp => {
      if (emp.employee_id === employeeId) {
        const val = Number(value) || 0;
        const newOtherDeductions = Math.round(((emp.absence_deduction || 0) + val + (emp.penalty_amount || 0) + (emp.unpaid_leave_deduction || 0)) * 100) / 100;
        const baseSal = emp.effective_salary ?? emp.gross_salary;
        const newNet = calcNetSalary(
          baseSal,
          emp.additions,
          emp.advances_deducted,
          newOtherDeductions,
          emp.payroll_tax,
          emp.social_insurance || 0
        );
        return { ...emp, late_deduction: val, other_deductions: newOtherDeductions, net_salary: newNet };
      }
      return emp;
    }));
  };

  const handlePenaltyChange = (employeeId: string, value: number) => {
    setPayrollData(prev => prev.map(emp => {
      if (emp.employee_id === employeeId) {
        const val = Number(value) || 0;
        const newOtherDeductions = Math.round(((emp.absence_deduction || 0) + (emp.late_deduction || 0) + val + (emp.unpaid_leave_deduction || 0)) * 100) / 100;
        const baseSal = emp.effective_salary ?? emp.gross_salary;
        const newNet = calcNetSalary(
          baseSal,
          emp.additions,
          emp.advances_deducted,
          newOtherDeductions,
          emp.payroll_tax,
          emp.social_insurance || 0
        );
        return { ...emp, penalty_amount: val, other_deductions: newOtherDeductions, net_salary: newNet };
      }
      return emp;
    }));
  };

  const handleUnpaidLeaveDeductionChange = (employeeId: string, value: number) => {
    setPayrollData(prev => prev.map(emp => {
      if (emp.employee_id === employeeId) {
        const val = Number(value) || 0;
        const newOtherDeductions = Math.round(((emp.absence_deduction || 0) + (emp.late_deduction || 0) + (emp.penalty_amount || 0) + val) * 100) / 100;
        const baseSal = emp.effective_salary ?? emp.gross_salary;
        const newNet = calcNetSalary(
          baseSal,
          emp.additions,
          emp.advances_deducted,
          newOtherDeductions,
          emp.payroll_tax,
          emp.social_insurance || 0
        );
        return { ...emp, unpaid_leave_deduction: val, other_deductions: newOtherDeductions, net_salary: newNet };
      }
      return emp;
    }));
  };

  const handleDeductionChange = (employeeId: string, value: number) => {
    setPayrollData(prev => prev.map(emp => {
      if (emp.employee_id === employeeId) {
        const val = Number(value) || 0;
        const baseSal = emp.effective_salary ?? emp.gross_salary;
        const newNet = calcNetSalary(
          baseSal,
          emp.additions,
          emp.advances_deducted,
          val,
          emp.payroll_tax,
          emp.social_insurance || 0
        );
        return { ...emp, other_deductions: val, net_salary: newNet };
      }
      return emp;
    }));
  };

  const handleTaxChange = (employeeId: string, value: number) => {
    setPayrollData(prev => prev.map(emp => {
      if (emp.employee_id === employeeId) {
        const val = Number(value) || 0;
        const baseSal = emp.effective_salary ?? emp.gross_salary;
        const newNet = calcNetSalary(
          baseSal,
          emp.additions,
          emp.advances_deducted,
          emp.other_deductions,
          val,
          emp.social_insurance || 0
        );
        return { ...emp, payroll_tax: val, net_salary: newNet };
      }
      return emp;
    }));
  };

  const handleSocialInsuranceChange = (employeeId: string, value: number) => {
    setPayrollData(prev => prev.map(emp => {
      if (emp.employee_id === employeeId) {
        const val = Math.max(0, Number(value) || 0);
        const baseSal = emp.effective_salary ?? emp.gross_salary;
        const newNet = calcNetSalary(
          baseSal,
          emp.additions,
          emp.advances_deducted,
          emp.other_deductions,
          emp.payroll_tax,
          val
        );
        return { ...emp, social_insurance: val, net_salary: newNet };
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
        } catch (error) {
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

    if (isPayrollActionRef.current) return;
    if (!window.confirm(confirmMsg)) return;

    isPayrollActionRef.current = true;
    setSavingAccrual(true);
    try {
      const orgId = getActiveOrgIdSync(currentSelectedOrgId || (currentUser as any)?.organization_id) || await resolveActiveOrgId(currentSelectedOrgId || (currentUser as any)?.organization_id);
      if (!orgId) throw new Error('تعذر تحديد المنشأة النشطة');
      await runPayrollAccrual(
        selectedMonth,
        selectedYear,
        accrualDate,
        payrollData,
        orgId
      );

      showToast(`تم ترحيل قيد استحقاق رواتب شهر ${selectedMonth}/${selectedYear} بنجاح (حـ/ 2251 دائن) 📋✅`, 'success');
      await fetchExistingPayroll(selectedMonth, selectedYear);
    } catch (error) {
      logger.error(error);
      showToast('فشل ترحيل قيد الاستحقاق: ' + error.message, 'error');
    } finally {
      isPayrollActionRef.current = false;
      setSavingAccrual(false);
    }
  };

  // إلغاء قيد الاستحقاق وإعادة تعيين السلف لتصبح قائمة
  const handleCancelAccrual = async () => {
    if (isPayrollActionRef.current || !existingPayroll || existingPayroll.status !== 'accrued') return;

    const confirmMsg = `هل أنت متأكد من إلغاء قيد استحقاق رواتب شهر ${selectedMonth}/${selectedYear}؟\n\n` +
      `سيترتب على ذلك:\n` +
      `1. حذف قيد الاستحقاق المحاسبي.\n` +
      `2. إعادة جميع سلف الموظفين المرتبطة بهذا القيد لتصبح [تم الصرف (قائمة)].\n` +
      `3. إعادة تعيين المسير لتتمكن من إعادة احتسابه بدقة.\n\n` +
      `هل تريد المتابعة وإلغاء الاستحقاق؟`;

    if (!window.confirm(confirmMsg)) return;

    isPayrollActionRef.current = true;
    setCancellingAccrual(true);
    try {
      const orgId = getActiveOrgIdSync(currentSelectedOrgId || (currentUser as any)?.organization_id) || await resolveActiveOrgId(currentSelectedOrgId || (currentUser as any)?.organization_id);
      if (!orgId) throw new Error('تعذر تحديد المنشأة النشطة');
      await cancelPayrollAccrual(existingPayroll.id, orgId);
      showToast('تم إلغاء قيد الاستحقاق وإعادة جميع السلف كـ [قائمة] بنجاح 🔄✅', 'success');
      setPayrollData([]);
      await fetchExistingPayroll(selectedMonth, selectedYear);
    } catch (err: unknown) {
      logger.error('Error cancelling accrual:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      showToast('فشل إلغاء قيد الاستحقاق: ' + errMsg, 'error');
    } finally {
      isPayrollActionRef.current = false;
      setCancellingAccrual(false);
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

    if (isPayrollActionRef.current) return;
    if (!window.confirm(confirmMsg)) return;

    isPayrollActionRef.current = true;
    setSavingPayment(true);
    try {
      const orgId = getActiveOrgIdSync(currentSelectedOrgId || (currentUser as any)?.organization_id) || await resolveActiveOrgId(currentSelectedOrgId || (currentUser as any)?.organization_id);
      if (!orgId) throw new Error('تعذر تحديد المنشأة النشطة');

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
    } catch (error) {
      logger.error(error);
      showToast('فشل صرف الرواتب: ' + error.message, 'error');
    } finally {
      isPayrollActionRef.current = false;
      setSavingPayment(false);
    }
  };

  // 3️⃣ الصرف المباشر الفوري (استحقاق + نقدية بخطوة واحدة)
  const handleRunPayrollDirect = async () => {
    if (existingPayroll && existingPayroll.status === 'accrued') {
      showToast('تم إثبات استحقاق هذا الشهر مسبقاً. يرجى استخدام زر [صرف الرواتب وترحيل قيد النقدية] لإقفال حساب 2251 ومنع ازدواجية القيود.', 'warning');
      return;
    }
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

    if (isPayrollActionRef.current) return;
    if (!window.confirm(`هل أنت متأكد من صرف مسير الرواتب مباشرة وخصم (${totals.net.toLocaleString()} ج.م) فورياً من ${treasuryName}؟`)) return;

    isPayrollActionRef.current = true;
    setSavingPayment(true);
    try {
      const orgId = getActiveOrgIdSync(currentSelectedOrgId || (currentUser as any)?.organization_id) || await resolveActiveOrgId(currentSelectedOrgId || (currentUser as any)?.organization_id);
      if (!orgId) throw new Error('تعذر تحديد المنشأة النشطة');

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
    } catch (error) {
      logger.error(error);
      showToast('فشل تنفيذ المسير: ' + error.message, 'error');
    } finally {
      isPayrollActionRef.current = false;
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
    return payrollData.filter(p => {
      const matchDept = selectedDepartment === 'all' || (p.department || 'بدون فرع').trim() === selectedDepartment;
      const term = searchTerm.trim().toLowerCase();
      const matchSearch = !term ||
        (p.full_name || '').toLowerCase().includes(term) ||
        (p.department || '').toLowerCase().includes(term);
      return matchDept && matchSearch;
    });
  }, [payrollData, selectedDepartment, searchTerm]);

  const totals = useMemo(() => sumPayrollTotals(payrollData), [payrollData]);

  const displayedTotals = useMemo(() => sumPayrollTotals(filteredPayrollData), [filteredPayrollData]);

  // تصدير كشف مسير الرواتب إلى Excel بدقة متناهية وتنسيق تفصيلي شامل
  const handleExportExcel = () => {
    if (filteredPayrollData.length === 0) {
      showToast('لا توجد بيانات مسير للتصدير، يرجى تجهيز المسير أولاً', 'warning');
      return;
    }

    exportPayrollToExcel({
      items: filteredPayrollData,
      totals: displayedTotals,
      selectedMonth,
      selectedYear,
      selectedDepartment,
      searchTerm
    });

    showToast(`تم تصدير مسير رواتب شهر ${selectedMonth}/${selectedYear} لعدد ${filteredPayrollData.length} موظف إلى Excel بجميع الأعمدة المفصلة بنجاح ✅`, 'success');
  };

  // معالجة استيراد وتطبيق تعديلات مسير الرواتب من ملف Excel
  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (existingPayroll?.status === 'paid') {
      showToast('لا يمكن تعديل أو استيراد مسير تم صرفه وإقفاله محاسبياً', 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (payrollData.length === 0) {
      showToast('يرجى أولاً الضغط على "تجهيز واحتساب المسير" لجلب الموظفين، ثم استيراد التعديلات', 'warning');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setImportingExcel(true);
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws);

        if (!rows || rows.length === 0) {
          showToast('الملف المستورد فارغ ولا يحتوي على أي بيانات', 'warning');
          setImportingExcel(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }

        const { nextData, updatedCount, unmatchedList } = applyImportedPayrollRows(rows, payrollData);

        if (updatedCount > 0) {
          setPayrollData(nextData);
          if (unmatchedList.length > 0) {
            showToast(`تم استيراد وتحديث ${updatedCount} موظف بنجاح ✅ (تم تجاهل ${unmatchedList.length} سجل غير مطابق)`, 'info');
          } else {
            showToast(`تم استيراد وتحديث بيانات ${updatedCount} موظف من Excel بنجاح تام ✅`, 'success');
          }
        } else {
          showToast('لم يتم العثور على أي موظفين مطابقين لتحديثهم من الملف', 'warning');
        }
      } catch (err: unknown) {
        logger.error('Error importing payroll excel:', err);
        const message = err instanceof Error ? err.message : 'تأكد من صحة تنسيق الملف';
        showToast('حدث خطأ أثناء قراءة ملف Excel: ' + message, 'error');
      } finally {
        setImportingExcel(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };

    reader.onerror = () => {
      showToast('تعذر قراءة الملف المرفق', 'error');
      setImportingExcel(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };

    reader.readAsBinaryString(file);
  };

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
      {/* Hidden File Input for Excel Import */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".xlsx, .xls, .csv"
        className="hidden"
        onChange={handleImportExcel}
      />

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
              onChange={e => {
                const newMonth = Number(e.target.value);
                setSelectedMonth(newMonth);
                const endOfMonth = getLastDayOfMonth(selectedYear, newMonth);
                setAccrualDate(endOfMonth);
                setPaymentDate(endOfMonth);
              }}
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
            {paymentDate && !paymentDate.startsWith(`${selectedYear}-${String(selectedMonth).padStart(2, '0')}`) && (
              <span className="text-[10px] text-amber-600 font-bold block mt-1">
                ⚠️ تاريخ الصرف يختلف عن شهر المسير ({selectedMonth}/{selectedYear})
              </span>
            )}
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

          <div className="flex items-center gap-2">
            {payrollData.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setShowBulkPayslips(true)}
                  className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-md transition active:scale-95"
                  title="طباعة قسائم الرواتب لجميع موظفي المسير دفعة واحدة (كل موظف في صفحة A4 مستقلة)"
                >
                  <Printer className="w-4 h-4 text-sky-400" />
                  <span>طباعة كافة القسائم ({filteredPayrollData.length})</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition active:scale-95"
                  title="تصدير مسير الرواتب إلى Excel"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>تصدير المسير Excel</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importingExcel || existingPayroll?.status === 'paid'}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-md shadow-indigo-600/20 transition active:scale-95"
                  title="استيراد التعديلات من ملف Excel بعد تعديلها"
                >
                  {importingExcel ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
                  <span>استيراد من Excel</span>
                </button>
              </>
            )}
            <button
              onClick={preparePayroll}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-md shadow-blue-600/20 transition active:scale-95"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {existingPayroll ? 'إعادة احتساب وتجهيز المسير' : 'تجهيز واحتساب المسير'}
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

      {/* Search, Department Filters & Summary Cards */}
      <PayrollSummaryAndFilters
        payrollData={payrollData}
        filteredPayrollData={filteredPayrollData}
        departments={departments}
        selectedDepartment={selectedDepartment}
        onSelectDepartment={setSelectedDepartment}
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        displayedTotals={displayedTotals}
      />

      {/* Table Section */}
      <PayrollTableSection
        tableMode={tableMode}
        onTableModeChange={setTableMode}
        payrollData={payrollData}
        filteredPayrollData={filteredPayrollData}
        isPaid={existingPayroll?.status === 'paid'}
        loading={loading}
        searchTerm={searchTerm}
        onClearSearchTerm={() => setSearchTerm('')}
        onGrossChange={handleGrossChange}
        onEffectiveDaysChange={handleEffectiveDaysChange}
        onOvertimePayChange={handleOvertimePayChange}
        onRewardChange={handleRewardChange}
        onAdditionsChange={handleAdditionsChange}
        onAbsenceDaysChange={handleAbsenceDaysChange}
        onAbsenceDeductionChange={handleAbsenceDeductionChange}
        onLateDeductionChange={handleLateDeductionChange}
        onPenaltyChange={handlePenaltyChange}
        onUnpaidLeaveDeductionChange={handleUnpaidLeaveDeductionChange}
        onDeductionChange={handleDeductionChange}
        onTaxChange={handleTaxChange}
        onSocialInsuranceChange={handleSocialInsuranceChange}
        onSelectPayslip={(emp) => setSelectedPayslip({
          employee_name: emp.full_name,
          department: emp.department && emp.department !== '-' ? emp.department : undefined,
          month: selectedMonth,
          year: selectedYear,
          gross_salary: emp.gross_salary,
          effective_days: emp.effective_days,
          effective_salary: emp.effective_salary,
          additions: emp.additions,
          advances_deducted: emp.advances_deducted,
          payroll_tax: emp.payroll_tax,
          social_insurance: emp.social_insurance,
          other_deductions: emp.other_deductions,
          net_salary: emp.net_salary,
          unpaid_leave_days: emp.unpaid_leave_days,
          unpaid_leave_deduction: emp.unpaid_leave_deduction,
          absence_days: emp.absence_days,
          absence_deduction: emp.absence_deduction,
          late_minutes: emp.late_minutes,
          late_deduction: emp.late_deduction,
          penalty_amount: emp.penalty_amount,
          overtime_hours: emp.overtime_hours,
          phone: emp.phone,
          company_name: organization?.name
        })}
      />

      {/* Action Footer */}
      <PayrollActionFooter
        totalEmployees={payrollData.length}
        filteredCount={filteredPayrollData.length}
        totalNet={totals.net}
        payrollStatus={existingPayroll?.status}
        importingExcel={importingExcel}
        savingAccrual={savingAccrual}
        savingPayment={savingPayment}
        cancellingAccrual={cancellingAccrual}
        onShowBulkPayslips={() => setShowBulkPayslips(true)}
        onExportExcel={handleExportExcel}
        onTriggerImportExcel={() => fileInputRef.current?.click()}
        onRunAccrual={handleRunAccrual}
        onCancelAccrual={handleCancelAccrual}
        onPayAccrued={handlePayAccrued}
        onRunPayrollDirect={handleRunPayrollDirect}
      />

      {/* Payslip Modal */}
      {selectedPayslip && (
        <PayslipModal data={selectedPayslip} onClose={() => setSelectedPayslip(null)} />
      )}

      {/* Bulk Payslips Modal */}
      {showBulkPayslips && (
        <BulkPayslipsModal
          list={filteredPayrollData}
          month={selectedMonth}
          year={selectedYear}
          companyName={organization?.name}
          onClose={() => setShowBulkPayslips(false)}
        />
      )}
    </div>
  );
};

export default PayrollRun;
