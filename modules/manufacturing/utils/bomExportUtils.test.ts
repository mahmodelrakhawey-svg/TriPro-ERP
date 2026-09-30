import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import { exportSingleProductBOMToExcel, exportMasterBOMToExcel } from './bomExportUtils';

// Mock XLSX.writeFile to inspect workbook without writing to disk
vi.mock('xlsx', async () => {
  const actual = await vi.importActual<typeof import('xlsx')>('xlsx');
  return {
    ...actual,
    writeFile: vi.fn(),
  };
});

describe('BOM & Recipes Excel Export Utils (تصدير مقادير وقوائم المواد والتصنيع)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockAllProducts = [
    {
      id: 'prod-finish-1',
      name: 'تورتة لوتس مقاس 24',
      sku: 'FG-TORT-01',
      unit: 'قطعة',
      product_type: 'MANUFACTURED',
      mfg_type: 'standard',
      cost: 180,
      sales_price: 320,
      labor_cost: 25,
      overhead_cost: 15,
      is_overhead_percentage: false
    },
    {
      id: 'prod-inter-1',
      name: 'ديسك كيك فانيليا مقاس 24',
      sku: 'SEMI-SPONGE-01',
      unit: 'ديسك',
      product_type: 'INTERMEDIATE_PRODUCT',
      mfg_type: 'intermediate',
      cost: 45,
      sales_price: 60,
      labor_cost: 10,
      overhead_cost: 5,
      is_overhead_percentage: false
    },
    {
      id: 'raw-flour-1',
      name: 'دقيق فاخر 72%',
      sku: 'RM-FLOUR',
      unit: 'كجم',
      product_type: 'RAW_MATERIAL',
      mfg_type: 'raw',
      cost: 25,
      purchase_price: 25
    },
    {
      id: 'raw-sugar-1',
      name: 'سكر أبيض ناعم',
      sku: 'RM-SUGAR',
      unit: 'كجم',
      product_type: 'RAW_MATERIAL',
      mfg_type: 'raw',
      cost: 35,
      purchase_price: 35
    }
  ];

  it('يصدر بطاقة مراجعة المقادير لصنف واحد مع أعمدة المراجعة والتوقيعات', () => {
    const singleProduct = mockAllProducts[0];
    const routing = { id: 'route-1', name: 'مسار إنتاج التورتة الافتراضي' };
    const routingSteps = [
      {
        id: 'step-1',
        step_order: 1,
        operation_name: 'مرحلة التجليس والتزيين',
        standard_time_minutes: 20,
        work_centers: { name: 'مركز التورت والجاتوه' },
        materials: [
          {
            id: 'mat-1',
            raw_material_id: 'prod-inter-1',
            quantity_required: 1,
            products: { name: 'ديسك كيك فانيليا مقاس 24', unit: 'ديسك' }
          },
          {
            id: 'mat-2',
            raw_material_id: 'raw-sugar-1',
            quantity_required: 0.15,
            products: { name: 'سكر أبيض ناعم', unit: 'كجم' }
          }
        ]
      }
    ];

    exportSingleProductBOMToExcel({
      product: singleProduct,
      isIntermediate: false,
      routing,
      routingSteps,
      allProducts: mockAllProducts,
      organizationName: 'مصنع حلواني النموذجي'
    });

    expect(XLSX.writeFile).toHaveBeenCalledTimes(1);
    const [wb, fileName] = (XLSX.writeFile as any).mock.calls[0];

    expect(fileName).toContain('مراجعة_مقادير_تورتة_لوتس');
    expect(wb.SheetNames.length).toBe(1);

    const sheet = wb.Sheets[wb.SheetNames[0]];
    const sheetData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

    // التحقق من ترويسة المصنع واسم الصنف
    expect(sheetData[0][1]).toBe('مصنع حلواني النموذجي');
    expect(sheetData[1][1]).toBe('تورتة لوتس مقاس 24');

    // التحقق من وجود أعمدة المراجعة المخصصة لمسؤول التصنيع
    const headersRow = sheetData.find(row => row.includes('اسم المادة الخام / المكون'));
    expect(headersRow).toBeDefined();
    expect(headersRow).toContain('الكمية الفعلية المقترحة (مسؤول التصنيع)');
    expect(headersRow).toContain('نسبة الفاقد / الهدر المسموح %');
    expect(headersRow).toContain('ملاحظات وتعديلات التشغيل');
    expect(headersRow).toContain('حالة الاعتماد');

    // التحقق من خانة التوقيعات
    const signatureRow = sheetData.find(row => row.some(cell => String(cell).includes('توقيع مسؤول التصنيع')));
    expect(signatureRow).toBeDefined();
  });

  it('يصدر الشيت الشامل لكافة الأصناف (Master BOM) مقسماً إلى 4 أوراق عمل احترافية', () => {
    const productOptions = [
      { id: 'prod-finish-1', name: 'تورتة لوتس مقاس 24', isIntermediate: false },
      { id: 'prod-inter-1', name: 'ديسك كيك فانيليا مقاس 24', isIntermediate: true }
    ];

    const routingsData = [
      {
        id: 'r-1',
        product_id: 'prod-finish-1',
        name: 'مسار التورتة',
        is_default: true,
        mfg_routing_steps: [
          {
            id: 's-1',
            step_order: 1,
            operation_name: 'تزيين',
            standard_time_minutes: 15,
            mfg_work_centers: { name: 'مركز التزيين' },
            mfg_step_materials: [
              {
                id: 'm-1',
                raw_material_id: 'prod-inter-1',
                quantity_required: 1
              }
            ]
          }
        ]
      },
      {
        id: 'r-2',
        product_id: 'prod-inter-1',
        name: 'مسار الديسك',
        is_default: true,
        mfg_routing_steps: [
          {
            id: 's-2',
            step_order: 1,
            operation_name: 'عجن وخبيز',
            standard_time_minutes: 40,
            mfg_work_centers: { name: 'أفران الخبيز' },
            mfg_step_materials: [
              {
                id: 'm-2',
                raw_material_id: 'raw-flour-1',
                quantity_required: 0.3
              }
            ]
          }
        ]
      }
    ];

    exportMasterBOMToExcel({
      organizationName: 'مصنع حلواني النموذجي',
      allProducts: mockAllProducts,
      productOptions,
      routingsData,
      bomsData: []
    });

    expect(XLSX.writeFile).toHaveBeenCalledTimes(1);
    const [wb, fileName] = (XLSX.writeFile as any).mock.calls[0];

    expect(fileName).toContain('شيت_المراجعة_الشامل_لقوائم_المواد_والتصنيع');
    // التأكد من وجود الأوراق الأربعة
    expect(wb.SheetNames).toEqual([
      'قائمة المقادير الشاملة',
      'الأصناف الوسيطة ونصف المصنعة',
      'المنتجات التامة المصنعة',
      'ملخص تكاليف الوصفات'
    ]);

    // التأكد من تصفية الأصناف الوسيطة في شيتها الخاص
    const intermediateSheet = wb.Sheets['الأصناف الوسيطة ونصف المصنعة'];
    const intData = XLSX.utils.sheet_to_json(intermediateSheet, { header: 1 }) as any[][];
    expect(intData.some(row => row.includes('ديسك كيك فانيليا مقاس 24'))).toBe(true);

    // التأكد من تصفية المنتجات التامة في شيتها الخاص
    const finishedSheet = wb.Sheets['المنتجات التامة المصنعة'];
    const finData = XLSX.utils.sheet_to_json(finishedSheet, { header: 1 }) as any[][];
    expect(finData.some(row => row.includes('تورتة لوتس مقاس 24'))).toBe(true);

    // التأكد من شيت ملخص التكاليف
    const summarySheet = wb.Sheets['ملخص تكاليف الوصفات'];
    const summaryData = XLSX.utils.sheet_to_json(summarySheet, { header: 1 }) as any[][];
    expect(summaryData[0]).toContain('إجمالي التكلفة المعيارية للوحدة');
    expect(summaryData[0]).toContain('هامش المساهمة المتوقع (ج.م)');
  });

  it('يقرأ ويحلل شيت الإكسيل المستورد ويستخرج الكميات المعدلة بواسطة مسؤول التصنيع بدقة (الشيت الشامل)', async () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['م', 'نوع الصنف', 'كود الصنف (SKU)', 'اسم الصنف المصنع / الوسيط', 'وحدة الصنف', 'رقم المرحلة', 'اسم المرحلة / العملية', 'مركز العمل', 'الوقت المعياري (د)', 'كود المكون', 'اسم المادة الخام / المكون', 'تصنيف المكون', 'الكمية المسجلة بالبرنامج', 'وحدة المكون', 'تكلفة الوحدة', 'إجمالي تكلفة المكون بالوصفة', 'الكمية بعد مراجعة مسؤول التصنيع', 'نسبة الهدر المسموح به %', 'ملاحظات مسؤول التشغيل والتصنيع', 'حالة الاعتماد'],
      [1, '🎂 منتج تام مصنع', 'FG-TORT-01', 'تورتة لوتس مقاس 24', 'قطعة', 1, 'تزيين', 'مركز التورت', 15, 'RM-SUGAR', 'سكر أبيض ناعم', '🧪 مادة خام', 0.15, 'كجم', 35, 5.25, 0.20, 5, 'زيادة السكر حسب طلب الشيف', 'معتمد']
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'قائمة المقادير الشاملة');
    const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const file = new File([u8], 'test_review.xlsx');
    (file as any).arrayBuffer = async () => new Uint8Array(u8).buffer;

    const { parseBOMExcelFile } = await import('./bomExportUtils');
    const result = await parseBOMExcelFile(file, mockAllProducts);

    expect(result.validRows).toBe(1);
    expect(result.modifiedRows).toBe(1);
    expect(result.rows[0].productName).toBe('تورتة لوتس مقاس 24');
    expect(result.rows[0].materialName).toBe('سكر أبيض ناعم');
    expect(result.rows[0].oldQty).toBe(0.15);
    expect(result.rows[0].newQty).toBe(0.20);
    expect(result.rows[0].isModified).toBe(true);
    expect(result.rows[0].status).toBe('valid');
  });

  it('يقرأ بطاقة مراجعة الصنف الفردي ويتعرف على الصنف الرئيسي حتى لو لم يكن مكرراً في كل سطر', async () => {
    const wbSingle = XLSX.utils.book_new();
    const wsSingle = XLSX.utils.aoa_to_sheet([
      ['المؤسسة / الشركة:', 'مصنع حلواني النموذجي', '', '', 'بطاقة مراجعة المقادير والوصفة المعيارية'],
      ['اسم الصنف:', 'تورتة لوتس مقاس 24', 'كود الصنف (SKU):', 'FG-TORT-01', 'نوع الصنف:', '🎂 صنف تام مصنع'],
      ['وحدة القياس والإنتاج:', 'قطعة', 'مسار الإنتاج:', 'المسار الافتراضي', 'تاريخ إعداد المراجعة:', '2026/09/30'],
      [],
      [],
      ['م', 'رقم المرحلة', 'اسم المرحلة / العملية الإنتاجية', 'مركز العمل المسؤول', 'الوقت المعياري (دقيقة)', 'كود المكون (SKU)', 'اسم المادة الخام / المكون', 'تصنيف المكون', 'الكمية المسجلة بالبرنامج', 'وحدة القياس', 'تكلفة الوحدة (معياري)', 'إجمالي تكلفة المكون بالوصفة', 'الكمية الفعلية المقترحة (مسؤول التصنيع)', 'نسبة الفاقد / الهدر المسموح %', 'ملاحظات وتعديلات التشغيل', 'حالة الاعتماد'],
      [1, 1, 'تزيين', 'مركز التورت', 15, 'RM-FLOUR', 'دقيق فاخر 72%', '🧪 مادة خام', 0.5, 'كجم', 25, 12.5, 0.6, 2, 'تعديل الدقيق', 'معتمد']
    ]);
    XLSX.utils.book_append_sheet(wbSingle, wsSingle, 'تورتة لوتس مقاس 24');
    const u8Single = XLSX.write(wbSingle, { type: 'array', bookType: 'xlsx' });
    const fileSingle = new File([u8Single], 'test_single.xlsx');
    (fileSingle as any).arrayBuffer = async () => new Uint8Array(u8Single).buffer;

    const { parseBOMExcelFile } = await import('./bomExportUtils');
    const resultSingle = await parseBOMExcelFile(fileSingle, mockAllProducts);

    expect(resultSingle.validRows).toBe(1);
    expect(resultSingle.rows[0].productName).toBe('تورتة لوتس مقاس 24');
    expect(resultSingle.rows[0].materialName).toBe('دقيق فاخر 72%');
    expect(resultSingle.rows[0].oldQty).toBe(0.5);
    expect(resultSingle.rows[0].newQty).toBe(0.6);
    expect(resultSingle.rows[0].isModified).toBe(true);
  });
});
