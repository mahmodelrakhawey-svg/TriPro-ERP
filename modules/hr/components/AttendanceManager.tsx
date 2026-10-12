import { logger } from '../../../utils/logger';
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import * as XLSX from 'xlsx';
import {
  Clock, CheckCircle2, XCircle, AlertCircle, Plus, Search,
  Filter, FileSpreadsheet, Printer, Users, Upload, UserCheck,
  Zap, Calendar, X, Edit3, Trash2, ArrowUpDown, Building2,
  Download, Loader2
} from 'lucide-react';
import { hrEnterpriseService, HrShift } from '../../../services/hrEnterpriseService';

interface AttendanceLog {
  id: string;
  employee_id: string;
  employee_name?: string;
  department?: string;
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

interface EmpOption {
  id: string;
  name: string;
  department?: string;
  shift_id?: string;
  biometric_id?: string;
}

export default function AttendanceManager() {
  const { organization, currentSelectedOrgId, currentUser, employees: contextEmployees } = useAccounting();
  const { showToast } = useToast();

  const [employeesList, setEmployeesList] = useState<EmpOption[]>([]);
  const [shifts, setShifts] = useState<HrShift[]>([]);
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');

  // Modals & Editing
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);

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

  // جلب الورديات
  useEffect(() => {
    const loadShifts = async () => {
      try {
        const sData = await hrEnterpriseService.getShifts(orgId);
        setShifts(sData);
      } catch (e) {
        logger.warn('Failed to load shifts in attendance:', e);
      }
    };
    if (orgId) loadShifts();
  }, [orgId]);

  // قائمة الفروع والأقسام الفريدة
  const departments = useMemo(() => {
    return Array.from(new Set(employeesList.map(e => e.department?.trim() || '').filter(Boolean))).sort();
  }, [employeesList]);

  // حساب التأخير والإضافي بناءً على وردية الموظف
  const calculateShiftDifference = (empId: string, inTime: string, outTime: string) => {
    const emp = employeesList.find(e => e.id === empId);
    const empShift = shifts.find(s => s.id === emp?.shift_id) || shifts[0] || {
      start_time: '09:00:00',
      end_time: '17:00:00',
      grace_period_minutes: 15,
      overtime_start_minutes: 30
    };

    let late = 0;
    if (inTime) {
      const [inH, inM] = inTime.split(':').map(Number);
      const [shH, shM] = empShift.start_time.split(':').map(Number);
      const inMinutes = inH * 60 + inM;
      const shStartMinutes = shH * 60 + shM;
      const diff = inMinutes - shStartMinutes;
      late = diff > (empShift.grace_period_minutes ?? 15) ? diff : 0;
    }

    let ot = 0;
    if (outTime) {
      const [outH, outM] = outTime.split(':').map(Number);
      const [endH, endM] = empShift.end_time.split(':').map(Number);
      const outMinutes = outH * 60 + outM;
      const shEndMinutes = endH * 60 + endM;
      const otDiff = outMinutes - shEndMinutes - (empShift.overtime_start_minutes ?? 30);
      ot = otDiff > 0 ? Math.round((otDiff / 60) * 10) / 10 : 0;
    }

    return { late, ot, status: late > 0 ? ('LATE' as const) : ('PRESENT' as const) };
  };

  const handleCheckInChange = (val: string) => {
    setFormCheckIn(val);
    const { late, status } = calculateShiftDifference(formEmpId, val, formCheckOut);
    setFormLateMinutes(late);
    setFormStatus(status);
  };

  const handleCheckOutChange = (val: string) => {
    setFormCheckOut(val);
    const { ot } = calculateShiftDifference(formEmpId, formCheckIn, val);
    setFormOvertimeHours(ot);
  };

  const handleEmpSelect = (empId: string) => {
    setFormEmpId(empId);
    const emp = employeesList.find(e => e.id === empId);
    const empShift = shifts.find(s => s.id === emp?.shift_id) || shifts[0];
    if (empShift && !editingLogId) {
      const defaultIn = empShift.start_time.slice(0, 5);
      const defaultOut = empShift.end_time.slice(0, 5);
      setFormCheckIn(defaultIn);
      setFormCheckOut(defaultOut);
      setFormLateMinutes(0);
      setFormOvertimeHours(0);
      setFormStatus('PRESENT');
    }
  };

