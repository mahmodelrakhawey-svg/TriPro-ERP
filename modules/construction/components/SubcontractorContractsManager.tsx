import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';
import { useToast } from '../../../context/ToastContext';
import { useAccounting } from '../../../context/AccountingContext';
import { ArrowRight, Plus, FileText, DollarSign, Percent, Briefcase, X, Save, Loader2 } from 'lucide-react';

interface Contract {
  id: string;
  contract_name: string;
  total_value: number;
  retention_percentage: number;
  advance_payment_balance?: number; // 🏗️ جديد
  status: string;
  project_name?: string;
  subcontractor_name?: string;
}

interface Props {
  subcontractorId: string;
  onBack: () => void;
  onViewBillings: (contractId: string) => void;
}

const SubcontractorContractsManager: React.FC<Props> = ({ subcontractorId, onBack, onViewBillings }) => {
  const { organization } = useAccounting();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [projects, setProjects] = useState<{id: string, name: string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newContract, setNewContract] = useState({
    contract_name: '',
    project_id: '',
    total_value: 0,
    retention_percentage: 5
  });
  const { showToast } = useToast();

  useEffect(() => {
    if (organization?.id) {
      fetchContracts();
      fetchProjects();
    }
  }, [subcontractorId, organization?.id]);

  const fetchContracts = async () => {
    try {
      const { data, error } = await supabase
        .from('subcontractor_contracts')
        .select('*, projects(name), subcontractors(name)')
        .eq('subcontractor_id', subcontractorId)
        .eq('organization_id', organization?.id);

      if (error) throw error;
      setContracts(data.map(c => ({
        ...c,
        project_name: c.projects?.name,
        subcontractor_name: c.subcontractors?.name
      })));
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchProjects = async () => {
    const { data } = await supabase.from('projects').select('id, name').eq('organization_id', organization?.id);
    if (data) setProjects(data);
  };

  const handleCreateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.from('subcontractor_contracts').insert([{
        ...newContract,
        subcontractor_id: subcontractorId,
        organization_id: organization?.id,
        status: 'active'
      }]);
      if (error) throw error;
      showToast('تم إنشاء العقد بنجاح ✅', 'success');
      setIsCreating(false);
      fetchContracts();
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen rtl">
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-white rounded-full transition-colors shadow-sm">
            <ArrowRight size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <FileText className="text-purple-600" />
              عقود مقاول الباطن
            </h1>
            <p className="text-gray-500 mt-1">إدارة الارتباطات المالية للمشاريع</p>
          </div>
        </div>
        <button 
          onClick={() => setIsCreating(true)}
          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-lg shadow-purple-100"
        >
          <Plus size={20} />
          عقد جديد
        </button>
      </div>

      {isCreating && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 text-right">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
            <div className="p-6 border-b flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-xl text-gray-800 flex items-center gap-2">
                <Plus className="text-purple-600" size={24} /> إنشاء عقد مقاول باطن
              </h3>
              <button onClick={() => setIsCreating(false)} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={24} /></button>
            </div>
            <form onSubmit={handleCreateContract} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">اسم العقد / التوصيف</label>
                <input type="text" required value={newContract.contract_name} onChange={e => setNewContract({...newContract, contract_name: e.target.value})} className="w-full p-2.5 border rounded-xl outline-none focus:ring-2 focus:ring-purple-500" placeholder="مثلاً: أعمال السباكة - عمارة A" />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">المشروع المرتبط</label>
                <select required value={newContract.project_id} onChange={e => setNewContract({...newContract, project_id: e.target.value})} className="w-full p-2.5 border rounded-xl outline-none focus:ring-2 focus:ring-purple-500 bg-white">
                  <option value="">-- اختر المشروع --</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">قيمة العقد الإجمالية</label>
                  <input type="number" required value={newContract.total_value} onChange={e => setNewContract({...newContract, total_value: parseFloat(e.target.value)})} className="w-full p-2.5 border rounded-xl outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">نسبة محتجز الضمان %</label>
                  <input type="number" required value={newContract.retention_percentage} onChange={e => setNewContract({...newContract, retention_percentage: parseFloat(e.target.value)})} className="w-full p-2.5 border rounded-xl outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
              </div>
              <button type="submit" disabled={loading} className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all">
                {loading ? <Loader2 className="animate-spin" /> : <><Save size={20} /> حفظ العقد</>}
              </button>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {contracts.map((contract) => (
            <div key={contract.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
                  <Briefcase size={24} />
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  contract.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                }`}>
                  {contract.status === 'active' ? 'ساري' : 'مكتمل'}
                </span>
              </div>

              <h3 className="text-lg font-bold text-gray-800 mb-1">{contract.contract_name}</h3>
              <p className="text-sm text-gray-500 mb-4 flex items-center gap-1">
                المشروع: <span className="text-gray-700 font-medium">{contract.project_name}</span>
              </p>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-50 p-3 rounded-xl">
                  <span className="text-xs text-gray-400 block mb-1">قيمة العقد</span>
                  <div className="font-bold text-gray-800 flex items-center gap-1">
                    <DollarSign size={14} className="text-gray-400" />
                    {contract.total_value.toLocaleString()}
                  </div>
                </div>
                <div className="bg-gray-50 p-3 rounded-xl">
                  <span className="text-xs text-gray-400 block mb-1">نسبة المحتجز</span>
                  <div className="font-bold text-purple-600 flex items-center gap-1">
                    <Percent size={14} />
                    {contract.retention_percentage}%
                  </div>
                </div>
              </div>

              {/* 🏗️ عرض رصيد الدفعة المقدمة المتبقي */}
              {contract.advance_payment_balance !== undefined && contract.advance_payment_balance > 0 && (
                <div className="mb-4 p-3 bg-blue-50 rounded-xl border border-blue-100 flex justify-between items-center">
                  <span className="text-xs font-bold text-blue-600">الدفعة المقدمة المتبقية:</span>
                  <span className="font-black text-blue-700 font-mono">
                    {contract.advance_payment_balance.toLocaleString()}
                  </span>
                </div>
              )}

              <button
                onClick={() => onViewBillings(contract.id)}
                className="w-full bg-purple-50 hover:bg-purple-600 hover:text-white text-purple-700 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2"
              >
                إدارة المستخلصات
              </button>
            </div>
          ))}

          {contracts.length === 0 && (
            <div className="col-span-full bg-white rounded-3xl p-16 text-center border-2 border-dashed border-gray-100">
              <FileText size={48} className="mx-auto text-gray-200 mb-4" />
              <p className="text-gray-500">لا توجد عقود مسجلة لهذا المقاول</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SubcontractorContractsManager;