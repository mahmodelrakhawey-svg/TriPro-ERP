import { logger } from '../../../../utils/logger';
import React, { useState, useEffect } from 'react';
import { 
  Banknote, Printer, X, AlertCircle, Building2, Landmark, 
  Receipt, PlusCircle, CalendarCheck, RotateCcw, Smartphone, 
  Zap, CreditCard, Phone, Calendar, CheckCircle2 
} from 'lucide-react';
import { useToast } from '../../../../context/ToastContext';
import { supabase } from '../../../../supabaseClient';

export type CashDropPayoutType = 
  | 'EXPENSE' 
  | 'CUSTODIAN' 
  | 'VAULT_TRANSFER' 
  | 'PAID_IN' 
  | 'ADVANCE_DEPOSIT_IN'
  | 'REFUND_DEPOSIT_OUT';

export type DepositPaymentMethod = 'CASH' | 'WALLET' | 'INSTAPAY' | 'CARD';

interface AccountOption {
  id: string;
  name: string;
  code: string;
}

export interface DepositDetailsPayload {
  paymentMethod: DepositPaymentMethod;
  customerPhone?: string;
  deliveryDate?: string;
  bookingNotes?: string;
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
    targetAccountId?: string,
    depositDetails?: DepositDetailsPayload
  ) => void;
  currentDrawerTotal: number;
  cashierName: string;
  organizationId?: string;
  orgName?: string;
}

const PAYOUT_TYPES: { value: CashDropPayoutType; label: string; icon: React.ReactNode; color: string; desc: string }[] = [
  {
    value: 'EXPENSE',
    label: 'دفع مصروف',
    icon: <Receipt size={17} />,
    color: 'border-red-400 bg-red-50 text-red-700',
    desc: 'دفع مصاريف تشغيلية مباشرة من نقدية الدرج (نظافة، كهرباء، بضاعة)'
  },
  {
    value: 'VAULT_TRANSFER',
    label: 'تحويل لخزينة',
    icon: <Building2 size={17} />,
    color: 'border-blue-400 bg-blue-50 text-blue-700',
    desc: 'توريد نقدية فائضة من الدرج إلى خزينة الإدارة أو خزينة أخرى'
  },
  {
    value: 'CUSTODIAN',
    label: 'سحب عهدة',
    icon: <Landmark size={17} />,
    color: 'border-purple-400 bg-purple-50 text-purple-700',
    desc: 'سحب نقدية كعهدة مؤقتة مع المشرف أو المدير'
  },
  {
    value: 'PAID_IN',
    label: 'تزويد فكة بالدرج',
    icon: <PlusCircle size={17} />,
    color: 'border-emerald-400 bg-emerald-50 text-emerald-700',
    desc: 'إيداع نقدية إضافية بالدرج كفكة ترفع الرصيد الفعلي'
  },
  {
    value: 'ADVANCE_DEPOSIT_IN',
    label: 'استلام عربون حجز',
    icon: <CalendarCheck size={17} />,
    color: 'border-teal-400 bg-teal-50 text-teal-700',
    desc: 'استلام عربون حجز تورتة/أوردر (نقداً، فودافون كاش، إنستاباي، فيزا)'
  },
  {
    value: 'REFUND_DEPOSIT_OUT',
    label: 'رد عربون ملغي',
    icon: <RotateCcw size={17} />,
    color: 'border-rose-400 bg-rose-50 text-rose-700',
    desc: 'رد عربون حجز ملغي للعميل (نقداً من الدرج، أو تحويل محفظة/إنستاباي)'
  }
];

