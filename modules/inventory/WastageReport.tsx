import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { AlertTriangle, TrendingUp, Package, RefreshCw, BarChart3, Printer, Search, Calendar } from 'lucide-react';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import ReportHeader from '../../components/ReportHeader';

interface WastageItemAnalysis {
    product_id: string;
    product_name: string;
    avg_purchase_price: number;
    actual_wac: number;
    cost_increase_per_unit: number;
    current_stock: number;
    total_wasted_qty: number;
    total_wastage_impact_value: number;
}

const WastageReport = () => {
    const { products, currentUser, settings, selectedFiscalYear, fiscalYearRange } = useAccounting();
    const [reportData, setReportData] = useState<WastageItemAnalysis[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const { showToast } = useToast();

    const fetchReport = async () => {
        setLoading(true);
        try {
            const orgId = (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;

            // 1. محاولة الاستعلام من الفيو أولاً إن وجدت مع عزل الشركة (Multi-Tenant Isolation)
            let viewQuery = supabase
                .from('vw_inventory_wastage_analysis')
                .select('*');

            if (orgId && currentUser?.role !== 'super_admin' && currentUser?.role !== 'demo') {
                viewQuery = viewQuery.eq('organization_id', orgId);
            }

            const { data: viewData, error: viewError } = await viewQuery;

            if (!viewError && Array.isArray(viewData)) {
                // تصفية أمان إضافية لضمان عزل بيانات المنشأة الحالية
                const filteredOrgData = orgId && currentUser?.role !== 'super_admin' && currentUser?.role !== 'demo'
                    ? viewData.filter(d => d.organization_id === orgId)
                    : viewData;

                setReportData(filteredOrgData);
                setLoading(false);
                return;
            }

            // 2. إذا لم تكن الفيو موجودة (404)، نقوم بالحساب الديناميكي من الجداول الفعلية
            let adjustmentsQuery = supabase
                .from('stock_adjustments')
                .select(`
                    id, adjustment_date, reason,
                    stock_adjustment_items (
                        product_id, quantity
                    )
                `)
                .or('reason.ilike.%هالك%,reason.ilike.%wastage%,reason.ilike.%تالف%');

            if (orgId && currentUser?.role !== 'super_admin' && currentUser?.role !== 'demo') {
                adjustmentsQuery = adjustmentsQuery.eq('organization_id', orgId);
            }

            const { data: adjustmentsData, error: adjError } = await adjustmentsQuery;

            // تجميع كميات الهالك لكل صنف
            const wastedQtyMap: Record<string, number> = {};
            if (adjustmentsData && !adjError) {
                adjustmentsData.forEach((adj: any) => {
                    const items = adj.stock_adjustment_items || [];
                    items.forEach((item: any) => {
                        const pid = item.product_id;
                        const qty = Math.abs(Number(item.quantity) || 0);
                        wastedQtyMap[pid] = (wastedQtyMap[pid] || 0) + qty;
                    });
                });
            }

            // بناء تقرير انحراف التكلفة لكل الأصناف التي بها هالك أو فارق بين سعر الشراء والتكلفة المرجحة
            const calculatedList: WastageItemAnalysis[] = (products || []).map((p: any) => {
                const purchasePrice = Number(p.purchase_price || p.purchasePrice || p.cost || 0);
                const wac = Number(p.weighted_average_cost || p.cost || purchasePrice);
                const currentStock = Number(p.stock_quantity || p.stock || 0);
                const wastedQty = wastedQtyMap[p.id] || 0;
                
                // حساب الزيادة في الوحدة
                const costDiff = Math.max(0, wac - purchasePrice);
                const totalWastageImpact = wastedQty > 0 
                    ? (wastedQty * (purchasePrice || wac))
                    : (costDiff * currentStock);

                return {
                    product_id: p.id,
                    product_name: p.name || 'صنف',
                    avg_purchase_price: purchasePrice,
                    actual_wac: wac,
                    cost_increase_per_unit: costDiff,
                    current_stock: currentStock,
                    total_wasted_qty: wastedQty,
                    total_wastage_impact_value: totalWastageImpact
                };
            }).filter(item => item.total_wasted_qty > 0 || item.cost_increase_per_unit > 0 || item.total_wastage_impact_value > 0);

            // إذا كان المستخدم في وضع الديمو ولا توجد بيانات، نضع بيانات تجريبية توضيحية
            if (calculatedList.length === 0 && currentUser?.role === 'demo') {
                calculatedList.push(
                    {
                        product_id: 'demo-1',
                        product_name: 'طماطم طازجة (كجم)',
                        avg_purchase_price: 15,
                        actual_wac: 17.5,
                        cost_increase_per_unit: 2.5,
                        current_stock: 120,
                        total_wasted_qty: 20,
                        total_wastage_impact_value: 300
                    },
                    {
                        product_id: 'demo-2',
                        product_name: 'لحم بقري مفروم (كجم)',
                        avg_purchase_price: 320,
                        actual_wac: 335,
                        cost_increase_per_unit: 15,
                        current_stock: 45,
                        total_wasted_qty: 3,
                        total_wastage_impact_value: 960
                    }
                );
            }

            setReportData(calculatedList);
        } catch (error: any) {
            console.error('Failed to calculate wastage analysis:', error);
            showToast('تعذر جلب تقرير انحراف التكلفة', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReport();
    }, [products]);

    const filteredData = useMemo(() => {
        if (!searchTerm.trim()) return reportData;
        return reportData.filter(item => 
            item.product_name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [reportData, searchTerm]);

    const totalImpact = useMemo(() => {
        return filteredData.reduce((acc, curr) => acc + (Number(curr.total_wastage_impact_value) || 0), 0);
    }, [filteredData]);

    const totalWastedItemsCount = useMemo(() => {
        return filteredData.reduce((acc, curr) => acc + (Number(curr.total_wasted_qty) || 0), 0);
    }, [filteredData]);

    return (
        <div className="p-6 space-y-6 bg-slate-50 min-h-screen font-sans" dir="rtl">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden">
                <div>
                    <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                        <AlertTriangle className="text-amber-500" /> تقرير تحليل انحراف التكلفة بسبب الهالك
                    </h2>
                    <p className="text-slate-500 text-sm mt-1 font-medium">يوضح مدى ارتفاع تكلفة الصنف الفعلية عن سعر الشراء نتيجة الهالك والتوالف</p>
                </div>
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => window.print()} 
                        className="bg-slate-800 text-white font-bold px-4 py-2 rounded-xl hover:bg-slate-900 transition-colors flex items-center gap-2 text-sm shadow-sm"
                    >
                        <Printer size={16} /> طباعة التقرير
                    </button>
                    <button 
                        onClick={fetchReport} 
                        className="bg-white border border-slate-200 p-2 rounded-xl hover:bg-slate-100 transition-colors text-slate-600 shadow-sm"
                        title="تحديث البيانات"
                    >
                        <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* بطاقات المؤشرات الإحصائية */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 print:grid-cols-3">
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                    <div className="flex items-center gap-3 text-amber-600 mb-2">
                        <BarChart3 size={24} />
                        <span className="font-bold text-sm">إجمالي الخسارة المستترة (أثر الهالك)</span>
                    </div>
                    <div className="text-3xl font-black text-slate-900 tabular-nums">
                        {totalImpact.toLocaleString()} <span className="text-sm font-normal text-slate-500">{settings.currency || 'ج.م'}</span>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                    <div className="flex items-center gap-3 text-red-600 mb-2">
                        <Package size={24} />
                        <span className="font-bold text-sm">إجمالي كميات الهالك المسجلة</span>
                    </div>
                    <div className="text-3xl font-black text-slate-900 tabular-nums">
                        {totalWastedItemsCount.toLocaleString()} <span className="text-sm font-normal text-slate-500">وحدة</span>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                    <div className="flex items-center gap-3 text-indigo-600 mb-2">
                        <TrendingUp size={24} />
                        <span className="font-bold text-sm">الأصناف المتأثرة بالهالك</span>
                    </div>
                    <div className="text-3xl font-black text-slate-900 tabular-nums">
                        {filteredData.length} <span className="text-sm font-normal text-slate-500">صنف</span>
                    </div>
                </div>
            </div>

            {/* أدوات البحث والتصفية */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-3 print:hidden">
                <Search size={18} className="text-slate-400" />
                <input 
                    type="text" 
                    placeholder="البحث باسم الصنف..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-transparent border-none outline-none font-bold text-slate-700 text-sm placeholder-slate-400"
                />
            </div>

            {/* جدول البيانات */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-right">
                    <thead className="bg-slate-50 border-b border-slate-100">
                        <tr className="text-xs font-black text-slate-400 uppercase">
                            <th className="p-4">اسم الصنف</th>
                            <th className="p-4 text-center">سعر الشراء</th>
                            <th className="p-4 text-center">التكلفة الفعلية (WAC)</th>
                            <th className="p-4 text-center">الزيادة في الوحدة</th>
                            <th className="p-4 text-center">الكمية الهالكة</th>
                            <th className="p-4 text-center">المخزون الحالي</th>
                            <th className="p-4 text-center">إجمالي الخسارة المستترة</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading ? (
                            <tr><td colSpan={7} className="p-10 text-center text-slate-400 font-bold">جاري تحميل البيانات...</td></tr>
                        ) : filteredData.length === 0 ? (
                            <tr><td colSpan={7} className="p-10 text-center text-slate-400 font-bold">لا يوجد انحراف في التكلفة أو عمليات هالك مسجلة</td></tr>
                        ) : (
                            filteredData.map((item) => (
                                <tr key={item.product_id} className="hover:bg-slate-50 transition-colors">
                                    <td className="p-4 font-bold text-slate-800">{item.product_name}</td>
                                    <td className="p-4 text-center font-mono text-slate-600">{item.avg_purchase_price.toLocaleString()}</td>
                                    <td className="p-4 text-center font-black text-blue-600 font-mono">{item.actual_wac.toLocaleString()}</td>
                                    <td className="p-4 text-center font-bold text-amber-600 font-mono">
                                        {item.cost_increase_per_unit > 0 ? `+${item.cost_increase_per_unit.toLocaleString()}` : '-'}
                                    </td>
                                    <td className="p-4 text-center font-bold text-red-600 font-mono">{item.total_wasted_qty || 0}</td>
                                    <td className="p-4 text-center font-bold text-slate-700 font-mono">{item.current_stock}</td>
                                    <td className="p-4 text-center">
                                        <span className="bg-red-50 text-red-600 px-3 py-1 rounded-full font-black text-sm tabular-nums inline-block">
                                            {item.total_wastage_impact_value.toLocaleString()} {settings.currency || 'ج.م'}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-start gap-3">
                <TrendingUp size={20} className="text-amber-600 mt-1 shrink-0" />
                <p className="text-sm text-amber-800 leading-relaxed font-medium">
                    <strong>ملاحظة محاسبية:</strong> الارتفاع في التكلفة الفعلية (WAC) عن سعر الشراء يعود إلى توزيع تكلفة الكميات المفقودة (الهالك) على الكميات السليمة المتبقية في المخزن. "الخسارة المستترة" هي القيمة التي تآكلت من ربحيتك ولم يتم بيعها.
                </p>
            </div>
        </div>
    );
};

export default WastageReport;