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
      const { data: { user } } = await supabase.auth.getUser();
      const userOrgId = user?.user_metadata?.org_id;

      if (!userOrgId) return;

      const filter = { organization_id: userOrgId };

      // 🚀 جلب أرصدة الموردين مباشرة من محرك قاعدة البيانات فائق السرعة
      const { data: rpcData, error: rpcError } = await (supabase.rpc as any)('get_all_supplier_balances_fast', {
        p_org_id: userOrgId,
        p_search: null,
        p_limit: 10000,
        p_offset: 0
      });

      if (!rpcError && Array.isArray(rpcData)) {
        const balances = rpcData.map((row: any) => ({
          id: row.supplier_id,
          name: row.supplier_name,
          phone: row.phone,
          balance: Number(row.balance || 0)
        })).sort((a: any, b: any) => b.balance - a.balance);
        setReportData(balances);
        return;
      }

      // احتياطي أمان (Fallback) عبر خدمة الأرصدة الموحدة
      const { fetchAllSupplierBalances } = await import('../../services/balanceService');
      const { data: suppliers } = await supabase.from('suppliers').select('id, name, phone').match(filter).is('deleted_at', null);
      const balancesMap = await fetchAllSupplierBalances(userOrgId);

      const balances = (suppliers || []).map(s => ({
        id: s.id,
        name: s.name,
        phone: s.phone,
        balance: balancesMap.get(s.id) || 0
      })).sort((a, b) => b.balance - a.balance);

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