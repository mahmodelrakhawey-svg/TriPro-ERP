import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccounting } from '../../context/AccountingContext';
import { supabase } from '../../supabaseClient';
import { Invoice } from '../../types';
import { Search, Loader2, Edit, Plus, ChevronLeft, ChevronRight, AlertCircle, FileText, CheckCircle, MessageCircle, Printer } from 'lucide-react';
import { useDebounce } from '../../context/useDebounce';
import { SalesInvoicePrint } from './SalesInvoicePrint';

const InvoiceList = () => {
  const { getInvoicesPaginated, settings, approveSalesInvoice } = useAccounting();
  const navigate = useNavigate();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Print State
  const [invoiceToPrint, setInvoiceToPrint] = useState<any>(null);
  const [companySettings, setCompanySettings] = useState<any>(null);

  useEffect(() => {
    supabase.from('company_settings').select('*').single().then(({ data }) => setCompanySettings(data));
  }, []);

  useEffect(() => {
    if (invoiceToPrint) {
      const timer = setTimeout(() => {
        window.print();
        setInvoiceToPrint(null);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [invoiceToPrint]);

  const debouncedSearchTerm = useDebounce(searchTerm, 500); // Debounce search input
  const PAGE_SIZE = 15;

  const fetchInvoices = useCallback(async (page: number, search: string, start?: string, end?: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data, count } = await getInvoicesPaginated(page, PAGE_SIZE, search, start, end);
      setInvoices(data);
      setTotalPages(Math.ceil((count || 0) / PAGE_SIZE));
    } catch (err: any) {
      setError('فشل تحميل الفواتير. يرجى المحاولة مرة أخرى.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [getInvoicesPaginated]);

  useEffect(() => {
    // Reset to page 1 on new search
    if (currentPage !== 1) {
        setCurrentPage(1);
    }
    fetchInvoices(1, debouncedSearchTerm, startDate, endDate);
  }, [debouncedSearchTerm, startDate, endDate, fetchInvoices]);

  useEffect(() => {
    // Fetch data when page changes
    fetchInvoices(currentPage, debouncedSearchTerm, startDate, endDate);
  }, [currentPage, fetchInvoices]); // startDate and endDate are captured from scope

  const handleEdit = (invoice: Invoice) => {
    navigate('/sales-invoice', { state: { invoiceToEdit: invoice } });
  };

  const handleApprove = async (invoice: Invoice) => {
    if (window.confirm(`هل أنت متأكد من ترحيل الفاتورة رقم ${invoice.invoiceNumber}؟ لا يمكن التعديل عليها بعد الترحيل.`)) {
        try {
            await approveSalesInvoice(invoice.id);
            fetchInvoices(currentPage, debouncedSearchTerm, startDate, endDate);
        } catch (err: any) {
            alert(err.message);
        }
    }
  };

  const handleWhatsApp = (invoice: any) => {
    const phone = invoice.customerPhone || '';
    const message = `مرحباً ${invoice.customerName}،
إليك تفاصيل الفاتورة رقم ${invoice.invoiceNumber}:
التاريخ: ${new Date(invoice.date).toLocaleDateString('ar-EG')}
الإجمالي: ${invoice.totalAmount.toLocaleString()} ${settings.currency}
شكراً لتعاملكم معنا.`;

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handlePrint = async (invoice: Invoice) => {
    // جلب تفاصيل الفاتورة كاملة (مع الأصناف) للطباعة
    try {
        const { data, error } = await supabase
            .from('invoices')
            .select('*, invoice_items(*, products(name))')
            .eq('id', invoice.id)
            .single();
            
        if (error) throw error;
        
        const fullInvoice = {
            ...invoice,
            items: data.invoice_items.map((item: any) => ({
                productName: item.products?.name,
                quantity: item.quantity,
                unitPrice: item.price,
                total: item.total
            }))
        };
        setInvoiceToPrint(fullInvoice);
    } catch (err) {
        console.error("Error fetching invoice details:", err);
        alert("فشل تحميل تفاصيل الفاتورة للطباعة");
    }
  };

  const getStatusChip = (status: string) => {
    switch (status) {
      case 'paid':
        return <span className="px-2 py-1 text-xs font-bold text-emerald-700 bg-emerald-100 rounded-full">مدفوعة</span>;
      case 'partial':
        return <span className="px-2 py-1 text-xs font-bold text-amber-700 bg-amber-100 rounded-full">مدفوعة جزئياً</span>;
      case 'unpaid':
        return <span className="px-2 py-1 text-xs font-bold text-red-700 bg-red-100 rounded-full">غير مدفوعة</span>;
      case 'draft':
        return <span className="px-2 py-1 text-xs font-bold text-slate-600 bg-slate-100 rounded-full">مسودة</span>;
      default:
        return <span className="px-2 py-1 text-xs font-bold text-slate-600 bg-slate-100 rounded-full">{status}</span>;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto animate-in fade-in">
      <div className={invoiceToPrint ? 'print:hidden' : ''}>
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <FileText className="text-blue-600" /> سجل فواتير المبيعات
          </h1>
          <p className="text-slate-500 mt-1">عرض، بحث، وتعديل فواتير المبيعات.</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-lg px-3 py-2 shadow-sm">
                <input 
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="text-sm border-none outline-none bg-transparent text-slate-600 font-medium"
                />
                <span className="text-slate-400 font-bold">-</span>
                <input 
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="text-sm border-none outline-none bg-transparent text-slate-600 font-medium"
                />
            </div>
            <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input 
                    type="text"
                    placeholder="بحث برقم الفاتورة أو اسم العميل..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pr-10 pl-4 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:border-blue-500"
                />
            </div>
            <button 
                onClick={() => navigate('/sales-invoice')}
                className="bg-blue-600 text-white px-4 py-2.5 rounded-lg font-bold flex items-center gap-2 hover:bg-blue-700 transition-colors shadow-sm"
            >
                <Plus size={20} />
                <span>فاتورة جديدة</span>
            </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6 flex items-center gap-2">
          <AlertCircle size={20} /> {error}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center flex flex-col items-center justify-center text-slate-500">
            <Loader2 className="animate-spin mb-2" size={32} />
            <p>جاري تحميل الفواتير...</p>
          </div>
        ) : invoices.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <FileText size={48} className="mx-auto mb-4 text-slate-300" />
            <p className="text-lg font-medium">لا توجد فواتير مطابقة</p>
            <p className="text-sm">لم يتم العثور على أي فواتير تطابق بحثك.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-black">
                <tr>
                  <th className="px-6 py-4">رقم الفاتورة</th>
                  <th className="px-6 py-4">العميل</th>
                  <th className="px-6 py-4">التاريخ</th>
                  <th className="px-6 py-4">الإجمالي</th>
                  <th className="px-6 py-4 text-center">الحالة</th>
                  <th className="px-6 py-4 text-center">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-mono text-sm font-bold text-slate-700">{invoice.invoiceNumber}</td>
                    <td className="px-6 py-4 font-medium text-slate-800">{invoice.customerName}</td>
                    <td className="px-6 py-4 text-slate-500">{new Date(invoice.date).toLocaleDateString('ar-EG')}</td>
                    <td className="px-6 py-4 font-bold text-slate-900">{invoice.totalAmount.toLocaleString()} <span className="text-xs text-slate-400">{settings.currency}</span></td>
                    <td className="px-6 py-4 text-center">{getStatusChip(invoice.status)}</td>
                    <td className="px-6 py-4 text-center flex justify-center gap-2">
                      {invoice.status === 'draft' && (
                          <button 
                            onClick={() => handleApprove(invoice)}
                            className="p-2 text-emerald-500 hover:bg-emerald-100 hover:text-emerald-700 rounded-full transition-colors"
                            title="ترحيل الفاتورة"
                          >
                            <CheckCircle size={16} />
                          </button>
                      )}
                      {invoice.status !== 'draft' && (
                          <button 
                            onClick={() => handleWhatsApp(invoice)}
                            className="p-2 text-emerald-500 hover:bg-emerald-100 hover:text-emerald-700 rounded-full transition-colors"
                            title="إرسال عبر واتساب"
                          >
                            <MessageCircle size={16} />
                          </button>
                      )}
                      <button 
                        onClick={() => handlePrint(invoice)}
                        className="p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 rounded-full transition-colors"
                        title="طباعة الفاتورة"
                      >
                        <Printer size={16} />
                      </button>
                      <button 
                        onClick={() => handleEdit(invoice)}
                        className="p-2 text-slate-500 hover:bg-blue-100 hover:text-blue-600 rounded-full transition-colors"
                        title={invoice.status === 'draft' ? "تعديل الفاتورة" : "عرض التفاصيل"}
                      >
                        <Edit size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        
        {/* Pagination */}
        {totalPages > 1 && (
            <div className="p-4 border-t border-slate-200 flex justify-between items-center">
                <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1 || loading}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <ChevronRight size={16} />
                    السابق
                </button>
                
                <span className="text-sm text-slate-500 font-medium">
                    صفحة {currentPage} من {totalPages}
                </span>

                <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages || loading}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    التالي
                    <ChevronLeft size={16} />
                </button>
            </div>
        )}
      </div>
      </div>
      
      <SalesInvoicePrint invoice={invoiceToPrint} companySettings={companySettings} />
    </div>
  );
};

export default InvoiceList;