import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import {
  User, Shield, Save, Loader2, Search, CheckSquare, Square,
  ChevronDown, ChevronUp, UserCheck, Info, RotateCcw, AlertTriangle
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';

// ─── Types ────────────────────────────────────────────────────────────────────
type ProfileUser = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  role_id: string | null;
  is_active: boolean | null;
};

type Permission = {
  id: string;
  module: string;
  action: string;
  description: string;
  is_sensitive?: boolean;
};

type RoleInfo = {
  id: string;
  name: string;
  description: string;
};

// ─── Module Labels ─────────────────────────────────────────────────────────────
const moduleLabels: Record<string, string> = {
  sales: 'المبيعات والفواتير',
  customers: 'إدارة العملاء والديون',
  purchases: 'المشتريات وأوامر الشراء',
  suppliers: 'إدارة الموردين والأسعار',
  products: 'الأصناف والمنتجات',
  inventory: 'المستودعات والجرد',
  treasury: 'الخزينة والبنوك',
  accounting: 'المحاسبة العامة والقيود',
  assets: 'الأصول الثابتة',
  hr: 'الموارد البشرية والرواتب',
  manufacturing: 'التصنيع والإنتاج',
  pos: 'نقاط البيع',
  restaurant: 'المطاعم والكافيهات',
  reports: 'التقارير المالية',
  admin: 'إدارة النظام',
  construction: 'المقاولات والمشاريع',
  hims: 'المنظومة الطبية',
  stadium: 'الاستاد والمنشآت الرياضية',
};

