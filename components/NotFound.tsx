import React from 'react';
import { useNavigate } from 'react-router-dom';

const NotFound: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" dir="rtl">
      <div className="text-center max-w-md mx-auto bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
        {/* رمز الخطأ */}
        <div className="text-7xl font-extrabold text-indigo-600 mb-3 tracking-wider">404</div>
        
        {/* الأيقونة التعبيرية */}
        <div className="text-5xl mb-4">🔍</div>
        
        {/* عنوان الصفحة */}
        <h1 className="text-2xl font-bold text-gray-800 mb-3">
          الصفحة المطلوبة غير موجودة
        </h1>
        
        {/* الوصف الإرشادي */}
        <p className="text-gray-500 mb-8 leading-relaxed text-sm">
          عذراً، الصفحة أو المسار الذي تحاول الوصول إليه غير موجود أو تم نقله. 
          يمكنك العودة إلى لوحة التحكم الرئيسية لمتابعة عملك.
        </p>
        
        {/* أزرار التنقل */}
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => navigate('/')}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium shadow-sm transition-all text-sm flex items-center gap-2"
          >
            <span>🏠</span>
            <span>العودة للرئيسية</span>
          </button>
          <button
            onClick={() => navigate(-1)}
            className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-all text-sm flex items-center gap-2"
          >
            <span>←</span>
            <span>الصفحة السابقة</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
