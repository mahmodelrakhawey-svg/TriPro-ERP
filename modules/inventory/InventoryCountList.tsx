import { logger } from '../../utils/logger';
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { 
  History, Eye, CheckCircle, Clock, X, Package, AlertTriangle, 
  Check, Loader2, Search, Edit3, Trash2, Plus, Save, ExternalLink,
  Calendar, Warehouse, FileText, ArrowUpDown, RefreshCw
} from 'lucide-react';
import { normalizeArabic } from '../../components/ProductSearchSelect';
import { fetchCompleteDataset } from '../../services/balanceService';

// =========================================================================
// 1. مودال عرض تفاصيل الجرد (CountDetailsModal)
// =========================================================================
const CountDetailsModal = ({ 
  count, 
  items, 
  onClose, 
  onPost, 
  onEdit,
  isLoading 
}: { 
  count: Record<string, any>, 
  items: any[], 
  onClose: () => void, 
  onPost: (id: string) => void, 
  onEdit: (count: Record<string, any>) => void,
  isLoading: boolean 
}) => {
  const [showDiscrepanciesOnly, setShowDiscrepanciesOnly] = useState(false);
  const [modalSearchTerm, setModalSearchTerm] = useState('');

  if (!count) return null;

  const totalValueDiff = items.reduce((sum, item) => {
    const diff = (item.counted_quantity || 0) - (item.system_quantity || 0);
    const cost = item.products?.purchase_price || item.products?.cost || 0;
    return sum + (diff * cost);
  }, 0);

  const filteredItems = items.filter(item => {
    if (showDiscrepanciesOnly) {
      const diff = (item.counted_quantity || 0) - (item.system_quantity || 0);
      if (diff === 0) return false;
    }
    if (modalSearchTerm.trim()) {
      const clean = normalizeArabic(modalSearchTerm);
      const name = normalizeArabic(item.products?.name || '');
      const sku = normalizeArabic(item.products?.sku || '');
      const barcode = normalizeArabic(item.products?.barcode || '');
      if (!name.includes(clean) && !sku.includes(clean) && !barcode.includes(clean)) return false;
    }
    return true;
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        {/* رأس المودال */}
        <div className="bg-slate-50 px-6 py-4 border-b flex flex-wrap justify-between items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-lg text-slate-800">تفاصيل الجرد: {count.count_number}</h3>
              {count.status === 'posted' ? (
                <span className="bg-emerald-100 text-emerald-700 px-2.5 py-0.5 rounded-lg text-xs font-bold flex items-center gap-1">
                  <CheckCircle size={12}/> مرحّل
                </span>
              ) : (
                <span className="bg-amber-100 text-amber-700 px-2.5 py-0.5 rounded-lg text-xs font-bold flex items-center gap-1">
                  <Clock size={12}/> مسودة
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              المستودع: <span className="font-bold text-slate-700">{count.warehouses?.name || '-'}</span> | التاريخ: <span className="font-mono text-slate-700">{count.count_date}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
             <div className="relative w-48">
                <Search size={14} className="absolute right-2.5 top-2.5 text-slate-400" />
                <input 
                  type="text" 
                  value={modalSearchTerm} 
                  onChange={e => setModalSearchTerm(e.target.value)} 
                  placeholder="ابحث بالاسم أو الكود..."
                  className="w-full pr-8 pl-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold focus:border-blue-500 outline-none"
                />
             </div>
             <label className={`flex items-center gap-2 text-xs font-bold cursor-pointer select-none px-3 py-1.5 rounded-lg border transition-all shadow-sm ${showDiscrepanciesOnly ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'}`}>
                <input 
                    type="checkbox" 
                    checked={showDiscrepanciesOnly} 
                    onChange={(e) => setShowDiscrepanciesOnly(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-gray-300 cursor-pointer accent-blue-600"
                />
                عرض الفروقات فقط
             </label>
             <button onClick={onClose} className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-full transition-colors">
               <X size={18} />
             </button>
          </div>
        </div>
        
        {/* جدول الأصناف */}
        <div className="p-6 overflow-y-auto flex-1">
          {isLoading ? (
            <div className="flex justify-center items-center h-48"><Loader2 className="animate-spin text-blue-500" size={32} /></div>
          ) : (
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-100 text-slate-600 font-bold sticky top-0 shadow-sm">
                <tr>
                  <th className="p-3 rounded-r-lg">الصنف</th>
                  <th className="p-3 text-center">الرصيد الدفتري</th>
                  <th className="p-3 text-center">الرصيد الفعلي</th>
                  <th className="p-3 text-center">الفرق</th>
                  <th className="p-3 text-center rounded-l-lg">قيمة الفرق</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map(item => {
                  const diff = (item.counted_quantity || 0) - (item.system_quantity || 0);
                  const cost = item.products?.purchase_price || item.products?.cost || 0;
                  const valueDiff = diff * cost;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="p-3 font-medium text-slate-800 flex items-center gap-2">
                        <Package size={14} className="text-slate-400 shrink-0"/>
                        <span>{item.products?.name || 'صنف غير معروف'}</span>
                        {item.products?.sku && (
                          <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono font-bold">
                            [{item.products.sku}]
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-center font-mono text-slate-500">{item.system_quantity}</td>
                      <td className="p-3 text-center font-mono font-bold text-blue-600">{item.counted_quantity}</td>
                      <td className={`p-3 text-center font-mono font-bold ${diff === 0 ? 'text-slate-400' : diff > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {diff > 0 ? `+${diff}` : diff}
                      </td>
                      <td className="p-3 text-center font-mono text-slate-600">{valueDiff.toLocaleString()}</td>
                    </tr>
                  );
                })}
                {filteredItems.length === 0 && (
                    <tr><td colSpan={5} className="p-8 text-center text-slate-400">لا توجد أصناف مطابقة للعرض</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* ذيل المودال */}
        <div className="bg-slate-50 px-6 py-4 border-t flex flex-wrap justify-between items-center gap-3">
            <div className={`px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 ${totalValueDiff >= 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                {totalValueDiff >= 0 ? <Check size={16} /> : <AlertTriangle size={16} />}
                صافي قيمة الفروقات: {totalValueDiff.toLocaleString()} ج.م
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { onClose(); onEdit(count); }}
                className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <Edit3 size={16} /> تعديل كشف الجرد
              </button>
              {count.status === 'draft' && (
                <button 
                    onClick={() => onPost(count.id)}
                    className="bg-emerald-600 text-white px-5 py-2 rounded-lg font-bold text-sm flex items-center gap-1.5 hover:bg-emerald-700 transition-colors shadow-sm"
                >
                    <CheckCircle size={16} /> اعتماد وترحيل التسوية
                </button>
              )}
            </div>
        </div>
      </div>
    </div>
  );
};

// =========================================================================
// 2. مودال تعديل الجرد (EditCountModal)
// =========================================================================
interface EditCountModalProps {
  count: any;
  items: any[];
  onClose: () => void;
  onSave: (updatedCount: any, updatedItems: any[]) => Promise<void>;
  onPost?: (countId: string) => Promise<void>;
  onOpenInFullForm?: (countId: string) => void;
  isLoading: boolean;
  isSaving: boolean;
}

const EditCountModal = ({
  count,
  items: initialItems,
  onClose,
  onSave,
  onPost,
  onOpenInFullForm,
  isLoading,
  isSaving
}: EditCountModalProps) => {
  const [date, setDate] = useState(count?.count_date || '');
  const [notes, setNotes] = useState(count?.notes || '');
  const [items, setItems] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [diffOnly, setDiffOnly] = useState(false);

  useEffect(() => {
    if (initialItems) {
      setItems(initialItems.map(it => ({
        ...it,
        counted_quantity: Number(it.counted_quantity ?? it.system_quantity ?? 0),
        difference: Number((it.counted_quantity ?? it.system_quantity ?? 0) - (it.system_quantity ?? 0))
      })));
    }
  }, [initialItems]);

  if (!count) return null;
  const isPosted = count.status === 'posted';

  const handleQtyChange = (itemId: string, newQty: number) => {
    setItems(prev => prev.map(item => {
      if (item.id === itemId) {
        const sys = Number(item.system_quantity || 0);
        const actual = Number(newQty);
        return {
          ...item,
          counted_quantity: actual,
          difference: actual - sys
        };
      }
      return item;
    }));
  };

  const handleRemoveItem = (itemId: string) => {
    setItems(prev => prev.filter(i => i.id !== itemId));
  };

  const filtered = useMemo(() => {
    return items.filter(item => {
      if (diffOnly && (item.difference === 0)) return false;
      if (searchTerm.trim()) {
        const clean = normalizeArabic(searchTerm);
        const name = normalizeArabic(item.products?.name || '');
        const sku = normalizeArabic(item.products?.sku || '');
        const barcode = normalizeArabic(item.products?.barcode || '');
        if (!name.includes(clean) && !sku.includes(clean) && !barcode.includes(clean)) return false;
      }
      return true;
    });
  }, [items, searchTerm, diffOnly]);

  const totalValueDiff = useMemo(() => {
    return items.reduce((sum, item) => {
      const diff = Number(item.difference || 0);
      const cost = Number(item.products?.purchase_price || item.products?.cost || 0);
      return sum + (diff * cost);
    }, 0);
  }, [items]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(
      { ...count, count_date: date, notes },
      items
    );
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[92vh]" onClick={(e) => e.stopPropagation()}>
        {/* رأس النافذة */}
        <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl">
              <Edit3 size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg">تعديل كشف الجرد: {count.count_number}</h3>
                {isPosted ? (
                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded text-xs font-bold">مرحل</span>
                ) : (
                  <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded text-xs font-bold">مسودة</span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                المستودع: <span className="text-white font-bold">{count.warehouses?.name || '-'}</span>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* تنبيه إذا كان مرحلاً */}
        {isPosted && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 text-amber-900 text-xs font-medium flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-600 shrink-0" />
            <span>
              <strong>ملاحظة محاسبية:</strong> هذا الجرد معتمد ومرحل بالفعل وأثر على حسابات المخزون والقيود المحاسبية. تعديل الكميات مقفل لحماية الأرصدة، بينما يمكنك تعديل التاريخ والملاحظات الإيضاحية. إذا أردت تعديل الكميات يمكنك حذف الجرد أو تسجيل تسوية جديدة.
            </span>
          </div>
        )}

        {/* نموذج الحقول الأساسية */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                <Calendar size={13} className="text-slate-500" /> تاريخ الجرد
              </label>
              <input 
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-amber-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                <FileText size={13} className="text-slate-500" /> البيان والملاحظات
              </label>
              <input 
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="أي ملاحظات حول كشف الجرد..."
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-amber-500 outline-none"
              />
            </div>
          </div>

          {/* شريط البحث وتصفية الأصناف في التعديل */}
          <div className="flex flex-wrap justify-between items-center gap-3 pt-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">الأصناف المدرجة بالجرد ({items.length} صنف):</span>
              {!isPosted && onOpenInFullForm && (
                <button
                  type="button"
                  onClick={() => onOpenInFullForm(count.id)}
                  className="text-xs text-blue-600 hover:text-blue-800 hover:underline font-bold flex items-center gap-1 mr-2"
                >
                  <ExternalLink size={12} /> فتح في شاشة الجرد الكاملة (لإضافة أصناف أو استخدام الباركود)
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative w-44">
                <Search size={14} className="absolute right-2.5 top-2.5 text-slate-400" />
                <input 
                  type="text" 
                  value={searchTerm} 
                  onChange={e => setSearchTerm(e.target.value)} 
                  placeholder="بحث سريع بالصنف..."
                  className="w-full pr-8 pl-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold focus:border-amber-500 outline-none"
                />
              </div>
              <label className={`flex items-center gap-1.5 text-xs font-bold cursor-pointer select-none px-2.5 py-1.5 rounded-lg border transition-all ${diffOnly ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-white border-slate-200 text-slate-600'}`}>
                <input 
                  type="checkbox" 
                  checked={diffOnly} 
                  onChange={e => setDiffOnly(e.target.checked)}
                  className="w-3.5 h-3.5 text-amber-600 rounded cursor-pointer"
                />
                الفروقات فقط
              </label>
            </div>
          </div>

          {/* جدول أسطر الجرد القابلة للتعديل */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            {isLoading ? (
              <div className="flex justify-center items-center h-48"><Loader2 className="animate-spin text-amber-500" size={32} /></div>
            ) : (
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b">
                  <tr>
                    <th className="p-3">الصنف</th>
                    <th className="p-3 text-center">الرصيد الدفتري</th>
                    <th className="p-3 text-center">الكمية الفعلية (الجرد)</th>
                    <th className="p-3 text-center">الفرق</th>
                    <th className="p-3 text-center">قيمة الفرق</th>
                    {!isPosted && <th className="p-3 text-center">استبعاد</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(item => {
                    const diff = Number(item.difference || 0);
                    const cost = Number(item.products?.purchase_price || item.products?.cost || 0);
                    const valDiff = diff * cost;
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/70">
                        <td className="p-3 font-bold text-slate-800">
                          <div>{item.products?.name || 'صنف غير معروف'}</div>
                          {item.products?.sku && (
                            <span className="text-[10px] text-slate-500 font-mono">كود: {item.products.sku}</span>
                          )}
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-slate-500">
                          {item.system_quantity}
                        </td>
                        <td className="p-3 text-center">
                          {isPosted ? (
                            <span className="font-mono font-bold text-blue-600 text-sm">{item.counted_quantity}</span>
                          ) : (
                            <input 
                              type="number" 
                              min="0"
                              step="any"
                              value={item.counted_quantity}
                              onChange={e => handleQtyChange(item.id, parseFloat(e.target.value) || 0)}
                              className="w-24 text-center py-1 px-2 border-2 border-amber-200 rounded-lg font-mono font-bold text-sm text-amber-900 bg-amber-50/40 focus:bg-white focus:border-amber-500 outline-none"
                            />
                          )}
                        </td>
                        <td className={`p-3 text-center font-mono font-bold ${diff === 0 ? 'text-slate-400' : diff > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {diff > 0 ? `+${diff}` : diff}
                        </td>
                        <td className="p-3 text-center font-mono text-slate-600 font-bold">
                          {valDiff.toLocaleString()}
                        </td>
                        {!isPosted && (
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(item.id)}
                              className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="استبعاد الصنف من كشف الجرد"
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={isPosted ? 5 : 6} className="p-8 text-center text-slate-400">
                        لا توجد أصناف مطابقة للبحث
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ذيل المودال وأزرار الحفظ */}
        <div className="bg-slate-50 px-6 py-4 border-t flex flex-wrap justify-between items-center gap-3">
          <div className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ${totalValueDiff >= 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            <span>صافي قيمة الفروقات:</span>
            <strong className="font-mono text-sm">{totalValueDiff.toLocaleString()} ج.م</strong>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-100 transition-colors disabled:opacity-50"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSaving}
              className="bg-amber-600 hover:bg-amber-700 text-white px-5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
            >
              {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              حفظ التعديلات
            </button>
            {!isPosted && onPost && (
              <button
                type="button"
                onClick={async () => {
                  await handleSubmit({ preventDefault: () => {} } as any);
                  onPost(count.id);
                }}
                disabled={isSaving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
              >
                <CheckCircle size={15} /> حفظ واعتماد وترحيل
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// =========================================================================
// 3. المكون الأساسي لسجل الجرد المخزني (InventoryCountList)
// =========================================================================
const InventoryCountList = () => {
  const navigate = useNavigate();
  const { 
    recalculateStock, 
    currentUser, 
    currentSelectedOrgId, 
    selectedFiscalYear,
    warehouses 
  } = useAccounting();
  const { showToast } = useToast();

  const [counts, setCounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'posted' | 'draft'>('all');

  // مودال عرض التفاصيل
  const [selectedCount, setSelectedCount] = useState<any | null>(null);
  const [countItems, setCountItems] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isItemsLoading, setIsItemsLoading] = useState(false);

  // مودال التعديل
  const [editingCount, setEditingCount] = useState<any | null>(null);
  const [editItems, setEditItems] = useState<any[]>([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isEditLoading, setIsEditLoading] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // الحذف
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // جلب سجلات الجرد
  const fetchCounts = async () => {
    setLoading(true);
    if (currentUser?.role === 'demo') {
        setCounts([]);
        setLoading(false);
        return;
    }

    try {
      let query = supabase
        .from('inventory_counts')
        .select('*, warehouses(name)')
        .order('created_at', { ascending: false });

      if (currentSelectedOrgId && currentSelectedOrgId !== 'org-default-offline') {
        query = query.eq('organization_id', currentSelectedOrgId);
      }

      if (selectedFiscalYear) {
        query = query
          .gte('count_date', `${selectedFiscalYear}-01-01`)
          .lte('count_date', `${selectedFiscalYear}-12-31`);
      }

      const data = await fetchCompleteDataset<any>(async (from, to) => query.range(from, to));
      setCounts(data || []);
    } catch (err) {
      const errorObj = err as Error;
      logger.error('Error fetching inventory counts:', err);
      showToast('فشل في جلب سجلات الجرد المخزني: ' + (errorObj?.message || ''), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCounts();
  }, [selectedFiscalYear, currentSelectedOrgId]);

  // عرض التفاصيل
  const handleViewDetails = async (count: Record<string, any>) => {
    setSelectedCount(count);
    setIsModalOpen(true);
    setIsItemsLoading(true);
    
    const { data, error } = await supabase
      .from('inventory_count_items')
      .select('*, products(name, sku, barcode, purchase_price, cost)')
      .eq('inventory_count_id', count.id);

    if (error) {
        logger.error("Error fetching count items:", error);
        showToast("فشل في جلب تفاصيل الجرد.", 'error');
        setCountItems([]);
    } else {
        setCountItems(data || []);
    }
    setIsItemsLoading(false);
  };

  // فتح مودال التعديل
  const handleEditCount = async (count: Record<string, any>) => {
    setEditingCount(count);
    setIsEditModalOpen(true);
    setIsEditLoading(true);

    const { data, error } = await supabase
      .from('inventory_count_items')
      .select('*, products(name, sku, barcode, purchase_price, cost)')
      .eq('inventory_count_id', count.id);

    if (error) {
      logger.error("Error fetching items for edit:", error);
      showToast("فشل في جلب بيانات الأصناف للتعديل.", 'error');
      setEditItems([]);
    } else {
      setEditItems(data || []);
    }
    setIsEditLoading(false);
  };

  // حفظ التعديلات من مودال التعديل
  const handleSaveEdit = async (updatedCount: any, updatedItems: any[]) => {
    setIsSavingEdit(true);
    try {
      if (currentUser?.role === 'demo') {
        setCounts(prev => prev.map(c => c.id === updatedCount.id ? { ...c, ...updatedCount } : c));
        showToast('تم حفظ التعديلات بنجاح ✅ (محاكاة)', 'success');
        setIsEditModalOpen(false);
        return;
      }

      // 1. تحديث رأس الجرد (التاريخ والملاحظات)
      const { error: headerErr } = await supabase
        .from('inventory_counts')
        .update({
          count_date: updatedCount.count_date,
          notes: updatedCount.notes,
        })
        .eq('id', updatedCount.id);

      if (headerErr) throw headerErr;

      // 2. إذا كان الجرد مسودة، نحدث كميات الأصناف المحفوظة
      if (updatedCount.status === 'draft') {
        // حذف الأصناف المستبعدة إن وجدت
        const keptIds = updatedItems.map(i => i.id).filter(Boolean);
        if (keptIds.length > 0) {
          await supabase
            .from('inventory_count_items')
            .delete()
            .eq('inventory_count_id', updatedCount.id)
            .not('id', 'in', `(${keptIds.join(',')})`);
        }

        // تحديث كل سطر بالكميات والفرق الجديد
        for (const item of updatedItems) {
          if (item.id) {
            await supabase
              .from('inventory_count_items')
              .update({
                counted_quantity: Number(item.counted_quantity || 0),
                difference: Number(item.difference || 0),
              })
              .eq('id', item.id);
          }
        }
      }

      showToast(`تم حفظ تعديلات كشف الجرد (${updatedCount.count_number}) بنجاح ✅`, 'success');
      setIsEditModalOpen(false);
      await fetchCounts();
    } catch (err) {
      const errorObj = err as Error;
      logger.error('Error saving count edit:', err);
      showToast('فشل في حفظ التعديلات: ' + (errorObj?.message || ''), 'error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // فتح كشف الجرد في شاشة الجرد الكاملة
  const handleOpenInFullForm = (countId: string) => {
    setIsEditModalOpen(false);
    setIsModalOpen(false);
    navigate('/inventory-count', { state: { editCountId: countId } });
  };

  // حذف كشف الجرد (مع معالجة القيود المحاسبية والتسويات في حال كان مرحلاً)
  const handleDeleteCount = async (count: Record<string, any>) => {
    const isPosted = count.status === 'posted';
    const confirmMsg = isPosted
      ? `⚠️ تحذير محاسبي هام:\nكشف الجرد رقم (${count.count_number}) معتمد ومرحّل وأثر على أرصدة المخازن والقيود المحاسبية.\n\nهل أنت متأكد من حذفه نهائياً؟\nسيقوم النظام تلقائياً بالتراجع عن التسوية المخزنية والقيود المحاسبية المرتبطة به وإعادة احتساب رصيد المخزون.`
      : `هل أنت متأكد من حذف مسودة الجرد رقم (${count.count_number}) نهائياً؟`;

    if (!window.confirm(confirmMsg)) return;

    setDeletingId(count.id);
    try {
      if (currentUser?.role === 'demo') {
        setCounts(prev => prev.filter(c => c.id !== count.id));
        showToast('تم حذف كشف الجرد بنجاح ✅ (محاكاة)', 'success');
        return;
      }

      // إذا كان مرحلاً، نبحث عن التسوية المخزنية والقيود المحاسبية المرتبطة ونحذفها بأمان
      if (isPosted) {
        const adjNumber = `ADJ-CNT-${count.count_number}`;

        const { data: adjs } = await supabase
          .from('stock_adjustments')
          .select('id')
          .eq('adjustment_number', adjNumber);

        if (adjs && adjs.length > 0) {
          for (const adj of adjs) {
            const { data: jes } = await supabase
              .from('journal_entries')
              .select('id')
              .or(`reference.eq.${adjNumber},related_document_id.eq.${adj.id}`);

            if (jes && jes.length > 0) {
              for (const je of jes) {
                // إلغاء ترحيل القيد أولاً لتفادي قيود مشغلات RLS ثم حذف الأسطر والرأس
                await supabase.from('journal_entries').update({ status: 'draft', is_posted: false }).eq('id', je.id);
                await supabase.from('journal_lines').delete().eq('journal_entry_id', je.id);
                await supabase.from('journal_entries').delete().eq('id', je.id);
              }
            }

            await supabase.from('stock_adjustment_items').delete().eq('stock_adjustment_id', adj.id);
            await supabase.from('stock_adjustments').delete().eq('id', adj.id);
          }
        }
      }

      // حذف أسطر كشف الجرد
      const { error: itemsDelError } = await supabase
        .from('inventory_count_items')
        .delete()
        .eq('inventory_count_id', count.id);
      if (itemsDelError) throw itemsDelError;

      // حذف رأس كشف الجرد
      const { error: countDelError } = await supabase
        .from('inventory_counts')
        .delete()
        .eq('id', count.id);
      if (countDelError) throw countDelError;

      // إذا كان مرحلاً، نعيد احتساب المخزون
      if (isPosted) {
        await recalculateStock();
      }

      showToast(`تم حذف كشف الجرد (${count.count_number}) بنجاح ✅`, 'success');
      await fetchCounts();
    } catch (err) {
      const errorObj = err as Error;
      logger.error('Error deleting inventory count:', err);
      showToast('فشل في حذف كشف الجرد: ' + (errorObj?.message || ''), 'error');
    } finally {
      setDeletingId(null);
    }
  };

  // ترحيل كشف الجرد
  const handlePostCount = async (countId: string) => {
    if (!window.confirm('هل أنت متأكد من ترحيل هذا الجرد؟ سيتم إنشاء تسوية مخزنية وقيد محاسبي بالفروقات فوراً.')) return;
    if (currentUser?.role === 'demo') {
        showToast('تم ترحيل الجرد بنجاح ✅ (محاكاة)', 'success');
        setIsModalOpen(false);
        setIsEditModalOpen(false);
        return;
    }
    
    try {
        const { error } = await supabase.rpc('post_inventory_count', { 
            p_count_id: countId 
        });

        if (error) throw error;

        await recalculateStock();
        showToast('تم ترحيل الجرد وإنشاء التسوية والقيد المحاسبي بنجاح ✅', 'success');
        setIsModalOpen(false);
        setIsEditModalOpen(false);
        fetchCounts();
    } catch (error) {
        const errObj = error as Error;
        logger.error(error);
        showToast('فشل ترحيل الجرد: ' + (errObj?.message || ''), 'error');
    }
  };

  // فلترة قائمة عمليات الجرد
  const filteredCounts = useMemo(() => {
    return counts.filter(c => {
      if (statusFilter === 'posted' && c.status !== 'posted') return false;
      if (statusFilter === 'draft' && c.status === 'posted') return false;
      if (searchTerm.trim()) {
        const clean = normalizeArabic(searchTerm);
        const num = normalizeArabic(c.count_number || '');
        const wh = normalizeArabic(c.warehouses?.name || '');
        const notes = normalizeArabic(c.notes || '');
        if (!num.includes(clean) && !wh.includes(clean) && !notes.includes(clean)) return false;
      }
      return true;
    });
  }, [counts, searchTerm, statusFilter]);

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* شريط العنوان وزر إضافة جرد جديد */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <History className="text-blue-600" /> سجل عمليات الجرد المخزني
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            عرض وتعديل وحذف وأرشفة عمليات الجرد الفعلي والتسويات المخزنية
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => fetchCounts()}
            className="p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-xl transition-colors border border-slate-200"
            title="تحديث القائمة"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => navigate('/inventory-count')}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-500/20 active:scale-95"
          >
            <Plus size={16} /> كشف جرد مخزني جديد
          </button>
        </div>
      </div>

      {/* شريط البحث وتصفية الحالة */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap justify-between items-center gap-3">
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <Search className="absolute right-3 top-2.5 text-slate-400" size={17} />
          <input 
            type="text" 
            placeholder="بحث برقم الجرد أو المستودع أو الملاحظات..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pr-10 pl-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg text-xs font-bold">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-md transition-all ${statusFilter === 'all' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            الكل ({counts.length})
          </button>
          <button
            onClick={() => setStatusFilter('posted')}
            className={`px-3 py-1.5 rounded-md transition-all ${statusFilter === 'posted' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            المرحّلة ({counts.filter(c => c.status === 'posted').length})
          </button>
          <button
            onClick={() => setStatusFilter('draft')}
            className={`px-3 py-1.5 rounded-md transition-all ${statusFilter === 'draft' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            المسودات ({counts.filter(c => c.status !== 'posted').length})
          </button>
        </div>
      </div>

      {/* جدول كشوفات الجرد المخزني مع أعمدة العرض والتعديل والحذف */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-right text-sm">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 text-xs">
                <tr>
                    <th className="p-4">رقم الجرد</th>
                    <th className="p-4">التاريخ</th>
                    <th className="p-4">المستودع</th>
                    <th className="p-4">الحالة</th>
                    <th className="p-4">ملاحظات</th>
                    <th className="p-4 text-center">عرض</th>
                    <th className="p-4 text-center">تعديل</th>
                    <th className="p-4 text-center">حذف</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {loading ? (
                    <tr>
                      <td colSpan={8} className="p-12 text-center">
                        <Loader2 className="animate-spin mx-auto text-blue-600 mb-2" size={28} />
                        <span className="text-xs font-bold text-slate-400">جاري تحميل سجلات الجرد...</span>
                      </td>
                    </tr>
                ) : filteredCounts.length > 0 ? (
                    filteredCounts.map(count => (
                        <tr key={count.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-4 font-mono font-bold text-blue-600 text-xs">{count.count_number}</td>
                            <td className="p-4 text-xs font-medium text-slate-700">{count.count_date}</td>
                            <td className="p-4 text-xs font-bold text-slate-800">{count.warehouses?.name || '-'}</td>
                            <td className="p-4">
                                {count.status === 'posted' ? (
                                    <span className="bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 w-fit">
                                      <CheckCircle size={12}/> مرحّل
                                    </span>
                                ) : (
                                    <span className="bg-amber-100 text-amber-700 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 w-fit">
                                      <Clock size={12}/> مسودة
                                    </span>
                                )}
                            </td>
                            <td className="p-4 text-slate-500 text-xs max-w-xs truncate">{count.notes || '-'}</td>

                            {/* عمود عرض التفاصيل */}
                            <td className="p-4 text-center">
                                <button 
                                    onClick={() => handleViewDetails(count)} 
                                    className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors" 
                                    title="عرض تفاصيل كشف الجرد"
                                >
                                    <Eye size={18} />
                                </button>
                            </td>

                            {/* عمود التعديل */}
                            <td className="p-4 text-center">
                                <button 
                                    onClick={() => handleEditCount(count)} 
                                    className="p-2 text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors" 
                                    title="تعديل كشف الجرد"
                                >
                                    <Edit3 size={18} />
                                </button>
                            </td>

                            {/* عمود الحذف */}
                            <td className="p-4 text-center">
                                <button 
                                    onClick={() => handleDeleteCount(count)} 
                                    disabled={deletingId === count.id}
                                    className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50" 
                                    title="حذف كشف الجرد"
                                >
                                    {deletingId === count.id ? (
                                        <Loader2 size={18} className="animate-spin text-red-500" />
                                    ) : (
                                        <Trash2 size={18} />
                                    )}
                                </button>
                            </td>
                        </tr>
                    ))
                ) : (
                    <tr>
                      <td colSpan={8} className="p-12 text-center text-slate-400">
                        <History size={36} className="mx-auto mb-2 opacity-30 text-slate-400" />
                        <p className="font-bold text-sm">لا توجد عمليات جرد سابقة مطابقة</p>
                      </td>
                    </tr>
                )}
            </tbody>
        </table>
      </div>

      {/* مودال عرض التفاصيل */}
      {isModalOpen && (
        <CountDetailsModal 
            count={selectedCount}
            items={countItems}
            onClose={() => setIsModalOpen(false)}
            onPost={handlePostCount}
            onEdit={handleEditCount}
            isLoading={isItemsLoading}
        />
      )}

      {/* مودال التعديل */}
      {isEditModalOpen && (
        <EditCountModal
          count={editingCount}
          items={editItems}
          onClose={() => setIsEditModalOpen(false)}
          onSave={handleSaveEdit}
          onPost={handlePostCount}
          onOpenInFullForm={handleOpenInFullForm}
          isLoading={isEditLoading}
          isSaving={isSavingEdit}
        />
      )}
    </div>
  );
};

export default InventoryCountList;
