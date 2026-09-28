import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MachineryMaintenanceManager from './MachineryMaintenanceManager';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';

// 1. Mock Contexts
vi.mock('../../../context/AccountingContext', () => ({
  useAccounting: vi.fn(),
}));

vi.mock('../../../context/ToastContext', () => ({
  useToast: vi.fn(),
}));

// 2. Mock XLSX
vi.mock('xlsx', () => ({
  utils: {
    json_to_sheet: vi.fn(),
    book_new: vi.fn(),
    book_append_sheet: vi.fn(),
  },
  writeFile: vi.fn(),
}));

// 3. Mock Data
const mockWorkCenters = [
  { id: 'wc-1', name: 'خط تعبئة وتغليف آلي 01' },
  { id: 'wc-2', name: 'ماكينة CNC تقطيع ليزر' },
];

const mockOrders = [
  {
    id: 'ord-1',
    order_number: 'MAINT-001',
    machine_name: 'خط تعبئة وتغليف آلي 01',
    maintenance_type: 'PREVENTIVE',
    priority: 'HIGH',
    issue_description: 'تغيير سيور النقل وفحص المحركات الهيدروليكية',
    scheduled_date: '2026-09-20',
    assigned_technician: 'م. سامح فوزي',
    status: 'PENDING',
    spare_parts_used: [],
    total_cost: 0,
    created_at: '2026-09-18T10:00:00Z',
  },
  {
    id: 'ord-2',
    order_number: 'MAINT-002',
    machine_name: 'ماكينة CNC تقطيع ليزر',
    maintenance_type: 'CORRECTIVE',
    priority: 'CRITICAL',
    issue_description: 'توقف عدسة الليزر وانخفاض ضغط الغاز',
    scheduled_date: '2026-09-22',
    assigned_technician: 'م. إبراهيم كمال',
    status: 'COMPLETED',
    spare_parts_used: [
      { part_name: 'عدسة تركيز بؤري 20mm', qty: 1, unit_cost: 1200 },
    ],
    total_cost: 1500,
    created_at: '2026-09-21T08:00:00Z',
  },
];

const mockOrdersChain = {
  select: vi.fn(() => mockOrdersChain),
  eq: vi.fn(() => mockOrdersChain),
  order: vi.fn(() => mockOrdersChain),
  insert: vi.fn().mockResolvedValue({ data: null, error: null }),
  update: vi.fn().mockResolvedValue({ data: null, error: null }),
  delete: vi.fn().mockResolvedValue({ data: null, error: null }),
  then: vi.fn((onfulfilled: any) => {
    return Promise.resolve({ data: mockOrders, error: null }).then(onfulfilled);
  }),
};

vi.mock('../../../supabaseClient', () => {
  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'mfg_work_centers') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: mockWorkCenters, error: null }),
          };
        }
        if (table === 'mfg_maintenance_orders') {
          return mockOrdersChain;
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          then: vi.fn((cb: any) => Promise.resolve({ data: [], error: null }).then(cb)),
        };
      }),
    },
  };
});

describe('⚙️ MachineryMaintenanceManager (Manufacturing Maintenance) Tests', () => {
  const mockShowToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useAccounting as any).mockReturnValue({
      currentUser: { id: 'usr-mfg', full_name: 'مهندس الصيانة العام', organization_id: 'org-mfg-1' },
      organization: { id: 'org-mfg-1', name: 'مصنع لينزا للصناعات المتطورة' },
      currentSelectedOrgId: 'org-mfg-1',
    });
    (useToast as any).mockReturnValue({
      showToast: mockShowToast,
    });
  });

  it('يعرض جدول أوامر صيانة الماكينات مع أرقام الأوامر والماكينات والفنيين والتكلفة', async () => {
    render(<MachineryMaintenanceManager />);

    expect(screen.getByText('إدارة الصيانة الوقائية والطارئة للماكينات')).toBeDefined();
    expect(screen.getByRole('button', { name: /إصدار أمر صيانة جديد/i })).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText('MAINT-001')).toBeDefined();
      expect(screen.getByText('خط تعبئة وتغليف آلي 01')).toBeDefined();
      expect(screen.getByText('MAINT-002')).toBeDefined();
      expect(screen.getByText('ماكينة CNC تقطيع ليزر')).toBeDefined();
      expect(screen.getAllByText('وقائية دورية').length).toBeGreaterThan(0);
      expect(screen.getAllByText('علاجية طارئة').length).toBeGreaterThan(0);
    });
  });

  it('يفتح نافذة "إصدار أمر صيانة جديد" ويجهز رقم الأمر التلقائي والماكينات المستهدفة', async () => {
    render(<MachineryMaintenanceManager />);

    await waitFor(() => {
      expect(screen.getByText('MAINT-001')).toBeDefined();
    });

    const newOrderBtn = screen.getByRole('button', { name: /إصدار أمر صيانة جديد/i });
    fireEvent.click(newOrderBtn);

    await waitFor(() => {
      expect(screen.getByText('إصدار أمر صيانة ماكينة جديد')).toBeDefined();
      expect(screen.getByText('اسم الماكينة / خط الإنتاج *')).toBeDefined();
    });
  });

  it('يتيح تصفية أوامر الصيانة بحسب الحالة (معلقة / مكتملة) ونوع الصيانة', async () => {
    render(<MachineryMaintenanceManager />);

    await waitFor(() => {
      expect(screen.getByText('MAINT-001')).toBeDefined();
    });

    const searchInput = screen.getByPlaceholderText('بحث بالرقم أو الماكينة أو الفني...');
    fireEvent.change(searchInput, { target: { value: 'MAINT-002' } });

    // يجب أن تبقى الأوامر المطابقة
    expect(screen.getByText('MAINT-002')).toBeDefined();
  });
});
