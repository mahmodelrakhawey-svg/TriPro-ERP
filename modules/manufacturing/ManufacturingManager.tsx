import React, { useState, useEffect } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { supabase } from '../../supabaseClient';
import { Hammer, Save, Loader2, Package, AlertTriangle, CheckCircle } from 'lucide-react';

const ManufacturingManager = () => {
  const { products, warehouses, produceItem } = useAccounting();
  const [formData, setFormData] = useState({
    productId: '',
    warehouseId: '',
    quantity: 1,
    date: new Date().toISOString().split('T')[0],
    notes: ''
  });
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // تصفية المنتجات التي لها BOM فقط (قابلة للتصنيع)
  const manufacturableProducts = products.filter(p => p.item_type === 'STOCK');

  useEffect(() => {
      if (warehouses.length > 0 && !formData.warehouseId) {
          setFormData(prev => ({ ...prev, warehouseId: warehouses[0].id }));
      }
  }, [warehouses]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.productId || !formData.warehouseId) return;

    setLoading(true);
    setSuccessMsg('');

    try {
        // 1. إنشاء أمر تشغيل "مكتمل" في الخلفية لتوثيق العملية
        // هذا ضروري لضمان دقة "إعادة احتساب المخزون" مستقبلاً
        const orderNumber = `MFG-${Date.now().toString().slice(-6)}`;
        const { data: wo, error: woError } = await supabase.from('work_orders').insert({
            order_number: orderNumber,
            product_id: formData.productId,
            warehouse_id: formData.warehouseId,
            quantity: formData.quantity,
            start_date: formData.date,
            end_date: formData.date,
            status: 'completed', // مكتمل مباشرة
            notes: formData.notes || 'تصنيع مباشر'
        }).select().single();

        if (woError) throw woError;

        // 2. تنفيذ عملية التصنيع (خصم المواد + إضافة المنتج + القيد)
        const result = await produceItem(
            formData.productId, 
            formData.quantity, 
            formData.warehouseId, 
            formData.date, 
            0, // تكاليف إضافية (0 للتصنيع المباشر السريع)
            orderNumber // ربط القيد برقم أمر التشغيل
        );

        if (result.success) {
            setSuccessMsg(result.message);
            setFormData(prev => ({ ...prev, quantity: 1, notes: '' }));
        } else {
            // في حال الفشل، نحذف أمر التشغيل الذي أنشأناه لتجنب التضارب
            await supabase.from('work_orders').delete().eq('id', wo.id);
            alert(result.message);
        }

    } catch (error: any) {
        console.error(error);
        alert('فشل عملية التصنيع: ' + error.message);
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in">
      <div className="flex items-center justify-between">
        <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Hammer className="text-amber-600" /> التصنيع المباشر
            </h2>
            <p className="text-slate-500">تسجيل إنتاج فوري (بدون أمر تشغيل مسبق)</p>
        </div>
      </div>

      <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200">
        {successMsg && (
            <div className="mb-6 p-4 bg-emerald-50 text-emerald-700 rounded-lg flex items-center gap-2 font-bold border border-emerald-100">
                <CheckCircle size={20} /> {successMsg}
            </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">المنتج التام</label>
                    <div className="relative">
                        <select 
                            required 
                            value={formData.productId} 
                            onChange={e => setFormData({...formData, productId: e.target.value})}
                            className="w-full border rounded-lg p-3 appearance-none focus:ring-2 focus:ring-amber-500 outline-none"
                        >
                            <option value="">-- اختر المنتج --</option>
                            {manufacturableProducts.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                        <Package className="absolute left-3 top-3.5 text-slate-400" size={18} />
                    </div>
                    <p className="text-xs text-slate-400 mt-1">يجب تعريف مكونات المنتج (BOM) مسبقاً.</p>
                </div>

                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">المستودع</label>
                    <select 
                        required 
                        value={formData.warehouseId} 
                        onChange={e => setFormData({...formData, warehouseId: e.target.value})}
                        className="w-full border rounded-lg p-3 focus:ring-2 focus:ring-amber-500 outline-none bg-white"
                    >
                        {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">الكمية المنتجة</label>
                    <input 
                        type="number" 
                        required 
                        min="1" 
                        value={formData.quantity} 
                        onChange={e => setFormData({...formData, quantity: parseFloat(e.target.value)})}
                        className="w-full border rounded-lg p-3 focus:ring-2 focus:ring-amber-500 outline-none font-bold"
                    />
                </div>

                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">تاريخ الإنتاج</label>
                    <input 
                        type="date" 
                        required 
                        value={formData.date} 
                        onChange={e => setFormData({...formData, date: e.target.value})}
                        className="w-full border rounded-lg p-3 focus:ring-2 focus:ring-amber-500 outline-none"
                    />
                </div>
            </div>

            <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">ملاحظات</label>
                <textarea 
                    rows={3} 
                    value={formData.notes} 
                    onChange={e => setFormData({...formData, notes: e.target.value})}
                    className="w-full border rounded-lg p-3 focus:ring-2 focus:ring-amber-500 outline-none"
                    placeholder="ملاحظات إضافية..."
                ></textarea>
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
                <button 
                    type="submit" 
                    disabled={loading}
                    className="bg-amber-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-amber-700 flex items-center gap-2 shadow-lg shadow-amber-100 transition-all disabled:opacity-50"
                >
                    {loading ? <Loader2 className="animate-spin" /> : <Save size={20} />}
                    تسجيل الإنتاج
                </button>
            </div>
        </form>
      </div>
      
      <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex gap-3 items-start">
          <AlertTriangle className="text-blue-600 shrink-0 mt-1" size={20} />
          <div className="text-sm text-blue-800">
              <p className="font-bold mb-1">ملاحظة هامة:</p>
              <p>عند تسجيل الإنتاج، سيقوم النظام تلقائياً بخصم المواد الخام المطلوبة (بناءً على معادلة التصنيع) وإضافة المنتج التام للمخزون، مع إنشاء القيود المحاسبية اللازمة.</p>
          </div>
      </div>
    </div>
  );
};

export default ManufacturingManager;
