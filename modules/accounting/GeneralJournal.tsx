import { logger } from '../../utils/logger';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { Loader2, AlertTriangle, Filter } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAccounting } from '../../context/AccountingContext';
import { JournalEntry } from '../../types';
import { useToastNotification } from '../../utils/toastUtils';
import { usePagination } from '../../components/usePagination';
import { journalAuditService } from '../../services/journalAuditService';

// المكونات الفرعية المفككة
import { getEntrySource } from './components/GeneralJournal/journalSourceClassifier';
import { printJournalEntry, exportJournalToExcel } from './components/GeneralJournal/journalExportUtils';
import { JournalAdvancedFilters } from './components/GeneralJournal/JournalAdvancedFilters';
import { JournalFiscalYearBar } from './components/GeneralJournal/JournalFiscalYearBar';
import { JournalActionBar } from './components/GeneralJournal/JournalActionBar';
import { JournalEntryCard } from './components/GeneralJournal/JournalEntryCard';
import { JournalPagination } from './components/GeneralJournal/JournalPagination';
import { JournalOrphanAlert } from './components/GeneralJournal/JournalOrphanAlert';
import { CurrencyRevaluationModal } from './components/CurrencyRevaluationModal';

const GeneralJournal: React.FC = () => {
  const { 
    refreshData, 
    can, 
    clearCache, 
    users, 
    currentUser, 
    accounts, 
    selectedFiscalYear, 
    fiscalYearRange, 
    settings, 
    currentSelectedOrgId,
    entries: contextEntries 
  } = useAccounting();

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState('');
  const toast = useToastNotification();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  // Advanced filters state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [filterAccountId, setFilterAccountId] = useState('');
  const [filterAmount, setFilterAmount] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [startDate, setStartDate] = useState(fiscalYearRange.startDate);
  const [endDate, setEndDate] = useState(fiscalYearRange.endDate);
  const [ignoreDateFilter, setIgnoreDateFilter] = useState(false);
  
  // تحكم الصفحات وحجمها
  const [pageSize, setPageSize] = useState(20);

  // كشف وتنظيف قيود الموردين المحذوفين
  const [detectedOrphanEntry, setDetectedOrphanEntry] = useState<any>(null);
  const [isCleaningSuppliers, setIsCleaningSuppliers] = useState(false);
  const [isCleaningDuplicates, setIsCleaningDuplicates] = useState(false);
  const [isCleaningAssets, setIsCleaningAssets] = useState(false);
  const [showCurrencyRevaluation, setShowCurrencyRevaluation] = useState(false);
  
  // كشف القيود غير المتوازنة وتدقيق الأستاذ العام
  const [unbalancedAudit, setUnbalancedAudit] = useState<{
    count: number;
    totalDiff: number;
    ids: string[];
  } | null>(null);
  const [isAuditingBalance, setIsAuditingBalance] = useState(false);

  const [matchingEntryIds, setMatchingEntryIds] = useState<string[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  // مزامنة نطاق التواريخ تلقائياً عند تغيير السنة المالية المختارة من شريط النظام
  useEffect(() => {
    if (selectedFiscalYear) {
      setStartDate(`${selectedFiscalYear}-01-01`);
      setEndDate(`${selectedFiscalYear}-12-31`);
    }
  }, [selectedFiscalYear]);

  useEffect(() => {
    const targetEntryId = location.state?.highlightEntryId || sessionStorage.getItem('tripro_unbalanced_entry_id');
    if (targetEntryId) {
      sessionStorage.removeItem('tripro_unbalanced_entry_id');
      setMatchingEntryIds([targetEntryId]);
      setShowAdvanced(true);
      setIgnoreDateFilter(true);
      if (location.state?.initialSearch) {
        setSearchTerm(location.state.initialSearch);
      }
      return;
    }

    if (location.state?.initialSearch) {
      setSearchTerm(location.state.initialSearch);
    }
    try {
      const sessionFilter = sessionStorage.getItem('tripro_initial_filter_status');
      if (sessionFilter) {
        sessionStorage.removeItem('tripro_initial_filter_status');
        setFilterStatus(sessionFilter);
        setShowAdvanced(true);
        setIgnoreDateFilter(true);
        return;
      }
    } catch (_) {}
    if (location.state?.initialFilterStatus) {
      setFilterStatus(location.state.initialFilterStatus);
      setShowAdvanced(true);
      setIgnoreDateFilter(true);
    }
  }, [location.state]);

  // تأخير البحث
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // 🔍 فحص استباقي عن قيد المورد المحذوف (مثل شركة هاي مكس برصيد 9114)
  const checkOrphanSuppliers = useCallback(async () => {
    try {
      const { data: entries } = await supabase
        .from('journal_entries')
        .select('id, reference, description, transaction_date')
        .or('reference.ilike.%ff424006-cf5e-4b01-bcda-4fe250a67c2a%,description.ilike.%هاي مكس%,description.ilike.%هاى مكس%')
        .limit(1);

      if (entries && entries.length > 0) {
        setDetectedOrphanEntry(entries[0]);
      } else {
        setDetectedOrphanEntry(null);
      }
    } catch (e) {
      logger.warn('Error checking orphan entries:', e);
    }
  }, []);

  // 🔍 فحص استباقي لكافة القيود غير المتوازنة في الأستاذ العام
  const checkUnbalancedEntries = useCallback(async () => {
    try {
      setIsAuditingBalance(true);
      const orgId = currentSelectedOrgId || (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;
      const res = await journalAuditService.findUnbalancedEntries(orgId, 'all');
      if (res.unbalancedIds.length > 0) {
        setUnbalancedAudit({
          count: res.unbalancedIds.length,
          totalDiff: res.totalDifference,
          ids: res.unbalancedIds
        });
      } else {
        setUnbalancedAudit(null);
      }
    } catch (e) {
      logger.warn('Error auditing journal balance:', e);
    } finally {
      setIsAuditingBalance(false);
    }
  }, [currentSelectedOrgId, currentUser]);

  useEffect(() => {
    checkOrphanSuppliers();
    checkUnbalancedEntries();
  }, [checkOrphanSuppliers, checkUnbalancedEntries, currentSelectedOrgId]);

  // البحث المتقدم في الحسابات والمبالغ والبيانات عبر الجداول المرتبطة وفلتر التوازن
  useEffect(() => {
    const performSearch = async () => {
      const isUnbalancedFilter = filterStatus === 'unbalanced' || filterStatus === 'posted_unbalanced';
      if (!debouncedSearch && !filterAccountId && !filterAmount && !isUnbalancedFilter) {
        setMatchingEntryIds(null);
        return;
      }

      setIsSearching(true);
      try {
        const orgId = currentSelectedOrgId || (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;
        const cleanSearch = debouncedSearch.replace(/,/g, '').trim();
        const foundIds = new Set<string>();

        // 1. إذا كان الفلتر يطلب القيود غير المتوازنة
        let unbalancedIdsSet: Set<string> | null = null;
        if (isUnbalancedFilter) {
          setIgnoreDateFilter(true);
          const auditRes = await journalAuditService.findUnbalancedEntries(
            orgId,
            filterStatus === 'posted_unbalanced' ? 'posted' : 'all'
          );
          unbalancedIdsSet = new Set(auditRes.unbalancedIds);
        }

        // 2. البحث في القيود الرئيسية (journal_entries) بالمرجع أو البيان
        if (cleanSearch) {
          const norm1 = cleanSearch.replace(/ى/g, 'ي').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه');
          const norm2 = cleanSearch.replace(/ي/g, 'ى').replace(/ا/g, 'أ');

          let entryQuery = supabase
            .from('journal_entries')
            .select('id, reference, description');
          
          if (orgId) {
            entryQuery = entryQuery.or(`organization_id.eq.${orgId},organization_id.is.null`);
          }

          const patterns = Array.from(new Set([cleanSearch, norm1, norm2]))
            .filter(Boolean)
            .map(p => `reference.ilike.%${p}%,description.ilike.%${p}%`)
            .join(',');

          const { data: entries } = await entryQuery.or(patterns).limit(150);
          if (entries) {
            entries.forEach(e => foundIds.add(e.id));
          }
        }

        // 3. البحث في أسطر القيود (journal_lines) بالمبلغ أو الحساب أو الوصف
        let linesQuery = supabase
          .from('journal_lines')
          .select('journal_entry_id');

        if (orgId) {
          linesQuery = linesQuery.or(`organization_id.eq.${orgId},organization_id.is.null`);
        }

        const lineConditions: string[] = [];

        if (filterAccountId) {
          lineConditions.push(`account_id.eq.${filterAccountId}`);
        }

        if (filterAmount) {
          const amtVal = parseFloat(filterAmount.replace(/,/g, ''));
          if (!isNaN(amtVal)) {
            lineConditions.push(`debit.eq.${amtVal}`, `credit.eq.${amtVal}`);
          }
        }

        if (cleanSearch) {
          const numVal = parseFloat(cleanSearch);
          if (!isNaN(numVal) && numVal > 0) {
            lineConditions.push(`debit.eq.${numVal}`, `credit.eq.${numVal}`);
          }

          lineConditions.push(`description.ilike.%${cleanSearch}%`);

          const matchingAccounts = accounts.filter(acc => 
            acc.name.toLowerCase().includes(cleanSearch.toLowerCase()) || 
            acc.code.includes(cleanSearch)
          );
          matchingAccounts.slice(0, 5).forEach(acc => {
            lineConditions.push(`account_id.eq.${acc.id}`);
          });
        }

        if (lineConditions.length > 0) {
          linesQuery = linesQuery.or(lineConditions.join(',')).limit(250);
          const { data: lines } = await linesQuery;
          if (lines) {
            lines.forEach(l => foundIds.add(l.journal_entry_id));
          }
        }

        // دمج النتائج مع فلتر القيود غير المتوازنة
        if (isUnbalancedFilter && unbalancedIdsSet !== null) {
          if (cleanSearch || filterAccountId || filterAmount) {
            const intersected = Array.from(foundIds).filter(id => unbalancedIdsSet!.has(id));
            setMatchingEntryIds(intersected);
          } else {
            if (unbalancedIdsSet.size > 0) {
              setMatchingEntryIds(Array.from(unbalancedIdsSet));
            } else {
              // مسار فحص البيانات المحلية كإجراء إضافي
              const localUnbalanced = (contextEntries || []).filter((e: Record<string, any>) => {
                const dr = (e.journal_lines || e.lines || []).reduce((s: number, l: any) => s + (Number(l.debit) || 0), 0);
                const cr = (e.journal_lines || e.lines || []).reduce((s: number, l: any) => s + (Number(l.credit) || 0), 0);
                return Math.abs(dr - cr) > 0.005;
              });
              if (localUnbalanced.length > 0) {
                setMatchingEntryIds(localUnbalanced.map((e: Record<string, any>) => e.id));
              } else {
                setMatchingEntryIds([]);
              }
            }
          }
        } else {
          setMatchingEntryIds(Array.from(foundIds));
        }
      } catch (err) {
        logger.error("Error performing search:", err);
      } finally {
        setIsSearching(false);
      }
    };

    performSearch();
  }, [debouncedSearch, filterAccountId, filterAmount, filterStatus, accounts, currentUser, currentSelectedOrgId, contextEntries]);

  // إعداد استعلام البيانات مع الفلترة
  const queryModifier = useCallback((query: Record<string, any>) => {
    if (matchingEntryIds !== null) {
      if (matchingEntryIds.length > 0) {
        query = query.in('id', matchingEntryIds);
      } else {
        query = query.eq('id', '00000000-0000-0000-0000-000000000000');
      }
    }
    
    if (selectedUser) {
      query = query.eq('user_id', selectedUser);
    }

    if (filterStatus) {
      if (filterStatus === 'posted_unbalanced') {
        query = query.eq('status', 'posted');
      } else if (filterStatus !== 'unbalanced') {
        query = query.eq('status', filterStatus);
      }
    }

    if (filterSource) {
      if (filterSource === 'sales_invoice') {
        query = query.or('reference.like.INV-%,reference.like.REC-INV-%,reference.like.POS-%,reference.like.SI-%,description.ilike.%فاتورة مبيعات%');
      } else if (filterSource === 'sales_return') {
        query = query.or('reference.like.SR-%,reference.like.SRET-%');
      } else if (filterSource === 'credit_note') {
        query = query.like('reference', 'CN-%');
      } else if (filterSource === 'purchase_invoice') {
        query = query.or('reference.like.PI-%,reference.like.PUR-%,reference.like.PINV-%');
      } else if (filterSource === 'purchase_return') {
        query = query.or('reference.like.PR-%,reference.like.PRET-%');
      } else if (filterSource === 'debit_note') {
        query = query.like('reference', 'DN-%');
      } else if (filterSource === 'receipt_voucher') {
        query = query.or('reference.like.RCT-%,reference.like.RV-%');
      } else if (filterSource === 'payment_voucher') {
        query = query.or('reference.like.PAY-%,reference.like.PV-%,reference.like.EXP-%');
      } else if (filterSource === 'cheque') {
        query = query.like('reference', 'CHQ-%');
      } else if (filterSource === 'asset_depreciation') {
        query = query.or('reference.like.DEP-%,reference.like.ASSET-%');
      } else if (filterSource === 'treasury_transfer') {
        query = query.or('reference.like.TRN-%,reference.like.TRF-%');
      } else if (filterSource === 'bank_adjustment') {
        query = query.or('reference.like.BANK-ADJ-%,reference.like.BNK-%,reference.like.BADJ-%');
      } else if (filterSource === 'cash_adjustment') {
        query = query.or('reference.like.CASH-ADJ-%,reference.like.CADJ-%,reference.like.CSH-%');
      } else if (filterSource === 'stock_adjustment') {
        query = query.or('reference.like.STK-ADJ-%,reference.like.ADJ-%,reference.like.REV-%');
      } else if (filterSource === 'payroll') {
        query = query.like('reference', 'PAYROLL-%');
      } else if (filterSource === 'shift_closing') {
        query = query.like('reference', 'SHIFT-%');
      } else if (filterSource === 'pharmacy') {
        query = query.like('reference', 'PHARM-%');
      } else if (filterSource === 'hims') {
        query = query.like('reference', 'HIMS-%');
      } else if (filterSource === 'opening_balance') {
        query = query.or('reference.like.OP-%,reference.like.OB-%,reference.like.OPENING-%');
      } else if (filterSource === 'manual_journal') {
        query = query
          .not('reference', 'like', 'INV-%')
          .not('reference', 'like', 'PUR-%')
          .not('reference', 'like', 'PINV-%')
          .not('reference', 'like', 'PI-%')
          .not('reference', 'like', 'RCT-%')
          .not('reference', 'like', 'RV-%')
          .not('reference', 'like', 'PAY-%')
          .not('reference', 'like', 'PV-%')
          .not('reference', 'like', 'EXP-%')
          .not('reference', 'like', 'DEP-%')
          .not('reference', 'like', 'TRN-%')
          .not('reference', 'like', 'TRF-%')
          .not('reference', 'like', 'ADJ-%')
          .not('reference', 'like', 'STK-%')
          .not('reference', 'like', 'REV-%')
          .not('reference', 'like', 'BANK-%')
          .not('reference', 'like', 'CASH-%')
          .not('reference', 'like', 'PAYROLL-%')
          .not('reference', 'like', 'CLOSE-%')
          .not('reference', 'like', 'SR-%')
          .not('reference', 'like', 'SRET-%')
          .not('reference', 'like', 'PR-%')
          .not('reference', 'like', 'PRET-%')
          .not('reference', 'like', 'DN-%')
          .not('reference', 'like', 'CN-%')
          .not('reference', 'like', 'OP-%')
          .not('reference', 'like', 'OB-%')
          .not('reference', 'like', 'ASSET-%')
          .not('reference', 'like', 'CHQ-%')
          .not('reference', 'like', 'SHIFT-%')
          .not('reference', 'like', 'PHARM-%')
          .not('reference', 'like', 'HIMS-%');
      }
    }

    const isUnbalancedFilter = filterStatus === 'unbalanced' || filterStatus === 'posted_unbalanced';
    const hasSearch = Boolean(debouncedSearch || filterAmount || isUnbalancedFilter);
    if (!ignoreDateFilter && !isUnbalancedFilter && !(hasSearch && matchingEntryIds && matchingEntryIds.length > 0)) {
      if (startDate) {
        query = query.gte('transaction_date', startDate);
      }
      if (endDate) {
        query = query.lte('transaction_date', endDate);
      }
    }

    return query;
  }, [matchingEntryIds, selectedUser, filterStatus, filterSource, startDate, endDate, ignoreDateFilter, debouncedSearch, filterAmount]);

  const { 
    data: serverEntries, 
    loading: serverLoading, 
    page, 
    setPage, 
    totalPages, 
    totalCount, 
    refresh 
  } = usePagination('journal_entries', {
    select: '*, journal_lines (*, accounts:account_id(id, code, name)), journal_attachments (*)',
    pageSize,
    orderBy: 'transaction_date',
    ascending: false,
    organizationId: currentSelectedOrgId || (currentUser as any)?.organization_id
  }, queryModifier);

  useEffect(() => {
    setPage(1);
    refresh();
  }, [matchingEntryIds, selectedUser, filterStatus, filterSource, startDate, endDate, ignoreDateFilter, pageSize, refresh, setPage]);

  const sortedAccounts = useMemo(() => {
    return [...accounts]
      .filter(a => !a.isGroup)
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [accounts]);

  const journalEntries = useMemo(() => {
    if (currentUser?.role === 'demo') {
      return [
        { id: 'demo-je-1', date: new Date().toISOString().split('T')[0], description: 'شراء أثاث مكتبي نقداً', reference: 'JE-DEMO-001', status: 'posted', is_posted: true, lines: [{ accountName: 'الأثاث والتجهيزات', accountCode: '1115', debit: 5000, credit: 0 }, { accountName: 'النقدية بالصندوق', accountCode: '10101', debit: 0, credit: 5000 }] },
        { id: 'demo-je-2', date: new Date().toISOString().split('T')[0], description: 'سداد فاتورة كهرباء', reference: 'JE-DEMO-002', status: 'posted', is_posted: true, lines: [{ accountName: 'كهرباء ومياه', accountCode: '50201', debit: 750, credit: 0 }, { accountName: 'النقدية بالصندوق', accountCode: '10101', debit: 0, credit: 750 }] }
      ] as any[];
    }

    return (serverEntries as Record<string, any>[]).map((entry) => ({
      id: entry.id,
      date: entry.transaction_date || entry.created_at?.split('T')[0],
      description: entry.description,
      reference: entry.reference,
      status: entry.status,
      is_posted: entry.status === 'posted',
      created_at: entry.created_at,
      createdAt: entry.created_at,
      userId: entry.user_id,
      attachments: entry.journal_attachments || [],
      lines: (entry.journal_lines || []).map((line: Record<string, any>) => {
        let account = accounts.find((a: Record<string, any>) => a.id === line.account_id) || line.accounts;
        
        if (!account && line.description) {
          if (line.description.includes('عمولة') || line.description.includes('تسويق') || line.description.includes('عمولات')) {
            account = accounts.find((a: Record<string, any>) => 
              a.code === '522' || a.code === '5221' || a.code === '5204' || a.code === '52' || a.code === '521'
            ) || accounts.find((a: Record<string, any>) => 
              (a.type === 'EXPENSE' || (a.type as any) === 'expense' || a.code?.startsWith('5')) && 
              (a.name.includes('عمول') || a.name.includes('تسويق') || a.name.includes('توزيع') || a.name.includes('دعاية')) && 
              !a.name.includes('تكلفة') && !a.name.includes('بضاعة')
            ) || accounts.find((a: Record<string, any>) => 
              (a.type === 'EXPENSE' || (a.type as any) === 'expense' || a.code?.startsWith('5')) && 
              !a.name.includes('تكلفة')
            );
          } else if (line.description.includes('مستحق') || line.description.includes('صافي') || line.description.includes('منصة') || line.description.includes('عميل')) {
            account = accounts.find((a: Record<string, any>) => 
              a.code === '1221' || a.code === '122' || a.code === '102'
            ) || accounts.find((a: Record<string, any>) => 
              (a.type === 'ASSET' || (a.type as any) === 'asset' || a.code?.startsWith('1')) && 
              (a.name.includes('عملاء') || a.name.includes('منصات') || a.name.includes('مدين')) && 
              !a.name.includes('مستحقة') && !a.name.includes('أوراق')
            );
          } else if (line.description.includes('إيراد') || line.description.includes('مبيعات') || line.description.includes('إجمالي') || line.credit > 0) {
            account = accounts.find((a: Record<string, any>) => 
              a.code === '411' || a.code === '4101' || a.code === '41101' || a.code === '41' || a.code === '401'
            ) || accounts.find((a: Record<string, any>) => 
              (a.type === 'REVENUE' || (a.type as any) === 'revenue' || a.code?.startsWith('4')) && 
              !a.code?.startsWith('1') && 
              (a.name.includes('مبيعات') || a.name.includes('نشاط') || a.name.includes('إيراد'))
            );
          }
        }

        return {
          id: line.id,
          accountId: line.account_id,
          accountName: account?.name || `⚠️ حساب غير موجود (المعرف: ${line.account_id?.slice(0,8)}...)`,
          accountCode: account?.code || line.account_code || '????',
          debit: line.debit,
          credit: line.credit,
          description: line.description,
          costCenterId: line.cost_center_id
        };
      })
    }));
  }, [serverEntries, currentUser, accounts]);

  const loading = currentUser?.role === 'demo' ? false : serverLoading;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await clearCache();
    refresh();
    setIsRefreshing(false);
  };

  const handlePostEntry = async (entryId: string) => {
    const targetEntry = journalEntries.find(e => e.id === entryId);
    const totalAmount = (targetEntry?.lines || []).reduce((sum: number, l: any) => sum + (Number(l.debit) || 0), 0);
    const isHighValue = totalAmount >= 50000;

    let confirmMsg = 'هل أنت متأكد من ترحيل هذا القيد؟ لا يمكن التراجع عن هذه العملية بعد الترحيل.';
    if (isHighValue) {
      confirmMsg = `🛡️ [ميثاق الحوكمة المالية وفصل المهام - Maker-Checker]:\n\n` +
        `هذا القيد ذو قيمة مالية كبرى (${totalAmount.toLocaleString('ar-EG')} ج.م).\n` +
        `وفقاً للسياسة الرقابية المعتمدة، يُشترط تدقيق المستندات المؤيدة والفواتير قبل الإقرار النهائي.\n\n` +
        `هل تؤكد بصفتك الإدارية والرقابية اعتماد وترحيل هذا القيد نهائياً لدفتر الأستاذ العام؟`;
    }

    if (!window.confirm(confirmMsg)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('journal_entries')
        .update({ 
          status: 'posted',
          is_posted: true
        })
        .eq('id', entryId);

      if (error) throw error;

      toast.success(isHighValue ? 'تم اعتماد وترحيل القيد ذو القيمة الكبرى بنجاح.' : 'تم ترحيل القيد بنجاح.');
      refreshData();
      refresh();
    } catch (err) {
      toast.error('فشل ترحيل القيد: ' + err.message);
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا القيد؟ لا يمكن التراجع عن هذا الإجراء.')) {
      return;
    }
    try {
      const orgId = (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;
      
      await supabase.from('journal_entries').update({ status: 'draft', is_posted: false }).eq('id', entryId);

      const { error: rpcError } = await supabase.rpc('delete_journal_entry_safe', {
        p_entry_id: entryId,
        p_org_id: orgId
      });

      if (rpcError) {
        await supabase.from('journal_lines').delete().eq('journal_entry_id', entryId);
        const { error: delErr } = await supabase.from('journal_entries').delete().eq('id', entryId);
        if (delErr) throw delErr;
      }

      try {
        if (orgId) {
          await supabase.rpc('recalculate_all_system_balances', { p_org_id: orgId });
        }
      } catch (_) {}

      toast.success('تم حذف القيد وتحديث الأرصدة بنجاح.');
      refreshData();
      refresh();
    } catch (err) {
      toast.error('فشل حذف القيد: ' + err.message);
    }
  };

  const handleCleanOrphanedAssetEntries = async () => {
    const orgId = (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;
    if (!orgId) return;

    setIsCleaningAssets(true);
    try {
      const { data: activeAssets } = await supabase
        .from('assets')
        .select('id, name, asset_tag')
        .eq('organization_id', orgId)
        .is('deleted_at', null);

      const activeAssetIds = new Set((activeAssets || []).map(a => a.id));
      const activeTags = new Set((activeAssets || []).map(a => (a.asset_tag || '').toUpperCase()));
      const activeIdPrefixes = new Set((activeAssets || []).map(a => a.id.split('-')[0].toUpperCase()));

      const { data: entries, error } = await supabase
        .from('journal_entries')
        .select(`
          id, reference, description, transaction_date, related_document_id, related_document_type,
          journal_lines (debit, credit, account_id)
        `)
        .eq('organization_id', orgId)
        .or('reference.ilike.ASSET-%,reference.ilike.DEP-%,related_document_type.eq.fixed_asset,related_document_type.eq.asset_depreciation,description.ilike.%أصل ثابت%');

      if (error) throw error;

      if (!entries || entries.length === 0) {
        toast.info('لم يتم العثور على أي قيود أصول لفحصها.');
        setIsCleaningAssets(false);
        return;
      }

      const orphanedEntries = entries.filter(e => {
        if (e.related_document_id && activeAssetIds.has(e.related_document_id)) {
          return false;
        }

        const ref = (e.reference || '').toUpperCase();
        if (ref.startsWith('ASSET-')) {
          const refPart = ref.replace('ASSET-', '').trim();
          if (activeIdPrefixes.has(refPart) || activeTags.has(ref) || activeTags.has(`AST-${refPart}`)) {
            return false;
          }
          return true;
        }

        if (ref.startsWith('DEP-')) {
          const parts = ref.split('-');
          if (parts.length >= 2) {
            const shortId = parts[1].toUpperCase();
            const matchesActive = Array.from(activeAssetIds).some(id => id.toUpperCase().startsWith(shortId));
            if (matchesActive) return false;
          }
          return true;
        }

        if (e.description?.includes('إثبات شراء أصل ثابت:')) {
          const assetName = e.description.replace('إثبات شراء أصل ثابت:', '').trim();
          const matchesActive = (activeAssets || []).some(a => a.name === assetName);
          if (matchesActive) return false;
          return true;
        }

        return false;
      });

      if (orphanedEntries.length === 0) {
        toast.success('جميع قيود الأصول مطابقة لسجل الأصول الفعالة ولا توجد قيود معلقة ✅');
        setIsCleaningAssets(false);
        return;
      }

      const totalAmount = orphanedEntries.reduce((sum, e) => {
        const lineDebits = (e.journal_lines || []).reduce((ls: number, l: any) => ls + (Number(l.debit) || 0), 0);
        return sum + lineDebits;
      }, 0);

      const confirmMsg = `⚠️ تم العثور على (${orphanedEntries.length}) قيد محاسبي لأصول محذوفة بإجمالي مبلغ: ${totalAmount.toLocaleString()} ج.م.\n\n` +
        orphanedEntries.map(e => `• قيد [${e.reference || e.id.slice(0, 8)}] بتاريخ ${e.transaction_date} - ${e.description}`).join('\n') +
        `\n\nهل تود حذف هذه القيود المعلقة لتصحيح ميزان المراجعة وحساب وسائل النقل فوراً؟`;

      if (!window.confirm(confirmMsg)) {
        setIsCleaningAssets(false);
        return;
      }

      const orphanedIds = orphanedEntries.map(e => e.id);

      await supabase.from('journal_entries').update({ status: 'draft', is_posted: false }).in('id', orphanedIds);
      await supabase.from('journal_lines').delete().in('journal_entry_id', orphanedIds);
      await supabase.from('journal_entries').delete().in('id', orphanedIds);

      try {
        await supabase.rpc('recalculate_all_system_balances', { p_org_id: orgId });
      } catch (_) {}

      toast.success(`تم بنجاح تنظيف (${orphanedEntries.length}) قيد وتصحيح ميزان المراجعة ✅`);
      await clearCache();
      await refreshData();
      refresh();
    } catch (err) {
      logger.error('Error cleaning orphaned asset entries:', err);
      toast.error('فشل تنظيف قيود الأصول: ' + err.message);
    } finally {
      setIsCleaningAssets(false);
    }
  };

  const handleCleanDuplicateChequeEntries = async () => {
    const orgId = (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;
    if (!orgId) return;

    if (!window.confirm('هل تريد فحص وتنظيف جميع قيود الشيكات المكررة والإبقاء على قيد واحد فقط لكل شيك؟\n\nسيتم تصحيح أرصدة البنوك وأوراق القبض/الدفع تلقائياً.')) {
      return;
    }

    setIsCleaningDuplicates(true);
    try {
      const { data: entries, error } = await supabase
        .from('journal_entries')
        .select('id, reference, description, created_at, transaction_date')
        .eq('organization_id', orgId)
        .like('reference', 'CHQ-%')
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (!entries || entries.length === 0) {
        toast.info('لا توجد قيود شيكات لفحصها.');
        return;
      }

      const groupedByRef = new Map<string, any[]>();
      for (const entry of entries) {
        const ref = entry.reference || '';
        if (!groupedByRef.has(ref)) {
          groupedByRef.set(ref, []);
        }
        groupedByRef.get(ref)!.push(entry);
      }

      const duplicateIdsToDelete: string[] = [];
      groupedByRef.forEach((list) => {
        if (list.length > 1) {
          for (let i = 1; i < list.length; i++) {
            duplicateIdsToDelete.push(list[i].id);
          }
        }
      });

      if (duplicateIdsToDelete.length === 0) {
        toast.success('سجل قيود الشيكات سليم ولا توجد أي قيود مكررة ✅');
        return;
      }

      await supabase.from('journal_lines').delete().in('journal_entry_id', duplicateIdsToDelete);
      const { error: delErr } = await supabase.from('journal_entries').delete().in('id', duplicateIdsToDelete);
      if (delErr) throw delErr;

      try {
        await supabase.rpc('recalculate_all_system_balances', { p_org_id: orgId });
      } catch (e) {
        logger.error('Failed to recalculate balances', e);
      }

      await clearCache();
      await refreshData();
      refresh();
      toast.success(`تم بنجاح تنظيف ${duplicateIdsToDelete.length} قيد شيكات مكرر وإعادة ضبط الأرصدة ✅`);
    } catch (err) {
      logger.error(err);
      toast.error('حدث خطأ أثناء تنظيف القيود المكررة: ' + err.message);
    } finally {
      setIsCleaningDuplicates(false);
    }
  };

  const handleDeleteOrphanSpecific = async (entryId: string) => {
    if (!window.confirm('هل تريد حذف قيد شركة هاي مكس المحذوفة (9,114.00 ج.م) الآن وتصحيح رصيد الأستاذ العام؟')) return;
    try {
      const orgId = currentSelectedOrgId || (currentUser as any)?.organization_id || null;
      const { error: rpcError } = await supabase.rpc('delete_journal_entry_safe', {
        p_entry_id: entryId,
        p_org_id: orgId
      });

      if (rpcError) {
        await supabase.from('journal_entries').update({ status: 'draft', is_posted: false }).eq('id', entryId);
        await supabase.from('journal_lines').delete().eq('journal_entry_id', entryId);
        const { error: delErr } = await supabase.from('journal_entries').delete().eq('id', entryId);
        if (delErr) throw delErr;
      }

      try {
        await supabase.rpc('recalculate_all_system_balances', { p_org_id: orgId });
      } catch (_) {}

      toast.success('تم حذف قيد شركة هاي مكس وتصحيح رصيد الأستاذ العام بنجاح ✅');
      setDetectedOrphanEntry(null);
      await clearCache();
      await refreshData();
      refresh();
    } catch (err) {
      toast.error('فشل حذف القيد: ' + err.message);
    }
  };

  const handleCleanOrphanSupplierEntries = async () => {
    const orgId = currentSelectedOrgId || (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;
    setIsCleaningSuppliers(true);
    try {
      let query = supabase
        .from('journal_entries')
        .select('id, reference, description, transaction_date')
        .or('reference.like.OP-SUPP-%,description.ilike.%رصيد افتتاحي للمورد%,description.ilike.%هاي مكس%,description.ilike.%هاى مكس%');

      if (orgId) {
        query = query.or(`organization_id.eq.${orgId},organization_id.is.null`);
      }

      const { data: opEntries, error: opErr } = await query;
      if (opErr) throw opErr;

      const { data: activeSuppliers, error: suppErr } = await supabase
        .from('suppliers')
        .select('id, name')
        .is('deleted_at', null);

      if (suppErr) throw suppErr;

      const activeIds = new Set((activeSuppliers || []).map(s => s.id.toLowerCase()));

      const orphanEntries = (opEntries || []).filter(e => {
        const ref = (e.reference || '').trim();
        const desc = (e.description || '').trim();
        if (ref.includes('ff424006-cf5e-4b01-bcda-4fe250a67c2a') || desc.includes('هاي مكس') || desc.includes('هاى مكس')) {
          return true;
        }
        if (ref.startsWith('OP-SUPP-')) {
          const suppId = ref.replace('OP-SUPP-', '').trim().toLowerCase();
          if (suppId && !activeIds.has(suppId)) return true;
        }
        return false;
      });

      if (orphanEntries.length === 0) {
        toast.success('سجل قيود الموردين سليم تماماً ولا توجد قيود معلقة لموردين محذوفين ✅');
        return;
      }

      const confirmMsg = `⚠️ تم العثور على (${orphanEntries.length}) قيد رصيد افتتاحي لموردين محذوفين معلقة في الأستاذ العام:\n\n` +
        orphanEntries.map(e => `• ${e.reference} - ${e.description}`).join('\n') +
        `\n\nهل تريد حذف هذه القيود الآن لتصحيح ميزان المراجعة والأستاذ العام؟`;

      if (!window.confirm(confirmMsg)) return;

      for (const entry of orphanEntries) {
        const { error: rpcError } = await supabase.rpc('delete_journal_entry_safe', {
          p_entry_id: entry.id,
          p_org_id: orgId || null
        });

        if (rpcError) {
          await supabase.from('journal_entries').update({ status: 'draft', is_posted: false }).eq('id', entry.id);
          await supabase.from('journal_lines').delete().eq('journal_entry_id', entry.id);
          await supabase.from('journal_entries').delete().eq('id', entry.id);
        }
      }

      try {
        await supabase.rpc('recalculate_all_system_balances', { p_org_id: orgId });
      } catch (_) {}

      toast.success(`تم بنجاح تنظيف (${orphanEntries.length}) قيد للموردين وتصحيح رصيد الأستاذ العام بنجاح ✅`);
      setDetectedOrphanEntry(null);
      await clearCache();
      await refreshData();
      refresh();
    } catch (err) {
      toast.error('حدث خطأ أثناء تنظيف قيود الموردين: ' + err.message);
    } finally {
      setIsCleaningSuppliers(false);
    }
  };

  const handleEditEntry = (entry: JournalEntry) => {
    const source = getEntrySource(entry.reference || '', entry.description || '');
    if (source.label !== 'قيد يدوي') {
      toast.error('لا يمكن تعديل القيود التي تم إنشاؤها آلياً. يرجى تعديل المستند الأصلي (مثل الفاتورة أو السند).');
      return;
    }
    navigate('/journal', { state: { entryToEdit: entry } });
  };

  const handleDuplicateEntry = (entry: JournalEntry) => {
    navigate('/journal', { state: { entryToDuplicate: entry } });
  };

  const handleViewEntry = (entryId: string) => {
    const entryIds = journalEntries.map(e => e.id);
    navigate(`/journal-entry/${entryId}`, { state: { ids: entryIds, page, searchTerm, selectedUser } });
  };

  const handleUnpostEntry = async (entryId: string) => {
    if (!window.confirm('هل تريد فك ترحيل هذا القيد غير المتوازن وتحويله إلى مسودة لتتمكن من تصحيحه أو حذفه؟')) {
      return;
    }
    try {
      const res = await journalAuditService.unpostEntryForCorrection(entryId);
      if (res.success) {
        toast.success(res.message);
        await clearCache();
        await refreshData();
        refresh();
        checkUnbalancedEntries();
      } else {
        toast.error(res.message);
      }
    } catch (err) {
      toast.error('حدث خطأ: ' + err.message);
    }
  };

  const handleResetFilters = () => {
    setFilterAccountId('');
    setFilterAmount('');
    setFilterStatus('');
    setFilterSource('');
    setStartDate('');
    setEndDate('');
    setSearchTerm('');
  };

  return (
    <div className="p-6 bg-white rounded-xl shadow-sm border border-slate-200">
      {/* ⚠️ تنبيه كشف قيد رصيد افتتاحي لمورد محذوف مع زر حذف فوري */}
      <JournalOrphanAlert 
        detectedOrphanEntry={detectedOrphanEntry}
        onDeleteOrphanSpecific={handleDeleteOrphanSpecific}
      />

      {/* ⚠️ تنبيه كشف القيود غير المتوازنة مع زر تصفية فوري */}
      {unbalancedAudit && unbalancedAudit.count > 0 && (
        <div className="bg-amber-50 border-2 border-amber-300 p-4 rounded-xl mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in shadow-xs" dir="rtl">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl shrink-0">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h4 className="text-sm font-black text-amber-900">
                تنبيه رقابي: تم اكتشاف ({unbalancedAudit.count}) قيد غير متوازن في دفتر اليومية!
              </h4>
              <p className="text-xs text-amber-800 mt-0.5">
                إجمالي الفارق المحاسبي: <strong className="font-mono font-bold text-red-700 bg-white/70 px-1.5 py-0.5 rounded border border-amber-200">{unbalancedAudit.totalDiff.toFixed(2)} ج.م</strong>
                {' — '}
                هذا الفارق هو السبب في عدم اتزان ميزان المراجعة ودرع التدقيق الليلي.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                setShowAdvanced(true);
                setFilterStatus('unbalanced');
                setIgnoreDateFilter(true);
              }}
              className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl font-bold text-xs transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Filter size={15} />
              عرض القيود غير المتوازنة فقط
            </button>
          </div>
        </div>
      )}

      {/* شريط الإجراءات والبحث العلوي */}
      <JournalActionBar 
        users={users}
        selectedUser={selectedUser}
        setSelectedUser={setSelectedUser}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        setDebouncedSearch={setDebouncedSearch}
        onPageReset={() => setPage(1)}
        showAdvanced={showAdvanced}
        setShowAdvanced={setShowAdvanced}
        isCleaningSuppliers={isCleaningSuppliers}
        onCleanSuppliers={handleCleanOrphanSupplierEntries}
        isCleaningDuplicates={isCleaningDuplicates}
        onCleanDuplicates={handleCleanDuplicateChequeEntries}
        isCleaningAssets={isCleaningAssets}
        onCleanAssets={handleCleanOrphanedAssetEntries}
        isExporting={isExporting}
        onExportExcel={() => exportJournalToExcel({
          currentUser,
          journalEntries,
          startDate,
          endDate,
          queryModifier,
          users,
          accounts,
          toast,
          setIsExporting
        })}
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
        onOpenCurrencyRevaluation={() => setShowCurrencyRevaluation(true)}
      />

      {/* لوحة الفلاتر المتقدمة القابلة للطي */}
      <JournalAdvancedFilters 
        show={showAdvanced}
        filterAccountId={filterAccountId}
        setFilterAccountId={setFilterAccountId}
        filterAmount={filterAmount}
        setFilterAmount={setFilterAmount}
        filterSource={filterSource}
        setFilterSource={setFilterSource}
        filterStatus={filterStatus}
        setFilterStatus={setFilterStatus}
        startDate={startDate}
        setStartDate={setStartDate}
        endDate={endDate}
        setEndDate={setEndDate}
        sortedAccounts={sortedAccounts}
        onResetFilters={handleResetFilters}
      />

      {/* 📅 شريط السنة المالية المحددة */}
      <JournalFiscalYearBar 
        selectedFiscalYear={selectedFiscalYear}
        lastClosedYear={settings?.lastClosedYear}
        startDate={startDate}
        endDate={endDate}
        setStartDate={setStartDate}
        setEndDate={setEndDate}
      />

      {/* قائمة القيود المحاسبية */}
      <div className="space-y-4">
        {loading || isSearching ? (
          <div className="flex justify-center p-12">
            <Loader2 className="animate-spin text-blue-600" size={32} />
          </div>
        ) : journalEntries.length === 0 ? (
          <div className="text-center py-10 text-slate-500">
            {filterStatus === 'unbalanced' || filterStatus === 'posted_unbalanced' ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 max-w-lg mx-auto text-amber-900 shadow-sm animate-in fade-in">
                <AlertTriangle className="mx-auto mb-2 text-amber-600" size={32} />
                <h3 className="font-bold text-base mb-1">لم يتم العثور على قيود غير متوازنة في هذا النطاق</h3>
                <p className="text-xs text-amber-700 mb-4 leading-relaxed">
                  إذا كان ميزان المراجعة يظهر فرقاً في التوازن (مثل فارق الـ 100 ج.م)، فإن القيد أو السطر المسبب يتم كشفه مباشرة وبدقة متناهية من شاشة ميزان المراجعة مع إمكانية فك ترحيله بنقرة واحدة.
                </p>
                <button
                  onClick={() => navigate('/trial-balance')}
                  className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs"
                >
                  الانتقال لميزان المراجعة لكشف وتصحيح القيد فوراً
                </button>
              </div>
            ) : (
              'لا توجد قيود مطابقة للبحث.'
            )}
          </div>
        ) : (
          journalEntries.map((entry) => (
            <JournalEntryCard 
              key={entry.id}
              entry={entry}
              canPost={Boolean(can('journals', 'post'))}
              onPost={handlePostEntry}
              onUnpost={handleUnpostEntry}
              onView={handleViewEntry}
              onPrint={printJournalEntry}
              onDuplicate={handleDuplicateEntry}
              onEdit={handleEditEntry}
              onDelete={handleDeleteEntry}
            />
          ))
        )}

        {/* عناصر التحكم في التنقل والصفحات */}
        <JournalPagination 
          currentCount={journalEntries.length}
          totalCount={totalCount}
          pageSize={pageSize}
          setPageSize={setPageSize}
          page={page}
          setPage={setPage}
          totalPages={totalPages}
          loading={loading}
          toast={toast}
        />
      </div>

      {/* 💱 معالج إعادة تقييم فروق أسعار صرف العملات الأجنبية */}
      <CurrencyRevaluationModal 
        isOpen={showCurrencyRevaluation}
        onClose={() => setShowCurrencyRevaluation(false)}
        organizationId={currentSelectedOrgId || (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id || ''}
        accounts={accounts}
        onSuccess={refreshData}
      />
    </div>
  );
};

export default GeneralJournal;
