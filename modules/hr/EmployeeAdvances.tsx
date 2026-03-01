import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { Banknote, Plus, Search, CheckCircle, XCircle, Loader2, User } from 'lucide-react';
import { z } from 'zod';

const EmployeeAdvances = () => {
  const { addEntry, getSystemAccount, accounts, currentUser } = useAccounting();
  const { showToast } = useToast();
  const [advances, setAdvances] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [treasuryAccounts, setTreasuryAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    employeeId: '',
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    treasuryId: '', // الخزينة التي سيتم الصرف منها
    notes: ''
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. جلب السلف
      const { data: advData } = await supabase
        .from('employee_advances')
        .select('*, employees(full_name)')
        .order('created_at', { ascending: false });
      if (advData) setAdvances(advData);

      // 2. جلب الموظفين
      const { data: empData } = await supabase.from('employees').select('id, full_name');
      if (empData) setEmployees(empData);

      // 3. جلب حسابات الخزينة
      const { data: accData } = await supabase
        .from('accounts')
        .select('id, name')
        .ilike('type', '%asset%')
        .or('code.like.123%,code.like.101%,name.ilike.%صندوق%,name.ilike.%خزينة%,name.ilike.%بنك%');
      if (accData) setTreasuryAccounts(accData);

    } catch (error: any) {
      console.error(error);
      showToast('خطأ في جلب البيانات: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const advanceSchema = z.object({
        employeeId: z.string().min(1, 'الرجاء اختيار الموظف'),
        amount: z.number().min(1, 'مبلغ السلفة يجب أن يكون أكبر من 0'),
        date: z.string().min(1, 'التاريخ مطلوب'),
        treasuryId: z.string().min(1, 'الرجاء اختيار حساب الصرف'),
    });

    const validationResult = advanceSchema.safeParse(formData);
    if (!validationResult.success) {
        showToast(validationResult.error.issues[0].message, 'warning');
        return;
    }
    
    setSaving(true);
    try {
      const employee = employees.find(e => e.id === formData.employeeId);
      const reference = `ADV-${Date.now().toString().slice(-6)}`;

      // 1. حفظ السلفة
      const { error: advError } = await supabase.from('employee_advances').insert({
        employee_id: formData.employeeId,
        amount: formData.amount,
        request_date: formData.date,
        status: 'paid', // نعتبرها مدفوعة فوراً للتبسيط
        notes: formData.notes,
        treasury_account_id: formData.treasuryId, // حفظ حساب الخزينة
        reference: reference // حفظ المرجع
      });

      if (advError) throw advError;

      // 2. إنشاء القيد المحاسبي
      // من ح/ سلف العاملين (10203)
      // إلى ح/ الصندوق أو البنك
      const advancesAcc = getSystemAccount('EMPLOYEE_ADVANCES') || accounts.find(a => a.code === '1223');

      if (advancesAcc) {
          await addEntry({
            date: formData.date,
            description: `صرف سلفة للموظف ${employee?.full_name}`,
            reference: reference,
            status: 'posted',
            lines: [
                { account_id: advancesAcc.id, accountId: advancesAcc.id, debit: formData.amount, credit: 0, description: `سلفة موظف - ${employee?.full_name}` },
                { account_id: formData.treasuryId, accountId: formData.treasuryId, debit: 0, credit: formData.amount, description: `صرف نقدية لسلفة` }
            ]
          });
      } else {
          showToast('تنبيه: تم حفظ السلفة ولكن لم يتم إنشاء القيد لعدم العثور على حساب "سلف الموظفين" (1223).', 'warning');
      }
      
      showToast('تم حفظ السلفة وترحيل القيد بنجاح ✅', 'success');
      setIsModalOpen(false);
      setFormData({ employeeId: '', amount: 0, date: new Date().toISOString().split('T')[0], treasuryId: '', notes: '' });
      fetchData();

    } catch (error: any) {
      console.error(error);
      showToast('حدث خطأ: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // حماية الصفحة من مستخدم الديمو
  if (currentUser?.role === 'demo') {
      return (
          <div className="flex flex-col items-center justify-center h-96 text-slate-500 bg-white rounded-3xl border border-slate-200 shadow-sm">
              <Banknote size={64} className="mb-4 text-slate-300" />
              <h2 className="text-xl font-bold text-slate-700">سلف الموظفين غير متاحة</h2>
              <p className="text-sm mt-2">لا يمكن إدارة السلف والقروض في النسخة التجريبية.</p>
          </div>
      );
  }

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center">
        <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Banknote className="text-blue-600" /> سلف الموظفين
            </h2>
            <p className="text-slate-500">إدارة السلف الشخصية والخصم من الراتب</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-blue-700 transition-colors">
            <Plus size={18} /> تسجيل سلفة جديدة
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-right">
            <thead className="bg-slate-50 text-slate-600 font-bold text-sm">
                <tr>
                    <th className="p-4">الموظف</th>
                    <th className="p-4">تاريخ الطلب</th>
                    <th className="p-4">المبلغ</th>
                    <th className="p-4">الحالة</th>
                    <th className="p-4">ملاحظات</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {advances.map(adv => (
                    <tr key={adv.id} className="hover:bg-slate-50">
                        <td className="p-4 font-bold text-slate-800">{adv.employees?.full_name}</td>
                        <td className="p-4 text-slate-600">{adv.request_date}</td>
                        <td className="p-4 font-bold text-blue-600">{adv.amount.toLocaleString()}</td>
                        <td className="p-4">
                            <span className={`px-2 py-1 rounded text-xs font-bold ${adv.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                {adv.status === 'paid' ? 'تم الصرف' : adv.status}
                            </span>
                        </td>
                        <td className="p-4 text-slate-500 text-sm">{adv.notes || '-'}</td>
                    </tr>
                ))}
                {advances.length === 0 && !loading && (
                    <tr><td colSpan={5} className="p-8 text-center text-slate-400">لا توجد سلف مسجلة</td></tr>
                )}
            </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in duration-200">
                <h3 className="font-bold text-xl mb-4 text-slate-800">تسجيل سلفة نقدية</h3>
                <form onSubmit={handleSave} className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">الموظف</label>
                        <select required className="w-full border rounded-lg p-2.5" value={formData.employeeId} onChange={e => setFormData({...formData, employeeId: e.target.value})}>
                            <option value="">اختر الموظف...</option>
                            {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">مبلغ السلفة</label>
                        <input type="number" required min="1" className="w-full border rounded-lg p-2.5" value={formData.amount} onChange={e => setFormData({...formData, amount: parseFloat(e.target.value)})} />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">تاريخ الصرف</label>
                        <input type="date" required className="w-full border rounded-lg p-2.5" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">صرف من (الخزينة/البنك)</label>
                        <select required className="w-full border rounded-lg p-2.5" value={formData.treasuryId} onChange={e => setFormData({...formData, treasuryId: e.target.value})}>
                            <option value="">اختر الحساب...</option>
                            {treasuryAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">ملاحظات</label>
                        <textarea className="w-full border rounded-lg p-2.5" rows={2} value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})}></textarea>
                    </div>
                    <div className="flex gap-2 pt-2">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-lg font-bold hover:bg-slate-200">إلغاء</button>
                        <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 flex justify-center items-center gap-2">
                            {saving ? <Loader2 className="animate-spin" /> : <CheckCircle size={18} />} حفظ وصرف
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeAdvances;
