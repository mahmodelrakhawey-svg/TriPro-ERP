import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { 
  ArrowRightLeft, Save, Plus, Trash2, Package, Loader2, 
  Barcode, AlertTriangle, CheckCircle2, Warehouse, FileText, 
  List, Minus, Sparkles, AlertCircle 
} from 'lucide-react';
import { createStockTransferSchema } from '../../utils/validationSchemas';
import ProductSearchSelect, { getProductWarehouseStock } from '../../components/ProductSearchSelect';

interface TransferItem {
  productId: string;
  productName: string;
  sku?: string;
  unit?: string;
  quantity: number;
}

const StockTransfer = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { warehouses, products, recalculateStock, currentUser } = useAccounting();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    fromWarehouseId: '',
    toWarehouseId: '',
    notes: ''
  });

  const [items, setItems] = useState<TransferItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [qty, setQty] = useState<number>(1);
  const [filterAvailableOnly, setFilterAvailableOnly] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // إذا تم التوجيه إلى الصفحة مع صنف محدد مسبقاً
  useEffect(() => {
    if (location.state?.productId) {
      setSelectedProductId(location.state.productId);
    }
  }, [location.state]);

  // الصنف المختار حالياً من القائمة
  const selectedProductObj = useMemo(() => {
    return products.find(p => p.id === selectedProductId);
  }, [products, selectedProductId]);

  // الرصيد المتوفر للصنف المختار بالمستودع المصدر
  const selectedProductSourceStock = useMemo(() => {
    if (!selectedProductObj || !formData.fromWarehouseId) return null;
    return getProductWarehouseStock(selectedProductObj, formData.fromWarehouseId);
  }, [selectedProductObj, formData.fromWarehouseId]);

  // المستودع المصدر والمستلم
  const fromWarehouse = useMemo(() => {
    return warehouses.find(w => w.id === formData.fromWarehouseId);
  }, [warehouses, formData.fromWarehouseId]);

  const toWarehouse = useMemo(() => {
    return warehouses.find(w => w.id === formData.toWarehouseId);
  }, [warehouses, formData.toWarehouseId]);

  // مسح الباركود السريع
  const handleBarcodeScan = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();

    const scanned = barcodeInput.trim();
    if (!scanned) return;

    if (!formData.fromWarehouseId) {
      showToast('الرجاء اختيار مستودع المصدر أولاً لمعرفة الأرصدة المتوفرة', 'warning');
      return;
    }

    // البحث عن الصنف بالباركود أو الكود
    const matched = products.find(p => {
      if (p.barcode && p.barcode.trim().toLowerCase() === scanned.toLowerCase()) return true;
      if (p.barcode2 && p.barcode2.trim().toLowerCase() === scanned.toLowerCase()) return true;
      if (p.sku && p.sku.trim().toLowerCase() === scanned.toLowerCase()) return true;
      if (p.unit_barcodes && Array.isArray(p.unit_barcodes)) {
        return p.unit_barcodes.some(ub => ub.barcode && ub.barcode.trim().toLowerCase() === scanned.toLowerCase());
      }
      return false;
    });

    if (!matched) {
      showToast(`لم يتم العثور على أي صنف بالباركود: ${scanned}`, 'error');
      setBarcodeInput('');
      return;
    }

    const availableStock = getProductWarehouseStock(matched, formData.fromWarehouseId);

    // إذا كان الصنف موجوداً في الجدول، زد الكمية
    const existingIndex = items.findIndex(i => i.productId === matched.id);
    if (existingIndex >= 0) {
      const nextQty = items[existingIndex].quantity + 1;
      const updated = [...items];
      updated[existingIndex] = { ...updated[existingIndex], quantity: nextQty };
      setItems(updated);
      showToast(`تمت زيادة كمية: ${matched.name} إلى (${nextQty})`, 'info');
    } else {
      setItems(prev => [...prev, {
        productId: matched.id,
        productName: matched.name,
        sku: matched.sku || '',
        unit: matched.unit || '',
        quantity: 1
      }]);
      showToast(`تمت إضافة: ${matched.name}`, 'success');
    }

    if (availableStock <= 0) {
      showToast(`تنبيه: رصيد الصنف بالمستودع المصدر حالياً (0)`, 'warning');
    }

    setBarcodeInput('');
    barcodeInputRef.current?.focus();
  };

  // إضافة صنف يدوياً
  const handleAddItem = () => {
    if (!formData.fromWarehouseId) {
      showToast('الرجاء اختيار مستودع المصدر أولاً', 'warning');
      return;
    }

    if (!selectedProductId) {
      showToast('الرجاء اختيار الصنف المراد تحويله', 'warning');
      return;
    }

    const product = products.find(p => p.id === selectedProductId);
    if (!product) return;

    if (items.some(i => i.productId === selectedProductId)) {
      showToast('الصنف موجود بالفعل في القائمة، يمكنك تعديل كميته مباشرة في الجدول', 'warning');
      return;
    }

    const numQty = Number(qty);
    if (isNaN(numQty) || numQty <= 0) {
      showToast('الكمية يجب أن تكون أكبر من صفر', 'warning');
      return;
    }

    // التحقق من الرصيد في المستودع المصدر
    const stockInSource = getProductWarehouseStock(product, formData.fromWarehouseId);
    if (numQty > stockInSource) {
      if (!window.confirm(`تنبيه: الكمية المطلوبة (${numQty}) أكبر من الرصيد المتوفر في مستودع المصدر (${stockInSource}). هل تريد المتابعة على أية حال؟`)) {
        return;
      }
    }

    setItems(prev => [...prev, {
      productId: product.id,
      productName: product.name,
      sku: product.sku || '',
      unit: product.unit || '',
      quantity: numQty
    }]);

    setSelectedProductId('');
    setQty(1);
  };

  // تعديل الكمية مباشرة داخل الجدول
  const handleUpdateQuantity = (index: number, newQty: number) => {
    if (isNaN(newQty) || newQty < 0) return;
    setItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], quantity: newQty };
      return updated;
    });
  };

  // زيادة / نقصان خطوة
  const handleStepQuantity = (index: number, delta: number) => {
    setItems(prev => {
      const updated = [...prev];
      const current = updated[index].quantity;
      const next = Math.max(0.1, Math.round((current + delta) * 100) / 100);
      updated[index] = { ...updated[index], quantity: next };
      return updated;
    });
  };

  // حذف بند
  const handleRemoveItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  // إحصائيات بنود التحويل
  const totalQuantity = useMemo(() => {
    return items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  }, [items]);

  const overStockCount = useMemo(() => {
    if (!formData.fromWarehouseId) return 0;
    return items.filter(item => {
      const p = products.find(prod => prod.id === item.productId);
      const stock = getProductWarehouseStock(p, formData.fromWarehouseId);
      return item.quantity > stock;
    }).length;
  }, [items, products, formData.fromWarehouseId]);

  // إتمام التحويل
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.fromWarehouseId === formData.toWarehouseId) {
      showToast('لا يمكن التحويل من وإلى نفس المستودع', 'error');
      return;
    }

    if (items.length === 0) {
      showToast('يجب إضافة صنف واحد على الأقل للتحويل', 'warning');
      return;
    }

    const userOrgId = (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;

    // تجهيز البنود بالشكل الذي يتطابق مع المخطط
    const cleanItems = items.map(item => ({
      productId: item.productId,
      quantity: Number(item.quantity)
    }));

    const validationResult = createStockTransferSchema.safeParse({ ...formData, items: cleanItems });
    if (!validationResult.success) {
      showToast(validationResult.error.issues[0].message, 'warning');
      return;
    }

    // إذا كانت هناك كميات متجاوزة للرصيد، تأكيد إضافي
    if (overStockCount > 0) {
      if (!window.confirm(`يوجد (${overStockCount}) صنف تتجاوز كميتها الرصيد المتاح بالمستودع المصدر. هل أنت متأكد من إتمام التحويل وترحيل الأرصدة بالسالب إن وُجد؟`)) {
        return;
      }
    }

    setLoading(true);
    try {
      const transferNumber = `TRN-${Date.now().toString().slice(-6)}`;

      // 1. إنشاء رأس التحويل في جدول stock_transfers
      const { data: header, error: headerError } = await supabase.from('stock_transfers').insert({
        transfer_number: transferNumber,
        transfer_date: formData.date,
        from_warehouse_id: formData.fromWarehouseId,
        to_warehouse_id: formData.toWarehouseId,
        notes: formData.notes,
        organization_id: userOrgId,
        status: 'posted'
      }).select().single();

      if (headerError) throw headerError;

      // 2. إنشاء بنود التحويل في جدول stock_transfer_items
      const dbItems = items.map(item => ({
        stock_transfer_id: header.id,
        product_id: item.productId,
        quantity: item.quantity,
        organization_id: userOrgId
      }));

      const { error: itemsError } = await supabase.from('stock_transfer_items').insert(dbItems);
      if (itemsError) throw itemsError;

      // 3. إعادة احتساب الأرصدة وتحديث كروت الصنف
      await recalculateStock();

      setFormData(prev => ({ ...prev, notes: '' }));
      setItems([]);
      showToast(`تم تنفيذ التحويل المخزني رقم (${transferNumber}) بنجاح وترحيل الأرصدة ✅`, 'success');
    } catch (error: any) {
      console.error(error);
      showToast(error.message || 'حدث خطأ أثناء معالجة التحويل المخزني', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-600 text-white rounded-xl shadow-md">
            <ArrowRightLeft size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800">تحويل مخزني فوري</h2>
            <p className="text-xs text-slate-500">نقل الخامات والمنتجات التامة بين المستودعات والمصنع والفروع بسرعة ودقة</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate('/stock-transfer-list')}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
        >
          <List size={16} /> سجل التحويلات السابقة
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* بيانات المستودعات والتاريخ */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-5">
          <h3 className="text-sm font-black text-slate-800 flex items-center gap-2 border-b pb-3">
            <Warehouse size={18} className="text-blue-600" /> مسار التحويل والمستودعات
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">تاريخ التحويل *</label>
              <input 
                type="date" 
                required 
                className="w-full border border-slate-200 focus:border-blue-500 rounded-xl p-2.5 text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none transition-all font-bold" 
                value={formData.date} 
                onChange={e => setFormData({...formData, date: e.target.value})} 
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                <span>من مستودع (المصدر) *</span>
                {fromWarehouse && (
                  <span className="text-[10px] text-blue-600 font-black">المصدر المختار</span>
                )}
              </label>
              <select 
                required 
                className="w-full border border-slate-200 focus:border-blue-500 rounded-xl p-2.5 text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none transition-all font-bold" 
                value={formData.fromWarehouseId} 
                onChange={e => {
                  setFormData({...formData, fromWarehouseId: e.target.value});
                }}
              >
                <option value="">-- اختر مستودع الصرف --</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                <span>إلى مستودع (المستلم) *</span>
                {toWarehouse && (
                  <span className="text-[10px] text-emerald-600 font-black">الوجهة المختارة</span>
                )}
              </label>
              <select 
                required 
                className="w-full border border-slate-200 focus:border-blue-500 rounded-xl p-2.5 text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none transition-all font-bold" 
                value={formData.toWarehouseId} 
                onChange={e => setFormData({...formData, toWarehouseId: e.target.value})}
              >
                <option value="">-- اختر مستودع الاستلام --</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* تنبيه إذا اختار المستخدم نفس المستودع */}
          {formData.fromWarehouseId && formData.toWarehouseId && formData.fromWarehouseId === formData.toWarehouseId && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-700 text-xs font-bold animate-in fade-in">
              <AlertCircle size={16} /> لا يمكن التحويل من وإلى نفس المستودع. الرجاء اختيار مستودع استلام مختلف.
            </div>
          )}
        </div>

        {/* بطاقة إضافة الأصناف (البحث الذكي + مسدس الباركود) */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-5">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b pb-3">
            <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
              <Package size={18} className="text-blue-600" /> اختيار الأصناف والكميات
            </h3>

            {/* فلتر عرض الأصناف المتوفرة فقط */}
            {formData.fromWarehouseId && (
              <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                <input 
                  type="checkbox" 
                  checked={filterAvailableOnly} 
                  onChange={e => setFilterAvailableOnly(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>عرض الأصناف المتوفرة فقط في مستودع المصدر</span>
              </label>
            )}
          </div>

          {/* المسار السريع: إما بمسدس الباركود أو بالبحث الفوري */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end bg-slate-50/70 p-4 rounded-2xl border border-slate-100">
            {/* حقل مسدس الباركود السريع */}
            <div className="lg:col-span-4">
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                <Barcode size={15} className="text-blue-600" /> مسح سريع بمسدس الباركود (Laser)
              </label>
              <input
                ref={barcodeInputRef}
                type="text"
                value={barcodeInput}
                onChange={e => setBarcodeInput(e.target.value)}
                onKeyDown={handleBarcodeScan}
                disabled={!formData.fromWarehouseId}
                placeholder={formData.fromWarehouseId ? "امسح الباركود ثم اضغط Enter..." : "اختر مستودع المصدر أولاً..."}
                className="w-full border border-slate-200 focus:border-blue-500 rounded-xl py-2.5 px-3 text-sm bg-white font-mono focus:ring-2 focus:ring-blue-100 outline-none transition-all disabled:bg-slate-100 disabled:cursor-not-allowed placeholder:font-sans placeholder:text-xs"
              />
            </div>

            {/* حقل البحث الذكي بالأصناف */}
            <div className="lg:col-span-5">
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                <span>البحث الذكي بالاسم / الكود / الباركود</span>
                {selectedProductSourceStock !== null && (
                  <span className={`text-[11px] font-black ${selectedProductSourceStock > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    المتوفر بالمصدر: {selectedProductSourceStock} {selectedProductObj?.unit || ''}
                  </span>
                )}
              </label>
              <ProductSearchSelect
                products={products}
                value={selectedProductId}
                onChange={(pId) => setSelectedProductId(pId)}
                warehouseId={formData.fromWarehouseId}
                filterAvailableOnly={filterAvailableOnly}
                disabled={!formData.fromWarehouseId}
                placeholder={formData.fromWarehouseId ? "اكتب اسم الصنف أو كوده..." : "اختر مستودع المصدر أولاً لتفعيل القائمة..."}
              />
            </div>

            {/* حقل الكمية */}
            <div className="lg:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                الكمية {selectedProductObj?.unit ? `(${selectedProductObj.unit})` : ''}
              </label>
              <input 
                type="number" 
                min="0.01"
                step="any"
                disabled={!formData.fromWarehouseId}
                value={qty}
                onChange={e => setQty(parseFloat(e.target.value) || 0)}
                className="w-full border border-slate-200 focus:border-blue-500 rounded-xl py-2.5 px-2 text-center text-sm font-black bg-white focus:ring-2 focus:ring-blue-100 outline-none transition-all disabled:bg-slate-100"
              />
            </div>

            {/* زر الإضافة */}
            <div className="lg:col-span-1">
              <button 
                type="button" 
                onClick={handleAddItem}
                disabled={!formData.fromWarehouseId || !selectedProductId}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white p-2.5 rounded-xl font-bold flex items-center justify-center transition-all shadow-sm h-[42px]"
                title="إضافة للتحويل"
              >
                <Plus size={20} />
              </button>
            </div>
          </div>

          {/* جدول بنود التحويل */}
          {items.length === 0 ? (
            <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
              <Package size={40} className="mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-bold text-slate-600">لم يتم إضافة أي أصناف للتحويل حتى الآن</p>
              <p className="text-xs text-slate-400 mt-1">اختر المستودع المصدر ثم استخدم البحث السريع أو مسدس الباركود لإضافة الأصناف</p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-black border-b">
                    <tr>
                      <th className="p-3 w-12 text-center">#</th>
                      <th className="p-3">الصنف والكود</th>
                      <th className="p-3 w-24 text-center">الوحدة</th>
                      <th className="p-3 w-32 text-center">رصيد المصدر</th>
                      <th className="p-3 w-48 text-center">الكمية المحولة</th>
                      <th className="p-3 w-28 text-center">حالة الرصيد</th>
                      <th className="p-3 w-14 text-center">حذف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((item, idx) => {
                      const prod = products.find(p => p.id === item.productId);
                      const sourceStock = getProductWarehouseStock(prod, formData.fromWarehouseId);
                      const isOverStock = item.quantity > sourceStock;

                      return (
                        <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3 text-center font-bold text-slate-400">
                            {idx + 1}
                          </td>

                          <td className="p-3">
                            <div className="font-bold text-slate-800 text-sm">{item.productName}</div>
                            {item.sku && (
                              <div className="font-mono text-[10px] text-slate-400 mt-0.5">
                                كود: {item.sku}
                              </div>
                            )}
                          </td>

                          <td className="p-3 text-center font-medium text-slate-600">
                            {item.unit || '-'}
                          </td>

                          <td className="p-3 text-center">
                            <span className={`inline-block px-2 py-1 rounded-lg text-xs font-bold ${
                              sourceStock > 0 
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                                : 'bg-rose-50 text-rose-700 border border-rose-100'
                            }`}>
                              {sourceStock} {item.unit || ''}
                            </span>
                          </td>

                          <td className="p-3 text-center">
                            <div className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
                              <button
                                type="button"
                                onClick={() => handleStepQuantity(idx, -1)}
                                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
                              >
                                <Minus size={13} />
                              </button>

                              <input
                                type="number"
                                min="0.01"
                                step="any"
                                value={item.quantity}
                                onChange={e => handleUpdateQuantity(idx, parseFloat(e.target.value) || 0)}
                                className="w-20 text-center text-sm font-black text-slate-800 focus:outline-none"
                              />

                              <button
                                type="button"
                                onClick={() => handleStepQuantity(idx, 1)}
                                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
                              >
                                <Plus size={13} />
                              </button>
                            </div>
                          </td>

                          <td className="p-3 text-center">
                            {isOverStock ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded-lg border border-rose-200">
                                <AlertTriangle size={12} /> عجز: {(item.quantity - sourceStock).toFixed(2)}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                                <CheckCircle2 size={12} /> رصيد كافٍ
                              </span>
                            )}
                          </td>

                          <td className="p-3 text-center">
                            <button 
                              type="button" 
                              onClick={() => handleRemoveItem(idx)} 
                              className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-2 rounded-xl transition-all"
                              title="حذف البند"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* شريط إحصائيات الجدول */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs">
                <div className="flex items-center gap-6">
                  <div>
                    <span className="text-slate-500">عدد الأصناف: </span>
                    <span className="font-black text-slate-800 text-sm">{items.length} صنف</span>
                  </div>
                  <div>
                    <span className="text-slate-500">إجمالي الكميات: </span>
                    <span className="font-black text-blue-700 text-sm">{totalQuantity.toFixed(2)}</span>
                  </div>
                </div>

                {overStockCount > 0 && (
                  <div className="flex items-center gap-1.5 text-amber-700 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200 font-bold text-[11px]">
                    <AlertTriangle size={14} /> يوجد ({overStockCount}) صنف كميتها تتجاوز الرصيد الحالي بالمستودع المصدر
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* حقل الملاحظات وزر الترحيل */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <FileText size={15} className="text-slate-500" /> البيان وملاحظات التحويل (اختياري)
            </label>
            <textarea
              rows={2}
              value={formData.notes}
              onChange={e => setFormData({...formData, notes: e.target.value})}
              placeholder="اكتب أي ملاحظات أو أسباب تخص هذا التحويل..."
              className="w-full border border-slate-200 focus:border-blue-500 rounded-xl p-3 text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none transition-all resize-none"
            />
          </div>

          <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="text-xs text-slate-400">
              * سيتم ترحيل الكميات وتحديث أرصدة المستودعين تلقائياً فور الحفظ
            </div>

            <button 
              type="submit" 
              disabled={loading || items.length === 0 || formData.fromWarehouseId === formData.toWarehouseId} 
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-8 py-3.5 rounded-xl font-black shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 flex items-center justify-center gap-2 transition-all"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  <span>جاري ترحيل التحويل...</span>
                </>
              ) : (
                <>
                  <Save size={18} />
                  <span>إتمام وترحيل التحويل المخزني</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default StockTransfer;
