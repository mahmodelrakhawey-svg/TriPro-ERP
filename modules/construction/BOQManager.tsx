import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../../context/ToastContext';
import { ArrowRight, Plus, Trash2, Calculator, Save } from 'lucide-react';

interface BOQItem {
  id?: string;
  item_name: string;
  unit: string;
  estimated_quantity: number;
  unit_price: number;
  total_price?: number;
}

interface Props {
  projectId: string;
  onBack: () => void;
}

const BOQManager: React.FC<Props> = ({ projectId, onBack }) => {
  const [items, setItems] = useState<BOQItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    fetchBOQ();
  }, [projectId]);

  const fetchBOQ = async () => {
    const { data, error } = await supabase
      .from('project_boq')
      .select('*')
      .eq('project_id', projectId);
    
    if (error) showToast(error.message, 'error');
    else setItems(data || []);
    setLoading(false);
  };

  const addItem = () => {
    setItems([...items, { item_name: '', unit: 'م3', estimated_quantity: 0, unit_price: 0 }]);
  };

  const updateItem = (index: number, field: keyof BOQItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const saveBOQ = async () => {
    try {
      setLoading(true);
      // حذف القديم وإضافة الجديد (تبسيط للنسخة الأولى)
      await supabase.from('project_boq').delete().eq('project_id', projectId);
      const { error } = await supabase.from('project_boq').insert(
        items.map(item => ({ ...item, project_id: projectId }))
      );

      if (error) throw error;
      showToast('تم حفظ المقايسة بنجاح', 'success');
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const totalProject = items.reduce((sum, item) => sum + (item.estimated_quantity * item.unit_price), 0);

  return (
    <div className="p-6 bg-white min-h-screen rtl">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <ArrowRight size={24} />
          </button>
          <h2 className="text-xl font-bold text-gray-800">مقايسة بنود المشروع (BOQ)</h2>
        </div>
        <div className="flex gap-2">
          <button onClick={addItem} className="flex items-center gap-2 border border-blue-600 text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-50">
            <Plus size={18} /> إضافة بند
          </button>
          <button onClick={saveBOQ} disabled={loading} className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 shadow-md">
            <Save size={18} /> حفظ التغييرات
          </button>
        </div>
      </div>

      <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-right">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-4 text-sm font-bold text-gray-600">البند</th>
              <th className="p-4 text-sm font-bold text-gray-600">الوحدة</th>
              <th className="p-4 text-sm font-bold text-gray-600">الكمية التقديرية</th>
              <th className="p-4 text-sm font-bold text-gray-600">سعر الوحدة</th>
              <th className="p-4 text-sm font-bold text-gray-600">الإجمالي</th>
              <th className="p-4 text-sm font-bold text-gray-600"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((item, index) => (
              <tr key={index} className="hover:bg-gray-50 transition-colors">
                <td className="p-3">
                  <input 
                    type="text" 
                    className="w-full border-none focus:ring-0 bg-transparent p-1" 
                    placeholder="مثال: توريد وصب خرسانة عادية"
                    value={item.item_name}
                    onChange={(e) => updateItem(index, 'item_name', e.target.value)}
                  />
                </td>
                <td className="p-3">
                  <input 
                    type="text" 
                    className="w-20 border-none focus:ring-0 bg-transparent p-1" 
                    value={item.unit}
                    onChange={(e) => updateItem(index, 'unit', e.target.value)}
                  />
                </td>
                <td className="p-3">
                  <input 
                    type="number" 
                    className="w-24 border-none focus:ring-0 bg-transparent p-1 font-bold" 
                    value={item.estimated_quantity}
                    onChange={(e) => updateItem(index, 'estimated_quantity', parseFloat(e.target.value))}
                  />
                </td>
                <td className="p-3">
                  <input 
                    type="number" 
                    className="w-24 border-none focus:ring-0 bg-transparent p-1 font-bold text-blue-600" 
                    value={item.unit_price}
                    onChange={(e) => updateItem(index, 'unit_price', parseFloat(e.target.value))}
                  />
                </td>
                <td className="p-3 font-bold text-gray-700">
                  {(item.estimated_quantity * item.unit_price).toLocaleString()}
                </td>
                <td className="p-3">
                  <button onClick={() => setItems(items.filter((_, i) => i !== index))} className="text-red-400 hover:text-red-600 p-1">
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-blue-50 font-bold">
            <tr>
              <td colSpan={4} className="p-4 text-left">إجمالي قيمة المقايسة التقديرية:</td>
              <td className="p-4 text-blue-700 text-lg">{totalProject.toLocaleString()} ج.م</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default BOQManager;