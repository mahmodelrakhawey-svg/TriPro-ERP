import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/supabaseClient';
import { useAccounting as useOrg } from '@/context/AccountingContext';
import { useToast } from '@/context/ToastContext';
import {
  Factory, Plus, Trash2, Save, Loader2, Edit, X, Layers, Settings,
  Clock, Package, CheckSquare, Square, GripVertical, Info, DollarSign, Paperclip, Download,
  ChevronDown, ChevronUp, Star
} from 'lucide-react';
import SearchableSelect from '@/components/SearchableSelect'; // Assuming this component exists

interface WorkCenter {
  id: string;
  name: string;
  description: string | null;
  hourly_rate: number;
  overhead_rate: number;
}

interface Routing {
  id: string;
  product_id: string;
  name: string;
  is_default: boolean;
}

interface RoutingStep {
  id: string;
  routing_id: string;
  step_order: number;
  work_center_id: string | null;
  operation_name: string;
  standard_time_minutes: number;
  work_centers?: { name: string } | null; // Joined data
  materials?: StepMaterial[]; // Nested materials
  attachments?: StepAttachment[];
}

interface StepAttachment {
  id: string;
  step_id: string;
  file_name: string;
  file_url: string;
  created_at: string;
}

interface StepMaterial {
  id: string;
  step_id: string;
  raw_material_id: string;
  quantity_required: number;
  products?: { name: string; unit: string } | null; // Joined data
}

interface MfgProduct {
  id: string;
  name: string;
  unit?: string;
  mfg_type?: 'standard' | 'raw' | 'subassembly';
}

interface SearchableOption {
  id: string;
  name: string;
  code?: string;
}

