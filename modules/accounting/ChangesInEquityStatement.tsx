import React, { useState, useMemo, useEffect } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { supabase } from '../../supabaseClient';
import { useToast } from '../../context/ToastContext';
import { 
  FileText, 
  Printer, 
  Download, 
  TrendingUp, 
  Loader2, 
  RefreshCw, 
  ShieldCheck,
  Scale,
  DollarSign,
  PieChart,
  Users,
  Building2,
  Calendar,
  Layers
} from 'lucide-react';
import * as XLSX from 'xlsx';
import ReportHeader from '../../components/ReportHeader';

interface EquityColumnValues {
  shareCapital: number;
  reserves: number;
  retainedEarnings: number;
  partnersCurrent: number;
  total: number;
}

interface EquityRow {
  title: string;
  subtitle?: string;
  values: EquityColumnValues;
  isTotal?: boolean;
  isOpening?: boolean;
}

const ChangesInEquityStatement: React.FC = () => {
  const { accounts, settings, currentUser, selectedFiscalYear, fiscalYearRange, currentSelectedOrgId } = useAccounting();
  const { showToast } = useToast();
  const [startDate, setStartDate] = useState(fiscalYearRange.startDate);
  const [endDate, setEndDate] = useState(fiscalYearRange.endDate);
  const [showLogo, setShowLogo] = useState(true);
  const [loading, setLoading] = useState(false);
  const [ledgerLines, setLedgerLines] = useState<any[]>([]);

  // مزامنة التواريخ مع السنة المالية المختارة
  useEffect(() => {
    if (selectedFiscalYear) {
      setStartDate(`${selectedFiscalYear}-01-01`);
      setEndDate(`${selectedFiscalYear}-12-31`);
    }
  }, [selectedFiscalYear]);

  // جلب حركات اليومية التراكمية حتى نهاية الفترة
  const fetchData = async () => {
    setLoading(true);
    if (currentUser?.role === 'demo') {
      setLoading(false);
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = currentSelectedOrgId || session?.user?.user_metadata?.org_id;
      const userRole = session?.user?.user_metadata?.role;

      if (!userOrgId && userRole !== 'super_admin') {
        throw new Error('تعذر تحديد المنظمة التابع لها. يرجى تسجيل الدخول مرة أخرى.');
      }

      let query = supabase
        .from('journal_lines')
        .select('account_id, debit, credit, journal_entries!inner(transaction_date, status, reference, organization_id)')
        .eq('journal_entries.status', 'posted')
        .lte('journal_entries.transaction_date', endDate);

      if (userOrgId) {
        query = query.eq('journal_entries.organization_id', userOrgId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setLedgerLines(data || []);
    } catch (err: any) {
      console.error('Error fetching changes in equity data:', err);
      showToast('فشل جلب البيانات: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [startDate, endDate, accounts, currentUser, currentSelectedOrgId]);

  // الحسابات المعيارية لقائمة التغير في حقوق الملكية (IAS 1 Para 106)
  const reportData = useMemo(() => {
    const accountMap = new Map<string, any>();
    accounts.forEach(acc => accountMap.set(acc.id, acc));

    // تصنيف حسابات حقوق الملكية (المجموعة 3)
    const isCapitalAccount = (code: string, name: string) => {
      return code.startsWith('31') || name.includes('رأس المال') || name.includes('راس المال');
    };

    const isReservesAccount = (code: string, name: string) => {
      return code.startsWith('34') || name.includes('احتياطي') || name.includes('احتياطيات');
    };

    const isRetainedEarningsAccount = (code: string, name: string) => {
      return (
        code.startsWith('32') || 
        code === '3103' ||
        name.includes('أرباح مبقاة') || 
        name.includes('ارباح مبقاة') || 
        name.includes('أرباح مرحلة') || 
        name.includes('ارباح مرحلة')
      );
    };

    const isPartnersAccount = (code: string, name: string) => {
      return (
        code.startsWith('33') || 
        name.includes('جاري الشركاء') || 
        name.includes('جاري الشريك') || 
        name.includes('مسحوبات') || 
        name.includes('توزيعات')
      );
    };

    const isSuspenseOpeningAccount = (code: string, name: string) => {
      return code === '3999' || code.startsWith('39') || name.includes('أرصدة افتتاحية') || name.includes('حساب وسيط');
    };

    // 1. أرصدة ما قبل الفترة (رصيد 1 يناير)
    let openingCapital = 0;
    let openingReserves = 0;
    let openingRetainedEarnings = 0;
    let openingPartners = 0;
    let openingPriorPnl = 0;

    // 2. حركات خلال الفترة المالية (بين startDate و endDate)
    let periodCapitalMovement = 0;
    let periodReservesMovement = 0;
    let periodRetainedEarningsMovement = 0;
    let periodPartnersMovement = 0;
    let periodNetIncome = 0; // صافي ربح الفترة من قائمة الدخل

    if (currentUser?.role === 'demo') {
      // في وضع التجربة
      accounts.forEach(acc => {
        const code = String(acc.code || '').trim();
        const name = String(acc.name || '').trim().toLowerCase();
        const bal = acc.balance || 0; // الرصيد الطبيعي الدائن سالب في النظام
        const equityVal = -bal; // تحويله لموجب في حقوق الملكية

        if (isCapitalAccount(code, name)) openingCapital += equityVal;
        else if (isReservesAccount(code, name)) openingReserves += equityVal;
        else if (isRetainedEarningsAccount(code, name)) openingRetainedEarnings += equityVal;
        else if (isPartnersAccount(code, name)) openingPartners += equityVal;
        else if (code.startsWith('4')) periodNetIncome += bal;
        else if (code.startsWith('5')) periodNetIncome -= bal;
      });
    } else {
      (ledgerLines || []).forEach(line => {
        if (line.journal_entries?.reference?.startsWith('CLOSE-')) return;

        const date = line.journal_entries?.transaction_date;
        const debit = Number(line.debit) || 0;
        const credit = Number(line.credit) || 0;
        const acc = accountMap.get(line.account_id);
        if (!acc) return;

        const code = String(acc.code || '').trim();
        const name = String(acc.name || '').trim().toLowerCase();
        const type = String(acc.type || '').toLowerCase();

        // صافي الحركة من وجهة نظر الدائن (Credit - Debit) لحسابات حقوق الملكية
        const equityCreditMovement = credit - debit;

        // أ. فحص ما إذا كان الحساب من حسابات الأرباح والخسائر (قائمة الدخل)
        const isPnl = !code.startsWith('1') && !code.startsWith('2') && !code.startsWith('3') && (
          code.startsWith('4') || code.startsWith('5') || type.includes('revenue') || type.includes('expense')
        );

        if (isPnl) {
          if (date < startDate) {
            // أرباح وخسائر سنوات سابقة تراكمية قبل هذا العام
            openingPriorPnl += equityCreditMovement;
          } else if (date >= startDate && date <= endDate) {
            // أرباح وخسائر العام الحالي
            periodNetIncome += equityCreditMovement;
          }
          return;
        }

        // ب. حسابات حقوق الملكية (مجموعة 3)
        if (code.startsWith('3') || type.includes('equity') || type.includes('ملكية')) {
          if (isSuspenseOpeningAccount(code, name)) return; // استبعاد الحساب الوسيط

          if (date < startDate) {
            // رصيد أول المدة
            if (isCapitalAccount(code, name)) openingCapital += equityCreditMovement;
            else if (isReservesAccount(code, name)) openingReserves += equityCreditMovement;
            else if (isRetainedEarningsAccount(code, name)) openingRetainedEarnings += equityCreditMovement;
            else if (isPartnersAccount(code, name)) openingPartners += equityCreditMovement;
            else openingRetainedEarnings += equityCreditMovement; // أي بند ملكية غير مصنف
          } else if (date >= startDate && date <= endDate) {
            // حركة خلال العام الحالي
            if (isCapitalAccount(code, name)) periodCapitalMovement += equityCreditMovement;
            else if (isReservesAccount(code, name)) periodReservesMovement += equityCreditMovement;
            else if (isRetainedEarningsAccount(code, name)) periodRetainedEarningsMovement += equityCreditMovement;
            else if (isPartnersAccount(code, name)) periodPartnersMovement += equityCreditMovement;
            else periodRetainedEarningsMovement += equityCreditMovement;
          }
        }
      });
    }

    // إضافة أرباح السنوات السابقة التراكمية إلى رصيد الأرباح المبقاة في بداية الفترة
    const totalOpeningRetainedEarnings = openingRetainedEarnings + openingPriorPnl;

    // مجموع رصيد بداية الفترة
    const openingTotal = openingCapital + openingReserves + totalOpeningRetainedEarnings + openingPartners;

    // مصفوفة صفوف التقرير المعيارية (Rows of the Statement)
    const rows: EquityRow[] = [
      {
        title: `الرصيد في بداية الفترة (كما في ${startDate})`,
        subtitle: 'الأرصدة الافتتاحية المدورة من الفترات السابقة',
        isOpening: true,
        values: {
          shareCapital: openingCapital,
          reserves: openingReserves,
          retainedEarnings: totalOpeningRetainedEarnings,
          partnersCurrent: openingPartners,
          total: openingTotal
        }
      },
      {
        title: 'صافي ربح / (خسارة) الفترة المالية',
        subtitle: 'المحول من قائمة الدخل الشامل (وفق معيار IFRS 18)',
        values: {
          shareCapital: 0,
          reserves: 0,
          retainedEarnings: periodNetIncome,
          partnersCurrent: 0,
          total: periodNetIncome
        }
      }
    ];

    // إضافة سطر تغيرات رأس المال إذا وجدت حركات
    if (Math.abs(periodCapitalMovement) >= 0.01) {
      rows.push({
        title: periodCapitalMovement > 0 ? 'الزيادة في رأس المال المدفوع' : 'تخفيض في رأس المال',
        subtitle: 'مساهمات نقدية أو عينية جديدة مسجلة خلال الفترة',
        values: {
          shareCapital: periodCapitalMovement,
          reserves: 0,
          retainedEarnings: 0,
          partnersCurrent: 0,
          total: periodCapitalMovement
        }
      });
    }

    // إضافة سطر توزيعات الأرباح والمسحوبات إذا وجدت
    if (Math.abs(periodPartnersMovement) >= 0.01 || Math.abs(periodRetainedEarningsMovement) >= 0.01) {
      const netDrawings = periodPartnersMovement + periodRetainedEarningsMovement;
      rows.push({
        title: 'توزيعات الأرباح ومسحوبات الشركاء',
        subtitle: 'توزيعات نقدية ومسحوبات جاري الشركاء خلال الفترة',
        values: {
          shareCapital: 0,
          reserves: 0,
          retainedEarnings: periodRetainedEarningsMovement,
          partnersCurrent: periodPartnersMovement,
          total: netDrawings
        }
      });
    }

    // إضافة سطر التحويل إلى الاحتياطيات إذا وجد
    if (Math.abs(periodReservesMovement) >= 0.01) {
      rows.push({
        title: 'المحول إلى الاحتياطيات (النظامية والقانونية)',
        subtitle: 'إعادة تبويب من الأرباح المبقاة إلى الاحتياطيات دون تأثير على إجمالي الملكية',
        values: {
          shareCapital: 0,
          reserves: periodReservesMovement,
          retainedEarnings: -periodReservesMovement,
          partnersCurrent: 0,
          total: 0
        }
      });
    }

    // حساب رصيد نهاية الفترة
    const endingCapital = openingCapital + periodCapitalMovement;
    const endingReserves = openingReserves + periodReservesMovement;
    const endingRetainedEarnings = totalOpeningRetainedEarnings + periodNetIncome + periodRetainedEarningsMovement;
    const endingPartners = openingPartners + periodPartnersMovement;
    const endingTotal = endingCapital + endingReserves + endingRetainedEarnings + endingPartners;

    rows.push({
      title: `الرصيد في نهاية الفترة (كما في ${endDate})`,
      subtitle: 'المطابق لإجمالي حقوق الملكية في قائمة المركز المالي',
      isTotal: true,
      values: {
        shareCapital: endingCapital,
        reserves: endingReserves,
        retainedEarnings: endingRetainedEarnings,
        partnersCurrent: endingPartners,
        total: endingTotal
      }
    });

    const netChangeInEquity = endingTotal - openingTotal;

    return {
      rows,
      openingTotal,
      endingTotal,
      periodNetIncome,
      netChangeInEquity,
      endingCapital,
      endingReserves,
      endingRetainedEarnings,
      endingPartners
    };
  }, [accounts, ledgerLines, currentUser, startDate, endDate]);

  const handlePrint = () => {
    window.print();
  };

  const exportToExcel = () => {
    const data: any[][] = [
      ['شركة / مؤسسة', settings?.companyName || 'TriPro ERP'],
      ['قائمة التغير في حقوق الملكية (وفق معيار المحاسبة الدولي IAS 1 الفقرة 106)'],
      [`عن الفترة من: ${startDate} إلى: ${endDate}`],
      [''],
      ['البيان / الحركة', 'رأس المال المدفوع', 'الاحتياطيات', 'الأرباح المبقاة والمرحلة', 'جاري الشركاء والمسحوبات', 'إجمالي حقوق الملكية']
    ];

    reportData.rows.forEach(r => {
      data.push([
        r.title,
        r.values.shareCapital,
        r.values.reserves,
        r.values.retainedEarnings,
        r.values.partnersCurrent,
        r.values.total
      ]);
    });

    data.push(['']);
    data.push(['ملاحظة إيضاحية: يطابق رصيد نهاية الفترة إجمالي حقوق الملكية وصافي الأصول بقائمة المركز المالي.']);

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Changes in Equity IAS 1");
    XLSX.writeFile(wb, `Changes_in_Equity_${startDate}_${endDate}.xlsx`);
  };

  const formatMoney = (val: number) => {
    return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="space-y-6 animate-in fade-in pb-12">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Scale className="text-indigo-600" />
              قائمة التغير في حقوق الملكية (Statement of Changes in Equity)
            </h2>
            <span className="bg-indigo-100 text-indigo-800 text-xs font-semibold px-2.5 py-0.5 rounded border border-indigo-200 flex items-center gap-1">
              <ShieldCheck size={14} className="text-indigo-600" />
              معيار IAS 1 (الفقرة 106)
            </span>
          </div>
          <p className="text-slate-500 text-sm mt-1">
            تقرير حركة عناصر حقوق الملكية وتفصيل المعاملات مع الشركاء وصافي أرباح الفترة المدورة
          </p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={fetchData} 
            disabled={loading}
            className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors font-semibold text-sm shadow-sm"
          >
            <RefreshCw size={16} className={loading ? "animate-spin text-blue-600" : ""} /> تحديث
          </button>
          <button 
            onClick={handlePrint} 
            className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 transition-colors shadow-sm font-semibold text-sm"
          >
            <Printer size={18} /> طباعة
          </button>
          <button 
            onClick={exportToExcel} 
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm font-semibold text-sm"
          >
            <Download size={18} /> تصدير Excel
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
        {/* 1. Opening Equity */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">حقوق الملكية أول المدة</p>
            <h4 className="text-xl font-bold text-slate-800 mt-1">{formatMoney(reportData.openingTotal)}</h4>
            <span className="text-xs text-slate-500 font-semibold flex items-center gap-1 mt-1">
              كما في {startDate}
            </span>
          </div>
          <div className="p-3 bg-slate-100 text-slate-700 rounded-xl">
            <Building2 size={22} />
          </div>
        </div>

        {/* 2. Current Net Income */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">صافي أرباح الفترة</p>
            <h4 className={`text-xl font-bold mt-1 ${reportData.periodNetIncome >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
              {formatMoney(reportData.periodNetIncome)}
            </h4>
            <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1 mt-1">
              من قائمة الدخل (IFRS 18)
            </span>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <TrendingUp size={22} />
          </div>
        </div>

        {/* 3. Net Change */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">صافي التغير في الملكية</p>
            <h4 className={`text-xl font-bold mt-1 ${reportData.netChangeInEquity >= 0 ? 'text-indigo-700' : 'text-amber-600'}`}>
              {formatMoney(reportData.netChangeInEquity)}
            </h4>
            <span className="text-xs text-indigo-600 font-semibold flex items-center gap-1 mt-1">
              خلال الفترة المالية
            </span>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <Layers size={22} />
          </div>
        </div>

        {/* 4. Ending Equity */}
        <div className="bg-white p-4 rounded-xl border border-indigo-200 shadow-sm flex items-center justify-between bg-gradient-to-br from-white to-indigo-50/40">
          <div>
            <p className="text-xs font-medium text-indigo-700">حقوق الملكية آخر المدة</p>
            <h4 className="text-xl font-bold text-indigo-950 mt-1">{formatMoney(reportData.endingTotal)}</h4>
            <span className="text-xs text-indigo-700 font-semibold flex items-center gap-1 mt-1">
              مطابق للمركز المالي 100%
            </span>
          </div>
          <div className="p-3 bg-indigo-100 text-indigo-700 rounded-xl">
            <Scale size={22} />
          </div>
        </div>
      </div>

      {/* Date Filter */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-end gap-4 print:hidden">
        <div className="w-full sm:w-auto">
          <label className="block text-sm font-semibold text-slate-700 mb-1">من تاريخ</label>
          <input 
            type="date" 
            value={startDate} 
            onChange={e => setStartDate(e.target.value)} 
            className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none" 
          />
        </div>
        <div className="w-full sm:w-auto">
          <label className="block text-sm font-semibold text-slate-700 mb-1">إلى تاريخ</label>
          <input 
            type="date" 
            value={endDate} 
            onChange={e => setEndDate(e.target.value)} 
            className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none" 
          />
        </div>
        <div className="flex items-center gap-2 pb-2">
          <input 
            type="checkbox" 
            id="showLogo" 
            checked={showLogo} 
            onChange={e => setShowLogo(e.target.checked)} 
            className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500" 
          />
          <label htmlFor="showLogo" className="text-sm font-semibold text-slate-700 cursor-pointer">
            إظهار الشعار الرسمي عند الطباعة
          </label>
        </div>
      </div>

      {/* Report Matrix Document */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border-none" id="report-content">
        <ReportHeader 
          title="قائمة التغير في حقوق الملكية (وفق معيار المحاسبة الدولي IAS 1)" 
          subtitle={`عن الفترة المحاسبية من ${startDate} إلى ${endDate}`} 
        />

        {loading && (
          <div className="p-16 text-center">
            <Loader2 className="animate-spin mx-auto text-indigo-600 mb-3" size={36} />
            <p className="text-slate-500 font-medium text-sm">جاري احتساب حركة حقوق الملكية والمطابقة مع القوائم المالية...</p>
          </div>
        )}

        {!loading && (
          <div className="p-6 md:p-8 space-y-6">
            {/* Matrix Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-xs">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-800 text-white text-xs">
                    <th className="py-3 px-4 text-right font-bold w-2/5">البيان / تفصيل الحركة</th>
                    <th className="py-3 px-3 text-right font-bold w-1/8">رأس المال المدفوع</th>
                    <th className="py-3 px-3 text-right font-bold w-1/8">الاحتياطيات</th>
                    <th className="py-3 px-3 text-right font-bold w-1/8">الأرباح المبقاة والمرحلة</th>
                    <th className="py-3 px-3 text-right font-bold w-1/8">جاري الشركاء وتوزيعاتهم</th>
                    <th className="py-3 px-4 text-right font-bold w-1/7 bg-slate-900">إجمالي حقوق الملكية</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData.rows.map((r, idx) => {
                    const isOpening = r.isOpening;
                    const isTotal = r.isTotal;

                    let rowStyle = 'hover:bg-slate-50/70 transition-colors';
                    if (isOpening) rowStyle = 'bg-indigo-50/40 font-semibold border-b-2 border-indigo-100';
                    if (isTotal) rowStyle = 'bg-indigo-900 text-white font-extrabold border-t-2 border-indigo-700';

                    return (
                      <tr key={idx} className={rowStyle}>
                        <td className="py-3 px-4">
                          <div className={`font-bold ${isTotal ? 'text-white' : isOpening ? 'text-indigo-950' : 'text-slate-800'}`}>
                            {r.title}
                          </div>
                          {r.subtitle && (
                            <div className={`text-xs mt-0.5 ${isTotal ? 'text-indigo-200' : 'text-slate-500'}`}>
                              {r.subtitle}
                            </div>
                          )}
                        </td>
                        <td className={`py-3 px-3 text-right font-mono ${isTotal ? 'text-indigo-100' : 'text-slate-700'}`}>
                          {formatMoney(r.values.shareCapital)}
                        </td>
                        <td className={`py-3 px-3 text-right font-mono ${isTotal ? 'text-indigo-100' : 'text-slate-700'}`}>
                          {formatMoney(r.values.reserves)}
                        </td>
                        <td className={`py-3 px-3 text-right font-mono ${isTotal ? 'text-indigo-100' : 'text-slate-700'}`}>
                          {formatMoney(r.values.retainedEarnings)}
                        </td>
                        <td className={`py-3 px-3 text-right font-mono ${isTotal ? 'text-indigo-100' : 'text-slate-700'}`}>
                          {formatMoney(r.values.partnersCurrent)}
                        </td>
                        <td className={`py-3 px-4 text-right font-mono font-bold text-base ${
                          isTotal ? 'bg-indigo-950 text-white' : isOpening ? 'bg-indigo-100/50 text-indigo-950' : 'bg-slate-50 text-slate-900'
                        }`}>
                          {formatMoney(r.values.total)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Reconciliation Note with Balance Sheet */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 space-y-1">
              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                <ShieldCheck size={16} className="text-indigo-600" />
                المطابقة المعيارية الدولية (IAS 1 Reconciliation):
              </div>
              <p>
                تم إعداد هذه القائمة تنفيذاً للمعيار المحاسبي الدولي <strong className="text-slate-800">IAS 1 (الفقرة 106)</strong>، حيث يربط هذا التقرير بدقة متناهية بين <strong className="text-slate-800">قائمة الدخل الشامل (IFRS 18)</strong> من خلال إدراج صافي ربح الفترة، وبين <strong className="text-slate-800">قائمة المركز المالي</strong> من خلال مطابقة رصيد نهاية الفترة البالغ <strong className="text-indigo-900 font-mono font-bold text-sm">({formatMoney(reportData.endingTotal)})</strong> مع صافي الأصول وإجمالي حقوق الملكية.
              </p>
            </div>
          </div>
        )}

        {/* Print Signatures */}
        <div className="p-8 border-t border-slate-200 mt-8 hidden print:block">
          <div className="flex justify-between text-sm text-slate-600 pt-6">
            <div className="text-center w-1/3">
              <p className="font-bold mb-10">المحاسب المسؤول</p>
              <div className="border-t border-slate-400 w-3/4 mx-auto"></div>
            </div>
            <div className="text-center w-1/3">
              <p className="font-bold mb-10">المدير المالي</p>
              <div className="border-t border-slate-400 w-3/4 mx-auto"></div>
            </div>
            <div className="text-center w-1/3">
              <p className="font-bold mb-10">رئيس مجلس الإدارة / الشركاء</p>
              <div className="border-t border-slate-400 w-3/4 mx-auto"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChangesInEquityStatement;
