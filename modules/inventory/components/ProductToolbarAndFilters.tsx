import React from 'react';
import {
  AlertTriangle,
  Barcode,
  Download,
  FileSpreadsheet,
  Layers,
  Loader2,
  Package,
  Percent,
  Plus,
  RefreshCw,
  Scale,
  Search,
  Sparkles,
  Tag,
  Upload,
  UtensilsCrossed,
  Zap,
} from 'lucide-react';
import type { Item } from '../ProductManager';

export interface ProductToolbarAndFiltersProps {
  items: Item[];
  warehouses: any[];
  categories: any[];
  searchTerm: string;
  onSearchTermChange: (val: string) => void;
  showOffersOnly: boolean;
  onToggleOffersOnly: () => void;
  selectedCount: number;
  typeFilter: string;
  onTypeFilterChange: (val: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (val: string) => void;
  warehouseFilter: string;
  onWarehouseFilterChange: (val: string) => void;
  routingFilter: 'all' | 'has_routing_and_steps' | 'has_routing_no_steps' | 'no_routing' | 'has_any_routing';
  onRoutingFilterChange: (val: 'all' | 'has_routing_and_steps' | 'has_routing_no_steps' | 'no_routing' | 'has_any_routing') => void;
  importWarehouseId: string;
  onImportWarehouseIdChange: (val: string) => void;
  isSyncingOpenings: boolean;
  isRecalculatingAll: boolean;
  isExporting: boolean;
  isImporting: boolean;
  isRecipeImporting: boolean;
  isAssigningSkus: boolean;
  isSyncingRawAccounts: boolean;
  isSyncingFinishedGoodsAccounts: boolean;
  rawItemsNeedingSyncCount: number;
  finishedGoodsItemsNeedingSyncCount: number;
  onOpenConsumptionModal: () => void;
  onSyncMissingOpeningEntries: () => void;
  onRecalculateStockAll: () => void;
  onExportExcel: () => void;
  onExportScalePLU: () => void;
  onDownloadTemplate: () => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenExcelPriceUpdateModal: () => void;
  onRecipeFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDownloadRecipeTemplate: () => void;
  onAutoAssignMissingSkus: () => void;
  onSyncRawMaterialAccounts: () => void;
  onSyncFinishedGoodsAccounts: () => void;
  onOpenNewProductModal: () => void;
  onBulkCategoryChange: (categoryId: string) => void;
  onOpenBulkOfferModal: () => void;
  onOpenBulkPriceUpdateModal: () => void;
  onBulkPrintBarcodes: () => void;
}

/**
 * Renders the top product management action toolbar, multi-criteria filter panel, and bulk actions.
 */
export const ProductToolbarAndFilters: React.FC<ProductToolbarAndFiltersProps> = ({
  items,
  warehouses,
  categories,
  searchTerm,
  onSearchTermChange,
  showOffersOnly,
  onToggleOffersOnly,
  selectedCount,
  typeFilter,
  onTypeFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  warehouseFilter,
  onWarehouseFilterChange,
  routingFilter,
  onRoutingFilterChange,
  importWarehouseId,
  onImportWarehouseIdChange,
  isSyncingOpenings,
  isRecalculatingAll,
  isExporting,
  isImporting,
  isRecipeImporting,
  isAssigningSkus,
  isSyncingRawAccounts,
  isSyncingFinishedGoodsAccounts,
  rawItemsNeedingSyncCount,
  finishedGoodsItemsNeedingSyncCount,
  onOpenConsumptionModal,
  onSyncMissingOpeningEntries,
  onRecalculateStockAll,
  onExportExcel,
  onExportScalePLU,
  onDownloadTemplate,
  onFileUpload,
  onOpenExcelPriceUpdateModal,
  onRecipeFileUpload,
  onDownloadRecipeTemplate,
  onAutoAssignMissingSkus,
  onSyncRawMaterialAccounts,
  onSyncFinishedGoodsAccounts,
  onOpenNewProductModal,
  onBulkCategoryChange,
  onOpenBulkOfferModal,
  onOpenBulkPriceUpdateModal,
  onBulkPrintBarcodes,
}) => {
  const missingSkuCount = (items || []).filter((p) => !p.sku || !p.sku.trim()).length;

  return (
    <>
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Package className="text-emerald-600" /> إدارة الأصناف (المنضبطة)
          </h2>
          <button
            onClick={onOpenConsumptionModal}
            className="mt-1 text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded-full font-bold flex items-center gap-1 hover:bg-indigo-100 transition-all"
          >
            <Zap size={12} /> عرض الاستهلاك المتوقع من المسودات
          </button>
          <p className="text-slate-500">تعريف المنتجات وربطها بالحسابات المحاسبية</p>
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          <button
            onClick={onSyncMissingOpeningEntries}
            disabled={isSyncingOpenings}
            className="bg-amber-50 border border-amber-300 text-amber-800 px-3 py-2 rounded-lg flex items-center gap-1.5 hover:bg-amber-100 text-sm font-bold shadow-sm transition-all disabled:opacity-50"
            title="توليد قيود الأرصدة الافتتاحية في دفتر اليومية لجميع الأصناف الحالية التي ليس لها قيد"
          >
            {isSyncingOpenings ? <Loader2 size={16} className="animate-spin text-amber-600" /> : <RefreshCw size={16} className="text-amber-600" />}
            <span>توليد القيود الافتتاحية</span>
          </button>

          <button
            onClick={onRecalculateStockAll}
            disabled={isRecalculatingAll}
            className="bg-teal-50 border border-teal-300 text-teal-800 px-3 py-2 rounded-lg flex items-center gap-1.5 hover:bg-teal-100 text-sm font-bold shadow-sm transition-all disabled:opacity-50"
            title="إعادة احتساب ومزامنة أرصدة المخزون وتكاليف جميع الأصناف من الحركات الفعلية"
          >
            {isRecalculatingAll ? <Loader2 size={16} className="animate-spin text-teal-600" /> : <RefreshCw size={16} className="text-teal-600" />}
            <span>إعادة احتساب الأرصدة</span>
          </button>

          <button
            onClick={onExportExcel}
            disabled={isExporting}
            className="bg-blue-50 border border-blue-200 text-blue-700 px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-100 text-sm font-bold shadow-sm transition-all disabled:opacity-50"
            title="تصدير القائمة الحالية بالكامل إلى Excel"
          >
            {isExporting ? <Loader2 size={16} className="animate-spin text-blue-600" /> : <FileSpreadsheet size={16} />}
            <span>{isExporting ? 'جاري التصدير...' : 'تصدير'}</span>
          </button>

          <button
            onClick={onExportScalePLU}
            className="bg-purple-50 border border-purple-200 text-purple-700 px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-purple-100 text-sm font-bold shadow-sm transition-all"
            title="تصدير ملف أكواد وأسعار الموازين الإلكترونية (PLU) لبرامج موازين الباركود"
          >
            <Scale size={16} /> ملف الموازين (PLU)
          </button>

          <button
            onClick={onDownloadTemplate}
            className="bg-white border border-slate-300 text-slate-600 px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-50 text-sm font-bold"
            title="تحميل نموذج Excel"
          >
            <Download size={16} /> نموذج
          </button>

          <select
            value={importWarehouseId}
            onChange={(e) => onImportWarehouseIdChange(e.target.value)}
            className="bg-white border border-slate-300 text-slate-600 px-2 py-2 rounded-lg text-sm font-bold outline-none focus:border-emerald-500"
            title="اختر المستودع الذي سيتم استيراد الأرصدة الافتتاحية إليه"
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>

          <div className="relative">
            <input
              type="file"
              accept=".xlsx, .xls, .csv, .json"
              onChange={onFileUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={isImporting}
            />
            <button className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-emerald-100 text-sm font-bold">
              {isImporting ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              استيراد Excel
            </button>
          </div>

          <button
            onClick={onOpenExcelPriceUpdateModal}
            className="bg-amber-50 border border-amber-300 text-amber-800 px-3.5 py-2 rounded-lg flex items-center gap-2 hover:bg-amber-100 text-sm font-bold shadow-sm transition-all"
            title="تحديث أسعار البيع من ملف Excel دون تكرار الأصناف ودون المساس بالمخزون"
          >
            <Tag size={16} className="text-amber-600" />
            <span>تحديث الأسعار Excel</span>
          </button>

          <div className="relative">
            <input
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={onRecipeFileUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={isRecipeImporting}
            />
            <button className="bg-purple-50 border border-purple-200 text-purple-700 px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-purple-100 text-sm font-bold">
              {isRecipeImporting ? <Loader2 size={16} className="animate-spin" /> : <UtensilsCrossed size={16} />}
              استيراد وصفات
            </button>
          </div>

          <button
            onClick={onDownloadRecipeTemplate}
            className="bg-white border border-slate-300 text-slate-600 px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-50 text-sm font-bold"
            title="تحميل نموذج الوصفات"
          >
            <Download size={16} /> نموذج الوصفات
          </button>

          {missingSkuCount > 0 && (
            <button
              onClick={onAutoAssignMissingSkus}
              disabled={isAssigningSkus}
              className="bg-indigo-50 border border-indigo-200 text-indigo-700 px-3 py-2 rounded-lg flex items-center gap-1.5 hover:bg-indigo-100 text-sm font-bold animate-in fade-in"
              title="توليد وتعيين أكواد SKU تلقائية لجميع الأصناف التي تفتقر لكود"
            >
              {isAssigningSkus ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} className="text-indigo-600" />}
              <span>توليد أكواد للأصناف الشاغرة ({missingSkuCount})</span>
            </button>
          )}

          <button
            onClick={onSyncRawMaterialAccounts}
            disabled={isSyncingRawAccounts}
            className="bg-amber-50 border border-amber-300 text-amber-800 px-3 py-2 rounded-lg flex items-center gap-1.5 hover:bg-amber-100 text-sm font-bold shadow-sm transition-all disabled:opacity-50 animate-in fade-in"
            title="توجيه أصناف المواد الخام إلى حساب مخزون المواد الخام (10301) مع الحفاظ على الأصناف المعدلة يدوياً"
          >
            {isSyncingRawAccounts ? <Loader2 size={16} className="animate-spin text-amber-600" /> : <Layers size={16} className="text-amber-600" />}
            <span>توجيه خامات المخزون (10301)</span>
            {rawItemsNeedingSyncCount > 0 && (
              <span className="bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded-full text-xs font-black">
                {rawItemsNeedingSyncCount}
              </span>
            )}
          </button>

          <button
            onClick={onSyncFinishedGoodsAccounts}
            disabled={isSyncingFinishedGoodsAccounts}
            className="bg-emerald-50 border border-emerald-300 text-emerald-800 px-3 py-2 rounded-lg flex items-center gap-1.5 hover:bg-emerald-100 text-sm font-bold shadow-sm transition-all disabled:opacity-50 animate-in fade-in"
            title="توجيه أصناف التورت والجاتوهات والشرقي إلى حساب مخزون الإنتاج التام (10302)"
          >
            {isSyncingFinishedGoodsAccounts ? <Loader2 size={16} className="animate-spin text-emerald-600" /> : <UtensilsCrossed size={16} className="text-emerald-600" />}
            <span>توجيه الإنتاج التام (10302)</span>
            {finishedGoodsItemsNeedingSyncCount > 0 && (
              <span className="bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded-full text-xs font-black">
                {finishedGoodsItemsNeedingSyncCount}
              </span>
            )}
          </button>

          <button
            onClick={onOpenNewProductModal}
            className="bg-emerald-600 text-white px-6 py-2.5 rounded-lg hover:bg-emerald-700 flex items-center gap-2 font-bold shadow-lg"
          >
            <Plus size={20} /> صنف جديد
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-3 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="بحث باسم الصنف أو الكود (SKU)..."
              value={searchTerm}
              onChange={(e) => onSearchTermChange(e.target.value)}
              className="w-full pr-10 pl-4 py-2.5 border rounded-lg focus:outline-none focus:border-emerald-500"
            />
          </div>
          <button
            onClick={onToggleOffersOnly}
            className={`px-4 py-2.5 rounded-lg border flex items-center gap-2 transition-colors font-bold ${
              showOffersOnly ? 'bg-yellow-50 border-yellow-200 text-yellow-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
            }`}
          >
            <Percent size={18} />
            <span className="hidden md:inline">العروض</span>
          </button>
          {selectedCount > 0 && (
            <>
              <select
                onChange={(e) => onBulkCategoryChange(e.target.value)}
                className="bg-white border border-slate-300 text-slate-600 px-2 py-2.5 rounded-lg text-sm font-bold outline-none focus:border-purple-500"
                title="تغيير تصنيف الأصناف المحددة"
              >
                <option value="">تغيير التصنيف...</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name} {(cat as any).description ? ` (${(cat as any).description})` : ''}
                  </option>
                ))}
              </select>
              <button
                onClick={onOpenBulkOfferModal}
                className="bg-purple-600 text-white px-4 py-2.5 rounded-lg flex items-center gap-2 font-bold hover:bg-purple-700 animate-in zoom-in"
              >
                <Tag size={18} />
                تطبيق عرض ({selectedCount})
              </button>
              <button
                onClick={onOpenBulkPriceUpdateModal}
                className="bg-orange-600 text-white px-4 py-2.5 rounded-lg flex items-center gap-2 font-bold hover:bg-orange-700 animate-in zoom-in"
              >
                <RefreshCw size={18} />
                تعديل الأسعار ({selectedCount})
              </button>
              <button
                onClick={onBulkPrintBarcodes}
                className="bg-slate-800 text-white px-4 py-2.5 rounded-lg flex items-center gap-2 font-bold hover:bg-slate-900 animate-in zoom-in"
              >
                <Barcode size={18} />
                طباعة باركود ({selectedCount})
              </button>
            </>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-3 pt-3 border-t">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">فلترة حسب نوع الصنف</label>
            <select
              value={typeFilter}
              onChange={(e) => onTypeFilterChange(e.target.value)}
              className="w-full border rounded-lg p-2.5 bg-white text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">-- كل أنواع الأصناف --</option>
              <option value="RAW_MATERIAL">🥩 مواد خام وأولية (RAW_MATERIAL)</option>
              <option value="MANUFACTURED">🍲 منتجات مصنعة / وجبات (MANUFACTURED)</option>
              <option value="INTERMEDIATE_PRODUCT">🍰 منتجات وسيطة / نصف مصنعة (INTERMEDIATE)</option>
              <option value="STOCK">📦 بضاعة مخزنية جاهزة (STOCK)</option>
              <option value="SERVICE">⚙️ خدمات (SERVICE)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">فلترة حسب التصنيف</label>
            <select
              value={categoryFilter}
              onChange={(e) => onCategoryFilterChange(e.target.value)}
              className="w-full border rounded-lg p-2.5 bg-white text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">-- كل التصنيفات --</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">المستودع / المخزن</label>
            <select
              value={warehouseFilter}
              onChange={(e) => onWarehouseFilterChange(e.target.value)}
              className={`w-full border rounded-lg p-2.5 text-xs font-bold outline-none focus:ring-2 transition-all ${
                warehouseFilter !== 'all'
                  ? 'bg-blue-50 border-blue-300 text-blue-900 focus:ring-blue-500'
                  : 'bg-white text-slate-700 focus:ring-emerald-500'
              }`}
            >
              <option value="all">-- كل المستودعات (الرصيد الإجمالي) --</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-slate-700">مسار ومراحل التصنيع (BOM/Routing)</label>
              {routingFilter !== 'all' && (
                <button
                  onClick={() => onRoutingFilterChange('all')}
                  className="text-[10px] text-red-600 hover:underline font-bold"
                >
                  إلغاء التصفية
                </button>
              )}
            </div>
            <select
              value={routingFilter}
              onChange={(e) => onRoutingFilterChange(e.target.value as any)}
              className={`w-full border rounded-lg p-2.5 text-xs font-bold outline-none focus:ring-2 transition-all ${
                routingFilter !== 'all'
                  ? 'bg-purple-50 border-purple-300 text-purple-900 focus:ring-purple-500'
                  : 'bg-white text-slate-700 focus:ring-emerald-500'
              }`}
            >
              <option value="all">-- كل حالات مسار الإنتاج --</option>
              <option value="has_routing_and_steps">✅ منتج مصنع له مسار ومراحل</option>
              <option value="no_routing">⚠️ منتج مصنع ليس له مسار تصنيعي</option>
              <option value="has_routing_no_steps">🔄 منتج مصنع له مسار بدون مراحل</option>
              <option value="has_any_routing">📋 كل المنتجات التي لها مسار</option>
            </select>
          </div>
        </div>
      </div>

      {routingFilter === 'no_routing' && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3.5 rounded-xl flex items-center justify-between gap-3 text-xs font-bold animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-rose-600 shrink-0" />
            <span>يتم الآن عرض الأصناف المصنعة والوسيطة التي لم يتم إنشاء مسار إنتاج أو مراحل تشغيل لها بعد. يمكنك النقر على زر "بدون مسار تصنيعي" أمام أي صنف لبناء مساره ومراحله فوراً.</span>
          </div>
          <button
            onClick={() => onRoutingFilterChange('all')}
            className="text-rose-700 hover:text-rose-900 underline shrink-0"
          >
            عرض كافة الأصناف
          </button>
        </div>
      )}

      {routingFilter === 'has_routing_and_steps' && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3.5 rounded-xl flex items-center justify-between gap-3 text-xs font-bold animate-in fade-in">
          <div className="flex items-center gap-2">
            <Layers size={18} className="text-emerald-600 shrink-0" />
            <span>يتم الآن عرض الأصناف المصنعة والوسيطة الجاهزة للإنتاج (التي لها مسار تشغيل ومراحل إنتاج متكاملة).</span>
          </div>
          <button
            onClick={() => onRoutingFilterChange('all')}
            className="text-emerald-700 hover:text-emerald-900 underline shrink-0"
          >
            عرض كافة الأصناف
          </button>
        </div>
      )}
    </>
  );
};
