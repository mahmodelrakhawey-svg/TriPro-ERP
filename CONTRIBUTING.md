# 🛠️ دليل المساهمة والتطوير (Developer Guide)

## 📋 نظرة عامة
TriPro ERP مبني باستخدام React 18, TypeScript, و Supabase. يتبع المشروع نمط المديولات المستقلة لضمان سهولة التوسع.

## 🚀 إعداد بيئة التطوير
1. **المتطلبات:** Node.js v16+, npm.
2. **التثبيت:** `npm install`
3. **التشغيل:** `npm run dev`

## 🛡️ نظام معالجة الأخطاء (Error Handling)
يجب تجنب استخدام `alert()` نهائياً. استخدم نظام `showToast` الموحد:

### استخدام `useToastNotification`
```typescript
import { useToastNotification } from '../utils/toastUtils';
const toast = useToastNotification();

// عند النجاح
toast.saved(); 
// عند الخطأ
toast.error(error.message);
```

### استخدام `handleError`
للمعالجة المتقدمة التي تتطلب تسجيل الأخطاء (Logging):
```typescript
import { handleError } from '../utils/errorHandler';
try { ... } catch (error) {
  handleError(error, { context: { component: 'JournalEntry' } });
}
```

## ✅ معايير الكود
- **TypeScript:** تجنب استخدام `any` واستخدم الواجهات (Interfaces) المحددة في `types/`.
- **Validation:** استخدم مخططات `Zod` للتحقق من صحة البيانات قبل إرسالها لـ Supabase.
- **UI:** اعتمد على Tailwind CSS للتنسيق و Lucide React للأيقونات.

## 🧪 الاختبارات
نستخدم **Vitest**. لتشغيل الاختبارات: `npm test`.
يجب التأكد من نجاح جميع الاختبارات قبل عمل `Build` للمشروع.

---
*آخر تحديث: مايو 2026*