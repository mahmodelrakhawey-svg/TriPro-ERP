import { logger } from '../../../utils/logger';
import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import { 
  Banknote, Plus, CheckCircle, Loader2, AlertTriangle, 
  AlertCircle, Sparkles, Building2, Briefcase, Calendar, 
  DollarSign, Wallet, X, Percent, UserCheck, FileSpreadsheet, Search, Filter
} from 'lucide-react';
import { createEmployeeAdvanceSchema } from '../../../utils/validationSchemas';
import EmployeeSearchSelect, { EmployeeOption } from '../../../components/EmployeeSearchSelect';

const EmployeeAdvances = () => {
  const { addEntry, getSystemAccount, accounts, currentUser } = useAccounting();
  const { showToast } = useToast();
  const [advances, setAdvances] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [treasuryAccounts, setTreasuryAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'deducted'>('all');
  const [treasuryFilter, setTreasuryFilter] = useState<string>('all');

  const [formData, setFormData] = useState({
    employeeId: '',
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    treasuryId: '', // الخزينة التي سيتم الصرف منها
    notes: ''
  });

  // 🛡️ عزل نطاق الإشراف للموارد البشرية (Factory vs Branches vs All)
  const userHrScope = currentUser?.hr_scope || (currentUser as any)?.user_metadata?.hr_scope || 'all';

  const isFactoryDept = (dept: unknown) => {
    const d = String(dept || '').trim().toLowerCase();
    return d === 'المصنع' || d === 'مصنع' || d === 'factory';
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id;

      if (!userOrgId) return;

      // 1. جلب السلف مع تفاصيل الموظف
      const { data: advData } = await supabase
        .from('employee_advances')
        .select('*, employees(full_name, department, position, basic_salary)')
        .eq('organization_id', userOrgId)
        .order('created_at', { ascending: false });
      if (advData) setAdvances(advData);

      // 2. جلب الموظفين مع كافة الحقول التفصيلية
      const { data: empData } = await supabase
        .from('employees')
        .select('id, full_name, name, position, department, basic_salary, phone, status, deleted_at')
        .eq('organization_id', userOrgId)
        .is('deleted_at', null)
        .order('full_name');

      if (empData) {
        // فلترة الموظفين النشطين مع تطبيق نطاق الإشراف
        let filtered = empData.filter(e => !e.status || e.status === 'active');
        if (userHrScope === 'factory') {
          filtered = filtered.filter(e => isFactoryDept(e.department));
        } else if (userHrScope === 'branches') {
          filtered = filtered.filter(e => !isFactoryDept(e.department));
        }
        setEmployees(filtered);
      }

      // 3. جلب حسابات الخزينة والبنوك
      const { data: accData } = await supabase
        .from('accounts')
        .select('id, name, code')
        .eq('organization_id', userOrgId);
      
      if (accData) {
        const treasuries = accData.filter(a => 
          (a.code && (a.code.startsWith('123') || a.code.startsWith('101') || a.code.startsWith('121'))) ||
          (a.name && (a.name.includes('صندوق') || a.name.includes('خزينة') || a.name.includes('خزينه') || a.name.includes('بنك') || a.name.includes('عهدة')))
        );
        const finalTreasuries = treasuries.length > 0 ? treasuries : accData;
        setTreasuryAccounts(finalTreasuries);
        // تعيين الخزينة الافتراضية إذا لم تكن محددة
        if (finalTreasuries.length > 0 && !formData.treasuryId) {
          setFormData(prev => ({ ...prev, treasuryId: prev.treasuryId || finalTreasuries[0].id }));
        }
      }

    } catch (error) {
      logger.error(error);
      showToast('خطأ في جلب البيانات: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // 💡 إثراء بيانات الموظفين بإحصائيات السلف الذكية الفورية
  const enrichedEmployees: EmployeeOption[] = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const advancesByEmp: Record<string, { 
      outstanding: number; 
      monthTotal: number; 
      lastDate?: string; 
      lastAmount?: number;
      count: number;
    }> = {};

    advances.forEach(adv => {
      const empId = adv.employee_id;
      if (!empId) return;

      if (!advancesByEmp[empId]) {
        advancesByEmp[empId] = { outstanding: 0, monthTotal: 0, count: 0 };
      }

      const amt = Number(adv.amount || 0);

      // السلف القائمة غير المسواة (تم صرفها ولم تخصم بعد في مسير الرواتب)
      if (adv.status === 'paid' && !adv.payroll_item_id) {
        advancesByEmp[empId].outstanding += amt;
        advancesByEmp[empId].count += 1;
      }

      // سلف الشهر الحالي
      const dStr = adv.request_date || adv.advance_date || adv.created_at;
      if (dStr) {
        const d = new Date(dStr);
        if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
          advancesByEmp[empId].monthTotal += amt;
        }
      }

      // آخر سلفة منصرفة
      if (!advancesByEmp[empId].lastDate && dStr) {
        advancesByEmp[empId].lastDate = dStr.split('T')[0];
        advancesByEmp[empId].lastAmount = amt;
      }
    });

    return employees.map(emp => {
      const stats = advancesByEmp[emp.id] || { outstanding: 0, monthTotal: 0, count: 0 };
      return {
        ...emp,
        outstanding_advances: stats.outstanding,
        month_advances: stats.monthTotal,
        last_advance_date: stats.lastDate,
        last_advance_amount: stats.lastAmount,
        active_advances_count: stats.count
      };
    });
  }, [employees, advances]);

  // الموظف المختار حالياً مع كافة بياناته الذكية
  const selectedEmployee = useMemo(() => {
    return enrichedEmployees.find(e => e.id === formData.employeeId);
  }, [enrichedEmployees, formData.employeeId]);

  // حساب النسبة المئوية للسلفة من الراتب الأساسي
  const advancePercentage = useMemo(() => {
    if (!selectedEmployee || !selectedEmployee.basic_salary || selectedEmployee.basic_salary <= 0 || !formData.amount) {
      return 0;
    }
    return Math.round((formData.amount / selectedEmployee.basic_salary) * 100);
  }, [selectedEmployee, formData.amount]);

  // تعيين مبلغ سريع بنسبة مئوية
  const setQuickPercentage = (percent: number) => {
    if (!selectedEmployee?.basic_salary) return;
    const calcAmount = Math.round((selectedEmployee.basic_salary * percent) / 100);
    setFormData(prev => ({ ...prev, amount: calcAmount }));
  };

  // تعيين مبلغ مقطوع سريع
  const setQuickAmount = (amt: number) => {
    setFormData(prev => ({ ...prev, amount: amt }));
  };

  // خريطة الحسابات لربط السلف باسم الخزينة بدقة
  const accountsMap = useMemo(() => {
    const map: Record<string, string> = {};
    (accounts || []).forEach(a => { if (a?.id) map[a.id] = a.name; });
    (treasuryAccounts || []).forEach(a => { if (a?.id) map[a.id] = a.name; });
    return map;
  }, [accounts, treasuryAccounts]);

  // دالة تحديد اسم الخزينة للسلفة
  const getAdvanceTreasuryName = (adv: Record<string, any>): string => {
    if (adv.treasury_account_id && accountsMap[adv.treasury_account_id]) {
      return accountsMap[adv.treasury_account_id];
    }
    if (adv.treasury_account?.name) {
      return adv.treasury_account.name;
    }
    // استدلال ذكي من قسم الموظف في حال كانت سلفة سابقة لم يسجل فيها الخزينة
    const dept = adv.employees?.department || '';
    if (dept.includes('مصنع') || dept.includes('المصنع')) {
      const factoryTreasury = treasuryAccounts.find(t => t.name.includes('مصنع') || t.name.includes('المصنع'));
      if (factoryTreasury) return factoryTreasury.name;
    }
    const defaultTreasury = treasuryAccounts[0]?.name || accounts?.find(a => a.name.includes('خزينة') || a.name.includes('صندوق'))?.name;
    return defaultTreasury || 'الخزينة الرئيسية';
  };

  // تصفية السلف بناءً على البحث وحالة السلفة والخزينة
  const filteredAdvances = useMemo(() => {
    return advances.filter(adv => {
      const empName = adv.employees?.full_name?.toLowerCase() || '';
      const dept = adv.employees?.department?.toLowerCase() || '';
      const pos = adv.employees?.position?.toLowerCase() || '';
      const notes = adv.notes?.toLowerCase() || '';
      const treasuryName = getAdvanceTreasuryName(adv).toLowerCase();
      const term = searchTerm.toLowerCase().trim();

      const matchesSearch = !term || empName.includes(term) || dept.includes(term) || pos.includes(term) || notes.includes(term) || treasuryName.includes(term);
      const matchesStatus = statusFilter === 'all' || adv.status === statusFilter;
      const matchesTreasury = treasuryFilter === 'all' || 
        adv.treasury_account_id === treasuryFilter ||
        (accountsMap[treasuryFilter] && getAdvanceTreasuryName(adv) === accountsMap[treasuryFilter]);

      return matchesSearch && matchesStatus && matchesTreasury;
    });
  }, [advances, searchTerm, statusFilter, treasuryFilter, accountsMap, treasuryAccounts]);

  // تصدير سجل السلف إلى ملف Excel منسق واحترافي
  const handleExportExcel = () => {
    if (filteredAdvances.length === 0) {
      showToast('لا توجد سلف مطابقة للتصدير', 'warning');
      return;
    }

    const rows = filteredAdvances.map((adv, idx) => {
      const emp = adv.employees;
      const statusLabel = adv.status === 'paid' ? 'تم الصرف (قائمة)' : adv.status === 'deducted' ? 'تم الخصم من الراتب' : adv.status || '-';
      const treasuryName = getAdvanceTreasuryName(adv);
      return {
        'م': idx + 1,
        'اسم الموظف': emp?.full_name || 'موظف غير معرف',
        'القسم / الفرع': emp?.department || '-',
        'المسمى الوظيفي': emp?.position || '-',
        'الراتب الأساسي (ج.م)': Number(emp?.basic_salary) || 0,
        'مبلغ السلفة (ج.م)': Number(adv.amount) || 0,
        'الخزينة المنصرف منها': treasuryName,
        'تاريخ السلفة': adv.request_date || adv.advance_date || adv.created_at?.split('T')[0] || '-',
        'حالة السلفة': statusLabel,
        'ملاحظات / البيان': adv.notes || '-'
      };
    });

    // إضافة صف الإجمالي في نهاية الشيت
    const totalAmount = filteredAdvances.reduce((sum, adv) => sum + Number(adv.amount || 0), 0);
    rows.push({
      'م': '' as any,
      'اسم الموظف': 'الإجمالي العام للسلف المحددة',
      'القسم / الفرع': '',
      'المسمى الوظيفي': '',
      'الراتب الأساسي (ج.م)': '' as any,
      'مبلغ السلفة (ج.م)': totalAmount,
      'الخزينة المنصرف منها': '',
      'تاريخ السلفة': '',
      'حالة السلفة': `عدد السلف: ${filteredAdvances.length}`,
      'ملاحظات / البيان': ''
    });

    const ws = XLSX.utils.json_to_sheet(rows);

    ws['!cols'] = [
      { wch: 6 },  // م
      { wch: 25 }, // اسم الموظف
      { wch: 18 }, // القسم
      { wch: 18 }, // المسمى الوظيفي
      { wch: 18 }, // الراتب الأساسي
      { wch: 18 }, // مبلغ السلفة
      { wch: 22 }, // الخزينة المنصرف منها
      { wch: 16 }, // تاريخ السلفة
      { wch: 20 }, // حالة السلفة
      { wch: 30 }  // ملاحظات
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'سلف الموظفين');
    XLSX.writeFile(wb, `سجل_سلف_الموظفين_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast(`تم تصدير ${filteredAdvances.length} سلفة إلى Excel بنجاح ✅`, 'success');
  };

  const handleOpenModal = () => {
    setFormData({
      employeeId: '',
      amount: 0,
      date: new Date().toISOString().split('T')[0],
      treasuryId: treasuryAccounts[0]?.id || '',
      notes: ''
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.employeeId) {
      showToast('يرجى اختيار الموظف أولاً', 'warning');
      return;
    }

    if (!formData.amount || formData.amount <= 0) {
      showToast('مبلغ السلفة يجب أن يكون أكبر من 0', 'warning');
      return;
    }

    if (!formData.treasuryId) {
      showToast('يرجى تحديد حساب الخزينة أو البنك للصرف منه', 'warning');
      return;
    }

    // التحقق بواسطة المخطط المركزي
    const validationResult = createEmployeeAdvanceSchema.safeParse({
      employee_id: formData.employeeId,
      amount: formData.amount,
      advance_date: formData.date,
      notes: formData.notes,
    });
    if (!validationResult.success) {
      showToast(validationResult.error.issues[0].message, 'warning');
      return;
    }
    
    setSaving(true);
    try {
      const orgId = (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;
      if (!orgId && currentUser?.role !== 'super_admin') throw new Error('تعذر تحديد المنظمة.');

      const employee = employees.find(e => e.id === formData.employeeId);
      const reference = `ADV-${Date.now().toString().slice(-6)}`;

      // 1. حفظ السلفة
      const { error: advError } = await supabase.from('employee_advances').insert({
        organization_id: orgId,
        employee_id: formData.employeeId,
        amount: formData.amount,
        request_date: formData.date,
        status: 'paid', // نعتبرها مدفوعة فوراً للتبسيط
        notes: formData.notes,
        treasury_account_id: formData.treasuryId, // حفظ حساب الخزينة
        reference: reference // حفظ المرجع
      });

      if (advError) throw advError;

      // 2. إنشاء القيد المحاسبي
      // من ح/ سلف العاملين (1223)
      // إلى ح/ الخزينة أو البنك
      const advancesAcc = getSystemAccount('EMPLOYEE_ADVANCES') || accounts.find(a => a.code === '1223');

      if (advancesAcc) {
        await addEntry({
          date: formData.date,
          description: `صرف سلفة للموظف ${employee?.full_name}`,
          reference: reference,
          status: 'posted',
          lines: [
            { account_id: advancesAcc.id, accountId: advancesAcc.id, debit: formData.amount, credit: 0, description: `سلفة موظف - ${employee?.full_name}` },
            { account_id: formData.treasuryId, accountId: formData.treasuryId, debit: 0, credit: formData.amount, description: `صرف نقدية لسلفة` }
          ]
        });
      } else {
        showToast('تنبيه: تم حفظ السلفة ولكن لم يتم إنشاء القيد لعدم العثور على حساب "سلف الموظفين" (1223).', 'warning');
      }
      
      showToast('تم حفظ السلفة وترحيل القيد بنجاح ✅', 'success');
      setIsModalOpen(false);
      setFormData({ 
        employeeId: '', 
        amount: 0, 
        date: new Date().toISOString().split('T')[0], 
        treasuryId: treasuryAccounts[0]?.id || '', 
        notes: '' 
      });
      fetchData();

    } catch (error) {
      logger.error(error);
      showToast('حدث خطأ: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // حماية الصفحة من مستخدم الديمو
  if (currentUser?.role === 'demo') {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-slate-500 bg-white rounded-3xl border border-slate-200 shadow-sm">
        <Banknote size={64} className="mb-4 text-slate-300" />
        <h2 className="text-xl font-bold text-slate-700">سلف الموظفين غير متاحة</h2>
        <p className="text-sm mt-2">لا يمكن إدارة السلف والقروض في النسخة التجريبية.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in" dir="rtl">
      {/* الترويسة الرئيسية */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Banknote className="text-blue-600" /> سلف الموظفين
          </h2>
          <p className="text-slate-500 text-sm mt-0.5">
            إدارة السلف الشخصية، صرف النقدية، والمتابعة والخصم من الرواتب
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button 
            onClick={handleExportExcel}
            className="bg-emerald-600 text-white px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-emerald-700 shadow-sm active:scale-95 transition-all"
            title="تصدير السلف إلى ملف Excel"
          >
            <FileSpreadsheet size={17} />
            <span>تصدير Excel</span>
          </button>
          <button 
            onClick={handleOpenModal} 
            className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-blue-700 shadow-sm active:scale-95 transition-all"
          >
            <Plus size={18} /> تسجيل سلفة جديدة
          </button>
        </div>
      </div>

      {/* شريط البحث وفلترة الحالة والخزينة */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="البحث باسم الموظف، القسم، الخزينة، الوظيفة، أو الملاحظات..."
            className="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
          />
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
          {/* فلتر الخزينة المنصرف منها */}
          {treasuryAccounts.length > 0 && (
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-bold text-slate-700">
              <Wallet size={14} className="text-slate-500 mr-1.5 shrink-0" />
              <select
                value={treasuryFilter}
                onChange={e => setTreasuryFilter(e.target.value)}
                className="bg-transparent outline-none text-xs font-bold text-slate-700 cursor-pointer pr-1"
              >
                <option value="all">كافة الخزن ({advances.length})</option>
                {treasuryAccounts.map(acc => {
                  const count = advances.filter(a => 
                    a.treasury_account_id === acc.id || 
                    (!a.treasury_account_id && getAdvanceTreasuryName(a) === acc.name)
                  ).length;
                  return (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({count})
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {/* أزرار فلترة الحالة */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold text-slate-600 w-full md:w-auto justify-center">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition-all ${statusFilter === 'all' ? 'bg-white text-blue-600 shadow-xs font-black' : 'hover:text-slate-800'}`}
            >
              الكل ({advances.length})
            </button>
            <button
              onClick={() => setStatusFilter('paid')}
              className={`px-3 py-1.5 rounded-lg transition-all ${statusFilter === 'paid' ? 'bg-white text-emerald-600 shadow-xs font-black' : 'hover:text-slate-800'}`}
            >
              قائمة ({advances.filter(a => a.status === 'paid').length})
            </button>
            <button
              onClick={() => setStatusFilter('deducted')}
              className={`px-3 py-1.5 rounded-lg transition-all ${statusFilter === 'deducted' ? 'bg-white text-blue-700 shadow-xs font-black' : 'hover:text-slate-800'}`}
            >
              مخصومة ({advances.filter(a => a.status === 'deducted').length})
            </button>
          </div>
        </div>
      </div>

      {/* جدول السلف المسجلة */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-slate-50 text-slate-600 font-bold text-xs uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="p-4">الموظف</th>
                <th className="p-4">القسم / الوظيفة</th>
                <th className="p-4">تاريخ الطلب</th>
                <th className="p-4">المبلغ</th>
                <th className="p-4">الخزينة المنصرف منها</th>
                <th className="p-4">الحالة</th>
                <th className="p-4">ملاحظات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredAdvances.map(adv => (
                <tr key={adv.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-4">
                    <div className="font-bold text-slate-800 flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">
                        {(adv.employees?.full_name || 'م')[0]}
                      </div>
                      <span>{adv.employees?.full_name || 'موظف غير معرف'}</span>
                    </div>
                  </td>
                  <td className="p-4 text-xs text-slate-500">
                    <div className="flex flex-col gap-0.5">
                      {adv.employees?.department && (
                        <span className="font-semibold text-slate-700">{adv.employees.department}</span>
                      )}
                      {adv.employees?.position && (
                        <span className="text-slate-400">{adv.employees.position}</span>
                      )}
                      {!adv.employees?.department && !adv.employees?.position && <span>-</span>}
                    </div>
                  </td>
                  <td className="p-4 text-slate-600">{adv.request_date || adv.advance_date}</td>
                  <td className="p-4 font-bold text-blue-600">
                    {Number(adv.amount).toLocaleString()} ج.م
                  </td>
                  <td className="p-4">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200/60 text-slate-700 text-xs font-bold">
                      <Wallet size={13} className="text-emerald-600 shrink-0" />
                      <span className="truncate max-w-[130px]" title={getAdvanceTreasuryName(adv)}>
                        {getAdvanceTreasuryName(adv)}
                      </span>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1 ${
                      adv.status === 'paid' 
                        ? 'bg-emerald-100 text-emerald-700' 
                        : adv.status === 'deducted'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {adv.status === 'paid' ? 'تم الصرف (قائمة)' : adv.status === 'deducted' ? 'تم الخصم من الراتب' : adv.status}
                    </span>
                  </td>
                  <td className="p-4 text-slate-500 text-xs max-w-xs truncate">{adv.notes || '-'}</td>
                </tr>
              ))}
              {filteredAdvances.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-400">
                    <Banknote size={40} className="mx-auto mb-2 text-slate-300" />
                    <p className="font-bold">لا توجد سلف مطابقة للبحث أو التصفية الحالية</p>
                    <p className="text-xs text-slate-400 mt-1">جرّب تغيير عبارة البحث أو اختيار خزينة أو حالة سلف مختلفة</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* مودال تسجيل سلفة جديدة فائق الذكاء والسرعة */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col">
            
            {/* رأس المودال */}
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
                  <Banknote size={22} />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-800">تسجيل سلفة جديدة</h3>
                  <p className="text-xs text-slate-400">اختيار ذكي للموظف مع فحص الرصيد والراتب</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* محتوى النموذج */}
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-4">
              
              {/* 1. قائمة الموظفين الذكية والسريعة */}
              <EmployeeSearchSelect
                label="الموظف المستفيد"
                value={formData.employeeId}
                onChange={(empId) => {
                  setFormData(prev => ({ ...prev, employeeId: empId }));
                }}
                employees={enrichedEmployees}
                required
                autoFocus
                placeholder="ابحث بالاسم، القسم، الوظيفة، أو الهاتف..."
              />

              {/* 2. بطاقة معلومات ومؤشرات الموظف المالية الذكية (تظهر فور اختيار الموظف) */}
              {selectedEmployee && (
                <div className="bg-gradient-to-br from-slate-50 to-blue-50/30 border border-blue-100 rounded-2xl p-4 space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between pb-2 border-b border-blue-100/60">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-xs">
                        {(selectedEmployee.full_name || 'م')[0]}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-800">{selectedEmployee.full_name}</div>
                        <div className="text-xs text-slate-500 flex items-center gap-2">
                          {selectedEmployee.department && <span>{selectedEmployee.department}</span>}
                          {selectedEmployee.department && selectedEmployee.position && <span>•</span>}
                          {selectedEmployee.position && <span>{selectedEmployee.position}</span>}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center gap-1">
                      <UserCheck size={12} /> موظف نشط
                    </span>
                  </div>

                  {/* شبكة المؤشرات المالية الفورية */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-white p-2.5 rounded-xl border border-slate-100 shadow-2xs">
                      <div className="text-[11px] text-slate-500 font-medium mb-0.5">الراتب الأساسي</div>
                      <div className="text-sm font-bold text-emerald-700">
                        {(selectedEmployee.basic_salary ?? 0) > 0 
                          ? `${Number(selectedEmployee.basic_salary).toLocaleString()} ج.م` 
                          : 'غير مسجل'}
                      </div>
                    </div>

                    <div className="bg-white p-2.5 rounded-xl border border-slate-100 shadow-2xs">
                      <div className="text-[11px] text-slate-500 font-medium mb-0.5">سلف قائمة غير مسواة</div>
                      <div className={`text-sm font-bold ${
                        (selectedEmployee.outstanding_advances ?? 0) > 0 ? 'text-amber-600' : 'text-slate-600'
                      }`}>
                        {Number(selectedEmployee.outstanding_advances ?? 0).toLocaleString()} ج.م
                      </div>
                    </div>

                    <div className="bg-white p-2.5 rounded-xl border border-slate-100 shadow-2xs">
                      <div className="text-[11px] text-slate-500 font-medium mb-0.5">سلف هذا الشهر</div>
                      <div className="text-sm font-bold text-blue-600">
                        {Number(selectedEmployee.month_advances ?? 0).toLocaleString()} ج.م
                      </div>
                    </div>
                  </div>

                  {/* تنبيه ذكي إذا كان لديه سلف معلقة */}
                  {(selectedEmployee.outstanding_advances ?? 0) > 0 && (
                    <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                      <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <strong>تنبيه إداري:</strong> الموظف لديه سلفة قائمة غير مخصومة بقيمة{' '}
                        <strong>{Number(selectedEmployee.outstanding_advances).toLocaleString()} ج.م</strong>.
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 3. حقل مبلغ السلفة مع المساعد الذكي */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-sm font-bold text-slate-700 flex items-center gap-1.5">
                    <DollarSign size={15} className="text-blue-600" />
                    <span>مبلغ السلفة المطلوبة</span>
                    <span className="text-red-500">*</span>
                  </label>
                  {advancePercentage > 0 && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                      advancePercentage > 100 
                        ? 'bg-rose-100 text-rose-700' 
                        : advancePercentage > 50 
                        ? 'bg-amber-100 text-amber-700' 
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {advancePercentage}% من الراتب الأساسي
                    </span>
                  )}
                </div>

                <div className="relative">
                  <input 
                    type="number" 
                    required 
                    min="1" 
                    placeholder="أدخل المبلغ..."
                    className="w-full border border-slate-200 rounded-xl p-2.5 text-slate-800 font-bold text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all shadow-xs" 
                    value={formData.amount || ''} 
                    onChange={e => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })} 
                  />
                  <span className="absolute left-3 top-3 text-xs font-bold text-slate-400 pointer-events-none">
                    ج.م
                  </span>
                </div>

                {/* أزرار المبالغ الذكية السريعة */}
                {selectedEmployee && (selectedEmployee.basic_salary ?? 0) > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-slate-400 font-medium flex items-center gap-1 ml-1">
                      <Sparkles size={12} className="text-blue-500" /> مبالغ سريعة:
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuickPercentage(25)}
                      className="px-2 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-600 rounded-lg text-xs font-bold transition-colors"
                    >
                      25% ({Math.round((selectedEmployee.basic_salary || 0) * 0.25).toLocaleString()})
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickPercentage(50)}
                      className="px-2 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-600 rounded-lg text-xs font-bold transition-colors"
                    >
                      50% ({Math.round((selectedEmployee.basic_salary || 0) * 0.5).toLocaleString()})
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickPercentage(100)}
                      className="px-2 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-600 rounded-lg text-xs font-bold transition-colors"
                    >
                      راتب كامل (100%)
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickAmount(500)}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-medium transition-colors"
                    >
                      500
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickAmount(1000)}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-medium transition-colors"
                    >
                      1,000
                    </button>
                  </div>
                )}

                {/* تحذير تجاوز الراتب */}
                {selectedEmployee && (selectedEmployee.basic_salary ?? 0) > 0 && formData.amount > (selectedEmployee.basic_salary || 0) && (
                  <div className="mt-2 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
                    <AlertTriangle size={15} className="text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <strong>تحذير تجاوز الراتب:</strong> مبلغ السلفة المطلوب ({formData.amount.toLocaleString()} ج.م) أكبر من الراتب الأساسي للموظف ({Number(selectedEmployee.basic_salary).toLocaleString()} ج.م).
                    </div>
                  </div>
                )}
              </div>

              {/* 4. الحقول المالية: تاريخ الصرف وحساب الخزينة */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                    <Calendar size={15} className="text-blue-600" />
                    <span>تاريخ الصرف</span>
                    <span className="text-red-500">*</span>
                  </label>
                  <input 
                    type="date" 
                    required 
                    className="w-full border border-slate-200 rounded-xl p-2.5 text-sm text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all shadow-xs" 
                    value={formData.date} 
                    onChange={e => setFormData({ ...formData, date: e.target.value })} 
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                    <Wallet size={15} className="text-blue-600" />
                    <span>صرف من (الخزينة/البنك)</span>
                    <span className="text-red-500">*</span>
                  </label>
                  <select 
                    required 
                    className="w-full border border-slate-200 rounded-xl p-2.5 text-sm text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all shadow-xs bg-white" 
                    value={formData.treasuryId} 
                    onChange={e => setFormData({ ...formData, treasuryId: e.target.value })}
                  >
                    <option value="">اختر الحساب...</option>
                    {treasuryAccounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 5. ملاحظات */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">سبب السلفة / ملاحظات</label>
                <textarea 
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-sm text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all shadow-xs" 
                  rows={2} 
                  placeholder="سبب طلب السلفة، طريقة الاستقطاع، أو أي تفاصيل إضافية..."
                  value={formData.notes} 
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>

              {/* أزرار الحفظ والإلغاء */}
              <div className="flex gap-3 pt-3 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)} 
                  className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                >
                  إلغاء
                </button>
                <button 
                  type="submit" 
                  disabled={saving} 
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 flex justify-center items-center gap-2 shadow-sm transition-all"
                >
                  {saving ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle size={18} />}
                  <span>حفظ وصرف السلفة</span>
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeAdvances;
