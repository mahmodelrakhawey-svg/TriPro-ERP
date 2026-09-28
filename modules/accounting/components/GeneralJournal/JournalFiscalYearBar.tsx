import React from 'react';
import { Calendar } from 'lucide-react';

export interface JournalFiscalYearBarProps {
  selectedFiscalYear: number;
  lastClosedYear?: number | null;
  startDate: string;
  endDate: string;
  setStartDate: (date: string) => void;
  setEndDate: (date: string) => void;
}

export const JournalFiscalYearBar: React.FC<JournalFiscalYearBarProps> = ({
  selectedFiscalYear,
  lastClosedYear,
  startDate,
  endDate,
  setStartDate,
  setEndDate
}) => {
  const isClosed = Boolean(lastClosedYear && selectedFiscalYear <= lastClosedYear);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-blue-50/70 border border-blue-200/80 px-4 py-2.5 rounded-2xl mb-4 text-xs font-bold text-slate-700 shadow-sm animate-in fade-in">
      <div className="flex items-center gap-2">
        <Calendar size={16} className="text-blue-600 shrink-0" />
        <span>عرض قيود السنة المالية:</span>
        <span className="bg-white px-2.5 py-0.5 rounded-lg border border-blue-200 text-blue-800 font-mono font-black text-sm shadow-xs">
          {selectedFiscalYear}
        </span>
        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black ${isClosed ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'}`}>
          {isClosed ? 'سنة مغلقة 🔒' : 'سنة نشطة 🟢'}
        </span>
        {startDate && endDate && (
          <span className="text-slate-500 font-medium hidden md:inline">
            (الفترة: {startDate} إلى {endDate})
          </span>
        )}
      </div>
      
      <div className="flex items-center gap-2">
        {(startDate !== '' || endDate !== '') ? (
          <button 
            onClick={() => { setStartDate(''); setEndDate(''); }}
            className="text-blue-700 hover:text-blue-900 bg-white/80 hover:bg-white px-3 py-1 rounded-lg border border-blue-200 transition-colors text-xs"
          >
            عرض كل السنوات (إلغاء حصر السنة)
          </button>
        ) : (
          <button 
            onClick={() => { setStartDate(`${selectedFiscalYear}-01-01`); setEndDate(`${selectedFiscalYear}-12-31`); }}
            className="bg-blue-600 text-white px-3 py-1 rounded-lg text-xs hover:bg-blue-700 font-bold transition-colors"
          >
            إعادة حصر سنة {selectedFiscalYear} فقط
          </button>
        )}
      </div>
    </div>
  );
};
