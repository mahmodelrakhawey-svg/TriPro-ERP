import { describe, it, expect, vi } from 'vitest';
import { parseGS1Barcode, formatGS1Date, stripAimPrefix } from '../utils/gs1BarcodeParser';

describe('GS1 Barcode & DataMatrix Parser', () => {
  it('should parse human-readable GS1 DataMatrix format with parentheses', () => {
    const raw = '(01)06221001000018(17)261231(10)LOT4567(21)SN9988';
    const parsed = parseGS1Barcode(raw);

    expect(parsed.isGS1).toBe(true);
    expect(parsed.gtin).toBe('06221001000018');
    expect(parsed.candidateCodes).toContain('06221001000018');
    expect(parsed.candidateCodes).toContain('6221001000018'); // EAN-13 equivalent
    expect(parsed.expiryDate).toBe('2026-12-31');
    expect(parsed.expiryDateRaw).toBe('261231');
    expect(parsed.batchNumber).toBe('LOT4567');
    expect(parsed.serialNumber).toBe('SN9988');
  });

  it('should parse raw GS1 DataMatrix string with FNC1 (ASCII 29) delimiters', () => {
    // 01 + 14 digits, 17 + 6 digits, 10 + batch, \x1d, 21 + serial
    const raw = '01062210010000181726101510BATCH999\x1d21SER12345';
    const parsed = parseGS1Barcode(raw);

    expect(parsed.isGS1).toBe(true);
    expect(parsed.gtin).toBe('06221001000018');
    expect(parsed.expiryDate).toBe('2026-10-15');
    expect(parsed.batchNumber).toBe('BATCH999');
    expect(parsed.serialNumber).toBe('SER12345');
  });

  it('should strip AIM symbology prefixes like ]d2', () => {
    const raw = ']d201062210010000181727050010MED2027';
    const parsed = parseGS1Barcode(raw);

    expect(parsed.isGS1).toBe(true);
    expect(parsed.gtin).toBe('06221001000018');
    // Day 00 means last day of month -> 2027-05-31
    expect(parsed.expiryDate).toBe('2027-05-31');
    expect(parsed.batchNumber).toBe('MED2027');
  });

  it('should handle standard plain GTIN-13 and GTIN-14 linear barcodes', () => {
    const raw13 = '6221001000018';
    const parsed13 = parseGS1Barcode(raw13);
    expect(parsed13.isGS1).toBe(true);
    expect(parsed13.gtin).toBe('06221001000018');
    expect(parsed13.candidateCodes).toContain('6221001000018');

    const raw14 = '16221001000015';
    const parsed14 = parseGS1Barcode(raw14);
    expect(parsed14.isGS1).toBe(true);
    expect(parsed14.gtin).toBe('16221001000015');
    expect(parsed14.candidateCodes).toContain('16221001000015');
  });

  it('should return isGS1: false for non-GS1 normal text or short barcodes', () => {
    const parsed = parseGS1Barcode('ITEM-1234');
    expect(parsed.isGS1).toBe(false);
    expect(parsed.candidateCodes.length).toBe(0);
  });

  it('should resolve scanned product and batch info when GS1 DataMatrix is scanned', async () => {
    vi.mock('../services/offlineService', () => {
      const mockProducts = [
        {
          id: 'prod-test-pharma-1',
          name: 'بانادول اكسترا أقراص',
          sku: 'MED-PAN-01',
          barcode: '6221001000018', // EAN-13 stored in DB
          sales_price: 35,
          cost_price: 25,
          stock: 50,
          organization_id: 'org-test'
        }
      ];

      return {
        db: {
          products: {
            toArray: vi.fn().mockResolvedValue(mockProducts)
          }
        }
      };
    });

    const { resolveScannedBarcode } = await import('../modules/retail/services/posProductResolver');

    // Scanner outputs GS1 DataMatrix with GTIN-14 (06221001000018), Expiry, Batch
    const scannedCode = '(01)06221001000018(17)271231(10)B9988(21)SN1122';
    const result = await resolveScannedBarcode(scannedCode, 'org-test');

    expect(result.matchedProduct).toBeDefined();
    expect(result.matchedProduct?.id).toBe('prod-test-pharma-1');
    expect(result.matchedProduct?.name).toBe('بانادول اكسترا أقراص');
    expect(result.parsedGS1?.isGS1).toBe(true);
    expect(result.parsedGS1?.gtin).toBe('06221001000018');
    expect(result.parsedGS1?.batchNumber).toBe('B9988');
    expect(result.parsedGS1?.expiryDate).toBe('2027-12-31');
    expect(result.parsedGS1?.serialNumber).toBe('SN1122');
  });
});
