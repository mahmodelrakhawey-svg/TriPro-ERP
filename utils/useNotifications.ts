/**
 * Custom Hook للتعامل مع الإخطارات
 * يوفر وسيلة سهلة للمكونات للوصول إلى الإخطارات والتعامل معها
 */

import { useState, useEffect, useCallback } from 'react';
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

export const useNotifications = (): UseNotificationsReturn => {
  const { currentUser } = useAccounting();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // جلب الإخطارات
  const refreshNotifications = useCallback(async () => {
    if (!currentUser?.id) return;

    setLoading(true);
    setError(null);

    try {
      const [allNotifications, count] = await Promise.all([
        NotificationService.getAllNotifications(currentUser.id, 50),
        NotificationService.getUnreadCount(currentUser.id),
      ]);

      setNotifications(allNotifications);
      setUnreadCount(count);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'حدث خطأ';
      setError(errorMessage);
      console.error('Error refreshing notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id]);

  // تعليم الإخطار كمقروء
  const markAsRead = useCallback(
    async (notificationId: string) => {
      try {
        const success = await NotificationService.markAsRead(notificationId);
        if (success) {
          // تحديث الحالة المحلية
          setNotifications((prev) =>
            prev.map((notif) =>
              notif.id === notificationId ? { ...notif, is_read: true } : notif
            )
          );
          setUnreadCount((prev) => Math.max(0, prev - 1));
        }
      } catch (err) {
        console.error('Error marking notification as read:', err);
      }
    },
    []
  );

  // تعليم جميع الإخطارات كمقروءة
  const markAllAsRead = useCallback(async () => {
    if (!currentUser?.id) return;

    try {
      const success = await NotificationService.markAllAsRead(currentUser.id);
      if (success) {
        setNotifications((prev) => prev.map((notif) => ({ ...notif, is_read: true })));
        setUnreadCount(0);
      }
    } catch (err) {
      console.error('Error marking all as read:', err);
    }
  }, [currentUser?.id]);

  // حذف الإخطار
  const deleteNotification = useCallback(async (notificationId: string) => {
    try {
      const success = await NotificationService.deleteNotification(notificationId);
      if (success) {
        setNotifications((prev) => prev.filter((notif) => notif.id !== notificationId));
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('Error deleting notification:', err);
    }
  }, []);

  // جلب الإخطارات عند تحميل المكون
  useEffect(() => {
    refreshNotifications();

    // تحديث الإخطارات كل دقيقة
    const interval = setInterval(refreshNotifications, 60000);
    return () => clearInterval(interval);
  }, [refreshNotifications]);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    refreshNotifications,
  };
};
