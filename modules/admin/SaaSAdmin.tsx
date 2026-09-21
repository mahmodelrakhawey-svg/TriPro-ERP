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

const StatCard = ({ title, value, icon: Icon, color, suffix = '', growth = null }: any) => (
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
  const { currentUser, isLoading } = useAccounting(); // جلب المستخدم الحالي وحالة التحميل
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
  const [activityTypeFilter, setActivityTypeFilter] = useState('all'); // 👈 حالة جديدة لفلتر نوع النشاط
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

      // جلب قائمة الشركات مع حساب عدد المستخدمين يدوياً لضمان الدقة
      const { data: orgsData, error: orgsError } = await supabase
        .from('organizations')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (orgsError) throw orgsError;

      // جلب البيانات الإضافية (مستخدمين ومبيعات) لكل الشركات
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
      // 🔍 فحص النسخ الاحتياطية اليتيمة لليوزر العالمي فقط
      if (currentUser?.role === 'super_admin') {
        const { data: allBackups } = await supabase
          .from('organization_backups')
          .select('organization_id');

        if (allBackups) {
          const orgIds = new Set(processedOrgs.map(o => o.id));
          const orphaned = allBackups.filter(b => !orgIds.has(b.organization_id));
          setOrphanedBackupsCount(orphaned.length);
          
          if (orphaned.length > 0) {
            showToast(`تنبيه: تم العثور على ${orphaned.length} نسخة احتياطية يتيمة لشركات محذوفة!`, 'warning');
          }
        }
      }      
    } catch (error: any) {
      showToast('خطأ في تحميل البيانات: ' + error.message, 'error');
    } finally {
      setLoading(false);
      setLoadingOrgs(false);
    }
  };
  const handleCleanupOrphanedBackups = async () => {
    if (orphanedBackupsCount === 0) {
      showToast('لا توجد نسخ احتياطية يتيمة لتنظيفها حالياً ✅', 'info');
      return;
    }
    if (!window.confirm(`هل أنت متأكد من حذف ${orphanedBackupsCount} نسخة احتياطية يتيمة من قاعدة البيانات؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    
    setLoading(true);
    try {
      // استدعاء الدالة الجديدة من طرف الخادم لسرعة أكبر
      const { data, error } = await supabase.rpc('cleanup_orphaned_backups');
      if (error) throw error;
      showToast(`تم تنظيف ${data || 0} نسخة يتيمة بنجاح من قاعدة البيانات ✅`, 'success');

      setOrphanedBackupsCount(0);
      await loadData();
    } catch (error: any) {
      showToast('فشل عملية التنظيف: ' + error.message, 'error');
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
    } catch (err: any) {
      showToast('فشل جلب النسخ الاحتياطية', 'error');
    } finally {
      setLoadingBackups(false);
    }
  };

  const handleCreateBackup = async () => {
    if (!selectedBackupOrgId) return;
    if (!window.confirm(`هل تريد إنشاء نسخة احتياطية جديدة لـ ${getOrgName(selectedBackupOrgId)}؟`)) return;
    setCreatingBackup(true);
    try {
      const { error } = await supabase.rpc('create_organization_backup', { p_org_id: selectedBackupOrgId });
      if (error) throw error;
      showToast('تم إنشاء نسخة احتياطية بنجاح ✅', 'success');
      fetchBackups(selectedBackupOrgId);
    } catch (err: any) {
      showToast('فشل إنشاء النسخة الاحتياطية', 'error');
    } finally {
      setCreatingBackup(false);
    }
  };

  const [exportingS3, setExportingS3] = useState(false);
  const handleExportToS3 = async () => {
    if (!selectedBackupOrgId) return;
    setExportingS3(true);
    try {
      showToast('جاري أخذ نسخة سحابية ورفعها إلى مستودع S3 / R2 الخارجي...', 'info');
      const res = await offsiteBackupService.createAndExportOffsiteBackup(selectedBackupOrgId);
      if (res.success) {
        showToast((res.message || 'تم الرفع إلى S3 بنجاح') + ' ✅', 'success');
        fetchBackups(selectedBackupOrgId);
      } else {
        showToast((res.message || 'فشل الرفع إلى S3') + (res.error ? ': ' + res.error : ''), 'error');
      }
    } catch (err: any) {
      showToast('خطأ في الرفع الخارجي: ' + err.message, 'error');
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
    if (!window.confirm('⚠️ تحذير: سيتم مسح البيانات الحالية واستبدالها بالنسخة الاحتياطية. هل تريد الاستمرار؟')) return;
    if (window.prompt('لتأكيد الاستعادة النهائية، يرجى كتابة "استعادة" في المربع أدناه:') !== 'استعادة') return;
    setRestoringId(backup.id);
    try {
      const { data, error } = await supabase.rpc('restore_organization_backup', {
        p_org_id: backup.organization_id,
        p_backup_data: backup.backup_data
      });
      if (error) throw error;
      showToast(data || 'تمت استعادة البيانات بنجاح ✅', 'success');
    } catch (err: any) {
      showToast('فشل عملية الاستعادة', 'error');
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
      } catch (err: any) {
        showToast('ملف غير صالح', 'error');
      }
    };
    reader.readAsText(file);
  };

  const handleDeleteBackup = async (backupId: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه النسخة الاحتياطية؟ لا يمكن التراجع عن هذا الإجراء.')) return;
    try {
      const { error } = await supabase
        .from('organization_backups')
        .delete()
        .eq('id', backupId);

      if (error) throw error;
      showToast('تم حذف النسخة الاحتياطية بنجاح ✅', 'success');
      if (selectedBackupOrgId) fetchBackups(selectedBackupOrgId);
    } catch (err: any) {
      showToast('فشل حذف النسخة الاحتياطية: ' + err.message, 'error');
      console.error('Error deleting backup:', err);
    }
  };

  const getOrgName = (orgId: string) => {
    return orgs.find(org => org.id === orgId)?.name || 'منظمة غير معروفة';
  };
  // --- End Backup Management Functions ---

  const handleDeleteOrg = async () => {
    if (!deletingOrg) return;
    if (deleteConfirmName.trim() !== deletingOrg.name.trim()) {
      showToast('اسم الشركة غير متطابق للتأكيد', 'error');
      return;
    }

    setLoading(true);
    try {
      // 1. حذف الشعار من مخزن Supabase Storage إذا وجد
      if (deletingOrg.logo_url) {
        try {
          // استخراج اسم الملف من الرابط (آخر جزء في الـ URL)
          const urlParts = deletingOrg.logo_url.split('/');
          const fileName = urlParts[urlParts.length - 1];
          
          if (fileName) {
            const { error: storageError } = await supabase.storage
              .from('logos')
              .remove([fileName]);
              
            if (storageError) console.warn('Storage deletion warning:', storageError);
          }
        } catch (err) {
          console.error('Failed to parse or delete logo from storage:', err);
        }
      }

      // 2. حذف كافة المرفقات (قيود، سندات، شيكات) من الـ Storage
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
          
          if (attStorageError) console.warn('Attachments storage deletion warning:', attStorageError);
        }
      } catch (err) {
        console.error('Failed to clean up attachments from storage:', err);
      }

      // 3. محاولة الحذف عبر الدالة الآمنة في قاعدة البيانات
      const orgId = deletingOrg.id;
      let deleteResult = await supabase.rpc('fn_delete_organization_safe', { p_org_id: orgId });

      // إذا حدث خطأ (400 أو 409 أو 500) نقوم بالتدخل لتفكيك القيود المرجعية فورياً
      if (deleteResult.error) {
        console.warn('RPC delete failed, executing client-side cascade cleanup...', deleteResult.error);

        try {
          // أ. فك ارتباط كافة المستخدمين بالشركة
          await supabase.from('profiles').update({ organization_id: null }).eq('organization_id', orgId);

          // ب. حذف صلاحيات وأدوار الشركة
          await supabase.from('role_permissions').delete().eq('organization_id', orgId);
          await supabase.from('roles').delete().eq('organization_id', orgId);

          // استخراج معرفات الأصناف التابعة للمنظمة لفك أي قيود معلقة عليها
          const { data: orgProducts } = await supabase.from('products').select('id').eq('organization_id', orgId);
          const prodIds = (orgProducts || []).map((p: any) => p.id).filter(Boolean);

          // ج.1 تفكيك موديول التشفية والذبائح (Butchering Module)
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

          // ج.2 تفكيك موديول التصنيع (Manufacturing Module)
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

          // ج.3 تفكيك قيود المطاعم ونقاط البيع (Restaurant & Channel Pricing)
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

          // ج.4 حذف تفاصيل الحركات والبنود المعلقة
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

          // د. حذف رؤوس الحركات والمستندات
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

          // هـ. حذف السجلات التأسيسية
          const masterTables = [
            'products', 'customers', 'suppliers', 'accounts', 'warehouses', 'cost_centers', 'assets',
            'employees', 'company_settings', 'invitations', 'budgets', 'notification_preferences', 'security_logs', 'audit_logs'
          ];
          for (const tbl of masterTables) {
            try { await (supabase.from(tbl as any) as any).delete().eq('organization_id', orgId); } catch (_) {}
          }

          // و. إعادة محاولة استدعاء الدالة الآمنة بعد تفكيك القيود
          deleteResult = await supabase.rpc('fn_delete_organization_safe', { p_org_id: orgId });

          // ز. في حال بقاء أي عائق بالدالة، يتم مسح سجل المنظمة مباشرة من جدول organizations
          if (deleteResult.error) {
            const directDelete = await supabase.from('organizations').delete().eq('id', orgId);
            if (directDelete.error) {
              throw new Error(deleteResult.error.message || directDelete.error.message);
            }
          }
        } catch (cleanupErr: any) {
          throw new Error(deleteResult.error?.message || cleanupErr.message);
        }
      }

      showToast(`تم حذف الشركة ${deletingOrg.name} بنجاح ✅`, 'success');
      await loadData();
      setIsDeleteModalOpen(false);
      setDeletingOrg(null);
      setDeleteConfirmName('');
    } catch (error: any) {
      showToast('فشل حذف الشركة: ' + error.message, 'error');
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
      showToast(`تم اكتشاف ${orphanedDocs.length} ملف يتيم`, 'info');
    } catch (err: any) {
      showToast('فشل الفحص: ' + err.message, 'error');
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
        showToast('تم تنظيف كافة الملفات اليتيمة ✅', 'success');
      } else {
        const [bucket, name] = path.split('/');
        await supabase.storage.from(bucket).remove([name]);
        setOrphanedFiles(prev => prev.filter(f => f !== path));
        showToast('تم حذف الملف بنجاح', 'success');
      }
    } catch (err: any) { showToast('فشل الحذف: ' + err.message, 'error'); } finally { setLoading(false); }
  };

  const handleImpersonate = async (orgId: string, orgName: string) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) throw new Error('لم يتم العثور على المستخدم');

      // حفظ معرف المنظمة الأصلي (بيئة المدير) قبل التبديل للتمكن من العودة لاحقاً
      const currentOrgId = user.user_metadata?.org_id || 'main';
      if (!secureStorage.getItem('admin_original_org_id')) {
        secureStorage.setItem('admin_original_org_id', currentOrgId);
      }

      // 1. تحديث البروفايل في قاعدة البيانات
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ organization_id: orgId })
        .eq('id', user.id);

      if (profileError) throw profileError;

      // 2. تحديث بيانات الـ Metadata في نظام Auth لضمان تحديث الـ Token (JWT)
      const { error: authError } = await supabase.auth.updateUser({
        data: { ...user.user_metadata, org_id: orgId }
      });

      if (authError) throw authError;

      showToast(`تم الانتقال لبيئة عمل: ${orgName} بنجاح. جاري تحديث النظام...`, 'success');
      setTimeout(() => window.location.reload(), 1500);
    } catch (error: any) {
      showToast('فشل في عملية المحاكاة: ' + error.message, 'error');
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
      showToast(data || 'تم إصلاح وتحديث قاعدة البيانات بنجاح ✅', 'success');
      // إعادة تحميل البيانات بعد الإصلاح
      await loadData();
    } catch (error: any) {
      if (error.code === 'PGRST202') {
        showToast('النظام يحتاج تنشيط يدوي أول مرة: يرجى تشغيل "NOTIFY pgrst, \'reload config\';" في Supabase SQL Editor', 'warning');
      } else {
        showToast('فشل الإصلاح التلقائي: ' + error.message, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleExportToExcel = () => {
    try {
      const exportData = filteredOrgs.map(org => {
        const isExpired = org.subscription_expiry && new Date(org.subscription_expiry) < new Date();
        const statusText = org.is_active && !isExpired ? 'نشط' : (isExpired ? 'منتهي' : 'متوقف');
        
        return {
          'اسم الشركة': org.name,
          'الحالة': statusText,
          'إجمالي المبيعات': org.total_sales || 0,
          'إجمالي المحصل': org.total_collected || 0,
          'موعد الدفع القادم': org.next_payment_date || 'غير محدد',
          'تاريخ انتهاء الاشتراك': org.subscription_expiry ? new Date(org.subscription_expiry).toLocaleDateString('ar-EG') : 'بدون تاريخ',
          'الموديولات المسموحة': (org.allowed_modules || []).join(', '),
          'الحد الأقصى للمستخدمين': org.max_users,
          'تاريخ التأسيس': new Date(org.created_at).toLocaleDateString('ar-EG')
        };
      });

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "الشركات المشتركة");
      
      XLSX.writeFile(wb, `TriPro_Organizations_${new Date().toISOString().split('T')[0]}.xlsx`);
      showToast('تم تصدير ملف Excel بنجاح ✅', 'success');
    } catch (error: any) {
      showToast('فشل تصدير الملف: ' + error.message, 'error');
    }
  };

  // 🛡️ حماية الصفحة: التأكد من أن اليوزر هو super_admin فقط
  if (!isLoading && currentUser?.role !== 'super_admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-red-600 bg-red-50 rounded-3xl border border-red-100 p-8">
        <Lock size={48} className="mb-4" />
        <h2 className="text-2xl font-bold">وصول غير مصرح به</h2>
        <p className="text-slate-600">هذه الصفحة مخصصة لمدير المنصة العالمي فقط.</p>
      </div>
    );
  }

  const filteredOrgs = useMemo(() => {
    return orgs.filter(org => {
      const matchesSearch = org.name.toLowerCase().includes(searchTerm.toLowerCase());
      const isExpired = org.subscription_expiry && new Date(org.subscription_expiry) < new Date();
      const isActive = org.is_active && !isExpired;
      const matchesActivityType = activityTypeFilter === 'all' || org.activity_type === activityTypeFilter; // 👈 منطق فلترة جديد

      if (filterStatus === 'all') return matchesSearch && matchesActivityType;
      if (filterStatus === 'active') return matchesSearch && isActive && matchesActivityType;
      if (filterStatus === 'inactive') return matchesSearch && !isActive && matchesActivityType;
      
      return matchesSearch && matchesActivityType;
    });
  }, [orgs, searchTerm, filterStatus, activityTypeFilter]); // 👈 إضافة activityTypeFilter للتبعيات

  if (loading && !stats) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Loader2 className="animate-spin text-blue-600" size={40} />
        <p className="text-slate-500 font-medium">جاري جلب إحصائيات المنصة...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800">إدارة المنصة (SaaS)</h1>
          <p className="text-slate-500 mt-1 font-medium">نظرة عامة على أداء كافة الشركات المشتركة</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleCleanupOrphanedBackups}
            className="flex items-center gap-2 bg-rose-50 border border-rose-100 px-4 py-2 rounded-xl text-rose-600 font-bold hover:bg-rose-100 transition-colors shadow-sm"
            title="حذف سجلات النسخ الاحتياطية التي لا تملك شركة (Database Cleanup)"
          >
            <Trash2 size={18} />
            تنظيف المرفقات اليتيمة
          </button>
          <button 
            onClick={handleScanOrphanedFiles}
            className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl text-slate-600 font-bold hover:bg-slate-100 transition-colors shadow-sm"
            title="فحص ملفات الـ Storage التي لا تملك سجلات (File Storage Cleanup)"
          >
            <DatabaseIcon size={18} />
            فحص ملفات التخزين
          </button>
          <button 
            onClick={handleFixSchema}
            className="flex items-center gap-2 bg-amber-50 border border-amber-100 px-4 py-2 rounded-xl text-amber-600 font-bold hover:bg-amber-100 transition-colors shadow-sm"
            title="إصلاح مشاكل مزامنة قاعدة البيانات (Schema Cache)"
          >
            <Wrench size={18} />
            إصلاح النظام
          </button>
          <button 
            onClick={handleExportToExcel}
            className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 px-4 py-2 rounded-xl text-emerald-600 font-bold hover:bg-emerald-100 transition-colors shadow-sm"
            title="تصدير القائمة المفلترة إلى Excel"
          >
            <FileSpreadsheet size={18} />
            تصدير Excel
          </button>
          <button 
            onClick={loadData}
            className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-xl text-slate-600 font-bold hover:bg-slate-50 transition-colors shadow-sm"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            تحديث البيانات
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <StatCard 
          title="إجمالي مبيعات المنصة" 
          value={stats?.total_platform_sales || 0} 
          icon={DollarSign} 
          color="bg-blue-600 text-blue-600"
          suffix="ج.م"
        />
        <StatCard 
          title="إجمالي الشركات" 
          value={stats?.total_organizations || 0} 
          icon={Building2} 
          color="bg-purple-600 text-purple-600"
          growth={stats?.growth_this_month_percent}
        />
        <StatCard 
          title="الاشتراكات النشطة" 
          value={stats?.active_subscriptions || 0} 
          icon={CheckCircle} 
          color="bg-emerald-600 text-emerald-600"
        />
        <StatCard 
          title="شركات جديدة (اليوم)" 
          value={stats?.new_registrations_today || 0} 
          icon={UserPlus} 
          color="bg-orange-600 text-orange-600"
        />
        <StatCard 
          title="معدل النمو الشهري" 
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
          إدارة المنظمات والاشتراكات
        </button>
        <button 
          onClick={() => setActiveAdminTab('backups')}
          className={`pb-3 px-5 font-black text-sm transition-all flex items-center gap-2 ${activeAdminTab === 'backups' ? 'border-b-4 border-blue-600 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <DatabaseIcon size={18} />
          النسخ الاحتياطي والاستعادة السحابية
        </button>
      </div>

      {/* Main Content Area (Organizations Management) */}
      {activeAdminTab === 'organizations' && (
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-800">إدارة الشركات والاشتراكات</h2>
          <div className="flex gap-2">
            <button 
              onClick={() => { setCloningSourceOrg(null); setIsCloneModalOpen(true); }}
              className="bg-purple-50 text-purple-700 border border-purple-200 px-4 py-2.5 rounded-xl font-bold hover:bg-purple-100 transition-all flex items-center gap-2 shadow-sm"
              title="استنساخ شجرة الحسابات والإعدادات بين شركتين"
            >
              <GitFork size={18} />
              استنساخ قالب شركة
            </button>
            <button 
              onClick={() => setIsAddModalOpen(true)}
              className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 flex items-center gap-2"
            >
              <UserPlus size={18} />
              إضافة شركة جديدة
            </button>
          </div>
        </div>
        {/* Search and Filter */}
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
                <Search className="absolute right-3 top-2.5 text-slate-400" size={20} />
                <input 
                    type="text" 
                    placeholder="بحث باسم الشركة..." 
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
                    <option value="all">كل الحالات</option>
                    <option value="active">نشط</option>
                    <option value="inactive">متوقف / منتهي</option>
                </select>
            </div>
            {/* 👈 فلتر نوع النشاط الجديد */}
            <div className="relative">
                <Filter className="absolute right-3 top-2.5 text-slate-400 pointer-events-none" size={20} />
                <select 
                    value={activityTypeFilter}
                    onChange={(e) => setActivityTypeFilter(e.target.value)}
                    className="appearance-none pr-10 pl-4 py-2 rounded-xl border border-slate-300 focus:outline-none focus:border-blue-500 bg-white text-slate-700 font-medium"
                >
                    <option value="all">كل الأنشطة</option>
                    <option value="commercial">تجاري</option>
                    <option value="restaurant">مطاعم</option>
                    <option value="construction">مقاولات</option>
                    <option value="manufacturing">مصانع/تصنيع</option>
                    <option value="clinic">عيادات</option>
                    <option value="legal">قانوني</option>
                    <option value="transport">نقل</option>
                    <option value="charity">خيري</option>
                <option value="hospital">🏥 المستشفيات والمراكز الطبية</option>
                </select>
            </div>
        </div>
        
        {loadingOrgs ? (
          <div className="p-20 text-center">
            <Loader2 className="animate-spin text-blue-600 mx-auto mb-4" size={32} />
            <p className="text-slate-500 font-medium">جاري تحميل قائمة الشركات...</p>
          </div>
        ) : filteredOrgs.length === 0 ? (
            <div className="p-20 text-center text-slate-500">
                <Building2 size={48} className="mx-auto mb-4 text-slate-300" />
                <p className="text-lg font-medium">لا توجد شركات مطابقة</p>
                <p className="text-sm">لم يتم العثور على أي شركة تطابق معايير البحث أو الفلترة.</p>
            </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead className="bg-slate-50 text-slate-500 text-sm font-bold uppercase tracking-wider">
                <tr>
                  <th className="p-4 border-b border-slate-100">اسم الشركة</th>
                  <th className="p-4 border-b border-slate-100">الحالة</th>
                  <th className="p-4 border-b border-slate-100">نوع النشاط</th>
                  <th className="p-4 border-b border-slate-100">إجمالي المبيعات</th>
                  <th className="p-4 border-b border-slate-100">أيام التحصيل</th>
                  <th className="p-4 border-b border-slate-100">تاريخ الانتهاء</th>
                  <th className="p-4 border-b border-slate-100">الموديولات</th>
                  <th className="p-4 border-b border-slate-100 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50"> 
                {filteredOrgs.map((org) => {
                  const isExpired = org.subscription_expiry && new Date(org.subscription_expiry) < new Date();
                  const isActive = org.is_active && !isExpired;
                  const isOverLimit = org.user_count && org.user_count >= org.max_users;
                  
                  const activityLabels: Record<string, string> = {
                    'commercial': 'تجاري',
                    'restaurant': 'مطاعم',
                    'construction': 'مقاولات',
                    'manufacturing': 'مصانع/تصنيع',
                    'clinic': 'عيادات',
                    'legal': 'قانوني',
                    'transport': 'نقل',
                    'charity': 'خيري',
                    'hospital': 'مستشفيات'
                  };

                  // حساب الأيام المتبقية لموعد الدفع القادم
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
                          {org.user_count} / {org.max_users} مستخدم
                        </div>
                      </td>
                      <td className="p-4">
                        {isActive ? (
                          <span className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full text-xs font-black flex items-center gap-1 w-fit">
                            <ShieldCheck size={14} /> نشط
                          </span>
                        ) : (
                          <span className="bg-rose-50 text-rose-600 px-3 py-1 rounded-full text-xs font-black flex items-center gap-1 w-fit">
                            <XCircle size={14} /> {isExpired ? 'منتهي' : 'متوقف'}
                          </span>
                        )}
                    </td>
                    <td className="p-4">
                      <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-lg text-xs font-bold border border-blue-100">
                        {activityLabels[org.activity_type || ''] || org.activity_type || 'تجاري'}
                      </span>
                      </td>
                      <td className="p-4 text-slate-500 font-medium">
                        <div className="flex items-center gap-1 text-emerald-600 font-black">
                          <DollarSign size={14} />
                          {(org.total_sales || 0).toLocaleString()}
                          <span className="text-[10px] font-bold mr-1">ج.م</span>
                        </div>
                      </td>
                      <td className="p-4">
                        {diffDays !== null ? (
                          <div className={`font-black text-xs ${diffDays <= 1 ? 'text-rose-600 animate-pulse' : 'text-slate-600'}`}>
                            {diffDays === 0 ? 'اليوم' : diffDays === 1 ? 'غداً' : diffDays < 0 ? `متأخر ${Math.abs(diffDays)} يوم` : `باقي ${diffDays} يوم`}
                          </div>
                        ) : (
                          <span className="text-slate-300 text-xs">--</span>
                        )}
                      </td>
                      <td className="p-4 text-slate-500 font-medium">
                        {org.subscription_expiry ? new Date(org.subscription_expiry).toLocaleDateString('ar-EG') : 'بدون تاريخ'}
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
                            title="استنساخ قالب وإعدادات هذه الشركة"
                          >
                            <GitFork size={16} /> استنساخ
                          </button>
                          <button 
                            onClick={() => { setEditingOrg(org); setIsEditModalOpen(true); }}
                            className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-all flex items-center gap-1 font-bold text-xs border border-transparent hover:border-slate-200"
                            title="تعديل الإعدادات والباقة"
                          >
                            <Settings size={16} /> تعديل
                          </button>
                          <button 
                            onClick={() => { setDeletingOrg(org); setIsDeleteModalOpen(true); }}
                            className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-all flex items-center gap-1 font-bold text-xs border border-transparent hover:border-rose-200"
                            title="حذف المنظمة نهائياً"
                          >
                            <Trash2 size={16} /> حذف
                          </button>
                          <button 
                            onClick={() => handleImpersonate(org.id, org.name)}
                            className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-all flex items-center gap-1 font-bold text-xs border border-transparent hover:border-blue-200"
                            title="تصفح بيانات هذه الشركة"
                          >
                            <Eye size={16} />
                            تصفح
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
              <label className="block text-sm font-black text-slate-700 mb-2">اختر المنظمة للإدارة:</label>
              <select 
                value={selectedBackupOrgId || ''} 
                onChange={(e) => setSelectedBackupOrgId(e.target.value)} 
                className="w-full border-2 border-slate-100 rounded-2xl px-4 py-3 font-bold text-slate-700 bg-slate-50 focus:border-blue-500 outline-none"
              >
                <option value="">-- اختر المنظمة --</option>
                {orgs.map((org) => <option key={org.id} value={org.id}>{org.name} ({org.id.slice(0,8)})</option>)}
              </select>
            </div>
            <div className="flex gap-3 flex-wrap">
              <input type="file" ref={fileInputRef} accept=".json" className="hidden" onChange={handleExternalFileRestore} />
              <button onClick={() => fileInputRef.current?.click()} className="bg-white border-2 border-slate-200 text-slate-600 px-6 py-3 rounded-2xl font-black hover:bg-slate-50 flex items-center gap-2 shadow-sm">
                <Upload size={18} /> استعادة ملف خارجي
              </button>
              <button 
                onClick={handleCreateBackup} 
                disabled={creatingBackup || !selectedBackupOrgId} 
                className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-black hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 shadow-lg shadow-blue-100"
              >
                {creatingBackup ? <Loader2 className="animate-spin" size={20} /> : <PlusCircle size={20} />} إنشاء نسخة احتياطية
              </button>
              <button 
                onClick={handleExportToS3} 
                disabled={exportingS3 || !selectedBackupOrgId} 
                className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black hover:bg-indigo-700 flex items-center gap-2 disabled:opacity-50 shadow-lg shadow-indigo-100"
                title="أخذ نسخة احتياطية ورفعها إلى مستودع S3 / Cloudflare R2 خارجي"
              >
                {exportingS3 ? <Loader2 className="animate-spin" size={20} /> : <UploadCloud size={20} />} تصدير خارجي (S3 / R2)
              </button>
            </div>
          </div>


          {selectedBackupOrgId && (
            <div className="border-2 border-slate-50 rounded-[32px] overflow-hidden">
              <div className="bg-slate-50/50 p-4 border-b border-slate-100 font-black text-slate-500 text-xs uppercase tracking-widest">سجل النسخ الاحتياطية</div>
              {loadingBackups ? (
                <div className="p-20 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" size={32} /></div>
              ) : backups.length === 0 ? (
                <div className="p-20 text-center text-slate-400 font-bold">لا توجد نسخ احتياطية مسجلة لهذه الشركة حالياً.</div>
              ) : (
                <table className="w-full text-right text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-400 font-black text-[10px] uppercase border-b">
                      <th className="p-4">تاريخ النسخة</th>
                      <th className="p-4">الحجم (KB)</th>
                      <th className="p-4">بواسطة</th>
                      <th className="p-4 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {backups.map((backup) => (
                      <tr key={backup.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4 font-bold">{new Date(backup.backup_date).toLocaleString()}</td>
                        <td className="p-4 font-mono">{backup.file_size_kb ? backup.file_size_kb.toFixed(2) : '0'}</td>
                        <td className="p-4 text-slate-500 font-medium">{backup.profiles?.full_name || 'النظام'}</td>
                        <td className="p-4 flex justify-center gap-3">
                          <button onClick={() => handleRestoreBackup(backup)} disabled={restoringId !== null} className={`p-2 rounded-xl transition-all ${restoringId === backup.id ? 'bg-orange-100 text-orange-600' : 'bg-orange-50 text-orange-600 hover:bg-orange-100'}`} title="استعادة"><RotateCcw size={18} /></button>
                          <button onClick={() => handleDownloadBackup(backup)} className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100" title="تحميل"><Download size={18} /></button>
                          <button onClick={() => handleDeleteBackup(backup.id)} className="p-2 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100" title="حذف"><Trash2 size={18} /></button>
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
            <h3 className="text-2xl font-black mb-2">تقرير النمو الذكي 📈</h3>
            <p className="opacity-90 font-medium mb-6 max-w-md">
              أداء المنصة هذا الشهر متميز! هناك زيادة بنسبة {stats?.growth_this_month_percent}% في عدد المشتركين الجدد مقارنة بالشهر الماضي.
            </p>
            <button className="bg-white text-blue-700 px-6 py-3 rounded-xl font-black hover:bg-blue-50 transition-all flex items-center gap-2 shadow-lg">
              عرض التحليلات المتقدمة
              <ArrowUpRight size={20} />
            </button>
          </div>
          <div className="absolute -bottom-10 -right-10 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
        </div>
        
        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-center">
           <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl"><Users size={24} /></div>
              <h4 className="font-bold text-slate-800">الدعم الفني</h4>
           </div>
           <p className="text-slate-500 text-sm leading-relaxed mb-6">يمكنك التواصل مع الشركات المشتركة أو إرسال إشعارات جماعية لكافة المستخدمين بخصوص تحديثات النظام.</p>
           <button className="w-full py-3 border-2 border-slate-100 rounded-xl text-slate-600 font-bold hover:bg-slate-50 transition-all">إرسال إشعار عام</button>
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