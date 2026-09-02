import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import * as XLSX from 'xlsx';
import {
  Wrench, CheckCircle2, Clock, AlertTriangle, Plus, Search,
  Filter, FileSpreadsheet, Printer, Layers, DollarSign, Cog,
  ShieldCheck, ArrowRight, Eye, Edit3, Trash2, Calendar, X
} from 'lucide-react';

interface SparePart {
  part_name: string;
  qty: number;
  unit_cost: number;
}

interface MaintenanceOrder {
  id: string;
  order_number: string;
  machine_name: string;
  maintenance_type: 'PREVENTIVE' | 'CORRECTIVE' | 'CALIBRATION';
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
  issue_description: string;
  scheduled_date: string;
  completed_date?: string;
  assigned_technician: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  spare_parts_used: SparePart[];
  total_cost: number;
  maintenance_interval_hours?: number;
  notes?: string;
  created_at: string;
}

export default function MachineryMaintenanceManager() {
  const { organization, currentSelectedOrgId, currentUser } = useAccounting();
  const { showToast } = useToast();

  const [orders, setOrders] = useState<MaintenanceOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');

  // Modals
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [activeOrder, setActiveOrder] = useState<MaintenanceOrder | null>(null);
  const [realWorkCenters, setRealWorkCenters] = useState<{ id: string; name: string }[]>([]);

  // Form State
  const [formOrderNum, setFormOrderNum] = useState('');
  const [formMachine, setFormMachine] = useState('');
  const [formType, setFormType] = useState<'PREVENTIVE' | 'CORRECTIVE' | 'CALIBRATION'>('PREVENTIVE');
  const [formPriority, setFormPriority] = useState<'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'>('NORMAL');
  const [formIssue, setFormIssue] = useState('');
  const [formScheduledDate, setFormScheduledDate] = useState(new Date().toISOString().split('T')[0]);
  const [formTechnician, setFormTechnician] = useState(currentUser?.full_name || 'مهندس الصيانة');
  const [formInterval, setFormInterval] = useState<number>(500);
  const [formNotes, setFormNotes] = useState('');

  // Spare parts list inside complete modal
  const [spareParts, setSpareParts] = useState<SparePart[]>([
    { part_name: 'طقم جوان وفلتر زيت هيدروليك', qty: 1, unit_cost: 650 }
  ]);
  const [completionDate, setCompletionDate] = useState(new Date().toISOString().split('T')[0]);
  const [laborCost, setLaborCost] = useState<number>(300);

  const orgId = organization?.id || currentSelectedOrgId || currentUser?.organization_id;

  // Real Dynamic Factory Machines from Work Centers
  const availableMachines = useMemo(() => {
    if (realWorkCenters.length > 0) {
      return realWorkCenters.map(wc => `ماكينة / خط (${wc.name})`);
    }
    return ['ماكينة الإنتاج العامة 01', 'خط التشغيل 01'];
  }, [realWorkCenters]);

  // Fetch Orders & Real Centers
  const fetchOrders = async () => {
    if (!orgId) return;
    setIsLoading(true);
    try {
      // 1. Fetch Real Factory Centers
      const { data: wcData } = await supabase
        .from('mfg_work_centers')
        .select('id, name')
        .eq('organization_id', orgId);
      if (wcData) setRealWorkCenters(wcData);

      // 2. Fetch Orders
      const { data, error } = await supabase
        .from('mfg_maintenance_orders')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('mfg_maintenance_orders table notice:', error.message);
        setOrders([]);
      } else {
        setOrders((data || []).map((d: any) => ({
          ...d,
          spare_parts_used: Array.isArray(d.spare_parts_used) ? d.spare_parts_used : []
        })));
      }
    } catch (err: any) {
      console.error(err);
      setOrders([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [orgId]);

  // Open New Modal
  const handleOpenNew = () => {
    const nextNum = `MAINT-${String(orders.length + 1).padStart(3, '0')}`;
    setFormOrderNum(nextNum);
    setFormMachine(availableMachines[0] || 'ماكينة ورشة العمل');
    setFormType('PREVENTIVE');
    setFormPriority('NORMAL');
    setFormIssue('صيانة وقائية دورية (فحص، تزييت وضبط المعايرة)');
    setFormScheduledDate(new Date().toISOString().split('T')[0]);
    setFormTechnician(currentUser?.full_name || 'مهندس الصيانة');
    setFormInterval(500);
    setFormNotes('');
    setIsNewModalOpen(true);
  };

  // Save New Order
  const handleSaveOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formMachine || !formIssue) {
      showToast('يرجى تحديد الماكينة ووصف الصيانة', 'warning');
      return;
    }

    try {
      const payload = {
        organization_id: orgId,
        order_number: formOrderNum,
        machine_name: formMachine,
        maintenance_type: formType,
        priority: formPriority,
        issue_description: formIssue,
        scheduled_date: formScheduledDate,
        assigned_technician: formTechnician,
        status: 'PENDING',
        maintenance_interval_hours: formInterval,
        notes: formNotes || null
      };

      const { error } = await supabase.from('mfg_maintenance_orders').insert(payload);
      if (error) throw error;

      showToast('تم إصدار أمر الصيانة بنجاح 🛠️', 'success');
      setIsNewModalOpen(false);
      fetchOrders();
    } catch (err: any) {
      showToast('فشل حفظ أمر الصيانة: ' + err.message, 'error');
    }
  };

  // Complete Order
  const handleSaveCompletion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrder) return;

    try {
      const partsCost = spareParts.reduce((acc, p) => acc + (p.qty * p.unit_cost), 0);
      const totalCost = partsCost + laborCost;

      const { error } = await supabase
        .from('mfg_maintenance_orders')
        .update({
          status: 'COMPLETED',
          completed_date: completionDate,
          spare_parts_used: spareParts,
          total_cost: totalCost
        })
        .eq('id', activeOrder.id);

      if (error) throw error;

      showToast('تم إتمام أمر الصيانة وتوثيق قطع الغيار بنجاح ✅', 'success');
      setIsCompleteModalOpen(false);
      fetchOrders();
    } catch (err: any) {
      showToast('فشل إتمام الصيانة: ' + err.message, 'error');
    }
  };

  // Delete Order
  const handleDelete = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف أمر الصيانة؟')) return;
    try {
      const { error } = await supabase.from('mfg_maintenance_orders').delete().eq('id', id);
      if (error) throw error;
      showToast('تم حذف أمر الصيانة', 'success');
      fetchOrders();
    } catch (err: any) {
      showToast('فشل الحذف: ' + err.message, 'error');
    }
  };

  // Filtered Orders
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const matchSearch = o.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          o.machine_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          o.assigned_technician?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          o.issue_description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === 'ALL' || o.status === statusFilter;
      const matchType = typeFilter === 'ALL' || o.maintenance_type === typeFilter;
      return matchSearch && matchStatus && matchType;
    });
  }, [orders, searchTerm, statusFilter, typeFilter]);

  // KPIs
  const kpis = useMemo(() => {
    let pendingCount = 0;
    let completedCount = 0;
    let totalCost = 0;

    orders.forEach(o => {
      if (o.status === 'COMPLETED') {
        completedCount++;
        totalCost += Number(o.total_cost || 0);
      } else {
        pendingCount++;
      }
    });

    return {
      pendingCount,
      completedCount,
      totalCost,
      totalOrders: orders.length
    };
  }, [orders]);

  // Export Excel
  const exportToExcel = () => {
    if (filteredOrders.length === 0) {
      showToast('لا توجد بيانات للتصدير', 'warning');
      return;
    }
    const rows = filteredOrders.map((o, idx) => ({
      '#': idx + 1,
      'رقم أمر الصيانة': o.order_number,
      'الماكينة / الخط': o.machine_name,
      'نوع الصيانة': o.maintenance_type === 'PREVENTIVE' ? 'وقائية دورية' : o.maintenance_type === 'CORRECTIVE' ? 'علاجية طارئة' : 'معايرة وضبط',
      'الأولوية': o.priority,
      'تاريخ الجدولة': o.scheduled_date,
      'الفني المسؤول': o.assigned_technician,
      'الحالة': o.status,
      'إجمالي تكلفة الصيانة': o.total_cost
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'أوامر الصيانة');
    XLSX.writeFile(wb, `Machinery_Maintenance_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('تم تصدير سجل الصيانة إلى Excel ✅', 'success');
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in" dir="rtl">
      
      {/* 🛠️ Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="inline-flex items-center gap-2 bg-indigo-500/20 text-indigo-200 px-3 py-1 rounded-full text-xs font-bold mb-3 border border-indigo-400/30">
              <Wrench size={14} className="text-amber-400" />
              <span>جاهزية خطوط الإنتاج (Plant & Machinery Maintenance)</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">
              إدارة الصيانة الوقائية والطارئة للماكينات
            </h1>
            <p className="text-indigo-200 text-sm mt-1 max-w-2xl">
              تخطيط وتتبع الصيانة الدورية لماكينات المصنع، أوامر الإصلاح الطارئة، وحصر قطع الغيار المستهلكة وتكاليف الصيانة.
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
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white rounded-2xl font-bold transition-all shadow-lg shadow-amber-500/30"
            >
              <Plus size={18} />
              <span>إصدار أمر صيانة جديد</span>
            </button>
          </div>
        </div>
      </div>

      {/* 📊 KPI Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold mb-1">أوامر صيانة قيد التنفيذ والانتظار</p>
            <h3 className="text-2xl font-black text-amber-600">{kpis.pendingCount} <span className="text-xs text-slate-400 font-normal">أمر مفتوح</span></h3>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <Clock size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold mb-1">أوامر صيانة منجزة بنجاح</p>
            <h3 className="text-2xl font-black text-emerald-600">{kpis.completedCount} <span className="text-xs text-slate-400 font-normal">أمر مكتمل</span></h3>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle2 size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold mb-1">إجمالي مصروفات وقطع غيار الصيانة</p>
            <h3 className="text-2xl font-black text-indigo-700">
              {kpis.totalCost.toLocaleString()} <span className="text-xs text-slate-400 font-normal">ج.م / ر.س</span>
            </h3>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <DollarSign size={24} />
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
              placeholder="بحث بالرقم أو الماكينة أو الفني..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700"
          >
            <option value="ALL">🛠️ كل أنواع الصيانة</option>
            <option value="PREVENTIVE">وقائية دورية</option>
            <option value="CORRECTIVE">علاجية طارئة</option>
            <option value="CALIBRATION">معايرة وضبط</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700"
          >
            <option value="ALL">🔘 كل الحالات</option>
            <option value="PENDING">بانتظار الصيانة</option>
            <option value="COMPLETED">مكتملة</option>
          </select>
        </div>
      </div>

      {/* 📋 Table of Orders */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 font-bold animate-pulse">جاري تحميل أوامر الصيانة...</div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-12 text-center">
            <Wrench size={48} className="mx-auto text-slate-300 mb-3" />
            <h3 className="text-slate-700 font-bold text-lg mb-1">لا توجد أوامر صيانة مسجلة</h3>
            <p className="text-slate-400 text-sm">اضغط على "إصدار أمر صيانة جديد" لجدولة صيانة وقائية أو طارئة.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3.5">رقم الأمر</th>
                  <th className="p-3.5">الماكينة / الخط</th>
                  <th className="p-3.5">نوع الصيانة</th>
                  <th className="p-3.5">وصف العطل / الصيانة</th>
                  <th className="p-3.5">تاريخ الجدولة</th>
                  <th className="p-3.5">الفني المسؤول</th>
                  <th className="p-3.5">الحالة</th>
                  <th className="p-3.5 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.map(o => (
                  <tr key={o.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5 font-mono font-bold text-indigo-700">{o.order_number}</td>
                    <td className="p-3.5 font-bold text-slate-900">{o.machine_name}</td>
                    <td className="p-3.5">
                      <span className={`px-2.5 py-0.5 rounded-lg text-xs font-bold ${
                        o.maintenance_type === 'PREVENTIVE' ? 'bg-blue-100 text-blue-800' :
                        o.maintenance_type === 'CORRECTIVE' ? 'bg-rose-100 text-rose-800' : 'bg-purple-100 text-purple-800'
                      }`}>
                        {o.maintenance_type === 'PREVENTIVE' ? 'وقائية دورية' : o.maintenance_type === 'CORRECTIVE' ? 'علاجية طارئة' : 'معايرة'}
                      </span>
                    </td>
                    <td className="p-3.5 text-xs text-slate-700 max-w-xs truncate">{o.issue_description}</td>
                    <td className="p-3.5 text-slate-600">{o.scheduled_date}</td>
                    <td className="p-3.5 text-slate-700 font-medium">{o.assigned_technician}</td>
                    <td className="p-3.5">
                      {o.status === 'COMPLETED' ? (
                        <span className="bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1">
                          <CheckCircle2 size={12} />
                          مكتملة ({o.total_cost.toLocaleString()} ج.م)
                        </span>
                      ) : (
                        <span className="bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1">
                          <Clock size={12} />
                          قيد الانتظار
                        </span>
                      )}
                    </td>
                    <td className="p-3.5">
                      <div className="flex items-center justify-center gap-2">
                        {o.status !== 'COMPLETED' && (
                          <button
                            onClick={() => {
                              setActiveOrder(o);
                              setSpareParts([{ part_name: 'طقم قطع غيار صيانة', qty: 1, unit_cost: 500 }]);
                              setIsCompleteModalOpen(true);
                            }}
                            title="إتمام الصيانة وتوثيق قطع الغيار"
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg"
                          >
                            <CheckCircle2 size={16} />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setActiveOrder(o);
                            setIsPrintModalOpen(true);
                          }}
                          title="طباعة أمر الصيانة"
                          className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg"
                        >
                          <Printer size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(o.id)}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                        >
                          <Trash2 size={16} />
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

      {/* 📝 New Maintenance Order Modal */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl p-6 md:p-8 animate-in zoom-in-95">
            <form onSubmit={handleSaveOrder} className="space-y-4">
              <div className="flex justify-between items-center border-b pb-3">
                <div className="flex items-center gap-2 text-indigo-900 font-black text-lg">
                  <Wrench className="text-amber-500" size={24} />
                  <span>إصدار أمر صيانة ماكينة جديد</span>
                </div>
                <button type="button" onClick={() => setIsNewModalOpen(false)} className="text-slate-400">
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رقم أمر الصيانة *</label>
                  <input
                    type="text"
                    value={formOrderNum}
                    onChange={(e) => setFormOrderNum(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">نوع الصيانة</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  >
                    <option value="PREVENTIVE">🛠️ صيانة وقائية دورية</option>
                    <option value="CORRECTIVE">🚨 صيانة علاجية / طارئة</option>
                    <option value="CALIBRATION">⚖️ معايرة وضبط دقيق</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">اسم الماكينة / خط الإنتاج *</label>
                  {availableMachines.length > 0 && (
                    <select
                      value={formMachine}
                      onChange={(e) => setFormMachine(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold mb-2 outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- اختر من ماكينات وورش المصنع --</option>
                      {availableMachines.map((m, idx) => (
                        <option key={idx} value={m}>{m}</option>
                      ))}
                    </select>
                  )}
                  <input
                    type="text"
                    value={formMachine}
                    onChange={(e) => setFormMachine(e.target.value)}
                    placeholder="أو اكتب اسم الماكينة / الخط يدوياً"
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">بيان العطل أو أعمال الصيانة المطلوبة *</label>
                  <input
                    type="text"
                    value={formIssue}
                    onChange={(e) => setFormIssue(e.target.value)}
                    placeholder="مثال: تغيير سيور المحرك، تزييت رولمان البلي، واستبدال فلتر الزيت..."
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ الجدولة *</label>
                  <input
                    type="date"
                    value={formScheduledDate}
                    onChange={(e) => setFormScheduledDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الفني / المهندس المسؤول</label>
                  <input
                    type="text"
                    value={formTechnician}
                    onChange={(e) => setFormTechnician(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-sm shadow-md shadow-amber-500/30"
                >
                  حفظ وإصدار الأمر
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ✅ Complete Maintenance Modal */}
      {isCompleteModalOpen && activeOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl p-6 md:p-8 animate-in zoom-in-95">
            <form onSubmit={handleSaveCompletion} className="space-y-4">
              <div className="flex justify-between items-center border-b pb-3">
                <div>
                  <h3 className="font-bold text-slate-800 text-base">إتمام وتوثيق أمر الصيانة</h3>
                  <p className="text-xs text-indigo-600 font-mono font-bold">{activeOrder.order_number}: {activeOrder.machine_name}</p>
                </div>
                <button type="button" onClick={() => setIsCompleteModalOpen(false)} className="text-slate-400">
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ إتمام الصيانة</label>
                  <input
                    type="date"
                    value={completionDate}
                    onChange={(e) => setCompletionDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تكلفة المصنعية / أجور فنيين خارجيين (ج.م)</label>
                  <input
                    type="number"
                    value={laborCost}
                    onChange={(e) => setLaborCost(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>
              </div>

              {/* Dynamic Spare parts list */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-700">قطع الغيار والزيوت المستهلكة:</label>
                  <button
                    type="button"
                    onClick={() => setSpareParts([...spareParts, { part_name: '', qty: 1, unit_cost: 0 }])}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800"
                  >
                    + إضافة قطعة غيار
                  </button>
                </div>

                <div className="border rounded-xl p-2 bg-slate-50 space-y-2">
                  {spareParts.map((sp, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input
                        type="text"
                        placeholder="اسم قطعة الغيار (مثال: سير، فلتر)"
                        value={sp.part_name}
                        onChange={(e) => {
                          const updated = [...spareParts];
                          updated[idx].part_name = e.target.value;
                          setSpareParts(updated);
                        }}
                        className="flex-1 px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                      <input
                        type="number"
                        placeholder="الكمية"
                        value={sp.qty}
                        onChange={(e) => {
                          const updated = [...spareParts];
                          updated[idx].qty = parseFloat(e.target.value) || 0;
                          setSpareParts(updated);
                        }}
                        className="w-16 px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold"
                      />
                      <input
                        type="number"
                        placeholder="سعر الوحدة"
                        value={sp.unit_cost}
                        onChange={(e) => {
                          const updated = [...spareParts];
                          updated[idx].unit_cost = parseFloat(e.target.value) || 0;
                          setSpareParts(updated);
                        }}
                        className="w-24 px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold"
                      />
                      <button
                        type="button"
                        onClick={() => setSpareParts(spareParts.filter((_, i) => i !== idx))}
                        className="text-rose-500 hover:bg-rose-50 p-1 rounded"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsCompleteModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-md shadow-emerald-600/30"
                >
                  اعتماد إتمام الصيانة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🖨️ Printable Transmittal for Maintenance Order */}
      {isPrintModalOpen && activeOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl p-6 md:p-8" dir="rtl">
            <div className="flex justify-between items-center border-b pb-4 mb-4">
              <div>
                <h2 className="text-xl font-black text-slate-800">أمر صيانة ماكينة وتشغيل معتمد</h2>
                <p className="text-xs text-slate-500 font-mono">Machinery Maintenance Work Order</p>
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
                <div><span className="text-slate-400 font-bold">رقم الأمر:</span> <span className="font-mono font-bold text-indigo-700">{activeOrder.order_number}</span></div>
                <div><span className="text-slate-400 font-bold">الماكينة:</span> <span className="font-bold">{activeOrder.machine_name}</span></div>
                <div><span className="text-slate-400 font-bold">النوع:</span> <span>{activeOrder.maintenance_type}</span></div>
                <div><span className="text-slate-400 font-bold">تاريخ الجدولة:</span> <span>{activeOrder.scheduled_date}</span></div>
                <div><span className="text-slate-400 font-bold">الفني المسؤول:</span> <span>{activeOrder.assigned_technician}</span></div>
                <div><span className="text-slate-400 font-bold">الحالة:</span> <span className="font-bold">{activeOrder.status}</span></div>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 border-b pb-1 text-xs">وصف العطل / أعمال الصيانة:</h4>
                <p className="bg-slate-50 p-3 rounded-lg border text-xs mt-2 text-slate-800 font-medium">{activeOrder.issue_description}</p>
              </div>

              {activeOrder.spare_parts_used && activeOrder.spare_parts_used.length > 0 && (
                <div>
                  <h4 className="font-bold text-slate-800 border-b pb-1 text-xs mb-2">قطع الغيار المستهلكة:</h4>
                  <table className="w-full text-xs text-right border">
                    <thead className="bg-slate-100 font-bold">
                      <tr>
                        <th className="p-2 border">القطعة</th>
                        <th className="p-2 border">الكمية</th>
                        <th className="p-2 border">سعر الوحدة</th>
                        <th className="p-2 border">الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeOrder.spare_parts_used.map((sp, idx) => (
                        <tr key={idx}>
                          <td className="p-2 border">{sp.part_name}</td>
                          <td className="p-2 border font-bold">{sp.qty}</td>
                          <td className="p-2 border">{sp.unit_cost} ج.م</td>
                          <td className="p-2 border font-bold">{sp.qty * sp.unit_cost} ج.م</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="grid grid-cols-2 gap-8 pt-8 border-t border-slate-200 text-center text-xs">
                <div>
                  <p className="font-bold text-slate-700 mb-6">مهندس الصيانة المسؤول</p>
                  <p className="border-t border-slate-300 pt-1 text-slate-400">التوقيع</p>
                </div>
                <div>
                  <p className="font-bold text-slate-700 mb-6">مدير الإنتاج والمصنع</p>
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
