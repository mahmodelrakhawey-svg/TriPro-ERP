import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { etaService, ETAInvoiceResponse } from '../../services/etaService';
import { 
  Landmark, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  RefreshCw, 
  Send, 
  ExternalLink, 
  Copy, 
  Search, 
  Filter, 
  Usb, 
  Info, 
  Loader2, 
  ChevronLeft, 
  ChevronRight,
  Eye,
  FileCheck,
  XCircle,
  QrCode as QrIcon
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';


interface ETAInvoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  tax_amount: number;
  status: string;
  eta_status?: string;
  eta_uuid?: string;
  eta_submission_id?: string;
  eta_error?: string;
  eta_qr_code?: string;
  customer_name?: string;
  customer_tax_id?: string;
}

export const ETATracker: React.FC = () => {
  const { currentSelectedOrgId, currentUser } = useAccounting();
  const { showToast } = useToast();

  const [invoices, setInvoices] = useState<ETAInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'all' | 'pending' | 'valid' | 'failed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Batch submission state
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);

  // Single action states
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [selectedError, setSelectedError] = useState<{ number: string; error: string } | null>(null);
  const [selectedQrInvoice, setSelectedQrInvoice] = useState<ETAInvoice | null>(null);

  // Local signer health state
  const [signerHealth, setSignerHealth] = useState<{ online: boolean; message: string; details?: any } | null>(null);
  const [checkingSigner, setCheckingSigner] = useState(false);

  // Company settings (environment)
  const [companySettings, setCompanySettings] = useState<any>(null);

  const orgId = currentSelectedOrgId || (currentUser as any)?.organization_id;

  // Check Local Signer
  const handleCheckSigner = async () => {
    setCheckingSigner(true);
    try {
      const res = await etaService.checkLocalSignerHealth();
      setSignerHealth(res);
      if (res.online) {
        showToast(res.message, 'success');
      } else {
        showToast(res.message, 'info');
      }
    } catch (e: any) {
      setSignerHealth({ online: false, message: e.message });
    } finally {
      setCheckingSigner(false);
    }
  };

  // Fetch Invoices & Settings
  const fetchData = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      // 1. Company Settings
      const { data: cSettings } = await supabase
        .from('company_settings')
        .select('*')
        .eq('organization_id', orgId)
        .maybeSingle();
      setCompanySettings(cSettings);

      // 2. Invoices (posted or paid sales invoices)
      const { data: invData, error: invErr } = await supabase
        .from('invoices')
        .select(`
          id,
          invoice_number,
          invoice_date,
          total_amount,
          tax_amount,
          status,
          eta_status,
          eta_uuid,
          eta_submission_id,
          eta_error,
          eta_qr_code,
          customers (
            name,
            taxpayer_id,
            national_id
          )
        `)
        .eq('organization_id', orgId)
        .order('invoice_date', { ascending: false });

      if (invErr) throw invErr;

      const formatted: ETAInvoice[] = (invData || []).map((inv: any) => ({
        id: inv.id,
        invoice_number: inv.invoice_number,
        invoice_date: inv.invoice_date,
        total_amount: Number(inv.total_amount || 0),
        tax_amount: Number(inv.tax_amount || 0),
        status: inv.status,
        eta_status: inv.eta_uuid ? (inv.eta_status || 'valid') : (inv.eta_error ? 'failed' : 'pending'),
        eta_uuid: inv.eta_uuid,
        eta_submission_id: inv.eta_submission_id,
        eta_error: inv.eta_error,
        eta_qr_code: inv.eta_qr_code,
        customer_name: inv.customers?.name || 'عميل عام',
        customer_tax_id: inv.customers?.taxpayer_id || inv.customers?.national_id || '-'
      }));

      setInvoices(formatted);
    } catch (err: any) {
      console.error('Error fetching ETA invoices:', err);
      showToast('تعذر تحميل بيانات الفواتير الضريبية: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    handleCheckSigner();
  }, [orgId]);

  // Metrics
  const metrics = useMemo(() => {
    const total = invoices.length;
    const valid = invoices.filter(i => i.eta_status === 'valid' || i.eta_uuid).length;
    const failed = invoices.filter(i => i.eta_status === 'failed' || (i.eta_error && !i.eta_uuid)).length;
    const pending = invoices.filter(i => !i.eta_uuid && !i.eta_error).length;
    return { total, valid, failed, pending };
  }, [invoices]);

  // Filtered List
  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      // Filter tab
      if (activeFilter === 'valid' && !(inv.eta_status === 'valid' || inv.eta_uuid)) return false;
      if (activeFilter === 'failed' && !(inv.eta_status === 'failed' || (inv.eta_error && !inv.eta_uuid))) return false;
      if (activeFilter === 'pending' && (inv.eta_uuid || (inv.eta_error && !inv.eta_uuid))) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesNum = inv.invoice_number?.toLowerCase().includes(q);
        const matchesCust = inv.customer_name?.toLowerCase().includes(q);
        const matchesUuid = inv.eta_uuid?.toLowerCase().includes(q);
        if (!matchesNum && !matchesCust && !matchesUuid) return false;
      }

      return true;
    });
  }, [invoices, activeFilter, searchQuery]);

  // Toggle selection
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllPending = () => {
    const pendingFiltered = filteredInvoices.filter(i => !i.eta_uuid).map(i => i.id);
    setSelectedIds(new Set(pendingFiltered));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  // Submit Single Invoice
  const handleSubmitSingle = async (inv: ETAInvoice) => {
    setProcessingId(inv.id);
    try {
      showToast(`جاري إرسال الفاتورة ${inv.invoice_number} لمنظومة الضرائب...`, 'info');
      const res = await etaService.submitInvoiceToETA(inv.id);
      if (res.success) {
        showToast(`تم اعتماد الفاتورة لدى مصلحة الضرائب بنجاح ✅ (UUID: ${res.uuid?.slice(0, 10)}...)`, 'success');
        fetchData();
      } else {
        showToast(`فشل الإرسال: ${res.error}`, 'error');
        fetchData();
      }
    } catch (err: any) {
      showToast(`خطأ في العملية: ${err.message}`, 'error');
    } finally {
      setProcessingId(null);
    }
  };

  // Re-check Status from ETA
  const handleRecheckStatus = async (inv: ETAInvoice) => {
    if (!inv.eta_uuid) {
      showToast('لا يمكن التحقق: الفاتورة لم يتم رفعها للمنظومة بعد.', 'warning');
      return;
    }
    setProcessingId(inv.id);
    try {
      showToast(`جاري الاستعلام عن حالة الفاتورة من مصلحة الضرائب...`, 'info');
      const res = await etaService.checkDocumentStatus(inv.eta_uuid, orgId);
      if (res.success) {
        showToast(`حالة الفاتورة في المنظومة: ${res.status || 'Valid'} ✅`, 'success');
      } else {
        showToast(`تنبيه من المنظومة: ${res.message}`, 'warning');
      }
    } catch (err: any) {
      showToast(`فشل الاستعلام: ${err.message}`, 'error');
    } finally {
      setProcessingId(null);
    }
  };

  // Batch Submit Selected
  const handleBatchSubmit = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      showToast('يرجى تحديد فاتورة واحدة على الأقل للإرسال.', 'warning');
      return;
    }

    if (!window.confirm(`هل أنت متأكد من إرسال عدد (${ids.length}) فاتورة مبيعات إلى مصلحة الضرائب المصرية؟`)) {
      return;
    }

    setBatchSubmitting(true);
    setBatchProgress({ current: 0, total: ids.length });

    try {
      const summary = await etaService.batchSubmitInvoices(ids, (current, total) => {
        setBatchProgress({ current, total });
      });

      showToast(`اكتمل الإرسال: تم اعتماد ${summary.successful} فواتير بنجاح، وتعثر ${summary.failed}.`, summary.failed === 0 ? 'success' : 'warning');
      setSelectedIds(new Set());
      fetchData();
    } catch (err: any) {
      showToast(`خطأ في الإرسال الجماعي: ${err.message}`, 'error');
    } finally {
      setBatchSubmitting(false);
      setBatchProgress(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast('تم نسخ المعرف الرقمي للحافظة 📋', 'success');
  };

  const isSandbox = (companySettings?.eta_environment || 'sandbox') === 'sandbox';

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header Title & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-cyan-100 text-cyan-800 rounded-xl">
              <Landmark size={26} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-800 tracking-tight">
                مركز إدارة الفاتورة والإيصال الإلكتروني (ETA Hub)
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                متابعة الاعتماد اللحظي، التوقيع الرقمي (USB Token)، والربط المباشر مع مصلحة الضرائب المصرية
              </p>
            </div>
          </div>
        </div>

        {/* Local Signer Status Pill */}
        <div className="flex items-center gap-2">
          <div className={`px-3 py-2 rounded-xl border flex items-center gap-2 text-xs font-bold ${
            signerHealth?.online 
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
              : 'bg-amber-50 text-amber-800 border-amber-200'
          }`}>
            <Usb size={15} />
            <span>المساعد المحلي: {signerHealth?.online ? 'متصل وجاهز' : 'غير متصل (8500)'}</span>
            <button 
              onClick={handleCheckSigner}
              disabled={checkingSigner}
              className="hover:rotate-180 transition-transform p-0.5 text-slate-500 hover:text-slate-800"
              title="إعادة فحص الاتصال"
            >
              <RefreshCw size={13} className={checkingSigner ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className={`px-3 py-2 rounded-xl text-xs font-bold border ${
            isSandbox ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'
          }`}>
            {isSandbox ? '🧪 بيئة تجريبية (Sandbox)' : '⚡ بيئة الإنتاج الفعلي (Live)'}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 block mb-1">إجمالي الفواتير</span>
            <span className="text-2xl font-black text-slate-800">{metrics.total}</span>
          </div>
          <div className="w-12 h-12 bg-slate-100 text-slate-600 rounded-xl flex items-center justify-center">
            <FileCheck size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-emerald-600 block mb-1">معتمدة بالمنظومة (Valid)</span>
            <span className="text-2xl font-black text-emerald-700">{metrics.valid}</span>
          </div>
          <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center">
            <CheckCircle2 size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-amber-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-amber-600 block mb-1">بانتظار الإرسال (Pending)</span>
            <span className="text-2xl font-black text-amber-700">{metrics.pending}</span>
          </div>
          <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-xl flex items-center justify-center">
            <Clock size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-red-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-red-600 block mb-1">تعذر الإرسال / أخطاء</span>
            <span className="text-2xl font-black text-red-700">{metrics.failed}</span>
          </div>
          <div className="w-12 h-12 bg-red-100 text-red-700 rounded-xl flex items-center justify-center">
            <AlertCircle size={24} />
          </div>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Actions & Filters Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-xl w-fit">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeFilter === 'all' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              الكل ({metrics.total})
            </button>
            <button
              onClick={() => setActiveFilter('pending')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeFilter === 'pending' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              بانتظار الإرسال ({metrics.pending})
            </button>
            <button
              onClick={() => setActiveFilter('valid')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeFilter === 'valid' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              معتمدة ({metrics.valid})
            </button>
            <button
              onClick={() => setActiveFilter('failed')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeFilter === 'failed' ? 'bg-white text-red-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              أخطاء ({metrics.failed})
            </button>
          </div>

          {/* Search & Batch Actions */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="relative">
              <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="بحث برقم الفاتورة أو العميل..."
                className="pr-9 pl-4 py-2 border rounded-xl text-xs w-56 sm:w-64 focus:ring-2 focus:ring-cyan-500 outline-none"
              />
            </div>

            {selectedIds.size > 0 && (
              <button
                onClick={handleBatchSubmit}
                disabled={batchSubmitting}
                className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-sm flex items-center gap-2 transition-all disabled:opacity-50"
              >
                {batchSubmitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                <span>
                  {batchSubmitting 
                    ? `جاري الإرسال (${batchProgress?.current}/${batchProgress?.total})...`
                    : `إرسال (${selectedIds.size}) فواتير للضرائب`}
                </span>
              </button>
            )}

            <button
              onClick={fetchData}
              disabled={loading}
              className="p-2 border rounded-xl hover:bg-slate-50 text-slate-600 transition-colors"
              title="تحديث البيانات"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Bulk Selection Bar */}
        {activeFilter === 'pending' && filteredInvoices.length > 0 && (
          <div className="bg-amber-50/60 px-5 py-2.5 border-b border-amber-200/50 flex items-center justify-between text-xs text-amber-900">
            <span>
              تم تحديد <strong className="font-mono">{selectedIds.size}</strong> من أصل <strong className="font-mono">{filteredInvoices.length}</strong> فاتورة غير مرسلة
            </span>
            <div className="flex items-center gap-2">
              <button 
                onClick={selectAllPending}
                className="text-amber-800 hover:underline font-bold"
              >
                تحديد الكل
              </button>
              <span>•</span>
              <button 
                onClick={clearSelection}
                className="text-slate-600 hover:underline"
              >
                إلغاء التحديد
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50/75 border-b border-slate-200 text-slate-600 font-bold">
              <tr>
                <th className="p-3.5 text-center w-10">
                  <input
                    type="checkbox"
                    checked={filteredInvoices.length > 0 && selectedIds.size === filteredInvoices.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(new Set(filteredInvoices.map(i => i.id)));
                      } else {
                        setSelectedIds(new Set());
                      }
                    }}
                    className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                  />
                </th>
                <th className="p-3.5">رقم الفاتورة</th>
                <th className="p-3.5">التاريخ</th>
                <th className="p-3.5">العميل</th>
                <th className="p-3.5">الرقم الضريبي/القومي</th>
                <th className="p-3.5 text-center">الإجمالي (ج.م)</th>
                <th className="p-3.5 text-center">الضريبة 14%</th>
                <th className="p-3.5 text-center">حالة الضرائب (ETA)</th>
                <th className="p-3.5">المعرف الضريبي (UUID)</th>
                <th className="p-3.5 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredInvoices.map((inv) => {
                const isSelected = selectedIds.has(inv.id);
                const isValid = inv.eta_status === 'valid' || !!inv.eta_uuid;
                const isFailed = inv.eta_status === 'failed' || (!!inv.eta_error && !inv.eta_uuid);
                const isPending = !isValid && !isFailed;
                const isBusy = processingId === inv.id;

                const etaPortalUrl = isSandbox
                  ? `https://preprod.invoicing.eta.gov.eg/invoices/${inv.eta_uuid}/preview`
                  : `https://invoicing.eta.gov.eg/invoices/${inv.eta_uuid}/preview`;

                return (
                  <tr 
                    key={inv.id} 
                    className={`hover:bg-slate-50/70 transition-colors ${isSelected ? 'bg-cyan-50/30' : ''}`}
                  >
                    <td className="p-3.5 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(inv.id)}
                        className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                      />
                    </td>
                    <td className="p-3.5 font-mono font-bold text-blue-700">{inv.invoice_number}</td>
                    <td className="p-3.5 text-slate-600 font-mono text-[11px]">{inv.invoice_date}</td>
                    <td className="p-3.5 font-bold text-slate-800">{inv.customer_name}</td>
                    <td className="p-3.5 font-mono text-slate-500 text-[11px]">{inv.customer_tax_id}</td>
                    <td className="p-3.5 text-center font-mono font-bold text-slate-900" dir="ltr">
                      {inv.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-3.5 text-center font-mono font-bold text-emerald-600" dir="ltr">
                      {inv.tax_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-3.5 text-center">
                      {isValid && (
                        <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full font-bold text-[11px]">
                          <CheckCircle2 size={12} /> معتمدة
                        </span>
                      )}
                      {isFailed && (
                        <button
                          onClick={() => setSelectedError({ number: inv.invoice_number, error: inv.eta_error || 'خطأ غير محدد من مصلحة الضرائب' })}
                          className="inline-flex items-center gap-1 bg-red-100 text-red-800 px-2.5 py-1 rounded-full font-bold text-[11px] hover:bg-red-200 transition-colors"
                          title="انقر لعرض سبب الرفض"
                        >
                          <XCircle size={12} /> تعذر الإرسال
                        </button>
                      )}
                      {isPending && (
                        <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full font-bold text-[11px]">
                          <Clock size={12} /> بانتظار الإرسال
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 font-mono text-[11px]">
                      {inv.eta_uuid ? (
                        <div className="flex items-center gap-1.5 text-slate-700">
                          <span title={inv.eta_uuid}>{inv.eta_uuid.slice(0, 14)}...</span>
                          <button
                            onClick={() => copyToClipboard(inv.eta_uuid!)}
                            className="text-slate-400 hover:text-slate-700 transition-colors"
                            title="نسخ المعرف بالكامل"
                          >
                            <Copy size={13} />
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="p-3.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {isValid ? (
                          <>
                            <a
                              href={inv.eta_qr_code || etaPortalUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg transition-colors flex items-center gap-1"
                              title="المعاينة على بوابة مصلحة الضرائب الرسمية"
                            >
                              <ExternalLink size={14} />
                            </a>

                            <button
                              onClick={() => setSelectedQrInvoice(inv)}
                              className="p-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
                              title="عرض رمز الاستجابة السريعة (QR Code)"
                            >
                              <QrIcon size={14} />
                            </button>

                            <button
                              onClick={() => handleRecheckStatus(inv)}
                              disabled={isBusy}
                              className="p-1.5 bg-cyan-50 text-cyan-700 hover:bg-cyan-100 rounded-lg transition-colors disabled:opacity-50"
                              title="التحقق من حالة الفاتورة لدى الضرائب (Live Status Check)"
                            >
                              {isBusy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleSubmitSingle(inv)}
                            disabled={isBusy}
                            className="bg-cyan-600 hover:bg-cyan-700 text-white px-3 py-1.5 rounded-lg font-bold text-[11px] flex items-center gap-1 shadow-sm transition-all disabled:opacity-50"
                            title="إرسال الفاتورة لمنظومة الضرائب المصرية"
                          >
                            {isBusy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                            <span>{isFailed ? 'إعادة الإرسال' : 'إرسال'}</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredInvoices.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-12 text-center text-slate-400 font-bold">
                    {loading ? 'جاري تحميل سجل الفواتير الضريبية...' : 'لا توجد فواتير مطابقة لخيارات الفلترة الحالية.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Error Inspection Modal */}
      {selectedError && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-red-100 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-3 text-red-700">
              <div className="flex items-center gap-2">
                <AlertCircle size={20} />
                <h3 className="font-bold text-base">تفاصيل سبب رفض الفاتورة ({selectedError.number})</h3>
              </div>
              <button 
                onClick={() => setSelectedError(null)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="bg-red-50 p-4 rounded-xl border border-red-200 text-xs text-red-900 font-mono leading-relaxed whitespace-pre-wrap">
              {selectedError.error}
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1.5">
              <span className="font-bold block text-slate-900 mb-1">💡 نصائح لمعالجة الخطأ الشائع:</span>
              <p>• تأكد من صحة رقم التسجيل الضريبي أو الرقم القومي للعميل إذا كانت الفاتورة تتجاوز الحد المعفى.</p>
              <p>• تحقق من إدخال كود الصنف الضريبي (EGS أو GS1) لكل بند في بطاقة الأصناف.</p>
              <p>• تأكد من توصيل فلاشة التوقيع وتشغيل أداة المساعد المحلي <code className="font-mono">start-signer.bat</code>.</p>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedError(null)}
                className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-all"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Preview Modal */}
      {selectedQrInvoice && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-200 space-y-4 text-center animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-slate-800">
                رمز الفاتورة المعتمدة ({selectedQrInvoice.invoice_number})
              </h3>
              <button 
                onClick={() => setSelectedQrInvoice(null)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="flex justify-center p-4 bg-slate-50 rounded-xl border border-slate-200">
              <QRCodeSVG 
                value={selectedQrInvoice.eta_qr_code || `https://invoicing.eta.gov.eg/invoices/${selectedQrInvoice.eta_uuid}/preview`}
                size={180}
              />
            </div>


            <div className="text-xs text-slate-600 space-y-1">
              <p className="font-mono font-bold text-slate-800">{selectedQrInvoice.eta_uuid}</p>
              <p>إجمالي الفاتورة: <strong>{selectedQrInvoice.total_amount.toFixed(2)} ج.م</strong></p>
            </div>

            <div className="pt-2">
              <a
                href={selectedQrInvoice.eta_qr_code || `https://invoicing.eta.gov.eg/invoices/${selectedQrInvoice.eta_uuid}/preview`}
                target="_blank"
                rel="noreferrer"
                className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm"
              >
                <ExternalLink size={14} />
                <span>فتح الفاتورة الرسمية في نافذة جديدة</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ETATracker;
