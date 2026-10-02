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

// Ø§Ù„Ù…ÙƒÙˆÙ†Ø§Øª Ø§Ù„ÙØ±Ø¹ÙŠØ© Ø§Ù„Ù…ÙÙƒÙƒØ©
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
  
  // ØªØ­ÙƒÙ… Ø§Ù„ØµÙØ­Ø§Øª ÙˆØ­Ø¬Ù…Ù‡Ø§
  const [pageSize, setPageSize] = useState(20);

  // ÙƒØ´Ù ÙˆØªÙ†Ø¸ÙŠÙ Ù‚ÙŠÙˆØ¯ Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ† Ø§Ù„Ù…Ø­Ø°ÙˆÙÙŠÙ†
  const [detectedOrphanEntry, setDetectedOrphanEntry] = useState<any>(null);
  const [isCleaningSuppliers, setIsCleaningSuppliers] = useState(false);
  const [isCleaningDuplicates, setIsCleaningDuplicates] = useState(false);
  const [isCleaningAssets, setIsCleaningAssets] = useState(false);
  const [showCurrencyRevaluation, setShowCurrencyRevaluation] = useState(false);
  
  // ÙƒØ´Ù Ø§Ù„Ù‚ÙŠÙˆØ¯ ØºÙŠØ± Ø§Ù„Ù…ØªÙˆØ§Ø²Ù†Ø© ÙˆØªØ¯Ù‚ÙŠÙ‚ Ø§Ù„Ø£Ø³ØªØ§Ø° Ø§Ù„Ø¹Ø§Ù…
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

  // Ù…Ø²Ø§Ù…Ù†Ø© Ù†Ø·Ø§Ù‚ Ø§Ù„ØªÙˆØ§Ø±ÙŠØ® ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ Ø¹Ù†Ø¯ ØªØºÙŠÙŠØ± Ø§Ù„Ø³Ù†Ø© Ø§Ù„Ù…Ø§Ù„ÙŠØ© Ø§Ù„Ù…Ø®ØªØ§Ø±Ø© Ù…Ù† Ø´Ø±ÙŠØ· Ø§Ù„Ù†Ø¸Ø§Ù…
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

  // ØªØ£Ø®ÙŠØ± Ø§Ù„Ø¨Ø­Ø«
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // ðŸ” ÙØ­Øµ Ø§Ø³ØªØ¨Ø§Ù‚ÙŠ Ø¹Ù† Ù‚ÙŠØ¯ Ø§Ù„Ù…ÙˆØ±Ø¯ Ø§Ù„Ù…Ø­Ø°ÙˆÙ (Ù…Ø«Ù„ Ø´Ø±ÙƒØ© Ù‡Ø§ÙŠ Ù…ÙƒØ³ Ø¨Ø±ØµÙŠØ¯ 9114)
  const checkOrphanSuppliers = useCallback(async () => {
    try {
      const { data: entries } = await supabase
        .from('journal_entries')
        .select('id, reference, description, transaction_date')
        .or('reference.ilike.%ff424006-cf5e-4b01-bcda-4fe250a67c2a%,description.ilike.%Ù‡Ø§ÙŠ Ù…ÙƒØ³%,description.ilike.%Ù‡Ø§Ù‰ Ù…ÙƒØ³%')
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

  // ðŸ” ÙØ­Øµ Ø§Ø³ØªØ¨Ø§Ù‚ÙŠ Ù„ÙƒØ§ÙØ© Ø§Ù„Ù‚ÙŠÙˆØ¯ ØºÙŠØ± Ø§Ù„Ù…ØªÙˆØ§Ø²Ù†Ø© ÙÙŠ Ø§Ù„Ø£Ø³ØªØ§Ø° Ø§Ù„Ø¹Ø§Ù…
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

  // Ø§Ù„Ø¨Ø­Ø« Ø§Ù„Ù…ØªÙ‚Ø¯Ù… ÙÙŠ Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª ÙˆØ§Ù„Ù…Ø¨Ø§Ù„Øº ÙˆØ§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø¹Ø¨Ø± Ø§Ù„Ø¬Ø¯Ø§ÙˆÙ„ Ø§Ù„Ù…Ø±ØªØ¨Ø·Ø© ÙˆÙÙ„ØªØ± Ø§Ù„ØªÙˆØ§Ø²Ù†
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

        // 1. Ø¥Ø°Ø§ ÙƒØ§Ù† Ø§Ù„ÙÙ„ØªØ± ÙŠØ·Ù„Ø¨ Ø§Ù„Ù‚ÙŠÙˆØ¯ ØºÙŠØ± Ø§Ù„Ù…ØªÙˆØ§Ø²Ù†Ø©
        let unbalancedIdsSet: Set<string> | null = null;
        if (isUnbalancedFilter) {
          setIgnoreDateFilter(true);
          const auditRes = await journalAuditService.findUnbalancedEntries(
            orgId,
            filterStatus === 'posted_unbalanced' ? 'posted' : 'all'
          );
          unbalancedIdsSet = new Set(auditRes.unbalancedIds);
        }

        // 2. Ø§Ù„Ø¨Ø­Ø« ÙÙŠ Ø§Ù„Ù‚ÙŠÙˆØ¯ Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠØ© (journal_entries) Ø¨Ø§Ù„Ù…Ø±Ø¬Ø¹ Ø£Ùˆ Ø§Ù„Ø¨ÙŠØ§Ù†
        if (cleanSearch) {
          const norm1 = cleanSearch.replace(/Ù‰/g, 'ÙŠ').replace(/[Ø£Ø¥Ø¢]/g, 'Ø§').replace(/Ø©/g, 'Ù‡');
          const norm2 = cleanSearch.replace(/ÙŠ/g, 'Ù‰').replace(/Ø§/g, 'Ø£');

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

        // 3. Ø§Ù„Ø¨Ø­Ø« ÙÙŠ Ø£Ø³Ø·Ø± Ø§Ù„Ù‚ÙŠÙˆØ¯ (journal_lines) Ø¨Ø§Ù„Ù…Ø¨Ù„Øº Ø£Ùˆ Ø§Ù„Ø­Ø³Ø§Ø¨ Ø£Ùˆ Ø§Ù„ÙˆØµÙ
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

        // Ø¯Ù…Ø¬ Ø§Ù„Ù†ØªØ§Ø¦Ø¬ Ù…Ø¹ ÙÙ„ØªØ± Ø§Ù„Ù‚ÙŠÙˆØ¯ ØºÙŠØ± Ø§Ù„Ù…ØªÙˆØ§Ø²Ù†Ø©
        if (isUnbalancedFilter && unbalancedIdsSet !== null) {
          if (cleanSearch || filterAccountId || filterAmount) {
            const intersected = Array.from(foundIds).filter(id => unbalancedIdsSet!.has(id));
            setMatchingEntryIds(intersected);
          } else {
            if (unbalancedIdsSet.size > 0) {
              setMatchingEntryIds(Array.from(unbalancedIdsSet));
            } else {
              // Ù…Ø³Ø§Ø± ÙØ­Øµ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…Ø­Ù„ÙŠØ© ÙƒØ¥Ø¬Ø±Ø§Ø¡ Ø¥Ø¶Ø§ÙÙŠ
              const localUnbalanced = (contextEntries || []).filter((e: Record<string, any>) => {
                const dr = (e.journal_lines || e.lines || []).reduce((s: number, l: Record<string, any>) => s + (Number(l.debit) || 0), 0);
                const cr = (e.journal_lines || e.lines || []).reduce((s: number, l: Record<string, any>) => s + (Number(l.credit) || 0), 0);
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

  // Ø¥Ø¹Ø¯Ø§Ø¯ Ø§Ø³ØªØ¹Ù„Ø§Ù… Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ù…Ø¹ Ø§Ù„ÙÙ„ØªØ±Ø©
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
        query = query.or('reference.like.INV-%,reference.like.REC-INV-%,reference.like.POS-%,reference.like.SI-%,description.ilike.%ÙØ§ØªÙˆØ±Ø© Ù…Ø¨ÙŠØ¹Ø§Øª%');
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
        { id: 'demo-je-1', date: new Date().toISOString().split('T')[0], description: 'Ø´Ø±Ø§Ø¡ Ø£Ø«Ø§Ø« Ù…ÙƒØªØ¨ÙŠ Ù†Ù‚Ø¯Ø§Ù‹', reference: 'JE-DEMO-001', status: 'posted', is_posted: true, lines: [{ accountName: 'Ø§Ù„Ø£Ø«Ø§Ø« ÙˆØ§Ù„ØªØ¬Ù‡ÙŠØ²Ø§Øª', accountCode: '1115', debit: 5000, credit: 0 }, { accountName: 'Ø§Ù„Ù†Ù‚Ø¯ÙŠØ© Ø¨Ø§Ù„ØµÙ†Ø¯ÙˆÙ‚', accountCode: '10101', debit: 0, credit: 5000 }] },
        { id: 'demo-je-2', date: new Date().toISOString().split('T')[0], description: 'Ø³Ø¯Ø§Ø¯ ÙØ§ØªÙˆØ±Ø© ÙƒÙ‡Ø±Ø¨Ø§Ø¡', reference: 'JE-DEMO-002', status: 'posted', is_posted: true, lines: [{ accountName: 'ÙƒÙ‡Ø±Ø¨Ø§Ø¡ ÙˆÙ…ÙŠØ§Ù‡', accountCode: '50201', debit: 750, credit: 0 }, { accountName: 'Ø§Ù„Ù†Ù‚Ø¯ÙŠØ© Ø¨Ø§Ù„ØµÙ†Ø¯ÙˆÙ‚', accountCode: '10101', debit: 0, credit: 750 }] }
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
          if (line.description.includes('Ø¹Ù…ÙˆÙ„Ø©') || line.description.includes('ØªØ³ÙˆÙŠÙ‚') || line.description.includes('Ø¹Ù…ÙˆÙ„Ø§Øª')) {
            account = accounts.find((a: Record<string, any>) => 
              a.code === '522' || a.code === '5221' || a.code === '5204' || a.code === '52' || a.code === '521'
            ) || accounts.find((a: Record<string, any>) => 
              (a.type === 'EXPENSE' || (a.type as any) === 'expense' || a.code?.startsWith('5')) && 
              (a.name.includes('Ø¹Ù…ÙˆÙ„') || a.name.includes('ØªØ³ÙˆÙŠÙ‚') || a.name.includes('ØªÙˆØ²ÙŠØ¹') || a.name.includes('Ø¯Ø¹Ø§ÙŠØ©')) && 
              !a.name.includes('ØªÙƒÙ„ÙØ©') && !a.name.includes('Ø¨Ø¶Ø§Ø¹Ø©')
            ) || accounts.find((a: Record<string, any>) => 
              (a.type === 'EXPENSE' || (a.type as any) === 'expense' || a.code?.startsWith('5')) && 
              !a.name.includes('ØªÙƒÙ„ÙØ©')
            );
          } else if (line.description.includes('Ù…Ø³ØªØ­Ù‚') || line.description.includes('ØµØ§ÙÙŠ') || line.description.includes('Ù…Ù†ØµØ©') || line.description.includes('Ø¹Ù…ÙŠÙ„')) {
            account = accounts.find((a: Record<string, any>) => 
              a.code === '1221' || a.code === '122' || a.code === '102'
            ) || accounts.find((a: Record<string, any>) => 
              (a.type === 'ASSET' || (a.type as any) === 'asset' || a.code?.startsWith('1')) && 
              (a.name.includes('Ø¹Ù…Ù„Ø§Ø¡') || a.name.includes('Ù…Ù†ØµØ§Øª') || a.name.includes('Ù…Ø¯ÙŠÙ†')) && 
              !a.name.includes('Ù…Ø³ØªØ­Ù‚Ø©') && !a.name.includes('Ø£ÙˆØ±Ø§Ù‚')
            );
          } else if (line.description.includes('Ø¥ÙŠØ±Ø§Ø¯') || line.description.includes('Ù…Ø¨ÙŠØ¹Ø§Øª') || line.description.includes('Ø¥Ø¬Ù…Ø§Ù„ÙŠ') || line.credit > 0) {
            account = accounts.find((a: Record<string, any>) => 
              a.code === '411' || a.code === '4101' || a.code === '41101' || a.code === '41' || a.code === '401'
            ) || accounts.find((a: Record<string, any>) => 
              (a.type === 'REVENUE' || (a.type as any) === 'revenue' || a.code?.startsWith('4')) && 
              !a.code?.startsWith('1') && 
              (a.name.includes('Ù…Ø¨ÙŠØ¹Ø§Øª') || a.name.includes('Ù†Ø´Ø§Ø·') || a.name.includes('Ø¥ÙŠØ±Ø§Ø¯'))
            );
          }
        }

        return {
          id: line.id,
          accountId: line.account_id,
          accountName: account?.name || `âš ï¸ Ø­Ø³Ø§Ø¨ ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯ (Ø§Ù„Ù…Ø¹Ø±Ù: ${line.account_id?.slice(0,8)}...)`,
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
    const totalAmount = (targetEntry?.lines || []).reduce((sum: number, l: Record<string, any>) => sum + (Number(l.debit) || 0), 0);
    const isHighValue = totalAmount >= 50000;

    let confirmMsg = 'Ù‡Ù„ Ø£Ù†Øª Ù…ØªØ£ÙƒØ¯ Ù…Ù† ØªØ±Ø­ÙŠÙ„ Ù‡Ø°Ø§ Ø§Ù„Ù‚ÙŠØ¯ØŸ Ù„Ø§ ÙŠÙ…ÙƒÙ† Ø§Ù„ØªØ±Ø§Ø¬Ø¹ Ø¹Ù† Ù‡Ø°Ù‡ Ø§Ù„Ø¹Ù…Ù„ÙŠØ© Ø¨Ø¹Ø¯ Ø§Ù„ØªØ±Ø­ÙŠÙ„.';
    if (isHighValue) {
      confirmMsg = `ðŸ›¡ï¸ [Ù…ÙŠØ«Ø§Ù‚ Ø§Ù„Ø­ÙˆÙƒÙ…Ø© Ø§Ù„Ù…Ø§Ù„ÙŠØ© ÙˆÙØµÙ„ Ø§Ù„Ù…Ù‡Ø§Ù… - Maker-Checker]:\n\n` +
        `Ù‡Ø°Ø§ Ø§Ù„Ù‚ÙŠØ¯ Ø°Ùˆ Ù‚ÙŠÙ…Ø© Ù…Ø§Ù„ÙŠØ© ÙƒØ¨Ø±Ù‰ (${totalAmount.toLocaleString('ar-EG')} Ø¬.Ù…).\n` +
        `ÙˆÙÙ‚Ø§Ù‹ Ù„Ù„Ø³ÙŠØ§Ø³Ø© Ø§Ù„Ø±Ù‚Ø§Ø¨ÙŠØ© Ø§Ù„Ù…Ø¹ØªÙ…Ø¯Ø©ØŒ ÙŠÙØ´ØªØ±Ø· ØªØ¯Ù‚ÙŠÙ‚ Ø§Ù„Ù…Ø³ØªÙ†Ø¯Ø§Øª Ø§Ù„Ù…Ø¤ÙŠØ¯Ø© ÙˆØ§Ù„ÙÙˆØ§ØªÙŠØ± Ù‚Ø¨Ù„ Ø§Ù„Ø¥Ù‚Ø±Ø§Ø± Ø§Ù„Ù†Ù‡Ø§Ø¦ÙŠ.\n\n` +
        `Ù‡Ù„ ØªØ¤ÙƒØ¯ Ø¨ØµÙØªÙƒ Ø§Ù„Ø¥Ø¯Ø§Ø±ÙŠØ© ÙˆØ§Ù„Ø±Ù‚Ø§Ø¨ÙŠØ© Ø§Ø¹ØªÙ…Ø§Ø¯ ÙˆØªØ±Ø­ÙŠÙ„ Ù‡Ø°Ø§ Ø§Ù„Ù‚ÙŠØ¯ Ù†Ù‡Ø§Ø¦ÙŠØ§Ù‹ Ù„Ø¯ÙØªØ± Ø§Ù„Ø£Ø³ØªØ§Ø° Ø§Ù„Ø¹Ø§Ù…ØŸ`;
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

      toast.success(isHighValue ? 'ØªÙ… Ø§Ø¹ØªÙ…Ø§Ø¯ ÙˆØªØ±Ø­ÙŠÙ„ Ø§Ù„Ù‚ÙŠØ¯ Ø°Ùˆ Ø§Ù„Ù‚ÙŠÙ…Ø© Ø§Ù„ÙƒØ¨Ø±Ù‰ Ø¨Ù†Ø¬Ø§Ø­.' : 'ØªÙ… ØªØ±Ø­ÙŠÙ„ Ø§Ù„Ù‚ÙŠØ¯ Ø¨Ù†Ø¬Ø§Ø­.');
      refreshData();
      refresh();
    } catch (err) {
      toast.error('ÙØ´Ù„ ØªØ±Ø­ÙŠÙ„ Ø§Ù„Ù‚ÙŠØ¯: ' + err.message);
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!window.confirm('Ù‡Ù„ Ø£Ù†Øª Ù…ØªØ£ÙƒØ¯ Ù…Ù† Ø­Ø°Ù Ù‡Ø°Ø§ Ø§Ù„Ù‚ÙŠØ¯ØŸ Ù„Ø§ ÙŠÙ…ÙƒÙ† Ø§Ù„ØªØ±Ø§Ø¬Ø¹ Ø¹Ù† Ù‡Ø°Ø§ Ø§Ù„Ø¥Ø¬Ø±Ø§Ø¡.')) {
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

      toast.success('ØªÙ… Ø­Ø°Ù Ø§Ù„Ù‚ÙŠØ¯ ÙˆØªØ­Ø¯ÙŠØ« Ø§Ù„Ø£Ø±ØµØ¯Ø© Ø¨Ù†Ø¬Ø§Ø­.');
      refreshData();
      refresh();
    } catch (err) {
      toast.error('ÙØ´Ù„ Ø­Ø°Ù Ø§Ù„Ù‚ÙŠØ¯: ' + err.message);
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
        .or('reference.ilike.ASSET-%,reference.ilike.DEP-%,related_document_type.eq.fixed_asset,related_document_type.eq.asset_depreciation,description.ilike.%Ø£ØµÙ„ Ø«Ø§Ø¨Øª%');

      if (error) throw error;

      if (!entries || entries.length === 0) {
        toast.info('Ù„Ù… ÙŠØªÙ… Ø§Ù„Ø¹Ø«ÙˆØ± Ø¹Ù„Ù‰ Ø£ÙŠ Ù‚ÙŠÙˆØ¯ Ø£ØµÙˆÙ„ Ù„ÙØ­ØµÙ‡Ø§.');
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

        if (e.description?.includes('Ø¥Ø«Ø¨Ø§Øª Ø´Ø±Ø§Ø¡ Ø£ØµÙ„ Ø«Ø§Ø¨Øª:')) {
          const assetName = e.description.replace('Ø¥Ø«Ø¨Ø§Øª Ø´Ø±Ø§Ø¡ Ø£ØµÙ„ Ø«Ø§Ø¨Øª:', '').trim();
          const matchesActive = (activeAssets || []).some(a => a.name === assetName);
          if (matchesActive) return false;
          return true;
        }

        return false;
      });

      if (orphanedEntries.length === 0) {
        toast.success('Ø¬Ù…ÙŠØ¹ Ù‚ÙŠÙˆØ¯ Ø§Ù„Ø£ØµÙˆÙ„ Ù…Ø·Ø§Ø¨Ù‚Ø© Ù„Ø³Ø¬Ù„ Ø§Ù„Ø£ØµÙˆÙ„ Ø§Ù„ÙØ¹Ø§Ù„Ø© ÙˆÙ„Ø§ ØªÙˆØ¬Ø¯ Ù‚ÙŠÙˆØ¯ Ù…Ø¹Ù„Ù‚Ø© âœ…');
        setIsCleaningAssets(false);
        return;
      }

      const totalAmount = orphanedEntries.reduce((sum, e) => {
        const lineDebits = (e.journal_lines || []).reduce((ls: number, l: Record<string, any>) => ls + (Number(l.debit) || 0), 0);
        return sum + lineDebits;
      }, 0);

      const confirmMsg = `âš ï¸ ØªÙ… Ø§Ù„Ø¹Ø«ÙˆØ± Ø¹Ù„Ù‰ (${orphanedEntries.length}) Ù‚ÙŠØ¯ Ù…Ø­Ø§Ø³Ø¨ÙŠ Ù„Ø£ØµÙˆÙ„ Ù…Ø­Ø°ÙˆÙØ© Ø¨Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ù…Ø¨Ù„Øº: ${totalAmount.toLocaleString()} Ø¬.Ù….\n\n` +
        orphanedEntries.map(e => `â€¢ Ù‚ÙŠØ¯ [${e.reference || e.id.slice(0, 8)}] Ø¨ØªØ§Ø±ÙŠØ® ${e.transaction_date} - ${e.description}`).join('\n') +
        `\n\nÙ‡Ù„ ØªÙˆØ¯ Ø­Ø°Ù Ù‡Ø°Ù‡ Ø§Ù„Ù‚ÙŠÙˆØ¯ Ø§Ù„Ù…Ø¹Ù„Ù‚Ø© Ù„ØªØµØ­ÙŠØ­ Ù…ÙŠØ²Ø§Ù† Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø© ÙˆØ­Ø³Ø§Ø¨ ÙˆØ³Ø§Ø¦Ù„ Ø§Ù„Ù†Ù‚Ù„ ÙÙˆØ±Ø§Ù‹ØŸ`;

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

      toast.success(`ØªÙ… Ø¨Ù†Ø¬Ø§Ø­ ØªÙ†Ø¸ÙŠÙ (${orphanedEntries.length}) Ù‚ÙŠØ¯ ÙˆØªØµØ­ÙŠØ­ Ù…ÙŠØ²Ø§Ù† Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø© âœ…`);
      await clearCache();
      await refreshData();
      refresh();
    } catch (err) {
      logger.error('Error cleaning orphaned asset entries:', err);
      toast.error('ÙØ´Ù„ ØªÙ†Ø¸ÙŠÙ Ù‚ÙŠÙˆØ¯ Ø§Ù„Ø£ØµÙˆÙ„: ' + err.message);
    } finally {
      setIsCleaningAssets(false);
    }
  };

  const handleCleanDuplicateChequeEntries = async () => {
    const orgId = (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;
    if (!orgId) return;

    if (!window.confirm('Ù‡Ù„ ØªØ±ÙŠØ¯ ÙØ­Øµ ÙˆØªÙ†Ø¸ÙŠÙ Ø¬Ù…ÙŠØ¹ Ù‚ÙŠÙˆØ¯ Ø§Ù„Ø´ÙŠÙƒØ§Øª Ø§Ù„Ù…ÙƒØ±Ø±Ø© ÙˆØ§Ù„Ø¥Ø¨Ù‚Ø§Ø¡ Ø¹Ù„Ù‰ Ù‚ÙŠØ¯ ÙˆØ§Ø­Ø¯ ÙÙ‚Ø· Ù„ÙƒÙ„ Ø´ÙŠÙƒØŸ\n\nØ³ÙŠØªÙ… ØªØµØ­ÙŠØ­ Ø£Ø±ØµØ¯Ø© Ø§Ù„Ø¨Ù†ÙˆÙƒ ÙˆØ£ÙˆØ±Ø§Ù‚ Ø§Ù„Ù‚Ø¨Ø¶/Ø§Ù„Ø¯ÙØ¹ ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹.')) {
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
        toast.info('Ù„Ø§ ØªÙˆØ¬Ø¯ Ù‚ÙŠÙˆØ¯ Ø´ÙŠÙƒØ§Øª Ù„ÙØ­ØµÙ‡Ø§.');
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
        toast.success('Ø³Ø¬Ù„ Ù‚ÙŠÙˆØ¯ Ø§Ù„Ø´ÙŠÙƒØ§Øª Ø³Ù„ÙŠÙ… ÙˆÙ„Ø§ ØªÙˆØ¬Ø¯ Ø£ÙŠ Ù‚ÙŠÙˆØ¯ Ù…ÙƒØ±Ø±Ø© âœ…');
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
      toast.success(`ØªÙ… Ø¨Ù†Ø¬Ø§Ø­ ØªÙ†Ø¸ÙŠÙ ${duplicateIdsToDelete.length} Ù‚ÙŠØ¯ Ø´ÙŠÙƒØ§Øª Ù…ÙƒØ±Ø± ÙˆØ¥Ø¹Ø§Ø¯Ø© Ø¶Ø¨Ø· Ø§Ù„Ø£Ø±ØµØ¯Ø© âœ…`);
    } catch (err) {
      logger.error(err);
      toast.error('Ø­Ø¯Ø« Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ ØªÙ†Ø¸ÙŠÙ Ø§Ù„Ù‚ÙŠÙˆØ¯ Ø§Ù„Ù…ÙƒØ±Ø±Ø©: ' + err.message);
    } finally {
      setIsCleaningDuplicates(false);
    }
  };

  const handleDeleteOrphanSpecific = async (entryId: string) => {
    if (!window.confirm('Ù‡Ù„ ØªØ±ÙŠØ¯ Ø­Ø°Ù Ù‚ÙŠØ¯ Ø´Ø±ÙƒØ© Ù‡Ø§ÙŠ Ù…ÙƒØ³ Ø§Ù„Ù…Ø­Ø°ÙˆÙØ© (9,114.00 Ø¬.Ù…) Ø§Ù„Ø¢Ù† ÙˆØªØµØ­ÙŠØ­ Ø±ØµÙŠØ¯ Ø§Ù„Ø£Ø³ØªØ§Ø° Ø§Ù„Ø¹Ø§Ù…ØŸ')) return;
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

      toast.success('ØªÙ… Ø­Ø°Ù Ù‚ÙŠØ¯ Ø´Ø±ÙƒØ© Ù‡Ø§ÙŠ Ù…ÙƒØ³ ÙˆØªØµØ­ÙŠØ­ Ø±ØµÙŠØ¯ Ø§Ù„Ø£Ø³ØªØ§Ø° Ø§Ù„Ø¹Ø§Ù… Ø¨Ù†Ø¬Ø§Ø­ âœ…');
      setDetectedOrphanEntry(null);
      await clearCache();
      await refreshData();
      refresh();
    } catch (err) {
      toast.error('ÙØ´Ù„ Ø­Ø°Ù Ø§Ù„Ù‚ÙŠØ¯: ' + err.message);
    }
  };

  const handleCleanOrphanSupplierEntries = async () => {
    const orgId = currentSelectedOrgId || (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;
    setIsCleaningSuppliers(true);
    try {
      let query = supabase
        .from('journal_entries')
        .select('id, reference, description, transaction_date')
        .or('reference.like.OP-SUPP-%,description.ilike.%Ø±ØµÙŠØ¯ Ø§ÙØªØªØ§Ø­ÙŠ Ù„Ù„Ù…ÙˆØ±Ø¯%,description.ilike.%Ù‡Ø§ÙŠ Ù…ÙƒØ³%,description.ilike.%Ù‡Ø§Ù‰ Ù…ÙƒØ³%');

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
        if (ref.includes('ff424006-cf5e-4b01-bcda-4fe250a67c2a') || desc.includes('Ù‡Ø§ÙŠ Ù…ÙƒØ³') || desc.includes('Ù‡Ø§Ù‰ Ù…ÙƒØ³')) {
          return true;
        }
        if (ref.startsWith('OP-SUPP-')) {
          const suppId = ref.replace('OP-SUPP-', '').trim().toLowerCase();
          if (suppId && !activeIds.has(suppId)) return true;
        }
        return false;
      });

      if (orphanEntries.length === 0) {
        toast.success('Ø³Ø¬Ù„ Ù‚ÙŠÙˆØ¯ Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ† Ø³Ù„ÙŠÙ… ØªÙ…Ø§Ù…Ø§Ù‹ ÙˆÙ„Ø§ ØªÙˆØ¬Ø¯ Ù‚ÙŠÙˆØ¯ Ù…Ø¹Ù„Ù‚Ø© Ù„Ù…ÙˆØ±Ø¯ÙŠÙ† Ù…Ø­Ø°ÙˆÙÙŠÙ† âœ…');
        return;
      }

      const confirmMsg = `âš ï¸ ØªÙ… Ø§Ù„Ø¹Ø«ÙˆØ± Ø¹Ù„Ù‰ (${orphanEntries.length}) Ù‚ÙŠØ¯ Ø±ØµÙŠØ¯ Ø§ÙØªØªØ§Ø­ÙŠ Ù„Ù…ÙˆØ±Ø¯ÙŠÙ† Ù…Ø­Ø°ÙˆÙÙŠÙ† Ù…Ø¹Ù„Ù‚Ø© ÙÙŠ Ø§Ù„Ø£Ø³ØªØ§Ø° Ø§Ù„Ø¹Ø§Ù…:\n\n` +
        orphanEntries.map(e => `â€¢ ${e.reference} - ${e.description}`).join('\n') +
        `\n\nÙ‡Ù„ ØªØ±ÙŠØ¯ Ø­Ø°Ù Ù‡Ø°Ù‡ Ø§Ù„Ù‚ÙŠÙˆØ¯ Ø§Ù„Ø¢Ù† Ù„ØªØµØ­ÙŠØ­ Ù…ÙŠØ²Ø§Ù† Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø© ÙˆØ§Ù„Ø£Ø³ØªØ§Ø° Ø§Ù„Ø¹Ø§Ù…ØŸ`;

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

      toast.success(`ØªÙ… Ø¨Ù†Ø¬Ø§Ø­ ØªÙ†Ø¸ÙŠÙ (${orphanEntries.length}) Ù‚ÙŠØ¯ Ù„Ù„Ù…ÙˆØ±Ø¯ÙŠÙ† ÙˆØªØµØ­ÙŠØ­ Ø±ØµÙŠØ¯ Ø§Ù„Ø£Ø³ØªØ§Ø° Ø§Ù„Ø¹Ø§Ù… Ø¨Ù†Ø¬Ø§Ø­ âœ…`);
      setDetectedOrphanEntry(null);
      await clearCache();
      await refreshData();
      refresh();
    } catch (err) {
      toast.error('Ø­Ø¯Ø« Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ ØªÙ†Ø¸ÙŠÙ Ù‚ÙŠÙˆØ¯ Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ†: ' + err.message);
    } finally {
      setIsCleaningSuppliers(false);
    }
  };

  const handleEditEntry = (entry: JournalEntry) => {
    const source = getEntrySource(entry.reference || '', entry.description || '');
    if (source.label !== 'Ù‚ÙŠØ¯ ÙŠØ¯ÙˆÙŠ') {
      toast.error('Ù„Ø§ ÙŠÙ…ÙƒÙ† ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„Ù‚ÙŠÙˆØ¯ Ø§Ù„ØªÙŠ ØªÙ… Ø¥Ù†Ø´Ø§Ø¤Ù‡Ø§ Ø¢Ù„ÙŠØ§Ù‹. ÙŠØ±Ø¬Ù‰ ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„Ù…Ø³ØªÙ†Ø¯ Ø§Ù„Ø£ØµÙ„ÙŠ (Ù…Ø«Ù„ Ø§Ù„ÙØ§ØªÙˆØ±Ø© Ø£Ùˆ Ø§Ù„Ø³Ù†Ø¯).');
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
    if (!window.confirm('Ù‡Ù„ ØªØ±ÙŠØ¯ ÙÙƒ ØªØ±Ø­ÙŠÙ„ Ù‡Ø°Ø§ Ø§Ù„Ù‚ÙŠØ¯ ØºÙŠØ± Ø§Ù„Ù…ØªÙˆØ§Ø²Ù† ÙˆØªØ­ÙˆÙŠÙ„Ù‡ Ø¥Ù„Ù‰ Ù…Ø³ÙˆØ¯Ø© Ù„ØªØªÙ…ÙƒÙ† Ù…Ù† ØªØµØ­ÙŠØ­Ù‡ Ø£Ùˆ Ø­Ø°ÙÙ‡ØŸ')) {
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
      toast.error('Ø­Ø¯Ø« Ø®Ø·Ø£: ' + err.message);
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
      {/* âš ï¸ ØªÙ†Ø¨ÙŠÙ‡ ÙƒØ´Ù Ù‚ÙŠØ¯ Ø±ØµÙŠØ¯ Ø§ÙØªØªØ§Ø­ÙŠ Ù„Ù…ÙˆØ±Ø¯ Ù…Ø­Ø°ÙˆÙ Ù…Ø¹ Ø²Ø± Ø­Ø°Ù ÙÙˆØ±ÙŠ */}
      <JournalOrphanAlert 
        detectedOrphanEntry={detectedOrphanEntry}
        onDeleteOrphanSpecific={handleDeleteOrphanSpecific}
      />

      {/* âš ï¸ ØªÙ†Ø¨ÙŠÙ‡ ÙƒØ´Ù Ø§Ù„Ù‚ÙŠÙˆØ¯ ØºÙŠØ± Ø§Ù„Ù…ØªÙˆØ§Ø²Ù†Ø© Ù…Ø¹ Ø²Ø± ØªØµÙÙŠØ© ÙÙˆØ±ÙŠ */}
      {unbalancedAudit && unbalancedAudit.count > 0 && (
        <div className="bg-amber-50 border-2 border-amber-300 p-4 rounded-xl mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in shadow-xs" dir="rtl">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl shrink-0">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h4 className="text-sm font-black text-amber-900">
                ØªÙ†Ø¨ÙŠÙ‡ Ø±Ù‚Ø§Ø¨ÙŠ: ØªÙ… Ø§ÙƒØªØ´Ø§Ù ({unbalancedAudit.count}) Ù‚ÙŠØ¯ ØºÙŠØ± Ù…ØªÙˆØ§Ø²Ù† ÙÙŠ Ø¯ÙØªØ± Ø§Ù„ÙŠÙˆÙ…ÙŠØ©!
              </h4>
              <p className="text-xs text-amber-800 mt-0.5">
                Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„ÙØ§Ø±Ù‚ Ø§Ù„Ù…Ø­Ø§Ø³Ø¨ÙŠ: <strong className="font-mono font-bold text-red-700 bg-white/70 px-1.5 py-0.5 rounded border border-amber-200">{unbalancedAudit.totalDiff.toFixed(2)} Ø¬.Ù…</strong>
                {' â€” '}
                Ù‡Ø°Ø§ Ø§Ù„ÙØ§Ø±Ù‚ Ù‡Ùˆ Ø§Ù„Ø³Ø¨Ø¨ ÙÙŠ Ø¹Ø¯Ù… Ø§ØªØ²Ø§Ù† Ù…ÙŠØ²Ø§Ù† Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø© ÙˆØ¯Ø±Ø¹ Ø§Ù„ØªØ¯Ù‚ÙŠÙ‚ Ø§Ù„Ù„ÙŠÙ„ÙŠ.
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
              Ø¹Ø±Ø¶ Ø§Ù„Ù‚ÙŠÙˆØ¯ ØºÙŠØ± Ø§Ù„Ù…ØªÙˆØ§Ø²Ù†Ø© ÙÙ‚Ø·
            </button>
          </div>
        </div>
      )}

      {/* Ø´Ø±ÙŠØ· Ø§Ù„Ø¥Ø¬Ø±Ø§Ø¡Ø§Øª ÙˆØ§Ù„Ø¨Ø­Ø« Ø§Ù„Ø¹Ù„ÙˆÙŠ */}
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

      {/* Ù„ÙˆØ­Ø© Ø§Ù„ÙÙ„Ø§ØªØ± Ø§Ù„Ù…ØªÙ‚Ø¯Ù…Ø© Ø§Ù„Ù‚Ø§Ø¨Ù„Ø© Ù„Ù„Ø·ÙŠ */}
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

      {/* ðŸ“… Ø´Ø±ÙŠØ· Ø§Ù„Ø³Ù†Ø© Ø§Ù„Ù…Ø§Ù„ÙŠØ© Ø§Ù„Ù…Ø­Ø¯Ø¯Ø© */}
      <JournalFiscalYearBar 
        selectedFiscalYear={selectedFiscalYear}
        lastClosedYear={settings?.lastClosedYear}
        startDate={startDate}
        endDate={endDate}
        setStartDate={setStartDate}
        setEndDate={setEndDate}
      />

      {/* Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ù‚ÙŠÙˆØ¯ Ø§Ù„Ù…Ø­Ø§Ø³Ø¨ÙŠØ© */}
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
                <h3 className="font-bold text-base mb-1">Ù„Ù… ÙŠØªÙ… Ø§Ù„Ø¹Ø«ÙˆØ± Ø¹Ù„Ù‰ Ù‚ÙŠÙˆØ¯ ØºÙŠØ± Ù…ØªÙˆØ§Ø²Ù†Ø© ÙÙŠ Ù‡Ø°Ø§ Ø§Ù„Ù†Ø·Ø§Ù‚</h3>
                <p className="text-xs text-amber-700 mb-4 leading-relaxed">
                  Ø¥Ø°Ø§ ÙƒØ§Ù† Ù…ÙŠØ²Ø§Ù† Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø© ÙŠØ¸Ù‡Ø± ÙØ±Ù‚Ø§Ù‹ ÙÙŠ Ø§Ù„ØªÙˆØ§Ø²Ù† (Ù…Ø«Ù„ ÙØ§Ø±Ù‚ Ø§Ù„Ù€ 100 Ø¬.Ù…)ØŒ ÙØ¥Ù† Ø§Ù„Ù‚ÙŠØ¯ Ø£Ùˆ Ø§Ù„Ø³Ø·Ø± Ø§Ù„Ù…Ø³Ø¨Ø¨ ÙŠØªÙ… ÙƒØ´ÙÙ‡ Ù…Ø¨Ø§Ø´Ø±Ø© ÙˆØ¨Ø¯Ù‚Ø© Ù…ØªÙ†Ø§Ù‡ÙŠØ© Ù…Ù† Ø´Ø§Ø´Ø© Ù…ÙŠØ²Ø§Ù† Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø© Ù…Ø¹ Ø¥Ù…ÙƒØ§Ù†ÙŠØ© ÙÙƒ ØªØ±Ø­ÙŠÙ„Ù‡ Ø¨Ù†Ù‚Ø±Ø© ÙˆØ§Ø­Ø¯Ø©.
                </p>
                <button
                  onClick={() => navigate('/trial-balance')}
                  className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs"
                >
                  Ø§Ù„Ø§Ù†ØªÙ‚Ø§Ù„ Ù„Ù…ÙŠØ²Ø§Ù† Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø© Ù„ÙƒØ´Ù ÙˆØªØµØ­ÙŠØ­ Ø§Ù„Ù‚ÙŠØ¯ ÙÙˆØ±Ø§Ù‹
                </button>
              </div>
            ) : (
              'Ù„Ø§ ØªÙˆØ¬Ø¯ Ù‚ÙŠÙˆØ¯ Ù…Ø·Ø§Ø¨Ù‚Ø© Ù„Ù„Ø¨Ø­Ø«.'
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

        {/* Ø¹Ù†Ø§ØµØ± Ø§Ù„ØªØ­ÙƒÙ… ÙÙŠ Ø§Ù„ØªÙ†Ù‚Ù„ ÙˆØ§Ù„ØµÙØ­Ø§Øª */}
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

      {/* ðŸ’± Ù…Ø¹Ø§Ù„Ø¬ Ø¥Ø¹Ø§Ø¯Ø© ØªÙ‚ÙŠÙŠÙ… ÙØ±ÙˆÙ‚ Ø£Ø³Ø¹Ø§Ø± ØµØ±Ù Ø§Ù„Ø¹Ù…Ù„Ø§Øª Ø§Ù„Ø£Ø¬Ù†Ø¨ÙŠØ© */}
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
