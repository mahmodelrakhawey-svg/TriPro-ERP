import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { Shield, Save, Check, AlertTriangle, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

// Types
type Role = {
  id: string;
  name: string;
  description: string;
};

type Permission = {
  id: number;
  module: string;
  action: string;
  description: string;
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
    const fetchData = async () => {
      try {
        setLoading(true);
        if (currentUser?.role === 'demo') {
             setRoles([{id: 'demo-role', name: 'Demo Role', description: 'دور تجريبي'}]);
             setPermissions([{id: 1, module: 'sales', action: 'create', description: 'إنشاء مبيعات'}]);
             setSelectedRoleId('demo-role');
             setLoading(false);
             return;
        }

        // Fetch Roles
        const { data: rolesData, error: rolesError } = await supabase
          .from('roles')
          .select('*')
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

        if (rolesData && rolesData.length > 0) {
            setSelectedRoleId(rolesData[0].id);
        }

      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Fetch role permissions when selected role changes
  useEffect(() => {
    if (!selectedRoleId) return;

    const fetchRolePermissions = async () => {
      try {
        const { data, error } = await supabase
          .from('role_permissions')
          .select('permission_id')
          .eq('role_id', selectedRoleId);

        if (error) throw error;

        const perms = new Set(data?.map(p => p.permission_id.toString()) || []);
        setRolePermissions(perms);
      } catch (err: any) {
        console.error('Error fetching role permissions:', err);
      }
    };

    fetchRolePermissions();
  }, [selectedRoleId]);

  const handleTogglePermission = (permId: number) => {
      const idStr = permId.toString();
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

  const handleSave = async () => {
      if (!selectedRoleId) return;

      if (currentUser?.role === 'demo') {
          showToast('تم حفظ الصلاحيات بنجاح ✅ (محاكاة - لن يتم حفظ التغييرات)', 'success');
          return;
      }

      setSaving(true);
      try {
          // 1. Delete existing permissions for this role
          const { error: deleteError } = await supabase
              .from('role_permissions')
              .delete()
              .eq('role_id', selectedRoleId);
          
          if (deleteError) throw deleteError;

          // 2. Insert new permissions
          if (rolePermissions.size > 0) {
              const newPerms = Array.from(rolePermissions).map(pId => ({
                  role_id: selectedRoleId,
                  permission_id: parseInt(pId)
              }));

              const { error: insertError } = await supabase
                  .from('role_permissions')
                  .insert(newPerms);
              
              if (insertError) throw insertError;
          }

          showToast('تم حفظ الصلاحيات بنجاح ✅', 'success');
          await refreshPermissions();
      } catch (err: any) {
          showToast('فشل الحفظ: ' + err.message, 'error');
      } finally {
          setSaving(false);
      }
  };

  // Group permissions by module
  const groupedPermissions = permissions.reduce((acc, perm) => {
      if (!acc[perm.module]) acc[perm.module] = [];
      acc[perm.module].push(perm);
      return acc;
  }, {} as Record<string, Permission[]>);

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
            <button 
                onClick={handleSave}
                disabled={saving || !selectedRoleId}
                className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-bold flex items-center gap-2 hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                <span>حفظ التغييرات</span>
            </button>
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
            <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                {!selectedRoleId ? (
                    <div className="text-center text-slate-400 py-12">اختر دوراً لعرض صلاحياته</div>
                ) : (
                    <div className="space-y-8">
                        {Object.entries(groupedPermissions).map(([module, perms]) => (
                            <div key={module}>
                                <h3 className="font-bold text-lg text-slate-800 mb-3 pb-2 border-b border-slate-100 capitalize flex items-center gap-2">
                                    <span className="w-2 h-8 bg-indigo-500 rounded-full"></span>
                                    {module}
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {perms.map(perm => (
                                        <label 
                                            key={perm.id} 
                                            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all
                                                ${rolePermissions.has(perm.id.toString()) 
                                                    ? 'bg-indigo-50 border-indigo-200 shadow-sm' 
                                                    : 'bg-white border-slate-200 hover:border-indigo-200'}
                                            `}
                                        >
                                            <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors
                                                ${rolePermissions.has(perm.id.toString()) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'}
                                            `}>
                                                {rolePermissions.has(perm.id.toString()) && <Check size={12} className="text-white" />}
                                            </div>
                                            <input 
                                                type="checkbox" 
                                                className="hidden"
                                                checked={rolePermissions.has(perm.id.toString())}
                                                onChange={() => handleTogglePermission(perm.id)}
                                            />
                                            <div>
                                                <div className="font-bold text-sm text-slate-700">{perm.description || perm.action}</div>
                                                <div className="text-xs text-slate-400 font-mono">{perm.action}</div>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};

export default PermissionsManager;
