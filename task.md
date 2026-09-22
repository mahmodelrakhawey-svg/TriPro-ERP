# مهام المرحلة الثالثة

## البند 1: إصلاح Vite Circular Dependencies
- [/] تعديل `vite.config.ts` - دمج antd + rc + ant-icons في `vendor-ui`
- [ ] تشغيل `npm run build` والتحقق من اختفاء تحذيرات Circular
- [ ] تشغيل `npm test` → 132/132
- [ ] `npx tsc --noEmit` → 0 أخطاء

## البند 2: E2E Tests حقيقية
- [ ] تثبيت Playwright في devDependencies
- [ ] تثبيت متصفحات Playwright
- [ ] إنشاء `playwright.config.ts`
- [ ] سيناريو 1: شركة جديدة من الصفر (بدون 400 errors)
- [ ] سيناريو 2: فتح الوردية + فاتورة بيع
- [ ] سيناريو 3: تسجيل الدخول + الإعدادات
- [ ] تشغيل جميع E2E Tests
