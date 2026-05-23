import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useToast } from '../context/ToastContext';

// تعريف واجهة البيانات لعروض الأسعار
interface Quotation {
  id: string;
  quotation_number: string;
  customer_id: string;
  customers: { name: string };
  quotation_date: string;
  status: string;
  total_amount: number;
}

const Quotations: React.FC = () => {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    fetchQuotations();
  }, []);

  const fetchQuotations = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('quotations')
      .select('*, customers(name)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching quotations:', error);
    } else {
      setQuotations(data || []);
    }
    setLoading(false);
  };

  // الإجراء: تحويل عرض السعر إلى أمر بيع (Sales Order)
  const handleConvertToSO = async (quotationId: string) => {
    if (!window.confirm('هل أنت متأكد من تحويل عرض السعر هذا إلى أمر بيع مؤكد؟')) return;

    try {
      const { data: soId, error } = await supabase.rpc('convert_quotation_to_so', {
        p_quotation_id: quotationId
      });

      if (error) throw error;

      showToast('تم تحويل عرض السعر إلى أمر بيع بنجاح ✅', 'success');
      fetchQuotations(); // تحديث القائمة لرؤية الحالة الجديدة (accepted)
    } catch (error: any) {
      showToast('خطأ أثناء التحويل: ' + error.message, 'error');
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800',
      sent: 'bg-blue-100 text-blue-800',
      accepted: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
    };
    const labels: Record<string, string> = {
      draft: 'مسودة',
      sent: 'مرسل',
      accepted: 'تم التحويل لأمر بيع',
      rejected: 'مرفوض',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100'}`}>
        {labels[status] || status}
      </span>
    );
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-md" dir="rtl">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 border-b pb-4">إدارة عروض الأسعار</h2>

      {loading ? (
        <div className="text-center py-10 text-gray-500">جاري التحميل...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-right">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-gray-500">رقم العرض</th>
                <th className="px-6 py-3 text-gray-500">العميل</th>
                <th className="px-6 py-3 text-gray-500">التاريخ</th>
                <th className="px-6 py-3 text-gray-500">المبلغ</th>
                <th className="px-6 py-3 text-gray-500">الحالة</th>
                <th className="px-6 py-3 text-gray-500">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {quotations.map((q) => (
                <tr key={q.id}>
                  <td className="px-6 py-4 font-bold">{q.quotation_number}</td>
                  <td className="px-6 py-4">{q.customers?.name}</td>
                  <td className="px-6 py-4 text-gray-500">{new Date(q.quotation_date).toLocaleDateString('ar-EG')}</td>
                  <td className="px-6 py-4 font-semibold">{q.total_amount.toLocaleString()} ج.م</td>
                  <td className="px-6 py-4">{getStatusBadge(q.status)}</td>
                  <td className="px-6 py-4">
                    {q.status !== 'accepted' && (
                      <button
                        onClick={() => handleConvertToSO(q.id)}
                        className="bg-indigo-600 text-white px-4 py-1 rounded hover:bg-indigo-700 transition shadow-sm"
                      >
                        تحويل لأمر بيع
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Quotations;