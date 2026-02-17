import React from 'react';
import { Info } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const DemoModeBanner = () => {
  const { userRole } = useAuth();

  if (userRole !== 'demo') {
    return null;
  }

  return (
    <div className="bg-amber-100 border-b-2 border-amber-200 text-amber-900 px-4 py-3 w-full sticky top-0 z-50" role="alert" dir="rtl">
      <div className="flex items-center container mx-auto">
        <Info className="h-5 w-5 text-amber-500 ml-3" />
        <div>
          <p className="font-bold text-sm">أنت في وضع النسخة التجريبية (Demo)</p>
          <p className="text-xs">سيتم إعادة تعيين جميع البيانات التي تدخلها عند تسجيل الخروج.</p>
        </div>
      </div>
    </div>
  );
};

export default DemoModeBanner;