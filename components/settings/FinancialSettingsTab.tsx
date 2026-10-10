import React from 'react';
import { ToggleRight, ToggleLeft, ChevronDown } from 'lucide-react';
import { SettingsFormData, CURRENCIES } from './types';

interface FinancialSettingsTabProps {
  formData: SettingsFormData;
  setFormData: React.Dispatch<React.SetStateAction<SettingsFormData>>;
  handleSave: (e: React.FormEvent) => void;
  warehouses: Array<{ id: string; name: string }>;
  accounts: Array<{ id: string; code: string; name: string; isGroup?: boolean }>;
}

export const FinancialSettingsTab: React.FC<FinancialSettingsTabProps> = ({
  formData,
  setFormData,
  handleSave,
  warehouses,
  accounts,
}) => {
  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-2xl animate-in fade-in" dir="rtl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="md:col-span-2 flex items-center justify-between bg-slate-50 p-4 rounded-lg border border-slate-200">
          <div>
            <label className="block text-sm font-bold text-slate-700">تفعيل ضريبة القيمة المضافة</label>
            <p className="text-xs text-slate-500 mt-1">تفعيل أو تعطيل حساب الضريبة في الفواتير</p>
          </div>
          <button
            type="button"
            onClick={() => setFormData({ ...formData, enableTax: !formData.enableTax })}
            className={`text-3xl transition-colors ${formData.enableTax ? 'text-emerald-600' : 'text-slate-300'}`}
          >
            {formData.enableTax ? <ToggleRight size={40} /> : <ToggleLeft size={40} />}
          </button>
        </div>

        <div className={`transition-opacity duration-200 ${!formData.enableTax ? 'opacity-50 pointer-events-none' : ''}`}>
          <label className="block text-sm font-medium text-slate-700 mb-1">نسبة ضريبة القيمة المضافة (VAT)</label>
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              min="0"
              max="100"
              value={formData.vatRate || ''}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '' || /^\d*\.?\d*$/.test(val)) {
                  setFormData({ ...formData, vatRate: val as any });
                }
              }}
              className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:border-emerald-500 outline-none text-left"
              placeholder="15"
              disabled={!formData.enableTax}
            />
            <span className="absolute left-3 top-2.5 text-slate-400 text-sm">%</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">أدخل 14 لنسبة 14% أو 15 لنسبة 15%</p>
        </div>

        <div className="md:col-span-2 flex items-center justify-between bg-slate-50 p-4 rounded-lg border border-slate-200">
          <div>
            <label className="block text-sm font-bold text-slate-700">تفعيل رسوم الخدمة (للمطاعم والكافيهات)</label>
            <p className="text-xs text-slate-500 mt-1">تطبيق نسبة خدمة على طلبات المطاعم مع إمكانية إلغائها أو تفعيلها لكل طلب</p>
          </div>
          <button
            type="button"
            onClick={() => setFormData({ ...formData, enableServiceCharge: !formData.enableServiceCharge })}
            className={`text-3xl transition-colors ${formData.enableServiceCharge ? 'text-emerald-600' : 'text-slate-300'}`}
          >
            {formData.enableServiceCharge ? <ToggleRight size={40} /> : <ToggleLeft size={40} />}
          </button>
        </div>

        <div className={`transition-opacity duration-200 ${!formData.enableServiceCharge ? 'opacity-50 pointer-events-none' : ''}`}>
          <label className="block text-sm font-medium text-slate-700 mb-1">نسبة رسوم الخدمة (%)</label>
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              min="0"
              max="100"
              value={formData.serviceChargeRate || ''}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '' || /^\d*\.?\d*$/.test(val)) {
                  setFormData({ ...formData, serviceChargeRate: val as any });
                }
              }}
              className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:border-emerald-500 outline-none text-left"
              placeholder="12"
              disabled={!formData.enableServiceCharge}
            />
            <span className="absolute left-3 top-2.5 text-slate-400 text-sm">%</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">أدخل 12 لنسبة خدمة 12%</p>
        </div>

        <div className="md:col-span-2 flex items-center justify-between bg-slate-50 p-4 rounded-lg border border-slate-200">
          <div>
            <label className="block text-sm font-bold text-slate-700">السماح بالبيع بالسالب (أنشطة الحلواني والمخابز والأغذية الطازجة)</label>
            <p className="text-xs text-slate-500 mt-1">يتيح البيع المباشر في نقاط البيع (POS) قبل إدخال أوامر تصنيع التورت والحلويات الطازجة في نهاية الوردية.</p>
          </div>
          <button
            type="button"
            onClick={() => setFormData({ ...formData, allowNegativeStock: !formData.allowNegativeStock })}
            className={`text-3xl transition-colors ${formData.allowNegativeStock ? 'text-red-600' : 'text-slate-300'}`}
          >
            {formData.allowNegativeStock ? <ToggleRight size={40} /> : <ToggleLeft size={40} />}
          </button>
        </div>

        <div className="md:col-span-2 flex items-center justify-between bg-slate-50 p-4 rounded-lg border border-slate-200">
          <div>
            <label className="block text-sm font-bold text-slate-700">منع تعديل الأسعار في الفاتورة</label>
            <p className="text-xs text-slate-500 mt-1">عند التفعيل، لن يتمكن البائعون من تغيير سعر بيع الصنف المحدد مسبقاً</p>
          </div>
          <button
            type="button"
            onClick={() => setFormData({ ...formData, preventPriceModification: !formData.preventPriceModification })}
            className={`text-3xl transition-colors ${formData.preventPriceModification ? 'text-emerald-600' : 'text-slate-300'}`}
          >
            {formData.preventPriceModification ? <ToggleRight size={40} /> : <ToggleLeft size={40} />}
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">الحد الأقصى للعجز المسموح به (للموظفين)</label>
          <div className="relative">
            <input
              type="number"
              min="0"
              value={formData.maxCashDeficitLimit || ''}
              onChange={(e) => setFormData({ ...formData, maxCashDeficitLimit: e.target.value as any })}
              className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:border-emerald-500 outline-none"
            />
          </div>
          <p className="text-xs text-slate-500 mt-1">لن يتمكن الموظف من إقفال الصندوق إذا تجاوز العجز هذا المبلغ.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">العملة الافتراضية</label>
          <div className="relative">
            <select
              value={formData.currency}
              onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
              className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:border-emerald-500 outline-none appearance-none bg-white"
            >
              <option value="">اختر العملة...</option>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
              {!CURRENCIES.some((c) => c.code === formData.currency) && formData.currency && (
                <option value={formData.currency}>{formData.currency}</option>
              )}
            </select>
            <div className="absolute left-3 top-3 pointer-events-none text-slate-400">
              <ChevronDown size={16} />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">عدد الكسور العشرية</label>
          <div className="relative">
            <input
              type="number"
              min="0"
              max="4"
              value={formData.decimalPlaces || ''}
              onChange={(e) => setFormData({ ...formData, decimalPlaces: e.target.value as any })}
              className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:border-emerald-500 outline-none"
            />
          </div>
          <p className="text-xs text-slate-500 mt-1">عدد الأرقام بعد العلامة العشرية (مثال: 2 لـ 10.50)</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">المستودع الافتراضي للنظام</label>
          <div className="relative">
            <select
              value={formData.defaultWarehouseId}
              onChange={(e) => setFormData({ ...formData, defaultWarehouseId: e.target.value })}
              className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:border-emerald-500 outline-none appearance-none bg-white font-bold"
            >
              <option value="">-- اختر المستودع الافتراضي --</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <div className="absolute left-3 top-3 pointer-events-none text-slate-400">
              <ChevronDown size={16} />
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-1">المستودع الذي سيتم اختياره تلقائياً في فواتير البيع والشراء.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">مستودع الإنتاج الافتراضي (WIP)</label>
          <div className="relative">
            <select
              value={formData.productionWarehouseId}
              onChange={(e) => setFormData({ ...formData, productionWarehouseId: e.target.value })}
              className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:border-purple-500 outline-none appearance-none bg-white font-bold"
            >
              <option value="">-- اختر مستودع الإنتاج --</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <div className="absolute left-3 top-3 pointer-events-none text-slate-400">
              <ChevronDown size={16} />
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-1">المستودع الذي ستُحول إليه التكاليف أثناء عملية التصنيع.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">مستودع الخامات الافتراضي</label>
          <div className="relative">
            <select
              value={formData.rawMaterialsWarehouseId}
              onChange={(e) => setFormData({ ...formData, rawMaterialsWarehouseId: e.target.value })}
              className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:border-orange-500 outline-none appearance-none bg-white font-bold"
            >
              <option value="">-- اختر مستودع الخامات --</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <div className="absolute left-3 top-3 pointer-events-none text-slate-400">
              <ChevronDown size={16} />
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-1">المستودع الذي يتم سحب المواد الأولية منه تلقائياً.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">الخزينة الافتراضية للنظام</label>
          <div className="relative">
            <select
              value={formData.defaultTreasuryId}
              onChange={(e) => setFormData({ ...formData, defaultTreasuryId: e.target.value })}
              className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:border-emerald-500 outline-none appearance-none bg-white font-bold"
            >
              <option value="">-- اختر الخزينة الافتراضية --</option>
              {accounts
                .filter(
                  (a) =>
                    !a.isGroup &&
                    (a.code.startsWith('123') ||
                      a.name.includes('خزينة') ||
                      a.name.includes('صندوق') ||
                      a.name.includes('بنك'))
                )
                .map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.code})
                  </option>
                ))}
            </select>
            <div className="absolute left-3 top-3 pointer-events-none text-slate-400">
              <ChevronDown size={16} />
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-1">الحساب المالي الذي سيتم اختياره تلقائياً للتحصيل والدفع النقدي.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">البنك الافتراضي للنظام (مبيعات الفيزا والشبكة)</label>
          <div className="relative">
            <select
              value={formData.defaultBankId}
              onChange={(e) => setFormData({ ...formData, defaultBankId: e.target.value })}
              className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:border-blue-500 outline-none appearance-none bg-white font-bold"
            >
              <option value="">-- اختر البنك الافتراضي / وسيط الفيزا --</option>
              {accounts
                .filter(
                  (a) =>
                    !a.isGroup &&
                    (a.code.startsWith('1232') ||
                      a.code.startsWith('1102') ||
                      a.name.includes('بنك') ||
                      a.name.includes('فيزا') ||
                      a.name.includes('شبكة') ||
                      a.name.toLowerCase().includes('bank') ||
                      (a.code.startsWith('123') && !a.name.includes('خزينة') && !a.name.includes('صندوق')))
                )
                .map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.code})
                  </option>
                ))}
            </select>
            <div className="absolute left-3 top-3 pointer-events-none text-slate-400">
              <ChevronDown size={16} />
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-1">الحساب البنكي الذي يتم توجيه مدفوعات البطاقات والفيزا والشبكة إليه تلقائياً في الكاشير.</p>
        </div>
      </div>

      <div className="pt-4 text-left">
        <button type="submit" className="bg-emerald-600 text-white px-8 py-2.5 rounded-lg hover:bg-emerald-700 font-bold shadow-md">
          حفظ الإعدادات المالية
        </button>
      </div>
    </form>
  );
};

export default FinancialSettingsTab;
