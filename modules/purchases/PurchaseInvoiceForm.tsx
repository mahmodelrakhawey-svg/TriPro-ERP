import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { 
    Plus, Trash2, Save, Truck, Calendar, ShoppingCart, Warehouse,
    Search, X, Check, AlertCircle, CircleDollarSign, Package, Box, Info, Loader2, CheckCircle
} from 'lucide-react';
import { Product } from '../../types';
import { supabase } from '../../supabaseClient';
import { useNavigate, useLocation } from 'react-router-dom';

const PurchaseInvoiceForm = () => {
  const { products, warehouses, suppliers, approvePurchaseInvoice, settings, can, currentUser } = useAccounting();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [formData, setFormData] = useState({
    supplierId: '',
    invoiceNumber: '',
    warehouseId: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
    status: 'draft',
    currency: 'SAR',
    exchangeRate: 1
  });

  const [items, setItems] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [showProductResults, setShowProductResults] = useState(false);

  useEffect(() => {
    if (warehouses.length > 0 && !formData.warehouseId) {
      setFormData(prev => ({ ...prev, warehouseId: warehouses[0].id }));
    }
    if (!formData.currency && settings.currency) {
        setFormData(prev => ({ ...prev, currency: settings.currency }));
    }
  }, [warehouses, settings]);

  // تحميل بيانات الفاتورة عند التعديل
  useEffect(() => {
    if (location.state && location.state.invoiceToEdit) {
      const invId = location.state.invoiceToEdit.id;
      
      const fetchInvoiceDetails = async () => {
          const { data: fullInv } = await supabase.from('purchase_invoices').select('*').eq('id', invId).single();
          
          if (fullInv) {
              if (fullInv.status !== 'draft' && !can('purchases', 'update')) {
                  alert('تنبيه: هذه الفاتورة مرحلة ولا يمكن تعديلها.');
              }

              setEditingId(fullInv.id);
              setFormData(prev => ({
                ...prev,
                supplierId: fullInv.supplier_id || '',
                invoiceNumber: fullInv.invoice_number || '',
                date: fullInv.invoice_date || new Date().toISOString().split('T')[0],
                notes: fullInv.notes || '',
                status: fullInv.status || 'draft',
                currency: fullInv.currency || settings.currency || 'SAR',
                exchangeRate: fullInv.exchange_rate || 1,
                warehouseId: fullInv.warehouse_id || '',
              }));

              // جلب البنود
              const { data: itemsData } = await supabase.from('purchase_invoice_items').select('*, products(name, sku)').eq('purchase_invoice_id', fullInv.id);
              if (itemsData) {
                 setItems(itemsData.map((i: any) => ({
                   id: i.id,
                   productId: i.product_id,
                   productName: i.products?.name,
                   productSku: i.products?.sku,
                   quantity: i.quantity,
                   price: i.price,
                   total: i.total
                 })));
              }
          }
      };
      
      fetchInvoiceDetails();
    }
  }, [location, settings]);

  const subtotal = useMemo(() => items.reduce((sum, item) => sum + (item.total || 0), 0), [items]);
  const taxAmount = useMemo(() => subtotal * (settings.enableTax ? (settings.vatRate || 0) : 0), [subtotal, settings]);
  const totalAmount = useMemo(() => subtotal + taxAmount, [subtotal, taxAmount]);

  const filteredProducts = useMemo(() => {
      if (!productSearchTerm.trim()) return [];
      const term = productSearchTerm.toLowerCase();
      return products.filter(p =>
          p.name.toLowerCase().includes(term) ||
          (p.sku && p.sku.toLowerCase().includes(term))
      ).slice(0, 8);
  }, [productSearchTerm, products]);

  const addProductToInvoice = (product: Product) => {
      const existingItemIndex = items.findIndex(i => i.productId === product.id);
      const price = product.purchase_price || product.cost || 0;

      if (existingItemIndex > -1) {
          const newItems = [...items];
          newItems[existingItemIndex].quantity += 1;
          newItems[existingItemIndex].total = newItems[existingItemIndex].quantity * newItems[existingItemIndex].price;
          setItems(newItems);
      } else {
          setItems([...items, {
              id: Date.now().toString(),
              productId: product.id,
              productName: product.name,
              productSku: product.sku,
              quantity: 1,
              price: price,
              total: price
          }]);
      }
      setProductSearchTerm('');
      setShowProductResults(false);
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...items];
    newItems[index][field] = value;

    if (field === 'productId') {
      const product = products.find(p => p.id === value);
      if (product) {
        newItems[index].price = product.purchase_price || product.cost || 0;
      }
    }

    newItems[index].total = (newItems[index].quantity || 0) * (newItems[index].price || 0);
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSave = async (e: React.FormEvent, post: boolean = false) => {
    e.preventDefault();
    if (!formData.supplierId || !formData.warehouseId || items.length === 0) {
      alert('يرجى إكمال البيانات الأساسية وإضافة أصناف.');
      return;
    }
    setSaving(true);

    try {
      const invoiceNumber = formData.invoiceNumber || `PUR-${Date.now().toString().slice(-6)}`;
      const invoiceData = {
        invoice_number: invoiceNumber,
        supplier_id: formData.supplierId,
        warehouse_id: formData.warehouseId,
        invoice_date: formData.date,
        total_amount: totalAmount,
        tax_amount: taxAmount,
        subtotal: subtotal, // إضافة هذا الحقل لضمان حساب المخزون بشكل صحيح
        notes: formData.notes,
        status: 'draft',
        currency: formData.currency,
        exchange_rate: formData.exchangeRate,
        created_by: currentUser?.id
      };

      let invoiceId = editingId;

      if (editingId) {
        // تحديث فاتورة موجودة
        const { error: updateError } = await supabase.from('purchase_invoices').update(invoiceData).eq('id', editingId);
        if (updateError) throw updateError;
        
        // حذف البنود القديمة لاستبدالها
        await supabase.from('purchase_invoice_items').delete().eq('purchase_invoice_id', editingId);
      } else {
        // إنشاء فاتورة جديدة
        const { data: invoice, error: insertError } = await supabase.from('purchase_invoices').insert(invoiceData).select().single();
        if (insertError) throw insertError;
        invoiceId = invoice.id;
      }

      const itemsToInsert = items.map(item => ({
        purchase_invoice_id: invoiceId, // استخدام المعرف الصحيح (سواء جديد أو موجود)
        product_id: item.productId,
        quantity: item.quantity,
        price: item.price,
        total: item.total
      }));
      const { error: itemsError } = await supabase.from('purchase_invoice_items').insert(itemsToInsert);
      if (itemsError) throw itemsError;

      if (post) {
        await approvePurchaseInvoice(invoiceId!);
        setSuccessMessage('تم حفظ فاتورة المشتريات وترحيلها بنجاح!');
      } else {
        setSuccessMessage(editingId ? 'تم تحديث فاتورة المشتريات بنجاح!' : 'تم حفظ فاتورة المشتريات كمسودة بنجاح!');
      }

      // Reset form
      setItems([]);
      setFormData(prev => ({ ...prev, supplierId: '', invoiceNumber: '', notes: '' }));
      setEditingId(null); // إعادة تعيين حالة التعديل
      setTimeout(() => setSuccessMessage(null), 4000);

    } catch (error: any) {
      console.error(error);
      alert('فشل حفظ الفاتورة: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <ShoppingCart className="text-emerald-600" /> {editingId ? 'تعديل فاتورة مشتريات' : 'فاتورة مشتريات جديدة'}
        </h2>
      </div>

      <form onSubmit={(e) => handleSave(e, false)} className="space-y-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">المورد</label>
              <select required value={formData.supplierId} onChange={e => setFormData({...formData, supplierId: e.target.value})} className="w-full border rounded-lg p-2 bg-white">
                <option value="">اختر المورد...</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">تاريخ الفاتورة</label>
              <input type="date" required value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full border rounded-lg p-2" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">رقم فاتورة المورد</label>
              <input type="text" value={formData.invoiceNumber} onChange={e => setFormData({...formData, invoiceNumber: e.target.value})} className="w-full border rounded-lg p-2" placeholder="رقم الفاتورة الأصلي" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">مستودع الاستلام</label>
              <select required value={formData.warehouseId} onChange={e => setFormData({...formData, warehouseId: e.target.value})} className="w-full border rounded-lg p-2 bg-white">
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <CircleDollarSign className="text-green-500" size={16} /> العملة
                </label>
                <div className="flex gap-2">
                    <select 
                        value={formData.currency}
                        onChange={(e) => setFormData({...formData, currency: e.target.value})}
                        className="w-2/3 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 outline-none bg-white"
                    >
                        <option value="SAR">SAR</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                        <option value="EGP">EGP</option>
                    </select>
                    <input 
                        type="number" 
                        value={formData.exchangeRate}
                        onChange={(e) => setFormData({...formData, exchangeRate: parseFloat(e.target.value)})}
                        className="w-1/3 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 outline-none text-center"
                        placeholder="سعر الصرف"
                        step="0.01"
                    />
                </div>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
          <h3 className="font-bold">بنود الفاتورة</h3>
          {items.map((item, index) => (
            <div key={index} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-5">
                <select required value={item.productId} onChange={e => handleItemChange(index, 'productId', e.target.value)} className="w-full border rounded p-2 bg-white">
                  <option value="">اختر الصنف...</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <input type="number" min="1" value={item.quantity} onChange={e => handleItemChange(index, 'quantity', parseFloat(e.target.value))} className="w-full border rounded p-2 text-center" placeholder="الكمية" />
              </div>
              <div className="col-span-2">
                <input type="number" min="0" value={item.price} onChange={e => handleItemChange(index, 'price', parseFloat(e.target.value))} className="w-full border rounded p-2 text-center" placeholder="السعر" />
              </div>
              <div className="col-span-2">
                <input type="text" readOnly value={(item.total || 0).toLocaleString()} className="w-full bg-slate-100 border rounded p-2 text-center font-bold" />
              </div>
              <div className="col-span-1">
                <button type="button" onClick={() => removeItem(index)} className="text-red-500 hover:text-red-700 p-2">
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
          <button type="button" onClick={() => setItems([...items, { productId: '', quantity: 1, price: 0, total: 0 }])} className="flex items-center gap-2 text-blue-600 font-bold text-sm mt-2">
            <Plus size={16} /> إضافة صنف
          </button>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="grid grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">ملاحظات</label>
                    <textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} rows={4} className="w-full border rounded-lg p-2"></textarea>
                </div>
                <div className="bg-slate-50 p-4 rounded-lg space-y-2 text-sm">
                    <div className="flex justify-between font-bold"><span>الإجمالي قبل الضريبة:</span> <span>{subtotal.toLocaleString()}</span></div>
                    <div className="flex justify-between"><span>الضريبة:</span> <span>{taxAmount.toLocaleString()}</span></div>
                    <div className="flex justify-between font-black text-lg border-t pt-2 mt-2"><span>الإجمالي النهائي:</span> <span>{totalAmount.toLocaleString()}</span></div>
                </div>
            </div>
        </div>

        <div className="flex justify-end gap-4">
          <button type="submit" disabled={saving} className="bg-slate-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-slate-700 flex items-center gap-2 shadow-md disabled:opacity-50">
            {saving ? <Loader2 className="animate-spin" /> : <Save size={20} />} {editingId ? 'حفظ التعديلات' : 'حفظ كمسودة'}
          </button>
          {!editingId && (
            <button type="button" onClick={(e) => handleSave(e, true)} disabled={saving} className="bg-emerald-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-emerald-700 flex items-center gap-2 shadow-lg disabled:opacity-50">
              {saving ? <Loader2 className="animate-spin" /> : <CheckCircle size={20} />} حفظ وترحيل
            </button>
          )}
        </div>

        {successMessage && (
            <div className="bg-emerald-50 text-emerald-700 p-4 rounded-xl text-center font-bold animate-in fade-in">
                {successMessage}
            </div>
        )}
      </form>
    </div>
  );
};

export default PurchaseInvoiceForm;