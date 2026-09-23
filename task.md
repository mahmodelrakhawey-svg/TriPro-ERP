# مهام المرحلة الثالثة

## البند 1: إصلاح Vite Circular Dependencies ✅ مكتمل
- [x] تعديل `vite.config.ts` - دمج antd + rc + ant-icons في `vendor-ui`
- [x] تشغيل `npm run build` → ✅ بناء ناجح، **0 Circular chunk warnings**
- [x] تشغيل `npm test` → ✅ **132/132** نجاح
- [x] `npx tsc --noEmit` → ✅ **0 أخطاء**
- [x] commit: `f59d634` + push على `fix/typescript-strict`

## البند 2: E2E Tests حقيقية ✅ مكتمل
- [x] تأكيد وجود Playwright في devDependencies v1.63.0
- [x] `e2e/new-company-flow.spec.ts` — يحرس أخطاء start_pos_shift و company_settings
- [x] `e2e/sales-cycle.spec.ts` — دورة POS كاملة: فتح وردية + فاتورة + إغلاق
- [x] `e2e/purchase-invoice.spec.ts` — يحرس خطأ wh-main UUID تحديداً
- [x] `.env.e2e.example` — دليل إعداد بيانات الاختبار
- [x] `.gitignore` — حماية `.env.e2e` من الرفع
- [x] commit + push
