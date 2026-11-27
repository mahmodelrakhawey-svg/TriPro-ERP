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

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAccounting } from '../AccountingContext';
import { Account, Cheque, PaymentVoucher, Supplier } from '../../types';
import type { UserProfile } from '../AccountingContext';
import { supabase } from '../../supabaseClient';
import { logger } from '../../utils/logger';
import { getActiveOrgIdSync, resolveActiveOrgId } from '../../services/tenantContext';

export interface BankingDomainState {
  cheques: Cheque[];
  vouchers: PaymentVoucher[];
  addCheque: (cheque: Partial<Cheque>) => Promise<void>;
  updateCheque: (id: string, cheque: Partial<Cheque>) => Promise<void>;
  deleteCheque: (id: string) => Promise<void>;
  updateChequeStatus: (id: string, status: string, date: string, bankId?: string) => Promise<void>;
  addPaymentVoucher: (voucher: Partial<PaymentVoucher> & Record<string, any>) => Promise<void>;
  updateVoucher: (id: string, updates: Partial<PaymentVoucher> & Record<string, any>) => Promise<boolean>;
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
  suppliers?: Supplier[];
  accounts?: Account[];
  getSystemAccount?: (key: string) => Account | undefined;
  addEntry?: (entry: Record<string, any>) => Promise<void>;
  refreshAllData?: () => Promise<void>;
  logActivity?: (action: string, details: string) => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  isDemo?: boolean;
}

const EMPTY_CHEQUES: Cheque[] = [];
const EMPTY_VOUCHERS: PaymentVoucher[] = [];
const EMPTY_SUPPLIERS: Supplier[] = [];
const EMPTY_ACCOUNTS: Account[] = [];

