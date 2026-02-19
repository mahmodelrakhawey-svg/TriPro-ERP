import { useState, useMemo, useEffect } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { ArrowRight, Printer, Filter, FileDown, Copy } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { v4 as uuidv4 } from 'uuid';

const QuotationList = () => {
  const { warehouses, accounts, products, addEntry, getSystemAccount, currentUser, settings } = useAccounting();
  const { showToast } = useToast();
  const [quotations, setQuotations] = useState<any[]>([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [convertModalOpen, setConvertModalOpen] = useState(false);
  const [convertData, setConvertData] = useState({ warehouseId: '', treasuryId: '', paidAmount: 0 });
  const [loading, setLoading] = useState(true);

  // Filter State
  const [statusFilter, setStatusFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // تصفية حسابات الخزينة والبنوك
  const treasuryAccounts = useMemo(() => accounts.filter(a => {
    if (a.isGroup) return false;

    const type = String(a.type || '').toLowerCase();
    const name = a.name.toLowerCase();
    const code = a.code;

    if (code.startsWith('1221') || code.startsWith('221') || code.startsWith('121') || code.startsWith('10201') || code.startsWith('201') || code.startsWith('103')) return false;

    const isAsset = type.includes('asset') || type.includes('أصول') || type === '';
    const hasKeyword = name.includes('نقد') || name.includes('خزينة') || name.includes('بنك') || name.includes('صندوق') || name.includes('cash') || name.includes('bank');
    const hasCode = code.startsWith('123') || code.startsWith('101');

    return isAsset && (hasKeyword || hasCode);
  }), [accounts]);

  const fetchQuotations = async () => {
      setLoading(true);
      if (currentUser?.role === 'demo') {
          setQuotations([
              { id: 'demo-q1', quotationNumber: 'QT-DEMO-001', customerName: 'شركة الأفق للتجارة', date: new Date().toISOString(), totalAmount: 11500, status: 'sent' },
              { id: 'demo-q2', quotationNumber: 'QT-DEMO-002', customerName: 'مؤسسة النور', date: new Date().toISOString(), totalAmount: 5750, status: 'draft' }
          ]);
          setLoading(false);
          return;
      }

      const { data: quotesData, error } = await supabase
          .from('quotations')
          .select('*, customers(name)')
          .order('created_at', { ascending: false });
      
      if (!error && quotesData) {
          setQuotations(quotesData.map(q => ({
              ...q,
              customerName: q.customers?.name,
              quotationNumber: q.quotation_number,
              date: q.quotation_date,
              totalAmount: q.total_amount,
              taxAmount: q.tax_amount,
              subtotal: q.subtotal
          })));
      }
      setLoading(false);
  };

  useEffect(() => {
      fetchQuotations();
  }, []);

  const filteredQuotations = useMemo(() => {
      return quotations.filter(q => {
          const matchStatus = statusFilter === 'all' || q.status === statusFilter;
          const matchStart = !startDate || q.date >= startDate;
          const matchEnd = !endDate || q.date <= endDate;
          return matchStatus && matchStart && matchEnd;
      }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [quotations, statusFilter, startDate, endDate]);

  const handleConvertClick = (id: string) => {
      setSelectedQuoteId(id);
      setConvertModalOpen(true);
      // Default warehouse
      if(warehouses.length > 0) setConvertData(prev => ({ ...prev, warehouseId: warehouses[0].id }));
  };

  const confirmConvert = async () => {
      if(selectedQuoteId && convertData.warehouseId) {
          if (convertData.paidAmount > 0 && !convertData.treasuryId) {
              showToast('يرجى اختيار الخزينة/البنك لاستلام الدفعة المقدمة', 'warning');
              return;
          }

          try {
              // 1. جلب تفاصيل العرض
              const quote = quotations.find(q => q.id === selectedQuoteId);
              const { data: quoteItems } = await supabase.from('quotation_items').select('*').eq('quotation_id', selectedQuoteId);
              
              if (!quote || !quoteItems) throw new Error('بيانات العرض غير مكتملة');

              const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
              const paidAmount = Number(convertData.paidAmount) || 0;
              const remainingAmount = quote.totalAmount - paidAmount;
              const status = remainingAmount <= 0 ? 'paid' : 'posted';

              // 2. إنشاء الفاتورة
              const { data: invoice, error: invError } = await supabase.from('invoices').insert({
                  invoice_number: invoiceNumber,
                  customer_id: quote.customer_id,
                  invoice_date: new Date().toISOString().split('T')[0],
                  total_amount: quote.totalAmount,
                  tax_amount: quote.taxAmount,
                  status: status,
                  paid_amount: paidAmount,
                  treasury_account_id: paidAmount > 0 ? convertData.treasuryId : null,
                  subtotal: quote.subtotal,
                  warehouse_id: convertData.warehouseId
              }).select().single();

              if (invError) throw invError;

              // 3. إضافة البنود وتحديث المخزون
              for (const item of quoteItems) {
                  await supabase.from('invoice_items').insert({
                      invoice_id: invoice.id,
                      product_id: item.product_id,
                      quantity: item.quantity,
                      price: item.unit_price,
                      total: item.total
                  });

                  // خصم المخزون
                  const product = products.find(p => p.id === item.product_id);
                  if (product) {
                      const newStock = (product.stock || 0) - Number(item.quantity);
                      await supabase.from('products').update({ stock: newStock }).eq('id', item.product_id);
                  }
              }

              // 4. إنشاء القيد المحاسبي
              const normalizeCode = (code: string | number) => String(code).trim();
              const salesAcc = getSystemAccount('SALES_REVENUE') || accounts.find(a => normalizeCode(a.code) === '411' || normalizeCode(a.code) === '401');
              const taxAcc = getSystemAccount('VAT') || accounts.find(a => normalizeCode(a.code) === '2231' || normalizeCode(a.code) === '202');
              const customerAcc = getSystemAccount('CUSTOMERS') || accounts.find(a => normalizeCode(a.code) === '1221' || normalizeCode(a.code) === '10201');
              const cogsAcc = getSystemAccount('COGS') || accounts.find(a => normalizeCode(a.code) === '511' || normalizeCode(a.code) === '501');
              // التعديل: استخدام حساب مخزون المنتج التام (1213) بدلاً من الرئيسي
              const inventoryAcc = getSystemAccount('INVENTORY_FINISHED_GOODS') || accounts.find(a => normalizeCode(a.code) === '1213' || normalizeCode(a.code) === '10302') || accounts.find(a => normalizeCode(a.code) === '103');

              if (salesAcc && customerAcc) {
                  // حساب التكلفة
                  let totalCost = 0;
                  for (const item of quoteItems) {
                      const product = products.find(p => p.id === item.product_id);
                      const itemCost = product?.purchase_price || product?.cost || 0;
                      totalCost += (item.quantity * itemCost);
                  }

                  const journalLines: any[] = [];

                  // الجانب المدين (من مذكورين)
                  if (paidAmount > 0 && convertData.treasuryId) {
                      journalLines.push({ account_id: convertData.treasuryId, debit: paidAmount, credit: 0, description: `تحصيل دفعة فاتورة ${invoiceNumber}` });
                  }
                  if (remainingAmount > 0) {
                      journalLines.push({ account_id: customerAcc.id, debit: remainingAmount, credit: 0, description: `رصيد آجل فاتورة ${invoiceNumber}` });
                  }

                  // الجانب الدائن (إلى مذكورين)
                  journalLines.push({ account_id: salesAcc.id, debit: 0, credit: quote.subtotal, description: `إيراد مبيعات` });
                  
                  if (quote.taxAmount > 0 && taxAcc) {
                      journalLines.push({ account_id: taxAcc.id, debit: 0, credit: quote.taxAmount, description: `ضريبة القيمة المضافة` });
                  }
                  
                  if (totalCost > 0 && cogsAcc && inventoryAcc) {
                      journalLines.push({ account_id: cogsAcc.id, debit: totalCost, credit: 0, description: 'تكلفة البضاعة المباعة' });
                      journalLines.push({ account_id: inventoryAcc.id, debit: 0, credit: totalCost, description: 'صرف من المخزون' });
                  }

                  await addEntry({
                      date: new Date().toISOString().split('T')[0],
                      description: `فاتورة مبيعات للعميل ${quote.customerName} (تحويل عرض سعر ${quote.quotationNumber})`,
                      reference: invoiceNumber,
                      status: 'posted',
                      lines: journalLines as any[]
                  });
              } else {
                  showToast('تنبيه: تم إنشاء الفاتورة ولكن لم يتم إنشاء القيد المحاسبي لعدم العثور على الحسابات (1102, 4101).', 'warning');
              }

              // 5. تحديث حالة العرض
              await supabase.from('quotations').update({ status: 'converted' }).eq('id', selectedQuoteId);
              
              setConvertModalOpen(false);
              showToast('تم تحويل العرض إلى فاتورة وإنشاء القيد بنجاح ✅', 'success');
              fetchQuotations();

          } catch (error: any) {
              console.error(error);
              showToast('خطأ في التحويل: ' + error.message, 'error');
          }
      }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
      await supabase.from('quotations').update({ status }).eq('id', id);
      fetchQuotations();
  };

  const getStatusBadge = (status: string) => {
      switch(status) {
          case 'draft': return <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs">مسودة</span>;
          case 'sent': return <span className="bg-blue-100 text-blue-600 px-2 py-1 rounded text-xs">مرسل</span>;
          case 'accepted': return <span className="bg-emerald-100 text-emerald-600 px-2 py-1 rounded text-xs">مقبول</span>;
          case 'rejected': return <span className="bg-red-100 text-red-600 px-2 py-1 rounded text-xs">مرفوض</span>;
          case 'converted': return <span className="bg-purple-100 text-purple-600 px-2 py-1 rounded text-xs font-bold">تمت الفوترة</span>;
          default: return status;
      }
  };

  const handlePrintQuotation = async (quote: any) => {
    if (currentUser?.role === 'demo') {
        showToast('الطباعة غير متاحة في النسخة التجريبية', 'warning');
        return;
    }

    const { data: items } = await supabase
        .from('quotation_items')
        .select('*, products(name)')
        .eq('quotation_id', quote.id);

    if (!items) return;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
        printWindow.document.write(`
            <html dir="rtl">
                <head>
                    <title>عرض سعر #${quote.quotationNumber}</title>
                    <style>
                        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; }
                        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #eee; padding-bottom: 20px; }
                        .title { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
                        .meta { display: flex; justify-content: space-between; margin-bottom: 20px; }
                        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
                        th, td { border: 1px solid #ddd; padding: 12px; text-align: right; }
                        th { background-color: #f8f9fa; }
                        .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #666; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div class="title">عرض سعر</div>
                        <div>رقم العرض: ${quote.quotationNumber}</div>
                    </div>
                    <div class="meta">
                        <div><strong>العميل:</strong> ${quote.customerName}</div>
                        <div><strong>التاريخ:</strong> ${new Date(quote.date).toLocaleDateString('ar-EG')}</div>
                    </div>
                    <table>
                        <thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
                        <tbody>
                            ${items.map((item: any) => `<tr><td>${item.products?.name || 'منتج'}</td><td>${item.quantity}</td><td>${item.unit_price.toLocaleString()}</td><td>${item.total.toLocaleString()}</td></tr>`).join('')}
                        </tbody>
                        <tfoot>
                            ${settings.enableTax ? `<tr><td colspan="3">الإجمالي قبل الضريبة</td><td>${(quote.subtotal || (quote.totalAmount - quote.taxAmount)).toLocaleString()}</td></tr>
                            <tr><td colspan="3">الضريبة</td><td>${quote.taxAmount.toLocaleString()}</td></tr>` : ''}
                            <tr><td colspan="3"><strong>الإجمالي النهائي</strong></td><td><strong>${quote.totalAmount.toLocaleString()}</strong></td></tr>
                        </tfoot>
                    </table>
                    <div class="footer"><p>شكراً لتعاملكم معنا</p></div>
                    <script>window.onload = function() { window.print(); }</script>
                </body>
            </html>
        `);
        printWindow.document.close();
    }
  };

  const handleExportPDF = async (quote: any) => {
      if (currentUser?.role === 'demo') {
          showToast('تصدير PDF غير متاح في النسخة التجريبية', 'warning');
          return;
      }
      
      // فتح نافذة الطباعة المخفية مؤقتاً لالتقاطها
      const printWindow = window.open('', '_blank', 'width=800,height=600');
      if (printWindow) {
          printWindow.document.write(`
              <html dir="rtl">
                  <head><title>Quotation</title><style>body { font-family: sans-serif; padding: 20px; }</style></head>
                  <body>
                      <div id="quote-content" style="padding: 20px; border: 1px solid #ccc;">
                          <h1 style="text-align: center;">عرض سعر #${quote.quotationNumber}</h1>
                          <p><strong>العميل:</strong> ${quote.customerName}</p>
                          <p><strong>التاريخ:</strong> ${new Date(quote.date).toLocaleDateString('ar-EG')}</p>
                          <p><strong>الإجمالي:</strong> ${quote.totalAmount.toLocaleString()}</p>
                      </div>
                  </body>
              </html>
          `);
          
          // ملاحظة: التصدير الحقيقي لـ PDF من HTML يتطلب مكتبات معقدة في المتصفح.
          // الأفضل استخدام window.print() وحفظ كـ PDF، أو استخدام مكتبة توليد PDF في الخلفية.
          // هنا سنستخدم الطباعة كحل سريع وموثوق للتصدير كـ PDF
          printWindow.document.close();
          printWindow.focus();
          printWindow.print();
      }
  };

  const handleDuplicateQuotation = async (quote: any) => {
    if (currentUser?.role === 'demo') {
      showToast('تكرار عروض الأسعار غير متاح في النسخة التجريبية', 'warning');
      return;
    }

    try {
      const newQuotationNumber = `QT-${Date.now().toString().slice(-6)}`;
      const { data, error } = await supabase.from('quotations').insert({
        ...quote,
        id: uuidv4(), 
        quotation_number: newQuotationNumber,
        status: 'draft',
      }).select().single();

      if(error) throw error;

      showToast(`تم إنشاء نسخة من عرض السعر برقم ${newQuotationNumber}`, 'success');
      fetchQuotations();
    } catch (error: any) {
      console.error(error);
      showToast('فشل نسخ عرض السعر: ' + error.message, 'error');
    }
  };

  return (
    <div className="space-y-6">
      <style>{`
        @media print {
            body * { visibility: hidden; }
            #printable-content, #printable-content * { visibility: visible; }
            #printable-content { position: absolute; left: 0; top: 0; width: 100%; }
            .no-print { display: none !important; }
        }
      `}</style>

      <div className="flex justify-between items-center print:hidden flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">سجل عروض الأسعار</h2>
            <p className="text-slate-500">إدارة ومتابعة عروض الأسعار المقدمة للعملاء</p>
          </div>
          <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700">
              <Printer size={18} /> طباعة القائمة
          </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-4 items-end print:hidden">
          <div className="min-w-[150px]">
              <label className="block text-xs font-bold text-slate-500 mb-1">حالة العرض</label>
              <div className="relative">
                  <Filter className="absolute right-3 top-2.5 text-slate-400 w-4 h-4" />
                  <select 
                      value={statusFilter} 
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="w-full pl-4 pr-10 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 bg-white text-sm"
                  >
                      <option value="all">جميع الحالات</option>
                      <option value="draft">مسودة</option>
                      <option value="sent">مرسل</option>
                      <option value="accepted">مقبول</option>
                      <option value="converted">تمت الفوترة</option>
                      <option value="rejected">مرفوض</option>
                  </select>
              </div>
          </div>
          
          <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">من تاريخ</label>
              <div className="relative">
                  <input 
                      type="date" 
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="pl-4 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 text-sm"
                  />
              </div>
          </div>

          <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">إلى تاريخ</label>
              <div className="relative">
                  <input 
                      type="date" 
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="pl-4 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 text-sm"
                  />
              </div>
          </div>

          {(statusFilter !== 'all' || startDate || endDate) && (
              <button 
                  onClick={() => { setStatusFilter('all'); setStartDate(''); setEndDate(''); }}
                  className="text-red-500 hover:text-red-700 text-sm font-medium px-3 py-2"
              >
                  مسح التصفية
              </button>
          )}
      </div>
      
      <div id="printable-content" className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          
          <div className="hidden print:block p-6 text-center border-b">
              <h1 className="text-2xl font-bold">سجل عروض الأسعار</h1>
              <p className="text-sm text-slate-500">تاريخ الطباعة: {new Date().toLocaleDateString('en-GB')}</p>
          </div>

          <table className="w-full text-right">
              <thead className="bg-slate-50 text-slate-600 font-bold text-sm">
                  <tr>
                      <th className="p-4">رقم العرض</th>
                      <th className="p-4">العميل</th>
                      <th className="p-4">التاريخ</th>
                      <th className="p-4">القيمة</th>
                      <th className="p-4">الحالة</th>
                      <th className="p-4 text-center no-print">إجراءات</th>
                  </tr>
              </thead>
              <tbody className="divide-y">
                  {filteredQuotations.map(q => (
                      <tr key={q.id} className="hover:bg-slate-50">
                          <td className="p-4 font-mono font-medium text-slate-700">{q.quotationNumber}</td>
                          <td className="p-4 font-bold text-slate-800">{q.customerName}</td>
                          <td className="p-4 text-slate-600">{new Date(q.date).toLocaleDateString('en-GB')}</td>
                          <td className="p-4 font-bold text-emerald-600">{q.totalAmount.toLocaleString()}</td>
                          <td className="p-4">{getStatusBadge(q.status)}</td>
                          <td className="p-4 flex justify-center gap-2 no-print">
                              <button onClick={() => handlePrintQuotation(q)} className="text-slate-500 bg-slate-100 px-2 py-1 rounded text-xs hover:bg-slate-200 flex items-center gap-1" title="طباعة">
                                  <Printer size={14} />
                              </button>
                              <button onClick={() => handleExportPDF(q)} className="text-red-500 bg-red-50 px-2 py-1 rounded text-xs hover:bg-red-100 flex items-center gap-1" title="PDF">
                                  <FileDown size={14} />
                              </button>
                              {q.status !== 'converted' && q.status !== 'rejected' && (<>
                                    <button 
                                        onClick={() => handleDuplicateQuotation(q)}
                                        className="text-orange-500 bg-orange-50 px-2 py-1 rounded text-xs hover:bg-orange-100 flex items-center gap-1"
                                    >
                                        <Copy size={14} /> تكرار
                                    </button>
                                    {q.status !== 'accepted' && (
                                        <button onClick={() => handleUpdateStatus(q.id, 'accepted')} className="text-emerald-600 bg-emerald-50 px-2 py-1 rounded text-xs hover:bg-emerald-100 font-medium">قبول</button>
                                    )}
                                    <button onClick={() => handleConvertClick(q.id)} className="text-purple-600 bg-purple-50 px-2 py-1 rounded text-xs hover:bg-purple-100 flex items-center gap-1 font-medium">
                                        تحويل لفاتورة <ArrowRight size={10} />
                                    </button>
                                  </>)}
                          </td>
                      </tr>
                  ))}
                  {filteredQuotations.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-slate-400">لا توجد عروض أسعار مطابقة</td></tr>}
              </tbody>
          </table>
      </div>

      {convertModalOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 no-print">
              <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-200">
                  <h3 className="text-lg font-bold mb-4 text-slate-800">تحويل إلى فاتورة مبيعات</h3>
                  <div className="space-y-4">
                      <div>
                          <label className="block text-sm font-bold mb-1 text-slate-700">المستودع (للصرف)</label>
                          <select className="w-full border rounded-lg p-2 bg-slate-50" value={convertData.warehouseId} onChange={e => setConvertData({...convertData, warehouseId: e.target.value})}>
                              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                          </select>
                      </div>
                      <div>
                          <label className="block text-sm font-bold mb-1 text-slate-700">دفعة مقدمة (اختياري)</label>
                          <input 
                            type="number" 
                            className="w-full border rounded-lg p-2" 
                            value={convertData.paidAmount} 
                            onChange={e => setConvertData({...convertData, paidAmount: Number(e.target.value)})} 
                            placeholder="0.00"
                          />
                      </div>
                      {convertData.paidAmount > 0 && (
                          <div className="animate-in fade-in slide-in-from-top-1">
                              <label className="block text-sm font-bold mb-1 text-slate-700">إيداع في (الخزينة/البنك)</label>
                              <select 
                                  className="w-full border rounded-lg p-2 bg-slate-50"
                                  value={convertData.treasuryId}
                                  onChange={e => setConvertData({...convertData, treasuryId: e.target.value})}
                              >
                                  <option value="">اختر الحساب...</option>
                                  {treasuryAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                              </select>
                          </div>
                      )}
                      <div className="pt-2">
                        <button onClick={confirmConvert} className="w-full bg-purple-600 text-white py-2.5 rounded-lg font-bold hover:bg-purple-700 transition-colors shadow-md">تأكيد وإنشاء الفاتورة</button>
                        <button onClick={() => setConvertModalOpen(false)} className="w-full bg-slate-100 text-slate-600 py-2.5 rounded-lg mt-2 font-medium hover:bg-slate-200 transition-colors">إلغاء</button>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default QuotationList;