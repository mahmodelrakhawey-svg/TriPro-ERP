import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { RotateCcw, Save, Loader2, Truck, Calendar, Package, Warehouse, Plus, Trash2, FileText } from 'lucide-react';

const PurchaseReturnForm = () => {
  const { suppliers, products, warehouses, settings, purchaseInvoices, accounts, addEntry, getSystemAccount, currentUser } = useAccounting();
  const { showToast } = useToast();
  const [formData, setFormData] = useState({
    supplierId: '',
    originalInvoiceId: '',
    warehouseId: '',
    date: new Date().toISOString().split('T')[0],
    returnNumber: '',
    notes: ''
  });
  const [items, setItems] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  // تصفية فواتير المشتريات بناءً على المورد المختار
  const supplierInvoices = useMemo(() => {
    if (!formData.supplierId) return [];
    return purchaseInvoices.filter(inv => inv.supplierId === formData.supplierId && (inv.status as any) === 'posted');
  }, [formData.supplierId, purchaseInvoices]);

  useEffect(() => {
    if (warehouses.length > 0 && !formData.warehouseId) {
      setFormData(prev => ({ ...prev, warehouseId: warehouses[0].id }));
    }
  }, [warehouses]);

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...items];
    
    if (field === 'quantity' || field === 'price') {
        newItems[index][field] = parseFloat(value) || 0;
    } else {
        newItems[index][field] = value;
    }

    if (field === 'productId') {
      const product = products.find(p => p.id === value);
      // في مرتجع المشتريات، السعر الافتراضي هو سعر الشراء أو التكلفة
      newItems[index].price = product?.purchase_price || product?.cost || 0;
    }

    newItems[index].total = (newItems[index].quantity || 0) * (newItems[index].price || 0);
    setItems(newItems);
  };

  const addItem = () => {
    setItems([...items, { productId: '', quantity: 1, price: 0, total: 0 }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const subtotal = useMemo(() => items.reduce((sum, item) => sum + item.total, 0), [items]);
  const taxAmount = useMemo(() => subtotal * (settings.enableTax ? (settings.vatRate || 0) : 0), [subtotal, settings]);
  const totalAmount = useMemo(() => subtotal + taxAmount, [subtotal, taxAmount]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.supplierId || !formData.warehouseId || items.length === 0 || items.some(i => !i.productId)) {
      showToast('يرجى إكمال جميع البيانات المطلوبة.', 'warning');
      return;
    }

    setSaving(true);
    try {
      const returnNumber = formData.returnNumber || `PRET-${Date.now().toString().slice(-6)}`;

      // 1. Insert Purchase Return Header
      const { data: returnHeader, error: headerError } = await supabase.from('purchase_returns').insert({
        return_number: returnNumber,
        supplier_id: formData.supplierId,
        // original_invoice_id: formData.originalInvoiceId || null, // Column does not exist, temporarily disabled
        warehouse_id: formData.warehouseId,
        return_date: formData.date,
        total_amount: totalAmount,
        tax_amount: taxAmount,
        notes: formData.notes,
        status: 'posted', // Save as posted directly since we handle logic here
        created_by: currentUser?.id
      }).select().single();

      if (headerError) throw headerError;

      // 2. Insert Items and Update Stock
      for (const item of items) {
        // Insert Item
        await supabase.from('purchase_return_items').insert({
            purchase_return_id: returnHeader.id, // تم التحديث ليتوافق مع قاعدة البيانات
            product_id: item.productId,
            quantity: item.quantity,
            price: item.price,
            total: item.total
        });

        // Update Stock (Decrease)
        const product = products.find(p => p.id === item.productId);
        if (product) {
            const newStock = (product.stock || 0) - Number(item.quantity);
            const currentWhStock = product.warehouse_stock || {};
            const newWhStock = { ...currentWhStock, [formData.warehouseId]: (Number(currentWhStock[formData.warehouseId]) || 0) - Number(item.quantity) };
            
            await supabase.from('products').update({ 
                stock: newStock,
                warehouse_stock: newWhStock
            }).eq('id', item.productId);
        }
      }

      // 3. Create Journal Entry (Frontend Logic)
      // Debit: Supplier (201)
      // Credit: Inventory (103)
      // Credit: VAT Input (10204) - Reversing input tax

      // استخدام الحسابات من النظام بدلاً من الأكواد الثابتة
      const supplierAcc = getSystemAccount('SUPPLIERS');
      const inventoryAcc = getSystemAccount('INVENTORY_FINISHED_GOODS') || getSystemAccount('INVENTORY');
      const vatInputAcc = getSystemAccount('VAT_INPUT');

      if (supplierAcc && inventoryAcc) {
          const lines = [
              { accountId: supplierAcc.id, debit: totalAmount, credit: 0, description: `مرتجع مشتريات - ${returnNumber}` }
          ];

          // Inventory Credit (Net Amount)
          lines.push({ accountId: inventoryAcc.id, debit: 0, credit: subtotal, description: `إخراج مخزون - مرتجع ${returnNumber}` });

          // VAT Credit (Tax Amount) - Reverse Input Tax
          if (taxAmount > 0 && vatInputAcc) {
              lines.push({ accountId: vatInputAcc.id, debit: 0, credit: taxAmount, description: `عكس ضريبة المدخلات` });
          }

          await addEntry({
              date: formData.date,
              description: `مرتجع مشتريات للمورد ${suppliers.find(s => s.id === formData.supplierId)?.name}`,
              reference: returnNumber,
              status: 'posted',
              lines: lines as any[]
          });
      } else {
          showToast('تنبيه: تم حفظ المرتجع ولكن لم يتم إنشاء القيد لعدم العثور على الحسابات الأساسية (الموردين, المخزون, الضريبة).', 'warning');
      }

      showToast('تم حفظ مرتجع المشتريات وتحديث المخزون وإنشاء القيد بنجاح ✅', 'success');
      setFormData(prev => ({ ...prev, supplierId: '', originalInvoiceId: '', returnNumber: '', notes: '' }));
      setItems([]);

    } catch (error: any) {
      console.error(error);
      showToast('فشل حفظ المرتجع: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <RotateCcw className="text-red-600" /> مرتجع مشتريات
        </h2>
      </div>

      <form onSubmit={handleSave} className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">المورد</label>
            <select required value={formData.supplierId} onChange={e => setFormData({ ...formData, supplierId: e.target.value })} className="w-full border rounded-lg p-2">
              <option value="">اختر المورد...</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">الفاتورة الأصلية (اختياري)</label>
            <select value={formData.originalInvoiceId} onChange={e => setFormData({ ...formData, originalInvoiceId: e.target.value })} className="w-full border rounded-lg p-2" disabled={!formData.supplierId}>
              <option value="">-- بدون ربط --</option>
              {supplierInvoices.map(inv => (
                <option key={inv.id} value={inv.id}>{inv.invoiceNumber} ({new Date(inv.date).toLocaleDateString('ar-EG')})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">تاريخ المرتجع</label>
            <input type="date" required value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} className="w-full border rounded-lg p-2" />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">المستودع</label>
            <select required value={formData.warehouseId} onChange={e => setFormData({ ...formData, warehouseId: e.target.value })} className="w-full border rounded-lg p-2">
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="font-bold">الأصناف المرتجعة</h3>
          {items.map((item, index) => (
            <div key={index} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-5">
                <select required value={item.productId} onChange={e => handleItemChange(index, 'productId', e.target.value)} className="w-full border rounded p-2">
                  <option value="">اختر الصنف...</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <input type="number" min="1" value={item.quantity} onChange={e => handleItemChange(index, 'quantity', e.target.value)} className="w-full border rounded p-2 text-center" placeholder="الكمية" />
              </div>
              <div className="col-span-2">
                <input type="number" min="0" value={item.price} onChange={e => handleItemChange(index, 'price', e.target.value)} className="w-full border rounded p-2 text-center" placeholder="السعر" />
              </div>
              <div className="col-span-2">
                <input type="text" readOnly value={item.total.toLocaleString()} className="w-full bg-slate-100 border rounded p-2 text-center font-bold" />
              </div>
              <div className="col-span-1">
                <button type="button" onClick={() => removeItem(index)} className="text-red-500 hover:text-red-700 p-2">
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
          <button type="button" onClick={addItem} className="flex items-center gap-2 text-blue-600 font-bold text-sm mt-2">
            <Plus size={16} /> إضافة صنف
          </button>
        </div>

        <div className="border-t pt-4 space-y-2">
          <div className="flex justify-end gap-4 font-bold">
            <span className="text-slate-500">الإجمالي قبل الضريبة:</span>
            <span>{subtotal.toLocaleString()}</span>
          </div>
          <div className="flex justify-end gap-4 font-bold">
            <span className="text-slate-500">الضريبة:</span>
            <span>{taxAmount.toLocaleString()}</span>
          </div>
          <div className="flex justify-end gap-4 font-bold text-xl">
            <span className="text-slate-500">الإجمالي النهائي:</span>
            <span className="text-red-600">{totalAmount.toLocaleString()}</span>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="bg-red-600 text-white px-8 py-3 rounded-lg font-bold hover:bg-red-700 flex items-center gap-2 shadow-lg disabled:opacity-50">
            {saving ? <Loader2 className="animate-spin" /> : <Save size={20} />} حفظ وترحيل المرتجع
          </button>
        </div>
      </form>
    </div>
  );
};

export default PurchaseReturnForm;
