import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { 
  Search, X, Truck, Phone, FileText, Plus, Edit2, RefreshCw, 
  Check, Hash, User, ChevronDown, Sparkles, MapPin, Building,
  DollarSign, Loader2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAccounting } from '../context/AccountingContext';
import { useToast } from '../context/ToastContext';
import { supabase } from '../supabaseClient';
import { fetchSingleSupplierBalance } from '../services/balanceService';

export interface SupplierOption {
  id: string;
  name: string;
  phone?: string;
  tax_number?: string;
  taxId?: string;
  address?: string;
  contact_person?: string;
  contactPerson?: string;
  opening_balance?: number;
  balance?: number;
  email?: string;
  [key: string]: any;
}

export interface SupplierSearchSelectProps {
  value: string;
  onChange: (supplierId: string, supplier?: SupplierOption) => void;
  suppliers?: SupplierOption[];
  label?: React.ReactNode;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  autoFocus?: boolean;
  theme?: 'emerald' | 'blue' | 'purple' | 'slate';
  showBalance?: boolean;
  showQuickAdd?: boolean;
  showQuickEdit?: boolean;
  showStatementButton?: boolean;
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

// مكون تظليل الحروف المطابقة
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

const RECENT_SUPPLIERS_KEY = 'tripro_recent_suppliers';

export const SupplierSearchSelect: React.FC<SupplierSearchSelectProps> = ({
  value,
  onChange,
  suppliers: propSuppliers,
  label = 'المورد',
  required = false,
  placeholder = 'ابحث باسم المورد، الهاتف، أو الرقم الضريبي...',
  disabled = false,
  className = '',
  autoFocus = false,
  theme = 'emerald',
  showBalance = true,
  showQuickAdd = true,
  showQuickEdit = true,
  showStatementButton = true
}) => {
  const navigate = useNavigate();
  const { 
    suppliers: contextSuppliers, 
    addSupplier, 
    updateSupplier, 
    currentUser, 
    currentSelectedOrgId, 
    refreshData 
  } = useAccounting();
  const { showToast } = useToast();

  const suppliersList = propSuppliers || contextSuppliers || [];

  // Theme configuration
  const themeStyles = useMemo(() => {
    switch (theme) {
      case 'blue':
        return {
          primary: 'text-blue-600',
          bgPrimary: 'bg-blue-600',
          bgLight: 'bg-blue-50',
          borderActive: 'border-blue-500 focus:border-blue-500 focus:ring-blue-100',
          hoverBg: 'hover:bg-blue-50',
          badge: 'bg-blue-100 text-blue-800 border-blue-200',
          ring: 'focus:ring-blue-200'
        };
      case 'purple':
        return {
          primary: 'text-purple-600',
          bgPrimary: 'bg-purple-600',
          bgLight: 'bg-purple-50',
          borderActive: 'border-purple-500 focus:border-purple-500 focus:ring-purple-100',
          hoverBg: 'hover:bg-purple-50',
          badge: 'bg-purple-100 text-purple-800 border-purple-200',
          ring: 'focus:ring-purple-200'
        };
      case 'slate':
        return {
          primary: 'text-slate-700',
          bgPrimary: 'bg-slate-800',
          bgLight: 'bg-slate-100',
          borderActive: 'border-slate-500 focus:border-slate-500 focus:ring-slate-100',
          hoverBg: 'hover:bg-slate-100',
          badge: 'bg-slate-100 text-slate-800 border-slate-200',
          ring: 'focus:ring-slate-200'
        };
      case 'emerald':
      default:
        return {
          primary: 'text-emerald-600',
          bgPrimary: 'bg-emerald-600',
          bgLight: 'bg-emerald-50',
          borderActive: 'border-emerald-500 focus:border-emerald-500 focus:ring-emerald-100',
          hoverBg: 'hover:bg-emerald-50',
          badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
          ring: 'focus:ring-emerald-200'
        };
    }
  }, [theme]);

  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [isRefreshingBalance, setIsRefreshingBalance] = useState(false);
  const [currentBalance, setCurrentBalance] = useState<number | null>(null);
  const [recentSupplierIds, setRecentSupplierIds] = useState<string[]>([]);

  // Modals
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isQuickEditOpen, setIsQuickEditOpen] = useState(false);
  const [quickAddSubmitting, setQuickAddSubmitting] = useState(false);
  const [newSupplierForm, setNewSupplierForm] = useState({
    name: '',
    phone: '',
    tax_number: '',
    address: '',
    opening_balance: 0
  });
  const [editSupplierForm, setEditSupplierForm] = useState({
    name: '',
    phone: '',
    tax_number: '',
    address: ''
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // تحميل الموردين الأحدث من localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECENT_SUPPLIERS_KEY);
      if (saved) {
        const ids = JSON.parse(saved);
        if (Array.isArray(ids)) setRecentSupplierIds(ids);
      }
    } catch {}
  }, []);

  const saveRecentSupplier = (id: string) => {
    try {
      const updated = [id, ...recentSupplierIds.filter(item => item !== id)].slice(0, 5);
      setRecentSupplierIds(updated);
      localStorage.setItem(RECENT_SUPPLIERS_KEY, JSON.stringify(updated));
    } catch {}
  };

  // المورد المختار حالياً
  const selectedSupplier = useMemo(() => {
    return suppliersList.find(s => String(s.id) === String(value));
  }, [suppliersList, value]);

  // جلب رصيد المورد المختار تلقائياً
  const loadSupplierBalance = useCallback(async (supplierId: string) => {
    if (!supplierId) {
      setCurrentBalance(null);
      return;
    }
    const orgId = currentSelectedOrgId || (currentUser as any)?.organization_id;
    if (!orgId) return;

    setIsRefreshingBalance(true);
    try {
      // 1. محاولة استدعاء الدالة السيرفرية المباشرة
      const bal = await fetchSingleSupplierBalance(supplierId, orgId);
      setCurrentBalance(bal);
    } catch (err) {
      console.warn('Could not fetch supplier balance:', err);
    } finally {
      setIsRefreshingBalance(false);
    }
  }, [currentSelectedOrgId, currentUser]);

  useEffect(() => {
    if (selectedSupplier) {
      loadSupplierBalance(selectedSupplier.id);
    } else {
      setCurrentBalance(null);
    }
  }, [selectedSupplier, loadSupplierBalance]);

  // 🚀 الفهرسة المسبقة الفائقة السرعة في الذاكرة
  const indexedSuppliers = useMemo(() => {
    return suppliersList.map(s => {
      const name = s.name || '';
      const normName = normalizeArabic(name);
      const phone = s.phone || '';
      const taxNumber = s.tax_number || s.taxId || '';
      const contact = s.contact_person || s.contactPerson || '';
      const normContact = normalizeArabic(contact);

      // التعامل مع ألـ التعريف
      const words = normName.split(/\s+/).filter(Boolean);
      const variations = words.map(w => w.startsWith('ال') && w.length > 3 ? w.slice(2) : `ال${w}`).join(' ');

      const fullSearchable = `${normName} ${variations} ${phone} ${taxNumber} ${normContact}`.toLowerCase();

      return {
        supplier: s,
        normName,
        phone,
        taxNumber,
        contact,
        fullSearchable
      };
    });
  }, [suppliersList]);

  // 🚀 التصفية اللحظية بالكلمات
  const filteredSuppliers = useMemo(() => {
    const cleanQuery = normalizeArabic(searchTerm);
    if (!cleanQuery) return indexedSuppliers;

    const tokens = cleanQuery.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return indexedSuppliers;

    return indexedSuppliers.filter(item => {
      return tokens.every(token => {
        if (item.fullSearchable.includes(token)) return true;
        if (token.startsWith('ال') && token.length > 3 && item.fullSearchable.includes(token.slice(2))) return true;
        return false;
      });
    });
  }, [indexedSuppliers, searchTerm]);

  // حصر المعروض لأول 50 مورد للحفاظ على 60fps
  const visibleItems = useMemo(() => {
    return filteredSuppliers.slice(0, 50);
  }, [filteredSuppliers]);

  // قائمة الموردين الأكثر تعاملاً
  const recentSuppliers = useMemo(() => {
    if (recentSupplierIds.length === 0) return [];
    return recentSupplierIds
      .map(id => suppliersList.find(s => String(s.id) === String(id)))
      .filter((s): s is SupplierOption => Boolean(s));
  }, [recentSupplierIds, suppliersList]);

  // ضبط المؤشر عند تغير نتائج البحث
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredSuppliers]);

  const handleSelect = (supplier: SupplierOption) => {
    onChange(supplier.id, supplier);
    saveRecentSupplier(supplier.id);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleClear = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    onChange('');
    setSearchTerm('');
    setCurrentBalance(null);
    setIsOpen(false);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  // التحكم بلوحة المفاتيح
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev + 1 < visibleItems.length ? prev + 1 : 0));
      scrollHighlightedIntoView(highlightedIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : visibleItems.length - 1));
      scrollHighlightedIntoView(highlightedIndex - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (visibleItems[highlightedIndex]) {
        handleSelect(visibleItems[highlightedIndex].supplier);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const scrollHighlightedIntoView = (index: number) => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll('.supplier-select-item');
    if (items[index]) {
      (items[index] as HTMLElement).scrollIntoView({ block: 'nearest' });
    }
  };

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

  // إضافة مورد جديد سريع
  const handleQuickAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplierForm.name.trim()) {
      showToast('يرجى إدخال اسم المورد', 'warning');
      return;
    }

    setQuickAddSubmitting(true);
    try {
      const created = await addSupplier({
        name: newSupplierForm.name.trim(),
        phone: newSupplierForm.phone.trim() || null,
        tax_number: newSupplierForm.tax_number.trim() || null,
        address: newSupplierForm.address.trim() || null,
        opening_balance: Number(newSupplierForm.opening_balance || 0)
      });

      if (created && created.id) {
        onChange(created.id, created);
        saveRecentSupplier(created.id);
        setIsQuickAddOpen(false);
        setNewSupplierForm({ name: '', phone: '', tax_number: '', address: '', opening_balance: 0 });
        showToast(`تمت إضافة واختيار المورد "${created.name}" بنجاح ✅`, 'success');
        if (refreshData) refreshData();
      }
    } catch (err: any) {
      showToast('تعذر إضافة المورد: ' + (err.message || ''), 'error');
    } finally {
      setQuickAddSubmitting(false);
    }
  };

  // تعديل بيانات المورد المختار
  const handleQuickEditOpen = () => {
    if (!selectedSupplier) return;
    setEditSupplierForm({
      name: selectedSupplier.name || '',
      phone: selectedSupplier.phone || '',
      tax_number: selectedSupplier.tax_number || selectedSupplier.taxId || '',
      address: selectedSupplier.address || ''
    });
    setIsQuickEditOpen(true);
  };

  const handleQuickEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier) return;
    if (!editSupplierForm.name.trim()) {
      showToast('يرجى إدخال اسم المورد', 'warning');
      return;
    }

    setQuickAddSubmitting(true);
    try {
      await updateSupplier(selectedSupplier.id, {
        name: editSupplierForm.name.trim(),
        phone: editSupplierForm.phone.trim() || null,
        tax_number: editSupplierForm.tax_number.trim() || null,
        address: editSupplierForm.address.trim() || null
      });

      showToast('تم تحديث بيانات المورد بنجاح ✅', 'success');
      setIsQuickEditOpen(false);
      if (refreshData) refreshData();
    } catch (err: any) {
      showToast('تعذر تحديث المورد: ' + (err.message || ''), 'error');
    } finally {
      setQuickAddSubmitting(false);
    }
  };

  return (
    <div className={`space-y-1.5 ${className}`} ref={containerRef}>
      {/* التسمية والأزرار العلوية السريعة */}
      <div className="flex items-center justify-between">
        <label className="block text-xs font-black text-slate-700">
          {label} {required && <span className="text-red-500">*</span>}
        </label>

        <div className="flex items-center gap-1.5">
          {showQuickAdd && !disabled && (
            <button
              type="button"
              onClick={() => setIsQuickAddOpen(true)}
              className={`text-xs font-black px-2.5 py-0.5 rounded-lg border transition-all flex items-center gap-1 shadow-2xs ${themeStyles.badge} hover:opacity-90`}
              title="إضافة مورد جديد فوري دون مغادرة الصفحة"
            >
              <Plus size={12} /> مورد جديد
            </button>
          )}

          {selectedSupplier && showQuickEdit && !disabled && (
            <button
              type="button"
              onClick={handleQuickEditOpen}
              className="text-xs font-bold text-slate-500 hover:text-amber-600 px-1.5 py-0.5 rounded-md hover:bg-slate-100 transition-colors flex items-center gap-1"
              title="تعديل بيانات هذا المورد"
            >
              <Edit2 size={12} /> تعديل
            </button>
          )}
        </div>
      </div>

      {/* الحالة 1: يوجد مورد مختار (عرض البطاقة الذكية) */}
      {selectedSupplier && !isOpen ? (
        <div className={`p-3 rounded-2xl border-2 transition-all bg-white shadow-xs ${
          theme === 'emerald' ? 'border-emerald-200 hover:border-emerald-300' :
          theme === 'blue' ? 'border-blue-200 hover:border-blue-300' :
          'border-slate-200 hover:border-slate-300'
        }`}>
          <div className="flex items-start justify-between gap-3">
            
            {/* تفاصيل المورد */}
            <div className="flex items-start gap-3 min-w-0">
              <div className={`p-2.5 rounded-xl shrink-0 mt-0.5 ${themeStyles.bgLight} ${themeStyles.primary}`}>
                <Truck size={20} />
              </div>
              
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-base font-black text-slate-800 truncate">
                    {selectedSupplier.name}
                  </h4>
                  
                  {selectedSupplier.phone && (
                    <a
                      href={`tel:${selectedSupplier.phone}`}
                      className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded-md transition-colors"
                      title="اتصال بالمورد"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Phone size={11} className="text-slate-400" />
                      <span dir="ltr">{selectedSupplier.phone}</span>
                    </a>
                  )}

                  {(selectedSupplier.tax_number || selectedSupplier.taxId) && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-500 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded">
                      <Hash size={10} /> ضريبي: {selectedSupplier.tax_number || selectedSupplier.taxId}
                    </span>
                  )}
                </div>

                {/* الرصيد المالي المباشر والإجراءات */}
                <div className="flex items-center gap-3 text-xs flex-wrap pt-0.5">
                  {showBalance && (
                    <div className="flex items-center gap-1.5 font-bold">
                      <span className="text-slate-400 text-[11px]">الرصيد:</span>
                      {isRefreshingBalance ? (
                        <Loader2 size={12} className={`animate-spin ${themeStyles.primary}`} />
                      ) : currentBalance !== null ? (
                        <span className={`font-black font-mono px-2 py-0.5 rounded-md text-[11px] ${
                          currentBalance > 0.01 
                            ? 'bg-amber-100 text-amber-800' 
                            : currentBalance < -0.01 
                            ? 'bg-emerald-100 text-emerald-800' 
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {Math.abs(currentBalance).toLocaleString()} ج.م
                          <span className="mr-1 text-[10px]">
                            {currentBalance > 0.01 ? '(مستحق له)' : currentBalance < -0.01 ? '(مدين / عليه)' : '(خالص)'}
                          </span>
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">--</span>
                      )}

                      <button
                        type="button"
                        onClick={() => loadSupplierBalance(selectedSupplier.id)}
                        disabled={isRefreshingBalance}
                        className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-all disabled:opacity-50"
                        title="تحديث الرصيد فورياً"
                      >
                        <RefreshCw size={11} className={isRefreshingBalance ? 'animate-spin' : ''} />
                      </button>
                    </div>
                  )}

                  {showStatementButton && (
                    <button
                      type="button"
                      onClick={() => navigate('/supplier-statement', { state: { selectedSupplierId: selectedSupplier.id } })}
                      className={`inline-flex items-center gap-1 text-[11px] font-bold ${themeStyles.primary} hover:underline`}
                      title="فتح كشف حساب المورد"
                    >
                      <FileText size={12} /> كشف الحساب
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* زر تغيير / مسح المورد */}
            <div className="flex items-center gap-1 shrink-0">
              {!disabled && (
                <button
                  type="button"
                  onClick={() => setIsOpen(true)}
                  className="px-2.5 py-1 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all"
                  title="تغيير المورد"
                >
                  تغيير
                </button>
              )}
              {!disabled && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                  title="إلغاء التحديد"
                >
                  <X size={16} />
                </button>
              )}
            </div>

          </div>
        </div>
      ) : (
        /* الحالة 2: حقل البحث الذكي والقائمة المنسدلة */
        <div className="relative">
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
              }}
              onFocus={() => setIsOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className={`w-full border-2 rounded-2xl py-3 pr-10 pl-10 text-sm font-bold bg-slate-50 focus:bg-white outline-none transition-all shadow-xs placeholder:font-normal placeholder:text-xs placeholder:text-slate-400 ${themeStyles.borderActive} ${themeStyles.ring}`}
            />

            <div className="absolute right-3.5 top-3.5 text-slate-400 pointer-events-none">
              <Search size={18} />
            </div>

            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  inputRef.current?.focus();
                }}
                className="absolute left-3.5 top-3.5 text-slate-400 hover:text-slate-600 rounded-full"
                title="مسح البحث"
              >
                <X size={16} />
              </button>
            )}

            {!searchTerm && (
              <div className="absolute left-3.5 top-3.5 text-slate-300 pointer-events-none">
                <ChevronDown size={18} />
              </div>
            )}
          </div>

          {/* القائمة المنسدلة الذكية */}
          {isOpen && !disabled && (
            <div
              ref={listRef}
              className="absolute z-50 w-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-80 overflow-y-auto divide-y divide-slate-100 animate-in fade-in-50 duration-150"
            >
              
              {/* شريط الموردين الأكثر تعاملاً / الأحدث (يظهر عند فتح القائمة بدون بحث) */}
              {!searchTerm && recentSuppliers.length > 0 && (
                <div className="p-2.5 bg-slate-50/80 border-b border-slate-100">
                  <div className="text-[11px] font-black text-slate-400 mb-1.5 flex items-center gap-1">
                    <Sparkles size={12} className="text-amber-500" />
                    الموردين الأكثر تعاملاً / مؤخراً:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {recentSuppliers.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelect(s);
                        }}
                        className={`text-xs font-bold px-2.5 py-1 rounded-xl bg-white border border-slate-200 text-slate-700 hover:border-emerald-400 hover:text-emerald-700 hover:shadow-xs transition-all flex items-center gap-1`}
                      >
                        <span>{s.name}</span>
                        {s.phone && <span className="text-[10px] text-slate-400 font-mono">({s.phone.slice(-4)})</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* عناصر نتائج البحث */}
              {visibleItems.length === 0 ? (
                <div className="p-6 text-center space-y-3">
                  <div className="text-slate-400 text-xs font-bold">
                    لا يوجد مورد مطابق لـ "{searchTerm}"
                  </div>
                  {showQuickAdd && (
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setNewSupplierForm(prev => ({ ...prev, name: searchTerm }));
                        setIsQuickAddOpen(true);
                      }}
                      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-white ${themeStyles.bgPrimary} shadow-xs hover:opacity-90 transition-all`}
                    >
                      <Plus size={14} /> إضافة "{searchTerm}" كمورد جديد الآن
                    </button>
                  )}
                </div>
              ) : (
                visibleItems.map((item, idx) => {
                  const { supplier, phone, taxNumber, contact } = item;
                  const isSelected = String(supplier.id) === String(value);
                  const isHighlighted = idx === highlightedIndex;

                  return (
                    <div
                      key={supplier.id}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelect(supplier);
                      }}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      className={`supplier-select-item p-3 cursor-pointer flex items-center justify-between transition-colors ${
                        isHighlighted
                          ? theme === 'emerald' ? 'bg-emerald-50/90 text-emerald-950' :
                            theme === 'blue' ? 'bg-blue-50/90 text-blue-950' : 'bg-slate-100 text-slate-900'
                          : isSelected
                          ? 'bg-slate-50'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-1">
                        <div className={`p-2 rounded-xl shrink-0 ${
                          isSelected
                            ? `${themeStyles.bgPrimary} text-white`
                            : isHighlighted
                            ? `${themeStyles.bgLight} ${themeStyles.primary}`
                            : 'bg-slate-100 text-slate-500'
                        }`}>
                          <Truck size={16} />
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-slate-900">
                              <HighlightedText text={supplier.name} query={searchTerm} />
                            </span>

                            {phone && (
                              <span className="text-[11px] font-mono text-slate-500 flex items-center gap-0.5 bg-slate-100 px-1.5 py-0.5 rounded">
                                <Phone size={10} className="text-slate-400" />
                                <HighlightedText text={phone} query={searchTerm} />
                              </span>
                            )}

                            {taxNumber && (
                              <span className="text-[10px] font-mono text-slate-400 bg-slate-50 border border-slate-200 px-1 py-0.5 rounded">
                                ضريبي: <HighlightedText text={taxNumber} query={searchTerm} />
                              </span>
                            )}

                            {contact && (
                              <span className="text-[10px] text-slate-400">
                                ({contact})
                              </span>
                            )}
                          </div>

                          {supplier.address && (
                            <div className="text-[11px] text-slate-400 truncate flex items-center gap-1 mt-0.5">
                              <MapPin size={10} /> {supplier.address}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 mr-2">
                        {isSelected && (
                          <Check size={16} className={themeStyles.primary} />
                        )}
                      </div>
                    </div>
                  );
                })
              )}

              {/* تذييل النتائج */}
              {filteredSuppliers.length > visibleItems.length && (
                <div className="p-2 text-center text-[11px] font-bold text-slate-500 bg-slate-50 border-t sticky bottom-0">
                  عرض {visibleItems.length} مورد من أصل {filteredSuppliers.length}. اكتب بالاسم أو الهاتف لمزيد من الدقة...
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 🚀 Modal: إضافة مورد جديد فوري (Quick Add Supplier) */}
      {isQuickAddOpen && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-xl ${themeStyles.bgLight} ${themeStyles.primary}`}>
                  <Truck size={20} />
                </div>
                <h3 className="font-black text-lg text-slate-800">إضافة مورد جديد</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsQuickAddOpen(false)}
                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleQuickAddSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  اسم المورد / الشركة <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newSupplierForm.name}
                  onChange={e => setNewSupplierForm({ ...newSupplierForm, name: e.target.value })}
                  placeholder="مثال: شركة الأمل للتوريدات"
                  className={`w-full border rounded-xl p-3 text-sm font-bold bg-slate-50 focus:bg-white outline-none ${themeStyles.borderActive}`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">رقم الهاتف / الجوال</label>
                  <input
                    type="tel"
                    dir="ltr"
                    value={newSupplierForm.phone}
                    onChange={e => setNewSupplierForm({ ...newSupplierForm, phone: e.target.value })}
                    placeholder="01xxxxxxxxx"
                    className={`w-full border rounded-xl p-3 text-sm font-bold bg-slate-50 focus:bg-white outline-none ${themeStyles.borderActive}`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">الرقم الضريبي</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={newSupplierForm.tax_number}
                    onChange={e => setNewSupplierForm({ ...newSupplierForm, tax_number: e.target.value })}
                    placeholder="xxx-xxx-xxx"
                    className={`w-full border rounded-xl p-3 text-sm font-bold bg-slate-50 focus:bg-white outline-none ${themeStyles.borderActive}`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">العنوان / المدينة</label>
                  <input
                    type="text"
                    value={newSupplierForm.address}
                    onChange={e => setNewSupplierForm({ ...newSupplierForm, address: e.target.value })}
                    placeholder="القاهرة، المنطقة الصناعية"
                    className={`w-full border rounded-xl p-3 text-sm font-bold bg-slate-50 focus:bg-white outline-none ${themeStyles.borderActive}`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">الرصيد الافتتاحي (له)</label>
                  <input
                    type="number"
                    step="any"
                    value={newSupplierForm.opening_balance || ''}
                    onChange={e => setNewSupplierForm({ ...newSupplierForm, opening_balance: parseFloat(e.target.value) || 0 })}
                    placeholder="0.00"
                    className={`w-full border rounded-xl p-3 text-sm font-bold font-mono bg-slate-50 focus:bg-white outline-none ${themeStyles.borderActive}`}
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsQuickAddOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={quickAddSubmitting}
                  className={`px-5 py-2.5 rounded-xl text-xs font-black text-white ${themeStyles.bgPrimary} hover:opacity-90 transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50`}
                >
                  {quickAddSubmitting ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                  حفظ واختيار المورد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🚀 Modal: تعديل بيانات المورد (Quick Edit Supplier) */}
      {isQuickEditOpen && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                  <Edit2 size={18} />
                </div>
                <h3 className="font-black text-lg text-slate-800">تعديل بيانات المورد</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsQuickEditOpen(false)}
                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleQuickEditSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">اسم المورد <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  value={editSupplierForm.name}
                  onChange={e => setEditSupplierForm({ ...editSupplierForm, name: e.target.value })}
                  className="w-full border rounded-xl p-3 text-sm font-bold bg-slate-50 focus:bg-white outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">رقم الهاتف</label>
                  <input
                    type="tel"
                    dir="ltr"
                    value={editSupplierForm.phone}
                    onChange={e => setEditSupplierForm({ ...editSupplierForm, phone: e.target.value })}
                    className="w-full border rounded-xl p-3 text-sm font-bold bg-slate-50 focus:bg-white outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">الرقم الضريبي</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={editSupplierForm.tax_number}
                    onChange={e => setEditSupplierForm({ ...editSupplierForm, tax_number: e.target.value })}
                    className="w-full border rounded-xl p-3 text-sm font-bold bg-slate-50 focus:bg-white outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">العنوان</label>
                <input
                  type="text"
                  value={editSupplierForm.address}
                  onChange={e => setEditSupplierForm({ ...editSupplierForm, address: e.target.value })}
                  className="w-full border rounded-xl p-3 text-sm font-bold bg-slate-50 focus:bg-white outline-none focus:border-amber-500"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsQuickEditOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={quickAddSubmitting}
                  className="px-5 py-2.5 rounded-xl text-xs font-black text-white bg-amber-600 hover:bg-amber-700 transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  {quickAddSubmitting ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                  حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierSearchSelect;
