import { describe, it, expect, vi } from 'vitest';
import { deleteOrganizationSafe } from '../services/organizationService';

describe('🏢 Organization Service Unit Tests', () => {
  it('should block non-admin users from deleting organizations', async () => {
    const mockSupabase: any = {};
    const result = await deleteOrganizationSafe({
      supabase: mockSupabase,
      orgId: 'org-test',
      currentUser: { role: 'cashier' },
      skipConfirm: true,
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('ليس لديك صلاحية');
  });

  it('should allow admin and invoke fn_delete_organization_safe RPC', async () => {
    const mockSupabase: any = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    };

    const result = await deleteOrganizationSafe({
      supabase: mockSupabase,
      orgId: 'org-test-123',
      currentUser: { role: 'admin' },
      skipConfirm: true,
    });

    expect(result.success).toBe(true);
    expect(mockSupabase.rpc).toHaveBeenCalledWith('fn_delete_organization_safe', {
      p_org_id: 'org-test-123',
    });
  });

  it('should allow super_admin and invoke fn_delete_organization_safe RPC', async () => {
    const mockSupabase: any = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    };

    const result = await deleteOrganizationSafe({
      supabase: mockSupabase,
      orgId: 'org-test-456',
      currentUser: { role: 'super_admin' },
      skipConfirm: true,
    });

    expect(result.success).toBe(true);
    expect(mockSupabase.rpc).toHaveBeenCalledWith('fn_delete_organization_safe', {
      p_org_id: 'org-test-456',
    });
  });
});
