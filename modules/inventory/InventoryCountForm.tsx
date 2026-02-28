﻿﻿﻿﻿﻿import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { Calculator, RefreshCw, Save, Search, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { PhysicalStockItem } from '../../types';

const InventoryCountForm = () => {
  const navigate = useNavigate();
  const { products, warehouses, settings, recalculateStock, currentUser } = useAccounting();
  const { showToast } = useToast();
  const [warehouseId, setWarehouseId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [items, setItems] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const handleStartCount = async () => {
    if (!warehouseId) {
      showToast('الرجاء اختيار المستودع أولاً', 'warning');
      return;
    }
    
    setLoadingProducts(true);
    if (currentUser?.role === 'demo') {
        setItems([]);
        setLoadingProducts(false);
        return;
    }
    try {
        // جلب أحدث بيانات للأصناف لضمان دقة الرصيد
        const { data: latestProducts } = await supabase.from('products').select('*');
        
        const productsSource = latestProducts || products;

        const warehouseProducts = productsSource
            .filter((p: any) => p.item_type === 'STOCK' || !p.item_type) // استبعاد الخدمات (SERVICE)
            .map((p: any) => {
                // محاولة الحصول على الرصيد: أولاً من رصيد المستودع المحدد، ثم من الرصيد العام
                let currentQty = 0;
                
                // استخدام الحقل القياسي warehouse_stock
                let wStock = p.warehouse_stock || {};

                // التحقق بدقة من وجود رصيد للمستودع
                if (wStock && typeof wStock === 'object' && wStock[warehouseId] !== undefined) {
                    currentQty = Number(wStock[warehouseId]);
                } else {
                    // إذا لم يوجد رصيد مخصص، نستخدم الرصيد العام (stock)
                    // نتأكد من أن القيمة رقم صحيح
                    currentQty = Number(p.stock || 0);
                }

                return {
                    productId: p.id,
                    productName: p.name,
                    systemQty: currentQty,
                    actualQty: currentQty,
                    difference: 0,
                    notes: ''
                };
            });
        setItems(warehouseProducts);
    } catch (error) {
        console.error("Error fetching products:", error);
        showToast("حدث خطأ أثناء جلب بيانات الأصناف", 'error');
    } finally {
        setLoadingProducts(false);
    }
  };

  const handleQuantityChange = (productId: string, actualQty: number) => {
      setItems(prev => prev.map(item => {
          if (item.productId === productId) {
              return { ...item, actualQty, difference: actualQty - item.systemQty };
          }
          return item;
      }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!warehouseId || items.length === 0) return;

    setSaving(true);
    try {
        const countNumber = `CNT-${Date.now().toString().slice(-6)}`;

        // 1. حفظ رأس الجرد
        const { data: countDoc, error: countError } = await supabase.from('inventory_counts').insert({
            warehouse_id: warehouseId,
            count_date: date,
            count_number: countNumber,
            status: 'draft',
            notes: 'جرد يدوي من النظام'
        }).select().single();

        if (countError) throw countError;

        // 2. حفظ تفاصيل الجرد
        const countItems = items.map(item => ({
            inventory_count_id: countDoc.id,
            product_id: item.productId,
            system_qty: item.systemQty,
            actual_qty: item.actualQty,
            difference: item.difference
        }));

        const { error: itemsError } = await supabase.from('inventory_count_items').insert(countItems);

        if (itemsError) throw itemsError;

        showToast('تم حفظ الجرد بنجاح ✅', 'success');
        setItems([]);
        setWarehouseId('');
        navigate('/inventory-history');
        
    } catch (error: any) {
        console.error(error);
        showToast('حدث خطأ أثناء الحفظ: ' + error.message, 'error');
    } finally {
        setSaving(false);
    }
  };

  const filteredItems = useMemo(() => {
      return items.filter(i => i.productName.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [items, searchTerm]);

  const totalValueDiff = useMemo(() => {
      return items.reduce((sum, item) => {
          const product = products.find(p => p.id === item.productId);
          const cost = product?.purchase_price || 0;
          return sum + (item.difference * cost);
      }, 0);
  }, [items, products]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
            <h2 className="text-3xl font-black text-slate-800 flex items-center gap-3">
                <Calculator className="text-purple-600 w-8 h-8" /> جرد مخزني (مطابقة فعلية)
            </h2>
            <p className="text-slate-500 font-medium font-bold">مقارنة الرصيد الدفتري بالواقع الفعلي وتعديل الفروقات</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
              <div>
                  <label className="block text-xs font-black text-slate-400 mb-2 uppercase tracking-widest">مستودع الجرد</label>
                  <select 
                    value={warehouseId} 
                    onChange={e => setWarehouseId(e.target.value)}
                    disabled={items.length > 0}
                    className="w-full border-2 border-slate-50 rounded-2xl px-4 py-3 font-bold text-slate-700 focus:border-purple-500 outline-none bg-slate-50 appearance-none shadow-inner"
                  >
                      <option value="">-- اختر الموقع --</option>
                      {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
              </div>
              <div>
                  <label className="block text-xs font-black text-slate-400 mb-2 uppercase tracking-widest">تاريخ الجرد</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full border-2 border-slate-50 rounded-2xl px-4 py-3 font-bold text-slate-700 outline-none focus:border-purple-500 shadow-inner" />
              </div>
              <div className="flex gap-2">
                  {items.length === 0 ? (
                      <>
                        <button onClick={handleStartCount} disabled={loadingProducts} className="flex-1 bg-purple-600 text-white py-3 rounded-2xl font-black shadow-lg shadow-purple-100 hover:bg-purple-700 transition-all flex items-center justify-center gap-2 disabled:opacity-70">
                            {loadingProducts ? <Loader2 className="animate-spin" size={20} /> : <RefreshCw size={20} />} 
                            {loadingProducts ? 'جاري التحضير...' : 'بدء جرد جديد'}
                        </button>
                        <button onClick={recalculateStock} className="px-4 py-3 bg-slate-100 text-slate-600 rounded-2xl hover:bg-slate-200 transition-colors" title="إعادة احتساب الأرصدة من العمليات السابقة">
                            <RefreshCw size={20} className={loadingProducts ? "animate-spin" : ""} />
                        </button>
                      </>
                  ) : (
                      <button onClick={() => setItems([])} className="w-full bg-red-50 text-red-600 py-3 rounded-2xl font-black border border-red-100 hover:bg-red-100 transition-all">
                          إلغاء الجرد
                      </button>
                  )}
              </div>
          </div>

          {items.length > 0 && (
              <div className="mt-8 animate-in fade-in slide-in-from-bottom-4">
                  <div className="bg-white p-4 rounded-t-[32px] border-x border-t border-slate-200 flex justify-between items-center">
                      <div className="relative w-72">
                          <Search className="absolute right-3 top-2.5 text-slate-400" size={18} />
                          <input 
                            type="text" 
                            placeholder="ابحث عن صنف..." 
                            value={searchTerm} 
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pr-10 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-purple-500 outline-none font-bold" 
                          />
                      </div>
                      <div className={`px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 ${totalValueDiff >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                          {totalValueDiff >= 0 ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                          صافي قيمة الفروقات: {totalValueDiff.toLocaleString()} {settings?.currency || 'ج.م'}
                      </div>
                  </div>
                  <div className="bg-white border-x border-slate-200 overflow-hidden">
                      <table className="w-full text-right text-sm">
                          <thead className="bg-slate-50 text-slate-500 font-bold border-y border-slate-100">
                              <tr>
                                  <th className="py-4 px-6">الصنف</th>
                                  <th className="py-4 px-6 text-center">الرصيد الدفتري</th>
                                  <th className="py-4 px-6 text-center">الرصيد الفعلي</th>
                                  <th className="py-4 px-6 text-center">الفرق (الكمية)</th>
                                  <th className="py-4 px-6 text-center">قيمة الفرق</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                              {filteredItems.map((item, idx) => (
                                  <tr key={item.productId} className="hover:bg-slate-50/50 transition-colors">
                                      <td className="py-4 px-6 font-bold text-slate-800">{item.productName}</td>
                                      <td className="py-4 px-6 text-center font-mono text-slate-500">{item.systemQty}</td>
                                      <td className="py-4 px-6 text-center">
                                          <input 
                                            type="number" 
                                            value={item.actualQty} 
                                            onChange={e => handleQuantityChange(item.productId, parseFloat(e.target.value))}
                                            className="w-24 text-center border-2 border-slate-100 rounded-xl py-1.5 font-bold focus:border-purple-500 outline-none bg-slate-50 focus:bg-white transition-all"
                                          />
                                      </td>
                                      <td className={`py-4 px-6 text-center font-bold ${item.difference === 0 ? 'text-slate-300' : item.difference > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                          {item.difference > 0 ? '+' : ''}{item.difference}
                                      </td>
                                      <td className="py-4 px-6 text-center font-mono text-slate-600">
                                          {(item.difference * (products.find(p => p.id === item.productId)?.purchase_price || 0)).toLocaleString()}
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
                  <div className="bg-slate-900 p-6 rounded-b-[32px] flex justify-between items-center text-white">
                      <p className="text-sm font-bold opacity-60">سيتم حفظ هذا الجرد كمسودة حتى تقوم باعتماده من صفحة سجل الجرود.</p>
                      <button onClick={handleSubmit} disabled={saving} className="bg-purple-500 hover:bg-purple-400 text-white px-10 py-3 rounded-2xl font-black shadow-xl shadow-purple-900/50 flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50">
                          {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />} 
                          {saving ? 'جاري الحفظ...' : 'حفظ المسودة'}
                      </button>
                  </div>
              </div>
          )}
      </div>
    </div>
  );
};

export default InventoryCountForm;
