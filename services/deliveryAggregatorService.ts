/**
 * ==============================================================================
 * Delivery Aggregators Gateway Service
 * TriPro ERP — services/deliveryAggregatorService.ts
 * ==============================================================================
 */

import { supabase } from '../supabaseClient';
import { AccountingEngine } from './accountingEngine';
import { secureStorage } from '../utils/securityMiddleware';

export interface AggregatorChannel {
  id: string;
  code: string; // 'talabat', 'jahez', 'hungerstation', 'deliveroo', 'noon_food'
  name: string;
  color: string;
  icon: string;
  commission_pct: number; // e.g. 18%
  is_active: boolean;
}

export interface AggregatorOrder {
  id: string;
  organization_id?: string | null;
  channel_code: string;
  channel_name: string;
  external_order_id: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  items: Array<{
    product_id?: string;
    name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    notes?: string;
    modifiers?: any[];
  }>;
  subtotal: number;
  tax: number;
  delivery_fee: number;
  gross_total: number;
  commission_pct: number;
  commission_amount: number;
  net_payout: number;
  status: 'PENDING_ACCEPTANCE' | 'ACCEPTED' | 'PREPARING' | 'READY_FOR_PICKUP' | 'COMPLETED' | 'CANCELLED';
  driver_name?: string;
  driver_phone?: string;
  estimated_pickup_time?: string;
  journal_entry_id?: string | null;
  created_at: string;
}

export const DEFAULT_AGGREGATOR_CHANNELS: AggregatorChannel[] = [
  { id: 'ch_talabat', code: 'talabat', name: 'طلبات (Talabat)', color: '#ff5a00', icon: 'ShoppingBag', commission_pct: 18, is_active: true },
  { id: 'ch_jahez', code: 'jahez', name: 'جاهز (Jahez)', color: '#dc2626', icon: 'Truck', commission_pct: 15, is_active: true },
  { id: 'ch_hungerstation', code: 'hungerstation', name: 'هنقرستيشن (Hungerstation)', color: '#f59e0b', icon: 'Zap', commission_pct: 20, is_active: true },
  { id: 'ch_deliveroo', code: 'deliveroo', name: 'ديليفرو (Deliveroo)', color: '#00cdbc', icon: 'Package', commission_pct: 16, is_active: true },
  { id: 'ch_noon', code: 'noon_food', name: 'نون فود (Noon Food)', color: '#eab308', icon: 'Layers', commission_pct: 12, is_active: true }
];

const LOCAL_AGGREGATOR_ORDERS_KEY = 'tripro_aggregator_orders_v1';
const LOCAL_AGGREGATOR_CHANNELS_KEY = 'tripro_aggregator_channels_v1';

class DeliveryAggregatorService {
  public getChannels(): AggregatorChannel[] {
    const saved = secureStorage.getItem<AggregatorChannel[]>(LOCAL_AGGREGATOR_CHANNELS_KEY);
    if (saved && Array.isArray(saved) && saved.length > 0) return saved;
    return DEFAULT_AGGREGATOR_CHANNELS;
  }

  public saveChannel(channel: AggregatorChannel): void {
    const channels = this.getChannels();
    const filtered = channels.filter(c => c.id !== channel.id && c.code !== channel.code);
    secureStorage.setItem(LOCAL_AGGREGATOR_CHANNELS_KEY, [channel, ...filtered]);
  }

  public getOrders(organizationId?: string): AggregatorOrder[] {
    const orders = secureStorage.getItem<AggregatorOrder[]>(LOCAL_AGGREGATOR_ORDERS_KEY);
    if (orders && Array.isArray(orders)) return orders;
    return [];
  }

  /**
   * استقبال طلب خارجي جديد من Webhook المنصة
   */
  public receiveIncomingOrder(orderData: Partial<AggregatorOrder>): AggregatorOrder {
    const channelCode = orderData.channel_code || 'talabat';
    const channels = this.getChannels();
    const ch = channels.find(c => c.code === channelCode) || DEFAULT_AGGREGATOR_CHANNELS[0];

    const grossTotal = Number(orderData.gross_total || orderData.subtotal || 0);
    const commPct = Number(orderData.commission_pct || ch.commission_pct || 15);
    const commAmt = Number(((grossTotal * commPct) / 100).toFixed(2));
    const netPayout = Number((grossTotal - commAmt).toFixed(2));

    const newOrder: AggregatorOrder = {
      id: `agg_ord_${Date.now()}`,
      organization_id: orderData.organization_id || null,
      channel_code: ch.code,
      channel_name: ch.name,
      external_order_id: orderData.external_order_id || `#${ch.code.toUpperCase().slice(0, 3)}-${Date.now().toString().slice(-5)}`,
      customer_name: orderData.customer_name || 'عميل منصة توصيل',
      customer_phone: orderData.customer_phone || '05xxxxxxxx',
      customer_address: orderData.customer_address || 'توصيل عبر السائق التابع للمنصة',
      items: orderData.items || [],
      subtotal: Number(orderData.subtotal || grossTotal),
      tax: Number(orderData.tax || 0),
      delivery_fee: Number(orderData.delivery_fee || 0),
      gross_total: grossTotal,
      commission_pct: commPct,
      commission_amount: commAmt,
      net_payout: netPayout,
      status: 'PENDING_ACCEPTANCE',
      driver_name: orderData.driver_name || 'سائق المنصة',
      driver_phone: orderData.driver_phone || '',
      created_at: new Date().toISOString()
    };

    const currentOrders = this.getOrders();
    secureStorage.setItem(LOCAL_AGGREGATOR_ORDERS_KEY, [newOrder, ...currentOrders]);
    return newOrder;
  }

