import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { 
  AlertTriangle, 
  Clock, 
  Calendar, 
  Tag, 
  DollarSign, 
  Package, 
  Search, 
  Filter, 
  FileSpreadsheet, 
  Loader2, 
  CheckCircle,
  Percent,
  Sparkles,
  ArrowUpDown,
  Flame
} from 'lucide-react';
import * as XLSX from 'xlsx';
import ReportHeader from '../../components/ReportHeader';

interface ExpiringProduct {
  id: string;
  name: string;
  sku: string;
  category: string;
  stock: number;
  unit: string;
  sales_price: number;
  purchase_price: number;
  expiry_date: string;
  offer_price: number | null;
  offer_start_date: string | null;
  offer_end_date: string | null;
  daysRemaining: number;
  status: 'EXPIRED' | 'CRITICAL_7' | 'WARNING_30' | 'SAFE';
  lossValue: number;
}

export default function ExpiryClearanceRadar() {
  const { currentUser, settings } = useAccounting();
  const { showToast } = useToast();
  const currencySymbol = settings?.currency || 'ج.م';

  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<ExpiringProduct[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  // Clearance Modal State
  const [selectedItem, setSelectedItem] = useState<ExpiringProduct | null>(null);
  const [discountPercent, setDiscountPercent] = useState<number>(30);
  const [customOfferPrice, setCustomOfferPrice] = useState<number>(0);
  const [offerDays, setOfferDays] = useState<number>(7);
  const [isApplyingOffer, setIsApplyingOffer] = useState(false);

  const fetchExpiryData = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id;
      if (!userOrgId) return;

      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('organization_id', userOrgId)
        .eq('is_active', true)
        .not('expiry_date', 'is', null)
        .order('expiry_date', { ascending: true });

      if (error) throw error;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const computed: ExpiringProduct[] = (data || []).map((p: any) => {
        const exp = new Date(p.expiry_date);
        exp.setHours(0, 0, 0, 0);
        const diffTime = exp.getTime() - today.getTime();
        const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        let status: 'EXPIRED' | 'CRITICAL_7' | 'WARNING_30' | 'SAFE' = 'SAFE';
        if (daysRemaining < 0) status = 'EXPIRED';
        else if (daysRemaining <= 7) status = 'CRITICAL_7';
        else if (daysRemaining <= 30) status = 'WARNING_30';

        const stock = Number(p.stock || 0);
        const cost = Number(p.weighted_average_cost || p.purchase_price || 0);
        const lossValue = stock > 0 ? stock * cost : 0;

        return {
          id: p.id,
          name: p.name,
          sku: p.sku || '-',
          category: p.category || 'عام',
          stock,
          unit: p.unit || 'قطعة',
          sales_price: Number(p.sales_price || 0),
          purchase_price: Number(p.purchase_price || 0),
          expiry_date: p.expiry_date,
          offer_price: p.offer_price,
          offer_start_date: p.offer_start_date,
          offer_end_date: p.offer_end_date,
          daysRemaining,
          status,
          lossValue
        };
      });

      setProducts(computed);
    } catch (err: any) {
      showToast('فشل جلب بيانات رادار الصلاحية: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpiryData();
  }, []);

  // Summary Metrics
  const expiredItems = products.filter(p => p.status === 'EXPIRED');
  const criticalItems = products.filter(p => p.status === 'CRITICAL_7');
  const warningItems = products.filter(p => p.status === 'WARNING_30');

  const totalAtRiskValue = criticalItems.concat(warningItems).reduce((sum, p) => sum + p.lossValue, 0);
  const totalExpiredLoss = expiredItems.reduce((sum, p) => sum + p.lossValue, 0);

  // Filtered List
  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.sku.includes(searchTerm);
    const matchesCategory = filterCategory === 'ALL' || p.category === filterCategory;
    const matchesStatus = filterStatus === 'ALL' || p.status === filterStatus;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  // Open Clearance Offer Modal
  const handleOpenClearance = (item: ExpiringProduct) => {
    setSelectedItem(item);
    const discounted = Number((item.sales_price * 0.7).toFixed(2));
    setDiscountPercent(30);
    setCustomOfferPrice(discounted);
    setOfferDays(Math.max(1, Math.min(item.daysRemaining > 0 ? item.daysRemaining : 7, 14)));
  };

  // Quick percent change in modal
  const handlePercentChange = (pct: number) => {
    setDiscountPercent(pct);
    if (selectedItem) {
      const discounted = Number((selectedItem.sales_price * (1 - pct / 100)).toFixed(2));
      setCustomOfferPrice(discounted);
    }
  };

  // Submit Clearance Offer to Product
  const handleApplyOffer = async () => {
    if (!selectedItem) return;
    setIsApplyingOffer(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + offerDays);
      const endDateStr = endDate.toISOString().split('T')[0];

      const { error } = await supabase
        .from('products')
        .update({
          offer_price: customOfferPrice,
          offer_start_date: todayStr,
          offer_end_date: endDateStr
        })
        .eq('id', selectedItem.id);

      if (error) throw error;

      showToast(`تم تطبيق عرض التصفية الفوري على (${selectedItem.name}) بسعر ${customOfferPrice} ${currencySymbol} ✅`, 'success');
      setSelectedItem(null);
      fetchExpiryData();
    } catch (err: any) {
      showToast('فشل تطبيق العرض: ' + err.message, 'error');
    } finally {
      setIsApplyingOffer(false);
    }
  };

  // Export to Excel
  const handleExportExcel = () => {
    const exportData = filteredProducts.map(item => ({
      'اسم الصنف': item.name,
      'الكود (SKU)': item.sku,
      'القسم': item.category,
      'الرصيد المتبقي': item.stock,
      'الوحدة': item.unit,
      'تاريخ الصلاحية': item.expiry_date,
      'الأيام المتبقية': item.daysRemaining < 0 ? `منتهي منذ ${Math.abs(item.daysRemaining)} يوم` : `${item.daysRemaining} يوم`,
      'حالة الخطورة': item.status === 'EXPIRED' ? 'منتهي الصلاحية' : item.status === 'CRITICAL_7' ? 'حرج (خلال 7 أيام)' : item.status === 'WARNING_30' ? 'تنبيه (خلال شهر)' : 'آمن',
      'سعر البيع': item.sales_price,
      'سعر العرض الحالي': item.offer_price || 'لا يوجد',
      'القيمة المعرضة للهدر': item.lossValue.toFixed(2)
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Expiry Radar");
    XLSX.writeFile(wb, `Expiry_Clearance_Radar_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-in fade-in pb-12" dir="rtl">
      
      {/* Top Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Flame className="text-orange-500 animate-pulse" /> رادار تواريخ الصلاحية وتصفية العروض
          </h2>
          <p className="text-slate-500 text-sm">متابعة دقيقة للأغذية والأصناف الموشكة على الانتهاء وتطبيق عروض ترويجية فورية</p>
        </div>

        <button 
          onClick={handleExportExcel}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all text-sm"
        >
          <FileSpreadsheet size={18} /> تصدير تقرير التصفية (Excel)
        </button>
      </div>

      {/* 4 Urgency Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        
        {/* Expired */}
        <div 
          onClick={() => setFilterStatus(filterStatus === 'EXPIRED' ? 'ALL' : 'EXPIRED')}
          className={`p-5 rounded-2xl border cursor-pointer transition-all ${
            filterStatus === 'EXPIRED' ? 'bg-red-950/20 border-red-500 ring-2 ring-red-500/30' : 'bg-white border-red-100 hover:border-red-300'
          }`}
        >
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-black text-red-600 flex items-center gap-1">
              <AlertTriangle size={16} /> منتهية الصلاحية
            </span>
            <span className="bg-red-100 text-red-700 text-xs px-2.5 py-0.5 rounded-full font-black">
              {expiredItems.length} صنف
            </span>
          </div>
          <div className="text-2xl font-black text-red-600 font-mono">
            {totalExpiredLoss.toLocaleString()} {currencySymbol}
          </div>
          <span className="text-[11px] text-slate-400 font-bold">قيمة الأصناف التالفة بالمخزن</span>
        </div>

        {/* Critical 7 Days */}
        <div 
          onClick={() => setFilterStatus(filterStatus === 'CRITICAL_7' ? 'ALL' : 'CRITICAL_7')}
          className={`p-5 rounded-2xl border cursor-pointer transition-all ${
            filterStatus === 'CRITICAL_7' ? 'bg-orange-950/20 border-orange-500 ring-2 ring-orange-500/30' : 'bg-white border-orange-100 hover:border-orange-300'
          }`}
        >
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-black text-orange-600 flex items-center gap-1">
              <Clock size={16} /> تنتهي خلال 7 أيام
            </span>
            <span className="bg-orange-100 text-orange-700 text-xs px-2.5 py-0.5 rounded-full font-black">
              {criticalItems.length} صنف
            </span>
          </div>
          <div className="text-2xl font-black text-orange-600 font-mono">
            {criticalItems.reduce((s, p) => s + p.lossValue, 0).toLocaleString()} {currencySymbol}
          </div>
          <span className="text-[11px] text-slate-400 font-bold">تتطلب تصفية أو خصم فوري ⚡</span>
        </div>

        {/* Warning 30 Days */}
        <div 
          onClick={() => setFilterStatus(filterStatus === 'WARNING_30' ? 'ALL' : 'WARNING_30')}
          className={`p-5 rounded-2xl border cursor-pointer transition-all ${
            filterStatus === 'WARNING_30' ? 'bg-amber-950/20 border-amber-500 ring-2 ring-amber-500/30' : 'bg-white border-amber-100 hover:border-amber-300'
          }`}
        >
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-black text-amber-600 flex items-center gap-1">
              <Calendar size={16} /> تنتهي خلال شهر
            </span>
            <span className="bg-amber-100 text-amber-700 text-xs px-2.5 py-0.5 rounded-full font-black">
              {warningItems.length} صنف
            </span>
          </div>
          <div className="text-2xl font-black text-amber-600 font-mono">
            {warningItems.reduce((s, p) => s + p.lossValue, 0).toLocaleString()} {currencySymbol}
          </div>
          <span className="text-[11px] text-slate-400 font-bold">فرصة لعمل عروض ترويجية</span>
        </div>

        {/* Total Risk Exposure */}
        <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white p-5 rounded-2xl border border-indigo-800 shadow-xl">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-black text-indigo-300 flex items-center gap-1">
              <Sparkles size={16} /> إجمالي القيمة المعرضة للخطر
            </span>
          </div>
          <div className="text-2xl font-black text-indigo-400 font-mono">
            {totalAtRiskValue.toLocaleString()} {currencySymbol}
          </div>
          <span className="text-[11px] text-indigo-200/70 font-bold">يمكن إنقاذها عبر عروض التصفية</span>
        </div>

      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative flex-1 w-full">
          <Search className="absolute right-3.5 top-3 text-slate-400" size={18} />
          <input 
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="ابحث باسم الصنف أو الباركود أو SKU..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-10 pl-4 py-2 text-sm focus:border-indigo-500 outline-none"
          />
        </div>

        <div className="flex gap-2 w-full md:w-auto">
          <button 
            onClick={() => setFilterStatus('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              filterStatus === 'ALL' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            الكل ({products.length})
          </button>
          <button 
            onClick={() => setFilterStatus('CRITICAL_7')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              filterStatus === 'CRITICAL_7' ? 'bg-orange-600 text-white' : 'bg-orange-50 text-orange-700 hover:bg-orange-100'
            }`}
          >
            خلال 7 أيام ({criticalItems.length})
          </button>
          <button 
            onClick={() => setFilterStatus('EXPIRED')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              filterStatus === 'EXPIRED' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100'
            }`}
          >
            منتهية ({expiredItems.length})
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <ReportHeader title="رادار الصلاحية والتصفية السريعة" />
        
        {loading ? (
          <div className="p-20 text-center flex flex-col items-center gap-3">
            <Loader2 className="animate-spin text-indigo-600" size={36} />
            <p className="text-slate-400 font-bold text-sm">جاري فحص وتجميع تواريخ الصلاحية لكافة الأصناف...</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-16 text-center text-slate-400 space-y-2">
            <CheckCircle size={48} className="mx-auto text-emerald-500 mb-2" />
            <p className="font-black text-slate-700 text-lg">ممتاز! لا توجد أصناف تطابق الفلتر الحالي</p>
            <p className="text-xs">المخزون سليم وجميع تواريخ الصلاحية ضمن النطاق الآمن.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-black">
                <tr>
                  <th className="p-4">الصنف / SKU</th>
                  <th className="p-4 text-center">الرصيد المتبقي</th>
                  <th className="p-4 text-center">تاريخ الانتهاء</th>
                  <th className="p-4 text-center">الأيام المتبقية</th>
                  <th className="p-4 text-center">سعر البيع</th>
                  <th className="p-4 text-center">عرض التصفية</th>
                  <th className="p-4 text-center">القيمة المعرضة للتلف</th>
                  <th className="p-4 text-center">إجراء التصفية</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    
                    {/* Name & SKU */}
                    <td className="p-4">
                      <div className="font-black text-slate-800 text-sm">{item.name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{item.sku} • {item.category}</div>
                    </td>

                    {/* Stock */}
                    <td className="p-4 text-center font-mono font-bold text-slate-700">
                      {item.stock} {item.unit}
                    </td>

                    {/* Expiry Date */}
                    <td className="p-4 text-center font-mono font-bold text-slate-800">
                      {item.expiry_date}
                    </td>

                    {/* Days Remaining Badge */}
                    <td className="p-4 text-center">
                      {item.status === 'EXPIRED' ? (
                        <span className="bg-red-100 text-red-700 border border-red-200 px-2.5 py-1 rounded-full font-black inline-flex items-center gap-1">
                          <AlertTriangle size={12} /> منتهي منذ {Math.abs(item.daysRemaining)} يوم
                        </span>
                      ) : item.status === 'CRITICAL_7' ? (
                        <span className="bg-orange-100 text-orange-700 border border-orange-200 px-2.5 py-1 rounded-full font-black inline-flex items-center gap-1 animate-pulse">
                          <Flame size={12} /> باقي {item.daysRemaining} أيام فقط!
                        </span>
                      ) : item.status === 'WARNING_30' ? (
                        <span className="bg-amber-100 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-full font-black inline-flex items-center gap-1">
                          <Clock size={12} /> باقي {item.daysRemaining} يوم
                        </span>
                      ) : (
                        <span className="bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full font-bold">
                          باقي {item.daysRemaining} يوم
                        </span>
                      )}
                    </td>

                    {/* Standard Sales Price */}
                    <td className="p-4 text-center font-mono font-bold text-slate-700">
                      {item.sales_price.toFixed(2)} {currencySymbol}
                    </td>

                    {/* Active Offer Status */}
                    <td className="p-4 text-center">
                      {item.offer_price && item.offer_price > 0 ? (
                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-300 px-2.5 py-1 rounded-xl font-mono font-black inline-block">
                          {item.offer_price.toFixed(2)} {currencySymbol} 🔥
                        </span>
                      ) : (
                        <span className="text-slate-400 font-bold">بدون عرض</span>
                      )}
                    </td>

                    {/* Loss Exposure Value */}
                    <td className="p-4 text-center font-mono font-black text-slate-900">
                      {item.lossValue > 0 ? `${item.lossValue.toFixed(2)} ${currencySymbol}` : '-'}
                    </td>

                    {/* Action Button */}
                    <td className="p-4 text-center">
                      {item.status !== 'EXPIRED' ? (
                        <button 
                          onClick={() => handleOpenClearance(item)}
                          className="bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200 px-3 py-1.5 rounded-xl font-bold transition-all inline-flex items-center gap-1.5 shadow-sm"
                        >
                          <Tag size={14} /> تطبيق خصم تصفية
                        </button>
                      ) : (
                        <span className="text-red-500 font-bold text-[11px]">ممنوع البيع (تالف)</span>
                      )}
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 🏷️ Clearance Offer Modal */}
      {selectedItem && (
        <div className="fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            
            <div className="p-5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white flex justify-between items-center">
              <div>
                <h3 className="font-black text-lg flex items-center gap-2">
                  <Tag size={20} /> تطبيق عرض تصفية فوري
                </h3>
                <p className="text-xs text-indigo-100">{selectedItem.name}</p>
              </div>
              <button onClick={() => setSelectedItem(null)} className="text-white/80 hover:text-white text-sm bg-white/10 px-2.5 py-1 rounded-lg">✕</button>
            </div>

            <div className="p-6 space-y-6">
              
              {/* Product Quick Recap */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="block text-slate-400 mb-0.5">السعر الأصلي</span>
                  <span className="font-mono font-black text-base text-slate-800">{selectedItem.sales_price} {currencySymbol}</span>
                </div>
                <div>
                  <span className="block text-slate-400 mb-0.5">الرصيد المتبقي</span>
                  <span className="font-mono font-black text-base text-orange-600">{selectedItem.stock} {selectedItem.unit}</span>
                </div>
              </div>

              {/* Discount Percentage Quick Buttons */}
              <div className="space-y-2">
                <label className="block text-xs font-black text-slate-700">اختر نسبة الخصم الفوري:</label>
                <div className="grid grid-cols-4 gap-2">
                  {[20, 30, 50, 70].map(pct => (
                    <button 
                      key={pct}
                      type="button"
                      onClick={() => handlePercentChange(pct)}
                      className={`py-2 rounded-xl text-xs font-black border transition-all ${
                        discountPercent === pct 
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20' 
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      خصم {pct}%
                    </button>
                  ))}
                </div>
              </div>

              {/* Offer Price Input */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5">سعر العرض الترويجي الجديد ({currencySymbol})</label>
                <input 
                  type="number"
                  step="0.01"
                  value={customOfferPrice || ''}
                  onChange={e => setCustomOfferPrice(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-center text-2xl font-mono font-black text-indigo-600 focus:border-indigo-500 outline-none"
                />
              </div>

              {/* Offer Duration */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5">مدة العرض (أيام):</label>
                <select 
                  value={offerDays} 
                  onChange={e => setOfferDays(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs font-bold focus:border-indigo-500 outline-none"
                >
                  <option value={3}>3 أيام سريعة</option>
                  <option value={7}>أسبوع كامل (7 أيام)</option>
                  <option value={14}>أسبوعين (14 يوماً)</option>
                  <option value={30}>حتى تاريخ انتهاء الصلاحية</option>
                </select>
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setSelectedItem(null)}
                  className="w-1/3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition-all text-xs"
                >
                  إلغاء
                </button>
                <button 
                  disabled={isApplyingOffer || customOfferPrice <= 0}
                  onClick={handleApplyOffer}
                  className="w-2/3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black py-3 rounded-xl transition-all shadow-lg shadow-indigo-600/30 text-xs flex items-center justify-center gap-2"
                >
                  {isApplyingOffer && <Loader2 className="animate-spin" size={16} />}
                  تفعيل العرض فوراً للكاشير 🚀
                </button>
              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
}
