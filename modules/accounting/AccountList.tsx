﻿﻿﻿﻿﻿﻿import React, { useState, useMemo } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { Folder, FileText, ChevronRight, ChevronDown, Plus, Search, Download, Trash2, Edit, FolderOpen, ExternalLink, X, Edit2, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';
import AddAccountModal from './AddAccountModal';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';

const AccountList = () => {
  const { accounts, deleteAccount, refreshData, isLoading } = useAccounting();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
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
    '10301', // مخزون المواد الخام واللف والحزم / مخزون الخامات (خضروات/لحوم)
    '10302', // مخزون قطع الغيار والمهمات / مخزون المشروبات والسلع الجاهزة
    '10303', // مخزون الوقود والزيوت
    '10304', // مخزون إنتاج غير تام
    '10305', // مخزون المنتج التام (تصنيع)
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
            const result = await deleteAccount(id, reason);
            if (!result.success) {
                showToast(`فشل حذف الحساب: ${result.message}`, 'error');
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
