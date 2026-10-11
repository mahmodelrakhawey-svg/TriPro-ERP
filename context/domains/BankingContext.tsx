/**
 * ==============================================================================
 * TriPro ERP — Banking & Treasury Domain Context & Hook
 * context/domains/BankingContext.tsx
 * ==============================================================================
 * مخصص لإدارة الخزائن النقدية، البنوك، الشيكات، وسندات الصرف والقبض.
 * يدعم الاستخدام المباشر أو عبر واجهة AccountingContext الموحدة بنمط Facade.
 * ==============================================================================
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAccounting } from '../AccountingContext';
import { Cheque, PaymentVoucher } from '../../types';
import { supabase } from '../../supabaseClient';
import { logger } from '../../utils/logger';

export interface BankingDomainState {
  cheques: Cheque[];
  vouchers: PaymentVoucher[];
  addCheque: (cheque: Partial<Cheque>) => Promise<void>;
  updateCheque: (id: string, cheque: Partial<Cheque>) => Promise<void>;
  deleteCheque: (id: string) => Promise<void>;
  updateChequeStatus: (id: string, status: string, date: string, bankId?: string) => Promise<void>;
  addPaymentVoucher: (voucher: Partial<PaymentVoucher>) => Promise<void>;
  updateVoucher: (id: string, updates: Partial<PaymentVoucher>) => Promise<boolean>;
  addTransfer: (transfer: Record<string, unknown>) => Promise<void>;
  updateTransfer: (id: string, transfer: Record<string, unknown>) => Promise<void>;
  deleteTransfer: (id: string) => Promise<void>;
  refreshBanking?: () => Promise<void>;
}

export const BankingContext = createContext<BankingDomainState | null>(null);

export interface BankingProviderProps {
  children: React.ReactNode;
  orgId?: string;
  initialCheques?: Cheque[];
  initialVouchers?: PaymentVoucher[];
}

export const BankingProvider: React.FC<BankingProviderProps> = ({
  children,
  orgId,
  initialCheques = [],
  initialVouchers = []
}) => {
  const [cheques, setCheques] = useState<Cheque[]>(initialCheques);
  const [vouchers, setVouchers] = useState<PaymentVoucher[]>(initialVouchers);

  const fetchCheques = useCallback(async () => {
    if (!orgId) return;
    try {
      const { data, error } = await supabase
        .from('cheques')
        .select('*')
        .eq('organization_id', orgId)
        .order('due_date');
      if (error) {
        logger.error('Error fetching cheques in BankingProvider:', error);
      } else {
        setCheques((data as Cheque[]) || []);
      }
    } catch (err) {
      logger.error('Unexpected error fetching cheques:', err);
    }
  }, [orgId]);

  useEffect(() => {
    if (orgId) {
      fetchCheques();
    }
  }, [orgId, fetchCheques]);

  const addCheque = useCallback(async (cheque: Partial<Cheque>): Promise<void> => {
    if (!orgId) return;
    const { error } = await supabase.from('cheques').insert({ ...cheque, organization_id: orgId });
    if (error) throw error;
    await fetchCheques();
  }, [orgId, fetchCheques]);

  const updateCheque = useCallback(async (id: string, cheque: Partial<Cheque>): Promise<void> => {
    const { error } = await supabase
      .from('cheques')
      .update({
        cheque_number: cheque.cheque_number,
        amount: cheque.amount,
        due_date: cheque.due_date,
        party_id: cheque.party_id,
        party_name: cheque.party_name,
        bank_name: cheque.bank_name,
        notes: cheque.notes
      })
      .eq('id', id);
    if (error) throw error;
    await fetchCheques();
  }, [fetchCheques]);

  const deleteCheque = useCallback(async (id: string): Promise<void> => {
    // 1. جلب بيانات الشيك والقيود المحاسبية المرتبطة به
    const { data: chq, error: fetchErr } = await supabase
      .from('cheques')
      .select('id, related_journal_entry_id, status')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr || !chq) {
      throw new Error(fetchErr?.message || 'تعذر العثور على سجل الشيك المطلوب حذفه');
    }
    
    // 2. فك ارتباط القيد بالشيك لتفادي قيود المفاتيح الأجنبية
    if (chq.related_journal_entry_id) {
      await supabase.from('cheques').update({ related_journal_entry_id: null }).eq('id', id);
    }

    // 3. حذف مرفقات الشيك
    await supabase.from('cheque_attachments').delete().eq('cheque_id', id);

    // 4. حذف سجل الشيك الرئيسي أولاً
    let delQuery = supabase.from('cheques').delete().eq('id', id);
    if (orgId) delQuery = delQuery.eq('organization_id', orgId);
    const { error: delError } = await delQuery;

    if (delError) {
      // 🛡️ تراجع فوري: إعادة ربط القيد بالشيك إذا فشل حذف الشيك
      if (chq.related_journal_entry_id) {
        await supabase.from('cheques').update({ related_journal_entry_id: chq.related_journal_entry_id }).eq('id', id);
      }
      throw delError;
    }

    // 5. بعد نجاح حذف الشيك، يتم حذف قيود اليومية المرتبطة بأمان
    if (chq.related_journal_entry_id) {
      await supabase.from('journal_lines').delete().eq('journal_entry_id', chq.related_journal_entry_id);
      await supabase.from('journal_entries').delete().eq('id', chq.related_journal_entry_id);
    }

    if (orgId) {
      const { data: relatedEntries } = await supabase
        .from('journal_entries')
        .select('id')
        .eq('related_document_id', id)
        .eq('organization_id', orgId);

      if (relatedEntries && relatedEntries.length > 0) {
        const entryIds = relatedEntries.map(e => e.id);
        await supabase.from('journal_lines').delete().in('journal_entry_id', entryIds);
        await supabase.from('journal_entries').delete().in('id', entryIds);
      }
    }

    await fetchCheques();
  }, [orgId, fetchCheques]);

  const updateChequeStatus = useCallback(async (id: string, status: string, date: string, bankId?: string): Promise<void> => {
    const actionDate = date || new Date().toISOString().split('T')[0];

    // محاولة استدعاء الدالة المباشرة RPC لصرف أو تحصيل الشيك
    if (status === 'cashed' || status === 'collected') {
      try {
        const { data: rpcRes, error: rpcError } = await supabase.rpc('cash_or_collect_cheque', {
          p_cheque_id: id,
          p_status: status,
          p_bank_account_id: bankId || null,
          p_action_date: actionDate,
          p_user_id: null
        });
        if (!rpcError && (rpcRes?.success || rpcRes === true)) {
          await fetchCheques();
          return;
        }
      } catch (e) {
        logger.warn('RPC cash_or_collect_cheque fallback:', e);
      }
    }

    const updatePayload: { status: string; current_account_id?: string | null; transfer_date?: string } = {
      status,
      transfer_date: actionDate
    };
    if (bankId !== undefined) {
      updatePayload.current_account_id = bankId;
    }
    let query = supabase.from('cheques').update(updatePayload).eq('id', id);
    if (orgId) query = query.eq('organization_id', orgId);
    const { error } = await query;
    if (error) throw error;
    await fetchCheques();
  }, [orgId, fetchCheques]);

  const addPaymentVoucher = useCallback(async (voucher: Partial<PaymentVoucher>): Promise<void> => {
    if (!orgId) return;
    const { error } = await supabase.from('payment_vouchers').insert({ ...voucher, organization_id: orgId });
    if (error) throw error;
  }, [orgId]);

  const updateVoucher = useCallback(async (id: string, updates: Partial<PaymentVoucher>): Promise<boolean> => {
    let query = supabase.from('payment_vouchers').update(updates).eq('id', id);
    if (orgId) query = query.eq('organization_id', orgId);
    const { error } = await query;
    if (error) throw error;
    return true;
  }, [orgId]);

  const addTransfer = useCallback(async (transfer: Record<string, unknown>): Promise<void> => {
    if (!orgId) return;
    const { error } = await supabase.from('transfers').insert({ ...transfer, organization_id: orgId });
    if (error) throw error;
  }, [orgId]);

  const updateTransfer = useCallback(async (id: string, transfer: Record<string, unknown>): Promise<void> => {
    const { error } = await supabase.from('transfers').update(transfer).eq('id', id);
    if (error) throw error;
  }, []);

  const deleteTransfer = useCallback(async (id: string): Promise<void> => {
    const { error } = await supabase.from('transfers').delete().eq('id', id);
    if (error) throw error;
  }, []);

  return (
    <BankingContext.Provider
      value={{
        cheques,
        vouchers,
        addCheque,
        updateCheque,
        deleteCheque,
        updateChequeStatus,
        addPaymentVoucher,
        updateVoucher,
        addTransfer,
        updateTransfer,
        deleteTransfer,
        refreshBanking: fetchCheques,
      }}
    >
      {children}
    </BankingContext.Provider>
  );
};

export const useBankingDomain = (): BankingDomainState => {
  let context: BankingDomainState | null = null;
  try {
    context = useContext(BankingContext);
  } catch {
    // If called outside React component tree (e.g. unit tests), fallback to useAccounting
  }
  if (context) return context;

  // Fallback to unified AccountingContext
  const acc = useAccounting() as unknown as Record<string, unknown>;
  return {
    cheques: (acc.cheques as Cheque[]) || [],
    vouchers: (acc.vouchers as PaymentVoucher[]) || [],
    addCheque: acc.addCheque as (cheque: Partial<Cheque>) => Promise<void>,
    updateCheque: acc.updateCheque as (id: string, cheque: Partial<Cheque>) => Promise<void>,
    deleteCheque: acc.deleteCheque as (id: string) => Promise<void>,
    updateChequeStatus: acc.updateChequeStatus as (id: string, status: string, date: string, bankId?: string) => Promise<void>,
    addPaymentVoucher: acc.addPaymentVoucher as (voucher: Partial<PaymentVoucher>) => Promise<void>,
    updateVoucher: acc.updateVoucher as (id: string, updates: Partial<PaymentVoucher>) => Promise<boolean>,
    addTransfer: acc.addTransfer as (transfer: Record<string, unknown>) => Promise<void>,
    updateTransfer: acc.updateTransfer as (id: string, transfer: Record<string, unknown>) => Promise<void>,
    deleteTransfer: acc.deleteTransfer as (id: string) => Promise<void>,
    refreshBanking: acc.refreshData as () => Promise<void>,
  };
};

export default useBankingDomain;
