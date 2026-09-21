import React from 'react';
import { 
  Calculator, 
  Sparkles, 
  Percent, 
  CircleDollarSign, 
  Wallet, 
  Loader2, 
  Unlock, 
  Save, 
  CheckCircle, 
  Printer, 
  Landmark, 
  FileText, 
  AlertCircle, 
  RefreshCw, 
  Info 
} from 'lucide-react';

export interface InvoiceSummaryProps {
  formData: {
    discountType: 'percentage' | 'fixed';
    discountValue: number;
    paidAmount: number;
    treasuryId: string;
    status: string;
    [key: string]: any;
  };
  setFormData: React.Dispatch<React.SetStateAction<any>>;
  subtotal: number;
  totalPromoDiscount: number;
  appliedPromotions: any[];
  discountAmount: number;
  settings: any;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  treasuryAccounts: any[];
  remainingBalance: number;
  handleUnpostInvoice: () => void;
  handleCreateCreditNote: () => void;
  handleSaveAndPost: () => void;
  handlePrint: () => void;
  saving: boolean;
  isRefreshingBalance: boolean;
  items: any[];
  editingId: string | null;
  companySettings: any;
  etaDetails: {
    status: string;
    uuid: string;
    submissionId: string;
    qrCode: string;
    error: string;
  };
  handleSubmitToETA: () => void;
  submittingToEta: boolean;
}

