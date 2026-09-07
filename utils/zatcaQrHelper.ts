/**
 * ==============================================================================
 * ZATCA & Tax E-Invoice QR Code TLV Encoder
 * TriPro ERP — utils/zatcaQrHelper.ts
 * ==============================================================================
 * يقوم بتشفير بيانات الفاتورة الضريبية وفق معيار TLV (Tag-Length-Value) Base64
 * المعتمد من هيئة الزكاة والضريبة والجمارك (ZATCA Phase 1 & 2) ومصلحة الضرائب.
 */

export interface ZatcaQrData {
  sellerName: string;
  taxNumber: string;
  invoiceDate: string; // ISO 8601 or YYYY-MM-DDTHH:mm:ss
  totalAmount: number;
  taxAmount: number;
}

/**
 * دالة تحويل النص إلى مصفوفة بايتات بترميز UTF-8
 */
function toUtf8Bytes(str: string): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(str);
}

/**
 * دالة إنشاء جزء TLV (Tag, Length, Value)
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
 * دالة دمج مصفوفات البايتات
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
 * توليد كود ZATCA Base64 الرسمي
 */
export function generateZatcaTlvQrString(data: ZatcaQrData): string {
  try {
    const formattedDate = data.invoiceDate.includes('T')
      ? data.invoiceDate
      : `${data.invoiceDate}T12:00:00Z`;

    const tag1 = createTlvTag(1, data.sellerName || 'المنشأة');
    const tag2 = createTlvTag(2, data.taxNumber || '300000000000003');
    const tag3 = createTlvTag(3, formattedDate);
    const tag4 = createTlvTag(4, (Number(data.totalAmount) || 0).toFixed(2));
    const tag5 = createTlvTag(5, (Number(data.taxAmount) || 0).toFixed(2));

    const combinedBytes = concatUint8Arrays([tag1, tag2, tag3, tag4, tag5]);

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
