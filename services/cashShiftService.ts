/**
 * ==============================================================================
 * Cash Shift & Blind Close Service
 * TriPro ERP — services/cashShiftService.ts
 * ==============================================================================
 */

import { supabase } from '../supabaseClient';
import { AccountingEngine } from './accountingEngine';
import { secureStorage } from '../utils/securityMiddleware';
import { v4 as uuidv4 } from 'uuid';

export interface CashDenominationBreakdown {
  bill200: number;
  bill100: number;
  bill50: number;
  bill20: number;
  bill10: number;
  bill5: number;
  coins: number;
}

export interface CashierShift {
  id: string;
  organization_id?: string | null;
  cashier_id: string;
  cashier_name: string;
  opened_at: string;
  closed_at?: string | null;
  opening_float: number;
  
  total_cash_sales: number;
  total_card_sales: number;
  total_petty_cash_payouts: number;
  total_cash_in: number;
  total_tips_collected: number;
  expected_cash_in_drawer: number;
  
  actual_cash_counted?: number | null;
  cash_difference?: number | null;
  cash_breakdown?: CashDenominationBreakdown | null;
  
  status: 'OPEN' | 'BLIND_SUBMITTED' | 'CLOSED';
  closing_notes?: string;
  adjustment_journal_entry_id?: string | null;
}

export interface PettyCashPayout {
  id: string;
  organization_id?: string | null;
  shift_id: string;
  cashier_id: string;
  cashier_name: string;
  amount: number;
  payout_type: 'EXPENSE' | 'SAFE_DROP' | 'SUPPLIER_PAYMENT';
  reason: string;
  expense_account_id?: string | null;
  cost_center_id?: string | null;
  receipt_attachment_url?: string | null;
  journal_entry_id?: string | null;
  created_at: string;
}

const LOCAL_SHIFTS_KEY = 'tripro_cashier_shifts_v1';
const LOCAL_PAYOUTS_KEY = 'tripro_petty_cash_payouts_v1';
const ACTIVE_SHIFT_KEY = 'tripro_active_cashier_shift_id_v1';

class CashShiftService {
  public getShifts(organizationId?: string): CashierShift[] {
    const shifts = secureStorage.getItem<CashierShift[]>(LOCAL_SHIFTS_KEY);
    if (shifts && Array.isArray(shifts)) return shifts;
    return [];
  }

  public getActiveShift(cashierId?: string): CashierShift | null {
    const shifts = this.getShifts();
    if (cashierId) {
      return shifts.find(s => s.cashier_id === cashierId && s.status === 'OPEN') || null;
    }
    const activeId = secureStorage.getItem<string>(ACTIVE_SHIFT_KEY);
    if (activeId) {
      const found = shifts.find(s => s.id === activeId && s.status === 'OPEN');
      if (found) return found;
    }
    return shifts.find(s => s.status === 'OPEN') || null;
  }

  public openShift(params: {
    organizationId?: string;
    cashierId: string;
    cashierName: string;
    openingFloat: number;
  }): CashierShift {
    const shiftId = uuidv4();
    const newShift: CashierShift = {
      id: shiftId,
      organization_id: params.organizationId || null,
      cashier_id: params.cashierId,
      cashier_name: params.cashierName,
      opened_at: new Date().toISOString(),
      opening_float: Number(params.openingFloat || 0),
      total_cash_sales: 0,
      total_card_sales: 0,
      total_petty_cash_payouts: 0,
      total_cash_in: 0,
      total_tips_collected: 0,
      expected_cash_in_drawer: Number(params.openingFloat || 0),
      status: 'OPEN'
    };

    const shifts = this.getShifts();
    const updated = [newShift, ...shifts.filter(s => s.id !== newShift.id)];
    secureStorage.setItem(LOCAL_SHIFTS_KEY, updated);
    secureStorage.setItem(ACTIVE_SHIFT_KEY, newShift.id);

    const isValidUUID = (str?: string | null) =>
      Boolean(str && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str));

    // Sync to Supabase safely
    supabase
      .from('cashier_shifts')
      .insert({
        id: newShift.id,
        organization_id: isValidUUID(newShift.organization_id) ? newShift.organization_id : null,
        cashier_id: isValidUUID(newShift.cashier_id) ? newShift.cashier_id : null,
        cashier_name: newShift.cashier_name,
        opening_float: newShift.opening_float,
        status: 'OPEN'
      })
      .then(
        ({ error }) => {
          if (error) {
            console.warn('cashier_shifts sync notice:', error.message);
          }
        },
        err => {
          console.warn('cashier_shifts sync network notice:', err);
        }
      );

    return newShift;
  }

  public recordSaleToShift(params: {
    shiftId: string;
    cashAmount: number;
    cardAmount: number;
    tipsAmount?: number;
  }): void {
    const shifts = this.getShifts();
    const updated = shifts.map(s => {
      if (s.id === params.shiftId && s.status === 'OPEN') {
        const cashSales = s.total_cash_sales + params.cashAmount;
        const cardSales = s.total_card_sales + params.cardAmount;
        const tips = s.total_tips_collected + (params.tipsAmount || 0);
        const expected = s.opening_float + cashSales + s.total_cash_in - s.total_petty_cash_payouts;

        return {
          ...s,
          total_cash_sales: Number(cashSales.toFixed(2)),
          total_card_sales: Number(cardSales.toFixed(2)),
          total_tips_collected: Number(tips.toFixed(2)),
          expected_cash_in_drawer: Number(expected.toFixed(2))
        };
      }
      return s;
    });
    secureStorage.setItem(LOCAL_SHIFTS_KEY, updated);
  }

  /**
   * تسجيل صرف نثري فوري من درج الكاشير مع قيد اليومية التلقائي
   */
  public async recordPettyCashPayout(params: {
    shiftId: string;
    cashierId: string;
    cashierName: string;
    organizationId: string;
    amount: number;
    reason: string;
    expenseAccountId?: string;
    cashAccountId?: string;
    costCenterId?: string;
    receiptAttachmentUrl?: string;
  }): Promise<{ success: boolean; payout?: PettyCashPayout; error?: string }> {
    let journalEntryId: string | null = null;

    if (params.expenseAccountId && params.cashAccountId) {
      try {
        const jRes = await AccountingEngine.createJournalEntry({
          organizationId: params.organizationId,
          transactionDate: new Date().toISOString().split('T')[0],
          reference: `PC-${Date.now().toString().slice(-6)}`,
          description: `صرف نثري فوري من درج الكاشير (${params.cashierName}): ${params.reason}`,
          lines: [
            {
              accountId: params.expenseAccountId, // مدين: حساب المصروف
              debit: params.amount,
              credit: 0,
              description: params.reason
            },
            {
              accountId: params.cashAccountId, // دائن: نقدية الدرج
              debit: 0,
              credit: params.amount,
              description: `سحب نقدي من الدرج - ${params.cashierName}`
            }
          ],
          status: 'posted'
        });

        if (jRes.success) {
          journalEntryId = jRes.journalEntryId || null;
        }
      } catch (err) {
        console.warn('Journal entry for petty cash notice:', err);
      }
    }

    const payout: PettyCashPayout = {
      id: `payout_${Date.now()}`,
      organization_id: params.organizationId,
      shift_id: params.shiftId,
      cashier_id: params.cashierId,
      cashier_name: params.cashierName,
      amount: params.amount,
      payout_type: 'EXPENSE',
      reason: params.reason,
      expense_account_id: params.expenseAccountId || null,
      cost_center_id: params.costCenterId || null,
      receipt_attachment_url: params.receiptAttachmentUrl || null,
      journal_entry_id: journalEntryId,
      created_at: new Date().toISOString()
    };

    // Save payout
    const payouts = secureStorage.getItem<PettyCashPayout[]>(LOCAL_PAYOUTS_KEY) || [];
    secureStorage.setItem(LOCAL_PAYOUTS_KEY, [payout, ...payouts]);

    // Update shift drawer balance
    const shifts = this.getShifts();
    const updatedShifts = shifts.map(s => {
      if (s.id === params.shiftId) {
        const newPayouts = s.total_petty_cash_payouts + params.amount;
        const expected = s.opening_float + s.total_cash_sales + s.total_cash_in - newPayouts;
        return {
          ...s,
          total_petty_cash_payouts: Number(newPayouts.toFixed(2)),
          expected_cash_in_drawer: Number(expected.toFixed(2))
        };
      }
      return s;
    });
    secureStorage.setItem(LOCAL_SHIFTS_KEY, updatedShifts);

    return { success: true, payout };
  }

  /**
   * تنفيذ الجرد الأعمى وإغلاق الوردية
   */
  public async submitBlindClose(params: {
    shiftId: string;
    actualCountedAmount: number;
    breakdown?: CashDenominationBreakdown;
    closingNotes?: string;
    organizationId?: string;
    cashAccountId?: string;
    shortageOverAccountId?: string;
  }): Promise<{ shift: CashierShift; difference: number; isBalanced: boolean }> {
    const shifts = this.getShifts();
    const targetShift = shifts.find(s => s.id === params.shiftId);
    if (!targetShift) throw new Error('الوردية غير موجودة');

    const expected = targetShift.expected_cash_in_drawer;
    const actual = Number(params.actualCountedAmount || 0);
    const difference = Number((actual - expected).toFixed(2)); // موجب: زيادة / سالب: عجز
    const isBalanced = Math.abs(difference) <= 0.01;

    let adjustmentJeId: string | null = null;

    // إنشاء قيد تسوية العجز أو الزيادة إذا وجد
    if (!isBalanced && params.cashAccountId && params.shortageOverAccountId && params.organizationId) {
      try {
        const isShortage = difference < 0;
        const absDiff = Math.abs(difference);

        const jRes = await AccountingEngine.createJournalEntry({
          organizationId: params.organizationId,
          transactionDate: new Date().toISOString().split('T')[0],
          reference: `SHIFT-ADJ-${targetShift.id.slice(-5)}`,
          description: isShortage
            ? `تسوية عجز نقدية وردية الكاشير (${targetShift.cashier_name})`
            : `تسوية زيادة نقدية وردية الكاشير (${targetShift.cashier_name})`,
          lines: isShortage
            ? [
                {
                  accountId: params.shortageOverAccountId, // مدين: حساب عجز وخسائر الصندوق
                  debit: absDiff,
                  credit: 0,
                  description: 'عجز نقدي بالصندوق'
                },
                {
                  accountId: params.cashAccountId, // دائن: خفض رصيد الصندوق
                  debit: 0,
                  credit: absDiff,
                  description: 'تخفيض عجز الصندوق'
                }
              ]
            : [
                {
                  accountId: params.cashAccountId, // مدين: زيادة رصيد الصندوق
                  debit: absDiff,
                  credit: 0,
                  description: 'إثبات زيادة الصندوق'
                },
                {
                  accountId: params.shortageOverAccountId, // دائن: حساب أرباح وزيادات الصندوق
                  debit: 0,
                  credit: absDiff,
                  description: 'زيادة نقدية بالصندوق'
                }
              ],
          status: 'posted'
        });

        if (jRes.success) {
          adjustmentJeId = jRes.journalEntryId || null;
        }
      } catch (e) {
        console.warn('Shift adjustment JE notice:', e);
      }
    }

    const closedShift: CashierShift = {
      ...targetShift,
      closed_at: new Date().toISOString(),
      actual_cash_counted: actual,
      cash_difference: difference,
      cash_breakdown: params.breakdown || null,
      status: 'CLOSED',
      closing_notes: params.closingNotes || '',
      adjustment_journal_entry_id: adjustmentJeId
    };

    const updatedShifts = shifts.map(s => (s.id === params.shiftId ? closedShift : s));
    secureStorage.setItem(LOCAL_SHIFTS_KEY, updatedShifts);
    secureStorage.removeItem(ACTIVE_SHIFT_KEY);

    return { shift: closedShift, difference, isBalanced };
  }
}

export const cashShiftService = new CashShiftService();
