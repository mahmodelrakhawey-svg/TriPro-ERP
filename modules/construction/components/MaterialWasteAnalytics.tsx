import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import * as XLSX from 'xlsx';
import {
  Scale, AlertTriangle, CheckCircle2, TrendingDown, TrendingUp,
  Plus, Search, Filter, FileSpreadsheet, Printer, Layers,
  DollarSign, PackageCheck, AlertCircle, Building2, BarChart2,
  PieChart, RefreshCw, X, Edit3, Trash2
} from 'lucide-react';

interface WasteRecord {
  id: string;
  project_id: string;
  project_name?: string;
  material_name: string;
  unit: string;
  theoretical_quantity: number;
  actual_issued_quantity: number;
  allowed_waste_percentage: number;
  unit_cost: number;
  analysis_date: string;
  notes?: string;
  created_at: string;
}

export default function MaterialWasteAnalytics() {
  const { organization, currentSelectedOrgId, currentUser } = useAccounting();
  const { showToast } = useToast();

  const [projectsList, setProjectsList] = useState<{ id: string; name: string }[]>([]);
  const [wasteRecords, setWasteRecords] = useState<WasteRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formProjectId, setFormProjectId] = useState('');
  const [formMaterialName, setFormMaterialName] = useState('حديد تسليح عالي المقاومة 16مم');
  const [formUnit, setFormUnit] = useState('طن');
  const [formTheoretical, setFormTheoretical] = useState<number>(100);
  const [formActual, setFormActual] = useState<number>(104);
  const [formAllowedWaste, setFormAllowedWaste] = useState<number>(3.0);
  const [formUnitCost, setFormUnitCost] = useState<number>(38000);
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formNotes, setFormNotes] = useState('');

  const orgId = organization?.id || currentSelectedOrgId || currentUser?.organization_id;

  // Preset Common Construction Materials
  const presetMaterials = [
    { name: 'حديد تسليح عالي المقاومة', unit: 'طن', allowed: 3.0, cost: 38000 },
    { name: 'خرسانة مسلحة جاهزة C30', unit: 'م3', allowed: 2.5, cost: 1450 },
    { name: 'أسمنت بورتلاندي معبأ', unit: 'طن', allowed: 3.5, cost: 2300 },
    { name: 'رمل نظيف للمباني والخرسانة', unit: 'م3', allowed: 5.0, cost: 120 },
    { name: 'سن ومحاجر سن 1 و 2', unit: 'م3', allowed: 4.5, cost: 280 },
    { name: 'طوب أسمنتي مصمت 25x12x6', unit: 'ألف طوبة', allowed: 4.0, cost: 1800 },
    { name: 'سيراميك أرضيات فرز أول', unit: 'م2', allowed: 6.0, cost: 190 },
    { name: 'دهانات بلاستيك داخلي', unit: 'بستلة', allowed: 4.0, cost: 850 }
  ];

  // Fetch Data
  const fetchData = async () => {
    if (!orgId) return;
    setIsLoading(true);
    try {
      const { data: pData } = await supabase.from('projects').select('id, name').eq('organization_id', orgId);
      const currentProjects = pData || [];
      setProjectsList(currentProjects);

      let query = supabase
        .from('project_material_waste_analysis')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

      if (selectedProjectId !== 'ALL') {
        query = query.eq('project_id', selectedProjectId);
      }

      const { data, error } = await query;
      if (error) {
        console.warn('project_material_waste_analysis table notice:', error.message);
        setWasteRecords([]);
      } else {
        setWasteRecords((data || []).map((d: any) => ({
          ...d,
          project_name: currentProjects.find(p => p.id === d.project_id)?.name || 'مشروع عام'
        })));
      }
    } catch (err: any) {
      console.error(err);
      setWasteRecords([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [orgId, selectedProjectId]);

  // Open Modal
  const handleOpenAddModal = () => {
    setEditingId(null);
    setFormProjectId(projectsList[0]?.id || '');
    setFormMaterialName('حديد تسليح عالي المقاومة');
    setFormUnit('طن');
    setFormTheoretical(50);
    setFormActual(52);
    setFormAllowedWaste(3.0);
    setFormUnitCost(38000);
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormNotes('');
    setIsModalOpen(true);
  };

  // Select Preset
  const handleSelectPreset = (p: typeof presetMaterials[0]) => {
    setFormMaterialName(p.name);
    setFormUnit(p.unit);
    setFormAllowedWaste(p.allowed);
    setFormUnitCost(p.cost);
  };

  // Save Record
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formProjectId || !formMaterialName) {
      showToast('يرجى تحديد المشروع والخامة', 'warning');
      return;
    }

    try {
      const payload = {
        organization_id: orgId,
        project_id: formProjectId,
        material_name: formMaterialName,
        unit: formUnit,
        theoretical_quantity: formTheoretical,
        actual_issued_quantity: formActual,
        allowed_waste_percentage: formAllowedWaste,
        unit_cost: formUnitCost,
        analysis_date: formDate,
        notes: formNotes || null
      };

      if (editingId) {
        const { error } = await supabase.from('project_material_waste_analysis').update(payload).eq('id', editingId);
        if (error) throw error;
        showToast('تم تحديث تحليل الخامة بنجاح ✅', 'success');
      } else {
        const { error } = await supabase.from('project_material_waste_analysis').insert(payload);
        if (error) throw error;
        showToast('تم تسجيل فحص وتحليل هدر الخامة بنجاح 🔬', 'success');
      }

      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      showToast('فشل الحفظ: ' + err.message, 'error');
    }
  };

  // Delete Record
  const handleDelete = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا السجل؟')) return;
    try {
      const { error } = await supabase.from('project_material_waste_analysis').delete().eq('id', id);
      if (error) throw error;
      showToast('تم حذف السجل', 'success');
      fetchData();
    } catch (err: any) {
      showToast('فشل الحذف: ' + err.message, 'error');
    }
  };

  // Calculations & Filtered Data
  const analyzedRecords = useMemo(() => {
    return wasteRecords.filter(r => {
      const matchSearch = r.material_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          r.project_name?.toLowerCase().includes(searchTerm.toLowerCase());
      return matchSearch;
    }).map(r => {
      const varianceQty = r.actual_issued_quantity - r.theoretical_quantity;
      const actualWastePct = r.theoretical_quantity > 0 ? (varianceQty / r.theoretical_quantity) * 100 : 0;
      const excessWastePct = Math.max(0, actualWastePct - r.allowed_waste_percentage);
      const excessQty = (excessWastePct / 100) * r.theoretical_quantity;
      const lossCost = excessQty * r.unit_cost;

      let status: 'NORMAL' | 'WARNING' | 'CRITICAL' = 'NORMAL';
      if (actualWastePct > r.allowed_waste_percentage + 2) {
        status = 'CRITICAL';
      } else if (actualWastePct > r.allowed_waste_percentage) {
        status = 'WARNING';
      }

      return {
        ...r,
        varianceQty,
        actualWastePct,
        excessWastePct,
        lossCost,
        status
      };
    });
  }, [wasteRecords, searchTerm]);

  // Overall KPIs
  const kpis = useMemo(() => {
    let totalMonitored = analyzedRecords.length;
    let totalFinancialLoss = 0;
    let criticalItemsCount = 0;

    analyzedRecords.forEach(r => {
      totalFinancialLoss += r.lossCost;
      if (r.status === 'CRITICAL') criticalItemsCount++;
    });

    return {
      totalMonitored,
      totalFinancialLoss,
      criticalItemsCount
    };
  }, [analyzedRecords]);

  // Export to Excel
  const exportToExcel = () => {
    if (analyzedRecords.length === 0) {
      showToast('لا توجد بيانات للتصدير', 'warning');
      return;
    }

    const rows = analyzedRecords.map((r, idx) => ({
      '#': idx + 1,
      'المشروع': r.project_name,
      'الخامة': r.material_name,
      'الوحدة': r.unit,
      'الكمية النظرية (المقايسة)': r.theoretical_quantity,
      'الكمية المنصرفة فعلياً': r.actual_issued_quantity,
      'فرق الكمية': r.varianceQty.toFixed(2),
      'نسبة الهدر الفعلي %': `${r.actualWastePct.toFixed(2)}%`,
      'نسبة الهدر المسموح %': `${r.allowed_waste_percentage}%`,
      'سعر الوحدة': r.unit_cost,
      'قيمة الخسارة الزائدة': r.lossCost.toLocaleString(),
      'تقييم الهدر': r.status === 'CRITICAL' ? 'هدر فادح / تسريب' : r.status === 'WARNING' ? 'تجاوز طفيف' : 'ضمن الحد المقبول'
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'تحليل هدر الخامات');
    XLSX.writeFile(wb, `Material_Waste_Analytics_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('تم تصدير تقرير الهدر المعياري إلى Excel ✅', 'success');
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in" dir="rtl">
      
      {/* 🔬 Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="inline-flex items-center gap-2 bg-indigo-500/20 text-indigo-200 px-3 py-1 rounded-full text-xs font-bold mb-3 border border-indigo-400/30">
              <Scale size={14} className="text-amber-400" />
              <span>الرقابة على الاستهلاك ومكافحة الهدر (Material Waste & Loss Control)</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">
              مراقبة الهدر المعياري للخامات والمواد
            </h1>
            <p className="text-indigo-200 text-sm mt-1 max-w-2xl">
              مقارنة الاستهلاك النظري المحسوب من المخططات والمقايسة بالكميات المنصرفة فعلياً من المخزن لكشف السرقات والهدر الزائد.
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
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white rounded-2xl font-bold transition-all shadow-lg shadow-amber-500/30"
            >
              <Plus size={18} />
              <span>تسجيل تحليل خامة جديد</span>
            </button>
          </div>
        </div>
      </div>

      {/* 📊 KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold mb-1">الخامات تحت المراقبة</p>
            <h3 className="text-2xl font-black text-slate-800">{kpis.totalMonitored} <span className="text-xs text-slate-400 font-normal">بند</span></h3>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Layers size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold mb-1">خامات تجاوزت الهدر المسموح</p>
            <h3 className="text-2xl font-black text-rose-600">{kpis.criticalItemsCount} <span className="text-xs text-slate-400 font-normal">خامات حرجة</span></h3>
          </div>
          <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
            <AlertTriangle size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold mb-1">إجمالي الخسائر المالية للهدر الزائد</p>
            <h3 className="text-2xl font-black text-rose-600">
              {kpis.totalFinancialLoss.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-xs text-slate-400 font-normal">ج.م/ر.س</span>
            </h3>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <DollarSign size={24} />
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
              placeholder="بحث بالخامة أو المشروع..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
            />
          </div>

          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700"
          >
            <option value="ALL">🏢 كل المشروعات</option>
            {projectsList.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 📋 Table of Waste Analysis */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 font-bold animate-pulse">جاري تحميل سجلات الهدر...</div>
        ) : analyzedRecords.length === 0 ? (
          <div className="p-12 text-center">
            <Scale size={48} className="mx-auto text-slate-300 mb-3" />
            <h3 className="text-slate-700 font-bold text-lg mb-1">لا توجد بيانات هدر مسجلة</h3>
            <p className="text-slate-400 text-sm">اضغط على "تسجيل تحليل خامة جديد" لإجراء مقارنة بين الاستهلاك المعياري والفعلي.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3.5">المشروع والخامة</th>
                  <th className="p-3.5">الكمية النظرية (المخطط)</th>
                  <th className="p-3.5">الكمية المنصرفة فعلياً</th>
                  <th className="p-3.5">فرق الكمية</th>
                  <th className="p-3.5">الهدر الفعلي مقابل المسموح</th>
                  <th className="p-3.5">الخسارة المالية للهدر</th>
                  <th className="p-3.5">تقييم الكفاءة</th>
                  <th className="p-3.5 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {analyzedRecords.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5">
                      <span className="font-bold text-slate-800 block">{item.material_name}</span>
                      <span className="text-xs text-indigo-600 font-medium">{item.project_name}</span>
                    </td>
                    <td className="p-3.5 font-bold text-slate-700">
                      {item.theoretical_quantity} <span className="text-xs text-slate-400 font-normal">{item.unit}</span>
                    </td>
                    <td className="p-3.5 font-bold text-slate-900">
                      {item.actual_issued_quantity} <span className="text-xs text-slate-400 font-normal">{item.unit}</span>
                    </td>
                    <td className="p-3.5 font-mono font-bold">
                      <span className={item.varianceQty > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                        {item.varianceQty > 0 ? `+${item.varianceQty.toFixed(2)}` : item.varianceQty.toFixed(2)} {item.unit}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs">
                          {item.actualWastePct.toFixed(1)}%
                        </span>
                        <span className="text-[11px] text-slate-400">
                          (المسموح: {item.allowed_waste_percentage}%)
                        </span>
                      </div>
                    </td>
                    <td className="p-3.5 font-bold text-rose-600">
                      {item.lossCost > 0 ? `${item.lossCost.toLocaleString()} ج.م` : '0 ج.م'}
                    </td>
                    <td className="p-3.5">
                      {item.status === 'CRITICAL' ? (
                        <span className="bg-rose-100 text-rose-800 px-2.5 py-1 rounded-full text-xs font-black flex items-center gap-1">
                          <AlertTriangle size={12} />
                          هدر فادح / تسريب
                        </span>
                      ) : item.status === 'WARNING' ? (
                        <span className="bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                          <AlertCircle size={12} />
                          تجاوز طفيف
                        </span>
                      ) : (
                        <span className="bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                          <CheckCircle2 size={12} />
                          استهلاك منضبط
                        </span>
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

      {/* 📝 New / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl p-6 md:p-8 animate-in zoom-in-95">
            <form onSubmit={handleSave} className="space-y-4">
              <div className="flex justify-between items-center border-b pb-3">
                <div className="flex items-center gap-2 text-indigo-900 font-black text-lg">
                  <Scale className="text-amber-500" size={24} />
                  <span>تسجيل فحص استهلاك وهدر خامة إنشائية</span>
                </div>
                <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400">
                  <X size={20} />
                </button>
              </div>

              {/* Quick Presets */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">اختيار سريع لنوع الخامة القياسية:</label>
                <div className="flex flex-wrap gap-1.5">
                  {presetMaterials.map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectPreset(p)}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg text-xs font-bold text-slate-600 transition-colors"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">المشروع *</label>
                  <select
                    value={formProjectId}
                    onChange={(e) => setFormProjectId(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  >
                    <option value="">-- اختر المشروع --</option>
                    {projectsList.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">اسم الخامة / البند *</label>
                  <input
                    type="text"
                    value={formMaterialName}
                    onChange={(e) => setFormMaterialName(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الوحدة</label>
                  <input
                    type="text"
                    value={formUnit}
                    onChange={(e) => setFormUnit(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">سعر الوحدة التقديري (ج.م/ر.س)</label>
                  <input
                    type="number"
                    value={formUnitCost}
                    onChange={(e) => setFormUnitCost(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الكمية النظرية المحسوبة من المقايسة والمخططات *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formTheoretical}
                    onChange={(e) => setFormTheoretical(parseFloat(e.target.value) || 0)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الكمية المنصرفة فعلياً من أذون الصرف بالموقع *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formActual}
                    onChange={(e) => setFormActual(parseFloat(e.target.value) || 0)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">نسبة الهدر المسموح بها هندسياً (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formAllowedWaste}
                    onChange={(e) => setFormAllowedWaste(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ التحليل والفحص</label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات التحليل وأسباب الهدر</label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="مثال: وجود هدر زائد في تكسير وتوصيل أسياخ الحديد للقطاعات القصيرة..."
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
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-sm shadow-md shadow-amber-500/30"
                >
                  حفظ التحليل
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
