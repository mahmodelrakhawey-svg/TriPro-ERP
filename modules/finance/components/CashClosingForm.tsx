import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import { Save, Calculator, AlertCircle, CheckCircle, History, Wallet, Loader2 } from 'lucide-react';

const CashClosingForm = () => {
  const { accounts, currentUser, addEntry, settings } = useAccounting();
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [systemBalance, setSystemBalance] = useState(0);
  const [actualBalance, setActualBalance] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState('');
  const [todayMovement, setTodayMovement] = useState({ in: 0, out: 0 });
  const [lastClosings, setLastClosings] = useState<any[]>([]);
  const { showToast } = useToast();

  // تصفية حسابات النقدية/الصناديق فقط
  const cashAccounts = useMemo(() => {
    return accounts.filter(a => 
      !a.isGroup && 
      (a.code.startsWith('123') || a.code.startsWith('1101') || a.name.includes('صندوق') || a.name.includes('خزينة') || a.name.includes('Cash'))
    );
  }, [accounts]);

  useEffect(() => {
    if (cashAccounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(cashAccounts[0].id);
    }
  }, [cashAccounts]);

  useEffect(() => {
    if (selectedAccountId) {
      fetchAccountData();
      fetchLastClosings();
    }
  }, [selectedAccountId]);

  const fetchAccountData = async () => {
    // التحقق من وضع الديمو أو معرف غير صالح لتجنب أخطاء قاعدة البيانات
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selectedAccountId);
    if (currentUser?.role === 'demo' || !isUuid) {
        setSystemBalance(12500);
        setTodayMovement({ in: 5000, out: 1200 });
        if (actualBalance === '') setActualBalance(12500);
        return;
    }

    setLoading(true);
    try {
      // 1. حساب الرصيد الحالي للنظام (من جميع القيود المرحلة)
      // ملاحظة: نستخدم استعلام مباشر لضمان الدقة بدلاً من الاعتماد على الذاكرة
      const { data: lines, error } = await supabase
        .from('journal_lines')
        .select('debit, credit, journal_entries!inner(transaction_date, status)')
        .eq('account_id', selectedAccountId)
        .eq('journal_entries.status', 'posted');

      if (error) throw error;

      let balance = 0;
      let todayIn = 0;
      let todayOut = 0;
      const today = new Date().toISOString().split('T')[0];

      lines?.forEach((line: any) => {
        // طبيعة حساب الصندوق مدين (Debit)
        // الرصيد = المدين - الدائن
        balance += (Number(line.debit) - Number(line.credit));

        if (line.journal_entries.transaction_date === today) {
          todayIn += Number(line.debit);
          todayOut += Number(line.credit);
        }
      });

      setSystemBalance(balance);
      setTodayMovement({ in: todayIn, out: todayOut });
      // تعيين الرصيد الفعلي الافتراضي ليكون مطابقاً للنظام
      if (actualBalance === '') setActualBalance(balance);

    } catch (error) {
      console.error('Error fetching balance:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLastClosings = async () => {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selectedAccountId);
    if (currentUser?.role === 'demo' || !isUuid) {
        setLastClosings([
            { id: 'demo-1', closing_date: new Date(Date.now() - 86400000).toISOString(), actual_balance: 12000, difference: 0 },
            { id: 'demo-2', closing_date: new Date(Date.now() - 172800000).toISOString(), actual_balance: 11500, difference: -50 }
        ]);
        return;
    }

    const { data } = await supabase
      .from('cash_closings')
      .select('*')
      .eq('treasury_account_id', selectedAccountId)
      .order('created_at', { ascending: false })
      .limit(5);
    if (data) setLastClosings(data);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (actualBalance === '') return;

    if (currentUser?.role === 'demo') {
        showToast('تم إقفال الصندوق بنجاح ✅ (محاكاة)', 'success');
        setNotes('');
        return;
    }

    const difference = Number(actualBalance) - systemBalance;

    // 🛑 ميزة أمان: منع الإقفال إذا كان العجز كبيراً جداً
    // @ts-ignore
    const MAX_ALLOWED_DEFICIT = settings.maxCashDeficitLimit || 500; 
    if (difference < 0 && Math.abs(difference) > MAX_ALLOWED_DEFICIT) {
        // تسجيل المحاولة المرفوضة
        try {
            await supabase.from('rejected_cash_closings').insert({
                rejection_date: new Date().toISOString(),
                treasury_account_id: selectedAccountId,
                system_balance: systemBalance,
                actual_balance: Number(actualBalance),
                difference: difference,
                notes: `محاولة إقفال بعجز يتجاوز الحد: ${notes}`,
                rejected_by: currentUser?.id,
                max_allowed_deficit: MAX_ALLOWED_DEFICIT
            });
        } catch (logError) {
            console.error("Failed to log rejected cash closing:", logError);
        }

        showToast(
          `لا يمكن إتمام عملية الإقفال لأن العجز (${Math.abs(difference).toLocaleString()}) يتجاوز الحد المسموح به`,
          'warning'
        );
        return;
    }

    setSaving(true);
    try {

      const { error } = await supabase.from('cash_closings').insert({
        treasury_account_id: selectedAccountId,
        system_balance: systemBalance,
        actual_balance: Number(actualBalance),
        difference: difference,
        notes: notes,
        created_by: currentUser?.id,
        closing_date: new Date().toISOString()
      });

      if (error) throw error;

      // 🌟 إنشاء قيد تسوية آلي في حال وجود فرق (عجز أو زيادة)
      if (Math.abs(difference) > 0.01) {
        const isOverage = difference > 0;
        
        let adjustmentAccount;

        // 1. البحث في إعدادات الربط (للعجز)
        if (!isOverage && settings.accountMappings?.CASH_SHORTAGE) {
            adjustmentAccount = accounts.find(a => a.id === settings.accountMappings.CASH_SHORTAGE);
        }

        // 2. البحث بالكود الافتراضي: 421 (زيادة) أو 541 (عجز)
        if (!adjustmentAccount) {
            const adjustmentCode = isOverage ? '421' : '541';
            adjustmentAccount = accounts.find(a => a.code === adjustmentCode);
        }
        
        // 3. محاولة البحث بالاسم في حال عدم تطابق الكود
        if (!adjustmentAccount) {
           adjustmentAccount = accounts.find(a => a.name.includes(isOverage ? 'إيرادات أخرى' : 'فروقات') || a.name.includes('تسوية'));
        }

        if (adjustmentAccount) {
            const absDiff = Math.abs(difference);
            const lines = [];
            
            if (isOverage) {
                // زيادة: من ح/ الصندوق (مدين) إلى ح/ الإيرادات (دائن)
                lines.push({ accountId: selectedAccountId, debit: absDiff, credit: 0, description: `زيادة في الصندوق - إقفال ${new Date().toLocaleDateString('ar-EG')}` });
                lines.push({ accountId: adjustmentAccount.id, debit: 0, credit: absDiff, description: `تسوية زيادة صندوق - ${notes}` });
            } else {
                // عجز: من ح/ المصروفات (مدين) إلى ح/ الصندوق (دائن)
                lines.push({ accountId: adjustmentAccount.id, debit: absDiff, credit: 0, description: `تسوية عجز صندوق - ${notes}` });
                lines.push({ accountId: selectedAccountId, debit: 0, credit: absDiff, description: `عجز في الصندوق - إقفال ${new Date().toLocaleDateString('ar-EG')}` });
            }

            await addEntry({
                date: new Date().toISOString().split('T')[0],
                description: `تسوية فروقات صندوق (إقفال يومي) - ${isOverage ? 'زيادة' : 'عجز'}`,
                reference: `ADJ-${Date.now().toString().slice(-6)}`,
                status: 'posted',
                lines: lines as any[]
            });
        } else {
            showToast('تنبيه: تم حفظ الإقفال ولكن لم يتم إنشاء قيد التسوية لعدم العثور على حسابات التسوية (512 أو 421).', 'warning');
        }
      }

      showToast('تم إقفال الصندوق بنجاح ✅', 'success');
      setNotes('');
      fetchLastClosings();
    } catch (error: any) {
      showToast('حدث خطأ: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const difference = (Number(actualBalance) || 0) - systemBalance;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-emerald-100 p-3 rounded-xl text-emerald-600">
          <Wallet size={32} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-800">إقفال الصندوق اليومي</h2>
          <p className="text-slate-500">مطابقة الرصيد الفعلي مع رصيد النظام وتسجيل العجز أو الزيادة</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Form Section */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="mb-6">
              <label className="block text-sm font-bold text-slate-700 mb-2">اختر الصندوق / الخزينة</label>
              <select 
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-4 py-3 font-bold text-slate-700 focus:outline-none focus:border-emerald-500"
              >
                {cashAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name} ({acc.code})</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                <span className="text-xs font-bold text-slate-400 uppercase">وارد اليوم</span>
                <div className="text-xl font-black text-emerald-600 mt-1">+{todayMovement.in.toLocaleString()}</div>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                <span className="text-xs font-bold text-slate-400 uppercase">صادر اليوم</span>
                <div className="text-xl font-black text-red-600 mt-1">-{todayMovement.out.toLocaleString()}</div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center bg-blue-50 p-4 rounded-xl border border-blue-100">
                <span className="font-bold text-blue-900">رصيد النظام الحالي:</span>
                <span className="text-2xl font-black text-blue-700">{loading ? '...' : systemBalance.toLocaleString()}</span>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">الرصيد الفعلي (الجرد)</label>
                <div className="relative">
                  <input 
                    type="number" 
                    value={actualBalance}
                    onChange={(e) => setActualBalance(parseFloat(e.target.value))}
                    className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-xl font-black focus:outline-none focus:border-emerald-500"
                    placeholder="0.00"
                  />
                  <Calculator className="absolute left-4 top-3.5 text-slate-400" />
                </div>
              </div>

              {difference !== 0 && (
                <div className={`p-4 rounded-xl flex items-center gap-3 ${difference > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                  <AlertCircle size={20} />
                  <span className="font-bold">
                    {difference > 0 ? `يوجد زيادة بقيمة ${difference.toLocaleString()}` : `يوجد عجز بقيمة ${Math.abs(difference).toLocaleString()}`}
                  </span>
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">ملاحظات</label>
                <textarea 
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500"
                  rows={2}
                  placeholder="أي ملاحظات حول الإقفال..."
                ></textarea>
              </div>

              <button 
                onClick={handleSave}
                disabled={saving || loading}
                className="w-full bg-emerald-600 text-white py-4 rounded-xl font-black text-lg hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="animate-spin" /> : <Save />} حفظ الإقفال
              </button>
            </div>
          </div>
        </div>

        {/* History Section */}
        <div className="space-y-4">
          <h3 className="font-bold text-slate-700 flex items-center gap-2">
            <History size={18} /> آخر عمليات الإقفال
          </h3>
          <div className="space-y-3">
            {lastClosings.map((closing) => (
              <div key={closing.id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                <div className="text-xs text-slate-400 mb-1">{new Date(closing.closing_date).toLocaleDateString('ar-EG')}</div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-bold text-slate-600">الرصيد الفعلي:</span>
                  <span className="font-mono font-bold">{closing.actual_balance.toLocaleString()}</span>
                </div>
                {closing.difference !== 0 ? (
                  <div className={`text-xs font-bold px-2 py-1 rounded-lg inline-block ${closing.difference > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {closing.difference > 0 ? '+' : ''}{closing.difference.toLocaleString()}
                  </div>
                ) : (
                  <div className="text-xs font-bold px-2 py-1 rounded-lg inline-block bg-slate-100 text-slate-600">
                    <CheckCircle size={12} className="inline ml-1" /> مطابق
                  </div>
                )}
              </div>
            ))}
            {lastClosings.length === 0 && (
              <div className="text-center text-slate-400 py-8 text-sm">لا توجد سجلات سابقة</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CashClosingForm;