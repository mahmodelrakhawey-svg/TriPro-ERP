/**
 * جدول الإخطارات - تشغيل الفحوصات الدورية
 * يجب استدعاء هذا الملف في App.tsx عند بدء التطبيق
 */

import NotificationService from './notificationService';

interface SchedulerConfig {
  intervalMinutes?: number; // الفترة بالدقائق (افتراضي: 60)
  autoStart?: boolean; // البدء التلقائي (افتراضي: true)
}

class NotificationScheduler {
  private static intervalId: NodeJS.Timeout | null = null;
  private static isRunning = false;
  private static intervalMinutes = 60;

  /**
   * بدء جدول الفحوصات الدورية
   */
  static start(config: SchedulerConfig = {}): void {
    const { intervalMinutes = 60, autoStart = true } = config;

    if (this.isRunning) {
      console.warn('⚠️ Notification scheduler is already running');
      return;
    }

    this.intervalMinutes = intervalMinutes;

    // تشغيل الفحوصات الأولى فوراً
    if (autoStart) {
      this.runChecks();
    }

    // تشغيل الفحوصات بشكل دوري
    this.intervalId = setInterval(
      () => {
        this.runChecks();
      },
      this.intervalMinutes * 60 * 1000
    );

    console.log(`✅ Notification scheduler started (every ${intervalMinutes} minutes)`);
  }

  /**
   * إيقاف جدول الفحوصات الدورية
   */
  static stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isRunning = false;
      console.log('⏹️ Notification scheduler stopped');
    }
  }

  /**
   * تشغيل جميع الفحوصات
   */
  private static async runChecks(): Promise<void> {
    try {
      this.isRunning = true;
      console.log(`🔔 Running notification checks at ${new Date().toLocaleTimeString()}`);

      // تشغيل جميع الفحوصات
      await NotificationService.runAllChecks();

      this.isRunning = false;
      console.log(`✅ Notification checks completed at ${new Date().toLocaleTimeString()}`);
    } catch (error) {
      this.isRunning = false;
      console.error('❌ Error running notification checks:', error);
    }
  }

  /**
   * الحصول على حالة الجدول
   */
  static getStatus(): {
    isRunning: boolean;
    intervalMinutes: number;
    hasSchedule: boolean;
  } {
    return {
      isRunning: this.isRunning,
      intervalMinutes: this.intervalMinutes,
      hasSchedule: this.intervalId !== null,
    };
  }

  /**
   * تشغيل الفحوصات يدوياً (بدون انتظار الفترة الدورية)
   */
  static async triggerNow(): Promise<void> {
    console.log('🚀 Manual trigger: Running notification checks immediately');
    await NotificationService.runAllChecks();
  }
}

export default NotificationScheduler;
