import React, { useState } from 'react';
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle, ArrowRight, Download, RefreshCw, X, PackagePlus } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';

interface ParsedRow {
  barcode?: string;
  sku?: string;
  name: string;
  quantity: number;
  purchase_price: number;
  sales_price?: number;
  expiry_date?: string;
  matchedProductId?: string;
  status: 'matched' | 'new' | 'error';
}

interface SupplierInvoiceExcelImporterProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (importedInvoiceId: string) => void;
}

export default function SupplierInvoiceExcelImporter({
  isOpen,
  onClose,
  onSuccess
}: SupplierInvoiceExcelImporterProps) {
  const { currentUser, currentSelectedOrgId } = useAccounting() as any;
  const { showToast } = useToast();
  const orgId = currentSelectedOrgId || currentUser?.organization_id;

  const [file, setFile] = useState<File | null>(null);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [invoiceNumber, setInvoiceNumber] = useState<string>(`SUP-INV-${Date.now().toString().slice(-6)}`);
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<'upload' | 'preview'>('upload');

  React.useEffect(() => {
    if (!orgId) return;
    const loadPrerequisites = async () => {
      const [supRes, whRes] = await Promise.all([
        supabase.from('suppliers').select('id, name').eq('organization_id', orgId).order('name'),
        supabase.from('warehouses').select('id, name').eq('organization_id', orgId).order('name')
      ]);
      setSuppliers(supRes.data || []);
      setWarehouses(whRes.data || []);
      if (supRes.data && supRes.data.length > 0) setSelectedSupplierId(supRes.data[0].id);
      if (whRes.data && whRes.data.length > 0) setSelectedWarehouseId(whRes.data[0].id);
    };
    loadPrerequisites();
  }, [orgId]);

  if (!isOpen) return null;

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        'الباركود (Barcode)': '6221000123456',
        'كود الصنف (SKU)': 'JUICE-001',
        'اسم الصنف (Item Name)': 'عصير جهينة مانجو 1 لتر',
        'الكمية المستلمة (Qty)': 24,
        'سعر الشراء للوحدة (Cost)': 25.50,
        'سعر البيع المقترح (Sale Price)': 32.00,
        'تاريخ الصلاحية (Expiry YYYY-MM-DD)': '2027-06-30'
      },
      {
        'الباركود (Barcode)': '6221000789012',
        'كود الصنف (SKU)': 'MILK-002',
        'اسم الصنف (Item Name)': 'حليب المراعي كامل الدسم 1 لتر',
        'الكمية المستلمة (Qty)': 48,
        'سعر الشراء للوحدة (Cost)': 34.00,
        'سعر البيع المقترح (Sale Price)': 42.00,
        'تاريخ الصلاحية (Expiry YYYY-MM-DD)': '2027-04-15'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "نموذج_فاتورة_المورد");
    XLSX.writeFile(wb, "Supplier_Invoice_Template.xlsx");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setIsProcessing(true);

    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const rawData: any[] = XLSX.utils.sheet_to_json(ws);

          if (rawData.length === 0) {
            showToast('الملف المرفوع فارغ!', 'error');
            setIsProcessing(false);
            return;
          }

          // Fetch existing products to match barcodes/SKUs
          const { data: existingProducts } = await supabase
            .from('products')
            .select('id, name, barcode, sku, purchase_price, sales_price')
            .eq('organization_id', orgId);

          const productMap = new Map<string, any>();
          (existingProducts || []).forEach(p => {
            if (p.barcode) productMap.set(p.barcode.trim(), p);
            if (p.sku) productMap.set(p.sku.trim(), p);
          });

          const rows: ParsedRow[] = rawData.map(row => {
            const barcode = String(row['الباركود (Barcode)'] || row['الباركود'] || row['Barcode'] || row['barcode'] || '').trim();
            const sku = String(row['كود الصنف (SKU)'] || row['كود الصنف'] || row['SKU'] || row['sku'] || '').trim();
            const name = String(row['اسم الصنف (Item Name)'] || row['اسم الصنف'] || row['الصنف'] || row['Name'] || row['name'] || '').trim();
            const quantity = Number(row['الكمية المستلمة (Qty)'] || row['الكمية'] || row['Qty'] || row['quantity'] || 1);
            const purchase_price = Number(row['سعر الشراء للوحدة (Cost)'] || row['سعر الشراء'] || row['Cost'] || row['purchase_price'] || 0);
            const sales_price = Number(row['سعر البيع المقترح (Sale Price)'] || row['سعر البيع'] || row['Price'] || row['sales_price'] || 0);
            const expiry_date = String(row['تاريخ الصلاحية (Expiry YYYY-MM-DD)'] || row['تاريخ الصلاحية'] || row['Expiry'] || '').trim() || undefined;

            const matched = productMap.get(barcode) || productMap.get(sku);

            return {
              barcode: barcode || undefined,
              sku: sku || undefined,
              name: name || matched?.name || 'صنف غير مسمى',
              quantity,
              purchase_price,
              sales_price: sales_price || matched?.sales_price || 0,
              expiry_date,
              matchedProductId: matched?.id,
              status: matched ? 'matched' : (name ? 'new' : 'error')
            };
          });

          setParsedRows(rows);
          setStep('preview');
        } catch (err: any) {
          showToast('فشل قراءة ملف الإكسيل: ' + err.message, 'error');
        } finally {
          setIsProcessing(false);
        }
      };
      reader.readAsBinaryString(uploadedFile);
    } catch (err: any) {
      showToast('خطأ أثناء تحميل الملف: ' + err.message, 'error');
      setIsProcessing(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!selectedSupplierId) {
      showToast('يرجى اختيار المورد أولاً', 'error');
      return;
    }
    if (parsedRows.length === 0) {
      showToast('لا توجد أصناف صالحة للاستيراد', 'error');
      return;
    }

    setIsProcessing(true);
    try {
      let grandTotal = 0;
      const invoiceItemsToInsert: any[] = [];

      // 1. Process items: Create new products if not matched, update existing products cost
      for (const row of parsedRows) {
        let productId = row.matchedProductId;

        if (!productId) {
          // Create new product in database
          const { data: newProd, error: newProdErr } = await supabase
            .from('products')
            .insert({
              organization_id: orgId,
              name: row.name,
              barcode: row.barcode || null,
              sku: row.sku || null,
              purchase_price: row.purchase_price,
              sales_price: row.sales_price || (row.purchase_price * 1.25),
              product_type: 'STOCK',
              item_type: 'STOCK',
              stock: 0,
              is_active: true,
              expiry_date: row.expiry_date || null
            })
            .select('id')
            .single();

          if (newProdErr) throw newProdErr;
          productId = newProd.id;
        } else {
          // Update purchase price and expiry if provided
          await supabase.from('products').update({
            purchase_price: row.purchase_price,
            ...(row.sales_price ? { sales_price: row.sales_price } : {}),
            ...(row.expiry_date ? { expiry_date: row.expiry_date } : {})
          }).eq('id', productId);
        }

        const lineTotal = row.quantity * row.purchase_price;
        grandTotal += lineTotal;

        invoiceItemsToInsert.push({
          product_id: productId,
          quantity: row.quantity,
          unit_price: row.purchase_price,
          total_price: lineTotal
        });

        // Increment stock
        try {
          await supabase.rpc('adjust_product_stock', {
            p_product_id: productId,
            p_quantity: row.quantity
          });
        } catch (e) {
          const { data: p } = await supabase.from('products').select('stock').eq('id', productId).single();
          if (p) {
            await supabase.from('products').update({ stock: (Number(p.stock) || 0) + row.quantity }).eq('id', productId);
          }
        }
      }

      // 2. Create Purchase Invoice
      const { data: createdInv, error: invErr } = await supabase
        .from('purchase_invoices')
        .insert({
          organization_id: orgId,
          supplier_id: selectedSupplierId,
          warehouse_id: selectedWarehouseId || null,
          invoice_number: invoiceNumber,
          issue_date: invoiceDate,
          total_amount: grandTotal,
          subtotal: grandTotal,
          tax_amount: 0,
          status: 'received',
          notes: `استيراد إلكتروني سريع من ملف إكسيل (${parsedRows.length} صنف)`
        })
        .select('id')
        .single();

      if (invErr) throw invErr;

      // 3. Insert Invoice Items
      const itemsPayload = invoiceItemsToInsert.map(it => ({
        ...it,
        purchase_invoice_id: createdInv.id,
        organization_id: orgId
      }));
      await supabase.from('purchase_invoice_items').insert(itemsPayload);

      showToast(`تم استيراد فاتورة المشتريات بنجاح ✅ وإضافة ${parsedRows.length} صنف للمخزن`, 'success');
      onSuccess(createdInv.id);
      onClose();
    } catch (err: any) {
      showToast('فشل استيراد الفاتورة: ' + err.message, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const totalInvoiceAmount = parsedRows.reduce((sum, r) => sum + (r.quantity * r.purchase_price), 0);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-700 to-teal-800 text-white p-5 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <FileSpreadsheet size={24} className="text-emerald-200" />
            </div>
            <div>
              <h2 className="text-lg font-black">استيراد فواتير الموردين السريعة (Excel Importer)</h2>
              <p className="text-xs text-emerald-100">ارفع ملف إكسيل المورد لإنشاء الفاتورة وتحديث المخزن والأسعار في ثوانٍ</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Supplier & Warehouse Meta */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">المورد *</label>
              <select
                value={selectedSupplierId}
                onChange={e => setSelectedSupplierId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-medium outline-none"
              >
                <option value="">-- اختر المورد --</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">مستودع الاستلام *</label>
              <select
                value={selectedWarehouseId}
                onChange={e => setSelectedWarehouseId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-medium outline-none"
              >
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">رقم فاتورة المورد</label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={e => setInvoiceNumber(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-mono outline-none"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">تاريخ الفاتورة</label>
              <input
                type="date"
                value={invoiceDate}
                onChange={e => setInvoiceDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white outline-none"
              />
            </div>
          </div>

          {step === 'upload' ? (
            /* Upload Box */
            <div className="space-y-4">
              <div className="border-2 border-dashed border-emerald-300 hover:border-emerald-500 rounded-3xl p-8 bg-emerald-50/40 hover:bg-emerald-50/80 transition-all text-center flex flex-col items-center justify-center gap-3">
                <UploadCloud size={48} className="text-emerald-600 animate-pulse" />
                <div>
                  <h3 className="font-bold text-slate-800 text-base">اسحب ملف إكسيل فاتورة المورد هنا أو اضغط للاختيار</h3>
                  <p className="text-xs text-slate-500 mt-1">يدعم ملفات (.xlsx, .xls, .csv)</p>
                </div>
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="supplier-excel-upload"
                />
                <label
                  htmlFor="supplier-excel-upload"
                  className="mt-2 bg-emerald-700 hover:bg-emerald-800 text-white px-6 py-2.5 rounded-xl font-bold text-sm cursor-pointer shadow-md hover:shadow-emerald-700/20 transition-all"
                >
                  اختيار ملف الإكسيل
                </label>
              </div>

              <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <span className="text-xs text-slate-600 font-medium">ليس لديك النموذج القياسي للموردين؟</span>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1.5 bg-emerald-100 hover:bg-emerald-200 px-3 py-2 rounded-xl transition-all"
                >
                  <Download size={14} />
                  <span>تحميل نموذج إكسيل الموردين القياسي (.xlsx)</span>
                </button>
              </div>
            </div>
          ) : (
            /* Preview Table */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-800">الأصناف المستخرجة ({parsedRows.length})</span>
                  <span className="text-xs bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full font-bold">
                    إجمالي الفاتورة: {totalInvoiceAmount.toFixed(2)} ج.م
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setStep('upload')}
                  className="text-xs font-bold text-slate-600 hover:text-slate-900"
                >
                  ← إعادة رفع ملف آخر
                </button>
              </div>

              <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-72 overflow-y-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-700 sticky top-0 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3">#</th>
                      <th className="p-3">الباركود / SKU</th>
                      <th className="p-3">اسم الصنف</th>
                      <th className="p-3 text-center">الكمية</th>
                      <th className="p-3">سعر الشراء</th>
                      <th className="p-3">سعر البيع</th>
                      <th className="p-3">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-3 font-mono text-slate-500">{idx + 1}</td>
                        <td className="p-3 font-mono">{row.barcode || row.sku || '-'}</td>
                        <td className="p-3 font-bold text-slate-800">{row.name}</td>
                        <td className="p-3 text-center font-bold text-slate-800">{row.quantity}</td>
                        <td className="p-3 font-mono text-slate-800">{row.purchase_price.toFixed(2)} ج.م</td>
                        <td className="p-3 font-mono text-emerald-700">{(row.sales_price || 0).toFixed(2)} ج.م</td>
                        <td className="p-3">
                          {row.status === 'matched' ? (
                            <span className="text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-bold border border-blue-200">
                              صنف موجود
                            </span>
                          ) : (
                            <span className="text-[11px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-bold border border-amber-200 flex items-center gap-1 w-fit">
                              <PackagePlus size={11} /> صنف جديد
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-600 font-bold text-sm hover:bg-slate-100"
          >
            إلغاء
          </button>
          {step === 'preview' && (
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={isProcessing}
              className="px-6 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm shadow-md flex items-center gap-2 disabled:opacity-50 transition-all active:scale-98"
            >
              <CheckCircle2 size={18} />
              <span>{isProcessing ? 'جاري الاستيراد والتحديث...' : 'اعتماد وحفظ الفاتورة بالمخزن'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
