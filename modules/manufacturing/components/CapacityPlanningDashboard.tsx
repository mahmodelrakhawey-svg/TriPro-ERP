import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import * as XLSX from 'xlsx';
import {
  Layers, AlertTriangle, CheckCircle2, TrendingUp, BarChart2,
  Plus, Search, Filter, FileSpreadsheet, Printer, Clock,
  Flame, ShieldAlert, Cpu, Award, X, Edit3, Trash2
} from 'lucide-react';

interface WorkCenterCapacity {
  id: string;
  work_center_name: string;
  daily_capacity_hours: number;
  efficiency_factor: number;
  current_planned_hours: number;
  is_bottleneck: boolean;
  notes?: string;
  created_at: string;
}

export default function CapacityPlanningDashboard() {
  const { organization, currentSelectedOrgId, currentUser } = useAccounting();
  const { showToast } = useToast();

  const [capacities, setCapacities] = useState<WorkCenterCapacity[]>([]);
  const [realWorkCenters, setRealWorkCenters] = useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formDailyCapacity, setFormDailyCapacity] = useState<number>(16); // 2 shifts = 16 hours
  const [formEfficiency, setFormEfficiency] = useState<number>(90); // 90%
  const [formPlannedHours, setFormPlannedHours] = useState<number>(0);
  const [formNotes, setFormNotes] = useState('');

  const orgId = organization?.id || currentSelectedOrgId || currentUser?.organization_id;

  // Fetch Capacities & Real Factory Centers
  const fetchCapacities = async () => {
    if (!orgId) return;
    setIsLoading(true);
    try {
      // 1. Fetch Real Factory Work Centers
      const { data: realCenters } = await supabase
        .from('mfg_work_centers')
        .select('id, name')
        .eq('organization_id', orgId)
        .order('name');

      setRealWorkCenters(realCenters || []);

      // 2. Fetch Capacities
      const { data: capData, error } = await supabase
        .from('mfg_work_center_capacities')
        .select('*')
        .eq('organization_id', orgId)
        .order('work_center_name');

      // Auto-sync any existing factory work center that doesn't have a capacity record yet
      if (realCenters && realCenters.length > 0) {
        const existingNames = new Set((capData || []).map(c => c.work_center_name));
        const missing = realCenters.filter(r => !existingNames.has(r.name));
        if (missing.length > 0) {
          const toInsert = missing.map(m => ({
            organization_id: orgId,
            work_center_name: m.name,
            daily_capacity_hours: 16,
            efficiency_factor: 90,
            current_planned_hours: 0,
            is_bottleneck: false
          }));
          await supabase.from('mfg_work_center_capacities').insert(toInsert);
          const { data: synced } = await supabase
            .from('mfg_work_center_capacities')
            .select('*')
            .eq('organization_id', orgId)
            .order('work_center_name');
          setCapacities(synced || []);
          return;
        }
      }

      setCapacities(capData || []);
    } catch (err: any) {
      console.error(err);
      setCapacities([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Sync / Reset to Real Factory Centers
  const handleSeedDefaults = async () => {
    if (!orgId) return;
    try {
      if (realWorkCenters.length === 0) {
        showToast('لم يتم العثور على مراكز عمل مسجلة في المصنع. يمكنك إضافتها أولاً', 'warning');
        return;
      }
      await supabase.from('mfg_work_center_capacities').delete().eq('organization_id', orgId);
      
      const toInsert = realWorkCenters.map(p => ({
        organization_id: orgId,
        work_center_name: p.name,
        daily_capacity_hours: 16,
        efficiency_factor: 90,
        current_planned_hours: 0,
        is_bottleneck: false
      }));
      const { error } = await supabase.from('mfg_work_center_capacities').insert(toInsert);
      if (error) throw error;

      showToast('تمت مزامنة مراكز العمل الفعلية للمصنع بنجاح 🏭', 'success');
      fetchCapacities();
    } catch (err: any) {
      showToast('فشل المزامنة: ' + err.message, 'error');
    }
  };

  // Delete all records
  const handleClearAll = async () => {
    if (!window.confirm('هل أنت متأكد من مسح جميع مراكز العمل والبدء من الصفر؟')) return;
    try {
      await supabase.from('mfg_work_center_capacities').delete().eq('organization_id', orgId);
      showToast('تم مسح السجلات بنجاح', 'info');
      fetchCapacities();
    } catch (err: any) {
      showToast('فشل المسح: ' + err.message, 'error');
    }
  };

  useEffect(() => {
    fetchCapacities();
  }, [orgId]);

  // Open Modal
  const handleOpenAddModal = () => {
    setEditingId(null);
    setFormName(realWorkCenters[0]?.name || '');
    setFormDailyCapacity(16);
    setFormEfficiency(90);
    setFormPlannedHours(0);
    setFormNotes('');
    setIsModalOpen(true);
  };

  // Save Capacity
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName) {
      showToast('يرجى كتابة اسم مركز العمل', 'warning');
      return;
    }

    try {
      const effectiveCap = formDailyCapacity * (formEfficiency / 100);
      const isBottleneck = effectiveCap > 0 && formPlannedHours > effectiveCap;

      const payload = {
        organization_id: orgId,
        work_center_name: formName,
        daily_capacity_hours: formDailyCapacity,
        efficiency_factor: formEfficiency,
        current_planned_hours: formPlannedHours,
        is_bottleneck: isBottleneck,
        notes: formNotes || null
      };

      if (editingId) {
        const { error } = await supabase.from('mfg_work_center_capacities').update(payload).eq('id', editingId);
        if (error) throw error;
        showToast('تم تحديث سعة مركز العمل بنجاح ✅', 'success');
      } else {
        const { error } = await supabase.from('mfg_work_center_capacities').insert(payload);
        if (error) throw error;
        showToast('تم تسجيل سعة مركز العمل بنجاح 🏭', 'success');
      }

      setIsModalOpen(false);
      fetchCapacities();
    } catch (err: any) {
      showToast('فشل الحفظ: ' + err.message, 'error');
    }
  };

  // Delete
  const handleDelete = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا السجل؟')) return;
    try {
      const { error } = await supabase.from('mfg_work_center_capacities').delete().eq('id', id);
      if (error) throw error;
      showToast('تم حذف السجل', 'success');
      fetchCapacities();
    } catch (err: any) {
      showToast('فشل الحذف: ' + err.message, 'error');
    }
  };

  // Calculated Analysis List
  const analyzedCapacities = useMemo(() => {
    return capacities.filter(c => c.work_center_name.toLowerCase().includes(searchTerm.toLowerCase())).map(c => {
      const effectiveCap = c.daily_capacity_hours * (c.efficiency_factor / 100);
      const utilizationPct = effectiveCap > 0 ? (c.current_planned_hours / effectiveCap) * 100 : 0;
      const overloadHours = Math.max(0, c.current_planned_hours - effectiveCap);

      let status: 'BOTTLENECK' | 'HIGH' | 'BALANCED' | 'UNDER' = 'BALANCED';
      if (utilizationPct > 100) {
        status = 'BOTTLENECK';
      } else if (utilizationPct >= 80) {
        status = 'HIGH';
      } else if (utilizationPct >= 40) {
        status = 'BALANCED';
      } else {
        status = 'UNDER';
      }

      return {
        ...c,
        effectiveCap: Math.round(effectiveCap * 10) / 10,
        utilizationPct: Math.round(utilizationPct * 10) / 10,
        overloadHours: Math.round(overloadHours * 10) / 10,
        status
      };
    });
  }, [capacities, searchTerm]);

  // Overall KPIs
  const kpis = useMemo(() => {
    let bottleneckCount = 0;
    let totalPlanned = 0;
    let totalEffective = 0;

    analyzedCapacities.forEach(c => {
      if (c.status === 'BOTTLENECK') bottleneckCount++;
      totalPlanned += c.current_planned_hours;
      totalEffective += c.effectiveCap;
    });

    const plantUtilization = totalEffective > 0 ? Math.round((totalPlanned / totalEffective) * 100) : 0;

    return {
      totalWorkCenters: analyzedCapacities.length,
      bottleneckCount,
      plantUtilization,
      totalPlannedHours: Math.round(totalPlanned * 10) / 10,
      totalEffectiveHours: Math.round(totalEffective * 10) / 10
    };
  }, [analyzedCapacities]);

  // Export Excel
  const exportToExcel = () => {
    if (analyzedCapacities.length === 0) {
      showToast('لا توجد بيانات للتصدير', 'warning');
      return;
    }
    const rows = analyzedCapacities.map((c, idx) => ({
      '#': idx + 1,
      'مركز العمل': c.work_center_name,
      'السعة اليومية المتاحة (ساعة)': c.daily_capacity_hours,
      'معامل الكفاءة %': `${c.efficiency_factor}%`,
      'السعة الفعلية (ساعة)': c.effectiveCap,
      'الساعات المطلوبة للأوامر': c.current_planned_hours,
      'نسبة الإشغال %': `${c.utilizationPct}%`,
      'ساعات التحميل الزائد': c.overloadHours,
      'التقييم': c.status === 'BOTTLENECK' ? 'عنق زجاجة / تحميل زائد' : c.status === 'HIGH' ? 'إشغال مرتفع' : 'حمل متوازن'
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'تخطيط السعة');
    XLSX.writeFile(wb, `Capacity_Planning_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('تم تصدير تقرير السعة إلى Excel ✅', 'success');
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in" dir="rtl">
      
      {/* 🏭 Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="inline-flex items-center gap-2 bg-indigo-500/20 text-indigo-200 px-3 py-1 rounded-full text-xs font-bold mb-3 border border-indigo-400/30">
              <Cpu size={14} className="text-amber-400" />
              <span>موازنة الأحمال والخطوط (Capacity & Bottleneck Balancing)</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">
              تخطيط السعة الإنتاجية وعنق الزجاجة (Capacity Planning)
            </h1>
            <p className="text-indigo-200 text-sm mt-1 max-w-2xl">
              مقارنة السعة التشغيلية المتاحة لمحطات العمل بحجم أوامر الإنتاج المفتوحة لكشف الاختناقات وتجنب تأخير التسليم.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleClearAll}
              title="مسح السجلات الحالية والبدء من الصفر"
              className="flex items-center gap-1.5 px-3 py-2.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 rounded-2xl text-xs font-bold transition-all border border-rose-400/30"
            >
              <Trash2 size={14} />
              <span>مسح الكل</span>
            </button>

            <button
              onClick={handleSeedDefaults}
              title="إعادة تعيين النماذج القياسية لمراكز العمل (5 محطات رئيسية)"
              className="flex items-center gap-1.5 px-3 py-2.5 bg-indigo-500/30 hover:bg-indigo-500/40 text-indigo-200 rounded-2xl text-xs font-bold transition-all border border-indigo-400/30"
            >
              <Cpu size={14} />
              <span>إعادة تعيين النماذج القياسية</span>
            </button>

            <button
              onClick={exportToExcel}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-2xl font-bold transition-all border border-white/20 shadow-sm text-sm"
            >
              <FileSpreadsheet size={16} />
              <span>تصدير Excel</span>
            </button>

            <button
              onClick={handleOpenAddModal}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 text-white rounded-2xl font-bold transition-all shadow-lg shadow-indigo-500/30 text-sm"
            >
              <Plus size={18} />
              <span>إضافة مركز عمل للسعة</span>
            </button>
          </div>
        </div>
      </div>

      {/* 📊 KPI Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold mb-1">مراكز العمل تحت الرصد</p>
            <h3 className="text-2xl font-black text-slate-800">{kpis.totalWorkCenters} <span className="text-xs text-slate-400 font-normal">محطة</span></h3>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Layers size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold mb-1">مراكز تشكل "عنق زجاجة" (Bottlenecks)</p>
            <h3 className="text-2xl font-black text-rose-600">{kpis.bottleneckCount} <span className="text-xs text-slate-400 font-normal">محطات حرجة</span></h3>
          </div>
          <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
            <AlertTriangle size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold mb-1">متوسط نسبة إشغال المصنع العامة</p>
            <h3 className="text-2xl font-black text-indigo-700">{kpis.plantUtilization}%</h3>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <BarChart2 size={24} />
          </div>
        </div>
      </div>

      {/* 🔍 Filter */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div className="relative flex-1 md:w-80">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="بحث باسم مركز العمل أو محطة التشغيل..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
          />
        </div>
        <span className="text-xs font-bold text-slate-500">
          الساعات المخططة: <span className="text-indigo-600 font-bold">{kpis.totalPlannedHours} س</span> / السعة: <span className="text-slate-700 font-bold">{kpis.totalEffectiveHours} س</span>
        </span>
      </div>

      {/* 📋 Capacity Grid */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 font-bold animate-pulse">جاري تحميل بيانات السعة...</div>
        ) : analyzedCapacities.length === 0 ? (
          <div className="p-12 text-center">
            <Cpu size={48} className="mx-auto text-slate-300 mb-3" />
            <h3 className="text-slate-700 font-bold text-lg mb-1">لا توجد بيانات مراكز عمل</h3>
            <p className="text-slate-400 text-sm">اضغط على "إضافة مركز عمل للسعة" لإعداد وموازنة طاقة خطوط الإنتاج.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3.5">مركز العمل / المحطة</th>
                  <th className="p-3.5">السعة المتاحة (يومياً)</th>
                  <th className="p-3.5">معامل الكفاءة</th>
                  <th className="p-3.5">السعة الفعلية</th>
                  <th className="p-3.5">الساعات المحجوزة للأوامر</th>
                  <th className="p-3.5">نسبة الإشغال (Utilization)</th>
                  <th className="p-3.5">حالة التحميل</th>
                  <th className="p-3.5 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {analyzedCapacities.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5 font-bold text-slate-900">{c.work_center_name}</td>
                    <td className="p-3.5 font-bold text-slate-700">{c.daily_capacity_hours} ساعة</td>
                    <td className="p-3.5 font-mono text-slate-600">{c.efficiency_factor}%</td>
                    <td className="p-3.5 font-bold text-indigo-700">{c.effectiveCap} ساعة</td>
                    <td className="p-3.5 font-bold text-slate-900">{c.current_planned_hours} ساعة</td>
                    <td className="p-3.5">
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-bold">
                          <span className={c.utilizationPct > 100 ? 'text-rose-600 font-black' : 'text-slate-700'}>
                            {c.utilizationPct}%
                          </span>
                        </div>
                        <div className="w-32 bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              c.utilizationPct > 100 ? 'bg-rose-500' :
                              c.utilizationPct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.min(100, c.utilizationPct)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="p-3.5">
                      {c.status === 'BOTTLENECK' ? (
                        <span className="bg-rose-100 text-rose-800 px-2.5 py-1 rounded-full text-xs font-black flex items-center gap-1">
                          <AlertTriangle size={12} />
                          عنق زجاجة (+{c.overloadHours} س عجز)
                        </span>
                      ) : c.status === 'HIGH' ? (
                        <span className="bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full text-xs font-bold">
                          إشغال مرتفع
                        </span>
                      ) : (
                        <span className="bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                          <CheckCircle2 size={12} />
                          حمل متوازن
                        </span>
                      )}
                    </td>
                    <td className="p-3.5">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => {
                            setEditingId(c.id);
                            setFormName(c.work_center_name);
                            setFormDailyCapacity(c.daily_capacity_hours);
                            setFormEfficiency(c.efficiency_factor);
                            setFormPlannedHours(c.current_planned_hours);
                            setFormNotes(c.notes || '');
                            setIsModalOpen(true);
                          }}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(c.id)}
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

      {/* 📝 Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl p-6 md:p-8 animate-in zoom-in-95">
            <form onSubmit={handleSave} className="space-y-4">
              <div className="flex justify-between items-center border-b pb-3">
                <div className="flex items-center gap-2 text-indigo-900 font-black text-lg">
                  <Cpu className="text-indigo-600" size={24} />
                  <span>ضبط وتخطيط سعة مركز العمل</span>
                </div>
                <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400">
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">اسم مركز العمل / المحطة *</label>
                  {realWorkCenters.length > 0 && (
                    <select
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold mb-2 outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">-- اختر من مراكز العمل المعرفة بالمصنع --</option>
                      {realWorkCenters.map(rc => (
                        <option key={rc.id} value={rc.name}>{rc.name}</option>
                      ))}
                    </select>
                  )}
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="أو اكتب اسم مركز عمل جديد"
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">السعة اليومية المتاحة (ساعات تشغيل) *</label>
                  <input
                    type="number"
                    step="0.5"
                    value={formDailyCapacity}
                    onChange={(e) => setFormDailyCapacity(parseFloat(e.target.value) || 0)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">معامل الكفاءة التشغيلية (%) *</label>
                  <input
                    type="number"
                    step="1"
                    min="10"
                    max="100"
                    value={formEfficiency}
                    onChange={(e) => setFormEfficiency(parseFloat(e.target.value) || 0)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">الساعات المحجوزة لأوامر الإنتاج المفتوحة (ساعة) *</label>
                  <input
                    type="number"
                    step="0.5"
                    value={formPlannedHours}
                    onChange={(e) => setFormPlannedHours(parseFloat(e.target.value) || 0)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>
              </div>

              <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-200 flex justify-between items-center text-xs">
                <div>
                  <span className="font-bold text-indigo-900 block">السعة الفعلية المحسوبة:</span>
                  <span className="text-indigo-700">{(formDailyCapacity * (formEfficiency / 100)).toFixed(1)} ساعة / يوم</span>
                </div>
                <div className="text-left">
                  <span className="font-bold text-indigo-900 block">نسبة الإشغال المتوقعة:</span>
                  <span className={`text-base font-black ${
                    (formPlannedHours / (formDailyCapacity * (formEfficiency / 100))) > 1.0 ? 'text-rose-600' : 'text-emerald-700'
                  }`}>
                    {((formPlannedHours / (formDailyCapacity * (formEfficiency / 100))) * 100).toFixed(1)}%
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات وحلول موازنة الحمل</label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="مثال: تشغيل وردية إضافية أو إسناد جزء من أعمال التشكيل لمصنع خارجي..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                />
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
                  حفظ السعة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
