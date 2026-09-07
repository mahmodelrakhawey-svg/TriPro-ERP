/**
 * ==============================================================================
 * Kitchen Cook Pacing & Prep Timing Engine
 * TriPro ERP — services/cookPacingService.ts
 * ==============================================================================
 */

export interface PacingItemStatus {
  itemId: string;
  productName: string;
  prepTimeMinutes: number;
  delayOffsetMinutes: number; // كم دقيقة يجب تأخير الصنف
  state: 'FIRE_NOW' | 'HOLD' | 'PREPARING' | 'READY';
  secondsRemainingToStart: number;
  progressPct: number;
}

export interface TicketPacingSummary {
  orderId: string;
  maxPrepTimeMinutes: number;
  elapsedSecondsSinceCreated: number;
  itemsPacing: Record<string, PacingItemStatus>;
}

class CookPacingService {
  /**
   * حساب توقيت التزامن وإشارات HOLD / FIRE لكل صنف في التذكرة
   */
  public evaluateTicketPacing(
    orderCreatedAt: string,
    items: Array<{
      id: string;
      product_name: string;
      prep_time_minutes?: number;
      status?: string;
    }>
  ): TicketPacingSummary {
    const createdTime = new Date(orderCreatedAt).getTime();
    const now = Date.now();
    const elapsedSeconds = Math.max(0, Math.floor((now - createdTime) / 1000));
    const elapsedMinutes = elapsedSeconds / 60;

    // 1. تحديد أطول زمن تحضير في الطلب (مثلاً: ستيك 20 دقيقة)
    let maxPrepTime = 0;
    items.forEach(it => {
      const pTime = it.prep_time_minutes || 10;
      if (pTime > maxPrepTime) maxPrepTime = pTime;
    });

    const itemsPacing: Record<string, PacingItemStatus> = {};

    items.forEach(it => {
      const itemPrep = it.prep_time_minutes || 10;
      const delayOffset = Math.max(0, maxPrepTime - itemPrep); // متى يبدأ (بالدقائق من بداية الطلب)
      const delayOffsetSeconds = delayOffset * 60;

      let state: PacingItemStatus['state'] = 'FIRE_NOW';
      let secondsRemaining = 0;
      let progress = 100;

      if (it.status === 'READY' || it.status === 'SERVED') {
        state = 'READY';
      } else if (it.status === 'PREPARING') {
        state = 'PREPARING';
      } else if (elapsedSeconds < delayOffsetSeconds) {
        // الطلب في مرحلة الانتظار الذكي (HOLD)
        state = 'HOLD';
        secondsRemaining = delayOffsetSeconds - elapsedSeconds;
        progress = delayOffsetSeconds > 0 ? ((delayOffsetSeconds - secondsRemaining) / delayOffsetSeconds) * 100 : 100;
      } else {
        // حان وقت البدء فوراً!
        state = 'FIRE_NOW';
        secondsRemaining = 0;
        progress = 100;
      }

      itemsPacing[it.id] = {
        itemId: it.id,
        productName: it.product_name,
        prepTimeMinutes: itemPrep,
        delayOffsetMinutes: delayOffset,
        state,
        secondsRemainingToStart: secondsRemaining,
        progressPct: Number(progress.toFixed(0))
      };
    });

    return {
      orderId: '',
      maxPrepTimeMinutes: maxPrepTime,
      elapsedSecondsSinceCreated: elapsedSeconds,
      itemsPacing
    };
  }
}

export const cookPacingService = new CookPacingService();
