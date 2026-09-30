import * as XLSX from 'xlsx';
import { supabase } from '../../../supabaseClient';

export interface ExportSingleBOMParams {
  product: any;
  isIntermediate: boolean;
  routing: any | null;
  routingSteps: any[];
  allProducts: any[];
  organizationName?: string;
  fallbackBOM?: any[];
}

export interface ExportMasterBOMParams {
  organizationName?: string;
  allProducts: any[];
  productOptions: any[];
  routingsData: any[];
  bomsData: any[];
}

/**
 * دالة مساعدة لحساب العرض المناسب للأعمدة في ملف Excel
 */
function calculateColumnWidths(dataRows: any[][]): Array<{ wch: number }> {
  const colLengths: number[] = [];
  dataRows.forEach(row => {
    row.forEach((cell, colIdx) => {
      const str = cell !== null && cell !== undefined ? String(cell) : '';
      const len = str.length;
      colLengths[colIdx] = Math.max(colLengths[colIdx] || 0, len);
    });
  });
  return colLengths.map(len => ({
    wch: Math.min(Math.max(len + 3, 12), 42)
  }));
}

/**
 * تحديد مسمى وتصنيف المكون (خام، وسيط، تعبئة، صنف مخزني)
 */
function getMaterialBadge(prod: any): string {
  if (!prod) return '📦 صنف مخزني';
  const pType = String(prod.product_type || prod.item_type || '').toUpperCase();
  const mType = String(prod.mfg_type || '').toLowerCase();
  const name = String(prod.name || '').toLowerCase();

  if (pType === 'INTERMEDIATE_PRODUCT' || mType === 'intermediate' || mType === 'subassembly') {
    return '🍰 منتج وسيط / نصف مصنع';
  }
  if (pType === 'RAW_MATERIAL' || mType === 'raw') {
    if (name.includes('كرتون') || name.includes('علبة') || name.includes('قاعدة') || name.includes('تغليف') || name.includes('بوكس')) {
      return '📦 مستلزم تعبئة وتغليف';
    }
    return '🧪 مادة خام';
  }
  if (pType === 'MANUFACTURED' || mType === 'standard') {
    return '⚙️ منتج مصنّع';
  }
  return '📦 صنف مخزني';
}

/**
 * 1. تصدير بطاقة مراجعة المقادير والوصفة لصنف واحد (تام أو وسيط)
 */
