/**
 * Custom Hook للتعامل مع الإخطارات
 * يوفر وسيلة سهلة للمكونات للوصول إلى الإخطارات والتعامل معها
 */

import { logger } from '../utils/logger';
import { useState, useEffect, useCallback, useRef } from 'react';
import NotificationService, { Notification } from '../services/notificationService';
import { useAccounting } from '../context/AccountingContext';

interface UseNotificationsReturn {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (notificationId: string) => Promise<void>;
  refreshNotifications: () => Promise<void>;
}

// 🛡️ ذاكرة مشتركة لمنع تكرار الاستعلامات بين المكونات المختلفة وتوفير استهلاك Egress
let sharedNotifications: Notification[] = [];
let sharedUnreadCount = 0;
let lastUnreadCheckTime = 0;
let lastFullNotificationsFetchTime = 0;
let isFetchingInProgress = false;
const listeners = new Set<() => void>();

const notifyListeners = () => {
  listeners.forEach((listener) => listener());
};

export const useNotifications = (): UseNotificationsReturn => {
  const { currentUser } = useAccounting();
  const [, setTick] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // اشتراك المكون في الذاكرة المشتركة لتحديث واجهة المستخدم تلقائياً
  useEffect(() => {
    const handleUpdate = () => setTick((t) => t + 1);
    listeners.add(handleUpdate);
    return () => {
      listeners.delete(handleUpdate);
    };
  }, []);

  // جلب الإخطارات الكاملة (عند الحاجة أو الطلب اليدوي)
  const refreshNotifications = useCallback(async () => {
    if (!currentUser?.id || isFetchingInProgress) return;

    const orgId = (currentUser as any).organization_id;
    isFetchingInProgress = true;
    setLoading(true);
    setError(null);

    try {
      const [allNotifications, count] = await Promise.all([
        NotificationService.getAllNotifications(currentUser.id, orgId, 50),
        NotificationService.getUnreadCount(currentUser.id, orgId),
      ]);

      sharedNotifications = allNotifications || [];
      sharedUnreadCount = count || 0;
      lastFullNotificationsFetchTime = Date.now();
      lastUnreadCheckTime = Date.now();
      notifyListeners();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'حدث خطأ في جلب الإشعارات';
      setError(errorMessage);
      if (process.env.NODE_ENV === 'development') logger.error('Error refreshing notifications:', err);
    } finally {
      isFetchingInProgress = false;
      setLoading(false);
    }
  }, [currentUser?.id]);

  // فحص خفيف لعدد الإشعارات غير المقروءة فقط (يوفر Egress بشكل هائل)
  const pollUnreadCountOnly = useCallback(async () => {
    if (!currentUser?.id || isFetchingInProgress) return;
    if (typeof document !== 'undefined' && document.hidden) return; // إيقاف الفحص إذا كان التبويب في الخلفية

    const orgId = (currentUser as any).organization_id;
    try {
      const count = await NotificationService.getUnreadCount(currentUser.id, orgId);
      lastUnreadCheckTime = Date.now();
      
      // إذا تغير عدد الإشعارات غير المقروءة، نجلب القائمة الكاملة
      if (count !== sharedUnreadCount) {
        sharedUnreadCount = count;
        notifyListeners();
        // جلب الإشعارات الجديدة
        await refreshNotifications();
      }
    } catch (err) {
      if (process.env.NODE_ENV === 'development') logger.warn('Lightweight unread poll notice:', err);
    }
  }, [currentUser?.id, refreshNotifications]);

  // تعليم الإخطار كمقروء
  const markAsRead = useCallback(
    async (notificationId: string) => {
      try {
        const success = await NotificationService.markAsRead(notificationId);
        if (success) {
          sharedNotifications = sharedNotifications.map((notif) =>
            notif.id === notificationId ? { ...notif, is_read: true } : notif
          );
          sharedUnreadCount = Math.max(0, sharedUnreadCount - 1);
          notifyListeners();
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'development') logger.error('Error marking notification as read:', err);
      }
    },
    []
  );

  // تعليم جميع الإخطارات كمقروءة
  const markAllAsRead = useCallback(async () => {
    if (!currentUser?.id) return;
    const orgId = (currentUser as any).organization_id;

    try {
      const success = await NotificationService.markAllAsRead(currentUser.id, orgId);
      if (success) {
        sharedNotifications = sharedNotifications.map((notif) => ({ ...notif, is_read: true }));
        sharedUnreadCount = 0;
        notifyListeners();
      }
    } catch (err) {
      if (process.env.NODE_ENV === 'development') logger.error('Error marking all as read:', err);
    }
  }, [currentUser?.id]);

  // حذف الإخطار
  const deleteNotification = useCallback(async (notificationId: string) => {
    try {
      const success = await NotificationService.deleteNotification(notificationId);
      if (success) {
        sharedNotifications = sharedNotifications.filter((notif) => notif.id !== notificationId);
        sharedUnreadCount = Math.max(0, sharedUnreadCount - 1);
        notifyListeners();
      }
    } catch (err) {
      if (process.env.NODE_ENV === 'development') logger.error('Error deleting notification:', err);
    }
  }, []);

  // إدارة دورة الفحص وترشيد استهلاك البيانات
  useEffect(() => {
    const now = Date.now();
    // تحميل أولي إذا لم تكن البيانات قد حُملت من قبل
    if (sharedNotifications.length === 0 && (now - lastFullNotificationsFetchTime > 60000)) {
      refreshNotifications();
    } else if (now - lastUnreadCheckTime > 120000) {
      pollUnreadCountOnly();
    }

    // فحص خفيف لعدد الإشعارات فقط كل 3 دقائق (بدلاً من جلب 50 إشعاراً كل 60 ثانية)
    const interval = setInterval(() => {
      pollUnreadCountOnly();
    }, 180000);

    // فحص فوري عند عودة المستخدم للتبويب إذا مر أكثر من دقيقتين
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        if (Date.now() - lastUnreadCheckTime > 120000) {
          pollUnreadCountOnly();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [pollUnreadCountOnly, refreshNotifications]);

  return {
    notifications: sharedNotifications,
    unreadCount: sharedUnreadCount,
    loading,
    error,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    refreshNotifications,
  };
};
