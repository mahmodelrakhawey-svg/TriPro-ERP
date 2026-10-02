import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { 
  Landmark, Plus, Edit, Trash2, Calendar, Search, Filter, 
  ArrowUpRight, RefreshCw, AlertTriangle, FileText, CheckCircle, Ban, 
  Percent, Coins, ClipboardList, HelpCircle,
  Shield, TrendingUp, Activity, Printer, History, Building2, X
} from 'lucide-react';

export default function LettersOfGuaranteePage() {
  const { addEntry, currentUser, selectedFiscalYear, getSystemAccount, settings } = useAccounting();
  const { showToast } = useToast();
  
  const currencySymbol = settings?.currency || 'Ø¬.Ù…';

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
  
  // Detail Panel State
  const [selectedLgDetail, setSelectedLgDetail] = useState<any>(null);

  // Filter States
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [bankFilter, setBankFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

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
        const demoLgs = [
          {
            id: 'demo-lg-1',
            lg_number: 'LG-2026-001',
            type: 'bid_bond',
            beneficiary: 'Ø§Ù„Ù‡ÙŠØ¦Ø© Ø§Ù„Ø¹Ø§Ù…Ø© Ù„Ù„Ø¥Ø³ÙƒØ§Ù†',
            amount: 50000,
            margin_percentage: 10,
            margin_amount: 5000,
            commission_amount: 350,
            issue_date: '2026-08-01',
            expiry_date: '2026-11-01',
            status: 'active',
            notes: 'Ø®Ø·Ø§Ø¨ Ø¶Ù…Ø§Ù† Ø§Ø¨ØªØ¯Ø§Ø¦ÙŠ Ù„Ù…Ù†Ø§Ù‚ØµØ© Ø¥Ù†Ø´Ø§Ø¡ Ù…Ø¨Ù†Ù‰ Ø§Ù„Ø¥Ø¯Ø§Ø±Ø©',
            issuing_bank_id: 'demo-b1',
            margin_account_id: 'demo-acc-margin',
            expense_account_id: 'demo-acc-exp',
            project_id: null,
            issuing_bank: { name: 'Ø¨Ù†Ùƒ Ø§Ù„Ø±ÙŠØ§Ø¶' },
            margin_account: { name: 'Ø­Ø³Ø§Ø¨ ØºØ·Ø§Ø¡ Ø®Ø·Ø§Ø¨Ø§Øª Ø§Ù„Ø¶Ù…Ø§Ù†' },
            project: null
          },
          {
            id: 'demo-lg-2',
            lg_number: 'LG-2026-002',
            type: 'performance_bond',
            beneficiary: 'Ø´Ø±ÙƒØ© Ø¥Ø¹Ù…Ø§Ø± Ø§Ù„Ø¹Ù‚Ø§Ø±ÙŠØ©',
            amount: 250000,
            margin_percentage: 15,
            margin_amount: 37500,
            commission_amount: 1200,
            issue_date: '2026-05-15',
            expiry_date: '2026-12-15',
            status: 'active',
            notes: 'Ø®Ø·Ø§Ø¨ Ø¶Ù…Ø§Ù† Ù†Ù‡Ø§Ø¦ÙŠ Ù„Ù…Ø´Ø±ÙˆØ¹ Ø§Ù„ÙÙ„Ù„ Ø§Ù„Ø³ÙƒÙ†ÙŠØ©',
            issuing_bank_id: 'demo-b1',
            margin_account_id: 'demo-acc-margin',
            expense_account_id: 'demo-acc-exp',
            project_id: 'demo-p1',
            issuing_bank: { name: 'Ø¨Ù†Ùƒ Ø§Ù„Ø±ÙŠØ§Ø¶' },
            margin_account: { name: 'Ø­Ø³Ø§Ø¨ ØºØ·Ø§Ø¡ Ø®Ø·Ø§Ø¨Ø§Øª Ø§Ù„Ø¶Ù…Ø§Ù†' },
            project: { name: 'Ù…Ø´Ø±ÙˆØ¹ Ø§Ù„ÙÙ„Ù„ Ø§Ù„Ø³ÙƒÙ†ÙŠØ© - Ø§Ù„Ù…Ø±Ø­Ù„Ø© Ø§Ù„Ø£ÙˆÙ„Ù‰' }
          }
        ];
        setLgs(demoLgs);
        setProjects([{ id: 'demo-p1', name: 'Ù…Ø´Ø±ÙˆØ¹ Ø§Ù„ÙÙ„Ù„ Ø§Ù„Ø³ÙƒÙ†ÙŠØ© - Ø§Ù„Ù…Ø±Ø­Ù„Ø© Ø§Ù„Ø£ÙˆÙ„Ù‰' }]);
        setBanks([{ id: 'demo-b1', name: 'Ø¨Ù†Ùƒ Ø§Ù„Ø±ÙŠØ§Ø¶', code: '101021' }]);
        setAllAccounts([
          { id: 'demo-b1', name: 'Ø¨Ù†Ùƒ Ø§Ù„Ø±ÙŠØ§Ø¶', code: '101021', type: 'asset' },
          { id: 'demo-acc-margin', name: 'Ø­Ø³Ø§Ø¨ ØºØ·Ø§Ø¡ Ø®Ø·Ø§Ø¨Ø§Øª Ø§Ù„Ø¶Ù…Ø§Ù†', code: '124801', type: 'asset' },
          { id: 'demo-acc-exp', name: 'Ù…ØµØ§Ø±ÙŠÙ ÙˆØ¹Ù…ÙˆÙ„Ø§Øª Ø¨Ù†ÙƒÙŠØ©', code: '3901', type: 'expense' }
        ]);
        
        // Update selected detailing if one is selected
        if (selectedLgDetail) {
           const updated = demoLgs.find(l => l.id === selectedLgDetail.id);
           setSelectedLgDetail(updated || null);
        }

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
      
      if (selectedLgDetail && lgsData) {
        const updated = lgsData.find((l: Record<string, any>) => l.id === selectedLgDetail.id);
        setSelectedLgDetail(updated || null);
      }

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
          a.name?.includes('Ø¨Ù†Ùƒ') || 
          a.name?.toLowerCase().includes('bank')
        );
        setBanks(bankAccounts.length > 0 ? bankAccounts : accountsData);
      }

    } catch (err) {
      showToast('Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ Ø¬Ù„Ø¨ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveLg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.lg_number || !formData.beneficiary || !formData.issuing_bank_id || !formData.margin_account_id) {
      showToast('ÙŠØ±Ø¬Ù‰ Ù…Ù„Ø¡ Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø­Ù‚ÙˆÙ„ Ø§Ù„Ù…Ø·Ù„ÙˆØ¨Ø©', 'warning');
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id;

      if (!userOrgId && currentUser?.role !== 'demo') {
        throw new Error('Ù„Ù… ÙŠØªÙ… ØªØ­Ø¯ÙŠØ¯ Ø§Ù„Ù…Ø¤Ø³Ø³Ø©.');
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
        showToast('ØªÙ… Ø­ÙØ¸ Ø®Ø·Ø§Ø¨ Ø§Ù„Ø¶Ù…Ø§Ù† (Ù†Ø³Ø®Ø© ØªØ¬Ø±ÙŠØ¨ÙŠØ©) âœ…', 'success');
        setShowAddModal(false);
        fetchData();
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
        showToast('ØªÙ… ØªØ­Ø¯ÙŠØ« Ø®Ø·Ø§Ø¨ Ø§Ù„Ø¶Ù…Ø§Ù† Ø¨Ù†Ø¬Ø§Ø­ âœ…', 'success');
      } else {
        const { data, error } = await supabase.from('letters_of_guarantee')
          .insert([lgPayload])
          .select()
          .single();
        if (error) throw error;
        resultLg = data;
        showToast('ØªÙ… ØªØ³Ø¬ÙŠÙ„ Ø®Ø·Ø§Ø¨ Ø§Ù„Ø¶Ù…Ø§Ù† Ø¨Ù†Ø¬Ø§Ø­ âœ…', 'success');
      }

      // Generate Journal Entry
      if (formData.auto_post_journal && !editingLgId) {
        const journalLines: any[] = [];
        
        // 1. ØºØ·Ø§Ø¡ Ø§Ù„Ø¶Ù…Ø§Ù† (Ù…Ø¯ÙŠÙ†)
        if (Number(formData.margin_amount) > 0) {
          journalLines.push({
            accountId: formData.margin_account_id,
            debit: Number(formData.margin_amount),
            credit: 0,
            description: `ØºØ·Ø§Ø¡ Ø®Ø·Ø§Ø¨ Ø¶Ù…Ø§Ù† Ø±Ù‚Ù… ${formData.lg_number} Ù„ØµØ§Ù„Ø­ ${formData.beneficiary}`
          });
        }

        // 2. Ø¹Ù…ÙˆÙ„Ø© Ø§Ù„Ø¨Ù†Ùƒ (Ù…Ø¯ÙŠÙ†)
        if (Number(formData.commission_amount) > 0 && formData.expense_account_id) {
          journalLines.push({
            accountId: formData.expense_account_id,
            debit: Number(formData.commission_amount),
            credit: 0,
            description: `Ø¹Ù…ÙˆÙ„Ø© ÙˆÙ…ØµØ§Ø±ÙŠÙ Ø¥ØµØ¯Ø§Ø± Ø®Ø·Ø§Ø¨ Ø¶Ù…Ø§Ù† Ø±Ù‚Ù… ${formData.lg_number}`
          });
        }

        // 3. Ø§Ù„Ø¨Ù†Ùƒ Ø§Ù„Ù…ØµØ¯Ø± (Ø¯Ø§Ø¦Ù†)
        const totalCredit = Number(formData.margin_amount) + Number(formData.commission_amount);
        if (totalCredit > 0) {
          journalLines.push({
            accountId: formData.issuing_bank_id,
            debit: 0,
            credit: totalCredit,
            description: `Ø³Ø¯Ø§Ø¯ ØºØ·Ø§Ø¡ ÙˆÙ…ØµØ§Ø±ÙŠÙ Ø®Ø·Ø§Ø¨ Ø¶Ù…Ø§Ù† Ø±Ù‚Ù… ${formData.lg_number}`
          });
        }

        if (journalLines.length > 0) {
          await addEntry({
            date: formData.issue_date,
            reference: `LG-${formData.lg_number}`,
            description: `Ø¥ØµØ¯Ø§Ø± Ø®Ø·Ø§Ø¨ Ø¶Ù…Ø§Ù† Ø¨Ù†ÙƒÙŠ Ø±Ù‚Ù… ${formData.lg_number} Ù„ØµØ§Ù„Ø­ ${formData.beneficiary}`,
            lines: journalLines,
            status: 'posted'
          });
          showToast('ØªÙ… ØªØ±Ø­ÙŠÙ„ Ø§Ù„Ù‚ÙŠØ¯ Ø§Ù„Ù…Ø­Ø§Ø³Ø¨ÙŠ Ù„Ø¥ØµØ¯Ø§Ø± Ø®Ø·Ø§Ø¨ Ø§Ù„Ø¶Ù…Ø§Ù† ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ ðŸ“Š', 'success');
        }
      }

      setShowAddModal(false);
      setEditingLgId(null);
      fetchData();
    } catch (err) {
      showToast('ÙØ´Ù„ Ø­ÙØ¸ Ø®Ø·Ø§Ø¨ Ø§Ù„Ø¶Ù…Ø§Ù†: ' + err.message, 'error');
    }
  };

  const handleDeleteLg = async (id: string) => {
    if (!window.confirm('Ù‡Ù„ Ø£Ù†Øª Ù…ØªØ£ÙƒØ¯ Ù…Ù† Ø±ØºØ¨ØªÙƒ ÙÙŠ Ø­Ø°Ù Ø®Ø·Ø§Ø¨ Ø§Ù„Ø¶Ù…Ø§Ù† Ù‡Ø°Ø§ØŸ Ù„Ù† ÙŠØ¤Ø«Ø± Ù‡Ø°Ø§ Ø¹Ù„Ù‰ Ø§Ù„Ù‚ÙŠÙˆØ¯ Ø§Ù„Ù…Ø­Ø§Ø³Ø¨ÙŠØ© Ø§Ù„ØªÙŠ ØªÙ… ØªØ±Ø­ÙŠÙ„Ù‡Ø§ Ù…Ø³Ø¨Ù‚Ø§Ù‹.')) return;
    try {
      if (currentUser?.role === 'demo') {
        setLgs(prev => prev.filter(lg => lg.id !== id));
        if (selectedLgDetail?.id === id) setSelectedLgDetail(null);
        showToast('ØªÙ… Ø­Ø°Ù Ø®Ø·Ø§Ø¨ Ø§Ù„Ø¶Ù…Ø§Ù† (Ù†Ø³Ø®Ø© ØªØ¬Ø±ÙŠØ¨ÙŠØ©) ðŸ—‘ï¸', 'success');
        return;
      }

      const { error } = await supabase.from('letters_of_guarantee').delete().eq('id', id);
      if (error) throw error;
      showToast('ØªÙ… Ø­Ø°Ù Ø®Ø·Ø§Ø¨ Ø§Ù„Ø¶Ù…Ø§Ù† Ø¨Ù†Ø¬Ø§Ø­ ðŸ—‘ï¸', 'success');
      if (selectedLgDetail?.id === id) setSelectedLgDetail(null);
      fetchData();
    } catch (err) {
      showToast('ÙØ´Ù„ Ø­Ø°Ù Ø®Ø·Ø§Ø¨ Ø§Ù„Ø¶Ù…Ø§Ù†: ' + err.message, 'error');
    }
  };

  // Extend LG Action
  const handleExtendLg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extendData.new_expiry_date) {
      showToast('ÙŠØ±Ø¬Ù‰ ØªØ­Ø¯ÙŠØ¯ ØªØ§Ø±ÙŠØ® Ø§Ù„Ø§Ù†ØªÙ‡Ø§Ø¡ Ø§Ù„Ø¬Ø¯ÙŠØ¯', 'warning');
      return;
    }

    try {
      if (currentUser?.role === 'demo') {
        showToast('ØªÙ… ØªÙ…Ø¯ÙŠØ¯ Ø®Ø·Ø§Ø¨ Ø§Ù„Ø¶Ù…Ø§Ù† Ø¨Ù†Ø¬Ø§Ø­ (Ù†Ø³Ø®Ø© ØªØ¬Ø±ÙŠØ¨ÙŠØ©)', 'success');
        setShowExtendModal(false);
        fetchData();
        return;
      }

      const newTotalCommission = Number(selectedLg.commission_amount) + Number(extendData.additional_commission);

      const { error } = await supabase.from('letters_of_guarantee')
        .update({
          expiry_date: extendData.new_expiry_date,
          status: 'extended',
          commission_amount: newTotalCommission,
          notes: selectedLg.notes + `\n[ØªÙ…Ø¯ÙŠØ¯ ÙÙŠ ${new Date().toLocaleDateString('ar-EG')}: ${extendData.notes}]`
        })
        .eq('id', selectedLg.id);

      if (error) throw error;
      showToast('ØªÙ… ØªÙ…Ø¯ÙŠØ¯ Ø®Ø·Ø§Ø¨ Ø§Ù„Ø¶Ù…Ø§Ù† ÙˆØªØ­Ø¯ÙŠØ« ØªØ§Ø±ÙŠØ® Ø§Ù„ØµÙ„Ø§Ø­ÙŠØ© âœ…', 'success');

      // Post commission entry if exists
      if (extendData.auto_post_journal && Number(extendData.additional_commission) > 0 && selectedLg.expense_account_id) {
        await addEntry({
          date: new Date().toISOString().split('T')[0],
          reference: `LG-EXT-${selectedLg.lg_number}`,
          description: `Ø¹Ù…ÙˆÙ„Ø© ØªÙ…Ø¯ÙŠØ¯ Ø®Ø·Ø§Ø¨ Ø¶Ù…Ø§Ù† Ø±Ù‚Ù… ${selectedLg.lg_number}`,
          lines: [
            {
              accountId: selectedLg.expense_account_id,
              debit: Number(extendData.additional_commission),
              credit: 0,
              description: `Ø¹Ù…ÙˆÙ„Ø© Ø¥Ø¶Ø§ÙÙŠØ© Ù„ØªÙ…Ø¯ÙŠØ¯ ØµÙ„Ø§Ø­ÙŠØ© Ø®Ø·Ø§Ø¨ Ø§Ù„Ø¶Ù…Ø§Ù† Ø±Ù‚Ù… ${selectedLg.lg_number}`
            },
            {
              accountId: selectedLg.issuing_bank_id,
              debit: 0,
              credit: Number(extendData.additional_commission),
              description: `Ø³Ø¯Ø§Ø¯ Ø¹Ù…ÙˆÙ„Ø© ØªÙ…Ø¯ÙŠØ¯ Ø®Ø·Ø§Ø¨ Ø¶Ù…Ø§Ù† Ø±Ù‚Ù… ${selectedLg.lg_number}`
            }
          ],
          status: 'posted'
        });
        showToast('ØªÙ… ØªØ±Ø­ÙŠÙ„ Ù‚ÙŠØ¯ Ø¹Ù…ÙˆÙ„Ø© Ø§Ù„ØªÙ…Ø¯ÙŠØ¯ ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ ðŸ“Š', 'success');
      }

      setShowExtendModal(false);
      fetchData();
    } catch (err) {
      showToast('ÙØ´Ù„ ØªÙ…Ø¯ÙŠØ¯ Ø®Ø·Ø§Ø¨ Ø§Ù„Ø¶Ù…Ø§Ù†: ' + err.message, 'error');
    }
  };

  // Return LG Action
  const handleReturnLg = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (currentUser?.role === 'demo') {
        showToast('ØªÙ… Ø¥Ù„ØºØ§Ø¡ ÙˆØ§Ø³ØªØ±Ø¯Ø§Ø¯ Ø®Ø·Ø§Ø¨ Ø§Ù„Ø¶Ù…Ø§Ù† (Ù†Ø³Ø®Ø© ØªØ¬Ø±ÙŠØ¨ÙŠØ©)', 'success');
        setShowReturnModal(false);
        fetchData();
        return;
      }

      const { error } = await supabase.from('letters_of_guarantee')
        .update({
          status: 'returned',
          notes: selectedLg.notes + `\n[Ø§Ø³ØªØ±Ø¯Ø§Ø¯ ÙˆØ¥Ù„ØºØ§Ø¡ ÙÙŠ ${returnData.return_date}: ${returnData.notes}]`
        })
        .eq('id', selectedLg.id);

      if (error) throw error;
      showToast('ØªÙ… Ø¥Ù†Ù‡Ø§Ø¡ ÙˆØ§Ø³ØªØ±Ø¯Ø§Ø¯ Ø®Ø·Ø§Ø¨ Ø§Ù„Ø¶Ù…Ø§Ù† Ø¨Ù†Ø¬Ø§Ø­ ðŸ”’', 'success');

      // Post release entry
      if (returnData.auto_post_journal && Number(selectedLg.margin_amount) > 0) {
        const refundBankId = returnData.target_bank_id || selectedLg.issuing_bank_id;
        await addEntry({
          date: returnData.return_date,
          reference: `LG-REF-${selectedLg.lg_number}`,
          description: `Ø¥Ù„ØºØ§Ø¡ ÙˆØ§Ø³ØªØ±Ø¯Ø§Ø¯ ØºØ·Ø§Ø¡ Ø®Ø·Ø§Ø¨ Ø¶Ù…Ø§Ù† Ø±Ù‚Ù… ${selectedLg.lg_number}`,
          lines: [
            {
              accountId: refundBankId,
              debit: Number(selectedLg.margin_amount),
              credit: 0,
              description: `Ø§Ø³ØªØ±Ø¯Ø§Ø¯ Ù‚ÙŠÙ…Ø© ØºØ·Ø§Ø¡ Ø®Ø·Ø§Ø¨ Ø§Ù„Ø¶Ù…Ø§Ù† Ø±Ù‚Ù… ${selectedLg.lg_number} Ø§Ù„Ù…Ù„ØºÙŠ`
            },
            {
              accountId: selectedLg.margin_account_id,
              debit: 0,
              credit: Number(selectedLg.margin_amount),
              description: `Ø¥Ù‚ÙØ§Ù„ Ø­Ø³Ø§Ø¨ ØºØ·Ø§Ø¡ Ø®Ø·Ø§Ø¨ Ø§Ù„Ø¶Ù…Ø§Ù† Ø±Ù‚Ù… ${selectedLg.lg_number}`
            }
          ],
          status: 'posted'
        });
        showToast('ØªÙ… ØªØ±Ø­ÙŠÙ„ Ù‚ÙŠØ¯ Ø§Ø³ØªØ±Ø¯Ø§Ø¯ ØºØ·Ø§Ø¡ Ø®Ø·Ø§Ø¨ Ø§Ù„Ø¶Ù…Ø§Ù† ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ ðŸ“Š', 'success');
      }

      setShowReturnModal(false);
      fetchData();
    } catch (err) {
      showToast('ÙØ´Ù„ Ø§Ø³ØªØ±Ø¯Ø§Ø¯ Ø®Ø·Ø§Ø¨ Ø§Ù„Ø¶Ù…Ø§Ù†: ' + err.message, 'error');
    }
  };

  // Liquidate LG Action
  const handleLiquidateLg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!liquidateData.expense_account_id) {
      showToast('ÙŠØ±Ø¬Ù‰ ØªØ­Ø¯ÙŠØ¯ Ø­Ø³Ø§Ø¨ Ø®Ø³Ø§Ø¦Ø± ØªØ³ÙŠÙŠÙ„ Ø®Ø·Ø§Ø¨Ø§Øª Ø§Ù„Ø¶Ù…Ø§Ù†', 'warning');
      return;
    }

    try {
      if (currentUser?.role === 'demo') {
        showToast('ØªÙ… ØªØ³ÙŠÙŠÙ„ ÙˆÙ…ØµØ§Ø¯Ø±Ø© Ø®Ø·Ø§Ø¨ Ø§Ù„Ø¶Ù…Ø§Ù† (Ù†Ø³Ø®Ø© ØªØ¬Ø±ÙŠØ¨ÙŠØ©)', 'success');
        setShowLiquidateModal(false);
        fetchData();
        return;
      }

      const { error } = await supabase.from('letters_of_guarantee')
        .update({
          status: 'liquidated',
          notes: selectedLg.notes + `\n[ØªØ³ÙŠÙŠÙ„ ÙˆÙ…ØµØ§Ø¯Ø±Ø© ÙÙŠ ${liquidateData.liquidation_date}: ${liquidateData.notes}]`
        })
        .eq('id', selectedLg.id);

      if (error) throw error;
      showToast('ØªÙ… Ø¥Ø«Ø¨Ø§Øª ØªØ³ÙŠÙŠÙ„ ÙˆÙ…ØµØ§Ø¯Ø±Ø© Ø®Ø·Ø§Ø¨ Ø§Ù„Ø¶Ù…Ø§Ù† ðŸš¨', 'success');

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
            description: `Ø®Ø³Ø§Ø¦Ø± ÙˆÙ…ØµØ±ÙˆÙØ§Øª Ù†Ø§ØªØ¬Ø© Ø¹Ù† ØªØ³ÙŠÙŠÙ„ Ø®Ø·Ø§Ø¨ Ø¶Ù…Ø§Ù† Ø±Ù‚Ù… ${selectedLg.lg_number} Ù„ØµØ§Ù„Ø­ ${selectedLg.beneficiary}`
          },
          {
            accountId: selectedLg.margin_account_id,
            debit: 0,
            credit: marginAmount,
            description: `Ø¥Ù‚ÙØ§Ù„ ÙˆØªØ³ÙˆÙŠØ© ØºØ·Ø§Ø¡ Ø®Ø·Ø§Ø¨ Ø§Ù„Ø¶Ù…Ø§Ù† Ø±Ù‚Ù… ${selectedLg.lg_number} Ø§Ù„Ù…ÙÙ‚ÙˆØ¯`
          }
        ];

        if (remainingDeducted > 0) {
          journalLines.push({
            accountId: selectedLg.issuing_bank_id,
            debit: 0,
            credit: remainingDeducted,
            description: `Ø®ØµÙ… Ø§Ù„Ø¨Ù†Ùƒ Ø§Ù„Ù…ØªØ¨Ù‚ÙŠ Ù…Ù† Ù‚ÙŠÙ…Ø© Ø®Ø·Ø§Ø¨ Ø¶Ù…Ø§Ù† Ø±Ù‚Ù… ${selectedLg.lg_number} Ø§Ù„Ù…Ø³ÙŠÙ„`
          });
        }

        await addEntry({
          date: liquidateData.liquidation_date,
          reference: `LG-LIQ-${selectedLg.lg_number}`,
          description: `ØªØ³ÙŠÙŠÙ„ ÙˆÙ…ØµØ§Ø¯Ø±Ø© Ø®Ø·Ø§Ø¨ Ø¶Ù…Ø§Ù† Ø±Ù‚Ù… ${selectedLg.lg_number} Ù„ØµØ§Ù„Ø­ ${selectedLg.beneficiary}`,
          lines: journalLines,
          status: 'posted'
        });
        showToast('ØªÙ… ØªØ±Ø­ÙŠÙ„ Ù‚ÙŠØ¯ Ø§Ù„ØªØ³ÙŠÙŠÙ„ ÙˆØªØ­Ù…ÙŠÙ„ Ø§Ù„Ø®Ø³Ø§Ø¦Ø± Ø¢Ù„ÙŠØ§Ù‹ ðŸ“Š', 'success');
      }

      setShowLiquidateModal(false);
      fetchData();
    } catch (err) {
      showToast('ÙØ´Ù„ ØªØ³ÙŠÙŠÙ„ Ø®Ø·Ø§Ø¨ Ø§Ù„Ø¶Ù…Ø§Ù†: ' + err.message, 'error');
    }
  };

  const printLg = (lg: Record<string, any>) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    const html = `
      <html dir="rtl">
        <head>
          <title>Ø·Ø¨Ø§Ø¹Ø© Ø®Ø·Ø§Ø¨ Ø¶Ù…Ø§Ù† - ${lg.lg_number}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #333; line-height: 1.6; direction: rtl; text-align: right; }
            .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #ddd; padding-bottom: 20px; }
            .title { font-size: 24px; font-weight: bold; margin-bottom: 5px; }
            .subtitle { font-size: 16px; color: #666; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
            .label { font-size: 12px; color: #777; margin-bottom: 4px; font-weight: bold; }
            .value { font-size: 16px; font-weight: bold; }
            .section-title { font-size: 18px; font-weight: bold; margin: 30px 0 15px 0; border-bottom: 1px solid #eee; padding-bottom: 5px; color: #444; }
            .box { border: 1px solid #ddd; padding: 15px; border-radius: 8px; background: #fafafa; }
            @media print { body { -webkit-print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">Ø®Ø·Ø§Ø¨ Ø¶Ù…Ø§Ù† Ø¨Ù†ÙƒÙŠ</div>
            <div class="subtitle">Ø±Ù‚Ù…: ${lg.lg_number}</div>
          </div>
          
          <div class="grid">
            <div>
              <div class="label">ØªØ§Ø±ÙŠØ® Ø§Ù„Ø¥ØµØ¯Ø§Ø±</div>
              <div class="value">${lg.issue_date}</div>
            </div>
            <div>
              <div class="label">ØªØ§Ø±ÙŠØ® Ø§Ù„Ø§Ù†ØªÙ‡Ø§Ø¡</div>
              <div class="value">${lg.expiry_date}</div>
            </div>
            <div>
              <div class="label">Ø§Ù„Ù…Ø³ØªÙÙŠØ¯</div>
              <div class="value">${lg.beneficiary}</div>
            </div>
            <div>
              <div class="label">Ø§Ù„Ø¨Ù†Ùƒ Ø§Ù„Ù…ØµØ¯Ø±</div>
              <div class="value">${lg.issuing_bank?.name || 'ØºÙŠØ± Ù…Ø­Ø¯Ø¯'}</div>
            </div>
          </div>
  
          <div class="section-title">Ø§Ù„ØªÙØ§ØµÙŠÙ„ Ø§Ù„Ù…Ø§Ù„ÙŠØ©</div>
          <div class="grid box">
            <div>
              <div class="label">Ø§Ù„Ù‚ÙŠÙ…Ø© Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠØ©</div>
              <div class="value">${lg.amount.toLocaleString()}</div>
            </div>
            <div>
              <div class="label">Ù†Ø³Ø¨Ø© Ø§Ù„ØºØ·Ø§Ø¡</div>
              <div class="value">${lg.margin_percentage}%</div>
            </div>
            <div>
              <div class="label">Ù‚ÙŠÙ…Ø© Ø§Ù„ØºØ·Ø§Ø¡</div>
              <div class="value">${lg.margin_amount.toLocaleString()}</div>
            </div>
            <div>
              <div class="label">Ø§Ù„Ø¹Ù…ÙˆÙ„Ø§Øª Ø§Ù„Ø¨Ù†ÙƒÙŠØ©</div>
              <div class="value">${lg.commission_amount.toLocaleString()}</div>
            </div>
          </div>
          
          <div class="section-title">Ù…Ø¹Ù„ÙˆÙ…Ø§Øª Ø¥Ø¶Ø§ÙÙŠØ©</div>
          <div class="grid">
            <div>
              <div class="label">Ù†ÙˆØ¹ Ø§Ù„Ø®Ø·Ø§Ø¨</div>
              <div class="value">${getTypeText(lg.type)}</div>
            </div>
            <div>
              <div class="label">Ø§Ù„Ù…Ø´Ø±ÙˆØ¹</div>
              <div class="value">${lg.project?.name || '-'}</div>
            </div>
            <div style="grid-column: span 2">
              <div class="label">Ø§Ù„Ù…Ù„Ø§Ø­Ø¸Ø§Øª</div>
              <div class="value" style="white-space: pre-line">${lg.notes || 'Ù„Ø§ ÙŠÙˆØ¬Ø¯'}</div>
            </div>
          </div>
        </body>
      </html>
    `;
    
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
    };
  };

  // Helper functions
  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return 'Ù†Ø´Ø·';
      case 'extended': return 'Ù…Ù…Ø¯Ø¯';
      case 'returned': return 'Ù…Ø³ØªØ±Ø¯/Ù…Ù„ØºÙŠ';
      case 'liquidated': return 'Ù…Ø³ÙŠÙ„/Ù…ØµØ§Ø¯ÙŽØ±';
      default: return status;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full text-xs font-bold border border-emerald-100 flex items-center gap-1 w-fit"><CheckCircle size={12} /> Ù†Ø´Ø·</span>;
      case 'extended':
        return <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full text-xs font-bold border border-blue-100 flex items-center gap-1 w-fit"><RefreshCw size={12} /> Ù…Ù…Ø¯Ø¯</span>;
      case 'returned':
        return <span className="bg-slate-50 text-slate-600 px-2.5 py-1 rounded-full text-xs font-bold border border-slate-100 flex items-center gap-1 w-fit"><Ban size={12} /> Ù…Ø³ØªØ±Ø¯/Ù…Ù„ØºÙŠ</span>;
      case 'liquidated':
        return <span className="bg-rose-50 text-rose-700 px-2.5 py-1 rounded-full text-xs font-bold border border-rose-100 flex items-center gap-1 w-fit"><AlertTriangle size={12} /> Ù…Ø³ÙŠÙ„/Ù…ØµØ§Ø¯ÙŽØ±</span>;
      default:
        return <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs">{status}</span>;
    }
  };

  const getTypeText = (type: string) => {
    switch (type) {
      case 'bid_bond': return 'Ø§Ø¨ØªØ¯Ø§Ø¦ÙŠ (Bid Bond)';
      case 'performance_bond': return 'Ù†Ù‡Ø§Ø¦ÙŠ (Performance)';
      case 'advance_payment': return 'Ø¯ÙØ¹Ø© Ù…Ù‚Ø¯Ù…Ø© (Advance)';
      case 'other': return 'Ø¢Ø®Ø±';
      default: return type;
    }
  };

  const getActionHistory = (notes: string) => {
    if (!notes) return [];
    const lines = notes.split('\n');
    return lines.filter(line => line.startsWith('[ØªÙ…Ø¯ÙŠØ¯') || line.startsWith('[Ø§Ø³ØªØ±Ø¯Ø§Ø¯') || line.startsWith('[ØªØ³ÙŠÙŠÙ„'));
  };

  const getProgress = (issue: string, expiry: string) => {
    const start = new Date(issue).getTime();
    const end = new Date(expiry).getTime();
    const now = new Date().getTime();
    if (now >= end) return 100;
    if (now <= start) return 0;
    return ((now - start) / (end - start)) * 100;
  };

  const getStatusColor = (status: string) => {
    if (status === 'active') return 'border-r-emerald-500';
    if (status === 'extended') return 'border-r-blue-500';
    if (status === 'returned') return 'border-r-slate-400';
    if (status === 'liquidated') return 'border-r-rose-500';
    return 'border-r-transparent';
  };

  // Filter logic
  const filteredLgs = lgs.filter(lg => {
    const matchesStatus = statusFilter === 'all' || lg.status === statusFilter;
    const matchesType = typeFilter === 'all' || lg.type === typeFilter;
    const matchesBank = bankFilter === 'all' || lg.issuing_bank_id === bankFilter;
    
    let matchesDate = true;
    if (dateFrom) matchesDate = matchesDate && new Date(lg.issue_date) >= new Date(dateFrom);
    if (dateTo) matchesDate = matchesDate && new Date(lg.issue_date) <= new Date(dateTo);

    const matchesSearch = 
      lg.lg_number.toLowerCase().includes(searchTerm.toLowerCase()) || 
      lg.beneficiary.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (lg.project?.name && lg.project.name.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesStatus && matchesType && matchesBank && matchesDate && matchesSearch;
  });

  // Calculate statistics
  const activeLgs = lgs.filter(lg => lg.status === 'active' || lg.status === 'extended');
  const totalAmount = activeLgs.reduce((acc, curr) => acc + Number(curr.amount), 0);
  const totalMargin = activeLgs.reduce((acc, curr) => acc + Number(curr.margin_amount), 0);
  const totalCommissions = lgs.reduce((acc, curr) => acc + Number(curr.commission_amount || 0), 0);
  
  const soonToExpire30Count = activeLgs.filter(lg => {
    const daysLeft = Math.ceil((new Date(lg.expiry_date).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
    return daysLeft >= 0 && daysLeft <= 30;
  }).length;

  const urgentExpiringLgs = activeLgs.filter(lg => {
    const daysLeft = Math.ceil((new Date(lg.expiry_date).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
    return daysLeft >= 0 && daysLeft <= 7;
  });

  return (
    <div className="p-6 space-y-6 text-slate-800" dir="rtl">
      {/* Enhanced Header */}
      <div className="bg-gradient-to-l from-indigo-900 to-slate-800 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <Shield size={120} />
        </div>
        <div className="relative z-10">
          <h1 className="text-2xl md:text-3xl font-black text-white flex items-center gap-3">
            <Landmark className="text-amber-400" size={32} />
            Ø¥Ø¯Ø§Ø±Ø© Ø®Ø·Ø§Ø¨Ø§Øª Ø§Ù„Ø¶Ù…Ø§Ù† Ø§Ù„Ø¨Ù†ÙƒÙŠØ©
          </h1>
          <p className="text-indigo-100 text-sm md:text-base mt-2">ØªØªØ¨Ø¹ ÙˆÙ…Ø±Ø§Ù‚Ø¨Ø© Ø®Ø·Ø§Ø¨Ø§Øª Ø§Ù„Ø¶Ù…Ø§Ù†ØŒ Ø§Ù„Ø£ØºØ·ÙŠØ© Ø§Ù„Ù†Ù‚Ø¯ÙŠØ©ØŒ ÙˆØ§Ù„Ù‚ÙŠÙˆØ¯ Ø§Ù„Ù…Ø­Ø§Ø³Ø¨ÙŠØ© Ø§Ù„Ø¢Ù„ÙŠØ© Ø¨Ø¯Ù‚Ø©.</p>
        </div>
        <button 
          onClick={() => {
            const defaultMarginAccId = getSystemAccount('LETTER_OF_GUARANTEE_MARGIN')?.id || allAccounts.find(a => a.code === '1248' || a.name?.includes('ØºØ·Ø§Ø¡ Ø®Ø·Ø§Ø¨Ø§Øª'))?.id || '';
            const defaultExpenseAccId = allAccounts.find(a => a.code === '534' || a.code?.startsWith('534') || a.name?.includes('Ù…ØµØ±ÙˆÙØ§Øª Ø¨Ù†ÙƒÙŠØ©') || a.name?.includes('Ø¹Ù…ÙˆÙ„Ø©'))?.id || '';
            
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
          className="relative z-10 bg-amber-500 text-amber-950 px-5 py-3 rounded-xl flex items-center gap-2 font-black hover:bg-amber-400 transition shadow-lg shrink-0"
        >
          <Plus size={20} /> Ø¥ØµØ¯Ø§Ø± Ø®Ø·Ø§Ø¨ Ø¶Ù…Ø§Ù†
        </button>
      </div>

      {/* 5 KPIs Board */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between group hover:border-indigo-300 transition">
          <div className="flex justify-between items-start mb-2">
            <p className="text-xs font-bold text-slate-500">Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø¶Ù…Ø§Ù†Ø§Øª Ø§Ù„Ù†Ø´Ø·Ø©</p>
            <div className="p-2 bg-gradient-to-br from-indigo-100 to-indigo-50 text-indigo-600 rounded-lg group-hover:scale-110 transition">
              <Landmark size={18} />
            </div>
          </div>
          <p className="text-xl font-black text-slate-900">{totalAmount.toLocaleString()} <span className="text-[10px] font-semibold text-slate-400">{currencySymbol}</span></p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between group hover:border-emerald-300 transition">
          <div className="flex justify-between items-start mb-2">
            <p className="text-xs font-bold text-slate-500">Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„ØºØ·Ø§Ø¡ Ø§Ù„Ù…Ø­Ø¬ÙˆØ²</p>
            <div className="p-2 bg-gradient-to-br from-emerald-100 to-emerald-50 text-emerald-600 rounded-lg group-hover:scale-110 transition">
              <Shield size={18} />
            </div>
          </div>
          <p className="text-xl font-black text-emerald-700">{totalMargin.toLocaleString()} <span className="text-[10px] font-semibold text-slate-400">{currencySymbol}</span></p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between group hover:border-amber-300 transition">
          <div className="flex justify-between items-start mb-2">
            <p className="text-xs font-bold text-slate-500">Ø§Ù„Ø®Ø·Ø§Ø¨Ø§Øª Ø§Ù„Ù†Ø´Ø·Ø©</p>
            <div className="p-2 bg-gradient-to-br from-amber-100 to-amber-50 text-amber-600 rounded-lg group-hover:scale-110 transition">
              <Activity size={18} />
            </div>
          </div>
          <p className="text-xl font-black text-indigo-900">{activeLgs.length} <span className="text-[10px] font-semibold text-slate-400">Ø®Ø·Ø§Ø¨</span></p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between group hover:border-rose-300 transition relative overflow-hidden">
          {soonToExpire30Count > 0 && <div className="absolute top-0 right-0 w-2 h-2 bg-rose-500 rounded-full m-3 animate-ping"></div>}
          <div className="flex justify-between items-start mb-2">
            <p className="text-xs font-bold text-slate-500">ØªÙ†ØªÙ‡ÙŠ Ù‚Ø±ÙŠØ¨Ø§Ù‹ (â‰¤Ù£Ù  ÙŠÙˆÙ…)</p>
            <div className={`p-2 rounded-lg transition ${soonToExpire30Count > 0 ? 'bg-gradient-to-br from-rose-100 to-rose-50 text-rose-600 group-hover:scale-110' : 'bg-slate-50 text-slate-400'}`}>
              <AlertTriangle size={18} />
            </div>
          </div>
          <p className={`text-xl font-black ${soonToExpire30Count > 0 ? 'text-rose-600' : 'text-slate-900'}`}>{soonToExpire30Count} <span className="text-[10px] font-semibold text-slate-400">Ø®Ø·Ø§Ø¨</span></p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between group hover:border-purple-300 transition">
          <div className="flex justify-between items-start mb-2">
            <p className="text-xs font-bold text-slate-500">Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø¹Ù…ÙˆÙ„Ø§Øª Ø§Ù„Ø¨Ù†ÙƒÙŠØ©</p>
            <div className="p-2 bg-gradient-to-br from-purple-100 to-purple-50 text-purple-600 rounded-lg group-hover:scale-110 transition">
              <TrendingUp size={18} />
            </div>
          </div>
          <p className="text-xl font-black text-purple-700">{totalCommissions.toLocaleString()} <span className="text-[10px] font-semibold text-slate-400">{currencySymbol}</span></p>
        </div>
      </div>

      {/* Expiry Alert Banner */}
      {urgentExpiringLgs.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-4">
          <div className="bg-rose-100 p-2 rounded-full text-rose-600 shrink-0">
            <AlertTriangle size={24} />
          </div>
          <div>
            <h4 className="font-bold text-rose-800 text-sm md:text-base">ØªÙ†Ø¨ÙŠÙ‡ Ù‡Ø§Ù…! ÙŠÙˆØ¬Ø¯ Ø®Ø·Ø§Ø¨Ø§Øª Ø¶Ù…Ø§Ù† ØªÙ†ØªÙ‡ÙŠ Ø®Ù„Ø§Ù„ Ø£Ø³Ø¨ÙˆØ¹ (Ø£Ùˆ Ø£Ù‚Ù„)</h4>
            <div className="mt-2 flex flex-wrap gap-2">
              {urgentExpiringLgs.map(lg => {
                const daysLeft = Math.ceil((new Date(lg.expiry_date).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
                return (
                  <button 
                    key={lg.id}
                    onClick={() => setSelectedLgDetail(lg)}
                    className="bg-white border border-rose-200 text-rose-700 text-xs px-3 py-1.5 rounded-full font-bold hover:bg-rose-100 transition shadow-sm"
                  >
                    {lg.lg_number} (Ø¨Ø§Ù‚ÙŠ {daysLeft} Ø£ÙŠØ§Ù…)
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Filters bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-64 shrink-0">
          <span className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
            <Search size={16} />
          </span>
          <input
            type="text"
            placeholder="Ø§Ù„Ø¨Ø­Ø« Ø¨Ø±Ù‚Ù…ØŒ Ù…Ø³ØªÙÙŠØ¯ØŒ Ù…Ø´Ø±ÙˆØ¹..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pr-10 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white transition"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 w-full sm:w-auto">
            <Calendar size={14} className="text-slate-500" />
            <input 
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-transparent text-xs text-slate-600 outline-none w-full"
              title="Ù…Ù† ØªØ§Ø±ÙŠØ® Ø¥ØµØ¯Ø§Ø±"
            />
            <span className="text-slate-400 text-xs">-</span>
            <input 
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-transparent text-xs text-slate-600 outline-none w-full"
              title="Ø¥Ù„Ù‰ ØªØ§Ø±ÙŠØ® Ø¥ØµØ¯Ø§Ø±"
            />
          </div>

          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 w-full sm:w-auto">
            <Building2 size={14} className="text-slate-500" />
            <select
              value={bankFilter}
              onChange={(e) => setBankFilter(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-700 outline-none w-full cursor-pointer"
            >
              <option value="all">ÙƒÙ„ Ø§Ù„Ø¨Ù†ÙˆÙƒ</option>
              {banks.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 w-full sm:w-auto">
            <Filter size={14} className="text-slate-500" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-700 outline-none w-full cursor-pointer"
            >
              <option value="all">ÙƒÙ„ Ø§Ù„Ø­Ø§Ù„Ø§Øª</option>
              <option value="active">Ù†Ø´Ø·</option>
              <option value="extended">Ù…Ù…Ø¯Ø¯</option>
              <option value="returned">Ù…Ø³ØªØ±Ø¯/Ù…Ù„ØºÙŠ</option>
              <option value="liquidated">Ù…Ø³ÙŠÙ„/Ù…ØµØ§Ø¯Ø±</option>
            </select>
          </div>

          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 w-full sm:w-auto">
            <Filter size={14} className="text-slate-500" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-700 outline-none w-full cursor-pointer"
            >
              <option value="all">ÙƒÙ„ Ø§Ù„Ø£Ù†ÙˆØ§Ø¹</option>
              <option value="bid_bond">Ø§Ø¨ØªØ¯Ø§Ø¦ÙŠ</option>
              <option value="performance_bond">Ù†Ù‡Ø§Ø¦ÙŠ</option>
              <option value="advance_payment">Ø¯ÙØ¹Ø© Ù…Ù‚Ø¯Ù…Ø©</option>
              <option value="other">Ø£Ø®Ø±Ù‰</option>
            </select>
          </div>
        </div>
      </div>

      {/* Master-Detail Layout */}
      <div className="flex flex-col lg:flex-row gap-6">
        
        {/* Main Table */}
        <div className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden ${selectedLgDetail ? 'lg:w-2/3' : 'w-full'} transition-all duration-300`}>
          {loading ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-2">
              <RefreshCw className="animate-spin text-indigo-600" size={28} />
              <p className="font-bold">Ø¬Ø§Ø±ÙŠ ØªØ­Ù…ÙŠÙ„ Ø¨ÙŠØ§Ù†Ø§Øª Ø®Ø·Ø§Ø¨Ø§Øª Ø§Ù„Ø¶Ù…Ø§Ù†...</p>
            </div>
          ) : filteredLgs.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <HelpCircle className="mx-auto mb-2 text-slate-300" size={32} />
              <p className="font-bold">Ù„Ø§ ØªÙˆØ¬Ø¯ Ø®Ø·Ø§Ø¨Ø§Øª Ø¶Ù…Ø§Ù† Ù…Ø·Ø§Ø¨Ù‚Ø© Ù„Ù„Ø¨Ø­Ø« Ø­Ø§Ù„ÙŠØ§Ù‹.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 text-xs uppercase tracking-wider font-black">
                  <tr>
                    <th className="p-4 pr-6">Ø±Ù‚Ù… Ø§Ù„Ø®Ø·Ø§Ø¨ / Ø§Ù„Ù†ÙˆØ¹</th>
                    <th className="p-4">Ø§Ù„Ù…Ø³ØªÙÙŠØ¯ / Ø§Ù„Ø¨Ù†Ùƒ</th>
                    <th className="p-4">Ø§Ù„Ù…Ø¨Ù„Øº ÙˆØ§Ù„ØºØ·Ø§Ø¡</th>
                    <th className="p-4">ØªØ§Ø±ÙŠØ® Ø§Ù„Ø§Ù†ØªÙ‡Ø§Ø¡</th>
                    <th className="p-4">Ø§Ù„Ø­Ø§Ù„Ø©</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredLgs.map(lg => {
                    const daysLeft = Math.ceil((new Date(lg.expiry_date).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
                    const isExpiring30 = (lg.status === 'active' || lg.status === 'extended') && daysLeft >= 0 && daysLeft <= 30;
                    const rowBg = isExpiring30 ? 'bg-amber-50/50' : 'hover:bg-slate-50';
                    const isSelected = selectedLgDetail?.id === lg.id;
                    const progress = getProgress(lg.issue_date, lg.expiry_date);
                    
                    return (
                      <tr 
                        key={lg.id} 
                        onClick={() => setSelectedLgDetail(lg)}
                        className={`cursor-pointer transition-colors border-r-4 ${getStatusColor(lg.status)} ${rowBg} ${isSelected ? 'bg-indigo-50 border-indigo-200' : ''}`}
                      >
                        <td className="p-4 pr-6">
                          <div className="font-mono font-bold text-indigo-700 text-base">{lg.lg_number}</div>
                          <div className="text-xs text-slate-500 font-semibold mt-1">{getTypeText(lg.type)}</div>
                        </td>
                        <td className="p-4">
                          <div className="font-bold text-slate-800">{lg.beneficiary}</div>
                          <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                            <Building2 size={12} /> {lg.issuing_bank?.name || '-'}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="font-black text-slate-900">{lg.amount.toLocaleString()} {currencySymbol}</div>
                          <div className="text-xs text-emerald-700 font-bold mt-1 bg-emerald-50 px-2 py-0.5 rounded inline-block">
                            ØºØ·Ø§Ø¡: {lg.margin_amount.toLocaleString()} ({lg.margin_percentage}%)
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex flex-col gap-1.5 w-32">
                            <span className="font-medium text-slate-700">{lg.expiry_date}</span>
                            <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${progress > 90 ? 'bg-rose-500' : progress > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${progress}%` }}></div>
                            </div>
                            {isExpiring30 && (
                              <span className="text-[10px] text-amber-600 font-bold">Ø¨Ø§Ù‚ÙŠ {daysLeft} Ø£ÙŠØ§Ù…</span>
                            )}
                          </div>
                        </td>
                        <td className="p-4">
                          {getStatusBadge(lg.status)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedLgDetail && (
          <div className="w-full lg:w-1/3 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col max-h-[80vh] sticky top-6">
            <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-start">
              <div>
                <h3 className="font-mono font-black text-xl text-indigo-900">{selectedLgDetail.lg_number}</h3>
                <div className="flex items-center gap-2 mt-2">
                  <span className="bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold">
                    {getTypeText(selectedLgDetail.type)}
                  </span>
                  {getStatusBadge(selectedLgDetail.status)}
                </div>
              </div>
              <button onClick={() => setSelectedLgDetail(null)} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded transition">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-5 flex-1 overflow-y-auto space-y-6 text-sm">
              {/* Financials */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-500 block mb-1">Ø§Ù„Ù‚ÙŠÙ…Ø© Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠØ©</span>
                  <span className="font-black text-base text-slate-800">{selectedLgDetail.amount.toLocaleString()} <span className="text-xs font-semibold text-slate-400">{currencySymbol}</span></span>
                </div>
                <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100">
                  <span className="text-[10px] font-bold text-emerald-600 block mb-1">Ø§Ù„ØºØ·Ø§Ø¡ Ø§Ù„Ù†Ù‚Ø¯ÙŠ ({selectedLgDetail.margin_percentage}%)</span>
                  <span className="font-black text-base text-emerald-800">{selectedLgDetail.margin_amount.toLocaleString()} <span className="text-xs font-semibold text-emerald-600/60">{currencySymbol}</span></span>
                </div>
                <div className="bg-purple-50 p-3 rounded-lg border border-purple-100 col-span-2">
                  <span className="text-[10px] font-bold text-purple-600 block mb-1">Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø¹Ù…ÙˆÙ„Ø§Øª Ø§Ù„Ø¨Ù†ÙƒÙŠØ© Ø§Ù„Ù…Ø¯ÙÙˆØ¹Ø©</span>
                  <span className="font-black text-base text-purple-800">{selectedLgDetail.commission_amount.toLocaleString()} <span className="text-xs font-semibold text-purple-600/60">{currencySymbol}</span></span>
                </div>
              </div>

              {/* Entities */}
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 text-slate-400"><Building2 size={16} /></div>
                  <div>
                    <span className="text-xs text-slate-500 block">Ø§Ù„Ù…Ø³ØªÙÙŠØ¯ / Ø§Ù„Ù…Ø§Ù„Ùƒ</span>
                    <span className="font-bold text-slate-800">{selectedLgDetail.beneficiary}</span>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 text-slate-400"><Landmark size={16} /></div>
                  <div>
                    <span className="text-xs text-slate-500 block">Ø§Ù„Ø¨Ù†Ùƒ Ø§Ù„Ù…ØµØ¯Ø±</span>
                    <span className="font-bold text-slate-800">{selectedLgDetail.issuing_bank?.name || '-'}</span>
                  </div>
                </div>
                {selectedLgDetail.project && (
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 text-slate-400"><Activity size={16} /></div>
                    <div>
                      <span className="text-xs text-slate-500 block">Ø§Ù„Ù…Ø´Ø±ÙˆØ¹ Ø§Ù„Ù…Ø±ØªØ¨Ø·</span>
                      <span className="font-bold text-slate-800">{selectedLgDetail.project.name}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Dates & Lifetime */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex justify-between items-center mb-3">
                  <div>
                    <span className="text-[10px] text-slate-500 block font-bold">ØªØ§Ø±ÙŠØ® Ø§Ù„Ø¥ØµØ¯Ø§Ø±</span>
                    <span className="font-bold text-slate-700 text-xs">{selectedLgDetail.issue_date}</span>
                  </div>
                  <div className="text-left">
                    <span className="text-[10px] text-slate-500 block font-bold">ØªØ§Ø±ÙŠØ® Ø§Ù„Ø§Ù†ØªÙ‡Ø§Ø¡</span>
                    <span className="font-bold text-slate-700 text-xs">{selectedLgDetail.expiry_date}</span>
                  </div>
                </div>
                <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mb-1">
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${getProgress(selectedLgDetail.issue_date, selectedLgDetail.expiry_date)}%` }}></div>
                </div>
                <div className="text-center text-[10px] font-bold text-slate-500">
                  {Math.ceil((new Date(selectedLgDetail.expiry_date).getTime() - new Date().getTime()) / (1000 * 3600 * 24))} ÙŠÙˆÙ… Ù…ØªØ¨Ù‚ÙŠ
                </div>
              </div>

              {/* Notes & History */}
              {selectedLgDetail.notes && (
                <div>
                  <h4 className="font-bold text-xs text-slate-500 flex items-center gap-1.5 mb-2"><History size={14} /> Ù…Ù„Ø§Ø­Ø¸Ø§Øª ÙˆØ³Ø¬Ù„ Ø§Ù„Ø­Ø±ÙƒØ§Øª</h4>
                  <div className="bg-yellow-50/50 p-3 rounded-lg border border-yellow-100 text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                    {selectedLgDetail.notes}
                  </div>
                </div>
              )}
            </div>
            
            {/* Action Buttons Panel */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-wrap gap-2 justify-center">
              {(selectedLgDetail.status === 'active' || selectedLgDetail.status === 'extended') && (
                <>
                  <button 
                    onClick={() => {
                      setSelectedLg(selectedLgDetail);
                      setExtendData({
                        new_expiry_date: selectedLgDetail.expiry_date,
                        additional_commission: 0,
                        notes: '',
                        auto_post_journal: true
                      });
                      setShowExtendModal(true);
                    }}
                    className="flex-1 min-w-[30%] bg-blue-100 text-blue-700 hover:bg-blue-200 py-2 rounded-lg text-xs font-bold border border-blue-200 flex flex-col items-center gap-1 transition"
                  >
                    <RefreshCw size={14} /> ØªÙ…Ø¯ÙŠØ¯
                  </button>
                  <button 
                    onClick={() => {
                      setSelectedLg(selectedLgDetail);
                      setReturnData({
                        return_date: new Date().toISOString().split('T')[0],
                        target_bank_id: selectedLgDetail.issuing_bank_id,
                        notes: '',
                        auto_post_journal: true
                      });
                      setShowReturnModal(true);
                    }}
                    className="flex-1 min-w-[30%] bg-slate-200 text-slate-700 hover:bg-slate-300 py-2 rounded-lg text-xs font-bold border border-slate-300 flex flex-col items-center gap-1 transition"
                  >
                    <Ban size={14} /> Ø§Ø³ØªØ±Ø¯Ø§Ø¯
                  </button>
                  <button 
                    onClick={() => {
                      setSelectedLg(selectedLgDetail);
                      setLiquidateData({
                        liquidation_date: new Date().toISOString().split('T')[0],
                        expense_account_id: selectedLgDetail.expense_account_id || '',
                        notes: '',
                        auto_post_journal: true
                      });
                      setShowLiquidateModal(true);
                    }}
                    className="flex-1 min-w-[30%] bg-rose-100 text-rose-700 hover:bg-rose-200 py-2 rounded-lg text-xs font-bold border border-rose-200 flex flex-col items-center gap-1 transition"
                  >
                    <AlertTriangle size={14} /> ØªØ³ÙŠÙŠÙ„
                  </button>
                </>
              )}
              
              <div className="w-full flex gap-2 mt-2">
                <button
                  onClick={() => printLg(selectedLgDetail)}
                  className="flex-1 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 py-2 rounded-lg text-xs font-bold flex justify-center items-center gap-1.5 transition"
                >
                  <Printer size={14} /> Ø·Ø¨Ø§Ø¹Ø©
                </button>
                <button
                  onClick={() => {
                    setEditingLgId(selectedLgDetail.id);
                    setFormData({
                      lg_number: selectedLgDetail.lg_number,
                      type: selectedLgDetail.type,
                      issuing_bank_id: selectedLgDetail.issuing_bank_id,
                      margin_account_id: selectedLgDetail.margin_account_id,
                      expense_account_id: selectedLgDetail.expense_account_id || '',
                      project_id: selectedLgDetail.project_id || '',
                      beneficiary: selectedLgDetail.beneficiary,
                      amount: selectedLgDetail.amount,
                      margin_percentage: selectedLgDetail.margin_percentage,
                      margin_amount: selectedLgDetail.margin_amount,
                      commission_amount: selectedLgDetail.commission_amount,
                      issue_date: selectedLgDetail.issue_date,
                      expiry_date: selectedLgDetail.expiry_date,
                      notes: selectedLgDetail.notes || '',
                      auto_post_journal: false
                    });
                    setShowAddModal(true);
                  }}
                  className="flex-1 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 py-2 rounded-lg text-xs font-bold flex justify-center items-center gap-1.5 transition"
                >
                  <Edit size={14} /> ØªØ¹Ø¯ÙŠÙ„
                </button>
                <button
                  onClick={() => handleDeleteLg(selectedLgDetail.id)}
                  className="flex-1 bg-white border border-rose-100 text-rose-600 hover:bg-rose-50 py-2 rounded-lg text-xs font-bold flex justify-center items-center gap-1.5 transition"
                >
                  <Trash2 size={14} /> Ø­Ø°Ù
                </button>
              </div>
            </div>
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
                {editingLgId ? 'ØªØ¹Ø¯ÙŠÙ„ Ø¨ÙŠØ§Ù†Ø§Øª Ø®Ø·Ø§Ø¨ Ø§Ù„Ø¶Ù…Ø§Ù†' : 'Ø¥ØµØ¯Ø§Ø± ÙˆØªØ³Ø¬ÙŠÙ„ Ø®Ø·Ø§Ø¨ Ø¶Ù…Ø§Ù† Ø¨Ù†ÙƒÙŠ Ø¬Ø¯ÙŠØ¯'}
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
                  <label className="block text-xs font-bold text-slate-500 mb-1">Ø±Ù‚Ù… Ø®Ø·Ø§Ø¨ Ø§Ù„Ø¶Ù…Ø§Ù† *</label>
                  <input
                    type="text"
                    required
                    value={formData.lg_number}
                    onChange={(e) => setFormData(prev => ({ ...prev, lg_number: e.target.value }))}
                    placeholder="Ù…Ø«Ø§Ù„: LG-2026-8940"
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                {/* LG Type */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Ù†ÙˆØ¹ Ø®Ø·Ø§Ø¨ Ø§Ù„Ø¶Ù…Ø§Ù† *</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value }))}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="bid_bond">Ø§Ø¨ØªØ¯Ø§Ø¦ÙŠ (Bid Bond)</option>
                    <option value="performance_bond">Ù†Ù‡Ø§Ø¦ÙŠ (Performance Bond)</option>
                    <option value="advance_payment">ÙƒÙØ§Ù„Ø© Ø¯ÙØ¹Ø© Ù…Ù‚Ø¯Ù…Ø© (Advance Payment)</option>
                    <option value="other">Ø£Ø®Ø±Ù‰</option>
                  </select>
                </div>

                {/* Beneficiary */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Ø§Ù„Ø¬Ù‡Ø© Ø§Ù„Ù…Ø³ØªÙÙŠØ¯Ø© (Ø§Ù„Ù…Ø§Ù„Ùƒ/Ø§Ù„Ø¹Ù…ÙŠÙ„) *</label>
                  <input
                    type="text"
                    required
                    value={formData.beneficiary}
                    onChange={(e) => setFormData(prev => ({ ...prev, beneficiary: e.target.value }))}
                    placeholder="Ø§Ù„ÙˆØ²Ø§Ø±Ø©ØŒ Ø§Ù„Ù‡ÙŠØ¦Ø©ØŒ Ø£Ùˆ Ø§Ø³Ù… Ø§Ù„Ø¹Ù…ÙŠÙ„"
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                {/* Project */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Ø§Ù„Ù…Ø´Ø±ÙˆØ¹ Ø§Ù„Ù…Ø±ØªØ¨Ø·</label>
                  <select
                    value={formData.project_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, project_id: e.target.value }))}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="">Ù„Ø§ ÙŠÙˆØ¬Ø¯ Ù…Ø´Ø±ÙˆØ¹ Ù…Ø±ØªØ¨Ø·</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                {/* Issuing Bank Account */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Ø§Ù„Ø¨Ù†Ùƒ Ø§Ù„Ø¬Ø§Ø±ÙŠ Ø§Ù„Ù…ØµØ¯Ø± (Ø¯Ø§Ø¦Ù† Ø¨Ø§Ù„Ø®ØµÙ…) *</label>
                  <select
                    required
                    value={formData.issuing_bank_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, issuing_bank_id: e.target.value }))}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="">Ø§Ø®ØªØ± Ø­Ø³Ø§Ø¨ Ø§Ù„Ø¨Ù†Ùƒ Ø§Ù„Ù…ØµØ¯Ø±</option>
                    {banks.map(b => (
                      <option key={b.id} value={b.id}>({b.code}) - {b.name}</option>
                    ))}
                  </select>
                </div>

                {/* Margin Asset Account */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Ø­Ø³Ø§Ø¨ ØºØ·Ø§Ø¡ Ø®Ø·Ø§Ø¨ Ø§Ù„Ø¶Ù…Ø§Ù† (Ù…Ø¯ÙŠÙ† Ø¨Ø§Ù„ØºØ·Ø§Ø¡) *</label>
                  <select
                    required
                    value={formData.margin_account_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, margin_account_id: e.target.value }))}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="">Ø§Ø®ØªØ± Ø­Ø³Ø§Ø¨ ØºØ·Ø§Ø¡ Ø®Ø·Ø§Ø¨Ø§Øª Ø§Ù„Ø¶Ù…Ø§Ù†</option>
                    {allAccounts.filter(a => a.type === 'asset').map(a => (
                      <option key={a.id} value={a.id}>({a.code}) - {a.name}</option>
                    ))}
                  </select>
                </div>

                {/* Bank Expense Account */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Ø­Ø³Ø§Ø¨ Ù…ØµØ±ÙˆÙØ§Øª ÙˆØ¹Ù…ÙˆÙ„Ø§Øª Ø§Ù„Ø¨Ù†Ùƒ</label>
                  <select
                    value={formData.expense_account_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, expense_account_id: e.target.value }))}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="">Ø§Ø®ØªØ± Ø­Ø³Ø§Ø¨ Ø¹Ù…ÙˆÙ„Ø© Ø§Ù„Ø¨Ù†Ùƒ</option>
                    {allAccounts.filter(a => a.type === 'expense').map(a => (
                      <option key={a.id} value={a.id}>({a.code}) - {a.name}</option>
                    ))}
                  </select>
                </div>

                {/* Total LG Amount */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Ø§Ù„Ù‚ÙŠÙ…Ø© Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠØ© Ù„Ù„Ø®Ø·Ø§Ø¨ *</label>
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
                    <label className="block text-xs font-bold text-slate-500">Ù†Ø³Ø¨Ø© Ø§Ù„ØºØ·Ø§Ø¡ Ø§Ù„Ù†Ù‚Ø¯ÙŠ %</label>
                    <label className="block text-xs font-bold text-slate-500">Ù‚ÙŠÙ…Ø© Ø§Ù„ØºØ·Ø§Ø¡ Ø§Ù„Ù†Ù‚Ø¯ÙŠ</label>
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
                  <label className="block text-xs font-bold text-slate-500 mb-1">Ø¹Ù…ÙˆÙ„Ø© ÙˆÙ…ØµØ§Ø±ÙŠÙ Ø§Ù„Ø¨Ù†Ùƒ</label>
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
                  <label className="block text-xs font-bold text-slate-500 mb-1">ØªØ§Ø±ÙŠØ® Ø§Ù„Ø¥ØµØ¯Ø§Ø± *</label>
                  <input
                    type="date"
                    required
                    value={formData.issue_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, issue_date: e.target.value }))}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">ØªØ§Ø±ÙŠØ® Ø§Ù†ØªÙ‡Ø§Ø¡ Ø§Ù„ØµÙ„Ø§Ø­ÙŠØ© *</label>
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
                <label className="block text-xs font-bold text-slate-500 mb-1">Ù…Ù„Ø§Ø­Ø¸Ø§Øª ÙˆØ´Ø±ÙˆØ· Ø§Ù„Ø®Ø·Ø§Ø¨</label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Ù…Ù„Ø§Ø­Ø¸Ø§Øª ÙˆØ´Ø±ÙˆØ· Ø¥Ø¶Ø§ÙÙŠØ© Ù„Ø®Ø·Ø§Ø¨ Ø§Ù„Ø¶Ù…Ø§Ù†..."
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
                      <p className="text-xs font-bold text-indigo-950">ØªÙˆÙ„ÙŠØ¯ Ù‚ÙŠØ¯ ÙŠÙˆÙ…ÙŠØ© Ø¢Ù„ÙŠ</p>
                      <p className="text-[10px] text-indigo-600">Ø³ÙŠØªÙ… Ø¥ØµØ¯Ø§Ø± Ø§Ù„Ù‚ÙŠØ¯ Ø§Ù„Ù…Ø­Ø§Ø³Ø¨ÙŠ Ù„ØºØ·Ø§Ø¡ Ø§Ù„Ø¶Ù…Ø§Ù† ÙˆØ¹Ù…ÙˆÙ„Ø§Øª Ø§Ù„Ø¨Ù†Ùƒ ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ ÙÙˆØ± Ø§Ù„Ø­ÙØ¸.</p>
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
                  Ø¥Ù„ØºØ§Ø¡
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg text-sm hover:bg-indigo-700 transition"
                >
                  Ø­ÙØ¸ ÙˆØªØ£ÙƒÙŠØ¯
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
                ØªÙ…Ø¯ÙŠØ¯ ØµÙ„Ø§Ø­ÙŠØ© Ø®Ø·Ø§Ø¨ Ø§Ù„Ø¶Ù…Ø§Ù†
              </h3>
              <button onClick={() => setShowExtendModal(false)} className="text-slate-400 hover:text-slate-600 text-xl font-bold">&times;</button>
            </div>
            
            <form onSubmit={handleExtendLg} className="p-6 space-y-4">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-1">
                <p><strong>Ø±Ù‚Ù… Ø§Ù„Ø®Ø·Ø§Ø¨:</strong> {selectedLg.lg_number}</p>
                <p><strong>Ø§Ù„Ù…Ø³ØªÙÙŠØ¯:</strong> {selectedLg.beneficiary}</p>
                <p><strong>ØªØ§Ø±ÙŠØ® Ø§Ù„Ø§Ù†ØªÙ‡Ø§Ø¡ Ø§Ù„Ø­Ø§Ù„ÙŠ:</strong> {selectedLg.expiry_date}</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">ØªØ§Ø±ÙŠØ® Ø§Ù„Ø§Ù†ØªÙ‡Ø§Ø¡ Ø§Ù„Ø¬Ø¯ÙŠØ¯ *</label>
                <input
                  type="date"
                  required
                  value={extendData.new_expiry_date}
                  onChange={(e) => setExtendData(prev => ({ ...prev, new_expiry_date: e.target.value }))}
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Ø¹Ù…ÙˆÙ„Ø© ØªÙ…Ø¯ÙŠØ¯ Ø§Ù„Ø¨Ù†Ùƒ Ø§Ù„Ø¥Ø¶Ø§ÙÙŠØ©</label>
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
                <label className="block text-xs font-bold text-slate-500 mb-1">Ù…Ù„Ø§Ø­Ø¸Ø§Øª Ø§Ù„ØªÙ…Ø¯ÙŠØ¯</label>
                <textarea
                  rows={2}
                  value={extendData.notes}
                  onChange={(e) => setExtendData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Ø³Ø¨Ø¨ Ø§Ù„ØªÙ…Ø¯ÙŠØ¯ Ø£Ùˆ Ù…Ø±Ø§Ø¬Ø¹ØªÙ‡ Ù…Ù† Ø§Ù„Ø¨Ù†Ùƒ..."
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-blue-950">ØªØ±Ø­ÙŠÙ„ Ù‚ÙŠØ¯ Ø¹Ù…ÙˆÙ„Ø© Ø§Ù„ØªÙ…Ø¯ÙŠØ¯</p>
                  <p className="text-[9px] text-blue-600">Ø³ÙŠØªÙ… ØªØ±Ø­ÙŠÙ„ Ø§Ù„Ù‚ÙŠØ¯ Ø¥Ø°Ø§ ÙƒØ§Ù†Øª Ù‚ÙŠÙ…Ø© Ø¹Ù…ÙˆÙ„Ø© Ø§Ù„ØªÙ…Ø¯ÙŠØ¯ Ø£ÙƒØ¨Ø± Ù…Ù† ØµÙØ±.</p>
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
                  Ø¥Ù„ØºØ§Ø¡
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg text-sm hover:bg-blue-700 transition"
                >
                  ØªØ­Ø¯ÙŠØ« ÙˆØªÙ…Ø¯ÙŠØ¯
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
                Ø§Ø³ØªØ±Ø¯Ø§Ø¯ ÙˆØ¥Ù„ØºØ§Ø¡ Ø®Ø·Ø§Ø¨ Ø§Ù„Ø¶Ù…Ø§Ù†
              </h3>
              <button onClick={() => setShowReturnModal(false)} className="text-slate-400 hover:text-slate-600 text-xl font-bold">&times;</button>
            </div>
            
            <form onSubmit={handleReturnLg} className="p-6 space-y-4">
              <div className="bg-emerald-50/50 p-3 rounded-lg border border-emerald-100 text-xs space-y-1">
                <p><strong>Ø±Ù‚Ù… Ø§Ù„Ø®Ø·Ø§Ø¨:</strong> {selectedLg.lg_number}</p>
                <p><strong>Ø§Ù„Ù…Ø³ØªÙÙŠØ¯:</strong> {selectedLg.beneficiary}</p>
                <p><strong>Ù‚ÙŠÙ…Ø© Ø§Ù„ØºØ·Ø§Ø¡ Ø§Ù„Ù…Ø³ØªØ±Ø¯:</strong> <span className="font-bold text-emerald-700">{selectedLg.margin_amount.toLocaleString()} {currencySymbol}</span></p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">ØªØ§Ø±ÙŠØ® Ø§Ù„Ø§Ø³ØªØ±Ø¯Ø§Ø¯ ÙˆØ§Ù„Ø¥Ù„ØºØ§Ø¡ *</label>
                <input
                  type="date"
                  required
                  value={returnData.return_date}
                  onChange={(e) => setReturnData(prev => ({ ...prev, return_date: e.target.value }))}
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Ø¥ÙŠØ¯Ø§Ø¹ Ø§Ù„ØºØ·Ø§Ø¡ Ø§Ù„Ù†Ù‚Ø¯ÙŠ ÙÙŠ Ø­Ø³Ø§Ø¨ *</label>
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
                <label className="block text-xs font-bold text-slate-500 mb-1">Ù…Ù„Ø§Ø­Ø¸Ø§Øª Ø§Ù„Ø§Ø³ØªØ±Ø¯Ø§Ø¯</label>
                <textarea
                  rows={2}
                  value={returnData.notes}
                  onChange={(e) => setReturnData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Ù…Ù„Ø§Ø­Ø¸Ø§Øª Ø­ÙˆÙ„ Ø¥ØºÙ„Ø§Ù‚ Ø®Ø·Ø§Ø¨ Ø§Ù„Ø¶Ù…Ø§Ù† Ø¨Ø§Ù„Ø¨Ù†Ùƒ ÙˆØ§Ø³ØªÙ„Ø§Ù… Ø§Ù„Ø£ØµÙ„..."
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-950">ØªØ±Ø­ÙŠÙ„ Ù‚ÙŠØ¯ Ø§Ø³ØªØ±Ø¯Ø§Ø¯ Ø§Ù„ØºØ·Ø§Ø¡</p>
                  <p className="text-[9px] text-slate-600">Ø³ÙŠÙ‚ÙˆÙ… Ø§Ù„Ù†Ø¸Ø§Ù… Ø¨Ø¥Ø±Ø¬Ø§Ø¹ Ø§Ù„Ù…Ø¨Ù„Øº Ø§Ù„Ù…Ø§Ù„ÙŠ Ù„Ø­Ø³Ø§Ø¨ Ø§Ù„Ø¨Ù†Ùƒ Ø§Ù„Ù…Ø­Ø¯Ø¯ ÙˆØ¥Ù‚ÙØ§Ù„ Ø£ØµÙ„ Ø§Ù„ØºØ·Ø§Ø¡.</p>
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
                  Ø¥Ù„ØºØ§Ø¡
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-slate-600 text-white font-bold rounded-lg text-sm hover:bg-slate-700 transition"
                >
                  ØªØ£ÙƒÙŠØ¯ ÙˆØ§Ø³ØªØ±Ø¯Ø§Ø¯
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
                ØªØ³ÙŠÙŠÙ„ ÙˆÙ…ØµØ§Ø¯Ø±Ø© Ø®Ø·Ø§Ø¨ Ø§Ù„Ø¶Ù…Ø§Ù†
              </h3>
              <button onClick={() => setShowLiquidateModal(false)} className="text-rose-400 hover:text-slate-600 text-xl font-bold">&times;</button>
            </div>
            
            <form onSubmit={handleLiquidateLg} className="p-6 space-y-4">
              <div className="bg-rose-50/30 p-3 rounded-lg border border-rose-100 text-xs space-y-1">
                <p><strong>Ø±Ù‚Ù… Ø§Ù„Ø®Ø·Ø§Ø¨:</strong> {selectedLg.lg_number}</p>
                <p><strong>Ø§Ù„Ù…Ø³ØªÙÙŠØ¯ Ø§Ù„Ù…ØµØ§Ø¯Ø±:</strong> {selectedLg.beneficiary}</p>
                <p><strong>Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ù‚ÙŠÙ…Ø© Ø§Ù„Ù…Ø³ÙŠÙ„Ø©:</strong> <span className="font-bold text-rose-700">{selectedLg.amount.toLocaleString()} {currencySymbol}</span></p>
                <p className="text-[10px] text-rose-500">Ø³ÙŠØ®ØµÙ… Ø§Ù„Ø¨Ù†Ùƒ Ù‚ÙŠÙ…Ø© ØºØ·Ø§Ø¡ Ø§Ù„Ø¶Ù…Ø§Ù† Ø§Ù„Ø­Ø§Ù„ÙŠØ© ({selectedLg.margin_amount.toLocaleString()}) ÙˆÙŠØ®ØµÙ… Ø§Ù„Ù…ØªØ¨Ù‚ÙŠ ({ (selectedLg.amount - selectedLg.margin_amount).toLocaleString() }) Ù…Ù† Ø­Ø³Ø§Ø¨ÙƒÙ… Ø§Ù„Ø¬Ø§Ø±ÙŠ.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">ØªØ§Ø±ÙŠØ® Ø§Ù„ØªØ³ÙŠÙŠÙ„ Ø¨Ø§Ù„Ø¨Ù†Ùƒ *</label>
                <input
                  type="date"
                  required
                  value={liquidateData.liquidation_date}
                  onChange={(e) => setLiquidateData(prev => ({ ...prev, liquidation_date: e.target.value }))}
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">ØªØ­Ù…ÙŠÙ„ Ø®Ø³Ø§Ø¦Ø± Ø§Ù„ØªØ³ÙŠÙŠÙ„ Ø¹Ù„Ù‰ Ø­Ø³Ø§Ø¨ *</label>
                <select
                  required
                  value={liquidateData.expense_account_id}
                  onChange={(e) => setLiquidateData(prev => ({ ...prev, expense_account_id: e.target.value }))}
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="">Ø§Ø®ØªØ± Ø­Ø³Ø§Ø¨ Ø§Ù„Ø®Ø³Ø§Ø¦Ø± / Ø§Ù„ØªÙƒØ§Ù„ÙŠÙ</option>
                  {allAccounts.filter(a => a.type === 'expense').map(a => (
                    <option key={a.id} value={a.id}>({a.code}) - {a.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Ù…Ù„Ø§Ø­Ø¸Ø§Øª Ø§Ù„ØªØ³ÙŠÙŠÙ„ ÙˆØ§Ù„Ù…Ø·Ø§Ù„Ø¨Ø©</label>
                <textarea
                  rows={2}
                  value={liquidateData.notes}
                  onChange={(e) => setLiquidateData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Ù…Ù„Ø§Ø­Ø¸Ø§Øª Ø­ÙˆÙ„ Ø£Ø³Ø¨Ø§Ø¨ Ù…Ø·Ø§Ù„Ø¨Ø© Ø§Ù„ØªØ³ÙŠÙŠÙ„ ÙˆØ§Ù„Ø¥Ø®ÙØ§Ù‚..."
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="bg-rose-50/50 p-3 rounded-lg border border-rose-100 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-rose-950">ØªØ±Ø­ÙŠÙ„ Ù‚ÙŠØ¯ Ø®Ø³Ø§Ø¦Ø± Ø§Ù„ØªØ³ÙŠÙŠÙ„</p>
                  <p className="text-[9px] text-rose-600">Ø³ÙŠÙ‚ÙˆÙ… Ø§Ù„Ù†Ø¸Ø§Ù… Ø¨ØªØ­Ù…ÙŠÙ„ Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ù…Ø¨Ù„Øº ÙƒØ®Ø³Ø§Ø±Ø© ÙˆØ¥Ù‚ÙØ§Ù„ Ø§Ù„ØºØ·Ø§Ø¡ ÙˆØ§Ù„Ø®ØµÙ… Ù…Ù† Ø§Ù„Ø¨Ù†Ùƒ Ø§Ù„Ù…ØµØ¯Ø±.</p>
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
                  Ø¥Ù„ØºØ§Ø¡
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-rose-600 text-white font-bold rounded-lg text-sm hover:bg-rose-700 transition"
                >
                  ØªØ£ÙƒÙŠØ¯ ÙˆØªØ³ÙŠÙŠÙ„ Ø§Ù„Ø®Ø·Ø§Ø¨
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
