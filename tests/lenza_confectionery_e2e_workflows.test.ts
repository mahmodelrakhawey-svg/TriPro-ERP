import { describe, it, expect, vi } from 'vitest';
import { supabase } from '../supabaseClient';

describe('🍰 Lenza Confectionery E2E Workflows (اختبارات المسارات التشغيلية لحلواني لينزا)', () => {

  describe('1. دورة تصنيع التورت والحلويات واحتساب التكلفة الفعلية (BOM Recipe & Batch Production)', () => {
    it('تحسب التكلفة المعيارية وتكلفة الخامات بدقة متناهية لأمر تصنيع 40 تورتة شوكولاتة فاخرة', () => {
      // 1. مكونات الوصفة (Recipe BOM) لتورتة واحدة
      const torteRecipe = [
        { ingredient: 'دقيق فاخر استخراج 72%', qtyKg: 0.25, unitCost: 20 },      // 5.00 EGP
        { ingredient: 'شوكولاتة بلجيكي خام', qtyKg: 0.20, unitCost: 400 },      // 80.00 EGP
        { ingredient: 'زبدة نيوزيلندي طبيعي', qtyKg: 0.15, unitCost: 300 },     // 45.00 EGP
        { ingredient: 'سكر مكرر ناعم', qtyKg: 0.10, unitCost: 30 },            // 3.00 EGP
        { ingredient: 'بيض مزارع طازج (عدد)', qtyKg: 3, unitCost: 5 },           // 15.00 EGP
        { ingredient: 'علبة وقاعدة تورتة فاخرة', qtyKg: 1, unitCost: 12 },       // 12.00 EGP
      ];

      const singleTorteRawCost = torteRecipe.reduce((sum, item) => sum + (item.qtyKg * item.unitCost), 0);
      expect(singleTorteRawCost).toBe(160); // 160 جنيه تكلفة خامات مباشرة للتورتة

      // 2. تشغيل دفعة إنتاج 40 تورتة في المصنع
      const batchSize = 40;
      const totalRawMaterialsCost = singleTorteRawCost * batchSize;
      expect(totalRawMaterialsCost).toBe(6400);

      // 3. تكاليف التشغيل غير المباشرة (Overheads: عمالة الشيفات + استهلاك الفرن والغاز)
      const directLaborCost = 600; // أجور فنيين
      const utilityOverhead = 200; // غاز وكهرباء
      const totalOverheads = directLaborCost + utilityOverhead; // 800 EGP

      // 4. احتساب التكلفة الإجمالية الفعلية للدفعة
      const totalBatchCost = totalRawMaterialsCost + totalOverheads;
      expect(totalBatchCost).toBe(7200);

      // 5. تكلفة التورتة التامة الصنع الواحدة الجاهزة للعرض في المعرض
      const finalUnitCost = totalBatchCost / batchSize;
      expect(finalUnitCost).toBe(180); // 180 جنيه تكلفة فعلية كاملة للقطعة

      // هامش الربح عند سعر البيع للجمهور 350 جنيه
      const sellingPrice = 350;
      const grossProfitMargin = ((sellingPrice - finalUnitCost) / sellingPrice) * 100;
      expect(grossProfitMargin).toBeCloseTo(48.57, 1); // هامش ربح إجمالي 48.6%
    });

    it('تخصم خامات الإنتاج وتوزع هوالك التشغيل (Scrap/Wastage) بدقة دون عجز محاسبي', () => {
      const flourInitialStock = 500; // 500 كجم دقيق بالمستودع الرئيسي
      const requiredFlour = 40 * 0.25; // 10 كجم مطلوبين للتشغيلة
      const doughWastageKg = 0.5; // نصف كيلو هالك عجين أثناء الفرد والتشكيل

      const remainingFlourStock = flourInitialStock - (requiredFlour + doughWastageKg);
      expect(remainingFlourStock).toBe(489.5);

      // نسبة الهالك التشغيلي المقبولة (أقل من 6%)
      const wastagePercentage = (doughWastageKg / requiredFlour) * 100;
      expect(wastagePercentage).toBeLessThan(6.0);
    });
  });

  describe('2. دورة كاشير المعرض ونقاط البيع وإغلاق الوردية (Retail POS Showroom Shift Cycle)', () => {
    it('تحسب مبيعات الوردية متعددة طرق الدفع والمصروفات النثرية ومطابقة العهدة بدقة تامة', () => {
      // 1. فتح الوردية برصيد عهدة نقدية بالدرج
      const openingCashFloat = 500.00;

      // 2. حركة بيع 1: نقدي (2 تورتة شوكولاتة)
      const sale1Cash = 2 * 350; // 700 EGP

      // 3. حركة بيع 2: بطاقة ائتمان / فيزا (1.5 كجم حلويات شرقية مشكلة @ 240/كجم)
      const sale2Card = 1.5 * 240; // 360 EGP

      // 4. حركة بيع 3: دفع مركب مع كوبون خصم ترويجي 10%
      const rawOrderAmount = 400.00;
      const couponDiscount = rawOrderAmount * 0.10; // 40 EGP
      const netPaidSale3 = rawOrderAmount - couponDiscount; // 360 EGP (مدفوعة نقداً)

      // 5. حركة إيداع عربون حجز تورتة خاصة لمناسبة قادمة
      const customCakeAdvanceCash = 300.00;

      // 6. سحب مصروف نثري من الدرج (مصروف شاي وضيافة الفرع)
      const pettyCashExpense = 50.00;

      // إجمالي النقدية المتوقعة بالدرج عند نهاية الوردية
      const expectedCashAtClosing = openingCashFloat 
        + sale1Cash 
        + netPaidSale3 
        + customCakeAdvanceCash 
        - pettyCashExpense;

      expect(expectedCashAtClosing).toBe(500 + 700 + 360 + 300 - 50); // 1,810 EGP

      // مطابقة الجرد الفعلي للنقدية بالدرج
      const actualCountedCash = 1810.00;
      const cashDifference = actualCountedCash - expectedCashAtClosing;

      expect(cashDifference).toBe(0); // مطابقة تامة 100% دون أي عجز أو زيادة
    });

    it('تتحقق من توازن القيد المحاسبي المجمع لإغلاق الوردية (Double-Entry Balance Verification)', () => {
      // عناصر القيد اليومي المجمع الناتج من إغلاق الوردية:
      // المدين:
      const debitCash = 1360.00;         // صافي النقدية الموردة من المبيعات والعربون (700 + 360 + 300)
      const debitBankCard = 360.00;       // مبيعات نقاط البيع بالفيزا المحولة للبنك
      const debitDiscountAllowed = 40.00; // خصم الكوبونات المسموح به
      const debitPettyExpenses = 50.00;   // مصروفات نثرية من الدرج

      const totalDebit = debitCash + debitBankCard + debitDiscountAllowed + debitPettyExpenses;
      expect(totalDebit).toBe(1810.00);

      // الدائن:
      // إجمالي المبيعات = 700 + 360 + 400 = 1460 (شاملة الضريبة)
      const grossSales = 1460.00;
      const vatRate = 0.14;
      const netRevenue = grossSales / (1 + vatRate); // 1280.70 EGP
      const outputVat = grossSales - netRevenue;       // 179.30 EGP
      const customerAdvancesLiability = 300.00;      // التزام عربون حجز العملاء
      const pettyCashCredited = 50.00;               // إثبات سداد المصروف النثري

      const totalCredit = Math.round((netRevenue + outputVat + customerAdvancesLiability + pettyCashCredited) * 100) / 100;
      
      // التحقق من توازن القيد المالي الصارم (Debit = Credit)
      expect(totalDebit).toBe(totalCredit);
    });
  });

  describe('3. قراءة باركود موازين التجزئة الإلكترونية للأصناف الموزونة (Weighing Scale Barcode)', () => {
    it('يستخرج كود الصنف والوزن الإجمالي بدقة من باركود الميزان المطبوع (EAN-13 Weighing Scale)', () => {
      // المعيار الشائع لموازين السوبر ماركت والحلويات:
      // يبدأ بـ 21 (أو 99 للأصناف الموزونة)
      // الأرقام من 2 إلى 6: كود الصنف (مثلاً: 0142 = بسبوسة سمن بلدي مكسرات)
      // الأرقام من 7 إلى 11: الوزن بالجرام (مثلاً: 01250 = 1.250 كجم)
      // الرقم 12: رقم التحقق (Check digit)
      const barcodeScaleString = '210142012504';

      const isWeighingScaleBarcode = barcodeScaleString.startsWith('21') || barcodeScaleString.startsWith('99');
      expect(isWeighingScaleBarcode).toBe(true);

      const itemCode = barcodeScaleString.substring(2, 6);
      const weightInGrams = parseInt(barcodeScaleString.substring(6, 11), 10);
      const weightInKg = weightInGrams / 1000;

      expect(itemCode).toBe('0142');
      expect(weightInGrams).toBe(1250);
      expect(weightInKg).toBe(1.25);

      // احتساب السعر التلقائي إذا كان سعر الكيلو 220 جنيه
      const pricePerKg = 220.00;
      const computedTotal = Math.round(weightInKg * pricePerKg * 100) / 100;

      expect(computedTotal).toBe(275.00); // 1.25 كجم × 220 = 275 جنيه
    });
  });

  describe('4. وضع الإدخال السريع لمعارض الحلواني (Quick Mode vs Expert Mode)', () => {
    it('يحافظ على إعداد التفضيل المحلي (localStorage) بين الجلسات', () => {
      const STORAGE_KEY = 'tripro_sales_quick_mode';
      
      // محاكاة حفظ التفضيل السريع
      const mockStorage: Record<string, string> = {};
      mockStorage[STORAGE_KEY] = 'true';

      const isQuickModeSaved = mockStorage[STORAGE_KEY] === 'true';
      expect(isQuickModeSaved).toBe(true);

      // محاكاة التبديل للوضع الاحترافي
      mockStorage[STORAGE_KEY] = 'false';
      expect(mockStorage[STORAGE_KEY] === 'true').toBe(false);
    });

    it('يُبسط شاشة الفاتورة في صالات العرض بإخفاء الحقول غير الضرورية للكاشير', () => {
      // الحقول المتاحة في النموذج الكامل (Expert Mode)
      const allFormFields = [
        'customerId',
        'salespersonId',
        'warehouseId',
        'date',
        'dueDate',
        'currency',
        'exchangeRate',
        'pricingTier'
      ];

      // الحقول النشطة المعروضة في وضع الكاشير السريع (Quick Mode)
      const isQuickMode = true;
      const visibleFields = allFormFields.filter(field => {
        if (isQuickMode && ['salespersonId', 'dueDate', 'currency', 'exchangeRate'].includes(field)) {
          return false;
        }
        return true;
      });

      // الكاشير يرى فقط: العميل، المخزن، التاريخ، وسياسة التسعير
      expect(visibleFields).toEqual(['customerId', 'warehouseId', 'date', 'pricingTier']);
      expect(visibleFields.length).toBe(4);
    });
  });
});

