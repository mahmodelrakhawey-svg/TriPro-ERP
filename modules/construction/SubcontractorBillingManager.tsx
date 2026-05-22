import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../../context/ToastContext';
import { ArrowRight, Plus, FileText, CheckCircle2, ShieldAlert, Receipt } from 'lucide-react';

interface SubBilling {
  id: string;
  billing_number: string;
  billing_date: string;
  gross_amount: number;
  retention_amount: number;
  advance_deduction: number;
  net_amount: number;
  status: string;
}

interface Props {
  contractId: string;
  onBack: () => void;
}

const SubcontractorBillingManager: React.FC<Props> = ({ contractId, onBack }) => {
  const [billings, setBillings] = useState<SubBilling[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    fetchBillings();
  }, [contractId]);

  const fetchBillings = async () => {
    const { data, error } = await supabase
      .from('subcontractor_billings')
      .select('*')
      .eq('contract_id', contractId)
      .order('billing_date', { ascending: false });
    
    if (error) showToast(error.message, 'error');
    else setBillings(data || []);
    setLoading(false);
  };

  const approveBilling = async (id: string) => {
    try {
      setLoading(true);
      const { error } = await supabase.rpc('fn_approve_sub_billing', { p_billing_id: id });
      if (error) throw error;
      showToast('تم اعتماد مستخلص المقاول وترحيله للتكاليف بنجاح ✅', 'success');
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
        <button className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-purple-100">
          <Plus size={20} />
          إضافة مستخلص أعمال
        </button>
      </div>

      <div className="space-y-4">
        {billings.map((bill) => (
          <div key={bill.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-wrap md:flex-nowrap items-center justify-between gap-6">
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
              <div className="border-r pr-6">
                <span className="text-xs text-green-500 block mb-1 font-bold">صافي المستحق</span>
                <div className="text-lg font-black text-green-700">{bill.net_amount.toLocaleString()}</div>
              </div>
            </div>

            <div>
              {bill.status === 'draft' ? (
                <button 
                  onClick={() => approveBilling(bill.id)}
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
        ))}

        {billings.length === 0 && (
          <div className="bg-white rounded-3xl p-16 text-center border-2 border-dashed border-gray-100">
            <FileText size={48} className="mx-auto text-gray-200 mb-4" />
            <p className="text-gray-500 font-medium">لا توجد مستخلصات لهذا العقد بعد</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SubcontractorBillingManager;