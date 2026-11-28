import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const mockFrom = vi.fn();
const mockShowToast = vi.fn();

vi.mock('../../supabaseClient', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('../../context/AccountingContext', () => ({
  useAccounting: () => ({
    organization: { id: '2d9b24d6-f5cf-4bd9-b8b6-0a85d1c9c967', name: 'حلواني لينزا' },
  }),
}));

import { CostClosingDashboard } from '../../modules/manufacturing/components/CostClosingDashboard';

describe('CostClosingDashboard — Single Batched Trends Query', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('يدمج استعلامات v_mfg_cost_trends في طلب واحد باستخدام .in بدلاً من 3 طلبات متوازية', async () => {
    const trendsCalls: any[] = [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const periodName = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
    const prevPeriodName = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;

    mockFrom.mockImplementation((table: string) => {
      if (table === 'v_mfg_cost_reconciliation_report') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [{ cost_assigned_to_wip: 1500 }], error: null }),
          }),
        };
      }
      if (table === 'journal_lines_view') {
        return {
          select: () => ({
            eq: () => ({
              like: () => ({
                gte: () => ({
                  lte: () => Promise.resolve({ data: [{ balance: 300 }], error: null }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'v_mfg_cost_trends') {
        return {
          select: () => ({
            eq: () => ({
              in: (col: string, vals: string[]) => {
                trendsCalls.push({ col, vals });
                return Promise.resolve({
                  data: [
                    { month_period: periodName, avg_actual_unit_cost: 50, avg_standard_unit_cost: 45, total_actual_cost: 500, variance_pct: 4.5 },
                    { month_period: prevPeriodName, avg_actual_unit_cost: 44, avg_standard_unit_cost: 45, total_actual_cost: 440, variance_pct: 2.0 },
                  ],
                  error: null,
                });
              },
            }),
          }),
        };
      }
      if (table === 'mfg_period_cost_snapshots') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: () => Promise.resolve({ data: { period_name: prevPeriodName }, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      return { select: () => Promise.resolve({ data: [], error: null }) };
    });

    render(<CostClosingDashboard />);

    await waitFor(() => {
      expect(trendsCalls).toHaveLength(1);
    });

    expect(trendsCalls[0]).toEqual({
      col: 'month_period',
      vals: [periodName, prevPeriodName],
    });

    await waitFor(() => {
      expect(screen.getByText('4.50%')).toBeTruthy();
    });
  });
});
