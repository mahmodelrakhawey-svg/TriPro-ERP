import { vi } from 'vitest';
import { TEST_ORG_ID, TEST_USER_ID } from './factories';

export interface MockQueryResult<T = any> {
  data: T;
  error: any;
  count?: number | null;
}

/**
 * Creates a fluent Supabase query builder chain that resolves properly
 * on await, .single(), .maybeSingle(), or any filter method.
 */
export function createSupabaseChain<T = any>(
  arrayResult: MockQueryResult<T[]> = { data: [], error: null, count: 0 },
  singleResult: MockQueryResult<T | null> = { data: null, error: null }
) {
  const chain: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'single' || prop === 'maybeSingle') {
          return vi.fn().mockResolvedValue(singleResult);
        }
        if (prop === 'then') {
          return (resolve: any, reject: any) => Promise.resolve(arrayResult).then(resolve, reject);
        }
        return vi.fn(() => chain);
      },
    }
  );
  return chain;
}

/**
 * Creates a configurable mock Supabase client suitable for unit/context tests.
 */
export function createMockSupabase(options?: {
  orgId?: string;
  userId?: string;
  tableHandlers?: Record<string, () => any>;
}) {
  const orgId = options?.orgId ?? TEST_ORG_ID;
  const userId = options?.userId ?? TEST_USER_ID;

  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  const from = vi.fn((table: string) => {
    if (options?.tableHandlers?.[table]) {
      return options.tableHandlers[table]();
    }
    return createSupabaseChain();
  });

  const auth = {
    getSession: vi.fn().mockResolvedValue({
      data: {
        session: {
          user: {
            id: userId,
            user_metadata: { org_id: orgId },
          },
        },
      },
      error: null,
    }),
    getUser: vi.fn().mockResolvedValue({
      data: {
        user: {
          id: userId,
          user_metadata: { org_id: orgId },
        },
      },
      error: null,
    }),
  };

  return {
    rpc,
    from,
    auth,
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    })),
    removeChannel: vi.fn(),
  };
}
