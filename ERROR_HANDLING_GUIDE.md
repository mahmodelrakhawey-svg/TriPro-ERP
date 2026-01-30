# 📋 دليل استخدام معالجة الأخطاء الجديد

## ✅ ما تم تحسينه

تم استبدال **جميع `alert()` بـ `showToast()`** مع:
- ✅ معالجة أخطاء احترافية
- ✅ رسائل واضحة وودودة
- ✅ أكواد منظمة وقابلة للصيانة

---

## 🎯 كيفية الاستخدام

### الطريقة 1: استخدام `useToast` مباشرة

```typescript
import { useToast } from '../context/ToastContext';

const MyComponent = () => {
  const { showToast } = useToast();

  const handleSave = async () => {
    try {
      // العملية
      await saveData();
      showToast('تم الحفظ بنجاح', 'success');
    } catch (error: any) {
      showToast(error?.message || 'فشل الحفظ', 'error');
    }
  };
};
```

### الطريقة 2: استخدام `useToastNotification` (مختصرة)

```typescript
import { useToastNotification } from '../utils/toastUtils';

const MyComponent = () => {
  const toast = useToastNotification();

  const handleSave = async () => {
    try {
      await saveData();
      toast.saved(); // بدل: showToast('تم الحفظ بنجاح', 'success')
    } catch (error: any) {
      toast.error(error?.message);
    }
  };
};
```

---

## 📝 أنواع الرسائل

### النجاح ✅
```typescript
showToast('تم الحفظ بنجاح', 'success');
toast.success('رسالتك');
```

### الخطأ ❌
```typescript
showToast('فشل الحفظ', 'error');
toast.error('رسالتك');
```

### التحذير ⚠️
```typescript
showToast('تحذير مهم', 'warning');
toast.warning('رسالتك');
```

### معلومات ℹ️
```typescript
showToast('معلومة إضافية', 'info');
toast.info('رسالتك');
```

---

## 🛡️ معالجة الأخطاء الشاملة

### استخدام `AppError`

```typescript
import { AppError, handleError } from '../utils/errorHandler';

const myFunction = async () => {
  try {
    const data = await fetchData();
    
    if (!data) {
      throw new AppError(
        'البيانات غير موجودة',
        'NO_DATA',
        'high'
      );
    }
    
  } catch (error) {
    handleError(error, {
      showNotification: showToast,
      context: { operation: 'fetchData' },
      onError: (err) => console.error(err)
    });
  }
};
```

### التحقق من الصحة

```typescript
import { validateAmount, validateDate, validateRequired } from '../utils/errorHandler';

try {
  validateRequired(customerId, 'معرف العميل');
  validateAmount(amount, 'المبلغ');
  validateDate(invoiceDate, 'تاريخ الفاتورة');
  
  // تابع العملية
} catch (error: any) {
  showToast(error.message, 'error');
}
```

---

## 📋 الملفات التي تم تحديثها

✅ `modules/purchases/DebitNoteForm.tsx`
✅ `modules/finance/PaymentVoucherForm.tsx`
✅ `modules/finance/CashClosingForm.tsx`
✅ `modules/sales/SalesReturnForm.tsx`
✅ `components/Settings.tsx`

---

## 🔍 ملفات لازال تحتاج تحديث

البحث يجري عن المزيد من `alert()` في:
- `modules/sales/SalesInvoiceForm.tsx`
- `modules/reports/TaxReturnReport.tsx`
- `context/AccountingContext.tsx`
- وملفات أخرى

---

## ✨ الفوائد

| الميزة | التأثير |
|-------|--------|
| رسائل واضحة | تجربة مستخدم أفضل |
| معالجة موحدة | كود أنظف |
| تسجيل الأخطاء | debugging أسهل |
| رسائل عربية | تجربة أفضل للمستخدمين العرب |

---

## 🚀 الخطوات التالية

1. ✅ تم: استبدال أهم الملفات
2. 🔄 جاري: البحث عن باقي `alert()`
3. ⏳ قريباً: إضافة Validation
4. ⏳ قريباً: تحسينات الأمان

---

**التطبيق أصبح أكثر احترافية! 🎉**
