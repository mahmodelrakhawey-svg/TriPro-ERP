/**
 * البيانات المستخرجة من تحليل باركود GS1 أو كود Matrix ثنائي الأبعاد
 */
export interface ParsedGS1Data {
  /** هل تم التعرف على الكود كمعيار GS1 صحيح */
  isGS1: boolean;
  /** كود التعريف التجاري العالمي المكون من 14 رقماً (AI 01) */
  gtin?: string;
  /** قائمة الأكواد المرشحة للمطابقة مع دليل الأصناف (GTIN-14, GTIN-13/EAN-13 بدون الصفر الأولي، إلخ) */
  candidateCodes: string[];
  /** تاريخ انتهاء الصلاحية المحول بصيغة YYYY-MM-DD */
  expiryDate?: string;
  /** تاريخ انتهاء الصلاحية الخام بصيغة YYMMDD كما ورد في الماسح */
  expiryDateRaw?: string;
  /** رقم التشغيلة أو الوجبة الدوائية/الإنتاجية (Batch / Lot Number - AI 10) */
  batchNumber?: string;
  /** الرقم التسلسلي الفريد للوحدة (Serial Number - AI 21) */
  serialNumber?: string;
  /** تاريخ الإنتاج المحول بصيغة YYYY-MM-DD (AI 11) */
  productionDate?: string;
  /** النص المدخل الأصلي كما تم قراءته من الماسح الضوئي */
  rawInput: string;
}

/**
 * تحويل تاريخ GS1 المكون من 6 أرقام (YYMMDD) إلى صيغة التقويم القياسية YYYY-MM-DD
 * يراعي معيار GS1 الدولي:
 * - الأرقام 00 لليوم تعني افتراضياً اليوم الأخير من ذلك الشهر (Last Day of Month)
 * - القرن الافتراضي هو القرن الحادي والعشرون (2000 - 2099)
 *
 * @param yymmdd السلسلة الرقمية المكونة من 6 أرقام
 * @returns التاريخ المحول بصيغة YYYY-MM-DD أو undefined إذا كان التنسيق غير صالح
 *
 * @example
 * ```ts
 * formatGS1Date('261231'); // '2026-12-31'
 * formatGS1Date('260200'); // '2026-02-28' (اليوم الأخير لشهر فبراير)
 * ```
 */