export function exportSingleProductBOMToExcel({
  product,
  isIntermediate,
  routing,
  routingSteps,
  allProducts,
  organizationName = 'مصنع الإنتاج',
  fallbackBOM = []
}: ExportSingleBOMParams) {
  if (!product) return;

  const rows: any[][] = [];

  // 1. الترويسة الرئيسية والبيانات الوصفية
  rows.push(['المؤسسة / الشركة:', organizationName, '', '', 'بطاقة مراجعة المقادير والوصفة المعيارية (BOM Review Sheet)']);
  rows.push([
    'اسم الصنف:',
    product.name,
    'كود الصنف (SKU):',
    product.sku || product.code || '-',
    'نوع الصنف:',
    isIntermediate ? '🍰 صنف وسيط / نصف مصنع' : '🎂 صنف تام مصنع'
  ]);
  rows.push([
    'وحدة القياس والإنتاج:',
    product.unit || 'وحدة',
    'مسار الإنتاج:',
    routing?.name || 'المسار الافتراضي',
    'تاريخ إعداد المراجعة:',
    new Date().toLocaleDateString('ar-EG')
  ]);
  rows.push([
    'سعر البيع الحالي:',
    Number(product.sales_price || product.selling_price || 0),
    'التكلفة الإجمالية المسجلة:',
    Number(product.cost || 0),
    'أجور عمالة مباشرة:',
    Number(product.labor_cost || 0),
    'مصاريف غير مباشرة:',
    `${Number(product.overhead_cost || 0)}${product.is_overhead_percentage ? '%' : ' ج.م'}`
  ]);
  rows.push([]); // سطر فارغ فاصل

  // 2. ترويسة جدول المقادير والمراحل
  const tableHeaders = [
    'م',
    'رقم المرحلة',
    'اسم المرحلة / العملية الإنتاجية',
    'مركز العمل المسؤول',
    'الوقت المعياري (دقيقة)',
    'كود المكون (SKU)',
    'اسم المادة الخام / المكون',
    'تصنيف المكون',
    'الكمية المسجلة بالبرنامج',
    'وحدة القياس',
    'تكلفة الوحدة (معياري)',
    'إجمالي تكلفة المكون بالوصفة',
    'الكمية الفعلية المقترحة (مسؤول التصنيع)',
    'نسبة الفاقد / الهدر المسموح %',
    'ملاحظات وتعديلات التشغيل',
    'حالة الاعتماد'
  ];
  rows.push(tableHeaders);

  let serial = 1;
  let totalRawCost = 0;
  let totalTime = 0;
  let hasItems = false;

  // استخراج البيانات من خطوات المسار
  if (routingSteps && routingSteps.length > 0) {
    routingSteps.forEach(step => {
      totalTime += Number(step.standard_time_minutes || 0);
      const materials = step.materials || [];

      if (materials.length > 0) {
        materials.forEach((mat: any) => {
          hasItems = true;
          const rawProd = allProducts.find(p => p.id === mat.raw_material_id) || mat.products;
          const unitCost = Number(rawProd?.cost || rawProd?.purchase_price || 0);
          const qty = Number(mat.quantity_required || 0);
          const lineCost = Number((unitCost * qty).toFixed(2));
          totalRawCost += lineCost;

          rows.push([
            serial++,
            step.step_order || 1,
            step.operation_name || 'عملية إنتاجية',
            step.work_centers?.name || 'مركز عام',
            Number(step.standard_time_minutes || 0),
            rawProd?.sku || rawProd?.code || '-',
            rawProd?.name || 'مكون غير مسمى',
            getMaterialBadge(rawProd),
            qty,
            rawProd?.unit || 'وحدة',
            unitCost,
            lineCost,
            '', // خانة فارغة لتدوين الكمية بعد المراجعة
            '', // خانة فارغة لنسبة الهالك
            '', // خانة فارغة لملاحظات مسؤول التشغيل
            'قيد المراجعة'
          ]);
        });
      } else {
        // مرحلة بدون خامات (مثلاً فحص جودة أو تبريد)
        rows.push([
          serial++,
          step.step_order || 1,
          step.operation_name || 'عملية إنتاجية',
          step.work_centers?.name || 'مركز عام',
          Number(step.standard_time_minutes || 0),
          '-',
          '-- بدون مواد خام (عملية تشغيلية/فحص) --',
          '-',
          0,
          '-',
          0,
          0,
          '',
          '',
          '',
          'معتمد'
        ]);
      }
    });
  } else if (fallbackBOM && fallbackBOM.length > 0) {
    // في حال عدم وجود مسارات تفصيلية ولكن توجد قائمة مواد مباشرة في bill_of_materials
    fallbackBOM.forEach((mat: any) => {
      hasItems = true;
      const rawProd = allProducts.find(p => p.id === mat.raw_material_id) || mat.raw_material;
      const unitCost = Number(rawProd?.cost || rawProd?.purchase_price || 0);
      const qty = Number(mat.quantity_required || 0);
      const lineCost = Number((unitCost * qty).toFixed(2));
      totalRawCost += lineCost;

      rows.push([
        serial++,
        1,
        'إنتاج مباشر / قائمة المواد المباشرة',
        'صالة التشغيل الرئيسية',
        0,
        rawProd?.sku || rawProd?.code || '-',
        rawProd?.name || 'مكون غير مسمى',
        getMaterialBadge(rawProd),
        qty,
        rawProd?.unit || 'وحدة',
        unitCost,
        lineCost,
        '',
        mat.shrinkage_pct || '',
        '',
        'قيد المراجعة'
      ]);
    });
  }

  if (!hasItems) {
    rows.push([
      1,
      '-',
      'لا توجد مقادير أو مواد مسجلة لهذا الصنف حتى الآن',
      '-',
      0,
      '-',
      'يرجى إضافة المكونات من شاشة إعداد المسارات وقوائم المواد',
      '-',
      0,
      '-',
      0,
      0,
      '',
      '',
      '',
      'غير مكتمل'
    ]);
  }

  // 3. سطر الإجماليات
  rows.push([]);
  rows.push([
    'الإجمالي المعياري:',
    '',
    '',
    '',
    totalTime,
    '',
    '',
    '',
    '',
    '',
    'إجمالي تكلفة الخامات:',
    Number(totalRawCost.toFixed(2)),
    '',
    '',
    '',
    ''
  ]);

  // 4. قسم التوجيهات والتوقيعات للاعتماد
  rows.push([]);
  rows.push([
    'توجيهات جلسة المراجعة:',
    '1) مراجعة الكميات المعيارية لكل وحدة إنتاج مطروحة.',
    '2) تدقيق نسب الهدر الطبيعي والانكماش بالطهي أو التصنيع.',
    '3) اعتماد التعديلات وتوقيع الشيت لتحديث البرنامج بموجبها.'
  ]);
  rows.push([]);
  rows.push([
    'توقيع مسؤول التصنيع / مدير الإنتاج: .......................................',
    '',
    '',
    '',
    'توقيع مدير التكاليف والمخازن: .......................................',
    '',
    '',
    '',
    `تاريخ الاعتماد: ..... / ..... / ${new Date().getFullYear()} م`
  ]);

  // إنشاء الشيت والمصنف
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!views'] = [{ rightToLeft: true }];
  ws['!cols'] = calculateColumnWidths(rows);

  const wb = XLSX.utils.book_new();
  const safeSheetName = (product.name || 'بطاقة_الصنف').slice(0, 30).replace(/[:\\\/\?\*\[\]]/g, '_');
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName);

  const dateStr = new Date().toISOString().split('T')[0];
  const safeFileName = `مراجعة_مقادير_${product.name.replace(/[\s\/\\?%*:|"<>]/g, '_')}_${dateStr}.xlsx`;
  XLSX.writeFile(wb, safeFileName);
}

