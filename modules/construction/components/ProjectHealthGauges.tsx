import React from 'react';

interface GaugeProps {
  value: number;
  label: string;
  subLabel: string;
  color: string;
}

const Gauge: React.FC<GaugeProps> = ({ value, label, subLabel, color }) => {
  // تحويل القيمة لزاوية (من 0 إلى 180 درجة)
  // نفترض أن 0.5 هو الحد الأدنى و 1.5 هو الحد الأعلى للعرض المثالي
  const normalizedValue = Math.min(Math.max(value, 0.5), 1.5);
  const percentage = ((normalizedValue - 0.5) / (1.5 - 0.5)) * 100;
  const rotation = (percentage * 1.8) - 90; // من -90 إلى 90 درجة

  const getStatusColor = (v: number) => {
    if (v >= 1) return 'text-emerald-500';
    if (v >= 0.9) return 'text-amber-500';
    return 'text-red-500';
  };

  const getStrokeColor = (v: number) => {
    if (v >= 1) return '#10b981'; // Emerald
    if (v >= 0.9) return '#f59e0b'; // Amber
    return '#ef4444'; // Red
  };

  return (
    <div className="flex flex-col items-center p-4 bg-white rounded-3xl border border-slate-100 shadow-sm">
      <div className="relative w-32 h-20 overflow-hidden">
        {/* القوس الخلفي */}
        <svg className="w-32 h-32 transform -rotate-180" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="#f1f5f9"
            strokeWidth="8"
            strokeDasharray="125.6"
            strokeDashoffset="0"
            strokeLinecap="round"
          />
          {/* القوس الملون */}
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke={getStrokeColor(value)}
            strokeWidth="8"
            strokeDasharray="125.6"
            strokeDashoffset={125.6 - (percentage / 100) * 125.6}
            strokeLinecap="round"
            style={{ transition: 'all 1s ease-in-out' }}
          />
        </svg>
        {/* مؤشر القيمة */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
          <span className={`text-2xl font-black ${getStatusColor(value)}`}>
            {value.toFixed(2)}
          </span>
        </div>
      </div>
      <div className="mt-2 text-center">
        <p className="text-xs font-black text-slate-800 uppercase tracking-widest">{label}</p>
        <p className="text-[10px] font-bold text-slate-400">{subLabel}</p>
      </div>
    </div>
  );
};

interface ProjectHealthGaugesProps {
  cpi: number;
  spi: number;
}

const ProjectHealthGauges: React.FC<ProjectHealthGaugesProps> = ({ cpi, spi }) => {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Gauge 
        value={cpi} 
        label="مؤشر التكلفة (CPI)" 
        subLabel={cpi >= 1 ? 'تحت الميزانية ✅' : 'متجاوز للميزانية ⚠️'} 
        color="emerald" 
      />
      <Gauge 
        value={spi} 
        label="مؤشر الجدول (SPI)" 
        subLabel={spi >= 1 ? 'سابق للجدول 🟢' : 'متأخر زمنياً 🔴'} 
        color="blue" 
      />
    </div>
  );
};

export default ProjectHealthGauges;