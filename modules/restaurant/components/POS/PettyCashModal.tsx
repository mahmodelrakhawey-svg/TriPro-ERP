import React, { useState, useMemo, useEffect } from 'react';
import { useAccounting, SYSTEM_ACCOUNTS } from '../../../../context/AccountingContext';
import { useToast } from '../../../../context/ToastContext';
import { cashShiftService, CashierShift } from '../../../../services/cashShiftService';
import {
  DollarSign,
  FileText,
  CheckCircle2,
  X,
  Upload,
  Layers,
  Sparkles
} from 'lucide-react';

interface PettyCashModalProps {
  shift?: CashierShift | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const PettyCashModal: React.FC<PettyCashModalProps> = ({ shift, onClose, onSuccess }) => {
  const { accounts, costCenters, currentUser } = useAccounting();
  const { showToast } = useToast();

  const [amount, setAmount] = useState<number>(0);
  const [reason, setReason] = useState<string>('');
  const [expenseAccountId, setExpenseAccountId] = useState<string>('');
  const [cashAccountId, setCashAccountId] = useState<string>('');
  const [costCenterId, setCostCenterId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Common quick reasons
  const quickReasons = [
    'شراء خضروات / مستلزمات طازجة طارئة',
    'مستلزمات نظافة وتطهير',
    'مصاريف صيانة أو أدوات طارئة',
    'إكراميات أو وقود دليفري سريع',
    'دفعة مورد نقدي فوري'
  ];

  // 🛡️ تصفية حسابات المصروفات الفرعية فقط (استبعاد الحسابات الرئيسية/المجموعات لمنع الخطأ المحاسبي)
  const expenseAccounts = useMemo(() => {
    return accounts.filter(a => 
      !a.is_group && (
        a.type === 'EXPENSE' || 
        (a.type as any) === 'expense' || 
        a.code?.startsWith('5')
      )
    );
  }, [accounts]);

  // 🛡️ تصفية حسابات الصندوق والدرج الفرعية فقط
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0) {
      showToast('يرجى إدخال مبلغ صحيح للصرف', 'warning');
      return;
    }
    if (!reason.trim()) {
      showToast('يرجى توضيح سبب الصرف النثري', 'warning');
      return;
    }

    const selectedExpenseAcc = expenseAccountId || expenseAccounts[0]?.id;
    const selectedCashAcc = cashAccountId || cashAccounts[0]?.id;

    if (!selectedExpenseAcc) {
      showToast('⚠️ لا يوجد حساب مصروف فرعي متاح في شجرة الحسابات. يرجى إضافة حساب مصروف فرعي أولاً.', 'error');
      return;
    }

    if (!selectedCashAcc) {
      showToast('⚠️ لا يوجد حساب صندوق فرعي متاح في شجرة الحسابات. يرجى إضافة حساب فرعي للنقدية بالدرج أولاً.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const activeShift = shift || cashShiftService.getActiveShift(currentUser?.id);
      const res = await cashShiftService.recordPettyCashPayout({
        shiftId: activeShift?.id || `shift_${Date.now()}`,
        cashierId: activeShift?.cashier_id || currentUser?.id || '',
        cashierName: activeShift?.cashier_name || (currentUser as any)?.full_name || 'الكاشير',
        organizationId: currentUser?.organization_id || '',
        amount,
        reason,
        expenseAccountId: selectedExpenseAcc,
        cashAccountId: selectedCashAcc,
        costCenterId: costCenterId || undefined
      });

      if (res.success) {
        showToast(`تم تسجيل صرف ${amount} ج من الدرج وإثبات القيد المحاسبي بنجاح 💸`, 'success');
        onSuccess();
      } else {
        showToast('خطأ: ' + res.error, 'error');
      }
    } catch (err: any) {
      showToast('خطأ: ' + err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden space-y-4 p-6">
        {/* Header */}
        <div className="flex justify-between items-center border-b pb-3">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-100 text-amber-700 rounded-2xl">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-slate-800">صرف نثري من الدرج (Petty Cash)</h3>
              <p className="text-xs text-slate-400">سحب مصروف طارئ وإثباته بالقيد المحاسبي</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Quick Reasons */}
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

          {/* Amount */}
          <div>
            <label className="block text-slate-700 font-bold mb-1">المبلغ المصروف من الدرج (ج):</label>
            <input
              type="number"
              min="0.5"
              step="0.5"
              required
              value={amount || ''}
              onChange={e => setAmount(parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              className="w-full text-2xl font-bold border rounded-2xl p-3 text-center outline-none focus:ring-2 focus:ring-amber-500 font-mono text-amber-700"
            />
          </div>

          {/* Reason */}
          <div>
            <label className="block text-slate-700 font-bold mb-1">بيان وسبب الصرف بالتفصيل:</label>
            <input
              type="text"
              required
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="مثال: شراء كيس ليمون وطماطم طارئ للمطبخ..."
              className="w-full border rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {/* Cash Account */}
          {cashAccounts.length > 1 && (
            <div>
              <label className="block text-slate-700 font-bold mb-1">صندوق الدرج المنصرف منه (الدائن):</label>
              <select
                value={cashAccountId}
                onChange={e => setCashAccountId(e.target.value)}
                className="w-full border rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-amber-500 bg-white text-sm"
              >
                {cashAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Expense Account */}
          <div>
            <label className="block text-slate-700 font-bold mb-1">حساب المصروف المدين (فرعي):</label>
            <select
              value={expenseAccountId}
              onChange={e => setExpenseAccountId(e.target.value)}
              className="w-full border rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-amber-500 bg-white text-sm"
            >
              {expenseAccounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.code} - {acc.name}
                </option>
              ))}
            </select>
          </div>

          {/* Cost Center */}
          {costCenters && costCenters.length > 0 && (
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
              className="px-4 py-2 border border-slate-300 rounded-xl font-bold text-slate-600"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold flex items-center gap-1.5 shadow"
            >
              <CheckCircle2 className="w-4 h-4" /> تأكيد وسحب من الدرج
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
export default PettyCashModal;
