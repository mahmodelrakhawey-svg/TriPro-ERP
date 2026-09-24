import React, { useState, useRef } from 'react';
import { supabase } from '../../../supabaseClient';
import { useToast } from '../../../context/ToastContext';
import { 
  Paperclip, Upload, Trash2, Eye, Download, FileText, Image as ImageIcon, 
  FileSpreadsheet, Loader2, CheckCircle2, AlertCircle, X, ExternalLink
} from 'lucide-react';

export interface PurchaseAttachmentItem {
  id?: string;
  file_name: string;
  file_path: string;
  file_type?: string;
  file_size?: number;
  created_at?: string;
  url?: string;
  file?: File; // للملفات المعلقة قبل حفظ الفاتورة لأول مرة
  is_pending?: boolean;
}

interface PurchaseInvoiceAttachmentsProps {
  invoiceId?: string | null;
  organizationId?: string | null;
  attachments: PurchaseAttachmentItem[];
  onChange: (attachments: PurchaseAttachmentItem[]) => void;
  readOnly?: boolean;
}

export const PurchaseInvoiceAttachments: React.FC<PurchaseInvoiceAttachmentsProps> = ({
  invoiceId,
  organizationId,
  attachments = [],
  onChange,
  readOnly = false
}) => {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewItem, setPreviewItem] = useState<{ url: string; name: string; isImage: boolean } | null>(null);

  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const getFileIcon = (fileType?: string, fileName?: string) => {
    const type = (fileType || '').toLowerCase();
    const name = (fileName || '').toLowerCase();

    if (type.includes('image') || /\.(jpg|jpeg|png|webp|gif|svg)$/.test(name)) {
      return <ImageIcon className="text-emerald-600" size={20} />;
    }
    if (type.includes('pdf') || name.endsWith('.pdf')) {
      return <FileText className="text-red-600" size={20} />;
    }
    if (type.includes('sheet') || type.includes('excel') || /\.(xlsx|xls|csv)$/.test(name)) {
      return <FileSpreadsheet className="text-teal-600" size={20} />;
    }
    return <FileText className="text-slate-600" size={20} />;
  };

  const getFileUrl = async (item: PurchaseAttachmentItem): Promise<string> => {
    if (item.url) return item.url;
    if (item.file) return URL.createObjectURL(item.file);

    try {
      // محاولة الحصول على رابط موقع من Supabase Storage
      const { data } = supabase.storage
        .from('finance_docs')
        .getPublicUrl(item.file_path);

      if (data?.publicUrl) return data.publicUrl;

      const { data: signed } = await supabase.storage
        .from('finance_docs')
        .createSignedUrl(item.file_path, 3600);

      return signed?.signedUrl || '';
    } catch (e) {
      console.error('Error generating attachment URL:', e);
      return '';
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    setUploading(true);

    try {
      const newItems: PurchaseAttachmentItem[] = [...attachments];

      for (const file of fileList) {
        if (file.size > 20 * 1024 * 1024) {
          showToast(`الملف "${file.name}" حجمه كبير جداً (الحد الأقصى 20 ميجابايت)`, 'warning');
          continue;
        }

        const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');

        if (invoiceId) {
          // الفاتورة محفوظة مسبقاً -> رفع فوري إلى Supabase Storage
          const timestamp = Date.now();
          const filePath = `purchase_invoices/${invoiceId}/${timestamp}_${cleanName}`;

          const { error: uploadErr } = await supabase.storage
            .from('finance_docs')
            .upload(filePath, file, { cacheControl: '3600', upsert: true });

          if (uploadErr) {
            console.warn('Supabase storage upload error, saving as staged file:', uploadErr.message);
            // Fallback: إضافة كملف محلي
            newItems.push({
              file_name: file.name,
              file_path: filePath,
              file_type: file.type,
              file_size: file.size,
              created_at: new Date().toISOString(),
              file: file,
              is_pending: true,
              url: URL.createObjectURL(file)
            });
            continue;
          }

          // حفظ في جدول purchase_invoice_attachments إذا كان موجوداً
          let insertedId = undefined;
          try {
            const { data: dbData } = await supabase
              .from('purchase_invoice_attachments')
              .insert({
                purchase_invoice_id: invoiceId,
                organization_id: organizationId || null,
                file_path: filePath,
                file_name: file.name,
                file_type: file.type,
                file_size: file.size
              })
              .select('id')
              .maybeSingle();

            if (dbData?.id) insertedId = dbData.id;
          } catch (dbErr) {
            console.warn('Could not insert to purchase_invoice_attachments table (non-blocking):', dbErr);
          }

          const { data: urlData } = supabase.storage.from('finance_docs').getPublicUrl(filePath);

          newItems.push({
            id: insertedId,
            file_name: file.name,
            file_path: filePath,
            file_type: file.type,
            file_size: file.size,
            created_at: new Date().toISOString(),
            url: urlData?.publicUrl,
            is_pending: false
          });
        } else {
          // الفاتورة جديدة لم تحفظ بعد -> حفظ كملف معلق يُرفع عند حفظ الفاتورة
          newItems.push({
            file_name: file.name,
            file_path: `staged/${Date.now()}_${cleanName}`,
            file_type: file.type,
            file_size: file.size,
            created_at: new Date().toISOString(),
            file: file,
            is_pending: true,
            url: URL.createObjectURL(file)
          });
        }
      }

      onChange(newItems);
      showToast(`تم إرفاق ${fileList.length} ملف بنجاح 📎`, 'success');
    } catch (err: any) {
      console.error('Error handling attachment upload:', err);
      showToast('حدث خطأ أثناء رفع المرفقات: ' + (err.message || ''), 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (index: number) => {
    const item = attachments[index];
    if (!item) return;

    if (!window.confirm(`هل أنت متأكد من حذف المرفق "${item.file_name}"؟`)) return;

    try {
      // إذا كان الملف مخزناً بالفعل في Supabase Storage
      if (item.file_path && !item.is_pending) {
        try {
          await supabase.storage.from('finance_docs').remove([item.file_path]);
        } catch (e) {
          console.warn('Storage deletion fallback:', e);
        }

        if (item.id) {
          try {
            await supabase.from('purchase_invoice_attachments').delete().eq('id', item.id);
          } catch (e) {
            console.warn('DB deletion fallback:', e);
          }
        }
      }

      const updated = attachments.filter((_, i) => i !== index);
      onChange(updated);
      showToast('تم حذف المرفق بنجاح 🗑️', 'info');
    } catch (err: any) {
      showToast('فشل حذف المرفق: ' + err.message, 'error');
    }
  };

  const handleOpenPreview = async (item: PurchaseAttachmentItem) => {
    const url = await getFileUrl(item);
    if (!url) {
      showToast('تعذر فتح رابط الملف', 'warning');
      return;
    }

    const isImage = (item.file_type || '').toLowerCase().includes('image') || 
                    /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(item.file_name);

    if (isImage) {
      setPreviewItem({ url, name: item.file_name, isImage: true });
    } else {
      window.open(url, '_blank');
    }
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
            <Paperclip size={18} />
          </div>
          <div>
            <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
              مرفقات الفاتورة (مستندات المورد والضرائب)
              {attachments.length > 0 && (
                <span className="bg-emerald-600 text-white text-[10px] font-mono px-2 py-0.5 rounded-full font-bold">
                  {attachments.length}
                </span>
              )}
            </h4>
            <p className="text-[11px] text-slate-500 font-medium">
              أرفق صورة الفاتورة الورقية الأصلية، بوليصة الشحن، أو إشعار الخصم للمطابقة الضريبية
            </p>
          </div>
        </div>

        {!readOnly && (
          <div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              multiple
              accept="image/*,.pdf,.xlsx,.xls,.docx,.doc"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 hover:border-emerald-400 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <Loader2 size={14} className="animate-spin text-emerald-600" />
                  <span>جاري الإرفاق...</span>
                </>
              ) : (
                <>
                  <Upload size={14} />
                  <span>إضافة مرفق ➕</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Files List / Badges */}
      {attachments.length === 0 ? (
        <div 
          onClick={() => !readOnly && fileInputRef.current?.click()}
          className={`border-2 border-dashed border-slate-200 hover:border-emerald-300 rounded-xl p-4 text-center text-slate-400 transition-colors ${!readOnly ? 'cursor-pointer' : ''}`}
        >
          <Paperclip size={24} className="mx-auto mb-1 text-slate-300" />
          <p className="text-xs font-bold text-slate-500">لا توجد مرفقات مسجلة لهذه الفاتورة</p>
          {!readOnly && (
            <p className="text-[11px] text-slate-400">انقر هنا لاختيار أو سحب وإفلات فواتير المورد (PDF أو صور)</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
          {attachments.map((item, idx) => (
            <div
              key={idx}
              className="bg-white border border-slate-200 rounded-xl p-2.5 flex items-center justify-between gap-2 shadow-xs hover:border-emerald-300 transition-all group"
            >
              <div 
                className="flex items-center gap-2 overflow-hidden cursor-pointer flex-1"
                onClick={() => handleOpenPreview(item)}
                title="اضغط للمعاينة"
              >
                <div className="p-1.5 bg-slate-50 rounded-lg group-hover:bg-emerald-50 transition-colors shrink-0">
                  {getFileIcon(item.file_type, item.file_name)}
                </div>
                <div className="overflow-hidden">
                  <p className="text-xs font-bold text-slate-800 truncate" title={item.file_name}>
                    {item.file_name}
                  </p>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                    <span>{formatFileSize(item.file_size)}</span>
                    {item.is_pending && (
                      <span className="text-amber-600 bg-amber-50 px-1 rounded font-sans font-bold">
                        معلق للحفظ ⏳
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleOpenPreview(item)}
                  className="p-1 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                  title="معاينة المرفق"
                >
                  <Eye size={15} />
                </button>

                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => handleDelete(idx)}
                    className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="حذف المرفق"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Image Preview Modal */}
      {previewItem && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-[99999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95">
            <div className="p-3 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <span className="text-xs font-bold text-slate-800 truncate">{previewItem.name}</span>
              <div className="flex items-center gap-2">
                <a
                  href={previewItem.url}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1.5 text-slate-600 hover:text-emerald-600 hover:bg-white rounded-lg transition-colors"
                  title="فتح في نافذة جديدة"
                >
                  <ExternalLink size={16} />
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewItem(null)}
                  className="p-1.5 text-slate-600 hover:text-red-600 hover:bg-white rounded-lg transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="p-4 flex items-center justify-center bg-slate-900/5 overflow-auto flex-1 min-h-[300px]">
              <img
                src={previewItem.url}
                alt={previewItem.name}
                className="max-h-[70vh] max-w-full object-contain rounded-lg shadow-sm"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseInvoiceAttachments;
