import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import * as XLSX from 'xlsx';
import {
  Clock, CheckCircle2, XCircle, AlertCircle, Plus, Search,
  Filter, FileSpreadsheet, Printer, Users, Upload, UserCheck,
  Zap, Calendar, X, Edit3, Trash2, ArrowUpDown
} from 'lucide-react';

interface AttendanceLog {
  id: string;
  employee_id: string;
  employee_name?: string;
  log_date: string;
  check_in_time?: string;
  check_out_time?: string;
  late_minutes: number;
  overtime_hours: number;
  status: 'PRESENT' | 'ABSENT' | 'ON_LEAVE' | 'LATE';
  source: 'MANUAL' | 'BIOMETRIC_DEVICE' | 'EXCEL_IMPORT';
  notes?: string;
  created_at: string;
}

export default function AttendanceManager() {
  const { organization, currentSelectedOrgId, currentUser, employees: contextEmployees } = useAccounting();
  const { showToast } = useToast();

  const [employeesList, setEmployeesList] = useState<{ id: string; name: string }[]>([]);
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Form State
  const [formEmpId, setFormEmpId] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formCheckIn, setFormCheckIn] = useState('09:00');
  const [formCheckOut, setFormCheckOut] = useState('17:00');
  const [formLateMinutes, setFormLateMinutes] = useState<number>(0);
  const [formOvertimeHours, setFormOvertimeHours] = useState<number>(0);
  const [formStatus, setFormStatus] = useState<AttendanceLog['status']>('PRESENT');
  const [formNotes, setFormNotes] = useState('');

  const orgId = organization?.id || currentSelectedOrgId || currentUser?.organization_id;

  // Auto calculate late and overtime when times change
  const handleCheckInChange = (val: string) => {
    setFormCheckIn(val);
    if (!val) return;
    const [h, m] = val.split(':').map(Number);
    const checkInMins = h * 60 + m;
    const standardStartMins = 9 * 60; // 09:00 AM
    const late = Math.max(0, checkInMins - standardStartMins);
    setFormLateMinutes(late);
    if (late > 15) {
      setFormStatus('LATE');
    } else {
      setFormStatus('PRESENT');
    }
  };

  const handleCheckOutChange = (val: string) => {
    setFormCheckOut(val);
    if (!val) return;
    const [h, m] = val.split(':').map(Number);
    const checkOutMins = h * 60 + m;
    const standardEndMins = 17 * 60; // 05:00 PM
    const otMins = Math.max(0, checkOutMins - standardEndMins);
    setFormOvertimeHours(Math.round((otMins / 60) * 10) / 10);
  };

  // Fetch Data
  const fetchData = async () => {
    if (!orgId) return;
    setIsLoading(true);
    try {
      // 1. Employees
      let empList: { id: string; name: string }[] = [];
      if (contextEmployees && contextEmployees.length > 0) {
        empList = contextEmployees.map((e: any) => ({ id: e.id, name: e.name || e.full_name || 'موظف' }));
      } else {
        const { data: eData } = await supabase.from('employees').select('id, name').eq('organization_id', orgId);
        empList = (eData || []).map((e: any) => ({ id: e.id, name: e.name || 'موظف' }));
      }
      setEmployeesList(empList);

      // 2. Attendance Logs
      let query = supabase
        .from('hr_attendance_logs')
        .select('*')
        .eq('organization_id', orgId)
        .order('log_date', { ascending: false });

      if (selectedDate) {
        query = query.eq('log_date', selectedDate);
      }

      const { data, error } = await query;
      if (error) {
        console.warn('hr_attendance_logs table notice:', error.message);
        setLogs([]);
      } else {
        setLogs((data || []).map((d: any) => ({
          ...d,
          employee_name: empList.find(e => e.id === d.employee_id)?.name || 'موظف'
        })));
      }
    } catch (err: any) {
      console.error(err);
      setLogs([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [orgId, selectedDate]);

  // Open New Modal
  const handleOpenNew = () => {
    setFormEmpId(employeesList[0]?.id || '');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormCheckIn('09:00');
    setFormCheckOut('17:00');
    setFormLateMinutes(0);
    setFormOvertimeHours(0);
    setFormStatus('PRESENT');
    setFormNotes('');
    setIsNewModalOpen(true);
  };

  // Save Log
  const handleSaveLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEmpId) {
      showToast('يرجى اختيار الموظف', 'warning');
      return;
    }

    try {
      const payload = {
        organization_id: orgId,
        employee_id: formEmpId,
        log_date: formDate,
        check_in_time: formCheckIn,
        check_out_time: formCheckOut,
        late_minutes: formLateMinutes,
        overtime_hours: formOvertimeHours,
        status: formStatus,
        source: 'MANUAL',
        notes: formNotes || null
      };

      const { error } = await supabase.from('hr_attendance_logs').insert(payload);
      if (error) throw error;

      showToast('تم تسجيل حركة الحضور بنجاح ⏱️', 'success');
      setIsNewModalOpen(false);
      fetchData();
    } catch (err: any) {
      showToast('فشل حفظ الحضور: ' + err.message, 'error');
    }
  };

  // Import Fingerprint File (Excel/CSV)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const rows: any[] = XLSX.utils.sheet_to_json(ws);

        if (rows.length === 0) {
          showToast('الملف فارغ', 'warning');
          return;
        }

        // Map and insert records
        const newRecords = [];
        for (const r of rows) {
          const empName = r['الاسم'] || r['Employee'] || r['name'] || '';
          const matchedEmp = employeesList.find(e => e.name.toLowerCase().includes(String(empName).toLowerCase()));
          const empId = matchedEmp ? matchedEmp.id : employeesList[0]?.id;

          if (empId) {
            newRecords.push({
              organization_id: orgId,
              employee_id: empId,
              log_date: r['التاريخ'] || r['Date'] || selectedDate,
              check_in_time: r['حضور'] || r['CheckIn'] || '09:00',
              check_out_time: r['انصراف'] || r['CheckOut'] || '17:00',
              late_minutes: parseInt(r['تأخير'] || '0') || 0,
              overtime_hours: parseFloat(r['إضافي'] || '0') || 0,
              status: (r['تأخير'] && parseInt(r['تأخير']) > 15) ? 'LATE' : 'PRESENT',
              source: 'BIOMETRIC_DEVICE'
            });
          }
        }

        if (newRecords.length > 0) {
          const { error } = await supabase.from('hr_attendance_logs').insert(newRecords);
          if (error) throw error;
          showToast(`تم استيراد ${newRecords.length} سجل حضور من ملف البصمة بنجاح ✅`, 'success');
          setIsImportModalOpen(false);
          fetchData();
        }
      } catch (err: any) {
        showToast('فشل قراءة ملف البصمة: ' + err.message, 'error');
      }
    };
    reader.readAsBinaryString(file);
  };

  // Delete Log
  const handleDelete = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا السجل؟')) return;
    try {
      const { error } = await supabase.from('hr_attendance_logs').delete().eq('id', id);
      if (error) throw error;
      showToast('تم حذف السجل', 'success');
      fetchData();
    } catch (err: any) {
      showToast('فشل الحذف: ' + err.message, 'error');
    }
  };

  // Filtered
  const filteredLogs = useMemo(() => {
    return logs.filter(l => {
      const matchSearch = l.employee_name?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === 'ALL' || l.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [logs, searchTerm, statusFilter]);

  // KPIs
  const kpis = useMemo(() => {
    let presentCount = 0;
    let lateCount = 0;
    let absentCount = 0;
    let totalOvertime = 0;

    filteredLogs.forEach(l => {
      if (l.status === 'PRESENT') presentCount++;
      if (l.status === 'LATE') lateCount++;
      if (l.status === 'ABSENT') absentCount++;
      totalOvertime += Number(l.overtime_hours || 0);
    });

    return {
      presentCount,
      lateCount,
      absentCount,
      totalOvertime: Math.round(totalOvertime * 10) / 10,
      totalCount: filteredLogs.length
    };
  }, [filteredLogs]);

  // Export Excel
  const exportToExcel = () => {
    if (filteredLogs.length === 0) {
      showToast('لا توجد بيانات للتصدير', 'warning');
      return;
    }
    const rows = filteredLogs.map((l, idx) => ({
      '#': idx + 1,
      'الموظف': l.employee_name,
      'التاريخ': l.log_date,
      'وقت الحضور': l.check_in_time || '---',
      'وقت الانصراف': l.check_out_time || '---',
      'التأخير (دقيقة)': l.late_minutes,
      'العمل الإضافي (ساعة)': l.overtime_hours,
      'الحالة': l.status === 'PRESENT' ? 'حاضر' : l.status === 'LATE' ? 'متأخر' : l.status === 'ABSENT' ? 'غائب' : 'إجازة',
      'المصدر': l.source === 'BIOMETRIC_DEVICE' ? 'جهاز بصمة' : 'يدوي'
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'سجل الحضور');
    XLSX.writeFile(wb, `Attendance_Report_${selectedDate}.xlsx`);
    showToast('تم تصدير سجل الحضور إلى Excel ✅', 'success');
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in" dir="rtl">
      
      {/* ⏱️ Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="inline-flex items-center gap-2 bg-indigo-500/20 text-indigo-200 px-3 py-1 rounded-full text-xs font-bold mb-3 border border-indigo-400/30">
              <Clock size={14} className="text-amber-400" />
              <span>مراقبة الدوام واستيراد البصمات (Biometric Attendance & Overtime)</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">
              سجل الحضور والانصراف والبصمة
            </h1>
            <p className="text-indigo-200 text-sm mt-1 max-w-2xl">
              تسجيل الحضور اليومي، استيراد بيانات أجهزة البصمة (Excel / CSV)، وحساب التأخير والعمل الإضافي آلياً.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-500/30 hover:bg-indigo-500/40 text-indigo-100 rounded-2xl font-bold transition-all border border-indigo-400/30 shadow-sm"
            >
              <Upload size={16} />
              <span>استيراد ملف بصمة</span>
            </button>

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
              <span>تسجيل حضور يدوي</span>
            </button>
          </div>
        </div>
      </div>

      {/* 📊 KPI Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold mb-1">حاضرين في الموعد</p>
            <h3 className="text-2xl font-black text-emerald-600">{kpis.presentCount} <span className="text-xs text-slate-400 font-normal">موظف</span></h3>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle2 size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold mb-1">حالات التأخير</p>
            <h3 className="text-2xl font-black text-amber-600">{kpis.lateCount} <span className="text-xs text-slate-400 font-normal">موظف</span></h3>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <Clock size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold mb-1">حالات الغياب</p>
            <h3 className="text-2xl font-black text-rose-600">{kpis.absentCount} <span className="text-xs text-slate-400 font-normal">موظف</span></h3>
          </div>
          <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
            <XCircle size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold mb-1">ساعات العمل الإضافي</p>
            <h3 className="text-2xl font-black text-indigo-700">{kpis.totalOvertime} <span className="text-xs text-slate-400 font-normal">ساعة</span></h3>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <Zap size={24} />
          </div>
        </div>
      </div>

      {/* 🔍 Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="بحث باسم الموظف..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">التاريخ:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700"
          >
            <option value="ALL">🔘 كل الحالات</option>
            <option value="PRESENT">حاضر في الموعد</option>
            <option value="LATE">متأخر</option>
            <option value="ABSENT">غائب</option>
          </select>
        </div>
      </div>

      {/* 📋 Table of Attendance */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 font-bold animate-pulse">جاري تحميل سجل الحضور...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center">
            <Clock size={48} className="mx-auto text-slate-300 mb-3" />
            <h3 className="text-slate-700 font-bold text-lg mb-1">لا توجد حركات حضور مسجلة لهذا التاريخ</h3>
            <p className="text-slate-400 text-sm">اضغط على "تسجيل حضور يدوي" أو "استيراد ملف بصمة".</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3.5">اسم الموظف</th>
                  <th className="p-3.5">وقت الحضور</th>
                  <th className="p-3.5">وقت الانصراف</th>
                  <th className="p-3.5">التأخير</th>
                  <th className="p-3.5">العمل الإضافي</th>
                  <th className="p-3.5">الحالة</th>
                  <th className="p-3.5">المصدر</th>
                  <th className="p-3.5 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.map(l => (
                  <tr key={l.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5 font-bold text-slate-900">{l.employee_name}</td>
                    <td className="p-3.5 font-mono text-slate-800">{l.check_in_time || '---'}</td>
                    <td className="p-3.5 font-mono text-slate-800">{l.check_out_time || '---'}</td>
                    <td className="p-3.5">
                      {l.late_minutes > 0 ? (
                        <span className="text-xs font-bold text-rose-600">{l.late_minutes} دقيقة</span>
                      ) : (
                        <span className="text-xs text-slate-400">---</span>
                      )}
                    </td>
                    <td className="p-3.5">
                      {l.overtime_hours > 0 ? (
                        <span className="text-xs font-bold text-indigo-600">+{l.overtime_hours} س</span>
                      ) : (
                        <span className="text-xs text-slate-400">---</span>
                      )}
                    </td>
                    <td className="p-3.5">
                      {l.status === 'PRESENT' ? (
                        <span className="bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full text-xs font-bold">
                          حاضر
                        </span>
                      ) : l.status === 'LATE' ? (
                        <span className="bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full text-xs font-bold">
                          متأخر
                        </span>
                      ) : (
                        <span className="bg-rose-100 text-rose-800 px-2.5 py-0.5 rounded-full text-xs font-bold">
                          غائب
                        </span>
                      )}
                    </td>
                    <td className="p-3.5">
                      <span className="text-[11px] text-slate-500 font-medium">
                        {l.source === 'BIOMETRIC_DEVICE' ? 'جهاز بصمة' : 'يدوي'}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleDelete(l.id)}
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

      {/* 📝 New Manual Attendance Modal */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl p-6 md:p-8 animate-in zoom-in-95">
            <form onSubmit={handleSaveLog} className="space-y-4">
              <div className="flex justify-between items-center border-b pb-3">
                <div className="flex items-center gap-2 text-indigo-900 font-black text-lg">
                  <Clock className="text-emerald-500" size={24} />
                  <span>تسجيل حركة حضور وانصراف</span>
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

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">التاريخ *</label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">وقت الحضور</label>
                  <input
                    type="time"
                    value={formCheckIn}
                    onChange={(e) => handleCheckInChange(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">وقت الانصراف</label>
                  <input
                    type="time"
                    value={formCheckOut}
                    onChange={(e) => handleCheckOutChange(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border text-xs">
                <div>
                  <span className="text-slate-500 font-bold block mb-1">دقائق التأخير المحسوبة:</span>
                  <input
                    type="number"
                    value={formLateMinutes}
                    onChange={(e) => setFormLateMinutes(parseInt(e.target.value) || 0)}
                    className="w-full p-1.5 border rounded-lg font-bold text-rose-600"
                  />
                </div>
                <div>
                  <span className="text-slate-500 font-bold block mb-1">ساعات العمل الإضافي:</span>
                  <input
                    type="number"
                    step="0.5"
                    value={formOvertimeHours}
                    onChange={(e) => setFormOvertimeHours(parseFloat(e.target.value) || 0)}
                    className="w-full p-1.5 border rounded-lg font-bold text-indigo-700"
                  />
                </div>
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
                  حفظ الحركة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 📥 Import Biometric File Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl p-6 md:p-8 animate-in zoom-in-95">
            <div className="flex justify-between items-center border-b pb-3 mb-4">
              <div className="flex items-center gap-2 text-indigo-900 font-black text-lg">
                <Upload className="text-indigo-600" size={24} />
                <span>استيراد سجلات أجهزة البصمة (Excel / CSV)</span>
              </div>
              <button type="button" onClick={() => setIsImportModalOpen(false)} className="text-slate-400">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <p className="text-slate-600">
                يرجى اختيار ملف Excel أو CSV المصدر من جهاز البصمة (مثل ZKTeco، Hikvision). يجب أن يحتوي الملف على أعمدة (الاسم، التاريخ، حضور، انصراف).
              </p>

              <div className="border-2 border-dashed border-slate-300 rounded-2xl p-6 text-center hover:border-indigo-500 transition-colors bg-slate-50">
                <Upload className="mx-auto text-slate-400 mb-2" size={32} />
                <label className="cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-bold inline-block">
                  <span>اختر ملف البصمة</span>
                  <input
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
                <p className="text-slate-400 mt-2 text-[11px]">يدعم ملفات .xlsx و .csv</p>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
