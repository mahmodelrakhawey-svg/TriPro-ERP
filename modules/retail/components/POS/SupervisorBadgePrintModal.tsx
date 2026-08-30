import React, { useState } from 'react';
import { ShieldCheck, Printer, X, Download, RefreshCw, Lock, Sparkles, CreditCard } from 'lucide-react';
import { generateCode128Svg } from '../../utils/barcodeSvg';

interface SupervisorBadgePrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgName?: string;
  supervisorName?: string;
  supervisorPin?: string;
  supervisorId?: string;
}

export default function SupervisorBadgePrintModal({
  isOpen,
  onClose,
  orgName = 'TriPro Hypermarket',
  supervisorName = 'مشرف الوردية الرئيسي',
  supervisorPin = '1234',
  supervisorId = 'SUP-001'
}: SupervisorBadgePrintModalProps) {
  const [customName, setCustomName] = useState(supervisorName);
  const [customPin, setCustomPin] = useState(supervisorPin);
  const [printFormat, setPrintFormat] = useState<'CARD' | 'RECEIPT'>('CARD');

  if (!isOpen) return null;

  // The barcode payload scanned by barcode reader: SUP-1234 or direct PIN
  const barcodeValue = `SUP-${customPin}`;
  const barcodeSvg = generateCode128Svg(barcodeValue, { height: 45, barWidth: 2, showText: true });

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-700 via-purple-700 to-indigo-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center border border-white/20">
              <ShieldCheck size={24} className="text-amber-300" />
            </div>
            <div>
              <h3 className="font-black text-lg">طباعة شارة باركود المشرف (Supervisor Badge)</h3>
              <p className="text-xs text-purple-200">كارت تصريح رئيس الكاشيرية لإلغاء الأصناف واعتماد المرتجعات</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-all">
            <X size={20} />
          </button>
        </div>

        {/* Form Controls */}
        <div className="p-6 space-y-5 no-print">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1.5">اسم المشرف / الهيد كاشير</label>
              <input
                type="text"
                value={customName}
                onChange={e => setCustomName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white font-bold outline-none focus:border-indigo-500"
                placeholder="مثال: أحمد محمود"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1.5">كود المشرف السري (PIN)</label>
              <input
                type="text"
                maxLength={6}
                value={customPin}
                onChange={e => setCustomPin(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm font-mono text-center text-amber-400 font-black tracking-widest outline-none focus:border-indigo-500"
                placeholder="1234"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs font-bold text-slate-400">شكل الطباعة:</label>
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setPrintFormat('CARD')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  printFormat === 'CARD' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                <CreditCard size={14} /> كارت بلاستيك / ID Badge
              </button>
              <button
                type="button"
                onClick={() => setPrintFormat('RECEIPT')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  printFormat === 'RECEIPT' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Printer size={14} /> طابعة إيصالات حرارية (80mm)
              </button>
            </div>
          </div>

          {/* Badge Preview Area */}
          <div className="p-4 bg-slate-950/60 rounded-2xl border border-slate-800/80 flex flex-col items-center justify-center">
            <span className="text-xs text-slate-400 font-bold mb-3">معاينة الشارة المطبوعة:</span>

            {/* Visual Badge Card */}
            <div 
              id="supervisor-badge-card"
              className={`bg-white text-slate-900 border-2 border-indigo-600 rounded-2xl shadow-xl overflow-hidden ${
                printFormat === 'CARD' ? 'w-[320px] p-5' : 'w-[280px] p-4'
              }`}
            >
              {/* Card Header */}
              <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
                <div>
                  <h4 className="font-black text-sm text-indigo-900">{orgName}</h4>
                  <span className="text-[10px] text-slate-500 font-bold">بطاقة اعتماد وصلاحيات كاشير</span>
                </div>
                <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700">
                  <ShieldCheck size={18} />
                </div>
              </div>

              {/* Supervisor Info */}
              <div className="text-center space-y-1 mb-3">
                <div className="text-sm font-black text-slate-900">{customName}</div>
                <div className="inline-block bg-indigo-100 text-indigo-800 text-[10px] font-black px-2.5 py-0.5 rounded-full">
                  مشرف وردية معتمد (Head Cashier)
                </div>
              </div>

              {/* Barcode Rendered */}
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex flex-col items-center justify-center my-2">
                <div dangerouslySetInnerHTML={{ __html: barcodeSvg }} className="max-w-full flex justify-center" />
                <span className="text-[9px] text-slate-400 font-mono mt-1">كود التصريح السريع: {barcodeValue}</span>
              </div>

              {/* Security Warning */}
              <div className="text-center text-[8px] text-slate-400 font-bold border-t border-dashed border-slate-200 pt-2 mt-2">
                سري ومخصص للاستخدام الإشرافي فقط • يمنع تداول الكارت
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-950 p-5 border-t border-slate-800 flex justify-between items-center no-print">
          <div className="text-xs text-slate-400">
            <span>💡 عند التمرير بمسدس الباركود: يفتح النظام شاشة المرتجع أو الحذف فوراً</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 font-bold text-xs hover:bg-slate-800 transition-colors"
            >
              إلغاء
            </button>
            <button
              onClick={handlePrint}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-black text-xs hover:from-indigo-500 hover:to-purple-500 flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all"
            >
              <Printer size={16} /> طباعة الشارة الآن
            </button>
          </div>
        </div>

        {/* Print Layout CSS */}
        <style>{`
          @media print {
            body * {
              visibility: hidden;
            }
            .no-print {
              display: none !important;
            }
            #supervisor-badge-card, #supervisor-badge-card * {
              visibility: visible;
            }
            #supervisor-badge-card {
              position: fixed;
              left: 50%;
              top: 50%;
              transform: translate(-50%, -50%);
              width: 85mm;
              box-shadow: none;
              border: 2px solid #000;
            }
          }
        `}</style>

      </div>
    </div>
  );
}
