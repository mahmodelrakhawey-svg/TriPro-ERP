import React, { useState, useEffect } from 'react';
import type { RestaurantTable, Product } from '../../../../types';
import { happyHourService } from '../../../../services/happyHourService';
import { itemAvailabilityGuard } from '../../../../services/itemAvailabilityGuard';
import { 
  Coffee, 
  Utensils, 
  DollarSign, 
  Users, 
  User, 
  Clock, 
  QrCode, 
  Edit, 
  CalendarCheck, 
  Trash2, 
  X 
} from 'lucide-react';

const getCategoryIcon = (name: string) => {
  if (name.includes('مشروب') || name.includes('عصير')) return <Coffee size={16} />;
  if (name.includes('مشويات') || name.includes('لحم')) return <Utensils size={16} />;
  if (name.includes('حلى') || name.includes('حلويات')) return <span className="text-lg">🍰</span>;
  if (name.includes('سلطة') || name.includes('مقبلات')) return <span className="text-lg">🥗</span>;
  return null;
};


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
    <div className={`rounded-xl border-2 cursor-pointer transition-all flex flex-col shadow-sm relative ${statusStyles[table.status]} ${isActive ? 'ring-4 ring-blue-400 scale-[1.02]' : ''}`}>
      {table.status === 'OCCUPIED' && (table as any).bill_requested && (
          <div className="absolute -top-2 -right-2 bg-red-600 text-white p-1.5 rounded-full animate-bounce shadow-lg z-10 border-2 border-white" title="طلب الحساب!">
              <DollarSign size={16} strokeWidth={3} />
          </div>
      )}
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


const MenuItemCard = ({ item, onClick, currency }: { item: Product; onClick: () => void; currency?: string }) => {
  const basePrice = item.sales_price || (item as any).price || 0;
  const happyHourEval = happyHourService.evaluateProductPrice(item.id, basePrice, item.category_id);
  const is86 = (item as any).is_86 || itemAvailabilityGuard.getManual86List().includes(item.id);

  return (
    <div
      onClick={onClick}
      className={`bg-white border rounded-lg p-2 text-center cursor-pointer transition-all h-full flex flex-col justify-between shadow-sm group overflow-hidden relative ${
        is86 ? 'opacity-50 border-slate-300 bg-slate-100' : 'border-slate-200 hover:bg-blue-50 hover:border-blue-300'
      }`}
    >
      {/* Badges */}
      {is86 ? (
        <span className="absolute top-2 right-2 z-10 bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded shadow">
          نفد (86)
        </span>
      ) : happyHourEval.isHappyHour ? (
        <span className="absolute top-2 right-2 z-10 bg-pink-600 text-white text-[10px] font-black px-2 py-0.5 rounded shadow flex items-center gap-0.5">
          🔥 -{happyHourEval.discountPct}%
        </span>
      ) : null}

      <div className="w-full aspect-[4/3] mb-2 bg-slate-50 rounded-md flex items-center justify-center overflow-hidden relative border border-slate-100">
        {(item as any).image_url ? (
          <img src={(item as any).image_url} alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
        ) : (
          <Utensils className="text-slate-300/50" size={32} />
        )}
      </div>

      <div className="font-semibold text-slate-800 text-sm line-clamp-2">{item.name}</div>

      <div className="text-sm font-bold mt-1">
        {happyHourEval.isHappyHour ? (
          <div className="flex items-center justify-center gap-1.5">
            <span className="text-rose-600 font-extrabold">{happyHourEval.finalPrice.toFixed(2)}</span>
            <span className="text-[11px] text-slate-400 line-through">{basePrice.toFixed(2)}</span>
            <span className="text-xs font-normal text-slate-500">{currency || 'EGP'}</span>
          </div>
        ) : (
          <span className="text-blue-600">
            {basePrice.toFixed(2)} <span className="text-xs font-normal text-slate-500">{currency || 'EGP'}</span>
          </span>
        )}
      </div>
    </div>
  );
};

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

export {
  getCategoryIcon,
  LiveElapsedTime,
  TableCard,
  MenuItemCard,
  CustomerModal
};
