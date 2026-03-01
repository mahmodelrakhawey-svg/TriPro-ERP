import React, { useState, useMemo, useEffect } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { Save, Loader2, Wallet, Calendar, FileText, DollarSign, AlertCircle, CheckCircle, Building2, Printer, MessageCircle, ArrowRight, ArrowLeft, Plus, Search, Upload, X, Paperclip, Eye, Download, User } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { ExpenseVoucherPrint } from './ExpenseVoucherPrint';
import { z } from 'zod';

const ExpenseVoucherForm = () => {
  const { accounts, costCenters, updateVoucher, addEntry, currentUser, addDemoEntry } = useAccounting();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  
  // Navigation & Editing State
  const { showToast } = useToast();
  const [expenseVouchers, setExpenseVouchers] = useState<any[]>([]);
  const [currentVoucherId, setCurrentVoucherId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    description: '',
    treasuryAccountId: '',
    expenseAccountId: '',
    costCenterId: '',
    voucherNumber: '',
    recipientName: ''
  });

  // Print State
  const [voucherToPrint, setVoucherToPrint] = useState<any>(null);
  const [companySettings, setCompanySettings] = useState<any>(null);

  useEffect(() => {
    supabase.from('company_settings').select('*').single().then(({ data }) => setCompanySettings(data));
    fetchExpenseVouchers();
  }, []);

  useEffect(() => {
    if (voucherToPrint) {
      const timer = setTimeout(() => {
        window.print();
        setVoucherToPrint(null);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [voucherToPrint]);

  const fetchExpenseVouchers = async () => {
    // Fetch payment vouchers that don't have a supplier (assumed to be expenses)
    const { data } = await supabase
      .from('payment_vouchers')
      .select('*')
      .is('supplier_id', null)
      .order('payment_date', { ascending: false });
    
    if (data) {
        setExpenseVouchers(data);
    }
  };

  // تصفية حسابات الخزينة والبنوك (الأصول المتداولة النقدية)
  const treasuryAccounts = useMemo(() => accounts.filter(a => {
    if (a.isGroup) return false;
    const type = String(a.type || '').toLowerCase();
    const name = a.name.toLowerCase();
    const code = a.code;
    
    const isAsset = type.includes('asset') || type.includes('أصول') || type === '';
    const hasKeyword = name.includes('نقد') || name.includes('خزينة') || name.includes('بنك') || name.includes('صندوق') || name.includes('cash') || name.includes('bank');
    const hasCode = code.startsWith('123') || code.startsWith('101');

    return isAsset && (hasKeyword || hasCode);
  }), [accounts]);

  // تصفية حسابات المصروفات
  const expenseAccounts = useMemo(() => accounts.filter(a => {
    if (a.isGroup) return false;
    const type = String(a.type || '').toLowerCase();
    const code = a.code;
    return type.includes('expense') || type.includes('مصروف') || code.startsWith('5');
  }), [accounts]);

  const loadVoucher = async (voucher: any) => {
    if (!voucher) return;
    setIsEditing(true);
    setCurrentVoucherId(voucher.id);
    setLoading(true);

    try {
        // 1. Get Voucher Details
        const { data: voucherData } = await supabase.from('payment_vouchers').select('*').eq('id', voucher.id).single();
        
        // 2. Get Attachments
        const { data: atts } = await supabase.from('payment_voucher_attachments').select('*').eq('voucher_id', voucher.id);
        setExistingAttachments(atts || []);

        // 3. Try to find Expense Account from Journal Entry
        let expenseAccId = '';
        if (voucherData.related_journal_entry_id) {
            const { data: lines } = await supabase
                .from('journal_lines')
                .select('account_id, debit')
                .eq('journal_entry_id', voucherData.related_journal_entry_id);
            
            // The expense account is the one with Debit > 0 (and not the treasury if possible, though treasury is credit)
            const expenseLine = lines?.find(l => l.debit > 0);
            if (expenseLine) expenseAccId = expenseLine.account_id;
        }

        if (voucherData) {
            setFormData({
                date: voucherData.payment_date,
                amount: voucherData.amount,
                description: voucherData.notes || '',
                treasuryAccountId: voucherData.treasury_account_id || '',
                expenseAccountId: expenseAccId,
                costCenterId: voucherData.cost_center_id || '',
                voucherNumber: voucherData.voucher_number || '',
                recipientName: voucherData.recipient_name || ''
            });
        }
    } catch (error) {
        console.error("Error loading voucher:", error);
    } finally {
        setLoading(false);
    }
  };

  const handleNew = () => {
    setIsEditing(false);
    setCurrentVoucherId(null);
    setFormData({
        date: new Date().toISOString().split('T')[0],
        amount: '',
        description: '',
        treasuryAccountId: '',
        expenseAccountId: '',
        costCenterId: '',
        voucherNumber: '',
        recipientName: ''
    });
    setAttachments([]);
    setExistingAttachments([]);
  };

  const handlePrevious = () => {
    if (expenseVouchers.length === 0) return;
    if (!currentVoucherId) { loadVoucher(expenseVouchers[0]); return; }
    const idx = expenseVouchers.findIndex(v => v.id === currentVoucherId);
    if (idx < expenseVouchers.length - 1) {
      loadVoucher(expenseVouchers[idx + 1]);
    }
  };

  const handleNext = () => {
    if (expenseVouchers.length === 0) return;
    if (!currentVoucherId) { loadVoucher(expenseVouchers[0]); return; }
    const idx = expenseVouchers.findIndex(v => v.id === currentVoucherId);
    if (idx > 0) {
      loadVoucher(expenseVouchers[idx - 1]);
    }
  };

  const handlePrint = () => {
    const expenseAccountName = accounts.find(a => a.id === formData.expenseAccountId)?.name;
    setVoucherToPrint({
        ...formData,
        expenseAccountName
    });
  };

  const handleWhatsApp = () => {
    const message = `*سند صرف مصروف*\n\nالتاريخ: ${formData.date}\nالمبلغ: *${Number(formData.amount).toLocaleString()} EGP*\nالبيان: ${formData.description}\n\nتم الصرف من النظام.`;
    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
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
    } catch (err) {
      showToast('فشل تحميل الملف', 'error');
    }
  };

  const previewAttachment = (path: string) => {
    const { data } = supabase.storage.from('documents').getPublicUrl(path);
    window.open(data.publicUrl, '_blank');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const expenseVoucherSchema = z.object({
        amount: z.number().min(0.01, 'المبلغ يجب أن يكون أكبر من 0'),
        date: z.string().min(1, 'التاريخ مطلوب'),
        treasuryAccountId: z.string().min(1, 'الرجاء اختيار حساب الصرف'),
        expenseAccountId: z.string().min(1, 'الرجاء اختيار حساب المصروف'),
    });

    const validationResult = expenseVoucherSchema.safeParse({
        amount: Number(formData.amount),
        date: formData.date,
        treasuryAccountId: formData.treasuryAccountId,
        expenseAccountId: formData.expenseAccountId
    });

    if (!validationResult.success) {
        showToast(validationResult.error.issues[0].message, 'warning');
        return;
    }

    if (currentUser?.role === 'demo') {
        setLoading(true);
        const expenseAccountName = accounts.find(a => a.id === formData.expenseAccountId)?.name;
        const voucherNumber = formData.voucherNumber || `EXP-${Date.now().toString().slice(-6)}`;
        
        // Simulate the journal entry for the demo
        addDemoEntry({
            date: formData.date,
            reference: voucherNumber,
            description: formData.description || `صرف مصروف: ${expenseAccountName}`,
            lines: [
                { accountId: formData.expenseAccountId, debit: Number(formData.amount), credit: 0, description: `مصروف - ${expenseAccountName}`, costCenterId: formData.costCenterId || null },
                { accountId: formData.treasuryAccountId, debit: 0, credit: Number(formData.amount), description: `سند صرف رقم ${voucherNumber}` }
            ]
        });

        showToast('تم حفظ سند المصروف بنجاح (محاكاة)', 'success');
        handleNew();
        setLoading(false);
        return;
    }

    setLoading(true);
    try {
        const expenseAccountName = accounts.find(a => a.id === formData.expenseAccountId)?.name;
        const voucherNumber = formData.voucherNumber || `EXP-${Date.now().toString().slice(-6)}`;

        if (isEditing && currentVoucherId) {
            // Update existing voucher
            await updateVoucher(currentVoucherId, 'payment', { 
                ...formData, 
                voucherNumber,
                recipient_name: formData.recipientName,
                supplierId: null // Ensure no supplier is linked
            });
            showToast('تم تعديل سند المصروف بنجاح ✅', 'success');
        } else {
            // Create new voucher
            // 1. Insert into payment_vouchers
            const { data: voucherData, error: voucherError } = await supabase.from('payment_vouchers').insert({
                voucher_number: voucherNumber,
                payment_date: formData.date,
                amount: Number(formData.amount),
                treasury_account_id: formData.treasuryAccountId,
                notes: formData.description || `صرف مصروف: ${expenseAccountName}`,
                payment_method: 'cash',
                cost_center_id: formData.costCenterId || null,
                supplier_id: null, // Explicitly null for expenses
                recipient_name: formData.recipientName
            }).select().single();

            if (voucherError) throw voucherError;

            // 2. Upload Attachments
            if (attachments.length > 0 && voucherData) {
                for (const file of attachments) {
                    const fileExt = file.name.split('.').pop();
                    const fileName = `${voucherData.id}-${Date.now()}-${Math.random()}.${fileExt}`;
                    const filePath = `vouchers/${fileName}`;
                    const { error: uploadError } = await supabase.storage.from('documents').upload(filePath, file);
                    if (!uploadError) {
                        await supabase.from('payment_voucher_attachments').insert({
                            voucher_id: voucherData.id,
                            file_path: filePath,
                            file_name: file.name,
                            file_type: file.type,
                            file_size: file.size
                        });
                    }
                }
            }

            // 3. Create Journal Entry (Using RPC or Manual)
            try {
                const { error: rpcError } = await supabase.rpc('approve_payment_voucher', { 
                    p_voucher_id: voucherData.id, 
                    p_debit_account_id: formData.expenseAccountId 
                });
                if (rpcError) throw rpcError;
            } catch (err) {
                // Fallback manual entry
                await addEntry({
                    date: formData.date,
                    reference: voucherNumber,
                    description: formData.description || `صرف مصروف: ${expenseAccountName}`,
                    lines: [
                        { account_id: formData.expenseAccountId, accountId: formData.expenseAccountId, debit: Number(formData.amount), credit: 0, description: `مصروف - ${expenseAccountName}`, costCenterId: formData.costCenterId || null },
                        { account_id: formData.treasuryAccountId, accountId: formData.treasuryAccountId, debit: 0, credit: Number(formData.amount), description: `سند صرف رقم ${voucherNumber}` }
                    ]
                });
            }

            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
            
            // Refresh list
            const { data: newVoucher } = await supabase.from('payment_vouchers').select('*').eq('id', voucherData.id).single();
            if (newVoucher) setExpenseVouchers(prev => [newVoucher, ...prev]);
        }
        
        if (!isEditing) handleNew();

    } catch (error: any) {
        showToast('حدث خطأ: ' + error.message, 'error');
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 animate-in fade-in">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6">
            <div className="flex items-center gap-2">
                <button onClick={handlePrevious} disabled={expenseVouchers.length === 0} className="p-2 hover:bg-slate-100 rounded-full text-slate-600 disabled:opacity-50" title="السابق">
                    <ArrowRight className="w-5 h-5" />
                </button>
                <button onClick={handleNext} disabled={expenseVouchers.length === 0} className="p-2 hover:bg-slate-100 rounded-full text-slate-600 disabled:opacity-50" title="التالي">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="h-6 w-px bg-slate-300 mx-2"></div>
                <button onClick={handleNew} className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-bold text-sm">
                    <Plus className="w-4 h-4" />
                    <span>سند جديد</span>
                </button>
                <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-100 font-bold text-sm">
                    <Printer className="w-4 h-4" />
                    <span>طباعة</span>
                </button>
                <button onClick={handleWhatsApp} className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 font-bold text-sm">
                    <MessageCircle className="w-4 h-4" />
                    <span>واتساب</span>
                </button>
            </div>
            <div className="relative">
                <Search className="w-4 h-4 absolute right-3 top-3 text-slate-400" />
                <select 
                    className="pl-4 pr-10 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none bg-white w-64"
                    onChange={(e) => {
                        const v = expenseVouchers.find(v => v.id === e.target.value);
                        if(v) loadVoucher(v);
                    }}
                    value={currentVoucherId || ''}
                >
                    <option value="">بحث عن سند مصروف...</option>
                    {expenseVouchers.map(v => (
                        <option key={v.id} value={v.id}>{v.voucher_number} - {v.amount}</option>
                    ))}
                </select>
            </div>
        </div>

        <div className="flex items-center justify-between mb-8">
            <div>
                <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                    <Wallet className="text-red-600" /> {isEditing ? 'تعديل سند مصروف' : 'سند صرف مصروف'}
                </h1>
                <p className="text-slate-500 mt-1">تسجيل المصروفات النثرية والتشغيلية وصرفها من الخزينة أو البنك</p>
            </div>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            <div className={voucherToPrint ? 'print:hidden' : ''}>
            {success && (
                <div className="bg-emerald-50 p-4 flex items-center gap-3 text-emerald-700 font-bold border-b border-emerald-100">
                    <CheckCircle size={24} />
                    تم حفظ سند الصرف بنجاح!
                </div>
            )}
            
            <form onSubmit={handleSubmit} className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                
                {/* القسم الأيمن: البيانات المالية */}
                <div className="space-y-6">
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                            <DollarSign size={16} className="text-slate-400"/> المبلغ
                        </label>
                        <input 
                            type="number" 
                            min="0" 
                            step="0.01"
                            required
                            value={formData.amount}
                            onChange={e => setFormData({...formData, amount: e.target.value})}
                            className="w-full text-3xl font-black text-slate-800 border-b-2 border-slate-200 focus:border-red-500 outline-none py-2 bg-transparent placeholder-slate-200"
                            placeholder="0.00"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                            <Calendar size={16} className="text-slate-400"/> التاريخ
                        </label>
                        <input 
                            type="date" 
                            required
                            value={formData.date}
                            onChange={e => setFormData({...formData, date: e.target.value})}
                            className="w-full border border-slate-200 rounded-xl px-4 py-3 focus:border-red-500 outline-none font-bold text-slate-600"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                            <User size={16} className="text-slate-400"/> المستلم (اختياري)
                        </label>
                        <input 
                            type="text" 
                            value={formData.recipientName}
                            onChange={e => setFormData({...formData, recipientName: e.target.value})}
                            className="w-full border border-slate-200 rounded-xl px-4 py-3 focus:border-red-500 outline-none font-medium text-slate-600"
                            placeholder="اسم الشخص المستلم..."
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                            <FileText size={16} className="text-slate-400"/> البيان / الوصف
                        </label>
                        <textarea 
                            rows={3}
                            value={formData.description}
                            onChange={e => setFormData({...formData, description: e.target.value})}
                            className="w-full border border-slate-200 rounded-xl px-4 py-3 focus:border-red-500 outline-none font-medium text-slate-600 resize-none"
                            placeholder="اكتب تفاصيل المصروف هنا..."
                        ></textarea>
                    </div>

                    {/* Attachments */}
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                            <Paperclip size={16} className="text-slate-400"/> المرفقات
                        </label>
                        <div className="relative border-2 border-dashed border-slate-200 rounded-xl p-4 text-center hover:bg-slate-50 transition-colors">
                            <input 
                                type="file" 
                                multiple
                                onChange={(e) => setAttachments(prev => [...prev, ...Array.from(e.target.files || [])])} 
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                            />
                            <div className="flex flex-col items-center justify-center">
                                <Upload size={20} className="text-slate-400 mb-2" />
                                <p className="text-xs text-slate-500">اضغط لرفع ملفات</p>
                            </div>
                        </div>
                        {/* New Attachments List */}
                        {attachments.length > 0 && (
                            <div className="mt-2 space-y-1">
                                {attachments.map((file, index) => (
                                    <div key={index} className="flex items-center justify-between text-xs bg-slate-100 p-2 rounded-lg border border-slate-200">
                                        <span className="truncate max-w-[200px] text-slate-600">{file.name}</span>
                                        <button type="button" onClick={() => setAttachments(prev => prev.filter((_, i) => i !== index))} className="text-red-500 hover:text-red-700">
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        {/* Existing Attachments List */}
                        {existingAttachments.length > 0 && (
                            <div className="mt-2 space-y-1">
                                <p className="text-xs font-bold text-slate-400 mb-1">مرفقات سابقة:</p>
                                {existingAttachments.map((file) => (
                                    <div key={file.id} className="flex items-center justify-between text-xs bg-white p-2 rounded-lg border border-slate-200">
                                        <span className="truncate max-w-[150px] text-slate-600">{file.file_name}</span>
                                        <div className="flex gap-2">
                                            <button type="button" onClick={() => previewAttachment(file.file_path)} className="text-blue-600 hover:text-blue-800 flex items-center gap-1">
                                                <Eye size={12} /> معاينة
                                            </button>
                                            <button type="button" onClick={() => downloadAttachment(file.file_path, file.file_name)} className="text-slate-500 hover:text-slate-700">
                                                <Download size={12} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* القسم الأيسر: الحسابات */}
                <div className="space-y-6 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">حساب المصروف (المدين)</label>
                        <select 
                            required
                            value={formData.expenseAccountId}
                            onChange={e => setFormData({...formData, expenseAccountId: e.target.value})}
                            className="w-full border border-slate-200 rounded-xl px-4 py-3 focus:border-red-500 outline-none bg-white font-bold text-slate-700"
                        >
                            <option value="">اختر نوع المصروف...</option>
                            {expenseAccounts.map(acc => (
                                <option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">يصرف من (الدائن)</label>
                        <select 
                            required
                            value={formData.treasuryAccountId}
                            onChange={e => setFormData({...formData, treasuryAccountId: e.target.value})}
                            className="w-full border border-slate-200 rounded-xl px-4 py-3 focus:border-red-500 outline-none bg-white font-bold text-slate-700"
                        >
                            <option value="">اختر الخزينة أو البنك...</option>
                            {treasuryAccounts.map(acc => (
                                <option key={acc.id} value={acc.id}>{acc.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                            <Building2 size={16} className="text-slate-400"/> مركز التكلفة (اختياري)
                        </label>
                        <select 
                            value={formData.costCenterId}
                            onChange={e => setFormData({...formData, costCenterId: e.target.value})}
                            className="w-full border border-slate-200 rounded-xl px-4 py-3 focus:border-red-500 outline-none bg-white font-medium text-slate-600"
                        >
                            <option value="">بدون مركز تكلفة</option>
                            {costCenters.map(cc => (
                                <option key={cc.id} value={cc.id}>{cc.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="md:col-span-2 pt-4 border-t border-slate-100 flex gap-4">
                    <button 
                        type="submit" 
                        disabled={loading}
                        className="flex-[2] bg-red-600 text-white py-4 rounded-xl font-black text-lg hover:bg-red-700 transition-all shadow-lg shadow-red-100 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : <Save size={20} />}
                        {isEditing ? 'حفظ التعديلات' : 'حفظ سند الصرف'}
                    </button>
                </div>

            </form>
            </div>
        </div>
        <ExpenseVoucherPrint voucher={voucherToPrint} companySettings={companySettings} />
    </div>
  );
};

export default ExpenseVoucherForm;
