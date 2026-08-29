import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { 
  Landmark, Plus, Edit, Trash2, Calendar, Search, Filter, 
  ArrowUpRight, RefreshCw, AlertTriangle, FileText, CheckCircle, Ban, 
  Percent, Coins, ClipboardList, HelpCircle
} from 'lucide-react';

export default function LettersOfGuaranteePage() {
  const { addEntry, currentUser, selectedFiscalYear, getSystemAccount, settings } = useAccounting();
  const { showToast } = useToast();
  
  const currencySymbol = settings?.currency || 'ج.م';

  const [lgs, setLgs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<any[]>([]);
  const [banks, setBanks] = useState<any[]>([]);
  const [allAccounts, setAllAccounts] = useState<any[]>([]);
  
  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingLgId, setEditingLgId] = useState<string | null>(null);
  
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showLiquidateModal, setShowLiquidateModal] = useState(false);
  const [selectedLg, setSelectedLg] = useState<any>(null);

  // Filter States
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Main Form Data
  const [formData, setFormData] = useState({
    lg_number: '',
    type: 'performance_bond',
    issuing_bank_id: '',
    margin_account_id: '',
    expense_account_id: '',
    project_id: '',
    beneficiary: '',
    amount: 0,
    margin_percentage: 10,
    margin_amount: 0,
    commission_amount: 0,
    issue_date: new Date().toISOString().split('T')[0],
    expiry_date: new Date(new Date().setMonth(new Date().getMonth() + 3)).toISOString().split('T')[0], // Default 3 months
    notes: '',
    auto_post_journal: true
  });

  // Action Sub-Forms Data
  const [extendData, setExtendData] = useState({
    new_expiry_date: '',
    additional_commission: 0,
    notes: '',
    auto_post_journal: true
  });

  const [returnData, setReturnData] = useState({
    return_date: new Date().toISOString().split('T')[0],
    target_bank_id: '', 
    notes: '',
    auto_post_journal: true
  });

  const [liquidateData, setLiquidateData] = useState({
    liquidation_date: new Date().toISOString().split('T')[0],
    expense_account_id: '', 
    notes: '',
    auto_post_journal: true
  });

  useEffect(() => {
    fetchData();
  }, [selectedFiscalYear]);

  // Auto-calculate margin amount when amount or percentage changes
  useEffect(() => {
    const calculated = (Number(formData.amount) * Number(formData.margin_percentage)) / 100;
    setFormData(prev => ({
      ...prev,
      margin_amount: parseFloat(calculated.toFixed(2))
    }));
  }, [formData.amount, formData.margin_percentage]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (currentUser?.role === 'demo') {
        // Demo Data
        setLgs([
          {
            id: 'demo-lg-1',
            lg_number: 'LG-2026-001',
            type: 'bid_bond',
            beneficiary: 'الهيئة العامة للإسكان',
            amount: 50000,
            margin_percentage: 10,
            margin_amount: 5000,
            commission_amount: 350,
            issue_date: '2026-08-01',
            expiry_date: '2026-11-01',
            status: 'active',
            notes: 'خطاب ضمان ابتدائي لمناقصة إنشاء مبنى الإدارة',
            issuing_bank_id: 'demo-b1',
            margin_account_id: 'demo-acc-margin',
            expense_account_id: 'demo-acc-exp',
            project_id: null,
            issuing_bank: { name: 'بنك الرياض' },
            margin_account: { name: 'حساب غطاء خطابات الضمان' },
            project: null
          },
          {
            id: 'demo-lg-2',
            lg_number: 'LG-2026-002',
            type: 'performance_bond',
            beneficiary: 'شركة إعمار العقارية',
            amount: 250000,
            margin_percentage: 15,
            margin_amount: 37500,
            commission_amount: 1200,
            issue_date: '2026-05-15',
            expiry_date: '2026-12-15',
            status: 'active',
            notes: 'خطاب ضمان نهائي لمشروع الفلل السكنية',
            issuing_bank_id: 'demo-b1',
            margin_account_id: 'demo-acc-margin',
            expense_account_id: 'demo-acc-exp',
            project_id: 'demo-p1',
            issuing_bank: { name: 'بنك الرياض' },
            margin_account: { name: 'حساب غطاء خطابات الضمان' },
            project: { name: 'مشروع الفلل السكنية - المرحلة الأولى' }
          }
        ]);
        setProjects([{ id: 'demo-p1', name: 'مشروع الفلل السكنية - المرحلة الأولى' }]);
        setBanks([{ id: 'demo-b1', name: 'بنك الرياض', code: '101021' }]);
        setAllAccounts([
          { id: 'demo-b1', name: 'بنك الرياض', code: '101021', type: 'asset' },
          { id: 'demo-acc-margin', name: 'حساب غطاء خطابات الضمان', code: '124801', type: 'asset' },
          { id: 'demo-acc-exp', name: 'مصاريف وعمولات بنكية', code: '3901', type: 'expense' }
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

      // Fetch LGs
      let query = supabase.from('letters_of_guarantee')
        .select(`
          *,
          project:projects(name),
          issuing_bank:accounts!letters_of_guarantee_issuing_bank_id_fkey(name, code),
          margin_account:accounts!letters_of_guarantee_margin_account_id_fkey(name, code)
        `)
        .eq('organization_id', userOrgId)
        .order('created_at', { ascending: false });

      if (selectedFiscalYear) {
        query = query.gte('issue_date', `${selectedFiscalYear}-01-01`).lte('issue_date', `${selectedFiscalYear}-12-31`);
      }

      const { data: lgsData, error: lgsError } = await query;
      if (lgsError) throw lgsError;
      setLgs(lgsData || []);

      // Fetch Projects
      const { data: projectsData } = await supabase.from('projects').select('id, name').eq('organization_id', userOrgId);
      setProjects(projectsData || []);

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

  const handleSaveLg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.lg_number || !formData.beneficiary || !formData.issuing_bank_id || !formData.margin_account_id) {
      showToast('يرجى ملء جميع الحقول المطلوبة', 'warning');
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id;

      if (!userOrgId && currentUser?.role !== 'demo') {
        throw new Error('لم يتم تحديد المؤسسة.');
      }

      const lgPayload = {
        lg_number: formData.lg_number,
        type: formData.type,
        issuing_bank_id: formData.issuing_bank_id,
        margin_account_id: formData.margin_account_id,
        expense_account_id: formData.expense_account_id || null,
        project_id: formData.project_id || null,
        beneficiary: formData.beneficiary,
        amount: Number(formData.amount),
        margin_percentage: Number(formData.margin_percentage),
        margin_amount: Number(formData.margin_amount),
        commission_amount: Number(formData.commission_amount),
        issue_date: formData.issue_date,
        expiry_date: formData.expiry_date,
        notes: formData.notes,
        status: 'active',
        organization_id: userOrgId
      };

      if (currentUser?.role === 'demo') {
        showToast('تم حفظ خطاب الضمان (نسخة تجريبية) ✅', 'success');
        setShowAddModal(false);
        return;
      }

      let resultLg;
      if (editingLgId) {
        const { data, error } = await supabase.from('letters_of_guarantee')
          .update(lgPayload)
          .eq('id', editingLgId)
          .select()
          .single();
        if (error) throw error;
        resultLg = data;
        showToast('تم تحديث خطاب الضمان بنجاح ✅', 'success');
      } else {
        const { data, error } = await supabase.from('letters_of_guarantee')
          .insert([lgPayload])
          .select()
          .single();
        if (error) throw error;
        resultLg = data;
        showToast('تم تسجيل خطاب الضمان بنجاح ✅', 'success');
      }

      // Generate Journal Entry
      if (formData.auto_post_journal && !editingLgId) {
        const journalLines: any[] = [];
        
        // 1. غطاء الضمان (مدين)
        if (Number(formData.margin_amount) > 0) {
          journalLines.push({
            accountId: formData.margin_account_id,
            debit: Number(formData.margin_amount),
            credit: 0,
            description: `غطاء خطاب ضمان رقم ${formData.lg_number} لصالح ${formData.beneficiary}`
          });
        }

        // 2. عمولة البنك (مدين)
        if (Number(formData.commission_amount) > 0 && formData.expense_account_id) {
          journalLines.push({
            accountId: formData.expense_account_id,
            debit: Number(formData.commission_amount),
            credit: 0,
            description: `عمولة ومصاريف إصدار خطاب ضمان رقم ${formData.lg_number}`
          });
        }

        // 3. البنك المصدر (دائن)
        const totalCredit = Number(formData.margin_amount) + Number(formData.commission_amount);
        if (totalCredit > 0) {
          journalLines.push({
            accountId: formData.issuing_bank_id,
            debit: 0,
            credit: totalCredit,
            description: `سداد غطاء ومصاريف خطاب ضمان رقم ${formData.lg_number}`
          });
        }

        if (journalLines.length > 0) {
          await addEntry({
            date: formData.issue_date,
            reference: `LG-${formData.lg_number}`,
            description: `إصدار خطاب ضمان بنكي رقم ${formData.lg_number} لصالح ${formData.beneficiary}`,
            lines: journalLines,
            status: 'posted'
          });
          showToast('تم ترحيل القيد المحاسبي لإصدار خطاب الضمان تلقائياً 📊', 'success');
        }
      }

      setShowAddModal(false);
      setEditingLgId(null);
      fetchData();
    } catch (err: any) {
      showToast('فشل حفظ خطاب الضمان: ' + err.message, 'error');
    }
  };

  const handleDeleteLg = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من رغبتك في حذف خطاب الضمان هذا؟ لن يؤثر هذا على القيود المحاسبية التي تم ترحيلها مسبقاً.')) return;
    try {
      if (currentUser?.role === 'demo') {
        setLgs(prev => prev.filter(lg => lg.id !== id));
        showToast('تم حذف خطاب الضمان (نسخة تجريبية) 🗑️', 'success');
        return;
      }

      const { error } = await supabase.from('letters_of_guarantee').delete().eq('id', id);
      if (error) throw error;
      showToast('تم حذف خطاب الضمان بنجاح 🗑️', 'success');
      fetchData();
    } catch (err: any) {
      showToast('فشل حذف خطاب الضمان: ' + err.message, 'error');
    }
  };

  // Extend LG Action
  const handleExtendLg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extendData.new_expiry_date) {
      showToast('يرجى تحديد تاريخ الانتهاء الجديد', 'warning');
      return;
    }

    try {
      if (currentUser?.role === 'demo') {
        showToast('تم تمديد خطاب الضمان بنجاح (نسخة تجريبية)', 'success');
        setShowExtendModal(false);
        return;
      }

      const newTotalCommission = Number(selectedLg.commission_amount) + Number(extendData.additional_commission);

      const { error } = await supabase.from('letters_of_guarantee')
        .update({
          expiry_date: extendData.new_expiry_date,
          status: 'extended',
          commission_amount: newTotalCommission,
          notes: selectedLg.notes + `\n[تمديد في ${new Date().toLocaleDateString('ar-EG')}: ${extendData.notes}]`
        })
        .eq('id', selectedLg.id);

      if (error) throw error;
      showToast('تم تمديد خطاب الضمان وتحديث تاريخ الصلاحية ✅', 'success');

      // Post commission entry if exists
      if (extendData.auto_post_journal && Number(extendData.additional_commission) > 0 && selectedLg.expense_account_id) {
        await addEntry({
          date: new Date().toISOString().split('T')[0],
          reference: `LG-EXT-${selectedLg.lg_number}`,
          description: `عمولة تمديد خطاب ضمان رقم ${selectedLg.lg_number}`,
          lines: [
            {
              accountId: selectedLg.expense_account_id,
              debit: Number(extendData.additional_commission),
              credit: 0,
              description: `عمولة إضافية لتمديد صلاحية خطاب الضمان رقم ${selectedLg.lg_number}`
            },
            {
              accountId: selectedLg.issuing_bank_id,
              debit: 0,
              credit: Number(extendData.additional_commission),
              description: `سداد عمولة تمديد خطاب ضمان رقم ${selectedLg.lg_number}`
            }
          ],
          status: 'posted'
        });
        showToast('تم ترحيل قيد عمولة التمديد تلقائياً 📊', 'success');
      }

      setShowExtendModal(false);
      fetchData();
    } catch (err: any) {
      showToast('فشل تمديد خطاب الضمان: ' + err.message, 'error');
    }
  };

  // Return LG Action
  const handleReturnLg = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (currentUser?.role === 'demo') {
        showToast('تم إلغاء واسترداد خطاب الضمان (نسخة تجريبية)', 'success');
        setShowReturnModal(false);
        return;
      }

      const { error } = await supabase.from('letters_of_guarantee')
        .update({
          status: 'returned',
          notes: selectedLg.notes + `\n[استرداد وإلغاء في ${returnData.return_date}: ${returnData.notes}]`
        })
        .eq('id', selectedLg.id);

      if (error) throw error;
      showToast('تم إنهاء واسترداد خطاب الضمان بنجاح 🔒', 'success');

      // Post release entry
      if (returnData.auto_post_journal && Number(selectedLg.margin_amount) > 0) {
        const refundBankId = returnData.target_bank_id || selectedLg.issuing_bank_id;
        await addEntry({
          date: returnData.return_date,
          reference: `LG-REF-${selectedLg.lg_number}`,
          description: `إلغاء واسترداد غطاء خطاب ضمان رقم ${selectedLg.lg_number}`,
          lines: [
            {
              accountId: refundBankId,
              debit: Number(selectedLg.margin_amount),
              credit: 0,
              description: `استرداد قيمة غطاء خطاب الضمان رقم ${selectedLg.lg_number} الملغي`
            },
            {
              accountId: selectedLg.margin_account_id,
              debit: 0,
              credit: Number(selectedLg.margin_amount),
              description: `إقفال حساب غطاء خطاب الضمان رقم ${selectedLg.lg_number}`
            }
          ],
          status: 'posted'
        });
        showToast('تم ترحيل قيد استرداد غطاء خطاب الضمان تلقائياً 📊', 'success');
      }

      setShowReturnModal(false);
      fetchData();
    } catch (err: any) {
      showToast('فشل استرداد خطاب الضمان: ' + err.message, 'error');
    }
  };

  // Liquidate LG Action
  const handleLiquidateLg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!liquidateData.expense_account_id) {
      showToast('يرجى تحديد حساب خسائر تسييل خطابات الضمان', 'warning');
      return;
    }

    try {
      if (currentUser?.role === 'demo') {
        showToast('تم تسييل ومصادرة خطاب الضمان (نسخة تجريبية)', 'success');
        setShowLiquidateModal(false);
        return;
      }

      const { error } = await supabase.from('letters_of_guarantee')
        .update({
          status: 'liquidated',
          notes: selectedLg.notes + `\n[تسييل ومصادرة في ${liquidateData.liquidation_date}: ${liquidateData.notes}]`
        })
        .eq('id', selectedLg.id);

      if (error) throw error;
      showToast('تم إثبات تسييل ومصادرة خطاب الضمان 🚨', 'success');

      // Post liquidation entry
      if (liquidateData.auto_post_journal) {
        const totalAmount = Number(selectedLg.amount);
        const marginAmount = Number(selectedLg.margin_amount);
        const remainingDeducted = totalAmount - marginAmount;

        const journalLines: any[] = [
          {
            accountId: liquidateData.expense_account_id,
            debit: totalAmount,
            credit: 0,
            description: `خسائر ومصروفات ناتجة عن تسييل خطاب ضمان رقم ${selectedLg.lg_number} لصالح ${selectedLg.beneficiary}`
          },
          {
            accountId: selectedLg.margin_account_id,
            debit: 0,
            credit: marginAmount,
            description: `إقفال وتسوية غطاء خطاب الضمان رقم ${selectedLg.lg_number} المفقود`
          }
        ];

        if (remainingDeducted > 0) {
          journalLines.push({
            accountId: selectedLg.issuing_bank_id,
            debit: 0,
            credit: remainingDeducted,
            description: `خصم البنك المتبقي من قيمة خطاب ضمان رقم ${selectedLg.lg_number} المسيل`
          });
        }

        await addEntry({
          date: liquidateData.liquidation_date,
          reference: `LG-LIQ-${selectedLg.lg_number}`,
          description: `تسييل ومصادرة خطاب ضمان رقم ${selectedLg.lg_number} لصالح ${selectedLg.beneficiary}`,
          lines: journalLines,
          status: 'posted'
        });
        showToast('تم ترحيل قيد التسييل وتحميل الخسائر آلياً 📊', 'success');
      }

      setShowLiquidateModal(false);
      fetchData();
    } catch (err: any) {
      showToast('فشل تسييل خطاب الضمان: ' + err.message, 'error');
    }
  };

  // Helper functions
  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return 'نشط';
      case 'extended': return 'ممدد';
      case 'returned': return 'مسترد/ملغي';
      case 'liquidated': return 'مسيل/مصادَر';
      default: return status;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full text-xs font-bold border border-emerald-100 flex items-center gap-1 w-fit"><CheckCircle size={12} /> نشط</span>;
      case 'extended':
        return <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full text-xs font-bold border border-blue-100 flex items-center gap-1 w-fit"><RefreshCw size={12} /> ممدد</span>;
      case 'returned':
        return <span className="bg-slate-50 text-slate-600 px-2.5 py-1 rounded-full text-xs font-bold border border-slate-100 flex items-center gap-1 w-fit"><Ban size={12} /> مسترد/ملغي</span>;
      case 'liquidated':
        return <span className="bg-rose-50 text-rose-700 px-2.5 py-1 rounded-full text-xs font-bold border border-rose-100 flex items-center gap-1 w-fit"><AlertTriangle size={12} /> مسيل/مصادَر</span>;
      default:
        return <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs">{status}</span>;
    }
  };

  const getTypeText = (type: string) => {
    switch (type) {
      case 'bid_bond': return 'ابتدائي (Bid Bond)';
      case 'performance_bond': return 'نهائي (Performance)';
      case 'advance_payment': return 'دفعة مقدمة (Advance)';
      case 'other': return 'آخر';
      default: return type;
    }
  };

  // Filter logic
  const filteredLgs = lgs.filter(lg => {
    const matchesStatus = statusFilter === 'all' || lg.status === statusFilter;
    const matchesType = typeFilter === 'all' || lg.type === typeFilter;
    const matchesSearch = 
      lg.lg_number.toLowerCase().includes(searchTerm.toLowerCase()) || 
      lg.beneficiary.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (lg.project?.name && lg.project.name.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesStatus && matchesType && matchesSearch;
  });

  // Calculate statistics
  const activeLgs = lgs.filter(lg => lg.status === 'active' || lg.status === 'extended');
  const totalAmount = activeLgs.reduce((acc, curr) => acc + Number(curr.amount), 0);
  const totalMargin = activeLgs.reduce((acc, curr) => acc + Number(curr.margin_amount), 0);
  
  const soonToExpireCount = activeLgs.filter(lg => {
    const daysLeft = Math.ceil((new Date(lg.expiry_date).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
    return daysLeft >= 0 && daysLeft <= 15;
  }).length;

  return (
    <div className="p-6 space-y-6 text-slate-800" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Landmark className="text-amber-500" size={28} />
            إدارة خطابات الضمان البنكية (Letters of Guarantee)
          </h1>
          <p className="text-slate-500 text-sm mt-1">تتبع خطابات الضمان الصادرة، الأغطية النقدية والعمولات، والتسويات والقيود المحاسبية التلقائية.</p>
        </div>
        <button 
          onClick={() => {
            const defaultMarginAccId = getSystemAccount('LETTER_OF_GUARANTEE_MARGIN')?.id || allAccounts.find(a => a.code === '1248' || a.name?.includes('غطاء خطابات'))?.id || '';
            const defaultExpenseAccId = allAccounts.find(a => a.code === '534' || a.code?.startsWith('534') || a.name?.includes('مصروفات بنكية') || a.name?.includes('عمولة'))?.id || '';
            
            setEditingLgId(null);
            setFormData({
              lg_number: '',
              type: 'performance_bond',
              issuing_bank_id: '',
              margin_account_id: defaultMarginAccId,
              expense_account_id: defaultExpenseAccId,
              project_id: '',
              beneficiary: '',
              amount: 0,
              margin_percentage: 10,
              margin_amount: 0,
              commission_amount: 0,
              issue_date: new Date().toISOString().split('T')[0],
              expiry_date: new Date(new Date().setMonth(new Date().getMonth() + 3)).toISOString().split('T')[0],
              notes: '',
              auto_post_journal: true
            });
            setShowAddModal(true);
          }}
          className="bg-indigo-600 text-white px-4 py-2.5 rounded-lg flex items-center gap-2 font-bold hover:bg-indigo-700 transition shadow-sm"
        >
          <Plus size={18} /> إصدار خطاب ضمان جديد
        </button>
      </div>

      {/* Stats Board */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-slate-500">إجمالي الضمانات النشطة</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{totalAmount.toLocaleString()} <span className="text-xs font-semibold text-slate-400">{currencySymbol}</span></p>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
            <Landmark size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-slate-500">إجمالي غطاء الضمان المحجوز</p>
            <p className="text-2xl font-black text-emerald-700 mt-1">{totalMargin.toLocaleString()} <span className="text-xs font-semibold text-slate-400">{currencySymbol}</span></p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
            <Coins size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-slate-500">عدد الخطابات النشطة</p>
            <p className="text-2xl font-black text-indigo-900 mt-1">{activeLgs.length} <span className="text-xs font-semibold text-slate-400">خطاب</span></p>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
            <ClipboardList size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-slate-500">خطابات تنتهي قريباً (≤١٥ يوم)</p>
            <p className={`text-2xl font-black mt-1 ${soonToExpireCount > 0 ? 'text-rose-600' : 'text-slate-900'}`}>{soonToExpireCount} <span className="text-xs font-semibold text-slate-400">خطاب</span></p>
          </div>
          <div className={`p-3 rounded-lg ${soonToExpireCount > 0 ? 'bg-rose-50 text-rose-600 animate-pulse' : 'bg-slate-50 text-slate-600'}`}>
            <AlertTriangle size={24} />
          </div>
        </div>
      </div>

      {/* Filters bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <span className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
            <Search size={16} />
          </span>
          <input
            type="text"
            placeholder="البحث برقم الخطاب أو المستفيد..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pr-10 pl-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Dropdowns */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 w-full sm:w-auto">
            <Filter size={14} className="text-slate-500" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-sm font-bold text-slate-700 outline-none w-full cursor-pointer"
            >
              <option value="all">كل الحالات</option>
              <option value="active">نشط</option>
              <option value="extended">ممدد</option>
              <option value="returned">مسترد/ملغي</option>
              <option value="liquidated">مسيل/مصادر</option>
            </select>
          </div>

          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 w-full sm:w-auto">
            <Filter size={14} className="text-slate-500" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-transparent text-sm font-bold text-slate-700 outline-none w-full cursor-pointer"
            >
              <option value="all">كل الأنواع</option>
              <option value="bid_bond">ابتدائي (Bid Bond)</option>
              <option value="performance_bond">نهائي (Performance)</option>
              <option value="advance_payment">دفعة مقدمة (Advance)</option>
              <option value="other">أخرى</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-2">
            <RefreshCw className="animate-spin text-indigo-600" size={28} />
            <p className="font-bold">جاري تحميل بيانات خطابات الضمان...</p>
          </div>
        ) : filteredLgs.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <HelpCircle className="mx-auto mb-2 text-slate-300" size={32} />
            <p className="font-bold">لا توجد خطابات ضمان مطابقة للبحث حالياً.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 text-sm font-bold">
                <tr>
                  <th className="p-4">رقم الخطاب</th>
                  <th className="p-4">النوع</th>
                  <th className="p-4">المستفيد</th>
                  <th className="p-4">المبلغ</th>
                  <th className="p-4">الغطاء النقدي</th>
                  <th className="p-4">البنك المصدر</th>
                  <th className="p-4">المشروع</th>
                  <th className="p-4">تاريخ الانتهاء</th>
                  <th className="p-4">الحالة</th>
                  <th className="p-4 text-center">إجراءات ودورات العمل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredLgs.map(lg => {
                  const daysLeft = Math.ceil((new Date(lg.expiry_date).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
                  const isExpiring = (lg.status === 'active' || lg.status === 'extended') && daysLeft >= 0 && daysLeft <= 15;
                  
                  return (
                    <tr key={lg.id} className={`hover:bg-slate-50 ${isExpiring ? 'bg-rose-50/30' : ''}`}>
                      <td className="p-4 font-mono font-bold text-indigo-600">{lg.lg_number}</td>
                      <td className="p-4 font-semibold">{getTypeText(lg.type)}</td>
                      <td className="p-4 font-medium text-slate-700">{lg.beneficiary}</td>
                      <td className="p-4 font-black">{lg.amount.toLocaleString()} {currencySymbol}</td>
                      <td className="p-4 font-semibold text-emerald-700">
                        {lg.margin_amount.toLocaleString()} {currencySymbol} ({lg.margin_percentage}%)
                      </td>
                      <td className="p-4 text-slate-600">{lg.issuing_bank?.name || 'غير محدد'}</td>
                      <td className="p-4 text-slate-600">{lg.project?.name || '-'}</td>
                      <td className="p-4">
                        <div className="flex flex-col">
                          <span>{lg.expiry_date}</span>
                          {isExpiring && (
                            <span className="text-[10px] text-rose-600 font-bold mt-0.5 flex items-center gap-0.5">
                              (ينتهي خلال {daysLeft} أيام!)
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-4">{getStatusBadge(lg.status)}</td>
                      <td className="p-4">
                        <div className="flex justify-center items-center gap-2">
                          {(lg.status === 'active' || lg.status === 'extended') && (
                            <>
                              <button 
                                onClick={() => {
                                  setSelectedLg(lg);
                                  setExtendData({
                                    new_expiry_date: lg.expiry_date,
                                    additional_commission: 0,
                                    notes: '',
                                    auto_post_journal: true
                                  });
                                  setShowExtendModal(true);
                                }}
                                className="bg-blue-50 text-blue-600 hover:bg-blue-100 px-2 py-1 rounded text-xs font-bold border border-blue-200 flex items-center gap-1 transition"
                                title="تمديد صلاحية خطاب الضمان"
                              >
                                <RefreshCw size={12} /> تمديد
                              </button>
                              <button 
                                onClick={() => {
                                  setSelectedLg(lg);
                                  setReturnData({
                                    return_date: new Date().toISOString().split('T')[0],
                                    target_bank_id: lg.issuing_bank_id,
                                    notes: '',
                                    auto_post_journal: true
                                  });
                                  setShowReturnModal(true);
                                }}
                                className="bg-slate-50 text-slate-700 hover:bg-slate-100 px-2 py-1 rounded text-xs font-bold border border-slate-200 flex items-center gap-1 transition"
                                title="استرداد وإلغاء خطاب الضمان"
                              >
                                <Ban size={12} /> استرداد
                              </button>
                              <button 
                                onClick={() => {
                                  setSelectedLg(lg);
                                  setLiquidateData({
                                    liquidation_date: new Date().toISOString().split('T')[0],
                                    expense_account_id: lg.expense_account_id || '',
                                    notes: '',
                                    auto_post_journal: true
                                  });
                                  setShowLiquidateModal(true);
                                }}
                                className="bg-rose-50 text-rose-600 hover:bg-rose-100 px-2 py-1 rounded text-xs font-bold border border-rose-200 flex items-center gap-1 transition"
                                title="تسييل خطاب الضمان"
                              >
                                <AlertTriangle size={12} /> تسييل
                              </button>
                            </>
                          )}

                          <button
                            onClick={() => {
                              setEditingLgId(lg.id);
                              setFormData({
                                lg_number: lg.lg_number,
                                type: lg.type,
                                issuing_bank_id: lg.issuing_bank_id,
                                margin_account_id: lg.margin_account_id,
                                expense_account_id: lg.expense_account_id || '',
                                project_id: lg.project_id || '',
                                beneficiary: lg.beneficiary,
                                amount: lg.amount,
                                margin_percentage: lg.margin_percentage,
                                margin_amount: lg.margin_amount,
                                commission_amount: lg.commission_amount,
                                issue_date: lg.issue_date,
                                expiry_date: lg.expiry_date,
                                notes: lg.notes || '',
                                auto_post_journal: false
                              });
                              setShowAddModal(true);
                            }}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded transition"
                            title="تعديل تفاصيل خطاب الضمان"
                          >
                            <Edit size={14} />
                          </button>
                          
                          <button
                            onClick={() => handleDeleteLg(lg.id)}
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded transition"
                            title="حذف خطاب الضمان"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: Add / Edit LG */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl overflow-hidden border border-slate-200">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-black text-slate-800 text-lg flex items-center gap-2">
                <Landmark size={20} className="text-indigo-600" />
                {editingLgId ? 'تعديل بيانات خطاب الضمان' : 'إصدار وتسجيل خطاب ضمان بنكي جديد'}
              </h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 transition text-xl font-bold"
              >
                &times;
              </button>
            </div>
            
            <form onSubmit={handleSaveLg} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* LG Number */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">رقم خطاب الضمان *</label>
                  <input
                    type="text"
                    required
                    value={formData.lg_number}
                    onChange={(e) => setFormData(prev => ({ ...prev, lg_number: e.target.value }))}
                    placeholder="مثال: LG-2026-8940"
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                {/* LG Type */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">نوع خطاب الضمان *</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value }))}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="bid_bond">ابتدائي (Bid Bond)</option>
                    <option value="performance_bond">نهائي (Performance Bond)</option>
                    <option value="advance_payment">كفالة دفعة مقدمة (Advance Payment)</option>
                    <option value="other">أخرى</option>
                  </select>
                </div>

                {/* Beneficiary */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">الجهة المستفيدة (المالك/العميل) *</label>
                  <input
                    type="text"
                    required
                    value={formData.beneficiary}
                    onChange={(e) => setFormData(prev => ({ ...prev, beneficiary: e.target.value }))}
                    placeholder="الوزارة، الهيئة، أو اسم العميل"
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                {/* Project */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">المشروع المرتبط</label>
                  <select
                    value={formData.project_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, project_id: e.target.value }))}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="">لا يوجد مشروع مرتبط</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                {/* Issuing Bank Account */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">البنك الجاري المصدر (دائن بالخصم) *</label>
                  <select
                    required
                    value={formData.issuing_bank_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, issuing_bank_id: e.target.value }))}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="">اختر حساب البنك المصدر</option>
                    {banks.map(b => (
                      <option key={b.id} value={b.id}>({b.code}) - {b.name}</option>
                    ))}
                  </select>
                </div>

                {/* Margin Asset Account */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">حساب غطاء خطاب الضمان (مدين بالغطاء) *</label>
                  <select
                    required
                    value={formData.margin_account_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, margin_account_id: e.target.value }))}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="">اختر حساب غطاء خطابات الضمان</option>
                    {allAccounts.filter(a => a.type === 'asset').map(a => (
                      <option key={a.id} value={a.id}>({a.code}) - {a.name}</option>
                    ))}
                  </select>
                </div>

                {/* Bank Expense Account */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">حساب مصروفات وعمولات البنك</label>
                  <select
                    value={formData.expense_account_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, expense_account_id: e.target.value }))}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="">اختر حساب عمولة البنك</option>
                    {allAccounts.filter(a => a.type === 'expense').map(a => (
                      <option key={a.id} value={a.id}>({a.code}) - {a.name}</option>
                    ))}
                  </select>
                </div>

                {/* Total LG Amount */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">القيمة الإجمالية للخطاب *</label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      min="0"
                      step="any"
                      value={formData.amount || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, amount: Number(e.target.value) }))}
                      placeholder="0.00"
                      className="w-full p-2 pl-12 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs font-bold text-slate-400 pointer-events-none">{currencySymbol}</span>
                  </div>
                </div>

                {/* Margin Percentage & Calculated Margin Amount */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-bold text-slate-500">نسبة الغطاء النقدي %</label>
                    <label className="block text-xs font-bold text-slate-500">قيمة الغطاء النقدي</label>
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
                        min="0"
                        step="any"
                        value={formData.margin_amount}
                        onChange={(e) => setFormData(prev => ({ ...prev, margin_amount: Number(e.target.value) }))}
                        className="w-full p-2 pl-12 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none"
                      />
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs font-bold text-slate-400 pointer-events-none">{currencySymbol}</span>
                    </div>
                  </div>
                </div>

                {/* Issuance Commissions */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">عمولة ومصاريف البنك</label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={formData.commission_amount || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, commission_amount: Number(e.target.value) }))}
                      placeholder="0.00"
                      className="w-full p-2 pl-12 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs font-bold text-slate-400 pointer-events-none">{currencySymbol}</span>
                  </div>
                </div>

                {/* Dates */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">تاريخ الإصدار *</label>
                  <input
                    type="date"
                    required
                    value={formData.issue_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, issue_date: e.target.value }))}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">تاريخ انتهاء الصلاحية *</label>
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
                <label className="block text-xs font-bold text-slate-500 mb-1">ملاحظات وشروط الخطاب</label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="ملاحظات وشروط إضافية لخطاب الضمان..."
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Accounting integration toggle */}
              {!editingLgId && (
                <div className="bg-indigo-50/50 p-3 rounded-lg border border-indigo-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 bg-indigo-100 text-indigo-700 rounded">
                      <FileText size={16} />
                    </span>
                    <div>
                      <p className="text-xs font-bold text-indigo-950">توليد قيد يومية آلي</p>
                      <p className="text-[10px] text-indigo-600">سيتم إصدار القيد المحاسبي لغطاء الضمان وعمولات البنك تلقائياً فور الحفظ.</p>
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

              {/* Form buttons */}
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

      {/* ACTION MODAL: Extend LG */}
      {showExtendModal && selectedLg && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
                <RefreshCw size={16} className="text-blue-600" />
                تمديد صلاحية خطاب الضمان
              </h3>
              <button onClick={() => setShowExtendModal(false)} className="text-slate-400 hover:text-slate-600 text-xl font-bold">&times;</button>
            </div>
            
            <form onSubmit={handleExtendLg} className="p-6 space-y-4">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-1">
                <p><strong>رقم الخطاب:</strong> {selectedLg.lg_number}</p>
                <p><strong>المستفيد:</strong> {selectedLg.beneficiary}</p>
                <p><strong>تاريخ الانتهاء الحالي:</strong> {selectedLg.expiry_date}</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">تاريخ الانتهاء الجديد *</label>
                <input
                  type="date"
                  required
                  value={extendData.new_expiry_date}
                  onChange={(e) => setExtendData(prev => ({ ...prev, new_expiry_date: e.target.value }))}
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">عمولة تمديد البنك الإضافية</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={extendData.additional_commission || ''}
                    onChange={(e) => setExtendData(prev => ({ ...prev, additional_commission: Number(e.target.value) }))}
                    placeholder="0.00"
                    className="w-full p-2 pl-12 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs font-bold text-slate-400 pointer-events-none">{currencySymbol}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">ملاحظات التمديد</label>
                <textarea
                  rows={2}
                  value={extendData.notes}
                  onChange={(e) => setExtendData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="سبب التمديد أو مراجعته من البنك..."
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-blue-950">ترحيل قيد عمولة التمديد</p>
                  <p className="text-[9px] text-blue-600">سيتم ترحيل القيد إذا كانت قيمة عمولة التمديد أكبر من صفر.</p>
                </div>
                <input
                  type="checkbox"
                  checked={extendData.auto_post_journal}
                  onChange={(e) => setExtendData(prev => ({ ...prev, auto_post_journal: e.target.checked }))}
                  className="h-4 w-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowExtendModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 font-bold rounded-lg text-sm hover:bg-slate-50 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg text-sm hover:bg-blue-700 transition"
                >
                  تحديث وتمديد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ACTION MODAL: Return LG */}
      {showReturnModal && selectedLg && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
                <Ban size={16} className="text-slate-600" />
                استرداد وإلغاء خطاب الضمان
              </h3>
              <button onClick={() => setShowReturnModal(false)} className="text-slate-400 hover:text-slate-600 text-xl font-bold">&times;</button>
            </div>
            
            <form onSubmit={handleReturnLg} className="p-6 space-y-4">
              <div className="bg-emerald-50/50 p-3 rounded-lg border border-emerald-100 text-xs space-y-1">
                <p><strong>رقم الخطاب:</strong> {selectedLg.lg_number}</p>
                <p><strong>المستفيد:</strong> {selectedLg.beneficiary}</p>
                <p><strong>قيمة الغطاء المسترد:</strong> <span className="font-bold text-emerald-700">{selectedLg.margin_amount.toLocaleString()} {currencySymbol}</span></p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">تاريخ الاسترداد والإلغاء *</label>
                <input
                  type="date"
                  required
                  value={returnData.return_date}
                  onChange={(e) => setReturnData(prev => ({ ...prev, return_date: e.target.value }))}
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">إيداع الغطاء النقدي في حساب *</label>
                <select
                  required
                  value={returnData.target_bank_id}
                  onChange={(e) => setReturnData(prev => ({ ...prev, target_bank_id: e.target.value }))}
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                >
                  {banks.map(b => (
                    <option key={b.id} value={b.id}>({b.code}) - {b.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">ملاحظات الاسترداد</label>
                <textarea
                  rows={2}
                  value={returnData.notes}
                  onChange={(e) => setReturnData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="ملاحظات حول إغلاق خطاب الضمان بالبنك واستلام الأصل..."
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-950">ترحيل قيد استرداد الغطاء</p>
                  <p className="text-[9px] text-slate-600">سيقوم النظام بإرجاع المبلغ المالي لحساب البنك المحدد وإقفال أصل الغطاء.</p>
                </div>
                <input
                  type="checkbox"
                  checked={returnData.auto_post_journal}
                  onChange={(e) => setReturnData(prev => ({ ...prev, auto_post_journal: e.target.checked }))}
                  className="h-4 w-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowReturnModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 font-bold rounded-lg text-sm hover:bg-slate-50 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-slate-600 text-white font-bold rounded-lg text-sm hover:bg-slate-700 transition"
                >
                  تأكيد واسترداد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ACTION MODAL: Liquidate LG */}
      {showLiquidateModal && selectedLg && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="bg-rose-50 px-6 py-4 border-b border-rose-200 flex justify-between items-center">
              <h3 className="font-black text-rose-800 text-base flex items-center gap-2">
                <AlertTriangle size={16} className="text-rose-600" />
                تسييل ومصادرة خطاب الضمان
              </h3>
              <button onClick={() => setShowLiquidateModal(false)} className="text-rose-400 hover:text-slate-600 text-xl font-bold">&times;</button>
            </div>
            
            <form onSubmit={handleLiquidateLg} className="p-6 space-y-4">
              <div className="bg-rose-50/30 p-3 rounded-lg border border-rose-100 text-xs space-y-1">
                <p><strong>رقم الخطاب:</strong> {selectedLg.lg_number}</p>
                <p><strong>المستفيد المصادر:</strong> {selectedLg.beneficiary}</p>
                <p><strong>إجمالي القيمة المسيلة:</strong> <span className="font-bold text-rose-700">{selectedLg.amount.toLocaleString()} {currencySymbol}</span></p>
                <p className="text-[10px] text-rose-500">سيخصم البنك قيمة غطاء الضمان الحالية ({selectedLg.margin_amount.toLocaleString()}) ويخصم المتبقي ({ (selectedLg.amount - selectedLg.margin_amount).toLocaleString() }) من حسابكم الجاري.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">تاريخ التسييل بالبنك *</label>
                <input
                  type="date"
                  required
                  value={liquidateData.liquidation_date}
                  onChange={(e) => setLiquidateData(prev => ({ ...prev, liquidation_date: e.target.value }))}
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">تحميل خسائر التسييل على حساب *</label>
                <select
                  required
                  value={liquidateData.expense_account_id}
                  onChange={(e) => setLiquidateData(prev => ({ ...prev, expense_account_id: e.target.value }))}
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="">اختر حساب الخسائر / التكاليف</option>
                  {allAccounts.filter(a => a.type === 'expense').map(a => (
                    <option key={a.id} value={a.id}>({a.code}) - {a.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">ملاحظات التسييل والمطالبة</label>
                <textarea
                  rows={2}
                  value={liquidateData.notes}
                  onChange={(e) => setLiquidateData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="ملاحظات حول أسباب مطالبة التسييل والإخفاق..."
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="bg-rose-50/50 p-3 rounded-lg border border-rose-100 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-rose-950">ترحيل قيد خسائر التسييل</p>
                  <p className="text-[9px] text-rose-600">سيقوم النظام بتحميل إجمالي المبلغ كخسارة وإقفال الغطاء والخصم من البنك المصدر.</p>
                </div>
                <input
                  type="checkbox"
                  checked={liquidateData.auto_post_journal}
                  onChange={(e) => setLiquidateData(prev => ({ ...prev, auto_post_journal: e.target.checked }))}
                  className="h-4 w-4 text-rose-600 border-slate-300 rounded focus:ring-rose-500 cursor-pointer"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLiquidateModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 font-bold rounded-lg text-sm hover:bg-slate-50 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-rose-600 text-white font-bold rounded-lg text-sm hover:bg-rose-700 transition"
                >
                  تأكيد وتسييل الخطاب
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
