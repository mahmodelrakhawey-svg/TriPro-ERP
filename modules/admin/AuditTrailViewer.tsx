import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { TableSkeleton } from '../../components/TableSkeleton';
import { 
  ShieldCheck, 
  Search, 
  Filter, 
  RefreshCw, 
  Clock, 
  User, 
  FileText, 
  AlertTriangle,
  ArrowRight,
  Database
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
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableFilter, setTableFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  const fetchAuditLogs = async () => {
    setLoading(true);
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
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, [tableFilter, currentSelectedOrgId]);

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
    <div className="p-6 max-w-7xl mx-auto space-y-6" dir="rtl">
      {/* 🛡️ الترويسة والبطاقة التعريفية */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center text-white shadow-md shadow-indigo-100">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-800">
              سجل الرقابة والتدقيق الأمني الذاتي
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              تتبع غير قابل للتلاعب لكافة عمليات التعديل والحذف وتغييرات الأسعار والحسابات والإعدادات.
            </p>
          </div>
        </div>

        <button
          onClick={fetchAuditLogs}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-all active:scale-95 self-start md:self-auto"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>تحديث السجل</span>
        </button>
      </div>

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
        </div>
      </div>

      {/* 📊 جدول سجل الحركات */}
      {loading ? (
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
