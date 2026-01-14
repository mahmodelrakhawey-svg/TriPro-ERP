﻿﻿﻿import React, { useState, useEffect } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { AccountType, Account } from '../../types';
import { X, Save } from 'lucide-react';

interface AddAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccountAdded?: () => void;
  accountToEdit?: any | null;
}

const AddAccountModal: React.FC<AddAccountModalProps> = ({ isOpen, onClose, onAccountAdded, accountToEdit }) => {
  const { accounts, addAccount, updateAccount, refreshData } = useAccounting();
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    type: AccountType.ASSET,
    isGroup: false,
    parentAccount: '' as string | undefined,
    subType: 'current' as 'current' | 'non_current' | ''
  });
  const [error, setError] = useState('');

  // تعبئة البيانات عند التعديل
  useEffect(() => {
    if (isOpen && accountToEdit) {
      setFormData({
        code: accountToEdit.code,
        name: accountToEdit.name,
        type: accountToEdit.type as AccountType,
        isGroup: accountToEdit.is_group,
        parentAccount: accountToEdit.parent_account || '',
        subType: accountToEdit.sub_type || 'current'
      });
    } else if (isOpen && !accountToEdit) {
      // إعادة تعيين النموذج عند فتح نافذة جديدة (اختياري)
    }
  }, [isOpen, accountToEdit]);

  // توليد الكود التلقائي عند اختيار حساب أب
  useEffect(() => {
    if (isOpen && formData.parentAccount && !accountToEdit) {
      const parentCode = accounts.find(a => a.id === formData.parentAccount)?.code;
      if (parentCode) {
        // تصحيح: استخدام parent_account بدلاً من parentAccount
        const children = accounts.filter(a => a.parent_account === formData.parentAccount);
        const lastChildCode = children.length > 0 
          ? Math.max(...children.map(c => parseInt(c.code.slice(parentCode.length)) || 0))
          : 0;
        const newCode = `${parentCode}${lastChildCode + 1}`;
        setFormData(prev => ({ ...prev, code: newCode }));
      }
    }
  }, [formData.parentAccount, accounts, isOpen, accountToEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code.trim() || !formData.name.trim()) {
      setError('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    // التحقق من تكرار الكود
    if (accounts.some(acc => acc.code === formData.code.trim() && acc.id !== accountToEdit?.id)) {
      setError('رقم الحساب مستخدم بالفعل، الرجاء اختيار رقم آخر');
      return;
    }

    try {
      const accountData = {
        code: formData.code.trim(),
        name: formData.name.trim(),
        type: formData.type,
        is_group: formData.isGroup,
        parent_id: formData.parentAccount || null,
        sub_type: formData.subType || null
      };

      if (accountToEdit) {
        // تحديث حساب موجود
        await updateAccount(accountToEdit.id, accountData);
      } else {
        await addAccount({ ...accountData, is_active: true });
      }

      if (onAccountAdded) {
          onAccountAdded();
      }
      await refreshData();
      
      handleClose();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleClose = () => {
    setFormData({ 
        code: '', 
        name: '', 
        type: AccountType.ASSET, 
        isGroup: false, 
        parentAccount: '',
        subType: 'current'
    });
    setError('');
    onClose();
  };

  // تصحيح: استخدام is_group بدلاً من isGroup للتصفية
  const parentOptions = accounts.filter(a => a.is_group);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
          <h3 className="font-bold text-lg text-slate-800">{accountToEdit ? 'تعديل الحساب' : 'إضافة حساب جديد'}</h3>
          <button onClick={handleClose} className="text-slate-400 hover:text-red-500 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg border border-red-100">
              {error}
            </div>
          )}
          
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
            <label className="block text-sm font-medium text-slate-700 mb-1">نوع الحساب الرئيسي</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as AccountType, parentAccount: '', code: '' })}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 bg-white"
            >
              {Object.values(AccountType).map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          {/* حقل التصنيف الفرعي (يظهر فقط للأصول والخصوم) */}
          {(formData.type === AccountType.ASSET || formData.type === AccountType.LIABILITY) && (
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <label className="block text-sm font-medium text-slate-700 mb-1">التصنيف الفرعي (للميزانية والنسب)</label>
              <select
                value={formData.subType}
                onChange={(e) => setFormData({ ...formData, subType: e.target.value as any })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 bg-white"
              >
                <option value="current">متداول (Current)</option>
                <option value="non_current">غير متداول / ثابت (Non-Current)</option>
              </select>
            </div>
          )}

          <div className="pt-2">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2 cursor-pointer">
                <input 
                    type="checkbox" 
                    checked={formData.isGroup} 
                    onChange={(e) => setFormData({...formData, isGroup: e.target.checked})}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                />
                <span>حساب رئيسي (تجميعي)</span>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">الحساب الأب (اختياري)</label>
            <select
              value={formData.parentAccount || ''}
              onChange={(e) => setFormData({...formData, parentAccount: e.target.value})}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 bg-white"
            >
              <option value="">-- حساب جذري --</option>
              {parentOptions.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1">
                <label className="block text-sm font-medium text-slate-700 mb-1">الرمز</label>
                <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData({...formData, code: e.target.value})}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 font-mono text-center bg-slate-50"
                placeholder="101"
                />
            </div>
            <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">اسم الحساب</label>
                <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                placeholder="اسم الحساب"
                />
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={handleClose}
              className="px-6 py-2.5 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="bg-blue-600 text-white px-8 py-2.5 rounded-lg hover:bg-blue-700 flex items-center gap-2 font-bold shadow-md"
            >
              <Save size={18} />
              {accountToEdit ? 'حفظ التعديلات' : 'حفظ الحساب'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddAccountModal;
