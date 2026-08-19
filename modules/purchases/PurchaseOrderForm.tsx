import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { 
  FileCheck, Save, Trash2, Loader2, Search, Plus, 
  ChevronRight, ChevronLeft, ChevronsRight, ChevronsLeft, 
  Printer, List, RefreshCw, FileText, ArrowRightLeft, Warehouse as WarehouseIcon, X
} from 'lucide-react';
import { createPurchaseOrderSchema } from '../../utils/validationSchemas';
import { useNavigate, useLocation } from 'react-router-dom';
import { PurchaseOrderPrint } from './PurchaseOrderPrint';

const PurchaseOrderForm = () => {
  const { suppliers, products, warehouses, currentUser, settings, convertPoToInvoice } = useAccounting();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [items, setItems] = useState<any[]>([]);
  const [uoms, setUoms] = useState<any[]>([]);
  const [formData, setFormData] = useState({ 
      supplierId: '', 
      date: new Date().toISOString().split('T')[0], 
      deliveryDate: '',
      orderNumber: '',
      notes: '',
      status: 'draft'
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
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

  // جلب كافة معرفات أوامر الشراء للتنقل
  const fetchOrderIds = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id;
      if (!userOrgId) return;

      const { data, error } = await supabase
        .from('purchase_orders')
        .select('id')
        .eq('organization_id', userOrgId)
        .order('order_date', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;
      const ids = (data || []).map(o => o.id);
      setOrderIds(ids);
    } catch (err) {
      console.error('Error fetching PO IDs:', err);
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

  // تحميل أمر شراء محدد
  const loadOrderById = async (id: string) => {
    setLoadingOrder(true);
    try {
      let { data: po, error: poError } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          suppliers(id, name, phone),
          purchase_order_items(id, product_id, quantity, unit_price, total, uom_id, products(name, sku, purchase_price, base_uom_id))
        `)
        .eq('id', id)
        .single();

      if (poError && (poError.code === 'PGRST201' || poError.message?.includes('more than one relationship'))) {
        const retryRes = await supabase
          .from('purchase_orders')
          .select(`
            *,
            suppliers(id, name, phone),
            purchase_order_items!purchase_order_id(id, product_id, quantity, unit_price, total, uom_id, products(name, sku, purchase_price, base_uom_id))
          `)
          .eq('id', id)
          .single();
        po = retryRes.data;
        poError = retryRes.error;
      }

      if (poError) throw poError;
      if (!po) throw new Error('أمر الشراء غير موجود');

      setEditingId(po.id);
      setFormData({
        supplierId: po.supplier_id || '',
        date: po.order_date || new Date().toISOString().split('T')[0],
        deliveryDate: po.expected_delivery_date || '',
        orderNumber: po.po_number || po.order_number || '',
        notes: po.notes || '',
        status: po.status || 'draft'
      });

      const formattedItems = (po.purchase_order_items || []).map((item: any) => ({
        id: item.id,
        productId: item.product_id,
        name: item.products?.name || 'صنف',
        quantity: Number(item.quantity) || 0,
        unitPrice: Number(item.unit_price) || 0,
        uomId: item.uom_id || item.products?.base_uom_id || '',
        total: Number(item.total) || 0
      }));

      setItems(formattedItems);

      const idx = orderIds.indexOf(id);
      if (idx !== -1) setCurrentIndex(idx);

    } catch (err: any) {
      console.error('Error loading PO:', err);
      showToast('فشل تحميل أمر الشراء: ' + err.message, 'error');
    } finally {
      setLoadingOrder(false);
    }
  };

  // استقبال أمر شراء ممرر
  useEffect(() => {
    if (location.state && (location.state as any).orderToEdit) {
      const passed = (location.state as any).orderToEdit;
      loadOrderById(passed.id);
    }
  }, [location.state]);

  const handleNavigate = (direction: 'first' | 'prev' | 'next' | 'last') => {
    if (orderIds.length === 0) {
      showToast('لا توجد أوامر شراء للتنقل بينها', 'info');
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
        showToast('هذا هو أول أمر شراء مسجل', 'info');
      } else {
        targetIdx = currentIndex - 1;
      }
    } else if (direction === 'next') {
      if (currentIndex >= orderIds.length - 1 || currentIndex === -1) {
        targetIdx = orderIds.length - 1;
        showToast('هذا هو آخر أمر شراء مسجل', 'info');
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
      supplierId: '', 
      date: new Date().toISOString().split('T')[0], 
      deliveryDate: '',
      orderNumber: '',
      notes: '',
      status: 'draft'
    });
    showToast('تم فتح نموذج أمر شراء جديد ➕', 'info');
  };

  const addItem = (product: any) => {
    const defaultUomId = product.purchase_uom_id || product.base_uom_id || '';
    const selectedUom = uoms.find(u => u.id === defaultUomId);
    const basePrice = product.purchase_price || product.cost || 0;
    const initialPrice = selectedUom ? Number((basePrice * selectedUom.ratio).toFixed(4)) : basePrice;

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
            const basePrice = product.purchase_price || product.cost || 0;
            newItems[index].unitPrice = Number((basePrice * selectedUom.ratio).toFixed(4));
        }
    }

    newItems[index].total = (Number(newItems[index].quantity) || 0) * (Number(newItems[index].unitPrice) || 0);
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const calculateTotal = () => items.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.unitPrice || 0)), 0);

  const subtotal = calculateTotal();
  const taxRate = settings.enableTax ? (settings.vatRate ? settings.vatRate / 100 : 0.14) : 0;
  const taxAmount = subtotal * taxRate;
  const totalAmount = subtotal + taxAmount;

  const deletePoItems = async (orderId: string) => {
    let delRes = await supabase.from('purchase_order_items').delete().eq('purchase_order_id', orderId);
    if (delRes.error && delRes.error.message?.includes('purchase_order_id')) {
      delRes = await supabase.from('purchase_order_items').delete().eq('order_id', orderId);
    }
    return delRes.error;
  };

  const insertPoItems = async (itemsList: any[]) => {
    let insRes = await supabase.from('purchase_order_items').insert(itemsList);
    if (insRes.error && insRes.error.message?.includes('purchase_order_id')) {
      const adjusted = itemsList.map(item => {
        const { purchase_order_id, ...rest } = item;
        return { ...rest, order_id: purchase_order_id };
      });
      insRes = await supabase.from('purchase_order_items').insert(adjusted);
    }
    return insRes.error;
  };

  const handleSave = async () => {
    const validationData = {
        supplierId: formData.supplierId,
        orderNumber: formData.orderNumber || `PO-${Date.now().toString().slice(-6)}`,
        orderDate: formData.date,
        deliveryDate: formData.deliveryDate || undefined,
        items: items.map(i => ({
            productId: i.productId,
            quantity: Number(i.quantity),
            unitPrice: Number(i.unitPrice)
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
        showToast('تم حفظ أمر الشراء بنجاح ✅ (محاكاة ديمو)', 'success');
        setSaving(false);
        return;
    }

    try {
      const userOrgId = (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;
      if (!userOrgId) throw new Error("تعذر تحديد المنظمة. يرجى إعادة تسجيل الدخول.");

      const poNumber = formData.orderNumber || `PO-${Date.now().toString().slice(-6)}`;

      let poId = editingId;

      if (editingId) {
        // تحديث أمر شراء موجود
        const updatePayload: any = {
          supplier_id: formData.supplierId,
          po_number: poNumber,
          order_date: formData.date,
          expected_delivery_date: formData.deliveryDate || null,
          total_amount: totalAmount,
          tax_amount: taxAmount,
          notes: formData.notes
        };

        let updateRes = await supabase.from('purchase_orders').update(updatePayload).eq('id', editingId);
        if (updateRes.error) {
          if (updateRes.error.message?.includes('po_number')) {
            delete updatePayload.po_number;
            updatePayload.order_number = poNumber;
          }
          if (updateRes.error.message?.includes('expected_delivery_date')) {
            delete updatePayload.expected_delivery_date;
          }
          updateRes = await supabase.from('purchase_orders').update(updatePayload).eq('id', editingId);
          if (updateRes.error && updateRes.error.message?.includes('expected_delivery_date')) {
            delete updatePayload.expected_delivery_date;
            updateRes = await supabase.from('purchase_orders').update(updatePayload).eq('id', editingId);
          }
        }
        if (updateRes.error) throw updateRes.error;

        await deletePoItems(editingId);

        const itemsToInsert = items.map(item => ({
          organization_id: userOrgId,
          purchase_order_id: editingId,
          product_id: item.productId,
          quantity: Number(item.quantity),
          unit_price: Number(item.unitPrice),
          uom_id: item.uomId || null,
          total: Number(item.quantity) * Number(item.unitPrice)
        }));

        const itemsError = await insertPoItems(itemsToInsert);
        if (itemsError) throw itemsError;

        showToast('تم تحديث أمر الشراء بنجاح ✅', 'success');

      } else {
        // إنشاء أمر شراء جديد
        const insertPayload: any = {
          organization_id: userOrgId,
          supplier_id: formData.supplierId,
          po_number: poNumber,
          order_date: formData.date,
          expected_delivery_date: formData.deliveryDate || null,
          total_amount: totalAmount,
          tax_amount: taxAmount,
          status: 'sent',
          notes: formData.notes
        };

        let insertRes = await supabase.from('purchase_orders').insert(insertPayload).select().single();
        if (insertRes.error) {
          if (insertRes.error.message?.includes('po_number')) {
            delete insertPayload.po_number;
            insertPayload.order_number = poNumber;
          }
          if (insertRes.error.message?.includes('expected_delivery_date')) {
            delete insertPayload.expected_delivery_date;
          }
          insertRes = await supabase.from('purchase_orders').insert(insertPayload).select().single();
          if (insertRes.error && insertRes.error.message?.includes('expected_delivery_date')) {
            delete insertPayload.expected_delivery_date;
            insertRes = await supabase.from('purchase_orders').insert(insertPayload).select().single();
          }
        }
        if (insertRes.error) throw insertRes.error;
        const po = insertRes.data;
        poId = po.id;

        const itemsToInsert = items.map(item => ({
          organization_id: userOrgId,
          purchase_order_id: po.id,
          product_id: item.productId,
          quantity: Number(item.quantity),
          unit_price: Number(item.unitPrice),
          uom_id: item.uomId || null,
          total: Number(item.quantity) * Number(item.unitPrice)
        }));

        const itemsError = await insertPoItems(itemsToInsert);
        if (itemsError) throw itemsError;

        showToast('تم حفظ أمر الشراء بنجاح ✅', 'success');
      }

      await fetchOrderIds();
      if (poId) {
        loadOrderById(poId);
      }

    } catch (error: any) {
      console.error(error);
      showToast('فشل حفظ أمر الشراء: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCurrent = async () => {
    if (!editingId) return;

    if (!window.confirm(`هل أنت متأكد من حذف أمر الشراء رقم (${formData.orderNumber})؟`)) {
      return;
    }

    setDeleting(true);
    try {
      await deletePoItems(editingId);
      const { error: delErr } = await supabase.from('purchase_orders').delete().eq('id', editingId);
      if (delErr) throw delErr;

      showToast('تم حذف أمر الشراء بنجاح ✅', 'success');

      const newIds = orderIds.filter(id => id !== editingId);
      setOrderIds(newIds);

      if (newIds.length > 0) {
        const nextId = newIds[Math.min(currentIndex, newIds.length - 1)];
        loadOrderById(nextId);
      } else {
        handleNewOrder();
      }

    } catch (err: any) {
      console.error('Error deleting PO:', err);
      showToast('فشل حذف أمر الشراء: ' + err.message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handlePrintCurrent = () => {
    const poData = {
      orderNumber: formData.orderNumber,
      date: formData.date,
      deliveryDate: formData.deliveryDate,
      supplierName: suppliers.find(s => s.id === formData.supplierId)?.name || 'مورد عام',
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

    setOrderToPrint(poData);
    setTimeout(() => {
      window.print();
      setOrderToPrint(null);
    }, 200);
  };

  // تحويل إلى فاتورة مشتريات
  const handleConvertToInvoice = async () => {
    if (!editingId) return;
    if (!targetWarehouseId) {
      showToast('يرجى اختيار مستودع الاستلام لإصدار فاتورة المشتريات', 'warning');
      return;
    }

    setConverting(true);
    try {
      await convertPoToInvoice(editingId, targetWarehouseId);
      showToast('تم تحويل أمر الشراء إلى فاتورة مشتريات بنجاح ✅', 'success');
      setIsConvertModalOpen(false);
      navigate('/purchase-invoices-list');
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
              {editingId ? `أمر شراء: ${formData.orderNumber}` : 'أمر شراء جديد'}
              {editingId && (
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                  formData.status === 'posted' || formData.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                  formData.status === 'converted' || formData.status === 'invoiced' ? 'bg-purple-100 text-purple-700' :
                  formData.status === 'sent' ? 'bg-blue-100 text-blue-700' : 
                  formData.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {formData.status === 'posted' || formData.status === 'completed' ? 'مرحّل (مكتمل) ✅' :
                   formData.status === 'converted' || formData.status === 'invoiced' ? 'محول لفاتورة 🔄' : 
                   formData.status === 'sent' ? 'مرسل للمورد 📬' : 
                   formData.status === 'cancelled' ? 'ملغي ❌' : 'مسودة 📝'}
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-400 font-bold">إصدار وتعميد طلبات الشراء والتوريد ومتابعة الموردين</p>
          </div>
        </div>

        {/* 🧭 أسهم التنقل بين أوامر الشراء */}
        <div className="flex items-center gap-1 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
          <button 
            type="button" 
            onClick={() => handleNavigate('first')} 
            disabled={orderIds.length === 0 || currentIndex === 0} 
            title="أول أمر شراء"
            className="p-2 text-slate-600 hover:bg-white hover:text-blue-600 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronsRight size={18} />
          </button>
          
          <button 
            type="button" 
            onClick={() => handleNavigate('prev')} 
            disabled={orderIds.length === 0 || currentIndex <= 0} 
            title="أمر الشراء السابق"
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
              <span className="text-emerald-600 font-bold">جديد ➕</span>
            )}
          </div>

          <button 
            type="button" 
            onClick={() => handleNavigate('next')} 
            disabled={orderIds.length === 0 || currentIndex >= orderIds.length - 1 || currentIndex === -1} 
            title="أمر الشراء التالي"
            className="p-2 text-slate-600 hover:bg-white hover:text-blue-600 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronLeft size={18} />
          </button>

          <button 
            type="button" 
            onClick={() => handleNavigate('last')} 
            disabled={orderIds.length === 0 || currentIndex >= orderIds.length - 1 || currentIndex === -1} 
            title="آخر أمر شراء"
            className="p-2 text-slate-600 hover:bg-white hover:text-blue-600 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronsLeft size={18} />
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button 
            type="button" 
            onClick={() => navigate('/purchase-order-list')} 
            className="bg-slate-100 text-slate-700 hover:bg-slate-200 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
            title="عرض سجل أوامر الشراء"
          >
            <List size={16} /> سجل أوامر الشراء
          </button>

          <button 
            type="button" 
            onClick={handleNewOrder} 
            className="bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
            title="بدء أمر شراء جديد"
          >
            <Plus size={16} /> جديد
          </button>

          {editingId && (
            <>
              {formData.status !== 'converted' && formData.status !== 'invoiced' && formData.status !== 'posted' && formData.status !== 'completed' && formData.status !== 'cancelled' && (
                <button 
                  type="button" 
                  onClick={() => {
                    setTargetWarehouseId(warehouses.length === 1 ? warehouses[0].id : '');
                    setIsConvertModalOpen(true);
                  }} 
                  className="bg-purple-600 text-white hover:bg-purple-700 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
                  title="تحويل أمر الشراء إلى فاتورة مشتريات واستلام البضاعة"
                >
                  <ArrowRightLeft size={16} /> تحويل لفاتورة
                </button>
              )}

              <button 
                type="button" 
                onClick={handlePrintCurrent} 
                className="bg-slate-800 text-white hover:bg-slate-700 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                title="طباعة أمر الشراء"
              >
                <Printer size={16} /> طباعة
              </button>

              <button 
                type="button" 
                onClick={handleDeleteCurrent} 
                disabled={deleting} 
                className="bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                title="حذف أمر الشراء"
              >
                {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} حذف
              </button>
            </>
          )}

          <button 
            type="button" 
            onClick={handleSave} 
            disabled={saving} 
            className="bg-blue-600 text-white px-5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} 
            {editingId ? 'حفظ التعديلات' : 'حفظ أمر الشراء'}
          </button>
        </div>
      </div>

      {/* Main Form Body */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">المورد <span className="text-red-500">*</span></label>
          <select 
            className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm font-bold outline-none focus:border-blue-500" 
            value={formData.supplierId} 
            onChange={e => setFormData({...formData, supplierId: e.target.value})}
          >
            <option value="">اختر المورد...</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ أمر الشراء <span className="text-red-500">*</span></label>
          <input 
            type="date" 
            className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm font-bold outline-none focus:border-blue-500" 
            value={formData.date} 
            onChange={e => setFormData({...formData, date: e.target.value})} 
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ التسليم المتوقع (اختياري)</label>
          <input 
            type="date" 
            className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm outline-none focus:border-blue-500" 
            value={formData.deliveryDate} 
            onChange={e => setFormData({...formData, deliveryDate: e.target.value})} 
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">رقم أمر الشراء (اختياري)</label>
          <input 
            type="text" 
            className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm font-mono font-bold outline-none focus:border-blue-500" 
            value={formData.orderNumber} 
            onChange={e => setFormData({...formData, orderNumber: e.target.value})} 
            placeholder="تلقائي (مثال: PO-123456)" 
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">حالة أمر الشراء</label>
          <select 
            className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm font-bold outline-none focus:border-blue-500" 
            value={formData.status} 
            onChange={e => setFormData({...formData, status: e.target.value})}
          >
            <option value="draft">مسودة 📝</option>
            <option value="sent">مرسل للمورد 📬</option>
            <option value="converted">محول لفاتورة 🔄</option>
            <option value="posted">مرحّل (مكتمل) ✅</option>
            <option value="cancelled">ملغي ❌</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات / شروط التوريد</label>
          <input 
            type="text" 
            className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm outline-none focus:border-blue-500" 
            value={formData.notes} 
            onChange={e => setFormData({...formData, notes: e.target.value})} 
            placeholder="أدخل أي شروط أو ملاحظات للمورد..." 
          />
        </div>
      </div>

      {/* Items Section */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
        
        {/* Product Search */}
        <div className="relative">
          <label className="block text-xs font-bold text-slate-600 mb-1">إضافة صنف لأمر الشراء</label>
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
                    {(p.purchase_price || p.cost || 0).toLocaleString()} {settings.currency || 'ج.م'}
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
                <th className="p-3 w-32 text-center">السعر التقديري</th>
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
              <span>إجمالي أمر الشراء:</span>
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
                <WarehouseIcon className="text-purple-600" /> اختيار مستودع الاستلام
              </h3>
              <button onClick={() => setIsConvertModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              سيتم تحويل أمر الشراء إلى فاتورة مشتريات رسمية وتحديث كميات المخزون فوراً في المستودع المختار.
            </p>
            <div className="mb-6">
              <label className="block text-xs font-bold text-slate-700 mb-1">المستودع المستلم <span className="text-red-500">*</span></label>
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
                تأكيد التحويل لفاتورة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden printable component */}
      {orderToPrint && (
        <PurchaseOrderPrint orderData={orderToPrint} companySettings={companySettings} />
      )}
    </div>
  );
};

export default PurchaseOrderForm;
