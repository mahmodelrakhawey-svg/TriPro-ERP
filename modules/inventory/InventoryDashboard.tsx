import React, { useMemo } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { Package, AlertTriangle, Warehouse, TrendingUp, BarChart3, DollarSign } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const InventoryDashboard = () => {
  const { products, warehouses, settings } = useAccounting();

  const stats = useMemo(() => {
    const totalItems = products.length;
    // حساب إجمالي قيمة المخزون (الكمية * التكلفة)
    const totalValue = products.reduce((sum, p) => sum + ((p.stock || 0) * (p.cost || 0)), 0);
    // الأصناف التي وصلت لحد الطلب (افترضنا 5 كحد أدنى مؤقتاً)
    const lowStockItems = products.filter(p => (p.stock || 0) <= 5).length;
    const totalWarehouses = warehouses.length;

    // أعلى 5 أصناف قيمة مخزنية
    const topValueItems = [...products]
      .sort((a, b) => ((b.stock || 0) * (b.cost || 0)) - ((a.stock || 0) * (a.cost || 0)))
      .slice(0, 5)
      .map(p => ({
        name: p.name,
        value: (p.stock || 0) * (p.cost || 0)
      }));

    return { totalItems, totalValue, lowStockItems, totalWarehouses, topValueItems };
  }, [products, warehouses]);

  return (
    <div className="space-y-6 animate-in fade-in p-6">
        {/* Header */}
        <div className="flex justify-between items-center">
            <div>
                <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <Package className="text-blue-600" /> لوحة تحكم المخزون
                </h1>
                <p className="text-slate-500">نظرة عامة على حالة المستودعات وقيمة البضاعة</p>
            </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="flex justify-between items-start mb-4">
                    <div className="p-3 bg-blue-50 rounded-xl text-blue-600"><DollarSign size={24} /></div>
                </div>
                <p className="text-slate-500 text-sm font-medium mb-1">إجمالي قيمة المخزون</p>
                <h3 className="text-2xl font-black text-slate-800">{stats.totalValue.toLocaleString()} <span className="text-xs font-normal text-slate-400">{settings.currency}</span></h3>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="flex justify-between items-start mb-4">
                    <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600"><Package size={24} /></div>
                </div>
                <p className="text-slate-500 text-sm font-medium mb-1">عدد الأصناف المعرفة</p>
                <h3 className="text-2xl font-black text-slate-800">{stats.totalItems}</h3>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="flex justify-between items-start mb-4">
                    <div className="p-3 bg-amber-50 rounded-xl text-amber-600"><Warehouse size={24} /></div>
                </div>
                <p className="text-slate-500 text-sm font-medium mb-1">عدد المستودعات</p>
                <h3 className="text-2xl font-black text-slate-800">{stats.totalWarehouses}</h3>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="flex justify-between items-start mb-4">
                    <div className="p-3 bg-red-50 rounded-xl text-red-600"><AlertTriangle size={24} /></div>
                </div>
                <p className="text-slate-500 text-sm font-medium mb-1">أصناف منخفضة المخزون</p>
                <h3 className="text-2xl font-black text-slate-800">{stats.lowStockItems}</h3>
            </div>
        </div>

        {/* Chart */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                <BarChart3 size={20} className="text-slate-400" /> أعلى الأصناف قيمة مخزنية
            </h3>
            <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.topValueItems} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
                        <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
                        <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                        <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} name="القيمة" barSize={50} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    </div>
  );
};

export default InventoryDashboard;