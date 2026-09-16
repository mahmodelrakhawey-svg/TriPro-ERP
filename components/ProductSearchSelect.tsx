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
  theme?: 'light' | 'dark';
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
  inputRef: externalInputRef,
  theme = 'light'
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const internalInputRef = useRef<HTMLInputElement>(null);
  const activeInputRef = externalInputRef || internalInputRef;
  const listRef = useRef<HTMLDivElement>(null);
  const isDark = theme === 'dark';

  const selectedProduct = useMemo(() => {
    return products.find(p => p.id === value);
  }, [products, value]);

  // تحديث نص الحقل عند تغير الصنف المختار من الخارج
  useEffect(() => {
    if (selectedProduct) {
      if (!clearOnSelect) {
        const codePart = (selectedProduct.sku || (selectedProduct as any).code) ? `[${selectedProduct.sku || (selectedProduct as any).code}] ` : '';
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
      const skuVal = p.sku || (p as any).code || '';
      const normSku = normalizeArabic(skuVal);
      const normBarcode = normalizeArabic(p.barcode || '');
      const normBarcode2 = normalizeArabic((p as any).barcode2 || '');
      
      const normUnitBarcodes = Array.isArray((p as any).unit_barcodes)
        ? (p as any).unit_barcodes.map((ub: any) => normalizeArabic(ub?.barcode || '')).filter(Boolean).join(' ')
        : '';

      const pType = String((p as any).product_type || p.item_type || '').toUpperCase();
      const mType = String((p as any).mfg_type || '').toLowerCase();
      const isIntermediate = pType === 'INTERMEDIATE_PRODUCT' || mType === 'intermediate' || mType === 'subassembly';
      const isManufactured = pType === 'MANUFACTURED' || mType === 'standard' || p.item_type === 'MANUFACTURED';
      const typeKeywords = isIntermediate ? 'منتج وسيط نصف مصنع subassembly intermediate' : isManufactured ? 'منتج تام نهائي manufactured standard' : '';

      // إدراج صيغ الكلمات مع وبدون الـ التعريفية لمطابقة أحرف الكلمات بدقة وسرعة
      const words = normName.split(/\s+/).filter(Boolean);
      const variations = words.map(w => w.startsWith('ال') && w.length > 3 ? w.slice(2) : `ال${w}`).join(' ');

      const fullSearchable = `${normName} ${variations} ${normSku} ${normBarcode} ${normBarcode2} ${normUnitBarcodes} ${typeKeywords}`;
      const stock = getProductWarehouseStock(p, warehouseId);

      return {
        product: p,
        normName,
        normSku,
        normBarcode,
        fullSearchable,
        stock,
        isIntermediate,
        isManufactured
      };
    });
  }, [products, warehouseId]);

  // 🚀 التصفية اللحظية بالكلمات والمقاطع والحروف (Token & Substring Instant Matching)
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
      return tokens.every(token => {
        if (item.fullSearchable.includes(token)) return true;
        // إذا بدأ الحرف/الكلمة بـ "الـ" ولم يطابق، يجرب بدون "الـ"
        if (token.startsWith('ال') && token.length > 3 && item.fullSearchable.includes(token.slice(2))) return true;
        return false;
      });
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
          className={`w-full border rounded-xl py-2.5 pr-10 pl-9 text-sm outline-none transition-all shadow-sm font-bold disabled:cursor-not-allowed placeholder:font-normal placeholder:text-xs ${
            isDark
              ? 'bg-slate-950 border-slate-800 text-white placeholder:text-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-950 disabled:bg-slate-900'
              : 'border-slate-200 focus:border-purple-500 bg-white focus:ring-2 focus:ring-purple-100 text-slate-800 disabled:bg-slate-100 placeholder:text-slate-400'
          }`}
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
            className="absolute left-3 top-2.5 p-0.5 text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-all"
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
          className={`absolute z-50 w-full mt-1.5 border rounded-xl shadow-2xl max-h-80 overflow-y-auto divide-y animate-in fade-in-50 duration-150 ${
            isDark
              ? 'bg-slate-900 border-slate-800 divide-slate-800 text-white'
              : 'bg-white border-slate-200 divide-slate-100 text-slate-800'
          }`}
        >
          {showAllOption && (
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(null);
              }}
              onMouseEnter={() => setHighlightedIndex(0)}
              className={`product-select-item p-3 cursor-pointer flex items-center justify-between transition-colors ${
                highlightedIndex === 0
                  ? isDark ? 'bg-indigo-950/80' : 'bg-blue-50/80'
                  : value === ''
                  ? isDark ? 'bg-slate-800/60' : 'bg-slate-50'
                  : isDark ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className={`p-1.5 rounded-lg ${isDark ? 'bg-indigo-900/60 text-indigo-300' : 'bg-blue-100 text-blue-700'}`}>
                  <Layers size={15} />
                </div>
                <span className={`font-bold text-sm ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{allOptionLabel}</span>
              </div>
              {value === '' && <Check size={16} className={isDark ? "text-indigo-400" : "text-blue-600"} />}
            </div>
          )}

          {visibleItems.length === 0 ? (
            <div className={`p-4 text-center text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              لا توجد أصناف مطابقة للبحث
              {filterAvailableOnly && ' (قد تكون الأصناف غير متوفرة في المستودع المحدد)'}
            </div>
          ) : (
            visibleItems.map((item, idx) => {
              const { product, stock, isIntermediate, isManufactured } = item;
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
                    isHighlighted
                      ? isDark ? 'bg-indigo-900/50 text-white' : 'bg-purple-50/90 text-purple-900'
                      : isSelected
                      ? isDark ? 'bg-slate-800/80' : 'bg-slate-50'
                      : isDark ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-1">
                    <div className={`p-1.5 rounded-lg shrink-0 ${
                      isSelected
                        ? isDark ? 'bg-indigo-600 text-white' : 'bg-purple-600 text-white'
                        : isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'
                    }`}>
                      <Package size={15} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`font-bold text-sm truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                          <HighlightedText text={product.name} query={searchTerm} />
                        </span>
                        {isIntermediate && (
                          <span className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5">
                            🍰 منتج وسيط
                          </span>
                        )}
                        {isManufactured && (
                          <span className="text-[10px] bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30 px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5">
                            🎂 منتج تام
                          </span>
                        )}
                        {(product.sku || (product as any).code) && (
                          <span className={`font-mono text-[11px] px-1.5 py-0.5 rounded border ${
                            isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}>
                            <HighlightedText text={product.sku || (product as any).code} query={searchTerm} />
                          </span>
                        )}
                        {product.barcode && (
                          <span className="font-mono text-[10px] text-slate-400 flex items-center gap-0.5">
                            <Barcode size={11} />
                            <HighlightedText text={product.barcode} query={searchTerm} />
                          </span>
                        )}
                      </div>
                      {product.unit && (
                        <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          الوحدة: {product.unit}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 mr-2">
                    {warehouseId ? (
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full border shadow-xs ${
                        stock > 0 
                          ? isDark ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800' : 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                          : isDark ? 'bg-rose-950/80 text-rose-300 border-rose-800' : 'bg-rose-50 text-rose-600 border-rose-200'
                      }`}>
                        المتوفر: {stock} {product.unit || ''}
                      </span>
                    ) : (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                        isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'
                      }`}>
                        الرصيد: {product.stock ?? 0}
                      </span>
                    )}

                    {isSelected && (
                      <Check size={16} className={isDark ? "text-indigo-400" : "text-purple-600"} />
                    )}
                  </div>
                </div>
              );
            })
          )}

          {filteredProducts.length > visibleItems.length && (
            <div className={`p-2 text-center text-[11px] font-bold border-t sticky bottom-0 ${
              isDark ? 'bg-slate-900 text-slate-400 border-slate-800' : 'bg-slate-50 text-slate-500 border-slate-100'
            }`}>
              عرض {visibleItems.length} صنف من أصل {filteredProducts.length} صنف مطابق. اكتب لمزيد من الدقة...
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ProductSearchSelect;
