import React, { useState } from 'react';
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle, ArrowRight, Download, RefreshCw, X, PackagePlus, ShoppingCart } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useToast } from '../../../context/ToastContext';

interface ParsedSalesRow {
  barcode?: string;
  sku?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  matchedProductId?: string;
  matchedProductName?: string;
  matchedProductSku?: string;
  uomId?: string;
  status: 'matched' | 'unmatched';
}

interface SalesInvoiceExcelImporterProps {
  isOpen: boolean;
  onClose: () => void;
  onImportItems: (items: any[]) => void;
  products: any[];
  uoms: any[];
  pricingTier?: 'retail' | 'wholesale' | 'half';
  currency?: string;
}

export const SalesInvoiceExcelImporter: React.FC<SalesInvoiceExcelImporterProps> = ({
  isOpen,
  onClose,
  onImportItems,
  products,
  uoms,
  pricingTier = 'retail',
  currency = 'EGP'
}) => {
  const { showToast } = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedSalesRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<'upload' | 'preview'>('upload');

  if (!isOpen) return null;

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        'الباركود (Barcode)': '6221000123456',
        'كود الصنف (SKU)': 'PROD-001',
        'اسم الصنف (Item Name)': 'شاي العروسة 250 جم',
        'الكمية (Qty)': 10,
        'سعر البيع (Price)': 35.00
      },
      {
        'الباركود (Barcode)': '6221000789012',
        'كود الصنف (SKU)': 'PROD-002',
        'اسم الصنف (Item Name)': 'سكر أبيض 1 كجم',
        'الكمية (Qty)': 50,
        'سعر البيع (Price)': 28.50
      },
      {
        'الباركود (Barcode)': '',
        'كود الصنف (SKU)': 'PROD-003',
        'اسم الصنف (Item Name)': 'زيت نباتي 800 مل',
        'الكمية (Qty)': 20,
        'سعر البيع (Price)': ''
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "نموذج_فاتورة_المبيعات");
    XLSX.writeFile(wb, "Sales_Invoice_Items_Template.xlsx");
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

          // Build index for quick product matching
          const productMapByBarcode = new Map<string, any>();
          const productMapBySku = new Map<string, any>();
          const productMapByName = new Map<string, any>();

          (products || []).forEach(p => {
            if (p.barcode) productMapByBarcode.set(p.barcode.trim().toLowerCase(), p);
            if (p.barcode2) productMapByBarcode.set(p.barcode2.trim().toLowerCase(), p);
            if (Array.isArray(p.unit_barcodes)) {
              p.unit_barcodes.forEach((ub: { barcode?: string }) => {
                if (ub.barcode) productMapByBarcode.set(ub.barcode.trim().toLowerCase(), p);
              });
            }
            if (p.sku) productMapBySku.set(p.sku.trim().toLowerCase(), p);
            if (p.name) productMapByName.set(p.name.trim().toLowerCase(), p);
          });

          const rows: ParsedSalesRow[] = rawData.map(row => {
            const barcode = String(row['الباركود (Barcode)'] || row['الباركود'] || row['Barcode'] || row['barcode'] || '').trim();
            const sku = String(row['كود الصنف (SKU)'] || row['كود الصنف'] || row['SKU'] || row['sku'] || '').trim();
            const name = String(row['اسم الصنف (Item Name)'] || row['اسم الصنف'] || row['الصنف'] || row['Name'] || row['name'] || '').trim();
            const quantity = Math.max(0.01, Number(row['الكمية (Qty)'] || row['الكمية'] || row['Qty'] || row['quantity'] || 1) || 1);
            let explicitPrice = Number(row['سعر البيع (Price)'] || row['سعر البيع'] || row['السعر'] || row['Price'] || row['price'] || 0);

            // Match product
            let matchedProduct: Record<string, any> | null = null;
            if (barcode) matchedProduct = productMapByBarcode.get(barcode.toLowerCase());
            if (!matchedProduct && sku) matchedProduct = productMapBySku.get(sku.toLowerCase());
            if (!matchedProduct && name) matchedProduct = productMapByName.get(name.toLowerCase());

            let unitPrice = explicitPrice;
            if ((!unitPrice || unitPrice <= 0) && matchedProduct) {
              if (pricingTier === 'wholesale') {
                unitPrice = Number(matchedProduct.wholesale_price || matchedProduct.wholesalePrice || matchedProduct.sales_price || matchedProduct.price || 0);
              } else if (pricingTier === 'half') {
                unitPrice = Number(matchedProduct.half_wholesale_price || matchedProduct.halfWholesalePrice || matchedProduct.sales_price || matchedProduct.price || 0);
              } else {
                unitPrice = Number(matchedProduct.sales_price || matchedProduct.price || 0);
              }
            }

            const total = Number((quantity * unitPrice).toFixed(4));

            return {
              barcode: barcode || undefined,
              sku: sku || undefined,
              name: name || (matchedProduct?.name || 'صنف غير محدد'),
              quantity,
              unitPrice,
              total,
              matchedProductId: matchedProduct?.id,
              matchedProductName: matchedProduct?.name,
              matchedProductSku: matchedProduct?.sku,
              uomId: matchedProduct?.sale_uom_id || matchedProduct?.base_uom_id || '',
              status: matchedProduct ? 'matched' : 'unmatched'
            };
          });

          setParsedRows(rows);
          setStep('preview');
          setIsProcessing(false);
          showToast(`تم استيراد ${rows.length} صنف بنجاح!`, 'success');
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          showToast('حدث خطأ أثناء قراءة ملف الإكسيل: ' + errMsg, 'error');
          setIsProcessing(false);
        }
      };
      reader.readAsBinaryString(uploadedFile);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      showToast('تعذر معالجة الملف: ' + errMsg, 'error');
      setIsProcessing(false);
    }
  };

  const handleApplyToInvoice = () => {
    const validRows = parsedRows.filter(r => r.status === 'matched' && r.matchedProductId);
    if (validRows.length === 0) {
      showToast('لا توجد أصناف متطابقة مع قاعدة بيانات النظام لإضافتها!', 'error');
      return;
    }

    const itemsToAdd = validRows.map((r, idx) => ({
      id: `${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`,
      productId: r.matchedProductId,
      product_id: r.matchedProductId,
      productName: r.matchedProductName || r.name,
      product_name: r.matchedProductName || r.name,
      productSku: r.matchedProductSku || r.sku || '',
      product_sku: r.matchedProductSku || r.sku || '',
      quantity: r.quantity,
      unitPrice: r.unitPrice,
      unit_price: r.unitPrice,
      uomId: r.uomId || '',
      total: r.total
    }));

    onImportItems(itemsToAdd);
    showToast(`تمت إضافة ${itemsToAdd.length} صنف إلى الفاتورة بنجاح ✅`, 'success');
    onClose();
  };

  const matchedCount = parsedRows.filter(r => r.status === 'matched').length;
  const unmatchedCount = parsedRows.filter(r => r.status === 'unmatched').length;
  const totalQuantity = parsedRows.reduce((sum, r) => sum + r.quantity, 0);
  const totalAmount = parsedRows.reduce((sum, r) => sum + r.total, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95">
        
        {/* Header */}
        <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <FileSpreadsheet size={24} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900">استيراد بنود الفاتورة من ملف Excel</h3>
              <p className="text-xs text-slate-500 font-bold">إدراج حتى 500+ صنف دفعة واحدة بسرعة فائقة</p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="w-9 h-9 rounded-full bg-slate-200/60 hover:bg-red-50 hover:text-red-500 flex items-center justify-center text-slate-500 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {step === 'upload' ? (
            <div className="space-y-6">
              {/* Instructions & Template download */}
              <div className="bg-blue-50 border border-blue-200 p-5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="font-bold text-blue-900 text-sm">💡 تعليمات استيراد الفاتورة:</h4>
                  <p className="text-xs text-blue-700">
                    يمكنك استيراد مئات الأصناف دفعة واحدة. يجب أن يتضمن الملف عموداً للـ (الباركود أو كود الصنف SKU أو اسم الصنف) بالإضافة إلى الكمية.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl shadow-md flex items-center gap-2 shrink-0 transition-all"
                >
                  <Download size={16} /> تحميل نموذج Excel جاهز
                </button>
              </div>

              {/* Upload Zone */}
              <label className="border-2 border-dashed border-slate-300 hover:border-emerald-500 hover:bg-emerald-50/20 rounded-3xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all group">
                <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform mb-3">
                  <UploadCloud size={32} />
                </div>
                <span className="font-black text-slate-800 text-base mb-1">
                  {file ? file.name : 'اضغط لاختيار ملف Excel أو اسحبه وأفلته هنا'}
                </span>
                <span className="text-xs text-slate-400 font-bold">
                  يدعم صيغ (.xlsx, .xls, .csv) حتى آلاف الأصناف
                </span>
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={isProcessing}
                />
              </label>

              {isProcessing && (
                <div className="text-center py-6">
                  <RefreshCw size={24} className="animate-spin text-emerald-600 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-600">جاري قراءة الملف ومطابقة الأصناف مع المخزون...</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Summary Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                  <span className="text-[10px] font-bold text-slate-400 block mb-1">إجمالي الأصناف</span>
                  <span className="text-lg font-black text-slate-800">{parsedRows.length} صنف</span>
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl">
                  <span className="text-[10px] font-bold text-emerald-600 block mb-1">متطابق في النظام ✅</span>
                  <span className="text-lg font-black text-emerald-700">{matchedCount} صنف</span>
                </div>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl">
                  <span className="text-[10px] font-bold text-amber-600 block mb-1">غير متطابق ⚠️</span>
                  <span className="text-lg font-black text-amber-700">{unmatchedCount} صنف</span>
                </div>
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl">
                  <span className="text-[10px] font-bold text-blue-600 block mb-1">إجمالي القيمة المقدرة</span>
                  <span className="text-lg font-black text-blue-700">{totalAmount.toLocaleString()} {currency}</span>
                </div>
              </div>

              {unmatchedCount > 0 && (
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex items-center gap-2 text-xs text-amber-800 font-bold">
                  <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                  <span>تنبيه: يوجد {unmatchedCount} صنف غير مسجل في بطاقة الأصناف، لن تتم إضافتها للفاتورة حتى يتم تعريفها.</span>
                </div>
              )}

              {/* Items Preview Table */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-72 overflow-y-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold sticky top-0">
                    <tr>
                      <th className="p-2.5">#</th>
                      <th className="p-2.5">الصنف بالملف</th>
                      <th className="p-2.5">المطابقة في النظام</th>
                      <th className="p-2.5 text-center">الكمية</th>
                      <th className="p-2.5 text-center">السعر</th>
                      <th className="p-2.5 text-center">الإجمالي</th>
                      <th className="p-2.5 text-center">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedRows.slice(0, 100).map((r, idx) => (
                      <tr key={idx} className={r.status === 'matched' ? 'hover:bg-slate-50' : 'bg-amber-50/30'}>
                        <td className="p-2.5 text-slate-400 font-mono">{idx + 1}</td>
                        <td className="p-2.5 font-bold text-slate-800">
                          <div>{r.name}</div>
                          {(r.barcode || r.sku) && (
                            <span className="text-[10px] text-slate-400 font-mono">{r.barcode || r.sku}</span>
                          )}
                        </td>
                        <td className="p-2.5">
                          {r.status === 'matched' ? (
                            <span className="text-emerald-700 font-bold">{r.matchedProductName}</span>
                          ) : (
                            <span className="text-slate-400 italic">غير موجود بالنظام</span>
                          )}
                        </td>
                        <td className="p-2.5 text-center font-bold text-slate-900">{r.quantity}</td>
                        <td className="p-2.5 text-center font-mono">{r.unitPrice.toLocaleString()}</td>
                        <td className="p-2.5 text-center font-black text-slate-900">{r.total.toLocaleString()}</td>
                        <td className="p-2.5 text-center">
                          {r.status === 'matched' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">جاهز ✅</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800">تجاهل ❌</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsedRows.length > 100 && (
                <p className="text-[10px] text-center text-slate-400 font-bold">
                  (يتم عرض أول 100 صنف في المعاينة، وسيتم استيراد كافة الـ {parsedRows.length} صنف بالكامل للفاتورة)
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-5 bg-slate-50 border-t border-slate-100 flex justify-between items-center shrink-0">
          {step === 'preview' ? (
            <>
              <button
                type="button"
                onClick={() => setStep('upload')}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                تغيير الملف
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleApplyToInvoice}
                  disabled={matchedCount === 0}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-lg shadow-emerald-600/20 flex items-center gap-2 transition-all"
                >
                  <ShoppingCart size={16} /> إدراج {matchedCount} صنف في الفاتورة الآن
                </button>
              </div>
            </>
          ) : (
            <div className="flex justify-end w-full">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 transition-colors"
              >
                إغلاق
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default SalesInvoiceExcelImporter;
