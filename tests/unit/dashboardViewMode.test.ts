import { describe, it, expect } from 'vitest';
import { createUserManagerUserSchema } from '../../utils/validationSchemas';
import { User, DashboardViewMode } from '../../types';

describe('🧭 Dashboard View Mode Per User Tests', () => {
  it('validates valid dashboard_view_mode values with createUserManagerUserSchema', () => {
    const validModes: DashboardViewMode[] = ['both', 'workflow_only', 'analytics_only'];

    validModes.forEach((mode) => {
      const result = createUserManagerUserSchema.safeParse({
        email: 'user@tripro.com',
        password: 'password123',
        fullName: 'مستخدم تجريبي',
        role: 'accountant',
        dashboard_view_mode: mode,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dashboard_view_mode).toBe(mode);
      }
    });
  });

  it('rejects invalid dashboard_view_mode values', () => {
    const result = createUserManagerUserSchema.safeParse({
      email: 'user@tripro.com',
      password: 'password123',
      fullName: 'مستخدم تجريبي',
      role: 'accountant',
      dashboard_view_mode: 'unsupported_mode',
    });

    expect(result.success).toBe(false);
  });

  it('allows dashboard_view_mode to be omitted (optional field)', () => {
    const result = createUserManagerUserSchema.safeParse({
      email: 'user@tripro.com',
      password: 'password123',
      fullName: 'مستخدم تجريبي',
      role: 'accountant',
    });

    expect(result.success).toBe(true);
  });

  it('correctly calculates view restriction flags based on user preferences', () => {
    const evaluateViewRestrictions = (user?: User | null) => {
      const mode = user?.dashboard_view_mode || 'both';
      const isWorkflowRestricted = mode === 'workflow_only';
      const isAnalyticsRestricted = mode === 'analytics_only';
      const canSwitchViewMode = !isWorkflowRestricted && !isAnalyticsRestricted;
      return { isWorkflowRestricted, isAnalyticsRestricted, canSwitchViewMode };
    };

    // 1. Both (default)
    const userBoth: User = {
      id: '1',
      username: 'admin@lenza.com',
      name: 'المدير',
      role: 'admin',
      is_active: true,
      dashboard_view_mode: 'both',
    };
    expect(evaluateViewRestrictions(userBoth)).toEqual({
      isWorkflowRestricted: false,
      isAnalyticsRestricted: false,
      canSwitchViewMode: true,
    });

    // 2. Workflow only
    const userWorkflowOnly: User = {
      id: '2',
      username: 'clerk@lenza.com',
      name: 'محاسب فواتير',
      role: 'accountant',
      is_active: true,
      dashboard_view_mode: 'workflow_only',
    };
    expect(evaluateViewRestrictions(userWorkflowOnly)).toEqual({
      isWorkflowRestricted: true,
      isAnalyticsRestricted: false,
      canSwitchViewMode: false,
    });

    // 3. Analytics only
    const userAnalyticsOnly: User = {
      id: '3',
      username: 'owner@lenza.com',
      name: 'مالك المنشأة',
      role: 'owner',
      is_active: true,
      dashboard_view_mode: 'analytics_only',
    };
    expect(evaluateViewRestrictions(userAnalyticsOnly)).toEqual({
      isWorkflowRestricted: false,
      isAnalyticsRestricted: true,
      canSwitchViewMode: false,
    });

    // 4. Undefined / Fallback
    const userFallback: User = {
      id: '4',
      username: 'general@lenza.com',
      name: 'مستخدم عام',
      role: 'viewer',
      is_active: true,
    };
    expect(evaluateViewRestrictions(userFallback)).toEqual({
      isWorkflowRestricted: false,
      isAnalyticsRestricted: false,
      canSwitchViewMode: true,
    });
  });
});
