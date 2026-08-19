import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { 
  RotateCw, Search, Plus, Trash2, Edit, Printer, Download, 
  MessageCircle, Loader2, Filter, AlertCircle, ChevronLeft, 
  ChevronRight, RefreshCw, FileText
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { PurchaseReturnPrint } from './PurchaseReturnPrint';

export const PurchaseReturnsList: React.FC = () => {
  const { warehouses, suppliers, currentUser, settings, selectedFiscalYear, fiscalYearRange } = useAccounting();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [returns, setReturns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState(fiscalYearRange.startDate);
  const [endDate, setEndDate] = useState(`${selectedFiscalYear}-12-31`);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'posted' | 'draft'>('all');
  
  // Printing state
  const [returnToPrint, setReturnToPrint] = useState<any>(null);
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  useEffect(() => {
    if (selectedFiscalYear) {
      setStartDate(`${selectedFiscalYear}-01-01`);
      setEndDate(`${selectedFiscalYear}-12-31`);
    }
  }, [selectedFiscalYear]);

  useEffect(() => {
    supabase.rpc('get_current_company_settings').maybeSingle().then(({ data }) => {
      if (data) setCompanySettings(data);
    });
  }, []);

  const fetchReturns = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id;

      if (!userOrgId) {
        setLoading(false);
        return;
      }

      let query = supabase
        .from('purchase_returns')
        .select(`
          *,
          suppliers(id, name, phone),
          warehouses(id, name),
          purchase_invoices:original_invoice_id(id, invoice_number),
          purchase_return_items(id, product_id, quantity, unit_price, total, uom_id, products(name, sku))
        `)
        .eq('organization_id', userOrgId)
        .order('return_date', { ascending: false });

      if (startDate) query = query.gte('return_date', startDate);
      if (endDate) query = query.lte('return_date', endDate);
      if (selectedWarehouseId) query = query.eq('warehouse_id', selectedWarehouseId);
      if (selectedSupplierId) query = query.eq('supplier_id', selectedSupplierId);
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);

      const { data, error } = await query;
      if (error) throw error;

      setReturns(data || []);
    } catch (err: any) {
      console.error('Error fetching purchase returns:', err);
      showToast('فشل تحميل سجل مرتجعات المشتريات: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReturns();
  }, [startDate, endDate, selectedWarehouseId, selectedSupplierId, statusFilter]);

  // Client-side search filtering
  const filteredReturns = useMemo(() => {
    if (!searchTerm.trim()) return returns;
    const term = searchTerm.toLowerCase().trim();
    return returns.filter(r => 
      (r.return_number && r.return_number.toLowerCase().includes(term)) ||
      (r.suppliers?.name && r.suppliers.name.toLowerCase().includes(term)) ||
      (r.purchase_invoices?.invoice_number && r.purchase_invoices.invoice_number.toLowerCase().includes(term)) ||
      (r.notes && r.notes.toLowerCase().includes(term))
    );
  }, [returns, searchTerm]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredReturns.length / itemsPerPage) || 1;
  const paginatedReturns = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredReturns.slice(start, start + itemsPerPage);
  }, [filteredReturns, currentPage]);

  const handleDelete = async (ret: any) => {
    if (!window.confirm(`هل أنت متأكد من حذف مرتجع المشتريات رقم ${ret.return_number}؟\nسيتم إلغاء حركة المخزون والقيد المحاسبي بالكامل.`)) {
      return;
    }

    setDeletingId(ret.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id;

      // 1. إذا كان المرتجع مرحلاً، نعكس المخزون (إعادة إضافة الكميات التي تم خصمها)
      if (ret.status === 'posted' && ret.purchase_return_items && ret.purchase_return_items.length > 0) {
        for (const item of ret.purchase_return_items) {
          if (item.product_id && item.quantity) {
            const { data: prod } = await supabase.from('products').select('stock, warehouse_stock').eq('id', item.product_id).single();
            if (prod) {
              const newStock = (Number(prod.stock) || 0) + Number(item.quantity);
              let newWStock = prod.warehouse_stock || {};
              if (ret.warehouse_id && newWStock[ret.warehouse_id] !== undefined) {
                newWStock[ret.warehouse_id] = (Number(newWStock[ret.warehouse_id]) || 0) + Number(item.quantity);
              }
              await supabase.from('products').update({
                stock: newStock,
                warehouse_stock: newWStock
              }).eq('id', item.product_id);
            }
          }
        }
      }

      // 2. حذف قيد اليومية المرتبط
      if (ret.related_journal_entry_id) {
        await supabase.from('journal_entries').delete().eq('id', ret.related_journal_entry_id);
      } else {
        await supabase.from('journal_entries')
          .delete()
          .eq('organization_id', userOrgId)
          .eq('reference', ret.return_number);
      }

      // 3. حذف بنود المرتجع
      await supabase.from('purchase_return_items').delete().eq('purchase_return_id', ret.id);

      // 4. حذف سجل المرتجع
      const { error: delError } = await supabase.from('purchase_returns').delete().eq('id', ret.id);
      if (delError) throw delError;

      showToast('تم حذف مرتجع المشتريات وعكس القيد والمخزون بنجاح ✅', 'success');
      fetchReturns();
    } catch (err: any) {
      console.error('Error deleting purchase return:', err);
      showToast('فشل حذف المرتجع: ' + err.message, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handleEdit = (ret: any) => {
    navigate('/purchase-return', { state: { returnToEdit: ret } });
  };

  const handlePrint = (ret: any) => {
    setReturnToPrint(ret);
    setTimeout(() => {
      window.print();
      setReturnToPrint(null);
    }, 200);
  };

  const handleWhatsApp = (ret: any) => {
    const phone = ret.suppliers?.phone;
    if (!phone) {
      showToast('لا يوجد رقم هاتف مسجل لهذا المورد', 'warning');
      return;
    }
    const message = `مرحباً ${ret.suppliers?.name || 'موردنا العزيز'}،
تم تسجيل مرتجع مشتريات رقم: ${ret.return_number}
التاريخ: ${ret.return_date}
المبلغ الإجمالي: ${Number(ret.total_amount || 0).toLocaleString()} ${settings.currency || 'ج.م'}
شكراً لتعاونكم.`;

    window.open(`https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleExportExcel = () => {
    const data = [
      ['سجل مرتجعات المشتريات'],
      ['من تاريخ:', startDate, 'إلى تاريخ:', endDate],
      [],
      ['رقم المرتجع', 'التاريخ', 'المورد', 'المستودع', 'الفاتورة الأصلية', 'المبلغ قبل الضريبة', 'الضريبة', 'الإجمالي النهائي', 'الحالة', 'ملاحظات'],
      ...filteredReturns.map(r => [
        r.return_number,
        r.return_date,
        r.suppliers?.name || '-',
        r.warehouses?.name || '-',
        r.purchase_invoices?.invoice_number || 'مرتجع حر',
        (Number(r.total_amount || 0) - Number(r.tax_amount || 0)),
        Number(r.tax_amount || 0),
        Number(r.total_amount || 0),
        r.status === 'posted' ? 'مرحل' : 'مسودة',
        r.notes || ''
      ])
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Purchase Returns');
    XLSX.writeFile(wb, `Purchase_Returns_${startDate}_${endDate}.xlsx`);
  };

  // Summary Totals
  const totalReturnsCount = filteredReturns.length;
  const totalReturnsAmount = filteredReturns.reduce((sum, r) => sum + Number(r.total_amount || 0), 0);
  const totalTaxAmount = filteredReturns.reduce((sum, r) => sum + Number(r.tax_amount || 0), 0);

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <RotateCw className="text-orange-600" /> سجل مرتجعات المشتريات
          </h2>
          <p className="text-slate-500 text-sm">عرض، إدارة، تعديل وطباعة مرتجعات المشتريات ورد البضاعة للموردين</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button 
            onClick={() => navigate('/purchase-return')} 
            className="bg-orange-600 text-white px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-sm hover:bg-orange-700 transition-colors"
          >
            <Plus size={18} /> مرتجع جديد
          </button>
          <button 
            onClick={handleExportExcel} 
            className="bg-emerald-600 text-white px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-sm hover:bg-emerald-700 transition-colors"
          >
            <Download size={18} /> تصدير Excel
          </button>
          <button 
            onClick={fetchReturns} 
            className="bg-white border border-slate-300 text-slate-700 px-3 py-2.5 rounded-xl font-bold flex items-center gap-1.5 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> تحديث
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 print:hidden">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase">إجمالي عدد المرتجعات</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">{totalReturnsCount} <span className="text-xs font-normal text-slate-500">مرتجع</span></h3>
          </div>
          <div className="p-3 bg-orange-50 text-orange-600 rounded-xl">
            <FileText size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase">إجمالي مبالغ المرتجعات</p>
            <h3 className="text-2xl font-black text-orange-600 mt-1" dir="ltr">
              {totalReturnsAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs font-normal text-slate-500">{settings.currency || 'ج.م'}</span>
            </h3>
          </div>
          <div className="p-3 bg-slate-100 text-slate-700 rounded-xl">
            <RotateCw size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase">إجمالي ضريبة المرتجعات</p>
            <h3 className="text-2xl font-black text-blue-600 mt-1" dir="ltr">
              {totalTaxAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs font-normal text-slate-500">{settings.currency || 'ج.م'}</span>
            </h3>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <AlertCircle size={24} />
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-wrap items-end gap-3 print:hidden">
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs font-bold text-slate-600 mb-1">بحث سريع (رقم المرتجع / المورد / الفاتورة)</label>
          <div className="relative">
            <input 
              type="text" 
              value={searchTerm} 
              onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              placeholder="اكتب للبحث..."
              className="w-full border rounded-xl p-2.5 pl-10 bg-slate-50 focus:bg-white text-sm outline-none focus:border-orange-500 transition-colors"
            />
            <Search className="absolute left-3 top-3 text-slate-400" size={16} />
          </div>
        </div>

        <div className="w-full sm:w-auto">
          <label className="block text-xs font-bold text-slate-600 mb-1">من تاريخ</label>
          <input 
            type="date" 
            value={startDate} 
            onChange={e => setStartDate(e.target.value)} 
            className="w-full border rounded-xl p-2 bg-slate-50 text-sm"
          />
        </div>

        <div className="w-full sm:w-auto">
          <label className="block text-xs font-bold text-slate-600 mb-1">إلى تاريخ</label>
          <input 
            type="date" 
            value={endDate} 
            onChange={e => setEndDate(e.target.value)} 
            className="w-full border rounded-xl p-2 bg-slate-50 text-sm"
          />
        </div>

        <div className="w-full sm:w-auto min-w-[160px]">
          <label className="block text-xs font-bold text-slate-600 mb-1">المورد</label>
          <select 
            value={selectedSupplierId} 
            onChange={e => { setSelectedSupplierId(e.target.value); setCurrentPage(1); }}
            className="w-full border rounded-xl p-2 bg-slate-50 text-sm"
          >
            <option value="">كل الموردين</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div className="w-full sm:w-auto min-w-[160px]">
          <label className="block text-xs font-bold text-slate-600 mb-1">المستودع</label>
          <select 
            value={selectedWarehouseId} 
            onChange={e => { setSelectedWarehouseId(e.target.value); setCurrentPage(1); }}
            className="w-full border rounded-xl p-2 bg-slate-50 text-sm"
          >
            <option value="">كل المستودعات</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>

        <div className="w-full sm:w-auto min-w-[130px]">
          <label className="block text-xs font-bold text-slate-600 mb-1">الحالة</label>
          <select 
            value={statusFilter} 
            onChange={e => { setStatusFilter(e.target.value as any); setCurrentPage(1); }}
            className="w-full border rounded-xl p-2 bg-slate-50 text-sm font-bold"
          >
            <option value="all">كل الحالات</option>
            <option value="posted">مرحل ✅</option>
            <option value="draft">مسودة 📝</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-16 text-center">
            <Loader2 className="animate-spin mx-auto text-orange-600 mb-2" size={36} />
            <p className="text-slate-500 font-bold">جاري تحميل سجل مرتجعات المشتريات...</p>
          </div>
        ) : filteredReturns.length === 0 ? (
          <div className="p-16 text-center text-slate-500 flex flex-col items-center gap-3">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
              <RotateCw size={32} />
            </div>
            <h4 className="text-lg font-bold text-slate-700">لا توجد مرتجعات مشتريات مسجلة</h4>
            <p className="text-sm text-slate-400 max-w-sm">لم يتم العثور على أي مرتجعات مطابقة لمعايير البحث الحالية.</p>
            <button 
              onClick={() => navigate('/purchase-return')} 
              className="mt-2 bg-orange-600 text-white px-5 py-2 rounded-xl font-bold text-sm hover:bg-orange-700 transition-colors flex items-center gap-1.5"
            >
              <Plus size={16} /> إضافة مرتجع جديد
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-4">رقم المرتجع</th>
                    <th className="p-4">التاريخ</th>
                    <th className="p-4">المورد</th>
                    <th className="p-4">المستودع</th>
                    <th className="p-4">الفاتورة الأصلية</th>
                    <th className="p-4 text-center">عدد الأصناف</th>
                    <th className="p-4 text-center">الإجمالي</th>
                    <th className="p-4 text-center">الحالة</th>
                    <th className="p-4 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedReturns.map((ret) => (
                    <tr key={ret.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-4">
                        <span 
                          onClick={() => handleEdit(ret)}
                          className="font-mono font-black text-orange-600 hover:underline cursor-pointer flex items-center gap-1"
                        >
                          {ret.return_number}
                        </span>
                      </td>
                      <td className="p-4 whitespace-nowrap text-slate-600 font-mono">{ret.return_date}</td>
                      <td className="p-4 font-bold text-slate-800">
                        {ret.suppliers?.name || '-'}
                      </td>
                      <td className="p-4 text-slate-600">
                        {ret.warehouses?.name || '-'}
                      </td>
                      <td className="p-4">
                        {ret.purchase_invoices?.invoice_number ? (
                          <span className="font-mono text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg border border-blue-200 font-bold">
                            {ret.purchase_invoices.invoice_number}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 font-bold">مرتجع حر</span>
                        )}
                      </td>
                      <td className="p-4 text-center font-bold text-slate-700">
                        {ret.purchase_return_items?.length || 0}
                      </td>
                      <td className="p-4 text-center font-mono font-black text-orange-600" dir="ltr">
                        {Number(ret.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-4 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                          ret.status === 'posted' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {ret.status === 'posted' ? 'مرحل ✅' : 'مسودة 📝'}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button 
                            onClick={() => handlePrint(ret)} 
                            className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                            title="طباعة إشعار المرتجع"
                          >
                            <Printer size={16} />
                          </button>
                          <button 
                            onClick={() => handleEdit(ret)} 
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="تعديل / عرض المرتجع"
                          >
                            <Edit size={16} />
                          </button>
                          {ret.suppliers?.phone && (
                            <button 
                              onClick={() => handleWhatsApp(ret)} 
                              className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                              title="إرسال واتساب"
                            >
                              <MessageCircle size={16} />
                            </button>
                          )}
                          <button 
                            onClick={() => handleDelete(ret)} 
                            disabled={deletingId === ret.id}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                            title="حذف المرتجع بالكامل"
                          >
                            {deletingId === ret.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-sm">
                <span className="text-slate-500 font-bold">
                  عرض {(currentPage - 1) * itemsPerPage + 1} إلى {Math.min(currentPage * itemsPerPage, filteredReturns.length)} من {filteredReturns.length} مرتجع
                </span>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 border rounded-lg bg-white disabled:opacity-40 hover:bg-slate-100 font-bold"
                  >
                    <ChevronRight size={16} />
                  </button>
                  <span className="font-bold text-slate-700 px-3">
                    صفحة {currentPage} من {totalPages}
                  </span>
                  <button 
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 border rounded-lg bg-white disabled:opacity-40 hover:bg-slate-100 font-bold"
                  >
                    <ChevronLeft size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Hidden printable component */}
      {returnToPrint && (
        <PurchaseReturnPrint returnData={returnToPrint} companySettings={companySettings} />
      )}
    </div>
  );
};

export default PurchaseReturnsList;
