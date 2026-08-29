import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { 
  Landmark, Plus, Edit, Trash2, Calendar, Search, Filter, 
  ArrowUpRight, RefreshCw, AlertTriangle, FileText, CheckCircle, Ban, 
  Percent, Coins, ClipboardList, HelpCircle, ShieldAlert, Truck, Archive,
  Calculator, DollarSign, ArrowLeftRight, TrendingUp, Activity, Globe
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
  const [lcSearchTerm, setLcSearchTerm] = useState<string>('');

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
        return <span className="bg-teal-50 text-teal-700 px-2.5 py-1 rounded-full text-xs font-bold border border-teal-200 flex items-center gap-1 w-fit"><CheckCircle size={12} /> مفتوح</span>;
      case 'documents_received':
      case 'delivered':
      case 'in_transit':
        return <span className="bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full text-xs font-bold border border-amber-200 flex items-center gap-1 w-fit"><Truck size={12} /> قيد الشحن</span>;
      case 'closed':
        return <span className="bg-slate-50 text-slate-600 px-2.5 py-1 rounded-full text-xs font-bold border border-slate-200 flex items-center gap-1 w-fit"><Archive size={12} /> مغلق ومصفى</span>;
      case 'cancelled':
        return <span className="bg-rose-50 text-rose-700 px-2.5 py-1 rounded-full text-xs font-bold border border-rose-200 flex items-center gap-1 w-fit"><Ban size={12} /> ملغي</span>;
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
  
  const getExpenseTypeColor = (type: string) => {
    switch (type) {
      case 'bank_commission': return 'bg-blue-500';
      case 'freight': return 'bg-amber-500';
      case 'customs': return 'bg-rose-500';
      case 'insurance': return 'bg-teal-500';
      case 'other': return 'bg-purple-500';
      default: return 'bg-slate-500';
    }
  };

  const filteredLcs = lgs.filter(lc => {
    if (statusFilter !== 'all' && lc.status !== statusFilter) return false;
    if (lcSearchTerm && !lc.lc_number.toLowerCase().includes(lcSearchTerm.toLowerCase()) && !lc.supplier?.name?.toLowerCase().includes(lcSearchTerm.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="p-6 space-y-6 text-slate-800" dir="rtl">
      {/* Enhanced Header */}
      <div className="bg-gradient-to-r from-teal-900 to-slate-800 p-6 rounded-2xl shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-white">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2">
            <Globe className="text-teal-400" size={32} />
            إدارة الاعتمادات المستندية
          </h1>
          <p className="text-teal-100 text-sm mt-2 opacity-90 max-w-xl">
            فتح الاعتمادات، وإدارة التمويل والغطاء النقدي، ورسملة مصاريف الاستيراد وتوزيع التكاليف على المخازن بكفاءة.
          </p>
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
          className="bg-teal-500 hover:bg-teal-400 text-slate-900 px-5 py-3 rounded-xl flex items-center gap-2 font-bold transition shadow-lg shrink-0 transform hover:scale-105"
        >
          <Plus size={20} /> فتح اعتماد مستندي جديد
        </button>
      </div>

      {/* Stats Board */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Card 1 */}
        <div className="bg-gradient-to-br from-teal-50 to-white p-5 rounded-xl border border-teal-100 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-teal-100 rounded-bl-full -z-10 opacity-50"></div>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-teal-700 mb-1">الاعتمادات المفتوحة</p>
              <p className="text-2xl font-black text-teal-900">
                {lgs.filter(l => l.status !== 'closed').length}
              </p>
            </div>
            <div className="p-2.5 bg-teal-100 text-teal-600 rounded-lg">
              <Activity size={20} />
            </div>
          </div>
        </div>

        {/* Card 2 */}
        <div className="bg-gradient-to-br from-indigo-50 to-white p-5 rounded-xl border border-indigo-100 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-indigo-100 rounded-bl-full -z-10 opacity-50"></div>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-indigo-700 mb-1">قيمة المشتريات المعلقة</p>
              <p className="text-lg font-black text-indigo-900 truncate" title={lgs.filter(l => l.status !== 'closed').reduce((acc, curr) => acc + Number(curr.amount_local), 0).toLocaleString()}>
                {lgs.filter(l => l.status !== 'closed').reduce((acc, curr) => acc + Number(curr.amount_local), 0).toLocaleString()} <span className="text-[10px] font-semibold opacity-70">{currencySymbol}</span>
              </p>
            </div>
            <div className="p-2.5 bg-indigo-100 text-indigo-600 rounded-lg">
              <Coins size={20} />
            </div>
          </div>
        </div>

        {/* Card 3 */}
        <div className="bg-gradient-to-br from-amber-50 to-white p-5 rounded-xl border border-amber-100 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-amber-100 rounded-bl-full -z-10 opacity-50"></div>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-amber-700 mb-1">إجمالي المصاريف الرسملة</p>
              <p className="text-lg font-black text-amber-900 truncate" title={expenses.reduce((acc, curr) => acc + Number(curr.amount), 0).toLocaleString()}>
                {expenses.reduce((acc, curr) => acc + Number(curr.amount), 0).toLocaleString()} <span className="text-[10px] font-semibold opacity-70">{currencySymbol}</span>
              </p>
            </div>
            <div className="p-2.5 bg-amber-100 text-amber-600 rounded-lg">
              <TrendingUp size={20} />
            </div>
          </div>
        </div>

        {/* Card 4 */}
        <div className="bg-gradient-to-br from-emerald-50 to-white p-5 rounded-xl border border-emerald-100 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-100 rounded-bl-full -z-10 opacity-50"></div>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-emerald-700 mb-1">الأغطية النقدية المحجوزة</p>
              <p className="text-lg font-black text-emerald-900 truncate" title={lgs.filter(l => l.status !== 'closed').reduce((acc, curr) => acc + Number(curr.margin_amount), 0).toLocaleString()}>
                {lgs.filter(l => l.status !== 'closed').reduce((acc, curr) => acc + Number(curr.margin_amount), 0).toLocaleString()} <span className="text-[10px] font-semibold opacity-70">{currencySymbol}</span>
              </p>
            </div>
            <div className="p-2.5 bg-emerald-100 text-emerald-600 rounded-lg">
              <Percent size={20} />
            </div>
          </div>
        </div>

        {/* Card 5 */}
        <div className="bg-gradient-to-br from-slate-50 to-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-slate-200 rounded-bl-full -z-10 opacity-50"></div>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-slate-600 mb-1">اعتمادات مصفاة مغلقة</p>
              <p className="text-2xl font-black text-slate-800">
                {lgs.filter(l => l.status === 'closed').length}
              </p>
            </div>
            <div className="p-2.5 bg-slate-200 text-slate-600 rounded-lg">
              <Archive size={20} />
            </div>
          </div>
        </div>
      </div>

      {/* Main Layout: List and Details */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        {/* List of LCs */}
        <div className="xl:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h2 className="font-black text-slate-800 text-sm flex items-center gap-1.5">
                <ClipboardList size={18} className="text-teal-600" /> قائمة الاعتمادات المستندية
              </h2>
              
              {/* Search and Filter */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input 
                    type="text" 
                    placeholder="بحث برقم الاعتماد أو المورد..." 
                    value={lcSearchTerm}
                    onChange={(e) => setLcSearchTerm(e.target.value)}
                    className="w-full pl-3 pr-9 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              </div>
            </div>
            
            {filteredLcs.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center text-slate-400">
                <Landmark size={48} className="mb-4 text-slate-200" />
                <p>لا توجد اعتمادات مستندية مطابقة للبحث.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead className="bg-white text-slate-500 border-b-2 border-slate-100 text-[11px] font-bold uppercase tracking-wider">
                    <tr>
                      <th className="p-4 text-center w-8"></th>
                      <th className="p-4">الاعتماد والمورد</th>
                      <th className="p-4">البنك والصلاحية</th>
                      <th className="p-4">القيمة الأجنبية</th>
                      <th className="p-4">القيمة المحلية</th>
                      <th className="p-4">الغطاء النقدي</th>
                      <th className="p-4">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredLcs.map(lc => {
                      const isOpened = lc.status === 'opened';
                      const isClosed = lc.status === 'closed';
                      const isSelected = selectedLc?.id === lc.id;
                      
                      return (
                      <tr 
                        key={lc.id} 
                        onClick={() => {
                          setSelectedLc(lc);
                          fetchLcExpenses(lc.id);
                        }}
                        className={`hover:bg-slate-50 cursor-pointer transition ${isSelected ? 'bg-teal-50/30' : ''}`}
                      >
                        <td className="p-0 text-center">
                           <div className={`w-1 h-12 rounded-l-full mx-auto ${isOpened ? 'bg-teal-500' : isClosed ? 'bg-slate-300' : 'bg-amber-400'}`}></div>
                        </td>
                        <td className="p-4">
                          <div className="font-mono font-bold text-slate-900">{lc.lc_number}</div>
                          <div className="text-slate-500 text-[10px] mt-0.5 truncate max-w-[150px] font-semibold">{lc.supplier?.name || 'غير معروف'}</div>
                        </td>
                        <td className="p-4">
                          <div className="text-slate-700 font-semibold text-[11px] truncate max-w-[120px]">{lc.bank?.name || '-'}</div>
                          <div className="text-slate-400 text-[10px] mt-0.5 flex items-center gap-1">
                            <Calendar size={10} /> لغاية: {lc.expiry_date}
                          </div>
                        </td>
                        <td className="p-4 font-semibold text-slate-700">
                          {lc.amount_foreign.toLocaleString()} <span className="text-[10px] text-slate-400">{lc.currency_code}</span>
                        </td>
                        <td className="p-4 font-black text-slate-900">
                          {lc.amount_local.toLocaleString()} <span className="text-[10px] text-slate-400 font-normal">{currencySymbol}</span>
                        </td>
                        <td className="p-4">
                          <div className="font-bold text-emerald-600">{lc.margin_amount.toLocaleString()} <span className="text-[10px] font-normal">{currencySymbol}</span></div>
                          <div className="w-full bg-slate-100 h-1.5 rounded-full mt-1.5 overflow-hidden flex">
                             <div className="bg-emerald-400 h-full rounded-full" style={{ width: `${lc.margin_percentage}%` }}></div>
                          </div>
                        </td>
                        <td className="p-4">{getStatusBadge(lc.status)}</td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Selected LC Details & Capitalization tracker */}
        <div className="xl:col-span-1">
          {selectedLc ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden space-y-0 sticky top-6">
              <div className="p-5 bg-gradient-to-b from-slate-800 to-slate-900 text-white relative">
                <div className="absolute top-0 right-0 w-full h-full overflow-hidden opacity-10 pointer-events-none">
                   <div className="absolute -top-10 -right-10 w-40 h-40 bg-white rounded-full blur-3xl"></div>
                </div>
                <div className="relative z-10 flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-black text-lg font-mono tracking-wider">{selectedLc.lc_number}</h3>
                      <p className="text-[11px] text-slate-300 mt-1 flex items-center gap-1">
                        <Calendar size={12} /> صالح لغاية: {selectedLc.expiry_date}
                      </p>
                    </div>
                    {getStatusBadge(selectedLc.status)}
                  </div>
                </div>
              </div>

              <div className="p-5 space-y-5 text-sm">
                
                {/* Financial overview */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex flex-col justify-center">
                    <span className="text-[11px] font-bold text-slate-500 mb-1 flex items-center gap-1"><DollarSign size={12}/> القيمة الأجنبية</span>
                    <span className="font-black text-slate-800 text-base">{selectedLc.amount_foreign.toLocaleString()} <span className="text-xs text-slate-500">{selectedLc.currency_code}</span></span>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex flex-col justify-center">
                    <span className="text-[11px] font-bold text-slate-500 mb-1 flex items-center gap-1"><RefreshCw size={12}/> سعر الصرف</span>
                    <span className="font-mono text-slate-700 font-bold">{selectedLc.exchange_rate} <span className="text-[10px] text-slate-400">ج.م</span></span>
                  </div>
                  <div className="col-span-2 bg-indigo-50/50 p-3 rounded-xl border border-indigo-100/50 flex flex-col justify-center items-center text-center">
                    <span className="text-[11px] font-bold text-indigo-400 mb-1">القيمة الإجمالية التقديرية (بالمحلي)</span>
                    <span className="font-black text-indigo-700 text-xl">{selectedLc.amount_local.toLocaleString()} <span className="text-xs text-indigo-500">{currencySymbol}</span></span>
                  </div>
                </div>

                {/* Margins */}
                <div className="bg-emerald-50/50 border border-emerald-100/50 p-4 rounded-xl">
                  <div className="flex justify-between items-end mb-2">
                    <div>
                      <span className="text-[11px] font-bold text-emerald-600 block mb-0.5">الغطاء النقدي ({selectedLc.margin_percentage}%)</span>
                      <span className="font-black text-emerald-800">{selectedLc.margin_amount.toLocaleString()} <span className="text-xs font-normal">{currencySymbol}</span></span>
                    </div>
                  </div>
                  <div className="w-full bg-emerald-100 h-2 rounded-full overflow-hidden">
                    <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${selectedLc.margin_percentage}%` }}></div>
                  </div>
                </div>

                {/* Capitalization Progress & Details */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="font-black text-slate-800 flex items-center gap-1.5 text-xs"><TrendingUp size={16} className="text-rose-500" /> المصاريف والرسملة</h4>
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
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded text-[11px] font-bold flex items-center gap-1 transition"
                      >
                        <Plus size={12} /> إضافة مصروف
                      </button>
                    )}
                  </div>

                  {/* Expenses Progress Bar */}
                  {expenses.length > 0 && selectedLc.amount_local > 0 && (
                     <div className="pt-1 pb-3">
                        <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1.5">
                           <span>إجمالي المصاريف</span>
                           <span>{((expenses.reduce((acc, curr) => acc + Number(curr.amount), 0) / selectedLc.amount_local) * 100).toFixed(1)}% من قيمة الاعتماد</span>
                        </div>
                        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex">
                           {expenses.map((exp, idx) => {
                              const percent = (Number(exp.amount) / expenses.reduce((acc, curr) => acc + Number(curr.amount), 0)) * 100;
                              return (
                                 <div key={exp.id || idx} className={`${getExpenseTypeColor(exp.expense_type)} h-full`} style={{ width: `${percent}%` }} title={`${getExpenseTypeText(exp.expense_type)}: ${exp.amount}`}></div>
                              )
                           })}
                        </div>
                     </div>
                  )}

                  {expenses.length === 0 ? (
                    <div className="p-6 text-center bg-slate-50/50 rounded-xl text-slate-400 border border-dashed border-slate-200">
                      <Truck className="mx-auto mb-2 opacity-50" size={24} />
                      <p className="text-xs font-bold">لم يتم تسجيل مصروفات على هذا الاعتماد.</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                      {expenses.map(exp => (
                        <div key={exp.id} className="p-3 bg-white rounded-xl border border-slate-100 shadow-sm flex justify-between items-center group hover:border-slate-300 transition">
                          <div className="flex items-center gap-3">
                             <div className={`w-2 h-2 rounded-full ${getExpenseTypeColor(exp.expense_type)}`}></div>
                            <div>
                              <span className="font-bold text-slate-800 text-xs block">{getExpenseTypeText(exp.expense_type)}</span>
                              <div className="flex items-center gap-2 mt-0.5">
                                 <span className="text-[9px] text-slate-400">{exp.expense_date}</span>
                                 {exp.invoice_ref && <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 rounded">{exp.invoice_ref}</span>}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="font-black text-slate-700 text-xs block">{exp.amount.toLocaleString()}</span>
                            <span className="text-[9px] text-slate-400">{currencySymbol}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Expense summary */}
                  {expenses.length > 0 && (
                    <div className="bg-slate-800 text-white p-3 rounded-xl flex justify-between items-center font-bold shadow-md">
                      <span className="text-xs text-slate-300">الإجمالي المُرسمل:</span>
                      <span className="text-sm">
                        {expenses.reduce((acc, curr) => acc + Number(curr.amount), 0).toLocaleString()} <span className="text-[10px] text-slate-400">{currencySymbol}</span>
                      </span>
                    </div>
                  )}
                </div>

                {/* Additional Info */}
                <div className="pt-4 border-t border-slate-100 text-[11px] text-slate-500 space-y-2">
                   <div className="flex justify-between">
                      <span className="font-semibold">المورد:</span>
                      <span className="font-bold text-slate-700">{selectedLc.supplier?.name || '-'}</span>
                   </div>
                   <div className="flex justify-between">
                      <span className="font-semibold">البنك المصدر:</span>
                      <span className="font-bold text-slate-700">{selectedLc.bank?.name || '-'}</span>
                   </div>
                   {selectedLc.project && (
                     <div className="flex justify-between">
                        <span className="font-semibold">المشروع:</span>
                        <span className="font-bold text-indigo-600">{selectedLc.project.name}</span>
                     </div>
                   )}
                </div>

                {/* Actions */}
                <div className="pt-4 border-t border-slate-100 grid grid-cols-2 gap-2">
                   {selectedLc.status !== 'closed' && (
                     <button 
                       onClick={() => {
                         calculateLandedCost();
                         setShowCloseModal(true);
                       }}
                       className="col-span-2 py-2.5 bg-emerald-600 text-white font-bold rounded-xl text-center shadow-md hover:bg-emerald-700 hover:shadow-lg transition flex items-center justify-center gap-1.5"
                     >
                       <Archive size={16} /> إقفال وتوريد المخزن (Landed Cost)
                     </button>
                   )}
                   <button 
                     onClick={() => {
                       setEditingLcId(selectedLc.id);
                       setFormData({
                         lc_number: selectedLc.lc_number,
                         supplier_id: selectedLc.supplier_id,
                         bank_id: selectedLc.bank_id,
                         lc_account_id: selectedLc.lc_account_id,
                         currency_code: selectedLc.currency_code,
                         exchange_rate: selectedLc.exchange_rate,
                         amount_foreign: selectedLc.amount_foreign,
                         amount_local: selectedLc.amount_local,
                         margin_percentage: selectedLc.margin_percentage,
                         margin_amount: selectedLc.margin_amount,
                         opening_date: selectedLc.opening_date,
                         expiry_date: selectedLc.expiry_date,
                         project_id: selectedLc.project_id || '',
                         notes: selectedLc.notes || '',
                         auto_post_journal: false
                       });
                       setShowAddModal(true);
                     }}
                     className="py-2 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition flex items-center justify-center gap-1"
                   >
                     <Edit size={14} /> تعديل
                   </button>
                   <button 
                     onClick={() => showToast('هذه الخاصية غير متاحة حالياً', 'info')}
                     className="py-2 bg-rose-50 text-rose-600 font-bold rounded-xl hover:bg-rose-100 transition flex items-center justify-center gap-1"
                   >
                     <Trash2 size={14} /> حذف
                   </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 rounded-2xl p-10 text-center text-slate-400 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center h-full min-h-[400px]">
              <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                 <Landmark className="text-slate-300" size={40} />
              </div>
              <p className="font-bold text-sm text-slate-500">اختر اعتماداً مستندياً</p>
              <p className="text-xs mt-2 max-w-[200px]">قم بتحديد اعتماد من القائمة لعرض التفاصيل وإدارة المصاريف.</p>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: Open LC */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden border border-slate-200 transform transition-all">
            <div className="bg-gradient-to-r from-slate-50 to-white px-6 py-5 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-black text-slate-800 text-lg flex items-center gap-2">
                <Landmark size={22} className="text-teal-600" />
                {editingLcId ? 'تعديل الاعتماد المستندي' : 'فتح وتأكيد اعتماد مستندي جديد'}
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 transition text-2xl font-bold rounded-full p-1 hover:bg-slate-100">&times;</button>
            </div>
            
            <form onSubmit={handleSaveLc} className="p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* LC Number */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">رقم الاعتماد المستندي *</label>
                  <input
                    type="text"
                    required
                    value={formData.lc_number}
                    onChange={(e) => setFormData(prev => ({ ...prev, lc_number: e.target.value }))}
                    placeholder="مثال: LC-EGP-9010"
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
                  />
                </div>

                {/* Foreign Supplier */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">المورد الخارجي (المصدر) *</label>
                  <select
                    required
                    value={formData.supplier_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, supplier_id: e.target.value }))}
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent cursor-pointer transition"
                  >
                    <option value="">اختر المورد الخارجي</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                {/* Bank Account */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">البنك الجاري الفاتح للاعتماد *</label>
                  <select
                    required
                    value={formData.bank_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, bank_id: e.target.value }))}
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent cursor-pointer transition"
                  >
                    <option value="">اختر حساب البنك المصدر</option>
                    {banks.map(b => (
                      <option key={b.id} value={b.id}>({b.code}) - {b.name}</option>
                    ))}
                  </select>
                </div>

                {/* LC Asset Account */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">حساب وسيط الاعتماد (مدين بالتكلفة) *</label>
                  <select
                    required
                    value={formData.lc_account_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, lc_account_id: e.target.value }))}
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent cursor-pointer transition"
                  >
                    <option value="">اختر حساب وسيط الاعتمادات المستندية</option>
                    {allAccounts.filter(a => a.type === 'asset').map(a => (
                      <option key={a.id} value={a.id}>({a.code}) - {a.name}</option>
                    ))}
                  </select>
                </div>

                {/* Exchange currency & rate */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-xs font-bold text-slate-600">عملة الاستيراد *</label>
                    <label className="block text-xs font-bold text-slate-600">سعر الصرف *</label>
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={formData.currency_code}
                      onChange={(e) => setFormData(prev => ({ ...prev, currency_code: e.target.value }))}
                      className="w-1/3 p-2.5 border border-slate-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer transition"
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
                      className="w-2/3 p-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 transition"
                    />
                  </div>
                </div>

                {/* Amount in Foreign Currency */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">المبلغ بالعملة الأجنبية *</label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      min="0"
                      step="any"
                      value={formData.amount_foreign || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, amount_foreign: Number(e.target.value) }))}
                      placeholder="0.00"
                      className="w-full p-2.5 pl-10 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 transition"
                    />
                    <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-xs font-bold text-slate-400 pointer-events-none">{formData.currency_code}</span>
                  </div>
                </div>

                {/* Local Amount (Calculated) */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">المبلغ المعادل بالعملة المحلية</label>
                  <div className="relative">
                    <input
                      type="number"
                      readOnly
                      value={formData.amount_local}
                      className="w-full p-2.5 pl-12 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 font-bold focus:outline-none"
                    />
                    <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-xs font-bold text-slate-400 pointer-events-none">{currencySymbol}</span>
                  </div>
                </div>

                {/* Margin % & Margin Amount */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-xs font-bold text-slate-600">نسبة الغطاء النقدي %</label>
                    <label className="block text-xs font-bold text-slate-600">قيمة الغطاء النقدي المقتطع</label>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative w-1/3">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={formData.margin_percentage}
                        onChange={(e) => setFormData(prev => ({ ...prev, margin_percentage: Number(e.target.value) }))}
                        className="w-full p-2.5 pl-8 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 transition"
                      />
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs font-bold text-slate-400 pointer-events-none">%</span>
                    </div>
                    <div className="relative w-2/3">
                      <input
                        type="number"
                        readOnly
                        value={formData.margin_amount}
                        className="w-full p-2.5 pl-12 bg-emerald-50 border border-emerald-100 rounded-xl text-sm text-emerald-800 font-bold focus:outline-none"
                      />
                      <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-xs font-bold text-emerald-600 pointer-events-none">{currencySymbol}</span>
                    </div>
                  </div>
                </div>

                {/* Dates */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">تاريخ فتح الاعتماد *</label>
                  <input
                    type="date"
                    required
                    value={formData.opening_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, opening_date: e.target.value }))}
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">تاريخ انتهاء الاعتماد *</label>
                  <input
                    type="date"
                    required
                    value={formData.expiry_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, expiry_date: e.target.value }))}
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer transition"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">ملاحظات وشروط الاعتماد</label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="مثال: الشحن بحراً، ميناء الإسكندرية، شروط السداد CAD..."
                  className="w-full p-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 transition resize-none"
                />
              </div>

              {/* Auto Journal Entry Toggle */}
              {!editingLcId && (
                <div className="bg-indigo-50/70 p-4 rounded-xl border border-indigo-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                      <FileText size={18} />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-indigo-900">إثبات قيد فتح الاعتماد تلقائياً</p>
                      <p className="text-xs text-indigo-600 mt-0.5">سيتم ترحيل قيد خصم غطاء الاعتماد من الحساب الجاري لصالح حساب وسيط الاعتمادات.</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.auto_post_journal}
                    onChange={(e) => setFormData(prev => ({ ...prev, auto_post_journal: e.target.checked }))}
                    className="h-5 w-5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                  />
                </div>
              )}

              {/* Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-5 py-2.5 border border-slate-200 text-slate-600 font-bold rounded-xl text-sm hover:bg-slate-50 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-teal-600 text-white font-bold rounded-xl text-sm hover:bg-teal-700 shadow-md hover:shadow-lg transition"
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 transform transition-all">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
                <Truck size={18} className="text-indigo-600" />
                إضافة مصروف ورسملته
              </h3>
              <button onClick={() => setShowExpenseModal(false)} className="text-slate-400 hover:text-slate-600 text-xl font-bold rounded-full p-1 hover:bg-slate-100 transition">&times;</button>
            </div>

            <form onSubmit={handleAddExpense} className="p-6 space-y-4">
              {/* Expense Type */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">نوع المصروف *</label>
                <select
                  value={expenseData.expense_type}
                  onChange={(e) => setExpenseData(prev => ({ ...prev, expense_type: e.target.value }))}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer transition"
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
                <label className="block text-xs font-bold text-slate-600 mb-1.5">القيمة المصروفة *</label>
                <div className="relative">
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="any"
                    value={expenseData.amount || ''}
                    onChange={(e) => setExpenseData(prev => ({ ...prev, amount: Number(e.target.value) }))}
                    className="w-full p-2.5 pl-12 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                  />
                  <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-xs font-bold text-slate-400 pointer-events-none">{currencySymbol}</span>
                </div>
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">تاريخ دفع المصروف *</label>
                <input
                  type="date"
                  required
                  value={expenseData.expense_date}
                  onChange={(e) => setExpenseData(prev => ({ ...prev, expense_date: e.target.value }))}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer transition"
                />
              </div>

              {/* Payment Account (Bank/Cash) */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">حساب السداد (صندوق/بنك) *</label>
                <select
                  required
                  value={expenseData.payment_account_id}
                  onChange={(e) => setExpenseData(prev => ({ ...prev, payment_account_id: e.target.value }))}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer transition"
                >
                  <option value="">اختر حساب الدفع المالي</option>
                  {allAccounts.filter(a => a.type === 'asset').map(a => (
                    <option key={a.id} value={a.id}>({a.code}) - {a.name}</option>
                  ))}
                </select>
              </div>

              {/* Invoice reference */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">رقم الفاتورة / المرجع</label>
                <input
                  type="text"
                  value={expenseData.invoice_ref}
                  onChange={(e) => setExpenseData(prev => ({ ...prev, invoice_ref: e.target.value }))}
                  placeholder="مثال: INV-10020"
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">بيان وملاحظات</label>
                <textarea
                  rows={2}
                  value={expenseData.notes}
                  onChange={(e) => setExpenseData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="وصف إضافي للمصروف..."
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition resize-none"
                />
              </div>

              <div className="bg-indigo-50/50 p-3 rounded-xl border border-indigo-100 flex items-center justify-between">
                <span className="text-xs text-indigo-900 font-bold">ترحيل قيد المصروف مباشرة</span>
                <input
                  type="checkbox"
                  checked={expenseData.auto_post_journal}
                  onChange={(e) => setExpenseData(prev => ({ ...prev, auto_post_journal: e.target.checked }))}
                  className="h-4 w-4 text-indigo-600 border-slate-300 rounded cursor-pointer"
                />
              </div>

              {/* Form buttons */}
              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowExpenseModal(false)}
                  className="px-5 py-2.5 border border-slate-200 text-slate-600 font-bold rounded-xl text-sm hover:bg-slate-50 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl text-sm hover:bg-indigo-700 shadow-md hover:shadow-lg transition"
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
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden border border-slate-200">
            <div className="bg-emerald-50 px-6 py-5 border-b border-emerald-200 flex justify-between items-center">
              <h3 className="font-black text-emerald-800 text-lg flex items-center gap-2">
                <Archive size={22} className="text-emerald-600" />
                معالجة تكاليف الاستيراد وتوريد المخزن (Landed Cost)
              </h3>
              <button onClick={() => setShowCloseModal(false)} className="text-emerald-500 hover:text-emerald-700 text-2xl font-bold rounded-full p-1 hover:bg-emerald-100 transition">&times;</button>
            </div>

            <form onSubmit={handleCloseAndAllocate} className="p-6 space-y-6 text-sm">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-6 shadow-inner">
                <div>
                  <span className="font-bold text-slate-500 block mb-1">رقم الاعتماد المستندي</span>
                  <span className="font-mono font-black text-slate-800 text-lg">{selectedLc.lc_number}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 block mb-1">إجمالي الفاتورة الأصلية</span>
                  <span className="font-black text-indigo-700 text-lg">{selectedLc.amount_local.toLocaleString()} <span className="text-xs text-indigo-500">{currencySymbol}</span></span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 block mb-1">إجمالي المصاريف الرسملة</span>
                  <span className="font-black text-rose-600 text-lg">
                    {expenses.reduce((acc, curr) => acc + Number(curr.amount), 0).toLocaleString()} <span className="text-xs text-rose-500">{currencySymbol}</span>
                  </span>
                </div>
              </div>

              {/* Items Allocation Table */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="font-black text-slate-700 text-base">توزيع التكاليف على الأصناف المستلمة</h4>
                  <button
                    type="button"
                    onClick={() => {
                      setClosingItems(prev => [...prev, { item_id: '', original_price: 0, qty: 1, allocated_cost: 0, final_unit_cost: 0 }]);
                    }}
                    className="text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition"
                  >
                    <Plus size={14} /> إضافة صنف مستورد
                  </button>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-right border-collapse text-xs">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold">
                      <tr>
                        <th className="p-3">الصنف المستورد</th>
                        <th className="p-3 w-24">الكمية</th>
                        <th className="p-3 w-32">السعر الأصلي للفاتورة</th>
                        <th className="p-3 w-32">التكلفة الإضافية الموزعة</th>
                        <th className="p-3 w-32">سعر التكلفة النهائية للوحدة</th>
                        <th className="p-3 w-12 text-center">إجراء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {closingItems.map((cItem, index) => (
                        <tr key={index} className="hover:bg-slate-50/50">
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
                              className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
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
                              className="w-full p-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 text-center"
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
                              className="w-full p-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 text-center"
                            />
                          </td>
                          <td className="p-2 bg-slate-50/80 font-bold text-rose-600 text-center">
                            {cItem.allocated_cost.toLocaleString()} <span className="text-[10px] font-normal">{currencySymbol}</span>
                          </td>
                          <td className="p-2 bg-emerald-50/50 font-black text-emerald-700 text-center">
                            {cItem.final_unit_cost.toLocaleString()} <span className="text-[10px] font-normal">{currencySymbol}</span>
                          </td>
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                setClosingItems(prev => prev.filter((_, idx) => idx !== index));
                              }}
                              className="text-slate-400 hover:text-rose-500 hover:bg-rose-50 p-1.5 rounded transition"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-between items-center py-3">
                  <button
                    type="button"
                    onClick={calculateLandedCost}
                    className="bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 px-4 py-2 rounded-lg font-bold transition flex items-center gap-2 shadow-sm"
                  >
                    <Calculator size={16} /> احتساب وتوزيع التكاليف التلقائي
                  </button>

                  <div className="text-right bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-100">
                    <span className="font-bold text-slate-600 text-sm">إجمالي قيمة التوريد: </span>
                    <span className="font-black text-emerald-700 text-lg">
                      {closingItems.reduce((acc, curr) => acc + (Number(curr.qty) * Number(curr.final_unit_cost)), 0).toLocaleString()} <span className="text-xs">{currencySymbol}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Alert Warning */}
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start gap-3 text-amber-800 shadow-sm">
                <ShieldAlert size={20} className="mt-0.5 flex-shrink-0 text-amber-600" />
                <div>
                  <p className="font-black text-amber-900">تنبيه هام ومحاسبي</p>
                  <p className="text-xs mt-1 leading-relaxed">عند الضغط على إقفال الاعتماد، سيقوم النظام بتسوية وقيد إجمالي التكاليف المسجلة وتوريد الأصناف للمخازن بالقيم الجديدة. لن تتمكن من إضافة مصروفات رسملة جديدة على هذا الاعتماد بعد الإغلاق.</p>
                </div>
              </div>

              {/* Form buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCloseModal(false)}
                  className="px-5 py-2.5 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-md hover:shadow-lg transition flex items-center gap-2"
                >
                  <CheckCircle size={18} />
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
