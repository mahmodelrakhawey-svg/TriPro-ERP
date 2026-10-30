# 📖 التوثيق الشامل والمرجع المعماري لمشروع TriPro-ERP
> **تاريخ آخر تحديث:** أكتوبر 2026  
> **الإصدار الحالي:** V52.0 Enterprise Hardened (v2.5-enterprise-hardened)  
> **حالة النظام:** مجرب ومثبت تشغيلياً في بيئة الإنتاج المباشرة (شركة حلواني لينزا + بيئة الإنتاج العامة).  
> **حالة الاختبارات:** 81 ملف اختبار، 452 اختبار آلي ناجح بنسبة 100% (Vitest) + 7 أجنحة متكاملة E2E (Playwright).

---

## 1. نظرة عامة على المشروع (Project Overview)
**TriPro ERP** هو نظام مؤسسي متكامل لإدارة الموارد السحابية (Enterprise Multi-Tenant SaaS ERP) مبني باستخدام:
- **الواجهة الأمامية (Frontend):** React 18, TypeScript, Vite, TailwindCSS, Ant Design, Lucide Icons.
- **قاعدة البيانات والواجهة الخلفية (Backend & DB):** PostgreSQL / Supabase, مع دوال PL/pgSQL مخزنة (RPCs) لضمان المعاملات المالية الذرية (ACID Transactions)، وسياسات أمان صارمة على مستوى السجلات (RLS).
- **المعمارية المالية:** محرك قيود مزدوج (Double-Entry General Ledger) متوافق مع معايير المحاسبة والضرائب المصرية والفاتورة الإلكترونية (ETA e-Invoicing) وإيصال الضرائب الإلكتروني.

---

## 2. المعمارية الموزعة للسياق المركزي (Domain Facade Architecture)
تم بنجاح تفكيك وإعادة هيكلة الملف المركزي الضخم `context/AccountingContext.tsx` (الذي كان يتجاوز 5,000 سطر) باستخدام **نمط الواجهة الموحدة (Facade Pattern)** لحل مشكلة إعادة التصيير غير الضروري (Re-renders) وعزل المسؤوليات البرمجية، مع الحفاظ التام على التوافق الرجعي 100% لأكثر من 100 شاشة ومكون.

### أ. ملفات النطاقات العشرة (`context/domains/`):
تم عزل الـ State والدوال التشغيلية في 10 سياقات وهوكات متخصصة:

| # | اسم الملف (Context) | الهوك المخصص (Hook) | المسؤوليات والمهام التشغيلية |
| :---: | :--- | :--- | :--- |
| **1** | `CustomerContext.tsx` | `useCustomerDomain()` | إدارة بيانات العملاء، تحديث الأرصدة، فئات التسعير (قطاعي/جملة/نصف جملة)، فحص حدود الائتمان، وكشوفات حسابات العملاء. |
| **2** | `SupplierContext.tsx` | `useSupplierDomain()` | إدارة الموردين، تقييماتهم، فواتير المشتريات، تحويل أوامر الشراء (PO) لفواتير، وأرصدة الموردين. |
| **3** | `ProductContext.tsx` | `useProductDomain()` | إدارة الأصناف، المستودعات، التصنيفات، معاملات تحويل الوحدات (Multi-UOM)، باركودات الوحدات، الهوالك والإنتاج، وتكلفة المخزون (WAC). |
| **4** | `AccountingSettingsContext.tsx` | `useAccountingSettingsDomain()` | إعدادات الضرائب المصرية (VAT 14%)، العملات وأسعار الصرف، بيانات الشركة/المنشأة، ربط مصلحة الضرائب (ETA)، والتحقق من الصلاحيات (`can`). |
| **5** | `SalesContext.tsx` | `useSalesDomain()` | دورة المبيعات: فواتير المبيعات، عروض الأسعار، استعادة المسودات الذاتية، إلغاء الترحيل الآمن، وحسابات المناديب. |
| **6** | `BankingContext.tsx` | `useBankingDomain()` | الخزائن، الحسابات البنكية، أوراق القبض وأوراق الدفع (الشيكات)، سندات الصرف والقبض، وتسويات البنوك. |
| **7** | `GeneralLedgerContext.tsx` | `useGeneralLedgerDomain()` | دليل الحسابات الشجري (COA)، قيود اليومية الآلية، مراكز التكلفة، الموازنات التقديرية، الإقفال السنوي، وميزان المراجعة. |
| **8** | `HrContext.tsx` | `useHrDomain()` | سجلات الموظفين، الحضور والانصراف والبصمة، السلف والعهد، مسيرات الرواتب الشهرية واستحقاقاتها، ومكافأة نهاية الخدمة. |
| **9** | `RestaurantContext.tsx` | `useRestaurantDomain()` | الطاولات وحجوزاتها، جلسات الصالة، أوامر المطبخ (KDS)، مدفوعات التقسيم (Split Bill)، وورديات الكاشير والتقفيل الأعمى. |
| **10** | `AssetContext.tsx` | `useAssetDomain()` | إدارة الأصول الثابتة، فئات الأصول، قيود الشراء الآلية، إهلاك الأصول الشهري عبر RPC `run_monthly_depreciation`، وإعادة تقييم واستبعاد الأصول. |

