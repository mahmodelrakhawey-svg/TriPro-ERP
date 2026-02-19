import { useState, useMemo } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { Download, Printer, Percent, List, Layers, MessageCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import ReportHeader from '../../components/ReportHeader';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis } from 'recharts';
import { useToast } from '../../context/ToastContext';

const OfferBeneficiariesReport = () => {
  const { invoices, customers, products, settings } = useAccounting();
  const { showToast } = useToast();
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [viewMode, setViewMode] = useState<'detailed' | 'grouped'>('grouped');
  const [selectedCustomerId, setSelectedCustomerId] = useState('all');

  const reportData = useMemo(() => {
    const data: any[] = [];
    
    invoices.forEach(inv => {
      if (inv.status === 'draft' || inv.date < startDate || inv.date > endDate) return;
      if (selectedCustomerId !== 'all' && inv.customerId !== selectedCustomerId) return;

      inv.items.forEach(item => {
        const product = products.find(p => p.id === item.productId);
        if (!product) return;

        // التحقق مما إذا كان الصنف مباعاً ضمن عرض
        // نعتبره عرضاً إذا كان السعر مساوياً لسعر العرض الحالي وكان التاريخ ضمن الفترة
        // أو إذا كان السعر أقل من سعر البيع الأصلي (خصم)
        
        const isOffer = (product.offer_price && item.unitPrice === product.offer_price) || 
                        (item.unitPrice < (product.sales_price || product.price));

        if (isOffer) {
          const originalPrice = product.sales_price || product.price || 0;
          const savings = (originalPrice - item.unitPrice) * item.quantity;
          
          if (savings > 0) {
            const discountPercentage = originalPrice > 0 ? ((originalPrice - item.unitPrice) / originalPrice) * 100 : 0;
            const customer = customers.find(c => c.id === inv.customerId);
            data.push({
              invoiceNumber: inv.invoiceNumber,
              date: inv.date,
              customerName: inv.customerName || customer?.name || 'عميل نقدي',
              customerPhone: customer?.phone,
              productName: item.productName,
              quantity: item.quantity,
              originalPrice,
              soldPrice: item.unitPrice,
              savings,
              discountPercentage
            });
          }
        }
      });
    });

    return data.sort((a, b) => b.savings - a.savings);
  }, [invoices, products, customers, startDate, endDate, selectedCustomerId]);

  const totalSavings = reportData.reduce((sum, item) => sum + item.savings, 0);

  const groupedData = useMemo(() => {
    const groups: Record<string, any> = {};
    reportData.forEach(item => {
      if (!groups[item.customerName]) {
        groups[item.customerName] = {
          customerName: item.customerName,
          customerPhone: item.customerPhone,
          savings: 0,
          count: 0
        };
      }
      groups[item.customerName].savings += item.savings;
      groups[item.customerName].count += 1;
    });
    return Object.values(groups).sort((a: any, b: any) => b.savings - a.savings);
  }, [reportData]);

  const salesMixData = useMemo(() => {
    let offerSalesTotal = 0;
    let regularSalesTotal = 0;

    invoices.forEach(inv => {
      if (inv.status === 'draft' || inv.date < startDate || inv.date > endDate) return;
      if (selectedCustomerId !== 'all' && inv.customerId !== selectedCustomerId) return;

      inv.items.forEach(item => {
        const product = products.find(p => p.id === item.productId);
        if (!product) return;

        const isOffer = (product.offer_price && item.unitPrice === product.offer_price) || 
                        (item.unitPrice < (product.sales_price || product.price));

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
  }, [invoices, products, startDate, endDate, selectedCustomerId]);

  const topSellingOffers = useMemo(() => {
    const productStats: Record<string, number> = {};
    reportData.forEach(item => {
        productStats[item.productName] = (productStats[item.productName] || 0) + item.quantity;
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
    const message = `مرحباً ${name}،\nسعدنا بتعاملك معنا! لقد وفرت ${savings.toLocaleString()} ${settings.currency} من خلال عروضنا.\nتابعنا للمزيد من العروض الحصرية!`;
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