import { Account, AccountType } from './types';

// This constant is deprecated. The chart of accounts is now managed
// exclusively through the SQL seeding script (egyptian_coa_full.sql)
// to ensure a single source of truth and prevent conflicts.
// Keeping the array empty prevents accidental use of an outdated COA.
export const INITIAL_ACCOUNTS: Omit<Account, 'id' | 'balance'>[] = [];
