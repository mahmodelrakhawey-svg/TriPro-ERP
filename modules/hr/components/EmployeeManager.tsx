import React, { useState, useMemo } from 'react';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import { 
  Users, Plus, Search, Edit, Trash2, Save, X, Phone, Mail, 
  Briefcase, Calendar, DollarSign, Loader2, Filter, Building2, 
  LayoutGrid, List, RotateCcw, CheckCircle2, XCircle, Printer,
  UserCheck, MapPin
} from 'lucide-react';
import { createEmployeeSchema } from '../../../utils/validationSchemas';

const EmployeeManager = () => {
  const { employees, updateEmployee, addEmployee, deleteEmployee, currentUser, isLoading: contextLoading } = useAccounting();
  const { showToast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // الفلاتر
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [positionFilter, setPositionFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    full_name: '',
    position: '',
    department: '',
    basic_salary: 0,
    hire_date: new Date().toISOString().split('T')[0],
    phone: '',
    email: '',
    status: 'active',
    notes: ''
  });

  // حساب عدد الموظفين في كل فرع
  const branchCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    employees.forEach(e => {
      const dept = e.department ? e.department.trim() : 'بدون فرع';
      counts[dept] = (counts[dept] || 0) + 1;
    });
    return counts;
  }, [employees]);

  // قائمة الفروع الفريدة مرتبة
  const departments = useMemo(() => {
    return Array.from(new Set(employees.map(e => e.department?.trim() || '').filter(Boolean))).sort();
  }, [employees]);

  // قائمة المسميات الوظيفية الفريدة
  const positions = useMemo(() => {
    return Array.from(new Set(employees.map(e => e.position?.trim() || '').filter(Boolean))).sort();
  }, [employees]);

  // فلترة الموظفين
  const filteredEmployees = useMemo(() => {
    return employees.filter(e => {
      const term = searchTerm.toLowerCase().trim();
      const matchesSearch = !term ||
        e.full_name?.toLowerCase().includes(term) ||
        (e.position && e.position.toLowerCase().includes(term)) ||
        (e.phone && e.phone.includes(term)) ||
        (e.department && e.department.toLowerCase().includes(term));

      const matchesDept = departmentFilter === 'all' || (e.department?.trim() || '') === departmentFilter;
      const matchesStatus = statusFilter === 'all' || e.status === statusFilter;
      const matchesPosition = positionFilter === 'all' || (e.position?.trim() || '') === positionFilter;

      return matchesSearch && matchesDept && matchesStatus && matchesPosition;
    });
  }, [employees, searchTerm, departmentFilter, statusFilter, positionFilter]);

  // فحص ما إذا كان هناك أي فلتر نشط
  const isFiltered = searchTerm !== '' || departmentFilter !== 'all' || statusFilter !== 'all' || positionFilter !== 'all';

  const resetFilters = () => {
    setSearchTerm('');
    setDepartmentFilter('all');
    setStatusFilter('all');
    setPositionFilter('all');
  };

  const handleOpenModal = (employee?: any) => {
    if (employee) {
      setEditingId(employee.id);
      setFormData({
        full_name: employee.full_name || employee.name || '',
        position: employee.position || '',
        department: employee.department || '',
        basic_salary: employee.basic_salary || 0,
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
        position: 'موظف فرع',
        department: departmentFilter !== 'all' ? departmentFilter : (departments[0] || 'فرع الاستاد'),
        basic_salary: 0,
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

    const validationResult = createEmployeeSchema.safeParse({
        full_name: formData.full_name,
        role: formData.position || 'موظف',
        basic_salary: formData.basic_salary > 0 ? formData.basic_salary : 1,
        hire_date: formData.hire_date,
        is_active: formData.status === 'active',
    });

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
      
      showToast('تم حفظ بيانات الموظف بنجاح ✅', 'success');
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
    if (reason === null) return;

    try {
      await deleteEmployee(id, reason);
      showToast('تم حذف الموظف بنجاح ✅', 'success');
    } catch (error: any) {
      showToast('فشل حذف الموظف: ' + error.message, 'error');
    }
  };

  // حماية الصفحة من مستخدم الديمو
  if (currentUser?.role === 'demo') {
      return (
          <div className="flex flex-col items-center justify-center h-96 text-slate-500 bg-white rounded-3xl border border-slate-200 shadow-sm">
              <Users size={64} className="mb-4 text-slate-300" />
              <h2 className="text-xl font-bold text-slate-700">دليل وبيانات الموظفين غير متاحة</h2>
              <p className="text-sm mt-2">لا يمكن عرض بيانات الموظفين في النسخة التجريبية حفاظاً على الخصوصية.</p>
          </div>
      );
  }

  // إحصائيات سريعة
  const activeEmployeesCount = employees.filter(e => e.status === 'active').length;

  return (
    <div className="space-y-6 animate-in fade-in pb-12">
      {/* رأس الصفحة */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
            <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                  <Users className="w-6 h-6" />
                </div>
                دليل وبيانات الموظفين
            </h2>
            <p className="text-slate-500 mt-1 font-medium text-sm">
              سجل كامل لكافة العاملين بالفروع والإدارات مع إدارة العقود والرواتب
            </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
            <button 
                onClick={() => window.print()}
                title="طباعة الدليل"
                className="px-3.5 py-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-bold text-sm flex items-center gap-2 transition-all"
            >
                <Printer size={17} />
                <span className="hidden sm:inline">طباعة الكشف</span>
            </button>
            <button 
                onClick={() => handleOpenModal()} 
                className="flex-1 sm:flex-none bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-blue-700 shadow-md shadow-blue-200 transition-all hover:scale-105 active:scale-95"
            >
                <Plus size={18} /> إضافة موظف جديد
            </button>
        </div>
      </div>

      {/* شريط الإحصائيات السريعة */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="w-11 h-11 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-black">
            <Users size={20} />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-400">إجمالي الموظفين</div>
            <div className="text-xl font-black text-slate-800">{employees.length}</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="w-11 h-11 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center font-black">
            <UserCheck size={20} />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-400">على رأس العمل (نشط)</div>
            <div className="text-xl font-black text-emerald-700">{activeEmployeesCount}</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="w-11 h-11 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center font-black">
            <Building2 size={20} />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-400">عدد الفروع والأقسام</div>
            <div className="text-xl font-black text-purple-700">{departments.length}</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="w-11 h-11 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center font-black">
            <Filter size={20} />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-400">المعروض بالفلتر</div>
            <div className="text-xl font-black text-amber-700">{filteredEmployees.length}</div>
          </div>
        </div>
      </div>

      {/* أزرار سريعة لاختيار الفرع (Quick Branch Pills) */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Building2 size={15} className="text-blue-600" /> فروع وأقسام الشركة:
          </span>
          {isFiltered && (
            <button 
              onClick={resetFilters}
              className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
            >
              <RotateCcw size={12} /> إعادة ضبط الفلاتر
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
          <button
            onClick={() => setDepartmentFilter('all')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-black shrink-0 transition-all flex items-center gap-1.5 ${
              departmentFilter === 'all'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>كل الفروع</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              departmentFilter === 'all' ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {employees.length}
            </span>
          </button>

          {departments.map(dept => {
            const count = branchCounts[dept] || 0;
            const isSelected = departmentFilter === dept;
            return (
              <button
                key={dept}
                onClick={() => setDepartmentFilter(dept)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-black shrink-0 transition-all flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{dept}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  isSelected ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* شريط الفلاتر المتقدم والبحث */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-wrap items-center gap-3">
        {/* حقل البحث */}
        <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute right-3.5 top-3 text-slate-400" size={18} />
            <input 
                type="text" 
                placeholder="بحث بالاسم، الفرع، الوظيفة، أو الهاتف..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pr-10 pl-8 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')} 
                className="absolute left-3 top-3 text-slate-400 hover:text-slate-600"
              >
                <X size={16} />
              </button>
            )}
        </div>

        {/* فلتر الفرع المنسدل */}
        <div className="min-w-[160px] relative">
            <select 
              value={departmentFilter} 
              onChange={e => setDepartmentFilter(e.target.value)} 
              className="w-full border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-white text-slate-700 cursor-pointer"
            >
                <option value="all">🏢 كل الفروع ({employees.length})</option>
                {departments.map((dept: string) => (
                  <option key={dept} value={dept}>
                    {dept} ({branchCounts[dept] || 0})
                  </option>
                ))}
            </select>
        </div>

        {/* فلتر الحالة */}
        <div className="min-w-[140px]">
            <select 
              value={statusFilter} 
              onChange={e => setStatusFilter(e.target.value)} 
              className="w-full border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-white text-slate-700 cursor-pointer"
            >
                <option value="all">⚡ كل الحالات</option>
                <option value="active">🟢 نشط (على رأس العمل)</option>
                <option value="inactive">🟡 إجازة / غير نشط</option>
                <option value="terminated">🔴 منتهي الخدمات</option>
            </select>
        </div>

        {/* فلتر المسمى الوظيفي */}
        {positions.length > 0 && (
          <div className="min-w-[150px]">
              <select 
                value={positionFilter} 
                onChange={e => setPositionFilter(e.target.value)} 
                className="w-full border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-white text-slate-700 cursor-pointer"
              >
                  <option value="all">💼 كل المسميات الوظيفية</option>
                  {positions.map((pos: string) => (
                    <option key={pos} value={pos}>{pos}</option>
                  ))}
              </select>
          </div>
        )}

        {/* تبديل طريقة العرض (بطاقات / جدول) */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl shrink-0">
          <button
            onClick={() => setViewMode('grid')}
            title="عرض البطاقات"
            className={`p-1.5 rounded-lg transition-all ${
              viewMode === 'grid' ? 'bg-white text-blue-600 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <LayoutGrid size={18} />
          </button>
          <button
            onClick={() => setViewMode('table')}
            title="عرض الجدول"
            className={`p-1.5 rounded-lg transition-all ${
              viewMode === 'table' ? 'bg-white text-blue-600 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <List size={18} />
          </button>
        </div>
      </div>

      {/* محتوى قائمة الموظفين */}
      {contextLoading ? (
        <div className="flex flex-col items-center justify-center p-16 bg-white rounded-2xl border border-slate-200">
          <Loader2 className="animate-spin text-blue-600 mb-3" size={36} />
          <p className="text-slate-500 font-bold text-sm">جاري تحميل بيانات الموظفين...</p>
        </div>
      ) : filteredEmployees.length === 0 ? (
        <div className="p-16 text-center bg-white rounded-2xl border border-slate-200 shadow-sm">
          <Users size={48} className="mx-auto mb-3 text-slate-300" />
          <h3 className="text-lg font-black text-slate-700">لا يوجد موظفون مطابقون لخيارات البحث أو الفلتر</h3>
          <p className="text-slate-400 text-sm mt-1">جرب تغيير الفرع المحدد أو مسح حقل البحث</p>
          {isFiltered && (
            <button 
              onClick={resetFilters} 
              className="mt-4 px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl text-xs font-black transition-colors"
            >
              عرض كل الموظفين
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        /* عرض البطاقات (Grid View) */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredEmployees.map(employee => (
                <div key={employee.id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md hover:border-blue-200 transition-all duration-200 group">
                    <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-gradient-to-tr from-blue-100 to-indigo-50 border border-blue-200 text-blue-700 rounded-2xl flex items-center justify-center font-black text-lg shadow-sm">
                                {employee.full_name?.charAt(0) || 'م'}
                            </div>
                            <div>
                                <h3 className="font-black text-slate-800 group-hover:text-blue-700 transition-colors">
                                  {employee.full_name}
                                </h3>
                                <p className="text-xs text-slate-500 font-bold mt-0.5">
                                  {employee.position || 'موظف'}
                                </p>
                            </div>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${
                          employee.status === 'active' 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                            : employee.status === 'inactive'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
                        }`}>
                            {employee.status === 'active' ? 'نشط' : employee.status === 'inactive' ? 'إجازة' : 'منتهي'}
                        </span>
                    </div>

                    {/* شارة الفرع المميزة */}
                    <div className="mb-3">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50/80 border border-blue-100 text-blue-700 rounded-lg text-xs font-bold">
                        <Building2 size={13} className="text-blue-500" />
                        {employee.department || 'بدون فرع'}
                      </span>
                    </div>
                    
                    <div className="space-y-2 text-xs text-slate-600 mb-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <div className="flex items-center justify-between">
                            <span className="text-slate-400 font-bold flex items-center gap-1.5">
                              <Phone size={13} /> الهاتف:
                            </span>
                            <span dir="ltr" className="font-mono font-bold text-slate-700">{employee.phone || '-'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-slate-400 font-bold flex items-center gap-1.5">
                              <DollarSign size={13} /> الراتب الأساسي:
                            </span>
                            <span className="font-black text-slate-800">
                              {(employee.basic_salary || 0).toLocaleString()} ج.م
                            </span>
                        </div>
                        {employee.hire_date && (
                          <div className="flex items-center justify-between">
                              <span className="text-slate-400 font-bold flex items-center gap-1.5">
                                <Calendar size={13} /> تاريخ التعيين:
                              </span>
                              <span className="text-slate-600 font-medium">{employee.hire_date}</span>
                          </div>
                        )}
                    </div>

                    <div className="flex gap-2 pt-2 border-t border-slate-100">
                        <button 
                          onClick={() => handleOpenModal(employee)} 
                          className="flex-1 py-2 bg-slate-100 text-slate-700 hover:bg-blue-600 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                        >
                            <Edit size={14} /> تعديل
                        </button>
                        <button 
                          onClick={() => handleDelete(employee.id)} 
                          className="py-2 px-3 bg-slate-100 text-slate-500 hover:bg-red-50 hover:text-red-600 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1"
                          title="حذف الموظف"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                </div>
            ))}
        </div>
      ) : (
        /* عرض الجدول (Table View) */
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-black">
                  <th className="p-4 w-12 text-center">#</th>
                  <th className="p-4">اسم الموظف</th>
                  <th className="p-4">الفرع / القسم</th>
                  <th className="p-4">المسمى الوظيفي</th>
                  <th className="p-4">الحالة</th>
                  <th className="p-4">الراتب الأساسي</th>
                  <th className="p-4">الهاتف</th>
                  <th className="p-4">تاريخ التعيين</th>
                  <th className="p-4 text-center w-24">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredEmployees.map((employee, idx) => (
                  <tr key={employee.id} className="hover:bg-blue-50/40 transition-colors">
                    <td className="p-4 text-center text-xs font-bold text-slate-400">{idx + 1}</td>
                    <td className="p-4 font-black text-slate-800">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-black shrink-0">
                          {employee.full_name?.charAt(0) || 'م'}
                        </div>
                        <span>{employee.full_name}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100">
                        <Building2 size={12} className="text-blue-500" />
                        {employee.department || '-'}
                      </span>
                    </td>
                    <td className="p-4 text-slate-600 font-bold text-xs">{employee.position || 'موظف'}</td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                        employee.status === 'active' 
                          ? 'bg-emerald-50 text-emerald-700' 
                          : 'bg-red-50 text-red-700'
                      }`}>
                        {employee.status === 'active' ? 'نشط' : 'غير نشط'}
                      </span>
                    </td>
                    <td className="p-4 font-mono font-bold text-slate-800">
                      {(employee.basic_salary || 0).toLocaleString()} ج.م
                    </td>
                    <td className="p-4 font-mono text-xs text-slate-600" dir="ltr">
                      {employee.phone || '-'}
                    </td>
                    <td className="p-4 text-xs text-slate-500">{employee.hire_date || '-'}</td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleOpenModal(employee)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="تعديل"
                        >
                          <Edit size={15} />
                        </button>
                        <button
                          onClick={() => handleDelete(employee.id)}
                          className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="حذف"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t border-slate-100 bg-slate-50 text-xs font-bold text-slate-500 flex justify-between items-center">
            <span>إجمالي المعروض في الكشف: {filteredEmployees.length} موظف</span>
            <span>TriPro ERP - حلواني لينزا</span>
          </div>
        </div>
      )}

      {/* نافذة الإضافة / التعديل */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in duration-200">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="font-black text-lg text-slate-800 flex items-center gap-2">
                        <Users className="text-blue-600" size={20} />
                        {editingId ? 'تعديل بيانات موظف' : 'إضافة موظف جديد'}
                    </h3>
                    <button 
                      onClick={() => setIsModalOpen(false)}
                      className="text-slate-400 hover:text-red-500 p-1 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                      <X size={20} />
                    </button>
                </div>
                <form onSubmit={handleSave} className="p-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-xs font-black text-slate-700 mb-1.5">
                              الاسم بالكامل <span className="text-red-500">*</span>
                            </label>
                            <input 
                              type="text" 
                              required 
                              value={formData.full_name} 
                              onChange={e => setFormData({...formData, full_name: e.target.value})} 
                              className="w-full border border-slate-200 rounded-xl p-2.5 text-sm font-medium focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" 
                              placeholder="أدخل اسم الموظف..."
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-black text-slate-700 mb-1.5">
                              الفرع / القسم <span className="text-red-500">*</span>
                            </label>
                            <input 
                              type="text" 
                              required
                              list="departments-list"
                              value={formData.department} 
                              onChange={e => setFormData({...formData, department: e.target.value})} 
                              className="w-full border border-slate-200 rounded-xl p-2.5 text-sm font-medium focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" 
                              placeholder="اختر أو اكتب الفرع..."
                            />
                            <datalist id="departments-list">
                              {departments.map((dept: string) => (
                                <option key={dept} value={dept} />
                              ))}
                              <option value="فرع الاستاد" />
                              <option value="فرع الجامعة" />
                              <option value="فرع الجمهورية" />
                              <option value="فرع السويس" />
                              <option value="فرع المقطم" />
                              <option value="فرع طلخا" />
                              <option value="الادارة" />
                            </datalist>
                        </div>

                        <div>
                            <label className="block text-xs font-black text-slate-700 mb-1.5">المسمى الوظيفي</label>
                            <input 
                              type="text" 
                              value={formData.position} 
                              onChange={e => setFormData({...formData, position: e.target.value})} 
                              className="w-full border border-slate-200 rounded-xl p-2.5 text-sm font-medium focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" 
                              placeholder="موظف فرع / كاشير / بائع..."
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-black text-slate-700 mb-1.5">الراتب الأساسي (ج.م)</label>
                            <input 
                              type="number" 
                              min="0"
                              value={formData.basic_salary} 
                              onChange={e => setFormData({...formData, basic_salary: parseFloat(e.target.value) || 0})} 
                              className="w-full border border-slate-200 rounded-xl p-2.5 text-sm font-bold focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" 
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-black text-slate-700 mb-1.5">تاريخ التعيين</label>
                            <input 
                              type="date" 
                              value={formData.hire_date} 
                              onChange={e => setFormData({...formData, hire_date: e.target.value})} 
                              className="w-full border border-slate-200 rounded-xl p-2.5 text-sm font-medium focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" 
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-black text-slate-700 mb-1.5">رقم الهاتف</label>
                            <input 
                              type="text" 
                              value={formData.phone} 
                              onChange={e => setFormData({...formData, phone: e.target.value})} 
                              className="w-full border border-slate-200 rounded-xl p-2.5 text-sm font-medium focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" 
                              placeholder="010XXXXXXXX"
                              dir="ltr"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-black text-slate-700 mb-1.5">الحالة</label>
                            <select 
                              value={formData.status} 
                              onChange={e => setFormData({...formData, status: e.target.value})} 
                              className="w-full border border-slate-200 rounded-xl p-2.5 text-sm font-bold focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none bg-white cursor-pointer"
                            >
                                <option value="active">🟢 نشط (على رأس العمل)</option>
                                <option value="inactive">🟡 إجازة / غير نشط</option>
                                <option value="terminated">🔴 منتهي الخدمات</option>
                            </select>
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-xs font-black text-slate-700 mb-1.5">البريد الإلكتروني (اختياري)</label>
                            <input 
                              type="email" 
                              value={formData.email} 
                              onChange={e => setFormData({...formData, email: e.target.value})} 
                              className="w-full border border-slate-200 rounded-xl p-2.5 text-sm font-medium focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" 
                              placeholder="name@company.com"
                              dir="ltr"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-black text-slate-700 mb-1.5">ملاحظات إضافية</label>
                        <textarea 
                          rows={2} 
                          value={formData.notes} 
                          onChange={e => setFormData({...formData, notes: e.target.value})} 
                          className="w-full border border-slate-200 rounded-xl p-2.5 text-sm font-medium focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                          placeholder="ملاحظات حول الموظف، الفرع، ساعات العمل..."
                        />
                    </div>

                    <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
                        <button 
                          type="button" 
                          onClick={() => setIsModalOpen(false)} 
                          className="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl font-bold text-sm transition-colors"
                        >
                          إلغاء
                        </button>
                        <button 
                          type="submit" 
                          disabled={saving} 
                          className="bg-blue-600 text-white px-7 py-2.5 rounded-xl font-bold text-sm hover:bg-blue-700 flex items-center gap-2 shadow-md shadow-blue-200 disabled:opacity-50 transition-all"
                        >
                            {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />} حفظ البيانات
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
