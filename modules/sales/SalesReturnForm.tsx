import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { RotateCcw, Save, Trash2, Loader2, Search } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { InvoiceItem } from '../../types';
import { z } from 'zod';

const SalesReturnForm = () => {
  const { accounts, addEntry, getSystemAccount, customers, products, currentUser, warehouses, settings } = useAccounting();
  const { showToast } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [formData, setFormData] = useState({ customerId: '', warehouseId: '', date: new Date().toISOString().split('T')[0], returnNumber: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [searchInvoiceNumber, setSearchInvoiceNumber] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [returnPartialQuantities, setReturnPartialQuantities] = useState(false);
  const [originalInvoiceId, setOriginalInvoiceId] = useState<string | null>(null);

  // تعيين المستودع الافتراضي عند التحميل
  useEffect(() => {
    if (warehouses.length > 0 && !formData.warehouseId) {
      setFormData(prev => ({ ...prev, warehouseId: warehouses[0].id }));
    }
  }, [warehouses]);

  const handleFetchInvoice = async () => {
    if (!searchInvoiceNumber.trim()) return;
    setIsSearching(true);
    try {
      const { data: invoice, error } = await supabase
        .from('invoices')
        .select('*, invoice_items(*, products(name))')
        .ilike('invoice_number', `%${searchInvoiceNumber.trim()}%`)
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (invoice) {
        setFormData(prev => ({ 
            ...prev, 
            customerId: invoice.customer_id || '', 
            warehouseId: invoice.warehouse_id || prev.warehouseId, // استخدام مستودع الفاتورة الأصلية
            notes: `مرتجع من فاتورة رقم ${invoice.invoice_number}` 
        }));
        setOriginalInvoiceId(invoice.id);
        const newItems = invoice.invoice_items.map((item: any) => ({

            productId: item.product_id,
            name: item.products?.name,
            quantity: returnPartialQuantities ? 0 : item.quantity, // هنا يتم ضبط الكمية بناءً على خيار الإرجاع الجزئي
            price: item.price,
            maxQuantity: item.quantity // نحتفظ بالكمية الأصلية هنا
        }));
        setItems(newItems);
        
         //  التركيز على أول حقل إدخال في النموذج

         setTimeout(() => {

          const firstInput = document.querySelector('input[type="number"]') as HTMLInputElement;
          firstInput?.focus();
        }, 100);

      } else {
        showToast('لم يتم العثور على الفاتورة', 'error');
      }
    } catch (err: any) {
      console.error('Error loading invoice:', err);
      showToast(err?.message || 'فشل تحميل الفاتورة', 'error');
    } finally {
      setIsSearching(false);
    }
  };

  const addItem = (product: any) => {
    setItems([...items, { productId: product.id, name: product.name, quantity: 1, price: product.sales_price || product.price || 0 }]);
    setProductSearch('');
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items];
    let processedValue = value;

    if (field === 'quantity') {
        const item = newItems[index];
        // التحقق من الكمية القصوى إذا كانت محددة (في حالة الاستيراد من فاتورة)
        if (item.maxQuantity !== undefined && Number(value) > item.maxQuantity) {
             showToast(`لا يمكنك إرجاع كمية أكبر من ${item.maxQuantity}`, 'warning');
             processedValue = item.maxQuantity;
        }
    }

    newItems[index][field] = processedValue;
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    if (items.length > 0) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const calculateTotal = () => items.reduce((sum, item) => sum + (item.quantity * item.price), 0);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const salesReturnSchema = z.object({
        customerId: z.string().min(1, 'الرجاء اختيار العميل'),
        warehouseId: z.string().min(1, 'الرجاء اختيار المستودع'),
        date: z.string().min(1, 'التاريخ مطلوب'),
        items: z.array(z.object({
            productId: z.string().min(1, 'الرجاء اختيار المنتج'),
            quantity: z.number().min(0.01, 'الكمية يجب أن تكون أكبر من 0'),
            price: z.number().min(0, 'السعر يجب أن يكون 0 أو أكثر')
        })).min(1, 'يجب إضافة بند واحد على الأقل')
    });

    const validationResult = salesReturnSchema.safeParse({ ...formData, items });
    if (!validationResult.success) {
        showToast(validationResult.error.issues[0].message, 'warning');
        return;
    }

    setSaving(true);

    if (currentUser?.role === 'demo') {
        showToast('تم حفظ مرتجع المبيعات بنجاح (محاكاة)', 'success');
        setItems([]);
        setFormData({ ...formData, returnNumber: '', notes: '' });
        setSaving(false);
        return;
    }

    try {
      const subtotal = calculateTotal();
      const taxRate = settings.enableTax ? (settings.vatRate ?? 0.15) : 0;
      const taxAmount = subtotal * taxRate;
      const totalAmount = subtotal + taxAmount;
      
      const customer = customers.find(c => c.id === formData.customerId);
      const returnNumber = formData.returnNumber || `SR-${Date.now().toString().slice(-6)}`;

      // 1. حفظ المرتجع
      const { data: returnDoc, error: retError } = await supabase.from('sales_returns').insert({
        customer_id: formData.customerId,
        warehouse_id: formData.warehouseId,
        original_invoice_id: originalInvoiceId,
        return_number: returnNumber,
        return_date: formData.date,
        total_amount: totalAmount,
        tax_amount: taxAmount,
        notes: formData.notes,
        status: 'posted',
        created_by: currentUser?.id
      }).select().single();

      if (retError) throw retError;

      if (!returnDoc) throw new Error("فشل حفظ مستند المرتجع.");

      // 2. حفظ البنود وتحديث المخزون (زيادة)
      for (const item of items) {
        await supabase.from('sales_return_items').insert({
          sales_return_id: returnDoc.id,
          product_id: item.productId,
          quantity: item.quantity,
          price: item.price,
          total: item.quantity * item.price
        });

        const product = products.find(p => p.id === item.productId);
        const newStock = (product?.stock || 0) + Number(item.quantity);
        await supabase.from('products').update({ stock: newStock }).eq('id', item.productId);
      }

      // 3. إنشاء القيد المحاسبي العكسي
      const normalizeCode = (code: string | number) => String(code).trim();
      const normalizeText = (text: string) => (text || '').toLowerCase();
      const findAccount = (preferredCodes: string[], nameKeywords: string[]) => {
           for (const code of preferredCodes) {
               const found = accounts?.find(a => normalizeCode(a.code) === code);
               if (found) return found;
           }
           return accounts?.find(a => nameKeywords.some(k => normalizeText(a.name).includes(k)));
      };

      const salesReturnAcc = getSystemAccount('SALES_REVENUE') || findAccount(['412', '401'], ['مردودات مبيعات', 'sales return']); 
      const salesAcc = getSystemAccount('SALES_REVENUE') || findAccount(['411', '401'], ['مبيعات', 'sales']);
      const targetSalesAcc = salesReturnAcc || salesAcc;

      const taxAcc = getSystemAccount('VAT') || findAccount(['2231', '202'], ['ضريبة', 'tax', 'vat']); 
      const customerAcc = getSystemAccount('CUSTOMERS') || findAccount(['1221', '10201'], ['عملاء', 'customer']); 
      const cogsAcc = getSystemAccount('COGS') || findAccount(['511', '501'], ['تكلفة', 'cogs']);
      const inventoryAcc = getSystemAccount('INVENTORY_FINISHED_GOODS') || findAccount(['1213', '10302', '103'], ['مخزون', 'inventory']);

      if (targetSalesAcc && customerAcc) {
        // حساب تكلفة البضاعة المرتجعة
        let totalCost = 0;
        for (const item of items) {
            const product = products.find(p => p.id === item.productId);
            const itemCost = product?.purchase_price || product?.cost || 0;
            totalCost += (item.quantity * itemCost);
        }

        const lines = [
          { accountId: targetSalesAcc.id, debit: subtotal, credit: 0, description: `مرتجع مبيعات - ${returnNumber}` },
          { accountId: customerAcc.id, debit: 0, credit: totalAmount, description: `مرتجع مبيعات من العميل ${customer?.name}` }
        ];
        if (taxAmount > 0 && taxAcc) {
          lines.push({ accountId: taxAcc.id, debit: taxAmount, credit: 0, description: 'عكس ضريبة المبيعات' });
        }

        // عكس قيد التكلفة
        if (totalCost > 0 && cogsAcc && inventoryAcc) {
            lines.push({ accountId: inventoryAcc.id, debit: totalCost, credit: 0, description: 'إرجاع بضاعة للمخزون' });
            lines.push({ accountId: cogsAcc.id, debit: 0, credit: totalCost, description: 'عكس تكلفة البضاعة المباعة' });
        }

        await addEntry({
          date: formData.date,
          description: `مرتجع مبيعات - ${customer?.name}`,
          reference: returnNumber,
          status: 'posted',
          lines: lines as any[]
        });
      }

      showToast('تم حفظ مرتجع المبيعات بنجاح', 'success');
      setItems([]);
      setFormData({ ...formData, returnNumber: '', notes: '' });
      setOriginalInvoiceId(null);

    } catch (error: any) {
      console.error('Error saving return:', error);
      showToast(error?.message || 'فشل حفظ المرتجع', 'error');
    } finally {
      setSaving(false);
    }
  };

  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase())).slice(0, 5);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><RotateCcw className="text-red-600" /> مرتجع مبيعات</h2>
        <button onClick={handleSave} disabled={saving} className="bg-red-600 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 disabled:opacity-50 hover:bg-red-700">
          {saving ? <Loader2 className="animate-spin" /> : <Save size={18} />} حفظ المرتجع
        </button>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2 flex items-center justify-start gap-3">
            <input type="checkbox" className="border-2 border-blue-300 rounded text-blue-600 focus:ring-0 focus:ring-offset-0" id="partialQuantities" checked={returnPartialQuantities} onChange={(e) => setReturnPartialQuantities(e.target.checked)} />
            <label htmlFor="partialQuantities" className="text-sm font-bold">تحديد الكميات المرتجعة يدوياً</label>
          </div>

        <div className="md:col-span-2 flex items-end gap-2 mb-2 pb-4 border-b border-slate-100">
            <div className="flex-1">
                <label className="block text-sm font-bold mb-1 text-slate-600">جلب من فاتورة سابقة</label>
                <div className="relative">
                    <input type="text" className="w-full border rounded-lg p-2 pl-10 bg-slate-50 focus:bg-white transition-colors" placeholder="أدخل رقم الفاتورة (مثال: INV-123456)" value={searchInvoiceNumber} onChange={(e) => setSearchInvoiceNumber(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleFetchInvoice()} />
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                </div>
            </div>
            <button type="button" onClick={handleFetchInvoice} disabled={isSearching} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 h-[42px]">
                {isSearching ? <Loader2 className="animate-spin" size={18} /> : 'جلب البيانات'}
            </button>
        </div>

        <div>
          <label className="block text-sm font-bold mb-1">العميل</label>
          <select className="w-full border rounded-lg p-2" value={formData.customerId} onChange={e => setFormData({...formData, customerId: e.target.value})}>
            <option value="">اختر العميل...</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-bold mb-1">المستودع (لإرجاع البضاعة)</label>
          <select className="w-full border rounded-lg p-2" value={formData.warehouseId} onChange={e => setFormData({...formData, warehouseId: e.target.value})}>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-bold mb-1">تاريخ المرتجع</label>
          <input type="date" className="w-full border rounded-lg p-2" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
        </div>
        <div>
            <label className="block text-sm font-bold mb-1">رقم المرتجع (اختياري)</label>
            <input type="text" className="w-full border rounded-lg p-2" value={formData.returnNumber} onChange={e => setFormData({...formData, returnNumber: e.target.value})} placeholder="تلقائي" />
        </div>
        <div>
            <label className="block text-sm font-bold mb-1">ملاحظات</label>
            <input type="text" className="w-full border rounded-lg p-2" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} placeholder="سبب الإرجاع..." />
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="relative mb-4">
          <input type="text" placeholder="ابحث عن صنف لإرجاعه..." className="w-full border rounded-lg p-2 pl-10" value={productSearch} onChange={e => setProductSearch(e.target.value)} />
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
              <th className="p-3 w-32">الكمية المرتجعة</th>
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
                <td className="p-3"><button onClick={() => removeItem(idx)} className="text-red-500"><Trash2 size={18} /></button></td>
              </tr>
            ))}
          </tbody>
          <tfoot className="font-bold text-lg">
            <tr className="bg-slate-50">
              <td colSpan={3} className="p-4 text-left text-red-600">إجمالي المرتجع {settings.enableTax ? '(شامل الضريبة)' : ''}:</td>
              <td className="p-4 text-red-600">{(calculateTotal() * (1 + (settings.enableTax ? (settings.vatRate ?? 0.15) : 0))).toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default SalesReturnForm;