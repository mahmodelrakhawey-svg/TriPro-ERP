import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';
import { useToast } from '../../../context/ToastContext';
import { useAccounting } from '../../../context/AccountingContext';
import { ArrowRight, Plus, Wallet, Receipt, CheckCircle, Clock } from 'lucide-react';

interface Custody {
  id: string;
  custody_name: string;
  total_advanced: number;
  current_balance: number;
  status: string;
  employee_name?: string;
}

interface Expense {
  id: string;
  amount: number;
  description: string;
  expense_date: string;
  status: string;
}

interface Props {
  projectId: string;
  onBack: () => void;
}

const CustodyManager: React.FC<Props> = ({ projectId, onBack }) => {
  const { organization } = useAccounting();
  const [custodies, setCustodies] = useState<Custody[]>([]);
  const [selectedCustody, setSelectedCustody] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    if (organization?.id) fetchCustodies();
  }, [projectId, organization?.id]);

  const fetchCustodies = async () => {
    const { data } = await supabase
        .from('project_custodies')
        .select('*, employees(full_name)')
        .eq('project_id', projectId)
        .eq('organization_id', organization?.id);
    if (data) setCustodies(data.map(d => ({ ...d, employee_name: d.employees?.full_name })));
    setLoading(false);
  };

  const fetchExpenses = async (custodyId: string) => {
    const { data } = await supabase.from('project_custody_expenses').select('*').eq('custody_id', custodyId).order('expense_date', { ascending: false });
    if (data) setExpenses(data);
    setSelectedCustody(custodyId);
  };

  const approveExpense = async (id: string) => {
    try {
      const { error } = await supabase.rpc('fn_approve_custody_expense', { p_expense_id: id });
      if (error) throw error;
      showToast('تم اعتماد المصروف بنجاح ✅', 'success');
      if (selectedCustody) fetchExpenses(selectedCustody);
      fetchCustodies();
    } catch (error: any) {
      showToast(error.message, 'error');
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen rtl">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-white rounded-full transition-colors shadow-sm">
            <ArrowRight size={24} />
          </button>
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Wallet className="text-emerald-600" /> إدارة العهد المالية
          </h2>
        </div>
        <button className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-100 transition-all">
          <Plus size={20} /> عهدة جديدة
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* قائمة العهد */}
        <div className="md:col-span-1 space-y-4">
          {custodies.map(c => (
            <div 
              key={c.id} 
              onClick={() => fetchExpenses(c.id)}
              className={`p-4 rounded-2xl border cursor-pointer transition-all ${selectedCustody === c.id ? 'bg-emerald-50 border-emerald-500' : 'bg-white border-gray-100 hover:shadow-md'}`}
            >
              <h4 className="font-bold text-gray-800">{c.custody_name}</h4>
              <p className="text-xs text-gray-500 mb-3">{c.employee_name}</p>
              <div className="flex justify-between items-end">
                <span className="text-xs text-gray-400">الرصيد المتبقي</span>
                <span className="text-lg font-black text-emerald-700">{c.current_balance.toLocaleString()} ج.م</span>
              </div>
            </div>
          ))}
        </div>

        {/* تفاصيل المصروفات */}
        <div className="md:col-span-2 bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          {!selectedCustody ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <Receipt size={48} className="mb-2 opacity-20" />
              <p>اختر عهدة لعرض تفاصيل المصروفات</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-gray-800">سجل المصروفات النقدية</h3>
                <button className="text-emerald-600 text-sm font-bold">+ إضافة مصروف</button>
              </div>
              {expenses.map(e => (
                <div key={e.id} className="flex items-center justify-between p-3 border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    {e.status === 'approved' ? <CheckCircle className="text-green-500" size={18} /> : <Clock className="text-orange-400" size={18} />}
                    <div>
                      <p className="text-sm font-medium text-gray-800">{e.description}</p>
                      <p className="text-xs text-gray-400">{e.expense_date}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-bold text-gray-700">{e.amount.toLocaleString()} ج.م</span>
                    {e.status === 'draft' && <button onClick={() => approveExpense(e.id)} className="text-xs bg-emerald-50 text-emerald-600 px-3 py-1 rounded-lg font-bold">اعتماد</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CustodyManager;