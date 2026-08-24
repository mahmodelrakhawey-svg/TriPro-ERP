import React, { useState, useRef } from 'react';
import { 
    X, Upload, Camera, Sparkles, CheckCircle2, AlertCircle, 
    Loader2, Package, RefreshCw, Key, ArrowRight, Eye
} from 'lucide-react';
import { scanPurchaseInvoiceOCR } from '../services/geminiService';
import { Product, Supplier } from '../types';
import { secureStorage } from '../utils/securityMiddleware';

interface InvoiceOCRScannerModalProps {
    isOpen: boolean;
    onClose: () => void;
    products: Product[];
    suppliers: Supplier[];
    onApplyData: (data: {
        supplierId?: string;
        invoiceNumber?: string;
        date?: string;
        notes?: string;
        items: Array<{
            productId: string;
            productName: string;
            productSku?: string;
            quantity: number;
            unitPrice: number;
            total: number;
            uomId?: string;
            batchNumber?: string;
            expiryDate?: string;
        }>;
    }) => void;
}

export const InvoiceOCRScannerModal: React.FC<InvoiceOCRScannerModalProps> = ({
    isOpen,
    onClose,
    products,
    suppliers,
    onApplyData
}) => {
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [mimeType, setMimeType] = useState<string>('image/jpeg');
    const [isScanning, setIsScanning] = useState(false);
    const [scanError, setScanError] = useState<string | null>(null);
    const [parsedData, setParsedData] = useState<any | null>(null);
    const [apiKeyInput, setApiKeyInput] = useState(() => (secureStorage.getItem<string>('user_gemini_api_key') || ''));
    const [showKeyInput, setShowKeyInput] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!isOpen) return null;

    const handleSaveApiKey = () => {
        const clean = apiKeyInput.trim();
        if (clean) {
            if (!clean.startsWith('AIza')) {
                setScanError('تنبيه: مفتاح Google AI Studio الرسمي يبدأ دائماً بـ AIzaSy... يرجى التأكد من نسخه من aistudio.google.com/app/apikey');
            } else {
                setScanError(null);
            }
            secureStorage.setItem('user_gemini_api_key', clean);
            setShowKeyInput(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setMimeType(file.type || 'image/jpeg');
        const reader = new FileReader();
        reader.onload = (event) => {
            const result = event.target?.result as string;
            setImagePreview(result);
            setParsedData(null);
            setScanError(null);
        };
        reader.readAsDataURL(file);
    };

    const handleStartScan = async () => {
        if (!imagePreview) return;
        setIsScanning(true);
        setScanError(null);

        try {
            const result = await scanPurchaseInvoiceOCR(imagePreview, mimeType);
            
            // المطابقة الذكية مع الموردين
            let matchedSupplierId = '';
            if (result.supplierName && suppliers.length > 0) {
                const sName = result.supplierName.trim().toLowerCase();
                const matchedSupp = suppliers.find(s => {
                    const name = s.name.trim().toLowerCase();
                    return name.includes(sName) || sName.includes(name);
                });
                if (matchedSupp) matchedSupplierId = matchedSupp.id;
            }

            // المطابقة الذكية مع الأصناف
            const matchedItems = (result.items || []).map((extractedItem: any) => {
                const itemName = (extractedItem.productName || '').trim().toLowerCase();
                
                // البحث بالاسم أو الباركود
                const matchedProd = products.find(p => {
                    const pName = p.name.trim().toLowerCase();
                    const pSku = (p.sku || '').trim().toLowerCase();
                    const pBarcode = (p.barcode || '').trim().toLowerCase();
                    return pName === itemName || 
                           pName.includes(itemName) || 
                           itemName.includes(pName) || 
                           (extractedItem.barcode && (pBarcode === extractedItem.barcode || pSku === extractedItem.barcode));
                });

                const quantity = Math.max(1, Number(extractedItem.quantity) || 1);
                const unitPrice = Number(extractedItem.unitPrice) || Number(matchedProd?.purchase_price || matchedProd?.cost || 0);
                const total = Number(extractedItem.total) || (quantity * unitPrice);

                return {
                    productId: matchedProd ? matchedProd.id : '',
                    productName: matchedProd ? matchedProd.name : extractedItem.productName,
                    productSku: matchedProd?.sku || '',
                    quantity: quantity,
                    unitPrice: unitPrice,
                    total: total,
                    uomId: matchedProd?.purchase_uom_id || matchedProd?.base_uom_id || '',
                    isMatched: !!matchedProd
                };
            });

            setParsedData({
                ...result,
                supplierId: matchedSupplierId,
                items: matchedItems
            });

        } catch (err: any) {
            console.error("OCR Scan Error:", err);
            setScanError(err.message || 'فشل مسح الفاتورة. تأكد من وضوح الصورة ومفتاح Gemini API.');
        } finally {
            setIsScanning(false);
        }
    };

    const handleApply = () => {
        if (!parsedData) return;

        onApplyData({
            supplierId: parsedData.supplierId || undefined,
            invoiceNumber: parsedData.invoiceNumber || undefined,
            date: parsedData.invoiceDate || undefined,
            notes: parsedData.notes || 'تم استيراد الأصناف عبر المسح الذكي بالذكاء الاصطناعي (AI OCR)',
            items: parsedData.items.map((i: any) => ({
                productId: i.productId,
                productName: i.productName,
                productSku: i.productSku,
                quantity: i.quantity,
                unitPrice: i.unitPrice,
                total: i.total,
                uomId: i.uomId
            }))
        });

        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in" dir="rtl">
            <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden">
                
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-emerald-100 text-emerald-700 rounded-2xl shadow-xs">
                            <Sparkles size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                                المسح الذكي لفواتير المشتريات (AI OCR)
                                <span className="text-[11px] bg-emerald-50 text-emerald-700 font-extrabold px-2.5 py-0.5 rounded-full border border-emerald-200">
                                    Gemini Vision AI
                                </span>
                            </h3>
                            <p className="text-xs text-slate-500 font-medium">
                                التقط أو ارفع صورة الفاتورة الورقية لاستخراج الأصناف والأسعار آلياً
                            </p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setShowKeyInput(!showKeyInput)}
                            className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                            title="إعداد مفتاح Gemini API"
                        >
                            <Key size={18} />
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto flex-1 space-y-6">
                    
                    {/* Key Input Section */}
                    {showKeyInput && (
                        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2 animate-in fade-in">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-black text-amber-900 flex items-center gap-1.5">
                                    <Key size={14} /> مفتاح Google Gemini API المجاني:
                                </label>
                                <a 
                                    href="https://aistudio.google.com/app/apikey" 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="text-[11px] font-bold text-amber-700 underline hover:text-amber-900"
                                >
                                    احصل على مفتاح مجاني في دقيقة ↗
                                </a>
                            </div>
                            <div className="flex gap-2">
                                <input
                                    type="password"
                                    value={apiKeyInput}
                                    onChange={(e) => setApiKeyInput(e.target.value)}
                                    placeholder="AIzaSy..."
                                    className="flex-1 bg-white border border-amber-200 rounded-xl px-3 py-2 text-xs font-mono outline-none focus:border-amber-500"
                                />
                                <button
                                    type="button"
                                    onClick={handleSaveApiKey}
                                    className="bg-amber-600 text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-amber-700 transition-all shadow-xs"
                                >
                                    حفظ المفتاح
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 1: Upload or Preview */}
                    {!imagePreview ? (
                        <div 
                            onClick={() => fileInputRef.current?.click()}
                            className="border-2 border-dashed border-slate-200 hover:border-emerald-500 bg-slate-50 hover:bg-emerald-50/40 rounded-3xl p-10 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-4 group"
                        >
                            <input 
                                ref={fileInputRef}
                                type="file" 
                                accept="image/*,application/pdf" 
                                onChange={handleFileChange} 
                                className="hidden" 
                            />
                            <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center text-slate-400 group-hover:text-emerald-600 group-hover:scale-110 transition-all">
                                <Upload size={32} />
                            </div>
                            <div>
                                <h4 className="text-sm font-black text-slate-700 mb-1">
                                    اسحب وأفلت صورة الفاتورة هنا، أو انقر للاختيار
                                </h4>
                                <p className="text-xs text-slate-400 font-medium">
                                    يدعم صور الكاميرا والمستندات (JPG, PNG, WebP)
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Image Preview Toolbar */}
                            <div className="flex items-center justify-between bg-slate-50 p-3 rounded-2xl border border-slate-200">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-slate-600">معاينة الفاتورة المحملة</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => { setImagePreview(null); setParsedData(null); }}
                                        className="text-xs font-bold text-rose-600 hover:bg-rose-50 px-3 py-1.5 rounded-xl transition-all"
                                    >
                                        تغيير الصورة
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleStartScan}
                                        disabled={isScanning}
                                        className="bg-emerald-600 text-white text-xs font-black px-4 py-2 rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-xs flex items-center gap-2"
                                    >
                                        {isScanning ? (
                                            <>
                                                <Loader2 size={14} className="animate-spin" />
                                                جاري الفحص بالذكاء الاصطناعي...
                                            </>
                                        ) : (
                                            <>
                                                <Sparkles size={14} />
                                                بدء الفحص والاستخراج
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Image Viewer */}
                            <div className="max-h-56 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 flex items-center justify-center">
                                <img src={imagePreview} alt="Invoice preview" className="object-contain max-h-56 w-full" />
                            </div>
                        </div>
                    )}

                    {/* Error Banner */}
                    {scanError && (
                        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-3 text-xs text-rose-700 font-bold animate-in fade-in">
                            <AlertCircle size={18} className="shrink-0 text-rose-600" />
                            <span>{scanError}</span>
                        </div>
                    )}

                    {/* Step 2: Parsed Data Results */}
                    {parsedData && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                            <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                                <div>
                                    <span className="text-slate-500 font-bold block mb-1">المورد المستخرج:</span>
                                    <span className="font-black text-emerald-900 text-sm">
                                        {parsedData.supplierName || 'غير محدد'}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-slate-500 font-bold block mb-1">رقم الفاتورة والتاريخ:</span>
                                    <span className="font-black text-slate-800">
                                        {parsedData.invoiceNumber || '-'} ({parsedData.invoiceDate || 'اليوم'})
                                    </span>
                                </div>
                                <div>
                                    <span className="text-slate-500 font-bold block mb-1">إجمالي الفاتورة:</span>
                                    <span className="font-black text-emerald-800 text-sm font-mono" dir="ltr">
                                        {Number(parsedData.totalAmount || 0).toLocaleString()} EGP
                                    </span>
                                </div>
                            </div>

                            {/* Items Table */}
                            <div className="border border-slate-200 rounded-2xl overflow-hidden">
                                <div className="bg-slate-100 px-4 py-2.5 text-xs font-black text-slate-600 border-b border-slate-200 flex justify-between items-center">
                                    <span>الأصناف المستخرجة ({parsedData.items?.length || 0})</span>
                                    <span className="text-[11px] text-slate-400 font-normal">تمت مطابقة الأصناف مع دليلك تلقائياً</span>
                                </div>
                                <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 text-xs">
                                    {parsedData.items?.map((item: any, idx: number) => (
                                        <div key={idx} className="p-3 flex items-center justify-between gap-3 hover:bg-slate-50">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-black text-slate-800 truncate">{item.productName}</span>
                                                    {item.isMatched ? (
                                                        <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0">
                                                            <CheckCircle2 size={10} /> صنف متطابق
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-md shrink-0">
                                                            صنف جديد
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4 text-left font-mono shrink-0" dir="ltr">
                                                <span className="text-slate-500">{item.quantity} × {item.unitPrice.toLocaleString()}</span>
                                                <span className="font-black text-slate-800 w-20 text-right">{item.total.toLocaleString()} EGP</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors"
                    >
                        إلغاء
                    </button>

                    {parsedData && (
                        <button
                            type="button"
                            onClick={handleApply}
                            className="bg-emerald-600 text-white px-6 py-2.5 rounded-xl text-xs font-black hover:bg-emerald-700 transition-all shadow-md flex items-center gap-2"
                        >
                            <CheckCircle2 size={16} />
                            اعتماد وتعبئة الفاتورة الآن
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default InvoiceOCRScannerModal;