  /**
   * قبول الطلب وتمريره للمطبخ والـ POS والحسابات
   */
  public async acceptAndRouteOrder(params: {
    aggregatorOrderId: string;
    organizationId: string;
    receivableAccountId?: string;
    salesAccountId?: string;
    commissionExpenseAccountId?: string;
    userId?: string;
  }): Promise<{ success: boolean; orderId?: string; journalEntryId?: string; error?: string }> {
    const orders = this.getOrders();
    const aggOrder = orders.find(o => o.id === params.aggregatorOrderId);
    if (!aggOrder) return { success: false, error: 'الطلب غير موجود' };

    let createdOrderId = `ord_agg_${Date.now()}`;
    let journalEntryId: string | undefined;

    // 1. إنشاء طلب في جدول orders ونقله للـ KDS عبر RPC أو الإدراج المباشر
    try {
      const itemsForRpc = aggOrder.items.map(it => ({
        product_id: it.product_id || null,
        quantity: it.quantity,
        unit_price: it.unit_price,
        price_at_order: it.unit_price,
        notes: it.notes || null,
        modifiers: it.modifiers || []
      }));

      const { data: rpcOrderId, error: rpcErr } = await supabase.rpc('create_restaurant_order', {
        p_session_id: null,
        p_user_id: null,
        p_order_type: 'DELIVERY',
        p_notes: `طلب منصة توصيل: ${aggOrder.channel_name} (#${aggOrder.external_order_id})`,
        p_items: itemsForRpc,
        p_customer_id: null,
        p_warehouse_id: null,
        p_delivery_info: {
          aggregator: aggOrder.channel_name,
          customer_name: aggOrder.customer_name,
          customer_phone: aggOrder.customer_phone,
          address: aggOrder.customer_address,
          external_order_id: aggOrder.external_order_id
        },
        p_org_id: params.organizationId || null
      });

      if (!rpcErr && rpcOrderId) {
        createdOrderId = rpcOrderId;
      } else {
        // Fallback: direct insert with robust column structure
        const { data: createdDbOrder } = await supabase
          .from('orders')
          .insert({
            organization_id: params.organizationId || null,
            order_number: aggOrder.external_order_id,
            order_type: 'DELIVERY',
            status: 'PREPARING',
            grand_total: aggOrder.gross_total,
            notes: `طلب منصة توصيل: ${aggOrder.channel_name}`
          })
          .select('id')
          .single();

        if (createdDbOrder) {
          createdOrderId = createdDbOrder.id;
          if (aggOrder.items.length > 0) {
            const itemsToInsert = aggOrder.items.map(it => ({
              order_id: createdOrderId,
              product_id: it.product_id || null,
              quantity: it.quantity,
              unit_price: it.unit_price,
              notes: it.notes || null,
              modifiers: it.modifiers || []
            }));
            await supabase.from('order_items').insert(itemsToInsert);
          }
        }
      }
    } catch (dbErr) {
      console.warn('DB aggregator order routing notice:', dbErr);
    }

    // 2. إنشاء القيد المحاسبي لعمولة المنصة والمبيعات
    if (params.receivableAccountId && params.salesAccountId && params.commissionExpenseAccountId) {
      try {
        const jResult = await AccountingEngine.createJournalEntry({
          organizationId: params.organizationId,
          transactionDate: new Date().toISOString().split('T')[0],
          reference: `JE-${aggOrder.external_order_id}`,
          description: `إثبات مبيعات منصة توصيل ${aggOrder.channel_name} - طلب رقم ${aggOrder.external_order_id}`,
          lines: [
            {
              accountId: params.receivableAccountId, // مدين: مستحق على شركة التوصيل (الصافي)
              debit: aggOrder.net_payout,
              credit: 0,
              description: `صافي مستحق على منصة ${aggOrder.channel_name}`
            },
            {
              accountId: params.commissionExpenseAccountId, // مدين: مصروف عمولة منصة التوصيل
              debit: aggOrder.commission_amount,
              credit: 0,
              description: `عمولة تسويق منصة ${aggOrder.channel_name} (${aggOrder.commission_pct}%)`
            },
            {
              accountId: params.salesAccountId, // دائن: إجمالي إيراد المبيعات
              debit: 0,
              credit: aggOrder.gross_total,
              description: `إجمالي مبيعات طلب ${aggOrder.external_order_id}`
            }
          ],
          status: 'posted'
        });

        if (jResult.success) {
          journalEntryId = jResult.journalEntryId;
        }
      } catch (jErr) {
        console.warn('Journal entry notice for aggregator order:', jErr);
      }
    }

    // تحديث حالة الطلب
    const updatedOrders = orders.map(o =>
      o.id === params.aggregatorOrderId ? { ...o, status: 'PREPARING' as const, journal_entry_id: journalEntryId } : o
    );
    secureStorage.setItem(LOCAL_AGGREGATOR_ORDERS_KEY, updatedOrders);

    return {
      success: true,
      orderId: createdOrderId,
      journalEntryId
    };
  }

  /**
   * تحديث حالة الطلب
   */
  public updateOrderStatus(orderId: string, status: AggregatorOrder['status']): void {
    const orders = this.getOrders();
    const updated = orders.map(o => (o.id === orderId ? { ...o, status } : o));
    secureStorage.setItem(LOCAL_AGGREGATOR_ORDERS_KEY, updated);
  }
}

export const deliveryAggregatorService = new DeliveryAggregatorService();
