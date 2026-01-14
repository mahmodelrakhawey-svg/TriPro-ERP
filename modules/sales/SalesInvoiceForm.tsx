import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { 
    Plus, Trash2, Save, User, Calendar, ShoppingCart, Warehouse,
    Wallet, Search, X, ChevronDown, Check, AlertCircle, Percent,
    CircleDollarSign, Tag, Package, Box, Info, ArrowLeft, ArrowRight,
    ArrowDown, Trash, Calculator, UserCheck, Printer, Barcode, Loader2, CheckCircle
} from 'lucide-react';
import { InvoiceItem, AccountType, Product } from '../../types';
import { supabase } from '../../supabaseClient';
import { useNavigate, useLocation } from 'react-router-dom';

const SalesInvoiceForm = () => {
  const { products, warehouses, salespeople, accounts, costCenters, approveSalesInvoice, addCustomer, settings, can, currentUser, customers, invoices: contextInvoices } = useAccounting();
  const navigate = useNavigate();
  const location = useLocation();

  const [formData, setFormData] = useState({
    customerId: '',
    invoiceNumber: '',
    warehouseId: '',
    salespersonId: '',
    costCenterId: '',
    date: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    notes: '',
    status: 'draft' as 'draft' | 'posted' | 'paid' | 'partial',
    paidAmount: 0,
    treasuryId: '',
    discountType: 'fixed' as 'percentage' | 'fixed',
    discountValue: 0,
    currency: 'SAR',
    exchangeRate: 1
  });

  const [pricingTier, setPricingTier] = useState<'retail' | 'wholesale' | 'half'>('retail');
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [showProductResults, setShowProductResults] = useState(false);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [customerBalance, setCustomerBalance] = useState(0);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const treasuryAccounts = useMemo(() => accounts.filter(a => {
    if (a.isGroup) return false;
    
    const type = String(a.type || '').toLowerCase();
    const name = a.name.toLowerCase();
    const code = a.code;

    // استبعاد حسابات العملاء والموردين والمخزون بشكل صريح لتجنب الخطأ
    if (code.startsWith('10201') || code.startsWith('201') || code.startsWith('103')) return false;

    const isAsset = type.includes('asset') || type.includes('أصول') || type === '';
    const hasKeyword = name.includes('نقد') || name.includes('خزينة') || name.includes('بنك') || name.includes('صندوق') || name.includes('cash') || name.includes('bank');
    const hasCode = code.startsWith('101'); // 101: النقدية وما في حكمها

    return isAsset && (hasKeyword || hasCode);
  }), [accounts]);

  useEffect(() => {
    if (!formData.customerId) {
      const cashCustomer = customers.find(c => c.name === 'عميل نقدي');
      if (cashCustomer) setFormData(prev => ({ ...prev, customerId: cashCustomer.id }));
    }
    if (!formData.warehouseId && warehouses.length > 0) setFormData(prev => ({ ...prev, warehouseId: warehouses[0].id }));
    const firstSalesperson = salespeople.find(s => s.id !== '00000000-0000-0000-0000-000000000000');
    if (!formData.salespersonId && firstSalesperson) setFormData(prev => ({ ...prev, salespersonId: firstSalesperson.id }));
    if (!formData.treasuryId && treasuryAccounts.length > 0) setFormData(prev => ({ ...prev, treasuryId: treasuryAccounts[0].id }));
    
    if (!formData.currency && settings.currency) {
        setFormData(prev => ({ ...prev, currency: settings.currency }));
    }

    if(barcodeInputRef.current) barcodeInputRef.current.focus();
  }, [customers, warehouses, salespeople, treasuryAccounts]);

  // حساب مديونية العميل عند اختياره
  useEffect(() => {
    const fetchBalance = async () => {
        if (!formData.customerId) {
            setCustomerBalance(0);
            return;
        }

        if (currentUser?.role === 'demo') {
            const bal = contextInvoices
                .filter(inv => inv.customerId === formData.customerId && inv.status !== 'draft' && inv.status !== 'paid')
                .reduce((acc, inv) => acc + (inv.totalAmount - (inv.paid_amount || 0)), 0);
            setCustomerBalance(bal);
            return;
        }
        
        // جلب الفواتير المرحلة وغير المدفوعة بالكامل
        const { data } = await supabase
            .from('invoices')
            .select('total_amount, paid_amount')
            .eq('customer_id', formData.customerId)
            .neq('status', 'draft')
            .neq('status', 'paid'); 
        
        if (data) {
            const bal = data.reduce((acc, inv) => acc + (inv.total_amount - (inv.paid_amount || 0)), 0);
            setCustomerBalance(bal);
        }
    };
    fetchBalance();
  }, [formData.customerId, currentUser, contextInvoices]);

  // Load invoice data if editing
  useEffect(() => {
    if (location.state && location.state.invoiceToEdit) {
      const invId = location.state.invoiceToEdit.id;
      
      const fetchInvoiceDetails = async () => {
          const { data: fullInv } = await supabase.from('invoices').select('*').eq('id', invId).single();
          
          if (fullInv) {
              if (fullInv.status !== 'draft' && !can('sales', 'update')) {
                  alert('تنبيه: هذه الفاتورة مرحلة ولا يمكن تعديلها. يمكنك إنشاء إشعار دائن (مرتجع) لتصحيحها.');
              }

              setEditingId(fullInv.id);
              setFormData(prev => ({
                ...prev,
                customerId: fullInv.customer_id || '',
                invoiceNumber: fullInv.invoice_number || '',
                date: fullInv.invoice_date || new Date().toISOString().split('T')[0],
                salespersonId: fullInv.salesperson_id || '',
                notes: fullInv.notes || '',
                status: fullInv.status || 'draft',
                currency: fullInv.currency || settings.currency || 'SAR',
                exchangeRate: fullInv.exchange_rate || 1,
                warehouseId: fullInv.warehouse_id || '',
                paidAmount: fullInv.paid_amount || 0,
                treasuryId: fullInv.treasury_account_id || '',
                discountValue: fullInv.discount_amount || 0,
                discountType: 'fixed',
                costCenterId: fullInv.cost_center_id || ''
              }));

              // Fetch items
              const { data: itemsData } = await supabase.from('invoice_items').select('*, products(name, sku)').eq('invoice_id', fullInv.id);
              if (itemsData) {
                 setItems(itemsData.map((i: any) => ({
                   id: i.id,
                   productId: i.product_id,
                   product_id: i.product_id,
                   productName: i.products?.name,
                   product_name: i.products?.name,
                   productSku: i.products?.sku,
                   product_sku: i.products?.sku,
                   quantity: i.quantity,
                   unitPrice: i.price,
                   unit_price: i.price,
                   total: i.total
                 })));
              }
          }
      };
      
      fetchInvoiceDetails();
    }
  }, [location]);

  const subtotal = items.reduce((sum, item) => sum + item.total, 0);

  let discountAmount = 0;
  if (formData.discountType === 'percentage') {
      discountAmount = subtotal * (formData.discountValue / 100);
  } else {
      discountAmount = formData.discountValue;
  }
  discountAmount = Math.min(discountAmount, subtotal);

  const netSales = subtotal - discountAmount;
  const taxRate = settings.enableTax ? (settings.vat_rate || 0.14) : 0;
  const taxAmount = netSales * taxRate;
  const totalAmount = netSales + taxAmount;
  const remainingBalance = Math.max(0, totalAmount - formData.paidAmount);

  // التحقق من حد الائتمان
  const selectedCustomer = customers.find(c => c.id === formData.customerId);
  const currentInvoiceDebt = Math.max(0, totalAmount - formData.paidAmount);
  const totalProjectedDebt = customerBalance + currentInvoiceDebt;
  const isOverLimit = selectedCustomer?.credit_limit > 0 && totalProjectedDebt > selectedCustomer.credit_limit;

  const filteredProducts = useMemo(() => {
      if (!productSearchTerm.trim()) return [];
      const term = productSearchTerm.toLowerCase();
      return products.filter(p =>
          p.name.toLowerCase().includes(term) ||
          (p.sku && p.sku.toLowerCase().includes(term))
      ).slice(0, 8);
  }, [productSearchTerm, products]);

  const getProductPrice = (product: any) => {
      const price = product.sales_price || product.price || 0;
      if (pricingTier === 'wholesale') return product.wholesalePrice || price;
      if (pricingTier === 'half') return product.halfWholesalePrice || price;
      return price;
  };

  const addProductToInvoice = (product: Product) => {
      const existingItemIndex = items.findIndex(i => i.productId === product.id);
      const price = getProductPrice(product);

      if (existingItemIndex > -1) {
          const newItems = [...items];
          newItems[existingItemIndex].quantity += 1;
          newItems[existingItemIndex].total = newItems[existingItemIndex].quantity * newItems[existingItemIndex].unitPrice;
          setItems(newItems);
      } else {
          setItems([...items, {
              id: Date.now().toString(),
              productId: product.id,
              product_id: product.id,
              productName: product.name,
              product_name: product.name,
              productSku: product.sku,
              product_sku: product.sku,
              quantity: 1,
              unitPrice: price,
              unit_price: price,
              total: price
          }]);
      }
      setProductSearchTerm('');
      setShowProductResults(false);
  };

  const handleBarcodeSearch = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const sku = e.currentTarget.value.trim();
      if (!sku) return;

      const product = products.find(p => p.sku === sku);

      if (product) {
        addProductToInvoice(product);
        e.currentTarget.value = ''; 
      } else {
        alert('المنتج غير موجود أو الباركود غير صحيح');
      }
    }
  };

  const handleItemChange = (index: number, field: keyof InvoiceItem, value: any) => {
    const newItems = [...items];
    let processedValue = value;
    if (field === 'quantity') processedValue = Math.max(0.01, parseFloat(value) || 0);
    else if (field === 'unitPrice') processedValue = Math.max(0, parseFloat(value) || 0);

    newItems[index] = { ...newItems[index], [field]: processedValue };
    newItems[index].total = newItems[index].quantity * newItems[index].unitPrice;
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleQuickAddCustomer = async (e: React.FormEvent) => {
      e.preventDefault();
      if(newCustomerName) {
          try {
              const data = await addCustomer({ name: newCustomerName, phone: newCustomerPhone } as any);
              setFormData(prev => ({ ...prev, customerId: data.id })); // اختيار العميل الجديد
              setNewCustomerName('');
              setNewCustomerPhone('');
              setIsCustomerModalOpen(false);
          } catch (err: any) { alert(err.message); }
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const isPosted = formData.status === 'posted' || formData.status === 'paid';

    if (editingId && isPosted && !can('sales', 'update')) {
        alert('عذراً، لا تملك صلاحية تعديل الفواتير المرحلة. يرجى إنشاء إشعار دائن.');
        return;
    }

    if (!formData.customerId || items.length === 0) {
        alert('الرجاء التأكد من اختيار العميل وإضافة أصناف للفاتورة.');
        return;
    }

    if (formData.paidAmount > 0 && !formData.treasuryId) {
        alert('يرجى اختيار الخزينة أو البنك لاستلام المبلغ المدفوع.');
        return;
    }
    
    // Check stock availability
    if (!settings.allowNegativeStock) {
        for (const item of items) {
            const product = products.find(p => p.id === item.productId);
            const stockInWarehouse = product?.warehouseStock?.[formData.warehouseId] || 0;
            if (item.quantity > stockInWarehouse) {
                alert(`رصيد غير كافٍ للصنف "${item.productName}".\nالمتوفر: ${stockInWarehouse}, المطلوب: ${item.quantity}`);
                setSaving(false);
                return;
            }
        }
    }

    setSaving(true);

    if (currentUser?.role === 'demo') {
        setSuccessMessage('تم حفظ الفاتورة كمسودة بنجاح! (محاكاة)');
        setItems([]);
        setFormData(prev => ({
            ...prev,
            notes: '',
            paidAmount: 0,
            discountValue: 0,
            invoiceNumber: ''
        }));
        setTimeout(() => setSuccessMessage(null), 4000);
        setSaving(false);
        return;
    }

    // توليد رقم فاتورة فريد مرة واحدة لاستخدامه في القيد والفاتورة
    const invoiceNumber = formData.invoiceNumber || `INV-${Date.now().toString().slice(-6)}`;

    // إنشاء قيد اليومية تلقائياً (Sales Journal Entry)
    // ملاحظة: في هذا التصميم، يتم حفظ الفاتورة كمسودة أولاً.
    // القيد المحاسبي الفعلي وتحديث المخزون يتم عند "اعتماد" الفاتورة من شاشة سجل الفواتير.
    // لذلك، سنقوم فقط بحفظ بيانات الفاتورة بما في ذلك المبلغ المدفوع والخزينة.
    // تم تعديل دالة الاعتماد في السياق المحاسبي للتعامل مع هذه البيانات.
    try {       
        // Prepare invoice data
        const invoiceData = {
            invoice_number: invoiceNumber,
            customer_id: formData.customerId,
            warehouse_id: formData.warehouseId,
            salesperson_id: (formData.salespersonId && formData.salespersonId !== '00000000-0000-0000-0000-000000000000') ? formData.salespersonId : null,
            invoice_date: formData.date ? formData.date : new Date().toISOString().split('T')[0],
            total_amount: Number(totalAmount),
            tax_amount: Number(taxAmount),
            notes: formData.notes,
            status: 'draft', // Always save as draft, approval is a separate step
            // حقول جديدة للتعامل مع الدفع الجزئي والخصم
            subtotal: subtotal,
            discount_amount: discountAmount,
            paid_amount: formData.paidAmount,
            treasury_account_id: formData.paidAmount > 0 ? formData.treasuryId : null,
            currency: formData.currency,
            exchange_rate: formData.exchangeRate,
            cost_center_id: formData.costCenterId || null
        };

        let invoiceId = editingId;

        if (editingId) {
            // Update existing invoice
            const { error: updateError } = await supabase.from('invoices').update(invoiceData).eq('id', editingId);
            if (updateError) throw updateError;
            
            // Delete old items to replace with new ones
            await supabase.from('invoice_items').delete().eq('invoice_id', editingId);
        } else {
            // Insert new invoice
            const { data: invoice, error: insertError } = await supabase.from('invoices').insert(invoiceData).select().single();
            if (insertError) throw insertError;
            invoiceId = invoice.id;
        }

        // Insert items
        if (invoiceId) {
            for (const item of items) {
                // جلب التكلفة الحالية للمنتج لحفظها في الفاتورة (لتقارير الربحية)
                const product = products.find(p => p.id === item.productId);
                const itemCost = product?.cost || product?.purchase_price || 0;

                await supabase.from('invoice_items').insert({
                    invoice_id: invoiceId,
                    product_id: item.productId,
                    quantity: Number(item.quantity),
                    price: Number(item.unitPrice),
                    total: Number(item.total),
                    cost: itemCost // حفظ التكلفة
                });
            }
        }

        setSuccessMessage('تم حفظ الفاتورة كمسودة بنجاح!');
        // تفريغ النموذج
        setItems([]);
        setFormData(prev => ({
            ...prev,
            notes: '',
            paidAmount: 0,
            discountValue: 0,
            invoiceNumber: ''
        }));
        setTimeout(() => setSuccessMessage(null), 4000);
        if(barcodeInputRef.current) barcodeInputRef.current.focus();

    } catch (err: any) {
        console.error("فشل حفظ الفاتورة", err);
        alert("حدث خطأ أثناء حفظ الفاتورة: " + err.message);
    } finally {
        setSaving(false);
    }
  };

  const handleSaveAndPost = async () => {
    // Same validations as handleSubmit
    if (editingId) {
        alert('لا يمكن ترحيل فاتورة معدلة مباشرة. يرجى الحفظ كمسودة ثم الترحيل من سجل الفواتير.');
        return;
    }
    if (!formData.customerId || items.length === 0) {
        alert('الرجاء التأكد من اختيار العميل وإضافة أصناف للفاتورة.');
        return;
    }
    if (formData.paidAmount > 0 && !formData.treasuryId) {
        alert('يرجى اختيار الخزينة أو البنك لاستلام المبلغ المدفوع.');
        return;
    }
    if (!settings.allowNegativeStock) {
        for (const item of items) {
            const product = products.find(p => p.id === item.productId);
            const stockInWarehouse = product?.warehouseStock?.[formData.warehouseId] || 0;
            if (item.quantity > stockInWarehouse) {
                alert(`رصيد غير كافٍ للصنف "${item.productName}".\nالمتوفر: ${stockInWarehouse}, المطلوب: ${item.quantity}`);
                return;
            }
        }
    }

    setSaving(true);

    if (currentUser?.role === 'demo') {
        setSuccessMessage('تم حفظ الفاتورة وترحيلها بنجاح! (محاكاة)');
        setItems([]);
        setFormData(prev => ({ ...prev, notes: '', paidAmount: 0, discountValue: 0, invoiceNumber: '' }));
        setTimeout(() => setSuccessMessage(null), 4000);
        setSaving(false);
        return;
    }
    
    try {
        // --- 1. Save Invoice Data (similar to handleSubmit) ---
        const invoiceNumber = formData.invoiceNumber || `INV-${Date.now().toString().slice(-6)}`;
        const invoiceData = {
            invoice_number: invoiceNumber,
            customer_id: formData.customerId,
            warehouse_id: formData.warehouseId,
            salesperson_id: (formData.salespersonId && formData.salespersonId !== '00000000-0000-0000-0000-000000000000') ? formData.salespersonId : null,
            invoice_date: formData.date ? formData.date : new Date().toISOString().split('T')[0],
            total_amount: Number(totalAmount),
            tax_amount: Number(taxAmount),
            notes: formData.notes,
            status: 'draft', // Always save as draft first
            subtotal: subtotal,
            discount_amount: discountAmount,
            paid_amount: formData.paidAmount,
            treasury_account_id: formData.paidAmount > 0 ? formData.treasuryId : null,
            currency: formData.currency,
            exchange_rate: formData.exchangeRate,
            cost_center_id: formData.costCenterId || null
        };

        const { data: invoice, error: insertError } = await supabase.from('invoices').insert(invoiceData).select().single();
        if (insertError) throw insertError;
        const invoiceId = invoice.id;

        for (const item of items) {
            const product = products.find(p => p.id === item.productId);
            const itemCost = product?.cost || product?.purchase_price || 0;
            await supabase.from('invoice_items').insert({
                invoice_id: invoiceId,
                product_id: item.productId,
                quantity: Number(item.quantity),
                price: Number(item.unitPrice),
                total: Number(item.total),
                cost: itemCost
            });
        }

        // --- 2. Approve the newly created invoice ---
        await approveSalesInvoice(invoiceId);

        // --- 3. Handle UI feedback and form reset ---
        setSuccessMessage('تم حفظ الفاتورة وترحيلها بنجاح!');
        setItems([]);
        setFormData(prev => ({ ...prev, notes: '', paidAmount: 0, discountValue: 0, invoiceNumber: '' }));
        setTimeout(() => setSuccessMessage(null), 4000);
        if(barcodeInputRef.current) barcodeInputRef.current.focus();

    } catch (err: any) {
        console.error("فشل الحفظ والترحيل", err);
        alert("حدث خطأ أثناء الحفظ والترحيل: " + err.message);
    } finally {
        setSaving(false);
    }
  };

  const getProductStock = (productId?: string) => {
      if (!productId || !formData.warehouseId) return 0;
      const product = products.find(p => p.id === productId);
      // Note: In a real app, stock should be fetched per warehouse. 
      // Here we use the global stock for simplicity or assume single warehouse logic if not implemented fully.
      return product?.stock || 0;
  };

  const handlePrint = () => {
      window.print();
  };

  const handleThermalPrint = () => {
      // إضافة كلاس للطباعة الحرارية للجسم مؤقتاً
      document.body.classList.add('thermal-print');
      window.print();
      // إزالة الكلاس بعد الطباعة (أو بعد فترة قصيرة)
      setTimeout(() => document.body.classList.remove('thermal-print'), 1000);
  };

  const handleCreateCreditNote = () => {
      navigate('/credit-note', { state: { 
          customerId: formData.customerId, 
          amount: totalAmount,
          notes: `تسوية للفاتورة رقم ${formData.invoiceNumber}`
      }});
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 animate-in fade-in duration-500">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-6">
          {(settings as any).logoUrl && (
            <img 
              src={(settings as any).logoUrl} 
              alt="Company Logo" 
              className="w-20 h-20 object-contain rounded-xl border border-slate-100 p-1" 
            />
          )}
          <div>
            <div className="flex items-center gap-2 text-blue-600 mb-1">
               <Box size={20} className="animate-pulse" />
               <span className="text-xs font-bold uppercase tracking-widest">إصدار مستند</span>
            </div>
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">{editingId ? 'تعديل فاتورة مبيعات' : 'فاتورة مبيعات ضريبية'}</h2>
            <p className="text-slate-500 font-medium mt-1">تجهيز طلب العميل وتسجيل الحركات المخزنية والمالية</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
            {successMessage && (
                <div className="bg-emerald-50 text-emerald-700 px-6 py-3 rounded-2xl animate-in zoom-in font-black flex items-center gap-2 border border-emerald-100 shadow-sm">
                    <Check size={20} /> {successMessage}
                </div>
            )}
            <div className="bg-slate-50 px-4 py-2 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600">
                <span className="opacity-50">رقم الفاتورة:</span> 
                <span className="mr-2 font-mono text-blue-600">{formData.invoiceNumber || 'تلقائي'}</span>
            </div>
            <div className="flex gap-2 print:hidden">
                <button onClick={handlePrint} className="bg-slate-800 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-700 shadow-sm text-sm font-bold">
                    <Printer size={16} /> طباعة A4
                </button>
                <button onClick={handleThermalPrint} className="bg-slate-800 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-700 shadow-sm text-sm font-bold">
                    <Printer size={16} /> طباعة حرارية
                </button>
            </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Main Content Area (Left 8 cols) */}
        <fieldset disabled={formData.status !== 'draft' && !can('sales', 'update')} className="lg:col-span-8 space-y-6">
            
            {/* Customer & Logistics Card */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Customer Selection */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-black text-slate-700 flex items-center gap-2">
                                <User className="text-blue-500" size={18} /> اختيار العميل
                            </label>
                            <button 
                                type="button" 
                                onClick={() => setIsCustomerModalOpen(true)}
                                className="text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border border-blue-100"
                            >
                                + عميل جديد
                            </button>
                        </div>
                        <div className="relative group">
                            <select 
                                required
                                value={formData.customerId}
                                onChange={(e) => setFormData({...formData, customerId: e.target.value})}
                                className="w-full border-2 border-slate-100 group-hover:border-slate-200 rounded-2xl px-4 py-4 text-lg font-bold focus:outline-none focus:border-blue-500 bg-slate-50 transition-all appearance-none pr-12 shadow-inner"
                            >
                                <option value="">اختر العميل...</option>
                                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <User className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                            <ChevronDown className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                        </div>
                        
                        {/* تنبيه تجاوز حد الائتمان */}
                        {isOverLimit && (
                            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                                <AlertCircle className="text-red-600 shrink-0 mt-0.5" size={18} />
                                <div>
                                    <h4 className="text-sm font-bold text-red-800">تنبيه: تجاوز حد الائتمان</h4>
                                    <p className="text-xs text-red-600 mt-1">
                                        رصيد العميل الحالي: {customerBalance.toLocaleString()} <br/>
                                        حد الائتمان: {selectedCustomer?.credit_limit?.toLocaleString()} <br/>
                                        الإجمالي المتوقع: <span className="font-bold">{totalProjectedDebt.toLocaleString()}</span>
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Salesperson & Warehouse & Date Selection */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                <UserCheck className="text-indigo-500" size={16} /> البائع المسؤول
                            </label>
                            <select 
                                required
                                value={formData.salespersonId}
                                onChange={(e) => setFormData({...formData, salespersonId: e.target.value})}
                                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 outline-none bg-white"
                            >
                                <option value="">اختر البائع...</option>
                                {salespeople.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                <Warehouse className="text-amber-500" size={16} /> مستودع الصرف
                            </label>
                            <select 
                                required
                                value={formData.warehouseId}
                                onChange={(e) => setFormData({...formData, warehouseId: e.target.value})}
                                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 outline-none bg-white"
                            >
                                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                <Calendar className="text-purple-500" size={16} /> التاريخ
                            </label>
                            <input 
                                type="date"
                                required
                                value={formData.date}
                                onChange={(e) => setFormData({...formData, date: e.target.value})}
                                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 outline-none"
                            />
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
                
                {/* Pricing Tier Selector - Modern Switch */}
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3">
                        <span className="text-xs font-black text-slate-500 uppercase tracking-wider">سياسة التسعير:</span>
                        <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm">
                            {[
                                { id: 'retail', label: 'قطاعي', color: 'bg-indigo-600' },
                                { id: 'wholesale', label: 'جملة', color: 'bg-blue-600' },
                                { id: 'half', label: 'نصف جملة', color: 'bg-sky-600' }
                            ].map((tier) => (
                                <button
                                    key={tier.id}
                                    type="button"
                                    onClick={() => setPricingTier(tier.id as any)}
                                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${pricingTier === tier.id ? `${tier.color} text-white shadow-md` : 'text-slate-500 hover:bg-slate-50'}`}
                                >
                                    {tier.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                         <div className="text-sm">
                             <span className="text-slate-400">تاريخ الاستحقاق:</span>
                             <input 
                                type="date" 
                                value={formData.dueDate}
                                onChange={e => setFormData({...formData, dueDate: e.target.value})}
                                className="mr-2 border-b border-slate-200 bg-transparent focus:border-blue-500 outline-none font-bold text-slate-700"
                             />
                         </div>
                    </div>
                </div>
            </div>

            {/* Products Search & Add Section */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 space-y-6">
                <div className="space-y-2">
                    <label className="text-sm font-black text-slate-700 flex items-center gap-2">
                        <Package className="text-blue-600" size={18} /> البحث وإضافة الأصناف
                    </label>
                    <div className="relative">
                        <div className={`flex items-center gap-3 p-4 bg-slate-50 border-2 transition-all rounded-2xl ${showProductResults ? 'border-blue-400 ring-4 ring-blue-50' : 'border-slate-100 hover:border-slate-200'}`}>
                            <Search className="text-slate-400" size={22} />
                            <input 
                                ref={barcodeInputRef}
                                type="text"
                                placeholder="ابحث باسم الصنف أو الباركود أو الـ SKU للإضافة السريعة..."
                                value={productSearchTerm}
                                onChange={(e) => {
                                    setProductSearchTerm(e.target.value);
                                    setShowProductResults(true);
                                }}
                                onKeyDown={handleBarcodeSearch}
                                onFocus={() => setShowProductResults(true)}
                                className="flex-1 bg-transparent text-lg font-bold outline-none placeholder-slate-300"
                            />
                            {productSearchTerm && (
                                <button type="button" onClick={() => setProductSearchTerm('')} className="text-slate-400 hover:text-red-500">
                                    <X size={20} />
                                </button>
                            )}
                        </div>

                        {/* Search Results Dropdown */}
                        {showProductResults && filteredProducts.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 z-50 overflow-hidden animate-in slide-in-from-top-2">
                                <div className="p-2 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
                                    <span className="text-[10px] font-black text-slate-400 uppercase pr-2">نتائج البحث</span>
                                    <button type="button" onClick={() => setShowProductResults(false)} className="p-1 hover:bg-slate-200 rounded-lg"><X size={14}/></button>
                                </div>
                                <div className="divide-y divide-slate-50 max-h-80 overflow-y-auto">
                                    {filteredProducts.map(p => {
                                        const stock = getProductStock(p.id);
                                        const price = getProductPrice(p);
                                        return (
                                            <button
                                                key={p.id}
                                                type="button"
                                                onClick={() => addProductToInvoice(p)}
                                                className="w-full p-4 flex items-center justify-between hover:bg-blue-50 transition-colors text-right group"
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                                                        <Box size={20} />
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-slate-800">{p.name}</p>
                                                        <p className="text-xs text-slate-400 font-mono">{p.sku || 'N/A'}</p>
                                                    </div>
                                                </div>
                                                <div className="text-left">
                                                    <p className="font-black text-blue-600">{(price || 0).toLocaleString()} <span className="text-[10px] font-normal">ج.م</span></p>
                                                    <p className={`text-[10px] font-bold ${stock > 5 ? 'text-emerald-500' : 'text-red-500'}`}>
                                                        المخزون: {stock}
                                                    </p>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        {showProductResults && productSearchTerm && filteredProducts.length === 0 && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-slate-100 p-8 text-center z-50">
                                <Package size={40} className="mx-auto text-slate-200 mb-2" />
                                <p className="text-slate-400 font-bold">عذراً، لم نجد أصنافاً مطابقة للبحث</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Items List - Modernized Table/Cards */}
                <div className="space-y-4">
                    {items.length === 0 ? (
                        <div className="py-12 flex flex-col items-center justify-center border-2 border-dashed border-slate-100 rounded-3xl text-slate-300">
                             <ShoppingCart size={48} className="mb-4 opacity-20" />
                             <p className="font-bold">الفاتورة فارغة. ابحث عن أصناف لإضافتها.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-right">
                                <thead>
                                    <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">
                                        <th className="pb-3 pr-4">الصنف</th>
                                        <th className="pb-3 text-center">الكمية</th>
                                        <th className="pb-3 text-center">سعر الوحدة</th>
                                        <th className="pb-3 text-center">الإجمالي</th>
                                        <th className="pb-3 w-12"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {items.map((item, index) => {
                                        const stock = getProductStock(item.productId);
                                        const isLowStock = stock < item.quantity;
                                        return (
                                            <tr key={item.id} className="group hover:bg-slate-50/50 transition-colors">
                                                <td className="py-4 pr-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isLowStock ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'}`}>
                                                            {isLowStock ? <AlertCircle size={16} /> : <Box size={16} />}
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-slate-800 text-sm">{item.productName}</p>
                                                            <div className="flex items-center gap-2 mt-0.5">
                                                                <span className="text-[10px] font-mono text-slate-400">{item.productSku || 'بدون كود'}</span>
                                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isLowStock ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
                                                                    مخزون: {stock}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="py-4">
                                                    <div className="flex items-center justify-center">
                                                        <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-sm group-hover:border-blue-300 transition-colors">
                                                            <button 
                                                                type="button" 
                                                                onClick={() => handleItemChange(index, 'quantity', item.quantity + 1)}
                                                                className="p-1 text-blue-600 hover:bg-blue-50 rounded-lg"
                                                            >
                                                                <Plus size={16} />
                                                            </button>
                                                            <input 
                                                                type="number"
                                                                value={item.quantity}
                                                                onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                                                                className="w-12 text-center font-black text-slate-800 outline-none bg-transparent"
                                                            />
                                                            <button 
                                                                type="button" 
                                                                onClick={() => handleItemChange(index, 'quantity', Math.max(0.01, item.quantity - 1))}
                                                                className="p-1 text-red-400 hover:bg-red-50 rounded-lg"
                                                            >
                                                                <ArrowDown size={16} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="py-4">
                                                    <div className="flex items-center justify-center">
                                                        <input 
                                                            type="number"
                                                            value={item.unitPrice}
                                                        disabled={settings.preventPriceModification && currentUser?.role !== 'super_admin' && currentUser?.role !== 'admin'}
                                                            onChange={(e) => handleItemChange(index, 'unitPrice', e.target.value)}
                                                        className="w-24 text-center font-bold text-slate-700 bg-slate-50 rounded-lg py-1.5 focus:bg-white border border-transparent focus:border-blue-200 transition-all outline-none disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                                                        />
                                                    </div>
                                                </td>
                                                <td className="py-4 text-center">
                                                    <span className="font-black text-slate-900">{item.total.toLocaleString()}</span>
                                                </td>
                                                <td className="py-4 text-center">
                                                    <button 
                                                        type="button" 
                                                        onClick={() => removeItem(index)}
                                                        className="text-slate-300 hover:text-red-500 p-2 transition-colors"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Notes Section */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
                 <label className="text-sm font-black text-slate-700 flex items-center gap-2 mb-4">
                    <Info className="text-slate-400" size={18} /> ملاحظات الفاتورة
                </label>
                <textarea 
                    rows={3}
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    className="w-full border-2 border-slate-50 hover:border-slate-100 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 bg-slate-50 transition-all placeholder-slate-300"
                    placeholder="شروط السداد، تفاصيل التوصيل، أو أي ملاحظات إضافية للعميل..."
                ></textarea>
            </div>
        </fieldset>

        {/* Sidebar Summary (Right 4 cols) */}
        <div className="lg:col-span-4 space-y-6">
            
            {/* Totals & Actions Dashboard */}
            <div className="bg-slate-900 rounded-[32px] p-8 text-white shadow-2xl shadow-blue-900/20 sticky top-6">
                <h3 className="text-lg font-black mb-8 flex items-center gap-3 border-b border-white/10 pb-4">
                    <Calculator size={22} className="text-blue-400" /> ملخص الفاتورة
                </h3>

                <div className="space-y-6">
                    <div className="flex justify-between items-center group">
                        <span className="text-slate-400 text-sm font-bold uppercase tracking-wide">المجموع الفرعي</span>
                        <span className="text-2xl font-mono">{subtotal.toLocaleString()}</span>
                    </div>

                    {/* Discount Controls */}
                    <div className="bg-white/5 p-4 rounded-3xl border border-white/5 space-y-3">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-400">الخصم الممنوح</span>
                                <div className="flex bg-slate-800 rounded-xl p-0.5 border border-white/10 shadow-inner">
                                    <button 
                                        type="button"
                                        onClick={() => setFormData({...formData, discountType: 'percentage'})}
                                        className={`p-1.5 rounded-lg transition-all ${formData.discountType === 'percentage' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                                    >
                                        <Percent size={14} />
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => setFormData({...formData, discountType: 'fixed'})}
                                        className={`p-1.5 rounded-lg transition-all ${formData.discountType === 'fixed' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                                    >
                                        <CircleDollarSign size={14} />
                                    </button>
                                </div>
                            </div>
                            <input 
                                type="number" 
                                min="0" 
                                value={formData.discountValue}
                                onChange={(e) => setFormData({...formData, discountValue: Math.max(0, parseFloat(e.target.value) || 0)})}
                                className="w-20 bg-slate-800 border-2 border-white/5 rounded-xl text-center text-sm font-black py-2 focus:outline-none focus:border-blue-500 transition-all"
                            />
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-white/5">
                            <span className="text-[10px] text-slate-500 font-bold uppercase">قيمة الخصم الفعلية</span>
                            <span className="text-red-400 font-mono font-bold">- {discountAmount.toLocaleString()}</span>
                        </div>
                    </div>

                    {settings.enableTax && (
                        <div className="flex justify-between items-center">
                            <span className="text-slate-400 text-sm font-bold">الضريبة ({(taxRate * 100).toFixed(0)}%)</span>
                            <span className="text-xl font-mono text-slate-300">{taxAmount.toLocaleString()}</span>
                        </div>
                    )}

                    <div className="pt-6 border-t-2 border-white/10">
                        <div className="flex justify-between items-end mb-2">
                            <span className="text-sm font-black text-blue-400 uppercase tracking-widest">الإجمالي النهائي</span>
                            <span className="text-xs text-slate-500 font-bold uppercase">EGP</span>
                        </div>
                        <div className="text-5xl font-black tracking-tight text-emerald-400 tabular-nums">
                            {totalAmount.toLocaleString()}
                        </div>
                    </div>

                    {/* Payment Status Indicator */}
                    <div className="pt-6">
                        <div className="bg-white/5 p-5 rounded-3xl border border-white/5 space-y-4">
                            <div className="flex items-center gap-2 mb-2">
                                <Wallet size={16} className="text-emerald-400" />
                                <span className="text-xs font-black uppercase tracking-wider text-slate-400">التحصيل والدفع</span>
                            </div>
                            
                            <div className="flex gap-4">
                                <div className="flex-1 space-y-1">
                                    <label className="text-[10px] font-black text-slate-500 pr-2">المدفوع نقداً</label>
                                    <input 
                                        type="number"
                                        min="0"
                                        value={formData.paidAmount}
                                        onChange={(e) => setFormData({...formData, paidAmount: Math.max(0, parseFloat(e.target.value) || 0)})}
                                        className="w-full bg-slate-800 border-2 border-white/5 rounded-2xl px-3 py-3 text-center font-black text-emerald-400 text-lg focus:outline-none focus:border-emerald-500 transition-all shadow-inner"
                                    />
                                </div>
                                <div className="flex-1 space-y-1">
                                    <label className="text-[10px] font-black text-slate-500 pr-2">إلى الخزينة</label>
                                    <select 
                                        value={formData.treasuryId}
                                        onChange={(e) => setFormData({...formData, treasuryId: e.target.value})}
                                        disabled={!formData.paidAmount || formData.paidAmount <= 0}
                                        className="w-full bg-slate-700 text-white border-2 border-white/10 rounded-2xl px-3 py-3 text-xs font-bold focus:outline-none focus:border-blue-500 appearance-none disabled:opacity-20 transition-all shadow-inner"
                                    >
                                        <option value="">اختر...</option>
                                        {treasuryAccounts.map(acc => <option key={acc.id} value={acc.id} className="text-black">{acc.name}</option>)}
                                    </select>
                                </div>
                            </div>

                            {formData.paidAmount > 0 && (
                                <div className="flex justify-between items-center pt-2 border-t border-white/5 animate-in fade-in slide-in-from-bottom-1">
                                    <span className="text-xs font-bold text-red-400">المتبقي (آجل):</span>
                                    <span className="font-mono font-bold">{remainingBalance.toLocaleString()}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {formData.status !== 'draft' ? (
                    <button 
                        type="button" 
                        onClick={handleCreateCreditNote}
                        className="mt-8 w-full bg-red-600 hover:bg-red-500 text-white py-5 rounded-[24px] font-black text-xl shadow-2xl shadow-red-600/30 transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3"
                    >
                        إنشاء إشعار دائن / مرتجع
                    </button>
                ) : (
                    <button 
                        type="submit" 
                        disabled={items.length === 0 || saving}
                        className="mt-8 w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:opacity-50 text-white py-5 rounded-[24px] font-black text-xl shadow-2xl shadow-blue-600/30 transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3"
                    >
                        {saving ? <Loader2 className="animate-spin" /> : <Save size={24} />}
                        {editingId ? 'تحديث الفاتورة' : 'حفظ كمسودة'}
                    </button>
                )}
                {!editingId && (
                    <button 
                        type="button" 
                        onClick={handleSaveAndPost}
                        disabled={items.length === 0 || saving}
                        className="mt-4 w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:opacity-50 text-white py-4 rounded-[24px] font-bold text-lg shadow-lg shadow-emerald-200 transition-all flex items-center justify-center gap-3"
                    >
                        {saving ? <Loader2 className="animate-spin" /> : <CheckCircle size={22} />}
                        حفظ وترحيل
                    </button>
                )}
            </div>
            
            {/* Quick Helper Info */}
            <div className="bg-blue-50 rounded-3xl p-6 border border-blue-100 flex items-start gap-4">
                <div className="bg-white p-2 rounded-xl shadow-sm">
                    <Info className="text-blue-600" size={24} />
                </div>
                <div>
                    <h4 className="font-black text-blue-900 text-sm mb-1">تعليمات سريعة</h4>
                    <p className="text-blue-700/70 text-xs leading-relaxed">
                        استخدم شريط البحث بالأعلى لإضافة الأصناف بسرعة. يمكنك تغيير الكمية والأسعار مباشرة من الجدول. سيتم إنشاء قيود اليومية وتحديث المخزون فور الحفظ.
                    </p>
                </div>
            </div>
        </div>
      </form>

      {/* Quick Add Customer Modal */}
      {isCustomerModalOpen && (
          <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4 backdrop-blur-md">
              <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in duration-300">
                  <div className="bg-slate-50 px-8 py-6 border-b border-slate-100 flex justify-between items-center">
                      <h3 className="font-black text-xl text-slate-800">إضافة عميل سريع</h3>
                      <button onClick={() => setIsCustomerModalOpen(false)} className="p-2 hover:bg-red-50 hover:text-red-500 rounded-full transition-colors">
                        <X size={20} />
                      </button>
                  </div>
                  <form onSubmit={handleQuickAddCustomer} className="p-8 space-y-6">
                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-400 pr-2 uppercase">اسم العميل بالكامل</label>
                        <input type="text" placeholder="الاسم الثلاثي أو اسم المنشأة" required value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)} className="w-full border-2 border-slate-50 rounded-2xl px-5 py-4 focus:outline-none focus:border-blue-500 bg-slate-50 font-bold" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-400 pr-2 uppercase">رقم الجوال</label>
                        <input type="text" placeholder="05xxxxxxxx" value={newCustomerPhone} onChange={e => setNewCustomerPhone(e.target.value)} className="w-full border-2 border-slate-50 rounded-2xl px-5 py-4 focus:outline-none focus:border-blue-500 bg-slate-50 font-bold" />
                      </div>
                      <button type="submit" className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black shadow-xl shadow-blue-200 hover:bg-blue-700 transition-all transform active:scale-95">إضافة العميل</button>
                  </form>
              </div>
          </div>
      )}

      {/* Thermal Invoice Template (Hidden by default, shown only when printing with .thermal-print class) */}
      <div className="hidden thermal-only print:block">
          <div className="text-center mb-4 border-b border-black pb-2 border-dashed">
              {(settings as any).logoUrl && (
                  <img src={(settings as any).logoUrl} alt="Logo" className="w-16 h-16 mx-auto mb-2 object-contain grayscale" />
              )}
              <h2 className="text-xl font-bold">{settings.companyName}</h2>
              <p className="text-xs">{settings.address}</p>
              <p className="text-xs">هاتف: {settings.phone}</p>
              <p className="text-xs">رقم ضريبي: {settings.taxNumber}</p>
              <h3 className="text-lg font-bold mt-2 border-t border-black border-dashed pt-2">فاتورة مبيعات</h3>
              <p className="text-sm font-mono">#{formData.invoiceNumber || 'NEW'}</p>
              <p className="text-xs">{new Date().toLocaleString('ar-EG')}</p>
          </div>
          
          <div className="mb-2 text-xs">
              <p><strong>العميل:</strong> {customers.find(c => c.id === formData.customerId)?.name || 'عميل نقدي'}</p>
              <p><strong>البائع:</strong> {salespeople.find(s => s.id === formData.salespersonId)?.name}</p>
          </div>

          <table className="w-full text-right text-xs mb-4 border-collapse">
              <thead>
                  <tr className="border-b border-black border-dashed">
                      <th className="py-1">الصنف</th>
                      <th className="py-1 w-8 text-center">ك</th>
                      <th className="py-1 w-12 text-center">سعر</th>
                      <th className="py-1 w-12 text-center">إجمالي</th>
                  </tr>
              </thead>
              <tbody>
                  {items.map((item, idx) => (
                      <tr key={idx} className="border-b border-slate-200 border-dashed">
                          <td className="py-1">{item.productName}</td>
                          <td className="py-1 text-center">{item.quantity}</td>
                          <td className="py-1 text-center">{item.unitPrice}</td>
                          <td className="py-1 text-center font-bold">{item.total}</td>
                      </tr>
                  ))}
              </tbody>
          </table>

          <div className="border-t border-black border-dashed pt-2 text-xs space-y-1">
              <div className="flex justify-between">
                  <span>المجموع:</span>
                  <span>{subtotal.toLocaleString()}</span>
              </div>
              {discountAmount > 0 && (
                  <div className="flex justify-between">
                      <span>الخصم:</span>
                      <span>{discountAmount.toLocaleString()}</span>
                  </div>
              )}
              {settings.enableTax && (
                  <div className="flex justify-between">
                      <span>الضريبة ({(taxRate * 100).toFixed(0)}%):</span>
                      <span>{taxAmount.toLocaleString()}</span>
                  </div>
              )}
              <div className="flex justify-between text-sm font-bold border-t border-black border-dashed pt-1 mt-1">
                  <span>الإجمالي:</span>
                  <span>{totalAmount.toLocaleString()}</span>
              </div>
          </div>
          
          <div className="text-center mt-4 pt-2 border-t border-black border-dashed text-xs">
              <p>{settings.footerText}</p>
              <p className="mt-1">شكراً لزيارتكم</p>
          </div>
      </div>

      <style>{`
        @media print {
            body.thermal-print * {
                visibility: hidden;
            }
            body.thermal-print .thermal-only, body.thermal-print .thermal-only * {
                visibility: visible;
            }
            body.thermal-print .thermal-only {
                position: absolute;
                left: 0;
                top: 0;
                width: 80mm; /* عرض الورق الحراري القياسي */
                padding: 5px;
                font-family: 'Courier New', Courier, monospace; /* خط مناسب للفواتير */
                color: black;
                background: white;
            }
            /* إخفاء القالب الحراري عند الطباعة العادية */
            body:not(.thermal-print) .thermal-only {
                display: none !important;
            }
        }
      `}</style>
    </div>
  );
};

export default SalesInvoiceForm;
