import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { RestaurantProvider, useRestaurantDomain } from '../context/domains/RestaurantContext';

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

describe('Restaurant & POS Shift Domain Hardening', () => {
  const mockOrgId = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';
  const mockUser = {
    id: 'f1e2d3c4-b5a6-9788-1234-567890abcdef',
    organization_id: mockOrgId,
    name: 'كاشير الصالة',
    role: 'cashier',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('يجب أن يدعم بدء الوردية (startShift) عبر استدعاء start_pos_shift مع عزل المنظمة', async () => {
    (supabase.rpc as any).mockResolvedValue({ data: { id: 'shift-101' }, error: null });

    const showToast = vi.fn();
    const logActivity = vi.fn();
    const mockCashAccount = { id: 'b1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' };

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <RestaurantProvider
        orgId={mockOrgId}
        currentUser={mockUser as any}
        showToast={showToast}
        logActivity={logActivity}
        cashAccountId={mockCashAccount.id}
      >
        {children}
      </RestaurantProvider>
    );

    const { result } = renderHook(() => useRestaurantDomain(), { wrapper });

    await act(async () => {
      await result.current.startShift(500);
    });

    expect(supabase.rpc).toHaveBeenCalledWith('start_pos_shift', expect.objectContaining({
      p_opening_balance: 500,
      p_treasury_account_id: mockCashAccount.id,
      p_user_id: mockUser.id,
      p_org_id: mockOrgId
    }));
    expect(logActivity).toHaveBeenCalledWith('START_SHIFT', expect.stringContaining('500'));
  });

  it('يجب أن يغلق الوردية (closeCurrentShift) مع تمرير معرف المنظمة وحفظ الملاحظات', async () => {
    (supabase.rpc as any).mockResolvedValue({ data: null, error: null });

    const showToast = vi.fn();
    const logActivity = vi.fn();
    const activeShift = {
      id: 'c1c2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
      opening_balance: 500,
      status: 'OPEN'
    };

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <RestaurantProvider
        orgId={mockOrgId}
        currentUser={mockUser as any}
        initialShift={activeShift}
        showToast={showToast}
        logActivity={logActivity}
      >
        {children}
      </RestaurantProvider>
    );

    const { result } = renderHook(() => useRestaurantDomain(), { wrapper });

    await act(async () => {
      await result.current.closeCurrentShift(1250, 'تم جرد الدرج بنجاح');
    });

    expect(supabase.rpc).toHaveBeenCalledWith('close_shift', expect.objectContaining({
      p_shift_id: activeShift.id,
      p_actual_cash: 1250,
      p_notes: 'تم جرد الدرج بنجاح',
      p_org_id: mockOrgId
    }));
    expect(result.current.currentShift).toBeNull();
  });

  it('يجب أن يضيف طاولة جديدة ويربطها تلقائياً بمعرف المنظمة المستهدفة', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null });
    (supabase.from as any).mockReturnValue({
      insert: mockInsert,
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <RestaurantProvider
        orgId={mockOrgId}
        currentUser={mockUser as any}
      >
        {children}
      </RestaurantProvider>
    );

    const { result } = renderHook(() => useRestaurantDomain(), { wrapper });

    await act(async () => {
      await result.current.addRestaurantTable({ name: 'طاولة 5 عائلات', capacity: 6, section: 'VIP' });
    });

    expect(supabase.from).toHaveBeenCalledWith('restaurant_tables');
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      name: 'طاولة 5 عائلات',
      capacity: 6,
      section: 'VIP',
      organization_id: mockOrgId
    }));
  });

  it('يجب أن يدعم حجز الطاولة وتحديث حالتها بنجاح', async () => {
    const mockEq = vi.fn().mockResolvedValue({ data: null, error: null });
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
    (supabase.from as any).mockReturnValue({
      update: mockUpdate,
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <RestaurantProvider
        orgId={mockOrgId}
        currentUser={mockUser as any}
      >
        {children}
      </RestaurantProvider>
    );

    const { result } = renderHook(() => useRestaurantDomain(), { wrapper });

    let success = false;
    await act(async () => {
      success = await result.current.reserveTable('tbl-10', 'أحمد محمود', '20:00');
    });

    expect(success).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      status: 'RESERVED',
      reservation_info: { customerName: 'أحمد محمود', arrivalTime: '20:00' }
    }));
    expect(mockEq).toHaveBeenCalledWith('id', 'tbl-10');
  });

  it('يجب أن يعود لـ fallback المحلي بنمط الأوفلاين عند انقطاع الاتصال', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <RestaurantProvider
        orgId={mockOrgId}
        currentUser={mockUser as any}
        isDemo={true}
      >
        {children}
      </RestaurantProvider>
    );

    const { result } = renderHook(() => useRestaurantDomain(), { wrapper });

    let orderId = '';
    await act(async () => {
      orderId = await result.current.createRestaurantOrder({
        p_table_id: 't-1',
        p_items: [{ product_id: 'p-1', name: 'وجبة تجريبية', quantity: 2, unit_price: 50 }]
      });
    });

    expect(orderId).toContain('ord-offline-');
  });
});
