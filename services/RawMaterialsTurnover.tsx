import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export const RawMaterialsTurnover: React.FC = () => {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [turnover, setTurnover] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const calculateTurnover = async () => {
    setLoading(true);
    try {
      // استدعاء الدالة من قاعدة البيانات
      const { data, error } = await supabase.rpc('mfg_calculate_raw_material_turnover', {
        p_org_id: (currentUser as any)?.organization_id,
        p_start_date: startDate,
        p_end_date: endDate
      });

      if (error) throw error;

      setTurnover(data);
      showToast('تم تحديث التقرير بنجاح', 'success');
    } catch (error: any) {
      console.error('Error fetching turnover:', error);
      showToast(error.message || 'فشل في حساب معدل الدوران', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-md rtl">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">تقرير معدل دوران المواد الخام</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">من تاريخ</label>
          <input 
            type="date" 
            value={startDate} 
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full p-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">إلى تاريخ</label>
          <input 
            type="date" 
            value={endDate} 
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full p-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div className="flex items-end">
          <button 
            onClick={calculateTurnover}
            disabled={loading}
            className="w-full bg-blue-600 text-white p-2 rounded-md hover:bg-blue-700 transition disabled:opacity-50"
          >
            {loading ? 'جاري الحساب...' : 'تحديث التقرير'}
          </button>
        </div>
      </div>

      {turnover !== null && (
        <div className="bg-blue-50 border-r-4 border-blue-500 p-6 rounded-lg text-center">
          <p className="text-gray-600 mb-2">معدل دوران المخزون للفترة المحددة</p>
          <span className="text-5xl font-extrabold text-blue-800">{turnover}</span>
          <span className="text-xl text-blue-600 mr-2">مرة</span>
          
          <div className="mt-4 text-sm text-gray-500 text-right">
            <p>💡 **ماذا يعني هذا الرقم؟**</p>
            <p>يقيس هذا الرقم عدد المرات التي استطاع فيها المصنع استهلاك وتجديد مخزونه من المواد الخام. كلما ارتفع هذا الرقم، دل ذلك على كفاءة عالية في إدارة المخزون وعدم وجود "رأس مال محبوس" في خامات راكدة.</p>
          </div>
        </div>
      )}
    </div>
  );
};