import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { 
  Landmark, Plus, Edit, Trash2, Calendar, Search, Filter, 
  ArrowUpRight, RefreshCw, AlertTriangle, FileText, CheckCircle, Ban, 
  Percent, Coins, ClipboardList, HelpCircle, ShieldAlert, Truck, Archive,
  Calculator, DollarSign, ArrowLeftRight
} from 'lucide-react';

export default function LettersOfCreditPage() {
  const { addEntry, currentUser, selectedFiscalYear, getSystemAccount, settings } = useAccounting();
  const { showToast } = useToast();
  
  const currencySymbol = settings?.currency || 'ج.م';

  const [lgs, setLgs] = useState<any[]>([]); // Letters of Credit
  const [expenses, setExpenses] = useState<any[]>([]); // Expenses for selected LC
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<any[]>([]);
  const [banks, setBanks] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [allAccounts, setAllAccounts] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]); // Raw materials/goods for Landed Cost

  // Selected LC for detail view / expenses
  const [selectedLc, setSelectedLc] = useState<any>(null);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingLcId, setEditingLcId] = useState<string | null>(null);
  
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);

  // Filter States
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Main Form Data for LC
  const [formData, setFormData] = useState({
    lc_number: '',
    supplier_id: '',
    bank_id: '',
    lc_account_id: '',
    currency_code: 'USD',
    exchange_rate: 49.50,
    amount_foreign: 0,
    amount_local: 0,
    margin_percentage: 10,
    margin_amount: 0,
    opening_date: new Date().toISOString().split('T')[0],
    expiry_date: new Date(new Date().setMonth(new Date().getMonth() + 6)).toISOString().split('T')[0], // Default 6 months
    project_id: '',
    notes: '',
    auto_post_journal: true
  });

  // Expense Sub-Form Data
  const [expenseData, setExpenseData] = useState({
    expense_type: 'bank_commission',
    amount: 0,
    expense_date: new Date().toISOString().split('T')[0],
    invoice_ref: '',
    payment_account_id: '', // Account from which the expense is paid (Bank/Cash)
    notes: '',
    auto_post_journal: true
  });

  // Landed Cost Closing Items State
  const [closingItems, setClosingItems] = useState<any[]>([
    { item_id: '', original_price: 0, qty: 1, allocated_cost: 0, final_unit_cost: 0 }
  ]);

  useEffect(() => {
    fetchData();
  }, [selectedFiscalYear]);

  // Auto-calculate local amount when foreign amount or exchange rate changes
  useEffect(() => {
    const local = Number(formData.amount_foreign) * Number(formData.exchange_rate);
    const margin = (local * Number(formData.margin_percentage)) / 100;
    setFormData(prev => ({
      ...prev,
      amount_local: parseFloat(local.toFixed(2)),
      margin_amount: parseFloat(margin.toFixed(2))
    }));
  }, [formData.amount_foreign, formData.exchange_rate, formData.margin_percentage]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (currentUser?.role === 'demo') {
        // Demo Data
        setLgs([
          {
            id: 'demo-lc-1',
            lc_number: 'LC-EGP-2601',
            supplier_id: 'demo-sup-1',
            bank_id: 'demo-b1',
            lc_account_id: 'demo-acc-lc',
            currency_code: 'USD',
            exchange_rate: 49.50,
            amount_foreign: 12000,
            amount_local: 594000,
            margin_percentage: 10,
            margin_amount: 59400,
            opening_date: '2026-08-01',
            expiry_date: '2026-12-01',
            status: 'opened',
            notes: 'اعتماد مستندي لاستيراد خامات الحديد والمواسير للإنشاءات',
            project_id: null,
            supplier: { name: 'German Iron Exports GmbH' },
            bank: { name: 'البنك الأهلي المصري' },
            lc_account: { name: 'اعتمادات مستندية لشراء بضائع' },
            project: null
          }
        ]);
        setSuppliers([{ id: 'demo-sup-1', name: 'German Iron Exports GmbH' }]);
        setProjects([{ id: 'demo-p1', name: 'مشروع الفلل السكنية - المرحلة الأولى' }]);
        setBanks([{ id: 'demo-b1', name: 'البنك الأهلي المصري', code: '123201' }]);
        setItems([
          { id: 'item-1', name: 'مواسير حديد مجلفن 3 بوصة', current_cost: 150 },
          { id: 'item-2', name: 'صاج حديد تسليح 12 مم', current_cost: 450 }
        ]);
        setAllAccounts([
          { id: 'demo-b1', name: 'البنك الأهلي المصري', code: '123201', type: 'asset' },
          { id: 'demo-acc-lc', name: 'اعتمادات مستندية لشراء بضائع', code: '1246', type: 'asset' },
          { id: 'demo-acc-cash', name: 'خزينة الشركة الرئيسية', code: '123101', type: 'asset' }
        ]);
        setExpenses([
          {
            id: 'demo-exp-1',
            lc_id: 'demo-lc-1',
            expense_type: 'bank_commission',
            amount: 2500,
            expense_date: '2026-08-02',
            invoice_ref: 'BANK-CHG-9988',
            notes: 'عمولة ومصاريف فتح الاعتماد'
          }
        ]);
        setLoading(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id;
      if (!userOrgId) {
        setLoading(false);
        return;
      }

      // Fetch LCs
      let query = supabase.from('letters_of_credit')
        .select(`
          *,
          project:projects(name),
          supplier:suppliers(name),
          bank:accounts!letters_of_credit_bank_id_fkey(name, code),
          lc_account:accounts!letters_of_credit_lc_account_id_fkey(name, code)
        `)
        .eq('organization_id', userOrgId)
        .order('created_at', { ascending: false });

      if (selectedFiscalYear) {
        query = query.gte('opening_date', `${selectedFiscalYear}-01-01`).lte('opening_date', `${selectedFiscalYear}-12-31`);
      }

      const { data: lcsData, error: lcsError } = await query;
      if (lcsError) throw lcsError;
      setLgs(lcsData || []);

      // Fetch Suppliers
      const { data: suppliersData } = await supabase.from('suppliers').select('id, name').eq('organization_id', userOrgId);
      setSuppliers(suppliersData || []);

      // Fetch Projects
      const { data: projectsData } = await supabase.from('projects').select('id, name').eq('organization_id', userOrgId);
      setProjects(projectsData || []);

      // Fetch Items (Materials/Inventory items)
      const { data: itemsData } = await supabase.from('items').select('id, name, current_cost').eq('organization_id', userOrgId);
      setItems(itemsData || []);

      // Fetch Chart of Accounts
      const { data: accountsData } = await supabase.from('accounts').select('id, name, code, type').eq('organization_id', userOrgId);
      if (accountsData) {
        setAllAccounts(accountsData);
        const bankAccounts = accountsData.filter(a => 
          a.code?.startsWith('1232') || 
          a.code?.startsWith('10102') || 
          a.code?.startsWith('123') || 
          a.code?.startsWith('101') || 
          a.name?.includes('بنك') || 
          a.name?.toLowerCase().includes('bank')
        );
        setBanks(bankAccounts.length > 0 ? bankAccounts : accountsData);
      }

    } catch (err: any) {
      showToast('خطأ أثناء جلب البيانات: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Fetch expenses for a specific LC
  const fetchLcExpenses = async (lcId: string) => {
    if (currentUser?.role === 'demo') return;
    try {
      const { data, error } = await supabase.from('lc_expenses')
        .select('*')
        .eq('lc_id', lcId)
        .order('expense_date', { ascending: true });
      if (error) throw error;
      setExpenses(data || []);
    } catch (err: any) {
      showToast('فشل جلب مصروفات الاعتماد: ' + err.message, 'error');
    }
  };

  const handleSaveLc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.lc_number || !formData.supplier_id || !formData.bank_id || !formData.lc_account_id) {
      showToast('يرجى ملء جميع الحقول المطلوبة', 'warning');
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id;

      if (!userOrgId && currentUser?.role !== 'demo') {
        throw new Error('لم يتم تحديد المؤسسة.');
      }

      const lcPayload = {
        lc_number: formData.lc_number,
        supplier_id: formData.supplier_id,
        bank_id: formData.bank_id,
        lc_account_id: formData.lc_account_id,
        currency_code: formData.currency_code,
        exchange_rate: Number(formData.exchange_rate),
        amount_foreign: Number(formData.amount_foreign),
        amount_local: Number(formData.amount_local),
        margin_percentage: Number(formData.margin_percentage),
        margin_amount: Number(formData.margin_amount),
        opening_date: formData.opening_date,
        expiry_date: formData.expiry_date,
        project_id: formData.project_id || null,
        notes: formData.notes,
        organization_id: userOrgId
      };

      if (currentUser?.role === 'demo') {
        showToast('تم حفظ الاعتماد المستندي (نسخة تجريبية) ✅', 'success');
        setShowAddModal(false);
        return;
      }

      let resultLc;
      if (editingLcId) {
        const { data, error } = await supabase.from('letters_of_credit')
          .update(lcPayload)
          .eq('id', editingLcId)
          .select()
          .single();
        if (error) throw error;
        resultLc = data;
        showToast('تم تحديث الاعتماد المستندي بنجاح ✅', 'success');
      } else {
        const { data, error } = await supabase.from('letters_of_credit')
          .insert([lcPayload])
          .select()
          .single();
        if (error) throw error;
        resultLc = data;
        showToast('تم تسجيل وفتح الاعتماد المستندي بنجاح ✅', 'success');
      }

      // Generate Opening Journal Entry (خصم الغطاء وعمولات الفتح)
      if (formData.auto_post_journal && !editingLcId && resultLc) {
        const journalLines: any[] = [];
        
        // 1. حساب وسيط الاعتماد (مدين بالغطاء النقدي المقتطع)
        if (Number(formData.margin_amount) > 0) {
          journalLines.push({
            accountId: formData.lc_account_id,
            debit: Number(formData.margin_amount),
            credit: 0,
            description: `غطاء نقدي للاعتماد المستندي رقم ${formData.lc_number} لشراء بضائع`
          });
        }

        // 2. البنك المصدر (دائن بالغطاء المقتطع)
        if (Number(formData.margin_amount) > 0) {
          journalLines.push({
            accountId: formData.bank_id,
            debit: 0,
            credit: Number(formData.margin_amount),
            description: `سداد غطاء الاعتماد المستندي رقم ${formData.lc_number}`
          });
        }

        if (journalLines.length > 0) {
          await addEntry({
            date: formData.opening_date,
            reference: `LC-OPN-${formData.lc_number}`,
            description: `فتح اعتماد مستندي رقم ${formData.lc_number} لصالح المورد`,
            lines: journalLines,
            status: 'posted'
          });
          showToast('تم ترحيل قيد فتح الاعتماد آلياً 📊', 'success');
        }
      }

      setShowAddModal(false);
      setEditingLcId(null);
      fetchData();
    } catch (err: any) {
      showToast('فشل حفظ الاعتماد المستندي: ' + err.message, 'error');
    }
  };

  // Add Expense to LC
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseData.amount || !expenseData.payment_account_id) {
      showToast('يرجى تحديد القيمة وحساب السداد المالي', 'warning');
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id;

      if (currentUser?.role === 'demo') {
        const newExp = {
          id: 'demo-exp-' + Date.now(),
          lc_id: selectedLc.id,
          expense_type: expenseData.expense_type,
          amount: Number(expenseData.amount),
          expense_date: expenseData.expense_date,
          invoice_ref: expenseData.invoice_ref,
          notes: expenseData.notes
        };
        setExpenses(prev => [...prev, newExp]);
        showToast('تمت إضافة المصروف بنجاح (نسخة تجريبية) ✅', 'success');
        setShowExpenseModal(false);
        return;
      }

      const { data, error } = await supabase.from('lc_expenses')
        .insert([{
          lc_id: selectedLc.id,
          expense_type: expenseData.expense_type,
          amount: Number(expenseData.amount),
          expense_date: expenseData.expense_date,
          invoice_ref: expenseData.invoice_ref,
          notes: expenseData.notes,
          organization_id: userOrgId
        }])
        .select()
        .single();

      if (error) throw error;
      showToast('تمت رسملة وإضافة المصروف للاعتماد بنجاح ✅', 'success');

      // Post Journal Entry for the expense
      if (expenseData.auto_post_journal) {
        let expenseLabel = '';
        switch (expenseData.expense_type) {
          case 'bank_commission': expenseLabel = 'عمولة ومصاريف البنك'; break;
          case 'freight': expenseLabel = 'مصاريف الشحن الدولي والبري'; break;
          case 'customs': expenseLabel = 'الرسوم والضرائب الجمركية'; break;
          case 'insurance': expenseLabel = 'قسط التأمين على الشحنة'; break;
          default: expenseLabel = 'مصاريف اعتماد مستندي';
        }

        await addEntry({
          date: expenseData.expense_date,
          reference: `LC-EXP-${selectedLc.lc_number}`,
          description: `إثبات ${expenseLabel} للاعتماد رقم ${selectedLc.lc_number}`,
          lines: [
            {
              accountId: selectedLc.lc_account_id, // مدين لحساب وسيط الاعتماد لرسملته
              debit: Number(expenseData.amount),
              credit: 0,
              description: `${expenseLabel} - مرجع: ${expenseData.invoice_ref || '-'}`
            },
            {
              accountId: expenseData.payment_account_id, // دائن لحساب الدفع (صندوق/بنك)
              debit: 0,
              credit: Number(expenseData.amount),
              description: `سداد ${expenseLabel} للاعتماد رقم ${selectedLc.lc_number}`
            }
          ],
          status: 'posted'
        });
        showToast('تم ترحيل قيد رسملة المصروف تلقائياً 📊', 'success');
      }

      setShowExpenseModal(false);
      fetchLcExpenses(selectedLc.id);
    } catch (err: any) {
      showToast('فشل إضافة المصروف: ' + err.message, 'error');
    }
  };

  // Close LC & land costs into inventory
  const handleCloseAndAllocate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const totalAllocated = closingItems.reduce((acc, curr) => acc + (Number(curr.qty) * Number(curr.final_unit_cost)), 0);

      if (currentUser?.role === 'demo') {
        showToast('تم إقفال وتوزيع تكاليف الاعتماد وتوريد المخزن (نسخة تجريبية) 📦', 'success');
        setShowCloseModal(false);
        return;
      }

      // 1. Update LC status to 'closed'
      const { error: lcError } = await supabase.from('letters_of_credit')
        .update({ status: 'closed' })
        .eq('id', selectedLc.id);
      if (lcError) throw lcError;

      // 2. Loop through items and update their cost and inventory
      for (const item of closingItems) {
        if (!item.item_id) continue;
        const { error: itemError } = await supabase.rpc('update_item_cost_and_qty', {
          p_item_id: item.item_id,
          p_qty: Number(item.qty),
          p_unit_cost: Number(item.final_unit_cost)
        });
      }

      // 3. Post Journal Entry to Close LC and receive to Inventory Raw Materials (10301)
      const rawMaterialsAcc = getSystemAccount('INVENTORY_RAW_MATERIALS')?.id || allAccounts.find(a => a.code === '10301')?.id;
      if (rawMaterialsAcc) {
        await addEntry({
          date: new Date().toISOString().split('T')[0],
          reference: `LC-CLOSE-${selectedLc.lc_number}`,
          description: `إغلاق وتصفية الاعتماد رقم ${selectedLc.lc_number} وتوريد البضاعة للمخازن`,
          lines: [
            {
              accountId: rawMaterialsAcc, // مدين لحساب المخزن
              debit: totalAllocated,
              credit: 0,
              description: `استلام خامات شحنة الاعتماد المستندي رقم ${selectedLc.lc_number}`
            },
            {
              accountId: selectedLc.lc_account_id, // دائن لحساب وسيط الاعتماد لإقفاله بالكامل وتصفيره
              debit: 0,
              credit: totalAllocated,
              description: `تصفية وإقفال الاعتماد المستندي رقم ${selectedLc.lc_number}`
            }
          ],
          status: 'posted'
        });
        showToast('تم إغلاق الاعتماد وترحيل قيد إثبات المخازن بنجاح 📊', 'success');
      }

      setShowCloseModal(false);
      setSelectedLc(null);
      fetchData();
    } catch (err: any) {
      showToast('فشل تصفية وإقفال الاعتماد: ' + err.message, 'error');
    }
  };

  // Helper to dynamically calculate Landed Cost
  const calculateLandedCost = () => {
    const baseGoodsValue = selectedLc ? Number(selectedLc.amount_local) : 0;
    const totalExpenses = expenses.reduce((acc, curr) => acc + Number(curr.amount), 0);
    const markupRatio = baseGoodsValue > 0 ? (totalExpenses / baseGoodsValue) : 0;

    const updated = closingItems.map(item => {
      const orig = Number(item.original_price);
      const allocated = orig * markupRatio;
      const finalCost = orig + allocated;
      return {
        ...item,
        allocated_cost: parseFloat(allocated.toFixed(2)),
        final_unit_cost: parseFloat(finalCost.toFixed(2))
      };
    });

    setClosingItems(updated);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'opened':
        return <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full text-xs font-bold border border-blue-100 flex items-center gap-1 w-fit"><CheckCircle size={12} /> مفتوح</span>;
      case 'documents_received':
        return <span className="bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full text-xs font-bold border border-amber-100 flex items-center gap-1 w-fit"><FileText size={12} /> مستندات مقبولة</span>;
      case 'delivered':
        return <span className="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full text-xs font-bold border border-emerald-100 flex items-center gap-1 w-fit"><Truck size={12} /> قيد التخليص</span>;
      case 'closed':
        return <span className="bg-slate-50 text-slate-600 px-2.5 py-1 rounded-full text-xs font-bold border border-slate-100 flex items-center gap-1 w-fit"><Archive size={12} /> مغلق ومصفى</span>;
      case 'cancelled':
        return <span className="bg-rose-50 text-rose-700 px-2.5 py-1 rounded-full text-xs font-bold border border-rose-100 flex items-center gap-1 w-fit"><Ban size={12} /> ملغي</span>;
      default:
        return <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs">{status}</span>;
    }
  };

  const getExpenseTypeText = (type: string) => {
    switch (type) {
      case 'bank_commission': return 'عمولة ومصاريف البنك';
      case 'freight': return 'شحن ونولون دولي/بري';
      case 'customs': return 'رسوم وضرائب جمركية';
      case 'insurance': return 'تأمين شحنات';
      case 'other': return 'مصاريف أخرى';
      default: return type;
    }
  };

  return (
    <div className="p-6 space-y-6 text-slate-800" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <ArrowLeftRight className="text-indigo-600" size={28} />
            إدارة الاعتمادات المستندية (Letters of Credit)
          </h1>
          <p className="text-slate-500 text-sm mt-1">فتح الاعتمادات، وإدارة التمويل والغطاء النقدي، ورسملة مصاريف الاستيراد وتوزيع التكاليف على المخازن.</p>
        </div>
        <button 
          onClick={() => {
            const defaultLcAccId = getSystemAccount('LETTER_OF_CREDIT_GOODS')?.id || allAccounts.find(a => a.code === '1246' || a.name?.includes('اعتمادات'))?.id || '';
            setEditingLcId(null);
            setFormData({
              lc_number: '',
              supplier_id: '',
              bank_id: '',
              lc_account_id: defaultLcAccId,
              currency_code: 'USD',
              exchange_rate: 49.50,
              amount_foreign: 0,
              amount_local: 0,
              margin_percentage: 10,
              margin_amount: 0,
              opening_date: new Date().toISOString().split('T')[0],
              expiry_date: new Date(new Date().setMonth(new Date().getMonth() + 6)).toISOString().split('T')[0],
              project_id: '',
              notes: '',
              auto_post_journal: true
            });
            setShowAddModal(true);
          }}
          className="bg-indigo-600 text-white px-4 py-2.5 rounded-lg flex items-center gap-2 font-bold hover:bg-indigo-700 transition shadow-sm"
        >
          <Plus size={18} /> فتح اعتماد مستندي جديد
        </button>
      </div>

      {/* Stats Board */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-slate-500">الاعتمادات المفتوحة</p>
            <p className="text-2xl font-black text-slate-900 mt-1">
              {lgs.filter(l => l.status !== 'closed').length} <span className="text-xs font-semibold text-slate-400">اعتماد</span>
            </p>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
            <Landmark size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-slate-500">إجمالي قيمة المشتريات المعلقة</p>
            <p className="text-2xl font-black text-amber-600 mt-1">
              {lgs.filter(l => l.status !== 'closed').reduce((acc, curr) => acc + Number(curr.amount_local), 0).toLocaleString()} <span className="text-xs font-semibold text-slate-400">{currencySymbol}</span>
            </p>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
            <Coins size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-slate-500">إجمالي الأغطية النقدية المحجوزة</p>
            <p className="text-2xl font-black text-emerald-700 mt-1">
              {lgs.filter(l => l.status !== 'closed').reduce((acc, curr) => acc + Number(curr.margin_amount), 0).toLocaleString()} <span className="text-xs font-semibold text-slate-400">{currencySymbol}</span>
            </p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
            <Percent size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-slate-500">اعتمادات مصفاة مغلقة</p>
            <p className="text-2xl font-black text-slate-700 mt-1">
              {lgs.filter(l => l.status === 'closed').length} <span className="text-xs font-semibold text-slate-400">اعتماد</span>
            </p>
          </div>
          <div className="p-3 bg-slate-100 text-slate-700 rounded-lg">
            <Archive size={24} />
          </div>
        </div>
      </div>

      {/* Main Layout: List and Details */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        {/* List of LCs */}
        <div className="xl:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <h2 className="font-black text-slate-800 text-sm flex items-center gap-1.5">
                <ClipboardList size={16} /> قائمة ملفات الاعتماد المفتوحة والمغلقة
              </h2>
            </div>
            {lgs.length === 0 ? (
              <div className="p-8 text-center text-slate-400">لا توجد اعتمادات مستندية مسجلة حالياً.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead className="bg-slate-50/50 text-slate-600 border-b border-slate-200 text-xs font-bold">
                    <tr>
                      <th className="p-3">رقم الاعتماد</th>
                      <th className="p-3">المورد الخارجي</th>
                      <th className="p-3">القيمة الأجنبية</th>
                      <th className="p-3">القيمة المحلية</th>
                      <th className="p-3">الغطاء النقدي</th>
                      <th className="p-3">تاريخ الفتح</th>
                      <th className="p-3">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {lgs.map(lc => (
                      <tr 
                        key={lc.id} 
                        onClick={() => {
                          setSelectedLc(lc);
                          fetchLcExpenses(lc.id);
                        }}
                        className={`hover:bg-indigo-50/30 cursor-pointer transition ${selectedLc?.id === lc.id ? 'bg-indigo-50/50 border-r-2 border-indigo-600' : ''}`}
                      >
                        <td className="p-3 font-mono font-bold text-indigo-600">{lc.lc_number}</td>
                        <td className="p-3 font-semibold text-slate-700">{lc.supplier?.name || 'غير معروف'}</td>
                        <td className="p-3 font-semibold">{lc.amount_foreign.toLocaleString()} {lc.currency_code}</td>
                        <td className="p-3 font-black text-slate-900">{lc.amount_local.toLocaleString()} {currencySymbol}</td>
                        <td className="p-3 font-medium text-emerald-700">
                          {lc.margin_amount.toLocaleString()} {currencySymbol} ({lc.margin_percentage}%)
                        </td>
                        <td className="p-3 text-slate-500">{lc.opening_date}</td>
                        <td className="p-3">{getStatusBadge(lc.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Selected LC Details & Capitalization tracker */}
        <div className="xl:col-span-1">
          {selectedLc ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden space-y-4">
              <div className="p-4 bg-slate-800 text-white flex justify-between items-center">
                <div>
                  <h3 className="font-black text-sm">ملف الاعتماد: {selectedLc.lc_number}</h3>
                  <p className="text-[10px] text-slate-300 mt-0.5">صالح لغاية: {selectedLc.expiry_date}</p>
                </div>
                {getStatusBadge(selectedLc.status)}
              </div>

              <div className="p-4 space-y-4 text-xs">
                {/* Financial overview */}
                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 block">المبلغ بالعملة الأجنبية</span>
                    <span className="font-bold text-slate-900 text-sm">{selectedLc.amount_foreign.toLocaleString()} {selectedLc.currency_code}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 block">سعر الصرف التقديري</span>
                    <span className="font-mono text-slate-600">1 {selectedLc.currency_code} = {selectedLc.exchange_rate} ج.م</span>
                  </div>
                  <div className="col-span-2 border-t border-slate-200 my-1 pt-1">
                    <span className="text-[10px] font-bold text-slate-400 block">القيمة الإجمالية التقديرية للبضاعة</span>
                    <span className="font-black text-indigo-700 text-sm">{selectedLc.amount_local.toLocaleString()} {currencySymbol}</span>
                  </div>
                </div>

                {/* Capitalization details */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <h4 className="font-bold text-slate-700 flex items-center gap-1"><Truck size={14} className="text-slate-500" /> المصاريف والرسوم المضافة</h4>
                    {selectedLc.status !== 'closed' && (
                      <button 
                        onClick={() => {
                          setExpenseData({
                            expense_type: 'bank_commission',
                            amount: 0,
                            expense_date: new Date().toISOString().split('T')[0],
                            invoice_ref: '',
                            payment_account_id: '',
                            notes: '',
                            auto_post_journal: true
                          });
                          setShowExpenseModal(true);
                        }}
                        className="text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-0.5"
                      >
                        <Plus size={12} /> إضافة مصروف
                      </button>
                    )}
                  </div>

                  {expenses.length === 0 ? (
                    <div className="p-6 text-center bg-slate-50/50 rounded-lg text-slate-400 border border-dashed border-slate-200">
                      لم يتم تسجيل مصروفات جمارك أو شحن على هذا الاعتماد حتى الآن.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {expenses.map(exp => (
                        <div key={exp.id} className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 flex justify-between items-start">
                          <div>
                            <span className="font-bold text-slate-800 block">{getExpenseTypeText(exp.expense_type)}</span>
                            {exp.invoice_ref && <span className="text-[9px] text-slate-400 block">سند: {exp.invoice_ref}</span>}
                            {exp.notes && <p className="text-[9px] text-slate-500 mt-0.5">{exp.notes}</p>}
                          </div>
                          <div className="text-right">
                            <span className="font-black text-rose-700 block">{exp.amount.toLocaleString()} {currencySymbol}</span>
                            <span className="text-[8px] text-slate-400 block">{exp.expense_date}</span>
                          </div>
                        </div>
                      ))}

                      {/* Expense summary */}
                      <div className="bg-rose-50/40 p-2.5 rounded-lg border border-rose-100/50 flex justify-between items-center font-bold">
                        <span>إجمالي المصروفات الرسملة:</span>
                        <span className="text-rose-700 text-sm">
                          {expenses.reduce((acc, curr) => acc + Number(curr.amount), 0).toLocaleString()} {currencySymbol}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Closing actions */}
                {selectedLc.status !== 'closed' && (
                  <div className="pt-2 border-t border-slate-100 flex gap-2">
                    <button 
                      onClick={() => {
                        calculateLandedCost();
                        setShowCloseModal(true);
                      }}
                      className="w-full py-2 bg-emerald-600 text-white font-bold rounded-lg text-center shadow-sm hover:bg-emerald-700 transition flex items-center justify-center gap-1"
                    >
                      <Archive size={14} /> إقفال وتوريد المخزن (Landed Cost)
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 rounded-xl p-8 text-center text-slate-400 border-2 border-dashed border-slate-200">
              <Landmark className="mx-auto mb-2 text-slate-300" size={32} />
              <p className="font-bold text-xs">اختر اعتماداً مستندياً من الجدول لعرض تفاصيله ورسملة مصروفات الجمارك والشحن.</p>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: Open LC */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl overflow-hidden border border-slate-200">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-black text-slate-800 text-lg flex items-center gap-2">
                <Landmark size={20} className="text-indigo-600" />
                {editingLcId ? 'تعديل الاعتماد المستندي' : 'فتح وتأكيد اعتماد مستندي جديد'}
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 transition text-xl font-bold">&times;</button>
            </div>
            
            <form onSubmit={handleSaveLc} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* LC Number */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">رقم الاعتماد المستندي *</label>
                  <input
                    type="text"
                    required
                    value={formData.lc_number}
                    onChange={(e) => setFormData(prev => ({ ...prev, lc_number: e.target.value }))}
                    placeholder="مثال: LC-EGP-9010"
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                {/* Foreign Supplier */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">المورد الخارجي (المصدر) *</label>
                  <select
                    required
                    value={formData.supplier_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, supplier_id: e.target.value }))}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="">اختر المورد الخارجي</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                {/* Bank Account */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">البنك الجاري الفاتح للاعتماد *</label>
                  <select
                    required
                    value={formData.bank_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, bank_id: e.target.value }))}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="">اختر حساب البنك المصدر</option>
                    {banks.map(b => (
                      <option key={b.id} value={b.id}>({b.code}) - {b.name}</option>
                    ))}
                  </select>
                </div>

                {/* LC Asset Account */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">حساب وسيط الاعتماد (مدين بالتكلفة) *</label>
                  <select
                    required
                    value={formData.lc_account_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, lc_account_id: e.target.value }))}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="">اختر حساب وسيط الاعتمادات المستندية</option>
                    {allAccounts.filter(a => a.type === 'asset').map(a => (
                      <option key={a.id} value={a.id}>({a.code}) - {a.name}</option>
                    ))}
                  </select>
                </div>

                {/* Exchange currency & rate */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-bold text-slate-500">عملة الاستيراد *</label>
                    <label className="block text-xs font-bold text-slate-500">سعر الصرف *</label>
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={formData.currency_code}
                      onChange={(e) => setFormData(prev => ({ ...prev, currency_code: e.target.value }))}
                      className="w-1/3 p-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none cursor-pointer"
                    >
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="GBP">GBP (£)</option>
                      <option value="SAR">SAR</option>
                    </select>
                    <input
                      type="number"
                      required
                      step="any"
                      value={formData.exchange_rate}
                      onChange={(e) => setFormData(prev => ({ ...prev, exchange_rate: Number(e.target.value) }))}
                      className="w-2/3 p-2 border border-slate-200 rounded-lg text-sm focus:outline-none"
                    />
                  </div>
                </div>

                {/* Amount in Foreign Currency */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">المبلغ بالعملة الأجنبية *</label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      min="0"
                      step="any"
                      value={formData.amount_foreign || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, amount_foreign: Number(e.target.value) }))}
                      placeholder="0.00"
                      className="w-full p-2 pl-8 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs font-bold text-slate-400 pointer-events-none">{formData.currency_code}</span>
                  </div>
                </div>

                {/* Local Amount (Calculated) */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">المبلغ المعادل بالعملة المحلية</label>
                  <div className="relative">
                    <input
                      type="number"
                      readOnly
                      value={formData.amount_local}
                      className="w-full p-2 pl-12 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none"
                    />
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs font-bold text-slate-400 pointer-events-none">{currencySymbol}</span>
                  </div>
                </div>

                {/* Margin % & Margin Amount */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-bold text-slate-500">نسبة الغطاء النقدي %</label>
                    <label className="block text-xs font-bold text-slate-500">قيمة الغطاء النقدي المقتطع</label>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative w-1/3">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={formData.margin_percentage}
                        onChange={(e) => setFormData(prev => ({ ...prev, margin_percentage: Number(e.target.value) }))}
                        className="w-full p-2 pl-6 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <span className="absolute inset-y-0 left-0 pl-2 flex items-center text-xs font-bold text-slate-400 pointer-events-none">%</span>
                    </div>
                    <div className="relative w-2/3">
                      <input
                        type="number"
                        readOnly
                        value={formData.margin_amount}
                        className="w-full p-2 pl-12 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none"
                      />
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs font-bold text-slate-400 pointer-events-none">{currencySymbol}</span>
                    </div>
                  </div>
                </div>

                {/* Dates */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">تاريخ فتح الاعتماد *</label>
                  <input
                    type="date"
                    required
                    value={formData.opening_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, opening_date: e.target.value }))}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">تاريخ انتهاء الاعتماد *</label>
                  <input
                    type="date"
                    required
                    value={formData.expiry_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, expiry_date: e.target.value }))}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">ملاحظات وشروط الاعتماد</label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="مثال: الشحن بحراً، ميناء الإسكندرية، شروط السداد CAD..."
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:outline-none"
                />
              </div>

              {/* Auto Journal Entry Toggle */}
              {!editingLcId && (
                <div className="bg-indigo-50/50 p-3 rounded-lg border border-indigo-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 bg-indigo-100 text-indigo-700 rounded">
                      <FileText size={16} />
                    </span>
                    <div>
                      <p className="text-xs font-bold text-indigo-950">إثبات قيد فتح الاعتماد تلقائياً</p>
                      <p className="text-[10px] text-indigo-600">سيتم ترحيل قيد خصم غطاء الاعتماد من الحساب الجاري لصالح حساب وسيط الاعتمادات.</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.auto_post_journal}
                    onChange={(e) => setFormData(prev => ({ ...prev, auto_post_journal: e.target.checked }))}
                    className="h-4 w-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                  />
                </div>
              )}

              {/* Buttons */}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 font-bold rounded-lg text-sm hover:bg-slate-50 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg text-sm hover:bg-indigo-700 transition"
                >
                  حفظ وتأكيد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Add Expense / Capitalization */}
      {showExpenseModal && selectedLc && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-black text-slate-800 text-base flex items-center gap-1.5">
                <Truck size={16} className="text-indigo-600" />
                إضافة مصروف ورسملته على الاعتماد
              </h3>
              <button onClick={() => setShowExpenseModal(false)} className="text-slate-400 hover:text-slate-600 text-xl font-bold">&times;</button>
            </div>

            <form onSubmit={handleAddExpense} className="p-6 space-y-4">
              {/* Expense Type */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">نوع المصروف *</label>
                <select
                  value={expenseData.expense_type}
                  onChange={(e) => setExpenseData(prev => ({ ...prev, expense_type: e.target.value }))}
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="bank_commission">عمولة ومصاريف البنك</option>
                  <option value="freight">شحن ونولون دولي/بري</option>
                  <option value="customs">رسوم وضرائب جمركية</option>
                  <option value="insurance">قسط التأمين على الشحنة</option>
                  <option value="other">مصاريف أخرى</option>
                </select>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">القيمة المصروفة *</label>
                <div className="relative">
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="any"
                    value={expenseData.amount || ''}
                    onChange={(e) => setExpenseData(prev => ({ ...prev, amount: Number(e.target.value) }))}
                    className="w-full p-2 pl-12 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs font-bold text-slate-400 pointer-events-none">{currencySymbol}</span>
                </div>
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">تاريخ دفع المصروف *</label>
                <input
                  type="date"
                  required
                  value={expenseData.expense_date}
                  onChange={(e) => setExpenseData(prev => ({ ...prev, expense_date: e.target.value }))}
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:outline-none cursor-pointer"
                />
              </div>

              {/* Payment Account (Bank/Cash) */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">حساب السداد (صندوق/بنك) *</label>
                <select
                  required
                  value={expenseData.payment_account_id}
                  onChange={(e) => setExpenseData(prev => ({ ...prev, payment_account_id: e.target.value }))}
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="">اختر حساب الدفع المالي</option>
                  {allAccounts.filter(a => a.type === 'asset').map(a => (
                    <option key={a.id} value={a.id}>({a.code}) - {a.name}</option>
                  ))}
                </select>
              </div>

              {/* Invoice reference */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">رقم الفاتورة / المرجع</label>
                <input
                  type="text"
                  value={expenseData.invoice_ref}
                  onChange={(e) => setExpenseData(prev => ({ ...prev, invoice_ref: e.target.value }))}
                  placeholder="مثال: INV-10020"
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:outline-none"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">بيان وملاحظات</label>
                <textarea
                  rows={2}
                  value={expenseData.notes}
                  onChange={(e) => setExpenseData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="وصف إضافي للمصروف..."
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:outline-none"
                />
              </div>

              <div className="bg-indigo-50/50 p-2.5 rounded border border-indigo-100 flex items-center justify-between">
                <span className="text-[10px] text-indigo-900 font-bold">ترحيل قيد المصروف مباشرة</span>
                <input
                  type="checkbox"
                  checked={expenseData.auto_post_journal}
                  onChange={(e) => setExpenseData(prev => ({ ...prev, auto_post_journal: e.target.checked }))}
                  className="h-4 w-4 text-indigo-600 border-slate-300 rounded cursor-pointer"
                />
              </div>

              {/* Form buttons */}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowExpenseModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 font-bold rounded-lg text-sm hover:bg-slate-50 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg text-sm hover:bg-indigo-700 transition"
                >
                  رسملة المصروف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Close & Landed Cost Inventory Receipt */}
      {showCloseModal && selectedLc && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl overflow-hidden border border-slate-200">
            <div className="bg-emerald-50 px-6 py-4 border-b border-emerald-200 flex justify-between items-center">
              <h3 className="font-black text-emerald-800 text-lg flex items-center gap-1.5">
                <Archive size={20} className="text-emerald-700" />
                معالجة تكاليف الاستيراد وتوريد المخزن (Landed Cost Allocation)
              </h3>
              <button onClick={() => setShowCloseModal(false)} className="text-emerald-400 hover:text-emerald-600 text-xl font-bold">&times;</button>
            </div>

            <form onSubmit={handleCloseAndAllocate} className="p-6 space-y-4 text-xs">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <span className="font-bold text-slate-500 block">رقم الاعتماد المستندي</span>
                  <span className="font-black text-slate-800 text-sm">{selectedLc.lc_number}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 block">إجمالي قيمة الفاتورة الأصلية (المحلية)</span>
                  <span className="font-black text-indigo-700 text-sm">{selectedLc.amount_local.toLocaleString()} {currencySymbol}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 block">إجمالي المصاريف الرسملة (جمارك، شحن، إلخ)</span>
                  <span className="font-black text-rose-700 text-sm">
                    {expenses.reduce((acc, curr) => acc + Number(curr.amount), 0).toLocaleString()} {currencySymbol}
                  </span>
                </div>
              </div>

              {/* Items Allocation Table */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <h4 className="font-bold text-slate-700">توزيع التكاليف على الأصناف المستلمة</h4>
                  <button
                    type="button"
                    onClick={() => {
                      setClosingItems(prev => [...prev, { item_id: '', original_price: 0, qty: 1, allocated_cost: 0, final_unit_cost: 0 }]);
                    }}
                    className="text-emerald-600 hover:text-emerald-800 font-bold flex items-center gap-0.5"
                  >
                    <Plus size={12} /> إضافة صنف مستورد
                  </button>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-right border-collapse text-xs">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold">
                      <tr>
                        <th className="p-2">الصنف المستورد</th>
                        <th className="p-2 w-24">الكمية</th>
                        <th className="p-2 w-32">السعر الأصلي للفاتورة</th>
                        <th className="p-2 w-32">التكلفة الإضافية الموزعة</th>
                        <th className="p-2 w-32">سعر التكلفة النهائية للوحدة</th>
                        <th className="p-2 w-12 text-center">إجراء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {closingItems.map((cItem, index) => (
                        <tr key={index} className="hover:bg-slate-50">
                          <td className="p-2">
                            <select
                              required
                              value={cItem.item_id}
                              onChange={(e) => {
                                const val = e.target.value;
                                const defaultPrice = items.find(i => i.id === val)?.current_cost || 0;
                                const updated = [...closingItems];
                                updated[index].item_id = val;
                                updated[index].original_price = defaultPrice;
                                setClosingItems(updated);
                              }}
                              className="w-full p-1.5 border border-slate-200 rounded text-xs bg-white"
                            >
                              <option value="">اختر صنف مخزني...</option>
                              {items.map(it => (
                                <option key={it.id} value={it.id}>{it.name}</option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              required
                              min="1"
                              value={cItem.qty}
                              onChange={(e) => {
                                const updated = [...closingItems];
                                updated[index].qty = Number(e.target.value);
                                setClosingItems(updated);
                              }}
                              className="w-full p-1 border border-slate-200 rounded text-xs focus:outline-none"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              required
                              min="0"
                              step="any"
                              value={cItem.original_price}
                              onChange={(e) => {
                                const updated = [...closingItems];
                                updated[index].original_price = Number(e.target.value);
                                setClosingItems(updated);
                              }}
                              className="w-full p-1 border border-slate-200 rounded text-xs focus:outline-none"
                            />
                          </td>
                          <td className="p-2 bg-slate-50 font-bold text-rose-700">
                            {cItem.allocated_cost.toLocaleString()} {currencySymbol}
                          </td>
                          <td className="p-2 bg-emerald-50 font-black text-emerald-800">
                            {cItem.final_unit_cost.toLocaleString()} {currencySymbol}
                          </td>
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                setClosingItems(prev => prev.filter((_, idx) => idx !== index));
                              }}
                              className="text-slate-400 hover:text-rose-600 transition"
                            >
                              &times;
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-between items-center py-2">
                  <button
                    type="button"
                    onClick={calculateLandedCost}
                    className="bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 px-3 py-1.5 rounded font-bold transition flex items-center gap-1"
                  >
                    <Calculator size={14} /> احتساب وتوزيع التكاليف التلقائي
                  </button>

                  <div className="text-right text-sm">
                    <span className="font-bold text-slate-600">إجمالي قيمة التوريد للمخزن: </span>
                    <span className="font-black text-emerald-800">
                      {closingItems.reduce((acc, curr) => acc + (Number(curr.qty) * Number(curr.final_unit_cost)), 0).toLocaleString()} {currencySymbol}
                    </span>
                  </div>
                </div>
              </div>

              {/* Alert Warning */}
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg flex items-start gap-2 text-amber-800">
                <ShieldAlert size={16} className="mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold">تنبيه هام ومحاسبي</p>
                  <p className="text-[10px] mt-0.5">عند الضغط على إقفال الاعتماد، سيقوم النظام بتسوية وقيد إجمالي التكاليف المسجلة وتوريد الأصناف للمخازن بالقيم الجديدة. لن تتمكن من إضافة مصروفات رسملة جديدة على هذا الاعتماد بعد الإغلاق.</p>
                </div>
              </div>

              {/* Form buttons */}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowCloseModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 font-bold rounded-lg hover:bg-slate-50 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition"
                >
                  تأكيد الإقفال وتوريد البضاعة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
