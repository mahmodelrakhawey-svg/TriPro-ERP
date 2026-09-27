# 🏗️ Integration Tests — TriPro ERP

## ما هذا؟

هذه اختبارات **Integration حقيقية** تضرب Supabase مباشرةً.
**الفرق الجوهري عن Unit Tests:**

| | Unit Tests | Integration Tests (هذا المجلد) |
|---|---|---|
| قاعدة البيانات | محاكاة (Mock) | **Supabase حقيقي (Staging)** |
| RLS & Triggers | مُتجاهَلة | **تعمل فعلاً** |
| الأخطاء المكتشفة | أخطاء منطق فقط | **أخطاء RLS + Triggers + DB constraints** |
| السرعة | سريع جداً | أبطأ (شبكة) |

## متطلبات التشغيل

يجب إنشاء ملف `.env.integration` بالبيانات التالية:

```env
# قاعدة بيانات Staging (النسخة العامة — ليست لينزا الحية)
INT_SUPABASE_URL=https://pjvphxfschfllpawfewn.supabase.co
INT_SUPABASE_ANON_KEY=your_anon_key_here
INT_SUPABASE_SERVICE_KEY=your_service_role_key_here

# بيانات اعتماد مستخدم اختبار (super_admin على staging)
INT_TEST_ADMIN_EMAIL=test.admin@tripro-staging.com
INT_TEST_ADMIN_PASSWORD=your_test_password
```

## تشغيل الاختبارات

```bash
# تشغيل اختبارات Integration فقط
npm run test:integration

# تشغيل مع مشاهدة التقرير التفصيلي
npm run test:integration:verbose
```

> ⚠️ **تحذير**: لا تُشغّل هذه الاختبارات على قاعدة بيانات الإنتاج (لينزا).
> دائماً على Staging أو قاعدة اختبار مستقلة.
