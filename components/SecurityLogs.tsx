import React, { useState, useEffect } from 'react';
import { useAccounting } from '../context/AccountingContext';
import { supabase } from '../supabaseClient';
import { ShieldAlert, Search, Activity, Loader2, RefreshCw, Filter, Download, Calendar } from 'lucide-react';
import * as XLSX from 'xlsx';

type SecurityLog = {
  id: string;
  created_at: string;
  event_type: string;
  description: string;
  performed_by: string | null;
  performer_name?: string;
  metadata?: any;
};

const SecurityLogs = () => {
  const { currentUser } = useAccounting();
  const [logs, setLogs] = useState<SecurityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [usersList, setUsersList] = useState<{id: string, name: string}[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  // Fetch Users for Filter
  useEffect(() => {
      const fetchUsers = async () => {
          const { data } = await supabase.from('profiles').select('id, full_name');
          if (data) {
              setUsersList(data.map(u => ({ id: u.id, name: u.full_name || 'مستخدم' })));
          }
      };
      fetchUsers();
  }, []);

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      if (currentUser?.role === 'demo') {
          setLogs([
              { id: '1', created_at: new Date().toISOString(), event_type: 'تسجيل دخول', description: 'تم تسجيل الدخول بنجاح', performed_by: 'demo', performer_name: 'مستخدم ديمو' },
              { id: '2', created_at: new Date().toISOString(), event_type: 'إضافة فاتورة', description: 'تم إضافة فاتورة مبيعات جديدة', performed_by: 'demo', performer_name: 'مستخدم ديمو' }
          ]);
          setLoading(false);
          return;
      }

      try {
        let query = supabase
          .from('security_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(500);

        if (searchTerm) {
          query = query.or(`description.ilike.%${searchTerm}%,event_type.ilike.%${searchTerm}%`);
        }

        if (selectedUser) {
            query = query.eq('performed_by', selectedUser);
        }

        if (startDate) {
            query = query.gte('created_at', `${startDate}T00:00:00`);
        }
        if (endDate) {
            query = query.lte('created_at', `${endDate}T23:59:59`);
        }

        const { data: logsData, error } = await query;

        if (error) throw error;

        if (logsData) {
            // جلب أسماء المستخدمين يدوياً لضمان ظهورها
            const userIds = [...new Set(logsData.map(l => l.performed_by).filter(Boolean))];
            
            let profilesMap: Record<string, string> = {};
            if (userIds.length > 0) {
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, full_name')
                    .in('id', userIds as string[]);
                
                profiles?.forEach(p => {
                    profilesMap[p.id] = p.full_name || 'مستخدم';
                });
            }

            const logsWithNames = logsData.map(log => ({
                ...log,
                performer_name: log.performed_by ? (profilesMap[log.performed_by] || 'مستخدم محذوف') : 'النظام / المدير العام'
            }));
            
            setLogs(logsWithNames);
        }
      } catch (err) {
        console.error('Error fetching logs:', err);
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(() => {
        fetchLogs();
    }, 500); // Debounce search

    return () => clearTimeout(timer);
  }, [searchTerm, selectedUser, refreshKey, startDate, endDate]);

  const exportToExcel = () => {
      const data = logs.map(log => ({
          'الحدث': log.event_type,
          'المستخدم': log.performer_name,
          'التفاصيل': log.description,
          'التاريخ': new Date(log.created_at).toLocaleString('ar-EG')
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Security Logs");
      XLSX.writeFile(wb, `Security_Logs_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto animate-in fade-in">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <ShieldAlert className="text-red-600" /> سجلات الأمان والنشاط
          </h1>
          <p className="text-slate-500 mt-1">مراقبة جميع العمليات الحساسة في النظام</p>
        </div>
        
        <div className="flex flex-wrap gap-2 w-full md:w-auto items-center">
            <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-lg px-3 py-2 shadow-sm">
                <Calendar size={16} className="text-slate-400" />
                <input 
                    type="date" 
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="text-sm border-none outline-none bg-transparent text-slate-600 font-medium w-28"
                />
                <span className="text-slate-300">|</span>
                <input 
                    type="date" 
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="text-sm border-none outline-none bg-transparent text-slate-600 font-medium w-28"
                />
            </div>

            <div className="relative flex-1 md:w-64">
                <Search className="absolute right-3 top-2.5 text-slate-400" size={20} />
                <input 
                    type="text" 
                    placeholder="بحث..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pr-10 pl-4 py-2 rounded-lg border border-slate-300 focus:outline-none focus:border-indigo-500"
                />
            </div>
            
            <div className="relative">
                <Filter className="absolute right-3 top-2.5 text-slate-400 pointer-events-none" size={18} />
                <select 
                    value={selectedUser}
                    onChange={(e) => setSelectedUser(e.target.value)}
                    className="appearance-none pr-10 pl-8 py-2 rounded-lg border border-slate-300 focus:outline-none focus:border-indigo-500 bg-white text-slate-700"
                >
                    <option value="">كل المستخدمين</option>
                    {usersList.map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                </select>
            </div>

            <button 
                onClick={exportToExcel}
                className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2 font-bold shadow-sm"
                title="تصدير Excel"
            >
                <Download size={18} />
                <span className="hidden md:inline">تصدير</span>
            </button>

            <button 
                onClick={() => setRefreshKey(k => k + 1)}
                className="bg-white p-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
                title="تحديث"
            >
                <RefreshCw size={20} />
            </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
            <div className="p-12 text-center flex flex-col items-center justify-center text-slate-500">
                <Loader2 className="animate-spin mb-2" size={32} />
                <p>جاري تحميل السجلات...</p>
            </div>
        ) : logs.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
                <Activity size={48} className="mx-auto mb-4 text-slate-300" />
                <p className="text-lg font-medium">لا توجد سجلات مطابقة</p>
                <p className="text-sm">لم يتم العثور على أي نشاط يطابق بحثك.</p>
            </div>
        ) : (
            <div className="overflow-x-auto">
                <table className="w-full text-right">
                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-black">
                        <tr>
                            <th className="px-6 py-4">الحدث / العملية</th>
                            <th className="px-6 py-4">المستخدم</th>
                            <th className="px-6 py-4">التفاصيل</th>
                            <th className="px-6 py-4">التاريخ والوقت</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {logs.map((log) => (
                            <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-6 py-4">
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                        <Activity size={12} />
                                        {log.event_type}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs">
                                            {log.performer_name?.charAt(0)}
                                        </div>
                                        <span className="font-medium text-slate-700">{log.performer_name}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-slate-600 text-sm">
                                    {log.description}
                                    {log.metadata && (
                                        <div className="mt-2 text-xs bg-slate-50 p-2 rounded border border-slate-100 font-mono dir-ltr text-left overflow-x-auto">
                                            {log.metadata.oldValue !== undefined && (
                                                <div className="text-red-600 mb-1">Old: {String(log.metadata.oldValue)}</div>
                                            )}
                                            {log.metadata.newValue !== undefined && (
                                                <div className="text-emerald-600 mb-1">New: {String(log.metadata.newValue)}</div>
                                            )}
                                            {log.metadata.changes && (
                                                <div className="space-y-1">
                                                    {Object.entries(log.metadata.changes).map(([key, val]: [string, any]) => (
                                                        <div key={key} className="flex gap-2 items-center">
                                                            <span className="font-bold text-slate-600">{key}:</span>
                                                            <span className="text-red-500 line-through">{String(val?.from ?? '')}</span>
                                                            <span className="text-slate-400">→</span>
                                                            <span className="text-emerald-600 font-bold">{String(val?.to ?? '')}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-slate-500 text-xs font-mono" dir="ltr">
                                    {new Date(log.created_at).toLocaleString('ar-EG')}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
      </div>
    </div>
  );
};

export default SecurityLogs;
