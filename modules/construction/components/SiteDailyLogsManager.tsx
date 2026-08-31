import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import * as XLSX from 'xlsx';
import {
  Calendar, Users, Wrench, ShieldAlert, Plus, Search, Filter,
  FileSpreadsheet, Printer, CheckCircle2, AlertTriangle, CloudSun,
  HardHat, Truck, ArrowRight, Eye, Edit3, Trash2, Clock, MapPin,
  FileText, Building2, ChevronRight, X
} from 'lucide-react';

interface WorkforceItem {
  trade: string;
  count: number;
  hours: number;
  overtime: number;
}

interface EquipmentItem {
  name: string;
  count: number;
  hours: number;
  status: 'عاملة' | 'معطلة' | 'تحت الصيانة';
}

interface WorkItem {
  boq_item: string;
  location: string;
  qty: number;
  unit: string;
}

interface MaterialReceivedItem {
  material: string;
  qty: number;
  unit: string;
  supplier: string;
}

interface DailyLog {
  id: string;
  project_id: string;
  project_name?: string;
  log_date: string;
  weather_condition: string;
  temperature: string;
  site_condition: string;
  workforce: WorkforceItem[];
  equipment: EquipmentItem[];
  work_executed: WorkItem[];
  materials_received: MaterialReceivedItem[];
  safety_incidents?: string;
  work_delays_and_issues?: string;
  visitors_notes?: string;
  site_engineer_name: string;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED_BY_PM';
  created_at: string;
}

