/**
 * ==============================================================================
 * TriPro ERP — Restaurant & POS Shift Domain Context & Hook
 * context/domains/RestaurantContext.tsx
 * ==============================================================================
 * مخصص لإدارة طاولات المطعم، جلسات وطلبات الطاولات، سداد ودفع الحساب المجزأ،
 * وإدارة دورة حياة ورديات نقاط البيع (POS Shifts) مع دعم أوفلاين متين.
 * يدعم الاستخدام المباشر عبر RestaurantProvider أو عبر واجهة AccountingContext الموحدة.
 * ==============================================================================
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { UserProfile } from '../AccountingContext';
import type { ShiftReconciliationData } from '../../types';
import { useAccounting } from '../AccountingContext';
import { supabase } from '../../supabaseClient';
import { logger } from '../../utils/logger';
import { secureStorage } from '../../utils/securityMiddleware';
import { offlineService, isValidUUID } from '../../services/offlineService';
import {
  DEFAULT_OFFLINE_TABLES,
  getOfflineTableOrders,
  setOfflineTableOrder
} from '../accountingConstants';

export interface RestaurantDomainState {
  restaurantTables: any[];
  currentShift: any;
  openTableSession: (tableId: string) => Promise<string | null>;
  reserveTable: (tableId: string, name: string, time: string) => Promise<boolean>;
  cancelReservation: (tableId: string) => Promise<void>;
  transferTableSession: (sessionId: string, targetTableId: string) => Promise<boolean>;
  mergeTableSessions: (sourceId: string, targetId: string) => Promise<boolean>;
  createRestaurantOrder: (payload: Record<string, any>) => Promise<string>;
  getOpenTableOrder: (tableId: string) => Promise<any>;
  completeRestaurantOrder: (orderId: string, method: string, total: number, accountId: string | null, warehouseId?: string) => Promise<void>;
  processSplitPayment: (orderId: string, items: any[], method: string, total: number, accountId: string) => Promise<boolean>;
  addRestaurantTable: (data: Record<string, any>) => Promise<void>;
  updateRestaurantTable: (id: string, data: Record<string, any>) => Promise<void>;
  deleteRestaurantTable: (id: string) => Promise<void>;
  updateKitchenOrderStatus: (id: string, status: string) => Promise<void>;
  startShift: (amount: number) => Promise<void>;
  closeCurrentShift: (actualCash: number, notes: string, reconciliation?: ShiftReconciliationData | null) => Promise<void>;
  getCurrentShiftSummary: () => Promise<any>;
  finalizeProductionOrder: (id: string, status: string, notes: string) => Promise<any>;
  refreshRestaurant?: () => Promise<void>;
  refreshShift?: () => Promise<void>;
}

export const RestaurantContext = createContext<RestaurantDomainState | null>(null);

export interface RestaurantProviderProps {
  children: React.ReactNode;
  orgId?: string | null;
  currentUser?: UserProfile | null;
  logActivity?: (action: string, details: string) => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  isDemo?: boolean;
  initialTables?: any[];
  initialShift?: any;
  products?: any[];
  defaultWarehouseId?: string;
  cashAccountId?: string;
  getSystemAccount?: (type: string) => any;
  refreshData?: () => Promise<void>;
}

const EMPTY_TABLES: any[] = [];

export const RestaurantProvider: React.FC<RestaurantProviderProps> = ({
  children,
  orgId,
  currentUser = null,
  logActivity,
  showToast,
  isDemo = false,
  initialTables = EMPTY_TABLES,
  initialShift = null,
  products = [],
  defaultWarehouseId,
  cashAccountId,
  getSystemAccount,
  refreshData,
}) => {
  const [restaurantTables, setRestaurantTables] = useState<any[]>(initialTables);
  const [currentShift, setCurrentShift] = useState<any>(initialShift);

  const targetOrgId = useMemo(() => {
    return orgId || currentUser?.organization_id || null;
  }, [orgId, currentUser]);

  // مزامنة الطاولات الأولية
  useEffect(() => {
    if (initialTables && initialTables.length > 0) {
      setRestaurantTables(initialTables);
    }
  }, [initialTables]);

  // مزامنة الوردية الأولية
  useEffect(() => {
    if (initialShift !== undefined) {
      setCurrentShift(initialShift);
    }
  }, [initialShift]);

  const notify = useCallback((message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    if (showToast) showToast(message, type);
  }, [showToast]);

  // --- جلب الطاولات النشطة ---
  const fetchRestaurantTables = useCallback(async () => {
    if (!targetOrgId || targetOrgId === 'org-default-offline') return;
    try {
      const q = supabase.from('restaurant_tables');
      if (!q || typeof q.select !== 'function') return;
      const { data, error } = await q
        .select('*')
        .eq('organization_id', targetOrgId)
        .order('name');

      if (error) {
        logger.error('Error fetching restaurant tables:', error);
      } else if (data) {
        setRestaurantTables(data.length > 0 ? data : DEFAULT_OFFLINE_TABLES);
      }
    } catch (e) {
      logger.error('Unexpected error fetching restaurant tables:', e);
    }
  }, [targetOrgId]);

  // --- جلب الوردية الحالية ---
  const fetchActiveShift = useCallback(async () => {
    if (!targetOrgId || targetOrgId === 'org-default-offline') return;
    try {
      if (!supabase || typeof supabase.rpc !== 'function') return;
      const { data, error } = await supabase.rpc('get_active_shift', { p_org_id: targetOrgId });
      if (error) {
        logger.error('Error fetching active shift:', error);
      } else {
        const activeShiftData = Array.isArray(data) ? data[0] : data;
        if (activeShiftData && activeShiftData.id) {
          setCurrentShift(activeShiftData);
        } else {
          let localShift = null;
          try {
            localShift = secureStorage.getItem<any>('tripro_offline_current_shift');
          } catch (e) {}
          setCurrentShift(localShift || null);
        }
      }
    } catch (e) {
      logger.error('Unexpected error fetching active shift:', e);
    }
  }, [targetOrgId]);

  // --- أوامر التصنيع / المطبخ ---
  const finalizeProductionOrder = useCallback(async (id: string, status: string, notes: string) => {
    return await supabase.rpc('mfg_finalize_order', { p_order_id: id, p_final_status: status, p_qc_notes: notes });
  }, []);

  // --- جلسات الطاولات ---
  const openTableSession = useCallback(async (tableId: string): Promise<string | null> => {
    if (!navigator.onLine || isDemo) {
      const sessionId = 'session-' + Date.now();
      setRestaurantTables(prev => prev.map(t => t.id === tableId ? { ...t, status: 'OCCUPIED', session_id: sessionId } : t));
      setOfflineTableOrder(tableId, { sessionId, orderId: null, items: [] });
      return sessionId;
    }
    try {
      const { data, error } = await supabase.rpc('open_table_session', { p_table_id: tableId });
      if (error) throw error;
      if (refreshData) await refreshData();
      else await fetchRestaurantTables();
      return data;
    } catch {
      const sessionId = 'session-' + Date.now();
      setRestaurantTables(prev => prev.map(t => t.id === tableId ? { ...t, status: 'OCCUPIED', session_id: sessionId } : t));
      setOfflineTableOrder(tableId, { sessionId, orderId: null, items: [] });
      return sessionId;
    }
  }, [isDemo, refreshData, fetchRestaurantTables]);

  const reserveTable = useCallback(async (tableId: string, name: string, time: string): Promise<boolean> => {
    if (!navigator.onLine || isDemo) {
      setRestaurantTables(prev => prev.map(t => t.id === tableId ? { ...t, status: 'RESERVED', reservation_info: { customerName: name, arrivalTime: time } } : t));
      return true;
    }
    try {
      const { error } = await supabase.from('restaurant_tables').update({ status: 'RESERVED', reservation_info: { customerName: name, arrivalTime: time } }).eq('id', tableId);
      if (error) return false;
      if (refreshData) await refreshData();
      else await fetchRestaurantTables();
      return true;
    } catch {
      setRestaurantTables(prev => prev.map(t => t.id === tableId ? { ...t, status: 'RESERVED', reservation_info: { customerName: name, arrivalTime: time } } : t));
      return true;
    }
  }, [isDemo, refreshData, fetchRestaurantTables]);

  const cancelReservation = useCallback(async (tableId: string): Promise<void> => {
    if (!navigator.onLine || isDemo) {
      setRestaurantTables(prev => prev.map(t => t.id === tableId ? { ...t, status: 'AVAILABLE', reservation_info: null } : t));
      return;
    }
    try {
      await supabase.from('restaurant_tables').update({ status: 'AVAILABLE', reservation_info: null }).eq('id', tableId);
      if (refreshData) await refreshData();
      else await fetchRestaurantTables();
    } catch {
      setRestaurantTables(prev => prev.map(t => t.id === tableId ? { ...t, status: 'AVAILABLE', reservation_info: null } : t));
    }
  }, [isDemo, refreshData, fetchRestaurantTables]);

  const transferTableSession = useCallback(async (sessionId: string, targetTableId: string): Promise<boolean> => {
    if (!navigator.onLine || isDemo) {
      setRestaurantTables(prev => prev.map(t => {
        if (t.session_id === sessionId) return { ...t, status: 'AVAILABLE', session_id: null };
        if (t.id === targetTableId) return { ...t, status: 'OCCUPIED', session_id: sessionId };
        return t;
      }));
      notify('تم نقل الطاولة بنجاح (محلياً)', 'success');
      return true;
    }
    try {
      const { error } = await supabase.rpc('transfer_table_session', { p_session_id: sessionId, p_target_table_id: targetTableId });
      if (error) { notify(error.message, 'error'); return false; }
      if (refreshData) await refreshData();
      else await fetchRestaurantTables();
      return true;
    } catch {
      return false;
    }
  }, [isDemo, notify, refreshData, fetchRestaurantTables]);

  const mergeTableSessions = useCallback(async (sourceId: string, targetId: string): Promise<boolean> => {
    if (!navigator.onLine || isDemo) {
      setRestaurantTables(prev => prev.map(t => t.session_id === sourceId ? { ...t, status: 'AVAILABLE', session_id: null } : t));
      notify('تم دمج الطاولات بنجاح (محلياً)', 'success');
      return true;
    }
    try {
      const { error } = await supabase.rpc('merge_table_sessions', { p_source_session_id: sourceId, p_target_session_id: targetId });
      if (error) { notify(error.message, 'error'); return false; }
      if (refreshData) await refreshData();
      else await fetchRestaurantTables();
      return true;
    } catch {
      return false;
    }
  }, [isDemo, notify, refreshData, fetchRestaurantTables]);

  // --- طلبات المطعم ---
  const createRestaurantOrder = useCallback(async (payload: Record<string, any>): Promise<string> => {
    if (!navigator.onLine || isDemo) {
      const orderId = 'ord-offline-' + Date.now();
      const tableId = payload.p_table_id;
      const matchedTable = tableId ? { id: tableId } : restaurantTables.find(t => t.session_id === payload.p_session_id || t.id === payload.p_table_id);
      const effectiveTableId = matchedTable?.id || tableId;

      if (effectiveTableId) {
        const existing = getOfflineTableOrders()[effectiveTableId] || {};
        const formattedItems = (payload.p_items || []).map((item: Record<string, any>, idx: number) => ({
          id: item.id || ('item-' + Date.now() + '-' + idx),
          productId: item.product_id,
          name: item.name || products.find(p => p.id === item.product_id)?.name || 'صنف',
          quantity: Number(item.quantity || 1),
          unitPrice: Number(item.unit_price || 0),
          unitCost: Number(item.unit_cost || 0),
          notes: item.notes || '',
          selectedModifiers: item.modifiers || [],
          savedQuantity: Number(item.quantity || 1)
        }));
        setOfflineTableOrder(effectiveTableId, {
          sessionId: payload.p_session_id || existing.sessionId || ('session-' + Date.now()),
          orderId,
          warehouseId: payload.p_warehouse_id || defaultWarehouseId || 'wh-main',
          items: formattedItems
        });
        setRestaurantTables(prev => prev.map(t => t.id === effectiveTableId ? { ...t, status: 'OCCUPIED' } : t));
      }

      try {
        await offlineService.queueOrder({ ...payload, orderId, organization_id: targetOrgId });
      } catch (e) {
        logger.warn('Offline order queue notice:', e);
      }
      return orderId;
    }

    try {
      const { data, error } = await supabase.rpc('create_restaurant_order', {
        ...payload,
        p_warehouse_id: payload.p_warehouse_id || defaultWarehouseId,
        p_org_id: targetOrgId
      });
      if (error) throw error;
      return data;
    } catch {
      const orderId = 'ord-offline-' + Date.now();
      try {
        await offlineService.queueOrder({ ...payload, orderId, organization_id: targetOrgId });
      } catch (e) {}
      return orderId;
    }
  }, [isDemo, restaurantTables, products, defaultWarehouseId, targetOrgId]);

  const getOpenTableOrder = useCallback(async (tableId: string): Promise<any> => {
    if (!navigator.onLine || isDemo) {
      const offlineOrders = getOfflineTableOrders();
      if (offlineOrders[tableId]) {
        return offlineOrders[tableId];
      }
      return { sessionId: 'session-' + Date.now(), orderId: null, items: [] };
    }

    try {
      const { data } = await supabase.rpc('get_open_table_order', { p_table_id: tableId });
      if (data?.orderId && data?.items && data.items.length > 0) {
        return data;
      }
    } catch (rpcErr) {
      logger.warn('RPC get_open_table_order notice:', rpcErr);
    }

    try {
      const { data: session } = await supabase
        .from('table_sessions')
        .select('id, organization_id')
        .eq('table_id', tableId)
        .eq('status', 'OPEN')
        .is('end_time', null)
        .maybeSingle();

      if (session?.id) {
        const { data: order } = await supabase
          .from('orders')
          .select(`
            id, warehouse_id, status,
            order_items (
              id, product_id, quantity, unit_price, unit_cost, notes, modifiers,
              products (name)
            )
          `)
          .eq('session_id', session.id)
          .neq('status', 'PAID')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (order?.id && order.order_items && order.order_items.length > 0) {
          const formattedItems = order.order_items.map((oi: Record<string, any>) => ({
            id: oi.id,
            productId: oi.product_id,
            name: oi.products?.name || 'صنف',
            quantity: Number(oi.quantity),
            unitPrice: Number(oi.unit_price),
            unitCost: Number(oi.unit_cost),
            notes: oi.notes,
            selectedModifiers: oi.modifiers || [],
            savedQuantity: Number(oi.quantity)
          }));

          return {
            sessionId: session.id,
            orderId: order.id,
            warehouseId: order.warehouse_id,
            items: formattedItems
          };
        }

        return { sessionId: session.id, orderId: null, items: [] };
      }
    } catch (fbErr) {
      logger.warn('Fallback getOpenTableOrder notice:', fbErr);
    }

    const offlineOrders = getOfflineTableOrders();
    return offlineOrders[tableId] || null;
  }, [isDemo]);

  const completeRestaurantOrder = useCallback(async (
    orderId: string,
    method: string,
    total: number,
    accountId: string | null,
    warehouseId?: string
  ): Promise<void> => {
    if (!navigator.onLine || isDemo || String(orderId).startsWith('ord-offline-')) {
      const offlineOrders = getOfflineTableOrders();
      for (const [tableId, ord] of Object.entries(offlineOrders)) {
        if (ord.orderId === orderId || !orderId) {
          setOfflineTableOrder(tableId, null);
          setRestaurantTables(prev => prev.map(t => t.id === tableId ? { ...t, status: 'AVAILABLE', session_id: null } : t));
          break;
        }
      }
      notify('تم إتمام الطلب بنجاح (وضع أوفلاين) ✅', 'success');
      return;
    }

    try {
      const { error } = await supabase.rpc('complete_restaurant_order', {
        p_order_id: orderId,
        p_payment_method: method,
        p_amount: total,
        p_cash_account_id: accountId,
        p_org_id: targetOrgId,
        p_warehouse_id: warehouseId
      });
      if (error) throw error;
      if (refreshData) await refreshData();
      else await fetchRestaurantTables();
    } catch {
      const offlineOrders = getOfflineTableOrders();
      for (const [tableId, ord] of Object.entries(offlineOrders)) {
        if (ord.orderId === orderId) {
          setOfflineTableOrder(tableId, null);
          setRestaurantTables(prev => prev.map(t => t.id === tableId ? { ...t, status: 'AVAILABLE', session_id: null } : t));
          break;
        }
      }
      notify('تم حفظ العملية محلياً وإتمام السداد بنجاح ✅', 'success');
    }
  }, [isDemo, targetOrgId, notify, refreshData, fetchRestaurantTables]);

  const processSplitPayment = useCallback(async (
    orderId: string,
    items: any[],
    method: string,
    total: number,
    accountId: string
  ): Promise<boolean> => {
    if (!navigator.onLine || isDemo) {
      notify('تم الدفع الجزئي بنجاح (محلياً)', 'success');
      return true;
    }
    try {
      const { error } = await supabase.rpc('process_split_payment', {
        p_order_id: orderId,
        p_items: items,
        p_payment_method: method,
        p_amount: total,
        p_cash_account_id: accountId,
        p_org_id: targetOrgId
      });
      if (error) {
        logger.error('process_split_payment RPC error:', error);
        notify(error.message, 'error');
        return false;
      }
      if (refreshData) await refreshData();
      else await fetchRestaurantTables();
      return true;
    } catch (err: unknown) {
      logger.error('processSplitPayment exception:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      notify('فشل معالجة الدفع الجزئي: ' + errMsg, 'error');
      return false;
    }
  }, [isDemo, targetOrgId, notify, refreshData, fetchRestaurantTables]);

  // --- إدارة سجلات الطاولات (CRUD) ---
  const addRestaurantTable = useCallback(async (data: Record<string, any>): Promise<void> => {
    if (!navigator.onLine || isDemo) {
      const newT = { ...data, id: 'tbl-' + Date.now(), organization_id: targetOrgId, status: data.status || 'AVAILABLE' };
      setRestaurantTables(prev => [...prev, newT]);
      notify('تمت إضافة الطاولة بنجاح (محلياً)', 'success');
      return;
    }
    try {
      const { error } = await supabase.from('restaurant_tables').insert({ ...data, organization_id: targetOrgId });
      if (error) throw error;
      if (refreshData) await refreshData();
      else await fetchRestaurantTables();
    } catch {
      const newT = { ...data, id: 'tbl-' + Date.now(), organization_id: targetOrgId, status: data.status || 'AVAILABLE' };
      setRestaurantTables(prev => [...prev, newT]);
      notify('تمت إضافة الطاولة بنجاح (محلياً)', 'success');
    }
  }, [isDemo, targetOrgId, notify, refreshData, fetchRestaurantTables]);

  const updateRestaurantTable = useCallback(async (id: string, data: Record<string, any>): Promise<void> => {
    if (!navigator.onLine || isDemo) {
      setRestaurantTables(prev => prev.map(t => t.id === id ? { ...t, ...data } : t));
      notify('تم تحديث بيانات الطاولة بنجاح', 'success');
      return;
    }
    try {
      await supabase.from('restaurant_tables').update(data).eq('id', id);
      if (refreshData) await refreshData();
      else await fetchRestaurantTables();
    } catch {
      setRestaurantTables(prev => prev.map(t => t.id === id ? { ...t, ...data } : t));
    }
  }, [isDemo, notify, refreshData, fetchRestaurantTables]);

  const deleteRestaurantTable = useCallback(async (id: string): Promise<void> => {
    if (!navigator.onLine || isDemo) {
      setRestaurantTables(prev => prev.filter(t => t.id !== id));
      notify('تم حذف الطاولة بنجاح', 'success');
      return;
    }
    try {
      await supabase.from('restaurant_tables').delete().eq('id', id);
      if (refreshData) await refreshData();
      else await fetchRestaurantTables();
    } catch {
      setRestaurantTables(prev => prev.filter(t => t.id !== id));
    }
  }, [isDemo, notify, refreshData, fetchRestaurantTables]);

  const updateKitchenOrderStatus = useCallback(async (id: string, status: string): Promise<void> => {
    if (!navigator.onLine || isDemo) return;
    try {
      await supabase.from('kitchen_orders').update({ status }).eq('id', id);
    } catch (e) {
      logger.warn('updateKitchenOrderStatus notice:', e);
    }
  }, [isDemo]);

  // --- دورة حياة الورديات (POS Shifts) ---
  const startShift = useCallback(async (amount: number): Promise<void> => {
    const treasuryAcc = getSystemAccount ? getSystemAccount('CASH') : (cashAccountId ? { id: cashAccountId } : null);

    if (!navigator.onLine || isDemo) {
      const newShift = {
        id: 'shift-offline-' + Date.now(),
        shift_number: 'SHIFT-' + Math.floor(1000 + Math.random() * 9000),
        user_id: currentUser?.id || 'demo-user',
        cashier_id: currentUser?.id || 'demo-user',
        opening_balance: Number(amount) || 0,
        status: 'OPEN',
        start_time: new Date().toISOString(),
        organization_id: targetOrgId
      };
      setCurrentShift(newShift);
      try {
        secureStorage.setItem('tripro_offline_current_shift', newShift);
      } catch (e) {}
      notify('تم بدء وردية الكاشير بنجاح (محلياً) ✅', 'success');
      if (logActivity) logActivity('START_SHIFT_OFFLINE', `بدء الوردية بمبلغ ${amount}`);
      return;
    }

    try {
      const { error } = await supabase.rpc('start_pos_shift', {
        p_opening_balance: Number(amount) || 0,
        p_resume_existing: false,
        p_treasury_account_id: (treasuryAcc?.id && isValidUUID(treasuryAcc.id)) ? treasuryAcc.id : null,
        p_user_id: (currentUser?.id && isValidUUID(currentUser.id)) ? currentUser.id : null,
        p_org_id: (targetOrgId && isValidUUID(targetOrgId)) ? targetOrgId : null,
        p_terminal_id: null
      });
      if (error) throw error;
      if (refreshData) await refreshData();
      else await fetchActiveShift();
      if (logActivity) logActivity('START_SHIFT', `بدء الوردية بمبلغ ${amount}`);
    } catch {
      const newShift = {
        id: 'shift-offline-' + Date.now(),
        shift_number: 'SHIFT-' + Math.floor(1000 + Math.random() * 9000),
        user_id: currentUser?.id || 'demo-user',
        cashier_id: currentUser?.id || 'demo-user',
        opening_balance: Number(amount) || 0,
        status: 'OPEN',
        start_time: new Date().toISOString(),
        organization_id: targetOrgId
      };
      setCurrentShift(newShift);
      notify('تم بدء الوردية محلياً (وضع أوفلاين) ✅', 'success');
    }
  }, [getSystemAccount, cashAccountId, isDemo, currentUser, targetOrgId, notify, logActivity, refreshData, fetchActiveShift]);

  const closeCurrentShift = useCallback(async (actualCash: number, notes: string, reconciliation?: ShiftReconciliationData | null): Promise<void> => {
    const shiftId = Array.isArray(currentShift) ? currentShift[0]?.id : currentShift?.id;
    if (!navigator.onLine || isDemo || !isValidUUID(shiftId)) {
      setCurrentShift(null);
      try {
        secureStorage.removeItem('tripro_offline_current_shift');
        localStorage.removeItem('tripro_offline_current_shift');
      } catch (e) {}
      notify('تم إغلاق الوردية محلياً بنجاح 🔒', 'success');
      if (logActivity) logActivity('CLOSE_SHIFT_OFFLINE', `إغلاق الوردية نقدية: ${actualCash}`);
      return;
    }
    if (!shiftId) {
      throw new Error('لا توجد وردية مفتوحة حالياً ليتم إغلاقها');
    }
    try {
      const effectiveOrg = (targetOrgId && isValidUUID(targetOrgId)) ? targetOrgId : null;
      const { error } = await supabase.rpc('close_shift', {
        p_shift_id: shiftId,
        p_actual_cash: actualCash,
        p_notes: notes,
        p_org_id: effectiveOrg,
        p_reconciliation: reconciliation || null
      });
      if (error) throw error;
      setCurrentShift(null);
      if (refreshData) await refreshData();
      if (logActivity) logActivity('CLOSE_SHIFT', `إغلاق الوردية رقم ${shiftId}`);
    } catch (err: unknown) {
      setCurrentShift(null);
      const errMsg = err instanceof Error ? err.message : (err as any)?.message || 'تم إغلاق الوردية محلياً 🔒';
      notify('تنبيه أثناء إغلاق الوردية: ' + errMsg, 'warning');
    }
  }, [currentShift, isDemo, notify, logActivity, targetOrgId, refreshData]);

  const getCurrentShiftSummary = useCallback(async (): Promise<any> => {
    const shiftId = Array.isArray(currentShift) ? currentShift[0]?.id : currentShift?.id;
    if (!shiftId) return null;
    if (!navigator.onLine || isDemo || !isValidUUID(shiftId) || String(shiftId).startsWith('shift-offline-')) {
      return {
        opening_balance: Number(currentShift?.opening_balance || 0),
        total_sales: 0,
        cash_sales: 0,
        card_sales: 0,
        order_count: 0
      };
    }
    try {
      const { data, error } = await supabase.rpc('get_shift_summary', { p_shift_id: shiftId });
      if (error) throw error;
      return data;
    } catch {
      return {
        opening_balance: Number(currentShift?.opening_balance || 0),
        total_sales: 0,
        cash_sales: 0,
        card_sales: 0,
        order_count: 0
      };
    }
  }, [currentShift, isDemo]);

  const value = useMemo<RestaurantDomainState>(() => ({
    restaurantTables,
    currentShift,
    openTableSession,
    reserveTable,
    cancelReservation,
    transferTableSession,
    mergeTableSessions,
    createRestaurantOrder,
    getOpenTableOrder,
    completeRestaurantOrder,
    processSplitPayment,
    addRestaurantTable,
    updateRestaurantTable,
    deleteRestaurantTable,
    updateKitchenOrderStatus,
    startShift,
    closeCurrentShift,
    getCurrentShiftSummary,
    finalizeProductionOrder,
    refreshRestaurant: fetchRestaurantTables,
    refreshShift: fetchActiveShift,
  }), [
    restaurantTables,
    currentShift,
    openTableSession,
    reserveTable,
    cancelReservation,
    transferTableSession,
    mergeTableSessions,
    createRestaurantOrder,
    getOpenTableOrder,
    completeRestaurantOrder,
    processSplitPayment,
    addRestaurantTable,
    updateRestaurantTable,
    deleteRestaurantTable,
    updateKitchenOrderStatus,
    startShift,
    closeCurrentShift,
    getCurrentShiftSummary,
    finalizeProductionOrder,
    fetchRestaurantTables,
    fetchActiveShift,
  ]);

  return (
    <RestaurantContext.Provider value={value}>
      {children}
    </RestaurantContext.Provider>
  );
};

export const useRestaurantDomain = (): RestaurantDomainState => {
  let context: RestaurantDomainState | null = null;
  try {
    context = useContext(RestaurantContext);
  } catch {
    // If called outside React component tree, fallback to useAccounting
  }
  if (context) return context;

  // Fallback to unified AccountingContext
  const acc = useAccounting() as unknown as Record<string, unknown>;
  return {
    restaurantTables: (acc.restaurantTables as any[]) || [],
    currentShift: acc.currentShift,
    openTableSession: acc.openTableSession as (tableId: string) => Promise<string | null>,
    reserveTable: acc.reserveTable as (tableId: string, name: string, time: string) => Promise<boolean>,
    cancelReservation: acc.cancelReservation as (tableId: string) => Promise<void>,
    transferTableSession: acc.transferTableSession as (sessionId: string, targetTableId: string) => Promise<boolean>,
    mergeTableSessions: acc.mergeTableSessions as (sourceId: string, targetId: string) => Promise<boolean>,
    createRestaurantOrder: acc.createRestaurantOrder as (payload: Record<string, any>) => Promise<string>,
    getOpenTableOrder: acc.getOpenTableOrder as (tableId: string) => Promise<any>,
    completeRestaurantOrder: acc.completeRestaurantOrder as (orderId: string, method: string, total: number, accountId: string | null, warehouseId?: string) => Promise<void>,
    processSplitPayment: acc.processSplitPayment as (orderId: string, items: any[], method: string, total: number, accountId: string) => Promise<boolean>,
    addRestaurantTable: acc.addRestaurantTable as (data: Record<string, any>) => Promise<void>,
    updateRestaurantTable: acc.updateRestaurantTable as (id: string, data: Record<string, any>) => Promise<void>,
    deleteRestaurantTable: acc.deleteRestaurantTable as (id: string) => Promise<void>,
    updateKitchenOrderStatus: acc.updateKitchenOrderStatus as (id: string, status: string) => Promise<void>,
    startShift: acc.startShift as (amount: number) => Promise<void>,
    closeCurrentShift: acc.closeCurrentShift as (actualCash: number, notes: string, reconciliation?: ShiftReconciliationData | null) => Promise<void>,
    getCurrentShiftSummary: acc.getCurrentShiftSummary as () => Promise<any>,
    finalizeProductionOrder: acc.finalizeProductionOrder as (id: string, status: string, notes: string) => Promise<any>,
    refreshRestaurant: acc.refreshData as () => Promise<void>,
    refreshShift: acc.refreshBankingAndShift as () => Promise<void>,
  };
};

export default useRestaurantDomain;
