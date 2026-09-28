/**
 * ==============================================================================
 * ZATCA & Tax E-Invoice QR Code TLV Encoder
 * TriPro ERP — utils/zatcaQrHelper.ts
 * ==============================================================================
 * يقوم بتشفير بيانات الفاتورة الضريبية وفق معيار TLV (Tag-Length-Value) Base64
 * المعتمد من هيئة الزكاة والضريبة والجمارك (ZATCA Phase 1 & 2) ومصلحة الضرائب.
 *
 * هيكل العلامات (Tags Specification):
 * - Tag 1: اسم البائع أو المنشأة (Seller Name)
 * - Tag 2: الرقم الضريبي (VAT Registration Number)
 * - Tag 3: تاريخ ووقت الفاتورة بتنسيق ISO 8601 (Timestamp)
 * - Tag 4: إجمالي الفاتورة شامل الضريبة (Total Invoice Amount)
 * - Tag 5: إجمالي قيمة الضريبة (VAT Amount)
 * - Tag 6: الهاش التشفيري للفاتورة (Invoice Hash - SHA256) [المرحلة الثانية]
 * - Tag 7: الختم الرقمي المشفر (ECDSA Signature) [المرحلة الثانية]
 * - Tag 8: المفتاح العام للشهادة (ECDSA Public Key) [المرحلة الثانية]
 * ==============================================================================
 */

/**
 * بنية بيانات الفاتورة الإلكترونية لتوليد رمز الاستجابة السريع (QR Code)
 */
export interface ZatcaQrData {
  /** اسم المنشأة أو الشركة البائعة */
  sellerName: string;
  /** الرقم الضريبي المسجل للمنشأة */
  taxNumber: string;
  /** تاريخ ووقت تحرير الفاتورة (YYYY-MM-DDTHH:mm:ssZ) */
  invoiceDate: string;
  /** المبلغ الإجمالي للفاتورة شامل الضريبة */
  totalAmount: number;
  /** قيمة ضريبة القيمة المضافة المحسوبة */
  taxAmount: number;
  /** الهاش التشفيري للفاتورة XML (Tag 6 - المرحلة 2) */
  invoiceHash?: string;
  /** الختم الرقمي والتوقيع الإلكتروني للشهادة (Tag 7 - المرحلة 2) */
  cryptographicStamp?: string;
  /** المفتاح العام الرقمي للشهادة (Tag 8 - المرحلة 2) */
  publicKey?: string;
}

/**
 * دالة تحويل النص إلى مصفوفة بايتات بترميز UTF-8
 *
 * @param str النص المراد تحويله
 * @returns مصفوفة بايتات بترميز UTF-8
 */
function toUtf8Bytes(str: string): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(str);
}

/**
 * إنشاء عنصر TLV منفرد (Tag Number, Byte Length, Byte Value)
 *
 * @param tagNumber رقم العلامة (1 إلى 8)
 * @param valueStr القيمة النصية للمحتوى
 * @returns مصفوفة بايتات مهيكلة وفق معيار TLV
 */
function createTlvTag(tagNumber: number, valueStr: string): Uint8Array {
  const valueBytes = toUtf8Bytes(valueStr);
  const tagBytes = new Uint8Array(2 + valueBytes.length);
  tagBytes[0] = tagNumber;
  tagBytes[1] = valueBytes.length;
  tagBytes.set(valueBytes, 2);
  return tagBytes;
}

/**
 * دمج عدة مصفوفات بايتات في مصفوفة واحدة متصلة
 *
 * @param arrays قائمة مصفوفات البايتات
 * @returns مصفوفة بايتات موحدة مدمجة
 */
function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((acc, curr) => acc + curr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/**
 * توليد سلسلة Base64 المشفرة بمعيار TLV لرمز QR الفاتورة الإلكترونية
 * متوافق مع لوائح هيئة الزكاة والضريبة والجمارك (ZATCA) ومصلحة الضرائب المصرية.
 *
 * @param data كائن بيانات الفاتورة الضريبية
 * @returns سلسلة نصية Base64 قابلة للعرض مباشرة كرمز QR ضريبي
 *
 * @example
 * ```ts
 * const qr = generateZatcaTlvQrString({
 *   sellerName: 'شركة تري برو للبرمجيات',
 *   taxNumber: '300000000000003',
 *   invoiceDate: '2026-09-28T10:00:00Z',
 *   totalAmount: 1140.00,
 *   taxAmount: 140.00
 * });
 * ```
 */
export function generateZatcaTlvQrString(data: ZatcaQrData): string {
  try {
    const formattedDate = data.invoiceDate.includes('T')
      ? data.invoiceDate
      : `${data.invoiceDate}T12:00:00Z`;

    const tags: Uint8Array[] = [
      createTlvTag(1, data.sellerName || 'المنشأة'),
      createTlvTag(2, data.taxNumber || '300000000000003'),
      createTlvTag(3, formattedDate),
      createTlvTag(4, (Number(data.totalAmount) || 0).toFixed(2)),
      createTlvTag(5, (Number(data.taxAmount) || 0).toFixed(2))
    ];

    // إضافة حقول المرحلة الثانية من الفاتورة الإلكترونية لهيئة الزكاة والضريبة (Phase 2 Integration)
    if (data.invoiceHash) {
      tags.push(createTlvTag(6, data.invoiceHash));
    }
    if (data.cryptographicStamp) {
      tags.push(createTlvTag(7, data.cryptographicStamp));
    }
    if (data.publicKey) {
      tags.push(createTlvTag(8, data.publicKey));
    }

    const combinedBytes = concatUint8Arrays(tags);

    // تحويل البايتات إلى Base64
    let binary = '';
    for (let i = 0; i < combinedBytes.byteLength; i++) {
      binary += String.fromCharCode(combinedBytes[i]);
    }
    return window.btoa(binary);
  } catch (e) {
    console.warn('ZATCA QR Generation error:', e);
    return `Invoice:${data.sellerName}|Tax:${data.taxNumber}|Total:${data.totalAmount}`;
  }
}

