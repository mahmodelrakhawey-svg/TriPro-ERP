import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useToast } from '../context/ToastContext';
import { 
  Calendar, 
  Calculator, 
  BadgeCheck, 
  RotateCw,
  DollarSign,
  ClipboardCheck,
  Undo2,
  TrendingUp,
  X,
  CheckCircle,
  TrendingDown,
  AlertTriangle
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';

export const CostClosingDashboard: React.FC = () => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear()
  });

  const [stats, setStats] = useState({
    totalWipValue: 0,
    pendingOverhead: 0,
    openOrdersCount: 0,
    lastClosedPeriod: ''
  });
  const [varianceStats, setVarianceStats] = useState({
    current: 0,
    previous: 0,
    diff: 0
  });
  const [chartData, setChartData] = useState<any[]>([]);
  const [showReconModal, setShowReconModal] = useState(false);
  const [reconReport, setReconReport] = useState<any[]>([]);

  // جلب البيانات الأساسية للفترة المختارة
  const fetchPeriodStats = async () => {
    setLoading(true);
    try {
      const periodName = `${period.year}-${period.month.toString().padStart(2, '0')}`;
      const prevMonth = period.month === 1 ? 12 : period.month - 1;
      const prevYear = period.month === 1 ? period.year - 1 : period.year;
      const prevPeriodName = `${prevYear}-${prevMonth.toString().padStart(2, '0')}`;

      // حساب تواريخ البداية والنهاية للفترة
      const startDate = `${period.year}-${period.month.toString().padStart(2, '0')}-01`;
      const endDate = new Date(period.year, period.month, 0).toISOString().split('T')[0];

      // 1. جلب إجمالي قيمة الـ WIP من رؤية المصالحة
      const { data: wipData } = await supabase
        .from('v_mfg_cost_reconciliation_report')
        .select('cost_assigned_to_wip');
      
      const totalWip = (wipData || []).reduce((sum, item) => sum + (item.cost_assigned_to_wip || 0), 0);

      // 2. جلب المصاريف غير المباشرة من الأستاذ العام (أكواد تبدأ بـ 514)
      const { data: ovhData } = await supabase
        .from('journal_lines_view')
        .select('balance')
        .like('account_code', '514%')
        .gte('transaction_date', startDate)
        .lte('transaction_date', endDate);

      const totalOvh = (ovhData || []).reduce((sum, item) => sum + (item.balance || 0), 0);

      // 3. جلب بيانات الرسم البياني (أفضل 5 منتجات من حيث الانحراف أو الحجم)
      const { data: trendData } = await supabase
        .from('v_mfg_cost_trends')
        .select('*')
        .eq('month_period', periodName)
        .order('avg_actual_unit_cost', { ascending: false })
        .limit(5);

      // 4. جلب ومقارنة انحراف المصنع الإجمالي
      const { data: currentVar } = await supabase.from('v_mfg_cost_trends').select('variance_pct').eq('month_period', periodName);
      const { data: prevVar } = await supabase.from('v_mfg_cost_trends').select('variance_pct').eq('month_period', prevPeriodName);

      const avgCurrent = currentVar?.length ? currentVar.reduce((s, i) => s + i.variance_pct, 0) / currentVar.length : 0;
      const avgPrev = prevVar?.length ? prevVar.reduce((s, i) => s + i.variance_pct, 0) / prevVar.length : 0;

      // جلب آخر فترة مغلقة فعلياً من قاعدة البيانات
      const { data: lastSnap } = await supabase.from('mfg_period_cost_snapshots').select('period_name').order('created_at', { ascending: false }).limit(1).maybeSingle();

      setStats({
        totalWipValue: totalWip,
        pendingOverhead: totalOvh,
        openOrdersCount: wipData?.length || 0,
        lastClosedPeriod: lastSnap?.period_name || 'لا يوجد'
      });

      setVarianceStats({
        current: avgCurrent,
        previous: avgPrev,
        diff: avgCurrent - avgPrev
      });

      setChartData(trendData || []);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPeriodStats(); }, [period]);

  // جلب بيانات تقرير المصالحة
  const fetchReconciliationReport = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('v_mfg_cost_reconciliation_report').select('*');
      if (error) throw error;
      setReconReport(data || []);
      setShowReconModal(true);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // تنفيذ دالة توزيع الأعباء
  const handleAllocateOverhead = async () => {
    setLoading(true);
    try {
      const startDate = `${period.year}-${period.month.toString().padStart(2, '0')}-01`;
      const endDate = new Date(period.year, period.month, 0).toISOString().split('T')[0];
      const periodName = `${period.year}-${period.month.toString().padStart(2, '0')}`;

      const { data, error } = await supabase.rpc('mfg_allocate_actual_overhead', {
        p_period_start: startDate,
        p_period_end: endDate,
        p_description: `توزيع تلقائي لشهر ${periodName}`
      });

      if (error) throw error;
      showToast(`تم توزيع ${stats.pendingOverhead} ج.م على الأوامر النشطة بنجاح`, 'success');
      fetchPeriodStats();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // تنفيذ إغلاق الفترة وترحيل الأرصدة
  const handleClosePeriod = async () => {
    if (!window.confirm('هل أنت متأكد من إغلاق الفترة؟ سيتم ترحيل أرصدة WIP كأرصدة أول مدة للشهر القادم.')) return;
    
    setLoading(true);
    try {
      const periodName = `${period.year}-${period.month.toString().padStart(2, '0')}`;
      const { data, error } = await supabase.rpc('mfg_close_costing_period', {
        p_period_name: periodName
      });

      if (error) throw error;
      showToast(`تم إغلاق الفترة ${periodName} وترحيل ${data.orders_migrated} أمراً بنجاح`, 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // تنفيذ التراجع عن الإغلاق
  const handleUndoClose = async () => {
    const periodName = `${period.year}-${period.month.toString().padStart(2, '0')}`;
    if (!window.confirm(`هل أنت متأكد من فتح الفترة ${periodName} مرة أخرى؟ سيتم حذف سجلات التكاليف التاريخية لهذه الفترة.`)) return;

    setLoading(true);
    try {
      const { error } = await supabase.rpc('mfg_undo_costing_period_close', { p_period_name: periodName });
      if (error) throw error;
      showToast(`تم إلغاء إغلاق الفترة ${periodName} بنجاح`, 'success');
      fetchPeriodStats();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // تنفيذ فحص تجاوز التكاليف يدوياً للأوامر النشطة
  const handleManualCostCheck = async () => {
    setLoading(true);
    try {
      // استدعاء الدالة الذكية من قاعدة البيانات مع حد انحراف 15%
      const { data, error } = await supabase.rpc('mfg_check_active_cost_overruns', {
        p_threshold_pct: 15 
      });

      if (error) throw error;
      
      if (data > 0) {
        showToast(`تم اكتشاف ${data} تجاوزات في التكاليف وإرسال تنبيهات فورية للمديرين ⚠️`, 'warning');
      } else {
        showToast('تم فحص كافة الأوامر النشطة: لا يوجد تجاوزات مكتشفة حالياً ✅', 'success');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">إغلاق الفترة المالية للمصنع</h1>
          <p className="text-gray-500">إدارة تكاليف المراحل، توزيع الأعباء، وترحيل WIP</p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* 🛡️ زر تشغيل الفحص اليدوي المضاف */}
          <button 
            onClick={handleManualCostCheck}
            disabled={loading}
            className="flex items-center gap-2 bg-amber-50 text-amber-700 border border-amber-200 px-4 py-2.5 rounded-xl font-bold hover:bg-amber-100 transition-all shadow-sm active:scale-95 disabled:opacity-50"
            title="بدء مسح شامل لتجاوز التكاليف في أرضية المصنع الآن"
          >
            <AlertTriangle className="w-4 h-4" />
            تشغيل الفحص اليدوي
          </button>

          <div className="flex gap-4 bg-white p-2 rounded-lg shadow-sm border">
          <select 
            className="bg-transparent font-bold text-blue-600 outline-none"
            value={period.month}
            onChange={e => setPeriod({...period, month: parseInt(e.target.value)})}
          >
            {Array.from({length: 12}, (_, i) => (
              <option key={i+1} value={i+1}>{new Date(0, i).toLocaleString('ar-EG', {month: 'long'})}</option>
            ))}
          </select>
          <input 
            type="number" 
            className="w-20 bg-transparent font-bold text-blue-600 outline-none"
            value={period.year}
            onChange={e => setPeriod({...period, year: parseInt(e.target.value)})}
          />
        </div>
        </div>
      </div>

      {/* كروت الإحصائيات */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <StatCard title="قيمة الإنتاج تحت التشغيل" value={stats.totalWipValue} icon={<DollarSign className="w-8 h-8 text-blue-500" />} />
        <StatCard title="أعباء غير موزعة (GL)" value={stats.pendingOverhead} icon={<Calculator className="w-8 h-8 text-amber-500" />} />
        <StatCard title="أوامر نشطة بالفترة" value={stats.openOrdersCount} unit="أمر" icon={<RotateCw className="w-8 h-8 text-indigo-500" />} />
        <div className="relative group">
          <StatCard title="آخر فترة مغلقة" value={stats.lastClosedPeriod} isCurrency={false} icon={<BadgeCheck className="w-8 h-8 text-green-500" />} />
          {stats.lastClosedPeriod !== 'لا يوجد' && (
            <button 
              onClick={handleUndoClose}
              className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 bg-red-100 text-red-600 p-1 rounded transition-opacity"
              title="تراجع عن الإغلاق"
            >
              <Undo2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* مقارنة الانحراف الإجمالي */}
      <div className="bg-white p-4 rounded-xl border mb-8 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-full ${varianceStats.diff <= 0 ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
            {varianceStats.diff <= 0 ? <TrendingDown className="w-6 h-6" /> : <TrendingUp className="w-6 h-6" />}
          </div>
          <div>
            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">اتجاه انحراف تكاليف المصنع</p>
            <h4 className="text-lg font-black">
              {varianceStats.current.toFixed(2)}% 
              <span className="text-sm font-normal text-gray-400 mr-2">
                ({varianceStats.diff > 0 ? '+' : ''}{varianceStats.diff.toFixed(2)}% عن الشهر السابق)
              </span>
            </h4>
          </div>
        </div>
        <div className="text-left">
          <p className="text-[10px] text-gray-400 font-bold uppercase">كفاءة التكاليف</p>
          <span className={`text-sm font-bold ${varianceStats.current <= 5 ? 'text-green-600' : 'text-amber-600'}`}>
            {varianceStats.current <= 5 ? 'منضبطة جداً' : 'تحتاج مراقبة'}
          </span>
        </div>
      </div>

      {/* الرسم البياني لتحليل التكاليف */}
      <div className="bg-white p-6 rounded-xl shadow-sm border mb-8">
        <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2">
          <Calculator className="w-5 h-5 text-purple-600" />
          مقارنة التكلفة الفعلية vs المعيارية (لأهم 5 منتجات)
        </h3>
        <div className="h-80 w-full">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="product_name" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Legend />
                <Bar dataKey="avg_actual_unit_cost" name="التكلفة الفعلية" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                <Bar dataKey="standard_unit_cost" name="التكلفة المعيارية" fill="#94a3b8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400 italic">
              لا توجد بيانات مكتملة للعرض في هذه الفترة
            </div>
          )}
        </div>
      </div>

      {/* خطوات الإغلاق */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-6 border-b bg-gray-50">
          <h3 className="font-bold text-gray-800">خطوات الإقفال الشهري</h3>
        </div>
        
        <div className="p-6 space-y-6">
          {/* الخطوة 1 */}
          <div className="flex items-start gap-4 p-4 rounded-lg border hover:bg-blue-50 transition-colors">
            <div className="bg-blue-100 text-blue-600 p-3 rounded-full font-bold">01</div>
            <div className="flex-1">
              <h4 className="font-bold text-gray-900">توزيع المصاريف الصناعية الفعلية</h4>
              <p className="text-sm text-gray-500">سيقوم النظام بجلب كافة فواتير الكهرباء، الإيجار، والإهلاكات من الأستاذ العام وتوزيعها على الأوامر بناءً على "وحدات التحويل المعادلة".</p>
            </div>
            <button 
              onClick={handleAllocateOverhead}
              disabled={loading || stats.pendingOverhead === 0}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50"
            >
              بدء التوزيع
            </button>
          </div>

          {/* الخطوة 2 */}
          <div className="flex items-start gap-4 p-4 rounded-lg border hover:bg-indigo-50 transition-colors">
            <div className="bg-indigo-100 text-indigo-600 p-3 rounded-full font-bold">02</div>
            <div className="flex-1">
              <h4 className="font-bold text-gray-900">مراجعة تقرير المصالحة النهائية</h4>
              <p className="text-sm text-gray-500">تحقق من مطابقة الأستاذ العام مع قيمة WIP المحسوبة قبل تنفيذ الترحيل النهائي.</p>
            </div>
            <button 
              onClick={fetchReconciliationReport}
              className="text-indigo-600 border border-indigo-600 px-6 py-2 rounded-lg font-bold hover:bg-indigo-50"
            >
              فتح التقرير
            </button>
          </div>

          {/* الخطوة 3 */}
          <div className="flex items-start gap-4 p-4 rounded-lg border border-green-200 bg-green-50">
            <div className="bg-green-600 text-white p-3 rounded-full font-bold">03</div>
            <div className="flex-1">
              <h4 className="font-bold text-green-900">الإغلاق والترحيل للشهر القادم</h4>
              <p className="text-sm text-green-700">هذه الخطوة ستجمد تكاليف الشهر الحالي وتنقل أرصدة الـ WIP لتصبح "أرصدة أول مدة" (Beginning WIP) للشهر القادم.</p>
            </div>
            <button 
              onClick={handleClosePeriod}
              disabled={loading}
              className="bg-green-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-green-700"
            >
              إغلاق الفترة
            </button>
          </div>
        </div>
      </div>

      {/* نافذة تقرير المصالحة التكاليفية */}
      {showReconModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b flex justify-between items-center bg-gray-50">
              <div className="flex items-center gap-2 text-indigo-600">
                <ClipboardCheck className="w-6 h-6" />
                <h3 className="font-bold text-lg">تقرير مصالحة التكاليف (Cost Reconciliation)</h3>
              </div>
              <button onClick={() => setShowReconModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 overflow-x-auto flex-1">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-gray-100 text-gray-600 text-xs uppercase font-black border-b">
                    <th className="p-3">رقم الأمر</th>
                    <th className="p-3">المنتج</th>
                    <th className="p-3">إجمالي التكاليف للمحاسبة</th>
                    <th className="p-3 text-green-600">تكلفة الإنتاج التام</th>
                    <th className="p-3 text-blue-600">تكلفة تحت التشغيل (WIP)</th>
                    <th className="p-3 text-red-600">تالف غير مسموح</th>
                    <th className="p-3">إجمالي الموزع</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {reconReport.map((row) => (
                    <tr key={row.order_id} className="border-b hover:bg-gray-50 transition-colors">
                      <td className="p-3 font-bold text-indigo-600">#{row.order_number}</td>
                      <td className="p-3 font-medium">{row.product_name}</td>
                      <td className="p-3 font-black">{(row.total_to_account_for || 0).toLocaleString()}</td>
                      <td className="p-3 text-green-700 font-bold bg-green-50/50">{(row.cost_assigned_to_finished_goods || 0).toLocaleString()}</td>
                      <td className="p-3 text-blue-700 font-bold bg-blue-50/50">{(row.cost_assigned_to_wip || 0).toLocaleString()}</td>
                      <td className="p-3 text-red-700 font-bold bg-red-50/50">{(row.cost_assigned_to_abnormal_scrap || 0).toLocaleString()}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {(row.total_accounted_for || 0).toLocaleString()}
                          {Math.abs(row.total_to_account_for - row.total_accounted_for) < 1 ? 
                            <CheckCircle className="w-4 h-4 text-green-500" /> : 
                            <span className="text-[10px] text-amber-500 font-bold">فرق كسور</span>
                          }
                        </div>
                      </td>
                    </tr>
                  ))}
                  {reconReport.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-gray-400 italic">لا توجد بيانات متاحة حالياً</td>
                    </tr>
                  )}
                </tbody>
                <tfoot className="bg-gray-50 font-black">
                  <tr>
                    <td colSpan={2} className="p-3 text-left uppercase">الإجماليات الكلية:</td>
                    <td className="p-3 text-indigo-600">{reconReport.reduce((s, r) => s + (r.total_to_account_for || 0), 0).toLocaleString()}</td>
                    <td className="p-3 text-green-600">{reconReport.reduce((s, r) => s + (r.cost_assigned_to_finished_goods || 0), 0).toLocaleString()}</td>
                    <td className="p-3 text-blue-600">{reconReport.reduce((s, r) => s + (r.cost_assigned_to_wip || 0), 0).toLocaleString()}</td>
                    <td className="p-3 text-red-600">{reconReport.reduce((s, r) => s + (r.cost_assigned_to_abnormal_scrap || 0), 0).toLocaleString()}</td>
                    <td className="p-3">{reconReport.reduce((s, r) => s + (r.total_accounted_for || 0), 0).toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            
            <div className="p-6 bg-gray-50 border-t flex justify-end">
              <button onClick={() => setShowReconModal(false)} className="bg-indigo-600 text-white px-8 py-2.5 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">
                إغلاق التقرير والمتابعة
              </button>
            </div>
          </div>
        </div>
      )}
    </div> // إغلاق حاوية الـ p-6 الرئيسية
  ); // نهاية الـ return
};

const StatCard = ({ title, value, icon, unit = 'ج.م', isCurrency = true }: any) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border flex items-center gap-4">
    <div className="p-3 bg-gray-50 rounded-lg">{icon}</div>
    <div>
      <p className="text-sm text-gray-500 font-medium">{title}</p>
      <p className="text-xl font-bold text-gray-900">
        {isCurrency ? value.toLocaleString() : value} 
        <span className="text-xs text-gray-400 mr-1">{unit}</span>
      </p>
    </div>
  </div>
);

export default CostClosingDashboard;