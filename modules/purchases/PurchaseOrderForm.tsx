import React, { useState } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { FileCheck, Save, Trash2, Loader2, Search } from 'lucide-react';
import { createPurchaseOrderSchema } from '../../utils/validationSchemas';

const PurchaseOrderForm = () => {
  const { suppliers, products, currentUser, settings } = useAccounting();
  const { showToast } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [formData, setFormData] = useState({ 
      supplierId: '', 
      date: new Date().toISOString().split('T')[0], 
      deliveryDate: '',
      orderNumber: '',
      notes: ''
  });
  const [saving, setSaving] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  const addItem = (product: any) => {
    setItems([...items, { productId: product.id, name: product.name, quantity: 1, price: product.purchase_price || product.cost || 0 }]);
    setProductSearch('');
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };

  const calculateTotal = () => items.reduce((sum, item) => sum + (item.quantity * item.price), 0);

  const handleSave = async () => {
    // التحقق باستخدام Zod
    const validationData = {
        supplierId: formData.supplierId,
        orderNumber: formData.orderNumber || 'TEMP-PO',
        orderDate: formData.date,
        deliveryDate: formData.deliveryDate || undefined,
        items: items.map(i => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.price
        })),
        notes: formData.notes
    };
    const validationResult = createPurchaseOrderSchema.safeParse(validationData);
    if (!validationResult.success) {
        showToast(validationResult.error.issues[0].message, 'warning');
        return;
    }
    setSaving(true);

    if (currentUser?.role === 'demo') {
        showToast('تم حفظ أمر الشراء بنجاح ✅ (محاكاة)', 'success');
        setItems([]);
        setFormData({ ...formData, orderNumber: '', notes: '' });
        setSaving(false);
        return;
    }

    try {
      const total = calculateTotal();
      const taxRate = settings.enableTax ? (settings.vatRate ? settings.vatRate / 100 : 0.15) : 0;
      const tax = total * taxRate;
      const grandTotal = total + tax;
      const orderNumber = formData.orderNumber || `PO-${Date.now().toString().slice(-6)}`;

      // 1. حفظ أمر الشراء
      const { data: order, error: orderError } = await supabase.from('purchase_orders').insert({
        supplier_id: formData.supplierId,
        order_number: orderNumber,
        order_date: formData.date,
        delivery_date: formData.deliveryDate ? formData.deliveryDate : null, // إرسال null صريح إذا كان فارغاً
        total_amount: grandTotal,
        tax_amount: tax,
        notes: formData.notes,
        status: 'pending'
      }).select().single();

      if (orderError) throw orderError;

      // 2. حفظ البنود
      const orderItems = items.map(item => ({
          order_id: order.id,
          product_id: item.productId,
          quantity: item.quantity,
          price: item.price,
          total: item.quantity * item.price
      }));

      const { error: itemsError } = await supabase.from('purchase_order_items').insert(orderItems);
      if (itemsError) throw itemsError;

      showToast('تم حفظ أمر الشراء بنجاح ✅', 'success');
      setItems([]);
      setFormData({ ...formData, orderNumber: '', notes: '' });

    } catch (error: any) {
      console.error(error);
      showToast('خطأ: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase())).slice(0, 5);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><FileCheck className="text-blue-600" /> أمر شراء جديد (PO)</h2>
        <button onClick={handleSave} disabled={saving} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 disabled:opacity-50">
          {saving ? <Loader2 className="animate-spin" /> : <Save size={18} />} حفظ الأمر
        </button>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-bold mb-1">المورد</label>
          <select className="w-full border rounded-lg p-2" value={formData.supplierId} onChange={e => setFormData({...formData, supplierId: e.target.value})}>
            <option value="">اختر المورد...</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-bold mb-1">تاريخ الأمر</label>
          <input type="date" className="w-full border rounded-lg p-2" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
        </div>
        <div>
            <label className="block text-sm font-bold mb-1">تاريخ التوصيل المتوقع</label>
            <input type="date" className="w-full border rounded-lg p-2" value={formData.deliveryDate} onChange={e => setFormData({...formData, deliveryDate: e.target.value})} />
        </div>
        <div>
            <label className="block text-sm font-bold mb-1">ملاحظات</label>
            <input type="text" className="w-full border rounded-lg p-2" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} placeholder="شروط التوصيل، الدفع..." />
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="relative mb-4">
          <input type="text" placeholder="ابحث عن صنف لإضافته..." className="w-full border rounded-lg p-2 pl-10" value={productSearch} onChange={e => setProductSearch(e.target.value)} />
          <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
          {productSearch && filteredProducts.length > 0 && (
            <div className="absolute top-full left-0 w-full bg-white border shadow-lg rounded-lg mt-1 z-10">
              {filteredProducts.map(p => (
                <div key={p.id} onClick={() => addItem(p)} className="p-3 hover:bg-blue-50 cursor-pointer border-b last:border-0 flex justify-between">
                  <span>{p.name}</span>
                  <span className="text-slate-400 text-sm">{p.sku}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <table className="w-full text-right">
          <thead className="bg-slate-50 text-sm font-bold text-slate-600">
            <tr>
              <th className="p-3">الصنف</th>
              <th className="p-3 w-32">الكمية</th>
              <th className="p-3 w-32">سعر الوحدة</th>
              <th className="p-3 w-32">الإجمالي</th>
              <th className="p-3 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={idx} className="border-b">
                <td className="p-3">{item.name}</td>
                <td className="p-3"><input type="number" className="w-full border rounded p-1 text-center" value={item.quantity} onChange={e => updateItem(idx, 'quantity', Number(e.target.value))} /></td>
                <td className="p-3"><input type="number" className="w-full border rounded p-1 text-center" value={item.price} onChange={e => updateItem(idx, 'price', Number(e.target.value))} /></td>
                <td className="p-3 font-bold">{(item.quantity * item.price).toLocaleString()}</td>
                <td className="p-3"><button onClick={() => setItems(items.filter((_, i) => i !== idx))} className="text-red-500"><Trash2 size={18} /></button></td>
              </tr>
            ))}
          </tbody>
          <tfoot className="font-bold text-lg">
            <tr className="bg-slate-50">
              <td colSpan={3} className="p-4 text-left text-blue-600">الإجمالي التقديري:</td>
              <td className="p-4 text-blue-600">{(calculateTotal() + (calculateTotal() * (settings.enableTax ? (settings.vatRate ? settings.vatRate / 100 : 0.15) : 0))).toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default PurchaseOrderForm;
