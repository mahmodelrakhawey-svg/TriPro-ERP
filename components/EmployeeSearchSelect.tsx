import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { 
  Search, X, User, ChevronDown, Check, Building2, 
  Briefcase, Phone, DollarSign, Sparkles, Filter, 
  AlertCircle 
} from 'lucide-react';

export interface EmployeeOption {
  id: string;
  full_name: string;
  name?: string;
  position?: string;
  department?: string;
  basic_salary?: number;
  phone?: string;
  status?: string;
  outstanding_advances?: number; // إجمالي السلف القائمة غير المسواة
  month_advances?: number;        // إجمالي سلف الشهر الجاري
  [key: string]: any;
}

export interface EmployeeSearchSelectProps {
  value: string;
  onChange: (employeeId: string, employee?: EmployeeOption) => void;
  employees: EmployeeOption[];
  label?: React.ReactNode;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  autoFocus?: boolean;
  showSalaryBadge?: boolean;
  showAdvancesBadge?: boolean;
  theme?: 'blue' | 'emerald' | 'indigo' | 'slate';
}

// 🚀 دالة تطبيع فائقة السرعة للغة العربية والأرقام
export const normalizeArabic = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // إزالة علامات التشكيل والتطويل
    .replace(/[أإآٱ]/g, 'ا')                    // توحيد الألف
    .replace(/ة/g, 'ه')                         // توحيد التاء المربوطة
    .replace(/[ىي]/g, 'ي')                      // توحيد الألف المقصورة والياء
    .toLowerCase()
    .trim();
};

// 🌟 تظليل الحروف والكلمات المطابقة لتسريع الالتقاط البصري
export const HighlightedText: React.FC<{ text: string; query: string }> = ({ text, query }) => {
  if (!text) return null;
  const cleanQuery = normalizeArabic(query);
  if (!cleanQuery) return <span>{text}</span>;

  const words = cleanQuery.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return <span>{text}</span>;

  const regexPattern = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  try {
    const parts = text.split(new RegExp(`(${regexPattern})`, 'gi'));
    return (
      <span>
        {parts.map((part, i) => {
          const isMatch = words.some(w => normalizeArabic(w) === normalizeArabic(part));
          return isMatch ? (
            <mark key={i} className="bg-amber-200 text-slate-900 rounded-sm px-0.5 font-bold">
              {part}
            </mark>
          ) : (
            <span key={i}>{part}</span>
          );
        })}
      </span>
    );
  } catch {
    return <span>{text}</span>;
  }
};

