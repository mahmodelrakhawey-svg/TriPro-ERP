import React, { useState, useRef, useEffect } from 'react';
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
  label?: string;
  required?: boolean;
  className?: string;
}

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

  const filteredOptions = options.filter(option =>
    (option.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
     (option.code && option.code.toLowerCase().includes(searchTerm.toLowerCase())))
  );

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
      if (!selectedOption || !displayValue.toLowerCase().includes(searchTerm.toLowerCase())) {
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
        <div className="absolute z-20 w-full bg-white border border-slate-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
          {filteredOptions.map(option => (
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