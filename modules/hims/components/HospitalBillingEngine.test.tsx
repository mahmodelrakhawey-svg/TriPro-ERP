import React from 'react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HospitalBillingEngine } from './HospitalBillingEngine';
import { supabase } from '@/supabaseClient';
import { useAccounting } from '@/context/AccountingContext';
import { useAuth } from '@/context/AuthContext';

// 1. Mocking Contexts
vi.mock('@/context/AccountingContext', () => ({
  useAccounting: vi.fn(),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

// 2. Mocking Supabase Client
vi.mock('@/supabaseClient', () => {
  const mockSupabase = {
    rpc: vi.fn(),
    from: vi.fn().mockImplementation(() => ({
      select: vi.fn().mockImplementation(() => ({
        eq: vi.fn().mockImplementation(() => ({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
    })),
  };
  return { supabase: mockSupabase };
});

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated
      removeListener: vi.fn(), // deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

describe('HospitalBillingEngine Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mocks
    (useAccounting as any).mockReturnValue({
      settings: { id: 'org-123', organization_id: 'org-123' },
    });
    
    (useAuth as any).mockReturnValue({
      currentUser: { id: 'usr-123', role: 'admin', organization_id: 'org-123' },
    });
  });

  it('renders input for visit ID and checks calculate action', async () => {
    // Mock RPC and Billing fetch
    const mockRpc = vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: 'bill-123', error: null } as any);
    const mockFrom = vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'hims_billing') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'bill-123',
              visit_id: 'e4b3e41b-4f51-4091-a169-d3fb8f3d1222',
              total_amount: 1000,
              patient_paid_amount: 200,
              insurance_covered_amount: 0,
              hims_patients: { full_name: 'أحمد محمد أحمد' }
            },
            error: null
          } as any)
        } as any;
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null })
      } as any;
    });

    render(<HospitalBillingEngine visitId="e4b3e41b-4f51-4091-a169-d3fb8f3d1222" />);

    // Trigger button search/calculation
    const calcButton = screen.getByRole('button', { name: /إصدار الفاتورة اللحظية/i });
    expect(calcButton).toBeDefined();
    
    fireEvent.click(calcButton);

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('hims_prepare_invoice', { p_visit_id: 'e4b3e41b-4f51-4091-a169-d3fb8f3d1222' });
      expect(screen.getByText('أحمد محمد أحمد')).toBeDefined();
    });
  });
});
