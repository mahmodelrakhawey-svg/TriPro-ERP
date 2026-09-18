/**
 * ==============================================================================
 * TriPro ERP — Banking & Treasury Domain Context & Hook
 * context/domains/BankingContext.tsx
 * ==============================================================================
 * مخصص لإدارة الخزائن النقدية، البنوك، الشيكات، وسندات الصرف والقبض.
 * يدعم الاستخدام المباشر أو عبر واجهة AccountingContext الموحدة بنمط Facade.
 * ==============================================================================
 */

import { useAccounting } from '../AccountingContext';

export interface BankingDomainState {
  cheques: any[];
  vouchers: any[];
  addCheque: (cheque: any) => Promise<void>;
  updateCheque: (id: string, cheque: any) => Promise<void>;
  deleteCheque: (id: string) => Promise<void>;
  updateChequeStatus: (id: string, status: string, date: string, bankId?: string) => Promise<void>;
  addPaymentVoucher: (voucher: any) => Promise<void>;
  updateVoucher: (id: string, updates: any) => Promise<boolean>;
  addTransfer: (transfer: any) => Promise<void>;
  updateTransfer: (id: string, transfer: any) => Promise<void>;
  deleteTransfer: (id: string) => Promise<void>;
}

export const useBankingDomain = (): BankingDomainState => {
  const acc = useAccounting() as any;
  return {
    cheques: acc.cheques || [],
    vouchers: acc.vouchers || [],
    addCheque: acc.addCheque,
    updateCheque: acc.updateCheque,
    deleteCheque: acc.deleteCheque,
    updateChequeStatus: acc.updateChequeStatus,
    addPaymentVoucher: acc.addPaymentVoucher,
    updateVoucher: acc.updateVoucher,
    addTransfer: acc.addTransfer,
    updateTransfer: acc.updateTransfer,
    deleteTransfer: acc.deleteTransfer,
  };
};

export default useBankingDomain;