> **الملف المساعد المشترك (`context/domains/domainUtils.ts`):**  
> يحتوي على دالة التحميل المجمّع بالدفعات `fetchAllTableRecords` التي تتجاوز سقف الـ 1,000 سجل الافتراضي في Supabase عبر التكرار الآلي (Pagination chunks) لضمان جلب كامل البيانات دون بتر.

---

### ب. نمط الواجهة الموحدة (`AccountingFacadeBridge`):
يعمل المكون `AccountingFacadeBridge` داخل `context/AccountingContext.tsx` كطبقة ربط هجينة:
1. يجمع مخرجات الـ 9 سياقات الفرعية عبر الـ Hooks الخاصة بها.
2. يدمج هذه المخرجات مع القيم المركزية لـ `coreValue`.
3. يغلف جميع الدوال والمصفوفات داخل كائن موحد `facadeValue: AccountingContextType`.
4. يوفره للمكونات عبر الهوك التاريخي `useAccounting()`.
> **النتيجة:** تعمل جميع الشاشات القديمة والحديثة بسلاسة دون الحاجة لتعديل أسطر الاستيراد في مئات الملفات.

---

### ج. الجرد الدقيق لما تبقى داخل `AccountingContext.tsx` (Remaining Audit):
الملف حالياً يبلغ **3,689 سطراً**. إليك التحديد الدقيق لما يزال موجوداً داخله وما يجب معرفته عند صيانته:

1. **إدارة الشركات المتعددة والمستأجرين (Multi-Tenant SaaS State):**
   - السطور (250–320): `organization`, `organizations`, `currentSelectedOrgId`, `setCurrentSelectedOrgId`, `effectiveOrgId`, `getEffectiveOrgId`, `deleteOrganization`.
   - الاستماع لحدث نافذة المتصفح `tripro:organization_changed` لمزامنة تغيير الشركة الفعالة بين التبويبات.
2. **ملف المستخدم النشط ونطاق الصلاحيات (Current User Profile & HR Scope):**
   - السطور (270–340): `currentUser` (الاسم، الدور الوظيفي، نطاق الـ HR، الخزائن المسموحة، نوع لوحة التحكم).
3. **حالات التحميل والمزامنة والذاكرة المؤقتة (Cache & Loading Orchestration):**
   - `isLoading`, `lastUpdated`, `clearCache`, `isDemo`, `activityLog`, `logActivity`.
   - دوال التحديث التبادلي عبر الـ `Promise.all`:
     - `handleRefreshData`: ينعش النطاقات التسعة دفعة واحدة.
     - `handleRefreshSalesAndPurchases`: يزامن المبيعات والمشتريات فقط.
     - `handleRefreshBankingAndShift`: يزامن الخزائن والورديات.
4. **نطاق الأصول الثابتة والإهلاك (Fixed Assets & Depreciation):**
   - الحالات والدوال: `assets`, `addAsset`, `updateAsset`, `deleteAsset`, `runDepreciation`, `revaluateAsset`.
   - *ملاحظة:* هذا النطاق هو الوحيد الذي لم يُفصل بعد إلى ملف مستقل (`AssetContext.tsx`) ومرشح للفصل مستقبلاً.
