import { useState, useEffect } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { supabase } from '../../supabaseClient';
import { Wallet, Printer, Download, Loader2, Search } from 'lucide-react';
import * as XLSX from 'xlsx';
import ReportHeader from '../../components/ReportHeader';

const SupplierBalancesReport = () => {
  const { currentUser, settings } = useAccounting();
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchReport();
  }, []);

  const fetchReport = async () => {
    setLoading(true);
    if (currentUser?.role === 'demo') {
        setReportData([
            { id: 'd1', name: 'شركة التوريدات العالمية', phone: '01012345678', balance: 65000 },
            { id: 'd2', name: 'مصنع الجودة', phone: '01234567890', balance: 15000 },
            { id: 'd3', name: 'مؤسسة التقنية', phone: '01122334455', balance: -5000 }
        ]);
        setLoading(false);
        return;
    }

    try {
      // 1. جلب الموردين
      const { data: suppliers } = await supabase.from('suppliers').select('id, name, phone').is('deleted_at', null);
      
      // 2. جلب الحركات المالية
      const { data: invoices } = await supabase.from('purchase_invoices').select('supplier_id, total_amount').eq('status', 'posted');
      const { data: payments } = await supabase.from('payment_vouchers').select('supplier_id, amount');
      const { data: returns } = await supabase.from('purchase_returns').select('supplier_id, total_amount').eq('status', 'posted');
      const { data: debitNotes } = await supabase.from('debit_notes').select('supplier_id, total_amount');
      const { data: cheques } = await supabase.from('cheques').select('party_id, amount').eq('type', 'outgoing').neq('status', 'rejected');
      
      if (!suppliers) return;

      const balances = suppliers.map(supplier => {
        const totalInvoiced = invoices?.filter(i => i.supplier_id === supplier.id).reduce((sum, i) => sum + Number(i.total_amount), 0) || 0;
        
        const totalPaid = (payments?.filter(p => p.supplier_id === supplier.id).reduce((sum, p) => sum + Number(p.amount), 0) || 0) +
                          (returns?.filter(r => r.supplier_id === supplier.id).reduce((sum, r) => sum + Number(r.total_amount), 0) || 0) +
                          (debitNotes?.filter(d => d.supplier_id === supplier.id).reduce((sum, d) => sum + Number(d.total_amount), 0) || 0) +
                          (cheques?.filter(c => c.party_id === supplier.id).reduce((sum, c) => sum + Number(c.amount), 0) || 0);

        return {
          id: supplier.id,
          name: supplier.name,
          phone: supplier.phone,
          balance: totalInvoiced - totalPaid
        };
      }).sort((a, b) => b.balance - a.balance);

      setReportData(balances);
    } catch (error) {
      console.error("Error fetching supplier balances:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredData = reportData.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const totalBalance = filteredData.reduce((sum, item) => sum + item.balance, 0);

  const handleExportExcel = () => {
    const data = [
      ['تقرير أرصدة الموردين'],
      ['تاريخ التقرير:', new Date().toLocaleDateString('ar-EG')],
      [],
      ['المورد', 'رقم الهاتف', 'الرصيد الحالي'],
      ...filteredData.map(item => [
        item.name,
        item.phone || '-',
        item.balance
      ]),
      [],
      ['الإجمالي', '', totalBalance]
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Supplier Balances");
    XLSX.writeFile(wb, `Supplier_Balances_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 print:hidden">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Wallet className="text-blue-600" /> تقرير أرصدة الموردين
          </h2>
          <p className="text-slate-500">عرض الأرصدة الحالية المستحقة للموردين</p>
        </div>
        <div className="flex gap-2">
            <button onClick={handleExportExcel} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 font-bold text-sm shadow-sm">
                <Download size={16} /> تصدير Excel
            </button>
            <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 font-bold text-sm shadow-sm">
                <Printer size={16} /> طباعة
            </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 print:hidden">
        <div className="relative max-w-md">
            <Search className="absolute right-3 top-3 text-slate-400" size={18} />
            <input 
                type="text" 
                placeholder="بحث عن مورد..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pr-10 pl-4 py-2 border rounded-lg focus:outline-none focus:border-blue-500"
            />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border-none">
        <div className="hidden print:block">
            <ReportHeader title="تقرير أرصدة الموردين" />
        </div>
        
        {loading ? (
            <div className="p-12 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" size={32} /></div>
        ) : (
            <table className="w-full text-right">
                <thead className="bg-slate-50 text-slate-600 font-bold text-sm border-b border-slate-200">
                    <tr>
                        <th className="p-4">المورد</th>
                        <th className="p-4">رقم الهاتف</th>
                        <th className="p-4 text-center">الرصيد الحالي</th>
                        <th className="p-4 text-center">الحالة</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {filteredData.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-4 font-bold text-slate-800">{item.name}</td>
                            <td className="p-4 text-slate-600 font-mono">{item.phone || '-'}</td>
                            <td className="p-4 text-center font-black text-lg" dir="ltr">
                                {item.balance.toLocaleString()} <span className="text-xs font-normal text-slate-400">{settings.currency}</span>
                            </td>
                            <td className="p-4 text-center">
                                {item.balance > 0 ? (
                                    <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold">مستحق له</span>
                                ) : item.balance < 0 ? (
                                    <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-xs font-bold">مدفوع مقدم</span>
                                ) : (
                                    <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold">خالص</span>
                                )}
                            </td>
                        </tr>
                    ))}
                    {filteredData.length === 0 && (
                        <tr><td colSpan={4} className="p-8 text-center text-slate-400">لا توجد بيانات</td></tr>
                    )}
                </tbody>
                <tfoot className="bg-slate-100 font-bold text-slate-800 border-t-2 border-slate-300">
                    <tr>
                        <td colSpan={2} className="p-4 text-left">الإجمالي المستحق للموردين:</td>
                        <td className="p-4 text-center text-xl" dir="ltr">{totalBalance.toLocaleString()} <span className="text-sm">{settings.currency}</span></td>
                        <td></td>
                    </tr>
                </tfoot>
            </table>
        )}
      </div>
    </div>
  );
};

export default SupplierBalancesReport;