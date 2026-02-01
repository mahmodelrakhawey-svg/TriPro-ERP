/**
 * خدمة الإخطارات الذكية
 * تتعامل مع إنشاء وإدارة التنبيهات التلقائية
 * بناءً على المتغيرات التجارية
 */

import { supabase } from '../supabaseClient';

export type NotificationType = 
  | 'overdue_payment' 
  | 'low_inventory' 
  | 'high_debt' 
  | 'pending_approval' 
  | 'due_date_approaching'
  | 'system_alert'
  | 'success'
  | 'warning';

export type NotificationPriority = 'high' | 'medium' | 'low';

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: NotificationType;
  priority: NotificationPriority;
  is_read: boolean;
  action_url?: string;
  related_id?: string;
  created_at: string;
  expires_at?: string;
}

class NotificationService {
  /**
   * إنشاء إخطار جديد
   */
  static async createNotification(
    userId: string,
    title: string,
    message: string,
    type: NotificationType,
    priority: NotificationPriority = 'medium',
    relatedId?: string,
    actionUrl?: string,
    expiresAt?: string
  ): Promise<Notification | null> {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .insert({
          user_id: userId,
          title,
          message,
          type,
          priority,
          is_read: false,
          related_id: relatedId,
          action_url: actionUrl,
          created_at: new Date().toISOString(),
          expires_at: expiresAt,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating notification:', error);
        return null;
      }

      return data;
    } catch (err) {
      console.error('Notification creation error:', err);
      return null;
    }
  }

  /**
   * جلب الإخطارات غير المقروءة للمستخدم
   */
  static async getUnreadNotifications(userId: string): Promise<Notification[]> {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('Error fetching notifications:', error);
        return [];
      }

