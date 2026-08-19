import React, { useState, useEffect, useMemo } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { 
  Save, Trash2, FileText, CheckCircle, Tag, Plus, 
  ChevronRight, ChevronLeft, ChevronsRight, ChevronsLeft, 
  Printer, List, RefreshCw, ArrowRightLeft, Loader2, Search, X
} from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { createQuotationSchema } from '../../utils/validationSchemas';
import { useNavigate, useLocation } from 'react-router-dom';
import { QuotationPrint } from './QuotationPrint';

const QuotationForm = ({ quotationId: propQuotationId, onSaveSuccess }: { quotationId?: string, onSaveSuccess?: () => void }) => {
  const { products, customers, currentUser, settings } = useAccounting();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [formData, setFormData] = useState({
    customerId: '',
    date: new Date().toISOString().split('T')[0],
    expiryDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    quotationNumber: '',
    notes: '',
    status: 'draft'
  });

  const [pricingTier, setPricingTier] = useState<'retail' | 'wholesale' | 'half'>('retail');
  const [items, setItems] = useState<any[]>([]);
  const [uoms, setUoms] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  // Navigation & Edit State
  const [editingId, setEditingId] = useState<string | null>(propQuotationId || null);
  const [quoteIds, setQuoteIds] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [quoteToPrint, setQuoteToPrint] = useState<any>(null);
  const [companySettings, setCompanySettings] = useState<any>(null);

  useEffect(() => {
    supabase.rpc('get_current_company_settings').maybeSingle().then(({ data }) => {
      if (data) setCompanySettings(data);
    });
  }, []);

  // جلب كافة معرفات عروض الأسعار للتنقل
  const fetchQuoteIds = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id;
      if (!userOrgId) return;

      const { data, error } = await supabase
        .from('quotations')
        .select('id')
        .eq('organization_id', userOrgId)
        .order('quotation_date', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;
      const ids = (data || []).map(q => q.id);
      setQuoteIds(ids);
    } catch (err) {
      console.error('Error fetching quotation IDs:', err);
    }
  };

  useEffect(() => {
    fetchQuoteIds();
  }, []);

  useEffect(() => {
    const fetchUoms = async () => {
      const orgId = (currentUser as any)?.organization_id;
      const { data } = await supabase.from('uoms').select('*').eq('organization_id', orgId);
      if (data) setUoms(data);
    };
    if (currentUser) fetchUoms();
  }, [currentUser]);

  // تحميل عرض سعر محدد
  const loadQuoteById = async (id: string) => {
    setLoadingQuote(true);
    try {
      const { data: quote, error } = await supabase
        .from('quotations')
        .select(`
          *,
          customers(id, name, phone),
          quotation_items(id, product_id, quantity, unit_price, total, uom_id, products(name, sku, sales_price, base_uom_id))
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!quote) throw new Error('عرض السعر غير موجود');

      setEditingId(quote.id);
      setFormData({
        customerId: quote.customer_id || '',
        date: quote.quotation_date || new Date().toISOString().split('T')[0],
        expiryDate: quote.expiry_date || new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        quotationNumber: quote.quotation_number || '',
        notes: quote.notes || '',
        status: quote.status || 'draft'
      });

      const formattedItems = (quote.quotation_items || []).map((item: any) => ({
        id: item.id,
        productId: item.product_id,
        productName: item.products?.name || 'صنف',
        quantity: Number(item.quantity) || 0,
        unitPrice: Number(item.unit_price) || 0,
        uomId: item.uom_id || item.products?.base_uom_id || '',
        total: Number(item.total) || 0
      }));

      setItems(formattedItems);

      const idx = quoteIds.indexOf(id);
      if (idx !== -1) setCurrentIndex(idx);

    } catch (err: any) {
      console.error('Error loading quotation:', err);
      showToast('فشل تحميل عرض السعر: ' + err.message, 'error');
    } finally {
      setLoadingQuote(false);
    }
  };

  // استقبال عرض سعر ممرر عبر التوجيه
  useEffect(() => {
    if (propQuotationId) {
      loadQuoteById(propQuotationId);
    } else if (location.state && (location.state as any).quoteToEdit) {
      const passed = (location.state as any).quoteToEdit;
      loadQuoteById(passed.id);
    }
  }, [propQuotationId, location.state]);

  const handleNavigate = (direction: 'first' | 'prev' | 'next' | 'last') => {
    if (quoteIds.length === 0) {
      showToast('لا توجد عروض أسعار للتنقل بينها', 'info');
      return;
    }

    let targetIdx = currentIndex;
    if (direction === 'first') {
      targetIdx = 0;
    } else if (direction === 'last') {
      targetIdx = quoteIds.length - 1;
    } else if (direction === 'prev') {
      if (currentIndex <= 0) {
        targetIdx = 0;
        showToast('هذا هو أول عرض سعر مسجل', 'info');
      } else {
        targetIdx = currentIndex - 1;
      }
    } else if (direction === 'next') {
      if (currentIndex >= quoteIds.length - 1 || currentIndex === -1) {
        targetIdx = quoteIds.length - 1;
        showToast('هذا هو آخر عرض سعر مسجل', 'info');
      } else {
        targetIdx = currentIndex + 1;
      }
    }

    if (targetIdx >= 0 && targetIdx < quoteIds.length) {
      loadQuoteById(quoteIds[targetIdx]);
    }
  };

  const handleNewQuote = () => {
    setEditingId(null);
    setCurrentIndex(-1);
    setItems([]);
    setFormData({
      customerId: '',
      date: new Date().toISOString().split('T')[0],
      expiryDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      quotationNumber: '',
      notes: '',
      status: 'draft'
    });
    showToast('تم فتح نموذج عرض سعر جديد ➕', 'info');
  };

  const addItem = (product: any) => {
    let priceToUse = product.sales_price || 0;
    if (pricingTier === 'wholesale') priceToUse = product.wholesalePrice || product.sales_price || 0;
    if (pricingTier === 'half') priceToUse = product.halfWholesalePrice || product.sales_price || 0;

    const defaultUomId = product.sale_uom_id || product.base_uom_id || '';
    const selectedUom = uoms.find(u => u.id === defaultUomId);
    const initialPrice = selectedUom ? Number((priceToUse * selectedUom.ratio).toFixed(4)) : priceToUse;

    setItems([...items, { 
      id: Date.now().toString(),
      productId: product.id, 
      productName: product.name, 
      quantity: 1, 
      unitPrice: initialPrice,
      uomId: defaultUomId,
      total: initialPrice
    }]);
    setProductSearch('');
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items];
    let processedValue = value;
    if (field === 'quantity' || field === 'unitPrice') processedValue = parseFloat(value) || 0;

    newItems[index][field] = processedValue;

    if (field === 'uomId') {
        const selectedUom = uoms.find(u => u.id === value);
        const product = products.find(p => p.id === newItems[index].productId);
        if (selectedUom && product) {
            let basePrice = product.sales_price || 0;
            if (pricingTier === 'wholesale') basePrice = product.wholesalePrice || product.sales_price || 0;
            if (pricingTier === 'half') basePrice = product.halfWholesalePrice || product.sales_price || 0;

            newItems[index].unitPrice = Number((basePrice * selectedUom.ratio).toFixed(4));
        }
    }

    if (field === 'productId') {
      const product = products.find(p => p.id === value);
      if (product) {
        let priceToUse = product.sales_price || 0;
        if (pricingTier === 'wholesale') priceToUse = product.wholesalePrice || product.sales_price || 0;
        if (pricingTier === 'half') priceToUse = product.halfWholesalePrice || product.sales_price || 0;

        newItems[index].productName = product.name;
        newItems[index].unitPrice = priceToUse;
        newItems[index].uomId = product.sale_uom_id || product.base_uom_id || '';
      }
    }

    newItems[index].total = (Number(newItems[index].quantity) || 0) * (Number(newItems[index].unitPrice) || 0);
    setItems(newItems);
  };

  const handlePricingTierChange = (tier: 'retail' | 'wholesale' | 'half') => {
    setPricingTier(tier);
    const updatedItems = items.map(item => {
        if (!item.productId) return item;
        const product = products.find(p => p.id === item.productId);
        if (!product) return item;

        let newPrice = product.sales_price || 0;
        if (tier === 'wholesale') newPrice = product.wholesalePrice || product.sales_price || 0;
        if (tier === 'half') newPrice = product.halfWholesalePrice || product.sales_price || 0;

        const selectedUom = uoms.find(u => u.id === item.uomId);
        if (selectedUom) newPrice = Number((newPrice * selectedUom.ratio).toFixed(4));

        return {
            ...item,
            unitPrice: newPrice,
            total: (Number(item.quantity) || 0) * newPrice
        };
    });
    setItems(updatedItems);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const calculateTotal = () => items.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.unitPrice || 0)), 0);

  const subtotal = calculateTotal();
  const taxRate = settings.enableTax ? (settings.vatRate ? settings.vatRate / 100 : 0.14) : 0;
  const taxAmount = subtotal * taxRate;
  const totalAmount = subtotal + taxAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationResult = createQuotationSchema.safeParse({ 
      ...formData, 
      items: items.map(i => ({
        productId: i.productId,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        total: Number(i.quantity) * Number(i.unitPrice)
      })) 
    });

    if (!validationResult.success) {
        showToast(validationResult.error.issues[0].message, 'warning');
        return;
    }

    setSaving(true);

    if (currentUser?.role === 'demo') {
        showToast('تم حفظ عرض السعر بنجاح ✅ (محاكاة ديمو)', 'success');
        setSaving(false);
        return;
    }

    try {
        const userOrgId = (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;
        if (!userOrgId) throw new Error("تعذر تحديد المنظمة.");

        const quotationNumber = formData.quotationNumber || `QT-${Date.now().toString().slice(-6)}`;
        let quoteId = editingId;

        if (editingId) {
            const { error: updateError } = await supabase.from('quotations').update({
                customer_id: formData.customerId,
                quotation_number: quotationNumber,
                quotation_date: formData.date,
                expiry_date: formData.expiryDate,
                subtotal,
                tax_amount: taxAmount,
                total_amount: totalAmount,
                notes: formData.notes
            }).eq('id', editingId);
            
            if (updateError) throw updateError;
            
            await supabase.from('quotation_items').delete().eq('quotation_id', editingId);

            const quoteItems = items.map(item => ({
                organization_id: userOrgId,
                quotation_id: editingId,
                product_id: item.productId,
                quantity: Number(item.quantity),
                unit_price: Number(item.unitPrice),
                uom_id: item.uomId || null,
                total: Number(item.quantity) * Number(item.unitPrice)
            }));

            const { error: itemsError } = await supabase.from('quotation_items').insert(quoteItems);
            if (itemsError) throw itemsError;

            showToast('تم تحديث عرض السعر بنجاح ✅', 'success');

        } else {
            const { data: quote, error } = await supabase.from('quotations').insert({
                organization_id: userOrgId,
                quotation_number: quotationNumber,
                customer_id: formData.customerId,
                quotation_date: formData.date,
                expiry_date: formData.expiryDate,
                subtotal,
                tax_amount: taxAmount,
                total_amount: totalAmount,
                status: 'draft',
                notes: formData.notes
            }).select().single();
            
            if (error) throw error;
            quoteId = quote.id;

            const quoteItems = items.map(item => ({
                organization_id: userOrgId,
                quotation_id: quote.id,
                product_id: item.productId,
                quantity: Number(item.quantity),
                unit_price: Number(item.unitPrice),
                uom_id: item.uomId || null,
                total: Number(item.quantity) * Number(item.unitPrice)
            }));

            const { error: itemsError } = await supabase.from('quotation_items').insert(quoteItems);
            if (itemsError) throw itemsError;

            showToast('تم حفظ عرض السعر بنجاح ✅', 'success');
        }

        if (onSaveSuccess) onSaveSuccess();
        
        await fetchQuoteIds();
        if (quoteId) {
          loadQuoteById(quoteId);
        }

    } catch (error: any) {
        console.error(error);
        showToast('خطأ في حفظ العرض: ' + error.message, 'error');
    } finally {
        setSaving(false);
    }
  };

  const handleDeleteCurrent = async () => {
    if (!editingId) return;

    if (!window.confirm(`هل أنت متأكد من حذف عرض السعر رقم (${formData.quotationNumber})؟`)) {
      return;
    }

    setDeleting(true);
    try {
      await supabase.from('quotation_items').delete().eq('quotation_id', editingId);
      const { error: delErr } = await supabase.from('quotations').delete().eq('id', editingId);
      if (delErr) throw delErr;

      showToast('تم حذف عرض السعر بنجاح ✅', 'success');

      const newIds = quoteIds.filter(id => id !== editingId);
      setQuoteIds(newIds);

      if (newIds.length > 0) {
        const nextId = newIds[Math.min(currentIndex, newIds.length - 1)];
        loadQuoteById(nextId);
      } else {
        handleNewQuote();
      }

    } catch (err: any) {
      console.error('Error deleting quote:', err);
      showToast('فشل حذف عرض السعر: ' + err.message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handlePrintCurrent = () => {
    const quoteData = {
      quotationNumber: formData.quotationNumber,
      date: formData.date,
      expiryDate: formData.expiryDate,
      customerName: customers.find(c => c.id === formData.customerId)?.name || 'عميل عام',
      notes: formData.notes,
      totalAmount: totalAmount,
      taxAmount: taxAmount,
      items: items.map(item => ({
        productName: item.productName || products.find(p => p.id === item.productId)?.name || 'صنف',
        uomName: uoms.find(u => u.id === item.uomId)?.name || '-',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.total
      }))
    };

    setQuoteToPrint(quoteData);
    setTimeout(() => {
      window.print();
      setQuoteToPrint(null);
    }, 200);
  };

  // تحويل عرض السعر إلى فاتورة مبيعات
  const handleConvertToInvoice = () => {
    if (!editingId) return;
    
    // توجيه المستخدم لشاشة فاتورة المبيعات مع تمرير البيانات
    navigate('/sales-invoice', { 
      state: { 
        quotationToConvert: {
          customerId: formData.customerId,
          notes: `محول من عرض السعر رقم: ${formData.quotationNumber}`,
          items: items.map(i => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            uomId: i.uomId
          }))
        } 
      } 
    });
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.sku && p.sku.toLowerCase().includes(productSearch.toLowerCase()))
  ).slice(0, 8);

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in">
      
      {/* 🚀 Header & Navigation Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
        
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-teal-50 text-teal-600 rounded-xl">
            <FileText size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
              {editingId ? `عرض سعر: ${formData.quotationNumber}` : 'عرض سعر جديد'}
              {editingId && (
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                  formData.status === 'accepted' ? 'bg-emerald-100 text-emerald-700' : 'bg-teal-100 text-teal-700'
                }`}>
                  {formData.status === 'accepted' ? 'معتمد ✅' : 'عرض سعر 📄'}
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-400 font-bold">إصدار عروض أسعار رسمية للعملاء قبل الفوترة والتعميد</p>
          </div>
        </div>

        {/* 🧭 أسهم التنقل بين عروض الأسعار */}
        <div className="flex items-center gap-1 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
          <button 
            type="button" 
            onClick={() => handleNavigate('first')} 
            disabled={quoteIds.length === 0 || currentIndex === 0} 
            title="أول عرض سعر"
            className="p-2 text-slate-600 hover:bg-white hover:text-teal-600 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronsRight size={18} />
          </button>
          
          <button 
            type="button" 
            onClick={() => handleNavigate('prev')} 
            disabled={quoteIds.length === 0 || currentIndex <= 0} 
            title="عرض السعر السابق"
            className="p-2 text-slate-600 hover:bg-white hover:text-teal-600 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronRight size={18} />
          </button>

          {/* Record Counter */}
          <div className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-mono font-black text-slate-700 select-none">
            {loadingQuote ? (
              <Loader2 size={14} className="animate-spin text-teal-600" />
            ) : editingId && currentIndex !== -1 ? (
              <span>{currentIndex + 1} / {quoteIds.length}</span>
            ) : (
              <span className="text-teal-600 font-bold">جديد ➕</span>
            )}
          </div>

          <button 
            type="button" 
            onClick={() => handleNavigate('next')} 
            disabled={quoteIds.length === 0 || currentIndex >= quoteIds.length - 1 || currentIndex === -1} 
            title="عرض السعر التالي"
            className="p-2 text-slate-600 hover:bg-white hover:text-teal-600 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronLeft size={18} />
          </button>

          <button 
            type="button" 
            onClick={() => handleNavigate('last')} 
            disabled={quoteIds.length === 0 || currentIndex >= quoteIds.length - 1 || currentIndex === -1} 
            title="آخر عرض سعر"
            className="p-2 text-slate-600 hover:bg-white hover:text-teal-600 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronsLeft size={18} />
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button 
            type="button" 
            onClick={() => navigate('/quotations-list')} 
            className="bg-slate-100 text-slate-700 hover:bg-slate-200 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
            title="عرض سجل عروض الأسعار"
          >
            <List size={16} /> سجل العروض
          </button>

          <button 
            type="button" 
            onClick={handleNewQuote} 
            className="bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
            title="بدء عرض سعر جديد"
          >
            <Plus size={16} /> جديد
          </button>

          {editingId && (
            <>
              <button 
                type="button" 
                onClick={handleConvertToInvoice} 
                className="bg-purple-600 text-white hover:bg-purple-700 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
                title="تحويل عرض السعر إلى فاتورة مبيعات مباشرة"
              >
                <ArrowRightLeft size={16} /> تحويل لفاتورة
              </button>

              <button 
                type="button" 
                onClick={handlePrintCurrent} 
                className="bg-slate-800 text-white hover:bg-slate-700 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                title="طباعة عرض السعر"
              >
                <Printer size={16} /> طباعة
              </button>

              <button 
                type="button" 
                onClick={handleDeleteCurrent} 
                disabled={deleting} 
                className="bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                title="حذف عرض السعر"
              >
                {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} حذف
              </button>
            </>
          )}

          <button 
            type="button" 
            onClick={handleSubmit} 
            disabled={saving} 
            className="bg-teal-600 text-white px-5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 hover:bg-teal-700 transition-colors shadow-sm disabled:opacity-50"
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} 
            {editingId ? 'حفظ التعديلات' : 'حفظ عرض السعر'}
          </button>
        </div>
      </div>

      {/* Main Form Body */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-1">
            <label className="block text-xs font-bold text-slate-700 mb-1">العميل <span className="text-red-500">*</span></label>
            <select 
              required 
              className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm font-bold outline-none focus:border-teal-500" 
              value={formData.customerId} 
              onChange={e => setFormData({...formData, customerId: e.target.value})}
            >
              <option value="">اختر العميل...</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          
          {/* Pricing Tier Selector */}
          <div className="lg:col-span-1">
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <Tag size={14} /> مستوى التسعير
            </label>
            <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => handlePricingTierChange('retail')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${pricingTier === 'retail' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                قطاعي
              </button>
              <button
                type="button"
                onClick={() => handlePricingTierChange('wholesale')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${pricingTier === 'wholesale' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                جملة
              </button>
              <button
                type="button"
                onClick={() => handlePricingTierChange('half')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${pricingTier === 'half' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                نصف جملة
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ العرض <span className="text-red-500">*</span></label>
            <input 
              type="date" 
              required 
              className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm font-bold outline-none focus:border-teal-500" 
              value={formData.date} 
              onChange={e => setFormData({...formData, date: e.target.value})} 
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ انتهاء السريان <span className="text-red-500">*</span></label>
            <input 
              type="date" 
              required 
              className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm font-bold outline-none focus:border-teal-500" 
              value={formData.expiryDate} 
              onChange={e => setFormData({...formData, expiryDate: e.target.value})} 
            />
          </div>

          <div className="md:col-span-2 lg:col-span-4">
            <label className="block text-xs font-bold text-slate-700 mb-1">شروط وملاحظات العرض</label>
            <input 
              type="text" 
              className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm outline-none focus:border-teal-500" 
              value={formData.notes} 
              onChange={e => setFormData({...formData, notes: e.target.value})} 
              placeholder="الشروط والأحكام، فترات التسليم، طريقة الدفع..." 
            />
          </div>
        </div>

        {/* Items Section */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
          
          {/* Product Search */}
          <div className="relative">
            <label className="block text-xs font-bold text-slate-600 mb-1">إضافة صنف لعرض السعر</label>
            <div className="relative">
              <input 
                type="text" 
                placeholder="ابحث باسم الصنف أو الباركود لإضافته..." 
                className="w-full border rounded-xl p-2.5 pl-10 bg-slate-50 focus:bg-white text-sm outline-none focus:border-teal-500 transition-colors" 
                value={productSearch} 
                onChange={e => setProductSearch(e.target.value)} 
              />
              <Search className="absolute left-3 top-3 text-slate-400" size={18} />
            </div>

            {productSearch && filteredProducts.length > 0 && (
              <div className="absolute top-full left-0 w-full bg-white border border-slate-200 shadow-xl rounded-xl mt-1 z-20 overflow-hidden">
                {filteredProducts.map(p => (
                  <div 
                    key={p.id} 
                    onClick={() => addItem(p)} 
                    className="p-3 hover:bg-teal-50 cursor-pointer border-b last:border-0 flex justify-between items-center transition-colors"
                  >
                    <div>
                      <span className="font-bold text-slate-800 text-sm block">{p.name}</span>
                      <span className="text-xs text-slate-400 font-mono">الكود: {p.sku || '-'}</span>
                    </div>
                    <span className="text-teal-600 font-mono font-bold text-sm">
                      {(p.sales_price || 0).toLocaleString()} {settings.currency || 'ج.م'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-xs font-bold text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="p-3">الصنف / البيان</th>
                  <th className="p-3 w-32 text-center">الوحدة</th>
                  <th className="p-3 w-28 text-center">الكمية</th>
                  <th className="p-3 w-32 text-center">سعر الوحدة</th>
                  <th className="p-3 w-32 text-center">الإجمالي</th>
                  <th className="p-3 w-12 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-3">
                      <div className="space-y-1">
                        <select 
                          className="w-full border rounded-lg p-1.5 text-xs bg-white font-bold" 
                          value={item.productId || ''} 
                          onChange={e => updateItem(idx, 'productId', e.target.value)}
                        >
                          <option value="">-- اختر المنتج --</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <input 
                          type="text" 
                          className="w-full border rounded-lg p-1 text-xs text-slate-600" 
                          placeholder="وصف إضافي أو تخصيص..." 
                          value={item.productName || ''} 
                          onChange={e => updateItem(idx, 'productName', e.target.value)} 
                        />
                      </div>
                    </td>
                    <td className="p-3">
                      <select 
                        value={item.uomId || ''} 
                        onChange={e => updateItem(idx, 'uomId', e.target.value)}
                        className="w-full border rounded-lg p-1.5 text-xs bg-white font-bold"
                      >
                        {uoms.filter(u => {
                            const prod = products.find(p => p.id === item.productId);
                            const baseUom = uoms.find(ux => ux.id === prod?.base_uom_id);
                            return !baseUom || u.category_id === baseUom.category_id;
                        }).map(u => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3">
                      <input 
                        type="number" 
                        step="any" 
                        min="0.01"
                        className="w-full border rounded-lg p-1.5 text-center font-mono font-bold text-teal-700 bg-white" 
                        value={item.quantity} 
                        onChange={e => updateItem(idx, 'quantity', Number(e.target.value))} 
                      />
                    </td>
                    <td className="p-3">
                      <input 
                        type="number" 
                        step="any" 
                        min="0"
                        className="w-full border rounded-lg p-1.5 text-center font-mono font-bold text-slate-800 bg-white" 
                        value={item.unitPrice} 
                        onChange={e => updateItem(idx, 'unitPrice', Number(e.target.value))} 
                      />
                    </td>
                    <td className="p-3 text-center font-mono font-black text-slate-900" dir="ltr">
                      {((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-3 text-center">
                      <button 
                        type="button" 
                        onClick={() => removeItem(idx)} 
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="حذف الصنف"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400 font-bold">
                      لم تتم إضافة أي أصناف بعد. ابحث عن صنف بالأعلى لإضافته.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Totals Section */}
          <div className="border-t border-slate-200 pt-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="text-xs text-slate-500 font-bold">
              عدد البنود: <span className="font-mono text-slate-800">{items.length}</span> صنف
            </div>

            <div className="w-full md:w-80 space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="flex justify-between text-xs font-bold text-slate-600">
                <span>الإجمالي قبل الضريبة:</span>
                <span className="font-mono">{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {settings.currency || 'ج.م'}</span>
              </div>
              {settings.enableTax && (
                <div className="flex justify-between text-xs font-bold text-slate-600">
                  <span>ضريبة القيمة المضافة ({settings.vatRate || 14}%):</span>
                  <span className="font-mono">{taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {settings.currency || 'ج.م'}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-black text-teal-800 border-t border-slate-200 pt-2">
                <span>إجمالي عرض السعر:</span>
                <span className="font-mono text-lg" dir="ltr">{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {settings.currency || 'ج.م'}</span>
              </div>
            </div>
          </div>

        </div>
      </form>

      {/* Hidden printable component */}
      {quoteToPrint && (
        <QuotationPrint quoteData={quoteToPrint} companySettings={companySettings} />
      )}
    </div>
  );
};

export default QuotationForm;
