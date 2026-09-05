/**
 * TriPro ERP — POS Checkout Service
 * تنفيذ عمليات الدفع، إغلاق الأوردر، وإرسال البيانات لقاعدة البيانات أو طابور الأوفلاين
 */

import { supabase } from '../../../supabaseClient';
import { offlineService } from '../../../services/offlineService';
import { couponService, RetailCoupon } from './couponService';
import type { PosCartItem } from '../hooks/usePosCart';
import type { SplitPaymentDetails } from '../components/POS/SplitPaymentModal';

export interface PosCheckoutParams {
  cart: PosCartItem[];
  currentUser: any;
  organization: any;
  selectedTerminal: any;
  activeShift: any;
  selectedCustomer: any;
  paymentMethod: 'CASH' | 'CARD';
  splitData?: SplitPaymentDetails;
  amountPaid: number;
  total: number;
  subtotal: number;
  tax: number;
  totalDiscount: number;
  totalPromoDiscount: number;
  appliedPromotions: any[];
  appliedCoupon: RetailCoupon | null;
  couponDiscount: number;
  settings: any;
  warehouses: any[];
  isOnline: boolean;
  getItemEffectivePrice: (product: any, customPrice?: number) => number;
  isItemOfferActive: (product: any) => boolean;
}

export interface PosCheckoutResult {
  orderId: string | null;
  actualOrderNumber: string;
  receiptOrder: any;
  change: number;
  effectivePaid: number;
}

