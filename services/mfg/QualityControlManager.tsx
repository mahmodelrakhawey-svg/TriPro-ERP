import React, { useEffect, useState } from 'react';
import { supabase } from '@/supabaseClient';
import { useAccounting as useOrg } from '@/context/AccountingContext';
import { useToast } from '@/context/ToastContext';
import { ShieldCheck, XCircle, CheckCircle, AlertCircle, Loader2, MessageSquare } from 'lucide-react';

interface CompletedTask {
  progress_id: string;
  order_number: string;
  product_name: string;
  operation_name: string;
  produced_qty: number;
}

const QualityControlManager = () => {
  const { organization } = useOrg();
  const orgId = organization?.id;
  const { showToast } = useToast();
  const [tasks, setTasks] = useState<CompletedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const fetchCompletedTasks = async () => {
    if (!orgId) return;
    setLoading(true);
    // جلب المهام التي اكتملت ولكن لم يتم فحص جودتها بعد
    const { data, error } = await supabase
      .from('mfg_order_progress')
      .select(`
        id, 
        produced_qty,
        mfg_production_orders(order_number, products(name)),
        mfg_routing_steps(operation_name)
      `)
      .eq('status', 'completed')
      .is('qc_verified', null)
      .eq('organization_id', orgId);

    if (error) {
      showToast('خطأ في جلب بيانات الجودة', 'error');
    } else {
      const formatted = data.map((d: any) => ({
        progress_id: d.id,
        order_number: d.mfg_production_orders.order_number,
        product_name: d.mfg_production_orders.products.name,
        operation_name: d.mfg_routing_steps.operation_name,
        produced_qty: d.produced_qty
      }));
      setTasks(formatted);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCompletedTasks();
  }, [orgId]);

  const handleInspect = async (id: string, status: 'pass' | 'fail', notes: string = '') => {
    setSubmitting(true);
    const { error } = await supabase.rpc('mfg_record_qc_inspection', {
      p_progress_id: id,
      p_status: status,
      p_notes: notes
    });

    if (error) {
      showToast(error.message, 'error');
    } else {
      showToast(status === 'pass' ? 'تم اعتماد الجودة بنجاح' : 'تم تسجيل رفض الجودة', 'info');
      fetchCompletedTasks();
    }
    setSubmitting(false);
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen" dir="rtl">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <ShieldCheck className="text-emerald-600" size={32} />
            مركز مراقبة الجودة (Quality Control)
          </h1>
          <p className="text-gray-500">مراجعة واعتماد المخرجات الصناعية قبل التخزين النهائي</p>
        </div>

        {loading ? (
          <div className="text-center py-20"><Loader2 className="animate-spin mx-auto text-emerald-600" size={40} /></div>
        ) : tasks.length === 0 ? (
          <div className="bg-white p-12 text-center rounded-2xl border-2 border-dashed border-gray-200">
            <CheckCircle className="mx-auto text-gray-300 mb-4" size={48} />
            <p className="text-gray-500 font-medium">لا توجد دفعات بانتظار فحص الجودة حالياً</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {tasks.map((task) => (
              <div key={task.progress_id} className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded italic">#{task.order_number}</span>
                    <h3 className="font-bold text-gray-900">{task.product_name}</h3>
                  </div>
                  <p className="text-sm text-gray-500">{task.operation_name} • الكمية: {task.produced_qty}</p>
                </div>
                
                <div className="flex items-center gap-3">
                  <button
                    disabled={submitting}
                    onClick={() => handleInspect(task.progress_id, 'fail', 'فشل في اختبارات القياس')}
                    className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                  >
                    <XCircle size={20} />
                    رفض
                  </button>
                  <button
                    disabled={submitting}
                    onClick={() => handleInspect(task.progress_id, 'pass')}
                    className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-emerald-700 transition-shadow shadow-md shadow-emerald-100"
                  >
                    <CheckCircle size={20} />
                    اعتماد الجودة
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default QualityControlManager;