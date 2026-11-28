import React from 'react';
import { Box, Check, CornerDownLeft, Layers, Plus, Sparkles, X } from 'lucide-react';

export interface StockTransferPackagingModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProductName: string;
  baseUnitOfSelectedProduct: string;
  calcMode: 'hierarchy' | 'single';
  setCalcMode: (mode: 'hierarchy' | 'single') => void;
  bulkUnitName: string;
  setBulkUnitName: (val: string) => void;
  mediumUnitsPerBulk: number;
  setMediumUnitsPerBulk: (val: number) => void;
  mediumUnitName: string;
  setMediumUnitName: (val: string) => void;
  smallUnitsPerMedium: number;
  setSmallUnitsPerMedium: (val: number) => void;
  smallUnitName: string;
  setSmallUnitName: (val: string) => void;
  baseQtyPerSmallUnit: number;
  setBaseQtyPerSmallUnit: (val: number) => void;
  targetWithdrawalTier: 'small' | 'medium' | 'bulk';
  setTargetWithdrawalTier: (tier: 'small' | 'medium' | 'bulk') => void;
  withdrawalQty: number;
  setWithdrawalQty: (val: number) => void;
  singleUnitName: string;
  setSingleUnitName: (val: string) => void;
  singleUnitCapacity: number;
  setSingleUnitCapacity: (val: number) => void;
  singleWithdrawalQty: number;
  setSingleWithdrawalQty: (val: number) => void;
  onSaveAndApply: (addDirectlyToTable: boolean) => void;
}

