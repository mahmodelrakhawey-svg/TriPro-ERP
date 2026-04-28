import React, { useState } from 'react';
import { supabase } from '@/supabaseClient';
import { Search, History, Package, Settings, Clock, AlertCircle } from 'lucide-react';
import { useToast } from '@/context/ToastContext';

interface GenealogyData {
  product_info: {
    name: string;
    serial_number: string;
    batch_number: string;
    order_number: string;
    produced_at: string;
  };
  components_traceability: {
    material_name: string;
    standard_per_unit: number;
    actual_per_unit: number;
  }[];
  manufacturing_steps: {
    operation_name: string;
    work_center_name: string;
    actual_start_time: string;
    actual_end_time: string;
    status: string;
  }[];
  error?: string;
}

const GenealogyViewer = () => {
  const { showToast } = useToast();
  const [serialSearch, setSerialSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<GenealogyData | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serialSearch) return;

    setLoading(true);
    const { data: result, error } = await supabase.rpc('mfg_get_product_genealogy', { 
      p_serial_number: serialSearch 
    });

    if (error || result?.error) {
      showToast(error?.message || result?.error, 'error');
      setData(null);
    } else {
      setData(result);
    }
    setLoading(false);
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen" dir="rtl">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Search Header */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center">
          <History className="w-12 h-12 text-blue-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-800">تتبع أصل المنتج (Genealogy)</h1>
          <p className="text-gray-500 mb-6">أدخل الرقم التسلسلي للقطعة لمعرفة تاريخها الإنتاجي ومكوناتها</p>
          
          <form onSubmit={handleSearch} className="max-w-md mx-auto flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                value={serialSearch}
                onChange={(e) => setSerialSearch(e.target.value)}
                placeholder="SN-MFG-..."
                className="w-full pr-10 pl-4 py-3 border-2 border-gray-100 rounded-xl focus:border-blue-500 outline-none transition-all font-mono"
              />
            </div>
            <button 
              type="submit"
              disabled={loading}
              className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'جاري البحث...' : 'بحث'}
            </button>
          </form>
        </div>

        {data && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Product Card */}
            <div className="md:col-span-1 space-y-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h2 className="font-bold text-gray-800 flex items-center gap-2 mb-4 border-b pb-2">
                  <Package className="text-blue-500" size={20} /> بيانات القطعة
                </h2>
                <div className="space-y-4">
                  <div><p className="text-xs text-gray-400">اسم المنتج</p><p className="font-bold">{data.product_info.name}</p></div>
                  <div><p className="text-xs text-gray-400">الرقم التسلسلي</p><p className="font-mono text-blue-600">{data.product_info.serial_number}</p></div>
                  <div><p className="text-xs text-gray-400">رقم الدفعة (Batch)</p><p className="font-bold">{data.product_info.batch_number}</p></div>
                  <div><p className="text-xs text-gray-400">تاريخ الإنتاج</p><p className="font-bold">{new Date(data.product_info.produced_at).toLocaleDateString('ar-EG')}</p></div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h2 className="font-bold text-gray-800 flex items-center gap-2 mb-4 border-b pb-2">
                  <Settings className="text-emerald-500" size={20} /> المكونات المستخدمة
                </h2>
                <div className="space-y-3">
                  {data.components_traceability.map((comp, idx) => (
                    <div key={idx} className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">{comp.material_name}</span>
                      <span className="font-bold">{comp.actual_per_unit} {comp.actual_per_unit > comp.standard_per_unit && <AlertCircle size={14} className="inline text-amber-500" />}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Manufacturing Steps Timeline */}
            <div className="md:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <h2 className="font-bold text-gray-800 flex items-center gap-2 mb-6 border-b pb-2">
                <Clock className="text-purple-500" size={20} /> سجل العمليات (Manufacturing Trail)
              </h2>
              <div className="relative border-r-2 border-gray-100 pr-6 space-y-8">
                {data.manufacturing_steps.map((step, idx) => (
                  <div key={idx} className="relative">
                    {/* Dot on timeline */}
                    <div className="absolute -right-[31px] top-1 w-4 h-4 rounded-full bg-blue-500 border-4 border-white shadow-sm" />
                    
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 bg-gray-50 p-4 rounded-xl">
                      <div>
                        <p className="font-bold text-gray-800">{step.operation_name}</p>
                        <p className="text-xs text-gray-500">{step.work_center_name}</p>
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-medium px-2 py-1 bg-blue-100 text-blue-700 rounded-full inline-block mb-1">
                          {step.status === 'completed' ? 'مكتملة' : 'نشطة'}
                        </p>
                        <p className="text-[10px] text-gray-400 block">
                          {step.actual_start_time ? new Date(step.actual_start_time).toLocaleString('ar-EG') : 'لم تبدأ'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GenealogyViewer;