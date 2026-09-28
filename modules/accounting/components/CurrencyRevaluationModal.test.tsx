import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CurrencyRevaluationModal } from './CurrencyRevaluationModal';

vi.mock('../../../services/currencyRevaluationService', () => ({
  currencyRevaluationService: {
    getForeignCurrencyAccounts: vi.fn().mockResolvedValue([
      {
        accountId: 'acc-usd-1',
        accountCode: '123201',
        accountName: 'حساب بنكي دولار',
        currency: 'USD',
        foreignBalance: 1000,
        currentBookBalanceEGP: 48000,
      }
    ]),
    calculateRevaluation: vi.fn().mockReturnValue({
      totalGainEGP: 600,
      totalLossEGP: 0,
      netVarianceEGP: 600,
      items: [
        {
          account: {
            accountId: 'acc-usd-1',
            accountCode: '123201',
            accountName: 'حساب بنكي دولار',
            currency: 'USD',
            foreignBalance: 1000,
            currentBookBalanceEGP: 48000,
          },
          newExchangeRate: 48.60,
          newValuatedAmountEGP: 48600,
          unrealizedGainLossEGP: 600,
          type: 'gain',
        }
      ]
    }),
    executeRevaluationPosting: vi.fn().mockResolvedValue({ success: true, reference: 'FX-REV-001' })
  },
  OFFICIAL_DEFAULT_RATES: {
    USD: 48.60,
    EUR: 52.80,
    SAR: 12.95,
    AED: 13.23,
    GBP: 63.40,
    KWD: 158.50,
  }
}));

vi.mock('react-hot-toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  }
}));

describe('💱 CurrencyRevaluationModal Component', () => {
  const mockAccounts = [
    { id: 'acc-gain-1', code: '42101', name: 'أرباح فروق العملة', balance: 0 },
    { id: 'acc-loss-1', code: '53401', name: 'خسائر فروق العملة', balance: 0 },
  ];

  it('يعرض شاشة معالج إعادة التقييم مع أسعار الصرف والأزرار الرقابية', async () => {
    const handleClose = vi.fn();
    const handleSuccess = vi.fn();

    render(
      <CurrencyRevaluationModal
        isOpen={true}
        onClose={handleClose}
        organizationId="test-org"
        accounts={mockAccounts}
        onSuccess={handleSuccess}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/معالج إعادة تقييم فروق أسعار صرف العملات/i)).toBeDefined();
      expect(screen.getByText(/أسعار الصرف الإقفالية المقابلة للجنيه المصري/i)).toBeDefined();
      expect(screen.getByText(/إجمالي أرباح التقييم/i)).toBeDefined();
      expect(screen.getByText(/إجمالي خسائر التقييم/i)).toBeDefined();
    });

    const cancelBtn = screen.getByRole('button', { name: /إلغاء/i });
    fireEvent.click(cancelBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
