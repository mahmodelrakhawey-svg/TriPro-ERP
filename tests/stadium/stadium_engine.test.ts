import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateOccupancyRate,
  calcSubscriptionEndDate,
  getPaymentMethodAr,
  checkBookingConflict,
  createSubscriptionJournalEntry,
  createBookingJournalEntry,
} from '../../modules/stadium/stadiumHelpers';
import { supabase } from '../../supabaseClient';

// Mock Supabase
vi.mock('../../supabaseClient', () => {
  const mockFrom = vi.fn();
  return {
    supabase: {
      from: mockFrom,
    },
  };
});

describe('🏟️ Stadium & Sports Club Engine Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. دوال الحسابات والتواريخ ومعدلات الإشغال', () => {
    it('يحسب معدل إشغال الملاعب كنسبة مئوية بدقة ويمنع القسمة على صفر', () => {
      // 8 ساعات محجوزة من 10 ساعات متاحة = 80%
      expect(calculateOccupancyRate(8, 10)).toBe(80);

      // حجز 6 ساعات من 12 ساعة = 50%
      expect(calculateOccupancyRate(6, 12)).toBe(50);

      // في حال كانت الساعات المتاحة 0 يجب إرجاع 0 دون خطأ
      expect(calculateOccupancyRate(5, 0)).toBe(0);

      // إذا تجاوزت الساعات المحجوزة المتاح يتم تحجيمها عند 100%
      expect(calculateOccupancyRate(15, 10)).toBe(100);
    });

    it('يحتسب تاريخ انتهاء الاشتراك بناءً على نوع الخطة (شهري، ربع سنوي، نصف سنوي، سنوي)', () => {
      const startDate = '2026-01-15';

      expect(calcSubscriptionEndDate(startDate, 'monthly')).toBe('2026-02-15');
      expect(calcSubscriptionEndDate(startDate, 'quarterly')).toBe('2026-04-15');
      expect(calcSubscriptionEndDate(startDate, 'semi_annual')).toBe('2026-07-15');
      expect(calcSubscriptionEndDate(startDate, 'annual')).toBe('2027-01-15');
    });

    it('يترجم طرق الدفع إلى المسميات العربية المعتمدة', () => {
      expect(getPaymentMethodAr('cash')).toBe('نقدي');
      expect(getPaymentMethodAr('bank_transfer')).toBe('تحويل بنكي');
      expect(getPaymentMethodAr('card')).toBe('بطاقة');
      expect(getPaymentMethodAr('cheque')).toBe('شيك');
    });
  });

  describe('2. خوارزمية منع تداخل حجوزات الملاعب (Double Booking Prevention)', () => {
    it('تكتشف تداخل الأوقات بدقة عندما يتقاطع حجز جديد مع حجز قائم', async () => {
      // الحجز القائم من الساعة 18:00 إلى 19:00
      const existingBookings = [{ id: 'b-1', start_time: '18:00', end_time: '19:00' }];

      const mockQuery: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        then: vi.fn().mockImplementation((cb) => Promise.resolve(cb({ data: existingBookings, error: null }))),
      };
      (supabase.from as any).mockReturnValue(mockQuery);

      // حالة 1: تداخل جزئي (يبدأ في 18:30 وينتهي 19:30) -> تعارض
      const hasConflict1 = await checkBookingConflict('org-1', 'fac-1', '2026-09-20', '18:30', '19:30');
      expect(hasConflict1).toBe(true);

      // حالة 2: حجز بالكامل داخل الفترة (18:15 إلى 18:45) -> تعارض
      const hasConflict2 = await checkBookingConflict('org-1', 'fac-1', '2026-09-20', '18:15', '18:45');
      expect(hasConflict2).toBe(true);

      // حالة 3: حجز محيط بالفترة (17:30 إلى 19:30) -> تعارض
      const hasConflict3 = await checkBookingConflict('org-1', 'fac-1', '2026-09-20', '17:30', '19:30');
      expect(hasConflict3).toBe(true);
    });

    it('تسمح بالحجز المتتالي مباشرة (Back-to-Back) دون اعتبار نهاية الحجز الأول تعارضاً', async () => {
      // الحجز القائم من 18:00 إلى 19:00
      const existingBookings = [{ id: 'b-1', start_time: '18:00', end_time: '19:00' }];

      const mockQuery: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        then: vi.fn().mockImplementation((cb) => Promise.resolve(cb({ data: existingBookings, error: null }))),
      };
      (supabase.from as any).mockReturnValue(mockQuery);

      // حجز ينتهي بالضبط عند بداية الحجز القائم (17:00 إلى 18:00)
      const conflictBefore = await checkBookingConflict('org-1', 'fac-1', '2026-09-20', '17:00', '18:00');
      expect(conflictBefore).toBe(false);

      // حجز يبدأ بالضبط عند نهاية الحجز القائم (19:00 إلى 20:00)
      const conflictAfter = await checkBookingConflict('org-1', 'fac-1', '2026-09-20', '19:00', '20:00');
      expect(conflictAfter).toBe(false);
    });

    it('تتجاهل نفس معرف الحجز عند التعديل حتى لا يتعارض الحجز مع نفسه', async () => {
      const mockQuery: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        then: vi.fn().mockImplementation((cb) => Promise.resolve(cb({ data: [], error: null }))),
      };
      (supabase.from as any).mockReturnValue(mockQuery);

      const conflict = await checkBookingConflict('org-1', 'fac-1', '2026-09-20', '18:00', '19:00', 'b-current');
      expect(conflict).toBe(false);
      expect(mockQuery.neq).toHaveBeenCalledWith('id', 'b-current');
    });
  });

  describe('3. القيود المحاسبية الآلية لعمليات الاستاد', () => {
    it('ترفض إنشاء قيد اشتراك بمبلغ صفر أو سالب', async () => {
      const resultZero = await createSubscriptionJournalEntry('org-1', 0, 'اشتراك مجاني', '2026-09-20');
      expect(resultZero.success).toBe(false);
      expect(resultZero.error).toContain('أكبر من صفر');

      const resultNegative = await createSubscriptionJournalEntry('org-1', -50, 'اشتراك سالب', '2026-09-20');
      expect(resultNegative.success).toBe(false);
    });

    it('تنشئ قيد اشتراك نقدي متوازن وتدرج سطري المدين والدائن في دفتر اليومية', async () => {
      const mockAccounts = [
        { id: 'acc-cash', code: '1011', name: 'الخزينة الرئيسية', type: 'ASSET' },
        { id: 'acc-sub-rev', code: '4101', name: 'إيرادات الاشتراكات الرياضية', type: 'REVENUE' },
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'accounts') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockImplementation(function (this: any) {
              return Promise.resolve({ data: mockAccounts[0], error: null });
            }),
          };
        }
        if (table === 'cost_centers') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'cc-stadium' }, error: null }),
          };
        }
        if (table === 'journal_entries') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'je-sub-1' }, error: null }),
              }),
            }),
          };
        }
        if (table === 'journal_lines') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        };
      });

      const result = await createSubscriptionJournalEntry(
        'org-1',
        1200,
        'اشتراك سنوي - كابتن أحمد',
        '2026-09-20',
        '1011'
      );

      expect(result.success).toBe(true);
      expect(result.journalEntryId).toBe('je-sub-1');
    });

    it('تنشئ شيك قبض في جدول cheques عند سداد الحجز أو الاشتراك بشيك بنكي', async () => {
      let chequeInsertPayload: any = null;

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'accounts') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'acc-cheque', code: '1222', name: 'أوراق القبض' }, error: null }),
          };
        }
        if (table === 'cost_centers') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'cc-stadium' }, error: null }),
          };
        }
        if (table === 'journal_entries') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'je-booking-chq' }, error: null }),
              }),
            }),
          };
        }
        if (table === 'journal_lines') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        if (table === 'cheques') {
          return {
            insert: vi.fn().mockImplementation((payload) => {
              chequeInsertPayload = payload;
              return Promise.resolve({ error: null });
            }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        };
      });

      const chequeData = {
        cheque_number: 'CHQ-8899',
        bank_name: 'البنك الأهلي المصري',
        due_date: '2026-10-01',
        party_name: 'أكاديمية النجوم',
      };

      const result = await createBookingJournalEntry(
        'org-1',
        5000,
        'حجز الملعب الرئيسي لمباراة دورية',
        '2026-09-20',
        undefined,
        'cheque',
        chequeData
      );

      expect(result.success).toBe(true);
      expect(chequeInsertPayload).toBeDefined();
      expect(chequeInsertPayload.cheque_number).toBe('CHQ-8899');
      expect(chequeInsertPayload.type).toBe('incoming');
      expect(chequeInsertPayload.amount).toBe(5000);
      expect(chequeInsertPayload.status).toBe('received');
    });
  });
});
