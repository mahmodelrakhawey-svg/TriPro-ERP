import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isValidUUID,
  isValidNonNilUUID,
  offlineService,
} from '../../services/offlineService';
import { TEST_ORG_ID } from '../helpers/factories';

const { mockRpc, storageMap } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  storageMap: new Map<string, any>(),
}));

vi.mock('../../supabaseClient', () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    from: vi.fn(),
  },
}));

vi.mock('../../utils/securityMiddleware', () => ({
  secureStorage: {
    getItem: vi.fn((k: string) => storageMap.get(k) ?? null),
    setItem: vi.fn((k: string, v: any) => storageMap.set(k, v)),
    removeItem: vi.fn((k: string) => storageMap.delete(k)),
  },
}));

describe('📡 OfflineService — UUID Guards, Clock Calibration & Org Resolution', () => {
  beforeEach(() => {
    storageMap.clear();
    localStorage.clear();
    vi.clearAllMocks();
    offlineService.setServerTimeDelta(0);
  });

  it('يميز بدقة بين UUID الصالح والمعرف الصفري Nil UUID والمعرفات غير الصالحة', () => {
    expect(isValidUUID(TEST_ORG_ID)).toBe(true);
    expect(isValidUUID('00000000-0000-0000-0000-000000000000')).toBe(true);
    expect(isValidNonNilUUID('00000000-0000-0000-0000-000000000000')).toBe(false);
    expect(isValidNonNilUUID('org-default-offline')).toBe(false);
    expect(isValidNonNilUUID(TEST_ORG_ID)).toBe(true);
  });

  it('يعاير فرق توقيت الخادم ويحسب التاريخ المعاير ودقائق الانحراف بدقة', () => {
    offlineService.setServerTimeDelta(120000); // +2 minutes
    expect(offlineService.getServerTimeDelta()).toBe(120000);
    expect(offlineService.getServerTimeSkewMinutes()).toBe(2);

    const calibrated = offlineService.getCalibratedDate();
    expect(calibrated.getTime()).toBeGreaterThanOrEqual(Date.now() + 119000);
  });

  it('يتصل بـ get_server_time عند توفر الإنترنت ويتجاوز المعايرة عند الانقطاع', async () => {
    const serverIso = new Date(Date.now() + 300000).toISOString();
    mockRpc.mockResolvedValueOnce({ data: serverIso, error: null });

    const delta = await offlineService.calibrateServerTime();
    expect(mockRpc).toHaveBeenCalledWith('get_server_time');
    expect(Math.abs(delta - 300000)).toBeLessThan(5000);

    // محاكاة وضع الأوفلاين
    const originalOnLine = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    await offlineService.calibrateServerTime();
    expect(mockRpc).toHaveBeenCalledTimes(1); // لم يتم استدعاء RPC أثناء الأوفلاين
    Object.defineProperty(navigator, 'onLine', { value: originalOnLine, configurable: true });
  });

  it('يحسم المنشأة النشطة الصالحة ويرفض org-default-offline والـ Nil UUID', async () => {
    const resolved = await offlineService.resolveActiveOrganizationId(TEST_ORG_ID);
    expect(resolved).toBe(TEST_ORG_ID);

    storageMap.clear();
    localStorage.clear();
    const rejected = await offlineService.resolveActiveOrganizationId('org-default-offline');
    expect(rejected).toBeNull();
  });
});