export const BankingProvider: React.FC<BankingProviderProps> = ({
  children,
  orgId,
  currentUser,
  initialCheques = EMPTY_CHEQUES,
  initialVouchers = EMPTY_VOUCHERS,
  suppliers = EMPTY_SUPPLIERS,
  accounts = EMPTY_ACCOUNTS,
  getSystemAccount,
  addEntry,
  refreshAllData,
  logActivity,
  showToast,
  isDemo = false
}) => {
  const [cheques, setCheques] = useState<Cheque[]>(initialCheques);
  const [vouchers, setVouchers] = useState<PaymentVoucher[]>(initialVouchers);
  const lastTransferSubmissionRef = useRef<{ fingerprint: string; timestamp: number } | null>(null);

  const targetOrgId = orgId || currentUser?.organization_id || null;

  // 🛡️ ترشيد Egress: استثناء الأدوار التشغيلية (كاشير/ويتر/مطبخ) من تحميل الشيكات وسندات الصرف
  const isOperationalRole = useMemo(() => {
    const role = currentUser?.role;
    if (!role) return false;
    return [
      'cashier',
      'retail_cashier',
      'restaurant_cashier',
      'restaurant_waiter',
      'restaurant_chef',
      'restaurant_cook',
      'restaurant_driver',
      'storekeeper',
      'worker',
      'van_sales'
    ].includes(role);
  }, [currentUser?.role]);

  const fetchCheques = useCallback(async () => {
    if (!targetOrgId || targetOrgId === 'org-default-offline') {
      if (initialCheques.length > 0) setCheques(initialCheques);
      return;
    }

    if (isOperationalRole) {
      setCheques([]);
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
  }, [targetOrgId, initialCheques, isOperationalRole]);

  const fetchVouchers = useCallback(async () => {
    if (!targetOrgId || targetOrgId === 'org-default-offline') {
      if (initialVouchers.length > 0) setVouchers(initialVouchers);
      return;
    }

    if (isOperationalRole) {
      setVouchers([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('payment_vouchers')
        .select('*')
        .eq('organization_id', targetOrgId)
        .is('deleted_at', null)
        .order('payment_date', { ascending: false })
        .limit(200);

      if (error) {
        logger.error('Error fetching vouchers in BankingProvider:', error);
      } else {
        interface RawBankingVoucherRow {
          payment_date?: string | null;
          date?: string | null;
          created_at?: string | null;
          notes?: string | null;
          description?: string | null;
          supplier_id?: string | null;
          party_id?: string | null;
          [key: string]: unknown;
        }
        const mapped = (data || []).map((row: RawBankingVoucherRow) => ({
          ...row,
          date: (row.payment_date || row.date || (row.created_at ? row.created_at.split('T')[0] : '')) as string,
          payment_date: (row.payment_date || row.date || (row.created_at ? row.created_at.split('T')[0] : '')) as string,
          description: (row.notes || row.description || '') as string,
          notes: (row.notes || row.description || '') as string,
          type: 'payment',
          subType: row.supplier_id ? 'supplier' : 'account',
          party_id: (row.supplier_id || row.party_id) as string,
        }));
        setVouchers(mapped as unknown as PaymentVoucher[]);
      }
    } catch (err) {
      logger.error('Unexpected error fetching vouchers:', err);
    }
  }, [targetOrgId, initialVouchers, isOperationalRole]);

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

  const addPaymentVoucher = useCallback(async (data: Partial<PaymentVoucher> & Record<string, any>): Promise<void> => {
    const explicitOrgId = targetOrgId || currentUser?.organization_id;
    const effectiveOrg = getActiveOrgIdSync(explicitOrgId) || await resolveActiveOrgId(explicitOrgId);
    const supplierId = data.partyId || data.party_id || data.supplierId || data.supplier_id;
    const treasuryId = data.treasuryAccountId || data.treasury_account_id || data.treasuryId;
    const amount = Number(data.amount) || 0;
    const paymentDate = data.date || data.payment_date || new Date().toISOString().split('T')[0];
    const notes = data.notes || data.description || '';
    const voucherNumber =
      data.voucher_number ||
      data.voucherNumber ||
      `PV-${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 1000)}`;

    const supplier = suppliers.find(s => s.id === supplierId);
    const supplierName = data.partyName || data.supplierName || supplier?.name || '';
    const fullDesc = notes
      ? (supplierName && !notes.includes(supplierName) ? `${notes} (${supplierName})` : notes)
      : `سند صرف للمورد ${supplierName}`.trim();

    let supplierAccId =
      (supplier as any)?.account_id ||
      (supplier as any)?.accountId ||
      getSystemAccount?.('SUPPLIERS')?.id ||
      accounts.find(a => a.code === '201' || a.code === '20101' || a.code === '2201' || a.code?.startsWith('201') || a.name?.includes('مورد'))?.id;

    if (!supplierAccId && effectiveOrg) {
      const { data: dbAcc } = await supabase
        .from('accounts')
        .select('id')
        .eq('organization_id', effectiveOrg)
        .or('code.eq.201,code.eq.20101,code.eq.2201,name.ilike.%مورد%')
        .limit(1)
        .maybeSingle();
      if (dbAcc) supplierAccId = dbAcc.id;
    }

    if (amount > 0 && !supplierAccId) {
      showToast?.('لا يمكن إنشاء سند الصرف: لم يتم تحديد حساب المورد أو حساب الموردين الافتراضي', 'error');
      throw new Error('لم يتم تحديد حساب المورد أو حساب الموردين الافتراضي');
    }
    if (amount > 0 && !treasuryId) {
      showToast?.('لا يمكن إنشاء سند الصرف: يجب اختيار حساب الخزينة أو البنك', 'error');
      throw new Error('يجب اختيار حساب الخزينة أو البنك');
    }

    const { data: pvData, error: pvError } = await supabase
      .from('payment_vouchers')
      .insert({
        voucher_number: voucherNumber,
        payment_date: paymentDate,
        supplier_id: supplierId || null,
        amount,
        treasury_account_id: treasuryId || null,
        notes: fullDesc,
        payment_method: data.paymentMethod || data.payment_method || 'cash',
        organization_id: effectiveOrg
      })
      .select('id')
      .maybeSingle();

    if (pvError) {
      logger.error('payment_vouchers insert error in BankingProvider:', pvError);
      showToast?.('فشل إنشاء سند الصرف: ' + pvError.message, 'error');
      throw pvError;
    }

    const voucherId = pvData?.id;

    if (amount > 0 && supplierAccId && treasuryId) {
      let entryCreated = false;

      if (voucherId) {
        try {
          const { error: rpcErr } = await supabase.rpc('approve_payment_voucher', {
            p_voucher_id: voucherId,
            p_debit_account_id: supplierAccId
          });
          if (!rpcErr) entryCreated = true;
        } catch (rpcEx) {
          logger.warn('approve_payment_voucher RPC failed, falling back to addEntry:', rpcEx);
        }
      }

      if (!entryCreated && addEntry) {
        try {
          await addEntry({
            date: paymentDate,
            description: fullDesc,
            reference: voucherNumber,
            status: 'posted',
            p_org_id: effectiveOrg,
            lines: [
              { account_id: supplierAccId, accountId: supplierAccId, debit: amount, credit: 0, description: fullDesc },
              { account_id: treasuryId, accountId: treasuryId, debit: 0, credit: amount, description: `سداد سند صرف ${voucherNumber}` }
            ]
          });
          entryCreated = true;
        } catch (addErr) {
          logger.warn('addEntry failed for payment voucher, falling back to direct insert:', addErr);
        }
      }

      if (!entryCreated && effectiveOrg) {
        try {
          const { data: newJe, error: jeErr } = await supabase
            .from('journal_entries')
            .insert({
              transaction_date: paymentDate,
              description: fullDesc,
              reference: voucherNumber,
              status: 'posted',
              is_posted: true,
              organization_id: effectiveOrg,
              related_document_id: voucherId || data.invoiceId || null,
              related_document_type: 'payment_voucher'
            })
            .select('id')
            .single();

          if (!jeErr && newJe) {
            const { error: linesErr } = await supabase.from('journal_lines').insert([
              {
                journal_entry_id: newJe.id,
                account_id: supplierAccId,
                debit: amount,
                credit: 0,
                description: fullDesc,
                organization_id: effectiveOrg
              },
              {
                journal_entry_id: newJe.id,
                account_id: treasuryId,
                debit: 0,
                credit: amount,
                description: `سداد سند صرف ${voucherNumber}`,
                organization_id: effectiveOrg
              }
            ]);

            if (linesErr) {
              await supabase.from('journal_entries').delete().eq('id', newJe.id);
              throw linesErr;
            }

            if (voucherId) {
              await supabase
                .from('payment_vouchers')
                .update({ related_journal_entry_id: newJe.id })
                .eq('id', voucherId);
            }
            entryCreated = true;
          }
        } catch (directErr: unknown) {
          logger.error('Direct journal entry insert error in BankingProvider:', directErr);
          const errMsg = directErr instanceof Error ? directErr.message : '';
          showToast?.('تعذر إنشاء القيد المحاسبي المباشر للسند: ' + errMsg, 'warning');
        }
      }

      if (!entryCreated) {
        if (voucherId) {
          try {
            await supabase.from('payment_vouchers').delete().eq('id', voucherId);
            logger.warn(`Compensating rollback executed: deleted orphan payment voucher ${voucherId}`);
          } catch (rbErr) {
            logger.error('Failed to compensate voucher delete:', rbErr);
          }
        }
        showToast?.('فشل إنشاء القيد المحاسبي لسند الصرف، تم التراجع عن إنشاء السند تلقائياً لضمان توازن الدفاتر ❌', 'error');
        throw new Error('فشل إنشاء القيد المحاسبي لسند الصرف، تم التراجع عن العملية.');
      }
    }

    if (data.invoiceId) {
      try {
        const { data: currentInv, error: fetchInvErr } = await supabase
          .from('purchase_invoices')
          .select('paid_amount, total_amount, status')
          .eq('id', data.invoiceId)
          .maybeSingle();

        if (!fetchInvErr && currentInv) {
          const newPaid = (Number(currentInv.paid_amount) || 0) + amount;
          const newStatus = newPaid >= Number(currentInv.total_amount) ? 'paid' : (currentInv.status === 'draft' ? 'draft' : 'posted');
          await supabase
            .from('purchase_invoices')
            .update({ paid_amount: newPaid, status: newStatus })
            .eq('id', data.invoiceId);
        }
      } catch (invErr: unknown) {
        logger.error('Failed to update purchase invoice paid_amount:', invErr);
        const errMsg = invErr instanceof Error ? invErr.message : '';
        showToast?.('تعذر تحديث المبلغ المسدد في فاتورة المشتريات: ' + errMsg, 'warning');
      }
    }

    if (effectiveOrg) {
      try {
        await supabase.rpc('recalculate_all_system_balances', { p_org_id: effectiveOrg });
      } catch (recErr) {
        logger.warn('recalculate balances error:', recErr);
      }
    }

    showToast?.('تم إضافة سند الصرف بنجاح ✅', 'success');
    logActivity?.('إضافة سند صرف', `سند بقيمة: ${amount}`);
    await fetchVouchers();
    if (refreshAllData) await refreshAllData();
  }, [targetOrgId, currentUser, suppliers, accounts, getSystemAccount, addEntry, refreshAllData, logActivity, showToast, fetchVouchers]);

  const updateVoucher = useCallback(async (id: string, updates: Partial<PaymentVoucher> & Record<string, any>): Promise<boolean> => {
    const effectiveOrg = targetOrgId || currentUser?.organization_id;
    const sanitizedUpdates: Record<string, any> = {};
    if (updates.amount !== undefined) sanitizedUpdates.amount = updates.amount;
    if (updates.notes !== undefined) sanitizedUpdates.notes = updates.notes;
    else if (updates.description !== undefined) sanitizedUpdates.notes = updates.description;
    if (updates.payment_date !== undefined) sanitizedUpdates.payment_date = updates.payment_date;
    else if (updates.date !== undefined) sanitizedUpdates.payment_date = updates.date;
    if (sanitizedUpdates.payment_date) sanitizedUpdates.date = sanitizedUpdates.payment_date;
    if (updates.treasury_account_id !== undefined) sanitizedUpdates.treasury_account_id = updates.treasury_account_id;
    if (updates.cost_center_id !== undefined) sanitizedUpdates.cost_center_id = updates.cost_center_id;
    if (updates.payment_method !== undefined) sanitizedUpdates.payment_method = updates.payment_method;
    if (updates.supplier_id !== undefined) sanitizedUpdates.supplier_id = updates.supplier_id;
    else if (updates.party_id !== undefined) sanitizedUpdates.supplier_id = updates.party_id;
    if (updates.voucher_number !== undefined) sanitizedUpdates.voucher_number = updates.voucher_number;
    if (updates.recipient_name !== undefined) sanitizedUpdates.recipient_name = updates.recipient_name;
    if (updates.currency !== undefined) sanitizedUpdates.currency = updates.currency;
    if (updates.exchange_rate !== undefined) sanitizedUpdates.exchange_rate = updates.exchange_rate;

    let query = supabase.from('payment_vouchers').update(sanitizedUpdates).eq('id', id);
    if (effectiveOrg && effectiveOrg !== 'org-default-offline') {
      query = query.eq('organization_id', effectiveOrg);
    }
    const { error } = await query;
    if (error) {
      logger.error('updateVoucher error in BankingProvider:', error);
      showToast?.('فشل تعديل السند: ' + error.message, 'error');
      return false;
    }
    showToast?.('تم تعديل السند بنجاح ✅', 'success');
    await fetchVouchers();
    return true;
  }, [targetOrgId, currentUser, showToast, fetchVouchers]);

  const addTransfer = useCallback(async (transfer: Record<string, any>): Promise<void> => {
    const effectiveOrg = targetOrgId || currentUser?.organization_id;
    const targetUserId = currentUser?.id;

    const fromId = transfer.sourceAccountId || transfer.source_account_id || transfer.from_account_id;
    const toId = transfer.destinationAccountId || transfer.destination_account_id || transfer.to_account_id;
    const amount = Number(transfer.amount);
    const date = transfer.date || transfer.transfer_date;
    const fingerprint = `${effectiveOrg}-${fromId}-${toId}-${amount}-${date}`;
    const now = Date.now();

    if (lastTransferSubmissionRef.current &&
        lastTransferSubmissionRef.current.fingerprint === fingerprint &&
        now - lastTransferSubmissionRef.current.timestamp < 3500) {
      logger.warn('[BankingContext.addTransfer] تم منع تكرار التحويل المالي خلال 3.5 ثوانٍ:', fingerprint);
      return;
    }
    lastTransferSubmissionRef.current = { fingerprint, timestamp: now };

    try {
      const { error } = await supabase.rpc('add_treasury_transfer', {
        p_from_account_id: fromId,
        p_to_account_id: toId,
        p_amount: amount,
        p_transfer_date: date,
        p_notes: transfer.description || transfer.notes || '',
        p_org_id: effectiveOrg,
        p_user_id: targetUserId
      });
      if (error) {
        lastTransferSubmissionRef.current = null;
        throw error;
      }
      showToast?.('تم تسجيل التحويل المالي بنجاح ✅', 'success');
      logActivity?.('تحويل مالي', `تحويل بقيمة: ${transfer.amount || 0}`);
      if (refreshAllData) await refreshAllData();
    } catch (e: unknown) {
      lastTransferSubmissionRef.current = null;
      const errMsg = e instanceof Error ? e.message : String(e);
      showToast?.('فشل تسجيل التحويل المالي: ' + errMsg, 'error');
      throw e;
    }
  }, [targetOrgId, currentUser, refreshAllData, logActivity, showToast]);

  const updateTransfer = useCallback(async (id: string, transfer: Record<string, any>): Promise<void> => {
    const effectiveOrg = targetOrgId || currentUser?.organization_id;
    try {
      const fromId = transfer.sourceAccountId || transfer.source_account_id;
      const toId = transfer.destinationAccountId || transfer.destination_account_id;
      const date = transfer.date || transfer.transfer_date;
      const notes = transfer.description || transfer.notes || '';
      const { error } = await supabase.rpc('update_treasury_transfer', {
        p_journal_entry_id: id,
        p_from_account_id: fromId,
        p_to_account_id: toId,
        p_amount: transfer.amount,
        p_transfer_date: date,
        p_notes: notes
      });
      if (error) {
        const isFuncMissing = error.code === 'P0001' || error.message?.includes('function') || error.message?.includes('does not exist');
        if (isFuncMissing) {
          logger.warn('RPC update_treasury_transfer not found, falling back to direct journal updates');
          const { error: entryError } = await supabase.from('journal_entries').update({
            transaction_date: date,
            description: notes
          }).eq('id', id);
          if (entryError) throw entryError;

          const { error: linesDeleteError } = await supabase.from('journal_lines').delete().eq('journal_entry_id', id);
          if (linesDeleteError) throw linesDeleteError;

          const { error: linesInsertError } = await supabase.from('journal_lines').insert([
            {
              journal_entry_id: id,
              account_id: toId,
              debit: transfer.amount,
              credit: 0,
              description: 'تحويل وارد: ' + notes,
              organization_id: effectiveOrg
            },
            {
              journal_entry_id: id,
              account_id: fromId,
              debit: 0,
              credit: transfer.amount,
              description: 'تحويل صادر: ' + notes,
              organization_id: effectiveOrg
            }
          ]);
          if (linesInsertError) throw linesInsertError;

          if (effectiveOrg) {
            await supabase.rpc('recalculate_all_system_balances', { p_org_id: effectiveOrg });
          }
        } else {
          throw error;
        }
      }
      showToast?.('تم تعديل التحويل المالي بنجاح ✅', 'success');
      if (refreshAllData) await refreshAllData();
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      showToast?.('فشل تعديل التحويل المالي: ' + errMsg, 'error');
      throw e;
    }
  }, [targetOrgId, currentUser, refreshAllData, showToast]);

  const deleteTransfer = useCallback(async (id: string): Promise<void> => {
    const effectiveOrg = targetOrgId || currentUser?.organization_id;
    try {
      const { error } = await supabase.rpc('delete_treasury_transfer', {
        p_journal_entry_id: id
      });
      if (error) {
        const isFuncMissing = error.code === 'P0001' || error.message?.includes('function') || error.message?.includes('does not exist');
        if (isFuncMissing) {
          logger.warn('RPC delete_treasury_transfer not found, falling back to direct journal deletion');
          const { error: linesError } = await supabase.from('journal_lines').delete().eq('journal_entry_id', id);
          if (linesError) throw linesError;

          const { error: entryError } = await supabase.from('journal_entries').delete().eq('id', id);
          if (entryError) throw entryError;

          if (effectiveOrg) {
            await supabase.rpc('recalculate_all_system_balances', { p_org_id: effectiveOrg });
          }
        } else {
          throw error;
        }
      }
      showToast?.('تم حذف التحويل المالي بنجاح', 'info');
      if (refreshAllData) await refreshAllData();
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      showToast?.('فشل حذف التحويل المالي: ' + errMsg, 'error');
      throw e;
    }
  }, [targetOrgId, currentUser, refreshAllData, showToast]);

  const refreshAllBanking = useCallback(async () => {
    await Promise.all([fetchCheques(), fetchVouchers()]);
  }, [fetchCheques, fetchVouchers]);

  const value = useMemo<BankingDomainState>(() => ({
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
  }), [
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
    refreshAllBanking,
    fetchCheques,
    fetchVouchers,
  ]);

  return (
    <BankingContext.Provider value={value}>
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
