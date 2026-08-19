import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { 
  RotateCw, Save, Loader2, Plus, Trash2, AlertCircle, 
  ChevronRight, ChevronLeft, ChevronsRight, ChevronsLeft, 
  Printer, List, RefreshCw, FileText, Search
} from 'lucide-react';
import { createPurchaseReturnSchema } from '../../utils/validationSchemas';
import { useNavigate, useLocation } from 'react-router-dom';
import { PurchaseReturnPrint } from './PurchaseReturnPrint';

const PurchaseReturnForm = () => {
  const { suppliers, products, warehouses, settings, purchaseInvoices, currentUser } = useAccounting();
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();

  const [formData, setFormData] = useState({
    supplierId: '',
    originalInvoiceId: '',
    originalInvoiceOrgId: null as string | null,
    warehouseId: '',
    date: new Date().toISOString().split('T')[0],
    returnNumber: '',
    notes: '',
    status: 'draft'
  });
  const [items, setItems] = useState<any[]>([]);
  const [uoms, setUoms] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Navigation & Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [returnIds, setReturnIds] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [loadingReturn, setLoadingReturn] = useState(false);
  const [returnToPrint, setReturnToPrint] = useState<any>(null);
  const [companySettings, setCompanySettings] = useState<any>(null);

  useEffect(() => {
    supabase.rpc('get_current_company_settings').maybeSingle().then(({ data }) => {
      if (data) setCompanySettings(data);
    });
  }, []);

  // جلب كافة معرفات مرتجعات المشتريات للتنقل
  const fetchReturnIds = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id;
      if (!userOrgId) return;

      const { data, error } = await supabase
        .from('purchase_returns')
        .select('id')
        .eq('organization_id', userOrgId)
        .order('return_date', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;
      const ids = (data || []).map(r => r.id);
      setReturnIds(ids);
    } catch (err) {
      console.error('Error fetching purchase return IDs:', err);
    }
  };

  useEffect(() => {
    fetchReturnIds();
  }, []);

  useEffect(() => {
    const fetchUoms = async () => {
      const orgId = (currentUser as any)?.organization_id;
      const { data } = await supabase.from('uoms').select('*').eq('organization_id', orgId);
      if (data) setUoms(data);
    };
    if (currentUser) fetchUoms();
  }, [currentUser]);

  // تصفية فواتير المشتريات بناءً على المورد المختار
  const supplierInvoices = useMemo(() => {
    if (!formData.supplierId) return [];
    return purchaseInvoices.filter(inv => inv.supplierId === formData.supplierId && (inv.status as any) === 'posted');
  }, [formData.supplierId, purchaseInvoices]);

  // تحديث معرف المنظمة عند اختيار فاتورة
  useEffect(() => {
      if (formData.originalInvoiceId) {
          const inv = supplierInvoices.find(i => i.id === formData.originalInvoiceId);
          if (inv) {
              setFormData(prev => ({ ...prev, originalInvoiceOrgId: (inv as any).organization_id }));
          }
      }
  }, [formData.originalInvoiceId, supplierInvoices]);

  useEffect(() => {
    if (warehouses.length === 1 && !formData.warehouseId && !editingId) {
      setFormData(prev => ({ ...prev, warehouseId: warehouses[0].id }));
    }
  }, [warehouses, formData.warehouseId, editingId]);

  // تحميل مرتجع مشتريات محدد للعرض والتعديل
  const loadReturnById = async (id: string) => {
    setLoadingReturn(true);
    try {
      const { data: ret, error: retError } = await supabase
        .from('purchase_returns')
        .select(`
          *,
          suppliers(id, name, phone),
          warehouses(id, name),
          purchase_invoices:original_invoice_id(id, invoice_number),
          purchase_return_items(id, product_id, quantity, unit_price, total, uom_id, products(name, sku, purchase_price, base_uom_id))
        `)
        .eq('id', id)
        .single();

      if (retError) throw retError;
      if (!ret) throw new Error('المرتجع غير موجود');

      setEditingId(ret.id);
      setFormData({
        supplierId: ret.supplier_id || '',
        originalInvoiceId: ret.original_invoice_id || '',
        originalInvoiceOrgId: ret.organization_id || null,
        warehouseId: ret.warehouse_id || '',
        date: ret.return_date || new Date().toISOString().split('T')[0],
        returnNumber: ret.return_number || '',
        notes: ret.notes || '',
        status: ret.status || 'draft'
      });

      const formattedItems = (ret.purchase_return_items || []).map((item: any) => ({
        id: item.id,
        productId: item.product_id,
        name: item.products?.name || 'صنف',
        quantity: Number(item.quantity) || 0,
        price: Number(item.unit_price) || 0,
        uomId: item.uom_id || item.products?.base_uom_id || '',
        total: Number(item.total) || 0
      }));

      setItems(formattedItems);

      const idx = returnIds.indexOf(id);
      if (idx !== -1) setCurrentIndex(idx);

    } catch (err: any) {
      console.error('Error loading purchase return:', err);
      showToast('فشل تحميل بيانات المرتجع: ' + err.message, 'error');
    } finally {
      setLoadingReturn(false);
    }
  };

  // استقبال المرتجع المحال من السجل
  useEffect(() => {
    if (location.state && (location.state as any).returnToEdit) {
      const passed = (location.state as any).returnToEdit;
      loadReturnById(passed.id);
    }
  }, [location.state]);

  // التنقل بين السجلات
  const handleNavigate = (direction: 'first' | 'prev' | 'next' | 'last') => {
    if (returnIds.length === 0) {
      showToast('لا توجد مرتجعات مشتريات للتنقل بينها', 'info');
      return;
    }

    let targetIdx = currentIndex;
    if (direction === 'first') {
      targetIdx = 0;
    } else if (direction === 'last') {
      targetIdx = returnIds.length - 1;
    } else if (direction === 'prev') {
      if (currentIndex <= 0) {
        targetIdx = 0;
        showToast('هذا هو أول مرتجع مسجل', 'info');
      } else {
        targetIdx = currentIndex - 1;
      }
    } else if (direction === 'next') {
      if (currentIndex >= returnIds.length - 1 || currentIndex === -1) {
        targetIdx = returnIds.length - 1;
        showToast('هذا هو آخر مرتجع مسجل', 'info');
      } else {
        targetIdx = currentIndex + 1;
      }
    }

    if (targetIdx >= 0 && targetIdx < returnIds.length) {
      loadReturnById(returnIds[targetIdx]);
    }
  };

  const handleNewReturn = () => {
    setEditingId(null);
    setCurrentIndex(-1);
    setItems([]);
    setFormData({
      supplierId: '',
      originalInvoiceId: '',
      originalInvoiceOrgId: null,
      warehouseId: warehouses.length === 1 ? warehouses[0].id : '',
      date: new Date().toISOString().split('T')[0],
      returnNumber: '',
      notes: '',
      status: 'draft'
    });
    showToast('تم فتح نموذج مرتجع مشتريات جديد ➕', 'info');
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...items];
    newItems[index][field] = value;

    if (field === 'uomId') {
        const selectedUom = uoms.find(u => u.id === value);
        const product = products.find(p => p.id === newItems[index].productId);
        if (selectedUom && product) {
            const basePrice = product.purchase_price || product.cost || 0;
            newItems[index].price = Number((basePrice * selectedUom.ratio).toFixed(4));
        }
    }

    if (field === 'quantity' || field === 'price') {
        newItems[index][field] = parseFloat(value) || 0;
    } else {
        newItems[index][field] = value;
    }

    if (field === 'productId') {
      const product = products.find(p => p.id === value);
      newItems[index].price = product?.purchase_price || product?.cost || 0;
      newItems[index].uomId = product?.purchase_uom_id || product?.base_uom_id || '';
      newItems[index].name = product?.name || '';
    }

    newItems[index].total = (newItems[index].quantity || 0) * (newItems[index].price || 0);
    setItems(newItems);
  };

  const addItem = () => {
    setItems([...items, { productId: '', quantity: 1, price: 0, uomId: '', total: 0 }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const subtotal = useMemo(() => items.reduce((sum, item) => sum + (Number(item.total) || 0), 0), [items]);
  const taxAmount = useMemo(() => subtotal * (settings.enableTax ? ((settings.vatRate || 0) / 100) : 0), [subtotal, settings]);
  const totalAmount = useMemo(() => subtotal + taxAmount, [subtotal, taxAmount]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validationResult = createPurchaseReturnSchema.safeParse({ ...formData, items });
    if (!validationResult.success) {
        showToast(validationResult.error.issues[0].message, 'warning');
        return;
    }

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const metadataOrgId = session?.user?.user_metadata?.org_id;
      const profileOrgId = (currentUser as any)?.organization_id;
      const targetOrgId = formData.originalInvoiceOrgId || metadataOrgId || profileOrgId;

      if (!targetOrgId && currentUser?.role !== 'super_admin') {
          throw new Error("تعذر تحديد هوية الشركة.");
      }

      const returnNumber = formData.returnNumber || `PRET-${Date.now().toString().slice(-6)}`;
      let returnIdToApprove = editingId;

      if (editingId) {
        // وضع التعديل: عكس القديم أولاً
        const { data: oldRet } = await supabase.from('purchase_returns').select('*, purchase_return_items(*)').eq('id', editingId).single();
        if (oldRet && oldRet.status === 'posted') {
          // إعادة إضافة الكميات للمخزون
          for (const oldItem of (oldRet.purchase_return_items || [])) {
            if (oldItem.product_id && oldItem.quantity) {
              const { data: prod } = await supabase.from('products').select('stock, warehouse_stock').eq('id', oldItem.product_id).single();
              if (prod) {
                const newStock = (Number(prod.stock) || 0) + Number(oldItem.quantity);
                let newWStock = prod.warehouse_stock || {};
                if (oldRet.warehouse_id && newWStock[oldRet.warehouse_id] !== undefined) {
                  newWStock[oldRet.warehouse_id] = (Number(newWStock[oldRet.warehouse_id]) || 0) + Number(oldItem.quantity);
                }
                await supabase.from('products').update({ stock: newStock, warehouse_stock: newWStock }).eq('id', oldItem.product_id);
              }
            }
          }

          // حذف القيد القديم
          if (oldRet.related_journal_entry_id) {
            await supabase.from('journal_entries').delete().eq('id', oldRet.related_journal_entry_id);
          } else {
            await supabase.from('journal_entries').delete().eq('organization_id', targetOrgId).eq('reference', oldRet.return_number);
          }
        }

        // تحديث الرأس
        const { error: updateError } = await supabase.from('purchase_returns').update({
          supplier_id: formData.supplierId,
          original_invoice_id: formData.originalInvoiceId || null,
          warehouse_id: formData.warehouseId,
          return_date: formData.date,
          return_number: returnNumber,
          total_amount: totalAmount,
          tax_amount: taxAmount,
          notes: formData.notes,
          status: 'draft',
          related_journal_entry_id: null
        }).eq('id', editingId);

        if (updateError) throw updateError;

        // حذف البنود القديمة وإعادة إدخالها
        await supabase.from('purchase_return_items').delete().eq('purchase_return_id', editingId);

        const itemsToInsert = items.map(item => ({
          organization_id: targetOrgId,
          purchase_return_id: editingId,
          product_id: item.productId,
          quantity: item.quantity,
          uom_id: item.uomId || null,
          unit_price: item.price,
          total: item.total
        }));

        const { error: itemsError } = await supabase.from('purchase_return_items').insert(itemsToInsert);
        if (itemsError) throw itemsError;

      } else {
        // إنشاء جديد
        const { data: returnHeader, error: headerError } = await supabase.from('purchase_returns').insert({
          organization_id: targetOrgId,
          return_number: returnNumber,
          supplier_id: formData.supplierId,
          original_invoice_id: formData.originalInvoiceId || null,
          warehouse_id: formData.warehouseId,
          return_date: formData.date,
          total_amount: totalAmount,
          tax_amount: taxAmount,
          notes: formData.notes,
          status: 'draft',
          created_by: currentUser?.id
        }).select().single();

        if (headerError) throw headerError;

        returnIdToApprove = returnHeader.id;

        const itemsToInsert = items.map(item => ({
          organization_id: targetOrgId,
          purchase_return_id: returnHeader.id,
          product_id: item.productId,
          quantity: item.quantity,
          uom_id: item.uomId || null,
          unit_price: item.price,
          total: item.total
        }));

        const { error: itemsError } = await supabase.from('purchase_return_items').insert(itemsToInsert);
        if (itemsError) throw itemsError;
      }

      // اعتماد وترحيل عبر RPC
      if (returnIdToApprove) {
        const { error: rpcError } = await supabase.rpc('approve_purchase_return', { 
          p_return_id: returnIdToApprove 
        });
        if (rpcError) throw rpcError;
      }

      showToast(editingId ? 'تم تحديث واعتماد مرتجع المشتريات وتحديث الحسابات بنجاح ✅' : 'تم حفظ مرتجع المشتريات وتحديث المخزون بنجاح ✅', 'success');
      
      await fetchReturnIds();
      if (returnIdToApprove) {
        loadReturnById(returnIdToApprove);
      }

    } catch (error: any) {
      console.error(error);
      showToast('فشل حفظ المرتجع: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCurrent = async () => {
    if (!editingId) return;

    if (!window.confirm(`هل أنت متأكد من حذف مرتجع المشتريات رقم (${formData.returnNumber})؟\nسيتم إلغاء أثره على المخزون والقيد المحاسبي بالكامل.`)) {
      return;
    }

    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id;

      const { data: ret } = await supabase.from('purchase_returns').select('*, purchase_return_items(*)').eq('id', editingId).single();
      if (ret && ret.status === 'posted') {
        for (const item of (ret.purchase_return_items || [])) {
          if (item.product_id && item.quantity) {
            const { data: prod } = await supabase.from('products').select('stock, warehouse_stock').eq('id', item.product_id).single();
            if (prod) {
              const newStock = (Number(prod.stock) || 0) + Number(item.quantity);
              let newWStock = prod.warehouse_stock || {};
              if (ret.warehouse_id && newWStock[ret.warehouse_id] !== undefined) {
                newWStock[ret.warehouse_id] = (Number(newWStock[ret.warehouse_id]) || 0) + Number(item.quantity);
              }
              await supabase.from('products').update({ stock: newStock, warehouse_stock: newWStock }).eq('id', item.product_id);
            }
          }
        }

        if (ret.related_journal_entry_id) {
          await supabase.from('journal_entries').delete().eq('id', ret.related_journal_entry_id);
        } else {
          await supabase.from('journal_entries').delete().eq('organization_id', userOrgId).eq('reference', ret.return_number);
        }
      }

      await supabase.from('purchase_return_items').delete().eq('purchase_return_id', editingId);
      const { error: delErr } = await supabase.from('purchase_returns').delete().eq('id', editingId);
      if (delErr) throw delErr;

      showToast('تم حذف مرتجع المشتريات وعكس الحركات بنجاح ✅', 'success');

      const newIds = returnIds.filter(id => id !== editingId);
      setReturnIds(newIds);

      if (newIds.length > 0) {
        const nextId = newIds[Math.min(currentIndex, newIds.length - 1)];
        loadReturnById(nextId);
      } else {
        handleNewReturn();
      }

    } catch (err: any) {
      console.error('Error deleting purchase return:', err);
      showToast('فشل حذف المرتجع: ' + err.message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handlePrintCurrent = () => {
    const returnData = {
      returnNumber: formData.returnNumber,
      date: formData.date,
      supplierName: suppliers.find(s => s.id === formData.supplierId)?.name || '-',
      warehouseName: warehouses.find(w => w.id === formData.warehouseId)?.name || '-',
      originalInvoiceNumber: supplierInvoices.find(i => i.id === formData.originalInvoiceId)?.invoiceNumber || '',
      notes: formData.notes,
      totalAmount: totalAmount,
      taxAmount: taxAmount,
      items: items.map(item => ({
        name: item.name || products.find(p => p.id === item.productId)?.name || 'صنف',
        uomName: uoms.find(u => u.id === item.uomId)?.name || '-',
        quantity: item.quantity,
        price: item.price,
        total: item.total
      }))
    };

    setReturnToPrint(returnData);
    setTimeout(() => {
      window.print();
      setReturnToPrint(null);
    }, 200);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in">
      
      {/* تنبيه للمستودعات */}
      {warehouses.length === 0 && (
        <div className="bg-red-50 border-2 border-red-100 p-5 rounded-2xl mb-4 flex flex-col md:flex-row items-center justify-between gap-4 animate-in zoom-in shadow-sm">
          <div className="flex items-center gap-4">
            <div className="bg-red-100 p-2 rounded-xl">
              <AlertCircle className="text-red-600" size={24} />
            </div>
            <div>
              <h4 className="font-bold text-red-900">نظام المخازن غير مهيأ</h4>
              <p className="text-sm text-red-700">لا يمكنك رد بضاعة للمورد بدون وجود مستودع مسجل للخروج منه.</p>
            </div>
          </div>
          <button 
            onClick={() => navigate('/warehouses')} 
            className="bg-red-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-red-700 transition-all shadow-sm flex items-center gap-2 whitespace-nowrap"
          >
            <Plus size={18} /> تهيئة المخازن
          </button>
        </div>
      )}

      {/* 🚀 Header & Navigation Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
        
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-orange-50 text-orange-600 rounded-xl">
            <RotateCw size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
              {editingId ? `مرتجع مشتريات: ${formData.returnNumber}` : 'مرتجع مشتريات جديد'}
              {editingId && (
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                  formData.status === 'posted' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {formData.status === 'posted' ? 'مرحل ✅' : 'مسودة 📝'}
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-400 font-bold">رد بضاعة إلى المورد وتخفيض حسابه وتحديث المخزون</p>
          </div>
        </div>

        {/* 🧭 أسهم التنقل بين المرتجعات */}
        <div className="flex items-center gap-1 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
          <button 
            type="button" 
            onClick={() => handleNavigate('first')} 
            disabled={returnIds.length === 0 || currentIndex === 0} 
            title="أول مرتجع"
            className="p-2 text-slate-600 hover:bg-white hover:text-orange-600 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronsRight size={18} />
          </button>
          
          <button 
            type="button" 
            onClick={() => handleNavigate('prev')} 
            disabled={returnIds.length === 0 || currentIndex <= 0} 
            title="المرتجع السابق"
            className="p-2 text-slate-600 hover:bg-white hover:text-orange-600 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronRight size={18} />
          </button>

          {/* Record Counter */}
          <div className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-mono font-black text-slate-700 select-none">
            {loadingReturn ? (
              <Loader2 size={14} className="animate-spin text-orange-600" />
            ) : editingId && currentIndex !== -1 ? (
              <span>{currentIndex + 1} / {returnIds.length}</span>
            ) : (
              <span className="text-emerald-600 font-bold">جديد ➕</span>
            )}
          </div>

          <button 
            type="button" 
            onClick={() => handleNavigate('next')} 
            disabled={returnIds.length === 0 || currentIndex >= returnIds.length - 1 || currentIndex === -1} 
            title="المرتجع التالي"
            className="p-2 text-slate-600 hover:bg-white hover:text-orange-600 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronLeft size={18} />
          </button>

          <button 
            type="button" 
            onClick={() => handleNavigate('last')} 
            disabled={returnIds.length === 0 || currentIndex >= returnIds.length - 1 || currentIndex === -1} 
            title="آخر مرتجع"
            className="p-2 text-slate-600 hover:bg-white hover:text-orange-600 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronsLeft size={18} />
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button 
            type="button" 
            onClick={() => navigate('/purchase-returns-list')} 
            className="bg-slate-100 text-slate-700 hover:bg-slate-200 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
            title="عرض سجل المرتجعات"
          >
            <List size={16} /> سجل المرتجعات
          </button>

          <button 
            type="button" 
            onClick={handleNewReturn} 
            className="bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
            title="بدء مرتجع مشتريات جديد"
          >
            <Plus size={16} /> جديد
          </button>

          {editingId && (
            <>
              <button 
                type="button" 
                onClick={handlePrintCurrent} 
                className="bg-slate-800 text-white hover:bg-slate-700 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                title="طباعة إشعار المرتجع"
              >
                <Printer size={16} /> طباعة
              </button>

              <button 
                type="button" 
                onClick={handleDeleteCurrent} 
                disabled={deleting} 
                className="bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                title="حذف هذا المرتجع"
              >
                {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} حذف
              </button>
            </>
          )}

          <button 
            type="button" 
            onClick={handleSave} 
            disabled={saving} 
            className="bg-orange-600 text-white px-5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 hover:bg-orange-700 transition-colors shadow-sm disabled:opacity-50"
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} 
            {editingId ? 'حفظ التعديلات' : 'حفظ وترحيل'}
          </button>
        </div>
      </div>

      <form onSubmit={handleSave} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">المورد <span className="text-red-500">*</span></label>
            <select required value={formData.supplierId} onChange={e => setFormData({ ...formData, supplierId: e.target.value })} className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm font-bold outline-none focus:border-orange-500">
              <option value="">اختر المورد...</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">الفاتورة الأصلية (اختياري)</label>
            <select value={formData.originalInvoiceId} onChange={e => setFormData({ ...formData, originalInvoiceId: e.target.value })} className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm outline-none focus:border-orange-500" disabled={!formData.supplierId}>
              <option value="">-- بدون ربط (مرتجع حر) --</option>
              {supplierInvoices.map(inv => (
                <option key={inv.id} value={inv.id}>{inv.invoiceNumber} ({new Date(inv.date).toLocaleDateString('ar-EG')})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ المرتجع <span className="text-red-500">*</span></label>
            <input type="date" required value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm font-bold outline-none focus:border-orange-500" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">المستودع <span className="text-red-500">*</span></label>
            <select required value={formData.warehouseId} onChange={e => setFormData({ ...formData, warehouseId: e.target.value })} className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm font-bold outline-none focus:border-orange-500">
              <option value="">-- اختر المستودع --</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">رقم المرتجع (اختياري)</label>
            <input type="text" value={formData.returnNumber} onChange={e => setFormData({ ...formData, returnNumber: e.target.value })} placeholder="تلقائي (مثال: PRET-123456)" className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm font-mono font-bold outline-none focus:border-orange-500" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات</label>
            <input type="text" value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} placeholder="سبب إرجاع البضاعة..." className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm outline-none focus:border-orange-500" />
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="font-bold text-sm text-slate-800">الأصناف المرتجعة</h3>
          
          <div className="grid grid-cols-12 gap-2 pb-2 border-b-2 border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest no-print">
            <div className="col-span-4 pr-2">بيان الصنف</div>
            <div className="col-span-2 text-center">الوحدة</div>
            <div className="col-span-2 text-center">الكمية المرتجعة</div>
            <div className="col-span-2 text-center">سعر المرتجع</div>
            <div className="col-span-2 text-center">إجمالي القيمة</div>
          </div>

          {items.map((item, index) => (
            <div key={index} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-4">
                <select required value={item.productId || ''} onChange={e => handleItemChange(index, 'productId', e.target.value)} className="w-full border rounded-lg p-2 text-sm bg-white font-bold">
                  <option value="">اختر الصنف...</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                  <select 
                      value={item.uomId || ''} 
                      onChange={e => handleItemChange(index, 'uomId', e.target.value)}
                      className="w-full border rounded-lg p-2 text-xs bg-white font-bold"
                  >
                      {uoms.filter(u => {
                          const prod = products.find(p => p.id === item.productId);
                          const baseUom = uoms.find(ux => ux.id === prod?.base_uom_id);
                          return !baseUom || u.category_id === baseUom.category_id;
                      }).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
              </div>
              <div className="col-span-2">
                <input type="number" step="any" min="0.01" value={item.quantity} onChange={e => handleItemChange(index, 'quantity', e.target.value)} className="w-full border rounded-lg p-2 text-center font-mono font-bold text-orange-600 bg-white" placeholder="الكمية" />
              </div>
              <div className="col-span-2">
                <input type="number" step="any" min="0" value={item.price} onChange={e => handleItemChange(index, 'price', e.target.value)} className="w-full border rounded-lg p-2 text-center font-mono font-bold text-slate-800 bg-white" placeholder="السعر" />
              </div>
              <div className="col-span-2 flex items-center gap-1">
                <input type="text" readOnly value={(Number(item.total) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} className="w-full bg-slate-100 border rounded-lg p-2 text-center font-mono font-black" />
                <button type="button" onClick={() => removeItem(index)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}

          <button type="button" onClick={addItem} className="flex items-center gap-2 text-orange-600 font-bold text-xs mt-3 hover:bg-orange-50 px-3 py-1.5 rounded-lg border border-orange-200 transition-colors">
            <Plus size={14} /> إضافة صنف آخر
          </button>
        </div>

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
            <div className="flex justify-between text-sm font-black text-orange-700 border-t border-slate-200 pt-2">
              <span>إجمالي المرتجع النهائي:</span>
              <span className="font-mono text-lg" dir="ltr">{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {settings.currency || 'ج.م'}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button type="submit" disabled={saving} className="bg-orange-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-orange-700 flex items-center gap-2 shadow-md transition-colors disabled:opacity-50">
            {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />} 
            {editingId ? 'حفظ وتحديث مرتجع المشتريات' : 'حفظ وترحيل مرتجع المشتريات'}
          </button>
        </div>
      </form>

      {/* Hidden printable component */}
      {returnToPrint && (
        <PurchaseReturnPrint returnData={returnToPrint} companySettings={companySettings} />
      )}
    </div>
  );
};

export default PurchaseReturnForm;
