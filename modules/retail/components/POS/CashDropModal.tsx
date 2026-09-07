import React, { useState, useEffect } from 'react';
import { Banknote, Printer, X, AlertCircle, Building2, Landmark, Receipt } from 'lucide-react';
import { useToast } from '../../../../context/ToastContext';
import { supabase } from '../../../../supabaseClient';

export type CashDropPayoutType = 'EXPENSE' | 'CUSTODIAN' | 'VAULT_TRANSFER';

interface AccountOption {
  id: string;
  name: string;
  code: string;
}

interface CashDropModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (
    amount: number,
    reason: string,
    receiverName: string,
    payoutType: CashDropPayoutType,
    expenseAccountId?: string,
    targetAccountId?: string
  ) => void;
  currentDrawerTotal: number;
  cashierName: string;
  organizationId?: string;
}

const PAYOUT_TYPES: { value: CashDropPayoutType; label: string; icon: React.ReactNode; color: string; desc: string }[] = [
  {
    value: 'EXPENSE',
    label: 'دفع مصروف',
    icon: <Receipt size={18} />,
    color: 'border-red-400 bg-red-50 text-red-700',
    desc: 'دفع مصاريف مباشرة من الدرج (كهرباء، نظافة، مستلزمات)'
  },
  {
    value: 'CUSTODIAN',
    label: 'سحب عهدة',
    icon: <Landmark size={18} />,
    color: 'border-purple-400 bg-purple-50 text-purple-700',
    desc: 'سحب نقدية كعهدة مع المدير أو الأمين (تُسترد لاحقاً)'
  },
  {
    value: 'VAULT_TRANSFER',
    label: 'تحويل لخزينة',
    icon: <Building2 size={18} />,
    color: 'border-blue-400 bg-blue-50 text-blue-700',
    desc: 'توريد نقدية فائضة إلى خزينة الإدارة أو خزينة أخرى'
  }
];

