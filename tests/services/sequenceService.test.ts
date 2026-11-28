import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getNextDocumentNumber } from '../../services/sequenceService';
import { TEST_ORG_ID } from '../helpers/factories';

const mockRpc = vi.fn();

vi.mock('../../supabaseClient', () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

describe('🔢 SequenceService — Gapless Sequential Document Numbers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('يستدعي RPC get_next_document_number بالمعاملات الصحيحة ويعيد الرقم المتسلسل', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'INV-000125', error: null });

    const docNum = await getNextDocumentNumber(TEST_ORG_ID, 'invoice');

    expect(mockRpc).toHaveBeenCalledWith('get_next_document_number', {
      p_org_id: TEST_ORG_ID,
      p_doc_type: 'invoice',
      p_prefix: 'INV-',
    });
    expect(docNum).toBe('INV-000125');
  });

  it('يستخدم البادئة الافتراضية الصحيحة لكل نوع مستند أو بادئة مخصصة', async () => {
    mockRpc.mockResolvedValue({ data: 'CUSTOM-0001', error: null });

    await getNextDocumentNumber(TEST_ORG_ID, 'purchase_invoice');
    expect(mockRpc).toHaveBeenLastCalledWith('get_next_document_number', {
      p_org_id: TEST_ORG_ID,
      p_doc_type: 'purchase_invoice',
      p_prefix: 'PUR-',
    });

    await getNextDocumentNumber(TEST_ORG_ID, 'receipt_voucher');
    expect(mockRpc).toHaveBeenLastCalledWith('get_next_document_number', {
      p_org_id: TEST_ORG_ID,
      p_doc_type: 'receipt_voucher',
      p_prefix: 'RV-',
    });

    await getNextDocumentNumber(TEST_ORG_ID, 'invoice', 'LENZA-');
    expect(mockRpc).toHaveBeenLastCalledWith('get_next_document_number', {
      p_org_id: TEST_ORG_ID,
      p_doc_type: 'invoice',
      p_prefix: 'LENZA-',
    });
  });

  it('يعود إلى التوليد الاحتياطي المتوافق عند فشل RPC أو غياب orgId (وضع الأوفلاين)', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'network offline' } });
    const offlineFallback = await getNextDocumentNumber(TEST_ORG_ID, 'payment_voucher');
    expect(offlineFallback).toMatch(/^PV-\d{6}$/);

    const noOrgFallback = await getNextDocumentNumber(null, 'sales_return');
    expect(noOrgFallback).toMatch(/^SR-\d{6}$/);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});
