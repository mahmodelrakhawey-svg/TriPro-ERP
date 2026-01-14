
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { ArrowRightLeft, Search, Eye, Loader2, Printer, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

const StockTransferList = () => {
  const { warehouses, currentUser } = useAccounting();
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTransfer, setSelectedTransfer] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    fetchTransfers();
  }, []);

  const fetchTransfers = async () => {
    if (currentUser?.role === 'demo') {
        setTransfers([]);
        setLoading(false);
        return;
    }

    try {
      const { data, error } = await supabase
        .from('stock_transfers')
        .select(`
          *,
          stock_transfer_items (
            quantity,
            products (name)
          )
        `)
        .order('transfer_date', { ascending: false });

      if (error) throw error;
      setTransfers(data || []);
    } catch (error) {
      console.error('Error fetching transfers:', error);
    } finally {
      setLoading(false);
    }
  };

  const getWarehouseName = (id: string) => {
    return warehouses.find(w => w.id === id)?.name || 'مستودع غير معروف';
  };

  const handleViewDetails = (transfer: any) => {
    setSelectedTransfer(transfer);
    setIsModalOpen(true);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportExcel = () => {
    if (!selectedTransfer) return;

    const header = [
        ['تفاصيل التحويل المخزني'],
        ['رقم التحويل:', selectedTransfer.transfer_number],
        ['التاريخ:', selectedTransfer.transfer_date],
        ['من مستودع:', getWarehouseName(selectedTransfer.from_warehouse_id)],
        ['إلى مستودع:', getWarehouseName(selectedTransfer.to_warehouse_id)],
        [''], // Spacer
        ['الصنف', 'الكمية'] // Table header
    ];

    const itemsData = selectedTransfer.stock_transfer_items.map((item: any) => [
        item.products?.name || 'صنف محذوف',
        item.quantity
    ]);

    const finalData = header.concat(itemsData);
    const ws = XLSX.utils.aoa_to_sheet(finalData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "تفاصيل التحويل");
    XLSX.writeFile(wb, `StockTransfer_${selectedTransfer.transfer_number}.xlsx`);
  };

  const filteredTransfers = transfers.filter(t => 
    t.transfer_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    getWarehouseName(t.from_warehouse_id).toLowerCase().includes(searchTerm.toLowerCase()) ||
    getWarehouseName(t.to_warehouse_id).toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in print:p-0">
      <div className="flex justify-between items-center">
        <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <ArrowRightLeft className="text-blue-600" /> سجل التحويلات المخزنية
            </h2>
            <p className="text-slate-500">عرض تاريخ حركات النقل بين المستودعات</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 print:hidden">
        <div className="relative max-w-md">
            <Search className="absolute right-3 top-2.5 text-slate-400" size={18} />
            <input 
                type="text" 
                placeholder="بحث برقم التحويل أو المستودع..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pr-10 pl-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden print:hidden">
        <table className="w-full text-right">
            <thead className="bg-slate-50 text-slate-600 font-bold text-sm">
                <tr>
                    <th className="p-4">رقم التحويل</th>
                    <th className="p-4">التاريخ</th>
                    <th className="p-4">من مستودع</th>
                    <th className="p-4">إلى مستودع</th>
                    <th className="p-4">عدد الأصناف</th>
                    <th className="p-4">ملاحظات</th>
                    <th className="p-4">الإجراءات</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {loading ? (
                    <tr><td colSpan={7} className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" /></td></tr>
                ) : filteredTransfers.length > 0 ? (
                    filteredTransfers.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-50">
                            <td className="p-4 font-mono font-bold text-blue-600">{t.transfer_number}</td>
                            <td className="p-4">{t.transfer_date}</td>
                            <td className="p-4">{getWarehouseName(t.from_warehouse_id)}</td>
                            <td className="p-4">{getWarehouseName(t.to_warehouse_id)}</td>
                            <td className="p-4">{t.stock_transfer_items?.length || 0}</td>
                            <td className="p-4 text-slate-500 text-sm">{t.notes || '-'}</td>
                            <td className="p-4">
                                <button 
                                    onClick={() => handleViewDetails(t)}
                                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                    title="عرض التفاصيل"
                                >
                                    <Eye size={18} />
                                </button>
                            </td>
                        </tr>
                    ))
                ) : (
                    <tr><td colSpan={7} className="p-8 text-center text-slate-400">لا توجد تحويلات مخزنية مسجلة</td></tr>
                )}
            </tbody>
        </table>
      </div>

      {isModalOpen && selectedTransfer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm print:static print:bg-white print:p-0">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 print:shadow-none print:w-full print:max-w-none">
                <div className="bg-slate-50 px-6 py-4 border-b flex justify-between items-center">
                    <h3 className="font-bold text-lg text-slate-800">تفاصيل التحويل {selectedTransfer.transfer_number}</h3>
                    <div className="flex gap-2 print:hidden">
                        <button onClick={handleExportExcel} className="text-slate-500 hover:text-emerald-600 p-1" title="تصدير Excel"><Download size={20} /></button>
                        <button onClick={handlePrint} className="text-slate-500 hover:text-blue-600 p-1"><Printer size={20} /></button>
                        <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-red-500 p-1">✕</button>
                    </div>
                </div>
                <div className="p-6">
                    <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                        <div><span className="text-slate-500 block">التاريخ:</span> <span className="font-bold">{selectedTransfer.transfer_date}</span></div>
                        <div><span className="text-slate-500 block">الحالة:</span> <span className="font-bold text-emerald-600">مرحل</span></div>
                        <div><span className="text-slate-500 block">من:</span> <span className="font-bold">{getWarehouseName(selectedTransfer.from_warehouse_id)}</span></div>
                        <div><span className="text-slate-500 block">إلى:</span> <span className="font-bold">{getWarehouseName(selectedTransfer.to_warehouse_id)}</span></div>
                        {selectedTransfer.notes && <div className="col-span-2"><span className="text-slate-500 block">ملاحظات:</span> <span className="font-bold">{selectedTransfer.notes}</span></div>}
                    </div>

                    <table className="w-full text-right border rounded-lg overflow-hidden">
                        <thead className="bg-slate-50 text-slate-600 font-bold text-sm">
                            <tr>
                                <th className="p-3">الصنف</th>
                                <th className="p-3">الكمية</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {selectedTransfer.stock_transfer_items.map((item: any, idx: number) => (
                                <tr key={idx}>
                                    <td className="p-3">{item.products?.name || 'صنف محذوف'}</td>
                                    <td className="p-3 font-bold">{item.quantity}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="bg-slate-50 px-6 py-4 border-t flex justify-end print:hidden">
                    <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 font-bold">إغلاق</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default StockTransferList;
