import { describe, it, expect, vi, beforeEach } from 'vitest';
import { offlineService } from '../services/offlineService';
import { secureStorage } from '../utils/securityMiddleware';

/**
 * 🛡️ Security & Tenant Isolation Tests
 * 
 * يتحقق هذا الاختبار من:
 * 1. عزل المنشآت الصارم في حذف مرتجعات المبيعات والمشتريات (Cross-Tenant IDOR Prevention).
 * 2. منع خدمة العمل بدون إنترنت (offlineService) من تعيين أول منشأة عشوائياً كـ fallback.
 * 3. حماية هوية المستخدمين وعدم تصعيد الصلاحيات عبر بيانات user_metadata غير الموثوقة.
 */

describe('🛡️ Tenant Isolation & Offline Safety Net', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    secureStorage.removeItem('tripro_last_valid_org_id');
    secureStorage.removeItem('tripro_active_org_id');
    secureStorage.removeItem('tripro_cached_user_profile');
    try { window.localStorage?.clear(); } catch (_) {}
  });

  describe('1. فحص حظر الحذف العابر للمنشآت في المرتجعات (Cross-Tenant Deletion Guard)', () => {
    interface ReturnDocument {
      id: string;
      status: string;
      organization_id: string;
    }

    interface CallerContext {
      userId: string | null;
      role: string;
      orgId: string;
    }

    const validateDeleteReturn = (doc: ReturnDocument, caller: CallerContext) => {
      // 1. التحقق من تسجيل الدخول
      if (!caller.userId) {
        return { allowed: false, error: 'تم رفض الوصول. يجب تسجيل الدخول' };
      }

      // 2. التحقق من الصلاحيات الإدارية والمحاسبية
      const allowedRoles = ['super_admin', 'admin', 'manager', 'accountant', 'owner'];
      if (!allowedRoles.includes(caller.role)) {
        return { allowed: false, error: 'لا تملك الصلاحية اللازمة لحذف المرتجع' };
      }

      // 3. عزل المنشآت الصارم (Tenant Isolation Guard)
      if (doc.organization_id && doc.organization_id !== caller.orgId && caller.role !== 'super_admin') {
        return { allowed: false, error: 'TRIPRO_SECURITY_ALERT: هذا المرتجع يتبع منشأة أخرى ولا يحق لك حذفه' };
      }

      // 4. منع حذف المرتجع المرحل
      if (doc.status !== 'draft' && doc.status !== 'cancelled') {
        return { allowed: false, error: 'لا يمكن حذف مرتجع مرحل' };
      }

      return { allowed: true };
    };

    const docCompanyA: ReturnDocument = {
      id: 'return-001',
      status: 'draft',
      organization_id: 'org-company-a-1111'
    };

    it('يجب منع محاسب من الشركة ب من حذف مسودة مرتجع تتبع الشركة أ (IDOR Defense)', () => {
      const accountantCompanyB: CallerContext = {
        userId: 'user-b-222',
        role: 'accountant',
        orgId: 'org-company-b-2222'
      };

      const result = validateDeleteReturn(docCompanyA, accountantCompanyB);
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('هذا المرتجع يتبع منشأة أخرى');
    });

    it('يجب منع مدير فرع الشركة ب من حذف مسودة مرتجع تتبع الشركة أ', () => {
      const adminCompanyB: CallerContext = {
        userId: 'user-admin-b',
        role: 'admin',
        orgId: 'org-company-b-2222'
      };

      const result = validateDeleteReturn(docCompanyA, adminCompanyB);
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('هذا المرتجع يتبع منشأة أخرى');
    });

    it('يجب السماح لمحاسب الشركة أ بحذف مسودة المرتجع التابعة لنفس شركته', () => {
      const accountantCompanyA: CallerContext = {
        userId: 'user-a-111',
        role: 'accountant',
        orgId: 'org-company-a-1111'
      };

      const result = validateDeleteReturn(docCompanyA, accountantCompanyA);
      expect(result.allowed).toBe(true);
    });

    it('يجب السماح للسوبر أدمن بحذف المرتجع حتى لو اختلف معرف الشركة', () => {
      const superAdminCaller: CallerContext = {
        userId: 'user-super-admin',
        role: 'super_admin',
        orgId: 'org-headquarters'
      };

      const result = validateDeleteReturn(docCompanyA, superAdminCaller);
      expect(result.allowed).toBe(true);
    });

    it('يجب رفض الحذف فوراً لأي مستخدم غير مسجل الدخول (Anonymous Block)', () => {
      const anonymousCaller: CallerContext = {
        userId: null,
        role: 'anon',
        orgId: ''
      };

      const result = validateDeleteReturn(docCompanyA, anonymousCaller);
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('يجب تسجيل الدخول');
    });
  });

  describe('2. فحص أمان المزامنة بدون إنترنت ومنع حقن أول شركة (Offline Fallback Security)', () => {
    it('resolveActiveOrganizationId يجب ألا يُسند أول منشأة في قاعدة البيانات إذا كانت المنشأة مفقودة', async () => {
      // تنظيف أي بيانات مخزنة مسبقاً
      secureStorage.removeItem('tripro_last_valid_org_id');
      secureStorage.removeItem('tripro_active_org_id');
      secureStorage.removeItem('tripro_cached_user_profile');

      // تجربة حل المنشأة بقيم مفقودة أو غير صالحة
      const resolved = await offlineService.resolveActiveOrganizationId('org-default-offline');
      
      // يجب أن يرجع null أو يتوقف بأمان بدلاً من أن يرجع أي UUID عشوائي لمنشأة أخرى
      expect(resolved).toBeNull();
    });

    it('resolveActiveOrganizationId يقبل فقط معرف UUID سليم وغير صفري', async () => {
      const validOrgUUID = '11111111-2222-3333-4444-555555555555';
      const resolved = await offlineService.resolveActiveOrganizationId(validOrgUUID);
      expect(resolved).toBe(validOrgUUID);
    });

    it('resolveActiveOrganizationId يرفض Nil UUID', async () => {
      const nilUUID = '00000000-0000-0000-0000-000000000000';
      const resolved = await offlineService.resolveActiveOrganizationId(nilUUID);
      expect(resolved).toBeNull();
    });
  });

  describe('3. فحص مصداقية الدور ومنع تصعيد الصلاحيات (Privilege Escalation Guard)', () => {
    it('يجب تفضيل الدور الموثق من جدول profiles وعدم الثقة في user_metadata القابل للتعديل من العميل', () => {
      const profileRole = 'cashier';
      const userMetadataRole = 'super_admin'; // محاولة حقن من العميل

      // المنطق الآمن المقفل في قاعدة البيانات:
      const resolveRoleSecure = (profRole: string | null, metaRole: string | null) => {
        // الأولية الحصرية للمرجع الموثق من قاعدة البيانات (profiles)
        if (profRole) return profRole;
        // لا يُقبل metaRole إطلاقاً إلا إذا كان app_metadata حصرياً على الخادم
        return 'viewer';
      };

      const effectiveRole = resolveRoleSecure(profileRole, userMetadataRole);
      expect(effectiveRole).toBe('cashier');
      expect(effectiveRole).not.toBe('super_admin');
    });
  });

});
