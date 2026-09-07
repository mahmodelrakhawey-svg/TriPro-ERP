/**
 * اختبار سريع لنظام الإخطارات
 * استخدم هذا الملف للتحقق من أن كل شيء يعمل بشكل صحيح
 */

import NotificationService from './notificationService';
import NotificationScheduler from './NotificationScheduler';

/**
 * اختبر نظام الإخطارات
 * يمكنك تشغيل هذه الدوال من Console في المتصفح
 */

export async function testNotificationSystem() {
  console.log('🧪 اختبار نظام الإخطارات الذكية...\n');

  try {
    // اختبار 1: إنشاء إخطار تجريبي
    console.log('✅ اختبار 1: إنشاء إخطار تجريبي');
    const userId = 'test-user-id'; // استبدل بـ ID حقيقي

    const testNotification = await NotificationService.createNotification(
      userId,
      'demo-org-id',
      '🧪 اختبار الإخطارات',
      'هذا إخطار تجريبي لاختبار النظام. يمكنك حذفه بأمان.',
      'success',
      'high',
      'test-123',
      '/dashboard'
    );

    if (testNotification) {
      console.log('✔ تم إنشاء الإخطار بنجاح:', testNotification.id);
    } else {
      console.error('✗ فشل إنشاء الإخطار');
    }

    // اختبار 2: جلب الإخطارات غير المقروءة
    console.log('\n✅ اختبار 2: جلب الإخطارات غير المقروءة');
    const unreadNotifications = await NotificationService.getUnreadNotifications(userId, 'demo-org-id');
    console.log(`✔ عدد الإخطارات غير المقروءة: ${unreadNotifications.length}`);
    if (unreadNotifications.length > 0) {
      console.log('  أول إخطار:', unreadNotifications[0].title);
    }

    // اختبار 3: عد الإخطارات غير المقروءة
    console.log('\n✅ اختبار 3: عد الإخطارات غير المقروءة');
    const count = await NotificationService.getUnreadCount(userId, 'demo-org-id');
    console.log(`✔ عدد الإخطارات: ${count}`);

    // اختبار 4: تعليم الإخطار كمقروء
    if (testNotification) {
      console.log('\n✅ اختبار 4: تعليم الإخطار كمقروء');
      const marked = await NotificationService.markAsRead(testNotification.id);
      if (marked) {
        console.log('✔ تم تعليم الإخطار كمقروء بنجاح');
      }
    }

    // اختبار 5: الفحوصات الدورية
    console.log('\n✅ اختبار 5: تشغيل الفحوصات الدورية');
    console.log('🔔 بدء فحص الدفعات المستحقة...');
    await NotificationService.checkOverduePayments();
    console.log('✔ فحص الدفعات المستحقة اكتمل');

    console.log('🔔 بدء فحص المخزون المنخفض...');
    await NotificationService.checkLowInventory();
    console.log('✔ فحص المخزون المنخفض اكتمل');

    console.log('🔔 بدء فحص الديون العالية...');
    await NotificationService.checkHighDebt();
    console.log('✔ فحص الديون العالية اكتمل');

    // اختبار 6: حالة جدول الإخطارات
    console.log('\n✅ اختبار 6: حالة جدول الإخطارات');
    const status = NotificationScheduler.getStatus();
    console.log('حالة الجدول:', {
      يعمل: status.isRunning,
      'الفترة الزمنية (دقائق)': status.intervalMinutes,
      'هناك جدول نشط': status.hasSchedule,
    });

    console.log('\n✅ اكتملت جميع الاختبارات بنجاح! 🎉');
  } catch (error) {
    console.error('❌ خطأ أثناء الاختبار:', error);
  }
}

/**
 * تشغيل اختبار جدول الإخطارات
 */
export function testScheduler() {
  console.log('🧪 اختبار جدول الإخطارات\n');

  // بدء الجدول بفترة قصيرة للاختبار
  NotificationScheduler.start({
    intervalMinutes: 1, // فترة قصيرة للاختبار
    autoStart: true,
  });

  console.log('✔ تم بدء الجدول بنجاح');
  console.log('⏱️ سيتم تشغيل الفحوصات كل دقيقة واحدة');
  console.log('💡 نصيحة: افتح Console لرؤية رسائل التسجيل');
}

/**
 * استيقاف جدول الإخطارات
 */
export function stopScheduler() {
  NotificationScheduler.stop();
  console.log('✔ تم إيقاف الجدول');
}

/**
 * تشغيل الفحوصات يدويًا
 */
export async function runChecksManually() {
  console.log('🚀 تشغيل الفحوصات يدويًا...\n');
  await NotificationScheduler.triggerNow();
  console.log('✔ اكتملت الفحوصات');
}

// -------- دليل الاستخدام --------
/*
 * 1. لتشغيل جميع الاختبارات:
 *    testNotificationSystem()
 *
 * 2. لاختبار جدول الإخطارات:
 *    testScheduler()
 *    // ثم بعد انتهاء الاختبار:
 *    stopScheduler()
 *
 * 3. لتشغيل الفحوصات يدويًا:
 *    runChecksManually()
 *
 * 4. للحصول على حالة الجدول:
 *    NotificationScheduler.getStatus()
 */
