import React, { useState, useEffect } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { Users, Plus, Search, Edit2, Trash2, X, Phone, MapPin, FileText, CircleDollarSign, Loader2 } from 'lucide-react';
import { useCustomers } from '../hooks/usePermissions';
import { useQueryClient } from '@tanstack/react-query';

type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string;
  tax_number: string;
  address: string;
  credit_limit?: number;
};

const CustomerManager = () => {
  const queryClient = useQueryClient();
  const { addCustomer, updateCustomer, deleteCustomer, can, currentUser, customers: contextCustomers } = useAccounting();
  const { showToast } = useToast();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // تأخير البحث لتقليل الطلبات على السيرفر
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // في وضع الديمو، نستخدم العملاء من السياق (الوهميين) بدلاً من جلبهم من السيرفر
  const { data: serverCustomers = [], isLoading: isServerLoading } = useCustomers(debouncedSearch);
  const customers = currentUser?.role === 'demo' ? contextCustomers : serverCustomers;
  const isLoading = currentUser?.role === 'demo' ? false : isServerLoading;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Customer>>({});


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;

    try {
        if (formData.id) {
            await updateCustomer(formData.id, formData);
        } else {
            await addCustomer(formData as any);
        }
        queryClient.invalidateQueries({ queryKey: ['customers'] }); // تحديث القائمة فوراً
        setIsModalOpen(false);
        showToast('تم حفظ بيانات العميل بنجاح ✅', 'success');
    } catch (error: any) {
        console.error(error);
        showToast('حدث خطأ: ' + error.message, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('هل أنت متأكد من حذف هذا العميل؟')) {
      const reason = prompt("الرجاء إدخال سبب الحذف (إلزامي):");
      if (reason) {
        try {
          await deleteCustomer(id, reason);
          queryClient.invalidateQueries({ queryKey: ['customers'] }); // تحديث القائمة فوراً
        } catch (error: any) {
          console.error(error);
          showToast('لا يمكن حذف العميل, قد يكون مرتبطاً بفواتير. الخطأ: ' + error.message, 'error');
        }
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Users className="text-blue-600" /> إدارة العملاء
        </h2>
        {can('customers', 'create') && (
          <button onClick={() => { setFormData({}); setIsModalOpen(true); }} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-bold hover:bg-blue-700">
            <Plus size={18} /> إضافة عميل
          </button>
        )}
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="relative">
          <Search className="absolute right-3 top-3 text-slate-400" size={20} />
          <input type="text" placeholder="بحث عن عميل..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pr-10 pl-4 py-2 border rounded-lg focus:outline-none focus:border-blue-500" />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12"><Loader2 className="animate-spin text-blue-600" size={32} /></div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {customers.map(customer => (
          <div key={customer.id} className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-3">
              <h3 className="font-bold text-lg text-slate-800">{customer.name}</h3>
              <div className="flex gap-2">
                {can('customers', 'update') && (
                  <button onClick={() => { setFormData(customer); setIsModalOpen(true); }} className="text-blue-500 hover:bg-blue-50 p-1 rounded"><Edit2 size={16} /></button>
                )}
                {can('customers', 'delete') && (
                  <button onClick={() => handleDelete(customer.id)} className="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 size={16} /></button>
                )}
              </div>
            </div>
            <div className="space-y-2 text-sm text-slate-600">
              <div className="flex items-center gap-2"><Phone size={14} /> {customer.phone || '-'}</div>
              <div className="flex items-center gap-2"><FileText size={14} /> {customer.tax_number || '-'}</div>
              <div className="flex items-center gap-2"><MapPin size={14} /> {customer.address || '-'}</div>
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100 font-bold text-emerald-600">
                <CircleDollarSign size={14} /> حد الائتمان: {customer.credit_limit?.toLocaleString() || 0}
              </div>
            </div>
          </div>
        ))}
        {customers.length === 0 && (
            <div className="col-span-full text-center py-12 text-slate-400">لا توجد نتائج مطابقة للبحث.</div>
        )}
      </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-xl">{formData.id ? 'تعديل بيانات العميل' : 'إضافة عميل جديد'}</h3>
              <button onClick={() => setIsModalOpen(false)}><X className="text-slate-400 hover:text-red-500" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><label className="block text-sm font-bold mb-1">اسم العميل</label><input required type="text" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full border rounded-lg p-2" /></div>
              <div><label className="block text-sm font-bold mb-1">رقم الهاتف</label><input type="text" value={formData.phone || ''} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full border rounded-lg p-2" /></div>
              <div><label className="block text-sm font-bold mb-1">البريد الإلكتروني</label><input type="email" value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full border rounded-lg p-2" /></div>
              <div><label className="block text-sm font-bold mb-1">الرقم الضريبي</label><input type="text" value={formData.tax_number || ''} onChange={e => setFormData({...formData, tax_number: e.target.value})} className="w-full border rounded-lg p-2" /></div>
              <div><label className="block text-sm font-bold mb-1">العنوان</label><input type="text" value={formData.address || ''} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full border rounded-lg p-2" /></div>
              <div><label className="block text-sm font-bold mb-1">حد الائتمان</label><input type="number" value={formData.credit_limit || ''} onChange={e => setFormData({...formData, credit_limit: Number(e.target.value)})} className="w-full border rounded-lg p-2" placeholder="0" /></div>
              <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 mt-4">حفظ البيانات</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerManager;
