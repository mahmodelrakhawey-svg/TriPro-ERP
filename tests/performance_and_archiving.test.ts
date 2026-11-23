import { describe, it, expect, vi } from 'vitest';
import { sanitizeExcelValue, sanitizeExcelRows } from '../utils/excelSanitizer';
import { prefetchRoute } from '../utils/routePrefetcher';

describe('⚡ Frontend Performance & Smart Prefetching Tests', () => {
  it('should sanitize formulas to prevent CSV injection (CWE-1236)', () => {
    expect(sanitizeExcelValue('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
    expect(sanitizeExcelValue('+100')).toBe("'+100");
    expect(sanitizeExcelValue('-50')).toBe("'-50");
    expect(sanitizeExcelValue('@HYPERLINK("http://evil.com")')).toBe("'@HYPERLINK(\"http://evil.com\")");
    expect(sanitizeExcelValue('Normal Text')).toBe('Normal Text');
    expect(sanitizeExcelValue(12345)).toBe(12345);
  });

  it('should sanitize an entire array of row objects accurately', () => {
    const rawRows = [
      { name: 'John Doe', formula: '=cmd|/c calc!A0', balance: 5000 },
      { name: '+Evil', formula: 'Safe', balance: -200 }
    ];

    const sanitized = sanitizeExcelRows(rawRows);
    expect(sanitized[0].formula).toBe("'=cmd|/c calc!A0");
    expect(sanitized[1].name).toBe("'+Evil");
    expect(sanitized[0].balance).toBe(5000);
  });

  it('prefetchRoute should safely handle known, unknown, and empty routes without crashing', () => {
    expect(() => prefetchRoute('/pos')).not.toThrow();
    expect(() => prefetchRoute('/sales/invoices')).not.toThrow();
    expect(() => prefetchRoute('/unknown-route')).not.toThrow();
    expect(() => prefetchRoute(undefined)).not.toThrow();
    expect(() => prefetchRoute('')).not.toThrow();
  });
});
