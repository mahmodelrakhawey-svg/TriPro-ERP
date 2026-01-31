import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { FileMinus, Loader2, Edit, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const CreditNoteList = () => {
  const { currentUser } = useAccounting();
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchNotes = async () => {
      setLoading(true);
      if (currentUser?.role === 'demo') {
          setNotes([
              { id: 'demo-cn1', note_date: new Date().toISOString().split('T')[0], credit_note_number: 'CN-DEMO-001', customer: { name: 'شركة الأفق للتجارة' }, total_amount: 1500, status: 'posted' },
              { id: 'demo-cn2', note_date: new Date().toISOString().split('T')[0], credit_note_number: 'CN-DEMO-002', customer: { name: 'مؤسسة النور' }, total_amount: 500, status: 'draft' }
          ]);
          setLoading(false);
          return;
      }

      try {
        const { data, error } = await supabase
          .from('credit_notes')
          .select('*, customer:customers(name)')
          .order('note_date', { ascending: false });

        if (error) throw error;
        setNotes(data || []);
      } catch (err: any) {
        alert('فشل تحميل القائمة: ' + err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchNotes();
  }, []);

  const handleEdit = (note: any) => {
    if (note.status === 'posted') {
      showToast('لا يمكن تعديل إشعار مرحل.', 'error');
      return;
    }
    navigate('/credit-note', { state: { noteToEdit: note } });
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
        <FileMinus className="text-red-600" /> سجل الإشعارات الدائنة
      </h2>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-right">
          <thead className="bg-slate-50 text-slate-600 font-bold text-sm">
            <tr>
              <th className="p-4">التاريخ</th>
              <th className="p-4">رقم الإشعار</th>
              <th className="p-4">العميل</th>
              <th className="p-4">الإجمالي</th>
              <th className="p-4">الحالة</th>
              <th className="p-4 text-center">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={6} className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" /></td></tr>
            ) : notes.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-slate-400">لا توجد إشعارات مسجلة.</td></tr>
            ) : (
              notes.map(note => (
                <tr key={note.id} className="hover:bg-slate-50">
                  <td className="p-4">{note.note_date}</td>
                  <td className="p-4 font-mono">{note.credit_note_number}</td>
                  <td className="p-4 font-bold">{note.customer?.name}</td>
                  <td className="p-4 font-mono font-bold text-red-600">{note.total_amount.toLocaleString()}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${note.status === 'posted' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                      {note.status === 'posted' ? 'مرحل' : 'مسودة'}
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    <button onClick={() => handleEdit(note)} disabled={note.status === 'posted'} className="p-2 text-blue-600 hover:bg-blue-100 rounded-full disabled:opacity-50 disabled:cursor-not-allowed">
                      <Edit size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CreditNoteList;