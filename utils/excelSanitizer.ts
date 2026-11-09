/**
 * Utility to sanitize values before exporting to CSV/Excel
 * Neutralizes Excel Formula Injection (CWE-1236) where values starting with =, +, -, @
 * could be executed as formulas by spreadsheet software.
 */
export function sanitizeExcelValue(value: unknown): unknown {
  if (typeof value === 'string' && value.length > 0) {
    const firstChar = value.charAt(0);
    if (firstChar === '=' || firstChar === '+' || firstChar === '-' || firstChar === '@') {
      return `'${value}`;
    }
  }
  return value;
}

export function sanitizeExcelRows<T extends Record<string, any>>(rows: T[]): T[] {
  return rows.map(row => {
    const sanitized: Record<string, any> = {};
    for (const [key, val] of Object.entries(row)) {
      sanitized[key] = sanitizeExcelValue(val);
    }
    return sanitized as T;
  });
}
