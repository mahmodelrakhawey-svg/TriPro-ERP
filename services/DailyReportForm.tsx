import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { dailyReportSchema } from '../utils/validationSchemas';
import { supabase } from '../supabaseClient';
import { useToast } from '../context/ToastContext';
import { 
  ClipboardList, 
  Camera, 
  Users, 
  CloudSun, 
  Wrench, 
  Send, 
  Loader2,
  X
} from 'lucide-react';

interface DailyReportFormProps {
  projectId: string;
  projectName: string;
  onSuccess?: () => void;
}

const DailyReportForm: React.FC<DailyReportFormProps> = ({ projectId, projectName, onSuccess }) => {
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(dailyReportSchema),
    defaultValues: {
      projectId,
      reportDate: new Date().toISOString().split('T')[0],
      manpowerCount: 0,
      siteImages: [],
    }
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const newUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileExt = file.name.split('.').pop();
        const fileName = `${projectId}/${Date.now()}-${Math.random()}.${fileExt}`;
        const filePath = `construction/reports/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('project-assets')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage.from('project-assets').getPublicUrl(filePath);
        newUrls.push(publicUrl);
      }
      setImageUrls(prev => [...prev, ...newUrls]);
      showToast('تم رفع الصور بنجاح', 'success');
    } catch (error: any) {
      showToast('فشل رفع الصور: ' + error.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (index: number) => {
    setImageUrls(prev => prev.filter((_, i) => i !== index));
  };

  const onSubmit = async (data: any) => {
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('project_daily_reports')
        .insert([{
          ...data,
          site_images: imageUrls,
          reported_by: (await supabase.auth.getUser()).data.user?.id
        }]);

      if (error) throw error;

      showToast('تم إرسال التقرير اليومي بنجاح ✅', 'success');
      reset();
      setImageUrls([]);
      if (onSuccess) onSuccess();
    } catch (error: any) {
      showToast('خطأ في إرسال التقرير: ' + error.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
      <div className="bg-slate-800 p-4 text-white flex justify-between items-center">
        <h3 className="font-bold flex items-center gap-2">
          <ClipboardList size={20} />
          تقرير الإنجاز اليومي - {projectName}
        </h3>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">تاريخ التقرير</label>
            <input type="date" {...register('reportDate')} className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1 flex items-center gap-2">
              <Users size={16} className="text-blue-600" /> عدد العمالة بالموقع
            </label>
            <input type="number" {...register('manpowerCount', { valueAsNumber: true })} className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1 flex items-center gap-2">
              <CloudSun size={16} className="text-amber-500" /> حالة الطقس
            </label>
            <input type="text" {...register('weatherCondition')} placeholder="مثلاً: مشمس، رياح شديدة" className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1">وصف الأعمال المنفذة اليوم</label>
          <textarea {...register('workDescription')} rows={4} className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="اكتب تفاصيل ما تم إنجازه، العقبات، والمواد المستخدمة..." />
          {errors.workDescription && <p className="text-red-500 text-xs mt-1">{errors.workDescription.message as string}</p>}
        </div>

        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1 flex items-center gap-2">
            <Wrench size={16} className="text-slate-500" /> حالة المعدات والأدوات
          </label>
          <input type="text" {...register('equipmentStatus')} placeholder="مثلاً: كافة المعدات تعمل، عطل في الحفار" className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none" />
        </div>

        <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 bg-slate-50">
          <div className="flex flex-col items-center justify-center">
            <Camera size={40} className="text-slate-400 mb-2" />
            <p className="text-sm font-bold text-slate-600 mb-4">صور الموقع الميدانية</p>
            <input type="file" multiple accept="image/*" onChange={handleImageUpload} className="hidden" id="site-images" disabled={uploading} />
            <label htmlFor="site-images" className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg cursor-pointer hover:bg-slate-50 font-bold transition-all shadow-sm">
              {uploading ? <Loader2 className="animate-spin" size={18} /> : 'اختيار الصور من الجوال/الكاميرا'}
            </label>
          </div>

          {imageUrls.length > 0 && (
            <div className="grid grid-cols-4 md:grid-cols-6 gap-4 mt-6">
              {imageUrls.map((url, idx) => (
                <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 group">
                  <img src={url} alt="Site" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => removeImage(idx)} className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button type="submit" disabled={isSubmitting || uploading} className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
          {isSubmitting ? <Loader2 className="animate-spin" /> : <Send size={20} />}
          اعتماد وإرسال التقرير اليومي للمكتب الرئيسي
        </button>
      </form>
    </div>
  );
};

export default DailyReportForm;