export function formatGS1Date(yymmdd: string): string | undefined {
  if (!yymmdd || yymmdd.length !== 6 || !/^\d{6}$/.test(yymmdd)) {
    return undefined;
  }

  const yy = parseInt(yymmdd.substring(0, 2), 10);
  const mm = parseInt(yymmdd.substring(2, 4), 10);
  let dd = parseInt(yymmdd.substring(4, 6), 10);

  if (mm < 1 || mm > 12) return undefined;

  // افتراض القرن: من 2000 إلى 2099
  const year = 2000 + yy;

  // إذا كان اليوم 00، فهذا يعني نهاية الشهر حسب مواصفات GS1
  if (dd === 0) {
    // اليوم الأخير من الشهر
    const lastDayOfMonth = new Date(year, mm, 0).getDate();
    dd = lastDayOfMonth;
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(mm)}-${pad(dd)}`;
}

/**
 * إزالة بادئات ماسحات الباركود القياسية (AIM Symbology Identifiers)
 * مثل:
 * - `]d2` لكود GS1 DataMatrix المستخدم في الأدوية
 * - `]C1` لكود GS1-128
 * - `]e0` لكود GS1 DataBar
 *
 * @param raw النص المقروء من الماسح الضوئي
 * @returns النص بعد تجريده من بادئة AIM
 */
export function stripAimPrefix(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith(']d2') || cleaned.startsWith(']C1') || cleaned.startsWith(']e0')) {
    cleaned = cleaned.substring(3);
  } else if (cleaned.startsWith(']d1') || cleaned.startsWith(']e1')) {
    cleaned = cleaned.substring(3);
  }
  return cleaned;
}

/**
 * تحليل وتفكيك شفرات باركود ومصفوفات GS1 (GS1-128 & GS1 DataMatrix)
 * يدعم كلا التنسيقين:
 * 1. تنسيق الأقواس البشري: `(01)06221001000018(17)261231(10)LOT123`
 * 2. التنسيق الخام لماسحات 2D Barcode المحتوي على فواصل المجموعة ASCII 29 / FNC1 (`\x1d`)
 *
 * @param input النص المدخل من الماسح أو المستخدم
 * @returns كائن ParsedGS1Data المحتوي على الـ GTIN والتشغيلة وتاريخ الصلاحية وقائمة الأكواد المرشحة
 */
export function parseGS1Barcode(input: string): ParsedGS1Data {
  const result: ParsedGS1Data = {
    isGS1: false,
    candidateCodes: [],
    rawInput: input
  };

  if (!input || typeof input !== 'string') {
    return result;
  }

  let code = stripAimPrefix(input.trim());
  if (!code) return result;

  // 1. فحص صيغة الأقواس: مثل (01)06221001000018(17)261231(10)LOT123(21)SN456
  if (code.includes('(') && code.includes(')')) {
    const aiMatches = [...code.matchAll(/\((\d{2,4})\)([^()]+)/g)];
    if (aiMatches.length > 0) {
      result.isGS1 = true;
      for (const match of aiMatches) {
        const ai = match[1];
        const val = match[2].trim();

        if (ai === '01') {
          result.gtin = val;
        } else if (ai === '17') {
          result.expiryDateRaw = val;
          result.expiryDate = formatGS1Date(val);
        } else if (ai === '10') {
          result.batchNumber = val;
        } else if (ai === '21') {
          result.serialNumber = val;
        } else if (ai === '11') {
          result.productionDate = formatGS1Date(val);
        }
      }
    }
  }

  // 2. فحص الصيغة المباشرة الخام مع فواصل FNC1 / GS (\x1d أو \u001d أو _GS_) أو متسلسلة
  if (!result.isGS1) {
    // استبدال أي ترميز لفاصل المجموعة بمحرف موحد
    const GS = '\x1d';
    let normalized = code.replace(/<GS>|\x1d|\u001d/g, GS);

    // إذا بدأ الكود بـ 01 وطوله لا يقل عن 16 (01 + 14 رقم للـ GTIN)
    if (normalized.startsWith('01') && normalized.length >= 16 && /^\d{14}/.test(normalized.substring(2, 16))) {
      result.isGS1 = true;
      result.gtin = normalized.substring(2, 16);
      let remainder = normalized.substring(16);

      // تفكيك بقية معرّفات التطبيق في السلسلة
      while (remainder.length > 0) {
        // إزالة أي فواصل GS في البداية
        if (remainder.startsWith(GS)) {
          remainder = remainder.substring(1);
          continue;
        }

        // فحص AI 17 (تاريخ الصلاحية - 6 أرقام ثابتة)
        if (remainder.startsWith('17') && remainder.length >= 8 && /^\d{6}/.test(remainder.substring(2, 8))) {
          result.expiryDateRaw = remainder.substring(2, 8);
          result.expiryDate = formatGS1Date(result.expiryDateRaw);
          remainder = remainder.substring(8);
          continue;
        }

        // فحص AI 11 (تاريخ الإنتاج - 6 أرقام ثابتة)
        if (remainder.startsWith('11') && remainder.length >= 8 && /^\d{6}/.test(remainder.substring(2, 8))) {
          result.productionDate = formatGS1Date(remainder.substring(2, 8));
          remainder = remainder.substring(8);
          continue;
        }

        // فحص AI 10 (رقم التشغيلة - متغير الطول ينتهي بـ GS أو نهاية النص أو AI آخر)
        if (remainder.startsWith('10')) {
          remainder = remainder.substring(2);
          const gsIndex = remainder.indexOf(GS);
          if (gsIndex !== -1) {
            result.batchNumber = remainder.substring(0, gsIndex);
            remainder = remainder.substring(gsIndex + 1);
          } else {
            // التحقق مما إذا كان هناك AI 21 لاحق بدون GS
            const nextAi21Index = remainder.indexOf('21');
            if (nextAi21Index > 0 && nextAi21Index <= 20) {
              result.batchNumber = remainder.substring(0, nextAi21Index);
              remainder = remainder.substring(nextAi21Index);
            } else {
              result.batchNumber = remainder;
              remainder = '';
            }
          }
          continue;
        }

        // فحص AI 21 (الرقم التسلسلي - متغير الطول ينتهي بـ GS أو نهاية النص)
        if (remainder.startsWith('21')) {
          remainder = remainder.substring(2);
          const gsIndex = remainder.indexOf(GS);
          if (gsIndex !== -1) {
            result.serialNumber = remainder.substring(0, gsIndex);
            remainder = remainder.substring(gsIndex + 1);
          } else {
            result.serialNumber = remainder;
            remainder = '';
          }
          continue;
        }

        // في حال وجود معرّف غير معروف، تخطيه حتى فاصل GS القادم
        const nextGs = remainder.indexOf(GS);
        if (nextGs !== -1) {
          remainder = remainder.substring(nextGs + 1);
        } else {
          break;
        }
      }
    }
  }

  // 3. دعم باركود GTIN المباشر (14 أو 13 أو 12 رقماً نقياً بدون ملحقات)
  if (!result.isGS1 && /^\d{12,14}$/.test(code)) {
    result.isGS1 = true;
    result.gtin = code.padStart(14, '0');
  }

  // توليد قائمة الأكواد المرشحة للمطابقة في قاعدة البيانات
  if (result.gtin) {
    const rawGtin = result.gtin;
    result.candidateCodes.push(rawGtin);

    // إذا كان GTIN 14 رقم ويبدأ بـ 0، فإن الـ 13 رقم الباقية تمثل باركود EAN-13 القياسي
    if (rawGtin.length === 14 && rawGtin.startsWith('0')) {
      const ean13 = rawGtin.substring(1);
      result.candidateCodes.push(ean13);

      // إذا كان يبدأ بـ 00، فقد يكون UPC-A (12 رقم)
      if (rawGtin.startsWith('00')) {
        result.candidateCodes.push(rawGtin.substring(2));
      }
    }

    // بدون أصفار بادئة نهائياً
    const noLeadingZeros = rawGtin.replace(/^0+/, '');
    if (noLeadingZeros && !result.candidateCodes.includes(noLeadingZeros)) {
      result.candidateCodes.push(noLeadingZeros);
    }
  }

  return result;
}
