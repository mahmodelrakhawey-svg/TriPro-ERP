import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { 
  ShieldAlert, Search, Activity, Loader2, RefreshCw, Filter, Download, 
  Calendar, AlertCircle, AlertTriangle, Info, CheckCircle2, User, 
  FileText, Clock, ArrowRight, Eye, ChevronDown, ChevronUp, Layers,
  Lock, TrendingUp, Sparkles, UserCheck
} from 'lucide-react';
import * as XLSX from 'xlsx';

type SecurityLog = {
  id: string;
  created_at: string;
  event_type: string;
  description: string;
  severity: 'critical' | 'warning' | 'info';
  module: string;
  performed_by: string | null;
  performer_name: string;
  performer_role?: string;
  metadata?: any;
};

const moduleLabels: Record<string, string> = {
  all: 'كافة الموديولات',
  general: 'عام / النظام',
  sales: 'المبيعات والعملاء',
  purchases: 'المشتريات والموردين',
  inventory: 'المخازن والأصناف',
  treasury: 'الخزينة والشيكات',
  accounting: 'المحاسبة والقيود',
  restaurant: 'نقاط البيع والمطاعم',
  pos: 'نقاط البيع (POS)',
  hr: 'الموارد البشرية والرواتب',
  hims: 'المنظومة الطبية والمستشفيات',
  admin: 'إدارة النظام والأمان'
};

// دالة ذكية لتصنيف الأحداث التاريخية والجديدة بدقة
const inferLogMeta = (rawLog: any): { severity: 'critical' | 'warning' | 'info'; module: string } => {
  let severity = rawLog.severity;
  let module = rawLog.module;
  const evt = (rawLog.event_type || '').toLowerCase();
  const desc = (rawLog.description || '').toLowerCase();

  // 1. تحديد الموديول إن لم يكن مسجلاً
  if (!module || module === 'general') {
    if (evt.includes('medical') || evt.includes('blood') || evt.includes('patient') || evt.includes('doctor') || evt.includes('clinic') || evt.includes('hims') || evt.includes('surgery') || evt.includes('prescription') || desc.includes('مريض') || desc.includes('طبي') || desc.includes('زيارة') || desc.includes('دم')) {
      module = 'hims';
    } else if (evt.includes('invoice') || evt.includes('sales') || evt.includes('customer') || evt.includes('price') || desc.includes('فاتورة مبيعات') || desc.includes('عميل') || desc.includes('سعر بيع')) {
      module = 'sales';
    } else if (evt.includes('purchase') || evt.includes('supplier') || desc.includes('مشتريات') || desc.includes('مورد')) {
      module = 'purchases';
    } else if (evt.includes('journal') || evt.includes('account') || evt.includes('accounting') || evt.includes('ledger') || desc.includes('قيد') || desc.includes('حساب مالي') || desc.includes('يومية')) {
      module = 'accounting';
    } else if (evt.includes('treasury') || evt.includes('cheque') || evt.includes('voucher') || evt.includes('receipt') || evt.includes('payment') || desc.includes('شيك') || desc.includes('سند') || desc.includes('خزينة')) {
      module = 'treasury';
    } else if (evt.includes('product') || evt.includes('inventory') || evt.includes('stock') || evt.includes('warehouse') || evt.includes('wastage') || desc.includes('صنف') || desc.includes('مخزن') || desc.includes('جرد') || desc.includes('هالك')) {
      module = 'inventory';
    } else if (evt.includes('restaurant') || evt.includes('order') || evt.includes('table') || evt.includes('kitchen') || evt.includes('pos') || evt.includes('shift') || desc.includes('طاولة') || desc.includes('مطبخ') || desc.includes('شفت')) {
      module = 'restaurant';
    } else if (evt.includes('user') || evt.includes('role') || evt.includes('permission') || evt.includes('login') || evt.includes('backup') || evt.includes('setting') || desc.includes('مستخدم') || desc.includes('صلاحيات') || desc.includes('نسخة')) {
      module = 'admin';
    } else {
      module = 'general';
    }
  }

  // 2. تحديد درجة الخطورة
  if (!severity || severity === 'info') {
    if (evt.includes('delete') || evt.includes('unpost') || evt.includes('bounced') || evt.includes('void') || evt.includes('override') || evt.includes('fail') || desc.includes('حذف') || desc.includes('فك ترحيل') || desc.includes('إلغاء') || desc.includes('ارتداد')) {
      severity = 'critical';
    } else if (evt.includes('update') || evt.includes('edit') || evt.includes('price') || evt.includes('discount') || evt.includes('adjustment') || desc.includes('تعديل') || desc.includes('خصم') || desc.includes('تسوية') || desc.includes('تغيير')) {
      severity = 'warning';
    } else {
      severity = rawLog.severity || 'info';
    }
  }

  return { severity, module };
};

