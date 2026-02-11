عنوان الملف: INVOICE_ITEMS_GUIDE.md

# دليل نظام بنود الفاتورة (Invoice Items)

## نظرة عامة
تم إضافة نظام متكامل لإدارة بنود الفاتورة (مفردات/أسطر الفاتورة) مع حسابات أوتوماتيكية للمجاميع والضرائب والخصومات.

---

## المكونات الجديدة

### 1. قاعدة البيانات
**الجدول**: `invoice_items`
- `id` (UUID): معرّف البند الفريد
- `invoice_id` (UUID): معرّف الفاتورة الأب
- `line_no` (Integer): رقم السطر (ترتيب البند)
- `description` (Text): وصف البند
- `quantity` (Numeric): الكمية
- `unit_price` (Numeric): السعر الفردي
- `discount` (Numeric): الخصم على البند
- `tax_rate` (Numeric): نسبة الضريبة %
- `custom_fields` (JSONB): حقول مخصصة إضافية
- `created_by` (UUID): معرّف المستخدم الذي أضاف البند
- `created_at`, `updated_at`: timestamps

**الفهارس**:
- `idx_invoice_items_invoice_id`: للبحث السريع حسب invoice_id
- `idx_invoice_items_created_by`: للبحث حسب المستخدم الذي أضاف
- `idx_invoice_items_custom_fields_gin`: للبحث في الحقول المخصصة

**التريجرات**:
- `set_updated_at_invoice_items`: تحديث timestamp updated_at تلقائياً عند أي تعديل
- `trg_stock_sales`: تحديث المخزون تلقائياً عند إضافة/حذف/تعديل بند

---

## الدوال في `services/invoiceItems.ts`

### الدوال الأساسية
```typescript
// 1. إضافة بند جديد
addInvoiceItem(invoiceId: string, item: InvoiceItemInput)
// الإدخال يتضمن: description, quantity, unit_price, discount, tax_rate, custom_fields, created_by

// 2. الحصول على بنود فاتورة
getInvoiceItems(invoiceId: string)
// يرجع مصفوفة بجميع البنود مرتبة حسب line_no

// 3. تحديث بند
updateInvoiceItem(id: string, changes: Partial<InvoiceItemInput>)
// تحديث حقول معينة فقط دون الحاجة لإرسال الجميع

// 4. حذف بند
deleteInvoiceItem(id: string)
```

### الدوال المتقدمة
```typescript
// 1. الحصول على البنود مع حسابات الإجماليات
getInvoiceItemsWithTotals(invoiceId: string): Promise<InvoiceItemWithTotals[]>
// يرجع كل بند مع حسابه:
//   - line_total: (quantity * unit_price) - discount
//   - tax_amount: line_total * (tax_rate / 100)

// 2. حساب مجموع الفاتورة كاملة
calculateInvoiceTotals(invoiceId: string)
// يرجع:
//   - subtotal: مجموع الأسعار قبل الخصم والضريبة
//   - totalDiscount: مجموع الخصومات
//   - totalTax: مجموع الضرائب
//   - grandTotal: الإجمالي النهائي
//   - itemCount: عدد البنود

// 3. تحديث عدة بنود دفعة واحدة
bulkUpdateInvoiceItems(updates: Array<{ id: string; changes: Partial<InvoiceItemInput> }>)

// 4. حذف عدة بنود دفعة واحدة
bulkDeleteInvoiceItems(ids: string[])
```

---

## مكون React: `InvoiceItemsList`

### خصائص المكون
```typescript
interface InvoiceItemsListProps {
  invoiceId: string;           // معرّف الفاتورة (مطلوب)
  readOnly?: boolean;           // وضع القراءة فقط (اختياري)
  onItemsChange?: (items: InvoiceItemWithTotals[]) => void; // callback عند التغيير
}
```

### الاستخدام
```typescript
import InvoiceItemsList from './components/InvoiceItemsList';

// في مكون الفاتورة الرئيسي:
<InvoiceItemsList 
  invoiceId="invoice-uuid-here"
  onItemsChange={(items) => console.log('البنود تغيرت:', items)}
/>
```

### الميزات
- ✅ عرض جدول تفاعلي للبنود
- ✅ إضافة بند جديد
- ✅ تعديل بند موجود (inline editing)
- ✅ حذف بند مع تأكيد
- ✅ حساب تلقائي للمجاميع (subtotal, discount, tax, total)
- ✅ دعم الاتجاه RTL (عربي/يميني)
- ✅ معالجة الأخطاء والتحميل
- ✅ وضع "read-only" لعرض البنود بدون تحرير

---

## استعلامات SQL مفيدة

### ملف SQL: `services/invoice_items_queries.sql`

1. **حساب المجاميع حسب الفاتورة**
   ```sql
   SELECT invoice_id, COUNT(*), SUM(quantity), ...
   FROM invoice_items
   GROUP BY invoice_id;
   ```

2. **ربط الفواتير مع البنود والمجاميع**
   ```sql
   SELECT si.*, 
     COUNT(ii.id) as item_count,
     SUM(ii.quantity * ii.unit_price - ii.discount + ...) as total
   FROM invoices si
   LEFT JOIN invoice_items ii ON si.id = ii.invoice_id
   GROUP BY si.id;
   ```

