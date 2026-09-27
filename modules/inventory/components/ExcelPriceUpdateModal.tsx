import React, { useState, useRef } from 'react';
import { 
  X, Upload, Download, FileSpreadsheet, CheckCircle, 
  AlertTriangle, Loader2, Tag, ShieldCheck, ArrowRight,
  RefreshCw, Info, ChevronDown, ChevronUp
} from 'lucide-react';
import { 
  exportPriceListForUpdate, 
  downloadPriceUpdateTemplate, 
  updateProductPricesFromExcel,
  type PriceUpdateResult 
} from '../utils/productExcelUtils';

interface ExcelPriceUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetOrgId?: string | null;
  currentUser: any;
  queryClient: any;
  refreshData: () => Promise<void>;
  refresh?: () => Promise<void> | void;
  showToast: (msg: string, type?: string) => void;
}

export const ExcelPriceUpdateModal: React.FC<ExcelPriceUpdateModalProps> = ({
  isOpen,
  onClose,
  targetOrgId,
  currentUser,
  queryClient,
  refreshData,
  refresh,
  showToast,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [result, setResult] = useState<PriceUpdateResult | null>(null);
  const [showUnmatched, setShowUnmatched] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
      setResult(null);
    }
  };

  const handleExportPrices = async () => {
    await exportPriceListForUpdate({
      targetOrgId,
      showToast,
      setIsExporting
    });
  };

  const handleDownloadTemplate = () => {
    downloadPriceUpdateTemplate();
    showToast('تم تحميل نموذج تعديل الأسعار الفارغ بنجاح', 'success');
  };

  const handleStartUpdate = async () => {
    if (!selectedFile) {
      showToast('يرجى اختيار ملف Excel أولاً!', 'warning');
      return;
    }

    const res = await updateProductPricesFromExcel({
      file: selectedFile,
      currentUser,
      currentSelectedOrgId: targetOrgId || null,
      queryClient,
      refreshData,
      refresh,
      showToast,
      setIsUpdating
    });

    if (res) {
      setResult(res);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setResult(null);
    setShowUnmatched(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[70] p-4 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-100 animate-in zoom-in-95">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-600 via-amber-500 to-orange-500 p-5 text-white flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-sm">
              <Tag size={24} className="text-white" />
            </div>
            <div>
              <h3 className="font-black text-lg">تحديث أسعار البيع من Excel</h3>
              <p className="text-xs text-amber-100">تحديث أسعار أصناف الشركة الحالية فقط بدون أي تكرار ودون المساس بالمخزون</p>
            </div>
          </div>
          <button 
            onClick={handleClose} 
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Safety Banner */}
        <div className="bg-emerald-50 border-b border-emerald-200 px-5 py-2.5 flex items-center gap-2 text-xs text-emerald-800 font-bold">
          <ShieldCheck size={18} className="text-emerald-600 flex-shrink-0" />
          <span>درع الأمان مفعل: لن يتم إنشاء أي صنف مكرر، ولن تتأثر الكميات أو التكاليف أو القيود المحاسبية نهائياً.</span>
        </div>

        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          
          {/* Step 1: Export / Prepare Sheet */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-slate-800 font-black text-sm">
              <span className="w-6 h-6 rounded-full bg-amber-600 text-white flex items-center justify-center text-xs">1</span>
              <span>الخطوة الأولى: تجهيز ملف الأسعار</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed pr-8">
              يمكنك تصدير ملف يحتوي على كافة أصناف الشركة الحالية وأسعارها بضغطة زر واحدة، ثم تعديل عمود <strong>"سعر البيع الجديد"</strong> فقط وحفظ الملف.
            </p>
            <div className="flex flex-wrap gap-2 pr-8 pt-1">
              <button
                type="button"
                onClick={handleExportPrices}
                disabled={isExporting}
                className="bg-white border border-amber-300 text-amber-800 hover:bg-amber-50 px-3.5 py-2 rounded-lg text-xs font-black flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
              >
                {isExporting ? <Loader2 size={15} className="animate-spin text-amber-600" /> : <FileSpreadsheet size={15} className="text-amber-600" />}
                <span>{isExporting ? 'جاري التصدير...' : 'تصدير شيت أصناف الشركة الحالية (موصى به)'}</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all"
              >
                <Download size={14} />
                <span>تحميل نموذج فارغ</span>
              </button>
            </div>
          </div>

          {/* Step 2: Upload and Apply */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-slate-800 font-black text-sm">
              <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs">2</span>
              <span>الخطوة الثانية: رفع الملف وتحديث الأسعار</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed pr-8">
              يقوم النظام بمطابقة كل صنف في الملف تلقائياً بالاعتماد على: <strong>كود الصنف (SKU)</strong> أولاً، ثم <strong>الباركود</strong>، ثم <strong>اسم الصنف</strong>.
            </p>

            <div className="pr-8 pt-1">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv, .json"
                onChange={handleFileChange}
                disabled={isUpdating}
                className="hidden"
                id="price-update-file-input"
              />
              <label
                htmlFor="price-update-file-input"
                className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-all ${
                  selectedFile 
                    ? 'border-emerald-400 bg-emerald-50/50' 
                    : 'border-slate-300 hover:border-amber-400 bg-white hover:bg-amber-50/20'
                }`}
              >
                <Upload size={28} className={selectedFile ? 'text-emerald-600' : 'text-slate-400'} />
                <span className="text-xs font-bold mt-2 text-slate-700">
                  {selectedFile ? selectedFile.name : 'اضغط هنا لاختيار ملف Excel المعدل (.xlsx, .xls, .csv)'}
                </span>
                {selectedFile && (
                  <span className="text-[11px] text-emerald-700 font-bold mt-0.5">
                    الحجم: {(selectedFile.size / 1024).toFixed(1)} ك.ب — جاهز للتحديث
                  </span>
                )}
              </label>
            </div>

            {selectedFile && !result && (
              <div className="pr-8 pt-2">
                <button
                  type="button"
                  onClick={handleStartUpdate}
                  disabled={isUpdating}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50"
                >
                  {isUpdating ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>جاري مطابقة وتحديث الأسعار في قاعدة البيانات...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw size={18} />
                      <span>تطبيق وتحديث أسعار البيع الآن</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Results Summary */}
          {result && (
            <div className="bg-white border-2 border-emerald-200 rounded-xl p-4 space-y-3 animate-in fade-in">
              <div className="flex items-center gap-2 text-emerald-800 font-black text-sm">
                <CheckCircle size={20} className="text-emerald-600" />
                <span>تقرير اكتمال عملية تحديث الأسعار</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center pt-1">
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <div className="text-xs text-slate-500 font-bold">إجمالي الأسطر</div>
                  <div className="text-base font-black text-slate-800">{result.totalRows}</div>
                </div>
                <div className="bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
                  <div className="text-xs text-emerald-600 font-bold">تم تحديث السعر</div>
                  <div className="text-base font-black text-emerald-700">{result.updatedCount}</div>
                </div>
                <div className="bg-blue-50 p-2.5 rounded-lg border border-blue-200">
                  <div className="text-xs text-blue-600 font-bold">نفس السعر السابق</div>
                  <div className="text-base font-black text-blue-700">{result.unchangedCount}</div>
                </div>
                <div className={`p-2.5 rounded-lg border ${result.unmatched.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                  <div className={`text-xs font-bold ${result.unmatched.length > 0 ? 'text-amber-600' : 'text-slate-500'}`}>غير مطابق</div>
                  <div className={`text-base font-black ${result.unmatched.length > 0 ? 'text-amber-700' : 'text-slate-800'}`}>{result.unmatched.length}</div>
                </div>
              </div>

              {/* Unmatched Details Accordion */}
              {result.unmatched.length > 0 && (
                <div className="pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowUnmatched(!showUnmatched)}
                    className="flex items-center justify-between w-full text-xs font-bold text-amber-800 hover:text-amber-900 bg-amber-50/70 p-2 rounded-lg"
                  >
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle size={14} className="text-amber-600" />
                      عرض الأصناف التي لم يتم العثور عليها ({result.unmatched.length} صنف)
                    </span>
                    {showUnmatched ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {showUnmatched && (
                    <div className="mt-2 max-h-40 overflow-y-auto border border-amber-200 rounded-lg p-2 bg-amber-50/30 text-[11px] space-y-1">
                      {result.unmatched.map((u, idx) => (
                        <div key={idx} className="flex justify-between items-center border-b border-amber-100 pb-1 text-slate-700">
                          <span className="font-bold">{u.name || 'بدون اسم'}</span>
                          <span className="text-slate-400 font-mono">{u.sku ? `SKU: ${u.sku}` : u.barcode ? `Barcode: ${u.barcode}` : '-'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-3.5 flex justify-end gap-2">
          {result ? (
            <button
              type="button"
              onClick={handleClose}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-xl text-xs font-black shadow-sm transition-all"
            >
              إغلاق وحفظ
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleClose}
                disabled={isUpdating}
                className="bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
              >
                إلغاء
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  );
};

export default ExcelPriceUpdateModal;
