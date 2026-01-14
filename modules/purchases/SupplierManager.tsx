import React, { useState, useEffect } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { Truck, Plus, Search, Edit2, Trash2, Save, X, Phone, MapPin, FileText, Loader2 } from 'lucide-react';
import { useSuppliers } from '../hooks/usePermissions';
import { useQueryClient } from '@tanstack/react-query';

type Supplier = {
  id: string;
  name: string;
  phone: string;
  tax_number: string | null;
  address: string;
};

const SupplierManager = () => {
  const queryClient = useQueryClient();
  const { addSupplier, updateSupplier, deleteSupplier, currentUser, suppliers: contextSuppliers } = useAccounting();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // تأخير البحث لتقليل الطلبات على السيرفر
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // في وضع الديمو، نستخدم الموردين من السياق (الوهميين) بدلاً من جلبهم من السيرفر
  const { data: serverSuppliers = [], isLoading: isServerLoading } = useSuppliers(debouncedSearch);
  const suppliers = currentUser?.role === 'demo' ? contextSuppliers : serverSuppliers;
  const isLoading = currentUser?.role === 'demo' ? false : isServerLoading;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Supplier>>({});


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;

    try {
        if (formData.id) {
            await updateSupplier(formData.id, formData);
        } else {
            await addSupplier(formData as any);
        }
        queryClient.invalidateQueries({ queryKey: ['suppliers'] }); // تحديث القائمة فوراً
        setIsModalOpen(false);
        alert('تم حفظ بيانات المورد بنجاح ✅');
    } catch (error: any) {
        alert('حدث خطأ: ' + error.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('هل أنت متأكد من حذف هذا المورد؟ سيتم نقله إلى سلة المحذوفات.')) {
      const reason = prompt("الرجاء إدخال سبب الحذف (إلزامي):");
      if (reason) {
        try {
          await deleteSupplier(id, reason);
          queryClient.invalidateQueries({ queryKey: ['suppliers'] }); // تحديث القائمة فوراً
        } catch (error: any) {
          alert('لا يمكن حذف المورد، قد يكون مرتبطاً بفواتير. الخطأ: ' + error.message);
        }
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Truck className="text-blue-600" /> إدارة الموردين
        </h2>
        <button onClick={() => { setFormData({}); setIsModalOpen(true); }} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-bold hover:bg-blue-700">
          <Plus size={18} /> إضافة مورد
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="relative">
          <Search className="absolute right-3 top-3 text-slate-400" size={20} />
          <input type="text" placeholder="بحث عن مورد..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pr-10 pl-4 py-2 border rounded-lg focus:outline-none focus:border-blue-500" />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12"><Loader2 className="animate-spin text-blue-600" size={32} /></div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {suppliers.map(supplier => (
          <div key={supplier.id} className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-3">
              <h3 className="font-bold text-lg text-slate-800">{supplier.name}</h3>
              <div className="flex gap-2">
                <button onClick={() => { setFormData(supplier); setIsModalOpen(true); }} className="text-blue-500 hover:bg-blue-50 p-1 rounded"><Edit2 size={16} /></button>
                <button onClick={() => handleDelete(supplier.id)} className="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 size={16} /></button>
              </div>
            </div>
            <div className="space-y-2 text-sm text-slate-600">
              <div className="flex items-center gap-2"><Phone size={14} /> {supplier.phone || '-'}</div>
              <div className="flex items-center gap-2"><FileText size={14} /> {supplier.tax_number || '-'}</div>
              <div className="flex items-center gap-2"><MapPin size={14} /> {supplier.address || '-'}</div>
            </div>
          </div>
        ))}
        {suppliers.length === 0 && (
            <div className="col-span-full text-center py-12 text-slate-400">لا توجد نتائج مطابقة للبحث.</div>
        )}
      </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-xl">{formData.id ? 'تعديل بيانات المورد' : 'إضافة مورد جديد'}</h3>
              <button onClick={() => setIsModalOpen(false)}><X className="text-slate-400 hover:text-red-500" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><label className="block text-sm font-bold mb-1">اسم المورد</label><input required type="text" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full border rounded-lg p-2" /></div>
              <div><label className="block text-sm font-bold mb-1">رقم الهاتف</label><input type="text" value={formData.phone || ''} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full border rounded-lg p-2" /></div>
              <div><label className="block text-sm font-bold mb-1">الرقم الضريبي</label><input type="text" value={formData.tax_number || ''} onChange={e => setFormData({...formData, tax_number: e.target.value})} className="w-full border rounded-lg p-2" /></div>
              <div><label className="block text-sm font-bold mb-1">العنوان</label><input type="text" value={formData.address || ''} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full border rounded-lg p-2" /></div>
              <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 mt-4">حفظ البيانات</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierManager;
