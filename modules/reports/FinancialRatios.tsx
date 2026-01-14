import React, { useMemo } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { Gauge, TrendingUp, Activity, Printer, Download, Target } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import * as XLSX from 'xlsx';

const FinancialRatios = () => {
  const { accounts, getFinancialSummary, entries } = useAccounting();

  const ratios = useMemo(() => {
    // 1. تجميع الأرصدة حسب التصنيف
    let currentAssets = 0;
    let currentLiabilities = 0;
    let inventory = 0;
    let totalAssets = 0;
    let totalEquity = 0;
    let sales = 0;
    let cogs = 0;
    let totalExpenses = 0;
    let netIncome = 0;
    let receivables = 0;

    accounts.forEach(acc => {
        if (acc.isGroup) return;
        const code = acc.code;
        const balance = acc.balance || 0;
        const type = String(acc.type).toLowerCase();

        // 1. تصنيف الأصول (متداولة vs غير متداولة)
        if (type === 'asset' || type === 'ASSET' || type === 'أصول') {
            totalAssets += balance;
            
            // الاعتماد على sub_type إذا وجد، وإلا نستخدم المنطق القديم كاحتياطي
            if (acc.sub_type === 'current') {
                currentAssets += balance;
            } else if (!acc.sub_type && (code.startsWith('10') || !code.startsWith('11'))) {
                // Fallback logic for old accounts
                currentAssets += balance;
            }
        }

        // 2. تصنيف الخصوم
        if (type === 'liability' || type === 'LIABILITY' || type === 'خصوم') {
            if (acc.sub_type === 'current') {
                currentLiabilities += Math.abs(balance);
            } else if (!acc.sub_type && code.startsWith('2')) {
                // Fallback: assume all liabilities starting with 2 are current unless specified
                currentLiabilities += Math.abs(balance);
            }
        }

        // المخزون (103)
        if (code.startsWith('103') || acc.name.includes('مخزون')) inventory += balance;

        // العملاء (102)
        if (code.startsWith('102') || acc.name.includes('عملاء')) receivables += balance;

        // حقوق الملكية
        if (code.startsWith('3') || type === 'equity') totalEquity += Math.abs(balance);

        // المبيعات (4)
        if (code.startsWith('4') || type === 'revenue') sales += Math.abs(balance);

        // المصروفات (5)
        if (code.startsWith('5') || type === 'expense') {
            totalExpenses += balance;
            // تكلفة البضاعة (501)
            if (code.startsWith('501') || acc.name.includes('تكلفة')) cogs += balance;
        }
    });

    // حساب صافي الدخل يدوياً لضمان الدقة
    netIncome = sales - totalExpenses;

    // 2. حساب النسب
    // معالجة القسمة على صفر: إذا كانت الخصوم 0 والأصول موجبة، فالنسبة ممتازة (نضع رقم كبير)
    const currentRatio = currentLiabilities > 0 ? currentAssets / currentLiabilities : (currentAssets > 0 ? 999 : 0);
    const quickRatio = currentLiabilities > 0 ? (currentAssets - inventory) / currentLiabilities : (currentAssets > 0 ? 999 : 0);
    
    const grossProfitMargin = sales > 0 ? ((sales - cogs) / sales) * 100 : 0;
    const netProfitMargin = sales > 0 ? (netIncome / sales) * 100 : 0;
    const roa = totalAssets > 0 ? (netIncome / totalAssets) * 100 : 0; // العائد على الأصول
    const roe = totalEquity > 0 ? (netIncome / totalEquity) * 100 : 0; // العائد على حقوق الملكية
    const debtToEquity = totalEquity > 0 ? (currentLiabilities / totalEquity) : 0;

    // حساب نقطة التعادل
    const variableCosts = cogs; // التكاليف المتغيرة (تكلفة البضاعة)
    const fixedCosts = Math.max(0, totalExpenses - variableCosts); // التكاليف الثابتة (باقي المصروفات)
    
    const contributionMarginRatio = sales > 0 ? (sales - variableCosts) / sales : 0;
    const breakEvenPoint = contributionMarginRatio > 0 ? fixedCosts / contributionMarginRatio : 0;

    return {
        currentRatio,
        quickRatio,
        grossProfitMargin,
        netProfitMargin,
        roa,
        roe,
        debtToEquity,
        workingCapital: currentAssets - currentLiabilities,
        fixedCosts,
        variableCosts,
        breakEvenPoint,
        sales
    };
  }, [accounts]);

  // حساب مقارنة الأداء السنوي
  const currentYear = new Date().getFullYear();
  const prevYear = currentYear - 1;

  const comparisonData = useMemo(() => {
    const calcYearData = (year: number) => {
        let revenue = 0;
        let expenses = 0;
        const start = `${year}-01-01`;
        const end = `${year}-12-31`;

        entries.forEach(entry => {
            if (entry.status === 'posted' && entry.date >= start && entry.date <= end) {
                entry.lines.forEach(line => {
                    const acc = accounts.find(a => a.id === line.accountId);
                    if (!acc) return;
                    
                    const type = (acc.type || '').toLowerCase();
                    const code = acc.code || '';

                    if (type === 'revenue' || type === 'income' || type === 'إيرادات' || code.startsWith('4')) {
                        revenue += (line.credit - line.debit);
                    } else if (type === 'expense' || type === 'expenses' || type === 'مصروفات' || code.startsWith('5')) {
                        expenses += (line.debit - line.credit);
                    }
                });
            }
        });
        return { revenue, expenses, netIncome: revenue - expenses };
    };

    const curr = calcYearData(currentYear);
    const prev = calcYearData(prevYear);

    return [
        { name: 'الإيرادات', [currentYear]: curr.revenue, [prevYear]: prev.revenue },
        { name: 'المصروفات', [currentYear]: curr.expenses, [prevYear]: prev.expenses },
        { name: 'صافي الربح', [currentYear]: curr.netIncome, [prevYear]: prev.netIncome },
    ];
  }, [entries, accounts, currentYear, prevYear]);

  const RatioCard = ({ title, value, suffix = '', ideal, description, color = 'blue' }: any) => (
    <div className={`bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-md transition-all`}>
        <div className={`absolute top-0 right-0 w-1 h-full bg-${color}-500`}></div>
        <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">{title}</h3>
        <div className="flex items-end gap-2 mb-2">
            <span className={`text-3xl font-black text-${color}-600`}>{value.toLocaleString(undefined, {maximumFractionDigits: 2})}</span>
            <span className="text-sm font-bold text-slate-400 mb-1">{suffix}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">المثالي: {ideal}</span>
            {/* مؤشر بسيط للحالة */}
            {value > 0 && (
                <span className={`px-2 py-0.5 rounded-full ${value >= parseFloat(ideal) ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {value >= parseFloat(ideal) || (ideal === '-' && value > 0) ? 'جيد' : 'منخفض'}
                </span>
            )}
        </div>
        <p className="text-xs text-slate-400 mt-3 leading-relaxed border-t border-slate-50 pt-2">{description}</p>
    </div>
  );

  // بيانات وهمية للرسم البياني (للعرض فقط حتى يتم تفعيل التاريخ)
  const chartData = [
    { name: 'يناير', ربحية: 12, سيولة: 1.5 },
    { name: 'فبراير', ربحية: 15, سيولة: 1.4 },
    { name: 'مارس', ربحية: 18, سيولة: 1.6 },
    { name: 'أبريل', ربحية: 14, سيولة: 1.5 },
    { name: 'مايو', ربحية: 20, سيولة: 1.8 },
    { name: 'يونيو', ربحية: 22, سيولة: 1.9 },
  ];

  const handleExportExcel = () => {
    const data = [
        ['التحليل المالي والنسب'],
        ['تاريخ التقرير:', new Date().toLocaleDateString('ar-EG')],
        [],
        ['المؤشر', 'القيمة', 'الوحدة', 'المعدل المثالي'],
        ['النسبة المتداولة (Current Ratio)', ratios.currentRatio.toFixed(2), 'مرة', '1.5 - 2.0'],
        ['النسبة السريعة (Quick Ratio)', ratios.quickRatio.toFixed(2), 'مرة', '1.0'],
        ['رأس المال العامل', ratios.workingCapital.toLocaleString(), 'ج.م', '> 0'],
        ['هامش مجمل الربح', ratios.grossProfitMargin.toFixed(2), '%', '> 20%'],
        ['هامش صافي الربح', ratios.netProfitMargin.toFixed(2), '%', '> 10%'],
        ['العائد على الأصول (ROA)', ratios.roa.toFixed(2), '%', '> 5%'],
        ['العائد على الملكية (ROE)', ratios.roe.toFixed(2), '%', '> 15%'],
        ['نسبة الدين إلى حقوق الملكية', ratios.debtToEquity.toFixed(2), 'مرة', '< 1.0'],
        ['نقطة التعادل (Break-even Point)', ratios.breakEvenPoint.toLocaleString(), 'ج.م', `< ${ratios.sales.toLocaleString()}`],
        ['التكاليف الثابتة', ratios.fixedCosts.toLocaleString(), 'ج.م', '-'],
        ['التكاليف المتغيرة', ratios.variableCosts.toLocaleString(), 'ج.م', '-'],
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Financial Ratios");
    XLSX.writeFile(wb, `Financial_Ratios_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-8 animate-in fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm print:hidden">
        <div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
                <Gauge className="text-indigo-600" size={32} /> التحليل المالي والنسب
            </h1>
            <p className="text-slate-500 mt-1 font-medium">مؤشرات الأداء المالي لتقييم صحة المنشأة واتخاذ القرارات</p>
        </div>
        <div className="flex gap-2">
            <div className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded-xl text-sm font-bold border border-indigo-100 flex items-center">
                تحديث فوري
            </div>
            <button onClick={handleExportExcel} className="bg-emerald-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-lg hover:bg-emerald-700 transition-all">
                <Download size={18}/> تصدير Excel
            </button>
            <button onClick={() => window.print()} className="bg-slate-800 text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-lg hover:bg-slate-700 transition-all">
                <Printer size={18}/> طباعة
            </button>
        </div>
      </div>

      <div className="hidden print:block text-center mb-8 border-b-2 border-slate-800 pb-4">
          <h1 className="text-3xl font-bold mb-2">تقرير التحليل المالي والنسب</h1>
          <p className="text-sm text-slate-500 mt-2">تاريخ الطباعة: {new Date().toLocaleDateString('ar-EG')}</p>
      </div>

      {/* Liquidity Ratios */}
      <div>
          <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Activity className="text-blue-500" /> نسب السيولة (Liquidity)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <RatioCard 
                  title="النسبة المتداولة (Current Ratio)" 
                  value={ratios.currentRatio} 
                  ideal="1.5 - 2.0" 
                  description="قدرة الشركة على سداد التزاماتها قصيرة الأجل باستخدام أصولها المتداولة."
                  color="blue"
              />
              <RatioCard 
                  title="النسبة السريعة (Quick Ratio)" 
                  value={ratios.quickRatio} 
                  ideal="1.0" 
                  description="قدرة السداد الفوري دون الاعتماد على بيع المخزون (الأصول الأكثر سيولة)."
                  color="indigo"
              />
              <RatioCard 
                  title="رأس المال العامل" 
                  value={ratios.workingCapital} 
                  suffix="ج.م"
                  ideal="> 0" 
                  description="السيولة الفائضة المتاحة للعمليات اليومية (الأصول المتداولة - الخصوم المتداولة)."
                  color="emerald"
              />
          </div>
      </div>

      {/* Profitability Ratios */}
      <div>
          <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
              <TrendingUp className="text-emerald-500" /> نسب الربحية (Profitability)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <RatioCard 
                  title="هامش مجمل الربح" 
                  value={ratios.grossProfitMargin} 
                  suffix="%"
                  ideal="> 20%" 
                  description="النسبة المئوية للربح بعد خصم تكلفة البضاعة المباعة فقط."
                  color="emerald"
              />
              <RatioCard 
                  title="هامش صافي الربح" 
                  value={ratios.netProfitMargin} 
                  suffix="%"
                  ideal="> 10%" 
                  description="الربح النهائي لكل جنيه مبيعات بعد خصم كافة المصروفات."
                  color="teal"
              />
              <RatioCard 
                  title="العائد على الأصول (ROA)" 
                  value={ratios.roa} 
                  suffix="%"
                  ideal="> 5%" 
                  description="مدى كفاءة الإدارة في استخدام الأصول لتوليد الأرباح."
                  color="cyan"
              />
              <RatioCard 
                  title="العائد على الملكية (ROE)" 
                  value={ratios.roe} 
                  suffix="%"
                  ideal="> 15%" 
                  description="العائد الذي يحققه المستثمرون على أموالهم المستثمرة."
                  color="sky"
              />
          </div>
      </div>

      {/* Break-even Analysis */}
      <div>
          <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Target className="text-purple-600" /> تحليل نقطة التعادل (Break-even)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <RatioCard 
                  title="التكاليف الثابتة (Fixed Costs)" 
                  value={ratios.fixedCosts} 
                  suffix="ج.م"
                  ideal="-" 
                  description="المصروفات التشغيلية التي لا تتغير مع حجم المبيعات (رواتب، إيجار...)."
                  color="purple"
              />
              <RatioCard 
                  title="التكاليف المتغيرة (Variable Costs)" 
                  value={ratios.variableCosts} 
                  suffix="ج.م"
                  ideal="-" 
                  description="التكاليف المرتبطة مباشرة بالإنتاج والمبيعات (تكلفة البضاعة المباعة)."
                  color="pink"
              />
              <RatioCard 
                  title="نقطة التعادل (Break-even Point)" 
                  value={ratios.breakEvenPoint} 
                  suffix="ج.م"
                  ideal={`< ${ratios.sales.toLocaleString()}`} 
                  description="حجم المبيعات اللازم لتغطية كافة التكاليف (لا ربح ولا خسارة)."
                  color="fuchsia"
              />
          </div>
      </div>

      {/* Year-over-Year Comparison Chart */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
              <TrendingUp className="text-blue-600" /> مقارنة الأداء السنوي ({currentYear} vs {prevYear})
          </h3>
          <div className="h-80 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparisonData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{fill: '#64748b', fontSize: 12}} />
                      <YAxis tick={{fill: '#64748b', fontSize: 12}} tickFormatter={(val) => `${val / 1000}k`} />
                      <Tooltip formatter={(value: number) => value.toLocaleString()} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                      <Legend />
                      <Bar dataKey={currentYear} name={`السنة الحالية (${currentYear})`} fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey={prevYear} name={`السنة السابقة (${prevYear})`} fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  </BarChart>
              </ResponsiveContainer>
          </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="text-lg font-bold text-slate-800 mb-6">تطور هوامش الربحية</h3>
              <div className="h-64 w-full" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="name" tick={{fill: '#64748b', fontSize: 12}} />
                          <YAxis tick={{fill: '#64748b', fontSize: 12}} />
                          <Tooltip />
                          <Legend />
                          <Line type="monotone" dataKey="ربحية" stroke="#10b981" strokeWidth={3} dot={{r: 4}} name="هامش الربح %" />
                      </LineChart>
                  </ResponsiveContainer>
              </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="text-lg font-bold text-slate-800 mb-6">مؤشر السيولة</h3>
              <div className="h-64 w-full" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="name" tick={{fill: '#64748b', fontSize: 12}} />
                          <YAxis tick={{fill: '#64748b', fontSize: 12}} />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="سيولة" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40} name="النسبة المتداولة" />
                      </BarChart>
                  </ResponsiveContainer>
              </div>
          </div>
      </div>
    </div>
  );
};

export default FinancialRatios;
