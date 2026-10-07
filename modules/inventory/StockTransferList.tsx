
import { logger } from '../../utils/logger';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { 
  ArrowRightLeft, Search, Eye, Loader2, Printer, Download, 
  CheckCircle, Clock, X, Edit3, Package, FileSpreadsheet, Plus 
} from 'lucide-react';
import * as XLSX from 'xlsx';

const StockTransferList = () => {
  const { warehouses, products, currentUser, transfers: contextTransfers, approveStockTransfer, cancelStockTransfer, can, selectedFiscalYear } = useAccounting();
  const navigate = useNavigate();
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTransfer, setSelectedTransfer] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalItemsLoading, setModalItemsLoading] = useState(false);
  const [modalItemSearch, setModalItemSearch] = useState('');

  useEffect(() => {
    fetchTransfers();
  }, [selectedFiscalYear]);

  const fetchTransfers = async () => {
    if (currentUser?.role === 'demo') {
        // use context demo transfers so new ones appear
        setTransfers(contextTransfers);
        setLoading(false);
        return;
    }

    try {
      let query = supabase
        .from('stock_transfers')
        .select(`
          *,
          stock_transfer_items (
            id,
            product_id,
            quantity,
            uom_id,
            products (id, name, unit, sku)
          )
        `)
        .order('transfer_date', { ascending: false });

      if (selectedFiscalYear) {
        query = query
          .gte('transfer_date', `${selectedFiscalYear}-01-01`)
          .lte('transfer_date', `${selectedFiscalYear}-12-31`);
      }

      const { data, error } = await query;

      if (error) throw error;
      setTransfers(data || []);
    } catch (error) {
      logger.error('Error fetching transfers:', error);
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

  const handleViewDetails = async (transfer: Record<string, any>) => {
    setSelectedTransfer(transfer);
    setIsModalOpen(true);
    setModalItemSearch('');
    setModalItemsLoading(true);

    try {
      if (currentUser?.role !== 'demo' && transfer.id) {
        // جلب تفاصيل جميع الأصناف مباشرة لضمان عدم اقتصاص أي صنف في حالة زيادة عدد الأصناف
        const { data: fullItems, error } = await supabase
          .from('stock_transfer_items')
          .select(`
            id,
            product_id,
            quantity,
            uom_id,
            products (id, name, unit, sku)
          `)
          .eq('stock_transfer_id', transfer.id);

        if (!error && fullItems && fullItems.length > 0) {
          setSelectedTransfer(prev => prev ? ({
            ...prev,
            stock_transfer_items: fullItems
          }) : prev);
        }
      }
    } catch (error) {
      logger.error('Error fetching full transfer items:', error);
    } finally {
      setModalItemsLoading(false);
    }
  };

  const handleEditTransfer = (transfer: Record<string, any>) => {
    navigate('/stock-transfer', { state: { editTransferId: transfer.id, transfer } });
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
        ['#', 'كود الصنف', 'اسم الصنف', 'الكمية', 'الوحدة'] // Table header
    ];

    const itemsData = (selectedTransfer.stock_transfer_items || []).map((item: Record<string, any>, idx: number) => {
        const prod = products?.find(p => p.id === item.product_id) || item.products;
        return [
            idx + 1,
            prod?.sku || item.products?.sku || '-',
            prod?.name || item.products?.name || 'صنف غير معروف',
            item.quantity,
            prod?.unit || item.products?.unit || '-'
        ];
    });

    const finalData = header.concat(itemsData);
    const ws = XLSX.utils.aoa_to_sheet(finalData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "تفاصيل التحويل");
    XLSX.writeFile(wb, `StockTransfer_${selectedTransfer.transfer_number}.xlsx`);
  };

  const filteredTransfers = transfers.filter(t => 
    t.transfer_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    getWarehouseName(t.from_warehouse_id).toLowerCase().includes(searchTerm.toLowerCase()) ||
    getWarehouseName(t.to_warehouse_id).toLowerCase().includes(searchTerm.toLowerCase())
  );

  // الأصناف المفلترة داخل النافذة المنبثقة
  const currentModalItems = (selectedTransfer?.stock_transfer_items || []).filter((item: Record<string, any>) => {
    if (!modalItemSearch.trim()) return true;
    const term = modalItemSearch.toLowerCase();
    const prod = products?.find(p => p.id === item.product_id) || item.products;
    const name = (prod?.name || item.products?.name || '').toLowerCase();
    const sku = (prod?.sku || item.products?.sku || '').toLowerCase();
    return name.includes(term) || sku.includes(term);
  });

  const totalTransferQty = (selectedTransfer?.stock_transfer_items || []).reduce(
    (sum: number, it: Record<string, unknown>) => sum + (Number((it as { quantity?: unknown }).quantity) || 0), 0
  );

  return (
    <div className="space-y-6 animate-in fade-in print:p-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
            <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                <ArrowRightLeft className="text-blue-600" /> سجل التحويلات المخزنية
            </h2>
            <p className="text-slate-500 text-sm">عرض وتعديل ومتابعة حركات النقل بين المستودعات</p>
        </div>
        <button
            onClick={() => navigate('/stock-transfer')}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-500/20"
        >
            <Plus size={16} /> تحويل مخزني جديد
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 print:hidden">
        <div className="relative max-w-md">
            <Search className="absolute right-3 top-2.5 text-slate-400" size={18} />
            <input 
                type="text" 
                placeholder="بحث برقم التحويل أو المستودع..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pr-10 pl-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
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
                    <th className="p-4 text-center">الإجراءات</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {loading ? (
                    <tr><td colSpan={8} className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" /></td></tr>
                ) : filteredTransfers.length > 0 ? (
                    filteredTransfers.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                            <td className="p-4 font-mono font-bold text-blue-600">{t.transfer_number}</td>
                            <td className="p-4 text-sm">{t.transfer_date}</td>
                            <td className="p-4 text-sm font-medium">{getWarehouseName(t.from_warehouse_id)}</td>
                            <td className="p-4 text-sm font-medium">{getWarehouseName(t.to_warehouse_id)}</td>
                            <td className="p-4">
                                {t.status === 'posted' ? (
                                    <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-xs font-bold flex items-center gap-1 w-fit"><CheckCircle size={12}/> مرحّل</span>
                                ) : t.status === 'cancelled' ? (
                                    <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold flex items-center gap-1 w-fit"><X size={12}/> ملغي</span>
                                ) : (
                                    <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded text-xs font-bold flex items-center gap-1 w-fit"><Clock size={12}/> مسودة</span>
                                )}
                            </td>
                            <td className="p-4">
                                <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs font-bold">
                                    <Package size={12} className="text-slate-500" />
                                    {t.stock_transfer_items?.length || 0} صنف
                                </span>
                            </td>
                            <td className="p-4 text-slate-500 text-xs max-w-xs truncate">{t.notes || '-'}</td>
                            <td className="p-4">
                                <div className="flex items-center justify-center gap-1.5">
                                    {/* زر عرض التفاصيل وجميع الأصناف */}
                                    <button 
                                        onClick={() => handleViewDetails(t)}
                                        className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                        title="عرض التفاصيل وجميع الأصناف"
                                    >
                                        <Eye size={18} />
                                    </button>

                                    {/* زر تعديل التحويل المخزني */}
                                    <button 
                                        onClick={() => handleEditTransfer(t)}
                                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                        title="تعديل التحويل المخزني"
                                    >
                                        <Edit3 size={18} />
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
                    <tr><td colSpan={8} className="p-8 text-center text-slate-400">لا توجد تحويلات مخزنية مسجلة</td></tr>
                )}
            </tbody>
        </table>
      </div>

      {/* نافذة عرض تفاصيل التحويل المخزني بجميع أصنافه */}
      {isModalOpen && selectedTransfer && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 sm:p-6 backdrop-blur-sm print:static print:bg-white print:p-0">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 print:shadow-none print:w-full print:max-w-none print:max-h-none">
                
                {/* رأس النافذة */}
                <div className="bg-slate-50 px-6 py-4 border-b flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
                            <ArrowRightLeft size={20} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="font-black text-lg text-slate-800">تفاصيل التحويل المخزني</h3>
                                <span className="font-mono bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-lg text-sm font-bold border border-blue-200">
                                    {selectedTransfer.transfer_number}
                                </span>
                            </div>
                            <span className="text-xs text-slate-400">سجل حركة النقل بين المستودعات</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 print:hidden">
                        {/* زر تعديل التحويل */}
                        <button
                            onClick={() => handleEditTransfer(selectedTransfer)}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
                            title="تعديل هذا التحويل"
                        >
                            <Edit3 size={15} /> تعديل التحويل
                        </button>

                        {selectedTransfer.status === 'draft' && can('inventory', 'approve') && (
                            <button 
                                onClick={() => handleApprove(selectedTransfer.id)}
                                className="bg-emerald-600 text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 hover:bg-emerald-700 shadow-sm transition-colors"
                            >
                                <CheckCircle size={15} /> اعتماد الآن
                            </button>
                        )}
                        {selectedTransfer.status === 'posted' && can('inventory', 'cancel') && (
                            <button 
                                onClick={() => handleCancel(selectedTransfer.id)}
                                className="bg-red-50 text-red-700 border border-red-200 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 hover:bg-red-100 transition-colors"
                            >
                                <X size={15} /> إلغاء التحويل
                            </button>
                        )}
                        <button onClick={handleExportExcel} className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="تصدير Excel">
                            <Download size={18} />
                        </button>
                        <button onClick={handlePrint} className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="طباعة">
                            <Printer size={18} />
                        </button>
                        <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors font-bold text-lg leading-none" title="إغلاق">
                            ✕
                        </button>
                    </div>
                </div>

                {/* جسم النافذة - قابل للتمرير والنزول مع ظهور جميع الأصناف */}
                <div className="p-6 overflow-y-auto flex-1 space-y-6">
                    {/* بطاقات البيانات الأساسية */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50/80 p-4 rounded-2xl border border-slate-200 text-xs">
                        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-2xs">
                            <span className="text-slate-400 block mb-1">تاريخ التحويل:</span>
                            <span className="font-black text-slate-800 text-sm">{selectedTransfer.transfer_date}</span>
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-2xs">
                            <span className="text-slate-400 block mb-1">الحالة:</span>
                            <span className={`font-black inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
                                selectedTransfer.status === 'posted' ? 'bg-emerald-100 text-emerald-700' : 
                                selectedTransfer.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                                {selectedTransfer.status === 'posted' ? 'مرحّل بالمخازن' : 
                                 selectedTransfer.status === 'cancelled' ? 'ملغي' : 'مسودة'}
                            </span>
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-2xs">
                            <span className="text-slate-400 block mb-1">من مستودع:</span>
                            <span className="font-bold text-slate-800">{getWarehouseName(selectedTransfer.from_warehouse_id)}</span>
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-2xs">
                            <span className="text-slate-400 block mb-1">إلى مستودع:</span>
                            <span className="font-bold text-slate-800">{getWarehouseName(selectedTransfer.to_warehouse_id)}</span>
                        </div>
                    </div>

                    {/* الملاحظات وتفاصيل التعبئة */}
                    {selectedTransfer.notes && (
                      <div className="bg-blue-50/70 p-3.5 rounded-2xl border border-blue-100 text-xs">
                        <span className="text-blue-900 font-bold block mb-1">البيان وتفاصيل التعبئة والوحدات:</span>
                        <span className="font-medium text-slate-700 whitespace-pre-line leading-relaxed">{selectedTransfer.notes}</span>
                      </div>
                    )}

                    {/* عنوان جدول الأصناف + البحث داخل الأصناف */}
                    <div>
                        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-3">
                            <div className="flex items-center gap-2">
                                <h4 className="font-black text-slate-800 text-sm flex items-center gap-1.5">
                                    <Package size={16} className="text-blue-600" />
                                    الأصناف المحولة
                                </h4>
                                <span className="bg-blue-100 text-blue-800 text-xs font-black px-2.5 py-0.5 rounded-full">
                                    {selectedTransfer.stock_transfer_items?.length || 0} صنف
                                </span>
                                {modalItemsLoading && (
                                    <span className="text-xs text-blue-600 flex items-center gap-1 font-bold">
                                        <Loader2 size={13} className="animate-spin" /> جاري تحميل الأصناف...
                                    </span>
                                )}
                            </div>

                            {/* بحث سريع داخل أصناف التحويل في حال زيادة عددها */}
                            {(selectedTransfer.stock_transfer_items?.length || 0) > 3 && (
                                <div className="relative w-full sm:w-64 print:hidden">
                                    <Search className="absolute right-3 top-2 text-slate-400" size={14} />
                                    <input
                                        type="text"
                                        placeholder="بحث في أصناف هذا التحويل..."
                                        value={modalItemSearch}
                                        onChange={e => setModalItemSearch(e.target.value)}
                                        className="w-full pr-8 pl-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                                    />
                                </div>
                            )}
                        </div>

                        {/* جدول الأصناف - مزود بشريط تمرير داخلي ورأس ثابت لظهور كل الأصناف مهما زاد عددها */}
                        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                            <div className="max-h-[380px] overflow-y-auto">
                                <table className="w-full text-right text-xs">
                                    <thead className="sticky top-0 bg-slate-100 text-slate-700 font-black border-b border-slate-200 z-10">
                                        <tr>
                                            <th className="p-3 w-12 text-center">#</th>
                                            <th className="p-3 w-32">كود الصنف</th>
                                            <th className="p-3">اسم الصنف</th>
                                            <th className="p-3 w-32 text-center">الكمية المنقولة</th>
                                            <th className="p-3 w-24 text-center">الوحدة</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 bg-white">
                                        {currentModalItems.length > 0 ? (
                                            currentModalItems.map((item: Record<string, any>, idx: number) => {
                                                const prod = products?.find(p => p.id === item.product_id) || item.products;
                                                const prodName = prod?.name || item.products?.name || 'صنف محذوف أو غير معروف';
                                                const prodSku = prod?.sku || item.products?.sku || '-';
                                                const prodUnit = prod?.unit || item.products?.unit || '-';

                                                return (
                                                    <tr key={item.id || idx} className="hover:bg-blue-50/40 transition-colors odd:bg-slate-50/30">
                                                        <td className="p-3 text-center text-slate-400 font-bold">{idx + 1}</td>
                                                        <td className="p-3 font-mono text-slate-500 text-[11px]">{prodSku}</td>
                                                        <td className="p-3 font-bold text-slate-800">{prodName}</td>
                                                        <td className="p-3 text-center font-black text-blue-700 text-sm">
                                                            {item.quantity}
                                                        </td>
                                                        <td className="p-3 text-center text-slate-500 font-medium">{prodUnit}</td>
                                                    </tr>
                                                );
                                            })
                                        ) : (
                                            <tr>
                                                <td colSpan={5} className="p-6 text-center text-slate-400">
                                                    {modalItemSearch ? 'لا توجد أصناف مطابقة لكلمة البحث' : 'لا توجد أصناف مسجلة في هذا التحويل'}
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                    {/* تذييل الجدول بإجمالي الأصناف والكميات */}
                                    <tfoot className="sticky bottom-0 bg-slate-100 text-slate-800 font-black border-t border-slate-200">
                                        <tr>
                                            <td colSpan={3} className="p-3 text-right">
                                                المجموع: ({currentModalItems.length}) صنف
                                            </td>
                                            <td className="p-3 text-center text-blue-800 font-black text-sm">
                                                {totalTransferQty.toLocaleString()}
                                            </td>
                                            <td className="p-3 text-center text-slate-500 text-[11px]">إجمالي الكمية</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                {/* تذييل النافذة */}
                <div className="bg-slate-50 px-6 py-3.5 border-t flex justify-between items-center shrink-0 print:hidden">
                    <div className="text-xs text-slate-500 font-medium">
                        إجمالي الأصناف بالتحويل: <span className="font-bold text-slate-800">{selectedTransfer.stock_transfer_items?.length || 0} صنف</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => handleEditTransfer(selectedTransfer)}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
                        >
                            <Edit3 size={15} /> تعديل التحويل
                        </button>
                        <button 
                            onClick={() => setIsModalOpen(false)} 
                            className="px-4 py-2 bg-slate-200 text-slate-700 rounded-xl hover:bg-slate-300 font-bold text-xs transition-colors"
                        >
                            إغلاق
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default StockTransferList;
