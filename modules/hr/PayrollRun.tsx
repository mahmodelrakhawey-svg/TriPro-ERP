﻿﻿﻿import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting, SYSTEM_ACCOUNTS } from '../../context/AccountingContext';
import { Banknote, Play, Loader2, Save, User, Wallet } from 'lucide-react';

type PayrollItem = {
  employee_id: string;
  full_name: string;
  gross_salary: number;
  additions: number;
  advances_deducted: number;
  other_deductions: number;
  net_salary: number;
  advances_ids: string[];
};

const PayrollRun = () => {
  const { runPayroll: runPayrollFromContext, currentUser, accounts, createMissingSystemAccounts } = useAccounting(); // Renamed to avoid conflict
  const [payrollData, setPayrollData] = useState<PayrollItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [treasuryId, setTreasuryId] = useState('');
  const [treasuryAccounts, setTreasuryAccounts] = useState<any[]>([]);

  useEffect(() => {
    const fetchTreasuries = async () => {
      const { data } = await supabase
        .from('accounts')
        .select('id, name')
        .ilike('type', '%asset%')
        .or('name.ilike.%صندوق%,name.ilike.%خزينة%,name.ilike.%بنك%');
      if (data) setTreasuryAccounts(data);
    };
    fetchTreasuries();
  }, []);

  const preparePayroll = async () => {
    setLoading(true);
    try {
      // التحقق من وجود مسير سابق لنفس الشهر
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

      // 1. جلب الموظفين النشطين
      const { data: employees, error: empError } = await supabase.from('employees').select('*').eq('status', 'active');
      if (empError) throw empError;

      // 2. جلب السلف التي تم صرفها للموظفين ولم يتم خصمها بعد
      const { data: advances, error: advError } = await supabase.from('employee_advances').select('*').eq('status', 'paid').is('payroll_item_id', null);
      if (advError) throw advError;

      const preparedData = employees.map(emp => {
        const empAdvances = advances.filter(adv => adv.employee_id === emp.id);
        const totalAdvances = empAdvances.reduce((sum, adv) => sum + adv.amount, 0);
        const netSalary = (emp.salary || 0) - totalAdvances;
        
        return {
          employee_id: emp.id,
          full_name: emp.full_name,
          gross_salary: emp.salary || 0,
          additions: 0,
          advances_deducted: totalAdvances,
          other_deductions: 0,
          net_salary: netSalary,
          advances_ids: empAdvances.map(a => a.id)
        };
      });
      setPayrollData(preparedData);
    } catch (error: any) {
      alert('فشل تجهيز المسير: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAdditionsChange = (employeeId: string, value: number) => {
    setPayrollData(prev => prev.map(emp => {
      if (emp.employee_id === employeeId) {
        const newNet = emp.gross_salary + value - emp.advances_deducted - emp.other_deductions;
        return { ...emp, additions: value, net_salary: newNet };
      }
      return emp;
    }));
  };

  const handleDeductionChange = (employeeId: string, value: number) => {
    setPayrollData(prev => prev.map(emp => {
      if (emp.employee_id === employeeId) {
        const newNet = emp.gross_salary + emp.additions - emp.advances_deducted - value;
        return { ...emp, other_deductions: value, net_salary: newNet };
      }
      return emp;
    }));
  };

  const handleRunPayroll = async () => {
    if (!treasuryId) return alert('يرجى اختيار حساب الصرف (الخزينة/البنك)');
    if (payrollData.length === 0) return alert('لا يوجد بيانات في المسير');

    // التحقق من وجود الحسابات المحاسبية اللازمة للقيد
    const requiredAccounts = [
        { code: SYSTEM_ACCOUNTS.SALARIES_EXPENSE, name: 'الرواتب والأجور' },
        { code: SYSTEM_ACCOUNTS.EMPLOYEE_BONUSES, name: 'مكافآت وحوافز' },
        { code: SYSTEM_ACCOUNTS.EMPLOYEE_DEDUCTIONS, name: 'خصومات وجزاءات' },
        { code: SYSTEM_ACCOUNTS.EMPLOYEE_ADVANCES, name: 'سلف الموظفين' }
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
                    alert(result.message + "\nتم تحديث الحسابات بنجاح. يمكنك الآن إعادة المحاولة.");
                } else {
                    alert('تم تحديث دليل الحسابات. يرجى المحاولة مرة أخرى.');
                }
            } catch (error: any) {
                alert('حدث خطأ أثناء إنشاء الحسابات: ' + error.message);
            }
        }
        return;
    }

    setSaving(true);
    try {
      // Call the centralized payroll function from the context
      await runPayrollFromContext(
        `${selectedYear}-${selectedMonth}`,
        new Date().toISOString().split('T')[0],
        treasuryId,
        payrollData
      );

      alert('تم تنفيذ مسير الرواتب وترحيل القيد بنجاح ✅');
      setPayrollData([]);
    } catch (error: any) {
      alert('فشل تنفيذ المسير: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  // حماية الصفحة من مستخدم الديمو
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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Banknote className="text-blue-600" /> مسير الرواتب
            </h2>
            <p className="text-slate-500">تجهيز وصرف رواتب الموظفين الشهرية</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-end gap-4">
          <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">عن شهر</label>
              <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} className="w-full border rounded-lg p-2">
                  {[...Array(12)].map((_, i) => <option key={i+1} value={i+1}>{i+1}</option>)}
              </select>
          </div>
          <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">سنة</label>
              <input type="number" value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="w-full border rounded-lg p-2" />
          </div>
          <div className="flex-1">
              <label className="block text-sm font-bold text-slate-700 mb-1">حساب الصرف (الخزينة/البنك)</label>
              <select required value={treasuryId} onChange={e => setTreasuryId(e.target.value)} className="w-full border rounded-lg p-2">
                  <option value="">اختر حساب الصرف...</option>
                  {treasuryAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
              </select>
          </div>
          <button onClick={preparePayroll} disabled={loading} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-blue-700 transition-colors h-[42px]">
            {loading ? <Loader2 className="animate-spin" /> : <Play size={18} />}
            تجهيز المسير
          </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-right">
            <thead className="bg-slate-50 text-slate-600 font-bold text-sm">
                <tr>
                    <th className="p-4">الموظف</th>
                    <th className="p-4">الراتب الأساسي</th>
                    <th className="p-4 text-emerald-600">إضافي / مكافآت (+)</th>
                    <th className="p-4">السلف المستحقة</th>
                    <th className="p-4 text-red-600">خصومات / جزاءات (-)</th>
                    <th className="p-4">صافي الراتب</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {payrollData.map(emp => (
                    <tr key={emp.employee_id}>
                        <td className="p-4 font-bold">{emp.full_name}</td>
                        <td className="p-4">{emp.gross_salary.toLocaleString()}</td>
                        <td className="p-4 w-32">
                            <input 
                                type="number" 
                                min="0"
                                value={emp.additions}
                                onChange={e => handleAdditionsChange(emp.employee_id, parseFloat(e.target.value) || 0)}
                                className="w-full border rounded p-1 text-center border-emerald-200 focus:ring-emerald-500 focus:border-emerald-500"
                                placeholder="0"
                            />
                        </td>
                        <td className="p-4 text-red-500">{emp.advances_deducted.toLocaleString()}</td>
                        <td className="p-4 w-32">
                            <input 
                                type="number" 
                                min="0"
                                value={emp.other_deductions}
                                onChange={e => handleDeductionChange(emp.employee_id, parseFloat(e.target.value) || 0)}
                                className="w-full border rounded p-1 text-center border-red-200 focus:ring-red-500 focus:border-red-500"
                                placeholder="0"
                            />
                        </td>
                        <td className="p-4 font-bold text-emerald-600">{emp.net_salary.toLocaleString()}</td>
                    </tr>
                ))}
                {payrollData.length === 0 && !loading && (
                    <tr><td colSpan={5} className="p-8 text-center text-slate-400">اضغط على "تجهيز المسير" لبدء العملية</td></tr>
                )}
            </tbody>
        </table>
      </div>

      {payrollData.length > 0 && (
          <div className="flex justify-end">
              <button onClick={handleRunPayroll} disabled={saving} className="bg-emerald-600 text-white px-8 py-3 rounded-lg font-bold flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg">
                  {saving ? <Loader2 className="animate-spin" /> : <Save size={18} />}
                  تنفيذ وصرف الرواتب
              </button>
          </div>
      )}
    </div>
  );
};

export default PayrollRun;
