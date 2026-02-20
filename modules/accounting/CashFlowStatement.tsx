import React, { useState, useEffect } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { supabase } from '../../supabaseClient';
import { Banknote, Filter, Printer, Loader2, Download } from 'lucide-react';

type Account = {
  id: string;
  code: string;
  name: string;
  type: string;
};

type CashFlowRow = {
  label: string;
  amount: number;
  isTotal?: boolean;
};

const CashFlowStatement = () => {
  const { currentUser } = useAccounting();
  const [operatingRows, setOperatingRows] = useState<CashFlowRow[]>([]);
  const [investingRows, setInvestingRows] = useState<CashFlowRow[]>([]);
  const [financingRows, setInvestingRowsFinancing] = useState<CashFlowRow[]>([]);
  const [netCashFlow, setNetCashFlow] = useState(0);
  const [openingCashBalance, setOpeningCashBalance] = useState(0);
  const [closingCashBalance, setClosingCashBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const fetchCashFlow = async () => {
    setLoading(true);
    if (currentUser?.role === 'demo') {
        setOperatingRows([]);
        setInvestingRows([]);
        setInvestingRowsFinancing([]);
        setNetCashFlow(0);
        setOpeningCashBalance(0);
        setClosingCashBalance(0);
        setLoading(false);
        return;
    }

    try {
      // 1. جلب الحسابات
      const { data: accounts, error: accountsError } = await supabase
        .from('accounts')
        .select('id, code, name, type')
        .order('code');

      if (accountsError) throw accountsError;

      // 2. جلب الحركات المرحلة خلال الفترة
      const { data: lines, error: linesError } = await supabase
        .from('journal_lines')
        .select('account_id, debit, credit, journal_entries!inner(status, transaction_date)')
        .eq('journal_entries.status', 'posted')
        .gte('journal_entries.transaction_date', startDate)
        .lte('journal_entries.transaction_date', endDate);

      if (linesError) throw linesError;

      // 3. تجميع الحركات لكل حساب (صافي الحركة للفترة)
      const movements: Record<string, number> = {};
      lines?.forEach(line => {
        const current = movements[line.account_id] || 0;
        // الحركة = مدين - دائن
        movements[line.account_id] = current + (line.debit - line.credit);
      });

      // 4. حساب صافي الدخل (Net Income)
      let netIncome = 0;
      accounts.forEach(acc => {
        const movement = movements[acc.id] || 0;
        const type = acc.type ? acc.type.toLowerCase().trim() : '';
        const code = acc.code ? acc.code.toString().trim() : '';
        const firstDigit = code.charAt(0);

        // الإيرادات (4) والمصروفات (5)
        if (firstDigit === '4' || type.includes('income')) {
            netIncome -= movement; // الإيراد دائن (سالب) -> نطرحه ليصبح موجب
        } else if (firstDigit === '5' || type.includes('expense')) {
            netIncome -= movement; // المصروف مدين (موجب) -> نطرحه ليصبح سالب
        }
      });

      // 5. تصنيف التدفقات (Operating, Investing, Financing)
      const operating: CashFlowRow[] = [{ label: 'صافي الربح قبل الضرائب', amount: netIncome, isTotal: true }];
      const investing: CashFlowRow[] = [];
      const financing: CashFlowRow[] = [];

      accounts.forEach(acc => {
        const movement = movements[acc.id] || 0;
        if (Math.abs(movement) < 0.01) return;

        const type = acc.type ? acc.type.toLowerCase().trim() : '';
        const code = acc.code ? acc.code.toString().trim() : '';
        const name = acc.name.toLowerCase();
        const firstDigit = code.charAt(0);

        // استبعاد حسابات النقدية والبنوك من الأنشطة (لأنها النتيجة النهائية)
        const isCash = type.includes('cash') || type.includes('bank') || 
                       name.includes('صندوق') || name.includes('خزينة') || name.includes('نقد') || name.includes('بنك') ||
                       code.startsWith('123') || code.startsWith('1101') || code.startsWith('101');

        if (isCash) return;

        // تحسين منطق تحديد الأصول الثابتة
        const fixedAssetKeywords = ['سيارات', 'cars', 'vehicles', 'مباني', 'buildings', 'أراضي', 'land', 'أثاث', 'furniture', 'معدات', 'equipment', 'أجهزة', 'devices', 'أصول ثابتة', 'fixed assets', 'machinery', 'آلات', 'تجهيزات'];
        const currentAssetKeywords = ['ضريبة', 'vat', 'tax', 'سلف', 'advances', 'عهدة', 'custody', 'مخزون', 'inventory', 'stock', 'عملاء', 'customers', 'receivable', 'أرصدة مدينة'];

        const hasFixedKeyword = fixedAssetKeywords.some(k => name.includes(k));
        const hasCurrentKeyword = currentAssetKeywords.some(k => name.includes(k));

        let isFixedAsset = type.includes('fixed') || type.includes('non-current') || type.includes('أصول ثابتة');
        
        // Fix: Ensure we don't classify expenses (5) or revenues (4) as assets based on keywords
        if (!isFixedAsset && firstDigit === '1') {
             if (code.startsWith('12') && !hasCurrentKeyword) isFixedAsset = true;
             else if (hasFixedKeyword) isFixedAsset = true;
        }
        if (hasCurrentKeyword) isFixedAsset = false;

        // تسويات البنود غير النقدية (تضاف لصافي الربح)
        if (type.includes('depreciation') || type.includes('إهلاك') || acc.name.includes('إهلاك')) {
             // مصروف الإهلاك (مدين) يقلل الربح ولكنه غير نقدي، لذا نضيفه (نعكس إشارته ليصبح موجب)
             // مجمع الإهلاك (دائن) يزيد، وهو ما يعكس مصروف الإهلاك
             if (firstDigit === '5') { // مصروف
                 operating.push({ label: `إهلاك ${acc.name}`, amount: movement }); // المصروف موجب هنا لأنه مدين، ونريد إضافته
             }
        }
        // الأصول الثابتة (Fixed Assets) - أنشطة استثمارية
        else if (isFixedAsset) {
            investing.push({ label: `شراء/بيع ${acc.name}`, amount: -movement });
        }
        // الأصول المتداولة (Current Assets) - عادة تبدأ بـ 11 أو 12
        // زيادة الأصول المتداولة (مدين) = نقص في النقدية (سالب)
        else if (firstDigit === '1' && !isFixedAsset) {
            operating.push({ label: `(زيادة)/نقص في ${acc.name}`, amount: -movement });
        }
        // الخصوم المتداولة (Current Liabilities) - عادة تبدأ بـ 21
        // زيادة الخصوم المتداولة (دائن) = زيادة في النقدية (موجب)
        else if (firstDigit === '2' && !type.includes('long')) {
            operating.push({ label: `زيادة/(نقص) في ${acc.name}`, amount: -movement }); // الحركة الدائنة سالبة، نعكسها لتصبح موجبة
        }
        // حقوق الملكية والخصوم طويلة الأجل - أنشطة تمويلية
        else if ((firstDigit === '3' && !type.includes('retained')) || type.includes('equity') || type.includes('long')) {
            financing.push({ label: `التغير في ${acc.name}`, amount: -movement });
        }
      });

      setOperatingRows(operating);
      setInvestingRows(investing);
      setInvestingRowsFinancing(financing);

      // 6. حساب رصيد النقدية أول المدة
      const cashAccountIds = accounts.filter(acc => {
          const code = String(acc.code || '');
          const name = String(acc.name || '');
          const type = String(acc.type || '').toLowerCase();
          if (type.includes('liability') || type.includes('equity') || type.includes('revenue') || type.includes('expense')) return false;
          return code.startsWith('123') || code.startsWith('1101') || code.startsWith('101') || name.includes('صندوق') || name.includes('بنك') || name.includes('نقد');
      }).map(a => a.id);

      let openingCash = 0;
      if (cashAccountIds.length > 0) {
          const { data: openingData } = await supabase
              .from('journal_lines')
              .select('debit, credit, journal_entries!inner(status, transaction_date)')
              .in('account_id', cashAccountIds)
              .eq('journal_entries.status', 'posted')
              .lt('journal_entries.transaction_date', startDate);
          
          if (openingData) openingCash = openingData.reduce((sum, line) => sum + (line.debit - line.credit), 0);
      }

      const totalOperating = operating.reduce((sum, r) => sum + r.amount, 0);
      const totalInvesting = investing.reduce((sum, r) => sum + r.amount, 0);
      const totalFinancing = financing.reduce((sum, r) => sum + r.amount, 0);
      
      const netChange = totalOperating + totalInvesting + totalFinancing;
      setNetCashFlow(netChange);
      setOpeningCashBalance(openingCash);
      setClosingCashBalance(openingCash + netChange);

    } catch (error: any) {
      alert('فشل تحميل قائمة التدفقات النقدية: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCashFlow();
  }, []);

  const totalOperating = operatingRows.reduce((sum, r) => sum + r.amount, 0);
  const totalInvesting = investingRows.reduce((sum, r) => sum + r.amount, 0);
  const totalFinancing = financingRows.reduce((sum, r) => sum + r.amount, 0);

  const handleExportExcel = () => {
    const headers = ['البيان', 'المبلغ'];
    
    const csvRows: string[][] = [];

    // الأنشطة التشغيلية
    csvRows.push(['الأنشطة التشغيلية', '']);
    operatingRows.forEach(row => csvRows.push([`"${row.label}"`, row.amount.toFixed(2)]));
    csvRows.push(['صافي النقد من الأنشطة التشغيلية', totalOperating.toFixed(2)]);
    csvRows.push(['', '']); // سطر فارغ

    // الأنشطة الاستثمارية
    csvRows.push(['الأنشطة الاستثمارية', '']);
    investingRows.forEach(row => csvRows.push([`"${row.label}"`, row.amount.toFixed(2)]));
    csvRows.push(['صافي النقد من الأنشطة الاستثمارية', totalInvesting.toFixed(2)]);
    csvRows.push(['', '']);

    // الأنشطة التمويلية
    csvRows.push(['الأنشطة التمويلية', '']);
    financingRows.forEach(row => csvRows.push([`"${row.label}"`, row.amount.toFixed(2)]));
    csvRows.push(['صافي النقد من الأنشطة التمويلية', totalFinancing.toFixed(2)]);
    csvRows.push(['', '']);

    // صافي التغير
    csvRows.push(['صافي التغير في النقدية', netCashFlow.toFixed(2)]);
    csvRows.push(['رصيد النقدية أول المدة', openingCashBalance.toFixed(2)]);
    csvRows.push(['رصيد النقدية آخر المدة', closingCashBalance.toFixed(2)]);

    const csvContent = [headers.join(','), ...csvRows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `cash_flow_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-6 bg-white rounded-xl shadow-sm border border-slate-200 min-h-[80vh]">
      <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4 no-print">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Banknote className="text-blue-600" />
          قائمة التدفقات النقدية
        </h1>
        <div className="flex gap-2">
            <button onClick={handleExportExcel} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 font-bold text-sm">
                <Download size={16} /> تصدير Excel
            </button>
            <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-100 text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-200 font-bold text-sm">
                <Printer size={16} /> طباعة
            </button>
        </div>
      </div>

      <div className="flex items-end gap-4 mb-8 bg-slate-50 p-4 rounded-xl border border-slate-200 no-print">
        <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">من تاريخ</label>
            <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
            />
        </div>
        <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">إلى تاريخ</label>
            <input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
            />
        </div>
        <button 
            onClick={fetchCashFlow}
            disabled={loading}
            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 font-bold shadow-md disabled:opacity-50"
        >
            {loading ? <Loader2 className="animate-spin" /> : <Filter size={18} />}
            تحديث التقرير
        </button>
      </div>

      {/* ترويسة التقرير للطباعة */}
      <div className="hidden print:block text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">قائمة التدفقات النقدية</h2>
        <p>عن الفترة من {startDate} إلى {endDate}</p>
      </div>

      <div className="space-y-8 max-w-4xl mx-auto">
        
        {/* الأنشطة التشغيلية */}
        <div>
            <h3 className="text-lg font-bold text-slate-800 mb-3 border-b-2 border-blue-500 pb-2">التدفقات النقدية من الأنشطة التشغيلية</h3>
            <table className="w-full text-sm text-right">
                <tbody>
                    {operatingRows.map((row, index) => (
                        <tr key={index} className={`border-b border-slate-50 hover:bg-slate-50 ${row.isTotal ? 'font-bold bg-slate-50' : ''}`}>
                            <td className="py-2">{row.label}</td>
                            <td className="py-2 text-left font-mono">{row.amount.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                        </tr>
                    ))}
                    <tr className="font-bold bg-blue-50">
                        <td className="py-3 pr-2">صافي النقد من الأنشطة التشغيلية</td>
                        <td className="py-3 pl-2 text-left font-mono text-lg">{totalOperating.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                    </tr>
                </tbody>
            </table>
        </div>

        {/* الأنشطة الاستثمارية */}
        <div>
            <h3 className="text-lg font-bold text-slate-800 mb-3 border-b-2 border-amber-500 pb-2">التدفقات النقدية من الأنشطة الاستثمارية</h3>
            <table className="w-full text-sm text-right">
                <tbody>
                    {investingRows.length > 0 ? investingRows.map((row, index) => (
                        <tr key={index} className="border-b border-slate-50 hover:bg-slate-50">
                            <td className="py-2">{row.label}</td>
                            <td className="py-2 text-left font-mono">{row.amount.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                        </tr>
                    )) : (
                        <tr><td colSpan={2} className="py-2 text-center text-slate-400">لا توجد حركات استثمارية</td></tr>
                    )}
                    <tr className="font-bold bg-amber-50">
                        <td className="py-3 pr-2">صافي النقد من الأنشطة الاستثمارية</td>
                        <td className="py-3 pl-2 text-left font-mono text-lg">{totalInvesting.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                    </tr>
                </tbody>
            </table>
        </div>

        {/* الأنشطة التمويلية */}
        <div>
            <h3 className="text-lg font-bold text-slate-800 mb-3 border-b-2 border-emerald-500 pb-2">التدفقات النقدية من الأنشطة التمويلية</h3>
            <table className="w-full text-sm text-right">
                <tbody>
                    {financingRows.length > 0 ? financingRows.map((row, index) => (
                        <tr key={index} className="border-b border-slate-50 hover:bg-slate-50">
                            <td className="py-2">{row.label}</td>
                            <td className="py-2 text-left font-mono">{row.amount.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                        </tr>
                    )) : (
                        <tr><td colSpan={2} className="py-2 text-center text-slate-400">لا توجد حركات تمويلية</td></tr>
                    )}
                    <tr className="font-bold bg-emerald-50">
                        <td className="py-3 pr-2">صافي النقد من الأنشطة التمويلية</td>
                        <td className="py-3 pl-2 text-left font-mono text-lg">{totalFinancing.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                    </tr>
                </tbody>
            </table>
        </div>

        {/* صافي التغير في النقدية */}
        <div className={`mt-8 p-6 rounded-xl border-2 text-center ${netCashFlow >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
            <h3 className="text-xl font-bold text-slate-700 mb-2">صافي التغير في النقدية وما في حكمها</h3>
            <div className={`text-4xl font-black font-mono ${netCashFlow >= 0 ? 'text-emerald-600' : 'text-red-600'}`} dir="ltr">
                {netCashFlow.toLocaleString('en-US', {minimumFractionDigits: 2})}
            </div>
            
            <div className="grid grid-cols-2 gap-4 mt-6 border-t border-slate-200/50 pt-6">
                <div>
                    <p className="text-sm font-bold text-slate-500 mb-1">رصيد النقدية أول المدة</p>
                    <p className="text-xl font-bold text-slate-800 font-mono">{openingCashBalance.toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
                </div>
                <div>
                    <p className="text-sm font-bold text-slate-500 mb-1">رصيد النقدية آخر المدة</p>
                    <p className="text-xl font-bold text-blue-600 font-mono">{closingCashBalance.toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
                </div>
            </div>
        </div>

      </div>
    </div>
  );
};

export default CashFlowStatement;
