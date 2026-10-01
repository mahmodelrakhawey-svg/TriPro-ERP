import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { TableSkeleton } from '../../components/TableSkeleton';
import { auditDaemonService, SystemAuditReport } from '../../services/auditDaemonService';
import { 
  ShieldCheck, 
  Search, 
  Filter, 
  RefreshCw, 
  Clock, 
  User, 
  Scale,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Database,
  Users,
  Truck,
  Boxes,
  Wrench,
  Info
} from 'lucide-react';

interface AuditLogEntry {
  id: string;
  table_name: string;
  record_id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  old_data: Record<string, any> | null;
  new_data: Record<string, any> | null;
  changed_fields: string[] | null;
  user_email: string | null;
  created_at: string;
}

const TABLE_LABELS: Record<string, string> = {
  products: '📦 الأصناف والمنتجات',
  customers: '👥 العملاء',
  accounts: '🏛️ دليل الحسابات',
  company_settings: '⚙️ إعدادات الشركة',
};

export const AuditTrailViewer: React.FC = () => {
  const { currentSelectedOrgId } = useAccounting();
  const [activeTab, setActiveTab] = useState<'logs' | 'integrity'>('logs');

  // Logs state
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [tableFilter, setTableFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  // Financial Integrity state
  const [auditReport, setAuditReport] = useState<SystemAuditReport | null>(null);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconcileFeedback, setReconcileFeedback] = useState<string | null>(null);

  const fetchAuditLogs = async () => {
    setLoadingLogs(true);
    try {
      // المحاولة الأولى: عبر RPC المشدد
      const { data, error } = await supabase.rpc('get_audit_logs_rpc', {
        p_table_name: tableFilter === 'all' ? null : tableFilter,
        p_limit: 100,
        p_offset: 0
      });

      if (!error && data?.success && Array.isArray(data.logs)) {
        setLogs(data.logs);
        return;
      }

      // المحاولة الاحتياطية المباشرة
      let query = supabase
        .from('system_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (tableFilter !== 'all') {
        query = query.eq('table_name', tableFilter);
      }

      const { data: directData } = await query;
      setLogs((directData as AuditLogEntry[]) || []);
    } catch (err) {
      console.warn('[AuditTrail] Fetch error:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  const runFinancialAudit = async () => {
    if (!currentSelectedOrgId) return;
    setLoadingAudit(true);
    try {
      const report = await auditDaemonService.runSystemAudit(currentSelectedOrgId);
      setAuditReport(report);
    } catch (err) {
      console.error('[AuditTrail] Financial audit error:', err);
    } finally {
      setLoadingAudit(false);
    }
  };

  const handleReconcileBalances = async () => {
    if (!currentSelectedOrgId || isReconciling) return;
    setIsReconciling(true);
    setReconcileFeedback(null);
    try {
      const res = await auditDaemonService.triggerAutoReconciliation(currentSelectedOrgId);
      setReconcileFeedback(res.message);
      // إعادة فحص الأركان بعد التسوية
      await runFinancialAudit();
    } catch (err) {
      setReconcileFeedback(err?.message || 'تعذرت عملية إعادة التسوية.');
    } finally {
      setIsReconciling(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'logs') {
      fetchAuditLogs();
    } else if (activeTab === 'integrity') {
      runFinancialAudit();
    }
  }, [tableFilter, currentSelectedOrgId, activeTab]);

  const filteredLogs = logs.filter(log => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      log.user_email?.toLowerCase().includes(term) ||
      log.record_id.toLowerCase().includes(term) ||
      log.table_name.toLowerCase().includes(term)
    );
  });

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6" dir="rtl">
      {/* 🛡️ الترويسة والبطاقة التعريفية */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center text-white shadow-md shadow-indigo-100 shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-800">
              مركز الرقابة والحوكمة والتدقيق المالي
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              تتبع غير قابل للتلاعب لكافة عمليات التعديل، وفحص آلي للأركان المحاسبية الأربعة لضمان سلامة بيانات الشركة.
            </p>
          </div>
        </div>

        {/* أزرار التبويب الرئيسية */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl self-start md:self-auto shrink-0">
          <button
            onClick={() => setActiveTab('logs')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-bold text-xs transition-all ${
              activeTab === 'logs'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShieldCheck size={14} />
            <span>سجل الحركات والتعديلات</span>
          </button>

          <button
            onClick={() => setActiveTab('integrity')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-bold text-xs transition-all ${
              activeTab === 'integrity'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Scale size={14} />
            <span>سلامة الأركان المالية الأربعة</span>
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 📋 التبويب الأول: سجل حركات التدقيق الأمني (Audit Trail Logs) */}
      {/* ============================================================== */}
      {activeTab === 'logs' && (
        <div className="space-y-4">
          {/* 🔍 شريط الفلاتر والبحث */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="بحث بريد المستخدم، رقم السجل، أو الجدول..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-9 pl-4 py-2 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
              />
              <Search size={15} className="absolute right-3 top-2.5 text-slate-400" />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter size={15} className="text-slate-400 shrink-0" />
              <select
                value={tableFilter}
                onChange={(e) => setTableFilter(e.target.value)}
                className="w-full sm:w-48 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-indigo-500"
              >
                <option value="all">كافة الجداول</option>
                <option value="products">الأصناف والأسعار</option>
                <option value="customers">العملاء والمديونيات</option>
                <option value="accounts">دليل الحسابات</option>
                <option value="company_settings">إعدادات الشركة</option>
              </select>

              <button
                onClick={fetchAuditLogs}
                disabled={loadingLogs}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-all active:scale-95 shrink-0"
                title="تحديث"
              >
                <RefreshCw size={14} className={loadingLogs ? 'animate-spin' : ''} />
                <span className="hidden sm:inline">تحديث</span>
              </button>
            </div>
          </div>

          {/* 📊 جدول سجل الحركات */}
          {loadingLogs ? (
            <TableSkeleton rows={8} columns={5} />
          ) : filteredLogs.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200">
              <ShieldCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-slate-700">لا توجد حركات تدقيق مسجلة حتى الآن</h3>
              <p className="text-xs text-slate-400 mt-1">أي تعديل يطرأ على الأصناف أو العملاء أو الحسابات سيظهر هنا تلقائياً.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-black">
                    <tr>
                      <th className="p-4">نوع الحركة</th>
                      <th className="p-4">الجدول / الكيان</th>
                      <th className="p-4">الحقول المعدلة</th>
                      <th className="p-4">المستخدم</th>
                      <th className="p-4">التوقيت</th>
                      <th className="p-4 text-center">التفاصيل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {filteredLogs.map(log => {
                      const actionBg = 
                        log.action === 'UPDATE' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                        log.action === 'DELETE' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                        'bg-emerald-50 text-emerald-700 border-emerald-200';

                      const actionText = 
                        log.action === 'UPDATE' ? 'تعديل ✏️' :
                        log.action === 'DELETE' ? 'حذف 🗑️' : 'إضافة ➕';

                      return (
                        <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-4">
                            <span className={`inline-flex px-2.5 py-1 rounded-lg text-[10px] font-black border ${actionBg}`}>
                              {actionText}
                            </span>
                          </td>
                          <td className="p-4 font-bold text-slate-800">
                            {TABLE_LABELS[log.table_name] || log.table_name}
                          </td>
                          <td className="p-4 text-slate-600">
                            {log.changed_fields && log.changed_fields.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {log.changed_fields.map((f, i) => (
                                  <span key={i} className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px]">
                                    {f}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[10px]">-</span>
                            )}
                          </td>
                          <td className="p-4 text-slate-600">
                            <div className="flex items-center gap-1.5">
                              <User size={12} className="text-slate-400" />
                              <span className="truncate max-w-[150px]">{log.user_email || 'مدير النظام'}</span>
                            </div>
                          </td>
                          <td className="p-4 text-slate-500 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <Clock size={12} className="text-slate-400" />
                              <span>{new Date(log.created_at).toLocaleString('ar-EG')}</span>
                            </div>
                          </td>
                          <td className="p-4 text-center">
                            <button
                              onClick={() => setSelectedLog(log)}
                              className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold transition-all"
                            >
                              معاينة
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================================= */}
      {/* ⚖️ التبويب الثاني: فحص سلامة الأركان المالية الأربعة (Financial Integrity) */}
      {/* ======================================================================= */}
      {activeTab === 'integrity' && (
        <div className="space-y-6">
          {/* شريط الإجراءات وحالة التدقيق العامة */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {loadingAudit ? (
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center animate-spin">
                  <RefreshCw size={20} className="text-indigo-600" />
                </div>
              ) : auditReport?.overallStatus === 'passed' ? (
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 size={24} />
                </div>
              ) : auditReport?.overallStatus === 'warning' ? (
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
                  <AlertTriangle size={24} />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
                  <XCircle size={24} />
                </div>
              )}

              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-black text-slate-800">
                    {loadingAudit
                      ? 'جارٍ فحص سلامة وتطابق الأركان الأربعة...'
                      : auditReport?.overallStatus === 'passed'
                      ? 'المنظومة المالية متوازنة بنسبة 100%'
                      : auditReport?.overallStatus === 'warning'
                      ? 'توجد تنبيهات وفروقات طفيفة تحتاج إلى مراجعة'
                      : 'تحذير مالي: يوجد عدم توازن في الأستاذ العام'}
                  </h2>
                  {auditReport && (
                    <span className={`text-[11px] font-black px-2.5 py-0.5 rounded-full ${
                      auditReport.overallStatus === 'passed' ? 'bg-emerald-100 text-emerald-800' :
                      auditReport.overallStatus === 'warning' ? 'bg-amber-100 text-amber-800' :
                      'bg-rose-100 text-rose-800'
                    }`}>
                      {auditReport.summary.passedCount} من {auditReport.summary.totalChecks} أركان سليمة
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                  <Clock size={12} />
                  <span>
                    آخر فحص:{' '}
                    {auditReport?.timestamp
                      ? new Date(auditReport.timestamp).toLocaleString('ar-EG')
                      : 'لم يتم الفحص بعد'}
                  </span>
                </p>
              </div>
            </div>

            {/* أزرار العمليات */}
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <button
                onClick={runFinancialAudit}
                disabled={loadingAudit}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-50"
              >
                <RefreshCw size={14} className={loadingAudit ? 'animate-spin' : ''} />
                <span>إعادة الفحص الآن</span>
              </button>

              <button
                onClick={handleReconcileBalances}
                disabled={isReconciling}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-100 transition-all active:scale-95 disabled:opacity-50"
              >
                <Wrench size={14} className={isReconciling ? 'animate-spin' : ''} />
                <span>{isReconciling ? 'جارٍ إعادة الحساب...' : 'إعادة تسوية كافة الأرصدة آلياً'}</span>
              </button>
            </div>
          </div>

          {/* تنبيه نتيجة إعادة التسوية */}
          {reconcileFeedback && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl text-xs font-bold flex items-center justify-between animate-fadeIn">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                <span>{reconcileFeedback}</span>
              </div>
              <button onClick={() => setReconcileFeedback(null)} className="text-emerald-600 hover:text-emerald-800 text-sm">✕</button>
            </div>
          )}

          {/* 🏛️ بطاقات الأركان الأربعة */}
          {loadingAudit ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="bg-white rounded-2xl p-5 border border-slate-200 animate-pulse space-y-3">
                  <div className="h-5 bg-slate-200 rounded w-1/2"></div>
                  <div className="h-8 bg-slate-100 rounded"></div>
                  <div className="h-4 bg-slate-100 rounded w-3/4"></div>
                </div>
              ))}
            </div>
          ) : auditReport?.checks && auditReport.checks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {auditReport.checks.map(check => {
                const isPassed = check.status === 'passed';
                const isFailed = check.status === 'failed';
                
                const cardBorder = isPassed 
                  ? 'border-emerald-200 bg-white' 
                  : isFailed 
                    ? 'border-rose-300 bg-rose-50/20' 
                    : 'border-amber-300 bg-amber-50/20';

                const statusBadge = isPassed ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                    <CheckCircle2 size={12} /> متطابق
                  </span>
                ) : isFailed ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-md">
                    <XCircle size={12} /> غير متوازن
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">
                    <AlertTriangle size={12} /> فارق طفيف
                  </span>
                );

                const getIcon = () => {
                  switch (check.pillar) {
                    case 'gl_balance':
                      return <Scale className="text-indigo-600 w-5 h-5" />;
                    case 'ar_subledger':
                      return <Users className="text-blue-600 w-5 h-5" />;
                    case 'ap_subledger':
                      return <Truck className="text-amber-600 w-5 h-5" />;
                    case 'inventory_valuation':
                      return <Boxes className="text-teal-600 w-5 h-5" />;
                  }
                };

                return (
                  <div
                    key={check.id}
                    className={`rounded-2xl p-5 border shadow-sm transition-all hover:shadow-md ${cardBorder}`}
                  >
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-slate-100">
                          {getIcon()}
                        </div>
                        <h3 className="font-black text-sm text-slate-800">
                          {check.title}
                        </h3>
                      </div>
                      {statusBadge}
                    </div>

                    <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-xl mb-3 text-center">
                      <div>
                        <span className="text-[10px] text-slate-500 block mb-0.5">
                          {check.pillar === 'gl_balance' ? 'إجمالي المدين' : 'رصيد المساعد'}
                        </span>
                        <span className="font-mono text-xs font-black text-slate-700">
                          {check.expected.toLocaleString()} ج.م
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-500 block mb-0.5">
                          {check.pillar === 'gl_balance' ? 'إجمالي الدائن' : 'حساب المراقبة'}
                        </span>
                        <span className="font-mono text-xs font-black text-slate-700">
                          {check.actual.toLocaleString()} ج.م
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-500 block mb-0.5">الفارق المحاسبي</span>
                        <span className={`font-mono text-xs font-black ${check.variance > 0.05 ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {check.variance.toLocaleString()} ج.م
                        </span>
                      </div>
                    </div>

                    <div className="text-xs text-slate-600 flex items-start gap-2 bg-white/60 p-2.5 rounded-lg border border-slate-100">
                      <Info size={14} className="text-slate-400 shrink-0 mt-0.5" />
                      <span>{check.notes}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200">
              <Scale className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-slate-700">اضغط على "إعادة الفحص الآن" لبدء التدقيق</h3>
            </div>
          )}

          {/* ℹ️ بطاقة توعوية لمعايير الحوكمة المالية */}
          <div className="bg-gradient-to-br from-indigo-50/70 to-purple-50/70 rounded-2xl p-5 border border-indigo-100 space-y-3">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-indigo-600" />
              <h4 className="font-black text-xs text-indigo-900">
                كيف يحمي محرك TriPro-ERP الأركان الأربعة الكبرى للنظام المالي؟
              </h4>
            </div>
            <ul className="text-xs text-slate-600 space-y-1.5 list-disc list-inside leading-relaxed">
              <li>
                <strong>توازن الأستاذ العام:</strong> يمنع النظام ترحيل أي قيد غير متوازن ذرياً على مستوى قاعدة البيانات PostgreSQL.
              </li>
              <li>
                <strong>مطابقة سجلات العملاء والموردين:</strong> ترتبط الفواتير والسندات مباشرة بحسابات المراقبة (1241 و 2211) لضمان انعدام الانحراف.
              </li>
              <li>
                <strong>تقييم المخزون المادي:</strong> يتم احتساب قيمة المخزون الدفتري في المستودعات (الكمية × التكلفة المتوسطة) ومطابقتها بحساب مخزون البضائع (1030).
              </li>
              <li>
                <strong>حارس التدقيق الليلي (Audit Daemon):</strong> يعمل آلياً في الخلفية لفحص أي انحرافات وإخطار الإدارة المالية فور حدوثها.
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* 🔍 نافذة تفاصيل الحركة والفرق (Diff Modal) */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedLog(null)}>
          <div 
            className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[85vh] overflow-y-auto space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="font-black text-slate-800 text-base">
                تفاصيل حركة التدقيق: {TABLE_LABELS[selectedLog.table_name] || selectedLog.table_name}
              </h3>
              <button 
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-slate-600 p-1 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-xl">
              <div><span className="text-slate-400">رقم السجل:</span> <span className="font-mono text-slate-700">{selectedLog.record_id}</span></div>
              <div><span className="text-slate-400">بواسطة:</span> <span className="font-bold text-slate-700">{selectedLog.user_email || 'النظام'}</span></div>
              <div><span className="text-slate-400">التاريخ:</span> <span className="font-bold text-slate-700">{new Date(selectedLog.created_at).toLocaleString('ar-EG')}</span></div>
              <div><span className="text-slate-400">العملية:</span> <span className="font-bold text-slate-700">{selectedLog.action}</span></div>
            </div>

            {selectedLog.old_data && (
              <div>
                <h4 className="text-xs font-black text-rose-700 mb-1">البيانات السابقة (قبل التعديل):</h4>
                <pre className="bg-rose-50/60 p-3 rounded-xl text-[11px] text-slate-700 font-mono overflow-x-auto max-h-48 border border-rose-100">
                  {JSON.stringify(selectedLog.old_data, null, 2)}
                </pre>
              </div>
            )}

            {selectedLog.new_data && (
              <div>
                <h4 className="text-xs font-black text-emerald-700 mb-1">البيانات الجديدة (بعد التعديل):</h4>
                <pre className="bg-emerald-50/60 p-3 rounded-xl text-[11px] text-slate-700 font-mono overflow-x-auto max-h-48 border border-emerald-100">
                  {JSON.stringify(selectedLog.new_data, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditTrailViewer;
