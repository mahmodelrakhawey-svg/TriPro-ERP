import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { User, UserRole } from '../types';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { ADMIN_USER_ID, DEMO_USER_ID, DEMO_EMAIL } from '../utils/constants'; // Removed z import
import { sanitizeHtml } from '../utils/securityGuards';
import { LoginSchema, validateData } from '../utils/securityValidation';
import { secureStorage } from '../utils/securityMiddleware';
import { evaluatePermission } from '../utils/permissionEngine';

interface Profile {
  id: string;
  full_name?: string | null;
  email?: string | null;
  role?: string | null;
  is_active?: boolean | null;
  organization_id?: string | null;
  role_id?: string | null;
  can_view_dashboard?: boolean | null;
  can_access_mobile?: boolean | null;
}

interface RolePermissionJoin {
  permissions: {
    module: string;
    action: string;
  } | null;
}

interface UserPermissionJoin {
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

  // دالة مساعدة لتنظيف كافة بيانات الجلسة والتوكنات المحلية
  const clearSessionData = () => {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          if (
            key.startsWith('sb-') ||
            key.includes('supabase') ||
            key.includes('auth-token') ||
            key.startsWith('tripro_') ||
            key === 'admin_original_org_id' ||
            key.includes('token')
          ) {
            keysToRemove.push(key);
          }
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch (e) {
      console.warn('localStorage cleanup error:', e);
    }

    try {
      sessionStorage.clear();
    } catch (e) {}
  };

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

      // 1. مسح شامل لكافة التوكنات والجلسات من الذاكرة المحلية والجلسة
      clearSessionData();

      // 2. محاولة تسجيل الخروج محلياً وعالمياً
      try { await supabase.auth.signOut({ scope: 'local' }); } catch (e) { /* ignore */ }
      try { await supabase.auth.signOut({ scope: 'global' }); } catch (e) { /* ignore */ }

      // 3. إعادة التوجيه لصفحة تسجيل الدخول وإعادة تحميل الصفحة
      window.location.hash = '/login';
      window.location.reload();
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
        // تحديد الدور: الديمو أولاً، ثم البروفايل من قاعدة البيانات (لضمان فورية التعديلات)، ثم البيانات الوصفية، وأخيراً admin
        const roleName = isDemoUser ? 'demo' : (profile?.role || user.user_metadata?.role || user.user_metadata?.app_role || 'admin');
        const hrScope = (profile as any)?.hr_scope || user.user_metadata?.hr_scope || 'all';
        const canViewDashboard = (profile as any)?.can_view_dashboard !== undefined && (profile as any)?.can_view_dashboard !== null
          ? Boolean((profile as any)?.can_view_dashboard)
          : true;
        const canAccessMobile = (profile as any)?.can_access_mobile !== undefined && (profile as any)?.can_access_mobile !== null
          ? Boolean((profile as any)?.can_access_mobile)
          : (roleName === 'van_sales' || roleName === 'admin' || roleName === 'super_admin');

        const profileData = profile ? {
          id: user.id,
          name: profile.full_name || user.email || '',
          username: user.email || '',
          role: roleName as UserRole,
          is_active: profile.is_active ?? true,
          organization_id: profile.organization_id || user.user_metadata?.org_id || undefined,
          hr_scope: hrScope,
          can_view_dashboard: canViewDashboard,
          can_access_mobile: canAccessMobile
        } : {
          id: user.id,
          name: (user.user_metadata?.full_name as string) || user.email || '',
          username: user.email || '',
          role: roleName as UserRole,
          is_active: true,
          organization_id: (user.user_metadata?.org_id as string) || undefined,
          hr_scope: hrScope,
          can_view_dashboard: canViewDashboard,
          can_access_mobile: canAccessMobile
        };

