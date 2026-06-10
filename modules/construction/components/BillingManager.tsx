import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import { ArrowRight, Plus, FileCheck, DollarSign, Percent, ShieldCheck, Paperclip, Calendar, Clock as ClockIcon } from 'lucide-react';
import SiteAttachmentManager from './SiteAttachmentManager';

interface Billing {
  id: string;
  billing_number: string;
  billing_date: string;
  completion_percentage: number;
  gross_amount: number;
  retention_amount: number;
  net_amount: number;
  retention_release_date?: string;
  status: string;
}

interface Props {
  projectId: string;
  onBack: () => void;
}

const BillingManager: React.FC<Props> = ({ projectId, onBack }) => {
  const { organization } = useAccounting();
  const [billings, setBillings] = useState<Billing[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [activeAttachmentId, setActiveAttachmentId] = useState<string | null>(null);
  const [newBilling, setNewBilling] = useState({
    billing_number: '',
    billing_date: new Date().toISOString().split('T')[0],
    completion_percentage: 0,
    gross_amount: 0,
    retention_amount: 0,
    advance_deduction: 0,
    vat_rate: 14, // نسبة افتراضية (مصر مثلاً)
    vat_amount: 0,
    wht_rate: 1,  // نسبة افتراضية لخصم الأرباح التجارية
    wht_amount: 0,
    retention_release_date: '',
  });
  const { showToast } = useToast();

  useEffect(() => {
    if (organization?.id) {
      fetchBillings();
    }
  }, [projectId, organization?.id]);

  // حساب مبالغ الضرائب تلقائياً عند تغيير الإجمالي أو النسب
  useEffect(() => {
    const vat = (newBilling.gross_amount * newBilling.vat_rate) / 100;
    const wht = (newBilling.gross_amount * newBilling.wht_rate) / 100;
    setNewBilling(prev => ({ ...prev, vat_amount: vat, wht_amount: wht }));
  }, [newBilling.gross_amount, newBilling.vat_rate, newBilling.wht_rate]);

  const fetchBillings = async () => {
    if (!organization?.id) return;

    const { data, error } = await supabase
      .from('project_progress_billings')
      .select('*')
      .eq('project_id', projectId)
      .eq('organization_id', organization.id)
      .order('billing_date', { ascending: false });
    
    if (error) showToast(error.message, 'error');
    else setBillings(data || []);
    setLoading(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id) return;
    
    try {
      setLoading(true);
      const { error } = await supabase.from('project_progress_billings').insert({
        ...newBilling,
        retention_release_date: newBilling.retention_release_date || null,
        project_id: projectId,
        organization_id: organization.id,
        status: 'draft'
      });
      if (error) throw error;
      showToast('تم إنشاء المستخلص بنجاح ✅', 'success');
      setIsCreating(false);
      fetchBillings();
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const approveBilling = async (id: string) => {
    try {
      setLoading(true);
      const { error } = await supabase.rpc('fn_approve_project_billing', { p_billing_id: id });
      if (error) throw error;
      showToast('تم اعتماد المستخلص وترحيله محاسبياً بنجاح ✅', 'success');
      fetchBillings();
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen rtl">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-white rounded-full transition-colors shadow-sm">
            <ArrowRight size={24} />
          </button>
          <div>
            <h2 className="text-xl font-bold text-gray-800">مستخلصات العميل (Progress Billings)</h2>
            <p className="text-sm text-gray-500">إدارة المطالبات المالية بناءً على نسب الإنجاز</p>
          </div>
        </div>
        <button 
          onClick={() => setIsCreating(true)}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-green-100"
        >
          <Plus size={20} />
          إنشاء مستخلص جديد
        </button>
      </div>

      {isCreating && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-8 max-w-2xl w-full shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold mb-6 text-gray-800 text-right">إنشاء مستخلص جديد للعميل</h3>
            <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-5 text-right" dir="rtl">
              <div className="col-span-2 md:col-span-1">
                <label className="block text-sm font-medium text-gray-600 mb-1">رقم المستخلص</label>
                <input 
                  type="text" required
                  value={newBilling.billing_number}
                  onChange={e => setNewBilling({...newBilling, billing_number: e.target.value})}
                  className="w-full p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  placeholder="مثلاً: BILL-001"
                />
              </div>
              <div className="col-span-2 md:col-span-1">
                <label className="block text-sm font-medium text-gray-600 mb-1">تاريخ المستخلص</label>
                <input 
                  type="date" required
                  value={newBilling.billing_date}
                  onChange={e => setNewBilling({...newBilling, billing_date: e.target.value})}
                  className="w-full p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">نسبة الإنجاز المخططة %</label>
                <input 
                  type="number" step="0.01" min="0" max="100" required
                  value={newBilling.completion_percentage}
                  onChange={e => setNewBilling({...newBilling, completion_percentage: parseFloat(e.target.value)})}
                  className="w-full p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">قيمة الأعمال المنفذة (Gross)</label>
                <input 
                  type="number" step="0.01" min="0" required
                  value={newBilling.gross_amount}
                  onChange={e => setNewBilling({...newBilling, gross_amount: parseFloat(e.target.value)})}
                  className="w-full p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">قيمة محتجز الضمان (Retention)</label>
                <input 
                  type="number" step="0.01" min="0"
                  value={newBilling.retention_amount}
                  onChange={e => setNewBilling({...newBilling, retention_amount: parseFloat(e.target.value)})}
                  className="w-full p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">استهلاك الدفعة المقدمة</label>
                <input 
                  type="number" step="0.01" min="0"
                  value={newBilling.advance_deduction}
                  onChange={e => setNewBilling({...newBilling, advance_deduction: parseFloat(e.target.value)})}
                  className="w-full p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                />
              </div>
              <div className="col-span-2 md:col-span-1">
                <label className="block text-sm font-medium text-gray-600 mb-1 flex items-center gap-1">
                   <Calendar size={14}/> تاريخ فك محتجز الضمان المتوقع
                </label>
                <input 
                  type="date"
                  value={newBilling.retention_release_date}
                  onChange={e => setNewBilling({...newBilling, retention_release_date: e.target.value})}
                  className="w-full p-3 rounded-xl border border-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none transition-all bg-emerald-50/30"
                />
              </div>
              <div className="col-span-2 border-t border-dashed pt-4 mt-2">
                <h4 className="text-sm font-black text-slate-400 mb-3 uppercase">الضرائب والرسوم القانونية</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">ضريبة القيمة المضافة (VAT) %</label>
                    <input type="number" value={newBilling.vat_rate} onChange={e => setNewBilling({...newBilling, vat_rate: parseFloat(e.target.value)})} className="w-full p-2 rounded-xl border border-gray-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">مبلغ ضريبة القيمة المضافة</label>
                    <input type="number" readOnly value={newBilling.vat_amount} className="w-full p-2 rounded-xl bg-gray-50 border border-gray-100 font-bold text-blue-600" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">خصم أرباح تجارية (WHT) %</label>
                    <input type="number" value={newBilling.wht_rate} onChange={e => setNewBilling({...newBilling, wht_rate: parseFloat(e.target.value)})} className="w-full p-2 rounded-xl border border-gray-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">مبلغ الخصم (يُطرح من الصافي)</label>
                    <input type="number" readOnly value={newBilling.wht_amount} className="w-full p-2 rounded-xl bg-gray-50 border border-gray-100 font-bold text-red-600" />
                  </div>
                </div>
              </div>
              <div className="col-span-2 flex gap-3 mt-6">
                <button type="submit" disabled={loading} className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100 active:scale-95 disabled:opacity-50">
                  {loading ? 'جاري الحفظ...' : 'حفظ المستخلص كمسودة'}
                </button>
                <button type="button" onClick={() => setIsCreating(false)} className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-bold hover:bg-gray-200 transition-colors active:scale-95">
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {billings.map((bill) => (
          <div key={bill.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-wrap md:flex-nowrap items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                <FileCheck size={24} />
              </div>
              <div>
                <h4 className="font-bold text-gray-800">مستخلص رقم: {bill.billing_number}</h4>
                <p className="text-sm text-gray-500">{bill.billing_date}</p>
              </div>
            </div>

            <div className="flex gap-8">
              <div className="text-center">
                <span className="text-xs text-gray-400 block mb-1">نسبة الإنجاز</span>
                <div className="flex items-center gap-1 font-bold text-blue-600">
                  <Percent size={14} /> {bill.completion_percentage}%
                </div>
              </div>
              
              <div className="text-center">
                <span className="text-xs text-gray-400 block mb-1">الإجمالي (Gross)</span>
                <div className="font-bold text-gray-800">{bill.gross_amount.toLocaleString()}</div>
              </div>

              <div className="text-center">
                <span className="text-xs text-red-400 block mb-1 flex items-center gap-1 justify-center">
                  <ShieldCheck size={12} /> محتجز ضمان
                </span>
                <div className="font-bold text-red-600">-{bill.retention_amount.toLocaleString()}</div>
                {bill.retention_release_date && (
                   <div className="text-[9px] font-bold text-slate-400 mt-1 flex items-center justify-center gap-1">
                      <ClockIcon size={10} /> {bill.retention_release_date}
                   </div>
                )}
              </div>

              <div className="text-center border-r pr-8">
                <span className="text-xs text-green-500 block mb-1 font-bold">الصافي للمطالبة</span>
                <div className="text-xl font-black text-green-700">{bill.net_amount.toLocaleString()}</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button 
                onClick={() => setActiveAttachmentId(bill.id)}
                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                title="المرفقات المستندية"
              >
                <Paperclip size={20} />
              </button>
              {bill.status === 'draft' ? (
                <button 
                  onClick={() => approveBilling(bill.id)}
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl text-sm font-bold transition-all"
                >
                  اعتماد وترحيل
                </button>
              ) : (
                <span className="bg-gray-100 text-gray-600 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider">
                  مرحل محاسبياً
                </span>
              )}
            </div>
          </div>
        ))}

        {billings.length === 0 && (
          <div className="bg-white rounded-3xl p-16 text-center border-2 border-dashed border-gray-100">
            <div className="bg-gray-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
              <DollarSign size={40} className="text-gray-300" />
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">لا يوجد مستخلصات لهذا المشروع</h3>
            <p className="text-gray-500 max-w-xs mx-auto">
              ابدأ بإنشاء أول مطالبة مالية للعميل بناءً على ما تم تنفيذه من بنود المقايسة.
            </p>
          </div>
        )}
      </div>

      {activeAttachmentId && (
        <SiteAttachmentManager 
          projectId={projectId} 
          billingId={activeAttachmentId} 
          onClose={() => setActiveAttachmentId(null)} 
        />
      )}
    </div>
  );
};

export default BillingManager;