      return data || [];
    } catch (err) {
      console.error('Notification fetch error:', err);
      return [];
    }
  }

  /**
   * جلب كل الإخطارات للمستخدم
   */
  static async getAllNotifications(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Notification[]> {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        console.error('Error fetching all notifications:', error);
        return [];
      }

      return data || [];
    } catch (err) {
      console.error('Error fetching all notifications:', err);
      return [];
    }
  }

  /**
   * تعليم الإخطار كمقروء
   */
  static async markAsRead(notificationId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

      if (error) {
        console.error('Error marking notification as read:', error);
        return false;
      }

      return true;
    } catch (err) {
      console.error('Error marking as read:', err);
      return false;
    }
  }

  /**
   * تعليم جميع الإخطارات كمقروءة
   */
  static async markAllAsRead(userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('is_read', false);

      if (error) {
        console.error('Error marking all as read:', error);
        return false;
      }

      return true;
    } catch (err) {
      console.error('Error marking all as read:', err);
      return false;
    }
  }

  /**
   * حذف الإخطار
   */
  static async deleteNotification(notificationId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId);

      if (error) {
        console.error('Error deleting notification:', error);
        return false;
      }

      return true;
    } catch (err) {
      console.error('Error deleting notification:', err);
      return false;
    }
  }

  /**
   * التحقق من الدفعات المستحقة
   */
  static async checkOverduePayments(): Promise<void> {
    try {
      const { data: overdueInvoices, error } = await supabase
        .from('sales_invoices')
        .select('id, customer_id, due_date, reference')
        .lt('due_date', new Date().toISOString().split('T')[0])
        .eq('payment_status', 'pending');

      if (error || !overdueInvoices) return;

      for (const invoice of overdueInvoices) {
        // جلب بيانات المستخدم المسؤول عن هذا العميل
        const { data: customer } = await supabase
          .from('customers')
          .select('id, responsible_user_id')
          .eq('id', invoice.customer_id)
          .single();

        if (customer?.responsible_user_id) {
          const daysOverdue = Math.floor(
            (new Date().getTime() - new Date(invoice.due_date).getTime()) / (1000 * 60 * 60 * 24)
          );

          await this.createNotification(
            customer.responsible_user_id,
            `دفعة مستحقة منذ ${daysOverdue} يوم`,
            `الفاتورة رقم ${invoice.reference} استحقت منذ ${daysOverdue} يوم`,
            'overdue_payment',
            daysOverdue > 30 ? 'high' : 'medium',
            invoice.id,
            `/invoice/${invoice.id}`
          );
        }
      }
    } catch (err) {
      console.error('Error checking overdue payments:', err);
    }
  }

  /**
   * التحقق من المخزون المنخفض
   */
  static async checkLowInventory(): Promise<void> {
    try {
      const { data: lowStockItems, error } = await supabase
        .from('inventory_items')
        .select('id, product_code, product_name, quantity, minimum_level, warehouse_id')
        .lt('quantity', 'minimum_level:value');

      if (error || !lowStockItems) return;

      // جلب معرّفات مدراء المخزن
      const { data: warehouseManagers } = await supabase
        .from('warehouse_staff')
        .select('warehouse_id, user_id')
        .eq('role', 'manager');

      const managerMap = new Map<string, string>();
      if (warehouseManagers) {
        warehouseManagers.forEach((staff) => {
          managerMap.set(staff.warehouse_id, staff.user_id);
        });
      }

      for (const item of lowStockItems) {
        const managerId = managerMap.get(item.warehouse_id);
        if (managerId) {
          await this.createNotification(
            managerId,
            `مخزون منخفض: ${item.product_name}`,
            `المخزون الحالي: ${item.quantity} والحد الأدنى: ${item.minimum_level}`,
            'low_inventory',
            'medium',
            item.id,
            `/inventory/${item.id}`
          );
        }
      }
    } catch (err) {
      console.error('Error checking low inventory:', err);
    }
  }

  /**
   * التحقق من الديون العالية
   */
  static async checkHighDebt(): Promise<void> {
    try {
      const { data: customers, error } = await supabase
        .from('customers')
        .select('id, name, credit_limit, total_debt, responsible_user_id')
        .gt('total_debt', 'credit_limit:value');

      if (error || !customers) return;

      for (const customer of customers) {
        if (customer.responsible_user_id) {
          const exceedPercentage = Math.round(
            ((customer.total_debt - customer.credit_limit) / customer.credit_limit) * 100
          );

          await this.createNotification(
            customer.responsible_user_id,
            `تجاوز حد الائتمان: ${customer.name}`,
            `الدين الحالي يتجاوز الحد بنسبة ${exceedPercentage}%`,
            'high_debt',
            'high',
            customer.id,
            `/customer/${customer.id}`
          );
        }
      }
    } catch (err) {
      console.error('Error checking high debt:', err);
    }
  }

  /**
   * التحقق من المستندات المعلقة للموافقة
   */
  static async checkPendingApprovals(): Promise<void> {
    try {
      // فواتير مبيعات معلقة
      const { data: pendingInvoices } = await supabase
        .from('sales_invoices')
        .select('id, reference, approver_id')
        .eq('status', 'pending_approval');

      if (pendingInvoices) {
        for (const invoice of pendingInvoices) {
          if (invoice.approver_id) {
            await this.createNotification(
              invoice.approver_id,
              `الفاتورة ${invoice.reference} تنتظر الموافقة`,
              `يرجى مراجعة وعتماد الفاتورة رقم ${invoice.reference}`,
              'pending_approval',
              'high',
              invoice.id,
              `/invoice/${invoice.id}/approve`
            );
          }
        }
      }

      // فواتير مشتريات معلقة
      const { data: pendingPurchases } = await supabase
        .from('purchase_invoices')
        .select('id, reference, approver_id')
        .eq('status', 'pending_approval');

      if (pendingPurchases) {
        for (const purchase of pendingPurchases) {
          if (purchase.approver_id) {
            await this.createNotification(
              purchase.approver_id,
              `فاتورة شراء ${purchase.reference} تنتظر الموافقة`,
              `يرجى مراجعة واعتماد فاتورة الشراء رقم ${purchase.reference}`,
              'pending_approval',
              'high',
              purchase.id,
              `/purchase-invoice/${purchase.id}/approve`
            );
          }
        }
      }
    } catch (err) {
      console.error('Error checking pending approvals:', err);
    }
  }

  /**
   * التحقق من تواريخ استحقاق الفواتير القريبة
   */
  static async checkUpcomingDueDates(): Promise<void> {
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      const nextWeekStr = nextWeek.toISOString().split('T')[0];

      const { data: upcomingPayments } = await supabase
        .from('sales_invoices')
        .select('id, customer_id, due_date, reference')
        .gte('due_date', tomorrowStr)
        .lte('due_date', nextWeekStr)
        .eq('payment_status', 'pending');

      if (upcomingPayments) {
        for (const invoice of upcomingPayments) {
          const { data: customer } = await supabase
            .from('customers')
            .select('responsible_user_id')
            .eq('id', invoice.customer_id)
            .single();

          if (customer?.responsible_user_id) {
            const daysUntilDue = Math.floor(
              (new Date(invoice.due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
            );

            await this.createNotification(
              customer.responsible_user_id,
              `تاريخ دفع قريب: ${invoice.reference}`,
              `ستستحق الفاتورة رقم ${invoice.reference} بعد ${daysUntilDue} يوم`,
              'due_date_approaching',
              'medium',
              invoice.id,
              `/invoice/${invoice.id}`
            );
          }
        }
      }
    } catch (err) {
      console.error('Error checking upcoming due dates:', err);
    }
  }

  /**
   * تشغيل جميع الفحوصات الدورية
   * يجب استدعاؤها بشكل دوري (مثلاً كل ساعة أو كل يوم)
   */
  static async runAllChecks(): Promise<void> {
    console.log('🔔 Running periodic notification checks...');
    try {
      await Promise.all([
        this.checkOverduePayments(),
        this.checkLowInventory(),
        this.checkHighDebt(),
        this.checkPendingApprovals(),
        this.checkUpcomingDueDates(),
      ]);
      console.log('✅ Notification checks completed');
    } catch (err) {
      console.error('Error running notification checks:', err);
    }
  }

  /**
   * الحصول على عدد الإخطارات غير المقروءة
   */
  static async getUnreadCount(userId: string): Promise<number> {
    try {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false);

      if (error) {
        console.error('Error getting unread count:', error);
        return 0;
      }

      return count || 0;
    } catch (err) {
      console.error('Error getting unread count:', err);
      return 0;
    }
  }
}

export default NotificationService;
