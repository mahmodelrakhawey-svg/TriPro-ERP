import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ClipboardList, CheckCircle, Loader2, Package } from 'lucide-react';

const MaterialRequestsList = () => {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchRequests = async () => {
    const orgId = (currentUser as any)?.organization_id;
    if (!orgId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('mfg_material_requests')
        .select(`
          *,
          mfg_production_orders(order_number, products(name)),
          mfg_material_request_items(*, products(name, unit))
        `)
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [currentUser]);

  const handleIssueRequest = async (requestId: string) => {
    setProcessingId(requestId);
    try {
      const { error } = await supabase.rpc('mfg_issue_material_request', {
        p_request_id: requestId
      });
      if (error) throw error;
      showToast('تم صرف المواد وتوليد القيد المحاسبي بنجاح', 'success');
      fetchRequests();
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) return <div className="p-10 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" size={40} /></div>;

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <ClipboardList className="text-blue-600" /> طلبات صرف المواد الخام
          </h1>
          <p className="text-gray-500 text-sm">إدارة أذونات صرف الخامات لأوامر الإنتاج</p>
        </div>
      </div>

      <div className="grid gap-6">
        {requests.length === 0 ? (
          <div className="bg-white p-12 text-center rounded-2xl border-2 border-dashed border-gray-200 text-gray-400">لا توجد طلبات صرف مواد حالياً</div>
        ) : (
          requests.map((req) => (
            <div key={req.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50 border-b">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono font-bold text-blue-600">{req.request_number}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${req.status === 'issued' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                      {req.status === 'issued' ? 'تم الصرف' : 'قيد الانتظار'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">لأمر الإنتاج: <span className="font-bold">#{req.mfg_production_orders?.order_number}</span> - {req.mfg_production_orders?.products?.name}</p>
                </div>
                {req.status === 'pending' && (
                  <button onClick={() => handleIssueRequest(req.id)} disabled={!!processingId} className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50">
                    {processingId === req.id ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle size={18} />} اعتماد وصرف المواد
                  </button>
                )}
              </div>
              <div className="p-5">
                <table className="w-full text-right text-sm">
                  <thead>
                    <tr className="text-gray-400 font-medium border-b"><th className="pb-2">المادة الخام</th><th className="pb-2 text-center">الكمية المطلوبة</th><th className="pb-2 text-center">الكمية المصروفة</th><th className="pb-2 text-center">الوحدة</th></tr>
                  </thead>
                  <tbody className="divide-y">
                    {req.mfg_material_request_items?.map((item: any) => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="py-3 font-medium">{item.products?.name}</td>
                        <td className="py-3 text-center">{item.quantity_requested}</td>
                        <td className="py-3 text-center font-bold text-blue-600">{item.quantity_issued}</td>
                        <td className="py-3 text-center text-gray-400">{item.products?.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
export default MaterialRequestsList;