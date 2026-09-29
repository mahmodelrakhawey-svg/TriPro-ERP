import React, { useState, useMemo, useEffect } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { supabase } from '../../supabaseClient';
import { useNavigate } from 'react-router-dom';
import { useToastNotification } from '../../utils/toastUtils';
import { FileText, Search, Download, Filter, Printer, Loader2, CheckCircle, AlertTriangle, RefreshCw, ExternalLink, X, ShieldAlert } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import ReportHeader from '../../components/ReportHeader';
import { journalAuditService } from '../../services/journalAuditService';
import { getActiveOrgIdSync, resolveActiveOrgId } from '../../services/tenantContext';

const TrialBalanceAdvanced = () => {
  const { accounts, settings, refreshData, currentUser, currentSelectedOrgId, entries, selectedFiscalYear, fiscalYearRange } = useAccounting();
  const navigate = useNavigate();
  const toast = useToastNotification();
  const [startDate, setStartDate] = useState(fiscalYearRange.startDate);
  const [endDate, setEndDate] = useState(`${selectedFiscalYear}-12-31`);
  const [searchTerm, setSearchTerm] = useState('');
  const [hideZeroAccounts, setHideZeroAccounts] = useState(true);
  const [showOpeningOnly, setShowOpeningOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ledgerLines, setLedgerLines] = useState<any[]>([]);
  const [rpcSummary, setRpcSummary] = useState<any[] | null>(null);
  const [showUnbalancedModal, setShowUnbalancedModal] = useState(false);
  const [isFixingEntry, setIsFixingEntry] = useState(false);

  // مزامنة التواريخ تلقائياً عند تغيير السنة المالية المختارة من شريط النظام
  useEffect(() => {
    if (selectedFiscalYear) {
      setStartDate(`${selectedFiscalYear}-01-01`);
      setEndDate(`${selectedFiscalYear}-12-31`);
    }
  }, [selectedFiscalYear]);

  // دالة لجلب جميع الحركات من قاعدة البيانات لضمان الدقة
  const fetchLedgerData = async () => {
    setLoading(true);
    if (currentUser?.role === 'demo') {
        // تحسين بيانات الديمو لتكون منطقية ومتزنة
        const demoLines = entries
            .filter(e => e.status === 'posted')
            .flatMap(entry => {
                // استنتاج نوع الحساب بناءً على نوع القيد لضمان عرض بيانات واقعية
                const ref = (entry.reference || '').toUpperCase();
                const entryLines = entry.journal_lines || entry.lines || [];
                
                return entryLines.map((line: any, idx: number) => {
                    let smartAccountId = line.accountId || line.account_id;
                    
                    // إذا كان الحساب غير معروف في الديمو، نمنحه هوية بناءً على السياق
                    if (!smartAccountId || smartAccountId === 'UNKNOWN') {
                        if (line.debit > 0) {
                            if (ref.startsWith('INV')) smartAccountId = '10201'; // عملاء
                            else if (ref.startsWith('RCT')) smartAccountId = '10101'; // صندوق
                            else if (ref.startsWith('PAY')) smartAccountId = '20101'; // موردين
                            else if (ref.startsWith('PUR')) smartAccountId = '50101'; // مشتريات
                            else if (ref.includes('DEMO-001')) smartAccountId = '11101'; // أثاث (حسب نصك)
                            else if (ref.includes('DEMO-002')) smartAccountId = '50201'; // كهرباء (حسب نصك)
                            else smartAccountId = '50301'; // مصروفات عامة
                        } else {
                            if (ref.startsWith('INV')) smartAccountId = '40101'; // مبيعات
                            else if (ref.startsWith('RCT')) smartAccountId = '10201'; // عملاء
                            else if (ref.startsWith('PAY')) smartAccountId = '10101'; // صندوق
                            else if (ref.startsWith('PUR')) smartAccountId = '20101'; // موردين
                            else if (ref.includes('DEMO-001')) smartAccountId = '10101'; // صندوق
                            else if (ref.includes('DEMO-002')) smartAccountId = '10101'; // صندوق
                            else smartAccountId = '10101'; // صندوق
                        }
                    }

                    return {
                        id: `demo-line-${idx}`,
                        journal_entry_id: entry.id,
                        account_id: smartAccountId,
                        debit: Number(line.debit) || 0,
                        credit: Number(line.credit) || 0,
                        description: line.description || entry.description,
                        journal_entries: {
                            id: entry.id,
                            reference: entry.reference,
                            description: entry.description,
                            transaction_date: entry.transaction_date || entry.date,
                            status: entry.status
                        }
                    };
                });
            });
            
        setRpcSummary(null);
        setLedgerLines(demoLines);
        setLoading(false);
        return;
    }

    // 🔒 منطق النسخة الأصلية: جلب البيانات الفعلية من قاعدة البيانات
    try {
      // 🛡️ تحديد هوية المنظمة الموحدة والمحصنة
      let userOrgId: string | undefined | null =
        getActiveOrgIdSync(currentSelectedOrgId) ||
        (currentUser as any)?.organization_id ||
        (currentUser as any)?.user_metadata?.org_id;

      if (!userOrgId) {
        userOrgId = await resolveActiveOrgId(currentSelectedOrgId);
      }

      if (!userOrgId) {
        toast.error('تعذر تحديد المنظمة. يرجى تسجيل الخروج والدخول مجدداً.');
        setLoading(false);
        return;
      }

      // 🚀 الخطوة 1 (Dual-Engine Fast Path): استعلام دالة التجميع السريعة على مستوى PostgreSQL
      let rpcSuccess = false;
      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('get_trial_balance_summary_rpc', {
          p_org_id: userOrgId,
          p_start_date: startDate || '1970-01-01',
          p_end_date: endDate || new Date().toISOString().split('T')[0]
        });

        if (!rpcErr && Array.isArray(rpcData) && rpcData.length > 0) {
          setRpcSummary(rpcData);
          rpcSuccess = true;
          // تصفير أسطر اليومية المحلية لتوفير الذاكرة والشبكة
          setLedgerLines([]);
        }
      } catch (rpcEx) {
        console.warn('[TrialBalance] Server RPC unavailable, falling back to chunked query:', rpcEx);
      }

      // 🛡️ الخطوة 2 (Graceful Degradation Fallback): جلب السطور مقسمة إذا لم تتوفر دالة الخادم
      if (!rpcSuccess) {
        setRpcSummary(null);
        let allLines: any[] = [];
        let from = 0;
        const CHUNK_SIZE = 1000;

        while (true) {
          const { data: chunk, error: chunkErr } = await supabase
            .from('journal_lines')
            .select('id, journal_entry_id, account_id, debit, credit, description, journal_entries!inner(id, reference, description, transaction_date, status, organization_id)')
            .eq('journal_entries.status', 'posted')
            .eq('journal_entries.organization_id', userOrgId)
            .lte('journal_entries.transaction_date', endDate)
            .range(from, from + CHUNK_SIZE - 1);

          if (chunkErr) throw chunkErr;
          if (!chunk || chunk.length === 0) break;

          allLines = allLines.concat(chunk);
          if (chunk.length < CHUNK_SIZE) break;
          from += CHUNK_SIZE;
        }

        setLedgerLines(allLines);
      }
    } catch (err: any) {
      console.error('Error fetching ledger:', err);
      // تمييز أخطاء الشبكة عن أخطاء البيانات
      if (
        err?.message?.includes('Failed to fetch') ||
        err?.message?.includes('ERR_CONNECTION') ||
        err?.name === 'AbortError' ||
        err?.message?.includes('network')
      ) {
        toast.error('انقطع الاتصال بالخادم. يرجى التحقق من الإنترنت وإعادة المحاولة.');
      } else {
        toast.error('فشل جلب البيانات: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // دالة لجلب تفاصيل الأسطر للتدقيق في حال وجود عدم اتزان
  const handleOpenUnbalancedAudit = async () => {
    if (ledgerLines.length === 0) {
      setLoading(true);
      try {
        let userOrgId: string | undefined | null =
          getActiveOrgIdSync(currentSelectedOrgId) ||
          (currentUser as any)?.organization_id ||
          (currentUser as any)?.user_metadata?.org_id;

        if (!userOrgId) {
          userOrgId = await resolveActiveOrgId(currentSelectedOrgId);
        }

        if (!userOrgId) {
          toast.error('تعذر تحديد المنظمة.');
          setLoading(false);
          return;
        }

        let allLines: any[] = [];
        let from = 0;
        const CHUNK_SIZE = 1000;
        while (true) {
          const { data: chunk, error: chunkErr } = await supabase
            .from('journal_lines')
            .select('id, journal_entry_id, account_id, debit, credit, description, journal_entries!inner(id, reference, description, transaction_date, status, organization_id)')
            .eq('journal_entries.status', 'posted')
            .eq('journal_entries.organization_id', userOrgId)
            .lte('journal_entries.transaction_date', endDate)
            .range(from, from + CHUNK_SIZE - 1);

          if (chunkErr) throw chunkErr;
          if (!chunk || chunk.length === 0) break;
          allLines = allLines.concat(chunk);
          if (chunk.length < CHUNK_SIZE) break;
          from += CHUNK_SIZE;
        }
        setLedgerLines(allLines);
      } catch (err: any) {
        toast.error('تعذر جلب تفاصيل الأسطر للتدقيق: ' + err.message);
      } finally {
        setLoading(false);
      }
    }
    setShowUnbalancedModal(true);
  };


  const handleRefresh = async () => {
    setLoading(true);
    await refreshData(); // تحديث دليل الحسابات (لإظهار الدمج)
    await fetchLedgerData(); // تحديث الأرصدة
    setLoading(false);
  };

  useEffect(() => {
    fetchLedgerData();
  }, [endDate, entries, currentUser]); // إعادة الجلب عند تغيير البيانات أو المستخدم

  // حساب الأرصدة
  const reportData = useMemo(() => {
    // 1. تهيئة هيكل البيانات لتجميع الأرصدة
    const accStats: Record<string, { open: number, transDr: number, transCr: number }> = {};
    
    // استخدام Map لسهولة الوصول ولإضافة الحسابات المفقودة
    const allAccountsMap = new Map<string, any>();
    accounts.forEach(a => {
        accStats[a.id] = { open: 0, transDr: 0, transCr: 0 };
        allAccountsMap.set(a.id, a);
    });

    if (rpcSummary && rpcSummary.length > 0) {
      // 🚀 الخطوة 1: حقن إحصائيات الخادم المجمعة مباشرة
      rpcSummary.forEach((row: any) => {
        const accId = row.account_id;
        accStats[accId] = {
          open: Number(row.opening_balance) || 0,
          transDr: Number(row.period_debit) || 0,
          transCr: Number(row.period_credit) || 0
        };
        if (!allAccountsMap.has(accId)) {
          allAccountsMap.set(accId, {
            id: accId,
            code: row.account_code || 'UNKNOWN',
            name: row.account_name || 'حساب غير معروف',
            type: row.account_type || 'other',
            isGroup: Boolean(row.is_group),
            parent_id: row.parent_id
          });
        }
      });
    } else {
      // حقن حسابات الديمو إذا كنا في وضع الديمو لضمان ظهور الأسماء
      if (currentUser?.role === 'demo') {
          const demoAccountsList = [
              { id: '10101', code: '10101', name: 'النقدية بالصندوق', isGroup: false, parentAccount: '101' },
              { id: '10201', code: '10201', name: 'العملاء', isGroup: false, parentAccount: '102' },
              { id: '11101', code: '11101', name: 'الأثاث والتجهيزات', isGroup: false, parentAccount: '111' },
              { id: '20101', code: '20101', name: 'الموردين', isGroup: false, parentAccount: '201' },
              { id: '40101', code: '40101', name: 'المبيعات', isGroup: false, parentAccount: '401' },
              { id: '50101', code: '50101', name: 'المشتريات', isGroup: false, parentAccount: '501' },
              { id: '50201', code: '50201', name: 'كهرباء ومياه', isGroup: false, parentAccount: '502' },
              { id: '50301', code: '50301', name: 'مصروفات إدارية', isGroup: false, parentAccount: '503' },
          ];
          demoAccountsList.forEach(da => {
              if (!allAccountsMap.has(da.id)) {
                  allAccountsMap.set(da.id, da);
                  accStats[da.id] = { open: 0, transDr: 0, transCr: 0 };
              }
          });
      }

      // 2. تجميع البيانات من الخطوط المجلوبة من قاعدة البيانات (Fallback)
      ledgerLines.forEach(line => {
        // إذا كان الحساب غير موجود في القائمة (محذوف)، نضيفه مؤقتاً للعرض
        if (!accStats[line.account_id]) {
            accStats[line.account_id] = { open: 0, transDr: 0, transCr: 0 };
            allAccountsMap.set(line.account_id, {
                id: line.account_id,
                code: 'UNKNOWN',
                name: 'حساب محذوف/غير معروف',
                isGroup: false
            });
        }

        const date = line.journal_entries.transaction_date;
        const isBefore = date < startDate;
        const isWithin = date >= startDate && date <= endDate;

        if (isBefore) {
            // الرصيد الافتتاحي: المدين موجب والدائن سالب
            accStats[line.account_id].open += (line.debit - line.credit);
        } else if (isWithin) {
            // حركات الفترة
            accStats[line.account_id].transDr += line.debit;
            accStats[line.account_id].transCr += line.credit;
        }
      });
    }

    // 3. دالة تجميعية للحسابات الرئيسية (Recursive)
    const getAccountStats = (accountId: string): { open: number, transDr: number, transCr: number } => {
        const acc = allAccountsMap.get(accountId);
        if (!acc) return { open: 0, transDr: 0, transCr: 0 };

        // إذا كان حساب فرعي، نرجع قيمه المجمعة سابقاً
        if (!acc.isGroup) {
            return accStats[accountId] || { open: 0, transDr: 0, transCr: 0 };
        }

        // إذا كان حساب رئيسي، نجمع أبناءه
        const children = Array.from(allAccountsMap.values()).filter((a: any) => a.parent_id === accountId);
        let total = { open: 0, transDr: 0, transCr: 0 };
        
        children.forEach(child => {
            const childStats = getAccountStats(child.id);
            total.open += childStats.open;
            total.transDr += childStats.transDr;
            total.transCr += childStats.transCr;
        });
        
        return total;
    };

    // 4. بناء القائمة النهائية
    let result = Array.from(allAccountsMap.values()).map((acc: any) => {
        const stats = getAccountStats(acc.id);
        return {
            ...acc,
            openBalance: stats.open,
            periodDebit: stats.transDr,
            periodCredit: stats.transCr,
            closeBalance: stats.open + stats.transDr - stats.transCr
        };
    });

    // 5. التصفية والترتيب
    if (hideZeroAccounts) {
        result = result.filter(a => 
            Math.abs(a.openBalance) > 0.01 || 
            a.periodDebit > 0.01 || 
            a.periodCredit > 0.01 ||
            Math.abs(a.closeBalance) > 0.01
        );
    }

    if (searchTerm) {
        result = result.filter(a => 
            a.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
            a.code.includes(searchTerm)
        );
    }

    return result.sort((a, b) => a.code.localeCompare(b.code));
  }, [accounts, ledgerLines, rpcSummary, startDate, endDate, hideZeroAccounts, searchTerm, showOpeningOnly]);

  // حساب الإجماليات
  const totals = useMemo(() => {
    // حساب الإجماليات من البيانات الخام مباشرة لضمان الدقة وتجنب مشاكل الهيكلية
    const rawTotals = { openDr: 0, openCr: 0, transDr: 0, transCr: 0, closeDr: 0, closeCr: 0 };

    if (rpcSummary && rpcSummary.length > 0) {
      rpcSummary.forEach((row: any) => {
        if (!row.is_group) {
          const open = Number(row.opening_balance) || 0;
          const transDr = Number(row.period_debit) || 0;
          const transCr = Number(row.period_credit) || 0;
          const close = Number(row.closing_balance) !== undefined ? Number(row.closing_balance) : (open + transDr - transCr);

          rawTotals.openDr += open > 0 ? open : 0;
          rawTotals.openCr += open < 0 ? Math.abs(open) : 0;
          rawTotals.transDr += transDr;
          rawTotals.transCr += transCr;
          rawTotals.closeDr += close > 0 ? close : 0;
          rawTotals.closeCr += close < 0 ? Math.abs(close) : 0;
        }
      });
      return rawTotals;
    }
    
    // نعيد حساب الأرصدة الخام من ledgerLines والحسابات (Fallback)
    const accStats: Record<string, { open: number, transDr: number, transCr: number }> = {};
    ledgerLines.forEach(line => {
        if (!accStats[line.account_id]) accStats[line.account_id] = { open: 0, transDr: 0, transCr: 0 };
        const date = line.journal_entries.transaction_date;
        if (date < startDate) {
            accStats[line.account_id].open += (line.debit - line.credit);
        } else if (date >= startDate && date <= endDate) {
            accStats[line.account_id].transDr += line.debit;
            accStats[line.account_id].transCr += line.credit;
        }
    });

    Object.values(accStats).forEach(stat => {
        rawTotals.openDr += stat.open > 0 ? stat.open : 0;
        rawTotals.openCr += stat.open < 0 ? Math.abs(stat.open) : 0;
        rawTotals.transDr += stat.transDr;
        rawTotals.transCr += stat.transCr;
        const close = stat.open + stat.transDr - stat.transCr;
        rawTotals.closeDr += close > 0 ? close : 0;
        rawTotals.closeCr += close < 0 ? Math.abs(close) : 0;
    });

    return rawTotals;
  }, [ledgerLines, rpcSummary, startDate, endDate]);

  // التحقق من التوازن
  const isBalanced = 
      Math.abs(totals.openDr - totals.openCr) < 0.1 &&
      Math.abs(totals.transDr - totals.transCr) < 0.1 &&
      Math.abs(totals.closeDr - totals.closeCr) < 0.1;

  // 🔍 تدقيق وتحديد القيود غير المتوازنة والأسطر المعلقة المسببة للفرق مباشرة من البيانات المحملة
  const unbalancedAudit = useMemo(() => {
    if (!ledgerLines || ledgerLines.length === 0) {
      return { entries: [], orphanLines: [], totalDiff: 0 };
    }

    const entryMap = new Map<string, {
      id: string;
      reference: string;
      description: string;
      transaction_date: string;
      status: string;
      debit: number;
      credit: number;
      difference: number;
      absDifference: number;
      lines: any[];
    }>();

    const orphanLines: any[] = [];

    for (const line of ledgerLines) {
      const entryId = line.journal_entry_id || (line.journal_entries as any)?.id;
      if (!entryId) {
        orphanLines.push(line);
        continue;
      }

      if (!entryMap.has(entryId)) {
        entryMap.set(entryId, {
          id: entryId,
          reference: (line.journal_entries as any)?.reference || entryId.slice(0, 8),
          description: (line.journal_entries as any)?.description || '',
          transaction_date: (line.journal_entries as any)?.transaction_date || '',
          status: (line.journal_entries as any)?.status || 'posted',
          debit: 0,
          credit: 0,
          difference: 0,
          absDifference: 0,
          lines: []
        });
      }

      const item = entryMap.get(entryId)!;
      item.debit += Number(line.debit) || 0;
      item.credit += Number(line.credit) || 0;
      item.lines.push(line);
    }

    const entries: any[] = [];
    for (const [_, item] of entryMap.entries()) {
      const diff = Number((item.debit - item.credit).toFixed(2));
      const absDiff = Math.abs(diff);
      if (absDiff > 0.005) {
        item.difference = diff;
        item.absDifference = absDiff;
        item.debit = Number(item.debit.toFixed(2));
        item.credit = Number(item.credit.toFixed(2));
        entries.push(item);
      }
    }

    entries.sort((a, b) => b.absDifference - a.absDifference);
    const totalDiff = Number(entries.reduce((sum, e) => sum + e.absDifference, 0).toFixed(2));

    return { entries, orphanLines, totalDiff };
  }, [ledgerLines]);

  const handleUnpostAndFix = async (entryId: string) => {
    if (!window.confirm('هل تريد فك ترحيل هذا القيد غير المتوازن وتحويله إلى مسودة؟\n\nبمجرد تحويله لمسودة، سيتم استبعاده فوراً من ميزان المراجعة ليصبح متزناً 100%، ويمكنك مراجعة القيد وتعديله من دفتر اليومية.')) {
      return;
    }
    try {
      setIsFixingEntry(true);
      const res = await journalAuditService.unpostEntryForCorrection(entryId);
      if (res.success) {
        toast.success(res.message);
        await refreshData();
        await fetchLedgerData();
        setShowUnbalancedModal(false);
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error('حدث خطأ أثناء فك الترحيل: ' + err.message);
    } finally {
      setIsFixingEntry(false);
    }
  };

  const handleNavigateToEntry = (entry: any) => {
    sessionStorage.setItem('tripro_initial_filter_status', 'unbalanced');
    sessionStorage.setItem('tripro_unbalanced_entry_id', entry.id);
    navigate('/general-journal', { 
      state: { 
        initialFilterStatus: 'unbalanced',
        highlightEntryId: entry.id,
        initialSearch: entry.reference 
      } 
    });
  };

  const exportToExcel = () => {
    const data = reportData.map(r => ({
      'الكود': r.code,
      'الحساب': r.name,
      'رصيد أول (مدين)': r.openBalance > 0 ? r.openBalance : 0,
      'رصيد أول (دائن)': r.openBalance < 0 ? Math.abs(r.openBalance) : 0,
      'حركة (مدين)': r.periodDebit,
      'حركة (دائن)': r.periodCredit,
      'رصيد آخر (مدين)': r.closeBalance > 0 ? r.closeBalance : 0,
      'رصيد آخر (دائن)': r.closeBalance < 0 ? Math.abs(r.closeBalance) : 0,
    }));
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ميزان المراجعة");
    XLSX.writeFile(wb, "TrialBalance_Advanced.xlsx");
  };

  const exportToPDF = () => {
    const input = document.getElementById('report-content');
    if (!input) return;

    html2canvas(input, { scale: 2 }).then((canvas) => {
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('l', 'mm', 'a4'); // l = landscape (عرضي)
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save("TrialBalance.pdf");
    });
  };

  const handleRowClick = (accountId: string, isGroup: boolean) => {
    if (isGroup) return; // لا ننتقل للحسابات التجميعية
    navigate('/ledger', { 
      state: { accountId, startDate, endDate } 
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 print:hidden">
        <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <FileText className="text-blue-600" /> ميزان المراجعة (بالأرصدة والمجاميع)
            </h2>
            <p className="text-slate-500 text-sm">تقرير تفصيلي للأرصدة الافتتاحية والحركات والأرصدة الختامية</p>
        </div>
        <div className="flex gap-2">
            <button onClick={handleRefresh} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors font-bold text-sm">
                <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> تحديث
            </button>
            <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors">
                <Printer size={18} /> طباعة
            </button>
            <button onClick={exportToExcel} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors">
                <Download size={18} /> تصدير Excel
            </button>
            <button onClick={exportToPDF} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
                <FileText size={18} /> PDF
            </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-end gap-4 print:hidden">
          <div className="w-full md:w-auto">
              <label className="block text-sm font-bold text-slate-700 mb-1">من تاريخ</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border rounded-lg p-2" />
          </div>
          <div className="w-full md:w-auto">
              <label className="block text-sm font-bold text-slate-700 mb-1">إلى تاريخ</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border rounded-lg p-2" />
          </div>
          <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-bold text-slate-700 mb-1">بحث</label>
              <div className="relative">
                  <Search className="absolute right-3 top-2.5 text-slate-400" size={18} />
                  <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="بحث باسم الحساب أو الكود..." className="w-full pr-10 pl-4 py-2 border rounded-lg" />
              </div>
          </div>
          <div className="flex items-center gap-2 pb-2">
              <input type="checkbox" id="hideZero" checked={hideZeroAccounts} onChange={e => setHideZeroAccounts(e.target.checked)} className="w-4 h-4" />
              <label htmlFor="hideZero" className="text-sm font-bold text-slate-700 cursor-pointer">إخفاء الحسابات الصفرية</label>
          </div>
          <div className="flex items-center gap-2 pb-2">
              <input type="checkbox" id="showOpening" checked={showOpeningOnly} onChange={e => setShowOpeningOnly(e.target.checked)} className="w-4 h-4" />
              <label htmlFor="showOpening" className="text-sm font-bold text-slate-700 cursor-pointer">عرض الأرصدة الافتتاحية فقط</label>
          </div>
      </div>

      {/* مؤشر التوازن */}
      {!loading && (
        <div className={`p-4 rounded-xl border flex flex-col gap-3 ${isBalanced ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 font-bold">
                  {isBalanced ? <CheckCircle size={24} /> : <AlertTriangle size={24} />}
                  <span>{isBalanced ? 'الميزان متزن تماماً (الأرصدة والمجاميع مطابقة)' : 'تنبيه: الميزان غير متزن! يرجى مراجعة القيود.'}</span>
              </div>
              {!isBalanced && (
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold bg-white/80 px-2.5 py-1 rounded-lg border border-red-300 text-red-900" dir="ltr">
                    الفرق: {Math.abs(totals.closeDr - totals.closeCr).toFixed(2)} ج.م
                  </span>
                  <button
                    onClick={handleOpenUnbalancedAudit}
                    className="bg-red-600 hover:bg-red-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer animate-pulse"
                    title="كشف تفاصيل القيود غير المتوازنة المسببة لهذا الفرق وإمكانية فك ترحيلها فوراً"
                  >
                    <Search size={14} />
                    كشف وتصحيح القيد المسبب للفرق ({unbalancedAudit.entries.length} قيد)
                  </button>
                </div>
              )}
            </div>

            {/* بطاقة كشف القيد المسبب فوراً أسفل شريط التحذير مباشرة */}
            {!isBalanced && unbalancedAudit.entries.length > 0 && (
              <div className="mt-1 bg-white rounded-xl border-2 border-red-300 p-4 shadow-sm text-slate-800 animate-in fade-in">
                <div className="flex flex-wrap items-center justify-between border-b border-red-100 pb-2 mb-3 gap-2">
                  <div className="flex items-center gap-2 text-red-700 font-bold text-sm">
                    <AlertTriangle size={18} />
                    <span>تم تحديد القيد المسبب لفرق الـ {unbalancedAudit.entries[0].absDifference.toFixed(2)} ج.م بنجاح:</span>
                  </div>
                  <span className="bg-red-100 text-red-800 font-mono text-xs px-2.5 py-1 rounded-md font-bold">
                    مرجع القيد: {unbalancedAudit.entries[0].reference}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs mb-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <div>
                    <span className="text-slate-500 block mb-0.5">البيان:</span>
                    <span className="font-bold text-slate-800">{unbalancedAudit.entries[0].description || 'بدون بيان'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block mb-0.5">التاريخ:</span>
                    <span className="font-bold text-slate-800">{unbalancedAudit.entries[0].transaction_date || '-'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block mb-0.5">إجمالي المدين والدائن:</span>
                    <span className="font-bold text-slate-800 font-mono">
                      مدين: {unbalancedAudit.entries[0].debit.toLocaleString()} | دائن: {unbalancedAudit.entries[0].credit.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block mb-0.5">الفارق غير المتوازن:</span>
                    <span className="font-bold text-red-600 font-mono">
                      {unbalancedAudit.entries[0].difference > 0 
                        ? `زيادة مدين: +${unbalancedAudit.entries[0].absDifference.toFixed(2)} ج.م` 
                        : `زيادة دائن: +${unbalancedAudit.entries[0].absDifference.toFixed(2)} ج.م`}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    onClick={() => handleUnpostAndFix(unbalancedAudit.entries[0].id)}
                    disabled={isFixingEntry}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    {isFixingEntry ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    ⚡ فك الترحيل فوراً (تحويل لمسودة لموازنة الميزان الآن)
                  </button>
                  <button
                    onClick={() => handleNavigateToEntry(unbalancedAudit.entries[0])}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <ExternalLink size={14} />
                    فتح القيد في دفتر اليومية لتعديله
                  </button>
                  <button
                    onClick={handleOpenUnbalancedAudit}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                  >
                    عرض تفاصيل أسطر القيد ({unbalancedAudit.entries[0].lines.length} سطر)
                  </button>
                </div>
              </div>
            )}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border-none">
        <ReportHeader title="ميزان المراجعة" subtitle={`من ${startDate} إلى ${endDate}`} />
        <div className="overflow-x-auto" id="report-content">
            <table className="w-full text-right text-sm border-collapse">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b-2 border-slate-200">
                    <tr>
                        <th rowSpan={2} className="p-3 border-l border-slate-200 w-24">الكود</th>
                        <th rowSpan={2} className="p-3 border-l border-slate-200 min-w-[200px]">اسم الحساب</th>
                        <th colSpan={2} className="p-2 border-l border-slate-200 text-center bg-blue-50">رصيد أول المدة</th>
                        {!showOpeningOnly && <th colSpan={2} className="p-2 border-l border-slate-200 text-center bg-amber-50">الحركة خلال الفترة</th>}
                        {!showOpeningOnly && <th colSpan={2} className="p-2 text-center bg-emerald-50">رصيد آخر المدة</th>}
                    </tr>
                    <tr className="text-xs">
                        <th className="p-2 border-l border-slate-200 border-t border-slate-200 bg-blue-50/50">مدين</th>
                        <th className="p-2 border-l border-slate-200 border-t border-slate-200 bg-blue-50/50">دائن</th>
                        {!showOpeningOnly && (
                            <>
                                <th className="p-2 border-l border-slate-200 border-t border-slate-200 bg-amber-50/50">مدين</th>
                                <th className="p-2 border-l border-slate-200 border-t border-slate-200 bg-amber-50/50">دائن</th>
                                <th className="p-2 border-l border-slate-200 border-t border-slate-200 bg-emerald-50/50">مدين</th>
                                <th className="p-2 border-t border-slate-200 bg-emerald-50/50">دائن</th>
                            </>
                        )}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {reportData.map((row) => (
                        <tr 
                            key={row.id} 
                            className={`transition-colors ${row.isGroup ? 'bg-slate-50 font-bold text-slate-800' : 'text-slate-600 hover:bg-blue-50 cursor-pointer'}`}
                            onClick={() => handleRowClick(row.id, row.isGroup)}
                            title={!row.isGroup ? "اضغط لعرض كشف الحساب" : ""}
                        >
                            <td className="p-2 border-l border-slate-100 font-mono">{row.code}</td>
                            <td className="p-2 border-l border-slate-100">{row.name}</td>
                            
                            <td className="p-2 border-l border-slate-100 text-blue-700">{row.openBalance > 0 ? row.openBalance.toLocaleString() : '-'}</td>
                            <td className="p-2 border-l border-slate-100 text-blue-700">{row.openBalance < 0 ? Math.abs(row.openBalance).toLocaleString() : '-'}</td>
                            
                            {!showOpeningOnly && (
                                <>
                                    <td className="p-2 border-l border-slate-100 text-amber-700">{row.periodDebit > 0 ? row.periodDebit.toLocaleString() : '-'}</td>
                                    <td className="p-2 border-l border-slate-100 text-amber-700">{row.periodCredit > 0 ? row.periodCredit.toLocaleString() : '-'}</td>
                                    
                                    <td className="p-2 border-l border-slate-100 text-emerald-700 font-bold">{row.closeBalance > 0 ? row.closeBalance.toLocaleString() : '-'}</td>
                                    <td className="p-2 text-emerald-700 font-bold">{row.closeBalance < 0 ? Math.abs(row.closeBalance).toLocaleString() : '-'}</td>
                                </>
                            )}
                        </tr>
                    ))}
                </tbody>
                <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300">
                    {loading && (
                        <tr><td colSpan={8} className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" /> جاري حساب الأرصدة...</td></tr>
                    )}
                    {!loading && (
                    <tr>
                        <td colSpan={2} className="p-3 text-center border-l border-slate-300">الإجمالي الكلي</td>
                        <td className="p-3 border-l border-slate-300 text-blue-800">{totals.openDr.toLocaleString()}</td>
                        <td className="p-3 border-l border-slate-300 text-blue-800">{totals.openCr.toLocaleString()}</td>
                        {!showOpeningOnly && (
                            <>
                                <td className="p-3 border-l border-slate-300 text-amber-800">{totals.transDr.toLocaleString()}</td>
                                <td className="p-3 border-l border-slate-300 text-amber-800">{totals.transCr.toLocaleString()}</td>
                                <td className="p-3 border-l border-slate-300 text-emerald-800">{totals.closeDr.toLocaleString()}</td>
                                <td className="p-3 text-emerald-800">{totals.closeCr.toLocaleString()}</td>
                            </>
                        )}
                    </tr>
                    )}
                </tfoot>
            </table>
        </div>
      </div>

      {/* نافذة تفاصيل ومعالجة القيود غير المتوازنة */}
      {showUnbalancedModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* رأس النافذة */}
            <div className="p-4 bg-red-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle size={22} />
                <h3 className="font-bold text-lg">تدقيق القيود غير المتوازنة المسببة لفرق الميزان</h3>
              </div>
              <button 
                onClick={() => setShowUnbalancedModal(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-red-700 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* محتوى النافذة */}
            <div className="p-6 overflow-y-auto space-y-6">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-900 text-sm flex items-center justify-between">
                <div>
                  <span className="font-bold block">إجمالي فارق عدم التوازن: {Math.abs(totals.closeDr - totals.closeCr).toFixed(2)} ج.م</span>
                  <span className="text-xs text-red-700">تم كشف القيود المرحلة التي تسببت في عدم تساوي المدين والدائن في الأستاذ العام.</span>
                </div>
                <span className="bg-red-600 text-white text-xs px-3 py-1 rounded-full font-bold">
                  {unbalancedAudit.entries.length} قيد غير متوازن
                </span>
              </div>

              {unbalancedAudit.entries.map((entry) => (
                <div key={entry.id} className="border border-slate-200 rounded-xl p-4 bg-white shadow-xs space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold bg-slate-100 text-slate-800 px-2.5 py-1 rounded text-sm">
                        {entry.reference}
                      </span>
                      <span className="font-bold text-slate-800 text-sm">{entry.description || 'بدون بيان'}</span>
                      <span className="text-xs text-slate-400">({entry.transaction_date})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-red-100 text-red-800">
                        الفارق: {entry.absDifference.toFixed(2)} ج.م {entry.difference > 0 ? '(مدين أكبر)' : '(دائن أكبر)'}
                      </span>
                    </div>
                  </div>

                  {/* جدول أسطر هذا القيد */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-right border-collapse">
                      <thead className="bg-slate-50 text-slate-600 border-y border-slate-200">
                        <tr>
                          <th className="p-2">كود الحساب</th>
                          <th className="p-2">اسم الحساب</th>
                          <th className="p-2">البيان</th>
                          <th className="p-2 text-left">مدين</th>
                          <th className="p-2 text-left">دائن</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {entry.lines.map((l: any, idx: number) => {
                          const acc = accounts.find(a => a.id === l.account_id);
                          return (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="p-2 font-mono text-slate-600">{acc?.code || 'UNKNOWN'}</td>
                              <td className="p-2 font-bold text-slate-800">{acc?.name || 'حساب غير معروف'}</td>
                              <td className="p-2 text-slate-500">{l.description || '-'}</td>
                              <td className="p-2 font-mono text-left text-blue-700">{l.debit > 0 ? Number(l.debit).toLocaleString() : '-'}</td>
                              <td className="p-2 font-mono text-left text-blue-700">{l.credit > 0 ? Number(l.credit).toLocaleString() : '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-slate-100 font-bold border-t border-slate-200">
                        <tr>
                          <td colSpan={3} className="p-2 text-center text-slate-700">مجموع القيد</td>
                          <td className="p-2 font-mono text-left text-blue-900">{entry.debit.toLocaleString()}</td>
                          <td className="p-2 font-mono text-left text-blue-900">{entry.credit.toLocaleString()}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* إجراءات سريعة على القيد */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                    <button
                      onClick={() => handleUnpostAndFix(entry.id)}
                      disabled={isFixingEntry}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                    >
                      {isFixingEntry ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                      فك الترحيل فوراً (تحويل لمسودة لموازنة الميزان الآن)
                    </button>
                    <button
                      onClick={() => handleNavigateToEntry(entry)}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <ExternalLink size={14} />
                      تعديل في دفتر اليومية
                    </button>
                  </div>
                </div>
              ))}

              {/* في حال وجود أسطر معلقة بدون قيد */}
              {unbalancedAudit.orphanLines.length > 0 && (
                <div className="border border-amber-300 bg-amber-50 rounded-xl p-4 text-amber-900 text-xs space-y-2">
                  <div className="font-bold flex items-center gap-1.5 text-sm text-amber-800">
                    <AlertTriangle size={16} />
                    <span>تنبيه: تم العثور على {unbalancedAudit.orphanLines.length} أسطر معلقة في جدول الأستاذ العام بدون رأس قيد رئيسي.</span>
                  </div>
                  <p>هذه الحركات مسجلة مباشرة في الأستاذ العام وقد تسبب فروقات ميزان. يوصى بمراجعتها وحذفها من خلال تنظيف القيود في دفتر اليومية.</p>
                </div>
              )}
            </div>

            {/* تذييل النافذة */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setShowUnbalancedModal(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrialBalanceAdvanced;
