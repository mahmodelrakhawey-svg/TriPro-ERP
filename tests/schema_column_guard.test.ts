import { describe, it, expect } from 'vitest';
import { runSchemaGuard } from '../scripts/verify-code-schema.mjs';

describe('🛡️ Supabase Schema Column Guard', () => {
  it('ensures all static .from(table) queries use only columns defined in supabase/schema_columns.json', () => {
    const violations = runSchemaGuard();
    if (violations.length > 0) {
      const details = violations
        .map((v) => `${v.file}:${v.line} -> ${v.table}.${v.column} (${v.context})`)
        .join('\n');
      expect.fail(`Found ${violations.length} schema column mismatch(es):\n${details}`);
    }
    expect(violations).toEqual([]);
  });
});
