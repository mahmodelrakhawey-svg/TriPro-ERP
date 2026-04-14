import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type { Key } from 'react';
import { useToast } from '../context/ToastContext';
import { supabase } from '../supabaseClient';
import { useAccounting, SYSTEM_ACCOUNTS } from '../context/AccountingContext';
import type { RestaurantTable, Product, OrderItem, SelectedModifier } from '../types';
import { Coffee, HardHat, LayoutGrid, Utensils, Plus, Trash2, Minus, Edit, Search, X, Printer, ArrowRightLeft, GitMerge, CalendarCheck, Lock, Wallet, User, CreditCard, Percent, Star, QrCode, Clock, Users } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import { PrintableInvoice } from './PrintableInvoice';
import { KitchenTicket } from './KitchenTicket';
import { offlineService } from '../services/offlineService';
import { OrderSummary, ActiveOrder } from './OrderSummary';
import { ModifierSelectionModal } from './ModifierSelectionModal';
import { QRCodeModal } from './QRCodeModal';
import { BulkQRCodeModal } from './BulkQRCodeModal';
import { secureStorage } from '../utils/securityMiddleware';


const DELIVERY_FEE = 15; // قيمة افتراضية لرسوم التوصيل

// Helper function to map category names to icons
const getCategoryIcon = (name: string) => {
  if (name.includes('مشروب') || name.includes('عصير')) return <Coffee size={16} />;
  if (name.includes('مشويات') || name.includes('لحم')) return <Utensils size={16} />;
  if (name.includes('حلى') || name.includes('حلويات')) return <span className="text-lg">🍰</span>;
  if (name.includes('سلطة') || name.includes('مقبلات')) return <span className="text-lg">🥗</span>;
  return null;
};

// --- المكونات الفرعية ---

// مكون جديد للتحديث التلقائي للوقت
const LiveElapsedTime = ({ startTime }: { startTime: string }) => {
  const calculateTime = () => {
    const start = new Date(startTime);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 60) return `${diffMins} دقيقة`;
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return `${hours}:${mins.toString().padStart(2, '0')}`;
  };

  const [timeString, setTimeString] = useState(calculateTime());

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeString(calculateTime());
    }, 60000); // تحديث كل دقيقة
    return () => clearInterval(interval);
  }, [startTime]);

  return <span>{timeString}</span>;
};