export default function CashDropModal({
  isOpen,
  onClose,
  onConfirm,
  currentDrawerTotal,
  cashierName,
  organizationId
}: CashDropModalProps) {
  const { showToast } = useToast();

  const [amount, setAmount] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [receiverName, setReceiverName] = useState<string>('');
  const [payoutType, setPayoutType] = useState<CashDropPayoutType>('VAULT_TRANSFER');
  const [selectedExpenseAccount, setSelectedExpenseAccount] = useState<string>('');
  const [selectedTargetAccount, setSelectedTargetAccount] = useState<string>('');

  const [expenseAccounts, setExpenseAccounts] = useState<AccountOption[]>([]);
  const [vaultAccounts, setVaultAccounts] = useState<AccountOption[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  // جلب الحسابات عند فتح النافذة
  useEffect(() => {
    if (!isOpen || !organizationId) return;
    const fetchAccounts = async () => {
      setLoadingAccounts(true);
      try {
        // حسابات المصروفات (5xx)
        const { data: expData } = await supabase
          .from('accounts')
          .select('id, name, code')
          .eq('organization_id', organizationId)
          .eq('is_active', true)
          .like('code', '5%')
          .order('code');

        // حسابات الصناديق/الخزائن (12xx / 11xx)
        const { data: vaultData } = await supabase
          .from('accounts')
          .select('id, name, code')
          .eq('organization_id', organizationId)
          .eq('is_active', true)
          .or('code.like.12%,code.like.11%')
          .order('code');

        setExpenseAccounts((expData || []) as AccountOption[]);
        setVaultAccounts((vaultData || []) as AccountOption[]);
      } catch (err) {
        console.warn('Could not load accounts for CashDropModal:', err);
      } finally {
        setLoadingAccounts(false);
      }
    };
    fetchAccounts();
  }, [isOpen, organizationId]);

  // إعادة ضبط الحقول عند تغيير نوع السحب
  useEffect(() => {
    setSelectedExpenseAccount('');
    setSelectedTargetAccount('');
    setReason(
      payoutType === 'VAULT_TRANSFER' ? 'توريد نقدية فائضة لخزينة الإدارة' :
      payoutType === 'CUSTODIAN'      ? 'سحب عهدة نقدية' :
      ''
    );
  }, [payoutType]);

  if (!isOpen) return null;

  const selectedType = PAYOUT_TYPES.find(t => t.value === payoutType)!;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);

    if (isNaN(numAmount) || numAmount <= 0) {
      showToast('يرجى إدخال مبلغ صحيح', 'error');
      return;
    }
    if (numAmount > currentDrawerTotal) {
      if (!window.confirm(`المبلغ (${numAmount.toFixed(2)}) أكبر من الرصيد التقديري بالدرج (${currentDrawerTotal.toFixed(2)}). هل تريد المتابعة؟`)) {
        return;
      }
    }
    if (payoutType === 'EXPENSE' && !selectedExpenseAccount) {
      showToast('يرجى اختيار حساب المصروف', 'error');
      return;
    }
    if (payoutType === 'VAULT_TRANSFER' && !selectedTargetAccount) {
      showToast('يرجى اختيار الخزينة المستهدفة', 'error');
      return;
    }
    if ((payoutType === 'CUSTODIAN') && !receiverName.trim()) {
      showToast('يرجى إدخال اسم المستلم (العهدة)', 'error');
      return;
    }

    onConfirm(
      numAmount,
      reason || selectedType.label,
      receiverName,
      payoutType,
      payoutType === 'EXPENSE' ? selectedExpenseAccount : undefined,
      payoutType === 'VAULT_TRANSFER' ? selectedTargetAccount :
      payoutType === 'CUSTODIAN'      ? selectedTargetAccount || undefined : undefined
    );

    showToast(`✅ تم تسجيل ${selectedType.label} بمبلغ ${numAmount.toFixed(2)} ج.م`, 'success');

    // إعادة ضبط
    setAmount('');
    setReason('');
    setReceiverName('');
    setSelectedExpenseAccount('');
    setSelectedTargetAccount('');
    setPayoutType('VAULT_TRANSFER');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in duration-150 max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="bg-gradient-to-r from-amber-600 to-orange-600 text-white p-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2 font-bold text-lg">
            <Banknote size={24} className="text-amber-200" />
            <span>سحب نقدية من الدرج</span>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">

          {/* معلومات الوردية */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              <span className="text-slate-500 block">الكاشير:</span>
              <span className="font-bold text-slate-800">{cashierName}</span>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              <span className="text-slate-500 block">الرصيد التقديري:</span>
              <span className="font-bold text-emerald-600 text-sm">{currentDrawerTotal.toFixed(2)} ج.م</span>
            </div>
          </div>

          {/* ── اختيار نوع السحب ── */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">نوع السحب *</label>
            <div className="grid grid-cols-3 gap-2">
              {PAYOUT_TYPES.map(type => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setPayoutType(type.value)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-center transition-all text-xs font-bold ${
                    payoutType === type.value
                      ? type.color + ' border-opacity-100 shadow-sm'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {type.icon}
                  <span>{type.label}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-1.5 pr-1">{selectedType.desc}</p>
          </div>

          {/* ── المبلغ ── */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">المبلغ (ج.م) *</label>
            <input
              type="number"
              step="0.01"
              min="1"
              autoFocus
              required
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2.5 text-lg font-bold text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-left"
            />
          </div>

          {/* ── حساب المصروف (EXPENSE فقط) ── */}
          {payoutType === 'EXPENSE' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">حساب المصروف *</label>
              {loadingAccounts ? (
                <div className="text-xs text-slate-400 py-2">جارٍ تحميل الحسابات…</div>
              ) : (
                <select
                  required
                  value={selectedExpenseAccount}
                  onChange={e => setSelectedExpenseAccount(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-red-400 outline-none bg-white"
                >
                  <option value="">— اختر حساب المصروف —</option>
                  {expenseAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* ── الخزينة المستهدفة (VAULT_TRANSFER فقط) ── */}
          {payoutType === 'VAULT_TRANSFER' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الخزينة المستهدفة *</label>
              {loadingAccounts ? (
                <div className="text-xs text-slate-400 py-2">جارٍ تحميل الخزائن…</div>
              ) : (
                <select
                  required
                  value={selectedTargetAccount}
                  onChange={e => setSelectedTargetAccount(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-400 outline-none bg-white"
                >
                  <option value="">— اختر الخزينة —</option>
                  {vaultAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* ── حساب العهدة الاختياري (CUSTODIAN) ── */}
          {payoutType === 'CUSTODIAN' && vaultAccounts.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">حساب العهدة (اختياري — الافتراضي 1224)</label>
              <select
                value={selectedTargetAccount}
                onChange={e => setSelectedTargetAccount(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-purple-400 outline-none bg-white"
              >
                <option value="">— الافتراضي (عهدة الموظفين 1224) —</option>
                {vaultAccounts.filter(a => a.code.startsWith('12') || a.code.startsWith('14')).map(a => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* ── اسم المستلم ── */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {payoutType === 'CUSTODIAN' ? 'اسم المستلم (صاحب العهدة) *' : 'اسم المستلم / المشرف'}
            </label>
            <input
              type="text"
              required={payoutType === 'CUSTODIAN'}
              value={receiverName}
              onChange={e => setReceiverName(e.target.value)}
              placeholder={payoutType === 'CUSTODIAN' ? 'اسم الموظف أو المدير' : 'اختياري'}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none"
            />
          </div>

          {/* ── البيان ── */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">البيان / الملاحظات</label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="وصف إضافي…"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none"
            />
          </div>

          {/* ── تنبيه حالة الرصيد ── */}
          {amount && parseFloat(amount) > 0 && (
            <div className={`rounded-xl p-3 text-xs flex items-center gap-2 ${
              parseFloat(amount) > currentDrawerTotal
                ? 'bg-red-50 border border-red-200 text-red-700'
                : 'bg-emerald-50 border border-emerald-200 text-emerald-700'
            }`}>
              <AlertCircle size={14} className="shrink-0" />
              <span>
                رصيد الدرج بعد السحب:{' '}
                <strong>{(currentDrawerTotal - parseFloat(amount || '0')).toFixed(2)} ج.م</strong>
                {parseFloat(amount) > currentDrawerTotal && ' ⚠️ أكبر من الرصيد الحالي'}
              </span>
            </div>
          )}

          {/* ── أزرار ── */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="w-1/2 py-2.5 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50 font-bold text-sm transition-colors"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="w-1/2 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-1.5"
            >
              <Printer size={16} />
              <span>تأكيد وطباعة</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
