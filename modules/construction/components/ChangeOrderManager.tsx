import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';
import { useToast } from '../../../context/ToastContext';
import { ArrowRight, Plus, FileEdit, CheckCircle, AlertCircle, TrendingUp } from 'lucide-react';
import ProjectChangeOrderForm from './ProjectChangeOrderForm';

interface ChangeOrder {
  id: string;
  order_number: string;
  description: string;
  amount_change: number;
  status: 'draft' | 'approved' | 'rejected';
  created_at: string;
}

const ChangeOrderManager = ({ projectId, projectName, onBack }: { projectId: string, projectName: string, onBack: () => void }) => {
  const [orders, setOrders] = useState<ChangeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const { showToast } = useToast();

  useEffect(() => { fetchOrders(); }, []);

  const fetchOrders = async () => {
    const { data } = await supabase.from('project_change_orders').select('*').eq('project_id', projectId).order('created_at', { ascending: false });
    setOrders(data || []);
    setLoading(false);
  };

  const approveOrder = async (id: string) => {
    const { error } = await supabase.rpc('fn_approve_change_order', { p_order_id: id });
    if (error) showToast(error.message, 'error');
    else {
      showToast('تم اعتماد أمر التغيير وتحديث ميزانية المشروع ✅', 'success');
      fetchOrders();
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen rtl">
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-white rounded-full transition-colors shadow-sm"><ArrowRight size={24} /></button>
          <div>
            <h1 className="text-2xl font-black text-slate-800">أوامر التغيير: {projectName}</h1>
            <p className="text-slate-500">إدارة التعديلات المالية على نطاق العمل (Scope Changes)</p>
          </div>
        </div>
        <button 
          onClick={() => setShowForm(true)}
          className="bg-rose-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-rose-100"
        >
          <Plus size={20} /> أمر تغيير جديد
        </button>
      </div>

      <div className="grid gap-4">
        {orders.map(order => (
          <div key={order.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${order.status === 'approved' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                <FileEdit size={24} />
              </div>
              <div>
                <h4 className="font-bold text-slate-800">{order.description}</h4>
                <p className="text-xs text-slate-400 font-mono">#{order.order_number} | {new Date(order.created_at).toLocaleDateString('ar-EG')}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-8">
              <div className="text-center">
                <span className="text-[10px] font-black text-slate-400 uppercase block mb-1">قيمة التعديل</span>
                <span className={`text-lg font-black ${order.amount_change >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {order.amount_change >= 0 ? '+' : ''}{order.amount_change.toLocaleString()}
                </span>
              </div>
              
              {order.status === 'draft' ? (
                <button onClick={() => approveOrder(order.id)} className="bg-slate-900 text-white px-6 py-2 rounded-xl text-xs font-bold hover:bg-slate-800 transition-all">اعتماد الآن</button>
              ) : (
                <div className="flex items-center gap-1 text-emerald-600 font-black text-xs bg-emerald-50 px-4 py-2 rounded-lg">
                  <CheckCircle size={14} /> تم التحديث
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <ProjectChangeOrderForm 
          projectId={projectId} 
          onClose={() => setShowForm(false)} 
          onSuccess={fetchOrders} 
        />
      )}
    </div>
  );
};

export default ChangeOrderManager;