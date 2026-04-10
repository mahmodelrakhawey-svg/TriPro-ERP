import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { Shield, Save, Check, AlertTriangle, Loader2, CheckSquare, Square, Info } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

// Types
type Role = {
  id: string;
  name: string;
  description: string;
};

type Permission = {
  id: string;
  module: string;
  action: string;
  description: string;
};

const moduleLabels: Record<string, string> = {
    treasury: 'الخزينة والبنوك',
    sales: 'المبيعات والعملاء',
    customers: 'إدارة العملاء',
    restaurant: 'مديول المطاعم',
    purchases: 'إدارة المشتريات',
    suppliers: 'إدارة الموردين',
    inventory: 'إدارة المخزون',
    products: 'الأصناف والمخزون',
    hr: 'الموارد البشرية والرواتب',
    accounting: 'المحاسبة العامة',
    reports: 'التقارير والإحصائيات',
    admin: 'الإدارة والصلاحيات',
    manufacturing: 'التصنيع والإنتاج',
    journal_entries: 'القيود اليومية',
    finance: 'الإدارة المالية'
};

const actionMap: Record<string, 'read' | 'add' | 'edit' | 'delete' | 'other'> = {
    view: 'read', read: 'read', list: 'read',
    create: 'add', add: 'add',
    update: 'edit', edit: 'edit',
    delete: 'delete', remove: 'delete',
    post: 'other', approve: 'other', print: 'other', 
    close: 'other', manage: 'other', cancel: 'other',
    void: 'other', revalue: 'other'
};

