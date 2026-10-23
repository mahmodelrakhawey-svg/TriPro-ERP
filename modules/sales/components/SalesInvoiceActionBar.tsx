import React from 'react';
import { 
    ShoppingCart, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
    Loader2, Zap, List, Plus, Printer, Trash2, AlertCircle, Unlock,
    Sparkles, RefreshCw
} from 'lucide-react';
import { secureStorage } from '../../../utils/securityMiddleware';

export interface SalesInvoiceActionBarProps {
  editingId: string | null;
  formData: {
    invoiceNumber?: string;
    status?: 'draft' | 'posted' | 'paid' | 'partial';
    notes?: string;
    customerId?: string;
  };
  customers: any[];
  items: any[];
  invoiceIds: string[];
  currentIndex: number;
  loadingInvoice: boolean;
  isQuickMode: boolean;
  setIsQuickMode: (val: boolean) => void;
  handleNavigate: (direction: 'first' | 'prev' | 'next' | 'last') => void;
  handleNewInvoice: () => void;
  handlePrint: () => void;
  handleThermalPrint: () => void;
  handleDeleteCurrent: () => void;
  deleting: boolean;
  canUnpost: boolean;
  saving: boolean;
  handleUnpostInvoice: () => void;
  handleCreateCreditNote: () => void;
  hasDraftRestored: boolean;
  navigate: (path: string) => void;
}

