﻿﻿﻿﻿﻿﻿﻿import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { ArrowUpRight, Save, Loader2, User, Wallet, Calendar, FileText, Building2, ArrowRight, ArrowLeft, Plus, Search, Upload, Paperclip, X, CircleDollarSign, Download, Eye, Layers, Printer, MessageCircle } from 'lucide-react';
import { PaymentVoucherPrint } from './PaymentVoucherPrint';
import { VoucherSchema } from '../../utils/schemas';

const PaymentVoucherForm = () => {
  const { addEntry, vouchers, updateVoucher, costCenters, getSystemAccount, accounts, suppliers } = useAccounting();
  const { showToast } = useToast();
  // const [suppliers, setSuppliers] = useState<any[]>([]); // Removed: Use suppliers from context
  const [formData, setFormData] = useState({
    supplierId: '',
    treasuryId: '',
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    notes: '',
    voucherNumber: '',
    paymentMethod: 'cash',
    currency: 'EGP',
    exchangeRate: 1,
    costCenterId: ''
  });
  const [loading, setLoading] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [currentVoucherId, setCurrentVoucherId] = useState<string | null>(null);
  const [existingAttachments, setExistingAttachments] = useState<any[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  // Print State
  const [voucherToPrint, setVoucherToPrint] = useState<any>(null);
  const [companySettings, setCompanySettings] = useState<any>(null);

  useEffect(() => {
    supabase.from('company_settings').select('*').single().then(({ data }) => setCompanySettings(data));
  }, []);

  useEffect(() => {
    if (voucherToPrint) {
      setTimeout(() => {
        window.print();
        setVoucherToPrint(null);
      }, 500);
    }
  }, [voucherToPrint]);

  const paymentVouchers = vouchers.filter(v => v.type === 'payment');

  // تصفية حسابات الخزينة والبنوك من السياق مباشرة لضمان التحديث الفوري
  const treasuryAccounts = useMemo(() => {
    return accounts.filter(a => 
      !a.isGroup && (
        a.name.includes('صندوق') || 
        a.name.includes('خزينة') || 
        a.name.includes('بنك') || 
        a.name.includes('نقد') ||
        a.name.includes('Cash') ||
        a.name.includes('Bank') ||
        a.code.startsWith('123') || a.code.startsWith('101')
      )
    );
  }, [accounts]);

  const loadVoucher = async (voucher: any) => {
    if (!voucher) return;
    setIsEditing(true);
    setCurrentVoucherId(voucher.id);
    
    const { data } = await supabase.from('payment_vouchers').select('*').eq('id', voucher.id).single();
    
    if (data) {
      setFormData({
        supplierId: data.supplier_id || '',
        treasuryId: data.treasury_account_id || '',
        amount: data.amount || 0,
        date: data.payment_date || new Date().toISOString().split('T')[0],
        notes: data.notes || '',
      voucherNumber: data.voucher_number || '',
      paymentMethod: data.payment_method || 'cash',
      currency: data.currency || 'EGP',
      exchangeRate: data.exchange_rate || 1,
      costCenterId: data.cost_center_id || ''
      });

      // جلب المرفقات المحفوظة
      const { data: atts } = await supabase.from('payment_voucher_attachments').select('*').eq('voucher_id', voucher.id);
      setExistingAttachments(atts || []);
    }
  };

  const handleNew = () => {
    setIsEditing(false);
    setCurrentVoucherId(null);
    setFormData({
      supplierId: '',
      treasuryId: '',
      amount: 0,
      date: new Date().toISOString().split('T')[0],
      notes: '',
      voucherNumber: '',
      paymentMethod: 'cash',
      currency: 'EGP',
      exchangeRate: 1,
      costCenterId: ''
    });
    setAttachments([]);
    setExistingAttachments([]);
  };

  const handlePrevious = () => {
    if (paymentVouchers.length === 0) return;
    if (!currentVoucherId) {
      loadVoucher(paymentVouchers[0]);
      return;
    }
    const idx = paymentVouchers.findIndex(v => v.id === currentVoucherId);
    if (idx < paymentVouchers.length - 1) {
      loadVoucher(paymentVouchers[idx + 1]);
    }
  };

  const handleNext = () => {
    if (paymentVouchers.length === 0) return;
    if (!currentVoucherId) {
      loadVoucher(paymentVouchers[0]);
      return;
    }
    const idx = paymentVouchers.findIndex(v => v.id === currentVoucherId);
    if (idx > 0) {
      loadVoucher(paymentVouchers[idx - 1]);
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
      alert('فشل تحميل الملف');
    }
  };

  const previewAttachment = (path: string) => {
    const { data } = supabase.storage.from('documents').getPublicUrl(path);
    if (data.publicUrl) {
        window.open(data.publicUrl, '_blank');
    }
  };

  const handlePrint = () => {
    const supplierName = suppliers.find(s => s.id === formData.supplierId)?.name;
    const printData = {
        ...formData,
        voucher_number: formData.voucherNumber,
        payment_date: formData.date,
        suppliers: { name: supplierName },
        payment_method: formData.paymentMethod
    };
    setVoucherToPrint(printData);
  };

  const handleWhatsApp = () => {
    const supplier = suppliers.find(s => s.id === formData.supplierId);
    if (!supplier || !supplier.phone) {
      alert('رقم هاتف المورد غير متوفر في البيانات الأساسية');
      return;
    }
    
    const message = `*سند صرف جديد*\n\nمرحباً ${supplier.name}،\nتم صرف مبلغ: *${Number(formData.amount).toLocaleString()} ${formData.currency}*\nرقم السند: ${formData.voucherNumber}\nالتاريخ: ${formData.date}\n${formData.notes ? 'البيان: ' + formData.notes : ''}\n\nشكراً لتعاملكم معنا.`;
    
    // تنظيف رقم الهاتف من الرموز غير الرقمية
    const phone = supplier.phone.replace(/[^0-9]/g, '');
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    // إعداد البيانات للتحقق
    const validationData = {
      amount: Number(formData.amount),
      date: formData.date,
      treasuryAccountId: formData.treasuryId,
      description: formData.notes,
      partyId: formData.supplierId,
      paymentMethod: formData.paymentMethod,
    };

    const result = VoucherSchema.safeParse(validationData);

    if (!result.success) {
        const formattedErrors: Record<string, string> = {};
        result.error.issues.forEach(issue => { formattedErrors[String(issue.path[0])] = issue.message; });
        setErrors(formattedErrors);
        showToast('يرجى تصحيح الأخطاء في النموذج', 'error');
        return;
    }
    setLoading(true);

    try {
        const supplier = suppliers.find(s => s.id === formData.supplierId);
        const treasury = treasuryAccounts.find(t => t.id === formData.treasuryId);
        const voucherNumber = formData.voucherNumber || `PV-${Date.now().toString().slice(-6)}`;

        if (isEditing && currentVoucherId) {
          await updateVoucher(currentVoucherId, 'payment', { ...formData, voucherNumber });
          alert('تم تعديل السند بنجاح ✅');
          return;
        }

        // البحث عن حساب الموردين (201)
        const supplierAcc = getSystemAccount('SUPPLIERS');

        if (!supplierAcc) {
            alert('لم يتم العثور على حساب "الموردين" (201) في الدليل المحاسبي.');
            setLoading(false);
            return;
        }

        // 1. حفظ سند الصرف في قاعدة البيانات
        const { data: voucherData, error: voucherError } = await supabase.from('payment_vouchers').insert({
            voucher_number: voucherNumber,
            payment_date: formData.date,
            supplier_id: formData.supplierId,
            amount: formData.amount,
            treasury_account_id: formData.treasuryId,
            notes: formData.notes,
            payment_method: formData.paymentMethod,
            currency: formData.currency,
            exchange_rate: formData.exchangeRate,
            cost_center_id: formData.costCenterId || null
        }).select().single();

        if (voucherError) throw voucherError;

        // 1.5. رفع المرفقات (إذا وجدت)
        if (attachments.length > 0 && voucherData) {
            for (const file of attachments) {
                const fileExt = file.name.split('.').pop();
                const fileName = `${voucherData.id}-${Date.now()}-${Math.random()}.${fileExt}`;
                const filePath = `vouchers/${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('documents') // اسم الـ Bucket
                    .upload(filePath, file);

                if (uploadError) {
                    console.error('Upload failed:', uploadError);
                    alert(`تم حفظ السند ولكن فشل رفع المرفق: ${file.name}. السبب: ${uploadError.message}`);
                } else {
                    // حفظ بيانات المرفق في الجدول الجديد
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

        // 2. إنشاء القيد المحاسبي (محاولة استخدام الدالة الآمنة، ثم البديل اليدوي)
        try {
            const { error: rpcError } = await supabase.rpc('approve_payment_voucher', { p_voucher_id: voucherData.id, p_debit_account_id: supplierAcc.id });
            if (rpcError) throw rpcError;
        } catch (err: any) {
            console.warn("RPC failed, falling back to manual entry:", err);
            // في حال فشل الدالة (مثلاً غير موجودة)، نقوم بإنشاء القيد يدوياً لضمان سلامة البيانات
            await addEntry({
                date: formData.date,
                reference: voucherNumber,
                description: formData.notes || `سند صرف للمورد`,
                lines: [
                    { account_id: supplierAcc.id, accountId: supplierAcc.id, debit: formData.amount, credit: 0, description: `صرف للمورد`, costCenterId: formData.costCenterId || null },
                    { account_id: formData.treasuryId, accountId: formData.treasuryId, debit: 0, credit: formData.amount, description: `سند صرف رقم ${voucherNumber}` }
                ]
            });
        }

        showToast('تم حفظ سند الصرف وترحيل القيد بنجاح', 'success');
        handleNew();
        setAttachments([]);
        setErrors({});

    } catch (error: any) {
        console.error('Error saving payment voucher:', error);
        showToast(error?.message || 'فشل حفظ سند الصرف', 'error');
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in">
      <div className={voucherToPrint ? 'print:hidden' : ''}>
      {/* شريط الأدوات */}
      <div className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-2">
          <button onClick={handlePrevious} className="p-2 hover:bg-slate-100 rounded-full text-slate-600" title="السابق">
            <ArrowRight className="w-5 h-5" />
          </button>
          <button onClick={handleNext} className="p-2 hover:bg-slate-100 rounded-full text-slate-600" title="التالي">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="h-6 w-px bg-slate-300 mx-2"></div>
          <button onClick={handleNew} className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-bold text-sm">
            <Plus className="w-4 h-4" />
            <span>سند جديد</span>
          </button>
          <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-100 font-bold text-sm" title="طباعة السند الحالي">
            <Printer className="w-4 h-4" />
            <span>طباعة</span>
          </button>
          <button onClick={handleWhatsApp} className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 font-bold text-sm" title="إرسال عبر واتساب">
            <MessageCircle className="w-4 h-4" />
            <span>واتساب</span>
          </button>
        </div>

        <div className="flex items-center gap-4">
           <div className="relative">
             <Search className="w-4 h-4 absolute right-3 top-3 text-slate-400" />
             <select 
               className="pl-4 pr-10 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none bg-white w-64"
               onChange={(e) => {
                 const v = paymentVouchers.find(v => v.id === e.target.value);
                 if(v) loadVoucher(v);
               }}
               value={currentVoucherId || ''}
             >
               <option value="">بحث عن سند...</option>
               {paymentVouchers.map(v => (
                 <option key={v.id} value={v.id}>{v.voucherNumber || v.voucher_number} - {v.amount}</option>
               ))}
             </select>
           </div>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <ArrowUpRight className="text-blue-600" /> {isEditing ? 'تعديل سند صرف' : 'سند صرف جديد'}
        </h2>
      </div>

      <form onSubmit={handleSave} className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 space-y-6">
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* المورد */}
            <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">صرف للمورد</label>
                <div className="relative">
                    <select 
                        value={formData.supplierId}
                        onChange={(e) => setFormData({...formData, supplierId: e.target.value})}
                        className={`w-full border rounded-lg px-4 py-3 focus:outline-none appearance-none ${errors.partyId ? 'border-red-500 focus:border-red-500' : 'border-slate-300 focus:border-blue-500'}`}
                    >
                        <option value="">اختر المورد...</option>
                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <User className="absolute left-3 top-3.5 text-slate-400" size={18} />
                </div>
                {errors.partyId && <p className="text-red-500 text-xs mt-1">{errors.partyId}</p>}
            </div>

            {/* حساب الصرف */}
            <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">من حساب (الخزينة/البنك)</label>
                <div className="relative">
                    <select 
                        value={formData.treasuryId}
                        onChange={(e) => setFormData({...formData, treasuryId: e.target.value})}
                        className={`w-full border rounded-lg px-4 py-3 focus:outline-none appearance-none ${errors.treasuryAccountId ? 'border-red-500 focus:border-red-500' : 'border-slate-300 focus:border-blue-500'}`}
                    >
                        <option value="">اختر الحساب...</option>
                        {treasuryAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name} ({acc.code})</option>)}
                    </select>
                    <Building2 className="absolute left-3 top-3.5 text-slate-400" size={18} />
                </div>
                {errors.treasuryAccountId && <p className="text-red-500 text-xs mt-1">{errors.treasuryAccountId}</p>}
            </div>

            {/* المبلغ */}
            <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">المبلغ</label>
                <div className="relative">
                    <input 
                        type="number" 
                        min="0"
                        step="0.01"
                        value={formData.amount}
                        onChange={(e) => setFormData({...formData, amount: parseFloat(e.target.value)})}
                        className={`w-full border rounded-lg px-4 py-3 focus:outline-none font-mono text-lg font-bold ${errors.amount ? 'border-red-500 focus:border-red-500' : 'border-slate-300 focus:border-blue-500'}`}
                    />
                    <Wallet className="absolute left-3 top-3.5 text-slate-400" size={18} />
                </div>
                {errors.amount && <p className="text-red-500 text-xs mt-1">{errors.amount}</p>}
            </div>

            {/* التاريخ */}
            <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">التاريخ</label>
                <div className="relative">
                    <input 
                        type="date" 
                        value={formData.date}
                        onChange={(e) => setFormData({...formData, date: e.target.value})}
                        className={`w-full border rounded-lg px-4 py-3 focus:outline-none ${errors.date ? 'border-red-500 focus:border-red-500' : 'border-slate-300 focus:border-blue-500'}`}
                    />
                    <Calendar className="absolute left-3 top-3.5 text-slate-400" size={18} />
                </div>
                {errors.date && <p className="text-red-500 text-xs mt-1">{errors.date}</p>}
            </div>

            {/* مركز التكلفة */}
            <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">مركز التكلفة</label>
                <div className="relative">
                    <select 
                        value={formData.costCenterId}
                        onChange={(e) => setFormData({...formData, costCenterId: e.target.value})}
                        className="w-full border border-slate-300 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 appearance-none"
                    >
                        <option value="">بدون مركز تكلفة</option>
                        {costCenters.map(cc => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
                    </select>
                    <Layers className="absolute left-3 top-3.5 text-slate-400" size={18} />
                </div>
            </div>

            {/* رقم السند */}
            <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">رقم السند (اختياري)</label>
                <input 
                    type="text" 
                    value={formData.voucherNumber}
                    onChange={(e) => setFormData({...formData, voucherNumber: e.target.value})}
                    placeholder="تلقائي"
                    className="w-full border border-slate-300 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500"
                />
            </div>

            {/* طريقة الدفع */}
            <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">طريقة الدفع</label>
                <select 
                    value={formData.paymentMethod}
                    onChange={(e) => setFormData({...formData, paymentMethod: e.target.value})}
                    className="w-full border border-slate-300 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 appearance-none"
                    required
                >
                    <option value="cash">نقدي</option>
                    <option value="cheque">شيك</option>
                    <option value="transfer">تحويل بنكي</option>
                    <option value="card">شبكة/بطاقة</option>
                    <option value="other">أخرى</option>
                </select>
            </div>

            {/* العملة وسعر الصرف */}
            <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <CircleDollarSign className="text-green-500" size={16} /> العملة
                </label>
                <div className="flex gap-2">
                    <select 
                        value={formData.currency}
                        onChange={(e) => setFormData({...formData, currency: e.target.value})}
                        className="w-2/3 border border-slate-300 rounded-lg px-3 py-3 text-sm focus:border-blue-500 outline-none bg-white appearance-none"
                    >
                        <option value="EGP">EGP</option>
                        <option value="SAR">SAR</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                    </select>
                    <input 
                        type="number" 
                        value={formData.exchangeRate}
                        onChange={(e) => setFormData({...formData, exchangeRate: parseFloat(e.target.value)})}
                        className="w-1/3 border border-slate-300 rounded-lg px-3 py-3 text-sm focus:border-blue-500 outline-none text-center font-bold"
                        placeholder="سعر الصرف"
                        step="0.01"
                    />
                </div>
            </div>

            {/* Attachment */}
            <div className="md:col-span-2">
                <label className="block text-sm font-bold text-slate-700 mb-1">إرفاق ملف (صورة شيك، إيصال...)</label>
                <div className="relative border-2 border-dashed border-slate-200 rounded-lg p-4 text-center">
                    <input 
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

                {/* عرض المرفقات المحفوظة */}
                {existingAttachments.length > 0 && (
                    <div className="mt-4 space-y-2">
                        <label className="block text-xs font-bold text-slate-500">المرفقات المحفوظة سابقاً:</label>
                        {existingAttachments.map((file) => (
                            <div key={file.id} className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-200">
                                <div className="flex items-center gap-2">
                                    <Paperclip size={16} className="text-slate-500" />
                                    <span className="text-sm text-slate-700">{file.file_name}</span>
                                </div>
                                <button type="button" onClick={() => previewAttachment(file.file_path)} className="text-slate-600 hover:text-slate-800 p-1 flex items-center gap-1 text-xs font-bold">
                                    <Eye size={14} /> معاينة
                                </button>
                                <button type="button" onClick={() => downloadAttachment(file.file_path, file.file_name)} className="text-blue-600 hover:text-blue-800 p-1 flex items-center gap-1 text-xs font-bold">
                                    <Download size={14} /> تحميل
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ملاحظات */}
            <div className="md:col-span-2">
                <label className="block text-sm font-bold text-slate-700 mb-1">البيان / ملاحظات</label>
                <div className="relative">
                    <textarea 
                        value={formData.notes}
                        onChange={(e) => setFormData({...formData, notes: e.target.value})}
                        className="w-full border border-slate-300 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500"
                        rows={3}
                        placeholder="عبارة عن..."
                    ></textarea>
                    <FileText className="absolute left-3 top-3.5 text-slate-400" size={18} />
                </div>
            </div>
        </div>

        <div className="pt-4 border-t border-slate-100 flex justify-end">
            <button 
                type="button"
                onClick={handlePrint}
                className="bg-slate-800 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-700 flex items-center gap-2 shadow-lg transition-all transform hover:-translate-y-1 ml-4"
            >
                <Printer size={20} />
                طباعة السند
            </button>
            <button 
                type="submit" 
                disabled={loading}
                className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 flex items-center gap-2 shadow-lg shadow-blue-200 transition-all transform hover:-translate-y-1"
            >
                {loading ? <Loader2 className="animate-spin" /> : <Save size={20} />}
                {isEditing ? 'حفظ التعديلات' : 'حفظ السند وترحيل القيد'}
            </button>
        </div>

      </form>
      </div>
      
      <PaymentVoucherPrint voucher={voucherToPrint} companySettings={companySettings} />
    </div>
  );
};

export default PaymentVoucherForm;
