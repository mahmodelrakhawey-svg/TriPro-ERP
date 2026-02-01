import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { FileText, Download, Eye, Search, Filter, Paperclip } from 'lucide-react';

interface Attachment {
  id: string;
  fileName: string;
  filePath: string;
  fileType: string;
  fileSize: number;
  sourceType: 'journal' | 'receipt' | 'payment';
  sourceId: string;
  sourceReference?: string;
  date?: string;
}

const AttachmentsReport = () => {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  useEffect(() => {
    fetchAttachments();
  }, []);

  const fetchAttachments = async () => {
    setLoading(true);
    try {
      // Fetch Journal Attachments
      const { data: journalAtts } = await supabase
        .from('journal_attachments')
        .select('*, journal_entries(reference, transaction_date)');

      // Fetch Receipt Voucher Attachments
      const { data: receiptAtts } = await supabase
        .from('receipt_voucher_attachments')
        .select('*, receipt_vouchers(voucher_number, receipt_date)');

      // Fetch Payment Voucher Attachments
      const { data: paymentAtts } = await supabase
        .from('payment_voucher_attachments')
        .select('*, payment_vouchers(voucher_number, payment_date)');

      const normalized: Attachment[] = [];

      if (journalAtts) {
        journalAtts.forEach((att: any) => {
          normalized.push({
            id: att.id,
            fileName: att.file_name,
            filePath: att.file_path,
            fileType: att.file_type,
            fileSize: att.file_size,
            sourceType: 'journal',
            sourceId: att.journal_entry_id,
            sourceReference: att.journal_entries?.reference,
            date: att.journal_entries?.transaction_date
          });
        });
      }

      if (receiptAtts) {
        receiptAtts.forEach((att: any) => {
          normalized.push({
            id: att.id,
            fileName: att.file_name,
            filePath: att.file_path,
            fileType: att.file_type,
            fileSize: att.file_size,
            sourceType: 'receipt',
            sourceId: att.voucher_id,
            sourceReference: att.receipt_vouchers?.voucher_number,
            date: att.receipt_vouchers?.receipt_date
          });
        });
      }

      if (paymentAtts) {
        paymentAtts.forEach((att: any) => {
          normalized.push({
            id: att.id,
            fileName: att.file_name,
            filePath: att.file_path,
            fileType: att.file_type,
            fileSize: att.file_size,
            sourceType: 'payment',
            sourceId: att.voucher_id,
            sourceReference: att.payment_vouchers?.voucher_number,
            date: att.payment_vouchers?.payment_date
          });
        });
      }

      // Sort by date descending (if available) or ID
      normalized.sort((a, b) => {
        const dateA = a.date ? new Date(a.date).getTime() : 0;
        const dateB = b.date ? new Date(b.date).getTime() : 0;
        return dateB - dateA;
      });

      setAttachments(normalized);
    } catch (error) {
      console.error('Error fetching attachments:', error);
    } finally {
      setLoading(false);
    }
  };

  const downloadAttachment = async (path: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage.from('documents').download(path);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading:', err);
      console.error('فشل تحميل الملف');
    }
  };

  const previewAttachment = (path: string) => {
    const { data } = supabase.storage.from('documents').getPublicUrl(path);
    if (data.publicUrl) {
        window.open(data.publicUrl, '_blank');
    }
  };

  const filteredAttachments = attachments.filter(att => {
    const matchesSearch = att.fileName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (att.sourceReference && att.sourceReference.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesFilter = filterType === 'all' || att.sourceType === filterType;
    return matchesSearch && matchesFilter;
  });

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getSourceLabel = (type: string) => {
    switch(type) {
      case 'journal': return 'قيد يومية';
      case 'receipt': return 'سند قبض';
      case 'payment': return 'سند صرف';
      default: return type;
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Paperclip className="text-blue-600" /> تقرير المرفقات
        </h2>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-4 items-center justify-between">
        <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute right-3 top-3 text-slate-400" size={18} />
            <input 
                type="text" 
                placeholder="بحث باسم الملف أو رقم المستند..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pr-10 pl-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
            />
        </div>
        <div className="flex items-center gap-2">
            <Filter className="text-slate-400" size={18} />
            <select 
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 bg-white"
            >
                <option value="all">جميع الأنواع</option>
                <option value="journal">قيود يومية</option>
                <option value="receipt">سندات قبض</option>
                <option value="payment">سندات صرف</option>
            </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
            <table className="w-full text-right">
                <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                        <th className="px-6 py-4 text-sm font-bold text-slate-700">اسم الملف</th>
                        <th className="px-6 py-4 text-sm font-bold text-slate-700">نوع المستند</th>
                        <th className="px-6 py-4 text-sm font-bold text-slate-700">رقم المستند</th>
                        <th className="px-6 py-4 text-sm font-bold text-slate-700">التاريخ</th>
                        <th className="px-6 py-4 text-sm font-bold text-slate-700">الحجم</th>
                        <th className="px-6 py-4 text-sm font-bold text-slate-700">إجراءات</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {loading ? (
                        <tr>
                            <td colSpan={6} className="px-6 py-8 text-center text-slate-500">جاري التحميل...</td>
                        </tr>
                    ) : filteredAttachments.length === 0 ? (
                        <tr>
                            <td colSpan={6} className="px-6 py-8 text-center text-slate-500">لا توجد مرفقات</td>
                        </tr>
                    ) : (
                        filteredAttachments.map((att) => (
                            <tr key={`${att.sourceType}-${att.id}`} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4 text-sm text-slate-700 font-medium flex items-center gap-2">
                                    <FileText size={16} className="text-blue-500" />
                                    {att.fileName}
                                </td>
                                <td className="px-6 py-4 text-sm text-slate-600">
                                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                        att.sourceType === 'journal' ? 'bg-purple-100 text-purple-700' :
                                        att.sourceType === 'receipt' ? 'bg-green-100 text-green-700' :
                                        'bg-orange-100 text-orange-700'
                                    }`}>
                                        {getSourceLabel(att.sourceType)}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-sm text-slate-600">{att.sourceReference || '-'}</td>
                                <td className="px-6 py-4 text-sm text-slate-600">{att.date || '-'}</td>
                                <td className="px-6 py-4 text-sm text-slate-600" dir="ltr">{formatFileSize(att.fileSize)}</td>
                                <td className="px-6 py-4 text-sm">
                                    <div className="flex items-center gap-2">
                                        <button 
                                            onClick={() => previewAttachment(att.filePath)}
                                            className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                            title="معاينة"
                                        >
                                            <Eye size={18} />
                                        </button>
                                        <button 
                                            onClick={() => downloadAttachment(att.filePath, att.fileName)}
                                            className="p-1 text-slate-500 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                                            title="تحميل"
                                        >
                                            <Download size={18} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
      </div>
    </div>
  );
};

export default AttachmentsReport;