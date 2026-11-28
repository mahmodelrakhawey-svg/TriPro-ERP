import React, { Suspense, lazy } from 'react';
import { AlertCircle, Loader2, Plus, Wallet, X } from 'lucide-react';

const CustomerStatement = lazy(() => import('../CustomerStatement'));

export interface SalesMissingSetupBannersProps {
  warehousesCount: number;
  treasuryAccountsCount: number;
  onNavigateToWarehouses: () => void;
  onNavigateToAccounts: () => void;
}

/**
 * Renders setup warnings when warehouses or treasury accounts are not configured yet.
 */
export const SalesMissingSetupBanners: React.FC<SalesMissingSetupBannersProps> = ({
  warehousesCount,
  treasuryAccountsCount,
  onNavigateToWarehouses,
  onNavigateToAccounts,
}) => {
  return (
    <>
      {warehousesCount === 0 && (
        <div className="bg-amber-50 border-2 border-amber-200 p-5 rounded-[2rem] mb-6 flex flex-col md:flex-row items-center justify-between gap-4 animate-in slide-in-from-top-4 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="bg-amber-100 p-3 rounded-2xl">
              <AlertCircle className="text-amber-600" size={28} />
            </div>
            <div>
              <h4 className="font-black text-amber-900 text-lg">تنبيه: لم يتم إعداد المخازن بعد</h4>
              <p className="text-amber-700 font-medium">يرجى إضافة مستودع واحد على الأقل لتتمكن من إصدار الفواتير بنجاح.</p>
            </div>
          </div>
          <button
            onClick={onNavigateToWarehouses}
            className="bg-amber-600 text-white px-6 py-3 rounded-2xl font-black hover:bg-amber-700 transition-all shadow-md flex items-center gap-2 whitespace-nowrap"
          >
            <Plus size={20} /> إضافة مستودع الآن
          </button>
        </div>
      )}

      {treasuryAccountsCount === 0 && (
        <div className="bg-blue-50 border-2 border-blue-200 p-5 rounded-[2rem] mb-6 flex flex-col md:flex-row items-center justify-between gap-4 animate-in slide-in-from-top-4 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="bg-blue-100 p-3 rounded-2xl">
              <Wallet className="text-blue-600" size={28} />
            </div>
            <div>
              <h4 className="font-black text-blue-900 text-lg">تنبيه: لم يتم إعداد الخزينة</h4>
              <p className="text-blue-700 font-medium">يرجى إضافة "خزينة" أو "بنك" واحد على الأقل لتتمكن من تحصيل المبالغ النقدية بنجاح.</p>
            </div>
          </div>
          <button
            onClick={onNavigateToAccounts}
            className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-black hover:bg-blue-700 transition-all shadow-md flex items-center gap-2 whitespace-nowrap"
          >
            <Plus size={20} /> تهيئة الحسابات
          </button>
        </div>
      )}
    </>
  );
};

export interface SalesCustomerStatementModalProps {
  isOpen: boolean;
  customerId: string;
  onClose: () => void;
}

/**
 * Renders the modal showing the selected customer's ledger statement inside SalesInvoiceForm.
 */
export const SalesCustomerStatementModal: React.FC<SalesCustomerStatementModalProps> = ({
  isOpen,
  customerId,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-[70] flex items-center justify-center p-4 backdrop-blur-md">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl h-[90vh] overflow-hidden flex flex-col animate-in zoom-in duration-300">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center shrink-0">
          <h3 className="font-black text-xl text-slate-800">كشف حساب العميل</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-red-50 hover:text-red-500 rounded-full transition-colors"
          >
            <X size={24} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-48">
                <Loader2 className="animate-spin text-blue-600" size={32} />
              </div>
            }
          >
            <CustomerStatement initialCustomerId={customerId} />
          </Suspense>
        </div>
      </div>
    </div>
  );
};
