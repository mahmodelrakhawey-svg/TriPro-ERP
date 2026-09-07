import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import * as XLSX from 'xlsx';
import {
  Calendar, CheckCircle2, Clock, XCircle, AlertCircle,
  Plus, Search, Filter, FileSpreadsheet, Printer, Users,
  UserCheck, ShieldCheck, ArrowRight, Eye, Edit3, Trash2,
  FileText, Briefcase, ChevronRight, X, Percent
} from 'lucide-react';

interface LeaveBalance {
  id: string;
  employee_id: string;
  employee_name?: string;
  fiscal_year: number;
  annual_leave_allowance: number;
  used_days: number;
  remaining_days: number;
}

interface LeaveRequest {
  id: string;
  employee_id: string;
  employee_name?: string;
  leave_type: 'ANNUAL' | 'SICK' | 'CASUAL' | 'UNPAID' | 'HAJJ' | 'MATERNITY';
  start_date: string;
  end_date: string;
  total_days: number;
  is_paid: boolean;
  reason?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approved_by?: string;
  approval_date?: string;
  rejection_reason?: string;
  created_at: string;
}

export default function LeaveManager() {
  const { organization, currentSelectedOrgId, currentUser, employees: contextEmployees } = useAccounting();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'REQUESTS' | 'BALANCES'>('REQUESTS');
  const [employeesList, setEmployeesList] = useState<{ id: string; name: string }[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedEmpId, setSelectedEmpId] = useState('ALL');

  // Modals
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isDecisionModalOpen, setIsDecisionModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [activeRequest, setActiveRequest] = useState<LeaveRequest | null>(null);

  // Form State
  const [formEmpId, setFormEmpId] = useState('');
  const [formType, setFormType] = useState<LeaveRequest['leave_type']>('ANNUAL');
  const [formStartDate, setFormStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [formEndDate, setFormEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [formReason, setFormReason] = useState('');

  // Decision Form
  const [decisionType, setDecisionType] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [decisionNotes, setDecisionNotes] = useState('');

  const orgId = organization?.id || currentSelectedOrgId || currentUser?.organization_id;

  // Calculate Days
  const calculatedDays = useMemo(() => {
    if (!formStartDate || !formEndDate) return 1;
    const start = new Date(formStartDate);
    const end = new Date(formEndDate);
    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays > 0 ? diffDays : 1;
  }, [formStartDate, formEndDate]);

  // Leave Type Info
  const getLeaveTypeLabel = (type: string) => {
    switch (type) {
      case 'ANNUAL': return { label: 'سنوية اعتيادية (مدفوعة)', color: 'bg-blue-100 text-blue-800' };
      case 'SICK': return { label: 'مرضية', color: 'bg-amber-100 text-amber-800' };
      case 'CASUAL': return { label: 'عارضة', color: 'bg-purple-100 text-purple-800' };
      case 'UNPAID': return { label: 'بدون راتب', color: 'bg-rose-100 text-rose-800' };
      case 'HAJJ': return { label: 'حج وزيارة', color: 'bg-emerald-100 text-emerald-800' };
      case 'MATERNITY': return { label: 'أمومة ووضع', color: 'bg-pink-100 text-pink-800' };
      default: return { label: type, color: 'bg-slate-100 text-slate-800' };
    }
  };

  // Fetch Data
  const fetchData = async () => {
    if (!orgId) return;
    setIsLoading(true);
    try {
      // 1. Fetch Employees
      let empList: { id: string; name: string }[] = [];
      if (contextEmployees && contextEmployees.length > 0) {
        empList = contextEmployees.map((e: any) => ({ id: e.id, name: e.name || e.full_name || 'موظف' }));
      } else {
        const { data: eData } = await supabase.from('employees').select('id, name').eq('organization_id', orgId);
        empList = (eData || []).map((e: any) => ({ id: e.id, name: e.name || 'موظف' }));
      }
      setEmployeesList(empList);

      // 2. Fetch Leave Requests
      const { data: reqData, error: reqErr } = await supabase
        .from('hr_leave_requests')
        .select('*')
        .eq('organization_id', orgId)
        .order('start_date', { ascending: false });

      if (reqErr) {
        console.warn('hr_leave_requests table notice:', reqErr.message);
        setRequests([]);
      } else {
        setRequests((reqData || []).map((r: any) => ({
          ...r,
          employee_name: empList.find(e => e.id === r.employee_id)?.name || 'موظف'
        })));
      }

      // 3. Fetch Balances
      const { data: balData, error: balErr } = await supabase
        .from('hr_leave_balances')
        .select('*')
        .eq('organization_id', orgId);

      if (balErr) {
        console.warn('hr_leave_balances table notice:', balErr.message);
        setBalances([]);
      } else {
        setBalances((balData || []).map((b: any) => ({
          ...b,
          employee_name: empList.find(e => e.id === b.employee_id)?.name || 'موظف'
        })));
      }
    } catch (err: any) {
      console.error(err);
      setRequests([]);
      setBalances([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [orgId]);

  // Open New Modal
  const handleOpenNew = () => {
    setFormEmpId(employeesList[0]?.id || '');
    setFormType('ANNUAL');
    setFormStartDate(new Date().toISOString().split('T')[0]);
    setFormEndDate(new Date().toISOString().split('T')[0]);
    setFormReason('');
    setIsNewModalOpen(true);
  };

  // Submit Leave Request
  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEmpId) {
      showToast('يرجى اختيار الموظف', 'warning');
      return;
    }

    try {
      const isPaid = formType !== 'UNPAID';
      const payload = {
        organization_id: orgId,
        employee_id: formEmpId,
        leave_type: formType,
        start_date: formStartDate,
        end_date: formEndDate,
        total_days: calculatedDays,
        is_paid: isPaid,
        reason: formReason || null,
        status: 'PENDING'
      };

      const { error } = await supabase.from('hr_leave_requests').insert(payload);
      if (error) throw error;

      showToast('تم تقديم طلب الإجازة بنجاح 🏖️', 'success');
      setIsNewModalOpen(false);
      fetchData();
    } catch (err: any) {
      showToast('فشل تقديم الطلب: ' + err.message, 'error');
    }
  };

  // Decision on Request (Approve / Reject)
  const handleSaveDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRequest) return;

    try {
      const isApproved = decisionType === 'APPROVED';
      const { error } = await supabase
        .from('hr_leave_requests')
        .update({
          status: isApproved ? 'APPROVED' : 'REJECTED',
          approved_by: currentUser?.full_name || 'مدير الموارد البشرية',
          approval_date: new Date().toISOString().split('T')[0],
          rejection_reason: !isApproved ? decisionNotes : null
        })
        .eq('id', activeRequest.id);

      if (error) throw error;

      // If approved and annual leave, deduct from balance
      if (isApproved && activeRequest.leave_type === 'ANNUAL') {
        const currentYear = new Date().getFullYear();
        const existingBal = balances.find(b => b.employee_id === activeRequest.employee_id && b.fiscal_year === currentYear);
        if (existingBal) {
          const newUsed = Number(existingBal.used_days) + Number(activeRequest.total_days);
          const newRemaining = Math.max(0, Number(existingBal.annual_leave_allowance) - newUsed);
          await supabase.from('hr_leave_balances').update({
            used_days: newUsed,
            remaining_days: newRemaining
          }).eq('id', existingBal.id);
        }
      }

      showToast(isApproved ? 'تم اعتماد الإجازة بنجاح ✅' : 'تم رفض الإجازة', 'info');
      setIsDecisionModalOpen(false);
      fetchData();
    } catch (err: any) {
      showToast('فشل تحديث القرار: ' + err.message, 'error');
    }
  };

  // Delete Request
  const handleDelete = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا السجل؟')) return;
    try {
      const { error } = await supabase.from('hr_leave_requests').delete().eq('id', id);
      if (error) throw error;
      showToast('تم حذف الطلب', 'success');
      fetchData();
    } catch (err: any) {
      showToast('فشل الحذف: ' + err.message, 'error');
    }
  };

  // Filtered Requests
  const filteredRequests = useMemo(() => {
    return requests.filter(r => {
      const matchSearch = r.employee_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          r.reason?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === 'ALL' || r.status === statusFilter;
      const matchEmp = selectedEmpId === 'ALL' || r.employee_id === selectedEmpId;
      return matchSearch && matchStatus && matchEmp;
    });
  }, [requests, searchTerm, statusFilter, selectedEmpId]);

  // KPIs
  const kpis = useMemo(() => {
    let pendingCount = 0;
    let approvedCount = 0;
    let totalLeaveDays = 0;

    requests.forEach(r => {
      if (r.status === 'PENDING') pendingCount++;
      if (r.status === 'APPROVED') {
        approvedCount++;
        totalLeaveDays += Number(r.total_days || 0);
      }
    });

    return {
      pendingCount,
      approvedCount,
      totalLeaveDays,
      totalRequests: requests.length
    };
  }, [requests]);

  // Export Excel
  const exportToExcel = () => {
    if (filteredRequests.length === 0) {
      showToast('لا توجد بيانات للتصدير', 'warning');
      return;
    }
    const rows = filteredRequests.map((r, idx) => ({
      '#': idx + 1,
      'الموظف': r.employee_name,
      'نوع الإجازة': getLeaveTypeLabel(r.leave_type).label,
      'من تاريخ': r.start_date,
      'إلى تاريخ': r.end_date,
      'عدد الأيام': r.total_days,
      'مدفوعة الأجر': r.is_paid ? 'نعم' : 'لا',
      'الحالة': r.status === 'APPROVED' ? 'معتمدة' : r.status === 'REJECTED' ? 'مرفوضة' : 'قيد المراجعة',
      'السبب': r.reason || '---'
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'سجل الإجازات');
    XLSX.writeFile(wb, `Leaves_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('تم تصدير سجل الإجازات إلى Excel ✅', 'success');
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in" dir="rtl">
      
      {/* 🏖️ Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="inline-flex items-center gap-2 bg-indigo-500/20 text-indigo-200 px-3 py-1 rounded-full text-xs font-bold mb-3 border border-indigo-400/30">
              <Calendar size={14} className="text-amber-400" />
              <span>إدارة الحضور والأرصدة (Employee Leave & Balances Hub)</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">
              إدارة وأرصدة إجازات الموظفين
            </h1>
            <p className="text-indigo-200 text-sm mt-1 max-w-2xl">
              تتبع الأرصدة السنوية المستحقة والمستهلكة، تقديم واعتماد طلبات الإجازات، والخصم التلقائي من مسير الرواتب.
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
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-2xl font-bold transition-all shadow-lg shadow-emerald-500/30"
            >
              <Plus size={18} />
              <span>تقديم طلب إجازة</span>
            </button>
          </div>
        </div>
      </div>

      {/* 📊 KPI Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold mb-1">طلبات إجازة بانتظار الاعتماد</p>
            <h3 className="text-2xl font-black text-amber-600">{kpis.pendingCount} <span className="text-xs text-slate-400 font-normal">طلب</span></h3>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <Clock size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold mb-1">إجمالي الإجازات المعتمدة</p>
            <h3 className="text-2xl font-black text-emerald-600">{kpis.approvedCount} <span className="text-xs text-slate-400 font-normal">إجازة</span></h3>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle2 size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold mb-1">إجمالي أيام الإجازات المستهلكة</p>
            <h3 className="text-2xl font-black text-indigo-700">{kpis.totalLeaveDays} <span className="text-xs text-slate-400 font-normal">يوم عمل</span></h3>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <Calendar size={24} />
          </div>
        </div>
      </div>

      {/* 📑 Tabs */}
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('REQUESTS')}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'REQUESTS' ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          🏖️ طلبات الإجازات ({filteredRequests.length})
        </button>
        <button
          onClick={() => setActiveTab('BALANCES')}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'BALANCES' ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          📊 أرصدة الإجازات السنوية للموظفين
        </button>
      </div>

      {activeTab === 'REQUESTS' ? (
        <>
          {/* 🔍 Filters Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  placeholder="بحث باسم الموظف أو السبب..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                />
              </div>

              <select
                value={selectedEmpId}
                onChange={(e) => setSelectedEmpId(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700"
              >
                <option value="ALL">👤 كل الموظفين</option>
                {employeesList.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700"
              >
                <option value="ALL">🔘 كل الحالات</option>
                <option value="PENDING">قيد المراجعة</option>
                <option value="APPROVED">معتمدة</option>
                <option value="REJECTED">مرفوضة</option>
              </select>
            </div>
          </div>

          {/* 📋 Table of Leave Requests */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {isLoading ? (
              <div className="p-12 text-center text-slate-400 font-bold animate-pulse">جاري تحميل طلبات الإجازات...</div>
            ) : filteredRequests.length === 0 ? (
              <div className="p-12 text-center">
                <Calendar size={48} className="mx-auto text-slate-300 mb-3" />
                <h3 className="text-slate-700 font-bold text-lg mb-1">لا توجد طلبات إجازة مسجلة</h3>
                <p className="text-slate-400 text-sm">اضغط على "تقديم طلب إجازة" لإدخال إجازة موظف جديدة.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3.5">اسم الموظف</th>
                      <th className="p-3.5">نوع الإجازة</th>
                      <th className="p-3.5">من ⬅️ إلى</th>
                      <th className="p-3.5">المدة (أيام)</th>
                      <th className="p-3.5">مدفوعة الأجر</th>
                      <th className="p-3.5">الحالة</th>
                      <th className="p-3.5 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRequests.map(r => {
                      const typeInfo = getLeaveTypeLabel(r.leave_type);
                      return (
                        <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3.5 font-bold text-slate-900">{r.employee_name}</td>
                          <td className="p-3.5">
                            <span className={`px-2.5 py-0.5 rounded-lg text-xs font-bold ${typeInfo.color}`}>
                              {typeInfo.label}
                            </span>
                          </td>
                          <td className="p-3.5 text-xs text-slate-600">
                            <span>{r.start_date}</span> ⬅️ <span>{r.end_date}</span>
                          </td>
                          <td className="p-3.5 font-bold text-indigo-700">{r.total_days} يوم</td>
                          <td className="p-3.5">
                            {r.is_paid ? (
                              <span className="text-emerald-600 font-bold text-xs">نعم</span>
                            ) : (
                              <span className="text-rose-600 font-bold text-xs">بدون أجر (خصم)</span>
                            )}
                          </td>
                          <td className="p-3.5">
                            {r.status === 'APPROVED' ? (
                              <span className="bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1">
                                <CheckCircle2 size={12} />
                                معتمدة
                              </span>
                            ) : r.status === 'REJECTED' ? (
                              <span className="bg-rose-100 text-rose-800 px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1">
                                <XCircle size={12} />
                                مرفوضة
                              </span>
                            ) : (
                              <span className="bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1">
                                <Clock size={12} />
                                بانتظار الاعتماد
                              </span>
                            )}
                          </td>
                          <td className="p-3.5">
                            <div className="flex items-center justify-center gap-2">
                              {r.status === 'PENDING' && (
                                <button
                                  onClick={() => {
                                    setActiveRequest(r);
                                    setDecisionType('APPROVED');
                                    setDecisionNotes('');
                                    setIsDecisionModalOpen(true);
                                  }}
                                  title="اتخاذ قرار واعتماد"
                                  className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg"
                                >
                                  <CheckCircle2 size={16} />
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setActiveRequest(r);
                                  setIsPrintModalOpen(true);
                                }}
                                title="طباعة نموذج الإجازة"
                                className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg"
                              >
                                <Printer size={16} />
                              </button>
                              <button
                                onClick={() => handleDelete(r.id)}
                                className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        /* 📊 Balances Tab */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6">
          <h3 className="font-bold text-slate-800 text-base mb-4">أرصدة الإجازات السنوية للموظفين (سنة {new Date().getFullYear()}):</h3>
          {employeesList.length === 0 ? (
            <p className="text-slate-400 text-sm">لا توجد بيانات موظفين مسجلة.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {employeesList.map(emp => {
                const bal = balances.find(b => b.employee_id === emp.id);
                const allowance = bal?.annual_leave_allowance || 21;
                const used = bal?.used_days || 0;
                const remaining = bal?.remaining_days ?? (allowance - used);
                const usedPct = allowance > 0 ? (used / allowance) * 100 : 0;

                return (
                  <div key={emp.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-900">{emp.name}</span>
                      <span className="text-xs bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full font-bold">
                        {remaining} يوم متبقي
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>المستهلك: {used} يوم</span>
                        <span>المستحق السنوي: {allowance} يوم</span>
                      </div>
                      <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${usedPct > 80 ? 'bg-rose-500' : 'bg-indigo-600'}`}
                          style={{ width: `${Math.min(100, usedPct)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 📝 New Leave Request Modal */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl p-6 md:p-8 animate-in zoom-in-95">
            <form onSubmit={handleSubmitRequest} className="space-y-4">
              <div className="flex justify-between items-center border-b pb-3">
                <div className="flex items-center gap-2 text-indigo-900 font-black text-lg">
                  <Calendar className="text-emerald-500" size={24} />
                  <span>تقديم طلب إجازة موظف جديد</span>
                </div>
                <button type="button" onClick={() => setIsNewModalOpen(false)} className="text-slate-400">
                  <X size={20} />
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الموظف *</label>
                <select
                  value={formEmpId}
                  onChange={(e) => setFormEmpId(e.target.value)}
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
                <label className="block text-xs font-bold text-slate-700 mb-1">نوع الإجازة *</label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                >
                  <option value="ANNUAL">🏖️ سنوية اعتيادية (مدفوعة الراتب)</option>
                  <option value="SICK">🩺 إجازة مرضية</option>
                  <option value="CASUAL">⚡ إجازة عارضة</option>
                  <option value="UNPAID">🚫 إجازة بدون راتب (خصم)</option>
                  <option value="HAJJ">🕋 إجازة حج وزيارة</option>
                  <option value="MATERNITY">👶 إجازة وضع وأمومة</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">من تاريخ *</label>
                  <input
                    type="date"
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">إلى تاريخ *</label>
                  <input
                    type="date"
                    value={formEndDate}
                    onChange={(e) => setFormEndDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>
              </div>

              {/* Live Duration Calculation */}
              <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200 flex justify-between items-center text-xs">
                <span className="font-bold text-emerald-900">إجمالي مدة الإجازة المحسوبة:</span>
                <span className="text-base font-black text-emerald-700">{calculatedDays} يوم عمل</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">سبب وملاحظات الإجازة</label>
                <textarea
                  rows={2}
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  placeholder="بيان سبب طلب الإجازة أو الملاحظات..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-md shadow-emerald-600/30"
                >
                  تقديم الطلب
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ✅ Decision Modal */}
      {isDecisionModalOpen && activeRequest && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl p-6 md:p-8 animate-in zoom-in-95">
            <form onSubmit={handleSaveDecision} className="space-y-4">
              <div className="flex justify-between items-center border-b pb-3">
                <div>
                  <h3 className="font-bold text-slate-800 text-base">قرار اعتماد إجازة</h3>
                  <p className="text-xs text-indigo-600 font-bold">{activeRequest.employee_name} ({activeRequest.total_days} يوم)</p>
                </div>
                <button type="button" onClick={() => setIsDecisionModalOpen(false)} className="text-slate-400">
                  <X size={20} />
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">القرار:</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setDecisionType('APPROVED')}
                    className={`p-3 rounded-xl border text-xs font-black flex items-center justify-center gap-2 ${
                      decisionType === 'APPROVED' ? 'bg-emerald-50 border-emerald-500 text-emerald-800' : 'bg-slate-50 text-slate-600'
                    }`}
                  >
                    <CheckCircle2 size={16} />
                    <span>اعتماد الإجازة</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDecisionType('REJECTED')}
                    className={`p-3 rounded-xl border text-xs font-black flex items-center justify-center gap-2 ${
                      decisionType === 'REJECTED' ? 'bg-rose-50 border-rose-500 text-rose-800' : 'bg-slate-50 text-slate-600'
                    }`}
                  >
                    <XCircle size={16} />
                    <span>رفض الطلب</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات أو سبب الرفض</label>
                <textarea
                  rows={2}
                  value={decisionNotes}
                  onChange={(e) => setDecisionNotes(e.target.value)}
                  placeholder="ملاحظات الاعتماد..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsDecisionModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm shadow-md shadow-indigo-600/30"
                >
                  حفظ القرار
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🖨️ Print Leave Transmittal */}
      {isPrintModalOpen && activeRequest && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl p-6 md:p-8" dir="rtl">
            <div className="flex justify-between items-center border-b pb-4 mb-4">
              <div>
                <h2 className="text-xl font-black text-slate-800">نموذج طلب واعتماد إجازة موظف</h2>
                <p className="text-xs text-slate-500 font-mono">Employee Leave Application & Approval Form</p>
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
                <div><span className="text-slate-400 font-bold">اسم الموظف:</span> <span className="font-bold text-slate-900">{activeRequest.employee_name}</span></div>
                <div><span className="text-slate-400 font-bold">نوع الإجازة:</span> <span className="font-bold">{getLeaveTypeLabel(activeRequest.leave_type).label}</span></div>
                <div><span className="text-slate-400 font-bold">من تاريخ:</span> <span className="font-bold">{activeRequest.start_date}</span></div>
                <div><span className="text-slate-400 font-bold">إلى تاريخ:</span> <span className="font-bold">{activeRequest.end_date}</span></div>
                <div><span className="text-slate-400 font-bold">المدة الإجمالية:</span> <span className="font-bold text-indigo-700">{activeRequest.total_days} يوم</span></div>
                <div><span className="text-slate-400 font-bold">حالة الاعتماد:</span> <span className="font-bold">{activeRequest.status === 'APPROVED' ? 'معتمدة' : 'قيد المراجعة'}</span></div>
              </div>

              {activeRequest.reason && (
                <div className="bg-slate-50 p-3 rounded-lg border text-xs text-slate-800">
                  <span className="font-bold block mb-1">سبب الإجازة:</span>
                  {activeRequest.reason}
                </div>
              )}

              <div className="grid grid-cols-3 gap-4 pt-8 border-t border-slate-200 text-center text-xs">
                <div>
                  <p className="font-bold text-slate-700 mb-6">توقيع الموظف</p>
                  <p className="border-t border-slate-300 pt-1 text-slate-400">التوقيع</p>
                </div>
                <div>
                  <p className="font-bold text-slate-700 mb-6">المدير المباشر</p>
                  <p className="border-t border-slate-300 pt-1 text-slate-400">الموافقة</p>
                </div>
                <div>
                  <p className="font-bold text-slate-700 mb-6">إدارة الموارد البشرية</p>
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
