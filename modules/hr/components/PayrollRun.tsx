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
import { payrollRunSchema, payrollItemSchema } from '../../../utils/validationSchemas';

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
  const { runPayroll: runPayrollFromContext, currentUser, currentSelectedOrgId, accounts, createMissingSystemAccounts, selectedFiscalYear, organization } = useAccounting();
  const { showToast } = useToast();
  const [payrollData, setPayrollData] = useState<PayrollItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(selectedFiscalYear || new Date().getFullYear());
  const [treasuryId, setTreasuryId] = useState('');
  const [treasuryAccounts, setTreasuryAccounts] = useState<any[]>([]);

  // Payslip Modal State
  const [selectedPayslip, setSelectedPayslip] = useState<PayslipData | null>(null);

  // مزامنة السنة المختارة مع السنة المالية للنظام
  useEffect(() => {
    if (selectedFiscalYear) {
      setSelectedYear(selectedFiscalYear);
    }
  }, [selectedFiscalYear]);

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

  const preparePayroll = async () => {
    setLoading(true);
    try {
      const targetOrg = currentSelectedOrgId || (currentUser as any)?.organization_id;

      // 1. التحقق من وجود مسير سابق لنفس الشهر
      const { data: existing } = await supabase
        .from('payrolls')
        .select('id')
        .eq('payroll_month', selectedMonth)
        .eq('payroll_year', selectedYear);
      
      if (existing && existing.length > 0) {
        if (!window.confirm(`تنبيه: يوجد بالفعل مسير رواتب مسجل لشهر ${selectedMonth}/${selectedYear}. هل تريد المتابعة وإنشاء مسير إضافي؟`)) {
          setLoading(false);
          return;
        }
      }

      // تحديد النطاق الزمني لشهر المسير
      const monthStartStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
      const lastDayNumber = new Date(selectedYear, selectedMonth, 0).getDate();
      const monthEndStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDayNumber).padStart(2, '0')}`;

      // 2. جلب البيانات بالتوازي: الموظفين، السلف، الإجازات، الحضور، الجزاءات والمكافآت
      const [empRes, advRes, leavesRes, attRes, penRes] = await Promise.all([
        supabase.from('employees').select('*').eq('status', 'active').eq('organization_id', targetOrg),
        supabase.from('employee_advances').select('*').eq('status', 'paid').is('payroll_item_id', null).eq('organization_id', targetOrg),
        supabase.from('hr_leave_requests').select('*').eq('organization_id', targetOrg).eq('status', 'APPROVED'),
        supabase.from('hr_attendance_logs').select('*').eq('organization_id', targetOrg).gte('log_date', monthStartStr).lte('log_date', monthEndStr),
        hrEnterpriseService.getPenaltiesRewards(targetOrg)
      ]);

      if (empRes.error) throw empRes.error;
      const employees = empRes.data || [];
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
        const overtimeAddition = Math.round(totalOvertimeHours * hourlyRate * 1.5 * 100) / 100;

        // د) الجزاءات والمكافآت الإدارية المعتمدة لهذا الشهر
        const empPenalties = penaltiesRewards.filter(
          p => p.employee_id === emp.id && p.type === 'PENALTY' && p.status === 'APPROVED' &&
               p.payroll_month === selectedMonth && p.payroll_year === selectedYear
        );
        const totalPenaltyAmount = empPenalties.reduce((sum, p) => sum + Number(p.calculated_amount || 0), 0);

        const empRewards = penaltiesRewards.filter(
          p => p.employee_id === emp.id && p.type === 'REWARD' && p.status === 'APPROVED' &&
               p.payroll_month === selectedMonth && p.payroll_year === selectedYear
        );
        const totalRewardAmount = empRewards.reduce((sum, p) => sum + Number(p.calculated_amount || 0), 0);

        // إجمالي الإضافي والخصومات
        const totalAdditions = Math.round((overtimeAddition + totalRewardAmount) * 100) / 100;
        const totalOtherDeductions = Math.round((unpaidLeaveDeduction + absenceDeduction + totalPenaltyAmount) * 100) / 100;

        // صافي الراتب المستحق
        const netSalary = Math.round((basicSalary + totalAdditions - totalAdvances - totalOtherDeductions) * 100) / 100;

        return {
          employee_id: emp.id,
          full_name: emp.full_name || emp.name || 'موظف بدون اسم',
          gross_salary: basicSalary,
          additions: totalAdditions,
          payroll_tax: 0,
          advances_deducted: totalAdvances,
          other_deductions: totalOtherDeductions,
          net_salary: Math.max(0, netSalary),
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
      showToast(`تم تجهيز المسير لـ ${preparedData.length} موظف واحتساب الإجازات والسلف والجزاءات بنجاح 📋`, 'success');
    } catch (error: any) {
      console.error(error);
      showToast('فشل تجهيز المسير: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
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

  const handleRunPayroll = async () => {
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

    if (payrollData.length === 0) {
      showToast('لا يوجد موظفون في المسير لتشغيله.', 'warning');
      return;
    }

    const requiredAccounts = [
      { code: SYSTEM_ACCOUNTS.SALARIES_EXPENSE, name: 'الرواتب والأجور' },
      { code: SYSTEM_ACCOUNTS.EMPLOYEE_BONUSES, name: 'مكافآت وحوافز' },
      { code: SYSTEM_ACCOUNTS.EMPLOYEE_DEDUCTIONS, name: 'خصومات وجزاءات' },
      { code: SYSTEM_ACCOUNTS.EMPLOYEE_ADVANCES, name: 'سلف الموظفين' },
      { code: SYSTEM_ACCOUNTS.PAYROLL_TAX, name: 'ضريبة كسب العمل' }
    ];

    const missingAccounts = requiredAccounts.filter(req => !accounts.find(a => a.code === req.code));

    if (missingAccounts.length > 0) {
      const confirmCreate = window.confirm(
        `عذراً، لا يمكن إتمام العملية.\nالحسابات التالية غير موجودة في الدليل المحاسبي:\n${missingAccounts.map(a => `- ${a.name} (كود: ${a.code})`).join('\n')}\n\nهل تريد إنشاء هذه الحسابات تلقائياً الآن؟`
      );

      if (confirmCreate) {
        try {
          const result = await createMissingSystemAccounts();
          if (result.success) {
            showToast(result.message + "\nتم تحديث الحسابات بنجاح. يمكنك الآن إعادة المحاولة.", 'success');
          } else {
            showToast('تم تحديث دليل الحسابات. يرجى المحاولة مرة أخرى.', 'info');
          }
        } catch (error: any) {
          showToast('حدث خطأ أثناء إنشاء الحسابات: ' + error.message, 'error');
        }
      }
      return;
    }

    setSaving(true);
    try {
      const orgId = currentSelectedOrgId || (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;

      await runPayrollFromContext(
        selectedMonth,
        selectedYear,
        new Date().toISOString().split('T')[0],
        treasuryId,
        payrollData,
        orgId
      );

      showToast('تم تنفيذ مسير الرواتب وترحيل القيد المحاسبي بنجاح 💰✅', 'success');
      setPayrollData([]);
    } catch (error: any) {
      console.error(error);
      showToast('فشل تنفيذ المسير: ' + error.message, 'error');
    } finally {
      setSaving(false);
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
              تجهيز وصرف الرواتب مع الاحتساب التلقائي للإجازات بدون أجر، السلف، الإضافي، والجزاءات
            </p>
          </div>
        </div>
      </div>

      {/* Control Panel */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-end">
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
            <Wallet className="w-3.5 h-3.5 text-emerald-600" /> حساب الصرف (الخزينة / البنك) <span className="text-red-500">*</span>
          </label>
          <select
            required
            value={treasuryId}
            onChange={e => setTreasuryId(e.target.value)}
            className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-800 bg-white outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">-- اختر حساب الصرف من الخزائن --</option>
            {treasuryAccounts.map(acc => (
              <option key={acc.id} value={acc.id}>{acc.name} {acc.code ? `(${acc.code})` : ''}</option>
            ))}
          </select>
        </div>

        <div>
          <button
            onClick={preparePayroll}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white p-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 transition h-[42px]"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            تجهيز واحتساب المسير
          </button>
        </div>
      </div>

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

          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
            <span className="text-[11px] text-slate-500 font-bold block">ضريبة كسب العمل (-)</span>
            <span className="text-sm font-black text-slate-700 font-mono mt-1 block">
              -{totals.taxes.toLocaleString()} ج.م
            </span>
          </div>

          <div className="bg-gradient-to-br from-emerald-600 to-teal-700 p-3.5 rounded-2xl text-white shadow-md">
            <span className="text-[11px] text-emerald-100 font-bold block">صافي الرواتب للصرف</span>
            <span className="text-sm font-black font-mono mt-1 block">
              {totals.net.toLocaleString()} ج.م
            </span>
          </div>
        </div>
      )}

      {/* Payroll Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3.5">الموظف</th>
                <th className="p-3.5 text-center">الراتب الأساسي</th>
                <th className="p-3.5 text-center text-emerald-700">إضافي ومكافآت (+)</th>
                <th className="p-3.5 text-center text-rose-600">السلف المستحقة (-)</th>
                <th className="p-3.5 text-center text-rose-600">ضريبة كسب العمل (-)</th>
                <th className="p-3.5 text-center text-rose-600">خصومات وجزاءات وإجازات (-)</th>
                <th className="p-3.5 text-center text-emerald-700 font-black">صافي الراتب</th>
                <th className="p-3.5 text-center">مفردات المرتب</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payrollData.map(emp => (
                <tr key={emp.employee_id} className="hover:bg-slate-50 transition">
                  <td className="p-3.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-xs">
                        {emp.full_name?.charAt(0) || 'م'}
                      </div>
                      <div>
                        <span className="font-bold text-slate-800 block text-xs">{emp.full_name}</span>
                        {emp.unpaid_leave_days > 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded font-bold mt-0.5">
                            🏖️ إجازة بدون أجر: {emp.unpaid_leave_days} يوم (-{emp.unpaid_leave_deduction.toFixed(2)} ج)
                          </span>
                        )}
                        {emp.absence_days > 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-bold mt-0.5 mr-1">
                            ⚠️ غياب: {emp.absence_days} يوم
                          </span>
                        )}
                        {emp.penalty_amount && emp.penalty_amount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-rose-800 bg-rose-100 px-1.5 py-0.5 rounded font-bold mt-0.5 mr-1">
                            ⚖️ جزاء إداري: -{emp.penalty_amount.toLocaleString()} ج
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </td>

                  <td className="p-3.5 text-center font-mono font-bold text-slate-700">
                    {emp.gross_salary.toLocaleString()} ج.م
                  </td>

                  <td className="p-3.5 text-center w-36">
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={emp.additions}
                      onChange={e => handleAdditionsChange(emp.employee_id, parseFloat(e.target.value) || 0)}
                      className="w-full border border-emerald-200 rounded-lg p-1.5 text-center font-mono font-bold text-emerald-700 outline-none focus:ring-2 focus:ring-emerald-500 bg-emerald-50/40"
                      placeholder="0"
                    />
                    {emp.overtime_hours > 0 && (
                      <span className="text-[10px] text-emerald-600 block mt-0.5">⚡ إضافي: {emp.overtime_hours} ساعة</span>
                    )}
                    {emp.reward_amount && emp.reward_amount > 0 ? (
                      <span className="text-[10px] text-emerald-700 font-bold block mt-0.5">🏆 مكافأة: +{emp.reward_amount.toLocaleString()} ج</span>
                    ) : null}
                  </td>

                  <td className="p-3.5 text-center font-mono font-bold text-rose-600">
                    {emp.advances_deducted > 0 ? (
                      <span className="px-2 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-xs">
                        -{emp.advances_deducted.toLocaleString()} ج.م
                      </span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>

                  <td className="p-3.5 text-center w-28">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={emp.payroll_tax}
                      onChange={e => handleTaxChange(emp.employee_id, parseFloat(e.target.value) || 0)}
                      className="w-full border border-slate-200 rounded-lg p-1.5 text-center font-mono font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      placeholder="0"
                    />
                  </td>

                  <td className="p-3.5 text-center w-40">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={emp.other_deductions}
                      onChange={e => handleDeductionChange(emp.employee_id, parseFloat(e.target.value) || 0)}
                      className="w-full border border-rose-200 rounded-lg p-1.5 text-center font-mono font-bold text-rose-700 outline-none focus:ring-2 focus:ring-rose-500 bg-rose-50/40"
                      placeholder="0"
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
                      حدد الشهر والسنة وحساب الصرف ثم اضغط على "تجهيز واحتساب المسير" لاحتساب الرواتب وخصومات الإجازات والسلف تلقائياً.
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
              جاهز لصرف <strong>{payrollData.length}</strong> موظف بإجمالي صافي{' '}
              <strong className="text-emerald-700 font-mono text-sm">{totals.net.toLocaleString()} ج.م</strong>
            </span>
          </div>

          <button
            onClick={handleRunPayroll}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/25 transition"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'جاري تنفيذ المسير وقيد الصرف...' : 'تنفيذ وصرف الرواتب وترحيل القيد المحاسبي'}
          </button>
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
