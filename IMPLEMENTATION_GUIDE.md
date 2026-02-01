# TriPro ERP - دليل التطبيق العملي
# Implementation Guide

---

## 📑 جدول المحتويات | Table of Contents

1. [البدء السريع | Quick Start](#quick-start)
2. [التكامل خطوة بخطوة | Step-by-Step Integration](#step-by-step)
3. [أمثلة عملية | Practical Examples](#examples)
4. [استكشاف الأخطاء | Troubleshooting](#troubleshooting)
5. [قائمة التحقق | Checklist](#checklist)

---

## 🚀 البدء السريع | Quick Start {#quick-start}

### الخطوة 1: استيراد الأدوات المطلوبة
```typescript
// في الملف الخاص بك
import { useForm } from '@/utils/formIntegration';
import { useToastNotification } from '@/utils/toastUtils';
import { secureApiFetch } from '@/utils/apiSecurityMiddleware';
import { createInvoiceSchema } from '@/utils/validationSchemas';
```

### الخطوة 2: إعداد نموذج مع التحقق
```typescript
export function InvoiceForm() {
  const form = useForm(
    {
      invoiceNumber: '',
      customerId: '',
      items: [],
      totalAmount: 0,
      taxRate: 0,
    },
    createInvoiceSchema,
    onSubmit
  );

  async function onSubmit(values) {
    // البيانات تم تطهيرها بالفعل
    const response = await secureApiFetch({
      url: '/api/invoices',
      method: 'POST',
      body: values,
    });

    if (response.success) {
      // معالجة النجاح
    }
  }

  return (
    <form onSubmit={form.handleSubmit}>
      {/* ... */}
    </form>
  );
}
```

### الخطوة 3: اختبر التحقق
```bash
# التحقق من صحة الملفات
npm run type-check
npm run lint
```

---

## 🔧 التكامل خطوة بخطوة | Step-by-Step Integration {#step-by-step}

### المرحلة 1: إضافة النموذج البسيط

**الملف:** `components/sales/SimpleInvoiceForm.tsx`

```typescript
import React from 'react';
import { useForm } from '@/utils/formIntegration';
import { FormField } from '@/utils/formIntegration';
import { useToastNotification } from '@/utils/toastUtils';
import { createInvoiceSchema } from '@/utils/validationSchemas';
import { secureApiFetch } from '@/utils/apiSecurityMiddleware';

export default function SimpleInvoiceForm() {
  const { showSuccess, showError } = useToastNotification();

  const form = useForm(
    {
      invoiceNumber: '',
      customerId: '',
      invoiceDate: new Date().toISOString().split('T')[0],
      dueDate: '',
      totalAmount: 0,
      notes: '',
    },
    createInvoiceSchema,
    onSubmit
  );

  async function onSubmit(values) {
    try {
      const response = await secureApiFetch(
        {
          url: '/api/invoices',
          method: 'POST',
          body: values,
        },
        {
          requireAuth: true,
          rateLimit: { maxAttempts: 10, windowMs: 60000 },
          logAudit: true,
        }
      );

      if (response.success) {
        showSuccess('تم حفظ الفاتورة بنجاح');
        form.resetForm();
      } else {
        showError(response.error);
      }
    } catch (error) {
      showError('خطأ في حفظ الفاتورة');
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">إنشاء فاتورة</h1>

      <form onSubmit={form.handleSubmit} className="space-y-6">
        <FormField
          label="رقم الفاتورة"
          name="invoiceNumber"
          type="text"
          value={form.values.invoiceNumber}
          onChange={form.handleChange}
          onBlur={form.handleBlur}
          error={form.getFieldError('invoiceNumber')}
          touched={form.touched.has('invoiceNumber')}
          containerClassName="mb-4"
          required
        />

        <FormField
          label="معرف العميل"
          name="customerId"
          type="text"
          value={form.values.customerId}
          onChange={form.handleChange}
          onBlur={form.handleBlur}
          error={form.getFieldError('customerId')}
          touched={form.touched.has('customerId')}
          containerClassName="mb-4"
          required
        />

        <FormField
          label="تاريخ الفاتورة"
          name="invoiceDate"
          type="date"
          value={form.values.invoiceDate}
          onChange={form.handleChange}
          onBlur={form.handleBlur}
          error={form.getFieldError('invoiceDate')}
          touched={form.touched.has('invoiceDate')}
          containerClassName="mb-4"
          required
        />

        <FormField
          label="تاريخ الاستحقاق"
          name="dueDate"
          type="date"
          value={form.values.dueDate}
          onChange={form.handleChange}
          onBlur={form.handleBlur}
          error={form.getFieldError('dueDate')}
          touched={form.touched.has('dueDate')}
          containerClassName="mb-4"
        />

        <FormField
          label="المبلغ الإجمالي"
          name="totalAmount"
          type="number"
          value={form.values.totalAmount}
          onChange={form.handleChange}
          onBlur={form.handleBlur}
          error={form.getFieldError('totalAmount')}
          touched={form.touched.has('totalAmount')}
          containerClassName="mb-4"
          step="0.01"
          required
        />

        <FormField
          label="ملاحظات"
          name="notes"
          type="text"
          value={form.values.notes}
          onChange={form.handleChange}
          onBlur={form.handleBlur}
          error={form.getFieldError('notes')}
          touched={form.touched.has('notes')}
          containerClassName="mb-4"
        />

        <div className="flex gap-4">
          <button
            type="submit"
            disabled={form.isSubmitting}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {form.isSubmitting ? 'جاري الحفظ...' : 'حفظ الفاتورة'}
          </button>

          <button
            type="button"
            onClick={form.resetForm}
            className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400"
          >
            إعادة تعيين
          </button>
        </div>

        {form.isDirty && (
          <p className="text-orange-600 text-sm">
            ⚠️ هناك تغييرات غير محفوظة
          </p>
        )}
      </form>
    </div>
  );
}
```

### المرحلة 2: نموذج متقدم مع حقول ديناميكية

**الملف:** `components/purchases/AdvancedPurchaseOrderForm.tsx`

```typescript
import React, { useState } from 'react';
import { useForm } from '@/utils/formIntegration';
import { FormField } from '@/utils/formIntegration';
import { useToastNotification } from '@/utils/toastUtils';
import { createPurchaseOrderSchema } from '@/utils/validationSchemas';
import { secureApiFetch } from '@/utils/apiSecurityMiddleware';

export default function AdvancedPurchaseOrderForm() {
  const { showSuccess, showError } = useToastNotification();
  const [items, setItems] = useState([
    { productId: '', quantity: 0, unitPrice: 0 }
  ]);

  const form = useForm(
    {
      supplierId: '',
      poNumber: '',
      orderDate: new Date().toISOString().split('T')[0],
      items: items,
    },
    createPurchaseOrderSchema,
    onSubmit
  );

  function addItem() {
    const newItems = [...items, { productId: '', quantity: 0, unitPrice: 0 }];
    setItems(newItems);
    form.setFieldValue('items', newItems);
  }

  function removeItem(index: number) {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
    form.setFieldValue('items', newItems);
  }

  function updateItem(index: number, field: string, value: any) {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
    form.setFieldValue('items', newItems);
  }

  async function onSubmit(values) {
    const response = await secureApiFetch(
      {
        url: '/api/purchase-orders',
        method: 'POST',
        body: values,
      },
      { requireAuth: true, logAudit: true }
    );

    if (response.success) {
      showSuccess('تم حفظ أمر الشراء بنجاح');
      form.resetForm();
      setItems([{ productId: '', quantity: 0, unitPrice: 0 }]);
    } else {
      showError(response.error);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">أمر شراء جديد</h1>

      <form onSubmit={form.handleSubmit} className="space-y-6">
        {/* رأس النموذج */}
        <div className="grid grid-cols-2 gap-4">
          <FormField
            label="معرف المورد"
            name="supplierId"
            value={form.values.supplierId}
            onChange={form.handleChange}
            onBlur={form.handleBlur}
            error={form.getFieldError('supplierId')}
            touched={form.touched.has('supplierId')}
            required
          />

          <FormField
            label="رقم الأمر"
            name="poNumber"
            value={form.values.poNumber}
            onChange={form.handleChange}
            onBlur={form.handleBlur}
            error={form.getFieldError('poNumber')}
            touched={form.touched.has('poNumber')}
            required
          />
        </div>

        {/* جدول العناصر */}
        <div className="border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4">عناصر الطلب</h2>

          <table className="w-full mb-4">
            <thead>
              <tr className="border-b">
                <th className="text-right p-2">معرف المنتج</th>
                <th className="text-right p-2">الكمية</th>
                <th className="text-right p-2">السعر</th>
                <th className="text-right p-2">الإجمالي</th>
                <th className="p-2">الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={index} className="border-b hover:bg-gray-50">
                  <td className="p-2">
                    <input
                      type="text"
                      value={item.productId}
                      onChange={(e) => updateItem(index, 'productId', e.target.value)}
                      className="w-full px-2 py-1 border rounded"
                      placeholder="معرف المنتج"
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value))}
                      className="w-full px-2 py-1 border rounded"
                      placeholder="0"
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      value={item.unitPrice}
                      onChange={(e) => updateItem(index, 'unitPrice', parseFloat(e.target.value))}
                      className="w-full px-2 py-1 border rounded"
                      placeholder="0.00"
                      step="0.01"
                    />
                  </td>
                  <td className="p-2 text-right">
                    {(item.quantity * item.unitPrice).toFixed(2)}
                  </td>
                  <td className="p-2">
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="text-red-600 hover:text-red-800"
                    >
                      حذف
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <button
            type="button"
            onClick={addItem}
            className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
          >
            + إضافة عنصر
          </button>
        </div>

        {/* الأزرار */}
        <div className="flex gap-4">
          <button
            type="submit"
            disabled={form.isSubmitting}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {form.isSubmitting ? 'جاري...' : 'حفظ الأمر'}
          </button>

          <button
            type="button"
            onClick={form.resetForm}
            className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
          >
            إلغاء
          </button>
        </div>
      </form>
    </div>
  );
}
```

---

## 💡 أمثلة عملية | Practical Examples {#examples}

### مثال 1: معالجة الأخطاء الجيدة
```typescript
import { useToastNotification } from '@/utils/toastUtils';
import { handleError } from '@/utils/errorHandler';

export function MyComponent() {
  const { showSuccess, showError, showWarning } = useToastNotification();

  async function deleteInvoice(id: string) {
    try {
      const response = await fetch(`/api/invoices/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('فشل حذف الفاتورة');
      }

      showSuccess('تم حذف الفاتورة بنجاح');
    } catch (error) {
      handleError(error, 'خطأ في حذف الفاتورة');
      showError(String(error));
    }
  }

  return <button onClick={() => deleteInvoice('123')}>حذف</button>;
}
```

### مثال 2: التحقق من البيانات قبل الحفظ
```typescript
import { validateData, sanitizeFormData } from '@/utils/validationSchemas';
import { createCustomerSchema } from '@/utils/validationSchemas';

async function saveCustomer(formData) {
  // تطهير البيانات أولاً
  const sanitized = sanitizeFormData(formData);

  // التحقق من الصحة
  const { error, data } = await validateData(createCustomerSchema, sanitized);

  if (error) {
    showError(`خطأ في التحقق: ${error}`);
    return;
  }

  // حفظ البيانات المعتمدة
  await saveToDatabase(data);
}
```

### مثال 3: طلب API آمن مع تتبع الأخطاء
```typescript
import { secureApiFetch } from '@/utils/apiSecurityMiddleware';

async function fetchInvoices() {
  const response = await secureApiFetch(
    {
      url: '/api/invoices',
      method: 'GET',
    },
    {
      requireAuth: true,
      rateLimit: { maxAttempts: 10, windowMs: 60000 },
      logAudit: true,
      retryOnFailure: true,
    }
  );

  if (response.success) {
    return response.data;
  } else {
    console.error('Request failed:', response.error);
    showError(response.error);
  }
}
```

---

## 🔍 استكشاف الأخطاء | Troubleshooting {#troubleshooting}

### المشكلة: التحقق لا يعمل
```typescript
// ❌ خطأ
const form = useForm(values);

// ✅ صحيح
const form = useForm(values, validationSchema, onSubmit);
```

### المشكلة: Toast notifications لا تظهر
```typescript
// تأكد من أن ToastProvider موجود في App.tsx
import { ToastProvider } from '@/context/ToastContext';

export default function App() {
  return (
    <ToastProvider>
      {/* تطبيقك */}
    </ToastProvider>
  );
}
```

### المشكلة: CSRF token error
```typescript
// تأكد من حفظ CSRF token في sessionStorage
// في صفحة تسجيل الدخول
sessionStorage.setItem('csrf_token', csrfToken);

// أو في رأس الطلب
headers: {
  'X-CSRF-Token': sessionStorage.getItem('csrf_token'),
}
```

---

## ✅ قائمة التحقق | Checklist {#checklist}

### قبل نشر الكود
- [ ] تم استيراد جميع الأدوات المطلوبة
- [ ] تم إضافة validationSchema للنموذج
- [ ] تم اختبار التحقق من الصحة
- [ ] تم اختبار معالجة الأخطاء
- [ ] تم اختبار على الجوال
- [ ] تم حفظ CSRF token
- [ ] تم تسجيل عمليات الحذف/التعديل
- [ ] تم اختبار الحدود من حيث الأداء

### قبل الإطلاق
- [ ] تم اختبار جميع النماذج
- [ ] تم اختبار جميع API endpoints
- [ ] تم اختبار معالجة الأخطاء
- [ ] تم اختبار على متصفحات مختلفة
- [ ] تم اختبار الأمان
- [ ] تم توثيق جميع التغييرات
- [ ] تم تحديث دليل المستخدم

---

**آخر تحديث | Last Updated:** 2024

---

## 📞 الدعم | Support

للمزيد من المساعدة:
- اطلع على التعليقات في الكود
- راجع ملفات الاختبار
- تحقق من سجل التغييرات