const SecurityLogs = () => {
  const { currentUser, users: authUsers } = useAuth();
  
  // State
  const [logs, setLogs] = useState<SecurityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedModule, setSelectedModule] = useState<string>('all');
  const [usersList, setUsersList] = useState<{ id: string; name: string; role?: string }[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Date Filters
  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  // Fetch and Sync Users List
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name, role');
        
        let userMap: Record<string, { id: string; name: string; role?: string }> = {};

        // إضافة المستخدمين من AuthContext
        if (authUsers && authUsers.length > 0) {
          authUsers.forEach(u => {
            userMap[u.id] = { id: u.id, name: u.name || u.username, role: u.role };
          });
        }

        // دمج ومزامنة مع جدول profiles
        if (profiles && profiles.length > 0) {
          profiles.forEach(p => {
            const displayName = p.full_name || userMap[p.id]?.name || (p.role ? `${p.role} (${p.id.slice(0, 6)})` : `مستخدم (${p.id.slice(0, 6)})`);
            userMap[p.id] = {
              id: p.id,
              name: displayName,
              role: p.role || userMap[p.id]?.role
            };
          });
        }

        setUsersList(Object.values(userMap));
      } catch (err) {
        console.error('Error loading users for filter:', err);
      }
    };

    fetchUsers();
  }, [authUsers]);

  // Fetch Logs
  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);

      if (currentUser?.role === 'demo') {
        setLogs([
          {
            id: '1',
            created_at: new Date().toISOString(),
            event_type: 'journal_unposted',
            description: '⚠️ تم فك ترحيل القيد اليومي رقم (104) وإعادته لحالة المسودة',
            severity: 'critical',
            module: 'accounting',
            performed_by: 'demo',
            performer_name: 'أحمد محمود (مدير مالي)',
            performer_role: 'admin',
            metadata: { entry_number: 104, old_status: 'posted', new_status: 'draft' }
          },
          {
            id: '2',
            created_at: new Date(Date.now() - 3600000).toISOString(),
            event_type: 'price_override',
            description: 'تم تعديل سعر بيع الصنف (لابتوب ديل) في الفاتورة INV-2026-08',
            severity: 'warning',
            module: 'sales',
            performed_by: 'demo',
            performer_name: 'كاشير الفرع الرئيسي',
            performer_role: 'cashier',
            metadata: { item_name: 'لابتوب ديل', default_price: 25000, new_price: 22500, discount_amount: 2500 }
          },
          {
            id: '3',
            created_at: new Date(Date.now() - 7200000).toISOString(),
            event_type: 'cheque_bounced',
            description: 'إثبات ارتداد ورفض الشيك البنكي رقم CHQ-99201 لعدم كفاية الرصيد',
            severity: 'critical',
            module: 'treasury',
            performed_by: 'demo',
            performer_name: 'مسؤول الخزينة',
            performer_role: 'accountant',
            metadata: { cheque_number: 'CHQ-99201', amount: 45000, bank: 'البنك الأهلي' }
          },
          {
            id: '4',
            created_at: new Date(Date.now() - 14400000).toISOString(),
            event_type: 'medical_record_update',
            description: 'تعديل في البيانات الطبية للزيارة رقم bd1f52b8 للمريض أحمد علي',
            severity: 'warning',
            module: 'hims',
            performed_by: 'demo',
            performer_name: 'د. خالد إبراهيم (طبيب استشاري)',
            performer_role: 'doctor'
          }
        ]);
        setLoading(false);
        return;
      }

      try {
        const { data: { user } } = await supabase.auth.getUser();
        const userOrgId = user?.user_metadata?.org_id;

        if (!userOrgId) return;

        let query = supabase
          .from('security_logs')
          .select('*')
          .eq('organization_id', userOrgId)
          .order('created_at', { ascending: false })
          .limit(800);

        if (searchTerm.trim()) {
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
          // Fetch performer profile names safely
          const userIds = [...new Set(logsData.map(l => l.performed_by).filter(Boolean))];
          let profilesMap: Record<string, { name: string; role?: string }> = {};

          if (userIds.length > 0) {
            const { data: profiles } = await supabase
              .from('profiles')
              .select('id, full_name, role')
              .in('id', userIds as string[]);

            profiles?.forEach(p => {
              profilesMap[p.id] = {
                name: p.full_name || (p.role ? `${p.role} (${p.id.slice(0, 6)})` : `مستخدم (${p.id.slice(0, 6)})`),
                role: p.role
              };
            });
          }

          // دمج الأسماء والتصنيفات الذكية
          const processedLogs: SecurityLog[] = logsData.map(log => {
            const { severity, module } = inferLogMeta(log);
            const performer = log.performed_by ? profilesMap[log.performed_by] : null;

            return {
              ...log,
              severity,
              module,
              performer_name: performer?.name || (log.performed_by ? `مستخدم (${log.performed_by.slice(0, 6)})` : 'النظام الآلي / المشرف'),
              performer_role: performer?.role
            };
          });

          // تطبيق فلاتر الـ Severity والـ Module في الذاكرة لضمان شمولية السجلات التاريخية
          const filtered = processedLogs.filter(log => {
            if (selectedSeverity !== 'all' && log.severity !== selectedSeverity) return false;
            if (selectedModule !== 'all' && log.module !== selectedModule) return false;
            return true;
          });

          setLogs(filtered);
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'development') console.error('Error fetching logs:', err);
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(() => {
      fetchLogs();
    }, 350);

    return () => clearTimeout(timer);
  }, [searchTerm, selectedUser, selectedSeverity, selectedModule, refreshKey, startDate, endDate]);

  // KPI Statistics Calculation
  const kpiStats = useMemo(() => {
    const total = logs.length;
    const critical = logs.filter(l => l.severity === 'critical').length;
    const warning = logs.filter(l => l.severity === 'warning').length;
    const info = logs.filter(l => l.severity === 'info').length;

    // Calculate top performer
    const userCounts: Record<string, { name: string; count: number }> = {};
    logs.forEach(l => {
      if (l.performed_by && l.performer_name && !l.performer_name.includes('النظام')) {
        if (!userCounts[l.performed_by]) userCounts[l.performed_by] = { name: l.performer_name, count: 0 };
        userCounts[l.performed_by].count++;
      }
    });

    const topPerformer = Object.values(userCounts).sort((a, b) => b.count - a.count)[0]?.name || 'المشرف العام';

    return { total, critical, warning, info, topPerformer };
  }, [logs]);

  // Date Range Quick Preset
  const handleQuickDatePreset = (preset: 'today' | 'week' | 'month') => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    setEndDate(todayStr);

    if (preset === 'today') {
      setStartDate(todayStr);
    } else if (preset === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(today.getDate() - 7);
      setStartDate(weekAgo.toISOString().split('T')[0]);
    } else if (preset === 'month') {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(monthStart.toISOString().split('T')[0]);
    }
  };

  // Export to Excel
  const exportToExcel = () => {
    const data = logs.map(log => ({
      'المعرف': log.id,
      'مستوى الخطورة': log.severity === 'critical' ? 'حرج' : log.severity === 'warning' ? 'تحذيري' : 'معلوماتي',
      'الموديول': moduleLabels[log.module || 'general'] || log.module,
      'نوع الحدث': log.event_type,
      'الوصف والتفاصيل': log.description,
      'المستخدم المسؤول': log.performer_name,
      'الدور الوظيفي': log.performer_role || '',
      'التاريخ والوقت': new Date(log.created_at).toLocaleString('ar-EG'),
      'البيانات التفصيلية (JSON)': log.metadata ? JSON.stringify(log.metadata) : ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Security_Audit_Logs");
    XLSX.writeFile(wb, `Security_Audit_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-red-100 text-red-700 border border-red-200 shadow-xs">
            <AlertTriangle size={12} className="shrink-0" />
            <span>حرج (Critical)</span>
          </span>
        );
      case 'warning':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <AlertCircle size={12} className="shrink-0" />
            <span>تحذيري (Warning)</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <Info size={12} className="shrink-0" />
            <span>معلوماتي (Info)</span>
          </span>
        );
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto animate-in fade-in space-y-6">
      
      {/* 👑 رأس الشاشة */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3.5 bg-gradient-to-br from-red-500 to-rose-600 rounded-2xl text-white shadow-md shadow-red-100">
            <ShieldAlert size={32} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-800">سجلات الأمان والرقابة والمراجعة</h1>
              <span className="px-2.5 py-0.5 bg-red-50 text-red-700 border border-red-100 rounded-full text-xs font-bold">
                Audit Trail
              </span>
            </div>
            <p className="text-slate-500 text-sm mt-1">
              رصد وتوثيق كافة العمليات الحساسة، التعديلات المالية، وحركات الحذف لحماية أصول وبيانات المنشأة.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={exportToExcel}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-md shadow-emerald-100 transition-all"
            title="تصدير تقرير التدقيق إلى ملف Excel"
          >
            <Download size={18} />
            <span>تصدير Excel</span>
          </button>

          <button
            onClick={() => setRefreshKey(k => k + 1)}
            className="p-2.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl transition-all shadow-xs"
            title="تحديث السجلات"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* 📊 بطاقات المؤشرات الإحصائية (KPI Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-400">إجمالي السجلات المرصودة</div>
            <div className="text-2xl font-black text-slate-800 mt-1 font-mono">{kpiStats.total}</div>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <Activity size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-red-100 shadow-sm flex items-center justify-between bg-red-50/20">
          <div>
            <div className="text-xs font-bold text-red-600">عمليات حرجة (Critical)</div>
            <div className="text-2xl font-black text-red-600 mt-1 font-mono">{kpiStats.critical}</div>
          </div>
          <div className="p-3 bg-red-100 text-red-600 rounded-xl">
            <AlertTriangle size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-amber-100 shadow-sm flex items-center justify-between bg-amber-50/20">
          <div>
            <div className="text-xs font-bold text-amber-600">عمليات تحذيرية (Warnings)</div>
            <div className="text-2xl font-black text-amber-600 mt-1 font-mono">{kpiStats.warning}</div>
          </div>
          <div className="p-3 bg-amber-100 text-amber-600 rounded-xl">
            <AlertCircle size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-400">المستخدم الأكثر نشاطاً</div>
            <div className="text-sm font-black text-slate-700 mt-1 truncate max-w-[140px]" title={kpiStats.topPerformer}>
              {kpiStats.topPerformer}
            </div>
          </div>
          <div className="p-3 bg-slate-100 text-slate-600 rounded-xl">
            <UserCheck size={24} />
          </div>
        </div>
      </div>

      {/* 🧭 شريط الفلاتر والبحث المتقدم */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row items-center gap-3">
          
          {/* حقل البحث اللحظي */}
          <div className="relative flex-1 w-full">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="بحث في السجلات والتفاصيل (فاتورة، قيد، اسم مستخدم، شيك، صنف، مريض)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pr-11 pl-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 font-medium"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 font-bold"
              >
                مسح
              </button>
            )}
          </div>

          {/* فلتر المستخدمين */}
          <div className="w-full lg:w-56">
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full py-2.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="">جميع المستخدمين ({usersList.length})</option>
              {usersList.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name} {u.role ? `(${u.role})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* فلتر الموديول */}
          <div className="w-full lg:w-48">
            <select
              value={selectedModule}
              onChange={(e) => setSelectedModule(e.target.value)}
              className="w-full py-2.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              {Object.entries(moduleLabels).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* نطاق التاريخ مع أزرار سريعة */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
          
          {/* تبويبات درجة الخطورة */}
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {[
              { id: 'all', label: 'كافة المستويات' },
              { id: 'critical', label: '🚨 الحرج فقط' },
              { id: 'warning', label: '⚠️ التحذيري فقط' },
              { id: 'info', label: 'ℹ️ المعلوماتي فقط' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setSelectedSeverity(tab.id)}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                  selectedSeverity === tab.id
                    ? tab.id === 'critical'
                      ? 'bg-red-600 text-white shadow-sm'
                      : tab.id === 'warning'
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* محدد التاريخ واختصاراته */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
              <Calendar size={14} className="text-slate-400" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent border-none text-xs font-bold text-slate-700 outline-none w-28"
              />
              <span className="text-slate-300">إلى</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent border-none text-xs font-bold text-slate-700 outline-none w-28"
              />
            </div>

            <div className="flex gap-1">
              <button
                onClick={() => handleQuickDatePreset('today')}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-bold text-[11px]"
              >
                اليوم
              </button>
              <button
                onClick={() => handleQuickDatePreset('week')}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-bold text-[11px]"
              >
                آخر 7 أيام
              </button>
              <button
                onClick={() => handleQuickDatePreset('month')}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-bold text-[11px]"
              >
                هذا الشهر
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* 📜 جدول واستعراض سجلات الأمان */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-16 text-center flex flex-col items-center justify-center text-slate-500 space-y-3">
            <Loader2 className="animate-spin text-red-600" size={36} />
            <p className="font-bold text-slate-700">جاري تحميل سجلات التدقيق الأمني...</p>
            <p className="text-xs text-slate-400">يتم تجميع الأحداث من محرك الرقابة المركزي</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-16 text-center text-slate-500 space-y-3">
            <ShieldAlert size={48} className="mx-auto text-slate-300" />
            <h3 className="text-lg font-bold text-slate-700">لا توجد سجلات مطابقة</h3>
            <p className="text-slate-400 text-xs">لم يتم رصد أي عمليات تطابق معايير البحث والفلترة المحددة.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-50/80 text-slate-500 text-xs uppercase font-black border-b border-slate-100">
                  <th className="px-5 py-4 w-36">الخطورة</th>
                  <th className="px-5 py-4 w-40">الموديول</th>
                  <th className="px-5 py-4">العملية والحدث</th>
                  <th className="px-5 py-4 w-56">المستخدم المسؤول</th>
                  <th className="px-5 py-4 w-44 text-left">التاريخ والوقت</th>
                  <th className="px-3 py-4 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {logs.map(log => {
                  const isExpanded = expandedLogId === log.id;
                  const hasDetails = Boolean(log.metadata && Object.keys(log.metadata).length > 0);

                  return (
                    <React.Fragment key={log.id}>
                      <tr 
                        onClick={() => hasDetails && setExpandedLogId(isExpanded ? null : log.id)}
                        className={`transition-colors ${hasDetails ? 'cursor-pointer hover:bg-slate-50/80' : 'hover:bg-slate-50/40'} ${
                          log.severity === 'critical' ? 'bg-red-50/15' : log.severity === 'warning' ? 'bg-amber-50/10' : ''
                        }`}
                      >
                        {/* مستوى الخطورة */}
                        <td className="px-5 py-4">
                          {getSeverityBadge(log.severity)}
                        </td>

                        {/* الموديول */}
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {moduleLabels[log.module] || log.module}
                          </span>
                        </td>

                        {/* تفاصيل الحدث */}
                        <td className="px-5 py-4">
                          <div className="font-bold text-slate-800 text-xs leading-relaxed">
                            {log.description}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                            {log.event_type}
                          </div>
                        </td>

                        {/* المستخدم المسؤول */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 font-black text-xs flex items-center justify-center border border-slate-200">
                              {log.performer_name?.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-slate-800 text-xs truncate max-w-[150px]">
                                {log.performer_name}
                              </div>
                              {log.performer_role && (
                                <div className="text-[10px] text-slate-400 font-mono truncate max-w-[150px]">
                                  {log.performer_role}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* التاريخ والوقت */}
                        <td className="px-5 py-4 text-left font-mono text-xs text-slate-500" dir="ltr">
                          {new Date(log.created_at).toLocaleString('ar-EG')}
                        </td>

                        {/* زر التفاصيل */}
                        <td className="px-3 py-4 text-center">
                          {hasDetails && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedLogId(isExpanded ? null : log.id);
                              }}
                              className="p-1 text-slate-400 hover:text-slate-600 rounded"
                            >
                              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                          )}
                        </td>
                      </tr>

                      {/* شريط التفاصيل الإضافية والـ Diff عند التوسيع */}
                      {isExpanded && log.metadata && (
                        <tr className="bg-slate-50/70 border-b border-slate-200">
                          <td colSpan={6} className="px-8 py-4">
                            <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2 text-xs shadow-xs">
                              <div className="flex items-center gap-2 font-bold text-slate-700 border-b border-slate-100 pb-2">
                                <FileText size={14} className="text-indigo-600" />
                                <span>البيانات التفصيلية المسجلة في السجل الأمني (Audit Metadata):</span>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                                {Object.entries(log.metadata).map(([k, v]) => (
                                  <div key={k} className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                                    <span className="font-bold text-slate-600 block mb-0.5">{k}:</span>
                                    <pre className="text-[11px] text-slate-800 font-mono whitespace-pre-wrap break-all dir-ltr text-left">
                                      {typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v)}
                                    </pre>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};

export default SecurityLogs;
