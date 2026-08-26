import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { User, UserRole } from '../types';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { ADMIN_USER_ID, DEMO_USER_ID, DEMO_EMAIL } from '../utils/constants'; // Removed z import
import { sanitizeHtml } from '../utils/securityGuards';
import { LoginSchema, validateData } from '../utils/securityValidation';

interface Profile {
  id: string;
  full_name?: string | null;
  email?: string | null;
  role?: string | null;
  is_active?: boolean | null;
  organization_id?: string | null;
  role_id?: string | null;
}

interface RolePermissionJoin {
  permissions: {
    module: string;
    action: string;
  } | null;
}

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
      const { data: profiles, error } = await supabase.from('profiles').select('*') as {
        data: Profile[] | null;
        error: unknown;
      };
      
      if (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error fetching profiles:', error);
        }
        return;
      }

      if (profiles) {
        const mappedUsers: User[] = profiles.map((p) => ({
          id: p.id,
          name: sanitizeHtml(p.full_name || p.email || (p.id === DEMO_USER_ID ? 'مستخدم ديمو' : `مستخدم (${p.id.slice(0, 8)})`)),
          username: p.email || (p.id === DEMO_USER_ID ? DEMO_EMAIL : `user_${p.id.slice(0, 8)}`),
          role: (p.role || 'viewer') as UserRole,
          is_active: p.is_active ?? true
        }));
        
        // إضافة المدير العام الافتراضي للقائمة
        const adminUser: User = {
            id: ADMIN_USER_ID,
            name: 'المدير العام',
            username: 'admin',
            role: 'super_admin',
            is_active: true
        };

        // دمج المدير العام مع المستخدمين من قاعدة البيانات
        const filteredMapped = mappedUsers.filter((u) => u.id !== adminUser.id);
        setUsers([adminUser, ...filteredMapped]);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Error fetching users:", error);
      }
      // Fail silently in production
    }
  }, []);

  // دالة معالجة أخطاء التوكن والجلسة التالفة
  const handleAuthError = useCallback(async (error: unknown) => {
    if (!error) return;

    const errObj = error as { message?: string; status?: number; code?: string };
    // التحقق من أن الخطأ متعلق بتوكن التحديث (Refresh Token) أو خطأ 400 الشهير
    const isTokenError = 
      errObj.message?.includes('Refresh Token Not Found') || 
      errObj.message?.includes('Invalid Refresh Token') ||
      errObj.status === 400 || 
      errObj.code === 'refresh_token_not_found';

    if (isTokenError) {
      if (process.env.NODE_ENV === 'development') {
        console.warn("TriPro-ERP Safety: اكتشاف جلسة تالفة، يتم تنظيف البيانات وإعادة التوجيه...");
      }

      // 1. مسح كل ما يتعلق بسوبابيز من الذاكرة المحلية للمتصفح
      Object.keys(localStorage).forEach(key => {
        if (key.includes('supabase.auth.token')) {
          localStorage.removeItem(key);
        }
      });

      // 2. محاولة تسجيل الخروج برمجياً لتصفية حالة المكتبة
      try { await supabase.auth.signOut(); } catch (e) { /* ignore */ }

      // 3. إعادة التوجيه لصفحة تسجيل الدخول
      window.location.href = '/login';
    }
  }, []);

  const handleAuthChange = useCallback(async (user: SupabaseUser | null) => {
    setIsLoading(true);
    if (user) {
      try {
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle() as { data: Profile | null };
        
        const email = (user.email || profile?.email || '').toLowerCase();
        // فرض دور demo للمستخدم المحدد
        const isDemoUser = email === DEMO_EMAIL || user.id === DEMO_USER_ID;
        
        // تحديد الدور: الديمو أولاً، ثم البيانات الوصفية، ثم البروفايل، وأخيراً admin كافتراضي للمنشئ
        const roleName = isDemoUser ? 'demo' : (user.user_metadata?.role || user.user_metadata?.app_role || profile?.role || 'admin');
        
        if (profile) {
          setCurrentUser({
            id: user.id,
            name: profile.full_name || user.email || '',
            username: user.email || '',
            role: roleName as UserRole,
            is_active: profile.is_active ?? true,
            organization_id: profile.organization_id || user.user_metadata?.org_id || undefined
          });
        } else {
           // Fallback للمستخدمين الجدد الذين لم تكتمل بيانات ملفهم الشخصي بعد
           setCurrentUser({
            id: user.id,
            name: (user.user_metadata?.full_name as string) || user.email || '',
            username: user.email || '',
            role: roleName as UserRole,
            is_active: true,
            organization_id: (user.user_metadata?.org_id as string) || undefined
          });
        }
        setUserRole(roleName);

        // تحسين أمان SaaS: منع الدخول إذا لم تكن المنظمة موجودة (إلا للديمو والمسؤول العام)
        if (roleName !== 'super_admin' && roleName !== 'demo' && !profile?.organization_id && !user.user_metadata?.org_id && user.email !== 'admin') {
            if (process.env.NODE_ENV === 'development') console.error("Critical Security: User has no assigned organization_id");
            setAuthInitialized(true);
            setIsLoading(false);
            return;
        }

        // تعيين الصلاحيات بناءً على الدور
        if (roleName === 'super_admin' || roleName === 'admin') {
            // صمام أمان ذهبي: نمنح الأدمن *.* دائماً لضمان ظهور الأزرار (إضافة عميل/مورد)
            setUserPermissions(new Set(['*.*']));
        } else if (roleName === 'demo') {
            setUserPermissions(new Set(['*.view', '*.read', '*.create', '*.update', '*.list', '*.*']));
        } else if (roleName === 'viewer') {
            setUserPermissions(new Set(['*.view', '*.read', '*.list']));
        } else {
            if (profile?.role_id) {
                const { data: rolePerms } = await supabase.from('role_permissions').select('permissions(module, action)').eq('role_id', profile.role_id) as { data: RolePermissionJoin[] | null };
                setUserPermissions(new Set(rolePerms?.map((p) => p.permissions && `${p.permissions.module}.${p.permissions.action}`).filter(Boolean) as string[] || []));
            } else {
                setUserPermissions(new Set(['*.*']));
            }
        }

        await fetchUsers();
      } catch (error: unknown) {
        if (process.env.NODE_ENV === 'development') console.error("Error handling auth change:", error);
        setCurrentUser(null);
      }
    } else {
      setCurrentUser(null);
      setUserRole(null);
      setUserPermissions(new Set());
    }
    setAuthInitialized(true);
    setIsLoading(false);
  }, [fetchUsers]);

  // جلب المستخدمين عند بدء التشغيل
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      handleAuthChange(session?.user || null);
    });

    // Initial check
    supabase.auth.getSession().then(({ data: { session }, error }) => {
        if (error) {
            handleAuthError(error);
            return;
        }

        if (!session) {
            setAuthInitialized(true);
            setIsLoading(false);
        }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [handleAuthChange, fetchUsers, handleAuthError]);

  const login = async (email: string, password: string) => {
    // special case: demo account may use a weak password that does not pass normal validation
    const sanitizedEmailRaw = sanitizeHtml(email.toLowerCase());
    let finalEmail = sanitizedEmailRaw;
    let finalPassword = password;

    if (sanitizedEmailRaw !== DEMO_EMAIL) {
      // Validate and sanitize input for normal users
      const validation = validateData<{ email: string; password: string }>(
        LoginSchema,
        { email: sanitizedEmailRaw, password }
      );

      if (!validation.success) {
        return { success: false, message: validation.errors?.[0] || 'بيانات غير صحيحة' };
      }

      finalEmail = validation.data!.email;
      finalPassword = validation.data!.password;
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: finalEmail,
        password: finalPassword
      });
      
      if (error) {
        // Don't expose internal error details in production
        if (process.env.NODE_ENV === 'development') {
          console.error('Login error:', error);
        }
        return { success: false, message: 'بيانات الدخول غير صحيحة' };
      }
      return { success: true };
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Login exception:', error);
      }
      return { success: false, message: 'حدث خطأ في تسجيل الدخول' };
    }
  };

  const logout = async () => {
    // التحقق مما إذا كان المستخدم الحالي هو مستخدم الديمو
    const isDemo = userRole === 'demo';

    // 🛡️ تسريع عملية الخروج: مسح الحالة محلياً فوراً لمنع "طلبات الأشباح" (401 Errors)
    setCurrentUser(null);
    setUserRole(null);
    setUserPermissions(new Set());
    setIsLoading(false);

    // 🧹 تنظيف يدوي للتوكنات لضمان عدم بقاء جلسة تالفة (Identity Gap Fix)
    Object.keys(localStorage).forEach(key => {
      if (key.includes('supabase.auth.token')) {
        localStorage.removeItem(key);
      }
    });

    // تنفيذ تسجيل الخروج من سوبابايز
    await supabase.auth.signOut();

    // إذا كان المستخدم هو الديمو، قم بإعادة تعيين البيانات بعد الخروج
    if (isDemo) {
      try {
        await supabase.functions.invoke('reset-demo');
      } catch (error) {
        console.error('Failed to reset demo data:', error);
      }
    }

    // 🚀 تحويل فوري وقسري لصفحة تسجيل الدخول لضمان تنظيف كافة العمليات في المتصفح
    window.location.href = '/login';
  };

  const can = (module: string, action: string): boolean => {
    // السماح للمدير العام ومدير المنظمة والمالك والمدير بالوصول الكامل
    if (userRole === 'super_admin' || userRole === 'admin' || userRole === 'owner' || userRole === 'manager') return true;    

    // المدير الطبي يمتلك صلاحية كاملة على موديول المستشفيات
    if (userRole === 'medical_director' && (module === 'hims' || module.startsWith('hims'))) {
      return true;
    }

    // 🏟️ أدوار قطاع الاستاد والمنشآت الرياضية
    if (userRole === 'stadium_director' && (module === 'stadium' || module.startsWith('stadium'))) {
      return true;
    }

    if (userRole === 'stadium_receptionist') {
      if (['stadium/members', 'stadium/bookings', 'stadium/programs', 'stadium/gate-scanner'].some(m => module === m || module.startsWith(m))) {
        return action !== 'delete';
      }
      if (module === 'stadium') return true;
    }

    if (userRole === 'stadium_booking_officer') {
      if (['stadium/bookings', 'stadium/facilities'].some(m => module === m || module.startsWith(m))) {
        return true;
      }
      if (module === 'stadium') return true;
    }

    if (userRole === 'stadium_gate_security') {
      if (module === 'stadium/gate-scanner' || module === 'stadium') {
        return true;
      }
      return false;
    }

    if (userRole === 'stadium_maintenance_lead') {
      if (['stadium/maintenance', 'stadium/facilities'].some(m => module === m || module.startsWith(m))) {
        return true;
      }
      if (module === 'stadium') return true;
    }

    if (userRole === 'stadium_sports_supervisor') {
      if (['stadium/programs', 'stadium/coaches', 'stadium/tournaments', 'stadium/reports'].some(m => module === m || module.startsWith(m))) {
        return true;
      }
      if (module === 'stadium') return true;
    }
    
    // تحسين قيود الديمو: منع الحذف ومنع تعديل الإعدادات الحساسة
    if (userRole === 'demo') {
        if (action === 'delete') return false; // ممنوع الحذف نهائياً
        if (module === 'settings' && action === 'update') return false; // ممنوع تعديل إعدادات الشركة
        return true; // مسموح باقي العمليات (إنشاء، عرض، طباعة)
    }
    
    // ✅ دعم الرموز الشاملة (Wildcards) والتحقق الموسع
    if (userPermissions.has(`${module}.${action}`)) return true;
    if (userPermissions.has(`${module}.*`)) return true;
    if (userPermissions.has(`*.${action}`)) return true;
    if (userPermissions.has(`*.*`)) return true;

    // إذا كان المطلوب هو العرض (view)، وتتوفر لدى المستخدم أي صلاحية إدارة أو إنشاء في الموديول
    if (action === 'view') {
      if (userPermissions.has(`${module}.manage`) || 
          userPermissions.has(`${module}.create`) || 
          userPermissions.has(`${module}.pos`) || 
          userPermissions.has(`${module}.kitchen`)) {
        return true;
      }
    }

    // توافق موديول المطعم ونقاط البيع
    if (module === 'restaurant') {
      if (userPermissions.has('restaurant.pos') || 
          userPermissions.has('restaurant.kitchen') || 
          userPermissions.has('restaurant.manage') ||
          userPermissions.has('sales.view')) {
        return true;
      }
    }

    return false;
  };

  const refreshPermissions = async () => {
    if (currentUser) {
        // إعادة تحميل صلاحيات المستخدم الحالي
        await handleAuthChange({ id: currentUser.id, email: currentUser.username } as unknown as SupabaseUser);
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