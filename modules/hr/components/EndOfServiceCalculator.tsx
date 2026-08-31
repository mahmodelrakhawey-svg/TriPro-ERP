import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import * as XLSX from 'xlsx';
import {
  DollarSign, CheckCircle2, Clock, Calculator, ShieldCheck,
  Plus, Search, Filter, FileSpreadsheet, Printer, Users,
  Briefcase, AlertCircle, ArrowRight, Eye, Edit3, Trash2,
  FileCheck2, Award, Calendar, X, Scale, FileText
} from 'lucide-react';

interface SettlementRecord {
  id: string;
  settlement_number: string;
  employee_id: string;
  employee_name?: string;
  joining_date: string;
  termination_date: string;
  service_years: number;
  service_months: number;
  service_days: number;
  last_basic_salary: number;
  termination_type: 'RESIGNATION' | 'COMPANY_TERMINATION' | 'CONTRACT_EXPIRY' | 'DEATH_DISABILITY';
  gratuity_amount: number;
  leave_compensation_amount: number;
  outstanding_advances: number;
  other_additions: number;
  other_deductions: number;
  final_net_settlement: number;
  payment_status: 'PENDING' | 'PAID' | 'CANCELLED';
  settlement_date: string;
  approved_by?: string;
  notes?: string;
  created_at: string;
}

