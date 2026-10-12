/**
 * ==============================================================================
 * TriPro ERP — Banking & Treasury Domain Context & Hook
 * context/domains/BankingContext.tsx
 * ==============================================================================
 * مخصص لإدارة الخزائن النقدية، البنوك، الشيكات، وسندات الصرف والقبض.
 * يدعم الاستخدام المباشر أو عبر واجهة AccountingContext الموحدة بنمط Facade.
 * مزود بالحماية الكاملة لعزل بيانات المنظمات (Multi-Tenancy) وسجل التدقيق (Audit Log)
 * والتراجع الآلي عن القيود المحاسبية عند حذف الشيكات.
 * ==============================================================================
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAccounting } from '../AccountingContext';
import { Cheque, PaymentVoucher } from '../../types';
import type { UserProfile } from '../AccountingContext';
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
  refreshBanking: () => Promise<void>;
  refreshCheques?: () => Promise<void>;
  refreshVouchers?: () => Promise<void>;
}

export const BankingContext = createContext<BankingDomainState | null>(null);

export interface BankingProviderProps {
  children: React.ReactNode;
  orgId?: string | null;
  currentUser?: UserProfile | null;
  initialCheques?: Cheque[];
  initialVouchers?: PaymentVoucher[];
  logActivity?: (action: string, details: string) => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  isDemo?: boolean;
}

const EMPTY_CHEQUES: Cheque[] = [];
const EMPTY_VOUCHERS: PaymentVoucher[] = [];

export const BankingProvider: React.FC<BankingProviderProps> = ({
  children,
  orgId,
  currentUser,
  initialCheques = EMPTY_CHEQUES,
  initialVouchers = EMPTY_VOUCHERS,
  logActivity,
  showToast,
  isDemo = false
}) => {
  const [cheques, setCheques] = useState<Cheque[]>(initialCheques);
  const [vouchers, setVouchers] = useState<PaymentVoucher[]>(initialVouchers);

  const targetOrgId = orgId || currentUser?.organization_id || null;

  const fetchCheques = useCallback(async () => {
    if (!targetOrgId || targetOrgId === 'org-default-offline') {
      if (initialCheques.length > 0) setCheques(initialCheques);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('cheques')
        .select('*')
        .eq('organization_id', targetOrgId)
        .order('due_date');

      if (error) {
        logger.error('Error fetching cheques in BankingProvider:', error);
      } else {
        setCheques((data as Cheque[]) || []);
      }
    } catch (err) {
      logger.error('Unexpected error fetching cheques:', err);
    }
  }, [targetOrgId, initialCheques]);

  const fetchVouchers = useCallback(async () => {
    if (!targetOrgId || targetOrgId === 'org-default-offline') {
      if (initialVouchers.length > 0) setVouchers(initialVouchers);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('payment_vouchers')
        .select('*')
        .eq('organization_id', targetOrgId)
        .is('deleted_at', null)
        .order('date', { ascending: false })
        .limit(200);

      if (error) {
        logger.error('Error fetching vouchers in BankingProvider:', error);
      } else {
        setVouchers((data as PaymentVoucher[]) || []);
      }
    } catch (err) {
      logger.error('Unexpected error fetching vouchers:', err);
    }
  }, [targetOrgId, initialVouchers]);

  useEffect(() => {
    if (initialCheques.length > 0) {
      setCheques(initialCheques);
    } else if (targetOrgId && targetOrgId !== 'org-default-offline') {
      fetchCheques();
    }
  }, [targetOrgId, fetchCheques, initialCheques.length]);

  useEffect(() => {
    if (initialVouchers.length > 0) {
      setVouchers(initialVouchers);
    } else if (targetOrgId && targetOrgId !== 'org-default-offline') {
      fetchVouchers();
    }
  }, [targetOrgId, fetchVouchers, initialVouchers.length]);

  const addCheque = useCallback(async (cheque: Partial<Cheque>): Promise<void> => {
    const effectiveOrg = targetOrgId || currentUser?.organization_id;
    const userId = currentUser?.id;

    const { error } = await supabase.from('cheques').insert({
      ...cheque,
      organization_id: effectiveOrg,
      created_by: userId
    });

    if (error) {
      showToast?.('فشل تسجيل الشيك: ' + error.message, 'error');
      logger.error('Error adding cheque:', error);
      throw error;
    }

    showToast?.('تم تسجيل الشيك بنجاح ✅', 'success');
    logActivity?.('تسجيل شيك', `شيك رقم: ${cheque.cheque_number || ''}`);
    await fetchCheques();
  }, [targetOrgId, currentUser, logActivity, showToast, fetchCheques]);

  const updateCheque = useCallback(async (id: string, cheque: Partial<Cheque>): Promise<void> => {
    const effectiveOrg = targetOrgId || currentUser?.organization_id;
    let query = supabase
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

    if (effectiveOrg && effectiveOrg !== 'org-default-offline') {
      query = query.eq('organization_id', effectiveOrg);
    }

    const { error } = await query;
    if (error) {
      showToast?.('فشل تحديث الشيك: ' + error.message, 'error');
      logger.error('Error updating cheque:', error);
      throw error;
    }

    showToast?.('تم تحديث بيانات الشيك بنجاح ✅', 'success');
    logActivity?.('تعديل شيك', `شيك رقم: ${cheque.cheque_number || id}`);
    await fetchCheques();
  }, [targetOrgId, currentUser, logActivity, showToast, fetchCheques]);

  const deleteCheque = useCallback(async (id: string): Promise<void> => {
    const effectiveOrg = targetOrgId || currentUser?.organization_id;

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
    if (effectiveOrg && effectiveOrg !== 'org-default-offline') {
      delQuery = delQuery.eq('organization_id', effectiveOrg);
    }
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

    if (effectiveOrg && effectiveOrg !== 'org-default-offline') {
      const { data: relatedEntries } = await supabase
        .from('journal_entries')
        .select('id')
        .eq('related_document_id', id)
        .eq('organization_id', effectiveOrg);

      if (relatedEntries && relatedEntries.length > 0) {
        const entryIds = relatedEntries.map(e => e.id);
        await supabase.from('journal_lines').delete().in('journal_entry_id', entryIds);
        await supabase.from('journal_entries').delete().in('id', entryIds);
      }
    }

    showToast?.('تم حذف الشيك وقيوده المحاسبية المرتبطة بنجاح ✅', 'success');
    logActivity?.('حذف شيك', `تم حذف الشيك رقم: ${id}`);
    await fetchCheques();
  }, [targetOrgId, currentUser, logActivity, showToast, fetchCheques]);

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
          p_user_id: currentUser?.id || null
        });
        if (!rpcError && (rpcRes?.success || rpcRes === true)) {
          showToast?.('تم تحديث حالة الشيك وتوليد القيود بنجاح ✅', 'success');
          logActivity?.('تحديث حالة شيك', `حالة ${status} للشيك ${id}`);
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
    if (targetOrgId && targetOrgId !== 'org-default-offline') {
      query = query.eq('organization_id', targetOrgId);
    }
    const { error } = await query;
    if (error) {
      showToast?.('فشل تحديث حالة الشيك: ' + error.message, 'error');
      throw error;
    }

    showToast?.('تم تحديث حالة الشيك بنجاح ✅', 'success');
    logActivity?.('تحديث حالة شيك', `حالة ${status} للشيك ${id}`);
    await fetchCheques();
  }, [targetOrgId, currentUser, logActivity, showToast, fetchCheques]);

  const addPaymentVoucher = useCallback(async (voucher: Partial<PaymentVoucher>): Promise<void> => {
    const effectiveOrg = targetOrgId || currentUser?.organization_id;
    const userId = currentUser?.id;

    const { error } = await supabase.from('payment_vouchers').insert({
      ...voucher,
      organization_id: effectiveOrg,
      created_by: userId
    });

    if (error) {
      showToast?.('فشل إضافة سند الصرف: ' + error.message, 'error');
      throw error;
    }

    showToast?.('تم إضافة سند الصرف بنجاح ✅', 'success');
    logActivity?.('إضافة سند صرف', `سند بقيمة: ${voucher.amount || 0}`);
    await fetchVouchers();
  }, [targetOrgId, currentUser, logActivity, showToast, fetchVouchers]);

  const updateVoucher = useCallback(async (id: string, updates: Partial<PaymentVoucher>): Promise<boolean> => {
    const effectiveOrg = targetOrgId || currentUser?.organization_id;
    let query = supabase.from('payment_vouchers').update(updates).eq('id', id);
    if (effectiveOrg && effectiveOrg !== 'org-default-offline') {
      query = query.eq('organization_id', effectiveOrg);
    }
    const { error } = await query;
    if (error) {
      showToast?.('فشل تعديل السند: ' + error.message, 'error');
      throw error;
    }
    showToast?.('تم تعديل السند بنجاح ✅', 'success');
    await fetchVouchers();
    return true;
  }, [targetOrgId, currentUser, showToast, fetchVouchers]);

  const addTransfer = useCallback(async (transfer: Record<string, any>): Promise<void> => {
    const effectiveOrg = targetOrgId || currentUser?.organization_id;
    const targetUserId = currentUser?.id;
    try {
      const { error } = await supabase.rpc('add_treasury_transfer', {
        p_from_account_id: transfer.sourceAccountId || transfer.source_account_id || transfer.from_account_id,
        p_to_account_id: transfer.destinationAccountId || transfer.destination_account_id || transfer.to_account_id,
        p_amount: transfer.amount,
        p_transfer_date: transfer.date || transfer.transfer_date,
        p_notes: transfer.description || transfer.notes || '',
        p_org_id: effectiveOrg,
        p_user_id: targetUserId
      });
      if (error) {
        const isFuncMissing = error.code === 'P0001' || error.message?.includes('function') || error.message?.includes('does not exist');
        if (isFuncMissing) {
          const { error: insErr } = await supabase.from('transfers').insert({ ...transfer, organization_id: effectiveOrg });
          if (insErr) throw insErr;
        } else {
          throw error;
        }
      }
      showToast?.('تم تسجيل التحويل المالي بنجاح ✅', 'success');
      logActivity?.('تحويل مالي', `تحويل بقيمة: ${transfer.amount || 0}`);
    } catch (e: any) {
      showToast?.('فشل تسجيل التحويل المالي: ' + (e?.message || ''), 'error');
      throw e;
    }
  }, [targetOrgId, currentUser, logActivity, showToast]);

  const updateTransfer = useCallback(async (id: string, transfer: Record<string, any>): Promise<void> => {
    const effectiveOrg = targetOrgId || currentUser?.organization_id;
    try {
      const { error } = await supabase.rpc('update_treasury_transfer', {
        p_journal_entry_id: id,
        p_from_account_id: transfer.sourceAccountId || transfer.source_account_id,
        p_to_account_id: transfer.destinationAccountId || transfer.destination_account_id,
        p_amount: transfer.amount,
        p_transfer_date: transfer.date || transfer.transfer_date,
        p_notes: transfer.description || transfer.notes || ''
      });
      if (error) {
        const isFuncMissing = error.code === 'P0001' || error.message?.includes('function') || error.message?.includes('does not exist');
        if (isFuncMissing) {
          let query = supabase.from('transfers').update(transfer).eq('id', id);
          if (effectiveOrg && effectiveOrg !== 'org-default-offline') {
            query = query.eq('organization_id', effectiveOrg);
          }
          const { error: updErr } = await query;
          if (updErr) throw updErr;
        } else {
          throw error;
        }
      }
      showToast?.('تم تعديل التحويل المالي بنجاح ✅', 'success');
    } catch (e: any) {
      showToast?.('فشل تعديل التحويل المالي: ' + (e?.message || ''), 'error');
      throw e;
    }
  }, [targetOrgId, currentUser, showToast]);

  const deleteTransfer = useCallback(async (id: string): Promise<void> => {
    const effectiveOrg = targetOrgId || currentUser?.organization_id;
    try {
      const { error } = await supabase.rpc('delete_treasury_transfer', {
        p_journal_entry_id: id
      });
      if (error) {
        const isFuncMissing = error.code === 'P0001' || error.message?.includes('function') || error.message?.includes('does not exist');
        if (isFuncMissing) {
          let query = supabase.from('transfers').delete().eq('id', id);
          if (effectiveOrg && effectiveOrg !== 'org-default-offline') {
            query = query.eq('organization_id', effectiveOrg);
          }
          const { error: delErr } = await query;
          if (delErr) throw delErr;
        } else {
          throw error;
        }
      }
      showToast?.('تم حذف التحويل المالي بنجاح', 'info');
    } catch (e: any) {
      showToast?.('فشل حذف التحويل المالي: ' + (e?.message || ''), 'error');
      throw e;
    }
  }, [targetOrgId, currentUser, showToast]);

  const refreshAllBanking = useCallback(async () => {
    await Promise.all([fetchCheques(), fetchVouchers()]);
  }, [fetchCheques, fetchVouchers]);

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
        refreshBanking: refreshAllBanking,
        refreshCheques: fetchCheques,
        refreshVouchers: fetchVouchers,
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
    refreshBanking: (acc.refreshBankingAndShift as () => Promise<void>) || (acc.refreshData as () => Promise<void>),
  };
};

export default useBankingDomain;
