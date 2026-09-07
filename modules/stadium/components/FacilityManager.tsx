import React, { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';
import { useAccounting } from '@/context/AccountingContext';
import { Building2, Plus, Edit, Trash2, Search, Image as ImageIcon, X, Loader2 } from 'lucide-react';
import { useForm as useReactHookForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { StadiumFacility, FacilityType, FACILITY_TYPE_LABELS } from '../stadium.types';
import { uploadStadiumImage, formatCurrency } from '../stadiumHelpers';

// Validation Schema
const facilitySchema = z.object({
  name: z.string().min(1, 'اسم المرفق مطلوب'),
  type: z.enum(['football', 'tennis', 'basketball', 'gym', 'multi_purpose', 'swimming', 'other'] as const),
  capacity: z.number().optional(),
  price_per_hour: z.number().min(0, 'السعر يجب أن يكون 0 أو أكثر'),
  peak_price_per_hour: z.number().optional(),
  description: z.string().optional(),
  is_active: z.boolean(),
});

type FacilityFormData = z.infer<typeof facilitySchema>;

export default function FacilityManager() {
  const { currentUser } = useAccounting();
  const orgId = (currentUser as any)?.organization_id;

  const [facilities, setFacilities] = useState<StadiumFacility[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Pagination & Filtering
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<FacilityType | 'all'>('all');
  const ITEMS_PER_PAGE = 25;

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFacility, setEditingFacility] = useState<StadiumFacility | null>(null);
  
  // Image Upload State
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useReactHookForm<FacilityFormData>({
    resolver: zodResolver(facilitySchema) as any,
    defaultValues: {
      name: '',
      type: 'football',
      price_per_hour: 0,
      is_active: true
    }
  });

  useEffect(() => {
    if (!orgId) return;
    fetchFacilities();
  }, [orgId, page, searchQuery, typeFilter]);

  const fetchFacilities = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('stadium_facilities')
        .select('*', { count: 'exact' })
        .eq('organization_id', orgId);

      if (searchQuery) {
        query = query.ilike('name', `%${searchQuery}%`);
      }
      
      if (typeFilter !== 'all') {
        query = query.eq('type', typeFilter);
      }

      const from = (page - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      setFacilities(data || []);
      setTotalPages(Math.ceil((count || 0) / ITEMS_PER_PAGE));
    } catch (error: any) {
      toast.error('حدث خطأ أثناء جلب المرافق');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingFacility(null);
    reset({
      name: '',
      type: 'football',
      capacity: 0,
      price_per_hour: 0,
      peak_price_per_hour: 0,
      description: '',
      is_active: true
    });
    setImageFile(null);
    setImagePreview(null);
    setIsModalOpen(true);
  };

  const openEditModal = (facility: StadiumFacility) => {
    setEditingFacility(facility);
    reset({
      name: facility.name,
      type: facility.type,
      capacity: facility.capacity || 0,
      price_per_hour: facility.price_per_hour,
      peak_price_per_hour: facility.peak_price_per_hour || 0,
      description: facility.description || '',
      is_active: facility.is_active
    });
    setImageFile(null);
    setImagePreview(facility.image_url || null);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا المرفق؟')) return;
    try {
      const { error } = await supabase.from('stadium_facilities').delete().eq('id', id);
      if (error) throw error;
      toast.success('تم حذف المرفق بنجاح');
      fetchFacilities();
    } catch (error: any) {
      toast.error('حدث خطأ أثناء الحذف');
      console.error(error);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const onSubmit = async (data: FacilityFormData) => {
    if (!orgId) return;
    setIsSubmitting(true);
    try {
      let uploadedImageUrl = editingFacility?.image_url || null;

      if (imageFile) {
        try {
          const imageUrl = await uploadStadiumImage(imageFile, 'facilities');
          if (imageUrl) uploadedImageUrl = imageUrl;
        } catch (uploadErr: any) {
          toast.error(uploadErr.message ?? 'فشل رفع الصورة');
        }
      }

      const payload = {
        organization_id: orgId,
        name: data.name,
        type: data.type,
        capacity: data.capacity || null,
        price_per_hour: data.price_per_hour,
        peak_price_per_hour: data.peak_price_per_hour || null,
        description: data.description || null,
        is_active: data.is_active,
        image_url: uploadedImageUrl,
      };

      if (editingFacility) {
        const { error } = await supabase.from('stadium_facilities').update(payload).eq('id', editingFacility.id);
        if (error) throw error;
        toast.success('تم تحديث المرفق بنجاح');
      } else {
        const { error } = await supabase.from('stadium_facilities').insert(payload);
        if (error) throw error;
        toast.success('تم إضافة المرفق بنجاح');
      }
      
      setIsModalOpen(false);
      fetchFacilities();
    } catch (error: any) {
      toast.error('حدث خطأ أثناء الحفظ');
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen" dir="rtl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-green-600" />
            إدارة المرافق والملاعب
          </h1>
          <p className="text-gray-500 text-sm mt-1">أضف، عدل، وقم بإدارة مرافق الاستاد</p>
        </div>
        <button
          onClick={openAddModal}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-colors"
        >
          <Plus className="w-5 h-5" />
          إضافة مرفق
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-4 justify-between bg-gray-50/50">
          <div className="relative w-full sm:w-96">
            <Search className="absolute right-3 top-2.5 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="ابحث باسم المرفق..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              className="w-full pl-4 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value as FacilityType | 'all'); setPage(1); }}
            className="border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-green-500 outline-none min-w-[200px]"
          >
            <option value="all">جميع الأنواع</option>
            {Object.entries(FACILITY_TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="w-8 h-8 text-green-600 animate-spin" />
            </div>
          ) : (
            <table className="w-full text-right text-sm">
              <thead className="bg-gray-100 text-gray-700">
                <tr>
                  <th className="px-6 py-4 font-semibold">المرفق</th>
                  <th className="px-6 py-4 font-semibold">النوع</th>
                  <th className="px-6 py-4 font-semibold">السعة</th>
                  <th className="px-6 py-4 font-semibold">السعر / ساعة</th>
                  <th className="px-6 py-4 font-semibold">الحالة</th>
                  <th className="px-6 py-4 font-semibold text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {facilities.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                      لا توجد مرافق مطابقة للبحث
                    </td>
                  </tr>
                ) : (
                  facilities.map(facility => (
                    <tr key={facility.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {facility.image_url ? (
                            <img src={facility.image_url} alt={facility.name} className="w-10 h-10 rounded object-cover border border-gray-200" />
                          ) : (
                            <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center border border-gray-200">
                              <ImageIcon className="w-5 h-5 text-gray-400" />
                            </div>
                          )}
                          <div>
                            <p className="font-semibold text-gray-800">{facility.name}</p>
                            {facility.description && <p className="text-xs text-gray-500 truncate max-w-[150px]">{facility.description}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-md text-xs font-medium">
                          {FACILITY_TYPE_LABELS[facility.type]}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        {facility.capacity ? `${facility.capacity} شخص` : 'غير محدد'}
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-900">
                        {formatCurrency(facility.price_per_hour)}
                        {facility.peak_price_per_hour && (
                          <div className="text-xs text-orange-600 mt-1">الذروة: {formatCurrency(facility.peak_price_per_hour)}</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${facility.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {facility.is_active ? 'نشط' : 'غير نشط'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => openEditModal(facility)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors" title="تعديل">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(facility.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-md transition-colors" title="حذف">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
            <span className="text-sm text-gray-600">الصفحة {page} من {totalPages}</span>
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50"
              >
                السابق
              </button>
              <button
                disabled={page === totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50"
              >
                التالي
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex justify-between items-center p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
              <h2 className="text-xl font-bold text-gray-800">
                {editingFacility ? 'تعديل المرفق' : 'إضافة مرفق جديد'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">اسم المرفق <span className="text-red-500">*</span></label>
                  <input type="text" {...register('name')} className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-green-500 outline-none" />
                  {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">نوع المرفق <span className="text-red-500">*</span></label>
                  <select {...register('type')} className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-green-500 outline-none bg-white">
                    {Object.entries(FACILITY_TYPE_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                  {errors.type && <p className="text-xs text-red-500">{errors.type.message}</p>}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">السعر في الساعة <span className="text-red-500">*</span></label>
                  <input type="number" step="any" {...register('price_per_hour', { valueAsNumber: true })} className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-green-500 outline-none" />
                  {errors.price_per_hour && <p className="text-xs text-red-500">{errors.price_per_hour.message}</p>}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">سعر وقت الذروة (اختياري)</label>
                  <input type="number" step="any" {...register('peak_price_per_hour', { valueAsNumber: true })} className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-green-500 outline-none" />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">السعة (أشخاص - اختياري)</label>
                  <input type="number" {...register('capacity', { valueAsNumber: true })} className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-green-500 outline-none" />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">صورة المرفق</label>
                  <div className="flex items-center gap-4">
                    {imagePreview && (
                      <img src={imagePreview} alt="Preview" className="w-16 h-16 rounded object-cover border border-gray-200" />
                    )}
                    <label className="cursor-pointer border-2 border-dashed border-gray-300 rounded-lg px-4 py-2 hover:bg-gray-50 text-sm text-gray-600 flex-1 text-center transition-colors">
                      اختر صورة
                      <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                    </label>
                  </div>
                </div>

                <div className="md:col-span-2 space-y-2">
                  <label className="text-sm font-medium text-gray-700">الوصف (اختياري)</label>
                  <textarea {...register('description')} rows={3} className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-green-500 outline-none resize-none"></textarea>
                </div>

                <div className="md:col-span-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" {...register('is_active')} className="w-4 h-4 text-green-600 rounded border-gray-300 focus:ring-green-500" />
                    <span className="text-sm font-medium text-gray-700">المرفق نشط ومتاح للحجز</span>
                  </label>
                </div>

              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-gray-100">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
                  إلغاء
                </button>
                <button type="submit" disabled={isSubmitting} className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2 transition-colors">
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isSubmitting ? 'جاري الحفظ...' : 'حفظ المرفق'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
