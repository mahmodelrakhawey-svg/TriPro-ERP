import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();

vi.mock('../../supabaseClient', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
  },
}));

import { fetchJournalEntriesWithLines } from '../../utils/journalPagination';

describe('journalPagination — Keyset Cursor Fetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('يجلب الصفحات المتتالية باستخدام مؤشر (transaction_date, id) دون استخدام offset/range', async () => {
    const page1 = Array.from({ length: 300 }, (_, idx) => ({
      id: `je-${300 - idx}`,
      transaction_date: '2026-11-28',
    }));
    const page2 = [
      { id: 'je-0', transaction_date: '2026-11-27' },
    ];

    const orCalls: string[] = [];
    const rangeCalls: unknown[] = [];
    let callIdx = 0;

    mockFrom.mockImplementation(() => {
      const currentCall = callIdx++;
      const builder: Record<string, any> = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        or: (expr: string) => {
          orCalls.push(expr);
          return builder;
        },
        range: (...args: unknown[]) => {
          rangeCalls.push(args);
          return builder;
        },
        limit: vi.fn().mockImplementation(() =>
          Promise.resolve({ data: currentCall === 0 ? page1 : page2, error: null })
        ),
      };
      return builder;
    });

    const rows = await fetchJournalEntriesWithLines('org-1', '2026-01-01', '2026-12-31');

    expect(rows).toHaveLength(301);
    expect(rangeCalls).toHaveLength(0);
    expect(orCalls).toEqual([
      'transaction_date.lt.2026-11-28,and(transaction_date.eq.2026-11-28,id.lt.je-1)',
    ]);
  });
});