const TableCard = ({ table, onClick, isActive, onDelete, onEdit, onReserve, onQrCode }: { table: RestaurantTable; onClick: () => void; isActive: boolean, onDelete: () => void, onEdit: () => void, onReserve: () => void, onQrCode: () => void }) => {
  const statusStyles: { [key: string]: string } = {
    AVAILABLE: 'bg-green-100 text-green-800 border-green-300 hover:bg-green-200',
    OCCUPIED: 'bg-red-100 text-red-800 border-red-300 hover:bg-red-200',
    RESERVED: 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200',
  };
  const statusText: { [key: string]: string } = { AVAILABLE: 'متاحة', OCCUPIED: 'مشغولة', RESERVED: 'محجوزة' };

  const startTime = (table as any).session_start || (table as any).active_session?.start_time;

  return (
    <div className={`rounded-xl border-2 cursor-pointer transition-all flex flex-col shadow-sm ${statusStyles[table.status]} ${isActive ? 'ring-4 ring-blue-400 scale-[1.02]' : ''}`}>
      <div onClick={onClick} className="p-3 flex-1 flex flex-col justify-between min-h-[100px]">
        <div className="flex justify-between items-start">
            <div className="font-black text-xl truncate w-2/3" title={table.name}>{table.name}</div>
            <div className="flex items-center gap-1 text-xs font-bold bg-black/10 px-2 py-1 rounded-full whitespace-nowrap" title="سعة الطاولة">
                <Users size={12} /> {table.capacity}
            </div>
        </div>
        
        <div className="mt-2">
            <div className="text-xs font-medium flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${table.status === 'AVAILABLE' ? 'bg-green-500' : table.status === 'OCCUPIED' ? 'bg-red-500' : 'bg-amber-500'}`}></span>
                {statusText[table.status]} 
            </div>
            
            {table.status === 'RESERVED' && (table as any).reservation_info && (
                <div className="mt-2 bg-white/50 p-2 rounded-lg text-xs border border-black/5">
                    <div className="font-bold flex items-center gap-1 truncate">
                        <User size={12} /> {(table as any).reservation_info.customerName}
                    </div>
                    {(table as any).reservation_info.arrivalTime && (
                        <div className="mt-1 flex items-center gap-1 opacity-75 font-mono">
                            <Clock size={12} /> {(table as any).reservation_info.arrivalTime}
                        </div>
                    )}
                </div>
            )}
            
            {table.status === 'OCCUPIED' && startTime && (
                <div className="mt-2 flex items-center gap-1 text-xs font-black bg-white/30 px-2 py-1.5 rounded-lg w-fit">
                    <Clock size={12} />
                    <LiveElapsedTime startTime={startTime} />
                </div>
            )}
        </div>
      </div>

      <div className="flex mt-auto justify-between border-t-2 border-dashed border-black/10 p-2 text-[10px] bg-white/20">
        <button onClick={onQrCode} className="hover:bg-white/50 p-1 rounded transition-colors flex items-center gap-1" title="رمز QR">
          <QrCode size={14} />
        </button>
        <button onClick={onEdit} className="hover:bg-white/50 p-1 rounded transition-colors flex items-center gap-1" title="تعديل">
            <Edit size={14} />
        </button>
        {table.status === 'AVAILABLE' && (
            <button onClick={onReserve} className="hover:bg-white/50 p-1 rounded transition-colors flex items-center gap-1" title="حجز">
                <CalendarCheck size={14} />
            </button>
        )}
        {table.status !== 'OCCUPIED' && (
            <button onClick={onDelete} className="hover:bg-red-200 text-red-700 p-1 rounded transition-colors flex items-center gap-1" title="حذف">
                <Trash2 size={14} />
            </button>
        )}
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
  <div onClick={onClick} className="bg-white border border-slate-200 rounded-lg p-2 text-center cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-all h-full flex flex-col justify-between shadow-sm group overflow-hidden">
    <div className="w-full aspect-[4/3] mb-2 bg-slate-50 rounded-md flex items-center justify-center overflow-hidden relative border border-slate-100">
      {(item as any).image_url ? (
        <img src={(item as any).image_url} alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
      ) : (
        <Utensils className="text-slate-300/50" size={32} />
      )}
    </div>
    <div className="font-semibold text-slate-800 text-sm line-clamp-2">{item.name}</div>
    <div className="text-sm font-bold text-blue-600 mt-1">{(item.sales_price || (item as any).price || 0).toFixed(2)} <span className="text-xs font-normal text-slate-500">SAR</span></div>
  </div>
);

// --- Customer Selection Modal ---
const CustomerModal = ({ isOpen, onClose, onSelect, customers }: { isOpen: boolean, onClose: () => void, onSelect: (customer: any) => void, customers: any[] }) => {
  const [search, setSearch] = useState('');
  if (!isOpen) return null;

  const filteredCustomers = customers.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search));

  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-lg text-slate-800">اختيار عميل</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          <input type="text" placeholder="بحث بالاسم أو رقم الهاتف..." value={search} onChange={e => setSearch(e.target.value)} className="w-full border rounded-lg p-2" />
          <div className="max-h-60 overflow-y-auto space-y-2">{filteredCustomers.map(c => <div key={c.id} onClick={() => onSelect(c)} className="p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-blue-50">{c.name} - {c.phone}</div>)}</div>
        </div>
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
      // عند فتح المودال، ننسخ الأصناف لتتبع التغييرات في وضع التقسيم، مع تصفير الكمية
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
        const originalItem = activeOrder?.items.find(i => i.productId === productId);
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
    setSelectedItems(activeOrder.items?.map(item => ({ ...item })) || []);
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
              {activeOrder.items?.map(originalItem => {
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

// --- Shift Management Modals ---

const StartShiftModal = ({ isOpen, onConfirm }: { isOpen: boolean, onConfirm: (amount: number) => void }) => {
  const [amount, setAmount] = useState(0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/90 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95">
        <div className="p-6 text-center space-y-4">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock size={32} className="text-blue-600" />
          </div>
          <h3 className="font-black text-2xl text-slate-800">بدء وردية جديدة</h3>
          <p className="text-slate-500 text-sm">الرجاء إدخال المبلغ الافتتاحي في الدرج (العهدة) للبدء.</p>
          
          <div className="pt-4">
            <label className="block text-sm font-bold text-slate-700 mb-2 text-right">رصيد البداية (العهدة)</label>
            <input 
              type="number" 
              value={amount} 
              onChange={e => setAmount(Number(e.target.value))} 
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-center text-xl font-bold focus:border-blue-500 outline-none" 
              min="0"
              autoFocus
            />
          </div>

          <button 
            onClick={() => onConfirm(amount)} 
            className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all mt-4"
          >
            فتح الوردية
          </button>
        </div>
      </div>
    </div>
  );
};

const CloseShiftModal = ({ isOpen, onClose, onConfirm, summary }: { isOpen: boolean, onClose: () => void, onConfirm: (amount: number, notes: string) => void, summary: any }) => {
  const [actualCash, setActualCash] = useState(0);
  const [notes, setNotes] = useState('');
  
  if (!isOpen || !summary) return null;

  const expectedCash = Number(summary.expected_cash || 0);
  const difference = actualCash - expectedCash;

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2"><Lock size={20} className="text-red-600"/> إغلاق الوردية (Z-Report)</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-slate-50 p-3 rounded-lg"><span className="block text-slate-500 text-xs">رصيد البداية</span><span className="font-bold text-lg">{Number(summary.opening_balance).toLocaleString()}</span></div>
            <div className="bg-slate-50 p-3 rounded-lg"><span className="block text-slate-500 text-xs">إجمالي المبيعات</span><span className="font-bold text-lg">{Number(summary.total_sales).toLocaleString()}</span></div>
            <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100"><span className="block text-emerald-700 text-xs">مبيعات نقدية</span><span className="font-bold text-lg text-emerald-800">{Number(summary.cash_sales).toLocaleString()}</span></div>
            <div className="bg-blue-50 p-3 rounded-lg border border-blue-100"><span className="block text-blue-700 text-xs">مبيعات شبكة</span><span className="font-bold text-lg text-blue-800">{Number(summary.card_sales).toLocaleString()}</span></div>
          </div>

          <div className="border-t pt-4">
            <div className="flex justify-between items-center mb-2">
              <span className="font-bold text-slate-700">المتوقع في الدرج:</span>
              <span className="font-mono font-bold text-xl">{expectedCash.toLocaleString()}</span>
            </div>
            
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">المبلغ الفعلي (العدّ)</label>
              <input 
                type="number" 
                value={actualCash} 
                onChange={e => setActualCash(Number(e.target.value))} 
                className="w-full border-2 border-slate-300 rounded-lg p-2 text-lg font-bold focus:border-blue-500 outline-none" 
              />
            </div>

            <div className={`mt-2 flex justify-between items-center p-2 rounded-lg ${difference === 0 ? 'bg-green-100 text-green-800' : difference > 0 ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'}`}>
              <span className="font-bold text-sm">الفارق (عجز/زيادة):</span>
              <span className="font-mono font-bold">{difference > 0 ? '+' : ''}{difference.toLocaleString()}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">ملاحظات الإغلاق</label>
            <textarea 
              value={notes} 
              onChange={e => setNotes(e.target.value)} 
              className="w-full border rounded-lg p-2 text-sm h-20 outline-none focus:ring-1 focus:ring-blue-500" 
              placeholder="أي ملاحظات حول العجز أو أحداث الوردية..." 
            />
          </div>

          <button 
            onClick={() => onConfirm(actualCash, notes)} 
            className="w-full bg-red-600 text-white font-bold py-3 rounded-lg hover:bg-red-700 shadow-lg shadow-red-100 transition-all"
          >
            تأكيد إغلاق الوردية وترحيل المبيعات
          </button>
        </div>
      </div>
    </div>
  );
};

// --- المكون الرئيسي ---


const PosScreen = () => {
  const { accounts, restaurantTables, openTableSession, reserveTable, cancelReservation, transferTableSession, mergeTableSessions, products: allProducts, menuCategories, addRestaurantTable, updateRestaurantTable, deleteRestaurantTable, createRestaurantOrder, getOpenTableOrder, completeRestaurantOrder, processSplitPayment, settings, currentShift, startShift, closeCurrentShift, getCurrentShiftSummary, isDemo, currentUser, refreshData } = useAccounting();
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
  const [openExternalOrders, setOpenExternalOrders] = useState<any[]>([]);
  const [isProformaPrint, setIsProformaPrint] = useState(false);
  const [kitchenOrderToPrint, setKitchenOrderToPrint] = useState<{ tableName: string; items: any[] } | null>(null);
  const [modifierTarget, setModifierTarget] = useState<Product | null>(null);
  const [isCloseShiftModalOpen, setIsCloseShiftModalOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [shiftSummary, setShiftSummary] = useState<any>(null);
  const [lastOrder, setLastOrder] = useState<ActiveOrder | null>(null);
  const [qrCodeTarget, setQrCodeTarget] = useState<{ table: RestaurantTable, key: string } | null>(null);
  const [isBulkQrModalOpen, setIsBulkQrModalOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // --- Print Logic ---
  const printRef = useRef<HTMLDivElement>(null);

  const handleAfterPrint = useCallback(() => {
    // Reset the print state after printing is done to prevent re-triggering
    setOrderToPrint(null);
    setIsProformaPrint(false);
  }, []);

  const handlePrint = useReactToPrint({
    content: () => printRef.current,
    contentRef: printRef, // Added to satisfy internal check in some versions
    documentTitle: 'فاتورة', 
    onAfterPrint: handleAfterPrint,
    suppressErrors: true, // Suppress "nothing to print" errors
  } as any);

  const kitchenPrintRef = useRef<HTMLDivElement>(null);
  const handleKitchenAfterPrint = useCallback(() => {
    setKitchenOrderToPrint(null);
  }, []);

  const handleKitchenPrint = useReactToPrint({
    content: () => kitchenPrintRef.current,
    contentRef: kitchenPrintRef, // Added to satisfy internal check in some versions
    documentTitle: 'طلب مطبخ',
    onAfterPrint: handleKitchenAfterPrint,
    suppressErrors: true, // Suppress "nothing to print" errors
  } as any);

  useEffect(() => {
    if (menuCategories && menuCategories.length > 0 && !activeCategory) {
      setActiveCategory(menuCategories[0].id);
    }
  }, [menuCategories, activeCategory]);

  // New useEffect to fetch external orders
  useEffect(() => {
    const fetchOpenExternalOrders = async () => {
        if (isDemo) {
            return;
        }
        try {
            const { data, error } = await supabase
                .from('orders')
                .select('id, order_number, order_type, customers(name)')
                .in('order_type', ['TAKEAWAY', 'DELIVERY'])
                .eq('status', 'CONFIRMED')
                .order('created_at', { ascending: true });
            
            if (error) throw error;
            setOpenExternalOrders(data || []);
        } catch (err) {
            console.error("Error fetching external orders:", err);
        }
    };

    fetchOpenExternalOrders();
    if (!isDemo) {
      const channel = supabase.channel('public:orders').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchOpenExternalOrders).subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [isDemo]);

  // الاشتراك في تحديثات الطاولات (لظهور الطلبات الجديدة من رمز QR فوراً كطاولة مشغولة)
  useEffect(() => {
    const channel = supabase.channel('pos-table-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, () => {
        refreshData();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [refreshData]);

  // Effect to trigger print when orderToPrint is set
  useEffect(() => {
    if (orderToPrint) {
      // We use a timeout to give React a moment to render the component
      // with the new `orderToPrint` data and attach the ref.
      const timeoutId = setTimeout(() => {
        if (printRef.current) {
          handlePrint();
        } else {
          // Silently fail or reset to prevent stuck state
          setOrderToPrint(null); // Reset state if printing fails
        }
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [orderToPrint, handlePrint]);

  // تأثير لتشغيل طباعة المطبخ عند تجهيز البيانات
  useEffect(() => {
    if (kitchenOrderToPrint) {
      const timeoutId = setTimeout(() => {
        if (kitchenPrintRef.current) {
          handleKitchenPrint();
        } else {
          // Silently fail or reset to prevent stuck state
          setKitchenOrderToPrint(null); // Reset if it fails
        }
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [kitchenOrderToPrint, handleKitchenPrint]);

  // --- Customer Display Sync ---
  useEffect(() => {
    try {
      if (activeOrder) {
        secureStorage.setItem('tripro-customer-display-order', activeOrder);
      } else {
        secureStorage.removeItem('tripro-customer-display-order');
      }
    } catch (e) {
      console.error("Could not write to localStorage for customer display", e);
    }
  }, [activeOrder]);

  const handlePaymentClick = useCallback(() => {
    if (!activeOrder?.orderId) return;
    setIsPaymentModalOpen(true);
  }, [activeOrder]);

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F4') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'F9') {
        e.preventDefault();
        const hasNewItems = (activeOrder?.items || []).some(item => item.quantity > (item.savedQuantity || 0));
        if (activeOrder?.orderId && !hasNewItems && !isSubmitting) {
          handlePaymentClick();
        } else {
          showToast('لا يمكن الدفع الآن. تأكد من إرسال جميع الأصناف الجديدة أولاً.', 'warning');
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeOrder, isSubmitting, showToast, handlePaymentClick]);

  // Helper function to get order details by ID, for takeaway/delivery
  const getOrderById = async (orderId: string) => {
    try {
        const { data: order, error } = await supabase
            .from('orders')
            .select('id, order_items(id, product_id, quantity, unit_price, notes, modifiers, products(name))')
            .eq('id', orderId)
            .single();

        if (error) throw error;
        if (!order) return null;

        const items: any[] = (order.order_items || []).map((item: any) => ({
            id: item.id,
            productId: item.product_id,
            name: item.products?.name,
            quantity: item.quantity,
            unitPrice: item.unit_price,
            notes: item.notes,
            selectedModifiers: item.modifiers,
            savedQuantity: item.quantity
        }));

        return { orderId: order.id, items };
    } catch (error) {
        console.error("Error fetching order by ID:", error);
        return null;
    }
  };

  const clearOrder = () => {
    setActiveOrder(null);
  };

  const products = useMemo(() => {
    if (!allProducts) return [];
    return allProducts.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
  }, [searchTerm, allProducts]);

  const menuItems = useMemo(() => {
    return products.filter(p => p.product_type === 'MANUFACTURED' && (p.category_id === activeCategory));
  }, [products, activeCategory, searchTerm]);

  const handleTableClick = async (table: RestaurantTable) => {
    if (table.status === 'AVAILABLE') {
      if (window.confirm(`هل تريد فتح جلسة جديدة على طاولة ${table.name}؟`)) {
        const newSessionId = await openTableSession(table.id);
        if (newSessionId) {
          setActiveOrder({
            tableId: table.id,
            sessionId: newSessionId,
            tableName: table.name,
            items: [],
            type: 'dine-in'
          });
        }
      }
    } else if (table.status === 'RESERVED') {
      const info = (table as any).reservation_info;
      if (window.confirm(`الطاولة محجوزة لـ ${info?.customerName || 'عميل'} الساعة ${info?.arrivalTime || '--:--'}. هل تريد بدء الجلسة الآن؟`)) {
        const newSessionId = await openTableSession(table.id);
        if (newSessionId) {
          setActiveOrder({ tableId: table.id, sessionId: newSessionId, tableName: table.name, items: [], type: 'dine-in' });
        }
      } else if (window.confirm('هل تريد إلغاء هذا الحجز وتفريغ الطاولة؟')) {
        await cancelReservation(table.id);
      }
    } else {
      // في تطبيق حقيقي، هنا يتم جلب الطلب المفتوح لهذه الطاولة
      const orderData = await getOpenTableOrder(table.id); // This function now correctly fetches all items
      if (orderData) {
          setActiveOrder({
              tableId: table.id,
              sessionId: orderData.sessionId,
              orderId: orderData.orderId,
              tableName: table.name,
              items: orderData.items,
              type: 'dine-in'
          });
      } else {
          showToast('لا يوجد طلب نشط لهذه الطاولة، أو حدث خطأ في الجلب.', 'error');
      }
    }
  };

  const handleGenerateQrCode = async (table: RestaurantTable) => {
    try {
      const { data, error } = await supabase.rpc('get_or_create_qr_for_table', {
        p_table_id: table.id
      });

      if (error) throw error;

      // 🛡️ إصلاح: استخراج المفتاح النصي فقط من الكائن المرجع
      if (data && data.qr_access_key) {
        setQrCodeTarget({ table, key: data.qr_access_key });
      } else {
        throw new Error('فشل استلام رمز الوصول من الخادم');
      }
    } catch (err: any) {
      showToast('فشل إنشاء رمز QR: ' + err.message, 'error');
    }
  };

  const handleExternalOrderClick = async (orderId: string) => {
    try {
        const { data: order, error } = await supabase
            .from('orders')
            .select('*, order_items(*, products(name, sales_price)), customers(id, name, phone, address)')
            .eq('id', orderId)
            .single();

        if (error) throw error;
        if (!order) {
            showToast('لم يتم العثور على الطلب.', 'error');
            return;
        }

        const items: OrderItem[] = (order.order_items || []).map((item: any) => ({
            id: item.id,
            productId: item.product_id,
            name: item.products?.name,
            quantity: item.quantity,
            price: item.products?.sales_price || 0,
            unitPrice: item.unit_price || item.price || 0, // ✅ الاعتماد على unit_price أولاً
            notes: item.notes,
            selectedModifiers: item.modifiers,
            savedQuantity: item.quantity
        }));

        setActiveOrder({
            tableId: order.order_type === 'TAKEAWAY' ? `takeaway-${order.id}` : `delivery-${order.id}`,
            sessionId: order.session_id,
            orderId: order.id,
            tableName: order.order_type === 'TAKEAWAY' ? 'سفري' : 'توصيل',
            items: items,
            type: order.order_type.toLowerCase() as 'takeaway' | 'delivery',
            customer: order.customers ? { id: order.customers.id, name: order.customers.name, phone: order.customers.phone, address: order.customers.address } : undefined,
            deliveryFee: order.order_type === 'DELIVERY' ? (order.delivery_fee || DELIVERY_FEE) : undefined,
        });
    } catch (err: any) {
        showToast('فشل تحميل الطلب: ' + err.message, 'error');
    }
  };

  const handleNewTakeaway = () => {
    const sessionId = `takeaway-${Date.now()}`;
    setActiveOrder({
      tableId: sessionId,
      sessionId: sessionId,
      tableName: 'سفري',
      items: [],
      type: 'takeaway'
    });
  };

  const handleNewDelivery = () => {
    const sessionId = `delivery-${Date.now()}`;
    setActiveOrder({
      tableId: sessionId,
      sessionId: sessionId,
      tableName: 'توصيل',
      items: [],
      type: 'delivery',
      deliveryFee: DELIVERY_FEE
    });
  };
  const addItemToOrder = (product: Product) => {
    if (!activeOrder) {
      showToast('الرجاء تحديد طاولة أولاً', 'warning');
      return;
    }
    // فتح مودال الخيارات
    setModifierTarget(product);
  };

  const handleConfirmModifiers = (modifiers: SelectedModifier[], totalPrice: number, totalUnitCost: number, notes: string) => {
    if (!modifierTarget || !activeOrder) return;
    
    const basePrice = modifierTarget.sales_price || modifierTarget.price || 0;
    // تم استلام الإجماليات جاهزة من المودال (totalPrice و totalUnitCost)
    // لا حاجة لإعادة الحساب هنا
    
    setActiveOrder(prevOrder => {
        if (!prevOrder) return null;
        const newItems = [...prevOrder.items, {
            localId: `local-${Date.now()}-${Math.random()}`, // Unique ID for client-side operations
            productId: modifierTarget.id,
            name: modifierTarget.name,
            quantity: 1,
            price: Number(basePrice),
            unitPrice: totalPrice,
            unitCost: totalUnitCost,
            notes: notes,
            selectedModifiers: modifiers,
            savedQuantity: 0
        }];
        return { ...prevOrder, items: newItems };
    });
    setModifierTarget(null);
  };

  const updateOrderItem = (itemId: string, change: number) => {
    setActiveOrder(prevOrder => {
      if (!prevOrder) return null;
      const newItems = prevOrder.items.map((item: any) => {
        if (item.localId === itemId || item.id === itemId) {
          // لا نسمح بتقليل الكمية عن الكمية المحفوظة مسبقاً (التي تم طلبها بالفعل)
          const minQty = item.savedQuantity ?? 0;
          const newQty = Math.max(minQty, item.quantity + change);
          return { ...item, quantity: newQty };
        }
        return item;
      }).filter(item => item.quantity > 0);
      return { ...prevOrder, items: newItems };
    });
  };

  const handleAcceptOrder = async () => {
    if (!activeOrder || !activeOrder.items) {
      return;
    }

    const itemsToSend = activeOrder.items
      .filter(item => item.quantity > (item.savedQuantity || 0))
      .map(item => ({
        product_id: item.productId,
        productId: item.productId, // إرسال الصيغتين لضمان التوافق
        quantity: item.quantity - (item.savedQuantity || 0),
        unit_price: Number(item.unitPrice) || 0,
        unitPrice: Number(item.unitPrice) || 0,
        unit_cost: Number(item.unitCost) || 0,
        unitCost: Number(item.unitCost) || 0,
        notes: item.notes,
        modifiers: (item.selectedModifiers || []).map(m => ({
          modifier_id: m.modifierId,
          name: m.name,
          unit_price: Number(m.unit_price) || 0,
          price_at_order: Number(m.unit_price) || 0, // إضافة هذا الحقل قد يكون مطلوباً
          cost: Number(m.cost) || 0
        })),
      }));

    if (itemsToSend.length === 0) {
      showToast('لا يمكن إرسال طلب فارغ', 'warning');
      return;
    }

    const kitchenItems = activeOrder.items
      .filter(item => item.quantity > (item.savedQuantity || 0))
      .map(item => ({
        name: item.name,
        quantity: item.quantity - (item.savedQuantity || 0),
        notes: item.notes,
        selectedModifiers: item.selectedModifiers,
      }));

    setIsSubmitting(true);
    try {
       // --- OFFLINE MODE CHANGE ---
       const payload = {
         p_session_id: activeOrder.type === 'dine-in' ? activeOrder.sessionId : null,
         p_items: itemsToSend,
         p_order_type: activeOrder.type === 'dine-in' ? 'DINE_IN' : activeOrder.type.toUpperCase(),
         p_customer_id: activeOrder.customer?.id || null,
         p_user_id: currentUser?.id || null,
         p_notes: null,
       };
 
       // BYPASS OFFLINE QUEUE: Send directly to Supabase
       const { error } = await supabase.rpc('create_restaurant_order', payload);
       if (error) throw error;
       showToast('تم إرسال الطلب للمطبخ بنجاح ✅', 'success');
 
       // Optimistic UI Update
       setKitchenOrderToPrint({
         tableName: activeOrder.tableName,
         items: kitchenItems,
       });
 
       // Update the local state to reflect the "saved" quantity
       const newItems = activeOrder.items.map(item => ({
         ...item,
         savedQuantity: item.quantity,
       }));
 
       setActiveOrder(prev => {
         if (!prev) return null;
         // If it's a new order, we don't have an orderId yet, but that's okay.
         // The UI will just show the items as saved.
         return { ...prev, items: newItems };
       });
 
     } catch (error: any) {
       console.error(error);
       showToast('فشل إرسال الطلب: ' + (error.message || 'تحقق من الاتصال بالإنترنت'), 'error');
     } finally {
       setIsSubmitting(false);
     }
  };

    const handlePrintProforma = () => {
      if (!activeOrder || !activeOrder.items || activeOrder.items.length === 0) return;
      showToast('جاري تحضير الشيك للمعانية...', 'info');
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

    const handleConfirmPayment = async (paidItems: OrderItem[], method: 'CASH' | 'CARD') => {
      if (!activeOrder || !activeOrder.orderId) return;
      
      const isSplitPayment = paidItems.length > 0;
      const itemsToProcess = isSplitPayment ? paidItems : (activeOrder.items || []);

      // حساب الإجمالي بناءً على الأصناف التي سيتم دفعها
      const subtotal = itemsToProcess.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
      const tax = subtotal * ((settings.vatRate || 15) / 100);
      const total = subtotal + tax;

      // Save the order details for printing before clearing the state
      setIsProformaPrint(false); // طباعة نهائية
      // طباعة فاتورة بالأصناف المدفوعة فقط إذا كان الدفع مجزأ
      const orderToFinalize = {
        ...activeOrder,
        items: itemsToProcess
      };
      
      setOrderToPrint(orderToFinalize);
      setLastOrder(orderToFinalize);

      // تحديد حساب الخزينة
      const cashAccount = accounts.find(a => a.code === SYSTEM_ACCOUNTS.CASH);
      if (!cashAccount) {
          showToast('حساب الصندوق الرئيسي غير موجود!', 'error'); return;
      }
      
      if (isSplitPayment) {
          // دفع جزئي
          const splitItemsPayload = itemsToProcess.map(i => ({ id: (i as any).id, quantity: i.quantity }));
          const success = await processSplitPayment(activeOrder.orderId, splitItemsPayload, method, total, cashAccount.id);
          
          if (success) {
              showToast('تم الدفع الجزئي بنجاح', 'success');
              // إعادة تحميل الطلب الأصلي للتحقق مما إذا كان قد أغلق أو لا يزال مفتوحاً
              const updatedOrder = await getOpenTableOrder(activeOrder.tableId);
              if (updatedOrder) {
                  setActiveOrder({ ...activeOrder, items: updatedOrder.items });
              } else {
                  setActiveOrder(null); // الطلب أغلق بالكامل
              }
          }
      } else {
          await completeRestaurantOrder(activeOrder.orderId, method, total, cashAccount.id);
          setActiveOrder(null); // مسح الطلب النشط بعد الدفع الكامل
      }

      setIsPaymentModalOpen(false);
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

    const handleStartShift = async (amount: number) => {
      await startShift(amount);
    };

    const handleOpenCloseShiftModal = async () => {
      const summary = await getCurrentShiftSummary();
      if (summary) {
        setShiftSummary(summary);
        setIsCloseShiftModalOpen(true);
      }
    };

    const handleConfirmCloseShift = async (actualCash: number, notes: string) => {
      await closeCurrentShift(actualCash, notes);
      setIsCloseShiftModalOpen(false);
    };

  const handleRedeemPoints = () => {
    if (!activeOrder || !activeOrder.customer) return;
    const customer = useAccounting().customers.find(c => c.id === activeOrder.customer?.id);
    if (!customer || !(customer as any).loyalty_points || (customer as any).loyalty_points <= 0) {
      showToast('العميل ليس لديه نقاط.', 'info');
      return;
    }

    const pointsToRedeemStr = prompt(`لدى العميل ${(customer as any).loyalty_points} نقطة. كم نقطة تريد استخدامها؟ (كل 10 نقاط = 1 ريال)`);
    if (pointsToRedeemStr) {
      const points = parseInt(pointsToRedeemStr);
      if (isNaN(points) || points <= 0) {
        showToast('الرجاء إدخال عدد نقاط صحيح.', 'warning');
        return;
      }
      if (points > (customer as any).loyalty_points) {
        showToast('رصيد العميل من النقاط غير كافٍ.', 'warning');
        return;
      }
      const discountAmount = points / 10.0;
      setActiveOrder({ ...activeOrder, loyaltyDiscount: { points, amount: discountAmount } });
      showToast(`تم تطبيق خصم بقيمة ${discountAmount.toFixed(2)} ريال.`, 'success');
    }
  };

  const handleSelectCustomer = (customer: any) => {
    if (activeOrder) {
      setActiveOrder({ ...activeOrder, customer: { id: customer.id, name: customer.name, phone: customer.phone, address: customer.address } });
    }
    setIsCustomerModalOpen(false);
  };

  const handleAddDiscount = () => {
    if (!activeOrder) return;
    const discountValue = prompt('أدخل قيمة الخصم (نسبة % أو مبلغ ثابت):');
    if (discountValue) {
      const value = parseFloat(discountValue);
      const type = discountValue.includes('%') ? 'percentage' : 'fixed';
      const finalValue = type === 'percentage' ? parseFloat(discountValue.replace('%', '')) : value;
      setActiveOrder({ ...activeOrder, discount: { type, value: finalValue } });
    }
  };

  const handlePayLater = async () => {
    if (!activeOrder || !activeOrder.orderId) return;
    
    if (!activeOrder.customer) {
      showToast('يجب تحديد عميل مسجل لإتمام عملية الدفع الآجل', 'warning');
      return;
    }

    if (!window.confirm(`هل أنت متأكد من تسجيل الفاتورة كـ "دفع آجل" على حساب العميل: ${activeOrder.customer.name}؟`)) {
      return;
    }

    try {
      setIsSubmitting(true);

      const subtotal = activeOrder.items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
      const discountAmount = activeOrder.discount?.type === 'fixed' 
        ? activeOrder.discount.value 
        : subtotal * ((activeOrder.discount?.value || 0) / 100);
      const loyaltyAmount = activeOrder.loyaltyDiscount?.amount || 0;
      
      const subtotalAfterDiscount = subtotal - discountAmount - loyaltyAmount;
      const tax = subtotalAfterDiscount * ((settings.vatRate || 15) / 100);
      const total = subtotalAfterDiscount + tax + (activeOrder.deliveryFee || 0);

      setIsProformaPrint(false);
      setOrderToPrint(activeOrder);
      setLastOrder(activeOrder);

      // استخدام 'as any' لتجاوز فحص الأنواع الصارم للدفع الآجل
      await completeRestaurantOrder(activeOrder.orderId, 'CREDIT' as any, total, null);

      showToast('تم تسجيل الفاتورة كذمة على العميل بنجاح ✅', 'success');
      setActiveOrder(null);
    } catch (error: any) {
      console.error(error);
      showToast('حدث خطأ أثناء تسجيل الدفع الآجل: ' + error.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

    const handleReprintLast = () => {
      if (lastOrder) {
        setIsProformaPrint(false);
        setOrderToPrint({ ...lastOrder });
      }
    };

  return (
    <div className="flex flex-col h-full bg-slate-100" dir="rtl">
      <header className="bg-white rounded-lg shadow-sm p-3 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Utensils className="text-blue-600" /> نقطة بيع المطاعم</h1>
            {currentShift && (
              <div className="hidden md:flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold border border-emerald-100">
                <Wallet size={14} /> وردية مفتوحة
              </div>
            )}
          </div>
        <div className="flex bg-slate-100 p-1 rounded-lg">
          <button onClick={() => setActiveTab('dine-in')} className={`px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-2 ${activeTab === 'dine-in' ? 'bg-white shadow text-blue-600' : 'text-slate-600'}`}><LayoutGrid size={16} /> طاولات</button>
          <button onClick={() => setActiveTab('takeaway')} className={`px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-2 ${activeTab === 'takeaway' ? 'bg-white shadow text-blue-600' : 'text-slate-600'}`}><Coffee size={16} /> سفري</button>
          <button onClick={() => setActiveTab('delivery')} className={`px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-2 ${activeTab === 'delivery' ? 'bg-white shadow text-blue-600' : 'text-slate-600'}`}><HardHat size={16} /> توصيل</button>
          {lastOrder && (
            <button onClick={handleReprintLast} className="px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-2 text-indigo-600 hover:bg-indigo-50 hover:shadow-sm mr-2 border border-transparent hover:border-indigo-100 transition-all">
              <Printer size={16} /> <span className="hidden md:inline">إعادة طباعة</span>
            </button>
          )}
          {currentShift && (
            <button onClick={handleOpenCloseShiftModal} className="px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-2 text-red-600 hover:bg-red-50 hover:shadow-sm mr-2 border border-transparent hover:border-red-100 transition-all">
              <Lock size={16} /> إغلاق الوردية
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 grid grid-cols-12 gap-4 overflow-hidden">
        {/* Left Section: Tables */}
        <section className="col-span-12 lg:col-span-4 h-full">
          <div className="p-4 bg-white rounded-lg shadow-sm h-full overflow-y-auto">
              <h3 className="text-lg font-bold mb-4 text-slate-700">الطاولات والطلبات</h3>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button onClick={handleNewTakeaway} className="bg-amber-50 text-amber-700 border-2 border-dashed border-amber-200 px-4 py-3 rounded-lg font-bold hover:bg-amber-100 hover:border-amber-300 transition-colors flex items-center justify-center gap-2">
                <Coffee size={18}/> طلب سفري جديد
              </button>
              <button onClick={handleNewDelivery} className="bg-sky-50 text-sky-700 border-2 border-dashed border-sky-200 px-4 py-3 rounded-lg font-bold hover:bg-sky-100 hover:border-sky-300 transition-colors flex items-center justify-center gap-2">
                <HardHat size={18}/> طلب توصيل جديد
              </button>
              <button onClick={handleAddTable} className="bg-green-50 text-green-700 border-2 border-dashed border-green-200 px-4 py-3 rounded-lg font-bold hover:bg-green-100 hover:border-green-300 transition-colors flex items-center justify-center gap-2">
                  <Plus size={18}/> إضافة طاولة
              </button>
              <button onClick={() => setIsBulkQrModalOpen(true)} className="bg-indigo-50 text-indigo-700 border-2 border-dashed border-indigo-200 px-4 py-3 rounded-lg font-bold hover:bg-indigo-100 hover:border-indigo-300 transition-colors flex items-center justify-center gap-2">
                  <QrCode size={18}/> طباعة كل الـ QR
              </button>
            </div>

            {openExternalOrders.length > 0 && (
                <div className="mt-6">
                    <h4 className="font-semibold text-slate-500 border-b pb-2 mb-3">طلبات خارجية مفتوحة</h4>
                    <div className="space-y-2">
                        {openExternalOrders.map(order => (
                            <div key={order.id} onClick={() => handleExternalOrderClick(order.id)} className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${activeOrder?.orderId === order.id ? 'ring-4 ring-blue-400' : ''} ${order.order_type === 'TAKEAWAY' ? 'bg-amber-50 border-amber-200 hover:bg-amber-100' : 'bg-sky-50 border-sky-200 hover:bg-sky-100'}`}>
                                <div className="flex justify-between items-center"><span className="font-bold text-slate-800">{(order.order_type === 'TAKEAWAY' ? 'سفري' : 'توصيل')} - {order.order_number}</span>{order.order_type === 'TAKEAWAY' ? <Coffee size={16} className="text-amber-700" /> : <HardHat size={16} className="text-sky-700" />}</div>
                                {order.customers && <p className="text-xs text-slate-500 mt-1">{order.customers.name}</p>}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {sections.map((section: string) => (
              <div key={section as Key} className="mb-6 mt-6">
                <h4 className="font-semibold text-slate-500 border-b pb-2 mb-3">{section}</h4>

                  <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-4">
                  {restaurantTables.filter(t => (t.section || 'عام') === section).map(table => (
                    <TableCard 
                      key={table.id} 
                      table={table} 
                      onClick={() => handleTableClick(table)} 
                      isActive={activeOrder?.tableId === table.id}
                      onDelete={() => handleDeleteTable(table)}
                      onEdit={() => handleEditTable(table)}
                      onReserve={() => setReservationTarget(table)}
                      onQrCode={() => handleGenerateQrCode(table)} />
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
            <div className="flex items-center space-x-2 rtl:space-x-reverse overflow-x-auto pb-3 mb-3">
              <div className="relative flex-shrink-0">
                <input ref={searchInputRef} type="text" placeholder="بحث عن صنف... (F4)" className="w-full bg-slate-50 border border-slate-200 rounded-lg pr-10 pl-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                 <div className="absolute inset-y-0 right-0 flex items-center pointer-events-none pr-3">
                  <Search className="text-slate-400 w-5 h-5" />
                </div> 
              </div>
              {menuCategories?.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors flex items-center gap-2 ${activeCategory === cat.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                  {(cat as any).image_url ? (
                    <img 
                        src={(cat as any).image_url} 
                        alt={cat.name} 
                        className="w-6 h-6 rounded-full object-cover border border-white/20"
                    />
                  ) : (
                    getCategoryIcon(cat.name)
                  )}
                  {cat.name}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
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
            isSubmitting={isSubmitting}
            onSelectCustomer={() => setIsCustomerModalOpen(true)}
            onAddDiscount={handleAddDiscount}
            onPayLater={handlePayLater}
            onRedeemPoints={handleRedeemPoints}
          />
        </section>

      </main>
      {modifierTarget && (
      <ModifierSelectionModal 
        isOpen={!!modifierTarget}
        onClose={() => setModifierTarget(null)}
        product={{ 
            id: modifierTarget.id, 
            name: modifierTarget.name, 
            price: modifierTarget.sales_price || modifierTarget.price || 0, // استخدام سعر البيع الأساسي
            cost: (modifierTarget as any).cost || 0 
        }}
        onConfirm={handleConfirmModifiers}
      />)}
      {qrCodeTarget && (
        <QRCodeModal
          isOpen={!!qrCodeTarget}
          onClose={() => setQrCodeTarget(null)}
          tableName={qrCodeTarget.table.name}
          qrKey={qrCodeTarget.key}
        />
      )}
      <BulkQRCodeModal
        isOpen={isBulkQrModalOpen}
        onClose={() => setIsBulkQrModalOpen(false)}
        tables={restaurantTables}
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
      
      <StartShiftModal 
        isOpen={!currentShift} 
        onConfirm={handleStartShift} 
      />
      <CloseShiftModal 
        isOpen={isCloseShiftModalOpen} 
        onClose={() => setIsCloseShiftModalOpen(false)} 
        onConfirm={handleConfirmCloseShift}
        summary={shiftSummary}
      />
      <CustomerModal
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        onSelect={handleSelectCustomer}
        customers={useAccounting().customers}
      />
      {/* Hidden component for printing */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
        <PrintableInvoice ref={printRef} order={orderToPrint} settings={settings} isProforma={isProformaPrint} />
        <KitchenTicket ref={kitchenPrintRef} tableName={kitchenOrderToPrint?.tableName || ''} items={kitchenOrderToPrint?.items || []} />
      </div>
    </div>
  );
};

export default PosScreen;