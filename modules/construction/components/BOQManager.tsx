import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import { ArrowRight, Plus, Trash2, Calculator, Save, Info, ChevronDown, ChevronUp } from 'lucide-react';

interface BOQItem {
  id?: string;
  item_name: string;
  unit: string;
  estimated_quantity: number;
  unit_price: number;
  total_price?: number;
  material_cost_per_unit: number;
  labor_cost_per_unit: number;
  overhead_cost_per_unit: number;
  profit_margin_pct: number;
  showAnalysis?: boolean;
}

interface Props {
  projectId: string;
  onBack: () => void;
}

const BOQManager: React.FC<Props> = ({ projectId, onBack }) => {
  const { organization } = useAccounting();
  const [items, setItems] = useState<BOQItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    if (organization?.id) {
      fetchBOQ();
    }
  }, [projectId, organization?.id]);

  const fetchBOQ = async () => {
    const { data, error } = await supabase
      .from('project_boq')
      .select('*')
      .eq('project_id', projectId)
      .eq('organization_id', organization?.id);
    
    if (error) showToast(error.message, 'error');
    else setItems(data || []);
    setLoading(false);
  };

  const addItem = () => {
    setItems([...items, { 
      item_name: '', 
      unit: 'م3', 
      estimated_quantity: 0, 
      unit_price: 0,
      material_cost_per_unit: 0,
      labor_cost_per_unit: 0,
      overhead_cost_per_unit: 0,
      profit_margin_pct: 0
    }]);
  };

  const updateItem = (index: number, field: keyof BOQItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const saveBOQ = async () => {
    try {
      setLoading(true);
      if (!organization?.id) throw new Error('فشل تحديد المنظمة النشطة');

      // استخدام upsert بدلاً من الحذف والإضافة للحفاظ على سلامة البيانات والربط
      const { error } = await supabase.from('project_boq').upsert(
        items.map(item => {
          // نستبعد فقط الحقول المحسوبة والجمالية، ونحافظ على الـ id إذا كان موجوداً
          const { total_price, created_at, showAnalysis, ...rest } = item as any;
          return {
            ...rest, 
            project_id: projectId,
            organization_id: organization.id 
          };
        }),
        { onConflict: 'id' } // التحديث يتم بناءً على معرف البند
      );

      if (error) throw error;
      showToast('تم حفظ المقايسة بنجاح', 'success');
      fetchBOQ(); // إعادة جلب البيانات لمزامنة الـ IDs الجديدة من السيرفر
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
              <th className="p-4 text-sm font-bold text-gray-600">البند / التحليل</th>
              <th className="p-4 text-sm font-bold text-gray-600">الوحدة</th>
              <th className="p-4 text-sm font-bold text-gray-600">الكمية التقديرية</th>
              <th className="p-4 text-sm font-bold text-gray-600 text-blue-600">سعر البيع المقدر</th>
              <th className="p-4 text-sm font-bold text-gray-600">الإجمالي</th>
              <th className="p-4 text-sm font-bold text-gray-600"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((item, index) => (
              <React.Fragment key={index}>
                <tr className={`${item.showAnalysis ? 'bg-blue-50/30' : 'hover:bg-gray-50'} transition-colors`}>
                  <td className="p-3 flex items-center gap-2">
                    <button 
                      onClick={() => updateItem(index, 'showAnalysis', !item.showAnalysis)}
                      className="p-1 hover:bg-white rounded text-blue-600 shadow-sm transition-all"
                      title="تحليل سعر البند"
                    >
                      {item.showAnalysis ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <input 
                      type="text" 
                      className="w-full border-none focus:ring-0 bg-transparent p-1 font-bold text-slate-700" 
                      placeholder="مثال: توريد وصب خرسانة عادية"
                      value={item.item_name}
                      onChange={(e) => updateItem(index, 'item_name', e.target.value)}
                    />
                  </td>
                  {/* ... باقي أعمدة الصف الأساسي ... */}
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
                    className="w-24 border-none focus:ring-0 bg-transparent p-1 font-black text-blue-600" 
                    value={item.unit_price}
                    readOnly={item.showAnalysis} // منع التعديل اليدوي إذا كان التحليل مفتوحاً لضمان الدقة
                    onChange={(e) => updateItem(index, 'unit_price', parseFloat(e.target.value))}
                  />
                </td>
                <td className="p-4 font-black text-slate-800 bg-slate-50/50">
                  {(Number(item.estimated_quantity || 0) * Number(item.unit_price || 0)).toLocaleString()}
                </td>
                <td className="p-3">
                  <button onClick={() => setItems(items.filter((_, i) => i !== index))} className="text-red-400 hover:text-red-600 p-1">
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
              {/* صف تحليل السعر */}
              {item.showAnalysis && (
                <tr className="bg-blue-50/20 animate-in slide-in-from-top-2 duration-200">
                  <td colSpan={6} className="p-4 border-b border-blue-100">
                    <div className="grid grid-cols-4 gap-6 px-10">
                      <div>
                        <label className="block text-[10px] font-black text-blue-400 uppercase mb-1">تكلفة المواد / وحدة</label>
                        <input type="number" className="w-full bg-white border border-blue-100 rounded-lg p-2 text-sm font-bold" value={item.material_cost_per_unit} onChange={(e) => updateItem(index, 'material_cost_per_unit', parseFloat(e.target.value))} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-blue-400 uppercase mb-1">تكلفة العمالة / وحدة</label>
                        <input type="number" className="w-full bg-white border border-blue-100 rounded-lg p-2 text-sm font-bold" value={item.labor_cost_per_unit} onChange={(e) => updateItem(index, 'labor_cost_per_unit', parseFloat(e.target.value))} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-blue-400 uppercase mb-1">مصاريف غير مباشرة / وحدة</label>
                        <input type="number" className="w-full bg-white border border-blue-100 rounded-lg p-2 text-sm font-bold" value={item.overhead_cost_per_unit} onChange={(e) => updateItem(index, 'overhead_cost_per_unit', parseFloat(e.target.value))} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-emerald-500 uppercase mb-1">نسبة الربح المستهدفة (%)</label>
                        <input type="number" className="w-full bg-white border border-emerald-100 rounded-lg p-2 text-sm font-black text-emerald-600" value={item.profit_margin_pct} onChange={(e) => updateItem(index, 'profit_margin_pct', parseFloat(e.target.value))} />
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              </React.Fragment>
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