import React from 'react';
import { Link } from 'react-router-dom';
import { 
    PieChart, TrendingUp, Landmark, Scale, Banknote, 
    FileText, BarChartBig, ArrowRight 
} from 'lucide-react';

const Reports = () => {
  const reports = [
    {
      title: 'قائمة الدخل',
      description: 'تقرير الأرباح والخسائر عن فترة محددة',
      icon: <TrendingUp size={32} className="text-emerald-600" />,
      path: '/income-statement',
      color: 'bg-emerald-50 border-emerald-100'
    },
    {
      title: 'الميزانية العمومية',
      description: 'المركز المالي للمنشأة (أصول، خصوم، حقوق ملكية)',
      icon: <Landmark size={32} className="text-blue-600" />,
      path: '/balance-sheet',
      color: 'bg-blue-50 border-blue-100'
    },
    {
      title: 'ميزان المراجعة',
      description: 'أرصدة جميع الحسابات للتأكد من توازن القيد المزدوج',
      icon: <Scale size={32} className="text-purple-600" />,
      path: '/trial-balance',
      color: 'bg-purple-50 border-purple-100'
    },
    {
      title: 'التدفقات النقدية',
      description: 'حركة السيولة النقدية (تشغيلية، استثمارية، تمويلية)',
      icon: <Banknote size={32} className="text-amber-600" />,
      path: '/cash-flow',
      color: 'bg-amber-50 border-amber-100'
    },
    {
      title: 'تقارير المبيعات',
      description: 'تحليل المبيعات حسب العميل، الصنف، والفترة',
      icon: <BarChartBig size={32} className="text-indigo-600" />,
      path: '/sales-reports',
      color: 'bg-indigo-50 border-indigo-100'
    },
    {
      title: 'تقارير المشتريات',
      description: 'تحليل المشتريات حسب المورد، الصنف، والفترة',
      icon: <BarChartBig size={32} className="text-blue-600" />,
      path: '/purchase-reports',
      color: 'bg-blue-50 border-blue-100'
    },
    {
      title: 'كشوف الحسابات',
      description: 'كشف حساب تفصيلي للعملاء والموردين',
      icon: <FileText size={32} className="text-slate-600" />,
      path: '/customer-statement', // يمكن توجيهه لصفحة اختيار نوع الكشف لاحقاً
      color: 'bg-slate-50 border-slate-100'
    }
  ];

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="flex items-center gap-3 mb-8">
        <PieChart className="text-blue-600 w-8 h-8" />
        <div>
            <h1 className="text-2xl font-black text-slate-800">التقارير المالية والإدارية</h1>
            <p className="text-slate-500 font-medium">مركز التقارير الموحد للوصول السريع لكافة بيانات المنشأة</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {reports.map((report, index) => (
          <Link 
            key={index} 
            to={report.path}
            className={`group p-6 rounded-2xl border-2 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 flex flex-col justify-between h-48 ${report.color}`}
          >
            <div className="flex justify-between items-start">
                <div className="p-3 bg-white rounded-xl shadow-sm group-hover:scale-110 transition-transform">
                    {report.icon}
                </div>
                <ArrowRight className="text-slate-400 group-hover:text-slate-600 transition-colors" />
            </div>
            
            <div>
                <h3 className="text-lg font-black text-slate-800 mb-1 group-hover:text-blue-700 transition-colors">{report.title}</h3>
                <p className="text-sm text-slate-500 font-medium leading-relaxed">{report.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default Reports;