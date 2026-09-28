import React from 'react';
import {
  Archive,
  Wrench,
  RotateCcw,
  Zap,
  Trash2,
  Calculator,
  ShieldCheck,
  Database,
  FileSpreadsheet,
  Users,
  Truck,
  Package,
  Download,
  Upload,
  AlertTriangle,
} from 'lucide-react';
import ArchiveManager from '../../services/ArchiveManager';
import { CloudBackup } from './types';

interface SystemMaintenanceTabProps {
  handleCloseYear: () => void;
  supabase: any;
  showToast: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  currentUser: any;
  recalculateAllBalances: () => void;
  refreshSaasSchema: () => void;
  purgeDeletedRecords: () => void;
  handleRecalculateWac: () => void;
  recalculatingWac: boolean;
  handleCreateMissingAccounts: () => void;
  handleFixDatabaseSchema: () => void;
  handleCleanOrphanedOpeningEntries: () => void;
  handleClearDemoData: () => void;
  handleExportList: (type: 'customers' | 'suppliers' | 'products') => void;
  handleCreateCloudBackup: () => void;
  exportData: () => void;
  cloudBackups: CloudBackup[];
  handleRestoreCloudBackup: (b: CloudBackup) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleFactoryReset: () => void;
}

export const SystemMaintenanceTab: React.FC<SystemMaintenanceTabProps> = ({
  handleCloseYear,
  supabase,
  showToast,
  currentUser,
  recalculateAllBalances,
  refreshSaasSchema,
  purgeDeletedRecords,
  handleRecalculateWac,
  recalculatingWac,
  handleCreateMissingAccounts,
  handleFixDatabaseSchema,
  handleCleanOrphanedOpeningEntries,
  handleClearDemoData,
  handleExportList,
  handleCreateCloudBackup,
  exportData,
  cloudBackups,
  handleRestoreCloudBackup,
  fileInputRef,
  handleImport,
  handleFactoryReset,
}) => {
  return (
    <div className="space-y-8 animate-in fade-in" dir="rtl">
      {/* Close Year Section */}
      <div className="bg-amber-50 border border-amber-100 rounded-xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-16 h-16 bg-amber-100 rounded-bl-full -mr-8 -mt-8"></div>
        <h3 className="text-lg font-bold text-amber-800 mb-4 flex items-center gap-2 relative z-10">
          <Archive size={20} /> إقفال السنة المالية
        </h3>
        <p className="text-sm text-amber-800 mb-6 max-w-2xl leading-relaxed">
          تستخدم هذه الميزة عند انتهاء السنة المالية. سيقوم النظام بحساب الأرباح والخسائر، ترحيلها لحقوق الملكية، وإنشاء قيد إقفال لتصفير حسابات النتيجة (الإيرادات والمصروفات).
        </p>
        <button
          onClick={handleCloseYear}
          className="flex items-center gap-2 bg-amber-600 text-white px-6 py-3 rounded-lg hover:bg-amber-700 font-bold shadow-md transition-all"
        >
          <Archive size={18} /> إقفال السنة وفتح سنة جديدة
        </button>
      </div>

      {/* قسم أرشفة البيانات القانونية */}
      <div className="mt-8">
        <ArchiveManager supabase={supabase} showToast={showToast} currentUser={currentUser} />
      </div>

      {/* أدوات الصيانة والربط (SaaS Maintenance) */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 shadow-sm">
        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Wrench size={20} className="text-orange-600" /> أدوات الصيانة والربط (SaaS)
        </h3>
        <p className="text-sm text-slate-600 mb-6 leading-relaxed">
          استخدم هذه الأدوات لإصلاح تضارب البيانات الناتج عن التحديثات، أو لإعادة مطابقة أرصدة العميل مع دفتر الأستاذ وتحديث كاش النظام.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={recalculateAllBalances}
            className="flex items-center gap-2 bg-white text-blue-700 border border-blue-200 px-4 py-3 rounded-lg hover:bg-blue-100 font-bold shadow-sm transition-all"
          >
            <RotateCcw size={18} /> إعادة مطابقة الأرصدة
          </button>
          <button
            onClick={refreshSaasSchema}
            className="flex items-center gap-2 bg-white text-purple-700 border border-purple-200 px-4 py-3 rounded-lg hover:bg-purple-100 font-bold shadow-sm transition-all"
          >
            <Zap size={18} /> تحديث كاش النظام
          </button>
          <button
            onClick={purgeDeletedRecords}
            className="flex items-center gap-2 bg-white text-red-700 border border-red-200 px-4 py-3 rounded-lg hover:bg-red-100 font-bold shadow-sm transition-all"
          >
            <Trash2 size={18} /> تنظيف قاعدة البيانات
          </button>
          <button
            onClick={handleRecalculateWac}
            disabled={recalculatingWac}
            className="flex items-center gap-2 bg-white text-orange-700 border border-orange-200 px-4 py-3 rounded-lg hover:bg-orange-100 font-bold shadow-sm transition-all disabled:opacity-50"
          >
            <Calculator size={18} /> {recalculatingWac ? 'جاري الحساب...' : 'إعادة احتساب تكاليف المخزون (WAC)'}
          </button>
        </div>
      </div>

      {/* System Health Section */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-6">
        <h3 className="text-lg font-bold text-indigo-800 mb-4 flex items-center gap-2">
          <ShieldCheck size={20} /> فحص وإصلاح حسابات النظام
        </h3>
        <p className="text-sm text-indigo-700 mb-6">
          يقوم هذا الإجراء بفحص دليل الحسابات للتأكد من وجود جميع الحسابات الأساسية اللازمة لعمل النظام (مثل النقدية، المبيعات، الضريبة، إلخ) وإنشائها تلقائياً في حال فقدانها.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleCreateMissingAccounts}
            className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 font-bold shadow-md transition-all"
          >
            <RotateCcw size={18} /> فحص وإنشاء الحسابات المفقودة
          </button>
          <button
            onClick={handleFixDatabaseSchema}
            className="flex items-center gap-2 bg-teal-600 text-white px-6 py-3 rounded-lg hover:bg-teal-700 font-bold shadow-md transition-all"
          >
            <Database size={18} /> صيانة وإصلاح قاعدة البيانات
          </button>
          <button
            onClick={handleCleanOrphanedOpeningEntries}
            className="flex items-center gap-2 bg-rose-600 text-white px-6 py-3 rounded-lg hover:bg-rose-700 font-bold shadow-md transition-all"
          >
            <Trash2 size={18} /> تنظيف قيود الأصناف المحذوفة
          </button>
        </div>
      </div>

      {/* Clear Demo Data Section */}
      <div className="bg-orange-50 border border-orange-100 rounded-xl p-6">
        <h3 className="text-lg font-bold text-orange-800 mb-4 flex items-center gap-2">
          <RotateCcw size={20} /> تنظيف البيانات التجريبية (بدء التشغيل)
        </h3>
        <p className="text-sm text-orange-700 mb-6">
          استخدم هذا الخيار عند الانتهاء من تجربة النظام والرغبة في البدء الفعلي. سيتم حذف جميع الفواتير، المنتجات، والعملاء، مع الاحتفاظ بالإعدادات ودليل الحسابات.
        </p>
        <button
          onClick={handleClearDemoData}
          className="flex items-center gap-2 bg-orange-600 text-white px-6 py-3 rounded-lg hover:bg-orange-700 font-bold shadow-md transition-all"
        >
          <Trash2 size={18} /> حذف البيانات التجريبية
        </button>
      </div>

      {/* Export Lists Section */}
      <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-6">
        <h3 className="text-lg font-bold text-emerald-800 mb-4 flex items-center gap-2">
          <FileSpreadsheet size={20} /> تصدير القوائم (Excel)
        </h3>
        <p className="text-sm text-emerald-700 mb-6">
          تصدير بيانات العملاء، الموردين، والأصناف إلى ملفات Excel للاستخدام الخارجي.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => handleExportList('customers')}
            className="flex items-center gap-2 bg-white text-emerald-700 border border-emerald-200 px-4 py-2 rounded-lg hover:bg-emerald-100 font-bold shadow-sm transition-all"
          >
            <Users size={18} /> تصدير العملاء
          </button>
          <button
            onClick={() => handleExportList('suppliers')}
            className="flex items-center gap-2 bg-white text-emerald-700 border border-emerald-200 px-4 py-2 rounded-lg hover:bg-emerald-100 font-bold shadow-sm transition-all"
          >
            <Truck size={18} /> تصدير الموردين
          </button>
          <button
            onClick={() => handleExportList('products')}
            className="flex items-center gap-2 bg-white text-emerald-700 border border-emerald-200 px-4 py-2 rounded-lg hover:bg-emerald-100 font-bold shadow-sm transition-all"
          >
            <Package size={18} /> تصدير الأصناف
          </button>
        </div>
      </div>

      {/* Data Backup Section */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-6">
        <h3 className="text-lg font-bold text-blue-800 mb-4 flex items-center gap-2">
          <Download size={20} /> النسخ الاحتياطي واستعادة البيانات
        </h3>
        <p className="text-sm text-blue-600 mb-6">
          حفاظاً على حقوقك وملكية البيانات، يمكنك تحميل نسخة كاملة من قاعدة البيانات بصيغة JSON والاحتفاظ بها على جهازك الشخصي، أو استعادتها عند الحاجة.
        </p>

        <div className="flex flex-wrap gap-4 items-center">
          <button
            onClick={handleCreateCloudBackup}
            className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-lg hover:bg-emerald-700 font-bold shadow-md transition-all"
          >
            <Database size={18} /> إنشاء نسخة سحابية
          </button>

          <button
            onClick={exportData}
            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-bold shadow-md transition-all"
          >
            <Download size={18} /> تصدير قاعدة البيانات
          </button>

          <div className="relative">
            <input
              type="file"
              ref={fileInputRef}
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 bg-white text-blue-700 border border-blue-300 px-6 py-3 rounded-lg hover:bg-blue-50 font-bold shadow-sm transition-all"
            >
              <Upload size={18} /> استيراد نسخة احتياطية
            </button>
          </div>
        </div>

        {cloudBackups.length > 0 && (
          <div className="mt-4 w-full border-t border-blue-100 pt-4">
            <h4 className="font-bold text-blue-800 mb-3 text-sm">آخر النسخ السحابية المتوفرة:</h4>
            <div className="space-y-2">
              {cloudBackups.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between bg-white p-3 rounded-lg border border-blue-100 shadow-sm"
                >
                  <div>
                    <div className="font-bold text-xs text-slate-700">
                      {new Date(b.backup_date).toLocaleString('ar-EG')}
                    </div>
                    <div className="text-[10px] text-slate-400">الحجم: {b.file_size_kb.toFixed(2)} KB</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleRestoreCloudBackup(b)}
                      className="px-3 py-1 bg-orange-50 text-orange-600 border border-orange-200 rounded-md text-[10px] font-black hover:bg-orange-100 transition-colors"
                    >
                      استعادة النسخة
                    </button>
                    <button
                      onClick={() => {
                        const blob = new Blob([JSON.stringify(b.backup_data)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `backup_${new Date(b.backup_date).toISOString()}.json`;
                        a.click();
                      }}
                      className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors"
                      title="تحميل الملف"
                    >
                      <Download size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Danger Zone */}
      <div className="bg-red-50 border border-red-100 rounded-xl p-6">
        <h3 className="text-lg font-bold text-red-800 mb-4 flex items-center gap-2">
          <AlertTriangle size={20} /> منطقة الخطر (إعادة ضبط المصنع)
        </h3>
        <p className="text-sm text-red-600 mb-6">
          هذا الإجراء سيقوم بمسح جميع البيانات (العملاء، الموردين، الفواتير، الحسابات) وإعادة النظام إلى حالته الأولية. لا يمكن التراجع عن هذا الإجراء.
        </p>

        <button
          onClick={handleFactoryReset}
          className="flex items-center gap-2 bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 font-bold shadow-md transition-all"
        >
          <RotateCcw size={18} /> إعادة ضبط المصنع (مسح الكل)
        </button>
      </div>
    </div>
  );
};

export default SystemMaintenanceTab;
