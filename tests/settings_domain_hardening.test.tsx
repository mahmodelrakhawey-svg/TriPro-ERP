import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { SettingsProvider, useSettingsDomain } from '../context/domains/AccountingSettingsContext';

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
});
