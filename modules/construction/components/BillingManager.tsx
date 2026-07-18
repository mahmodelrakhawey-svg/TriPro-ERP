import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import { ArrowRight, Plus, FileCheck, DollarSign, Percent, ShieldCheck, Paperclip, Calendar, Clock as ClockIcon, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import SiteAttachmentManager from './SiteAttachmentManager';

interface Billing {
  id: string;
  billing_number: string;
  billing_date: string;
  completion_percentage: number;
  gross_amount: number;
  retention_amount: number;
  advance_deduction: number;
  vat_rate?: number;
  vat_amount?: number;
  wht_rate?: number;
  wht_amount?: number;
  net_amount: number;
  retention_release_date?: string;
  status: string;
  items_progress?: Record<string, number>;
}

interface Props {
  projectId: string;
  onBack: () => void;
}

const BillingManager: React.FC<Props> = ({ projectId, onBack }) => {
  const { organization } = useAccounting();
  const [billings, setBillings] = useState<Billing[]>([]);
  const [boqItems, setBoqItems] = useState<any[]>([]);
  const [boqItemProgress, setBoqItemProgress] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [activeAttachmentId, setActiveAttachmentId] = useState<string | null>(null);
  const [expandedBillingId, setExpandedBillingId] = useState<string | null>(null);
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
      fetchBOQItems();
    }
  }, [projectId, organization?.id]);

  // جلب بنود المقايسة
  const fetchBOQItems = async () => {
    try {
      const { data, error } = await supabase
        .from('project_boq')
        .select('*')
        .eq('project_id', projectId)
        .eq('organization_id', organization?.id);
      
      if (error) throw error;
      setBoqItems(data || []);
      
      // تهيئة نسب الإنجاز الافتراضية
      const initialProgress: Record<string, number> = {};
      data?.forEach(item => {
        initialProgress[item.id] = 0;
      });
      setBoqItemProgress(initialProgress);
    } catch (error: any) {
      console.error("Error fetching BOQ:", error.message);
    }
  };

  // حساب نسبة وقيمة إنجاز البنود تلقائياً وتحديث المستخلص
  useEffect(() => {
    if (boqItems.length === 0) return;
    let totalBoqValue = 0;
    let totalCompletedValue = 0;

    boqItems.forEach(item => {
      const qty = Number(item.estimated_quantity || 0);
      const price = Number(item.unit_price || 0);
      const totalItemVal = qty * price;
      totalBoqValue += totalItemVal;

      const progress = boqItemProgress[item.id] || 0;
      totalCompletedValue += (progress / 100) * totalItemVal;
    });

    const overallPct = totalBoqValue > 0 ? (totalCompletedValue / totalBoqValue) * 100 : 0;
    const defaultRetention = totalCompletedValue * 0.10; // محتجز ضمان 10% افتراضي

    setNewBilling(prev => {
      if (prev.gross_amount === totalCompletedValue && prev.completion_percentage === overallPct) {
        return prev;
      }
      return {
        ...prev,
        gross_amount: Number(totalCompletedValue.toFixed(2)),
        completion_percentage: Number(overallPct.toFixed(2)),
        retention_amount: Number(defaultRetention.toFixed(2))
      };
    });
  }, [boqItemProgress, boqItems]);

  // حساب مبالغ الضرائب تلقائياً عند تغيير الإجمالي أو الاستقطاعات
  useEffect(() => {
    const baseForVat = Math.max(0, newBilling.gross_amount - newBilling.retention_amount - newBilling.advance_deduction);
    const vat = (baseForVat * newBilling.vat_rate) / 100;
    const wht = (newBilling.gross_amount * newBilling.wht_rate) / 100;
    setNewBilling(prev => ({ ...prev, vat_amount: vat, wht_amount: wht }));
  }, [newBilling.gross_amount, newBilling.retention_amount, newBilling.advance_deduction, newBilling.vat_rate, newBilling.wht_rate]);

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
      
      // محاولة حفظ المستخلص شاملاً نسب البنود المنفذة
      const { error } = await supabase.from('project_progress_billings').insert({
        ...newBilling,
        retention_release_date: newBilling.retention_release_date || null,
        project_id: projectId,
        organization_id: organization.id,
        status: 'draft',
        items_progress: boqItemProgress
      });
      
      if (error) {
        // آلية تراجع آمنة في حال عدم إضافة حقل items_progress بقاعدة البيانات
        if (error.message.includes('items_progress') || error.code === '42703') {
          const { error: fallbackError } = await supabase.from('project_progress_billings').insert({
            billing_number: newBilling.billing_number,
            billing_date: newBilling.billing_date,
            completion_percentage: newBilling.completion_percentage,
            gross_amount: newBilling.gross_amount,
            retention_amount: newBilling.retention_amount,
            advance_deduction: newBilling.advance_deduction,
            vat_rate: newBilling.vat_rate,
            vat_amount: newBilling.vat_amount,
            wht_rate: newBilling.wht_rate,
            wht_amount: newBilling.wht_amount,
            retention_release_date: newBilling.retention_release_date || null,
            project_id: projectId,
            organization_id: organization.id,
            status: 'draft'
          });
          if (fallbackError) throw fallbackError;
          showToast('تم حفظ المستخلص بنجاح ✅ (تحذير: لم يتم حفظ تفاصيل البنود، يرجى ترقية قاعدة البيانات)', 'warning');
        } else {
          throw error;
        }
      } else {
        showToast('تم إنشاء المستخلص بنجاح ✅', 'success');
      }
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
          onClick={() => {
            setIsCreating(true);
            // إفراغ النموذج وإعادة تهيئة نسب الإنجاز
            setNewBilling({
              billing_number: '',
              billing_date: new Date().toISOString().split('T')[0],
              completion_percentage: 0,
              gross_amount: 0,
              retention_amount: 0,
              advance_deduction: 0,
              vat_rate: 14,
              vat_amount: 0,
              wht_rate: 1,
              wht_amount: 0,
              retention_release_date: '',
            });
            const resetProgress: Record<string, number> = {};
            boqItems.forEach(item => {
              resetProgress[item.id] = 0;
            });
            setBoqItemProgress(resetProgress);
          }}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-green-100"
        >
          <Plus size={20} />
          إنشاء مستخلص جديد
        </button>
      </div>

      {isCreating && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-8 max-w-4xl w-full shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
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
                  readOnly={boqItems.length > 0}
                  onChange={e => setNewBilling({...newBilling, completion_percentage: parseFloat(e.target.value)})}
                  className={`w-full p-3 rounded-xl border border-gray-200 outline-none transition-all ${boqItems.length > 0 ? 'bg-gray-50 text-gray-500 font-bold' : 'focus:ring-2 focus:ring-blue-500'}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">قيمة الأعمال المنفذة (Gross)</label>
                <input 
                  type="number" step="0.01" min="0" required
                  value={newBilling.gross_amount}
                  readOnly={boqItems.length > 0}
                  onChange={e => setNewBilling({...newBilling, gross_amount: parseFloat(e.target.value)})}
                  className={`w-full p-3 rounded-xl border border-gray-200 outline-none transition-all ${boqItems.length > 0 ? 'bg-gray-50 text-gray-500 font-bold' : 'focus:ring-2 focus:ring-blue-500'}`}
                />
              </div>

              {/* جدول البنود وتحديد نسب إنجازها */}
              {boqItems.length > 0 && (
                <div className="col-span-2 border-t pt-4 mt-2">
                  <h4 className="text-sm font-black text-slate-500 mb-3 flex items-center gap-1.5">
                    <Percent size={16} className="text-blue-600" />
                    تحديد نسب الإنجاز الفعلية لبنود المقايسة (BOQ)
                  </h4>
                  <div className="border border-gray-100 rounded-2xl overflow-hidden max-h-60 overflow-y-auto shadow-inner bg-slate-50/30">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-100/80 text-gray-600 font-bold border-b border-gray-200 sticky top-0 backdrop-blur-sm">
                        <tr>
                          <th className="p-3">اسم البند</th>
                          <th className="p-3 text-center">الكمية</th>
                          <th className="p-3 text-center">سعر الوحدة</th>
                          <th className="p-3 text-center">القيمة المخططة</th>
                          <th className="p-3 text-center text-blue-600 w-28">نسبة الإنجاز %</th>
                          <th className="p-3 text-left">قيمة المنفذ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {boqItems.map((item) => {
                          const plannedTotal = (item.estimated_quantity || 0) * (item.unit_price || 0);
                          const progress = boqItemProgress[item.id] || 0;
                          const executedValue = (progress / 100) * plannedTotal;
                          return (
                            <tr key={item.id} className="hover:bg-blue-50/20 transition-all">
                              <td className="p-3 font-semibold text-gray-700">{item.item_name}</td>
                              <td className="p-3 text-center text-gray-500">{item.estimated_quantity} {item.unit}</td>
                              <td className="p-3 text-center text-gray-500">{item.unit_price.toLocaleString()}</td>
                              <td className="p-3 text-center font-bold text-gray-700">{plannedTotal.toLocaleString()}</td>
                              <td className="p-3 text-center">
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="1"
                                  value={progress || ''}
                                  onChange={(e) => {
                                    const val = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
                                    setBoqItemProgress(prev => ({ ...prev, [item.id]: val }));
                                  }}
                                  placeholder="0"
                                  className="w-20 p-1.5 text-center rounded-lg border border-blue-200 focus:ring-2 focus:ring-blue-500 outline-none text-blue-600 font-bold"
                                />
                              </td>
                              <td className="p-3 text-left font-black text-emerald-600">{executedValue.toLocaleString()}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

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
                    <input type="number" value={newBilling.vat_rate} onChange={e => setNewBilling({...newBilling, vat_rate: parseFloat(e.target.value)})} className="w-full p-2 rounded-xl border border-gray-100 focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">مبلغ ضريبة القيمة المضافة</label>
                    <input type="number" readOnly value={newBilling.vat_amount} className="w-full p-2 rounded-xl bg-gray-50 border border-gray-100 font-bold text-blue-600" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">خصم أرباح تجارية (WHT) %</label>
                    <input type="number" value={newBilling.wht_rate} onChange={e => setNewBilling({...newBilling, wht_rate: parseFloat(e.target.value)})} className="w-full p-2 rounded-xl border border-gray-100 focus:ring-2 focus:ring-blue-500 outline-none" />
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
          <div key={bill.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-4">
            <div className="flex flex-wrap md:flex-nowrap items-center justify-between gap-6">
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
                {boqItems.length > 0 && (
                  <button
                    onClick={() => setExpandedBillingId(expandedBillingId === bill.id ? null : bill.id)}
                    className={`p-2 rounded-lg transition-all ${expandedBillingId === bill.id ? 'text-blue-600 bg-blue-50' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'}`}
                    title="عرض بنود المستخلص ونسب الإنجاز"
                  >
                    {expandedBillingId === bill.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </button>
                )}
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

            {/* تفاصيل نسب البنود المنفذة لهذا المستخلص */}
            {expandedBillingId === bill.id && boqItems.length > 0 && (
              <div className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-100 animate-in slide-in-from-top-2 duration-200">
                <h5 className="font-bold text-xs text-slate-500 mb-3 text-right">تفاصيل بنود المستخلص ونسب الإنجاز الفعلية</h5>
                <div className="bg-white rounded-xl overflow-hidden border border-slate-100">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-50 text-gray-500 font-bold border-b border-slate-100">
                      <tr>
                        <th className="p-3">اسم البند</th>
                        <th className="p-3 text-center">الكمية التقديرية</th>
                        <th className="p-3 text-center">سعر الوحدة</th>
                        <th className="p-3 text-center">القيمة المخططة</th>
                        <th className="p-3 text-center">نسبة الإنجاز الفعلية</th>
                        <th className="p-3 text-left">قيمة المنفذ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {boqItems.map((item) => {
                        const progress = bill.items_progress?.[item.id] || 0;
                        const plannedTotal = (item.estimated_quantity || 0) * (item.unit_price || 0);
                        const executedValue = (progress / 100) * plannedTotal;
                        return (
                          <tr key={item.id} className="hover:bg-slate-50/30">
                            <td className="p-3 font-semibold text-gray-700">{item.item_name}</td>
                            <td className="p-3 text-center text-gray-500">{item.estimated_quantity} {item.unit}</td>
                            <td className="p-3 text-center text-gray-500">{item.unit_price.toLocaleString()}</td>
                            <td className="p-3 text-center font-bold text-gray-700">{plannedTotal.toLocaleString()}</td>
                            <td className="p-3 text-center">
                              <span className={`px-2.5 py-1 rounded-full font-bold text-[11px] ${progress > 0 ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'bg-gray-50 text-gray-400'}`}>
                                {progress}%
                              </span>
                            </td>
                            <td className="p-3 text-left font-black text-slate-800">{executedValue.toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
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