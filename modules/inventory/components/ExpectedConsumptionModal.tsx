import React, { useState, useEffect } from 'react';
import { Zap, X, FileSpreadsheet, Loader2 } from 'lucide-react';
import { supabase } from '../../../supabaseClient';

interface ExpectedConsumptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  warehouses: { id: string; name: string }[];
  showToast: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

export const ExpectedConsumptionModal: React.FC<ExpectedConsumptionModalProps> = ({
  isOpen,
  onClose,
  warehouses,
  showToast,
}) => {
  const [consumptionData, setConsumptionData] = useState<any[]>([]);
  const [consumptionFilterWarehouseId, setConsumptionFilterWarehouseId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const fetchExpectedConsumption = async (whId: string = '') => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase.rpc('get_expected_raw_material_consumption', {
        p_warehouse_id: whId || null,
      });
      if (error) throw error;
      setConsumptionData(data || []);
    } catch (err: any) {
      showToast('فشل جلب بيانات الاستهلاك: ' + err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchExpectedConsumption(consumptionFilterWarehouseId);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95">
        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
            <Zap size={20} className="text-indigo-600" /> تقرير الاستهلاك المتوقع (المسودات)
          </h3>
          <button onClick={onClose}><X className="text-slate-400 hover:text-red-500" /></button>
        </div>
        <div className="p-6">
          <div className="bg-blue-50 text-blue-700 p-3 rounded-lg text-xs mb-4">
            هذا التقرير يحلل كافة الفواتير "المسودة" ويحسب المكونات الخام المطلوبة بناءً على الـ BOM الخاص بكل صنف وإضافاته.
          </div>
          <div className="mb-4 flex items-center gap-3">
            <label className="text-sm font-bold text-slate-600">تصفية حسب المستودع:</label>
            <select
              value={consumptionFilterWarehouseId}
              onChange={(e) => {
                setConsumptionFilterWarehouseId(e.target.value);
                fetchExpectedConsumption(e.target.value);
              }}
              className="border rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="">جميع المستودعات</option>
              {warehouses.map(wh => <option key={wh.id} value={wh.id}>{wh.name}</option>)}
            </select>
          </div>
          <div className="max-h-[400px] overflow-y-auto border rounded-xl overflow-hidden">
            {isLoading ? (
              <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                <Loader2 className="animate-spin text-indigo-600" size={28} />
                <span>جاري تحليل استهلاك المواد الخام...</span>
              </div>
            ) : (
              <table className="w-full text-right">
                <thead className="bg-slate-100 text-slate-600 text-xs font-bold sticky top-0">
                  <tr>
                    <th className="p-3">المادة الخام</th>
                    <th className="p-3 text-center">المخزون الحالي</th>
                    <th className="p-3 text-center">مطلوب تنفيذه</th>
                    <th className="p-3 text-center">الرصيد المتبقي</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-sm">
                  {consumptionData.map((row, idx) => {
                    const remaining = row.current_stock - row.expected_quantity;
                    return (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-3 font-bold text-slate-700">{row.raw_material_name}</td>
                        <td className="p-3 text-center font-mono">{row.current_stock}</td>
                        <td className="p-3 text-center font-bold text-blue-600">{row.expected_quantity}</td>
                        <td className={`p-3 text-center font-black ${remaining < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {remaining}
                          {remaining < 0 && <span className="block text-[10px] bg-red-100 px-1 rounded">عجز!</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {consumptionData.length === 0 && (
                    <tr><td colSpan={4} className="p-8 text-center text-slate-400">لا توجد فواتير مسودة حالياً</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
          <button
            onClick={() => window.print()}
            className="w-full mt-6 bg-slate-800 text-white font-bold py-3 rounded-xl hover:bg-slate-900 transition-all flex items-center justify-center gap-2"
          >
            <FileSpreadsheet size={20} /> طباعة قائمة الاحتياجات
          </button>
        </div>
      </div>
    </div>
  );
};
