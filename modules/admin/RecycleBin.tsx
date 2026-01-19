import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { Trash2, RotateCcw, AlertTriangle, Loader2, RefreshCw, Archive } from 'lucide-react';

const RecycleBin = () => {
  const { restoreItem, permanentDeleteItem, currentUser } = useAccounting();
  const [activeTab, setActiveTab] = useState('accounts');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const tabs = [
    { id: 'accounts', label: 'الحسابات', table: 'accounts' },
    { id: 'customers', label: 'العملاء', table: 'customers' },
    { id: 'suppliers', label: 'الموردين', table: 'suppliers' },
    { id: 'products', label: 'المنتجات', table: 'products' },
    { id: 'warehouses', label: 'المستودعات', table: 'warehouses' },
    { id: 'assets', label: 'الأصول', table: 'assets' },
    { id: 'employees', label: 'الموظفين', table: 'employees' },
  ];

  const fetchDeletedItems = async () => {
    setLoading(true);
    const currentTab = tabs.find(t => t.id === activeTab);
    if (!currentTab) return;

    try {
      const { data, error } = await supabase
        .from(currentTab.table)
        .select('*')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      console.error('Error fetching deleted items:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeletedItems();
  }, [activeTab]);

  const handleRestore = async (id: string) => {
    const currentTab = tabs.find(t => t.id === activeTab);
    if (!currentTab) return;
    
    if (currentUser?.role === 'demo') {
        if (window.confirm('هل أنت متأكد من استعادة هذا العنصر؟ (محاكاة)')) {
             alert('تم استعادة العنصر بنجاح ✅ (محاكاة)');
             setItems(prev => prev.filter(item => item.id !== id));
        }
        return;
    }

    if (window.confirm('هل أنت متأكد من استعادة هذا العنصر؟')) {
        const result = await restoreItem(currentTab.table, id);
        if (result.success) {
            fetchDeletedItems();
        } else {
            alert('فشل الاستعادة: ' + result.message);
        }
    }
  };

  const handlePermanentDelete = async (id: string) => {
    const currentTab = tabs.find(t => t.id === activeTab);
    if (!currentTab) return;

    if (currentUser?.role === 'demo') {
        if (window.confirm('تحذير: هل أنت متأكد من الحذف النهائي؟ لا يمكن التراجع عن هذا الإجراء! (محاكاة)')) {
             alert('تم الحذف النهائي بنجاح ✅ (محاكاة)');
             setItems(prev => prev.filter(item => item.id !== id));
        }
        return;
    }

    if (window.confirm('تحذير: هل أنت متأكد من الحذف النهائي؟ لا يمكن التراجع عن هذا الإجراء!')) {
        const result = await permanentDeleteItem(currentTab.table, id);
        if (result.success) {
            fetchDeletedItems();
        } else {
            alert('فشل الحذف النهائي: ' + result.message);
        }
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto animate-in fade-in">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Trash2 className="text-red-600" /> سلة المحذوفات
          </h1>
          <p className="text-slate-500 mt-1">استعادة البيانات المحذوفة أو حذفها نهائياً</p>
        </div>
        <button 
            onClick={fetchDeletedItems}
            className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600"
        >
            <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-100 overflow-x-auto">
            {tabs.map(tab => (
                <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-6 py-4 font-bold text-sm whitespace-nowrap transition-colors ${
                        activeTab === tab.id 
                            ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' 
                            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                    }`}
                >
                    {tab.label}
                </button>
            ))}
        </div>

        <div className="p-6">
            {loading ? (
                <div className="text-center py-12"><Loader2 className="animate-spin mx-auto text-blue-600" size={32} /></div>
            ) : items.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                    <Archive size={48} className="mx-auto mb-4 opacity-20" />
                    <p>سلة المحذوفات فارغة لهذا القسم</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-right">
                        <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
                            <tr>
                                <th className="px-4 py-3">الاسم / البيان</th>
                                <th className="px-4 py-3">سبب الحذف</th>
                                <th className="px-4 py-3">تاريخ الحذف</th>
                                <th className="px-4 py-3 text-center">إجراءات</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {items.map(item => (
                                <tr key={item.id} className="hover:bg-red-50/30 transition-colors">
                                    <td className="px-4 py-3 font-medium text-slate-800">
                                        {item.name || item.full_name || item.description || 'بدون اسم'}
                                        {item.code && <span className="text-xs text-slate-400 mr-2">({item.code})</span>}
                                    </td>
                                    <td className="px-4 py-3 text-slate-600 text-sm">
                                        {item.deletion_reason || '-'}
                                    </td>
                                    <td className="px-4 py-3 text-slate-500 text-sm" dir="ltr">
                                        {new Date(item.deleted_at).toLocaleString('ar-EG')}
                                    </td>
                                    <td className="px-4 py-3 flex justify-center gap-2">
                                        <button 
                                            onClick={() => handleRestore(item.id)}
                                            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 font-bold text-xs transition-colors"
                                        >
                                            <RotateCcw size={14} /> استعادة
                                        </button>
                                        <button 
                                            onClick={() => handlePermanentDelete(item.id)}
                                            className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-bold text-xs transition-colors"
                                        >
                                            <Trash2 size={14} /> حذف نهائي
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default RecycleBin;