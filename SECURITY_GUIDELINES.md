# 🛡️ TriPro ERP - Security Guidelines

## دليل الأمان لفريق التطوير

#### آخر تحديث: مارس 2026

---

## 📋 جدول المحتويات
1. [مبادئ الأمان الأساسية](#مبادئ-الأمان-الأساسية)
2. [حماية ضد OWASP Top 10](#حماية-ضد-owasp-top-10)
3. [معايير الترميز](#معايير-الترميز)
4. [التحقق من المدخلات](#التحقق-من-المدخلات)
5. [إدارة البيانات الحساسة](#إدارة-البيانات-الحساسة)
6. [قائمة الفحص](#قائمة-الفحص)

---

## مبادئ الأمان الأساسية

### ✅ يجب:
- استخدام `sanitizeHtml()` على جميع المدخلات من المستخدم
- التحقق من جميع البيانات باستخدام Zod schemas
- استخدام `secureStorage` بدل `localStorage` مباشرة
- تسجيل جميع العمليات الحساسة (بدون تفاصيل حساسة)
- استخدام `process.env.NODE_ENV === 'development'` قبل console logs
- تفعيل HTTPS في الإنتاج فقط
- تدوير tokens وجلسات العمل منتظماً
- استخدام RBAC (Role-Based Access Control)

### ❌ لا تفعل:
- لا تخزن كلمات مرور مباشرة في الكود أو localStorage
- لا تستخدم `alert()` لأخطاء حساسة
- لا تستخدم `eval()` أو `Function()` مع input من المستخدم
- لا تسجل كلمات المرور، tokens، أو API keys
- لا تعرض أخطاء قاعدة البيانات الداخلية
- لا تثق بـ client-side validation فقط
- لا تستخدم `any` type في البيانات الخارجية
- لا تسجل الأخطاء الكاملة في الـ browser console بالإنتاج

---

## حماية ضد OWASP Top 10

### 1. Injection (SQL, NoSQL, Command)
```typescript
// ❌ خطر
const query = `SELECT * FROM users WHERE id = ${userId}`;

// ✅ آمن
const { data } = await supabase.from('users').select('*').eq('id', userId);
```

### 2. Broken Authentication
```typescript
// ✅ الطريقة الموصى بها
import { LoginSchema, validateData } from '@/utils/securityValidation';

const result = validateData(LoginSchema, { email, password });
if (!result.success) {
  return { success: false, message: 'Invalid credentials' };
}
```

### 3. Sensitive Data Exposure
```typescript
// ❌ خطر
localStorage.setItem('authToken', token);

// ✅ آمن - استخدم sessionStorage للـ tokens قصيرة المدى
secureStorage.setItem('preferences', userData);
```

### 4. XML External Entities (XXE)
- لا تستخدم XML parsing من مصادر خارجية
- استخدم JSON فقط عند الممكن

### 5. Broken Access Control
```typescript
// ✅ تحقق من الصلاحيات قبل أي عملية
if (!currentUser?.can('invoices', 'delete')) {
  throw new Error('Unauthorized');
}
```

### 6. Security Misconfiguration
- راجع `.env.example` قبل الديبلوي
- أزل جميع debug tools من الإنتاج
- فعّل CORS headers الصحيحة

### 7. Cross-Site Scripting (XSS)
```typescript
// ❌ خطر
<div>{userData.name}</div> // إذا كان userData من user input

// ✅ آمن
import { sanitizeHtml } from '@/utils/securityGuards';
<div>{sanitizeHtml(userData.name)}</div>
```

### 8. Insecure Deserialization
- تجنب `JSON.parse()` من مصادر غير موثوقة
- استخدم schemas للتحقق

### 9. Using Components with Known Vulnerabilities
```bash
# تحقق من الثغرات بانتظام
npm audit
npm audit fix
```

### 10. Insufficient Logging & Monitoring
```typescript
// ✅ سجل الأحداث الأمنية
import { logSecurityEvent } from '@/utils/securityMiddleware';

logSecurityEvent('login_attempt', userId, { 
  ip: getClientIP(), // لا تسجل البيانات الحساسة
  success: true 
});
```

---

## معايير الترميز

### Types و Generics
```typescript
// ❌ تجنب `any`
const handleData = (data: any) => { }

// ✅ استخدم types صريحة
const handleData = (data: User) => { }
```

### Error Handling
```typescript
// ❌ لا تعرض الأخطاء الكاملة
catch (error) {
  console.error(error);
  return { error: error };
}

// ✅ أخفِ التفاصيل في الإنتاج
catch (error) {
  if (process.env.NODE_ENV === 'development') {
    console.error(error);
  }
  return { error: 'An error occurred' };
}
```

### Async/Await
```typescript
// ✅ تعامل مع الأخطاء
try {
  const result = await operation();
} catch (error) {
  logSecurityEvent('operation_failed', userId, { operation: 'xyz' });
}
```

---

## التحقق من المدخلات

### Form Validation
```typescript
import { validateData, CustomerSchema } from '@/utils/securityValidation';

const handleSubmit = (formData) => {
  const result = validateData(CustomerSchema, formData);
  
  if (!result.success) {
    showError(result.errors?.[0]);
    return;
  }

  // المتابعة مع البيانات الموثوقة
};
```

### Sanitization في الواجهة
```typescript
import { sanitizeHtml, sanitizeObject } from '@/utils/securityGuards';

// للنصوص
const safeName = sanitizeHtml(userInput);

// للكائنات
const safeData = sanitizeObject(externalData);
```

---

## إدارة البيانات الحساسة

### كلمات المرور
- لا تخزنها مطلقاً في الكود
- استخدم Supabase Auth فقط
- لا تسجلها أبداً

### Tokens و API Keys
```typescript
// ✅ استخدم متغيرات البيئة فقط
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;

// ✅ لا تعرضها على الـ client
// ❌ لا تفعل هذا:
// console.log('Key is:', apiKey);
```

### صلاحيات الوصول
```typescript
// ✅ استخدم RLS في Supabase
// ✅ تحقق من الصلاحيات على الـ server
// ❌ لا تثق بـ client-side permissions فقط
```

---

## قائمة الفحص - Pre-Deployment Checklist

### قبل الإرسال للإنتاج:
- [ ] تم حذف جميع كلمات المرور و tokens من الكود
- [ ] تم تفعيل TypeScript `strict` mode
- [ ] جميع المدخلات يتم تعقيمها و التحقق منها
- [ ] لا توجد `alert()` calls للعمليات الحساسة
- [ ] جميع `console.log` مغطاة بـ `NODE_ENV === 'development'`
- [ ] تم فحص الثغرات: `npm audit`
- [ ] تم اختبار HTTPS فقط
- [ ] تم تفعيل CORS headers
- [ ] تم تفعيل CSP (Content Security Policy)
- [ ] تم اختبار XSS scenarios يدويا
- [ ] تم اختبار SQL injection scenarios
- [ ] تم اختبار CSRF protection
- [ ] تم عمل backup قبل الإطلاق

---

## الموارد المرجعية

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Zod Documentation](https://zod.dev/)
- [Supabase Security](https://supabase.com/docs/guides/auth)
- [TypeScript Security](https://www.typescriptlang.org/docs/handbook/)

---

## الاتصال بفريق الأمان
إذا عثرت على ثغرة أمنية:
1. **لا تفصح عنها علناً**
2. أرسل تقرير خاص إلى security@tripro.local
3. امنح 48 ساعة لإصدار التصحيح

---

**آخر تحديث: مارس 2026**
**التوافقية: TriPro ERP v1.0+**
