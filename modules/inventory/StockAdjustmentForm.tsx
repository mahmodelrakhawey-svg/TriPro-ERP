﻿﻿﻿﻿﻿import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { Save, Plus, Trash2, AlertTriangle, Search, Loader2, Package, Upload, Download, Barcode } from 'lucide-react';
import * as XLSX from 'xlsx';
import { z } from 'zod';

interface AdjustmentItem {
  productId: string;
  productName: string;
  quantity: number;
  type: 'in' | 'out';
}

const StockAdjustmentForm = () => {
  const location = useLocation();
  const { warehouses, products, recalculateStock, addEntry, accounts, getSystemAccount, currentUser } = useAccounting();
  const { showToast } = useToast();
  const [warehouseId, setWarehouseId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState('');
  const [items, setItems] = useState<AdjustmentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    if (location.state?.productId && products.length > 0) {
        const product = products.find(p => p.id === location.state.productId);
        if (product) {
            setItems(prev => {
                if (prev.find(i => i.productId === product.id)) return prev;
                return [...prev, {
                    productId: product.id,
                    productName: product.name,
                    quantity: 0,
                    type: 'in'
                }];
            });
        }
    }
  }, [location.state, products]);

  const handleAddItem = () => {
    if (!selectedProductId) return;
    const product = products.find(p => p.id === selectedProductId);
    if (!product) return;

    if (items.find(i => i.productId === selectedProductId)) {
        showToast('الصنف موجود بالفعل في القائمة', 'warning');
        return;
    }

    setItems([...items, {
        productId: product.id,
        productName: product.name,
        quantity: 0,
        type: 'in' // in (increase) or out (decrease)
    }]);
    setSelectedProductId('');
  };

  const handleRemoveItem = (index: number) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);
  };

  const handleQuantityChange = (index: number, qty: number) => {
    const newItems = [...items];
    newItems[index].quantity = qty;
    setItems(newItems);
  };

  const handleTypeChange = (index: number, type: string) => {
    const newItems = [...items];
    newItems[index].type = type as 'in' | 'out';
    setItems(newItems);
  };

  const handleDownloadTemplate = () => {
    const headers = [
      { 'كود الصنف (SKU)': '', 'اسم الصنف': '', 'الكمية': '', 'النوع (زيادة/عجز)': 'زيادة' }
    ];
    const ws = XLSX.utils.json_to_sheet(headers);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "نموذج التسوية");
    XLSX.writeFile(wb, "Stock_Adjustment_Template.xlsx");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setIsImporting(true);
    
    const reader = new FileReader();
    reader.onload = async (evt) => {
        try {
            const bstr = evt.target?.result;
            const wb = XLSX.read(bstr, { type: 'binary' });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            const data = XLSX.utils.sheet_to_json(ws);
            
            const newItems: any[] = [];
            let foundCount = 0;
            
            for (const row of data as any[]) {
                const sku = row['كود الصنف (SKU)'] || row['SKU'];
                const name = row['اسم الصنف'] || row['Name'];
                const qty = row['الكمية'] || row['Quantity'];
                const typeRaw = row['النوع (زيادة/عجز)'] || row['Type'];
                
                let product;
                if (sku) product = products.find(p => p.sku === String(sku).trim());
                if (!product && name) product = products.find(p => p.name.toLowerCase() === String(name).trim().toLowerCase());
                
                if (product && qty) {
                    // التحقق من عدم تكرار الصنف في القائمة الحالية
                    if (!items.some(i => i.productId === product.id) && !newItems.some(i => i.productId === product.id)) {
                        newItems.push({
                            productId: product.id,
                            productName: product.name,
                            quantity: Math.abs(Number(qty)),
                            type: (typeRaw && String(typeRaw).includes('عجز')) ? 'out' : 'in'
                        });
                        foundCount++;
                    }
                }
            }
            
            setItems(prev => [...prev, ...newItems]);
            showToast(`تم إضافة ${foundCount} صنف للقائمة.`, 'success');
        } catch (error) {
            console.error(error);
            showToast('حدث خطأ في قراءة الملف', 'error');
        } finally {
            setIsImporting(false);
            e.target.value = '';
        }
    };
    reader.readAsBinaryString(file);
  };

  const handlePrintBarcodes = () => {
    if (items.length === 0) {
      showToast('لا توجد أصناف في القائمة لطباعة الباركود', 'warning');
      return;
    }

    const printByQuantity = window.confirm(
        'هل تريد طباعة عدد نسخ باركود مساوي للكمية المدخلة؟\n\n' +
        '✅ موافق: طباعة عدد نسخ = الكمية\n' +
        '❌ إلغاء: طباعة نسخة واحدة لكل صنف'
    );

    const printWindow = window.open('', '', 'width=800,height=600');
    if (printWindow) {
      const itemsWithDetails: any[] = [];
      
      items.forEach(item => {
        const product = products.find(p => p.id === item.productId);
        const copies = printByQuantity ? Math.max(1, Math.floor(Number(item.quantity))) : 1;
        
        for (let i = 0; i < copies; i++) {
            itemsWithDetails.push({
                name: item.productName,
                sku: product?.sku || '0000',
                price: product?.sales_price || 0,
                expiry: (product as any)?.expiry_date
            });
        }
      });

      printWindow.document.write(`
        <html dir="rtl">
        <head>
            <title>طباعة الباركود</title>
            <link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+39+Text&family=Tajawal:wght@400;700&display=swap" rel="stylesheet">
            <style>
                body { font-family: 'Tajawal', sans-serif; padding: 20px; background-color: #f9fafb; }
                .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 15px; }
                .label { background: white; border: 1px solid #e5e7eb; padding: 15px; text-align: center; border-radius: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); display: flex; flex-direction: column; align-items: center; justify-content: center; page-break-inside: avoid; }
                .title { font-size: 14px; font-weight: bold; margin-bottom: 5px; color: #1f2937; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; }
                .barcode { font-family: 'Libre Barcode 39 Text', cursive; font-size: 40px; line-height: 1; margin: 5px 0; color: #000; }
                .price { font-size: 16px; font-weight: bold; color: #059669; }
                .sku { font-size: 10px; color: #6b7280; font-family: monospace; }
                
                @media print { 
                    @page { size: 50mm 30mm; margin: 0; } /* حجم الملصق الحراري */
                    body { background: white; padding: 0; margin: 0; } 
                    .no-print { display: none; } 
                    .grid { display: block; } /* إلغاء الشبكة للطباعة المتتابعة */
                    .label { 
                        width: 50mm; height: 30mm; /* أبعاد الملصق */
                        border: none; box-shadow: none; 
                        padding: 1mm; margin: 0 auto; 
                        page-break-after: always; /* فاصل صفحة بعد كل ملصق */
                        box-sizing: border-box;
                    }
                    .title { font-size: 10px; margin-bottom: 0; white-space: nowrap; overflow: hidden; }
                    .barcode { font-size: 32px; margin: 0; }
                    .price { font-size: 12px; margin: 0; }
                    .sku { font-size: 8px; margin: 0; }
                    .expiry { font-size: 8px; margin: 0; font-weight: bold; }
                }
            </style>
        </head>
        <body>
            <div class="no-print" style="margin-bottom: 20px; text-align: center;">
                <button onclick="window.print()" style="background: #2563eb; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-family: inherit; font-weight: bold; cursor: pointer;">🖨️ طباعة الملصقات (${itemsWithDetails.length})</button>
            </div>
            <div class="grid">${itemsWithDetails.map(item => `<div class="label"><div class="title">${item.name}</div><div class="barcode">*${item.sku}*</div><div class="sku">${item.sku}</div><div class="price">${item.price.toLocaleString()}</div>${item.expiry ? `<div class="expiry">Exp: ${item.expiry}</div>` : ''}</div>`).join('')}</div>
        </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const adjustmentSchema = z.object({
        warehouseId: z.string().min(1, 'الرجاء اختيار المستودع'),
        date: z.string().min(1, 'التاريخ مطلوب'),
        reason: z.string().min(1, 'السبب مطلوب'),
        items: z.array(z.object({
            productId: z.string().min(1),
            quantity: z.number().min(0.01, 'الكمية يجب أن تكون أكبر من 0')
        })).min(1, 'الرجاء إضافة أصناف للقائمة أولاً')
    });

    const validationResult = adjustmentSchema.safeParse({ warehouseId, date, reason, items });
    if (!validationResult.success) {
        showToast(validationResult.error.issues[0].message, 'warning');
        return;
    }

    setLoading(true);
    try {
        const adjustmentNumber = `ADJ-${Date.now().toString().slice(-6)}`;

        // 1. Create Header
        const { data: header, error: headerError } = await supabase.from('stock_adjustments').insert({
            warehouse_id: warehouseId,
            adjustment_date: date,
            reason: reason,
            adjustment_number: adjustmentNumber,
            status: 'posted', // Direct posting for simplicity, or draft
            created_by: currentUser?.id
        }).select().single();

        if (headerError) throw headerError;

        // 2. Create Items
        const dbItems = items.map(item => ({
            stock_adjustment_id: header.id,
            product_id: item.productId,
            quantity: item.type === 'in' ? Math.abs(item.quantity) : -Math.abs(item.quantity),
            type: item.type
        }));

        const { error: itemsError } = await supabase.from('stock_adjustment_items').insert(dbItems);
        if (itemsError) throw itemsError;

        // 3. Recalculate Stock
        await recalculateStock();

        // 4. Create Journal Entry (إنشاء القيد المحاسبي)
        let totalValue = 0;
        items.forEach(item => {
            const product = products.find(p => p.id === item.productId);
            const cost = product?.purchase_price || 0;
            const qty = item.quantity;
            // إذا كانت زيادة (in) تضاف للقيمة، وإذا عجز (out) تطرح
            totalValue += (item.type === 'in' ? 1 : -1) * qty * cost;
        });

        if (totalValue !== 0) {
            const inventoryAcc = getSystemAccount('INVENTORY_FINISHED_GOODS') || getSystemAccount('INVENTORY') || accounts.find(a => a.code === '1213' || a.code === '121');
            const adjustmentAcc = getSystemAccount('INVENTORY_ADJUSTMENTS') || accounts.find(a => a.code === '512');

            if (inventoryAcc && adjustmentAcc) {
                const lines = [];
                if (totalValue > 0) {
                    // زيادة (Gain): من ح/ المخزون إلى ح/ تسويات (إيراد/تخفيض مصروف)
                    lines.push({ accountId: inventoryAcc.id, debit: totalValue, credit: 0, description: 'زيادة مخزنية - تسوية' });
                    lines.push({ accountId: adjustmentAcc.id, debit: 0, credit: totalValue, description: 'أرباح/فروقات تسوية مخزنية' });
                } else {
                    // عجز (Loss): من ح/ تسويات (مصروف) إلى ح/ المخزون
                    lines.push({ accountId: adjustmentAcc.id, debit: Math.abs(totalValue), credit: 0, description: 'خسائر/فروقات تسوية مخزنية' });
                    lines.push({ accountId: inventoryAcc.id, debit: 0, credit: Math.abs(totalValue), description: 'عجز مخزني - تسوية' });
                }
                
                await addEntry({ date: date, reference: adjustmentNumber, description: `تسوية مخزنية رقم ${adjustmentNumber} - ${reason}`, status: 'posted', lines: lines });
            } else {
                showToast('تنبيه: تم حفظ التسوية ولكن لم يتم إنشاء القيد المحاسبي لعدم العثور على الحسابات المطلوبة.', 'warning');
            }
        }

        showToast('تم حفظ التسوية المخزنية بنجاح ✅', 'success');
        setItems([]);
        setReason('');
        // Optional: Reset warehouse or keep it
    } catch (error: any) {
        console.error(error);
        showToast('حدث خطأ: ' + error.message, 'error');
    } finally {
        setLoading(false);
    }
  };

  // Filter products for search
  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center">
        <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <AlertTriangle className="text-amber-500" /> تسوية مخزنية (تالف / عجز / زيادة)
            </h2>
            <p className="text-slate-500">تسجيل الفروقات المخزنية يدوياً (تالف، سرقة، هدايا، تسويات)</p>
        </div>
        <div className="flex gap-2">
            <button onClick={handlePrintBarcodes} className="bg-purple-50 border border-purple-200 text-purple-700 px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-purple-100 text-sm font-bold" title="طباعة باركود للأصناف في القائمة">
                <Barcode size={16} /> طباعة باركود
            </button>
            <button onClick={handleDownloadTemplate} className="bg-white border border-slate-300 text-slate-600 px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-50 text-sm font-bold" title="تحميل نموذج Excel">
                <Download size={16} /> نموذج
            </button>
            <div className="relative">
                <input
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleFileUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    disabled={isImporting}
                />
                <button className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-emerald-100 text-sm font-bold">
                    {isImporting ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                    استيراد Excel
                </button>
            </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">المستودع</label>
                <select 
                    value={warehouseId}
                    onChange={e => setWarehouseId(e.target.value)}
                    className="w-full border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                    required
                >
                    <option value="">-- اختر المستودع --</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
            </div>
            <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">تاريخ التسوية</label>
                <input 
                    type="date" 
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                    required
                />
            </div>
            <div className="md:col-span-2">
                <label className="block text-sm font-bold text-slate-700 mb-1">سبب التسوية / ملاحظات</label>
                <input 
                    type="text" 
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="مثال: جرد شهري، بضاعة تالفة، ..."
                    className="w-full border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                    required
                />
            </div>
        </div>

        <div className="border-t pt-6">
            <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                <Package size={20} /> إضافة الأصناف
            </h3>
            
            <div className="flex gap-2 mb-4">
                <div className="flex-1 relative">
                    <Search className="absolute right-3 top-3 text-slate-400" size={18} />
                    <select 
                        value={selectedProductId}
                        onChange={e => setSelectedProductId(e.target.value)}
                        className="w-full border rounded-lg p-2.5 pr-10 outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                    >
                        <option value="">بحث عن صنف لإضافته...</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name} (الرصيد: {p.stock})</option>)}
                    </select>
                </div>
                <button 
                    type="button" 
                    onClick={handleAddItem}
                    className="bg-blue-50 text-blue-600 px-4 rounded-lg hover:bg-blue-100 font-bold"
                >
                    <Plus />
                </button>
            </div>

            {items.length > 0 ? (
                <table className="w-full text-right border rounded-lg overflow-hidden">
                    <thead className="bg-slate-50 text-slate-600 font-bold text-sm">
                        <tr>
                            <th className="p-3">الصنف</th>
                            <th className="p-3">نوع الحركة</th>
                            <th className="p-3">الكمية</th>
                            <th className="p-3 w-10"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {items.map((item, idx) => (
                            <tr key={idx}>
                                <td className="p-3 font-medium">{item.productName}</td>
                                <td className="p-3">
                                    <select 
                                        value={item.type}
                                        onChange={e => handleTypeChange(idx, e.target.value)}
                                        className={`border rounded px-2 py-1 font-bold text-sm ${item.type === 'in' ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50'}`}
                                    >
                                        <option value="in">زيادة (+)</option>
                                        <option value="out">عجز / صرف (-)</option>
                                    </select>
                                </td>
                                <td className="p-3">
                                    <input 
                                        type="number" 
                                        min="0"
                                        step="0.01"
                                        value={item.quantity}
                                        onChange={e => handleQuantityChange(idx, parseFloat(e.target.value))}
                                        className="w-24 border rounded px-2 py-1 text-center font-bold"
                                    />
                                </td>
                                <td className="p-3 text-center">
                                    <button type="button" onClick={() => handleRemoveItem(idx)} className="text-red-500 hover:bg-red-50 p-1 rounded">
                                        <Trash2 size={18} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <div className="text-center py-8 text-slate-400 border-2 border-dashed rounded-lg">
                    لا توجد أصناف مضافة
                </div>
            )}
        </div>

        <div className="flex justify-end pt-4">
            <button 
                type="submit" 
                disabled={loading}
                className="bg-amber-500 text-white px-8 py-3 rounded-xl font-bold hover:bg-amber-600 flex items-center gap-2 shadow-lg shadow-amber-200 transition-all"
            >
                {loading ? <Loader2 className="animate-spin" /> : <Save size={20} />}
                حفظ وترحيل التسوية
            </button>
        </div>
      </form>
    </div>
  );
};

export default StockAdjustmentForm;