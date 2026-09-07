import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';
import { useToast } from '../../../context/ToastContext';
import { FileText, Upload, Trash2, Download, Paperclip, Loader2, X, Image as ImageIcon } from 'lucide-react';

interface Attachment {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  created_at: string;
  billing_id?: string;
  sub_billing_id?: string;
}

interface Props {
  projectId: string;
  billingId?: string;
  onClose: () => void;
}

const SiteAttachmentManager: React.FC<Props> = ({ projectId, billingId, onClose }) => {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => { fetchAttachments(); }, [projectId, billingId]);

  const fetchAttachments = async () => {
    setLoading(true);
    let query = supabase.from('project_attachments').select('*').eq('project_id', projectId);
    // 🏗️ التحقق بذكاء: هل هو مستخلص عميل أم مقاول باطن؟
    if (billingId) {
      query = query.or(`billing_id.eq.${billingId},sub_billing_id.eq.${billingId}`);
    }
    else query = query.is('billing_id', null);

    const { data, error } = await query.order('created_at', { ascending: false });
    if (!error) setAttachments(data || []);
    setLoading(false);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${projectId}/${Date.now()}.${fileExt}`;
      const filePath = `construction/${fileName}`;

      const { error: uploadError } = await supabase.storage.from('project-assets').upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('project-assets').getPublicUrl(filePath);

      // 🏗️ تحديد العمود الصحيح للحفظ
      const insertData: any = {
        project_id: projectId,
        file_name: file.name,
        file_url: publicUrl,
        file_type: file.type,
        file_size: file.size
      };
      
      // إذا كان المعرف يبدأ بـ 'SUB' أو تم تمريره من واجهة المقاولين (منطقياً)
      // هنا نعتمد على البروب الممرر
      if (billingId) insertData.sub_billing_id = billingId; 
      else insertData.billing_id = billingId;

      const { error: dbError } = await supabase.from('project_attachments').insert([insertData]);

      if (dbError) throw dbError;
      showToast('تم رفع المستند بنجاف ✅', 'success');
      fetchAttachments();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const deleteAttachment = async (id: string, url: string) => {
    if (!window.confirm('هل تريد حذف هذا المستند؟')) return;
    try {
      const { error } = await supabase.from('project_attachments').delete().eq('id', id);
      if (error) throw error;
      setAttachments(attachments.filter(a => a.id !== id));
      showToast('تم الحذف بنجاح', 'success');
    } catch (err: any) { showToast(err.message, 'error'); }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4 rtl">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        <div className="p-6 bg-slate-50 border-b flex justify-between items-center">
          <h3 className="font-black text-xl text-slate-800 flex items-center gap-2">
            <Paperclip className="text-blue-600" /> {billingId ? 'مرفقات المستخلص' : 'مرفقات المشروع العامة'}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors"><X size={24} /></button>
        </div>

        <div className="p-6">
          <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50 transition-all mb-6">
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              {uploading ? <Loader2 className="animate-spin text-blue-600" /> : <Upload className="text-slate-400 mb-2" />}
              <p className="text-sm font-bold text-slate-500">اضغط لرفع نسخة من المستند (PDF, صور)</p>
            </div>
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>

          <div className="space-y-3 max-h-60 overflow-y-auto custom-scrollbar">
            {loading ? (
              <div className="flex justify-center py-4"><Loader2 className="animate-spin text-slate-300" /></div>
            ) : attachments.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-4">لا توجد مرفقات حالياً</p>
            ) : (
              attachments.map(file => (
                <div key={file.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 group">
                  <div className="flex items-center gap-3 overflow-hidden">
                    {file.file_type.startsWith('image/') ? <ImageIcon size={18} className="text-blue-500" /> : <FileText size={18} className="text-red-500" />}
                    <div className="overflow-hidden">
                      <p className="text-xs font-bold text-slate-700 truncate">{file.file_name}</p>
                      <p className="text-[10px] text-slate-400">{new Date(file.created_at).toLocaleDateString('ar-EG')}</p>
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <a 
                      href={file.file_url} 
                      target="_blank" 
                      rel="noreferrer"
                      className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-md"
                    >
                      <Download size={14} />
                    </a>
                    <button 
                      onClick={() => deleteAttachment(file.id, file.file_url)}
                      className="p-1.5 text-red-600 hover:bg-red-100 rounded-md"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        
        <div className="p-4 bg-slate-50 border-t text-center">
          <button onClick={onClose} className="text-sm font-bold text-slate-500 hover:text-slate-700">إغلاق</button>
        </div>
      </div>
    </div>
  );
};

export default SiteAttachmentManager;