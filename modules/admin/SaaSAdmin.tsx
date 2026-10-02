import { logger } from '../../utils/logger';
import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import * as XLSX from 'xlsx';
import { useAccounting } from '../../context/AccountingContext';
import { 
  Users, 
  DollarSign, 
  TrendingUp, 
  CheckCircle, 
  UserPlus, 
  Building2,
  ArrowUpRight,
  Copy,
  Loader2,
  RefreshCw,
  Settings,
  Trash2,
  X,
  Save,
  Lock,
  Eye,
  ShieldCheck,
  Wrench,
  XCircle,
  Search,
  Filter,
  FileSpreadsheet,
  RotateCcw,
  Download,
  Database as DatabaseIcon,
  PlusCircle,
  Upload,
  GitFork,
  Sparkles,
  UploadCloud
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { secureStorage } from '../../utils/securityMiddleware';
import { offsiteBackupService } from '../../services/offsiteBackupService';



import { 
  AVAILABLE_MODULES, 
  PLAN_CONFIGS, 
  PlatformStats, 
  Organization, 
  OrganizationBackup 
} from './types/saasTypes';
import AddClientModal from './components/AddClientModal';
import EditClientModal from './components/EditClientModal';
import CloneCompanyModal from './components/CloneCompanyModal';
import { DeleteConfirmModal, OrphanedFilesModal } from './components/SaaSAdminActionModals';

const StatCard = ({ title, value, icon: Icon, color, suffix = '', growth = null }: Record<string, any>) => (
  <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col gap-4">
    <div className="flex justify-between items-start">
      <div className={`p-3 rounded-2xl ${color} bg-opacity-10`}>
        <Icon size={24} className={color.split(' ')[1]} />
      </div>
      {growth !== null && (
        <div className={`flex items-center gap-1 text-xs font-bold ${growth >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
          {growth >= 0 ? '+' : ''}{growth}%
          <TrendingUp size={14} className={growth < 0 ? 'rotate-180' : ''} />
        </div>
      )}
    </div>
    <div>
      <p className="text-slate-500 text-sm font-medium">{title}</p>
      <h3 className="text-2xl font-black text-slate-800 mt-1">
        {typeof value === 'number' ? value.toLocaleString() : value}
        <span className="text-sm font-bold mr-1">{suffix}</span>
      </h3>
    </div>
  </div>
);


const SaaSAdmin: React.FC = () => {
  const { currentUser, isLoading } = useAccounting(); // Ø¬Ù„Ø¨ Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… Ø§Ù„Ø­Ø§Ù„ÙŠ ÙˆØ­Ø§Ù„Ø© Ø§Ù„ØªØ­Ù…ÙŠÙ„
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);
  const [cloningSourceOrg, setCloningSourceOrg] = useState<Organization | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingOrg, setDeletingOrg] = useState<Organization | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [isOrphanedModalOpen, setIsOrphanedModalOpen] = useState(false);
  const [orphanedFiles, setOrphanedFiles] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activityTypeFilter, setActivityTypeFilter] = useState('all'); // ðŸ‘ˆ Ø­Ø§Ù„Ø© Ø¬Ø¯ÙŠØ¯Ø© Ù„ÙÙ„ØªØ± Ù†ÙˆØ¹ Ø§Ù„Ù†Ø´Ø§Ø·
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const { showToast } = useToast();

  // --- Backup Management States ---
  const [activeAdminTab, setActiveAdminTab] = useState<'organizations' | 'backups'>('organizations');
  const [selectedBackupOrgId, setSelectedBackupOrgId] = useState<string | null>(null);
  const [backups, setBackups] = useState<OrganizationBackup[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [orphanedBackupsCount, setOrphanedBackupsCount] = useState(0);


  // --- End Backup Management States ---

  const loadData = async () => {
    try {
      setLoading(true);
      setLoadingOrgs(true);
      const { data, error } = await supabase.rpc('get_admin_platform_metrics');
      if (error) throw error;
      setStats(data);

      // Ø¬Ù„Ø¨ Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø´Ø±ÙƒØ§Øª Ù…Ø¹ Ø­Ø³Ø§Ø¨ Ø¹Ø¯Ø¯ Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù…ÙŠÙ† ÙŠØ¯ÙˆÙŠØ§Ù‹ Ù„Ø¶Ù…Ø§Ù† Ø§Ù„Ø¯Ù‚Ø©
      const { data: orgsData, error: orgsError } = await supabase
        .from('organizations')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (orgsError) throw orgsError;

      // Ø¬Ù„Ø¨ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø¥Ø¶Ø§ÙÙŠØ© (Ù…Ø³ØªØ®Ø¯Ù…ÙŠÙ† ÙˆÙ…Ø¨ÙŠØ¹Ø§Øª) Ù„ÙƒÙ„ Ø§Ù„Ø´Ø±ÙƒØ§Øª
      const [{ data: profiles }, { data: salesData }] = await Promise.all([
        supabase.from('profiles').select('organization_id'),
        supabase.from('invoices').select('organization_id, total_amount').eq('status', 'posted')
      ]);

      const userCounts: Record<string, number> = {};
      profiles?.forEach(p => {
        if (p.organization_id) userCounts[p.organization_id] = (userCounts[p.organization_id] || 0) + 1;
      });

      const salesMap: Record<string, number> = {};
      salesData?.forEach(inv => {
        if (inv.organization_id) salesMap[inv.organization_id] = (salesMap[inv.organization_id] || 0) + Number(inv.total_amount);
      });

      const processedOrgs = (orgsData || []).map(org => ({
        ...org,
        user_count: userCounts[org.id] || 0,
        total_sales: salesMap[org.id] || 0
      }));

      setOrgs(processedOrgs);
      // ðŸ” ÙØ­Øµ Ø§Ù„Ù†Ø³Ø® Ø§Ù„Ø§Ø­ØªÙŠØ§Ø·ÙŠØ© Ø§Ù„ÙŠØªÙŠÙ…Ø© Ù„Ù„ÙŠÙˆØ²Ø± Ø§Ù„Ø¹Ø§Ù„Ù…ÙŠ ÙÙ‚Ø·
      if (currentUser?.role === 'super_admin') {
        const { data: allBackups } = await supabase
          .from('organization_backups')
          .select('organization_id');

        if (allBackups) {
          const orgIds = new Set(processedOrgs.map(o => o.id));
          const orphaned = allBackups.filter(b => !orgIds.has(b.organization_id));
          setOrphanedBackupsCount(orphaned.length);
          
          if (orphaned.length > 0) {
            showToast(`ØªÙ†Ø¨ÙŠÙ‡: ØªÙ… Ø§Ù„Ø¹Ø«ÙˆØ± Ø¹Ù„Ù‰ ${orphaned.length} Ù†Ø³Ø®Ø© Ø§Ø­ØªÙŠØ§Ø·ÙŠØ© ÙŠØªÙŠÙ…Ø© Ù„Ø´Ø±ÙƒØ§Øª Ù…Ø­Ø°ÙˆÙØ©!`, 'warning');
          }
        }
      }      
    } catch (error) {
      showToast('Ø®Ø·Ø£ ÙÙŠ ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª: ' + error.message, 'error');
    } finally {
      setLoading(false);
      setLoadingOrgs(false);
    }
  };
  const handleCleanupOrphanedBackups = async () => {
    if (orphanedBackupsCount === 0) {
      showToast('Ù„Ø§ ØªÙˆØ¬Ø¯ Ù†Ø³Ø® Ø§Ø­ØªÙŠØ§Ø·ÙŠØ© ÙŠØªÙŠÙ…Ø© Ù„ØªÙ†Ø¸ÙŠÙÙ‡Ø§ Ø­Ø§Ù„ÙŠØ§Ù‹ âœ…', 'info');
      return;
    }
    if (!window.confirm(`Ù‡Ù„ Ø£Ù†Øª Ù…ØªØ£ÙƒØ¯ Ù…Ù† Ø­Ø°Ù ${orphanedBackupsCount} Ù†Ø³Ø®Ø© Ø§Ø­ØªÙŠØ§Ø·ÙŠØ© ÙŠØªÙŠÙ…Ø© Ù…Ù† Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§ØªØŸ Ù„Ø§ ÙŠÙ…ÙƒÙ† Ø§Ù„ØªØ±Ø§Ø¬Ø¹ Ø¹Ù† Ù‡Ø°Ø§ Ø§Ù„Ø¥Ø¬Ø±Ø§Ø¡.`)) return;
    
    setLoading(true);
    try {
      // Ø§Ø³ØªØ¯Ø¹Ø§Ø¡ Ø§Ù„Ø¯Ø§Ù„Ø© Ø§Ù„Ø¬Ø¯ÙŠØ¯Ø© Ù…Ù† Ø·Ø±Ù Ø§Ù„Ø®Ø§Ø¯Ù… Ù„Ø³Ø±Ø¹Ø© Ø£ÙƒØ¨Ø±
      const { data, error } = await supabase.rpc('cleanup_orphaned_backups');
      if (error) throw error;
      showToast(`ØªÙ… ØªÙ†Ø¸ÙŠÙ ${data || 0} Ù†Ø³Ø®Ø© ÙŠØªÙŠÙ…Ø© Ø¨Ù†Ø¬Ø§Ø­ Ù…Ù† Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª âœ…`, 'success');

      setOrphanedBackupsCount(0);
      await loadData();
    } catch (error) {
      showToast('ÙØ´Ù„ Ø¹Ù…Ù„ÙŠØ© Ø§Ù„ØªÙ†Ø¸ÙŠÙ: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // --- Backup Management Functions ---
  useEffect(() => {
    if (currentUser) {
      if (currentUser.role === 'super_admin') {
        setSelectedBackupOrgId(orgs.length > 0 ? orgs[0].id : null);
      } else if (currentUser.organization_id) {
        setSelectedBackupOrgId(currentUser.organization_id);
      }
    }
  }, [orgs, currentUser]);

  useEffect(() => {
    if (selectedBackupOrgId && activeAdminTab === 'backups') {
      fetchBackups(selectedBackupOrgId);
    }
  }, [selectedBackupOrgId, activeAdminTab]);

  const fetchBackups = async (orgId: string) => {
    setLoadingBackups(true);
    try {
      const { data, error } = await supabase
        .from('organization_backups')
        .select('*, profiles(full_name)')
        .eq('organization_id', orgId)
        .order('backup_date', { ascending: false });
      if (error) throw error;
      setBackups(data || []);
    } catch (err) {
      showToast('ÙØ´Ù„ Ø¬Ù„Ø¨ Ø§Ù„Ù†Ø³Ø® Ø§Ù„Ø§Ø­ØªÙŠØ§Ø·ÙŠØ©', 'error');
    } finally {
      setLoadingBackups(false);
    }
  };

  const handleCreateBackup = async () => {
    if (!selectedBackupOrgId) return;
    if (!window.confirm(`Ù‡Ù„ ØªØ±ÙŠØ¯ Ø¥Ù†Ø´Ø§Ø¡ Ù†Ø³Ø®Ø© Ø§Ø­ØªÙŠØ§Ø·ÙŠØ© Ø¬Ø¯ÙŠØ¯Ø© Ù„Ù€ ${getOrgName(selectedBackupOrgId)}ØŸ`)) return;
    setCreatingBackup(true);
    try {
      const { error } = await supabase.rpc('create_organization_backup', { p_org_id: selectedBackupOrgId });
      if (error) throw error;
      showToast('ØªÙ… Ø¥Ù†Ø´Ø§Ø¡ Ù†Ø³Ø®Ø© Ø§Ø­ØªÙŠØ§Ø·ÙŠØ© Ø¨Ù†Ø¬Ø§Ø­ âœ…', 'success');
      fetchBackups(selectedBackupOrgId);
    } catch (err) {
      showToast('ÙØ´Ù„ Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ù†Ø³Ø®Ø© Ø§Ù„Ø§Ø­ØªÙŠØ§Ø·ÙŠØ©', 'error');
    } finally {
      setCreatingBackup(false);
    }
  };

  const [exportingS3, setExportingS3] = useState(false);
  const handleExportToS3 = async () => {
    if (!selectedBackupOrgId) return;
    setExportingS3(true);
    try {
      showToast('Ø¬Ø§Ø±ÙŠ Ø£Ø®Ø° Ù†Ø³Ø®Ø© Ø³Ø­Ø§Ø¨ÙŠØ© ÙˆØ±ÙØ¹Ù‡Ø§ Ø¥Ù„Ù‰ Ù…Ø³ØªÙˆØ¯Ø¹ S3 / R2 Ø§Ù„Ø®Ø§Ø±Ø¬ÙŠ...', 'info');
      const res = await offsiteBackupService.createAndExportOffsiteBackup(selectedBackupOrgId);
      if (res.success) {
        showToast((res.message || 'ØªÙ… Ø§Ù„Ø±ÙØ¹ Ø¥Ù„Ù‰ S3 Ø¨Ù†Ø¬Ø§Ø­') + ' âœ…', 'success');
        fetchBackups(selectedBackupOrgId);
      } else {
        showToast((res.message || 'ÙØ´Ù„ Ø§Ù„Ø±ÙØ¹ Ø¥Ù„Ù‰ S3') + (res.error ? ': ' + res.error : ''), 'error');
      }
    } catch (err) {
      showToast('Ø®Ø·Ø£ ÙÙŠ Ø§Ù„Ø±ÙØ¹ Ø§Ù„Ø®Ø§Ø±Ø¬ÙŠ: ' + err.message, 'error');
    } finally {
      setExportingS3(false);
    }
  };


  const handleDownloadBackup = (backup: OrganizationBackup) => {
    const blob = new Blob([JSON.stringify(backup.backup_data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_${getOrgName(backup.organization_id)}_${new Date(backup.backup_date).toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRestoreBackup = async (backup: OrganizationBackup) => {
    if (!window.confirm('âš ï¸ ØªØ­Ø°ÙŠØ±: Ø³ÙŠØªÙ… Ù…Ø³Ø­ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø­Ø§Ù„ÙŠØ© ÙˆØ§Ø³ØªØ¨Ø¯Ø§Ù„Ù‡Ø§ Ø¨Ø§Ù„Ù†Ø³Ø®Ø© Ø§Ù„Ø§Ø­ØªÙŠØ§Ø·ÙŠØ©. Ù‡Ù„ ØªØ±ÙŠØ¯ Ø§Ù„Ø§Ø³ØªÙ…Ø±Ø§Ø±ØŸ')) return;
    if (window.prompt('Ù„ØªØ£ÙƒÙŠØ¯ Ø§Ù„Ø§Ø³ØªØ¹Ø§Ø¯Ø© Ø§Ù„Ù†Ù‡Ø§Ø¦ÙŠØ©ØŒ ÙŠØ±Ø¬Ù‰ ÙƒØªØ§Ø¨Ø© "Ø§Ø³ØªØ¹Ø§Ø¯Ø©" ÙÙŠ Ø§Ù„Ù…Ø±Ø¨Ø¹ Ø£Ø¯Ù†Ø§Ù‡:') !== 'Ø§Ø³ØªØ¹Ø§Ø¯Ø©') return;
    setRestoringId(backup.id);
    try {
      const { data, error } = await supabase.rpc('restore_organization_backup', {
        p_org_id: backup.organization_id,
        p_backup_data: backup.backup_data
      });
      if (error) throw error;
      showToast(data || 'ØªÙ…Øª Ø§Ø³ØªØ¹Ø§Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø¨Ù†Ø¬Ø§Ø­ âœ…', 'success');
    } catch (err) {
      showToast('ÙØ´Ù„ Ø¹Ù…Ù„ÙŠØ© Ø§Ù„Ø§Ø³ØªØ¹Ø§Ø¯Ø©', 'error');
    } finally {
      setRestoringId(null);
    }
  };

  const handleExternalFileRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedBackupOrgId) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const backupData = JSON.parse(evt.target?.result as string);
        await handleRestoreBackup({ id: 'temp', organization_id: selectedBackupOrgId, backup_data: backupData } as any);
      } catch (err) {
        showToast('Ù…Ù„Ù ØºÙŠØ± ØµØ§Ù„Ø­', 'error');
      }
    };
    reader.readAsText(file);
  };

  const handleDeleteBackup = async (backupId: string) => {
    if (!window.confirm('Ù‡Ù„ Ø£Ù†Øª Ù…ØªØ£ÙƒØ¯ Ù…Ù† Ø­Ø°Ù Ù‡Ø°Ù‡ Ø§Ù„Ù†Ø³Ø®Ø© Ø§Ù„Ø§Ø­ØªÙŠØ§Ø·ÙŠØ©ØŸ Ù„Ø§ ÙŠÙ…ÙƒÙ† Ø§Ù„ØªØ±Ø§Ø¬Ø¹ Ø¹Ù† Ù‡Ø°Ø§ Ø§Ù„Ø¥Ø¬Ø±Ø§Ø¡.')) return;
    try {
      const { error } = await supabase
        .from('organization_backups')
        .delete()
        .eq('id', backupId);

      if (error) throw error;
      showToast('ØªÙ… Ø­Ø°Ù Ø§Ù„Ù†Ø³Ø®Ø© Ø§Ù„Ø§Ø­ØªÙŠØ§Ø·ÙŠØ© Ø¨Ù†Ø¬Ø§Ø­ âœ…', 'success');
      if (selectedBackupOrgId) fetchBackups(selectedBackupOrgId);
    } catch (err) {
      showToast('ÙØ´Ù„ Ø­Ø°Ù Ø§Ù„Ù†Ø³Ø®Ø© Ø§Ù„Ø§Ø­ØªÙŠØ§Ø·ÙŠØ©: ' + err.message, 'error');
      logger.error('Error deleting backup:', err);
    }
  };

  const getOrgName = (orgId: string) => {
    return orgs.find(org => org.id === orgId)?.name || 'Ù…Ù†Ø¸Ù…Ø© ØºÙŠØ± Ù…Ø¹Ø±ÙˆÙØ©';
  };
  // --- End Backup Management Functions ---

  const handleDeleteOrg = async () => {
    if (!deletingOrg) return;
    if (deleteConfirmName.trim() !== deletingOrg.name.trim()) {
      showToast('Ø§Ø³Ù… Ø§Ù„Ø´Ø±ÙƒØ© ØºÙŠØ± Ù…ØªØ·Ø§Ø¨Ù‚ Ù„Ù„ØªØ£ÙƒÙŠØ¯', 'error');
      return;
    }

    setLoading(true);
    try {
      // 1. Ø­Ø°Ù Ø§Ù„Ø´Ø¹Ø§Ø± Ù…Ù† Ù…Ø®Ø²Ù† Supabase Storage Ø¥Ø°Ø§ ÙˆØ¬Ø¯
      if (deletingOrg.logo_url) {
        try {
          // Ø§Ø³ØªØ®Ø±Ø§Ø¬ Ø§Ø³Ù… Ø§Ù„Ù…Ù„Ù Ù…Ù† Ø§Ù„Ø±Ø§Ø¨Ø· (Ø¢Ø®Ø± Ø¬Ø²Ø¡ ÙÙŠ Ø§Ù„Ù€ URL)
          const urlParts = deletingOrg.logo_url.split('/');
          const fileName = urlParts[urlParts.length - 1];
          
          if (fileName) {
            const { error: storageError } = await supabase.storage
              .from('logos')
              .remove([fileName]);
              
            if (storageError) logger.warn('Storage deletion warning:', storageError);
          }
        } catch (err) {
          logger.error('Failed to parse or delete logo from storage:', err);
        }
      }

      // 2. Ø­Ø°Ù ÙƒØ§ÙØ© Ø§Ù„Ù…Ø±ÙÙ‚Ø§Øª (Ù‚ÙŠÙˆØ¯ØŒ Ø³Ù†Ø¯Ø§ØªØŒ Ø´ÙŠÙƒØ§Øª) Ù…Ù† Ø§Ù„Ù€ Storage
      try {
        const [jAtt, rAtt, pAtt, cAtt] = await Promise.all([
          supabase.from('journal_attachments').select('file_path').eq('organization_id', deletingOrg.id),
          supabase.from('receipt_voucher_attachments').select('file_path').eq('organization_id', deletingOrg.id),
          supabase.from('payment_voucher_attachments').select('file_path').eq('organization_id', deletingOrg.id),
          supabase.from('cheque_attachments').select('file_path').eq('organization_id', deletingOrg.id)
        ]);

        const allPaths = [
          ...(jAtt.data?.map(a => a.file_path) || []),
          ...(rAtt.data?.map(a => a.file_path) || []),
          ...(pAtt.data?.map(a => a.file_path) || []),
          ...(cAtt.data?.map(a => a.file_path) || [])
        ];

        if (allPaths.length > 0) {
          const { error: attStorageError } = await supabase.storage
            .from('documents')
            .remove(allPaths);
          
          if (attStorageError) logger.warn('Attachments storage deletion warning:', attStorageError);
        }
      } catch (err) {
        logger.error('Failed to clean up attachments from storage:', err);
      }

      // 3. Ù…Ø­Ø§ÙˆÙ„Ø© Ø§Ù„Ø­Ø°Ù Ø¹Ø¨Ø± Ø§Ù„Ø¯Ø§Ù„Ø© Ø§Ù„Ø¢Ù…Ù†Ø© ÙÙŠ Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª
      const orgId = deletingOrg.id;
      let deleteResult = await supabase.rpc('fn_delete_organization_safe', { p_org_id: orgId });

      // Ø¥Ø°Ø§ Ø­Ø¯Ø« Ø®Ø·Ø£ (400 Ø£Ùˆ 409 Ø£Ùˆ 500) Ù†Ù‚ÙˆÙ… Ø¨Ø§Ù„ØªØ¯Ø®Ù„ Ù„ØªÙÙƒÙŠÙƒ Ø§Ù„Ù‚ÙŠÙˆØ¯ Ø§Ù„Ù…Ø±Ø¬Ø¹ÙŠØ© ÙÙˆØ±ÙŠØ§Ù‹
      if (deleteResult.error) {
        logger.warn('RPC delete failed, executing client-side cascade cleanup...', deleteResult.error);

        try {
          // Ø£. ÙÙƒ Ø§Ø±ØªØ¨Ø§Ø· ÙƒØ§ÙØ© Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù…ÙŠÙ† Ø¨Ø§Ù„Ø´Ø±ÙƒØ©
          await supabase.from('profiles').update({ organization_id: null }).eq('organization_id', orgId);

          // Ø¨. Ø­Ø°Ù ØµÙ„Ø§Ø­ÙŠØ§Øª ÙˆØ£Ø¯ÙˆØ§Ø± Ø§Ù„Ø´Ø±ÙƒØ©
          await supabase.from('role_permissions').delete().eq('organization_id', orgId);
          await supabase.from('roles').delete().eq('organization_id', orgId);

          // Ø§Ø³ØªØ®Ø±Ø§Ø¬ Ù…Ø¹Ø±ÙØ§Øª Ø§Ù„Ø£ØµÙ†Ø§Ù Ø§Ù„ØªØ§Ø¨Ø¹Ø© Ù„Ù„Ù…Ù†Ø¸Ù…Ø© Ù„ÙÙƒ Ø£ÙŠ Ù‚ÙŠÙˆØ¯ Ù…Ø¹Ù„Ù‚Ø© Ø¹Ù„ÙŠÙ‡Ø§
          const { data: orgProducts } = await supabase.from('products').select('id').eq('organization_id', orgId);
          const prodIds = (orgProducts || []).map((p: Record<string, any>) => p.id).filter(Boolean);

          // Ø¬.1 ØªÙÙƒÙŠÙƒ Ù…ÙˆØ¯ÙŠÙˆÙ„ Ø§Ù„ØªØ´ÙÙŠØ© ÙˆØ§Ù„Ø°Ø¨Ø§Ø¦Ø­ (Butchering Module)
          try {
            if (prodIds.length > 0) {
              await supabase.from('butchering_order_items').delete().in('output_product_id', prodIds);
              await supabase.from('butchering_template_items').delete().in('output_product_id', prodIds);
              await supabase.from('butchering_orders').delete().in('source_product_id', prodIds);
              await supabase.from('butchering_templates').delete().in('source_product_id', prodIds);
            }
            await supabase.from('butchering_orders').delete().eq('organization_id', orgId);
            await supabase.from('butchering_templates').delete().eq('organization_id', orgId);
          } catch (_) {}

          // Ø¬.2 ØªÙÙƒÙŠÙƒ Ù…ÙˆØ¯ÙŠÙˆÙ„ Ø§Ù„ØªØµÙ†ÙŠØ¹ (Manufacturing Module)
          try {
            if (prodIds.length > 0) {
              await supabase.from('mfg_actual_material_usage').delete().in('raw_material_id', prodIds);
              await supabase.from('mfg_scrap_logs').delete().in('product_id', prodIds);
              await supabase.from('mfg_batch_serials').delete().in('product_id', prodIds);
              await supabase.from('mfg_step_materials').delete().in('raw_material_id', prodIds);
              await supabase.from('bill_of_materials').delete().in('product_id', prodIds);
              await supabase.from('bill_of_materials').delete().in('raw_material_id', prodIds);
              await supabase.from('mfg_production_orders').delete().in('product_id', prodIds);
              await supabase.from('mfg_routings').delete().in('product_id', prodIds);
            }
          } catch (_) {}

          // Ø¬.3 ØªÙÙƒÙŠÙƒ Ù‚ÙŠÙˆØ¯ Ø§Ù„Ù…Ø·Ø§Ø¹Ù… ÙˆÙ†Ù‚Ø§Ø· Ø§Ù„Ø¨ÙŠØ¹ (Restaurant & Channel Pricing)
          try {
            if (prodIds.length > 0) {
              await supabase.from('kitchen_ticket_items').delete().in('product_id', prodIds);
              await supabase.from('product_channel_prices').delete().in('product_id', prodIds);
              await supabase.from('recipe_items').delete().in('product_id', prodIds);
              await supabase.from('recipe_items').delete().in('ingredient_id', prodIds);
              await supabase.from('combo_items').delete().in('product_id', prodIds);
              await supabase.from('combo_items').delete().in('included_product_id', prodIds);
            }
          } catch (_) {}

          // Ø¬.4 Ø­Ø°Ù ØªÙØ§ØµÙŠÙ„ Ø§Ù„Ø­Ø±ÙƒØ§Øª ÙˆØ§Ù„Ø¨Ù†ÙˆØ¯ Ø§Ù„Ù…Ø¹Ù„Ù‚Ø©
          const detailTables = [
            'butchering_order_items', 'butchering_orders', 'butchering_template_items', 'butchering_templates',
            'mfg_actual_material_usage', 'mfg_scrap_logs', 'mfg_batch_serials', 'mfg_production_variances',
            'mfg_order_progress', 'mfg_step_materials', 'mfg_step_attachments', 'mfg_routing_steps',
            'mfg_production_order_materials', 'mfg_production_order_steps',
            'mfg_scrap_records', 'mfg_qc_inspections', 'mfg_production_orders', 'mfg_routings', 'mfg_work_centers',
            'order_item_modifiers', 'order_items', 'kitchen_ticket_items', 'kitchen_orders', 'orders',
            'product_channel_prices', 'recipe_items', 'restaurant_recipes', 'combo_items',
            'invoice_items', 'purchase_invoice_items', 'sales_return_items', 'purchase_return_items',
            'stock_adjustment_items', 'journal_lines', 'payroll_variables', 'payroll_items',
            'delivery_order_items', 'inventory_count_items', 'waste_records', 'transfer_items'
          ];
          for (const tbl of detailTables) {
            try { await (supabase.from(tbl as any) as any).delete().eq('organization_id', orgId); } catch (_) {}
          }

          // Ø¯. Ø­Ø°Ù Ø±Ø¤ÙˆØ³ Ø§Ù„Ø­Ø±ÙƒØ§Øª ÙˆØ§Ù„Ù…Ø³ØªÙ†Ø¯Ø§Øª
          const headerTables = [
            'invoices', 'purchase_invoices', 'sales_returns', 'purchase_returns', 'journal_entries',
            'payments', 'receipt_vouchers', 'payment_vouchers', 'cheques', 'payrolls', 'stock_adjustments',
            'stock_transfers', 'inventory_counts', 'delivery_orders',
            'work_orders', 'bill_of_materials', 'credit_notes', 'debit_notes', 'shifts', 'table_sessions',
            'cashier_shifts', 'pos_petty_cash_payouts', 'waiter_call_requests', 'tips_distribution_records',
            'restaurant_tables', 'modifiers', 'modifier_groups',
            'promotions', 'retail_promotions', 'stadium_bookings', 'stadium_subscriptions', 'construction_projects'
          ];
          for (const tbl of headerTables) {
            try { await (supabase.from(tbl as any) as any).delete().eq('organization_id', orgId); } catch (_) {}
          }

          // Ù‡Ù€. Ø­Ø°Ù Ø§Ù„Ø³Ø¬Ù„Ø§Øª Ø§Ù„ØªØ£Ø³ÙŠØ³ÙŠØ©
          const masterTables = [
            'products', 'customers', 'suppliers', 'accounts', 'warehouses', 'cost_centers', 'assets',
            'employees', 'company_settings', 'invitations', 'budgets', 'notification_preferences', 'security_logs', 'audit_logs'
          ];
          for (const tbl of masterTables) {
            try { await (supabase.from(tbl as any) as any).delete().eq('organization_id', orgId); } catch (_) {}
          }

          // Ùˆ. Ø¥Ø¹Ø§Ø¯Ø© Ù…Ø­Ø§ÙˆÙ„Ø© Ø§Ø³ØªØ¯Ø¹Ø§Ø¡ Ø§Ù„Ø¯Ø§Ù„Ø© Ø§Ù„Ø¢Ù…Ù†Ø© Ø¨Ø¹Ø¯ ØªÙÙƒÙŠÙƒ Ø§Ù„Ù‚ÙŠÙˆØ¯
          deleteResult = await supabase.rpc('fn_delete_organization_safe', { p_org_id: orgId });

          // Ø². ÙÙŠ Ø­Ø§Ù„ Ø¨Ù‚Ø§Ø¡ Ø£ÙŠ Ø¹Ø§Ø¦Ù‚ Ø¨Ø§Ù„Ø¯Ø§Ù„Ø©ØŒ ÙŠØªÙ… Ù…Ø³Ø­ Ø³Ø¬Ù„ Ø§Ù„Ù…Ù†Ø¸Ù…Ø© Ù…Ø¨Ø§Ø´Ø±Ø© Ù…Ù† Ø¬Ø¯ÙˆÙ„ organizations
          if (deleteResult.error) {
            const directDelete = await supabase.from('organizations').delete().eq('id', orgId);
            if (directDelete.error) {
              throw new Error(deleteResult.error.message || directDelete.error.message);
            }
          }
        } catch (cleanupErr) {
          throw new Error(deleteResult.error?.message || cleanupErr.message);
        }
      }

      showToast(`ØªÙ… Ø­Ø°Ù Ø§Ù„Ø´Ø±ÙƒØ© ${deletingOrg.name} Ø¨Ù†Ø¬Ø§Ø­ âœ…`, 'success');
      await loadData();
      setIsDeleteModalOpen(false);
      setDeletingOrg(null);
      setDeleteConfirmName('');
    } catch (error) {
      showToast('ÙØ´Ù„ Ø­Ø°Ù Ø§Ù„Ø´Ø±ÙƒØ©: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleScanOrphanedFiles = async () => {
    setLoading(true);
    try {
      const [jRes, rRes, pRes, cRes, orgRes] = await Promise.all([
        supabase.from('journal_attachments').select('file_path'),
        supabase.from('receipt_voucher_attachments').select('file_path'),
        supabase.from('payment_voucher_attachments').select('file_path'),
        supabase.from('cheque_attachments').select('file_path'),
        supabase.from('organizations').select('logo_url')
      ]);

      const dbPaths = new Set([
        ...(jRes.data?.map(a => a.file_path) || []),
        ...(rRes.data?.map(a => a.file_path) || []),
        ...(pRes.data?.map(a => a.file_path) || []),
        ...(cRes.data?.map(a => a.file_path) || []),
        ...(orgRes.data?.map(o => o.logo_url?.split('/').pop()).filter(Boolean) || [])
      ]);

      const { data: docFiles } = await supabase.storage.from('documents').list();
      const orphanedDocs = docFiles?.filter(f => f.name !== '.emptyKeep' && !dbPaths.has(f.name)).map(f => `documents/${f.name}`) || [];

      setOrphanedFiles(orphanedDocs);
      setIsOrphanedModalOpen(true);
      showToast(`ØªÙ… Ø§ÙƒØªØ´Ø§Ù ${orphanedDocs.length} Ù…Ù„Ù ÙŠØªÙŠÙ…`, 'info');
    } catch (err) {
      showToast('ÙØ´Ù„ Ø§Ù„ÙØ­Øµ: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteOrphanedFile = async (path: string) => {
    setLoading(true);
    try {
      if (path === 'all') {
        for (const file of orphanedFiles) {
          const [bucket, name] = file.split('/');
          await supabase.storage.from(bucket).remove([name]);
        }
        setOrphanedFiles([]);
        setIsOrphanedModalOpen(false);
        showToast('ØªÙ… ØªÙ†Ø¸ÙŠÙ ÙƒØ§ÙØ© Ø§Ù„Ù…Ù„ÙØ§Øª Ø§Ù„ÙŠØªÙŠÙ…Ø© âœ…', 'success');
      } else {
        const [bucket, name] = path.split('/');
        await supabase.storage.from(bucket).remove([name]);
        setOrphanedFiles(prev => prev.filter(f => f !== path));
        showToast('ØªÙ… Ø­Ø°Ù Ø§Ù„Ù…Ù„Ù Ø¨Ù†Ø¬Ø§Ø­', 'success');
      }
    } catch (err) { showToast('ÙØ´Ù„ Ø§Ù„Ø­Ø°Ù: ' + err.message, 'error'); } finally { setLoading(false); }
  };

  const handleImpersonate = async (orgId: string, orgName: string) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) throw new Error('Ù„Ù… ÙŠØªÙ… Ø§Ù„Ø¹Ø«ÙˆØ± Ø¹Ù„Ù‰ Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù…');

      // Ø­ÙØ¸ Ù…Ø¹Ø±Ù Ø§Ù„Ù…Ù†Ø¸Ù…Ø© Ø§Ù„Ø£ØµÙ„ÙŠ (Ø¨ÙŠØ¦Ø© Ø§Ù„Ù…Ø¯ÙŠØ±) Ù‚Ø¨Ù„ Ø§Ù„ØªØ¨Ø¯ÙŠÙ„ Ù„Ù„ØªÙ…ÙƒÙ† Ù…Ù† Ø§Ù„Ø¹ÙˆØ¯Ø© Ù„Ø§Ø­Ù‚Ø§Ù‹
      const currentOrgId = user.user_metadata?.org_id || 'main';
      if (!secureStorage.getItem('admin_original_org_id')) {
        secureStorage.setItem('admin_original_org_id', currentOrgId);
      }

      // 1. ØªØ­Ø¯ÙŠØ« Ø§Ù„Ø¨Ø±ÙˆÙØ§ÙŠÙ„ ÙÙŠ Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ organization_id: orgId })
        .eq('id', user.id);

      if (profileError) throw profileError;

      // 2. ØªØ­Ø¯ÙŠØ« Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù€ Metadata ÙÙŠ Ù†Ø¸Ø§Ù… Auth Ù„Ø¶Ù…Ø§Ù† ØªØ­Ø¯ÙŠØ« Ø§Ù„Ù€ Token (JWT)
      const { error: authError } = await supabase.auth.updateUser({
        data: { ...user.user_metadata, org_id: orgId }
      });

      if (authError) throw authError;

      showToast(`ØªÙ… Ø§Ù„Ø§Ù†ØªÙ‚Ø§Ù„ Ù„Ø¨ÙŠØ¦Ø© Ø¹Ù…Ù„: ${orgName} Ø¨Ù†Ø¬Ø§Ø­. Ø¬Ø§Ø±ÙŠ ØªØ­Ø¯ÙŠØ« Ø§Ù„Ù†Ø¸Ø§Ù…...`, 'success');
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      showToast('ÙØ´Ù„ ÙÙŠ Ø¹Ù…Ù„ÙŠØ© Ø§Ù„Ù…Ø­Ø§ÙƒØ§Ø©: ' + error.message, 'error');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleFixSchema = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('refresh_saas_schema');
      if (error) throw error;
      showToast(data || 'ØªÙ… Ø¥ØµÙ„Ø§Ø­ ÙˆØªØ­Ø¯ÙŠØ« Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø¨Ù†Ø¬Ø§Ø­ âœ…', 'success');
      // Ø¥Ø¹Ø§Ø¯Ø© ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø¨Ø¹Ø¯ Ø§Ù„Ø¥ØµÙ„Ø§Ø­
      await loadData();
    } catch (error) {
      if (error.code === 'PGRST202') {
        showToast('Ø§Ù„Ù†Ø¸Ø§Ù… ÙŠØ­ØªØ§Ø¬ ØªÙ†Ø´ÙŠØ· ÙŠØ¯ÙˆÙŠ Ø£ÙˆÙ„ Ù…Ø±Ø©: ÙŠØ±Ø¬Ù‰ ØªØ´ØºÙŠÙ„ "NOTIFY pgrst, \'reload config\';" ÙÙŠ Supabase SQL Editor', 'warning');
      } else {
        showToast('ÙØ´Ù„ Ø§Ù„Ø¥ØµÙ„Ø§Ø­ Ø§Ù„ØªÙ„Ù‚Ø§Ø¦ÙŠ: ' + error.message, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleExportToExcel = () => {
    try {
      const exportData = filteredOrgs.map(org => {
        const isExpired = org.subscription_expiry && new Date(org.subscription_expiry) < new Date();
        const statusText = org.is_active && !isExpired ? 'Ù†Ø´Ø·' : (isExpired ? 'Ù…Ù†ØªÙ‡ÙŠ' : 'Ù…ØªÙˆÙ‚Ù');
        
        return {
          'Ø§Ø³Ù… Ø§Ù„Ø´Ø±ÙƒØ©': org.name,
          'Ø§Ù„Ø­Ø§Ù„Ø©': statusText,
          'Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª': org.total_sales || 0,
          'Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ù…Ø­ØµÙ„': org.total_collected || 0,
          'Ù…ÙˆØ¹Ø¯ Ø§Ù„Ø¯ÙØ¹ Ø§Ù„Ù‚Ø§Ø¯Ù…': org.next_payment_date || 'ØºÙŠØ± Ù…Ø­Ø¯Ø¯',
          'ØªØ§Ø±ÙŠØ® Ø§Ù†ØªÙ‡Ø§Ø¡ Ø§Ù„Ø§Ø´ØªØ±Ø§Ùƒ': org.subscription_expiry ? new Date(org.subscription_expiry).toLocaleDateString('ar-EG') : 'Ø¨Ø¯ÙˆÙ† ØªØ§Ø±ÙŠØ®',
          'Ø§Ù„Ù…ÙˆØ¯ÙŠÙˆÙ„Ø§Øª Ø§Ù„Ù…Ø³Ù…ÙˆØ­Ø©': (org.allowed_modules || []).join(', '),
          'Ø§Ù„Ø­Ø¯ Ø§Ù„Ø£Ù‚ØµÙ‰ Ù„Ù„Ù…Ø³ØªØ®Ø¯Ù…ÙŠÙ†': org.max_users,
          'ØªØ§Ø±ÙŠØ® Ø§Ù„ØªØ£Ø³ÙŠØ³': new Date(org.created_at).toLocaleDateString('ar-EG')
        };
      });

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Ø§Ù„Ø´Ø±ÙƒØ§Øª Ø§Ù„Ù…Ø´ØªØ±ÙƒØ©");
      
      XLSX.writeFile(wb, `TriPro_Organizations_${new Date().toISOString().split('T')[0]}.xlsx`);
      showToast('ØªÙ… ØªØµØ¯ÙŠØ± Ù…Ù„Ù Excel Ø¨Ù†Ø¬Ø§Ø­ âœ…', 'success');
    } catch (error) {
      showToast('ÙØ´Ù„ ØªØµØ¯ÙŠØ± Ø§Ù„Ù…Ù„Ù: ' + error.message, 'error');
    }
  };

  // ðŸ›¡ï¸ Ø­Ù…Ø§ÙŠØ© Ø§Ù„ØµÙØ­Ø©: Ø§Ù„ØªØ£ÙƒØ¯ Ù…Ù† Ø£Ù† Ø§Ù„ÙŠÙˆØ²Ø± Ù‡Ùˆ super_admin ÙÙ‚Ø·
  if (!isLoading && currentUser?.role !== 'super_admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-red-600 bg-red-50 rounded-3xl border border-red-100 p-8">
        <Lock size={48} className="mb-4" />
        <h2 className="text-2xl font-bold">ÙˆØµÙˆÙ„ ØºÙŠØ± Ù…ØµØ±Ø­ Ø¨Ù‡</h2>
        <p className="text-slate-600">Ù‡Ø°Ù‡ Ø§Ù„ØµÙØ­Ø© Ù…Ø®ØµØµØ© Ù„Ù…Ø¯ÙŠØ± Ø§Ù„Ù…Ù†ØµØ© Ø§Ù„Ø¹Ø§Ù„Ù…ÙŠ ÙÙ‚Ø·.</p>
      </div>
    );
  }

  const filteredOrgs = useMemo(() => {
    return orgs.filter(org => {
      const matchesSearch = org.name.toLowerCase().includes(searchTerm.toLowerCase());
      const isExpired = org.subscription_expiry && new Date(org.subscription_expiry) < new Date();
      const isActive = org.is_active && !isExpired;
      const matchesActivityType = activityTypeFilter === 'all' || org.activity_type === activityTypeFilter; // ðŸ‘ˆ Ù…Ù†Ø·Ù‚ ÙÙ„ØªØ±Ø© Ø¬Ø¯ÙŠØ¯

      if (filterStatus === 'all') return matchesSearch && matchesActivityType;
      if (filterStatus === 'active') return matchesSearch && isActive && matchesActivityType;
      if (filterStatus === 'inactive') return matchesSearch && !isActive && matchesActivityType;
      
      return matchesSearch && matchesActivityType;
    });
  }, [orgs, searchTerm, filterStatus, activityTypeFilter]); // ðŸ‘ˆ Ø¥Ø¶Ø§ÙØ© activityTypeFilter Ù„Ù„ØªØ¨Ø¹ÙŠØ§Øª

  if (loading && !stats) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Loader2 className="animate-spin text-blue-600" size={40} />
        <p className="text-slate-500 font-medium">Ø¬Ø§Ø±ÙŠ Ø¬Ù„Ø¨ Ø¥Ø­ØµØ§Ø¦ÙŠØ§Øª Ø§Ù„Ù…Ù†ØµØ©...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800">Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ù…Ù†ØµØ© (SaaS)</h1>
          <p className="text-slate-500 mt-1 font-medium">Ù†Ø¸Ø±Ø© Ø¹Ø§Ù…Ø© Ø¹Ù„Ù‰ Ø£Ø¯Ø§Ø¡ ÙƒØ§ÙØ© Ø§Ù„Ø´Ø±ÙƒØ§Øª Ø§Ù„Ù…Ø´ØªØ±ÙƒØ©</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleCleanupOrphanedBackups}
            className="flex items-center gap-2 bg-rose-50 border border-rose-100 px-4 py-2 rounded-xl text-rose-600 font-bold hover:bg-rose-100 transition-colors shadow-sm"
            title="Ø­Ø°Ù Ø³Ø¬Ù„Ø§Øª Ø§Ù„Ù†Ø³Ø® Ø§Ù„Ø§Ø­ØªÙŠØ§Ø·ÙŠØ© Ø§Ù„ØªÙŠ Ù„Ø§ ØªÙ…Ù„Ùƒ Ø´Ø±ÙƒØ© (Database Cleanup)"
          >
            <Trash2 size={18} />
            ØªÙ†Ø¸ÙŠÙ Ø§Ù„Ù…Ø±ÙÙ‚Ø§Øª Ø§Ù„ÙŠØªÙŠÙ…Ø©
          </button>
          <button 
            onClick={handleScanOrphanedFiles}
            className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl text-slate-600 font-bold hover:bg-slate-100 transition-colors shadow-sm"
            title="ÙØ­Øµ Ù…Ù„ÙØ§Øª Ø§Ù„Ù€ Storage Ø§Ù„ØªÙŠ Ù„Ø§ ØªÙ…Ù„Ùƒ Ø³Ø¬Ù„Ø§Øª (File Storage Cleanup)"
          >
            <DatabaseIcon size={18} />
            ÙØ­Øµ Ù…Ù„ÙØ§Øª Ø§Ù„ØªØ®Ø²ÙŠÙ†
          </button>
          <button 
            onClick={handleFixSchema}
            className="flex items-center gap-2 bg-amber-50 border border-amber-100 px-4 py-2 rounded-xl text-amber-600 font-bold hover:bg-amber-100 transition-colors shadow-sm"
            title="Ø¥ØµÙ„Ø§Ø­ Ù…Ø´Ø§ÙƒÙ„ Ù…Ø²Ø§Ù…Ù†Ø© Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª (Schema Cache)"
          >
            <Wrench size={18} />
            Ø¥ØµÙ„Ø§Ø­ Ø§Ù„Ù†Ø¸Ø§Ù…
          </button>
          <button 
            onClick={handleExportToExcel}
            className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 px-4 py-2 rounded-xl text-emerald-600 font-bold hover:bg-emerald-100 transition-colors shadow-sm"
            title="ØªØµØ¯ÙŠØ± Ø§Ù„Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ù…ÙÙ„ØªØ±Ø© Ø¥Ù„Ù‰ Excel"
          >
            <FileSpreadsheet size={18} />
            ØªØµØ¯ÙŠØ± Excel
          </button>
          <button 
            onClick={loadData}
            className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-xl text-slate-600 font-bold hover:bg-slate-50 transition-colors shadow-sm"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            ØªØ­Ø¯ÙŠØ« Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <StatCard 
          title="Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ù…Ø¨ÙŠØ¹Ø§Øª Ø§Ù„Ù…Ù†ØµØ©" 
          value={stats?.total_platform_sales || 0} 
          icon={DollarSign} 
          color="bg-blue-600 text-blue-600"
          suffix="Ø¬.Ù…"
        />
        <StatCard 
          title="Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø´Ø±ÙƒØ§Øª" 
          value={stats?.total_organizations || 0} 
          icon={Building2} 
          color="bg-purple-600 text-purple-600"
          growth={stats?.growth_this_month_percent}
        />
        <StatCard 
          title="Ø§Ù„Ø§Ø´ØªØ±Ø§ÙƒØ§Øª Ø§Ù„Ù†Ø´Ø·Ø©" 
          value={stats?.active_subscriptions || 0} 
          icon={CheckCircle} 
          color="bg-emerald-600 text-emerald-600"
        />
        <StatCard 
          title="Ø´Ø±ÙƒØ§Øª Ø¬Ø¯ÙŠØ¯Ø© (Ø§Ù„ÙŠÙˆÙ…)" 
          value={stats?.new_registrations_today || 0} 
          icon={UserPlus} 
          color="bg-orange-600 text-orange-600"
        />
        <StatCard 
          title="Ù…Ø¹Ø¯Ù„ Ø§Ù„Ù†Ù…Ùˆ Ø§Ù„Ø´Ù‡Ø±ÙŠ" 
          value={`${stats?.growth_this_month_percent || 0}%`} 
          icon={TrendingUp} 
          color="bg-indigo-600 text-indigo-600"
        />
      </div>

      {/* Tabs Navigation */}
      <div className="flex gap-4 border-b border-slate-200">
        <button 
          onClick={() => setActiveAdminTab('organizations')}
          className={`pb-3 px-5 font-black text-sm transition-all flex items-center gap-2 ${activeAdminTab === 'organizations' ? 'border-b-4 border-blue-600 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <Building2 size={18} />
          Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ù…Ù†Ø¸Ù…Ø§Øª ÙˆØ§Ù„Ø§Ø´ØªØ±Ø§ÙƒØ§Øª
        </button>
        <button 
          onClick={() => setActiveAdminTab('backups')}
          className={`pb-3 px-5 font-black text-sm transition-all flex items-center gap-2 ${activeAdminTab === 'backups' ? 'border-b-4 border-blue-600 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <DatabaseIcon size={18} />
          Ø§Ù„Ù†Ø³Ø® Ø§Ù„Ø§Ø­ØªÙŠØ§Ø·ÙŠ ÙˆØ§Ù„Ø§Ø³ØªØ¹Ø§Ø¯Ø© Ø§Ù„Ø³Ø­Ø§Ø¨ÙŠØ©
        </button>
      </div>

      {/* Main Content Area (Organizations Management) */}
      {activeAdminTab === 'organizations' && (
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-800">Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ø´Ø±ÙƒØ§Øª ÙˆØ§Ù„Ø§Ø´ØªØ±Ø§ÙƒØ§Øª</h2>
          <div className="flex gap-2">
            <button 
              onClick={() => { setCloningSourceOrg(null); setIsCloneModalOpen(true); }}
              className="bg-purple-50 text-purple-700 border border-purple-200 px-4 py-2.5 rounded-xl font-bold hover:bg-purple-100 transition-all flex items-center gap-2 shadow-sm"
              title="Ø§Ø³ØªÙ†Ø³Ø§Ø® Ø´Ø¬Ø±Ø© Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª ÙˆØ§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø¨ÙŠÙ† Ø´Ø±ÙƒØªÙŠÙ†"
            >
              <GitFork size={18} />
              Ø§Ø³ØªÙ†Ø³Ø§Ø® Ù‚Ø§Ù„Ø¨ Ø´Ø±ÙƒØ©
            </button>
            <button 
              onClick={() => setIsAddModalOpen(true)}
              className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 flex items-center gap-2"
            >
              <UserPlus size={18} />
              Ø¥Ø¶Ø§ÙØ© Ø´Ø±ÙƒØ© Ø¬Ø¯ÙŠØ¯Ø©
            </button>
          </div>
        </div>
        {/* Search and Filter */}
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
                <Search className="absolute right-3 top-2.5 text-slate-400" size={20} />
                <input 
                    type="text" 
                    placeholder="Ø¨Ø­Ø« Ø¨Ø§Ø³Ù… Ø§Ù„Ø´Ø±ÙƒØ©..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pr-10 pl-4 py-2 rounded-xl border border-slate-300 focus:outline-none focus:border-blue-500"
                />
            </div>
            <div className="relative">
                <Filter className="absolute right-3 top-2.5 text-slate-400 pointer-events-none" size={20} />
                <select 
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value as 'all' | 'active' | 'inactive')}
                    className="appearance-none pr-10 pl-4 py-2 rounded-xl border border-slate-300 focus:outline-none focus:border-blue-500 bg-white text-slate-700 font-medium"
                >
                    <option value="all">ÙƒÙ„ Ø§Ù„Ø­Ø§Ù„Ø§Øª</option>
                    <option value="active">Ù†Ø´Ø·</option>
                    <option value="inactive">Ù…ØªÙˆÙ‚Ù / Ù…Ù†ØªÙ‡ÙŠ</option>
                </select>
            </div>
            {/* ðŸ‘ˆ ÙÙ„ØªØ± Ù†ÙˆØ¹ Ø§Ù„Ù†Ø´Ø§Ø· Ø§Ù„Ø¬Ø¯ÙŠØ¯ */}
            <div className="relative">
                <Filter className="absolute right-3 top-2.5 text-slate-400 pointer-events-none" size={20} />
                <select 
                    value={activityTypeFilter}
                    onChange={(e) => setActivityTypeFilter(e.target.value)}
                    className="appearance-none pr-10 pl-4 py-2 rounded-xl border border-slate-300 focus:outline-none focus:border-blue-500 bg-white text-slate-700 font-medium"
                >
                    <option value="all">ÙƒÙ„ Ø§Ù„Ø£Ù†Ø´Ø·Ø©</option>
                    <option value="commercial">ØªØ¬Ø§Ø±ÙŠ</option>
                    <option value="restaurant">Ù…Ø·Ø§Ø¹Ù…</option>
                    <option value="construction">Ù…Ù‚Ø§ÙˆÙ„Ø§Øª</option>
                    <option value="manufacturing">Ù…ØµØ§Ù†Ø¹/ØªØµÙ†ÙŠØ¹</option>
                    <option value="clinic">Ø¹ÙŠØ§Ø¯Ø§Øª</option>
                    <option value="legal">Ù‚Ø§Ù†ÙˆÙ†ÙŠ</option>
                    <option value="transport">Ù†Ù‚Ù„</option>
                    <option value="charity">Ø®ÙŠØ±ÙŠ</option>
                <option value="hospital">ðŸ¥ Ø§Ù„Ù…Ø³ØªØ´ÙÙŠØ§Øª ÙˆØ§Ù„Ù…Ø±Ø§ÙƒØ² Ø§Ù„Ø·Ø¨ÙŠØ©</option>
                </select>
            </div>
        </div>
        
        {loadingOrgs ? (
          <div className="p-20 text-center">
            <Loader2 className="animate-spin text-blue-600 mx-auto mb-4" size={32} />
            <p className="text-slate-500 font-medium">Ø¬Ø§Ø±ÙŠ ØªØ­Ù…ÙŠÙ„ Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø´Ø±ÙƒØ§Øª...</p>
          </div>
        ) : filteredOrgs.length === 0 ? (
            <div className="p-20 text-center text-slate-500">
                <Building2 size={48} className="mx-auto mb-4 text-slate-300" />
                <p className="text-lg font-medium">Ù„Ø§ ØªÙˆØ¬Ø¯ Ø´Ø±ÙƒØ§Øª Ù…Ø·Ø§Ø¨Ù‚Ø©</p>
                <p className="text-sm">Ù„Ù… ÙŠØªÙ… Ø§Ù„Ø¹Ø«ÙˆØ± Ø¹Ù„Ù‰ Ø£ÙŠ Ø´Ø±ÙƒØ© ØªØ·Ø§Ø¨Ù‚ Ù…Ø¹Ø§ÙŠÙŠØ± Ø§Ù„Ø¨Ø­Ø« Ø£Ùˆ Ø§Ù„ÙÙ„ØªØ±Ø©.</p>
            </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead className="bg-slate-50 text-slate-500 text-sm font-bold uppercase tracking-wider">
                <tr>
                  <th className="p-4 border-b border-slate-100">Ø§Ø³Ù… Ø§Ù„Ø´Ø±ÙƒØ©</th>
                  <th className="p-4 border-b border-slate-100">Ø§Ù„Ø­Ø§Ù„Ø©</th>
                  <th className="p-4 border-b border-slate-100">Ø§Ù„Ø¨Ø§Ù‚Ø©</th>
                  <th className="p-4 border-b border-slate-100">Ù†ÙˆØ¹ Ø§Ù„Ù†Ø´Ø§Ø·</th>
                  <th className="p-4 border-b border-slate-100">Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª</th>
                  <th className="p-4 border-b border-slate-100">Ø£ÙŠØ§Ù… Ø§Ù„ØªØ­ØµÙŠÙ„</th>
                  <th className="p-4 border-b border-slate-100">ØªØ§Ø±ÙŠØ® Ø§Ù„Ø§Ù†ØªÙ‡Ø§Ø¡</th>
                  <th className="p-4 border-b border-slate-100">Ø§Ù„Ù…ÙˆØ¯ÙŠÙˆÙ„Ø§Øª</th>
                  <th className="p-4 border-b border-slate-100 text-center">Ø§Ù„Ø¥Ø¬Ø±Ø§Ø¡Ø§Øª</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50"> 
                {filteredOrgs.map((org) => {
                  const isExpired = org.subscription_expiry && new Date(org.subscription_expiry) < new Date();
                  const isActive = org.is_active && !isExpired;
                  const isOverLimit = org.user_count && org.user_count >= org.max_users;
                  
                  const activityLabels: Record<string, string> = {
                    'commercial': 'ØªØ¬Ø§Ø±ÙŠ',
                    'restaurant': 'Ù…Ø·Ø§Ø¹Ù…',
                    'construction': 'Ù…Ù‚Ø§ÙˆÙ„Ø§Øª',
                    'manufacturing': 'Ù…ØµØ§Ù†Ø¹/ØªØµÙ†ÙŠØ¹',
                    'clinic': 'Ø¹ÙŠØ§Ø¯Ø§Øª',
                    'legal': 'Ù‚Ø§Ù†ÙˆÙ†ÙŠ',
                    'transport': 'Ù†Ù‚Ù„',
                    'charity': 'Ø®ÙŠØ±ÙŠ',
                    'hospital': 'Ù…Ø³ØªØ´ÙÙŠØ§Øª'
                  };

                  // Ø­Ø³Ø§Ø¨ Ø§Ù„Ø£ÙŠØ§Ù… Ø§Ù„Ù…ØªØ¨Ù‚ÙŠØ© Ù„Ù…ÙˆØ¹Ø¯ Ø§Ù„Ø¯ÙØ¹ Ø§Ù„Ù‚Ø§Ø¯Ù…
                  const targetDate = org.next_payment_date ? new Date(org.next_payment_date) : null;
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  if (targetDate) targetDate.setHours(0, 0, 0, 0);
                  const diffDays = targetDate ? Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;

                  return (
                    <tr key={org.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="p-4">
                        <div className="font-bold text-slate-700">{org.name}</div>
                        <div className={`text-[10px] font-black flex items-center gap-1 mt-1 ${isOverLimit ? 'text-rose-500' : 'text-slate-400'}`}>
                          <Users size={10} />
                          {org.user_count} / {org.max_users} Ù…Ø³ØªØ®Ø¯Ù…
                        </div>
                      </td>
                      <td className="p-4">
                        {isActive ? (
                          <span className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full text-xs font-black flex items-center gap-1 w-fit">
                            <ShieldCheck size={14} /> Ù†Ø´Ø·
                          </span>
                        ) : (
                          <span className="bg-rose-50 text-rose-600 px-3 py-1 rounded-full text-xs font-black flex items-center gap-1 w-fit">
                            <XCircle size={14} /> {isExpired ? 'Ù…Ù†ØªÙ‡ÙŠ' : 'Ù…ØªÙˆÙ‚Ù'}
                          </span>
                        )}
                    </td>
                    {/* â”€â”€â”€ Plan Badge â”€â”€â”€ */}
                    <td className="p-4">
                      {(() => {
                        const planColors: Record<string, string> = {
                          basic:      'bg-slate-100 text-slate-700 border-slate-300',
                          pro:        'bg-blue-50 text-blue-700 border-blue-200',
                          sports:     'bg-emerald-50 text-emerald-700 border-emerald-200',
                          premium:    'bg-amber-50 text-amber-700 border-amber-200',
                          enterprise: 'bg-purple-50 text-purple-700 border-purple-200',
                        };
                        const planLabels: Record<string, string> = {
                          basic: 'ðŸ¥‰ Ø£Ø³Ø§Ø³ÙŠØ©', pro: 'ðŸ¥ˆ Ø§Ø­ØªØ±Ø§ÙÙŠØ©',
                          sports: 'ðŸŸï¸ Ø±ÙŠØ§Ø¶Ø©', premium: 'ðŸ¥‡ Ù…ØªÙƒØ§Ù…Ù„Ø©', enterprise: 'ðŸ¢ Enterprise',
                        };
                        const p = (org as any).plan || 'pro';
                        return (
                          <span className={`px-2.5 py-1 rounded-full text-[11px] font-black border whitespace-nowrap ${planColors[p] || planColors['pro']}`}>
                            {planLabels[p] || p}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="p-4">
                      <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-lg text-xs font-bold border border-blue-100">
                        {activityLabels[org.activity_type || ''] || org.activity_type || 'ØªØ¬Ø§Ø±ÙŠ'}
                      </span>
                      </td>
                      <td className="p-4 text-slate-500 font-medium">
                        <div className="flex items-center gap-1 text-emerald-600 font-black">
                          <DollarSign size={14} />
                          {(org.total_sales || 0).toLocaleString()}
                          <span className="text-[10px] font-bold mr-1">Ø¬.Ù…</span>
                        </div>
                      </td>
                      <td className="p-4">
                        {diffDays !== null ? (
                          <div className={`font-black text-xs ${diffDays <= 1 ? 'text-rose-600 animate-pulse' : 'text-slate-600'}`}>
                            {diffDays === 0 ? 'Ø§Ù„ÙŠÙˆÙ…' : diffDays === 1 ? 'ØºØ¯Ø§Ù‹' : diffDays < 0 ? `Ù…ØªØ£Ø®Ø± ${Math.abs(diffDays)} ÙŠÙˆÙ…` : `Ø¨Ø§Ù‚ÙŠ ${diffDays} ÙŠÙˆÙ…`}
                          </div>
                        ) : (
                          <span className="text-slate-300 text-xs">--</span>
                        )}
                      </td>
                      <td className="p-4 text-slate-500 font-medium">
                        {org.subscription_expiry ? new Date(org.subscription_expiry).toLocaleDateString('ar-EG') : 'Ø¨Ø¯ÙˆÙ† ØªØ§Ø±ÙŠØ®'}
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-1">
                          {org.allowed_modules?.slice(0, 2).map(m => (
                            <span key={m} className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold uppercase">{m}</span>
                          ))}
                          {org.allowed_modules?.length > 2 && <span className="text-[10px] text-slate-400 font-bold">+{org.allowed_modules.length - 2}</span>}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-center gap-2">
                          <button 
                            onClick={() => { setCloningSourceOrg(org); setIsCloneModalOpen(true); }}
                            className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-all flex items-center gap-1 font-bold text-xs border border-transparent hover:border-purple-200"
                            title="Ø§Ø³ØªÙ†Ø³Ø§Ø® Ù‚Ø§Ù„Ø¨ ÙˆØ¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ù‡Ø°Ù‡ Ø§Ù„Ø´Ø±ÙƒØ©"
                          >
                            <GitFork size={16} /> Ø§Ø³ØªÙ†Ø³Ø§Ø®
                          </button>
                          <button 
                            onClick={() => { setEditingOrg(org); setIsEditModalOpen(true); }}
                            className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-all flex items-center gap-1 font-bold text-xs border border-transparent hover:border-slate-200"
                            title="ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª ÙˆØ§Ù„Ø¨Ø§Ù‚Ø©"
                          >
                            <Settings size={16} /> ØªØ¹Ø¯ÙŠÙ„
                          </button>
                          <button 
                            onClick={() => { setDeletingOrg(org); setIsDeleteModalOpen(true); }}
                            className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-all flex items-center gap-1 font-bold text-xs border border-transparent hover:border-rose-200"
                            title="Ø­Ø°Ù Ø§Ù„Ù…Ù†Ø¸Ù…Ø© Ù†Ù‡Ø§Ø¦ÙŠØ§Ù‹"
                          >
                            <Trash2 size={16} /> Ø­Ø°Ù
                          </button>
                          <button 
                            onClick={() => handleImpersonate(org.id, org.name)}
                            className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-all flex items-center gap-1 font-bold text-xs border border-transparent hover:border-blue-200"
                            title="ØªØµÙØ­ Ø¨ÙŠØ§Ù†Ø§Øª Ù‡Ø°Ù‡ Ø§Ù„Ø´Ø±ÙƒØ©"
                          >
                            <Eye size={16} />
                            ØªØµÙØ­
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
      )}

      {/* Tab Content: Backup & Restore Management */}
      {activeAdminTab === 'backups' && (
        <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-200 space-y-8 animate-in fade-in">
          <div className="flex flex-col md:flex-row justify-between items-end gap-6">
            <div className="flex-1 w-full">
              <label className="block text-sm font-black text-slate-700 mb-2">Ø§Ø®ØªØ± Ø§Ù„Ù…Ù†Ø¸Ù…Ø© Ù„Ù„Ø¥Ø¯Ø§Ø±Ø©:</label>
              <select 
                value={selectedBackupOrgId || ''} 
                onChange={(e) => setSelectedBackupOrgId(e.target.value)} 
                className="w-full border-2 border-slate-100 rounded-2xl px-4 py-3 font-bold text-slate-700 bg-slate-50 focus:border-blue-500 outline-none"
              >
                <option value="">-- Ø§Ø®ØªØ± Ø§Ù„Ù…Ù†Ø¸Ù…Ø© --</option>
                {orgs.map((org) => <option key={org.id} value={org.id}>{org.name} ({org.id.slice(0,8)})</option>)}
              </select>
            </div>
            <div className="flex gap-3 flex-wrap">
              <input type="file" ref={fileInputRef} accept=".json" className="hidden" onChange={handleExternalFileRestore} />
              <button onClick={() => fileInputRef.current?.click()} className="bg-white border-2 border-slate-200 text-slate-600 px-6 py-3 rounded-2xl font-black hover:bg-slate-50 flex items-center gap-2 shadow-sm">
                <Upload size={18} /> Ø§Ø³ØªØ¹Ø§Ø¯Ø© Ù…Ù„Ù Ø®Ø§Ø±Ø¬ÙŠ
              </button>
              <button 
                onClick={handleCreateBackup} 
                disabled={creatingBackup || !selectedBackupOrgId} 
                className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-black hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 shadow-lg shadow-blue-100"
              >
                {creatingBackup ? <Loader2 className="animate-spin" size={20} /> : <PlusCircle size={20} />} Ø¥Ù†Ø´Ø§Ø¡ Ù†Ø³Ø®Ø© Ø§Ø­ØªÙŠØ§Ø·ÙŠØ©
              </button>
              <button 
                onClick={handleExportToS3} 
                disabled={exportingS3 || !selectedBackupOrgId} 
                className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black hover:bg-indigo-700 flex items-center gap-2 disabled:opacity-50 shadow-lg shadow-indigo-100"
                title="Ø£Ø®Ø° Ù†Ø³Ø®Ø© Ø§Ø­ØªÙŠØ§Ø·ÙŠØ© ÙˆØ±ÙØ¹Ù‡Ø§ Ø¥Ù„Ù‰ Ù…Ø³ØªÙˆØ¯Ø¹ S3 / Cloudflare R2 Ø®Ø§Ø±Ø¬ÙŠ"
              >
                {exportingS3 ? <Loader2 className="animate-spin" size={20} /> : <UploadCloud size={20} />} ØªØµØ¯ÙŠØ± Ø®Ø§Ø±Ø¬ÙŠ (S3 / R2)
              </button>
            </div>
          </div>


          {selectedBackupOrgId && (
            <div className="border-2 border-slate-50 rounded-[32px] overflow-hidden">
              <div className="bg-slate-50/50 p-4 border-b border-slate-100 font-black text-slate-500 text-xs uppercase tracking-widest">Ø³Ø¬Ù„ Ø§Ù„Ù†Ø³Ø® Ø§Ù„Ø§Ø­ØªÙŠØ§Ø·ÙŠØ©</div>
              {loadingBackups ? (
                <div className="p-20 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" size={32} /></div>
              ) : backups.length === 0 ? (
                <div className="p-20 text-center text-slate-400 font-bold">Ù„Ø§ ØªÙˆØ¬Ø¯ Ù†Ø³Ø® Ø§Ø­ØªÙŠØ§Ø·ÙŠØ© Ù…Ø³Ø¬Ù„Ø© Ù„Ù‡Ø°Ù‡ Ø§Ù„Ø´Ø±ÙƒØ© Ø­Ø§Ù„ÙŠØ§Ù‹.</div>
              ) : (
                <table className="w-full text-right text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-400 font-black text-[10px] uppercase border-b">
                      <th className="p-4">ØªØ§Ø±ÙŠØ® Ø§Ù„Ù†Ø³Ø®Ø©</th>
                      <th className="p-4">Ø§Ù„Ø­Ø¬Ù… (KB)</th>
                      <th className="p-4">Ø¨ÙˆØ§Ø³Ø·Ø©</th>
                      <th className="p-4 text-center">Ø§Ù„Ø¥Ø¬Ø±Ø§Ø¡Ø§Øª</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {backups.map((backup) => (
                      <tr key={backup.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4 font-bold">{new Date(backup.backup_date).toLocaleString()}</td>
                        <td className="p-4 font-mono">{backup.file_size_kb ? backup.file_size_kb.toFixed(2) : '0'}</td>
                        <td className="p-4 text-slate-500 font-medium">{backup.profiles?.full_name || 'Ø§Ù„Ù†Ø¸Ø§Ù…'}</td>
                        <td className="p-4 flex justify-center gap-3">
                          <button onClick={() => handleRestoreBackup(backup)} disabled={restoringId !== null} className={`p-2 rounded-xl transition-all ${restoringId === backup.id ? 'bg-orange-100 text-orange-600' : 'bg-orange-50 text-orange-600 hover:bg-orange-100'}`} title="Ø§Ø³ØªØ¹Ø§Ø¯Ø©"><RotateCcw size={18} /></button>
                          <button onClick={() => handleDownloadBackup(backup)} className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100" title="ØªØ­Ù…ÙŠÙ„"><Download size={18} /></button>
                          <button onClick={() => handleDeleteBackup(backup.id)} className="p-2 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100" title="Ø­Ø°Ù"><Trash2 size={18} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {/* Growth Analysis Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-gradient-to-br from-blue-600 to-indigo-700 p-8 rounded-3xl text-white relative overflow-hidden shadow-xl shadow-blue-100">
          <div className="relative z-10">
            <h3 className="text-2xl font-black mb-2">ØªÙ‚Ø±ÙŠØ± Ø§Ù„Ù†Ù…Ùˆ Ø§Ù„Ø°ÙƒÙŠ ðŸ“ˆ</h3>
            <p className="opacity-90 font-medium mb-6 max-w-md">
              Ø£Ø¯Ø§Ø¡ Ø§Ù„Ù…Ù†ØµØ© Ù‡Ø°Ø§ Ø§Ù„Ø´Ù‡Ø± Ù…ØªÙ…ÙŠØ²! Ù‡Ù†Ø§Ùƒ Ø²ÙŠØ§Ø¯Ø© Ø¨Ù†Ø³Ø¨Ø© {stats?.growth_this_month_percent}% ÙÙŠ Ø¹Ø¯Ø¯ Ø§Ù„Ù…Ø´ØªØ±ÙƒÙŠÙ† Ø§Ù„Ø¬Ø¯Ø¯ Ù…Ù‚Ø§Ø±Ù†Ø© Ø¨Ø§Ù„Ø´Ù‡Ø± Ø§Ù„Ù…Ø§Ø¶ÙŠ.
            </p>
            <button className="bg-white text-blue-700 px-6 py-3 rounded-xl font-black hover:bg-blue-50 transition-all flex items-center gap-2 shadow-lg">
              Ø¹Ø±Ø¶ Ø§Ù„ØªØ­Ù„ÙŠÙ„Ø§Øª Ø§Ù„Ù…ØªÙ‚Ø¯Ù…Ø©
              <ArrowUpRight size={20} />
            </button>
          </div>
          <div className="absolute -bottom-10 -right-10 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
        </div>
        
        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-center">
           <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl"><Users size={24} /></div>
              <h4 className="font-bold text-slate-800">Ø§Ù„Ø¯Ø¹Ù… Ø§Ù„ÙÙ†ÙŠ</h4>
           </div>
           <p className="text-slate-500 text-sm leading-relaxed mb-6">ÙŠÙ…ÙƒÙ†Ùƒ Ø§Ù„ØªÙˆØ§ØµÙ„ Ù…Ø¹ Ø§Ù„Ø´Ø±ÙƒØ§Øª Ø§Ù„Ù…Ø´ØªØ±ÙƒØ© Ø£Ùˆ Ø¥Ø±Ø³Ø§Ù„ Ø¥Ø´Ø¹Ø§Ø±Ø§Øª Ø¬Ù…Ø§Ø¹ÙŠØ© Ù„ÙƒØ§ÙØ© Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù…ÙŠÙ† Ø¨Ø®ØµÙˆØµ ØªØ­Ø¯ÙŠØ«Ø§Øª Ø§Ù„Ù†Ø¸Ø§Ù….</p>
           <button className="w-full py-3 border-2 border-slate-100 rounded-xl text-slate-600 font-bold hover:bg-slate-50 transition-all">Ø¥Ø±Ø³Ø§Ù„ Ø¥Ø´Ø¹Ø§Ø± Ø¹Ø§Ù…</button>
        </div>
      </div>

      <AddClientModal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
        onSuccess={loadData} 
        existingOrgs={orgs}
      />
      <CloneCompanyModal 
        isOpen={isCloneModalOpen} 
        onClose={() => { setIsCloneModalOpen(false); setCloningSourceOrg(null); }} 
        onSuccess={loadData} 
        organizations={orgs} 
        initialSourceOrg={cloningSourceOrg} 
      />
      <EditClientModal 
        isOpen={isEditModalOpen} 
        onClose={() => { setIsEditModalOpen(false); setEditingOrg(null); }} 
        onSuccess={loadData} 
        organization={editingOrg}
      />
      <DeleteConfirmModal 
        isOpen={isDeleteModalOpen} 
        onClose={() => { 
          setIsDeleteModalOpen(false); 
          setDeletingOrg(null); 
          setDeleteConfirmName(''); 
        }} 
        onConfirm={handleDeleteOrg}
        organization={deletingOrg}
        confirmName={deleteConfirmName}
        setConfirmName={setDeleteConfirmName}
        loading={loading}
      />
      <OrphanedFilesModal 
        isOpen={isOrphanedModalOpen} 
        onClose={() => setIsOrphanedModalOpen(false)} 
        files={orphanedFiles} 
        onDelete={handleDeleteOrphanedFile}
        loading={loading}
      />
    </div>
  );
};

export default SaaSAdmin;
