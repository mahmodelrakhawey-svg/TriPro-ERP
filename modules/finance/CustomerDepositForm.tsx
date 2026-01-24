import React, { useState, useMemo, useEffect } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { Save, ArrowRight, ArrowLeft, ShieldCheck, Plus, Search, Loader2, Printer, MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { CustomerDepositPrint } from './CustomerDepositPrint';

const CustomerDepositForm = () => {
  const { customers, accounts, addEntry, getSystemAccount, updateVoucher } = useAccounting();
  const navigate = useNavigate();
  
  // تصفية حسابات النقدية والبنوك فقط
  const treasuryAccounts = useMemo(() => accounts.filter(a => 
    !a.isGroup && (
      a.code.startsWith('123') || a.code.startsWith('101') || 
      a.name.includes('صندوق') || 
      a.name.includes('خزينة') || 
      a.name.includes('بنك') || 
      a.name.includes('نقد')
    )
  ), [accounts]);

  // حالة لتخزين السندات المجلوبة من قاعدة البيانات
  const [depositVouchers, setDepositVouchers] = useState<any[]>([]);

  // جلب سندات التأمين من قاعدة البيانات مباشرة (لتجاوز حد الـ 50 في السياق)
  useEffect(() => {
    const fetchVouchers = async () => {
      const { data } = await supabase
        .from('receipt_vouchers')
        .select('*')
        .ilike('notes', '%تأمين%') // البحث عن السندات التي تحتوي على كلمة "تأمين"
        .order('receipt_date', { ascending: false }); // الأحدث أولاً
      
      if (data) setDepositVouchers(data);
    };
    fetchVouchers();
  }, []);

  // Print State
  const [voucherToPrint, setVoucherToPrint] = useState<any>(null);
  const [companySettings, setCompanySettings] = useState<any>(null);

  useEffect(() => {
    supabase.from('company_settings').select('*').single().then(({ data }) => setCompanySettings(data));
  }, []);

  useEffect(() => {
    if (voucherToPrint) {
      const timer = setTimeout(() => {
        window.print();
        setVoucherToPrint(null);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [voucherToPrint]);

  const [isEditing, setIsEditing] = useState(false);
  const [currentVoucherId, setCurrentVoucherId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    customerId: '',
    treasuryAccountId: '',
    amount: '',
    description: '',
    paymentMethod: 'cash',
    voucherNumber: ''
  });

  const loadVoucher = async (voucher: any) => {
      setIsEditing(true);
      setCurrentVoucherId(voucher.id);
      
      setFormData({
          date: voucher.receipt_date,
          customerId: voucher.customer_id || '',
          treasuryAccountId: voucher.treasury_account_id || '',
          amount: voucher.amount,
          description: voucher.notes || '',
          paymentMethod: voucher.payment_method || 'cash',
          voucherNumber: voucher.voucher_number || ''
      });
  };

  const handleNew = () => {
      setIsEditing(false);
      setCurrentVoucherId(null);
      setFormData({
        date: new Date().toISOString().split('T')[0],
        customerId: '',
        treasuryAccountId: '',
        amount: '',
        description: '',
        paymentMethod: 'cash',
        voucherNumber: ''
      });
  };

  const handlePrevious = () => {
    if (depositVouchers.length === 0) return;
    if (!currentVoucherId) { loadVoucher(depositVouchers[0]); return; }
    const idx = depositVouchers.findIndex(v => v.id === currentVoucherId);
    if (idx < depositVouchers.length - 1) {
      loadVoucher(depositVouchers[idx + 1]);
    }
  };

  const handleNext = () => {
    if (depositVouchers.length === 0) return;
    if (!currentVoucherId) { loadVoucher(depositVouchers[0]); return; }
    const idx = depositVouchers.findIndex(v => v.id === currentVoucherId);
    if (idx > 0) {
      loadVoucher(depositVouchers[idx - 1]);
    }
  };

  const handlePrint = () => {
    const customerName = customers.find(c => c.id === formData.customerId)?.name;
    setVoucherToPrint({
        ...formData,
        customerName
    });
  };

  const handleWhatsApp = () => {
    const customer = customers.find(c => c.id === formData.customerId);
    if (!customer || !customer.phone) {
      alert('رقم هاتف العميل غير متوفر');
      return;
    }
    const message = `*سند قبض تأمين*\n\nمرحباً ${customer.name}،\nتم استلام مبلغ تأمين: *${Number(formData.amount).toLocaleString()} EGP*\nرقم السند: ${formData.voucherNumber}\nالتاريخ: ${formData.date}\n\nشكراً لتعاملكم معنا.`;
    const phone = customer.phone.replace(/[^0-9]/g, '');
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customerId || !formData.treasuryAccountId || !formData.amount) {
      alert('الرجاء تعبئة جميع الحقول المطلوبة');
      return;
    }

    setLoading(true);
    try {
        if (isEditing && currentVoucherId) {
             // تحديث سند موجود
             await updateVoucher(currentVoucherId, 'receipt', {
                 ...formData,
                 amount: Number(formData.amount),
                 treasuryId: formData.treasuryAccountId,
                 customerId: formData.customerId
             });
             alert('تم تعديل سند التأمين بنجاح ✅');
        } else {
            // إنشاء سند جديد وحفظه في قاعدة البيانات مباشرة
            const voucherNumber = formData.voucherNumber || `DEP-${Date.now().toString().slice(-6)}`;
            const customerDepositsAcc = getSystemAccount('CUSTOMER_DEPOSITS'); // 203
            const customer = customers.find(c => c.id === formData.customerId);

            if (!customerDepositsAcc) {
                throw new Error('حساب تأمينات العملاء غير موجود في النظام.');
            }

            // 1. حفظ السند في جدول receipt_vouchers
            const { data: voucherData, error: voucherError } = await supabase.from('receipt_vouchers').insert({
                voucher_number: voucherNumber,
                receipt_date: formData.date,
                customer_id: formData.customerId,
                amount: Number(formData.amount),
                treasury_account_id: formData.treasuryAccountId,
                notes: formData.description || `تأمين مستلم من ${customer?.name}`,
                payment_method: formData.paymentMethod,
                // لا يوجد عمود subType في الجدول، نعتمد على الملاحظات أو التوجيه المحاسبي
            }).select().single();

            if (voucherError) throw voucherError;

            // 2. إنشاء القيد المحاسبي يدوياً (لضمان التوجيه لحساب التأمينات وليس العملاء)
            await addEntry({
                date: formData.date,
                reference: voucherNumber,
                description: formData.description || `قبض تأمين من ${customer?.name}`,
                status: 'posted',
                lines: [
                    { account_id: formData.treasuryAccountId, accountId: formData.treasuryAccountId, debit: Number(formData.amount), credit: 0, description: `قبض تأمين - ${voucherNumber}` },
                    { account_id: customerDepositsAcc.id, accountId: customerDepositsAcc.id, debit: 0, credit: Number(formData.amount), description: `تأمين مستلم من ${customer?.name}` }
                ]
            });

            alert('تم حفظ سند تأمين العميل بنجاح ✅');
            
            // تحديث القائمة محلياً لإظهار السند الجديد فوراً
            const { data: newVoucher } = await supabase
                .from('receipt_vouchers')
                .select('*')
                .ilike('notes', '%تأمين%')
                .order('receipt_date', { ascending: false })
                .limit(1)
                .maybeSingle(); // استخدام maybeSingle لتجنب خطأ 406
                
            if (newVoucher) setDepositVouchers(prev => [newVoucher, ...prev]);
        }
        handleNew();
    } catch (error: any) {
        alert('حدث خطأ: ' + error.message);
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto animate-in fade-in">
      {/* شريط الأدوات */}
      <div className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6">
         <div className="flex items-center gap-2">
             <button onClick={handlePrevious} disabled={depositVouchers.length === 0 || (currentVoucherId && depositVouchers.findIndex(v => v.id === currentVoucherId) >= depositVouchers.length - 1)} className="p-2 hover:bg-slate-100 rounded-full text-slate-600 disabled:opacity-30" title="السابق (الأقدم)">
                <ArrowRight className="w-5 h-5" />
             </button>
             <button onClick={handleNext} disabled={depositVouchers.length === 0 || (currentVoucherId && depositVouchers.findIndex(v => v.id === currentVoucherId) <= 0)} className="p-2 hover:bg-slate-100 rounded-full text-slate-600 disabled:opacity-30" title="التالي (الأحدث)">
                <ArrowLeft className="w-5 h-5" />
             </button>
             <div className="h-6 w-px bg-slate-300 mx-2"></div>
             <button onClick={handleNew} className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-bold text-sm">
                <Plus className="w-4 h-4" />
                <span>سند جديد</span>
             </button>
         </div>
         <div className="relative">
             <Search className="w-4 h-4 absolute right-3 top-3 text-slate-400" />
             <select 
               className="pl-4 pr-10 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none appearance-none bg-white w-64"
               onChange={(e) => {
                 const v = depositVouchers.find(v => String(v.id) === String(e.target.value));
                 if(v) loadVoucher(v);
               }}
               value={currentVoucherId || ''}
             >
               <option value="">بحث عن سند تأمين...</option>
               {depositVouchers.map(v => (
                 <option key={v.id} value={v.id}>{v.voucher_number} - {v.amount}</option>
               ))}
             </select>
         </div>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="text-slate-500 hover:text-slate-800">
          <ArrowRight />
        </button>
        <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600">
          <ShieldCheck size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{isEditing ? 'تعديل سند تأمين' : 'سند قبض تأمين من عميل'}</h1>
          <p className="text-slate-500">تسجيل مبلغ تأمين مسترد من العميل (يظهر في الخصوم)</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className={voucherToPrint ? 'print:hidden' : ''}>
        <form onSubmit={handleSubmit} className="space-y-6">
          {isEditing && (
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 mb-4">
                  <span className="text-sm font-bold text-slate-500">رقم السند: </span>
                  <span className="font-mono font-bold text-indigo-600">{formData.voucherNumber}</span>
              </div>
           )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* التاريخ */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">التاريخ</label>
              <input 
                type="date" 
                required
                value={formData.date}
                onChange={e => setFormData({...formData, date: e.target.value})}
                className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            {/* اختيار العميل */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">العميل</label>
              <select 
                required
                value={formData.customerId}
                onChange={e => setFormData({...formData, customerId: e.target.value})}
                className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">اختر العميل...</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* اختيار الخزينة/البنك */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">إيداع في (الخزينة / البنك)</label>
              <select 
                required
                value={formData.treasuryAccountId}
                onChange={e => setFormData({...formData, treasuryAccountId: e.target.value})}
                className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">اختر الحساب...</option>
                {treasuryAccounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name} ({a.code})</option>
                ))}
              </select>
            </div>

            {/* المبلغ */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">مبلغ التأمين</label>
              <input 
                type="number" 
                required
                min="0"
                step="0.01"
                value={formData.amount}
                onChange={e => setFormData({...formData, amount: e.target.value})}
                className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-bold text-lg"
                placeholder="0.00"
              />
            </div>

            {/* البيان */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">البيان / ملاحظات</label>
              <textarea 
                rows={3}
                value={formData.description}
                onChange={e => setFormData({...formData, description: e.target.value})}
                className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="شرح مختصر للعملية..."
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end gap-4">
            <button 
                type="button"
                onClick={handlePrint}
                className="bg-slate-800 text-white px-6 py-2.5 rounded-lg hover:bg-slate-700 transition-colors flex items-center gap-2 font-bold"
            >
                <Printer size={18} /> طباعة
            </button>
            <button 
                type="button"
                onClick={handleWhatsApp}
                className="bg-green-600 text-white px-6 py-2.5 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 font-bold"
            >
                <MessageCircle size={18} /> واتساب
            </button>
            <button 
              type="submit"
              disabled={loading}
              className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 font-bold shadow-lg shadow-indigo-100 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              {isEditing ? 'حفظ التعديلات' : 'حفظ سند التأمين'}
            </button>
          </div>
        </form>
        </div>
      </div>
      <CustomerDepositPrint voucher={voucherToPrint} companySettings={companySettings} />
    </div>
  );
};

export default CustomerDepositForm;