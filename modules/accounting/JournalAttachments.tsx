import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../../context/ToastContext';
import { Upload, X, FileText, Image, Loader2, Trash2, Eye, Paperclip } from 'lucide-react';

type Attachment = {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number;
  created_at: string;
};

export default function JournalAttachments({ journalEntryId, readOnly = false }: { journalEntryId: string, readOnly?: boolean }) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const { showToast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (journalEntryId) {
      fetchAttachments();
    }
  }, [journalEntryId]);

  const fetchAttachments = async () => {
    try {
      const { data, error } = await supabase
        .from('journal_attachments')
        .select('*')
        .eq('journal_entry_id', journalEntryId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAttachments(data || []);
    } catch (error) {
      console.error('Error fetching attachments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const file = e.target.files[0];
    setUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
      const filePath = `${journalEntryId}/${fileName}`;

      // 1. Upload to Storage
      const { error: uploadError } = await supabase.storage
        .from('finance_docs')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // 2. Save metadata to DB
      const { error: dbError } = await supabase
        .from('journal_attachments')
        .insert({
          journal_entry_id: journalEntryId,
          file_name: file.name,
          file_path: filePath,
          file_type: file.type,
          file_size: file.size
        });

      if (dbError) throw dbError;

      fetchAttachments();
    } catch (error: any) {
      showToast('فشل رفع الملف: ' + error.message, 'error');
    } finally {
      setUploading(false);
      // Reset input
      e.target.value = '';
    }
  };

  const handleDelete = async (id: string, filePath: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا المرفق؟')) return;

    try {
      // 1. Delete from Storage
      const { error: storageError } = await supabase.storage
        .from('finance_docs')
        .remove([filePath]);

      if (storageError) throw storageError;

      // 2. Delete from DB
      const { error: dbError } = await supabase
        .from('journal_attachments')
        .delete()
        .eq('id', id);

      if (dbError) throw dbError;

      setAttachments(attachments.filter(a => a.id !== id));
    } catch (error: any) {
      showToast('فشل حذف الملف: ' + error.message, 'error');
    }
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <Image size={20} className="text-purple-500" />;
    if (type.includes('pdf')) return <FileText size={20} className="text-red-500" />;
    return <Paperclip size={20} className="text-slate-500" />;
  };

  const handlePreview = (filePath: string) => {
    const { data } = supabase.storage.from('finance_docs').getPublicUrl(filePath);
    window.open(data.publicUrl, '_blank');
  };

  if (!journalEntryId) return null;

  return (
    <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 mt-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-slate-700 flex items-center gap-2">
          <Paperclip size={18} /> المرفقات ({attachments.length})
        </h3>
        {!readOnly && (
          <div className="relative">
            <input
              type="file"
              onChange={handleUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={uploading}
            />
            <button 
              disabled={uploading}
              className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded-md text-sm hover:bg-slate-50 shadow-sm"
            >
              {uploading ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
              <span>رفع ملف</span>
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center py-4"><Loader2 className="animate-spin mx-auto text-slate-400" /></div>
      ) : attachments.length === 0 ? (
        <div className="text-center py-6 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-lg">
          لا توجد مرفقات حالياً
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {attachments.map((file) => (
            <div key={file.id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200 shadow-sm group">
              <div className="flex items-center gap-3 overflow-hidden">
                {getFileIcon(file.file_type)}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate" title={file.file_name}>{file.file_name}</p>
                  <p className="text-xs text-slate-400">{(file.file_size / 1024).toFixed(1)} KB</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => handlePreview(file.file_path)}
                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  title="معاينة"
                >
                  <Eye size={16} />
                </button>
                {!readOnly && (
                  <button 
                    onClick={() => handleDelete(file.id, file.file_path)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="حذف"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}