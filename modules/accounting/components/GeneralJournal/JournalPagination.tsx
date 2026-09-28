import React, { useState } from 'react';
import { ChevronsRight, ChevronRight, ChevronLeft, ChevronsLeft } from 'lucide-react';

export interface JournalPaginationProps {
  currentCount: number;
  totalCount: number;
  pageSize: number;
  setPageSize: (size: number) => void;
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  totalPages: number;
  loading: boolean;
  toast: any;
}

export const JournalPagination: React.FC<JournalPaginationProps> = ({
  currentCount,
  totalCount,
  pageSize,
  setPageSize,
  page,
  setPage,
  totalPages,
  loading,
  toast
}) => {
  const [pageInput, setPageInput] = useState('');

  return (
    <div className="bg-slate-50 p-4 border-t border-slate-200 flex flex-col md:flex-row items-center justify-between gap-4 rounded-xl mt-4 shadow-xs">
      <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-slate-600">
        <span>عرض {currentCount} من أصل {totalCount} قيد</span>
        
        <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-2.5 py-1 rounded-lg">
          <span className="text-slate-400">لكل صفحة:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="bg-transparent font-bold text-blue-700 outline-none cursor-pointer text-xs"
          >
            <option value={20}>20 قيد</option>
            <option value={50}>50 قيد</option>
            <option value={100}>100 قيد</option>
            <option value={200}>200 قيد</option>
          </select>
        </div>
      </div>

      {/* Jump to Page & Nav Buttons */}
      <div className="flex flex-wrap items-center gap-1.5">
        {/* First Page */}
        <button 
          onClick={() => setPage(1)} 
          disabled={page === 1 || loading} 
          className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white text-slate-600 transition-colors"
          title="الصفحة الأولى"
        >
          <ChevronsRight size={17} />
        </button>
        {/* Previous Page */}
        <button 
          onClick={() => setPage(p => Math.max(1, p - 1))} 
          disabled={page === 1 || loading} 
          className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white text-slate-600 transition-colors"
          title="الصفحة السابقة"
        >
          <ChevronRight size={17} />
        </button>

        {/* Direct Page Input Form */}
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            const p = parseInt(pageInput, 10);
            if (!isNaN(p) && p >= 1 && p <= totalPages) {
              setPage(p);
              setPageInput('');
            } else {
              toast.error(`رقم الصفحة يجب أن يكون بين 1 و ${totalPages || 1}`);
            }
          }}
          className="flex items-center gap-1 mx-1.5"
        >
          <span className="text-xs text-slate-500 font-bold">صفحة</span>
          <input 
            type="number" 
            min={1} 
            max={totalPages || 1}
            placeholder={String(page)}
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            className="w-14 text-center border border-slate-300 rounded-lg px-1.5 py-1 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500 bg-white shadow-xs"
          />
          <span className="text-xs text-slate-500 font-bold">من {totalPages || 1}</span>
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded-lg text-xs font-bold transition-colors shadow-xs"
          >
            انتقال
          </button>
        </form>

        {/* Next Page */}
        <button 
          onClick={() => setPage(p => Math.min(totalPages, p + 1))} 
          disabled={page === totalPages || loading || totalPages === 0} 
          className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white text-slate-600 transition-colors"
          title="الصفحة التالية"
        >
          <ChevronLeft size={17} />
        </button>
        {/* Last Page */}
        <button 
          onClick={() => setPage(totalPages)} 
          disabled={page === totalPages || loading || totalPages === 0} 
          className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white text-slate-600 transition-colors"
          title="الصفحة الأخيرة"
        >
          <ChevronsLeft size={17} />
        </button>
      </div>
    </div>
  );
};
