import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import { Hammer, Plus, User, Calendar, CheckCircle2, AlertCircle, Loader2, ArrowRight, RotateCcw } from 'lucide-react';

interface ToolCustody {
  id: string;
  tool_name: string;
  employee_id: string;
  employee_name?: string;
  issue_date: string;
  return_date: string | null;
  status: 'issued' | 'returned' | 'lost';
  condition_notes: string;
}

const SiteAssetsCustody: React.FC<{ projectId: string, projectName: string, onBack: () => void }> = ({ projectId, projectName, onBack }) => {
  const { organization, employees } = useAccounting();
  const { showToast } = useToast();
  const [custodyList, setCustodyList] = useState<ToolCustody[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newCustody, setNewCustody] = useState({
    tool_name: '',
    employee_id: '',
    issue_date: new Date().toISOString().split('T')[0],
    condition_notes: ''
  });

  useEffect(() => { fetchCustody(); }, [projectId]);

  const fetchCustody = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('project_tool_custody')
      .select('*, employees(full_name)')
      .eq('project_id', projectId)
      .order('issue_date', { ascending: false });
    
    if (error) showToast(error.message, 'error');
    else setCustodyList(data.map(d => ({ ...d, employee_name: d.employees?.full_name })) || []);
    setLoading(false);
  };

  const handleIssueTool = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from('project_tool_custody').insert({
        project_id: projectId,
        organization_id: organization?.id,
        ...newCustody,
        status: 'issued'
      });
      if (error) throw error;
      showToast('تم تسليم العُهدة بنجاح ✅', 'success');
      setShowForm(false);
      fetchCustody();
    } catch (e: any) { showToast(e.message, 'error'); }
  };

  const handleReturnTool = async (id: string) => {
    const { error } = await supabase
      .from('project_tool_custody')
      .update({ status: 'returned', return_date: new Date().toISOString() })
      .eq('id', id);
    
    if (error) showToast(error.message, 'error');
    else { showToast('تم استلام العُهدة بنجاح 📦', 'success'); fetchCustody(); }
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen rtl text-right">
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-white rounded-full transition-all shadow-sm"><ArrowRight size={24} /></button>
          <div>
            <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
              <Hammer className="text-blue-600" /> عُهد الأدوات والمعدات: {projectName}
            </h1>
            <p className="text-slate-500 font-bold">تتبع الأدوات الصغيرة المنصرفة للعمال في الموقع</p>
          </div>
        </div>
        <button onClick={() => setShowForm(true)} className="bg-blue-600 text-white px-6 py-2 rounded-xl font-black flex items-center gap-2 shadow-lg shadow-blue-100">
          <Plus size={20} /> صرف عُهدة جديدة
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <form onSubmit={handleIssueTool} className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-8 space-y-5 animate-in zoom-in-95">
            <h3 className="text-xl font-black text-slate-800 border-b pb-4">تسجيل صرف أداة / معدة</h3>
            <div>
              <label className="block text-xs font-black text-slate-400 mb-2 uppercase">اسم المعدة / الأداة</label>
              <input type="text" required value={newCustody.tool_name} onChange={e => setNewCustody({...newCustody, tool_name: e.target.value})} className="w-full border-2 border-slate-100 rounded-xl p-3 font-bold" placeholder="مثلاً: هيلتي بوش 5 كجم" />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-400 mb-2 uppercase">الموظف / العامل المستلم</label>
              <select required value={newCustody.employee_id} onChange={e => setNewCustody({...newCustody, employee_id: e.target.value})} className="w-full border-2 border-slate-100 rounded-xl p-3 font-bold bg-white">
                <option value="">-- اختر من القائمة --</option>
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-black text-slate-400 mb-2 uppercase">تاريخ الصرف</label>
              <input type="date" value={newCustody.issue_date} onChange={e => setNewCustody({...newCustody, issue_date: e.target.value})} className="w-full border-2 border-slate-100 rounded-xl p-3 font-bold" />
            </div>
            <div className="flex gap-3 pt-4">
              <button type="submit" className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-black shadow-lg">تأكيد الصرف</button>
              <button type="button" onClick={() => setShowForm(false)} className="px-6 py-3 bg-slate-100 text-slate-500 rounded-xl font-bold">إلغاء</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full flex justify-center py-20"><Loader2 className="animate-spin text-blue-600" size={40} /></div>
        ) : custodyList.length === 0 ? (
          <div className="col-span-full bg-white rounded-[2rem] p-16 text-center border-2 border-dashed border-slate-200">
            <Hammer size={48} className="mx-auto text-slate-200 mb-4" />
            <p className="text-slate-400 font-bold">لا توجد عُهد مسجلة حالياً في هذا الموقع</p>
          </div>
        ) : (
          custodyList.map(item => (
            <div key={item.id} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-all">
              <div className="flex justify-between items-start mb-4">
                <div className={`p-3 rounded-xl ${item.status === 'returned' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                  <Hammer size={24} />
                </div>
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${
                  item.status === 'returned' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'
                }`}>
                  {item.status === 'returned' ? 'تمت الإعادة' : 'في العُهدة'}
                </span>
              </div>
              <h4 className="font-black text-slate-800 text-lg mb-1">{item.tool_name}</h4>
              <div className="flex items-center gap-2 text-sm text-slate-500 mb-4">
                <User size={14} className="text-blue-500" />
                <span className="font-bold">{item.employee_name}</span>
              </div>
              <div className="space-y-2 border-t pt-4">
                <div className="flex justify-between text-[11px] font-bold">
                  <span className="text-slate-400">تاريخ الاستلام:</span>
                  <span className="text-slate-700">{item.issue_date}</span>
                </div>
                {item.status === 'issued' ? (
                  <button 
                    onClick={() => handleReturnTool(item.id)}
                    className="w-full mt-4 flex items-center justify-center gap-2 bg-slate-900 text-white py-2.5 rounded-xl text-sm font-black hover:bg-emerald-600 transition-all"
                  >
                    <RotateCcw size={16} /> إثبات إعادة المعدة
                  </button>
                ) : (
                  <div className="flex justify-between text-[11px] font-bold text-emerald-600">
                    <span>تاريخ الإعادة:</span>
                    <span>{item.return_date?.split('T')[0]}</span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default SiteAssetsCustody;