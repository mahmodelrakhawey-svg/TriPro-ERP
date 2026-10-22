import React, { useState, useMemo, useEffect } from 'react';
import { useAccounting, SYSTEM_ACCOUNTS } from '../../../../context/AccountingContext';
import { useToast } from '../../../../context/ToastContext';
import { cashShiftService, CashierShift } from '../../../../services/cashShiftService';
import { posService } from '../../services/posService';
import { isValidUUID } from '../../../../services/offlineService';
import {
  DollarSign,
  FileText,
  CheckCircle2,
  X,
  Building2,
  Receipt,
  PlusCircle,
  CalendarCheck,
  Landmark
} from 'lucide-react';

export type DrawerTxType = 'PAID_OUT_EXPENSE' | 'SAFE_DROP' | 'PAID_IN' | 'ADVANCE_DEPOSIT_IN';

interface PettyCashModalProps {
  shift?: CashierShift | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const PettyCashModal: React.FC<PettyCashModalProps> = ({ shift, onClose, onSuccess }) => {
  const { accounts, costCenters, currentUser, currentShift } = useAccounting();
  const { showToast } = useToast();

  const [txType, setTxType] = useState<DrawerTxType>('PAID_OUT_EXPENSE');
  const [amount, setAmount] = useState<number>(0);
  const [reason, setReason] = useState<string>('');
  const [expenseAccountId, setExpenseAccountId] = useState<string>('');
  const [cashAccountId, setCashAccountId] = useState<string>('');
  const [targetVaultAccountId, setTargetVaultAccountId] = useState<string>('');
  const [costCenterId, setCostCenterId] = useState<string>('');
  const [custodianName, setCustodianName] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Common quick reasons for expenses
  const quickReasons = [
    'شراء خضروات / مستلزمات طازجة طارئة',
    'مستلزمات نظافة وتطهير',
    'مصاريف صيانة أو أدوات طارئة',
    'إكراميات أو وقود دليفري سريع',
    'دفعة مورد نقدي فوري'
  ];

  // حسابات المصروفات الفرعية
  const expenseAccounts = useMemo(() => {
    return accounts.filter(a => 
      !a.is_group && (
        a.type === 'EXPENSE' || 
        (a.type as string)?.toUpperCase() === 'EXPENSE' || 
        a.code?.startsWith('5')
      )
    );
  }, [accounts]);

  // حسابات الصندوق والدرج الفرعية
  const cashAccounts = useMemo(() => {
    return accounts.filter(a => 
      !a.is_group && (
        a.code === SYSTEM_ACCOUNTS.CASH ||
        a.code?.startsWith('1231') ||
        a.code?.startsWith('1101') ||
        a.name?.includes('صندوق') || 
        a.name?.includes('درج') || 
        a.name?.includes('نقدية')
      )
    );
  }, [accounts]);

  // حسابات الخزائن الرئيسية والمصارف
  const vaultAccounts = useMemo(() => {
    return accounts.filter(a =>
      !a.is_group && (
        a.code?.startsWith('1232') ||
        a.code?.startsWith('121') ||
        a.code?.startsWith('1102') ||
        a.name?.includes('رئيسي') ||
        a.name?.includes('خزينة')
      )
    );
  }, [accounts]);

  // حسابات الدفعات المقدمة والعربونات (الالتزامات)
  const advanceDepositAccounts = useMemo(() => {
    return accounts.filter(a =>
      !a.is_group && (
        a.code?.startsWith('20102') ||
        a.code?.startsWith('2202') ||
        a.code?.startsWith('2102') ||
        a.name?.includes('عربون') ||
        a.name?.includes('دفعات مقدمة')
      )
    );
  }, [accounts]);

  useEffect(() => {
    if (!expenseAccountId && expenseAccounts.length > 0) {
      setExpenseAccountId(expenseAccounts[0].id);
    }
  }, [expenseAccounts, expenseAccountId]);

  useEffect(() => {
    if (!cashAccountId && cashAccounts.length > 0) {
      setCashAccountId(cashAccounts[0].id);
    }
  }, [cashAccounts, cashAccountId]);

  useEffect(() => {
    if (!targetVaultAccountId && vaultAccounts.length > 0) {
      setTargetVaultAccountId(vaultAccounts[0].id);
    }
  }, [vaultAccounts, targetVaultAccountId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0) {
      showToast('يرجى إدخال مبلغ صحيح للحركة', 'warning');
      return;
    }
    if (!reason.trim()) {
      showToast('يرجى توضيح سبب وبيان الحركة النقدية', 'warning');
      return;
    }

    interface ShiftLike {
      id?: string;
      cashier_id?: string;
      cashier_name?: string;
    }
    const activeShiftObj = (shift || cashShiftService.getActiveShift(currentUser?.id) || currentShift) as ShiftLike | null;
    const rawShiftId = activeShiftObj?.id;
    const effectiveShiftId = (rawShiftId && isValidUUID(rawShiftId)) ? rawShiftId : null;

    let targetAccId: string | undefined = undefined;
    if (txType === 'PAID_OUT_EXPENSE') targetAccId = expenseAccountId || expenseAccounts[0]?.id;
    else if (txType === 'SAFE_DROP') targetAccId = targetVaultAccountId || vaultAccounts[0]?.id;
    else if (txType === 'ADVANCE_DEPOSIT_IN') targetAccId = advanceDepositAccounts[0]?.id;

    setIsSubmitting(true);
    try {
      // 1. تسجيل الحركة في قاعدة البيانات عبر دالة الدرج الموحدة (PostgreSQL)
      if (effectiveShiftId) {
        await posService.recordDrawerTransaction({
          shiftId: effectiveShiftId,
          type: txType,
          amount,
          reason,
          accountId: targetAccId,
          custodianName: custodianName || undefined,
          orgId: currentUser?.organization_id || undefined
        });
      }

      // 2. مزامنة الحركة محلياً مع cashShiftService
      try {
        await cashShiftService.recordPettyCashPayout({
          shiftId: rawShiftId || `shift_${Date.now()}`,
          cashierId: activeShiftObj?.cashier_id || currentUser?.id || '',
          cashierName: activeShiftObj?.cashier_name || currentUser?.full_name || 'الكاشير',
          organizationId: currentUser?.organization_id || '',
          amount,
          reason,
          expenseAccountId: txType === 'PAID_OUT_EXPENSE' ? targetAccId : undefined,
          cashAccountId: cashAccountId || cashAccounts[0]?.id,
          costCenterId: costCenterId || undefined
        });
      } catch (localErr) {
        // Ignored
      }

      showToast(`تم تسجيل حركة الدرج (${amount} ج) بنجاح 💵`, 'success');
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ غير متوقع';
      showToast('خطأ: ' + msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in" dir="rtl">
      <div className="bg-white text-slate-900 rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden space-y-4 p-6">
        {/* Header */}
        <div className="flex justify-between items-center border-b pb-3">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-2xl ${
              txType === 'PAID_OUT_EXPENSE' ? 'bg-amber-100 text-amber-700' :
              txType === 'SAFE_DROP' ? 'bg-blue-100 text-blue-700' :
              txType === 'PAID_IN' ? 'bg-emerald-100 text-emerald-700' :
              'bg-teal-100 text-teal-700'
            }`}>
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-black text-lg text-slate-800">حركات نقدية الدرج (Cash Drawer Transactions)</h3>
              <p className="text-xs text-slate-500">مصروفات نثرية، توريدات، وتزويد فكة</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Transaction Type Selector */}
        <div className="grid grid-cols-2 gap-2 text-xs font-bold">
          <button
            type="button"
            onClick={() => {
              setTxType('PAID_OUT_EXPENSE');
              setReason('');
            }}
            className={`p-2.5 rounded-xl border flex items-center gap-2 transition ${
              txType === 'PAID_OUT_EXPENSE'
                ? 'border-amber-500 bg-amber-50 text-amber-800 shadow-sm'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Receipt size={16} className="text-amber-600" />
            <span>صرف مصروف نثري (Paid Out)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setTxType('SAFE_DROP');
              setReason('توريد نقدية فائضة لخزينة الإدارة');
            }}
            className={`p-2.5 rounded-xl border flex items-center gap-2 transition ${
              txType === 'SAFE_DROP'
                ? 'border-blue-500 bg-blue-50 text-blue-800 shadow-sm'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Building2 size={16} className="text-blue-600" />
            <span>توريد لخزينة رئيسية (Drop)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setTxType('PAID_IN');
              setReason('تزويد نقدية فكة بالدرج');
            }}
            className={`p-2.5 rounded-xl border flex items-center gap-2 transition ${
              txType === 'PAID_IN'
                ? 'border-emerald-500 bg-emerald-50 text-emerald-800 shadow-sm'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <PlusCircle size={16} className="text-emerald-600" />
            <span>تزويد فكة بالدرج (Paid In)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setTxType('ADVANCE_DEPOSIT_IN');
              setReason('استلام عربون حجز نقداً');
            }}
            className={`p-2.5 rounded-xl border flex items-center gap-2 transition ${
              txType === 'ADVANCE_DEPOSIT_IN'
                ? 'border-teal-500 bg-teal-50 text-teal-800 shadow-sm'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <CalendarCheck size={16} className="text-teal-600" />
            <span>استلام عربون حجز نقداً</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Quick Reasons for Expenses */}
          {txType === 'PAID_OUT_EXPENSE' && (
            <div>
              <label className="block text-slate-600 font-bold mb-1.5">أسباب سريعة متكررة:</label>
              <div className="flex flex-wrap gap-1.5">
                {quickReasons.map((r, i) => (
                  <button
                    type="button"
                    key={i}
                    onClick={() => setReason(r)}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-amber-100 hover:text-amber-800 rounded-lg text-[11px] font-semibold text-slate-600 transition"
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="block text-slate-700 font-bold mb-1">المبلغ (جنيه):</label>
            <input
              type="number"
              min="0.5"
              step="0.5"
              required
              value={amount || ''}
              onChange={e => setAmount(parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              className="w-full text-2xl font-black border rounded-2xl p-3 text-center outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-slate-900"
            />
          </div>

          {/* Reason */}
          <div>
            <label className="block text-slate-700 font-bold mb-1">البيان وسبب الحركة:</label>
            <input
              type="text"
              required
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="مثال: شراء مستلزمات طارئة، أو توريد للإدارة..."
              className="w-full border rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 font-medium"
            />
          </div>

          {/* Safe Drop: Target Vault */}
          {txType === 'SAFE_DROP' && vaultAccounts.length > 0 && (
            <div>
              <label className="block text-slate-700 font-bold mb-1">الخزينة المستهدفة للتوريد:</label>
              <select
                value={targetVaultAccountId}
                onChange={e => setTargetVaultAccountId(e.target.value)}
                className="w-full border rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900 text-xs font-semibold"
              >
                {vaultAccounts.map(acc => (
                  <option key={acc.id} value={acc.id} className="text-slate-900 bg-white">
                    {acc.code} - {acc.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Paid Out: Expense Account */}
          {txType === 'PAID_OUT_EXPENSE' && (
            <div>
              <label className="block text-slate-700 font-bold mb-1">حساب المصروف المدين (فرعي):</label>
              <select
                value={expenseAccountId}
                onChange={e => setExpenseAccountId(e.target.value)}
                className="w-full border rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-amber-500 bg-white text-slate-900 text-xs font-semibold"
              >
                {expenseAccounts.map(acc => (
                  <option key={acc.id} value={acc.id} className="text-slate-900 bg-white">
                    {acc.code} - {acc.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Custodian / Receiver Name */}
          {(txType === 'SAFE_DROP' || txType === 'PAID_OUT_EXPENSE') && (
            <div>
              <label className="block text-slate-700 font-bold mb-1">اسم المستلم / العهدة (اختياري):</label>
              <input
                type="text"
                value={custodianName}
                onChange={e => setCustodianName(e.target.value)}
                placeholder="اسم أمين الخزينة أو المستلم..."
                className="w-full border rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 text-xs"
              />
            </div>
          )}

          {/* Cost Center */}
          {txType === 'PAID_OUT_EXPENSE' && costCenters && costCenters.length > 0 && (
            <div>
              <label className="block text-slate-700 font-bold mb-1">مركز التكلفة (اختياري):</label>
              <select
                value={costCenterId}
                onChange={e => setCostCenterId(e.target.value)}
                className="w-full border rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-amber-500 bg-white"
              >
                <option value="">بدون مركز تكلفة</option>
                {costCenters.map(cc => (
                  <option key={cc.id} value={cc.id}>
                    {cc.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2.5 pt-3 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-md transition"
            >
              <CheckCircle2 className="w-4 h-4" /> حفظ وإثبات حركة الدرج
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PettyCashModal;
