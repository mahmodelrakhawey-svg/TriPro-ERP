import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';
import { useToast } from '../../../context/ToastContext';
import { useAccounting } from '../../../context/AccountingContext';
import { ArrowRight, Plus, Wallet, Receipt, CheckCircle, Clock, X, Save, User, Loader2, DollarSign, Download, ArrowUpCircle } from 'lucide-react';

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
  category: string;
  expense_date: string;
  status: string;
}

interface Props {
  projectId: string;
  onBack: () => void;
}

const CustodyManager: React.FC<Props> = ({ projectId, onBack }) => {
  const { organization, employees } = useAccounting();
  const [custodies, setCustodies] = useState<Custody[]>([]);
  const [selectedCustody, setSelectedCustody] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [isToppingUp, setIsToppingUp] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState(0);
  const { showToast } = useToast();

  const [newExpense, setNewExpense] = useState({
    amount: 0,
    description: '',
    category: 'نثريات',
    expense_date: new Date().toISOString().split('T')[0]
  });

  const [newCustody, setNewCustody] = useState({
    custody_name: '',
    employee_id: '',
    total_advanced: 0
  });

  useEffect(() => {
    if (organization?.id) fetchCustodies();
  }, [projectId, organization?.id]);

  // حساب إجمالي المصاريف حسب التصنيف
  const categoryTotals = expenses.reduce((acc, curr) => {
    const cat = curr.category || 'أخرى';
    acc[cat] = (acc[cat] || 0) + curr.amount;
    return acc;
  }, {} as Record<string, number>);

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
  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id || !selectedCustody) return;
    
    setLoading(true);
    try {
      const { error } = await supabase.from('project_custody_expenses').insert([{
        custody_id: selectedCustody,
        organization_id: organization.id,
        amount: newExpense.amount,
        description: newExpense.description,
        category: newExpense.category,
        expense_date: newExpense.expense_date,
        status: 'draft'
      }]);

      if (error) throw error;
      showToast('تم تسجيل المصروف بنجاح ✅', 'success');
      setIsAddingExpense(false);
      setNewExpense({ amount: 0, description: '', category: 'نثريات', expense_date: new Date().toISOString().split('T')[0] });
      fetchExpenses(selectedCustody);
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCustody = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id) return;
    
    setLoading(true);
    try {
      const { error } = await supabase.from('project_custodies').insert([{
        project_id: projectId,
        organization_id: organization.id,
        custody_name: newCustody.custody_name,
        employee_id: newCustody.employee_id,
        total_advanced: newCustody.total_advanced,
        current_balance: newCustody.total_advanced,
        status: 'active'
      }]);

      if (error) throw error;
      showToast('تم إنشاء العهدة بنجاح ✅', 'success');
      setIsCreating(false);
      fetchCustodies();
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleTopUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustody || topUpAmount <= 0) return;
    setLoading(true);
    try {
      const { error } = await supabase.rpc('fn_top_up_custody', { 
        p_custody_id: selectedCustody, 
        p_amount: topUpAmount 
      });
      if (error) throw error;
      showToast('تمت تغذية العهدة بنجاح ✅', 'success');
      setIsToppingUp(false);
      setTopUpAmount(0);
      fetchCustodies();
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    const custody = custodies.find(c => c.id === selectedCustody);
    if (!custody) return;

    const headers = ["الوصف", "التصنيف", "التاريخ", "المبلغ", "الحالة"];
    const reportRows = [
      [`تقرير عهدة: ${custody.custody_name}`],
      [`الموظف المسؤول: ${custody.employee_name}`],
      [`الرصيد المتبقي: ${custody.current_balance} ج.م`],
      [],
      headers,
      ...expenses.map(e => [
        e.description,
        e.category,
        e.expense_date,
        e.amount,
        e.status === 'approved' ? 'معتمد' : 'مسودة'
      ]),
      [],
      ["إجمالي المصاريف حسب التصنيف"],
      ...Object.entries(categoryTotals).map(([cat, total]) => [cat, `${total} ج.م`]),
      ["إجمالي المنصرف", `${expenses.reduce((sum, e) => sum + e.amount, 0)} ج.م`]
    ];

    const csvContent = reportRows.map(row => row.join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `تقرير_عهدة_${custody.custody_name}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
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
        <button 
          onClick={() => setIsCreating(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-100 transition-all"
        >
          <Plus size={20} /> عهدة جديدة
        </button>
      </div>

      {isCreating && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 rtl text-right">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 bg-emerald-50 border-b border-emerald-100 flex justify-between items-center">
              <h3 className="font-black text-emerald-800 flex items-center gap-2">
                <Plus size={20} /> إنشاء عهدة موقع جديدة
              </h3>
              <button onClick={() => setIsCreating(false)} className="text-emerald-400 hover:text-emerald-600"><X size={24} /></button>
            </div>
            <form onSubmit={handleCreateCustody} className="p-8 space-y-5">
              <div>
                <label className="block text-xs font-black text-gray-400 uppercase mb-2">اسم العهدة</label>
                <input 
                  type="text" required
                  placeholder="مثال: عهدة نثريات الموقع"
                  value={newCustody.custody_name}
                  onChange={e => setNewCustody({...newCustody, custody_name: e.target.value})}
                  className="w-full border-2 border-gray-100 rounded-2xl p-3 focus:border-emerald-500 outline-none font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-black text-gray-400 uppercase mb-2">الموظف المسؤول</label>
                <select 
                  required
                  value={newCustody.employee_id}
                  onChange={e => setNewCustody({...newCustody, employee_id: e.target.value})}
                  className="w-full border-2 border-gray-100 rounded-2xl p-3 focus:border-emerald-500 outline-none font-bold bg-white"
                >
                  <option value="">-- اختر الموظف --</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-black text-gray-400 uppercase mb-2">المبلغ المسلم (الرصيد الافتتاحي)</label>
                <div className="relative">
                  <input 
                    type="number" required min="0"
                    value={newCustody.total_advanced}
                    onChange={e => setNewCustody({...newCustody, total_advanced: parseFloat(e.target.value)})}
                    className="w-full border-2 border-gray-100 rounded-2xl p-3 pl-12 text-2xl font-black text-emerald-700 focus:border-emerald-500 outline-none"
                  />
                  <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" />
                </div>
              </div>
              <button type="submit" disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-2xl font-black shadow-lg shadow-emerald-100 transition-all flex items-center justify-center gap-2">
                {loading ? <Loader2 className="animate-spin" /> : <><Save size={20} /> اعتماد العهدة</>}
              </button>
            </form>
          </div>
        </div>
      )}

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
        <div className="md:col-span-2 bg-white rounded-2xl border border-gray-100 p-6 shadow-sm relative">
          {!selectedCustody ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <Receipt size={48} className="mb-2 opacity-20" />
              <p>اختر عهدة لعرض تفاصيل المصروفات</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-gray-800">سجل المصروفات النقدية</h3>
                <div className="flex gap-2">
                  <button 
                    onClick={handleExport}
                    className="text-slate-600 text-sm font-bold hover:bg-slate-50 px-3 py-1 rounded-lg transition-colors flex items-center gap-1 border border-slate-100 shadow-sm"
                  >
                    <Download size={14} /> تصدير Excel
                  </button>
                  <button 
                    onClick={() => setIsAddingExpense(true)}
                    className="text-emerald-600 text-sm font-bold hover:bg-emerald-50 px-3 py-1 rounded-lg transition-colors"
                  >
                    + إضافة مصروف
                  </button>
                </div>
              </div>

              {isAddingExpense && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4 rtl text-right">
                  <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                    <div className="p-6 bg-emerald-50 border-b border-emerald-100 flex justify-between items-center">
                      <h3 className="font-black text-emerald-800 flex items-center gap-2">
                        <Receipt size={20} /> إضافة مصروف جديد للعهدة
                      </h3>
                      <button onClick={() => setIsAddingExpense(false)} className="text-emerald-400 hover:text-emerald-600"><X size={24} /></button>
                    </div>
                    <form onSubmit={handleCreateExpense} className="p-8 space-y-5">
                      <div>
                        <label className="block text-xs font-black text-gray-400 uppercase mb-2">وصف المصروف</label>
                        <input 
                          type="text" required
                          placeholder="مثلاً: شراء مسامير، غداء عمال..."
                          value={newExpense.description}
                          onChange={e => setNewExpense({...newExpense, description: e.target.value})}
                          className="w-full border-2 border-gray-100 rounded-2xl p-3 focus:border-emerald-500 outline-none font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-black text-gray-400 uppercase mb-2">التصنيف</label>
                        <select 
                          value={newExpense.category}
                          onChange={e => setNewExpense({...newExpense, category: e.target.value})}
                          className="w-full border-2 border-gray-100 rounded-2xl p-3 focus:border-emerald-500 outline-none font-bold bg-white"
                        >
                          <option value="نثريات">نثريات</option>
                          <option value="مواد بناء">مواد بناء</option>
                          <option value="أجور عمال">أجور عمال</option>
                          <option value="نقل">نقل</option>
                          <option value="أخرى">أخرى</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-black text-gray-400 uppercase mb-2">المبلغ</label>
                          <input 
                            type="number" required min="0.01" step="0.01"
                            value={newExpense.amount}
                            onChange={e => setNewExpense({...newExpense, amount: parseFloat(e.target.value)})}
                            className="w-full border-2 border-gray-100 rounded-2xl p-3 focus:border-emerald-500 outline-none font-black text-emerald-700 text-xl"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-black text-gray-400 uppercase mb-2">التاريخ</label>
                          <input 
                            type="date" required
                            value={newExpense.expense_date}
                            onChange={e => setNewExpense({...newExpense, expense_date: e.target.value})}
                            className="w-full border-2 border-gray-100 rounded-2xl p-3 focus:border-emerald-500 outline-none font-bold"
                          />
                        </div>
                      </div>
                      <button type="submit" disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-2xl font-black shadow-lg shadow-emerald-100 transition-all flex items-center justify-center gap-2">
                        {loading ? <Loader2 className="animate-spin" /> : <><Save size={20} /> تسجيل المصروف</>}
                      </button>
                    </form>
                  </div>
                </div>
              )}

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