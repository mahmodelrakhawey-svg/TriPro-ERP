/**
 * خدمة الإخطارات الذكية
 * تتعامل مع إنشاء وإدارة التنبيهات التلقائية
 * بناءً على المتغيرات التجارية
 */

import { supabase } from '../supabaseClient';
import { secureStorage } from '../utils/securityMiddleware';
import { logger } from '../utils/logger';

export type NotificationType = 
  | 'radiology_result_ready'
  | 'lab_result_ready'
  | 'overdue_payment' 
  | 'low_inventory' 
  | 'high_debt' 
  | 'pending_approval' 
  | 'due_date_approaching' 
  | 'project_performance_alert' // 🏗️ جديد: تنبيه أداء المشروع
  | 'retention_release_alert'    // 💰 جديد: تنبيه فك محتجز الضمان
  | 'backup_failure'
  | 'manufacturing_cost_overrun'
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
  private static rlsBlockedCrossUser = false;
  private static lastAuthUserId: string | null = null;
  private static cachedAuthContext: {
    userId: string | null;
    orgId: string | null;
    role: string | null;
    expiresAt: number;
  } | null = null;

  /**
   * التحقق من صحة صيغة الـ UUID
   */
  private static sanitizeUuid(val?: string | null): string | null {
    if (!val || typeof val !== 'string') return null;
    const trimmed = val.trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed) ? trimmed : null;
  }

  private static isOrgWideActor(role?: string | null): boolean {
    return ['super_admin', 'owner'].includes((role || '').toLowerCase());
  }

  private static isManagementRole(role?: string | null): boolean {
    return ['super_admin', 'owner', 'admin', 'manager', 'accountant'].includes((role || '').toLowerCase());
  }

  private static canAuditFinances(role?: string | null): boolean {
    return ['super_admin', 'admin', 'manager', 'accountant'].includes((role || '').toLowerCase());
  }

  /**
   * تحديد معرفات المستخدمين المستهدفين للإشعارات الإدارية بما يتوافق مع سياسات RLS
   */
  private static async resolveTargetAdminIds(
    orgId: string,
    authCtx: { userId: string | null; role: string | null },
    roles: string[] = ['admin', 'super_admin']
  ): Promise<string[]> {
    if (!this.isManagementRole(authCtx.role)) {
      return [];
    }
    if (!this.isOrgWideActor(authCtx.role)) {
      return authCtx.userId ? [authCtx.userId] : [];
    }
    const { data: admins } = await supabase
      .from('profiles')
      .select('id')
      .eq('organization_id', orgId)
      .in('role', roles);

    return (admins || []).map(a => a.id).filter(Boolean);
  }

  /**
   * جلب سياق المستخدم الحالي مع كاش قصير لتقليل طلبات auth المتكررة
   */
  private static async getCurrentAuthUserContext(forceRefresh = false): Promise<{
    userId: string | null;
    orgId: string | null;
    role: string | null;
  }> {
    const now = Date.now();
    if (!forceRefresh && this.cachedAuthContext && this.cachedAuthContext.expiresAt > now) {
      return {
        userId: this.cachedAuthContext.userId,
        orgId: this.cachedAuthContext.orgId,
        role: this.cachedAuthContext.role,
      };
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = this.sanitizeUuid(user?.id);
      if (!userId) {
        this.cachedAuthContext = { userId: null, orgId: null, role: null, expiresAt: now + 30_000 };
        return { userId: null, orgId: null, role: null };
      }

      if (this.lastAuthUserId !== userId) {
        this.lastAuthUserId = userId;
        this.rlsBlockedCrossUser = false;
      }

      let orgId = this.sanitizeUuid(user?.user_metadata?.org_id);
      let role: string | null = typeof user?.user_metadata?.role === 'string' ? user.user_metadata.role : null;

      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id, role')
        .eq('id', userId)
        .maybeSingle();

      if (profile) {
        orgId = this.sanitizeUuid(profile.organization_id) || orgId;
        role = profile.role || role;
      }

      this.cachedAuthContext = { userId, orgId, role, expiresAt: now + 30_000 };
      return { userId, orgId, role };
    } catch {
      return { userId: null, orgId: null, role: null };
    }
  }

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
      const validUserId = this.sanitizeUuid(userId);
      const validOrgId = this.sanitizeUuid(orgId);
      const validRelatedId = this.sanitizeUuid(relatedId);

      if (!validUserId) {
        return null;
      }

      const authCtx = await this.getCurrentAuthUserContext();
      const isSelfNotification = Boolean(authCtx.userId && validUserId === authCtx.userId);

      // إذا رفضت سياسة RLS الإدراج لمستخدمين آخرين في هذه الجلسة، نتوقف فوراً لمنع عاصفة 403
      if (!isSelfNotification && this.rlsBlockedCrossUser) {
        return null;
      }

      // 🛡️ منع التكرار: إذا كان هناك إشعار غير مقروء بالفعل لنفس السجل والمستخدم، لا تقم بإنشاء إشعار مكرر
      if (validRelatedId) {
        const { data: existing } = await supabase
          .from('notifications')
          .select('id')
          .eq('user_id', validUserId)
          .eq('type', type)
          .eq('related_id', validRelatedId)
          .eq('is_read', false)
          .limit(1)
          .maybeSingle();

        if (existing) {
          return null;
        }
      }

      const createdAt = new Date().toISOString();
      const payload = {
        user_id: validUserId,
        organization_id: validOrgId,
        title,
        message,
        type,
        priority,
        is_read: false,
        related_id: validRelatedId,
        action_url: actionUrl,
        created_at: createdAt,
        expires_at: expiresAt,
      };

      // عند الإدراج لمستخدم آخر نتجنب .select().single() حتى لا يفشل RETURNING بسبب سياسة USING (user_id = auth.uid())
      if (isSelfNotification) {
        const { data, error } = await supabase
          .from('notifications')
          .insert(payload)
          .select()
          .single();

        if (error) {
          logger.warn('Notice creating notification:', error.message);
          return null;
        }

        return data;
      }

      const { error } = await supabase
        .from('notifications')
        .insert(payload);

      if (error) {
        const msg = (error.message || '').toLowerCase();
        if (error.code === '42501' || msg.includes('row-level security') || msg.includes('policy')) {
          this.rlsBlockedCrossUser = true;
        }
        logger.warn('Notice creating notification:', error.message);
        return null;
      }

      return {
        id: '',
        user_id: validUserId,
        title,
        message,
        type,
        priority,
        is_read: false,
        related_id: validRelatedId ?? undefined,
        action_url: actionUrl,
        created_at: createdAt,
        expires_at: expiresAt,
      };
    } catch (err) {
      logger.warn('Notification creation notice:', err);
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
        logger.error('Error fetching notifications:', error);
        return [];
      }

      return data || [];
    } catch (err) {
      logger.error('Notification fetch error:', err);
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
        logger.error('Error fetching all notifications:', error);
        return [];
      }

      return data || [];
    } catch (err) {
      logger.error('Error fetching all notifications:', err);
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
        logger.error('Error marking notification as read:', error);
        return false;
      }

      return true;
    } catch (err) {
      logger.error('Error marking as read:', err);
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
        logger.error('Error marking all as read:', error);
        return false;
      }

      return true;
    } catch (err) {
      logger.error('Error marking all as read:', err);
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
        logger.error('Error deleting notification:', error);
        return false;
      }

      return true;
    } catch (err) {
      logger.error('Error deleting notification:', err);
      return false;
    }
  }

  /**
   * التحقق من الدفعات المستحقة
   */
  static async checkOverduePayments(organizationId?: string): Promise<void> {
    try {
      const authCtx = await this.getCurrentAuthUserContext();
      const orgId = organizationId || authCtx.orgId;
      if (!orgId || !this.isManagementRole(authCtx.role)) return;

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
          if (this.rlsBlockedCrossUser && customer.responsible_user_id !== authCtx.userId) continue;
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
      logger.error('Error checking overdue payments:', err);
    }
  }

  /**
   * التحقق من المخزون المنخفض
   */
  static async checkLowInventory(organizationId?: string): Promise<void> {
    try {
      const authCtx = await this.getCurrentAuthUserContext();
      const orgId = organizationId || authCtx.orgId;
      if (!orgId) return;

      const targetUserIds = await this.resolveTargetAdminIds(orgId, authCtx, ['admin', 'super_admin']);
      if (targetUserIds.length === 0) return;

      const { data: products, error } = await supabase
        .from('products')
        .select('id, sku, name, stock, min_stock_level')
        .eq('organization_id', orgId);

      if (error || !products) return;

      // 🛡️ جلب معرفات الأصناف التي لها إشعار نقص مخزون غير مقروء بالفعل لمنع التكرار والإغراق
      let existingQuery = supabase
        .from('notifications')
        .select('related_id')
        .eq('organization_id', orgId)
        .eq('type', 'low_inventory')
        .eq('is_read', false);

      if (!this.isOrgWideActor(authCtx.role) && authCtx.userId) {
        existingQuery = existingQuery.eq('user_id', authCtx.userId);
      }

      const { data: existingNotifs } = await existingQuery.limit(300);

      const existingProductIds = new Set((existingNotifs || []).map(n => n.related_id).filter(Boolean));

      // ترشيح الأصناف التي تحتاج إشعاراً جديداً فقط (بحد أقصى 20 صنفاً في الدفعة الواحدة)
      const neededAlerts = products
        .filter(item => {
          const minLevel = item.min_stock_level || 5;
          return (item.stock || 0) <= minLevel && !existingProductIds.has(item.id);
        })
        .slice(0, 20);

      for (const item of neededAlerts) {
        const minLevel = item.min_stock_level || 5;
        for (const targetUserId of targetUserIds) {
          if (this.rlsBlockedCrossUser && targetUserId !== authCtx.userId) continue;
          await this.createNotification(
            targetUserId,
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
    } catch (err) {
      logger.error('Error checking low inventory:', err);
    }
  }

  /**
   * التحقق من الديون العالية
   */
  static async checkHighDebt(organizationId?: string): Promise<void> {
    try {
      const authCtx = await this.getCurrentAuthUserContext();
      const orgId = organizationId || authCtx.orgId;
      if (!orgId || !this.isManagementRole(authCtx.role)) return;

      // استخدام RPC لتجنب خطأ 400 في المقارنة بين الأعمدة
      // ملاحظة: يجب تعديل الـ RPC في قاعدة البيانات ليستقبل org_id
      const { data: customers, error } = await supabase.rpc('get_over_limit_customers', { p_org_id: orgId });

      if (error || !customers) {
          if (error && error.code !== '42703' && error.code !== 'PGRST202') {
            logger.warn('Notice in checkHighDebt:', error.message);
          }
          return;
      }
      const targetAdminIds = await this.resolveTargetAdminIds(orgId, authCtx, ['admin', 'super_admin']);
      const adminId = targetAdminIds[0];

      for (const customer of customers) {
        // محاولة جلب المستخدم المسؤول
        const { data: custDetails } = await supabase.from('customers').select('responsible_user_id').eq('id', customer.id).eq('organization_id', orgId).single();
        const targetUser = custDetails?.responsible_user_id || adminId;

        if (targetUser) {
          if (this.rlsBlockedCrossUser && targetUser !== authCtx.userId) continue;
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
      logger.error('Error checking high debt:', err);
    }
  }

  /**
   * التحقق من المستندات المعلقة للموافقة
   */
  static async checkPendingApprovals(organizationId?: string): Promise<void> {
    try {
      const authCtx = await this.getCurrentAuthUserContext();
      const orgId = organizationId || authCtx.orgId;
      if (!orgId) return;

      const targetUserIds = await this.resolveTargetAdminIds(orgId, authCtx, ['admin', 'super_admin']);
      if (targetUserIds.length === 0) return;

      // فواتير مبيعات معلقة (مسودات قديمة)
      const { data: pendingInvoices } = await supabase
        .from('invoices')
        .select('id, invoice_number, created_by')
        .eq('organization_id', orgId)
        .eq('status', 'draft')
        .lt('invoice_date', new Date(Date.now() - 86400000).toISOString().split('T')[0]);

      if (pendingInvoices) {
        for (const invoice of pendingInvoices) {
          for (const targetUserId of targetUserIds) {
            if (this.rlsBlockedCrossUser && targetUserId !== authCtx.userId) continue;
            await this.createNotification(
              targetUserId,
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
      logger.error('Error checking pending approvals:', err);
    }
  }

  /**
   * التحقق من تواريخ استحقاق الفواتير القريبة
   */
  static async checkUpcomingDueDates(organizationId?: string): Promise<void> {
    try {
      const authCtx = await this.getCurrentAuthUserContext();
      const orgId = organizationId || authCtx.orgId;
      if (!orgId || !this.isManagementRole(authCtx.role)) return;

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
            if (this.rlsBlockedCrossUser && customer.responsible_user_id !== authCtx.userId) continue;
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
      logger.error('Error checking upcoming due dates:', err);
    }
  }

  /**
   * 🏗️ جديد: التحقق من تواريخ فك محتجز الضمان (Retention Release)
   * يبحث في مستخلصات العملاء والمقاولين عن التواريخ التي حان وقت فكها
   */
  static async checkUpcomingRetentionReleases(organizationId?: string): Promise<void> {
    try {
      const authCtx = await this.getCurrentAuthUserContext();
      const orgId = organizationId || authCtx.orgId;
      if (!orgId) return;

      const targetUserIds = await this.resolveTargetAdminIds(orgId, authCtx, ['admin', 'super_admin']);
      if (targetUserIds.length === 0) return;

      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      const nextWeekStr = nextWeek.toISOString().split('T')[0];

      // 1. فحص محتجزات العملاء
      const { data: customerRetentions } = await supabase
        .from('project_progress_billings')
        .select('id, billing_number, retention_release_date, project_id')
        .eq('organization_id', orgId)
        .lte('retention_release_date', nextWeekStr)
        .gt('retention_amount', 0)
        .eq('status', 'approved');

      // 2. فحص محتجزات مقاولي الباطن
      const { data: subRetentions } = await supabase
        .from('subcontractor_billings')
        .select('id, billing_number, retention_release_date')
        .eq('organization_id', orgId)
        .lte('retention_release_date', nextWeekStr)
        .gt('retention_amount', 0)
        .eq('status', 'approved');

      // إرسال تنبيهات للعملاء
      for (const item of (customerRetentions || [])) {
        for (const targetUserId of targetUserIds) {
          if (this.rlsBlockedCrossUser && targetUserId !== authCtx.userId) continue;
          await this.createNotification(
            targetUserId, orgId, 'موعد استرداد تأمين',
            `المستخلص رقم ${item.billing_number} حان موعد فك محتجز الضمان الخاص به بتاريخ ${item.retention_release_date}`,
            'retention_release_alert', 'high', item.id, `/construction`
          );
        }
      }

      // إرسال تنبيهات للمقاولين
      for (const item of (subRetentions || [])) {
        for (const targetUserId of targetUserIds) {
          if (this.rlsBlockedCrossUser && targetUserId !== authCtx.userId) continue;
          await this.createNotification(
            targetUserId, orgId, 'استحقاق رد تأمين مقاول',
            `المستخلص رقم ${item.billing_number} يستحق رد محتجز الضمان للمقاول بتاريخ ${item.retention_release_date}`,
            'retention_release_alert', 'medium', item.id, `/subcontractors`
          );
        }
      }
    } catch (err) {
      logger.error('Error checking retention releases:', err);
    }
  }

  /**
   * 🏗️ جديد: التحقق من مؤشرات أداء المشاريع (CPI/SPI)
   * وإرسال تنبيه إذا انخفضت عن العتبة المحددة.
   */
  static async checkProjectPerformanceThresholds(organizationId?: string): Promise<void> {
    try {
      const authCtx = await this.getCurrentAuthUserContext();
      const orgId = organizationId || authCtx.orgId;
      if (!orgId) return;

      const targetUserIds = await this.resolveTargetAdminIds(orgId, authCtx, ['admin', 'super_admin']);
      if (targetUserIds.length === 0) return;

      // استدعاء دالة RPC التي تجلب المشاريع ذات الأداء المنخفض
      const { data: projectsWithLowPerformance, error } = await supabase.rpc('fn_check_cpi_threshold', {
        p_org_id: orgId,
        p_threshold: 0.85 // العتبة الافتراضية لـ CPI و SPI
      });

      if (error) {
        // إذا لم تكن الدالة مثبتة في قاعدة البيانات (مثل القواعد الأساسية بدون مديول المقاولات) يتم التجاوز بهدوء
        if (error.code !== 'PGRST202' && error.code !== '404') {
          logger.warn('Notice checking project performance thresholds:', error.message);
        }
        return;
      }

      if (projectsWithLowPerformance && projectsWithLowPerformance.length > 0) {
        for (const project of projectsWithLowPerformance) {
          for (const targetUserId of targetUserIds) {
            if (this.rlsBlockedCrossUser && targetUserId !== authCtx.userId) continue;
            await this.createNotification(
              targetUserId,
              orgId,
              `⚠️ أداء مشروع منخفض: ${project.project_name}`,
              `مؤشر التكلفة (CPI): ${project.cpi}، مؤشر الجدول (SPI): ${project.spi}. يتطلب مراجعة عاجلة!`,
              'project_performance_alert',
              'high',
              project.project_id,
              `/construction/analytics?projectId=${project.project_id}` // رابط مباشر للوحة تحكم المشروع
            );
          }
        }
      }
    } catch (err) {
      logger.error('Error checking project performance thresholds:', err);
    }
  }

  /**
   * 🛡️ فحص سلامة الأركان المالية الأربعة دورياً
   * يقوم بتدقيق توازن الأستاذ العام ومطابقة العملاء والموردين وتقييم المخزون
   */
  static async checkFinancialIntegrityPillars(organizationId?: string): Promise<void> {
    try {
      const authCtx = await this.getCurrentAuthUserContext();
      const orgId = organizationId || authCtx.orgId;
      if (!orgId || !this.canAuditFinances(authCtx.role)) return;

      // لتجنب تكرار الإشعار عدة مرات في نفس اليوم، نقرأ آخر وقت فحص
      const cacheKey = `tripro_last_financial_audit_${orgId}`;
      const lastAudit = typeof window !== 'undefined' ? secureStorage.getItem<string>(cacheKey) : null;
      const now = Date.now();
      // تشغيل مرة كل 6 ساعات كحد أقصى لتفادي الإزعاج
      if (lastAudit && (now - parseInt(lastAudit, 10)) < 6 * 60 * 60 * 1000) {
        return;
      }

      const { auditDaemonService } = await import('./auditDaemonService');
      const report = await auditDaemonService.runSystemAudit(orgId);

      if (typeof window !== 'undefined') {
        secureStorage.setItem(cacheKey, now.toString());
      }

      if (report.overallStatus === 'failed' || report.overallStatus === 'warning') {
        const failedChecks = report.checks.filter(c => c.status === 'failed' || c.status === 'warning');
        const issuePillars = failedChecks.map(c => c.title).join('، ');

        const targetManagerIds = await this.resolveTargetAdminIds(
          orgId,
          authCtx,
          ['admin', 'super_admin', 'owner', 'accountant']
        );

        for (const managerId of targetManagerIds) {
          if (this.rlsBlockedCrossUser && managerId !== authCtx.userId) continue;
          await this.createNotification(
            managerId,
            orgId,
            report.overallStatus === 'failed' ? '🚨 خلل في توازن النظام المالي' : '⚠️ تنبيه رقابي محاسبي',
            `تم اكتشاف عدم تطابق في: ${issuePillars}. يرجى زيارة مركز الرقابة والحوكمة للفحص وإعادة التسوية.`,
            'system_alert',
            report.overallStatus === 'failed' ? 'high' : 'medium',
            undefined,
            '/admin/audit-logs'
          );
        }
      }
    } catch (err) {
      logger.warn('Notice checking financial integrity pillars:', err);
    }
  }

  /**
   * تشغيل جميع الفحوصات الدورية
   * يجب استدعاؤها بشكل دوري (مثلاً كل ساعة أو كل يوم)
   */
  static async runAllChecks(): Promise<void> {
    logger.log('🔔 Running periodic notification checks...');
    try {
      const authCtx = await this.getCurrentAuthUserContext(true);
      if (!authCtx.userId || !authCtx.orgId) {
        return;
      }

      if (!this.isManagementRole(authCtx.role)) {
        logger.log('ℹ️ Skipping management notification checks for operational role');
        return;
      }

      const checks: Promise<void>[] = [
        this.checkOverduePayments(authCtx.orgId),
        this.checkLowInventory(authCtx.orgId),
        this.checkHighDebt(authCtx.orgId),
        this.checkPendingApprovals(authCtx.orgId),
        this.checkUpcomingDueDates(authCtx.orgId),
        this.checkProjectPerformanceThresholds(authCtx.orgId), // 🏗️ جديد: إضافة فحص أداء المشاريع
        this.checkUpcomingRetentionReleases(authCtx.orgId),    // 🏗️ جديد: فحص محتجزات الضمان
        this.checkDueRecurringInvoices(),                      // 🔁 جديد: فحص وإصدار الفواتير الدورية والاشتراكات آلياً
      ];

      if (this.canAuditFinances(authCtx.role)) {
        checks.push(this.checkFinancialIntegrityPillars(authCtx.orgId)); // 🛡️ جديد: فحص سلامة الأركان المالية الأربعة
      }

      await Promise.all(checks);
      logger.log('✅ Notification checks completed');
    } catch (err) {
      logger.error('Error running notification checks:', err);
    }
  }

  /**
   * فحص وإصدار الفواتير الدورية المستحقة آلياً
   */
  static async checkDueRecurringInvoices(): Promise<void> {
    try {
      const { RecurringInvoiceService } = await import('./recurringInvoiceService');
      await RecurringInvoiceService.processDueRecurringInvoices();
    } catch (err) {
      logger.error('Error checking and processing due recurring invoices:', err);
    }
  }

  /**
   * الحصول على عدد الإخطارات غير المقروءة
   */
  static async getUnreadCount(userId: string, orgId: string): Promise<number> {
    try {
      const validUserId = this.sanitizeUuid(userId);
      if (!validUserId) return 0;

      let query = supabase
        .from('notifications')
        .select('id')
        .eq('user_id', validUserId)
        .eq('is_read', false);

      const validOrgId = this.sanitizeUuid(orgId);
      if (validOrgId) {
        query = query.eq('organization_id', validOrgId);
      }

      // قصر الاستعلام على حد 100 لسرعة التنفيذ الفورية وتجنب مهلة خادم PostgREST (500 Error)
      const { data, error } = await query.limit(100);

      if (error) {
        logger.warn('Notice getting unread count:', error.message);
        return 0;
      }

      return data?.length || 0;
    } catch (err) {
      logger.warn('Error getting unread count:', err);
      return 0;
    }
  }
}

export default NotificationService;
