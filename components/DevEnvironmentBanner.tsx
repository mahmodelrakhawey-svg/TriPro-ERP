import React from 'react';
import { supabaseUrl } from '../supabaseClient';

export const DevEnvironmentBanner: React.FC = () => {
  // تظهر الشارة فقط وحصرياً إذا كان الاتصال بقاعدة بيانات التطوير المعزولة
  const isDevDb = Boolean(supabaseUrl && supabaseUrl.includes('jsgmrspnthtlsracbmcq'));
  
  if (!isDevDb) return null;

  const dbRef = supabaseUrl ? supabaseUrl.replace('https://', '').split('.')[0] : 'dev';

  return (
    <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-white px-4 py-1.5 text-xs font-bold flex items-center justify-between shadow-md z-50 print:hidden select-none border-b border-orange-400">
      <div className="flex items-center gap-2.5">
        <span className="flex h-2.5 w-2.5 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
        </span>
        <span className="bg-black/30 px-2 py-0.5 rounded text-[11px] font-mono tracking-wide border border-white/20">
          🛠️ بيئة التطوير (DEVELOPMENT)
        </span>
        <span className="hidden sm:inline text-amber-100 font-medium">
          أنت تعمل بأمان على قاعدة بيانات تجريبية معزولة
        </span>
      </div>
      <div className="flex items-center gap-2 font-mono text-[11px] text-amber-100 bg-black/30 px-3 py-0.5 rounded-full border border-white/10">
        <span className="text-amber-200">القاعدة:</span>
        <span className="text-white font-bold tracking-wider">{dbRef}</span>
      </div>
    </div>
  );
};
