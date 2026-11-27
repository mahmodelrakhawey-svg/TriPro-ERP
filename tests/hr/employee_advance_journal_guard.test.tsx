import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EmployeeAdvances from '../../modules/hr/components/EmployeeAdvances';

const { mockAddEntry, mockShowToast, mockRpc, mockFrom } = vi.hoisted(() => ({
  mockAddEntry: vi.fn(),
  mockShowToast: vi.fn(),
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
}));

const VALID_ORG_ID = '11111111-1111-4111-8111-111111111111';
const VALID_EMP_ID = '22222222-2222-4222-8222-222222222222';
const VALID_TREASURY_ID = '33333333-3333-4333-8333-333333333333';
const VALID_ADV_ACC_ID = '44444444-4444-4444-8444-444444444444';

vi.mock('../../supabaseClient', () => ({
  supabase: {
    rpc: mockRpc,
    from: mockFrom,
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
    },
  },
}));

vi.mock('../../context/AccountingContext', () => ({
  useAccounting: () => ({
    addEntry: mockAddEntry,
    getSystemAccount: (key: string) =>
      key === 'EMPLOYEE_ADVANCES' ? { id: VALID_ADV_ACC_ID, code: '1223', name: 'سلف العاملين' } : undefined,
    accounts: [
      { id: VALID_ADV_ACC_ID, code: '1223', name: 'سلف العاملين', isGroup: false },
      { id: VALID_TREASURY_ID, code: '1231', name: 'الخزينة الرئيسية', isGroup: false },
    ],
    currentUser: { id: 'user-1', role: 'admin', organization_id: VALID_ORG_ID },
    currentSelectedOrgId: VALID_ORG_ID,
    organization: { id: VALID_ORG_ID, name: 'شركة اختبار' },
    refreshData: vi.fn(),
  }),
}));

vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('../../components/EmployeeSearchSelect', () => ({
  default: ({ value, onChange }: any) => (
    <select data-testid="emp-select" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">اختر</option>
      <option value={VALID_EMP_ID}>أحمد علي</option>
    </select>
  ),
}));

describe('EmployeeAdvances journal creation fallback guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAddEntry.mockResolvedValue(undefined);
    mockRpc.mockResolvedValue({
      data: {
        success: true,
        advance_id: '55555555-5555-5555-5555-555555555555',
        reference: 'ADV-261127-1001',
        journal_id: null,
      },
      error: null,
    });

    mockFrom.mockImplementation((table: string) => {
      const chain: Record<string, any> = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        is: vi.fn(() => chain),
        or: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        range: vi.fn(async () => ({ data: [], error: null })),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        then: (resolve: any) => {
          if (table === 'employees') {
            return Promise.resolve({
              data: [{ id: VALID_EMP_ID, full_name: 'أحمد علي', status: 'active', basic_salary: 5000 }],
              error: null,
            }).then(resolve);
          }
          if (table === 'accounts') {
            return Promise.resolve({
              data: [{ id: VALID_TREASURY_ID, code: '1231', name: 'الخزينة الرئيسية', is_group: false }],
              error: null,
            }).then(resolve);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve);
        },
      };
      return chain;
    });
  });

  it('creates missing journal entry via addEntry when create_employee_advance returns journal_id: null', async () => {
    render(<EmployeeAdvances />);

    await waitFor(() => {
      expect(screen.getByText(/الخزينة الرئيسية/)).toBeTruthy();
    });

    fireEvent.click(screen.getByText('تسجيل سلفة جديدة'));

    await waitFor(() => {
      expect(screen.getByTestId('emp-select')).toBeTruthy();
    });

    fireEvent.change(screen.getByTestId('emp-select'), { target: { value: VALID_EMP_ID } });
    fireEvent.change(screen.getByPlaceholderText('أدخل المبلغ...'), { target: { value: '500' } });

    const submitBtn = screen.getByText('حفظ وصرف السلفة').closest('button')!;
    fireEvent.submit(submitBtn.closest('form')!);

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalled();
    });
    expect(mockShowToast).toHaveBeenCalledWith('تم حفظ السلفة وترحيل القيد بنجاح ✅', 'success');
    expect(mockRpc).toHaveBeenCalled();
    expect(mockAddEntry).toHaveBeenCalledTimes(1);

    expect(mockAddEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: 'ADV-261127-1001',
        p_org_id: VALID_ORG_ID,
        status: 'posted',
      })
    );
    expect(mockShowToast).toHaveBeenCalledWith('تم حفظ السلفة وترحيل القيد بنجاح ✅', 'success');
  });
});
