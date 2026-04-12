import React, { useRef, useState, useMemo } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { X, Printer, QrCode } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import { useAccounting } from '../context/AccountingContext';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableName: string;
  qrKey: string;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({ isOpen, onClose, tableName, qrKey }) => {
  const { settings } = useAccounting();
  const printRef = useRef<HTMLDivElement>(null);
  const [targetPath, setTargetPath] = useState('/menu/');

  // 🔗 توليد الرابط المتوافق مع HashRouter
  const qrUrl = useMemo(() => {
    const origin = window.location.origin;
    // نضمن أن المسار يبدأ بـ / ليعمل بشكل صحيح مع الهاش
    const cleanPath = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;
    return `${origin}/#${cleanPath}${qrKey}`;
  }, [targetPath, qrKey]);

  const handlePrint = useReactToPrint({
    content: () => printRef.current,
  } as any);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95">
        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
            <QrCode size={20} className="text-blue-600" />
            رمز QR للطاولة: {tableName}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500"><X size={24} /></button>
        </div>

        <div className="p-4 bg-slate-100 border-b print:hidden">
            <label className="block text-xs font-bold text-slate-600 mb-1">توجيه الرمز إلى:</label>
            <select 
                value={targetPath} 
                onChange={e => setTargetPath(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:border-blue-500 outline-none"
            >
                <option value="/menu/">قائمة الطعام الرئيسية</option>
                <option value="/offers/">صفحة العروض الخاصة</option>
                {/* Add more paths here if needed */}
            </select>
        </div>
        
        <div ref={printRef} className="p-8 flex flex-col items-center justify-center text-center bg-white">
          {settings?.logoUrl ? (
            <img src={settings.logoUrl} alt="Logo" className="w-20 h-20 object-contain mb-3" />
          ) : (
            <img src="/logo.jpg" alt="Logo" className="w-20 h-20 object-contain mb-3 opacity-50" />
          )}
          <h2 className="text-xl font-black text-slate-800 mb-1">{settings?.companyName || 'اسم المطعم'}</h2>
          <h3 className="text-lg font-bold text-slate-600 mb-4 bg-slate-100 px-4 py-1 rounded-full">{tableName}</h3>
          
          <div className="p-3 bg-white border-4 border-slate-100 rounded-xl mb-4 shadow-sm">
            <QRCodeCanvas 
              value={qrUrl} 
              size={220} 
              level="M" 
              includeMargin={true}
            />
          </div>
          
          <p className="text-sm font-bold text-slate-700">امسح الرمز لفتح القائمة والطلب</p>
          <p className="text-[10px] text-slate-400 mt-2 break-all opacity-50 font-mono print:hidden" dir="ltr">{qrUrl}</p>
        </div>

        <div className="p-4 border-t bg-slate-50 flex justify-end print:hidden"><button onClick={handlePrint} className="bg-blue-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-blue-700 flex items-center gap-2"><Printer size={18} /> طباعة</button></div>
      </div>
    </div>
  );
};