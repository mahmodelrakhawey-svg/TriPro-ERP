import React from 'react';
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RetailPosScreen from './RetailPosScreen';
import { supabase } from '../../../../supabaseClient';
import { useAccounting } from '../../../../context/AccountingContext';
import { useToast } from '../../../../context/ToastContext';
import { db, offlineService } from '../../../../services/offlineService';

// 1. Mocking Contexts
vi.mock('../../../../context/AccountingContext', () => ({
  useAccounting: vi.fn(),
}));

vi.mock('../../../../context/ToastContext', () => ({
  useToast: vi.fn(),
}));

// 2. Mocking Dexie IndexedDB products & offlineService
vi.mock('../../../../services/offlineService', () => {
  const mockProducts = [
    { id: 'prod-1', name: 'جنية جبنة كيري', barcode: '12345', sales_price: 100, stock: 10, cost: 60 },
    { id: 'prod-2', name: 'لبن جهينة كامل الدسم', barcode: '67890', sales_price: 200, stock: 5, cost: 120 },
  ];

  const dbMock = {
    products: {
      where: vi.fn().mockImplementation((field) => ({
        equals: vi.fn().mockImplementation((val) => ({
          first: vi.fn().mockImplementation(() => {
            return Promise.resolve(mockProducts.find(p => (p as any)[field] === val));
          }),
        })),
      })),
      filter: vi.fn().mockImplementation((cb) => ({
        first: vi.fn().mockImplementation(() => {
          return Promise.resolve(mockProducts.find(cb));
        }),
      })),
      toArray: vi.fn().mockResolvedValue(mockProducts),
    },
    queuedOrders: {
      add: vi.fn().mockResolvedValue(1),
    },
  };

  return {
    db: dbMock,
    offlineService: {
      syncProductsLocally: vi.fn().mockResolvedValue(undefined),
      queueOrder: vi.fn().mockResolvedValue(undefined),
      processQueue: vi.fn().mockResolvedValue(undefined),
    },
  };
});

// 3. Mocking Supabase Client
vi.mock('../../../../supabaseClient', () => {
  const mockTerminalsChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    then: vi.fn((onfulfilled) => {
      return Promise.resolve({
        data: [{ id: 'term-123', name: 'الكاشير الرئيسي 1', cash_account_id: 'cash-acc', warehouse_id: 'wh-123' }],
        error: null,
      }).then(onfulfilled);
    }),
  };

  const mockShiftsChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnThis(),
    then: vi.fn((onfulfilled) => {
      return Promise.resolve({
        data: {
          id: 'shift-123',
          user_id: 'user-123',
          organization_id: 'org-123',
          opening_balance: 1000,
          pos_terminals: { id: 'term-123', name: 'الكاشير الرئيسي 1' },
        },
        error: null,
      }).then(onfulfilled);
    }),
  };

  const mockCustomersChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: vi.fn((onfulfilled) => {
      return Promise.resolve({
        data: [{ id: 'cust-123', name: 'أحمد علي', phone: '01012345678' }],
        error: null,
      }).then(onfulfilled);
    }),
  };

  return {
    supabase: {
      from: vi.fn((table) => {
        if (table === 'pos_terminals') return mockTerminalsChain;
        if (table === 'shifts') return mockShiftsChain;
        if (table === 'customers') return mockCustomersChain;
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          single: vi.fn().mockReturnThis(),
          then: vi.fn((onfulfilled) => Promise.resolve({ data: [], error: null }).then(onfulfilled)),
        };
      }),
      rpc: vi.fn(),
    },
  };
});