5. **دوال الصيانة المركزية وعمليات قاعدة البيانات (System Maintenance RPCs):**
   - `purgeDeletedRecords`: حذف السجلات المحذوفة ناعماً (Soft-deleted) نهائياً من قاعدة البيانات.
   - `refreshSaasSchema`: إنعاش كاش المخطط في Supabase بعد الهجرات.
   - `createMissingSystemAccounts`: التوليد التلقائي للحسابات النظامية الناقصة في شجرة الحسابات.
   - `recalculateAllBalances`: استدعاء RPC لإعادة احتساب أرصدة الأستاذ العام والموردين والعملاء.
   - `clearTransactions`, `emptyRecycleBin`, `restoreItem`, `permanentDeleteItem`.
   - `exportData`: التصدير الشامل للبيانات المالية إلى ملف JSON مشفر.
6. **دليل مستخدمي النظام ومسؤولي الفروع (SaaS Users List):**
   - `users`: قائمة حسابات النظام لإسناد المسؤوليات والفروع.
7. **محاكيات وأدوات الوضع التجريبي (Demo Mode Actions):**
   - `addDemoEntry`, `addDemoPaymentVoucher`, `addDemoReceiptVoucher`, `addDemoInvoice`, `postDemoSalesInvoice`, `addDemoPurchaseInvoice`.
8. **الدوال والبيانات الموروثة (Legacy Fallbacks - lines 400 to 3200):**
   - يحتوي جسم `AccountingProvider` على دالة التحميل الضخمة `fetchCompleteDataset` والتعريفات القديمة للدوال (مثل `addCustomer`, `updateCustomer`, `approveInvoice`...) التي كانت تعمل قبل نقل الثقل إلى ملفات النطاقات.
   - في الوقت الحالي، يقوم `AccountingFacadeBridge` بتجاوز (Override) هذه الدوال واستبدالها بدوال النطاقات المنفصلة.
   - **خارطة الطريق المستقبلية (Refactoring Roadmap):** حذف هذه الدوال الموروثة تدريجياً لتقليص `AccountingContext.tsx` من 3,689 سطر إلى أقل من **250 سطر** (Facade & Multi-tenant Router فقط).

---

## 3. المعادلات الذرية والعمليات غير القابلة للتجزئة (Atomic Operations & Formulas)
يعتمد نظام TriPro-ERP على فلسفة **قاعدة البيانات أولاً (Database-First)** لضمان السلامة المالية الكاملة ومنع أي تلاعب أو عدم اتساق عبر المعاملات الذرية (ACID Transactions) المنفذة داخل إجراءات PL/pgSQL:

### 1. حارس التوازن المحاسبي الذري (Database Balance Guard):
- **المعادلة:**
  $$\sum \text{Debit} - \sum \text{Credit} = 0 \quad (\text{مستوى التسامح: } 0.0001)$$
- **التنفيذ:** تريجر `database_balance_guard` مربوط بجدول `journal_entries` و `journal_entry_lines`.
- **السلوك:** أي محاولة لإدراج أو تعديل قيد محاسبي لا يتساوى فيه إجمالي المدين مع إجمالي الدائن يتم إجهاضها فوراً على مستوى قاعدة البيانات مع إطلاق خطأ `P0001: Unbalanced journal entry rejected`.

---

### 2. معادلة المتوسط المرجح لتكلفة المخزون الذرية (Weighted Average Cost - WAC):
- **المعادلة الرياضية:**
  $$\text{New WAC} = \frac{(\text{Current Qty} \times \text{Old WAC}) + (\text{Incoming Qty} \times \text{Incoming Unit Cost})}{\text{Current Qty} + \text{Incoming Qty}}$$
- **التنفيذ:** دالة `wac_recalculation_engine.sql` المستدعاة تلقائياً عند اعتماد فواتير المشتريات `save_and_post_purchase_invoice_atomic`.
- **الخصائص:** تدعم معالجة الكميات الصفرية والكميات السالبة التاريخية وتعيد ضبط تكلفة الصنف في جدول `products` بصورة ذرية.

