import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { Key } from 'react';
import { useToast } from '../context/ToastContext';
import { useAccounting, SYSTEM_ACCOUNTS } from '../context/AccountingContext';
import type { RestaurantTable, Product, OrderItem, SelectedModifier } from '../types';
import { Coffee, HardHat, LayoutGrid, Utensils, Plus, Trash2, Minus, Edit, Search, X, Printer, ArrowRightLeft, GitMerge, CalendarCheck } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { useReactToPrint } from 'react-to-print';
import { PrintableInvoice } from './PrintableInvoice';
import { KitchenTicket } from './KitchenTicket';




export interface ActiveOrder {
  tableId: string;
  sessionId: string;
  orderId?: string;
  tableName: string;
  items: OrderItem[];
}

interface Category {
  id: string;
  name: string;
}

// --- المكونات الفرعية ---

const TableCard = ({ table, onClick, isActive, onDelete, onEdit, onReserve }: { table: RestaurantTable; onClick: () => void; isActive: boolean, onDelete: () => void, onEdit: () => void, onReserve: () => void }) => {
  const statusStyles: { [key: string]: string } = {
    AVAILABLE: 'bg-green-100 text-green-800 border-green-300 hover:bg-green-200',
    OCCUPIED: 'bg-red-100 text-red-800 border-red-300 hover:bg-red-200',
    RESERVED: 'bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-200',
  };
  const statusText: { [key: string]: string } = { AVAILABLE: 'متاحة', OCCUPIED: 'مشغولة', RESERVED: 'محجوزة' };

  return (
    <div
      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${statusStyles[table.status]} ${isActive ? 'ring-4 ring-blue-400' : ''}`}
    >
      <div onClick={onClick} className="font-bold text-xl">{table.name} {table.status === 'RESERVED' && <span className="text-[10px] bg-yellow-500 text-white px-1 rounded font-black">محجوزة</span>}</div>
      <div onClick={onClick} className="text-xs">{statusText[table.status]} {(table as any).reservation_info?.customerName ? `- ${(table as any).reservation_info.customerName}` : ''}</div>

      <div className="flex mt-2 justify-between">
        <button onClick={onEdit} className="text-xs text-blue-500 hover:text-blue-700 font-bold">تعديل</button>
        {table.status === 'AVAILABLE' && <button onClick={onReserve} className="text-xs text-emerald-600 hover:text-emerald-800 font-bold">حجز</button>}
        <button onClick={onDelete} className="text-xs text-red-500 hover:text-red-700 font-bold">حذف</button>
      </div>
    </div>


  );
};

const ModifierModal = ({ isOpen, onClose, onConfirm, product }: { isOpen: boolean, onClose: () => void, onConfirm: (modifiers: SelectedModifier[], notes: string) => void, product: Product | null }) => {
  const [selected, setSelected] = useState<SelectedModifier[]>([]);
  const [notes, setNotes] = useState('');

  // تجريبي: في الواقع يتم جلب هذه الخيارات من قاعدة البيانات لكل صنف
  const availableModifiers: SelectedModifier[] = [
    { name: 'زيادة جبنة', price: 5, cost: 2.00 },
    { name: 'حجم عائلي', price: 15, cost: 5.50 },
    { name: 'إضافة صوص', price: 2, cost: 0.50 },
  ];

  if (!isOpen || !product) return null;

  const toggleModifier = (mod: SelectedModifier) => {
    setSelected(prev => 
      prev.find(m => m.name === mod.name) 
        ? prev.filter(m => m.name !== mod.name)
        : [...prev, mod]
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-lg text-slate-800">خيارات: {product.name}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {availableModifiers.map(mod => (
              <button
                key={mod.name}
                onClick={() => toggleModifier(mod)}
                className={`p-3 rounded-lg border-2 text-right transition-all ${selected.find(m => m.name === mod.name) ? 'border-blue-600 bg-blue-50' : 'border-slate-100 hover:border-slate-200'}`}
              >
                <div className="font-bold text-sm">{mod.name}</div>
                <div className="text-xs text-blue-600">+{mod.price} SAR</div>
              </button>
            ))}
          </div>
          <textarea placeholder="ملاحظات خاصة (مثل: بدون بصل)" className="w-full border rounded-lg p-2 text-sm h-20 outline-none focus:ring-1 focus:ring-blue-500" value={notes} onChange={e => setNotes(e.target.value)} />
          <button onClick={() => onConfirm(selected, notes)} className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700">تأكيد الخيارات</button>
        </div>
      </div>
    </div>
  );
};

const ReservationModal = ({ isOpen, onClose, onConfirm, table }: { isOpen: boolean, onClose: () => void, onConfirm: (name: string, time: string) => void, table: RestaurantTable | null }) => {
  const [name, setName] = useState('');
  const [time, setTime] = useState('');

  if (!isOpen || !table) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2"><CalendarCheck size={20} className="text-blue-600"/> حجز طاولة: {table.name}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">اسم العميل</label>
            <input 
              type="text" 
              value={name} 
              onChange={e => setName(e.target.value)} 
              className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none" 
              placeholder="اسم صاحب الحجز" 
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">وقت الوصول المتوقع</label>
            <input 
              type="time" 
              value={time} 
              onChange={e => setTime(e.target.value)} 
              className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none" 
            />
          </div>
          <button 
            disabled={!name || !time}
            onClick={() => onConfirm(name, time)} 
            className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all"
          >
            تأكيد الحجز
          </button>
        </div>
      </div>
    </div>
  );
};

const MenuItemCard = ({ item, onClick }: { item: Product; onClick: () => void }) => (
  <div onClick={onClick} className="bg-white border border-slate-200 rounded-lg p-3 text-center cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-all h-full flex flex-col justify-between shadow-sm">
    <div className="font-semibold text-slate-800 text-sm">{item.name}</div>
    <div className="text-sm font-bold text-blue-600 mt-2">{(item.sales_price || item.price || 0).toFixed(2)} SAR</div>
  </div>
);

const OrderSummary = ({ order, onUpdateItem, onClearOrder, onAcceptOrder, onPayment, onPrintProforma, onTransfer, onMerge, isSubmitting }: { order: ActiveOrder | null; onUpdateItem: (productId: string, change: number) => void; onClearOrder: () => void; onAcceptOrder: () => void; onPayment: () => void; onPrintProforma: () => void; onTransfer: () => void; onMerge: () => void; isSubmitting: boolean; }) => {
  const { settings } = useAccounting();
  const totals = useMemo(() => {
    if (!order) return { subtotal: 0, tax: 0, total: 0 };
    const subtotal = order.items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    const tax = subtotal * ((settings.vatRate || 15) / 100);
    const total = subtotal + tax;
    return { subtotal, tax, total };
  }, [order, settings.vatRate]);

  // حساب قيمة الأصناف الجديدة فقط التي سيتم إرسالها
  const newItemsTotal = useMemo(() => {
    if (!order) return 0;
    return order.items.reduce((sum, item) => sum + (item.unitPrice * (item.quantity - (item.savedQuantity || 0))), 0);
  }, [order]);
  const hasNewItems = newItemsTotal > 0;

  if (!order) {
    return (
      <div className="bg-white rounded-lg shadow-sm h-full flex flex-col items-center justify-center text-center p-4">
        <Utensils size={48} className="text-slate-300 mb-4" />
        <h3 className="font-bold text-slate-600">لم يتم تحديد طلب</h3>
        <p className="text-sm text-slate-400">الرجاء اختيار طاولة لبدء الطلب</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm h-full flex flex-col">
      <div className="p-4 border-b flex justify-between items-center">
        <h3 className="text-lg font-bold text-slate-800">فاتورة طاولة: {order.tableName}</h3>
        <button onClick={onClearOrder} className="text-xs text-red-500 hover:text-red-700 font-bold">إلغاء الطلب</button>
      </div>
      <div className="flex-1 p-2 overflow-y-auto space-y-2 min-h-0">
        {order.items.map(item => (
          <div key={item.productId} className="flex justify-between items-center bg-slate-50 p-2 rounded-lg">
            <div className="flex-1">
              <div className="font-semibold text-sm">{item.name}</div>
              {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                <div className="text-[10px] text-blue-600 font-medium">
                  {item.selectedModifiers.map(m => m.name).join(', ')}
                </div>
              )}
              {item.notes && <div className="text-[10px] text-red-500 italic">{item.notes}</div>}
              <div className="text-xs text-slate-500">{(item.unitPrice).toFixed(2)}</div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => onUpdateItem(item.productId, -1)} className={`p-1 rounded-full ${item.savedQuantity && item.quantity <= item.savedQuantity ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-red-100 text-red-600'}`} disabled={item.savedQuantity ? item.quantity <= item.savedQuantity : false}><Minus size={12} /></button>
              <span className="font-bold w-6 text-center">{item.quantity}</span>
              {item.savedQuantity && item.savedQuantity > 0 && <span className="text-[10px] text-slate-400 bg-slate-100 px-1 rounded" title="تم طلبه مسبقاً">+{item.savedQuantity}</span>}
              <button onClick={() => onUpdateItem(item.productId, 1)} className="p-1 bg-emerald-100 text-emerald-600 rounded-full hover:bg-emerald-200"><Plus size={12} /></button>
            </div>
            <div className="font-bold w-20 text-left">{(item.unitPrice * item.quantity).toFixed(2)}</div>
          </div>
        ))}
      </div>
      <div className="p-4 border-t space-y-2">
        <div className="flex justify-between text-sm"><span className="text-slate-500">المجموع الفرعي</span><span className="font-semibold">{totals.subtotal.toFixed(2)}</span></div>
        <div className="flex justify-between text-sm"><span className="text-slate-500">الضريبة ({settings.vatRate || 15}%)</span><span className="font-semibold">{totals.tax.toFixed(2)}</span></div>
        <div className="flex justify-between text-lg font-bold text-slate-800"><span >الإجمالي</span><span>{totals.total.toFixed(2)} SAR</span></div>
      </div>
      <div className="p-3 grid grid-cols-2 gap-2">
        <button 
            onClick={onMerge}
            className="col-span-1 bg-amber-50 text-amber-700 font-bold py-2 rounded-lg hover:bg-amber-100 transition-colors text-xs flex items-center justify-center gap-1 border border-amber-100 mb-1" 
            disabled={!order || !order.sessionId}>
          <GitMerge size={14} /> دمج الطاولات
        </button>
        <button 
            onClick={onTransfer}
            className="col-span-2 bg-indigo-50 text-indigo-700 font-bold py-2 rounded-lg hover:bg-indigo-100 transition-colors text-sm flex items-center justify-center gap-2 border border-indigo-100 mb-1" 
            disabled={!order || !order.sessionId}>
          <ArrowRightLeft size={16} /> تحويل الطاولة
        </button>
        <button 
            onClick={onPrintProforma}
            className="col-span-2 bg-slate-100 text-slate-700 font-bold py-2 rounded-lg hover:bg-slate-200 transition-colors text-sm flex items-center justify-center gap-2 border border-slate-200 mb-1" 
            disabled={!order.items.length}>
          <Printer size={16} /> طباعة مراجعة (Pro-forma)
        </button>
        <button 
            onClick={onAcceptOrder}
            className="bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition-colors text-base disabled:opacity-50" 
            disabled={!hasNewItems || isSubmitting}>
          {isSubmitting ? 'جاري...' : `إرسال (${newItemsTotal.toFixed(0)})`}
        </button>
        
        <button 
            onClick={onPayment}
            className="bg-emerald-600 text-white font-bold py-3 rounded-lg hover:bg-emerald-700 transition-colors text-base disabled:opacity-50" 
            disabled={!order.orderId || hasNewItems}>
          دفع وإغلاق
        </button>
      </div>
    </div>
  );
};

