import React, { useState, useEffect, useMemo } from 'react';
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
  X,
  Database,
  Copy,
  Check,
  Search,
  AlertTriangle,
  ExternalLink
} from 'lucide-react';

const FIX_KITCHEN_STATIONS_SQL = `-- ==============================================================================
-- TriPro ERP — Fix Kitchen Stations & Product Station Assignment
-- Migration: 2026-08-27_fix_kitchen_stations_and_products.sql
-- ==============================================================================

-- 1. إزالة أي قيود مفتاح أجنبي قديمة على station_id
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'products_station_id_fkey'
    ) THEN
        ALTER TABLE products DROP CONSTRAINT products_station_id_fkey;
    END IF;
END $$;

-- 2. تحويل نوع عمود station_id في جدول products إلى VARCHAR(100)
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'station_id'
    ) THEN
        ALTER TABLE products ALTER COLUMN station_id TYPE VARCHAR(100) USING station_id::text;
    ELSE
        ALTER TABLE products ADD COLUMN station_id VARCHAR(100);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'prep_time_minutes') THEN
        ALTER TABLE products ADD COLUMN prep_time_minutes INT DEFAULT 10;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_86') THEN
        ALTER TABLE products ADD COLUMN is_86 BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- 3. إصلاح جدول تذاكر المطبخ kitchen_ticket_items
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'kitchen_ticket_items') THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'kitchen_ticket_items_station_id_fkey'
        ) THEN
            ALTER TABLE kitchen_ticket_items DROP CONSTRAINT kitchen_ticket_items_station_id_fkey;
        END IF;

        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'kitchen_ticket_items' AND column_name = 'station_id'
        ) THEN
            ALTER TABLE kitchen_ticket_items ALTER COLUMN station_id TYPE VARCHAR(100) USING station_id::text;
        END IF;
    END IF;
END $$;

-- 4. التأكد من جدول محطات المطبخ kitchen_stations وتحويل id إلى VARCHAR(100)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'kitchen_stations') THEN
        CREATE TABLE kitchen_stations (
            id VARCHAR(100) PRIMARY KEY,
            organization_id UUID,
            name VARCHAR(255) NOT NULL,
            code VARCHAR(50) NOT NULL,
            color VARCHAR(50) DEFAULT '#e11d48',
            icon VARCHAR(50) DEFAULT 'Flame',
            display_order INT DEFAULT 0,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
    ELSE
        BEGIN
            ALTER TABLE kitchen_stations ALTER COLUMN id DROP DEFAULT;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
        BEGIN
            ALTER TABLE kitchen_stations ALTER COLUMN id TYPE VARCHAR(100) USING id::text;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;
END $$;

-- 5. منح صلاحيات الوصول الكاملة للأدوار (حل مشكلة 401 Permission Denied)
GRANT ALL ON TABLE kitchen_stations TO authenticated, anon;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'kitchen_ticket_items') THEN
        GRANT ALL ON TABLE kitchen_ticket_items TO authenticated, anon;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'driver_deliveries') THEN
        GRANT ALL ON TABLE driver_deliveries TO authenticated, anon;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'driver_settlements') THEN
        GRANT ALL ON TABLE driver_settlements TO authenticated, anon;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'happy_hour_schedules') THEN
        GRANT ALL ON TABLE happy_hour_schedules TO authenticated, anon;
    END IF;
END $$;

-- 6. سياسات الأمان RLS
ALTER TABLE kitchen_stations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'kitchen_stations' AND policyname = 'allow_all_stations') THEN
        CREATE POLICY allow_all_stations ON kitchen_stations FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 7. زرع محطات المطبخ الافتراضية
INSERT INTO kitchen_stations (id, name, code, color, icon, display_order, is_active)
VALUES 
  ('st_grill', 'محطة الشواية واللحوم (Grill)', 'grill', '#dc2626', 'Flame', 1, true),
  ('st_fryer', 'محطة المقليات والبرجر (Fryer)', 'fryer', '#ea580c', 'Utensils', 2, true),
  ('st_oven', 'محطة الفرن والبيتزا (Oven / Pizza)', 'oven', '#d97706', 'Layers', 3, true),
  ('st_cold', 'محطة البارد والسلطات (Cold & Salad)', 'cold', '#16a34a', 'Leaf', 4, true),
  ('st_drinks', 'محطة المشروبات والبار (Bar & Drinks)', 'drinks', '#0284c7', 'Coffee', 5, true),
  ('st_dessert', 'محطة الحلويات (Desserts)', 'dessert', '#9333ea', 'Sparkles', 6, true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  code = EXCLUDED.code,
  color = EXCLUDED.color,
  icon = EXCLUDED.icon,
  display_order = EXCLUDED.display_order,
  is_active = true;

-- 8. تحديث كاش PostgREST
NOTIFY pgrst, 'reload schema';`;