const PermissionsManager = () => {
  const { refreshPermissions, currentUser } = useAuth();
  const { showToast } = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [rolePermissions, setRolePermissions] = useState<Set<string>>(new Set()); // Set of permission IDs
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Fetch initial data
  useEffect(() => {
    const orgId = currentUser?.organization_id || (currentUser as any)?.user_metadata?.org_id;
    if (!orgId) return; // لا تبدأ الجلب إلا بعد توفر معرف المنظمة

    const fetchData = async () => {
      try {
        setLoading(true);
        setError('');
        if (currentUser.role === 'demo') {
             setRoles([{id: 'demo-role', name: 'Demo Role', description: 'دور تجريبي'}]);
             setPermissions([{id: '1', module: 'sales', action: 'create', description: 'إنشاء مبيعات'}]);
             setSelectedRoleId('demo-role');
             setLoading(false);
             return;
        }

        // Fetch Roles
        const { data: rolesData, error: rolesError } = await supabase
          .from('roles')
          .select('*')
          .eq('organization_id', orgId)
          .neq('name', 'super_admin') // Super admin has all permissions implicitly
          .order('name');
        
        if (rolesError) throw rolesError;
        setRoles(rolesData || []);

        // Fetch Permissions
        const { data: permsData, error: permsError } = await supabase
          .from('permissions')
          .select('*')
          .order('module, action');

        if (permsError) throw permsError;
        setPermissions(permsData || []);

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
  }, [currentUser]); // تحديث البيانات فور توفر المستخدم

  // Fetch role permissions when selected role changes
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
      } catch (err: any) {
        console.error('Error fetching role permissions:', err);
      }
    };

    fetchRolePermissions();
  }, [selectedRoleId]);

  const handleTogglePermission = (permId: string) => {
      const idStr = permId;
      setRolePermissions(prev => {
          const next = new Set(prev);
          if (next.has(idStr)) {
              next.delete(idStr);
          } else {
              next.add(idStr);
          }
          return next;
      });
  };

  const handleToggleModule = (moduleName: string, modulePerms: Permission[]) => {
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

  const handleToggleAll = () => {
      const allIds = permissions.map(p => p.id.toString());
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

  const handleSave = async () => {
      if (!selectedRoleId) return;

      if (currentUser?.role === 'demo') {
          showToast('تم حفظ الصلاحيات بنجاح ✅ (محاكاة - لن يتم حفظ التغييرات)', 'success');
          return;
      }

      setSaving(true);
      try {
          // Ensure IDs are unique integers and sorted
          // This ensures we send a clean array of numbers to the RPC
          const rawIds = Array.from(rolePermissions).filter(id => id !== null && id !== undefined);
          const permissionIds = [...new Set(rawIds)]; // التعامل مع UUID كنصوص مباشرة

          if (permissionIds.length === 0 && !window.confirm('هل أنت متأكد من رغبتك في سحب جميع الصلاحيات من هذا الدور؟')) {
              setSaving(false);
              return;
          }

          // 🚀 استدعاء دالة المزامنة لضمان تنفيذ العملية كوحدة واحدة (Transaction)
          // هذا يحل مشكلة الـ 409 Conflict نهائياً
          const { error: syncError } = await supabase.rpc('sync_role_permissions', {
              p_role_id: selectedRoleId,
              p_permission_ids: permissionIds
          });

          if (syncError) throw syncError;

          showToast('تم حفظ الصلاحيات بنجاح ✅', 'success');
          await refreshPermissions();
      } catch (err: any) {
          console.error("Save Permissions Error:", err);
          showToast('فشل الحفظ: ' + err.message, 'error');
      } finally {
          setSaving(false);
      }
  };

  // بناء المصفوفة: تجميع الصلاحيات حسب الموديول ثم حسب نوع العملية
  const moduleMatrix = useMemo(() => {
      const matrix: Record<string, Record<string, Permission[]>> = {};
      
      permissions.forEach(p => {
          if (!matrix[p.module]) matrix[p.module] = { read: [], add: [], edit: [], delete: [], other: [] };
          
          const cat = actionMap[p.action] || 'other';
          matrix[p.module][cat].push(p);
      });
      
      // ترتيب الموديولات حسب الاسم العربي
      return Object.entries(matrix).sort((a, b) => 
          (moduleLabels[a[0]] || a[0]).localeCompare(moduleLabels[b[0]] || b[0])
      );
  }, [permissions]);

  if (loading) return <div className="p-8 text-center">جاري التحميل...</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto animate-in fade-in">
        <div className="flex justify-between items-center mb-6">
            <div>
                <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                    <Shield className="text-indigo-600" /> إدارة الأدوار والصلاحيات
                </h1>
                <p className="text-slate-500 mt-1">تحديد ما يمكن لكل دور القيام به في النظام</p>
            </div>
            <div className="flex gap-2">
                <button 
                    onClick={handleToggleAll}
                    className="bg-slate-100 text-slate-700 px-4 py-2.5 rounded-lg font-bold hover:bg-slate-200 transition-colors"
                >
                    {permissions.every(p => rolePermissions.has(p.id.toString())) ? 'إلغاء اختيار الكل' : 'اختيار الكل'}
                </button>
                <button 
                    onClick={handleSave}
                    disabled={saving || !selectedRoleId}
                    className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-bold flex items-center gap-2 hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 disabled:opacity-50"
                >
                    {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                    <span>حفظ التغييرات</span>
                </button>
            </div>
        </div>

        {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6 flex items-center gap-2">
                <AlertTriangle size={20} /> {error}
            </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Roles List */}
            <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-fit">
                <div className="p-4 border-b border-slate-100 bg-slate-50 font-bold text-slate-700">
                    الأدوار الوظيفية
                </div>
                <div className="divide-y divide-slate-100">
                    {roles.map(role => (
                        <button
                            key={role.id}
                            onClick={() => setSelectedRoleId(role.id)}
                            className={`w-full text-right px-4 py-3 transition-colors hover:bg-slate-50 flex justify-between items-center
                                ${selectedRoleId === role.id ? 'bg-indigo-50 text-indigo-700 font-bold border-r-4 border-indigo-600' : 'text-slate-600'}
                            `}
                        >
                            <span>{role.description || role.name}</span>
                            {selectedRoleId === role.id && <Check size={16} />}
                        </button>
                    ))}
                </div>
            </div>

            {/* Permissions Grid */}
            <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                {!selectedRoleId ? (
                    <div className="text-center text-slate-400 py-12">اختر دوراً لعرض صلاحياته</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-right border-collapse">
                            <thead>
                                <tr className="bg-slate-50 text-slate-600 text-xs font-black uppercase border-b">
                                    <th className="p-4 border-l w-10"></th>
                                    <th className="p-4 border-l">الموديول / الميزة</th>
                                    <th className="p-4 border-l text-center w-24">مشاهدة</th>
                                    <th className="p-4 border-l text-center w-24">إضافة</th>
                                    <th className="p-4 border-l text-center w-24">تعديل</th>
                                    <th className="p-4 border-l text-center w-24">حذف</th>
                                    <th className="p-4 text-right">صلاحيات أخرى</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {moduleMatrix.map(([moduleName, categories]) => {
                                    const allModulePerms = Object.values(categories).flat();
                                    const isModuleFullyChecked = allModulePerms.every(p => rolePermissions.has(p.id.toString()));
                                    
                                    return (
                                        <tr key={moduleName} className="hover:bg-slate-50/50 group transition-colors">
                                            <td className="p-4 border-l">
                                                <button 
                                                    onClick={() => handleToggleModule(moduleName, allModulePerms)}
                                                    className={`p-1 rounded transition-colors ${isModuleFullyChecked ? 'text-indigo-600 bg-indigo-50' : 'text-slate-300 hover:text-indigo-400'}`}
                                                    title="تحديد الكل لهذا الموديول"
                                                >
                                                    {isModuleFullyChecked ? <CheckSquare size={18} /> : <Square size={18} />}
                                                </button>
                                            </td>
                                            <td className="p-4 border-l">
                                                <div className="font-bold text-slate-800">{moduleLabels[moduleName] || moduleName}</div>
                                                <div className="text-[10px] text-slate-400 font-mono uppercase">{moduleName}</div>
                                            </td>
                                            
                                            {/* أعمدة العمليات الأساسية */}
                                            {['read', 'add', 'edit', 'delete'].map(catKey => (
                                                <td key={catKey} className="p-4 border-l text-center">
                                                    <div className="flex flex-col gap-1 items-center justify-center">
                                                        {categories[catKey].map(p => (
                                                            <button
                                                                key={p.id}
                                                                onClick={() => handleTogglePermission(p.id)}
                                                                className={`w-6 h-6 rounded border flex items-center justify-center transition-all
                                                                    ${rolePermissions.has(p.id.toString()) 
                                                                        ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm' 
                                                                        : 'border-slate-200 bg-white text-transparent hover:border-emerald-300'}
                                                                `}
                                                                title={p.description}
                                                            >
                                                                <Check size={14} strokeWidth={4} />
                                                            </button>
                                                        ))}
                                                        {categories[catKey].length === 0 && <span className="text-slate-200">-</span>}
                                                    </div>
                                                </td>
                                            ))}

                                            <td className="p-4">
                                                <div className="flex flex-wrap gap-2">
                                                    {categories.other.map(p => (
                                                        <button
                                                            key={p.id}
                                                            onClick={() => handleTogglePermission(p.id)}
                                                            className={`flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-bold transition-all
                                                                ${rolePermissions.has(p.id.toString())
                                                                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                                                                    : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'}
                                                            `}
                                                        >
                                                            {p.description || p.action}
                                                            {rolePermissions.has(p.id.toString()) && <Check size={12} />}
                                                        </button>
                                                    ))}
                                                    {categories.other.length === 0 && <span className="text-slate-300 text-xs font-medium">لا يوجد</span>}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        
                        <div className="p-6 bg-slate-50 border-t border-slate-200">
                            <div className="flex items-start gap-3 text-slate-500 text-sm italic">
                                <Info size={18} className="shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-bold mb-1">تعليمات الصلاحيات:</p>
                                    <ul className="list-disc list-inside space-y-1">
                                        <li>تم ترتيب الصلاحيات في مصفوفة لسهولة التحكم (مشاهدة، إضافة، تعديل، حذف).</li>
                                        <li>يمكنك الضغط على المربع الصغير بجانب اسم الموديول لتحديد كافة صلاحياته دفعة واحدة.</li>
                                        <li>الحسابات من نوع Super Admin لديها كافة الصلاحيات تلقائياً ولن تظهر في هذه القائمة.</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};

export default PermissionsManager;
