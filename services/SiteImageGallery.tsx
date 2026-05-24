import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { ArrowRight, Image as ImageIcon, Calendar, Maximize2, X, Loader2 } from 'lucide-react';

interface SiteImage {
  url: string;
  date: string;
  description: string;
}

const SiteImageGallery = ({ projectId, projectName, onBack }: { projectId: string, projectName: string, onBack: () => void }) => {
  const [images, setImages] = useState<SiteImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    const fetchImages = async () => {
      const { data } = await supabase
        .from('project_daily_reports')
        .select('report_date, work_description, site_images')
        .eq('project_id', projectId)
        .order('report_date', { ascending: false });

      if (data) {
        const flattened: SiteImage[] = [];
        data.forEach(report => {
          if (report.site_images && Array.isArray(report.site_images)) {
            report.site_images.forEach(imgUrl => {
              flattened.push({
                url: imgUrl,
                date: report.report_date,
                description: report.work_description
              });
            });
          }
        });
        setImages(flattened);
      }
      setLoading(false);
    };
    fetchImages();
  }, [projectId]);

  return (
    <div className="p-6 bg-slate-50 min-h-screen rtl text-right">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={onBack} className="p-2 hover:bg-white rounded-full shadow-sm transition-colors"><ArrowRight size={24} /></button>
        <div>
          <h1 className="text-2xl font-black text-slate-800">معرض الصور الميدانية: {projectName}</h1>
          <p className="text-slate-500">التسلسل الزمني لتقدم الأعمال في الموقع من واقع التقارير</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-20 text-slate-400"><Loader2 className="animate-spin" /></div>
      ) : images.length === 0 ? (
        <div className="bg-white rounded-3xl p-20 text-center border-2 border-dashed border-slate-200">
          <ImageIcon size={64} className="mx-auto text-slate-200 mb-4" />
          <p className="text-slate-500 font-bold">لا توجد صور مرفقة في التقارير اليومية لهذا المشروع</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {images.map((img, idx) => (
            <div key={idx} className="group relative bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all cursor-pointer border border-slate-100" onClick={() => setSelectedImage(img.url)}>
              <img src={img.url} alt="Site" className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-500" />
              <div className="p-3 bg-white/90 backdrop-blur-sm">
                <div className="flex items-center gap-2 text-[10px] font-black text-blue-600 mb-1">
                  <Calendar size={12} /> {new Date(img.date).toLocaleDateString('ar-EG')}
                </div>
                <p className="text-xs text-slate-600 truncate font-medium">{img.description}</p>
              </div>
              <div className="absolute top-2 left-2 p-2 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                <Maximize2 size={14} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Full Screen Preview */}
      {selectedImage && (
        <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300" onClick={() => setSelectedImage(null)}>
          <button className="absolute top-6 left-6 text-white hover:text-red-500 transition-colors"><X size={32} /></button>
          <img src={selectedImage} alt="Full Preview" className="max-w-full max-h-full rounded-lg shadow-2xl" />
        </div>
      )}
    </div>
  );
};

export default SiteImageGallery;