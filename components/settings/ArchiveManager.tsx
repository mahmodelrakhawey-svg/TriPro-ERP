import { logger } from '@/utils/logger';
import React, { useState, useEffect, useCallback } from 'react';
import { Download, Database, Loader2, ShieldCheck, FileJson, Archive, CheckCircle2, AlertTriangle, Calendar, Layers } from 'lucide-react';
import { SupabaseClient } from '@supabase/supabase-js';

interface ArchiveManagerUser {
  id: string;
  role: string | null;
  organization_id?: string | null;
}

interface ArchiveRecord {
  id: string;
  fiscal_year_name: string;
  start_date: string;
  end_date: string;
  archived_at: string;
  journal_entries_count: number;
  journal_lines_count: number;
  stock_ledger_count: number;
  total_debit: number;
  total_credit: number;
  checksum: string;
  status: string;
}

interface ClosedFiscalYear {
  id: string;
  name?: string;
  year?: number;
  start_date: string;
  end_date: string;
  is_closed: boolean;
}

interface ArchiveManagerProps {
  supabase: SupabaseClient;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  currentUser: ArchiveManagerUser | null;
}

const ArchiveManager: React.FC<ArchiveManagerProps> = ({ 
  supabase, 
  showToast, 
  currentUser 
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [archives, setArchives] = useState<ArchiveRecord[]>([]);
  const [closedYears, setClosedYears] = useState<ClosedFiscalYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<string>('');
  const [archiveNotes, setArchiveNotes] = useState<string>('');
  const [loadingData, setLoadingData] = useState(false);

  // التحقق من الصلاحيات (فقط للمديرين)
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'super_admin';
  const orgId = currentUser?.organization_id;

  // جلب سجلات الأرشيف والسنوات المقفلة
  const loadArchiveData = useCallback(async () => {
    if (!orgId) return;
    setLoadingData(true);
    try {
      // 1. سجلات الأرشيف المنفذة سابقاً
      const { data: archData } = await supabase
        .from('annual_fiscal_archives')
        .select('*')
        .eq('organization_id', orgId)
        .order('archived_at', { ascending: false });

      if (archData) setArchives(archData);

      // 2. السنوات المالية المقفلة التي لم تُؤرشف بعد
      const { data: fyData, error: fyError } = await supabase
        .from('fiscal_years')
        .select('*')
        .eq('organization_id', orgId)
        .eq('is_closed', true)
        .order('start_date', { ascending: false });

      if (fyError) {
        logger.warn('Fiscal years query warning:', fyError.message);
      }

      if (fyData && fyData.length > 0) {
        const archivedYearIds = new Set((archData || []).map(a => a.fiscal_year_id));
        const formattedYears = fyData.map((y: Record<string, unknown>) => ({
          ...y,
          id: String(y.id || ''),
          start_date: String(y.start_date || ''),
          end_date: String(y.end_date || ''),
          is_closed: Boolean(y.is_closed),
          name: String(y.name || (y.year ? `السنة المالية ${y.year}` : `السنة (${y.start_date} - ${y.end_date})`)),
        })) as ClosedFiscalYear[];
        const availableYears = formattedYears.filter(y => !archivedYearIds.has(y.id));
        setClosedYears(availableYears);
        if (availableYears.length > 0) {
          setSelectedYearId(availableYears[0].id);
        }
      } else {
        setClosedYears([]);
      }
    } catch (err) {
      logger.error('Failed to load archive data:', err);
    } finally {
      setLoadingData(false);
    }
  }, [orgId, supabase]);

  useEffect(() => {
    if (isAdmin) {
      loadArchiveData();
    }
  }, [isAdmin, loadArchiveData]);

  // تنفيذ الأرشفة السنوية وتفريغ الجداول النشطة
  const handleArchiveFiscalYear = async () => {
    if (!isAdmin || !selectedYearId || !orgId) return;

    const targetYear = closedYears.find(y => y.id === selectedYearId);
    const confirmMsg = `⚠️ تأكيد الأرشفة السنوية المؤسسية:\n\nسيتم الآن نقل حركات دفتر الأستاذ والمخزون للسنة: "${targetYear?.name || selectedYearId}" إلى جداول الأرشيف المعزولة، وتفريغها بأمان من الجداول النشطة لتسريع النظام.\n\nالعملية آمنة ومحمية وتتيح الاستعلام التاريخي دائماً. هل تود الاستمرار؟`;
    
    if (!window.confirm(confirmMsg)) return;

    setIsArchiving(true);
    try {
      const { data, error } = await supabase.rpc('archive_closed_fiscal_year_rpc', {
        p_org_id: orgId,
        p_fiscal_year_id: selectedYearId,
        p_notes: archiveNotes.trim() || null
      });

      if (error) throw error;

      showToast(`تمت أرشفة السنة المالية بنجاح ✅ (تم أرشفة ${data.journal_lines_count} سطر قيد محاسبي).`, 'success');
      setArchiveNotes('');
      await loadArchiveData();
    } catch (err: unknown) {
      logger.error('Archive Error:', err);
      const errObj = err as { message?: string };
      showToast('تعذر إتمام الأرشفة: ' + (errObj.message || 'خطأ غير معروف'), 'error');
    } finally {
      setIsArchiving(false);
    }
  };

  const handleExportFullArchive = async () => {
    if (!isAdmin) {
      showToast('عذراً، هذه الصلاحية متاحة لمدير النظام فقط', 'error');
      return;
    }

    if (!window.confirm('سيتم الآن تجهيز نسخة احتياطية كاملة لبيانات المنظمة (الفواتير، القيود، المخزون، والرواتب). هل تود الاستمرار؟')) {
      return;
    }

    setIsExporting(true);
    try {
      const { data, error } = await supabase.rpc('export_organization_data_json', {
        p_org_id: currentUser?.organization_id
      });

      if (error) throw error;

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `TriPro_ERP_Archive_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast('تم تحميل الأرشيف الكامل بنجاح ✅ احتفظ بهذا الملف في مكان آمن.', 'success');
    } catch (err: unknown) {
      logger.error('Export Error:', err);
      const errObj = err as { message?: string };
      showToast('فشل تصدير الأرشيف: ' + (errObj.message || 'خطأ غير معروف'), 'error');
    } finally {
      setIsExporting(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="space-y-6" dir="rtl">
      {/* 🏛️ بطاقة الأرشفة السنوية المؤسسية وتجزئة البيانات الضخمة */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 rounded-xl text-blue-600">
              <Archive size={26} />
            </div>
            <div>
              <h3 className="font-black text-slate-800 text-lg">الأرشفة السنوية وتخفيف قواعد البيانات (Cold Storage)</h3>
              <p className="text-slate-500 text-xs font-bold">
                نقل حركات السنوات المالية المغلقة نهائياً إلى جداول الأرشيف المعزولة للحفاظ على سرعة النظام الفائقة.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg text-xs font-bold">
            <ShieldCheck size={16} />
            <span>نظام أرشفة آمن 100%</span>
          </div>
        </div>

        {/* نموذج تنفيذ الأرشفة */}
        <div className="bg-slate-50 rounded-xl p-5 border border-slate-200/80 space-y-4">
          <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
            <Calendar size={15} className="text-blue-600" />
            أرشفة سنة مالية مقفلة
          </h4>

          {closedYears.length === 0 ? (
            <div className="text-center py-4 bg-white rounded-lg border border-slate-200 text-slate-500 text-xs font-bold">
              لا توجد سنوات مالية مقفلة بانتظار الأرشفة حالياً. يجب إقفال السنة المالية أولاً من شاشة "إقفال السنة المالية".
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-black text-slate-600 mb-1">اختر السنة المالية المقفلة:</label>
                  <select
                    value={selectedYearId}
                    onChange={(e) => setSelectedYearId(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                  >
                    {closedYears.map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.name} ({y.start_date} إلى {y.end_date})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-black text-slate-600 mb-1">ملاحظات اعتماد الأرشفة (اختياري):</label>
                  <input
                    type="text"
                    value={archiveNotes}
                    onChange={(e) => setArchiveNotes(e.target.value)}
                    placeholder="مثال: تم اعتماد الحسابات الختامية بواسطة مراجع الحسابات"
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <button
                onClick={handleArchiveFiscalYear}
                disabled={isArchiving || !selectedYearId}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-black text-xs transition-all shadow-md active:scale-[0.99] disabled:opacity-50 cursor-pointer"
              >
                {isArchiving ? <Loader2 className="animate-spin" size={16} /> : <Layers size={16} />}
                {isArchiving ? 'جاري أرشفة وتفريغ السنة المالية بأمان...' : 'بدء أرشفة السنة المالية وتفريغ الجداول النشطة'}
              </button>
            </div>
          )}
        </div>

        {/* جدول الأرشيفات المنفذة سابقاً */}
        <div className="space-y-3">
          <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
            <CheckCircle2 size={15} className="text-emerald-600" />
            سجل السنوات المالية المؤرشفة في قاعدة البيانات ({archives.length})
          </h4>

          {loadingData ? (
            <div className="text-center py-6 text-slate-400 text-xs font-bold">
              <Loader2 className="animate-spin mx-auto mb-2" size={20} />
              جاري فحص سجل الأرشيف...
            </div>
          ) : archives.length === 0 ? (
            <div className="text-center py-6 bg-slate-50 rounded-xl border border-slate-200 text-slate-400 text-xs font-bold">
              لم يتم أرشفة أي سنة مالية سابقة بعد. جميع البيانات لا تزال في الجداول التشغيلية المباشرة.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 text-slate-700 font-black border-b border-slate-200">
                  <tr>
                    <th className="p-3">السنة المالية</th>
                    <th className="p-3">الفترة</th>
                    <th className="p-3">أسطر القيود المؤرشفة</th>
                    <th className="p-3">حركات المخزون</th>
                    <th className="p-3">إجمالي التوازن (مدين/دائن)</th>
                    <th className="p-3">تاريخ الأرشفة</th>
                    <th className="p-3">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {archives.map((arch) => (
                    <tr key={arch.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 font-black text-slate-800">{arch.fiscal_year_name}</td>
                      <td className="p-3 font-bold text-slate-500">{arch.start_date} ↔ {arch.end_date}</td>
                      <td className="p-3 font-bold text-blue-600">{Number(arch.journal_lines_count).toLocaleString()} سطر</td>
                      <td className="p-3 font-bold text-slate-600">{Number(arch.stock_ledger_count || 0).toLocaleString()} حركة</td>
                      <td className="p-3 font-bold text-emerald-600">{Number(arch.total_debit).toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م</td>
                      <td className="p-3 font-bold text-slate-500">{new Date(arch.archived_at).toLocaleDateString('ar-EG')}</td>
                      <td className="p-3">
                        <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full text-[10px] font-black">
                          <CheckCircle2 size={12} />
                          مؤرشفة بنجاح
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 📥 بطاقة النسخة الاحتياطية القانونية (JSON Export) */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="p-2.5 bg-amber-50 rounded-xl text-amber-600">
            <Database size={24} />
          </div>
          <div>
            <h3 className="font-black text-slate-800 text-lg">تصدير النسخة الاحتياطية القانونية (Full JSON Backup)</h3>
            <p className="text-slate-500 text-xs font-bold">تصدير كامل سجلات الشركة في ملف واحد مضغوط بصيغة JSON كنسخة احتياطية خارج السحابة.</p>
          </div>
        </div>

        <button
          onClick={handleExportFullArchive}
          disabled={isExporting}
          className="w-full flex items-center justify-center gap-3 bg-slate-900 hover:bg-slate-800 text-white py-3.5 rounded-xl font-black text-xs transition-all transform active:scale-95 shadow-md disabled:opacity-50 cursor-pointer"
        >
          {isExporting ? <Loader2 className="animate-spin" size={18} /> : <FileJson size={18} />}
          {isExporting ? 'جاري استخراج وتجهيز الملف...' : 'تحميل النسخة الكاملة بصيغة JSON'}
        </button>
      </div>
    </div>
  );
};

export default ArchiveManager;
