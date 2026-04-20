import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { Calculator, Save, Search, CheckCircle2, AlertTriangle, Loader2, Utensils, RefreshCw } from 'lucide-react';
import { z } from 'zod';

const KitchenEndDayCount = () => {
  const navigate = useNavigate();
  const { products, warehouses, settings, recalculateStock, currentUser, addEntry, getSystemAccount } = useAccounting();
  const { showToast } = useToast();
  const [warehouseId, setWarehouseId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [items, setItems] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Set default warehouse if only one exists or find one named 'Kitchen' or 'المطبخ'
  useEffect(() => {
    if (warehouses.length > 0 && !warehouseId) {
        const kitchenWh = warehouses.find(w => w.name.includes('مطبخ') || w.name.includes('Kitchen'));
        if (kitchenWh) {
            setWarehouseId(kitchenWh.id);
        } else {
            setWarehouseId(warehouses[0].id);
        }
    }
  }, [warehouses]);

  const handleStartCount = async () => {
    if (!warehouseId) {
      showToast('الرجاء اختيار المستودع أولاً', 'warning');
      return;
    }
    
    setLoadingProducts(true);
    if (currentUser?.role === 'demo') {
        setItems([
            { productId: '1', productName: 'صوص شيدر (كيس)', systemQty: 5, actualQty: 4.5, difference: -0.5, unit: 'كيس' },
            { productId: '2', productName: 'خبز برجر', systemQty: 100, actualQty: 95, difference: -5, unit: 'قطعة' },
        ]);
        setLoadingProducts(false);
        return;
    }
    try {
        const { data: latestProducts } = await supabase.from('products')
            .select('*')
            .in('product_type', ['RAW_MATERIAL', 'STOCK']) // Focus on raw materials
            .eq('is_active', true);
        
        const productsSource = latestProducts || products;

        const warehouseProducts = productsSource
            .map((p: any) => {
                let currentQty = 0;
                let wStock = p.warehouse_stock || {};
                if (wStock && typeof wStock === 'object' && wStock[warehouseId] !== undefined) {
                    currentQty = Number(wStock[warehouseId]);
                } else {
                    currentQty = Number(p.stock || 0);
                }

                return {
                    productId: p.id,
                    productName: p.name,
                    systemQty: currentQty,
                    actualQty: currentQty,
                    difference: 0,
                    cost: p.purchase_price || p.cost || 0,
                    unit: p.unit || 'وحدة',
                    notes: ''
                };
            });
        setItems(warehouseProducts);
    } catch (error) {
        console.error("Error fetching products:", error);
        showToast("حدث خطأ أثناء جلب بيانات المواد الخام", 'error');
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

  const handleNotesChange = (productId: string, notes: string) => {
      setItems(prev => prev.map(item => {
          if (item.productId === productId) {
              return { ...item, notes };
          }
          return item;
      }));
  };

  const handleClearDifferences = () => {
      if (items.length === 0) return;
      if (!window.confirm('هل تريد ضبط الرصيد الفعلي ليكون مساوياً للرصيد المتوقع لجميع الأصناف؟')) return;
      
      setItems(prev => prev.map(item => ({
          ...item,
          actualQty: item.systemQty,
          difference: 0
      })));
  };

  const handleSaveAndReconcile = async () => {
    if (items.length === 0) return;
    if (!window.confirm('هل أنت متأكد من ترحيل الجرد وتسوية الفروقات فوراً؟\nسيتم تعديل الأرصدة وإنشاء القيود المحاسبية.')) return;

    setSaving(true);
    try {
        const countNumber = `KIT-CNT-${Date.now().toString().slice(-6)}`;

        // 1. Create Inventory Count Header
        const { data: countDoc, error: countError } = await supabase.from('inventory_counts').insert({
            warehouse_id: warehouseId,
            count_date: date,
            count_number: countNumber,
            status: 'posted', // Directly posted
            notes: 'جرد نهاية اليوم للمطبخ (تسوية تلقائية)',
            organization_id: (currentUser as any)?.organization_id
        }).select().single();

        if (countError) throw countError;

        // 2. Create Items
        const countItemsData = items.map(item => ({
            inventory_count_id: countDoc.id,
            product_id: item.productId,
            system_qty: item.systemQty,
            actual_qty: item.actualQty,
            difference: item.difference,
            organization_id: (currentUser as any)?.organization_id,
            notes: item.notes
        }));

        const { error: itemsError } = await supabase.from('inventory_count_items').insert(countItemsData);
        if (itemsError) throw itemsError;

        // 3. Create Stock Adjustment for differences
        const adjustmentItems = items.filter(i => i.difference !== 0);
        let totalAdjustmentValue = 0;

        if (adjustmentItems.length > 0) {
            const adjustmentNumber = `ADJ-${countNumber}`;
            const { data: adjDoc, error: adjError } = await supabase.from('stock_adjustments').insert({
                warehouse_id: warehouseId,
                adjustment_date: date,
                adjustment_number: adjustmentNumber,
                reason: `فروقات جرد مطبخ ${date}`,
                status: 'posted',
                organization_id: (currentUser as any)?.organization_id
            }).select().single();

            if (adjError) throw adjError;

            const adjLines = adjustmentItems.map(i => {
                totalAdjustmentValue += (Number(i.difference) * Number(i.cost));
                return {
                    stock_adjustment_id: adjDoc.id,
                    product_id: i.productId,
                    quantity: i.difference,
                    organization_id: (currentUser as any)?.organization_id
                };
            });

            await supabase.from('stock_adjustment_items').insert(adjLines);
        }

        // 4. Create Journal Entry
        if (Math.abs(totalAdjustmentValue) > 0.01) {
            const inventoryAcc = getSystemAccount('INVENTORY_FINISHED_GOODS') || getSystemAccount('INVENTORY');
            const adjustmentAcc = getSystemAccount('INVENTORY_ADJUSTMENTS'); // Should map to Cost of Goods Sold or Wastage

            if (inventoryAcc && adjustmentAcc) {
                const lines = [];
                if (totalAdjustmentValue > 0) {
                    // Gain
                    lines.push({ accountId: inventoryAcc.id, debit: totalAdjustmentValue, credit: 0, description: `زيادة جرد مطبخ ${date}` });
                    lines.push({ accountId: adjustmentAcc.id, debit: 0, credit: totalAdjustmentValue, description: 'فروقات جرد (زيادة)' });
                } else {
                    // Loss
                    lines.push({ accountId: adjustmentAcc.id, debit: Math.abs(totalAdjustmentValue), credit: 0, description: 'فروقات جرد (هالك/استهلاك)' });
                    lines.push({ accountId: inventoryAcc.id, debit: 0, credit: Math.abs(totalAdjustmentValue), description: `عجز جرد مطبخ ${date}` });
                }
                
                await addEntry({ 
                    date: date, 
                    reference: `JE-${countNumber}`, 
                    description: `تسوية فروقات جرد مطبخ ${date}`, 
                    status: 'posted', 
                    lines: lines 
                });
            }
        }

        await recalculateStock();
        showToast('تم حفظ الجرد وتسوية الأرصدة بنجاح ✅', 'success');
        setItems([]);
        navigate('/inventory-history');

    } catch (error: any) {
        console.error(error);
        showToast('حدث خطأ: ' + error.message, 'error');
    } finally {
        setSaving(false);
    }
  };

  const filteredItems = useMemo(() => {
      return items.filter(i => i.productName.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [items, searchTerm]);

  return (
    <div className="space-y-6 animate-in fade-in">
        <div className="flex justify-between items-center">
            <div>
                <h2 className="text-3xl font-black text-slate-800 flex items-center gap-3">
                    <Utensils className="text-orange-600 w-8 h-8" /> جرد نهاية اليوم (المطبخ)
                </h2>
                <p className="text-slate-500 font-medium">تسوية أرصدة المواد الخام المفتوحة والهالك اليومي</p>
            </div>
        </div>

        <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-200">
            <div className="flex flex-col md:flex-row gap-4 items-end mb-6">
                <div className="flex-1 w-full">
                    <label className="block text-xs font-black text-slate-400 mb-2 uppercase tracking-widest">المستودع (المطبخ)</label>
                    <select 
                        value={warehouseId} 
                        onChange={e => setWarehouseId(e.target.value)}
                        disabled={items.length > 0}
                        className="w-full border-2 border-slate-100 rounded-2xl px-4 py-3 font-bold text-slate-700 focus:border-orange-500 outline-none bg-slate-50"
                    >
                        {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                </div>
                <div className="flex-1 w-full">
                    <label className="block text-xs font-black text-slate-400 mb-2 uppercase tracking-widest">تاريخ اليوم</label>
                    <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full border-2 border-slate-100 rounded-2xl px-4 py-3 font-bold text-slate-700 outline-none focus:border-orange-500" />
                </div>
                <button 
                    onClick={handleStartCount} 
                    disabled={items.length > 0 || loadingProducts}
                    className="bg-orange-600 text-white px-8 py-3 rounded-2xl font-black hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                    {loadingProducts ? <Loader2 className="animate-spin" /> : <Utensils size={20} />}
                    بدء الجرد
                </button>
            </div>

            {items.length > 0 && (
                <>
                    <div className="mb-4 relative">
                        <Search className="absolute right-3 top-3 text-slate-400" size={20} />
                        <input 
                            type="text" 
                            placeholder="بحث عن مادة خام..." 
                            value={searchTerm} 
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pr-10 pl-4 py-3 border-2 border-slate-100 rounded-2xl focus:border-orange-500 outline-none font-bold"
                        />
                    </div>

                    <div className="overflow-hidden border border-slate-200 rounded-2xl">
                        <table className="w-full text-right">
                            <thead className="bg-slate-50 text-slate-500 font-bold text-sm">
                                <tr>
                                    <th className="py-4 px-6">المادة الخام</th>
                                    <th className="py-4 px-6 text-center">الرصيد المتوقع</th>
                                    <th className="py-4 px-6 text-center">الرصيد الفعلي (نهاية اليوم)</th>
                                    <th className="py-4 px-6 text-center">الفارق (استهلاك/هالك)</th>
                                    <th className="py-4 px-6 text-right">ملاحظات (سبب العجز)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredItems.map(item => (
                                    <tr key={item.productId} className="hover:bg-orange-50/10 transition-colors">
                                        <td className="py-4 px-6 font-bold text-slate-800">
                                            {item.productName}
                                            <span className="block text-xs text-slate-400 font-normal">{item.unit}</span>
                                        </td>
                                        <td className="py-4 px-6 text-center font-mono text-slate-500">{item.systemQty}</td>
                                        <td className="py-4 px-6 text-center">
                                            <input 
                                                type="number" 
                                                step="0.01"
                                                value={item.actualQty} 
                                                onChange={e => handleQuantityChange(item.productId, parseFloat(e.target.value))}
                                                className="w-24 text-center border-2 border-slate-200 rounded-xl py-2 font-bold focus:border-orange-500 outline-none"
                                            />
                                        </td>
                                        <td className={`py-4 px-6 text-center font-bold ${item.difference < 0 ? 'text-red-500' : item.difference > 0 ? 'text-emerald-500' : 'text-slate-400'}`}>
                                            {item.difference.toFixed(2)}
                                        </td>
                                        <td className="py-4 px-6">
                                            <input 
                                                type="text" 
                                                placeholder="سبب العجز/الزيادة..." 
                                                value={item.notes || ''} 
                                                onChange={e => handleNotesChange(item.productId, e.target.value)}
                                                className="w-full border-2 border-slate-100 rounded-xl py-2 px-3 text-sm focus:border-orange-500 outline-none transition-colors"
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="mt-6 flex justify-end gap-3">
                        <button onClick={() => setItems([])} className="px-6 py-3 rounded-2xl font-bold text-slate-600 hover:bg-slate-100 transition-colors">
                            إلغاء
                        </button>
                        <button 
                            onClick={handleClearDifferences}
                            className="bg-blue-100 text-blue-700 px-6 py-3 rounded-2xl font-bold hover:bg-blue-200 transition-colors flex items-center gap-2"
                        >
                            <RefreshCw size={20} />
                            تصفير الفروقات
                        </button>
                        <button 
                            onClick={handleSaveAndReconcile}
                            disabled={saving}
                            className="bg-emerald-600 text-white px-8 py-3 rounded-2xl font-black shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all flex items-center gap-2 disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="animate-spin" /> : <CheckCircle2 size={20} />}
                            اعتماد وترحيل الفروقات
                        </button>
                    </div>
                </>
            )}
        </div>
    </div>
  );
};

export default KitchenEndDayCount;