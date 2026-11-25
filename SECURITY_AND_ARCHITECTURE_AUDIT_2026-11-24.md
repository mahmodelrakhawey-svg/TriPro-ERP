# 🛡️ تقرير التدقيق الأمني والمعماري والتقييم النهائي — TriPro-ERP

**التاريخ:** 2026-11-24 / 2026-11-25  
**البيئات المفحوصة والمحدّثة:**
- **قاعدة لينزا الإنتاجية (`Lenza Production`):** `jsgmrspnthtlsracbmcq`
- **القاعدة العامة (`General Production`):** `pjvphxfschfllpawfewn`

---

## 1. التقييم الهندسي الحالي للبرنامج: **8.6 / 10** *(ارتفع من 7.4 / 10)*

| المحور | التقييم السابق | التقييم الحالي | الملاحظة الهندسية |
| :--- | :---: | :---: | :--- |
| **الأمان وعزل المنشآت (RLS & RPCs)** | 6.0 / 10 | **9.2 / 10** | صفر أخطاء في Supabase Advisors، وصفر تسريبات `anon` على الجداول والدوال الحساسة. |
| **النزاهة المحاسبية (Financial Guard)** | 7.5 / 10 | **9.0 / 10** | منع إدراج سطور على قيود مرحّلة، ومنع التراجع المباشر من `posted` إلى `draft`. |
| **التزامن والأوفلاين (POS & Sync)** | 7.0 / 10 | **8.7 / 10** | قفل `_isProcessingQueue`، قيد فريد لـ `offline_ref_id`، وأقفال `useRef` لمنع النقر المزدوج. |
| **الاختبارات وأتمتة الفحص (CI/CD)** | 8.5 / 10 | **9.4 / 10** | 617 اختباراً ناجحاً (107 ملفات)، `npm run db:verify` للبيئتين، وGitHub Actions للترحيلات. |
| **هيكلة الكود (Modularization)** | 7.0 / 10 | **7.3 / 10** | تم عزل أدوات التعقيم والتحقق مع الإبقاء الواعي على استقرار `AccountingContext.tsx` لحماية لينزا. |

---

## 2. توثيق كافة الإصلاحات والتحصينات المنفذة

### أ. إصلاحات قواعد البيانات و Supabase Security Advisors
1. **حل تحذير `rls_disabled_in_public`:**
   - [`sql_updates/2026-11-24_security_fix_rls_lockdown_all_public_tables.sql`](sql_updates/2026-11-24_security_fix_rls_lockdown_all_public_tables.sql): تفعيل RLS ديناميكياً على كافة جداول `public` وتحصين `_schema_migrations`.
   - تحديث [`scripts/db_migrate.mjs`](scripts/db_migrate.mjs) لتفعيل RLS وسياسات `_schema_migrations` تلقائياً عند التهيئة.
2. **حل خطأي `rls_references_user_metadata`:**
   - [`sql_updates/2026-11-24_security_fix_rls_references_user_metadata.sql`](sql_updates/2026-11-24_security_fix_rls_references_user_metadata.sql): إزالة الاعتماد على `user_metadata` القابل للتعديل من المتصفح واستبداله بـ `auth.uid()` و`get_my_org()` و`get_my_role()`.
3. **التحصين الشامل للـ RLS والـ RPCs الحساسة:**
   - [`sql_updates/2026-11-24_security_hardening_critical_rls_and_rpcs.sql`](sql_updates/2026-11-24_security_hardening_critical_rls_and_rpcs.sql):
     - تفعيل حارس `trg_guard_profile_role_tampering` على `BEFORE INSERT OR UPDATE` في `profiles` لمنع التصعيد الذاتي إلى `super_admin` أو `admin`.
     - تقييد صلاحيات `admin` و`hr` و`manager` بـ `organization_id = public.get_my_org()` في `profiles`, `organizations`, `fiscal_years`, `approval_workflows`, `approval_requests`, `pos_petty_cash_payouts`, `hr_shifts`, و`system_telemetry_incidents`.
     - إغلاق جداول الأصول والبيومترك والأرشيف السنوي (`annual_fiscal_archives`, `archived_*`, `v_comprehensive_journal_ledger`) عن دور `anon`.
     - إصلاح دوال `validate_tenant_access`, `get_current_company_settings` (مع حجب `eta_client_secret` لغير المدراء)، و`get_trial_balance_summary_rpc` (مع الحفاظ على الأعمدة العشرة للواجهة).
     - سحب صلاحية `anon` و`PUBLIC` وتعيين `SET search_path = public, pg_temp` على الدوال المالية والإدارية الحساسة.
