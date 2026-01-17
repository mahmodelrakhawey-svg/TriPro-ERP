import React from 'react';
import { tafqeet } from '../../utils/tafqeet';

interface CustomerDepositPrintProps {
  voucher: any;
  companySettings?: any;
}

export const CustomerDepositPrint = ({ voucher, companySettings }: CustomerDepositPrintProps) => {
  if (!voucher) return null;

  return (
    <div className="hidden print:block fixed inset-0 bg-white z-[9999] p-8 text-black font-sans" dir="rtl" id="printable-voucher">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #printable-voucher, #printable-voucher * { visibility: visible; }
          #printable-voucher { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
      {/* Header */}
      <div className="flex justify-between items-start border-b-2 border-slate-800 pb-6 mb-8">
        <div className="text-right">
            <h2 className="text-2xl font-bold text-slate-900">{companySettings?.company_name || 'اسم الشركة'}</h2>
            <p className="text-sm text-slate-600 mt-1">{companySettings?.address || 'العنوان'}</p>
            <p className="text-sm text-slate-600">{companySettings?.phone || 'الهاتف'}</p>
        </div>
        <div className="text-center">
            <h1 className="text-3xl font-black text-slate-900 mb-2">سند قبض تأمين</h1>
            <p className="text-lg font-bold text-slate-500 uppercase tracking-widest">Customer Deposit Receipt</p>
        </div>
        <div className="text-left">
             {companySettings?.logo_url ? (
                 <img src={companySettings.logo_url} alt="Logo" className="h-20 object-contain" />
             ) : (
                 <div className="w-24 h-24 bg-slate-100 flex items-center justify-center text-slate-400 font-bold border border-slate-300">Logo</div>
             )}
        </div>
      </div>

      {/* Voucher Info */}
      <div className="flex justify-between mb-8">
        <div className="flex gap-4">
            <div className="bg-slate-100 px-4 py-2 rounded border border-slate-200">
                <span className="block text-xs text-slate-500 font-bold">رقم السند</span>
                <span className="text-xl font-black font-mono">{voucher.voucherNumber}</span>
            </div>
            <div className="bg-slate-100 px-4 py-2 rounded border border-slate-200">
                <span className="block text-xs text-slate-500 font-bold">التاريخ</span>
                <span className="text-xl font-bold">{voucher.date}</span>
            </div>
        </div>
        <div className="bg-slate-100 px-6 py-2 rounded border border-slate-200 text-center min-w-[200px]">
             <span className="block text-xs text-slate-500 font-bold">المبلغ</span>
             <span className="text-2xl font-black text-slate-900">{Number(voucher.amount).toLocaleString()} <span className="text-sm text-slate-500">EGP</span></span>
             <p className="text-xs text-slate-600 mt-1 font-bold border-t border-slate-300 pt-1">{tafqeet(Number(voucher.amount), 'EGP')}</p>
        </div>
      </div>

      {/* Body */}
      <div className="border border-slate-300 rounded-lg p-6 space-y-6 mb-12">
        <div className="flex items-baseline gap-4">
            <span className="font-bold text-slate-700 w-32 shrink-0">استلمنا من السيد/ة:</span>
            <div className="flex-1 border-b border-dotted border-slate-400 pb-1 font-bold text-lg">{voucher.customerName || '---'}</div>
        </div>
        
        <div className="flex items-baseline gap-4">
            <span className="font-bold text-slate-700 w-32 shrink-0">وذلك عن:</span>
            <div className="flex-1 border-b border-dotted border-slate-400 pb-1">{voucher.description || 'تأمين مسترد'}</div>
        </div>

        <div className="flex items-baseline gap-4">
            <span className="font-bold text-slate-700 w-32 shrink-0">طريقة الدفع:</span>
            <div className="flex-1 border-b border-dotted border-slate-400 pb-1">
                {voucher.paymentMethod === 'cash' ? 'نقدي' : 
                 voucher.paymentMethod === 'cheque' ? 'شيك' : 
                 voucher.paymentMethod === 'transfer' ? 'تحويل بنكي' : voucher.paymentMethod}
            </div>
        </div>
      </div>

      {/* Footer / Signatures */}
      <div className="grid grid-cols-3 gap-12 mt-auto pt-12">
        <div className="text-center">
            <p className="font-bold text-slate-700 mb-16">المحاسب</p>
            <div className="border-t border-slate-800 w-3/4 mx-auto"></div>
        </div>
        <div className="text-center">
            <p className="font-bold text-slate-700 mb-16">المدير المالي</p>
            <div className="border-t border-slate-800 w-3/4 mx-auto"></div>
        </div>
        <div className="text-center">
            <p className="font-bold text-slate-700 mb-16">المستلم</p>
            <div className="border-t border-slate-800 w-3/4 mx-auto"></div>
            <p className="text-xs text-slate-500 mt-2">الاسم / التوقيع</p>
        </div>
      </div>

      <div className="mt-12 pt-4 border-t border-slate-200 text-center text-xs text-slate-400 flex justify-between">
        <span>تمت الطباعة بواسطة نظام TriPro ERP</span>
        <span>{new Date().toLocaleString('ar-SA')}</span>
      </div>
    </div>
  );
};