export const InvoiceSummary: React.FC<InvoiceSummaryProps> = ({
  formData,
  setFormData,
  subtotal,
  totalPromoDiscount,
  appliedPromotions,
  discountAmount,
  settings,
  taxRate,
  taxAmount,
  totalAmount,
  treasuryAccounts,
  remainingBalance,
  handleUnpostInvoice,
  handleCreateCreditNote,
  handleSaveAndPost,
  handlePrint,
  saving,
  isRefreshingBalance,
  items,
  editingId,
  companySettings,
  etaDetails,
  handleSubmitToETA,
  submittingToEta,
}) => {
  return (
    <div className="lg:col-span-4 space-y-6">
      {/* Totals & Actions Dashboard */}
      <div className="bg-slate-900 rounded-[32px] p-8 text-white shadow-2xl shadow-blue-900/20 sticky top-6">
        <h3 className="text-lg font-black mb-8 flex items-center gap-3 border-b border-white/10 pb-4">
          <Calculator size={22} className="text-blue-400" /> ملخص الفاتورة
        </h3>

        <div className="space-y-6">
          <div className="flex justify-between items-center group">
            <span className="text-slate-400 text-sm font-bold uppercase tracking-wide">المجموع الفرعي</span>
            <span className="text-2xl font-mono">{subtotal.toLocaleString()}</span>
          </div>

          {/* Hypermarket Promotions Applied */}
          {totalPromoDiscount > 0 && (
            <div className="bg-amber-500/10 p-4 rounded-3xl border border-amber-500/20 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                  <Sparkles size={14} className="text-amber-400" />
                  عروض الهايبر ماركت المطبقة
                </span>
                <span className="text-amber-400 font-mono font-bold">- {totalPromoDiscount.toLocaleString()} EGP</span>
              </div>
              <div className="space-y-1.5 pt-2 border-t border-amber-500/10">
                {appliedPromotions.map((promo, pIdx) => (
                  <div key={pIdx} className="flex justify-between items-center text-[11px] text-amber-200/90">
                    <span className="truncate pr-1">{promo.promoName}</span>
                    <span className="font-mono font-bold text-amber-300 whitespace-nowrap">-{promo.discountAmount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Discount Controls */}
          <div className="bg-white/5 p-4 rounded-3xl border border-white/5 space-y-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-400">الخصم الإضافي (يدوي)</span>
                <div className="flex bg-slate-800 rounded-xl p-0.5 border border-white/10 shadow-inner">
                  <button 
                    type="button" 
                    onClick={() => setFormData({...formData, discountType: 'percentage'})}
                    className={`p-1.5 rounded-lg transition-all ${formData.discountType === 'percentage' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    <Percent size={14} />
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setFormData({...formData, discountType: 'fixed'})}
                    className={`p-1.5 rounded-lg transition-all ${formData.discountType === 'fixed' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    <CircleDollarSign size={14} />
                  </button>
                </div>
              </div>
              <input 
                type="number" 
                min="0" 
                step="any"
                value={formData.discountValue}
                onChange={(e) => setFormData({...formData, discountValue: Math.max(0, parseFloat(e.target.value) || 0)})}
                className="w-20 bg-slate-800 border-2 border-white/5 rounded-xl text-center text-sm font-black py-2 focus:outline-none focus:border-blue-500 transition-all"
              />
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-white/5">
              <span className="text-[10px] text-slate-500 font-bold uppercase">إجمالي الخصومات والعروض</span>
              <span className="text-red-400 font-mono font-bold">- {discountAmount.toLocaleString()} EGP</span>
            </div>
          </div>

          {settings.enableTax && (
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-sm font-bold">الضريبة ({(taxRate * 100).toFixed(0)}%)</span>
              <span className="text-xl font-mono text-slate-300">{taxAmount.toLocaleString()}</span>
            </div>
          )}

          <div className="pt-6 border-t-2 border-white/10">
            <div className="flex justify-between items-end mb-2">
              <span className="text-sm font-black text-blue-400 uppercase tracking-widest">الإجمالي النهائي</span>
              <span className="text-xs text-slate-500 font-bold uppercase">EGP</span>
            </div>
            <div className="text-5xl font-black tracking-tight text-emerald-400 tabular-nums">
              {totalAmount.toLocaleString()}
            </div>
          </div>

          {/* Payment Status Indicator */}
          <div className="pt-6">
            <div className="bg-white/5 p-5 rounded-3xl border border-white/5 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Wallet size={16} className="text-emerald-400" />
                <span className="text-xs font-black uppercase tracking-wider text-slate-400">التحصيل والدفع</span>
              </div>
              
              <div className="flex gap-4">
                <div className="flex-1 space-y-1">
                  <label className="text-[10px] font-black text-slate-500 pr-2">المدفوع نقداً</label>
                  <input 
                    type="number" 
                    min="0" 
                    step="any"
                    value={formData.paidAmount}
                    onChange={(e) => setFormData({...formData, paidAmount: Math.max(0, parseFloat(e.target.value) || 0)})}
                    className="w-full bg-slate-800 border-2 border-white/5 rounded-2xl px-3 py-3 text-center font-black text-emerald-400 text-lg focus:outline-none focus:border-emerald-500 transition-all shadow-inner"
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-[10px] font-black text-slate-500 pr-2">إلى الخزينة</label>
                  <select 
                    value={formData.treasuryId}
                    onChange={(e) => setFormData({...formData, treasuryId: e.target.value})}
                    disabled={!formData.paidAmount || formData.paidAmount <= 0}
                    className="w-full bg-slate-700 text-white border-2 border-white/10 rounded-2xl px-3 py-3 text-xs font-bold focus:outline-none focus:border-blue-500 appearance-none disabled:opacity-20 transition-all shadow-inner"
                  >
                    <option value="">اختر...</option>
                    {treasuryAccounts.map(acc => (
                      <option key={acc.id} value={acc.id} className="text-black">
                        {acc.name} {acc.id === settings.defaultTreasuryId ? '⭐' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {formData.paidAmount > 0 && (
                <div className="flex justify-between items-center pt-2 border-t border-white/5 animate-in fade-in slide-in-from-bottom-1">
                  <span className="text-xs font-bold text-red-400">المتبقي (آجل):</span>
                  <span className="font-mono font-bold">{remainingBalance.toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {formData.status !== 'draft' ? (
          <div className="mt-8 space-y-3">
            <button 
              type="button" 
              onClick={handleUnpostInvoice}
              disabled={saving}
              className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white py-4 rounded-[24px] font-black text-lg shadow-xl shadow-amber-600/30 transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3"
              title="عكس حركة المخزون وحذف القيد المحاسبي وتحويل الفاتورة لمسودة قابلة للتعديل"
            >
              {saving ? <Loader2 className="animate-spin" /> : <Unlock size={22} />}
              إلغاء الترحيل والتعديل 🔓
            </button>
            <button 
              type="button" 
              onClick={handleCreateCreditNote}
              className="w-full bg-red-600 hover:bg-red-500 text-white py-4 rounded-[24px] font-black text-lg shadow-xl shadow-red-600/30 transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3"
            >
              إنشاء إشعار دائن / مرتجع
            </button>
          </div>
        ) : (
          <button 
            type="submit" 
            disabled={items.length === 0 || saving || isRefreshingBalance}
            className="mt-8 w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:opacity-50 text-white py-5 rounded-[24px] font-black text-xl shadow-2xl shadow-blue-600/30 transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3"
          >
            {saving ? <Loader2 className="animate-spin" /> : <Save size={24} />}
            {editingId ? 'تحديث الفاتورة' : 'حفظ كمسودة'}
          </button>
        )}
        {!editingId && (
          <button 
            type="button" 
            onClick={handleSaveAndPost}
            disabled={items.length === 0 || saving || isRefreshingBalance}
            className="mt-4 w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:opacity-50 text-white py-4 rounded-[24px] font-bold text-lg shadow-lg shadow-emerald-200 transition-all flex items-center justify-center gap-3"
          >
            {saving ? <Loader2 className="animate-spin" /> : <CheckCircle size={22} />}
            حفظ وترحيل
          </button>
        )}
        <button 
          type="button" 
          onClick={handlePrint}
          className="mt-4 w-full bg-slate-800 hover:bg-slate-700 text-white py-4 rounded-[24px] font-bold text-lg shadow-lg transition-all flex items-center justify-center gap-3"
        >
          <Printer size={22} /> طباعة الفاتورة
        </button>

        {/* Egyptian Tax Authority (ETA) Status Section */}
        {editingId && formData.status !== 'draft' && companySettings?.eta_is_active && (
          <div className="mt-6 bg-slate-50 border border-slate-200 rounded-3xl p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
              <Landmark size={20} className="text-cyan-600" />
              <h4 className="font-black text-slate-850 text-sm">منظومة الضرائب المصرية (ETA)</h4>
            </div>
            
            {etaDetails.status === 'valid' ? (
              <div className="space-y-3">
                <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl p-3 text-xs font-bold flex items-center gap-2">
                  <CheckCircle size={18} className="text-green-600" />
                  <span>تم الإرسال والقبول بنجاح</span>
                </div>
                <div className="space-y-1.5 text-xs text-slate-600 bg-white p-3 rounded-xl border">
                  <div className="flex justify-between">
                    <span>حالة المستند:</span>
                    <span className="font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">صالح (Valid)</span>
                  </div>
                  <div className="flex justify-between">
                    <span>الرقم الموحد (UUID):</span>
                    <span className="font-mono text-slate-500">{etaDetails.uuid.slice(0, 15)}...</span>
                  </div>
                  <div className="flex justify-between">
                    <span>رقم التقديم:</span>
                    <span className="font-mono text-slate-500">{etaDetails.submissionId.slice(0, 12)}...</span>
                  </div>
                </div>
                {etaDetails.qrCode && (
                  <a
                    href={etaDetails.qrCode}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5"
                  >
                    <FileText size={14} /> عرض الفاتورة على موقع الضرائب
                  </a>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {etaDetails.status === 'failed' ? (
                  <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-3 text-xs space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <AlertCircle size={16} className="text-red-600" />
                      <span>فشل إرسال الفاتورة للمصلحة</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-red-700/80">{etaDetails.error}</p>
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-xs font-bold flex items-center gap-2">
                    <AlertCircle size={18} className="text-amber-600" />
                    <span>الفاتورة لم تُرسل للضرائب بعد</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleSubmitToETA}
                  disabled={submittingToEta}
                  className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:opacity-50 text-white py-3.5 rounded-xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2"
                >
                  {submittingToEta ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                  {etaDetails.status === 'failed' ? 'إعادة محاولة الإرسال' : 'إرسال الفاتورة الآن'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Quick Helper Info */}
      <div className="bg-blue-50 rounded-3xl p-6 border border-blue-100 flex items-start gap-4">
        <div className="bg-white p-2 rounded-xl shadow-sm">
          <Info className="text-blue-600" size={24} />
        </div>
        <div>
          <h4 className="font-black text-blue-900 text-sm mb-1">تعليمات سريعة</h4>
          <p className="text-blue-700/70 text-xs leading-relaxed">
            استخدم شريط البحث بالأعلى لإضافة الأصناف بسرعة. يمكنك تغيير الكمية والأسعار مباشرة من الجدول. سيتم إنشاء قيود اليومية وتحديث المخزون فور الحفظ.
          </p>
        </div>
      </div>
    </div>
  );
};
export default InvoiceSummary;
