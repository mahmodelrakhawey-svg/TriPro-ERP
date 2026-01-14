import React, { useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { Lock, AlertTriangle, CheckCircle, Calculator, Calendar, ArrowRight } from 'lucide-react';

const FiscalYearClosing = () => {
  const { closeFinancialYear, settings } = useAccounting();
  const [year, setYear] = useState(new Date().getFullYear() - 1); // الافتراضي السنة الماضية
  const [closingDate, setClosingDate] = useState(`${new Date().getFullYear()}-01-01`);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1); // 1: Confirmation, 2: Processing

  const handleClose = async () => {
    if (!window.confirm(`هل أنت متأكد تماماً من إغلاق السنة المالية ${year}؟\nلا يمكن التراجع عن هذه العملية بسهولة.`)) return;

    setLoading(true);
    try {
      await closeFinancialYear(year, closingDate);
      setStep(2);
    } catch (error: any) {
      alert('فشل الإغلاق: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (step === 2) {
    return (
      <div className="max-w-2xl mx-auto mt-10 p-8 bg-white rounded-3xl shadow-lg text-center animate-in zoom-in">
        <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle size={40} />
        </div>
        <h2 className="text-2xl font-black text-slate-800 mb-2">تم إغلاق السنة المالية بنجاح!</h2>
        <p className="text-slate-500 mb-8">تم ترحيل الأرصدة إلى حساب الأرباح المبقاة وإنشاء قيد الإقفال.</p>
        <button onClick={() => window.location.reload()} className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold">
          العودة للرئيسية
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in">
      <div className="flex items-center gap-4">
        <div className="bg-red-100 p-3 rounded-2xl text-red-600">
          <Lock size={32} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-800">إقفال السنة المالية</h1>
          <p className="text-slate-500 font-medium">تصفير حسابات المصروفات والإيرادات وترحيل الصافي</p>
        </div>
      </div>

      <div className="bg-white p-8 rounded-[32px] shadow-sm border border-slate-200">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3 mb-8">
          <AlertTriangle className="text-amber-600 shrink-0" size={24} />
          <div className="text-sm text-amber-800">
            <p className="font-bold mb-1">تنبيه هام قبل المتابعة:</p>
            <ul className="list-disc list-inside space-y-1 opacity-90">
              <li>تأكد من ترحيل جميع الفواتير والسندات الخاصة بالسنة {year}.</li>
              <li>تأكد من مطابقة الأرصدة البنكية والنقدية والجرد المخزني.</li>
              <li>سيتم إنشاء قيد آلي لإقفال جميع حسابات قائمة الدخل.</li>
              <li>لن تتمكن من إضافة أو تعديل أي قيود بتاريخ يسبق تاريخ الإغلاق.</li>
            </ul>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">السنة المالية المراد إقفالها</label>
            <div className="relative">
              <input 
                type="number" 
                value={year} 
                onChange={e => setYear(parseInt(e.target.value))} 
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 font-black text-lg focus:border-red-500 outline-none"
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
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-700 focus:border-red-500 outline-none"
            />
          </div>
        </div>

        <div className="border-t border-slate-100 pt-6">
            <div className="flex justify-between items-center mb-6">
                <span className="text-slate-500 font-bold">آخر إغلاق مسجل:</span>
                <span className="font-mono font-bold text-slate-800">
                    {settings.lastClosedDate ? new Date(settings.lastClosedDate).toLocaleDateString('ar-EG') : 'لا يوجد'}
                </span>
            </div>

            <button 
                onClick={handleClose} 
                disabled={loading}
                className="w-full bg-red-600 text-white py-4 rounded-2xl font-black text-lg shadow-xl shadow-red-100 hover:bg-red-700 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {loading ? 'جاري المعالجة...' : 'تنفيذ الإقفال النهائي'}
                {!loading && <ArrowRight size={20} />}
            </button>
        </div>
      </div>
    </div>
  );
};

export default FiscalYearClosing;
