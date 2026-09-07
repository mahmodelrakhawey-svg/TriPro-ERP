import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { 
  Shield, Save, Check, AlertTriangle, Loader2, CheckSquare, Square, 
  Info, Search, Plus, Trash2, Sliders, ShieldAlert, Sparkles, 
  RotateCcw, Eye, Filter, CheckCircle2, Lock, FileSpreadsheet,
  Layers, ChevronDown, ChevronUp, Copy, Utensils, ShoppingCart
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

// Types
type Role = {
  id: string;
  name: string;
  description: string;
  is_system?: boolean;
};

type Permission = {
  id: string;
  module: string;
  action: string;
  description: string;
  is_sensitive?: boolean;
  category?: string;
};

// تسميات وترتيب الموديولات بالعربية
const moduleMetadata: Record<string, { label: string; group: string; iconColor: string }> = {
  sales: { label: 'المبيعات والفواتير', group: 'sales', iconColor: 'text-emerald-600 bg-emerald-50' },
  customers: { label: 'إدارة العملاء والديون', group: 'sales', iconColor: 'text-emerald-600 bg-emerald-50' },
  purchases: { label: 'المشتريات وأوامر الشراء', group: 'purchases', iconColor: 'text-blue-600 bg-blue-50' },
  suppliers: { label: 'إدارة الموردين والأسعار', group: 'purchases', iconColor: 'text-blue-600 bg-blue-50' },
  products: { label: 'الأصناف والمنتجات والأسعار', group: 'inventory', iconColor: 'text-amber-600 bg-amber-50' },
  inventory: { label: 'المستودعات والجرد والتسويات', group: 'inventory', iconColor: 'text-amber-600 bg-amber-50' },
  treasury: { label: 'الخزينة والبنوك والشيكات', group: 'treasury', iconColor: 'text-green-600 bg-green-50' },
  accounting: { label: 'المحاسبة العامة والقيود والدليل', group: 'accounting', iconColor: 'text-purple-600 bg-purple-50' },
  assets: { label: 'الأصول الثابتة والإهلاكات', group: 'accounting', iconColor: 'text-purple-600 bg-purple-50' },
  hr: { label: 'الموارد البشرية والرواتب والسلف', group: 'hr', iconColor: 'text-cyan-600 bg-cyan-50' },
  manufacturing: { label: 'التصنيع وأوامر الإنتاج والجودة', group: 'manufacturing', iconColor: 'text-orange-600 bg-orange-50' },
  pos: { label: 'نقاط البيع وإدارة الشفتات', group: 'restaurant', iconColor: 'text-rose-600 bg-rose-50' },
  restaurant: { label: 'المطاعم والكافيهات والمطبخ', group: 'restaurant', iconColor: 'text-rose-600 bg-rose-50' },
  construction: { label: 'المقاولات والمشاريع والمستخلصات', group: 'projects', iconColor: 'text-indigo-600 bg-indigo-50' },
  hims: { label: 'المنظومة الطبية والمستشفيات', group: 'medical', iconColor: 'text-teal-600 bg-teal-50' },
  stadium: { label: 'الاستاد الرياضي والمركز الشبابي', group: 'stadium', iconColor: 'text-green-600 bg-green-50' },
  reports: { label: 'التقارير المالية والإحصائيات', group: 'reports', iconColor: 'text-sky-600 bg-sky-50' },
  admin: { label: 'إدارة النظام والأمان والنسخ', group: 'admin', iconColor: 'text-slate-700 bg-slate-100' }
};

// مجموعات التبويبات للفلترة
const filterGroups = [
  { id: 'all', label: 'جميع الصلاحيات' },
  { id: 'sensitive', label: '🚨 الصلاحيات الحساسة فقط' },
  { id: 'sales', label: 'المبيعات والعملاء' },
  { id: 'purchases', label: 'المشتريات والموردين' },
  { id: 'inventory', label: 'المخازن والأصناف' },
  { id: 'treasury', label: 'الخزينة والشيكات' },
  { id: 'accounting', label: 'المحاسبة والقيود' },
  { id: 'restaurant', label: 'نقاط البيع والمطاعم' },
  { id: 'hr', label: 'الموارد البشرية' },
  { id: 'manufacturing', label: 'التصنيع والإنتاج' },
  { id: 'stadium', label: 'الاستاد والمركز الشبابي' },
  { id: 'reports', label: 'التقارير المالية' },
  { id: 'admin', label: 'الأمان وإدارة النظام' }
];


// قوالب الأدوار الجاهزة (Role Presets)
const rolePresets: Record<string, { name: string; description: string; matchActions: (p: Permission) => boolean }> = {
  // 🛡️ 1. مسؤول عام ومدير النظام (Admin / General Manager)
  admin: {
    name: 'مسؤول عام ومدير النظام (Admin)',
    description: 'صلاحيات كاملة وغير مقيدة على كافة موديولات النظام المالية، التشغيلية، والإدارية',
    matchActions: () => true
  },

  // 📊 2. محاسب مالي عام (Accountant)
  accountant: {
    name: 'محاسب مالي عام (Accountant)',
    description: 'القيود اليومية، السندات، الحسابات، الخزينة والبنوك، الشيكات، التسويات البنكية، والتقارير المالية وقوائم الدخل',
    matchActions: (p) =>
      p.module === 'accounting' ||
      p.module === 'treasury' ||
      p.module === 'assets' ||
      (p.module === 'reports' && ['general_view', 'financial_statements', 'aging_reports', 'export_data'].includes(p.action)) ||
      (p.module === 'sales' && ['view', 'approve'].includes(p.action)) ||
      (p.module === 'purchases' && ['view', 'approve'].includes(p.action))
  },

  // 👁️ 3. مشاهدة وتقارير فقط (Viewer / Auditor)
  viewer: {
    name: 'مشاهدة وتقارير فقط (Viewer)',
    description: 'استعراض لوحات التحكم والتقارير المالية والمخزنية وكشوف الحسابات دون أي صلاحية للتعديل أو الإضافة',
    matchActions: (p) => p.action.includes('view') || p.action.includes('report')
  },

  // 🛒 4. رئيس الكاشيرية ومشرف نقطة البيع (Head Cashier & POS Supervisor)
  pos_supervisor: {
    name: 'رئيس الكاشيرية ومشرف نقطة البيع (Head Cashier)',
    description: 'اعتماد المرتجعات بمسح كارت المشرف، إلغاء الأصناف (Void Line/Sale)، سحب النقدية، إدارة الورديات، وطباعة الشارات',
    matchActions: (p) =>
      (p.module === 'retail' && ['pos', 'returns', 'void', 'cash_drop', 'promotions', 'supervisor_badge', 'price_checker', 'shifts_manage', 'view'].includes(p.action)) ||
      (p.module === 'pos' && ['open_shift', 'close_shift', 'view'].includes(p.action)) ||
      (p.module === 'sales' && ['view', 'create', 'return', 'credit_note', 'customer_statement'].includes(p.action)) ||
      (p.module === 'inventory' && ['view', 'stock_card', 'expiry_radar', 'shelf_restock', 'pda_stocktaking'].includes(p.action)) ||
      (p.module === 'products' && ['view', 'pricing', 'update'].includes(p.action)) ||
      (p.module === 'customers' && ['view', 'create'].includes(p.action)) ||
      (p.module === 'treasury' && ['receipt_create', 'view'].includes(p.action))
  },

  // 💵 5. كاشير نقطة بيع (POS Cashier)
  cashier: {
    name: 'كاشير نقطة بيع (POS Cashier)',
    description: 'فتح الشفت، مسح الباركود، إصدار الفواتير، سندات القبض، تعليق الفواتير (بدون صلاحية الحذف أو المرتجع إلا بالمشرف)',
    matchActions: (p) => 
      (p.module === 'pos' && ['open_shift', 'view'].includes(p.action)) ||
      (p.module === 'retail' && ['pos', 'price_checker', 'view'].includes(p.action)) ||
      (p.module === 'sales' && ['view', 'create'].includes(p.action)) ||
      (p.module === 'customers' && ['view', 'create'].includes(p.action)) ||
      (p.module === 'products' && p.action === 'view') ||
      (p.module === 'treasury' && ['receipt_create', 'view'].includes(p.action))
  },

  // 📦 6. أمين المخازن والمستودعات (Storekeeper)
  storekeeper: {
    name: 'أمين مخازن ومستودعات (Storekeeper)',
    description: 'إدارة المخزون، التحويلات بين الفروع، الجرد بالـ PDA، إثبات الهالك، ورادار الصلاحيات وإعادة التخزين بالرفوف',
    matchActions: (p) =>
      (p.module === 'products' && ['view', 'create', 'update'].includes(p.action)) ||
      (p.module === 'inventory' && ['view', 'transfer', 'adjustment', 'wastage', 'uom_manage', 'count', 'manage'].includes(p.action)) ||
      (p.module === 'purchases' && ['view', 'create'].includes(p.action))
  },

  // 💼 7. مسؤول ومندوب مبيعات (Sales Executive)
  sales: {
    name: 'مسؤول ومندوب مبيعات (Sales Rep)',
    description: 'فواتير المبيعات، عروض الأسعار، أوامر البيع، مرتجعات المبيعات، بطاقة العميل وكشف الحساب',
    matchActions: (p) =>
      (p.module === 'sales' && ['view', 'create', 'return', 'quotation'].includes(p.action)) ||
      (p.module === 'customers' && ['view', 'create', 'update'].includes(p.action)) ||
      (p.module === 'products' && p.action === 'view')
  },

  // 📈 8. مدير مبيعات (Sales Manager)
  sales_manager: {
    name: 'مدير مبيعات (Sales Manager)',
    description: 'صلاحيات كاملة على المبيعات، عروض الأسعار، منح الخصومات، والاطلاع على الأرباح والعملاء',
    matchActions: (p) =>
      p.module === 'sales' ||
      p.module === 'customers' ||
      (p.module === 'products' && p.action === 'view') ||
      (p.module === 'reports' && ['general_view', 'profit_margins', 'aging_reports', 'export_data'].includes(p.action))
  },

  // 🚚 9. مسؤول مشتريات وموردين (Purchasing Officer)
  purchasing_officer: {
    name: 'مسؤول مشتريات وموردين (Purchasing Officer)',
    description: 'أوامر الشراء، فواتير المشتريات، استيراد إكسيل الموردين، حسابات الموردين، ومقارنة الأسعار',
    matchActions: (p) =>
      p.module === 'purchases' ||
      p.module === 'suppliers' ||
      (p.module === 'products' && ['view', 'create'].includes(p.action)) ||
      (p.module === 'reports' && ['general_view', 'export_data'].includes(p.action))
  },

  // 👥 10. مسؤول موارد بشرية ورواتب (HR Specialist)
  hr_officer: {
    name: 'مسؤول موارد بشرية (HR Specialist)',
    description: 'إدارة الموظفين، مسير الرواتب، السلف والقروض، كشف حساب الموظف، وتقارير الحضور والغياب',
    matchActions: (p) =>
      p.module === 'hr' ||
      (p.module === 'reports' && ['general_view', 'export_data'].includes(p.action))
  },

  // 🍽️ 11. مدير المطعم والصالة (Restaurant General Manager)
  restaurant_manager: {
    name: 'مدير المطعم والصالة (Restaurant Manager)',
    description: 'تحكم تشغيلي ورقابي ومالي كامل: الصالة، المطبخ، التسعير، العروض، والتقارير التحليلية',
    matchActions: (p) =>
      p.module === 'restaurant' ||
      p.module === 'pos' ||
      (p.module === 'sales' && ['view', 'create', 'return', 'quotation', 'apply_discount', 'view_cost_profit', 'export'].includes(p.action)) ||
      (p.module === 'customers' && ['view', 'create', 'update', 'manage_balance'].includes(p.action)) ||
      (p.module === 'products' && ['view', 'create', 'update', 'edit_pricing'].includes(p.action)) ||
      (p.module === 'inventory' && ['view', 'transfer', 'adjustment', 'wastage'].includes(p.action)) ||
      (p.module === 'purchases' && ['view', 'create', 'po_manage'].includes(p.action)) ||
      (p.module === 'manufacturing' && ['view', 'bom_manage', 'scrap_record'].includes(p.action)) ||
      (p.module === 'treasury' && ['receipt_create', 'view'].includes(p.action)) ||
      (p.module === 'reports' && ['general_view', 'financial_statements', 'profit_margins', 'export_data'].includes(p.action))
  },

  // 🍽️ 12. كابتن الصالة والويتر المحمول (Floor Captain & Waiter)
  restaurant_waiter: {
    name: 'كابتن الصالة والويتر (Waiter & Captain)',
    description: 'واجهة الويتر المحمولة للهاتف، فتح الطاولات، تسجيل الطلبات بملاحظات الطهي وإرسالها للمطبخ',
    matchActions: (p) =>
      (p.module === 'restaurant' && ['pos', 'waiter', 'manage', 'split_bill', 'transfer_table'].includes(p.action)) ||
      (p.module === 'pos' && p.action === 'open_shift') ||
      (p.module === 'products' && p.action === 'view') ||
      (p.module === 'customers' && ['view', 'create'].includes(p.action))
  },

  // 🍽️ 13. شيف المطبخ التنفيذي ومسؤول التشغيل (Executive Chef)
  restaurant_chef: {
    name: 'شيف المطبخ التنفيذي (Executive Chef)',
    description: 'إدارة شاشات KDS و Expo، المحطات، المقادير والوصفات BOM، تفكيك اللحوم، وجرد نهاية اليوم للمطبخ',
    matchActions: (p) =>
      (p.module === 'restaurant' && ['kitchen', 'kitchen_view', 'manage', 'butchering_yield', 'auto_reorder'].includes(p.action)) ||
      (p.module === 'manufacturing' && ['view', 'bom_manage', 'order_create', 'material_issue', 'production_finish', 'scrap_record'].includes(p.action)) ||
      (p.module === 'inventory' && ['view', 'transfer', 'adjustment', 'wastage', 'uom_manage'].includes(p.action)) ||
      (p.module === 'products' && ['view', 'create', 'update'].includes(p.action)) ||
      (p.module === 'purchases' && ['view', 'create', 'po_manage'].includes(p.action))
  },

  // 🍽️ 14. طاهي المحطة ومساعد المطبخ (Station Cook / Line Cook)
  restaurant_cook: {
    name: 'طاهي المحطة (Line Cook / Station KDS)',
    description: 'عرض وتجهيز طلبات محطة الطهي المحددة (شواية، مقبلات، بيتزا) على شاشة KDS وإتمامها',
    matchActions: (p) =>
      (p.module === 'restaurant' && ['kitchen', 'kitchen_view'].includes(p.action)) ||
      (p.module === 'products' && p.action === 'view')
  },

  // 🍽️ 15. كابتن التوصيل والديليفري (Delivery Driver)
  restaurant_driver: {
    name: 'كابتن التوصيل (Delivery Driver & COD)',
    description: 'استلام طلبات التوصيل، متابعة عناوين وأرقام العملاء، وتوريد التحصيلات النقدية COD',
    matchActions: (p) =>
      (p.module === 'restaurant' && ['manage', 'pos', 'driver_dispatch'].includes(p.action)) ||
      (p.module === 'sales' && p.action === 'view') ||
      (p.module === 'customers' && p.action === 'view')
  }
};

const PermissionsManager = () => {
  const { refreshPermissions, currentUser } = useAuth();
  const { showToast } = useToast();

  // State
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [rolePermissions, setRolePermissions] = useState<Set<string>>(new Set());
  const [initialRolePermissions, setInitialRolePermissions] = useState<Set<string>>(new Set());
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  // UI & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [collapsedModules, setCollapsedModules] = useState<Record<string, boolean>>({});
  
  // Modals
  const [showNewRoleModal, setShowNewRoleModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [creatingRole, setCreatingRole] = useState(false);
  
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [installingRestaurantRoles, setInstallingRestaurantRoles] = useState(false);
  const [installingRetailRoles, setInstallingRetailRoles] = useState(false);

  // Fetch initial roles and permissions
  useEffect(() => {
    const orgId = currentUser?.organization_id || (currentUser as any)?.user_metadata?.org_id;
    if (!orgId) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError('');

        if (currentUser.role === 'demo') {
          const demoRoles: Role[] = [
            { id: 'demo-admin', name: 'admin', description: 'مدير النظام الكامل', is_system: true },
            { id: 'demo-accountant', name: 'accountant', description: 'محاسب عام', is_system: false },
            { id: 'demo-cashier', name: 'cashier', description: 'كاشير مبيعات', is_system: false },
            { id: 'demo-warehouse', name: 'warehouse', description: 'أمين مستودع', is_system: false }
          ];
          setRoles(demoRoles);
          setSelectedRoleId('demo-accountant');
          setLoading(false);
          return;
        }

        // Fetch Roles
        const { data: rolesData, error: rolesError } = await supabase
          .from('roles')
          .select('*')
          .eq('organization_id', orgId)
          .neq('name', 'super_admin')
          .order('name');

        if (rolesError) throw rolesError;
        setRoles(rolesData || []);

        // Fetch Permissions
        const { data: permsData, error: permsError } = await supabase
          .from('permissions')
          .select('*')
          .order('module');

        if (permsError) throw permsError;
        
        // فرز الصلاحيات حسب الموديول ثم وضع الحساسة بالأعلى ثم حسب الوصف
        const sortedPerms = (permsData || []).sort((a, b) => {
          if (a.module !== b.module) return a.module.localeCompare(b.module);
          if (Boolean(a.is_sensitive) !== Boolean(b.is_sensitive)) {
            return a.is_sensitive ? -1 : 1;
          }
          return (a.description || a.action).localeCompare(b.description || b.action, 'ar');
        });

        setPermissions(sortedPerms);

        if (rolesData && rolesData.length > 0 && !selectedRoleId) {
          setSelectedRoleId(rolesData[0].id.toString());
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentUser]);

  // Fetch permissions for the selected role
  useEffect(() => {
    const orgId = currentUser?.organization_id || (currentUser as any)?.user_metadata?.org_id;
    if (!selectedRoleId || !orgId) return;

    const fetchRolePermissions = async () => {
      try {
        const { data, error } = await supabase
          .from('role_permissions')
          .select('permission_id')
          .eq('role_id', selectedRoleId)
          .eq('organization_id', orgId);

        if (error) throw error;

        const perms = new Set(data?.map(p => p.permission_id.toString()) || []);
        setRolePermissions(perms);
        setInitialRolePermissions(new Set(perms));
      } catch (err: any) {
        console.error('Error fetching role permissions:', err);
      }
    };

    fetchRolePermissions();
  }, [selectedRoleId]);

  // Handle single permission toggle
  const handleTogglePermission = (permId: string) => {
    setRolePermissions(prev => {
      const next = new Set(prev);
      if (next.has(permId)) {
        next.delete(permId);
      } else {
        next.add(permId);
      }
      return next;
    });
  };

  // Toggle all permissions for a specific module
  const handleToggleModule = (modulePerms: Permission[]) => {
    const ids = modulePerms.map(p => p.id.toString());
    const allChecked = ids.every(id => rolePermissions.has(id));

    setRolePermissions(prev => {
      const next = new Set(prev);
      ids.forEach(id => {
        if (allChecked) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  };

  // Toggle Read-Only for a specific module
  const handleGrantModuleReadOnly = (modulePerms: Permission[]) => {
    const readIds = modulePerms
      .filter(p => ['view', 'read', 'list', 'general_view'].includes(p.action))
      .map(p => p.id.toString());

    setRolePermissions(prev => {
      const next = new Set(prev);
      readIds.forEach(id => next.add(id));
      return next;
    });
    showToast('تم منح صلاحيات القراءة والاستعراض لهذا الموديول', 'info');
  };

  // Toggle All Permissions in the system
  const handleToggleAll = () => {
    const allIds = filteredPermissions.map(p => p.id.toString());
    const isAllChecked = allIds.every(id => rolePermissions.has(id));

    setRolePermissions(prev => {
      const next = new Set(prev);
      allIds.forEach(id => {
        if (isAllChecked) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  };

  // Apply Role Preset Template
  const handleApplyPreset = (presetKey: string) => {
    const preset = rolePresets[presetKey];
    if (!preset) return;

    const matchingIds = permissions.filter(preset.matchActions).map(p => p.id.toString());
    setRolePermissions(new Set(matchingIds));
    setShowPresetModal(false);
    showToast(`تم تطبيق قالب "${preset.name}" بنجاح ✅ (يرجى حفظ التغييرات)`, 'success');
  };

  // Create New Role
  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim()) return;

    const orgId = currentUser?.organization_id || (currentUser as any)?.user_metadata?.org_id;
    if (!orgId) return;

    setCreatingRole(true);
    try {
      // Create role name slug
      const cleanName = newRoleName.trim().toLowerCase().replace(/\s+/g, '_');

      const { data, error } = await supabase
        .from('roles')
        .insert({
          name: cleanName,
          description: newRoleDesc.trim() || newRoleName.trim(),
          organization_id: orgId
        })
        .select()
        .single();

      if (error) throw error;

      showToast('تم إنشاء الدور الجديد بنجاح ✅', 'success');
      setRoles(prev => [...prev, data]);
      setSelectedRoleId(data.id);
      setShowNewRoleModal(false);
      setNewRoleName('');
      setNewRoleDesc('');
    } catch (err: any) {
      showToast('فشل إنشاء الدور: ' + err.message, 'error');
    } finally {
      setCreatingRole(false);
    }
  };

  // Delete Custom Role
  const handleDeleteRole = async (roleId: string, roleName: string) => {
    if (['admin', 'super_admin'].includes(roleName)) {
      showToast('لا يمكن حذف الأدوار النظامية الأساسية', 'warning');
      return;
    }

    if (!window.confirm(`هل أنت متأكد من حذف الدور "${roleName}"؟ سيتم تجريد كافة المستخدمين المرتبطين به.`)) {
      return;
    }

    try {
      const { error } = await supabase.from('roles').delete().eq('id', roleId);
      if (error) throw error;

      showToast('تم حذف الدور بنجاح', 'success');
      const updated = roles.filter(r => r.id !== roleId);
      setRoles(updated);
      if (selectedRoleId === roleId) {
        setSelectedRoleId(updated[0]?.id || null);
      }
    } catch (err: any) {
      showToast('فشل حذف الدور: ' + err.message, 'error');
    }
  };

  // 🍽️ One-Click Restaurant Roles & Permissions Provisioner
  const handleInstallRestaurantRoles = async () => {
    const orgId = currentUser?.organization_id || (currentUser as any)?.user_metadata?.org_id;
    if (!orgId) {
      showToast('لم يتم العثور على معرّف المنظمة', 'error');
      return;
    }

    if (!window.confirm('هل تريد تثبيت حزمة أدوار المطعم المتكاملة؟\nسيتم إنشاء وتحديث 6 أدوار تخصصية مع ربط صلاحياتها الدقيقة تلقائياً للمنظمة.')) {
      return;
    }

    setInstallingRestaurantRoles(true);
    try {
      // 1. Fetch fresh permissions from DB
      const { data: freshPerms } = await supabase.from('permissions').select('*');
      const allPerms: Permission[] = freshPerms || permissions;
      if (freshPerms) setPermissions(freshPerms);

      // 2. Provision each of the 6 roles
      const targetRoles = [
        { key: 'restaurant_manager', name: 'restaurant_manager', desc: 'مدير المطعم والصالة - تحكم تشغيلي ورقابي ومالي كامل' },
        { key: 'restaurant_cashier', name: 'restaurant_cashier', desc: 'كاشير المطعم - فتح الشفت، الجرد الأعمى، الفواتير والسندات' },
        { key: 'restaurant_waiter', name: 'restaurant_waiter', desc: 'كابتن الصالة والويتر - واجهة الويتر المحمولة، طاولات، وإرسال للمطبخ' },
        { key: 'restaurant_chef', name: 'restaurant_chef', desc: 'شيف المطبخ التنفيذي - شاشات KDS، المحطات، المقادير، وتفكيك اللحوم' },
        { key: 'restaurant_cook', name: 'restaurant_cook', desc: 'طاهي المحطة - عرض وتجهيز طلبات محطة الطهي KDS' },
        { key: 'restaurant_driver', name: 'restaurant_driver', desc: 'كابتن التوصيل - استلام الطلبات، تفاصيل العملاء، وتوريد النقدية COD' }
      ];

      const { data: existingRoles } = await supabase.from('roles').select('*').eq('organization_id', orgId);
      const rolesList = existingRoles || [];

      for (const rDef of targetRoles) {
        let roleObj = rolesList.find(r => r.name === rDef.key);

        if (!roleObj) {
          const { data: newRole, error: crtErr } = await supabase.from('roles').insert({
            name: rDef.key,
            description: rDef.desc,
            organization_id: orgId
          }).select().single();

          if (crtErr) {
            console.warn('Role creation notice:', crtErr);
            continue;
          }
          roleObj = newRole;
        }

        const preset = rolePresets[rDef.key];
        if (preset && roleObj) {
          const matchedIds = allPerms.filter(preset.matchActions).map(p => p.id.toString());
          await supabase.rpc('sync_role_permissions', {
            p_role_id: roleObj.id,
            p_permission_ids: matchedIds
          });
        }
      }

      // Reload updated roles list
      const { data: updatedRoles } = await supabase.from('roles').select('*').eq('organization_id', orgId);
      if (updatedRoles && updatedRoles.length > 0) {
        setRoles(updatedRoles);
        const mgr = updatedRoles.find(r => r.name === 'restaurant_manager');
        if (mgr) {
          setSelectedRoleId(mgr.id);
        }
      }

      showToast('تم بنجاح تثبيت وتفعيل حزمة أدوار المطعم الستة الجاهزة بصلاحياتها! 🍽️👑', 'success');
      await refreshPermissions();
    } catch (err: any) {
      console.error('Error installing restaurant roles:', err);
      showToast('فشل تثبيت الأدوار: ' + (err.message || 'خطأ غير متوقع'), 'error');
    } finally {
      setInstallingRestaurantRoles(false);
    }
  };

  // 🛒 One-Click Retail & Supermarket Roles Provisioner
  const handleInstallRetailRoles = async () => {
    const orgId = currentUser?.organization_id || (currentUser as any)?.user_metadata?.org_id;
    if (!orgId) {
      showToast('لم يتم العثور على معرّف المنظمة', 'error');
      return;
    }

    if (!window.confirm('هل تريد تثبيت حزمة أدوار السوبر ماركت والتجزئة؟\nسيتم إنشاء وتحديث أدوار (رئيس الكاشيرية، أمين المخزن، مندوب المبيعات) مع ربط صلاحياتها التلقائية.')) {
      return;
    }

    setInstallingRetailRoles(true);
    try {
      // 1. Fetch fresh permissions from DB
      const { data: freshPerms } = await supabase.from('permissions').select('*');
      const allPerms: Permission[] = freshPerms || permissions;
      if (freshPerms) setPermissions(freshPerms);

      // 2. Target retail roles
      const targetRoles = [
        { key: 'pos_supervisor', name: 'pos_supervisor', desc: 'رئيس الكاشيرية ومشرف نقطة البيع - اعتماد المرتجعات، كارت المشرف، إلغاء الأصناف، وإدارة الورديات' },
        { key: 'storekeeper', name: 'storekeeper', desc: 'أمين المخازن والمستودعات - الجرد، التحويلات، وتتبع الصلاحيات' },
        { key: 'sales', name: 'sales', desc: 'مسؤول ومندوب المبيعات - الفواتير، عروض الأسعار، وكشوف الحسابات' }
      ];

      const { data: existingRoles } = await supabase.from('roles').select('*').eq('organization_id', orgId);
      const rolesList = existingRoles || [];

      for (const rDef of targetRoles) {
        let roleObj = rolesList.find(r => r.name === rDef.key);

        if (!roleObj) {
          const { data: newRole, error: crtErr } = await supabase.from('roles').insert({
            name: rDef.key,
            description: rDef.desc,
            organization_id: orgId
          }).select().single();

          if (crtErr) {
            console.warn('Role creation notice:', crtErr);
            continue;
          }
          roleObj = newRole;
        }

        const preset = rolePresets[rDef.key];
        if (preset && roleObj) {
          const matchedIds = allPerms.filter(preset.matchActions).map(p => p.id.toString());
          await supabase.rpc('sync_role_permissions', {
            p_role_id: roleObj.id,
            p_permission_ids: matchedIds
          });
        }
      }

      // Reload updated roles list
      const { data: updatedRoles } = await supabase.from('roles').select('*').eq('organization_id', orgId);
      if (updatedRoles && updatedRoles.length > 0) {
        setRoles(updatedRoles);
        const sup = updatedRoles.find(r => r.name === 'pos_supervisor');
        if (sup) {
          setSelectedRoleId(sup.id);
        }
      }

      showToast('تم بنجاح تثبيت وتفعيل حزمة أدوار السوبر ماركت والتجزئة بصلاحياتها! 🛒👑', 'success');
      await refreshPermissions();
    } catch (err: any) {
      console.error('Error installing retail roles:', err);
      showToast('فشل تثبيت الأدوار: ' + (err.message || 'خطأ غير متوقع'), 'error');
    } finally {
      setInstallingRetailRoles(false);
    }
  };

  // Save Permissions via Atomic RPC
  const handleSave = async () => {
    if (!selectedRoleId) return;

    if (currentUser?.role === 'demo') {
      showToast('تم حفظ الصلاحيات بنجاح ✅ (محاكاة ديمو)', 'success');
      return;
    }

    setSaving(true);
    try {
      const permissionIds = Array.from(rolePermissions);

      if (permissionIds.length === 0 && !window.confirm('تحذير: هل أنت متأكد من رغبتك في سحب جميع الصلاحيات من هذا الدور؟')) {
        setSaving(false);
        return;
      }

      const { error: syncError } = await supabase.rpc('sync_role_permissions', {
        p_role_id: selectedRoleId,
        p_permission_ids: permissionIds
      });

      if (syncError) throw syncError;

      setInitialRolePermissions(new Set(rolePermissions));
      showToast('تم حفظ ومزامنة الصلاحيات بنجاح لجميع المستخدمين ✅', 'success');
      await refreshPermissions();
    } catch (err: any) {
      console.error('Save Permissions Error:', err);
      showToast('فشل الحفظ: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Filtered Permissions logic
  const filteredPermissions = useMemo(() => {
    return permissions.filter(p => {
      // Group filter
      if (selectedGroup === 'sensitive' && !p.is_sensitive) return false;
      if (selectedGroup !== 'all' && selectedGroup !== 'sensitive') {
        const meta = moduleMetadata[p.module];
        if (meta && meta.group !== selectedGroup && p.module !== selectedGroup) return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const descMatch = (p.description || '').toLowerCase().includes(query);
        const moduleMatch = (p.module || '').toLowerCase().includes(query);
        const actionMatch = (p.action || '').toLowerCase().includes(query);
        const labelMatch = (moduleMetadata[p.module]?.label || '').toLowerCase().includes(query);
        if (!descMatch && !moduleMatch && !actionMatch && !labelMatch) return false;
      }

      return true;
    });
  }, [permissions, selectedGroup, searchQuery]);

  // Group filtered permissions by module
  const groupedPermissions = useMemo(() => {
    const groups: Record<string, Permission[]> = {};
    filteredPermissions.forEach(p => {
      if (!groups[p.module]) groups[p.module] = [];
      groups[p.module].push(p);
    });
    return Object.entries(groups).sort((a, b) => {
      const labelA = moduleMetadata[a[0]]?.label || a[0];
      const labelB = moduleMetadata[b[0]]?.label || b[0];
      return labelA.localeCompare(labelB, 'ar');
    });
  }, [filteredPermissions]);

  const selectedRole = roles.find(r => r.id === selectedRoleId);
  const hasUnsavedChanges = useMemo(() => {
    if (rolePermissions.size !== initialRolePermissions.size) return true;
    for (const id of rolePermissions) {
      if (!initialRolePermissions.has(id)) return true;
    }
    return false;
  }, [rolePermissions, initialRolePermissions]);

  const coveragePercent = permissions.length > 0 
    ? Math.round((rolePermissions.size / permissions.length) * 100) 
    : 0;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[450px] p-8">
        <Loader2 className="animate-spin text-indigo-600 mb-4" size={48} />
        <h3 className="text-xl font-black text-slate-700">جاري تحميل مصفوفة الصلاحيات...</h3>
        <p className="text-slate-400 text-sm mt-1">يتم تحضير القواعد الأمنية المحدثة</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto animate-in fade-in space-y-6">
      
      {/* 👑 الرأس وشريط الإحصائيات والإجراءات الرئيسية */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="p-3.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl text-white shadow-md shadow-indigo-100">
            <Shield size={32} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-800">إدارة الأدوار والصلاحيات المؤسسية</h1>
              <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-xs font-bold border border-indigo-100">
                Enterprise RBAC
              </span>
            </div>
            <p className="text-slate-500 text-sm mt-1">
              تحديد دقيق وصارم لصلاحيات المستخدمين وعزل العمليات الحساسة لمنع الأخطاء وحماية البيانات.
            </p>
          </div>
        </div>

        {/* أزرار الإجراءات السريعة */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleInstallRestaurantRoles}
            disabled={installingRestaurantRoles}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-600 hover:to-rose-600 text-white rounded-xl font-bold text-sm transition-all shadow-md shadow-amber-500/20 disabled:opacity-50 active:scale-95"
            title="تثبيت وتهيئة الأدوار الستة المتخصصة للمطعم تلقائياً مع كافة الصلاحيات"
          >
            {installingRestaurantRoles ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <Utensils size={16} />
            )}
            <span>🍽️ حزمة أدوار المطعم (6 أدوار)</span>
          </button>

          {/* 🛒 زر تثبيت أدوار السوبرماركت والتجزئة */}
          <button
            onClick={handleInstallRetailRoles}
            disabled={installingRetailRoles}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl font-bold text-sm transition-all shadow-md shadow-indigo-500/20 disabled:opacity-50 active:scale-95"
            title="تثبيت وتهيئة أدوار السوبر ماركت والتجزئة (رئيس الكاشيرية، أمين المخزن، المبيعات)"
          >
            {installingRetailRoles ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <ShoppingCart size={16} />
            )}
            <span>🛒 أدوار السوبر ماركت (المشرف والمخزن)</span>
          </button>

          <button
            onClick={() => setShowPresetModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-bold text-sm transition-all shadow-sm"
            title="تطبيق قالب صلاحيات جاهز"
          >
            <Sparkles size={16} className="text-amber-500" />
            <span>قوالب جاهزة</span>
          </button>

          <button
            onClick={() => setShowNewRoleModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 rounded-xl font-bold text-sm transition-all"
          >
            <Plus size={16} />
            <span>دور جديد</span>
          </button>

          <button
            onClick={handleSave}
            disabled={saving || !selectedRoleId || !hasUnsavedChanges}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm shadow-md transition-all ${
              hasUnsavedChanges
                ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200 ring-2 ring-indigo-400 ring-offset-2 animate-pulse'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            <span>{hasUnsavedChanges ? 'حفظ التغييرات الآن' : 'تم حفظ كافة التغييرات'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-center gap-3">
          <AlertTriangle size={20} className="shrink-0" />
          <span className="font-bold">{error}</span>
        </div>
      )}

      {/* 🧭 تخطيط الشاشة: شريط الأدوار الجانبي + مصفوفة الصلاحيات التفصيلية */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* العمود الجانبي: قائمة الأدوار */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <div className="flex items-center gap-2 font-black text-slate-700 text-sm">
                <Layers size={18} className="text-indigo-600" />
                <span>الأدوار الوظيفية ({roles.length})</span>
              </div>
              <button
                onClick={() => setShowNewRoleModal(true)}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
              >
                <Plus size={14} /> إضافة
              </button>
            </div>

            <div className="divide-y divide-slate-100 max-h-[580px] overflow-y-auto">
              {roles.map(role => {
                const isSelected = selectedRoleId === role.id;
                return (
                  <div
                    key={role.id}
                    onClick={() => setSelectedRoleId(role.id)}
                    className={`p-4 transition-all cursor-pointer flex items-center justify-between group ${
                      isSelected 
                        ? 'bg-indigo-50/70 border-r-4 border-indigo-600 text-indigo-900' 
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">{role.description || role.name}</span>
                        {['admin', 'super_admin'].includes(role.name) && (
                          <span className="px-1.5 py-0.5 bg-slate-200 text-slate-600 text-[10px] font-bold rounded">
                            نظامي
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 font-mono mt-0.5">{role.name}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isSelected ? (
                        <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-sm">
                          <Check size={14} strokeWidth={3} />
                        </div>
                      ) : !['admin', 'super_admin'].includes(role.name) ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteRole(role.id, role.name);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          title="حذف الدور"
                        >
                          <Trash2 size={14} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* بطاقة إحصائيات الدور المختار */}
            {selectedRole && (
              <div className="p-4 bg-gradient-to-br from-slate-50 to-indigo-50/40 border-t border-slate-200">
                <div className="flex justify-between items-center text-xs font-bold text-slate-600 mb-1.5">
                  <span>الصلاحيات الممنوحة:</span>
                  <span className="font-mono text-indigo-700 font-black">
                    {rolePermissions.size} / {permissions.length} ({coveragePercent}%)
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all duration-300"
                    style={{ width: `${coveragePercent}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* تنبيه أمان توجيهي */}
          <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 text-xs text-amber-800 space-y-2">
            <div className="flex items-center gap-2 font-bold text-amber-900">
              <ShieldAlert size={16} className="text-amber-600" />
              <span>مبدأ الحد الأدنى من الصلاحيات</span>
            </div>
            <p className="leading-relaxed text-amber-700 font-medium">
              يُنصح دائماً بعدم منح صلاحيات <strong>كسر الأسعار، البيع بالسالب، ترحيل القيود، أو مسح السجلات</strong> إلا للمشرفين والمديرين المعتمدين لضمان دقة الرقابة المالية والمخزنية.
            </p>
          </div>
        </div>

        {/* العمود الرئيسي: مصفوفة واستكشاف الصلاحيات المفصلة */}
        <div className="lg:col-span-8 space-y-4">
          
          {/* شريط البحث والفلترة السريعة */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="relative flex-1 w-full">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  placeholder="ابحث عن صلاحية معينة (مثل: خصم، سعر، ترحيل، شيك، حذف، فاتورة)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pr-10 pl-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 font-bold"
                  >
                    مسح
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={handleToggleAll}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all"
                >
                  <CheckSquare size={14} />
                  <span>تحديد كل المعروض</span>
                </button>
                <button
                  onClick={() => setRolePermissions(new Set())}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold rounded-xl transition-all"
                >
                  <RotateCcw size={14} />
                  <span>إلغاء الكل</span>
                </button>
              </div>
            </div>

            {/* شريط تبويبات التصنيف */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
              {filterGroups.map(group => {
                const isActive = selectedGroup === group.id;
                const isSensitive = group.id === 'sensitive';
                return (
                  <button
                    key={group.id}
                    onClick={() => setSelectedGroup(group.id)}
                    className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                      isActive
                        ? isSensitive
                          ? 'bg-red-600 text-white shadow-sm'
                          : 'bg-indigo-600 text-white shadow-sm'
                        : isSensitive
                          ? 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {group.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* قائمة الموديولات والصلاحيات */}
          {groupedPermissions.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 border border-slate-200 text-center space-y-3">
              <Sliders size={40} className="mx-auto text-slate-300" />
              <h3 className="text-base font-bold text-slate-700">لا توجد صلاحيات تطابق معايير البحث أو الفلتر</h3>
              <p className="text-slate-400 text-xs">جرب مسح حقل البحث أو تغيير التبويب لعرض الصلاحيات الأخرى.</p>
              <button
                onClick={() => { setSearchQuery(''); setSelectedGroup('all'); }}
                className="text-xs text-indigo-600 font-bold hover:underline"
              >
                إعادة ضبط الفلاتر
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {groupedPermissions.map(([moduleKey, modulePerms]) => {
                const meta = moduleMetadata[moduleKey] || { label: moduleKey, iconColor: 'text-slate-600 bg-slate-50' };
                const isCollapsed = collapsedModules[moduleKey] || false;
                
                const grantedCount = modulePerms.filter(p => rolePermissions.has(p.id.toString())).length;
                const isAllGranted = grantedCount === modulePerms.length && modulePerms.length > 0;

                return (
                  <div key={moduleKey} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all">
                    
                    {/* رأس الموديول */}
                    <div className="p-4 bg-slate-50/80 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleToggleModule(modulePerms)}
                          className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${
                            isAllGranted
                              ? 'bg-indigo-600 text-white'
                              : grantedCount > 0
                                ? 'bg-indigo-100 text-indigo-600 border border-indigo-300'
                                : 'border border-slate-300 bg-white text-transparent hover:border-indigo-400'
                          }`}
                          title="تحديد أو إلغاء تحديد كافة صلاحيات هذا الموديول"
                        >
                          <Check size={14} strokeWidth={3} />
                        </button>

                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-slate-800 text-sm">{meta.label}</h3>
                            <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 bg-slate-200/70 text-slate-600 rounded">
                              {moduleKey}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5 font-medium">
                            مفعل: <span className="text-indigo-600 font-bold font-mono">{grantedCount}</span> من أصل <span className="font-mono">{modulePerms.length}</span> صلاحية
                          </div>
                        </div>
                      </div>

                      {/* أدوات الموديول السريعة */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleGrantModuleReadOnly(modulePerms)}
                          className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 text-[11px] font-bold rounded-lg transition-all flex items-center gap-1"
                          title="تفعيل صلاحيات الاستعراض والعرض فقط"
                        >
                          <Eye size={12} />
                          <span>عرض فقط</span>
                        </button>

                        <button
                          onClick={() => setCollapsedModules(prev => ({ ...prev, [moduleKey]: !isCollapsed }))}
                          className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                        >
                          {isCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                        </button>
                      </div>
                    </div>

                    {/* بنود الصلاحيات الدقيقة داخل الموديول */}
                    {!isCollapsed && (
                      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3 bg-white">
                        {modulePerms.map(perm => {
                          const isChecked = rolePermissions.has(perm.id.toString());
                          const isSensitive = perm.is_sensitive || false;

                          return (
                            <div
                              key={perm.id}
                              onClick={() => handleTogglePermission(perm.id.toString())}
                              className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3 select-none ${
                                isChecked
                                  ? isSensitive
                                    ? 'bg-red-50/50 border-red-200 text-red-950 shadow-xs'
                                    : 'bg-indigo-50/40 border-indigo-200 text-slate-900 shadow-xs'
                                  : 'bg-slate-50/50 border-slate-200 hover:border-slate-300 text-slate-600 opacity-80 hover:opacity-100'
                              }`}
                            >
                              <div
                                className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-all ${
                                  isChecked
                                    ? isSensitive
                                      ? 'bg-red-600 text-white'
                                      : 'bg-indigo-600 text-white'
                                    : 'border border-slate-300 bg-white text-transparent'
                                }`}
                              >
                                <Check size={12} strokeWidth={3} />
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className={`text-xs font-bold leading-snug ${isChecked ? 'text-slate-900' : 'text-slate-700'}`}>
                                    {perm.description || perm.action}
                                  </span>
                                  {isSensitive && (
                                    <span className="px-1.5 py-0.2 bg-red-100 text-red-700 border border-red-200 text-[9px] font-black rounded-full flex items-center gap-0.5">
                                      <Lock size={9} /> حساسة
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                  {perm.module}.{perm.action}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 🌟 نافذة إنشاء دور جديد (New Role Modal) */}
      {showNewRoleModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 space-y-5">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 font-black text-slate-800 text-lg">
                <Plus className="text-indigo-600" />
                <span>إنشاء دور وظيفي جديد</span>
              </div>
              <button 
                onClick={() => setShowNewRoleModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateRole} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  اسم الدور الوظيفي <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="مثال: كاشير فرع المعادي، محاسب تكاليف"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  وصف المسؤوليات والمهام
                </label>
                <textarea
                  rows={3}
                  placeholder="تحديد طبيعة عمل هذا الدور وحدود صلاحياته في المنظومة..."
                  value={newRoleDesc}
                  onChange={(e) => setNewRoleDesc(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewRoleModal(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-bold rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={creatingRole || !newRoleName.trim()}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl flex items-center gap-2 disabled:opacity-50"
                >
                  {creatingRole ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
                  <span>إنشاء الدور</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🌟 نافذة القوالب الجاهزة (Preset Templates Modal) */}
      {showPresetModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 space-y-5">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 font-black text-slate-800 text-lg">
                <Sparkles className="text-amber-500" />
                <span>قوالب الصلاحيات الجاهزة (One-Click Presets)</span>
              </div>
              <button 
                onClick={() => setShowPresetModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500">
              اختر أحد القوالب المعيارية لتطبيق مجموعة الصلاحيات المناسبة للدور المحدد حالياً بنقرة واحدة:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto p-1">
              {Object.entries(rolePresets).map(([key, preset]) => (
                <div
                  key={key}
                  onClick={() => handleApplyPreset(key)}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-indigo-50/40 hover:border-indigo-300 transition-all cursor-pointer group flex flex-col justify-between space-y-2"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-sm text-slate-800 group-hover:text-indigo-700">
                        {preset.name}
                      </h4>
                      <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                        تطبيق
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed mt-1 font-medium">
                      {preset.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowPresetModal(false)}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
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

export default PermissionsManager;
