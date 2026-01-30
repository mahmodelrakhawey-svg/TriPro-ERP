﻿﻿﻿﻿﻿import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { History, Eye, CheckCircle, Clock, X, Package, AlertTriangle, Check, Loader2 } from 'lucide-react';

// --- Modal Component to show count details ---
const CountDetailsModal = ({ count, items, onClose, onPost, isLoading }: { count: any, items: any[], onClose: () => void, onPost: (id: string) => void, isLoading: boolean }) => {
  const [showDiscrepanciesOnly, setShowDiscrepanciesOnly] = useState(false);

  if (!count) return null;

  const totalValueDiff = items.reduce((sum, item) => {
    const diff = (item.actual_qty || 0) - (item.system_qty || 0);
    const cost = item.products?.purchase_price || 0;
    return sum + (diff * cost);
  }, 0);

  const filteredItems = showDiscrepanciesOnly 
    ? items.filter(item => ((item.actual_qty || 0) - (item.system_qty || 0)) !== 0)
    : items;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
        <div className="bg-slate-50 px-6 py-4 border-b flex justify-between items-center">
          <div>
            <h3 className="font-bold text-lg text-slate-800">تفاصيل الجرد: {count.count_number}</h3>
            <p className="text-sm text-slate-500">المستودع: {count.warehouses?.name} | التاريخ: {count.count_date}</p>
          </div>
          <div className="flex items-center gap-3">
             <label className={`flex items-center gap-2 text-xs font-bold cursor-pointer select-none px-3 py-2 rounded-lg border transition-all shadow-sm ${showDiscrepanciesOnly ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'}`}>
                <input 
                    type="checkbox" 
                    checked={showDiscrepanciesOnly} 
                    onChange={(e) => setShowDiscrepanciesOnly(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-gray-300 cursor-pointer accent-blue-600"
                />
                عرض الفروقات فقط
             </label>
             <button onClick={onClose} className="p-1 hover:bg-red-50 rounded-full transition-colors"><X className="text-slate-400 hover:text-red-500" /></button>
          </div>
        </div>
        
        <div className="p-6 max-h-[70vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center items-center h-48"><Loader2 className="animate-spin text-blue-500" size={32} /></div>
          ) : (
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-100 text-slate-600 font-bold">
                <tr>
                  <th className="p-3 rounded-r-lg">الصنف</th>
                  <th className="p-3 text-center">الرصيد الدفتري</th>
                  <th className="p-3 text-center">الرصيد الفعلي</th>
                  <th className="p-3 text-center">الفرق</th>
                  <th className="p-3 text-center rounded-l-lg">قيمة الفرق</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map(item => {
                  const diff = (item.actual_qty || 0) - (item.system_qty || 0);
                  const cost = item.products?.purchase_price || 0;
                  const valueDiff = diff * cost;
                  return (
                    <tr key={item.id}>
                      <td className="p-3 font-medium text-slate-800 flex items-center gap-2"><Package size={14} className="text-slate-400"/>{item.products?.name || 'صنف محذوف'}</td>
                      <td className="p-3 text-center font-mono text-slate-500">{item.system_qty}</td>
                      <td className="p-3 text-center font-mono font-bold text-blue-600">{item.actual_qty}</td>
                      <td className={`p-3 text-center font-mono font-bold ${diff === 0 ? 'text-slate-400' : diff > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {diff > 0 ? `+${diff}` : diff}
                      </td>
                      <td className="p-3 text-center font-mono text-slate-600">{valueDiff.toLocaleString()}</td>
                    </tr>
                  );
                })}
                {filteredItems.length === 0 && (
                    <tr><td colSpan={5} className="p-8 text-center text-slate-400">لا توجد أصناف للعرض</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-slate-50 px-6 py-4 border-t flex justify-between items-center">
            <div className={`px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 ${totalValueDiff >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                {totalValueDiff >= 0 ? <Check size={16} /> : <AlertTriangle size={16} />}
                صافي قيمة الفروقات: {totalValueDiff.toLocaleString()}
            </div>
            {count.status === 'draft' && (
                <button 
                    onClick={() => onPost(count.id)}
                    className="bg-emerald-600 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-emerald-700"
                >
                    <CheckCircle size={18} /> اعتماد وترحيل التسوية
                </button>
            )}
        </div>
      </div>
    </div>
  );
};

const InventoryCountList = () => {
  const { recalculateStock, addEntry, accounts, products, getSystemAccount, currentUser } = useAccounting();
  const [counts, setCounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCount, setSelectedCount] = useState<any | null>(null);
  const [countItems, setCountItems] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isItemsLoading, setIsItemsLoading] = useState(false);

  const fetchCounts = async () => {
    setLoading(true);
    if (currentUser?.role === 'demo') {
        setCounts([]);
        setLoading(false);
        return;
    }

    const { data } = await supabase
      .from('inventory_counts')
      .select('*, warehouses(name)')
      .order('created_at', { ascending: false });
    if (data) setCounts(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchCounts();
  }, []);

  const handleViewDetails = async (count: any) => {
    setSelectedCount(count);
    setIsModalOpen(true);
    setIsItemsLoading(true);
    
    // ملاحظة: هذا يفترض وجود جدول `inventory_count_items`
    const { data, error } = await supabase
      .from('inventory_count_items')
      .select('*, products(name, sku, purchase_price)')
      .eq('inventory_count_id', count.id);

    if (error) {
        console.error("Error fetching count items:", error);
        alert("فشل في جلب تفاصيل الجرد. قد يكون جدول inventory_count_items غير موجود أو أن نموذج الجرد لم يحفظ الأصناف.");
        setCountItems([]);
    } else {
        setCountItems(data || []);
    }
    setIsItemsLoading(false);
  };

  const handlePostCount = async (countId: string) => {
    if (!window.confirm('هل أنت متأكد من ترحيل هذا الجرد؟ سيتم إنشاء تسوية مخزنية وقيد محاسبي بالفروقات.')) return;
    if (currentUser?.role === 'demo') {
        alert('تم ترحيل الجرد بنجاح ✅ (محاكاة)');
        setIsModalOpen(false);
        return;
    }
    
    try {
        // 1. جلب بيانات الجرد والتفاصيل
        const { data: count } = await supabase.from('inventory_counts').select('*').eq('id', countId).single();
        // جلب التكلفة الحالية للمنتجات مباشرة من قاعدة البيانات لضمان الدقة
        const { data: items } = await supabase.from('inventory_count_items').select('*, products(purchase_price, cost)').eq('inventory_count_id', countId);
        
        if (!count || !items) throw new Error("بيانات الجرد غير مكتملة");

        // 2. تصفية الأصناف التي بها فروقات
        const adjustmentItems = items.filter((i: any) => i.difference !== 0);

        let totalAdjustmentValue = 0;
        if (adjustmentItems.length > 0) {
            // إنشاء تسوية مخزنية تلقائية
            const adjustmentNumber = `ADJ-CNT-${count.count_number}`;
            const { data: adjDoc, error: adjError } = await supabase.from('stock_adjustments').insert({
                warehouse_id: count.warehouse_id,
                adjustment_date: new Date().toISOString().split('T')[0],
                adjustment_number: adjustmentNumber,
                reason: `تسوية تلقائية ناتجة عن الجرد رقم ${count.count_number}`,
                status: 'posted'
            }).select().single();

            if (adjError) throw adjError;

            const adjLines = adjustmentItems.map((i: any) => {
                // حساب القيمة للقيد المحاسبي
                const cost = i.products?.purchase_price || i.products?.cost || 0;
                totalAdjustmentValue += (Number(i.difference) * cost);

                return {
                    stock_adjustment_id: adjDoc.id,
                    product_id: i.product_id,
                    quantity: i.difference // الموجب يزيد المخزون، السالب ينقصه
                };
            });

            const { error: linesError } = await supabase.from('stock_adjustment_items').insert(adjLines);
            if (linesError) throw linesError;
        }

        // 3. تحديث حالة الجرد
        const { error: updateError } = await supabase.from('inventory_counts').update({ status: 'posted' }).eq('id', countId);
        if (updateError) throw updateError;

        await recalculateStock();

        // 4. إنشاء القيد المحاسبي (Journal Entry)
        if (Math.abs(totalAdjustmentValue) > 0.01) {
            const inventoryAcc = getSystemAccount('INVENTORY_FINISHED_GOODS') || getSystemAccount('INVENTORY') || accounts.find(a => a.code === '10302' || a.code === '103');
            const adjustmentAcc = getSystemAccount('INVENTORY_ADJUSTMENTS') || accounts.find(a => a.code === '510');

            if (inventoryAcc && adjustmentAcc) {
                const lines = [];
                if (totalAdjustmentValue > 0) {
                    lines.push({ accountId: inventoryAcc.id, debit: totalAdjustmentValue, credit: 0, description: `زيادة جرد ${count.count_number}` });
                    lines.push({ accountId: adjustmentAcc.id, debit: 0, credit: totalAdjustmentValue, description: 'فروقات جرد (زيادة)' });
                } else {
                    lines.push({ accountId: adjustmentAcc.id, debit: Math.abs(totalAdjustmentValue), credit: 0, description: 'فروقات جرد (عجز)' });
                    lines.push({ accountId: inventoryAcc.id, debit: 0, credit: Math.abs(totalAdjustmentValue), description: `عجز جرد ${count.count_number}` });
                }
                
                await addEntry({ date: new Date().toISOString().split('T')[0], reference: `ADJ-CNT-${count.count_number}`, description: `تسوية فروقات جرد رقم ${count.count_number}`, status: 'posted', lines: lines });
            } else {
                alert('تنبيه: تم ترحيل الجرد ولكن لم يتم إنشاء القيد المحاسبي لعدم العثور على حسابات المخزون (10302) أو التسويات (510).');
            }
        } else if (adjustmentItems.length > 0) {
            alert('تنبيه: تم ترحيل الجرد وتحديث الكميات، ولكن لم يتم إنشاء قيد محاسبي لأن تكلفة الأصناف المعدلة تساوي صفر.');
        }

        alert('تم ترحيل الجرد وإنشاء التسوية والقيد المحاسبي بنجاح ✅');
        setIsModalOpen(false);
        fetchCounts();
    } catch (error: any) {
        console.error(error);
        alert('فشل ترحيل الجرد: ' + error.message);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
        <History className="text-blue-600" /> سجل عمليات الجرد
      </h2>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-right">
            <thead className="bg-slate-50 text-slate-600 font-bold text-sm">
                <tr>
                    <th className="p-4">رقم الجرد</th>
                    <th className="p-4">التاريخ</th>
                    <th className="p-4">المستودع</th>
                    <th className="p-4">الحالة</th>
                    <th className="p-4">ملاحظات</th>
                    <th className="p-4 text-center">الإجراء</th>
                </tr>
            </thead>
            <tbody className="divide-y">
                {counts.map(count => (
                    <tr key={count.id} className="hover:bg-slate-50">
                        <td className="p-4 font-mono text-blue-600">{count.count_number}</td>
                        <td className="p-4">{count.count_date}</td>
                        <td className="p-4 font-bold">{count.warehouses?.name}</td>
                        <td className="p-4">
                            {count.status === 'posted' ? (
                                <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-xs font-bold flex items-center gap-1 w-fit"><CheckCircle size={12}/> مرحّل</span>
                            ) : (
                                <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded text-xs font-bold flex items-center gap-1 w-fit"><Clock size={12}/> مسودة</span>
                            )}
                        </td>
                        <td className="p-4 text-slate-500 text-sm">{count.notes}</td>
                        <td className="p-4 text-center">
                            <button onClick={() => handleViewDetails(count)} className="text-blue-600 hover:bg-blue-50 p-2 rounded-full" title="عرض التفاصيل">
                                <Eye size={18} />
                            </button>
                        </td>
                    </tr>
                ))}
                {counts.length === 0 && !loading && <tr><td colSpan={5} className="p-8 text-center text-slate-400">لا توجد عمليات جرد سابقة</td></tr>}
            </tbody>
        </table>
      </div>

      {isModalOpen && (
        <CountDetailsModal 
            count={selectedCount}
            items={countItems}
            onClose={() => setIsModalOpen(false)}
            onPost={handlePostCount}
            isLoading={isItemsLoading}
        />
      )}
    </div>
  );
};

export default InventoryCountList;
