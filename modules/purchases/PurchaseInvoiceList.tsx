import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { 
  FileText, Search, Printer, Loader2, RotateCcw, AlertTriangle, 
  Edit, CheckCircle, DollarSign, X, ChevronLeft, ChevronRight, 
  Plus, Download, MessageCircle, Trash2, Filter, Warehouse as WarehouseIcon, Clock
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import * as XLSX from 'xlsx';
import { PurchaseInvoicePrint } from './PurchaseInvoicePrint';
import SupplierInvoiceExcelImporter from './SupplierInvoiceExcelImporter';
import { FileSpreadsheet } from 'lucide-react';

export const PurchaseInvoiceList = () => {
  const navigate = useNavigate();
  const { 
    approvePurchaseInvoice, unpostPurchaseInvoice, deletePurchaseInvoice, addPaymentVoucher, settings, currentUser, 
    accounts, suppliers, warehouses, selectedFiscalYear, fiscalYearRange,
    currentSelectedOrgId
  } = useAccounting();
  const { showToast } = useToast();

  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [startDate, setStartDate] = useState(fiscalYearRange.startDate);
  const [endDate, setEndDate] = useState(`${selectedFiscalYear}-12-31`);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'posted' | 'paid' | 'draft'>('all');
  
  // Pagination & Count
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const itemsPerPage = 15;

  // KPI Summary State
  const [summaryData, setSummaryData] = useState({
    totalAmount: 0,
    totalTax: 0,
    totalPaid: 0,
    totalRemaining: 0,
    postedCount: 0,
    draftCount: 0,
    count: 0
  });
  
  // Printing & Action States
  const [invoiceToPrint, setInvoiceToPrint] = useState<any | null>(null);
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isImporterOpen, setIsImporterOpen] = useState(false);

  // Payment Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<any>(null);
  const [paymentFormData, setPaymentFormData] = useState({
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    treasuryAccountId: '',
    notes: ''
  });

  // Debounce search input (350ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    if (selectedFiscalYear) {
      setStartDate(`${selectedFiscalYear}-01-01`);
      setEndDate(`${selectedFiscalYear}-12-31`);
    }
  }, [selectedFiscalYear]);

  useEffect(() => {
    supabase.rpc('get_current_company_settings').maybeSingle().then(({ data }) => {
      if (data) setCompanySettings(data);
    });
  }, []);

  const treasuryAccounts = useMemo(() => {
    return accounts.filter(a => !a.isGroup && (a.code.startsWith('123') || a.code.startsWith('101') || a.name.includes('صندوق') || a.name.includes('بنك') || a.type === 'ASSET'));
  }, [accounts]);

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = currentSelectedOrgId || currentUser?.organization_id || session?.user?.user_metadata?.org_id;
      if (!userOrgId) {
        setLoading(false);
        return;
      }

      // 1. استعلام خفيف للصفحة الحالية فقط دون جلب عناصر الفواتير الثقيلة
      let query = supabase
        .from('purchase_invoices')
        .select(`
          id,
          invoice_number,
          invoice_date,
          total_amount,
          tax_amount,
          paid_amount,
          status,
          notes,
          supplier_id,
          warehouse_id,
          created_at,
          related_journal_entry_id,
          suppliers(id, name, phone),
          warehouses(id, name)
        `, { count: 'exact' })
        .eq('organization_id', userOrgId)
        .order('invoice_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (startDate) query = query.gte('invoice_date', startDate);
      if (endDate) query = query.lte('invoice_date', endDate);
      if (selectedSupplierId) query = query.eq('supplier_id', selectedSupplierId);
      if (selectedWarehouseId) query = query.eq('warehouse_id', selectedWarehouseId);
      if (filterStatus !== 'all') query = query.eq('status', filterStatus);
      if (debouncedSearch.trim()) {
        const term = debouncedSearch.trim();
        query = query.or(`invoice_number.ilike.%${term}%,notes.ilike.%${term}%`);
      }

      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;
      if (error) throw error;

      setInvoices(data || []);
      setTotalCount(count || 0);

      // 2. استعلام إحصائي فائق السرعة لحساب إجماليات KPIs للفترة المحددة
      let summaryQuery = supabase
        .from('purchase_invoices')
        .select('total_amount, tax_amount, paid_amount, status')
        .eq('organization_id', userOrgId);

      if (startDate) summaryQuery = summaryQuery.gte('invoice_date', startDate);
      if (endDate) summaryQuery = summaryQuery.lte('invoice_date', endDate);
      if (selectedSupplierId) summaryQuery = summaryQuery.eq('supplier_id', selectedSupplierId);
      if (selectedWarehouseId) summaryQuery = summaryQuery.eq('warehouse_id', selectedWarehouseId);
      if (filterStatus !== 'all') summaryQuery = summaryQuery.eq('status', filterStatus);
      if (debouncedSearch.trim()) {
        const term = debouncedSearch.trim();
        summaryQuery = summaryQuery.or(`invoice_number.ilike.%${term}%,notes.ilike.%${term}%`);
      }

      const { data: sumRows } = await summaryQuery;
      if (sumRows) {
        let tAmount = 0;
        let tTax = 0;
        let tPaid = 0;
        let postedC = 0;
        let draftC = 0;

        for (const row of sumRows) {
          tAmount += Number(row.total_amount || 0);
          tTax += Number(row.tax_amount || 0);
          tPaid += Number(row.paid_amount || 0);
          if (row.status === 'posted' || row.status === 'paid') postedC++;
          else if (row.status === 'draft') draftC++;
        }

        setSummaryData({
          totalAmount: tAmount,
          totalTax: tTax,
          totalPaid: tPaid,
          totalRemaining: tAmount - tPaid,
          postedCount: postedC,
          draftCount: draftC,
          count: sumRows.length
        });
      }

    } catch (err: any) {
      console.error('Error fetching purchase invoices:', err);
      showToast('فشل تحميل سجل فواتير المشتريات: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [startDate, endDate, selectedSupplierId, selectedWarehouseId, filterStatus, debouncedSearch, currentPage, currentSelectedOrgId]);

  const totalPages = Math.ceil(totalCount / itemsPerPage) || 1;
  const filteredInvoices = invoices;
  const paginatedInvoices = invoices;
  const summary = summaryData;

  const handleApprove = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من ترحيل فاتورة المشتريات؟ سيتم إنشاء القيد المحاسبي وتحديث أرصدة المخزون.')) return;
    try {
      await approvePurchaseInvoice(id);
      fetchInvoices();
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleUnpost = async (invoice: any) => {
    if (!window.confirm(`هل أنت متأكد من إلغاء ترحيل فاتورة المشتريات رقم (${invoice.invoice_number})؟\n\nسيتم:\n1- عكس حركة المخزون وخصم الكميات المضافة.\n2- حذف القيد المحاسبي بالكامل.\n3- تحويل الفاتورة إلى مسودة (Draft) لتتمكن من تعديلها.`)) {
      return;
    }

    setDeletingId(invoice.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = currentSelectedOrgId || currentUser?.organization_id || session?.user?.user_metadata?.org_id;

      // 🛡️ 1. محاولة التنفيذ الذري أولاً عبر دالة السيرفر
      try {
        await unpostPurchaseInvoice(invoice.id, userOrgId);
        showToast('تم إلغاء ترحيل فاتورة المشتريات بنجاح وتحويلها لمسودة ✅', 'success');
        fetchInvoices();
        return;
      } catch (rpcErr: any) {
        console.warn('Atomic unpost RPC unavailable, attempting client fallback:', rpcErr);
      }

      // جلب عناصر الفاتورة عند الطلب فقط لعكس حركة المخزون (Fallback)
      let itemsToReverse = invoice.purchase_invoice_items;
      if (!itemsToReverse || itemsToReverse.length === 0) {
        const { data: itemRows } = await supabase
          .from('purchase_invoice_items')
          .select('product_id, quantity')
          .eq('purchase_invoice_id', invoice.id);
        itemsToReverse = itemRows || [];
      }

      // عكس حركة المخزون
      for (const item of itemsToReverse) {
        if (item.product_id && item.quantity) {
          const { data: prod } = await supabase.from('products').select('stock, warehouse_stock').eq('id', item.product_id).single();
          if (prod) {
            const newStock = Math.max(0, (Number(prod.stock) || 0) - Number(item.quantity));
            let newWStock = prod.warehouse_stock || {};
            if (invoice.warehouse_id && newWStock[invoice.warehouse_id] !== undefined) {
              newWStock[invoice.warehouse_id] = Math.max(0, (Number(newWStock[invoice.warehouse_id]) || 0) - Number(item.quantity));
            }
            await supabase.from('products').update({ stock: newStock, warehouse_stock: newWStock }).eq('id', item.product_id);
          }
        }
      }

      // حذف القيد المحاسبي
      if (invoice.related_journal_entry_id) {
        await supabase.from('journal_entries').delete().eq('id', invoice.related_journal_entry_id);
      } else {
        await supabase.from('journal_entries').delete().eq('organization_id', userOrgId).eq('reference', invoice.invoice_number);
      }

      // تحويل لمسودة
      await supabase.from('purchase_invoices').update({ status: 'draft', related_journal_entry_id: null }).eq('id', invoice.id);
      showToast('تم إلغاء ترحيل فاتورة المشتريات بنجاح وتحويلها لمسودة ✅', 'success');
      fetchInvoices();

    } catch (err: any) {
      console.error('Error unposting purchase invoice:', err);
      showToast('فشل إلغاء ترحيل الفاتورة: ' + err.message, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDelete = async (invoice: any) => {
    if (!window.confirm(`هل أنت متأكد من حذف فاتورة المشتريات رقم (${invoice.invoice_number})؟\nسيتم إلغاء أثرها على المخزون والقيد المحاسبي بالكامل.`)) {
      return;
    }

    setDeletingId(invoice.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = currentSelectedOrgId || currentUser?.organization_id || session?.user?.user_metadata?.org_id;

      // 🛡️ 1. محاولة الحذف الذري الشامل أولاً عبر دالة السيرفر
      try {
        await deletePurchaseInvoice(invoice.id, userOrgId);
        showToast('تم حذف فاتورة المشتريات وعكس الحركات بنجاح ✅', 'success');
        fetchInvoices();
        return;
      } catch (rpcErr: any) {
        console.warn('Atomic delete RPC unavailable, attempting client fallback:', rpcErr);
      }

      if (invoice.status === 'posted') {
        // جلب عناصر الفاتورة عند الطلب فقط لعكس حركة المخزون
        let itemsToReverse = invoice.purchase_invoice_items;
        if (!itemsToReverse || itemsToReverse.length === 0) {
          const { data: itemRows } = await supabase
            .from('purchase_invoice_items')
            .select('product_id, quantity')
            .eq('purchase_invoice_id', invoice.id);
          itemsToReverse = itemRows || [];
        }

        // عكس حركة المخزون
        for (const item of itemsToReverse) {
          if (item.product_id && item.quantity) {
            const { data: prod } = await supabase.from('products').select('stock, warehouse_stock').eq('id', item.product_id).single();
            if (prod) {
              const newStock = Math.max(0, (Number(prod.stock) || 0) - Number(item.quantity));
              let newWStock = prod.warehouse_stock || {};
              if (invoice.warehouse_id && newWStock[invoice.warehouse_id] !== undefined) {
                newWStock[invoice.warehouse_id] = Math.max(0, (Number(newWStock[invoice.warehouse_id]) || 0) - Number(item.quantity));
              }
              await supabase.from('products').update({ stock: newStock, warehouse_stock: newWStock }).eq('id', item.product_id);
            }
          }
        }

        // حذف القيد المحاسبي
        if (invoice.related_journal_entry_id) {
          await supabase.from('journal_entries').delete().eq('id', invoice.related_journal_entry_id);
        } else {
          await supabase.from('journal_entries').delete().eq('organization_id', userOrgId).eq('reference', invoice.invoice_number);
        }
      }

      await supabase.from('purchase_invoice_items').delete().eq('purchase_invoice_id', invoice.id);
      const { error: delErr } = await supabase.from('purchase_invoices').delete().eq('id', invoice.id);
      if (delErr) throw delErr;

      showToast('تم حذف فاتورة المشتريات وعكس الحركات بنجاح ✅', 'success');
      fetchInvoices();

    } catch (err: any) {
      console.error('Error deleting purchase invoice:', err);
      showToast('فشل حذف الفاتورة: ' + err.message, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const openPaymentModal = (invoice: any) => {
    setSelectedInvoiceForPayment(invoice);
    const remaining = Number(invoice.total_amount || 0) - Number(invoice.paid_amount || 0);
    setPaymentFormData({
      amount: remaining > 0 ? remaining : 0,
      date: new Date().toISOString().split('T')[0],
      treasuryAccountId: treasuryAccounts.length === 1 ? treasuryAccounts[0].id : (settings.defaultTreasuryId || ''),
      notes: `سداد فاتورة مشتريات رقم ${invoice.invoice_number}`
    });
    setIsPaymentModalOpen(true);
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentFormData.treasuryAccountId) {
      showToast('الرجاء اختيار حساب الخزينة/البنك', 'warning');
      return;
    }
    
    try {
      await addPaymentVoucher({
        supplierId: selectedInvoiceForPayment.supplier_id,
        partyName: selectedInvoiceForPayment.suppliers?.name,
        amount: paymentFormData.amount,
        date: paymentFormData.date,
        treasuryAccountId: paymentFormData.treasuryAccountId,
        notes: paymentFormData.notes,
        subType: 'supplier',
        invoiceId: selectedInvoiceForPayment.id
      });
      showToast('تم إنشاء سند الصرف وتحديث الفاتورة بنجاح ✅', 'success');
      setIsPaymentModalOpen(false);
      fetchInvoices();
    } catch (err: any) {
      console.error(err);
      showToast('حدث خطأ: ' + err.message, 'error');
    }
  };

  const handlePrint = async (invoice: any) => {
    try {
      showToast('جاري تجهيز الفاتورة للطباعة...', 'info');
      const { data, error } = await supabase
        .from('purchase_invoices')
        .select(`
          *,
          suppliers(id, name, phone, address, tax_number),
          warehouses(id, name),
          purchase_invoice_items(id, product_id, quantity, unit_price, total, uom_id, products(name, sku))
        `)
        .eq('id', invoice.id)
        .single();

      if (error) throw error;
      setInvoiceToPrint(data || invoice);
      setTimeout(() => {
        window.print();
        setInvoiceToPrint(null);
      }, 250);
    } catch (err: any) {
      console.error('Error preparing print data:', err);
      showToast('فشل تجهيز بيانات الطباعة: ' + err.message, 'error');
    }
  };

  const handleShareWhatsApp = (invoice: any) => {
    const phone = invoice.suppliers?.phone ? invoice.suppliers.phone.replace(/[^0-9]/g, '') : '';
    const message = `مرحباً ${invoice.suppliers?.name || 'السادة المورد'},\nنود إخطاركم بتسجيل فاتورة مشتريات رقم: ${invoice.invoice_number}\nالتاريخ: ${invoice.invoice_date}\nالإجمالي: ${Number(invoice.total_amount).toLocaleString()} ${settings.currency || 'ج.م'}\nالحالة: ${invoice.status === 'posted' ? 'مرحلة ومستحقة' : 'مسودة'}\nشكراً لتعاملكم معنا.`;
    
    const url = phone 
      ? `https://wa.me/${phone.startsWith('0') ? '20' + phone.substring(1) : phone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
      
    window.open(url, '_blank');
  };

  const exportToExcel = async () => {
    try {
      showToast('جاري تجهيز ملف الإكسيل لكافة الفواتير المطابقة...', 'info');
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = currentSelectedOrgId || currentUser?.organization_id || session?.user?.user_metadata?.org_id;

      let expQuery = supabase
        .from('purchase_invoices')
        .select(`
          invoice_number,
          invoice_date,
          total_amount,
          tax_amount,
          paid_amount,
          status,
          notes,
          suppliers(name),
          warehouses(name)
        `)
        .eq('organization_id', userOrgId)
        .order('invoice_date', { ascending: false });

      if (startDate) expQuery = expQuery.gte('invoice_date', startDate);
      if (endDate) expQuery = expQuery.lte('invoice_date', endDate);
      if (selectedSupplierId) expQuery = expQuery.eq('supplier_id', selectedSupplierId);
      if (selectedWarehouseId) expQuery = expQuery.eq('warehouse_id', selectedWarehouseId);
      if (filterStatus !== 'all') expQuery = expQuery.eq('status', filterStatus);
      if (debouncedSearch.trim()) {
        const term = debouncedSearch.trim();
        expQuery = expQuery.or(`invoice_number.ilike.%${term}%,notes.ilike.%${term}%`);
      }

      const { data: exportRows, error } = await expQuery;
      if (error) throw error;

      if (!exportRows || exportRows.length === 0) {
        showToast('لا توجد بيانات للتصدير', 'warning');
        return;
      }

      const dataToExport = exportRows.map((inv: any, idx: number) => ({
        '#': idx + 1,
        'رقم الفاتورة': inv.invoice_number || '-',
        'التاريخ': inv.invoice_date,
        'المورد': (inv.suppliers as any)?.name || 'مورد عام',
        'المستودع': (inv.warehouses as any)?.name || '-',
        'الإجمالي': inv.total_amount,
        'الضريبة': inv.tax_amount,
        'المسدد': inv.paid_amount || 0,
        'المتبقي': (inv.total_amount || 0) - (inv.paid_amount || 0),
        'الحالة': inv.status === 'posted' ? 'مرحلة' : inv.status === 'paid' ? 'مسددة' : 'مسودة',
        'ملاحظات': inv.notes || ''
      }));

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'فواتير المشتريات');
      XLSX.writeFile(wb, `سجل_فواتير_المشتريات_${new Date().toISOString().split('T')[0]}.xlsx`);
      showToast('تم تصدير سجل المشتريات إلى إكسيل بنجاح ✅', 'success');
    } catch (err: any) {
      console.error(err);
      showToast('فشل تصدير البيانات إلى إكسيل', 'error');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      
      {/* 🚀 Header */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <FileText size={28} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
              سجل فواتير المشتريات
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold font-mono">
                {totalCount} فاتورة
              </span>
            </h2>
            <p className="text-xs text-slate-400 font-bold">متابعة وإدارة فواتير الشراء وسداد الموردين وترحيل المخزون</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={fetchInvoices} 
            className="bg-slate-100 text-slate-700 hover:bg-slate-200 px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
            title="تحديث البيانات"
          >
            <RotateCcw size={16} /> تحديث
          </button>

          <button 
            onClick={exportToExcel} 
            className="bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
            title="تصدير إلى إكسيل"
          >
            <Download size={16} /> تصدير Excel
          </button>

          <button 
            onClick={() => setIsImporterOpen(true)}
            className="bg-emerald-600 text-white hover:bg-emerald-700 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
            title="استيراد فواتير الموردين من ملف إكسيل"
          >
            <FileSpreadsheet size={16} /> استيراد إكسيل المورد
          </button>

          <button 
            onClick={() => navigate('/purchase-invoice')} 
            className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Plus size={16} /> فاتورة مشتريات جديدة
          </button>
        </div>
      </div>

      {/* 📊 KPI Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
          <div>
            <span className="text-xs text-slate-400 font-bold block mb-1">إجمالي المشتريات</span>
            <span className="text-xl font-black text-slate-800 font-mono" dir="ltr">
              {summary.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-slate-400 font-bold mr-1">{settings.currency || 'ج.م'}</span>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl font-mono font-bold text-xs">
            {summary.count} فاتورة
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
          <div>
            <span className="text-xs text-slate-400 font-bold block mb-1">المبالغ المسددة</span>
            <span className="text-xl font-black text-emerald-600 font-mono" dir="ltr">
              {summary.totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-slate-400 font-bold mr-1">{settings.currency || 'ج.م'}</span>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle size={20} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
          <div>
            <span className="text-xs text-slate-400 font-bold block mb-1">المتبقي والمستحق</span>
            <span className="text-xl font-black text-red-600 font-mono" dir="ltr">
              {summary.totalRemaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-slate-400 font-bold mr-1">{settings.currency || 'ج.م'}</span>
          </div>
          <div className="p-3 bg-red-50 text-red-600 rounded-xl font-bold text-xs">
            {summary.draftCount} مسودة
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
          <div>
            <span className="text-xs text-slate-400 font-bold block mb-1">ضريبة القيمة المضافة</span>
            <span className="text-xl font-black text-purple-600 font-mono" dir="ltr">
              {summary.totalTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-slate-400 font-bold mr-1">{settings.currency || 'ج.م'}</span>
          </div>
          <div className="p-3 bg-purple-50 text-purple-600 rounded-xl font-mono font-bold text-xs">
            {summary.postedCount} مرحلة
          </div>
        </div>
      </div>

      {/* 🟢 شريط السنة المالية وزر إظهار كافة السنوات */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-emerald-50/60 border border-emerald-200/80 p-3.5 rounded-2xl">
        <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
          <span>عرض فواتير السنة المالية:</span>
          <span className="bg-emerald-600 text-white px-2.5 py-0.5 rounded-lg font-mono font-black">{selectedFiscalYear || '2026'}</span>
          <span className="text-[11px] text-emerald-600 font-medium">({startDate || 'كافة الفترات'} إلى {endDate || 'كافة الفترات'})</span>
        </div>
        <div className="flex items-center gap-2">
          {(startDate || endDate) ? (
            <button
              type="button"
              onClick={() => { setStartDate(''); setEndDate(''); }}
              className="bg-white hover:bg-emerald-100 text-emerald-700 border border-emerald-300 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
            >
              <span>عرض كل السنوات (إلغاء حصر السنة)</span>
              <span>🌐</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => { setStartDate(`${selectedFiscalYear || '2026'}-01-01`); setEndDate(`${selectedFiscalYear || '2026'}-12-31`); }}
              className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
            >
              <span>حصر لسنة {selectedFiscalYear || '2026'} فقط</span>
              <span>🔒</span>
            </button>
          )}
        </div>
      </div>

      {/* 🔍 Multi-Filter Section */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-5 gap-3">
        <div className="relative">
          <Search className="absolute right-3 top-3 text-slate-400" size={16} />
          <input 
            type="text" 
            placeholder="بحث برقم الفاتورة، المورد..." 
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="w-full pr-9 pl-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <select 
            value={selectedSupplierId} 
            onChange={e => { setSelectedSupplierId(e.target.value); setCurrentPage(1); }}
            className="w-full p-2 bg-slate-50 border rounded-xl text-xs font-bold outline-none focus:border-blue-500"
          >
            <option value="">جميع الموردين</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div>
          <select 
            value={selectedWarehouseId} 
            onChange={e => { setSelectedWarehouseId(e.target.value); setCurrentPage(1); }}
            className="w-full p-2 bg-slate-50 border rounded-xl text-xs font-bold outline-none focus:border-blue-500"
          >
            <option value="">جميع المستودعات</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>

        <div className="flex gap-2">
          <input 
            type="date" 
            value={startDate} 
            onChange={e => { setStartDate(e.target.value); setCurrentPage(1); }} 
            className="w-full p-2 bg-slate-50 border rounded-xl text-xs font-bold outline-none focus:border-blue-500"
            title="من تاريخ"
          />
          <input 
            type="date" 
            value={endDate} 
            onChange={e => { setEndDate(e.target.value); setCurrentPage(1); }} 
            className="w-full p-2 bg-slate-50 border rounded-xl text-xs font-bold outline-none focus:border-blue-500"
            title="إلى تاريخ"
          />
        </div>

        <div>
          <select 
            value={filterStatus} 
            onChange={e => { setFilterStatus(e.target.value as any); setCurrentPage(1); }}
            className="w-full p-2 bg-slate-50 border rounded-xl text-xs font-bold outline-none focus:border-blue-500"
          >
            <option value="all">جميع الحالات</option>
            <option value="posted">مرحلة ومكتملة 📄</option>
            <option value="paid">مسددة بالكامل ✅</option>
            <option value="draft">مسودة 📝</option>
          </select>
        </div>
      </div>

      {/* 📋 Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center text-slate-400 gap-3">
            <Loader2 className="animate-spin text-blue-600" size={36} />
            <span className="font-bold text-sm">جاري تحميل سجل المشتريات...</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-xs font-black text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="p-3.5">رقم الفاتورة</th>
                  <th className="p-3.5">التاريخ</th>
                  <th className="p-3.5">المورد</th>
                  <th className="p-3.5">المستودع</th>
                  <th className="p-3.5 text-center">الإجمالي</th>
                  <th className="p-3.5 text-center">المسدد</th>
                  <th className="p-3.5 text-center">المتبقي</th>
                  <th className="p-3.5 text-center">الحالة</th>
                  <th className="p-3.5 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedInvoices.map((inv) => {
                  const total = Number(inv.total_amount || 0);
                  const paid = Number(inv.paid_amount || 0);
                  const remaining = total - paid;

                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="p-3.5 font-mono font-bold text-blue-700">{inv.invoice_number || '-'}</td>
                      <td className="p-3.5 text-slate-600 font-mono text-xs">{inv.invoice_date}</td>
                      <td className="p-3.5 font-bold text-slate-800">{inv.suppliers?.name || 'مورد عام'}</td>
                      <td className="p-3.5 text-slate-600 text-xs">{inv.warehouses?.name || '-'}</td>
                      <td className="p-3.5 text-center font-mono font-black text-slate-900" dir="ltr">
                        {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-3.5 text-center font-mono font-bold text-emerald-600" dir="ltr">
                        {paid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-3.5 text-center font-mono font-bold text-red-600" dir="ltr">
                        {remaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-3.5 text-center">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-bold inline-flex items-center gap-1 ${
                          (inv.status === 'paid' || (total > 0 && remaining <= 0))
                            ? 'bg-emerald-100 text-emerald-800'
                            : (paid > 0 && remaining > 0)
                            ? 'bg-blue-100 text-blue-800'
                            : inv.status === 'posted'
                            ? 'bg-teal-100 text-teal-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {(inv.status === 'paid' || (total > 0 && remaining <= 0)) ? (
                            <><CheckCircle size={12} /> مسددة بالكامل</>
                          ) : (paid > 0 && remaining > 0) ? (
                            <><Clock size={12} /> مسددة جزئياً</>
                          ) : inv.status === 'posted' ? (
                            <><CheckCircle size={12} /> مرحلة</>
                          ) : (
                            'مسودة'
                          )}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <div className="flex items-center justify-center gap-1">
                          
                          {inv.status === 'draft' && (
                            <button 
                              onClick={() => handleApprove(inv.id)}
                              className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                              title="ترحيل الفاتورة وتوليد القيد"
                            >
                              <CheckCircle size={16} />
                            </button>
                          )}

                          <button 
                            onClick={() => navigate('/purchase-invoice', { state: { invoiceToEdit: inv } })}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="عرض وتعديل"
                          >
                            <Edit size={16} />
                          </button>

                          {(inv.status === 'posted' || inv.status === 'paid') && (
                            <button 
                              onClick={() => handleUnpost(inv)}
                              disabled={deletingId === inv.id}
                              className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-50"
                              title="إلغاء الترحيل والتحويل لمسودة"
                            >
                              <RotateCcw size={16} />
                            </button>
                          )}

                          {(inv.status === 'posted' || inv.status === 'paid') && remaining > 0 && (
                            <button 
                              onClick={() => openPaymentModal(inv)}
                              className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                              title="سداد دفعة للمورد"
                            >
                              <DollarSign size={16} />
                            </button>
                          )}

                          <button 
                            onClick={() => handlePrint(inv)}
                            className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                            title="طباعة الفاتورة"
                          >
                            <Printer size={16} />
                          </button>

                          <button 
                            onClick={() => handleShareWhatsApp(inv)}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="مشاركة عبر واتساب"
                          >
                            <MessageCircle size={16} />
                          </button>

                          <button 
                            onClick={() => handleDelete(inv)}
                            disabled={deletingId === inv.id}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                            title="حذف الفاتورة"
                          >
                            {deletingId === inv.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredInvoices.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-slate-400 font-bold">
                      لا توجد فواتير مشتريات مطابقة للبحث أو الفلترة.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {totalCount > itemsPerPage && (
          <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-bold">
              عرض {paginatedInvoices.length} من أصل {totalCount} فاتورة
            </span>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border bg-white text-slate-600 disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
              <span className="text-xs font-mono font-bold text-slate-700">
                صفحة {currentPage} من {totalPages}
              </span>
              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border bg-white text-slate-600 disabled:opacity-40"
              >
                <ChevronLeft size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Payment Modal */}
      {isPaymentModalOpen && selectedInvoiceForPayment && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <DollarSign className="text-purple-600" /> سداد فاتورة مشتريات
              </h3>
              <button onClick={() => setIsPaymentModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handlePaymentSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">المورد</label>
                <input 
                  type="text" 
                  disabled 
                  value={selectedInvoiceForPayment.suppliers?.name || 'مورد عام'} 
                  className="w-full border rounded-xl p-2.5 bg-slate-100 text-sm font-bold text-slate-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">المبلغ المطلوب سداده <span className="text-red-500">*</span></label>
                <input 
                  type="number" 
                  step="any" 
                  required 
                  min="0.01" 
                  value={paymentFormData.amount} 
                  onChange={e => setPaymentFormData({...paymentFormData, amount: Number(e.target.value)})}
                  className="w-full border rounded-xl p-2.5 bg-slate-50 text-sm font-mono font-bold text-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الخزينة / البنك <span className="text-red-500">*</span></label>
                <select 
                  required 
                  value={paymentFormData.treasuryAccountId} 
                  onChange={e => setPaymentFormData({...paymentFormData, treasuryAccountId: e.target.value})}
                  className="w-full border rounded-xl p-2.5 bg-slate-50 text-sm font-bold"
                >
                  <option value="">اختر الخزينة...</option>
                  {treasuryAccounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.code})</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ السداد</label>
                <input 
                  type="date" 
                  required 
                  value={paymentFormData.date} 
                  onChange={e => setPaymentFormData({...paymentFormData, date: e.target.value})}
                  className="w-full border rounded-xl p-2.5 bg-slate-50 text-sm font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات</label>
                <input 
                  type="text" 
                  value={paymentFormData.notes} 
                  onChange={e => setPaymentFormData({...paymentFormData, notes: e.target.value})}
                  className="w-full border rounded-xl p-2.5 bg-slate-50 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button 
                  type="button" 
                  onClick={() => setIsPaymentModalOpen(false)} 
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs"
                >
                  إلغاء
                </button>
                <button 
                  type="submit" 
                  className="px-5 py-2 rounded-xl bg-purple-600 text-white font-bold text-xs hover:bg-purple-700 shadow-sm"
                >
                  تأكيد سند الصرف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Hidden printable invoice */}
      {invoiceToPrint && (
        <PurchaseInvoicePrint invoiceData={invoiceToPrint} companySettings={companySettings} />
      )}

      {/* Supplier Invoice Excel Importer Modal */}
      <SupplierInvoiceExcelImporter
        isOpen={isImporterOpen}
        onClose={() => setIsImporterOpen(false)}
        onSuccess={() => {
          fetchInvoices();
          setIsImporterOpen(false);
        }}
      />
    </div>
  );
};

export default PurchaseInvoiceList;