---

### 3. معادلة معاملات تحويل الوحدات المتعددة (Multi-UOM Ratio):
- **المعادلة:**
  $$\text{Base Stock Quantity} = \text{Transaction Quantity} \times \text{UOM Conversion Factor}$$
- **التنفيذ:**
  - يتم تخزين المخزون الفعلي دائماً بالوحدة الأساسية للمخزن (`is_base = true`).
  - عند البيع أو الشراء بوحدات مركبة (علبة، كرتونة 6، كرتونة 12، بالتة)، تُضرب الكمية في معامل التحويل لتحديث حركات المخزون بدقة دون أي كسور ضائعة.

---

### 4. الحفظ والترحيل الذري لفواتير المبيعات (`save_and_post_sales_invoice_atomic`):
عملية ذرية واحدة (Single ACID Transaction) تضمن إما نجاح جميع العمليات أو التراجع الكامل (Rollback):
1. **حفظ الرأس والبنود:** إنشاء أو تحديث سجل الفاتورة في `invoices` وبنودها في `invoice_items`.
2. **خصم المخزون الذري:** حجز وخصم الكميات من `products` مع قفل السجلات لمنع تضارب المخزون (Pessimistic Locking).
3. **توليد وترحيل القيد المحاسبي المتوازن:**
   - **مدين:** حساب العميل (10201) أو الصندوق/البنك (10101 / 10102) بإجمالي الفاتورة.
   - **دائن:** حساب إيراد المبيعات (411) بصافي الفاتورة قبل الضريبة.
   - **دائن:** حساب ضريبة القيمة المضافة المستحقة (20205) بنسبة 14%.
   - **مدين:** تكلفة البضاعة المباعة (511) بسعر التكلفة WAC.
   - **دائن:** مخزون البضاعة التامة (10302) بسعر التكلفة WAC.
4. **تحديث رصيد العميل:** تعديل رصيد العميل وتاريخ آخر معاملة.

---

### 5. الحفظ والترحيل الذري لفواتير المشتريات (`save_and_post_purchase_invoice_atomic`):
عملية ذرية تضمن:
1. حفظ الفاتورة وبنودها.
2. زيادة المخزون الفعلي وإعادة احتساب تكلفة المتوسط المرجح WAC لكل صنف.
3. إنشاء القيد المحاسبي المزدوج:
   - **مدين:** حساب المخزون (10302) بالقيمة الصافية.
   - **مدين:** حساب ضريبة القيمة المضافة على المدخلات (10205) بنسبة 14%.
   - **دائن:** حساب المورد (20101) بإجمالي الفاتورة.
4. تحديث رصيد المورد التراكمي.

---

### 6. معادلة التقفيل الأعمى لورديات الكاشير وإثبات الفروقات (`close_cashier_shift_blind`):
- **حساب النقدية المتوقعة بالدرج (Expected Drawer Cash):**
  $$\text{Expected Cash} = \text{Opening Balance} + \text{Cash Sales} + \text{Cash In} - \text{Cash Drops} - \text{Cash Returns}$$
- **حساب الفارق المالي (Variance):**
  $$\text{Variance} = \text{Actual Cash Counted} - \text{Expected Cash}$$
  - **إذا كان الفارق سالباً (عجز):**
    - يُنشأ قيد محاسبي فوري:  
      **مدين:** حساب عجز الصندوق (515) | **دائن:** حساب النقدية بالصندوق (10101).
  - **إذا كان الفارق موجباً (زيادة):**
    - يُنشأ قيد محاسبي فوري:  
      **مدين:** حساب النقدية بالصندوق (10101) | **دائن:** حساب أرباح/زيادات الصندوق (415).
- تُقفل الوردية ويُمنع أي إدراج مستقبلي عليها برمز حماية مشفر.

---

### 7. المعاملات الذرية لحفظ المسودات (`save_sales_invoice_draft` & `save_purchase_invoice_draft`):
- تقوم الـ RPC بحفظ بيانات رأس الفاتورة وإدراج بنود الفاتورة وحذف أي بنود قديمة محذوفة (Orphan lines) في عملية واحدة، مع تحديث حقل `updated_at` ومشغلات التزامن.

