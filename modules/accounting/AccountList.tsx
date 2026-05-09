﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import React, { useState, useMemo } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { Folder, FileText, ChevronRight, ChevronDown, Plus, Search, Download, Trash2, Edit, FolderOpen, ExternalLink, X, Edit2, RefreshCw, Wrench, Sparkles } from 'lucide-react';
import * as XLSX from 'xlsx';
import AddAccountModal from './AddAccountModal';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';

const AccountList = () => {
  const { accounts, deleteAccount, refreshData, isLoading, can } = useAccounting();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState(''); // Removed unused `isLoading` from useAccounting
  const [showOnlyGroups, setShowOnlyGroups] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any | null>(null);

  // قائمة الحسابات المحمية (الأساسية في الدليل المصري) التي لا يجب حذفها أو تعديلها لضمان سلامة الهيكل.
  const PROTECTED_SYSTEM_ACCOUNT_CODES = [
    // المستوى 1
    '1', '2', '3', '4', '5',
    // المستوى 2
    '11', '12', '21', '22', '31', '41', '51', '52', '53',
    // المستوى 3 و 4 (عامة وخاصة بالمطاعم من initialize_egyptian_coa و SYSTEM_ACCOUNTS)
    '103', // المخزون (group)
    '10301', // مخزون المواد الخام
    '10302', // مخزون المنتج التام
    '10303', // مخزون إنتاج تحت التشغيل (WIP)
    '513',   // أجور عمال الإنتاج المباشرة
    '514',   // تكاليف صناعية غير مباشرة (Group)
    '5121',  // تكلفة الهالك والفاقد
    '10306', // بضائع بغرض البيع (تجارية)
    '10307', // اعتمادات مستندية لشراء بضائع
    '121', // مخزون الأغذية والمشروبات (restaurant specific)
    '122', // العملاء والمدينون (group)
    '1221', // العملاء
    '1222', // أوراق القبض
    '1223', // سلف الموظفين
    '123', // النقدية وما في حكمها (group)
    '1231', // النقدية بالصناديق
    '1232', // الحسابات الجارية بالبنوك (group)
    '123201', // البنك الأهلي المصري
    '124', // أرصدة مدينة أخرى (group)
    '1241', // ضريبة القيمة المضافة (مدخلات)
    '111', // الأصول الثابتة (بالصافي) - group
    '1119', // مجمع الإهلاك
    '201', // الموردين
    '222', // أوراق الدفع
    '223', // مصلحة الضرائب (التزامات) - group
    '2231', // ضريبة القيمة المضافة (مخرجات)
    '2232', // ضريبة الخصم والتحصيل
    '224', // هيئة التأمينات الاجتماعية
    '226', // تأمينات العملاء
    '31', // رأس المال المدفوع (group)
    '32', // الأرباح (الخسائر) المرحبة
    '3999', // حساب الأرصدة الافتتاحية
    '411', // إيرادات المبيعات (صالة/تيك أوي) / مبيعات سلع ومنتجات
    '412', // إيرادات التوصيل (Delivery) / مردودات ومسموحات مبيعات
    '413', // خصم مسموح به
    '421', // إيرادات متنوعة
    '422', // إيراد خصومات وجزاءات الموظفين
    '423', // فوائد بنكية دائنة
    '511', // تكلفة البضاعة المباعة / تكلفة المواد الخام المستهلكة
    '512', // تسويات جردية (عجز/زيادة) / تكلفة الهالك والضيافة
    '5201', // الأجور والمرتبات
    '531', // أجور عمال الإنتاج
    '5312', // مكافآت وحوافز
    '533', // مصروف الإهلاك
    '534', // مصروفات بنكية
    '535', // كهرباء ومياه وغاز
    '541', // تسوية عجز الصندوق
  ];

  // دالة لتبديل حالة التوسيع للمجموعات
  const toggleGroup = (accountId: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [accountId]: !prev[accountId]
    }));
  };

  const handleOpenModal = () => {
    // عند فتح المودال لإضافة حساب جديد، يجب التأكد من أن الحسابات المحمية لا تظهر كأب افتراضي
    // أو على الأقل لا يمكن اختيارها كحساب فرعي إذا كانت هي نفسها محمية.
    setEditingAccount(null);
    setIsModalOpen(true);
  };

  const handleEdit = (account: any) => {
    if (PROTECTED_SYSTEM_ACCOUNT_CODES.includes(account.code)) {
        if (!window.confirm(`تنبيه: الحساب "${account.name}" هو حساب نظام أساسي.\nتعديله قد يؤثر على التقارير الآلية.\n\nهل أنت متأكد من رغبتك في التعديل؟`)) {
            return;
        }
    }
    setEditingAccount(account);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string, name: string, balance: number) => {
    const account = accounts.find(a => a.id === id);
    if (account && PROTECTED_SYSTEM_ACCOUNT_CODES.includes(account.code)) {
        showToast(`تنبيه: لا يمكن حذف الحساب "${name}" لأنه حساب نظام أساسي ضروري لاستقرار التقارير.`, 'warning');
        return;
    }

    const hasChildren = accounts.some(a => (a as any).parent_id === id);
    if (hasChildren) {
        showToast('لا يمكن حذف حساب رئيسي يحتوي على حسابات فرعية. يرجى حذف الحسابات الفرعية أولاً.', 'warning');
        return;
    }
    if (balance !== 0) {
        showToast('لا يمكن حذف حساب عليه رصيد. يرجى تصفية الرصيد أولاً.', 'warning');
        return;
    }
    if (window.confirm(`هل أنت متأكد من حذف الحساب "${name}"؟ سيتم نقله إلى سلة المحذوفات. لا يمكن التراجع عن هذا الإجراء إذا كان الحساب مرتبطاً بقيود.`)) {
        const reason = prompt("الرجاء إدخال سبب الحذف (إلزامي):");
        if (reason) {
            const res = await deleteAccount(id, reason);
            if (!res.success) {
                showToast(`فشل حذف الحساب: ${res.message}`, 'error');
            }
        }
    }
  };

  const handleResetBalances = async () => {
    if (window.confirm('تنبيه هام: هذا الإجراء سيقوم بتصفير عمود "الرصيد" لجميع الحسابات في قاعدة البيانات.\n\nاستخدم هذا الخيار فقط إذا قمت بتنظيف البيانات وما زالت هناك أرصدة معلقة في الجدول.')) {
        try {
            const { error } = await supabase.from('accounts').update({ balance: 0 }).neq('id', '00000000-0000-0000-0000-000000000000');
            if (error) throw error;
            showToast('تم تصفير أرصدة الحسابات في قاعدة البيانات بنجاح.', 'success');
            refreshData();
        } catch (error: any) {
            showToast('فشل تصفير الأرصدة: ' + error.message, 'error');
        }
    }
  };

  const handleAutoFixAccountTypes = async () => {
    if (!can('accounting', 'update')) {
      showToast('ليس لديك صلاحية لتعديل الحسابات.', 'error');
      return;
    }

    if (!window.confirm('هل أنت متأكد من إصلاح أنواع الحسابات تلقائياً؟\nسيتم تعديل نوع الحساب (أصول، خصوم، إيرادات، مصروفات، حقوق ملكية) بناءً على بادئة كود الحساب.\n\nلا يمكن التراجع عن هذا الإجراء.')) {
      return;
    }

    showToast('جاري إصلاح أنواع الحسابات تلقائياً...', 'info');
    let updatedCount = 0;
    const updates = [];

    for (const acc of accounts) {
      if (acc.isGroup) continue; // لا نعدل أنواع الحسابات التجميعية

      let expectedType = '';
      const codePrefix = acc.code.charAt(0);

      if (codePrefix === '1') expectedType = 'ASSET';
      else if (codePrefix === '2') expectedType = 'LIABILITY';
      else if (codePrefix === '3') expectedType = 'EQUITY';
      else if (codePrefix === '4') expectedType = 'REVENUE';
      else if (codePrefix === '5') expectedType = 'EXPENSE';

      if (expectedType && acc.type.toUpperCase() !== expectedType) {
        updates.push(supabase.from('accounts').update({ type: expectedType }).eq('id', acc.id));
        updatedCount++;
      }
    }

    if (updates.length === 0) {
      showToast('جميع أنواع الحسابات مطابقة لأكوادها. لا توجد حاجة للإصلاح.', 'success');
      return;
    }

    try {
      await Promise.all(updates);
      showToast(`تم إصلاح ${updatedCount} حساب بنجاح.`, 'success');
      refreshData(); // إعادة تحميل البيانات بعد التحديث
    } catch (error: any) {
      console.error('Error auto-fixing account types:', error);
      showToast('فشل إصلاح أنواع الحسابات: ' + error.message, 'error');
    }
  };

  const handleCreateMissingAccounts = async () => {
    if (!window.confirm('هل تريد فحص وإنشاء الحسابات الأساسية المفقودة؟\nسيقوم النظام بإنشاء الحسابات الضرورية للتقارير والقيود الآلية إذا لم تكن موجودة.')) {
      return;
    }

    setEditingAccount(null); // تأمين حالة التحميل
    showToast('جاري فحص الحسابات المفقودة...', 'info');

    // قائمة الحسابات الأساسية المطلوبة (بالترتيب الهرمي)
    const essentialTemplate = [
      { code: '1', name: 'الأصول', type: 'ASSET', is_group: true, parent_code: null },
      { code: '2', name: 'الخصوم (الإلتزامات)', type: 'LIABILITY', is_group: true, parent_code: null },
      { code: '3', name: 'حقوق الملكية', type: 'EQUITY', is_group: true, parent_code: null },
      { code: '4', name: 'الإيرادات', type: 'REVENUE', is_group: true, parent_code: null },
      { code: '5', name: 'المصروفات', type: 'EXPENSE', is_group: true, parent_code: null },
      { code: '11', name: 'الأصول غير المتداولة', type: 'ASSET', is_group: true, parent_code: '1' },
      { code: '12', name: 'الأصول المتداولة', type: 'ASSET', is_group: true, parent_code: '1' },
      { code: '22', name: 'الخصوم المتداولة', type: 'LIABILITY', is_group: true, parent_code: '2' },
      { code: '103', name: 'المخزون', type: 'ASSET', is_group: true, parent_code: '12' },
      { code: '10301', name: 'مخزون المواد الخام', type: 'ASSET', is_group: false, parent_code: '103' },
      { code: '10302', name: 'مخزون المنتج التام', type: 'ASSET', is_group: false, parent_code: '103' },
      { code: '10303', name: 'مخزون إنتاج تحت التشغيل (WIP)', type: 'ASSET', is_group: false, parent_code: '103' },
      { code: '1221', name: 'العملاء', type: 'ASSET', is_group: false, parent_code: '12' },
      { code: '1231', name: 'النقدية بالصندوق', type: 'ASSET', is_group: false, parent_code: '12' },
      { code: '201', name: 'الموردين', type: 'LIABILITY', is_group: false, parent_code: '22' },
      { code: '3999', name: 'الأرصدة الافتتاحية (حساب وسيط)', type: 'EQUITY', is_group: false, parent_code: '3' },
      { code: '411', name: 'إيراد المبيعات', type: 'REVENUE', is_group: false, parent_code: '4' },
      { code: '511', name: 'تكلفة البضاعة المباعة', type: 'EXPENSE', is_group: false, parent_code: '5' },
      { code: '53', name: 'المصروفات الإدارية والعمومية', type: 'EXPENSE', is_group: true, parent_code: '5' },
      { code: '541', name: 'تسوية عجز الصندوق', type: 'EXPENSE', is_group: false, parent_code: '53' },
    ];

    let createdCount = 0;

    try {
      // جلب معرف المنظمة الحالي
      const { data: { user } } = await supabase.auth.getUser();
      const orgId = user?.user_metadata?.org_id;

      if (!orgId) throw new Error('تعذر تحديد معرف المنظمة');

      // معالجة القالب بالتتابع لضمان وجود الأب قبل الابن
      for (const item of essentialTemplate) {
        // فحص هل الحساب موجود مسبقاً (محلياً من القائمة الحالية لتسريع العملية)
        const exists = accounts.some(a => a.code === item.code);
        
        if (!exists) {
          // البحث عن ID الحساب الأب بناءً على الكود
          let parentId = null;
          if (item.parent_code) {
            // نبحث في قاعدة البيانات عن الأب لضمان الحصول على أحدث ID
            const { data: parentAcc } = await supabase
              .from('accounts')
              .select('id')
              .eq('organization_id', orgId)
              .eq('code', item.parent_code)
              .maybeSingle();
            
            parentId = parentAcc?.id || null;
          }

          const { error: insertError } = await supabase.from('accounts').insert({
            code: item.code,
            name: item.name,
            type: item.type,
            is_group: item.is_group,
            parent_id: parentId,
            organization_id: orgId,
            is_active: true
          });

          if (!insertError) createdCount++;
        }
      }

      if (createdCount > 0) {
        showToast(`تم إنشاء ${createdCount} حساب بنجاح ✅`, 'success');
        refreshData();
      } else {
        showToast('جميع الحسابات الأساسية موجودة بالفعل ✨', 'info');
      }

    } catch (err: any) {
      console.error(err);
      showToast('فشل إنشاء الحسابات: ' + err.message, 'error');
    }
  };

  // بناء شجرة الحسابات
  const accountTree = useMemo(() => {
    const tree: any[] = [];
    const map: Record<string, any> = {};

    // 1. إنشاء خريطة لكل الحسابات
    accounts.forEach(acc => {
      map[acc.id] = { ...acc, children: [] };
    });

    // 2. ربط الأبناء بالآباء
    accounts.forEach(acc => {
      if ((acc as any).parent_id && map[(acc as any).parent_id]) {
        map[(acc as any).parent_id].children.push(map[acc.id]);
      } else {
        tree.push(map[acc.id]); // حساب رئيسي (جذر)
      }
    });

    // 3. ترتيب الحسابات حسب الكود
    const sortAccounts = (list: any[]) => {
      list.sort((a, b) => a.code.localeCompare(b.code));
      list.forEach(item => {
        if (item.children.length > 0) sortAccounts(item.children);
      });
    };
    sortAccounts(tree);

    return tree;
  }, [accounts]);

  // دالة لتسطيح الشجرة للعرض (Flatten Tree) مع التصفية
  const flattenTree = (nodes: any[], level = 0, result: any[] = []) => {
    for (const node of nodes) {
      // التصفية: إذا كان هناك بحث، نعرض فقط ما يطابق البحث أو أبناءه
      const matchesSearch = 
        node.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        node.code.includes(searchTerm);
      
      // إذا كان البحث نشطاً، نعرض كل شيء يطابق، وإلا نلتزم بحالة التوسيع
      const isExpanded = expandedGroups[node.id] !== undefined ? expandedGroups[node.id] : (level === 0);
      
      // فلتر المجموعات
      const matchesGroupFilter = !showOnlyGroups || node.isGroup;

      if ((matchesSearch || searchTerm === '') && matchesGroupFilter) {
          result.push({ ...node, level, isExpanded });
      }

      if (node.children.length > 0 && (isExpanded || searchTerm)) {
        flattenTree(node.children, level + 1, result);
      }
    }
    return result;
  };

  const displayedAccounts = useMemo(() => flattenTree(accountTree), [accountTree, expandedGroups, searchTerm, showOnlyGroups]);

  const exportToExcel = () => {
    const data = accounts.map(a => ({
      'رمز الحساب': a.code,
      'اسم الحساب': a.name,
      'التصنيف': a.isGroup ? 'رئيسي' : 'فرعي',
      'النوع': a.type,
      'الرصيد': a.balance
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "دليل الحسابات");
    XLSX.writeFile(wb, "ChartOfAccounts.xlsx");
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Folder className="text-blue-600" /> دليل الحسابات
            </h2>
            <p className="text-slate-500 text-sm">عرض وإدارة شجرة الحسابات والأرصدة</p>
        </div>
        <div className="flex gap-2">
            <button 
              onClick={handleResetBalances}
              className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-lg hover:bg-red-100 font-bold transition-colors shadow-sm"
              title="تصفير أرصدة الحسابات في قاعدة البيانات (إصلاح)"
            >
              <Trash2 size={18} />
              <span>تصفير الأرصدة</span>
            </button>
            <button 
              onClick={() => refreshData()} 
              disabled={isLoading}
              className="flex items-center gap-2 bg-white border border-slate-300 text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-50 font-bold transition-colors shadow-sm"
              title="إعادة تحميل البيانات وحساب الأرصدة من السيرفر"
            >
              <RefreshCw size={18} className={isLoading ? 'animate-spin text-blue-600' : ''} />
              <span>تحديث الأرصدة</span>
            </button>
            <button 
              onClick={handleCreateMissingAccounts}
              className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-600 px-4 py-2 rounded-lg hover:bg-indigo-100 font-bold transition-colors shadow-sm"
              title="إنشاء الحسابات المفقودة اللازمة للنظام"
            >
              <Sparkles size={18} />
              <span>إنشاء الحسابات المفقودة</span>
            </button>
            <button 
              onClick={handleAutoFixAccountTypes}
              className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-600 px-4 py-2 rounded-lg hover:bg-amber-100 font-bold transition-colors shadow-sm"
              title="إصلاح أنواع الحسابات تلقائياً بناءً على أكوادها"
            >
              <Wrench size={18} />
              <span>إصلاح أنواع الحسابات</span>
            </button>
            <button onClick={exportToExcel} className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 font-bold transition-colors">
                <Download size={18} /> تصدير Excel
            </button>
            <button onClick={handleOpenModal} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold transition-colors shadow-lg shadow-blue-200">
                <Plus size={18} /> إضافة حساب
            </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-wrap justify-between items-center gap-4">
            <div className="relative max-w-md flex-1">
                <Search className="absolute right-3 top-2.5 text-slate-400" size={18} />
                <input 
                    type="text" 
                    placeholder="بحث برقم الحساب أو الاسم..." 
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pr-10 pl-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>
            <div className="flex items-center gap-2">
                <input 
                    type="checkbox" 
                    id="showGroupsOnly" 
                    checked={showOnlyGroups} 
                    onChange={(e) => setShowOnlyGroups(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                />
                <label htmlFor="showGroupsOnly" className="text-sm font-bold text-slate-700 cursor-pointer select-none">
                    عرض الحسابات الرئيسية فقط
                </label>
            </div>
        </div>

        <div className="overflow-x-auto">
            <table className="w-full text-right">
                <thead className="bg-slate-50 text-slate-600 font-bold text-sm">
                    <tr>
                        <th className="p-4 w-20"></th>
                        <th className="p-4">رمز الحساب</th>
                        <th className="p-4">اسم الحساب</th>
                        <th className="p-4">التصنيف</th>
                        <th className="p-4">النوع</th>
                        <th className="p-4 text-left">الرصيد</th>
                        <th className="p-4 w-20"></th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {displayedAccounts.map((acc) => (
                        <tr key={acc.id} className={`hover:bg-slate-50 transition-colors ${acc.isGroup ? 'bg-slate-50/50 font-bold' : ''}`}>
                            <td className="p-4 text-center">
                                {acc.isGroup && (
                                    <button onClick={() => toggleGroup(acc.id)} className="text-slate-400 hover:text-blue-600">
                                        {acc.isExpanded || searchTerm ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                    </button>
                                )}
                            </td>
                            <td className="p-4 font-mono text-blue-600">{acc.code}</td>
                            <td className="p-4">
                                <div className="flex items-center gap-2" style={{ paddingRight: `${acc.level * 20}px` }}>
                                    {acc.isGroup ? <Folder size={16} className="text-amber-500" /> : <FileText size={16} className="text-slate-400" />}
                                    <span>{acc.name}</span>
                                    {acc.isGroup && <span className="text-xs text-slate-400 font-normal">({acc.children.length})</span>}
                                </div>
                            </td>
                            <td className="p-4">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${acc.isGroup ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                                    {acc.isGroup ? 'رئيسي' : 'فرعي'}
                                </span>
                            </td>
                            <td className="p-4 text-sm text-slate-500">
                                <span className={`px-2 py-1 rounded text-xs capitalize ${acc.isGroup ? 'bg-slate-200' : 'bg-blue-50 text-blue-600'}`}>
                                    {acc.type}
                                </span>
                            </td>
                            <td className="p-4 text-left font-mono font-bold">
                                {acc.balance !== 0 ? (
                                    <span className={acc.balance < 0 ? 'text-red-600' : 'text-emerald-600'}>
                                        {Math.abs(acc.balance).toLocaleString()}
                                    </span>
                                ) : (
                                    <span className="text-slate-300">-</span>
                                )}
                            </td>
                            <td className="p-4 flex justify-end gap-2">
                                <button onClick={() => handleEdit(acc)} className="p-1 text-slate-400 hover:text-blue-600" title="تعديل الحساب"><Edit size={16} /></button>
                                <button onClick={() => handleDelete(acc.id, acc.name, acc.balance)} className="p-1 text-slate-400 hover:text-red-600"><Trash2 size={16} /></button>
                            </td>
                        </tr>
                    ))}
                    {displayedAccounts.length === 0 && (
                        <tr><td colSpan={6} className="p-8 text-center text-slate-400">لا توجد حسابات مطابقة للبحث</td></tr>
                    )}
                </tbody>
            </table>
        </div>
      </div>

      <AddAccountModal 
        isOpen={isModalOpen} 
        onClose={() => { setIsModalOpen(false); setEditingAccount(null); }} 
        onAccountAdded={() => { /* Context updates automatically */ }}
        accountToEdit={editingAccount}
      />
    </div>
  );
};

export default AccountList;
