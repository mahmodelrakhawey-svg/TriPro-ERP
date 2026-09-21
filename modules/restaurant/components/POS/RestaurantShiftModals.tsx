import React, { useState } from 'react';
import { Lock, X, Loader2 } from 'lucide-react';

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


const CloseShiftModal = ({ isOpen, onClose, onConfirm, summary, isLoading }: { isOpen: boolean, onClose: () => void, onConfirm: (amount: number, notes: string) => void, summary: any, isLoading: boolean }) => {
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
            disabled={isLoading}
            onClick={() => onConfirm(actualCash, notes)} 
            className="w-full bg-red-600 text-white font-bold py-3 rounded-lg hover:bg-red-700 shadow-lg shadow-red-100 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? <Loader2 className="animate-spin" size={20} /> : <Lock size={20} />} تأكيد إغلاق الوردية وترحيل المبيعات
          </button>
        </div>
      </div>
    </div>
  );
};


export {
  StartShiftModal,
  CloseShiftModal
};
