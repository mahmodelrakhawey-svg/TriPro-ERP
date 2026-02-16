﻿﻿﻿﻿﻿﻿﻿﻿﻿import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Save, Wand2, Loader2, BookPlus, Building, Info, Upload, X } from 'lucide-react';
import { JournalEntryLine, Account, CostCenter } from '../../types';
import { useAccounting } from '../../context/AccountingContext';
import { analyzeTransactionText } from '../../services/geminiService';
import AddAccountModal from './AddAccountModal';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { useToastNotification } from '../../utils/toastUtils';

const JournalEntryForm = () => {
  const { accounts, costCenters, addEntry } = useAccounting();
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [lines, setLines] = useState<Partial<JournalEntryLine>[]>([
    { account_id: '', debit: 0, credit: 0, cost_center_id: '' },
    { account_id: '', debit: 0, credit: 0, cost_center_id: '' },
  ]);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const toast = useToastNotification();

  const location = useLocation();
  const navigate = useNavigate();

  // ترتيب الحسابات حسب الكود لتسهيل الاختيار
  const sortedAccounts = useMemo(() => {
    return [...accounts].sort((a, b) => a.code.localeCompare(b.code));
  }, [accounts]);

  // التحقق من وجود قيد للتعديل
  useEffect(() => {
    if (location.state?.entryToEdit) {
      const { entryToEdit } = location.state;
      setEditingId(entryToEdit.id);
      setDate(entryToEdit.date);
      setDescription(entryToEdit.description);
      setReference(entryToEdit.reference || '');
      
      // إصلاح: التحقق من وجود الأسطر والتعامل مع التسميات المختلفة للحقول
      const linesData = entryToEdit.lines || [];
      const formattedLines = linesData.map((line: any) => ({
        account_id: line.accountId || line.account_id || '',
        debit: line.debit || 0,
        credit: line.credit || 0,
        cost_center_id: line.costCenterId || line.cost_center_id || ''
      }));
      setLines(formattedLines);
    }
  }, [location.state]);

  const handleLineChange = (index: number, field: keyof JournalEntryLine, value: any) => {
    const newLines = [...lines];
    
    let processedValue = value;
    if (field === 'debit' || field === 'credit') {
        processedValue = Math.max(0, parseFloat(value) || 0);
    }

    newLines[index] = { ...newLines[index], [field]: processedValue };
    setLines(newLines);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachments(prev => [...prev, ...Array.from(e.target.files || [])]);
    }
  };

  const addLine = () => {
    setLines([...lines, { account_id: '', debit: 0, credit: 0, cost_center_id: '' }]);
  };

  const removeLine = (index: number) => {
    if (lines.length > 2) {
      setLines(lines.filter((_, i) => i !== index));
    }
  };

  const totals = lines.reduce(
    (acc, line) => ({
      debit: acc.debit + (Number(line.debit) || 0),
      credit: acc.credit + (Number(line.credit) || 0),
    }),
    { debit: 0, credit: 0 }
  );

  const isBalanced = Math.abs(totals.debit - totals.credit) < 0.01 && totals.debit > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // تنظيف البيانات: تحويل النصوص الفارغة إلى null للحقول من نوع UUID لتجنب خطأ invalid input syntax
    const sanitizedLines = lines.map(line => ({
      ...line,
      account_id: line.account_id?.trim() || null,
      cost_center_id: line.cost_center_id || null
    }));

    // 1. التحقق من اختيار الحسابات
    if (sanitizedLines.some(l => !l.account_id)) {
        toast.error("يرجى اختيار الحساب لجميع أطراف القيد قبل الترحيل.");
        return;
    }

    // 2. التحقق من التوازن
    if (!isBalanced) {
        toast.error("القيد غير متزن. يجب أن يتساوى إجمالي المدين مع إجمالي الدائن.");
        return;
    }

    setIsSubmitting(true);

    try {
      const finalReference = reference.trim() || `MAN-${Date.now().toString().slice(-6)}`;

      // إذا كنا في وضع التعديل، نحذف القيد القديم أولاً
      if (editingId) {
        const { error: deleteError } = await supabase.from('journal_entries').delete().eq('id', editingId);
        if (deleteError) throw deleteError;
      }

      await addEntry({
        date,
        reference: finalReference,
        description,
        lines: sanitizedLines as any[],
        status: 'posted',
        attachments
      });

        toast.success(editingId ? "تم تعديل القيد بنجاح." : "تم ترحيل القيد بنجاح إلى دفتر اليومية.");
        
        // إذا كان تعديلاً، نعود لدفتر اليومية
        if (editingId) {
            navigate('/general-journal');
            return;
        }

        // إذا كان جديداً، نفرغ النموذج
        setDescription('');
        setReference('');
        setLines([
            { account_id: '', debit: 0, credit: 0, cost_center_id: '' },
            { account_id: '', debit: 0, credit: 0, cost_center_id: '' },
        ]);
        setAttachments([]);
    } catch (error: any) {
        toast.error(error.message || "حدث خطأ أثناء حفظ القيد");
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleAiAssist = async () => {
    if (!aiPrompt.trim()) return;
    setIsAiLoading(true);
    try {
        const result = await analyzeTransactionText(aiPrompt, accounts);
        if (result && result.lines) {
            setDescription(result.description || aiPrompt);
            
            const newLines: Partial<JournalEntryLine>[] = result.lines.map((l: any) => {
                const acc = accounts.find(a => a.code === l.accountCode);
                return {
                    account_id: acc ? acc.id : '',
                    debit: l.debit || 0,
                    credit: l.credit || 0,
                    cost_center_id: ''
                };
            });
            
            while(newLines.length < 2) {
                newLines.push({ accountId: '', debit: 0, credit: 0, costCenterId: '' });
            }

            setLines(newLines);
        }
    } catch (e) {
        toast.error("حدث خطأ أثناء الاتصال بالمساعد الذكي.");
    } finally {
        setIsAiLoading(false);
    }
  };

  const handleAccountAdded = (newAccount: Account) => {
    if (newAccount.is_group) return;
    const emptyIndex = lines.findIndex(line => !line.account_id);
    if (emptyIndex >= 0) {
        handleLineChange(emptyIndex, 'account_id', newAccount.id);
    } else {
        setLines([...lines, { account_id: newAccount.id, debit: 0, credit: 0, cost_center_id: '' }]);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">قيد يومية جديد</h2>
          <p className="text-slate-500">إدخال العمليات المالية يدوياً أو بمساعدة الذكاء الاصطناعي</p>
        </div>
        <button
            type="button"
            onClick={() => setIsAccountModalOpen(true)}
            className="flex items-center gap-2 text-blue-600 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-lg font-medium transition-colors border border-blue-200"
        >
            <BookPlus size={18} />
            <span>حساب جديد</span>
        </button>
      </div>

      <AddAccountModal 
        isOpen={isAccountModalOpen} 
        onClose={() => setIsAccountModalOpen(false)} 
        onAccountAdded={() => {}}
      />

      {/* AI Assistant Section */}
      <div className="bg-gradient-to-r from-indigo-50 to-blue-50 p-6 rounded-xl border border-blue-100 shadow-sm">
        <div className="flex items-center gap-2 mb-3 text-indigo-700 font-bold">
            <Wand2 className="w-5 h-5" />
            <h3>المساعد المحاسبي الذكي</h3>
        </div>
        <div className="flex gap-2">
            <input 
                type="text" 
                placeholder="مثال: شراء أثاث مكتبي بقيمة 5000 ريال نقداً..." 
                className="flex-1 border border-blue-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-300 outline-none"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
            />
            <button 
                onClick={handleAiAssist}
                disabled={isAiLoading || !aiPrompt}
                className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
                {isAiLoading ? <Loader2 className="animate-spin w-5 h-5" /> : 'تحليل'}
            </button>
        </div>
        <p className="text-xs text-indigo-400 mt-2">
            اكتب وصف العملية وسيقوم المساعد بتوجيه الحسابات تلقائياً (يتطلب مفتاح API).
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">تاريخ القيد</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">رقم المرجع</label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="تلقائي (اختياري)"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                شرح القيد
                <div className="group relative">
                    <Info size={16} className="text-slate-400 cursor-help" />
                    <div className="absolute bottom-full mb-2 hidden group-hover:block w-64 bg-slate-800 text-white text-xs p-2 rounded shadow-lg z-10 pointer-events-none">
                        يرجى كتابة وصف مهني ودقيق للعملية المالية لضمان وضوح القيود في التقارير (مثال: إثبات سداد فاتورة الكهرباء لشهر يناير).
                    </div>
                </div>
            </label>
            <input
              type="text"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="وصف العملية المالية"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">المرفقات</label>
            <div className="relative">
                <input
                    type="file"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                    id="file-upload"
                />
                <label
                    htmlFor="file-upload"
                    className="flex items-center justify-center gap-2 w-full border border-dashed border-slate-300 rounded-lg p-2.5 cursor-pointer hover:bg-slate-50 transition-colors text-slate-500"
                >
                    <Upload size={18} />
                    <span className="text-sm">رفع ملفات</span>
                </label>
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
        </div>

        <div className="space-y-3 mb-6">
          <div className="grid grid-cols-12 gap-2 text-sm font-medium text-slate-500 px-2">
            <div className="col-span-4">اسم الحساب</div>
            <div className="col-span-2 text-center">مركز التكلفة</div>
            <div className="col-span-2 text-center">مدين</div>
            <div className="col-span-2 text-center">دائن</div>
            <div className="col-span-1"></div>
          </div>
          
          {lines.map((line, index) => (
            <div key={index} className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-2 rounded-lg border border-slate-100">
              <div className="col-span-4">
                <select
                  required
                  value={line.account_id}
                  onChange={(e) => handleLineChange(index, 'account_id', e.target.value)}
                  className={`w-full bg-white border rounded px-2 py-1.5 focus:outline-none text-sm ${!line.account_id ? 'border-red-300' : 'border-slate-200 focus:border-blue-500'}`}
                >
                  <option value="">اختر الحساب...</option>
                  {sortedAccounts.length === 0 && <option disabled>لا توجد حسابات متاحة</option>}
                  {sortedAccounts.map(acc => (
                    <option key={acc.id} value={acc.id} disabled={acc.is_group}>
                      {acc.is_group ? `--- ${acc.name} ---` : `${acc.code} - ${acc.name} (${acc.balance?.toLocaleString() || 0})`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <select
                  value={line.cost_center_id || ''}
                  onChange={(e) => handleLineChange(index, 'cost_center_id', e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-500 text-xs text-slate-600"
                >
                  <option value="">-- بلا مركز --</option>
                  {costCenters.map(cc => (
                    <option key={cc.id} value={cc.id}>{cc.name}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.debit}
                  onChange={(e) => handleLineChange(index, 'debit', e.target.value)}
                  onFocus={(e) => e.target.select()}
                  className="w-full text-center border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-500 text-sm font-bold text-slate-700"
                />
              </div>
              <div className="col-span-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.credit}
                  onChange={(e) => handleLineChange(index, 'credit', e.target.value)}
                  onFocus={(e) => e.target.select()}
                  className="w-full text-center border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-500 text-sm font-bold text-slate-700"
                />
              </div>
              <div className="col-span-1 text-center">
                {lines.length > 2 && (
                  <button type="button" onClick={() => removeLine(index)} className="text-red-400 hover:text-red-600">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-between items-center mb-6 px-2">
          <button
            type="button"
            onClick={addLine}
            className="flex items-center gap-2 text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            <Plus size={16} /> إضافة طرف
          </button>
          
          <div className="flex gap-8 text-sm font-bold">
            <div className={`flex flex-col items-end ${Math.abs(totals.debit - totals.credit) > 0.01 ? 'text-red-500' : 'text-slate-700'}`}>
                <span className="text-xs text-slate-400">إجمالي المدين</span>
                <span>{totals.debit.toLocaleString()}</span>
            </div>
            <div className={`flex flex-col items-end ${Math.abs(totals.debit - totals.credit) > 0.01 ? 'text-red-500' : 'text-slate-700'}`}>
                <span className="text-xs text-slate-400">إجمالي الدائن</span>
                <span>{totals.credit.toLocaleString()}</span>
            </div>
            <div className={`flex flex-col items-end ${Math.abs(totals.debit - totals.credit) > 0.01 ? 'text-red-600' : 'text-emerald-600'}`}>
                <span className="text-xs text-slate-400">الفرق</span>
                <span>{Math.abs(totals.debit - totals.credit).toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 flex justify-end">
          <button
            type="submit"
            disabled={!isBalanced || isSubmitting}
            className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-bold shadow-lg shadow-blue-200"
          >
            {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            حفظ وترحيل القيد
          </button>
        </div>
      </form>
    </div>
  );
};

export default JournalEntryForm;
