import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { User } from '../types';
import { ADMIN_USER_ID, DEMO_USER_ID, DEMO_EMAIL } from '../utils/constants';
import { sanitizeHtml } from '../utils/securityGuards';
import { LoginSchema, validateData } from '../utils/securityValidation';

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
      const { data: profiles, error } = await supabase.from('profiles').select('*');
      
      if (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error fetching profiles:', error);
        }
        return;
      }

      if (profiles) {
        const mappedUsers = profiles.map((p: any) => ({
          id: p.id,
          name: sanitizeHtml(p.full_name || p.email || (p.id === DEMO_USER_ID ? 'مستخدم ديمو' : `مستخدم (${p.id.slice(0, 8)})`)),
          username: p.email || (p.id === DEMO_USER_ID ? DEMO_EMAIL : `user_${p.id.slice(0, 8)}`),
          role: p.role || 'viewer',
          is_active: p.is_active ?? true
        }));
        
        // إضافة المدير العام الافتراضي للقائمة
        const adminUser = {
            id: ADMIN_USER_ID,
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
      if (process.env.NODE_ENV === 'development') {
        console.error("Error fetching users:", error);
      }
      // Fail silently in production
    }
  }, []);

  // دالة معالجة أخطاء التوكن والجلسة التالفة
  const handleAuthError = useCallback(async (error: any) => {
    if (!error) return;

    // التحقق من أن الخطأ متعلق بتوكن التحديث (Refresh Token) أو خطأ 400 الشهير
    const isTokenError = 
      error.message?.includes('Refresh Token Not Found') || 
      error.message?.includes('Invalid Refresh Token') ||
      error.status === 400 || 
      error.code === 'refresh_token_not_found';

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

  const handleAuthChange = useCallback(async (user: any) => {
    setIsLoading(true);
    if (user) {
      try {
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
        
        const email = (user.email || profile?.email || '').toLowerCase();
        // فرض دور demo للمستخدم المحدد
        const isDemoUser = email === DEMO_EMAIL || user.id === DEMO_USER_ID;
        
        // تحديد الدور: الديمو أولاً، ثم البيانات الوصفية، ثم البروفايل، وأخيراً admin كافتراضي للمنشئ
        const roleName = isDemoUser ? 'demo' : (user.user_metadata?.role || user.user_metadata?.app_role || profile?.role || 'admin');
        
        if (profile) {
          setCurrentUser({
            id: user.id,
            name: profile.full_name || user.email,
            username: user.email,
            role: roleName as any,
            is_active: profile.is_active ?? true,
            organization_id: profile.organization_id || user.user_metadata?.org_id || undefined
          });
        } else {
           // Fallback للمستخدمين الجدد الذين لم تكتمل بيانات ملفهم الشخصي بعد
           setCurrentUser({
            id: user.id,
            name: user.user_metadata?.full_name || user.email,
            username: user.email,
            role: roleName as any,
            is_active: true,
            organization_id: user.user_metadata?.org_id || undefined
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
            const { data: allPerms } = await supabase.from('permissions').select('module, action');
            // صمام أمان ذهبي: نمنح الأدمن *.* دائماً لضمان ظهور الأزرار (إضافة عميل/مورد)
            setUserPermissions(new Set(['*.*']));
        } else if (roleName === 'demo') {
            setUserPermissions(new Set(['*.view', '*.read', '*.create', '*.update', '*.list', '*.*']));
        } else if (roleName === 'viewer') {
            setUserPermissions(new Set(['*.view', '*.read', '*.list']));
        } else {
            if (profile?.role_id) {
                const { data: rolePerms } = await supabase.from('role_permissions').select('permissions(module, action)').eq('role_id', profile.role_id);
                setUserPermissions(new Set(rolePerms?.map((p: any) => p.permissions && `${p.permissions.module}.${p.permissions.action}`) || []));
            } else {
                setUserPermissions(new Set(['*.*']));
            }
        }

        await fetchUsers();
      } catch (error: any) {
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
    // السماح للمدير العام ومدير المنظمة بالوصول الكامل
    if (userRole === 'super_admin' || userRole === 'admin') return true;    
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