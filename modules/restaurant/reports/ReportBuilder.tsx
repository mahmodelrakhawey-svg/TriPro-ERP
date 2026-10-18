import React, { useState } from 'react';
import { Calendar, Download, Filter, FileText, Table as TableIcon, Share2 } from 'lucide-react';

interface ReportBuilderProps {
  title: string;
  description: string;
  children: React.ReactNode;
  onFilterChange: (filters: { startDate: string; endDate: string }) => void;
  onExport: (format: 'pdf' | 'excel') => void;
}

const ReportBuilder: React.FC<ReportBuilderProps> = ({ 
  title, 
  description, 
  children, 
  onFilterChange, 
  onExport 
}) => {
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const handleApplyFilter = () => {
    onFilterChange({ startDate, endDate });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500" dir="rtl">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-[24px] shadow-sm border border-slate-100">
        <div>
          <h2 className="text-2xl font-black text-slate-800">{title}</h2>
          <p className="text-slate-500 text-sm font-medium">{description}</p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <button 
            onClick={() => onExport('pdf')}
            className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-xl font-bold hover:bg-red-100 transition-colors"
          >
            <FileText size={18} /> PDF
          </button>
          <button 
            onClick={() => onExport('excel')}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl font-bold hover:bg-emerald-100 transition-colors"
          >
            <TableIcon size={18} /> Excel
          </button>
          <button className="p-2 bg-slate-50 text-slate-400 rounded-xl hover:text-blue-600 transition-colors">
            <Share2 size={20} />
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-slate-900 text-white p-4 rounded-2xl flex flex-wrap items-center gap-6 shadow-lg shadow-slate-200">
        <div className="flex items-center gap-3">
          <Calendar size={20} className="text-blue-400" />
          <div className="flex items-center gap-2">
            <input 
              type="date" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-slate-800 border-none rounded-lg px-3 py-1.5 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none" 
            />
            <span className="text-slate-500">إلى</span>
            <input 
              type="date" 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-slate-800 border-none rounded-lg px-3 py-1.5 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none" 
            />
          </div>
        </div>

        <button 
          onClick={handleApplyFilter}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 transition-all"
        >
          <Filter size={18} /> تطبيق الفلتر
        </button>
      </div>

      {/* Report Content Container */}
      <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-1">
            {children}
        </div>
      </div>
    </div>
  );
};

export default ReportBuilder;