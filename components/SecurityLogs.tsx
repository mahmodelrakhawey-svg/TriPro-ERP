import { logger } from '../utils/logger';
import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { 
  ShieldAlert, Search, Activity, Loader2, RefreshCw, Filter, Download, 
  Calendar, AlertCircle, AlertTriangle, Info, CheckCircle2, User, 
  FileText, Clock, ArrowRight, Eye, ChevronDown, ChevronUp, Layers,
  Lock, TrendingUp, Sparkles, UserCheck
} from 'lucide-react';
import * as XLSX from 'xlsx';

type SecurityLog = {
  id: string;
  created_at: string;
  event_type: string;
  description: string;
  severity: 'critical' | 'warning' | 'info';
  module: string;
  performed_by: string | null;
  performer_name: string;
  performer_role?: string;
  metadata?: any;
};

const moduleLabels: Record<string, string> = {
  all: 'ÙƒØ§ÙØ© Ø§Ù„Ù…ÙˆØ¯ÙŠÙˆÙ„Ø§Øª',
  general: 'Ø¹Ø§Ù… / Ø§Ù„Ù†Ø¸Ø§Ù…',
  sales: 'Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª ÙˆØ§Ù„Ø¹Ù…Ù„Ø§Ø¡',
  purchases: 'Ø§Ù„Ù…Ø´ØªØ±ÙŠØ§Øª ÙˆØ§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ†',
  inventory: 'Ø§Ù„Ù…Ø®Ø§Ø²Ù† ÙˆØ§Ù„Ø£ØµÙ†Ø§Ù',
  treasury: 'Ø§Ù„Ø®Ø²ÙŠÙ†Ø© ÙˆØ§Ù„Ø´ÙŠÙƒØ§Øª',
  accounting: 'Ø§Ù„Ù…Ø­Ø§Ø³Ø¨Ø© ÙˆØ§Ù„Ù‚ÙŠÙˆØ¯',
  restaurant: 'Ù†Ù‚Ø§Ø· Ø§Ù„Ø¨ÙŠØ¹ ÙˆØ§Ù„Ù…Ø·Ø§Ø¹Ù…',
  pos: 'Ù†Ù‚Ø§Ø· Ø§Ù„Ø¨ÙŠØ¹ (POS)',
  hr: 'Ø§Ù„Ù…ÙˆØ§Ø±Ø¯ Ø§Ù„Ø¨Ø´Ø±ÙŠØ© ÙˆØ§Ù„Ø±ÙˆØ§ØªØ¨',
  hims: 'Ø§Ù„Ù…Ù†Ø¸ÙˆÙ…Ø© Ø§Ù„Ø·Ø¨ÙŠØ© ÙˆØ§Ù„Ù…Ø³ØªØ´ÙÙŠØ§Øª',
  admin: 'Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ù†Ø¸Ø§Ù… ÙˆØ§Ù„Ø£Ù…Ø§Ù†'
};

