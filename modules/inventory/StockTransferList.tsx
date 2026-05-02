
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { ArrowRightLeft, Search, Eye, Loader2, Printer, Download, CheckCircle, Clock, X } from 'lucide-react';
import * as XLSX from 'xlsx';

const StockTransferList = () => {
  const { warehouses, currentUser, transfers: contextTransfers, approveStockTransfer, cancelStockTransfer, can } = useAccounting();
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
        // use context demo transfers so new ones appear
        setTransfers(contextTransfers);
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
            products (name, unit)
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

  const handleApprove = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من اعتماد هذا التحويل؟ سيتم خصم الكميات من المستودع المصدر وإضافتها للمستلم.')) return;
    await approveStockTransfer(id);
    if (isModalOpen) setIsModalOpen(false);
    fetchTransfers();
  };

  const handleCancel = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من إلغاء هذا التحويل؟ سيتم إعادة الكميات إلى المستودع المصدر.')) return;
    await cancelStockTransfer(id);
    if (isModalOpen) setIsModalOpen(false);
    fetchTransfers();
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
        ['الصنف', 'الكمية', 'الوحدة'] // Table header
    ];

    const itemsData = selectedTransfer.stock_transfer_items.map((item: any) => [
        item.products?.name || 'صنف محذوف',
        item.quantity,
        item.products?.unit || '-'
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
                    <th className="p-4">الحالة</th>
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
                            <td className="p-4">
                                {t.status === 'posted' ? (
                                    <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-xs font-bold flex items-center gap-1 w-fit"><CheckCircle size={12}/> مرحّل</span>
                                ) : t.status === 'cancelled' ? (
                                    <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold flex items-center gap-1 w-fit"><X size={12}/> ملغي</span>
                                ) : (
                                    <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded text-xs font-bold flex items-center gap-1 w-fit"><Clock size={12}/> مسودة</span>
                                )}
                            </td>
                            <td className="p-4">{t.stock_transfer_items?.length || 0}</td>
                            <td className="p-4 text-slate-500 text-sm">{t.notes || '-'}</td>
                            <td className="p-4">
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => handleViewDetails(t)}
                                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                        title="عرض التفاصيل"
                                    >
                                        <Eye size={18} />
                                    </button>
                                    {t.status === 'draft' && can('inventory', 'approve') && (
                                        <button 
                                            onClick={() => handleApprove(t.id)}
                                            className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                            title="اعتماد وترحيل"
                                        >
                                            <CheckCircle size={18} />
                                        </button>
                                    )}
                                    {t.status === 'posted' && can('inventory', 'cancel') && (
                                        <button 
                                            onClick={() => handleCancel(t.id)}
                                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            title="إلغاء التحويل"
                                        >
                                            <X size={18} />
                                        </button>
                                    )}
                                </div>
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
                    <div className="flex items-center gap-2 print:hidden">
                        {selectedTransfer.status === 'draft' && can('inventory', 'approve') && (
                            <button 
                                onClick={() => handleApprove(selectedTransfer.id)}
                                className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1 hover:bg-emerald-700"
                            >
                                <CheckCircle size={16} /> اعتماد الآن
                            </button>
                        )}
                        {selectedTransfer.status === 'posted' && can('inventory', 'cancel') && (
                            <button 
                                onClick={() => handleCancel(selectedTransfer.id)}
                                className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1 hover:bg-red-700"
                            >
                                <X size={16} /> إلغاء التحويل
                            </button>
                        )}
                        <button onClick={handleExportExcel} className="text-slate-500 hover:text-emerald-600 p-1" title="تصدير Excel"><Download size={20} /></button>
                        <button onClick={handlePrint} className="text-slate-500 hover:text-blue-600 p-1"><Printer size={20} /></button>
                        <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-red-500 p-1">✕</button>
                    </div>
                </div>
                <div className="p-6">
                    <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                        <div><span className="text-slate-500 block">التاريخ:</span> <span className="font-bold">{selectedTransfer.transfer_date}</span></div>
                        <div><span className="text-slate-500 block">الحالة:</span> 
                            <span className={`font-bold ${selectedTransfer.status === 'posted' ? 'text-emerald-600' : selectedTransfer.status === 'cancelled' ? 'text-red-600' : 'text-amber-600'}`}>
                                {selectedTransfer.status === 'posted' ? 'مرحّل (تم التأثير في المخازن)' : 
                                 selectedTransfer.status === 'cancelled' ? 'ملغي' : 'مسودة (في انتظار الاعتماد)'}
                            </span>
                        </div>
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
                                    <td className="p-3 font-bold">{item.quantity} <span className="text-xs font-normal text-slate-500">{item.products?.unit || ''}</span></td>
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
