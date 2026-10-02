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
    treasuryId: '', // Ø§Ù„Ø®Ø²ÙŠÙ†Ø© Ø§Ù„ØªÙŠ Ø³ÙŠØªÙ… Ø§Ù„ØµØ±Ù Ù…Ù†Ù‡Ø§
    notes: ''
  });

  // ðŸ›¡ï¸ Ø¹Ø²Ù„ Ù†Ø·Ø§Ù‚ Ø§Ù„Ø¥Ø´Ø±Ø§Ù Ù„Ù„Ù…ÙˆØ§Ø±Ø¯ Ø§Ù„Ø¨Ø´Ø±ÙŠØ© (Factory vs Branches vs All)
  const userHrScope = currentUser?.hr_scope || (currentUser as any)?.user_metadata?.hr_scope || 'all';

  const isFactoryDept = (dept: Record<string, any>) => {
    const d = String(dept || '').trim().toLowerCase();
    return d === 'Ø§Ù„Ù…ØµÙ†Ø¹' || d === 'Ù…ØµÙ†Ø¹' || d === 'factory';
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id;

      if (!userOrgId) return;

      // 1. Ø¬Ù„Ø¨ Ø§Ù„Ø³Ù„Ù Ù…Ø¹ ØªÙØ§ØµÙŠÙ„ Ø§Ù„Ù…ÙˆØ¸Ù
      const { data: advData } = await supabase
        .from('employee_advances')
        .select('*, employees(full_name, department, position, basic_salary)')
        .eq('organization_id', userOrgId)
        .order('created_at', { ascending: false });
      if (advData) setAdvances(advData);

      // 2. Ø¬Ù„Ø¨ Ø§Ù„Ù…ÙˆØ¸ÙÙŠÙ† Ù…Ø¹ ÙƒØ§ÙØ© Ø§Ù„Ø­Ù‚ÙˆÙ„ Ø§Ù„ØªÙØµÙŠÙ„ÙŠØ©
      const { data: empData } = await supabase
        .from('employees')
        .select('id, full_name, name, position, department, basic_salary, phone, status, deleted_at')
        .eq('organization_id', userOrgId)
        .is('deleted_at', null)
        .order('full_name');

      if (empData) {
        // ÙÙ„ØªØ±Ø© Ø§Ù„Ù…ÙˆØ¸ÙÙŠÙ† Ø§Ù„Ù†Ø´Ø·ÙŠÙ† Ù…Ø¹ ØªØ·Ø¨ÙŠÙ‚ Ù†Ø·Ø§Ù‚ Ø§Ù„Ø¥Ø´Ø±Ø§Ù
        let filtered = empData.filter(e => !e.status || e.status === 'active');
        if (userHrScope === 'factory') {
          filtered = filtered.filter(e => isFactoryDept(e.department));
        } else if (userHrScope === 'branches') {
          filtered = filtered.filter(e => !isFactoryDept(e.department));
        }
        setEmployees(filtered);
      }

      // 3. Ø¬Ù„Ø¨ Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ø®Ø²ÙŠÙ†Ø© ÙˆØ§Ù„Ø¨Ù†ÙˆÙƒ
      const { data: accData } = await supabase
        .from('accounts')
        .select('id, name, code')
        .eq('organization_id', userOrgId);
      
      if (accData) {
        const treasuries = accData.filter(a => 
          (a.code && (a.code.startsWith('123') || a.code.startsWith('101') || a.code.startsWith('121'))) ||
          (a.name && (a.name.includes('ØµÙ†Ø¯ÙˆÙ‚') || a.name.includes('Ø®Ø²ÙŠÙ†Ø©') || a.name.includes('Ø®Ø²ÙŠÙ†Ù‡') || a.name.includes('Ø¨Ù†Ùƒ') || a.name.includes('Ø¹Ù‡Ø¯Ø©')))
        );
        const finalTreasuries = treasuries.length > 0 ? treasuries : accData;
        setTreasuryAccounts(finalTreasuries);
        // ØªØ¹ÙŠÙŠÙ† Ø§Ù„Ø®Ø²ÙŠÙ†Ø© Ø§Ù„Ø§ÙØªØ±Ø§Ø¶ÙŠØ© Ø¥Ø°Ø§ Ù„Ù… ØªÙƒÙ† Ù…Ø­Ø¯Ø¯Ø©
        if (finalTreasuries.length > 0 && !formData.treasuryId) {
          setFormData(prev => ({ ...prev, treasuryId: prev.treasuryId || finalTreasuries[0].id }));
        }
      }

    } catch (error) {
      logger.error(error);
      showToast('Ø®Ø·Ø£ ÙÙŠ Ø¬Ù„Ø¨ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ðŸ’¡ Ø¥Ø«Ø±Ø§Ø¡ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…ÙˆØ¸ÙÙŠÙ† Ø¨Ø¥Ø­ØµØ§Ø¦ÙŠØ§Øª Ø§Ù„Ø³Ù„Ù Ø§Ù„Ø°ÙƒÙŠØ© Ø§Ù„ÙÙˆØ±ÙŠØ©
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

      // Ø§Ù„Ø³Ù„Ù Ø§Ù„Ù‚Ø§Ø¦Ù…Ø© ØºÙŠØ± Ø§Ù„Ù…Ø³ÙˆØ§Ø© (ØªÙ… ØµØ±ÙÙ‡Ø§ ÙˆÙ„Ù… ØªØ®ØµÙ… Ø¨Ø¹Ø¯ ÙÙŠ Ù…Ø³ÙŠØ± Ø§Ù„Ø±ÙˆØ§ØªØ¨)
      if (adv.status === 'paid' && !adv.payroll_item_id) {
        advancesByEmp[empId].outstanding += amt;
        advancesByEmp[empId].count += 1;
      }

      // Ø³Ù„Ù Ø§Ù„Ø´Ù‡Ø± Ø§Ù„Ø­Ø§Ù„ÙŠ
      const dStr = adv.request_date || adv.advance_date || adv.created_at;
      if (dStr) {
        const d = new Date(dStr);
        if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
          advancesByEmp[empId].monthTotal += amt;
        }
      }

      // Ø¢Ø®Ø± Ø³Ù„ÙØ© Ù…Ù†ØµØ±ÙØ©
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

  // Ø§Ù„Ù…ÙˆØ¸Ù Ø§Ù„Ù…Ø®ØªØ§Ø± Ø­Ø§Ù„ÙŠØ§Ù‹ Ù…Ø¹ ÙƒØ§ÙØ© Ø¨ÙŠØ§Ù†Ø§ØªÙ‡ Ø§Ù„Ø°ÙƒÙŠØ©
  const selectedEmployee = useMemo(() => {
    return enrichedEmployees.find(e => e.id === formData.employeeId);
  }, [enrichedEmployees, formData.employeeId]);

  // Ø­Ø³Ø§Ø¨ Ø§Ù„Ù†Ø³Ø¨Ø© Ø§Ù„Ù…Ø¦ÙˆÙŠØ© Ù„Ù„Ø³Ù„ÙØ© Ù…Ù† Ø§Ù„Ø±Ø§ØªØ¨ Ø§Ù„Ø£Ø³Ø§Ø³ÙŠ
  const advancePercentage = useMemo(() => {
    if (!selectedEmployee || !selectedEmployee.basic_salary || selectedEmployee.basic_salary <= 0 || !formData.amount) {
      return 0;
    }
    return Math.round((formData.amount / selectedEmployee.basic_salary) * 100);
  }, [selectedEmployee, formData.amount]);

  // ØªØ¹ÙŠÙŠÙ† Ù…Ø¨Ù„Øº Ø³Ø±ÙŠØ¹ Ø¨Ù†Ø³Ø¨Ø© Ù…Ø¦ÙˆÙŠØ©
  const setQuickPercentage = (percent: number) => {
    if (!selectedEmployee?.basic_salary) return;
    const calcAmount = Math.round((selectedEmployee.basic_salary * percent) / 100);
    setFormData(prev => ({ ...prev, amount: calcAmount }));
  };

  // ØªØ¹ÙŠÙŠÙ† Ù…Ø¨Ù„Øº Ù…Ù‚Ø·ÙˆØ¹ Ø³Ø±ÙŠØ¹
  const setQuickAmount = (amt: number) => {
    setFormData(prev => ({ ...prev, amount: amt }));
  };

  // Ø®Ø±ÙŠØ·Ø© Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª Ù„Ø±Ø¨Ø· Ø§Ù„Ø³Ù„Ù Ø¨Ø§Ø³Ù… Ø§Ù„Ø®Ø²ÙŠÙ†Ø© Ø¨Ø¯Ù‚Ø©
  const accountsMap = useMemo(() => {
    const map: Record<string, string> = {};
    (accounts || []).forEach(a => { if (a?.id) map[a.id] = a.name; });
    (treasuryAccounts || []).forEach(a => { if (a?.id) map[a.id] = a.name; });
    return map;
  }, [accounts, treasuryAccounts]);

  // Ø¯Ø§Ù„Ø© ØªØ­Ø¯ÙŠØ¯ Ø§Ø³Ù… Ø§Ù„Ø®Ø²ÙŠÙ†Ø© Ù„Ù„Ø³Ù„ÙØ©
  const getAdvanceTreasuryName = (adv: Record<string, any>): string => {
    if (adv.treasury_account_id && accountsMap[adv.treasury_account_id]) {
      return accountsMap[adv.treasury_account_id];
    }
    if (adv.treasury_account?.name) {
      return adv.treasury_account.name;
    }
    // Ø§Ø³ØªØ¯Ù„Ø§Ù„ Ø°ÙƒÙŠ Ù…Ù† Ù‚Ø³Ù… Ø§Ù„Ù…ÙˆØ¸Ù ÙÙŠ Ø­Ø§Ù„ ÙƒØ§Ù†Øª Ø³Ù„ÙØ© Ø³Ø§Ø¨Ù‚Ø© Ù„Ù… ÙŠØ³Ø¬Ù„ ÙÙŠÙ‡Ø§ Ø§Ù„Ø®Ø²ÙŠÙ†Ø©
    const dept = adv.employees?.department || '';
    if (dept.includes('Ù…ØµÙ†Ø¹') || dept.includes('Ø§Ù„Ù…ØµÙ†Ø¹')) {
      const factoryTreasury = treasuryAccounts.find(t => t.name.includes('Ù…ØµÙ†Ø¹') || t.name.includes('Ø§Ù„Ù…ØµÙ†Ø¹'));
      if (factoryTreasury) return factoryTreasury.name;
    }
    const defaultTreasury = treasuryAccounts[0]?.name || accounts?.find(a => a.name.includes('Ø®Ø²ÙŠÙ†Ø©') || a.name.includes('ØµÙ†Ø¯ÙˆÙ‚'))?.name;
    return defaultTreasury || 'Ø§Ù„Ø®Ø²ÙŠÙ†Ø© Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠØ©';
  };

  // ØªØµÙÙŠØ© Ø§Ù„Ø³Ù„Ù Ø¨Ù†Ø§Ø¡Ù‹ Ø¹Ù„Ù‰ Ø§Ù„Ø¨Ø­Ø« ÙˆØ­Ø§Ù„Ø© Ø§Ù„Ø³Ù„ÙØ© ÙˆØ§Ù„Ø®Ø²ÙŠÙ†Ø©
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

  // ØªØµØ¯ÙŠØ± Ø³Ø¬Ù„ Ø§Ù„Ø³Ù„Ù Ø¥Ù„Ù‰ Ù…Ù„Ù Excel Ù…Ù†Ø³Ù‚ ÙˆØ§Ø­ØªØ±Ø§ÙÙŠ
  const handleExportExcel = () => {
    if (filteredAdvances.length === 0) {
      showToast('Ù„Ø§ ØªÙˆØ¬Ø¯ Ø³Ù„Ù Ù…Ø·Ø§Ø¨Ù‚Ø© Ù„Ù„ØªØµØ¯ÙŠØ±', 'warning');
      return;
    }

    const rows = filteredAdvances.map((adv, idx) => {
      const emp = adv.employees;
      const statusLabel = adv.status === 'paid' ? 'ØªÙ… Ø§Ù„ØµØ±Ù (Ù‚Ø§Ø¦Ù…Ø©)' : adv.status === 'deducted' ? 'ØªÙ… Ø§Ù„Ø®ØµÙ… Ù…Ù† Ø§Ù„Ø±Ø§ØªØ¨' : adv.status || '-';
      const treasuryName = getAdvanceTreasuryName(adv);
      return {
        'Ù…': idx + 1,
        'Ø§Ø³Ù… Ø§Ù„Ù…ÙˆØ¸Ù': emp?.full_name || 'Ù…ÙˆØ¸Ù ØºÙŠØ± Ù…Ø¹Ø±Ù',
        'Ø§Ù„Ù‚Ø³Ù… / Ø§Ù„ÙØ±Ø¹': emp?.department || '-',
        'Ø§Ù„Ù…Ø³Ù…Ù‰ Ø§Ù„ÙˆØ¸ÙŠÙÙŠ': emp?.position || '-',
        'Ø§Ù„Ø±Ø§ØªØ¨ Ø§Ù„Ø£Ø³Ø§Ø³ÙŠ (Ø¬.Ù…)': Number(emp?.basic_salary) || 0,
        'Ù…Ø¨Ù„Øº Ø§Ù„Ø³Ù„ÙØ© (Ø¬.Ù…)': Number(adv.amount) || 0,
        'Ø§Ù„Ø®Ø²ÙŠÙ†Ø© Ø§Ù„Ù…Ù†ØµØ±Ù Ù…Ù†Ù‡Ø§': treasuryName,
        'ØªØ§Ø±ÙŠØ® Ø§Ù„Ø³Ù„ÙØ©': adv.request_date || adv.advance_date || adv.created_at?.split('T')[0] || '-',
        'Ø­Ø§Ù„Ø© Ø§Ù„Ø³Ù„ÙØ©': statusLabel,
        'Ù…Ù„Ø§Ø­Ø¸Ø§Øª / Ø§Ù„Ø¨ÙŠØ§Ù†': adv.notes || '-'
      };
    });

    // Ø¥Ø¶Ø§ÙØ© ØµÙ Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ ÙÙŠ Ù†Ù‡Ø§ÙŠØ© Ø§Ù„Ø´ÙŠØª
    const totalAmount = filteredAdvances.reduce((sum, adv) => sum + Number(adv.amount || 0), 0);
    rows.push({
      'Ù…': '' as any,
      'Ø§Ø³Ù… Ø§Ù„Ù…ÙˆØ¸Ù': 'Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø¹Ø§Ù… Ù„Ù„Ø³Ù„Ù Ø§Ù„Ù…Ø­Ø¯Ø¯Ø©',
      'Ø§Ù„Ù‚Ø³Ù… / Ø§Ù„ÙØ±Ø¹': '',
      'Ø§Ù„Ù…Ø³Ù…Ù‰ Ø§Ù„ÙˆØ¸ÙŠÙÙŠ': '',
      'Ø§Ù„Ø±Ø§ØªØ¨ Ø§Ù„Ø£Ø³Ø§Ø³ÙŠ (Ø¬.Ù…)': '' as any,
      'Ù…Ø¨Ù„Øº Ø§Ù„Ø³Ù„ÙØ© (Ø¬.Ù…)': totalAmount,
      'Ø§Ù„Ø®Ø²ÙŠÙ†Ø© Ø§Ù„Ù…Ù†ØµØ±Ù Ù…Ù†Ù‡Ø§': '',
      'ØªØ§Ø±ÙŠØ® Ø§Ù„Ø³Ù„ÙØ©': '',
      'Ø­Ø§Ù„Ø© Ø§Ù„Ø³Ù„ÙØ©': `Ø¹Ø¯Ø¯ Ø§Ù„Ø³Ù„Ù: ${filteredAdvances.length}`,
      'Ù…Ù„Ø§Ø­Ø¸Ø§Øª / Ø§Ù„Ø¨ÙŠØ§Ù†': ''
    });

    const ws = XLSX.utils.json_to_sheet(rows);

    ws['!cols'] = [
      { wch: 6 },  // Ù…
      { wch: 25 }, // Ø§Ø³Ù… Ø§Ù„Ù…ÙˆØ¸Ù
      { wch: 18 }, // Ø§Ù„Ù‚Ø³Ù…
      { wch: 18 }, // Ø§Ù„Ù…Ø³Ù…Ù‰ Ø§Ù„ÙˆØ¸ÙŠÙÙŠ
      { wch: 18 }, // Ø§Ù„Ø±Ø§ØªØ¨ Ø§Ù„Ø£Ø³Ø§Ø³ÙŠ
      { wch: 18 }, // Ù…Ø¨Ù„Øº Ø§Ù„Ø³Ù„ÙØ©
      { wch: 22 }, // Ø§Ù„Ø®Ø²ÙŠÙ†Ø© Ø§Ù„Ù…Ù†ØµØ±Ù Ù…Ù†Ù‡Ø§
      { wch: 16 }, // ØªØ§Ø±ÙŠØ® Ø§Ù„Ø³Ù„ÙØ©
      { wch: 20 }, // Ø­Ø§Ù„Ø© Ø§Ù„Ø³Ù„ÙØ©
      { wch: 30 }  // Ù…Ù„Ø§Ø­Ø¸Ø§Øª
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ø³Ù„Ù Ø§Ù„Ù…ÙˆØ¸ÙÙŠÙ†');
    XLSX.writeFile(wb, `Ø³Ø¬Ù„_Ø³Ù„Ù_Ø§Ù„Ù…ÙˆØ¸ÙÙŠÙ†_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast(`ØªÙ… ØªØµØ¯ÙŠØ± ${filteredAdvances.length} Ø³Ù„ÙØ© Ø¥Ù„Ù‰ Excel Ø¨Ù†Ø¬Ø§Ø­ âœ…`, 'success');
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
      showToast('ÙŠØ±Ø¬Ù‰ Ø§Ø®ØªÙŠØ§Ø± Ø§Ù„Ù…ÙˆØ¸Ù Ø£ÙˆÙ„Ø§Ù‹', 'warning');
      return;
    }

    if (!formData.amount || formData.amount <= 0) {
      showToast('Ù…Ø¨Ù„Øº Ø§Ù„Ø³Ù„ÙØ© ÙŠØ¬Ø¨ Ø£Ù† ÙŠÙƒÙˆÙ† Ø£ÙƒØ¨Ø± Ù…Ù† 0', 'warning');
      return;
    }

    if (!formData.treasuryId) {
      showToast('ÙŠØ±Ø¬Ù‰ ØªØ­Ø¯ÙŠØ¯ Ø­Ø³Ø§Ø¨ Ø§Ù„Ø®Ø²ÙŠÙ†Ø© Ø£Ùˆ Ø§Ù„Ø¨Ù†Ùƒ Ù„Ù„ØµØ±Ù Ù…Ù†Ù‡', 'warning');
      return;
    }

    // Ø§Ù„ØªØ­Ù‚Ù‚ Ø¨ÙˆØ§Ø³Ø·Ø© Ø§Ù„Ù…Ø®Ø·Ø· Ø§Ù„Ù…Ø±ÙƒØ²ÙŠ
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
      if (!orgId && currentUser?.role !== 'super_admin') throw new Error('ØªØ¹Ø°Ø± ØªØ­Ø¯ÙŠØ¯ Ø§Ù„Ù…Ù†Ø¸Ù…Ø©.');

      const employee = employees.find(e => e.id === formData.employeeId);
      const reference = `ADV-${Date.now().toString().slice(-6)}`;

      // 1. Ø­ÙØ¸ Ø§Ù„Ø³Ù„ÙØ©
      const { error: advError } = await supabase.from('employee_advances').insert({
        organization_id: orgId,
        employee_id: formData.employeeId,
        amount: formData.amount,
        request_date: formData.date,
        status: 'paid', // Ù†Ø¹ØªØ¨Ø±Ù‡Ø§ Ù…Ø¯ÙÙˆØ¹Ø© ÙÙˆØ±Ø§Ù‹ Ù„Ù„ØªØ¨Ø³ÙŠØ·
        notes: formData.notes,
        treasury_account_id: formData.treasuryId, // Ø­ÙØ¸ Ø­Ø³Ø§Ø¨ Ø§Ù„Ø®Ø²ÙŠÙ†Ø©
        reference: reference // Ø­ÙØ¸ Ø§Ù„Ù…Ø±Ø¬Ø¹
      });

      if (advError) throw advError;

      // 2. Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ù‚ÙŠØ¯ Ø§Ù„Ù…Ø­Ø§Ø³Ø¨ÙŠ
      // Ù…Ù† Ø­/ Ø³Ù„Ù Ø§Ù„Ø¹Ø§Ù…Ù„ÙŠÙ† (1223)
      // Ø¥Ù„Ù‰ Ø­/ Ø§Ù„Ø®Ø²ÙŠÙ†Ø© Ø£Ùˆ Ø§Ù„Ø¨Ù†Ùƒ
      const advancesAcc = getSystemAccount('EMPLOYEE_ADVANCES') || accounts.find(a => a.code === '1223');

      if (advancesAcc) {
        await addEntry({
          date: formData.date,
          description: `ØµØ±Ù Ø³Ù„ÙØ© Ù„Ù„Ù…ÙˆØ¸Ù ${employee?.full_name}`,
          reference: reference,
          status: 'posted',
          lines: [
            { account_id: advancesAcc.id, accountId: advancesAcc.id, debit: formData.amount, credit: 0, description: `Ø³Ù„ÙØ© Ù…ÙˆØ¸Ù - ${employee?.full_name}` },
            { account_id: formData.treasuryId, accountId: formData.treasuryId, debit: 0, credit: formData.amount, description: `ØµØ±Ù Ù†Ù‚Ø¯ÙŠØ© Ù„Ø³Ù„ÙØ©` }
          ]
        });
      } else {
        showToast('ØªÙ†Ø¨ÙŠÙ‡: ØªÙ… Ø­ÙØ¸ Ø§Ù„Ø³Ù„ÙØ© ÙˆÙ„ÙƒÙ† Ù„Ù… ÙŠØªÙ… Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ù‚ÙŠØ¯ Ù„Ø¹Ø¯Ù… Ø§Ù„Ø¹Ø«ÙˆØ± Ø¹Ù„Ù‰ Ø­Ø³Ø§Ø¨ "Ø³Ù„Ù Ø§Ù„Ù…ÙˆØ¸ÙÙŠÙ†" (1223).', 'warning');
      }
      
      showToast('ØªÙ… Ø­ÙØ¸ Ø§Ù„Ø³Ù„ÙØ© ÙˆØªØ±Ø­ÙŠÙ„ Ø§Ù„Ù‚ÙŠØ¯ Ø¨Ù†Ø¬Ø§Ø­ âœ…', 'success');
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
      showToast('Ø­Ø¯Ø« Ø®Ø·Ø£: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Ø­Ù…Ø§ÙŠØ© Ø§Ù„ØµÙØ­Ø© Ù…Ù† Ù…Ø³ØªØ®Ø¯Ù… Ø§Ù„Ø¯ÙŠÙ…Ùˆ
  if (currentUser?.role === 'demo') {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-slate-500 bg-white rounded-3xl border border-slate-200 shadow-sm">
        <Banknote size={64} className="mb-4 text-slate-300" />
        <h2 className="text-xl font-bold text-slate-700">Ø³Ù„Ù Ø§Ù„Ù…ÙˆØ¸ÙÙŠÙ† ØºÙŠØ± Ù…ØªØ§Ø­Ø©</h2>
        <p className="text-sm mt-2">Ù„Ø§ ÙŠÙ…ÙƒÙ† Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ø³Ù„Ù ÙˆØ§Ù„Ù‚Ø±ÙˆØ¶ ÙÙŠ Ø§Ù„Ù†Ø³Ø®Ø© Ø§Ù„ØªØ¬Ø±ÙŠØ¨ÙŠØ©.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in" dir="rtl">
      {/* Ø§Ù„ØªØ±ÙˆÙŠØ³Ø© Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠØ© */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Banknote className="text-blue-600" /> Ø³Ù„Ù Ø§Ù„Ù…ÙˆØ¸ÙÙŠÙ†
          </h2>
          <p className="text-slate-500 text-sm mt-0.5">
            Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ø³Ù„Ù Ø§Ù„Ø´Ø®ØµÙŠØ©ØŒ ØµØ±Ù Ø§Ù„Ù†Ù‚Ø¯ÙŠØ©ØŒ ÙˆØ§Ù„Ù…ØªØ§Ø¨Ø¹Ø© ÙˆØ§Ù„Ø®ØµÙ… Ù…Ù† Ø§Ù„Ø±ÙˆØ§ØªØ¨
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button 
            onClick={handleExportExcel}
            className="bg-emerald-600 text-white px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-emerald-700 shadow-sm active:scale-95 transition-all"
            title="ØªØµØ¯ÙŠØ± Ø§Ù„Ø³Ù„Ù Ø¥Ù„Ù‰ Ù…Ù„Ù Excel"
          >
            <FileSpreadsheet size={17} />
            <span>ØªØµØ¯ÙŠØ± Excel</span>
          </button>
          <button 
            onClick={handleOpenModal} 
            className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-blue-700 shadow-sm active:scale-95 transition-all"
          >
            <Plus size={18} /> ØªØ³Ø¬ÙŠÙ„ Ø³Ù„ÙØ© Ø¬Ø¯ÙŠØ¯Ø©
          </button>
        </div>
      </div>

      {/* Ø´Ø±ÙŠØ· Ø§Ù„Ø¨Ø­Ø« ÙˆÙÙ„ØªØ±Ø© Ø§Ù„Ø­Ø§Ù„Ø© ÙˆØ§Ù„Ø®Ø²ÙŠÙ†Ø© */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Ø§Ù„Ø¨Ø­Ø« Ø¨Ø§Ø³Ù… Ø§Ù„Ù…ÙˆØ¸ÙØŒ Ø§Ù„Ù‚Ø³Ù…ØŒ Ø§Ù„Ø®Ø²ÙŠÙ†Ø©ØŒ Ø§Ù„ÙˆØ¸ÙŠÙØ©ØŒ Ø£Ùˆ Ø§Ù„Ù…Ù„Ø§Ø­Ø¸Ø§Øª..."
            className="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
          />
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
          {/* ÙÙ„ØªØ± Ø§Ù„Ø®Ø²ÙŠÙ†Ø© Ø§Ù„Ù…Ù†ØµØ±Ù Ù…Ù†Ù‡Ø§ */}
          {treasuryAccounts.length > 0 && (
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-bold text-slate-700">
              <Wallet size={14} className="text-slate-500 mr-1.5 shrink-0" />
              <select
                value={treasuryFilter}
                onChange={e => setTreasuryFilter(e.target.value)}
                className="bg-transparent outline-none text-xs font-bold text-slate-700 cursor-pointer pr-1"
              >
                <option value="all">ÙƒØ§ÙØ© Ø§Ù„Ø®Ø²Ù† ({advances.length})</option>
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

          {/* Ø£Ø²Ø±Ø§Ø± ÙÙ„ØªØ±Ø© Ø§Ù„Ø­Ø§Ù„Ø© */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold text-slate-600 w-full md:w-auto justify-center">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition-all ${statusFilter === 'all' ? 'bg-white text-blue-600 shadow-xs font-black' : 'hover:text-slate-800'}`}
            >
              Ø§Ù„ÙƒÙ„ ({advances.length})
            </button>
            <button
              onClick={() => setStatusFilter('paid')}
              className={`px-3 py-1.5 rounded-lg transition-all ${statusFilter === 'paid' ? 'bg-white text-emerald-600 shadow-xs font-black' : 'hover:text-slate-800'}`}
            >
              Ù‚Ø§Ø¦Ù…Ø© ({advances.filter(a => a.status === 'paid').length})
            </button>
            <button
              onClick={() => setStatusFilter('deducted')}
              className={`px-3 py-1.5 rounded-lg transition-all ${statusFilter === 'deducted' ? 'bg-white text-blue-700 shadow-xs font-black' : 'hover:text-slate-800'}`}
            >
              Ù…Ø®ØµÙˆÙ…Ø© ({advances.filter(a => a.status === 'deducted').length})
            </button>
          </div>
        </div>
      </div>

      {/* Ø¬Ø¯ÙˆÙ„ Ø§Ù„Ø³Ù„Ù Ø§Ù„Ù…Ø³Ø¬Ù„Ø© */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-slate-50 text-slate-600 font-bold text-xs uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="p-4">Ø§Ù„Ù…ÙˆØ¸Ù</th>
                <th className="p-4">Ø§Ù„Ù‚Ø³Ù… / Ø§Ù„ÙˆØ¸ÙŠÙØ©</th>
                <th className="p-4">ØªØ§Ø±ÙŠØ® Ø§Ù„Ø·Ù„Ø¨</th>
                <th className="p-4">Ø§Ù„Ù…Ø¨Ù„Øº</th>
                <th className="p-4">Ø§Ù„Ø®Ø²ÙŠÙ†Ø© Ø§Ù„Ù…Ù†ØµØ±Ù Ù…Ù†Ù‡Ø§</th>
                <th className="p-4">Ø§Ù„Ø­Ø§Ù„Ø©</th>
                <th className="p-4">Ù…Ù„Ø§Ø­Ø¸Ø§Øª</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredAdvances.map(adv => (
                <tr key={adv.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-4">
                    <div className="font-bold text-slate-800 flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">
                        {(adv.employees?.full_name || 'Ù…')[0]}
                      </div>
                      <span>{adv.employees?.full_name || 'Ù…ÙˆØ¸Ù ØºÙŠØ± Ù…Ø¹Ø±Ù'}</span>
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
                    {Number(adv.amount).toLocaleString()} Ø¬.Ù…
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
                      {adv.status === 'paid' ? 'ØªÙ… Ø§Ù„ØµØ±Ù (Ù‚Ø§Ø¦Ù…Ø©)' : adv.status === 'deducted' ? 'ØªÙ… Ø§Ù„Ø®ØµÙ… Ù…Ù† Ø§Ù„Ø±Ø§ØªØ¨' : adv.status}
                    </span>
                  </td>
                  <td className="p-4 text-slate-500 text-xs max-w-xs truncate">{adv.notes || '-'}</td>
                </tr>
              ))}
              {filteredAdvances.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-400">
                    <Banknote size={40} className="mx-auto mb-2 text-slate-300" />
                    <p className="font-bold">Ù„Ø§ ØªÙˆØ¬Ø¯ Ø³Ù„Ù Ù…Ø·Ø§Ø¨Ù‚Ø© Ù„Ù„Ø¨Ø­Ø« Ø£Ùˆ Ø§Ù„ØªØµÙÙŠØ© Ø§Ù„Ø­Ø§Ù„ÙŠØ©</p>
                    <p className="text-xs text-slate-400 mt-1">Ø¬Ø±Ù‘Ø¨ ØªØºÙŠÙŠØ± Ø¹Ø¨Ø§Ø±Ø© Ø§Ù„Ø¨Ø­Ø« Ø£Ùˆ Ø§Ø®ØªÙŠØ§Ø± Ø®Ø²ÙŠÙ†Ø© Ø£Ùˆ Ø­Ø§Ù„Ø© Ø³Ù„Ù Ù…Ø®ØªÙ„ÙØ©</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ù…ÙˆØ¯Ø§Ù„ ØªØ³Ø¬ÙŠÙ„ Ø³Ù„ÙØ© Ø¬Ø¯ÙŠØ¯Ø© ÙØ§Ø¦Ù‚ Ø§Ù„Ø°ÙƒØ§Ø¡ ÙˆØ§Ù„Ø³Ø±Ø¹Ø© */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col">
            
            {/* Ø±Ø£Ø³ Ø§Ù„Ù…ÙˆØ¯Ø§Ù„ */}
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
                  <Banknote size={22} />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-800">ØªØ³Ø¬ÙŠÙ„ Ø³Ù„ÙØ© Ø¬Ø¯ÙŠØ¯Ø©</h3>
                  <p className="text-xs text-slate-400">Ø§Ø®ØªÙŠØ§Ø± Ø°ÙƒÙŠ Ù„Ù„Ù…ÙˆØ¸Ù Ù…Ø¹ ÙØ­Øµ Ø§Ù„Ø±ØµÙŠØ¯ ÙˆØ§Ù„Ø±Ø§ØªØ¨</p>
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

            {/* Ù…Ø­ØªÙˆÙ‰ Ø§Ù„Ù†Ù…ÙˆØ°Ø¬ */}
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-4">
              
              {/* 1. Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ù…ÙˆØ¸ÙÙŠÙ† Ø§Ù„Ø°ÙƒÙŠØ© ÙˆØ§Ù„Ø³Ø±ÙŠØ¹Ø© */}
              <EmployeeSearchSelect
                label="Ø§Ù„Ù…ÙˆØ¸Ù Ø§Ù„Ù…Ø³ØªÙÙŠØ¯"
                value={formData.employeeId}
                onChange={(empId) => {
                  setFormData(prev => ({ ...prev, employeeId: empId }));
                }}
                employees={enrichedEmployees}
                required
                autoFocus
                placeholder="Ø§Ø¨Ø­Ø« Ø¨Ø§Ù„Ø§Ø³Ù…ØŒ Ø§Ù„Ù‚Ø³Ù…ØŒ Ø§Ù„ÙˆØ¸ÙŠÙØ©ØŒ Ø£Ùˆ Ø§Ù„Ù‡Ø§ØªÙ..."
              />

              {/* 2. Ø¨Ø·Ø§Ù‚Ø© Ù…Ø¹Ù„ÙˆÙ…Ø§Øª ÙˆÙ…Ø¤Ø´Ø±Ø§Øª Ø§Ù„Ù…ÙˆØ¸Ù Ø§Ù„Ù…Ø§Ù„ÙŠØ© Ø§Ù„Ø°ÙƒÙŠØ© (ØªØ¸Ù‡Ø± ÙÙˆØ± Ø§Ø®ØªÙŠØ§Ø± Ø§Ù„Ù…ÙˆØ¸Ù) */}
              {selectedEmployee && (
                <div className="bg-gradient-to-br from-slate-50 to-blue-50/30 border border-blue-100 rounded-2xl p-4 space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between pb-2 border-b border-blue-100/60">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-xs">
                        {(selectedEmployee.full_name || 'Ù…')[0]}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-800">{selectedEmployee.full_name}</div>
                        <div className="text-xs text-slate-500 flex items-center gap-2">
                          {selectedEmployee.department && <span>{selectedEmployee.department}</span>}
                          {selectedEmployee.department && selectedEmployee.position && <span>â€¢</span>}
                          {selectedEmployee.position && <span>{selectedEmployee.position}</span>}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center gap-1">
                      <UserCheck size={12} /> Ù…ÙˆØ¸Ù Ù†Ø´Ø·
                    </span>
                  </div>

                  {/* Ø´Ø¨ÙƒØ© Ø§Ù„Ù…Ø¤Ø´Ø±Ø§Øª Ø§Ù„Ù…Ø§Ù„ÙŠØ© Ø§Ù„ÙÙˆØ±ÙŠØ© */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-white p-2.5 rounded-xl border border-slate-100 shadow-2xs">
                      <div className="text-[11px] text-slate-500 font-medium mb-0.5">Ø§Ù„Ø±Ø§ØªØ¨ Ø§Ù„Ø£Ø³Ø§Ø³ÙŠ</div>
                      <div className="text-sm font-bold text-emerald-700">
                        {(selectedEmployee.basic_salary ?? 0) > 0 
                          ? `${Number(selectedEmployee.basic_salary).toLocaleString()} Ø¬.Ù…` 
                          : 'ØºÙŠØ± Ù…Ø³Ø¬Ù„'}
                      </div>
                    </div>

                    <div className="bg-white p-2.5 rounded-xl border border-slate-100 shadow-2xs">
                      <div className="text-[11px] text-slate-500 font-medium mb-0.5">Ø³Ù„Ù Ù‚Ø§Ø¦Ù…Ø© ØºÙŠØ± Ù…Ø³ÙˆØ§Ø©</div>
                      <div className={`text-sm font-bold ${
                        (selectedEmployee.outstanding_advances ?? 0) > 0 ? 'text-amber-600' : 'text-slate-600'
                      }`}>
                        {Number(selectedEmployee.outstanding_advances ?? 0).toLocaleString()} Ø¬.Ù…
                      </div>
                    </div>

                    <div className="bg-white p-2.5 rounded-xl border border-slate-100 shadow-2xs">
                      <div className="text-[11px] text-slate-500 font-medium mb-0.5">Ø³Ù„Ù Ù‡Ø°Ø§ Ø§Ù„Ø´Ù‡Ø±</div>
                      <div className="text-sm font-bold text-blue-600">
                        {Number(selectedEmployee.month_advances ?? 0).toLocaleString()} Ø¬.Ù…
                      </div>
                    </div>
                  </div>

                  {/* ØªÙ†Ø¨ÙŠÙ‡ Ø°ÙƒÙŠ Ø¥Ø°Ø§ ÙƒØ§Ù† Ù„Ø¯ÙŠÙ‡ Ø³Ù„Ù Ù…Ø¹Ù„Ù‚Ø© */}
                  {(selectedEmployee.outstanding_advances ?? 0) > 0 && (
                    <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                      <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <strong>ØªÙ†Ø¨ÙŠÙ‡ Ø¥Ø¯Ø§Ø±ÙŠ:</strong> Ø§Ù„Ù…ÙˆØ¸Ù Ù„Ø¯ÙŠÙ‡ Ø³Ù„ÙØ© Ù‚Ø§Ø¦Ù…Ø© ØºÙŠØ± Ù…Ø®ØµÙˆÙ…Ø© Ø¨Ù‚ÙŠÙ…Ø©{' '}
                        <strong>{Number(selectedEmployee.outstanding_advances).toLocaleString()} Ø¬.Ù…</strong>.
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 3. Ø­Ù‚Ù„ Ù…Ø¨Ù„Øº Ø§Ù„Ø³Ù„ÙØ© Ù…Ø¹ Ø§Ù„Ù…Ø³Ø§Ø¹Ø¯ Ø§Ù„Ø°ÙƒÙŠ */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-sm font-bold text-slate-700 flex items-center gap-1.5">
                    <DollarSign size={15} className="text-blue-600" />
                    <span>Ù…Ø¨Ù„Øº Ø§Ù„Ø³Ù„ÙØ© Ø§Ù„Ù…Ø·Ù„ÙˆØ¨Ø©</span>
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
                      {advancePercentage}% Ù…Ù† Ø§Ù„Ø±Ø§ØªØ¨ Ø§Ù„Ø£Ø³Ø§Ø³ÙŠ
                    </span>
                  )}
                </div>

                <div className="relative">
                  <input 
                    type="number" 
                    required 
                    min="1" 
                    placeholder="Ø£Ø¯Ø®Ù„ Ø§Ù„Ù…Ø¨Ù„Øº..."
                    className="w-full border border-slate-200 rounded-xl p-2.5 text-slate-800 font-bold text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all shadow-xs" 
                    value={formData.amount || ''} 
                    onChange={e => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })} 
                  />
                  <span className="absolute left-3 top-3 text-xs font-bold text-slate-400 pointer-events-none">
                    Ø¬.Ù…
                  </span>
                </div>

                {/* Ø£Ø²Ø±Ø§Ø± Ø§Ù„Ù…Ø¨Ø§Ù„Øº Ø§Ù„Ø°ÙƒÙŠØ© Ø§Ù„Ø³Ø±ÙŠØ¹Ø© */}
                {selectedEmployee && (selectedEmployee.basic_salary ?? 0) > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-slate-400 font-medium flex items-center gap-1 ml-1">
                      <Sparkles size={12} className="text-blue-500" /> Ù…Ø¨Ø§Ù„Øº Ø³Ø±ÙŠØ¹Ø©:
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
                      Ø±Ø§ØªØ¨ ÙƒØ§Ù…Ù„ (100%)
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

                {/* ØªØ­Ø°ÙŠØ± ØªØ¬Ø§ÙˆØ² Ø§Ù„Ø±Ø§ØªØ¨ */}
                {selectedEmployee && (selectedEmployee.basic_salary ?? 0) > 0 && formData.amount > (selectedEmployee.basic_salary || 0) && (
                  <div className="mt-2 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
                    <AlertTriangle size={15} className="text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <strong>ØªØ­Ø°ÙŠØ± ØªØ¬Ø§ÙˆØ² Ø§Ù„Ø±Ø§ØªØ¨:</strong> Ù…Ø¨Ù„Øº Ø§Ù„Ø³Ù„ÙØ© Ø§Ù„Ù…Ø·Ù„ÙˆØ¨ ({formData.amount.toLocaleString()} Ø¬.Ù…) Ø£ÙƒØ¨Ø± Ù…Ù† Ø§Ù„Ø±Ø§ØªØ¨ Ø§Ù„Ø£Ø³Ø§Ø³ÙŠ Ù„Ù„Ù…ÙˆØ¸Ù ({Number(selectedEmployee.basic_salary).toLocaleString()} Ø¬.Ù…).
                    </div>
                  </div>
                )}
              </div>

              {/* 4. Ø§Ù„Ø­Ù‚ÙˆÙ„ Ø§Ù„Ù…Ø§Ù„ÙŠØ©: ØªØ§Ø±ÙŠØ® Ø§Ù„ØµØ±Ù ÙˆØ­Ø³Ø§Ø¨ Ø§Ù„Ø®Ø²ÙŠÙ†Ø© */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                    <Calendar size={15} className="text-blue-600" />
                    <span>ØªØ§Ø±ÙŠØ® Ø§Ù„ØµØ±Ù</span>
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
                    <span>ØµØ±Ù Ù…Ù† (Ø§Ù„Ø®Ø²ÙŠÙ†Ø©/Ø§Ù„Ø¨Ù†Ùƒ)</span>
                    <span className="text-red-500">*</span>
                  </label>
                  <select 
                    required 
                    className="w-full border border-slate-200 rounded-xl p-2.5 text-sm text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all shadow-xs bg-white" 
                    value={formData.treasuryId} 
                    onChange={e => setFormData({ ...formData, treasuryId: e.target.value })}
                  >
                    <option value="">Ø§Ø®ØªØ± Ø§Ù„Ø­Ø³Ø§Ø¨...</option>
                    {treasuryAccounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 5. Ù…Ù„Ø§Ø­Ø¸Ø§Øª */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Ø³Ø¨Ø¨ Ø§Ù„Ø³Ù„ÙØ© / Ù…Ù„Ø§Ø­Ø¸Ø§Øª</label>
                <textarea 
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-sm text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all shadow-xs" 
                  rows={2} 
                  placeholder="Ø³Ø¨Ø¨ Ø·Ù„Ø¨ Ø§Ù„Ø³Ù„ÙØ©ØŒ Ø·Ø±ÙŠÙ‚Ø© Ø§Ù„Ø§Ø³ØªÙ‚Ø·Ø§Ø¹ØŒ Ø£Ùˆ Ø£ÙŠ ØªÙØ§ØµÙŠÙ„ Ø¥Ø¶Ø§ÙÙŠØ©..."
                  value={formData.notes} 
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>

              {/* Ø£Ø²Ø±Ø§Ø± Ø§Ù„Ø­ÙØ¸ ÙˆØ§Ù„Ø¥Ù„ØºØ§Ø¡ */}
              <div className="flex gap-3 pt-3 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)} 
                  className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                >
                  Ø¥Ù„ØºØ§Ø¡
                </button>
                <button 
                  type="submit" 
                  disabled={saving} 
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 flex justify-center items-center gap-2 shadow-sm transition-all"
                >
                  {saving ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle size={18} />}
                  <span>Ø­ÙØ¸ ÙˆØµØ±Ù Ø§Ù„Ø³Ù„ÙØ©</span>
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
