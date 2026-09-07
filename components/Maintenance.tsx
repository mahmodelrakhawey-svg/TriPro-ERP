import React, { useState, useEffect } from 'react';
import { AlertTriangle, Clock } from 'lucide-react';

const Maintenance = () => {
  const calculateTimeLeft = () => {
    // للتجربة، سنفترض أن الصيانة تنتهي بعد ساعتين من الآن
    // في التطبيق الفعلي، يمكن جلب هذا التاريخ من متغير بيئي أو API
    const maintenanceEndTime = new Date(new Date().getTime() + 2 * 60 * 60 * 1000);
    
    const difference = +maintenanceEndTime - +new Date();
    let timeLeft: { hours?: number; minutes?: number; seconds?: number } = {};

    if (difference > 0) {
      timeLeft = {
        hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((difference / 1000 / 60) % 60),
        seconds: Math.floor((difference / 1000) % 60)
      };
    }

    return timeLeft;
  };

  const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());

  useEffect(() => {
    const timer = setTimeout(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearTimeout(timer);
  });

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 text-center" dir="rtl">
      <div className="bg-white p-8 rounded-3xl shadow-xl max-w-lg w-full border border-slate-100 animate-in zoom-in duration-300">
        <div className="w-24 h-24 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce">
          <AlertTriangle className="w-12 h-12 text-amber-500" />
        </div>
        <h1 className="text-3xl font-black text-slate-800 mb-4">النظام تحت الصيانة حالياً</h1>
        <p className="text-slate-500 mb-8 leading-relaxed font-medium">
          نحن نقوم حالياً بإجراء بعض التحسينات والتحديثات الهامة على النظام لضمان تقديم أفضل تجربة لكم.
        </p>
        
        {Object.keys(timeLeft).length > 0 && (
          <div className="flex justify-center gap-4 my-8">
            {Object.entries(timeLeft).map(([interval, value]) => (
              <div key={interval} className="text-center">
                <div className="text-4xl font-black text-amber-600 bg-amber-50 p-4 rounded-2xl w-20 h-20 flex items-center justify-center">
                  {String(value).padStart(2, '0')}
                </div>
                <div className="text-xs font-bold text-slate-500 mt-2 uppercase">
                  {interval === 'hours' ? 'ساعات' : interval === 'minutes' ? 'دقائق' : 'ثواني'}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-center gap-2 text-sm font-bold text-slate-400 bg-slate-50 py-4 rounded-2xl">
          <Clock size={18} />
          <span>نعتذر عن الإزعاج، يرجى المحاولة لاحقاً</span>
        </div>
      </div>
    </div>
  );
};

export default Maintenance;