import { supabase } from '../supabaseClient';

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
  const testDataIds = {
    productId: '',
    sizeGroupId: '',
    toppingsGroupId: '',
    tableId: '',
    sessionId: '',
    orderId: '',
  };

  try {
    // --- 1. إعداد بيانات الاختبار ---
    log('1. إعداد بيانات الاختبار (منتج، إضافات، طاولة)...');
    
    // Create Product
    const { data: product } = await supabase
      .from('products')
      .insert({ name: 'بيتزا اختبار آلية', product_type: 'MANUFACTURED', sales_price: 50, cost: 20 })
      .select()
      .single();
    assert(!!product, 'فشل إنشاء المنتج.');
    testDataIds.productId = product.id;

    // Create "Size" Modifier Group
    const { data: sizeGroup } = await supabase
      .from('modifier_groups')
      .insert({ product_id: product.id, name: 'الحجم', selection_type: 'SINGLE', is_required: true })
      .select()
      .single();
    assert(!!sizeGroup, 'فشل إنشاء مجموعة الحجم.');
    testDataIds.sizeGroupId = sizeGroup.id;

    // Add Sizes
    await supabase.from('modifiers').insert([
      { modifier_group_id: sizeGroup.id, name: 'صغير', price: -10, cost: -5 },
      { modifier_group_id: sizeGroup.id, name: 'وسط', price: 0, cost: 0, is_default: true },
      { modifier_group_id: sizeGroup.id, name: 'كبير', price: 15, cost: 7 },
    ]);

    // Create "Toppings" Modifier Group
    const { data: toppingsGroup } = await supabase
      .from('modifier_groups')
      .insert({ product_id: product.id, name: 'الإضافات', selection_type: 'MULTIPLE', is_required: false })
      .select()
      .single();
    assert(!!toppingsGroup, 'فشل إنشاء مجموعة الإضافات.');
    testDataIds.toppingsGroupId = toppingsGroup.id;
    
    // Add Toppings
    await supabase.from('modifiers').insert([
      { modifier_group_id: toppingsGroup.id, name: 'جبنة إضافية', price: 8, cost: 3 },
      { modifier_group_id: toppingsGroup.id, name: 'زيتون', price: 5, cost: 1 },
    ]);
    log('✅ تم إعداد المنتج والإضافات بنجاح.', 'success');

    // Create Table
    const { data: table } = await supabase
      .from('restaurant_tables')
      .insert({ name: 'طاولة الاختبار الآلي', capacity: 4, section: 'Test Section' })
      .select()
      .single();
    assert(!!table, 'فشل إنشاء الطاولة.');
    testDataIds.tableId = table.id;
    log('✅ تم إعداد الطاولة بنجاح.', 'success');

    // --- 2. محاكاة عملية الطلب ---
    log('2. محاكاة عملية الطلب (فتح جلسة، إضافة صنف مع إضافات)...');
    
    // Open session
    const { data: session } = await supabase
      .from('table_sessions')
      .insert({ table_id: table.id, status: 'OPEN' })
      .select()
      .single();
    assert(!!session, 'فشل فتح جلسة للطاولة.');
    testDataIds.sessionId = session.id;

    // Simulate order creation
    const { data: middleModifier } = await supabase.from('modifiers').select('id').eq('name', 'وسط').single();
    const { data: cheeseModifier } = await supabase.from('modifiers').select('id').eq('name', 'جبنة إضافية').single();

    const itemsToSend = [{
      product_id: product.id,
      quantity: 1,
      unit_price: 50 + 8, // Base price + extra cheese
      unit_cost: 20 + 3, // Base cost + extra cheese cost
      notes: 'ملاحظة اختبار',
      modifiers: [
        { modifier_id: middleModifier!.id, price_at_order: 0, quantity: 1 },
        { modifier_id: cheeseModifier!.id, price_at_order: 8, quantity: 1 },
      ],
    }];
    
    const { data: newOrderId, error: orderError } = await supabase.rpc('create_restaurant_order', {
      p_session_id: session.id,
      p_items: itemsToSend,
      p_order_type: 'dine-in',
      p_customer_id: null
    });

    if (orderError) throw orderError;
    
    // Verify order creation
    const { data: createdOrder } = await supabase.from('orders').select('id, order_items(id, order_item_modifiers(modifier_id)), kitchen_orders(id)').eq('id', newOrderId).single();
    assert(!!createdOrder, 'فشل العثور على الطلب بعد إنشائه.');
    assert(createdOrder.order_items.length > 0, 'لم يتم إنشاء بنود الطلب.');
    assert(createdOrder.order_items[0].order_item_modifiers.length === 2, 'لم يتم ربط الإضافات بالطلب.');
    assert(createdOrder.kitchen_orders.length > 0, 'لم يتم إرسال الطلب للمطبخ.');
    testDataIds.orderId = createdOrder.id;
    log('✅ تم إنشاء الطلب وإرساله للمطبخ بنجاح.', 'success');

    log('🎉🎉🎉 اكتمل اختبار موديول المطاعم بنجاح! 🎉🎉🎉', 'success');

  } catch (error: any) {
    log(`❌ حدث خطأ أثناء الاختبار: ${error.message}`, 'error');
    console.error(error);
  } finally {
    // --- 5. تنظيف بيانات الاختبار ---
    log('5. تنظيف بيانات الاختبار...');
    if (testDataIds.productId) {
      await supabase.from('products').delete().eq('id', testDataIds.productId);
    }
    if (testDataIds.tableId) {
      await supabase.from('restaurant_tables').delete().eq('id', testDataIds.tableId);
    }
    // Deleting product and table should cascade delete modifiers, groups, sessions, orders, etc.
    log('✅ تم تنظيف بيانات الاختبار.', 'success');
  }
};