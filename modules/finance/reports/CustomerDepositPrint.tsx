import React from 'react';

interface CustomerDepositPrintProps {
  voucher: any;
  companySettings: any;
}

export const CustomerDepositPrint: React.FC<CustomerDepositPrintProps> = ({ voucher, companySettings }) => {
  if (!voucher) return null;

  return (
    <div className="hidden print:block p-8 bg-white text-black rtl w-full" dir="rtl">
      {/* Header */}
      <div className="flex justify-between items-center border-b-2 border-slate-800 pb-4 mb-6">
        <div className="text-right">
          <h1 className="text-2xl font-black">{companySettings?.company_name || companySettings?.companyName || 'سند قبض تأمين'}</h1>
          <p className="text-sm text-slate-500">{companySettings?.address}</p>
          <p className="text-sm text-slate-500">{companySettings?.phone}</p>
        </div>
        {(companySettings?.logo_url || companySettings?.logoUrl) && (
          <img src={companySettings.logo_url || companySettings.logoUrl} alt="Logo" className="w-24 h-24 object-contain" />
        )}
      </div>

      <div className="text-center mb-8">
        <h2 className="text-xl font-bold border-2 border-slate-800 inline-block px-6 py-1 rounded-full">
          سند قبض تأمين عميل
        </h2>
      </div>

      {/* Voucher Details */}
      <div className="grid grid-cols-2 gap-8 mb-8 text-lg text-right">
        <div className="space-y-3">
          <p><span className="font-bold ml-2">رقم السند:</span> <span className="font-mono">{voucher.voucherNumber}</span></p>
          <p><span className="font-bold ml-2">التاريخ:</span> {voucher.date}</p>
        </div>
        <div className="space-y-3 text-left">
          <p><span className="font-bold mr-2">المبلغ:</span> <span className="text-2xl font-black">{Number(voucher.amount).toLocaleString()} EGP</span></p>
        </div>
      </div>

      <div className="border-2 border-slate-100 rounded-2xl p-6 mb-8 bg-slate-50/30 text-right">
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <span className="font-bold whitespace-nowrap">استلمنا من السيد/ة:</span>
            <span className="border-b border-dotted border-slate-400 flex-1 px-2">{voucher.customerName}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold whitespace-nowrap">مبلغاً وقدره:</span>
            <span className="border-b border-dotted border-slate-400 flex-1 px-2">{Number(voucher.amount).toLocaleString()} جنيه مصري فقط لا غير</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold whitespace-nowrap">وذلك عن:</span>
            <span className="border-b border-dotted border-slate-400 flex-1 px-2">{voucher.description || 'تأمين مسترد'}</span>
          </div>
        </div>
      </div>

      {/* Footer / Signatures */}
      <div className="mt-16 grid grid-cols-2 gap-20 text-center">
        <div>
          <p className="font-bold border-t border-slate-800 pt-2">توقيع المستلم</p>
        </div>
        <div>
          <p className="font-bold border-t border-slate-800 pt-2">ختم الشركة</p>
        </div>
      </div>

      <div className="mt-20 text-center text-[10px] text-slate-400 border-t pt-4">
        تم إنشاء هذا المستند بواسطة نظام TriPro ERP
      </div>
    </div>
  );
};