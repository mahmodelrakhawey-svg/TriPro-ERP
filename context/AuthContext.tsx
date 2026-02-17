import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { User } from '../types';

interface AuthContextType {
  currentUser: User | null;
  users: User[];
  userRole: string | null;
  userPermissions: Set<string>;
  authInitialized: boolean;
  isLoading: boolean;
  login: (username: string, pin: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  can: (module: string, action: string) => boolean;
  refreshPermissions: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userPermissions, setUserPermissions] = useState<Set<string>>(new Set());
  const [authInitialized, setAuthInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // دالة لجلب قائمة المستخدمين
  const fetchUsers = useCallback(async () => {
    try {
      const { data: profiles } = await supabase.from('profiles').select('*');
      if (profiles) {
        const mappedUsers = profiles.map((p: any) => ({
          id: p.id,
          name: p.full_name || p.email || (p.id === 'f95ae857-91fb-4637-8c6a-7fe45e8fa005' ? 'مستخدم ديمو' : `مستخدم (${p.id.slice(0, 8)})`),
          username: p.email || (p.id === 'f95ae857-91fb-4637-8c6a-7fe45e8fa005' ? 'demo@demo.com' : `user_${p.id.slice(0, 8)}`),
          role: p.role || 'viewer',
          is_active: p.is_active ?? true
        }));
        
        // إضافة المدير العام الافتراضي للقائمة
        const adminUser = {
            id: '00000000-0000-0000-0000-000000000000',
            name: 'المدير العام',
            username: 'admin',
            role: 'super_admin',
            is_active: true
        };

        // دمج المدير العام مع المستخدمين من قاعدة البيانات
        const filteredMapped = mappedUsers.filter((u: any) => u.id !== adminUser.id);
        setUsers([adminUser as any, ...filteredMapped]);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  }, []);

  const handleAuthChange = useCallback(async (user: any) => {
    setIsLoading(true);
    if (user) {
      try {
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        // قراءة الدور من metadata أولاً (للتعامل مع الديمو)، ثم من البروفايل، ثم الافتراضي
        const metaRole = user.user_metadata?.app_role;
        
        // فرض دور demo للمستخدم المحدد إذا كان هو المستخدم الحالي
        const isDemoUser = user.id === 'f95ae857-91fb-4637-8c6a-7fe45e8fa005';
        const roleName = isDemoUser ? 'demo' : (metaRole || profile?.role || 'viewer');

        if (profile) {
          setCurrentUser({
            id: user.id,
            name: profile.full_name || user.email,
            username: user.email,
            role: roleName, // سيأخذ 'demo' إذا كان موجوداً في metadata
            is_active: profile.is_active ?? true
          });
          setUserRole(roleName);

          if (roleName === 'super_admin') {
            const { data: allPerms } = await supabase.from('permissions').select('module, action');
            setUserPermissions(new Set(allPerms?.map(p => `${p.module}.${p.action}`) || []));
          } else if (roleName === 'demo') {
             // صلاحيات الديمو: عرض، إنشاء، تعديل (بدون حذف أو إعدادات)
             setUserPermissions(new Set(['*.view', '*.read', '*.create', '*.update', '*.list', '*.*']));
          } else if (roleName === 'viewer') {
             // ✅ إضافة صلاحيات المشاهدة فقط: عرض وقراءة وقوائم فقط لكافة المديولات
             setUserPermissions(new Set(['*.view', '*.read', '*.list']));
          } else {
            if (profile.role_id) {
                const { data: rolePerms } = await supabase.from('role_permissions').select('permissions(module, action)').eq('role_id', profile.role_id);
                setUserPermissions(new Set(rolePerms?.map((p: any) => p.permissions && `${p.permissions.module}.${p.permissions.action}`) || []));
            } else {
                // إذا لم يكن هناك دور محدد، لا تمنح أي صلاحيات
                setUserPermissions(new Set());
            }
          }
        }
      } catch (error) {
        console.error("Error handling auth change:", error);
        setCurrentUser(null);
      }
    } else {
      setCurrentUser(null);
      setUserRole(null);
      setUserPermissions(new Set());
    }
    setAuthInitialized(true);
    setIsLoading(false);
  }, []);

  // جلب المستخدمين عند بدء التشغيل
  useEffect(() => {
    fetchUsers();
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      handleAuthChange(session?.user || null);
    });

    // Initial check
    supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) {
            setAuthInitialized(true);
            setIsLoading(false);
        }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [handleAuthChange, fetchUsers]);

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { success: false, message: error.message };
    return { success: true };
  };

  const logout = async () => {
    // التحقق مما إذا كان المستخدم الحالي هو مستخدم الديمو
    const isDemo = userRole === 'demo';

    await supabase.auth.signOut();
    setCurrentUser(null); // يتم تحديث الحالة فوراً لتسريع تجربة الخروج

    // إذا كان المستخدم هو الديمو، قم بإعادة تعيين البيانات بعد الخروج
    if (isDemo) {
      try {
        // استدعاء الدالة السحابية لإعادة تعيين البيانات
        await supabase.functions.invoke('reset-demo');
      } catch (error) {
        console.error('Failed to reset demo data:', error);
      }
    }
  };

  const can = (module: string, action: string): boolean => {
    if (userRole === 'super_admin') return true;
    
    // تحسين قيود الديمو: منع الحذف ومنع تعديل الإعدادات الحساسة
    if (userRole === 'demo') {
        if (action === 'delete') return false; // ممنوع الحذف نهائياً
        if (module === 'settings' && action === 'update') return false; // ممنوع تعديل إعدادات الشركة
        return true; // مسموح باقي العمليات (إنشاء، عرض، طباعة)
    }
    
    // ✅ دعم الرموز الشاملة (Wildcards) للتحقق من الصلاحيات
    if (userPermissions.has(`${module}.${action}`)) return true;
    if (userPermissions.has(`${module}.*`)) return true;
    if (userPermissions.has(`*.${action}`)) return true;
    if (userPermissions.has(`*.*`)) return true;

    return false;
  };

  const refreshPermissions = async () => {
    if (currentUser) {
        // إعادة تحميل صلاحيات المستخدم الحالي
        await handleAuthChange({ id: currentUser.id, email: currentUser.username });
        // إعادة تحميل قائمة المستخدمين
        await fetchUsers();
    }
  };

  const value = {
    currentUser,
    users,
    userRole,
    userPermissions,
    authInitialized,
    isLoading,
    login,
    logout,
    can,
    refreshPermissions
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};