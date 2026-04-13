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
    orgId: string,
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
          organization_id: orgId,
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
  static async getUnreadNotifications(userId: string, orgId: string): Promise<Notification[]> {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .eq('organization_id', orgId)
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
    orgId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Notification[]> {
    try {
      let query = supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId);

      if (orgId) {
        query = query.eq('organization_id', orgId);
      }

      const { data, error } = await query
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
  static async markAllAsRead(userId: string, orgId: string): Promise<boolean> {
    try {
      let query = supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', userId);

      if (orgId) {
        query = query.eq('organization_id', orgId);
      }

      const { error } = await query
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
  static async checkOverduePayments(organizationId?: string): Promise<void> {
    try {
      let orgId = organizationId;
      if (!orgId) {
        const { data: { user } } = await supabase.auth.getUser();
        orgId = user?.user_metadata?.org_id;
      }
      if (!orgId) return;

      const { data: overdueInvoices, error } = await supabase
        .from('invoices')
        .select('id, customer_id, due_date, invoice_number')
        .eq('organization_id', orgId)
        .lt('due_date', new Date().toISOString().split('T')[0])
        .neq('status', 'paid')
        .neq('status', 'draft')
        .neq('status', 'cancelled');

      if (error || !overdueInvoices) return;

      for (const invoice of overdueInvoices) {
        // جلب بيانات المستخدم المسؤول عن هذا العميل
        const { data: customer } = await supabase
          .from('customers')
          .select('id, responsible_user_id')
          .eq('id', invoice.customer_id)
          .eq('organization_id', orgId)
          .single();

        if (customer?.responsible_user_id) {
          const daysOverdue = Math.floor(
            (new Date().getTime() - new Date(invoice.due_date).getTime()) / (1000 * 60 * 60 * 24)
          );

          await this.createNotification(
            customer.responsible_user_id,
            orgId,
            `دفعة مستحقة منذ ${daysOverdue} يوم`,
            `الفاتورة رقم ${invoice.invoice_number} استحقت منذ ${daysOverdue} يوم`,
            'overdue_payment',
            daysOverdue > 30 ? 'high' : 'medium',
            invoice.id,
            `/sales-invoice?id=${invoice.id}`
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
  static async checkLowInventory(organizationId?: string): Promise<void> {
    try {
      let orgId = organizationId;
      if (!orgId) {
        const { data: { user } } = await supabase.auth.getUser();
        orgId = user?.user_metadata?.org_id;
      }
      if (!orgId) return;

      const { data: products, error } = await supabase
        .from('products')
        .select('id, sku, name, stock, min_stock_level')
        .eq('organization_id', orgId);

      if (error || !products) return;

      // جلب معرّفات المسؤولين (المدير العام)
      const { data: admins } = await supabase
        .from('profiles')
        .select('id')
        .eq('organization_id', orgId)
        .in('role', ['admin', 'super_admin']);

      if (!admins) return;

      for (const item of products) {
        const minLevel = item.min_stock_level || 5;
        if ((item.stock || 0) <= minLevel) {
           for (const admin of admins) {
              await this.createNotification(
                admin.id,
                orgId,
                `مخزون منخفض: ${item.name}`,
                `المخزون الحالي: ${item.stock} والحد الأدنى: ${minLevel}`,
            'low_inventory',
            'medium',
            item.id,
            `/products`
          );
           }
        }
      }
    } catch (err) {
      console.error('Error checking low inventory:', err);
    }
  }

  /**
   * التحقق من الديون العالية
   */
  static async checkHighDebt(organizationId?: string): Promise<void> {
    try {
      let orgId = organizationId;
      if (!orgId) {
        const { data: { user } } = await supabase.auth.getUser();
        orgId = user?.user_metadata?.org_id;
      }
      if (!orgId) return;

      // استخدام RPC لتجنب خطأ 400 في المقارنة بين الأعمدة
      // ملاحظة: يجب تعديل الـ RPC في قاعدة البيانات ليستقبل org_id
      const { data: customers, error } = await supabase.rpc('get_over_limit_customers', { p_org_id: orgId });

      if (error || !customers) {
          if (error) console.error('Error in checkHighDebt:', error);
          return;
      }
      // جلب المسؤولين كاحتياطي
      const { data: admins } = await supabase
        .from('profiles')
        .select('id')
        .eq('organization_id', orgId)
        .in('role', ['admin', 'super_admin'])
        .limit(1);
      const adminId = admins?.[0]?.id;

      for (const customer of customers) {
        // محاولة جلب المستخدم المسؤول
        const { data: custDetails } = await supabase.from('customers').select('responsible_user_id').eq('id', customer.id).eq('organization_id', orgId).single();
        const targetUser = custDetails?.responsible_user_id || adminId;

        if (targetUser) {
          const exceedPercentage = Math.round(
            ((customer.total_debt - customer.credit_limit) / customer.credit_limit) * 100
          );

          await this.createNotification(
            targetUser,
            orgId,
            `تجاوز حد الائتمان: ${customer.name}`,
            `الدين الحالي (${customer.total_debt}) يتجاوز الحد (${customer.credit_limit}) بنسبة ${exceedPercentage}%`,
            'high_debt',
            'high',
            customer.id,
            `/customers`
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
  static async checkPendingApprovals(organizationId?: string): Promise<void> {
    try {
      let orgId = organizationId;
      if (!orgId) {
        const { data: { user } } = await supabase.auth.getUser();
        orgId = user?.user_metadata?.org_id;
      }
      if (!orgId) return;

      // فواتير مبيعات معلقة (مسودات قديمة)
      const { data: pendingInvoices } = await supabase
        .from('invoices')
        .select('id, invoice_number, created_by')
        .eq('organization_id', orgId)
        .eq('status', 'draft')
        .lt('invoice_date', new Date(Date.now() - 86400000).toISOString().split('T')[0]);

      // إرسال تنبيه للمدراء
      const { data: admins } = await supabase
        .from('profiles')
        .select('id')
        .eq('organization_id', orgId)
        .in('role', ['admin', 'super_admin']);
      if (pendingInvoices && admins) {
        for (const invoice of pendingInvoices) {
          for (const admin of admins) {
             await this.createNotification(
              admin.id,
              orgId,
              `مسودة فاتورة معلقة: ${invoice.invoice_number}`,
              `الفاتورة لا تزال مسودة منذ أكثر من 24 ساعة`,
              'pending_approval',
              'medium',
              invoice.id,
              `/sales-invoice?id=${invoice.id}`
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
  static async checkUpcomingDueDates(organizationId?: string): Promise<void> {
    try {
      let orgId = organizationId;
      if (!orgId) {
        const { data: { user } } = await supabase.auth.getUser();
        orgId = user?.user_metadata?.org_id;
      }
      if (!orgId) return;

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      const nextWeekStr = nextWeek.toISOString().split('T')[0];

      const { data: upcomingPayments } = await supabase
        .from('invoices')
        .select('id, customer_id, due_date, invoice_number')
        .eq('organization_id', orgId)
        .gte('due_date', tomorrowStr)
        .lte('due_date', nextWeekStr)
        .neq('status', 'paid')
        .neq('status', 'draft')
        .neq('status', 'cancelled');

      if (upcomingPayments) {
        for (const invoice of upcomingPayments) {
          const { data: customer } = await supabase
            .from('customers')
            .select('responsible_user_id')
            .eq('id', invoice.customer_id)
            .eq('organization_id', orgId)
            .single();

          if (customer?.responsible_user_id) {
            const daysUntilDue = Math.floor(
              (new Date(invoice.due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
            );

            await this.createNotification(
              customer.responsible_user_id,
              orgId,
              `تاريخ دفع قريب: ${invoice.invoice_number}`,
              `ستستحق الفاتورة رقم ${invoice.invoice_number} بعد ${daysUntilDue} يوم`,
              'due_date_approaching',
              'medium',
              invoice.id,
              `/sales-invoice?id=${invoice.id}`
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
      // الوظائف الآن قادرة على جلب orgId بنفسها إذا لم يتم تمريره
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
  static async getUnreadCount(userId: string, orgId: string): Promise<number> {
    try {
      let query = supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (orgId) {
        query = query.eq('organization_id', orgId);
      }

      const { count, error } = await query
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