  // Fetch Data
  const fetchData = async () => {
    if (!orgId) return;
    setIsLoading(true);
    try {
      // 1. Employees with department & shift_id
      let empList: EmpOption[] = [];
      if (contextEmployees && contextEmployees.length > 0) {
        empList = contextEmployees.map((e: Record<string, any>) => ({
          id: e.id,
          name: e.full_name || e.name || 'موظف',
          department: e.department || 'الفرع الرئيسي',
          shift_id: e.shift_id,
          biometric_id: e.biometric_id
        }));
      } else {
        const { data: eData } = await supabase
          .from('employees')
          .select('id, name, full_name, department, shift_id, biometric_id')
          .eq('organization_id', orgId);
        empList = (eData || []).map((e: Record<string, any>) => ({
          id: e.id,
          name: e.full_name || e.name || 'موظف',
          department: e.department || 'الفرع الرئيسي',
          shift_id: e.shift_id,
          biometric_id: e.biometric_id
        }));
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
        logger.warn('hr_attendance_logs table notice:', error.message);
        setLogs([]);
      } else {
        setLogs((data || []).map((d: Record<string, any>) => {
          const emp = empList.find(e => e.id === d.employee_id);
          return {
            ...d,
            employee_name: emp?.name || 'موظف',
            department: emp?.department || 'الفرع الرئيسي'
          };
        }) as AttendanceLog[]);
      }
    } catch (err) {
      logger.error(err);
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
    setEditingLogId(null);
    const firstEmp = employeesList[0];
    const empShift = shifts.find(s => s.id === firstEmp?.shift_id) || shifts[0];
    setFormEmpId(firstEmp?.id || '');
    setFormDate(selectedDate || new Date().toISOString().split('T')[0]);
    setFormCheckIn(empShift?.start_time.slice(0, 5) || '09:00');
    setFormCheckOut(empShift?.end_time.slice(0, 5) || '17:00');
    setFormLateMinutes(0);
    setFormOvertimeHours(0);
    setFormStatus('PRESENT');
    setFormNotes('');
    setIsNewModalOpen(true);
  };

  // Open Edit Modal
  const handleEditLog = (log: AttendanceLog) => {
    setEditingLogId(log.id);
    setFormEmpId(log.employee_id);
    setFormDate(log.log_date);
    setFormCheckIn(log.check_in_time || '09:00');
    setFormCheckOut(log.check_out_time || '17:00');
    setFormLateMinutes(log.late_minutes || 0);
    setFormOvertimeHours(log.overtime_hours || 0);
    setFormStatus(log.status);
    setFormNotes(log.notes || '');
    setIsNewModalOpen(true);
  };

  // Save Log (Create or Update)
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
        notes: formNotes || null
      };

      if (editingLogId) {
        const { error } = await supabase
          .from('hr_attendance_logs')
          .update(payload)
          .eq('id', editingLogId);
        if (error) throw error;
        showToast('تم تعديل حركة الحضور والانصراف بنجاح ⏱️✏️', 'success');
      } else {
        const { error } = await supabase
          .from('hr_attendance_logs')
          .insert({ ...payload, source: 'MANUAL' });
        if (error) throw error;
        showToast('تم تسجيل حركة الحضور بنجاح ⏱️', 'success');
      }

