import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X, Truck, Phone, Check, ChevronDown } from 'lucide-react';
import { normalizeArabic, HighlightedText } from './SupplierSearchSelect';

export interface SupplierFilterOption {
  id: string;
  name: string;
  phone?: string | null;
  code?: string | null;
  tax_number?: string | null;
  taxId?: string | null;
  [key: string]: any;
}

export interface SupplierFilterComboboxProps {
  value: string;
  onChange: (supplierId: string, supplier?: SupplierFilterOption) => void;
  suppliers: SupplierFilterOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export const matchSupplierSmart = (supplier: SupplierFilterOption, searchInput: string): boolean => {
  if (!searchInput) return true;
  const cleanQuery = normalizeArabic(searchInput);
  if (!cleanQuery) return true;

  const normName = normalizeArabic(supplier.name || '');
  const phone = (supplier.phone || '').trim();
  const code = (supplier.code || '').toLowerCase().trim();
  const taxNumber = (supplier.tax_number || supplier.taxId || '').trim();

  // Fast direct match
  if (
    normName.includes(cleanQuery) ||
    phone.includes(cleanQuery) ||
    code.includes(cleanQuery) ||
    taxNumber.includes(cleanQuery)
  ) {
    return true;
  }

  // Multi-word token match
  const tokens = cleanQuery.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    if (tokens.every(token => normName.includes(token))) {
      return true;
    }
  }

  return false;
};

export const SupplierFilterCombobox: React.FC<SupplierFilterComboboxProps> = ({
  value,
  onChange,
  suppliers = [],
  placeholder = 'جميع الموردين',
  disabled = false,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedSupplier = useMemo(() => {
    if (!value) return null;
    return suppliers.find(s => String(s.id) === String(value)) || null;
  }, [value, suppliers]);

  const filteredSuppliers = useMemo(() => {
    if (!searchQuery.trim()) return suppliers;
    return suppliers.filter(s => matchSupplierSmart(s, searchQuery));
  }, [suppliers, searchQuery]);

  // حصر المعروض في القائمة لأول 60 مورد للسرعة القصوى
  const visibleSuppliers = useMemo(() => {
    return filteredSuppliers.slice(0, 60);
  }, [filteredSuppliers]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredSuppliers]);

  // التركيز التلقائي على خانة البحث عند فتح القائمة
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  // إغلاق القائمة عند النقر خارجها
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (supplierId: string, supplier?: SupplierFilterOption) => {
    onChange(supplierId, supplier);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      // +1 لأن الخيار رقم 0 هو "جميع الموردين"
      const maxIndex = visibleSuppliers.length;
      setHighlightedIndex(prev => (prev < maxIndex ? prev + 1 : 0));
      scrollIntoView(highlightedIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const maxIndex = visibleSuppliers.length;
      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : maxIndex));
      scrollIntoView(highlightedIndex - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex === 0) {
        handleSelect('');
      } else if (visibleSuppliers[highlightedIndex - 1]) {
        const item = visibleSuppliers[highlightedIndex - 1];
        handleSelect(item.id, item);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  const scrollIntoView = (index: number) => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll('.combobox-item');
    if (items[index]) {
      (items[index] as HTMLElement).scrollIntoView({ block: 'nearest' });
    }
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* زر المشغل الرئيسي (Trigger Button) */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        className={`w-full p-2 bg-slate-50 border rounded-xl text-xs font-bold outline-none flex items-center justify-between gap-1.5 transition-all text-right ${
          isOpen ? 'border-blue-500 ring-2 ring-blue-100 bg-white' : 'border-slate-200 hover:border-slate-300'
        } ${selectedSupplier ? 'text-blue-900 bg-blue-50/40' : 'text-slate-600'}`}
        title={selectedSupplier ? selectedSupplier.name : placeholder}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <Truck size={14} className={selectedSupplier ? 'text-blue-600 shrink-0' : 'text-slate-400 shrink-0'} />
          <span className="truncate">
            {selectedSupplier ? selectedSupplier.name : placeholder}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {selectedSupplier && !disabled && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClear(e as any); }}
              className="p-0.5 rounded-full hover:bg-blue-200/60 text-blue-600 transition-colors"
              title="إلغاء التصفية بالمورد"
            >
              <X size={12} />
            </span>
          )}
          <ChevronDown
            size={14}
            className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-blue-600' : ''}`}
          />
        </div>
      </button>

      {/* القائمة المنسدلة الذكية */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-1.5 w-72 sm:w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150">
          {/* حقل البحث داخل القائمة */}
          <div className="p-2 border-b border-slate-100 bg-slate-50/70">
            <div className="relative">
              <Search className="absolute right-2.5 top-2.5 text-slate-400" size={14} />
              <input
                ref={inputRef}
                type="text"
                placeholder="ابحث باسم المورد، الهاتف، أو الكود..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full pr-8 pl-7 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-all placeholder:text-slate-400 text-slate-800"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute left-2 top-2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-100"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            <div className="flex items-center justify-between text-[10px] text-slate-400 px-1 pt-1.5">
              <span>بحث ذكي فائق السرعة</span>
              <span>{filteredSuppliers.length} من {suppliers.length} مورد</span>
            </div>
          </div>

          {/* قائمة الموردين */}
          <div ref={listRef} className="max-h-60 overflow-y-auto divide-y divide-slate-50 text-xs">
            {/* خيار "جميع الموردين" */}
            <button
              type="button"
              onClick={() => handleSelect('')}
              className={`combobox-item w-full px-3 py-2 text-right flex items-center justify-between transition-colors ${
                !value ? 'bg-blue-50 text-blue-700 font-bold' : highlightedIndex === 0 ? 'bg-slate-100' : 'hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <Truck size={13} className={!value ? 'text-blue-600' : 'text-slate-400'} />
                <span>جميع الموردين (عرض الكل)</span>
              </div>
              {!value && <Check size={14} className="text-blue-600" />}
            </button>

            {/* عناصر الموردين المفلترة */}
            {visibleSuppliers.map((sup, idx) => {
              const isSelected = String(sup.id) === String(value);
              const isHighlighted = highlightedIndex === idx + 1;

              return (
                <button
                  key={sup.id}
                  type="button"
                  onClick={() => handleSelect(sup.id, sup)}
                  className={`combobox-item w-full px-3 py-2 text-right flex items-center justify-between transition-colors ${
                    isSelected
                      ? 'bg-blue-50 text-blue-700 font-bold'
                      : isHighlighted
                      ? 'bg-slate-100 text-slate-900'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex flex-col min-w-0 flex-1 pl-2">
                    <span className="font-bold truncate">
                      {searchQuery ? (
                        <HighlightedText text={sup.name} query={searchQuery} />
                      ) : (
                        sup.name
                      )}
                    </span>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400 font-mono" dir="ltr">
                      {sup.phone && (
                        <span className="flex items-center gap-1">
                          <Phone size={10} className="text-slate-400" />
                          <span>
                            {searchQuery ? (
                              <HighlightedText text={sup.phone} query={searchQuery} />
                            ) : (
                              sup.phone
                            )}
                          </span>
                        </span>
                      )}
                      {sup.code && (
                        <span className="text-[10px] bg-slate-100 px-1 rounded text-slate-500">
                          {sup.code}
                        </span>
                      )}
                    </div>
                  </div>

                  {isSelected && <Check size={14} className="text-blue-600 shrink-0 mr-1" />}
                </button>
              );
            })}

            {visibleSuppliers.length === 0 && (
              <div className="p-4 text-center text-slate-400 text-xs">
                لا يوجد مورد مطابق لـ "{searchQuery}"
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierFilterCombobox;
