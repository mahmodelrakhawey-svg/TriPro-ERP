import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import { Truck, Plus, CheckCircle2, AlertTriangle, Clock, Wrench, Settings, Save, X, Loader2 } from 'lucide-react';

const EquipmentManager: React.FC<{ projectId: string, projectName: string, onBack: () => void }> = ({ projectId, projectName, onBack }) => {
  const { organization } = useAccounting();
  const { showToast } = useToast();
  const [equipment, setEquipment] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]); // جلب الأصول المتاحة لربطها
  const [logs, setLogs] = useState<any[]>([]);
  const [showLogForm, setShowLogForm] = useState(false);
  const [showEquipDefineForm, setShowEquipDefineForm] = useState(false); // واجهة تعريف معدة جديدة
  const [defining, setDefining] = useState(false);
  const [newLog, setNewLog] = useState({ equipment_id: '', hours: 0, date: new Date().toISOString().split('T')[0] });
  const [newEquip, setNewEquip] = useState({ name: '', asset_id: '', hourly_cost: 0 });

  useEffect(() => {
    fetchData();
  }, [projectId]);

  const fetchData = async () => {
    const { data: eq } = await supabase.from('equipment').select('*').eq('organization_id', organization?.id);
    setEquipment(eq || []);

    // جلب الأصول الثابتة التي لم تسجل بعد كمعدات
    const { data: ast } = await supabase.from('assets').select('id, name').eq('organization_id', organization?.id);
    setAssets(ast || []);

    const { data: lg } = await supabase.from('equipment_usage_logs')
      .select('*, equipment(name)')
      .eq('project_id', projectId)
      .order('usage_date', { ascending: false });
    setLogs(lg || []);
  };

  const handleAddLog = async () => {
    try {
      const eq = equipment.find(e => e.id === newLog.equipment_id);
      const { error } = await supabase.from('equipment_usage_logs').insert({
        project_id: projectId,
        equipment_id: newLog.equipment_id,
        usage_date: newLog.date,
        hours_used: newLog.hours,
        cost_per_hour: eq?.hourly_operating_cost || 0,
        organization_id: organization?.id
      });
      if (error) throw error;
      showToast('تم تسجيل ساعات العمل بنجاح', 'success');
      setShowLogForm(false);
      fetchData();
    } catch (e: any) { showToast(e.message, 'error'); }
  };

  // 🏗️ دالة تعريف معدة جديدة (ربط الأصل بمعدات التشغيل)
  const handleDefineEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    setDefining(true);
    try {
      const { error } = await supabase.from('equipment').insert({
        organization_id: organization?.id,
        name: newEquip.name,
        asset_id: newEquip.asset_id || null,
        hourly_operating_cost: newEquip.hourly_cost,
        status: 'available'
      });
      if (error) throw error;
      showToast('تم تسجيل المعدة في قائمة التشغيل بنجاح ✅', 'success');
      setShowEquipDefineForm(false);
      setNewEquip({ name: '', asset_id: '', hourly_cost: 0 });
      fetchData();
    } catch (e: any) { showToast(e.message, 'error'); }
    finally { setDefining(false); }
  };

  const approveLog = async (logId: string) => {
    const { error } = await supabase.rpc('fn_approve_equipment_usage', { p_usage_log_id: logId });
    if (error) showToast(error.message, 'error');
    else { showToast('تم ترحيل تكلفة المعدة للمحاسبة', 'success'); fetchData(); }
  };

  return (
    <div className="p-6 rtl">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Truck className="text-amber-600" /> معدات المشروع: {projectName}
        </h1>
        <div className="flex gap-2">
          <button onClick={() => setShowEquipDefineForm(true)} className="bg-white border-2 border-slate-200 text-slate-700 px-4 py-2 rounded-xl flex items-center gap-2 font-bold hover:bg-slate-50 transition-all">
            <Settings size={18} className="text-blue-500" /> تعريف معدة جديدة
          </button>
          <button onClick={() => setShowLogForm(true)} className="bg-amber-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-bold shadow-lg shadow-amber-100 hover:bg-amber-700 transition-all">
            <Plus size={18} /> تسجيل تشغيل معدة
          </button>
        </div>
      </div>

      {/* 🏗️ واجهة تعريف المعدة (لحل مشكلة عدم ظهور الحفار) */}
      {showEquipDefineForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
          <form onSubmit={handleDefineEquipment} className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-8 animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
               <h3 className="text-xl font-black text-slate-800 flex items-center gap-2"><Wrench className="text-blue-600" /> تسجيل معدة في النظام</h3>
               <button type="button" onClick={() => setShowEquipDefineForm(false)} className="text-slate-400 hover:text-red-500"><X size={24}/></button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-400 mb-2 uppercase">اربط بالأصل الثابت (اختياري)</label>
                <select value={newEquip.asset_id} onChange={e => {
                  const asset = assets.find(a => a.id === e.target.value);
                  setNewEquip({...newEquip, asset_id: e.target.value, name: asset?.name || newEquip.name});
                }} className="w-full border-2 border-slate-100 rounded-xl p-3 font-bold bg-slate-50">
                  <option value="">-- اختر من الأصول الثابتة --</option>
                  {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-400 mb-2 uppercase">اسم المعدة التشغيلي</label>
                <input type="text" required value={newEquip.name} onChange={e => setNewEquip({...newEquip, name: e.target.value})} className="w-full border-2 border-slate-100 rounded-xl p-3 font-bold" placeholder="مثلاً: حفار كوماتسو - رقم 5" />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-400 mb-2 uppercase">تكلفة ساعة التشغيل التقديرية</label>
                <input type="number" required value={newEquip.hourly_cost} onChange={e => setNewEquip({...newEquip, hourly_cost: parseFloat(e.target.value)})} className="w-full border-2 border-slate-100 rounded-xl p-3 font-black text-blue-600 text-xl" />
                <p className="text-[10px] text-slate-400 mt-1">تستخدم لتحميل تكلفة المعدة على المشروع آلياً.</p>
              </div>
              <button type="submit" disabled={defining} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black shadow-lg flex items-center justify-center gap-2 mt-4">
                {defining ? <Loader2 className="animate-spin" /> : <><Save size={20} /> حفظ المعدة الآن</>}
              </button>
            </div>
          </form>
        </div>
      )}

      {showLogForm && (
        <div className="bg-amber-50 p-6 rounded-xl mb-8 border border-amber-200 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-sm font-bold mb-1">المعدة</label>
            <select className="w-full p-2 border rounded" onChange={e => setNewLog({...newLog, equipment_id: e.target.value})}>
              <option value="">اختر المعدة...</option>
              {equipment.map(e => <option key={e.id} value={e.id}>{e.name} ({e.hourly_operating_cost} ج.م/ساعة)</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold mb-1">التاريخ</label>
            <input type="date" className="w-full p-2 border rounded" value={newLog.date} onChange={e => setNewLog({...newLog, date: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-bold mb-1">عدد الساعات</label>
            <input type="number" className="w-full p-2 border rounded" onChange={e => setNewLog({...newLog, hours: Number(e.target.value)})} />
          </div>
          <div className="flex gap-2">
            <button onClick={handleAddLog} className="bg-amber-600 text-white px-6 py-2 rounded-lg font-bold flex-1">حفظ</button>
            <button onClick={() => setShowLogForm(false)} className="bg-gray-200 px-4 py-2 rounded-lg">إلغاء</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50 text-right">
            <tr>
              <th className="p-4">التاريخ</th>
              <th className="p-4">المعدة</th>
              <th className="p-4">الساعات</th>
              <th className="p-4">التكلفة الإجمالية</th>
              <th className="p-4">الحالة</th>
              <th className="p-4">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(log => (
              <tr key={log.id} className="border-t">
                <td className="p-4">{log.usage_date}</td>
                <td className="p-4 font-bold">{log.equipment?.name}</td>
                <td className="p-4">{log.hours_used} ساعة</td>
                <td className="p-4 text-amber-700 font-bold">{log.total_cost?.toLocaleString()} ج.م</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded text-xs ${log.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {log.status === 'approved' ? 'مُرحل' : 'مسودة'}
                  </span>
                </td>
                <td className="p-4">
                  {log.status === 'draft' && (
                    <button onClick={() => approveLog(log.id)} className="text-blue-600 hover:underline flex items-center gap-1 font-bold">
                      <CheckCircle2 size={16} /> اعتماد وترحيل
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
export default EquipmentManager;