const RoutingBOMManager = () => {
  const { organization, products: allProducts } = useOrg();
  const orgId = organization?.id;
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [currentRouting, setCurrentRouting] = useState<Routing | null>(null);
  const [routingSteps, setRoutingSteps] = useState<RoutingStep[]>([]);

  const [isWorkCenterModalOpen, setIsWorkCenterModalOpen] = useState(false);
  const [editingWorkCenter, setEditingWorkCenter] = useState<WorkCenter | null>(null);

  const [openStepId, setOpenStepId] = useState<string | null>(null); // For expanding/collapsing step details

  const [newMaterial, setNewMaterial] = useState<{ raw_material_id: string; quantity_required: number }>({
    raw_material_id: '',
    quantity_required: 0,
  });

  const productOptions: SearchableOption[] = useMemo(() => {
    return (allProducts as MfgProduct[])
      .filter(p => p.mfg_type === 'standard' || (p as any).product_type === 'MANUFACTURED') 
      .map(p => ({ id: p.id, name: p.name }));
  }, [allProducts]);

  const rawMaterialOptions: SearchableOption[] = useMemo(() => {
    return (allProducts as MfgProduct[])
      .filter(p => p.mfg_type === 'raw' || (p as any).product_type === 'RAW_MATERIAL') 
      .map(p => ({ id: p.id, name: p.name, code: p.unit || undefined }));
  }, [allProducts]);

  // --- Data Fetching ---
  const fetchWorkCenters = async () => {
    if (!orgId) return;
    const { data, error } = await supabase
      .from('mfg_work_centers')
      .select('*')
      .eq('organization_id', orgId)
      .order('name', { ascending: true });
    
    if (error) showToast('خطأ في جلب مراكز العمل', 'error');
    else setWorkCenters(data || []);
  };

  const fetchRoutingData = async (productId: string) => {
    if (!orgId) return;
    setLoading(true);
    try {
      // Fetch default routing for the product
      let { data: routingData, error: routingError } = await supabase
        .from('mfg_routings')
        .select('*')
        .eq('product_id', productId)
        .eq('organization_id', orgId)
        .eq('is_default', true)
        .maybeSingle();

      if (routingError) throw routingError;

      // If no default, get the first one
      if (!routingData) {
        const { data: firstRouting, error: firstRoutingError } = await supabase
          .from('mfg_routings')
          .select('*')
          .eq('product_id', productId)
          .eq('organization_id', orgId)
          .limit(1)
          .maybeSingle();
        if (firstRoutingError) throw firstRoutingError;
        routingData = firstRouting;
      }

      setCurrentRouting(routingData);

      if (routingData) {
        const { data: stepsData, error: stepsError } = await supabase
          .from('mfg_routing_steps')
          .select(`
            *,
            mfg_work_centers(name),
            mfg_step_materials(
              *,
              products(name, unit)
            ),
            mfg_step_attachments(
              *
            )
          `)
          .eq('routing_id', routingData.id)
          .eq('organization_id', orgId)
          .order('step_order', { ascending: true });

        if (stepsError) throw stepsError;
        setRoutingSteps((stepsData || []).map((s: any) => ({
          ...s,
          attachments: s.mfg_step_attachments || [],
          materials: s.mfg_step_materials || [] // <--- تم إضافة هذا السطر لربط المواد الخام بالعرض
        })));
      } else {
        setRoutingSteps([]);
      }
    } catch (error: any) {
      showToast('خطأ في جلب بيانات المسار: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkCenters();
  }, [orgId]);

  useEffect(() => {
    if (selectedProductId) {
      fetchRoutingData(selectedProductId);
    } else {
      setCurrentRouting(null);
      setRoutingSteps([]);
      setLoading(false);
    }
  }, [orgId, selectedProductId]);

  // --- Work Center Management ---
  const handleSaveWorkCenter = async (wc: WorkCenter) => {
    setSaving(true);
    try {
      if (wc.id) {
        const { error } = await supabase.from('mfg_work_centers').update(wc).eq('id', wc.id);
        if (error) throw error;
        showToast('تم تحديث مركز العمل بنجاح', 'success');
      } else {
        // نقوم بحذف الـ id الفارغ لنسمح لقاعدة البيانات بتوليد UUID تلقائياً
        const { id, ...dataToInsert } = wc;
        const { error } = await supabase.from('mfg_work_centers').insert({ ...dataToInsert, organization_id: orgId });
        if (error) throw error;
        showToast('تم إضافة مركز العمل بنجاح', 'success');
      }
      setIsWorkCenterModalOpen(false);
      setEditingWorkCenter(null);
      fetchWorkCenters();
    } catch (error: any) {
      showToast('فشل حفظ مركز العمل: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteWorkCenter = async (wcId: string) => {
    if (!window.confirm('هل أنت متأكد من حذف مركز العمل هذا؟')) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('mfg_work_centers').delete().eq('id', wcId);
      if (error) throw error;
      showToast('تم حذف مركز العمل بنجاح', 'success');
      fetchWorkCenters();
    } catch (error: any) {
      showToast('فشل حذف مركز العمل: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // --- Routing Management ---
  const handleCreateRouting = async () => {
    if (!selectedProductId) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('mfg_routings')
        .insert({
          product_id: selectedProductId,
          name: `مسار إنتاج لـ ${productOptions.find(p => p.id === selectedProductId)?.name}`,
          organization_id: orgId,
          is_default: true,
        })
        .select()
        .single();
      if (error) throw error;
      setCurrentRouting(data);
      showToast('تم إنشاء مسار إنتاج جديد', 'success');
    } catch (error: any) {
      showToast('فشل إنشاء المسار: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefaultRouting = async (routingId: string) => {
    if (!selectedProductId) return;
    setSaving(true);
    try {
      // Unset current default
      const { error: unsetError } = await supabase
        .from('mfg_routings')
        .update({ is_default: false })
        .eq('product_id', selectedProductId)
        .eq('organization_id', orgId)
        .eq('is_default', true);

      if (unsetError) throw unsetError;

      // Set new default
      const { error: setError } = await supabase
        .from('mfg_routings')
        .update({ is_default: true })
        .eq('id', routingId);

      if (setError) throw setError;

      showToast('تم تعيين المسار الافتراضي بنجاح', 'success');
      fetchRoutingData(selectedProductId);
    } catch (error: any) {
      showToast('فشل تعيين المسار الافتراضي: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // --- Routing Step Management ---
  const handleAddStep = async () => {
    if (!currentRouting) return;
    setSaving(true);
    try {
      const newStepOrder = routingSteps.length > 0 ? Math.max(...routingSteps.map(s => s.step_order)) + 1 : 1;
      const { data, error } = await supabase
        .from('mfg_routing_steps')
        .insert({
          routing_id: currentRouting.id,
          step_order: newStepOrder,
          operation_name: 'مرحلة جديدة',
          standard_time_minutes: 0,
          organization_id: orgId,
        })
        .select()
        .single();
      if (error) throw error;
      setRoutingSteps(prev => [...prev, { ...data, materials: [] }]);
      showToast('تم إضافة مرحلة جديدة', 'success');
    } catch (error: any) {
      showToast('فشل إضافة المرحلة: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStep = async (stepId: string, updates: Partial<RoutingStep>) => {
    setSaving(true);
    try {
      const { error } = await supabase.from('mfg_routing_steps').update(updates).eq('id', stepId);
      if (error) throw error;
      setRoutingSteps(prev =>
        prev.map(step => (step.id === stepId ? { ...step, ...updates } : step))
      );
      showToast('تم تحديث المرحلة', 'success');
    } catch (error: any) {
      showToast('فشل تحديث المرحلة: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStep = async (stepId: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه المرحلة وجميع المواد المرتبطة بها؟')) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('mfg_routing_steps').delete().eq('id', stepId);
      if (error) throw error;
      setRoutingSteps(prev => prev.filter(step => step.id !== stepId));
      showToast('تم حذف المرحلة بنجاح', 'success');
    } catch (error: any) {
      showToast('فشل حذف المرحلة: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // --- Step Material Management (BOM) ---
  const handleAddMaterialToStep = async (stepId: string, rawMaterialId: string, quantity: number) => {
    if (!rawMaterialId || quantity <= 0) {
      showToast('الرجاء اختيار مادة خام وتحديد كمية صحيحة', 'warning');
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('mfg_step_materials')
        .insert({
          step_id: stepId,
          raw_material_id: rawMaterialId,
          quantity_required: quantity,
          organization_id: orgId,
        })
        .select(`*, products(name, unit)`)
        .single();
      if (error) throw error;

      setRoutingSteps(prev =>
        prev.map(step =>
          step.id === stepId
            ? { ...step, materials: [...(step.materials || []), data] }
            : step
        )
      );
      setNewMaterial({ raw_material_id: '', quantity_required: 0 }); // Clear form
      showToast('تم إضافة المادة الخام للمرحلة', 'success');
    } catch (error: any) {
      showToast('فشل إضافة المادة الخام: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateMaterialQuantity = async (materialId: string, stepId: string, quantity: number) => {
    if (quantity <= 0) {
      showToast('الكمية المطلوبة يجب أن تكون أكبر من صفر', 'warning');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('mfg_step_materials').update({ quantity_required: quantity }).eq('id', materialId);
      if (error) throw error;
      setRoutingSteps(prev =>
        prev.map(step =>
          step.id === stepId
            ? {
                ...step,
                materials: (step.materials || []).map(mat =>
                  mat.id === materialId ? { ...mat, quantity_required: quantity } : mat
                ),
              }
            : step
        )
      );
      showToast('تم تحديث كمية المادة الخام', 'success');
    } catch (error: any) {
      showToast('فشل تحديث كمية المادة الخام: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMaterial = async (materialId: string, stepId: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه المادة الخام من المرحلة؟')) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('mfg_step_materials').delete().eq('id', materialId);
      if (error) throw error;
      setRoutingSteps(prev =>
        prev.map(step =>
          step.id === stepId
            ? { ...step, materials: (step.materials || []).filter(mat => mat.id !== materialId) }
            : step
        )
      );
      showToast('تم حذف المادة الخام بنجاح', 'success');
    } catch (error: any) {
      showToast('فشل حذف المادة الخام: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUploadAttachment = async (stepId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !orgId) return;

    setSaving(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${stepId}/${Math.random()}.${fileExt}`;
      const filePath = `mfg/routings/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(filePath);

      const { error: dbError } = await supabase
        .from('mfg_step_attachments')
        .insert({
          step_id: stepId,
          file_name: file.name,
          file_url: publicUrl,
          organization_id: orgId
        });

      if (dbError) throw dbError;
      showToast('تم رفع المرفق بنجاح', 'success');
      fetchRoutingData(selectedProductId!);
    } catch (error: any) {
      showToast('خطأ في رفع المرفق: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا المرفق؟')) return;
    try {
      const { error } = await supabase.from('mfg_step_attachments').delete().eq('id', attachmentId);
      if (error) throw error;
      showToast('تم حذف المرفق', 'success');
      fetchRoutingData(selectedProductId!);
    } catch (error: any) {
      showToast('فشل حذف المرفق: ' + error.message, 'error');
    }
  };

  // --- Work Center Modal Component ---
  const WorkCenterModal = ({ isOpen, onClose, wc, onSave }: { isOpen: boolean; onClose: () => void; wc: WorkCenter | null; onSave: (wc: WorkCenter) => void }) => {
    const [name, setName] = useState(wc?.name || '');
    const [description, setDescription] = useState(wc?.description || '');
    const [hourlyRate, setHourlyRate] = useState(wc?.hourly_rate || 0);
    const [overheadRate, setOverheadRate] = useState(wc?.overhead_rate || 0);

    useEffect(() => {
      if (wc) {
        setName(wc.name);
        setDescription(wc.description || '');
        setHourlyRate(wc.hourly_rate);
        setOverheadRate(wc.overhead_rate);
      } else {
        setName('');
        setDescription('');
        setHourlyRate(0);
        setOverheadRate(0);
      }
    }, [wc]);

    if (!isOpen) return null;

    return (
      <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
          <div className="p-4 border-b flex justify-between items-center bg-slate-50">
            <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
              <Factory className="text-blue-600" /> {wc ? 'تعديل مركز عمل' : 'إضافة مركز عمل جديد'}
            </h3>
            <button onClick={onClose} className="text-slate-400 hover:text-red-500"><X size={20} /></button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSave({ id: wc?.id || '', name, description, hourly_rate: hourlyRate, overhead_rate: overheadRate });
            }}
            className="p-6 space-y-4"
          >
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">اسم مركز العمل</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">الوصف</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">تكلفة الساعة (عمالة)</label>
              <input
                type="number"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(parseFloat(e.target.value))}
                className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">تكلفة المصاريف غير المباشرة (لكل ساعة)</label>
              <input
                type="number"
                value={overheadRate}
                onChange={(e) => setOverheadRate(parseFloat(e.target.value))}
                className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                min="0"
                step="0.01"
              />
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                type="submit"
                disabled={saving}
                className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? <Loader2 className="animate-spin" /> : <Save size={18} />}
                حفظ
              </button>
              <button type="button" onClick={onClose} className="bg-slate-100 text-slate-600 font-bold py-2 px-4 rounded-lg hover:bg-slate-200">
                إلغاء
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen" dir="rtl">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <Settings className="text-blue-600" />
              إعداد المسارات وقائمة المواد (BOM)
            </h1>
            <p className="text-gray-500 text-sm">تحديد مراحل الإنتاج والمواد الخام لكل منتج مصنع</p>
          </div>
          <button
            onClick={() => {
              setEditingWorkCenter(null);
              setIsWorkCenterModalOpen(true);
            }}
            className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-emerald-700 flex items-center gap-2"
          >
            <Plus size={18} /> إضافة مركز عمل
          </button>
        </div>

        {/* Work Centers List */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="font-bold text-lg text-gray-800 mb-4 flex items-center gap-2">
            <Factory size={20} className="text-blue-600" /> مراكز العمل
          </h2>
          {workCenters.length === 0 ? (
            <div className="text-center text-gray-500 py-4">لا توجد مراكز عمل معرفة بعد.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {workCenters.map(wc => (
                <div key={wc.id} className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex justify-between items-center">
                  <div>
                    <p className="font-bold text-gray-800">{wc.name}</p>
                    <p className="text-xs text-gray-500">تكلفة/ساعة: {wc.hourly_rate} | مصاريف غير مباشرة: {wc.overhead_rate}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditingWorkCenter(wc);
                        setIsWorkCenterModalOpen(true);
                      }}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteWorkCenter(wc.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Product Selection */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="font-bold text-lg text-gray-800 mb-4 flex items-center gap-2">
            <Package size={20} className="text-blue-600" /> اختيار المنتج المصنع
          </h2>
          <SearchableSelect
            options={productOptions}
            value={selectedProductId || ''}
            onChange={setSelectedProductId}
            placeholder="اختر منتجاً مصنعاً لإدارة مسار إنتاجه"
            className="w-full"
          />
        </div>

        {selectedProductId && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                <Layers size={20} className="text-purple-600" /> مسار الإنتاج لـ{' '}
                {productOptions.find(p => p.id === selectedProductId)?.name}
              </h2>
              {!currentRouting && (
                <button
                  onClick={handleCreateRouting}
                  disabled={saving}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {saving ? <Loader2 className="animate-spin" /> : <Plus size={18} />}
                  إنشاء مسار جديد
                </button>
              )}
            </div>

            {loading ? (
              <div className="p-20 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" size={40} /></div>
            ) : !currentRouting ? (
              <div className="text-center text-gray-500 py-4">
                لا يوجد مسار إنتاج معرف لهذا المنتج. الرجاء إنشاء واحد.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Star size={16} className="text-amber-500" />
                  <span className="font-bold">المسار الافتراضي:</span> {currentRouting.name}
                  <button
                    onClick={() => handleSetDefaultRouting(currentRouting.id)}
                    className="text-blue-600 hover:underline text-xs mr-2"
                  >
                    (تعيين كافتراضي)
                  </button>
                </div>

                <button
                  onClick={handleAddStep}
                  disabled={saving}
                  className="bg-blue-500 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2"
                >
                  <Plus size={18} /> إضافة مرحلة إنتاجية
                </button>

                {routingSteps.length === 0 ? (
                  <div className="text-center text-gray-500 py-4">لا توجد مراحل معرفة لهذا المسار.</div>
                ) : (
                  <div className="space-y-4">
                    {routingSteps.map(step => (
                      <div key={step.id} className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <GripVertical size={18} className="text-gray-400 cursor-grab" />
                            <input
                              type="text"
                              value={step.operation_name}
                              onChange={e => handleUpdateStep(step.id, { operation_name: e.target.value })}
                              className="font-bold text-lg text-gray-800 bg-transparent border-b border-transparent focus:border-blue-500 outline-none"
                            />
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => setOpenStepId(openStepId === step.id ? null : step.id)} className="text-gray-600 hover:text-blue-600">
                              {openStepId === step.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                            </button>
                            <button onClick={() => handleDeleteStep(step.id)} className="text-red-600 hover:text-red-800">
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>

                        {openStepId === step.id && (
                          <div className="mt-4 space-y-4 animate-in fade-in slide-in-from-top-2">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">مركز العمل</label>
                                <select
                                  value={step.work_center_id || ''}
                                  onChange={e => handleUpdateStep(step.id, { work_center_id: e.target.value })}
                                  className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                >
                                  <option value="">-- اختر مركز عمل --</option>
                                  {workCenters.map(wc => (
                                    <option key={wc.id} value={wc.id}>{wc.name}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">الوقت المعياري (دقائق)</label>
                                <input
                                  type="number"
                                  value={step.standard_time_minutes}
                                  onChange={e => handleUpdateStep(step.id, { standard_time_minutes: parseFloat(e.target.value) })}
                                  className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                  min="0"
                                  step="0.1"
                                />
                              </div>
                            </div>

                            {/* Step Materials (BOM) */}
                            <div className="border-t pt-4 mt-4">
                              <h3 className="font-bold text-md text-gray-800 mb-3 flex items-center gap-2">
                                <Package size={18} className="text-blue-600" /> المواد الخام المطلوبة
                              </h3>
                              {step.materials && step.materials.length > 0 ? (
                                <table className="w-full text-right text-sm">
                                  <thead>
                                    <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                                      <th className="p-2">المادة الخام</th>
                                      <th className="p-2 text-center">الكمية</th>
                                      <th className="p-2 text-center">الوحدة</th>
                                      <th className="p-2 text-center">إجراءات</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {step.materials.map(mat => (
                                      <tr key={mat.id} className="border-b hover:bg-gray-50">
                                        <td className="p-2 font-medium">{mat.products?.name}</td>
                                        <td className="p-2 text-center">
                                          <input
                                            type="number"
                                            value={mat.quantity_required}
                                            onChange={e => handleUpdateMaterialQuantity(mat.id, step.id, parseFloat(e.target.value))}
                                            className="w-20 border rounded-lg p-1 text-center"
                                            min="0.001"
                                            step="0.001"
                                          />
                                        </td>
                                        <td className="p-2 text-center text-gray-500">{mat.products?.unit}</td>
                                        <td className="p-2 text-center">
                                          <button onClick={() => handleDeleteMaterial(mat.id, step.id)} className="text-red-600 hover:text-red-800">
                                            <Trash2 size={16} />
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              ) : (
                                <div className="text-center text-gray-500 py-2">لا توجد مواد خام معرفة لهذه المرحلة.</div>
                              )}

                              {/* Add new material form */}
                              <div className="flex gap-2 mt-4">
                                <div className="flex-1">
                                  <SearchableSelect
                                    options={rawMaterialOptions}
                                    value={newMaterial.raw_material_id} // Bind to newMaterial state
                                    onChange={(val) => setNewMaterial(prev => ({ ...prev, raw_material_id: val }))}
                                    placeholder="اختر مادة خام"
                                  />
                                </div>
                                <input
                                  type="number"
                                  value={newMaterial.quantity_required}
                                  onChange={e => {
                                    setNewMaterial(prev => ({ ...prev, quantity_required: parseFloat(e.target.value) }));
                                  }}
                                  placeholder="الكمية"
                                  className="w-24 border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                  min="0.001"
                                  step="0.001"
                                />
                                <button
                                  onClick={() => handleAddMaterialToStep(step.id, newMaterial.raw_material_id, newMaterial.quantity_required)}
                                  disabled={!newMaterial.raw_material_id || newMaterial.quantity_required <= 0 || saving}
                                  className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                                >
                                  <Plus size={18} /> إضافة
                                </button>
                              </div>
                            </div>

                            {/* Technical Attachments */}
                            <div className="border-t pt-4 mt-4">
                              <h3 className="font-bold text-md text-gray-800 mb-3 flex items-center gap-2">
                                <Paperclip size={18} className="text-blue-600" /> المرفقات الفنية والدلائل
                              </h3>
                              
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                                {step.attachments?.map(att => (
                                  <div key={att.id} className="flex items-center justify-between p-3 bg-white border rounded-lg shadow-sm">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                      <Paperclip size={14} className="text-slate-400 shrink-0" />
                                      <span className="text-xs font-medium truncate" title={att.file_name}>{att.file_name}</span>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="p-1 text-blue-600 hover:bg-blue-50 rounded">
                                        <Download size={14} />
                                      </a>
                                      <button onClick={() => handleDeleteAttachment(att.id)} className="p-1 text-red-600 hover:bg-red-50 rounded">
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              <div className="relative">
                                <input
                                  type="file"
                                  id={`file-upload-${step.id}`}
                                  className="hidden"
                                  onChange={(e) => handleUploadAttachment(step.id, e)}
                                  disabled={saving}
                                />
                                <label htmlFor={`file-upload-${step.id}`} className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-200 transition-colors border border-slate-200">
                                  {saving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                                  رفع ملف (PDF, DWG, صورة)
                                </label>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <WorkCenterModal
        isOpen={isWorkCenterModalOpen}
        onClose={() => setIsWorkCenterModalOpen(false)}
        wc={editingWorkCenter}
        onSave={handleSaveWorkCenter}
      />
    </div>
  );
};

export default RoutingBOMManager;