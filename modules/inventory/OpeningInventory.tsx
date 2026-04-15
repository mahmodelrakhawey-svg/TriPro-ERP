import React, { useState } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting, SYSTEM_ACCOUNTS } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { Plus, Trash2, Save, Loader2, PackageOpen, AlertTriangle } from 'lucide-react';
import { z } from 'zod';

type NewProduct = {
  id: string; // Temporary ID for UI
  name: string;
  sku: string;
  quantity: number;
  cost: number;
  price: number; // Sales price
  unit: string; // Unit of measurement
};

export default function OpeningInventory() {
  const { currentUser, warehouses, getSystemAccount } = useAccounting();
  const { showToast } = useToast();
  const [items, setItems] = useState<NewProduct[]>([
    { id: '1', name: '', sku: '', quantity: 1, cost: 0, price: 0, unit: 'قطعة' }
  ]);
  const [loading, setLoading] = useState(false);

  const handleAddItem = () => {
    setItems([...items, { id: Date.now().toString(), name: '', sku: '', quantity: 1, cost: 0, price: 0, unit: 'قطعة' }]);
  };

  const handleRemoveItem = (id: string) => {
    if (items.length > 1) {
      setItems(items.filter(i => i.id !== id));
    }
  };

  const handleChange = (id: string, field: keyof NewProduct, value: any) => {
    setItems(items.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const handleSave = async () => {
    // التحقق من البيانات
    const openingInventorySchema = z.array(z.object({
        name: z.string().min(1, 'اسم الصنف مطلوب'),
        quantity: z.number().min(0.01, 'الكمية يجب أن تكون أكبر من 0'),
        cost: z.number().min(0, 'التكلفة يجب أن تكون 0 أو أكثر')
    })).min(1, 'يجب إضافة صنف واحد على الأقل');

    const validationResult = openingInventorySchema.safeParse(items);
    if (!validationResult.success) {
        const error = validationResult.error.issues[0];
        showToast(`خطأ في السطر ${Number(error.path[0]) + 1}: ${error.message}`, 'warning');
        return;
    }

    if (!window.confirm('هل أنت متأكد من حفظ بضاعة أول المدة؟\nسيتم إنشاء الأصناف والقيد المحاسبي الافتتاحي.')) return;

    setLoading(true);
    if (currentUser?.role === 'demo') {
        showToast('تم حفظ الأصناف والقيد الافتتاحي بنجاح! ✅ (محاكاة)', 'success');
        setLoading(false);
        return;
    }

    try {
      const inventoryAcc = getSystemAccount('INVENTORY_FINISHED_GOODS');
      const openingAcc = getSystemAccount('RETAINED_EARNINGS'); // Or a specific opening balance account
      const cogsAcc = getSystemAccount('COGS');
      const salesAcc = getSystemAccount('SALES_REVENUE');

      if (!inventoryAcc || !openingAcc || !cogsAcc || !salesAcc) {
        throw new Error(`أحد الحسابات الأساسية غير موجود. تأكد من ربط الحسابات في الإعدادات: INVENTORY_FINISHED_GOODS, RETAINED_EARNINGS, COGS, SALES_REVENUE`);
      }

      // تحديد المستودع الافتراضي (أول مستودع متاح)
      const defaultWarehouseId = warehouses?.[0]?.id;
      if (!defaultWarehouseId) {
        throw new Error('لا يوجد مستودعات معرفة في النظام. يرجى إضافة مستودع أولاً.');
      }

      const orgId = (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;

            for (const item of items) {
        // 1. استدعاء دالة RPC لإضافة المنتج وإنشاء القيد المحاسبي تلقائياً
        const { data: newProductId, error: rpcError } = await supabase.rpc('add_product_with_opening_balance', {
          p_name: item.name,
          p_sku: item.sku || null,
          p_sales_price: item.price,
          p_purchase_price: item.cost,
          p_stock: item.quantity,
          p_unit: item.unit, // Pass the unit
          p_org_id: orgId,
          p_item_type: 'STOCK',
          p_inventory_account_id: inventoryAcc.id,
          p_cogs_account_id: cogsAcc.id,
          p_sales_account_id: salesAcc.id
        });
        if (rpcError) throw rpcError;

        // 2. إدراج سجل في جدول opening_inventories لتتبع الرصيد الافتتاحي على مستوى المستودع
        if (newProductId) {
          const { error: openingError } = await supabase.from('opening_inventories').insert({
            product_id: newProductId,
            warehouse_id: defaultWarehouseId,
            quantity: item.quantity,
            cost: item.cost,
            created_by: currentUser?.id
          });
          if (openingError) console.error("Failed to save opening inventory record:", openingError);
        }
      } // This closing brace correctly ends the 'for...of' loop
      showToast('تم حفظ الأصناف والقيد الافتتاحي بنجاح! ✅', 'success'); // Refresh data after successful save
      setItems([{ id: Date.now().toString(), name: '', sku: '', quantity: 1, cost: 0, price: 0, unit: 'قطعة' }]); // تصفير النموذج

    } catch (error: any) {
      console.error('Error saving opening stock:', error);
      showToast('حدث خطأ أثناء الحفظ: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 animate-in fade-in space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <PackageOpen className="text-blue-600" /> بضاعة أول المدة
          </h1>
          <p className="text-slate-500">إدخال أرصدة المخزون الافتتاحية عند بداية العمل</p>
        </div>
        <button 
          onClick={handleSave}
          disabled={loading}
          className="bg-emerald-600 text-white px-6 py-2 rounded-lg hover:bg-emerald-700 font-bold shadow-sm disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
          حفظ وترحيل
        </button>
      </div>

      <div className="bg-amber-50 border-r-4 border-amber-500 p-4 rounded-md shadow-sm">
        <div className="flex items-center gap-3">
            <AlertTriangle className="text-amber-600" />
            <p className="text-sm text-amber-800 font-medium">
                تنبيه: استخدم هذه الشاشة فقط عند بداية العمل لإدخال الأصناف الجديدة مع كمياتها. إذا كانت الأصناف موجودة مسبقاً، استخدم "تسوية مخزنية".
            </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-right">
          <thead className="bg-slate-50 text-slate-700 font-bold text-sm border-b border-slate-200">
            <tr>
              <th className="p-4 w-12">#</th>
              <th className="p-4">اسم الصنف <span className="text-red-500">*</span></th>
              <th className="p-4 w-40">الكود (SKU)</th>
              <th className="p-4 w-32">الكمية <span className="text-red-500">*</span></th>
              <th className="p-4 w-32">التكلفة <span className="text-red-500">*</span></th>
              <th className="p-4 w-32">الوحدة</th>
              <th className="p-4 w-32">سعر البيع</th>
              <th className="p-4 w-32">الإجمالي</th>
              <th className="p-4 w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item, index) => (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="p-4 text-slate-400 font-mono">{index + 1}</td>
                <td className="p-2"><input type="text" className="w-full border rounded px-2 py-1" placeholder="اسم المنتج" value={item.name} onChange={e => handleChange(item.id, 'name', e.target.value)} /></td>
                <td className="p-2"><input type="text" className="w-full border rounded px-2 py-1" placeholder="اختياري" value={item.sku} onChange={e => handleChange(item.id, 'sku', e.target.value)} /></td>
                <td className="p-2"><input type="number" min="1" className="w-full border rounded px-2 py-1 text-center font-bold text-blue-600" value={item.quantity} onChange={e => handleChange(item.id, 'quantity', parseFloat(e.target.value))} /></td>
                <td className="p-2"><input type="number" min="0" step="0.01" className="w-full border rounded px-2 py-1 text-center" value={item.cost} onChange={e => handleChange(item.id, 'cost', parseFloat(e.target.value))} /></td>
                <td className="p-2">
                  <select 
                    className="w-full border rounded px-2 py-1" 
                    value={item.unit} 
                    onChange={e => handleChange(item.id, 'unit', e.target.value)}
                  >
                    <option value="قطعة">قطعة</option>
                    <option value="كجم">كجم</option>
                    <option value="لتر">لتر</option>
                    <option value="متر">متر</option>
                    <option value="علبة">علبة</option>
                    <option value="كرتون">كرتون</option>
                    <option value="وحدة">وحدة</option>
                  </select>
                </td>
                <td className="p-2"><input type="number" min="0" step="0.01" className="w-full border rounded px-2 py-1 text-center" value={item.price} onChange={e => handleChange(item.id, 'price', parseFloat(e.target.value))} /></td>
                <td className="p-4 font-bold text-slate-700">{(item.quantity * item.cost).toLocaleString()}</td>
                <td className="p-2 text-center">
                  <button onClick={() => handleRemoveItem(item.id)} className="text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={18} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="p-4 bg-slate-50 border-t border-slate-200">
          <button onClick={handleAddItem} className="flex items-center gap-2 text-blue-600 font-bold hover:bg-blue-50 px-4 py-2 rounded-lg transition-colors">
            <Plus size={18} /> إضافة سطر جديد
          </button>
        </div>
      </div>
    </div>
  );
}