import { describe, it, expect, beforeEach, vi } from 'vitest';
import { offlineService, db } from '../services/offlineService';

describe('Offline Server-Time Delta Calibration (معايرة توقيت الأوفلاين)', () => {
  beforeEach(() => {
    offlineService.setServerTimeDelta(0);
  });

  it('يجب تعيين وتخزين فارق التوقيت بالمللي ثانية بشكل صحيح', () => {
    expect(offlineService.getServerTimeDelta()).toBe(0);
    expect(offlineService.getServerTimeSkewMinutes()).toBe(0);

    // افتراض أن ساعة السيرفر متقدمة بـ 15 دقيقة (900,000 مللي ثانية)
    const fifteenMinutesMs = 15 * 60 * 1000;
    offlineService.setServerTimeDelta(fifteenMinutesMs);

    expect(offlineService.getServerTimeDelta()).toBe(fifteenMinutesMs);
    expect(offlineService.getServerTimeSkewMinutes()).toBe(15);
  });

  it('getCalibratedDate يجب أن يعيد تاريخاً محسوباً بفارق توقيت السيرفر بدقة', () => {
    const skewMs = 3600000; // ساعة واحدة
    offlineService.setServerTimeDelta(skewMs);

    const clientNow = Date.now();
    const calibrated = offlineService.getCalibratedDate();

    // يجب أن يكون التوقيت المعاير أكبر من توقيت العميل بحدود ساعة تقريباً
    const diff = calibrated.getTime() - clientNow;
    expect(Math.abs(diff - skewMs)).toBeLessThan(50);
  });

  it('queueOrder يجب أن يختم الطلبات بالتوقيت المعاير للسيرفر', async () => {
    // محاكاة فارق توقيت ساعتين
    const twoHoursMs = 2 * 3600000;
    offlineService.setServerTimeDelta(twoHoursMs);

    const mockPayload: Record<string, any> = {
      orderId: 'test-order-skew-123',
      total: 500,
    };

    let savedItem: any = null;
    vi.spyOn(db.queuedOrders, 'add').mockImplementation(((item: any) => {
      savedItem = item;
      return Promise.resolve(1);
    }) as any);

    await offlineService.queueOrder(mockPayload);

    expect(savedItem).not.toBeNull();
    expect(savedItem.createdAt).toBeDefined();
    expect(savedItem.payload.created_at).toBeDefined();
    expect(savedItem.payload.date).toBeDefined();

    // التحقق من أن تاريخ الطلب يعكس التوقيت المعاير للسيرفر (+ ساعتين تقريباً)
    const orderTime = new Date(savedItem.createdAt).getTime();
    const now = Date.now();
    expect(orderTime).toBeGreaterThan(now + 1.9 * 3600000);
  });
});