// ─── Component ─────────────────────────────────────────────────────────────────
const UserPermissionsEditor: React.FC = () => {
  const { currentUser: authUser, users: authUsers, refreshPermissions } = useAuth();
  const { currentSelectedOrgId } = useAccounting();
  const { showToast } = useToast();

  // Data
  const [profileUsers, setProfileUsers] = useState<ProfileUser[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [roleMap, setRoleMap] = useState<Record<string, RoleInfo>>({});

  // Selection
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [rolePermissions, setRolePermissions] = useState<Set<string>>(new Set());   // IDs موروثة من الدور
  const [directPermissions, setDirectPermissions] = useState<Set<string>>(new Set()); // IDs مباشرة للمستخدم
  const [initialDirectPerms, setInitialDirectPerms] = useState<Set<string>>(new Set());

  // UI
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedModules, setCollapsedModules] = useState<Record<string, boolean>>({});

  const effectiveOrgId = currentSelectedOrgId || authUser?.organization_id || (authUser as any)?.user_metadata?.org_id;

  // ─── Initial Data Load ───────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // 1. جلب المستخدمين
        let users: ProfileUser[] = [];

        if (authUser?.role === 'demo') {
          users = [
            { id: 'demo-u1', full_name: 'مستخدم تجريبي (مدير)', email: 'admin@company.com', role: 'admin', role_id: null, is_active: true },
            { id: 'demo-u3', full_name: 'محاسب المبيعات', email: 'sales@company.com', role: 'accountant', role_id: null, is_active: true }
          ];
        } else {
          // محاولة جلب المستخدمين بفلترة المنظمة إذا وجدت، وإلا جلب الكل (خصوصاً للسوبر أدمن)
          let query = supabase
            .from('profiles')
            .select('id, full_name, email, role, role_id, is_active, organization_id')
            .order('full_name');

          if (effectiveOrgId && effectiveOrgId !== 'null' && authUser?.role !== 'super_admin') {
            query = query.eq('organization_id', effectiveOrgId);
          }

          const { data: dbUsers, error: usersErr } = await query;

          if (!usersErr && dbUsers && dbUsers.length > 0) {
            users = dbUsers;
          } else {
            // Fallback: جلب كافة المستخدمين
            const { data: allUsers } = await supabase
              .from('profiles')
              .select('id, full_name, email, role, role_id, is_active, organization_id')
              .order('full_name');
            users = allUsers || [];
          }

          // Fallback إضافي: من قائمة مستخدمي AuthContext
          if (users.length === 0 && authUsers && authUsers.length > 0) {
            users = authUsers.map(u => ({
              id: u.id,
              full_name: u.name,
              email: u.username,
              role: u.role,
              role_id: null,
              is_active: u.is_active ?? true
            }));
          }
        }

        setProfileUsers(users);

        // 2. جلب كل الصلاحيات
        const { data: perms } = await supabase
          .from('permissions')
          .select('*')
          .order('module');
        setPermissions(perms || []);

        // 3. جلب الأدوار
        let rolesQuery = supabase
          .from('roles')
          .select('id, name, description, organization_id');

        if (effectiveOrgId && authUser?.role !== 'super_admin') {
          rolesQuery = rolesQuery.eq('organization_id', effectiveOrgId);
        }

        let { data: rData } = await rolesQuery;
        if (!rData || rData.length === 0) {
          const { data: allRoles } = await supabase
            .from('roles')
            .select('id, name, description, organization_id');
          rData = allRoles;
        }

        const map: Record<string, RoleInfo> = {};
        (rData || []).forEach(r => { map[r.id] = r; });
        setRoleMap(map);

        if (users.length > 0) {
          setSelectedUserId(prev => prev && users.some(u => u.id === prev) ? prev : users[0].id);
        }
      } catch (err: any) {
        console.error('UserPermissionsEditor loading error:', err);
        showToast('فشل تحميل البيانات: ' + err.message, 'error');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [effectiveOrgId, authUser?.role, authUsers]);

  // ─── Load Selected User's Permissions ────────────────────────────────────────
  useEffect(() => {
    if (!selectedUserId) return;

    const loadUserPerms = async () => {
      const selectedUser = profileUsers.find(u => u.id === selectedUserId);

      // تحديد role_id المناسب سواء كان محفوظاً كمعرّف أو نبحث عنه باسم الدور
      let targetRoleId = selectedUser?.role_id;
      if (!targetRoleId && selectedUser?.role) {
        const matchedRole = Object.values(roleMap).find(r => r.name === selectedUser.role);
        if (matchedRole) {
          targetRoleId = matchedRole.id;
        }
      }

      // صلاحيات الدور (موروثة — للعرض فقط)
      if (targetRoleId) {
        const { data: rPerms } = await supabase
          .from('role_permissions')
          .select('permission_id')
          .eq('role_id', targetRoleId);
        setRolePermissions(new Set(rPerms?.map(p => p.permission_id) || []));
      } else {
        setRolePermissions(new Set());
      }

      // الصلاحيات المباشرة (قابلة للتعديل)
      const { data: uPerms } = await supabase
        .from('user_permissions')
        .select('permission_id')
        .eq('user_id', selectedUserId)
        .eq('granted', true);
      const directSet = new Set(uPerms?.map(p => p.permission_id) || []);
      setDirectPermissions(new Set(directSet));
      setInitialDirectPerms(new Set(directSet));
    };

    loadUserPerms();
  }, [selectedUserId, profileUsers, roleMap]);

  // ─── Toggle a single direct permission ───────────────────────────────────────
  const toggleDirect = (permId: string) => {
    // لا يمكن تعديل الصلاحيات الموروثة من الدور من هنا
    if (rolePermissions.has(permId)) return;

    setDirectPermissions(prev => {
      const next = new Set(prev);
      if (next.has(permId)) next.delete(permId);
      else next.add(permId);
      return next;
    });
  };

  // ─── Toggle entire module (direct only) ──────────────────────────────────────
  const toggleModule = (modulePerms: Permission[]) => {
    const editableIds = modulePerms
      .map(p => p.id)
      .filter(id => !rolePermissions.has(id)); // فقط غير الموروثة

    const allChecked = editableIds.every(id => directPermissions.has(id));

    setDirectPermissions(prev => {
      const next = new Set(prev);
      editableIds.forEach(id => {
        if (allChecked) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  };

  // ─── Save ─────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      const permIds = Array.from(directPermissions);

      // 1. محاولة استخدام الـ RPC أولاً
      const { error: rpcError } = await supabase.rpc('sync_user_permissions', {
        p_user_id: selectedUserId,
        p_permission_ids: permIds
      });

      if (rpcError) {
        console.warn('RPC sync_user_permissions failed, using table fallback:', rpcError);
        // Fallback مباشر: حذف ثم إعادة إدخال
        const { error: delError } = await supabase
          .from('user_permissions')
          .delete()
          .eq('user_id', selectedUserId);

        if (delError) throw delError;

        if (permIds.length > 0) {
          const rows = permIds.map(pid => ({
            user_id: selectedUserId,
            permission_id: pid,
            granted: true
          }));
          const { error: insError } = await supabase
            .from('user_permissions')
            .upsert(rows, { onConflict: 'user_id,permission_id' });
          if (insError) throw insError;
        }
      }

      setInitialDirectPerms(new Set(directPermissions));
      showToast('تم حفظ الصلاحيات المباشرة للمستخدم بنجاح ✅', 'success');

      // إذا كان المستخدم الحالي هو نفسه المُعدَّل، نحدِّث الصلاحيات فوراً
      if (selectedUserId === authUser?.id) {
        await refreshPermissions();
      }
    } catch (err: any) {
      showToast('فشل الحفظ: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ─── Reset ───────────────────────────────────────────────────────────────────
  const handleReset = () => {
    setDirectPermissions(new Set(initialDirectPerms));
  };

  // ─── Clear All Direct Permissions ────────────────────────────────────────────
  const handleClearAll = async () => {
    if (!selectedUserId) return;
    if (!window.confirm('هل تريد إزالة كافة الصلاحيات المباشرة لهذا المستخدم؟ سيبقى بصلاحيات دوره فقط.')) return;

    setSaving(true);
    try {
      const { error: rpcError } = await supabase.rpc('sync_user_permissions', {
        p_user_id: selectedUserId,
        p_permission_ids: []
      });

      if (rpcError) {
        const { error: delError } = await supabase
          .from('user_permissions')
          .delete()
          .eq('user_id', selectedUserId);
        if (delError) throw delError;
      }

      setDirectPermissions(new Set());
      setInitialDirectPerms(new Set());
      showToast('تم مسح الصلاحيات المباشرة. المستخدم يملك صلاحيات دوره فقط.', 'info');
    } catch (err: any) {
      showToast('فشل المسح: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ─── Filtering & Grouping ────────────────────────────────────────────────────
  const filteredPermissions = useMemo(() => {
    if (!searchQuery.trim()) return permissions;
    const q = searchQuery.toLowerCase();
    return permissions.filter(p =>
      (p.description || '').toLowerCase().includes(q) ||
      p.module.includes(q) ||
      p.action.includes(q) ||
      (moduleLabels[p.module] || '').includes(q)
    );
  }, [permissions, searchQuery]);

  const groupedPermissions = useMemo(() => {
    const groups: Record<string, Permission[]> = {};
    filteredPermissions.forEach(p => {
      if (!groups[p.module]) groups[p.module] = [];
      groups[p.module].push(p);
    });
    return Object.entries(groups).sort(([a], [b]) =>
      (moduleLabels[a] || a).localeCompare(moduleLabels[b] || b, 'ar')
    );
  }, [filteredPermissions]);

  const hasUnsaved = useMemo(() => {
    if (directPermissions.size !== initialDirectPerms.size) return true;
    for (const id of directPermissions) {
      if (!initialDirectPerms.has(id)) return true;
    }
    return false;
  }, [directPermissions, initialDirectPerms]);

  const selectedUser = profileUsers.find(u => u.id === selectedUserId);
  const selectedRole = selectedUser?.role_id
    ? roleMap[selectedUser.role_id]
    : (selectedUser?.role ? Object.values(roleMap).find(r => r.name === selectedUser.role) : null);

  // ─── Render ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin ml-2" />
        <span>جاري تحميل البيانات...</span>
      </div>
    );
  }

  return (
    <div className="flex gap-4 h-full min-h-0" dir="rtl">
      {/* ── Sidebar: User List ── */}
      <aside className="w-64 flex-shrink-0 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
        <div className="p-3 border-b border-slate-100 bg-slate-50">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
            <User className="w-4 h-4 text-indigo-500" />
            اختر مستخدماً
          </h3>
        </div>
        <div className="overflow-y-auto flex-1">
          {profileUsers.length === 0 ? (
            <p className="text-xs text-slate-400 p-4 text-center">لا يوجد مستخدمون</p>
          ) : (
            profileUsers.map(u => (
              <button
                key={u.id}
                onClick={() => setSelectedUserId(u.id)}
                className={`w-full text-right px-3 py-2.5 text-sm border-b border-slate-100 transition-colors flex flex-col gap-0.5 ${
                  selectedUserId === u.id
                    ? 'bg-indigo-50 text-indigo-700 font-semibold border-r-2 border-r-indigo-500'
                    : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                <span className="truncate">{u.full_name || u.email || `مستخدم (${u.id.slice(0, 8)})`}</span>
                <span className="text-xs text-slate-400 truncate">{u.role || 'بدون دور'}</span>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* ── Main Panel ── */}
      <div className="flex-1 flex flex-col min-h-0 bg-white border border-slate-200 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 bg-gradient-to-l from-indigo-50 to-white">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <UserCheck className="w-5 h-5 text-indigo-600" />
                <h2 className="text-base font-bold text-slate-800">
                  {selectedUser?.full_name || selectedUser?.email || '—'}
                </h2>
                {selectedUser && !selectedUser.is_active && (
                  <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">معطَّل</span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                <span>الدور الأساسي: <span className="font-medium text-slate-700">{selectedRole?.description || selectedUser?.role || '—'}</span></span>
                <span className="text-slate-300">|</span>
                <span>صلاحيات الدور: <span className="font-medium text-blue-600">{rolePermissions.size}</span></span>
                <span className="text-slate-300">|</span>
                <span>صلاحيات مباشرة: <span className="font-medium text-indigo-600">{directPermissions.size}</span></span>
              </div>
            </div>
            {/* Action Buttons */}
            <div className="flex gap-2 flex-wrap">
              {hasUnsaved && (
                <button
                  onClick={handleReset}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  تراجع
                </button>
              )}
              <button
                onClick={handleClearAll}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                مسح الكل
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !hasUnsaved}
                className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
                  hasUnsaved
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                حفظ الصلاحيات
              </button>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-3 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-3.5 h-3.5 rounded border-2 border-blue-400 bg-blue-100 flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-sm bg-blue-500" />
              </div>
              <span className="text-slate-500">موروثة من الدور (للعرض فقط)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3.5 h-3.5 rounded border-2 border-indigo-500 bg-indigo-100 flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-sm bg-indigo-600" />
              </div>
              <span className="text-slate-500">صلاحية مباشرة (قابلة للتعديل)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3.5 h-3.5 rounded border-2 border-slate-300" />
              <span className="text-slate-500">غير ممنوحة</span>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="بحث في الصلاحيات..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pr-9 pl-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
        </div>

        {/* Info Banner */}
        <div className="mx-4 mt-3 mb-1 p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex gap-2 text-xs text-amber-800">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" />
          <span>
            الصلاحيات المباشرة هي <strong>إضافية</strong> فوق صلاحيات الدور. لا يمكنك <strong>سحب</strong> صلاحية موروثة من هنا — عدِّل الدور للقيام بذلك.
          </span>
        </div>

        {/* Permissions Grid */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {groupedPermissions.length === 0 ? (
            <div className="text-center text-slate-400 py-12">
              <Shield className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>لا توجد صلاحيات تطابق البحث</p>
            </div>
          ) : (
            groupedPermissions.map(([module, modulePerms]) => {
              const isCollapsed = collapsedModules[module] ?? false;

              // إحصاء حالة كل صلاحية في هذا الموديول
              const inheritedCount = modulePerms.filter(p => rolePermissions.has(p.id)).length;
              const directCount = modulePerms.filter(p => !rolePermissions.has(p.id) && directPermissions.has(p.id)).length;
              const editableIds = modulePerms.filter(p => !rolePermissions.has(p.id)).map(p => p.id);
              const allEditableChecked = editableIds.length > 0 && editableIds.every(id => directPermissions.has(id));

              return (
                <div key={module} className="border border-slate-200 rounded-xl overflow-hidden">
                  {/* Module Header */}
                  <div
                    className="flex items-center justify-between px-3 py-2.5 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => setCollapsedModules(prev => ({ ...prev, [module]: !isCollapsed }))}
                  >
                    <div className="flex items-center gap-2">
                      {isCollapsed ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronUp className="w-4 h-4 text-slate-400" />}
                      <span className="font-semibold text-sm text-slate-700">
                        {moduleLabels[module] || module}
                      </span>
                      <div className="flex gap-1.5 text-xs">
                        {inheritedCount > 0 && (
                          <span className="bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">
                            {inheritedCount} موروثة
                          </span>
                        )}
                        {directCount > 0 && (
                          <span className="bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full">
                            {directCount} مباشرة
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Select all editable in module */}
                    {editableIds.length > 0 && (
                      <button
                        onClick={e => { e.stopPropagation(); toggleModule(modulePerms); }}
                        className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 px-2 py-0.5 rounded hover:bg-indigo-50 transition-colors"
                      >
                        {allEditableChecked ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                        {allEditableChecked ? 'إلغاء الكل' : 'تحديد الكل'}
                      </button>
                    )}
                  </div>

                  {/* Permissions in module */}
                  {!isCollapsed && (
                    <div className="divide-y divide-slate-100">
                      {modulePerms.map(perm => {
                        const isInherited = rolePermissions.has(perm.id);
                        const isDirect = directPermissions.has(perm.id);
                        const isGranted = isInherited || isDirect;

                        return (
                          <label
                            key={perm.id}
                            className={`flex items-center gap-3 px-3 py-2 transition-colors ${
                              isInherited
                                ? 'bg-blue-50/50 cursor-default opacity-75'
                                : 'hover:bg-slate-50 cursor-pointer'
                            }`}
                          >
                            {/* Checkbox */}
                            <div className="flex-shrink-0">
                              {isInherited ? (
                                // Inherited — disabled checkbox
                                <div className="w-4 h-4 rounded border-2 border-blue-300 bg-blue-100 flex items-center justify-center">
                                  <div className="w-2 h-2 rounded-sm bg-blue-400" />
                                </div>
                              ) : (
                                <input
                                  type="checkbox"
                                  checked={isDirect}
                                  onChange={() => toggleDirect(perm.id)}
                                  className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
                                />
                              )}
                            </div>

                            {/* Description */}
                            <div className="flex-1 min-w-0">
                              <span className={`text-sm ${isGranted ? 'text-slate-800 font-medium' : 'text-slate-600'}`}>
                                {perm.description || `${perm.module}.${perm.action}`}
                              </span>
                              {perm.is_sensitive && (
                                <span className="mr-2 text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">حساسة</span>
                              )}
                            </div>

                            {/* Source badge */}
                            <div className="flex-shrink-0 text-xs">
                              {isInherited && (
                                <span className="text-blue-500 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                                  من الدور
                                </span>
                              )}
                              {!isInherited && isDirect && (
                                <span className="text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                                  مباشرة ✦
                                </span>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Sticky Save Footer */}
        {hasUnsaved && (
          <div className="border-t border-amber-200 bg-amber-50 px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-sm text-amber-700 flex items-center gap-1.5">
              <Info className="w-4 h-4" />
              لديك تغييرات غير محفوظة
            </span>
            <div className="flex gap-2">
              <button
                onClick={handleReset}
                className="px-3 py-1.5 text-sm text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                تراجع
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                حفظ الآن
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserPermissionsEditor;