      setIsNewModalOpen(false);
      setEditingLogId(null);
      fetchData();
    } catch (err) {
      showToast('فشل حفظ الحضور: ' + err.message, 'error');
    }
  };

  // دالة تسوية النصوص العربية للمطابقة
  const normalizeArabic = (str: string): string => {
    if (!str) return '';
    return String(str)
      .trim()
      .toLowerCase()
      .replace(/[\u064B-\u065F\u0670]/g, '') // إزالة التشكيل
      .replace(/[أإآ]/g, 'ا') // توحيد الهمزات
      .replace(/ة/g, 'ه') // التاء المربوطة
      .replace(/ى/g, 'ي') // الألف المقصورة
      .replace(/\s+/g, ' '); // إزالة المسافات المتكررة
  };

  // دالة تحويل التاريخ من صيغ الإكسيل المختلفة إلى YYYY-MM-DD
  const parseExcelDate = (val: unknown, defaultDate: string): string => {
    if (!val) return defaultDate;

    if (val instanceof Date && !isNaN(val.getTime())) {
      const y = val.getFullYear();
      const m = String(val.getMonth() + 1).padStart(2, '0');
      const d = String(val.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    if (typeof val === 'number') {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const jsDate = new Date(excelEpoch.getTime() + Math.round(val) * 86400000);
      if (!isNaN(jsDate.getTime())) {
        const y = jsDate.getUTCFullYear();
        const m = String(jsDate.getUTCMonth() + 1).padStart(2, '0');
        const d = String(jsDate.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    }

    const str = String(val).trim();
    if (!str || str === '---' || str === '-') return defaultDate;

    // ISO: YYYY-MM-DD or YYYY/MM/DD
    const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (isoMatch) {
      const y = isoMatch[1];
      const m = isoMatch[2].padStart(2, '0');
      const d = isoMatch[3].padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    // DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (dmyMatch) {
      const d = dmyMatch[1].padStart(2, '0');
      const m = dmyMatch[2].padStart(2, '0');
      const y = dmyMatch[3];
      return `${y}-${m}-${d}`;
    }

    return defaultDate;
  };

  // دالة تحويل الوقت من الإكسيل بأمان إلى صيغة HH:MM
  const parseExcelTime = (val: unknown): string | null => {
    if (val === null || val === undefined) return null;

    if (typeof val === 'number') {
      const dayFraction = val >= 1 ? val % 1 : val;
      if (dayFraction < 0) return null;
      const totalSeconds = Math.round(dayFraction * 86400);
      const hours = Math.floor(totalSeconds / 3600) % 24;
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }

    if (val instanceof Date && !isNaN(val.getTime())) {
      const hours = val.getHours();
      const minutes = val.getMinutes();
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }

    const str = String(val).trim();
    if (!str || str === '---' || str === '-' || str.includes('غائب') || str.includes('غياب') || str.includes('إجازة')) {
      return null;
    }

    const isPM = /pm|م|مساء/i.test(str);
    const isAM = /am|ص|صباح/i.test(str);

    const match = str.match(/(\d{1,2})[:.](\d{1,2})(?:[:.](\d{1,2}))?/);
    if (match) {
      let hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);

      if (isPM && hours < 12) hours += 12;
      if (isAM && hours === 12) hours = 0;

      if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      }
    }

    return null;
  };

  // Import Fingerprint File (Excel/CSV)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!orgId) {
      showToast('يرجى تحديد المؤسسة أو المنشأة أولاً', 'error');
      return;
    }

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const rows: any[] = XLSX.utils.sheet_to_json(ws);

        if (rows.length === 0) {
          showToast('الملف فارغ ولا يحتوي على بيانات', 'warning');
          setIsImporting(false);
          return;
        }

        const validRecords: any[] = [];
        const unmatchedNames: string[] = [];

        for (const r of rows) {
          // 1. مطابقة الموظف
          const codeVal = String(
            r['كود الموظف'] ||
            r['معرف الموظف'] ||
            r['Employee ID'] ||
            r['Employee Code'] ||
            r['كود'] ||
            r['Code'] ||
            r['ID'] ||
            ''
          ).trim();

          const bioVal = String(
            r['رقم البصمة'] ||
            r['بصمة'] ||
            r['Biometric ID'] ||
            r['biometric_id'] ||
            ''
          ).trim();

          const empNameVal = String(
            r['الموظف'] ||
            r['اسم الموظف'] ||
            r['الاسم'] ||
            r['Employee'] ||
            r['Employee Name'] ||
            r['name'] ||
            ''
          ).trim();

          let matchedEmp: EmpOption | undefined;

          // أولوية 1: الكود أو الـ ID
          if (codeVal) {
            matchedEmp = employeesList.find(emp => emp.id.toLowerCase() === codeVal.toLowerCase());
          }

          // أولوية 2: رقم البصمة
          if (!matchedEmp && bioVal) {
            matchedEmp = employeesList.find(emp => emp.biometric_id && String(emp.biometric_id).trim() === bioVal);
          }

          // أولوية 3: الاسم المطابق أو الجزئي
          if (!matchedEmp && empNameVal) {
            const normTarget = normalizeArabic(empNameVal);
            matchedEmp = employeesList.find(emp => normalizeArabic(emp.name) === normTarget);
            if (!matchedEmp) {
              matchedEmp = employeesList.find(emp => {
                const normEmp = normalizeArabic(emp.name);
                return normEmp.includes(normTarget) || normTarget.includes(normEmp);
              });
            }
          }

          if (!matchedEmp) {
            if (empNameVal || codeVal || bioVal) {
              unmatchedNames.push(empNameVal || codeVal || bioVal);
            }
            continue;
          }

          // 2. التاريخ
          const rawDate = r['التاريخ'] || r['تاريخ'] || r['Date'] || r['date'] || r['Log Date'] || selectedDate;
          const logDate = parseExcelDate(rawDate, selectedDate);

          // 3. أوقات الحضور والانصراف
          const rawCheckIn = r['وقت الحضور'] || r['وقت_الحضور'] || r['حضور'] || r['وقت الدخول'] || r['دخول'] || r['CheckIn'] || r['Check In'] || r['Time In'];
          const rawCheckOut = r['وقت الانصراف'] || r['وقت_الانصراف'] || r['انصراف'] || r['وقت الخروج'] || r['خروج'] || r['CheckOut'] || r['Check Out'] || r['Time Out'];

          const checkInTime = parseExcelTime(rawCheckIn);
          const checkOutTime = parseExcelTime(rawCheckOut);

          // 4. تحديد الحالة صراحة إن وجدت في ملف الإكسيل
          let status: AttendanceLog['status'] = 'PRESENT';
          const rawStatus = r['الحالة'] || r['حالة'] || r['Status'] || r['status'];
          if (rawStatus) {
            const s = String(rawStatus).trim();
            if (s === 'حاضر' || /present/i.test(s)) status = 'PRESENT';
            else if (s === 'متأخر' || /late/i.test(s)) status = 'LATE';
            else if (s === 'غائب' || s === 'غياب' || /absent/i.test(s)) status = 'ABSENT';
            else if (s === 'إجازة' || s === 'اجازة' || /leave/i.test(s)) status = 'ON_LEAVE';
          } else {
            status = checkInTime ? 'PRESENT' : 'ABSENT';
          }

          // 5. إذا كانت الحالة "حاضر" أو "متأخر" ولم يحدد المستخدم وقتاً:
          // يتعرف النظام تلقائياً على وردية الموظف ويكتب أوقات الدخول والخروج الرسمية للوردية!
          let finalCheckIn = checkInTime;
          let finalCheckOut = checkOutTime;

          if (status === 'PRESENT' || status === 'LATE') {
            const empShift = shifts.find(s => s.id === matchedEmp.shift_id) || shifts[0] || {
              start_time: '09:00:00',
              end_time: '17:00:00',
              grace_period_minutes: 15,
              overtime_start_minutes: 30
            };

            if (!finalCheckIn) {
              finalCheckIn = (empShift.start_time || '09:00:00').slice(0, 5);
            }
            if (!finalCheckOut) {
              finalCheckOut = (empShift.end_time || '17:00:00').slice(0, 5);
            }
          }

          // 6. حساب التأخير والإضافي بناءً على وردية الموظف
          let lateMinutes = 0;
          let overtimeHours = 0;

          if (finalCheckIn && (status === 'PRESENT' || status === 'LATE')) {
            const shiftDiff = calculateShiftDifference(matchedEmp.id, finalCheckIn, finalCheckOut || '');
            lateMinutes = shiftDiff.late;
            overtimeHours = shiftDiff.ot;
            if (!rawStatus) {
              status = shiftDiff.status;
            }
          }

          // قيم صريحة للتأخير والإضافي إن وجدت
          const explicitLate = r['التأخير (دقيقة)'] ?? r['التأخير'] ?? r['تأخير'] ?? r['Late'];
          if (explicitLate !== undefined && explicitLate !== null && String(explicitLate).trim() !== '' && String(explicitLate).trim() !== '---') {
            const parsedLate = parseInt(String(explicitLate), 10);
            if (!isNaN(parsedLate)) lateMinutes = Math.max(0, parsedLate);
          }

          const explicitOT = r['العمل الإضافي (ساعة)'] ?? r['العمل الإضافي'] ?? r['الإضافي'] ?? r['إضافي'] ?? r['Overtime'];
          if (explicitOT !== undefined && explicitOT !== null && String(explicitOT).trim() !== '' && String(explicitOT).trim() !== '---') {
            const parsedOT = parseFloat(String(explicitOT));
            if (!isNaN(parsedOT)) overtimeHours = Math.max(0, parsedOT);
          }

          const notes = r['ملاحظات'] || r['الملاحظات'] || r['Notes'] || r['notes'] || null;

          validRecords.push({
            organization_id: orgId,
            employee_id: matchedEmp.id,
            log_date: logDate,
            check_in_time: status === 'ABSENT' || status === 'ON_LEAVE' ? null : finalCheckIn,
            check_out_time: status === 'ABSENT' || status === 'ON_LEAVE' ? null : finalCheckOut,
            late_minutes: lateMinutes,
            overtime_hours: overtimeHours,
            status,
            source: 'EXCEL_IMPORT',
            notes: notes ? String(notes).trim() : null
          });
        }

        if (validRecords.length === 0) {
          showToast(
            unmatchedNames.length > 0
              ? `لم يتم مطابقة أي موظف من الأسماء في الملف: (${unmatchedNames.slice(0, 3).join(', ')}${unmatchedNames.length > 3 ? '...' : ''})`
              : 'لم يتم العثور على سجلات صالحة للاستيراد في الملف',
            'warning'
          );
          setIsImporting(false);
          return;
        }

        // 5. فحص السجلات الموجودة مسبقاً وتحديثها (Upsert)
        const empIds = Array.from(new Set(validRecords.map(v => v.employee_id)));
        const logDates = Array.from(new Set(validRecords.map(v => v.log_date)));

        const { data: existingLogs, error: fetchErr } = await supabase
          .from('hr_attendance_logs')
          .select('id, employee_id, log_date')
          .eq('organization_id', orgId)
          .in('employee_id', empIds)
          .in('log_date', logDates);

        if (fetchErr) {
          logger.warn('hr_attendance_logs fetch notice during import:', fetchErr.message);
        }

        const existingMap = new Map<string, string>();
        (existingLogs || []).forEach((l: { id: string; employee_id: string; log_date: string }) => {
          existingMap.set(`${l.employee_id}_${l.log_date}`, l.id);
        });

        const toInsert: any[] = [];
        const toUpdate: { id: string; payload: Record<string, unknown> }[] = [];

        for (const rec of validRecords) {
          const existingId = existingMap.get(`${rec.employee_id}_${rec.log_date}`);
          if (existingId) {
            toUpdate.push({ id: existingId, payload: rec });
          } else {
            toInsert.push(rec);
          }
        }

        if (toInsert.length > 0) {
          const { error: insErr } = await supabase.from('hr_attendance_logs').insert(toInsert);
          if (insErr) throw insErr;
        }

        for (const upd of toUpdate) {
          const { error: updErr } = await supabase
            .from('hr_attendance_logs')
            .update(upd.payload)
            .eq('id', upd.id);
          if (updErr) throw updErr;
        }

        const totalProcessed = toInsert.length + toUpdate.length;
        let successMsg = `تم استيراد ومعالجة ${totalProcessed} حركة حضور بنجاح ✅`;
        if (toUpdate.length > 0) {
          successMsg += ` (تحديث ${toUpdate.length} سجل موجود، وإضافة ${toInsert.length} جديد)`;
        }
        showToast(successMsg, 'success');

        if (unmatchedNames.length > 0) {
          showToast(`تنبيه: تم تخطي ${unmatchedNames.length} موظف لعدم تطابق الاسم مع قائمة الموظفين`, 'warning');
        }

        setIsImportModalOpen(false);
        fetchData();
      } catch (err: unknown) {
        logger.error('Failed to import attendance logs:', err);
        const errMsg = err instanceof Error ? err.message : 'خطأ غير متوقع';
        showToast('فشل قراءة ملف الحضور: ' + errMsg, 'error');
      } finally {
        setIsImporting(false);
        e.target.value = '';
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
      showToast('تم حذف السجل بنجاح 🗑️', 'success');
      fetchData();
    } catch (err) {
      showToast('فشل الحذف: ' + err.message, 'error');
    }
  };

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    return logs.filter(l => {
      const matchSearch = l.employee_name?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === 'ALL' || l.status === statusFilter;
      const matchDept = departmentFilter === 'ALL' || (l.department || '').trim() === departmentFilter.trim();
      return matchSearch && matchStatus && matchDept;
    });
  }, [logs, searchTerm, statusFilter, departmentFilter]);

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

  // تصدير ملف Excel (سجل الحضور الحالي أو نموذج إدخال جديد)
  const exportToExcel = (asTemplateOnly = false) => {
    let rowsToExport: any[] = [];

    if (!asTemplateOnly && filteredLogs.length > 0) {
      rowsToExport = filteredLogs.map((l, idx) => ({
        '#': idx + 1,
        'كود الموظف': l.employee_id,
        'الموظف': l.employee_name,
        'الفرع / القسم': l.department || 'الفرع الرئيسي',
        'التاريخ': l.log_date,
        'وقت الحضور': l.check_in_time || '',
        'وقت الانصراف': l.check_out_time || '',
        'التأخير (دقيقة)': l.late_minutes ?? 0,
        'العمل الإضافي (ساعة)': l.overtime_hours ?? 0,
        'الحالة': l.status === 'PRESENT' ? 'حاضر' : l.status === 'LATE' ? 'متأخر' : l.status === 'ABSENT' ? 'غائب' : 'إجازة',
        'المصدر': l.source === 'BIOMETRIC_DEVICE' ? 'جهاز بصمة' : l.source === 'EXCEL_IMPORT' ? 'استيراد إكسيل' : 'يدوي',
        'ملاحظات': l.notes || ''
      }));
    } else {
      if (employeesList.length === 0) {
        showToast('لا توجد بيانات موظفين للتصدير', 'warning');
        return;
      }
      rowsToExport = employeesList.map((emp, idx) => ({
        '#': idx + 1,
        'كود الموظف': emp.id,
        'الموظف': emp.name,
        'الفرع / القسم': emp.department || 'الفرع الرئيسي',
        'التاريخ': selectedDate,
        'وقت الحضور': '',
        'وقت الانصراف': '',
        'التأخير (دقيقة)': 0,
        'العمل الإضافي (ساعة)': 0,
        'الحالة': 'حاضر',
        'المصدر': 'استيراد إكسيل',
        'ملاحظات': ''
      }));
    }

    const ws = XLSX.utils.json_to_sheet(rowsToExport);
    ws['!cols'] = [
      { wch: 6 },  // #
      { wch: 38 }, // كود الموظف
      { wch: 25 }, // الموظف
      { wch: 20 }, // الفرع / القسم
      { wch: 14 }, // التاريخ
      { wch: 14 }, // وقت الحضور
      { wch: 14 }, // وقت الانصراف
      { wch: 16 }, // التأخير (دقيقة)
      { wch: 20 }, // العمل الإضافي (ساعة)
      { wch: 12 }, // الحالة
      { wch: 15 }, // المصدر
      { wch: 25 }  // ملاحظات
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'سجل الحضور');
    const fileName = asTemplateOnly
      ? `نموذج_حضور_وانصراف_${selectedDate}.xlsx`
      : `سجل_الحضور_والانصراف_${selectedDate}.xlsx`;
    XLSX.writeFile(wb, fileName);
    showToast(asTemplateOnly ? 'تم تصدير نموذج الحضور بنجاح 📋' : 'تم تصدير سجل الحضور والانصراف إلى Excel بنجاح ✅', 'success');
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
              تسجيل الحضور اليومي، استيراد بيانات أجهزة البصمة، حساب التأخير والعمل الإضافي، والتعديل الفوري لكل حركة.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <a
              href="#/hr/biometrics"
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold transition-all shadow-md shadow-indigo-600/30"
            >
              <Zap size={16} />
              <span>ماكينات ZKTeco Push</span>
            </a>

            <button
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-500/30 hover:bg-indigo-500/40 text-indigo-100 rounded-2xl font-bold transition-all border border-indigo-400/30 shadow-sm"
            >
              <Upload size={16} />
              <span>استيراد ملف بصمة / إكسيل</span>
            </button>

            <button
              onClick={() => exportToExcel(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-2xl font-bold transition-all border border-white/20 shadow-sm"
              title="تحميل نموذج إكسيل فارغ بأسماء الموظفين لتسجيل الحضور"
            >
              <Download size={16} />
              <span>تحميل النموذج</span>
            </button>

            <button
              onClick={() => exportToExcel(false)}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-2xl font-bold transition-all border border-white/20 shadow-sm"
              title="تصدير سجل الحضور والانصراف المعروض"
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
          {/* بحث الموظف */}
          <div className="relative flex-1 md:w-60">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="بحث باسم الموظف..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
            />
          </div>

          {/* التاريخ */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">التاريخ:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700"
            />
          </div>

          {/* فلتر الفرع / القسم */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">الفرع:</span>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700"
            >
              <option value="ALL">🏢 كل الفروع والأقسام</option>
              {departments.map((dept: string) => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>

          {/* فلتر الحالة */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700"
          >
            <option value="ALL">🔘 كل الحالات</option>
            <option value="PRESENT">حاضر في الموعد</option>
            <option value="LATE">متأخر</option>
            <option value="ABSENT">غائب</option>
            <option value="ON_LEAVE">إجازة</option>
          </select>
        </div>

        <div className="text-xs font-bold text-slate-500">
          عدد السجلات: <span className="font-mono text-indigo-700 font-black">{filteredLogs.length}</span>
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
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 text-xs">
                <tr>
                  <th className="p-3.5">اسم الموظف</th>
                  <th className="p-3.5">الفرع / القسم</th>
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
                    <td className="p-3.5">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50/80 border border-blue-100 text-blue-700 rounded-lg text-xs font-bold">
                        <Building2 size={13} className="text-blue-500" />
                        {l.department || 'الفرع الرئيسي'}
                      </span>
                    </td>
                    <td className="p-3.5 font-mono text-slate-800">{l.check_in_time || '---'}</td>
                    <td className="p-3.5 font-mono text-slate-800">{l.check_out_time || '---'}</td>
                    <td className="p-3.5">
                      {l.late_minutes > 0 ? (
                        <span className="text-xs font-bold text-rose-600 font-mono">
                          {l.late_minutes} دقيقة
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">---</span>
                      )}
                    </td>
                    <td className="p-3.5">
                      {l.overtime_hours > 0 ? (
                        <span className="text-xs font-bold text-indigo-600 font-mono">
                          +{l.overtime_hours} س
                        </span>
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
                      ) : l.status === 'ON_LEAVE' ? (
                        <span className="bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded-full text-xs font-bold">
                          إجازة
                        </span>
                      ) : (
                        <span className="bg-rose-100 text-rose-800 px-2.5 py-0.5 rounded-full text-xs font-bold">
                          غائب
                        </span>
                      )}
                    </td>
                    <td className="p-3.5">
                      <span className="text-[11px] font-medium">
                        {l.source === 'BIOMETRIC_DEVICE' ? (
                          <span className="inline-flex items-center gap-1 text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-100">
                            جهاز بصمة
                          </span>
                        ) : l.source === 'EXCEL_IMPORT' ? (
                          <span className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                            استيراد إكسيل
                          </span>
                        ) : (
                          <span className="text-slate-500">يدوي</span>
                        )}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleEditLog(l)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="تعديل السجل"
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(l.id)}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                          title="حذف السجل"
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

      {/* 📝 New / Edit Attendance Modal */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl p-6 md:p-8 animate-in zoom-in-95">
            <form onSubmit={handleSaveLog} className="space-y-4">
              <div className="flex justify-between items-center border-b pb-3">
                <div className="flex items-center gap-2 text-indigo-900 font-black text-lg">
                  <Clock className="text-emerald-500" size={24} />
                  <span>{editingLogId ? 'تعديل حركة حضور وانصراف' : 'تسجيل حركة حضور وانصراف جديدة'}</span>
                </div>
                <button type="button" onClick={() => setIsNewModalOpen(false)} className="text-slate-400">
                  <X size={20} />
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الموظف *</label>
                <select
                  value={formEmpId}
                  onChange={(e) => handleEmpSelect(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                >
                  <option value="">-- اختر الموظف --</option>
                  {employeesList.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.department || 'الفرع الرئيسي'})
                    </option>
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
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">وقت الانصراف</label>
                  <input
                    type="time"
                    value={formCheckOut}
                    onChange={(e) => handleCheckOutChange(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold font-mono"
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
                    className="w-full p-1.5 border rounded-lg font-bold text-rose-600 font-mono"
                  />
                </div>
                <div>
                  <span className="text-slate-500 font-bold block mb-1">ساعات العمل الإضافي:</span>
                  <input
                    type="number"
                    step="0.5"
                    value={formOvertimeHours}
                    onChange={(e) => setFormOvertimeHours(parseFloat(e.target.value) || 0)}
                    className="w-full p-1.5 border rounded-lg font-bold text-indigo-700 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الحالة</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
                  >
                    <option value="PRESENT">حاضر في الموعد</option>
                    <option value="LATE">متأخر</option>
                    <option value="ABSENT">غائب</option>
                    <option value="ON_LEAVE">إجازة</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات</label>
                  <input
                    type="text"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="ملاحظات حول الحركة..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
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
                  {editingLogId ? 'حفظ التعديل' : 'حفظ الحركة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 📥 Import Biometric / Excel File Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl p-6 md:p-8 animate-in zoom-in-95">
            <div className="flex justify-between items-center border-b pb-3 mb-4">
              <div className="flex items-center gap-2 text-indigo-900 font-black text-lg">
                <Upload className="text-indigo-600" size={24} />
                <span>استيراد سجلات الحضور والبصمة (Excel / CSV)</span>
              </div>
              <button 
                type="button" 
                onClick={() => setIsImportModalOpen(false)} 
                disabled={isImporting}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <p className="text-slate-600 leading-relaxed">
                يدعم استيراد الملفات المصدرة من النظام، أو ملفات أجهزة البصمة (ZKTeco، Hikvision)، أو النماذج اليدوية.
                يتم التعرف تلقائياً على أعمدة (كود الموظف، الموظف / الاسم، التاريخ، وقت الحضور، وقت الانصراف، التأخير، الإضافي).
              </p>

              {/* بطاقة تحميل النموذج الجاهز */}
              <div className="flex items-center justify-between p-3.5 bg-indigo-50/80 border border-indigo-100 rounded-2xl">
                <div>
                  <p className="font-bold text-indigo-900 text-xs">تريد نموذجاً جاهزاً بأسماء الموظفين؟</p>
                  <p className="text-slate-500 text-[11px] mt-0.5">حمّل النموذج واملأ أوقات الحضور ثم أعد رفعه هنا مباشرة</p>
                </div>
                <button
                  type="button"
                  onClick={() => exportToExcel(true)}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm shrink-0"
                >
                  <Download size={14} />
                  <span>تحميل النموذج</span>
                </button>
              </div>

              <div className="border-2 border-dashed border-slate-300 rounded-2xl p-6 text-center hover:border-indigo-500 transition-colors bg-slate-50">
                {isImporting ? (
                  <div className="py-4 space-y-2">
                    <Loader2 className="mx-auto text-indigo-600 animate-spin" size={36} />
                    <p className="font-bold text-indigo-900 text-sm">جاري قراءة ومعالجة الملف وتحديث السجلات...</p>
                    <p className="text-slate-400 text-[11px]">يرجى الانتظار لحظات</p>
                  </div>
                ) : (
                  <>
                    <Upload className="mx-auto text-slate-400 mb-2" size={32} />
                    <label className="cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold inline-block shadow-md shadow-indigo-600/20 transition-all">
                      <span>اختر ملف Excel أو CSV</span>
                      <input
                        type="file"
                        accept=".xlsx, .xls, .csv"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                    <p className="text-slate-400 mt-2 text-[11px]">يدعم ملفات .xlsx و .xls و .csv</p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
