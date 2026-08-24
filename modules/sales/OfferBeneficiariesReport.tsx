import { useState, useMemo, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { Download, Printer, Percent, List, Layers, MessageCircle, RefreshCw, Loader2, Sparkles, TrendingUp, DollarSign, Award } from 'lucide-react';
import * as XLSX from 'xlsx';
import ReportHeader from '../../components/ReportHeader';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis } from 'recharts';
import { useToast } from '../../context/ToastContext';

const OfferBeneficiariesReport = () => {
  const { customers, products, settings, selectedFiscalYear, fiscalYearRange, currentUser } = useAccounting();
  const { showToast } = useToast();
  const [startDate, setStartDate] = useState(fiscalYearRange.startDate);
  const [endDate, setEndDate] = useState(`${selectedFiscalYear}-12-31`);
  const [viewMode, setViewMode] = useState<'detailed' | 'grouped'>('grouped');
  const [selectedCustomerId, setSelectedCustomerId] = useState('all');
  const [loading, setLoading] = useState(false);
  const [salesRecords, setSalesRecords] = useState<any[]>([]);

  // مزامنة التواريخ تلقائياً عند تغيير السنة المالية المختارة من شريط النظام
  useEffect(() => {
    if (selectedFiscalYear) {
      setStartDate(`${selectedFiscalYear}-01-01`);
      setEndDate(`${selectedFiscalYear}-12-31`);
    }
  }, [selectedFiscalYear]);

  // جلب الفواتير وبنودها من قاعدة البيانات
  const fetchReportData = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id || (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;

      if (!userOrgId) {
        setLoading(false);
        return;
      }

      // 0. جلب خريطة المنتجات والعملاء بشكل مباشر لضمان دقة الأسعار والعروض
      const [prodRes, custRes] = await Promise.all([
        supabase.from('products').select('id, name, sku, sales_price, price, offer_price, offer_start_date, offer_end_date').eq('organization_id', userOrgId),
        supabase.from('customers').select('id, name, phone').eq('organization_id', userOrgId)
      ]);

      const productMap: Record<string, any> = {};
      (prodRes.data || products || []).forEach((p: any) => {
        productMap[p.id] = p;
      });

      const customerMap: Record<string, any> = {};
      (custRes.data || customers || []).forEach((c: any) => {
        customerMap[c.id] = c;
      });

      // 1. جلب فواتير المبيعات مع بنود الأصناف
      const { data: invData, error: invErr } = await supabase
        .from('invoices')
        .select(`
          id, invoice_number, invoice_date, total_amount, discount_amount, customer_id, status,
          invoice_items (
            product_id, quantity, unit_price, total
          )
        `)
        .eq('organization_id', userOrgId)
        .not('status', 'in', '("draft","cancelled")')
        .gte('invoice_date', startDate)
        .lte('invoice_date', endDate);

      // 2. جلب طلبات المطعم مع بنودها
      const { data: ordData, error: ordErr } = await supabase
        .from('orders')
        .select(`
          id, order_number, created_at, grand_total, discount_amount, customer_id, status,
          order_items (
            product_id, quantity, unit_price, total_price
          )
        `)
        .eq('organization_id', userOrgId)
        .not('status', 'in', '("DRAFT","CANCELLED")')
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`);

      const allRecords: any[] = [];

      if (!invErr && invData) {
        invData.forEach((inv: any) => {
          const cust = customerMap[inv.customer_id];
          allRecords.push({
            id: inv.id,
            invoiceNumber: inv.invoice_number,
            date: inv.invoice_date,
            customerId: inv.customer_id,
            customerName: cust?.name || 'عميل نقدي',
            customerPhone: cust?.phone,
            discountAmount: Number(inv.discount_amount || 0),
            items: (inv.invoice_items || []).map((i: any) => {
              const prod = productMap[i.product_id];
              const originalPrice = Number(prod?.sales_price || prod?.price || i.unit_price || 0);
              const offerPrice = Number(prod?.offer_price || 0);
              const soldPrice = Number(i.unit_price || 0);

              return {
                productId: i.product_id,
                productName: prod?.name || 'صنف',
                quantity: Number(i.quantity || 0),
                soldPrice: soldPrice,
                total: Number(i.total || (Number(i.quantity || 0) * soldPrice)),
                originalPrice: originalPrice,
                offerPrice: offerPrice
              };
            })
          });
        });
      }

      if (!ordErr && ordData) {
        ordData.forEach((ord: any) => {
          const cust = customerMap[ord.customer_id];
          allRecords.push({
            id: ord.id,
            invoiceNumber: ord.order_number,
            date: ord.created_at ? ord.created_at.split('T')[0] : '',
            customerId: ord.customer_id,
            customerName: cust?.name || 'عميل المطعم (صالة/سفري)',
            customerPhone: cust?.phone,
            discountAmount: Number(ord.discount_amount || 0),
            items: (ord.order_items || []).map((i: any) => {
              const prod = productMap[i.product_id];
              const originalPrice = Number(prod?.sales_price || prod?.price || i.unit_price || 0);
              const offerPrice = Number(prod?.offer_price || 0);
              const soldPrice = Number(i.unit_price || 0);

              return {
                productId: i.product_id,
                productName: prod?.name || 'وجبة/صنف',
                quantity: Number(i.quantity || 0),
                soldPrice: soldPrice,
                total: Number(i.total_price || (Number(i.quantity || 0) * soldPrice)),
                originalPrice: originalPrice,
                offerPrice: offerPrice
              };
            })
          });
        });
      }

      setSalesRecords(allRecords);
    } catch (e) {
      console.error("Error fetching offer beneficiaries data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportData();
  }, [startDate, endDate, currentUser]);

  const reportData = useMemo(() => {
    const data: any[] = [];
    
    salesRecords.forEach(inv => {
      if (selectedCustomerId !== 'all' && inv.customerId !== selectedCustomerId) return;

      inv.items?.forEach((item: any) => {
        const originalPrice = item.originalPrice > 0 ? item.originalPrice : item.soldPrice;
        const isOffer = (item.offerPrice > 0 && Math.abs(item.soldPrice - item.offerPrice) < 0.01) || 
                        (item.soldPrice < originalPrice);

        if (isOffer && originalPrice > item.soldPrice) {
          const savings = (originalPrice - item.soldPrice) * item.quantity;
          
          if (savings > 0) {
            const discountPercentage = originalPrice > 0 ? ((originalPrice - item.soldPrice) / originalPrice) * 100 : 0;
            data.push({
              invoiceNumber: inv.invoiceNumber,
              date: inv.date,
              customerName: inv.customerName,
              customerPhone: inv.customerPhone,
              productName: item.productName,
              quantity: item.quantity,
              originalPrice,
              soldPrice: item.soldPrice,
              savings,
              discountPercentage
            });
          }
        }
      });

      // إذا كان هناك خصم عام على الفاتورة (Invoice-level discount)
      if (inv.discountAmount > 0) {
        data.push({
          invoiceNumber: inv.invoiceNumber,
          date: inv.date,
          customerName: inv.customerName,
          customerPhone: inv.customerPhone,
          productName: 'خصم نقدي مباشر على الفاتورة',
          quantity: 1,
          originalPrice: inv.discountAmount,
          soldPrice: 0,
          savings: inv.discountAmount,
          discountPercentage: 100
        });
      }
    });

    return data.sort((a, b) => b.savings - a.savings);
  }, [salesRecords, selectedCustomerId]);

  const totalSavings = reportData.reduce((sum, item) => sum + item.savings, 0);

  const groupedData = useMemo(() => {
    const groups: Record<string, any> = {};
    reportData.forEach(item => {
      const key = item.customerName || 'عميل نقدي';
      if (!groups[key]) {
        groups[key] = {
          customerName: key,
          customerPhone: item.customerPhone,
          savings: 0,
          count: 0
        };
      }
      groups[key].savings += item.savings;
      groups[key].count += 1;
    });
    return Object.values(groups).sort((a: any, b: any) => b.savings - a.savings);
  }, [reportData]);

  const salesMixData = useMemo(() => {
    let offerSalesTotal = 0;
    let regularSalesTotal = 0;

    salesRecords.forEach(inv => {
      if (selectedCustomerId !== 'all' && inv.customerId !== selectedCustomerId) return;

      inv.items?.forEach((item: any) => {
        const originalPrice = item.originalPrice > 0 ? item.originalPrice : item.soldPrice;
        const isOffer = (item.offerPrice > 0 && Math.abs(item.soldPrice - item.offerPrice) < 0.01) || 
                        (item.soldPrice < originalPrice);

        if (isOffer) {
          offerSalesTotal += item.total;
        } else {
          regularSalesTotal += item.total;
        }
      });
    });

    return [
      { name: 'مبيعات العروض', value: offerSalesTotal },
      { name: 'مبيعات عادية', value: regularSalesTotal }
    ];
  }, [salesRecords, selectedCustomerId]);

  const topSellingOffers = useMemo(() => {
    const productStats: Record<string, number> = {};
    reportData.forEach(item => {
      if (item.productName !== 'خصم نقدي مباشر على الفاتورة') {
        productStats[item.productName] = (productStats[item.productName] || 0) + item.quantity;
      }
    });
    
    return Object.entries(productStats)
      .map(([name, quantity]) => ({ name, quantity }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);
  }, [reportData]);

  const handleExportExcel = () => {
    let dataToExport = [];
    if (viewMode === 'detailed') {
      dataToExport = reportData.map(item => ({
        'رقم الفاتورة': item.invoiceNumber,
        'التاريخ': item.date,
        'العميل': item.customerName,
        'الصنف': item.productName,
        'الكمية': item.quantity,
        'السعر الأصلي': item.originalPrice,
        'سعر البيع (العرض)': item.soldPrice,
        'نسبة الخصم': `${item.discountPercentage.toFixed(1)}%`,
        'قيمة التوفير': item.savings
      }));
    } else {
      dataToExport = groupedData.map((item: any) => ({
        'العميل': item.customerName,
        'عدد العمليات': item.count,
        'إجمالي التوفير': item.savings
      }));
    }
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Offer Beneficiaries");
    XLSX.writeFile(wb, `Offer_Beneficiaries_${startDate}_${endDate}.xlsx`);
  };

  const handleWhatsApp = (phone: string | undefined, name: string, savings: number) => {
    if (!phone) {
      showToast('لا يوجد رقم هاتف مسجل لهذا العميل', 'warning');
      return;
    }
    const message = `مرحباً ${name}،\nسعدنا بتعاملك معنا! لقد وفرت ${savings.toLocaleString()} ${settings.currency || 'EGP'} من خلال عروضنا وخصوماتنا الحصرية.\nتابعنا دائماً للمزيد من العروض المميزة!`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 print:hidden">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Percent className="text-purple-600" /> تقرير المستفيدين من العروض
          </h2>
          <p className="text-slate-500">قائمة العملاء الذين استفادوا من الخصومات والعروض</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={fetchReportData} 
            disabled={loading}
            className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 font-bold text-sm shadow-sm transition-all disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            <span>تحديث</span>
          </button>
          <button onClick={handleExportExcel} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 font-bold text-sm shadow-sm transition-all">
            <Download size={16} /> تصدير Excel
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 font-bold text-sm shadow-sm">
            <Printer size={16} /> طباعة
          </button>
        </div>
      </div>

      <div className="flex bg-white p-1 rounded-lg border border-slate-200 w-fit print:hidden">
        <button onClick={() => setViewMode('grouped')} className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all ${viewMode === 'grouped' ? 'bg-purple-100 text-purple-700' : 'text-slate-500 hover:bg-slate-50'}`}>
            <Layers size={16} /> تجميع حسب العميل
        </button>
        <button onClick={() => setViewMode('detailed')} className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all ${viewMode === 'detailed' ? 'bg-purple-100 text-purple-700' : 'text-slate-500 hover:bg-slate-50'}`}>
            <List size={16} /> عرض التفاصيل
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-end gap-4 print:hidden">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1">من تاريخ</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border rounded-lg p-2" />
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1">إلى تاريخ</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border rounded-lg p-2" />
        </div>
        <div className="min-w-[200px]">
          <label className="block text-sm font-bold text-slate-700 mb-1">العميل</label>
          <select 
            value={selectedCustomerId} 
            onChange={e => setSelectedCustomerId(e.target.value)} 
            className="w-full border rounded-lg p-2 bg-white"
          >
            <option value="all">كل العملاء</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 print:hidden">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-center items-center">
              <h3 className="text-slate-500 font-bold mb-2">إجمالي مبيعات العروض</h3>
              <p className="text-3xl font-black text-purple-600">{salesMixData[0].value.toLocaleString()}</p>
              <p className="text-xs text-slate-400 mt-1">مقارنة بـ {salesMixData[1].value.toLocaleString()} مبيعات عادية</p>
          </div>
          
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-center items-center">
              <h3 className="text-slate-500 font-bold mb-2">إجمالي توفير العملاء</h3>
              <p className="text-3xl font-black text-emerald-600">{totalSavings.toLocaleString()}</p>
              <p className="text-xs text-slate-400 mt-1">قيمة الخصومات الممنوحة</p>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
              <h3 className="text-sm font-bold text-slate-700 mb-2 text-center">نسبة مبيعات العروض</h3>
              <div className="h-40 w-full" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                          <Pie
                              data={salesMixData}
                              cx="50%"
                              cy="50%"
                              innerRadius={40}
                              outerRadius={60}
                              paddingAngle={5}
                              dataKey="value"
                          >
                              <Cell fill="#8b5cf6" />
                              <Cell fill="#cbd5e1" />
                          </Pie>
                          <Tooltip formatter={(value: number) => value.toLocaleString()} />
                          <Legend verticalAlign="bottom" height={36} iconSize={10}/>
                      </PieChart>
                  </ResponsiveContainer>
              </div>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
              <h3 className="text-sm font-bold text-slate-700 mb-2 text-center">الأكثر مبيعاً في العروض</h3>
              <div className="h-40 w-full" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topSellingOffers}>
                          <XAxis dataKey="name" tick={{fontSize: 10}} />
                          <Tooltip cursor={{fill: '#f8fafc'}} />
                          <Bar dataKey="quantity" fill="#10b981" radius={[4, 4, 0, 0]} name="الكمية" />
                      </BarChart>
                  </ResponsiveContainer>
              </div>
          </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <ReportHeader title="تقرير المستفيدين من العروض" subtitle={`الفترة من ${startDate} إلى ${endDate}`} />
        
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            {viewMode === 'detailed' ? (
            <>
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-4">رقم الفاتورة</th>
                <th className="p-4">التاريخ</th>
                <th className="p-4">العميل</th>
                <th className="p-4">الصنف</th>
                <th className="p-4 text-center">الكمية</th>
                <th className="p-4 text-center">السعر الأصلي</th>
                <th className="p-4 text-center">سعر العرض</th>
                <th className="p-4 text-center">نسبة الخصم</th>
                <th className="p-4 text-center">قيمة التوفير</th>
                <th className="p-4 text-center print:hidden">تواصل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reportData.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-50">
                  <td className="p-4 font-mono text-blue-600">{item.invoiceNumber}</td>
                  <td className="p-4">{item.date}</td>
                  <td className="p-4 font-bold">{item.customerName}</td>
                  <td className="p-4">{item.productName}</td>
                  <td className="p-4 text-center font-bold">{item.quantity}</td>
                  <td className="p-4 text-center text-slate-500 line-through">{item.originalPrice.toLocaleString()}</td>
                  <td className="p-4 text-center font-bold text-emerald-600">{item.soldPrice.toLocaleString()}</td>
                  <td className="p-4 text-center font-bold text-amber-600">{item.discountPercentage.toFixed(1)}%</td>
                  <td className="p-4 text-center font-black text-purple-600">{item.savings.toLocaleString()}</td>
                  <td className="p-4 text-center print:hidden">
                    {item.customerPhone && (
                        <button onClick={() => handleWhatsApp(item.customerPhone, item.customerName, item.savings)} className="text-emerald-500 hover:bg-emerald-50 p-2 rounded-full transition-colors" title="إرسال واتساب">
                            <MessageCircle size={18} />
                        </button>
                    )}
                  </td>
                </tr>
              ))}
              {reportData.length === 0 && (
                <tr><td colSpan={10} className="p-8 text-center text-slate-400">لا توجد بيانات للعرض</td></tr>
              )}
            </tbody>
            </>
            ) : (
            <>
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-4">العميل</th>
                <th className="p-4 text-center">عدد العمليات (أصناف)</th>
                <th className="p-4 text-center">إجمالي التوفير</th>
                <th className="p-4 text-center print:hidden">تواصل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {groupedData.map((item: any, idx: number) => (
                <tr key={idx} className="hover:bg-slate-50">
                  <td className="p-4 font-bold text-slate-800">{item.customerName}</td>
                  <td className="p-4 text-center font-bold">{item.count}</td>
                  <td className="p-4 text-center font-black text-purple-600">{item.savings.toLocaleString()}</td>
                  <td className="p-4 text-center print:hidden">
                    {item.customerPhone && (
                        <button onClick={() => handleWhatsApp(item.customerPhone, item.customerName, item.savings)} className="text-emerald-500 hover:bg-emerald-50 p-2 rounded-full transition-colors" title="إرسال واتساب">
                            <MessageCircle size={18} />
                        </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            </>
            )}
            <tfoot className="bg-slate-50 font-bold text-lg border-t border-slate-200">
              <tr>
                <td colSpan={viewMode === 'detailed' ? 9 : 3} className="p-4 text-left text-slate-600">إجمالي التوفير للعملاء:</td>
                <td className="p-4 text-center text-purple-700 font-black">{totalSavings.toLocaleString()} {settings.currency}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};

export default OfferBeneficiariesReport;