---

### 8. معادلة إلغاء الترحيل الذرية الآمنة (`unpost_sales_invoice` / `unpost_purchase_invoice`):
- عند إلغاء ترحيل فاتورة مرحلة:
  1. يتم استرجاع/عكس حركات المخزون بدقة.
  2. يتم إلغاء القيد المحاسبي بتغيير حالته إلى `VOID` أو إنشاء قيد عكسي مطابق.
  3. يتم تعديل رصيد العميل أو المورد.
  4. تسجيل الحركة في سجل التدقيق الأمني غير القابل للحذف `audit_logs`.

---

### 9. معادلة استحقاق مكافأة نهاية الخدمة (قانون العمل المصري رقم 12 لسنة 2003):
- **معادلة سنوات الخدمة:**
  $$\text{Base Award} = (\text{أجر نصف شهر} \times \min(\text{السنوات}, 5)) + (\text{أجر شهر كامل} \times \max(0, \text{السنوات} - 5))$$
- **معامل سبب انتهاء الخدمة (نسبة الاستحقاق في حالة الاستقالة):**
  - أقل من سنتين خدمة: **0%** (لا يستحق مكافأة).
  - من سنتين إلى 5 سنوات: **33.3%** (ثلث المكافأة).
  - من 5 سنوات إلى 10 سنوات: **66.7%** (ثلثا المكافأة).
  - أكثر من 10 سنوات أو إنهاء من قبل الشركة أو بلوغ سن التقاعد: **100%** (المكافأة كاملة).

---

### 10. التشفير والربط مع منظومة الفاتورة الإلكترونية المصرية (ETA e-Invoicing):
- خوارزمية التوحيد القياسي (Canonicalization) لتمثيل بنود الفاتورة بصيغة JSON-LD المعيارية.
- حساب الضرائب المتراكبة: ضريبة القيمة المضافة (T1 - 14%)، وضريبة الخصم والتحصيل تحت حساب الضريبة (T4 - 1%)، وضريبة الجدول، وتوليد كود الـ UUID والتوقيع الرقمي.

---

## 4. منظومة الاختبارات الآلية الشاملة (Automated Test Suites)
يحتوي المشروع على بنية تحتية فائقة القوة للاختبارات التلقائية الموزعة على مستويين:
1. **اختبارات الوحدات والتكامل (Vitest):** **81 ملف اختبار أوتوماتيكي** تضم **452 اختباراً ناجحاً بنسبة 100%** دون أي فشل.
2. **اختبارات المتصفح الشاملة (Playwright E2E):** **7 أجنحة اختبارات دورة كاملة** تحاكي المستخدم الحقيقي في بيئة المتصفح المعزولة.

### أ. تصنيف وفهرس ملفات اختبارات Vitest (452 اختباراً):

