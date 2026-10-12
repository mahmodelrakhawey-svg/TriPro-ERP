import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { CustomerProvider, useCustomerDomain } from '../context/domains/CustomerContext';
import { supabase } from '../supabaseClient';

vi.mock('../supabaseClient', () => {
  const mockFrom = vi.fn();
  return {
    supabase: {
      from: mockFrom
    }
  };
});

describe('Customer Domain Hardening & Security (اختبار أمان ونطاق العملاء)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('يعزل بيانات المنظمة ويسجل created_by و updated_by عند إضافة عميل', async () => {
    const mockUser = {
      id: 'usr-100',
      full_name: 'أحمد المحاسب',
      organization_id: 'org-lenza-01'
    };

    const insertedCustomer = {
      id: 'c-new',
      name: 'عميل تجريبي جديد',
      phone: '01011112222',
      organization_id: 'org-lenza-01',
      created_by: 'usr-100',
      updated_by: 'usr-100'
    };

    const singleMock = vi.fn().mockResolvedValue({ data: insertedCustomer, error: null });
    const selectMock = vi.fn().mockReturnValue({ single: singleMock });
    const insertMock = vi.fn().mockReturnValue({ select: selectMock });

    // Mock for subsequent fetchCustomers
    const rangeMock = vi.fn().mockResolvedValue({ data: [insertedCustomer], error: null });
    const orderMock = vi.fn().mockReturnValue({ range: rangeMock });
    const isMock = vi.fn().mockReturnValue({ order: orderMock, range: rangeMock });
    const eqMock = vi.fn().mockReturnValue({ is: isMock, range: rangeMock });
    const selectFetchMock = vi.fn().mockReturnValue({ eq: eqMock, range: rangeMock });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'customers') {
        return {
          insert: insertMock,
          select: selectFetchMock
        };
      }
      return {};
    });

    const activityLogger = vi.fn();

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <CustomerProvider
        orgId="org-lenza-01"
        currentUser={mockUser as any}
        logActivity={activityLogger}
      >
        {children}
      </CustomerProvider>
    );

    const { result } = renderHook(() => useCustomerDomain(), { wrapper });

    await act(async () => {
      const added = await result.current.addCustomer({ name: 'عميل تجريبي جديد', phone: '01011112222' });
      expect(added).toBeDefined();
    });

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'عميل تجريبي جديد',
        organization_id: 'org-lenza-01',
        created_by: 'usr-100',
        updated_by: 'usr-100'
      })
    );

    expect(activityLogger).toHaveBeenCalledWith('إضافة عميل', expect.stringContaining('عميل تجريبي جديد'));
  });

  it('يطبق الحذف الآمن Soft Delete مع سبب الحذف وعزل المنظمة', async () => {
    const mockUser = {
      id: 'usr-100',
      full_name: 'أحمد المحاسب',
      organization_id: 'org-lenza-01'
    };

    const eqOrgMock = vi.fn().mockResolvedValue({ error: null });
    const eqIdMock = vi.fn().mockReturnValue({ eq: eqOrgMock });
    const updateMock = vi.fn().mockReturnValue({ eq: eqIdMock });

    const rangeFetchMock = vi.fn().mockResolvedValue({ data: [], error: null });
    const selectFetchMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        is: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({ range: rangeFetchMock }),
          range: rangeFetchMock
        }),
        range: rangeFetchMock
      }),
      range: rangeFetchMock
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'customers') {
        return {
          update: updateMock,
          select: selectFetchMock
        };
      }
      return {};
    });

    const activityLogger = vi.fn();

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <CustomerProvider
        orgId="org-lenza-01"
        currentUser={mockUser as any}
        logActivity={activityLogger}
      >
        {children}
      </CustomerProvider>
    );

    const { result } = renderHook(() => useCustomerDomain(), { wrapper });

    await act(async () => {
      await result.current.deleteCustomer('c-999', 'إلغاء النشاط التجاري');
    });

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        deletion_reason: 'إلغاء النشاط التجاري',
        updated_by: 'usr-100'
      })
    );
    expect(eqIdMock).toHaveBeenCalledWith('id', 'c-999');
    expect(eqOrgMock).toHaveBeenCalledWith('organization_id', 'org-lenza-01');
    expect(activityLogger).toHaveBeenCalledWith('حذف عميل', expect.stringContaining('c-999'));
  });
});
