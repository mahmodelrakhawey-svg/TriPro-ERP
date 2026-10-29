import { logger } from '../../../utils/logger';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../../../supabaseClient';
import { fetchCompleteDataset } from '../../../services/balanceService';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import { useAuth } from '../../../context/AuthContext';
import { ApprovalWorkflowService } from '../../../services/approvalWorkflowService';
import { Factory, Plus, Play, CheckCircle, XCircle, Save, DollarSign, Eye, BarChart3, Settings2, Printer, Trash2, Clock } from 'lucide-react';
import { z } from 'zod';
import { useReactToPrint } from 'react-to-print';
import StageLedger from './StageLedger';
import StageVarianceReport from '../reports/StageVarianceReport';
import AdvancedCostingReports from '../reports/AdvancedCostingReports';
import ProductSearchSelect from '../../../components/ProductSearchSelect';

const WorkOrderManager = () => {
  const { products, warehouses, produceItem, settings, organization, currentSelectedOrgId } = useAccounting();
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const activeOrgId = currentSelectedOrgId || organization?.id;
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'details'>('list');
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'ledger' | 'variance' | 'advanced'>('info');
  const [approvalMap, setApprovalMap] = useState<Record<string, { status: string; workflowName?: string | null; approverName?: string | null }>>({});
  
  // Form State
  const [steps, setSteps] = useState<any[]>([]);

  const workOrderPrintRef = useRef<HTMLDivElement>(null);
  const handlePrintWorkOrder = useReactToPrint({
    content: () => workOrderPrintRef.current,
  } as any);

  const [configModal, setConfigModal] = useState<{open: boolean, stepId: string, operationName: string, matPoint: number, inspPoint: number}>({
    open: false, stepId: '', operationName: '', matPoint: 0, inspPoint: 100
  });

  const [formData, setFormData] = useState({
    productId: '',
    warehouseId: '',
    quantity: 1,
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    notes: ''
  });

  // تصفية المنتجات القابلة للتصنيع (منتجات تامة ووسيطة) للبحث السريع
  const manufacturableProducts = useMemo(() => {
    return (products || []).filter(p => {
      if (!p) return false;
      const pType = String((p as any).product_type || p.item_type || '').toUpperCase();
      const mType = String((p as any).mfg_type || '').toLowerCase();
      if (pType === 'RAW_MATERIAL' || mType === 'raw' || pType === 'SERVICE') return false;
      return (
        pType === 'MANUFACTURED' || 
        pType === 'INTERMEDIATE_PRODUCT' || 
        mType === 'standard' || 
        mType === 'intermediate' || 
        mType === 'subassembly' ||
        p.item_type === 'MANUFACTURED'
      );
    });
  }, [products]);

  // Costs State
  const [costs, setCosts] = useState<any[]>([]);
  const [newCost, setNewCost] = useState({ type: 'labor', amount: 0, description: '' });

  useEffect(() => {
    fetchOrders();
  }, [activeOrgId]);

  const fetchOrders = async () => {
    setLoading(true);
    const data = await fetchCompleteDataset<any>(async (from, to) => {
      let q = supabase
        .from('mfg_production_orders')
        .select('*, products(name, sku), warehouses(name)')
        .order('created_at', { ascending: false });

      if (activeOrgId) {
        q = q.eq('organization_id', activeOrgId);
      }
      return q.range(from, to);
    });

    setOrders(data || []);

    // 🛡️ استعلام فوري لحالات مسارات الاعتماد لربطها ببطاقات وأزرار أوامر التشغيل
    try {
      let appQuery = supabase
        .from('approval_requests')
        .select('document_id, status, decision_by_name, workflow:approval_workflows(name)')
        .eq('document_type', 'PRODUCTION_ORDER')
        .order('created_at', { ascending: false });

      if (activeOrgId) {
        appQuery = appQuery.eq('organization_id', activeOrgId);
      }

      const { data: approvals } = await appQuery;

      if (approvals) {
        const map: Record<string, { status: string; workflowName?: string | null; approverName?: string | null }> = {};
        for (const a of approvals) {
          const wf = a.workflow;
          const wfName = Array.isArray(wf) ? (wf[0] ? wf[0].name : null) : (wf ? (wf as { name?: string }).name : null);
          const current = map[a.document_id];
          if (!current) {
            map[a.document_id] = {
              status: a.status,
              workflowName: wfName || null,
              approverName: a.decision_by_name || null
            };
          } else if (current.status !== 'APPROVED' && a.status === 'APPROVED') {
            map[a.document_id] = {
              status: 'APPROVED',
              workflowName: wfName || null,
              approverName: a.decision_by_name || null
            };
          }
        }
        setApprovalMap(map);
      }
    } catch (err) {
      logger.warn('Failed to load approval statuses for work orders:', err);
    }

    setLoading(false);
  };

  const handleDeleteOrder = async (id: string, orderNumber: string) => {
    if (!window.confirm(`هل أنت متأكد من رغبتك في حذف أمر التشغيل (${orderNumber}) نهائياً؟`)) return;
    try {
      // حذف التكاليف والمراحل التابعة للأمر إن وجدت
      await supabase.from('work_order_costs').delete().eq('work_order_id', id);
      await supabase.from('mfg_order_steps').delete().eq('production_order_id', id);
      await supabase.from('mfg_order_progress').delete().eq('production_order_id', id);

      const { error } = await supabase.from('mfg_production_orders').delete().eq('id', id);
      if (error) throw error;

      showToast(`تم حذف أمر التشغيل ${orderNumber} بنجاح ✅`, 'success');
      if (selectedOrder?.id === id) {
        setViewMode('list');
        setSelectedOrder(null);
      }
      fetchOrders();
    } catch (err) {
      showToast('فشل حذف أمر التشغيل: ' + err.message, 'error');
    }
  };

  const fetchOrderSteps = async (orderId: string) => {
      const { data, error } = await supabase
        .from('mfg_order_progress')
        .select('*, step:mfg_routing_steps(*, work_center:mfg_work_centers(name))')
        .eq('production_order_id', orderId)
        .order('created_at', { ascending: true });
      if (error) logger.error(error);
      else setSteps(data || []);
  };

  const fetchCosts = async (orderId: string) => {
      const { data } = await supabase.from('work_order_costs').select('*').eq('work_order_id', orderId);
      setCosts(data || []);
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const workOrderSchema = z.object({
        productId: z.string().min(1, 'الرجاء اختيار المنتج'),
        warehouseId: z.string().min(1, 'الرجاء اختيار المستودع'),
        quantity: z.number().min(0.01, 'الكمية يجب أن تكون أكبر من 0'),
        startDate: z.string().min(1, 'تاريخ البدء مطلوب'),
    });

    const validationResult = workOrderSchema.safeParse(formData);
    if (!validationResult.success) {
        showToast(validationResult.error.issues[0].message, 'warning');
        return;
    }

    try {
        const orderNumber = `WO-${Date.now().toString().slice(-6)}`;
        const newOrderId = crypto.randomUUID();
        const { error } = await supabase.from('mfg_production_orders').insert({
            id: newOrderId,
            order_number: orderNumber,
            product_id: formData.productId,
            warehouse_id: formData.warehouseId,
            quantity_to_produce: formData.quantity,
            start_date: formData.startDate,
            end_date: formData.endDate || null,
            notes: formData.notes,
            status: 'draft',
            organization_id: activeOrgId || undefined
        });

        if (error) throw error;

        // 🛡️ فحص مسار الاعتماد وتوليد طلب معلق فوراً إذا انطبق الشرط المالي
        const product = products.find(p => p.id === formData.productId);
        const unitCost = Number(product?.cost || product?.price || 0);
        const totalOrderAmount = Number(formData.quantity || 0) * unitCost;

        try {
            const approval = await ApprovalWorkflowService.checkAndSubmit({
                orgId: activeOrgId || '',
                docType: 'PRODUCTION_ORDER',
                amount: totalOrderAmount,
                docId: newOrderId,
                docRef: orderNumber,
                requesterName: currentUser?.name || 'مسؤول الإنتاج'
            });

            if (approval.requires_approval) {
                showToast(`تم إنشاء أمر التشغيل وتوجيهه للاعتماد المعلق بموجب مسار "${approval.workflow_name}" ⏳`, 'warning');
            } else {
                showToast('تم إنشاء أمر التشغيل بنجاح ✅', 'success');
            }
        } catch (appErr) {
            logger.warn('Approval workflow check notice:', appErr);
            showToast('تم إنشاء أمر التشغيل بنجاح ✅', 'success');
        }

        setIsModalOpen(false);
        fetchOrders();
    } catch (error: unknown) {
        logger.error(error);
        showToast('خطأ: ' + ((error as Error)?.message || 'فشل حفظ أمر التشغيل'), 'error');
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
      if (status === 'completed') {
          // عند الإكمال، نقوم بتنفيذ عملية التصنيع الفعلية
          if (!window.confirm('هل أنت متأكد من إكمال أمر التشغيل؟ سيتم خصم المواد الخام وإضافة المنتج التام للمخزون.')) return;
          
          const order = orders.find(o => o.id === id);
          if (!order) return;

          // حساب التكاليف الإضافية
          const { data: costsData } = await supabase.from('work_order_costs').select('amount').eq('work_order_id', id);
          const totalAdditionalCost = costsData?.reduce((sum, c) => sum + Number(c.amount), 0) || 0;

          const result = await produceItem(
              order.product_id, 
              order.quantity_to_produce, 
              order.warehouse_id, 
              new Date().toISOString().split('T')[0],
              totalAdditionalCost,
              order.order_number // تمرير رقم الأمر كمرجع للقيد
          );

          if (result.success) {
              await supabase.from('mfg_production_orders').update({ status: 'completed', end_date: new Date().toISOString().split('T')[0] }).eq('id', id);
              showToast(result.message, 'success');
              fetchOrders();
          } else {
              showToast(result.message, 'error');
              return;
          }
      } else if (status === 'in_progress') {
          // 🛡️ فحص مسار وسلسلة الاعتمادات لأوامر التشغيل والإنتاج قبل البدء
          const order = orders.find(o => o.id === id) || (selectedOrder?.id === id ? selectedOrder : null);
          if (order) {
              const currentApproval = approvalMap[id];
              const isAlreadyApproved = currentApproval?.status === 'APPROVED';

              if (currentApproval?.status === 'REJECTED') {
                  showToast('تم رفض أمر التشغيل هذا من قبل الإدارة، لا يمكن بدء التشغيل ❌', 'error');
                  return;
              }

              if (currentApproval?.status === 'PENDING') {
                  showToast('أمر التشغيل قيد المراجعة والاعتماد لدى الإدارة حالياً، يرجى انتظار الموافقة ⏳', 'warning');
                  return;
              }

              // إذا لم يكن معتمداً مسبقاً، نفحص المسار ونرسله للاعتماد
              if (!isAlreadyApproved) {
                  const product = products.find(p => p.id === order.product_id);
                  const unitCost = Number(product?.cost || product?.price || 0);
                  const orderAmount = Number(order.quantity_to_produce || 0) * unitCost;

                  try {
                      const approval = await ApprovalWorkflowService.checkAndSubmit({
                          orgId: activeOrgId || '',
                          docType: 'PRODUCTION_ORDER',
                          amount: orderAmount,
                          docId: id,
                          docRef: order.order_number || id.slice(0, 8),
                          requesterName: currentUser?.name || 'مسؤول الإنتاج'
                      });

                      if (approval.requires_approval) {
                          showToast(`أمر التشغيل يتطلب الاعتماد أولاً بموجب مسار "${approval.workflow_name}". تم إرسال الطلب لقائمة الاعتمادات المعلقة ⏳`, 'warning');
                          fetchOrders();
                          return;
                      }
                  } catch (appErr) {
                      logger.warn('Approval workflow check bypassed:', appErr);
                  }
              }
          }

          // 🚀 استخدام RPC لضمان توليد مراحل الإنتاج آلياً في جدول التقدم عند بدء التشغيل
          const { error } = await supabase.rpc('mfg_start_production_order', { p_order_id: id });
          if (error) {
              logger.warn('mfg_start_production_order failed, falling back to direct update:', error);
              const { error: directErr } = await supabase.from('mfg_production_orders').update({ status: 'in_progress' }).eq('id', id);
              if (directErr) {
                  showToast('فشل بدء التشغيل: ' + directErr.message, 'error');
                  return;
              }
          }

          showToast('تم بدء التشغيل وتوليد كافة مراحل الإنتاج آلياً بنجاح ✅', 'success');
          fetchOrders();
          if (selectedOrder?.id === id) {
              fetchOrderSteps(id);
          }
      } else {
          await supabase.from('mfg_production_orders').update({ status }).eq('id', id);
          fetchOrders();
      }
  };

  const handleAddCost = async () => {
      if (!selectedOrder) return;
      
      const costSchema = z.object({
          amount: z.number().min(0.01, 'المبلغ يجب أن يكون أكبر من 0'),
          description: z.string().min(1, 'الوصف مطلوب'),
      });
      
      const validationResult = costSchema.safeParse(newCost);
      if (!validationResult.success) {
          showToast(validationResult.error.issues[0].message, 'warning');
          return;
      }
      await supabase.from('work_order_costs').insert({
          work_order_id: selectedOrder.id,
          cost_type: newCost.type,
          amount: newCost.amount,
          description: newCost.description
      });
      setNewCost({ type: 'labor', amount: 0, description: '' });
      fetchCosts(selectedOrder.id);
  };

  const openDetails = (order: Record<string, any>) => {
      setSelectedOrder(order);
      fetchCosts(order.id);
      fetchOrderSteps(order.id);
      setActiveTab('info');
      setViewMode('details');
  };

  const handleSaveStepConfig = async () => {
      try {
          const { error } = await supabase.rpc('mfg_config_step_parameters', {
              p_step_id: configModal.stepId,
              p_material_point: configModal.matPoint,
              p_inspection_point: configModal.inspPoint
          });
          if (error) throw error;
          showToast('تم حفظ إعدادات المرحلة بنجاح', 'success');
          setConfigModal({ ...configModal, open: false });
          fetchOrderSteps(selectedOrder.id);
      } catch (error) {
          showToast(error.message, 'error');
      }
  };

  const getStatusBadge = (status: string, orderId?: string) => {
      if (status === 'draft' && orderId && approvalMap[orderId]) {
          const app = approvalMap[orderId];
          if (app.status === 'APPROVED') {
              return (
                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded text-xs font-bold inline-flex items-center gap-1 shadow-sm" title={`معتمد من: ${app.approverName || 'الإدارة'}`}>
                      <CheckCircle size={14} className="text-emerald-600" />
                      معتمد (جاهز للتشغيل)
                  </span>
              );
          }
          if (app.status === 'PENDING') {
              return (
                  <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded text-xs font-bold inline-flex items-center gap-1 shadow-sm" title="بانتظار موافقة الإدارة">
                      <Clock size={14} className="text-amber-600" />
                      بانتظار الاعتماد ⏳
                  </span>
              );
          }
          if (app.status === 'REJECTED') {
              return (
                  <span className="bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-1 rounded text-xs font-bold inline-flex items-center gap-1 shadow-sm">
                      <XCircle size={14} className="text-rose-600" />
                      مرفوض من الاعتمادات
                  </span>
              );
          }
      }

      switch(status) {
          case 'draft': return <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded text-xs font-bold">مسودة</span>;
          case 'in_progress': return <span className="bg-blue-100 text-blue-700 px-2.5 py-1 rounded text-xs font-bold">قيد التشغيل</span>;
          case 'completed': return <span className="bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded text-xs font-bold">مكتمل</span>;
          case 'cancelled': return <span className="bg-rose-100 text-rose-700 px-2.5 py-1 rounded text-xs font-bold">ملغي</span>;
          default: return status;
      }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center">
        <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Factory className="text-purple-600" /> أوامر التشغيل (Work Orders)
            </h2>
            <p className="text-slate-500">إدارة عمليات التصنيع ومتابعة التكاليف</p>
        </div>
        {viewMode === 'list' && (
            <button onClick={() => setIsModalOpen(true)} className="bg-purple-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-purple-700">
                <Plus size={18} /> أمر تشغيل جديد
            </button>
        )}
        {viewMode === 'details' && (
            <div className="flex gap-2">
                <button 
                    onClick={handlePrintWorkOrder}
                    className="bg-white text-slate-700 border border-slate-200 px-4 py-2 rounded-lg font-bold hover:bg-slate-50 flex items-center gap-2 shadow-sm transition-all"
                >
                    <Printer size={18} /> طباعة أمر الشغل
                </button>
                {selectedOrder && (
                    <button 
                        onClick={() => handleDeleteOrder(selectedOrder.id, selectedOrder.order_number)}
                        className="bg-rose-50 text-rose-600 border border-rose-200 px-4 py-2 rounded-lg font-bold hover:bg-rose-100 flex items-center gap-2 shadow-sm transition-all"
                        title="حذف هذا الأمر"
                    >
                        <Trash2 size={18} /> حذف الأمر
                    </button>
                )}
                <button onClick={() => setViewMode('list')} className="bg-slate-100 text-slate-600 px-4 py-2 rounded-lg font-bold hover:bg-slate-200">
                    عودة للقائمة
                </button>
            </div>
        )}
      </div>

      {viewMode === 'list' ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-right">
                <thead className="bg-slate-50 text-slate-600 font-bold text-sm">
                    <tr>
                        <th className="p-4">رقم الأمر</th>
                        <th className="p-4">المنتج</th>
                        <th className="p-4">الكمية</th>
                        <th className="p-4">المستودع</th>
                        <th className="p-4">تاريخ البدء</th>
                        <th className="p-4">الحالة</th>
                        <th className="p-4 text-center">إجراءات</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {orders.map(order => (
                        <tr key={order.id} className="hover:bg-slate-50">
                            <td className="p-4 font-mono text-purple-600">{order.order_number}</td>
                            <td className="p-4 font-bold">{order.products?.name}</td>
                            <td className="p-4 font-bold">{order.quantity_to_produce}</td>
                            <td className="p-4 text-sm">{order.warehouses?.name}</td>
                            <td className="p-4 text-sm">{order.start_date}</td>
                            <td className="p-4">{getStatusBadge(order.status, order.id)}</td>
                            <td className="p-4 flex justify-center items-center gap-1.5">
                                <button onClick={() => openDetails(order)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="التفاصيل والتكاليف">
                                    <Eye size={18} />
                                </button>
                                {order.status === 'draft' && (
                                    <button onClick={() => handleStatusChange(order.id, 'in_progress')} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="بدء التشغيل">
                                        <Play size={18} />
                                    </button>
                                )}
                                <button 
                                    onClick={() => handleDeleteOrder(order.id, order.order_number)} 
                                    className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" 
                                    title="حذف أمر التشغيل"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </td>
                        </tr>
                    ))}
                    {orders.length === 0 && !loading && <tr><td colSpan={7} className="p-8 text-center text-slate-400">لا توجد أوامر تشغيل</td></tr>}
                </tbody>
            </table>
          </div>
      ) : (
          <div className="space-y-6">
              {/* نظام التبويبات للتنقل داخل تفاصيل الأمر */}
              <div className="flex border-b border-slate-200 no-print bg-white rounded-t-xl overflow-hidden">
                  <button 
                    onClick={() => setActiveTab('info')}
                    className={`px-6 py-4 font-bold text-sm transition-all border-b-2 ${activeTab === 'info' ? 'border-purple-600 text-purple-600 bg-purple-50/30' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                  >
                      تفاصيل الأمر والتكاليف
                  </button>
                  <button 
                    onClick={() => setActiveTab('ledger')}
                    className={`px-6 py-4 font-bold text-sm transition-all border-b-2 ${activeTab === 'ledger' ? 'border-purple-600 text-purple-600 bg-purple-50/30' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                  >
                      كشف حساب المراحل (Stage Ledger)
                  </button>
                  <button 
                    onClick={() => setActiveTab('variance')}
                    className={`px-6 py-4 font-bold text-sm transition-all border-b-2 ${activeTab === 'variance' ? 'border-purple-600 text-purple-600 bg-purple-50/30' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                  >
                      تحليل الانحرافات (Variance)
                  </button>
                  <button 
                    onClick={() => setActiveTab('advanced')}
                    className={`px-6 py-4 font-bold text-sm transition-all border-b-2 ${activeTab === 'advanced' ? 'border-purple-600 text-purple-600 bg-purple-50/30' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                  >
                      محاسبة تكاليف المراحل (Reports)
                  </button>
              </div>

              {activeTab === 'info' ? (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
                      {/* معلومات الأمر الرئيسية */}
                      <div className="lg:col-span-2 space-y-6">
                          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                              <div className="flex justify-between items-start mb-6">
                                  <div>
                                      <h3 className="text-xl font-bold text-slate-800">{selectedOrder.products?.name}</h3>
                                      <p className="text-slate-500 font-mono">{selectedOrder.order_number}</p>
                                  </div>
                                  {getStatusBadge(selectedOrder.status, selectedOrder.id)}
                              </div>
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                  <div><span className="text-slate-500 block">الكمية المطلوبة:</span> <span className="font-bold text-lg">{selectedOrder.quantity_to_produce}</span></div>
                                  <div><span className="text-slate-500 block">المستودع:</span> <span className="font-bold">{selectedOrder.warehouses?.name}</span></div>
                                  <div><span className="text-slate-500 block">تاريخ البدء:</span> <span className="font-bold">{selectedOrder.start_date}</span></div>
                                  <div><span className="text-slate-500 block">ملاحظات:</span> <span>{selectedOrder.notes || '-'}</span></div>
                              </div>
                          </div>

                          {/* ⚙️ قسم مراحل الإنتاج وإعدادات النقاط الحرجة */}
                          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                              <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                  <Settings2 size={18} className="text-purple-600" /> مراحل الإنتاج والتحكم التكاليفي
                              </h4>
                              <div className="overflow-x-auto">
                                  <table className="w-full text-right text-sm">
                                      <thead>
                                          <tr className="bg-slate-50 text-slate-600">
                                              <th className="p-3">المرحلة</th>
                                              <th className="p-3">مركز العمل</th>
                                              <th className="p-3 text-center">إضافة المواد</th>
                                              <th className="p-3 text-center">نقطة الفحص</th>
                                              <th className="p-3 text-center">الإعدادات</th>
                                          </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                          {steps.map((s) => (
                                              <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                                                  <td className="p-3 font-bold text-slate-700">{s.step?.operation_name}</td>
                                                  <td className="p-3 text-slate-500">{s.step?.work_center?.name || '---'}</td>
                                                  <td className="p-3 text-center">
                                                      <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-mono font-bold">
                                                          {s.step?.material_addition_point || 0}%
                                                      </span>
                                                  </td>
                                                  <td className="p-3 text-center">
                                                      <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded font-mono font-bold">
                                                          {s.step?.inspection_point || 100}%
                                                      </span>
                                                  </td>
                                                  <td className="p-3 text-center">
                                                      <button 
                                                        onClick={() => setConfigModal({
                                                            open: true, stepId: s.step_id, operationName: s.step?.operation_name, 
                                                            matPoint: s.step?.material_addition_point || 0, inspPoint: s.step?.inspection_point || 100
                                                        })}
                                                        className="p-1.5 hover:bg-purple-100 text-purple-600 rounded-lg transition-colors"
                                                      >
                                                          <Settings2 size={16} />
                                                      </button>
                                                  </td>
                                              </tr>
                                          ))}
                                      </tbody>
                                  </table>
                              </div>
                          </div>

                          {/* قسم التكاليف الإضافية */}
                          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                              <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                  <DollarSign size={18} className="text-emerald-600" /> التكاليف الإضافية (غير المواد الخام)
                              </h4>
                              
                              {selectedOrder.status !== 'completed' && selectedOrder.status !== 'cancelled' && (
                                  <div className="flex gap-2 mb-4 items-end bg-slate-50 p-3 rounded-lg">
                                      <div className="flex-1">
                                          <label className="block text-xs font-bold text-slate-500 mb-1">النوع</label>
                                          <select value={newCost.type} onChange={e => setNewCost({...newCost, type: e.target.value})} className="w-full border rounded p-2 text-sm">
                                              <option value="labor">أجور عمالة</option>
                                              <option value="overhead">مصاريف تشغيل (كهرباء/ماء)</option>
                                              <option value="other">أخرى</option>
                                          </select>
                                      </div>
                                      <div className="w-32">
                                          <label className="block text-xs font-bold text-slate-500 mb-1">المبلغ</label>
                                          <input type="number" value={newCost.amount} onChange={e => setNewCost({...newCost, amount: parseFloat(e.target.value)})} className="w-full border rounded p-2 text-sm" />
                                      </div>
                                      <div className="flex-1">
                                          <label className="block text-xs font-bold text-slate-500 mb-1">بيان</label>
                                          <input type="text" value={newCost.description} onChange={e => setNewCost({...newCost, description: e.target.value})} className="w-full border rounded p-2 text-sm" placeholder="وصف التكلفة" />
                                      </div>
                                      <button onClick={handleAddCost} className="bg-emerald-600 text-white p-2 rounded hover:bg-emerald-700"><Plus size={18}/></button>
                                  </div>
                              )}

                              <table className="w-full text-right text-sm">
                                  <thead className="bg-slate-50 text-slate-600">
                                      <tr>
                                          <th className="p-2">النوع</th>
                                          <th className="p-2">البيان</th>
                                          <th className="p-2">المبلغ</th>
                                      </tr>
                                  </thead>
                                  <tbody className="divide-y">
                                      {costs.map(cost => (
                                          <tr key={cost.id}>
                                              <td className="p-2">{cost.cost_type === 'labor' ? 'أجور' : cost.cost_type === 'overhead' ? 'تشغيل' : 'أخرى'}</td>
                                              <td className="p-2">{cost.description}</td>
                                              <td className="p-2 font-bold">{cost.amount.toLocaleString()}</td>
                                          </tr>
                                      ))}
                                      {costs.length === 0 && <tr><td colSpan={3} className="p-4 text-center text-slate-400">لا توجد تكاليف إضافية مسجلة</td></tr>}
                                  </tbody>
                                  <tfoot className="border-t font-bold">
                                      <tr>
                                          <td colSpan={2} className="p-2">الإجمالي</td>
                                          <td className="p-2 text-emerald-600">{costs.reduce((sum, c) => sum + Number(c.amount), 0).toLocaleString()}</td>
                                      </tr>
                                  </tfoot>
                              </table>
                          </div>
                      </div>

                      {/* عمود الإجراءات */}
                      <div className="space-y-4">
                          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                              <h4 className="font-bold text-slate-800 mb-4">إجراءات الأمر</h4>
                              <div className="space-y-2">
                                  {selectedOrder.status === 'draft' && (
                                      <button onClick={() => handleStatusChange(selectedOrder.id, 'in_progress')} className="w-full bg-blue-600 text-white py-2 rounded-lg font-bold hover:bg-blue-700 flex items-center justify-center gap-2">
                                          <Play size={18} /> بدء التشغيل
                                      </button>
                                  )}
                                  {selectedOrder.status === 'in_progress' && (
                                      <button onClick={() => handleStatusChange(selectedOrder.id, 'completed')} className="w-full bg-emerald-600 text-white py-2 rounded-lg font-bold hover:bg-emerald-700 flex items-center justify-center gap-2">
                                          <CheckCircle size={18} /> إكمال وإنتاج
                                      </button>
                                  )}
                                  {selectedOrder.status !== 'completed' && selectedOrder.status !== 'cancelled' && (
                                      <button onClick={() => handleStatusChange(selectedOrder.id, 'cancelled')} className="w-full bg-red-50 text-red-600 py-2 rounded-lg font-bold hover:bg-red-100 flex items-center justify-center gap-2">
                                          <XCircle size={18} /> إلغاء الأمر
                                      </button>
                                  )}
                              </div>
                          </div>
                      </div>
                  </div>
              ) : activeTab === 'ledger' ? (
                  /* عرض مكون كشف حساب المراحل المدمج */
                  <div className="animate-in slide-in-from-left-4 duration-300">
                    <StageLedger orderId={selectedOrder.id} orderNumber={selectedOrder.order_number} />
                  </div>
              ) : activeTab === 'variance' ? (
                  /* عرض تقرير تحليل الانحرافات */
                  <div className="animate-in slide-in-from-right-4 duration-300">
                    <StageVarianceReport orderId={selectedOrder.id} />
                  </div>
              ) : (
                  /* عرض تقارير محاسبة التكاليف المتقدمة */
                  <div className="animate-in fade-in duration-500">
                    <AdvancedCostingReports orderId={selectedOrder.id} />
                  </div>
              )}
          </div>
      )}

      {/* Create Modal */}
      {isModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
                  <h3 className="font-bold text-xl mb-4">أمر تشغيل جديد</h3>
                  <form onSubmit={handleCreateOrder} className="space-y-4">
                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">المنتج المراد تصنيعه <span className="text-red-500">*</span></label>
                          <ProductSearchSelect
                              products={manufacturableProducts}
                              value={formData.productId}
                              onChange={(productId) => setFormData(prev => ({ ...prev, productId }))}
                              warehouseId={formData.warehouseId}
                              placeholder="ابحث بالاسم، الكود (SKU)، الباركود أو الحروف..."
                              className="w-full"
                          />
                          {!formData.productId && (
                              <p className="text-[11px] text-slate-400 mt-1">
                                  ابحث بالكلمة أو بالحروف لاختيار المنتج التام أو الوسيط
                              </p>
                          )}
                      </div>
                      <div>
                          <label className="block text-sm font-bold mb-1">الكمية</label>
                          <input type="number" required min="1" className="w-full border rounded p-2" value={formData.quantity} onChange={e => setFormData({...formData, quantity: parseFloat(e.target.value)})} />
                      </div>
                      <div>
                          <label className="block text-sm font-bold mb-1">مستودع الإنتاج</label>
                          <select required className="w-full border rounded p-2" value={formData.warehouseId} onChange={e => setFormData({...formData, warehouseId: e.target.value})}>
                              <option value="">-- اختر المستودع --</option>
                              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                          </select>
                      </div>
                      <div>
                          <label className="block text-sm font-bold mb-1">تاريخ البدء</label>
                          <input type="date" required className="w-full border rounded p-2" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} />
                      </div>
                      <div>
                          <label className="block text-sm font-bold mb-1">ملاحظات</label>
                          <textarea className="w-full border rounded p-2" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})}></textarea>
                      </div>
                      <div className="flex gap-2 pt-2">
                          <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 bg-slate-100 text-slate-600 py-2 rounded font-bold">إلغاء</button>
                          <button type="submit" className="flex-1 bg-purple-600 text-white py-2 rounded font-bold">إنشاء</button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      {/* ⚙️ نافذة ضبط إعدادات المرحلة (Config Modal) */}
      {configModal.open && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
                  <div className="bg-purple-600 p-4 text-white">
                      <h3 className="font-bold flex items-center gap-2">
                        <Settings2 size={18} /> إعدادات تكاليف: {configModal.operationName}
                      </h3>
                  </div>
                  <div className="p-6 space-y-5">
                      <div className="space-y-2">
                          <label className="block text-sm font-bold text-slate-700">نقطة إضافة المواد (%)</label>
                          <input 
                            type="range" min="0" max="100" step="10" 
                            value={configModal.matPoint} 
                            onChange={e => setConfigModal({...configModal, matPoint: parseInt(e.target.value)})}
                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                          />
                          <div className="flex justify-between text-xs font-mono font-bold text-purple-600"><span>0% (البداية)</span> <span>{configModal.matPoint}%</span> <span>100% (النهاية)</span></div>
                      </div>

                      <div className="space-y-2">
                          <label className="block text-sm font-bold text-slate-700">نقطة فحص التالف (%)</label>
                          <input 
                            type="range" min="0" max="100" step="10" 
                            value={configModal.inspPoint} 
                            onChange={e => setConfigModal({...configModal, inspPoint: parseInt(e.target.value)})}
                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                          />
                          <div className="flex justify-between text-xs font-mono font-bold text-blue-600"><span>0%</span> <span>{configModal.inspPoint}%</span> <span>100%</span></div>
                      </div>

                      <div className="flex gap-2 pt-2">
                          <button onClick={() => setConfigModal({...configModal, open: false})} className="flex-1 py-2 rounded-lg font-bold text-slate-500 hover:bg-slate-100">إلغاء</button>
                          <button onClick={handleSaveStepConfig} className="flex-1 py-2 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 shadow-lg shadow-purple-100">حفظ الإعدادات</button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* Hidden Printable Component */}
      <div className="hidden">
          <PrintableWorkOrder 
            ref={workOrderPrintRef} 
            order={selectedOrder} 
            steps={steps} 
            settings={settings} 
          />
      </div>
    </div>
  );
};

// --- Printable Component ---
const PrintableWorkOrder = React.forwardRef<HTMLDivElement, { order: any, steps: any[], settings: any }>(({ order, steps, settings }, ref) => {
    if (!order) return null;
    return (
        <div ref={ref} className="p-10 text-right bg-white text-black font-sans" dir="rtl">
            <div className="flex justify-between items-start border-b-2 border-black pb-4 mb-6">
                <div>
                    <h1 className="text-2xl font-black mb-1">أمر تشغيل إنتاجي (Work Order)</h1>
                    <p className="text-sm font-bold text-slate-600">تاريخ الطباعة: {new Date().toLocaleDateString('ar-EG')}</p>
                </div>
                <div className="text-left">
                    <h2 className="text-xl font-bold">{settings.companyName}</h2>
                    <p className="text-xs">{settings.address}</p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-8 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="space-y-2">
                    <p><span className="font-bold text-slate-500 ml-2">رقم الأمر:</span> <span className="font-mono font-bold text-lg">{order.order_number}</span></p>
                    <p><span className="font-bold text-slate-500 ml-2">المنتج:</span> <span className="font-black">{order.products?.name}</span></p>
                    <p><span className="font-bold text-slate-500 ml-2">كود المنتج:</span> <span className="font-mono">{order.products?.sku}</span></p>
                </div>
                <div className="space-y-2">
                    <p><span className="font-bold text-slate-500 ml-2">الكمية المطلوبة:</span> <span className="font-black text-lg">{order.quantity_to_produce}</span></p>
                    <p><span className="font-bold text-slate-500 ml-2">تاريخ البدء:</span> <span>{order.start_date}</span></p>
                    <p><span className="font-bold text-slate-500 ml-2">المستودع:</span> <span>{order.warehouses?.name}</span></p>
                </div>
            </div>

            <h3 className="text-lg font-bold mb-4 border-r-4 border-purple-600 pr-3">مراحل وخطوات العمل التنفيذية</h3>
            <table className="w-full border-collapse">
                <thead>
                    <tr className="bg-slate-100 border-2 border-black">
                        <th className="p-2 border border-black text-center w-12">#</th>
                        <th className="p-2 border border-black text-right">المرحلة / العملية</th>
                        <th className="p-2 border border-black text-right">مركز العمل</th>
                        <th className="p-2 border border-black text-center">الزمن المعياري (د)</th>
                        <th className="p-2 border border-black text-center">الحالة</th>
                        <th className="p-2 border border-black text-right">توقيع المستلم</th>
                    </tr>
                </thead>
                <tbody>
                    {steps.map((s, idx) => (
                        <tr key={s.id} className="border border-black">
                            <td className="p-3 border border-black text-center font-bold">{idx + 1}</td>
                            <td className="p-3 border border-black font-black">{s.step?.operation_name}</td>
                            <td className="p-3 border border-black">{s.step?.work_center?.name || '---'}</td>
                            <td className="p-3 border border-black text-center font-mono">{s.step?.standard_time_minutes}</td>
                            <td className="p-3 border border-black text-center text-xs">{s.status === 'completed' ? '✅ مكتمل' : '⏳ قيد الانتظار'}</td>
                            <td className="p-3 border border-black w-32 h-12"></td>
                        </tr>
                    ))}
                </tbody>
            </table>
            
            <div className="mt-12 grid grid-cols-3 gap-8 text-center text-sm">
                <div className="border-t border-slate-300 pt-2 font-bold">توقيع مشرف الإنتاج</div>
                <div className="border-t border-slate-300 pt-2 font-bold">توقيع مراقب الجودة</div>
                <div className="border-t border-slate-300 pt-2 font-bold">توقيع المدير الفني</div>
            </div>

            <div className="mt-20 text-[10px] text-slate-400 text-center border-t pt-4">
                تم إنشاء هذا المستند بواسطة نظام TriPro ERP - قسم إدارة التصنيع المتقدم
            </div>
        </div>
    );
});

export default WorkOrderManager;
