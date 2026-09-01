import React, { useState, useEffect, useMemo } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { 
  FileSpreadsheet, Plus, Search, CheckCircle, Clock, 
  ArrowRightLeft, Package, User, Calendar, Printer, 
  RefreshCw, X, Check, Database, Copy, MessageSquare, 
  Send, Trophy, Award, TrendingDown, DollarSign, ShieldAlert,
  HelpCircle, Eye, ChevronLeft, ChevronRight, Share2, AlertCircle
} from 'lucide-react';
import { PurchaseRfq, PurchaseRfqItem, VendorQuotationBid, VendorQuotationBidItem, PurchaseRfqStatus } from '../../types';
import RfqService from '../../services/rfqService';
import { useToast } from '../../context/ToastContext';

export const RfqBiddingManager: React.FC = () => {
  const { suppliers, products, warehouses, currentUser } = useAccounting();
  const { showToast } = useToast();

  const [rfqs, setRfqs] = useState<PurchaseRfq[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modals
  const [isCreateRfqModalOpen, setIsCreateRfqModalOpen] = useState(false);
  const [savingRfq, setSavingRfq] = useState(false);

  const [isSubmitBidModalOpen, setIsSubmitBidModalOpen] = useState(false);
  const [activeRfqForBid, setActiveRfqForBid] = useState<PurchaseRfq | null>(null);
  const [savingBid, setSavingBid] = useState(false);

  const [isComparisonMatrixOpen, setIsComparisonMatrixOpen] = useState(false);
  const [activeRfqForMatrix, setActiveRfqForMatrix] = useState<PurchaseRfq | null>(null);
  const [awardingBidId, setAwardingBidId] = useState<string | null>(null);

  const [whatsappModalOpen, setWhatsappModalOpen] = useState(false);
  const [whatsappMsgText, setWhatsappMsgText] = useState('');
  const [selectedSupplierPhone, setSelectedSupplierPhone] = useState('');

  const [sqlModalOpen, setSqlModalOpen] = useState(false);

  // Form State for RFQ
  const [rfqFormData, setRfqFormData] = useState<Partial<PurchaseRfq>>({
    rfq_number: '',
    title: '',
    issue_date: new Date().toISOString().split('T')[0],
    deadline_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    target_warehouse_id: '',
    notes: '',
  });
  const [rfqItems, setRfqItems] = useState<PurchaseRfqItem[]>([]);

  // Form State for Bid Submission
  const [bidFormData, setBidFormData] = useState<Partial<VendorQuotationBid>>({
    supplier_id: '',
    quotation_reference: '',
    bid_date: new Date().toISOString().split('T')[0],
    valid_until: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    discount_amount: 0,
    shipping_cost: 0,
    lead_time_days: 3,
    payment_terms: 'آجل 30 يوم',
    warranty_terms: 'ضمان سنة',
    evaluation_notes: '',
  });
  const [bidLineItems, setBidLineItems] = useState<{ [rfqItemId: string]: { unit_price: number; discount_pct: number; tax_pct: number; notes: string } }>({});

  const orgId = (currentUser as any)?.organization_id || '';
  const userId = currentUser?.id || '';

  // جلب المناقصات
  const fetchRfqs = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const data = await RfqService.getRfqs(orgId, { status: statusFilter });
      setRfqs(data);
    } catch (err: any) {
      showToast('تعذر تحميل طلبات عروض الأسعار: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRfqs();
  }, [orgId, statusFilter]);

  // تصفية المناقصات
  const filteredRfqs = useMemo(() => {
    return rfqs.filter(r => {
      const matchSearch = 
        r.rfq_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.bids?.some(b => b.supplier_name?.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchStatus = statusFilter === 'all' || r.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [rfqs, searchTerm, statusFilter]);

  // إحصائيات
  const kpis = useMemo(() => {
    const totalRfqs = rfqs.length;
    const openRfqs = rfqs.filter(r => r.status === 'open' || r.status === 'under_evaluation').length;
    const totalBidsReceived = rfqs.reduce((sum, r) => sum + (r.bids?.length || 0), 0);
    const awardedCount = rfqs.filter(r => r.status === 'awarded').length;

    return { totalRfqs, openRfqs, totalBidsReceived, awardedCount };
  }, [rfqs]);

  // فتح نافذة إنشاء RFQ
  const handleOpenCreateRfq = () => {
    setRfqFormData({
      rfq_number: `RFQ-${Date.now().toString().slice(-6)}`,
      title: 'طلب عروض أسعار توريد خامات ومستلزمات',
      issue_date: new Date().toISOString().split('T')[0],
      deadline_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      target_warehouse_id: warehouses.length > 0 ? warehouses[0].id : '',
      notes: '',
    });

    setRfqItems([
      {
        product_id: products.length > 0 ? products[0].id : '',
        product_name: products.length > 0 ? products[0].name : '',
        quantity: 100,
        target_price: 0,
        specifications: 'مطابق للمواصفات القياسية مع شهادة ضمان',
      }
    ]);

    setIsCreateRfqModalOpen(true);
  };

  const handleAddRfqItem = () => {
    setRfqItems(prev => [
      ...prev,
      {
        product_id: products.length > 0 ? products[0].id : '',
        product_name: products.length > 0 ? products[0].name : '',
        quantity: 50,
        target_price: 0,
        specifications: '',
      }
    ]);
  };

  const handleRfqItemChange = (index: number, field: keyof PurchaseRfqItem, val: any) => {
    const newItems = [...rfqItems];
    const item = { ...newItems[index], [field]: val };
    if (field === 'product_id') {
      const prod = products.find(p => p.id === val);
      if (prod) item.product_name = prod.name;
    }
    newItems[index] = item;
    setRfqItems(newItems);
  };

  const handleRemoveRfqItem = (index: number) => {
    setRfqItems(prev => prev.filter((_, i) => i !== index));
  };

  // حفظ الـ RFQ
  const handleSaveRfq = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rfqItems.length === 0) {
      showToast('يرجى إضافة صنف واحد على الأقل للمناقصة', 'warning');
      return;
    }

    setSavingRfq(true);
    try {
      const targetWh = warehouses.find(w => w.id === rfqFormData.target_warehouse_id);
      const res = await RfqService.createRfq(
        { ...rfqFormData, target_warehouse_name: targetWh?.name },
        rfqItems,
        orgId,
        userId
      );

      if (!res.success) throw new Error(res.error);

      showToast(`تم إنشاء طلب عروض الأسعار #${res.data?.rfq_number} بنجاح`, 'success');
      setIsCreateRfqModalOpen(false);
      fetchRfqs();
    } catch (err: any) {
      showToast(err.message || 'فشل إنشاء المناقصة', 'error');
    } finally {
      setSavingRfq(false);
    }
  };

  // فتح نافذة تقديم عرض سعر المورد
  const handleOpenSubmitBid = (rfq: PurchaseRfq) => {
    setActiveRfqForBid(rfq);
    setBidFormData({
      supplier_id: suppliers.length > 0 ? suppliers[0].id : '',
      quotation_reference: `QUO-${Date.now().toString().slice(-4)}`,
      bid_date: new Date().toISOString().split('T')[0],
      valid_until: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      discount_amount: 0,
      shipping_cost: 0,
      lead_time_days: 3,
      payment_terms: 'آجل 30 يوم',
      warranty_terms: 'ضمان سنة',
      evaluation_notes: '',
    });

    const initialLineInputs: { [rfqItemId: string]: { unit_price: number; discount_pct: number; tax_pct: number; notes: string } } = {};
    (rfq.items || []).forEach((it, idx) => {
      const key = it.id || `item-${idx}`;
      initialLineInputs[key] = {
        unit_price: Number(it.target_price) || 100,
        discount_pct: 0,
        tax_pct: 14,
        notes: '',
      };
    });
    setBidLineItems(initialLineInputs);
    setIsSubmitBidModalOpen(true);
  };

  // حفظ عرض سعر المورد
  const handleSaveBid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRfqForBid || !bidFormData.supplier_id) return;

    setSavingBid(true);
    try {
      const selectedSup = suppliers.find(s => s.id === bidFormData.supplier_id);
      const supplierName = selectedSup?.name || 'مورد';
      const supplierPhone = selectedSup?.phone || '';

      const bidItemsPayload: VendorQuotationBidItem[] = (activeRfqForBid.items || []).map((it, idx) => {
        const key = it.id || `item-${idx}`;
        const line = bidLineItems[key] || { unit_price: 0, discount_pct: 0, tax_pct: 14, notes: '' };
        const lineSub = Number(it.quantity) * Number(line.unit_price) * (1 - (line.discount_pct || 0) / 100);
        const lineTotal = lineSub * (1 + (line.tax_pct || 14) / 100);

        return {
          rfq_item_id: it.id,
          product_id: it.product_id,
          product_name: it.product_name,
          offered_quantity: it.quantity,
          unit_price: Number(line.unit_price) || 0,
          discount_percent: Number(line.discount_pct) || 0,
          tax_percent: Number(line.tax_pct) ?? 14,
          total_price: lineTotal,
          notes: line.notes,
        };
      });

      const res = await RfqService.submitBid(
        activeRfqForBid.id,
        {
          ...bidFormData,
          supplier_name: supplierName,
          supplier_phone: supplierPhone,
        },
        bidItemsPayload,
        orgId
      );

      if (!res.success) throw new Error(res.error);

      showToast(`تم تسجيل عرض سعر المورد "${supplierName}" بنجاح`, 'success');
      setIsSubmitBidModalOpen(false);
      fetchRfqs();
    } catch (err: any) {
      showToast(err.message || 'فشل تسجيل عرض السعر', 'error');
    } finally {
      setSavingBid(false);
    }
  };

  // فتح مصفوفة المقارنة
  const handleOpenComparisonMatrix = (rfq: PurchaseRfq) => {
    setActiveRfqForMatrix(rfq);
    setIsComparisonMatrixOpen(true);
  };

  // ترسية العرض الفائز
  const handleAwardBid = async (rfq: PurchaseRfq, bid: VendorQuotationBid) => {
    if (!window.confirm(`هل أنت متأكد من رغبتك في ترسية المناقصة #${rfq.rfq_number} على المورد "${bid.supplier_name}" بمبلغ ${Number(bid.total_amount).toLocaleString()} ج.م وتوليد أمر شراء رسمي (PO)؟`)) {
      return;
    }

    setAwardingBidId(bid.id);
    try {
      const res = await RfqService.awardBid(rfq.id, bid.id, orgId, userId);
      if (!res.success) throw new Error(res.error);

      showToast(`تهانينا! تمت الترسية بنجاح وإصدار أمر الشراء #${res.poNumber} 🎉`, 'success');

      if (res.whatsappUrl) {
        if (window.confirm('تم تجهيز رسالة الترسية للمورد عبر الواتساب. هل تريد فتح المحادثة الآن؟')) {
          window.open(res.whatsappUrl, '_blank');
        }
      }

      setIsComparisonMatrixOpen(false);
      fetchRfqs();
    } catch (err: any) {
      showToast(err.message || 'فشلت عملية الترسية', 'error');
    } finally {
      setAwardingBidId(null);
    }
  };

  // فتح دعوة الواتساب
  const handleOpenWhatsappInvite = (rfq: PurchaseRfq) => {
    const defaultSup = suppliers.length > 0 ? suppliers[0] : null;
    const msg = RfqService.buildRfqWhatsAppInvitation(rfq, defaultSup?.name);
    setWhatsappMsgText(msg);
    setSelectedSupplierPhone(defaultSup?.phone || '');
    setWhatsappModalOpen(true);
  };

  const handleSendWhatsappDirect = () => {
    if (!selectedSupplierPhone) {
      showToast('يرجى تحديد رقم هاتف المورد', 'warning');
      return;
    }
    const cleanPhone = (selectedSupplierPhone || '').replace(/[^0-9]/g, '');
    const url = `https://wa.me/${cleanPhone.startsWith('01') ? '2' + cleanPhone : cleanPhone}?text=${encodeURIComponent(whatsappMsgText)}`;
    window.open(url, '_blank');
    setWhatsappModalOpen(false);
  };

  const getStatusBadge = (status: PurchaseRfqStatus) => {
    switch (status) {
      case 'open':
        return <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-blue-100 text-blue-800 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> مفتوح لتلقي العروض</span>;
      case 'under_evaluation':
        return <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-purple-100 text-purple-800 flex items-center gap-1"><FileSpreadsheet className="w-3.5 h-3.5" /> قيد تقييم العروض</span>;
      case 'awarded':
        return <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800 flex items-center gap-1"><Trophy className="w-3.5 h-3.5" /> تمت الترسية (PO معتمد)</span>;
      case 'cancelled':
        return <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-rose-100 text-rose-800 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> ملغي</span>;
      default:
        return <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-gray-100 text-gray-800">{status}</span>;
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
              <FileSpreadsheet className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-800">طلبات عروض الأسعار ومناقصات الموردين (RFQ)</h1>
              <p className="text-sm text-slate-500 font-medium">طرح المناقصات، استقبال عطاءات الموردين، مصفوفة المقارنة التفاعلية، والترسية المباشرة لأمر شراء PO</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setSqlModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-all"
            title="عرض كود SQL لإنشاء جداول المناقصات في Supabase"
          >
            <Database className="w-4 h-4" />
            تهيئة SQL
          </button>

          <button
            onClick={fetchRfqs}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all"
            title="تحديث البيانات"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
          </button>

          <button
            onClick={handleOpenCreateRfq}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-all shadow-md hover:shadow-indigo-200"
          >
            <Plus className="w-4 h-4" />
            طلب عروض أسعار جديد (RFQ)
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500">إجمالي طلبات العروض (RFQ)</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">{kpis.totalRfqs} <span className="text-xs text-slate-400 font-normal">طلب</span></h3>
            <p className="text-[11px] text-slate-400 mt-1">المناقصات المسجلة بالنظام</p>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500">مناقصات نشطة ومفتوحة</p>
            <h3 className="text-2xl font-black text-blue-600 mt-1">{kpis.openRfqs} <span className="text-xs text-slate-400 font-normal">مناقصة</span></h3>
            <p className="text-[11px] text-blue-600 mt-1">تستقبل وتنتظر عروض الموردين</p>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500">إجمالي العطاءات المستلمة</p>
            <h3 className="text-2xl font-black text-purple-600 mt-1">{kpis.totalBidsReceived} <span className="text-xs text-slate-400 font-normal">عرض سعر</span></h3>
            <p className="text-[11px] text-purple-600 mt-1">جاهزة للمقارنة والتقييم</p>
          </div>
          <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
            <User className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500">مناقصات تمت ترسيتها</p>
            <h3 className="text-2xl font-black text-emerald-600 mt-1">{kpis.awardedCount} <span className="text-xs text-slate-400 font-normal">تمت الترسية</span></h3>
            <p className="text-[11px] text-emerald-600 mt-1">تحولت إلى أوامر شراء PO</p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <Trophy className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3.5" />
          <input
            type="text"
            placeholder="بحث برقم المناقصة، العنوان، أو المورد..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pr-9 pl-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700"
          >
            <option value="all">جميع الحالات</option>
            <option value="open">مفتوح لتلقي العروض</option>
            <option value="under_evaluation">قيد التقييم والمقارنة</option>
            <option value="awarded">تمت الترسية (PO معتمد)</option>
            <option value="cancelled">ملغي</option>
          </select>
        </div>
      </div>

      {/* RFQ Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {loading ? (
          <div className="col-span-full text-center p-12 text-slate-400 font-bold">
            <RefreshCw className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-3" />
            جارِ تحميل طلبات عروض الأسعار والمناقصات...
          </div>
        ) : filteredRfqs.length === 0 ? (
          <div className="col-span-full text-center p-12 bg-white rounded-2xl border border-slate-100">
            <FileSpreadsheet className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-700">لا توجد طلبات عروض أسعار مطابقة</h3>
            <p className="text-xs text-slate-400 mt-1">ابدأ بإنشاء أول طلب عرض أسعار لإرساله للموردين ومقارنة العروض</p>
            <button
              onClick={handleOpenCreateRfq}
              className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-sm"
            >
              + إنشاء أول طلب عرض أسعار
            </button>
          </div>
        ) : (
          filteredRfqs.map(rfq => {
            const bidsCount = rfq.bids?.length || 0;
            const itemsCount = rfq.items?.length || 0;
            const isAwarded = rfq.status === 'awarded';

            return (
              <div key={rfq.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4 hover:shadow-md transition-all flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-xs font-black text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg">
                      #{rfq.rfq_number}
                    </span>
                    {getStatusBadge(rfq.status)}
                  </div>

                  <div>
                    <h3 className="font-bold text-slate-800 text-base">{rfq.title}</h3>
                    <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                      <span>تاريخ الإغلاق: ⏰ <strong>{rfq.deadline_date}</strong></span>
                    </div>
                  </div>

                  {/* Items summary */}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1.5">
                    <div className="text-xs font-bold text-slate-600 flex justify-between">
                      <span>الأصناف المطلوبة ({itemsCount}):</span>
                      {rfq.target_warehouse_name && (
                        <span className="text-indigo-600">لصالح: {rfq.target_warehouse_name}</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-700 space-y-1 max-h-20 overflow-y-auto">
                      {(rfq.items || []).map((it, idx) => (
                        <div key={idx} className="flex justify-between items-center text-[11px]">
                          <span className="font-bold truncate max-w-[170px]">• {it.product_name}</span>
                          <span className="font-mono text-slate-500 font-bold">{it.quantity} وحدة</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Bids received summary */}
                  <div className="flex items-center justify-between text-xs px-1">
                    <span className="text-slate-500 font-bold">العروض المستلمة:</span>
                    <span className="font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                      {bidsCount} موردين
                    </span>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleOpenComparisonMatrix(rfq)}
                      className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1"
                      title="مقارنة العروض جنباً إلى جنب"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      مصفوفة المقارنة ({bidsCount})
                    </button>

                    <button
                      onClick={() => handleOpenSubmitBid(rfq)}
                      disabled={isAwarded}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 disabled:opacity-50"
                      title="إدخال عرض سعر مورد"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      تسجيل عرض مورد
                    </button>
                  </div>

                  <button
                    onClick={() => handleOpenWhatsappInvite(rfq)}
                    className="w-full py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    مشاركة ودعوة الموردين عبر الواتساب
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ============================================================================== */}
      {/* Modal: Create Purchase RFQ */}
      {/* ============================================================================== */}
      {isCreateRfqModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden my-8 max-h-[90vh] flex flex-col">
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-xl">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-black">إنشاء طلب عروض أسعار جديد (RFQ)</h2>
                  <p className="text-xs text-slate-400">تحديد الأصناف والمواصفات وموعد الإغلاق لطرحها على الموردين</p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateRfqModalOpen(false)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRfq} className="p-6 space-y-5 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">عنوان المناقصة / الطلب *</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: توريد خامات تعبئة وتغليف لشهر سبتمبر"
                    value={rfqFormData.title}
                    onChange={e => setRfqFormData(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">المستودع المستهدف للتسليم</label>
                  <select
                    value={rfqFormData.target_warehouse_id || ''}
                    onChange={e => setRfqFormData(prev => ({ ...prev, target_warehouse_id: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
                  >
                    <option value="">-- المستودع الرئيسي --</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ الطرح</label>
                  <input
                    type="date"
                    required
                    value={rfqFormData.issue_date}
                    onChange={e => setRfqFormData(prev => ({ ...prev, issue_date: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ الإغلاق والحد الأقصى لتلقي العروض ⏰ *</label>
                  <input
                    type="date"
                    required
                    value={rfqFormData.deadline_date}
                    onChange={e => setRfqFormData(prev => ({ ...prev, deadline_date: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-indigo-700"
                  />
                </div>
              </div>

              {/* Items Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-800">الأصناف والمواصفات المطلوبة</h3>
                  <button
                    type="button"
                    onClick={handleAddRfqItem}
                    className="px-3 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl text-xs font-bold"
                  >
                    + إضافة صنف
                  </button>
                </div>

                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 text-slate-600 font-bold">
                      <tr>
                        <th className="p-3">الصنف</th>
                        <th className="p-3 w-28">الكمية المطلوبة</th>
                        <th className="p-3 w-32">السعر المستهدف (ج.م)</th>
                        <th className="p-3">المواصفات والشروط</th>
                        <th className="p-3 w-12 text-center">إلغاء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rfqItems.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2">
                            <select
                              required
                              value={item.product_id || ''}
                              onChange={e => handleRfqItemChange(idx, 'product_id', e.target.value)}
                              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-bold"
                            >
                              <option value="">-- اختر الصنف --</option>
                              {products.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                          </td>

                          <td className="p-2">
                            <input
                              type="number"
                              min={0.01}
                              step="any"
                              required
                              value={item.quantity}
                              onChange={e => handleRfqItemChange(idx, 'quantity', Number(e.target.value))}
                              className="w-full p-2 bg-white border border-slate-200 rounded-lg text-center font-bold"
                            />
                          </td>

                          <td className="p-2">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              placeholder="0.00"
                              value={item.target_price || ''}
                              onChange={e => handleRfqItemChange(idx, 'target_price', Number(e.target.value))}
                              className="w-full p-2 bg-white border border-slate-200 rounded-lg text-center font-bold"
                            />
                          </td>

                          <td className="p-2">
                            <input
                              type="text"
                              placeholder="مثال: جودة فرز أول، تسليم المستودع"
                              value={item.specifications || ''}
                              onChange={e => handleRfqItemChange(idx, 'specifications', e.target.value)}
                              className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs"
                            />
                          </td>

                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveRfqItem(idx)}
                              disabled={rfqItems.length === 1}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateRfqModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingRfq}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  {savingRfq ? 'جارِ الطرح والحفظ...' : 'طرح طلب عروض الأسعار'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================================== */}
      {/* Modal: Submit Vendor Bid */}
      {/* ============================================================================== */}
      {isSubmitBidModalOpen && activeRfqForBid && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden my-8 max-h-[90vh] flex flex-col">
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-xl">
                  <Plus className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-black">تسجيل عرض سعر مورد للمناقصة #{activeRfqForBid.rfq_number}</h2>
                  <p className="text-xs text-slate-400">{activeRfqForBid.title}</p>
                </div>
              </div>
              <button
                onClick={() => setIsSubmitBidModalOpen(false)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBid} className="p-6 space-y-5 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">اختر المورد المقدم للعرض *</label>
                  <select
                    required
                    value={bidFormData.supplier_id}
                    onChange={e => setBidFormData(prev => ({ ...prev, supplier_id: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
                  >
                    <option value="">-- اختر المورد --</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name} {s.phone ? `(${s.phone})` : ''}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رقم عرض المورد (Ref)</label>
                  <input
                    type="text"
                    placeholder="QUO-991"
                    value={bidFormData.quotation_reference || ''}
                    onChange={e => setBidFormData(prev => ({ ...prev, quotation_reference: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">مدة التوريد (بالأيام) *</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={bidFormData.lead_time_days}
                    onChange={e => setBidFormData(prev => ({ ...prev, lead_time_days: Number(e.target.value) }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-center"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">شروط السداد والدفع</label>
                  <input
                    type="text"
                    placeholder="آجل 30 يوم / نقدي"
                    value={bidFormData.payment_terms || ''}
                    onChange={e => setBidFormData(prev => ({ ...prev, payment_terms: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">مصاريف الشحن / النقل (ج.م)</label>
                  <input
                    type="number"
                    min={0}
                    value={bidFormData.shipping_cost}
                    onChange={e => setBidFormData(prev => ({ ...prev, shipping_cost: Number(e.target.value) }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-center"
                  />
                </div>
              </div>

              {/* Bid Line Items */}
              <div className="space-y-3">
                <h3 className="text-sm font-black text-slate-800">أسعار الأصناف المقدمة من المورد</h3>
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 text-slate-600 font-bold">
                      <tr>
                        <th className="p-3">الصنف والكمية المطلوبة</th>
                        <th className="p-3 w-32 text-center">سعر الوحدة المعروض (ج.م) *</th>
                        <th className="p-3 w-24 text-center">خصم %</th>
                        <th className="p-3 w-32 text-center">إجمالي السطر</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(activeRfqForBid.items || []).map((it, idx) => {
                        const key = it.id || `item-${idx}`;
                        const line = bidLineItems[key] || { unit_price: 0, discount_pct: 0, tax_pct: 14, notes: '' };
                        const lineSub = Number(it.quantity) * Number(line.unit_price) * (1 - (line.discount_pct || 0) / 100);
                        const lineTotal = lineSub * (1 + (line.tax_pct || 14) / 100);

                        return (
                          <tr key={key} className="hover:bg-slate-50">
                            <td className="p-3">
                              <div className="font-bold text-slate-800">{it.product_name}</div>
                              <div className="text-[11px] text-slate-400">الكمية: {it.quantity} وحدة</div>
                            </td>

                            <td className="p-3">
                              <input
                                type="number"
                                min={0}
                                step="any"
                                required
                                value={line.unit_price}
                                onChange={e => {
                                  setBidLineItems(prev => ({
                                    ...prev,
                                    [key]: { ...prev[key], unit_price: Number(e.target.value) }
                                  }));
                                }}
                                className="w-full p-2 bg-white border border-slate-200 rounded-lg text-center font-bold text-indigo-700"
                              />
                            </td>

                            <td className="p-3">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={line.discount_pct}
                                onChange={e => {
                                  setBidLineItems(prev => ({
                                    ...prev,
                                    [key]: { ...prev[key], discount_pct: Number(e.target.value) }
                                  }));
                                }}
                                className="w-full p-2 bg-white border border-slate-200 rounded-lg text-center font-bold"
                              />
                            </td>

                            <td className="p-3 text-center font-bold font-mono text-emerald-700 bg-emerald-50/50">
                              {lineTotal.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsSubmitBidModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingBid}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  {savingBid ? 'جارِ الحفظ...' : 'تسجيل عرض المورد'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================================== */}
      {/* Modal: Side-by-Side Bids Comparison Matrix */}
      {/* ============================================================================== */}
      {isComparisonMatrixOpen && activeRfqForMatrix && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden my-8 max-h-[92vh] flex flex-col">
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-xl">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-black">مصفوفة مقارنة عروض أسعار الموردين</h2>
                  <p className="text-xs text-slate-400">مناقصة #{activeRfqForMatrix.rfq_number} — {activeRfqForMatrix.title}</p>
                </div>
              </div>
              <button
                onClick={() => setIsComparisonMatrixOpen(false)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              {(!activeRfqForMatrix.bids || activeRfqForMatrix.bids.length === 0) ? (
                <div className="text-center p-12 bg-slate-50 rounded-2xl border border-slate-100">
                  <User className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <h3 className="text-base font-bold text-slate-700">لم يتم تسجيل أي عروض أسعار لهذه المناقصة بعد</h3>
                  <p className="text-xs text-slate-400 mt-1">قم بتسجيل عروض أسعار الموردين لمقارنتها هنا واختيار العرض الأفضل</p>
                  <button
                    onClick={() => {
                      setIsComparisonMatrixOpen(false);
                      handleOpenSubmitBid(activeRfqForMatrix);
                    }}
                    className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold"
                  >
                    + تسجيل أول عرض مورد
                  </button>
                </div>
              ) : (
                <>
                  {/* Bids Summary Comparison Table */}
                  <div className="border border-slate-200 rounded-2xl overflow-x-auto">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-black">
                        <tr>
                          <th className="p-4">المورد المقدم للعرض</th>
                          <th className="p-4 text-center">إجمالي القيمة (ج.م)</th>
                          <th className="p-4 text-center">مدة التوريد</th>
                          <th className="p-4 text-center">شروط السداد</th>
                          <th className="p-4 text-center">الحالة / التقييم</th>
                          <th className="p-4 text-center">الترسية وأمر الشراء</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(() => {
                          const bids = activeRfqForMatrix.bids || [];
                          const minAmount = Math.min(...bids.map(b => Number(b.total_amount) || 999999999));
                          const minLeadTime = Math.min(...bids.map(b => Number(b.lead_time_days) || 999));

                          return bids.map(bid => {
                            const isLowestPrice = Number(bid.total_amount) === minAmount && bids.length > 1;
                            const isFastest = Number(bid.lead_time_days) === minLeadTime && bids.length > 1;
                            const isAwarded = bid.is_awarded;

                            return (
                              <tr key={bid.id} className={`hover:bg-slate-50 transition-colors ${isAwarded ? 'bg-emerald-50/60' : ''}`}>
                                <td className="p-4">
                                  <div className="font-bold text-slate-800 text-sm">{bid.supplier_name}</div>
                                  <div className="text-[11px] text-slate-400 mt-0.5">رقم العرض: {bid.quotation_reference}</div>
                                </td>

                                <td className="p-4 text-center">
                                  <div className="font-black text-base font-mono text-slate-800">
                                    {Number(bid.total_amount).toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م
                                  </div>
                                  {isLowestPrice && (
                                    <span className="inline-block mt-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full">
                                      ⭐️ أفضل وأقل سعر
                                    </span>
                                  )}
                                </td>

                                <td className="p-4 text-center">
                                  <div className="font-bold text-slate-700">{bid.lead_time_days} أيام</div>
                                  {isFastest && (
                                    <span className="inline-block mt-1 px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold rounded-full">
                                      ⚡️ أسرع توريد
                                    </span>
                                  )}
                                </td>

                                <td className="p-4 text-center font-bold text-slate-600">
                                  {bid.payment_terms}
                                </td>

                                <td className="p-4 text-center">
                                  {isAwarded ? (
                                    <span className="px-3 py-1 bg-emerald-600 text-white rounded-full font-bold text-[11px] flex items-center justify-center gap-1">
                                      <Trophy className="w-3.5 h-3.5" /> العرض الفائز
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 text-xs">قيد المقارنة</span>
                                  )}
                                </td>

                                <td className="p-4 text-center">
                                  {isAwarded ? (
                                    <span className="text-xs font-bold text-emerald-700">تم إصدار PO رسمي</span>
                                  ) : (
                                    <button
                                      onClick={() => handleAwardBid(activeRfqForMatrix, bid)}
                                      disabled={awardingBidId !== null}
                                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-emerald-200 transition-all flex items-center justify-center gap-1 mx-auto"
                                    >
                                      <Award className="w-4 h-4" />
                                      ترسية وإصدار PO
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>

                  {/* Detailed Line Items Comparison Matrix */}
                  <div className="space-y-3 pt-2">
                    <h4 className="text-sm font-black text-slate-800 flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
                      تفاصيل أسعار الأصناف لكل مورد (Line-by-Line Breakdown)
                    </h4>

                    <div className="border border-slate-200 rounded-2xl overflow-x-auto">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-slate-100 text-slate-700 font-bold">
                          <tr>
                            <th className="p-3">الصنف والكمية</th>
                            {(activeRfqForMatrix.bids || []).map(b => (
                              <th key={b.id} className="p-3 text-center border-r border-slate-200">
                                <div className="font-bold text-indigo-900">{b.supplier_name}</div>
                                <div className="text-[10px] text-slate-400 font-normal">سعر الوحدة (ج.م)</div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(activeRfqForMatrix.items || []).map((it, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="p-3 font-bold text-slate-800">
                                <div>{it.product_name}</div>
                                <div className="text-[11px] text-slate-400">الكمية: {it.quantity} وحدة</div>
                              </td>

                              {(activeRfqForMatrix.bids || []).map(b => {
                                const bidItem = b.items?.find(bi => bi.product_name === it.product_name || bi.product_id === it.product_id);
                                const unitP = Number(bidItem?.unit_price) || 0;

                                return (
                                  <td key={b.id} className="p-3 text-center border-r border-slate-100 font-bold font-mono text-slate-800">
                                    {unitP > 0 ? `${unitP.toFixed(2)} ج.م` : '—'}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                طباعة تقرير المقارنة
              </button>

              <button
                onClick={() => setIsComparisonMatrixOpen(false)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================== */}
      {/* Modal: WhatsApp Invitation Preview */}
      {/* ============================================================================== */}
      {whatsappModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 bg-emerald-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/20 text-white rounded-xl">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-black">دعوة تقديم عرض أسعار عبر الواتساب</h2>
                  <p className="text-xs text-emerald-100">إرسال بنود المناقصة وموعد الإغلاق للموردين</p>
                </div>
              </div>
              <button
                onClick={() => setWhatsappModalOpen(false)}
                className="p-2 text-emerald-100 hover:text-white rounded-xl hover:bg-emerald-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اختر المورد أو أدخل رقم الهاتف</label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    onChange={e => {
                      const sup = suppliers.find(s => s.id === e.target.value);
                      if (sup) setSelectedSupplierPhone(sup.phone || '');
                    }}
                    className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                  >
                    <option value="">-- اختر مورد مسجل --</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>

                  <input
                    type="text"
                    placeholder="رقم الهاتف (مثال: 01012345678)"
                    value={selectedSupplierPhone}
                    onChange={e => setSelectedSupplierPhone(e.target.value)}
                    className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                    dir="ltr"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">نص الرسالة المنسق</label>
                <textarea
                  rows={8}
                  value={whatsappMsgText}
                  onChange={e => setWhatsappMsgText(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-medium focus:bg-white"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setWhatsappModalOpen(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold"
              >
                إلغاء
              </button>
              <button
                onClick={handleSendWhatsappDirect}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                فتح محادثة الواتساب
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================== */}
      {/* Modal: SQL Migration */}
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
                  <h2 className="text-lg font-black">كود SQL لإنشاء جداول الـ RFQ والمناقصات</h2>
                  <p className="text-xs text-slate-400">انسخ الكود وشغّله في Supabase SQL Editor لتفعيل حفظ المناقصات والعطاءات سحابياً</p>
                </div>
              </div>
              <button
                onClick={() => setSqlModalOpen(false)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <pre className="p-4 bg-slate-900 text-emerald-300 font-mono text-xs rounded-xl overflow-x-auto max-h-60 leading-relaxed" dir="ltr">
{`CREATE TABLE IF NOT EXISTS purchase_rfqs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    rfq_number VARCHAR(100) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    deadline_date DATE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'open',
    target_warehouse_id UUID DEFAULT NULL,
    notes TEXT,
    created_by UUID DEFAULT NULL,
    awarded_bid_id UUID DEFAULT NULL,
    generated_po_id UUID DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_rfq_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rfq_id UUID NOT NULL REFERENCES purchase_rfqs(id) ON DELETE CASCADE,
    product_id UUID DEFAULT NULL,
    product_name VARCHAR(255) NOT NULL,
    product_sku VARCHAR(100) DEFAULT '',
    uom_id UUID DEFAULT NULL,
    quantity NUMERIC(15, 4) NOT NULL DEFAULT 1.00,
    target_price NUMERIC(15, 4) DEFAULT NULL,
    specifications TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendor_quotation_bids (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    rfq_id UUID NOT NULL REFERENCES purchase_rfqs(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL,
    supplier_name VARCHAR(255) DEFAULT '',
    supplier_phone VARCHAR(50) DEFAULT '',
    quotation_reference VARCHAR(100) DEFAULT '',
    bid_date DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_until DATE DEFAULT NULL,
    subtotal NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    tax_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    shipping_cost NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(10) NOT NULL DEFAULT 'EGP',
    lead_time_days INT DEFAULT 3,
    payment_terms VARCHAR(100) DEFAULT 'آجل 30 يوم',
    warranty_terms VARCHAR(255) DEFAULT NULL,
    is_awarded BOOLEAN NOT NULL DEFAULT FALSE,
    score_points NUMERIC(5, 2) DEFAULT 0.00,
    evaluation_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendor_quotation_bid_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bid_id UUID NOT NULL REFERENCES vendor_quotation_bids(id) ON DELETE CASCADE,
    rfq_item_id UUID DEFAULT NULL,
    product_id UUID DEFAULT NULL,
    product_name VARCHAR(255) NOT NULL,
    offered_quantity NUMERIC(15, 4) NOT NULL DEFAULT 1.00,
    unit_price NUMERIC(15, 4) NOT NULL DEFAULT 0.00,
    discount_percent NUMERIC(5, 2) DEFAULT 0.00,
    tax_percent NUMERIC(5, 2) DEFAULT 14.00,
    total_price NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    brand_or_model VARCHAR(100) DEFAULT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`}
              </pre>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setSqlModalOpen(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold"
              >
                إغلاق
              </button>
              <button
                onClick={() => {
                  const sql = `CREATE TABLE IF NOT EXISTS purchase_rfqs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    rfq_number VARCHAR(100) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    deadline_date DATE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'open',
    target_warehouse_id UUID DEFAULT NULL,
    notes TEXT,
    created_by UUID DEFAULT NULL,
    awarded_bid_id UUID DEFAULT NULL,
    generated_po_id UUID DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_rfq_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rfq_id UUID NOT NULL REFERENCES purchase_rfqs(id) ON DELETE CASCADE,
    product_id UUID DEFAULT NULL,
    product_name VARCHAR(255) NOT NULL,
    product_sku VARCHAR(100) DEFAULT '',
    uom_id UUID DEFAULT NULL,
    quantity NUMERIC(15, 4) NOT NULL DEFAULT 1.00,
    target_price NUMERIC(15, 4) DEFAULT NULL,
    specifications TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendor_quotation_bids (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    rfq_id UUID NOT NULL REFERENCES purchase_rfqs(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL,
    supplier_name VARCHAR(255) DEFAULT '',
    supplier_phone VARCHAR(50) DEFAULT '',
    quotation_reference VARCHAR(100) DEFAULT '',
    bid_date DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_until DATE DEFAULT NULL,
    subtotal NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    tax_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    shipping_cost NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(10) NOT NULL DEFAULT 'EGP',
    lead_time_days INT DEFAULT 3,
    payment_terms VARCHAR(100) DEFAULT 'آجل 30 يوم',
    warranty_terms VARCHAR(255) DEFAULT NULL,
    is_awarded BOOLEAN NOT NULL DEFAULT FALSE,
    score_points NUMERIC(5, 2) DEFAULT 0.00,
    evaluation_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendor_quotation_bid_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bid_id UUID NOT NULL REFERENCES vendor_quotation_bids(id) ON DELETE CASCADE,
    rfq_item_id UUID DEFAULT NULL,
    product_id UUID DEFAULT NULL,
    product_name VARCHAR(255) NOT NULL,
    offered_quantity NUMERIC(15, 4) NOT NULL DEFAULT 1.00,
    unit_price NUMERIC(15, 4) NOT NULL DEFAULT 0.00,
    discount_percent NUMERIC(5, 2) DEFAULT 0.00,
    tax_percent NUMERIC(5, 2) DEFAULT 14.00,
    total_price NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    brand_or_model VARCHAR(100) DEFAULT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`;
                  navigator.clipboard.writeText(sql);
                  showToast('تم نسخ كود SQL لـ RFQ بنجاح إلى الحافظة 📋', 'success');
                }}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5"
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

export default RfqBiddingManager;
