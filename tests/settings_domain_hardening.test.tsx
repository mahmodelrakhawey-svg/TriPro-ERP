import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { SettingsProvider, useSettingsDomain } from '../context/domains/AccountingSettingsContext';
import { normalizeCompanySettings, isLenzaOrganization } from '../context/domains/domainUtils';

// Mock Supabase
vi.mock('../supabaseClient', () => {
  const mockFrom = vi.fn();
  const mockRpc = vi.fn();
  return {
    supabase: {
      from: mockFrom,
      rpc: mockRpc,
    },
  };
});

import { supabase } from '../supabaseClient';

describe('Accounting Settings Domain Hardening & Multi-tenancy', () => {
  const mockOrgId = 'org-settings-test-999';
  const mockUser = {
    id: 'user-admin-1',
    organization_id: mockOrgId,
    name: 'مدير النظام',
    role: 'admin',
    permissions: ['all']
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('يجب أن يسترجع SettingsProvider إعدادات المنظمة المحددة بدقة', async () => {
    (supabase.rpc as any).mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          company_name: 'شركة الاختبار التقنية',
          vat_rate: 14,
          currency: 'EGP'
        },
        error: null
      })
    });

    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: mockOrgId, name: 'شركة الاختبار التقنية' },
        error: null
      }),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: mockOrgId, name: 'شركة الاختبار التقنية' },
        error: null
      })
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SettingsProvider
        orgId={mockOrgId}
        currentUser={mockUser as any}
      >
        {children}
      </SettingsProvider>
    );

    const { result } = renderHook(() => useSettingsDomain(), { wrapper });

    await act(async () => {
      await result.current.refreshSettings?.();
    });

    expect(result.current.settings).toBeDefined();
  });

  it('يجب أن يطبق updateSettings التعديلات على جدول company_settings مع عزل المنظمة', async () => {
    const mockUpdate = vi.fn().mockReturnThis();
    const mockEq = vi.fn().mockResolvedValue({ error: null });

    (supabase.rpc as any).mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: {}, error: null })
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'company_settings') {
        return {
          update: mockUpdate.mockReturnValue({ eq: mockEq }),
          eq: mockEq,
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { id: mockOrgId }, error: null })
      };
    });

    const showToast = vi.fn();
    const logActivity = vi.fn();

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SettingsProvider
        orgId={mockOrgId}
        currentUser={mockUser as any}
        showToast={showToast}
        logActivity={logActivity}
      >
        {children}
      </SettingsProvider>
    );

    const { result } = renderHook(() => useSettingsDomain(), { wrapper });

    await act(async () => {
      await result.current.updateSettings?.({ currency: 'SAR', vat_rate: 15 });
    });

    expect(supabase.from).toHaveBeenCalledWith('company_settings');
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ currency: 'SAR', vat_rate: 15 }));
    expect(mockEq).toHaveBeenCalledWith('organization_id', mockOrgId);
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('نجاح'), 'success');
  });

  it('يوحد وحدات الضريبة ورسوم الخدمة بين vatRate (نسبة) و vat_rate (عشري) لجميع الشاشات', () => {
    const normalizedFromDecimal = normalizeCompanySettings(
      { vat_rate: 0.14, service_charge_rate: 0.12, enable_tax: true, enable_service_charge: true },
      { name: 'شركة عامة' }
    );
    expect(normalizedFromDecimal.vatRate).toBe(14);
    expect(normalizedFromDecimal.vat_rate).toBe(0.14);
    expect(normalizedFromDecimal.vatRatePercentage).toBe(14);
    expect(normalizedFromDecimal.vatRateDecimal).toBe(0.14);
    expect(normalizedFromDecimal.serviceChargeRate).toBe(12);
    expect(normalizedFromDecimal.service_charge_rate).toBe(0.12);
    expect(normalizedFromDecimal.allowNegativeStock).toBe(false);

    const normalizedFromPercent = normalizeCompanySettings(
      { vat_rate: 15, service_charge_rate: 10 },
      { name: 'شركة عامة' }
    );
    expect(normalizedFromPercent.vatRate).toBe(15);
    expect(normalizedFromPercent.vat_rate).toBe(0.15);
    expect(normalizedFromPercent.serviceChargeRate).toBe(10);
    expect(normalizedFromPercent.service_charge_rate).toBe(0.1);
  });

  it('يحافظ على تفعيل البيع بالسالب تلقائياً لمنظمة حلواني لينزا ويزامن company_settings لمرة واحدة', async () => {
    const lenzaOrgId = 'lenza-org-001';
    expect(isLenzaOrganization({ name: 'حلواني لينزا' })).toBe(true);
    expect(isLenzaOrganization({ commercial_name: 'Lenza Confectionery' })).toBe(true);
    expect(isLenzaOrganization({ name: 'شركة أخرى' })).toBe(false);

    const mockUpdate = vi.fn().mockReturnThis();
    const mockEq = vi.fn().mockResolvedValue({ error: null });

    (supabase.rpc as any).mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({
        data: { vat_rate: 0.14, allow_negative_stock: false },
        error: null,
      }),
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'company_settings') {
        return {
          update: mockUpdate.mockReturnValue({ eq: mockEq }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: lenzaOrgId, name: 'حلواني لينزا' },
          error: null,
        }),
      };
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SettingsProvider
        orgId={lenzaOrgId}
        currentUser={{ id: 'u1', organization_id: lenzaOrgId, role: 'admin' } as any}
      >
        {children}
      </SettingsProvider>
    );

    const { result } = renderHook(() => useSettingsDomain(), { wrapper });

    await act(async () => {
      await result.current.refreshSettings?.();
    });

    // استدعاء ثانٍ لا يكرر التحديث في قاعدة البيانات (lenzaSyncedRef)
    await act(async () => {
      await result.current.refreshSettings?.();
    });

    expect((result.current.settings as any).vatRate).toBe(14);
    expect((result.current.settings as any).vat_rate).toBe(0.14);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith({ allow_negative_stock: true });
    expect(mockEq).toHaveBeenCalledWith('organization_id', lenzaOrgId);

    // إذا كان الحقل غير محدد لمنظمة لينزا يكون الافتراضي true
    const lenzaFallback = normalizeCompanySettings({ vat_rate: 0.14 }, { name: 'حلواني لينزا' });
    expect(lenzaFallback.allowNegativeStock).toBe(true);
    expect(lenzaFallback.allow_negative_stock).toBe(true);
  });
});