| الفئة / المجال | ملفات الاختبار الأساسية | عدد الاختبارات | أهداف التحقق والضمان المالي |
| :--- | :--- | :---: | :--- |
| **السلامة المالية وحارس التوازن** | `tests/accounting/databaseBalanceGuard.test.ts`<br>`tests/accounting/journalEntryBalance.test.ts`<br>`tests/accounting/financialSafetyNet.test.ts`<br>`tests/accounting_engine.test.ts`<br>`tests/financialSafety.test.ts` | 42 | ضمان توازن القيد المزدوج، منع القيود العشوائية، وحظر الحركات غير المتزنة. |
| **حسابات وتكاليف الفواتير ومكافحة الازدواج** | `tests/accounting/salesInvoiceCalculation.test.ts`<br>`tests/accounting/purchaseInvoiceCalculation.test.ts`<br>`tests/accounting/customerPricingTier.test.ts`<br>`tests/purchases/purchaseInvoiceDuplication.test.ts`<br>`tests/double_submit_protection.test.ts` | 40 | حساب ضريبة القيمة المضافة، الخصومات المتعددة، فئات التسعير (جملة/قطاعي)، صمامات أمان النقر المزدوج المتزامن `isSubmittingRef`. |
| **المخزون ووحدات القياس وانحفاظ الكميات** | `tests/accounting/uomConversion.test.ts`<br>`tests/gs1_barcode_parser.test.ts`<br>`tests/inventory/InventoryCountDraft.test.ts`<br>`tests/inventory/multi_warehouse_transfer_integrity.test.ts` | 29 | معاملات تحويل الوحدات، قراءة باركودات GS1 والموازين، وحفظ مسودات الجرد المخزني، وانحفاظ كميات التحويل بين المستودعات. |
| **تقسيم وسياقات الـ Facade** | `tests/domain_facade_hooks.test.ts`<br>`tests/domain_providers_integration.test.tsx`<br>`tests/*_domain_hardening.test.tsx` (10 ملفات) | 69 | اختبار استقلالية السياقات العشرة، عزل الـ State، ومنع الـ Re-renders، وإلغاء الاستدعاءات الشبكية المكررة، وضمان عمل هوك `useAccounting()`. |
| **تكامل الـ RLS وعزل الشركات** | `tests/integration/01_rls_isolation.integration.test.ts`<br>`tests/integration/02_sales_invoice_cycle.integration.test.ts`<br>`tests/integration/03_accounting_integrity.integration.test.ts`<br>`tests/integration/04_purchase_invoice_cycle.integration.test.ts`<br>`tests/organization_isolation_rls.test.ts` | 45 | عزل بيانات كل مستأجر (Tenant) بنسبة 100% ومنع تسرب البيانات بين الشركات. |
| **الربط الضريبي والإقرار والتسوية** | `tests/accounting/etaCanonicalization.test.ts`<br>`tests/accounting/documentImmutability.test.ts`<br>`tests/zatcaQrHelper.test.ts`<br>`tests/accounting/vat_return_and_tax_netting.test.ts` | 27 | معايير الفاتورة المصرية ETA، وتشفير QR زاتكا، إقرار وتسوية ضريبة القيمة المضافة 14% وقيد الإقفال المتوازن `VAT-CLOSE-YYYYMMDD`. |
| **إقفال السنة والعملات الأجنبية** | `tests/financialYearService.test.ts`<br>`tests/accounting/currencyRevaluationService.test.ts`<br>`modules/accounting/components/CurrencyRevaluationModal.test.tsx` | 21 | إقفال الإيرادات والمصروفات بحساب الأرباح المحتجزة (302)، وفروق العملة المحققة وغير المحققة. |
| **الأصول الثابتة والشيكات** | `modules/assets/AssetManager.test.tsx`<br>`tests/asset_domain_hardening.test.tsx`<br>`modules/banking/ChequesPage.test.tsx`<br>`modules/finance/components/BankReconciliationForm.test.tsx` | 32 | احتساب الإهلاك الدوري للأصول، فك ارتباط نطاق الأصول، دورة حياة الشيك (تحصيل/ارتداد/تظهير)، والتسوية البنكية. |
| **الموارد البشرية ونهاية الخدمة** | `tests/hr/end_of_service.test.ts`<br>`tests/hr/employee_advance_smart.test.ts`<br>`tests/hr/payroll_name_search.test.ts`<br>`tests/hr/hr_custom_permissions.test.ts` | 32 | مكافأة نهاية الخدمة وفق القانون المصري، خصم السلف آلياً من الرواتب، وصلاحيات الـ HR. |
| **المطاعم والورديات والكاشير** | `tests/restaurant/restaurant_pos_flow.test.ts`<br>`modules/retail/components/POS/RetailPosScreen.test.tsx`<br>`tests/retail/pos_shift_financials_lifecycle.test.ts`<br>`modules/retail/services/promotionEngine.test.ts`<br>`tests/thermalPrinterService.test.ts` | 47 | تدفق الكاشير، فتح وقفل الورديات الأعمى، حسابات نقدية الدرج الحية والمسحوبات، عروض الترويج، والطباعة الحرارية للطلبات. |
| **المقاولات والقطاعات المتخصصة** | `tests/construction/progress_billing.test.ts`<br>`tests/stadium/stadium_engine.test.ts`<br>`tests/butcheringYield.test.ts`<br>`modules/hims/components/HospitalBillingEngine.test.tsx`<br>`tests/lenza_confectionery_e2e_workflows.test.ts` | 46 | المستخلصات ونسب الإنجاز، عضويات الملاعب، تشفية اللحوم والهوالك، وفاتورة المستشفيات. |
| **الأمان وسجل التدقيق والتيليميتري** | `tests/accounting/journalAuditService.test.ts`<br>`tests/accounting/auditDaemonService.test.ts`<br>`tests/reversal_and_security.test.ts`<br>`tests/phase3_security_and_audit.test.ts`<br>`tests/telemetryService.test.ts`<br>`utils/securityUtils.test.ts` | 33 | سجل العمليات، كشف التلاعب بالأرقام، تشفير التخزين الآمن، ومحرك التيليميتري ورصد انهيارات الواجهة الصامتة. |

