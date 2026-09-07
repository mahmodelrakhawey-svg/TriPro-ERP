import React, { useState, useEffect, useMemo } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { supabase } from '../../supabaseClient';
import { 
  Repeat, Plus, Play, Pause, Trash2, Edit, FileText, CheckCircle, 
  AlertCircle, MessageCircle, Calendar, Clock, DollarSign, Users, 
  Search, RefreshCw, X, ArrowUpRight, Check, Send, Download, ExternalLink,
  ChevronDown, Layers, ShieldCheck, HelpCircle, Database, Copy
} from 'lucide-react';
import { RecurringInvoice, RecurringInvoiceItem, RecurringInvoiceLog, RecurringFrequency, RecurringStatus, Product } from '../../types';
import RecurringInvoiceService from '../../services/recurringInvoiceService';
import { useToast } from '../../context/ToastContext';
import * as XLSX from 'xlsx';

export const RecurringInvoicesManager: React.FC = () => {
  const { customers, products, warehouses, salespeople, currentUser } = useAccounting();
  const { showToast } = useToast();

  const [subscriptions, setSubscriptions] = useState<RecurringInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [frequencyFilter, setFrequencyFilter] = useState<string>('all');
  const [sqlModalOpen, setSqlModalOpen] = useState(false);

  // Modal State for Create / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form State
  const [formData, setFormData] = useState<Partial<RecurringInvoice>>({
    subscription_number: '',
    customer_id: '',
    title: '',
    frequency: 'monthly',
    custom_interval_days: null,
    start_date: new Date().toISOString().split('T')[0],
    end_date: null,
    next_run_date: new Date().toISOString().split('T')[0],
    total_cycles: null,
    auto_post: true,
    send_whatsapp: true,
    send_email: false,
    status: 'active',
    warehouse_id: '',
    salesperson_id: '',
    discount_type: 'fixed',
    discount_value: 0,
    notes: '',
  });

  const [items, setItems] = useState<RecurringInvoiceItem[]>([]);

  // Logs / Execution History Modal
  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const [activeSubscriptionLogs, setActiveSubscriptionLogs] = useState<{ sub: RecurringInvoice | null; logs: RecurringInvoiceLog[] }>({
    sub: null,
    logs: [],
  });
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Action states
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [runningBatch, setRunningBatch] = useState(false);

  // WhatsApp Alert Modal
  const [whatsappModalOpen, setWhatsappModalOpen] = useState(false);
  const [whatsappMessage, setWhatsappMessage] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');

  const orgId = (currentUser as any)?.organization_id || '';
  const userId = currentUser?.id || '';

  // جلب البيانات
  const fetchSubscriptions = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const data = await RecurringInvoiceService.getRecurringInvoices(orgId, {
        status: statusFilter,
      });
      setSubscriptions(data);
    } catch (err: any) {
      showToast('فشل تحميل عقود الاشتراكات: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptions();
  }, [orgId, statusFilter]);

  // إحصائيات لوحة التحكم
  const kpis = useMemo(() => {
    const active = subscriptions.filter(s => s.status === 'active');
    
    // حساب الدخل الشهري المتكرر (MRR)
    let mrr = 0;
    active.forEach(s => {
      const amt = Number(s.total_amount) || 0;
      switch (s.frequency) {
        case 'daily':
          mrr += amt * 30;
          break;
        case 'weekly':
          mrr += amt * 4.33;
          break;
        case 'monthly':
          mrr += amt;
          break;
        case 'quarterly':
          mrr += amt / 3;
          break;
        case 'semi_annual':
          mrr += amt / 6;
          break;
        case 'annual':
          mrr += amt / 12;
          break;
        case 'custom':
          const days = s.custom_interval_days || 30;
          mrr += amt * (30 / days);
          break;
      }
    });

    const todayStr = new Date().toISOString().split('T')[0];
    const dueTodayCount = active.filter(s => s.next_run_date <= todayStr).length;
    const totalCompletedCycles = subscriptions.reduce((sum, s) => sum + (s.completed_cycles || 0), 0);

    return {
      activeCount: active.length,
      mrr: Math.round(mrr),
      arr: Math.round(mrr * 12),
      dueTodayCount,
      totalCompletedCycles,
    };
  }, [subscriptions]);

  // تصفية الاشتراكات
  const filteredSubscriptions = useMemo(() => {
    return subscriptions.filter(s => {
      const matchSearch = 
        s.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.subscription_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.customers?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.customers?.phone?.includes(searchTerm);

      const matchFreq = frequencyFilter === 'all' || s.frequency === frequencyFilter;
      return matchSearch && matchFreq;
    });
  }, [subscriptions, searchTerm, frequencyFilter]);

  // فتح نافذة إنشاء جديد
  const handleOpenCreate = () => {
    setEditingId(null);
    const today = new Date().toISOString().split('T')[0];
    setFormData({
      subscription_number: `SUB-${Date.now().toString().slice(-6)}`,
      customer_id: customers.length > 0 ? customers[0].id : '',
      title: 'اشتراك شهري في خدمات الدعم الفني والصيانة',
      frequency: 'monthly',
      custom_interval_days: null,
      start_date: today,
      end_date: null,
      next_run_date: today,
      total_cycles: null,
      auto_post: true,
      send_whatsapp: true,
      send_email: false,
      status: 'active',
      warehouse_id: warehouses.length > 0 ? warehouses[0].id : '',
      salesperson_id: salespeople.length > 0 ? salespeople[0].id : '',
      discount_type: 'fixed',
      discount_value: 0,
      notes: '',
    });
    setItems([
      {
        product_name: 'خدمة اشتراك دوري',
        quantity: 1,
        unit_price: 1500,
        discount_percent: 0,
        tax_percent: 14,
        total: 1710,
      }
    ]);
    setIsModalOpen(true);
  };

  // فتح نافذة تعديل
  const handleOpenEdit = (sub: RecurringInvoice) => {
    setEditingId(sub.id);
    setFormData({
      subscription_number: sub.subscription_number,
      customer_id: sub.customer_id,
      title: sub.title,
      frequency: sub.frequency,
      custom_interval_days: sub.custom_interval_days,
      start_date: sub.start_date,
      end_date: sub.end_date,
      next_run_date: sub.next_run_date,
      total_cycles: sub.total_cycles,
      auto_post: sub.auto_post,
      send_whatsapp: sub.send_whatsapp,
      send_email: sub.send_email,
      status: sub.status,
      warehouse_id: sub.warehouse_id || '',
      salesperson_id: sub.salesperson_id || '',
      discount_type: sub.discount_type || 'fixed',
      discount_value: sub.discount_value || 0,
      notes: sub.notes || '',
    });
    setItems(sub.items && sub.items.length > 0 ? [...sub.items] : []);
    setIsModalOpen(true);
  };

  // إضافة سطر صنف جديد
  const handleAddItem = () => {
    setItems(prev => [
      ...prev,
      {
        product_name: '',
        quantity: 1,
        unit_price: 0,
        discount_percent: 0,
        tax_percent: 14,
        total: 0,
      }
    ]);
  };

  // اختيار صنف من المخزون
  const handleSelectProduct = (index: number, productId: string) => {
    const prod = products.find(p => p.id === productId);
    if (!prod) return;

    const newItems = [...items];
    const unitPrice = prod.price || prod.sales_price || 0;
    const taxPercent = 14;
    const total = (1 * unitPrice) * (1 + taxPercent / 100);

    newItems[index] = {
      ...newItems[index],
      product_id: prod.id,
      product_name: prod.name,
      product_sku: prod.sku || '',
      quantity: 1,
      unit_price: unitPrice,
      tax_percent: taxPercent,
      total,
    };
    setItems(newItems);
  };

  // تعديل سطر صنف
  const handleItemChange = (index: number, field: keyof RecurringInvoiceItem, val: any) => {
    const newItems = [...items];
    const item = { ...newItems[index], [field]: val };

    const qty = Number(item.quantity) || 0;
    const price = Number(item.unit_price) || 0;
    const disc = Number(item.discount_percent) || 0;
    const tax = Number(item.tax_percent) ?? 14;

    const sub = qty * price * (1 - disc / 100);
    item.total = sub * (1 + tax / 100);

    newItems[index] = item;
    setItems(newItems);
  };

  // حذف سطر صنف
  const handleRemoveItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  // حساب إجماليات النموذج
  const formTotals = useMemo(() => {
    let subtotal = 0;
    let totalTax = 0;

    items.forEach(it => {
      const q = Number(it.quantity) || 0;
      const p = Number(it.unit_price) || 0;
      const d = Number(it.discount_percent) || 0;
      const t = Number(it.tax_percent) ?? 14;

      const lineSub = q * p * (1 - d / 100);
      const lineTax = lineSub * (t / 100);
      subtotal += lineSub;
      totalTax += lineTax;
    });

    let discountAmount = 0;
    if (formData.discount_type === 'percentage') {
      discountAmount = subtotal * ((Number(formData.discount_value) || 0) / 100);
    } else {
      discountAmount = Number(formData.discount_value) || 0;
    }

    const total = Math.max(0, subtotal - discountAmount + totalTax);

    return { subtotal, discountAmount, totalTax, total };
  }, [items, formData.discount_type, formData.discount_value]);

  // حفظ الاشتراك (إنشاء أو تعديل)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customer_id) {
      showToast('يرجى اختيار العميل', 'warning');
      return;
    }
    if (!formData.title) {
      showToast('يرجى كتابة عنوان أو اسم الاشتراك', 'warning');
      return;
    }
    if (items.length === 0) {
      showToast('يرجى إضافة بند واحد على الأقل للاشتراك', 'warning');
      return;
    }

    setSaving(true);
    try {
      const selectedCustomer = customers.find(c => c.id === formData.customer_id);
      const payload = {
        ...formData,
        customer_name: selectedCustomer?.name,
        customer_phone: selectedCustomer?.phone,
      };

      if (editingId) {
        const res = await RecurringInvoiceService.updateRecurringInvoice(editingId, payload, items);
        if (!res.success) throw new Error(res.error);
        showToast('تم تحديث عقد الاشتراك بنجاح', 'success');
      } else {
        const res = await RecurringInvoiceService.createRecurringInvoice(payload, items, userId, orgId);
        if (!res.success) throw new Error(res.error);
        showToast('تم إنشاء عقد الاشتراك وتفعيله بنجاح', 'success');
      }
      setIsModalOpen(false);
      fetchSubscriptions();
    } catch (err: any) {
      showToast(err.message || 'حدث خطأ أثناء الحفظ', 'error');
    } finally {
      setSaving(false);
    }
  };

  // تشغيل فوري وتوليد فاتورة الآن
  const handleExecuteNow = async (sub: RecurringInvoice) => {
    if (!window.confirm(`هل أنت متأكد من رغبتك في إصدار فاتورة الآن للاشتراك: ${sub.title}؟`)) return;

    setExecutingId(sub.id);
    try {
      const res = await RecurringInvoiceService.executeSubscription(sub.id, userId);
      if (!res.success) throw new Error(res.error);

      showToast(`تم بنجاح إصدار الفاتورة رقم #${res.invoiceNumber}`, 'success');
      fetchSubscriptions();

      // إذا كان هناك رابط واتساب، نقترح إرساله
      if (res.whatsappUrl) {
        if (window.confirm('تم إنشاء الفاتورة! هل تريد إرسال تفاصيل الفاتورة للعميل عبر واتساب الآن؟')) {
          window.open(res.whatsappUrl, '_blank');
        }
      }
    } catch (err: any) {
      showToast(err.message || 'فشل إصدار الفاتورة', 'error');
    } finally {
      setExecutingId(null);
    }
  };

  // تشغيل الفحص الجماعي لجميع الاشتراكات المستحقة اليوم
  const handleRunBatch = async () => {
    setRunningBatch(true);
    try {
      const res = await RecurringInvoiceService.processDueRecurringInvoices(orgId);
      if (res.processed === 0) {
        showToast('لا توجد فواتير دورية مستحقة التوليد اليوم 👍', 'info');
      } else {
        showToast(`تمت معالجة ${res.processed} اشتراك. نجح: ${res.successCount}، فشل: ${res.failedCount}`, 'success');
        fetchSubscriptions();
      }
    } catch (err: any) {
      showToast('فشل تشغيل المعالجة التلقائية: ' + err.message, 'error');
    } finally {
      setRunningBatch(false);
    }
  };

  // تغيير حالة الاشتراك (إيقاف / استئناف / إلغاء)
  const handleStatusChange = async (sub: RecurringInvoice, newStatus: RecurringStatus) => {
    try {
      const res = await RecurringInvoiceService.changeStatus(sub.id, newStatus);
      if (!res.success) throw new Error(res.error);
      showToast(`تم تغيير حالة الاشتراك إلى "${getStatusArabic(newStatus)}"`, 'success');
      fetchSubscriptions();
    } catch (err: any) {
      showToast(err.message || 'فشل تحديث الحالة', 'error');
    }
  };

  // حذف الاشتراك
  const handleDelete = async (sub: RecurringInvoice) => {
    if (!window.confirm(`هل أنت متأكد من رغبتك في حذف الاشتراك #${sub.subscription_number}؟`)) return;

    try {
      const res = await RecurringInvoiceService.deleteRecurringInvoice(sub.id);
      if (!res.success) throw new Error(res.error);
      showToast('تم حذف الاشتراك بنجاح', 'success');
      fetchSubscriptions();
    } catch (err: any) {
      showToast(err.message || 'فشل الحذف', 'error');
    }
  };

  // عرض سجل العمليات والفواتير السابقة
  const handleOpenLogs = async (sub: RecurringInvoice) => {
    setLoadingLogs(true);
    setLogsModalOpen(true);
    try {
      const details = await RecurringInvoiceService.getRecurringInvoiceById(sub.id);
      setActiveSubscriptionLogs({ sub: details.subscription, logs: details.logs });
    } catch (err: any) {
      showToast('تعذر تحميل سجل العمليات', 'error');
    } finally {
      setLoadingLogs(false);
    }
  };

  // فتح نافذة إرسال واتساب مباشر
  const handleOpenWhatsApp = (sub: RecurringInvoice) => {
    const phone = sub.customers?.phone || '';
    const today = new Date().toISOString().split('T')[0];
    const dueDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const msg = RecurringInvoiceService.buildWhatsAppMessage(sub, 'مسودة / جارية', today, dueDate);

    setWhatsappPhone(phone);
    setWhatsappMessage(msg);
    setWhatsappModalOpen(true);
  };

  // تصدير إلى Excel
  const handleExportExcel = () => {
    if (subscriptions.length === 0) {
      showToast('لا توجد بيانات للتصدير', 'warning');
      return;
    }

    const exportData = subscriptions.map(s => ({
      'رقم الاشتراك': s.subscription_number,
      'العنوان': s.title,
      'العميل': s.customers?.name || '',
      'رقم الهاتف': s.customers?.phone || '',
      'الدورة': RecurringInvoiceService.getFrequencyArabic(s.frequency),
      'المبلغ الإجمالي': s.total_amount,
      'تاريخ البدء': s.start_date,
      'التشغيل القادم': s.next_run_date,
      'الدورات المكتملة': s.completed_cycles,
      'إجمالي الدورات': s.total_cycles || 'غير محدود',
      'الحالة': getStatusArabic(s.status),
      'ترحيل آلي': s.auto_post ? 'نعم' : 'لا',
      'إشعار واتساب': s.send_whatsapp ? 'نعم' : 'لا',
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الاشتراكات والفواتير الدورية');
    XLSX.writeFile(wb, `Recurring_Subscriptions_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const getStatusArabic = (status: string) => {
    switch (status) {
      case 'active': return 'نشط ومستمر';
      case 'paused': return 'موقوف مؤقتاً';
      case 'completed': return 'مكتمل';
      case 'cancelled': return 'ملغي';
      default: return status;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> نشط</span>;
      case 'paused':
        return <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-amber-100 text-amber-800 flex items-center gap-1"><Pause className="w-3.5 h-3.5" /> موقوف مؤقتاً</span>;
      case 'completed':
        return <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-blue-100 text-blue-800 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> مكتمل</span>;
      case 'cancelled':
        return <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-rose-100 text-rose-800 flex items-center gap-1"><X className="w-3.5 h-3.5" /> ملغي</span>;
      default:
        return <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-gray-100 text-gray-800">{status}</span>;
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
              <Repeat className="w-7 h-7 animate-pulse" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-800">الفواتير الدورية وعقود الاشتراكات</h1>
              <p className="text-sm text-slate-500 font-medium">إدارة الفوترة المتكررة التلقائية، عقود الصيانة، وإرسال إشعارات الواتساب والبريد آلياً</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setSqlModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl font-bold text-xs transition-all"
            title="عرض ونسخ كود SQL لتهيئة الجداول في Supabase"
          >
            <Database className="w-4 h-4" />
            تهيئة SQL
          </button>

          <button
            onClick={handleRunBatch}
            disabled={runningBatch}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm transition-all shadow-sm"
            title="تشغيل فحص فوري لجميع الاشتراكات المستحقة اليوم وإصدار فواتيرها"
          >
            <RefreshCw className={`w-4 h-4 ${runningBatch ? 'animate-spin text-emerald-600' : ''}`} />
            {runningBatch ? 'جارِ المعالجة...' : 'معالجة المستحق اليوم'}
          </button>

          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm transition-all"
          >
            <Download className="w-4 h-4" />
            تصدير إكسيل
          </button>

          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm transition-all shadow-md hover:shadow-emerald-200"
          >
            <Plus className="w-4 h-4" />
            عقد اشتراك جديد
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500">الإيراد الشهري المتكرر (MRR)</p>
            <h3 className="text-2xl font-black text-emerald-600 mt-1">{kpis.mrr.toLocaleString()} <span className="text-xs text-slate-400 font-normal">ج.م</span></h3>
            <p className="text-[11px] text-slate-400 mt-1">ARR السنوي: {(kpis.arr).toLocaleString()} ج.م</p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500">الاشتراكات النشطة الجارية</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">{kpis.activeCount} <span className="text-xs text-slate-400 font-normal">عقد</span></h3>
            <p className="text-[11px] text-emerald-600 mt-1">تعمل آلياً في الخلفية</p>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Repeat className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500">مستحق التوليد اليوم</p>
            <h3 className={`text-2xl font-black mt-1 ${kpis.dueTodayCount > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
              {kpis.dueTodayCount} <span className="text-xs text-slate-400 font-normal">فاتورة</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-1">تاريخ الاستحقاق حان اليوم أو تجاوزه</p>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500">إجمالي الفواتير الصادرة</p>
            <h3 className="text-2xl font-black text-indigo-600 mt-1">{kpis.totalCompletedCycles} <span className="text-xs text-slate-400 font-normal">دورة سابقة</span></h3>
            <p className="text-[11px] text-slate-400 mt-1">تم ترحيلها للقيود والحسابات</p>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <ShieldCheck className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3.5" />
          <input
            type="text"
            placeholder="بحث بالعنوان، رقم الاشتراك، أو العميل..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pr-9 pl-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all font-medium"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-slate-700"
          >
            <option value="all">جميع الحالات</option>
            <option value="active">نشط فقط</option>
            <option value="paused">موقوف مؤقتاً</option>
            <option value="completed">مكتمل</option>
            <option value="cancelled">ملغي</option>
          </select>

          <select
            value={frequencyFilter}
            onChange={e => setFrequencyFilter(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-slate-700"
          >
            <option value="all">جميع فترات التكرار</option>
            <option value="daily">يومي</option>
            <option value="weekly">أسبوعي</option>
            <option value="monthly">شهري</option>
            <option value="quarterly">ربع سنوي (3 أشهر)</option>
            <option value="semi_annual">نصف سنوي (6 أشهر)</option>
            <option value="annual">سنوي</option>
            <option value="custom">مخصص</option>
          </select>
        </div>
      </div>

      {/* Subscriptions Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin text-emerald-600 mb-3" />
            <p className="text-sm font-bold">جارِ تحميل عقود الفواتير الدورية...</p>
          </div>
        ) : filteredSubscriptions.length === 0 ? (
          <div className="text-center p-12">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
              <Repeat className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-slate-700">لا توجد عقود اشتراك مسجلة</h3>
            <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">
              يمكنك إنشاء عقود اشتراك وفوترة دورية لخدماتك مع تفعيل التوليد والتنبيه التلقائي عبر واتساب
            </p>
            <button
              onClick={handleOpenCreate}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-all shadow-sm"
            >
              <Plus className="w-4 h-4" />
              إضافة أول اشتراك دوري
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-xs font-black text-slate-500">
                  <th className="p-4">الاشتراك والعميل</th>
                  <th className="p-4">دورة الفوترة</th>
                  <th className="p-4">التشغيل القادم</th>
                  <th className="p-4">الدورات</th>
                  <th className="p-4">المبلغ الإجمالي</th>
                  <th className="p-4">الحالة</th>
                  <th className="p-4 text-center">الإجراءات والعمليات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredSubscriptions.map(sub => {
                  const isDue = sub.status === 'active' && sub.next_run_date <= todayStr;

                  return (
                    <tr key={sub.id} className={`hover:bg-slate-50/70 transition-colors ${isDue ? 'bg-amber-50/30' : ''}`}>
                      <td className="p-4">
                        <div className="font-bold text-slate-800">{sub.title}</div>
                        <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                          <span className="font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">#{sub.subscription_number}</span>
                          <span>•</span>
                          <span className="font-medium text-slate-600">{sub.customers?.name || 'عميل محذوف'}</span>
                          {sub.customers?.phone && (
                            <span className="text-[11px] text-slate-400" dir="ltr">({sub.customers.phone})</span>
                          )}
                        </div>
                      </td>

                      <td className="p-4">
                        <span className="inline-block px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold">
                          {RecurringInvoiceService.getFrequencyArabic(sub.frequency)}
                        </span>
                        {sub.frequency === 'custom' && sub.custom_interval_days && (
                          <div className="text-[11px] text-slate-400 mt-0.5">كل {sub.custom_interval_days} يوم</div>
                        )}
                      </td>

                      <td className="p-4">
                        <div className="flex items-center gap-1.5 font-bold">
                          <Calendar className="w-4 h-4 text-slate-400" />
                          <span className={isDue ? 'text-amber-600 font-black' : 'text-slate-700'}>
                            {sub.next_run_date}
                          </span>
                        </div>
                        {isDue && (
                          <span className="inline-block text-[10px] font-black text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded mt-0.5">
                            مستحق التوليد اليوم ⚡
                          </span>
                        )}
                      </td>

                      <td className="p-4">
                        <div className="font-bold text-slate-700">
                          {sub.completed_cycles} <span className="text-xs text-slate-400">/ {sub.total_cycles || '∞'}</span>
                        </div>
                        <div className="w-20 bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1">
                          <div
                            className="bg-emerald-500 h-full rounded-full"
                            style={{
                              width: sub.total_cycles ? `${Math.min(100, (sub.completed_cycles / sub.total_cycles) * 100)}%` : '100%',
                            }}
                          />
                        </div>
                      </td>

                      <td className="p-4">
                        <div className="font-black text-slate-800 text-base">
                          {Number(sub.total_amount).toLocaleString()} <span className="text-xs text-slate-400 font-normal">ج.م</span>
                        </div>
                        {sub.auto_post && (
                          <span className="text-[10px] text-emerald-600 font-bold block mt-0.5">ترحيل آلي مفعّل</span>
                        )}
                      </td>

                      <td className="p-4">
                        {getStatusBadge(sub.status)}
                      </td>

                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Run Now */}
                          <button
                            onClick={() => handleExecuteNow(sub)}
                            disabled={executingId === sub.id}
                            title="توليد وإصدار فاتورة الآن"
                            className="p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-all"
                          >
                            <Play className={`w-4 h-4 ${executingId === sub.id ? 'animate-spin' : ''}`} />
                          </button>

                          {/* WhatsApp Alert */}
                          <button
                            onClick={() => handleOpenWhatsApp(sub)}
                            title="إرسال إشعار واتساب للعميل"
                            className="p-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-all"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </button>

                          {/* View Logs / History */}
                          <button
                            onClick={() => handleOpenLogs(sub)}
                            title="سجل الفواتير السابقة الصادرة للاشتراك"
                            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-all"
                          >
                            <FileText className="w-4 h-4" />
                          </button>

                          {/* Edit */}
                          <button
                            onClick={() => handleOpenEdit(sub)}
                            title="تعديل العقد"
                            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-all"
                          >
                            <Edit className="w-4 h-4" />
                          </button>

                          {/* Pause / Resume */}
                          {sub.status === 'active' ? (
                            <button
                              onClick={() => handleStatusChange(sub, 'paused')}
                              title="إيقاف مؤقت"
                              className="p-2 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg transition-all"
                            >
                              <Pause className="w-4 h-4" />
                            </button>
                          ) : sub.status === 'paused' ? (
                            <button
                              onClick={() => handleStatusChange(sub, 'active')}
                              title="استئناف وتنشيط"
                              className="p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-all"
                            >
                              <Play className="w-4 h-4" />
                            </button>
                          ) : null}

                          {/* Delete */}
                          <button
                            onClick={() => handleDelete(sub)}
                            title="حذف"
                            className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
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

      {/* ============================================================================== */}
      {/* Modal: Create / Edit Subscription */}
      {/* ============================================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden my-8 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl">
                  <Repeat className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-black">
                    {editingId ? 'تعديل عقد اشتراك دوري' : 'إنشاء عقد اشتراك وفوترة دورية جديد'}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">ضبط دورة الفوترة، الأصناف والخدمات، وخيارات الإرسال والترحيل</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSave} className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* Basic Details Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">العميل المستفيد *</label>
                  <select
                    required
                    value={formData.customer_id}
                    onChange={e => setFormData(prev => ({ ...prev, customer_id: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  >
                    <option value="">-- اختر العميل --</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ''}</option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">عنوان / مسمى الاشتراك *</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: اشتراك صيانة وبرمجة سنوي، عقد توريد شهري..."
                    value={formData.title}
                    onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">دورة التكرار *</label>
                  <select
                    value={formData.frequency}
                    onChange={e => setFormData(prev => ({ ...prev, frequency: e.target.value as RecurringFrequency }))}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  >
                    <option value="daily">يومي</option>
                    <option value="weekly">أسبوعي</option>
                    <option value="monthly">شهري (كل شهر)</option>
                    <option value="quarterly">ربع سنوي (كل 3 أشهر)</option>
                    <option value="semi_annual">نصف سنوي (كل 6 أشهر)</option>
                    <option value="annual">سنوي (كل سنة)</option>
                    <option value="custom">فترة مخصصة (بالأيام)</option>
                  </select>
                </div>

                {formData.frequency === 'custom' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">تكرار كل (عدد أيام) *</label>
                    <input
                      type="number"
                      min={1}
                      required
                      value={formData.custom_interval_days || 30}
                      onChange={e => setFormData(prev => ({ ...prev, custom_interval_days: Number(e.target.value) }))}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">تاريخ أول تشغيل (Start Date) *</label>
                  <input
                    type="date"
                    required
                    value={formData.start_date}
                    onChange={e => setFormData(prev => ({ ...prev, start_date: e.target.value, next_run_date: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">تاريخ الانتهاء (اختياري)</label>
                  <input
                    type="date"
                    value={formData.end_date || ''}
                    onChange={e => setFormData(prev => ({ ...prev, end_date: e.target.value || null }))}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">إجمالي الدورات (اختياري)</label>
                  <input
                    type="number"
                    min={1}
                    placeholder="اتركه فارغاً ليكون غير محدود"
                    value={formData.total_cycles || ''}
                    onChange={e => setFormData(prev => ({ ...prev, total_cycles: e.target.value ? Number(e.target.value) : null }))}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">المستودع المصدر</label>
                  <select
                    value={formData.warehouse_id || ''}
                    onChange={e => setFormData(prev => ({ ...prev, warehouse_id: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  >
                    <option value="">-- بدون مستودع --</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">مسؤول المبيعات</label>
                  <select
                    value={formData.salesperson_id || ''}
                    onChange={e => setFormData(prev => ({ ...prev, salesperson_id: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  >
                    <option value="">-- اختياري --</option>
                    {salespeople.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Automation Switches */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-wrap gap-6 items-center">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.auto_post}
                    onChange={e => setFormData(prev => ({ ...prev, auto_post: e.target.checked }))}
                    className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                  />
                  <span className="text-xs font-bold text-slate-700">ترحيل الفاتورة للقيد المحاسبي وحساب العميل آلياً (Auto-Post)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.send_whatsapp}
                    onChange={e => setFormData(prev => ({ ...prev, send_whatsapp: e.target.checked }))}
                    className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                  />
                  <span className="text-xs font-bold text-slate-700">تفعيل إرسال إشعار الواتساب التلقائي للعميل</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.send_email}
                    onChange={e => setFormData(prev => ({ ...prev, send_email: e.target.checked }))}
                    className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                  />
                  <span className="text-xs font-bold text-slate-700">تنبيه بالبريد الإلكتروني</span>
                </label>
              </div>

              {/* Items & Services Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-800">الأصناف والخدمات الدورية المدرجة في الفاتورة</h3>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl text-xs font-bold transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    إضافة بند
                  </button>
                </div>

                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 text-slate-600 font-bold">
                      <tr>
                        <th className="p-3">الصنف / الخدمة</th>
                        <th className="p-3 w-24">الكمية</th>
                        <th className="p-3 w-28">السعر (ج.م)</th>
                        <th className="p-3 w-24">خصم %</th>
                        <th className="p-3 w-24">ضريبة %</th>
                        <th className="p-3 w-32">الإجمالي (ج.م)</th>
                        <th className="p-3 w-12 text-center">إلغاء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2">
                            <div className="space-y-1">
                              <select
                                value={item.product_id || ''}
                                onChange={e => handleSelectProduct(idx, e.target.value)}
                                className="w-full p-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg font-bold"
                              >
                                <option value="">-- صنف يدوي أو اختر من القائمة --</option>
                                {products.map(p => (
                                  <option key={p.id} value={p.id}>{p.name} ({p.price || 0} ج.م)</option>
                                ))}
                              </select>
                              <input
                                type="text"
                                required
                                placeholder="اسم أو وصف الخدمة..."
                                value={item.product_name}
                                onChange={e => handleItemChange(idx, 'product_name', e.target.value)}
                                className="w-full p-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                              />
                            </div>
                          </td>

                          <td className="p-2">
                            <input
                              type="number"
                              min={0.01}
                              step="any"
                              value={item.quantity}
                              onChange={e => handleItemChange(idx, 'quantity', Number(e.target.value))}
                              className="w-full p-1.5 text-xs bg-white border border-slate-200 rounded-lg text-center font-bold"
                            />
                          </td>

                          <td className="p-2">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={item.unit_price}
                              onChange={e => handleItemChange(idx, 'unit_price', Number(e.target.value))}
                              className="w-full p-1.5 text-xs bg-white border border-slate-200 rounded-lg text-center font-bold"
                            />
                          </td>

                          <td className="p-2">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={item.discount_percent || 0}
                              onChange={e => handleItemChange(idx, 'discount_percent', Number(e.target.value))}
                              className="w-full p-1.5 text-xs bg-white border border-slate-200 rounded-lg text-center"
                            />
                          </td>

                          <td className="p-2">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={item.tax_percent ?? 14}
                              onChange={e => handleItemChange(idx, 'tax_percent', Number(e.target.value))}
                              className="w-full p-1.5 text-xs bg-white border border-slate-200 rounded-lg text-center"
                            />
                          </td>

                          <td className="p-2 font-black text-slate-800">
                            {(item.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>

                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              disabled={items.length === 1}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Summary and Totals */}
              <div className="flex flex-col md:flex-row justify-between items-start gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="w-full md:w-1/2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات وشروط الفاتورة</label>
                  <textarea
                    rows={2}
                    value={formData.notes || ''}
                    onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="ملاحظات تظهر على الفاتورة ورسالة الواتساب..."
                    className="w-full p-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="w-full md:w-80 space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>المجموع الفرعي:</span>
                    <span className="font-bold">{formTotals.subtotal.toLocaleString()} ج.م</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>ضريبة القيمة المضافة (14%):</span>
                    <span className="font-bold">{formTotals.totalTax.toLocaleString()} ج.م</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>الخصم الإضافي:</span>
                    <span className="font-bold">{formTotals.discountAmount.toLocaleString()} ج.م</span>
                  </div>
                  <div className="border-t border-slate-300 pt-2 flex justify-between text-sm font-black text-slate-900">
                    <span>الإجمالي لكل دورة:</span>
                    <span className="text-emerald-600">{formTotals.total.toLocaleString()} ج.م</span>
                  </div>
                </div>
              </div>

              {/* Modal Footer Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-bold transition-all"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-all shadow-md flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  {saving ? 'جارِ الحفظ...' : editingId ? 'تحديث الاشتراك' : 'حفظ وتفعيل الاشتراك'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================================== */}
      {/* Modal: Execution Logs & History */}
      {/* ============================================================================== */}
      {logsModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-xl">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-black">سجل الفواتير الصادرة للاشتراك</h2>
                  <p className="text-xs text-slate-400">{activeSubscriptionLogs.sub?.title} (#{activeSubscriptionLogs.sub?.subscription_number})</p>
                </div>
              </div>
              <button
                onClick={() => setLogsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {loadingLogs ? (
                <div className="text-center p-8 text-slate-400 font-bold">جارِ تحميل السجل...</div>
              ) : activeSubscriptionLogs.logs.length === 0 ? (
                <div className="text-center p-8 text-slate-400">لم تصدر أي فواتير لهذا الاشتراك بعد</div>
              ) : (
                <div className="space-y-3">
                  {activeSubscriptionLogs.logs.map((log) => (
                    <div key={log.id} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-slate-800 text-sm">
                            {log.invoices?.invoice_number ? `#${log.invoices.invoice_number}` : 'فاتورة دورية'}
                          </span>
                          {log.status === 'success' ? (
                            <span className="px-2 py-0.5 text-[10px] font-black rounded-full bg-emerald-100 text-emerald-800">ناجحة</span>
                          ) : (
                            <span className="px-2 py-0.5 text-[10px] font-black rounded-full bg-rose-100 text-rose-800">فشلت</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 mt-1 flex items-center gap-3">
                          <span>📅 تاريخ التشغيل: {log.run_date}</span>
                          <span>💰 المبلغ: {log.amount.toLocaleString()} ج.م</span>
                        </div>
                        {log.error_message && (
                          <div className="text-xs text-rose-600 mt-1">{log.error_message}</div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {log.notified_whatsapp && (
                          <span className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold" title="تم تنبيه الواتساب">
                            <MessageCircle className="w-4 h-4" />
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setLogsModalOpen(false)}
                className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-all"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================== */}
      {/* Modal: WhatsApp Direct Alert */}
      {/* ============================================================================== */}
      {whatsappModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 bg-emerald-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/20 text-white rounded-xl">
                  <MessageCircle className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-black">إرسال إشعار الفاتورة عبر واتساب</h2>
                  <p className="text-xs text-emerald-100">معاينة الرسالة المنسقة وإرسالها بنقرة واحدة</p>
                </div>
              </div>
              <button
                onClick={() => setWhatsappModalOpen(false)}
                className="p-2 text-emerald-100 hover:text-white rounded-xl hover:bg-emerald-700 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">رقم هاتف العميل (واتساب)</label>
                <input
                  type="text"
                  value={whatsappPhone}
                  onChange={e => setWhatsappPhone(e.target.value)}
                  placeholder="مثال: 01012345678"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">نص الرسالة المنسق</label>
                <textarea
                  rows={8}
                  value={whatsappMessage}
                  onChange={e => setWhatsappMessage(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setWhatsappModalOpen(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-all"
              >
                إلغاء
              </button>

              <button
                onClick={() => {
                  const cleanPhone = RecurringInvoiceService.cleanPhone(whatsappPhone);
                  const url = cleanPhone
                    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(whatsappMessage)}`
                    : `https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`;
                  window.open(url, '_blank');
                  setWhatsappModalOpen(false);
                }}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                فتح وتوجيه لواتساب
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ============================================================================== */}
      {/* Modal: SQL Migration Instructions */}
      {/* ============================================================================== */}
      {sqlModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-xl">
                  <Database className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-black">كود SQL لإنشاء جداول الاشتراكات في Supabase</h2>
                  <p className="text-xs text-slate-400">انسخ الكود وشغّله في نافذة SQL Editor بلوحة تحكم Supabase للمزامنة السحابية</p>
                </div>
              </div>
              <button
                onClick={() => setSqlModalOpen(false)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-medium">
                💡 <strong>ملاحظة:</strong> النظام يعمل حالياً تلقائياً وبشكل فوري عبر التخزين المحلي الآمن. لتفعيل المزامنة السحابية عبر الإنترنت لجميع الأجهزة، انسخ الكود التالي وضعه في Supabase SQL Editor.
              </div>

              <div className="relative">
                <pre className="p-4 bg-slate-900 text-emerald-300 font-mono text-xs rounded-xl overflow-x-auto max-h-60 leading-relaxed" dir="ltr">
{`CREATE TABLE IF NOT EXISTS recurring_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    subscription_number VARCHAR(50) NOT NULL,
    customer_id UUID NOT NULL,
    warehouse_id UUID DEFAULT NULL,
    salesperson_id UUID DEFAULT NULL,
    cost_center_id UUID DEFAULT NULL,
    title VARCHAR(255) NOT NULL,
    frequency VARCHAR(30) NOT NULL DEFAULT 'monthly',
    custom_interval_days INTEGER DEFAULT NULL,
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE DEFAULT NULL,
    next_run_date DATE NOT NULL DEFAULT CURRENT_DATE,
    last_run_date DATE DEFAULT NULL,
    total_cycles INTEGER DEFAULT NULL,
    completed_cycles INTEGER NOT NULL DEFAULT 0,
    auto_post BOOLEAN NOT NULL DEFAULT TRUE,
    send_whatsapp BOOLEAN NOT NULL DEFAULT TRUE,
    send_email BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    subtotal NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    discount_type VARCHAR(20) DEFAULT 'fixed',
    discount_value NUMERIC(15, 2) DEFAULT 0.00,
    tax_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(10) NOT NULL DEFAULT 'EGP',
    notes TEXT,
    created_by UUID DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recurring_invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recurring_invoice_id UUID NOT NULL REFERENCES recurring_invoices(id) ON DELETE CASCADE,
    product_id UUID DEFAULT NULL,
    product_name VARCHAR(255) NOT NULL,
    product_sku VARCHAR(100),
    quantity NUMERIC(15, 4) NOT NULL DEFAULT 1,
    uom_id UUID DEFAULT NULL,
    unit_price NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    discount_percent NUMERIC(5, 2) DEFAULT 0.00,
    tax_percent NUMERIC(5, 2) DEFAULT 14.00,
    total NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recurring_invoice_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    recurring_invoice_id UUID NOT NULL REFERENCES recurring_invoices(id) ON DELETE CASCADE,
    generated_invoice_id UUID DEFAULT NULL,
    run_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(30) NOT NULL DEFAULT 'success',
    error_message TEXT,
    notified_whatsapp BOOLEAN DEFAULT FALSE,
    notified_email BOOLEAN DEFAULT FALSE,
    amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`}
                </pre>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setSqlModalOpen(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-all"
              >
                إغلاق
              </button>
              <button
                onClick={() => {
                  const sql = `CREATE TABLE IF NOT EXISTS recurring_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    subscription_number VARCHAR(50) NOT NULL,
    customer_id UUID NOT NULL,
    warehouse_id UUID DEFAULT NULL,
    salesperson_id UUID DEFAULT NULL,
    cost_center_id UUID DEFAULT NULL,
    title VARCHAR(255) NOT NULL,
    frequency VARCHAR(30) NOT NULL DEFAULT 'monthly',
    custom_interval_days INTEGER DEFAULT NULL,
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE DEFAULT NULL,
    next_run_date DATE NOT NULL DEFAULT CURRENT_DATE,
    last_run_date DATE DEFAULT NULL,
    total_cycles INTEGER DEFAULT NULL,
    completed_cycles INTEGER NOT NULL DEFAULT 0,
    auto_post BOOLEAN NOT NULL DEFAULT TRUE,
    send_whatsapp BOOLEAN NOT NULL DEFAULT TRUE,
    send_email BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    subtotal NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    discount_type VARCHAR(20) DEFAULT 'fixed',
    discount_value NUMERIC(15, 2) DEFAULT 0.00,
    tax_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(10) NOT NULL DEFAULT 'EGP',
    notes TEXT,
    created_by UUID DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recurring_invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recurring_invoice_id UUID NOT NULL REFERENCES recurring_invoices(id) ON DELETE CASCADE,
    product_id UUID DEFAULT NULL,
    product_name VARCHAR(255) NOT NULL,
    product_sku VARCHAR(100),
    quantity NUMERIC(15, 4) NOT NULL DEFAULT 1,
    uom_id UUID DEFAULT NULL,
    unit_price NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    discount_percent NUMERIC(5, 2) DEFAULT 0.00,
    tax_percent NUMERIC(5, 2) DEFAULT 14.00,
    total NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recurring_invoice_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    recurring_invoice_id UUID NOT NULL REFERENCES recurring_invoices(id) ON DELETE CASCADE,
    generated_invoice_id UUID DEFAULT NULL,
    run_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(30) NOT NULL DEFAULT 'success',
    error_message TEXT,
    notified_whatsapp BOOLEAN DEFAULT FALSE,
    notified_email BOOLEAN DEFAULT FALSE,
    amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`;
                  navigator.clipboard.writeText(sql);
                  showToast('تم نسخ كود SQL بنجاح إلى الحافظة 📋', 'success');
                }}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" />
                نسخ كود SQL للحافظة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecurringInvoicesManager;
