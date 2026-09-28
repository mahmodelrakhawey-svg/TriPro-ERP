import React from 'react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FacilityMaintenanceManager } from './FacilityMaintenanceManager';
import { supabase } from '@/supabaseClient';
import { useAccounting } from '@/context/AccountingContext';
import * as stadiumHelpers from '../stadiumHelpers';

// 1. Mock Contexts
vi.mock('@/context/AccountingContext', () => ({
  useAccounting: vi.fn(),
}));

// 2. Mock stadiumHelpers
vi.mock('../stadiumHelpers', async (importOriginal) => {
  const actual = await importOriginal<typeof stadiumHelpers>();
  return {
    ...actual,
    getTreasuryAccounts: vi.fn().mockResolvedValue([
      { id: 'acc-treasury-1', name: 'الخزينة الرئيسية للمجمع', code: '1011' },
      { id: 'acc-bank-1', name: 'حساب البنك الأهلي', code: '1012' },
    ]),
    createMaintenancePaymentJournalEntry: vi.fn().mockResolvedValue({
      success: true,
      journalEntryId: 'JE-MNT-999',
    }),
  };
});

// 3. Mock Supabase
const mockTickets = [
  {
    id: 'ticket-1',
    ticket_number: 'MNT-100001',
    organization_id: 'org-test-123',
    facility_id: 'fac-1',
    title: 'صيانة كشافات الملعب الخماسي أ',
    maintenance_type: 'routine',
    priority: 'high',
    start_date: '2026-09-01',
    end_date: '2026-09-02',
    status: 'scheduled',
    estimated_cost: 1500,
    actual_cost: 0,
    assigned_technician: 'مهندس أحمد علي',
    stadium_facilities: { name: 'الملعب الرئيسي (نجيل طبيعي)', type: 'football' },
  },
  {
    id: 'ticket-2',
    ticket_number: 'MNT-100002',
    organization_id: 'org-test-123',
    facility_id: 'fac-2',
    title: 'تغيير فلاتر مياه مجمع السباحة',
    maintenance_type: 'emergency',
    priority: 'urgent',
    start_date: '2026-09-05',
    end_date: '2026-09-05',
    status: 'completed',
    estimated_cost: 3000,
    actual_cost: 3200,
    assigned_technician: 'فني طوارئ السباكة',
    stadium_facilities: { name: 'المسبح الأولمبي', type: 'swimming_pool' },
  },
];

const mockFacilities = [
  { id: 'fac-1', name: 'الملعب الرئيسي (نجيل طبيعي)', type: 'football' },
  { id: 'fac-2', name: 'المسبح الأولمبي', type: 'swimming_pool' },
];

const mockTicketsChain = {
  select: vi.fn(() => mockTicketsChain),
  eq: vi.fn(() => mockTicketsChain),
  order: vi.fn(() => mockTicketsChain),
  or: vi.fn(() => mockTicketsChain),
  insert: vi.fn().mockResolvedValue({ data: null, error: null }),
  update: vi.fn().mockResolvedValue({ data: null, error: null }),
  delete: vi.fn().mockResolvedValue({ data: null, error: null }),
  then: vi.fn((onfulfilled: any) => {
    return Promise.resolve({ data: mockTickets, error: null }).then(onfulfilled);
  }),
};

vi.mock('@/supabaseClient', () => {
  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'stadium_facilities') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: mockFacilities, error: null }),
          };
        }
        if (table === 'accounts') {
          return {
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            ilike: vi.fn().mockReturnThis(),
            then: vi.fn((cb: any) => Promise.resolve({ data: null, error: null }).then(cb)),
          };
        }
        if (table === 'stadium_maintenance_tickets') {
          return mockTicketsChain;
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          then: vi.fn((cb: any) => Promise.resolve({ data: [], error: null }).then(cb)),
        };
      }),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
  };
});

describe('🏟️ FacilityMaintenanceManager UI & Operational Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAccounting as any).mockReturnValue({
      currentUser: { id: 'usr-1', full_name: 'مدير الصيانة', organization_id: 'org-test-123' },
      organization: { id: 'org-test-123', name: 'نادي لينزا الرياضي' },
      currentSelectedOrgId: 'org-test-123',
    });
  });

  it('يعرض الشاشة وقائمة أوامر الصيانة المجدولة مع تفاصيل المنشأة والفني والتكلفة', async () => {
    render(<FacilityMaintenanceManager />);

    expect(screen.getByText('إدارة الصيانة الميدانية للملاعب والمرافق')).toBeDefined();
    expect(screen.getByRole('button', { name: /جدولة أمر صيانة جديد/i })).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText('صيانة كشافات الملعب الخماسي أ')).toBeDefined();
      expect(screen.getByText(/MNT-100001/)).toBeDefined();
      expect(screen.getByText('تغيير فلاتر مياه مجمع السباحة')).toBeDefined();
      expect(screen.getByText(/MNT-100002/)).toBeDefined();
    });
  });

  it('يفتح نافذة "جدولة أمر صيانة جديد" عند الضغط على الزر المخصص', async () => {
    render(<FacilityMaintenanceManager />);

    const addBtn = screen.getByRole('button', { name: /جدولة أمر صيانة جديد/i });
    fireEvent.click(addBtn);

    await waitFor(() => {
      // حقل بيان الصيانة داخل المودال
      expect(screen.getByPlaceholderText('مثال: تغيير رول النجيل الصناعي لكامل الملعب')).toBeDefined();
      expect(screen.getByText('المرفق / الملعب المستهدف *')).toBeDefined();
    });
  });

  it('يحتوي على فلاتر البحث والمرافق والحالات لتصفية التذاكر بسلاسة', async () => {
    render(<FacilityMaintenanceManager />);

    const searchInput = screen.getByPlaceholderText('بحث بالموضوع، رقم الأمر، أو الفني المسؤول...');
    expect(searchInput).toBeDefined();

    // البحث
    fireEvent.change(searchInput, { target: { value: 'فلاتر' } });
    expect((searchInput as HTMLInputElement).value).toBe('فلاتر');
  });
});
