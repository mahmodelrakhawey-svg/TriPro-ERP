import { describe, it, expect } from 'vitest';
import { 
  validateEntryBalance, 
  calculateShiftCashVariance, 
  convertForeignInvoiceToLocal 
} from '../utils/financialSafety';

describe('🛡️ Financial Safety & Cash Reconciliation Unit Tests', () => {
  it('should detect cash deficit (shortage) and suggest account 541', () => {
    const variance = calculateShiftCashVariance(5000, 4850);
    expect(variance.isDeficit).toBe(true);
    expect(variance.isSurplus).toBe(false);
    expect(variance.variance).toBe(-150);
    expect(variance.recommendedAccountCode).toBe('541');
  });

  it('should detect cash surplus and suggest account 441', () => {
    const variance = calculateShiftCashVariance(3000, 3120.50);
    expect(variance.isDeficit).toBe(false);
    expect(variance.isSurplus).toBe(true);
    expect(variance.variance).toBe(120.50);
    expect(variance.recommendedAccountCode).toBe('441');
  });

  it('should detect exact match when counted cash equals expected cash', () => {
    const variance = calculateShiftCashVariance(2500, 2500);
    expect(variance.isExactMatch).toBe(true);
    expect(variance.variance).toBe(0);
  });

  it('should convert foreign currency to local with exact 14% VAT precision', () => {
    const converted = convertForeignInvoiceToLocal(1000, 48.50, 0.14);
    expect(converted.localAmount).toBe(48500);
    expect(converted.vatLocal).toBe(6790);
    expect(converted.grossLocal).toBe(55290);
  });
});
