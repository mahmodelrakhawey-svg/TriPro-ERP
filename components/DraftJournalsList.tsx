import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { useAccounting } from '../context/AccountingContext';
import { JournalEntry } from '../types';
import { Edit, CheckCircle, FileText, Clock, Copy } from 'lucide-react';

const DraftJournalsList = () => {
  const { accounts, refreshData } = useAccounting();
  const [drafts, setDrafts] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchDrafts = async () => {
    try {
      const { data, error } = await supabase
        .from('journal_entries')
        .select('*, journal_lines(*)')
        .eq('status', 'draft')
        .order('transaction_date', { ascending: false });

      if (error) throw error;

      if (data) {
        const formattedDrafts: any[] = data.map((entry: any) => ({
          id: entry.id,
          date: entry.transaction_date,
          description: entry.description,
          reference: entry.reference,
          status: entry.status,
          lines: entry.journal_lines.map((line: any) => ({
            id: line.id,
            accountId: line.account_id,
            accountName: accounts.find(a => a.id === line.account_id)?.name || '',
            debit: line.debit,
            credit: line.credit,
            description: line.description,
            costCenterId: line.cost_center_id
          }))
        }));
        setDrafts(formattedDrafts);
      }
    } catch (error) {
      console.error('Error fetching drafts:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accounts.length > 0) fetchDrafts();
  }, [accounts]);

  const handlePost = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من ترحيل هذا القيد؟ لا يمكن تعديله بعد الترحيل.')) return;
    
    try {
      const { error } = await supabase
        .from('journal_entries')
        .update({ status: 'posted', is_posted: true })
        .eq('id', id);

      if (error) throw error;

      alert('تم ترحيل القيد بنجاح');
      await refreshData();
      fetchDrafts(); // تحديث القائمة
    } catch (error) {
      console.error('Error posting entry:', error);
      alert('حدث خطأ أثناء الترحيل');
    }
  };

  const handleEdit = (entry: JournalEntry) => {
    // الانتقال إلى نموذج القيد مع تمرير بيانات القيد للتعديل
    navigate('/journal', { state: { entryToEdit: entry } });
  };

  const handleDuplicate = (entry: JournalEntry) => {
    navigate('/journal', { state: { entryToDuplicate: entry } });
  };

  if (loading) return <div className="p-8 text-center text-gray-500">جاري التحميل...</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Clock className="text-orange-600" /> مسودات القيود
          </h2>
          <p className="text-slate-500">القيود المحفوظة مؤقتاً بانتظار المراجعة والترحيل</p>
        </div>
        <button 
            onClick={() => navigate('/journal')}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-indigo-700 transition-colors"
        >
            + قيد جديد
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {drafts.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
                لا توجد مسودات حالياً.
            </div>
        ) : (
            <table className="w-full text-right">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-bold uppercase">
                <tr>
                <th className="p-4">التاريخ</th>
                <th className="p-4">البيان</th>
                <th className="p-4">المرجع</th>
                <th className="p-4">الإجمالي</th>
                <th className="p-4 text-center">إجراءات</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {drafts.map((entry) => {
                const totalAmount = entry.lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
                return (
                    <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4 font-medium">{new Date(entry.date).toLocaleDateString('ar-EG')}</td>
                    <td className="p-4 text-slate-700">{entry.description}</td>
                    <td className="p-4 text-slate-500 font-mono text-sm">{entry.reference || '-'}</td>
                    <td className="p-4 font-bold text-slate-900">{totalAmount.toLocaleString()}</td>
                    <td className="p-4 flex justify-center gap-2">
                        <button 
                        onClick={() => handleEdit(entry)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm font-bold"
                        >
                        <Edit size={16} /> تعديل
                        </button>
                        <button 
                        onClick={() => handleDuplicate(entry)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 transition-colors text-sm font-bold"
                        title="تكرار القيد"
                        >
                        <Copy size={16} /> نسخ
                        </button>
                        <button 
                        onClick={() => handlePost(entry.id)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors text-sm font-bold"
                        >
                        <CheckCircle size={16} /> ترحيل
                        </button>
                    </td>
                    </tr>
                );
                })}
            </tbody>
            </table>
        )}
      </div>
    </div>
  );
};

export default DraftJournalsList;