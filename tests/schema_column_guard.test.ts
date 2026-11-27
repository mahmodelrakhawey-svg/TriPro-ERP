import { describe, it, expect } from 'vitest';
// @ts-expect-error -- plain JS verifier script without generated .d.ts
import { runSchemaGuard } from '../scripts/verify-code-schema.mjs';

interface SchemaViolation {
  file: string;
  line: number;
  table: string;
  column: string;
  context: string;
}

describe('🛡️ Supabase Schema Column Guard', () => {
  it('ensures all static .from(table) queries use only columns defined in supabase/schema_columns.json', () => {
    const violations = runSchemaGuard() as SchemaViolation[];
    if (violations.length > 0) {
      const details = violations
        .map((v: SchemaViolation) => `${v.file}:${v.line} -> ${v.table}.${v.column} (${v.context})`)
        .join('\n');
      expect.fail(`Found ${violations.length} schema column mismatch(es):\n${details}`);
    }
    expect(violations).toEqual([]);
  });
});