4. **النزاهة المحاسبية ومنع التكرار:**
   - [`sql_updates/2026-11-24_security_hardening_financial_immutability_and_pos.sql`](sql_updates/2026-11-24_security_hardening_financial_immutability_and_pos.sql):
     - منع `INSERT` على `journal_lines` لقيد مرحّل بالفعل (`trg_guard_journal_lines_immutability`).
     - منع `INSERT` لقيد يومية بحالة `posted` مباشرة بدون مسودة وأسطر (`trg_guard_journal_insert_posted`).
     - منع تخفيض حالة `invoices`, `sales_returns`, `purchase_returns` من `posted` إلى `draft`/`cancelled` بتحديث مباشر.
     - إضافة الفهرس الفريد `idx_orders_org_offline_ref_unique` على `(organization_id, offline_ref_id)`.
5. **معالجة فجوات المخطط في القاعدة العامة وحراس الدوال السيادية:**
   - [`sql_updates/2026-11-24_fix_general_db_schema_gaps_and_settings.sql`](sql_updates/2026-11-24_fix_general_db_schema_gaps_and_settings.sql): معالجة أخطاء `406` في `get_current_company_settings` (بالإنشاء التلقائي لسجل المنشأة عند غيابه) وأخطاء `400` في `products` و`security_logs`.
   - [`sql_updates/2026-11-25_fix_journal_guards_for_security_definer_rpcs.sql`](sql_updates/2026-11-25_fix_journal_guards_for_security_definer_rpcs.sql): السماح لدوال الخادم (`SECURITY DEFINER`) بإدراج القيود وسطورها مع استمرار المنع الصارم للمتصفح (`authenticated` / `anon`).

### ب. إصلاحات التطبيق، الواجهة الأمامية، والـ CI/CD
1. **منع التزامن وتكرار الإرسال:**
   - [`services/offlineService.ts`](services/offlineService.ts): إضافة قفل `_isProcessingQueue` لمنع تداخل دورات المزامنة.
   - [`modules/restaurant/components/POS/PosScreen.tsx`](modules/restaurant/components/POS/PosScreen.tsx) و[`modules/restaurant/components/Modals/PaymentModal.tsx`](modules/restaurant/components/Modals/PaymentModal.tsx): إضافة أقفال `useRef` المتزامنة لمنع النقر المزدوج.
2. **حماية قوالب الطباعة من ثغرات XSS:**
   - إنشاء [`utils/htmlSanitizer.ts`](utils/htmlSanitizer.ts) (`escapeHtml`) وتطبيقه في: `journalExportUtils.ts`, `productBarcodeUtils.ts`, `LettersOfGuaranteePage.tsx`, `StockAdjustmentForm.tsx`, `StockCard.tsx`, و`GenealogyViewer.tsx`.
3. **حماية الخوادم والأسرار:**
   - [`api/eta-submit.ts`](api/eta-submit.ts): قراءة أسرار الضرائب (`eta_client_id`, `eta_client_secret`) من الخادم عبر `service_role` والتحقق من صيغة `uuid`.
   - [`api/offsite-backup.ts`](api/offsite-backup.ts): تقييد CORS لنطاقات `tripro-erp*.vercel.app` فقط.
   - [`supabase/functions/reset-demo/index.ts`](supabase/functions/reset-demo/index.ts): قصر الطلبات على `POST` ودعم التحقق من `DEMO_RESET_SECRET`.
   - [`services/accountingEngine.ts`](services/accountingEngine.ts): تسجيل أخطاء الـ RPC في `telemetryService.captureException` ومنع التراجع الاحتياطي في أخطاء الصلاحيات والفترات المقفلة.
4. **أدوات الأتمتة والتحقق:**
   - [`.github/workflows/supabase-migrations.yml`](.github/workflows/supabase-migrations.yml): فحص آلي للترحيلات والأمان عبر GitHub Actions.
   - [`scripts/verify_schema_sync.mjs`](scripts/verify_schema_sync.mjs) (`npm run db:verify`): أداة فحص تطابق الترحيلات وانعدام التسريبات بين البيئتين.
