import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X } from 'lucide-react';

interface Option {
  id: string;
  name: string;
  code?: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: React.ReactNode;
  required?: boolean;
  className?: string;
}

const normalizeArabic = (text: string) => {
  return (text || '')
    .replace(/[\u064B-\u065F\u0670]/g, '') // إزالة علامات التشكيل
    .replace(/[أإآ]/g, 'ا') // توحيد الألف
    .replace(/ة/g, 'ه')     // توحيد التاء المربوطة
    .replace(/ى/g, 'ي')     // توحيد الألف المقصورة والياء
    .toLowerCase()
    .trim();
};

const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = "اختر...",
  label,
  required,
  className,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const selectRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(option => option.id === value);
  const displayValue = selectedOption ? `${selectedOption.code ? selectedOption.code + ' - ' : ''}${selectedOption.name}` : '';

  useEffect(() => {
    if (selectedOption) {
      setSearchTerm(displayValue);
    } else {
      setSearchTerm('');
    }
  }, [selectedOption]);

  const normalizedSearch = normalizeArabic(searchTerm);

  const filteredOptions = useMemo(() => {
    if (!normalizedSearch) return options;
    return options.filter(option => {
      const nameNorm = normalizeArabic(option.name);
      const codeNorm = normalizeArabic(option.code || '');
      return nameNorm.includes(normalizedSearch) || codeNorm.includes(normalizedSearch);
    });
  }, [options, normalizedSearch]);

  const visibleOptions = useMemo(() => {
    return filteredOptions.slice(0, 100);
  }, [filteredOptions]);

  const handleSelect = (optionId: string) => {
    onChange(optionId);
    setIsOpen(false);
    const selected = options.find(opt => opt.id === optionId);
    if (selected) {
      setSearchTerm(`${selected.code ? selected.code + ' - ' : ''}${selected.name}`);
    }
  };

  const handleClickOutside = (event: MouseEvent) => {
    if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
      setIsOpen(false);
      // Reset search term if nothing is selected or if the current search term doesn't match a selected option
      if (!selectedOption || !normalizeArabic(displayValue).includes(normalizeArabic(searchTerm))) {
        setSearchTerm(displayValue);
      }
    }
  };

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [value, selectedOption, displayValue, searchTerm]);

  return (
    <div className={`relative ${className}`} ref={selectRef}>
      {label && (
        <label className="block text-xs font-bold text-slate-600 mb-1">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
            onChange(''); // Clear selected value when typing
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          required={required}
          className="w-full border border-blue-200 rounded-lg p-2 text-sm bg-white pr-10 focus:ring-2 focus:ring-blue-500 outline-none"
        />
        <Search className="absolute right-3 top-2.5 text-slate-400 pointer-events-none" size={16} />
        {searchTerm && (
          <button
            type="button"
            onClick={() => {
              setSearchTerm('');
              onChange('');
              setIsOpen(false);
            }}
            className="absolute left-3 top-2.5 text-slate-400 hover:text-red-500"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {isOpen && filteredOptions.length > 0 && (
        <div className="absolute z-20 w-full bg-white border border-slate-200 rounded-lg shadow-lg mt-1 max-h-56 overflow-y-auto">
          {visibleOptions.map(option => (
            <div
              key={option.id}
              onMouseDown={(e) => { // Use onMouseDown to prevent blur event from closing dropdown before click
                e.preventDefault();
                handleSelect(option.id);
              }}
              className="p-2 hover:bg-blue-50 cursor-pointer text-sm"
            >
              {option.code && <span className="font-mono text-slate-500">{option.code} - </span>}
              <span className="font-bold text-slate-800">{option.name}</span>
            </div>
          ))}
          {filteredOptions.length > 100 && (
            <div className="p-2 text-center text-xs text-slate-500 bg-slate-50 border-t sticky bottom-0">
              يتم عرض أول 100 نتيجة من أصل {filteredOptions.length}. اكتب للبحث بمزيد من الدقة...
            </div>
          )}
        </div>
      )}
      {isOpen && filteredOptions.length === 0 && searchTerm && (
        <div className="absolute z-20 w-full bg-white border border-slate-200 rounded-lg shadow-lg mt-1 p-2 text-sm text-slate-500">
          لا توجد نتائج
        </div>
      )}
    </div>
  );
};

export default SearchableSelect;