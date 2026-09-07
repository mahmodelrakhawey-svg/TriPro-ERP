import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import * as XLSX from 'xlsx';
import {
  Activity, Gauge, AlertTriangle, CheckCircle2, Clock,
  Plus, Search, Filter, FileSpreadsheet, Printer, Layers,
  Cog, Award, TrendingUp, Zap, HelpCircle, X, Trash2
} from 'lucide-react';

interface OeeLog {
  id: string;
  machine_name: string;
  log_date: string;
  shift_name: string;
  planned_production_time_minutes: number;
  downtime_minutes: number;
  downtime_reason?: string;
  ideal_cycle_time_seconds: number;
  total_produced_units: number;
  good_units: number;
  rejected_units: number;
  availability_percentage: number;
  performance_percentage: number;
  quality_percentage: number;
  oee_percentage: number;
  operator_name?: string;
  notes?: string;
  created_at: string;
}

export default function MachineOeeTracker() {
  const { organization, currentSelectedOrgId, currentUser } = useAccounting();
  const { showToast } = useToast();

  const [logs, setLogs] = useState<OeeLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [shiftFilter, setShiftFilter] = useState('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formMachine, setFormMachine] = useState('خط التشكيل والكبس الهيدروليكي 01');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formShift, setFormShift] = useState('الوردية الصباحية (الأولى)');
  const [formPlannedTime, setFormPlannedTime] = useState<number>(480); // 8 hours = 480 mins
  const [formDowntime, setFormDowntime] = useState<number>(45);
  const [formDowntimeReason, setFormDowntimeReason] = useState('تغيير قوالب وتهيئة خط الإنتاج (Setup)');
  const [formIdealCycle, setFormIdealCycle] = useState<number>(12); // 12 seconds per piece
  const [formTotalUnits, setFormTotalUnits] = useState<number>(2000);
  const [formGoodUnits, setFormGoodUnits] = useState<number>(1940);
  const [formOperator, setFormOperator] = useState(currentUser?.full_name || 'فني التشغيل');
  const [formNotes, setFormNotes] = useState('');

  const [realWorkCenters, setRealWorkCenters] = useState<{ id: string; name: string }[]>([]);
  const orgId = organization?.id || currentSelectedOrgId || currentUser?.organization_id;

  // Real Factory Machines from Work Centers
  const availableMachines = useMemo(() => {
    if (realWorkCenters.length > 0) {
      return realWorkCenters.map(wc => `ماكينة / خط (${wc.name})`);
    }
    return ['ماكينة الإنتاج الرئيسية 01', 'خط التجميع والتشغيل 01'];
  }, [realWorkCenters]);

  // Dynamic Live Calculation of OEE:
  const computedMetrics = useMemo(() => {
    const planned = formPlannedTime > 0 ? formPlannedTime : 480;
    const downtime = Math.min(planned, Math.max(0, formDowntime));
    const operatingTime = planned - downtime;

    // 1. Availability %
    const availability = (operatingTime / planned) * 100;

    // 2. Performance % = (Ideal Cycle Time * Total Units) / (Operating Time in seconds) * 100
    const operatingSeconds = operatingTime * 60;
    const standardSecondsNeeded = formTotalUnits * formIdealCycle;
    const performance = operatingSeconds > 0 ? Math.min(100, (standardSecondsNeeded / operatingSeconds) * 100) : 0;

    // 3. Quality % = Good Units / Total Units * 100
    const rejected = Math.max(0, formTotalUnits - formGoodUnits);
    const quality = formTotalUnits > 0 ? (formGoodUnits / formTotalUnits) * 100 : 100;

    // 4. Overall OEE %
    const oee = (availability / 100) * (performance / 100) * (quality / 100) * 100;

    return {
      availability: Math.round(availability * 10) / 10,
      performance: Math.round(performance * 10) / 10,
      quality: Math.round(quality * 10) / 10,
      oee: Math.round(oee * 10) / 10,
      rejected
    };
  }, [formPlannedTime, formDowntime, formIdealCycle, formTotalUnits, formGoodUnits]);

  // Fetch Data
  const fetchLogs = async () => {
    if (!orgId) return;
    setIsLoading(true);
    try {
      // 1. Fetch Real Factory Work Centers
      const { data: wcData } = await supabase
        .from('mfg_work_centers')
        .select('id, name')
        .eq('organization_id', orgId);
      if (wcData) setRealWorkCenters(wcData);

      // 2. Fetch OEE Logs
      const { data, error } = await supabase
        .from('mfg_machine_oee_logs')
        .select('*')
        .eq('organization_id', orgId)
        .order('log_date', { ascending: false });

      if (error) {
        console.warn('mfg_machine_oee_logs table notice:', error.message);
        setLogs([]);
      } else {
        setLogs(data || []);
      }
    } catch (err: any) {
      console.error(err);
      setLogs([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [orgId]);

  // Save Log
  const handleSaveLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formMachine) {
      showToast('يرجى تحديد اسم الماكينة', 'warning');
      return;
    }

    try {
      const payload = {
        organization_id: orgId,
        machine_name: formMachine,
        log_date: formDate,
        shift_name: formShift,
        planned_production_time_minutes: formPlannedTime,
        downtime_minutes: formDowntime,
        downtime_reason: formDowntime > 0 ? formDowntimeReason : null,
        ideal_cycle_time_seconds: formIdealCycle,
        total_produced_units: formTotalUnits,
        good_units: formGoodUnits,
        rejected_units: computedMetrics.rejected,
        availability_percentage: computedMetrics.availability,
        performance_percentage: computedMetrics.performance,
        quality_percentage: computedMetrics.quality,
        oee_percentage: computedMetrics.oee,
        operator_name: formOperator,
        notes: formNotes || null
      };

      const { error } = await supabase.from('mfg_machine_oee_logs').insert(payload);
      if (error) throw error;

      showToast('تم تسجيل واحتساب مؤشر كفاءة الماكينة (OEE) بنجاح ⚙️', 'success');
      setIsModalOpen(false);
      fetchLogs();
    } catch (err: any) {
      showToast('فشل حفظ السجل: ' + err.message, 'error');
    }
  };

  // Delete Log
  const handleDelete = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا السجل؟')) return;
    try {
      const { error } = await supabase.from('mfg_machine_oee_logs').delete().eq('id', id);
      if (error) throw error;
      showToast('تم حذف السجل', 'success');
      fetchLogs();
    } catch (err: any) {
      showToast('فشل الحذف: ' + err.message, 'error');
    }
  };

  // Helper Badge
  const renderOeeBadge = (oee: number) => {
    if (oee >= 85) {
      return <span className="bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full text-xs font-black">🌟 World-Class ({oee}%)</span>;
    } else if (oee >= 70) {
      return <span className="bg-blue-100 text-blue-800 px-2.5 py-1 rounded-full text-xs font-bold">🟢 ممتاز ({oee}%)</span>;
    } else if (oee >= 50) {
      return <span className="bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full text-xs font-bold">🟡 متوسط ({oee}%)</span>;
    } else {
      return <span className="bg-rose-100 text-rose-800 px-2.5 py-1 rounded-full text-xs font-black">🔴 منخفض / عنق زجاجة ({oee}%)</span>;
    }
  };

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    return logs.filter(l => {
      const matchSearch = l.machine_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          l.operator_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          l.downtime_reason?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchShift = shiftFilter === 'ALL' || l.shift_name === shiftFilter;
      return matchSearch && matchShift;
    });
  }, [logs, searchTerm, shiftFilter]);

  // KPIs
  const kpis = useMemo(() => {
    if (filteredLogs.length === 0) return { avgOee: 0, avgAvail: 0, avgPerf: 0, avgQual: 0, totalDowntime: 0 };
    let sumOee = 0, sumAvail = 0, sumPerf = 0, sumQual = 0, sumDown = 0;
    filteredLogs.forEach(l => {
      sumOee += Number(l.oee_percentage || 0);
      sumAvail += Number(l.availability_percentage || 0);
      sumPerf += Number(l.performance_percentage || 0);
      sumQual += Number(l.quality_percentage || 0);
      sumDown += Number(l.downtime_minutes || 0);
    });
    return {
      avgOee: Math.round((sumOee / filteredLogs.length) * 10) / 10,
      avgAvail: Math.round((sumAvail / filteredLogs.length) * 10) / 10,
      avgPerf: Math.round((sumPerf / filteredLogs.length) * 10) / 10,
      avgQual: Math.round((sumQual / filteredLogs.length) * 10) / 10,
      totalDowntime: sumDown
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
      'التاريخ': l.log_date,
      'الماكينة / الخط': l.machine_name,
      'الوردية': l.shift_name,
      'التوافر Availability %': `${l.availability_percentage}%`,
      'الأداء Performance %': `${l.performance_percentage}%`,
      'الجودة Quality %': `${l.quality_percentage}%`,
      'المؤشر العام OEE %': `${l.oee_percentage}%`,
      'وقت التوقف (دقيقة)': l.downtime_minutes,
      'سبب التوقف': l.downtime_reason || 'لا يوجد',
      'فني التشغيل': l.operator_name || '---'
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'مؤشر OEE');
    XLSX.writeFile(wb, `Machine_OEE_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('تم تصدير تقرير OEE إلى Excel ✅', 'success');
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in" dir="rtl">
      
      {/* ⚙️ Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="inline-flex items-center gap-2 bg-indigo-500/20 text-indigo-200 px-3 py-1 rounded-full text-xs font-bold mb-3 border border-indigo-400/30">
              <Gauge size={14} className="text-amber-400" />
              <span>مؤشرات الكفاءة التشغيلية العالمية (Overall Equipment Effectiveness)</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">
              مؤشر الفعالية الكلية للمعدات والماكينات (OEE)
            </h1>
            <p className="text-indigo-200 text-sm mt-1 max-w-2xl">
              تتبع دقيق لمعدلات التوافر (Availability)، الأداء (Performance)، والجودة (Quality)، مع تحليل أسباب التوقف والأعطال.
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
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 text-white rounded-2xl font-bold transition-all shadow-lg shadow-indigo-500/30"
            >
              <Plus size={18} />
              <span>تسجيل فحص وردية OEE جديد</span>
            </button>
          </div>
        </div>
      </div>

      {/* 📊 KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold mb-1">متوسط مؤشر OEE العام</p>
            <h3 className="text-2xl font-black text-indigo-700">{kpis.avgOee}%</h3>
            <span className="text-[11px] text-slate-400 font-bold">الهدف العالمي: 85%</span>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <Gauge size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold mb-1">معدل التوافر (Availability)</p>
            <h3 className="text-2xl font-black text-blue-600">{kpis.avgAvail}%</h3>
            <span className="text-[11px] text-slate-400 font-bold">وقت التشغيل الفعلي</span>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Clock size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold mb-1">معدل الأداء والسرعة</p>
            <h3 className="text-2xl font-black text-amber-600">{kpis.avgPerf}%</h3>
            <span className="text-[11px] text-slate-400 font-bold">السرعة مقارنة بالمعياري</span>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <Zap size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold mb-1">معدل الجودة (Quality)</p>
            <h3 className="text-2xl font-black text-emerald-600">{kpis.avgQual}%</h3>
            <span className="text-[11px] text-slate-400 font-bold">نسبة الإنتاج السليم</span>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle2 size={24} />
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
              placeholder="بحث بالماكينة أو المشغل أو سبب التوقف..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
            />
          </div>

          <select
            value={shiftFilter}
            onChange={(e) => setShiftFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700"
          >
            <option value="ALL">🏢 كل الورديات</option>
            <option value="الوردية الصباحية (الأولى)">الوردية الصباحية (الأولى)</option>
            <option value="الوردية المسائية (الثانية)">الوردية المسائية (الثانية)</option>
            <option value="الوردية الليلية (الثالثة)">الوردية الليلية (الثالثة)</option>
          </select>
        </div>

        <span className="text-xs font-bold text-slate-500">
          إجمالي أوقات التوقف: <span className="text-rose-600 font-bold">{kpis.totalDowntime} دقيقة</span>
        </span>
      </div>

      {/* 📋 OEE Logs Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 font-bold animate-pulse">جاري تحميل سجلات الـ OEE...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center">
            <Gauge size={48} className="mx-auto text-slate-300 mb-3" />
            <h3 className="text-slate-700 font-bold text-lg mb-1">لا توجد سجلات OEE مسجلة</h3>
            <p className="text-slate-400 text-sm">اضغط على "تسجيل فحص وردية OEE جديد" لإدخال بيانات تشغيل الماكينة.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3.5">التاريخ والوردية</th>
                  <th className="p-3.5">اسم الماكينة / الخط</th>
                  <th className="p-3.5">التوافر A%</th>
                  <th className="p-3.5">الأداء P%</th>
                  <th className="p-3.5">الجودة Q%</th>
                  <th className="p-3.5">المؤشر العام OEE</th>
                  <th className="p-3.5">أوقات التوقف (Downtime)</th>
                  <th className="p-3.5 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5">
                      <span className="font-bold text-slate-800 block">{item.log_date}</span>
                      <span className="text-xs text-slate-400">{item.shift_name}</span>
                    </td>
                    <td className="p-3.5 font-bold text-slate-900">{item.machine_name}</td>
                    <td className="p-3.5 font-bold text-blue-600">{item.availability_percentage}%</td>
                    <td className="p-3.5 font-bold text-amber-600">{item.performance_percentage}%</td>
                    <td className="p-3.5 font-bold text-emerald-600">{item.quality_percentage}%</td>
                    <td className="p-3.5">{renderOeeBadge(item.oee_percentage)}</td>
                    <td className="p-3.5">
                      {item.downtime_minutes > 0 ? (
                        <div>
                          <span className="text-xs font-bold text-rose-600 block">{item.downtime_minutes} دقيقة</span>
                          <span className="text-[11px] text-slate-500 truncate max-w-xs block">{item.downtime_reason}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-emerald-600 font-bold">لا يوجد توقف (إنتاج متصل)</span>
                      )}
                    </td>
                    <td className="p-3.5">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleDelete(item.id)}
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

      {/* 📝 New OEE Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl p-6 md:p-8 animate-in zoom-in-95">
            <form onSubmit={handleSaveLog} className="space-y-4">
              <div className="flex justify-between items-center border-b pb-3">
                <div className="flex items-center gap-2 text-indigo-900 font-black text-lg">
                  <Gauge className="text-indigo-600" size={24} />
                  <span>تسجيل واحتساب مؤشر OEE للماكينة</span>
                </div>
                <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400">
                  <X size={20} />
                </button>
              </div>

              {/* Quick Presets from Real Factory Machines */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">ماكينات وخطوط الإنتاج المتاحة بالمصنع:</label>
                <div className="flex flex-wrap gap-1.5">
                  {availableMachines.map((m, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setFormMachine(m)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                        formMachine === m ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">اسم الماكينة / الخط *</label>
                  <input
                    type="text"
                    value={formMachine}
                    onChange={(e) => setFormMachine(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ الوردية *</label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الوردية</label>
                  <select
                    value={formShift}
                    onChange={(e) => setFormShift(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  >
                    <option value="الوردية الصباحية (الأولى)">الوردية الصباحية (الأولى)</option>
                    <option value="الوردية المسائية (الثانية)">الوردية المسائية (الثانية)</option>
                    <option value="الوردية الليلية (الثالثة)">الوردية الليلية (الثالثة)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الوقت المخطط للإنتاج (دقيقة) *</label>
                  <input
                    type="number"
                    value={formPlannedTime}
                    onChange={(e) => setFormPlannedTime(parseFloat(e.target.value) || 0)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">إجمالي وقت التوقف (دقيقة)</label>
                  <input
                    type="number"
                    value={formDowntime}
                    onChange={(e) => setFormDowntime(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-rose-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">سبب التوقف الرئيسي</label>
                  <select
                    value={formDowntimeReason}
                    onChange={(e) => setFormDowntimeReason(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  >
                    <option value="تغيير قوالب وتهيئة خط الإنتاج (Setup)">تغيير قوالب وتهيئة (Setup)</option>
                    <option value="عطل ميكانيكي / هيدروليكي طارئ">عطل ميكانيكي / هيدروليكي طارئ</option>
                    <option value="نقص أو تأخر وصول المواد الخام">نقص أو تأخر المواد الخام</option>
                    <option value="غياب أو تبديل المشغلين">غياب أو تبديل المشغلين</option>
                    <option value="انقطاع كهرباء أو هواء مضغوط">انقطاع مرافق (كهرباء/هواء)</option>
                    <option value="صيانة دورية وقائية">صيانة دورية وقائية</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الزمن المعياري للقطعة (ثواني) *</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formIdealCycle}
                    onChange={(e) => setFormIdealCycle(parseFloat(e.target.value) || 0)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">إجمالي القطع المنتجة بالوردية *</label>
                  <input
                    type="number"
                    value={formTotalUnits}
                    onChange={(e) => setFormTotalUnits(parseInt(e.target.value) || 0)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">القطع السليمة المطابقة للمواصفات *</label>
                  <input
                    type="number"
                    value={formGoodUnits}
                    onChange={(e) => setFormGoodUnits(parseInt(e.target.value) || 0)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">اسم فني / مهندس التشغيل</label>
                  <input
                    type="text"
                    value={formOperator}
                    onChange={(e) => setFormOperator(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>
              </div>

              {/* 🧮 Live OEE Preview Card */}
              <div className="grid grid-cols-4 gap-2 bg-slate-900 text-white p-4 rounded-2xl">
                <div className="text-center">
                  <span className="text-[11px] text-slate-400 block font-bold">التوافر (A):</span>
                  <span className="text-lg font-black text-blue-400">{computedMetrics.availability}%</span>
                </div>
                <div className="text-center">
                  <span className="text-[11px] text-slate-400 block font-bold">الأداء (P):</span>
                  <span className="text-lg font-black text-amber-400">{computedMetrics.performance}%</span>
                </div>
                <div className="text-center">
                  <span className="text-[11px] text-slate-400 block font-bold">الجودة (Q):</span>
                  <span className="text-lg font-black text-emerald-400">{computedMetrics.quality}%</span>
                </div>
                <div className="text-center bg-indigo-600/40 p-1.5 rounded-xl border border-indigo-400/30">
                  <span className="text-[11px] text-indigo-200 block font-bold">المؤشر العام OEE:</span>
                  <span className="text-xl font-black text-amber-300">{computedMetrics.oee}%</span>
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
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm shadow-md shadow-indigo-600/30"
                >
                  حفظ واحتساب الـ OEE
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
