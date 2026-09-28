import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChequesPage } from './ChequesPage';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';

// 1. Mock React Router
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

// 2. Mock Contexts
vi.mock('../../context/AccountingContext', () => ({
  useAccounting: vi.fn(),
}));

vi.mock('../../context/ToastContext', () => ({
  useToast: vi.fn(),
}));

// 3. Mock Recharts
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div data-testid="recharts-container">{children}</div>,
  PieChart: ({ children }: any) => <div>{children}</div>,
  Pie: ({ children }: any) => <div>{children}</div>,
  Cell: () => <div />,
  Tooltip: () => <div />,
  Legend: () => <div />,
}));

// 4. Mock Data
const mockCheques = [
  {
    id: 'chq-1',
    cheque_number: 'CHQ-2026-001',
    organization_id: 'org-test-123',
    type: 'outgoing',
    amount: 25000,
    due_date: '2026-10-15',
    party_id: 'supp-1',
    party_name: 'شركة السويدي للكابلات',
    bank_name: 'البنك التجاري الدولي CIB',
    status: 'issued',
    created_at: '2026-09-20T10:00:00Z',
    cheque_attachments: [],
  },
  {
    id: 'chq-2',
    cheque_number: 'CHQ-2026-002',
    organization_id: 'org-test-123',
    type: 'incoming',
    amount: 45000,
    due_date: '2026-11-01',
    party_id: 'cust-1',
    party_name: 'شركة المقاولون العرب',
    bank_name: 'بنك مصر',
    status: 'received',
    created_at: '2026-09-22T10:00:00Z',
    cheque_attachments: [],
  },
];

const mockSuppliers = [
  { id: 'supp-1', name: 'شركة السويدي للكابلات', phone: '01000000001' },
];

const mockCustomers = [
  { id: 'cust-1', name: 'شركة المقاولون العرب', phone: '01000000002' },
];

const mockBankAccounts = [
  { id: 'acc-b1', name: 'حساب بنك CIB جاري', code: '101021', type: 'asset' },
  { id: 'acc-b2', name: 'حساب بنك مصر جاري', code: '101022', type: 'asset' },
];

const mockChequesChain = {
  select: vi.fn(() => mockChequesChain),
  eq: vi.fn(() => mockChequesChain),
  gte: vi.fn(() => mockChequesChain),
  lte: vi.fn(() => mockChequesChain),
  order: vi.fn(() => mockChequesChain),
  insert: vi.fn().mockResolvedValue({ data: null, error: null }),
  update: vi.fn().mockResolvedValue({ data: null, error: null }),
  delete: vi.fn().mockResolvedValue({ data: null, error: null }),
  then: vi.fn((onfulfilled: any) => {
    return Promise.resolve({ data: mockCheques, error: null }).then(onfulfilled);
  }),
};

vi.mock('../../supabaseClient', () => {
  return {
    supabase: {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              user: {
                user_metadata: { org_id: 'org-test-123' },
              },
            },
          },
        }),
      },
      from: vi.fn((table: string) => {
        if (table === 'cheques') {
          return mockChequesChain;
        }
        if (table === 'suppliers') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: mockSuppliers, error: null }),
          };
        }
        if (table === 'subcontractors') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        if (table === 'customers') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: mockCustomers, error: null }),
          };
        }
        if (table === 'accounts') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: mockBankAccounts, error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          then: vi.fn((cb: any) => Promise.resolve({ data: [], error: null }).then(cb)),
        };
      }),
      rpc: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: { company_name: 'لينزا جروب' }, error: null }),
      }),
    },
  };
});

describe('🏦 ChequesPage (Banking & Cheques Management) Tests', () => {
  const mockShowToast = vi.fn();
  const mockUpdateChequeStatus = vi.fn().mockResolvedValue(true);
  const mockAddCheque = vi.fn().mockResolvedValue(true);

  beforeEach(() => {
    vi.clearAllMocks();
    (supabase.rpc as any).mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: { company_name: 'لينزا جروب' }, error: null }),
    });
    (useAccounting as any).mockReturnValue({
      currentUser: { id: 'usr-demo', role: 'demo', full_name: 'مدير مالي تجريبي', organization_id: 'org-test-123' },
      organization: { id: 'org-test-123', name: 'شركة لينزا' },
      addCheque: mockAddCheque,
      updateCheque: vi.fn(),
      deleteCheque: vi.fn(),
      updateChequeStatus: mockUpdateChequeStatus,
      addEntry: vi.fn(),
      getSystemAccount: vi.fn(),
      selectedFiscalYear: null,
    });
    (useToast as any).mockReturnValue({
      showToast: mockShowToast,
    });
  });

  it('يعرض واجهة الشيكات مع تبويبات أوراق القبض وأوراق الدفع وإحصائيات المحفظة', async () => {
    render(<ChequesPage />);

    expect(screen.getByText('أوراق القبض والدفع (الشيكات)')).toBeDefined();
    expect(screen.getByText('تسجيل شيك جديد')).toBeDefined();
    expect(screen.getByText('أوراق الدفع (للموردين)')).toBeDefined();
    expect(screen.getByText('أوراق القبض (من العملاء)')).toBeDefined();

    // التبويب الافتراضي هو أوراق الدفع للموردين
    await waitFor(() => {
      expect(screen.getByText('CHQ-001')).toBeDefined();
      expect(screen.getAllByText('مورد تجريبي').length).toBeGreaterThan(0);
      expect(screen.getAllByText('بنك الرياض').length).toBeGreaterThan(0);
    });
  });

  it('يتنقل بسلاسة بين أوراق الدفع وأوراق القبض ويعرض الشيكات الواردة من العملاء', async () => {
    render(<ChequesPage />);

    await waitFor(() => {
      expect(screen.getByText('CHQ-001')).toBeDefined();
    });

    // النقر على تبويب أوراق القبض
    const incomingTab = screen.getByText('أوراق القبض (من العملاء)');
    fireEvent.click(incomingTab);

    // التحقق من ظهور الشيك الوارد للعميل
    await waitFor(() => {
      expect(screen.getByText('CHQ-002')).toBeDefined();
      expect(screen.getAllByText('عميل تجريبي').length).toBeGreaterThan(0);
      expect(screen.getAllByText('البنك الأهلي').length).toBeGreaterThan(0);
    });
  });

  it('يفتح نافذة تسجيل شيك جديد ويتيح تعبئة رقم الشيك والمبلغ وتاريخ الاستحقاق', async () => {
    render(<ChequesPage />);

    await waitFor(() => {
      expect(screen.getByText('CHQ-001')).toBeDefined();
    });

    const newChequeBtn = screen.getByText('تسجيل شيك جديد');
    fireEvent.click(newChequeBtn);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 3, name: /تسجيل شيك صادر/i })).toBeDefined();
      expect(screen.getByPlaceholderText('اسم البنك...')).toBeDefined();
      expect(screen.getByPlaceholderText('ملاحظات إضافية...')).toBeDefined();
    });
  });
});