describe('🛒 RetailPosScreen Integration Tests', () => {
  const mockShowToast = vi.fn();
  const mockRefreshData = vi.fn();
  
  // Mock window.print to prevent triggering browser print UI during tests
  const originalPrint = window.print;
  beforeAll(() => {
    window.print = vi.fn();
  });
  afterAll(() => {
    window.print = originalPrint;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    // Pre-populate localStorage with an active shift to bypass cashier shift opening modal
    localStorage.setItem(
      'tripro_shift_user-123',
      JSON.stringify({
        id: 'shift-123',
        user_id: 'user-123',
        organization_id: 'org-123',
        opening_balance: 1000,
        pos_terminals: { id: 'term-123', name: 'الكاشير الرئيسي 1' },
      })
    );

    (useToast as any).mockReturnValue({
      showToast: mockShowToast,
    });

    (useAccounting as any).mockReturnValue({
      currentUser: { id: 'user-123', name: 'صلاح الكاشير', organization_id: 'org-123' },
      organization: { id: 'org-123', name: 'شركة التجزئة العالمية' },
      settings: { currency: 'ج.م', enable_tax: true, vat_rate: 0.14 },
      refreshData: mockRefreshData,
    });

    // Default RPC mock returns success values
    (supabase.rpc as any).mockImplementation((funcName) => {
      if (funcName === 'create_restaurant_order') {
        return Promise.resolve({ data: 'order-123', error: null });
      }
      if (funcName === 'complete_restaurant_order') {
        return Promise.resolve({ data: true, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
  });

  it('يجب تحميل شاشة المبيعات مباشرة وتفعيل منفذ البيع والوردية الافتتاحية للمستخدم', async () => {
    render(<RetailPosScreen />);

    // يجب تحميل اسم الكاشير من بيانات الوردية النشطة
    await waitFor(() => {
      expect(screen.getByText('الكاشير الرئيسي 1')).toBeDefined();
    });

    // تأكيد عرض حقل البحث ورأس الصفحة
    expect(screen.getByPlaceholderText('بحث سريع بالاسم...')).toBeDefined();
  });

  it('يجب معالجة إدخال الباركود وحساب المجموع الفرعي وضريبة القيمة المضافة 14% والإجمالي بشكل صحيح', async () => {
    render(<RetailPosScreen />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('بحث سريع بالاسم...')).toBeDefined();
    });

    // محاكاة إدخال باركود لـ "جبنة كيري" (باركود: 12345) والضغط على Enter
    const barcodeInput = screen.getByPlaceholderText('امسح باركود المنتج هنا مباشرة...');
    fireEvent.change(barcodeInput, { target: { value: '12345' } });
    fireEvent.submit(barcodeInput);

    // الانتظار للتأكد من إضافة الصنف في السلة وحساب الإجماليات
    // السعر الأساسي للجبنة: 100 ج.م
    // الضريبة: 14% = 14 ج.م
    // الإجمالي: 114 ج.م
    await waitFor(() => {
      expect(screen.getByText('جنية جبنة كيري')).toBeDefined();
      expect(screen.getByText('100.00 ج.م')).toBeDefined(); // المجموع الفرعي
      expect(screen.getByText('14.00 ج.م')).toBeDefined();  // الضريبة
      expect(screen.getByText('114.00 ج.م')).toBeDefined(); // الإجمالي
    });
  });

  it('يجب ربط العميل بسلة التسوق بنجاح وعرض اسمه', async () => {
    render(<RetailPosScreen />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('ابحث عن العميل بالاسم أو رقم الهاتف...')).toBeDefined();
    });

    // كتابة اسم العميل للبحث عنه
    const customerInput = screen.getByPlaceholderText('ابحث عن العميل بالاسم أو رقم الهاتف...');
    fireEvent.change(customerInput, { target: { value: 'أحمد' } });

    // يجب البحث وعرض نتيجة البحث وتحديد العميل
    await waitFor(() => {
      expect(screen.getByText('أحمد علي')).toBeDefined();
    });

    // اختيار العميل من القائمة
    const customerRow = screen.getByText('أحمد علي');
    fireEvent.click(customerRow);

    // التحقق من ربط العميل وعرض اسمه كعميل محدد للطلب
    await waitFor(() => {
      expect(screen.getByText('أحمد علي')).toBeDefined();
    });
  });

  it('يجب منع الدفع إذا كانت سلة المبيعات فارغة وإظهار تنبيه مناسب', async () => {
    render(<RetailPosScreen />);

    await waitFor(() => {
      expect(screen.getByText('دفع وطباعة الفاتورة (F8)')).toBeDefined();
    });

    // الضغط على F8 لإتمام الدفع
    fireEvent.keyDown(window, { key: 'F8', code: 'F8' });

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('سلة التسوق فارغة!', 'error');
    });
  });

  it('يجب منع إتمام الدفع إذا كان المبلغ المدفوع نقدًا أقل من قيمة المشتريات المحددة', async () => {
    render(<RetailPosScreen />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('امسح باركود المنتج هنا مباشرة...')).toBeDefined();
    });

    // 1. إضافة صنف إلى السلة بقيمة 114 ج.م (شامل الضريبة)
    const barcodeInput = screen.getByPlaceholderText('امسح باركود المنتج هنا مباشرة...');
    fireEvent.change(barcodeInput, { target: { value: '12345' } });
    fireEvent.submit(barcodeInput);

    await waitFor(() => {
      expect(screen.getByText('جنية جبنة كيري')).toBeDefined();
    });

    // 2. إدخال مبلغ مدفوع نقدًا (مثلاً 50 ج.م وهو أقل من الإجمالي 114 ج.م)
    const paidInput = screen.getByPlaceholderText('0.00 ج.م');
    fireEvent.change(paidInput, { target: { value: '50' } });

    // 3. الضغط على F8 لإتمام الدفع
    fireEvent.keyDown(window, { key: 'F8', code: 'F8' });

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('المبلغ المدفوع أقل من إجمالي الفاتورة', 'error');
    });
  });

  it('يجب إتمام الدفع بنجاح وتحديث قاعدة البيانات (Supabase) بعد دفع المبلغ بالكامل', async () => {
    render(<RetailPosScreen />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('امسح باركود المنتج هنا مباشرة...')).toBeDefined();
    });

    // 1. إضافة صنف للسلة
    const barcodeInput = screen.getByPlaceholderText('امسح باركود المنتج هنا مباشرة...');
    fireEvent.change(barcodeInput, { target: { value: '12345' } });
    fireEvent.submit(barcodeInput);

    await waitFor(() => {
      expect(screen.getByText('جنية جبنة كيري')).toBeDefined();
    });

    // 2. إدخال مبلغ دفع كافٍ (مثلاً 120 ج.م)
    const paidInput = screen.getByPlaceholderText('0.00 ج.م');
    fireEvent.change(paidInput, { target: { value: '120' } });

    // 3. النقر على زر الدفع
    const payButton = screen.getByText('دفع وطباعة الفاتورة (F8)');
    fireEvent.click(payButton);

    // 4. التحقق من تنفيذ المعاملة وحفظها
    // المتبقي (المردود) = 120 - 114 = 6.00 ج.م
    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('create_restaurant_order', expect.any(Object));
      expect(supabase.rpc).toHaveBeenCalledWith('complete_restaurant_order', expect.any(Object));
      expect(mockShowToast).toHaveBeenCalledWith('تم إتمام العملية بنجاح. المتبقي للعميل: 6.00 ج.م', 'success');
      // التحقق من تصفير سلة المشتريات والمبالغ
      expect(screen.getAllByText('0.00 ج.م').length).toBeGreaterThan(0);
    });
  });
});
