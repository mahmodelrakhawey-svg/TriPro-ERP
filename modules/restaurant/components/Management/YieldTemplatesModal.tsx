import React, { useState } from 'react';
import { ButcheringTemplate, ButcheringTemplateItem, butcheringYieldService } from '../../../../services/butcheringYieldService';
import { useAccounting } from '../../../../context/AccountingContext';
import { useToast } from '../../../../context/ToastContext';
import {
  X,
  Plus,
  Trash2,
  Save,
  Layers,
  Sparkles,
  Info,
  CheckCircle2,
  Scale,
  DollarSign
} from 'lucide-react';

interface YieldTemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  templates: ButcheringTemplate[];
  onTemplatesUpdated: () => void;
}

export const YieldTemplatesModal: React.FC<YieldTemplatesModalProps> = ({
  isOpen,
  onClose,
  templates,
  onTemplatesUpdated
}) => {
  const { products, currentUser } = useAccounting();
  const { showToast } = useToast();

  const [selectedTemplate, setSelectedTemplate] = useState<ButcheringTemplate | null>(
    templates.length > 0 ? templates[0] : null
  );
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // حالة النموذج عند التعديل أو الإنشاء
  const [formData, setFormData] = useState<ButcheringTemplate>({
    name: '',
    description: '',
    category: 'beef',
    default_expected_yield_pct: 95,
    default_max_shrinkage_pct: 5,
    cost_allocation_method: 'relative_value',
    items: []
  });

  if (!isOpen) return null;

  const handleSelectTemplate = (template: ButcheringTemplate) => {
    setSelectedTemplate(template);
    setIsEditing(false);
  };

  const handleStartNew = () => {
    setSelectedTemplate(null);
    setFormData({
      name: 'قالب تشفية جديد',
      description: '',
      category: 'beef',
      default_expected_yield_pct: 95,
      default_max_shrinkage_pct: 5,
      cost_allocation_method: 'relative_value',
      items: [
        { output_name: 'قطعية رئيسية 1', expected_yield_pct: 30, relative_value_weight: 1.5, is_by_product: false },
        { output_name: 'قطعية رئيسية 2', expected_yield_pct: 40, relative_value_weight: 1.0, is_by_product: false },
        { output_name: 'عظام ودهن', expected_yield_pct: 25, relative_value_weight: 0.2, is_by_product: true }
      ]
    });
    setIsEditing(true);
  };

  const handleStartEdit = (template: ButcheringTemplate) => {
    setFormData({
      ...template,
      items: template.items && template.items.length > 0 ? [...template.items] : []
    });
    setIsEditing(true);
  };

  const handleAddItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [
        ...(prev.items || []),
        {
          output_name: '',
          expected_yield_pct: 5,
          relative_value_weight: 1.0,
          is_by_product: false
        }
      ]
    }));
  };

  const handleRemoveItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      items: (prev.items || []).filter((_, i) => i !== index)
    }));
  };

  const handleItemChange = (index: number, field: keyof ButcheringTemplateItem, value: any) => {
    setFormData(prev => {
      const newItems = [...(prev.items || [])];
      newItems[index] = { ...newItems[index], [field]: value };
      return { ...prev, items: newItems };
    });
  };

  const totalExpectedPct = (formData.items || []).reduce(
    (acc, it) => acc + Number(it.expected_yield_pct || 0),
    0
  );

  const handleSave = async () => {
    if (!formData.name.trim()) {
      showToast('يرجى إدخال اسم القالب', 'warning');
      return;
    }
    if (!formData.items || formData.items.length === 0) {
      showToast('يجب إضافة صنف ناتج واحد على الأقل في القالب', 'warning');
      return;
    }

    setSaving(true);
    try {
      await butcheringYieldService.saveTemplate(
        formData,
        currentUser?.organization_id || undefined
      );
      showToast('تم حفظ قالب التشفية بنجاح ✅', 'success');
      setIsEditing(false);
      onTemplatesUpdated();
    } catch (err: any) {
      showToast('حدث خطأ أثناء حفظ القالب: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-rose-700 via-rose-600 to-amber-600 p-5 text-white flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl">
              <Layers className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold">قوالب تشفية وتفكيك الذبائح المعيارية</h3>
              <p className="text-xs text-rose-100 mt-0.5">
                تحديد نسب الاستخراج القياسية ومعاملات القيمة السوقية لكل نوع ذبيحة
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white hover:bg-white/10 p-2 rounded-xl transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body Split */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Left Sidebar: Templates List */}
          <div className="w-full md:w-80 border-b md:border-b-0 md:border-l border-slate-200 bg-slate-50 p-4 overflow-y-auto space-y-2">
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                القوالب المتاحة ({templates.length})
              </span>
              <button
                onClick={handleStartNew}
                className="text-xs bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" /> قالب جديد
              </button>
            </div>

            <div className="space-y-2">
              {templates.map(tmpl => {
                const isSelected = selectedTemplate?.name === tmpl.name && !isEditing;
                const catBadge =
                  tmpl.category === 'beef'
                    ? 'عجول وبقري'
                    : tmpl.category === 'poultry'
                    ? 'دواجن وفراخ'
                    : tmpl.category === 'lamb'
                    ? 'ضأن وخراف'
                    : tmpl.category === 'fish'
                    ? 'أسماك وفوسفور'
                    : 'أخرى';

                return (
                  <div
                    key={tmpl.id || tmpl.name}
                    onClick={() => handleSelectTemplate(tmpl)}
                    className={`p-3 rounded-xl cursor-pointer border transition ${
                      isSelected
                        ? 'bg-rose-50 border-rose-300 shadow-sm'
                        : 'bg-white border-slate-200 hover:border-rose-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <span className="font-bold text-sm text-slate-800 line-clamp-1">
                        {tmpl.name}
                      </span>
                      <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
                        {catBadge}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-1 mt-1">
                      {tmpl.description || 'قالب تشفية قياسي'}
                    </p>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2">
                      <span>{tmpl.items?.length || 0} قطعيات ناتجة</span>
                      <span className="text-emerald-600 font-semibold">
                        استخراج: {tmpl.default_expected_yield_pct}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Area: Template Details or Editor */}
          <div className="flex-1 p-6 overflow-y-auto bg-white">
            {isEditing ? (
              /* --- وضع التعديل والإنشاء --- */
              <div className="space-y-6">
                <div className="flex justify-between items-center border-b pb-3">
                  <h4 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-rose-600" />
                    {formData.id ? 'تعديل قالب التشفية' : 'إنشاء قالب تشفية جديد'}
                  </h4>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setIsEditing(false)}
                      className="px-3 py-1.5 border border-slate-300 text-slate-600 rounded-lg text-sm hover:bg-slate-50"
                    >
                      إلغاء
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-bold flex items-center gap-1.5 shadow"
                    >
                      <Save className="w-4 h-4" />
                      {saving ? 'جاري الحفظ...' : 'حفظ القالب'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">اسم القالب</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      placeholder="مثال: تشفية عجل بلدي كامل"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">التصنيف</label>
                    <select
                      value={formData.category}
                      onChange={e => setFormData({ ...formData, category: e.target.value as any })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500 outline-none"
                    >
                      <option value="beef">لحوم بقري وعجول</option>
                      <option value="poultry">دواجن وفراخ</option>
                      <option value="lamb">ضأن وخراف</option>
                      <option value="fish">أسماك ومأكولات بحرية</option>
                      <option value="other">أخرى</option>
                    </select>
                  </div>

                  <div className="md:col-span-3">
                    <label className="block text-xs font-bold text-slate-700 mb-1">الوصف / ملاحظات</label>
                    <input
                      type="text"
                      value={formData.description || ''}
                      onChange={e => setFormData({ ...formData, description: e.target.value })}
                      placeholder="وصف تفصيلي للقطعيات ونوع الذبيحة..."
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500 outline-none"
                    />
                  </div>
                </div>

                {/* Items Configuration Table */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <h5 className="font-bold text-sm text-slate-800">
                        مخرجات التشفية والقطعيات المستخرجة
                      </h5>
                      <p className="text-xs text-slate-500">
                        حدد النسبة المتوقعة من إجمالي وزن الذبيحة ومعامل القيمة السوقية
                      </p>
                    </div>
                    <button
                      onClick={handleAddItem}
                      className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 border border-slate-300"
                    >
                      <Plus className="w-3.5 h-3.5" /> إضافة قطعية
                    </button>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                        <tr>
                          <th className="p-2.5">اسم القطعية / الصنف الناتج</th>
                          <th className="p-2.5 w-32">النسبة المتوقعة %</th>
                          <th className="p-2.5 w-32" title="معامل توزيع التكلفة (فلتو 2.2، مفروم 1.0، عظم 0.15)">
                            معامل القيمة (Weight)
                          </th>
                          <th className="p-2.5 w-28 text-center">منتج ثانوي؟</th>
                          <th className="p-2.5 w-12 text-center">حذف</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(formData.items || []).map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-2">
                              <input
                                type="text"
                                value={item.output_name}
                                onChange={e => handleItemChange(idx, 'output_name', e.target.value)}
                                placeholder="مثال: عرق فلتو، صدور بانيه..."
                                className="w-full border border-slate-300 rounded px-2.5 py-1 text-xs outline-none focus:ring-1 focus:ring-rose-500"
                              />
                            </td>
                            <td className="p-2">
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  step="0.1"
                                  value={item.expected_yield_pct}
                                  onChange={e =>
                                    handleItemChange(idx, 'expected_yield_pct', parseFloat(e.target.value) || 0)
                                  }
                                  className="w-full border border-slate-300 rounded px-2 py-1 text-xs text-center font-bold text-slate-800 outline-none"
                                />
                                <span className="text-slate-400 font-bold">%</span>
                              </div>
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                step="0.05"
                                value={item.relative_value_weight}
                                onChange={e =>
                                  handleItemChange(idx, 'relative_value_weight', parseFloat(e.target.value) || 1.0)
                                }
                                className="w-full border border-slate-300 rounded px-2 py-1 text-xs text-center font-bold text-indigo-700 bg-indigo-50/50 outline-none"
                              />
                            </td>
                            <td className="p-2 text-center">
                              <input
                                type="checkbox"
                                checked={item.is_by_product || false}
                                onChange={e => handleItemChange(idx, 'is_by_product', e.target.checked)}
                                className="w-4 h-4 text-rose-600 rounded border-slate-300 cursor-pointer"
                              />
                            </td>
                            <td className="p-2 text-center">
                              <button
                                onClick={() => handleRemoveItem(idx)}
                                className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded transition"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
                        <tr>
                          <td className="p-2.5 text-slate-700">مجموع نسب الاستخراج المتوقعة:</td>
                          <td className="p-2.5 text-center">
                            <span
                              className={`px-2 py-0.5 rounded ${
                                totalExpectedPct > 100
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-emerald-100 text-emerald-700'
                              }`}
                            >
                              {totalExpectedPct.toFixed(1)}%
                            </span>
                          </td>
                          <td colSpan={3} className="p-2.5 text-xs text-slate-500">
                            الفاقد / الهالك المتوقع: {(100 - totalExpectedPct).toFixed(1)}%
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            ) : selectedTemplate ? (
              /* --- وضع عرض القالب المحدد --- */
              <div className="space-y-6">
                <div className="flex justify-between items-start border-b pb-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <h4 className="font-bold text-xl text-slate-800">{selectedTemplate.name}</h4>
                      <span className="text-xs bg-rose-100 text-rose-700 px-3 py-1 rounded-full font-bold">
                        {selectedTemplate.category === 'beef'
                          ? 'لحوم بقري'
                          : selectedTemplate.category === 'poultry'
                          ? 'دواجن'
                          : selectedTemplate.category === 'lamb'
                          ? 'ضأن'
                          : 'أسماك'}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 mt-1">
                      {selectedTemplate.description || 'قالب تشفية قياسي معتمد'}
                    </p>
                  </div>
                  <button
                    onClick={() => handleStartEdit(selectedTemplate)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow transition"
                  >
                    تعديل القالب والنسب
                  </button>
                </div>

                {/* Quick Info Cards */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex items-center gap-3">
                    <Scale className="w-8 h-8 text-emerald-600" />
                    <div>
                      <span className="text-[11px] text-emerald-800 font-bold block">
                        نسبة الاستخراج المتوقعة
                      </span>
                      <span className="text-lg font-extrabold text-emerald-900">
                        {selectedTemplate.default_expected_yield_pct}%
                      </span>
                    </div>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-center gap-3">
                    <Info className="w-8 h-8 text-amber-600" />
                    <div>
                      <span className="text-[11px] text-amber-800 font-bold block">
                        أقصى نسبة فاقد مسموحة
                      </span>
                      <span className="text-lg font-extrabold text-amber-900">
                        {selectedTemplate.default_max_shrinkage_pct}%
                      </span>
                    </div>
                  </div>

                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3.5 flex items-center gap-3">
                    <DollarSign className="w-8 h-8 text-indigo-600" />
                    <div>
                      <span className="text-[11px] text-indigo-800 font-bold block">
                        طريقة توزيع التكلفة
                      </span>
                      <span className="text-sm font-extrabold text-indigo-900">
                        القيمة السوقية النسبية
                      </span>
                    </div>
                  </div>
                </div>

                {/* Items Table */}
                <div className="space-y-2">
                  <h5 className="font-bold text-sm text-slate-800">
                    مخطط توزيع القطعيات والمعاملات ({selectedTemplate.items?.length || 0} صنف)
                  </h5>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-bold">
                        <tr>
                          <th className="p-3">#</th>
                          <th className="p-3">اسم القطعية الناتجة</th>
                          <th className="p-3 text-center">النسبة المتوقعة</th>
                          <th className="p-3 text-center">معامل القيمة النسبية</th>
                          <th className="p-3 text-center">نوع القطعية</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedTemplate.items?.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-3 text-slate-400 font-bold">{idx + 1}</td>
                            <td className="p-3 font-bold text-slate-800">{item.output_name}</td>
                            <td className="p-3 text-center">
                              <span className="bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded border border-emerald-200">
                                {item.expected_yield_pct}%
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              <span className="bg-indigo-50 text-indigo-700 font-bold px-2.5 py-0.5 rounded">
                                {item.relative_value_weight}x
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              {item.is_by_product ? (
                                <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">
                                  منتج ثانوي (عظم/دهن)
                                </span>
                              ) : (
                                <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-bold">
                                  لحم صافي رئيسي
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                <Layers className="w-12 h-12 mb-2 stroke-1" />
                <p className="text-sm">اختر قالباً من القائمة أو أنشئ قالباً جديداً</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
