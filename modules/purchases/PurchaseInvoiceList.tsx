import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { FileText, Search, Printer, Loader2, RotateCcw, AlertTriangle, Edit, CheckCircle, DollarSign, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAccounting } from '../../context/AccountingContext';

const PurchaseInvoiceList = () => {
  const navigate = useNavigate();
  const { approvePurchaseInvoice, addPaymentVoucher, settings, currentUser, accounts } = useAccounting();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [invoiceToPrint, setInvoiceToPrint] = useState<any | null>(null);

  // Payment Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<any>(null);
  const [paymentFormData, setPaymentFormData] = useState({
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    treasuryAccountId: '',
    notes: ''
  });

  // تصفية حسابات النقدية والبنوك للدفع
  const treasuryAccounts = useMemo(() => {
    return accounts.filter(a => !a.isGroup && (a.code.startsWith('101') || a.name.includes('صندوق') || a.name.includes('بنك') || a.type === 'ASSET'));
  }, [accounts]);

  const fetchInvoices = async () => {
    setLoading(true);
    setError(null);

    if (currentUser?.role === 'demo') {
        setInvoices([
            { id: 'demo-pi1', invoice_number: 'PINV-DEMO-001', suppliers: { name: 'شركة التوريدات العالمية' }, invoice_date: new Date().toISOString().split('T')[0], total_amount: 25000, tax_amount: 3750, status: 'posted' },
            { id: 'demo-pi2', invoice_number: 'PINV-DEMO-002', suppliers: { name: 'مصنع الجودة' }, invoice_date: new Date(Date.now() - 86400000).toISOString().split('T')[0], total_amount: 12000, tax_amount: 1800, status: 'draft' }
        ]);
        setLoading(false);
        return;
    }

    try {
      const { data, error: fetchError } = await supabase
        .from('purchase_invoices')
        .select('*, suppliers(name)')
        .order('created_at', { ascending: false });
      
      if (fetchError) throw fetchError;
      setInvoices(data || []);
    } catch (err: any) {
      console.error('Error fetching invoices:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch = (inv.invoice_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (inv.suppliers?.name || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || inv.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const handleApprove = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من ترحيل فاتورة المشتريات؟ سيتم إنشاء القيد وتحديث المخزون.')) return;
    try {
      await approvePurchaseInvoice(id);
      alert('تم ترحيل الفاتورة بنجاح ✅');
      fetchInvoices();
    } catch (err: any) {
      alert('فشل الترحيل: ' + err.message);
    }
  };

  const openPaymentModal = (invoice: any) => {
    setSelectedInvoiceForPayment(invoice);
    setPaymentFormData({
        amount: invoice.total_amount, // افتراضياً سداد كامل المبلغ
        date: new Date().toISOString().split('T')[0],
        treasuryAccountId: treasuryAccounts[0]?.id || '',
        notes: `سداد فاتورة مشتريات رقم ${invoice.invoice_number}`
    });
    setIsPaymentModalOpen(true);
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentFormData.treasuryAccountId) {
        alert('الرجاء اختيار حساب الخزينة/البنك');
        return;
    }
    
    try {
        await addPaymentVoucher({
            supplierId: selectedInvoiceForPayment.supplier_id,
            partyName: selectedInvoiceForPayment.suppliers?.name,
            amount: paymentFormData.amount,
            date: paymentFormData.date,
            treasuryAccountId: paymentFormData.treasuryAccountId,
            description: paymentFormData.notes,
            subType: 'supplier',
        });
        alert('تم إنشاء سند الصرف بنجاح ✅');
        setIsPaymentModalOpen(false);
    } catch (err: any) {
        alert('حدث خطأ: ' + err.message);
    }
  };

  const handlePrint = async (invoice: any) => {
    const { data, error } = await supabase
      .from('purchase_invoices')
      .select('*, suppliers(*), purchase_invoice_items!purchase_invoice_items_purchase_invoice_id_fkey(*, products(name, sku))')
      .eq('id', invoice.id)
      .single();

    if (error) {
      alert('فشل تحميل تفاصيل الفاتورة للطباعة: ' + error.message);
      return;
    }
    setInvoiceToPrint(data);
  };

  useEffect(() => {
    if (invoiceToPrint) {
      setTimeout(() => {
        window.print();
        setInvoiceToPrint(null);
      }, 500);
    }
  }, [invoiceToPrint]);

  return (
    <div className="space-y-6">
      {/* أنماط الطباعة */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #printable-invoice, #printable-invoice * { visibility: visible; }
          #printable-invoice { 
            position: absolute; 
            left: 0; 
            top: 0; 
            width: 100%; 
            background: white;
            padding: 20px;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <FileText className="text-blue-600" /> سجل فواتير المشتريات
        </h2>
        <button 
            onClick={fetchInvoices} 
            className="flex items-center gap-2 bg-white border border-slate-300 text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-50 font-bold text-sm transition-colors"
        >
            <RotateCcw size={16} /> تحديث
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex gap-4">
        <div className="relative flex-1">
            <Search className="absolute right-3 top-3 text-slate-400" size={20} />
            <input 
                type="text" 
                placeholder="بحث برقم الفاتورة أو اسم المورد..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pr-10 pl-4 py-2 border rounded-lg focus:outline-none focus:border-blue-500"
            />
        </div>
        <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="border rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500 bg-white text-slate-700 font-medium"
        >
            <option value="all">جميع الحالات</option>
            <option value="draft">مسودة</option>
            <option value="posted">مرحلة</option>
        </select>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-200 flex items-center gap-3 animate-in fade-in">
            <AlertTriangle size={24} />
            <div>
                <p className="font-bold">حدث خطأ أثناء تحميل البيانات</p>
                <p className="text-sm">{error}</p>
            </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center p-12"><Loader2 className="animate-spin text-blue-600" size={32} /></div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-right">
                <thead className="bg-slate-50 text-slate-600 font-bold text-sm">
                    <tr>
                        <th className="p-4">رقم الفاتورة</th>
                        <th className="p-4">المورد</th>
                        <th className="p-4">التاريخ</th>
                        <th className="p-4">الإجمالي</th>
                        <th className="p-4">الضريبة</th>
                        <th className="p-4">الحالة</th>
                        <th className="p-4 text-center">إجراءات</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {filteredInvoices.map(invoice => (
                        <tr key={invoice.id} className={`transition-colors ${invoice.status === 'draft' ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-slate-50'}`}>
                            <td className="p-4 font-mono text-slate-700">{invoice.invoice_number || '-'}</td>
                            <td className="p-4 font-bold text-slate-800">{invoice.suppliers?.name || 'مورد غير معروف'}</td>
                            <td className="p-4 text-slate-600">{invoice.invoice_date}</td>
                            <td className="p-4 font-bold text-blue-600">{invoice.total_amount?.toLocaleString()}</td>
                            <td className="p-4 text-slate-600">{invoice.tax_amount?.toLocaleString()}</td>
                            <td className="p-4">
                                <span className={`px-2 py-1 rounded text-xs font-bold ${invoice.status === 'posted' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {invoice.status === 'posted' ? 'مرحلة' : 'مسودة'}
                                </span>
                            </td>
                            <td className="p-4 flex justify-center gap-2">
                                {invoice.status === 'draft' && (
                                    <button 
                                        onClick={() => handleApprove(invoice.id)}
                                        className="text-emerald-600 hover:text-emerald-800 p-2 rounded-full hover:bg-emerald-50 transition-colors"
                                        title="ترحيل واعتماد"
                                    >
                                        <CheckCircle size={18} />
                                    </button>
                                )}
                                {invoice.status === 'posted' && (
                                    <button 
                                        onClick={() => openPaymentModal(invoice)}
                                        className="text-emerald-600 hover:text-emerald-800 p-2 rounded-full hover:bg-emerald-50 transition-colors"
                                        title="سداد سريع (سند صرف)"
                                    >
                                        <DollarSign size={18} />
                                    </button>
                                )}
                                <button 
                                    onClick={() => navigate('/purchase-invoice', { state: { invoiceToEdit: invoice } })}
                                    className="text-slate-400 hover:text-blue-600 p-2 rounded-full hover:bg-slate-100 transition-colors"
                                    title="تعديل"
                                >
                                    <Edit size={18} />
                                </button>
                                <button onClick={() => handlePrint(invoice)} className="text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-100 transition-colors" title="طباعة">
                                    <Printer size={18} />
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
                {filteredInvoices.length === 0 && !error && (
                    <tbody><tr><td colSpan={7} className="p-12 text-center text-slate-400 font-medium">لا توجد فواتير مشتريات مطابقة</td></tr></tbody>
                )}
            </table>
        </div>
      )}

      {/* قالب الطباعة المخفي */}
      <div id="printable-invoice" className={invoiceToPrint ? "" : "hidden"}>
        {invoiceToPrint && (
          <div className="p-8 direction-rtl" dir="rtl">
            <div className="flex justify-between items-center border-b-2 border-black pb-4 mb-8">
              <div>
                <h1 className="text-3xl font-bold">فاتورة مشتريات</h1>
                <p className="text-sm">Purchase Invoice</p>
              </div>
              {settings.logoUrl && <img src={settings.logoUrl} alt="logo" className="w-24 h-24 object-contain" />}
            </div>

            <div className="grid grid-cols-2 gap-4 mb-8 text-sm">
              <div className="space-y-1">
                <p><strong>المورد:</strong> {invoiceToPrint.suppliers?.name}</p>
                <p><strong>العنوان:</strong> {invoiceToPrint.suppliers?.address || 'غير محدد'}</p>
                <p><strong>الهاتف:</strong> {invoiceToPrint.suppliers?.phone || 'غير محدد'}</p>
                <p><strong>الرقم الضريبي:</strong> {invoiceToPrint.suppliers?.tax_id || '-'}</p>
              </div>
              <div className="space-y-1 text-left">
                <p><strong>رقم الفاتورة:</strong> {invoiceToPrint.invoice_number}</p>
                <p><strong>التاريخ:</strong> {new Date(invoiceToPrint.invoice_date).toLocaleDateString('ar-EG')}</p>
                <p><strong>الحالة:</strong> {invoiceToPrint.status === 'posted' ? 'مرحلة' : 'مسودة'}</p>
              </div>
            </div>

            <table className="w-full text-right border-collapse text-sm mb-8">
              <thead className="bg-slate-100">
                <tr className="border-b-2 border-black">
                  <th className="p-2 border">م</th>
                  <th className="p-2 border">الصنف</th>
                  <th className="p-2 border text-center">الكمية</th>
                  <th className="p-2 border text-center">السعر</th>
                  <th className="p-2 border text-center">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {invoiceToPrint.purchase_invoice_items?.map((item: any, index: number) => (
                  <tr key={item.id} className="border-b">
                    <td className="p-2 border text-center">{index + 1}</td>
                    <td className="p-2 border">
                        <div className="font-bold">{item.products?.name}</div>
                        <div className="text-xs text-slate-500">{item.products?.sku}</div>
                    </td>
                    <td className="p-2 border text-center">{item.quantity}</td>
                    <td className="p-2 border text-center">{item.price?.toLocaleString()}</td>
                    <td className="p-2 border text-center font-bold">{item.total?.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="font-bold">
                <tr><td colSpan={4} className="p-2 border text-left">الإجمالي قبل الضريبة:</td><td className="p-2 border text-center">{(invoiceToPrint.total_amount - invoiceToPrint.tax_amount).toLocaleString()}</td></tr>
                <tr><td colSpan={4} className="p-2 border text-left">الضريبة:</td><td className="p-2 border text-center">{invoiceToPrint.tax_amount?.toLocaleString()}</td></tr>
                <tr className="bg-slate-100 text-lg"><td colSpan={4} className="p-2 border text-left">الإجمالي النهائي:</td><td className="p-2 border text-center">{invoiceToPrint.total_amount?.toLocaleString()}</td></tr>
              </tfoot>
            </table>

            <div className="text-xs text-slate-600 border-t pt-4">
              <p><strong>ملاحظات:</strong> {invoiceToPrint.notes || 'لا يوجد'}</p>
            </div>
          </div>
        )}
      </div>

      {/* نافذة السداد السريع */}
      {isPaymentModalOpen && selectedInvoiceForPayment && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                        <DollarSign className="text-emerald-600" /> سداد فاتورة مورد
                    </h3>
                    <button onClick={() => setIsPaymentModalOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors">
                        <X size={20} />
                    </button>
                </div>
                <form onSubmit={handlePaymentSubmit} className="p-6 space-y-4">
                    <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800 mb-4">
                        <p><strong>المورد:</strong> {selectedInvoiceForPayment.suppliers?.name}</p>
                        <p><strong>رقم الفاتورة:</strong> {selectedInvoiceForPayment.invoice_number}</p>
                        <p><strong>إجمالي الفاتورة:</strong> {selectedInvoiceForPayment.total_amount?.toLocaleString()}</p>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">المبلغ المدفوع</label>
                        <input type="number" required min="0" step="0.01" className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500" value={paymentFormData.amount} onChange={e => setPaymentFormData({...paymentFormData, amount: parseFloat(e.target.value)})} />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">تاريخ السداد</label>
                        <input type="date" required className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500" value={paymentFormData.date} onChange={e => setPaymentFormData({...paymentFormData, date: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">حساب الدفع (الخزينة/البنك)</label>
                        <select required className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500" value={paymentFormData.treasuryAccountId} onChange={e => setPaymentFormData({...paymentFormData, treasuryAccountId: e.target.value})}>
                            {treasuryAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">ملاحظات</label>
                        <input type="text" className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500" value={paymentFormData.notes} onChange={e => setPaymentFormData({...paymentFormData, notes: e.target.value})} />
                    </div>
                    <button type="submit" className="w-full bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 flex items-center justify-center gap-2 shadow-md transition-colors mt-4">
                        <DollarSign size={18} /> تأكيد السداد
                    </button>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseInvoiceList;
