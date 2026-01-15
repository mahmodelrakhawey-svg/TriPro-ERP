﻿import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { Save, Plus, Trash2, AlertTriangle, Search, Loader2, Package } from 'lucide-react';

const StockAdjustmentForm = () => {
  const location = useLocation();
  const { warehouses, products, recalculateStock, addEntry, accounts, getSystemAccount } = useAccounting();
  const [warehouseId, setWarehouseId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');

  useEffect(() => {
    if (location.state?.productId && products.length > 0) {
        const product = products.find(p => p.id === location.state.productId);
        if (product) {
            setItems(prev => {
                if (prev.find(i => i.productId === product.id)) return prev;
                return [...prev, {
                    productId: product.id,
                    productName: product.name,
                    quantity: 0,
                    type: 'in'
                }];
            });
        }
    }
  }, [location.state, products]);

  const handleAddItem = () => {
    if (!selectedProductId) return;
    const product = products.find(p => p.id === selectedProductId);
    if (!product) return;

    if (items.find(i => i.productId === selectedProductId)) {
        alert('الصنف موجود بالفعل في القائمة');
        return;
    }

    setItems([...items, {
        productId: product.id,
        productName: product.name,
        quantity: 0,
        type: 'in' // in (increase) or out (decrease)
    }]);
    setSelectedProductId('');
  };

  const handleRemoveItem = (index: number) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);
  };

  const handleQuantityChange = (index: number, qty: number) => {
    const newItems = [...items];
    newItems[index].quantity = qty;
    setItems(newItems);
  };

  const handleTypeChange = (index: number, type: string) => {
    const newItems = [...items];
    newItems[index].type = type;
    setItems(newItems);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!warehouseId) {
        alert('الرجاء اختيار المستودع');
        return;
    }

    if (items.length === 0) {
        alert('الرجاء إضافة أصناف للقائمة أولاً (اضغط على زر + بجانب الصنف لإضافته للجدول)');
        return;
    }

    setLoading(true);
    try {
        const adjustmentNumber = `ADJ-${Date.now().toString().slice(-6)}`;

        // 1. Create Header
        const { data: header, error: headerError } = await supabase.from('stock_adjustments').insert({
            warehouse_id: warehouseId,
            adjustment_date: date,
            reason: reason,
            adjustment_number: adjustmentNumber,
            status: 'posted' // Direct posting for simplicity, or draft
        }).select().single();

        if (headerError) throw headerError;

        // 2. Create Items
        const dbItems = items.map(item => ({
            stock_adjustment_id: header.id,
            product_id: item.productId,
            quantity: item.type === 'in' ? Math.abs(item.quantity) : -Math.abs(item.quantity)
        }));

        const { error: itemsError } = await supabase.from('stock_adjustment_items').insert(dbItems);
        if (itemsError) throw itemsError;

        // 3. Recalculate Stock
        await recalculateStock();

        // 4. Create Journal Entry (إنشاء القيد المحاسبي)
        let totalValue = 0;
        items.forEach(item => {
            const product = products.find(p => p.id === item.productId);
            const cost = product?.purchase_price || product?.cost || 0;
            const qty = parseFloat(item.quantity);
            // إذا كانت زيادة (in) تضاف للقيمة، وإذا عجز (out) تطرح
            totalValue += (item.type === 'in' ? 1 : -1) * qty * cost;
        });

        if (totalValue !== 0) {
            const inventoryAcc = getSystemAccount('INVENTORY_FINISHED_GOODS') || getSystemAccount('INVENTORY') || accounts.find(a => a.code === '10302' || a.code === '103');
            const adjustmentAcc = getSystemAccount('INVENTORY_ADJUSTMENTS') || accounts.find(a => a.code === '510');

            if (inventoryAcc && adjustmentAcc) {
                const lines = [];
                if (totalValue > 0) {
                    // زيادة (Gain): من ح/ المخزون إلى ح/ تسويات (إيراد/تخفيض مصروف)
                    lines.push({ accountId: inventoryAcc.id, debit: totalValue, credit: 0, description: 'زيادة مخزنية - تسوية' });
                    lines.push({ accountId: adjustmentAcc.id, debit: 0, credit: totalValue, description: 'أرباح/فروقات تسوية مخزنية' });
                } else {
                    // عجز (Loss): من ح/ تسويات (مصروف) إلى ح/ المخزون
                    lines.push({ accountId: adjustmentAcc.id, debit: Math.abs(totalValue), credit: 0, description: 'خسائر/فروقات تسوية مخزنية' });
                    lines.push({ accountId: inventoryAcc.id, debit: 0, credit: Math.abs(totalValue), description: 'عجز مخزني - تسوية' });
                }
                
                await addEntry({ date: date, reference: adjustmentNumber, description: `تسوية مخزنية رقم ${adjustmentNumber} - ${reason}`, status: 'posted', lines: lines });
            } else {
                alert('تنبيه: تم حفظ التسوية ولكن لم يتم إنشاء القيد المحاسبي لعدم العثور على الحسابات المطلوبة.');
            }
        }

        alert('تم حفظ التسوية المخزنية بنجاح ✅');
        setItems([]);
        setReason('');
        // Optional: Reset warehouse or keep it
    } catch (error: any) {
        console.error(error);
        alert('حدث خطأ: ' + error.message);
    } finally {
        setLoading(false);
    }
  };

  // Filter products for search
  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center">
        <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <AlertTriangle className="text-amber-500" /> تسوية مخزنية (تالف / عجز / زيادة)
            </h2>
            <p className="text-slate-500">تسجيل الفروقات المخزنية يدوياً (تالف، سرقة، هدايا، تسويات)</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">المستودع</label>
                <select 
                    value={warehouseId}
                    onChange={e => setWarehouseId(e.target.value)}
                    className="w-full border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                    required
                >
                    <option value="">-- اختر المستودع --</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
            </div>
            <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">تاريخ التسوية</label>
                <input 
                    type="date" 
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                    required
                />
            </div>
            <div className="md:col-span-2">
                <label className="block text-sm font-bold text-slate-700 mb-1">سبب التسوية / ملاحظات</label>
                <input 
                    type="text" 
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="مثال: جرد شهري، بضاعة تالفة، ..."
                    className="w-full border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                    required
                />
            </div>
        </div>

        <div className="border-t pt-6">
            <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                <Package size={20} /> إضافة الأصناف
            </h3>
            
            <div className="flex gap-2 mb-4">
                <div className="flex-1 relative">
                    <Search className="absolute right-3 top-3 text-slate-400" size={18} />
                    <select 
                        value={selectedProductId}
                        onChange={e => setSelectedProductId(e.target.value)}
                        className="w-full border rounded-lg p-2.5 pr-10 outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                    >
                        <option value="">بحث عن صنف لإضافته...</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name} (الرصيد: {p.stock})</option>)}
                    </select>
                </div>
                <button 
                    type="button" 
                    onClick={handleAddItem}
                    className="bg-blue-50 text-blue-600 px-4 rounded-lg hover:bg-blue-100 font-bold"
                >
                    <Plus />
                </button>
            </div>

            {items.length > 0 ? (
                <table className="w-full text-right border rounded-lg overflow-hidden">
                    <thead className="bg-slate-50 text-slate-600 font-bold text-sm">
                        <tr>
                            <th className="p-3">الصنف</th>
                            <th className="p-3">نوع الحركة</th>
                            <th className="p-3">الكمية</th>
                            <th className="p-3 w-10"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {items.map((item, idx) => (
                            <tr key={idx}>
                                <td className="p-3 font-medium">{item.productName}</td>
                                <td className="p-3">
                                    <select 
                                        value={item.type}
                                        onChange={e => handleTypeChange(idx, e.target.value)}
                                        className={`border rounded px-2 py-1 font-bold text-sm ${item.type === 'in' ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50'}`}
                                    >
                                        <option value="in">زيادة (+)</option>
                                        <option value="out">عجز / صرف (-)</option>
                                    </select>
                                </td>
                                <td className="p-3">
                                    <input 
                                        type="number" 
                                        min="0"
                                        step="0.01"
                                        value={item.quantity}
                                        onChange={e => handleQuantityChange(idx, parseFloat(e.target.value))}
                                        className="w-24 border rounded px-2 py-1 text-center font-bold"
                                    />
                                </td>
                                <td className="p-3 text-center">
                                    <button type="button" onClick={() => handleRemoveItem(idx)} className="text-red-500 hover:bg-red-50 p-1 rounded">
                                        <Trash2 size={18} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <div className="text-center py-8 text-slate-400 border-2 border-dashed rounded-lg">
                    لا توجد أصناف مضافة
                </div>
            )}
        </div>

        <div className="flex justify-end pt-4">
            <button 
                type="submit" 
                disabled={loading}
                className="bg-amber-500 text-white px-8 py-3 rounded-xl font-bold hover:bg-amber-600 flex items-center gap-2 shadow-lg shadow-amber-200 transition-all"
            >
                {loading ? <Loader2 className="animate-spin" /> : <Save size={20} />}
                حفظ وترحيل التسوية
            </button>
        </div>
      </form>
    </div>
  );
};

export default StockAdjustmentForm;