/**
 * 2. تصدير الشيت الشامل لكافة الأصناف (التامة والوسيطة) وقوائم موادها (Master BOM Review Book)
 */
export function exportMasterBOMToExcel({
  organizationName = 'مصنع الإنتاج',
  allProducts,
  productOptions,
  routingsData,
  bomsData
}: ExportMasterBOMParams) {
  const wb = XLSX.utils.book_new();
  const dateStr = new Date().toISOString().split('T')[0];

  // تجميع المسارات بحسب product_id
  const routingsByProductId = new Map<string, any>();
  (routingsData || []).forEach(r => {
    // إذا لم يكن هناك مسار مسجل أو كان هذا هو الافتراضي
    if (!routingsByProductId.has(r.product_id) || r.is_default) {
      routingsByProductId.set(r.product_id, r);
    }
  });

  // تجميع الـ bill_of_materials بحسب product_id كبديل أو مساند
  const bomsByProductId = new Map<string, any[]>();
  (bomsData || []).forEach(b => {
    const list = bomsByProductId.get(b.product_id) || [];
    list.push(b);
    bomsByProductId.set(b.product_id, list);
  });

  // مصفوفات السجلات التفصيلية
  const masterRows: any[][] = [];
  const intermediateRows: any[][] = [];
  const finishedRows: any[][] = [];
  const summaryRows: any[][] = [];

  // أعمدة الشيتات التفصيلية
  const detailedHeaders = [
    'م',
    'نوع الصنف',
    'كود الصنف (SKU)',
    'اسم الصنف المصنع / الوسيط',
    'وحدة الصنف',
    'رقم المرحلة',
    'اسم المرحلة / العملية',
    'مركز العمل',
    'الوقت المعياري (د)',
    'كود المكون',
    'اسم المادة الخام / المكون',
    'تصنيف المكون',
    'الكمية المسجلة بالبرنامج',
    'وحدة المكون',
    'تكلفة الوحدة',
    'إجمالي تكلفة المكون بالوصفة',
    'الكمية بعد مراجعة مسؤول التصنيع',
    'نسبة الهدر المسموح به %',
    'ملاحظات مسؤول التشغيل والتصنيع',
    'حالة الاعتماد'
  ];

  masterRows.push(detailedHeaders);
  intermediateRows.push(detailedHeaders);
  finishedRows.push(detailedHeaders);

  // أعمدة شيت الملخص
  summaryRows.push([
    'م',
    'نوع الصنف',
    'كود الصنف (SKU)',
    'اسم الصنف',
    'وحدة القياس',
    'عدد المراحل الإنتاجية',
    'عدد المكونات والخامات',
    'إجمالي تكلفة المواد المباشرة',
    'تكلفة أجور العمالة',
    'المصاريف غير المباشرة',
    'إجمالي التكلفة المعيارية للوحدة',
    'سعر البيع الحالي',
    'هامش المساهمة المتوقع (ج.م)',
    'نسبة هامش الربح %',
    'اكتمال الوصفة في النظام',
    'توقيع الاعتماد النهائي'
  ]);

  let masterSerial = 1;
  let intermediateSerial = 1;
  let finishedSerial = 1;
  let summarySerial = 1;

  // المرور على كافة الأصناف المستهدفة (التامة والوسيطة)
  productOptions.forEach(opt => {
    const prod = allProducts.find(p => p.id === opt.id);
    if (!prod) return;

    const isIntermediate = opt.isIntermediate;
    const prodTypeBadge = isIntermediate ? '🍰 منتج وسيط / نصف مصنع' : '🎂 منتج تام مصنع';
    const routing = routingsByProductId.get(prod.id);
    const directBOM = bomsByProductId.get(prod.id) || [];

    let totalProdCost = 0;
    let stepCount = 0;
    let materialCount = 0;

    const currentProductItemRows: any[][] = [];

    if (routing && routing.mfg_routing_steps && routing.mfg_routing_steps.length > 0) {
      stepCount = routing.mfg_routing_steps.length;

      routing.mfg_routing_steps.forEach((step: any) => {
        const materials = step.mfg_step_materials || [];
        if (materials.length > 0) {
          materials.forEach((mat: any) => {
            materialCount++;
            const rawProd = allProducts.find(p => p.id === mat.raw_material_id) || mat.products;
            const unitCost = Number(rawProd?.cost || rawProd?.purchase_price || 0);
            const qty = Number(mat.quantity_required || 0);
            const lineCost = Number((unitCost * qty).toFixed(2));
            totalProdCost += lineCost;

            const rowData = [
              0, // سيتم تعبئة المسلسل لاحقاً
              prodTypeBadge,
              prod.sku || prod.code || '-',
              prod.name,
              prod.unit || 'وحدة',
              step.step_order || 1,
              step.operation_name || 'عملية إنتاجية',
              step.mfg_work_centers?.name || 'مركز عام',
              Number(step.standard_time_minutes || 0),
              rawProd?.sku || rawProd?.code || '-',
              rawProd?.name || 'مكون غير مسمى',
              getMaterialBadge(rawProd),
              qty,
              rawProd?.unit || 'وحدة',
              unitCost,
              lineCost,
              '', // الكمية المعدلة
              '', // نسبة الهدر
              '', // ملاحظات
              'قيد المراجعة'
            ];
            currentProductItemRows.push(rowData);
          });
        }
      });
    } else if (directBOM.length > 0) {
      // توجد مواد مباشرة في bill_of_materials
      stepCount = 1;
      directBOM.forEach((mat: any) => {
        materialCount++;
        const rawProd = allProducts.find(p => p.id === mat.raw_material_id);
        const unitCost = Number(rawProd?.cost || rawProd?.purchase_price || 0);
        const qty = Number(mat.quantity_required || 0);
        const lineCost = Number((unitCost * qty).toFixed(2));
        totalProdCost += lineCost;

        const rowData = [
          0,
          prodTypeBadge,
          prod.sku || prod.code || '-',
          prod.name,
          prod.unit || 'وحدة',
          1,
          'إنتاج مباشر / قائمة المواد المباشرة',
          'صالة التشغيل الرئيسية',
          0,
          rawProd?.sku || rawProd?.code || '-',
          rawProd?.name || 'مكون غير مسمى',
          getMaterialBadge(rawProd),
          qty,
          rawProd?.unit || 'وحدة',
          unitCost,
          lineCost,
          '',
          '',
          '',
          'قيد المراجعة'
        ];
        currentProductItemRows.push(rowData);
      });
    }

    // إضافة الصفوف إلى الشيت الشامل والشيت المخصص (وسيط / تام)
    currentProductItemRows.forEach(row => {
      // للشيت الشامل
      const masterRow = [...row];
      masterRow[0] = masterSerial++;
      masterRows.push(masterRow);

      if (isIntermediate) {
        const intRow = [...row];
        intRow[0] = intermediateSerial++;
        intermediateRows.push(intRow);
      } else {
        const finRow = [...row];
        finRow[0] = finishedSerial++;
        finishedRows.push(finRow);
      }
    });

    // ملخص الصنف في شيت الملخص
    const laborCost = Number(prod.labor_cost || 0);
    let overheadCost = Number(prod.overhead_cost || 0);
    if (prod.is_overhead_percentage) {
      overheadCost = (totalProdCost + laborCost) * (overheadCost / 100);
    }
    const fullStandardCost = totalProdCost + laborCost + overheadCost;
    const salesPrice = Number(prod.sales_price || prod.selling_price || 0);
    const margin = salesPrice > 0 ? salesPrice - fullStandardCost : 0;
    const marginPct = salesPrice > 0 ? Number(((margin / salesPrice) * 100).toFixed(1)) : 0;

    summaryRows.push([
      summarySerial++,
      prodTypeBadge,
      prod.sku || prod.code || '-',
      prod.name,
      prod.unit || 'وحدة',
      stepCount,
      materialCount,
      Number(totalProdCost.toFixed(2)),
      Number(laborCost.toFixed(2)),
      Number(overheadCost.toFixed(2)),
      Number(fullStandardCost.toFixed(2)),
      salesPrice,
      Number(margin.toFixed(2)),
      `${marginPct}%`,
      materialCount > 0 ? '✅ مكتملة ومسجلة' : '⚠️ غير مكتملة (بدون مقادير)',
      ''
    ]);
  });

  // إنشاء الأوراق وإضافتها للمصنف
  // 1. الشيت الشامل
  const wsMaster = XLSX.utils.aoa_to_sheet(masterRows);
  wsMaster['!views'] = [{ rightToLeft: true }];
  wsMaster['!cols'] = calculateColumnWidths(masterRows);
  XLSX.utils.book_append_sheet(wb, wsMaster, 'قائمة المقادير الشاملة');

  // 2. شيت الأصناف الوسيطة
  const wsIntermediate = XLSX.utils.aoa_to_sheet(intermediateRows);
  wsIntermediate['!views'] = [{ rightToLeft: true }];
  wsIntermediate['!cols'] = calculateColumnWidths(intermediateRows);
  XLSX.utils.book_append_sheet(wb, wsIntermediate, 'الأصناف الوسيطة ونصف المصنعة');

  // 3. شيت المنتجات التامة
  const wsFinished = XLSX.utils.aoa_to_sheet(finishedRows);
  wsFinished['!views'] = [{ rightToLeft: true }];
  wsFinished['!cols'] = calculateColumnWidths(finishedRows);
  XLSX.utils.book_append_sheet(wb, wsFinished, 'المنتجات التامة المصنعة');

  // 4. شيت ملخص التكاليف والوصفات
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!views'] = [{ rightToLeft: true }];
  wsSummary['!cols'] = calculateColumnWidths(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'ملخص تكاليف الوصفات');

  // كتابة وتنزيل الملف
  const fileName = `شيت_المراجعة_الشامل_لقوائم_المواد_والتصنيع_${dateStr}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

/**
 * -------------------------------------------------------------
 * 3. استيراد وتحديث المقادير من ملف Excel بعد مراجعتها واعتمادها
 * -------------------------------------------------------------
 */

export interface ParsedBOMRow {
  rowNum: number;
  productName: string;
  productSku?: string;
  productId?: string;
  materialName: string;
  materialSku?: string;
  materialId?: string;
  stepOrder: number;
  stepName: string;
  oldQty: number;
  newQty: number;
  isModified: boolean;
  status: 'valid' | 'product_not_found' | 'material_not_found' | 'invalid_qty';
  statusMessage?: string;
}

export interface ParseBOMResult {
  sheetName: string;
  availableSheets: string[];
  rows: ParsedBOMRow[];
  totalRows: number;
  validRows: number;
  modifiedRows: number;
  unmatchedProducts: string[];
  unmatchedMaterials: string[];
}

/**
 * دالة قراءة وتحليل ملف Excel المستورد واستخراج تعديلات المقادير
 */
export async function parseBOMExcelFile(
  file: File,
  allProducts: any[],
  targetSheetName?: string
): Promise<ParseBOMResult> {
  let buffer: any;
  if (file && typeof (file as any).arrayBuffer === 'function') {
    buffer = await (file as any).arrayBuffer();
  } else if (typeof FileReader !== 'undefined' && file instanceof Blob) {
    buffer = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  } else {
    buffer = file;
  }
  const wb = XLSX.read(buffer, { type: 'array' });
  const availableSheets = wb.SheetNames;

  let selectedSheet = targetSheetName || availableSheets[0];
  if (!targetSheetName) {
    if (availableSheets.includes('قائمة المقادير الشاملة')) {
      selectedSheet = 'قائمة المقادير الشاملة';
    } else if (availableSheets.includes('الأصناف الوسيطة ونصف المصنعة')) {
      selectedSheet = 'الأصناف الوسيطة ونصف المصنعة';
    } else if (availableSheets.includes('المنتجات التامة المصنعة')) {
      selectedSheet = 'المنتجات التامة المصنعة';
    }
  }

  const ws = wb.Sheets[selectedSheet];
  const rawAoa = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

  // إعداد خرائط سريعة للبحث عن الأصناف بالكود أو الاسم
  const productBySku = new Map<string, any>();
  const productByName = new Map<string, any>();

  allProducts.forEach(p => {
    if (p.sku) productBySku.set(String(p.sku).trim().toLowerCase(), p);
    if (p.code) productBySku.set(String(p.code).trim().toLowerCase(), p);
    if (p.name) productByName.set(String(p.name).trim().toLowerCase(), p);
  });

  // فحص ما إذا كان الشيت مخصصاً لصنف واحد (مثل بطاقة الصنف المصدرة)
  let sheetDefaultProduct: any = null;
  for (let r = 0; r < Math.min(rawAoa.length, 5); r++) {
    const row = rawAoa[r] || [];
    const nameLabelIdx = row.findIndex((cell: any) => String(cell || '').trim() === 'اسم الصنف:');
    if (nameLabelIdx !== -1 && row[nameLabelIdx + 1]) {
      const pName = String(row[nameLabelIdx + 1]).trim();
      sheetDefaultProduct = productByName.get(pName.toLowerCase());
      if (!sheetDefaultProduct) {
        const skuLabelIdx = row.findIndex((cell: any) => String(cell || '').includes('كود الصنف'));
        if (skuLabelIdx !== -1 && row[skuLabelIdx + 1]) {
          const pSku = String(row[skuLabelIdx + 1]).trim().toLowerCase();
          sheetDefaultProduct = productBySku.get(pSku);
        }
      }
      break;
    }
  }

  // البحث عن سطر الترويسة الذي يحتوي على مسميات الأعمدة
  let headerRowIdx = -1;
  for (let r = 0; r < Math.min(rawAoa.length, 10); r++) {
    const row = (rawAoa[r] || []).map((c: any) => String(c || '').trim().toLowerCase());
    if (row.some(c => c.includes('مكون') || c.includes('مادة خام') || c.includes('خامات') || c.includes('المكونات'))) {
      headerRowIdx = r;
      break;
    }
  }

  if (headerRowIdx === -1) {
    headerRowIdx = 0;
  }

  const headerRow = (rawAoa[headerRowIdx] || []).map((c: any) => String(c || '').trim().toLowerCase());

  const findCol = (terms: string[]) => {
    return headerRow.findIndex(h => terms.some(term => h.includes(term.toLowerCase())));
  };

  const prodSkuCol = findCol(['كود الصنف (sku)', 'كود الصنف', 'كود الوجبة (sku)', 'كود الوجبة', 'كود المنتج']);
  const prodNameCol = findCol(['اسم الصنف المصنع / الوسيط', 'اسم الصنف', 'اسم المنتج', 'اسم الوجبة']);
  const stepOrderCol = findCol(['رقم المرحلة']);
  const stepNameCol = findCol(['اسم المرحلة / العملية الإنتاجية', 'اسم المرحلة / العملية', 'اسم المرحلة', 'العملية الإنتاجية', 'العملية']);
  const matSkuCol = findCol(['كود المكون (sku)', 'كود المكون', 'كود الخامة']);
  
  let matNameCol = findCol(['اسم المادة الخام / المكون', 'اسم المادة الخام', 'اسم المكون', 'المكونات', 'المكون']);
  if (matNameCol === -1) {
    const secondNameCol = headerRow.lastIndexOf('اسم الصنف');
    if (secondNameCol > prodNameCol) matNameCol = secondNameCol;
  }

  const oldQtyCol = findCol(['الكمية المسجلة بالبرنامج', 'الكمية المسجلة', 'الكمية المعيارية', 'الكمية المطلوبة', 'الكمية']);
  const reviewedQtyCol = findCol(['الكمية بعد مراجعة مسؤول التصنيع', 'الكمية الفعلية المقترحة', 'الكمية المقترحة', 'الكمية الفعلية', 'الكمية المعدلة']);

  const parsedRows: ParsedBOMRow[] = [];
  const unmatchedProductsSet = new Set<string>();
  const unmatchedMaterialsSet = new Set<string>();

  for (let r = headerRowIdx + 1; r < rawAoa.length; r++) {
    const row = rawAoa[r] || [];
    if (!row || row.length === 0 || row.every((c: any) => c === null || c === undefined || c === '')) {
      continue;
    }

    const firstCell = String(row[0] || '').trim();
    if (firstCell.includes('الإجمالي') || firstCell.includes('توقيع') || firstCell.includes('توجيهات') || firstCell.includes('المؤسسة')) {
      continue;
    }

    // 1. تحديد المنتج الرئيسي
    let pSku = prodSkuCol !== -1 ? String(row[prodSkuCol] || '').trim() : '';
    let pName = prodNameCol !== -1 ? String(row[prodNameCol] || '').trim() : '';

    let matchedProduct: any = sheetDefaultProduct;
    if (pSku && pSku !== '-') {
      matchedProduct = productBySku.get(pSku.toLowerCase()) || matchedProduct;
    }
    if (!matchedProduct && pName && pName !== '-') {
      const cleanProdName = pName.replace(/\[.*?\]/g, '').trim().toLowerCase();
      matchedProduct = productByName.get(cleanProdName) || productByName.get(pName.toLowerCase()) || matchedProduct;
    }

    // 2. تحديد الخامة / المكون
    let mSku = matSkuCol !== -1 ? String(row[matSkuCol] || '').trim() : '';
    let mName = matNameCol !== -1 ? String(row[matNameCol] || '').trim() : '';

    if (!mName && !mSku) continue;

    if (mName.includes('لا توجد مقادير') || mName.includes('بدون مواد خام')) {
      continue;
    }

    let matchedMaterial: any = null;
    if (mSku && mSku !== '-') {
      matchedMaterial = productBySku.get(mSku.toLowerCase());
    }
    if (!matchedMaterial && mName && mName !== '-') {
      const cleanMatName = mName.replace(/\[.*?\]/g, '').trim().toLowerCase();
      matchedMaterial = productByName.get(cleanMatName) || productByName.get(mName.toLowerCase());
    }

    // 3. تحديد الكميات وفروقات التعديل
    const oldQtyVal = oldQtyCol !== -1 ? parseFloat(row[oldQtyCol]) : 0;
    const reviewedQtyVal = reviewedQtyCol !== -1 ? parseFloat(row[reviewedQtyCol]) : NaN;

    const oldQty = isNaN(oldQtyVal) ? 0 : Number(oldQtyVal);
    let newQty = oldQty;
    let isModified = false;

    // إذا قام مسؤول التصنيع بكتابة رقم في خانة "الكمية المقترحة"
    if (!isNaN(reviewedQtyVal) && reviewedQtyVal > 0) {
      newQty = Number(reviewedQtyVal);
      isModified = Math.abs(newQty - oldQty) > 0.00001;
    } else {
      // أو إذا تم تعديل رقم "الكمية المسجلة" مباشرة في الإكسيل
      newQty = oldQty;
      isModified = false;
    }

    // 4. المرحلة والعملية
    const sOrder = stepOrderCol !== -1 ? parseInt(row[stepOrderCol], 10) || 1 : 1;
    const sName = stepNameCol !== -1 ? String(row[stepNameCol] || '').trim() || `مرحلة ${sOrder}` : `مرحلة ${sOrder}`;

    // 5. تقييم الحالة
    let status: ParsedBOMRow['status'] = 'valid';
    let statusMessage = isModified ? 'تعديل كمية معتمدة 🔄' : 'مطابق للبرنامج ✅';

    if (!matchedProduct) {
      status = 'product_not_found';
      statusMessage = `المنتج غير موجود في النظام (${pName || pSku || 'غير محدد'})`;
      unmatchedProductsSet.add(pName || pSku || 'منتج غير محدد');
    } else if (!matchedMaterial) {
      status = 'material_not_found';
      statusMessage = `المكون أو الخامة غير موجودة في النظام (${mName || mSku})`;
      unmatchedMaterialsSet.add(mName || mSku);
    } else if (newQty <= 0) {
      status = 'invalid_qty';
      statusMessage = 'الكمية يجب أن تكون أكبر من صفر';
    }

    parsedRows.push({
      rowNum: r + 1,
      productName: matchedProduct?.name || pName || 'صنف غير معرف',
      productSku: matchedProduct?.sku || pSku || undefined,
      productId: matchedProduct?.id,
      materialName: matchedMaterial?.name || mName,
      materialSku: matchedMaterial?.sku || mSku || undefined,
      materialId: matchedMaterial?.id,
      stepOrder: sOrder,
      stepName: sName,
      oldQty,
      newQty,
      isModified,
      status,
      statusMessage
    });
  }

  const validRows = parsedRows.filter(r => r.status === 'valid').length;
  const modifiedRows = parsedRows.filter(r => r.status === 'valid' && r.isModified).length;

  return {
    sheetName: selectedSheet,
    availableSheets,
    rows: parsedRows,
    totalRows: parsedRows.length,
    validRows,
    modifiedRows,
    unmatchedProducts: Array.from(unmatchedProductsSet),
    unmatchedMaterials: Array.from(unmatchedMaterialsSet)
  };
}

/**
 * دالة تطبيق التعديلات المعتمدة في قاعدة البيانات ومزامنة bill_of_materials والتكاليف
 */
export async function applyBOMImportUpdates(
  validRows: ParsedBOMRow[],
  orgId: string,
  allProducts: any[]
): Promise<{ success: boolean; updatedProductsCount: number; updatedMaterialsCount: number; message: string }> {
  if (!validRows || validRows.length === 0) {
    throw new Error('لا توجد سجلات صالحة للتطبيق.');
  }

  // تجميع السجلات حسب الصنف الرئيسي (product_id)
  const rowsByProductId = new Map<string, ParsedBOMRow[]>();
  validRows.forEach(r => {
    if (!r.productId || !r.materialId) return;
    const list = rowsByProductId.get(r.productId) || [];
    list.push(r);
    rowsByProductId.set(r.productId, list);
  });

  let updatedMaterialsCount = 0;

  for (const [productId, productRows] of rowsByProductId.entries()) {
    // 1. جلب أو إنشاء المسار الافتراضي
    let { data: routing, error: rErr } = await supabase
      .from('mfg_routings')
      .select('id, name')
      .eq('product_id', productId)
      .eq('organization_id', orgId)
      .eq('is_default', true)
      .maybeSingle();

    if (!routing) {
      const prod = allProducts.find(p => p.id === productId);
      const { data: newR, error: newRErr } = await supabase
        .from('mfg_routings')
        .insert({
          product_id: productId,
          name: `مسار تصنيع ${prod?.name || ''}`,
          organization_id: orgId,
          is_default: true
        })
        .select('id, name')
        .single();
      if (newRErr) throw newRErr;
      routing = newR;
    }

    // 2. تجميع الخامات بحسب رقم المرحلة
    const rowsByStep = new Map<number, ParsedBOMRow[]>();
    productRows.forEach(r => {
      const list = rowsByStep.get(r.stepOrder) || [];
      list.push(r);
      rowsByStep.set(r.stepOrder, list);
    });

    for (const [stepOrder, stepRows] of rowsByStep.entries()) {
      let { data: step } = await supabase
        .from('mfg_routing_steps')
        .select('id')
        .eq('routing_id', routing.id)
        .eq('step_order', stepOrder)
        .maybeSingle();

      if (!step) {
        const stepName = stepRows[0]?.stepName || `مرحلة ${stepOrder}`;
        const { data: newStep, error: newSErr } = await supabase
          .from('mfg_routing_steps')
          .insert({
            routing_id: routing.id,
            step_order: stepOrder,
            operation_name: stepName,
            standard_time_minutes: 0,
            organization_id: orgId
          })
          .select('id')
          .single();
        if (newSErr) throw newSErr;
        step = newStep;
      }

      // تحديث أو إضافة المواد في هذه المرحلة
      for (const row of stepRows) {
        const preciseQty = Number(row.newQty.toFixed(4));
        const { data: existingMat } = await supabase
          .from('mfg_step_materials')
          .select('id')
          .eq('step_id', step.id)
          .eq('raw_material_id', row.materialId)
          .maybeSingle();

        if (existingMat) {
          await supabase
            .from('mfg_step_materials')
            .update({ quantity_required: preciseQty })
            .eq('id', existingMat.id);
        } else {
          await supabase
            .from('mfg_step_materials')
            .insert({
              step_id: step.id,
              raw_material_id: row.materialId,
              quantity_required: preciseQty,
              organization_id: orgId
            });
        }
        updatedMaterialsCount++;
      }
    }

    // 3. مزامنة شجرة المواد الإجمالية bill_of_materials وإعادة احتساب تكلفة الصنف
    const { data: allStepsWithMaterials } = await supabase
      .from('mfg_routing_steps')
      .select(`
        id,
        mfg_step_materials (
          raw_material_id,
          quantity_required
        )
      `)
      .eq('routing_id', routing.id);

    const aggregated = new Map<string, number>();
    (allStepsWithMaterials || []).forEach((st: any) => {
      (st.mfg_step_materials || []).forEach((sm: any) => {
        const prev = aggregated.get(sm.raw_material_id) || 0;
        aggregated.set(sm.raw_material_id, prev + Number(sm.quantity_required || 0));
      });
    });

    await supabase.from('bill_of_materials').delete().eq('product_id', productId);
    if (aggregated.size > 0) {
      const toInsert = Array.from(aggregated.entries()).map(([rawId, qty]) => ({
        product_id: productId,
        raw_material_id: rawId,
        quantity_required: Number(qty.toFixed(4)),
        organization_id: orgId
      }));
      await supabase.from('bill_of_materials').insert(toInsert);
    }

    // إعادة احتساب التكلفة المعيارية
    let rawCost = 0;
    aggregated.forEach((qty, rawId) => {
      const rawProd = allProducts.find(p => p.id === rawId);
      const unitCost = Number(rawProd?.cost || rawProd?.purchase_price || 0);
      rawCost += unitCost * qty;
    });

    const { data: prodData } = await supabase
      .from('products')
      .select('labor_cost, overhead_cost, is_overhead_percentage')
      .eq('id', productId)
      .single();

    let totalCost = rawCost;
    if (prodData) {
      const labor = Number(prodData.labor_cost) || 0;
      let overhead = Number(prodData.overhead_cost) || 0;
      if (prodData.is_overhead_percentage) {
        overhead = (rawCost + labor) * (overhead / 100);
      }
      totalCost = rawCost + labor + overhead;
    }

    await supabase
      .from('products')
      .update({
        cost: Number(totalCost.toFixed(4)),
        updated_at: new Date().toISOString()
      })
      .eq('id', productId);
  }

  return {
    success: true,
    updatedProductsCount: rowsByProductId.size,
    updatedMaterialsCount,
    message: `تم تحديث مقادير ${rowsByProductId.size} صنف بنجاح، وتعديل كميات ${updatedMaterialsCount} مادة خام ومزامنة التكاليف تلقائياً.`
  };
}