---

### ب. أجنحة اختبارات المتصفح الشاملة (Playwright E2E Suites - `e2e/`):

| جناح الاختبار (Spec File) | المسار الكامل | سيناريو المحاكاة الفعلي للمستخدم |
| :--- | :--- | :--- |
| **دورة المبيعات المتكاملة** | `e2e/sales-cycle.spec.ts` | فتح شاشة البيع، اختيار العميل، مسح الصنف بالباركود، التحقق من تطبيق فئة السعر والضريبة، الترحيل المالي، والتحقق من توليد قيد اليومية وتحديث رصيد العميل. |
| **دورة المشتريات والمخزن** | `e2e/purchase-invoice.spec.ts` | إنشاء فاتورة شراء لمورد، إضافة الأصناف بالكرتونة، اعتماد الفاتورة، والتحقق من زيادة رصيد المخزن وإعادة احتساب المتوسط المرجح WAC. |
| **المطابقة والميزان المالي** | `e2e/financial-reconciliation.spec.ts` | سحب ميزان المراجعة، التحقق من توازن الأرصدة (المدين = الدائن)، ومطابقة حركة كشف حساب العميل مع القيود. |
| **دورة الأصول الثابتة** | `e2e/assets-integrity.spec.ts` | تسجيل أصل جديد، تشغيل الإهلاك الشهري التلقائي، والتحقق من قيد الإهلاك في الأستاذ العام. |
| **الأمان واختبار الشاشة البيضاء** | `e2e/smoke-white-screen.spec.ts` | المرور الآلي على أكثر من 50 شاشة في النظام للتأكد من عدم حدوث أخطاء White Screen أو انهيار React Error Boundary. |
| **تدفق تأسيس شركة جديدة** | `e2e/new-company-flow.spec.ts` | إنشاء شركة جديدة سحابياً، تخصيص شجرة الحسابات المصرية، وتهيئة الخزائن والمستودعات تلقائياً. |
| **تسجيل الدخول والصلاحيات** | `e2e/auth-screen.spec.ts` | محاكاة تسجيل الدخول، استعادة الجلسة بعد إعادة التحميل، وحجب الصفحات المحظورة عن المستخدمين غير المخولين. |

---

## 5. القطاعات التخصصية المدعومة (Industry Modules)
يحتوي TriPro ERP على 7 قطاعات أعمال تخصصية تعمل بتناغم تام مع المحرك المالي:
1. **المطاعم والكافيهات (`modules/restaurant/`):** نظام شاشات المطبخ (KDS)، نقاط البيع (POS)، تقسيم الحسابات، قفل الورديات الأعمى، وإدارة الوصفات والـ BOM.
2. **الهايبر ماركت والتجزئة (`modules/retail/`):** دعم الباركود الموزون، مسدسات الليزر، محرك العروض والخصومات، حظر البيع بأقل من التكلفة، وشاشات العملاء.
3. **المقاولات والاستثمار العقاري (`modules/construction/`):** جداول الكميات (BOQ)، مستخلصات المالك، مستخلصات مقاولي الباطن، دفعة مقدمة وتأمين أعمال (10%).
4. **المستشفيات والمراكز الطبية (`modules/hims/`):** الملف الطبي الموحد، العيادات الخارجية، الأقسام الداخلية، حجز العمليات، وفوترة التأمين الطبي.
5. **المصانع والتصنيع (`modules/manufacturing/`):** بطاقات الإنتاج (BOM)، مراكز التشغيل، أوامر التصنيع، وتوزيع تكاليف العمالة والكهرباء على المنتج التام.
6. **النوادي والملاعب الرياضية (`modules/stadium/`):** حجوزات الملاعب، الاشتراكات الشهرية، بطاقات الدخول بالـ QR، وعقود المدربين.
7. **الموارد البشرية المتقدمة (`modules/hr/`):** مسيرات الرواتب، أجهزة البصمة، السلف الآلية، والإجازات ونهاية الخدمة.

