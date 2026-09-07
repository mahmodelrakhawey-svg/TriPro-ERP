import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PermissionsManager from './PermissionsManager';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

// 1. Mocking Contexts
vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../context/ToastContext', () => ({
  useToast: vi.fn(),
}));

// 2. Mocking Supabase Client
vi.mock('../../supabaseClient', () => {
  const mockRolesChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    then: vi.fn((onfulfilled) => {
      return Promise.resolve({
        data: [{ id: 'role-1', name: 'admin_test', description: 'دور تجريبي' }],
        error: null,
      }).then(onfulfilled);
    }),
  };

  const mockPermissionsChain = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    then: vi.fn((onfulfilled) => {
      return Promise.resolve({
        data: [
          { id: 'perm-1', module: 'sales', action: 'create', description: 'إنشاء مبيعات', is_sensitive: false },
          { id: 'perm-2', module: 'sales', action: 'view', description: 'عرض المبيعات', is_sensitive: false },
        ],
        error: null,
      }).then(onfulfilled);
    }),
  };

  const mockRolePermissionsChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: vi.fn((onfulfilled) => {
      return Promise.resolve({
        data: [{ permission_id: 'perm-1' }],
        error: null,
      }).then(onfulfilled);
    }),
  };

  return {
    supabase: {
      from: vi.fn((table) => {
        if (table === 'roles') return mockRolesChain;
        if (table === 'permissions') return mockPermissionsChain;
        if (table === 'role_permissions') return mockRolePermissionsChain;
        return {
          select: vi.fn().mockReturnThis(),
          then: vi.fn((onfulfilled) => Promise.resolve({ data: [], error: null }).then(onfulfilled)),
        };
      }),
      rpc: vi.fn(),
    },
  };
});

describe('🛡️ PermissionsManager UI & RPC Integration Tests', () => {
  const mockShowToast = vi.fn();
  const mockRefreshPermissions = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup Auth Context default return
    (useAuth as any).mockReturnValue({
      currentUser: { id: 'user-123', role: 'admin', organization_id: 'org-123' },
      refreshPermissions: mockRefreshPermissions,
    });

    // Setup Toast Context default return
    (useToast as any).mockReturnValue({
      showToast: mockShowToast,
    });

    // Default RPC mock returns success
    (supabase.rpc as any).mockResolvedValue({ data: null, error: null });

    // Mock window.confirm
    window.confirm = vi.fn().mockReturnValue(true);
  });

  it('يجب أن يعرض المكون أسماء الأدوار والصلاحيات بعد تحميل البيانات', async () => {
    render(<PermissionsManager />);

    // الانتظار حتى يتم تحميل الأدوار
    await waitFor(() => {
      expect(screen.getByText('دور تجريبي')).toBeDefined();
    });

    // التأكد من ظهور الموديلات والصلاحيات المتاحة في الجدول
    expect(screen.getByText('المبيعات والفواتير')).toBeDefined();
    expect(screen.getByText('إنشاء مبيعات')).toBeDefined();
  });

  it('يجب استدعاء RPC sync_role_permissions مع المعرفات الصحيحة عند تعديل الصلاحيات والضغط على حفظ', async () => {
    render(<PermissionsManager />);

    // انتظار تحميل البيانات
    await waitFor(() => {
      expect(screen.getByText('دور تجريبي')).toBeDefined();
      expect(screen.getByText('عرض المبيعات')).toBeDefined();
    });

    // النقر على صلاحية 'عرض المبيعات' لتغيير الحالة وتفعيل زر الحفظ
    fireEvent.click(screen.getByText('عرض المبيعات'));

    // الضغط على زر الحفظ
    const saveButton = screen.getByText('حفظ التغييرات الآن');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('sync_role_permissions', {
        p_role_id: 'role-1',
        p_permission_ids: expect.arrayContaining(['perm-1', 'perm-2']),
      });
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('تم حفظ ومزامنة الصلاحيات بنجاح'),
        'success'
      );
    });
  });

  it('يجب إظهار رسالة خطأ للمستخدم في حال فشل استدعاء الدالة بقاعدة البيانات', async () => {
    const dbError = {
      code: 'PGRST203',
      message: 'Could not choose candidate function',
    };
    (supabase.rpc as any).mockResolvedValue({ data: null, error: dbError });

    render(<PermissionsManager />);

    await waitFor(() => {
      expect(screen.getByText('دور تجريبي')).toBeDefined();
    });

    // النقر على صلاحية لتفعيل زر الحفظ
    fireEvent.click(screen.getByText('عرض المبيعات'));

    const saveButton = screen.getByText('حفظ التغييرات الآن');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Could not choose candidate function'),
        'error'
      );
    });
  });
});
