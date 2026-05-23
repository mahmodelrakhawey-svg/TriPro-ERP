import React from 'react';
import { Link } from 'react-router-dom';
import { 
    Users, FileText, Banknote, ArrowRight, PieChart
} from 'lucide-react';

const EmployeeReports = () => {
  const reports = [
    {
      title: 'كشف الرواتب الشهرية',
      description: 'تقرير تفصيلي بمسيرات الرواتب والمدفوعات الشهرية',
      icon: <FileText size={32} className="text-emerald-600" />,
      path: '/payroll-report',
      color: 'bg-emerald-50 border-emerald-100'
    },
    {
      title: 'كشف حساب موظف',
      description: 'حركة الحساب المالي للموظف (رواتب، سلف، خصومات)',
      icon: <Users size={32} className="text-blue-600" />,
      path: '/employee-statement',
      color: 'bg-blue-50 border-blue-100'
    },
    {
      title: 'تقرير السلف والقروض',
      description: 'متابعة سلف الموظفين والأرصدة المتبقية',
      icon: <Banknote size={32} className="text-amber-600" />,
      path: '/employee-advances',
      color: 'bg-amber-50 border-amber-100'
    },
    {
      title: 'قائمة الموظفين',
      description: 'سجل بيانات الموظفين والعقود',
      icon: <Users size={32} className="text-purple-600" />,
      path: '/employees',
      color: 'bg-purple-50 border-purple-100'
    }
  ];

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="flex items-center gap-3 mb-8">
        <PieChart className="text-blue-600 w-8 h-8" />
        <div>
            <h1 className="text-2xl font-black text-slate-800">تقارير الموارد البشرية</h1>
            <p className="text-slate-500 font-medium">مركز التقارير الخاص بالموظفين والرواتب</p>
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

export default EmployeeReports;
