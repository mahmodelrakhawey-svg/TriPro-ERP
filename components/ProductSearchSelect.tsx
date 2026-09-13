import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X, Package, Barcode, Check } from 'lucide-react';
import { Product } from '../types';

interface ProductSearchSelectProps {
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
  onEnterSelect
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedProduct = useMemo(() => {
    return products.find(p => p.id === value);
  }, [products, value]);

  // تحديث نص الحقل عند تغير الصنف المختار
  useEffect(() => {
    if (selectedProduct) {
      const codePart = selectedProduct.sku ? `[${selectedProduct.sku}] ` : '';
      setSearchTerm(`${codePart}${selectedProduct.name}`);
    } else if (!isOpen) {
      setSearchTerm('');
    }
  }, [selectedProduct, isOpen]);

  // التصفية السريعة للأصناف
  const filteredProducts = useMemo(() => {
    let list = products;

    if (filterAvailableOnly && warehouseId) {
      list = list.filter(p => getProductWarehouseStock(p, warehouseId) > 0);
    }

    const cleanQuery = normalizeArabic(searchTerm);
    if (!cleanQuery) return list;

    return list.filter(p => {
      const nameNorm = normalizeArabic(p.name);
      if (nameNorm.includes(cleanQuery)) return true;

      if (p.sku && normalizeArabic(p.sku).includes(cleanQuery)) return true;
      if (p.barcode && normalizeArabic(p.barcode).includes(cleanQuery)) return true;
      if (p.barcode2 && normalizeArabic(p.barcode2).includes(cleanQuery)) return true;

      if (p.unit_barcodes && Array.isArray(p.unit_barcodes)) {
        for (const ub of p.unit_barcodes) {
          if (ub.barcode && normalizeArabic(ub.barcode).includes(cleanQuery)) return true;
        }
      }

      return false;
    });
  }, [products, searchTerm, filterAvailableOnly, warehouseId]);

  // عرض أول 40 نتيجة فقط لمنع تجميد المتصفح تماماً
  const visibleProducts = useMemo(() => {
    return filteredProducts.slice(0, 40);
  }, [filteredProducts]);

  // إعادة ضبط التحديد عند تغير النتائج
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredProducts]);

  const handleSelect = (product: Product) => {
    onChange(product.id, product);
    const codePart = product.sku ? `[${product.sku}] ` : '';
    setSearchTerm(`${codePart}${product.name}`);
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

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev + 1 < visibleProducts.length ? prev + 1 : prev));
      scrollHighlightedIntoView(highlightedIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : 0));
      scrollHighlightedIntoView(highlightedIndex - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (visibleProducts[highlightedIndex]) {
        handleSelect(visibleProducts[highlightedIndex]);
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

  // إغلاق القائمة عند النقر خارجها
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        if (selectedProduct) {
          const codePart = selectedProduct.sku ? `[${selectedProduct.sku}] ` : '';
          setSearchTerm(`${codePart}${selectedProduct.name}`);
        } else {
          setSearchTerm('');
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedProduct]);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <div className="relative">
        <input
          ref={inputRef}
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
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full border border-slate-200 focus:border-blue-500 rounded-xl py-2.5 pr-10 pl-9 text-sm bg-white focus:ring-2 focus:ring-blue-100 outline-none transition-all shadow-sm font-medium disabled:bg-slate-100 disabled:cursor-not-allowed"
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
              inputRef.current?.focus();
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
          className="absolute z-50 w-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl max-h-72 overflow-y-auto divide-y divide-slate-100 animate-in fade-in-50 duration-150"
        >
          {visibleProducts.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-500 font-medium">
              لا توجد أصناف مطابقة للبحث
              {filterAvailableOnly && ' (قد تكون الأصناف غير متوفرة في المستودع المصدر)'}
            </div>
          ) : (
            visibleProducts.map((product, idx) => {
              const currentStock = getProductWarehouseStock(product, warehouseId);
              const isSelected = product.id === value;
              const isHighlighted = idx === highlightedIndex;

              return (
                <div
                  key={product.id}
                  onMouseDown={(e) => {
                    e.preventDefault(); // يمنع فقدان التركيز
                    handleSelect(product);
                  }}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`product-select-item p-3 cursor-pointer flex items-center justify-between transition-colors ${
                    isHighlighted ? 'bg-blue-50/80' : isSelected ? 'bg-slate-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-1">
                    <div className={`p-1.5 rounded-lg shrink-0 ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      <Package size={15} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-slate-800 text-sm truncate">
                          {product.name}
                        </span>
                        {product.sku && (
                          <span className="font-mono text-[11px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                            {product.sku}
                          </span>
                        )}
                        {product.barcode && (
                          <span className="font-mono text-[10px] text-slate-400 flex items-center gap-0.5">
                            <Barcode size={11} /> {product.barcode}
                          </span>
                        )}
                      </div>
                      {product.unit && (
                        <span className="text-[11px] text-slate-400">
                          الوحدة: {product.unit}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 mr-2">
                    {warehouseId ? (
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                        currentStock > 0 
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                          : 'bg-rose-50 text-rose-600 border-rose-200'
                      }`}>
                        المتوفر بالمستودع: {currentStock} {product.unit || ''}
                      </span>
                    ) : (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                        الإجمالي: {product.stock ?? 0}
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

          {filteredProducts.length > visibleProducts.length && (
            <div className="p-2 text-center text-[11px] font-bold text-slate-500 bg-slate-50 border-t sticky bottom-0">
              يتم عرض أول {visibleProducts.length} صنف من أصل {filteredProducts.length} صنف. اكتب للبحث بدقة أكبر...
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ProductSearchSelect;