export default function CashDropModal({
  isOpen,
  onClose,
  onConfirm,
  currentDrawerTotal,
  cashierName,
  organizationId,
  orgName
}: CashDropModalProps) {
  const { showToast } = useToast();

  const [amount, setAmount] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [receiverName, setReceiverName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [deliveryDate, setDeliveryDate] = useState<string>('');
  const [depositPaymentMethod, setDepositPaymentMethod] = useState<DepositPaymentMethod>('CASH');
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
        const { data: expData } = await supabase
          .from('accounts')
          .select('id, name, code')
          .or(`organization_id.eq.${organizationId},organization_id.is.null`)
          .eq('is_active', true)
          .like('code', '5%')
          .order('code');

        const { data: vaultData } = await supabase
          .from('accounts')
          .select('id, name, code')
          .or(`organization_id.eq.${organizationId},organization_id.is.null`)
          .eq('is_active', true)
          .or('code.like.12%,code.like.11%,code.like.101%')
          .order('code');

        setExpenseAccounts((expData || []) as AccountOption[]);
        setVaultAccounts((vaultData || []) as AccountOption[]);
      } catch (err) {
        logger.warn('Could not load accounts for CashDropModal:', err);
      } finally {
        setLoadingAccounts(false);
      }
    };
    fetchAccounts();
  }, [isOpen, organizationId]);

  // إعادة ضبط الحقول التلقائية عند تغيير نوع الحركة
  useEffect(() => {
    setSelectedExpenseAccount('');
    setSelectedTargetAccount('');
    setReason(
      payoutType === 'VAULT_TRANSFER'     ? 'توريد نقدية فائضة لخزينة الإدارة' :
      payoutType === 'CUSTODIAN'          ? 'سحب عهدة نقدية' :
      payoutType === 'PAID_IN'            ? 'تزويد نقدية فكة بالدرج' :
      payoutType === 'ADVANCE_DEPOSIT_IN' ? 'استلام عربون حجز مسبق' :
      payoutType === 'REFUND_DEPOSIT_OUT' ? 'رد عربون حجز ملغي للعميل' :
      ''
    );
  }, [payoutType]);

  if (!isOpen) return null;

  const selectedType = PAYOUT_TYPES.find(t => t.value === payoutType)!;
  const isDepositAction = payoutType === 'ADVANCE_DEPOSIT_IN' || payoutType === 'REFUND_DEPOSIT_OUT';
  const affectsDrawerCash = 
    payoutType === 'PAID_IN' || 
    payoutType === 'EXPENSE' || 
    payoutType === 'VAULT_TRANSFER' || 
    payoutType === 'CUSTODIAN' ||
    (isDepositAction && depositPaymentMethod === 'CASH');

  // طباعة إيصال حراري رسمي للحركة
  const printThermalVoucher = (
    actionTitle: string,
    amt: number,
    methodName: string,
    client: string,
    phone: string,
    dateStr: string,
    desc: string
  ) => {
    try {
      const printWin = window.open('', '_blank', 'width=380,height=520');
      if (!printWin) return;
      printWin.document.write(`
        <!DOCTYPE html>
        <html dir="rtl">
        <head>
          <meta charset="utf-8">
          <title>${actionTitle}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; font-size: 13px; margin: 12px; color: #111; line-height: 1.4; }
            .header { text-align: center; border-bottom: 2px dashed #333; padding-bottom: 8px; margin-bottom: 10px; }
            .header h3 { margin: 2px 0; font-size: 16px; font-weight: 900; }
            .badge { display: inline-block; background: #eee; padding: 3px 8px; border-radius: 6px; font-weight: bold; font-size: 13px; margin: 4px 0; }
            .row { display: flex; justify-content: space-between; margin: 4px 0; border-bottom: 1px dotted #ccc; padding-bottom: 2px; }
            .row span:first-child { color: #555; }
            .amount-card { text-align: center; border: 2px solid #000; border-radius: 8px; padding: 8px; margin: 10px 0; font-size: 18px; font-weight: 900; }
            .footer { text-align: center; border-top: 1px dashed #333; padding-top: 8px; margin-top: 10px; font-size: 11px; color: #666; }
            .signature { display: flex; justify-content: space-between; margin-top: 25px; padding: 0 10px; font-size: 11px; font-weight: bold; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="header">
            <h3>${orgName || 'حلواني لينزا • TriPro POS'}</h3>
            <div class="badge">${actionTitle}</div>
            <div style="font-size: 11px; color: #555;">التاريخ: ${new Date().toLocaleDateString('ar-EG')} | الوقت: ${new Date().toLocaleTimeString('ar-EG')}</div>
          </div>
          <div class="row"><span>طريقة الدفع/التحصيل:</span><strong>${methodName}</strong></div>
          ${client ? `<div class="row"><span>الاسم / العميل:</span><strong>${client}</strong></div>` : ''}
          ${phone ? `<div class="row"><span>رقم الهاتف:</span><strong>${phone}</strong></div>` : ''}
          ${dateStr ? `<div class="row"><span>موعد استلام الأوردر:</span><strong>${dateStr}</strong></div>` : ''}
          ${desc ? `<div class="row"><span>البيان / الملاحظات:</span><span>${desc}</span></div>` : ''}
          <div class="amount-card">المبلغ: ${amt.toFixed(2)} ج.م</div>
          <div class="row"><span>الكاشير المسؤول:</span><span>${cashierName}</span></div>
          <div class="signature">
            <span>توقيع المستلم: .....................</span>
            <span>توقيع الكاشير: .....................</span>
          </div>
          <div class="footer">
            <p>يرجى إبراز هذا الإيصال عند استلام الأوردر أو الاستفسار</p>
          </div>
        </body>
        </html>
      `);
      printWin.document.close();
    } catch (e) {
      logger.warn('Failed to open print voucher window:', e);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);

    if (isNaN(numAmount) || numAmount <= 0) {
      showToast('يرجى إدخال مبلغ صحيح', 'error');
      return;
    }

    // فحص رصيد الدرج في حال كانت الحركة سحب نقدي يخرج من الدرج الفعلي
    if (affectsDrawerCash && payoutType !== 'PAID_IN' && payoutType !== 'ADVANCE_DEPOSIT_IN' && numAmount > currentDrawerTotal) {
      if (!window.confirm(`المبلغ (${numAmount.toFixed(2)} ج.م) أكبر من النقدية المقدرة بالدرج (${currentDrawerTotal.toFixed(2)} ج.م). هل تريد المتابعة بالتأكيد؟`)) {
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
    if (payoutType === 'CUSTODIAN' && !receiverName.trim()) {
      showToast('يرجى إدخال اسم المستلم (صاحب العهدة)', 'error');
      return;
    }
    if (isDepositAction && !receiverName.trim()) {
      showToast('يرجى كتابة اسم العميل صاحب الحجز', 'warning');
      return;
    }

    const methodLabels: Record<DepositPaymentMethod, string> = {
      CASH: 'نقداً بالدرج',
      WALLET: 'محفظة إلكترونية (فودافون كاش)',
      INSTAPAY: 'إنستاباي (InstaPay)',
      CARD: 'فيزا / شبكة (POS Card)'
    };

    const finalReason = isDepositAction
      ? `${selectedType.label} - [${methodLabels[depositPaymentMethod]}] ${receiverName ? 'للعميل: ' + receiverName : ''} ${customerPhone ? '(' + customerPhone + ')' : ''} ${reason ? ' | ' + reason : ''}`
      : (reason || selectedType.label);

    onConfirm(
      numAmount,
      finalReason,
      receiverName,
      payoutType,
      payoutType === 'EXPENSE' ? selectedExpenseAccount : undefined,
      payoutType === 'VAULT_TRANSFER' ? selectedTargetAccount :
      payoutType === 'CUSTODIAN'      ? selectedTargetAccount || undefined : undefined,
      isDepositAction ? {
        paymentMethod: depositPaymentMethod,
        customerPhone: customerPhone || undefined,
        deliveryDate: deliveryDate || undefined,
        bookingNotes: reason || undefined
      } : undefined
    );

    // طباعة الإيصال الفوري للحركات التي تتطلب إثباتاً للعميل أو الإدارة
    if (isDepositAction || payoutType === 'CUSTODIAN' || payoutType === 'VAULT_TRANSFER') {
      printThermalVoucher(
        selectedType.label,
        numAmount,
        isDepositAction ? methodLabels[depositPaymentMethod] : 'نقداً من الدرج',
        receiverName,
        customerPhone,
        deliveryDate,
        reason
      );
    }

    showToast(`✅ تم تسجيل ${selectedType.label} بمبلغ ${numAmount.toFixed(2)} ج.م بنجاح`, 'success');

    // إعادة ضبط الحقول
    setAmount('');
    setReason('');
    setReceiverName('');
    setCustomerPhone('');
    setDeliveryDate('');
    setSelectedExpenseAccount('');
    setSelectedTargetAccount('');
    setDepositPaymentMethod('CASH');
    setPayoutType('VAULT_TRANSFER');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in duration-150 max-h-[92vh] overflow-y-auto text-slate-900">

        {/* الترويسة الرئيسية */}
        <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-white p-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
          <div className="flex items-center gap-2 font-bold text-lg">
            <Banknote size={22} className="text-amber-200" />
            <span>حركات الدرج النقدية والعربونات</span>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">

          {/* شريط معلومات الوردية والرصيد المقدر */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <span className="text-slate-500 block mb-0.5">الكاشير الحالي:</span>
              <span className="font-bold text-slate-800">{cashierName}</span>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <span className="text-slate-500 block mb-0.5">نقدية الدرج الفعلي المقدرة:</span>
              <span className="font-black text-emerald-600 text-sm">{currentDrawerTotal.toFixed(2)} ج.م</span>
            </div>
          </div>

          {/* ── أزرار اختيار نوع الحركة (Grid) ── */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">نوع الحركة المطلوبة *</label>
            <div className="grid grid-cols-3 gap-2">
              {PAYOUT_TYPES.map(type => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setPayoutType(type.value)}
                  className={`flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-xl border-2 text-center transition-all text-xs font-bold cursor-pointer ${
                    payoutType === type.value
                      ? type.color + ' shadow-sm scale-102 ring-2 ring-offset-1 ring-orange-300'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {type.icon}
                  <span className="leading-tight">{type.label}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-2 pr-1">{selectedType.desc}</p>
          </div>

          {/* ── خيار طريقة الدفع/التحصيل عند اختيار عربون (استلام أو رد) ── */}
          {isDepositAction && (
            <div className="p-3.5 bg-teal-50/70 border border-teal-200 rounded-2xl space-y-2 animate-in fade-in">
              <label className="block text-xs font-bold text-teal-900">
                {payoutType === 'ADVANCE_DEPOSIT_IN' ? 'طريقة استلام العربون من العميل *' : 'طريقة رد العربون للعميل *'}
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {/* 1. نقداً بالدرج */}
                <button
                  type="button"
                  onClick={() => setDepositPaymentMethod('CASH')}
                  className={`p-2 rounded-xl border flex items-center justify-center gap-1.5 font-bold transition-all cursor-pointer ${
                    depositPaymentMethod === 'CASH'
                      ? 'bg-teal-600 text-white border-teal-700 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Banknote size={15} />
                  <span>نقداً بالدرج</span>
                </button>

                {/* 2. فودافون كاش / محفظة */}
                <button
                  type="button"
                  onClick={() => setDepositPaymentMethod('WALLET')}
                  className={`p-2 rounded-xl border flex items-center justify-center gap-1.5 font-bold transition-all cursor-pointer ${
                    depositPaymentMethod === 'WALLET'
                      ? 'bg-red-600 text-white border-red-700 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Smartphone size={15} />
                  <span>فودافون كاش</span>
                </button>

                {/* 3. إنستاباي */}
                <button
                  type="button"
                  onClick={() => setDepositPaymentMethod('INSTAPAY')}
                  className={`p-2 rounded-xl border flex items-center justify-center gap-1.5 font-bold transition-all cursor-pointer ${
                    depositPaymentMethod === 'INSTAPAY'
                      ? 'bg-purple-600 text-white border-purple-700 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Zap size={15} />
                  <span>إنستاباي (InstaPay)</span>
                </button>

                {/* 4. فيزا / شبكة (متاحة في الاستلام) */}
                {payoutType === 'ADVANCE_DEPOSIT_IN' ? (
                  <button
                    type="button"
                    onClick={() => setDepositPaymentMethod('CARD')}
                    className={`p-2 rounded-xl border flex items-center justify-center gap-1.5 font-bold transition-all cursor-pointer ${
                      depositPaymentMethod === 'CARD'
                        ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <CreditCard size={15} />
                    <span>فيزا / شبكة</span>
                  </button>
                ) : (
                  <div className="flex items-center justify-center text-[11px] text-slate-400 font-medium bg-slate-100 rounded-xl p-2">
                    الرد الإلكتروني عبر المحافظ وإنستاباي
                  </div>
                )}
              </div>

              {/* تنبيه رقابي لدرج النقدية */}
              <div className="text-[11px] text-teal-800 flex items-center gap-1 mt-1 font-medium">
                <CheckCircle2 size={13} className="text-teal-600 shrink-0" />
                <span>
                  {depositPaymentMethod === 'CASH'
                    ? (payoutType === 'ADVANCE_DEPOSIT_IN' ? 'سيزيد نقدية الدرج الفعلي ويُطلب من الكاشير تسليمه بالجرد.' : 'سيخرج المبلغ من نقدية الدرج الفعلي ويقل رصيد الدرج بالجرد.')
                    : 'عملية إلكترونية لا تمس نقدية الدرج الورقية، وتُرحل تلقائياً لحسابها البنكي/المحفظة.'}
                </span>
              </div>
            </div>
          )}

          {/* ── حقول بيانات العميل والحجز (في العربون) ── */}
          {isDepositAction && (
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم العميل صاحب الحجز *</label>
                <input
                  type="text"
                  required
                  value={receiverName}
                  onChange={e => setReceiverName(e.target.value)}
                  placeholder="الاسم ثلاثي"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-teal-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                  <Phone size={12} className="text-slate-400" /> رقم الهاتف
                </label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  placeholder="01xxxxxxxxx"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-teal-500 outline-none text-left"
                />
              </div>
              {payoutType === 'ADVANCE_DEPOSIT_IN' && (
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Calendar size={12} className="text-slate-400" /> موعد استلام الأوردر / المناسبة (اختياري)
                  </label>
                  <input
                    type="date"
                    value={deliveryDate}
                    onChange={e => setDeliveryDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-teal-500 outline-none"
                  />
                </div>
              )}
            </div>
          )}

          {/* ── المبلغ ── */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">المبلغ المطلوب (ج.م) *</label>
            <input
              type="number"
              step="0.01"
              min="1"
              autoFocus
              required
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2.5 text-lg font-black text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-left"
            />
          </div>

          {/* ── حساب المصروف (EXPENSE فقط) ── */}
          {payoutType === 'EXPENSE' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">حساب المصروف التشغيلي *</label>
              {loadingAccounts ? (
                <div className="text-xs text-slate-400 py-2">جارٍ تحميل الحسابات…</div>
              ) : (
                <select
                  required
                  value={selectedExpenseAccount}
                  onChange={e => setSelectedExpenseAccount(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-red-400 outline-none bg-white text-slate-900 font-medium"
                >
                  <option value="" className="text-slate-900 bg-white">— اختر حساب المصروف —</option>
                  {expenseAccounts.map(a => (
                    <option key={a.id} value={a.id} className="text-slate-900 bg-white">{a.code} — {a.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* ── الخزينة المستهدفة (VAULT_TRANSFER فقط) ── */}
          {payoutType === 'VAULT_TRANSFER' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الخزينة المستهدفة للتوريد *</label>
              {loadingAccounts ? (
                <div className="text-xs text-slate-400 py-2">جارٍ تحميل الخزائن…</div>
              ) : (
                <select
                  required
                  value={selectedTargetAccount}
                  onChange={e => setSelectedTargetAccount(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-400 outline-none bg-white text-slate-900 font-medium"
                >
                  <option value="" className="text-slate-900 bg-white">— اختر الخزينة —</option>
                  {vaultAccounts.map(a => (
                    <option key={a.id} value={a.id} className="text-slate-900 bg-white">{a.code} — {a.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* ── اسم المستلم للعهدة (CUSTODIAN) ── */}
          {payoutType === 'CUSTODIAN' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">اسم مستلم العهدة (الموظف / المشرف) *</label>
              <input
                type="text"
                required
                value={receiverName}
                onChange={e => setReceiverName(e.target.value)}
                placeholder="اسم الموظف أو المشرف"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-purple-400 outline-none"
              />
            </div>
          )}

          {/* ── البيان والملاحظات ── */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {payoutType === 'REFUND_DEPOSIT_OUT' ? 'سبب إلغاء الحجز *' : 'البيان / تفاصيل الأوردر'}
            </label>
            <input
              type="text"
              required={payoutType === 'REFUND_DEPOSIT_OUT'}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder={
                payoutType === 'REFUND_DEPOSIT_OUT' ? 'مثال: إلغاء المناسبة بناءً على رغبة العميل' :
                payoutType === 'ADVANCE_DEPOSIT_IN' ? 'تفاصيل التورتة/الأوردر، النكهة، الكتابة...' :
                'وصف توضيحي إضافي…'
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none"
            />
          </div>

          {/* ── أثر النقدية على الدرج ── */}
          {amount && parseFloat(amount) > 0 && affectsDrawerCash && (
            <div className={`rounded-xl p-3 text-xs flex items-center gap-2 ${
              payoutType !== 'PAID_IN' && payoutType !== 'ADVANCE_DEPOSIT_IN' && parseFloat(amount) > currentDrawerTotal
                ? 'bg-red-50 border border-red-200 text-red-700'
                : 'bg-emerald-50 border border-emerald-200 text-emerald-700'
            }`}>
              <AlertCircle size={14} className="shrink-0" />
              <span>
                رصيد الدرج المقدر بعد الحركة:{' '}
                <strong>
                  {(
                    currentDrawerTotal +
                    (payoutType === 'PAID_IN' || payoutType === 'ADVANCE_DEPOSIT_IN' ? parseFloat(amount) : -parseFloat(amount))
                  ).toFixed(2)} ج.م
                </strong>
                {payoutType !== 'PAID_IN' && payoutType !== 'ADVANCE_DEPOSIT_IN' && parseFloat(amount) > currentDrawerTotal && ' ⚠️ المبلغ أكبر من نقدية الدرج الحالية!'}
              </span>
            </div>
          )}

          {/* ── أزرار الحفظ والإلغاء ── */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="w-1/2 py-2.5 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50 font-bold text-sm transition-colors cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="w-1/2 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Printer size={16} />
              <span>تأكيد وطباعة الإيصال</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
