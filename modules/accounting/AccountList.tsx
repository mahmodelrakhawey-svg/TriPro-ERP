﻿import React, { useState, useMemo } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { Folder, FileText, ChevronRight, ChevronDown, Plus, Search, Download, Trash2, Edit, FolderOpen, ExternalLink, X, Edit2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import AddAccountModal from './AddAccountModal';
import { useNavigate } from 'react-router-dom';

const AccountList = () => {
  const { accounts, deleteAccount } = useAccounting();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [showOnlyGroups, setShowOnlyGroups] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any | null>(null);

  // قائمة الحسابات المحمية (الافتراضية للنظام) التي لا يجب تعديلها لضمان سلامة القيود الآلية
  const SYSTEM_ACCOUNT_CODES = [
    '1', '2', '3', '4', '5', // Main groups
    '101', '102', '11', // Important subgroups
    '10101', '10201', '103', '201', '202', '401', '403', '501', '502', '507', '510', '302', '10204', '10203', '203', '11201' // System accounts
  ];

  // دالة لتبديل حالة التوسيع للمجموعات
  const toggleGroup = (accountId: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [accountId]: !prev[accountId]
    }));
  };

  const handleOpenModal = () => {
    setEditingAccount(null);
    setIsModalOpen(true);
  };

  const handleEdit = (account: any) => {
    if (SYSTEM_ACCOUNT_CODES.includes(account.code)) {
        alert(`لا يمكن تعديل الحساب الافتراضي "${account.name}" لأنه مرتبط بالعمليات الآلية للنظام.`);
        return;
    }
    setEditingAccount(account);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string, name: string, balance: number) => {
    if (balance !== 0) {
        alert('لا يمكن حذف حساب عليه رصيد. يرجى تصفية الرصيد أولاً.');
        return;
    }
    if (window.confirm(`هل أنت متأكد من حذف الحساب "${name}"؟ سيتم نقله إلى سلة المحذوفات.`)) {
        const reason = prompt("الرجاء إدخال سبب الحذف (إلزامي):");
        if (reason) {
            const result = await deleteAccount(id, reason);
            if (!result.success) {
                alert(`فشل حذف الحساب: ${result.message}`);
            }
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
      if (acc.parentAccount && map[acc.parentAccount]) {
        map[acc.parentAccount].children.push(map[acc.id]);
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
                                <span className={`px-2 py-1 rounded text-xs ${acc.isGroup ? 'bg-slate-200' : 'bg-blue-50 text-blue-600'}`}>
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
                                {SYSTEM_ACCOUNT_CODES.includes(acc.code) ? (
                                    <span title="حساب نظام (لا يمكن تعديله)" className="p-1 text-slate-300 cursor-not-allowed"><Edit size={16} /></span>
                                ) : (
                                    <button onClick={() => handleEdit(acc)} className="p-1 text-slate-400 hover:text-blue-600"><Edit size={16} /></button>
                                )}
                                {!acc.isGroup && <button onClick={() => handleDelete(acc.id, acc.name, acc.balance)} className="p-1 text-slate-400 hover:text-red-600"><Trash2 size={16} /></button>}
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