// Ø¯Ø§Ù„Ø© Ø°ÙƒÙŠØ© Ù„ØªØµÙ†ÙŠÙ Ø§Ù„Ø£Ø­Ø¯Ø§Ø« Ø§Ù„ØªØ§Ø±ÙŠØ®ÙŠØ© ÙˆØ§Ù„Ø¬Ø¯ÙŠØ¯Ø© Ø¨Ø¯Ù‚Ø©
const inferLogMeta = (rawLog: Record<string, any>): { severity: 'critical' | 'warning' | 'info'; module: string } => {
  let severity = rawLog.severity;
  let module = rawLog.module;
  const evt = (rawLog.event_type || '').toLowerCase();
  const desc = (rawLog.description || '').toLowerCase();

  // 1. ØªØ­Ø¯ÙŠØ¯ Ø§Ù„Ù…ÙˆØ¯ÙŠÙˆÙ„ Ø¥Ù† Ù„Ù… ÙŠÙƒÙ† Ù…Ø³Ø¬Ù„Ø§Ù‹
  if (!module || module === 'general') {
    if (evt.includes('medical') || evt.includes('blood') || evt.includes('patient') || evt.includes('doctor') || evt.includes('clinic') || evt.includes('hims') || evt.includes('surgery') || evt.includes('prescription') || desc.includes('Ù…Ø±ÙŠØ¶') || desc.includes('Ø·Ø¨ÙŠ') || desc.includes('Ø²ÙŠØ§Ø±Ø©') || desc.includes('Ø¯Ù…')) {
      module = 'hims';
    } else if (evt.includes('invoice') || evt.includes('sales') || evt.includes('customer') || evt.includes('price') || desc.includes('ÙØ§ØªÙˆØ±Ø© Ù…Ø¨ÙŠØ¹Ø§Øª') || desc.includes('Ø¹Ù…ÙŠÙ„') || desc.includes('Ø³Ø¹Ø± Ø¨ÙŠØ¹')) {
      module = 'sales';
    } else if (evt.includes('purchase') || evt.includes('supplier') || desc.includes('Ù…Ø´ØªØ±ÙŠØ§Øª') || desc.includes('Ù…ÙˆØ±Ø¯')) {
      module = 'purchases';
    } else if (evt.includes('journal') || evt.includes('account') || evt.includes('accounting') || evt.includes('ledger') || desc.includes('Ù‚ÙŠØ¯') || desc.includes('Ø­Ø³Ø§Ø¨ Ù…Ø§Ù„ÙŠ') || desc.includes('ÙŠÙˆÙ…ÙŠØ©')) {
      module = 'accounting';
    } else if (evt.includes('treasury') || evt.includes('cheque') || evt.includes('voucher') || evt.includes('receipt') || evt.includes('payment') || desc.includes('Ø´ÙŠÙƒ') || desc.includes('Ø³Ù†Ø¯') || desc.includes('Ø®Ø²ÙŠÙ†Ø©')) {
      module = 'treasury';
    } else if (evt.includes('product') || evt.includes('inventory') || evt.includes('stock') || evt.includes('warehouse') || evt.includes('wastage') || desc.includes('ØµÙ†Ù') || desc.includes('Ù…Ø®Ø²Ù†') || desc.includes('Ø¬Ø±Ø¯') || desc.includes('Ù‡Ø§Ù„Ùƒ')) {
      module = 'inventory';
    } else if (evt.includes('restaurant') || evt.includes('order') || evt.includes('table') || evt.includes('kitchen') || evt.includes('pos') || evt.includes('shift') || desc.includes('Ø·Ø§ÙˆÙ„Ø©') || desc.includes('Ù…Ø·Ø¨Ø®') || desc.includes('Ø´ÙØª')) {
      module = 'restaurant';
    } else if (evt.includes('user') || evt.includes('role') || evt.includes('permission') || evt.includes('login') || evt.includes('backup') || evt.includes('setting') || desc.includes('Ù…Ø³ØªØ®Ø¯Ù…') || desc.includes('ØµÙ„Ø§Ø­ÙŠØ§Øª') || desc.includes('Ù†Ø³Ø®Ø©')) {
      module = 'admin';
    } else {
      module = 'general';
    }
  }

  // 2. ØªØ­Ø¯ÙŠØ¯ Ø¯Ø±Ø¬Ø© Ø§Ù„Ø®Ø·ÙˆØ±Ø©
  if (!severity || severity === 'info') {
    if (evt.includes('delete') || evt.includes('unpost') || evt.includes('bounced') || evt.includes('void') || evt.includes('override') || evt.includes('fail') || desc.includes('Ø­Ø°Ù') || desc.includes('ÙÙƒ ØªØ±Ø­ÙŠÙ„') || desc.includes('Ø¥Ù„ØºØ§Ø¡') || desc.includes('Ø§Ø±ØªØ¯Ø§Ø¯')) {
      severity = 'critical';
    } else if (evt.includes('update') || evt.includes('edit') || evt.includes('price') || evt.includes('discount') || evt.includes('adjustment') || desc.includes('ØªØ¹Ø¯ÙŠÙ„') || desc.includes('Ø®ØµÙ…') || desc.includes('ØªØ³ÙˆÙŠØ©') || desc.includes('ØªØºÙŠÙŠØ±')) {
      severity = 'warning';
    } else {
      severity = rawLog.severity || 'info';
    }
  }

  return { severity, module };
};

