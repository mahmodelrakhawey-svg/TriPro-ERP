import React, { useState, useEffect } from 'react';
import type { RestaurantTable } from '../../../../types';
import { 
  X, 
  CalendarCheck, 
  Plus, 
  Edit, 
  GitMerge, 
  ArrowRightLeft 
} from 'lucide-react';

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




export {
  ReservationModal,
  AddTableModal,
  EditTableModal,
  MergeTableModal,
  TransferTableModal
};