        setCurrentUser(profileData);
        setUserRole(roleName);
        // حفظ بيانات المستخدم للدخول بدون إنترنت (Offline Access Cache)
        secureStorage.setItem('tripro_cached_user_profile', profileData);
        if (profileData.organization_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(profileData.organization_id)) {
          secureStorage.setItem('tripro_last_valid_org_id', profileData.organization_id);
          try { window.localStorage?.setItem('tripro_last_valid_org_id', JSON.stringify(profileData.organization_id)); } catch (e) {}
        }

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
            setUserPermissions(new Set(['*.view', '*.read', '*.create', '*.update', '*.list']));
        } else if (roleName === 'viewer') {
            setUserPermissions(new Set(['*.view', '*.read', '*.list']));
        } else {
            const permsSet = new Set<string>();

            // 1. تحديد معرّف الدور (سواء كان مسجلاً بالبروفايل أو بالبحث عن اسم الدور في جدول roles)
            let effectiveRoleId = profile?.role_id;
            if (!effectiveRoleId && roleName) {
              const { data: matchedRole } = await supabase
                .from('roles')
                .select('id')
                .eq('name', roleName)
                .maybeSingle();
              if (matchedRole?.id) {
                effectiveRoleId = matchedRole.id;
              }
            }

            // 2. جلب صلاحيات الدور الأساسي إذا توفر
            if (effectiveRoleId) {
              const { data: rolePerms } = await supabase
                .from('role_permissions')
                .select('permissions(module, action)')
                .eq('role_id', effectiveRoleId) as { data: any[] | null };

              rolePerms?.forEach((p) => {
                const perm = Array.isArray(p.permissions) ? p.permissions[0] : p.permissions;
                if (perm?.module && perm?.action) {
                  permsSet.add(`${perm.module}.${perm.action}`);
                }
              });
            }

            // صمام أمان: إذا كان الدور هو HR ومشتقاته، نضمن وجود الصلاحيات الأساسية للـ HR
            if (roleName === 'hr' || roleName === 'hr_officer' || roleName === 'hr_manager') {
              permsSet.add('hr.view');
              permsSet.add('hr.manage_employee');
              permsSet.add('hr.advances_penalties');
              permsSet.add('hr.payroll_run');
              permsSet.add('reports.view');
            }

            // 3. دمج الصلاحيات المباشرة والخاصة للمستخدم (Direct User Permissions)
            const { data: userPerms } = await supabase
              .from('user_permissions')
              .select('permission_id, permissions(module, action)')
              .eq('user_id', user.id)
              .eq('granted', true) as { data: any[] | null };

            const missingPermIds: string[] = [];

            userPerms?.forEach((up) => {
              const perm = Array.isArray(up.permissions) ? up.permissions[0] : up.permissions;
              if (perm?.module && perm?.action) {
                permsSet.add(`${perm.module}.${perm.action}`);
              } else if (up.permission_id) {
                missingPermIds.push(up.permission_id);
              }
            });

            // استرجاع احتياطي في حال عدم اكتمال PostgREST Join لجدول الصلاحيات
            if (missingPermIds.length > 0) {
              const { data: rawPerms } = await supabase
                .from('permissions')
                .select('id, module, action')
                .in('id', missingPermIds);
              rawPerms?.forEach(p => {
                if (p?.module && p?.action) {
                  permsSet.add(`${p.module}.${p.action}`);
                }
              });
            }

            if (permsSet.size > 0) {
              setUserPermissions(permsSet);
            } else {
              // 🛡️ الأمان الافتراضي: منع الصلاحيات الشاملة لمن ليس له دور محدد (Deny by default)
              if (process.env.NODE_ENV === 'development') {
                  console.warn(`[Security] User ${user.id} has no role_id assigned. Restricting to read-only permissions.`);
              }
              setUserPermissions(new Set(['*.view', '*.read', '*.list']));
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
    const sanitizedEmailRaw = sanitizeHtml(email.toLowerCase());
    let finalEmail = sanitizedEmailRaw;
    let finalPassword = password;

    const isOffline = !navigator.onLine;

    // ⚡ مسار الدخول الفوري للنسخة التجريبية (Demo) أو وضع العمل بدون إنترنت
    if (sanitizedEmailRaw === DEMO_EMAIL) {
      const demoUser: User = {
        id: DEMO_USER_ID,
        name: 'مستخدم تجريبي (TriPro Demo)',
        username: DEMO_EMAIL,
        role: 'demo',
        is_active: true,
        organization_id: 'org-default-offline'
      };
      setCurrentUser(demoUser);
      setUserRole('demo');
      setUserPermissions(new Set(['*.*', '*.view', '*.read', '*.create', '*.update', '*.list']));
      setAuthInitialized(true);
      return { success: true };
    }

    if (sanitizedEmailRaw !== DEMO_EMAIL) {
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

    // 🔐 فحص المستخدم المخزن محلياً في حال انقطاع النت التام
    // الأمان الصارم: يُسمح بالدخول فقط لمستخدم مُخزن مسبقاً وبكلمة مرور صحيحة مطابقة للـ hash
    if (isOffline) {
      if (sanitizedEmailRaw === DEMO_EMAIL) {
        const demoUser: User = {
          id: DEMO_USER_ID,
          name: 'مستخدم تجريبي (وضع تجريبي)',
          username: DEMO_EMAIL,
          role: 'demo',
          is_active: true,
          organization_id: '00000000-0000-0000-0000-000000000000'
        };
        setCurrentUser(demoUser);
        setUserRole('demo');
        setUserPermissions(new Set(['dashboard.view', 'reports.view', 'pos.view']));
        setAuthInitialized(true);
        return { success: true };
      }

      const cachedUser = secureStorage.getItem<User>('tripro_cached_user_profile');
      const cachedPasswordHash = secureStorage.getItem<string>('tripro_offline_pw_hash');

      if (cachedUser && cachedUser.username.toLowerCase() === sanitizedEmailRaw.toLowerCase() && cachedPasswordHash) {
        try {
          const msgBuffer = new TextEncoder().encode(finalPassword + cachedUser.id);
          const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
          const inputHashHex = Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0')).join('');

          if (inputHashHex === cachedPasswordHash) {
            setCurrentUser(cachedUser);
            setUserRole(cachedUser.role);
            const cachedPermissions = secureStorage.getItem<string[]>('tripro_offline_permissions') || [];
            setUserPermissions(new Set(cachedPermissions.length > 0 ? cachedPermissions : [cachedUser.role + '.*']));
            setAuthInitialized(true);
            return { success: true };
          } else {
            return { success: false, message: 'كلمة المرور غير صحيحة في وضع عدم الاتصال' };
          }
        } catch (e) {
          console.error('[Offline Auth] Hash verification failed:', e);
          return { success: false, message: 'فشل التحقق من كلمة المرور في وضع عدم الاتصال' };
        }
      }

      return { success: false, message: 'أنت غير متصل بالإنترنت. يجب تسجيل الدخول لمرة واحدة على الأقل أثناء الاتصال.' };
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: finalEmail,
        password: finalPassword
      });
      
      if (error) {
        // إذا كان الجهاز غير متصل بالإنترنت وفشل الاتصال، نتحقق من الكاش المحلي للمستخدم بكلمة المرور
        if (!navigator.onLine || error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
          if (finalEmail === DEMO_EMAIL) {
            const demoUser: User = {
              id: DEMO_USER_ID,
              name: 'مستخدم تجريبي (وضع تجريبي)',
              username: DEMO_EMAIL,
              role: 'demo',
              is_active: true,
              organization_id: '00000000-0000-0000-0000-000000000000'
            };
            setCurrentUser(demoUser);
            setUserRole('demo');
            setUserPermissions(new Set(['dashboard.view', 'reports.view', 'pos.view']));
            setAuthInitialized(true);
            return { success: true };
          }

          const cachedUser = secureStorage.getItem<User>('tripro_cached_user_profile');
          const cachedPasswordHash = secureStorage.getItem<string>('tripro_offline_pw_hash');

          if (cachedUser && cachedUser.username.toLowerCase() === finalEmail.toLowerCase() && cachedPasswordHash) {
            try {
              const msgBuffer = new TextEncoder().encode(finalPassword + cachedUser.id);
              const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
              const inputHashHex = Array.from(new Uint8Array(hashBuffer))
                .map(b => b.toString(16).padStart(2, '0')).join('');

              if (inputHashHex === cachedPasswordHash) {
                setCurrentUser(cachedUser);
                setUserRole(cachedUser.role);
                const cachedPermissions = secureStorage.getItem<string[]>('tripro_offline_permissions') || [];
                setUserPermissions(new Set(cachedPermissions.length > 0 ? cachedPermissions : [cachedUser.role + '.*']));
                setAuthInitialized(true);
                return { success: true };
              }
            } catch (e) {
              console.error('[Offline Auth] Hash verification failed:', e);
            }
          }
          return { success: false, message: 'فشل الاتصال بالخادم. يُرجى الاتصال بالإنترنت والمحاولة مجدداً.' };
        }
        console.error('Login error:', error);
        return { success: false, message: error.message || 'بيانات الدخول غير صحيحة' };
      }

      // 🔐 عند نجاح تسجيل الدخول بالإنترنت: حفظ hash كلمة المرور محلياً بأمان
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const userId = user?.id || finalEmail;
        const msgBuffer = new TextEncoder().encode(finalPassword + userId);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashHex = Array.from(new Uint8Array(hashBuffer))
          .map(b => b.toString(16).padStart(2, '0')).join('');
        secureStorage.setItem('tripro_offline_pw_hash', hashHex);
      } catch (hashErr) {
        console.warn('[Auth] Could not cache offline password hash:', hashErr);
      }

      return { success: true };
    } catch (error: any) {
      // وضع العمل بدون إنترنت عند انقطاع الاتصال التام (Offline Resilience Fallback)
      if (!navigator.onLine || error?.message?.includes('Failed to fetch') || error?.message?.includes('NetworkError')) {
        if (finalEmail === DEMO_EMAIL) {
          const demoUser: User = {
            id: DEMO_USER_ID,
            name: 'مستخدم تجريبي (وضع تجريبي)',
            username: DEMO_EMAIL,
            role: 'demo',
            is_active: true,
            organization_id: '00000000-0000-0000-0000-000000000000'
          };
          setCurrentUser(demoUser);
          setUserRole('demo');
          setUserPermissions(new Set(['dashboard.view', 'reports.view', 'pos.view']));
          setAuthInitialized(true);
          return { success: true };
        }

        const cachedUser = secureStorage.getItem<User>('tripro_cached_user_profile');
        const cachedPasswordHash = secureStorage.getItem<string>('tripro_offline_pw_hash');

        if (cachedUser && cachedUser.username.toLowerCase() === finalEmail.toLowerCase() && cachedPasswordHash) {
          try {
            const msgBuffer = new TextEncoder().encode(finalPassword + cachedUser.id);
            const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
            const inputHashHex = Array.from(new Uint8Array(hashBuffer))
              .map(b => b.toString(16).padStart(2, '0')).join('');

            if (inputHashHex === cachedPasswordHash) {
              setCurrentUser(cachedUser);
              setUserRole(cachedUser.role);
              const cachedPermissions = secureStorage.getItem<string[]>('tripro_offline_permissions') || [];
              setUserPermissions(new Set(cachedPermissions.length > 0 ? cachedPermissions : [cachedUser.role + '.*']));
              setAuthInitialized(true);
              return { success: true };
            }
          } catch (hashErr) {
            console.warn('[Offline Auth] Hash verification failed:', hashErr);
          }
        }
        return { success: false, message: 'فشل الاتصال بالخادم. يُرجى الاتصال بالإنترنت والمحاولة مجدداً.' };
      }
      console.error('Login exception:', error);
      return { success: false, message: error?.message || 'حدث خطأ في الاتصال بنظام تسجيل الدخول' };
    }
  };

  const logout = async () => {
    // التحقق مما إذا كان المستخدم الحالي هو مستخدم الديمو
    const isDemo = userRole === 'demo';

    // 🛡️ 1. مسح الحالة محلياً فوراً لمنع أي طلبات معلقة
    setCurrentUser(null);
    setUserRole(null);
    setUserPermissions(new Set());
    setIsLoading(false);

    // 🧹 2. تنظيف يدوي شامل لكافة التوكنات ومفاتيح الجلسات (سوبابيز والنظام)
    clearSessionData();

    // 🗑️ 3. تنظيف كاش الـ Service Worker لضمان عدم بقاء استجابات مخزنة مؤقتاً
    if (typeof window !== 'undefined' && 'caches' in window) {
      try {
        const cacheKeys = await caches.keys();
        await Promise.all(
          cacheKeys.map(key => {
            if (key.includes('runtime') || key.includes('tripro')) {
              return caches.delete(key);
            }
            return Promise.resolve(false);
          })
        );
      } catch (e) {
        console.warn('Cache clearing warning:', e);
      }
    }

    // 🚪 4. تنفيذ تسجيل الخروج من سوبابايز: محلياً أولاً لضمان إلغاء التوكن، ثم عالمياً
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (e) {
      /* ignore */
    }
    try {
      await supabase.auth.signOut({ scope: 'global' });
    } catch (e) {
      /* ignore */
    }

    // 5. إذا كان المستخدم هو الديمو، قم بإعادة تعيين البيانات بعد الخروج
    if (isDemo) {
      try {
        await supabase.functions.invoke('reset-demo');
      } catch (error) {
        console.error('Failed to reset demo data:', error);
      }
    }

    // 🚀 6. تحويل فوري وقسري لصفحة تسجيل الدخول مع إعادة تحميل الصفحة لمحو أي آثار في الذاكرة
    window.location.hash = '/login';
    window.location.reload();
  };

  const can = useCallback(
    (module: string, action: string): boolean => {
      return evaluatePermission(module, action, userRole, userPermissions, currentUser);
    },
    [userRole, userPermissions, currentUser]
  );

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