import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { HrProvider, useHrDomain } from '../context/domains/HrContext';

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

describe('HR Domain Hardening & Supervisory Scope', () => {
  const mockOrgId = 'org-hr-test-777';
  const mockUser = {
    id: 'user-hr-1',
    organization_id: mockOrgId,
    name: 'مسؤول الموارد البشرية',
    role: 'hr_manager',
    hr_scope: 'all'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('يجب أن يعزل بيانات الموظفين وفق المنظمة وحذف الموظف بنمط الحذف الناعم', async () => {
    const mockEq: any = vi.fn();
    mockEq.mockImplementation(() => Object.assign(Promise.resolve({ error: null }), { eq: mockEq }));
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });

    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      update: mockUpdate,
    });

    const showToast = vi.fn();
    const logActivity = vi.fn();

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <HrProvider
        orgId={mockOrgId}
        currentUser={mockUser as any}
        showToast={showToast}
        logActivity={logActivity}
      >
        {children}
      </HrProvider>
    );

    const { result } = renderHook(() => useHrDomain(), { wrapper });

    await act(async () => {
      await result.current.deleteEmployee('emp-101', 'استقالة');
    });

    expect(supabase.from).toHaveBeenCalledWith('employees');
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      status: 'terminated',
      notes: 'استقالة'
    }));
    expect(mockEq).toHaveBeenCalledWith('id', 'emp-101');
  });

  it('يجب أن يفصل نطاق الإشراف (hr_scope = factory) عن موظفي الشركة', async () => {
    const mockEmployees = [
      { id: 'e1', full_name: 'عامل المصنع 1', department: 'المصنع' },
      { id: 'e2', full_name: 'محاسب الإدارة', department: 'المالية' },
    ];

    const factoryUser = {
      ...mockUser,
      hr_scope: 'factory'
    };

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <HrProvider
        orgId={mockOrgId}
        currentUser={factoryUser as any}
        initialEmployees={mockEmployees as any}
      >
        {children}
      </HrProvider>
    );

    const { result } = renderHook(() => useHrDomain(), { wrapper });

    expect(result.current.employees).toHaveLength(1);
    expect(result.current.employees[0].full_name).toBe('عامل المصنع 1');
  });
});
