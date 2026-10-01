import { logger } from '../../../utils/logger';
import React, { useState, useRef } from 'react';
import {
  X, Upload, FileSpreadsheet, CheckCircle, AlertTriangle,
  Loader2, RefreshCw, Layers, ArrowRight, Check, AlertCircle
} from 'lucide-react';
import { useToast } from '../../../context/ToastContext';
import {
  parseBOMExcelFile,
  applyBOMImportUpdates,
  type ParseBOMResult,
  type ParsedBOMRow
} from '../utils/bomExportUtils';

interface BOMImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
  allProducts: any[];
  onSuccess: () => void;
}

export const BOMImportModal: React.FC<BOMImportModalProps> = ({
  isOpen,
  onClose,
  orgId,
  allProducts,
  onSuccess,
}) => {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [parseResult, setParseResult] = useState<ParseBOMResult | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'modified' | 'errors'>('all');
  const [selectedSheet, setSelectedSheet] = useState<string>('');

  if (!isOpen) return null;

  const handleFileSelect = async (file: File) => {
    setSelectedFile(file);
    setParsing(true);
    try {
      const res = await parseBOMExcelFile(file, allProducts);
      setParseResult(res);
      setSelectedSheet(res.sheetName);
      if (res.modifiedRows > 0) {
        setActiveTab('modified');
      } else {
        setActiveTab('all');
      }
    } catch (err) {
      logger.error(err);
      showToast('فشل قراءة ملف الإكسيل: ' + err.message, 'error');
      setParseResult(null);
    } finally {
      setParsing(false);
    }
  };

  const handleSheetChange = async (sheetName: string) => {
    if (!selectedFile) return;
    setSelectedSheet(sheetName);
    setParsing(true);
    try {
      const res = await parseBOMExcelFile(selectedFile, allProducts, sheetName);
      setParseResult(res);
    } catch (err) {
      showToast('خطأ في قراءة الورقة المختارة: ' + err.message, 'error');
    } finally {
      setParsing(false);
    }
  };

  const handleApplyUpdates = async () => {
    if (!parseResult || parseResult.validRows === 0) {
      showToast('لا توجد سجلات صالحة لتطبيقها', 'warning');
      return;
    }

    const validRows = parseResult.rows.filter(r => r.status === 'valid');
    setApplying(true);
    try {
      const result = await applyBOMImportUpdates(validRows, orgId, allProducts);
      showToast(result.message, 'success');
      onSuccess();
      handleClose();
    } catch (err) {
      logger.error(err);
      showToast('فشل تطبيق التعديلات: ' + err.message, 'error');
    } finally {
      setApplying(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setParseResult(null);
    setActiveTab('all');
    setSelectedSheet('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  // تصفية السجلات بناءً على التبويب النشط
  const displayedRows = (parseResult?.rows || []).filter(r => {
    if (activeTab === 'modified') return r.status === 'valid' && r.isModified;
    if (activeTab === 'errors') return r.status !== 'valid';
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in" dir="rtl">
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden border border-slate-100">
        
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
              <FileSpreadsheet size={24} />
            </div>
            <div>
              <h3 className="font-bold text-lg flex items-center gap-2">
                استيراد وتحديث المقادير من شيت Excel المعتمد
              </h3>
              <p className="text-xs text-slate-300">
                تحديث مقادير الأصناف التامة والوسيطة دفعة واحدة ومزامنة شجرة المواد والتكاليف تلقائياً
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50/50">
          
          {/* File Upload Zone */}
          {!parseResult && (
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-indigo-200 hover:border-indigo-500 bg-indigo-50/30 hover:bg-indigo-50/60 rounded-2xl p-10 text-center cursor-pointer transition-all group"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelect(f);
                  }}
                />
                <div className="w-16 h-16 mx-auto mb-4 bg-white rounded-2xl shadow-sm border border-indigo-100 flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform">
                  {parsing ? <Loader2 className="animate-spin" size={30} /> : <Upload size={30} />}
                </div>
                <h4 className="text-base font-bold text-slate-800 mb-1">
                  {parsing ? 'جاري قراءة وتحليل ملف الإكسيل...' : 'اضغط لاختيار شيت الإكسيل المعتمد أو اسحب الملف هنا'}
                </h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  يدعم شيت المراجعة الشامل (Master BOM) أو بطاقة مراجعة الصنف المصدرة من البرنامج، أو أي شيت إكسيل يحتوي على مسميات الأصناف ومقاديرها.
                </p>
              </div>

              {/* Instructions Callout */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 space-y-1.5">
                <p className="font-bold flex items-center gap-1.5 text-amber-800">
                  <CheckCircle size={15} /> كيف يتعرف النظام على تعديلات مسؤول التصنيع في الشيت؟
                </p>
                <ul className="list-disc list-inside space-y-1 text-slate-700">
                  <li>إذا دوّن مسؤول التصنيع أرقاماً جديدة في عمود <strong>«الكمية الفعلية المقترحة»</strong>، سيعتمدها النظام تلقائياً.</li>
                  <li>إذا قام بتعديل الأرقام مباشرة في عمود <strong>«الكمية المسجلة بالبرنامج»</strong>، سيتعرف عليها النظام ويحدثها.</li>
                  <li>لا حاجة لإعادة إدخال الأسماء أو الأكواد يدوياً، النظام يطابق المواد والأصناف تلقائياً بالكود والاسم.</li>
                </ul>
              </div>
            </div>
          )}

          {/* Parsed Results View */}
          {parseResult && (
            <div className="space-y-4">
              
              {/* Sheet & Stats Bar */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                    <FileSpreadsheet size={20} />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-sm">{selectedFile?.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-slate-500">ورقة العمل:</span>
                      {parseResult.availableSheets.length > 1 ? (
                        <select
                          value={selectedSheet}
                          onChange={(e) => handleSheetChange(e.target.value)}
                          className="text-xs border rounded px-2 py-0.5 bg-slate-50 font-medium text-slate-700 outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          {parseResult.availableSheets.map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs font-bold text-indigo-700">{selectedSheet}</span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleReset}
                  className="text-xs text-slate-500 hover:text-red-600 flex items-center gap-1 transition-colors px-2.5 py-1 rounded-lg hover:bg-slate-100"
                >
                  <RefreshCw size={12} /> اختيار ملف آخر
                </button>
              </div>

              {/* Stat Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                  <p className="text-xs text-slate-500 font-medium">إجمالي السجلات المقروءة</p>
                  <p className="text-xl font-bold text-slate-800 mt-1">{parseResult.totalRows}</p>
                </div>
                <div className="bg-white p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/30">
                  <p className="text-xs text-emerald-700 font-medium">سجلات جاهزة للتطبيق</p>
                  <p className="text-xl font-bold text-emerald-600 mt-1">{parseResult.validRows}</p>
                </div>
                <div className="bg-white p-3.5 rounded-xl border border-amber-200 bg-amber-50/30">
                  <p className="text-xs text-amber-800 font-medium">مقادير تم تعديل كمياتها 🔄</p>
                  <p className="text-xl font-bold text-amber-700 mt-1">{parseResult.modifiedRows}</p>
                </div>
                <div className="bg-white p-3.5 rounded-xl border border-red-200 bg-red-50/30">
                  <p className="text-xs text-red-700 font-medium">تنبيهات وأصناف غير مطابقة</p>
                  <p className="text-xl font-bold text-red-600 mt-1">
                    {parseResult.totalRows - parseResult.validRows}
                  </p>
                </div>
              </div>

              {/* Tabs for Filtering Preview */}
              <div className="flex gap-2 border-b border-slate-200 pb-2">
                <button
                  onClick={() => setActiveTab('all')}
                  className={`text-xs px-3.5 py-1.5 rounded-lg font-bold transition-all ${
                    activeTab === 'all'
                      ? 'bg-slate-800 text-white shadow-sm'
                      : 'bg-white text-slate-600 border hover:bg-slate-100'
                  }`}
                >
                  كافة السجلات ({parseResult.totalRows})
                </button>
                <button
                  onClick={() => setActiveTab('modified')}
                  className={`text-xs px-3.5 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                    activeTab === 'modified'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'bg-white text-slate-600 border hover:bg-amber-50'
                  }`}
                >
                  <span>التعديلات الجديدة فقط 🔄</span>
                  <span className="px-1.5 py-0.2 bg-white/20 rounded-full text-[10px]">
                    {parseResult.modifiedRows}
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab('errors')}
                  className={`text-xs px-3.5 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                    activeTab === 'errors'
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'bg-white text-slate-600 border hover:bg-red-50'
                  }`}
                >
                  <span>التنبيهات والأخطاء ⚠️</span>
                  <span className="px-1.5 py-0.2 bg-white/20 rounded-full text-[10px]">
                    {parseResult.totalRows - parseResult.validRows}
                  </span>
                </button>
              </div>

              {/* Data Preview Table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 text-slate-600 font-bold sticky top-0 border-b">
                      <tr>
                        <th className="p-2.5">السطر</th>
                        <th className="p-2.5">المنتج المصنع / الوسيط</th>
                        <th className="p-2.5">المرحلة</th>
                        <th className="p-2.5">المادة الخام / المكون</th>
                        <th className="p-2.5 text-center">الكمية المسجلة</th>
                        <th className="p-2.5 text-center">الكمية المعتمدة الجديدة</th>
                        <th className="p-2.5 text-center">الفرق</th>
                        <th className="p-2.5">الحالة والتقييم</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {displayedRows.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-6 text-center text-slate-400">
                            لا توجد سجلات تطابق الفلتر المختار.
                          </td>
                        </tr>
                      ) : (
                        displayedRows.map((r, idx) => {
                          const diff = r.newQty - r.oldQty;
                          const isError = r.status !== 'valid';

                          return (
                            <tr
                              key={idx}
                              className={`hover:bg-slate-50/80 transition-colors ${
                                isError
                                  ? 'bg-red-50/40 text-red-900'
                                  : r.isModified
                                    ? 'bg-amber-50/30'
                                    : ''
                              }`}
                            >
                              <td className="p-2.5 text-slate-400 font-mono">{r.rowNum}</td>
                              <td className="p-2.5 font-bold text-slate-800">
                                <div>{r.productName}</div>
                                {r.productSku && (
                                  <div className="text-[10px] text-slate-400 font-normal">{r.productSku}</div>
                                )}
                              </td>
                              <td className="p-2.5 text-slate-600">{r.stepName}</td>
                              <td className="p-2.5 font-medium text-slate-700">
                                <div>{r.materialName}</div>
                                {r.materialSku && (
                                  <div className="text-[10px] text-slate-400 font-normal">{r.materialSku}</div>
                                )}
                              </td>
                              <td className="p-2.5 text-center font-mono text-slate-500">
                                {r.oldQty}
                              </td>
                              <td className="p-2.5 text-center font-mono font-bold text-indigo-700">
                                {r.newQty}
                              </td>
                              <td className="p-2.5 text-center font-mono font-bold">
                                {r.isModified ? (
                                  <span className={diff > 0 ? 'text-amber-600' : 'text-emerald-600'}>
                                    {diff > 0 ? `+${diff.toFixed(4)}` : diff.toFixed(4)}
                                  </span>
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </td>
                              <td className="p-2.5">
                                {isError ? (
                                  <span className="inline-flex items-center gap-1 text-red-600 font-bold">
                                    <AlertCircle size={13} /> {r.statusMessage}
                                  </span>
                                ) : r.isModified ? (
                                  <span className="inline-flex items-center gap-1 text-amber-700 font-bold bg-amber-100 px-2 py-0.5 rounded-full">
                                    <RefreshCw size={11} className="animate-spin-slow" /> تعديل كمية
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                                    <Check size={13} /> مطابق
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-white border-t border-slate-200 flex justify-between items-center shrink-0">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
          >
            إلغاء
          </button>

          {parseResult && (
            <button
              type="button"
              onClick={handleApplyUpdates}
              disabled={applying || parseResult.validRows === 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-2 rounded-xl disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all text-sm"
            >
              {applying ? (
                <>
                  <Loader2 className="animate-spin" size={16} />
                  <span>جاري تحديث المقادير ومزامنة التكاليف...</span>
                </>
              ) : (
                <>
                  <CheckCircle size={16} />
                  <span>
                    تأكيد وتطبيق التعديلات ({parseResult.validRows} مقدار)
                  </span>
                </>
              )}
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
