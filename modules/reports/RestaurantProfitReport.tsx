import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { Download, Printer, Loader2, Search, DollarSign, Utensils, AlertTriangle, TrendingUp, CheckCircle2, ArrowUpCircle, Calendar } from 'lucide-react';
import * as XLSX from 'xlsx';

type MealProfit = {
  id: string;
  name: string;
  sku: string;
  categoryName: string;
  salesPrice: number;
  ingredientsCost: number;
  grossProfit: number;
  margin: number;
  hasRecipe: boolean;
  suggestedPrice?: number;
  quantitySold: number;
  totalAccumulatedLoss: number;
};

const RestaurantProfitReport = () => {
  const { currentUser, updateProduct } = useAccounting();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<MealProfit[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'margin' | 'profit'>('margin');
  const [showLossOnly, setShowLossOnly] = useState(false);
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchData();
  }, [startDate, endDate]); // إعادة التحميل عند تغيير التاريخ

  const fetchData = async () => {
    setLoading(true);
    if (currentUser?.role === 'demo') {
        setReportData([
            { id: '1', name: 'برجر دجاج كلاسيك', sku: 'CHK-BRG', categoryName: 'وجبات رئيسية', salesPrice: 25, ingredientsCost: 12.5, grossProfit: 12.5, margin: 50, hasRecipe: true, quantitySold: 150, totalAccumulatedLoss: 0 },
            { id: '2', name: 'بيتزا مارجريتا', sku: 'PZ-MAR', categoryName: 'بيتزا', salesPrice: 35, ingredientsCost: 10, grossProfit: 25, margin: 71.4, hasRecipe: true, quantitySold: 80, totalAccumulatedLoss: 0 },
            { id: '3', name: 'عصير برتقال', sku: 'J-ORG', categoryName: 'مشروبات', salesPrice: 15, ingredientsCost: 18, grossProfit: -3, margin: -20, hasRecipe: true, quantitySold: 200, totalAccumulatedLoss: 600 },
        ]);
        setLoading(false);
        return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userOrgId = user?.user_metadata?.org_id;

      if (!userOrgId) return;

      // 1. جلب المنتجات المصنعة (وجبات المطعم)
      const { data: products, error: prodError } = await supabase
        .from('products')
        .select('id, name, sku, sales_price, cost, category_id, product_type, item_categories(name)')
        .eq('organization_id', userOrgId)
        .eq('product_type', 'MANUFACTURED') 
        .eq('is_active', true);

      if (prodError) throw prodError;

      // 2. جلب مكونات الوصفات (BOM) للمنتجات الخاصة بهذه المنظمة فقط
      // نستخدم مصفوفة المعرفات المفلترة سابقاً لتجنب الخطأ في حال عدم وجود عمود organization_id في جدول BOM
      const productIds = products?.map(p => p.id) || [];
      const { data: boms, error: bomError } = await supabase
        .from('bill_of_materials')
        .select('product_id, quantity_required, raw_material_id, products:raw_material_id(purchase_price, cost, weighted_average_cost)')
        .in('product_id', productIds);

      if (bomError) throw bomError;

      // 2.5 جلب كميات المبيعات للفترة المحددة لحساب الخسارة المتراكمة
      const { data: salesItems } = await supabase
        .from('order_items')
        .select('product_id, quantity, orders!inner(created_at, status, organization_id)')
        .eq('orders.organization_id', userOrgId)
        .eq('orders.status', 'COMPLETED')
        .gte('orders.created_at', `${startDate}T00:00:00`)
        .lte('orders.created_at', `${endDate}T23:59:59`);

      const salesMap: Record<string, number> = {};
      salesItems?.forEach((item: any) => {
          salesMap[item.product_id] = (salesMap[item.product_id] || 0) + Number(item.quantity);
      });

      // 3. حساب التكلفة والربحية لكل وجبة
      const processedData: MealProfit[] = products.map((product: any) => {
          const productRecipes = boms?.filter((b: any) => b.product_id === product.id) || [];
          let totalIngredientsCost = 0;
          
          productRecipes.forEach((recipe: any) => {
              const ingredient = recipe.products;
              // أولوية التكلفة: متوسط التكلفة المرجح > سعر الشراء > التكلفة المعيارية
              const unitCost = Number(ingredient?.weighted_average_cost || ingredient?.purchase_price || ingredient?.cost || 0);
              totalIngredientsCost += (unitCost * Number(recipe.quantity_required));
          });

          // إذا لم تكن هناك وصفة، نستخدم التكلفة التقديرية المسجلة في بطاقة الصنف
          const hasRecipe = productRecipes.length > 0;
          if (!hasRecipe && product.cost > 0) {
              totalIngredientsCost = product.cost;
          }

          const salesPrice = Number(product.sales_price || 0);
          const grossProfit = salesPrice - totalIngredientsCost;
          const margin = salesPrice > 0 ? (grossProfit / salesPrice) * 100 : 0;

          let suggestedPrice = 0;
          const targetMargin = 30; // الهدف 30%
          if (margin < targetMargin && totalIngredientsCost > 0) {
              suggestedPrice = totalIngredientsCost / (1 - (targetMargin / 100));
          }

          const qtySold = salesMap[product.id] || 0;
          const unitLoss = totalIngredientsCost - salesPrice;
          const totalAccumulatedLoss = unitLoss > 0 ? unitLoss * qtySold : 0;

          return {
              id: product.id,
              name: product.name,
              sku: product.sku || '-',
              categoryName: product.item_categories?.name || 'غير مصنف',
              salesPrice,
              ingredientsCost: totalIngredientsCost,
              grossProfit,
              margin,
              hasRecipe,
              suggestedPrice: suggestedPrice > salesPrice ? suggestedPrice : undefined,
              quantitySold: qtySold,
              totalAccumulatedLoss
          };
      });

      setReportData(processedData);

    } catch (error: any) {
      console.error('Error fetching profit report:', error);
      showToast('حدث خطأ أثناء جلب البيانات: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const filteredData = useMemo(() => {
      let data = reportData.filter(item => 
          item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
          item.sku.toLowerCase().includes(searchTerm.toLowerCase())
      );

      if (showLossOnly) {
          data = data.filter(item => item.grossProfit < 0);
      }
      
      return data.sort((a, b) => sortBy === 'margin' ? b.margin - a.margin : b.grossProfit - a.grossProfit);
  }, [reportData, searchTerm, sortBy, showLossOnly]);

  const handleExportExcel = () => {
    const data = filteredData.map(p => ({
        'اسم الوجبة': p.name,
        'التصنيف': p.categoryName,
        'سعر البيع': p.salesPrice,
        'تكلفة المكونات': p.ingredientsCost,
        'الربح الإجمالي': p.grossProfit,
        'هامش الربح %': `${p.margin.toFixed(1)}%`,
        'له وصفة؟': p.hasRecipe ? 'نعم' : 'لا (تكلفة تقديرية)',
        'اقتراح السعر (لهامش 30%)': p.suggestedPrice ? Math.ceil(p.suggestedPrice) : '-',
        'الكمية المباعة (في الفترة)': p.quantitySold,
        'إجمالي الخسارة المتراكمة': p.totalAccumulatedLoss > 0 ? p.totalAccumulatedLoss : '-'
    }));
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Restaurant Profitability");
    
    const fileName = showLossOnly ? `Loss_Making_Items_${new Date().toISOString().split('T')[0]}.xlsx` : `Restaurant_Profitability_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const handleUpdatePrice = async (item: MealProfit) => {
      if (!item.suggestedPrice) return;
      const newPrice = Math.ceil(item.suggestedPrice);

      if (currentUser?.role === 'demo') {
          showToast(`تم تحديث سعر "${item.name}" إلى ${newPrice} (محاكاة)`, 'success');
          return;
      }

      if (window.confirm(`هل أنت متأكد من تحديث سعر بيع "${item.name}" إلى ${newPrice.toLocaleString()}؟`)) {
          await updateProduct(item.id, { sales_price: newPrice });
          showToast('تم تحديث السعر بنجاح ✅', 'success');
          fetchData(); // تحديث البيانات لإعادة حساب الهامش
      }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <TrendingUp className="text-emerald-600" /> تحليل ربحية الوجبات
            </h2>
            <p className="text-slate-500">مقارنة أسعار البيع بتكلفة المكونات (BOM) لحساب الهوامش</p>
        </div>
        <div className="flex gap-2">
            <button onClick={handleExportExcel} disabled={reportData.length === 0} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 font-bold text-sm shadow-sm disabled:opacity-50">
                <Download size={16} /> تصدير Excel
            </button>
            <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 font-bold text-sm shadow-sm">
                <Printer size={16} /> طباعة
            </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 no-print flex flex-wrap gap-4 items-end">
          <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">من تاريخ</label>
              <div className="relative">
                  <Calendar className="absolute top-2.5 right-3 text-slate-400" size={16} />
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full border rounded-lg px-3 py-2 pr-10 focus:outline-none focus:border-emerald-500" />
              </div>
          </div>
          <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">إلى تاريخ</label>
              <div className="relative">
                  <Calendar className="absolute top-2.5 right-3 text-slate-400" size={16} />
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full border rounded-lg px-3 py-2 pr-10 focus:outline-none focus:border-emerald-500" />
              </div>
          </div>
          <div className="w-px h-10 bg-slate-200 mx-2 hidden md:block"></div>

          <div className="relative flex-1 min-w-[250px]">
              <Search className="absolute right-3 top-2.5 text-slate-400" size={18} />
              <input 
                  type="text" 
                  placeholder="بحث عن وجبة..." 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pr-10 pl-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500"
              />
          </div>
          <label className={`flex items-center gap-2 cursor-pointer px-3 py-2 h-[42px] rounded-lg border transition-all ${showLossOnly ? 'bg-red-50 border-red-200' : 'bg-white border-slate-300 hover:bg-slate-50'}`}>
              <input 
                  type="checkbox" 
                  checked={showLossOnly} 
                  onChange={(e) => setShowLossOnly(e.target.checked)} 
                  className="w-4 h-4 text-red-600 rounded focus:ring-red-500 border-gray-300"
              />
              <span className={`text-sm font-bold ${showLossOnly ? 'text-red-700' : 'text-slate-600'}`}>الخسائر فقط</span>
          </label>
          <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value as any)}
              className="border border-slate-300 rounded-lg px-3 py-2 h-[42px] bg-white focus:outline-none focus:border-emerald-500"
          >
              <option value="margin">ترتيب حسب: هامش الربح %</option>
              <option value="profit">ترتيب حسب: قيمة الربح</option>
          </select>
          <button onClick={fetchData} className="p-2 bg-slate-100 rounded-lg hover:bg-slate-200 text-slate-600"><Loader2 size={20} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-right text-sm">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                    <th className="p-4">اسم الوجبة</th>
                    <th className="p-4">التصنيف</th>
                    <th className="p-4 text-center">سعر البيع</th>
                    <th className="p-4 text-center">تكلفة المكونات</th>
                    <th className="p-4 text-center">الربح</th>
                    <th className="p-4 text-center">الهامش %</th>
                    <th className="p-4 text-center">الكمية المباعة</th>
                    <th className="p-4 text-center text-red-600">إجمالي الخسارة المتراكمة</th>
                    <th className="p-4 text-center bg-amber-50 text-amber-700 border-b border-amber-100">اقتراح تحسين (هدف 30%)</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {filteredData.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4 font-bold text-slate-800 flex items-center gap-2">
                            <Utensils size={16} className="text-slate-400" />
                            {item.name}
                            {!item.hasRecipe && <span title="لا توجد وصفة (تكلفة تقديرية)"><AlertTriangle size={14} className="text-amber-500" /></span>}
                        </td>
                        <td className="p-4 text-slate-500">{item.categoryName}</td>
                        <td className="p-4 text-center font-bold">{item.salesPrice.toLocaleString()}</td>
                        <td className="p-4 text-center text-red-600">{item.ingredientsCost.toLocaleString(undefined, {maximumFractionDigits: 2})}</td>
                        <td className="p-4 text-center font-bold text-emerald-600">{item.grossProfit.toLocaleString(undefined, {maximumFractionDigits: 2})}</td>
                        <td className="p-4 text-center">
                            <span className={`px-2 py-1 rounded text-xs font-bold ${item.margin >= 50 ? 'bg-emerald-100 text-emerald-700' : item.margin >= 20 ? 'bg-blue-100 text-blue-700' : item.margin > 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                                {item.margin.toFixed(1)}%
                            </span>
                        </td>
                        <td className="p-4 text-center font-bold text-slate-700">{item.quantitySold}</td>
                        <td className="p-4 text-center font-bold">
                            {item.totalAccumulatedLoss > 0 ? (
                                <span className="text-red-600 bg-red-50 px-2 py-1 rounded">{item.totalAccumulatedLoss.toLocaleString()}</span>
                            ) : <span className="text-slate-300">-</span>}
                        </td>
                        <td className="p-4 text-center bg-amber-50/30">
                            {item.suggestedPrice ? (
                                <div className="flex flex-col items-center animate-in zoom-in gap-2">
                                    <div className="flex items-center gap-1 text-amber-700 font-bold bg-white px-2 py-1 rounded-lg border border-amber-200 shadow-sm">
                                        <ArrowUpCircle size={14} />
                                        <span>{Math.ceil(item.suggestedPrice).toLocaleString()}</span>
                                    </div>
                                    <button 
                                        onClick={() => handleUpdatePrice(item)}
                                        className="text-xs bg-emerald-600 text-white px-3 py-1 rounded hover:bg-emerald-700 transition-colors shadow-sm font-bold flex items-center gap-1"
                                    >
                                        <CheckCircle2 size={12} /> تطبيق
                                    </button>
                                </div>
                            ) : (
                                <span className="text-emerald-600 text-xs font-bold flex items-center justify-center gap-1 opacity-60">
                                    <CheckCircle2 size={14} /> جيد
                                </span>
                            )}
                        </td>
                    </tr>
                ))}
                {filteredData.length === 0 && !loading && (
                    <tr><td colSpan={9} className="p-8 text-center text-slate-400">لا توجد وجبات مسجلة</td></tr>
                )}
            </tbody>
        </table>
      </div>
    </div>
  );
};

export default RestaurantProfitReport;