import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  FilePlus, Save, Loader2, Calculator, Printer, Truck, Calendar, 
  Trash2, Plus, ChevronRight, ChevronLeft, ChevronsRight, ChevronsLeft, List
} from 'lucide-react';
import { createDebitNoteSchema } from '../../utils/validationSchemas';
import { DebitNotePrint } from './DebitNotePrint';

const DebitNoteForm = () => {
  const { settings, suppliers, currentUser } = useAccounting();
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();

  const [formData, setFormData] = useState({
    supplierId: '',
    date: new Date().toISOString().split('T')[0],
    amount: 0,
    isTaxable: settings?.enableTax ?? true,
    notes: '',
    noteNumber: '',
    originalInvoiceNumber: '',
    status: 'draft'
  });

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Navigation & Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteIds, setNoteIds] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [loadingNote, setLoadingNote] = useState(false);
  const [noteToPrint, setNoteToPrint] = useState<any | null>(null);
  const [companySettings, setCompanySettings] = useState<any>(null);

  useEffect(() => {
    supabase.rpc('get_current_company_settings').maybeSingle().then(({ data }) => {
      if (data) setCompanySettings(data);
    });
  }, []);

  // جلب كافة معرفات الإشعارات المدينة للتنقل
  const fetchNoteIds = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id;
      if (!userOrgId) return;

      const { data, error } = await supabase
        .from('debit_notes')
        .select('id')
        .eq('organization_id', userOrgId)
        .order('note_date', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;
      const ids = (data || []).map(n => n.id);
      setNoteIds(ids);
    } catch (err) {
      console.error('Error fetching debit note IDs:', err);
    }
  };

  useEffect(() => {
    fetchNoteIds();
  }, []);

  const loadNoteById = async (id: string) => {
    setLoadingNote(true);
    try {
      const { data: note, error } = await supabase
        .from('debit_notes')
        .select('*, suppliers(id, name, phone)')
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!note) throw new Error('الإشعار غير موجود');

      setEditingId(note.id);
      setFormData({
        supplierId: note.supplier_id || '',
        date: note.note_date || new Date().toISOString().split('T')[0],
        amount: Number(note.amount_before_tax) || 0,
        isTaxable: Number(note.tax_amount || 0) > 0,
        notes: note.notes || '',
        noteNumber: note.debit_note_number || '',
        originalInvoiceNumber: note.original_invoice_number || '',
        status: note.status || 'posted'
      });

      const idx = noteIds.indexOf(id);
      if (idx !== -1) setCurrentIndex(idx);

    } catch (err: any) {
      console.error('Error loading debit note:', err);
      showToast('فشل تحميل الإشعار المدين: ' + err.message, 'error');
    } finally {
      setLoadingNote(false);
    }
  };

  useEffect(() => {
    if (location.state && (location.state as any).noteToEdit) {
      const passed = (location.state as any).noteToEdit;
      loadNoteById(passed.id);
    } else if (location.state) {
      setFormData(prev => ({
        ...prev,
        supplierId: location.state.supplierId || '',
        amount: location.state.amount || 0,
        isTaxable: location.state.isTaxable !== undefined ? location.state.isTaxable : (settings?.enableTax ?? true),
        notes: location.state.notes || '',
        originalInvoiceNumber: location.state.originalInvoiceNumber || ''
      }));
    }
  }, [location.state]);

  const handleNavigate = (direction: 'first' | 'prev' | 'next' | 'last') => {
    if (noteIds.length === 0) {
      showToast('لا توجد إشعارات مدينة للتنقل بينها', 'info');
      return;
    }

    let targetIdx = currentIndex;
    if (direction === 'first') {
      targetIdx = 0;
    } else if (direction === 'last') {
      targetIdx = noteIds.length - 1;
    } else if (direction === 'prev') {
      if (currentIndex <= 0) {
        targetIdx = 0;
        showToast('هذا هو أول إشعار مدين مسجل', 'info');
      } else {
        targetIdx = currentIndex - 1;
      }
    } else if (direction === 'next') {
      if (currentIndex >= noteIds.length - 1 || currentIndex === -1) {
        targetIdx = noteIds.length - 1;
        showToast('هذا هو آخر إشعار مدين مسجل', 'info');
      } else {
        targetIdx = currentIndex + 1;
      }
    }

    if (targetIdx >= 0 && targetIdx < noteIds.length) {
      loadNoteById(noteIds[targetIdx]);
    }
  };

  const handleNewNote = () => {
    setEditingId(null);
    setCurrentIndex(-1);
    setFormData({
      supplierId: '',
      date: new Date().toISOString().split('T')[0],
      amount: 0,
      isTaxable: settings?.enableTax ?? true,
      notes: '',
      noteNumber: '',
      originalInvoiceNumber: '',
      status: 'draft'
    });
    showToast('تم فتح نموذج إشعار مدين جديد ➕', 'info');
  };

  // @ts-ignore
  const systemVatRate = ((settings.vatRate !== undefined && settings.vatRate !== null ? Number(settings.vatRate) : (settings.vat_rate ? settings.vat_rate * 100 : 15)) / 100);
  const isTaxEnabled = Boolean(settings?.enableTax && formData.isTaxable);
  const taxRate = isTaxEnabled ? systemVatRate : 0;
  const taxAmount = formData.amount * taxRate;
  const totalAmount = formData.amount + taxAmount;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validationResult = createDebitNoteSchema.safeParse(formData);
    if (!validationResult.success) {
        showToast(validationResult.error.issues[0].message, 'warning');
        return;
    }
    
    setSaving(true);

    const { data: { session } } = await supabase.auth.getSession();
    const userOrgId = session?.user?.user_metadata?.org_id;

    if (!userOrgId) throw new Error("تعذر تحديد المنظمة.");

    if (currentUser?.role === 'demo') {
        showToast('تم حفظ الإشعار المدين وترحيل القيد بنجاح ✅ (محاكاة)', 'success');
        setSaving(false);
        return;
    }

    try {
      const noteNumber = formData.noteNumber || `DN-${Date.now().toString().slice(-6)}`;
      let noteId = editingId;

      if (editingId) {
        const { error: updateError } = await supabase.from('debit_notes').update({
          supplier_id: formData.supplierId,
          note_date: formData.date,
          amount_before_tax: formData.amount,
          tax_amount: taxAmount,
          total_amount: totalAmount,
          notes: formData.notes,
          original_invoice_number: formData.originalInvoiceNumber
        }).eq('id', editingId);

        if (updateError) throw updateError;
        showToast('تم تحديث الإشعار المدين بنجاح ✅', 'success');

      } else {
        // 1. حفظ الإشعار كمسودة
        const { data: note, error: noteError } = await supabase.from('debit_notes').insert({
          organization_id: userOrgId,
          debit_note_number: noteNumber,
          supplier_id: formData.supplierId,
          note_date: formData.date,
          amount_before_tax: formData.amount,
          tax_amount: taxAmount,
          total_amount: totalAmount,
          notes: formData.notes,
          status: 'draft',
          original_invoice_number: formData.originalInvoiceNumber
        }).select().single();

        if (noteError) throw noteError;
        noteId = note.id;

        // 2. استدعاء الدالة الآمنة للترحيل
        const { error: rpcError } = await supabase.rpc('approve_debit_note', { p_note_id: note.id });
        if (rpcError) throw rpcError;

        showToast('تم حفظ الإشعار المدين وترحيل القيد بنجاح ✅', 'success');
      }

      await fetchNoteIds();
      if (noteId) {
        loadNoteById(noteId);
      }

    } catch (error: any) {
      console.error(error);
      showToast('خطأ: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCurrent = async () => {
    if (!editingId) return;

    if (!window.confirm(`هل أنت متأكد من حذف الإشعار المدين رقم (${formData.noteNumber})؟\nسيتم إلغاء القيد المحاسبي وعكس أثره بالكامل.`)) {
      return;
    }

    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id;

      await supabase.from('journal_entries').delete().eq('organization_id', userOrgId).eq('reference', formData.noteNumber);
      const { error: delErr } = await supabase.from('debit_notes').delete().eq('id', editingId);
      if (delErr) throw delErr;

      showToast('تم حذف الإشعار المدين وعكس القيد بنجاح ✅', 'success');

      const newIds = noteIds.filter(id => id !== editingId);
      setNoteIds(newIds);

      if (newIds.length > 0) {
        const nextId = newIds[Math.min(currentIndex, newIds.length - 1)];
        loadNoteById(nextId);
      } else {
        handleNewNote();
      }

    } catch (err: any) {
      console.error('Error deleting debit note:', err);
      showToast('فشل حذف الإشعار المدين: ' + err.message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handlePrintCurrent = () => {
    setNoteToPrint({
      noteNumber: formData.noteNumber,
      date: formData.date,
      supplierName: suppliers.find(s => s.id === formData.supplierId)?.name || 'مورد عام',
      originalInvoiceNumber: formData.originalInvoiceNumber,
      notes: formData.notes,
      amountBeforeTax: formData.amount,
      taxAmount: taxAmount,
      totalAmount: totalAmount
    });

    setTimeout(() => {
      window.print();
      setNoteToPrint(null);
    }, 200);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in">
      
      {/* 🚀 Header & Navigation Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
        
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
            <FilePlus size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
              {editingId ? `إشعار مدين: ${formData.noteNumber}` : 'إشعار مدين جديد'}
              {editingId && (
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-blue-100 text-blue-700">
                  معتمد ومرحل ✅
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-400 font-bold">تسوية حسابات الموردين وتخفيض المستحقات وإثبات الخصومات</p>
          </div>
        </div>

        {/* 🧭 أسهم التنقل بين الإشعارات */}
        <div className="flex items-center gap-1 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
          <button 
            type="button" 
            onClick={() => handleNavigate('first')} 
            disabled={noteIds.length === 0 || currentIndex === 0} 
            title="أول إشعار"
            className="p-2 text-slate-600 hover:bg-white hover:text-blue-600 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronsRight size={18} />
          </button>
          
          <button 
            type="button" 
            onClick={() => handleNavigate('prev')} 
            disabled={noteIds.length === 0 || currentIndex <= 0} 
            title="الإشعار السابق"
            className="p-2 text-slate-600 hover:bg-white hover:text-blue-600 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronRight size={18} />
          </button>

          {/* Record Counter */}
          <div className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-mono font-black text-slate-700 select-none">
            {loadingNote ? (
              <Loader2 size={14} className="animate-spin text-blue-600" />
            ) : editingId && currentIndex !== -1 ? (
              <span>{currentIndex + 1} / {noteIds.length}</span>
            ) : (
              <span className="text-blue-600 font-bold">جديد ➕</span>
            )}
          </div>

          <button 
            type="button" 
            onClick={() => handleNavigate('next')} 
            disabled={noteIds.length === 0 || currentIndex >= noteIds.length - 1 || currentIndex === -1} 
            title="الإشعار التالي"
            className="p-2 text-slate-600 hover:bg-white hover:text-blue-600 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronLeft size={18} />
          </button>

          <button 
            type="button" 
            onClick={() => handleNavigate('last')} 
            disabled={noteIds.length === 0 || currentIndex >= noteIds.length - 1 || currentIndex === -1} 
            title="آخر إشعار"
            className="p-2 text-slate-600 hover:bg-white hover:text-blue-600 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronsLeft size={18} />
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button 
            type="button" 
            onClick={() => navigate('/debit-notes-list')} 
            className="bg-slate-100 text-slate-700 hover:bg-slate-200 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
            title="عرض سجل الإشعارات المدينة"
          >
            <List size={16} /> سجل الإشعارات
          </button>

          <button 
            type="button" 
            onClick={handleNewNote} 
            className="bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
            title="بدء إشعار مدين جديد"
          >
            <Plus size={16} /> جديد
          </button>

          {editingId && (
            <>
              <button 
                type="button" 
                onClick={handlePrintCurrent} 
                className="bg-slate-800 text-white hover:bg-slate-700 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                title="طباعة الإشعار المدين"
              >
                <Printer size={16} /> طباعة
              </button>

              <button 
                type="button" 
                onClick={handleDeleteCurrent} 
                disabled={deleting} 
                className="bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                title="حذف الإشعار المدين"
              >
                {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} حذف
              </button>
            </>
          )}

          <button 
            type="button" 
            onClick={handleSave} 
            disabled={saving} 
            className="bg-blue-600 text-white px-5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} 
            {editingId ? 'حفظ التعديل' : 'حفظ وترحيل'}
          </button>
        </div>
      </div>

      {/* Main Form Body */}
      <form onSubmit={handleSave} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">المورد <span className="text-red-500">*</span></label>
            <select 
              required
              className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm font-bold outline-none focus:border-blue-500" 
              value={formData.supplierId} 
              onChange={e => setFormData({...formData, supplierId: e.target.value})}
            >
              <option value="">اختر المورد...</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ الإشعار <span className="text-red-500">*</span></label>
            <input 
              type="date" 
              required
              className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm font-bold outline-none focus:border-blue-500" 
              value={formData.date} 
              onChange={e => setFormData({...formData, date: e.target.value})} 
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">المبلغ قبل الضريبة <span className="text-red-500">*</span></label>
            <input 
              type="number" 
              step="any"
              min="0.01"
              required
              placeholder="0.00"
              className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm font-mono font-bold text-blue-700 outline-none focus:border-blue-500" 
              value={formData.amount || ''} 
              onChange={e => setFormData({...formData, amount: Number(e.target.value)})} 
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">رقم الفاتورة الأصلية (اختياري)</label>
            <input 
              type="text" 
              placeholder="مثال: PI-100234"
              className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm font-mono font-bold outline-none focus:border-blue-500" 
              value={formData.originalInvoiceNumber} 
              onChange={e => setFormData({...formData, originalInvoiceNumber: e.target.value})} 
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-700 mb-1">سبب الإشعار / البيان <span className="text-red-500">*</span></label>
            <textarea 
              rows={2}
              required
              placeholder="أدخل سبب التسوية أو الخصم المكتسب من المورد..."
              className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm outline-none focus:border-blue-500" 
              value={formData.notes} 
              onChange={e => setFormData({...formData, notes: e.target.value})} 
            />
          </div>

          {settings?.enableTax && (
            <div className="md:col-span-2 flex items-center gap-2 pt-2">
              <input 
                type="checkbox" 
                id="isDebitTaxable"
                checked={formData.isTaxable}
                onChange={e => setFormData({...formData, isTaxable: e.target.checked})}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <label htmlFor="isDebitTaxable" className="text-xs font-bold text-slate-700 cursor-pointer">
                خاضع لضريبة القيمة المضافة ({settings.vatRate || 14}%)
              </label>
            </div>
          )}

        </div>

        {/* Calculation Summary Box */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-xs text-slate-500">
            سيتم إنشاء قيد اليومية تلقائياً: <span className="font-bold text-slate-800">من ح/ الموردين إلى ح/ مردودات ومسموحات المشتريات / الخصم المكتسب</span>
          </div>
          <div className="flex items-center gap-6">
            {isTaxEnabled && (
              <div className="text-xs font-bold text-slate-600">
                قيمة الضريبة: <span className="font-mono text-blue-700">{taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {settings.currency || 'ج.م'}</span>
              </div>
            )}
            <div className="text-sm font-black text-blue-900 flex items-center gap-2">
              <span>إجمالي الإشعار المدين:</span>
              <span className="font-mono text-lg" dir="ltr">{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {settings.currency || 'ج.م'}</span>
            </div>
          </div>
        </div>
      </form>

      {/* Hidden printable component */}
      {noteToPrint && (
        <DebitNotePrint noteData={noteToPrint} companySettings={companySettings} />
      )}
    </div>
  );
};

export default DebitNoteForm;
