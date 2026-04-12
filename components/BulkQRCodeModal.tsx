import React, { useRef, useEffect, useState, useMemo } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { X, Printer, Loader2 } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import { useAccounting } from '../context/AccountingContext';
import { supabase } from '../supabaseClient';
import type { RestaurantTable } from '../types';

interface BulkQRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  tables: RestaurantTable[];
}

export const BulkQRCodeModal: React.FC<BulkQRCodeModalProps> = ({ isOpen, onClose, tables }) => {
  const { settings } = useAccounting();
  const printRef = useRef<HTMLDivElement>(null);
  const [qrData, setQrData] = useState<{ table: RestaurantTable, qrKey: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [targetPath, setTargetPath] = useState('/menu/');
  const [printMode, setPrintMode] = useState<'A4' | 'Thermal'>('A4');

  const handlePrint = useReactToPrint({
    content: () => printRef.current,
  } as any);

  useEffect(() => {
    if (isOpen && tables.length > 0) {
      const fetchQrs = async () => {
        setLoading(true);
        try {
          const results = await Promise.all(tables.map(async (table) => {
            const { data } = await supabase.rpc('get_or_create_qr_for_table', { p_table_id: table.id });
            // 🛡️ إصلاح: استخراج المفتاح النصي
            return { table, qrKey: data?.qr_access_key || '' };
          }));
          setQrData(results);
        } catch (error) {
          console.error("Error fetching QR codes:", error);
        } finally {
          setLoading(false);
        }
      };
      fetchQrs();
    }
  }, [isOpen, tables]);

  if (!isOpen) return null;

  const printStyles = useMemo(() => {
    if (printMode === 'Thermal') {
      return `
        @page { size: 50mm 30mm; margin: 0; }
        body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        .thermal-container { display: flex; flex-direction: column; }
        .thermal-item { 
            width: 50mm; 
            height: 30mm; 
            padding: 2mm;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            page-break-after: always; 
        }
      `;
    }
    // A4 styles (default)
    return `
        @page { size: A4; margin: 10mm; }
        body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        .qr-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
        .qr-item { break-inside: avoid; page-break-inside: avoid; }
    `;
  }, [printMode]);

  return (
    <div className="fixed inset-0 bg-black/60 z-[80] flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95">
        <div className="p-4 border-b flex flex-wrap justify-between items-center bg-slate-50 print:hidden">
          <div>
            <h3 className="font-bold text-lg text-slate-800">طباعة جميع رموز QR للطاولات</h3>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-bold text-slate-600">توجيه إلى:</label>
              <select 
                  value={targetPath} 
                  onChange={e => setTargetPath(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:border-blue-500 outline-none"
              >
                  <option value="/menu/">قائمة الطعام</option>
                  <option value="/offers/">صفحة العروض</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-bold text-slate-600">حجم الطباعة:</label>
              <select 
                  value={printMode} 
                  onChange={e => setPrintMode(e.target.value as any)}
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:border-blue-500 outline-none"
              >
                  <option value="A4">ورق A4</option>
                  <option value="Thermal">ملصق حراري (50x30mm)</option>
              </select>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-red-500"><X size={24} /></button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 bg-slate-100">
          {loading ? (
            <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin text-blue-600" size={48} /></div>
          ) : (
            <div className={`flex justify-center ${printMode === 'Thermal' ? 'items-start' : ''}`}>
              <div ref={printRef} className={`bg-white shadow-sm ${printMode === 'A4' ? 'p-8 w-[210mm] min-h-[297mm]' : ''}`}>
                <style type="text/css" media="print">
                  {printStyles}
                </style>
                {printMode === 'A4' ? (
                  <>
                    <div className="text-center mb-8 border-b-2 border-slate-800 pb-4">
                        <h1 className="text-2xl font-black text-slate-800">{settings?.companyName}</h1>
                        <p className="text-slate-500">قائمة رموز الاستجابة السريعة (QR Codes) للطاولات</p>
                    </div>
                    <div className="qr-grid grid grid-cols-3 gap-6">
                      {qrData.map(({ table, qrKey }) => (
                        <div key={table.id} className="qr-item flex flex-col items-center justify-center p-4 border-2 border-slate-200 rounded-xl bg-white shadow-sm">
                          <div className="text-xl font-black bg-slate-800 text-white px-4 py-1 rounded-full mb-3">{table.name}</div>
                          <div className="p-2 bg-white"><QRCodeCanvas value={`${window.location.origin}/#${targetPath}${qrKey}`} size={120} level="H" /></div>
                          <p className="text-[10px] text-slate-400 mt-2 font-mono text-center leading-tight opacity-50">{qrKey}</p>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="thermal-container">
                    {qrData.map(({ table, qrKey }) => (
                      <div key={table.id} className="thermal-item"><div className="text-xs font-black">{table.name}</div><div className="my-1"><QRCodeCanvas value={`${window.location.origin}/#${targetPath}${qrKey}`} size={60} level="H" /></div><p className="text-[8px] font-mono opacity-70">{qrKey}</p></div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-white flex justify-end print:hidden">
          <button onClick={handlePrint} disabled={loading} className="bg-blue-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 shadow-lg">
            <Printer size={18} /> طباعة الكل (A4)
          </button>
        </div>
      </div>
    </div>
  );
};