export const StockTransferPackagingModal: React.FC<StockTransferPackagingModalProps> = ({
  isOpen,
  onClose,
  selectedProductName,
  baseUnitOfSelectedProduct,
  calcMode,
  setCalcMode,
  bulkUnitName,
  setBulkUnitName,
  mediumUnitsPerBulk,
  setMediumUnitsPerBulk,
  mediumUnitName,
  setMediumUnitName,
  smallUnitsPerMedium,
  setSmallUnitsPerMedium,
  smallUnitName,
  setSmallUnitName,
  baseQtyPerSmallUnit,
  setBaseQtyPerSmallUnit,
  targetWithdrawalTier,
  setTargetWithdrawalTier,
  withdrawalQty,
  setWithdrawalQty,
  singleUnitName,
  setSingleUnitName,
  singleUnitCapacity,
  setSingleUnitCapacity,
  singleWithdrawalQty,
  setSingleWithdrawalQty,
  onSaveAndApply,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-xl w-full overflow-hidden space-y-0">
        {/* رأس النافذة */}
        <div className="p-5 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl">
              <Layers size={22} />
            </div>
            <div>
              <h3 className="font-black text-base">إعداد شجرة العبوات والتجزئة والسحب</h3>
              <p className="text-xs text-blue-100">
                الصنف: <strong className="text-white">{selectedProductName || 'صنف'}</strong> | الوحدة المعيارية للمخزن: ({baseUnitOfSelectedProduct})
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/20 text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* محتوى النافذة */}
        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto custom-scrollbar">
          {/* التبديل بين النمط الهرمي متعدد المستويات والنمط الفردي المباشر */}
          <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl text-xs font-bold">
            <button
              type="button"
              onClick={() => setCalcMode('hierarchy')}
              className={`py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                calcMode === 'hierarchy'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers size={14} /> طرد مركب (كرتونة ← علب ← أكياس...)
            </button>
            <button
              type="button"
              onClick={() => setCalcMode('single')}
              className={`py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                calcMode === 'single'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Box size={14} /> عبوة مباشرة (شيكارة / صفيحة / زجاجة...)
            </button>
          </div>

          {calcMode === 'hierarchy' ? (
            <div className="space-y-4">
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-3">
                <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <Box size={14} className="text-indigo-600" />
                  المستوى 1: الطرد الأكبر (وحدة الشراء الكبرى)
                </span>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    اسم الطرد الكبير (مثال: كرتونة، شيكارة، صندوق، بالتة...)
                  </label>
                  <input
                    type="text"
                    value={bulkUnitName}
                    onChange={(e) => setBulkUnitName(e.target.value)}
                    placeholder="اكتب اسم الطرد (مثلاً: كرتونة)"
                    className="w-full border border-slate-200 focus:border-indigo-500 rounded-xl p-2.5 text-xs bg-white outline-none font-bold"
                  />
                </div>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-3">
                <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <Layers size={14} className="text-indigo-600" />
                  المستوى 2: العبوة الوسيطة (العبوات الداخلية بالطرد)
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      اسم العبوة الوسيطة (مثال: علبة، باكت، جردل، لفة...)
                    </label>
                    <input
                      type="text"
                      value={mediumUnitName}
                      onChange={(e) => setMediumUnitName(e.target.value)}
                      placeholder="اكتب اسم العبوة (مثلاً: علبة)"
                      className="w-full border border-slate-200 focus:border-indigo-500 rounded-xl p-2.5 text-xs bg-white outline-none font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      كم {mediumUnitName || 'عبوة'} بداخل كل {bulkUnitName || 'طرد'}؟
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={mediumUnitsPerBulk}
                      onChange={(e) => setMediumUnitsPerBulk(parseInt(e.target.value) || 1)}
                      placeholder="مثلاً: 4"
                      className="w-full border border-slate-200 focus:border-indigo-500 rounded-xl p-2.5 text-center text-xs bg-white outline-none font-black"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-3">
                <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <CornerDownLeft size={14} className="text-indigo-600" />
                  المستوى 3: وحدة التجزئة الصغرى (وحدة السحب الدقيق للشيف)
                </span>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-1">
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      اسم الوحدة الصغرى
                    </label>
                    <input
                      type="text"
                      value={smallUnitName}
                      onChange={(e) => setSmallUnitName(e.target.value)}
                      placeholder="مثلاً: كيس أو باكو"
                      className="w-full border border-slate-200 focus:border-indigo-500 rounded-xl p-2.5 text-xs bg-white outline-none font-bold"
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      كم {smallUnitName || 'وحدة'} بالـ {mediumUnitName || 'عبوة'}؟
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={smallUnitsPerMedium}
                      onChange={(e) => setSmallUnitsPerMedium(parseInt(e.target.value) || 1)}
                      placeholder="مثلاً: 12"
                      className="w-full border border-slate-200 focus:border-indigo-500 rounded-xl p-2.5 text-center text-xs bg-white outline-none font-black"
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      سعة الـ {smallUnitName || 'وحدة'} ({baseUnitOfSelectedProduct})
                    </label>
                    <input
                      type="number"
                      min="0.0001"
                      step="any"
                      value={baseQtyPerSmallUnit}
                      onChange={(e) => setBaseQtyPerSmallUnit(parseFloat(e.target.value) || 0)}
                      placeholder="مثلاً: 0.25"
                      className="w-full border border-slate-200 focus:border-indigo-500 rounded-xl p-2.5 text-center text-xs bg-white outline-none font-black"
                    />
                  </div>
                </div>
              </div>

              {smallUnitName && (
                <div className="p-4 bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl space-y-2 text-xs">
                  <span className="font-black text-indigo-900 block flex items-center gap-1.5">
                    <Sparkles size={14} className="text-indigo-600" />
                    المعاينة الحية لهيكل تعبئة الصنف:
                  </span>
                  <div className="space-y-1 text-slate-700 font-bold pr-2">
                    {bulkUnitName && (
                      <div className="flex items-center gap-1 text-indigo-950 font-black">
                        <span>📦 1 {bulkUnitName}</span>
                        <span>
                          = {mediumUnitsPerBulk} {mediumUnitName || 'عبوة'}
                        </span>
                        <span>
                          = {mediumUnitsPerBulk * smallUnitsPerMedium} {smallUnitName}
                        </span>
                        <span className="text-purple-700">
                          (= {(mediumUnitsPerBulk * smallUnitsPerMedium * baseQtyPerSmallUnit).toFixed(2)}{' '}
                          {baseUnitOfSelectedProduct})
                        </span>
                      </div>
                    )}
                    {mediumUnitName && (
                      <div className="flex items-center gap-1 text-slate-800">
                        <span>🔹 1 {mediumUnitName}</span>
                        <span>
                          = {smallUnitsPerMedium} {smallUnitName}
                        </span>
                        <span className="text-purple-700">
                          (= {(smallUnitsPerMedium * baseQtyPerSmallUnit).toFixed(2)} {baseUnitOfSelectedProduct})
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-1 text-slate-800">
                      <span>🔸 1 {smallUnitName}</span>
                      <span className="text-purple-700">
                        = {baseQtyPerSmallUnit} {baseUnitOfSelectedProduct}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <span className="text-xs font-black text-slate-800 block">
                  ما الذي يريد الشيف / المطبخ سحبه الآن في هذا التحويل؟
                </span>
                <div className="grid grid-cols-3 gap-2 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setTargetWithdrawalTier('small')}
                    className={`p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${
                      targetWithdrawalTier === 'small'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-[10px] opacity-80">سحب بالتجزئة</span>
                    <span>{smallUnitName || 'وحدة صغرى'}</span>
                  </button>

                  {mediumUnitName && (
                    <button
                      type="button"
                      onClick={() => setTargetWithdrawalTier('medium')}
                      className={`p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${
                        targetWithdrawalTier === 'medium'
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span className="text-[10px] opacity-80">سحب بالعبوة</span>
                      <span>{mediumUnitName}</span>
                    </button>
                  )}

                  {bulkUnitName && (
                    <button
                      type="button"
                      onClick={() => setTargetWithdrawalTier('bulk')}
                      className={`p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${
                        targetWithdrawalTier === 'bulk'
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span className="text-[10px] opacity-80">سحب بالطرد الأكبر</span>
                      <span>{bulkUnitName}</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <label className="text-xs font-bold text-slate-700 shrink-0">الكمية المسحوبة:</label>
                  <input
                    type="number"
                    min="0.1"
                    step="any"
                    value={withdrawalQty}
                    onChange={(e) => setWithdrawalQty(parseFloat(e.target.value) || 0)}
                    placeholder="مثلاً: 8"
                    className="w-28 border border-slate-200 focus:border-indigo-500 rounded-xl p-2 text-center text-sm bg-white outline-none font-black"
                  />
                  <span className="text-xs font-bold text-slate-600">
                    {targetWithdrawalTier === 'small'
                      ? smallUnitName
                      : targetWithdrawalTier === 'medium'
                      ? mediumUnitName
                      : bulkUnitName}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  اسم العبوة (مثال: شيكارة، صفيحة، كيس، زجاجة، برطمان، قالب، برميل...)
                </label>
                <input
                  type="text"
                  value={singleUnitName}
                  onChange={(e) => setSingleUnitName(e.target.value)}
                  placeholder="اكتب اسم العبوة بحرية..."
                  className="w-full border border-slate-200 focus:border-blue-500 rounded-xl p-2.5 text-xs bg-slate-50 focus:bg-white outline-none font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    سعة/وزن العبوة الواحدة ({baseUnitOfSelectedProduct})
                  </label>
                  <input
                    type="number"
                    min="0.001"
                    step="any"
                    value={singleUnitCapacity}
                    onChange={(e) => setSingleUnitCapacity(parseFloat(e.target.value) || 0)}
                    placeholder="مثلاً: 25 أو 50 أو 1"
                    className="w-full border border-slate-200 focus:border-blue-500 rounded-xl p-2.5 text-center text-sm font-black bg-white outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    عدد العبوات المطلوب سحبها
                  </label>
                  <input
                    type="number"
                    min="0.1"
                    step="any"
                    value={singleWithdrawalQty}
                    onChange={(e) => setSingleWithdrawalQty(parseFloat(e.target.value) || 0)}
                    placeholder="مثلاً: 1"
                    className="w-full border border-slate-200 focus:border-blue-500 rounded-xl p-2.5 text-center text-sm font-black bg-white outline-none"
                  />
                </div>
              </div>

              {singleUnitName && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-center space-y-1">
                  <span className="text-xs text-emerald-700 font-bold block">إجمالي المعادل بالمخزن:</span>
                  <div className="text-2xl font-black text-emerald-900">
                    {((Number(singleWithdrawalQty) || 0) * (Number(singleUnitCapacity) || 0)).toFixed(2)}{' '}
                    {baseUnitOfSelectedProduct}
                  </div>
                  <div className="text-xs text-emerald-800 font-medium">
                    ({singleWithdrawalQty} {singleUnitName} × {singleUnitCapacity} {baseUnitOfSelectedProduct})
                  </div>
                </div>
              )}
            </div>
          )}

          {/* أزرار الإجراء */}
          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => onSaveAndApply(false)}
              className="py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-indigo-500/20 transition-all"
            >
              <Check size={16} /> حفظ الهيكل وتطبيق السحب
            </button>

            <button
              type="button"
              onClick={() => onSaveAndApply(true)}
              className="py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/20 transition-all"
            >
              <Plus size={16} /> حفظ وإضافة للجدول مباشرة
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