export const EmployeeSearchSelect: React.FC<EmployeeSearchSelectProps> = ({
  value,
  onChange,
  employees = [],
  label = 'الموظف',
  required = false,
  placeholder = 'ابحث بالاسم، القسم، الوظيفة، أو الهاتف...',
  disabled = false,
  className = '',
  autoFocus = false,
  showSalaryBadge = true,
  showAdvancesBadge = true,
  theme = 'blue'
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // الموظف المختار حالياً
  const selectedEmployee = useMemo(() => {
    return employees.find(e => e.id === value);
  }, [employees, value]);

  // تحديث نص الحقل عند تغير الموظف المختار من الخارج
  useEffect(() => {
    if (selectedEmployee) {
      setSearchTerm(selectedEmployee.full_name || selectedEmployee.name || '');
    } else if (!value) {
      setSearchTerm('');
    }
  }, [selectedEmployee, value]);

  // استخراج قائمة الأقسام الفريدة ديناميكياً للفلترة السريعة
  const departments = useMemo(() => {
    const deptSet = new Set<string>();
    employees.forEach(e => {
      const d = (e.department || '').trim();
      if (d) deptSet.add(d);
    });
    return Array.from(deptSet).sort();
  }, [employees]);

  // فلترة الموظفين الذكية والسريعة
  const filteredEmployees = useMemo(() => {
    let result = employees;

    // 1. تصفية حسب القسم المختار إن وجد
    if (selectedDepartment !== 'all') {
      result = result.filter(e => (e.department || '').trim() === selectedDepartment);
    }

    // 2. تصفية حسب نص البحث المطبّع
    const cleanSearch = normalizeArabic(searchTerm);
    if (!cleanSearch) return result;

    return result.filter(emp => {
      const name = normalizeArabic(emp.full_name || emp.name || '');
      const dept = normalizeArabic(emp.department || '');
      const pos = normalizeArabic(emp.position || '');
      const phone = (emp.phone || '').trim();

      return name.includes(cleanSearch) || 
             dept.includes(cleanSearch) || 
             pos.includes(cleanSearch) || 
             phone.includes(cleanSearch);
    });
  }, [employees, selectedDepartment, searchTerm]);

  // إعادة ضبط المؤشر النشط عند تغيير نتائج البحث
  useEffect(() => {
    setActiveIndex(0);
  }, [filteredEmployees.length, selectedDepartment]);

  // إغلاق القائمة عند النقر في الخارج
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        // استعادة الاسم الأصلي إذا لم يكتمل الاختيار
        if (selectedEmployee) {
          setSearchTerm(selectedEmployee.full_name || selectedEmployee.name || '');
        } else {
          setSearchTerm('');
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedEmployee]);

  // التعامل مع الكيبورد (Keyboard Navigation)
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(prev => (prev < filteredEmployees.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(prev => (prev > 0 ? prev - 1 : 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredEmployees[activeIndex]) {
          handleSelect(filteredEmployees[activeIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        if (selectedEmployee) {
          setSearchTerm(selectedEmployee.full_name || selectedEmployee.name || '');
        }
        break;
      case 'Tab':
        setIsOpen(false);
        break;
    }
  }, [isOpen, filteredEmployees, activeIndex, selectedEmployee]);

  // التمرير التلقائي للعنصر النشط في القائمة
  useEffect(() => {
    if (isOpen && listRef.current) {
      const activeEl = listRef.current.children[activeIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [activeIndex, isOpen]);

  // اختيار موظف
  const handleSelect = (emp: EmployeeOption) => {
    onChange(emp.id, emp);
    setSearchTerm(emp.full_name || emp.name || '');
    setIsOpen(false);
  };

  // مسح الاختيار
  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('', undefined);
    setSearchTerm('');
    inputRef.current?.focus();
  };

  // تنسيقات الثيم
  const themeColors = {
    blue: {
      border: 'focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100',
      activeItem: 'bg-blue-50 text-blue-900 border-r-4 border-blue-600',
      chipActive: 'bg-blue-600 text-white shadow-sm',
      chipInactive: 'bg-slate-100 text-slate-600 hover:bg-slate-200'
    },
    emerald: {
      border: 'focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-100',
      activeItem: 'bg-emerald-50 text-emerald-900 border-r-4 border-emerald-600',
      chipActive: 'bg-emerald-600 text-white shadow-sm',
      chipInactive: 'bg-slate-100 text-slate-600 hover:bg-slate-200'
    },
    indigo: {
      border: 'focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100',
      activeItem: 'bg-indigo-50 text-indigo-900 border-r-4 border-indigo-600',
      chipActive: 'bg-indigo-600 text-white shadow-sm',
      chipInactive: 'bg-slate-100 text-slate-600 hover:bg-slate-200'
    },
    slate: {
      border: 'focus-within:border-slate-600 focus-within:ring-2 focus-within:ring-slate-100',
      activeItem: 'bg-slate-100 text-slate-900 border-r-4 border-slate-700',
      chipActive: 'bg-slate-800 text-white shadow-sm',
      chipInactive: 'bg-slate-100 text-slate-600 hover:bg-slate-200'
    }
  }[theme];

  return (
    <div className={`relative ${className}`} ref={containerRef} dir="rtl">
      {/* التسمية ومؤشر عدد الموظفين */}
      <div className="flex justify-between items-center mb-1.5">
        <label className="block text-sm font-bold text-slate-700 flex items-center gap-1.5">
          <User size={15} className="text-blue-600" />
          <span>{label}</span>
          {required && <span className="text-red-500">*</span>}
        </label>
        <span className="text-xs text-slate-400 font-medium">
          {employees.length} موظف متاح
        </span>
      </div>

      {/* حقل الإدخال الرئيسي */}
      <div 
        className={`relative flex items-center bg-white border border-slate-200 rounded-xl transition-all duration-200 shadow-sm ${
          disabled ? 'bg-slate-50 opacity-60 cursor-not-allowed' : 'hover:border-slate-300'
        } ${themeColors.border}`}
      >
        <div className="pr-3 text-slate-400">
          <Search size={18} />
        </div>

        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          disabled={disabled}
          autoFocus={autoFocus}
          placeholder={placeholder}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            if (!isOpen) setIsOpen(true);
            if (value && e.target.value !== (selectedEmployee?.full_name || '')) {
              // مسح القيمة القديمة أثناء الكتابة لاختيار موظف جديد بدقة
              onChange('', undefined);
            }
          }}
          onKeyDown={handleKeyDown}
          className="w-full py-2.5 px-2.5 text-sm bg-transparent outline-none text-slate-800 font-medium placeholder:text-slate-400 placeholder:font-normal"
        />

        {/* زر المسح السريع */}
        {searchTerm && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="p-1.5 ml-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            title="مسح الاختيار"
          >
            <X size={16} />
          </button>
        )}

        {/* سهم فتح القائمة */}
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          className="p-2.5 pl-3 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <ChevronDown size={16} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* القائمة المنسدلة الذكية */}
      {isOpen && !disabled && (
        <div className="absolute z-50 right-0 left-0 mt-1.5 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* شريط الفلاتر السريعة للأقسام */}
          {departments.length > 0 && (
            <div className="p-2 bg-slate-50 border-b border-slate-100 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <div className="flex items-center gap-1 text-xs font-bold text-slate-500 shrink-0 ml-1">
                <Filter size={12} />
                <span>القسم:</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDepartment('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors shrink-0 ${
                  selectedDepartment === 'all' ? themeColors.chipActive : themeColors.chipInactive
                }`}
              >
                الكل ({employees.length})
              </button>
              {departments.map(dept => {
                const count = employees.filter(e => (e.department || '').trim() === dept).length;
                return (
                  <button
                    key={dept}
                    type="button"
                    onClick={() => setSelectedDepartment(dept)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors shrink-0 ${
                      selectedDepartment === dept ? themeColors.chipActive : themeColors.chipInactive
                    }`}
                  >
                    {dept} ({count})
                  </button>
                );
              })}
            </div>
          )}

          {/* قائمة النتائج */}
          <ul 
            ref={listRef}
            className="max-h-64 overflow-y-auto divide-y divide-slate-50 p-1"
          >
            {filteredEmployees.length === 0 ? (
              <li className="p-6 text-center text-slate-400">
                <AlertCircle size={28} className="mx-auto mb-2 text-slate-300" />
                <p className="text-sm font-semibold">لم يتم العثور على أي موظف مطابِق</p>
                <p className="text-xs text-slate-400 mt-1">جرّب البحث باسم آخر أو إزالة فلتر القسم</p>
              </li>
            ) : (
              filteredEmployees.map((emp, index) => {
                const isSelected = emp.id === value;
                const isActive = index === activeIndex;

                return (
                  <li
                    key={emp.id}
                    onClick={() => handleSelect(emp)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`p-2.5 rounded-lg cursor-pointer transition-colors duration-100 ${
                      isSelected 
                        ? 'bg-blue-50 text-blue-900 font-bold' 
                        : isActive 
                        ? 'bg-slate-100 text-slate-900' 
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      {/* بيانات الموظف الأساسية */}
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                          isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {(emp.full_name || emp.name || 'م')[0]}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold truncate flex items-center gap-1.5">
                            <HighlightedText text={emp.full_name || emp.name || ''} query={searchTerm} />
                            {isSelected && <Check size={14} className="text-blue-600 shrink-0" />}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 truncate">
                            {emp.department && (
                              <span className="flex items-center gap-1">
                                <Building2 size={11} className="text-slate-400" />
                                <HighlightedText text={emp.department} query={searchTerm} />
                              </span>
                            )}
                            {emp.position && (
                              <span className="flex items-center gap-1">
                                <Briefcase size={11} className="text-slate-400" />
                                <HighlightedText text={emp.position} query={searchTerm} />
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* الشارات الإحصائية الذكية (الراتب والسلف) */}
                      <div className="flex flex-col items-end gap-1 shrink-0 text-left">
                        {showSalaryBadge && (emp.basic_salary ?? 0) > 0 && (
                          <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                            راتب: {Number(emp.basic_salary).toLocaleString()} ج.م
                          </span>
                        )}
                        {showAdvancesBadge && (emp.outstanding_advances ?? 0) > 0 && (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md border border-amber-200">
                            سلف قائمة: {Number(emp.outstanding_advances).toLocaleString()} ج.م
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })
            )}
          </ul>

          {/* شريط الإحصائية السفلي */}
          <div className="px-3 py-2 bg-slate-50 border-t border-slate-100 flex justify-between items-center text-xs text-slate-500">
            <span>
              عرض <strong className="text-slate-700">{filteredEmployees.length}</strong> من إجمالي {employees.length}
            </span>
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <span>استخدم الأسهم ⬆ ⬇ و Enter للاختيار</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeSearchSelect;
