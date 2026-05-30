import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { Layers, Search, Warehouse, Package, Download, Loader2, Filter, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import ReportHeader from '../../components/ReportHeader';

const MultiUomStockReport = () => {
  const { warehouses } = useAccounting();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('all');

  const fetchReport = async () => {
    setLoading(true);
    try {
      let query = supabase.from('v_inventory_multi_uom').select('*');
      
      if (selectedWarehouse !== 'all') {
        query = query.eq('warehouse_id', selectedWarehouse);
      }

      if (searchTerm) {
        query = query.ilike('product_name', `%${searchTerm}%`);
      }

      const { data: res, error } = await query;
      if (error) throw error;
      setData(res || []);
    } catch (err: any) {
      showToast('فشل جلب تقرير الوحدات المتعددة: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [selectedWarehouse]);

  const handleExport = () => {
    const exportData = data.map(item => ({
      'المستودع': item.warehouse_name,
      'الصنف': item.product_name,
      'SKU': item.sku,
      'الكمية الأساسية': item.base_quantity,
      'الوحدة الأساسية': item.base_uom_name,
      'الكمية المحولة': item.converted_quantity,
      'الوحدة البديلة': item.uom_name,
      'المعامل': item.ratio
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Multi-UoM Stock");
    XLSX.writeFile(wb, `Multi_UoM_Stock_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Layers className="text-purple-600" /> رصيد المخزون المتعدد (Multi-UoM)
          </h2>
          <p className="text-slate-500 text-sm">عرض أرصدة الأصناف بكافة وحدات القياس المعرفة</p>
        </div>
        <button onClick={handleExport} className="bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-emerald-700 shadow-lg shadow-emerald-100 transition-all">
          <FileSpreadsheet size={18} /> تصدير Excel
        </button>
      </div>

      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden">
        <ReportHeader title="تقرير أرصدة الوحدات المتعددة" />
        {loading ? (
          <div className="p-20 text-center flex flex-col items-center gap-4">
            <Loader2 className="animate-spin text-purple-600" size={40} />
            <p className="text-slate-400 font-bold">جاري تجميع الأرصدة وتحويل الوحدات...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <th className="p-5 flex items-center gap-2"><Package size={14}/> الصنف</th>
                  <th className="p-5 text-center"><Warehouse size={14} className="inline ml-1"/> المستودع</th>
                  <th className="p-5 text-center bg-blue-50/30 text-blue-600">الرصيد (أساسي)</th>
                  <th className="p-5 text-center bg-purple-50/30 text-purple-600 font-black">الرصيد (وحدات أخرى)</th>
                  <th className="p-5 text-center">معامل التحويل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="p-4 pr-6">
                      <div className="font-black text-slate-800">{item.product_name}</div>
                      <div className="text-[10px] font-mono text-slate-400">{item.sku}</div>
                    </td>
                    <td className="p-4 text-center font-bold text-slate-600">{item.warehouse_name}</td>
                    <td className="p-4 text-center bg-blue-50/10">
                      <span className="font-black text-blue-700">{item.base_quantity?.toLocaleString()}</span>
                      <span className="text-[10px] text-blue-400 mr-1 font-bold">{item.base_uom_name}</span>
                    </td>
                    <td className="p-4 text-center bg-purple-50/10">
                      <div className="inline-flex items-center gap-2 bg-white border border-purple-100 px-3 py-1.5 rounded-xl shadow-sm">
                        <span className="font-black text-purple-700 text-lg">{item.converted_quantity?.toLocaleString()}</span>
                        <span className="bg-purple-100 text-purple-700 text-[10px] px-2 py-0.5 rounded-full font-black">{item.uom_name}</span>
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] text-slate-400 font-bold mb-1">1 {item.uom_name} =</span>
                        <span className="font-mono text-xs font-black text-slate-600">{item.ratio} {item.base_uom_name}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default MultiUomStockReport;