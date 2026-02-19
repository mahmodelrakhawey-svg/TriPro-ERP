import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { FileMinus, Save, Loader2, User, Calendar, Calculator, Printer } from 'lucide-react';
import { useLocation } from 'react-router-dom';

const CreditNoteForm = () => {
  const { settings, customers, currentUser } = useAccounting();
  const location = useLocation();
  const { showToast } = useToast();
  const [formData, setFormData] = useState({
    customerId: '',
    date: new Date().toISOString().split('T')[0],
    amount: 0,
    notes: '',
    noteNumber: '',
    originalInvoiceNumber: ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
      if (location.state) {
          setFormData(prev => ({
              ...prev,
              customerId: location.state.customerId || '',
              amount: location.state.amount || 0,
              notes: location.state.notes || '',
              originalInvoiceNumber: location.state.originalInvoiceNumber || ''
          }));
      }
  }, [location.state]);

  // @ts-ignore
  const taxAmount = formData.amount * (settings.enableTax ? (settings.vatRate || 0.15) : 0);
  const totalAmount = formData.amount + taxAmount;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customerId || formData.amount <= 0) return showToast('يرجى إكمال البيانات', 'warning');
    
    setSaving(true);

    if (currentUser?.role === 'demo') {
        showToast('تم حفظ الإشعار الدائن وترحيل القيد بنجاح ✅ (محاكاة)', 'success');
        setFormData({ customerId: '', date: new Date().toISOString().split('T')[0], amount: 0, notes: '', noteNumber: '', originalInvoiceNumber: '' });
        setSaving(false);
        return;
    }

    try {
      const noteNumber = formData.noteNumber || `CN-${Date.now().toString().slice(-6)}`;

      // 1. حفظ الإشعار كمسودة (Draft)
      const { data: note, error: noteError } = await supabase.from('credit_notes').insert({
        credit_note_number: noteNumber,
        customer_id: formData.customerId,
        note_date: formData.date,
        amount_before_tax: formData.amount,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        notes: formData.notes,
        status: 'draft',
        original_invoice_number: formData.originalInvoiceNumber
      }).select().single();

      if (noteError) throw noteError;

      // 2. استدعاء الدالة الآمنة للترحيل
      const { error: rpcError } = await supabase.rpc('approve_credit_note', { p_note_id: note.id });
      
      if (rpcError) throw rpcError;

      showToast('تم حفظ الإشعار الدائن وترحيل القيد بنجاح ✅', 'success');
      setFormData({ customerId: '', date: new Date().toISOString().split('T')[0], amount: 0, notes: '', noteNumber: '', originalInvoiceNumber: '' });

    } catch (error: any) {
      console.error(error);
      showToast('خطأ: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center print:hidden">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <FileMinus className="text-red-600" /> إشعار دائن (Credit Note)
        </h2>
        <button onClick={handlePrint} className="bg-slate-800 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-700 shadow-sm text-sm font-bold">
            <Printer size={16} /> طباعة
        </button>
      </div>

      <form onSubmit={handleSave} className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 space-y-6 print:hidden">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">العميل</label>
                <div className="relative">
                    <select required value={formData.customerId} onChange={e => setFormData({...formData, customerId: e.target.value})} className="w-full border rounded-lg px-4 py-2.5 appearance-none">
                        <option value="">اختر العميل...</option>
                        {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <User className="absolute left-3 top-3 text-slate-400" size={18} />
                </div>
            </div>
            <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">التاريخ</label>
                <div className="relative">
                    <input type="date" required value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full border rounded-lg px-4 py-2.5" />
                    <Calendar className="absolute left-3 top-3 text-slate-400" size={18} />
                </div>
            </div>
            <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">المبلغ (قبل الضريبة)</label>
                <div className="relative">
                    <input type="number" required min="0.01" step="0.01" value={formData.amount} onChange={e => setFormData({...formData, amount: parseFloat(e.target.value)})} className="w-full border rounded-lg px-4 py-2.5 font-bold" />
                    <Calculator className="absolute left-3 top-3 text-slate-400" size={18} />
                </div>
            </div>
            <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">رقم الإشعار (اختياري)</label>
                <input type="text" value={formData.noteNumber} onChange={e => setFormData({...formData, noteNumber: e.target.value})} className="w-full border rounded-lg px-4 py-2.5" placeholder="تلقائي" />
            </div>
            <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">رقم الفاتورة الأصلية</label>
                <input type="text" value={formData.originalInvoiceNumber} onChange={e => setFormData({...formData, originalInvoiceNumber: e.target.value})} className="w-full border rounded-lg px-4 py-2.5" placeholder="رقم الفاتورة المرتبطة" />
            </div>
            <div className="md:col-span-2">
                <label className="block text-sm font-bold text-slate-700 mb-1">البيان / السبب</label>
                <textarea rows={2} value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full border rounded-lg px-4 py-2.5" placeholder="سبب إصدار الإشعار..."></textarea>
            </div>
        </div>

        <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 flex justify-between items-center text-sm font-bold">
            <div className="text-slate-500">الضريبة: <span className="text-slate-800">{taxAmount.toLocaleString()}</span></div>
            <div className="text-slate-500">الإجمالي شامل الضريبة: <span className="text-red-600 text-lg">{totalAmount.toLocaleString()}</span></div>
        </div>

        <div className="flex justify-end">
            <button type="submit" disabled={saving} className="bg-red-600 text-white px-8 py-3 rounded-lg font-bold hover:bg-red-700 flex items-center gap-2 shadow-lg disabled:opacity-50">
                {saving ? <Loader2 className="animate-spin" /> : <Save size={20} />} حفظ وترحيل
            </button>
        </div>
      </form>

      {/* Print Template */}
      <div className="hidden print:block bg-white p-8 text-black">
          <div className="text-center mb-8 border-b-2 border-slate-800 pb-6">
              {settings.logoUrl && (
                  <img src={settings.logoUrl} alt="Company Logo" className="w-24 h-24 mx-auto mb-4 object-contain" />
              )}
              <h1 className="text-3xl font-bold mb-2">
                  {/* @ts-ignore */}
                  {settings.companyName}</h1>
              <p className="text-sm text-slate-600">{settings.address} - {settings.phone}</p>
              <h2 className="text-2xl font-bold mt-6 border-t border-slate-200 pt-4">إشعار دائن / Credit Note</h2>
              <p className="font-mono mt-2 text-lg">{formData.noteNumber || 'مسودة / Draft'}</p>
          </div>
          
          <div className="grid grid-cols-2 gap-8 mb-8">
              <div>
                  <p className="text-sm text-slate-500 mb-1 font-bold">العميل / Customer</p>
                  <p className="font-bold text-lg">{customers.find(c => c.id === formData.customerId)?.name}</p>
              </div>
              <div className="text-left">
                  <p className="text-sm text-slate-500 mb-1 font-bold">التاريخ / Date</p>
                  <p className="font-bold text-lg">{formData.date}</p>
              </div>
              {formData.originalInvoiceNumber && (
                  <div className="col-span-2 text-center border-t border-slate-100 pt-4">
                      <p className="text-sm text-slate-500 mb-1 font-bold">رقم الفاتورة الأصلية / Original Invoice No</p>
                      <p className="font-bold text-lg">{formData.originalInvoiceNumber}</p>
                  </div>
              )}
          </div>

          <div className="border border-slate-300 rounded-lg overflow-hidden mb-8">
              <table className="w-full text-right">
                  <thead className="bg-slate-100 border-b border-slate-300">
                      <tr>
                          <th className="p-4 font-bold">البيان</th>
                          <th className="p-4 font-bold text-left">المبلغ</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                      <tr>
                          <td className="p-4">
                              <p className="font-bold mb-1">قيمة الإشعار (قبل الضريبة)</p>
                              <p className="text-sm text-slate-600">{formData.notes}</p>
                          </td>
                          <td className="p-4 text-left font-mono">{formData.amount.toLocaleString()}</td>
                      </tr>
                      {taxAmount > 0 && (
                          <tr>
                              <td className="p-4 font-bold">ضريبة القيمة المضافة ({(settings.vatRate || 0.15) * 100}%)</td>
                              <td className="p-4 text-left font-mono">{taxAmount.toLocaleString()}</td>
                          </tr>
                      )}
                      <tr className="bg-slate-50 font-bold text-lg">
                          <td className="p-4">الإجمالي النهائي</td>
                          <td className="p-4 text-left font-mono">{totalAmount.toLocaleString()}</td>
                      </tr>
                  </tbody>
              </table>
          </div>

          <div className="flex justify-between mt-16 pt-8 border-t border-slate-200 text-sm text-slate-500">
              <div className="text-center w-1/3">
                  <p className="mb-16">المحاسب</p>
                  <p className="border-t border-slate-300 pt-2">التوقيع</p>
              </div>
              <div className="text-center w-1/3">
                  <p className="mb-16">المدير المالي</p>
                  <p className="border-t border-slate-300 pt-2">التوقيع</p>
              </div>
              <div className="text-center w-1/3">
                  <p className="mb-16">استلام العميل</p>
                  <p className="border-t border-slate-300 pt-2">التوقيع</p>
              </div>
          </div>
      </div>
    </div>
  );
};

export default CreditNoteForm;
