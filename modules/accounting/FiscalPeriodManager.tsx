import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { 
  Calendar, 
  Lock, 
  Unlock, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw, 
  ShieldCheck, 
  Clock, 
  FileText,
  ChevronRight,
  TrendingUp,
  Sparkles
} from 'lucide-react';

interface AccountingPeriod {
  id: string;
  period_name: string;
  fiscal_year: number;
  period_number: number;
  start_date: string;
  end_date: string;
  status: 'open' | 'locked' | 'closed';
  closed_at: string | null;
  reopened_at: string | null;
  notes: string | null;
  entries_count?: number;
  total_debit?: number;
}

export const FiscalPeriodManager: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const { showToast } = useToast();
  const { currentUser } = useAuth();
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const orgId = (currentUser as any)?.organization_id;

  const fetchPeriods = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      // 1. استدعاء تهيئة الشهور إن لم تكن موجودة
      await supabase.rpc('initialize_fiscal_year_periods', {
        p_org_id: orgId,
        p_year: selectedYear
      });

      // 2. جلب الفترات للعام المحدد
      const { data, error } = await supabase
        .from('accounting_periods')
        .select('*')
        .eq('organization_id', orgId)
        .eq('fiscal_year', selectedYear)
        .order('period_number', { ascending: true });

      if (error) throw error;

      // 3. جلب إحصائيات القيود لكل فترة
      const { data: entries } = await supabase
        .from('journal_entries')
        .select('id, transaction_date, journal_lines(debit)')
        .eq('organization_id', orgId)
        .gte('transaction_date', `${selectedYear}-01-01`)
        .lte('transaction_date', `${selectedYear}-12-31`);

      const enrichedPeriods: AccountingPeriod[] = (data || []).map((p: any) => {
        const periodEntries = (entries || []).filter(e => 
          e.transaction_date >= p.start_date && e.transaction_date <= p.end_date
        );
        let totalDebit = 0;
        periodEntries.forEach((e: any) => {
          e.journal_lines?.forEach((l: any) => {
            totalDebit += Number(l.debit || 0);
          });
        });

        return {
          ...p,
          entries_count: periodEntries.length,
          total_debit: totalDebit
        };
      });

      setPeriods(enrichedPeriods);
    } catch (err: any) {
      console.error('Error fetching accounting periods:', err);
      showToast('تعذر تحميل الفترات المالية: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPeriods();
  }, [selectedYear, orgId]);

  const togglePeriodLock = async (period: AccountingPeriod) => {
    const isLocking = period.status === 'open';
    const actionText = isLocking ? 'قفل وتجميد' : 'إلغاء قفل وفتح';
    
    if (!window.confirm(`هل أنت متأكد من ${actionText} الفترة المحاسبية (${period.period_name})؟\n\n• ${isLocking ? 'سيتم منع إضافة أو تعديل أي قيود أو فواتير بتاريخ هذه الفترة.' : 'سيتم السماح بإجراء قيود وتسويات مالية في هذه الفترة مؤقتاً.'}`)) {
      return;
    }

    setActionLoadingId(period.id);
    try {
      const updates = isLocking
        ? {
            status: 'locked',
            closed_at: new Date().toISOString(),
            closed_by: currentUser?.id,
            updated_at: new Date().toISOString()
          }
        : {
            status: 'open',
            reopened_at: new Date().toISOString(),
            reopened_by: currentUser?.id,
            updated_at: new Date().toISOString()
          };

      const { error } = await supabase
        .from('accounting_periods')
        .update(updates)
        .eq('id', period.id);

      if (error) throw error;

      showToast(`تم ${actionText} ${period.period_name} بنجاح ✅`, 'success');
      await fetchPeriods();
    } catch (err: any) {
      showToast('حدث خطأ أثناء تعديل حالة الفترة: ' + err.message, 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const openCount = periods.filter(p => p.status === 'open').length;
  const lockedCount = periods.filter(p => p.status === 'locked' || p.status === 'closed').length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" dir="rtl">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-xl border border-indigo-900/50 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-indigo-600/30 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
            <Calendar size={28} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black">إدارة وقفل الفترات المالية الشهرية</h1>
              <span className="bg-indigo-500/20 text-indigo-300 text-xs px-2.5 py-1 rounded-full font-bold border border-indigo-400/30 flex items-center gap-1">
                <ShieldCheck size={14} /> حماية الأستاذ العام
              </span>
            </div>
            <p className="text-slate-300 text-sm mt-1">
              قفل الشهور المنتهية واعتماد الضرائب لمنع أي تلاعب أو إضافة فواتير بتاريخ قديم
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          {onBack && (
            <button
              onClick={onBack}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-sm font-bold transition flex items-center gap-1 border border-slate-700"
            >
              <ChevronRight size={16} /> العودة
            </button>
          )}

          {/* Year Selector */}
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
            className="bg-slate-800 border border-slate-700 text-white font-bold px-4 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {[2024, 2025, 2026, 2027, 2028].map(y => (
              <option key={y} value={y}>السنة المالية: {y}</option>
            ))}
          </select>

          <button
            onClick={fetchPeriods}
            disabled={loading}
            className="p-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition shadow-md disabled:opacity-50"
            title="تحديث البيانات"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-500">إجمالي فترات السنة</div>
            <div className="text-2xl font-black text-slate-800 mt-1">12 شهراً</div>
            <div className="text-xs text-slate-400 mt-0.5">سنة {selectedYear}</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Calendar size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-emerald-600">الفترات المفتوحة للتسجيل</div>
            <div className="text-2xl font-black text-emerald-700 mt-1">{openCount} فترة 🟢</div>
            <div className="text-xs text-slate-400 mt-0.5">متاح إضافة قيود وفواتير</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <Unlock size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-amber-600">الفترات المقفلة والمجمدة</div>
            <div className="text-2xl font-black text-amber-700 mt-1">{lockedCount} فترة 🔒</div>
            <div className="text-xs text-slate-400 mt-0.5">محمية من أي تعديل</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Lock size={24} />
          </div>
        </div>
      </div>

      {/* Grid of Periods */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {periods.map((period) => {
          const isLocked = period.status === 'locked' || period.status === 'closed';
          const isCurrentAction = actionLoadingId === period.id;

          return (
            <div
              key={period.id}
              className={`rounded-2xl p-5 border transition-all shadow-sm flex flex-col justify-between ${
                isLocked 
                  ? 'bg-slate-50 border-slate-200 opacity-90' 
                  : 'bg-white border-indigo-100 hover:border-indigo-300 hover:shadow-md'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-black text-sm">
                      {period.period_number}
                    </span>
                    <h3 className="font-bold text-base text-slate-800">{period.period_name}</h3>
                  </div>

                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${
                    isLocked 
                      ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                      : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  }`}>
                    {isLocked ? <Lock size={12} /> : <Unlock size={12} />}
                    {isLocked ? 'مقفل / مجمد' : 'مفتوح للعمل'}
                  </span>
                </div>

                <div className="space-y-2 bg-slate-100/60 p-3 rounded-xl text-xs text-slate-600 mb-4">
                  <div className="flex justify-between">
                    <span className="text-slate-500">نطاق التاريخ:</span>
                    <span className="font-mono font-bold text-slate-700">{period.start_date} ← {period.end_date}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">عدد القيود المسجلة:</span>
                    <span className="font-bold text-indigo-700">{period.entries_count || 0} قيد</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">حجم التداول (المدين):</span>
                    <span className="font-bold text-slate-800">{(period.total_debit || 0).toLocaleString()} ج.م</span>
                  </div>
                </div>
              </div>

              <div>
                <button
                  onClick={() => togglePeriodLock(period)}
                  disabled={isCurrentAction}
                  className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs transition flex items-center justify-center gap-2 shadow-sm ${
                    isLocked
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-slate-800 hover:bg-slate-900 text-white'
                  } disabled:opacity-50`}
                >
                  {isCurrentAction ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : isLocked ? (
                    <>
                      <Unlock size={14} /> إلغاء القفل (فتح الفترة مؤقتاً)
                    </>
                  ) : (
                    <>
                      <Lock size={14} /> قفل وتجميد الفترة المحاسبية
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
