import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import * as XLSX from 'xlsx';
import {
  TrendingUp, DollarSign, Calculator, CheckCircle2, Clock,
  Plus, Search, Filter, FileSpreadsheet, Printer, Layers,
  Building2, ArrowRight, Eye, Edit3, Trash2, FileText,
  FileCheck2, ShieldCheck, AlertCircle, Percent, X
} from 'lucide-react';

interface EscalationClaim {
  id: string;
  project_id: string;
  project_name?: string;
  claim_number: string;
  billing_period: string;
  material_category: string;
  contract_base_price: number;
  current_market_price: number;
  weight_factor: number;
  executed_work_value: number;
  calculated_escalation_amount: number;
  status: 'PENDING_APPROVAL' | 'APPROVED_BY_CLIENT' | 'REJECTED';
  consultant_notes?: string;
  created_at: string;
}

export default function PriceEscalationCalculator() {
  const { organization, currentSelectedOrgId, currentUser } = useAccounting();
  const { showToast } = useToast();

  const [projectsList, setProjectsList] = useState<{ id: string; name: string }[]>([]);
  const [claims, setClaims] = useState<EscalationClaim[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [activeClaimForPrint, setActiveClaimForPrint] = useState<EscalationClaim | null>(null);

  // Form State
  const [formProjectId, setFormProjectId] = useState('');
  const [formClaimNumber, setFormClaimNumber] = useState('');
  const [formBillingPeriod, setFormBillingPeriod] = useState('مستخلص جاري رقم 3 - يوليو 2026');
  const [formCategory, setFormCategory] = useState('حديد تسليح');
  const [formBasePrice, setFormBasePrice] = useState<number>(28000);
  const [formCurrentPrice, setFormCurrentPrice] = useState<number>(38500);
  const [formWeightFactor, setFormWeightFactor] = useState<number>(0.30); // 30% of contract value
  const [formExecutedValue, setFormExecutedValue] = useState<number>(500000);
  const [formStatus, setFormStatus] = useState<EscalationClaim['status']>('PENDING_APPROVAL');
  const [formNotes, setFormNotes] = useState('');

  const orgId = organization?.id || currentSelectedOrgId || currentUser?.organization_id;

  // Preset Materials & Benchmark Weights
  const materialPresets = [
    { category: 'حديد تسليح عالي المقاومة', base: 28000, current: 39000, weight: 0.30 },
    { category: 'أسمنت بورتلاندي', base: 1700, current: 2350, weight: 0.15 },
    { category: 'خرسانة جاهزة', base: 1100, current: 1550, weight: 0.25 },
    { category: 'سولار ومحروقات ونقل', base: 8.5, current: 13.5, weight: 0.10 },
    { category: 'عمالة وتضخم أجور', base: 100, current: 135, weight: 0.20 }
  ];

  // Dynamic Calculation of Escalation:
  // Delta P = Executed Value * Weight * ((Current - Base) / Base)
  const calculatedAmount = useMemo(() => {
    if (formBasePrice <= 0 || formExecutedValue <= 0) return 0;
    const priceChangeRatio = (formCurrentPrice - formBasePrice) / formBasePrice;
    return formExecutedValue * formWeightFactor * priceChangeRatio;
  }, [formBasePrice, formCurrentPrice, formWeightFactor, formExecutedValue]);

  // Fetch Data
  const fetchData = async () => {
    if (!orgId) return;
    setIsLoading(true);
    try {
      const { data: pData } = await supabase.from('projects').select('id, name').eq('organization_id', orgId);
      const currentProjects = pData || [];
      setProjectsList(currentProjects);

      let query = supabase
        .from('project_price_escalations')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

      if (selectedProjectId !== 'ALL') {
        query = query.eq('project_id', selectedProjectId);
      }

      const { data, error } = await query;
      if (error) {
        console.warn('project_price_escalations table notice:', error.message);
        setClaims([]);
      } else {
        setClaims((data || []).map((d: any) => ({
          ...d,
          project_name: currentProjects.find(p => p.id === d.project_id)?.name || 'مشروع عام'
        })));
      }
    } catch (err: any) {
      console.error(err);
      setClaims([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [orgId, selectedProjectId]);

  // Open Modal
  const handleOpenAddModal = () => {
    const nextNum = `ESC-${String(claims.length + 1).padStart(3, '0')}`;
    setFormProjectId(projectsList[0]?.id || '');
    setFormClaimNumber(nextNum);
    setFormBillingPeriod('مستخلص جاري رقم 3 - يوليو 2026');
    setFormCategory('حديد تسليح عالي المقاومة');
    setFormBasePrice(28000);
    setFormCurrentPrice(39000);
    setFormWeightFactor(0.30);
    setFormExecutedValue(500000);
    setFormStatus('PENDING_APPROVAL');
    setFormNotes('');
    setIsModalOpen(true);
  };

  // Select Preset
  const handleSelectPreset = (p: typeof materialPresets[0]) => {
    setFormCategory(p.category);
    setFormBasePrice(p.base);
    setFormCurrentPrice(p.current);
    setFormWeightFactor(p.weight);
  };

  // Save Claim
  const handleSaveClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formProjectId || !formClaimNumber) {
      showToast('يرجى تحديد المشروع ورقم المطالبة', 'warning');
      return;
    }

    try {
      const payload = {
        organization_id: orgId,
        project_id: formProjectId,
        claim_number: formClaimNumber,
        billing_period: formBillingPeriod,
        material_category: formCategory,
        contract_base_price: formBasePrice,
        current_market_price: formCurrentPrice,
        weight_factor: formWeightFactor,
        executed_work_value: formExecutedValue,
        calculated_escalation_amount: calculatedAmount,
        status: formStatus,
        consultant_notes: formNotes || null
      };

      const { error } = await supabase.from('project_price_escalations').insert(payload);
      if (error) throw error;

      showToast('تم تسجيل واحتساب مطالبة فروق الأسعار بنجاح 📈', 'success');
      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      showToast('فشل حفظ المطالبة: ' + err.message, 'error');
    }
  };

  // Update Status
  const handleUpdateStatus = async (id: string, newStatus: EscalationClaim['status']) => {
    try {
      const { error } = await supabase
        .from('project_price_escalations')
        .update({ status: newStatus })
        .eq('id', id);
      if (error) throw error;
      showToast('تم تحديث حالة المطالبة بنجاح ✅', 'success');
      fetchData();
    } catch (err: any) {
      showToast('فشل التحديث: ' + err.message, 'error');
    }
  };

  // Delete Claim
  const handleDelete = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه المطالبة؟')) return;
    try {
      const { error } = await supabase.from('project_price_escalations').delete().eq('id', id);
      if (error) throw error;
      showToast('تم حذف المطالبة', 'success');
      fetchData();
    } catch (err: any) {
      showToast('فشل الحذف: ' + err.message, 'error');
    }
  };

  // Filtered Claims
  const filteredClaims = useMemo(() => {
    return claims.filter(c => {
      const matchSearch = c.claim_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          c.material_category.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          c.project_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          c.billing_period.toLowerCase().includes(searchTerm.toLowerCase());
      return matchSearch;
    });
  }, [claims, searchTerm]);

  // Overall KPIs
  const kpis = useMemo(() => {
    let totalClaimsCount = filteredClaims.length;
    let totalApprovedCompensation = 0;
    let totalPendingCompensation = 0;

    filteredClaims.forEach(c => {
      if (c.status === 'APPROVED_BY_CLIENT') {
        totalApprovedCompensation += Number(c.calculated_escalation_amount || 0);
      } else if (c.status === 'PENDING_APPROVAL') {
        totalPendingCompensation += Number(c.calculated_escalation_amount || 0);
      }
    });

    return {
      totalClaimsCount,
      totalApprovedCompensation,
      totalPendingCompensation
    };
  }, [filteredClaims]);

  // Export Excel
  const exportToExcel = () => {
    if (filteredClaims.length === 0) {
      showToast('لا توجد بيانات للتصدير', 'warning');
      return;
    }

    const rows = filteredClaims.map((c, idx) => ({
      '#': idx + 1,
      'رقم المطالبة': c.claim_number,
      'المشروع': c.project_name,
      'الفترة / المستخلص': c.billing_period,
      'الخامة': c.material_category,
      'السعر الأساسي P0': c.contract_base_price,
      'السعر السائد Pt': c.current_market_price,
      'معامل الوزن': `${(c.weight_factor * 100).toFixed(0)}%`,
      'قيمة الأعمال المنفذة': c.executed_work_value,
      'قيمة تعويض فروق الأسعار': c.calculated_escalation_amount,
      'الحالة': c.status === 'APPROVED_BY_CLIENT' ? 'معتمد من المالك' : c.status === 'REJECTED' ? 'مرفوض' : 'قيد المراجعة'
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'مطالبات فروق الأسعار');
    XLSX.writeFile(wb, `Price_Escalation_Claims_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('تم تصدير سجل فروق الأسعار إلى Excel ✅', 'success');
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in" dir="rtl">
      
      {/* 📈 Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="inline-flex items-center gap-2 bg-indigo-500/20 text-indigo-200 px-3 py-1 rounded-full text-xs font-bold mb-3 border border-indigo-400/30">
              <Calculator size={14} className="text-amber-400" />
              <span>المعادلات السعرية وحماية التضخم (Price Escalation & Fluctuation Claims)</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">
              حاسبة ومطالبات فروق أسعار الخامات
            </h1>
            <p className="text-indigo-200 text-sm mt-1 max-w-2xl">
              تطبيق المعادلة القياسية لاحتساب تعويضات ارتفاع أسعار الحديد والأسمنت والوقود وإصدار مطالبات ملحقة بمستخلصات المالك.
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
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-2xl font-bold transition-all shadow-lg shadow-emerald-500/30"
            >
              <Plus size={18} />
              <span>إصدار مطالبة فروق أسعار</span>
            </button>
          </div>
        </div>
      </div>

      {/* 📊 KPI Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold mb-1">إجمالي المطالبات المسجلة</p>
            <h3 className="text-2xl font-black text-slate-800">{kpis.totalClaimsCount} <span className="text-xs text-slate-400 font-normal">مطالبة</span></h3>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <FileText size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold mb-1">التعويضات المعتمدة من المالك</p>
            <h3 className="text-2xl font-black text-emerald-600">
              {kpis.totalApprovedCompensation.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-xs text-slate-400 font-normal">ج.م/ر.س</span>
            </h3>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle2 size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold mb-1">مطالبات قيد المراجعة والاعتماد</p>
            <h3 className="text-2xl font-black text-amber-600">
              {kpis.totalPendingCompensation.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-xs text-slate-400 font-normal">ج.م/ر.س</span>
            </h3>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <Clock size={24} />
          </div>
        </div>
      </div>

      {/* 🔍 Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="بحث برقم المطالبة أو الخامة أو المستخلص..."
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

      {/* 📋 Claims Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 font-bold animate-pulse">جاري تحميل المطالبات...</div>
        ) : filteredClaims.length === 0 ? (
          <div className="p-12 text-center">
            <Calculator size={48} className="mx-auto text-slate-300 mb-3" />
            <h3 className="text-slate-700 font-bold text-lg mb-1">لا توجد مطالبات فروق أسعار مسجلة</h3>
            <p className="text-slate-400 text-sm">اضغط على "إصدار مطالبة فروق أسعار" لتطبيق المعادلة السعرية.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3.5">رقم المطالبة</th>
                  <th className="p-3.5">المشروع والفترة</th>
                  <th className="p-3.5">نوع الخامة</th>
                  <th className="p-3.5">سعر الأساس P0 ⬅️ السائد Pt</th>
                  <th className="p-3.5">معامل الوزن</th>
                  <th className="p-3.5">قيمة التعويض المستحق</th>
                  <th className="p-3.5">الحالة</th>
                  <th className="p-3.5 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredClaims.map(c => {
                  const pctIncrease = c.contract_base_price > 0 
                    ? ((c.current_market_price - c.contract_base_price) / c.contract_base_price) * 100 
                    : 0;

                  return (
                    <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5 font-mono font-bold text-indigo-700">{c.claim_number}</td>
                      <td className="p-3.5">
                        <span className="font-bold text-slate-800 block">{c.project_name}</span>
                        <span className="text-xs text-slate-400">{c.billing_period}</span>
                      </td>
                      <td className="p-3.5 font-bold text-slate-700">{c.material_category}</td>
                      <td className="p-3.5">
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="text-slate-500">{c.contract_base_price.toLocaleString()}</span>
                          <span>⬅️</span>
                          <span className="font-bold text-slate-900">{c.current_market_price.toLocaleString()}</span>
                          <span className="text-emerald-600 font-bold">(+{pctIncrease.toFixed(1)}%)</span>
                        </div>
                      </td>
                      <td className="p-3.5 font-mono text-xs font-bold text-slate-600">
                        {(c.weight_factor * 100).toFixed(0)}%
                      </td>
                      <td className="p-3.5 font-bold text-emerald-700 text-base">
                        +{Number(c.calculated_escalation_amount || 0).toLocaleString()} ج.م
                      </td>
                      <td className="p-3.5">
                        {c.status === 'APPROVED_BY_CLIENT' ? (
                          <span className="bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full text-xs font-black flex items-center gap-1">
                            <CheckCircle2 size={12} />
                            معتمد من المالك
                          </span>
                        ) : c.status === 'REJECTED' ? (
                          <span className="bg-rose-100 text-rose-800 px-2.5 py-1 rounded-full text-xs font-bold">
                            مرفوض
                          </span>
                        ) : (
                          <span className="bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                            <Clock size={12} />
                            قيد المراجعة
                          </span>
                        )}
                      </td>
                      <td className="p-3.5">
                        <div className="flex items-center justify-center gap-2">
                          {c.status === 'PENDING_APPROVAL' && (
                            <button
                              onClick={() => handleUpdateStatus(c.id, 'APPROVED_BY_CLIENT')}
                              title="اعتماد المطالبة"
                              className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg"
                            >
                              <CheckCircle2 size={16} />
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setActiveClaimForPrint(c);
                              setIsPrintModalOpen(true);
                            }}
                            title="طباعة نموذج المطالبة"
                            className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg"
                          >
                            <Printer size={16} />
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 📝 New Claim Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl p-6 md:p-8 animate-in zoom-in-95">
            <form onSubmit={handleSaveClaim} className="space-y-4">
              <div className="flex justify-between items-center border-b pb-3">
                <div className="flex items-center gap-2 text-indigo-900 font-black text-lg">
                  <Calculator className="text-emerald-500" size={24} />
                  <span>احتساب وإصدار مطالبة فروق أسعار خامات (Escalation Claim)</span>
                </div>
                <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400">
                  <X size={20} />
                </button>
              </div>

              {/* Quick Presets */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">اختيار خام قياسي سريع:</label>
                <div className="flex flex-wrap gap-1.5">
                  {materialPresets.map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectPreset(p)}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg text-xs font-bold text-slate-600 transition-colors"
                    >
                      {p.category}
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
                  <label className="block text-xs font-bold text-slate-700 mb-1">رقم المطالبة *</label>
                  <input
                    type="text"
                    value={formClaimNumber}
                    onChange={(e) => setFormClaimNumber(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الفترة / المستخلص المرتبط *</label>
                  <input
                    type="text"
                    value={formBillingPeriod}
                    onChange={(e) => setFormBillingPeriod(e.target.value)}
                    placeholder="مثال: مستخلص جاري رقم 4 - أغسطس 2026"
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">نوع الخامة / العنصر *</label>
                  <input
                    type="text"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">السعر الأساسي بالعقد (P0) *</label>
                  <input
                    type="number"
                    value={formBasePrice}
                    onChange={(e) => setFormBasePrice(parseFloat(e.target.value) || 0)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">السعر القياسي السائد وقت التنفيذ (Pt) *</label>
                  <input
                    type="number"
                    value={formCurrentPrice}
                    onChange={(e) => setFormCurrentPrice(parseFloat(e.target.value) || 0)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">معامل وزن الخامة بالمشروع (Weight Factor) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="1.0"
                    value={formWeightFactor}
                    onChange={(e) => setFormWeightFactor(parseFloat(e.target.value) || 0)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">قيمة الأعمال المنفذة خلال الفترة (ج.م/ر.س) *</label>
                  <input
                    type="number"
                    value={formExecutedValue}
                    onChange={(e) => setFormExecutedValue(parseFloat(e.target.value) || 0)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>
              </div>

              {/* 🧮 Live Calculation Card */}
              <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-200 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-emerald-900 block mb-0.5">قيمة التعويض المحسوب تلقائياً (ΔP):</span>
                  <p className="text-xs text-emerald-700">
                    المعادلة: قيمة الأعمال ({formExecutedValue.toLocaleString()}) × المعامل ({formWeightFactor}) × نسبة الزيادة ({formBasePrice > 0 ? (((formCurrentPrice - formBasePrice) / formBasePrice) * 100).toFixed(1) : 0}%)
                  </p>
                </div>
                <div className="text-left">
                  <span className="text-2xl font-black text-emerald-700">
                    +{calculatedAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                  <span className="text-xs text-emerald-900 block">ج.م / ر.س</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات ومراجع النشرات السعرية الرسمية</label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="مثال: استناداً لنشرة الأرقام القياسية لأسعار المنتجين الصادرة عن الجهاز المركزي..."
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
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-md shadow-emerald-600/30"
                >
                  حفظ وإصدار المطالبة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🖨️ Print Claim Modal */}
      {isPrintModalOpen && activeClaimForPrint && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl p-6 md:p-8" dir="rtl">
            <div className="flex justify-between items-center border-b pb-4 mb-4">
              <div>
                <h2 className="text-xl font-black text-slate-800">كشف مطالبة فروق أسعار الخامات</h2>
                <p className="text-xs text-slate-500 font-mono">Price Escalation & Fluctuation Compensation Sheet</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => window.print()} className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1">
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
                <div><span className="text-slate-400 font-bold">رقم المطالبة:</span> <span className="font-mono font-bold text-indigo-700">{activeClaimForPrint.claim_number}</span></div>
                <div><span className="text-slate-400 font-bold">المشروع:</span> <span className="font-bold">{activeClaimForPrint.project_name}</span></div>
                <div><span className="text-slate-400 font-bold">الفترة / المستخلص:</span> <span className="font-bold text-slate-800">{activeClaimForPrint.billing_period}</span></div>
                <div><span className="text-slate-400 font-bold">الخامة المعنية:</span> <span className="font-bold">{activeClaimForPrint.material_category}</span></div>
                <div><span className="text-slate-400 font-bold">سعر الأساس بالعقد (P0):</span> <span>{activeClaimForPrint.contract_base_price.toLocaleString()}</span></div>
                <div><span className="text-slate-400 font-bold">السعر السائد وقت التنفيذ (Pt):</span> <span className="font-bold text-emerald-700">{activeClaimForPrint.current_market_price.toLocaleString()}</span></div>
              </div>

              <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-xs text-emerald-900 font-bold block">إجمالي التعويض المستحق للمقاول:</span>
                    <span className="text-xs text-emerald-700">بناءً على المعادلة السعرية المعتمدة بالعقد</span>
                  </div>
                  <span className="text-2xl font-black text-emerald-700">
                    +{Number(activeClaimForPrint.calculated_escalation_amount || 0).toLocaleString()} ج.م
                  </span>
                </div>
              </div>

              {activeClaimForPrint.consultant_notes && (
                <div className="bg-slate-50 p-3 rounded-lg border text-xs text-slate-700">
                  <span className="font-bold block mb-1">الملاحظات والمراجع السعرية:</span>
                  {activeClaimForPrint.consultant_notes}
                </div>
              )}

              <div className="grid grid-cols-2 gap-8 pt-8 border-t border-slate-200 text-center text-xs">
                <div>
                  <p className="font-bold text-slate-700 mb-6">مهندس العقود والتكاليف (المقاول)</p>
                  <p className="border-t border-slate-300 pt-1 text-slate-400">التوقيع</p>
                </div>
                <div>
                  <p className="font-bold text-slate-700 mb-6">استشاري المشروع / ممثل المالك</p>
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