export const KitchenStationManager: React.FC = () => {
  const { currentUser, products } = useAccounting();
  const { showToast } = useToast();

  const [stations, setStations] = useState<KitchenStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStation, setSelectedStation] = useState<KitchenStation | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStationMode, setFilterStationMode] = useState<'ALL' | 'THIS_STATION' | 'UNASSIGNED'>('ALL');

  // Mapping state for responsive UI without page reloads
  const [assignedStations, setAssignedStations] = useState<Record<string, string | null>>({});

  // SQL Modal state
  const [isSqlModalOpen, setIsSqlModalOpen] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  const [formData, setFormData] = useState<Partial<KitchenStation>>({
    name: '',
    code: '',
    color: '#e11d48',
    icon: 'Flame',
    display_order: 1
  });

  // Sync assignedStations when products change
  useEffect(() => {
    const map: Record<string, string | null> = {};
    products.forEach(p => {
      map[p.id] = (p as any).station_id || null;
    });
    setAssignedStations(map);
  }, [products]);

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
    const prevStation = assignedStations[productId] ?? null;

    // Optimistic UI Update
    setAssignedStations(prev => ({ ...prev, [productId]: stationId }));
    const prod = products.find(p => p.id === productId);
    if (prod) {
      (prod as any).station_id = stationId;
    }

    try {
      const { error } = await supabase
        .from('products')
        .update({ station_id: stationId || null })
        .eq('id', productId);

      if (error) {
        // Rollback
        setAssignedStations(prev => ({ ...prev, [productId]: prevStation }));
        if (prod) {
          (prod as any).station_id = prevStation;
        }

        console.error('Failed to assign station to product:', error);

        // Check if error is due to UUID column mismatch or missing column
        if (
          error.code === '22P02' ||
          error.message?.includes('uuid') ||
          error.message?.includes('station_id') ||
          error.code === '42703'
        ) {
          showToast(
            '⚠️ تنبيه: عمود المحطة في قاعدة البيانات يحتاج إلى تحديث (UUID -> VARCHAR). اضغط على زر "إصلاح قاعدة البيانات" بالأعلى.',
            'error'
          );
          setIsSqlModalOpen(true);
        } else {
          showToast('فشل تحديث محطة الصنف: ' + error.message, 'error');
        }
        return;
      }

      showToast('تم تحديث محطة الصنف بنجاح ✅', 'success');
    } catch (e: any) {
      // Rollback
      setAssignedStations(prev => ({ ...prev, [productId]: prevStation }));
      if (prod) {
        (prod as any).station_id = prevStation;
      }
      showToast('خطأ: ' + e.message, 'error');
    }
  };

  // Filtered products list
  const filteredProducts = useMemo(() => {
    return products
      .filter(p => p.product_type === 'MANUFACTURED' || p.product_type === 'STOCK' || !p.product_type)
      .filter(p => {
        if (!searchTerm.trim()) return true;
        const term = searchTerm.toLowerCase();
        return (
          p.name.toLowerCase().includes(term) ||
          (p.sku && p.sku.toLowerCase().includes(term)) ||
          (p.barcode && p.barcode.toLowerCase().includes(term))
        );
      })
      .filter(p => {
        const assigned = assignedStations[p.id] || null;
        if (filterStationMode === 'THIS_STATION') {
          return selectedStation ? assigned === selectedStation.id : true;
        }
        if (filterStationMode === 'UNASSIGNED') {
          return !assigned;
        }
        return true;
      });
  }, [products, searchTerm, filterStationMode, selectedStation, assignedStations]);

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

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSqlModalOpen(true)}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-amber-400 hover:text-amber-300 rounded-xl text-xs font-bold flex items-center gap-2 border border-slate-700 shadow transition"
            title="عرض كود SQL لتهيئة وتصحيح قاعدة البيانات"
          >
            <Database className="w-4 h-4 text-amber-400" />
            <span>كود إصلاح قاعدة البيانات (SQL)</span>
          </button>

          <button
            onClick={handleStartNew}
            className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-rose-600/20 transition"
          >
            <Plus className="w-4 h-4" /> إضافة محطة مطبخ
          </button>
        </div>
      </div>

      {/* Grid: Stations List & Details / Product Mapping */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Stations Sidebar */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex justify-between items-center border-b pb-3">
            <span className="text-xs font-bold text-slate-700">محطات المطبخ المعتمدة ({stations.length})</span>
            <button
              onClick={fetchStations}
              disabled={loading}
              className="text-slate-400 hover:text-slate-600 p-1 transition"
              title="تحديث"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
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
              <div className="flex flex-wrap justify-between items-center gap-3 border-b pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: selectedStation.color }} />
                  <h4 className="font-bold text-base text-slate-800">
                    توجيه الأصناف إلى: <span className="text-rose-600">{selectedStation.name}</span>
                  </h4>
                </div>
                <span className="text-xs text-slate-500 font-bold">
                  حدد المحطة المخصصة لكل صنف في المنيو
                </span>
              </div>

              {/* Filters & Search Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="ابحث عن طبق أو صنف بالاسم أو الباركود..."
                    className="w-full pl-3 pr-9 py-2 border border-slate-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
                  <button
                    onClick={() => setFilterStationMode('ALL')}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      filterStationMode === 'ALL' ? 'bg-white shadow text-slate-800' : 'text-slate-600 hover:text-slate-800'
                    }`}
                  >
                    الكل ({products.length})
                  </button>
                  <button
                    onClick={() => setFilterStationMode('THIS_STATION')}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      filterStationMode === 'THIS_STATION' ? 'bg-white shadow text-rose-600' : 'text-slate-600 hover:text-slate-800'
                    }`}
                  >
                    أصناف هذه المحطة
                  </button>
                  <button
                    onClick={() => setFilterStationMode('UNASSIGNED')}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      filterStationMode === 'UNASSIGNED' ? 'bg-white shadow text-amber-600' : 'text-slate-600 hover:text-slate-800'
                    }`}
                  >
                    غير محدد (عام)
                  </button>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[520px] overflow-y-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="p-3">اسم الطبق / الصنف</th>
                      <th className="p-3">السعر</th>
                      <th className="p-3 text-center">المحطة الموجه إليها</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredProducts.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="p-8 text-center text-slate-400 font-bold">
                          لا توجد أصناف مطابقة للبحث أو الفلتر
                        </td>
                      </tr>
                    ) : (
                      filteredProducts.map(prod => {
                        const currentStationId = assignedStations[prod.id] ?? (prod as any).station_id ?? '';
                        const currentStationObj = stations.find(s => s.id === currentStationId);

                        return (
                          <tr key={prod.id} className="hover:bg-slate-50 transition">
                            <td className="p-3 font-bold text-slate-800">
                              <div className="flex items-center gap-2">
                                {currentStationObj && (
                                  <span
                                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: currentStationObj.color }}
                                    title={currentStationObj.name}
                                  />
                                )}
                                <span>{prod.name}</span>
                              </div>
                            </td>
                            <td className="p-3 font-mono text-slate-600">
                              {prod.sales_price || prod.price || 0} ج.م
                            </td>
                            <td className="p-3 text-center">
                              <select
                                value={currentStationId || ''}
                                onChange={e => handleAssignProduct(prod.id, e.target.value || null)}
                                className={`border rounded-lg px-3 py-1.5 text-xs font-semibold outline-none transition ${
                                  currentStationId
                                    ? 'border-rose-300 bg-rose-50/50 text-rose-900 focus:ring-2 focus:ring-rose-500'
                                    : 'border-slate-300 bg-white text-slate-700 focus:ring-2 focus:ring-slate-400'
                                }`}
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
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* SQL Migration & Fix Modal */}
      {isSqlModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="bg-slate-900 text-white p-5 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <Database className="w-5 h-5 text-amber-400" />
                <h3 className="font-black text-base">كود إصلاح وتهيئة محطات المطبخ (SQL Script)</h3>
              </div>
              <button
                onClick={() => setIsSqlModalOpen(false)}
                className="text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-amber-900 text-xs leading-relaxed">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-bold text-sm mb-1">سبب المشكلة والحل:</strong>
                  عمود المحطة <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">station_id</code> في قاعدة البيانات كان معرفاً بنوع <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">UUID</code>، بينما محطات المطبخ تستخدم معرفات نصية مرنة. هذا الكود يقوم بتحويله إلى <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">VARCHAR(100)</code>، ويمنح الصلاحيات اللازمة للجدول ويزرع المحطات الافتراضية.
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-700">خطوات التنفيذ (أقل من دقيقة):</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(FIX_KITCHEN_STATIONS_SQL);
                      setCopiedSql(true);
                      showToast('تم نسخ كود SQL إلى الحافظة بنجاح ✅', 'success');
                      setTimeout(() => setCopiedSql(false), 3000);
                    }}
                    className="bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow transition"
                  >
                    {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedSql ? 'تم النسخ!' : 'نسخ الكود'}
                  </button>
                </div>

                <ol className="list-decimal list-inside text-xs text-slate-600 space-y-1 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <li>افتح لوحة تحكم <strong>Supabase Dashboard</strong> الخاصة بمشروعك.</li>
                  <li>انتقل إلى قسم <strong>SQL Editor</strong> من القائمة الجانبية.</li>
                  <li>الصق الكود التالي واضغط على <strong>Run</strong> لتنفيذه بنجاح.</li>
                </ol>
              </div>

              <div className="relative">
                <pre className="bg-slate-950 text-emerald-400 p-4 rounded-xl text-xs font-mono overflow-x-auto max-h-64 border border-slate-800 leading-relaxed text-left" dir="ltr">
                  {FIX_KITCHEN_STATIONS_SQL}
                </pre>
              </div>
            </div>

            <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-between items-center">
              <span className="text-xs text-slate-500">
                الملف محفوظ في: <code className="bg-slate-200 px-1 py-0.5 rounded text-[11px] font-mono">services/migrations/2026-08-27_fix_kitchen_stations_and_products.sql</code>
              </span>
              <button
                onClick={() => setIsSqlModalOpen(false)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default KitchenStationManager;
