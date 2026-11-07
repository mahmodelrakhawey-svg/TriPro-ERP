import { describe, it, expect } from 'vitest';
import { autoReorderService } from '../../services/autoReorderService';
import { Product } from '../../types';

describe('📦 AutoReorderService (محرك حد الأمان وإعادة الطلب التلقائي للمخزون)', () => {
  const mockSuppliers = [
    { id: 'sup-default', name: 'المورد الرئيسي العام' },
    { id: 'sup-dairy', name: 'شركة الألبان الوطنية' },
    { id: 'sup-meat', name: 'مؤسسة اللحوم الطازجة' }
  ];

  const mockCategories = [
    { id: 'cat-raw', name: 'خامات ومكونات' },
    { id: 'cat-pack', name: 'تعبئة وتغليف' }
  ];

  it('يجب استبعاد الخدمات والأصناف الخدمية (SERVICE) تماماً من مقترحات إعادة الطلب', () => {
    const products: Product[] = [
      {
        id: 'serv-1',
        name: 'خدمة توصيل سريع',
        item_type: 'SERVICE',
        stock: 0,
        min_stock_level: 10
      } as any,
      {
        id: 'serv-2',
        name: 'خدمة تركيب وصيانة',
        product_type: 'SERVICE',
        stock: 0,
        min_stock: 5
      } as any
    ];

    const results = autoReorderService.analyzeReorderNeeds(products, mockSuppliers, mockCategories);
    expect(results).toHaveLength(0);
  });

  it('يجب تجاهل الأصناف التي لم يتم تحديد حد أمان (min_stock <= 0) لها', () => {
    const products: Product[] = [
      {
        id: 'p-no-limit',
        name: 'صنف بدون حد طلب',
        stock: 2,
        min_stock_level: 0
      } as any
    ];

    const results = autoReorderService.analyzeReorderNeeds(products, mockSuppliers, mockCategories);
    expect(results).toHaveLength(0);
  });

  it('يجب حساب كمية إعادة الطلب والتكلفة التقديرية بدقة وفق الحد الأقصى للمخزون', () => {
    const products: Product[] = [
      {
        id: 'prod-milk',
        name: 'حليب كامل الدسم 1 لتر',
        sku: 'MILK-001',
        unit: 'كرتونة',
        stock: 15,
        min_stock_level: 20,
        max_stock_level: 50,
        purchase_price: 35.5,
        supplier_id: 'sup-dairy',
        category_id: 'cat-raw'
      } as any
    ];

    const results = autoReorderService.analyzeReorderNeeds(products, mockSuppliers, mockCategories);
    expect(results).toHaveLength(1);

    const item = results[0];
    expect(item.productId).toBe('prod-milk');
    expect(item.currentStock).toBe(15);
    expect(item.minSafetyStock).toBe(20);
    // Needed: 50 - 15 = 35
    expect(item.reorderQuantity).toBe(35);
    // Cost: 35 * 35.5 = 1242.50
    expect(item.estimatedCost).toBe(1242.5);
    expect(item.preferredSupplierId).toBe('sup-dairy');
    expect(item.preferredSupplierName).toBe('شركة الألبان الوطنية');
    expect(item.categoryName).toBe('خامات ومكونات');
  });

  it('يجب تصنيف درجة الاستعجال بدقة (CRITICAL, LOW_STOCK, NORMAL)', () => {
    const products: Product[] = [
      {
        id: 'p-critical',
        name: 'صنف نفد بالكامل (رصيد صفر)',
        stock: 0,
        min_stock_level: 10,
        max_stock_level: 30,
        purchase_price: 100
      } as any,
      {
        id: 'p-low',
        name: 'صنف هبط تحت نصف حد الأمان',
        stock: 3, // <= 10 * 0.5 (5)
        min_stock_level: 10,
        max_stock_level: 30,
        purchase_price: 50
      } as any,
      {
        id: 'p-normal',
        name: 'صنف هبط تحت حد الأمان العادي',
        stock: 8, // > 5 and <= 10
        min_stock_level: 10,
        max_stock_level: 30,
        purchase_price: 20
      } as any
    ];

    const results = autoReorderService.analyzeReorderNeeds(products, mockSuppliers, mockCategories);
    expect(results).toHaveLength(3);

    const criticalItem = results.find(r => r.productId === 'p-critical');
    const lowItem = results.find(r => r.productId === 'p-low');
    const normalItem = results.find(r => r.productId === 'p-normal');

    expect(criticalItem?.urgency).toBe('CRITICAL');
    expect(lowItem?.urgency).toBe('LOW_STOCK');
    expect(normalItem?.urgency).toBe('NORMAL');
  });

  it('يجب ترتيب التوصيات وتقديم الأصناف الحرجة (CRITICAL / رصيد صفر أو سالب) أولاً', () => {
    const products: Product[] = [
      {
        id: 'p-has-stock',
        name: 'صنف فيه رصيد قليل',
        stock: 4,
        min_stock_level: 10
      } as any,
      {
        id: 'p-zero-stock',
        name: 'صنف رصيده صفر',
        stock: 0,
        min_stock_level: 10
      } as any
    ];

    const results = autoReorderService.analyzeReorderNeeds(products, mockSuppliers, mockCategories);
    expect(results[0].productId).toBe('p-zero-stock');
    expect(results[0].currentStock).toBe(0);
  });

  it('يجب استخدام المورد الافتراضي العام في حال لم يكن للصنف مورد محدد', () => {
    const products: Product[] = [
      {
        id: 'p-no-supplier',
        name: 'صنف بدون مورد مخصص',
        stock: 1,
        min_stock_level: 5
      } as any
    ];

    const results = autoReorderService.analyzeReorderNeeds(products, mockSuppliers, mockCategories);
    expect(results).toHaveLength(1);
    expect(results[0].preferredSupplierId).toBe('sup-default');
    expect(results[0].preferredSupplierName).toBe('المورد الرئيسي العام');
  });

  it('يجب التعامل بمرونة مع مصفوفة منتجات فارغة بدون أخطاء استثنائية', () => {
    const results = autoReorderService.analyzeReorderNeeds([], mockSuppliers, mockCategories);
    expect(results).toEqual([]);
  });
});
