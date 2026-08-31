import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import * as XLSX from 'xlsx';
import {
  ClipboardCheck, CheckCircle2, AlertCircle, XCircle, Clock,
  Plus, Search, Filter, FileSpreadsheet, Printer, ArrowRight,
  Eye, Edit3, Trash2, Building2, MapPin, Award, FileText,
  ShieldCheck, HardHat, Calendar, ChevronRight, X
} from 'lucide-react';

interface InspectionRequest {
  id: string;
  project_id: string;
  project_name?: string;
  wir_number: string;
  request_type: 'WORK' | 'MATERIAL';
  discipline: string;
  title: string;
  location_details: string;
  boq_item_reference?: string;
  contractor_engineer: string;
  requested_inspection_date: string;
  inspection_status: 'PENDING' | 'APPROVED_A' | 'APPROVED_WITH_COMMENTS_B' | 'REJECTED_C';
  consultant_engineer?: string;
  consultant_verdict_date?: string;
  consultant_notes?: string;
  cube_test_required: boolean;
  cube_test_results?: string;
  created_at: string;
}

export default function WorkInspectionManager() {
  const { organization, currentSelectedOrgId, currentUser } = useAccounting();
  const { showToast } = useToast();

  const [projectsList, setProjectsList] = useState<{ id: string; name: string }[]>([]);
  const [inspections, setInspections] = useState<InspectionRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  // Modals
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isVerdictModalOpen, setIsVerdictModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [activeInspection, setActiveInspection] = useState<InspectionRequest | null>(null);

  // Form State
  const [formProjectId, setFormProjectId] = useState('');
  const [formNumber, setFormNumber] = useState('');
  const [formType, setFormType] = useState<'WORK' | 'MATERIAL'>('WORK');
  const [formDiscipline, setFormDiscipline] = useState('مدني / إنشائي');
  const [formTitle, setFormTitle] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formBoqRef, setFormBoqRef] = useState('');
  const [formContractorEngineer, setFormContractorEngineer] = useState(currentUser?.full_name || 'م. التنفيذ المسؤول');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formCubeRequired, setFormCubeRequired] = useState(false);
  const [formCubeResults, setFormCubeResults] = useState('');

  // Verdict Form
  const [verdictStatus, setVerdictStatus] = useState<InspectionRequest['inspection_status']>('APPROVED_A');
  const [verdictEngineer, setVerdictEngineer] = useState('استشاري المشروع المعتمد');
  const [verdictNotes, setVerdictNotes] = useState('');
  const [verdictCubeResults, setVerdictCubeResults] = useState('');

  const orgId = organization?.id || currentSelectedOrgId || currentUser?.organization_id;

  // Fetch Data
  const fetchData = async () => {
    if (!orgId) return;
    setIsLoading(true);
    try {
      const { data: pData } = await supabase.from('projects').select('id, name').eq('organization_id', orgId);
      const currentProjects = pData || [];
      setProjectsList(currentProjects);

      let query = supabase
        .from('project_inspection_requests')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

      if (selectedProjectId !== 'ALL') {
        query = query.eq('project_id', selectedProjectId);
      }

      const { data, error } = await query;
      if (error) {
        console.warn('project_inspection_requests table notice:', error.message);
        setInspections([]);
      } else {
        setInspections((data || []).map((d: any) => ({
          ...d,
          project_name: currentProjects.find(p => p.id === d.project_id)?.name || 'مشروع غير محدد'
        })));
      }
    } catch (err: any) {
      console.error(err);
      setInspections([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [orgId, selectedProjectId]);

  // Open New Modal
  const handleOpenNew = () => {
    const nextNum = `WIR-${String(inspections.length + 1).padStart(3, '0')}`;
    setFormProjectId(projectsList[0]?.id || '');
    setFormNumber(nextNum);
    setFormType('WORK');
    setFormDiscipline('مدني / إنشائي');
    setFormTitle('');
    setFormLocation('');
    setFormBoqRef('');
    setFormContractorEngineer(currentUser?.full_name || 'م. التنفيذ المسؤول');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormCubeRequired(false);
    setFormCubeResults('');
    setIsNewModalOpen(true);
  };

  // Save New Request
  const handleSaveRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formProjectId || !formTitle || !formLocation) {
      showToast('يرجى ملء الحقول الإلزامية للطلب', 'warning');
      return;
    }

    try {
      const payload = {
        organization_id: orgId,
        project_id: formProjectId,
        wir_number: formNumber,
        request_type: formType,
        discipline: formDiscipline,
        title: formTitle,
        location_details: formLocation,
        boq_item_reference: formBoqRef || null,
        contractor_engineer: formContractorEngineer,
        requested_inspection_date: new Date(formDate).toISOString(),
        inspection_status: 'PENDING',
        cube_test_required: formCubeRequired,
        cube_test_results: formCubeResults || null
      };

      const { error } = await supabase.from('project_inspection_requests').insert(payload);
      if (error) throw error;

      showToast('تم تسجيل وإرسال طلب استلام الأعمال (WIR) بنجاح 📋', 'success');
      setIsNewModalOpen(false);
      fetchData();
    } catch (err: any) {
      showToast('فشل حفظ طلب الفحص: ' + err.message, 'error');
    }
  };

  // Save Consultant Verdict
  const handleSaveVerdict = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeInspection) return;

    try {
      const { error } = await supabase
        .from('project_inspection_requests')
        .update({
          inspection_status: verdictStatus,
          consultant_engineer: verdictEngineer,
          consultant_verdict_date: new Date().toISOString().split('T')[0],
          consultant_notes: verdictNotes || null,
          cube_test_results: verdictCubeResults || activeInspection.cube_test_results || null
        })
        .eq('id', activeInspection.id);

      if (error) throw error;

      showToast('تم تسجيل قرار الاستشاري واعتماد محضر الاستلام بنجاح ✅', 'success');
      setIsVerdictModalOpen(false);
      fetchData();
    } catch (err: any) {
      showToast('فشل حفظ قرار الاستشاري: ' + err.message, 'error');
    }
  };

  // Status Badge
  const renderStatusBadge = (status: InspectionRequest['inspection_status']) => {
    switch (status) {
      case 'APPROVED_A':
        return <span className="bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full text-xs font-black flex items-center gap-1">🟢 معتمد بالكامل (Code A)</span>;
      case 'APPROVED_WITH_COMMENTS_B':
        return <span className="bg-blue-100 text-blue-800 px-2.5 py-1 rounded-full text-xs font-black flex items-center gap-1">🔵 معتمد بملاحظات (Code B)</span>;
      case 'REJECTED_C':
        return <span className="bg-rose-100 text-rose-800 px-2.5 py-1 rounded-full text-xs font-black flex items-center gap-1">🔴 مرفوض - إعادة الفحص (Code C)</span>;
      default:
        return <span className="bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1">⏳ بانتظار الفحص الموقعي</span>;
    }
  };

  // Filtered Inspections
  const filteredInspections = useMemo(() => {
    return inspections.filter(item => {
      const matchSearch = item.wir_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          item.location_details.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          item.project_name?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === 'ALL' || item.inspection_status === statusFilter;
      const matchType = typeFilter === 'ALL' || item.request_type === typeFilter;
      return matchSearch && matchStatus && matchType;
    });
  }, [inspections, searchTerm, statusFilter, typeFilter]);

  // Excel Export
  const exportToExcel = () => {
    if (filteredInspections.length === 0) {
      showToast('لا توجد بيانات للتصدير', 'warning');
      return;
    }

    const rows = filteredInspections.map((item, idx) => ({
      '#': idx + 1,
      'رقم الطلب': item.wir_number,
      'المشروع': item.project_name,
      'النوع': item.request_type === 'WORK' ? 'استلام أعمال' : 'استلام خامات',
      'التخصص': item.discipline,
      'بيان العمل / الفحص': item.title,
      'الموقع / المحاور': item.location_details,
      'مهندس المقاول': item.contractor_engineer,
      'قرار الاستشاري': item.inspection_status,
      'مهندس الاستشاري': item.consultant_engineer || '---',
      'ملاحظات الاستشاري': item.consultant_notes || '---'
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'محاضر الاستلام');
    XLSX.writeFile(wb, `Inspection_Requests_WIR_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('تم تصدير سجل طلبات الاستلام إلى Excel ✅', 'success');
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in" dir="rtl">
      
      {/* 🏛️ Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="inline-flex items-center gap-2 bg-indigo-500/20 text-indigo-200 px-3 py-1 rounded-full text-xs font-bold mb-3 border border-indigo-400/30">
              <ClipboardCheck size={14} className="text-emerald-400" />
              <span>ضبط الجودة الموقعية (Quality Control & Site Inspections)</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">
              طلبات فحص واستلام الأعمال والخامات (WIR / MIR)
            </h1>
            <p className="text-indigo-200 text-sm mt-1 max-w-2xl">
              إدارة محاضر استلام الاستشاري للأعمال الإنشائية والتشطيبات والمواد، واختبارات تكسير المكعبات الخرسانية.
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
              <span>طلب استلام أعمال جديد (WIR)</span>
            </button>
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
              placeholder="بحث بالرقم أو العمل أو المحور..."
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

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700"
          >
            <option value="ALL">🔘 كل حالات الفحص</option>
            <option value="PENDING">⏳ بانتظار الفحص</option>
            <option value="APPROVED_A">🟢 معتمد (Code A)</option>
            <option value="APPROVED_WITH_COMMENTS_B">🔵 معتمد بملاحظات (Code B)</option>
            <option value="REJECTED_C">🔴 مرفوض (Code C)</option>
          </select>
        </div>

        <span className="text-xs font-bold text-slate-500">
          إجمالي المحاضر: {filteredInspections.length}
        </span>
      </div>

      {/* 📋 Inspections Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 font-bold animate-pulse">جاري تحميل طلبات الاستلام...</div>
        ) : filteredInspections.length === 0 ? (
          <div className="p-12 text-center">
            <ClipboardCheck size={48} className="mx-auto text-slate-300 mb-3" />
            <h3 className="text-slate-700 font-bold text-lg mb-1">لا توجد طلبات فحص مطابقة</h3>
            <p className="text-slate-400 text-sm">اضغط على "طلب استلام أعمال جديد" لتقديم محضر استلام للاستشاري.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3.5">رقم الـ WIR</th>
                  <th className="p-3.5">المشروع</th>
                  <th className="p-3.5">بيان العمل المطلوب استلامه</th>
                  <th className="p-3.5">الموقع والتفاصيل</th>
                  <th className="p-3.5">التخصص</th>
                  <th className="p-3.5">قرار الاستشاري</th>
                  <th className="p-3.5 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInspections.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5 font-mono font-bold text-indigo-700">{item.wir_number}</td>
                    <td className="p-3.5 font-medium text-slate-700">{item.project_name}</td>
                    <td className="p-3.5 font-bold text-slate-800">{item.title}</td>
                    <td className="p-3.5 text-xs text-slate-600">
                      <div className="flex items-center gap-1">
                        <MapPin size={12} className="text-rose-500" />
                        <span>{item.location_details}</span>
                      </div>
                    </td>
                    <td className="p-3.5 text-xs font-bold text-slate-600">{item.discipline}</td>
                    <td className="p-3.5">{renderStatusBadge(item.inspection_status)}</td>
                    <td className="p-3.5">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => {
                            setActiveInspection(item);
                            setVerdictStatus(item.inspection_status !== 'PENDING' ? item.inspection_status : 'APPROVED_A');
                            setVerdictEngineer(item.consultant_engineer || 'استشاري المشروع المعتمد');
                            setVerdictNotes(item.consultant_notes || '');
                            setVerdictCubeResults(item.cube_test_results || '');
                            setIsVerdictModalOpen(true);
                          }}
                          title="تسجيل قرار الاستشاري"
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"
                        >
                          <ShieldCheck size={16} />
                        </button>
                        <button
                          onClick={() => {
                            setActiveInspection(item);
                            setIsPrintModalOpen(true);
                          }}
                          title="طباعة محضر الاستلام"
                          className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg"
                        >
                          <Printer size={16} />
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

      {/* 📝 New WIR Modal */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl p-6 md:p-8 animate-in zoom-in-95">
            <form onSubmit={handleSaveRequest} className="space-y-4">
              <div className="flex justify-between items-center border-b pb-3">
                <div className="flex items-center gap-2 text-indigo-900 font-black text-lg">
                  <ClipboardCheck className="text-emerald-500" size={24} />
                  <span>تقديم طلب فحص واستلام أعمال (Work Inspection Request - WIR)</span>
                </div>
                <button type="button" onClick={() => setIsNewModalOpen(false)} className="text-slate-400">
                  <X size={20} />
                </button>
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
                  <label className="block text-xs font-bold text-slate-700 mb-1">رقم المحضر (WIR No.) *</label>
                  <input
                    type="text"
                    value={formNumber}
                    onChange={(e) => setFormNumber(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">نوع الفحص</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  >
                    <option value="WORK">🏗️ استلام أعمال تنفيذية (WIR)</option>
                    <option value="MATERIAL">📦 استلام مواد وخامات بالموقع (MIR)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">التخصص</label>
                  <select
                    value={formDiscipline}
                    onChange={(e) => setFormDiscipline(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  >
                    <option value="مدني / إنشائي">مدني / إنشائي (خرسانات وحديد)</option>
                    <option value="معماري وتشطيبات">معماري وتشطيبات</option>
                    <option value="كهروميكانيك MEP">كهروميكانيك MEP</option>
                    <option value="عزل وشبكات صرف">عزل وشبكات صرف</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">بيان العمل المطلوب استلامه بدقة *</label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="مثال: استلام حدادة ونجارة سقف الدور الأرضي قبل الصب"
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الموقع / المبنى / المحاور *</label>
                  <input
                    type="text"
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                    placeholder="مثال: المبنى A - سقف الدور الأول - المحاور 1 إلى 6"
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">مرجع بند المقايسة (BOQ Ref)</label>
                  <input
                    type="text"
                    value={formBoqRef}
                    onChange={(e) => setFormBoqRef(e.target.value)}
                    placeholder="مثال: بند 2.3 - خرسانة مسلحة للأسقف"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">مهندس التنفيذ المسؤول</label>
                  <input
                    type="text"
                    value={formContractorEngineer}
                    onChange={(e) => setFormContractorEngineer(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ ووقت الفحص المطلوب</label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="cubeTestCheck"
                    checked={formCubeRequired}
                    onChange={(e) => setFormCubeRequired(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded"
                  />
                  <label htmlFor="cubeTestCheck" className="text-xs font-bold text-slate-800 cursor-pointer">
                    يتطلب أخذ وتكسير مكعبات خرسانية (Concrete Compressive Strength Test)
                  </label>
                </div>

                {formCubeRequired && (
                  <div>
                    <input
                      type="text"
                      value={formCubeResults}
                      onChange={(e) => setFormCubeResults(e.target.value)}
                      placeholder="بيان رتبة الخرسانة وإجهاد الكسر المطلوب (مثال: C30 - 300 كجم/سم2)"
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="px-5 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-600/30"
                >
                  إرسال طلب الاستلام للاستشاري
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ⚖️ Verdict Modal */}
      {isVerdictModalOpen && activeInspection && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl p-6">
            <form onSubmit={handleSaveVerdict} className="space-y-4">
              <div className="flex justify-between items-center border-b pb-3">
                <div>
                  <h3 className="font-bold text-slate-800 text-base">تسجيل قرار وفحص استشاري المشروع</h3>
                  <p className="text-xs text-indigo-600 font-mono font-bold">{activeInspection.wir_number}: {activeInspection.title}</p>
                </div>
                <button type="button" onClick={() => setIsVerdictModalOpen(false)} className="text-slate-400">
                  <X size={20} />
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">قرار الاستشاري المعتمد *</label>
                <select
                  value={verdictStatus}
                  onChange={(e) => setVerdictStatus(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-indigo-700"
                >
                  <option value="APPROVED_A">🟢 Code A - معتمد بالكامل ويصرح بالصب / استكمال العمل</option>
                  <option value="APPROVED_WITH_COMMENTS_B">🔵 Code B - معتمد مع تلافي الملاحظات المذكورة</option>
                  <option value="REJECTED_C">🔴 Code C - مرفوض ولا يصرح بالصب ويجب إعادة الفحص</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات وتوجيهات الاستشاري الفنية</label>
                <textarea
                  rows={4}
                  value={verdictNotes}
                  onChange={(e) => setVerdictNotes(e.target.value)}
                  placeholder="أدخل توجيهات الاستشاري، مثل: مراجعة تخانات البسكوت، تكثيف الكانات عند الأعمدة..."
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium"
                />
              </div>

              {activeInspection.cube_test_required && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">نتائج اختبار تكسير المكعبات (إن توفرت)</label>
                  <input
                    type="text"
                    value={verdictCubeResults}
                    onChange={(e) => setVerdictCubeResults(e.target.value)}
                    placeholder="مثال: كسر 7 أيام: 240 كجم/سم2 (مطابق) - كسر 28 يوم: 320 كجم/سم2 (مطابق)"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم الاستشاري / مهندس الإشراف</label>
                <input
                  type="text"
                  value={verdictEngineer}
                  onChange={(e) => setVerdictEngineer(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsVerdictModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm"
                >
                  اعتماد قرار الاستشاري
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🖨️ Printable Transmittal for WIR */}
      {isPrintModalOpen && activeInspection && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl p-6 md:p-8" dir="rtl">
            <div className="flex justify-between items-center border-b pb-4 mb-4">
              <div>
                <h2 className="text-xl font-black text-slate-800">محضر استلام وفحص أعمال ميداني (WIR)</h2>
                <p className="text-xs text-slate-500 font-mono">Work & Material Inspection Request Sheet</p>
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
                <div><span className="text-slate-400 font-bold">رقم المحضر:</span> <span className="font-mono font-bold text-indigo-700">{activeInspection.wir_number}</span></div>
                <div><span className="text-slate-400 font-bold">المشروع:</span> <span className="font-bold">{activeInspection.project_name}</span></div>
                <div><span className="text-slate-400 font-bold">التخصص:</span> <span>{activeInspection.discipline}</span></div>
                <div><span className="text-slate-400 font-bold">تاريخ الطلب:</span> <span>{activeInspection.requested_inspection_date.split('T')[0]}</span></div>
                <div><span className="text-slate-400 font-bold">الموقع والمحاور:</span> <span className="font-bold text-slate-800">{activeInspection.location_details}</span></div>
                <div><span className="text-slate-400 font-bold">مهندس التنفيذ:</span> <span>{activeInspection.contractor_engineer}</span></div>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 border-b pb-1 text-xs">بيان العمل المطلوب استلامه:</h4>
                <p className="bg-slate-50 p-3 rounded-lg border text-xs mt-2 text-slate-800 font-bold">{activeInspection.title}</p>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <p className="text-xs font-bold text-slate-700 mb-2">قرار استشاري المشروع المشرف:</p>
                <div className="mb-2">{renderStatusBadge(activeInspection.inspection_status)}</div>
                {activeInspection.consultant_notes && (
                  <p className="text-xs text-slate-700 bg-white p-3 rounded border border-slate-200 mt-2">
                    <span className="font-bold block mb-1">ملاحظات الاستشاري:</span>
                    {activeInspection.consultant_notes}
                  </p>
                )}
                {activeInspection.cube_test_results && (
                  <p className="text-xs text-indigo-900 bg-indigo-50 p-2.5 rounded border border-indigo-200 mt-2">
                    <span className="font-bold">نتائج اختبار المكعبات:</span> {activeInspection.cube_test_results}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-8 pt-8 border-t border-slate-200 text-center text-xs">
                <div>
                  <p className="font-bold text-slate-700 mb-6">مهندس التنفيذ (المقاول)</p>
                  <p className="border-t border-slate-300 pt-1 text-slate-400">التوقيع</p>
                </div>
                <div>
                  <p className="font-bold text-slate-700 mb-6">استشاري المشروع المعتمد</p>
                  <p className="border-t border-slate-300 pt-1 text-slate-400">الختم والاعتماد</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
