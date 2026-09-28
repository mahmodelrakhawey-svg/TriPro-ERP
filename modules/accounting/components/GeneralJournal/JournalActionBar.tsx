import React from 'react';
import { BookOpen, User, Filter, X, Trash2, AlertTriangle, Loader2, Printer, Download, RefreshCw, ArrowRightLeft } from 'lucide-react';

export interface JournalActionBarProps {
  users: Array<{ id: string; name: string }>;
  selectedUser: string;
  setSelectedUser: (val: string) => void;
  searchTerm: string;
  setSearchTerm: (val: string) => void;
  setDebouncedSearch: (val: string) => void;
  onPageReset: () => void;
  showAdvanced: boolean;
  setShowAdvanced: React.Dispatch<React.SetStateAction<boolean>>;
  isCleaningSuppliers: boolean;
  onCleanSuppliers: () => void;
  isCleaningDuplicates: boolean;
  onCleanDuplicates: () => void;
  isCleaningAssets: boolean;
  onCleanAssets: () => void;
  isExporting: boolean;
  onExportExcel: () => void;
  isRefreshing: boolean;
  onRefresh: () => void;
  onOpenCurrencyRevaluation?: () => void;
}

export const JournalActionBar: React.FC<JournalActionBarProps> = ({
  users,
  selectedUser,
  setSelectedUser,
  searchTerm,
  setSearchTerm,
  setDebouncedSearch,
  onPageReset,
  showAdvanced,
  setShowAdvanced,
  isCleaningSuppliers,
  onCleanSuppliers,
  isCleaningDuplicates,
  onCleanDuplicates,
  isCleaningAssets,
  onCleanAssets,
  isExporting,
  onExportExcel,
  isRefreshing,
  onRefresh,
  onOpenCurrencyRevaluation
}) => {
  return (
    <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
      <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
        <BookOpen className="text-blue-600" />
        دفتر اليومية العام
      </h1>
      <div className="flex flex-wrap items-center gap-2">
        {/* User filter */}
        <div className="relative">
          <select
            value={selectedUser}
            onChange={(e) => { setSelectedUser(e.target.value); onPageReset(); }}
            className="pl-8 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 text-sm appearance-none bg-white transition-all h-full"
            dir="rtl"
          >
            <option value="">كل المستخدمين</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <div className="absolute left-2 top-2.5 text-slate-400 pointer-events-none">
            <User size={16} />
          </div>
        </div>

        {/* Search input */}
        <div className="relative flex items-center">
          <input 
            type="text" 
            placeholder="بحث برقم القيد، المبلغ، أو البيان..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 pr-8 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 text-sm w-64 transition-all"
          />
          <Filter className="absolute right-2.5 top-2.5 text-slate-400" size={16} />
          {searchTerm && (
            <button 
              onClick={() => { setSearchTerm(''); setDebouncedSearch(''); }}
              className="absolute left-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              title="مسح البحث"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Clean Orphan Suppliers */}
        <button 
          onClick={onCleanSuppliers}
          disabled={isCleaningSuppliers}
          className="flex items-center gap-1.5 bg-rose-50 border border-rose-300 text-rose-800 px-3 py-2 rounded-lg hover:bg-rose-100 disabled:opacity-60 font-bold text-xs shadow-xs transition-all"
          title="فحص وتنظيف قيود الأرصدة الافتتاحية للموردين المحذوفين (مثل شركة هاي مكس)"
        >
          {isCleaningSuppliers ? <Loader2 size={15} className="animate-spin text-rose-600" /> : <Trash2 size={15} className="text-rose-600" />}
          <span>تنظيف قيود الموردين المحذوفة</span>
        </button>

        {/* Clean Duplicate Cheques */}
        <button 
          onClick={onCleanDuplicates}
          disabled={isCleaningDuplicates}
          className="flex items-center gap-1.5 bg-amber-50 border border-amber-300 text-amber-800 px-3 py-2 rounded-lg hover:bg-amber-100 disabled:opacity-60 font-bold text-xs shadow-xs transition-all"
          title="فحص وتنظيف قيود الشيكات المكررة والإبقاء على قيد واحد فقط لكل شيك"
        >
          {isCleaningDuplicates ? <Loader2 size={15} className="animate-spin text-amber-600" /> : <AlertTriangle size={15} className="text-amber-600" />}
          <span>تنظيف مكررات الشيكات</span>
        </button>

        {/* Clean Orphaned Assets */}
        <button 
          onClick={onCleanAssets}
          disabled={isCleaningAssets}
          className="flex items-center gap-1.5 bg-rose-50 border border-rose-300 text-rose-800 px-3 py-2 rounded-lg hover:bg-rose-100 disabled:opacity-60 font-bold text-xs shadow-xs transition-all"
          title="فحص وتنظيف قيود الأصول الثابتة المحذوفة أو المعلقة لتصحيح ميزان المراجعة"
        >
          {isCleaningAssets ? <Loader2 size={15} className="animate-spin text-rose-600" /> : <AlertTriangle size={15} className="text-rose-600" />}
          <span>تنظيف قيود الأصول الملغاة</span>
        </button>

        {/* Currency Revaluation (EAS 13) */}
        {onOpenCurrencyRevaluation && (
          <button 
            onClick={onOpenCurrencyRevaluation}
            className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-300 text-indigo-800 px-3.5 py-2 rounded-lg hover:bg-indigo-100 font-bold text-xs shadow-xs transition-all"
            title="معالج إعادة تقييم فروق أسعار صرف العملات الأجنبية وفق معيار المحاسبة المصري EAS 13"
          >
            <ArrowRightLeft size={15} className="text-indigo-600" />
            <span>إعادة تقييم فروق العملة (EAS 13)</span>
          </button>
        )}

        {/* Advanced Filters Toggle */}
        <button 
          onClick={() => setShowAdvanced(prev => !prev)} 
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-bold text-xs transition-all border ${showAdvanced ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}
        >
          <Filter size={15} />
          {showAdvanced ? 'إخفاء الفلاتر' : 'فلاتر متقدمة'}
        </button>

        {/* Print Screen */}
        <button onClick={() => window.print()} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-bold text-sm">
          <Printer size={16} /> طباعة
        </button>

        {/* Export Excel */}
        <button 
          onClick={onExportExcel} 
          disabled={isExporting}
          className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-60 font-bold text-sm shadow-sm transition-all"
          title="تصدير جميع القيود المحاسبية المطابقة للفلاتر إلى ملف Excel"
        >
          {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          {isExporting ? 'جاري التصدير...' : 'تصدير Excel'}
        </button>

        {/* Refresh Data */}
        <button 
          onClick={onRefresh} 
          className="flex items-center gap-2 bg-white border border-slate-300 text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-50 font-bold text-sm transition-colors"
          title="تحديث البيانات من الخادم"
        >
          <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
        </button>
      </div>
    </div>
  );
};