5. **تحديثات الضبط المالي والأداء (`2026-11-25`):**
   - [`modules/accounting/AnnualFinancialReport.tsx`](modules/accounting/AnnualFinancialReport.tsx): مواءمة التقرير السنوي الموحد مع دوال الخادم الموحدة (`get_trial_balance_summary_rpc` و`get_income_statement_summary_rpc`) وإزالة فارق التوازن وإصلاح تبويب جاري الشركاء والتدفقات النقدية.
   - [`modules/sales/SalesInvoiceForm.tsx`](modules/sales/SalesInvoiceForm.tsx)، [`modules/sales/InvoiceList.tsx`](modules/sales/InvoiceList.tsx)، [`modules/purchases/PurchaseInvoiceForm.tsx`](modules/purchases/PurchaseInvoiceForm.tsx)، [`modules/purchases/PurchaseInvoiceList.tsx`](modules/purchases/PurchaseInvoiceList.tsx): إزالة مسارات الـ Fallback غير الآمنة عند إلغاء الترحيل لمنع بقاء قيود يتيمة في الأستاذ العام.
   - [`modules/finance/components/PaymentVoucherForm.tsx`](modules/finance/components/PaymentVoucherForm.tsx): تسريع حساب رصيد المورد عبر `fetchAllSupplierBalances` مع الإبقاء على البديل التفصيلي، ومنع تكرار القيد عند فشل RPC التعديل.
   - [`modules/finance/components/TransferForm.tsx`](modules/finance/components/TransferForm.tsx) و[`modules/hr/components/EmployeeAdvances.tsx`](modules/hr/components/EmployeeAdvances.tsx): استبعاد الحسابات التجميعية (`is_group` / `123`)، وتوحيد `resolveActiveOrgId`، وإضافة درع منع التكرار اليومي في التحويلات.

---

## 3. نتائج التحقق النهائي
- **`npm run db:verify`:**
  - `Lenza Production`: **146 / 146** ترحيل مطبق (المعلق: 0) — **0 تسريبات (`anon`)**.
  - `General Production`: **146 / 146** ترحيل مطبق (المعلق: 0) — **0 تسريبات (`anon`)**.
- **`npm test`:** **107 / 107** ملف اختبار، **617 / 617** اختباراً ناجحاً.
- **`npm run build`:** فحص الأمان (**0 مشاكل**) + `tsc` (**0 أخطاء**) + `vite build` ناجح.

---

## 4. ضوابط الأمان: إجراءات تم الامتناع عنها عمداً لحماية شركة لينزا

حرصاً على عدم تعريض بيئة إنتاج **شركة لينزا** لأي توقف أو أخطاء تشغيلية مفاجئة، تم تأجيل/تجنب الإجراءات التالية عن قصد:

1. **عدم استبدال [`context/AccountingContext.tsx`](context/AccountingContext.tsx) (3,910 سطر) دفعة واحدة بـ `context/domains/*`:**
   - كشف التحليل وجود **35 دالة منسّقة** وحمايات إنتاجية خاصة بلينزا (مثل منطق `isLenzaOrg` و`allowNegativeStock` وإدارة المزامنة المركزية) غير موجودة بالكامل داخل `context/domains/`. استبداله دون اختبار مرحلي شامل على بيئة staging قد يسبب تعطل شاشات فعلية في المصنع/المخبز.
2. **عدم الحذف الأعمى لجميع مسارات الـ Fallback في `accountingEngine.ts` و`offlineService.ts`:**
   - تم حجب الـ Fallback عند أخطاء الصلاحيات والأمان والفترات المقفلة (`42501` / `TRIPRO_*`)، مع الإبقاء عليه فقط كشبكة أمان عند غياب الدالة (`PGRST202`) حتى لا تتوقف عمليات الفوترة في لينزا.
3. **عدم تفكيك حزمة `vendor-ui` في [`vite.config.ts`](vite.config.ts):**
   - دمج `antd` و`rc-*` في حزمة واحدة مقصود لمنع التبعيات الدائرية في Rollup؛ وتغيير ذلك قد يسبب أخطاء تحميل في المتصفح (`Cannot access before initialization`).
4. **عدم حذف مجلد `sql_updates/` أو تعديل سجل `_schema_migrations` التاريخي:**
   - الإبقاء على سلسلة الـ 146 ملفاً متسلسلة يضمن تطابق البصمة والتتبع بين القاعدتين دون كسر الترحيلات المستقبلية.