export async function processPosCheckout(params: PosCheckoutParams): Promise<PosCheckoutResult> {
  const {
    cart,
    currentUser,
    selectedTerminal,
    activeShift,
    selectedCustomer,
    paymentMethod,
    splitData,
    amountPaid,
    total,
    subtotal,
    tax,
    totalDiscount,
    totalPromoDiscount,
    appliedPromotions,
    appliedCoupon,
    couponDiscount,
    settings,
    warehouses,
    isOnline,
    getItemEffectivePrice,
    isItemOfferActive
  } = params;

  const effectivePaid = splitData
    ? (splitData.cashReceived + splitData.card + splitData.credit + splitData.loyalty + (splitData.couponDiscount || 0))
    : amountPaid;

  const change = splitData
    ? Math.max(0, splitData.cashReceived - splitData.cash)
    : Math.max(0, amountPaid - total);

  const effectiveMethod = splitData
    ? ((splitData.card > 0 && splitData.cash > 0) ? 'SPLIT' : (splitData.card > 0 ? 'CARD' : 'CASH'))
    : paymentMethod;

  // Map cart items to order items schema
  const itemsPayload = cart.map(item => ({
    product_id: item.product.id,
    quantity: item.weight !== undefined ? item.weight : item.quantity,
    unit_price: getItemEffectivePrice(item.product, item.customPrice),
    uom_id: item.uomId || null
  }));

  const effectiveWarehouseId = selectedTerminal?.warehouse_id || settings?.defaultWarehouseId || settings?.default_warehouse_id || (warehouses && warehouses[0]?.id) || '00000000-0000-0000-0000-000000000000';

  const orderData = {
    sessionId: null,
    userId: currentUser.id,
    orderType: 'TAKEAWAY',
    notes: splitData
      ? `مبيعات كاشير تجزئة سريعة [دفع متعدد: كاش ${splitData.cash}, فيزا ${splitData.card}, آجل ${splitData.credit}, ولاء ${splitData.loyalty}]`
      : 'مبيعات كاشير تجزئة سريعة',
    items: itemsPayload,
    warehouseId: effectiveWarehouseId,
    orgId: currentUser.organization_id,
    customerId: selectedCustomer?.id || null,
    paymentMethod: effectiveMethod,
    paymentAmount: total
  };

  let orderId: string | null = null;
  let actualOrderNumber = '';

  if (isOnline) {
    let atomicSuccess = false;

    // 🚀 Attempt high-speed atomic POS sale RPC (single database roundtrip)
    try {
      let treasuryId = selectedTerminal?.cash_account_id;
      if (!treasuryId) {
        treasuryId = settings?.accountMappings?.CASH || settings?.account_mappings?.CASH || null;
      }

      const { data: atomicData, error: atomicErr } = await supabase.rpc('complete_pos_sale_atomic', {
        p_items: itemsPayload,
        p_org_id: currentUser.organization_id,
        p_user_id: currentUser.id,
        p_warehouse_id: effectiveWarehouseId !== '00000000-0000-0000-0000-000000000000' ? effectiveWarehouseId : null,
        p_customer_id: selectedCustomer?.id || null,
        p_payment_method: effectiveMethod,
        p_payment_amount: total,
        p_shift_id: activeShift?.id || null,
        p_terminal_id: selectedTerminal?.id || null,
        p_total_discount: totalDiscount || 0,
        p_notes: orderData.notes,
        p_cash_account_id: treasuryId
      });

      if (!atomicErr && atomicData?.success) {
        orderId = atomicData.order_id;
        actualOrderNumber = atomicData.order_number;
        atomicSuccess = true;
      }
    } catch (atomicException) {
      console.warn('Atomic POS checkout RPC fallback to standard flow:', atomicException);
    }

    // Graceful fallback to legacy multi-roundtrip if atomic RPC is not yet executed in database
    if (!atomicSuccess) {
      // 1. Create order on Supabase
      const { data, error } = await supabase.rpc('create_restaurant_order', {
        p_session_id: null,
        p_user_id: currentUser.id,
        p_order_type: 'TAKEAWAY',
        p_notes: orderData.notes,
        p_items: itemsPayload,
        p_customer_id: selectedCustomer?.id || null,
        p_warehouse_id: effectiveWarehouseId !== '00000000-0000-0000-0000-000000000000' ? effectiveWarehouseId : null,
        p_delivery_info: null,
        p_org_id: currentUser.organization_id
      });

      if (error) throw error;
      orderId = data;

      if (orderId) {
        // Update order with shift_id, terminal_id and total_discount
        const updatePayload: any = {
          shift_id: activeShift?.id || null,
          total_discount: totalDiscount || 0
        };
        if (selectedTerminal?.id) {
          updatePayload.terminal_id = selectedTerminal.id;
        }

        await supabase
          .from('orders')
          .update(updatePayload)
          .eq('id', orderId);

        // 2. Complete order (process payment & stock)
        let treasuryId = selectedTerminal?.cash_account_id;
        if (!treasuryId) {
          treasuryId = settings?.accountMappings?.CASH || settings?.account_mappings?.CASH || null;
          if (!treasuryId) {
            const { data: mappings } = await supabase
              .from('company_settings')
              .select('account_mappings')
              .eq('organization_id', currentUser.organization_id)
              .maybeSingle();
            treasuryId = mappings?.account_mappings?.CASH || null;
          }
        }

        const { error: payErr } = await supabase.rpc('complete_restaurant_order', {
          p_order_id: orderId,
          p_payment_method: effectiveMethod,
          p_amount: total,
          p_cash_account_id: treasuryId,
          p_org_id: currentUser.organization_id,
          p_warehouse_id: effectiveWarehouseId !== '00000000-0000-0000-0000-000000000000' ? effectiveWarehouseId : null
        });

        if (payErr) throw payErr;
      }
    }

    // 3. Record coupon usage if applied
    if (appliedCoupon) {
      await couponService.recordUsage(appliedCoupon.id, currentUser.organization_id);
    }
  } else {
    // Queue order for offline sync
    const offlinePayload = {
      ...orderData,
      shift_id: activeShift?.id || null,
      terminal_id: selectedTerminal?.id || null,
      is_offline: true
    };
    await offlineService.queueOrder(offlinePayload);
  }

  const finalPromoDiscount = totalPromoDiscount || 0;
  const effectiveCouponDiscount = splitData?.couponDiscount !== undefined ? splitData.couponDiscount : (couponDiscount || 0);
  const totalSavings = finalPromoDiscount + effectiveCouponDiscount;

  // Fetch actual order number from database if not already returned by atomic RPC
  if (orderId && !actualOrderNumber) {
    try {
      const { data: ordRow } = await supabase
        .from('orders')
        .select('order_number')
        .eq('id', orderId)
        .maybeSingle();
      if (ordRow?.order_number) {
        actualOrderNumber = ordRow.order_number;
      }
    } catch (e) {
      console.warn('Could not fetch real order_number:', e);
    }
  }
  if (!actualOrderNumber) {
    actualOrderNumber = `ORD-${Date.now().toString().slice(-6)}`;
  }

  const receiptOrder = {
    orderNumber: actualOrderNumber,
    date: new Date().toLocaleDateString('ar-EG'),
    time: new Date().toLocaleTimeString('ar-EG'),
    items: cart.map(i => ({
      name: i.product.name,
      quantity: i.weight !== undefined ? i.weight : i.quantity,
      price: getItemEffectivePrice(i.product, i.customPrice),
      originalPrice: isItemOfferActive(i.product) && i.customPrice === undefined ? Number(i.product.sales_price || 0) : undefined,
      isOffer: isItemOfferActive(i.product) && i.customPrice === undefined,
      unit: i.weight !== undefined ? 'كجم' : (i.uomName || 'حبة')
    })),
    subtotal,
    promoDiscount: finalPromoDiscount,
    appliedPromotions: appliedPromotions || [],
    appliedCoupon: appliedCoupon ? appliedCoupon.name : undefined,
    couponDiscount: effectiveCouponDiscount > 0 ? effectiveCouponDiscount : undefined,
    totalSavings,
    tax,
    total,
    amountPaid: effectivePaid,
    change,
    splitDetails: splitData
  };

  return {
    orderId,
    actualOrderNumber,
    receiptOrder,
    change,
    effectivePaid
  };
}
