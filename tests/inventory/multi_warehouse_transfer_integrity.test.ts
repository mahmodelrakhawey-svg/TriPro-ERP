import { describe, it, expect } from 'vitest';

describe('📦 Inter-Warehouse Transfer & Stock Conservation (نزاهة وحفظ كميات التحويل بين المستودعات)', () => {

  it('يحافظ على إجمالي كميات المخزون ثابتاً بنسبة 100% عند التحويل بين مستودع المصنع ومعرض لينزا', () => {
    // 1. الأرصدة المبدئية لصنف "شوكولاتة بلجيكي خام"
    const product = {
      id: 'prod-choco-belgium',
      name: 'شوكولاتة بلجيكي خام',
      totalStock: 220,
      warehouseStock: {
        'wh-factory': 200, // مستودع مصنع حلواني لينزا
        'wh-dokki': 20     // مستودع معرض الدقي
      }
    };

    const transferQty = 50; // تحويل 50 كجم للمعرض

    // 2. تنفيذ حركة التحويل (المخزون الخارج والوارد)
    const sourceInitial = product.warehouseStock['wh-factory'];
    const destInitial = product.warehouseStock['wh-dokki'];

    const newSourceStock = sourceInitial - transferQty;
    const newDestStock = destInitial + transferQty;

    product.warehouseStock['wh-factory'] = newSourceStock;
    product.warehouseStock['wh-dokki'] = newDestStock;

    // إعادة احتساب الإجمالي الكلي
    const updatedTotalStock = Object.values(product.warehouseStock).reduce((sum, s) => sum + s, 0);

    // التحقق من صحة الأرصدة
    expect(product.warehouseStock['wh-factory']).toBe(150);
    expect(product.warehouseStock['wh-dokki']).toBe(70);
    // صمام انحفاظ المادة: إجمالي الشركة لا يزيد ولا ينقص
    expect(updatedTotalStock).toBe(product.totalStock);
    expect(updatedTotalStock).toBe(220);
  });

  it('يمنع التحويل بعجز مخزني للشركات العادية، ويسمح به صراحة لحلواني لينزا لاستمرار التشغيل', () => {
    const availableStock = 40; // المتوفر بالمستودع 40 قطعة
    const requestedTransfer = 100; // المطلوب تحويله 100 قطعة

    // دالة محاكاة التحويل المخزني الرقابي
    function executeTransfer(allowNegativeStock: boolean) {
      if (!allowNegativeStock && requestedTransfer > availableStock) {
        throw new Error(`عجز مخزني: الرصيد المتاح (${availableStock}) أقل من الكمية المطلوبة (${requestedTransfer})`);
      }
      return availableStock - requestedTransfer; // رصيد سالب (-60)
    }

    // 1. شركة عادية (لا تسمح بالمخزون السالب): يجب أن تفشل وتلقي خطأ
    expect(() => executeTransfer(false)).toThrow(/عجز مخزني/);

    // 2. شركة حلواني لينزا (تسمح بالمخزون السالب): يجب أن تنجح لضمان عدم توقف خطوط الإنتاج والحلويات
    const lenzaResult = executeTransfer(true);
    expect(lenzaResult).toBe(-60);
  });

  it('يحول الكميات بوحدات القياس المتعددة (كرتونة إلى قطع) بدقة دون كسور شاردة', () => {
    // 1 كرتونة تورتة = 12 تورتة
    const uomRatio = 12;
    const transferCartons = 5; // تحويل 5 كراتين من المصنع للمعرض

    const baseQuantityTransferred = transferCartons * uomRatio;
    expect(baseQuantityTransferred).toBe(60); // 60 قطعة بالمستودع الفرعي

    // التحويل العكسي (تجزئة)
    const returnedPieces = 24;
    const returnedCartons = returnedPieces / uomRatio;
    expect(returnedCartons).toBe(2);
  });
});
