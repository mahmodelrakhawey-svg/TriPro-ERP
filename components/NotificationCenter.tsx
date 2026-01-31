/**
 * مركز الإخطارات
 * يعرض جميع الإخطارات والتنبيهات للمستخدم
 */

import React, { useState } from 'react';
import {
  Bell,
  X,
  Trash2,
  CheckCheck,
  AlertTriangle,
  Clock,
  TrendingDown,
  CheckCircle,
  AlertCircle,
  Info,
  Zap,
  ChevronRight,
} from 'lucide-react';
import { useNotifications } from '../utils/useNotifications';
import { Notification, NotificationType } from '../services/notificationService';

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({ isOpen, onClose }) => {
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification, loading } =
    useNotifications();
  const [selectedType, setSelectedType] = useState<NotificationType | 'all'>('all');

  const filteredNotifications =
    selectedType === 'all'
      ? notifications
      : notifications.filter((n) => n.type === selectedType);

  const getIcon = (type: NotificationType) => {
    switch (type) {
      case 'overdue_payment':
        return <AlertTriangle className="w-5 h-5 text-red-500" />;
      case 'low_inventory':
        return <TrendingDown className="w-5 h-5 text-yellow-500" />;
      case 'high_debt':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      case 'pending_approval':
        return <Clock className="w-5 h-5 text-blue-500" />;
      case 'due_date_approaching':
        return <Zap className="w-5 h-5 text-orange-500" />;
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
      default:
        return <Info className="w-5 h-5 text-gray-500" />;
    }
  };

  const getTypeLabel = (type: NotificationType): string => {
    const labels: Record<NotificationType, string> = {
      overdue_payment: 'دفعات مستحقة',
      low_inventory: 'مخزون منخفض',
      high_debt: 'ديون عالية',
      pending_approval: 'انتظار موافقة',
      due_date_approaching: 'تواريخ استحقاق قريبة',
      system_alert: 'تنبيهات النظام',
      success: 'نجاح',
      warning: 'تحذير',
    };
    return labels[type] || 'إخطار';
  };

  const getPriorityColor = (priority: string): string => {
    switch (priority) {
      case 'high':
        return 'border-r-4 border-red-500 bg-red-50';
      case 'medium':
        return 'border-r-4 border-yellow-500 bg-yellow-50';
      case 'low':
        return 'border-r-4 border-blue-500 bg-blue-50';
      default:
        return 'border-r-4 border-gray-500';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50">
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-lg flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Bell size={24} className="text-white" />
              {unreadCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </div>
            <h2 className="text-white text-xl font-bold">الإخطارات</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-blue-800 p-1 rounded-lg transition"
          >
            <X size={24} />
          </button>
        </div>

        {/* Controls */}
        <div className="p-4 border-b border-gray-200 flex gap-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="flex items-center gap-2 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition text-sm font-medium"
            >
              <CheckCheck size={16} />
              تعليم الكل كمقروء
            </button>
          )}
          <div className="flex-1" />
        </div>

        {/* Notification Type Filter */}
        <div className="p-4 border-b border-gray-200 flex gap-2 overflow-x-auto">
          <button
            onClick={() => setSelectedType('all')}
            className={`px-3 py-1 rounded-full text-sm whitespace-nowrap transition ${
              selectedType === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            الكل
          </button>
          <button
            onClick={() => setSelectedType('overdue_payment')}
            className={`px-3 py-1 rounded-full text-sm whitespace-nowrap transition ${
              selectedType === 'overdue_payment'
                ? 'bg-red-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            مستحقات
          </button>
          <button
            onClick={() => setSelectedType('low_inventory')}
            className={`px-3 py-1 rounded-full text-sm whitespace-nowrap transition ${
              selectedType === 'low_inventory'
                ? 'bg-yellow-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            مخزون
          </button>
          <button
            onClick={() => setSelectedType('pending_approval')}
            className={`px-3 py-1 rounded-full text-sm whitespace-nowrap transition ${
              selectedType === 'pending_approval'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            موافقات
          </button>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="text-gray-500">جاري التحميل...</div>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-500">
              <Bell size={32} className="opacity-50 mb-2" />
              <p>لا توجد إخطارات</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredNotifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  getIcon={getIcon}
                  getPriorityColor={getPriorityColor}
                  onRead={markAsRead}
                  onDelete={deleteNotification}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface NotificationItemProps {
  notification: Notification;
  getIcon: (type: NotificationType) => React.ReactNode;
  getPriorityColor: (priority: string) => string;
  onRead: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const NotificationItem: React.FC<NotificationItemProps> = ({
  notification,
  getIcon,
  getPriorityColor,
  onRead,
  onDelete,
}) => {
  const handleActionClick = async () => {
    if (!notification.is_read) {
      await onRead(notification.id);
    }
    if (notification.action_url) {
      window.location.href = notification.action_url;
    }
  };

  return (
    <div
      className={`p-4 hover:bg-gray-50 transition cursor-pointer ${getPriorityColor(
        notification.priority
      )}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-1">{getIcon(notification.type)}</div>

        <div className="flex-1 min-w-0 flex-col" onClick={handleActionClick}>
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-gray-900 text-sm">{notification.title}</h3>
            {!notification.is_read && <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1.5" />}
          </div>
          <p className="text-gray-600 text-sm mt-1 line-clamp-2">{notification.message}</p>
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-gray-500">
              {formatTime(new Date(notification.created_at))}
            </span>
            {notification.action_url && (
              <div className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-xs font-medium">
                عرض
                <ChevronRight size={14} />
              </div>
            )}
          </div>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(notification.id);
          }}
          className="flex-shrink-0 text-gray-400 hover:text-red-600 transition"
          title="حذف الإخطار"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
};

/**
 * تنسيق الوقت بصيغة نسبية
 */
const formatTime = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'الآن';
  if (diffMins < 60) return `قبل ${diffMins} دقيقة`;
  if (diffHours < 24) return `قبل ${diffHours} ساعة`;
  if (diffDays < 7) return `قبل ${diffDays} يوم`;

  return date.toLocaleDateString('ar-EG');
};

export default NotificationCenter;
