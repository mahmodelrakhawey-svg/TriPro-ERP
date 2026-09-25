/**
 * سجل سندات الصرف المطور - يشمل إحصائيات الموردين والمصاريف وفلاتر ذكية ومعاينة شاملة
 * المسار: modules/finance/reports/PaymentVoucherList.tsx
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import { supabase } from '../../../supabaseClient';
import { 
    Search, Printer, FileText, RotateCcw, AlertTriangle, Trash2, Edit,
    ChevronLeft, ChevronRight, FileSpreadsheet, Loader2, Plus, ArrowUpRight, 
    Eye, X, Paperclip, Building2, Receipt, Wallet, CircleDollarSign, 
    DollarSign, Calendar, Filter, XCircle, ExternalLink, ArrowRight,
    Landmark, CreditCard
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { PaymentVoucherPrint } from './PaymentVoucherPrint';
import { usePagination } from '../../../components/usePagination';

// Interface for Payment Voucher
interface PaymentVoucher {
  id: string;
  voucher_number: string;
  payment_date: string;
  amount: number;
  notes: string;
  payment_method: string;
  related_journal_entry_id?: string;
  supplier_id?: string | null;
  recipient_name?: string | null;
  treasury_account_id?: string | null;
  cost_center_id?: string | null;
  suppliers?: {
    name: string;
  };
  payment_voucher_attachments?: any[];
}

interface StatsState {
  totalPaidSuppliers: number;
  countPaidSuppliers: number;
  totalPaidExpenses: number;
  countPaidExpenses: number;
  totalAllPayments: number;
  totalCount: number;
  cashTotal: number;
  bankTotal: number;
  chequeTotal: number;
  loading: boolean;
}

const PaymentVoucherList = () => {
  const navigate = useNavigate();
  const { 
    currentUser, 
    vouchers: contextVouchers, 
    selectedFiscalYear, 
    suppliers, 
    accounts, 
    costCenters, 
    organization 
  } = useAccounting();
  const { showToast } = useToast();
  
  // Search & Type Filtering
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [voucherTypeFilter, setVoucherTypeFilter] = useState<'all' | 'supplier' | 'expense'>('all');
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState('');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('all');
  const [showWithAttachmentsOnly, setShowWithAttachmentsOnly] = useState(false);

  // Date Range Filter
  const [datePreset, setDatePreset] = useState<'all' | 'today' | 'week' | 'month' | 'year' | 'custom'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Modals State
  const [attachmentModalOpen, setAttachmentModalOpen] = useState(false);
  const [selectedAttachments, setSelectedAttachments] = useState<any[]>([]);
  const [viewingVoucher, setViewingVoucher] = useState<PaymentVoucher | null>(null);

  // Stats State
  const [statsRefreshKey, setStatsRefreshKey] = useState(0);
  const [stats, setStats] = useState<StatsState>({
    totalPaidSuppliers: 0,
    countPaidSuppliers: 0,
    totalPaidExpenses: 0,
    countPaidExpenses: 0,
    totalAllPayments: 0,
    totalCount: 0,
    cashTotal: 0,
    bankTotal: 0,
    chequeTotal: 0,
    loading: false
  });

  // Print State
  const [voucherToPrint, setVoucherToPrint] = useState<any>(null);
  const [companySettings, setCompanySettings] = useState<any>(null);

  // Load company settings for printing
  useEffect(() => {
    supabase.rpc('get_current_company_settings').maybeSingle().then(({ data, error }) => {
      if (error) {
        console.error("فشل جلب إعدادات الشركة عبر RPC:", error);
      } else {
        setCompanySettings(data);
      }
    });
  }, []);

  // Print trigger
  useEffect(() => {
    if (voucherToPrint) {
      const timer = setTimeout(() => {
        window.print();
        setVoucherToPrint(null);
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [voucherToPrint]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
        setDebouncedSearch(searchTerm);
        setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reset page when any filter changes
  useEffect(() => {
    setPage(1);
  }, [voucherTypeFilter, selectedSupplierFilter, paymentMethodFilter, showWithAttachmentsOnly, startDate, endDate]);

  // Date Presets Handler
  const handleDatePresetChange = (preset: 'all' | 'today' | 'week' | 'month' | 'year' | 'custom') => {
    setDatePreset(preset);
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    if (preset === 'all') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === 'week') {
      const d = new Date();
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const start = new Date(d.setDate(diff)).toISOString().split('T')[0];
      setStartDate(start);
      setEndDate(todayStr);
    } else if (preset === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
      setStartDate(start);
      setEndDate(end);
    } else if (preset === 'year') {
      const year = selectedFiscalYear || now.getFullYear();
      setStartDate(`${year}-01-01`);
      setEndDate(`${year}-12-31`);
    }
  };

  // Reset all filters
  const handleResetFilters = () => {
    setSearchTerm('');
    setDebouncedSearch('');
    setVoucherTypeFilter('all');
    setSelectedSupplierFilter('');
    setPaymentMethodFilter('all');
    setShowWithAttachmentsOnly(false);
    setDatePreset('all');
    setStartDate('');
    setEndDate('');
  };

  const hasActiveFilters = Boolean(
    searchTerm || 
    voucherTypeFilter !== 'all' || 
    selectedSupplierFilter || 
    paymentMethodFilter !== 'all' || 
    showWithAttachmentsOnly || 
    startDate || 
    endDate
  );

  // Pagination query modifier for Supabase
  const queryModifier = useCallback((query: any) => {
    if (debouncedSearch) {
       query = query.or(`voucher_number.ilike.%${debouncedSearch}%,notes.ilike.%${debouncedSearch}%`);
    }
    if (voucherTypeFilter === 'supplier') {
      query = query.not('supplier_id', 'is', null);
    } else if (voucherTypeFilter === 'expense') {
      query = query.is('supplier_id', null);
    }
    if (selectedSupplierFilter) {
      query = query.eq('supplier_id', selectedSupplierFilter);
    }
    if (paymentMethodFilter && paymentMethodFilter !== 'all') {
      query = query.eq('payment_method', paymentMethodFilter);
    }
    if (startDate) {
      query = query.gte('payment_date', startDate);
    }
    if (endDate) {
      query = query.lte('payment_date', endDate);
    }
    if (!startDate && !endDate && selectedFiscalYear) {
      query = query.gte('payment_date', `${selectedFiscalYear}-01-01`).lte('payment_date', `${selectedFiscalYear}-12-31`);
    }
    return query;
  }, [debouncedSearch, voucherTypeFilter, selectedSupplierFilter, paymentMethodFilter, startDate, endDate, selectedFiscalYear]);

  const selectQuery = showWithAttachmentsOnly 
    ? '*, suppliers(name), payment_voucher_attachments!inner(*)' 
    : '*, suppliers(name), payment_voucher_attachments(*)';

  const { 
    data: serverVouchers, 
    loading: serverLoading, 
    error: serverError,
    page, 
    setPage, 
    totalPages, 
    totalCount, 
    refresh: refreshPagination 
  } = usePagination<PaymentVoucher>('payment_vouchers', { 
      select: selectQuery, 
      pageSize: 20, 
      orderBy: 'payment_date', 
      ascending: false 
  }, queryModifier);

  // Filter vouchers from context for Demo mode
  const vouchersFromContext = useMemo(() => {
    let list = contextVouchers.filter(v => v.type === 'payment');
    
    if (voucherTypeFilter === 'supplier') {
      list = list.filter(v => Boolean(v.subType === 'supplier' || v.party_id || v.supplier_id));
    } else if (voucherTypeFilter === 'expense') {
      list = list.filter(v => !Boolean(v.subType === 'supplier' || v.party_id || v.supplier_id));
    }

    if (selectedSupplierFilter) {
      list = list.filter(v => (v.party_id === selectedSupplierFilter || v.supplier_id === selectedSupplierFilter));
    }

    if (paymentMethodFilter !== 'all') {
      list = list.filter(v => v.payment_method === paymentMethodFilter);
    }

    if (startDate) {
      list = list.filter(v => (v.date || '') >= startDate);
    }
    if (endDate) {
      list = list.filter(v => (v.date || '') <= endDate);
    }
    if (!startDate && !endDate && selectedFiscalYear) {
      list = list.filter(v => v.date && v.date.startsWith(String(selectedFiscalYear)));
    }

    if (debouncedSearch) {
      const s = debouncedSearch.toLowerCase();
      list = list.filter(v => 
        (v.voucher_number || '').toLowerCase().includes(s) ||
        (v.description || '').toLowerCase().includes(s) ||
        (v.party_name || '').toLowerCase().includes(s)
      );
    }

    return list.map(v => ({
      id: v.id,
      voucher_number: v.voucher_number || (v as any).reference || '',
      payment_date: v.date || '',
      amount: Number(v.amount) || 0,
      notes: v.description || '',
      payment_method: v.payment_method || 'cash',
      related_journal_entry_id: v.related_journal_entry_id,
      supplier_id: (v.subType === 'supplier' || v.party_id) ? (v.party_id || v.supplier_id || 'demo-sup') : null,
      recipient_name: v.subType !== 'supplier' ? (v.party_name || 'مصروف') : null,
      treasury_account_id: v.treasury_account_id,
      cost_center_id: v.cost_center_id,
      suppliers: (v.subType === 'supplier' || v.party_id) ? { name: v.party_name || 'مورد' } : undefined,
      payment_voucher_attachments: []
    } as PaymentVoucher));
  }, [contextVouchers, voucherTypeFilter, selectedSupplierFilter, paymentMethodFilter, startDate, endDate, selectedFiscalYear, debouncedSearch]);

  const isDemo = currentUser?.role === 'demo';
  const vouchers = isDemo ? vouchersFromContext : serverVouchers;
  const loading = isDemo ? false : serverLoading;
  const error = isDemo ? null : serverError;

  // Calculate Comprehensive Executive Statistics (across all records matching filters)
  useEffect(() => {
    if (isDemo) {
      // Calculate from in-memory context vouchers
      let list = contextVouchers.filter(v => v.type === 'payment');

      if (startDate) {
        list = list.filter(v => (v.date || '') >= startDate);
      }
      if (endDate) {
        list = list.filter(v => (v.date || '') <= endDate);
      }
      if (!startDate && !endDate && selectedFiscalYear) {
        list = list.filter(v => v.date && v.date.startsWith(String(selectedFiscalYear)));
      }
      if (debouncedSearch) {
        const s = debouncedSearch.toLowerCase();
        list = list.filter(v => 
          (v.voucher_number || '').toLowerCase().includes(s) ||
          (v.description || '').toLowerCase().includes(s) ||
          (v.party_name || '').toLowerCase().includes(s)
        );
      }
      if (selectedSupplierFilter) {
        list = list.filter(v => (v.party_id === selectedSupplierFilter || v.supplier_id === selectedSupplierFilter));
      }
      if (paymentMethodFilter !== 'all') {
        list = list.filter(v => v.payment_method === paymentMethodFilter);
      }

      let sTotal = 0, sCount = 0, eTotal = 0, eCount = 0, cash = 0, bank = 0, cheque = 0;
      list.forEach(v => {
        const amt = Number(v.amount) || 0;
        const isSupplier = Boolean(v.subType === 'supplier' || v.party_id || v.supplier_id);
        if (isSupplier) {
          sTotal += amt;
          sCount += 1;
        } else {
          eTotal += amt;
          eCount += 1;
        }
        const method = v.payment_method || 'cash';
        if (method === 'cash') cash += amt;
        else if (method === 'cheque' || method === 'check') cheque += amt;
        else bank += amt;
      });

      setStats({
        totalPaidSuppliers: sTotal,
        countPaidSuppliers: sCount,
        totalPaidExpenses: eTotal,
        countPaidExpenses: eCount,
        totalAllPayments: sTotal + eTotal,
        totalCount: list.length,
        cashTotal: cash,
        bankTotal: bank,
        chequeTotal: cheque,
        loading: false
      });
      return;
    }

    // Supabase Live Mode Aggregation
    let isCancelled = false;
    const fetchAggregateStats = async () => {
      setStats(prev => ({ ...prev, loading: true }));
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const userOrgId = organization?.id || session?.user?.user_metadata?.org_id;

        let q = supabase
          .from('payment_vouchers')
          .select('amount, supplier_id, payment_method, payment_date, notes, voucher_number');

        if (userOrgId) {
          q = q.eq('organization_id', userOrgId);
        }
        if (startDate) {
          q = q.gte('payment_date', startDate);
        }
        if (endDate) {
          q = q.lte('payment_date', endDate);
        }
        if (!startDate && !endDate && selectedFiscalYear) {
          q = q.gte('payment_date', `${selectedFiscalYear}-01-01`).lte('payment_date', `${selectedFiscalYear}-12-31`);
        }
        if (debouncedSearch) {
          q = q.or(`voucher_number.ilike.%${debouncedSearch}%,notes.ilike.%${debouncedSearch}%`);
        }
        if (selectedSupplierFilter) {
          q = q.eq('supplier_id', selectedSupplierFilter);
        }
        if (paymentMethodFilter !== 'all') {
          q = q.eq('payment_method', paymentMethodFilter);
        }

        const { data, error } = await q;
        if (error) throw error;
        if (isCancelled) return;

        let sTotal = 0, sCount = 0, eTotal = 0, eCount = 0, cash = 0, bank = 0, cheque = 0;
        (data || []).forEach((row: any) => {
          const amt = Number(row.amount) || 0;
          if (row.supplier_id) {
            sTotal += amt;
            sCount += 1;
          } else {
            eTotal += amt;
            eCount += 1;
          }
          const method = row.payment_method || 'cash';
          if (method === 'cash') cash += amt;
          else if (method === 'cheque' || method === 'check') cheque += amt;
          else bank += amt;
        });

        setStats({
          totalPaidSuppliers: sTotal,
          countPaidSuppliers: sCount,
          totalPaidExpenses: eTotal,
          countPaidExpenses: eCount,
          totalAllPayments: sTotal + eTotal,
          totalCount: (data || []).length,
          cashTotal: cash,
          bankTotal: bank,
          chequeTotal: cheque,
          loading: false
        });
      } catch (err: any) {
        console.error('Error fetching voucher stats:', err);
        if (!isCancelled) {
          setStats(prev => ({ ...prev, loading: false }));
        }
      }
    };

    fetchAggregateStats();
    return () => {
      isCancelled = true;
    };
  }, [isDemo, contextVouchers, selectedFiscalYear, startDate, endDate, debouncedSearch, selectedSupplierFilter, paymentMethodFilter, organization?.id, statsRefreshKey]);

  const refreshAll = () => {
    refreshPagination();
    setStatsRefreshKey(k => k + 1);
  };

  // Helper percentages
  const supplierPercentage = stats.totalAllPayments > 0 
    ? ((stats.totalPaidSuppliers / stats.totalAllPayments) * 100).toFixed(1) 
    : '0';
  const expensePercentage = stats.totalAllPayments > 0 
    ? ((stats.totalPaidExpenses / stats.totalAllPayments) * 100).toFixed(1) 
    : '0';
  const avgVoucherAmount = stats.totalCount > 0 
    ? (stats.totalAllPayments / stats.totalCount).toFixed(0) 
    : '0';

  const handleExportExcel = () => {
    const exportData = vouchers.map(v => {
      const isSupplier = Boolean(v.supplier_id);
      const partyName = isSupplier 
        ? (v.suppliers?.name || 'مورد غير محدد')
        : (v.recipient_name || v.notes?.slice(0, 30) || 'مصروف عام');
      const treasuryName = accounts.find(a => a.id === v.treasury_account_id)?.name || 'الخزينة / الحساب';
      const costCenterName = costCenters.find(c => c.id === v.cost_center_id)?.name || '-';

      return {
        'نوع السند': isSupplier ? 'سداد مورد' : 'سداد مصروف',
        'رقم السند': v.voucher_number || '-',
        'التاريخ': v.payment_date,
        'المستفيد / الحساب': partyName,
        'حساب الصرف': treasuryName,
        'مركز التكلفة': costCenterName,
        'المبلغ (ج.م)': v.amount,
        'طريقة الدفع': v.payment_method === 'cash' ? 'نقدي' : v.payment_method === 'cheque' ? 'شيك' : v.payment_method === 'transfer' ? 'تحويل بنكي' : 'أخرى',
        'البيان': v.notes || '-'
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "سندات الصرف");
    XLSX.writeFile(wb, `سجل_سندات_الصرف_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handlePreviewAttachment = (attachment: any) => {
    const { data } = supabase.storage.from('documents').getPublicUrl(attachment.file_path);
    window.open(data.publicUrl, '_blank');
  };

  const handleViewAttachments = (attachments: any[]) => {
    if (attachments.length === 1) {
        handlePreviewAttachment(attachments[0]);
    } else {
        setSelectedAttachments(attachments);
        setAttachmentModalOpen(true);
    }
  };

  const handlePrint = (voucher: any) => {
    setVoucherToPrint(voucher);
  };

  const handleEdit = (voucher: PaymentVoucher) => {
    if (voucher.supplier_id) {
      navigate('/payment-voucher', { state: { voucherToEdit: voucher } });
    } else {
      navigate('/expense-voucher', { state: { voucherToEdit: voucher } });
    }
  };

  const handleDeleteVoucher = async (voucher: PaymentVoucher) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا السند؟ سيؤدي ذلك لحذف السند والقيود المحاسبية المرتبطة به نهائياً من الدفاتر.')) {
        return;
    }

    try {
        if (voucher.related_journal_entry_id) {
            await supabase
                .from('journal_entries')
                .delete()
                .eq('id', voucher.related_journal_entry_id);
        }

        const { error } = await supabase
            .from('payment_vouchers')
            .delete()
            .eq('id', voucher.id);

        if (error) throw error;

        showToast('تم حذف سند الصرف والقيود المرتبطة بنجاح ✅', 'success');
        refreshAll();
    } catch (err: any) {
        showToast('حدث خطأ أثناء محاولة الحذف: ' + err.message, 'error');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in pb-12">
      <div className={voucherToPrint ? 'print:hidden' : ''}>
        
        {/* Top Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center text-white shadow-lg shadow-red-500/20">
                <ArrowUpRight size={26} strokeWidth={2.5} />
              </div>
              <div>
                <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                  سجل سندات الصرف
                  <span className="text-xs font-bold px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 rounded-full">
                    الخزينة والمدفوعات
                  </span>
                </h1>
                <p className="text-sm font-medium text-slate-500 mt-0.5">
                  إدارة شاملة لمدفوعات الموردين وسندات المصروفات وتدفقات الصرف النقدية والبنكية
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
            <button 
              onClick={() => navigate('/payment-voucher')} 
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-black text-sm hover:bg-indigo-700 transition-all shadow-md shadow-indigo-600/20 active:scale-95"
              title="إنشاء سند صرف لمورد"
            >
              <Building2 size={17} />
              <span>+ صرف لمورد</span>
            </button>
            <button 
              onClick={() => navigate('/expense-voucher')} 
              className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 text-white rounded-xl font-black text-sm hover:bg-amber-700 transition-all shadow-md shadow-amber-600/20 active:scale-95"
              title="إنشاء سند صرف مصروفات"
            >
              <Receipt size={17} />
              <span>+ صرف مصروفات</span>
            </button>
            <button 
              onClick={refreshAll} 
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-50 hover:border-slate-400 transition-all shadow-sm active:scale-95"
              title="تحديث البيانات"
            >
              <RotateCcw size={16} />
              <span className="hidden sm:inline">تحديث</span>
            </button>
            <button 
              onClick={handleExportExcel} 
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all shadow-md shadow-emerald-600/20 active:scale-95"
              title="تصدير جدول البيانات إلى Excel"
            >
              <FileSpreadsheet size={16} />
              <span>تصدير Excel</span>
            </button>
          </div>
        </div>

        {/* 🌟 KPI Executive Dashboard: إجمالي المسدد للموردين وإجمالي المسدد مصاريف 🌟 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          
          {/* Card 1: إجمالي المسدد للموردين (Supplier Disbursements) */}
          <div 
            onClick={() => setVoucherTypeFilter(f => f === 'supplier' ? 'all' : 'supplier')}
            className={`group relative overflow-hidden bg-white p-5 rounded-3xl border transition-all cursor-pointer select-none ${
              voucherTypeFilter === 'supplier' 
                ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-lg shadow-indigo-500/10' 
                : 'border-slate-200/90 hover:border-indigo-300 hover:shadow-md'
            }`}
          >
            <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-r from-indigo-500 to-blue-600" />
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block animate-pulse" />
                  إجمالي المسدد للموردين
                </p>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight font-mono">
                    {stats.totalPaidSuppliers.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-xs font-bold text-slate-400">ج.م</span>
                </div>
              </div>
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100/80 group-hover:scale-110 transition-transform">
                <Building2 size={24} />
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 font-bold border border-indigo-100">
                {stats.countPaidSuppliers} سند صرف مورد
              </span>
              <span className="text-slate-500 font-bold">
                {supplierPercentage}% من الصرف
              </span>
            </div>
            
            {voucherTypeFilter === 'supplier' && (
              <div className="mt-2 text-center text-[11px] font-bold text-indigo-600 bg-indigo-50/50 py-1 rounded-lg">
                ✓ تصفية مفعلة: سداد موردين فقط
              </div>
            )}
          </div>

          {/* Card 2: إجمالي المسدد مصاريف (Expense Disbursements) */}
          <div 
            onClick={() => setVoucherTypeFilter(f => f === 'expense' ? 'all' : 'expense')}
            className={`group relative overflow-hidden bg-white p-5 rounded-3xl border transition-all cursor-pointer select-none ${
              voucherTypeFilter === 'expense' 
                ? 'border-amber-500 ring-2 ring-amber-500/20 shadow-lg shadow-amber-500/10' 
                : 'border-slate-200/90 hover:border-amber-300 hover:shadow-md'
            }`}
          >
            <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-r from-amber-500 to-orange-500" />
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 inline-block animate-pulse" />
                  إجمالي المسدد مصاريف
                </p>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight font-mono">
                    {stats.totalPaidExpenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-xs font-bold text-slate-400">ج.م</span>
                </div>
              </div>
              <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl border border-amber-100/80 group-hover:scale-110 transition-transform">
                <Receipt size={24} />
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 font-bold border border-amber-100">
                {stats.countPaidExpenses} سند صرف مصروف
              </span>
              <span className="text-slate-500 font-bold">
                {expensePercentage}% من الصرف
              </span>
            </div>

            {voucherTypeFilter === 'expense' && (
              <div className="mt-2 text-center text-[11px] font-bold text-amber-600 bg-amber-50/50 py-1 rounded-lg">
                ✓ تصفية مفعلة: سندات المصاريف فقط
              </div>
            )}
          </div>

          {/* Card 3: إجمالي كافة المدفوعات (Total Combined Disbursements) */}
          <div 
            onClick={() => setVoucherTypeFilter('all')}
            className={`group relative overflow-hidden bg-white p-5 rounded-3xl border transition-all cursor-pointer select-none ${
              voucherTypeFilter === 'all' 
                ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-lg shadow-emerald-500/10' 
                : 'border-slate-200/90 hover:border-emerald-300 hover:shadow-md'
            }`}
          >
            <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-r from-emerald-500 to-teal-500" />
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                  إجمالي كافة الصرفيات
                </p>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight font-mono">
                    {stats.totalAllPayments.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-xs font-bold text-slate-400">ج.م</span>
                </div>
              </div>
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100/80 group-hover:scale-110 transition-transform">
                <CircleDollarSign size={24} />
              </div>
            </div>

            {/* Visual ratio bar */}
            <div className="mt-3">
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                <div 
                  className="bg-indigo-500 transition-all duration-500" 
                  style={{ width: `${supplierPercentage}%` }} 
                  title={`الموردين: ${supplierPercentage}%`} 
                />
                <div 
                  className="bg-amber-500 transition-all duration-500" 
                  style={{ width: `${expensePercentage}%` }} 
                  title={`المصاريف: ${expensePercentage}%`} 
                />
              </div>
            </div>

            <div className="mt-2.5 flex items-center justify-between text-xs">
              <span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 font-bold border border-emerald-100">
                {stats.totalCount} إجمالي السندات
              </span>
              <span className="text-slate-400 font-semibold text-[11px]">
                انقر لعرض الكل
              </span>
            </div>
          </div>

          {/* Card 4: قنوات الصرف ومتوسط السند (Channels & Avg) */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-r from-blue-500 to-cyan-500" />
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Wallet size={14} className="text-blue-500" />
                  توزيع قنوات الصرف
                </p>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="text-sm font-black text-slate-500">متوسط السند:</span>
                  <span className="text-lg font-black text-blue-700 font-mono">
                    {Number(avgVoucherAmount).toLocaleString()}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400">ج.م</span>
                </div>
              </div>
              <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl border border-blue-100/80">
                <Wallet size={24} />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-1.5 text-center text-xs pt-2 border-t border-slate-100">
              <div className="bg-slate-50 p-1.5 rounded-xl border border-slate-100">
                <span className="block text-[10px] text-slate-400 font-bold">نقدي</span>
                <span className="font-mono font-bold text-slate-700 text-[11px] truncate block" title={`${stats.cashTotal.toLocaleString()} ج.م`}>
                  {stats.cashTotal > 1000 ? `${(stats.cashTotal / 1000).toFixed(1)}k` : stats.cashTotal}
                </span>
              </div>
              <div className="bg-slate-50 p-1.5 rounded-xl border border-slate-100">
                <span className="block text-[10px] text-slate-400 font-bold">تحويل/بنك</span>
                <span className="font-mono font-bold text-slate-700 text-[11px] truncate block" title={`${stats.bankTotal.toLocaleString()} ج.م`}>
                  {stats.bankTotal > 1000 ? `${(stats.bankTotal / 1000).toFixed(1)}k` : stats.bankTotal}
                </span>
              </div>
              <div className="bg-slate-50 p-1.5 rounded-xl border border-slate-100">
                <span className="block text-[10px] text-slate-400 font-bold">شيكات</span>
                <span className="font-mono font-bold text-slate-700 text-[11px] truncate block" title={`${stats.chequeTotal.toLocaleString()} ج.م`}>
                  {stats.chequeTotal > 1000 ? `${(stats.chequeTotal / 1000).toFixed(1)}k` : stats.chequeTotal}
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* Error notification if any */}
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-2xl border border-red-200 flex items-center gap-3 mt-6">
              <AlertTriangle size={24} />
              <div>
                  <p className="font-bold">حدث خطأ أثناء تحميل البيانات</p>
                  <p className="text-sm">{error}</p>
              </div>
          </div>
        )}

        {/* Segmented Filter Control & Advanced Filters Box */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 mt-6 space-y-4">
          
          {/* Row 1: Type Tabs & Date Quick Presets */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            
            {/* Type Segmented Buttons */}
            <div className="flex items-center gap-1.5 bg-slate-100/80 p-1.5 rounded-2xl w-full sm:w-auto">
              <button
                onClick={() => setVoucherTypeFilter('all')}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${
                  voucherTypeFilter === 'all' 
                    ? 'bg-white text-slate-800 shadow-sm' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>الكل</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
                  {stats.totalCount}
                </span>
              </button>

              <button
                onClick={() => setVoucherTypeFilter('supplier')}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${
                  voucherTypeFilter === 'supplier' 
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Building2 size={14} />
                <span>سداد موردين</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  voucherTypeFilter === 'supplier' ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {stats.countPaidSuppliers}
                </span>
              </button>

              <button
                onClick={() => setVoucherTypeFilter('expense')}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${
                  voucherTypeFilter === 'expense' 
                    ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Receipt size={14} />
                <span>سداد مصاريف</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  voucherTypeFilter === 'expense' ? 'bg-amber-700 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {stats.countPaidExpenses}
                </span>
              </button>
            </div>

            {/* Date Preset Buttons */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-bold text-slate-400 ml-1 flex items-center gap-1">
                <Calendar size={13} />
                الفترة:
              </span>
              {[
                { id: 'all', label: 'الكل' },
                { id: 'today', label: 'اليوم' },
                { id: 'week', label: 'هذا الأسبوع' },
                { id: 'month', label: 'هذا الشهر' },
                { id: 'year', label: 'هذا العام' }
              ].map(preset => (
                <button
                  key={preset.id}
                  onClick={() => handleDatePresetChange(preset.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                    datePreset === preset.id 
                      ? 'bg-slate-800 text-white' 
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/60'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

          </div>

          {/* Row 2: Search, Filters & Custom Dates */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3.5 items-end">
            
            {/* Quick Search */}
            <div className="lg:col-span-2">
              <label className="text-xs font-black text-slate-400 block mb-1.5">بحث بالرقم أو البيان</label>
              <div className="relative">
                <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                    type="text" 
                    placeholder="بحث برقم السند، البيان، اسم المورد..." 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)} 
                    className="w-full border border-slate-200 rounded-xl pr-11 pl-4 py-2.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 bg-slate-50/70 font-bold text-slate-700 text-sm transition-all" 
                />
                {searchTerm && (
                  <button 
                    onClick={() => setSearchTerm('')} 
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            </div>

            {/* Supplier Filter (only active/relevant when viewing all or suppliers) */}
            <div>
              <label className="text-xs font-black text-slate-400 block mb-1.5">تصفية حسب المورد</label>
              <select
                  value={selectedSupplierFilter}
                  onChange={e => setSelectedSupplierFilter(e.target.value)}
                  disabled={voucherTypeFilter === 'expense'}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:border-indigo-500 bg-slate-50/70 font-bold text-slate-700 text-xs disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                  <option value="">-- كل الموردين --</option>
                  {suppliers?.map(s => (
                      <option key={s.id} value={s.id}>{s.name} {s.code ? `(#${s.code})` : ''}</option>
                  ))}
              </select>
            </div>

            {/* Payment Method Filter */}
            <div>
              <label className="text-xs font-black text-slate-400 block mb-1.5">طريقة الصرف</label>
              <select
                  value={paymentMethodFilter}
                  onChange={e => setPaymentMethodFilter(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:border-indigo-500 bg-slate-50/70 font-bold text-slate-700 text-xs transition-all"
              >
                  <option value="all">-- كل طرق الصرف --</option>
                  <option value="cash">نقدي (خزينة)</option>
                  <option value="transfer">تحويل بنكي</option>
                  <option value="cheque">شيك مصرفي</option>
              </select>
            </div>

            {/* Attachments Toggle & Reset */}
            <div className="flex items-center gap-2">
              <label className="flex-1 flex items-center justify-center gap-2 cursor-pointer bg-slate-50/70 px-3 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 transition-colors select-none">
                  <input 
                      type="checkbox" 
                      checked={showWithAttachmentsOnly} 
                      onChange={(e) => setShowWithAttachmentsOnly(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                  />
                  <span className="text-xs font-bold text-slate-600">مرفقات</span>
                  <Paperclip size={14} className="text-slate-400" />
              </label>

              {hasActiveFilters && (
                <button
                  onClick={handleResetFilters}
                  className="p-2.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl border border-slate-200 transition-all"
                  title="إلغاء كافة الفلاتر"
                >
                  <XCircle size={18} />
                </button>
              )}
            </div>

          </div>

          {/* Row 3: Custom Date Range (when needed) */}
          <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-slate-500">
            <span className="font-bold text-slate-600 flex items-center gap-1">
              <Filter size={13} />
              نطاق مخصص:
            </span>
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-400">من:</span>
              <input 
                type="date" 
                value={startDate}
                onChange={e => {
                  setStartDate(e.target.value);
                  setDatePreset('custom');
                }}
                className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-bold bg-white text-slate-700 outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-400">إلى:</span>
              <input 
                type="date" 
                value={endDate}
                onChange={e => {
                  setEndDate(e.target.value);
                  setDatePreset('custom');
                }}
                className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-bold bg-white text-slate-700 outline-none focus:border-indigo-500"
              />
            </div>

            {selectedFiscalYear && !startDate && !endDate && (
              <span className="text-[11px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md font-bold">
                السنة المالية المحددة: {selectedFiscalYear}
              </span>
            )}
          </div>

        </div>

        {/* Data Table Section */}
        {loading ? (
          <div className="flex flex-col items-center justify-center p-16 bg-white rounded-3xl border border-slate-200 mt-6">
            <Loader2 className="animate-spin text-indigo-600 mb-3" size={36} />
            <p className="text-sm font-bold text-slate-500">جاري تحميل سجل سندات الصرف...</p>
          </div>
        ) : (
        <div className="bg-white rounded-[32px] shadow-sm border border-slate-200 overflow-hidden mt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
                <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-500 text-xs font-black uppercase tracking-wider">
                    <tr>
                        <th className="py-4 px-5">رقم السند</th>
                        <th className="py-4 px-4">التاريخ</th>
                        <th className="py-4 px-4">نوع السند</th>
                        <th className="py-4 px-5">المستفيد / الحساب</th>
                        <th className="py-4 px-5">حساب الصرف</th>
                        <th className="py-4 px-5">البيان</th>
                        <th className="py-4 px-5 text-center">المبلغ</th>
                        <th className="py-4 px-4 text-center">طريقة الدفع</th>
                        <th className="py-4 px-3 text-center">مرفقات</th>
                        <th className="py-4 px-4 text-center min-w-[170px] sticky left-0 bg-slate-50 border-r border-slate-200/80 shadow-[-4px_0_10px_rgba(0,0,0,0.03)] z-20">إجراءات</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                    {vouchers.map(voucher => {
                        const isSupplier = Boolean(voucher.supplier_id);
                        const beneficiaryName = isSupplier 
                          ? (voucher.suppliers?.name || 'مورد')
                          : (voucher.recipient_name || 'مصروفات');
                        const treasuryName = accounts.find(a => a.id === voucher.treasury_account_id)?.name || 'الخزينة';

                        return (
                          <tr key={voucher.id} className="hover:bg-slate-50/80 transition-colors group">
                              
                              {/* رقم السند */}
                              <td className="py-3.5 px-5 font-black font-mono text-xs">
                                <span className={`px-2 py-1 rounded-lg ${isSupplier ? 'text-indigo-700 bg-indigo-50 border border-indigo-100' : 'text-amber-700 bg-amber-50 border border-amber-100'}`}>
                                  {voucher.voucher_number || '-'}
                                </span>
                              </td>

                              {/* التاريخ */}
                              <td className="py-3.5 px-4 text-slate-600 font-medium text-xs whitespace-nowrap">
                                {voucher.payment_date}
                              </td>

                              {/* نوع السند */}
                              <td className="py-3.5 px-4 whitespace-nowrap">
                                {isSupplier ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/70">
                                    <Building2 size={13} />
                                    <span>سداد مورد</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200/70">
                                    <Receipt size={13} />
                                    <span>سند مصروف</span>
                                  </span>
                                )}
                              </td>

                              {/* المستفيد / المورد */}
                              <td className="py-3.5 px-5 font-bold text-slate-800">
                                <div className="flex items-center gap-2">
                                  <span className="truncate max-w-[180px]" title={beneficiaryName}>
                                    {beneficiaryName}
                                  </span>
                                </div>
                              </td>

                              {/* حساب الصرف */}
                              <td className="py-3.5 px-5 text-slate-600 text-xs font-medium">
                                <span className="truncate max-w-[140px] block text-slate-500" title={treasuryName}>
                                  {treasuryName}
                                </span>
                              </td>

                              {/* البيان */}
                              <td className="py-3.5 px-5 text-slate-600 text-xs max-w-xs truncate" title={voucher.notes}>
                                {voucher.notes || '-'}
                              </td>

                              {/* المبلغ */}
                              <td className="py-3.5 px-5 text-center font-black text-slate-900 font-mono text-sm">
                                {Number(voucher.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>

                              {/* طريقة الدفع */}
                              <td className="py-3.5 px-4 text-center whitespace-nowrap">
                                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                                    voucher.payment_method === 'cash' 
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/70' 
                                      : voucher.payment_method === 'cheque' 
                                      ? 'bg-purple-50 text-purple-700 border border-purple-200/70' 
                                      : 'bg-blue-50 text-blue-700 border border-blue-200/70'
                                  }`}>
                                      {voucher.payment_method === 'cash' ? 'نقدي' : 
                                      voucher.payment_method === 'cheque' ? 'شيك' : 
                                      voucher.payment_method === 'transfer' ? 'تحويل' : 'أخرى'}
                                  </span>
                              </td>

                              {/* المرفقات */}
                              <td className="py-3.5 px-3 text-center">
                                  {voucher.payment_voucher_attachments && voucher.payment_voucher_attachments.length > 0 ? (
                                      <button 
                                        onClick={() => handleViewAttachments(voucher.payment_voucher_attachments || [])} 
                                        className="text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 p-1.5 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1 transition-colors"
                                        title="عرض المرفقات"
                                      >
                                          <Paperclip size={13} />
                                          <span>({voucher.payment_voucher_attachments.length})</span>
                                      </button>
                                  ) : (
                                    <span className="text-slate-300 text-xs">-</span>
                                  )}
                              </td>

                              {/* الإجراءات (عمود مثبت دائماً لسهولة الوصول دون الحاجة للتمرير) */}
                              <td className="py-3 px-3 text-center whitespace-nowrap sticky left-0 bg-white group-hover:bg-slate-50/90 transition-colors border-r border-slate-100 shadow-[-4px_0_8px_rgba(0,0,0,0.04)] z-10">
                                  <div className="flex items-center justify-center gap-1.5">
                                    <button 
                                      onClick={() => setViewingVoucher(voucher)} 
                                      className="p-1.5 text-indigo-600 bg-indigo-50/80 hover:bg-indigo-100 rounded-xl transition-all" 
                                      title="معاينة تفاصيل السند"
                                    >
                                        <Eye size={16} />
                                    </button>
                                    <button 
                                      onClick={() => handleEdit(voucher)} 
                                      className="p-1.5 text-blue-600 bg-blue-50/80 hover:bg-blue-100 rounded-xl transition-all" 
                                      title="تعديل السند"
                                    >
                                        <Edit size={16} />
                                    </button>
                                    <button 
                                      onClick={() => handlePrint(voucher)} 
                                      className="p-1.5 text-emerald-600 bg-emerald-50/80 hover:bg-emerald-100 rounded-xl transition-all" 
                                      title="طباعة السند"
                                    >
                                        <Printer size={16} />
                                    </button>
                                    <button 
                                      onClick={() => handleDeleteVoucher(voucher)} 
                                      className="p-1.5 text-red-600 bg-red-50/80 hover:bg-red-100 rounded-xl transition-all" 
                                      title="حذف السند"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                  </div>
                              </td>
                          </tr>
                        );
                    })}

                    {vouchers.length === 0 && !loading && (
                        <tr>
                          <td colSpan={10} className="p-16 text-center text-slate-400 font-medium">
                            <div className="flex flex-col items-center justify-center">
                              <Receipt size={40} className="text-slate-300 mb-2" />
                              <p className="text-base font-bold text-slate-600">لا توجد سندات صرف مطابقة</p>
                              <p className="text-xs text-slate-400 mt-1">جرب تغيير شروط البحث أو الفلاتر أو اختر فترة زمنية أخرى</p>
                            </div>
                          </td>
                        </tr>
                    )}
                </tbody>
            </table>
          </div>
          
          {/* Pagination Controls */}
          <div className="bg-slate-50/90 p-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs font-bold text-slate-500">
                  عرض {vouchers.length} من أصل {isDemo ? vouchers.length : totalCount} سند
              </div>
              <div className="flex items-center gap-2">
                  <button 
                      onClick={() => setPage(p => Math.max(1, p - 1))} 
                      disabled={page === 1 || loading}
                      className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white transition-all shadow-sm"
                      title="الصفحة السابقة"
                  >
                      <ChevronRight size={18} />
                  </button>
                  <span className="text-xs font-black text-slate-700 px-3 py-1 bg-white border border-slate-200 rounded-xl shadow-sm">
                    صفحة {page} من {isDemo ? 1 : Math.max(1, totalPages)}
                  </span>
                  <button 
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))} 
                      disabled={page === totalPages || loading || totalPages <= 1}
                      className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white transition-all shadow-sm"
                      title="الصفحة التالية"
                  >
                      <ChevronLeft size={18} />
                  </button>
              </div>
          </div>
        </div>
        )}

      </div>

      {/* 📄 Quick Voucher Detail Modal (نافذة تفاصيل السند الكاملة) */}
      {viewingVoucher && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4" onClick={() => setViewingVoucher(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150" onClick={e => e.stopPropagation()}>
            
            {/* Modal Header */}
            <div className={`p-6 border-b flex justify-between items-center ${
              viewingVoucher.supplier_id ? 'bg-indigo-50/70 border-indigo-100' : 'bg-amber-50/70 border-amber-100'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-2xl ${
                  viewingVoucher.supplier_id ? 'bg-indigo-600 text-white' : 'bg-amber-600 text-white'
                }`}>
                  {viewingVoucher.supplier_id ? <Building2 size={24} /> : <Receipt size={24} />}
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-800">
                    {viewingVoucher.supplier_id ? 'سند صرف مورد' : 'سند صرف مصروفات'}
                  </h3>
                  <p className="text-xs font-bold text-slate-500 font-mono mt-0.5">
                    رقم السند: {viewingVoucher.voucher_number || '-'}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setViewingVoucher(null)} 
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-white rounded-xl transition-all"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              
              {/* Financial Highlight */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-400 block">المبلغ المنصرف</span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-3xl font-black text-slate-900 font-mono">
                      {Number(viewingVoucher.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-xs font-bold text-slate-500">ج.م</span>
                  </div>
                </div>

                <div className="text-left">
                  <span className="text-xs font-bold text-slate-400 block">تاريخ الصرف</span>
                  <span className="text-sm font-bold text-slate-800 font-mono mt-1 block">
                    {viewingVoucher.payment_date}
                  </span>
                </div>
              </div>

              {/* Key Details Grid */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="p-3 bg-slate-50/50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 font-bold block mb-1">المستفيد / الحساب:</span>
                  <span className="font-bold text-slate-800 text-sm">
                    {viewingVoucher.supplier_id ? (viewingVoucher.suppliers?.name || 'مورد') : (viewingVoucher.recipient_name || 'مصروفات')}
                  </span>
                </div>

                <div className="p-3 bg-slate-50/50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 font-bold block mb-1">طريقة الدفع:</span>
                  <span className="font-bold text-slate-800 text-sm">
                    {viewingVoucher.payment_method === 'cash' ? 'نقدي (خزينة)' : viewingVoucher.payment_method === 'cheque' ? 'شيك بنكي' : 'تحويل بنكي'}
                  </span>
                </div>

                <div className="p-3 bg-slate-50/50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 font-bold block mb-1">حساب الصرف:</span>
                  <span className="font-bold text-slate-800 text-sm">
                    {accounts.find(a => a.id === viewingVoucher.treasury_account_id)?.name || 'الخزينة الرئيسية'}
                  </span>
                </div>

                <div className="p-3 bg-slate-50/50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 font-bold block mb-1">مركز التكلفة:</span>
                  <span className="font-bold text-slate-800 text-sm">
                    {costCenters.find(c => c.id === viewingVoucher.cost_center_id)?.name || 'غير محدد'}
                  </span>
                </div>
              </div>

              {/* Notes / Description */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-xs font-bold text-slate-400 block mb-1">البيان / الملاحظات:</span>
                <p className="text-sm font-medium text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {viewingVoucher.notes || 'لا توجد ملاحظات مسجلة على هذا السند.'}
                </p>
              </div>

              {/* Attachments Section */}
              {viewingVoucher.payment_voucher_attachments && viewingVoucher.payment_voucher_attachments.length > 0 && (
                <div>
                  <span className="text-xs font-bold text-slate-400 block mb-2">
                    المرفقات ({viewingVoucher.payment_voucher_attachments.length}):
                  </span>
                  <div className="space-y-2">
                    {viewingVoucher.payment_voucher_attachments.map((att, idx) => (
                      <div key={att.id || idx} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200/70 rounded-xl">
                        <span className="text-xs font-mono font-medium text-slate-700 truncate max-w-[300px]" dir="ltr">
                          {att.file_name}
                        </span>
                        <button 
                          onClick={() => handlePreviewAttachment(att)} 
                          className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold transition-colors"
                        >
                          معاينة
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => {
                    handlePrint(viewingVoucher);
                    setViewingVoucher(null);
                  }} 
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700 transition-all shadow-sm"
                >
                  <Printer size={15} />
                  <span>طباعة السند</span>
                </button>
                <button 
                  onClick={() => {
                    handleEdit(viewingVoucher);
                    setViewingVoucher(null);
                  }} 
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-xs hover:bg-indigo-700 transition-all shadow-sm"
                >
                  <Edit size={15} />
                  <span>تعديل السند</span>
                </button>
              </div>

              <button 
                onClick={() => setViewingVoucher(null)} 
                className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-xs hover:bg-slate-100 transition-all"
              >
                إغلاق
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Attachments List Modal */}
      {attachmentModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110]" onClick={() => setAttachmentModalOpen(false)}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                      <Paperclip size={16} className="text-slate-500" />
                      المرفقات ({selectedAttachments.length})
                    </h3>
                    <button onClick={() => setAttachmentModalOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors">
                      <X size={18} />
                    </button>
                </div>
                <div className="p-4 max-h-[60vh] overflow-y-auto space-y-2">
                    {selectedAttachments.map((att, idx) => (
                        <div key={att.id || idx} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200/70 rounded-xl hover:border-indigo-200 transition-colors">
                            <span className="text-xs font-medium text-slate-700 truncate max-w-[220px]" dir="ltr">
                              {att.file_name}
                            </span>
                            <button 
                              onClick={() => handlePreviewAttachment(att)} 
                              className="text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                            >
                              معاينة
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
      )}

      {/* Print Component (Hidden on Screen, visible on Print) */}
      <PaymentVoucherPrint voucher={voucherToPrint} companySettings={companySettings} />
    </div>
  );
};

export default PaymentVoucherList;
