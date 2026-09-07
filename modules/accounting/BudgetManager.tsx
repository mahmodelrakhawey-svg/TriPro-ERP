import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { AccountType, BudgetItem } from '../../types';
import { 
    Save, Target, Plus, Trash2, User, Users, Package, Calculator, 
    Copy, TrendingUp, BarChart3, Search, Sparkles, Filter, CheckCircle2,
    ArrowUpRight, AlertCircle, RefreshCw, Loader2, Layers, DollarSign
} from 'lucide-react';

const BudgetManager = () => {
  const { accounts, budgets, saveBudget, salespeople, customers, products, selectedFiscalYear, settings } = useAccounting();
  const { showToast } = useToast();
  
  const currentYear = selectedFiscalYear || new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'salesperson' | 'customer' | 'product' | 'account'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);
  const [copyPercent, setCopyPercent] = useState<number>(0);
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);

  // الحسابات القابلة لإدراجها في الموازنة (المصروفات والإيرادات)
  const budgetableAccounts = useMemo(() => {
    return accounts.filter(a => !a.isGroup && (
      a.type === AccountType.EXPENSE || 
      a.type === AccountType.REVENUE ||
      String(a.type).toLowerCase().includes('expense') ||
      String(a.type).toLowerCase().includes('revenue') ||
      a.code?.startsWith('5') || a.code?.startsWith('4')
    ));
  }, [accounts]);

  // قائمة السنوات المتاحة (ديناميكية)
  const availableYears = useMemo(() => {
    const base = selectedFiscalYear || new Date().getFullYear();
    return [base - 2, base - 1, base, base + 1, base + 2];
  }, [selectedFiscalYear]);

  // مزامنة السنة المختارة
  useEffect(() => {
    if (selectedFiscalYear) {
      setYear(selectedFiscalYear);
    }
  }, [selectedFiscalYear]);

  // جلب الخطة المسجلة عند تغيير الشهر أو السنة
  useEffect(() => {
    const existing = budgets.find(b => b.year === year && b.month === month);
    if (existing && existing.items) {
      setItems(existing.items.map((i: any) => ({
        type: i.type,
        targetId: i.targetId || i.target_id || '',
        target_id: i.target_id || i.targetId || '',
        targetName: i.targetName || i.target_name || '',
        target_name: i.target_name || i.targetName || '',
        plannedAmount: Number(i.plannedAmount || i.planned_amount || 0),
        planned_amount: Number(i.planned_amount || i.plannedAmount || 0)
      })));
    } else {
      setItems([]);
    }
  }, [year, month, budgets]);

  // إضافة مستهدف فردي
  const addItem = (type: BudgetItem['type']) => {
    const newItem: BudgetItem = { 
      type, 
      targetId: '', 
      target_id: '', 
      targetName: '', 
      target_name: '', 
      plannedAmount: 0, 
      planned_amount: 0 
    };
    setItems(prev => [newItem, ...prev]);
    if (activeTab !== 'all' && activeTab !== type) {
      setActiveTab(type);
    }
  };

  // حذف مستهدف
  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  // تفريغ كافة المستهدفات
  const handleClearAll = () => {
    if (window.confirm('هل أنت متأكد من تفريغ كافة مستهدفات هذا الشهر؟')) {
      setItems([]);
      showToast('تم تفريغ الخطة الحالية', 'info');
    }
  };

  // تحديث حقول المستهدف
  const updateItem = (idx: number, field: keyof BudgetItem, val: any) => {
    setItems(prev => {
      const newItems = [...prev];
      const item = { ...newItems[idx] };

      if (field === 'targetId') {
        let name = '';
        if (item.type === 'account') name = accounts.find(a => a.id === val)?.name || '';
        else if (item.type === 'salesperson') name = salespeople.find(s => s.id === val)?.name || '';
        else if (item.type === 'customer') name = customers.find(c => c.id === val)?.name || '';
        else if (item.type === 'product') name = products.find(p => p.id === val)?.name || '';
        item.targetName = name;
        item.target_name = name;
        item.targetId = val;
        item.target_id = val;
      } else if (field === 'plannedAmount') {
        const num = Number(val) || 0;
        item.plannedAmount = num;
        item.planned_amount = num;
      } else {
        // @ts-ignore
        item[field] = val;
      }

      newItems[idx] = item;
      return newItems;
    });
  };

  // --- الإجراءات السريعة (Quick Bulk Actions) ---

  // 1. إضافة كل المناديب دفعة واحدة
  const handleAddAllSalespeople = () => {
    const existingIds = new Set(items.filter(i => i.type === 'salesperson').map(i => i.targetId));
    const toAdd = salespeople
      .filter(s => s.id !== '00000000-0000-0000-0000-000000000000' && !existingIds.has(s.id))
      .map(s => ({
        type: 'salesperson' as const,
        targetId: s.id,
        target_id: s.id,
        targetName: s.name,
        target_name: s.name,
        plannedAmount: 0,
        planned_amount: 0
      }));

    if (toAdd.length === 0) {
      showToast('جميع المناديب مضافون بالفعل في الخطة', 'info');
      return;
    }

    setItems(prev => [...prev, ...toAdd]);
    showToast(`تمت إضافة عدد (${toAdd.length}) مناديب للخطة`, 'success');
  };

  // 2. إضافة أهم الأصناف دفعة واحدة
  const handleAddAllProducts = () => {
    const existingIds = new Set(items.filter(i => i.type === 'product').map(i => i.targetId));
    const toAdd = products
      .filter(p => !existingIds.has(p.id))
      .slice(0, 50)
      .map(p => ({
        type: 'product' as const,
        targetId: p.id,
        target_id: p.id,
        targetName: p.name,
        target_name: p.name,
        plannedAmount: 0,
        planned_amount: 0
      }));

    if (toAdd.length === 0) {
      showToast('جميع الأصناف مضافة بالفعل في الخطة', 'info');
      return;
    }

    setItems(prev => [...prev, ...toAdd]);
    showToast(`تمت إضافة عدد (${toAdd.length}) صنفاً للخطة`, 'success');
  };

  // 3. إضافة حسابات المصروفات
  const handleAddAllExpenseAccounts = () => {
    const existingIds = new Set(items.filter(i => i.type === 'account').map(i => i.targetId));
    const toAdd = budgetableAccounts
      .filter(a => !existingIds.has(a.id))
      .map(a => ({
        type: 'account' as const,
        targetId: a.id,
        target_id: a.id,
        targetName: a.name,
        target_name: a.name,
        plannedAmount: 0,
        planned_amount: 0
      }));

    if (toAdd.length === 0) {
      showToast('جميع الحسابات مضافة بالفعل', 'info');
      return;
    }

    setItems(prev => [...prev, ...toAdd]);
    showToast(`تمت إضافة عدد (${toAdd.length}) حساب موازنة`, 'success');
  };

  // 4. نسخ خطة الشهر السابق مع نسبة تعديل اختيارية
  const handleCopyPreviousMonth = () => {
    let prevMonth = month - 1;
    let prevYear = year;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear = year - 1;
    }

    const prevBudget = budgets.find(b => b.year === prevYear && b.month === prevMonth);
    if (!prevBudget || !prevBudget.items || prevBudget.items.length === 0) {
      showToast(`لا توجد خطة مسجلة لشهر ${prevMonth} / ${prevYear} لنسخها`, 'warning');
      setIsCopyModalOpen(false);
      return;
    }

    const multiplier = 1 + (Number(copyPercent) || 0) / 100;
    const clonedItems: BudgetItem[] = prevBudget.items.map((i: any) => {
      const amount = Math.round(Number(i.plannedAmount || i.planned_amount || 0) * multiplier);
      return {
        type: i.type,
        targetId: i.targetId || i.target_id || '',
        target_id: i.target_id || i.targetId || '',
        targetName: i.targetName || i.target_name || '',
        target_name: i.target_name || i.targetName || '',
        plannedAmount: amount,
        planned_amount: amount
      };
    });

    setItems(clonedItems);
    setIsCopyModalOpen(false);
    showToast(`تم نسخ (${clonedItems.length}) مستهدف من شهر ${prevMonth} بنجاح ✅`, 'success');
  };

  // حفظ الخطة
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = items.filter(i => (i.targetId || i.target_id) && (i.plannedAmount > 0 || i.planned_amount > 0));
    
    if (validItems.length === 0 && items.length > 0) {
      showToast('يرجى تحديد المستهدف والمبلغ أو الكمية أكبر من 0 قبل الحفظ', 'warning');
      return;
    }

    setSaving(true);
    try {
      await saveBudget({ 
        year, 
        month, 
        items: validItems.map(i => ({
          type: i.type,
          target_id: i.targetId || i.target_id,
          targetId: i.targetId || i.target_id,
          target_name: i.targetName || i.target_name,
          targetName: i.targetName || i.target_name,
          planned_amount: Number(i.plannedAmount || i.planned_amount || 0),
          plannedAmount: Number(i.plannedAmount || i.planned_amount || 0)
        }))
      });
    } catch (err: any) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // الحسابات الإجمالية للوحة التخطيط
  const stats = useMemo(() => {
    let salesTarget = 0;
    let productsQuantity = 0;
    let expensesBudget = 0;
    let salespeopleCount = 0;
    let customersCount = 0;

    items.forEach(i => {
      const amt = Number(i.plannedAmount || i.planned_amount || 0);
      if (i.type === 'salesperson') {
        salesTarget += amt;
        salespeopleCount++;
      } else if (i.type === 'customer') {
        salesTarget += amt;
        customersCount++;
      } else if (i.type === 'product') {
        productsQuantity += amt;
      } else if (i.type === 'account') {
        expensesBudget += amt;
      }
    });

    return {
      totalItems: items.length,
      salesTarget,
      productsQuantity,
      expensesBudget,
      salespeopleCount,
      customersCount
    };
  }, [items]);

  // تصفية العناصر حسب التبويب والبحث
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchTab = activeTab === 'all' || item.type === activeTab;
      const matchSearch = !searchTerm.trim() || 
        (item.targetName || item.target_name || '').toLowerCase().includes(searchTerm.toLowerCase());
      return matchTab && matchSearch;
    });
  }, [items, activeTab, searchTerm]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      
      {/* Header */}
      <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 gap-6">
        <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                <Target className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tight">إعداد المستهدفات والموازنة</h2>
                <p className="text-slate-500 font-medium">تحديد مستهدفات البيع، كميات الأصناف، وموازنة المصروفات الشهرية</p>
              </div>
            </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
            <button 
              type="button"
              onClick={() => setIsCopyModalOpen(true)}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-3 rounded-2xl font-bold flex items-center gap-2 transition-all shadow-sm"
              title="نسخ خطة من الشهر السابق"
            >
              <Copy size={18} />
              <span>نسخ من الشهر السابق</span>
            </button>

            <Link 
              to="/budget-report" 
              className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-5 py-3 rounded-2xl font-bold flex items-center gap-2 transition-all shadow-sm"
            >
              <BarChart3 size={18} />
              <span>متابعة الانحرافات (المخطط vs الفعلي)</span>
              <ArrowUpRight size={16} />
            </Link>
        </div>
      </header>

      {/* Planning KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl"><TrendingUp size={28}/></div>
            <div>
                <p className="text-xs font-black text-slate-400 uppercase">مستهدف المبيعات المخطط</p>
                <h3 className="text-2xl font-black text-slate-900">
                  {stats.salesTarget.toLocaleString()} <span className="text-sm font-bold text-slate-400">{settings.currency || 'EGP'}</span>
                </h3>
            </div>
        </div>

        <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl"><Package size={28}/></div>
            <div>
                <p className="text-xs font-black text-slate-400 uppercase">مستهدف كميات الأصناف</p>
                <h3 className="text-2xl font-black text-emerald-600">
                  {stats.productsQuantity.toLocaleString()} <span className="text-sm font-bold text-slate-400">قطعة</span>
                </h3>
            </div>
        </div>

        <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="p-4 bg-amber-50 text-amber-600 rounded-2xl"><Calculator size={28}/></div>
            <div>
                <p className="text-xs font-black text-slate-400 uppercase">موازنة المصروفات المعتمدة</p>
                <h3 className="text-2xl font-black text-amber-600">
                  {stats.expensesBudget.toLocaleString()} <span className="text-sm font-bold text-slate-400">{settings.currency || 'EGP'}</span>
                </h3>
            </div>
        </div>

        <div className="bg-slate-900 p-6 rounded-[32px] shadow-xl flex items-center gap-4 text-white">
            <div className="p-4 bg-blue-500/20 text-blue-400 rounded-2xl"><Layers size={28}/></div>
            <div>
                <p className="text-xs font-black text-slate-400 uppercase">إجمالي بنود الخطة</p>
                <h3 className="text-2xl font-black text-blue-400">
                  {stats.totalItems} <span className="text-sm font-bold text-slate-400">مستهدف</span>
                </h3>
            </div>
        </div>
      </div>

      {/* Main Budget Planning Card */}
      <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-200 space-y-8">
          
          {/* Period Selector & Quick Search */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 p-6 bg-slate-50 rounded-3xl border border-slate-100 items-end">
              <div className="md:col-span-3">
                  <label className="block text-xs font-black text-slate-500 mb-2 uppercase tracking-widest">السنة المالية</label>
                  <select 
                    value={year} 
                    onChange={e => setYear(Number(e.target.value))} 
                    className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 font-bold text-slate-800 bg-white shadow-sm outline-none focus:border-blue-500 transition-all"
                  >
                      {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
              </div>

              <div className="md:col-span-4">
                  <label className="block text-xs font-black text-slate-500 mb-2 uppercase tracking-widest">الشهر المخطط له</label>
                  <select 
                    value={month} 
                    onChange={e => setMonth(Number(e.target.value))} 
                    className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 font-bold text-slate-800 bg-white shadow-sm outline-none focus:border-blue-500 transition-all"
                  >
                      {Array.from({length: 12}, (_, i) => i + 1).map(m => (
                          <option key={m} value={m}>
                            شهر {m} ({new Intl.DateTimeFormat('ar-EG', {month: 'long'}).format(new Date(2024, m-1, 1))})
                          </option>
                      ))}
                  </select>
              </div>

              <div className="md:col-span-5">
                  <label className="block text-xs font-black text-slate-500 mb-2 uppercase tracking-widest">بحث في مستهدفات الخطة</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      value={searchTerm} 
                      onChange={e => setSearchTerm(e.target.value)} 
                      placeholder="ابحث باسم المندوب، العميل، الصنف، أو الحساب..." 
                      className="w-full border-2 border-slate-200 rounded-2xl pr-10 pl-4 py-3 font-bold text-slate-800 bg-white shadow-sm outline-none focus:border-blue-500 transition-all"
                    />
                    <Search size={18} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
              </div>
          </div>

          {/* Add Target Buttons */}
          <div className="space-y-4">
              <div className="flex flex-wrap gap-3">
                  <button 
                    type="button"
                    onClick={() => addItem('salesperson')} 
                    className="flex-1 min-w-[160px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 py-3.5 px-4 rounded-2xl font-bold flex items-center justify-center gap-2 border border-indigo-100 transition-all shadow-sm hover:shadow"
                  >
                    <User size={18}/> + تارجت مندوب
                  </button>

                  <button 
                    type="button"
                    onClick={() => addItem('customer')} 
                    className="flex-1 min-w-[160px] bg-blue-50 hover:bg-blue-100 text-blue-700 py-3.5 px-4 rounded-2xl font-bold flex items-center justify-center gap-2 border border-blue-100 transition-all shadow-sm hover:shadow"
                  >
                    <Users size={18}/> + تارجت عميل
                  </button>

                  <button 
                    type="button"
                    onClick={() => addItem('product')} 
                    className="flex-1 min-w-[160px] bg-emerald-50 hover:bg-emerald-100 text-emerald-700 py-3.5 px-4 rounded-2xl font-bold flex items-center justify-center gap-2 border border-emerald-100 transition-all shadow-sm hover:shadow"
                  >
                    <Package size={18}/> + تارجت صنف
                  </button>

                  <button 
                    type="button"
                    onClick={() => addItem('account')} 
                    className="flex-1 min-w-[160px] bg-amber-50 hover:bg-amber-100 text-amber-700 py-3.5 px-4 rounded-2xl font-bold flex items-center justify-center gap-2 border border-amber-200 transition-all shadow-sm hover:shadow"
                  >
                    <Calculator size={18}/> + موازنة حساب
                  </button>
              </div>

              {/* Bulk Quick Helpers */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs">
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className="font-black text-slate-400">إضافة سريعة:</span>
                    <button 
                      type="button"
                      onClick={handleAddAllSalespeople}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 rounded-xl font-bold text-slate-600 transition-colors"
                    >
                      + كافة المناديب
                    </button>
                    <button 
                      type="button"
                      onClick={handleAddAllProducts}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 rounded-xl font-bold text-slate-600 transition-colors"
                    >
                      + أهم الأصناف
                    </button>
                    <button 
                      type="button"
                      onClick={handleAddAllExpenseAccounts}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-amber-50 hover:text-amber-700 rounded-xl font-bold text-slate-600 transition-colors"
                    >
                      + حسابات المصروفات
                    </button>
                  </div>

                  {items.length > 0 && (
                    <button 
                      type="button"
                      onClick={handleClearAll}
                      className="text-red-500 hover:text-red-700 font-bold flex items-center gap-1 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
                    >
                      <Trash2 size={14} /> تفريغ القائمة
                    </button>
                  )}
              </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-1 max-w-2xl">
              <button 
                type="button"
                onClick={() => setActiveTab('all')} 
                className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all ${activeTab === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                الكل ({items.length})
              </button>
              <button 
                type="button"
                onClick={() => setActiveTab('salesperson')} 
                className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all ${activeTab === 'salesperson' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-indigo-700'}`}
              >
                المناديب ({items.filter(i => i.type === 'salesperson').length})
              </button>
              <button 
                type="button"
                onClick={() => setActiveTab('customer')} 
                className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all ${activeTab === 'customer' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-blue-700'}`}
              >
                العملاء ({items.filter(i => i.type === 'customer').length})
              </button>
              <button 
                type="button"
                onClick={() => setActiveTab('product')} 
                className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all ${activeTab === 'product' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-emerald-700'}`}
              >
                الأصناف ({items.filter(i => i.type === 'product').length})
              </button>
              <button 
                type="button"
                onClick={() => setActiveTab('account')} 
                className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all ${activeTab === 'account' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500 hover:text-amber-700'}`}
              >
                الحسابات ({items.filter(i => i.type === 'account').length})
              </button>
          </div>

          {/* Targets Table / List */}
          <div className="space-y-3">
              <div className="grid grid-cols-12 gap-4 px-6 text-xs font-black text-slate-400 uppercase tracking-widest">
                  <div className="col-span-2">النوع</div>
                  <div className="col-span-5">الهدف / المستهدف المختار</div>
                  <div className="col-span-4 text-center">المبلغ المخطط / الكمية المستهدفة</div>
                  <div className="col-span-1 text-center">حذف</div>
              </div>

              {filteredItems.map((item) => {
                  const actualIdx = items.indexOf(item);
                  const isMoney = item.type !== 'product';

                  return (
                    <div 
                      key={actualIdx} 
                      className="grid grid-cols-12 gap-4 items-center bg-white border-2 border-slate-100 hover:border-blue-200 p-4 rounded-3xl transition-all shadow-sm group"
                    >
                        <div className="col-span-2">
                            <span className={`text-xs font-black px-3 py-1.5 rounded-xl flex items-center gap-1.5 w-fit ${
                                item.type === 'salesperson' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' :
                                item.type === 'customer' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                                item.type === 'product' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 
                                'bg-amber-50 text-amber-700 border border-amber-100'
                            }`}>
                                {item.type === 'salesperson' && <User size={14} />}
                                {item.type === 'customer' && <Users size={14} />}
                                {item.type === 'product' && <Package size={14} />}
                                {item.type === 'account' && <Calculator size={14} />}
                                <span>
                                  {item.type === 'salesperson' ? 'مندوب' : 
                                   item.type === 'customer' ? 'عميل' : 
                                   item.type === 'product' ? 'صنف' : 'حساب'}
                                </span>
                            </span>
                        </div>

                        <div className="col-span-5">
                            <select 
                              value={item.targetId || item.target_id || ''} 
                              onChange={e => updateItem(actualIdx, 'targetId', e.target.value)}
                              className="w-full border-2 border-slate-100 rounded-2xl px-4 py-2.5 font-bold text-slate-800 outline-none focus:border-blue-500 bg-slate-50 focus:bg-white transition-all"
                            >
                                <option value="">-- اختر {item.type === 'account' ? 'الحساب' : item.type === 'salesperson' ? 'المندوب' : item.type === 'customer' ? 'العميل' : 'الصنف'} --</option>
                                {item.type === 'account' && budgetableAccounts.map(a => (
                                  <option key={a.id} value={a.id}>{a.code ? `${a.code} - ` : ''}{a.name}</option>
                                ))}
                                {item.type === 'salesperson' && salespeople.filter(s => s.id !== '00000000-0000-0000-0000-000000000000').map(s => (
                                  <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                                {item.type === 'customer' && customers.map(c => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                                {item.type === 'product' && products.map(p => (
                                  <option key={p.id} value={p.id}>{p.name} {p.sku ? `(${p.sku})` : ''}</option>
                                ))}
                            </select>
                        </div>

                        <div className="col-span-4">
                            <div className="relative">
                              <input 
                                type="number" 
                                step="any"
                                min="0"
                                value={item.plannedAmount || item.planned_amount || ''} 
                                onChange={e => updateItem(actualIdx, 'plannedAmount', e.target.value)}
                                className="w-full border-2 border-slate-100 rounded-2xl px-4 py-2.5 font-black text-slate-900 text-center outline-none focus:border-blue-500 bg-slate-50 focus:bg-white transition-all pr-12"
                                placeholder="0.00"
                              />
                              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">
                                {isMoney ? (settings.currency || 'EGP') : 'قطعة'}
                              </span>
                            </div>
                        </div>

                        <div className="col-span-1 flex justify-center">
                            <button 
                              type="button"
                              onClick={() => removeItem(actualIdx)} 
                              className="p-2.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                              title="حذف المستهدف"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    </div>
                  );
              })}
              
              {filteredItems.length === 0 && (
                  <div className="py-16 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-[32px] bg-slate-50/50">
                      <Target size={44} className="mx-auto mb-3 opacity-20 text-slate-500" />
                      <p className="font-bold text-slate-600 text-base">لا توجد مستهدفات معروضة حالياً</p>
                      <p className="text-xs text-slate-400 mt-1">اضغط على أزرار الإضافة أعلاه لإدراج مستهدفات المناديب أو العملاء أو الأصناف أو الحسابات</p>
                  </div>
              )}
          </div>

          {/* Footer Save Actions */}
          <div className="pt-6 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="text-xs font-bold text-slate-500">
                إجمالي العناصر الجاهزة للحفظ: <span className="font-black text-slate-800">{items.filter(i => (i.targetId || i.target_id) && (i.plannedAmount > 0 || i.planned_amount > 0)).length}</span> من أصل <span className="font-black text-slate-800">{items.length}</span>
              </div>

              <button 
                type="button"
                onClick={handleSave}
                disabled={saving || items.length === 0}
                className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white px-10 py-4 rounded-2xl font-black shadow-xl shadow-slate-200 transition-all flex items-center justify-center gap-3 active:scale-95"
              >
                  {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                  <span>حفظ خطة شهر {month} / {year}</span>
              </button>
          </div>
      </div>

      {/* Copy Previous Month Modal */}
      {isCopyModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-6 animate-in zoom-in-95">
            <div className="flex items-center gap-3 text-blue-600">
              <div className="p-3 bg-blue-50 rounded-2xl">
                <Copy size={24} />
              </div>
              <div>
                <h3 className="font-black text-xl text-slate-900">نسخ مستهدفات الشهر السابق</h3>
                <p className="text-xs text-slate-500">استيراد نفس بنود ومستهدفات الشهر الماضي تلقائياً</p>
              </div>
            </div>

            <div className="space-y-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <label className="block text-xs font-black text-slate-600">
                تطبيق نسبة زيادة / تعديل على المبالغ والكميات (%):
              </label>
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  step="1"
                  value={copyPercent} 
                  onChange={e => setCopyPercent(Number(e.target.value))}
                  placeholder="0 (بدون تعديل)"
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 font-black text-blue-600 bg-white outline-none focus:border-blue-500"
                />
                <span className="font-black text-slate-500 text-sm">%</span>
              </div>
              <p className="text-[11px] text-slate-400">
                مثال: اكتب <strong>10</strong> لزيادة أهداف الشهر الجديد بنسبة 10%، أو <strong>0</strong> للنسخ بنفس القيم.
              </p>
            </div>

            <div className="flex gap-3">
              <button 
                type="button"
                onClick={() => setIsCopyModalOpen(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl font-bold transition-all"
              >
                إلغاء
              </button>
              <button 
                type="button"
                onClick={handleCopyPreviousMonth}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2"
              >
                <CheckCircle2 size={18} />
                تأكيد النسخ
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default BudgetManager;
