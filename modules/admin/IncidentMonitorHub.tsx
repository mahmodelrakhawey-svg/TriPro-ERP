import React, { useState, useEffect, useMemo } from 'react';
import { 
  AlertOctagon, 
  RefreshCw, 
  Bell, 
  CheckCircle2, 
  Clock, 
  Search, 
  Smartphone, 
  Monitor, 
  WifiOff, 
  Send, 
  X, 
  Eye, 
  MessageSquare, 
  Zap,
  Layers
} from 'lucide-react';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import telemetryService, { TelemetryIncident, IncidentStatus, WebhookConfig } from '../../services/telemetryService';

export const IncidentMonitorHub: React.FC = () => {
  const { organization, currentUser } = useAccounting();
  const { showToast } = useToast();

  const [incidents, setIncidents] = useState<TelemetryIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<TelemetryIncident | null>(null);
  const [statusModalIncident, setStatusModalIncident] = useState<TelemetryIncident | null>(null);
  const [newStatus, setNewStatus] = useState<IncidentStatus>('investigating');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);

  // Webhook settings modal state
  const [showWebhookModal, setShowWebhookModal] = useState(false);
  const [webhookConfig, setWebhookConfig] = useState<WebhookConfig>({
    enabled: false,
    type: 'generic',
    url: '',
    telegramBotToken: '',
    telegramChatId: ''
  });
  const [testingWebhook, setTestingWebhook] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'FATAL' | 'CRITICAL' | 'WARNING' | 'INFO'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'investigating' | 'resolved'>('all');

  const [offlineQueueCount, setOfflineQueueCount] = useState(0);

  // Load incidents
  const loadIncidents = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      const orgId = currentUser?.role === 'super_admin' ? undefined : organization?.id;
      const data = await telemetryService.fetchIncidents({
        organizationId: orgId,
        status: statusFilter,
        severity: severityFilter,
        limit: 150
      });
      setIncidents(data);
      setOfflineQueueCount(telemetryService.getOfflineQueueCount());
    } catch {
      showToast('تعذر تحميل سجل الحوادث التقنية', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadIncidents();
    const config = telemetryService.getWebhookConfig();
    if (config) {
      setWebhookConfig(config);
    }
  }, [severityFilter, statusFilter, organization?.id]);

  // Flush offline buffer
  const handleFlushOfflineBuffer = async () => {
    try {
      const count = await telemetryService.flushOfflineBuffer();
      if (count > 0) {
        showToast(`تم تفريغ وبث ${count} حادثة كانت مخزنة في وضع عدم الاتصال ✅`, 'success');
        loadIncidents(true);
      } else {
        showToast('لا توجد حوادث معلقة في حافظة الأوفلاين.', 'info');
      }
      setOfflineQueueCount(telemetryService.getOfflineQueueCount());
    } catch {
      showToast('فشل في تفريغ حافظة الحوادث', 'error');
    }
  };

  // Change incident status
  const handleSaveStatus = async () => {
    if (!statusModalIncident) return;
    setSavingStatus(true);
    try {
      const success = await telemetryService.updateIncidentStatus(
        statusModalIncident.id,
        newStatus,
        resolutionNotes,
        currentUser?.id
      );

      if (success) {
        showToast('تم تحديث حالة الحادثة التشغيلية بنجاح ✅', 'success');
        setStatusModalIncident(null);
        setResolutionNotes('');
        loadIncidents(true);
      } else {
        showToast('فشل في تحديث الحادثة', 'error');
      }
    } catch {
      showToast('خطأ أثناء التحديث', 'error');
    } finally {
      setSavingStatus(false);
    }
  };

  // Save webhook config
  const handleSaveWebhookConfig = () => {
    telemetryService.setWebhookConfig(webhookConfig);
    showToast('تم حفظ إعدادات الإشعار الفوري بنجاح 🔔', 'success');
    setShowWebhookModal(false);
  };

  // Send test webhook
  const handleTestWebhook = async () => {
    setTestingWebhook(true);
    try {
      telemetryService.setWebhookConfig(webhookConfig);
      const testIncident = {
        severity: 'CRITICAL',
        module_name: 'TestDiagnostic',
        error_message: 'رسالة اختبار محرك التنبيه الفوري لمنظومة TriPro ERP',
        route_url: window.location.href,
        user_name: currentUser?.full_name || (currentUser as any)?.name || 'مدير النظام',
        branch_name: 'الفرع الرئيسي'
      };
      const ok = await telemetryService.dispatchInstantAlert(testIncident, `FP-TEST-${Date.now()}`);
      if (ok) {
        showToast('تم إرسال إشعار الاختبار بنجاح! راجع قناة التنبيهات لديك 🚀', 'success');
      } else {
        showToast('تعذر إرسال الإشعار. يرجى التحقق من صحة الرابط أو التوكن والمعرف.', 'error');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'خطأ غير معروف';
      showToast(`فشل الإرسال: ${msg}`, 'error');
    } finally {
      setTestingWebhook(false);
    }
  };

  // Statistics
  const stats = useMemo(() => {
    const total = incidents.length;
    const open = incidents.filter(i => i.status === 'open').length;
    const investigating = incidents.filter(i => i.status === 'investigating').length;
    const resolved = incidents.filter(i => i.status === 'resolved').length;
    const criticalFatal = incidents.filter(i => i.severity === 'FATAL' || i.severity === 'CRITICAL').length;
    return { total, open, investigating, resolved, criticalFatal };
  }, [incidents]);

  // Filtered incidents by search
  const filteredIncidents = useMemo(() => {
    if (!searchQuery.trim()) return incidents;
    const q = searchQuery.toLowerCase();
    return incidents.filter(i => 
      i.error_message?.toLowerCase().includes(q) ||
      i.error_fingerprint?.toLowerCase().includes(q) ||
      i.module_name?.toLowerCase().includes(q) ||
      i.user_name?.toLowerCase().includes(q) ||
      i.branch_name?.toLowerCase().includes(q) ||
      i.route_url?.toLowerCase().includes(q)
    );
  }, [incidents, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl border border-rose-100">
              <AlertOctagon size={26} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-800 tracking-tight">
                لوحة مراقبة الحوادث والأعطال (Incident Monitor Hub)
              </h1>
              <p className="text-sm font-semibold text-slate-500">
                رصد حي وميكروسكوبي لأخطاء الكاشيرات والفروع مع تنبيهات لحظية ودعم الأوفلاين
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          {offlineQueueCount > 0 && (
            <button
              onClick={handleFlushOfflineBuffer}
              className="flex items-center gap-2 px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-xs shadow-sm transition-all animate-pulse"
              title="تفريغ الحوادث المسجلة أثناء انقطاع الإنترنت"
            >
              <WifiOff size={15} />
              بث حوادث الأوفلاين ({offlineQueueCount})
            </button>
          )}

          <button
            onClick={() => setShowWebhookModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl font-bold text-sm border border-indigo-200 transition-colors"
          >
            <Bell size={16} />
            إعداد التنبيه الفوري (Webhook)
          </button>

          <button
            onClick={() => loadIncidents(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm transition-colors"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            تحديث
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">إجمالي الحوادث</span>
            <Layers size={18} className="text-slate-400" />
          </div>
          <div className="text-2xl font-black text-slate-800">{stats.total}</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-rose-200 bg-rose-50/30 shadow-sm">
          <div className="flex items-center justify-between text-rose-600 mb-2">
            <span className="text-xs font-bold">حوادث جديدة مفتوحة</span>
            <AlertOctagon size={18} className="text-rose-500" />
          </div>
          <div className="text-2xl font-black text-rose-600">{stats.open}</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-red-200 bg-red-50/20 shadow-sm">
          <div className="flex items-center justify-between text-red-700 mb-2">
            <span className="text-xs font-bold">أخطاء حرجة / قاتلة</span>
            <Zap size={18} className="text-red-600" />
          </div>
          <div className="text-2xl font-black text-red-600">{stats.criticalFatal}</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/30 shadow-sm">
          <div className="flex items-center justify-between text-amber-700 mb-2">
            <span className="text-xs font-bold">قيد الفحص والمتابعة</span>
            <Clock size={18} className="text-amber-500" />
          </div>
          <div className="text-2xl font-black text-amber-600">{stats.investigating}</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/30 shadow-sm">
          <div className="flex items-center justify-between text-emerald-700 mb-2">
            <span className="text-xs font-bold">تم حلها بنجاح</span>
            <CheckCircle2 size={18} className="text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-emerald-600">{stats.resolved}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative flex-1 w-full">
          <Search size={18} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="البحث بالرسالة، بصمة الخطأ (Fingerprint)، الشاشة، المستخدم..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pr-10 pl-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          {/* Severity selector */}
          <select
            value={severityFilter}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSeverityFilter(e.target.value as any)}
            className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
          >
            <option value="all">كل مستويات الخطورة</option>
            <option value="FATAL">FATAL (انهيار تام)</option>
            <option value="CRITICAL">CRITICAL (حرج)</option>
            <option value="WARNING">WARNING (تحذير)</option>
            <option value="INFO">INFO (معلومة)</option>
          </select>

          {/* Status selector */}
          <select
            value={statusFilter}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
          >
            <option value="all">كل الحالات</option>
            <option value="open">جديد (Open)</option>
            <option value="investigating">قيد الفحص (Investigating)</option>
            <option value="resolved">تم الحل (Resolved)</option>
          </select>
        </div>
      </div>

      {/* Incidents Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-20 text-center">
            <RefreshCw size={32} className="animate-spin text-rose-500 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-500">جاري تحميل سجلات الحوادث التقنية...</p>
          </div>
        ) : filteredIncidents.length === 0 ? (
          <div className="py-20 text-center">
            <CheckCircle2 size={48} className="text-emerald-500 mx-auto mb-3 opacity-80" />
            <h3 className="text-lg font-black text-slate-700">لا توجد حوادث تقنية مسجلة</h3>
            <p className="text-sm text-slate-400 mt-1">جميع نقاط البيع والفروع تعمل باستقرار تام وموثوقية 100% ✨</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-black text-slate-600">
                  <th className="py-3.5 px-4">مستوى الخطورة</th>
                  <th className="py-3.5 px-4">الموديول / الشاشة</th>
                  <th className="py-3.5 px-4">تفاصيل الخطأ والبصمة</th>
                  <th className="py-3.5 px-4">التكرار</th>
                  <th className="py-3.5 px-4">المستخدم والفرع</th>
                  <th className="py-3.5 px-4">آخر ظهور</th>
                  <th className="py-3.5 px-4">الحالة</th>
                  <th className="py-3.5 px-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredIncidents.map((incident) => {
                  const isFatal = incident.severity === 'FATAL';
                  const isCritical = incident.severity === 'CRITICAL';
                  const isWarning = incident.severity === 'WARNING';

                  const sevBadge = isFatal 
                    ? 'bg-red-600 text-white font-black' 
                    : isCritical 
                    ? 'bg-rose-100 text-rose-700 font-bold border border-rose-200' 
                    : isWarning 
                    ? 'bg-amber-100 text-amber-800 font-bold border border-amber-200' 
                    : 'bg-blue-100 text-blue-700 font-bold border border-blue-200';

                  const statusBadge = incident.status === 'resolved'
                    ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                    : incident.status === 'investigating'
                    ? 'bg-amber-100 text-amber-700 border-amber-200'
                    : 'bg-rose-100 text-rose-700 border-rose-200';

                  const statusLabel = incident.status === 'resolved'
                    ? 'تم الحل'
                    : incident.status === 'investigating'
                    ? 'قيد الفحص'
                    : 'جديد';

                  return (
                    <tr key={incident.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs ${sevBadge}`}>
                          {incident.severity}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-800 text-xs">
                          {incident.module_name}
                        </div>
                        {incident.route_url && (
                          <div className="text-[11px] text-slate-400 truncate max-w-[160px]" dir="ltr">
                            {incident.route_url.replace(/^https?:\/\/[^/]+/, '')}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 max-w-md">
                        <div className="font-semibold text-slate-800 text-xs line-clamp-2" title={incident.error_message}>
                          {incident.error_message}
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <code className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono font-bold">
                            {incident.error_fingerprint}
                          </code>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                          {incident.occurrence_count || 1} مرة
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="text-xs font-bold text-slate-700">
                          {incident.user_name || 'غير محدد'}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {incident.branch_name || 'الفرع الرئيسي'}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-xs text-slate-500 whitespace-nowrap">
                        {incident.last_seen_at ? new Date(incident.last_seen_at).toLocaleString('ar-EG', {
                          month: 'numeric',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        }) : '-'}
                      </td>

                      <td className="py-3.5 px-4">
                        <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-bold border ${statusBadge}`}>
                          {statusLabel}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setSelectedIncident(incident)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
                            title="عرض تفاصيل الـ Stack Trace"
                          >
                            <Eye size={16} />
                          </button>

                          <button
                            onClick={() => {
                              setStatusModalIncident(incident);
                              setNewStatus(incident.status);
                              setResolutionNotes(incident.resolution_notes || '');
                            }}
                            className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors"
                            title="تعديل الحالة وكتابة ملاحظات"
                          >
                            <MessageSquare size={16} />
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

      {/* Incident Details Modal */}
      {selectedIncident && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <AlertOctagon size={20} className="text-rose-600" />
                <h3 className="font-black text-slate-800 text-lg">
                  تفاصيل الحادثة التشغيلية ({selectedIncident.error_fingerprint})
                </h3>
              </div>
              <button 
                onClick={() => setSelectedIncident(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-right">
              {/* Message */}
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">رسالة الخطأ الرئيسية</label>
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl font-mono text-sm font-bold">
                  {selectedIncident.error_message}
                </div>
              </div>

              {/* Meta Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-400 block mb-1">الموديول:</span>
                  <span className="font-bold text-slate-800">{selectedIncident.module_name}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-400 block mb-1">عدد مرات الظهور:</span>
                  <span className="font-bold text-slate-800">{selectedIncident.occurrence_count} مرات</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-400 block mb-1">أول رصد:</span>
                  <span className="font-bold text-slate-800">{new Date(selectedIncident.first_seen_at).toLocaleTimeString('ar-EG')}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-400 block mb-1">آخر رصد:</span>
                  <span className="font-bold text-slate-800">{new Date(selectedIncident.last_seen_at).toLocaleTimeString('ar-EG')}</span>
                </div>
              </div>

              {/* Stack Trace */}
              {selectedIncident.error_stack && (
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">مسار الخطأ البرمجي (Stack Trace)</label>
                  <pre 
                    className="p-4 bg-slate-900 text-slate-100 rounded-xl text-xs font-mono overflow-x-auto max-h-56 leading-relaxed" 
                    dir="ltr"
                  >
                    {selectedIncident.error_stack}
                  </pre>
                </div>
              )}

              {/* Component Stack */}
              {selectedIncident.component_stack && (
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">شجرة المكونات (Component Stack)</label>
                  <pre 
                    className="p-4 bg-slate-800 text-slate-200 rounded-xl text-xs font-mono overflow-x-auto max-h-40 leading-relaxed" 
                    dir="ltr"
                  >
                    {selectedIncident.component_stack}
                  </pre>
                </div>
              )}

              {/* Device and Environment */}
              {selectedIncident.device_info && (
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">معلومات الجهاز والمتصفح</label>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1 font-mono" dir="ltr">
                    <div>User Agent: {String((selectedIncident.device_info as any)?.userAgent || 'N/A')}</div>
                    <div>Platform: {String((selectedIncident.device_info as any)?.platform || 'N/A')}</div>
                    <div>Resolution: {String((selectedIncident.device_info as any)?.screenResolution || 'N/A')}</div>
                  </div>
                </div>
              )}

              {/* Notes */}
              {selectedIncident.resolution_notes && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs">
                  <span className="font-bold text-emerald-800 block mb-1">ملاحظات المطور والمعالجة:</span>
                  <p className="text-emerald-900 leading-relaxed">{selectedIncident.resolution_notes}</p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 flex justify-end bg-slate-50">
              <button
                onClick={() => setSelectedIncident(null)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold text-sm transition-colors"
              >
                إغلاق النافذة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Update Modal */}
      {statusModalIncident && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="font-black text-slate-800 text-base">تحديث حالة الحادثة التشغيلية</h3>
              <button 
                onClick={() => setStatusModalIncident(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 text-right">
              <div>
                <label className="text-xs font-bold text-slate-600 mb-2 block">حالة المشكلة</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewStatus('open')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-colors ${
                      newStatus === 'open' 
                        ? 'bg-rose-50 border-rose-500 text-rose-700' 
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    جديد (Open)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewStatus('investigating')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-colors ${
                      newStatus === 'investigating' 
                        ? 'bg-amber-50 border-amber-500 text-amber-700' 
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    قيد الفحص
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewStatus('resolved')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-colors ${
                      newStatus === 'resolved' 
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-700' 
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    تم الحل ✅
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 mb-1 block">ملاحظات الحل والمعالجة الفنية</label>
                <textarea
                  rows={3}
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="اكتب ملاحظات التدخل، سبب الخطأ، أو تحديث النسخة..."
                  className="w-full p-3 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 flex justify-end gap-2 bg-slate-50">
              <button
                type="button"
                onClick={() => setStatusModalIncident(null)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-xl font-bold text-xs transition-colors"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={savingStatus}
                onClick={handleSaveStatus}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs transition-colors shadow-sm disabled:opacity-50"
              >
                {savingStatus ? 'جاري الحفظ...' : 'حفظ التحديث'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Webhook Configuration Modal */}
      {showWebhookModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Bell size={20} className="text-indigo-600" />
                <h3 className="font-black text-slate-800 text-base">إعدادات الإشعار والتنبيه الفوري (Alert Webhook)</h3>
              </div>
              <button 
                onClick={() => setShowWebhookModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 text-right">
              <div className="flex items-center justify-between p-3.5 bg-indigo-50/50 border border-indigo-100 rounded-xl">
                <div>
                  <span className="font-bold text-indigo-900 text-sm block">تفعيل التنبيه اللحظي الفوري</span>
                  <span className="text-xs text-indigo-700">إرسال إشعار فوري عند وقوع أخطاء FATAL أو CRITICAL</span>
                </div>
                <input
                  type="checkbox"
                  checked={webhookConfig.enabled || false}
                  onChange={(e) => setWebhookConfig({ ...webhookConfig, enabled: e.target.checked })}
                  className="w-5 h-5 accent-indigo-600 rounded cursor-pointer"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 mb-1 block">نوع وسيلة التنبيه</label>
                <select
                  value={webhookConfig.type || 'generic'}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setWebhookConfig({ ...webhookConfig, type: e.target.value as WebhookConfig['type'] })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="generic">Custom Webhook (JSON POST)</option>
                  <option value="telegram">Telegram Bot</option>
                  <option value="slack">Slack Incoming Webhook</option>
                  <option value="discord">Discord Webhook</option>
                </select>
              </div>

              {webhookConfig.type === 'telegram' ? (
                <>
                  <div>
                    <label className="text-xs font-bold text-slate-600 mb-1 block">Telegram Bot Token</label>
                    <input
                      type="text"
                      placeholder="e.g. 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                      value={webhookConfig.telegramBotToken || ''}
                      onChange={(e) => setWebhookConfig({ ...webhookConfig, telegramBotToken: e.target.value })}
                      className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600 mb-1 block">Telegram Chat / Group ID</label>
                    <input
                      type="text"
                      placeholder="e.g. -100123456789 or 987654321"
                      value={webhookConfig.telegramChatId || ''}
                      onChange={(e) => setWebhookConfig({ ...webhookConfig, telegramChatId: e.target.value })}
                      className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      dir="ltr"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 block">رابط الويب هوك (Webhook URL)</label>
                  <input
                    type="url"
                    placeholder="https://hooks.slack.com/services/... or https://your-server/webhook"
                    value={webhookConfig.url || ''}
                    onChange={(e) => setWebhookConfig({ ...webhookConfig, url: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    dir="ltr"
                  />
                </div>
              )}

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-500 leading-relaxed">
                🛡️ <strong>حماية ضد الإغراق (Throttling):</strong> لن يتم إرسال أكثر من تنبيه واحد لكل نوع خطأ خلال نافذة 15 دقيقة لمنع استهلاك البريد أو قنوات التواصل في حال تكرار الخطأ من الكاشير.
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 flex items-center justify-between bg-slate-50">
              <button
                type="button"
                disabled={testingWebhook || (!webhookConfig.url && (!webhookConfig.telegramBotToken || !webhookConfig.telegramChatId))}
                onClick={handleTestWebhook}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold text-xs transition-colors disabled:opacity-40"
              >
                <Send size={13} />
                {testingWebhook ? 'جاري الإرسال...' : 'إرسال إشعار تجريبي'}
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowWebhookModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-xl font-bold text-xs transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleSaveWebhookConfig}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs transition-colors shadow-sm"
                >
                  حفظ الإعدادات
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IncidentMonitorHub;
