import React from 'react';
import { RotateCcw, PlayCircle } from 'lucide-react';

interface DemoModeTabProps {
  handleResetDemoData: () => void;
  runRestaurantModuleTest: () => void;
}

export const DemoModeTab: React.FC<DemoModeTabProps> = ({
  handleResetDemoData,
  runRestaurantModuleTest,
}) => {
  return (
    <div className="space-y-6 animate-in fade-in" dir="rtl">
      <div className="bg-amber-50 border border-amber-100 rounded-xl p-6">
        <h3 className="text-lg font-bold text-amber-800 mb-4 flex items-center gap-2">
          <RotateCcw size={20} /> إعادة ضبط بيانات الديمو
        </h3>
        <p className="text-sm text-amber-700 mb-6">
          استخدم هذا الزر لإعادة قاعدة البيانات إلى حالتها الافتراضية (حذف جميع الفواتير والقيود والعملاء الجدد) مع
          الاحتفاظ بالإعدادات الأساسية. مفيد لتنظيف النسخة التجريبية.
        </p>
        <button
          onClick={handleResetDemoData}
          className="bg-amber-600 text-white px-6 py-3 rounded-lg hover:bg-amber-700 font-bold shadow-md transition-all flex items-center gap-2"
        >
          <RotateCcw size={18} /> تنفيذ إعادة الضبط الآن
        </button>
      </div>

      {/* Demo Test Section */}
      <div className="bg-teal-50 border border-teal-100 rounded-xl p-6">
        <h3 className="text-lg font-bold text-teal-800 mb-4 flex items-center gap-2">
          <PlayCircle size={20} /> اختبار آلي للموديولات
        </h3>
        <p className="text-sm text-teal-700 mb-6">
          قم بتشغيل اختبارات شاملة للتأكد من أن جميع أجزاء النظام تعمل بشكل صحيح. ستظهر النتائج في لوحة التحكم (Console).
        </p>
        <button
          onClick={runRestaurantModuleTest}
          className="flex items-center gap-2 bg-teal-600 text-white px-6 py-3 rounded-lg hover:bg-teal-700 font-bold shadow-md transition-all"
        >
          <PlayCircle size={18} /> تشغيل اختبار موديول المطاعم
        </button>
      </div>
    </div>
  );
};

export default DemoModeTab;
