import { logger } from '../../utils/logger';
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
import { Account } from '../../types';

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

  // Ù…Ø²Ø§Ù…Ù†Ø© Ø§Ù„ØªÙˆØ§Ø±ÙŠØ® ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ Ø¹Ù†Ø¯ ØªØºÙŠÙŠØ± Ø§Ù„Ø³Ù†Ø© Ø§Ù„Ù…Ø§Ù„ÙŠØ© Ø§Ù„Ù…Ø®ØªØ§Ø±Ø© Ù…Ù† Ø´Ø±ÙŠØ· Ø§Ù„Ù†Ø¸Ø§Ù…
  useEffect(() => {
    if (selectedFiscalYear) {
      setStartDate(`${selectedFiscalYear}-01-01`);
      setEndDate(`${selectedFiscalYear}-12-31`);
    }
  }, [selectedFiscalYear]);

  // Ø¯Ø§Ù„Ø© Ù„Ø¬Ù„Ø¨ Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø­Ø±ÙƒØ§Øª Ù…Ù† Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ù„Ø¶Ù…Ø§Ù† Ø§Ù„Ø¯Ù‚Ø©
  const fetchLedgerData = async () => {
    setLoading(true);
    if (currentUser?.role === 'demo') {
        // ØªØ­Ø³ÙŠÙ† Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø¯ÙŠÙ…Ùˆ Ù„ØªÙƒÙˆÙ† Ù…Ù†Ø·Ù‚ÙŠØ© ÙˆÙ…ØªØ²Ù†Ø©
        const demoLines = entries
            .filter(e => e.status === 'posted')
            .flatMap(entry => {
                // Ø§Ø³ØªÙ†ØªØ§Ø¬ Ù†ÙˆØ¹ Ø§Ù„Ø­Ø³Ø§Ø¨ Ø¨Ù†Ø§Ø¡Ù‹ Ø¹Ù„Ù‰ Ù†ÙˆØ¹ Ø§Ù„Ù‚ÙŠØ¯ Ù„Ø¶Ù…Ø§Ù† Ø¹Ø±Ø¶ Ø¨ÙŠØ§Ù†Ø§Øª ÙˆØ§Ù‚Ø¹ÙŠØ©
                const ref = (entry.reference || '').toUpperCase();
                const entryLines = entry.journal_lines || entry.lines || [];
                
                return entryLines.map((line: Record<string, any>, idx: number) => {
                    let smartAccountId = line.accountId || line.account_id;
                    
                    // Ø¥Ø°Ø§ ÙƒØ§Ù† Ø§Ù„Ø­Ø³Ø§Ø¨ ØºÙŠØ± Ù…Ø¹Ø±ÙˆÙ ÙÙŠ Ø§Ù„Ø¯ÙŠÙ…ÙˆØŒ Ù†Ù…Ù†Ø­Ù‡ Ù‡ÙˆÙŠØ© Ø¨Ù†Ø§Ø¡Ù‹ Ø¹Ù„Ù‰ Ø§Ù„Ø³ÙŠØ§Ù‚
                    if (!smartAccountId || smartAccountId === 'UNKNOWN') {
                        if (line.debit > 0) {
                            if (ref.startsWith('INV')) smartAccountId = '10201'; // Ø¹Ù…Ù„Ø§Ø¡
                            else if (ref.startsWith('RCT')) smartAccountId = '10101'; // ØµÙ†Ø¯ÙˆÙ‚
                            else if (ref.startsWith('PAY')) smartAccountId = '20101'; // Ù…ÙˆØ±Ø¯ÙŠÙ†
                            else if (ref.startsWith('PUR')) smartAccountId = '50101'; // Ù…Ø´ØªØ±ÙŠØ§Øª
                            else if (ref.includes('DEMO-001')) smartAccountId = '11101'; // Ø£Ø«Ø§Ø« (Ø­Ø³Ø¨ Ù†ØµÙƒ)
                            else if (ref.includes('DEMO-002')) smartAccountId = '50201'; // ÙƒÙ‡Ø±Ø¨Ø§Ø¡ (Ø­Ø³Ø¨ Ù†ØµÙƒ)
                            else smartAccountId = '50301'; // Ù…ØµØ±ÙˆÙØ§Øª Ø¹Ø§Ù…Ø©
                        } else {
                            if (ref.startsWith('INV')) smartAccountId = '40101'; // Ù…Ø¨ÙŠØ¹Ø§Øª
                            else if (ref.startsWith('RCT')) smartAccountId = '10201'; // Ø¹Ù…Ù„Ø§Ø¡
                            else if (ref.startsWith('PAY')) smartAccountId = '10101'; // ØµÙ†Ø¯ÙˆÙ‚
                            else if (ref.startsWith('PUR')) smartAccountId = '20101'; // Ù…ÙˆØ±Ø¯ÙŠÙ†
                            else if (ref.includes('DEMO-001')) smartAccountId = '10101'; // ØµÙ†Ø¯ÙˆÙ‚
                            else if (ref.includes('DEMO-002')) smartAccountId = '10101'; // ØµÙ†Ø¯ÙˆÙ‚
                            else smartAccountId = '10101'; // ØµÙ†Ø¯ÙˆÙ‚
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

    // ðŸ”’ Ù…Ù†Ø·Ù‚ Ø§Ù„Ù†Ø³Ø®Ø© Ø§Ù„Ø£ØµÙ„ÙŠØ©: Ø¬Ù„Ø¨ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„ÙØ¹Ù„ÙŠØ© Ù…Ù† Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª
    try {
      // ðŸ›¡ï¸ ØªØ­Ø¯ÙŠØ¯ Ù‡ÙˆÙŠØ© Ø§Ù„Ù…Ù†Ø¸Ù…Ø© Ø§Ù„Ù…ÙˆØ­Ø¯Ø© ÙˆØ§Ù„Ù…Ø­ØµÙ†Ø©
      let userOrgId: string | undefined | null =
        getActiveOrgIdSync(currentSelectedOrgId) ||
        (currentUser as any)?.organization_id ||
        (currentUser as any)?.user_metadata?.org_id;

      if (!userOrgId) {
        userOrgId = await resolveActiveOrgId(currentSelectedOrgId);
      }

      if (!userOrgId) {
        toast.error('ØªØ¹Ø°Ø± ØªØ­Ø¯ÙŠØ¯ Ø§Ù„Ù…Ù†Ø¸Ù…Ø©. ÙŠØ±Ø¬Ù‰ ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø®Ø±ÙˆØ¬ ÙˆØ§Ù„Ø¯Ø®ÙˆÙ„ Ù…Ø¬Ø¯Ø¯Ø§Ù‹.');
        setLoading(false);
        return;
      }

      // ðŸš€ Ø§Ù„Ø®Ø·ÙˆØ© 1 (Dual-Engine Fast Path): Ø§Ø³ØªØ¹Ù„Ø§Ù… Ø¯Ø§Ù„Ø© Ø§Ù„ØªØ¬Ù…ÙŠØ¹ Ø§Ù„Ø³Ø±ÙŠØ¹Ø© Ø¹Ù„Ù‰ Ù…Ø³ØªÙˆÙ‰ PostgreSQL
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
          // ØªØµÙÙŠØ± Ø£Ø³Ø·Ø± Ø§Ù„ÙŠÙˆÙ…ÙŠØ© Ø§Ù„Ù…Ø­Ù„ÙŠØ© Ù„ØªÙˆÙÙŠØ± Ø§Ù„Ø°Ø§ÙƒØ±Ø© ÙˆØ§Ù„Ø´Ø¨ÙƒØ©
          setLedgerLines([]);
        }
      } catch (rpcEx) {
        logger.warn('[TrialBalance] Server RPC unavailable, falling back to chunked query:', rpcEx);
      }

      // ðŸ›¡ï¸ Ø§Ù„Ø®Ø·ÙˆØ© 2 (Graceful Degradation Fallback): Ø¬Ù„Ø¨ Ø§Ù„Ø³Ø·ÙˆØ± Ù…Ù‚Ø³Ù…Ø© Ø¥Ø°Ø§ Ù„Ù… ØªØªÙˆÙØ± Ø¯Ø§Ù„Ø© Ø§Ù„Ø®Ø§Ø¯Ù…
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
    } catch (err) {
      logger.error('Error fetching ledger:', err);
      // ØªÙ…ÙŠÙŠØ² Ø£Ø®Ø·Ø§Ø¡ Ø§Ù„Ø´Ø¨ÙƒØ© Ø¹Ù† Ø£Ø®Ø·Ø§Ø¡ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª
      if (
        err?.message?.includes('Failed to fetch') ||
        err?.message?.includes('ERR_CONNECTION') ||
        err?.name === 'AbortError' ||
        err?.message?.includes('network')
      ) {
        toast.error('Ø§Ù†Ù‚Ø·Ø¹ Ø§Ù„Ø§ØªØµØ§Ù„ Ø¨Ø§Ù„Ø®Ø§Ø¯Ù…. ÙŠØ±Ø¬Ù‰ Ø§Ù„ØªØ­Ù‚Ù‚ Ù…Ù† Ø§Ù„Ø¥Ù†ØªØ±Ù†Øª ÙˆØ¥Ø¹Ø§Ø¯Ø© Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø©.');
      } else {
        toast.error('ÙØ´Ù„ Ø¬Ù„Ø¨ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // Ø¯Ø§Ù„Ø© Ù„Ø¬Ù„Ø¨ ØªÙØ§ØµÙŠÙ„ Ø§Ù„Ø£Ø³Ø·Ø± Ù„Ù„ØªØ¯Ù‚ÙŠÙ‚ ÙÙŠ Ø­Ø§Ù„ ÙˆØ¬ÙˆØ¯ Ø¹Ø¯Ù… Ø§ØªØ²Ø§Ù†
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
          toast.error('ØªØ¹Ø°Ø± ØªØ­Ø¯ÙŠØ¯ Ø§Ù„Ù…Ù†Ø¸Ù…Ø©.');
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
      } catch (err) {
        toast.error('ØªØ¹Ø°Ø± Ø¬Ù„Ø¨ ØªÙØ§ØµÙŠÙ„ Ø§Ù„Ø£Ø³Ø·Ø± Ù„Ù„ØªØ¯Ù‚ÙŠÙ‚: ' + err.message);
      } finally {
        setLoading(false);
      }
    }
    setShowUnbalancedModal(true);
  };


  const handleRefresh = async () => {
    setLoading(true);
    await refreshData(); // ØªØ­Ø¯ÙŠØ« Ø¯Ù„ÙŠÙ„ Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª (Ù„Ø¥Ø¸Ù‡Ø§Ø± Ø§Ù„Ø¯Ù…Ø¬)
    await fetchLedgerData(); // ØªØ­Ø¯ÙŠØ« Ø§Ù„Ø£Ø±ØµØ¯Ø©
    setLoading(false);
  };

  useEffect(() => {
    fetchLedgerData();
  }, [endDate, entries, currentUser]); // Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„Ø¬Ù„Ø¨ Ø¹Ù†Ø¯ ØªØºÙŠÙŠØ± Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø£Ùˆ Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù…

  // Ø­Ø³Ø§Ø¨ Ø§Ù„Ø£Ø±ØµØ¯Ø©
  const reportData = useMemo(() => {
    // 1. ØªÙ‡ÙŠØ¦Ø© Ù‡ÙŠÙƒÙ„ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ù„ØªØ¬Ù…ÙŠØ¹ Ø§Ù„Ø£Ø±ØµØ¯Ø©
    const accStats: Record<string, { open: number, transDr: number, transCr: number }> = {};
    
    // Ø§Ø³ØªØ®Ø¯Ø§Ù… Map Ù„Ø³Ù‡ÙˆÙ„Ø© Ø§Ù„ÙˆØµÙˆÙ„ ÙˆÙ„Ø¥Ø¶Ø§ÙØ© Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ù…ÙÙ‚ÙˆØ¯Ø©
    const allAccountsMap = new Map<string, any>();
    accounts.forEach(a => {
        accStats[a.id] = { open: 0, transDr: 0, transCr: 0 };
        allAccountsMap.set(a.id, a);
    });

    if (rpcSummary && rpcSummary.length > 0) {
      // ðŸš€ Ø§Ù„Ø®Ø·ÙˆØ© 1: Ø­Ù‚Ù† Ø¥Ø­ØµØ§Ø¦ÙŠØ§Øª Ø§Ù„Ø®Ø§Ø¯Ù… Ø§Ù„Ù…Ø¬Ù…Ø¹Ø© Ù…Ø¨Ø§Ø´Ø±Ø©
      rpcSummary.forEach((row: Record<string, any>) => {
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
            name: row.account_name || 'Ø­Ø³Ø§Ø¨ ØºÙŠØ± Ù…Ø¹Ø±ÙˆÙ',
            type: row.account_type || 'other',
            isGroup: Boolean(row.is_group),
            parent_id: row.parent_id
          });
        }
      });
    } else {
      // Ø­Ù‚Ù† Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ø¯ÙŠÙ…Ùˆ Ø¥Ø°Ø§ ÙƒÙ†Ø§ ÙÙŠ ÙˆØ¶Ø¹ Ø§Ù„Ø¯ÙŠÙ…Ùˆ Ù„Ø¶Ù…Ø§Ù† Ø¸Ù‡ÙˆØ± Ø§Ù„Ø£Ø³Ù…Ø§Ø¡
      if (currentUser?.role === 'demo') {
          const demoAccountsList = [
              { id: '10101', code: '10101', name: 'Ø§Ù„Ù†Ù‚Ø¯ÙŠØ© Ø¨Ø§Ù„ØµÙ†Ø¯ÙˆÙ‚', isGroup: false, parentAccount: '101' },
              { id: '10201', code: '10201', name: 'Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡', isGroup: false, parentAccount: '102' },
              { id: '11101', code: '11101', name: 'Ø§Ù„Ø£Ø«Ø§Ø« ÙˆØ§Ù„ØªØ¬Ù‡ÙŠØ²Ø§Øª', isGroup: false, parentAccount: '111' },
              { id: '20101', code: '20101', name: 'Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ†', isGroup: false, parentAccount: '201' },
              { id: '40101', code: '40101', name: 'Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª', isGroup: false, parentAccount: '401' },
              { id: '50101', code: '50101', name: 'Ø§Ù„Ù…Ø´ØªØ±ÙŠØ§Øª', isGroup: false, parentAccount: '501' },
              { id: '50201', code: '50201', name: 'ÙƒÙ‡Ø±Ø¨Ø§Ø¡ ÙˆÙ…ÙŠØ§Ù‡', isGroup: false, parentAccount: '502' },
              { id: '50301', code: '50301', name: 'Ù…ØµØ±ÙˆÙØ§Øª Ø¥Ø¯Ø§Ø±ÙŠØ©', isGroup: false, parentAccount: '503' },
          ];
          demoAccountsList.forEach(da => {
              if (!allAccountsMap.has(da.id)) {
                  allAccountsMap.set(da.id, da);
                  accStats[da.id] = { open: 0, transDr: 0, transCr: 0 };
              }
          });
      }

      // 2. ØªØ¬Ù…ÙŠØ¹ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ù…Ù† Ø§Ù„Ø®Ø·ÙˆØ· Ø§Ù„Ù…Ø¬Ù„ÙˆØ¨Ø© Ù…Ù† Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª (Fallback)
      ledgerLines.forEach(line => {
        // Ø¥Ø°Ø§ ÙƒØ§Ù† Ø§Ù„Ø­Ø³Ø§Ø¨ ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯ ÙÙŠ Ø§Ù„Ù‚Ø§Ø¦Ù…Ø© (Ù…Ø­Ø°ÙˆÙ)ØŒ Ù†Ø¶ÙŠÙÙ‡ Ù…Ø¤Ù‚ØªØ§Ù‹ Ù„Ù„Ø¹Ø±Ø¶
        if (!accStats[line.account_id]) {
            accStats[line.account_id] = { open: 0, transDr: 0, transCr: 0 };
            allAccountsMap.set(line.account_id, {
                id: line.account_id,
                code: 'UNKNOWN',
                name: 'Ø­Ø³Ø§Ø¨ Ù…Ø­Ø°ÙˆÙ/ØºÙŠØ± Ù…Ø¹Ø±ÙˆÙ',
                isGroup: false
            });
        }

        const date = line.journal_entries.transaction_date;
        const isBefore = date < startDate;
        const isWithin = date >= startDate && date <= endDate;

        if (isBefore) {
            // Ø§Ù„Ø±ØµÙŠØ¯ Ø§Ù„Ø§ÙØªØªØ§Ø­ÙŠ: Ø§Ù„Ù…Ø¯ÙŠÙ† Ù…ÙˆØ¬Ø¨ ÙˆØ§Ù„Ø¯Ø§Ø¦Ù† Ø³Ø§Ù„Ø¨
            accStats[line.account_id].open += (line.debit - line.credit);
        } else if (isWithin) {
            // Ø­Ø±ÙƒØ§Øª Ø§Ù„ÙØªØ±Ø©
            accStats[line.account_id].transDr += line.debit;
            accStats[line.account_id].transCr += line.credit;
        }
      });
    }

    // 3. Ø¯Ø§Ù„Ø© ØªØ¬Ù…ÙŠØ¹ÙŠØ© Ù„Ù„Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠØ© (Recursive)
    const getAccountStats = (accountId: string): { open: number, transDr: number, transCr: number } => {
        const acc = allAccountsMap.get(accountId);
        if (!acc) return { open: 0, transDr: 0, transCr: 0 };

        // Ø¥Ø°Ø§ ÙƒØ§Ù† Ø­Ø³Ø§Ø¨ ÙØ±Ø¹ÙŠØŒ Ù†Ø±Ø¬Ø¹ Ù‚ÙŠÙ…Ù‡ Ø§Ù„Ù…Ø¬Ù…Ø¹Ø© Ø³Ø§Ø¨Ù‚Ø§Ù‹
        if (!acc.isGroup) {
            return accStats[accountId] || { open: 0, transDr: 0, transCr: 0 };
        }

        // Ø¥Ø°Ø§ ÙƒØ§Ù† Ø­Ø³Ø§Ø¨ Ø±Ø¦ÙŠØ³ÙŠØŒ Ù†Ø¬Ù…Ø¹ Ø£Ø¨Ù†Ø§Ø¡Ù‡
        const children = Array.from(allAccountsMap.values()).filter((a: Account & Record<string, any>) => a.parent_id === accountId);
        let total = { open: 0, transDr: 0, transCr: 0 };
        
        children.forEach(child => {
            const childStats = getAccountStats(child.id);
            total.open += childStats.open;
            total.transDr += childStats.transDr;
            total.transCr += childStats.transCr;
        });
        
        return total;
    };

    // 4. Ø¨Ù†Ø§Ø¡ Ø§Ù„Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ù†Ù‡Ø§Ø¦ÙŠØ©
    let result = Array.from(allAccountsMap.values()).map((acc: Account & Record<string, any>) => {
        const stats = getAccountStats(acc.id);
        return {
            ...acc,
            openBalance: stats.open,
            periodDebit: stats.transDr,
            periodCredit: stats.transCr,
            closeBalance: stats.open + stats.transDr - stats.transCr
        };
    });

    // 5. Ø§Ù„ØªØµÙÙŠØ© ÙˆØ§Ù„ØªØ±ØªÙŠØ¨
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

  // Ø­Ø³Ø§Ø¨ Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠØ§Øª
  const totals = useMemo(() => {
    // Ø­Ø³Ø§Ø¨ Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠØ§Øª Ù…Ù† Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø®Ø§Ù… Ù…Ø¨Ø§Ø´Ø±Ø© Ù„Ø¶Ù…Ø§Ù† Ø§Ù„Ø¯Ù‚Ø© ÙˆØªØ¬Ù†Ø¨ Ù…Ø´Ø§ÙƒÙ„ Ø§Ù„Ù‡ÙŠÙƒÙ„ÙŠØ©
    const rawTotals = { openDr: 0, openCr: 0, transDr: 0, transCr: 0, closeDr: 0, closeCr: 0 };

    if (rpcSummary && rpcSummary.length > 0) {
      rpcSummary.forEach((row: Record<string, any>) => {
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
    
    // Ù†Ø¹ÙŠØ¯ Ø­Ø³Ø§Ø¨ Ø§Ù„Ø£Ø±ØµØ¯Ø© Ø§Ù„Ø®Ø§Ù… Ù…Ù† ledgerLines ÙˆØ§Ù„Ø­Ø³Ø§Ø¨Ø§Øª (Fallback)
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

  // Ø§Ù„ØªØ­Ù‚Ù‚ Ù…Ù† Ø§Ù„ØªÙˆØ§Ø²Ù†
  const isBalanced = 
      Math.abs(totals.openDr - totals.openCr) < 0.1 &&
      Math.abs(totals.transDr - totals.transCr) < 0.1 &&
      Math.abs(totals.closeDr - totals.closeCr) < 0.1;

  // ðŸ” ØªØ¯Ù‚ÙŠÙ‚ ÙˆØªØ­Ø¯ÙŠØ¯ Ø§Ù„Ù‚ÙŠÙˆØ¯ ØºÙŠØ± Ø§Ù„Ù…ØªÙˆØ§Ø²Ù†Ø© ÙˆØ§Ù„Ø£Ø³Ø·Ø± Ø§Ù„Ù…Ø¹Ù„Ù‚Ø© Ø§Ù„Ù…Ø³Ø¨Ø¨Ø© Ù„Ù„ÙØ±Ù‚ Ù…Ø¨Ø§Ø´Ø±Ø© Ù…Ù† Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…Ø­Ù…Ù„Ø©
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
    if (!window.confirm('Ù‡Ù„ ØªØ±ÙŠØ¯ ÙÙƒ ØªØ±Ø­ÙŠÙ„ Ù‡Ø°Ø§ Ø§Ù„Ù‚ÙŠØ¯ ØºÙŠØ± Ø§Ù„Ù…ØªÙˆØ§Ø²Ù† ÙˆØªØ­ÙˆÙŠÙ„Ù‡ Ø¥Ù„Ù‰ Ù…Ø³ÙˆØ¯Ø©ØŸ\n\nØ¨Ù…Ø¬Ø±Ø¯ ØªØ­ÙˆÙŠÙ„Ù‡ Ù„Ù…Ø³ÙˆØ¯Ø©ØŒ Ø³ÙŠØªÙ… Ø§Ø³ØªØ¨Ø¹Ø§Ø¯Ù‡ ÙÙˆØ±Ø§Ù‹ Ù…Ù† Ù…ÙŠØ²Ø§Ù† Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø© Ù„ÙŠØµØ¨Ø­ Ù…ØªØ²Ù†Ø§Ù‹ 100%ØŒ ÙˆÙŠÙ…ÙƒÙ†Ùƒ Ù…Ø±Ø§Ø¬Ø¹Ø© Ø§Ù„Ù‚ÙŠØ¯ ÙˆØªØ¹Ø¯ÙŠÙ„Ù‡ Ù…Ù† Ø¯ÙØªØ± Ø§Ù„ÙŠÙˆÙ…ÙŠØ©.')) {
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
    } catch (err) {
      toast.error('Ø­Ø¯Ø« Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ ÙÙƒ Ø§Ù„ØªØ±Ø­ÙŠÙ„: ' + err.message);
    } finally {
      setIsFixingEntry(false);
    }
  };

  const handleNavigateToEntry = (entry: Record<string, any>) => {
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
      'Ø§Ù„ÙƒÙˆØ¯': r.code,
      'Ø§Ù„Ø­Ø³Ø§Ø¨': r.name,
      'Ø±ØµÙŠØ¯ Ø£ÙˆÙ„ (Ù…Ø¯ÙŠÙ†)': r.openBalance > 0 ? r.openBalance : 0,
      'Ø±ØµÙŠØ¯ Ø£ÙˆÙ„ (Ø¯Ø§Ø¦Ù†)': r.openBalance < 0 ? Math.abs(r.openBalance) : 0,
      'Ø­Ø±ÙƒØ© (Ù…Ø¯ÙŠÙ†)': r.periodDebit,
      'Ø­Ø±ÙƒØ© (Ø¯Ø§Ø¦Ù†)': r.periodCredit,
      'Ø±ØµÙŠØ¯ Ø¢Ø®Ø± (Ù…Ø¯ÙŠÙ†)': r.closeBalance > 0 ? r.closeBalance : 0,
      'Ø±ØµÙŠØ¯ Ø¢Ø®Ø± (Ø¯Ø§Ø¦Ù†)': r.closeBalance < 0 ? Math.abs(r.closeBalance) : 0,
    }));
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ù…ÙŠØ²Ø§Ù† Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©");
    XLSX.writeFile(wb, "TrialBalance_Advanced.xlsx");
  };

  const exportToPDF = () => {
    const input = document.getElementById('report-content');
    if (!input) return;

    html2canvas(input, { scale: 2 }).then((canvas) => {
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('l', 'mm', 'a4'); // l = landscape (Ø¹Ø±Ø¶ÙŠ)
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save("TrialBalance.pdf");
    });
  };

  const handleRowClick = (accountId: string, isGroup: boolean) => {
    if (isGroup) return; // Ù„Ø§ Ù†Ù†ØªÙ‚Ù„ Ù„Ù„Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„ØªØ¬Ù…ÙŠØ¹ÙŠØ©
    navigate('/ledger', { 
      state: { accountId, startDate, endDate } 
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 print:hidden">
        <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <FileText className="text-blue-600" /> Ù…ÙŠØ²Ø§Ù† Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø© (Ø¨Ø§Ù„Ø£Ø±ØµØ¯Ø© ÙˆØ§Ù„Ù…Ø¬Ø§Ù…ÙŠØ¹)
            </h2>
            <p className="text-slate-500 text-sm">ØªÙ‚Ø±ÙŠØ± ØªÙØµÙŠÙ„ÙŠ Ù„Ù„Ø£Ø±ØµØ¯Ø© Ø§Ù„Ø§ÙØªØªØ§Ø­ÙŠØ© ÙˆØ§Ù„Ø­Ø±ÙƒØ§Øª ÙˆØ§Ù„Ø£Ø±ØµØ¯Ø© Ø§Ù„Ø®ØªØ§Ù…ÙŠØ©</p>
        </div>
        <div className="flex gap-2">
            <button onClick={handleRefresh} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors font-bold text-sm">
                <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> ØªØ­Ø¯ÙŠØ«
            </button>
            <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors">
                <Printer size={18} /> Ø·Ø¨Ø§Ø¹Ø©
            </button>
            <button onClick={exportToExcel} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors">
                <Download size={18} /> ØªØµØ¯ÙŠØ± Excel
            </button>
            <button onClick={exportToPDF} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
                <FileText size={18} /> PDF
            </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-end gap-4 print:hidden">
          <div className="w-full md:w-auto">
              <label className="block text-sm font-bold text-slate-700 mb-1">Ù…Ù† ØªØ§Ø±ÙŠØ®</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border rounded-lg p-2" />
          </div>
          <div className="w-full md:w-auto">
              <label className="block text-sm font-bold text-slate-700 mb-1">Ø¥Ù„Ù‰ ØªØ§Ø±ÙŠØ®</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border rounded-lg p-2" />
          </div>
          <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-bold text-slate-700 mb-1">Ø¨Ø­Ø«</label>
              <div className="relative">
                  <Search className="absolute right-3 top-2.5 text-slate-400" size={18} />
                  <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Ø¨Ø­Ø« Ø¨Ø§Ø³Ù… Ø§Ù„Ø­Ø³Ø§Ø¨ Ø£Ùˆ Ø§Ù„ÙƒÙˆØ¯..." className="w-full pr-10 pl-4 py-2 border rounded-lg" />
              </div>
          </div>
          <div className="flex items-center gap-2 pb-2">
              <input type="checkbox" id="hideZero" checked={hideZeroAccounts} onChange={e => setHideZeroAccounts(e.target.checked)} className="w-4 h-4" />
              <label htmlFor="hideZero" className="text-sm font-bold text-slate-700 cursor-pointer">Ø¥Ø®ÙØ§Ø¡ Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„ØµÙØ±ÙŠØ©</label>
          </div>
          <div className="flex items-center gap-2 pb-2">
              <input type="checkbox" id="showOpening" checked={showOpeningOnly} onChange={e => setShowOpeningOnly(e.target.checked)} className="w-4 h-4" />
              <label htmlFor="showOpening" className="text-sm font-bold text-slate-700 cursor-pointer">Ø¹Ø±Ø¶ Ø§Ù„Ø£Ø±ØµØ¯Ø© Ø§Ù„Ø§ÙØªØªØ§Ø­ÙŠØ© ÙÙ‚Ø·</label>
          </div>
      </div>

      {/* Ù…Ø¤Ø´Ø± Ø§Ù„ØªÙˆØ§Ø²Ù† */}
      {!loading && (
        <div className={`p-4 rounded-xl border flex flex-col gap-3 ${isBalanced ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 font-bold">
                  {isBalanced ? <CheckCircle size={24} /> : <AlertTriangle size={24} />}
                  <span>{isBalanced ? 'Ø§Ù„Ù…ÙŠØ²Ø§Ù† Ù…ØªØ²Ù† ØªÙ…Ø§Ù…Ø§Ù‹ (Ø§Ù„Ø£Ø±ØµØ¯Ø© ÙˆØ§Ù„Ù…Ø¬Ø§Ù…ÙŠØ¹ Ù…Ø·Ø§Ø¨Ù‚Ø©)' : 'ØªÙ†Ø¨ÙŠÙ‡: Ø§Ù„Ù…ÙŠØ²Ø§Ù† ØºÙŠØ± Ù…ØªØ²Ù†! ÙŠØ±Ø¬Ù‰ Ù…Ø±Ø§Ø¬Ø¹Ø© Ø§Ù„Ù‚ÙŠÙˆØ¯.'}</span>
              </div>
              {!isBalanced && (
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold bg-white/80 px-2.5 py-1 rounded-lg border border-red-300 text-red-900" dir="ltr">
                    Ø§Ù„ÙØ±Ù‚: {Math.abs(totals.closeDr - totals.closeCr).toFixed(2)} Ø¬.Ù…
                  </span>
                  <button
                    onClick={handleOpenUnbalancedAudit}
                    className="bg-red-600 hover:bg-red-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer animate-pulse"
                    title="ÙƒØ´Ù ØªÙØ§ØµÙŠÙ„ Ø§Ù„Ù‚ÙŠÙˆØ¯ ØºÙŠØ± Ø§Ù„Ù…ØªÙˆØ§Ø²Ù†Ø© Ø§Ù„Ù…Ø³Ø¨Ø¨Ø© Ù„Ù‡Ø°Ø§ Ø§Ù„ÙØ±Ù‚ ÙˆØ¥Ù…ÙƒØ§Ù†ÙŠØ© ÙÙƒ ØªØ±Ø­ÙŠÙ„Ù‡Ø§ ÙÙˆØ±Ø§Ù‹"
                  >
                    <Search size={14} />
                    ÙƒØ´Ù ÙˆØªØµØ­ÙŠØ­ Ø§Ù„Ù‚ÙŠØ¯ Ø§Ù„Ù…Ø³Ø¨Ø¨ Ù„Ù„ÙØ±Ù‚ ({unbalancedAudit.entries.length} Ù‚ÙŠØ¯)
                  </button>
                </div>
              )}
            </div>

            {/* Ø¨Ø·Ø§Ù‚Ø© ÙƒØ´Ù Ø§Ù„Ù‚ÙŠØ¯ Ø§Ù„Ù…Ø³Ø¨Ø¨ ÙÙˆØ±Ø§Ù‹ Ø£Ø³ÙÙ„ Ø´Ø±ÙŠØ· Ø§Ù„ØªØ­Ø°ÙŠØ± Ù…Ø¨Ø§Ø´Ø±Ø© */}
            {!isBalanced && unbalancedAudit.entries.length > 0 && (
              <div className="mt-1 bg-white rounded-xl border-2 border-red-300 p-4 shadow-sm text-slate-800 animate-in fade-in">
                <div className="flex flex-wrap items-center justify-between border-b border-red-100 pb-2 mb-3 gap-2">
                  <div className="flex items-center gap-2 text-red-700 font-bold text-sm">
                    <AlertTriangle size={18} />
                    <span>ØªÙ… ØªØ­Ø¯ÙŠØ¯ Ø§Ù„Ù‚ÙŠØ¯ Ø§Ù„Ù…Ø³Ø¨Ø¨ Ù„ÙØ±Ù‚ Ø§Ù„Ù€ {unbalancedAudit.entries[0].absDifference.toFixed(2)} Ø¬.Ù… Ø¨Ù†Ø¬Ø§Ø­:</span>
                  </div>
                  <span className="bg-red-100 text-red-800 font-mono text-xs px-2.5 py-1 rounded-md font-bold">
                    Ù…Ø±Ø¬Ø¹ Ø§Ù„Ù‚ÙŠØ¯: {unbalancedAudit.entries[0].reference}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs mb-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <div>
                    <span className="text-slate-500 block mb-0.5">Ø§Ù„Ø¨ÙŠØ§Ù†:</span>
                    <span className="font-bold text-slate-800">{unbalancedAudit.entries[0].description || 'Ø¨Ø¯ÙˆÙ† Ø¨ÙŠØ§Ù†'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block mb-0.5">Ø§Ù„ØªØ§Ø±ÙŠØ®:</span>
                    <span className="font-bold text-slate-800">{unbalancedAudit.entries[0].transaction_date || '-'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block mb-0.5">Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ù…Ø¯ÙŠÙ† ÙˆØ§Ù„Ø¯Ø§Ø¦Ù†:</span>
                    <span className="font-bold text-slate-800 font-mono">
                      Ù…Ø¯ÙŠÙ†: {unbalancedAudit.entries[0].debit.toLocaleString()} | Ø¯Ø§Ø¦Ù†: {unbalancedAudit.entries[0].credit.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block mb-0.5">Ø§Ù„ÙØ§Ø±Ù‚ ØºÙŠØ± Ø§Ù„Ù…ØªÙˆØ§Ø²Ù†:</span>
                    <span className="font-bold text-red-600 font-mono">
                      {unbalancedAudit.entries[0].difference > 0 
                        ? `Ø²ÙŠØ§Ø¯Ø© Ù…Ø¯ÙŠÙ†: +${unbalancedAudit.entries[0].absDifference.toFixed(2)} Ø¬.Ù…` 
                        : `Ø²ÙŠØ§Ø¯Ø© Ø¯Ø§Ø¦Ù†: +${unbalancedAudit.entries[0].absDifference.toFixed(2)} Ø¬.Ù…`}
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
                    âš¡ ÙÙƒ Ø§Ù„ØªØ±Ø­ÙŠÙ„ ÙÙˆØ±Ø§Ù‹ (ØªØ­ÙˆÙŠÙ„ Ù„Ù…Ø³ÙˆØ¯Ø© Ù„Ù…ÙˆØ§Ø²Ù†Ø© Ø§Ù„Ù…ÙŠØ²Ø§Ù† Ø§Ù„Ø¢Ù†)
                  </button>
                  <button
                    onClick={() => handleNavigateToEntry(unbalancedAudit.entries[0])}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <ExternalLink size={14} />
                    ÙØªØ­ Ø§Ù„Ù‚ÙŠØ¯ ÙÙŠ Ø¯ÙØªØ± Ø§Ù„ÙŠÙˆÙ…ÙŠØ© Ù„ØªØ¹Ø¯ÙŠÙ„Ù‡
                  </button>
                  <button
                    onClick={handleOpenUnbalancedAudit}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                  >
                    Ø¹Ø±Ø¶ ØªÙØ§ØµÙŠÙ„ Ø£Ø³Ø·Ø± Ø§Ù„Ù‚ÙŠØ¯ ({unbalancedAudit.entries[0].lines.length} Ø³Ø·Ø±)
                  </button>
                </div>
              </div>
            )}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border-none">
        <ReportHeader title="Ù…ÙŠØ²Ø§Ù† Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©" subtitle={`Ù…Ù† ${startDate} Ø¥Ù„Ù‰ ${endDate}`} />
        <div className="overflow-x-auto" id="report-content">
            <table className="w-full text-right text-sm border-collapse">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b-2 border-slate-200">
                    <tr>
                        <th rowSpan={2} className="p-3 border-l border-slate-200 w-24">Ø§Ù„ÙƒÙˆØ¯</th>
                        <th rowSpan={2} className="p-3 border-l border-slate-200 min-w-[200px]">Ø§Ø³Ù… Ø§Ù„Ø­Ø³Ø§Ø¨</th>
                        <th colSpan={2} className="p-2 border-l border-slate-200 text-center bg-blue-50">Ø±ØµÙŠØ¯ Ø£ÙˆÙ„ Ø§Ù„Ù…Ø¯Ø©</th>
                        {!showOpeningOnly && <th colSpan={2} className="p-2 border-l border-slate-200 text-center bg-amber-50">Ø§Ù„Ø­Ø±ÙƒØ© Ø®Ù„Ø§Ù„ Ø§Ù„ÙØªØ±Ø©</th>}
                        {!showOpeningOnly && <th colSpan={2} className="p-2 text-center bg-emerald-50">Ø±ØµÙŠØ¯ Ø¢Ø®Ø± Ø§Ù„Ù…Ø¯Ø©</th>}
                    </tr>
                    <tr className="text-xs">
                        <th className="p-2 border-l border-slate-200 border-t border-slate-200 bg-blue-50/50">Ù…Ø¯ÙŠÙ†</th>
                        <th className="p-2 border-l border-slate-200 border-t border-slate-200 bg-blue-50/50">Ø¯Ø§Ø¦Ù†</th>
                        {!showOpeningOnly && (
                            <>
                                <th className="p-2 border-l border-slate-200 border-t border-slate-200 bg-amber-50/50">Ù…Ø¯ÙŠÙ†</th>
                                <th className="p-2 border-l border-slate-200 border-t border-slate-200 bg-amber-50/50">Ø¯Ø§Ø¦Ù†</th>
                                <th className="p-2 border-l border-slate-200 border-t border-slate-200 bg-emerald-50/50">Ù…Ø¯ÙŠÙ†</th>
                                <th className="p-2 border-t border-slate-200 bg-emerald-50/50">Ø¯Ø§Ø¦Ù†</th>
                            </>
                        )}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {reportData.map((row) => (
                        <tr 
                            key={row.id} 
                            className={`transition-colors ${row.isGroup ? 'bg-slate-50 font-bold text-slate-800' : 'text-slate-600 hover:bg-blue-50 cursor-pointer'}`}
                            onClick={() => handleRowClick(row.id, Boolean(row.isGroup))}
                            title={!row.isGroup ? "Ø§Ø¶ØºØ· Ù„Ø¹Ø±Ø¶ ÙƒØ´Ù Ø§Ù„Ø­Ø³Ø§Ø¨" : ""}
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
                        <tr><td colSpan={8} className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" /> Ø¬Ø§Ø±ÙŠ Ø­Ø³Ø§Ø¨ Ø§Ù„Ø£Ø±ØµØ¯Ø©...</td></tr>
                    )}
                    {!loading && (
                    <tr>
                        <td colSpan={2} className="p-3 text-center border-l border-slate-300">Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„ÙƒÙ„ÙŠ</td>
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

      {/* Ù†Ø§ÙØ°Ø© ØªÙØ§ØµÙŠÙ„ ÙˆÙ…Ø¹Ø§Ù„Ø¬Ø© Ø§Ù„Ù‚ÙŠÙˆØ¯ ØºÙŠØ± Ø§Ù„Ù…ØªÙˆØ§Ø²Ù†Ø© */}
      {showUnbalancedModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Ø±Ø£Ø³ Ø§Ù„Ù†Ø§ÙØ°Ø© */}
            <div className="p-4 bg-red-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle size={22} />
                <h3 className="font-bold text-lg">ØªØ¯Ù‚ÙŠÙ‚ Ø§Ù„Ù‚ÙŠÙˆØ¯ ØºÙŠØ± Ø§Ù„Ù…ØªÙˆØ§Ø²Ù†Ø© Ø§Ù„Ù…Ø³Ø¨Ø¨Ø© Ù„ÙØ±Ù‚ Ø§Ù„Ù…ÙŠØ²Ø§Ù†</h3>
              </div>
              <button 
                onClick={() => setShowUnbalancedModal(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-red-700 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Ù…Ø­ØªÙˆÙ‰ Ø§Ù„Ù†Ø§ÙØ°Ø© */}
            <div className="p-6 overflow-y-auto space-y-6">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-900 text-sm flex items-center justify-between">
                <div>
                  <span className="font-bold block">Ø¥Ø¬Ù…Ø§Ù„ÙŠ ÙØ§Ø±Ù‚ Ø¹Ø¯Ù… Ø§Ù„ØªÙˆØ§Ø²Ù†: {Math.abs(totals.closeDr - totals.closeCr).toFixed(2)} Ø¬.Ù…</span>
                  <span className="text-xs text-red-700">ØªÙ… ÙƒØ´Ù Ø§Ù„Ù‚ÙŠÙˆØ¯ Ø§Ù„Ù…Ø±Ø­Ù„Ø© Ø§Ù„ØªÙŠ ØªØ³Ø¨Ø¨Øª ÙÙŠ Ø¹Ø¯Ù… ØªØ³Ø§ÙˆÙŠ Ø§Ù„Ù…Ø¯ÙŠÙ† ÙˆØ§Ù„Ø¯Ø§Ø¦Ù† ÙÙŠ Ø§Ù„Ø£Ø³ØªØ§Ø° Ø§Ù„Ø¹Ø§Ù….</span>
                </div>
                <span className="bg-red-600 text-white text-xs px-3 py-1 rounded-full font-bold">
                  {unbalancedAudit.entries.length} Ù‚ÙŠØ¯ ØºÙŠØ± Ù…ØªÙˆØ§Ø²Ù†
                </span>
              </div>

              {unbalancedAudit.entries.map((entry) => (
                <div key={entry.id} className="border border-slate-200 rounded-xl p-4 bg-white shadow-xs space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold bg-slate-100 text-slate-800 px-2.5 py-1 rounded text-sm">
                        {entry.reference}
                      </span>
                      <span className="font-bold text-slate-800 text-sm">{entry.description || 'Ø¨Ø¯ÙˆÙ† Ø¨ÙŠØ§Ù†'}</span>
                      <span className="text-xs text-slate-400">({entry.transaction_date})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-red-100 text-red-800">
                        Ø§Ù„ÙØ§Ø±Ù‚: {entry.absDifference.toFixed(2)} Ø¬.Ù… {entry.difference > 0 ? '(Ù…Ø¯ÙŠÙ† Ø£ÙƒØ¨Ø±)' : '(Ø¯Ø§Ø¦Ù† Ø£ÙƒØ¨Ø±)'}
                      </span>
                    </div>
                  </div>

                  {/* Ø¬Ø¯ÙˆÙ„ Ø£Ø³Ø·Ø± Ù‡Ø°Ø§ Ø§Ù„Ù‚ÙŠØ¯ */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-right border-collapse">
                      <thead className="bg-slate-50 text-slate-600 border-y border-slate-200">
                        <tr>
                          <th className="p-2">ÙƒÙˆØ¯ Ø§Ù„Ø­Ø³Ø§Ø¨</th>
                          <th className="p-2">Ø§Ø³Ù… Ø§Ù„Ø­Ø³Ø§Ø¨</th>
                          <th className="p-2">Ø§Ù„Ø¨ÙŠØ§Ù†</th>
                          <th className="p-2 text-left">Ù…Ø¯ÙŠÙ†</th>
                          <th className="p-2 text-left">Ø¯Ø§Ø¦Ù†</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {entry.lines.map((l: Record<string, any>, idx: number) => {
                          const acc = accounts.find(a => a.id === l.account_id);
                          return (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="p-2 font-mono text-slate-600">{acc?.code || 'UNKNOWN'}</td>
                              <td className="p-2 font-bold text-slate-800">{acc?.name || 'Ø­Ø³Ø§Ø¨ ØºÙŠØ± Ù…Ø¹Ø±ÙˆÙ'}</td>
                              <td className="p-2 text-slate-500">{l.description || '-'}</td>
                              <td className="p-2 font-mono text-left text-blue-700">{l.debit > 0 ? Number(l.debit).toLocaleString() : '-'}</td>
                              <td className="p-2 font-mono text-left text-blue-700">{l.credit > 0 ? Number(l.credit).toLocaleString() : '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-slate-100 font-bold border-t border-slate-200">
                        <tr>
                          <td colSpan={3} className="p-2 text-center text-slate-700">Ù…Ø¬Ù…ÙˆØ¹ Ø§Ù„Ù‚ÙŠØ¯</td>
                          <td className="p-2 font-mono text-left text-blue-900">{entry.debit.toLocaleString()}</td>
                          <td className="p-2 font-mono text-left text-blue-900">{entry.credit.toLocaleString()}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Ø¥Ø¬Ø±Ø§Ø¡Ø§Øª Ø³Ø±ÙŠØ¹Ø© Ø¹Ù„Ù‰ Ø§Ù„Ù‚ÙŠØ¯ */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                    <button
                      onClick={() => handleUnpostAndFix(entry.id)}
                      disabled={isFixingEntry}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                    >
                      {isFixingEntry ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                      ÙÙƒ Ø§Ù„ØªØ±Ø­ÙŠÙ„ ÙÙˆØ±Ø§Ù‹ (ØªØ­ÙˆÙŠÙ„ Ù„Ù…Ø³ÙˆØ¯Ø© Ù„Ù…ÙˆØ§Ø²Ù†Ø© Ø§Ù„Ù…ÙŠØ²Ø§Ù† Ø§Ù„Ø¢Ù†)
                    </button>
                    <button
                      onClick={() => handleNavigateToEntry(entry)}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <ExternalLink size={14} />
                      ØªØ¹Ø¯ÙŠÙ„ ÙÙŠ Ø¯ÙØªØ± Ø§Ù„ÙŠÙˆÙ…ÙŠØ©
                    </button>
                  </div>
                </div>
              ))}

              {/* ÙÙŠ Ø­Ø§Ù„ ÙˆØ¬ÙˆØ¯ Ø£Ø³Ø·Ø± Ù…Ø¹Ù„Ù‚Ø© Ø¨Ø¯ÙˆÙ† Ù‚ÙŠØ¯ */}
              {unbalancedAudit.orphanLines.length > 0 && (
                <div className="border border-amber-300 bg-amber-50 rounded-xl p-4 text-amber-900 text-xs space-y-2">
                  <div className="font-bold flex items-center gap-1.5 text-sm text-amber-800">
                    <AlertTriangle size={16} />
                    <span>ØªÙ†Ø¨ÙŠÙ‡: ØªÙ… Ø§Ù„Ø¹Ø«ÙˆØ± Ø¹Ù„Ù‰ {unbalancedAudit.orphanLines.length} Ø£Ø³Ø·Ø± Ù…Ø¹Ù„Ù‚Ø© ÙÙŠ Ø¬Ø¯ÙˆÙ„ Ø§Ù„Ø£Ø³ØªØ§Ø° Ø§Ù„Ø¹Ø§Ù… Ø¨Ø¯ÙˆÙ† Ø±Ø£Ø³ Ù‚ÙŠØ¯ Ø±Ø¦ÙŠØ³ÙŠ.</span>
                  </div>
                  <p>Ù‡Ø°Ù‡ Ø§Ù„Ø­Ø±ÙƒØ§Øª Ù…Ø³Ø¬Ù„Ø© Ù…Ø¨Ø§Ø´Ø±Ø© ÙÙŠ Ø§Ù„Ø£Ø³ØªØ§Ø° Ø§Ù„Ø¹Ø§Ù… ÙˆÙ‚Ø¯ ØªØ³Ø¨Ø¨ ÙØ±ÙˆÙ‚Ø§Øª Ù…ÙŠØ²Ø§Ù†. ÙŠÙˆØµÙ‰ Ø¨Ù…Ø±Ø§Ø¬Ø¹ØªÙ‡Ø§ ÙˆØ­Ø°ÙÙ‡Ø§ Ù…Ù† Ø®Ù„Ø§Ù„ ØªÙ†Ø¸ÙŠÙ Ø§Ù„Ù‚ÙŠÙˆØ¯ ÙÙŠ Ø¯ÙØªØ± Ø§Ù„ÙŠÙˆÙ…ÙŠØ©.</p>
                </div>
              )}
            </div>

            {/* ØªØ°ÙŠÙŠÙ„ Ø§Ù„Ù†Ø§ÙØ°Ø© */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setShowUnbalancedModal(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                Ø¥ØºÙ„Ø§Ù‚
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrialBalanceAdvanced;
