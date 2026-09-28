import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AssetManager from './AssetManager';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';

// 1. Mock Subcomponents inside tabs
vi.mock('./components/AssetFieldScanner', () => ({
  AssetFieldScanner: () => <div data-testid="asset-field-scanner">ماسح الجرد الميداني</div>,
}));

vi.mock('./components/AssetLabelStudio', () => ({
  AssetLabelStudio: () => <div data-testid="asset-label-studio">استوديو طباعة الملصقات</div>,
}));

vi.mock('./components/AssetTransferManager', () => ({
  AssetTransferManager: () => <div data-testid="asset-transfer-manager">مناقلات المعدات للمشاريع</div>,
}));

// 2. Mock Contexts
vi.mock('../../context/AccountingContext', () => ({
  useAccounting: vi.fn(),
}));

vi.mock('../../context/ToastContext', () => ({
  useToast: vi.fn(),
}));

// 3. Mock Data
const mockAssets = [
  {
    id: 'asset-1',
    name: 'حفار كوماتسو هيدروليكي PC200',
    asset_tag: 'AST-EQ-001',
    purchaseDate: '2025-01-10',
    purchaseCost: 850000,
    salvageValue: 50000,
    usefulLife: 5,
    currentValue: 690000,
    accumulatedDepreciation: 160000,
    bookValue: 690000,
    assetAccountId: 'acc-ast-1',
    accumulatedDepreciationAccountId: 'acc-dep-1',
    depreciationExpenseAccountId: 'acc-exp-1',
    status: 'ACTIVE',
  },
  {
    id: 'asset-2',
    name: 'خلاطة خرسانة مركزية 120م3',
    asset_tag: 'AST-EQ-002',
    purchaseDate: '2024-06-15',
    purchaseCost: 1200000,
    salvageValue: 100000,
    usefulLife: 10,
    currentValue: 980000,
    accumulatedDepreciation: 220000,
    bookValue: 980000,
    assetAccountId: 'acc-ast-1',
    accumulatedDepreciationAccountId: 'acc-dep-1',
    depreciationExpenseAccountId: 'acc-exp-1',
    status: 'ACTIVE',
  },
];

const mockAccounts = [
  { id: 'acc-ast-1', name: 'الأصول الثابتة - الآلات والمعدات', code: '121' },
  { id: 'acc-dep-1', name: 'مجمع إهلاك الآلات والمعدات', code: '122' },
  { id: 'acc-exp-1', name: 'مصروف إهلاك الآلات والمعدات', code: '511' },
];

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
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockResolvedValue({ data: null, error: null }),
        then: vi.fn((cb: any) => Promise.resolve({ data: [], error: null }).then(cb)),
      })),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
  };
});

describe('🏗️ AssetManager (Fixed Assets & Depreciation) Tests', () => {
  const mockShowToast = vi.fn();
  const mockAddAsset = vi.fn().mockResolvedValue(true);
  const mockRunDepreciation = vi.fn().mockResolvedValue(true);

  beforeEach(() => {
    vi.clearAllMocks();
    (useAccounting as any).mockReturnValue({
      currentUser: { id: 'usr-1', role: 'admin', full_name: 'مدير الأصول', organization_id: 'org-test-123' },
      organization: { id: 'org-test-123', name: 'شركة المقاولات الإنشائية' },
      currentSelectedOrgId: 'org-test-123',
      assets: mockAssets,
      accounts: mockAccounts,
      addAsset: mockAddAsset,
      updateAsset: vi.fn(),
      deleteAsset: vi.fn(),
      runDepreciation: mockRunDepreciation,
      revaluateAsset: vi.fn(),
    });
    (useToast as any).mockReturnValue({
      showToast: mockShowToast,
    });
  });

  it('يعرض شاشة الأصول الثابتة وقائمة المعدات والتكلفة التاريخية والقيمة الدفترية', async () => {
    render(<AssetManager />);

    expect(screen.getByText(/إدارة الأصول الثابتة والمعدات/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /إضافة أصل/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /تشغيل الإهلاك الشهري/i })).toBeDefined();

    // التحقق من ظهور المعدات
    await waitFor(() => {
      expect(screen.getByText('حفار كوماتسو هيدروليكي PC200')).toBeDefined();
      expect(screen.getByText('خلاطة خرسانة مركزية 120م3')).toBeDefined();
    });
  });

  it('يتنقل بين تبويبات سجل الأصول وماسح الجرد واستوديو الملصقات ومناقلات المشاريع', async () => {
    render(<AssetManager />);

    // التبديل إلى ماسح الجرد
    const scannerTab = screen.getByRole('button', { name: /ماسح الجرد الميداني/i });
    fireEvent.click(scannerTab);
    expect(screen.getByTestId('asset-field-scanner')).toBeDefined();

    // التبديل إلى استوديو الملصقات
    const labelTab = screen.getByRole('button', { name: /استوديو طباعة ملصقات/i });
    fireEvent.click(labelTab);
    expect(screen.getByTestId('asset-label-studio')).toBeDefined();

    // التبديل إلى مناقلات المعدات
    const transferTab = screen.getByRole('button', { name: /مناقلات معدات/i });
    fireEvent.click(transferTab);
    expect(screen.getByTestId('asset-transfer-manager')).toBeDefined();
  });

  it('يفتح نافذة "إضافة أصل جديد" ويعرض حقول التكلفة والعمر الإنتاجي وتعيين الحسابات المالية', async () => {
    render(<AssetManager />);

    const addBtn = screen.getByRole('button', { name: /إضافة أصل/i });
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(screen.getByText('إضافة أصل جديد')).toBeDefined();
      expect(screen.getByText('قيمة الخردة')).toBeDefined();
      expect(screen.getByText('العمر الإنتاجي (سنوات)')).toBeDefined();
      expect(screen.getByText('حساب مجمع الإهلاك')).toBeDefined();
      expect(screen.getByRole('button', { name: /حفظ الأصل/i })).toBeDefined();
    });
  });

  it('يفتح نافذة تشغيل الإهلاك الشهري ويتيح تحديد تاريخ الإهلاك', async () => {
    render(<AssetManager />);

    const depBtn = screen.getByRole('button', { name: /تشغيل الإهلاك الشهري/i });
    fireEvent.click(depBtn);

    await waitFor(() => {
      expect(screen.getByText('تشغيل إهلاك الفترة')).toBeDefined();
      expect(screen.getByText('تاريخ الإهلاك (نهاية الشهر)')).toBeDefined();
      expect(screen.getByRole('button', { name: /بدء المعالجة/i })).toBeDefined();
    });
  });
});