---

## 6. بروتوكول إدارة البيئات والنشر الآمن (Multi-Environment Protocol)
لضمان أقصى درجات الأمان لبيانات العملاء وبيئة الإنتاج الحقيقية:

### البيئات المعتمدة:
1. **بيئة الإنتاج النشطة لشركة لينزا (Lenza Confectionery):**
   - **المجلد المحلي:** `C:\Users\pc\Desktop\TriPro-ERP`
   - **قاعدة البيانات:** `jsgmrspnthtlsracbmcq.supabase.co`
   - **الرابط المباشر:** [tri-pro-erp-lenza.vercel.app](https://tri-pro-erp-lenza.vercel.app)
2. **بيئة الإنتاج العامة (Master Multi-Tenant Production):**
   - **المجلد المحلي:** `F:\نسخه منضبطه من البرنامج\نسخه 7 سبتمبر 2026\TriPro-Production`
   - **قاعدة البيانات:** `pjvphxfschfllpawfewn.supabase.co`
   - **الرابط المباشر:** [tri-pro-erp.vercel.app](https://tri-pro-erp.vercel.app)

### قواعد العمل المشددة:
- **تطبيق التحديثات المزدوج:** أي تعديل في الـ SQL أو الأعمدة البرمجية يجب تطبيقه على كلا القاعدتين فوراً.
- **النسخ الاحتياطي الإلزامي:** قبل أي ترقية هيكلية، يتم أخذ نسخة احتياطية كاملة عبر `pg_dump` وحفظها في مجلد `backups/`.
- **التدقيق الأمني الصارم:** لا يُسمح بإجراء البناء (`npm run build`) إلا بعد اجتياز فحص الأمان الشامل `npm run security-audit` بنتيجة (0 High, 0 Medium issues).

---

## 7. استراتيجية التسعير والباقات المعتمدة (Commercial Pricing Guide)
- **الباقة الأساسية (Core ERP):**
  - **اشتراك سنوي (SaaS):** 9,500 إلى 12,000 ج.م / سنوياً (شاملة 3 مستخدمين).
  - **ترخيص دائم (On-Premise):** 25,000 إلى 35,000 ج.م (+ 20% عقد صيانة سنوي).
- **الموديولات التخصصية (إضافات سنوية):**
  - موديول المطاعم والكافيهات: + 6,000 إلى 8,000 ج.م / سنة.
  - موديول الهايبر ماركت والتجزئة: + 4,500 إلى 6,000 ج.م / سنة.
  - موديول المقاولات والمستخلصات: + 12,000 إلى 16,000 ج.م / سنة.
  - موديول الملاعب والنوادي الرياضية: + 8,000 إلى 10,000 ج.م / سنة.
  - موديول المستشفيات والمراكز الطبية: + 15,000 إلى 22,000 ج.م / سنة.
  - موديول المصانع والتصنيع: + 10,000 إلى 14,000 ج.م / سنة.
  - موديول الموارد البشرية المتقدمة: + 4,000 إلى 5,500 ج.م / سنة.
- **رسوم التأسيس ورفع البيانات والتدريب:** 3,000 إلى 8,000 ج.م (تدفع لمرة واحدة).

---
*تم اعتماد هذا التوثيق ليكون الدليل المرجعي الكامل والمحدث للمطورين ولمساعد الذكاء الاصطناعي.*