const SecurityLogs = () => {
  const { currentUser, users: authUsers } = useAuth();
  
  // State
  const [logs, setLogs] = useState<SecurityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedModule, setSelectedModule] = useState<string>('all');
  const [usersList, setUsersList] = useState<{ id: string; name: string; role?: string }[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Date Filters
  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  // Fetch and Sync Users List
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name, role');
        
        let userMap: Record<string, { id: string; name: string; role?: string }> = {};

        // Ø¥Ø¶Ø§ÙØ© Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù…ÙŠÙ† Ù…Ù† AuthContext
        if (authUsers && authUsers.length > 0) {
          authUsers.forEach(u => {
            userMap[u.id] = { id: u.id, name: u.name || u.username, role: u.role };
          });
        }

        // Ø¯Ù…Ø¬ ÙˆÙ…Ø²Ø§Ù…Ù†Ø© Ù…Ø¹ Ø¬Ø¯ÙˆÙ„ profiles
        if (profiles && profiles.length > 0) {
          profiles.forEach(p => {
            const displayName = p.full_name || userMap[p.id]?.name || (p.role ? `${p.role} (${p.id.slice(0, 6)})` : `Ù…Ø³ØªØ®Ø¯Ù… (${p.id.slice(0, 6)})`);
            userMap[p.id] = {
              id: p.id,
              name: displayName,
              role: p.role || userMap[p.id]?.role
            };
          });
        }

        setUsersList(Object.values(userMap));
      } catch (err) {
        logger.error('Error loading users for filter:', err);
      }
    };

    fetchUsers();
  }, [authUsers]);

  // Fetch Logs
  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);

      if (currentUser?.role === 'demo') {
        setLogs([
          {
            id: '1',
            created_at: new Date().toISOString(),
            event_type: 'journal_unposted',
            description: 'âš ï¸ ØªÙ… ÙÙƒ ØªØ±Ø­ÙŠÙ„ Ø§Ù„Ù‚ÙŠØ¯ Ø§Ù„ÙŠÙˆÙ…ÙŠ Ø±Ù‚Ù… (104) ÙˆØ¥Ø¹Ø§Ø¯ØªÙ‡ Ù„Ø­Ø§Ù„Ø© Ø§Ù„Ù…Ø³ÙˆØ¯Ø©',
            severity: 'critical',
            module: 'accounting',
            performed_by: 'demo',
            performer_name: 'Ø£Ø­Ù…Ø¯ Ù…Ø­Ù…ÙˆØ¯ (Ù…Ø¯ÙŠØ± Ù…Ø§Ù„ÙŠ)',
            performer_role: 'admin',
            metadata: { entry_number: 104, old_status: 'posted', new_status: 'draft' }
          },
          {
            id: '2',
            created_at: new Date(Date.now() - 3600000).toISOString(),
            event_type: 'price_override',
            description: 'ØªÙ… ØªØ¹Ø¯ÙŠÙ„ Ø³Ø¹Ø± Ø¨ÙŠØ¹ Ø§Ù„ØµÙ†Ù (Ù„Ø§Ø¨ØªÙˆØ¨ Ø¯ÙŠÙ„) ÙÙŠ Ø§Ù„ÙØ§ØªÙˆØ±Ø© INV-2026-08',
            severity: 'warning',
            module: 'sales',
            performed_by: 'demo',
            performer_name: 'ÙƒØ§Ø´ÙŠØ± Ø§Ù„ÙØ±Ø¹ Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠ',
            performer_role: 'cashier',
            metadata: { item_name: 'Ù„Ø§Ø¨ØªÙˆØ¨ Ø¯ÙŠÙ„', default_price: 25000, new_price: 22500, discount_amount: 2500 }
          },
          {
            id: '3',
            created_at: new Date(Date.now() - 7200000).toISOString(),
            event_type: 'cheque_bounced',
            description: 'Ø¥Ø«Ø¨Ø§Øª Ø§Ø±ØªØ¯Ø§Ø¯ ÙˆØ±ÙØ¶ Ø§Ù„Ø´ÙŠÙƒ Ø§Ù„Ø¨Ù†ÙƒÙŠ Ø±Ù‚Ù… CHQ-99201 Ù„Ø¹Ø¯Ù… ÙƒÙØ§ÙŠØ© Ø§Ù„Ø±ØµÙŠØ¯',
            severity: 'critical',
            module: 'treasury',
            performed_by: 'demo',
            performer_name: 'Ù…Ø³Ø¤ÙˆÙ„ Ø§Ù„Ø®Ø²ÙŠÙ†Ø©',
            performer_role: 'accountant',
            metadata: { cheque_number: 'CHQ-99201', amount: 45000, bank: 'Ø§Ù„Ø¨Ù†Ùƒ Ø§Ù„Ø£Ù‡Ù„ÙŠ' }
          },
          {
            id: '4',
            created_at: new Date(Date.now() - 14400000).toISOString(),
            event_type: 'medical_record_update',
            description: 'ØªØ¹Ø¯ÙŠÙ„ ÙÙŠ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø·Ø¨ÙŠØ© Ù„Ù„Ø²ÙŠØ§Ø±Ø© Ø±Ù‚Ù… bd1f52b8 Ù„Ù„Ù…Ø±ÙŠØ¶ Ø£Ø­Ù…Ø¯ Ø¹Ù„ÙŠ',
            severity: 'warning',
            module: 'hims',
            performed_by: 'demo',
            performer_name: 'Ø¯. Ø®Ø§Ù„Ø¯ Ø¥Ø¨Ø±Ø§Ù‡ÙŠÙ… (Ø·Ø¨ÙŠØ¨ Ø§Ø³ØªØ´Ø§Ø±ÙŠ)',
            performer_role: 'doctor'
          }
        ]);
        setLoading(false);
        return;
      }

      try {
        const { data: { user } } = await supabase.auth.getUser();
        const userOrgId = user?.user_metadata?.org_id;

        if (!userOrgId) return;

        let query = supabase
          .from('security_logs')
          .select('*')
          .eq('organization_id', userOrgId)
          .order('created_at', { ascending: false })
          .limit(800);

        if (searchTerm.trim()) {
          query = query.or(`description.ilike.%${searchTerm}%,event_type.ilike.%${searchTerm}%`);
        }

        if (selectedUser) {
          query = query.eq('performed_by', selectedUser);
        }

        if (startDate) {
          query = query.gte('created_at', `${startDate}T00:00:00`);
        }
        if (endDate) {
          query = query.lte('created_at', `${endDate}T23:59:59`);
        }

        const { data: logsData, error } = await query;
        if (error) throw error;

        if (logsData) {
          // Fetch performer profile names safely
          const userIds = [...new Set(logsData.map(l => l.performed_by).filter(Boolean))];
          let profilesMap: Record<string, { name: string; role?: string }> = {};

          if (userIds.length > 0) {
            const { data: profiles } = await supabase
              .from('profiles')
              .select('id, full_name, role')
              .in('id', userIds as string[]);

            profiles?.forEach(p => {
              profilesMap[p.id] = {
                name: p.full_name || (p.role ? `${p.role} (${p.id.slice(0, 6)})` : `Ù…Ø³ØªØ®Ø¯Ù… (${p.id.slice(0, 6)})`),
                role: p.role
              };
            });
          }

          // Ø¯Ù…Ø¬ Ø§Ù„Ø£Ø³Ù…Ø§Ø¡ ÙˆØ§Ù„ØªØµÙ†ÙŠÙØ§Øª Ø§Ù„Ø°ÙƒÙŠØ©
          const processedLogs: SecurityLog[] = logsData.map(log => {
            const { severity, module } = inferLogMeta(log);
            const performer = log.performed_by ? profilesMap[log.performed_by] : null;

            return {
              ...log,
              severity,
              module,
              performer_name: performer?.name || (log.performed_by ? `Ù…Ø³ØªØ®Ø¯Ù… (${log.performed_by.slice(0, 6)})` : 'Ø§Ù„Ù†Ø¸Ø§Ù… Ø§Ù„Ø¢Ù„ÙŠ / Ø§Ù„Ù…Ø´Ø±Ù'),
              performer_role: performer?.role
            };
          });

          // ØªØ·Ø¨ÙŠÙ‚ ÙÙ„Ø§ØªØ± Ø§Ù„Ù€ Severity ÙˆØ§Ù„Ù€ Module ÙÙŠ Ø§Ù„Ø°Ø§ÙƒØ±Ø© Ù„Ø¶Ù…Ø§Ù† Ø´Ù…ÙˆÙ„ÙŠØ© Ø§Ù„Ø³Ø¬Ù„Ø§Øª Ø§Ù„ØªØ§Ø±ÙŠØ®ÙŠØ©
          const filtered = processedLogs.filter(log => {
            if (selectedSeverity !== 'all' && log.severity !== selectedSeverity) return false;
            if (selectedModule !== 'all' && log.module !== selectedModule) return false;
            return true;
          });

          setLogs(filtered);
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'development') logger.error('Error fetching logs:', err);
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(() => {
      fetchLogs();
    }, 350);

    return () => clearTimeout(timer);
  }, [searchTerm, selectedUser, selectedSeverity, selectedModule, refreshKey, startDate, endDate]);

  // KPI Statistics Calculation
  const kpiStats = useMemo(() => {
    const total = logs.length;
    const critical = logs.filter(l => l.severity === 'critical').length;
    const warning = logs.filter(l => l.severity === 'warning').length;
    const info = logs.filter(l => l.severity === 'info').length;

    // Calculate top performer
    const userCounts: Record<string, { name: string; count: number }> = {};
    logs.forEach(l => {
      if (l.performed_by && l.performer_name && !l.performer_name.includes('Ø§Ù„Ù†Ø¸Ø§Ù…')) {
        if (!userCounts[l.performed_by]) userCounts[l.performed_by] = { name: l.performer_name, count: 0 };
        userCounts[l.performed_by].count++;
      }
    });

    const topPerformer = Object.values(userCounts).sort((a, b) => b.count - a.count)[0]?.name || 'Ø§Ù„Ù…Ø´Ø±Ù Ø§Ù„Ø¹Ø§Ù…';

    return { total, critical, warning, info, topPerformer };
  }, [logs]);

  // Date Range Quick Preset
  const handleQuickDatePreset = (preset: 'today' | 'week' | 'month') => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    setEndDate(todayStr);

    if (preset === 'today') {
      setStartDate(todayStr);
    } else if (preset === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(today.getDate() - 7);
      setStartDate(weekAgo.toISOString().split('T')[0]);
    } else if (preset === 'month') {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(monthStart.toISOString().split('T')[0]);
    }
  };

  // Export to Excel
  const exportToExcel = () => {
    const data = logs.map(log => ({
      'Ø§Ù„Ù…Ø¹Ø±Ù': log.id,
      'Ù…Ø³ØªÙˆÙ‰ Ø§Ù„Ø®Ø·ÙˆØ±Ø©': log.severity === 'critical' ? 'Ø­Ø±Ø¬' : log.severity === 'warning' ? 'ØªØ­Ø°ÙŠØ±ÙŠ' : 'Ù…Ø¹Ù„ÙˆÙ…Ø§ØªÙŠ',
      'Ø§Ù„Ù…ÙˆØ¯ÙŠÙˆÙ„': moduleLabels[log.module || 'general'] || log.module,
      'Ù†ÙˆØ¹ Ø§Ù„Ø­Ø¯Ø«': log.event_type,
      'Ø§Ù„ÙˆØµÙ ÙˆØ§Ù„ØªÙØ§ØµÙŠÙ„': log.description,
      'Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… Ø§Ù„Ù…Ø³Ø¤ÙˆÙ„': log.performer_name,
      'Ø§Ù„Ø¯ÙˆØ± Ø§Ù„ÙˆØ¸ÙŠÙÙŠ': log.performer_role || '',
      'Ø§Ù„ØªØ§Ø±ÙŠØ® ÙˆØ§Ù„ÙˆÙ‚Øª': new Date(log.created_at).toLocaleString('ar-EG'),
      'Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„ØªÙØµÙŠÙ„ÙŠØ© (JSON)': log.metadata ? JSON.stringify(log.metadata) : ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Security_Audit_Logs");
    XLSX.writeFile(wb, `Security_Audit_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-red-100 text-red-700 border border-red-200 shadow-xs">
            <AlertTriangle size={12} className="shrink-0" />
            <span>Ø­Ø±Ø¬ (Critical)</span>
          </span>
        );
      case 'warning':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <AlertCircle size={12} className="shrink-0" />
            <span>ØªØ­Ø°ÙŠØ±ÙŠ (Warning)</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <Info size={12} className="shrink-0" />
            <span>Ù…Ø¹Ù„ÙˆÙ…Ø§ØªÙŠ (Info)</span>
          </span>
        );
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto animate-in fade-in space-y-6">
      
      {/* ðŸ‘‘ Ø±Ø£Ø³ Ø§Ù„Ø´Ø§Ø´Ø© */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3.5 bg-gradient-to-br from-red-500 to-rose-600 rounded-2xl text-white shadow-md shadow-red-100">
            <ShieldAlert size={32} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-800">Ø³Ø¬Ù„Ø§Øª Ø§Ù„Ø£Ù…Ø§Ù† ÙˆØ§Ù„Ø±Ù‚Ø§Ø¨Ø© ÙˆØ§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©</h1>
              <span className="px-2.5 py-0.5 bg-red-50 text-red-700 border border-red-100 rounded-full text-xs font-bold">
                Audit Trail
              </span>
            </div>
            <p className="text-slate-500 text-sm mt-1">
              Ø±ØµØ¯ ÙˆØªÙˆØ«ÙŠÙ‚ ÙƒØ§ÙØ© Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª Ø§Ù„Ø­Ø³Ø§Ø³Ø©ØŒ Ø§Ù„ØªØ¹Ø¯ÙŠÙ„Ø§Øª Ø§Ù„Ù…Ø§Ù„ÙŠØ©ØŒ ÙˆØ­Ø±ÙƒØ§Øª Ø§Ù„Ø­Ø°Ù Ù„Ø­Ù…Ø§ÙŠØ© Ø£ØµÙˆÙ„ ÙˆØ¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…Ù†Ø´Ø£Ø©.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={exportToExcel}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-md shadow-emerald-100 transition-all"
            title="ØªØµØ¯ÙŠØ± ØªÙ‚Ø±ÙŠØ± Ø§Ù„ØªØ¯Ù‚ÙŠÙ‚ Ø¥Ù„Ù‰ Ù…Ù„Ù Excel"
          >
            <Download size={18} />
            <span>ØªØµØ¯ÙŠØ± Excel</span>
          </button>

          <button
            onClick={() => setRefreshKey(k => k + 1)}
            className="p-2.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl transition-all shadow-xs"
            title="ØªØ­Ø¯ÙŠØ« Ø§Ù„Ø³Ø¬Ù„Ø§Øª"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* ðŸ“Š Ø¨Ø·Ø§Ù‚Ø§Øª Ø§Ù„Ù…Ø¤Ø´Ø±Ø§Øª Ø§Ù„Ø¥Ø­ØµØ§Ø¦ÙŠØ© (KPI Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-400">Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø³Ø¬Ù„Ø§Øª Ø§Ù„Ù…Ø±ØµÙˆØ¯Ø©</div>
            <div className="text-2xl font-black text-slate-800 mt-1 font-mono">{kpiStats.total}</div>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <Activity size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-red-100 shadow-sm flex items-center justify-between bg-red-50/20">
          <div>
            <div className="text-xs font-bold text-red-600">Ø¹Ù…Ù„ÙŠØ§Øª Ø­Ø±Ø¬Ø© (Critical)</div>
            <div className="text-2xl font-black text-red-600 mt-1 font-mono">{kpiStats.critical}</div>
          </div>
          <div className="p-3 bg-red-100 text-red-600 rounded-xl">
            <AlertTriangle size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-amber-100 shadow-sm flex items-center justify-between bg-amber-50/20">
          <div>
            <div className="text-xs font-bold text-amber-600">Ø¹Ù…Ù„ÙŠØ§Øª ØªØ­Ø°ÙŠØ±ÙŠØ© (Warnings)</div>
            <div className="text-2xl font-black text-amber-600 mt-1 font-mono">{kpiStats.warning}</div>
          </div>
          <div className="p-3 bg-amber-100 text-amber-600 rounded-xl">
            <AlertCircle size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-400">Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… Ø§Ù„Ø£ÙƒØ«Ø± Ù†Ø´Ø§Ø·Ø§Ù‹</div>
            <div className="text-sm font-black text-slate-700 mt-1 truncate max-w-[140px]" title={kpiStats.topPerformer}>
              {kpiStats.topPerformer}
            </div>
          </div>
          <div className="p-3 bg-slate-100 text-slate-600 rounded-xl">
            <UserCheck size={24} />
          </div>
        </div>
      </div>

      {/* ðŸ§­ Ø´Ø±ÙŠØ· Ø§Ù„ÙÙ„Ø§ØªØ± ÙˆØ§Ù„Ø¨Ø­Ø« Ø§Ù„Ù…ØªÙ‚Ø¯Ù… */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row items-center gap-3">
          
          {/* Ø­Ù‚Ù„ Ø§Ù„Ø¨Ø­Ø« Ø§Ù„Ù„Ø­Ø¸ÙŠ */}
          <div className="relative flex-1 w-full">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Ø¨Ø­Ø« ÙÙŠ Ø§Ù„Ø³Ø¬Ù„Ø§Øª ÙˆØ§Ù„ØªÙØ§ØµÙŠÙ„ (ÙØ§ØªÙˆØ±Ø©ØŒ Ù‚ÙŠØ¯ØŒ Ø§Ø³Ù… Ù…Ø³ØªØ®Ø¯Ù…ØŒ Ø´ÙŠÙƒØŒ ØµÙ†ÙØŒ Ù…Ø±ÙŠØ¶)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pr-11 pl-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 font-medium"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 font-bold"
              >
                Ù…Ø³Ø­
              </button>
            )}
          </div>

          {/* ÙÙ„ØªØ± Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù…ÙŠÙ† */}
          <div className="w-full lg:w-56">
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full py-2.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="">Ø¬Ù…ÙŠØ¹ Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù…ÙŠÙ† ({usersList.length})</option>
              {usersList.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name} {u.role ? `(${u.role})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* ÙÙ„ØªØ± Ø§Ù„Ù…ÙˆØ¯ÙŠÙˆÙ„ */}
          <div className="w-full lg:w-48">
            <select
              value={selectedModule}
              onChange={(e) => setSelectedModule(e.target.value)}
              className="w-full py-2.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              {Object.entries(moduleLabels).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Ù†Ø·Ø§Ù‚ Ø§Ù„ØªØ§Ø±ÙŠØ® Ù…Ø¹ Ø£Ø²Ø±Ø§Ø± Ø³Ø±ÙŠØ¹Ø© */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
          
          {/* ØªØ¨ÙˆÙŠØ¨Ø§Øª Ø¯Ø±Ø¬Ø© Ø§Ù„Ø®Ø·ÙˆØ±Ø© */}
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {[
              { id: 'all', label: 'ÙƒØ§ÙØ© Ø§Ù„Ù…Ø³ØªÙˆÙŠØ§Øª' },
              { id: 'critical', label: 'ðŸš¨ Ø§Ù„Ø­Ø±Ø¬ ÙÙ‚Ø·' },
              { id: 'warning', label: 'âš ï¸ Ø§Ù„ØªØ­Ø°ÙŠØ±ÙŠ ÙÙ‚Ø·' },
              { id: 'info', label: 'â„¹ï¸ Ø§Ù„Ù…Ø¹Ù„ÙˆÙ…Ø§ØªÙŠ ÙÙ‚Ø·' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setSelectedSeverity(tab.id)}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                  selectedSeverity === tab.id
                    ? tab.id === 'critical'
                      ? 'bg-red-600 text-white shadow-sm'
                      : tab.id === 'warning'
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Ù…Ø­Ø¯Ø¯ Ø§Ù„ØªØ§Ø±ÙŠØ® ÙˆØ§Ø®ØªØµØ§Ø±Ø§ØªÙ‡ */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
              <Calendar size={14} className="text-slate-400" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent border-none text-xs font-bold text-slate-700 outline-none w-28"
              />
              <span className="text-slate-300">Ø¥Ù„Ù‰</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent border-none text-xs font-bold text-slate-700 outline-none w-28"
              />
            </div>

            <div className="flex gap-1">
              <button
                onClick={() => handleQuickDatePreset('today')}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-bold text-[11px]"
              >
                Ø§Ù„ÙŠÙˆÙ…
              </button>
              <button
                onClick={() => handleQuickDatePreset('week')}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-bold text-[11px]"
              >
                Ø¢Ø®Ø± 7 Ø£ÙŠØ§Ù…
              </button>
              <button
                onClick={() => handleQuickDatePreset('month')}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-bold text-[11px]"
              >
                Ù‡Ø°Ø§ Ø§Ù„Ø´Ù‡Ø±
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* ðŸ“œ Ø¬Ø¯ÙˆÙ„ ÙˆØ§Ø³ØªØ¹Ø±Ø§Ø¶ Ø³Ø¬Ù„Ø§Øª Ø§Ù„Ø£Ù…Ø§Ù† */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-16 text-center flex flex-col items-center justify-center text-slate-500 space-y-3">
            <Loader2 className="animate-spin text-red-600" size={36} />
            <p className="font-bold text-slate-700">Ø¬Ø§Ø±ÙŠ ØªØ­Ù…ÙŠÙ„ Ø³Ø¬Ù„Ø§Øª Ø§Ù„ØªØ¯Ù‚ÙŠÙ‚ Ø§Ù„Ø£Ù…Ù†ÙŠ...</p>
            <p className="text-xs text-slate-400">ÙŠØªÙ… ØªØ¬Ù…ÙŠØ¹ Ø§Ù„Ø£Ø­Ø¯Ø§Ø« Ù…Ù† Ù…Ø­Ø±Ùƒ Ø§Ù„Ø±Ù‚Ø§Ø¨Ø© Ø§Ù„Ù…Ø±ÙƒØ²ÙŠ</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-16 text-center text-slate-500 space-y-3">
            <ShieldAlert size={48} className="mx-auto text-slate-300" />
            <h3 className="text-lg font-bold text-slate-700">Ù„Ø§ ØªÙˆØ¬Ø¯ Ø³Ø¬Ù„Ø§Øª Ù…Ø·Ø§Ø¨Ù‚Ø©</h3>
            <p className="text-slate-400 text-xs">Ù„Ù… ÙŠØªÙ… Ø±ØµØ¯ Ø£ÙŠ Ø¹Ù…Ù„ÙŠØ§Øª ØªØ·Ø§Ø¨Ù‚ Ù…Ø¹Ø§ÙŠÙŠØ± Ø§Ù„Ø¨Ø­Ø« ÙˆØ§Ù„ÙÙ„ØªØ±Ø© Ø§Ù„Ù…Ø­Ø¯Ø¯Ø©.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-50/80 text-slate-500 text-xs uppercase font-black border-b border-slate-100">
                  <th className="px-5 py-4 w-36">Ø§Ù„Ø®Ø·ÙˆØ±Ø©</th>
                  <th className="px-5 py-4 w-40">Ø§Ù„Ù…ÙˆØ¯ÙŠÙˆÙ„</th>
                  <th className="px-5 py-4">Ø§Ù„Ø¹Ù…Ù„ÙŠØ© ÙˆØ§Ù„Ø­Ø¯Ø«</th>
                  <th className="px-5 py-4 w-56">Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… Ø§Ù„Ù…Ø³Ø¤ÙˆÙ„</th>
                  <th className="px-5 py-4 w-44 text-left">Ø§Ù„ØªØ§Ø±ÙŠØ® ÙˆØ§Ù„ÙˆÙ‚Øª</th>
                  <th className="px-3 py-4 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {logs.map(log => {
                  const isExpanded = expandedLogId === log.id;
                  const hasDetails = Boolean(log.metadata && Object.keys(log.metadata).length > 0);

                  return (
                    <React.Fragment key={log.id}>
                      <tr 
                        onClick={() => hasDetails && setExpandedLogId(isExpanded ? null : log.id)}
                        className={`transition-colors ${hasDetails ? 'cursor-pointer hover:bg-slate-50/80' : 'hover:bg-slate-50/40'} ${
                          log.severity === 'critical' ? 'bg-red-50/15' : log.severity === 'warning' ? 'bg-amber-50/10' : ''
                        }`}
                      >
                        {/* Ù…Ø³ØªÙˆÙ‰ Ø§Ù„Ø®Ø·ÙˆØ±Ø© */}
                        <td className="px-5 py-4">
                          {getSeverityBadge(log.severity)}
                        </td>

                        {/* Ø§Ù„Ù…ÙˆØ¯ÙŠÙˆÙ„ */}
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {moduleLabels[log.module] || log.module}
                          </span>
                        </td>

                        {/* ØªÙØ§ØµÙŠÙ„ Ø§Ù„Ø­Ø¯Ø« */}
                        <td className="px-5 py-4">
                          <div className="font-bold text-slate-800 text-xs leading-relaxed">
                            {log.description}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                            {log.event_type}
                          </div>
                        </td>

                        {/* Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… Ø§Ù„Ù…Ø³Ø¤ÙˆÙ„ */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 font-black text-xs flex items-center justify-center border border-slate-200">
                              {log.performer_name?.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-slate-800 text-xs truncate max-w-[150px]">
                                {log.performer_name}
                              </div>
                              {log.performer_role && (
                                <div className="text-[10px] text-slate-400 font-mono truncate max-w-[150px]">
                                  {log.performer_role}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Ø§Ù„ØªØ§Ø±ÙŠØ® ÙˆØ§Ù„ÙˆÙ‚Øª */}
                        <td className="px-5 py-4 text-left font-mono text-xs text-slate-500" dir="ltr">
                          {new Date(log.created_at).toLocaleString('ar-EG')}
                        </td>

                        {/* Ø²Ø± Ø§Ù„ØªÙØ§ØµÙŠÙ„ */}
                        <td className="px-3 py-4 text-center">
                          {hasDetails && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedLogId(isExpanded ? null : log.id);
                              }}
                              className="p-1 text-slate-400 hover:text-slate-600 rounded"
                            >
                              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                          )}
                        </td>
                      </tr>

                      {/* Ø´Ø±ÙŠØ· Ø§Ù„ØªÙØ§ØµÙŠÙ„ Ø§Ù„Ø¥Ø¶Ø§ÙÙŠØ© ÙˆØ§Ù„Ù€ Diff Ø¹Ù†Ø¯ Ø§Ù„ØªÙˆØ³ÙŠØ¹ */}
                      {isExpanded && log.metadata && (
                        <tr className="bg-slate-50/70 border-b border-slate-200">
                          <td colSpan={6} className="px-8 py-4">
                            <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2 text-xs shadow-xs">
                              <div className="flex items-center gap-2 font-bold text-slate-700 border-b border-slate-100 pb-2">
                                <FileText size={14} className="text-indigo-600" />
                                <span>Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„ØªÙØµÙŠÙ„ÙŠØ© Ø§Ù„Ù…Ø³Ø¬Ù„Ø© ÙÙŠ Ø§Ù„Ø³Ø¬Ù„ Ø§Ù„Ø£Ù…Ù†ÙŠ (Audit Metadata):</span>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                                {Object.entries(log.metadata).map(([k, v]) => (
                                  <div key={k} className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                                    <span className="font-bold text-slate-600 block mb-0.5">{k}:</span>
                                    <pre className="text-[11px] text-slate-800 font-mono whitespace-pre-wrap break-all dir-ltr text-left">
                                      {typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v)}
                                    </pre>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};

export default SecurityLogs;
