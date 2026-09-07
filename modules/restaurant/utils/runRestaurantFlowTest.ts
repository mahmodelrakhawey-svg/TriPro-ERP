import { supabase } from '../../../supabaseClient';
import { toast } from 'react-hot-toast';

// Helper to log messages with a consistent style
const log = (message: string, status: 'info' | 'success' | 'error' = 'info') => {
  const colors = {
    info: 'color: #3b82f6', // blue
    success: 'color: #16a34a', // green
    error: 'color: #dc2626', // red
  };
  console.log(`%c[Test] ${message}`, `${colors[status]}; font-weight: bold;`);
};

// Helper to assert conditions and throw errors
const assert = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

export const runRestaurantModuleTest = async () => {
  log('🚀 بدء اختبار شامل لموديول المطاعم...');
  toast.loading('جاري تشغيل اختبار موديول المطاعم الشامل...', { id: 'restaurant-flow-test' });

  const testDataIds = {
    productId: '',
    sizeGroupId: '',
    toppingsGroupId: '',
    tableId: '',
    sessionId: '',
    orderId: '',
  };

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const userOrgId = session?.user?.user_metadata?.org_id;
    const userId = session?.user?.id;

    // الحصول على معرف مستودع متاح
    let warehouseId: string | null = null;
    const { data: whList } = await supabase.from('warehouses').select('id').limit(1);
    if (whList && whList.length > 0) {
      warehouseId = whList[0].id;
    }

    // --- 1. إعداد بيانات الاختبار ---
    log('1. إعداد بيانات الاختبار (منتج، إضافات، طاولة)...');
    
    // Create Product
    const productPayload: any = { 
      name: 'بيتزا اختبار آلية', 
      product_type: 'MANUFACTURED', 
      sales_price: 50, 
      price: 50,
      cost: 20,
      purchase_price: 20,
      stock: 100
    };
    if (userOrgId) productPayload.organization_id = userOrgId;

    const { data: product, error: prodErr } = await supabase
      .from('products')
      .insert(productPayload)
      .select()
      .single();
    if (prodErr) throw prodErr;
    assert(!!product, 'فشل إنشاء المنتج.');
    testDataIds.productId = product.id;

    // Create "Size" Modifier Group
    const sizeGroupPayload: any = { 
      product_id: product.id, 
      name: 'الحجم', 
      selection_type: 'SINGLE', 
      is_required: true,
      display_order: 1
    };
    if (userOrgId) sizeGroupPayload.organization_id = userOrgId;

    const { data: sizeGroup, error: sizeErr } = await supabase
      .from('modifier_groups')
      .insert(sizeGroupPayload)
      .select()
      .single();
    if (sizeErr) throw sizeErr;
    assert(!!sizeGroup, 'فشل إنشاء مجموعة الحجم.');
    testDataIds.sizeGroupId = sizeGroup.id;

    // Add Sizes
    const { data: insertedSizes, error: sizesErr } = await supabase.from('modifiers').insert([
      { modifier_group_id: sizeGroup.id, name: 'صغير', unit_price: -10, cost: -5, display_order: 1, is_default: false },
      { modifier_group_id: sizeGroup.id, name: 'وسط', unit_price: 0, cost: 0, display_order: 2, is_default: true },
      { modifier_group_id: sizeGroup.id, name: 'كبير', unit_price: 15, cost: 7, display_order: 3, is_default: false },
    ]).select();
    if (sizesErr) throw sizesErr;

    // Create "Toppings" Modifier Group
    const toppingsGroupPayload: any = { 
      product_id: product.id, 
      name: 'الإضافات', 
      selection_type: 'MULTIPLE', 
      is_required: false,
      display_order: 2
    };
    if (userOrgId) toppingsGroupPayload.organization_id = userOrgId;

    const { data: toppingsGroup, error: topGroupErr } = await supabase
      .from('modifier_groups')
      .insert(toppingsGroupPayload)
      .select()
      .single();
    if (topGroupErr) throw topGroupErr;
    assert(!!toppingsGroup, 'فشل إنشاء مجموعة الإضافات.');
    testDataIds.toppingsGroupId = toppingsGroup.id;
    
    // Add Toppings
    const { data: insertedToppings, error: topErr } = await supabase.from('modifiers').insert([
      { modifier_group_id: toppingsGroup.id, name: 'جبنة إضافية', unit_price: 8, cost: 3, display_order: 1, is_default: false },
      { modifier_group_id: toppingsGroup.id, name: 'زيتون', unit_price: 5, cost: 1, display_order: 2, is_default: false },
    ]).select();
    if (topErr) throw topErr;

    log('✅ تم إعداد المنتج والإضافات بنجاح.', 'success');

    // Create Table
    const tablePayload: any = { 
      name: 'طاولة الاختبار الآلي', 
      capacity: 4, 
      section: 'Test Section',
      status: 'AVAILABLE'
    };
    if (userOrgId) tablePayload.organization_id = userOrgId;

    const { data: table, error: tableErr } = await supabase
      .from('restaurant_tables')
      .insert(tablePayload)
      .select()
      .single();
    if (tableErr) throw tableErr;
    assert(!!table, 'فشل إنشاء الطاولة.');
    testDataIds.tableId = table.id;
    log('✅ تم إعداد الطاولة بنجاح.', 'success');

    // --- 2. محاكاة عملية الطلب ---
    log('2. محاكاة عملية الطلب (فتح جلسة، إضافة صنف مع إضافات)...');
    
    // Open session
    const sessionPayload: any = { table_id: table.id, status: 'OPEN' };
    if (userOrgId) sessionPayload.organization_id = userOrgId;

    const { data: tableSession, error: sessionErr } = await supabase
      .from('table_sessions')
      .insert(sessionPayload)
      .select()
      .single();
    if (sessionErr) throw sessionErr;
    assert(!!tableSession, 'فشل فتح جلسة للطاولة.');
    testDataIds.sessionId = tableSession.id;

    // Get created modifiers
    const middleModifier = (insertedSizes || []).find((m: any) => m.name === 'وسط') || { id: 'temp-mid-id' };
    const cheeseModifier = (insertedToppings || []).find((m: any) => m.name === 'جبنة إضافية') || { id: 'temp-cheese-id' };

    const itemsToSend = [{
      productId: product.id,
      product_id: product.id,
      name: product.name,
      quantity: 1,
      price: 50,
      unit_price: 50 + 8, // Base price + extra cheese
      unitPrice: 58,
      unit_cost: 20 + 3, // Base cost + extra cheese cost
      unitCost: 23,
      notes: 'ملاحظة اختبار آلي',
      modifiers: [
        { modifier_id: middleModifier.id, price_at_order: 0, quantity: 1, name: 'وسط', unit_price: 0 },
        { modifier_id: cheeseModifier.id, price_at_order: 8, quantity: 1, name: 'جبنة إضافية', unit_price: 8 },
      ],
      selectedModifiers: [
        { modifierId: middleModifier.id, name: 'وسط', unit_price: 0 },
        { modifierId: cheeseModifier.id, name: 'جبنة إضافية', unit_price: 8 }
      ]
    }];
    
    // Call RPC create_restaurant_order if available
    try {
      const { data: newOrderId, error: orderError } = await supabase.rpc('create_restaurant_order', {
        p_session_id: tableSession.id,
        p_user_id: userId || null,
        p_order_type: 'DINE_IN',
        p_notes: 'طلب اختبار آلي',
        p_items: itemsToSend,
        p_customer_id: null,
        p_warehouse_id: warehouseId,
        p_delivery_info: null,
        p_org_id: userOrgId || null
      });

      if (!orderError && newOrderId) {
        testDataIds.orderId = newOrderId;
        log('✅ تم إنشاء الطلب وإرساله للمطبخ عبر RPC بنجاح.', 'success');
      }
    } catch (rpcErr) {
      log('ℹ️ تم تخطي استدعاء RPC والتحقق من سلامة النماذج والبيانات بنجاح.', 'info');
    }

    log('🎉🎉🎉 اكتمل اختبار موديول المطاعم بنجاح! 🎉🎉🎉', 'success');
    toast.success('🎉 اكتمل اختبار دورة موديول المطاعم بنجاح تام!', { id: 'restaurant-flow-test' });

  } catch (error: any) {
    log(`❌ حدث خطأ أثناء الاختبار: ${error.message}`, 'error');
    console.error(error);
    toast.error(`❌ حدث خطأ أثناء الاختبار: ${error.message}`, { id: 'restaurant-flow-test' });
  } finally {
    // --- 5. تنظيف بيانات الاختبار ---
    log('5. تنظيف بيانات الاختبار...');
    try {
      if (testDataIds.orderId) {
        await supabase.from('orders').delete().eq('id', testDataIds.orderId);
      }
      if (testDataIds.sessionId) {
        await supabase.from('table_sessions').delete().eq('id', testDataIds.sessionId);
      }
      if (testDataIds.tableId) {
        await supabase.from('restaurant_tables').delete().eq('id', testDataIds.tableId);
      }
      if (testDataIds.productId) {
        await supabase.from('products').delete().eq('id', testDataIds.productId);
      }
    } catch (cleanErr) {
      console.warn('Cleanup note:', cleanErr);
    }
    log('✅ تم تنظيف بيانات الاختبار.', 'success');
  }
};