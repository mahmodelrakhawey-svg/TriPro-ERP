import React from 'react';
import { Coins, Loader2 } from 'lucide-react';

export interface RetailPosShiftOpenViewProps {
  terminals: Record<string, any>[];
  selectedTerminal: Record<string, any> | null;
  setSelectedTerminal: (terminal: Record<string, any> | null) => void;
  openingBalance: number;
  setOpeningBalance: (val: number) => void;
  currencySymbol: string;
  isLoadingTerminals: boolean;
  isOpeningShift: boolean;
  onOpenShift: () => void;
}

export const RetailPosShiftOpenView: React.FC<RetailPosShiftOpenViewProps> = ({
  terminals,
  selectedTerminal,
  setSelectedTerminal,
  openingBalance,
  setOpeningBalance,
  currencySymbol,
  isLoadingTerminals,
  isOpeningShift,
  onOpenShift
}) => {
  return (
    <div className="flex-1 flex items-center justify-center p-6 bg-slate-900/50">
      <div className="bg-slate-950 border border-slate-800 w-full max-w-md rounded-2xl p-8 shadow-2xl space-y-6">
        <div className="w-16 h-16 bg-indigo-950 text-indigo-400 border border-indigo-900/50 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
          <Coins size={32} />
        </div>
        
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-black text-white">بدء وردية الكاشير</h2>
          <p className="text-slate-400 text-sm">الرجاء اختيار منفذ البيع الحالي وإدخال الرصيد الافتتاحي للدرج النقدي.</p>
        </div>

        {isLoadingTerminals ? (
          <div className="flex justify-center p-6">
            <Loader2 className="animate-spin text-indigo-500" size={32} />
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-black text-slate-400 mb-2">اختر جهاز الكاشير (الممر)</label>
              <select 
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-slate-100 font-bold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                value={selectedTerminal?.id || ''}
                onChange={(e) => {
                  const selected = terminals.find(t => t.id === e.target.value);
                  setSelectedTerminal(selected ?? null);
                }}
              >
                <option value="">-- اختر الكاشير --</option>
                {terminals.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-black text-slate-400 mb-2">الرصيد الافتتاحي (عهدة البداية)</label>
              <input 
                type="number" 
                value={openingBalance} 
                onChange={e => setOpeningBalance(Number(e.target.value))} 
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-center text-2xl font-bold text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                placeholder={`0.00 ${currencySymbol}`}
              />
            </div>

            <button 
              disabled={isOpeningShift || !selectedTerminal}
              onClick={onOpenShift}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-black py-4 rounded-xl shadow-lg shadow-indigo-500/10 transition-all flex justify-center items-center gap-2 text-lg"
            >
              {isOpeningShift && <Loader2 className="animate-spin" size={20} />}
              فتح الدرج وبدء البيع
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default RetailPosShiftOpenView;