export const SalesInvoiceActionBar: React.FC<SalesInvoiceActionBarProps> = ({
  editingId,
  formData,
  customers,
  items,
  invoiceIds,
  currentIndex,
  loadingInvoice,
  isQuickMode,
  setIsQuickMode,
  handleNavigate,
  handleNewInvoice,
  handlePrint,
  handleThermalPrint,
  handleDeleteCurrent,
  deleting,
  canUnpost,
  saving,
  handleUnpostInvoice,
  handleCreateCreditNote,
  hasDraftRestored,
  navigate,
}) => {
  return (
    <>
      {/* Top Banner & Navigation Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-3xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
            <ShoppingCart size={28} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              {editingId ? `فاتورة مبيعات: ${formData.invoiceNumber}` : 'فاتورة مبيعات جديدة'}
              {editingId && (
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                  (formData.status === 'posted' || formData.status === 'paid')
                    ? (formData.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700')
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {formData.status === 'paid' ? 'مرحلة (مسددة) ✅' : formData.status === 'posted' ? 'مرحلة ✅' : 'مسودة 📝'}
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-400 font-bold">تجهيز طلب العميل وتسجيل الحركات المخزنية والمالية</p>
          </div>
        </div>

        {/* 🧭 أسهم التنقل بين فواتير المبيعات */}
        <div className="flex items-center gap-1 bg-slate-50 p-1.5 rounded-xl border border-slate-200 print:hidden">
          <button 
            type="button" 
            onClick={() => handleNavigate('first')} 
            disabled={invoiceIds.length === 0 || currentIndex === 0} 
            title="أول فاتورة"
            className="p-2 text-slate-600 hover:bg-white hover:text-blue-600 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronsRight size={18} />
          </button>
          
          <button 
            type="button" 
            onClick={() => handleNavigate('prev')} 
            disabled={invoiceIds.length === 0 || currentIndex <= 0} 
            title="الفاتورة السابقة"
            className="p-2 text-slate-600 hover:bg-white hover:text-blue-600 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronRight size={18} />
          </button>

          {/* Record Counter */}
          <div className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-mono font-black text-slate-700 select-none">
            {loadingInvoice ? (
              <Loader2 size={14} className="animate-spin text-blue-600" />
            ) : editingId && currentIndex !== -1 ? (
              <span>{currentIndex + 1} / {invoiceIds.length}</span>
            ) : (
              <span className="text-blue-600 font-bold">جديد ➕</span>
            )}
          </div>

          <button 
            type="button" 
            onClick={() => handleNavigate('next')} 
            disabled={invoiceIds.length === 0 || currentIndex >= invoiceIds.length - 1 || currentIndex === -1} 
            title="الفاتورة التالية"
            className="p-2 text-slate-600 hover:bg-white hover:text-blue-600 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronLeft size={18} />
          </button>

          <button 
            type="button" 
            onClick={() => handleNavigate('last')} 
            disabled={invoiceIds.length === 0 || currentIndex >= invoiceIds.length - 1 || currentIndex === -1} 
            title="آخر فاتورة"
            className="p-2 text-slate-600 hover:bg-white hover:text-blue-600 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronsLeft size={18} />
          </button>
        </div>
        
        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {/* ⚡ Quick Showroom Mode Toggle Button */}
          <button
            type="button"
            onClick={() => {
              const next = !isQuickMode;
              setIsQuickMode(next);
              secureStorage.setItem('tripro_sales_quick_mode', next);
            }}
            className={`px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-sm ${
              isQuickMode
                ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/20 ring-2 ring-amber-300'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
            }`}
            title={isQuickMode ? 'التحويل إلى الوضع المحاسبي المتقدم' : 'التحويل إلى وضع المعارض السريع'}
          >
            <Zap size={15} className={isQuickMode ? 'fill-current text-white animate-pulse' : 'text-amber-500'} />
            {isQuickMode ? 'وضع المعارض السريع ⚡' : 'الوضع المتقدم ⚙️'}
          </button>
          <button 
            type="button" 
            onClick={() => navigate('/invoices-list')} 
            className="bg-slate-100 text-slate-700 hover:bg-slate-200 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
            title="عرض سجل فواتير المبيعات"
          >
            <List size={16} /> سجل الفواتير
          </button>

          <button 
            type="button" 
            onClick={handleNewInvoice} 
            className="bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
            title="بدء فاتورة مبيعات جديدة"
          >
            <Plus size={16} /> جديد
          </button>

          <button 
            type="button" 
            onClick={handlePrint} 
            className="bg-slate-800 text-white hover:bg-slate-700 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
            title="طباعة الفاتورة A4"
          >
            <Printer size={16} /> A4
          </button>

          <button 
            type="button" 
            onClick={handleThermalPrint} 
            className="bg-slate-700 text-white hover:bg-slate-600 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
            title="طباعة حرارية"
          >
            <Printer size={16} /> حراري
          </button>

          {editingId && (
            <button 
              type="button" 
              onClick={handleDeleteCurrent} 
              disabled={deleting} 
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50 ${
                (formData.status === 'posted' || formData.status === 'paid')
                  ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                  : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
              }`}
              title={(formData.status === 'posted' || formData.status === 'paid') ? 'لا يمكن حذف الفاتورة المرحلة أو المسددة؛ قم بإلغاء الترحيل أولاً' : 'حذف مسودة الفاتورة'}
            >
              {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} حذف
            </button>
          )}
        </div>
      </div>

      {/* 🛡️ صمام حماية المستندات المرحلة (Posted Document Shield Banner) */}
      {(formData.status === 'posted' || formData.status === 'paid') && (
        <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border-2 border-amber-300 rounded-3xl p-5 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in fade-in">
          <div className="flex items-start md:items-center gap-3.5">
            <div className="p-3 bg-amber-500 text-white rounded-2xl shadow-sm">
              <AlertCircle size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-black text-slate-900 text-base">فاتورة مبيعات مرحلة محاسبياً (Posted Document)</h4>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-200 text-amber-900">
                  {formData.status === 'paid' ? 'مرحلة ومسددة' : 'مرحلة ومقفلة'}
                </span>
              </div>
              <p className="text-xs text-amber-900 mt-1 leading-relaxed font-medium">
                هذه الفاتورة معتمدة في دفتر اليومية وحسابات العملاء والمخزون ولا يمكن تعديلها مباشرة. لإجراء تعديلات، يجب إلغاء الترحيل أولاً لتحويلها إلى مسودة (Draft) إذا كانت لديك الصلاحية، أو إصدار إشعار دائن / مرتجع مبيعات.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end md:self-center shrink-0">
            {canUnpost && (
              <button
                type="button"
                onClick={handleUnpostInvoice}
                disabled={saving}
                className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-xl shadow-md shadow-amber-600/20 transition-all flex items-center gap-2"
                title="إلغاء الترحيل وتحويل الفاتورة لمسودة قابلة للتعديل"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Unlock size={16} />}
                إلغاء الترحيل للتعديل
              </button>
            )}
            <button
              type="button"
              onClick={handleCreateCreditNote}
              className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-black text-xs rounded-xl shadow-md shadow-red-600/20 transition-all flex items-center gap-2"
            >
              إشعار دائن / مرتجع
            </button>
          </div>
        </div>
      )}

      {/* 🛡️ شريط تنبيه استعادة مسودة فاتورة البيع */}
      {!editingId && hasDraftRestored && (items.length > 0 || (formData.notes && formData.notes.trim()) || (formData.customerId && (!customers.find(c => c.name === 'عميل نقدي') || formData.customerId !== customers.find(c => c.name === 'عميل نقدي')?.id))) && (
        <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-900 shadow-xs animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500 text-white rounded-xl shadow-xs shrink-0">
              <Sparkles size={18} />
            </div>
            <div>
              <div className="font-black text-sm text-amber-950 flex items-center gap-2">
                تمت استعادة مسودة فاتورة بيع سابقة تلقائياً ({items.length > 0 ? `${items.length} صنف` : 'بيانات العميل والملاحظات'})
              </div>
              <p className="text-amber-700 mt-0.5">
                تم الاحتفاظ بكافة بنود الفاتورة والعميل والخصومات والملاحظات لحماية عملك من الضياع عند إعادة تحميل الصفحة.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleNewInvoice}
            className="px-3 py-1.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl font-bold transition-colors flex items-center gap-1.5 shrink-0 shadow-2xs"
          >
            <RefreshCw size={13} /> مسح المسودة والبدء من جديد
          </button>
        </div>
      )}
    </>
  );
};