3. **فحص التوافق بين المبلغ المسجل والمحسوب**
   ```sql
   -- للتحقق من عدم التطابق والأخطاء
   ```

4. **إحصائيات عادة عن البنود والفواتير**

---

## خطوات التكامل مع الواجهة الموجودة

### 1. في صفحة عرض/تحرير الفاتورة (مثل `Dashboard.tsx`)
```typescript
import InvoiceItemsList from './InvoiceItemsList';
import { calculateInvoiceTotals } from '../services/invoiceItems';

export function InvoiceForm() {
  const [invoiceId] = useState('...');
  const [totals, setTotals] = useState(null);

  const handleItemsChange = async (items) => {
    const newTotals = await calculateInvoiceTotals(invoiceId);
    setTotals(newTotals);
    // تحديث الفاتورة الأم بالمجاميع الجديدة إذا رغبت
  };

  return (
    <div>
      <h2>بيانات الفاتورة</h2>
      {/* بيانات الفاتورة العامة */}
      
      <h3>بنود الفاتورة</h3>
      <InvoiceItemsList 
        invoiceId={invoiceId}
        onItemsChange={handleItemsChange}
      />
      
      {totals && (
        <div>
          <p>الإجمالي: {totals.grandTotal}</p>
          <p>الضرائب: {totals.totalTax}</p>
        </div>
      )}
    </div>
  );
}
```

### 2. في Service/Hook بسيط لحساب المجاميع تلقائياً
```typescript
import { useEffect, useState } from 'react';
import { calculateInvoiceTotals } from '../services/invoiceItems';

export function useInvoiceTotals(invoiceId: string) {
  const [totals, setTotals] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    calculateInvoiceTotals(invoiceId).then(setTotals).finally(() => setLoading(false));
  }, [invoiceId]);

  return { totals, loading };
}
```

### 3. الحفظ التلقائي للمجاميع في الفاتورة الأب
```typescript
// في نهاية `handleItemsChange`:
const newTotals = await calculateInvoiceTotals(invoiceId);
await supabase
  .from('invoices')
  .update({
    subtotal: newTotals.subtotal,
    tax_amount: newTotals.totalTax,
    discount_amount: newTotals.totalDiscount,
    total_amount: newTotals.grandTotal
  })
  .eq('id', invoiceId);
```

---

## أمثلة الاستخدام المتقدمة

### اختبار البنود
```typescript
// في Unit Test أو في مكون اختبار:
import * as invoiceItemsService from '../services/invoiceItems';

async function testInvoiceItems() {
  const invoiceId = '1ec1b914-7a1a-47fb-b022-9a42425ca242';
  
  // الحصول على البنود
  const items = await invoiceItemsService.getInvoiceItems(invoiceId);
  console.log('البنود:', items);
  
  // حساب المجاميع
  const totals = await invoiceItemsService.calculateInvoiceTotals(invoiceId);
  console.log('المجاميع:', totals);
}
```

### معالجة الأخطاء
```typescript
try {
  await invoiceItemsService.addInvoiceItem(invoiceId, {
    description: 'منتج اختبار',
    quantity: 1,
    unit_price: 1000
  });
} catch (error) {
  console.error('فشل إضافة البند:', error.message);
  // عرض رسالة خطأ للمستخدم
}
```

---

## نصائح الأداء والأمان

1. **فهرسة**: استعمل `getInvoiceItems()` للفاتورات الفردية (محسّن بالفهرس).
2. **Batch Operations**: استخدم `bulkUpdateInvoiceItems()` للتعديلات المتعددة.
3. **Caching**: لا تغيّر المجاميع بتكرار شديد - استخدم debounce.
4. **الصلاحيات**: تأكد من صلاحيات RLS في Supabase ل invoice_items.
5. **التحقق**: افحص القيم على الخادم قبل الحفظ (validation).

---

## الخطوات التالية المقترحة
- [ ] إضافة اختبارات وحدة للدوال
- [ ] إضافة تقارير PDF/Excel تستخدم البنود
- [ ] ربط البنود مع جدول المنتجات وتحديث المخزون تلقائياً
- [ ] إضافة قوالب سريعة لأنواع بنود شائعة
- [ ] تحسين الأداء للفواتير التي بها عدد كبير من البنود (virtualization)

---

## استعلامات SQL للنشر على Production
قبل النشر:
1. شغّل الترحيل الكامل: `services/migrations/2026-02-11_create_invoice_items.sql`
2. تحقق من الفهارس: `service/invoice_items_queries.sql` (query #1)
3. تحقق من عدم التطابق: `service/invoice_items_queries.sql` (query #4)
4. خذ نسخة احتياطية قاملة قبل أي تحديث كتلي

---

## الدعم والأسئلة
للمساعدة أو الاستفسارات:
- اطّلع على `TECHNICAL_SUMMARY.md`
- راجع ملفات الخدمة في `services/`
- تفحص أخطاء Supabase في SQL Editor