// --- Add Table Modal Component ---
const AddTableModal = ({ isOpen, onClose, onSave, sections }: { isOpen: boolean, onClose: () => void, onSave: (data: { name: string, capacity: number, section: string }) => void, sections: string[] }) => {
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState(4);
  const [section, setSection] = useState('داخلي');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('اسم الطاولة مطلوب');
      return;
    }
    setError('');
    setIsSaving(true);
    await onSave({ name, capacity, section });
    setIsSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95">
        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-lg text-slate-800">إضافة طاولة جديدة</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="bg-red-100 text-red-700 p-3 rounded-lg text-sm">{error}</div>}
          <div>
            <label className="block text-sm font-bold mb-1 text-slate-700">اسم الطاولة</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" placeholder="مثال: T10 أو طاولة الزاوية" required />
          </div>
          <div>
            <label className="block text-sm font-bold mb-1 text-slate-700">السعة (عدد الكراسي)</label>
            <input type="number" value={capacity} onChange={e => setCapacity(Number(e.target.value))} className="w-full border border-slate-300 rounded-lg p-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" min="1" required />
          </div>
          <div>
            <label className="block text-sm font-bold mb-1 text-slate-700">القسم</label>
            <input type="text" value={section} onChange={e => setSection(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" placeholder="مثال: داخلي، خارجي، VIP" />
            {sections.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {sections.map(sec => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => setSection(sec)}
                    className={`text-xs font-bold px-3 py-1 rounded-full border transition-all ${section === sec ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'}`}
                  >
                    {sec}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t mt-6">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-100 rounded-lg font-semibold hover:bg-slate-200 text-slate-700">إلغاء</button>
            <button type="submit" disabled={isSaving} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50">
              {isSaving ? 'جاري الحفظ...' : 'حفظ الطاولة'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- Edit Table Modal Component ---
const EditTableModal = ({ table, isOpen, onClose, onSave, sections }: { table: RestaurantTable | null; isOpen: boolean, onClose: () => void, onSave: (id: string, data: { name: string, capacity: number, section: string }) => void, sections: string[] }) => {
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState(4);
  const [section, setSection] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (table) {
      setName(table.name);
      setCapacity(table.capacity || 4);
      setSection(table.section || 'داخلي');
    }
  }, [table]);

  if (!isOpen || !table) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('اسم الطاولة مطلوب');
      return;
    }
    setError('');
    setIsSaving(true);
    await onSave(table.id, { name, capacity, section });
    setIsSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95">
        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-lg text-slate-800">تعديل الطاولة: {table.name}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="bg-red-100 text-red-700 p-3 rounded-lg text-sm">{error}</div>}
          <div>
            <label className="block text-sm font-bold mb-1 text-slate-700">اسم الطاولة</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" placeholder="مثال: T10 أو طاولة الزاوية" required />
          </div>
          <div>
            <label className="block text-sm font-bold mb-1 text-slate-700">السعة (عدد الكراسي)</label>
            <input type="number" value={capacity} onChange={e => setCapacity(Number(e.target.value))} className="w-full border border-slate-300 rounded-lg p-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" min="1" required />
          </div>
          <div>
            <label className="block text-sm font-bold mb-1 text-slate-700">القسم</label>
            <input type="text" value={section} onChange={e => setSection(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" placeholder="مثال: داخلي، خارجي، VIP" />
            {sections.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {sections.map(sec => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => setSection(sec)}
                    className={`text-xs font-bold px-3 py-1 rounded-full border transition-all ${section === sec ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'}`}
                  >
                    {sec}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t mt-6">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-100 rounded-lg font-semibold hover:bg-slate-200 text-slate-700">إلغاء</button>
            <button type="submit" disabled={isSaving} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50">
              {isSaving ? 'جاري الحفظ...' : 'حفظ التعديلات'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const MergeTableModal = ({ isOpen, onClose, onConfirm, currentTableId, tables }: { isOpen: boolean, onClose: () => void, onConfirm: (targetTableId: string) => void, currentTableId: string, tables: RestaurantTable[] }) => {
  const [targetId, setTargetId] = useState('');
  const occupiedTables = tables.filter(t => t.status === 'OCCUPIED' && t.id !== currentTableId);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2"><GitMerge size={20} className="text-amber-600"/> دمج مع طاولة أخرى</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-500">سيتم نقل جميع طلبات الطاولة الحالية إلى الطاولة المختارة أدناه.</p>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">اختر الطاولة المستهدفة (المشغولة):</label>
            <select 
              className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 focus:border-amber-500 outline-none bg-slate-50 font-bold"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            >
              <option value="">-- اختر طاولة مشغولة --</option>
              {occupiedTables.map(t => (
                <option key={t.id} value={t.id}>{t.name} (مشغولة)</option>
              ))}
            </select>
          </div>
          <button 
            disabled={!targetId}
            onClick={() => onConfirm(targetId)} 
            className="w-full bg-amber-600 text-white font-bold py-3 rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-all shadow-lg shadow-amber-100"
          >
            تأكيد الدمج النهائي
          </button>
        </div>
      </div>
    </div>
  );
};

const TransferTableModal = ({ isOpen, onClose, onConfirm, currentTableId, tables }: { isOpen: boolean, onClose: () => void, onConfirm: (targetTableId: string) => void, currentTableId: string, tables: RestaurantTable[] }) => {
  const [targetId, setTargetId] = useState('');
  const availableTables = tables.filter(t => t.status === 'AVAILABLE' && t.id !== currentTableId);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2"><ArrowRightLeft size={20} className="text-blue-600"/> تحويل الطاولة</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">اختر الطاولة الجديدة:</label>
            <select 
              className="w-full border-2 border-slate-100 rounded-xl px-4 py-3 focus:border-blue-500 outline-none bg-slate-50 font-bold"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            >
              <option value="">-- اختر طاولة متاحة --</option>
              {availableTables.map(t => (
                <option key={t.id} value={t.id}>{t.name} (سعة: {t.capacity})</option>
              ))}
            </select>
          </div>
          <button 
            disabled={!targetId}
            onClick={() => onConfirm(targetId)} 
            className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all"
          >
            تأكيد التحويل
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Payment Modal Component ---
const PaymentModal = ({ isOpen, onClose, onConfirmPayment, activeOrder, settings }: { isOpen: boolean, onClose: () => void, onConfirmPayment: (paidItems: OrderItem[], method: 'CASH' | 'CARD') => void, activeOrder: ActiveOrder | null, settings: any }) => {
  const { showToast } = useToast();
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD'>('CASH');
  const [splitMode, setSplitMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([]);

  useEffect(() => {
    if (isOpen && activeOrder) {
      // عند فتح المودال، ننسخ الأصناف لتتبع التغييرات في وضع التقسيم
      setSelectedItems(activeOrder.items.map(item => ({ ...item })));
      setSplitMode(false); // نبدأ دائماً بوضع الدفع الكامل
    }
  }, [isOpen, activeOrder]);

  const calculateTotals = (itemsToCalculate: OrderItem[]) => {
    const subtotal = itemsToCalculate.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    const tax = subtotal * ((settings.vatRate || 15) / 100);
    const total = subtotal + tax;
    return { subtotal, tax, total };
  };

  const currentTotals = useMemo(() => {
    return calculateTotals(splitMode ? selectedItems.filter(item => item.quantity > 0) : (activeOrder?.items || []));
  }, [splitMode, selectedItems, activeOrder, settings.vatRate]);

  const handleItemQuantityChange = (productId: string, change: number) => {
    setSelectedItems(prev => prev.map(item => {
      if (item.productId === productId) {
        // البحث عن الكمية الأصلية في الطلب لمنع تجاوزها أثناء التقسيم
        const originalItem = activeOrder.items.find(i => i.productId === productId);
        const maxAvailable = originalItem ? originalItem.quantity : 0;
        
        const newQty = Math.max(0, Math.min(maxAvailable, item.quantity + change));
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const handleConfirm = () => {
    if (splitMode) {
      const itemsToPay = selectedItems.filter(item => item.quantity > 0);
      if (itemsToPay.length === 0) {
        showToast('الرجاء اختيار صنف واحد على الأقل للدفع.', 'warning');
        return;
      }
      onConfirmPayment(itemsToPay, paymentMethod);
    } else {
      onConfirmPayment([], paymentMethod); // قائمة فارغة تعني دفع كامل
    }
    onClose();
  };

  const handleSelectAll = () => {
    if (!activeOrder) return;
    setSelectedItems(activeOrder.items.map(item => ({ ...item })));
  };

  const handleClearAll = () => {
    setSelectedItems(prev => prev.map(item => ({ ...item, quantity: 0 })));
  };

  if (!isOpen || !activeOrder) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95">
        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-lg text-slate-800">الدفع وإغلاق الجلسة</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex justify-center gap-2 mb-4">
            <button 
              onClick={() => setSplitMode(false)} 
              className={`px-4 py-2 rounded-lg font-bold text-sm ${!splitMode ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              دفع كامل
            </button>
            <button 
              onClick={() => setSplitMode(true)} 
              className={`px-4 py-2 rounded-lg font-bold text-sm ${splitMode ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              تقسيم الفاتورة
            </button>
          </div>

          {splitMode && (
            <div className="max-h-60 overflow-y-auto space-y-2 border p-2 rounded-lg bg-slate-50">
              <div className="flex justify-between items-center px-1 mb-2 sticky top-0 bg-slate-50 z-10 py-1 border-b border-slate-200">
                <button type="button" onClick={handleSelectAll} className="text-xs font-black text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1">
                  <Plus size={12} /> اختيار الكل
                </button>
                <button type="button" onClick={handleClearAll} className="text-xs font-black text-red-600 hover:text-red-800 transition-colors flex items-center gap-1">
                  <X size={12} /> إلغاء الكل
                </button>
              </div>
              {activeOrder.items.map(originalItem => {
                const item = selectedItems.find(si => si.productId === originalItem.productId) || originalItem;
                return (
                  <div key={item.productId} className="flex justify-between items-center bg-white p-2 rounded-lg shadow-sm">
                    <div className="flex-1">
                      <div className="font-semibold text-sm">{item.name}</div>
                      {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                        <div className="text-[10px] text-blue-600 font-medium">
                          {item.selectedModifiers.map(m => m.name).join(', ')}
                        </div>
                      )}
                      <div className="text-xs text-slate-500">{(item.unitPrice).toFixed(2)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleItemQuantityChange(item.productId, -1)} className="p-1 rounded-full bg-red-100 text-red-600"><Minus size={12} /></button>
                      <span className="font-bold w-6 text-center">{item.quantity}</span>
                      <button onClick={() => handleItemQuantityChange(item.productId, 1)} className="p-1 bg-emerald-100 text-emerald-600 rounded-full"><Plus size={12} /></button>
                    </div>
                    <div className="font-bold w-20 text-left">{(item.unitPrice * item.quantity).toFixed(2)}</div>
                  </div>
                );
              })}
            </div>
          )}

          <div>
            <p className="text-slate-500 mb-1 text-center">المبلغ المستحق للدفع</p>
            <p className="text-4xl font-black text-emerald-600 text-center">{currentTotals.total.toFixed(2)} <span className="text-sm text-slate-400">SAR</span></p>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4">
            <button 
              onClick={() => setPaymentMethod('CASH')}
              className="flex flex-col items-center justify-center gap-2 p-4 border-2 border-slate-200 rounded-xl hover:border-emerald-500 hover:bg-emerald-50 transition-all group"
            >
              <div className="text-emerald-600 group-hover:scale-110 transition-transform text-2xl">💵</div>
              <span className="font-bold text-slate-700">نقدًا (Cash)</span>
            </button>
            <button 
              onClick={() => setPaymentMethod('CARD')}
              className="flex flex-col items-center justify-center gap-2 p-4 border-2 border-slate-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all group"
            >
              <div className="text-blue-600 group-hover:scale-110 transition-transform text-2xl">💳</div>
              <span className="font-bold text-slate-700">بطاقة (Card)</span>
            </button>
          </div>
          <button 
            onClick={handleConfirm}
            className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 mt-4"
          >
            تأكيد الدفع
          </button>
        </div>
      </div>
    </div>
  );
};

// --- المكون الرئيسي ---


const PosScreen = () => {
  const { restaurantTables, openTableSession, reserveTable, cancelReservation, transferTableSession, mergeTableSessions, products: allProducts, menuCategories, can, addRestaurantTable, updateRestaurantTable, deleteRestaurantTable, createRestaurantOrder, getOpenTableOrder, completeRestaurantOrder, settings } = useAccounting();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('dine-in');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeOrder, setActiveOrder] = useState<ActiveOrder | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [reservationTarget, setReservationTarget] = useState<RestaurantTable | null>(null);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingTable, setEditingTable] = useState<RestaurantTable | null>(null);
  const [orderToPrint, setOrderToPrint] = useState<ActiveOrder | null>(null);
  const [isProformaPrint, setIsProformaPrint] = useState(false);
  const [kitchenOrderToPrint, setKitchenOrderToPrint] = useState<{ tableName: string; items: any[] } | null>(null);
  const [modifierTarget, setModifierTarget] = useState<Product | null>(null);

  // --- Print Logic ---
  const printRef = useRef<HTMLDivElement>(null);
  const printOptions = {
    content: () => printRef.current,
    documentTitle: 'فاتورة', 
  };
  const handlePrint = useReactToPrint(printOptions);

  const kitchenPrintRef = useRef<HTMLDivElement>(null);
  const kitchenPrintOptions = {
    content: () => kitchenPrintRef.current,
    documentTitle: 'طلب مطبخ',
  };
  const handleKitchenPrint = useReactToPrint(kitchenPrintOptions);

  useEffect(() => {
    if (menuCategories && menuCategories.length > 0 && !activeCategory) {
      setActiveCategory(menuCategories[0].id);
    }
  }, [menuCategories, activeCategory]);

  // Effect to trigger print when orderToPrint is set
  useEffect(() => {
    if (orderToPrint) {
      handlePrint();
      // إعادة تعيين وضع التجريبية بعد الطباعة
      setTimeout(() => setIsProformaPrint(false), 500);
    }
  }, [orderToPrint]);

  // تأثير لتشغيل طباعة المطبخ عند تجهيز البيانات
  useEffect(() => {
    if (kitchenOrderToPrint) {
      handleKitchenPrint();
    }
  }, [kitchenOrderToPrint]);

  const clearOrder = () => {
    setActiveOrder(null);
  };

  const products = useMemo(() => {
    if (!allProducts) return [];
    return allProducts.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
  }, [searchTerm, allProducts]);

  const menuItems = useMemo(() => {
    return products.filter(p => p.item_type === 'MANUFACTURED' && (p.category_id === activeCategory));
  }, [products, activeCategory]);

  const handleTableClick = async (table: RestaurantTable) => {
    if (table.status === 'AVAILABLE') {
      const newSessionId = await openTableSession(table.id);
      if (newSessionId) {
        setActiveOrder({ tableId: table.id, sessionId: newSessionId, tableName: table.name, items: [] });
      }
    } else if (table.status === 'RESERVED') {
      const info = (table as any).reservation_info;
      if (window.confirm(`الطاولة محجوزة لـ ${info?.customerName || 'عميل'} الساعة ${info?.arrivalTime || '--:--'}. هل تريد بدء الجلسة الآن؟`)) {
        const newSessionId = await openTableSession(table.id);
        if (newSessionId) {
          setActiveOrder({ tableId: table.id, sessionId: newSessionId, tableName: table.name, items: [] });
        }
      } else if (window.confirm('هل تريد إلغاء هذا الحجز وتفريغ الطاولة؟')) {
        await cancelReservation(table.id);
      }
    } else {
      // في تطبيق حقيقي، هنا يتم جلب الطلب المفتوح لهذه الطاولة
      const orderData = await getOpenTableOrder(table.id);
      if (orderData) {
          setActiveOrder({
              tableId: table.id,
              sessionId: orderData.sessionId,
              orderId: orderData.orderId,
              tableName: table.name,
              items: orderData.items
          });
      } else {
          showToast('لا يوجد طلب نشط لهذه الطاولة، أو حدث خطأ في الجلب.', 'error');
      }
    }
  };

  const addItemToOrder = (product: Product) => {
    if (!activeOrder) {
      showToast('الرجاء تحديد طاولة أولاً', 'warning');
      return;
    }
    // فتح مودال الخيارات
    setModifierTarget(product);
  };

  const handleConfirmModifiers = (modifiers: SelectedModifier[], notes: string) => {
    if (!modifierTarget || !activeOrder) return;
    
    const basePrice = modifierTarget.sales_price || modifierTarget.price || 0;
    const baseCost = (modifierTarget as any).cost || 0; // تكلفة الصنف الأساسي من البيانات

    const modifiersTotal = modifiers.reduce((sum, m) => sum + m.price, 0);
    const modifiersCostTotal = modifiers.reduce((sum, m) => sum + m.cost, 0);

    const unitPrice = basePrice + modifiersTotal;
    const unitCost = baseCost + modifiersCostTotal;

    setActiveOrder(prevOrder => {
        if (!prevOrder) return null;
        const newItems = [...prevOrder.items, {
            productId: modifierTarget.id,
            name: modifierTarget.name,
            quantity: 1,
            price: basePrice,
            unitPrice: unitPrice,
            unitCost: unitCost,
            notes: notes,
            selectedModifiers: modifiers,
            savedQuantity: 0
        }];
        return { ...prevOrder, items: newItems };
    });
    setModifierTarget(null);
  };

  const updateOrderItem = (productId: string, change: number) => {
    setActiveOrder(prevOrder => {
      if (!prevOrder) return null;
      const newItems = prevOrder.items.map(item => {
        if (item.productId === productId) {
          // لا نسمح بتقليل الكمية عن الكمية المحفوظة مسبقاً (التي تم طلبها بالفعل)
          const minQty = item.savedQuantity || 0;
          const newQty = Math.max(minQty, item.quantity + change);
          return { ...item, quantity: newQty };
        }
        return item;
      }).filter(item => item.quantity > 0);
      return { ...prevOrder, items: newItems };
    });
  };

    const handleAcceptOrder = async () => {
        if (!activeOrder) return;
        
        // نرسل فقط العناصر التي زادت كميتها عن المحفوظ (الجديدة)
        const itemsToSend = activeOrder.items
            .filter(item => item.quantity > (item.savedQuantity || 0))
            .map(item => ({
                productId: item.productId,
                quantity: item.quantity - (item.savedQuantity || 0), // نرسل الفرق فقط
                unitPrice: item.unitPrice,
                unitCost: item.unitCost,
                notes: item.notes,
                modifiers: item.selectedModifiers // إرسال مصفوفة الإضافات كـ JSON
            }));

        if (itemsToSend.length === 0) {
            showToast('لا يمكن إرسال طلب فارغ', 'warning');
            return;
        }

        // تجهيز بيانات المطبخ (الأصناف الجديدة فقط)
        const kitchenItems = activeOrder.items
            .filter(item => item.quantity > (item.savedQuantity || 0))
            .map(item => ({
                name: item.name,
                quantity: item.quantity - (item.savedQuantity || 0),
                notes: item.notes,
                selectedModifiers: item.selectedModifiers
            }));

        setIsSubmitting(true);
        try {
            const newOrderId = await createRestaurantOrder({
                sessionId: activeOrder.sessionId,
                items: itemsToSend
            });

            if (newOrderId) {
                // تفعيل الطباعة التلقائية للمطبخ بالأصناف الجديدة فقط
                setKitchenOrderToPrint({
                    tableName: activeOrder.tableName,
                    items: kitchenItems
                });

                // مسح الطلب النشط للعودة لشاشة الطاولات بعد التأكد من نجاح الإرسال
                setActiveOrder(null);
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePrintProforma = () => {
      if (!activeOrder || activeOrder.items.length === 0) return;
      setIsProformaPrint(true);
      setOrderToPrint(activeOrder);
    };

    const handleTransferConfirm = async (targetTableId: string) => {
      if (!activeOrder?.sessionId) return;
      
      const success = await transferTableSession(activeOrder.sessionId, targetTableId);
      if (success) {
        // بعد التحويل، نغلق المودال ونمسح الطلب الحالي لنعود لشاشة الطاولات
        // أو يمكننا فتح الطاولة الجديدة تلقائياً. هنا سنعود للشاشة الرئيسية.
        setActiveOrder(null);
        setIsTransferModalOpen(false);
      }
    };

    const handleMergeConfirm = async (targetTableId: string) => {
      if (!activeOrder?.sessionId) return;
      
      // نحن بحاجة لمعرفة معرف الجلسة للطاولة المستهدفة
      try {
          const targetOrder = await getOpenTableOrder(targetTableId);
          if (!targetOrder || !targetOrder.sessionId) {
              showToast('فشل العثور على جلسة نشطة للطاولة المستهدفة', 'error');
              return;
          }

          const success = await mergeTableSessions(activeOrder.sessionId, targetOrder.sessionId);
          if (success) {
            setActiveOrder(null);
            setIsMergeModalOpen(false);
          }
      } catch (e) { console.error(e); }
    };

    const handlePaymentClick = () => {
      if (!activeOrder?.orderId) return;
      setIsPaymentModalOpen(true);
    };

    const handleConfirmPayment = async (paidItems: OrderItem[], method: 'CASH' | 'CARD') => {
      if (!activeOrder || !activeOrder.orderId) return;
      
      const isSplitPayment = paidItems.length > 0;
      const itemsToProcess = isSplitPayment ? paidItems : activeOrder.items;

      // حساب الإجمالي بناءً على الأصناف التي سيتم دفعها
      const subtotal = itemsToProcess.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
      const tax = subtotal * ((settings.vatRate || 15) / 100);
      const total = subtotal + tax;

      // Save the order details for printing before clearing the state
      setIsProformaPrint(false); // طباعة نهائية
      // طباعة فاتورة بالأصناف المدفوعة فقط إذا كان الدفع مجزأ
      setOrderToPrint({
        ...activeOrder,
        items: itemsToProcess
      });

      // تمرير الأصناف المدفوعة للدالة
      await completeRestaurantOrder(activeOrder.orderId, method, total, paidItems);
      setIsPaymentModalOpen(false);
      setActiveOrder(null); // مسح الطلب النشط بعد الدفع
    };

    const handleConfirmReservation = async (name: string, time: string) => {
      if (!reservationTarget) return;
      const success = await reserveTable(reservationTarget.id, name, time);
      if (success) {
        setReservationTarget(null);
      }
    };

    const handleAddTable = () => {
        setIsAddModalOpen(true);
    };

    const handleSaveNewTable = async (data: { name: string, capacity: number, section: string }) => {
      await addRestaurantTable(data);
      setIsAddModalOpen(false); // Close modal on success
    };

    const handleEditTable = (table: RestaurantTable) => {
      setEditingTable(table);
    };

    const handleSaveUpdatedTable = async (id: string, data: any) => {
      await updateRestaurantTable(id, data);
      setEditingTable(null);
    };

    const handleDeleteTable = async (table: RestaurantTable) => {
      if (window.confirm(`هل أنت متأكد من حذف الطاولة ${table.name}؟`)) {
        await deleteRestaurantTable(table.id);
      }
    };

    const sections = useMemo(() => {
      const s = new Set(restaurantTables.map(t => t.section || 'عام'));
      return Array.from(s);
    }, [restaurantTables]);

  return (
    <div className="flex flex-col h-full bg-slate-100" dir="rtl">
      <header className="bg-white rounded-lg shadow-sm p-3 flex justify-between items-center">
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Utensils className="text-blue-600" /> نقطة بيع المطاعم</h1>
        <div className="flex bg-slate-100 p-1 rounded-lg">
          <button onClick={() => setActiveTab('dine-in')} className={`px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-2 ${activeTab === 'dine-in' ? 'bg-white shadow text-blue-600' : 'text-slate-600'}`}><LayoutGrid size={16} /> طاولات</button>
          <button onClick={() => setActiveTab('takeaway')} className={`px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-2 ${activeTab === 'takeaway' ? 'bg-white shadow text-blue-600' : 'text-slate-600'}`}><Coffee size={16} /> سفري</button>
          <button onClick={() => setActiveTab('delivery')} className={`px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-2 ${activeTab === 'delivery' ? 'bg-white shadow text-blue-600' : 'text-slate-600'}`}><HardHat size={16} /> توصيل</button>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-12 gap-4 overflow-hidden">
        {/* Left Section: Tables / Order Details */}
        <section className="col-span-12 lg:col-span-4 h-full">
          <div className="p-4 bg-white rounded-lg shadow-sm h-full overflow-y-auto">
              <h3 className="text-lg font-bold mb-4 text-slate-700">الطاولات</h3>
            <button onClick={handleAddTable} className="bg-green-500 text-white px-4 py-2 rounded-lg font-bold hover:bg-green-700 transition-colors">+ إضافة طاولة</button>

            {sections.map((section: string) => (
              <div key={section as Key} className="mb-6">
                <h4 className="font-semibold text-slate-500 border-b pb-2 mb-3">{section}</h4>

                  <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {restaurantTables.filter(t => (t.section || 'عام') === section).map(table => (
                    <TableCard 
                      key={table.id} 
                      table={table} 
                      onClick={() => handleTableClick(table)} 
                      isActive={activeOrder?.tableId === table.id}
                      onDelete={() => handleDeleteTable(table)}
                      onEdit={() => handleEditTable(table)}
                      onReserve={() => setReservationTarget(table)}/>
                  ))}
                </div>
              </div>
            ))}
            {restaurantTables.length === 0 && <div className="text-center py-10 text-slate-500">لا توجد طاولات مُعرَّفة</div>}
          </div>
        </section>

        {/* Middle Section: Menu */}
        <section className="col-span-12 lg:col-span-5 h-full">
          <div className="p-4 bg-white rounded-lg shadow-sm h-full flex flex-col">
            <div className="flex space-x-2 rtl:space-x-reverse overflow-x-auto pb-3 mb-3">
              <div className="relative flex-shrink-0">
                <input type="text" placeholder="بحث عن صنف" className="bg-slate-50 border border-slate-200 rounded-full px-4 py-2 text-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                <div className="absolute inset-y-0 left-0 flex items-center pointer-events-none pl-3">
                  <Search className="text-slate-400 w-4 h-4" />
                </div>
              </div>
              {menuCategories?.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${activeCategory === cat.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                  {cat.name}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {menuItems.map(item => (
                  <MenuItemCard key={item.id} item={item} onClick={() => addItemToOrder(item)} />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Right Section: Order Summary */}
        <section className="col-span-12 lg:col-span-3 h-full">
          <OrderSummary 
            order={activeOrder} 
            onUpdateItem={updateOrderItem} 
            onClearOrder={clearOrder} 
            onAcceptOrder={handleAcceptOrder}
            onPayment={handlePaymentClick}
            onPrintProforma={handlePrintProforma}
            onTransfer={() => setIsTransferModalOpen(true)}
            onMerge={() => setIsMergeModalOpen(true)}
            isSubmitting={isSubmitting} />
        </section>
      </main>
      <ModifierModal 
        isOpen={!!modifierTarget}
        onClose={() => setModifierTarget(null)}
        product={modifierTarget}
        onConfirm={handleConfirmModifiers}
      />
      <ReservationModal 
        isOpen={!!reservationTarget}
        onClose={() => setReservationTarget(null)}
        table={reservationTarget}
        onConfirm={handleConfirmReservation}
      />
      <TransferTableModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        onConfirm={handleTransferConfirm}
        currentTableId={activeOrder?.tableId || ''}
        tables={restaurantTables}
      />
      <MergeTableModal
        isOpen={isMergeModalOpen}
        onClose={() => setIsMergeModalOpen(false)}
        onConfirm={handleMergeConfirm}
        currentTableId={activeOrder?.tableId || ''}
        tables={restaurantTables}
      />
      <AddTableModal 
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSave={handleSaveNewTable}
        sections={sections}
      />
      <EditTableModal 
        isOpen={!!editingTable}
        onClose={() => setEditingTable(null)}
        onSave={handleSaveUpdatedTable}
        table={editingTable}
        sections={sections}
      />
      <PaymentModal 
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        onConfirmPayment={handleConfirmPayment}
        activeOrder={activeOrder}
        settings={settings}
      />
      {/* Hidden component for printing */}
      <div style={{ display: 'none' }}>
        <PrintableInvoice ref={printRef} order={orderToPrint} settings={settings} isProforma={isProformaPrint} />
        <KitchenTicket ref={kitchenPrintRef} tableName={kitchenOrderToPrint?.tableName || ''} items={kitchenOrderToPrint?.items || []} />
      </div>
    </div>
  );
};

export default PosScreen;