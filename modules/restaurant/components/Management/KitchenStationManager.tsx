import React, { useState, useEffect } from 'react';
import { supabase } from '../../../../supabaseClient';
import { useAccounting } from '../../../../context/AccountingContext';
import { useToast } from '../../../../context/ToastContext';
import {
  KitchenStation,
  kitchenStationService,
  DEFAULT_KITCHEN_STATIONS
} from '../../../../services/kitchenStationService';
import {
  Layers,
  Plus,
  Save,
  Trash2,
  Edit2,
  Flame,
  Utensils,
  Coffee,
  Leaf,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  X
} from 'lucide-react';

export const KitchenStationManager: React.FC = () => {
  const { currentUser, products } = useAccounting();
  const { showToast } = useToast();

  const [stations, setStations] = useState<KitchenStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStation, setSelectedStation] = useState<KitchenStation | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState<Partial<KitchenStation>>({
    name: '',
    code: '',
    color: '#e11d48',
    icon: 'Flame',
    display_order: 1
  });

  const fetchStations = async () => {
    setLoading(true);
    try {
      const data = await kitchenStationService.getStations(currentUser?.organization_id || undefined);
      setStations(data);
      if (data.length > 0 && !selectedStation) {
        setSelectedStation(data[0]);
      }
    } catch (e: any) {
      showToast('خطأ في جلب المحطات: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStations();
  }, []);

  const handleStartNew = () => {
    setSelectedStation(null);
    setFormData({
      name: 'محطة جديدة',
      code: `st_${Date.now().toString().slice(-4)}`,
      color: '#0284c7',
      icon: 'Utensils',
      display_order: stations.length + 1
    });
    setIsEditing(true);
  };

  const handleStartEdit = (station: KitchenStation) => {
    setSelectedStation(station);
    setFormData(station);
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!formData.name?.trim()) {
      showToast('يرجى إدخال اسم المحطة', 'warning');
      return;
    }

    setSaving(true);
    try {
      await kitchenStationService.saveStation(formData, currentUser?.organization_id || undefined);
      showToast('تم حفظ محطة المطبخ بنجاح ✅', 'success');
      setIsEditing(false);
      fetchStations();
    } catch (e: any) {
      showToast('خطأ: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAssignProduct = async (productId: string, stationId: string | null) => {
    try {
      await supabase.from('products').update({ station_id: stationId }).eq('id', productId);
      showToast('تم تحديث محطة الصنف بنجاح', 'success');
    } catch (e: any) {
      showToast('خطأ: ' + e.message, 'error');
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto animate-in fade-in">
      {/* Top Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-rose-600 to-amber-600 rounded-2xl text-white shadow-md">
            <Layers className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800">إدارة محطات المطبخ (Kitchen Stations)</h2>
            <p className="text-xs text-slate-500 mt-1">
              توجيه أصناف الطلبات تلقائياً لشاشات الأقسام (شواية، مقليات، بارد، مشروبات)
            </p>
          </div>
        </div>

        <button
          onClick={handleStartNew}
          className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-rose-600/20 transition"
        >
          <Plus className="w-4 h-4" /> إضافة محطة مطبخ
        </button>
      </div>

      {/* Grid: Stations List & Details / Product Mapping */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Stations Sidebar */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex justify-between items-center border-b pb-3">
            <span className="text-xs font-bold text-slate-700">محطات المطبخ المعتمدة ({stations.length})</span>
            <button onClick={fetchStations} className="text-slate-400 hover:text-slate-600">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2">
            {stations.map(st => {
              const isSelected = selectedStation?.id === st.id && !isEditing;
              return (
                <div
                  key={st.id}
                  onClick={() => {
                    setSelectedStation(st);
                    setIsEditing(false);
                  }}
                  className={`p-3.5 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="w-4 h-4 rounded-full flex-shrink-0"
                      style={{ backgroundColor: st.color }}
                    />
                    <div>
                      <span className="font-bold text-sm block">{st.name}</span>
                      <span className="text-[11px] opacity-75 font-mono">رمز: {st.code}</span>
                    </div>
                  </div>

                  <button
                    onClick={e => {
                      e.stopPropagation();
                      handleStartEdit(st);
                    }}
                    className={`p-1.5 rounded-lg transition ${
                      isSelected ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-200 text-slate-600'
                    }`}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Area: Station Editor or Product Mapping */}
        <div className="md:col-span-2 space-y-6">
          {isEditing ? (
            /* Station Editor */
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b pb-3">
                <h4 className="font-bold text-base text-slate-800">
                  {formData.id ? 'تعديل محطة المطبخ' : 'إنشاء محطة جديدة'}
                </h4>
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-3 py-1.5 border border-slate-300 text-slate-600 rounded-lg text-xs font-bold"
                  >
                    إلغاء
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {saving ? 'جاري الحفظ...' : 'حفظ المحطة'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">اسم المحطة</label>
                  <input
                    type="text"
                    value={formData.name || ''}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    placeholder="مثال: محطة الشواية واللحوم"
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الرمز التعريفي (Code)</label>
                  <input
                    type="text"
                    value={formData.code || ''}
                    onChange={e => setFormData({ ...formData, code: e.target.value })}
                    placeholder="grill, fryer, drinks..."
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs outline-none focus:ring-2 focus:ring-rose-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">لون المحطة في الشاشة</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={formData.color || '#e11d48'}
                      onChange={e => setFormData({ ...formData, color: e.target.value })}
                      className="w-10 h-8 rounded border p-0 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={formData.color || '#e11d48'}
                      onChange={e => setFormData({ ...formData, color: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 text-xs font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">ترتيب العرض</label>
                  <input
                    type="number"
                    value={formData.display_order || 1}
                    onChange={e => setFormData({ ...formData, display_order: parseInt(e.target.value) || 1 })}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs outline-none"
                  />
                </div>
              </div>
            </div>
          ) : selectedStation ? (
            /* Product Mapping Table */
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: selectedStation.color }} />
                  <h4 className="font-bold text-base text-slate-800">
                    الأصناف الموجهة إلى: {selectedStation.name}
                  </h4>
                </div>
                <span className="text-xs text-slate-500 font-bold">
                  اختر المحطة المخصصة لكل طبق في المنيو
                </span>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[500px] overflow-y-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0">
                    <tr>
                      <th className="p-3">اسم الطبق / الصنف</th>
                      <th className="p-3 text-center">المحطة الموجه إليها</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {products
                      .filter(p => p.product_type === 'MANUFACTURED' || p.product_type === 'STOCK')
                      .map(prod => {
                        const currentStationId = (prod as any).station_id;
                        return (
                          <tr key={prod.id} className="hover:bg-slate-50">
                            <td className="p-3 font-bold text-slate-800">{prod.name}</td>
                            <td className="p-3 text-center">
                              <select
                                value={currentStationId || ''}
                                onChange={e => handleAssignProduct(prod.id, e.target.value || null)}
                                className="border border-slate-300 rounded-lg px-3 py-1 text-xs font-semibold outline-none focus:ring-1 focus:ring-rose-500"
                              >
                                <option value="">-- توجيه عام (كل المحطات) --</option>
                                {stations.map(st => (
                                  <option key={st.id} value={st.id}>
                                    {st.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
export default KitchenStationManager;
