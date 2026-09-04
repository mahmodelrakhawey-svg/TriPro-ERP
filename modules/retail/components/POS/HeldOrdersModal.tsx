import React from 'react';
import { Pause, Clock, Play, Trash2 } from 'lucide-react';
import type { PosCartItem } from '../../hooks/usePosCart';

export interface HeldOrder {
  id: string;
  heldAt: string;
  customer: any;
  cart: PosCartItem[];
  subtotal: number;
  tax: number;
  total: number;
  notes?: string;
}

interface HeldOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  heldOrders: HeldOrder[];
  onResumeOrder: (held: HeldOrder) => void;
  onDeleteHeld: (id: string) => void;
  currencySymbol: string;
}

export default function HeldOrdersModal({
  isOpen,
  onClose,
  heldOrders,
  onResumeOrder,
  onDeleteHeld,
  currencySymbol
}: HeldOrdersModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
          <h3 className="font-black text-lg text-white flex items-center gap-2">
            <Pause size={20} className="text-amber-400" /> الفواتير المعلقة في الوردية ({heldOrders.length})
          </h3>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white text-sm px-3 py-1 rounded-lg bg-slate-800"
          >
            إغلاق
          </button>
        </div>

        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-3">
          {heldOrders.length === 0 ? (
            <div className="text-center py-12 text-slate-500 space-y-2">
              <Clock size={40} className="mx-auto text-slate-600" />
              <p className="font-bold">لا توجد فواتير معلقة حالياً</p>
              <p className="text-xs">يمكنك تعليق أي فاتورة جارية بالضغط على F6 لخدمة العميل التالي فوراً.</p>
            </div>
          ) : (
            heldOrders.map((held) => (
              <div key={held.id} className="bg-slate-950 border border-slate-800 hover:border-indigo-500/50 p-4 rounded-xl flex justify-between items-center transition-all">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-amber-400 bg-amber-950/50 px-2 py-0.5 rounded text-xs border border-amber-900/50">
                      {held.id}
                    </span>
                    <span className="text-xs text-slate-400 flex items-center gap-1 font-mono">
                      <Clock size={12} /> {held.heldAt}
                    </span>
                    {held.customer && (
                      <span className="text-xs bg-indigo-950 text-indigo-300 px-2 py-0.5 rounded-full font-bold">
                        👤 {held.customer.name}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400">
                    {held.cart.length} أصناف: {held.cart.map(c => c.product.name).slice(0, 3).join('، ')} {held.cart.length > 3 ? '...' : ''}
                  </div>
                  <div className="text-sm font-black font-mono text-white">
                    الإجمالي: <span className="text-emerald-400">{held.total.toFixed(2)} {currencySymbol}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => onResumeOrder(held)}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-lg shadow-indigo-600/20 transition-all"
                  >
                    <Play size={14} /> استرجاع للسلة
                  </button>
                  <button 
                    onClick={() => onDeleteHeld(held.id)}
                    className="bg-slate-900 hover:bg-red-950/80 text-slate-500 hover:text-red-400 p-2 rounded-xl border border-slate-800 transition-all"
                    title="حذف الفاتورة"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
