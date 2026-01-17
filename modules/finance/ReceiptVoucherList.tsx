/**
 * ملف جديد: سجل سندات القبض مع نظام الصفحات
 * المسار: modules/finance/ReceiptVoucherList.tsx
 */
import React, { useState, useEffect } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { supabase } from '../../supabaseClient';
import { 
    Search, Printer, FileText, RotateCcw, AlertTriangle, 
    ChevronLeft, ChevronRight, FileSpreadsheet, Loader2, Plus, Eye, X, Paperclip
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { ReceiptVoucherPrint } from './ReceiptVoucherPrint';

const ReceiptVoucherList = () => {
  const navigate = useNavigate();
  const { currentUser } = useAccounting();
  
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // إعدادات الصفحات (Pagination)
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const ITEMS_PER_PAGE = 20;

  const [searchTerm, setSearchTerm] = useState('');
  const [showWithAttachmentsOnly, setShowWithAttachmentsOnly] = useState(false);

  const [attachmentModalOpen, setAttachmentModalOpen] = useState(false);
  const [selectedAttachments, setSelectedAttachments] = useState<any[]>([]);

  // Print State
  const [voucherToPrint, setVoucherToPrint] = useState<any>(null);
  const [companySettings, setCompanySettings] = useState<any>(null);

  useEffect(() => {
    supabase.from('company_settings').select('*').single().then(({ data }) => setCompanySettings(data));
  }, []);

  useEffect(() => {
    if (voucherToPrint) {
      const timer = setTimeout(() => {
        window.print();
        setVoucherToPrint(null);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [voucherToPrint]);

  const fetchVouchers = async (pageNumber = 1) => {
    setLoading(true);
    setError(null);
    
    if (currentUser?.role === 'demo') {
        setVouchers([
            { id: 'demo-1', voucher_number: 'RV-DEMO-001', receipt_date: new Date().toISOString().split('T')[0], amount: 5000, customers: { name: 'عميل تجريبي' }, notes: 'دفعة تجريبية', payment_method: 'cash' },
            { id: 'demo-2', voucher_number: 'RV-DEMO-002', receipt_date: new Date().toISOString().split('T')[0], amount: 1500, customers: { name: 'عميل تجريبي 2' }, notes: 'سداد فاتورة', payment_method: 'cheque' },
            { id: 'demo-3', voucher_number: 'RV-DEMO-003', receipt_date: new Date().toISOString().split('T')[0], amount: 1000, customers: { name: 'عميل نقدي' }, notes: 'دفعة مقدمة', payment_method: 'cash' }
        ]);
        setTotalCount(3);
        setTotalPages(1);
        setLoading(false);
        return;
    }

    try {
      const selectQuery = showWithAttachmentsOnly 
        ? '*, customers(name), receipt_voucher_attachments!inner(*)' 
        : '*, customers(name), receipt_voucher_attachments(*)';

      let query = supabase
        .from('receipt_vouchers')
        .select(selectQuery, { count: 'exact' })
        .order('receipt_date', { ascending: false });

      // البحث في السيرفر (Server-side Search)
      if (searchTerm) {
         // البحث برقم السند أو الملاحظات
         query = query.or(`voucher_number.ilike.%${searchTerm}%,notes.ilike.%${searchTerm}%`);
      }

      // تحديد النطاق (Pagination Range)
      const from = (pageNumber - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      const { data, count, error } = await query.range(from, to);

      if (error) throw error;
      
      setVouchers(data || []);
      setTotalCount(count || 0);
      setTotalPages(Math.ceil((count || 0) / ITEMS_PER_PAGE));
      setPage(pageNumber);
    } catch (err: any) {
      console.error('Error fetching vouchers:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // تأخير البحث قليلاً لعدم إرهاق السيرفر أثناء الكتابة
  useEffect(() => {
    const timer = setTimeout(() => {
        fetchVouchers(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    fetchVouchers(1);
  }, [showWithAttachmentsOnly]);

  const handleExportExcel = () => {
      const exportData = vouchers.map(v => ({
          'رقم السند': v.voucher_number,
          'التاريخ': v.receipt_date,
          'العميل / المستلم منه': v.customers?.name || 'غير محدد',
          'المبلغ': v.amount,
          'البيان': v.notes || '-'
      }));
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Receipts");
      XLSX.writeFile(wb, `Receipt_Vouchers_${new Date().toISOString().split('T')[0]}.xlsx`);
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

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className={voucherToPrint ? 'print:hidden' : ''}>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <FileText className="text-emerald-600" /> سجل سندات القبض
          </h2>
          <p className="text-slate-500 font-medium">أرشيف كامل لجميع عمليات القبض النقدي والبنكي</p>
        </div>
        <div className="flex gap-2">
             <button onClick={() => navigate('/receipt-voucher')} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-md">
                <Plus size={18} />
                <span>سند جديد</span>
            </button>
             <button onClick={() => fetchVouchers(page)} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all">
                <RotateCcw size={18} />
                <span>تحديث</span>
            </button>
             <button onClick={handleExportExcel} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold shadow-md hover:bg-emerald-700 transition-all">
                <FileSpreadsheet size={18} />
                <span>تصدير Excel</span>
            </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-200 flex items-center gap-3">
            <AlertTriangle size={24} />
            <div>
                <p className="font-bold">حدث خطأ أثناء تحميل البيانات</p>
                <p className="text-sm">{error}</p>
            </div>
        </div>
      )}

      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-end gap-4">
          <div className="flex-1">
            <label className="text-xs font-black text-slate-400 block mb-1">بحث سريع</label>
            <div className="relative">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input 
                type="text" 
                placeholder="بحث برقم السند أو الملاحظات..." 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)} 
                className="w-full border rounded-xl px-12 py-3 outline-none focus:border-blue-500 bg-slate-50 font-bold text-slate-700" 
            />
            </div>
          </div>
          
          <div className="flex items-center gap-2 pb-1">
            <label className="flex items-center gap-2 cursor-pointer bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 transition-colors select-none">
                <input 
                    type="checkbox" 
                    checked={showWithAttachmentsOnly}
                    onChange={(e) => setShowWithAttachmentsOnly(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
                <span className="text-sm font-bold text-slate-600">مرفقات فقط</span>
                <Paperclip size={16} className="text-slate-400" />
            </label>
          </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-12"><Loader2 className="animate-spin text-emerald-600" size={32} /></div>
      ) : (
      <div className="bg-white rounded-[32px] shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-right">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-black uppercase tracking-widest">
                <tr>
                    <th className="py-5 px-6">رقم السند</th>
                    <th className="py-5 px-6">التاريخ</th>
                    <th className="py-5 px-6">العميل / المستلم منه</th>
                    <th className="py-5 px-6">البيان</th>
                    <th className="py-5 px-6 text-center">المبلغ</th>
                    <th className="py-5 px-6 text-center">طريقة الدفع</th>
                    <th className="py-5 px-6 text-center">المرفقات</th>
                    <th className="py-5 px-6 text-center w-24">طباعة</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {vouchers.map(voucher => (
                    <tr key={voucher.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="py-4 px-6 font-black text-emerald-600 font-mono">{voucher.voucher_number || '-'}</td>
                        <td className="py-4 px-6 text-slate-500 font-medium">{voucher.receipt_date}</td>
                        <td className="py-4 px-6 font-bold text-slate-800">{voucher.customers?.name || 'غير محدد'}</td>
                        <td className="py-4 px-6 text-slate-600 text-sm max-w-xs truncate">{voucher.notes}</td>
                        <td className="py-4 px-6 text-center font-black text-slate-900">{voucher.amount?.toLocaleString()}</td>
                        <td className="py-4 px-6 text-center">
                            <span className="px-2 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600">
                                {voucher.payment_method === 'cash' ? 'نقدي' : 
                                 voucher.payment_method === 'cheque' ? 'شيك' : 
                                 voucher.payment_method === 'transfer' ? 'تحويل' : 'أخرى'}
                            </span>
                        </td>
                        <td className="py-4 px-6 text-center">
                            {voucher.receipt_voucher_attachments && voucher.receipt_voucher_attachments.length > 0 && (
                                <button onClick={() => handleViewAttachments(voucher.receipt_voucher_attachments)} className="text-blue-600 hover:underline text-xs flex items-center justify-center gap-1">
                                    <Eye size={14} />
                                    <span>({voucher.receipt_voucher_attachments.length})</span>
                                </button>
                            )}
                        </td>
                        <td className="py-4 px-6 text-center">
                            <button onClick={() => handlePrint(voucher)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all" title="طباعة">
                                <Printer size={18} />
                            </button>
                        </td>
                    </tr>
                ))}
                {vouchers.length === 0 && !loading && (
                    <tr><td colSpan={8} className="p-12 text-center text-slate-400 font-medium">لا توجد سندات قبض مطابقة</td></tr>
                )}
            </tbody>
        </table>
        
        {/* Pagination Controls */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-between">
            <div className="text-xs font-bold text-slate-500">
                عرض {vouchers.length} من أصل {totalCount} سند
            </div>
            <div className="flex items-center gap-2">
                <button 
                    onClick={() => fetchVouchers(page - 1)} 
                    disabled={page === 1}
                    className="p-2 rounded-lg hover:bg-white disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
                >
                    <ChevronRight size={20} />
                </button>
                <span className="text-sm font-black text-slate-700">صفحة {page} من {totalPages}</span>
                <button 
                    onClick={() => fetchVouchers(page + 1)} 
                    disabled={page === totalPages}
                    className="p-2 rounded-lg hover:bg-white disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
                >
                    <ChevronLeft size={20} />
                </button>
            </div>
        </div>
      </div>
      )}
      </div>

      {/* Attachments Modal */}
      {attachmentModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]" onClick={() => setAttachmentModalOpen(false)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-slate-800">المرفقات ({selectedAttachments.length})</h3>
                    <button onClick={() => setAttachmentModalOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors"><X size={20} /></button>
                </div>
                <div className="p-4 max-h-[60vh] overflow-y-auto space-y-2">
                    {selectedAttachments.map((att, idx) => (
                        <div key={att.id || idx} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl hover:border-blue-200 transition-colors">
                            <span className="text-sm font-medium text-slate-700 truncate max-w-[200px]" dir="ltr">{att.file_name}</span>
                            <button onClick={() => handlePreviewAttachment(att)} className="text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">معاينة</button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
      )}

      {/* Print Component (Hidden on Screen) */}
      <ReceiptVoucherPrint voucher={voucherToPrint} companySettings={companySettings} />
    </div>
  );
};

export default ReceiptVoucherList;