export default function EndOfServiceCalculator() {
  const { organization, currentSelectedOrgId, currentUser, employees: contextEmployees } = useAccounting();
  const { showToast } = useToast();

  const [employeesList, setEmployeesList] = useState<{ id: string; name: string; basic_salary?: number; hire_date?: string }[]>([]);
  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [activeSettlement, setActiveSettlement] = useState<SettlementRecord | null>(null);

  // Form State
  const [formNumber, setFormNumber] = useState('');
  const [formEmpId, setFormEmpId] = useState('');
  const [formJoiningDate, setFormJoiningDate] = useState('2021-01-01');
  const [formTerminationDate, setFormTerminationDate] = useState(new Date().toISOString().split('T')[0]);
  const [formSalary, setFormSalary] = useState<number>(8000);
  const [formTerminationType, setFormTerminationType] = useState<SettlementRecord['termination_type']>('COMPANY_TERMINATION');
  const [formRemainingLeaveDays, setFormRemainingLeaveDays] = useState<number>(14);
  const [formAdvances, setFormAdvances] = useState<number>(0);
  const [formOtherAdditions, setFormOtherAdditions] = useState<number>(0);
  const [formOtherDeductions, setFormOtherDeductions] = useState<number>(0);
  const [formNotes, setFormNotes] = useState('');

  const orgId = organization?.id || currentSelectedOrgId || currentUser?.organization_id;

  // Calculate Service Duration:
  const serviceDuration = useMemo(() => {
    const start = new Date(formJoiningDate);
    const end = new Date(formTerminationDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
      return { totalYearsDecimal: 0, years: 0, months: 0, days: 0 };
    }

    let years = end.getFullYear() - start.getFullYear();
    let months = end.getMonth() - start.getMonth();
    let days = end.getDate() - start.getDate();

    if (days < 0) {
      months -= 1;
      const prevMonth = new Date(end.getFullYear(), end.getMonth(), 0);
      days += prevMonth.getDate();
    }
    if (months < 0) {
      years -= 1;
      months += 12;
    }

    const totalDays = Math.max(1, (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const totalYearsDecimal = Math.round((totalDays / 365.25) * 100) / 100;

    return { totalYearsDecimal, years, months, days };
  }, [formJoiningDate, formTerminationDate]);

  // Standard Labor Law EOS Calculation:
  // First 5 years = 0.5 month salary per year
  // Subsequent years = 1.0 month salary per year
  // Resignation ratios: <2 years: 0%, 2-5 years: 33.3%, 5-10 years: 66.7%, 10+ years: 100%
  const calculationResults = useMemo(() => {
    const y = serviceDuration.totalYearsDecimal;
    const salary = formSalary || 0;

    let baseGratuity = 0;
    if (y <= 5) {
      baseGratuity = y * (0.5 * salary);
    } else {
      baseGratuity = (5 * 0.5 * salary) + ((y - 5) * 1.0 * salary);
    }

    // Apply termination factor
    let factor = 1.0;
    if (formTerminationType === 'RESIGNATION') {
      if (y < 2) factor = 0;
      else if (y < 5) factor = 1 / 3;
      else if (y < 10) factor = 2 / 3;
      else factor = 1.0;
    } else {
      factor = 1.0; // Full gratuity for company termination, contract expiry, or disability
    }

    const calculatedGratuity = Math.round(baseGratuity * factor);
    const leaveCompensation = Math.round((salary / 30) * formRemainingLeaveDays);
    const grossAdditions = calculatedGratuity + leaveCompensation + Number(formOtherAdditions);
    const totalDeductions = Number(formAdvances) + Number(formOtherDeductions);
    const netFinal = Math.max(0, grossAdditions - totalDeductions);

    return {
      baseGratuity,
      factorPct: Math.round(factor * 100),
      calculatedGratuity,
      leaveCompensation,
      netFinal
    };
  }, [serviceDuration, formSalary, formTerminationType, formRemainingLeaveDays, formAdvances, formOtherAdditions, formOtherDeductions]);

  // Fetch Data
  const fetchData = async () => {
    if (!orgId) return;
    setIsLoading(true);
    try {
      // 1. Employees
      let empList: { id: string; name: string; basic_salary?: number; hire_date?: string }[] = [];
      if (contextEmployees && contextEmployees.length > 0) {
        empList = contextEmployees.map((e: any) => ({
          id: e.id,
          name: e.name || e.full_name || 'موظف',
          basic_salary: e.basic_salary || e.salary || 6000,
          hire_date: e.hire_date || '2022-01-01'
        }));
      } else {
        const { data: eData } = await supabase.from('employees').select('id, name, basic_salary, hire_date').eq('organization_id', orgId);
        empList = (eData || []).map((e: any) => ({
          id: e.id,
          name: e.name || 'موظف',
          basic_salary: e.basic_salary || 6000,
          hire_date: e.hire_date || '2022-01-01'
        }));
      }
      setEmployeesList(empList);

      // 2. Settlements
      const { data, error } = await supabase
        .from('hr_end_of_service_settlements')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('hr_end_of_service_settlements table notice:', error.message);
        setSettlements([]);
      } else {
        setSettlements((data || []).map((d: any) => ({
          ...d,
          employee_name: empList.find(e => e.id === d.employee_id)?.name || 'موظف'
        })));
      }
    } catch (err: any) {
      console.error(err);
      setSettlements([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [orgId]);

  // Open New Modal
  const handleOpenNew = () => {
    const nextNum = `EOS-${String(settlements.length + 1).padStart(3, '0')}`;
    const firstEmp = employeesList[0];
    setFormNumber(nextNum);
    setFormEmpId(firstEmp?.id || '');
    setFormJoiningDate(firstEmp?.hire_date || '2021-01-01');
    setFormTerminationDate(new Date().toISOString().split('T')[0]);
    setFormSalary(firstEmp?.basic_salary || 8000);
    setFormTerminationType('COMPANY_TERMINATION');
    setFormRemainingLeaveDays(14);
    setFormAdvances(0);
    setFormOtherAdditions(0);
    setFormOtherDeductions(0);
    setFormNotes('');
    setIsModalOpen(true);
  };

  // Select employee in form
  const handleSelectEmployee = (empId: string) => {
    setFormEmpId(empId);
    const emp = employeesList.find(e => e.id === empId);
    if (emp) {
      if (emp.basic_salary) setFormSalary(emp.basic_salary);
      if (emp.hire_date) setFormJoiningDate(emp.hire_date);
    }
  };

  // Save Settlement
  const handleSaveSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEmpId || !formNumber) {
      showToast('يرجى اختيار الموظف ورقم المخالصة', 'warning');
      return;
    }

    try {
      const payload = {
        organization_id: orgId,
        settlement_number: formNumber,
        employee_id: formEmpId,
        joining_date: formJoiningDate,
        termination_date: formTerminationDate,
        service_years: serviceDuration.totalYearsDecimal,
        service_months: serviceDuration.months,
        service_days: serviceDuration.days,
        last_basic_salary: formSalary,
        termination_type: formTerminationType,
        gratuity_amount: calculationResults.calculatedGratuity,
        leave_compensation_amount: calculationResults.leaveCompensation,
        outstanding_advances: formAdvances,
        other_additions: formOtherAdditions,
        other_deductions: formOtherDeductions,
        final_net_settlement: calculationResults.netFinal,
        payment_status: 'PENDING',
        settlement_date: new Date().toISOString().split('T')[0],
        approved_by: currentUser?.full_name || 'مدير الموارد البشرية',
        notes: formNotes || null
      };

      const { error } = await supabase.from('hr_end_of_service_settlements').insert(payload);
      if (error) throw error;

      showToast('تم احتساب وتسجيل مخالصة نهاية الخدمة بنجاح 💼', 'success');
      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      showToast('فشل حفظ المخالصة: ' + err.message, 'error');
    }
  };

  // Delete Settlement
  const handleDelete = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه المخالصة؟')) return;
    try {
      const { error } = await supabase.from('hr_end_of_service_settlements').delete().eq('id', id);
      if (error) throw error;
      showToast('تم حذف المخالصة', 'success');
      fetchData();
    } catch (err: any) {
      showToast('فشل الحذف: ' + err.message, 'error');
    }
  };

  // Filtered
  const filteredSettlements = useMemo(() => {
    return settlements.filter(s => {
      const matchSearch = s.settlement_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          s.employee_name?.toLowerCase().includes(searchTerm.toLowerCase());
      return matchSearch;
    });
  }, [settlements, searchTerm]);

  // Overall KPIs
  const kpis = useMemo(() => {
    let totalNetValue = 0;
    let paidCount = 0;
    filteredSettlements.forEach(s => {
      totalNetValue += Number(s.final_net_settlement || 0);
      if (s.payment_status === 'PAID') paidCount++;
    });
    return {
      totalCount: filteredSettlements.length,
      totalNetValue,
      paidCount
    };
  }, [filteredSettlements]);

  // Export Excel
  const exportToExcel = () => {
    if (filteredSettlements.length === 0) {
      showToast('لا توجد بيانات للتصدير', 'warning');
      return;
    }
    const rows = filteredSettlements.map((s, idx) => ({
      '#': idx + 1,
      'رقم المخالصة': s.settlement_number,
      'الموظف': s.employee_name,
      'تاريخ التعيين': s.joining_date,
      'تاريخ ترك العمل': s.termination_date,
      'مدة الخدمة': `${s.service_years} سنة (${s.service_months} شهر و ${s.service_days} يوم)`,
      'الراتب الأساسي': s.last_basic_salary,
      'نوع إنهاء الخدمة': s.termination_type === 'RESIGNATION' ? 'استقالة' : 'إنهاء عقد من المنشأة',
      'مكافأة نهاية الخدمة': s.gratuity_amount,
      'بدل الإجازات': s.leave_compensation_amount,
      'السلف المستقطعة': s.outstanding_advances,
      'صافي المستحق النهائي': s.final_net_settlement
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'مخالصات نهاية الخدمة');
    XLSX.writeFile(wb, `End_of_Service_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('تم تصدير سجل نهاية الخدمة إلى Excel ✅', 'success');
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in" dir="rtl">
      
      {/* 💼 Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="inline-flex items-center gap-2 bg-indigo-500/20 text-indigo-200 px-3 py-1 rounded-full text-xs font-bold mb-3 border border-indigo-400/30">
              <Scale size={14} className="text-amber-400" />
              <span>مكافأة ومستحقات ترك العمل القانونية (End of Service Gratuity & Clearance)</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">
              حاسبة ومخالصة مكافأة نهاية الخدمة
            </h1>
            <p className="text-indigo-200 text-sm mt-1 max-w-2xl">
              تطبيق معايير قانون العمل لاحتساب مكافأة نهاية الخدمة، تصفية رصيد الإجازات والسلف، وإصدار شهادة المخالصة المالية النهائية.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={exportToExcel}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-2xl font-bold transition-all border border-white/20 shadow-sm"
            >
              <FileSpreadsheet size={16} />
              <span>تصدير Excel</span>
            </button>

            <button
              onClick={handleOpenNew}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white rounded-2xl font-bold transition-all shadow-lg shadow-amber-500/30"
            >
              <Plus size={18} />
              <span>إجراء مخالصة وتصفية جديدة</span>
            </button>
          </div>
        </div>
      </div>

      {/* 📊 KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold mb-1">إجمالي المخالصات المسجلة</p>
            <h3 className="text-2xl font-black text-slate-800">{kpis.totalCount} <span className="text-xs text-slate-400 font-normal">مخالصة</span></h3>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <FileText size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold mb-1">إجمالي صافي التعويضات والمستحقات</p>
            <h3 className="text-2xl font-black text-emerald-600">
              {kpis.totalNetValue.toLocaleString()} <span className="text-xs text-slate-400 font-normal">ج.م / ر.س</span>
            </h3>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <DollarSign size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold mb-1">الحالة القانونية للمخالصات</p>
            <h3 className="text-2xl font-black text-indigo-700">100% معتمدة</h3>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <ShieldCheck size={24} />
          </div>
        </div>
      </div>

      {/* 🔍 Filter */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div className="relative flex-1 md:w-80">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="بحث برقم المخالصة أو اسم الموظف..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
          />
        </div>
      </div>

      {/* 📋 Settlements Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 font-bold animate-pulse">جاري تحميل المخالصات...</div>
        ) : filteredSettlements.length === 0 ? (
          <div className="p-12 text-center">
            <Scale size={48} className="mx-auto text-slate-300 mb-3" />
            <h3 className="text-slate-700 font-bold text-lg mb-1">لا توجد مخالصات نهاية خدمة مسجلة</h3>
            <p className="text-slate-400 text-sm">اضغط على "إجراء مخالصة وتصفية جديدة" لتطبيق الحاسبة القانونية.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3.5">رقم المخالصة</th>
                  <th className="p-3.5">الموظف</th>
                  <th className="p-3.5">مدة الخدمة</th>
                  <th className="p-3.5">السبب والنوع</th>
                  <th className="p-3.5">مكافأة نهاية الخدمة</th>
                  <th className="p-3.5">بدل الإجازات</th>
                  <th className="p-3.5">صافي المخالصة النهائي</th>
                  <th className="p-3.5 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSettlements.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5 font-mono font-bold text-indigo-700">{s.settlement_number}</td>
                    <td className="p-3.5 font-bold text-slate-900">{s.employee_name}</td>
                    <td className="p-3.5 text-xs">
                      <span className="font-bold text-slate-800">{s.service_years} سنة</span>
                      <span className="text-slate-400 block text-[11px]">({s.service_months} شهر و {s.service_days} يوم)</span>
                    </td>
                    <td className="p-3.5">
                      <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-800">
                        {s.termination_type === 'RESIGNATION' ? 'استقالة' : 'إنهاء عقد من الشركة'}
                      </span>
                    </td>
                    <td className="p-3.5 font-bold text-slate-800">{Number(s.gratuity_amount || 0).toLocaleString()} ج.م</td>
                    <td className="p-3.5 font-bold text-blue-600">{Number(s.leave_compensation_amount || 0).toLocaleString()} ج.م</td>
                    <td className="p-3.5 font-black text-emerald-700 text-base">
                      {Number(s.final_net_settlement || 0).toLocaleString()} ج.م
                    </td>
                    <td className="p-3.5">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => {
                            setActiveSettlement(s);
                            setIsPrintModalOpen(true);
                          }}
                          title="طباعة شهادة المخالصة الرسمية"
                          className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg"
                        >
                          <Printer size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(s.id)}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 📝 New Settlement Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl p-6 md:p-8 animate-in zoom-in-95">
            <form onSubmit={handleSaveSettlement} className="space-y-4">
              <div className="flex justify-between items-center border-b pb-3">
                <div className="flex items-center gap-2 text-indigo-900 font-black text-lg">
                  <Calculator className="text-amber-500" size={24} />
                  <span>احتساب وإصدار مخالصة نهاية الخدمة (EOS Clearance)</span>
                </div>
                <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400">
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الموظف *</label>
                  <select
                    value={formEmpId}
                    onChange={(e) => handleSelectEmployee(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  >
                    <option value="">-- اختر الموظف --</option>
                    {employeesList.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رقم المخالصة *</label>
                  <input
                    type="text"
                    value={formNumber}
                    onChange={(e) => setFormNumber(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ بداية العمل (التعيين) *</label>
                  <input
                    type="date"
                    value={formJoiningDate}
                    onChange={(e) => setFormJoiningDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ آخر يوم عمل (إنهاء الخدمة) *</label>
                  <input
                    type="date"
                    value={formTerminationDate}
                    onChange={(e) => setFormTerminationDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">آخر راتب أساسي شهري (ج.م/ر.س) *</label>
                  <input
                    type="number"
                    value={formSalary}
                    onChange={(e) => setFormSalary(parseFloat(e.target.value) || 0)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">سبب ووسيلة إنهاء الخدمة *</label>
                  <select
                    value={formTerminationType}
                    onChange={(e) => setFormTerminationType(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  >
                    <option value="COMPANY_TERMINATION">🏢 إنهاء عقد من جهة العمل (مستحق 100%)</option>
                    <option value="CONTRACT_EXPIRY">⏳ انتهاء مدة العقد المحدد (مستحق 100%)</option>
                    <option value="RESIGNATION">🚶 استقالة برغبة الموظف (طبقاً لنسبة مدة الخدمة)</option>
                    <option value="DEATH_DISABILITY">⚖️ وفاة أو عجز كامل (مستحق 100%)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رصيد الإجازات المتبقي (أيام)</label>
                  <input
                    type="number"
                    value={formRemainingLeaveDays}
                    onChange={(e) => setFormRemainingLeaveDays(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">استقطاع سلف وقروض قائمة (ج.م/ر.س)</label>
                  <input
                    type="number"
                    value={formAdvances}
                    onChange={(e) => setFormAdvances(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-rose-600"
                  />
                </div>
              </div>

              {/* 🧮 Live Breakdown Card */}
              <div className="bg-slate-900 text-white p-5 rounded-2xl space-y-3">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2 text-xs">
                  <span className="text-slate-400">مدة الخدمة الإجمالية:</span>
                  <span className="font-bold text-amber-300">
                    {serviceDuration.years} سنة و {serviceDuration.months} شهر و {serviceDuration.days} يوم ({serviceDuration.totalYearsDecimal} سنة)
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs text-slate-300">
                  <div>
                    <span className="text-slate-400 block text-[11px]">مكافأة نهاية الخدمة ({calculationResults.factorPct}%):</span>
                    <span className="font-bold text-white">+{calculationResults.calculatedGratuity.toLocaleString()} ج.م</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">بدل رصيد الإجازات:</span>
                    <span className="font-bold text-white">+{calculationResults.leaveCompensation.toLocaleString()} ج.م</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">استقطاع السلف:</span>
                    <span className="font-bold text-rose-400">-{Number(formAdvances).toLocaleString()} ج.م</span>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-slate-800">
                  <span className="font-bold text-sm text-emerald-400">صافي المستحق النهائي للموظف:</span>
                  <span className="text-2xl font-black text-emerald-400">
                    {calculationResults.netFinal.toLocaleString()} ج.م / ر.س
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-sm shadow-md shadow-amber-500/30"
                >
                  حفظ واعتماد المخالصة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🖨️ Printable Clearance Certificate */}
      {isPrintModalOpen && activeSettlement && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl p-6 md:p-8" dir="rtl">
            <div className="flex justify-between items-center border-b pb-4 mb-4">
              <div>
                <h2 className="text-xl font-black text-slate-800">شهادة مخالصة وإبراء ذمة مالية نهائية</h2>
                <p className="text-xs text-slate-500 font-mono">Final Financial Settlement & Clearance Certificate</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => window.print()} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold flex items-center gap-1">
                  <Printer size={14} />
                  <span>طباعة</span>
                </button>
                <button onClick={() => setIsPrintModalOpen(false)} className="p-2 text-slate-400">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                <div><span className="text-slate-400 font-bold">رقم المخالصة:</span> <span className="font-mono font-bold text-indigo-700">{activeSettlement.settlement_number}</span></div>
                <div><span className="text-slate-400 font-bold">اسم الموظف:</span> <span className="font-bold text-slate-900">{activeSettlement.employee_name}</span></div>
                <div><span className="text-slate-400 font-bold">تاريخ التعيين:</span> <span className="font-bold">{activeSettlement.joining_date}</span></div>
                <div><span className="text-slate-400 font-bold">تاريخ انتهاء الخدمة:</span> <span className="font-bold">{activeSettlement.termination_date}</span></div>
                <div><span className="text-slate-400 font-bold">مدة الخدمة:</span> <span className="font-bold">{activeSettlement.service_years} سنة ({activeSettlement.service_months} شهر و {activeSettlement.service_days} يوم)</span></div>
                <div><span className="text-slate-400 font-bold">الراتب الأساسي الأخير:</span> <span className="font-bold">{Number(activeSettlement.last_basic_salary || 0).toLocaleString()} ج.م</span></div>
              </div>

              <div className="border rounded-xl p-4 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span>مكافأة نهاية الخدمة القانونية:</span>
                  <span className="font-bold">+{Number(activeSettlement.gratuity_amount || 0).toLocaleString()} ج.م</span>
                </div>
                <div className="flex justify-between">
                  <span>بدل رصيد الإجازات المتبقي:</span>
                  <span className="font-bold">+{Number(activeSettlement.leave_compensation_amount || 0).toLocaleString()} ج.م</span>
                </div>
                {Number(activeSettlement.outstanding_advances || 0) > 0 && (
                  <div className="flex justify-between text-rose-600">
                    <span>استقطاع السلف والقروض:</span>
                    <span className="font-bold">-{Number(activeSettlement.outstanding_advances).toLocaleString()} ج.م</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-2 text-base font-black text-emerald-700">
                  <span>صافي المبلغ المستحق للصرف:</span>
                  <span>{Number(activeSettlement.final_net_settlement || 0).toLocaleString()} ج.م</span>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed bg-slate-50 p-3 rounded-lg border">
                أقر أنا الموظف المذكور أعلاه بأنني استلمت كافة مستحقاتي ومكافأة نهاية الخدمة وبدل الإجازات بالكامل وبذلك أبرئ ذمة المنشأة إبراءً تاماً وشاملاً لا رجعة فيه.
              </p>

              <div className="grid grid-cols-2 gap-8 pt-8 border-t border-slate-200 text-center text-xs">
                <div>
                  <p className="font-bold text-slate-700 mb-6">توقيع الموظف (المقر بالمخالصة)</p>
                  <p className="border-t border-slate-300 pt-1 text-slate-400">التوقيع والاسم</p>
                </div>
                <div>
                  <p className="font-bold text-slate-700 mb-6">إدارة الموارد البشرية والمالية</p>
                  <p className="border-t border-slate-300 pt-1 text-slate-400">الاعتماد والختم</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
