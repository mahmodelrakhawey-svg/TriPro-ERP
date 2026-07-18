import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import { ArrowRight, Plus, FileText, CheckCircle2, ShieldAlert, Receipt, Star, Clock as ClockIcon, X, Save, Loader2, Calendar, Target, TrendingUp, Wallet, Paperclip, ChevronDown, ChevronUp, Percent } from 'lucide-react';
import SiteAttachmentManager from './SiteAttachmentManager';

interface SubBilling {
  id: string;
  billing_number: string;
  billing_date: string;
  gross_amount: number;
  retention_amount: number;
  advance_deduction: number;
  vat_rate?: number;
  vat_amount?: number;
  wht_rate?: number;
  wht_amount?: number;
  net_amount: number;
  status: string;
  items_progress?: Record<string, number>;
}

interface Props {
  contractId: string;
  onBack: () => void;
}

const SubcontractorBillingManager: React.FC<Props> = ({ contractId, onBack }) => {
  const { organization } = useAccounting();
  const [billings, setBillings] = useState<SubBilling[]>([]);
  const [contractDetails, setContractDetails] = useState<any>(null);
  const [contractItems, setContractItems] = useState<any[]>([]);
  const [subItemProgress, setSubItemProgress] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [activeAttachmentId, setActiveAttachmentId] = useState<string | null>(null);
  const [expandedBillingId, setExpandedBillingId] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalBilled: 0,
    totalPaid: 0,
    remainingBalance: 0,
    completionPercentage: 0
  });
  const [isCreating, setIsCreating] = useState(false);
  const [showApprovalDialog, setShowApprovalDialog] = useState<string | null>(null);
  const [newBilling, setNewBilling] = useState({
    billing_number: `SUB-BILL-${Date.now().toString().slice(-6)}`,
    billing_date: new Date().toISOString().split('T')[0],
    gross_amount: 0,
    retention_amount: 0,
    advance_deduction: 0,
    retention_release_date: '',
    vat_rate: 14,
    vat_amount: 0,
    wht_rate: 1,
    wht_amount: 0,
  });
  const [scores, setScores] = useState({ quality: 5, timeliness: 5 });
  const { showToast } = useToast();

  useEffect(() => {
    if (organization?.id) {
      fetchBillings();
      fetchContract();
      fetchContractItems();
    }
  }, [contractId, organization?.id]);

  const fetchContract = async () => {
    const { data } = await supabase
      .from('subcontractor_contracts')
      .select('*')
      .eq('id', contractId)
      .single();
    
    if (data) {
      setContractDetails(data);
      const totalBilled = billings.filter(b => b.status === 'approved').reduce((sum, b) => sum + b.gross_amount, 0);
      const completion = data.total_value > 0 ? (totalBilled / data.total_value) * 100 : 0;
      setStats({
        totalBilled,
        totalPaid: billings.filter(b => b.status === 'approved').reduce((sum, b) => sum + b.net_amount, 0),
        remainingBalance: data.total_value - totalBilled,
        completionPercentage: completion
      });
    }
  };

  const fetchContractItems = async () => {
    try {
      const { data, error } = await supabase
        .from('subcontractor_contract_items')
        .select('*')
        .eq('contract_id', contractId)
        .eq('organization_id', organization?.id);
      
      if (error) throw error;
      setContractItems(data || []);
      
      const initialProgress: Record<string, number> = {};
      data?.forEach(item => {
        initialProgress[item.id] = 0;
      });
      setSubItemProgress(initialProgress);
    } catch (error: any) {
      console.error("Error fetching subcontractor contract items:", error.message);
    }
  };

  // حساب قيمة إنجاز البنود للمقاول تلقائياً
  useEffect(() => {
    if (contractItems.length === 0) return;
    let totalCompletedValue = 0;

    contractItems.forEach(item => {
      const itemTotal = Number(item.quantity || 0) * Number(item.unit_price || 0);
      const progress = subItemProgress[item.id] || 0;
      totalCompletedValue += (progress / 100) * itemTotal;
    });

    setNewBilling(prev => {
      if (prev.gross_amount === totalCompletedValue) return prev;
      return {
        ...prev,
        gross_amount: Number(totalCompletedValue.toFixed(2))
      };
    });
  }, [subItemProgress, contractItems]);

  // أتمتة حساب الاستقطاعات والضرائب لمستخلص مقاول الباطن
  useEffect(() => {
    if (contractDetails && newBilling.gross_amount > 0) {
      const retention = (newBilling.gross_amount * (contractDetails.retention_percentage || 0)) / 100;
      
      let suggestedDeduction = 0;
      if (contractDetails.total_value > 0 && contractDetails.advance_payment_balance > 0) {
        const advanceRate = 0.1;
        suggestedDeduction = Math.min(newBilling.gross_amount * advanceRate, contractDetails.advance_payment_balance);
      }

      const baseForVat = Math.max(0, newBilling.gross_amount - retention - suggestedDeduction);
      const vat = (baseForVat * newBilling.vat_rate) / 100;
      const wht = (newBilling.gross_amount * newBilling.wht_rate) / 100;

      setNewBilling(prev => ({ 
        ...prev, 
        retention_amount: Number(retention.toFixed(2)),
        advance_deduction: Number(suggestedDeduction.toFixed(2)),
        vat_amount: Number(vat.toFixed(2)),
        wht_amount: Number(wht.toFixed(2))
      }));
    }
  }, [newBilling.gross_amount, newBilling.vat_rate, newBilling.wht_rate, contractDetails]);

  const fetchBillings = async () => {
    if (!organization?.id) return;

    const { data, error } = await supabase
      .from('subcontractor_billings')
      .select('*')
      .eq('contract_id', contractId)
      .eq('organization_id', organization.id)
      .order('billing_date', { ascending: false });
    
    if (error) showToast(error.message, 'error');
    else setBillings(data || []);
    setLoading(false);
  };

  const handleCreateBilling = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.from('subcontractor_billings').insert([{
        ...newBilling,
        retention_release_date: newBilling.retention_release_date || null,
        contract_id: contractId,
        organization_id: organization?.id,
        status: 'draft',
        items_progress: subItemProgress
      }]);

      if (error) {
        if (error.message.includes('items_progress') || error.code === '42703') {
          const { error: fallbackError } = await supabase.from('subcontractor_billings').insert([{
            billing_number: newBilling.billing_number,
            billing_date: newBilling.billing_date,
            gross_amount: newBilling.gross_amount,
            retention_amount: newBilling.retention_amount,
            advance_deduction: newBilling.advance_deduction,
            retention_release_date: newBilling.retention_release_date || null,
            vat_rate: newBilling.vat_rate,
            vat_amount: newBilling.vat_amount,
            wht_rate: newBilling.wht_rate,
            wht_amount: newBilling.wht_amount,
            contract_id: contractId,
            organization_id: organization?.id,
            status: 'draft'
          }]);
          if (fallbackError) throw fallbackError;
          showToast('تم حفظ مستخلص المقاول كمسودة ✅ (تحذير: لم يتم حفظ تفاصيل البنود، يرجى ترقية الجدول)', 'warning');
        } else {
          throw error;
        }
      } else {
        showToast('تم حفظ مستخلص المقاول كمسودة ✅', 'success');
      }
      setIsCreating(false);
      fetchBillings();
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const confirmApproval = async () => {
    if (!showApprovalDialog) return;
    try {
      setLoading(true);
      const { error } = await supabase.from('subcontractor_billings')
        .update({ status: 'approved', quality_score: scores.quality, timeliness_score: scores.timeliness })
        .eq('id', showApprovalDialog);

      const { error: accError } = await supabase.rpc('fn_approve_sub_billing', { p_billing_id: showApprovalDialog });
      
      if (error || accError) throw (error || accError);

      showToast('تم اعتماد مستخلص المقاول وترحيله للتكاليف بنجاح ✅', 'success');
      setShowApprovalDialog(null);
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
            <h2 className="text-xl font-bold text-gray-800">مستخلصات مقاول الباطن</h2>
            <p className="text-sm text-gray-500">متابعة الإنجاز والخصومات المالية</p>
          </div>
        </div>
        <button 
          onClick={() => {
            setIsCreating(true);
            setNewBilling({
              billing_number: `SUB-BILL-${Date.now().toString().slice(-6)}`,
              billing_date: new Date().toISOString().split('T')[0],
              gross_amount: 0,
              retention_amount: 0,
              advance_deduction: 0,
              retention_release_date: '',
              vat_rate: 14,
              vat_amount: 0,
              wht_rate: 1,
              wht_amount: 0,
            });
            const resetProgress: Record<string, number> = {};
            contractItems.forEach(item => {
              resetProgress[item.id] = 0;
            });
            setSubItemProgress(resetProgress);
          }}
          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-purple-100"
        >
          <Plus size={20} />
          إضافة مستخلص أعمال
        </button>
      </div>

      {contractDetails && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8 animate-in fade-in duration-500">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 text-slate-400 mb-2 font-bold text-xs"><Target size={14}/> إجمالي قيمة العقد</div>
            <div className="text-xl font-black text-slate-800">{contractDetails.total_value?.toLocaleString()}</div>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 text-blue-500 mb-2 font-bold text-xs"><TrendingUp size={14}/> إجمالي الأعمال المعتمدة</div>
            <div className="text-xl font-black text-blue-600">{stats.totalBilled.toLocaleString()}</div>
            <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
              <div className="bg-blue-500 h-full transition-all duration-1000" style={{ width: `${Math.min(stats.completionPercentage, 100)}%` }}></div>
            </div>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 text-emerald-500 mb-2 font-bold text-xs"><Wallet size={14}/> المتبقي في العقد</div>
            <div className="text-xl font-black text-emerald-600">{stats.remainingBalance.toLocaleString()}</div>
          </div>
          <div className="bg-gradient-to-br from-purple-600 to-indigo-700 p-4 rounded-2xl shadow-lg shadow-purple-100 text-white">
            <div className="flex items-center gap-2 opacity-80 mb-2 font-bold text-xs"><ShieldAlert size={14}/> رصيد الدفعة المقدمة</div>
            <div className="text-2xl font-black">{contractDetails.advance_payment_balance?.toLocaleString()}</div>
            <p className="text-[10px] mt-1 opacity-70 italic">* سيتم استهلاكها تلقائياً عند الاعتماد</p>
          </div>
        </div>
      )}

      {isCreating && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 text-right">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh] overflow-y-auto">
            <div className="p-6 bg-purple-50 border-b flex justify-between items-center">
              <h3 className="font-bold text-xl text-purple-800">إضافة مستخلص مقاول باطن</h3>
              <button onClick={() => setIsCreating(false)} className="text-purple-400 hover:text-purple-600"><X size={24} /></button>
            </div>
            <form onSubmit={handleCreateBilling} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">رقم المستخلص</label>
                  <input type="text" required value={newBilling.billing_number} onChange={e => setNewBilling({...newBilling, billing_number: e.target.value})} className="w-full p-2.5 border rounded-xl outline-none focus:ring-2 focus:ring-purple-500" placeholder="مثلاً: SUB-001" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">تاريخ المستخلص</label>
                  <input type="date" required value={newBilling.billing_date} onChange={e => setNewBilling({...newBilling, billing_date: e.target.value})} className="w-full p-2.5 border rounded-xl outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">قيمة الأعمال المنفذة (Gross)</label>
                <input 
                  type="number" required 
                  readOnly={contractItems.length > 0} 
                  value={newBilling.gross_amount} 
                  onChange={e => setNewBilling({...newBilling, gross_amount: parseFloat(e.target.value) || 0})} 
                  className={`w-full p-2.5 border rounded-xl outline-none ${contractItems.length > 0 ? 'bg-gray-50 text-gray-500 font-bold' : 'focus:ring-2 focus:ring-purple-500'}`} 
                />
              </div>

              {/* جدول بنود العقد للمستخلص */}
              {contractItems.length > 0 && (
                <div className="col-span-2 border-t pt-4 mt-2">
                  <h4 className="text-sm font-black text-slate-500 mb-3 flex items-center gap-1.5">
                    <Percent size={16} className="text-purple-600" />
                    تحديد نسب إنجاز بنود عقد مقاول الباطن
                  </h4>
                  <div className="border border-gray-100 rounded-2xl overflow-hidden max-h-60 overflow-y-auto shadow-inner bg-slate-50/30">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-100/80 text-gray-600 font-bold border-b border-gray-200 sticky top-0 backdrop-blur-sm">
                        <tr>
                          <th className="p-3">اسم البند</th>
                          <th className="p-3 text-center">الكمية</th>
                          <th className="p-3 text-center">سعر الوحدة</th>
                          <th className="p-3 text-center">القيمة التعاقدية</th>
                          <th className="p-3 text-center text-purple-600 w-28">نسبة الإنجاز %</th>
                          <th className="p-3 text-left">قيمة المنفذ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {contractItems.map((item) => {
                          const itemTotal = (item.quantity || 0) * (item.unit_price || 0);
                          const progress = subItemProgress[item.id] || 0;
                          const executedValue = (progress / 100) * itemTotal;
                          return (
                            <tr key={item.id} className="hover:bg-purple-50/10 transition-all">
                              <td className="p-3 font-semibold text-gray-700">{item.item_name}</td>
                              <td className="p-3 text-center text-gray-500">{item.quantity} {item.unit}</td>
                              <td className="p-3 text-center text-gray-500">{item.unit_price.toLocaleString()}</td>
                              <td className="p-3 text-center font-bold text-gray-700">{itemTotal.toLocaleString()}</td>
                              <td className="p-3 text-center">
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="1"
                                  value={progress || ''}
                                  onChange={(e) => {
                                    const val = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
                                    setSubItemProgress(prev => ({ ...prev, [item.id]: val }));
                                  }}
                                  placeholder="0"
                                  className="w-20 p-1.5 text-center rounded-lg border border-purple-200 focus:ring-2 focus:ring-purple-500 outline-none text-purple-600 font-bold"
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1 text-orange-600">خصم محتجز الضمان</label>
                  <input type="number" value={newBilling.retention_amount} onChange={e => setNewBilling({...newBilling, retention_amount: parseFloat(e.target.value) || 0})} className="w-full p-2.5 border rounded-xl outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1 text-blue-600">خصم استرداد دفعة</label>
                  <input type="number" value={newBilling.advance_deduction} onChange={e => setNewBilling({...newBilling, advance_deduction: parseFloat(e.target.value) || 0})} className="w-full p-2.5 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-1">
                  <Calendar size={14} className="text-emerald-600" /> تاريخ رد المحتجز المتوقع
                </label>
                <input 
                  type="date" 
                  value={newBilling.retention_release_date} 
                  onChange={e => setNewBilling({...newBilling, retention_release_date: e.target.value})} 
                  className="w-full p-2.5 border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-emerald-50/20" 
                />
              </div>
              <div className="border-t border-dashed pt-4 mt-2">
                <h4 className="text-xs font-black text-slate-400 mb-3 uppercase">الضرائب والرسوم القانونية</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">ضريبة القيمة المضافة (VAT) %</label>
                    <input type="number" value={newBilling.vat_rate} onChange={e => setNewBilling({...newBilling, vat_rate: parseFloat(e.target.value) || 0})} className="w-full p-2 rounded-xl border border-gray-200" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">مبلغ ضريبة القيمة المضافة</label>
                    <input type="number" readOnly value={newBilling.vat_amount} className="w-full p-2 rounded-xl bg-gray-50 border border-gray-100 font-bold text-blue-600" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">خصم أرباح تجارية (WHT) %</label>
                    <input type="number" value={newBilling.wht_rate} onChange={e => setNewBilling({...newBilling, wht_rate: parseFloat(e.target.value) || 0})} className="w-full p-2 rounded-xl border border-gray-200" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">مبلغ الخصم (يُطرح من الصافي)</label>
                    <input type="number" readOnly value={newBilling.wht_amount} className="w-full p-2 rounded-xl bg-gray-50 border border-gray-100 font-bold text-red-600" />
                  </div>
                </div>
              </div>
              <button type="submit" disabled={loading} className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all">
                {loading ? <Loader2 className="animate-spin" /> : <><Save size={20} /> حفظ المستخلص</>}
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {billings.map((bill) => (
          <div key={bill.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-4">
            <div className="flex flex-wrap md:flex-nowrap items-center justify-between gap-6">
              <div className="flex items-center gap-4 min-w-[200px]">
                <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
                  <Receipt size={24} />
                </div>
                <div>
                  <h4 className="font-bold text-gray-800">رقم: {bill.billing_number}</h4>
                  <p className="text-sm text-gray-500">{bill.billing_date}</p>
                </div>
              </div>

              <div className="flex flex-1 justify-around gap-4 text-center">
                <div>
                  <span className="text-xs text-gray-400 block mb-1">قيمة الأعمال</span>
                  <div className="font-bold text-gray-800">{bill.gross_amount.toLocaleString()}</div>
                </div>
                <div>
                  <span className="text-xs text-orange-400 block mb-1 flex items-center gap-1 justify-center">
                    <ShieldAlert size={12} /> محتجز
                  </span>
                  <div className="font-bold text-orange-600">-{bill.retention_amount.toLocaleString()}</div>
                </div>
                <div>
                  <span className="text-xs text-blue-400 block mb-1">استرداد دفعة</span>
                  <div className="font-bold text-blue-600">-{bill.advance_deduction.toLocaleString()}</div>
                </div>
                {(bill as any).vat_amount > 0 && (
                  <div>
                    <span className="text-xs text-indigo-400 block mb-1">القيمة المضافة (+VAT)</span>
                    <div className="font-bold text-indigo-600">+{((bill as any).vat_amount || 0).toLocaleString()}</div>
                  </div>
                )}
                {(bill as any).wht_amount > 0 && (
                  <div>
                    <span className="text-xs text-red-400 block mb-1">خصم تجاري (-WHT)</span>
                    <div className="font-bold text-red-600">-{((bill as any).wht_amount || 0).toLocaleString()}</div>
                  </div>
                )}
                <div className="border-r pr-6">
                  <span className="text-xs text-green-500 block mb-1 font-bold">صافي المستحق</span>
                  <div className="text-lg font-black text-green-700">{bill.net_amount.toLocaleString()}</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setActiveAttachmentId(bill.id)}
                  className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-all"
                  title="المرفقات المستندية"
                >
                  <Paperclip size={20} />
                </button>
                {contractItems.length > 0 && (
                  <button
                    onClick={() => setExpandedBillingId(expandedBillingId === bill.id ? null : bill.id)}
                    className={`p-2 rounded-lg transition-all ${expandedBillingId === bill.id ? 'text-purple-600 bg-purple-50' : 'text-slate-400 hover:text-purple-600 hover:bg-purple-50'}`}
                    title="عرض بنود المستخلص ونسب إنجاز المقاول"
                  >
                    {expandedBillingId === bill.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </button>
                )}
                {bill.status === 'draft' ? (
                  <button 
                    onClick={() => setShowApprovalDialog(bill.id)}
                    disabled={loading}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-xl text-sm font-bold transition-all"
                  >
                    اعتماد الصرف
                  </button>
                ) : (
                  <div className="flex items-center gap-1 text-green-600 bg-green-50 px-3 py-1.5 rounded-lg text-xs font-bold">
                    <CheckCircle2 size={14} /> مرحّل للتكاليف
                  </div>
                )}
              </div>
            </div>

            {/* تفاصيل نسب البنود المنفذة لهذا المستخلص */}
            {expandedBillingId === bill.id && contractItems.length > 0 && (
              <div className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-100 animate-in slide-in-from-top-2 duration-200">
                <h5 className="font-bold text-xs text-slate-500 mb-3 text-right">تفاصيل بنود مستخلص المقاول ونسب الإنجاز الفعلية</h5>
                <div className="bg-white rounded-xl overflow-hidden border border-slate-100">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-50 text-gray-500 font-bold border-b border-slate-100">
                      <tr>
                        <th className="p-3">اسم البند</th>
                        <th className="p-3 text-center">الكمية التعاقدية</th>
                        <th className="p-3 text-center">سعر الوحدة</th>
                        <th className="p-3 text-center">القيمة الإجمالية للبند</th>
                        <th className="p-3 text-center">نسبة الإنجاز</th>
                        <th className="p-3 text-left">قيمة المنفذ للخصم</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {contractItems.map((item) => {
                        const progress = bill.items_progress?.[item.id] || 0;
                        const itemTotal = (item.quantity || 0) * (item.unit_price || 0);
                        const executedValue = (progress / 100) * itemTotal;
                        return (
                          <tr key={item.id} className="hover:bg-slate-50/30">
                            <td className="p-3 font-semibold text-gray-700">{item.item_name}</td>
                            <td className="p-3 text-center text-gray-500">{item.quantity} {item.unit}</td>
                            <td className="p-3 text-center text-gray-500">{item.unit_price.toLocaleString()}</td>
                            <td className="p-3 text-center font-bold text-gray-700">{itemTotal.toLocaleString()}</td>
                            <td className="p-3 text-center">
                              <span className={`px-2.5 py-1 rounded-full font-bold text-[11px] ${progress > 0 ? 'bg-purple-50 text-purple-700 border border-purple-100' : 'bg-gray-50 text-gray-400'}`}>
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
            <FileText size={48} className="mx-auto text-gray-200 mb-4" />
            <p className="text-gray-500 font-medium">لا توجد مستخلصات لهذا العقد بعد</p>
          </div>
        )}
      </div>

      {/* 🛡️ نافذة التقييم والاعتماد */}
      {showApprovalDialog && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
              <ShieldAlert className="text-amber-500" /> اعتماد الأعمال وتقييم المقاول
            </h3>
            
            <div className="space-y-6 mb-8">
              <div>
                <label className="text-sm font-bold text-slate-600 mb-2 block flex items-center gap-2">
                  <Star size={14} className="text-amber-400" /> جودة التنفيذ (1-5)
                </label>
                <input 
                  type="range" min="1" max="5" value={scores.quality} 
                  onChange={(e) => setScores({...scores, quality: parseInt(e.target.value)})}
                  className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-purple-600"
                />
                <div className="flex justify-between text-[10px] font-bold text-slate-400 mt-1"><span>ضعيف</span><span>ممتاز</span></div>
              </div>

              <div>
                <label className="text-sm font-bold text-slate-600 mb-2 block flex items-center gap-2">
                  <ClockIcon size={14} className="text-blue-400" /> الالتزام بالجدول الزمني (1-5)
                </label>
                <input 
                  type="range" min="1" max="5" value={scores.timeliness} 
                  onChange={(e) => setScores({...scores, timeliness: parseInt(e.target.value)})}
                  className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-purple-600"
                />
                <div className="flex justify-between text-[10px] font-bold text-slate-400 mt-1"><span>متأخر</span><span>منضبط</span></div>
              </div>
            </div>

            <div className="flex gap-3">
              <button 
                onClick={confirmApproval}
                className="flex-1 bg-purple-600 text-white py-3 rounded-xl font-bold hover:bg-purple-700 transition-all shadow-lg shadow-purple-100"
              >
                تأكيد الاعتماد والترحيل
              </button>
              <button onClick={() => setShowApprovalDialog(null)} className="px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* 🏗️ ربط محرك المرفقات بالواجهة */}
      {activeAttachmentId && contractDetails && (
        <SiteAttachmentManager 
          projectId={contractDetails.project_id} 
          billingId={activeAttachmentId} 
          onClose={() => setActiveAttachmentId(null)} 
        />
      )}
    </div>
  );
};

export default SubcontractorBillingManager;