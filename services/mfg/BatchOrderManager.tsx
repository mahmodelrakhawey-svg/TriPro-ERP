import React, { useEffect, useState } from 'react';
import { supabase } from '@/supabaseClient';
import { useAccounting as useOrg } from '@/context/AccountingContext';
import { useToast } from '@/context/ToastContext';
import { Layers, CheckSquare, Square, Play, Loader2, Package, Filter, AlertCircle, CalendarClock } from 'lucide-react';

interface Shortage {
  material_name: string;
  required_total_qty: number;
  current_stock_qty: number;
  shortage_qty: number;
}

interface SalesInvoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  created_at: string;
  total_amount: number;
}

const BatchOrderManager = () => {
  const { organization } = useOrg();
  const orgId = organization?.id;
  const { showToast } = useToast();
  
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [shortages, setShortages] = useState<Shortage[]>([]);

  const fetchPendingInvoices = async () => {
    if (!orgId) return;
    setLoading(true);
    
    // جلب الفواتير التي تحتوي على منتجات لها مسار إنتاج ولم تُصنع بعد
    // ملاحظة: نستخدم كود مبسط للعرض، في النظام الحقيقي يفضل عمل RPC لهذا الاستعلام المعقد
    const { data, error } = await supabase
      .from('invoices')
      .select('id, invoice_number, created_at, total_amount, customers(name)') // <--- تم تعديل هذا السطر
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      showToast('خطأ في جلب الفواتير', 'error');
    } else {
      // <--- تم إضافة هذا الجزء لتحويل البيانات
      const formattedInvoices = (data || []).map((inv: any) => ({
        id: inv.id,
        invoice_number: inv.invoice_number,
        customer_name: inv.customers?.name || 'N/A', // استخراج اسم العميل من الكائن المتداخل
        created_at: inv.created_at,
        total_amount: inv.total_amount,
      }));
      setInvoices(formattedInvoices);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPendingInvoices();
  }, [orgId]);

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // ميزة التحقق من النقص قبل الدمج
  const checkAvailability = async () => {
    if (selectedIds.length === 0) return true;
    setProcessing(true);
    
    let allShortages: Shortage[] = [];
    
    for (const invId of selectedIds) {
      const invoice = invoices.find(i => i.id === invId);
      // جلب الأصناف المرتبطة بالفاتورة والتي تحتاج تصنيع
      const { data: items } = await supabase.from('invoice_items').select('product_id, quantity').eq('invoice_id', invId);
      
      if (items) {
        for (const item of items) {
          const { data: shortageData } = await supabase.rpc('mfg_check_stock_availability', {
            p_product_id: item.product_id,
            p_quantity: item.quantity
          });
          if (shortageData && shortageData.length > 0) {
            allShortages = [...allShortages, ...shortageData];
          }
        }
      }
    }

    setShortages(allShortages);
    setProcessing(false);
    return allShortages.length === 0;
  };

  const handleReschedule = () => {
    setShortages([]);
    showToast('تمت إعادة جدولة الطلبات المتأثرة للمراجعة لاحقاً', 'info');
  };

  const handleMergeOrders = async () => {
    if (selectedIds.length === 0) return;
    
    setProcessing(true);
    const { data, error } = await supabase.rpc('mfg_merge_sales_orders', {
      p_invoice_ids: selectedIds
    });

    if (error) {
      showToast(error.message, 'error');
    } else {
      showToast(`تم إنشاء ${data} أمر إنتاج مجمع بنجاح`, 'success');
      setSelectedIds([]);
      fetchPendingInvoices();
    }
    setProcessing(false);
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen" dir="rtl">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <Layers className="text-purple-600" />
              إدارة أوامر التشغيل المجمعة (Batching)
            </h1>
            <p className="text-gray-500 text-sm">دمج طلبات المبيعات في دفعات إنتاجية موحدة</p>
          </div>
          
          <button
            onClick={async () => {
              const isAvailable = await checkAvailability();
              if (isAvailable) await handleMergeOrders();
            }}
            disabled={selectedIds.length === 0 || processing}
            className="flex items-center gap-2 bg-purple-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-purple-700 disabled:opacity-50 transition-all shadow-lg shadow-purple-200"
          >
            {processing ? <Loader2 className="animate-spin" /> : <Play size={20} />}
            إنشاء دفعة إنتاج مجمعة ({selectedIds.length})
          </button>
        </div>

        {/* عرض تنبيه نقص المواد وإعادة الجدولة */}
        {shortages.length > 0 && (
          <div className="mb-6 bg-red-50 border border-red-200 p-4 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-4 animate-in fade-in slide-in-from-top-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="text-red-600 shrink-0" />
              <div>
                <h3 className="font-bold text-red-800">تنبيه: نقص في المواد الخام</h3>
                <ul className="text-sm text-red-600 list-disc list-inside mt-1">
                  {shortages.map((s, idx) => (
                    <li key={idx}>{s.material_name}: عجز {s.shortage_qty} وحدة</li>
                  ))}
                </ul>
              </div>
            </div>
            <button
              onClick={handleReschedule}
              className="flex items-center gap-2 bg-white text-red-700 border border-red-200 px-4 py-2 rounded-lg font-bold hover:bg-red-100 transition-colors"
            >
              <CalendarClock size={18} />
              إعادة جدولة الطلبات
            </button>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
            <span className="text-sm font-medium text-gray-600">الفواتير المعلقة القابلة للتصنيع</span>
            <button onClick={fetchPendingInvoices} className="text-blue-600 text-sm hover:underline">تحديث</button>
          </div>
          
          {loading ? (
            <div className="p-20 text-center"><Loader2 className="animate-spin mx-auto text-purple-600" size={40} /></div>
          ) : invoices.length === 0 ? (
            <div className="p-20 text-center text-gray-400">لا توجد طلبات مبيعات بانتظار الجدولة</div>
          ) : (
            <table className="w-full text-right">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <th className="p-4 w-10">
                    <button onClick={() => setSelectedIds(selectedIds.length === invoices.length ? [] : invoices.map(i => i.id))}>
                      {selectedIds.length === invoices.length ? <CheckSquare className="text-purple-600" /> : <Square />}
                    </button>
                  </th>
                  <th className="p-4">رقم الفاتورة</th>
                  <th className="p-4">العميل</th>
                  <th className="p-4">التاريخ</th>
                  <th className="p-4">القيمة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.map((invoice) => (
                  <tr 
                    key={invoice.id} 
                    onClick={() => toggleSelection(invoice.id)}
                    className={`cursor-pointer transition-colors ${selectedIds.includes(invoice.id) ? 'bg-purple-50' : 'hover:bg-gray-50'}`}
                  >
                    <td className="p-4">
                      {selectedIds.includes(invoice.id) ? 
                        <CheckSquare size={20} className="text-purple-600" /> : 
                        <Square size={20} className="text-gray-300" />
                      }
                    </td>
                    <td className="p-4 font-mono font-bold text-gray-700">{invoice.invoice_number}</td>
                    <td className="p-4 text-gray-800">{invoice.customer_name}</td>
                    <td className="p-4 text-gray-500 text-sm">
                      {new Date(invoice.created_at).toLocaleDateString('ar-EG')}
                    </td>
                    <td className="p-4 font-bold text-gray-900">
                      {invoice.total_amount.toLocaleString()} <span className="text-xs text-gray-400">ج.م</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default BatchOrderManager;