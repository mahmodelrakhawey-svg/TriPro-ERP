import React from 'react';
import {
  Landmark,
  ToggleRight,
  ToggleLeft,
  Usb,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Save,
} from 'lucide-react';
import { SettingsFormData } from './types';

interface EtaIntegrationTabProps {
  formData: SettingsFormData;
  setFormData: React.Dispatch<React.SetStateAction<SettingsFormData>>;
  handleSave: (e: React.FormEvent) => void;
  localSignerStatus: { online: boolean; message: string } | null;
  checkingSigner: boolean;
  handleCheckLocalSigner: () => void;
  testingEta: boolean;
  handleTestEta: () => void;
}

export const EtaIntegrationTab: React.FC<EtaIntegrationTabProps> = ({
  formData,
  setFormData,
  handleSave,
  localSignerStatus,
  checkingSigner,
  handleCheckLocalSigner,
  testingEta,
  handleTestEta,
}) => {
  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-2xl animate-in fade-in" dir="rtl">
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 space-y-6">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 border-b pb-3">
          <Landmark size={20} className="text-cyan-600" /> إعدادات منظومة الفاتورة الإلكترونية (ETA)
        </h3>

        <div className="flex items-center justify-between bg-white p-4 rounded-lg border border-slate-150">
          <div>
            <label className="block text-sm font-bold text-slate-800">تفعيل الربط الإلكتروني</label>
            <span className="text-xs text-slate-500">تمكين إرسال الفواتير تلقائياً لمصلحة الضرائب المصرية</span>
          </div>
          <button
            type="button"
            onClick={() => setFormData((prev) => ({ ...prev, etaIsActive: !prev.etaIsActive }))}
            className="text-cyan-600 transition-colors bg-transparent border-0 cursor-pointer"
          >
            {formData.etaIsActive ? (
              <ToggleRight size={44} className="text-cyan-600" />
            ) : (
              <ToggleLeft size={44} className="text-slate-400" />
            )}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              رقم التسجيل الضريبي للمنشأة (Taxpayer ID)
            </label>
            <input
              type="text"
              disabled={!formData.etaIsActive}
              value={formData.etaTaxpayerId}
              onChange={(e) => setFormData((prev) => ({ ...prev, etaTaxpayerId: e.target.value }))}
              placeholder="مثال: 123456789"
              className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-cyan-500 disabled:bg-slate-100 disabled:text-slate-400"
              maxLength={9}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">بيئة التشغيل (Environment)</label>
            <select
              disabled={!formData.etaIsActive}
              value={formData.etaEnvironment}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, etaEnvironment: e.target.value as 'sandbox' | 'production' }))
              }
              className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-cyan-500 disabled:bg-slate-100"
            >
              <option value="sandbox">البيئة التجريبية (Sandbox)</option>
              <option value="production">البيئة الفعلية (Production)</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-2">معرف العميل للمنظومة (Client ID)</label>
            <input
              type="text"
              disabled={!formData.etaIsActive}
              value={formData.etaClientId}
              onChange={(e) => setFormData((prev) => ({ ...prev, etaClientId: e.target.value }))}
              placeholder="أدخل الـ Client ID من حساب الممول بالمصلحة"
              className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-cyan-500 disabled:bg-slate-100 disabled:text-slate-400"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              المفتاح السري للعميل (Client Secret)
            </label>
            <input
              type="password"
              disabled={!formData.etaIsActive}
              value={formData.etaClientSecret}
              onChange={(e) => setFormData((prev) => ({ ...prev, etaClientSecret: e.target.value }))}
              placeholder="أدخل الـ Client Secret"
              className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-cyan-500 disabled:bg-slate-100 disabled:text-slate-400"
            />
          </div>
        </div>

        <div className="bg-cyan-50/70 border border-cyan-200 rounded-xl p-4 text-xs text-cyan-900 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Usb size={18} className="text-cyan-700" />
              <span className="font-bold text-sm text-cyan-900">
                برنامج المساعد المحلي للتوقيع (Local Signer - Port 8500)
              </span>
            </div>
            <div className="flex items-center gap-2">
              {localSignerStatus && (
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                    localSignerStatus.online ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {localSignerStatus.online ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                  {localSignerStatus.online ? 'المساعد متصل وجاهز' : 'غير متصل'}
                </span>
              )}
              <button
                type="button"
                onClick={handleCheckLocalSigner}
                disabled={checkingSigner}
                className="bg-white hover:bg-cyan-100 text-cyan-800 border border-cyan-300 font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 text-xs shadow-sm disabled:opacity-50"
              >
                {checkingSigner ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                <span>فحص المساعد المحلي</span>
              </button>
            </div>
          </div>

          {localSignerStatus && (
            <div
              className={`p-2.5 rounded-lg font-mono text-[11px] ${
                localSignerStatus.online
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                  : 'bg-amber-50 text-amber-900 border border-amber-200'
              }`}
            >
              {localSignerStatus.message}
            </div>
          )}

          <ul className="list-disc list-inside space-y-1 text-cyan-800/90 pr-1">
            <li>
              لتشغيل التوقيع الحي، شغّل أداة{' '}
              <code className="bg-white/80 px-1 py-0.5 rounded text-cyan-900 font-mono text-[11px] font-bold">
                tools/eta-local-signer/start-signer.bat
              </code>{' '}
              على جهاز المحاسب الموصول به فلاشة التوقيع (USB Token).
            </li>
            <li>
              في البيئة التجريبية (Sandbox)، يولد النظام توقيعاً رقمياً معيارياً تلقائياً لتسهيل فحص وتجربة دورة العمل
              الكاملة.
            </li>
          </ul>
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-4 border-t">
          <button
            type="button"
            onClick={handleTestEta}
            disabled={testingEta || !formData.etaIsActive}
            className="w-full sm:w-auto bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 border border-slate-300 disabled:opacity-50 text-xs"
          >
            {testingEta ? <Loader2 size={16} className="animate-spin" /> : <Landmark size={16} className="text-cyan-600" />}
            <span>{testingEta ? 'جاري اختبار الاتصال...' : 'اختبار الاتصال ببوابة الضرائب (OAuth2)'}</span>
          </button>

          <button
            type="submit"
            className="w-full sm:w-auto bg-cyan-600 text-white font-bold px-6 py-2.5 rounded-lg hover:bg-cyan-700 transition-colors flex items-center justify-center gap-2"
          >
            <Save size={18} /> حفظ إعدادات الضرائب
          </button>
        </div>
      </div>
    </form>
  );
};

export default EtaIntegrationTab;
