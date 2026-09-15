import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X, Package, Barcode, Check, Layers } from 'lucide-react';
import { Product } from '../types';

export interface ProductSearchSelectProps {
  products: Product[];
  value: string;
  onChange: (productId: string, product?: Product) => void;
  warehouseId?: string;
  placeholder?: string;
  filterAvailableOnly?: boolean;
  disabled?: boolean;
  className?: string;
  autoFocus?: boolean;
  onEnterSelect?: (product: Product) => void;
  clearOnSelect?: boolean;
  showAllOption?: boolean;
  allOptionLabel?: string;
  inputRef?: React.RefObject<HTMLInputElement>;
}

// تطبيع متقدم وشامل للغة العربية والأرقام والرموز لتسريع الفرز والمطابقة اللحظية
export const normalizeArabic = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // إزالة التشكيل والتطويل (ـ)
    .replace(/[أإآٱ]/g, 'ا')                    // توحيد الألف
    .replace(/ة/g, 'ه')                         // توحيد التاء المربوطة
    .replace(/[ىي]/g, 'ي')                      // توحيد الألف المقصورة والياء
    .toLowerCase()
    .trim();
};

// تظليل الحروف والكلمات المطابقة للبحث
const HighlightedText: React.FC<{ text: string; query: string }> = ({ text, query }) => {
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
            <mark key={i} className="bg-yellow-200 text-slate-900 rounded-sm px-0.5 font-bold">
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

export const getProductWarehouseStock = (product: any, warehouseId?: string): number => {
  if (!product) return 0;
  if (!warehouseId) return product.stock ?? 0;
  const stockMap = product.warehouse_stock || product.warehouseStock;
  if (stockMap && typeof stockMap === 'object' && warehouseId in stockMap) {
    return Number(stockMap[warehouseId] || 0);
  }
  return 0;
};

export const ProductSearchSelect: React.FC<ProductSearchSelectProps> = ({
  products,
  value,
  onChange,
  warehouseId,
  placeholder = 'ابحث بالاسم، الكود (SKU)، أو الباركود...',
  filterAvailableOnly = false,
  disabled = false,
  className = '',
  autoFocus = false,
  onEnterSelect,
  clearOnSelect = false,
  showAllOption = false,
  allOptionLabel = '-- كل الأصناف --',
  inputRef: externalInputRef
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const internalInputRef = useRef<HTMLInputElement>(null);
  const activeInputRef = externalInputRef || internalInputRef;
  const listRef = useRef<HTMLDivElement>(null);

  const selectedProduct = useMemo(() => {
    return products.find(p => p.id === value);
  }, [products, value]);

  // تحديث نص الحقل عند تغير الصنف المختار من الخارج
  useEffect(() => {
    if (selectedProduct) {
      if (!clearOnSelect) {
        const codePart = selectedProduct.sku ? `[${selectedProduct.sku}] ` : '';
        setSearchTerm(`${codePart}${selectedProduct.name}`);
      }
    } else if (showAllOption && value === '') {
      if (!clearOnSelect) {
        setSearchTerm(allOptionLabel);
      }
    } else if (!isOpen && !clearOnSelect) {
      setSearchTerm('');
    }
  }, [selectedProduct, isOpen, clearOnSelect, showAllOption, value, allOptionLabel]);

  // 🚀 الفهرسة المسبقة الفائقة السرعة في الذاكرة (Pre-indexed Search Corpus)
  const indexedProducts = useMemo(() => {
    return (products || []).map(p => {
      const normName = normalizeArabic(p.name || '');
      const normSku = normalizeArabic(p.sku || '');
      const normBarcode = normalizeArabic(p.barcode || '');
      const normBarcode2 = normalizeArabic((p as any).barcode2 || '');
      
      const normUnitBarcodes = Array.isArray((p as any).unit_barcodes)
        ? (p as any).unit_barcodes.map((ub: any) => normalizeArabic(ub?.barcode || '')).filter(Boolean).join(' ')
        : '';

      const fullSearchable = `${normName} ${normSku} ${normBarcode} ${normBarcode2} ${normUnitBarcodes}`;
      const stock = getProductWarehouseStock(p, warehouseId);

      return {
        product: p,
        normName,
        normSku,
        normBarcode,
        fullSearchable,
        stock
      };
    });
  }, [products, warehouseId]);

  // 🚀 التصفية اللحظية بالكلمات المجزأة (Token-based Instant Matching)
  const filteredProducts = useMemo(() => {
    let list = indexedProducts;

    if (filterAvailableOnly && warehouseId) {
      list = list.filter(item => item.stock > 0);
    }

    const cleanQuery = normalizeArabic(searchTerm);
    if (!cleanQuery || (selectedProduct && !isOpen && searchTerm.includes(selectedProduct.name))) {
      return list;
    }

    const tokens = cleanQuery.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return list;

    return list.filter(item => {
      return tokens.every(token => item.fullSearchable.includes(token));
    });
  }, [indexedProducts, searchTerm, filterAvailableOnly, warehouseId, selectedProduct, isOpen]);

  // عرض أول 50 نتيجة لمنع تجميد المتصفح وضمان السرعة اللحظية
  const visibleItems = useMemo(() => {
    return filteredProducts.slice(0, 50);
  }, [filteredProducts]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredProducts]);

  const handleSelect = (product: Product | null) => {
    if (!product) {
      onChange('');
      setSearchTerm(showAllOption ? allOptionLabel : '');
      setIsOpen(false);
      return;
    }

    onChange(product.id, product);

    if (clearOnSelect) {
      setSearchTerm('');
    } else {
      const codePart = product.sku ? `[${product.sku}] ` : '';
      setSearchTerm(`${codePart}${product.name}`);
    }

    setIsOpen(false);

    if (onEnterSelect) {
      onEnterSelect(product);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
      }
      return;
    }

    const maxIndex = showAllOption ? visibleItems.length : visibleItems.length - 1;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev + 1 <= maxIndex ? prev + 1 : 0));
      scrollHighlightedIntoView(highlightedIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : maxIndex));
      scrollHighlightedIntoView(highlightedIndex - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (showAllOption && highlightedIndex === 0) {
        handleSelect(null);
      } else {
        const itemIdx = showAllOption ? highlightedIndex - 1 : highlightedIndex;
        if (visibleItems[itemIdx]) {
          handleSelect(visibleItems[itemIdx].product);
        }
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const scrollHighlightedIntoView = (index: number) => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll('.product-select-item');
    if (items[index]) {
      (items[index] as HTMLElement).scrollIntoView({ block: 'nearest' });
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        if (selectedProduct) {
          if (!clearOnSelect) {
            const codePart = selectedProduct.sku ? `[${selectedProduct.sku}] ` : '';
            setSearchTerm(`${codePart}${selectedProduct.name}`);
          }
        } else if (showAllOption && value === '') {
          setSearchTerm(allOptionLabel);
        } else if (!clearOnSelect) {
          setSearchTerm('');
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedProduct, clearOnSelect, showAllOption, value, allOptionLabel]);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <div className="relative">
        <input
          ref={activeInputRef}
          type="text"
          value={searchTerm}
          disabled={disabled}
          autoFocus={autoFocus}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
            if (!e.target.value) {
              onChange('');
            }
          }}
          onFocus={(e) => {
            setIsOpen(true);
            e.target.select();
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full border border-slate-200 focus:border-blue-500 rounded-xl py-2.5 pr-10 pl-9 text-sm bg-white focus:ring-2 focus:ring-blue-100 outline-none transition-all shadow-sm font-bold text-slate-800 disabled:bg-slate-100 disabled:cursor-not-allowed placeholder:font-normal placeholder:text-xs placeholder:text-slate-400"
        />

        <div className="absolute right-3 top-3 text-slate-400 pointer-events-none">
          <Search size={16} />
        </div>

        {searchTerm && !disabled && (
          <button
            type="button"
            onClick={() => {
              setSearchTerm('');
              onChange('');
              setIsOpen(false);
              activeInputRef.current?.focus();
            }}
            className="absolute left-3 top-2.5 p-0.5 text-slate-400 hover:text-red-500 hover:bg-slate-100 rounded-full transition-all"
            title="مسح"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* القائمة المنسدلة السريعة */}
      {isOpen && !disabled && (
        <div 
          ref={listRef}
          className="absolute z-50 w-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-80 overflow-y-auto divide-y divide-slate-100 animate-in fade-in-50 duration-150"
        >
          {showAllOption && (
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(null);
              }}
              onMouseEnter={() => setHighlightedIndex(0)}
              className={`product-select-item p-3 cursor-pointer flex items-center justify-between transition-colors ${
                highlightedIndex === 0 ? 'bg-blue-50/80' : value === '' ? 'bg-slate-50' : 'hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-blue-100 text-blue-700">
                  <Layers size={15} />
                </div>
                <span className="font-bold text-slate-800 text-sm">{allOptionLabel}</span>
              </div>
              {value === '' && <Check size={16} className="text-blue-600" />}
            </div>
          )}

          {visibleItems.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-500 font-medium">
              لا توجد أصناف مطابقة للبحث
              {filterAvailableOnly && ' (قد تكون الأصناف غير متوفرة في مستودع المصدر المحدد)'}
            </div>
          ) : (
            visibleItems.map((item, idx) => {
              const { product, stock } = item;
              const isSelected = product.id === value;
              const currentHighlightIdx = showAllOption ? idx + 1 : idx;
              const isHighlighted = currentHighlightIdx === highlightedIndex;

              return (
                <div
                  key={product.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(product);
                  }}
                  onMouseEnter={() => setHighlightedIndex(currentHighlightIdx)}
                  className={`product-select-item p-3 cursor-pointer flex items-center justify-between transition-colors ${
                    isHighlighted ? 'bg-blue-50/90 text-blue-900' : isSelected ? 'bg-slate-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-1">
                    <div className={`p-1.5 rounded-lg shrink-0 ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      <Package size={15} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-slate-800 text-sm truncate">
                          <HighlightedText text={product.name} query={searchTerm} />
                        </span>
                        {product.sku && (
                          <span className="font-mono text-[11px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                            <HighlightedText text={product.sku} query={searchTerm} />
                          </span>
                        )}
                        {product.barcode && (
                          <span className="font-mono text-[10px] text-slate-500 flex items-center gap-0.5">
                            <Barcode size={11} />
                            <HighlightedText text={product.barcode} query={searchTerm} />
                          </span>
                        )}
                      </div>
                      {product.unit && (
                        <span className="text-[11px] text-slate-500">
                          الوحدة: {product.unit}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 mr-2">
                    {warehouseId ? (
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full border shadow-xs ${
                        stock > 0 
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                          : 'bg-rose-50 text-rose-600 border-rose-200'
                      }`}>
                        المتوفر: {stock} {product.unit || ''}
                      </span>
                    ) : (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                        الرصيد الكلي: {product.stock ?? 0}
                      </span>
                    )}

                    {isSelected && (
                      <Check size={16} className="text-blue-600" />
                    )}
                  </div>
                </div>
              );
            })
          )}

          {filteredProducts.length > visibleItems.length && (
            <div className="p-2 text-center text-[11px] font-bold text-slate-500 bg-slate-50 border-t sticky bottom-0">
              عرض {visibleItems.length} صنف من أصل {filteredProducts.length} صنف مطابق. اكتب لمزيد من الدقة...
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ProductSearchSelect;
