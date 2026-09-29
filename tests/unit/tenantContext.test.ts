import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  isValidUUID, 
  getActiveOrgIdSync, 
  resolveActiveOrgId, 
  setActiveOrgId 
} from '../../services/tenantContext';
import { supabase } from '../../supabaseClient';
import { secureStorage } from '../../utils/securityMiddleware';

vi.mock('../../supabaseClient', () => {
  return {
    supabase: {
      auth: {
        getSession: vi.fn()
      },
      from: vi.fn()
    }
  };
});

vi.mock('../../utils/securityMiddleware', () => {
  const store = new Map<string, any>();
  return {
    secureStorage: {
      getItem: vi.fn((key: string) => store.get(key) || null),
      setItem: vi.fn((key: string, val: any) => store.set(key, val)),
      removeItem: vi.fn((key: string) => store.delete(key)),
      _clear: () => store.clear()
    }
  };
});

describe('🛡️ Tenant Context & Active Organization Resolver', () => {
  const testUUID = '11111111-2222-3333-4444-555555555555';
  const anotherUUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  beforeEach(() => {
    vi.clearAllMocks();
    (secureStorage as any)._clear();
    setActiveOrgId(null);
  });

  it('يتحقق بدقة من صحة الـ UUID', () => {
    expect(isValidUUID(testUUID)).toBe(true);
    expect(isValidUUID('invalid-uuid')).toBe(false);
    expect(isValidUUID(null)).toBe(false);
    expect(isValidUUID(undefined)).toBe(false);
    expect(isValidUUID('')).toBe(false);
  });

  it('يعطي الأولوية القصوى للمعرف الصريح الصالح', async () => {
    const result = await resolveActiveOrgId(testUUID);
    expect(result).toBe(testUUID);
    expect(getActiveOrgIdSync(testUUID)).toBe(testUUID);
  });

  it('يسترجع المعرف من secureStorage عند توفره', async () => {
    secureStorage.setItem('tripro_active_org_id', testUUID);
    const result = await resolveActiveOrgId();
    expect(result).toBe(testUUID);
  });

  it('يسترجع المعرف من جلسة المستخدم Auth Session عند عدم وجود تخزين محلي', async () => {
    (supabase.auth.getSession as any).mockResolvedValue({
      data: {
        session: {
          user: {
            id: 'user-123',
            user_metadata: { org_id: anotherUUID }
          }
        }
      }
    });

    const result = await resolveActiveOrgId();
    expect(result).toBe(anotherUUID);
    expect(secureStorage.setItem).toHaveBeenCalledWith('tripro_active_org_id', anotherUUID);
  });

  it('يسترجع المعرف من جدول profiles كإجراء احتياطي إذا لم يكن في الميتاداتا', async () => {
    (supabase.auth.getSession as any).mockResolvedValue({
      data: {
        session: {
          user: {
            id: 'user-456',
            user_metadata: {}
          }
        }
      }
    });

    const mockMaybeSingle = vi.fn().mockResolvedValue({
      data: { organization_id: testUUID }
    });
    const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });

    (supabase.from as any).mockReturnValue({ select: mockSelect });

    const result = await resolveActiveOrgId();
    expect(result).toBe(testUUID);
    expect(supabase.from).toHaveBeenCalledWith('profiles');
  });

  it('يقوم بتعيين وحذف المنظمة وتحديث التخزين والذاكرة بشكل صحيح', () => {
    setActiveOrgId(testUUID);
    expect(getActiveOrgIdSync()).toBe(testUUID);
    expect(secureStorage.setItem).toHaveBeenCalledWith('tripro_active_org_id', testUUID);

    setActiveOrgId(null);
    expect(getActiveOrgIdSync()).toBeNull();
    expect(secureStorage.removeItem).toHaveBeenCalledWith('tripro_active_org_id');
  });
});
