import { logger } from '../../utils/logger';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../../context/ToastContext';
import { useAccounting } from '../../context/AccountingContext';
import { Book, Filter, Search, Printer, FileSpreadsheet, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useLocation } from 'react-router-dom';
import ReportHeader from '../../components/ReportHeader';
import { getActiveOrgIdSync, resolveActiveOrgId } from '../../services/tenantContext';
import { fetchCompleteDataset } from '../../services/balanceService';

type Account = {
  id: string;
  code: string;
  name: string;
  parent_id: string | null;
  is_group: boolean;
};

type LedgerEntry = {
  id: string;
  debit: number;
  credit: number;
  balance: number; // إضافة حقل الرصيد هنا
  journal_entries: {
    id: string;
    transaction_date: string;
    reference: string;
    description: string;
    is_posted: boolean;
  };
};

const GeneralLedger = () => {
  const location = useLocation();
  const { accounts, currentUser, currentSelectedOrgId, customers, selectedFiscalYear, fiscalYearRange } = useAccounting(); // إضافة العملاء من السياق
  const { showToast } = useToast();
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [accountSearch, setAccountSearch] = useState('');
  const [startDate, setStartDate] = useState(fiscalYearRange.startDate);
  const [endDate, setEndDate] = useState(`${selectedFiscalYear}-12-31`);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const PAGE_SIZE = 50;

  // مزامنة التواريخ تلقائياً عند تغيير السنة المالية المختارة من شريط النظام
  useEffect(() => {
    if (selectedFiscalYear) {
      setStartDate(`${selectedFiscalYear}-01-01`);
      setEndDate(`${selectedFiscalYear}-12-31`);
    }
  }, [selectedFiscalYear]);
  
  // لتخزين معايير البحث الحالية لضمان استمرار التحميل بنفس الشروط
  const [searchParamsState, setSearchParamsState] = useState<{ids: string[], start: string, end: string, customerEntryIds: string[] | null} | null>(null);
  
  const observer = useRef<IntersectionObserver | null>(null);
  const lastEntryRef = useCallback((node: HTMLTableRowElement) => {
    if (loading) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        setPage(prevPage => prevPage + 1);
      }
    });
    if (node) observer.current.observe(node);
  }, [loading, hasMore]);

  // استقبال البيانات من الصفحات الأخرى (Drill-down)
  useEffect(() => {
    if (location.state?.accountId) {
      setSelectedAccount(location.state.accountId);
      if (location.state.startDate) setStartDate(location.state.startDate);
      if (location.state.endDate) setEndDate(location.state.endDate);
      // تفعيل البحث تلقائياً بعد مهلة قصيرة لضمان تحميل الحالة
      setTimeout(() => document.getElementById('search-btn')?.click(), 100);
    }
  }, [location.state]);

  const filteredAccounts = useMemo(() => {
    return accounts.filter(acc => 
      acc.name.toLowerCase().includes(accountSearch.toLowerCase()) || 
      acc.code.includes(accountSearch)
    );
  }, [accounts, accountSearch]);

  // دالة مساعدة لجلب معرفات الحساب والحسابات الفرعية (شجرياً)
  const getAccountAndChildrenIds = (accountId: string, allAccounts: Account[]): string[] => {
    let ids: string[] = [accountId];
    const children = allAccounts.filter(a => a.parent_id === accountId);
    children.forEach(child => {
      ids = [...ids, ...getAccountAndChildrenIds(child.id, allAccounts)];
    });
    return ids;
  };

  const handleSearch = async () => {
    if (!selectedAccount) return;
    setPage(0);
    setLoading(true);

    // دعم وضع الديمو
    if (currentUser?.role === 'demo') {
        setTimeout(() => {
            setOpeningBalance(5000);
            setEntries([
                { 
                    id: 'demo-1', debit: 1000, credit: 0, balance: 6000, 
                    journal_entries: { id: 'j1', transaction_date: new Date().toISOString(), reference: 'INV-001', description: 'فاتورة مبيعات آجلة', is_posted: true } 
                },
                { 
                    id: 'demo-2', debit: 0, credit: 2000, balance: 4000, 
                    journal_entries: { id: 'j2', transaction_date: new Date().toISOString(), reference: 'RCT-001', description: 'سداد من العميل', is_posted: true } 
                }
            ]);
            setLoading(false);
        }, 500);
        return;
    }

    try {
      // تحديد الحسابات المستهدفة (الحساب المختار + أبنائه)
      const targetAccountIds = getAccountAndChildrenIds(selectedAccount, accounts as unknown as Account[]);
      
      // 🛡️ تحديد هوية المنظمة الموحدة والمحصنة
      let userOrgId: string | undefined | null =
        getActiveOrgIdSync(currentSelectedOrgId) ||
        (currentUser as any)?.organization_id ||
        (currentUser as any)?.user_metadata?.org_id;

      if (!userOrgId) {
        userOrgId = await resolveActiveOrgId(currentSelectedOrgId);
      }

      if (!userOrgId) {
        throw new Error('تعذر تحديد المنظمة التابع لها.');
      }

      // --- منطق فلترة العميل ---
      let customerEntryIds: string[] | null = null;
      if (selectedCustomerId) {
        // جلب معرفات القيود المرتبطة بكافة مستندات هذا العميل
        const [inv, rec, ret, cn, restOrders] = await Promise.all([
          supabase.from('invoices').select('related_journal_entry_id').eq('customer_id', selectedCustomerId).not('related_journal_entry_id', 'is', null),
          supabase.from('receipt_vouchers').select('related_journal_entry_id').eq('customer_id', selectedCustomerId).not('related_journal_entry_id', 'is', null),
          supabase.from('sales_returns').select('related_journal_entry_id').eq('customer_id', selectedCustomerId).not('related_journal_entry_id', 'is', null),
          supabase.from('credit_notes').select('related_journal_entry_id').eq('customer_id', selectedCustomerId).not('related_journal_entry_id', 'is', null),
          supabase.from('orders').select('related_journal_entry_id').eq('customer_id', selectedCustomerId).not('related_journal_entry_id', 'is', null) // إضافة طلبات المطعم
        ]);

        customerEntryIds = Array.from(new Set([
          ...(inv.data?.map(i => i.related_journal_entry_id) || []),
          ...(rec.data?.map(r => r.related_journal_entry_id) || []),
          ...(ret.data?.map(r => r.related_journal_entry_id) || []),
          ...(cn.data?.map(c => c.related_journal_entry_id) || []),
          ...(restOrders.data?.map(o => o.related_journal_entry_id) || [])
        ]));

        if (customerEntryIds.length === 0) {
          showToast('لا توجد حركات محاسبية مسجلة لهذا العميل', 'info');
          setEntries([]);
          setOpeningBalance(0);
          setLoading(false);
          return;
        }
      }

      // حفظ المعايير لاستخدامها في التصفح اللانهائي
      setSearchParamsState({ ids: targetAccountIds, start: startDate, end: endDate, customerEntryIds });

      // 1. حساب رصيد ما قبل الفترة (Opening Balance)
      let openBal = 0;
      let rpcSucceeded = false;

      // 🚀 محاولة استعلام الدالة المجمعة السريعة على الخادم في حال عدم وجود فلتر لعميل معين
      if (!customerEntryIds) {
        try {
          const { data: rpcBal, error: rpcErr } = await supabase.rpc('get_account_opening_balance_rpc', {
            p_account_ids: targetAccountIds,
            p_start_date: startDate || '1970-01-01',
            p_org_id: userOrgId
          });

          if (!rpcErr && rpcBal !== null && rpcBal !== undefined) {
            openBal = Number(rpcBal);
            rpcSucceeded = true;
          }
        } catch (rpcEx) {
          logger.warn('[GeneralLedger] RPC opening balance fallback to client query:', rpcEx);
        }
      }

      // 🛡️ Graceful Degradation: الرجوع للاستعلام العادي إذا لم تنجح الدالة أو إذا كان هناك فلتر عميل (مقسم لتجاوز سقف 1000)
      if (!rpcSucceeded) {
        const openingData = await fetchCompleteDataset(async (from, to) => {
          let openingQuery = supabase
            .from('journal_lines')
            .select('debit, credit, journal_entries!inner(transaction_date, status, organization_id)')
            .in('account_id', targetAccountIds)
            .eq('journal_entries.status', 'posted')
            .eq('journal_entries.organization_id', userOrgId)
            .lt('journal_entries.transaction_date', startDate || '1970-01-01');

          if (customerEntryIds) {
            openingQuery = openingQuery.in('journal_entry_id', customerEntryIds);
          }

          return openingQuery.range(from, to);
        });

        // الرصيد الافتتاحي = مجموع المدين - مجموع الدائن (للفترة السابقة)
        openBal = openingData?.reduce((sum, line: { debit?: number; credit?: number }) => sum + (Number(line.debit || 0) - Number(line.credit || 0)), 0) || 0;
      }

      setOpeningBalance(openBal);

      // 2. جلب الصفحة الأولى من البيانات
      await fetchPageData(0, targetAccountIds, startDate, endDate, openBal, true, customerEntryIds);

    } catch (error) {
      showToast('حدث خطأ أثناء جلب البيانات: ' + error.message, 'error');
      setLoading(false);
    }
  };

  // دالة جلب البيانات (تستخدم للبحث الأولي ولتحميل المزيد)
  const fetchPageData = async (pageIndex: number, ids: string[], start: string, end: string, baseBalance: number, isReset: boolean, customerEntryIds: string[] | null) => {
    setLoading(true);
    try {
      const from = pageIndex * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let userOrgId: string | undefined | null =
        getActiveOrgIdSync(currentSelectedOrgId) ||
        (currentUser as any)?.organization_id ||
        (currentUser as any)?.user_metadata?.org_id;

      if (!userOrgId) {
        userOrgId = await resolveActiveOrgId(currentSelectedOrgId);
      }

      if (!userOrgId) {
        throw new Error('تعذر تحديد المنظمة.');
      }

      let query = supabase
        .from('journal_lines')
        .select(`
          id, debit, credit,
          journal_entries!inner ( 
            id, transaction_date, reference, description, status, organization_id
          )
        `) 
        .in('account_id', ids)
        .eq('journal_entries.status', 'posted')
        .eq('journal_entries.organization_id', userOrgId)
        .gte('journal_entries.transaction_date', start || '1970-01-01')
        .lte('journal_entries.transaction_date', end)
        .order('transaction_date', { foreignTable: 'journal_entries', ascending: true });

      if (customerEntryIds) {
        query = query.in('journal_entry_id', customerEntryIds);
      }

      const { data: periodData, error: periodError } = await query.range(from, to);

      if (periodError) throw periodError;

      // حساب الرصيد التراكمي
      let running = baseBalance;
      
      const processedData = (periodData as any[]).map((item: any) => {
          running += (item.debit - item.credit);
          return { ...item, balance: running };
      });

      if (isReset) {
        setEntries(processedData);
      } else {
        setEntries(prev => [...prev, ...processedData]);
      }

      // التحقق مما إذا كان هناك المزيد من البيانات
      setHasMore(periodData.length === PAGE_SIZE);

    } catch (err) {
      logger.error(err);
      showToast('خطأ في تحميل البيانات', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Effect لتحميل المزيد عند تغيير الصفحة
  useEffect(() => {
    if (page > 0 && searchParamsState) {
      // حساب الرصيد الأخير من القائمة الحالية لنبدأ منه
      const lastBalance = entries.length > 0 ? entries[entries.length - 1].balance : openingBalance;
      fetchPageData(page, searchParamsState.ids, searchParamsState.start, searchParamsState.end, lastBalance, false, searchParamsState.customerEntryIds);
    }
  }, [page]);

  const [isExporting, setIsExporting] = useState(false);

  const handleExportExcel = async () => {
    if (!selectedAccount) {
      showToast('يرجى اختيار الحساب أولاً لتصدير كشف الحساب.', 'warning');
      return;
    }

    setIsExporting(true);

    try {
      const currentAccount = accounts.find(a => a.id === selectedAccount);
      const accountCode = currentAccount?.code || '';
      const accountName = currentAccount?.name || 'حساب';
      const customerName = selectedCustomerId 
        ? customers.find(c => c.id === selectedCustomerId)?.name 
        : null;

      let exportEntries: LedgerEntry[] = [];
      let exportOpeningBal = openingBalance;

      // دعم وضع الديمو
      if (currentUser?.role === 'demo') {
        exportOpeningBal = openingBalance || 5000;
        exportEntries = entries.length > 0 ? entries : [
          { 
            id: 'demo-1', debit: 1000, credit: 0, balance: 6000, 
            journal_entries: { id: 'j1', transaction_date: new Date().toISOString(), reference: 'INV-001', description: 'فاتورة مبيعات آجلة', is_posted: true } 
          },
          { 
            id: 'demo-2', debit: 0, credit: 2000, balance: 4000, 
            journal_entries: { id: 'j2', transaction_date: new Date().toISOString(), reference: 'RCT-001', description: 'سداد من العميل', is_posted: true } 
          }
        ];
      } else {
        const targetAccountIds = getAccountAndChildrenIds(selectedAccount, accounts as unknown as Account[]);

        let userOrgId: string | undefined | null =
          getActiveOrgIdSync(currentSelectedOrgId) ||
          (currentUser as any)?.organization_id ||
          (currentUser as any)?.user_metadata?.org_id;

        if (!userOrgId) {
          userOrgId = await resolveActiveOrgId(currentSelectedOrgId);
        }

        if (!userOrgId) {
          throw new Error('تعذر تحديد المنظمة.');
        }

        // قيود العميل إن كانت محددة
        let customerEntryIds = searchParamsState?.customerEntryIds || null;
        if (selectedCustomerId && !customerEntryIds) {
          const [inv, rec, ret, cn, restOrders] = await Promise.all([
            supabase.from('invoices').select('related_journal_entry_id').eq('customer_id', selectedCustomerId).not('related_journal_entry_id', 'is', null),
            supabase.from('receipt_vouchers').select('related_journal_entry_id').eq('customer_id', selectedCustomerId).not('related_journal_entry_id', 'is', null),
            supabase.from('sales_returns').select('related_journal_entry_id').eq('customer_id', selectedCustomerId).not('related_journal_entry_id', 'is', null),
            supabase.from('credit_notes').select('related_journal_entry_id').eq('customer_id', selectedCustomerId).not('related_journal_entry_id', 'is', null),
            supabase.from('orders').select('related_journal_entry_id').eq('customer_id', selectedCustomerId).not('related_journal_entry_id', 'is', null)
          ]);

          customerEntryIds = Array.from(new Set([
            ...(inv.data?.map(i => i.related_journal_entry_id) || []),
            ...(rec.data?.map(r => r.related_journal_entry_id) || []),
            ...(ret.data?.map(r => r.related_journal_entry_id) || []),
            ...(cn.data?.map(c => c.related_journal_entry_id) || []),
            ...(restOrders.data?.map(o => o.related_journal_entry_id) || [])
          ]));
        }

        // إذا كانت البيانات محملة بالكامل لنفس الحساب ونفس الفترة
        const isCurrentDataMatching = searchParamsState &&
          searchParamsState.start === startDate &&
          searchParamsState.end === endDate &&
          searchParamsState.ids[0] === selectedAccount;

        if (isCurrentDataMatching && !hasMore && entries.length > 0) {
          exportEntries = entries;
          exportOpeningBal = openingBalance;
        } else {
          // حساب الرصيد الافتتاحي
          if (!isCurrentDataMatching) {
            let rpcSucceeded = false;
            let openBal = 0;
            if (!customerEntryIds) {
              try {
                const { data: rpcBal, error: rpcErr } = await supabase.rpc('get_account_opening_balance_rpc', {
                  p_account_ids: targetAccountIds,
                  p_start_date: startDate || '1970-01-01',
                  p_org_id: userOrgId
                });
                if (!rpcErr && rpcBal !== null && rpcBal !== undefined) {
                  openBal = Number(rpcBal);
                  rpcSucceeded = true;
                }
              } catch (rpcEx) {
                logger.warn('[GeneralLedger] RPC opening balance fallback to client query:', rpcEx);
              }
            }

            if (!rpcSucceeded) {
              const openingData = await fetchCompleteDataset(async (from, to) => {
                let openingQuery = supabase
                  .from('journal_lines')
                  .select('debit, credit, journal_entries!inner(transaction_date, status, organization_id)')
                  .in('account_id', targetAccountIds)
                  .eq('journal_entries.status', 'posted')
                  .eq('journal_entries.organization_id', userOrgId)
                  .lt('journal_entries.transaction_date', startDate || '1970-01-01');

                if (customerEntryIds) {
                  openingQuery = openingQuery.in('journal_entry_id', customerEntryIds);
                }
                return openingQuery.range(from, to);
              });

              openBal = openingData?.reduce((sum, line: { debit?: number; credit?: number }) => sum + (Number(line.debit || 0) - Number(line.credit || 0)), 0) || 0;
            }
            exportOpeningBal = openBal;
          } else {
            exportOpeningBal = openingBalance;
          }

          // جلب كافة حركات الفترة بالكامل
          const periodLines = await fetchCompleteDataset(async (from, to) => {
            let query = supabase
              .from('journal_lines')
              .select(`
                id, debit, credit,
                journal_entries!inner ( 
                  id, transaction_date, reference, description, status, organization_id
                )
              `) 
              .in('account_id', targetAccountIds)
              .eq('journal_entries.status', 'posted')
              .eq('journal_entries.organization_id', userOrgId)
              .gte('journal_entries.transaction_date', startDate || '1970-01-01')
              .lte('journal_entries.transaction_date', endDate)
              .order('transaction_date', { foreignTable: 'journal_entries', ascending: true });

            if (customerEntryIds) {
              query = query.in('journal_entry_id', customerEntryIds);
            }
            return query.range(from, to);
          });

          let running = exportOpeningBal;
          exportEntries = (periodLines as Record<string, any>[]).map(item => {
            running += (Number(item.debit || 0) - Number(item.credit || 0));
            return { ...item, balance: running } as LedgerEntry;
          });
        }
      }

      if (exportEntries.length === 0 && exportOpeningBal === 0) {
        showToast('لا توجد حركات أو أرصدة لهذا الحساب خلال الفترة المحددة.', 'info');
        return;
      }

      const totalDebit = exportEntries.reduce((sum, e) => sum + Number(e.debit || 0), 0);
      const totalCredit = exportEntries.reduce((sum, e) => sum + Number(e.credit || 0), 0);
      const finalBalance = exportEntries.length > 0
        ? exportEntries[exportEntries.length - 1].balance
        : exportOpeningBal;

      // إعداد صفوف ملف الإكسيل
      const sheetData: (string | number)[][] = [
        ['دفتر الأستاذ العام - كشف حساب'],
        ['الحساب:', `${accountCode} - ${accountName}`],
        ['الفترة من:', startDate, 'إلى:', endDate],
      ];

      if (customerName) {
        sheetData.push(['العميل:', customerName]);
      }

      sheetData.push(['تاريخ الاستخراج:', new Date().toLocaleString('ar-EG')]);
      sheetData.push([]); // سطر فارغ

      // رأس الجدول
      sheetData.push(['التاريخ', 'رقم القيد / المرجع', 'البيان', 'مدين', 'دائن', 'الرصيد']);

      // سطر الرصيد الافتتاحي
      sheetData.push([
        '-',
        '-',
        'رصيد ما قبل الفترة (افتتاحي)',
        0,
        0,
        Number(exportOpeningBal.toFixed(2))
      ]);

      // أسطر الحركات
      exportEntries.forEach(entry => {
        let dateStr = '-';
        if (entry.journal_entries?.transaction_date) {
          const d = new Date(entry.journal_entries.transaction_date);
          dateStr = !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : String(entry.journal_entries.transaction_date);
        }

        sheetData.push([
          dateStr,
          entry.journal_entries?.reference || '-',
          entry.journal_entries?.description || '-',
          Number(Number(entry.debit || 0).toFixed(2)),
          Number(Number(entry.credit || 0).toFixed(2)),
          Number(Number(entry.balance || 0).toFixed(2))
        ]);
      });

      // سطر الإجمالي والرصيد الختامي
      sheetData.push([
        'الإجمالي والرصيد الختامي',
        '-',
        '-',
        Number(totalDebit.toFixed(2)),
        Number(totalCredit.toFixed(2)),
        Number(finalBalance.toFixed(2))
      ]);

      const ws = XLSX.utils.aoa_to_sheet(sheetData);

      ws['!cols'] = [
        { wch: 15 }, // التاريخ
        { wch: 18 }, // رقم القيد / المرجع
        { wch: 45 }, // البيان
        { wch: 16 }, // مدين
        { wch: 16 }, // دائن
        { wch: 18 }, // الرصيد
      ];

      // إعداد العرض من اليمين إلى اليسار
      ws['!views'] = [{ rightToLeft: true }];

      const wb = XLSX.utils.book_new();
      const safeSheetName = (accountName || 'دفتر الأستاذ')
        .replace(/[\\/?*:[\]]/g, '')
        .trim()
        .slice(0, 30) || 'دفتر الأستاذ';
      XLSX.utils.book_append_sheet(wb, ws, safeSheetName);

      const codePrefix = accountCode ? `${accountCode}_` : '';
      const cleanName = `${codePrefix}${accountName}`.replace(/[/\\?%*:|"<>]/g, '_');
      const fileName = `General_Ledger_${cleanName}_${startDate}_${endDate}.xlsx`;

      XLSX.writeFile(wb, fileName);
      showToast('تم تصدير كشف الحساب إلى Excel بنجاح', 'success');

    } catch (err) {
      const errorObj = err as Error;
      logger.error('[GeneralLedger] Export error:', err);
      showToast('حدث خطأ أثناء تصدير Excel: ' + (errorObj?.message || 'خطأ غير متوقع'), 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="p-6 bg-white rounded-xl shadow-sm border border-slate-200 min-h-[80vh]">
      <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4 no-print">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Book className="text-blue-600" />
          دفتر الأستاذ العام
        </h1>
        <div className="flex items-center gap-2">
          <button 
            onClick={handleExportExcel}
            disabled={!selectedAccount || isExporting}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 font-bold text-sm shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="تصدير كشف الحساب إلى Excel"
          >
            {isExporting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>جاري التصدير...</span>
              </>
            ) : (
              <>
                <FileSpreadsheet size={16} />
                <span>تصدير Excel</span>
              </>
            )}
          </button>
          <button onClick={handlePrint} className="flex items-center gap-2 bg-slate-100 text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-200 font-bold text-sm">
            <Printer size={16} /> طباعة
          </button>
        </div>
      </div>

      {/* فلاتر البحث */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8 bg-slate-50 p-4 rounded-xl border border-slate-200 no-print">
        <div className="md:col-span-2">
            <label className="block text-sm font-bold text-slate-700 mb-1">ابحث واختر الحساب</label>
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <input 
                        type="text" 
                        placeholder="بحث بالكود أو الاسم..."
                        value={accountSearch}
                        onChange={(e) => setAccountSearch(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 pr-10 focus:outline-none focus:border-blue-500 text-sm"
                    />
                    <Search className="absolute right-3 top-2.5 text-slate-400" size={16} />
                </div>
                <select 
                    value={selectedAccount}
                    onChange={(e) => setSelectedAccount(e.target.value)}
                    className="border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 flex-[2]"
                >
                    <option value="">-- اختر حساب ({filteredAccounts.length}) --</option>
                    {filteredAccounts.map(acc => (
                        <option key={acc.id} value={acc.id} className={acc.is_group ? 'font-bold bg-slate-100' : ''}>
                            {acc.code} - {acc.name} {acc.is_group ? '(رئيسي)' : ''}
                        </option>
                    ))}
                </select>
            </div>
        </div>
        <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">تصفية حسب العميل (اختياري)</label>
            <select 
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 bg-white text-sm"
            >
                <option value="">-- كل العملاء --</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
        </div>
        <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">من تاريخ</label>
            <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
            />
        </div>
        <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">إلى تاريخ</label>
            <input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
            />
        </div>
        <div className="md:col-span-4 flex justify-end gap-3">
            <button 
                onClick={handleExportExcel}
                disabled={!selectedAccount || isExporting}
                className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-lg hover:bg-emerald-700 font-bold shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="تصدير كشف الحساب إلى Excel"
            >
                {isExporting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>جاري التصدير...</span>
                  </>
                ) : (
                  <>
                    <FileSpreadsheet size={18} />
                    <span>تصدير Excel</span>
                  </>
                )}
            </button>
            <button 
                onClick={handleSearch}
                id="search-btn"
                disabled={!selectedAccount || loading}
                className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 font-bold shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {loading ? 'جاري البحث...' : <><Search size={18} /> عرض التقرير</>}
            </button>
        </div>
      </div>

      {/* ترويسة التقرير (للطباعة فقط) */}
      <ReportHeader 
        title="كشف حساب (دفتر الأستاذ)" 
        subtitle={`${accounts.find(a => a.id === selectedAccount)?.name || ''} - الفترة من ${startDate} إلى ${endDate}`} 
      />

      {/* شريط معلومات الحساب والتصدير السريع أعلى الجدول */}
      {selectedAccount && (
        <div className="flex flex-wrap justify-between items-center mb-4 p-3 bg-slate-50 border border-slate-200 rounded-lg no-print">
          <div className="flex items-center gap-2 text-slate-700 font-bold text-sm">
            <span className="text-blue-600">الحساب المحدد:</span>
            <span>{accounts.find(a => a.id === selectedAccount)?.code} - {accounts.find(a => a.id === selectedAccount)?.name}</span>
            <span className="text-xs text-slate-500 font-normal">({entries.length} حركة معروضة)</span>
          </div>
          <button 
            onClick={handleExportExcel}
            disabled={isExporting}
            className="flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-1.5 rounded-md hover:bg-emerald-700 font-bold text-xs shadow-sm transition-colors disabled:opacity-50"
            title="تصدير كشف الحساب إلى Excel"
          >
            {isExporting ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
            <span>تصدير كشف الحساب (Excel)</span>
          </button>
        </div>
      )}

      {/* جدول البيانات */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-right border-collapse">
            <thead className="bg-slate-100 text-slate-600 font-bold">
                <tr>
                    <th className="p-3 border border-slate-200">التاريخ</th>
                    <th className="p-3 border border-slate-200">رقم القيد</th>
                    <th className="p-3 border border-slate-200">البيان</th>
                    <th className="p-3 border border-slate-200 text-center">مدين</th>
                    <th className="p-3 border border-slate-200 text-center">دائن</th>
                    <th className="p-3 border border-slate-200 text-center">الرصيد</th>
                </tr>
            </thead>
            <tbody>
                {/* سطر الرصيد الافتتاحي */}
                <tr className="bg-yellow-50 font-bold">
                    <td className="p-3 border border-slate-200" colSpan={3}>رصيد ما قبل الفترة (افتتاحي)</td>
                    <td className="p-3 border border-slate-200 text-center">-</td>
                    <td className="p-3 border border-slate-200 text-center">-</td>
                    <td className="p-3 border border-slate-200 text-center" dir="ltr">{openingBalance.toFixed(2)}</td>
                </tr>

                {entries.length > 0 ? entries.map((entry, index) => {
                    // إضافة ref لآخر عنصر فقط لتفعيل التحميل اللانهائي
                    const isLastElement = index === entries.length - 1;
                    return (
                        <tr 
                            key={entry.id} 
                            ref={isLastElement ? lastEntryRef : null}
                            className="hover:bg-slate-50 transition-colors"
                        >
                            <td className="p-3 border border-slate-200 whitespace-nowrap">
                                {new Date(entry.journal_entries.transaction_date).toLocaleDateString('ar-EG')}
                            </td>
                            <td className="p-3 border border-slate-200 font-mono">
                                {entry.journal_entries.reference}
                            </td>
                            <td className="p-3 border border-slate-200 max-w-xs truncate">
                                {entry.journal_entries.description}
                            </td>
                            <td className="p-3 border border-slate-200 text-center font-mono text-emerald-600">
                                {entry.debit > 0 ? entry.debit.toFixed(2) : '-'}
                            </td>
                            <td className="p-3 border border-slate-200 text-center font-mono text-red-600">
                                {entry.credit > 0 ? entry.credit.toFixed(2) : '-'}
                            </td>
                            <td className="p-3 border border-slate-200 text-center font-mono font-bold" dir="ltr">
                                {entry.balance.toFixed(2)}
                            </td>
                        </tr>
                    );
                }) : (
                    <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-500">
                            {loading ? 'جاري التحميل...' : 'لا توجد حركات مرحلة لهذا الحساب خلال الفترة المحددة'}
                        </td>
                    </tr>
                )}
                
                {loading && page > 0 && (
                    <tr><td colSpan={6} className="p-4 text-center text-blue-600 font-bold">جاري تحميل المزيد...</td></tr>
                )}
                
                {/* سطر الإجماليات */}
                <tr className="bg-slate-100 font-bold">
                    <td className="p-3 border border-slate-200" colSpan={3}>الإجمالي والرصيد الختامي</td>
                    <td className="p-3 border border-slate-200 text-center text-emerald-700">
                        {entries.reduce((sum, e) => sum + e.debit, 0).toFixed(2)}
                    </td>
                    <td className="p-3 border border-slate-200 text-center text-red-700">
                        {entries.reduce((sum, e) => sum + e.credit, 0).toFixed(2)}
                    </td>
                    <td className="p-3 border border-slate-200 text-center text-blue-700" dir="ltr">
                        {entries.length > 0 ? entries[entries.length - 1].balance.toFixed(2) : openingBalance.toFixed(2)}
                    </td>
                </tr>
            </tbody>
        </table>
      </div>
    </div>
  );
};

export default GeneralLedger;
