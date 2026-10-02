import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MidnightAuditShieldCard } from './MidnightAuditShieldCard';

vi.mock('../../../services/auditDaemonService', () => ({
  auditDaemonService: {
    runSystemAudit: vi.fn().mockResolvedValue({
      organizationId: 'test-org-123',
      timestamp: '2026-09-28T03:00:00Z',
      overallStatus: 'passed',
      checks: [
        {
          id: 'pillar-gl',
          pillar: 'gl_balance',
          title: 'توازن الأستاذ العام (إجمالي المدين = إجمالي الدائن)',
          expected: 500000,
          actual: 500000,
          variance: 0,
          status: 'passed',
          notes: 'متوازن 100%'
        },
        {
          id: 'pillar-ar',
          pillar: 'ar_subledger',
          title: 'مطابقة سجل العملاء مع حساب مراقبة المدينين',
          expected: 120000,
          actual: 120000,
          variance: 0,
          status: 'passed',
          notes: 'متطابق'
        },
        {
          id: 'pillar-ap',
          pillar: 'ap_subledger',
          title: 'مطابقة سجل الموردين مع حساب مراقبة الدائنين',
          expected: 80000,
          actual: 80000,
          variance: 0,
          status: 'passed',
          notes: 'متطابق'
        },
        {
          id: 'pillar-inventory',
          pillar: 'inventory_valuation',
          title: 'مطابقة التقييم الكمي للمخزون مع حساب البضاعة',
          expected: 250000,
          actual: 250000,
          variance: 0,
          status: 'passed',
          notes: 'متطابق'
        }
      ],
      summary: {
        totalChecks: 4,
        passedCount: 4,
        failedCount: 0
      }
    }),
    triggerAutoReconciliation: vi.fn().mockResolvedValue({ success: true, message: 'تم التحديث' })
  }
}));

vi.mock('react-hot-toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  }
}));

describe('🛡️ MidnightAuditShieldCard Component Tests', () => {
  it('يعرض درع التدقيق المحاسبي الليلي مع الأركان الأربعة وحالة النزاهة', async () => {
    render(<MidnightAuditShieldCard organizationId="test-org-123" />);

    await waitFor(() => {
      expect(screen.getByText(/درع النزاهة والتدقيق المحاسبي الليلي/i)).toBeDefined();
      expect(screen.getByText(/4\/4 أركان متطابقة تماماً/i)).toBeDefined();
      expect(screen.getByText(/توازن الأستاذ العام/i)).toBeDefined();
      expect(screen.getByText(/مطابقة سجل العملاء/i)).toBeDefined();
    });
  });

  it('يتعامل بسلاسة مع القيم المعدومة (null/undefined) دون حدوث أي خطأ في toLocaleString', async () => {
    const { auditDaemonService } = await import('../../../services/auditDaemonService');
    (auditDaemonService.runSystemAudit as any).mockResolvedValueOnce({
      organizationId: 'test-org-123',
      timestamp: '2026-09-28T03:00:00Z',
      overallStatus: 'passed',
      checks: [
        {
          id: 'pillar-gl',
          pillar: 'gl_balance',
          title: 'توازن الأستاذ العام',
          expected: null,
          actual: null,
          variance: null,
          status: 'passed',
          notes: 'فحص تجريبي لقيم فارغة'
        }
      ],
      summary: { totalChecks: 1, passedCount: 1, failedCount: 0 }
    });

    render(<MidnightAuditShieldCard organizationId="test-org-123" />);

    await waitFor(() => {
      expect(screen.getByText(/توازن الأستاذ العام/i)).toBeDefined();
      expect(screen.getAllByText(/0.00/i).length).toBeGreaterThan(0);
    });
  });
});
