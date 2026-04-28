import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '@/supabaseClient';
import { useAccounting as useOrg } from '@/context/AccountingContext';
import { useToast } from '@/context/ToastContext';
import { Play, CheckCircle, Barcode, Loader2, Factory, AlertTriangle, X, Printer, Paperclip, Download, RefreshCw } from 'lucide-react';

interface ShopFloorTask {
  progress_id: string;
  step_id: string;
  order_number: string;
  product_name: string;
  operation_name: string;
  status: 'pending' | 'active' | 'completed';
  target_qty: number;
}

interface StepMaterial {
  raw_material_id: string;
  material_name: string;
  quantity_required: number;
}

const ShopFloorManager = () => {
  const { organization } = useOrg();
  const orgId = organization?.id;
  const { showToast } = useToast();
  const [tasks, setTasks] = useState<ShopFloorTask[]>([]);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const [taskAttachments, setTaskAttachments] = useState<Record<string, any[]>>({});
  const [scanValue, setScanValue] = useState('');
  const [processing, setProcessing] = useState(false);
  
  // Scrap Recording State
  const [scrapModalTask, setScrapModalTask] = useState<ShopFloorTask | null>(null);
  const [stepMaterials, setStepMaterials] = useState<StepMaterial[]>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [scrapQty, setScrapQty] = useState('');
  const [scrapReason, setScrapReason] = useState('');

  const fetchTasks = async () => {
    if (!orgId) return;
    setLoading(true);
    const { data, error } = await supabase.rpc('mfg_get_shop_floor_tasks', { p_work_center_id: null });
    if (error) {
      showToast('خطأ في جلب المهام', 'error');
    } else {
      setTasks(data || []);
      if (data && data.length > 0) {
        fetchAttachments(data.map((t: any) => t.step_id));
      }
    }
    setLoading(false);
  };

  const fetchAttachments = async (stepIds: string[]) => {
    if (!orgId || stepIds.length === 0) return;
    const { data, error } = await supabase
      .from('mfg_step_attachments')
      .select('step_id, file_name, file_url')
      .in('step_id', stepIds)
      .eq('organization_id', orgId);
    
    if (!error && data) {
      const mapping: Record<string, any[]> = {};
      data.forEach(att => {
        if (!mapping[att.step_id]) mapping[att.step_id] = [];
        mapping[att.step_id].push(att);
      });
      setTaskAttachments(mapping);
    }
  };

  const openScrapModal = async (task: ShopFloorTask) => {
    setScrapModalTask(task);
    setProcessing(true);
    // جلب المواد الخام المخصصة لهذه المرحلة عبر الربط مع جدول المنتجات
    const { data, error } = await supabase
      .from('mfg_step_materials')
      .select('raw_material_id, products(name), quantity_required')
      .eq('step_id', task.step_id);
    
    if (!error && data) {
      setStepMaterials(data.map((m: any) => ({ ...m, material_name: m.products.name })));
    }
    setProcessing(false);
  };

  // ضمان بقاء التركيز على حقل المسح بعد انتهاء المعالجة
  useEffect(() => {
    if (!processing && !scrapModalTask) {
      inputRef.current?.focus();
    }
  }, [processing, scrapModalTask]);

  useEffect(() => {
    fetchTasks();
  }, [orgId]);

  const executeProcess = async (barcode: string) => {
    if (!barcode) return;

    setProcessing(true);
    showToast('جاري معالجة العملية...', 'info');
    const { data, error } = await supabase.rpc('mfg_process_scan', { p_barcode: barcode });
    if (error) {
      showToast(error.message, 'error');
    } else if (data.success) {
      showToast(data.message, 'success');
      setScanValue('');
      fetchTasks();
    } else {
      showToast(data.message, 'warning');
    }
    setProcessing(false);
  };

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    executeProcess(scanValue);
  };

  const handleRecordScrap = async () => {
    if (!scrapModalTask || !selectedMaterialId || !scrapQty) return;
    
    setProcessing(true);
    const { error } = await supabase.rpc('mfg_record_scrap', {
      p_progress_id: scrapModalTask.progress_id,
      p_material_id: selectedMaterialId,
      p_qty: parseFloat(scrapQty),
      p_reason: scrapReason
    });

    if (error) {
      showToast(error.message, 'error');
    } else {
      showToast('تم تسجيل التالف وتحديث المخزون وقيود الخسارة', 'success');
      setScrapModalTask(null);
      setScrapQty('');
      setScrapReason('');
      fetchTasks();
    }
    setProcessing(false);
  };

  // دالة طباعة ملصق المرحلة (بطاقة التشغيل)
  const handlePrintLabel = (task: ShopFloorTask) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html dir="rtl">
        <head>
          <title>بطاقة تشغيل - ${task.order_number}</title>
          <style>
            @media print { body { margin: 0; } }
            body { font-family: 'Segoe UI', Tahoma, sans-serif; padding: 10px; text-align: center; width: 80mm; border: 1px solid #eee; }
            .title { font-weight: bold; font-size: 14px; border-bottom: 2px solid #000; padding-bottom: 5px; margin-bottom: 10px; }
            .item { font-size: 12px; margin: 5px 0; }
            .uuid { font-family: monospace; font-size: 10px; background: #f0f0f0; padding: 5px; margin-top: 10px; display: block; }
            .barcode-placeholder { border: 1px solid #000; height: 40px; margin: 10px 0; display: flex; items-center; justify-content: center; font-size: 10px; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="title">بطاقة مرحلة إنتاجية</div>
          <div class="item"><b>رقم الطلب:</b> ${task.order_number}</div>
          <div class="item"><b>المنتج:</b> ${task.product_name}</div>
          <div class="item"><b>المرحلة:</b> ${task.operation_name}</div>
          <div class="barcode-placeholder">|||||||||||||||||||||||||||||||||||||</div>
          <span class="uuid">${task.progress_id}</span>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-64">
      <Loader2 className="w-12 h-12 animate-spin text-blue-600 mb-4" />
      <p className="text-gray-600 font-medium">جاري تحميل مهام أرضية المصنع...</p>
    </div>
  );

  return (
    <div className="p-6 bg-gray-50 min-h-screen" dir="rtl">
      <div className="max-w-6xl mx-auto">
        {/* Header & Scanning Area */}
        <div className="bg-white p-6 rounded-xl shadow-sm mb-6 border border-gray-200">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <Factory className="text-blue-600" />
                لوحة تحكم أرضية المصنع
              </h1>
              <p className="text-gray-500 text-sm mt-1">إدارة وبدء العمليات الإنتاجية اللحظية</p>
            </div>
            
            <button 
              onClick={fetchTasks}
              className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
              title="تحديث المهام"
            >
              <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
            </button>

            <form onSubmit={handleScan} className="relative group">
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <Barcode className="h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
              </div>
              <input
                ref={inputRef}
                type="text"
                value={scanValue}
                onChange={(e) => setScanValue(e.target.value)}
                placeholder="مسح باركود المرحلة (UUID)..."
                className="pr-10 pl-4 py-3 w-full md:w-80 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:ring-0 outline-none transition-all font-mono"
                disabled={processing || !!scrapModalTask}
                autoFocus
              />
              {processing && (
                <div className="absolute inset-y-0 left-3 flex items-center">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                </div>
              )}
            </form>
          </div>
        </div>

        {/* Tasks Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tasks.length === 0 ? (
            <div className="col-span-full py-20 text-center bg-white rounded-xl border-2 border-dashed border-gray-200">
              <p className="text-gray-400">لا توجد مهام نشطة حالياً في انتظار التنفيذ</p>
            </div>
          ) : (
            tasks.map((task) => (
              <div key={task.progress_id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                <div className={`h-2 ${task.status === 'active' ? 'bg-green-500' : 'bg-blue-500'}`} />
                <div className="p-5">
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-xs font-bold px-2 py-1 bg-gray-100 rounded text-gray-600">
                      {task.order_number}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded-full font-bold ${
                      task.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {task.status === 'active' ? 'قيد التشغيل' : 'في الانتظار'}
                    </span>
                    <button 
                      onClick={() => handlePrintLabel(task)}
                      className="p-1 hover:bg-gray-100 rounded-full text-gray-400 hover:text-blue-600 transition-colors"
                      title="طباعة ملصق الباركود"
                    >
                      <Printer size={16} />
                    </button>
                  </div>
                  
                  <h3 className="font-bold text-gray-900 mb-1">{task.product_name}</h3>
                  <p className="text-sm text-gray-600 mb-4">{task.operation_name}</p>

                  {/* Technical Attachments for Workers */}
                  {taskAttachments[task.step_id] && taskAttachments[task.step_id].length > 0 && (
                    <div className="mb-4 space-y-1">
                      <p className="text-[10px] font-bold text-slate-400 flex items-center gap-1 uppercase">
                        <Paperclip size={12} /> الوثائق الفنية:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {taskAttachments[task.step_id].map((att, idx) => (
                          <a 
                            key={idx} 
                            href={att.file_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-100 hover:bg-blue-100 transition-colors"
                          >
                            <Download size={10} /> {att.file_name}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-50">
                    <div className="text-sm text-gray-500">
                      الكمية المطلوبة: <span className="font-bold text-gray-900">{task.target_qty}</span>
                      {task.status === 'active' && (
                        <button 
                          onClick={() => openScrapModal(task)}
                          className="mr-3 text-red-500 hover:text-red-700 transition-colors"
                          title="تسجيل تالف"
                        >
                          <AlertTriangle size={18} />
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => executeProcess(task.progress_id)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-colors ${
                        task.status === 'active' 
                        ? 'bg-green-600 hover:bg-green-700 text-white' 
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                    >
                      {task.status === 'active' ? <CheckCircle size={18} /> : <Play size={18} />}
                      {task.status === 'active' ? 'إكمال' : 'بدء'}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Scrap Modal - نافذة تسجيل التالف */}
        {scrapModalTask && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="bg-red-50 p-4 flex justify-between items-center border-b border-red-100">
                <h2 className="font-bold text-red-800 flex items-center gap-2">
                  <AlertTriangle size={20} /> تسجيل تالف إنتاجي
                </h2>
                <button onClick={() => setScrapModalTask(null)} className="text-gray-400 hover:text-gray-600">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">المادة الخام المتأثرة</label>
                  <select 
                    value={selectedMaterialId}
                    onChange={(e) => setSelectedMaterialId(e.target.value)}
                    className="w-full border-gray-200 rounded-lg focus:ring-red-500 focus:border-red-500 border p-2"
                  >
                    <option value="">اختر المادة من BOM...</option>
                    {stepMaterials.map(m => (
                      <option key={m.raw_material_id} value={m.raw_material_id}>{m.material_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">الكمية التالفة</label>
                  <input 
                    type="number" 
                    value={scrapQty}
                    onChange={(e) => setScrapQty(e.target.value)}
                    className="w-full border-gray-200 rounded-lg focus:ring-red-500 focus:border-red-500 border p-2"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">سبب التلف</label>
                  <textarea 
                    value={scrapReason}
                    onChange={(e) => setScrapReason(e.target.value)}
                    className="w-full border-gray-200 rounded-lg focus:ring-red-500 focus:border-red-500 border p-2 h-20"
                    placeholder="وصف العيب الفني..."
                  />
                </div>
              </div>
              <div className="p-4 bg-gray-50 flex gap-3">
                <button
                  onClick={handleRecordScrap}
                  disabled={processing || !selectedMaterialId || !scrapQty}
                  className="flex-1 bg-red-600 text-white py-2 rounded-lg font-bold hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  حفظ التالف
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ShopFloorManager;