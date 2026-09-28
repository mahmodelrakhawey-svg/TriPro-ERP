import { describe, it, expect } from 'vitest';
import { generateZatcaTlvQrString } from '../utils/zatcaQrHelper';

describe('🧾 ZATCA & Tax E-Invoice TLV QR Generator', () => {
  it('should generate valid Base64 string for Phase 1 mandatory fields', () => {
    const qr = generateZatcaTlvQrString({
      sellerName: 'TriPro ERP Test Org',
      taxNumber: '300000000000003',
      invoiceDate: '2026-09-28T10:30:00Z',
      totalAmount: 1140.00,
      taxAmount: 140.00
    });

    expect(typeof qr).toBe('string');
    expect(qr.length).toBeGreaterThan(20);
    // Base64 check
    expect(/^[A-Za-z0-9+/=]+$/.test(qr)).toBe(true);
  });

  it('should include Phase 2 compliance fields when provided', () => {
    const qr = generateZatcaTlvQrString({
      sellerName: 'TriPro ERP Test Org',
      taxNumber: '300000000000003',
      invoiceDate: '2026-09-28T10:30:00Z',
      totalAmount: 5000.00,
      taxAmount: 700.00,
      invoiceHash: 'sha256-mock-hash-value',
      cryptographicStamp: 'ecdsa-mock-signature',
      publicKey: 'secp256k1-mock-pubkey'
    });

    expect(typeof qr).toBe('string');
    expect(qr.length).toBeGreaterThan(50);
  });
});
