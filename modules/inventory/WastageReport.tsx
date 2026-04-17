import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { AlertTriangle, TrendingUp, Package, RefreshCw, BarChart3 } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

const WastageReport = () => {
    const [reportData, setReportData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const { showToast } = useToast();

    const fetchReport = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('vw_inventory_wastage_analysis')
                .select('*');
            
            if (error) throw error;
            setReportData(data || []);
        } catch (error: any) {
            showToast('فشل تحميل تقرير انحراف التكلفة', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReport();
    }, []);

    return (
        <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                        <AlertTriangle className="text-amber-500" /> تحليل انحراف التكلفة بسبب الهالك
                    </h2>
                    <p className="text-slate-500 text-sm mt-1 font-medium">يوضح مدى ارتفاع تكلفة الصنف الفعلية عن سعر الشراء نتيجة الهالك</p>
                </div>
                <button 
                    onClick={fetchReport} 
                    className="bg-white border border-slate-200 p-2 rounded-xl hover:bg-slate-100 transition-colors"
                >
                    <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                    <div className="flex items-center gap-4 text-amber-600 mb-2">
                        <BarChart3 size={24} />
                        <span className="font-bold">إجمالي أثر الهالك</span>
                    </div>
                    <div className="text-3xl font-black text-slate-900 tabular-nums">
                        {reportData.reduce((acc, curr) => acc + curr.total_wastage_impact_value, 0).toLocaleString()} <span className="text-sm font-normal">ج.م</span>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-right">
                    <thead className="bg-slate-50 border-b border-slate-100">
                        <tr className="text-xs font-black text-slate-400 uppercase">
                            <th className="p-4">اسم الصنف</th>
                            <th className="p-4 text-center">سعر الشراء</th>
                            <th className="p-4 text-center">التكلفة الفعلية (WAC)</th>
                            <th className="p-4 text-center">الزيادة في الوحدة</th>
                            <th className="p-4 text-center">المخزون الحالي</th>
                            <th className="p-4 text-center">إجمالي الخسارة المستترة</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {loading ? (
                            <tr><td colSpan={6} className="p-10 text-center text-slate-400">جاري تحميل البيانات...</td></tr>
                        ) : reportData.length === 0 ? (
                            <tr><td colSpan={6} className="p-10 text-center text-slate-400">لا يوجد انحراف في التكلفة حالياً</td></tr>
                        ) : (
                            reportData.map((item) => (
                                <tr key={item.product_id} className="hover:bg-slate-50 transition-colors">
                                    <td className="p-4 font-bold text-slate-800">{item.product_name}</td>
                                    <td className="p-4 text-center font-mono text-slate-500">{item.avg_purchase_price.toLocaleString()}</td>
                                    <td className="p-4 text-center font-black text-blue-600">{item.actual_wac.toLocaleString()}</td>
                                    <td className="p-4 text-center font-bold text-amber-600">
                                        +{item.cost_increase_per_unit.toLocaleString()}
                                    </td>
                                    <td className="p-4 text-center font-bold text-slate-700">{item.current_stock}</td>
                                    <td className="p-4 text-center">
                                        <span className="bg-red-50 text-red-600 px-3 py-1 rounded-full font-black text-sm">
                                            {item.total_wastage_impact_value.toLocaleString()}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex items-start gap-3">
                <TrendingUp size={20} className="text-amber-600 mt-1" />
                <p className="text-sm text-amber-700 leading-relaxed">
                    <strong>ملاحظة محاسبية:</strong> الارتفاع في التكلفة الفعلية (WAC) عن سعر الشراء يعود إلى توزيع تكلفة الكميات المفقودة (الهالك) على الكميات السليمة المتبقية في المخزن. "الخسارة المستترة" هي القيمة التي تآكلت من ربحيتك ولم يتم بيعها.
                </p>
            </div>
        </div>
    );
};

export default WastageReport;