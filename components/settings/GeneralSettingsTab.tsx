import React from 'react';
import { Landmark, Layers, ToggleRight, ToggleLeft } from 'lucide-react';
import { SettingsFormData } from './types';

interface GeneralSettingsTabProps {
  formData: SettingsFormData;
  setFormData: React.Dispatch<React.SetStateAction<SettingsFormData>>;
  handleSave: (e: React.FormEvent) => void;
  handleLogoUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  enableWorkspaceTabs: boolean;
  handleToggleWorkspaceTabs: (enabled: boolean) => void;
}

export const GeneralSettingsTab: React.FC<GeneralSettingsTabProps> = ({
  formData,
  setFormData,
  handleSave,
  handleLogoUpload,
  enableWorkspaceTabs,
  handleToggleWorkspaceTabs,
}) => {
  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-2xl animate-in fade-in" dir="rtl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-2">شعار المنشأة</label>
          <div className="flex items-center gap-6 bg-slate-50 p-4 rounded-lg border border-slate-200">
            {formData.logoUrl ? (
              <img
                src={formData.logoUrl}
                alt="Logo"
                className="w-20 h-20 object-contain bg-white rounded-lg border border-slate-200 p-1"
              />
            ) : (
              <div className="w-20 h-20 bg-slate-200 rounded-lg flex items-center justify-center text-slate-400">
                <Landmark size={32} />
              </div>
            )}
            <div className="flex-1">
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="block w-full text-sm text-slate-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-full file:border-0
                  file:text-sm file:font-bold
                  file:bg-blue-50 file:text-blue-900
                  hover:file:bg-blue-200
                  cursor-pointer
                "
              />
              <p className="text-xs text-slate-500 mt-2">يفضل استخدام صورة بخلفية شفافة (PNG) وحجم مربع.</p>
            </div>
          </div>
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">اسم المنشأة</label>
          <input
            type="text"
            required
            value={formData.companyName}
            onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
            className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:border-blue-900 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">الرقم الضريبي</label>
          <input
            type="text"
            value={formData.taxNumber}
            onChange={(e) => setFormData({ ...formData, taxNumber: e.target.value })}
            className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:border-blue-900 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">رقم الهاتف</label>
          <input
            type="text"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:border-blue-900 outline-none"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">العنوان</label>
          <input
            type="text"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:border-blue-900 outline-none"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">تذييل الفاتورة (Footer Text)</label>
          <textarea
            rows={2}
            value={formData.footerText}
            onChange={(e) => setFormData({ ...formData, footerText: e.target.value })}
            className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:border-blue-900 outline-none"
            placeholder="نص يظهر أسفل الفواتير والسندات..."
          />
        </div>

        {/* خيار تفعيل/تعطيل شريط تبويبات الشاشات المفتوحة */}
        <div className="md:col-span-2 flex items-center justify-between bg-slate-50 hover:bg-slate-100/80 p-4 rounded-xl border border-slate-200 transition-colors">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${enableWorkspaceTabs ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
              <Layers size={20} />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-800">
                شريط تبويبات الشاشات المفتوحة (Workspace Tabs Bar)
              </label>
              <p className="text-xs text-slate-500 mt-0.5">
                إظهار شريط علوي أعلى الصفحات لتجميع الشاشات التي تفتحها والتنقل والتبديل السريع بينها أو إغلاقها.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleToggleWorkspaceTabs(!enableWorkspaceTabs)}
            className={`text-3xl transition-colors focus:outline-none ${enableWorkspaceTabs ? 'text-emerald-600' : 'text-slate-300'}`}
            title={enableWorkspaceTabs ? 'انقر لتعطيل الشريط' : 'انقر لتفعيل الشريط'}
          >
            {enableWorkspaceTabs ? <ToggleRight size={40} /> : <ToggleLeft size={40} />}
          </button>
        </div>
      </div>

      <div className="pt-4 text-left">
        <button type="submit" className="bg-blue-900 text-white px-8 py-2.5 rounded-lg hover:bg-blue-800 font-bold shadow-md">
          حفظ التغييرات
        </button>
      </div>
    </form>
  );
};

export default GeneralSettingsTab;
