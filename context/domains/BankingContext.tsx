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
import { Cheque, PaymentVoucher } from '../../types';

export interface BankingDomainState {
  cheques: Cheque[];
  vouchers: PaymentVoucher[];
  addCheque: (cheque: Partial<Cheque>) => Promise<void>;
  updateCheque: (id: string, cheque: Partial<Cheque>) => Promise<void>;
  deleteCheque: (id: string) => Promise<void>;
  updateChequeStatus: (id: string, status: string, date: string, bankId?: string) => Promise<void>;
  addPaymentVoucher: (voucher: Partial<PaymentVoucher>) => Promise<void>;
  updateVoucher: (id: string, updates: Partial<PaymentVoucher>) => Promise<boolean>;
  addTransfer: (transfer: Record<string, any>) => Promise<void>;
  updateTransfer: (id: string, transfer: Record<string, any>) => Promise<void>;
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
