import React, { useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { Lock, Unlock, AlertTriangle, CheckCircle, Calculator, Calendar, ArrowRight, RefreshCw, ShieldAlert, Sparkles } from 'lucide-react';

const FiscalYearClosing = () => {
  const { closeFinancialYear, reopenFinancialYear, settings } = useAccounting();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'close' | 'reopen'>('close');
  const [year, setYear] = useState(new Date().getFullYear() - 1); // الافتراضي السنة الماضية
  const [closingDate, setClosingDate] = useState(`${new Date().getFullYear()}-01-01`);
  const [reopenYearVal, setReopenYearVal] = useState(settings?.lastClosedYear || new Date().getFullYear() - 1);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1); // 1: Form, 2: Success

  const handleClose = async () => {
    if (!year || year < 2000 || year > 2099) {
      showToast('يرجى إدخال سنة مالية صحيحة.', 'error');
      return;
    }

    if (!closingDate) {
      showToast('يرجى تحديد تاريخ قيد الإقفال.', 'error');
      return;
    }

    if (!window.confirm(`هل أنت متأكد تماماً من إغلاق السنة المالية ${year}؟\n\n• سيتم تصفير حسابات الإيرادات والمصروفات.\n• ترحيل صافي النتيجة لحساب الأرباح المبقاة (32).\n• قفل السنة ضد التعديل والإضافة.`)) {
      return;
    }

    setLoading(true);
    try {
      const success = await closeFinancialYear(year, closingDate);
      if (success) {
        setStep(2);
      }
    } catch (error: any) {
      showToast('فشل الإغلاق: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleReopen = async () => {
    if (!reopenYearVal) {
      showToast('يرجى تحديد السنة المراد إعادة فتحها.', 'error');
      return;
    }

    if (!window.confirm(`هل أنت متأكد من إعادة فتح السنة المالية ${reopenYearVal}؟\n\n• سيتم حذف قيد الإقفال السنوي.\n• السماح بتعديل وإضافة القيود في هذه السنة مؤقتاً.\n• يجب إعادة إقفال السنة فور الانتهاء من التعديلات.`)) {
      return;
    }

    setLoading(true);
    try {
      const success = await reopenFinancialYear(Number(reopenYearVal));
      if (success) {
        showToast(`تم فتح السنة ${reopenYearVal} بنجاح، يمكنك الآن تعديل وإضافة الحركات.`, 'success');
      }
    } catch (error: any) {
      showToast('فشل إعادة فتح السنة: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (step === 2) {
    return (
      <div className="max-w-2xl mx-auto mt-10 p-8 bg-white rounded-3xl shadow-lg text-center animate-in zoom-in border border-slate-100">
        <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
          <CheckCircle size={44} />
        </div>
        <h2 className="text-2xl font-black text-slate-800 mb-2">تم إغلاق السنة المالية {year} بنجاح!</h2>
        <p className="text-slate-500 mb-6 leading-relaxed">
          تم تصفير حسابات قائمة الدخل (المصروفات والإيرادات)، وترحيل صافي النشاط إلى حساب الأرباح المبقاة (32)، وتوليد قيد الإقفال الآلي رقم <span className="font-mono font-bold text-blue-600">CLOSE-{year}</span>.
        </p>

        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-emerald-800 text-xs font-bold mb-8 text-right space-y-1">
          <p className="flex items-center gap-2"><Sparkles size={14} /> السنة المالية الجديدة مفتوحة وجاهزة لاستقبال الحركات مباشرة.</p>
          <p className="flex items-center gap-2"><Sparkles size={14} /> أرصدة الأصول والالتزامات وحقوق الملكية انتقلت تلقائياً كأرصدة تراكمية مستمرة.</p>
        </div>

        <div className="flex gap-4 justify-center">
          <button 
            onClick={() => { setStep(1); }} 
            className="bg-slate-100 text-slate-700 px-6 py-3 rounded-xl font-bold hover:bg-slate-200 transition-colors"
          >
            إجراء عملية أخرى
          </button>
          <button 
            onClick={() => window.location.reload()} 
            className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-slate-800 transition-colors shadow-lg shadow-slate-200"
          >
            تحديث النظام
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in pb-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="bg-red-100 p-3 rounded-2xl text-red-600">
            <Lock size={32} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-800">إقفال السنة المالية وفتح سنة جديدة</h1>
            <p className="text-slate-500 font-medium">تصفير حسابات الدخل، ترحيل الأرباح المبقاة، وقفل الفترة المحاسبية</p>
          </div>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button 
            onClick={() => setActiveTab('close')}
            className={`px-4 py-2 rounded-lg font-bold text-xs transition-all ${activeTab === 'close' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            إقفال سنة
          </button>
          <button 
            onClick={() => setActiveTab('reopen')}
            className={`px-4 py-2 rounded-lg font-bold text-xs transition-all ${activeTab === 'reopen' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            إعادة فتح سنة
          </button>
        </div>
      </div>

      {activeTab === 'close' ? (
        <div className="bg-white p-8 rounded-[32px] shadow-sm border border-slate-200">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex gap-3 mb-8">
            <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={24} />
            <div className="text-sm text-amber-800 space-y-1">
              <p className="font-bold mb-2">تعليمات ومراجعة هامة قبل تنفيذ الإقفال:</p>
              <ul className="list-disc list-inside space-y-1 text-xs opacity-90">
                <li>ترحيل جميع القيود والفواتير والسندات الخاصة بالسنة <span className="font-bold text-amber-900">{year}</span>.</li>
                <li>مطابقة ميزان المراجعة والأرصدة البنكية والخزينة وجرد المخزون الفعلي.</li>
                <li>التأكد من وجود حساب الأرباح المبقاة (كود 32) في دليل الحسابات.</li>
                <li>سيتم تلقائياً تصفير حسابات المصروفات (5xxx) والإيرادات (4xxx) بقيد آلي <span className="font-mono font-bold">CLOSE-{year}</span>.</li>
                <li>ستبدأ السنة الجديدة تلقائياً بأرصدة الأصول والالتزامات المستمرة.</li>
              </ul>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">السنة المالية المراد إقفالها</label>
              <div className="relative">
                <input
                  type="text" 
                  value={year} 
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, '');
                    setYear(val ? parseInt(val, 10) : 0);
                  }} 
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 font-black text-lg focus:border-red-500 outline-none transition-all"
                />
                <Calendar className="absolute left-4 top-3.5 text-slate-400" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">تاريخ قيد الإقفال</label>
              <input 
                type="date" 
                value={closingDate} 
                onChange={e => setClosingDate(e.target.value)} 
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-700 focus:border-red-500 outline-none transition-all"
              />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-6">
            <div className="flex justify-between items-center mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <span className="text-slate-500 font-bold text-sm">آخر سنة مالية مغلقة:</span>
              <span className="font-mono font-black text-slate-800 bg-white px-3 py-1 rounded-lg border text-sm">
                {settings?.lastClosedYear ? `سنة ${settings.lastClosedYear} (${settings.lastClosedDate || '-'})` : 'لا توجد سنوات مغلقة بعد'}
              </span>
            </div>

            <button 
              onClick={handleClose} 
              disabled={loading}
              className="w-full bg-red-600 text-white py-4 rounded-2xl font-black text-lg shadow-xl shadow-red-100 hover:bg-red-700 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <RefreshCw className="animate-spin" size={20} /> : <Lock size={20} />}
              {loading ? 'جاري معالجة القيود وترحيل الأرصدة...' : 'تنفيذ الإقفال النهائي للسنة'}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white p-8 rounded-[32px] shadow-sm border border-slate-200 animate-in fade-in">
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 flex gap-3 mb-8">
            <ShieldAlert className="text-blue-600 shrink-0 mt-0.5" size={24} />
            <div className="text-sm text-blue-800 space-y-1">
              <p className="font-bold mb-2">إعادة فتح سنة مالية مغلقة (للتصحيح والتعديل):</p>
              <ul className="list-disc list-inside space-y-1 text-xs opacity-90">
                <li>تتيح لك إعادة فتح آخر سنة مغلقة لإجراء تسويات أو تعديل قيود محاسبية.</li>
                <li>يتم حذف قيد الإقفال السابق تلقائياً وفك الحظر عن التاريخ المحدد.</li>
                <li>يجب أن تتأكد من إعادة تنفيذ الإقفال بمجرد الانتهاء من التسويات المطلوبة.</li>
              </ul>
            </div>
          </div>

          <div className="mb-8">
            <label className="block text-sm font-bold text-slate-700 mb-2">السنة المغلقة المراد إعادة فتحها</label>
            <div className="relative max-w-xs">
              <input
                type="number" 
                value={reopenYearVal || ''} 
                onChange={e => setReopenYearVal(e.target.value ? parseInt(e.target.value, 10) : 0)} 
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 font-black text-lg focus:border-blue-500 outline-none transition-all"
                placeholder="2024"
              />
              <Calendar className="absolute left-4 top-3.5 text-slate-400" />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-6">
            <button 
              onClick={handleReopen} 
              disabled={loading || !reopenYearVal}
              className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-lg shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <RefreshCw className="animate-spin" size={20} /> : <Unlock size={20} />}
              {loading ? 'جاري معالجة فتح السنة...' : 'إعادة فتح السنة المالية'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FiscalYearClosing;
