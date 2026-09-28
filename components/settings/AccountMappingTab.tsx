import React from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import SearchableSelect from '../SearchableSelect';
import { SYSTEM_ACCOUNTS } from '../../context/AccountingContext';
import { SettingsFormData, ACCOUNT_LABELS } from './types';

interface AccountMappingTabProps {
  formData: SettingsFormData;
  handleSave: (e: React.FormEvent) => void;
  handleAutoMapping: () => void;
  handleMappingChange: (key: string, value: string) => void;
  accounts: Array<{ id: string; code: string; name: string; isGroup?: boolean }>;
}

export const AccountMappingTab: React.FC<AccountMappingTabProps> = ({
  formData,
  handleSave,
  handleAutoMapping,
  handleMappingChange,
  accounts,
}) => {
  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-3xl animate-in fade-in" dir="rtl">
      <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h3 className="font-bold text-purple-800 mb-2">توجيه الحسابات الآلي</h3>
          <p className="text-sm text-purple-700">
            هنا يمكنك تحديد الحسابات التي سيستخدمها النظام تلقائياً عند إنشاء الفواتير والسندات. إذا لم يتم تحديد حساب،
            سيستخدم النظام الكود الافتراضي.
          </p>
        </div>
        <button
          type="button"
          onClick={handleAutoMapping}
          className="bg-white text-purple-600 border-2 border-purple-200 px-4 py-2 rounded-xl font-black text-xs hover:bg-purple-50 transition-all flex items-center gap-2 shrink-0 shadow-sm"
          title="البحث عن الحسابات بالأكواد الافتراضية وربطها بضغطة واحدة"
        >
          <RefreshCw size={16} />
          ربط تلقائي
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Object.entries({
          ...SYSTEM_ACCOUNTS,
          CASH_SHORTAGE: '541',
          CASH_SURPLUS_ACC: '441',
          INVENTORY_RAW_MATERIALS: '10301',
          INVENTORY_WIP: '10303',
          INVENTORY_FINISHED_GOODS: '10302',
          LABOR_COST_ALLOCATED: '513',
          WASTAGE_EXPENSE: '5121',
          RETENTION_CUSTOMER: '1249',
          RETENTION_SUBCONTRACTOR: '2229',
          ADVANCE_PAYMENT_SUBCONTRACTOR: '1245',
          EQUIPMENT_INTERNAL_REVENUE: '425',
        }).map(([key, defaultCode]) => {
          const isUnmapped = !formData.accountMappings[key];
          return (
            <div key={key}>
              <SearchableSelect
                label={
                  <span className="flex items-center justify-between w-full">
                    <span>
                      {ACCOUNT_LABELS[key] || key.replace(/_/g, ' ')} ({String(defaultCode)})
                    </span>
                    {isUnmapped && (
                      <span
                        className="text-amber-600 flex items-center gap-1 text-[10px] animate-pulse"
                        title="هذا الحساب غير مربوط يدوياً - سيتم استخدام الكود الافتراضي"
                      >
                        <AlertTriangle size={12} />
                        غير مربوط ⚠️
                      </span>
                    )}
                  </span>
                }
                options={accounts
                  .filter((acc) => !acc.isGroup)
                  .sort((a, b) => a.code.localeCompare(b.code))
                  .map((acc) => ({ id: acc.id, name: acc.name, code: acc.code }))}
                value={formData.accountMappings[key] || ''}
                onChange={(value) => handleMappingChange(key, value)}
                placeholder={`-- الافتراضي (${defaultCode}) --`}
                className="w-full"
              />
            </div>
          );
        })}
      </div>
      <div className="pt-4 text-left">
        <button
          type="submit"
          className="bg-purple-600 text-white px-8 py-2.5 rounded-lg hover:bg-purple-700 font-bold shadow-md"
        >
          حفظ التعيينات
        </button>
      </div>
    </form>
  );
};

export default AccountMappingTab;