export default function SiteDailyLogsManager() {
  const { organization, currentSelectedOrgId, currentUser } = useAccounting();
  const { showToast } = useToast();

  const [projectsList, setProjectsList] = useState<{ id: string; name: string; code?: string }[]>([]);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [activeLogForView, setActiveLogForView] = useState<DailyLog | null>(null);

  // Form State
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [formProjectId, setFormProjectId] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formWeather, setFormWeather] = useState('مشمس ومعتدل');
  const [formTemperature, setFormTemperature] = useState('28°C');
  const [formSiteCondition, setFormSiteCondition] = useState('طبيعي - العمل منتظم');
  const [formEngineerName, setFormEngineerName] = useState(currentUser?.full_name || 'م. الموقع المسؤول');
  const [formSafety, setFormSafety] = useState('');
  const [formDelays, setFormDelays] = useState('');
  const [formVisitors, setFormVisitors] = useState('');

  // Dynamic Sub-tables
  const [workforceList, setWorkforceList] = useState<WorkforceItem[]>([
    { trade: 'مهندسين ومشرفين', count: 2, hours: 8, overtime: 0 },
    { trade: 'نجارين مسلح', count: 6, hours: 8, overtime: 2 },
    { trade: 'حدادين مسلح', count: 6, hours: 8, overtime: 2 },
    { trade: 'عمالة عادية / مساعدة', count: 8, hours: 8, overtime: 0 }
  ]);

  const [equipmentList, setEquipmentList] = useState<EquipmentItem[]>([
    { name: 'حفار كاتربيلر 320', count: 1, hours: 7, status: 'عاملة' },
    { name: 'لودر كوماتسو', count: 1, hours: 6, status: 'عاملة' },
    { name: 'خلاطة خرسانة مركزية', count: 1, hours: 5, status: 'عاملة' }
  ]);

  const [workExecutedList, setWorkExecutedList] = useState<WorkItem[]>([
    { boq_item: 'صب خرسانة مسلحة للأعمدة وسقف الدور الأول', location: 'المبنى A - المحور 1-4', qty: 45, unit: 'م3' }
  ]);

  const [materialsReceivedList, setMaterialsReceivedList] = useState<MaterialReceivedItem[]>([
    { material: 'حديد تسليح عالي المقاومة 16مم', qty: 15, unit: 'طن', supplier: 'حديد عز' }
  ]);

  const orgId = organization?.id || currentSelectedOrgId || currentUser?.organization_id;

  // Fetch Daily Logs
  const fetchDailyLogs = async () => {
    if (!orgId) return;
    setIsLoading(true);
    try {
      const { data: pData } = await supabase.from('projects').select('id, name').eq('organization_id', orgId);
      const currentProjects = pData || [];
      setProjectsList(currentProjects);

      let query = supabase
        .from('project_daily_logs')
        .select('*')
        .eq('organization_id', orgId)
        .order('log_date', { ascending: false });

      if (selectedProjectId !== 'ALL') {
        query = query.eq('project_id', selectedProjectId);
      }

      const { data, error } = await query;
      if (error) {
        console.warn('project_daily_logs table notice:', error.message);
        setLogs([]);
      } else {
        const mapped: DailyLog[] = (data || []).map((d: any) => {
          const proj = currentProjects.find(p => p.id === d.project_id);
          return {
            ...d,
            project_name: proj?.name || 'مشروع غير محدد',
            workforce: Array.isArray(d.workforce) ? d.workforce : [],
            equipment: Array.isArray(d.equipment) ? d.equipment : [],
            work_executed: Array.isArray(d.work_executed) ? d.work_executed : [],
            materials_received: Array.isArray(d.materials_received) ? d.materials_received : []
          };
        });
        setLogs(mapped);
      }
    } catch (err: any) {
      console.error(err);
      setLogs([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDailyLogs();
  }, [orgId, selectedProjectId]);

  // Reset form
  const handleOpenAddModal = () => {
    setEditingLogId(null);
    setFormProjectId(projectsList[0]?.id || '');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormWeather('مشمس ومعتدل');
    setFormTemperature('28°C');
    setFormSiteCondition('طبيعي - العمل منتظم');
    setFormEngineerName(currentUser?.full_name || 'م. الموقع المسؤول');
    setFormSafety('');
    setFormDelays('');
    setFormVisitors('');
    setWorkforceList([
      { trade: 'مهندسين ومشرفين', count: 2, hours: 8, overtime: 0 },
      { trade: 'نجارين مسلح', count: 6, hours: 8, overtime: 2 },
      { trade: 'حدادين مسلح', count: 6, hours: 8, overtime: 2 },
      { trade: 'عمالة مساعدة', count: 8, hours: 8, overtime: 0 }
    ]);
    setEquipmentList([
      { name: 'حفار كاتربيلر', count: 1, hours: 7, status: 'عاملة' },
      { name: 'لودر كوماتسو', count: 1, hours: 6, status: 'عاملة' }
    ]);
    setWorkExecutedList([
      { boq_item: 'صب خرسانة مسلحة', location: 'الموقع العام', qty: 30, unit: 'م3' }
    ]);
    setMaterialsReceivedList([]);
    setIsModalOpen(true);
  };

  // Save log
  const handleSaveLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formProjectId) {
      showToast('يرجى اختيار المشروع أولاً', 'warning');
      return;
    }

    try {
      const payload = {
        organization_id: orgId,
        project_id: formProjectId,
        log_date: formDate,
        weather_condition: formWeather,
        temperature: formTemperature,
        site_condition: formSiteCondition,
        site_engineer_name: formEngineerName,
        workforce: workforceList,
        equipment: equipmentList,
        work_executed: workExecutedList,
        materials_received: materialsReceivedList,
        safety_incidents: formSafety || null,
        work_delays_and_issues: formDelays || null,
        visitors_notes: formVisitors || null,
        status: 'SUBMITTED'
      };

      if (editingLogId) {
        const { error } = await supabase
          .from('project_daily_logs')
          .update(payload)
          .eq('id', editingLogId);
        if (error) throw error;
        showToast('تم تحديث تقرير يومية الموقع بنجاح ✅', 'success');
      } else {
        const { error } = await supabase
          .from('project_daily_logs')
          .insert(payload);
        if (error) throw error;
        showToast('تم حفظ واعتماد يومية الموقع الميدانية بنجاح 🚀', 'success');
      }

      setIsModalOpen(false);
      fetchDailyLogs();
    } catch (err: any) {
      console.error(err);
      showToast('فشل حفظ يومية الموقع: ' + err.message, 'error');
    }
  };

  // Delete Log
  const handleDeleteLog = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا السجل اليومي للموقع؟')) return;
    try {
      const { error } = await supabase.from('project_daily_logs').delete().eq('id', id);
      if (error) throw error;
      showToast('تم حذف السجل بنجاح', 'success');
      fetchDailyLogs();
    } catch (err: any) {
      showToast('فشل الحذف: ' + err.message, 'error');
    }
  };

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchSearch = log.project_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          log.site_engineer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          log.weather_condition?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchDate = !dateFilter || log.log_date === dateFilter;
      return matchSearch && matchDate;
    });
  }, [logs, searchTerm, dateFilter]);

  // Total Summary Metrics
  const summaryMetrics = useMemo(() => {
    let totalManpowerToday = 0;
    let totalEquipmentWorking = 0;
    let totalDelaysCount = 0;

    filteredLogs.forEach(l => {
      l.workforce?.forEach(w => totalManpowerToday += Number(w.count || 0));
      l.equipment?.forEach(eq => {
        if (eq.status === 'عاملة') totalEquipmentWorking += Number(eq.count || 0);
      });
      if (l.work_delays_and_issues) totalDelaysCount++;
    });

    return {
      totalLogs: filteredLogs.length,
      totalManpower: totalManpowerToday,
      totalEquipment: totalEquipmentWorking,
      totalDelays: totalDelaysCount
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
      'المشروع': l.project_name,
      'مهندس الموقع': l.site_engineer_name,
      'حالة الطقس': `${l.weather_condition} (${l.temperature || ''})`,
      'إجمالي العمالة': l.workforce.reduce((acc, w) => acc + Number(w.count || 0), 0),
      'إجمالي المعدات': l.equipment.reduce((acc, eq) => acc + Number(eq.count || 0), 0),
      'حالة الموقع': l.site_condition,
      'معوقات العمل والتأخير': l.work_delays_and_issues || 'لا يوجد'
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'يوميات الموقع');
    XLSX.writeFile(wb, `Daily_Site_Logs_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('تم تصدير تقرير يوميات الموقع إلى Excel ✅', 'success');
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in" dir="rtl">
      
      {/* 🏗️ Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="inline-flex items-center gap-2 bg-indigo-500/20 text-indigo-200 px-3 py-1 rounded-full text-xs font-bold mb-3 border border-indigo-400/30">
              <HardHat size={14} className="animate-bounce" />
              <span>إدارة وتوثيق الموقع الميداني (Site Diary & Field Logs)</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">
              سجلات ويوميات الموقع الميدانية
            </h1>
            <p className="text-indigo-200 text-sm mt-1 max-w-2xl">
              توثيق شامل لحركة العمالة، تشغيل المعدات، تقدم بنود الأعمال، وحصر التوريدات الموقعية ومعوقات التنفيذ.
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
              onClick={handleOpenAddModal}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-2xl font-bold transition-all shadow-lg shadow-emerald-500/30 active:scale-95"
            >
              <Plus size={18} />
              <span>تسجيل يومية موقع جديدة</span>
            </button>
          </div>
        </div>
      </div>

      {/* 📊 KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold mb-1">إجمالي التقارير المسجلة</p>
            <h3 className="text-2xl font-black text-slate-800">{summaryMetrics.totalLogs}</h3>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <FileText size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold mb-1">إجمالي العمالة المرصودة</p>
            <h3 className="text-2xl font-black text-emerald-600">{summaryMetrics.totalManpower} <span className="text-xs font-normal text-slate-500">فرد</span></h3>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <Users size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold mb-1">المعدات الميدانية العاملة</p>
            <h3 className="text-2xl font-black text-amber-600">{summaryMetrics.totalEquipment} <span className="text-xs font-normal text-slate-500">معدة</span></h3>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <Truck size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold mb-1">أيام بها معوقات / تأخير</p>
            <h3 className="text-2xl font-black text-rose-600">{summaryMetrics.totalDelays}</h3>
          </div>
          <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
            <AlertTriangle size={24} />
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
              placeholder="بحث بالمهندس أو الطقس أو المشروع..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
            />
          </div>

          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="ALL">🏢 كل المشروعات</option>
            {(projectsList || []).map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />

          {dateFilter && (
            <button
              onClick={() => setDateFilter('')}
              className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl text-xs font-bold"
            >
              إلغاء التاريخ
            </button>
          )}
        </div>
      </div>

      {/* 📋 Logs Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-slate-800 text-base flex items-center gap-2">
            <Calendar size={18} className="text-indigo-600" />
            <span>قائمة السجلات اليومية الميدانية</span>
          </h2>
          <span className="text-xs font-bold text-slate-500">
            عرض {filteredLogs.length} سجل
          </span>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-slate-400 font-bold animate-pulse">
            جاري تحميل سجلات الموقع...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center">
            <HardHat size={48} className="mx-auto text-slate-300 mb-3" />
            <h3 className="text-slate-700 font-bold text-lg mb-1">لا توجد سجلات يومية مطابقة</h3>
            <p className="text-slate-400 text-sm">اضغط على زر "تسجيل يومية موقع جديدة" لإضافة تقرير اليوم الميداني.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3.5">التاريخ</th>
                  <th className="p-3.5">المشروع</th>
                  <th className="p-3.5">الطقس والحرارة</th>
                  <th className="p-3.5">العمالة الميدانية</th>
                  <th className="p-3.5">المعدات العاملة</th>
                  <th className="p-3.5">مهندس الموقع</th>
                  <th className="p-3.5">الحالة</th>
                  <th className="p-3.5 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.map(log => {
                  const totalWorkers = log.workforce.reduce((a, b) => a + Number(b.count || 0), 0);
                  const totalEquip = log.equipment.filter(e => e.status === 'عاملة').length;

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5 font-bold text-slate-800">
                        {log.log_date}
                      </td>
                      <td className="p-3.5 font-medium text-slate-700">
                        <div className="flex items-center gap-1.5">
                          <Building2 size={14} className="text-indigo-500" />
                          <span>{log.project_name}</span>
                        </div>
                      </td>
                      <td className="p-3.5">
                        <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 px-2.5 py-1 rounded-lg text-xs font-bold">
                          <CloudSun size={12} />
                          {log.weather_condition} ({log.temperature || '28°C'})
                        </span>
                      </td>
                      <td className="p-3.5">
                        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg text-xs font-bold">
                          <Users size={12} />
                          {totalWorkers} فرد
                        </span>
                      </td>
                      <td className="p-3.5">
                        <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg text-xs font-bold">
                          <Truck size={12} />
                          {totalEquip} معدة
                        </span>
                      </td>
                      <td className="p-3.5 text-slate-600 font-medium">
                        {log.site_engineer_name}
                      </td>
                      <td className="p-3.5">
                        <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full text-xs font-bold">
                          <CheckCircle2 size={12} />
                          معتمد ميدانياً
                        </span>
                      </td>
                      <td className="p-3.5">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => {
                              setActiveLogForView(log);
                              setIsPrintModalOpen(true);
                            }}
                            title="عرض وطباعة التقرير"
                            className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          >
                            <Printer size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteLog(log.id)}
                            title="حذف"
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
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

      {/* 📝 New / Edit Daily Log Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100 animate-in zoom-in-95">
            <form onSubmit={handleSaveLog}>
              <div className="sticky top-0 bg-white p-5 border-b border-slate-100 flex items-center justify-between z-10">
                <div className="flex items-center gap-2 text-indigo-900 font-black text-lg">
                  <HardHat className="text-amber-500" size={24} />
                  <span>تسجيل تقرير يومية الموقع الميداني</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-6">
                
                {/* 1. General Project & Site Info */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">المشروع *</label>
                    <select
                      value={formProjectId}
                      onChange={(e) => setFormProjectId(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-800"
                    >
                      <option value="">-- اختر المشروع --</option>
                      {(projectsList || []).map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ اليومية *</label>
                    <input
                      type="date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-800"
                    >
                    </input>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">مهندس الموقع المسؤول</label>
                    <input
                      type="text"
                      value={formEngineerName}
                      onChange={(e) => setFormEngineerName(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">حالة الطقس</label>
                    <select
                      value={formWeather}
                      onChange={(e) => setFormWeather(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-800"
                    >
                      <option value="مشمس ومعتدل">☀️ مشمس ومعتدل</option>
                      <option value="حار جداً">🔥 حار جداً</option>
                      <option value="غائم جزئياً">⛅ غائم جزئياً</option>
                      <option value="عواصف ترابية">🌪️ عواصف ترابية</option>
                      <option value="أمطار">🌧️ أمطار وتوقف عمل</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">درجة الحرارة</label>
                    <input
                      type="text"
                      value={formTemperature}
                      onChange={(e) => setFormTemperature(e.target.value)}
                      placeholder="مثال: 32°C"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">حالة الموقع العامة</label>
                    <input
                      type="text"
                      value={formSiteCondition}
                      onChange={(e) => setFormSiteCondition(e.target.value)}
                      placeholder="مثال: طبيعي - العمل منتظم"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-800"
                    />
                  </div>
                </div>

                {/* 2. Workforce Census */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                      <Users size={16} className="text-emerald-600" />
                      <span>حصر العمالة الميدانية (Manpower Census)</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => setWorkforceList([...workforceList, { trade: 'عمالة', count: 1, hours: 8, overtime: 0 }])}
                      className="px-3 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl text-xs font-bold flex items-center gap-1"
                    >
                      <Plus size={14} />
                      <span>إضافة مهنة</span>
                    </button>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-100 text-slate-600 font-bold">
                        <tr>
                          <th className="p-2.5">التخصص / المهنة</th>
                          <th className="p-2.5">العدد (فرد)</th>
                          <th className="p-2.5">ساعات العمل</th>
                          <th className="p-2.5">ساعات إضافي</th>
                          <th className="p-2.5 w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {workforceList.map((w, idx) => (
                          <tr key={idx}>
                            <td className="p-2">
                              <input
                                type="text"
                                value={w.trade}
                                onChange={(e) => {
                                  const updated = [...workforceList];
                                  updated[idx].trade = e.target.value;
                                  setWorkforceList(updated);
                                }}
                                className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                min="1"
                                value={w.count}
                                onChange={(e) => {
                                  const updated = [...workforceList];
                                  updated[idx].count = parseInt(e.target.value) || 0;
                                  setWorkforceList(updated);
                                }}
                                className="w-20 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg font-bold"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                value={w.hours}
                                onChange={(e) => {
                                  const updated = [...workforceList];
                                  updated[idx].hours = parseFloat(e.target.value) || 0;
                                  setWorkforceList(updated);
                                }}
                                className="w-20 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                value={w.overtime}
                                onChange={(e) => {
                                  const updated = [...workforceList];
                                  updated[idx].overtime = parseFloat(e.target.value) || 0;
                                  setWorkforceList(updated);
                                }}
                                className="w-20 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg"
                              />
                            </td>
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => setWorkforceList(workforceList.filter((_, i) => i !== idx))}
                                className="text-rose-500 hover:bg-rose-50 p-1 rounded"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 3. Heavy Equipment */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                      <Truck size={16} className="text-amber-600" />
                      <span>المعدات والآليات بالموقع (Heavy Fleet & Equipment)</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => setEquipmentList([...equipmentList, { name: '', count: 1, hours: 8, status: 'عاملة' }])}
                      className="px-3 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-xl text-xs font-bold flex items-center gap-1"
                    >
                      <Plus size={14} />
                      <span>إضافة معدة</span>
                    </button>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-100 text-slate-600 font-bold">
                        <tr>
                          <th className="p-2.5">اسم المعدة / الموديل</th>
                          <th className="p-2.5">العدد</th>
                          <th className="p-2.5">ساعات التشغيل</th>
                          <th className="p-2.5">حالة المعدة</th>
                          <th className="p-2.5 w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {equipmentList.map((eq, idx) => (
                          <tr key={idx}>
                            <td className="p-2">
                              <input
                                type="text"
                                placeholder="مثال: حفار، لودر، ونش برجي"
                                value={eq.name}
                                onChange={(e) => {
                                  const updated = [...equipmentList];
                                  updated[idx].name = e.target.value;
                                  setEquipmentList(updated);
                                }}
                                className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg font-medium"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                min="1"
                                value={eq.count}
                                onChange={(e) => {
                                  const updated = [...equipmentList];
                                  updated[idx].count = parseInt(e.target.value) || 0;
                                  setEquipmentList(updated);
                                }}
                                className="w-20 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg font-bold"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                value={eq.hours}
                                onChange={(e) => {
                                  const updated = [...equipmentList];
                                  updated[idx].hours = parseFloat(e.target.value) || 0;
                                  setEquipmentList(updated);
                                }}
                                className="w-20 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg"
                              />
                            </td>
                            <td className="p-2">
                              <select
                                value={eq.status}
                                onChange={(e) => {
                                  const updated = [...equipmentList];
                                  updated[idx].status = e.target.value as any;
                                  setEquipmentList(updated);
                                }}
                                className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                              >
                                <option value="عاملة">🟢 عاملة</option>
                                <option value="معطلة">🔴 معطلة</option>
                                <option value="تحت الصيانة">🟡 صيانة دورية</option>
                              </select>
                            </td>
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => setEquipmentList(equipmentList.filter((_, i) => i !== idx))}
                                className="text-rose-500 hover:bg-rose-50 p-1 rounded"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 4. Executed Work Items */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                      <Wrench size={16} className="text-blue-600" />
                      <span>الأعمال وبنود المقايسة المنفذة اليوم (Works Executed)</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => setWorkExecutedList([...workExecutedList, { boq_item: '', location: '', qty: 0, unit: 'م3' }])}
                      className="px-3 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-bold flex items-center gap-1"
                    >
                      <Plus size={14} />
                      <span>إضافة بند منجز</span>
                    </button>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-100 text-slate-600 font-bold">
                        <tr>
                          <th className="p-2.5">بند المقايسة / العمل المنفذ</th>
                          <th className="p-2.5">الموقع / المحور بالمشروع</th>
                          <th className="p-2.5">الكمية</th>
                          <th className="p-2.5">الوحدة</th>
                          <th className="p-2.5 w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {workExecutedList.map((item, idx) => (
                          <tr key={idx}>
                            <td className="p-2">
                              <input
                                type="text"
                                placeholder="مثال: أعمال الحفر، صب خرسانة، بناء طوب"
                                value={item.boq_item}
                                onChange={(e) => {
                                  const updated = [...workExecutedList];
                                  updated[idx].boq_item = e.target.value;
                                  setWorkExecutedList(updated);
                                }}
                                className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                placeholder="المبنى / القطاع"
                                value={item.location}
                                onChange={(e) => {
                                  const updated = [...workExecutedList];
                                  updated[idx].location = e.target.value;
                                  setWorkExecutedList(updated);
                                }}
                                className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                value={item.qty}
                                onChange={(e) => {
                                  const updated = [...workExecutedList];
                                  updated[idx].qty = parseFloat(e.target.value) || 0;
                                  setWorkExecutedList(updated);
                                }}
                                className="w-20 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg font-bold"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={item.unit}
                                onChange={(e) => {
                                  const updated = [...workExecutedList];
                                  updated[idx].unit = e.target.value;
                                  setWorkExecutedList(updated);
                                }}
                                className="w-16 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg"
                              />
                            </td>
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => setWorkExecutedList(workExecutedList.filter((_, i) => i !== idx))}
                                className="text-rose-500 hover:bg-rose-50 p-1 rounded"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 5. HSE & Delays Notes */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                      <AlertTriangle size={14} className="text-amber-500" />
                      <span>معوقات العمل وأسباب التأخير (إن وجدت)</span>
                    </label>
                    <textarea
                      rows={3}
                      value={formDelays}
                      onChange={(e) => setFormDelays(e.target.value)}
                      placeholder="مثال: تأخر وصول خلاطات الخرسانة الجاهزة ساعتين بسبب المرور..."
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                      <ShieldAlert size={14} className="text-rose-500" />
                      <span>ملاحظات السلامة والصحة المهنية (HSE Incidents)</span>
                    </label>
                    <textarea
                      rows={3}
                      value={formSafety}
                      onChange={(e) => setFormSafety(e.target.value)}
                      placeholder="مثال: تم فحص مهمات الوقاية، التزام تام بارتداء الخوذات والأحزمة..."
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

              </div>

              <div className="sticky bottom-0 bg-white p-5 border-t border-slate-100 flex items-center justify-end gap-3 z-10">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-600/30"
                >
                  حفظ واعتماد اليومية الميدانية
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🖨️ Printable Daily Site Log Report Modal */}
      {isPrintModalOpen && activeLogForView && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 md:p-8" dir="rtl">
            <div className="flex justify-between items-center border-b pb-4 mb-6">
              <div>
                <h2 className="text-xl font-black text-slate-800">تقرير يومية الموقع الميداني المعتمد</h2>
                <p className="text-xs text-slate-500">Daily Site Progress & Manpower Log</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
                >
                  <Printer size={14} />
                  <span>طباعة فورية</span>
                </button>
                <button
                  onClick={() => setIsPrintModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-full"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Content to Print */}
            <div className="space-y-6 text-sm">
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <span className="text-xs text-slate-400 block font-bold">اسم المشروع:</span>
                  <span className="font-bold text-slate-800">{activeLogForView.project_name}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block font-bold">التاريخ:</span>
                  <span className="font-bold text-slate-800">{activeLogForView.log_date}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block font-bold">حالة الطقس ودرجة الحرارة:</span>
                  <span className="font-bold text-slate-800">{activeLogForView.weather_condition} ({activeLogForView.temperature})</span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block font-bold">مهندس الموقع المسؤول:</span>
                  <span className="font-bold text-slate-800">{activeLogForView.site_engineer_name}</span>
                </div>
              </div>

              {/* Workforce */}
              <div>
                <h4 className="font-bold text-slate-800 mb-2 border-b pb-1">1. حصر العمالة الميدانية (Manpower):</h4>
                <table className="w-full text-xs text-right border border-slate-200">
                  <thead className="bg-slate-100 font-bold text-slate-700">
                    <tr>
                      <th className="p-2 border">المهنة</th>
                      <th className="p-2 border">العدد</th>
                      <th className="p-2 border">الساعات الأساسية</th>
                      <th className="p-2 border">الإضافي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeLogForView.workforce.map((w, idx) => (
                      <tr key={idx}>
                        <td className="p-2 border font-medium">{w.trade}</td>
                        <td className="p-2 border font-bold text-emerald-600">{w.count}</td>
                        <td className="p-2 border">{w.hours} ساعة</td>
                        <td className="p-2 border">{w.overtime} ساعة</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Equipment */}
              <div>
                <h4 className="font-bold text-slate-800 mb-2 border-b pb-1">2. المعدات والآليات (Equipment):</h4>
                <table className="w-full text-xs text-right border border-slate-200">
                  <thead className="bg-slate-100 font-bold text-slate-700">
                    <tr>
                      <th className="p-2 border">المعدة</th>
                      <th className="p-2 border">العدد</th>
                      <th className="p-2 border">ساعات التشغيل</th>
                      <th className="p-2 border">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeLogForView.equipment.map((eq, idx) => (
                      <tr key={idx}>
                        <td className="p-2 border font-medium">{eq.name}</td>
                        <td className="p-2 border font-bold">{eq.count}</td>
                        <td className="p-2 border">{eq.hours} ساعة</td>
                        <td className="p-2 border">{eq.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Executed Work */}
              <div>
                <h4 className="font-bold text-slate-800 mb-2 border-b pb-1">3. الأعمال المنجزة (Work Progress):</h4>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  {activeLogForView.work_executed.map((wk, idx) => (
                    <li key={idx} className="text-slate-700">
                      <span className="font-bold">{wk.boq_item}</span> - المكان: <span className="text-indigo-600">{wk.location}</span> - الكمية المنجزة: <span className="font-bold text-emerald-600">{wk.qty} {wk.unit}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Notes */}
              {(activeLogForView.work_delays_and_issues || activeLogForView.safety_incidents) && (
                <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 text-xs space-y-2">
                  {activeLogForView.work_delays_and_issues && (
                    <p><span className="font-bold text-amber-900">معوقات العمل والتأخير:</span> {activeLogForView.work_delays_and_issues}</p>
                  )}
                  {activeLogForView.safety_incidents && (
                    <p><span className="font-bold text-rose-900">ملاحظات السلامة المهنية:</span> {activeLogForView.safety_incidents}</p>
                  )}
                </div>
              )}

              {/* Signatures */}
              <div className="grid grid-cols-2 gap-8 pt-8 border-t border-slate-200 text-center text-xs">
                <div>
                  <p className="font-bold text-slate-700 mb-8">مهندس الموقع الميداني</p>
                  <p className="border-t border-slate-300 pt-1 font-medium text-slate-500">التوقيع والاعتماد</p>
                </div>
                <div>
                  <p className="font-bold text-slate-700 mb-8">مدير المشروع / الاستشاري</p>
                  <p className="border-t border-slate-300 pt-1 font-medium text-slate-500">التوقيع والاعتماد</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
