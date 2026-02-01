import React, { useState, useEffect } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { Save, User, Calendar, Plus, Trash2, FileText, CheckCircle, Tag } from 'lucide-react';
import { InvoiceItem } from '../../types';
import { supabase } from '../../supabaseClient';

const QuotationForm = () => {
  const { products, customers, currentUser, settings } = useAccounting();
  const { showToast } = useToast();
  
  const [formData, setFormData] = useState({
    customerId: '',
    date: new Date().toISOString().split('T')[0],
    expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    notes: '',
  });

  // Pricing Tier State
  const [pricingTier, setPricingTier] = useState<'retail' | 'wholesale' | 'half'>('retail');

  const [items, setItems] = useState<InvoiceItem[]>([
    { id: '1', productName: '', product_name: '', quantity: 1, unitPrice: 0, unit_price: 0, total: 0 }
  ]);

  const [savedQuote, setSavedQuote] = useState<string | null>(null);

  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const taxRate = settings.enableTax ? (settings.vatRate ? settings.vatRate / 100 : 0.15) : 0;
  const taxAmount = subtotal * taxRate;
  const totalAmount = subtotal + taxAmount;

  const handleItemChange = (index: number, field: keyof InvoiceItem, value: any) => {
    const newItems = [...items];
    let processedValue = value;
    if (field === 'quantity' || field === 'unitPrice') processedValue = parseFloat(value) || 0;

    const item = { ...newItems[index], [field]: processedValue };
    if (field === 'quantity' || field === 'unitPrice' || field === 'productId') {
        item.total = Number(item.quantity) * Number(item.unitPrice);
    }
    if (field === 'productId') {
        const product = products.find(p => p.id === value);
        if (product) {
            item.productName = product.name;
            
            // Logic to pick price based on Tier
            let priceToUse = product.sales_price || product.price || 0; // Default retail
            if (pricingTier === 'wholesale') priceToUse = product.wholesalePrice || product.sales_price || product.price || 0;
            if (pricingTier === 'half') priceToUse = product.halfWholesalePrice || product.sales_price || product.price || 0;

            item.unitPrice = priceToUse;
            item.total = item.quantity * priceToUse;
        }
    }
    newItems[index] = item;
    setItems(newItems);
  };

  const handlePricingTierChange = (tier: 'retail' | 'wholesale' | 'half') => {
      setPricingTier(tier);
      
      const updatedItems = items.map(item => {
          if (!item.productId) return item;
          
          const product = products.find(p => p.id === item.productId);
          if (!product) return item;

          let newPrice = product.sales_price || product.price || 0;
          if (tier === 'wholesale') newPrice = product.wholesalePrice || product.sales_price || product.price || 0;
          if (tier === 'half') newPrice = product.halfWholesalePrice || product.sales_price || product.price || 0;

          return {
              ...item,
              unitPrice: newPrice,
              total: item.quantity * newPrice
          };
      });
      setItems(updatedItems);
  };

  const addItem = () => setItems([...items, { id: Date.now().toString(), productName: '', product_name: '', quantity: 1, unitPrice: 0, unit_price: 0, total: 0 }]);
  const removeItem = (index: number) => items.length > 1 && setItems(items.filter((_, i) => i !== index));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customerId) { showToast('الرجاء اختيار العميل', 'warning'); return; }

    if (currentUser?.role === 'demo') {
        setSavedQuote("تم الحفظ (محاكاة)");
        setItems([{ id: Date.now().toString(), productName: '', product_name: '', quantity: 1, unitPrice: 0, unit_price: 0, total: 0 }]);
        setFormData(prev => ({ ...prev, customerId: '', notes: '' }));
        setTimeout(() => setSavedQuote(null), 3000);
        return;
    }

    try {
        const quotationNumber = `QT-${Date.now().toString().slice(-6)}`;
        
        // 1. حفظ العرض
        const { data: quote, error: quoteError } = await supabase.from('quotations').insert({
            quotation_number: quotationNumber,
            customer_id: formData.customerId,
            quotation_date: formData.date,
            expiry_date: formData.expiryDate,
            subtotal: subtotal,
            tax_amount: taxAmount,
            total_amount: totalAmount,
            status: 'draft',
            notes: formData.notes
        }).select().single();

        if (quoteError) throw quoteError;

        // 2. حفظ البنود
        const quoteItems = items.map(item => ({
            quotation_id: quote.id,
            product_id: item.productId,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            total: item.total
        }));

        const { error: itemsError } = await supabase.from('quotation_items').insert(quoteItems);
        if (itemsError) throw itemsError;

        setSavedQuote("تم الحفظ");
        setItems([{ id: Date.now().toString(), productName: '', product_name: '', quantity: 1, unitPrice: 0, unit_price: 0, total: 0 }]);
        setFormData(prev => ({ ...prev, customerId: '', notes: '' }));
        setTimeout(() => setSavedQuote(null), 3000);

    } catch (error: any) {
        console.error(error);
        showToast('خطأ في حفظ العرض: ' + error.message, 'error');
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <FileText className="text-teal-600" /> عرض سعر جديد (Quotation)
            </h2>
            <p className="text-slate-500">إصدار عرض سعر للعميل قبل الفوترة</p>
        </div>
        {savedQuote && (
            <div className="bg-teal-100 text-teal-800 px-4 py-2 rounded-lg font-bold flex items-center gap-2">
                <CheckCircle size={18} /> {savedQuote}
            </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 bg-teal-50 border-b border-teal-100 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="lg:col-span-1">
                  <label className="block text-sm font-bold text-slate-700 mb-1">العميل</label>
                  <select required className="w-full border rounded p-2" value={formData.customerId} onChange={e => setFormData({...formData, customerId: e.target.value})}>
                      <option value="">اختر...</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
              </div>
              
              {/* Pricing Tier Selector */}
              <div className="lg:col-span-1">
                  <label className="block text-sm font-bold text-slate-700 mb-1 flex items-center gap-1">
                      <Tag size={14} /> نوع السعر
                  </label>
                  <div className="flex bg-white p-1 rounded-lg border border-teal-200">
                      <button
                          type="button"
                          onClick={() => handlePricingTierChange('retail')}
                          className={`flex-1 py-1 text-xs font-bold rounded transition-all ${pricingTier === 'retail' ? 'bg-teal-100 text-teal-800' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                          قطاعي
                      </button>
                      <button
                          type="button"
                          onClick={() => handlePricingTierChange('wholesale')}
                          className={`flex-1 py-1 text-xs font-bold rounded transition-all ${pricingTier === 'wholesale' ? 'bg-blue-100 text-blue-800' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                          جملة
                      </button>
                      <button
                          type="button"
                          onClick={() => handlePricingTierChange('half')}
                          className={`flex-1 py-1 text-xs font-bold rounded transition-all ${pricingTier === 'half' ? 'bg-sky-100 text-sky-800' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                          نصف
                      </button>
                  </div>
              </div>

              <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">تاريخ العرض</label>
                  <input type="date" required className="w-full border rounded p-2" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
              </div>
              <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">تاريخ الانتهاء</label>
                  <input type="date" required className="w-full border rounded p-2" value={formData.expiryDate} onChange={e => setFormData({...formData, expiryDate: e.target.value})} />
              </div>
          </div>

          <div className="p-6">
              <table className="w-full text-right mb-4">
                  <thead>
                      <tr className="border-b text-sm text-slate-500">
                          <th className="pb-2 w-1/3">المنتج</th>
                          <th className="pb-2 w-24 text-center">الكمية</th>
                          <th className="pb-2 w-32 text-center">السعر</th>
                          <th className="pb-2 w-32 text-center">الإجمالي</th>
                          <th className="pb-2 w-10"></th>
                      </tr>
                  </thead>
                  <tbody className="divide-y">
                      {items.map((item, idx) => (
                          <tr key={item.id}>
                              <td className="py-2">
                                  <select className="w-full border rounded p-1 mb-1 text-sm" value={item.productId} onChange={e => handleItemChange(idx, 'productId', e.target.value)}>
                                      <option value="">-- منتج --</option>
                                      {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                  </select>
                                  <input type="text" className="w-full border rounded p-1 text-xs" placeholder="وصف" value={item.productName} onChange={e => handleItemChange(idx, 'productName', e.target.value)} />
                              </td>
                              <td className="py-2"><input type="number" className="w-full border rounded p-1 text-center" value={item.quantity} onChange={e => handleItemChange(idx, 'quantity', e.target.value)} /></td>
                              <td className="py-2"><input type="number" className="w-full border rounded p-1 text-center" value={item.unitPrice} onChange={e => handleItemChange(idx, 'unitPrice', e.target.value)} /></td>
                              <td className="py-2 text-center font-bold">{item.total.toLocaleString()}</td>
                              <td className="py-2 text-center"><button type="button" onClick={() => removeItem(idx)} className="text-red-500"><Trash2 size={16} /></button></td>
                          </tr>
                      ))}
                  </tbody>
              </table>
              <button type="button" onClick={addItem} className="text-teal-600 text-sm font-bold flex items-center gap-1">+ إضافة بند</button>
          </div>

          <div className="bg-slate-50 p-6 border-t flex justify-between items-end">
              <div className="w-1/2">
                  <label className="block text-sm font-bold mb-1">ملاحظات</label>
                  <textarea className="w-full border rounded p-2 text-sm" rows={2} value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} placeholder="الشروط والأحكام..."></textarea>
              </div>
              <div className="text-left space-y-1">
                  <p className="text-sm text-slate-500">المجموع: {subtotal.toLocaleString()}</p>
                  <p className="text-sm text-slate-500">الضريبة: {taxAmount.toLocaleString()}</p>
                  <p className="text-xl font-bold text-slate-800">{totalAmount.toLocaleString()} ج.م</p>
                  <button type="submit" className="bg-teal-600 text-white px-6 py-2 rounded-lg font-bold shadow-lg hover:bg-teal-700 mt-2 flex items-center gap-2">
                      <Save size={18} /> حفظ العرض
                  </button>
              </div>
          </div>
      </form>
    </div>
  );
};

export default QuotationForm;