import React from 'react';
import { useAccounting } from '../../context/AccountingContext';

interface ReportHeaderProps {
  title: string;
  subtitle?: string;
}

const ReportHeader: React.FC<ReportHeaderProps> = ({ title, subtitle }) => {
  const { settings } = useAccounting();

  return (
    <div className="p-8 border-b border-slate-100 flex justify-between items-start print:p-4">
      <div>
        <h1 className="text-2xl font-black text-slate-800 mb-2">{settings.companyName}</h1>
        <div className="text-sm text-slate-500 space-y-1">
          <p>{settings.address}</p>
          <p>رقم ضريبي: {settings.taxNumber}</p>
          <p>{settings.phone}</p>
        </div>
      </div>
      <div className="text-left">
        <h2 className="text-xl font-bold text-slate-800 text-emerald-600">{title}</h2>
        {subtitle && <p className="text-slate-500 mt-1">{subtitle}</p>}
        <p className="text-xs text-slate-400 mt-2">تاريخ الطباعة: {new Date().toLocaleDateString('ar-EG')}</p>
      </div>
    </div>
  );
};

export default ReportHeader;