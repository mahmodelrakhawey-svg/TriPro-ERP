import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { 
  RotateCcw, Save, Trash2, Loader2, Search, AlertCircle, Plus, 
  ChevronRight, ChevronLeft, ChevronsRight, ChevronsLeft, Printer, 
  List, RefreshCw, FileText
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { z } from 'zod';
import { useNavigate, useLocation } from 'react-router-dom';
import { SalesReturnPrint } from './SalesReturnPrint';

const SalesReturnForm = () => {
  const { customers, products, currentUser, warehouses, settings } = useAccounting();
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();

  const [items, setItems] = useState<any[]>([]);
  const [formData, setFormData] = useState({ 
    customerId: '', 
    warehouseId: '', 
    date: new Date().toISOString().split('T')[0], 
    returnNumber: '', 
    notes: '',
    status: 'draft'
  });
  const [uoms, setUoms] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [searchInvoiceNumber, setSearchInvoiceNumber] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [returnPartialQuantities, setReturnPartialQuantities] = useState(false);
  const [originalInvoiceId, setOriginalInvoiceId] = useState<string | null>(null);
  const [originalInvoiceOrgId, setOriginalInvoiceOrgId] = useState<string | null>(null);

  // Edit and Navigation State
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

  // 1. جلب كافة معرفات المرتجعات للتنقل بينها
  const fetchReturnIds = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id;
      if (!userOrgId) return;

      const { data, error } = await supabase
        .from('sales_returns')
        .select('id')
        .eq('organization_id', userOrgId)
        .order('return_date', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;
      const ids = (data || []).map(r => r.id);
      setReturnIds(ids);
    } catch (err) {
      console.error('Error fetching return IDs for navigation:', err);
    }
  };

  useEffect(() => {
    fetchReturnIds();
  }, []);

  // تحميل البيانات الأساسية (المستودع والوحدات)
  useEffect(() => {
    const fetchUoms = async () => {
      const orgId = (currentUser as any)?.organization_id;
      const { data } = await supabase.from('uoms').select('*').eq('organization_id', orgId);
      if (data) setUoms(data);
    };
    fetchUoms();

    if (!formData.warehouseId && !editingId) {
      if (warehouses.length === 1) {
        setFormData(prev => ({ ...prev, warehouseId: warehouses[0].id }));
      } else if (settings.defaultWarehouseId) {
        const preferred = warehouses.find(w => w.id === settings.defaultWarehouseId);
        if (preferred) setFormData(prev => ({ ...prev, warehouseId: preferred.id }));
      }
    }
  }, [warehouses, formData.warehouseId, currentUser, editingId]);

  // تحميل مرتجع محدد للعرض والتعديل
  const loadReturnById = async (id: string) => {
    setLoadingReturn(true);
    try {
      const { data: ret, error: retError } = await supabase
        .from('sales_returns')
        .select(`
          *,
          customers(id, name, phone),
          warehouses(id, name),
          invoices:original_invoice_id(id, invoice_number),
          sales_return_items(id, product_id, quantity, unit_price, total, uom_id, products(name, sku, sales_price, base_uom_id))
        `)
        .eq('id', id)
        .single();

      if (retError) throw retError;
      if (!ret) throw new Error('المرتجع غير موجود');

      setEditingId(ret.id);
      setFormData({
        customerId: ret.customer_id || '',
        warehouseId: ret.warehouse_id || '',
        date: ret.return_date || new Date().toISOString().split('T')[0],
        returnNumber: ret.return_number || '',
        notes: ret.notes || '',
        status: ret.status || 'draft'
      });
      setOriginalInvoiceId(ret.original_invoice_id || null);
      setOriginalInvoiceOrgId(ret.organization_id || null);

      if (ret.invoices?.invoice_number) {
        setSearchInvoiceNumber(ret.invoices.invoice_number);
      } else {
        setSearchInvoiceNumber('');
      }

      const formattedItems = (ret.sales_return_items || []).map((item: any) => ({
        id: item.id,
        productId: item.product_id,
        name: item.products?.name || 'صنف',
        quantity: Number(item.quantity) || 0,
        unitPrice: Number(item.unit_price) || 0,
        uomId: item.uom_id || item.products?.base_uom_id || '',
        total: Number(item.total) || 0
      }));

      setItems(formattedItems);

      // تحديث الفهرس الحالي
      const idx = returnIds.indexOf(id);
      if (idx !== -1) setCurrentIndex(idx);

    } catch (err: any) {
      console.error('Error loading return:', err);
      showToast('فشل تحميل بيانات المرتجع: ' + err.message, 'error');
    } finally {
      setLoadingReturn(false);
    }
  };

  // التحقق من وجود مرتجع ممرر عبر التوجيه (من سجل المرتجعات)
  useEffect(() => {
    if (location.state && (location.state as any).returnToEdit) {
      const passedReturn = (location.state as any).returnToEdit;
      loadReturnById(passedReturn.id);
    }
  }, [location.state]);

  // التنقل بين السجلات
  const handleNavigate = (direction: 'first' | 'prev' | 'next' | 'last') => {
    if (returnIds.length === 0) {
      showToast('لا توجد مرتجعات مسجلة للتنقل بينها', 'info');
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

  // بدء مرتجع جديد
  const handleNewReturn = () => {
    setEditingId(null);
    setCurrentIndex(-1);
    setItems([]);
    setFormData({
      customerId: '',
      warehouseId: warehouses.length === 1 ? warehouses[0].id : (settings.defaultWarehouseId || ''),
      date: new Date().toISOString().split('T')[0],
      returnNumber: '',
      notes: '',
      status: 'draft'
    });
    setOriginalInvoiceId(null);
    setOriginalInvoiceOrgId(null);
    setSearchInvoiceNumber('');
    showToast('تم فتح نموذج مرتجع مبيعات جديد ➕', 'info');
  };

  const handleFetchInvoice = async () => {
    if (!searchInvoiceNumber.trim()) return;
    setIsSearching(true);
    try {
      const { data: invoice, error } = await supabase
        .from('invoices')
        .select('*, invoice_items(*, products(name, base_uom_id))')
        .ilike('invoice_number', `%${searchInvoiceNumber.trim()}%`)
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (invoice) {
        setFormData(prev => ({ 
            ...prev, 
            customerId: invoice.customer_id || '', 
            warehouseId: invoice.warehouse_id || prev.warehouseId,
            notes: `مرتجع من فاتورة رقم ${invoice.invoice_number}` 
        }));
        setOriginalInvoiceId(invoice.id);
        setOriginalInvoiceOrgId(invoice.organization_id);
        const newItems = invoice.invoice_items.map((item: any) => ({
            productId: item.product_id,
            name: item.products?.name,
            quantity: returnPartialQuantities ? 0 : item.quantity,
            unitPrice: item.unit_price,
            uomId: item.uom_id || item.products?.base_uom_id,
            maxQuantity: item.quantity
        }));
        setItems(newItems);
        showToast('تم استيراد بيانات الفاتورة الأصلية بنجاح ✅', 'success');
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
    setItems([...items, { 
      productId: product.id, 
      name: product.name, 
      quantity: 1, 
      unitPrice: product.sales_price || 0,
      uomId: product.base_uom_id || product.sale_uom_id,
      availableUoms: uoms.filter(u => u.category_id === product.uom_categories?.id)
    }]);
    setProductSearch('');
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items];
    let processedValue = value;

    if (field === 'quantity') {
        const item = newItems[index];
        if (item.maxQuantity !== undefined && Number(value) > item.maxQuantity) {
             showToast(`لا يمكنك إرجاع كمية أكبر من ${item.maxQuantity}`, 'warning');
             processedValue = item.maxQuantity;
        }
    }
    
    if (field === 'uomId') {
        const selectedUom = uoms.find(u => u.id === value);
        const product = products.find(p => p.id === newItems[index].productId || p.id === newItems[index].product_id);
        if (selectedUom && product) {
            const basePrice = product.sales_price || product.price || 0;
            const newUnitPrice = Number((basePrice * selectedUom.ratio).toFixed(4));
            newItems[index].unitPrice = newUnitPrice;
            if (newItems[index].unit_price !== undefined) {
                newItems[index].unit_price = newUnitPrice;
            }
        }
    }

    newItems[index][field] = processedValue;
    newItems[index].total = (newItems[index].quantity || 0) * (newItems[index].unitPrice || newItems[index].unit_price || 0);
    
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    if (items.length > 0) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const calculateTotal = () => items.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.unitPrice || item.unit_price || 0)), 0);

  // حفظ المرتجع (إنشاء جديد أو تحديث مسجل)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const salesReturnSchema = z.object({
        customerId: z.string().min(1, 'الرجاء اختيار العميل'),
        warehouseId: z.string().min(1, 'الرجاء اختيار المستودع'),
        date: z.string().min(1, 'التاريخ مطلوب'),
        items: z.array(z.object({
            productId: z.string().min(1, 'الرجاء اختيار المنتج'),
            quantity: z.number().min(0.01, 'الكمية يجب أن تكون أكبر من 0'),
            unitPrice: z.number().min(0, 'السعر يجب أن يكون 0 أو أكثر')
        })).min(1, 'يجب إضافة بند واحد على الأقل')
    });

    const validationResult = salesReturnSchema.safeParse({ 
      ...formData, 
      items: items.map(it => ({
        productId: it.productId || it.product_id,
        quantity: Number(it.quantity),
        unitPrice: Number(it.unitPrice ?? it.unit_price ?? 0)
      }))
    });

    if (!validationResult.success) {
        showToast(validationResult.error.issues[0].message, 'warning');
        return;
    }

    setSaving(true);

    if (currentUser?.role === 'demo') {
        showToast('تم حفظ مرتجع المبيعات بنجاح (محاكاة)', 'success');
        setSaving(false);
        return;
    }

    try {
      const { data: profile } = await supabase.from('profiles').select('organization_id, role').eq('id', currentUser?.id).single();
      const targetOrgId = originalInvoiceOrgId || profile?.organization_id;

      if (!targetOrgId && profile?.role !== 'super_admin') throw new Error("تعذر تحديد المنظمة.");

      const subtotal = calculateTotal();
      const taxRate = settings.enableTax ? ((settings.vatRate || 14) / 100) : 0;
      const taxAmount = subtotal * taxRate;
      const totalAmount = subtotal + taxAmount;
      
      const returnNumber = formData.returnNumber || `SR-${Date.now().toString().slice(-6)}`;

      let returnIdToApprove = editingId;

      if (editingId) {
        // وضع التعديل على مرتجع موجود
        const { data: oldRet } = await supabase.from('sales_returns').select('*, sales_return_items(*)').eq('id', editingId).single();
        if (oldRet && oldRet.status === 'posted') {
          for (const oldItem of (oldRet.sales_return_items || [])) {
            if (oldItem.product_id && oldItem.quantity) {
              const { data: p } = await supabase.from('products').select('stock, warehouse_stock').eq('id', oldItem.product_id).single();
              if (p) {
                const updatedStock = Math.max(0, (Number(p.stock) || 0) - Number(oldItem.quantity));
                let updatedWStock = p.warehouse_stock || {};
                if (oldRet.warehouse_id && updatedWStock[oldRet.warehouse_id] !== undefined) {
                  updatedWStock[oldRet.warehouse_id] = Math.max(0, (Number(updatedWStock[oldRet.warehouse_id]) || 0) - Number(oldItem.quantity));
                }
                await supabase.from('products').update({
                  stock: updatedStock,
                  warehouse_stock: updatedWStock
                }).eq('id', oldItem.product_id);
              }
            }
          }

          if (oldRet.related_journal_entry_id) {
            await supabase.from('journal_entries').delete().eq('id', oldRet.related_journal_entry_id);
          } else {
            await supabase.from('journal_entries').delete().eq('organization_id', targetOrgId).eq('reference', oldRet.return_number);
          }
        }

        const { error: updateError } = await supabase.from('sales_returns').update({
          customer_id: formData.customerId,
          warehouse_id: formData.warehouseId,
          original_invoice_id: originalInvoiceId,
          return_number: returnNumber,
          return_date: formData.date,
          total_amount: totalAmount,
          tax_amount: taxAmount,
          notes: formData.notes,
          status: 'draft',
          related_journal_entry_id: null
        }).eq('id', editingId);

        if (updateError) throw updateError;

        await supabase.from('sales_return_items').delete().eq('sales_return_id', editingId);

        const itemsToInsert = items.map(item => ({
          organization_id: targetOrgId,
          sales_return_id: editingId,
          product_id: item.productId || item.product_id,
          quantity: Number(item.quantity),
          uom_id: item.uomId || null,
          unit_price: Number(item.unitPrice ?? item.unit_price ?? 0),
          total: Number(item.quantity) * Number(item.unitPrice ?? item.unit_price ?? 0)
        }));

        const { error: itemsError } = await supabase.from('sales_return_items').insert(itemsToInsert);
        if (itemsError) throw itemsError;

      } else {
        const { data: returnDoc, error: retError } = await supabase.from('sales_returns').insert({
          organization_id: targetOrgId,
          customer_id: formData.customerId,
          warehouse_id: formData.warehouseId,
          original_invoice_id: originalInvoiceId,
          return_number: returnNumber,
          return_date: formData.date,
          total_amount: totalAmount,
          tax_amount: taxAmount,
          notes: formData.notes,
          status: 'draft',
          user_id: currentUser?.id
        }).select().single();

        if (retError) throw retError;
        if (!returnDoc) throw new Error("فشل حفظ مستند المرتجع.");

        returnIdToApprove = returnDoc.id;

        const itemsToInsert = items.map(item => ({
          organization_id: targetOrgId,
          sales_return_id: returnDoc.id,
          product_id: item.productId || item.product_id,
          quantity: Number(item.quantity),
          uom_id: item.uomId || null,
          unit_price: Number(item.unitPrice ?? item.unit_price ?? 0),
          total: Number(item.quantity) * Number(item.unitPrice ?? item.unit_price ?? 0)
        }));

        const { error: itemsError } = await supabase.from('sales_return_items').insert(itemsToInsert);
        if (itemsError) throw itemsError;
      }

      if (returnIdToApprove) {
        const { error: rpcError } = await supabase.rpc('approve_sales_return', { p_return_id: returnIdToApprove });
        if (rpcError) throw rpcError;
      }

      showToast(editingId ? 'تم تحديث واعتماد مرتجع المبيعات وتحديث الحسابات بنجاح ✅' : 'تم حفظ واعتماد مرتجع المبيعات وتحديث المخزون بنجاح ✅', 'success');
      
      await fetchReturnIds();
      if (returnIdToApprove) {
        loadReturnById(returnIdToApprove);
      }

    } catch (error: any) {
      console.error('Error saving return:', error);
      showToast(error?.message || 'فشل حفظ المرتجع', 'error');
    } finally {
      setSaving(false);
    }
  };

  // حذف المرتجع الحالي
  const handleDeleteCurrent = async () => {
    if (!editingId) return;

    if (!window.confirm(`هل أنت متأكد من حذف هذا المرتجع رقم (${formData.returnNumber})؟\nسيتم إلغاء أثره على المخزون والقيد المحاسبي بالكامل.`)) {
      return;
    }

    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id;

      const { data: ret } = await supabase.from('sales_returns').select('*, sales_return_items(*)').eq('id', editingId).single();
      if (ret && ret.status === 'posted') {
        for (const item of (ret.sales_return_items || [])) {
          if (item.product_id && item.quantity) {
            const { data: prod } = await supabase.from('products').select('stock, warehouse_stock').eq('id', item.product_id).single();
            if (prod) {
              const newStock = Math.max(0, (Number(prod.stock) || 0) - Number(item.quantity));
              let newWStock = prod.warehouse_stock || {};
              if (ret.warehouse_id && newWStock[ret.warehouse_id] !== undefined) {
                newWStock[ret.warehouse_id] = Math.max(0, (Number(newWStock[ret.warehouse_id]) || 0) - Number(item.quantity));
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

      await supabase.from('sales_return_items').delete().eq('sales_return_id', editingId);
      const { error: delErr } = await supabase.from('sales_returns').delete().eq('id', editingId);
      if (delErr) throw delErr;

      showToast('تم حذف مرتجع المبيعات وعكس الحركات بنجاح ✅', 'success');

      const newIds = returnIds.filter(id => id !== editingId);
      setReturnIds(newIds);

      if (newIds.length > 0) {
        const nextId = newIds[Math.min(currentIndex, newIds.length - 1)];
        loadReturnById(nextId);
      } else {
        handleNewReturn();
      }

    } catch (err: any) {
      console.error('Error deleting return:', err);
      showToast('فشل حذف المرتجع: ' + err.message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  // طباعة المرتجع الحالي
  const handlePrintCurrent = () => {
    const returnData = {
      returnNumber: formData.returnNumber,
      date: formData.date,
      customerName: customers.find(c => c.id === formData.customerId)?.name || 'عميل نقدي',
      warehouseName: warehouses.find(w => w.id === formData.warehouseId)?.name || '-',
      originalInvoiceNumber: searchInvoiceNumber,
      notes: formData.notes,
      totalAmount: calculateTotal() * (1 + (settings.enableTax ? ((settings.vatRate || 14) / 100) : 0)),
      taxAmount: calculateTotal() * (settings.enableTax ? ((settings.vatRate || 14) / 100) : 0),
      items: items.map(item => ({
        name: item.name || products.find(p => p.id === (item.productId || item.product_id))?.name || 'صنف',
        uomName: uoms.find(u => u.id === item.uomId)?.name || '-',
        quantity: item.quantity,
        unitPrice: item.unitPrice ?? item.unit_price ?? 0,
        total: (item.quantity || 0) * (item.unitPrice ?? item.unit_price ?? 0)
      }))
    };

    setReturnToPrint(returnData);
    setTimeout(() => {
      window.print();
      setReturnToPrint(null);
    }, 200);
  };

  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase())).slice(0, 5);

  const subtotal = calculateTotal();
  const taxRate = settings.enableTax ? ((settings.vatRate || 14) / 100) : 0;
  const taxAmount = subtotal * taxRate;
  const totalAmount = subtotal + taxAmount;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      
      {/* تنبيه للعملاء الجدد في حال عدم وجود مستودعات */}
      {warehouses.length === 0 && (
        <div className="bg-red-50 border-2 border-red-100 p-5 rounded-2xl mb-2 flex flex-col md:flex-row items-center justify-between gap-4 animate-in zoom-in shadow-sm">
          <div className="flex items-center gap-4">
            <div className="bg-red-100 p-2 rounded-xl">
              <AlertCircle className="text-red-600" size={24} />
            </div>
            <div>
              <h4 className="font-bold text-red-900">نظام المخازن غير مهيأ</h4>
              <p className="text-sm text-red-700">لا يمكنك معالجة المرتجعات بدون وجود مستودع مسجل لاستلام البضاعة.</p>
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
        
        {/* Title and Status */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-red-50 text-red-600 rounded-xl">
            <RotateCcw size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
              {editingId ? `مرتجع مبيعات: ${formData.returnNumber}` : 'مرتجع مبيعات جديد'}
              {editingId && (
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                  formData.status === 'posted' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {formData.status === 'posted' ? 'مرحل ✅' : 'مسودة 📝'}
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-400 font-bold">إرجاع بضاعة من عميل وتحديث المخزون وحساب العميل</p>
          </div>
        </div>

        {/* 🧭 أسهم التنقل بين المرتجعات */}
        <div className="flex items-center gap-1 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
          <button 
            type="button" 
            onClick={() => handleNavigate('first')} 
            disabled={returnIds.length === 0 || currentIndex === 0} 
            title="أول مرتجع"
            className="p-2 text-slate-600 hover:bg-white hover:text-red-600 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronsRight size={18} />
          </button>
          
          <button 
            type="button" 
            onClick={() => handleNavigate('prev')} 
            disabled={returnIds.length === 0 || currentIndex <= 0} 
            title="المرتجع السابق"
            className="p-2 text-slate-600 hover:bg-white hover:text-red-600 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronRight size={18} />
          </button>

          {/* Record Counter */}
          <div className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-mono font-black text-slate-700 select-none">
            {loadingReturn ? (
              <Loader2 size={14} className="animate-spin text-red-600" />
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
            className="p-2 text-slate-600 hover:bg-white hover:text-red-600 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronLeft size={18} />
          </button>

          <button 
            type="button" 
            onClick={() => handleNavigate('last')} 
            disabled={returnIds.length === 0 || currentIndex >= returnIds.length - 1 || currentIndex === -1} 
            title="آخر مرتجع"
            className="p-2 text-slate-600 hover:bg-white hover:text-red-600 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronsLeft size={18} />
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button 
            type="button" 
            onClick={() => navigate('/sales-returns-list')} 
            className="bg-slate-100 text-slate-700 hover:bg-slate-200 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
            title="عرض سجل المرتجعات"
          >
            <List size={16} /> سجل المرتجعات
          </button>

          <button 
            type="button" 
            onClick={handleNewReturn} 
            className="bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
            title="بدء مرتجع مبيعات جديد"
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
            className="bg-red-600 text-white px-5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 hover:bg-red-700 transition-colors shadow-sm disabled:opacity-50"
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} 
            {editingId ? 'حفظ التعديلات' : 'حفظ وترحيل'}
          </button>
        </div>
      </div>

      {/* Main Form Box */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
          
          <div className="md:col-span-2 flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <input 
                type="checkbox" 
                className="w-4 h-4 rounded text-red-600 focus:ring-0 focus:ring-offset-0 cursor-pointer" 
                id="partialQuantities" 
                checked={returnPartialQuantities} 
                onChange={(e) => setReturnPartialQuantities(e.target.checked)} 
              />
              <label htmlFor="partialQuantities" className="text-sm font-bold text-slate-700 cursor-pointer select-none">
                تحديد الكميات المرتجعة يدوياً (إرجاع جزئي)
              </label>
            </div>
            {editingId && (
              <span className="text-xs font-mono font-bold text-slate-400">
                معرف المرتجع: {editingId.slice(0, 8)}...
              </span>
            )}
          </div>

        {/* Import from Invoice */}
        <div className="md:col-span-2 flex items-end gap-2 mb-2 pb-4 border-b border-slate-100">
            <div className="flex-1">
                <label className="block text-xs font-bold mb-1 text-slate-600">جلب من فاتورة مبيعات سابقة (اختياري)</label>
                <div className="relative">
                    <input 
                      type="text" 
                      className="w-full border rounded-xl p-2.5 pl-10 bg-slate-50 focus:bg-white text-sm outline-none focus:border-red-500 transition-colors font-mono" 
                      placeholder="أدخل رقم الفاتورة (مثال: INV-026312)" 
                      value={searchInvoiceNumber} 
                      onChange={(e) => setSearchInvoiceNumber(e.target.value)} 
                      onKeyDown={(e) => e.key === 'Enter' && handleFetchInvoice()} 
                    />
                    <Search className="absolute left-3 top-3 text-slate-400" size={18} />
                </div>
            </div>
            <button 
              type="button" 
              onClick={handleFetchInvoice} 
              disabled={isSearching} 
              className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 h-[42px] text-sm transition-colors shadow-sm"
            >
                {isSearching ? <Loader2 className="animate-spin" size={16} /> : 'جلب الأصناف'}
            </button>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">العميل <span className="text-red-500">*</span></label>
          <select 
            className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm font-bold outline-none focus:border-red-500" 
            value={formData.customerId} 
            onChange={e => setFormData({...formData, customerId: e.target.value})}
          >
            <option value="">اختر العميل...</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">المستودع (لاستلام البضاعة المرتجعة) <span className="text-red-500">*</span></label>
          <select 
            className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm font-bold outline-none focus:border-red-500" 
            value={formData.warehouseId} 
            onChange={e => setFormData({...formData, warehouseId: e.target.value})}
          >
            <option value="">-- اختر المستودع --</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ المرتجع <span className="text-red-500">*</span></label>
          <input 
            type="date" 
            className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm font-bold outline-none focus:border-red-500" 
            value={formData.date} 
            onChange={e => setFormData({...formData, date: e.target.value})} 
          />
        </div>

        <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">رقم المرتجع (اختياري)</label>
            <input 
              type="text" 
              className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm font-mono font-bold outline-none focus:border-red-500" 
              value={formData.returnNumber} 
              onChange={e => setFormData({...formData, returnNumber: e.target.value})} 
              placeholder="تلقائي (مثال: SR-123456)" 
            />
        </div>

        <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات / سبب الإرجاع</label>
            <input 
              type="text" 
              className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm outline-none focus:border-red-500" 
              value={formData.notes} 
              onChange={e => setFormData({...formData, notes: e.target.value})} 
              placeholder="سبب إرجاع البضاعة..." 
            />
        </div>
      </div>

      {/* Items Section */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        
        {/* Product Search */}
        <div className="relative mb-4">
          <label className="block text-xs font-bold text-slate-600 mb-1">إضافة صنف مباشرة للمرتجع</label>
          <div className="relative">
            <input 
              type="text" 
              placeholder="ابحث باسم الصنف أو الباركود لإضافته..." 
              className="w-full border rounded-xl p-2.5 pl-10 bg-slate-50 focus:bg-white text-sm outline-none focus:border-red-500" 
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
                  className="p-3 hover:bg-red-50 cursor-pointer border-b last:border-0 flex justify-between items-center transition-colors"
                >
                  <span className="font-bold text-slate-800 text-sm">{p.name}</span>
                  <span className="text-slate-400 font-mono text-xs">{p.sku}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Table of Items */}
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-50 text-xs font-bold text-slate-600 border-b border-slate-200">
              <tr>
                <th className="p-3">الصنف</th>
                <th className="p-3 w-36 text-center">الوحدة</th>
                <th className="p-3 w-32 text-center">الكمية المرتجعة</th>
                <th className="p-3 w-32 text-center">سعر الوحدة</th>
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
                          const prod = products.find(p => p.id === (item.productId || item.product_id));
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
                      className="w-full border rounded-lg p-1.5 text-center font-mono font-bold text-red-600 bg-white" 
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
                      value={item.unitPrice ?? item.unit_price ?? 0} 
                      onChange={e => updateItem(idx, 'unitPrice', Number(e.target.value))} 
                    />
                  </td>
                  <td className="p-3 text-center font-mono font-black text-slate-900" dir="ltr">
                    {((Number(item.quantity) || 0) * (Number(item.unitPrice ?? item.unit_price) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                    لم تتم إضافة أي أصناف للمرتجع بعد. قم بجلب فاتورة سابقة أو ابحث عن صنف لإضافته.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Totals Section */}
        <div className="border-t border-slate-200 mt-6 pt-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
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
            <div className="flex justify-between text-sm font-black text-red-700 border-t border-slate-200 pt-2">
              <span>إجمالي المرتجع النهائي:</span>
              <span className="font-mono text-lg" dir="ltr">{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {settings.currency || 'ج.م'}</span>
            </div>
          </div>
        </div>

      </div>

      {/* Printable Preview when clicking print */}
      {returnToPrint && (
        <SalesReturnPrint returnData={returnToPrint} companySettings={companySettings} />
      )}
    </div>
  );
};

export default SalesReturnForm;
