import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAccounting } from '../context/AccountingContext';
import { useToast } from '../context/ToastContext';
import { ArrowRight, UserCheck, Plus, Calendar, Save, Loader2, Trash2, CheckCircle2 } from 'lucide-react';

interface AttendanceRecord {
  id?: string;
  employee_id: string;
  employee_name?: string;
  hours_worked: number;
  status: 'draft' | 'approved';
}

const SiteAttendanceManager = ({ projectId, projectName, onBack }: { projectId: string, projectName: string, onBack: () => void }) => {
  const { organization, employees } = useAccounting();
  const { showToast } = useToast();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchAttendance(); }, [selectedDate]);

  const fetchAttendance = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('v_project_site_attendance')
      .select('*')
      .eq('project_id', projectId)
      .eq('attendance_date', selectedDate);
    
    setRecords(data || []);
    setLoading(false);
  };

  const addWorkerRow = () => {
    setRecords([...records, { employee_id: '', hours_worked: 8, status: 'draft' }]);
  };

  const saveAttendance = async () => {
    setLoading(true);
    try {
      const newRecords = records.filter(r => !r.id && r.employee_id).map(r => ({
        project_id: projectId,
        employee_id: r.employee_id,
        attendance_date: selectedDate,
        hours_worked: r.hours_worked,
        hourly_rate: employees.find(e => e.id === r.employee_id)?.hourly_rate || 50, // القيمة الافتراضية
        organization_id: organization?.id
      }));

      if (newRecords.length > 0) {
        const { error } = await supabase.from('project_site_attendance').insert(newRecords);
        if (error) throw error;
      }
      
      showToast('تم حفظ سجل الحضور بنجاح 💾', 'success');
      fetchAttendance();
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const postToAccounting = async () => {
    setLoading(true);
    const { error } = await supabase.rpc('fn_post_site_labor_cost', { 
      p_attendance_date: selectedDate, 
      p_project_id: projectId 
    });

    if (error) showToast(error.message, 'error');
    else {
      showToast('تم ترحيل تكلفة العمالة لحسابات المشروع ✅', 'success');
      fetchAttendance();
    }
    setLoading(false);
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen rtl text-right">
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-white rounded-full shadow-sm transition-colors"><ArrowRight size={24} /></button>
          <div>
            <h1 className="text-2xl font-black text-slate-800">حضور الموقع: {projectName}</h1>
            <p className="text-slate-500">تسجيل ساعات العمل اليومية للعمال والفنيين</p>
          </div>
        </div>
        <div className="flex gap-3">
          <div className="bg-white border rounded-xl px-4 py-2 flex items-center gap-2 shadow-sm">
            <Calendar size={18} className="text-blue-500" />
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="outline-none font-bold text-slate-700" />
          </div>
          <button onClick={postToAccounting} className="bg-emerald-600 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-emerald-100">
            <CheckCircle2 size={18} /> ترحيل مالي
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="p-4 text-slate-500 font-bold">اسم العامل / الموظف</th>
              <th className="p-4 text-slate-500 font-bold text-center">ساعات العمل</th>
              <th className="p-4 text-slate-500 font-bold text-center">الحالة</th>
              <th className="p-4 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {records.map((record, idx) => (
              <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                <td className="p-4">
                  {record.id ? (
                    <span className="font-bold text-slate-700">{record.employee_name}</span>
                  ) : (
                    <select 
                      value={record.employee_id} 
                      onChange={(e) => {
                        const newRecords = [...records];
                        newRecords[idx].employee_id = e.target.value;
                        setRecords(newRecords);
                      }}
                      className="w-full border-2 border-slate-100 rounded-xl p-2 outline-none focus:border-blue-500"
                    >
                      <option value="">-- اختر العامل --</option>
                      {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                    </select>
                  )}
                </td>
                <td className="p-4 text-center">
                  <input 
                    type="number" 
                    value={record.hours_worked} 
                    disabled={record.status === 'approved'}
                    onChange={(e) => {
                      const newRecords = [...records];
                      newRecords[idx].hours_worked = parseFloat(e.target.value);
                      setRecords(newRecords);
                    }}
                    className="w-20 text-center border-2 border-slate-100 rounded-xl p-2 font-black text-blue-600"
                  />
                </td>
                <td className="p-4 text-center">
                  <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${record.status === 'approved' ? 'bg-emerald-100 text-emerald-600' : 'bg-orange-100 text-orange-600'}`}>
                    {record.status === 'approved' ? 'مُرحل' : 'مسودة'}
                  </span>
                </td>
                <td className="p-4 text-center">
                  {record.status === 'draft' && (
                    <button onClick={() => setRecords(records.filter((_, i) => i !== idx))} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={18} /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="p-4 bg-slate-50 flex gap-4">
          <button onClick={addWorkerRow} className="flex-1 border-2 border-dashed border-slate-200 rounded-2xl py-3 text-slate-400 font-bold hover:bg-white hover:text-blue-600 hover:border-blue-200 transition-all flex items-center justify-center gap-2">
            <Plus size={20} /> إضافة عامل للقائمة
          </button>
          <button onClick={saveAttendance} disabled={loading} className="px-12 bg-slate-900 text-white rounded-2xl font-black hover:bg-slate-800 transition-all flex items-center gap-2">
            {loading ? <Loader2 className="animate-spin" /> : <><Save size={20} /> حفظ السجل</>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SiteAttendanceManager;