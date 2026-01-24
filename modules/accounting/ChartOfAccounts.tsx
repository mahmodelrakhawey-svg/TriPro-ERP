import React, { useState, useEffect, useMemo } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { Plus, Folder, FileText, ChevronRight, ChevronDown, X, Loader2, LayoutList, Edit2, Trash2 } from 'lucide-react';

type Account = {
  id: string;
  code: string;
  name: string;
  type: string;
  is_group: boolean;
  parent_id: string | null;
  balance?: number;
  children?: Account[];
};

export default function ChartOfAccounts() {
  const { accounts: flatAccounts, addAccount, updateAccount, deleteAccount, addEntry } = useAccounting();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    type: 'asset',
    is_group: false,
    parent_id: '' as string | null,
    openingBalance: 0,
    balanceType: 'debit'
  });
  const [submitting, setSubmitting] = useState(false);

  const buildTree = (items: Account[]) => {
    const rootItems: Account[] = [];
    const lookup: Record<string, Account> = {};

    // تهيئة القاموس
    items.forEach(item => {
      lookup[item.id] = { ...item, children: [] };
    });

    // بناء الشجرة
    items.forEach((item: any) => {
      if (item.parent_id && lookup[item.parent_id]) {
        lookup[item.parent_id].children?.push(lookup[item.id]);
      } else {
        rootItems.push(lookup[item.id]);
      }
    });

    return rootItems;
  };

  const accountsTree = useMemo(() => {
    if (!flatAccounts || flatAccounts.length === 0) return [];
    
    const calculateGroupBalances = (nodes: Account[]) => {
      nodes.forEach(node => {
        if (node.children && node.children.length > 0) {
          calculateGroupBalances(node.children);
          const childrenBalance = node.children.reduce((sum, child) => sum + (child.balance || 0), 0);
          node.balance = childrenBalance;
        }
      });
    };

    const tree = buildTree(flatAccounts as any[]);
    calculateGroupBalances(tree);

    // توسيع الحسابات الرئيسية افتراضياً
    if (Object.keys(expanded).length === 0) {
        const initialExpanded: Record<string, boolean> = {};
        tree.forEach(node => initialExpanded[node.id] = true);
        setExpanded(initialExpanded);
    }

    return tree;
  }, [flatAccounts]);

  const toggleExpand = (id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleOpeningBalance = async (accountId: string, amount: number, type: string, accountName: string) => {
    const equityAccount = flatAccounts.find(a => a.code === '3999');
    if (!equityAccount) {
      alert('خطأ: حساب الأرصدة الافتتاحية (3999) غير موجود.');
      return;
    }

    const debitAmount = type === 'debit' ? amount : 0;
    const creditAmount = type === 'credit' ? amount : 0;

    await addEntry({
      date: new Date().toISOString().split('T')[0],
      description: `رصيد افتتاحي - ${accountName}`,
      reference: 'OPENING-BAL',
      status: 'posted',
      lines: [
        { account_id: accountId, accountId: accountId, debit: debitAmount, credit: creditAmount, description: 'رصيد افتتاحي' },
        { account_id: equityAccount.id, accountId: equityAccount.id, debit: creditAmount, credit: debitAmount, description: 'تسوية أرصدة افتتاحية' }
      ]
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        code: formData.code,
        name: formData.name,
        type: formData.type,
        is_group: formData.is_group,
        parent_id: formData.parent_id || null
      };

      if (editingId) {
        await updateAccount(editingId, payload as any);
      } else {
        const newAccount = await addAccount({ ...payload, is_active: true } as any);

        // معالجة الرصيد الافتتاحي للحسابات الجديدة فقط
        if (newAccount && formData.openingBalance > 0 && !formData.is_group) {
          await handleOpeningBalance(newAccount.id, formData.openingBalance, formData.balanceType, formData.name);
        }
      }

      setIsModalOpen(false);
      setFormData({ code: '', name: '', type: 'asset', is_group: false, parent_id: '', openingBalance: 0, balanceType: 'debit' });
      setEditingId(null);
    } catch (error: any) {
      alert('خطأ في الحفظ: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string, code: string) => {
    const PROTECTED_CODES: string[] = [
      '1', '2', '3', '4', '5', // Main groups
      '101', '102', '11', // Important subgroups
      '1231', '1221', '121', '221', '2231', '411', '511', '531', '533', '512', '32', '1241', '1223', '226', '1119', // New Egyptian COA
      '10101', '10201', '103', '201', '202', '401', '501' // Old codes
    ];

    if (PROTECTED_CODES.includes(code)) {
      alert('تنبيه: لا يمكن حذف هذا الحساب لأنه حساب نظام أساسي أو مرتبط بالقيود الآلية.');
      return;
    }

    if (!window.confirm(`هل أنت متأكد من حذف الحساب "${name}"؟\nلا يمكن التراجع عن هذا الإجراء.`)) return;
    
    try {
      const result = await deleteAccount(id);
      if (!result.success) throw new Error(result.message);
    } catch (error: any) {
      alert('لا يمكن حذف الحساب. قد يكون مرتبطاً بقيود محاسبية أو حسابات فرعية.\n' + error.message);
    }
  };

  const handleEdit = (node: Account) => {
    setFormData({
      code: node.code,
      name: node.name,
      type: node.type,
      is_group: node.is_group,
      parent_id: node.parent_id,
      openingBalance: 0, // لا نسمح بتعديل الرصيد الافتتاحي من هنا
      balanceType: 'debit'
    });
    setEditingId(node.id);
    setIsModalOpen(true);
  };

  // دالة مساعدة لعرض الخيارات في القائمة المنسدلة بشكل هرمي
  const renderOptions = (nodes: Account[], depth = 0): JSX.Element[] => {
    let options: JSX.Element[] = [];
    nodes.forEach(node => {
      if (node.is_group) { // السماح فقط باختيار الحسابات التجميعية كأب
        options.push(
          <option key={node.id} value={node.id}>
            {'\u00A0'.repeat(depth * 4)}{node.code} - {node.name}
          </option>
        );
        if (node.children) {
          options = [...options, ...renderOptions(node.children, depth + 1)];
        }
      }
    });
    return options;
  };

  const AccountNode = ({ node, level }: { node: Account, level: number }) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expanded[node.id];

    return (
      <div className="select-none">
        <div 
          className={`flex items-center p-2 hover:bg-slate-50 border-b border-slate-100 transition-colors ${level === 0 ? 'bg-slate-50 font-bold' : ''}`}
          style={{ paddingRight: `${level * 24 + 10}px` }}
        >
          <button 
            onClick={() => toggleExpand(node.id)}
            className={`p-1 rounded hover:bg-slate-200 ml-2 text-slate-400 ${!hasChildren && 'invisible'}`}
          >
            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          
          <div className="flex items-center gap-2 flex-1">
            {node.is_group ? <Folder size={18} className="text-blue-500" /> : <FileText size={18} className="text-slate-400" />}
            <span className="font-mono text-slate-500 text-sm bg-slate-100 px-2 py-0.5 rounded border border-slate-200">{node.code}</span>
            <span className={node.is_group ? 'font-semibold text-slate-800' : 'text-slate-700'}>{node.name}</span>
          </div>
          
          <div className="font-mono text-sm text-slate-600 w-40 text-left" dir="ltr">
            {node.balance !== undefined ? node.balance.toLocaleString('en-US', {minimumFractionDigits: 2}) : ''}
          </div>

          <div className="flex items-center gap-2">
             <span className={`text-xs px-2 py-1 rounded-full font-medium ${node.type === 'asset' ? 'bg-green-100 text-green-700' : node.type === 'liability' ? 'bg-red-100 text-red-700' : node.type === 'equity' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'}`}>
               {node.type === 'asset' ? 'أصول' : node.type === 'liability' ? 'خصوم' : node.type === 'equity' ? 'ملكية' : node.type === 'revenue' ? 'إيراد' : 'مصروف'}
             </span>
             
             <div className="flex items-center gap-1 mr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={() => handleEdit(node)}
                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                  title="تعديل"
                >
                  <Edit2 size={14} />
                </button>
                <button 
                  onClick={() => handleDelete(node.id, node.name, node.code)}
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                  title="حذف"
                >
                  <Trash2 size={14} />
                </button>
             </div>

             {node.is_group && (
               <button 
                 onClick={() => {
                   setFormData(prev => ({ ...prev, parent_id: node.id, type: node.type }));
                   setEditingId(null);
                   setIsModalOpen(true);
                 }}
                 className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100 border border-blue-100"
               >
                 + فرعي
               </button>
             )}
          </div>
        </div>
        
        {isExpanded && hasChildren && (
          <div>
            {node.children?.map(child => (
              <AccountNode key={child.id} node={child} level={level + 1} />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-6 max-w-5xl mx-auto animate-in fade-in">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <LayoutList className="text-blue-600" /> دليل الحسابات
          </h1>
          <p className="text-slate-500">إدارة شجرة الحسابات والأرصدة</p>
        </div>
        <button 
          onClick={() => {
            setFormData({ code: '', name: '', type: 'asset', is_group: false, parent_id: '', openingBalance: 0, balanceType: 'debit' });
            setEditingId(null);
            setIsModalOpen(true);
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 font-bold shadow-sm transition-colors"
        >
          <Plus size={18} /> حساب جديد
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[400px]">
        {flatAccounts.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="animate-spin text-blue-600" size={32} />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            <div className="bg-slate-50 p-3 border-b border-slate-200 flex font-bold text-slate-600 text-sm sticky top-0 z-10">
              <div className="w-10"></div>
              <div className="flex-1">اسم الحساب / الكود</div>
              <div className="w-40 text-left">الرصيد</div>
              <div className="w-32 text-center">النوع</div>
            </div>
            {accountsTree.map(node => (
              <AccountNode key={node.id} node={node} level={0} />
            ))}
            {accountsTree.length === 0 && (
              <div className="p-8 text-center text-slate-400">لا توجد حسابات مسجلة</div>
            )}
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-lg text-slate-800">{editingId ? 'تعديل بيانات الحساب' : 'إضافة حساب جديد'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">الحساب الرئيسي (الأب)</label>
                <select 
                  value={formData.parent_id || ''} 
                  onChange={e => setFormData({...formData, parent_id: e.target.value || null})}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 bg-slate-50"
                >
                  <option value="">-- حساب رئيسي (مستوى أول) --</option>
                  {renderOptions(accountsTree)}
                </select>
                <p className="text-xs text-slate-400 mt-1">اتركه فارغاً لإنشاء حساب رئيسي</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">رقم الحساب (Code)</label>
                  <input 
                    required
                    type="text" 
                    value={formData.code}
                    onChange={e => setFormData({...formData, code: e.target.value})}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                    placeholder="مثال: 1101"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">نوع الحساب</label>
                  <select 
                    value={formData.type}
                    onChange={e => setFormData({...formData, type: e.target.value})}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                  >
                    <option value="asset">أصول (Assets)</option>
                    <option value="liability">خصوم (Liabilities)</option>
                    <option value="equity">حقوق ملكية (Equity)</option>
                    <option value="revenue">إيرادات (Revenue)</option>
                    <option value="expense">مصروفات (Expenses)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">اسم الحساب</label>
                <input 
                  required
                  type="text" 
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                  placeholder="مثال: الصندوق الرئيسي"
                />
              </div>

              <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <input 
                  type="checkbox" 
                  id="is_group"
                  checked={formData.is_group}
                  onChange={e => setFormData({...formData, is_group: e.target.checked})}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <label htmlFor="is_group" className="text-sm font-medium text-slate-700 cursor-pointer">
                  حساب تجميعي (رئيسي)
                  <span className="block text-xs text-slate-400 font-normal">الحسابات التجميعية لا يمكن إنشاء قيود عليها مباشرة</span>
                </label>
              </div>

              {/* حقل الرصيد الافتتاحي - يظهر فقط عند الإضافة وليس التعديل، وللحسابات الفرعية فقط */}
              {!editingId && !formData.is_group && (
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-3 animate-in slide-in-from-top-2">
                  <h4 className="text-sm font-bold text-slate-700 border-b border-slate-200 pb-2">الرصيد الافتتاحي (اختياري)</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">المبلغ</label>
                      <input 
                        type="number" 
                        min="0"
                        step="0.01"
                        value={formData.openingBalance}
                        onChange={e => setFormData({...formData, openingBalance: Number(e.target.value)})}
                        className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">طبيعة الرصيد</label>
                      <select 
                        value={formData.balanceType}
                        onChange={e => setFormData({...formData, balanceType: e.target.value})}
                        className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500"
                      >
                        <option value="debit">مدين (Debit)</option>
                        <option value="credit">دائن (Credit)</option>
                      </select>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400">سيتم إنشاء قيد افتتاحي تلقائي مقابل حساب "الأرصدة الافتتاحية"</p>
                </div>
              )}

              <div className="pt-4 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-bold"
                >
                  إلغاء
                </button>
                <button 
                  type="submit" 
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold shadow-sm disabled:opacity-50 flex justify-center items-center gap-2"
                >
                  {submitting && <Loader2 className="animate-spin" size={16} />}
                  {editingId ? 'تحديث' : 'حفظ الحساب'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}