import React from 'react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DischargeManager } from './DischargeManager';
import { supabase } from '@/supabaseClient';
import { useAuth } from '@/context/AuthContext';

// Mock Contexts
vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

// Mock Supabase Client
vi.mock('@/supabaseClient', () => {
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    then: vi.fn().mockImplementation((onfulfilled) => {
      if (onfulfilled) {
        return Promise.resolve(onfulfilled({ data: [], error: null }));
      }
      return Promise.resolve({ data: [], error: null });
    }),
  };

  const mockSupabase = {
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    from: vi.fn().mockImplementation(() => mockChain),
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

describe('DischargeManager Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      currentUser: { id: 'usr-123', role: 'admin', organization_id: 'org-123' },
    });
  });

  it('renders correctly and opens confirmation modal on click', async () => {
    const mockOnSuccess = vi.fn();
    render(<DischargeManager visitId="visit-123" onSuccess={mockOnSuccess} />);

    const dischargeButton = screen.getByRole('button', { name: /خروج نهائي/i });
    expect(dischargeButton).toBeDefined();

    fireEvent.click(dischargeButton);

    // Modal opens
    await waitFor(() => {
      expect(screen.getByText('هل أنت متأكد من اعتماد خروج المريض؟')).toBeDefined();
    });
  });
});
