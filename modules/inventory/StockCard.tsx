﻿﻿﻿import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { History, Search, Loader2, Printer, Package, AlertCircle, ArrowRightLeft, ClipboardList, Warehouse, Download, Barcode, X, Upload, Edit, Clock, AlertTriangle, RefreshCw, PlusCircle, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

type Transaction = {
  id: string;
  date: string;
  type: 'IN' | 'OUT';
  quantity: number;
  documentType: string;
  documentNumber: string;
  warehouseName?: string;
  balance?: number;
  createdAt?: string;
  notes?: string;
};

const StockCard = () => {
  const navigate = useNavigate();
  const { currentUser, warehouses, products, refreshData, updateProduct, users, recalculateStock } = useAccounting();
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [notesSearch, setNotesSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({ name: '', sales_price: 0, purchase_price: 0 });
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [priceHistory, setPriceHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isOpeningModalOpen, setIsOpeningModalOpen] = useState(false);
  const [openingFormData, setOpeningFormData] = useState({ warehouseId: '', quantity: 0, cost: 0 });
  const [existingOpeningId, setExistingOpeningId] = useState<string | null>(null);
  
  // جلب الحركات عند تغيير الصنف أو المستودع
  useEffect(() => {
    if (selectedProductId) {
      fetchTransactions();
    } else {
      setTransactions([]);
    }
  }, [selectedProductId, selectedWarehouseId]);

  const fetchTransactions = async () => {
    if (!selectedProductId) return;
    setLoading(true);
    if (currentUser?.role === 'demo') {
        setTransactions([
            { id: 'd1', date: new Date().toISOString().split('T')[0], type: 'IN', quantity: 10, documentType: 'فاتورة مشتريات', documentNumber: 'PINV-D-01', warehouseName: 'المستودع الرئيسي', balance: 10 },
            { id: 'd2', date: new Date().toISOString().split('T')[0], type: 'OUT', quantity: 2, documentType: 'فاتورة مبيعات', documentNumber: 'INV-D-01', warehouseName: 'المستودع الرئيسي', balance: 8 },
        ]);
        setLoading(false);
        return;
    }

    try {
      // بناء الاستعلامات لجلب الحركات من جداول مختلفة
      let querySales = supabase.from('invoice_items').select('quantity, invoices!inner(id, invoice_date, invoice_number, warehouse_id, created_at, notes, status)').eq('product_id', selectedProductId).neq('invoices.status', 'draft').neq('invoices.status', 'cancelled');
      let queryPurchases = supabase.from('purchase_invoice_items').select('quantity, purchase_invoices!purchase_invoice_items_purchase_invoice_id_fkey!inner(id, invoice_date, invoice_number, warehouse_id, created_at, notes, status)').eq('product_id', selectedProductId).neq('purchase_invoices.status', 'draft').neq('purchase_invoices.status', 'cancelled');
      let querySalesReturns = supabase.from('sales_return_items').select('quantity, sales_returns!inner(id, return_date, return_number, warehouse_id, created_at, notes, status)').eq('product_id', selectedProductId).neq('sales_returns.status', 'draft').neq('sales_returns.status', 'cancelled');
      let queryPurchaseReturns = supabase.from('purchase_return_items').select('quantity, purchase_returns!inner(id, return_date, return_number, warehouse_id, created_at, notes, status)').eq('product_id', selectedProductId).neq('purchase_returns.status', 'draft').neq('purchase_returns.status', 'cancelled');
      let queryAdjustments = supabase.from('stock_adjustment_items').select('quantity, stock_adjustments!inner(id, adjustment_date, adjustment_number, warehouse_id, created_at, reason, status)').eq('product_id', selectedProductId).neq('stock_adjustments.status', 'draft').neq('stock_adjustments.status', 'cancelled');
      let queryTransfers = supabase.from('stock_transfer_items').select('quantity, stock_transfers!inner(id, transfer_date, transfer_number, from_warehouse_id, to_warehouse_id, created_at, notes, status)').eq('product_id', selectedProductId).neq('stock_transfers.status', 'draft').neq('stock_transfers.status', 'cancelled');
      // إضافة استعلام الرصيد الافتتاحي
      let queryOpening = supabase.from('opening_inventories').select('id, quantity, warehouse_id, created_at').eq('product_id', selectedProductId);

      // تطبيق فلتر المستودع إذا تم اختياره
      if (selectedWarehouseId) {
        querySales = querySales.eq('invoices.warehouse_id', selectedWarehouseId);
        queryPurchases = queryPurchases.eq('purchase_invoices.warehouse_id', selectedWarehouseId);
        querySalesReturns = querySalesReturns.eq('sales_returns.warehouse_id', selectedWarehouseId);
        queryPurchaseReturns = queryPurchaseReturns.eq('purchase_returns.warehouse_id', selectedWarehouseId);
        queryAdjustments = queryAdjustments.eq('stock_adjustments.warehouse_id', selectedWarehouseId);
        queryOpening = queryOpening.eq('warehouse_id', selectedWarehouseId);
      }

      // تنفيذ الاستعلامات بالتوازي
      const [sales, purchases, sReturns, pReturns, adjustments, transfers, opening] = await Promise.all([
        querySales, queryPurchases, querySalesReturns, queryPurchaseReturns, queryAdjustments, queryTransfers, queryOpening
      ]);

      const allTxns: Transaction[] = [];
      const getWName = (id: string) => warehouses.find(w => w.id === id)?.name || 'غير محدد';

      // معالجة الرصيد الافتتاحي
      opening.data?.forEach((item: any) => {
        allTxns.push({
          id: `OPEN-${item.id}`,
          date: item.created_at ? item.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
          type: 'IN',
          quantity: item.quantity,
          documentType: 'رصيد افتتاحي',
          documentNumber: '-',
          warehouseName: getWName(item.warehouse_id),
          createdAt: item.created_at,
          notes: 'بضاعة أول المدة'
        });
      });

      // معالجة المبيعات (صادر)
      sales.data?.forEach((item: any) => {
        allTxns.push({
          id: `SALE-${item.invoices.id}`,
          date: item.invoices.invoice_date,
          type: 'OUT',
          quantity: item.quantity,
          documentType: 'فاتورة مبيعات',
          documentNumber: item.invoices.invoice_number,
          warehouseName: getWName(item.invoices.warehouse_id),
          createdAt: item.invoices.created_at,
          notes: item.invoices.notes
        });
      });

      // معالجة المشتريات (وارد)
      purchases.data?.forEach((item: any) => {
        allTxns.push({
          id: `PUR-${item.purchase_invoices.id}`,
          date: item.purchase_invoices.invoice_date,
          type: 'IN',
          quantity: item.quantity,
          documentType: 'فاتورة مشتريات',
          documentNumber: item.purchase_invoices.invoice_number,
          warehouseName: getWName(item.purchase_invoices.warehouse_id),
          createdAt: item.purchase_invoices.created_at,
          notes: item.purchase_invoices.notes
        });
      });

      // معالجة مرتجعات المبيعات (وارد)
      sReturns.data?.forEach((item: any) => {
        allTxns.push({
          id: `SR-${item.sales_returns.id}`,
          date: item.sales_returns.return_date,
          type: 'IN',
          quantity: item.quantity,
          documentType: 'مرتجع مبيعات',
          documentNumber: item.sales_returns.return_number,
          warehouseName: getWName(item.sales_returns.warehouse_id),
          createdAt: item.sales_returns.created_at,
          notes: item.sales_returns.notes
        });
      });

      // معالجة مرتجعات المشتريات (صادر)
      pReturns.data?.forEach((item: any) => {
        allTxns.push({
          id: `PR-${item.purchase_returns.id}`,
          date: item.purchase_returns.return_date,
          type: 'OUT',
          quantity: item.quantity,
          documentType: 'مرتجع مشتريات',
          documentNumber: item.purchase_returns.return_number,
          warehouseName: getWName(item.purchase_returns.warehouse_id),
          createdAt: item.purchase_returns.created_at,
          notes: item.purchase_returns.notes
        });
      });

      // معالجة التسويات المخزنية (وارد أو صادر حسب الإشارة)
      adjustments.data?.forEach((item: any) => {
        allTxns.push({
          id: `ADJ-${item.stock_adjustments.id}`,
          date: item.stock_adjustments.adjustment_date,
          type: item.quantity >= 0 ? 'IN' : 'OUT',
          quantity: Math.abs(item.quantity),
          documentType: 'تسوية مخزنية',
          documentNumber: item.stock_adjustments.adjustment_number,
          warehouseName: getWName(item.stock_adjustments.warehouse_id),
          createdAt: item.stock_adjustments.created_at,
          notes: item.stock_adjustments.reason
        });
      });

      // معالجة التحويلات المخزنية (تظهر فقط عند اختيار مستودع محدد)
      if (transfers.data) {
        transfers.data.forEach((item: any) => {
            const t = item.stock_transfers;
            
            // إذا تم اختيار مستودع محدد، نعرض الحركات الخاصة به فقط
            if (selectedWarehouseId) {
                if (t.from_warehouse_id === selectedWarehouseId) {
                    // تحويل صادر من هذا المستودع
                    allTxns.push({
                        id: `TRN-OUT-${t.id}`,
                        date: t.transfer_date,
                        type: 'OUT',
                        quantity: item.quantity,
                        documentType: 'تحويل صادر',
                        documentNumber: t.transfer_number,
                        warehouseName: `إلى: ${getWName(t.to_warehouse_id)}`,
                        createdAt: t.created_at,
                        notes: t.notes
                    });
                } else if (t.to_warehouse_id === selectedWarehouseId) {
                    // تحويل وارد لهذا المستودع
                    allTxns.push({
                        id: `TRN-IN-${t.id}`,
                        date: t.transfer_date,
                        type: 'IN',
                        quantity: item.quantity,
                        documentType: 'تحويل وارد',
                        documentNumber: t.transfer_number,
                        warehouseName: `من: ${getWName(t.from_warehouse_id)}`,
                        createdAt: t.created_at,
                        notes: t.notes
                    });
                }
            } else {
                // إذا كان العرض "كل المستودعات"، التحويلات الداخلية لا تؤثر على الرصيد الإجمالي للشركة
                // ولكن يمكن عرضها كمعلومة. هنا سنستبعدها من الحساب الإجمالي لتجنب الازدواجية في العرض
                // أو يمكن عرضها كحركتين (واحدة وارد وواحدة صادر)
                // للخيار الأبسط: لا نعرض التحويلات في العرض الإجمالي لأنها Net Zero
            }
        });
      }

      // ترتيب زمني (من الأقدم للأحدث) لحساب الرصيد التراكمي
      allTxns.sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        if (dateA !== dateB) return dateA - dateB;
        
        // إعطاء الأولوية للرصيد الافتتاحي ليظهر أولاً في نفس اليوم
        if (a.documentType === 'رصيد افتتاحي') return -1;
        if (b.documentType === 'رصيد افتتاحي') return 1;

        const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return createdA - createdB;
      });

      let balance = 0;
      const txnsWithBalance = allTxns.map(t => {
        if (t.type === 'IN') balance += t.quantity;
        else balance -= t.quantity;
        return { ...t, balance };
      });

      // عكس الترتيب للعرض (الأحدث أولاً)
      setTransactions(txnsWithBalance.reverse());

    } catch (error) {
      console.error("Error fetching transactions:", error);
    } finally {
      setLoading(false);
    }
  };

  const selectedProduct = products.find(p => p.id === selectedProductId);

  const filteredTransactions = transactions.filter(t => 
    (!notesSearch || (t.notes && t.notes.toLowerCase().includes(notesSearch.toLowerCase()))) &&
    (!startDate || t.date >= startDate) &&
    (!endDate || t.date <= endDate)
  );

  const handleExportExcel = () => {
    if (filteredTransactions.length === 0) return;

    const data = filteredTransactions.map(t => ({
      'التاريخ': new Date(t.date).toLocaleDateString('ar-EG'),
      'نوع الحركة': t.documentType,
      'المستند': t.documentNumber || '-',
      'المستودع': t.warehouseName || '-',
      'وارد (+)': t.type === 'IN' ? t.quantity : 0,
      'صادر (-)': t.type === 'OUT' ? t.quantity : 0,
      'الرصيد': t.balance,
      'ملاحظات': t.notes || '-'
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stock Card");
    XLSX.writeFile(wb, `StockCard_${selectedProduct?.name || 'Product'}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handlePrintBarcode = () => {
    if (selectedProduct) {
        const printWindow = window.open('', '', 'width=600,height=400');
        if (printWindow) {
            printWindow.document.write(`
                <html dir="rtl">
                <head><title>طباعة باركود - ${selectedProduct.name}</title></head>
                <body style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; font-family: sans-serif;">
                    <div style="border: 1px solid #000; padding: 20px; text-align: center; border-radius: 8px; width: 300px;">
                        <h2 style="margin: 0 0 10px 0; font-size: 18px;">${selectedProduct.name}</h2>
                        <div style="font-family: 'Libre Barcode 39', sans-serif; font-size: 40px; margin: 10px 0;">*${selectedProduct.sku || '0000'}*</div>
                        <p style="margin: 5px 0 0 0; font-weight: bold; font-family: monospace; font-size: 16px;">${selectedProduct.sku || 'No SKU'}</p>
                        <p style="margin: 10px 0 0 0; font-size: 20px; font-weight: bold;">${(selectedProduct.sales_price || selectedProduct.price || 0).toLocaleString()} ج.م</p>
                    </div>
                    <script>window.onload = function() { window.print(); }</script>
                </body>
                </html>
            `);
            printWindow.document.close();
        }
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !selectedProductId) return;
    
    if (currentUser?.role === 'demo') {
        alert('رفع الصور غير متاح في النسخة التجريبية');
        return;
    }

    const file = e.target.files[0];
    const fileExt = file.name.split('.').pop();
    const fileName = `prod-${selectedProductId}-${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    try {
      setUploading(true);
      const { error: uploadError } = await supabase.storage.from('product-images').upload(filePath, file);
      if (uploadError) throw uploadError;
      
      const { data } = supabase.storage.from('product-images').getPublicUrl(filePath);
      
      const { error: updateError } = await supabase.from('products').update({ image_url: data.publicUrl }).eq('id', selectedProductId);
      if (updateError) throw updateError;
      
      await refreshData();
    } catch (error: any) {
      alert('فشل رفع الصورة: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const openEditModal = () => {
      if (selectedProduct) {
          setEditFormData({
              name: selectedProduct.name,
              sales_price: (selectedProduct as any).sales_price || (selectedProduct as any).price || 0,
              purchase_price: (selectedProduct as any).purchase_price || (selectedProduct as any).cost || 0
          });
          setIsEditModalOpen(true);
      }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedProductId) return;
      
      if (editFormData.sales_price < editFormData.purchase_price) {
          if (!window.confirm(`تنبيه: سعر البيع (${editFormData.sales_price}) أقل من سعر التكلفة (${editFormData.purchase_price})! هل أنت متأكد من الحفظ؟`)) {
              return;
          }
      }
      
      try {
          await updateProduct(selectedProductId, editFormData);
          alert('تم تحديث بيانات الصنف بنجاح ✅');
          setIsEditModalOpen(false);
          await refreshData();
      } catch (error: any) {
          alert('فشل التحديث: ' + error.message);
      }
  };

  const handleShowPriceHistory = async () => {
      if (!selectedProductId) return;
      setHistoryLoading(true);
      setIsHistoryModalOpen(true);
      
      try {
          const { data, error } = await supabase
              .from('security_logs')
              .select('*')
              .eq('metadata->>productId', selectedProductId)
              .order('created_at', { ascending: false });
              
          if (error) throw error;
          
          const priceLogs = data?.filter((log: any) => {
              const changes = log.metadata?.changes;
              return changes && (changes.sales_price || changes.purchase_price || changes.price || changes.cost);
          }) || [];
          
          setPriceHistory(priceLogs);
      } catch (err) {
          console.error(err);
      } finally {
          setHistoryLoading(false);
      }
  };

  // دالة إعادة احتساب الأرصدة
  const handleRecalculate = async () => {
    if (window.confirm('هل تريد إعادة احتساب أرصدة المخزون بناءً على الحركات المسجلة؟ سيتم تصحيح أي فروقات.')) {
        setIsRecalculating(true);
        try {
            await recalculateStock();
            await refreshData(); // تحديث بيانات المنتجات في السياق
            await fetchTransactions(); // تحديث الجدول الحالي
        } catch (e) {
            console.error(e);
        } finally {
            setIsRecalculating(false);
        }
    }
  };

  const handleDeleteOpeningBalance = async () => {
      if (!existingOpeningId) return;
      if (!window.confirm('هل أنت متأكد من حذف رصيد أول المدة لهذا الصنف؟')) return;

      setLoading(true);
      try {
          const { error } = await supabase.from('opening_inventories').delete().eq('id', existingOpeningId);
          if (error) throw error;

          await recalculateStock();
          await refreshData();
          await fetchTransactions();
          setIsOpeningModalOpen(false);
          alert('تم حذف رصيد أول المدة بنجاح');
      } catch (error: any) {
          alert('خطأ: ' + error.message);
      } finally {
          setLoading(false);
      }
  };

  // دالة حفظ رصيد أول المدة
  const handleSaveOpeningBalance = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedProductId || !openingFormData.warehouseId) return;

      setLoading(true);
      try {
          // 1. التحقق مما إذا كان هناك رصيد افتتاحي سابق لهذا الصنف في هذا المستودع
          const { data: existing } = await supabase
              .from('opening_inventories')
              .select('id')
              .eq('product_id', selectedProductId)
              .eq('warehouse_id', openingFormData.warehouseId)
              .maybeSingle();

          if (existing) {
              // تحديث الموجود
              await supabase.from('opening_inventories').update({
                  quantity: openingFormData.quantity,
                  cost: openingFormData.cost
              }).eq('id', existing.id);
          } else {
              // إنشاء جديد
              await supabase.from('opening_inventories').insert({
                  product_id: selectedProductId,
                  warehouse_id: openingFormData.warehouseId,
                  quantity: openingFormData.quantity,
                  cost: openingFormData.cost
              });
          }

          await recalculateStock(); // إعادة احتساب الأرصدة لتنعكس التغييرات
          await refreshData();
          await fetchTransactions();
          setIsOpeningModalOpen(false);
          alert('تم تحديث رصيد أول المدة بنجاح ✅');
      } catch (error: any) {
          alert('خطأ: ' + error.message);
      } finally {
          setLoading(false);
      }
  };

  // عند فتح نافذة الرصيد الافتتاحي، نحاول جلب الرصيد الحالي
  useEffect(() => {
      if (isOpeningModalOpen && selectedProductId && openingFormData.warehouseId) {
          const fetchExisting = async () => {
              const { data } = await supabase
                  .from('opening_inventories')
                  .select('id, quantity, cost')
                  .eq('product_id', selectedProductId)
                  .eq('warehouse_id', openingFormData.warehouseId)
                  .maybeSingle();
              
              if (data) {
                  setOpeningFormData(prev => ({ ...prev, quantity: data.quantity, cost: data.cost || 0 }));
                  setExistingOpeningId(data.id);
              } else {
                  setExistingOpeningId(null);
                  // لا نصفر الكمية هنا لنسمح للمستخدم بإدخال جديد بسهولة
              }
          };
          fetchExisting();
      }
  }, [isOpeningModalOpen, selectedProductId, openingFormData.warehouseId]);

  const priceChartData = useMemo(() => {
      return [...priceHistory].reverse().map(log => ({
          date: new Date(log.created_at).toLocaleDateString('ar-EG'),
          salesPrice: log.metadata.changes.sales_price?.to || log.metadata.changes.price?.to,
          costPrice: log.metadata.changes.purchase_price?.to || log.metadata.changes.cost?.to
      }));
  }, [priceHistory]);

  const totalIn = filteredTransactions.reduce((sum, t) => t.type === 'IN' ? sum + t.quantity : sum, 0);
  const totalOut = filteredTransactions.reduce((sum, t) => t.type === 'OUT' ? sum + t.quantity : sum, 0);

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center print:hidden">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <History className="text-blue-600" /> كارت الصنف (حركة المخزون)
          </h2>
          <p className="text-slate-500">تتبع حركات الوارد والصادر والرصيد لكل صنف</p>
        </div>
        <div className="flex gap-2">
            <button 
                onClick={() => { setOpeningFormData({ warehouseId: warehouses[0]?.id || '', quantity: 0, cost: 0 }); setIsOpeningModalOpen(true); }}
                disabled={!selectedProductId}
                className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-50 font-bold disabled:opacity-50"
            >
                <PlusCircle size={18} /> رصيد أول المدة
            </button>
            <button 
                onClick={handleRecalculate}
                disabled={isRecalculating}
                className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-50 font-bold"
                title="إصلاح فروقات الأرصدة"
            >
                <RefreshCw size={18} className={isRecalculating ? 'animate-spin' : ''} /> إعادة احتساب
            </button>
            <button 
                onClick={() => navigate('/stock-transfer', { state: { productId: selectedProductId } })}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700"
            >
                <ArrowRightLeft size={18} /> تحويل مخزني
            </button>
            <button 
                onClick={() => navigate('/stock-adjustment', { state: { productId: selectedProductId } })}
                className="bg-amber-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-amber-700"
            >
                <ClipboardList size={18} /> تسوية مخزنية
            </button>
            <button onClick={handlePrintBarcode} className="bg-purple-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-purple-700">
                <Barcode size={18} /> طباعة باركود
            </button>
            <button onClick={handleExportExcel} className="bg-emerald-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-emerald-700">
                <Download size={18} /> تصدير Excel
            </button>
            <button onClick={() => window.print()} className="bg-slate-800 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-700">
                <Printer size={18} /> طباعة الكارت
            </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-6 print:hidden">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1">بحث واختيار الصنف</label>
          <div className="relative">
             <Search className="absolute right-3 top-3 text-slate-400" size={18} />
             <select 
                className="w-full border rounded-lg p-2.5 pr-10 appearance-none outline-none focus:ring-2 focus:ring-blue-500" 
                value={selectedProductId} 
                onChange={e => setSelectedProductId(e.target.value)}
             >
                <option value="">-- اختر الصنف --</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name} {p.sku ? `(${p.sku})` : ''}</option>)}
             </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1">المستودع (اختياري)</label>
          <select className="w-full border rounded-lg p-2.5" value={selectedWarehouseId} onChange={e => setSelectedWarehouseId(e.target.value)}>
            <option value="">-- كل المستودعات --</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1">بحث في الملاحظات</label>
          <div className="relative">
             <Search className="absolute right-3 top-3 text-slate-400" size={18} />
             <input 
                type="text" 
                placeholder="بحث..." 
                className="w-full border rounded-lg p-2.5 pr-10 outline-none focus:ring-2 focus:ring-blue-500"
                value={notesSearch}
                onChange={e => setNotesSearch(e.target.value)}
             />
          </div>
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1">من تاريخ</label>
          <input 
            type="date" 
            className="w-full border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1">إلى تاريخ</label>
          <input 
            type="date" 
            className="w-full border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
          />
        </div>
      </div>

      {selectedProductId && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 bg-slate-50 border-b flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-4">
                <div className="relative group">
                    <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden cursor-pointer hover:opacity-90 transition-opacity" onClick={() => (selectedProduct as any)?.image_url && setIsImageModalOpen(true)}>
                        {(selectedProduct as any)?.image_url ? (
                            <img src={(selectedProduct as any).image_url} alt={selectedProduct?.name} className="w-16 h-16 object-cover" />
                        ) : (
                            <div className="p-3">
                                <Package size={32} className="text-blue-600" />
                            </div>
                        )}
                    </div>
                    <label className="absolute -bottom-2 -right-2 bg-white text-slate-600 p-1.5 rounded-full shadow-md border border-slate-100 cursor-pointer hover:text-blue-600 hover:bg-blue-50 transition-colors z-10" title="رفع صورة للصنف">
                        {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                        <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
                    </label>
                </div>
                <div>
                    <div className="flex items-center gap-2">
                        <h3 className="font-black text-xl text-slate-800">{selectedProduct?.name}</h3>
                        <button onClick={handleShowPriceHistory} className="text-slate-400 hover:text-amber-600 transition-colors p-1 rounded-full hover:bg-slate-100" title="سجل تغييرات الأسعار">
                            <Clock size={16} />
                        </button>
                        <button onClick={openEditModal} className="text-slate-400 hover:text-blue-600 transition-colors p-1 rounded-full hover:bg-slate-100" title="تعديل بيانات الصنف">
                            <Edit size={16} />
                        </button>
                    </div>
                    <p className="text-slate-500 font-mono text-sm">{selectedProduct?.sku || 'No SKU'}</p>
                </div>
            </div>
            <div className="flex gap-6 text-center">
                {/* سعر البيع */}
                <div className="bg-white px-6 py-2 rounded-lg border border-slate-200 shadow-sm hidden md:block">
                    <p className="text-xs text-slate-500 font-bold uppercase">سعر البيع</p>
                    <p className="text-2xl font-black text-slate-700" dir="ltr">
                        {((selectedProduct as any)?.sales_price || (selectedProduct as any)?.price || 0).toLocaleString()}
                    </p>
                </div>
                {/* متوسط التكلفة */}
                <div className="bg-white px-6 py-2 rounded-lg border border-slate-200 shadow-sm hidden md:block">
                    <p className="text-xs text-slate-500 font-bold uppercase">متوسط التكلفة</p>
                    <p className="text-2xl font-black text-amber-600" dir="ltr">
                        {((selectedProduct as any)?.weighted_average_cost || (selectedProduct as any)?.purchase_price || (selectedProduct as any)?.cost || 0).toLocaleString()}
                    </p>
                </div>
                {/* الرصيد الإجمالي (دائماً يظهر) */}
                <div className="bg-white px-6 py-2 rounded-lg border border-slate-200 shadow-sm">
                    <p className="text-xs text-slate-500 font-bold uppercase">إجمالي الرصيد (الكل)</p>
                    <p className="text-2xl font-black text-blue-600" dir="ltr">
                        {selectedProduct?.stock || 0}
                    </p>
                </div>
                
                {/* رصيد المستودع (يظهر فقط عند الفلترة) */}
                {selectedWarehouseId && (
                    <div className="bg-white px-6 py-2 rounded-lg border border-slate-200 shadow-sm">
                        <p className="text-xs text-slate-500 font-bold uppercase flex items-center gap-1">
                            <Warehouse size={12} /> رصيد المستودع
                        </p>
                        <p className="text-2xl font-black text-slate-800" dir="ltr">
                            {transactions.length > 0 ? transactions[0].balance : 0}
                        </p>
                    </div>
                )}
            </div>
          </div>

          {loading ? (
              <div className="p-12 text-center flex justify-center">
                  <Loader2 className="animate-spin text-blue-600" size={32} />
              </div>
          ) : (
            <table className="w-full text-right">
                <thead className="bg-slate-100 text-slate-600 font-bold text-sm border-b">
                <tr>
                    <th className="p-4">التاريخ</th>
                    <th className="p-4">نوع الحركة</th>
                    <th className="p-4">المستند</th>
                    <th className="p-4">المستودع</th>
                    <th className="p-4 text-center text-emerald-700 bg-emerald-50">وارد (+)</th>
                    <th className="p-4 text-center text-red-700 bg-red-50">صادر (-)</th>
                    <th className="p-4 text-center">الرصيد</th>
                    <th className="p-4">ملاحظات</th>
                </tr>
                </thead>
                <tbody className="divide-y">
                {filteredTransactions.map(t => (
                    <tr key={t.id} className={`hover:bg-slate-50 transition-colors ${t.warehouseName === 'غير محدد' ? 'bg-amber-50' : ''}`}>
                        <td className="p-4 text-slate-600 font-medium">{new Date(t.date).toLocaleDateString('ar-EG')}</td>
                        <td className="p-4 font-bold text-slate-700">{t.documentType}</td>
                        <td className="p-4 font-mono text-sm text-slate-500">{t.documentNumber || '-'}</td>
                        <td className="p-4 text-sm">{t.warehouseName}</td>
                        <td className="p-4 text-center font-bold text-emerald-600 bg-emerald-50/30">
                            {t.type === 'IN' ? t.quantity : '-'}
                        </td>
                        <td className="p-4 text-center font-bold text-red-600 bg-red-50/30">
                            {t.type === 'OUT' ? t.quantity : '-'}
                        </td>
                        <td className={`p-4 text-center font-black ${t.balance && t.balance < 0 ? 'text-red-600' : 'text-slate-800'} bg-slate-50`} dir="ltr">
                            {t.balance?.toLocaleString()}
                        </td>
                        <td className="p-4 text-sm text-slate-500 max-w-xs truncate" title={t.notes}>
                            {t.notes || '-'}
                        </td>
                    </tr>
                ))}
                {filteredTransactions.length === 0 && (
                    <tr><td colSpan={8} className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                        <AlertCircle size={32} />
                        لا توجد حركات مسجلة لهذا الصنف في هذا النطاق
                    </td></tr>
                )}
                </tbody>
                <tfoot className="font-bold border-t-2 border-slate-300 text-sm">
                    <tr className="bg-slate-200 text-slate-900">
                        <td colSpan={4} className="p-4 text-left text-slate-600">الإجمالي:</td>
                        <td className="p-4 text-center text-emerald-700 bg-emerald-50/30">{totalIn}</td>
                        <td className="p-4 text-center text-red-700 bg-red-50/30">{totalOut}</td>
                        <td className="p-4 text-center text-slate-800" dir="ltr">
                            {filteredTransactions.length > 0 ? filteredTransactions[0].balance?.toLocaleString() : 0}
                        </td>
                        <td></td>
                    </tr>
                </tfoot>
            </table>
          )}
        </div>
      )}

      {/* Image Modal */}
      {isImageModalOpen && (selectedProduct as any)?.image_url && (
        <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsImageModalOpen(false)}>
            <button 
                onClick={() => setIsImageModalOpen(false)}
                className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
            >
                <X size={32} />
            </button>
            <img 
                src={(selectedProduct as any).image_url} 
                alt={selectedProduct?.name} 
                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl animate-in zoom-in duration-200"
                onClick={(e) => e.stopPropagation()}
            />
        </div>
      )}

      {/* Edit Product Modal */}
      {isEditModalOpen && selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg text-slate-800">تعديل بيانات الصنف</h3>
                    <button onClick={() => setIsEditModalOpen(false)}><X className="text-slate-400 hover:text-red-500" /></button>
                </div>
                <form onSubmit={handleSaveProduct} className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">اسم الصنف</label>
                        <input 
                            type="text" 
                            required 
                            value={editFormData.name} 
                            onChange={e => setEditFormData({...editFormData, name: e.target.value})} 
                            className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none" 
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">سعر البيع</label>
                            <input type="number" required min="0" step="0.01" value={editFormData.sales_price} onChange={e => setEditFormData({...editFormData, sales_price: parseFloat(e.target.value)})} className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">سعر التكلفة</label>
                            <input type="number" required min="0" step="0.01" value={editFormData.purchase_price} onChange={e => setEditFormData({...editFormData, purchase_price: parseFloat(e.target.value)})} className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none" />
                        </div>
                    </div>
                    {editFormData.sales_price < editFormData.purchase_price && (
                        <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm font-bold flex items-center gap-2">
                            <AlertTriangle size={16} />
                            تنبيه: سعر البيع أقل من سعر التكلفة!
                        </div>
                    )}
                    <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 mt-2">
                        حفظ التعديلات
                    </button>
                </form>
            </div>
        </div>
      )}

      {/* Price History Modal */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6 animate-in zoom-in-95 max-h-[80vh] overflow-hidden flex flex-col">
                <div className="flex justify-between items-center mb-4 shrink-0">
                    <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                        <Clock size={20} className="text-amber-600" /> سجل تغييرات الأسعار
                    </h3>
                    <button onClick={() => setIsHistoryModalOpen(false)}><X className="text-slate-400 hover:text-red-500" /></button>
                </div>
                
                <div className="overflow-y-auto flex-1">
                    {historyLoading ? (
                        <div className="flex justify-center p-8"><Loader2 className="animate-spin text-blue-600" /></div>
                    ) : priceHistory.length === 0 ? (
                        <div className="text-center p-8 text-slate-500">لا توجد تغييرات مسجلة على الأسعار.</div>
                    ) : (
                        <>
                        <div className="h-64 w-full mb-6 border-b border-slate-100 pb-4" dir="ltr">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={priceChartData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="date" tick={{fontSize: 12}} />
                                    <YAxis tick={{fontSize: 12}} />
                                    <Tooltip contentStyle={{borderRadius: '8px'}} />
                                    <Legend />
                                    <Line type="monotone" dataKey="salesPrice" name="سعر البيع" stroke="#10b981" strokeWidth={2} connectNulls dot={{r: 4}} />
                                    <Line type="monotone" dataKey="costPrice" name="سعر التكلفة" stroke="#f59e0b" strokeWidth={2} connectNulls dot={{r: 4}} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                        <table className="w-full text-right text-sm">
                            <thead className="bg-slate-50 text-slate-600 font-bold sticky top-0">
                                <tr>
                                    <th className="p-3">التاريخ</th>
                                    <th className="p-3">المستخدم</th>
                                    <th className="p-3">التغيير</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {priceHistory.map((log: any) => (
                                    <tr key={log.id}>
                                        <td className="p-3 text-slate-500" dir="ltr">{new Date(log.created_at).toLocaleString('ar-EG')}</td>
                                        <td className="p-3 font-bold">{users.find(u => u.id === log.performed_by)?.name || 'مستخدم'}</td>
                                        <td className="p-3">
                                            {Object.entries(log.metadata.changes).map(([key, val]: [string, any]) => (
                                                (key === 'sales_price' || key === 'purchase_price' || key === 'price' || key === 'cost') && (
                                                    <div key={key} className="flex items-center gap-2 mb-1">
                                                        <span className="text-xs font-bold text-slate-500">{key === 'sales_price' || key === 'price' ? 'سعر البيع' : 'سعر التكلفة'}:</span>
                                                        <span className="text-red-500 line-through">{val.from}</span>
                                                        <span className="text-slate-400">←</span>
                                                        <span className="text-emerald-600 font-bold">{val.to}</span>
                                                    </div>
                                                )
                                            ))}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        </>
                    )}
                </div>
            </div>
        </div>
      )}

      {/* Opening Balance Modal */}
      {isOpeningModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg text-slate-800">تعديل رصيد أول المدة</h3>
                    <button onClick={() => setIsOpeningModalOpen(false)}><X className="text-slate-400 hover:text-red-500" /></button>
                </div>
                <form onSubmit={handleSaveOpeningBalance} className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">المستودع</label>
                        <select required className="w-full border rounded-lg p-2.5" value={openingFormData.warehouseId} onChange={e => setOpeningFormData({...openingFormData, warehouseId: e.target.value})}>
                            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">الكمية الافتتاحية</label>
                        <input type="number" required value={openingFormData.quantity} onChange={e => setOpeningFormData({...openingFormData, quantity: parseFloat(e.target.value)})} className="w-full border rounded-lg p-2.5" />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">تكلفة الوحدة</label>
                        <input type="number" required min="0" step="0.01" value={openingFormData.cost} onChange={e => setOpeningFormData({...openingFormData, cost: parseFloat(e.target.value)})} className="w-full border rounded-lg p-2.5" />
                    </div>
                    <div className="flex gap-2 mt-4">
                        <button type="submit" disabled={loading} className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700">
                            {loading ? <Loader2 className="animate-spin mx-auto" /> : 'حفظ وتحديث'}
                        </button>
                        {existingOpeningId && (
                            <button type="button" onClick={handleDeleteOpeningBalance} disabled={loading} className="bg-red-50 text-red-600 px-4 py-3 rounded-lg font-bold hover:bg-red-100 border border-red-200" title="حذف الرصيد الافتتاحي">
                                <Trash2 size={20} />
                            </button>
                        )}
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};

export default StockCard;
