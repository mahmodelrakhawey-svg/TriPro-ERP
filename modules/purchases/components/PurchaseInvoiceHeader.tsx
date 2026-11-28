import React from 'react';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Copy,
  List,
  Loader2,
  Plus,
  Printer,
  Save,
  ShoppingCart,
  Sparkles,
  Trash2,
  Unlock,
} from 'lucide-react';

export interface PurchaseInvoiceHeaderProps {
  warehousesCount: number;
  editingId: string | null;
  invoiceNumber: string;
  status: string;
  loadingInvoice: boolean;
  invoiceIdsLength: number;
  currentIndex: number;
  itemsLength: number;
  deleting: boolean;
  saving: boolean;
  canUnpost: boolean;
  onNavigateToWarehouses: () => void;
  onNavigateRecord: (direction: 'first' | 'prev' | 'next' | 'last') => void;
  onOpenList: () => void;
  onNewInvoice: () => void;
  onDuplicateInvoice: () => void;
  onOpenOCRModal: () => void;
  onPrintCurrent: () => void;
  onDeleteCurrent: () => void;
  onUnpostInvoice: () => void;
  onSaveAndPost: () => void;
}

/**
 * Renders the purchase invoice warehouse warning, navigation bar, action buttons, and posted shield banner.
 */
export const PurchaseInvoiceHeader: React.FC<PurchaseInvoiceHeaderProps> = ({
  warehousesCount,
  editingId,
  invoiceNumber,
  status,
  loadingInvoice,
  invoiceIdsLength,
  currentIndex,
  itemsLength,
  deleting,
  saving,
  canUnpost,
  onNavigateToWarehouses,
  onNavigateRecord,
  onOpenList,
  onNewInvoice,
  onDuplicateInvoice,
  onOpenOCRModal,
  onPrintCurrent,
  onDeleteCurrent,
  onUnpostInvoice,
  onSaveAndPost,
}) => {
  const isPostedOrPaid = status === 'posted' || status === 'paid';

  return (
    <>
      {warehousesCount === 0 && (
        <div className="bg-amber-50 border-2 border-amber-200 p-5 rounded-2xl mb-4 flex flex-col md:flex-row items-center justify-between gap-4 animate-in slide-in-from-top-4 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="bg-amber-100 p-3 rounded-2xl">
              <AlertCircle className="text-amber-600" size={28} />
            </div>
            <div>
              <h4 className="font-black text-amber-900 text-lg">تنبيه: لم يتم إعداد المخازن بعد</h4>
              <p className="text-amber-700 font-medium">يرجى إضافة مستودع واحد على الأقل لاستلام المشتريات عليه.</p>
            </div>
          </div>
          <button
            onClick={onNavigateToWarehouses}
            className="bg-amber-600 text-white px-6 py-3 rounded-2xl font-black hover:bg-amber-700 transition-all shadow-md flex items-center gap-2 whitespace-nowrap"
          >
            <Plus size={20} /> إضافة مستودع الآن
          </button>
        </div>
      )}

      {/* 🚀 Header & Navigation Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
            <ShoppingCart size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
              {editingId ? `فاتورة مشتريات: ${invoiceNumber}` : 'فاتورة مشتريات جديدة'}
              {editingId && (
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                    status === 'posted' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {status === 'posted' ? 'مرحلة ✅' : 'مسودة 📝'}
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-400 font-bold">تسجيل استلام بضاعة وفواتير الموردين وتحديث المخزون</p>
          </div>
        </div>

        {/* 🧭 أسهم التنقل بين الفواتير */}
        <div className="flex items-center gap-1 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
          <button
            type="button"
            onClick={() => onNavigateRecord('first')}
            disabled={invoiceIdsLength === 0 || currentIndex === 0}
            title="أول فاتورة"
            className="p-2 text-slate-600 hover:bg-white hover:text-emerald-600 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronsRight size={18} />
          </button>

          <button
            type="button"
            onClick={() => onNavigateRecord('prev')}
            disabled={invoiceIdsLength === 0 || currentIndex <= 0}
            title="الفاتورة السابقة"
            className="p-2 text-slate-600 hover:bg-white hover:text-emerald-600 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronRight size={18} />
          </button>

          <div className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-mono font-black text-slate-700 select-none">
            {loadingInvoice ? (
              <Loader2 size={14} className="animate-spin text-emerald-600" />
            ) : editingId && currentIndex !== -1 ? (
              <span>{currentIndex + 1} / {invoiceIdsLength}</span>
            ) : (
              <span className="text-emerald-600 font-bold">جديد ➕</span>
            )}
          </div>

          <button
            type="button"
            onClick={() => onNavigateRecord('next')}
            disabled={invoiceIdsLength === 0 || currentIndex >= invoiceIdsLength - 1 || currentIndex === -1}
            title="الفاتورة التالية"
            className="p-2 text-slate-600 hover:bg-white hover:text-emerald-600 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronLeft size={18} />
          </button>

          <button
            type="button"
            onClick={() => onNavigateRecord('last')}
            disabled={invoiceIdsLength === 0 || currentIndex >= invoiceIdsLength - 1 || currentIndex === -1}
            title="آخر فاتورة"
            className="p-2 text-slate-600 hover:bg-white hover:text-emerald-600 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronsLeft size={18} />
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenList}
            className="bg-slate-100 text-slate-700 hover:bg-slate-200 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
            title="عرض سجل المشتريات"
          >
            <List size={16} /> سجل المشتريات
          </button>

          <button
            type="button"
            onClick={onNewInvoice}
            className="bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
            title="بدء فاتورة مشتريات جديدة"
          >
            <Plus size={16} /> جديد
          </button>

          {Boolean(editingId || itemsLength > 0) && (
            <button
              type="button"
              onClick={onDuplicateInvoice}
              className="bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
              title="تكرار / استنساخ هذه الفاتورة كمسودة جديدة بجميع بنودها وأسعارها"
            >
              <Copy size={16} /> تكرار الفاتورة
            </button>
          )}

          {!editingId && (
            <button
              type="button"
              onClick={onOpenOCRModal}
              className="bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-colors shadow-xs"
              title="المسح الذكي لفاتورة المشتريات بالذكاء الاصطناعي"
            >
              <Sparkles size={16} className="text-purple-600 animate-pulse" /> مسح ذكي (AI OCR)
            </button>
          )}

          {editingId && (
            <>
              <button
                type="button"
                onClick={onPrintCurrent}
                className="bg-slate-800 text-white hover:bg-slate-700 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                title="طباعة الفاتورة"
              >
                <Printer size={16} /> طباعة
              </button>

              <button
                type="button"
                onClick={onDeleteCurrent}
                disabled={deleting}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50 ${
                  isPostedOrPaid
                    ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                    : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                }`}
                title={isPostedOrPaid ? 'لا يمكن حذف فاتورة المشتريات المرحلة؛ قم بإلغاء الترحيل أولاً' : 'حذف مسودة هذه الفاتورة'}
              >
                {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} حذف
              </button>
            </>
          )}

          {isPostedOrPaid ? (
            canUnpost && (
              <button
                type="button"
                onClick={onUnpostInvoice}
                disabled={saving}
                className="bg-amber-600 text-white px-5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 hover:bg-amber-700 transition-colors shadow-sm disabled:opacity-50"
                title="إلغاء ترحيل الفاتورة وإعادتها لمسودة قابلة للتعديل"
              >
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Unlock size={16} />}
                إلغاء الترحيل للتعديل 🔓
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={onSaveAndPost}
              disabled={saving}
              className="bg-emerald-600 text-white px-5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50"
            >
              {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              {editingId ? 'حفظ وتحديث' : 'حفظ وترحيل'}
            </button>
          )}
        </div>
      </div>

      {/* 🛡️ صمام حماية المستندات المرحلة (Posted Document Shield Banner) */}
      {isPostedOrPaid && (
        <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border-2 border-amber-300 rounded-3xl p-5 shadow-sm mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in fade-in">
          <div className="flex items-start md:items-center gap-3.5">
            <div className="p-3 bg-amber-500 text-white rounded-2xl shadow-sm">
              <AlertCircle size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-black text-slate-900 text-base">فاتورة مشتريات مرحلة محاسبياً (Posted Document)</h4>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-200 text-amber-900">
                  مرحلة ومقفلة
                </span>
              </div>
              <p className="text-xs text-amber-900 mt-1 leading-relaxed font-medium">
                هذه الفاتورة معتمدة ومرحلة في حسابات الموردين ودفتر الأستاذ والمخزون. للتعديل، يرجى إلغاء الترحيل أولاً لتحويلها إلى مسودة (Draft) إذا كانت لديك الصلاحية، أو إصدار مرتجع مشتريات.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end md:self-center shrink-0">
            {canUnpost && (
              <button
                type="button"
                onClick={onUnpostInvoice}
                disabled={saving}
                className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-xl shadow-md shadow-amber-600/20 transition-all flex items-center gap-2"
                title="إلغاء الترحيل وتحويل الفاتورة لمسودة قابلة للتعديل"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Unlock size={16} />}
                إلغاء الترحيل للتعديل
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
};
