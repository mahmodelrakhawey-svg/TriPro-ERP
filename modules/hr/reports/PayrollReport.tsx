import { logger } from '../../../utils/logger';
import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import { FileText, Printer, Search, Loader2, Receipt, FileSpreadsheet } from 'lucide-react';
import { PayslipModal, PayslipData } from '../components/PayslipModal';

const PayrollReport = () => {
  const { settings, currentUser, selectedFiscalYear, organization } = useAccounting();
  const { showToast } = useToast();
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(selectedFiscalYear || new Date().getFullYear());
  const [payrollData, setPayrollData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [payrollSummary, setPayrollSummary] = useState<any>(null);
  const [selectedPayslip, setSelectedPayslip] = useState<PayslipData | null>(null);

  // Ù…Ø²Ø§Ù…Ù†Ø© Ø§Ù„Ø³Ù†Ø© Ø§Ù„Ù…Ø®ØªØ§Ø±Ø© Ù…Ø¹ Ø§Ù„Ø³Ù†Ø© Ø§Ù„Ù…Ø§Ù„ÙŠØ© Ù„Ù„Ù†Ø¸Ø§Ù…
  useEffect(() => {
    if (selectedFiscalYear) {
      setSelectedYear(selectedFiscalYear);
    }
  }, [selectedFiscalYear]);

  const fetchPayrollData = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id;

      if (!userOrgId) {
        showToast('ØªØ¹Ø°Ø± ØªØ­Ø¯ÙŠØ¯ Ø§Ù„Ù…Ù†Ø¸Ù…Ø© Ø§Ù„ØªØ§Ø¨Ø¹ Ù„Ù‡Ø§. ÙŠØ±Ø¬Ù‰ ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ù…Ø±Ø© Ø£Ø®Ø±Ù‰.', 'error');
        setLoading(false);
        return;
      }

      // 1. Ø¬Ù„Ø¨ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…Ø³ÙŠØ± Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠ Ù„Ù„Ø´Ù‡Ø± ÙˆØ§Ù„Ø³Ù†Ø© Ø§Ù„Ù…Ø­Ø¯Ø¯ÙŠÙ†
      const { data: payrollsList, error: payrollError } = await supabase
        .from('payrolls')
        .select('*')
        .eq('organization_id', userOrgId)
        .eq('payroll_month', selectedMonth)
        .eq('payroll_year', selectedYear);

      if (payrollError) throw payrollError;

      if (payrollsList && payrollsList.length > 0) {
        const payrollIds = payrollsList.map(p => p.id);
        
        // 2. Ø¬Ù„Ø¨ ØªÙØ§ØµÙŠÙ„ Ø§Ù„Ø±ÙˆØ§ØªØ¨ Ù„Ù„Ù…ÙˆØ¸ÙÙŠÙ† Ù…Ø¹ Ø§Ù„Ù‚Ø³Ù…
        const { data: items, error: itemsError } = await supabase
          .from('payroll_items')
          .select('*, employees(full_name, position, department)')
          .eq('organization_id', userOrgId)
          .in('payroll_id', payrollIds);

        if (itemsError) throw itemsError;

        // ØªØ·Ø¨ÙŠÙ‚ Ø¹Ø²Ù„ Ù†Ø·Ø§Ù‚ Ø§Ù„Ø¥Ø´Ø±Ø§Ù (HR Scope)
        const hrScope = currentUser?.hr_scope || (currentUser as any)?.user_metadata?.hr_scope || 'all';

        const isFactoryDept = (dept: Record<string, any>) => {
          const d = String(dept || '').trim().toLowerCase();
          return d === 'Ø§Ù„Ù…ØµÙ†Ø¹' || d === 'Ù…ØµÙ†Ø¹' || d === 'factory';
        };

        let filteredItems = items || [];
        if (hrScope === 'factory') {
          filteredItems = filteredItems.filter(item => isFactoryDept(item.employees?.department));
        } else if (hrScope === 'branches') {
          filteredItems = filteredItems.filter(item => !isFactoryDept(item.employees?.department));
        }

        // Ø­Ø³Ø§Ø¨ Ø§Ù„Ù…Ù„Ø®Øµ Ø¨Ù†Ø§Ø¡ Ø¹Ù„Ù‰ Ø§Ù„Ù…ÙˆØ¸ÙÙŠÙ† Ø§Ù„Ù…ØªØ§Ø­ÙŠÙ† Ù„Ù„Ù…Ø³ØªØ®Ø¯Ù… ÙÙ‚Ø·
        const summary = filteredItems.reduce((acc, curr) => ({
            ...acc,
            total_gross_salary: acc.total_gross_salary + Number(curr.gross_salary || 0),
            total_additions: acc.total_additions + Number(curr.additions || 0),
            total_payroll_tax: acc.total_payroll_tax + Number(curr.payroll_tax || 0),
            total_deductions: acc.total_deductions + Number(curr.advances_deducted || 0) + Number(curr.other_deductions || 0),
            total_net_salary: acc.total_net_salary + Number(curr.net_salary || 0),
        }), { total_gross_salary: 0, total_additions: 0, total_payroll_tax: 0, total_deductions: 0, total_net_salary: 0 });

        setPayrollSummary(summary);
        setPayrollData(filteredItems);
      } else {
        setPayrollSummary(null);
        setPayrollData([]);
      }
    } catch (error) {
      logger.error('Error fetching payroll report:', error);
      showToast('Ø­Ø¯Ø« Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ Ø¬Ù„Ø¨ Ø§Ù„ØªÙ‚Ø±ÙŠØ±: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayrollData();
  }, [selectedMonth, selectedYear]);

  const handlePrintSlip = (item: Record<string, any>) => {
    setSelectedPayslip({
      employee_name: item.employees?.full_name || 'Ù…ÙˆØ¸Ù',
      job_title: item.employees?.position || 'Ù…ÙˆØ¸Ù',
      department: item.employees?.department || '-',
      month: selectedMonth,
      year: selectedYear,
      gross_salary: item.gross_salary || 0,
      additions: item.additions || 0,
      advances_deducted: item.advances_deducted || 0,
      payroll_tax: item.payroll_tax || 0,
      other_deductions: item.other_deductions || 0,
      net_salary: item.net_salary || 0,
      company_name: organization?.name || settings?.companyName
    });
  };

  // ØªØµØ¯ÙŠØ± ÙƒØ´Ù Ø§Ù„Ø±ÙˆØ§ØªØ¨ Ø¥Ù„Ù‰ Excel
  const handleExportExcel = () => {
    if (!payrollData || payrollData.length === 0) {
      showToast('Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¨ÙŠØ§Ù†Ø§Øª Ø±ÙˆØ§ØªØ¨ Ù„Ù„ØªØµØ¯ÙŠØ± ÙÙŠ Ù‡Ø°Ø§ Ø§Ù„Ø´Ù‡Ø±', 'warning');
      return;
    }

    const rows = payrollData.map((item, idx) => ({
      'Ù…': idx + 1,
      'Ø§Ø³Ù… Ø§Ù„Ù…ÙˆØ¸Ù': item.employees?.full_name || 'Ù…ÙˆØ¸Ù',
      'Ø§Ù„Ù‚Ø³Ù… / Ø§Ù„ÙØ±Ø¹': item.employees?.department || '-',
      'Ø§Ù„Ù…Ø³Ù…Ù‰ Ø§Ù„ÙˆØ¸ÙŠÙÙŠ': item.employees?.position || '-',
      'Ø§Ù„Ø±Ø§ØªØ¨ Ø§Ù„Ø£Ø³Ø§Ø³ÙŠ (Ø¬.Ù…)': Number(item.gross_salary) || 0,
      'Ø§Ù„Ø¥Ø¶Ø§ÙÙŠ ÙˆØ§Ù„Ø¨Ø¯Ù„Ø§Øª (Ø¬.Ù…)': Number(item.additions) || 0,
      'Ø§Ù„Ø³Ù„Ù Ø§Ù„Ù…Ø®ØµÙˆÙ…Ø© (Ø¬.Ù…)': Number(item.advances_deducted) || 0,
      'Ø¶Ø±ÙŠØ¨Ø© ÙƒØ³Ø¨ Ø§Ù„Ø¹Ù…Ù„ (Ø¬.Ù…)': Number(item.payroll_tax) || 0,
      'Ø§Ø³ØªÙ‚Ø·Ø§Ø¹Ø§Øª Ø£Ø®Ø±Ù‰ (Ø¬.Ù…)': Number(item.other_deductions) || 0,
      'ØµØ§ÙÙŠ Ø§Ù„Ø±Ø§ØªØ¨ Ø§Ù„Ù…Ø³ØªØ­Ù‚ (Ø¬.Ù…)': Number(item.net_salary) || 0
    }));

    if (payrollSummary) {
      rows.push({
        'Ù…': '' as any,
        'Ø§Ø³Ù… Ø§Ù„Ù…ÙˆØ¸Ù': `Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø¹Ø§Ù… (${payrollData.length} Ù…ÙˆØ¸Ù)`,
        'Ø§Ù„Ù‚Ø³Ù… / Ø§Ù„ÙØ±Ø¹': '',
        'Ø§Ù„Ù…Ø³Ù…Ù‰ Ø§Ù„ÙˆØ¸ÙŠÙÙŠ': '',
        'Ø§Ù„Ø±Ø§ØªØ¨ Ø§Ù„Ø£Ø³Ø§Ø³ÙŠ (Ø¬.Ù…)': payrollSummary.total_gross_salary,
        'Ø§Ù„Ø¥Ø¶Ø§ÙÙŠ ÙˆØ§Ù„Ø¨Ø¯Ù„Ø§Øª (Ø¬.Ù…)': payrollSummary.total_additions,
        'Ø§Ù„Ø³Ù„Ù Ø§Ù„Ù…Ø®ØµÙˆÙ…Ø© (Ø¬.Ù…)': payrollData.reduce((s, i) => s + Number(i.advances_deducted || 0), 0),
        'Ø¶Ø±ÙŠØ¨Ø© ÙƒØ³Ø¨ Ø§Ù„Ø¹Ù…Ù„ (Ø¬.Ù…)': payrollSummary.total_payroll_tax,
        'Ø§Ø³ØªÙ‚Ø·Ø§Ø¹Ø§Øª Ø£Ø®Ø±Ù‰ (Ø¬.Ù…)': payrollData.reduce((s, i) => s + Number(i.other_deductions || 0), 0),
        'ØµØ§ÙÙŠ Ø§Ù„Ø±Ø§ØªØ¨ Ø§Ù„Ù…Ø³ØªØ­Ù‚ (Ø¬.Ù…)': payrollSummary.total_net_salary
      });
    }

    const ws = XLSX.utils.json_to_sheet(rows);

    ws['!cols'] = [
      { wch: 6 },  // Ù…
      { wch: 25 }, // Ø§Ø³Ù… Ø§Ù„Ù…ÙˆØ¸Ù
      { wch: 18 }, // Ø§Ù„Ù‚Ø³Ù…
      { wch: 18 }, // Ø§Ù„Ù…Ø³Ù…Ù‰ Ø§Ù„ÙˆØ¸ÙŠÙÙŠ
      { wch: 18 }, // Ø§Ù„Ø±Ø§ØªØ¨ Ø§Ù„Ø£Ø³Ø§Ø³ÙŠ
      { wch: 20 }, // Ø§Ù„Ø¥Ø¶Ø§ÙÙŠ ÙˆØ§Ù„Ø¨Ø¯Ù„Ø§Øª
      { wch: 18 }, // Ø§Ù„Ø³Ù„Ù Ø§Ù„Ù…Ø®ØµÙˆÙ…Ø©
      { wch: 18 }, // Ø¶Ø±ÙŠØ¨Ø© ÙƒØ³Ø¨ Ø§Ù„Ø¹Ù…Ù„
      { wch: 18 }, // Ø§Ø³ØªÙ‚Ø·Ø§Ø¹Ø§Øª Ø£Ø®Ø±Ù‰
      { wch: 22 }  // ØµØ§ÙÙŠ Ø§Ù„Ø±Ø§ØªØ¨ Ø§Ù„Ù…Ø³ØªØ­Ù‚
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `ÙƒØ´Ù_Ø±ÙˆØ§ØªØ¨_${selectedMonth}_${selectedYear}`);
    XLSX.writeFile(wb, `ÙƒØ´Ù_Ø±ÙˆØ§ØªØ¨_Ø´Ù‡Ø±_${selectedMonth}_Ø³Ù†Ø©_${selectedYear}.xlsx`);
    showToast(`ØªÙ… ØªØµØ¯ÙŠØ± ÙƒØ´Ù Ø±ÙˆØ§ØªØ¨ Ø´Ù‡Ø± ${selectedMonth}/${selectedYear} Ø¥Ù„Ù‰ Excel Ø¨Ù†Ø¬Ø§Ø­ âœ…`, 'success');
  };

  // Ø­Ù…Ø§ÙŠØ© Ø§Ù„ØµÙØ­Ø© Ù…Ù† Ù…Ø³ØªØ®Ø¯Ù… Ø§Ù„Ø¯ÙŠÙ…Ùˆ
  if (currentUser?.role === 'demo') {
      return (
          <div className="flex flex-col items-center justify-center h-96 text-slate-500 bg-white rounded-3xl border border-slate-200 shadow-sm">
              <FileText size={64} className="mb-4 text-slate-300" />
              <h2 className="text-xl font-bold text-slate-700">ÙƒØ´Ù Ø§Ù„Ø±ÙˆØ§ØªØ¨ Ù…Ø­Ø¬ÙˆØ¨</h2>
              <p className="text-sm mt-2">Ø§Ù„ØªÙ‚Ø§Ø±ÙŠØ± Ø§Ù„Ù…Ø§Ù„ÙŠØ© Ø§Ù„Ø®Ø§ØµØ© Ø¨Ø§Ù„Ù…ÙˆØ¸ÙÙŠÙ† ØºÙŠØ± Ù…ØªØ§Ø­Ø© ÙÙŠ Ø§Ù„Ù†Ø³Ø®Ø© Ø§Ù„ØªØ¬Ø±ÙŠØ¨ÙŠØ©.</p>
          </div>
      );
  }

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center print:hidden">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <FileText className="text-blue-600" /> ÙƒØ´Ù Ø±ÙˆØ§ØªØ¨ Ø§Ù„Ù…ÙˆØ¸ÙÙŠÙ†
          </h2>
          {currentUser?.hr_scope && currentUser?.hr_scope !== 'all' && (
            <span className={`px-3 py-1 rounded-full text-xs font-black border ${
              currentUser.hr_scope === 'factory'
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-sky-50 text-sky-800 border-sky-200'
            }`}>
              {currentUser.hr_scope === 'factory' ? 'ðŸ­ Ø·Ø§Ù‚Ù… Ø§Ù„Ù…ØµÙ†Ø¹ ÙÙ‚Ø·' : 'ðŸª Ø·Ø§Ù‚Ù… Ø§Ù„ÙØ±ÙˆØ¹ ÙÙ‚Ø·'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={handleExportExcel} 
            disabled={loading || payrollData.length === 0}
            className="bg-emerald-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-emerald-700 disabled:opacity-50 transition shadow-sm font-bold text-sm"
            title="ØªØµØ¯ÙŠØ± ÙƒØ´Ù Ø§Ù„Ø±ÙˆØ§ØªØ¨ Ø¥Ù„Ù‰ Excel"
          >
            <FileSpreadsheet size={18} /> ØªØµØ¯ÙŠØ± Excel
          </button>
          <button onClick={() => window.print()} className="bg-slate-800 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-700 font-bold text-sm">
            <Printer size={18} /> Ø·Ø¨Ø§Ø¹Ø© Ø§Ù„ÙƒØ´Ù
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-end gap-4 print:hidden">
          <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Ø¹Ù† Ø´Ù‡Ø±</label>
              <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} className="w-full border rounded-lg p-2">
                  {[...Array(12)].map((_, i) => <option key={i+1} value={i+1}>{i+1}</option>)}
              </select>
          </div>
          <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Ø³Ù†Ø©</label>
              <input type="number" value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="w-full border rounded-lg p-2" />
          </div>
          <div className="flex-1">
             <button onClick={fetchPayrollData} className="bg-blue-50 text-blue-600 px-4 py-2 rounded-lg font-bold hover:bg-blue-100 flex items-center gap-2">
                <Search size={18} /> Ø¹Ø±Ø¶ Ø§Ù„ØªÙ‚Ø±ÙŠØ±
             </button>
          </div>
      </div>

      <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 print:shadow-none print:border-none">
        <div className="text-center mb-8 hidden print:block">
            <h1 className="text-2xl font-bold text-slate-900">{settings.companyName}</h1>
            <h2 className="text-xl text-slate-600 mt-2">ÙƒØ´Ù Ø±ÙˆØ§ØªØ¨ Ø´Ù‡Ø± {selectedMonth} / {selectedYear}</h2>
        </div>

        {loading ? (
            <div className="py-12 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" size={32} /></div>
        ) : payrollSummary ? (
            <>
                <table className="w-full text-right border-collapse">
                    <thead className="bg-slate-50 text-slate-600 font-bold text-sm border-y-2 border-slate-200">
                        <tr>
                            <th className="p-3 border-b">Ø§Ù„Ù…ÙˆØ¸Ù</th>
                            <th className="p-3 border-b">Ø§Ù„ÙØ±Ø¹ / Ø§Ù„Ù‚Ø³Ù…</th>
                            <th className="p-3 border-b">Ø§Ù„Ø±Ø§ØªØ¨ Ø§Ù„Ø£Ø³Ø§Ø³ÙŠ</th>
                            <th className="p-3 border-b text-emerald-700">Ø¥Ø¶Ø§ÙÙŠ (+)</th>
                            <th className="p-3 border-b text-red-700">Ø¶Ø±ÙŠØ¨Ø© (-)</th>
                            <th className="p-3 border-b text-red-700">Ø®ØµÙˆÙ…Ø§Øª (-)</th>
                            <th className="p-3 border-b text-red-700">Ø³Ù„Ù (-)</th>
                            <th className="p-3 border-b">ØµØ§ÙÙŠ Ø§Ù„Ø±Ø§ØªØ¨</th>
                            <th className="p-3 border-b print:hidden">Ø¥Ø¬Ø±Ø§Ø¡Ø§Øª</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {payrollData.map((item) => (
                    item && <tr key={item.id}>
                        <td className="p-3 font-bold">{item.employees?.full_name || 'ØºÙŠØ± Ù…Ø­Ø¯Ø¯'} <span className="text-xs font-normal text-slate-500 block">{item.employees?.position || 'ØºÙŠØ± Ù…Ø­Ø¯Ø¯'}</span></td>
                        <td className="p-3 text-slate-600 font-medium text-sm">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                                {item.employees?.department || '-'}
                            </span>
                        </td>
                        <td className="p-3">{(item.gross_salary || 0).toLocaleString()}</td>
                        <td className="p-3 text-emerald-600">{(item.additions || 0).toLocaleString()}</td>
                        <td className="p-3 text-red-600">{(item.payroll_tax || 0).toLocaleString()}</td>
                        <td className="p-3 text-red-600">{(item.other_deductions || 0).toLocaleString()}</td>
                        <td className="p-3 text-red-600">{(item.advances_deducted || 0).toLocaleString()}</td>
                        <td className="p-3 font-bold text-slate-900 bg-slate-50">{(item.net_salary || 0).toLocaleString()}</td>
                        <td className="p-3 print:hidden">
                            <button onClick={() => handlePrintSlip(item)} className="text-slate-400 hover:text-blue-600 p-1" title="Ø·Ø¨Ø§Ø¹Ø© Ù‚Ø³ÙŠÙ…Ø©">
                                <Receipt size={18} />
                            </button>
                        </td>
                    </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300">
                        <tr>
                            <td className="p-3" colSpan={2}>Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ</td>
                            <td className="p-3">{payrollSummary.total_gross_salary.toLocaleString()}</td>
                            <td className="p-3 text-emerald-700">{payrollSummary.total_additions.toLocaleString()}</td>
                            <td className="p-3 text-red-700">{payrollSummary.total_payroll_tax.toLocaleString()}</td>
                            <td className="p-3 text-red-700" colSpan={2}>{payrollSummary.total_deductions.toLocaleString()}</td>
                            <td className="p-3 text-lg">{payrollSummary.total_net_salary.toLocaleString()}</td>
                            <td className="p-3 print:hidden"></td>
                        </tr>
                    </tfoot>
                </table>
                
                <div className="mt-12 flex justify-between text-center print:flex hidden">
                    <div>
                        <p className="font-bold text-slate-600 mb-8">Ø§Ù„Ù…Ø­Ø§Ø³Ø¨</p>
                        <p>..................</p>
                    </div>
                    <div>
                        <p className="font-bold text-slate-600 mb-8">Ø§Ù„Ù…Ø¯ÙŠØ± Ø§Ù„Ù…Ø§Ù„ÙŠ</p>
                        <p>..................</p>
                    </div>
                    <div>
                        <p className="font-bold text-slate-600 mb-8">Ø§Ù„Ù…Ø¯ÙŠØ± Ø§Ù„Ø¹Ø§Ù…</p>
                        <p>..................</p>
                    </div>
                </div>
            </>
        ) : (
            <div className="py-12 text-center text-slate-400 border-2 border-dashed rounded-lg">
                Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¨ÙŠØ§Ù†Ø§Øª Ø±ÙˆØ§ØªØ¨ Ù…Ø³Ø¬Ù„Ø© Ù„Ù‡Ø°Ø§ Ø§Ù„Ø´Ù‡Ø±
            </div>
        )}
      </div>

      {selectedPayslip && (
        <PayslipModal data={selectedPayslip} onClose={() => setSelectedPayslip(null)} />
      )}
    </div>
  );
};

export default PayrollReport;
