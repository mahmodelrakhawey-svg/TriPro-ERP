import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { Landmark, Plus, ArrowRight, ArrowUpRight, ArrowDownLeft, Check, X, Ban, Calendar, Search, Loader2, Upload, Paperclip, Eye, Download } from 'lucide-react';

export const ChequesPage = () => {
  const { addCheque, updateChequeStatus, currentUser } = useAccounting();
  const [activeTab, setActiveTab] = useState<'outgoing' | 'incoming'>('outgoing');
  const [cheques, setCheques] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [banks, setBanks] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [showAttachmentsModal, setShowAttachmentsModal] = useState(false);
  const [currentAttachments, setCurrentAttachments] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Modal States
  const [showAddModal, setShowModal] = useState(false);
  const [showCashModal, setShowCashModal] = useState(false);
  const [selectedCheque, setSelectedCheque] = useState<any>(null);

  // Form Data
  const [formData, setFormData] = useState({
    chequeNumber: '',
    amount: 0,
    dueDate: new Date().toISOString().split('T')[0],
    partyId: '',
    bankName: '', // اسم البنك المكتوب في الشيك
    notes: ''
  });
  const [selectedBankId, setSelectedBankId] = useState(''); // البنك الذي سيتم الصرف منه

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);

    if (currentUser?.role === 'demo') {
        setCheques([
            { id: 'demo-chq-1', cheque_number: 'CHQ-001', due_date: new Date().toISOString().split('T')[0], party_name: 'مورد تجريبي', bank_name: 'بنك الرياض', amount: 5000, status: 'issued', type: 'outgoing' },
            { id: 'demo-chq-2', cheque_number: 'CHQ-002', due_date: new Date().toISOString().split('T')[0], party_name: 'عميل تجريبي', bank_name: 'البنك الأهلي', amount: 10000, status: 'received', type: 'incoming' }
        ]);
        setSuppliers([{id: 'demo-s1', name: 'مورد تجريبي'}]);
        setCustomers([{id: 'demo-c1', name: 'عميل تجريبي'}]);
        setBanks([{id: 'demo-b1', name: 'بنك الرياض', code: '10102'}]);
        setLoading(false);
        return;
    }

    // 1. Fetch Cheques
    const { data: chequesData } = await supabase.from('cheques').select('*, cheque_attachments(*)').order('created_at', { ascending: false });
    if (chequesData) setCheques(chequesData);

    // 2. Fetch Parties
    const { data: supps } = await supabase.from('suppliers').select('id, name');
    if (supps) setSuppliers(supps);
    
    const { data: custs } = await supabase.from('customers').select('id, name');
    if (custs) setCustomers(custs);

    // 3. Fetch Bank Accounts
    const { data: accounts } = await supabase.from('accounts').select('id, name, code').ilike('name', '%بنك%');
    if (accounts) setBanks(accounts);
    
    setLoading(false);
  };

  const handleAddCheque = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.partyId || formData.amount <= 0) return alert('البيانات ناقصة');

    try {
        const partyList = activeTab === 'outgoing' ? suppliers : customers;
        const party = partyList.find(p => p.id === formData.partyId);

        await addCheque({
            cheque_number: formData.chequeNumber,
            type: activeTab,
            amount: formData.amount,
            due_date: formData.dueDate,
            party_id: formData.partyId,
            party_name: party?.name,
            bank_name: formData.bankName,
            notes: formData.notes,
            status: activeTab === 'outgoing' ? 'issued' : 'received',
            attachments: attachments
        });

        setShowModal(false);
        setFormData({ chequeNumber: '', amount: 0, dueDate: new Date().toISOString().split('T')[0], partyId: '', bankName: '', notes: '' });
        setAttachments([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
        fetchData();

    } catch (err: any) {
        alert('خطأ: ' + err.message);
    }
  };

  const handleCashCheque = async () => {
      if (!selectedCheque || !selectedBankId) return;

      try {
        // تحديد الحالة المناسبة (صرف للصادر / تحصيل للوارد)
        const newStatus = activeTab === 'outgoing' ? 'cashed' : 'collected';
        const actionDate = new Date().toISOString().split('T')[0];

        // استخدام الدالة المركزية من السياق لضمان التحديث الصحيح وإنشاء القيود
        await updateChequeStatus(selectedCheque.id, newStatus, actionDate, selectedBankId);
        
        setShowCashModal(false);
        fetchData(); // تحديث القائمة المحلية
      } catch (err: any) {
        alert('خطأ: ' + err.message);
      }
  };

  const handleViewAttachments = (cheque: any) => {
      setCurrentAttachments(cheque.cheque_attachments || []);
      setShowAttachmentsModal(true);
  };

  const previewAttachment = (path: string) => {
    const { data } = supabase.storage.from('documents').getPublicUrl(path);
    if (data.publicUrl) window.open(data.publicUrl, '_blank');
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
        alert('فشل تحميل الملف');
    }
  };

  const filteredCheques = cheques.filter(c => c.type === activeTab);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Landmark className="text-indigo-600" /> أوراق القبض والدفع (الشيكات)
            </h2>
            <p className="text-slate-500">إدارة الشيكات الصادرة للموردين والواردة من العملاء</p>
        </div>
        <button onClick={() => setShowModal(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-bold hover:bg-indigo-700">
            <Plus size={18} /> تسجيل شيك جديد
        </button>
      </div>

      {/* Tabs */}
      <div className="flex bg-white p-1 rounded-xl border border-slate-200 w-fit">
          <button 
            onClick={() => setActiveTab('outgoing')}
            className={`px-6 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-all ${activeTab === 'outgoing' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
          >
              <ArrowUpRight size={16} /> أوراق الدفع (للموردين)
          </button>
          <button 
            onClick={() => setActiveTab('incoming')}
            className={`px-6 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-all ${activeTab === 'incoming' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
          >
              <ArrowDownLeft size={16} /> أوراق القبض (من العملاء)
          </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-right">
              <thead className="bg-slate-50 text-slate-600 font-bold text-sm">
                  <tr>
                      <th className="p-4">رقم الشيك</th>
                      <th className="p-4">تاريخ الاستحقاق</th>
                      <th className="p-4">{activeTab === 'outgoing' ? 'المورد' : 'العميل'}</th>
                      <th className="p-4">البنك</th>
                      <th className="p-4">المبلغ</th>
                      <th className="p-4">الحالة</th>
                      <th className="p-4 text-center">إجراءات</th>
                  </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                  {filteredCheques.map(cheque => (
                      <tr key={cheque.id} className="hover:bg-slate-50">
                          <td className="p-4 font-mono font-bold text-indigo-600">{cheque.cheque_number}</td>
                          <td className="p-4">{cheque.due_date}</td>
                          <td className="p-4 font-bold">{cheque.party_name}</td>
                          <td className="p-4 text-slate-500">{cheque.bank_name}</td>
                          <td className="p-4 font-bold">{cheque.amount.toLocaleString()}</td>
                          <td className="p-4">
                              <span className={`px-2 py-1 rounded text-xs font-bold ${
                                  cheque.status === 'cashed' ? 'bg-emerald-100 text-emerald-700' : 
                                  cheque.status === 'rejected' ? 'bg-red-100 text-red-700' : 
                                  'bg-amber-100 text-amber-700'
                              }`}>
                                  {cheque.status === 'issued' ? 'صادر (لم يصرف)' : 
                                   cheque.status === 'received' ? 'في الحافظة' :
                                   cheque.status === 'cashed' ? 'تم الصرف/التحصيل' : cheque.status}
                              </span>
                          </td>
                          <td className="p-4 flex justify-center gap-2">                              
                              {cheque.status === 'received' && activeTab === 'incoming' && (
                                  <button 
                                    onClick={() => { setSelectedCheque(cheque); setShowCashModal(true); }}
                                    className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded text-xs font-bold hover:bg-emerald-100"
                                  >
                                      تأكيد التحصيل
                                  </button>
                              )}
                              {cheque.status === 'issued' && activeTab === 'outgoing' && (
                                  <button 
                                    onClick={() => { setSelectedCheque(cheque); setShowCashModal(true); }}
                                    className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded text-xs font-bold hover:bg-emerald-100"
                                  >
                                      تأكيد الصرف
                                  </button>
                              )}
                              {cheque.cheque_attachments && cheque.cheque_attachments.length > 0 && (
                                  <button 
                                    onClick={() => handleViewAttachments(cheque)}
                                    className="bg-blue-50 text-blue-600 px-2 py-1 rounded text-xs font-bold hover:bg-blue-100 flex items-center gap-1"
                                    title="عرض المرفقات"
                                  >
                                      <Paperclip size={14} />
                                  </button>
                              )}
                          </td>
                      </tr>
                  ))}
                  {filteredCheques.length === 0 && (
                      <tr><td colSpan={7} className="p-8 text-center text-slate-400">لا توجد شيكات مسجلة</td></tr>
                  )}
              </tbody>
          </table>
      </div>

      {/* Add Modal */}
      {showAddModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="font-bold text-xl">تسجيل شيك {activeTab === 'outgoing' ? 'صادر' : 'وارد'}</h3>
                      <button onClick={() => setShowModal(false)}><X className="text-slate-400 hover:text-red-500" /></button>
                  </div>
                  <form onSubmit={handleAddCheque} className="space-y-4">
                      <div>
                          <label className="block text-sm font-bold mb-1">{activeTab === 'outgoing' ? 'المورد' : 'العميل'}</label>
                          <select required className="w-full border rounded p-2" value={formData.partyId} onChange={e => setFormData({...formData, partyId: e.target.value})}>
                              <option value="">-- اختر --</option>
                              {(activeTab === 'outgoing' ? suppliers : customers).map(p => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                          </select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-sm font-bold mb-1">رقم الشيك</label>
                              <input type="text" required className="w-full border rounded p-2" value={formData.chequeNumber} onChange={e => setFormData({...formData, chequeNumber: e.target.value})} />
                          </div>
                          <div>
                              <label className="block text-sm font-bold mb-1">المبلغ</label>
                              <input type="number" required className="w-full border rounded p-2" value={formData.amount} onChange={e => setFormData({...formData, amount: parseFloat(e.target.value)})} />
                          </div>
                      </div>
                      <div>
                          <label className="block text-sm font-bold mb-1">تاريخ الاستحقاق</label>
                          <input type="date" required className="w-full border rounded p-2" value={formData.dueDate} onChange={e => setFormData({...formData, dueDate: e.target.value})} />
                      </div>
                      <div>
                          <label className="block text-sm font-bold mb-1">البنك (المسحوب عليه)</label>
                          <input type="text" required className="w-full border rounded p-2" value={formData.bankName} onChange={e => setFormData({...formData, bankName: e.target.value})} placeholder="اسم البنك..." />
                      </div>
                      
                      <div className="md:col-span-2">
                          <label className="block text-sm font-bold text-slate-700 mb-1">إرفاق صورة الشيك</label>
                          <div className="relative border-2 border-dashed border-slate-200 rounded-lg p-4 text-center">
                              <input 
                                  ref={fileInputRef}
                                  type="file" 
                                  multiple
                                  onChange={(e) => setAttachments(prev => [...prev, ...Array.from(e.target.files || [])])} 
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                              />
                              <div className="flex flex-col items-center justify-center">
                                  <Upload size={24} className="text-slate-400 mb-2" />
                                  <p className="text-sm text-slate-500">اسحب الملفات إلى هنا أو اضغط للاختيار</p>
                              </div>
                          </div>
                          {attachments.length > 0 && (
                              <div className="mt-2 space-y-1">
                                  {attachments.map((file, index) => (
                                      <div key={index} className="flex items-center justify-between text-xs bg-slate-100 p-1 px-2 rounded border border-slate-200">
                                          <span className="truncate max-w-[200px] text-slate-600">{file.name}</span>
                                          <button type="button" onClick={() => setAttachments(prev => prev.filter((_, i) => i !== index))} className="text-red-500 hover:text-red-700">
                                              <X size={14} />
                                          </button>
                                      </div>
                                  ))}
                              </div>
                          )}
                      </div>

                      <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold hover:bg-indigo-700 mt-4">حفظ الشيك</button>
                  </form>
              </div>
          </div>
      )}

      {/* Cash Modal */}
      {showCashModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
                  <h3 className="font-bold text-xl mb-4">تأكيد صرف الشيك</h3>
                  <p className="text-sm text-slate-500 mb-4">سيتم خصم المبلغ من حساب البنك المختار وإقفال ورقة الدفع.</p>
                  
                  <label className="block text-sm font-bold mb-2">اختر البنك الذي تم الصرف منه</label>
                  <select className="w-full border rounded p-2 mb-6" value={selectedBankId} onChange={e => setSelectedBankId(e.target.value)}>
                      <option value="">-- اختر حساب البنك --</option>
                      {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>

                  <div className="flex gap-2">
                      <button onClick={handleCashCheque} disabled={!selectedBankId} className="flex-1 bg-emerald-600 text-white py-2 rounded-lg font-bold hover:bg-emerald-700 disabled:opacity-50">تأكيد الصرف</button>
                      <button onClick={() => setShowCashModal(false)} className="flex-1 bg-slate-100 text-slate-600 py-2 rounded-lg font-bold hover:bg-slate-200">إلغاء</button>
                  </div>
              </div>
          </div>
      )}

      {/* Attachments Modal */}
      {showAttachmentsModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="font-bold text-lg">مرفقات الشيك</h3>
                      <button onClick={() => setShowAttachmentsModal(false)}><X className="text-slate-400 hover:text-red-500" /></button>
                  </div>
                  <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                      {currentAttachments.map((file, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-200">
                              <div className="flex items-center gap-2 overflow-hidden">
                                  <Paperclip size={16} className="text-slate-500 shrink-0" />
                                  <span className="text-sm text-slate-700 truncate">{file.file_name}</span>
                              </div>
                              <div className="flex gap-2 shrink-0">
                                  <button onClick={() => previewAttachment(file.file_path)} className="text-slate-600 hover:text-blue-600 p-1" title="معاينة"><Eye size={16} /></button>
                                  <button onClick={() => downloadAttachment(file.file_path, file.file_name)} className="text-slate-600 hover:text-emerald-600 p-1" title="تحميل"><Download size={16} /></button>
                              </div>
                          </div>
                      ))}
                      {currentAttachments.length === 0 && <p className="text-center text-slate-500">لا توجد مرفقات.</p>}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
