import React, { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';
import { Search, History, Package, Settings, Clock, AlertCircle, List, ArrowRight, Printer, Play } from 'lucide-react';
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
  const [foundSerials, setFoundSerials] = useState<any[]>([]);
  const [productionOrderDetails, setProductionOrderDetails] = useState<any | null>(null);

  // دعم البحث التلقائي ومراقبة تغييرات الرابط
  useEffect(() => {
    const handleHashChange = () => {
      const hashPart = window.location.hash.split('?')[1];
      const params = new URLSearchParams(hashPart || window.location.search);
      const q = params.get('search');

      if (q) {
        setSerialSearch(q);
        executeSearch(q);
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const executeSearch = async (searchTerm: string) => {
    const term = searchTerm?.trim();
    if (!term) return;

    setLoading(true);
    setData(null);
    setFoundSerials([]);
    setProductionOrderDetails(null);
    
    // 1. البحث أولاً: هل هذا "رقم أمر إنتاج"؟
    const { data: orderDetails, error: orderError } = await supabase.rpc('mfg_get_production_order_details_by_number', {
      p_order_number: term 
    });

    if (orderError) {
      showToast(orderError.message, 'error');
      setLoading(false);
      return;
    }

    if (orderDetails && orderDetails.length > 0) {
      setProductionOrderDetails(orderDetails[0]); // Assuming order_number is unique

      // ثم نحاول جلب الأرقام التسلسلية لهذا الأمر
      const { data: serialsByOrder, error: serialsError } = await supabase.rpc('mfg_get_serials_by_order', {
        p_order_number: term
      });

      if (serialsError) {
        showToast(serialsError.message, 'error');
        setLoading(false);
        return;
      }

      if (serialsByOrder && serialsByOrder.length > 0) {
        setFoundSerials(serialsByOrder);
        setData(null); // Clear single serial data
      } else {
        setFoundSerials([]); // No serials yet for this order
        setData(null);
      }
    } else {
      // إذا لم يكن رقم أمر إنتاج، نبحث عنه كـ "رقم تسلسلي" مباشر
      setProductionOrderDetails(null);
      const { data: result, error } = await supabase.rpc('mfg_get_product_genealogy', { 
        p_serial_number: term 
      });

      if (error || result?.error) {
        showToast(error?.message || result?.error, 'error');
        setData(null);
      } else {
        setData(result);
      }
    }
    setLoading(false);
  };

  const handleRegenerateSerials = async () => {
    if (!productionOrderDetails) return;
    setLoading(true);
    const { error } = await supabase.rpc('mfg_generate_batch_serials', { 
        p_order_id: productionOrderDetails.order_id 
    });
    
    if (error) {
        showToast(error.message, 'error');
    } else {
        showToast('تمت معالجة طلب توليد الأرقام التسلسلية. يرجى التأكد من تفعيل "تتبع الأرقام التسلسلية" في بطاقة الصنف.', 'info');
        // Re-fetch to see if serials appeared
        executeSearch(serialSearch);
    }
    setLoading(false);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(serialSearch);
  };

  const selectSerial = (sn: string) => {
    // Clear production order details when selecting a single serial
    setProductionOrderDetails(null);
    setSerialSearch(sn);
    setFoundSerials([]);
    setLoading(true);
    
    supabase.rpc('mfg_get_product_genealogy', { 
      p_serial_number: sn 
    }).then(({ data: result, error }) => {
      if (error || result?.error) {
        showToast(error?.message || result?.error, 'error');
        setData(null);
      } else {
        setData(result);
      }
      setLoading(false);
    });
  };

  const handlePrintSerial = () => {
    if (!data) return;
    const { name, serial_number, batch_number } = data.product_info;
    const printWindow = window.open('', '', 'width=600,height=400');
    if (printWindow) {
        printWindow.document.write(`
            <html dir="rtl">
            <head>
                <title>طباعة سيريال - ${serial_number}</title>
                <link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+39+Text&family=Tajawal:wght@400;700;900&display=swap" rel="stylesheet">
                <style>
                    body { font-family: 'Tajawal', sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                    .label { 
                        width: 80mm; 
                        height: 40mm; 
                        padding: 5mm; 
                        text-align: center; 
                        display: flex; 
                        flex-direction: column; 
                        justify-content: center;
                        align-items: center;
                        box-sizing: border-box;
                    }
                    .title { font-size: 14px; font-weight: bold; margin-bottom: 2px; }
                    .serial-barcode { font-family: 'Libre Barcode 39 Text', cursive; font-size: 42px; line-height: 1; margin: 5px 0; }
                    .serial-text { font-family: monospace; font-size: 12px; font-weight: bold; }
                    @media print {
                        @page { size: 80mm 40mm; margin: 0; }
                    }
                </style>
            </head>
            <body>
                <div class="label">
                    <div class="title">${name}</div>
                    <div class="serial-barcode">*${serial_number}*</div>
                    <div class="serial-text">${serial_number}</div>
                    <div style="font-size: 10px; margin-top: 5px;">رقم الدفعة: ${batch_number}</div>
                </div>
                <script>window.onload = function() { window.print(); window.close(); }</script>
            </body>
            </html>
        `);
        printWindow.document.close();
    }
  };

  const handlePrintAllSerials = () => {
    if (foundSerials.length === 0) return;
    
    const printWindow = window.open('', '', 'width=600,height=800');
    if (printWindow) {
        const labelsHtml = foundSerials.map(sn => `
            <div class="label">
                <div class="title">${sn.product_name || 'منتج أمر إنتاج'}</div>
                <div class="serial-barcode">*${sn.serial_number}*</div>
                <div class="serial-text">${sn.serial_number}</div>
                <div style="font-size: 10px; margin-top: 5px;">رقم الدفعة: ${sn.batch_number || '-'}</div>
            </div>
        `).join('<div style="page-break-after: always;"></div>');

        printWindow.document.write(`
            <html dir="rtl">
            <head>
                <title>طباعة ملصقات الأمر</title>
                <link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+39+Text&family=Tajawal:wght@400;700;900&display=swap" rel="stylesheet">
                <style>
                    body { font-family: 'Tajawal', sans-serif; margin: 0; }
                    .label { 
                        width: 80mm; 
                        height: 40mm; 
                        padding: 5mm; 
                        text-align: center; 
                        display: flex; 
                        flex-direction: column; 
                        justify-content: center;
                        align-items: center;
                        box-sizing: border-box;
                        margin: auto;
                    }
                    .title { font-size: 14px; font-weight: bold; margin-bottom: 2px; }
                    .serial-barcode { font-family: 'Libre Barcode 39 Text', cursive; font-size: 42px; line-height: 1; margin: 5px 0; }
                    .serial-text { font-family: monospace; font-size: 12px; font-weight: bold; }
                    @media print {
                        @page { size: 80mm 40mm; margin: 0; }
                    }
                </style>
            </head>
            <body>
                ${labelsHtml}
                <script>window.onload = function() { window.print(); window.close(); }</script>
            </body>
            </html>
        `);
        printWindow.document.close();
    }
  };

  const handleStartProductionOrder = async () => {
    if (!productionOrderDetails) return;
    setLoading(true);
    const { error } = await supabase.rpc('mfg_start_production_order', {
        p_order_id: productionOrderDetails.order_id
    });
    if (error) {
        showToast(error.message, 'error');
    } else {
        showToast('تم بدء أمر الإنتاج بنجاح.', 'success');
        // Re-fetch details to update status
        executeSearch(serialSearch);
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

        {/* عرض تفاصيل أمر الإنتاج أو قائمة السيريالات */}
        {productionOrderDetails && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-blue-100 animate-in fade-in">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-gray-800 flex items-center gap-2">
                <List className="text-blue-500" size={20} /> تفاصيل أمر الإنتاج: {productionOrderDetails.order_number}
              </h2>
              <div className="flex gap-2">
                {productionOrderDetails.status === 'draft' && (
                    <button
                        onClick={handleStartProductionOrder}
                        disabled={loading}
                        className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-green-500 transition-colors text-sm disabled:opacity-50"
                    >
                        <Play size={16} /> {loading ? 'جاري البدء...' : 'بدء أمر الإنتاج'}
                    </button>
                )}
                {foundSerials.length > 0 && ( // Only show print all if there are serials
                    <button
                        onClick={handlePrintAllSerials}
                        className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg font-bold hover:bg-slate-700 transition-colors text-sm"
                    >
                        <Printer size={16} /> طباعة كل الملصقات
                    </button>
                )}
              </div>
            </div>
            {foundSerials.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {foundSerials.map((sn) => (
                        <button
                            key={sn.serial_number}
                            onClick={() => selectSerial(sn.serial_number)}
                            className="p-3 bg-blue-50 text-blue-700 rounded-xl font-mono text-sm font-bold hover:bg-blue-100 transition-colors border border-blue-100 flex items-center justify-between group"
                        >
                            {sn.serial_number}
                            <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                    ))}
                </div>
            ) : (
                <div className="flex flex-col items-center gap-4 py-4">
                    <p className="text-gray-600 text-center">لا توجد أرقام تسلسلية منتجة لهذا الأمر بعد. حالة الأمر: <span className="font-bold text-blue-600">{productionOrderDetails.status === 'draft' ? 'مسودة' : productionOrderDetails.status === 'in_progress' ? 'قيد التنفيذ' : productionOrderDetails.status === 'completed' ? 'مكتمل' : productionOrderDetails.status}</span></p>
                    {productionOrderDetails.status === 'completed' && (
                        <button
                            onClick={handleRegenerateSerials}
                            disabled={loading}
                            className="text-blue-600 hover:text-blue-700 text-sm font-bold flex items-center gap-1 transition-colors"
                        >
                            <Settings size={14} className={loading ? 'animate-spin' : ''} /> {loading ? 'جاري التوليد...' : 'توليد الأرقام التسلسلية المفقودة'}
                        </button>
                    )}
                </div>
            )}
          </div>
        )}

        {data && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Product Card */}
            <div className="md:col-span-1 space-y-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <div className="flex justify-between items-center mb-4 border-b pb-2">
                  <h2 className="font-bold text-gray-800 flex items-center gap-2">
                    <Package className="text-blue-500" size={20} /> بيانات القطعة
                  </h2>
                  <button 
                    onClick={handlePrintSerial} 
                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" 
                    title="طباعة ملصق السيريال"
                  >
                    <Printer size={18} />
                  </button>
                </div>
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