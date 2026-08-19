import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { 
  FileCheck, Save, Trash2, Loader2, Search, Plus, 
  ChevronRight, ChevronLeft, ChevronsRight, ChevronsLeft, 
  Printer, List, RefreshCw, FileText, ArrowRightLeft, 
  Warehouse as WarehouseIcon, X, CheckCircle2, Tag, ShieldCheck
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { SalesOrderPrint } from './SalesOrderPrint';

export const SalesOrderForm = () => {
  const { customers, products, warehouses, currentUser, settings } = useAccounting();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [items, setItems] = useState<any[]>([]);
  const [uoms, setUoms] = useState<any[]>([]);
  const [pricingTier, setPricingTier] = useState<'retail' | 'wholesale' | 'half'>('retail');
  const [formData, setFormData] = useState({ 
      customerId: '', 
      date: new Date().toISOString().split('T')[0], 
      deliveryDate: '',
      orderNumber: '',
      notes: '',
      status: 'draft'
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  // Navigation & Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [orderIds, setOrderIds] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [orderToPrint, setOrderToPrint] = useState<any>(null);
  const [companySettings, setCompanySettings] = useState<any>(null);

  // Conversion Modal State
  const [isConvertModalOpen, setIsConvertModalOpen] = useState(false);
  const [targetWarehouseId, setTargetWarehouseId] = useState('');
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    supabase.rpc('get_current_company_settings').maybeSingle().then(({ data }) => {
      if (data) setCompanySettings(data);
    });
  }, []);

  // جلب كافة معرفات أوامر البيع للتنقل
  const fetchOrderIds = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id;
      if (!userOrgId) return;

      const { data, error } = await supabase
        .from('sales_orders')
        .select('id')
        .eq('organization_id', userOrgId)
        .order('order_date', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;
      const ids = (data || []).map(o => o.id);
      setOrderIds(ids);
    } catch (err) {
      console.error('Error fetching SO IDs:', err);
    }
  };

  useEffect(() => {
    fetchOrderIds();
  }, []);

  useEffect(() => {
    const fetchUoms = async () => {
      const orgId = (currentUser as any)?.organization_id;
      const { data } = await supabase.from('uoms').select('*').eq('organization_id', orgId);
      if (data) setUoms(data);
    };
    if (currentUser) fetchUoms();
  }, [currentUser]);

  // تحميل أمر بيع محدد
  const loadOrderById = async (id: string) => {
    setLoadingOrder(true);
    try {
      let { data: so, error: soError } = await supabase
        .from('sales_orders')
        .select(`
          *,
          customers(id, name, phone),
          sales_order_items(id, product_id, quantity, unit_price, uom_id, products(name, sku, sales_price, base_uom_id, sale_uom_id))
        `)
        .eq('id', id)
        .single();

      if (soError && (soError.code === 'PGRST201' || soError.message?.includes('more than one relationship'))) {
        const retryRes = await supabase
          .from('sales_orders')
          .select(`
            *,
            customers(id, name, phone),
            sales_order_items!sales_order_id(id, product_id, quantity, unit_price, uom_id, products(name, sku, sales_price, base_uom_id, sale_uom_id))
          `)
          .eq('id', id)
          .single();
        so = retryRes.data;
        soError = retryRes.error;
      }

      if (soError) throw soError;
      if (!so) throw new Error('أمر البيع غير موجود');

      setEditingId(so.id);
      setFormData({
        customerId: so.customer_id || '',
        date: so.order_date || new Date().toISOString().split('T')[0],
        deliveryDate: so.expected_delivery_date || '',
        orderNumber: so.order_number || '',
        notes: so.notes || '',
        status: so.status || 'draft'
      });

      const formattedItems = (so.sales_order_items || []).map((item: any) => ({
        id: item.id,
        productId: item.product_id,
        name: item.products?.name || 'صنف',
        quantity: Number(item.quantity) || 0,
        unitPrice: Number(item.unit_price) || 0,
        uomId: item.uom_id || item.products?.sale_uom_id || item.products?.base_uom_id || '',
        total: (Number(item.quantity) || 0) * (Number(item.unit_price) || 0)
      }));

      setItems(formattedItems);

      const idx = orderIds.indexOf(id);
      if (idx !== -1) setCurrentIndex(idx);

    } catch (err: any) {
      console.error('Error loading SO:', err);
      showToast('فشل تحميل أمر البيع: ' + err.message, 'error');
    } finally {
      setLoadingOrder(false);
    }
  };

  // استقبال أمر بيع ممرر
  useEffect(() => {
    if (location.state && (location.state as any).orderToEdit) {
      const passed = (location.state as any).orderToEdit;
      loadOrderById(passed.id);
    }
  }, [location.state]);

  const handleNavigate = (direction: 'first' | 'prev' | 'next' | 'last') => {
    if (orderIds.length === 0) {
      showToast('لا توجد أوامر بيع للتنقل بينها', 'info');
      return;
    }

    let targetIdx = currentIndex;
    if (direction === 'first') {
      targetIdx = 0;
    } else if (direction === 'last') {
      targetIdx = orderIds.length - 1;
    } else if (direction === 'prev') {
      if (currentIndex <= 0) {
        targetIdx = 0;
        showToast('هذا هو أول أمر بيع مسجل', 'info');
      } else {
        targetIdx = currentIndex - 1;
      }
    } else if (direction === 'next') {
      if (currentIndex >= orderIds.length - 1 || currentIndex === -1) {
        targetIdx = orderIds.length - 1;
        showToast('هذا هو آخر أمر بيع مسجل', 'info');
      } else {
        targetIdx = currentIndex + 1;
      }
    }

    if (targetIdx >= 0 && targetIdx < orderIds.length) {
      loadOrderById(orderIds[targetIdx]);
    }
  };

  const handleNewOrder = () => {
    setEditingId(null);
    setCurrentIndex(-1);
    setItems([]);
    setFormData({ 
      customerId: '', 
      date: new Date().toISOString().split('T')[0], 
      deliveryDate: '',
      orderNumber: '',
      notes: '',
      status: 'draft'
    });
    showToast('تم فتح نموذج أمر بيع جديد ➕', 'info');
  };

  const addItem = (product: any) => {
    let priceToUse = product.sales_price || 0;
    if (pricingTier === 'wholesale') priceToUse = product.wholesalePrice || product.sales_price || 0;
    if (pricingTier === 'half') priceToUse = product.halfWholesalePrice || product.sales_price || 0;

    const defaultUomId = product.sale_uom_id || product.base_uom_id || '';
    const selectedUom = uoms.find(u => u.id === defaultUomId);
    const initialPrice = selectedUom ? Number((priceToUse * selectedUom.ratio).toFixed(4)) : priceToUse;

    setItems([...items, { 
        productId: product.id, 
        name: product.name, 
        quantity: 1, 
        unitPrice: initialPrice,
        uomId: defaultUomId,
        total: initialPrice
    }]);
    setProductSearch('');
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items];
    newItems[index][field] = value;

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

  const deleteSoItems = async (orderId: string) => {
    let delRes = await supabase.from('sales_order_items').delete().eq('sales_order_id', orderId);
    if (delRes.error && delRes.error.message?.includes('sales_order_id')) {
      delRes = await supabase.from('sales_order_items').delete().eq('order_id', orderId);
    }
    return delRes.error;
  };

  const insertSoItems = async (itemsList: any[]) => {
    let insRes = await supabase.from('sales_order_items').insert(itemsList);
    if (insRes.error && insRes.error.message?.includes('sales_order_id')) {
      const adjusted = itemsList.map(item => {
        const { sales_order_id, ...rest } = item;
        return { ...rest, order_id: sales_order_id };
      });
      insRes = await supabase.from('sales_order_items').insert(adjusted);
    }
    return insRes.error;
  };

  const handleSave = async (targetStatus?: string) => {
    if (!formData.customerId) {
      showToast('يرجى اختيار العميل', 'warning');
      return;
    }
    if (items.length === 0) {
      showToast('يرجى إضافة صنف واحد على الأقل لأمر البيع', 'warning');
      return;
    }

    setSaving(true);

    try {
      const userOrgId = (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;
      if (!userOrgId) throw new Error("تعذر تحديد المنظمة.");

      const orderNum = formData.orderNumber || `SO-${Date.now().toString().slice(-6)}`;
      const statusToSave = targetStatus || formData.status || 'draft';

      let soId = editingId;

      if (editingId) {
        const updatePayload: any = {
          customer_id: formData.customerId,
          order_number: orderNum,
          order_date: formData.date,
          expected_delivery_date: formData.deliveryDate || null,
          total_amount: totalAmount,
          subtotal: subtotal,
          tax_amount: taxAmount,
          status: statusToSave,
          notes: formData.notes
        };

        let updateRes = await supabase.from('sales_orders').update(updatePayload).eq('id', editingId);
        if (updateRes.error && updateRes.error.message?.includes('expected_delivery_date')) {
          delete updatePayload.expected_delivery_date;
          updateRes = await supabase.from('sales_orders').update(updatePayload).eq('id', editingId);
        }
        if (updateRes.error) throw updateRes.error;

        await deleteSoItems(editingId);

        const itemsToInsert = items.map(item => ({
          organization_id: userOrgId,
          sales_order_id: editingId,
          product_id: item.productId,
          quantity: Number(item.quantity),
          unit_price: Number(item.unitPrice),
          uom_id: item.uomId || null
        }));

        const itemsError = await insertSoItems(itemsToInsert);
        if (itemsError) throw itemsError;

        showToast(statusToSave === 'confirmed' ? 'تم تعميد وتأكيد أمر البيع بنجاح 🛡️✅' : 'تم تحديث أمر البيع بنجاح ✅', 'success');

      } else {
        const insertPayload: any = {
          organization_id: userOrgId,
          customer_id: formData.customerId,
          order_number: orderNum,
          order_date: formData.date,
          expected_delivery_date: formData.deliveryDate || null,
          total_amount: totalAmount,
          subtotal: subtotal,
          tax_amount: taxAmount,
          status: statusToSave,
          notes: formData.notes
        };

        let insertRes = await supabase.from('sales_orders').insert(insertPayload).select().single();
        if (insertRes.error && insertRes.error.message?.includes('expected_delivery_date')) {
          delete insertPayload.expected_delivery_date;
          insertRes = await supabase.from('sales_orders').insert(insertPayload).select().single();
        }
        if (insertRes.error) throw insertRes.error;
        const so = insertRes.data;
        soId = so.id;

        const itemsToInsert = items.map(item => ({
          organization_id: userOrgId,
          sales_order_id: so.id,
          product_id: item.productId,
          quantity: Number(item.quantity),
          unit_price: Number(item.unitPrice),
          uom_id: item.uomId || null
        }));

        const itemsError = await insertSoItems(itemsToInsert);
        if (itemsError) throw itemsError;

        showToast(statusToSave === 'confirmed' ? 'تم حفظ وتعميد أمر البيع بنجاح 🛡️✅' : 'تم حفظ أمر البيع كمسودة ✅', 'success');
      }

      await fetchOrderIds();
      if (soId) {
        loadOrderById(soId);
      }

    } catch (error: any) {
      console.error(error);
      showToast('فشل حفظ أمر البيع: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmOrder = async () => {
    if (!editingId) {
      await handleSave('confirmed');
      return;
    }

    setConfirming(true);
    try {
      const { error } = await supabase
        .from('sales_orders')
        .update({ status: 'confirmed' })
        .eq('id', editingId);

      if (error) throw error;
      setFormData(prev => ({ ...prev, status: 'confirmed' }));
      showToast('تم تعميد أمر البيع بنجاح 🛡️✅ أصبح جاهزاً للصرف أو التشغيل', 'success');
    } catch (err: any) {
      console.error(err);
      showToast('فشل التعميد: ' + err.message, 'error');
    } finally {
      setConfirming(false);
    }
  };

  const handleDeleteCurrent = async () => {
    if (!editingId) return;

    if (!window.confirm(`هل أنت متأكد من حذف أمر البيع رقم (${formData.orderNumber})؟`)) {
      return;
    }

    setDeleting(true);
    try {
      await deleteSoItems(editingId);
      const { error: delErr } = await supabase.from('sales_orders').delete().eq('id', editingId);
      if (delErr) throw delErr;

      showToast('تم حذف أمر البيع بنجاح ✅', 'success');

      const newIds = orderIds.filter(id => id !== editingId);
      setOrderIds(newIds);

      if (newIds.length > 0) {
        const nextId = newIds[Math.min(currentIndex, newIds.length - 1)];
        loadOrderById(nextId);
      } else {
        handleNewOrder();
      }

    } catch (err: any) {
      console.error('Error deleting SO:', err);
      showToast('فشل حذف أمر البيع: ' + err.message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handlePrintCurrent = () => {
    const soData = {
      orderNumber: formData.orderNumber,
      date: formData.date,
      deliveryDate: formData.deliveryDate,
      customerName: customers.find(c => c.id === formData.customerId)?.name || 'عميل عام',
      notes: formData.notes,
      totalAmount: totalAmount,
      taxAmount: taxAmount,
      items: items.map(item => ({
        name: item.name || products.find(p => p.id === item.productId)?.name || 'صنف',
        uomName: uoms.find(u => u.id === item.uomId)?.name || '-',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.total
      }))
    };

    setOrderToPrint(soData);
    setTimeout(() => {
      window.print();
      setOrderToPrint(null);
    }, 200);
  };

  // تحويل إلى فاتورة مبيعات
  const handleConvertToInvoice = async () => {
    if (!editingId) return;
    if (!targetWarehouseId) {
      showToast('يرجى اختيار مستودع الصرف لإصدار فاتورة المبيعات', 'warning');
      return;
    }

    setConverting(true);
    try {
      const { data, error } = await supabase.rpc('convert_so_to_invoice', {
        p_so_id: editingId,
        p_warehouse_id: targetWarehouseId
      });

      if (error) throw error;
      showToast('تم تحويل أمر البيع إلى فاتورة مبيعات رسمية بنجاح ✅', 'success');
      setIsConvertModalOpen(false);
      navigate('/invoices-list');
    } catch (err: any) {
      console.error(err);
      showToast('فشل التحويل: ' + err.message, 'error');
    } finally {
      setConverting(false);
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.sku && p.sku.toLowerCase().includes(productSearch.toLowerCase()))
  ).slice(0, 8);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <span className="bg-blue-100 text-blue-700 text-xs px-2.5 py-0.5 rounded-full font-bold inline-flex items-center gap-1"><ShieldCheck size={12} /> معمد ومؤكد</span>;
      case 'invoiced':
        return <span className="bg-purple-100 text-purple-700 text-xs px-2.5 py-0.5 rounded-full font-bold inline-flex items-center gap-1"><CheckCircle2 size={12} /> تم الفوترة والصرف</span>;
      case 'manufacturing':
        return <span className="bg-amber-100 text-amber-700 text-xs px-2.5 py-0.5 rounded-full font-bold">تحت التشغيل ⚙️</span>;
      default:
        return <span className="bg-slate-100 text-slate-700 text-xs px-2.5 py-0.5 rounded-full font-bold">مسودة 📝</span>;
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in">
      
      {/* 🚀 Header & Navigation Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
        
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
            <FileCheck size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
              {editingId ? `أمر بيع: ${formData.orderNumber}` : 'أمر بيع وتعميد جديد'}
              {editingId && getStatusBadge(formData.status)}
            </h2>
            <p className="text-xs text-slate-400 font-bold">تسجيل وتعميد طلبات البيع وتجهيزها للتسليم أو التشغيل الصناعي</p>
          </div>
        </div>

        {/* 🧭 أسهم التنقل بين أوامر البيع */}
        <div className="flex items-center gap-1 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
          <button 
            type="button" 
            onClick={() => handleNavigate('first')} 
            disabled={orderIds.length === 0 || currentIndex === 0} 
            title="أول أمر بيع"
            className="p-2 text-slate-600 hover:bg-white hover:text-blue-600 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronsRight size={18} />
          </button>
          
          <button 
            type="button" 
            onClick={() => handleNavigate('prev')} 
            disabled={orderIds.length === 0 || currentIndex <= 0} 
            title="أمر البيع السابق"
            className="p-2 text-slate-600 hover:bg-white hover:text-blue-600 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronRight size={18} />
          </button>

          {/* Record Counter */}
          <div className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-mono font-black text-slate-700 select-none">
            {loadingOrder ? (
              <Loader2 size={14} className="animate-spin text-blue-600" />
            ) : editingId && currentIndex !== -1 ? (
              <span>{currentIndex + 1} / {orderIds.length}</span>
            ) : (
              <span className="text-blue-600 font-bold">جديد ➕</span>
            )}
          </div>

          <button 
            type="button" 
            onClick={() => handleNavigate('next')} 
            disabled={orderIds.length === 0 || currentIndex >= orderIds.length - 1 || currentIndex === -1} 
            title="أمر البيع التالي"
            className="p-2 text-slate-600 hover:bg-white hover:text-blue-600 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronLeft size={18} />
          </button>

          <button 
            type="button" 
            onClick={() => handleNavigate('last')} 
            disabled={orderIds.length === 0 || currentIndex >= orderIds.length - 1 || currentIndex === -1} 
            title="آخر أمر بيع"
            className="p-2 text-slate-600 hover:bg-white hover:text-blue-600 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronsLeft size={18} />
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button 
            type="button" 
            onClick={() => navigate('/sales-orders')} 
            className="bg-slate-100 text-slate-700 hover:bg-slate-200 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
            title="عرض سجل أوامر البيع"
          >
            <List size={16} /> سجل الأوامر
          </button>

          <button 
            type="button" 
            onClick={handleNewOrder} 
            className="bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
            title="بدء أمر بيع جديد"
          >
            <Plus size={16} /> جديد
          </button>

          {editingId && (
            <>
              {formData.status !== 'confirmed' && formData.status !== 'invoiced' && (
                <button 
                  type="button" 
                  onClick={handleConfirmOrder} 
                  disabled={confirming}
                  className="bg-blue-600 text-white hover:bg-blue-700 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
                  title="تعميد وتأكيد أمر البيع للتشغيل أو الصرف"
                >
                  {confirming ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} تعميد الأمر
                </button>
              )}

              {formData.status !== 'invoiced' && (
                <button 
                  type="button" 
                  onClick={() => {
                    setTargetWarehouseId(warehouses.length === 1 ? warehouses[0].id : '');
                    setIsConvertModalOpen(true);
                  }} 
                  className="bg-purple-600 text-white hover:bg-purple-700 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
                  title="تحويل أمر البيع إلى فاتورة مبيعات وصرف المخزون"
                >
                  <ArrowRightLeft size={16} /> تحويل لفاتورة
                </button>
              )}

              <button 
                type="button" 
                onClick={handlePrintCurrent} 
                className="bg-slate-800 text-white hover:bg-slate-700 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                title="طباعة أمر البيع"
              >
                <Printer size={16} /> طباعة
              </button>

              <button 
                type="button" 
                onClick={handleDeleteCurrent} 
                disabled={deleting} 
                className="bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                title="حذف أمر البيع"
              >
                {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} حذف
              </button>
            </>
          )}

          <button 
            type="button" 
            onClick={() => handleSave()} 
            disabled={saving} 
            className="bg-emerald-600 text-white px-5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50"
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} 
            {editingId ? 'حفظ التعديلات' : 'حفظ كمسودة'}
          </button>
        </div>
      </div>

      {/* Main Form Body */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-1">
          <label className="block text-xs font-bold text-slate-700 mb-1">العميل <span className="text-red-500">*</span></label>
          <select 
            className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm font-bold outline-none focus:border-blue-500" 
            value={formData.customerId} 
            onChange={e => setFormData({...formData, customerId: e.target.value})}
          >
            <option value="">اختر العميل...</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {/* Pricing Tier */}
        <div className="lg:col-span-1">
          <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
            <Tag size={14} /> مستوى التسعير
          </label>
          <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => handlePricingTierChange('retail')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${pricingTier === 'retail' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              قطاعي
            </button>
            <button
              type="button"
              onClick={() => handlePricingTierChange('wholesale')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${pricingTier === 'wholesale' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              جملة
            </button>
            <button
              type="button"
              onClick={() => handlePricingTierChange('half')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${pricingTier === 'half' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              نصف
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ أمر البيع <span className="text-red-500">*</span></label>
          <input 
            type="date" 
            className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm font-bold outline-none focus:border-blue-500" 
            value={formData.date} 
            onChange={e => setFormData({...formData, date: e.target.value})} 
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ التسليم المتوقع</label>
          <input 
            type="date" 
            className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm outline-none focus:border-blue-500" 
            value={formData.deliveryDate} 
            onChange={e => setFormData({...formData, deliveryDate: e.target.value})} 
          />
        </div>

        <div className="md:col-span-2 lg:col-span-4">
          <label className="block text-xs font-bold text-slate-700 mb-1">شروط وملاحظات التعميد والتسليم</label>
          <input 
            type="text" 
            className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm outline-none focus:border-blue-500" 
            value={formData.notes} 
            onChange={e => setFormData({...formData, notes: e.target.value})} 
            placeholder="شروط التسليم، مستودع الصرف المفضل، خطة التشغيل..." 
          />
        </div>
      </div>

      {/* Items Section */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
        
        {/* Product Search */}
        <div className="relative">
          <label className="block text-xs font-bold text-slate-600 mb-1">إضافة صنف لأمر البيع</label>
          <div className="relative">
            <input 
              type="text" 
              placeholder="ابحث باسم الصنف أو الباركود لإضافته..." 
              className="w-full border rounded-xl p-2.5 pl-10 bg-slate-50 focus:bg-white text-sm outline-none focus:border-blue-500 transition-colors" 
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
                  className="p-3 hover:bg-blue-50 cursor-pointer border-b last:border-0 flex justify-between items-center transition-colors"
                >
                  <div>
                    <span className="font-bold text-slate-800 text-sm block">{p.name}</span>
                    <span className="text-xs text-slate-400 font-mono">الكود: {p.sku || '-'}</span>
                  </div>
                  <span className="text-blue-600 font-mono font-bold text-sm">
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
                <th className="p-3">الصنف المطلوب</th>
                <th className="p-3 w-32 text-center">الوحدة</th>
                <th className="p-3 w-28 text-center">الكمية المطلوبة</th>
                <th className="p-3 w-32 text-center">السعر المعتمد</th>
                <th className="p-3 w-32 text-center">الإجمالي</th>
                <th className="p-3 w-12 text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                  <td className="p-3 font-bold text-slate-800">{item.name}</td>
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
                      className="w-full border rounded-lg p-1.5 text-center font-mono font-bold text-blue-600 bg-white" 
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
            <div className="flex justify-between text-sm font-black text-blue-700 border-t border-slate-200 pt-2">
              <span>إجمالي أمر البيع:</span>
              <span className="font-mono text-lg" dir="ltr">{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {settings.currency || 'ج.م'}</span>
            </div>
          </div>
        </div>

      </div>

      {/* Convert to Invoice Modal */}
      {isConvertModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <WarehouseIcon className="text-purple-600" /> اختيار مستودع الصرف
              </h3>
              <button onClick={() => setIsConvertModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              سيتم تحويل أمر البيع إلى فاتورة مبيعات رسمية وخصم الكميات فوراً من المستودع المختار.
            </p>
            <div className="mb-6">
              <label className="block text-xs font-bold text-slate-700 mb-1">المستودع المصروف منه <span className="text-red-500">*</span></label>
              <select 
                value={targetWarehouseId} 
                onChange={e => setTargetWarehouseId(e.target.value)}
                className="w-full border rounded-xl p-3 bg-slate-50 font-bold text-sm outline-none focus:border-purple-500"
              >
                <option value="">-- اختر المستودع --</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button 
                type="button" 
                onClick={() => setIsConvertModalOpen(false)} 
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50"
              >
                إلغاء
              </button>
              <button 
                type="button" 
                onClick={handleConvertToInvoice} 
                disabled={converting || !targetWarehouseId} 
                className="px-5 py-2.5 rounded-xl bg-purple-600 text-white font-bold text-sm hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
              >
                {converting ? <Loader2 size={16} className="animate-spin" /> : <ArrowRightLeft size={16} />}
                تأكيد الفوترة والصرف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden printable component */}
      {orderToPrint && (
        <SalesOrderPrint orderData={orderToPrint} companySettings={companySettings} />
      )}
    </div>
  );
};

export default SalesOrderForm;
