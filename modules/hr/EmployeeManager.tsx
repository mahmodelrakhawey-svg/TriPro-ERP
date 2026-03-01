﻿import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { Users, Plus, Search, Edit, Trash2, Save, X, Phone, Mail, Briefcase, Calendar, DollarSign, Loader2, Filter } from 'lucide-react';
import { z } from 'zod';

const EmployeeManager = () => {
  const { employees, addEmployee, updateEmployee, deleteEmployee, currentUser } = useAccounting();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true); // Start with loading true
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState('all');

  const [formData, setFormData] = useState({
    full_name: '',
    position: '',
    department: '',
    salary: 0,
    hire_date: new Date().toISOString().split('T')[0],
    phone: '',
    email: '',
    status: 'active',
    notes: ''
  });

  // Fetch initial data
  useEffect(() => {
    // Data is now coming from context, so we just need to handle the loading state
    if (employees.length > 0) setLoading(false);
  }, [employees]);


  const handleOpenModal = (employee?: any) => {
    if (employee) {
      setEditingId(employee.id);
      setFormData({
        full_name: employee.full_name,
        position: employee.position || '',
        department: employee.department || '',
        salary: employee.salary || 0,
        hire_date: employee.hire_date || new Date().toISOString().split('T')[0],
        phone: employee.phone || '',
        email: employee.email || '',
        status: employee.status || 'active',
        notes: employee.notes || ''
      });
    } else {
      setEditingId(null);
      setFormData({
        full_name: '',
        position: '',
        department: '',
        salary: 0,
        hire_date: new Date().toISOString().split('T')[0],
        phone: '',
        email: '',
        status: 'active',
        notes: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const employeeSchema = z.object({
        full_name: z.string().min(1, 'يرجى إدخال اسم الموظف'),
        position: z.string().optional(),
        department: z.string().optional(),
        salary: z.number().min(0, 'الراتب يجب أن يكون 0 أو أكثر'),
        hire_date: z.string().min(1, 'تاريخ التعيين مطلوب'),
        phone: z.string().optional(),
        email: z.string().email('البريد الإلكتروني غير صحيح').optional().or(z.literal('')),
        status: z.string(),
    });

    const validationResult = employeeSchema.safeParse(formData);
    if (!validationResult.success) {
        showToast(validationResult.error.issues[0].message, 'warning');
        return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await updateEmployee(editingId, formData as any);
      } else {
        await addEmployee(formData);
      }
      
      showToast('تم الحفظ بنجاح ✅', 'success');
      setIsModalOpen(false);
    } catch (error: any) {
      showToast('حدث خطأ: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الموظف؟')) return;
    const reason = prompt("الرجاء إدخال سبب الحذف (اختياري):");
    if (reason === null) return; // User cancelled prompt

    try {
      await deleteEmployee(id, reason);
      // The context will refetch the data, no need to manually update state
    } catch (error: any) {
      showToast('فشل حذف الموظف: ' + error.message, 'error');
    }
  };

  // استخراج الأقسام الفريدة للفلتر
  const departments = Array.from(new Set(employees.map(e => e.department || '').filter(Boolean)));

  const filteredEmployees = employees.filter(e => {
    const matchesSearch = e.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (e.position && e.position.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesDept = departmentFilter === 'all' || (e.department || '') === departmentFilter;
    return matchesSearch && matchesDept;
  });

  // حماية الصفحة من مستخدم الديمو
  if (currentUser?.role === 'demo') {
      return (
          <div className="flex flex-col items-center justify-center h-96 text-slate-500 bg-white rounded-3xl border border-slate-200 shadow-sm">
              <Users size={64} className="mb-4 text-slate-300" />
              <h2 className="text-xl font-bold text-slate-700">إدارة الموظفين غير متاحة</h2>
              <p className="text-sm mt-2">لا يمكن عرض بيانات الموظفين في النسخة التجريبية حفاظاً على الخصوصية.</p>
          </div>
      );
  }

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center">
        <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Users className="text-blue-600" /> إدارة الموظفين
            </h2>
            <p className="text-slate-500">سجل بيانات الموظفين والرواتب</p>
        </div>
        <button onClick={() => handleOpenModal()} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-blue-700 transition-colors">
            <Plus size={18} /> إضافة موظف
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute right-3 top-3 text-slate-400" size={20} />
            <input 
                type="text" 
                placeholder="بحث بالاسم أو الوظيفة..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pr-10 pl-4 py-2 border rounded-lg focus:outline-none focus:border-blue-500"
            />
        </div>
        <div className="min-w-[150px]">
            <select value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)} className="w-full border rounded-lg p-2 focus:outline-none focus:border-blue-500 bg-white">
                <option value="all">كل الأقسام</option>
                {departments.map(dept => <option key={dept} value={dept}>{dept}</option>)}
            </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-12"><Loader2 className="animate-spin text-blue-600" size={32} /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredEmployees.map(employee => (
                <div key={employee.id} className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow group">
                    <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 font-bold text-xl">
                                {employee.full_name.charAt(0)}
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800">{employee.full_name}</h3>
                                <p className="text-xs text-slate-500 font-medium">{employee.position || 'غير محدد'}</p>
                            </div>
                        </div>
                        <span className={`px-2 py-1 rounded text-[10px] font-bold ${employee.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                            {employee.status === 'active' ? 'نشط' : 'غير نشط'}
                        </span>
                    </div>
                    
                    <div className="space-y-2 text-sm text-slate-600 mb-4">
                        <div className="flex items-center gap-2">
                            <Briefcase size={14} className="text-slate-400" />
                            <span>{employee.department || '-'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Phone size={14} className="text-slate-400" />
                            <span dir="ltr">{employee.phone || '-'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <DollarSign size={14} className="text-slate-400" />
                            <span className="font-bold text-slate-800">{(employee.salary || 0).toLocaleString()}</span>
                        </div>
                    </div>

                    <div className="flex gap-2 pt-4 border-t border-slate-50">
                        <button onClick={() => handleOpenModal(employee)} className="flex-1 py-2 bg-slate-50 text-slate-600 rounded-lg text-xs font-bold hover:bg-blue-50 hover:text-blue-600 transition-colors flex items-center justify-center gap-1">
                            <Edit size={14} /> تعديل
                        </button>
                        <button onClick={() => handleDelete(employee.id)} className="flex-1 py-2 bg-slate-50 text-slate-600 rounded-lg text-xs font-bold hover:bg-red-50 hover:text-red-600 transition-colors flex items-center justify-center gap-1">
                            <Trash2 size={14} /> حذف
                        </button>
                    </div>
                </div>
            ))}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in duration-200">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="font-bold text-lg text-slate-800">{editingId ? 'تعديل بيانات موظف' : 'إضافة موظف جديد'}</h3>
                    <button onClick={() => setIsModalOpen(false)}><X className="text-slate-400 hover:text-red-500" /></button>
                </div>
                <form onSubmit={handleSave} className="p-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-bold text-slate-700 mb-1">الاسم بالكامل <span className="text-red-500">*</span></label>
                            <input type="text" required value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})} className="w-full border rounded-lg p-2.5 focus:border-blue-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">المسمى الوظيفي</label>
                            <input type="text" value={formData.position} onChange={e => setFormData({...formData, position: e.target.value})} className="w-full border rounded-lg p-2.5 focus:border-blue-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">القسم</label>
                            <input type="text" value={formData.department} onChange={e => setFormData({...formData, department: e.target.value})} className="w-full border rounded-lg p-2.5 focus:border-blue-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">الراتب الأساسي</label>
                            <input type="number" value={formData.salary} onChange={e => setFormData({...formData, salary: parseFloat(e.target.value)})} className="w-full border rounded-lg p-2.5 focus:border-blue-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">تاريخ التعيين</label>
                            <input type="date" value={formData.hire_date} onChange={e => setFormData({...formData, hire_date: e.target.value})} className="w-full border rounded-lg p-2.5 focus:border-blue-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">رقم الهاتف</label>
                            <input type="text" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full border rounded-lg p-2.5 focus:border-blue-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">البريد الإلكتروني</label>
                            <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full border rounded-lg p-2.5 focus:border-blue-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">الحالة</label>
                            <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full border rounded-lg p-2.5 focus:border-blue-500 outline-none bg-white">
                                <option value="active">نشط (على رأس العمل)</option>
                                <option value="inactive">إجازة / غير نشط</option>
                                <option value="terminated">منتهي الخدمات</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">ملاحظات</label>
                        <textarea rows={2} value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full border rounded-lg p-2.5 focus:border-blue-500 outline-none"></textarea>
                    </div>
                    <div className="pt-4 flex justify-end gap-2">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2.5 text-slate-600 hover:bg-slate-100 rounded-lg font-bold">إلغاء</button>
                        <button type="submit" disabled={saving} className="bg-blue-600 text-white px-8 py-2.5 rounded-lg font-bold hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50">
                            {saving ? <Loader2 className="animate-spin" /> : <Save size={18} />} حفظ
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeManager;
