# 🛡️ توثيق منظومة حماية قاعدة البيانات والتحصين الشامل (2026-11-26)

## 1. نظرة عامة
تم في هذا التحديث بناء وتفعيل **منظومة خطوط الدفاع الآلي (Schema Column Guard)** لضمان تطابق جميع استعلامات Supabase في الكود مع الجداول والأعمدة الفعلية في قاعدة بيانات الإنتاج بنسبة **100%**، ومنع رفع أو بناء أي تعديل يحتوي على اسم جدول أو عمود غير موجود قبل وصوله إلى الإنتاج.

---

## 2. خطوط الدفاع المطبّقة

| خط الدفاع | الآلية / الملف | الوظيفة |
| :--- | :--- | :--- |
| **1. المرجع الحي للقاعدة** | `supabase/schema_columns.json` | خريطة معتمدة بأسماء جميع الجداول والأعمدة الفعلية المصدّرة مباشرة من قاعدة الإنتاج (`information_schema.columns`). |
| **2. الفاحص الساكن الآلي** | `scripts/verify-code-schema.mjs` (`npm run schema-guard`) | يمسح ملفات `modules/` و `services/` و `context/` و `components/` و `utils/` ويفحص: أسماء الجداول في `.from('table')`، وأعمدة `.select(...)`، والفلاتر والترتيب (`.eq`, `.order`, `.in`, `.not`, `.is`, `.gt`, `.lte`, إلخ)، ومفاتيح `.insert({...})` و `.update({...})` و `.upsert({...})`. |
| **3. بوابة الاختبارات والبناء** | `tests/schema_column_guard.test.ts` و `package.json` | يعمل الفحص تلقائياً داخل `npm test` وكذلك كخطوة إجبارية في `npm run build` قبل `tsc` و `vite build`. |
| **4. بوابة الرفع والـ CI** | `.git/hooks/pre-commit` و `.github/workflows/ci.yml` | يمنع تنفيذ أي `git commit` محلياً أو اعتماد أي `push` / `pull_request` على `main` في GitHub Actions إذا وُجد عمود أو جدول غير مطابق. |

---

## 3. ملخص الإصلاحات التي تمت (Commits: `24176f0` → `e1764b9`)

### أ. إصلاح أخطاء الـ `400 Bad Request` المباشرة:
- **`modules/inventory/ExpiryClearanceRadar.tsx`**: استبدال `category` بـ `category_id` مع ربط اسم التصنيف من `categories` وإضافة `weighted_average_cost`.
- **`modules/inventory/GoodsReceiptManager.tsx`**: إزالة `vendor_id` من استعلام `purchase_orders` (العمود الصحيح `supplier_id`)، وإزالة `item_name, price, cost` من `purchase_order_items`.
- **`services/notificationService.ts`**: منع إرسال الحقول الاختيارية الفارغة (`expires_at`, `related_id`, `action_url`) ضمن `createNotificationsBatch` عندما تكون `undefined`.

### ب. أخطاء صامتة اكتشفها الحارس الآلي وتم إصلاحها عبر المديولات:
- **`modules/admin/PermissionsManager.tsx`**: إزالة `is_system` من `roles` و `is_sensitive, category` من `permissions`.
- **`modules/admin/UserPermissionsEditor.tsx`**: إزالة `email` من استعلام `profiles`.
- **`modules/banking/LettersOfCreditPage.tsx`**: تصحيح أعمدة `lc_expenses` إلى `invoice_ref, notes, journal_entry_id`.
- **`modules/construction/components/BillingManager.tsx`**: استبدال `item_code, description` بـ `item_name` في `project_boq`.
- **`modules/construction/components/SubcontractorBillingManager.tsx`**: استبدال `contract_number` بـ `contract_name` في `subcontractor_contracts` و `description` بـ `item_name` في `subcontractor_contract_items`.
- **`modules/construction/components/SiteAttachmentManager.tsx`**: إزالة `sub_billing_id` غير الموجود من `project_attachments`.
- **`modules/hims/pages/AdmissionManager.tsx`**: تصحيح `visit_date` إلى `admission_date, created_at` في `hims_visits`.
- **`modules/hims/pages/HIMSServicesManager.tsx`**: إزالة `category` و `description` غير الموجودين في `hims_radiology_types`.
- **`modules/inventory/ItemMovementReport.tsx`**: إزالة `uom_id` من استعلام `lc_receipt_items`.
- **`modules/restaurant/components/Management/NewButcheringOrderModal.tsx`**: تصحيح الترتيب في `purchase_invoice_items` إلى `id`.
- **`modules/sales/CustomerStatement.tsx`**: إزالة `cost_center_id` من استعلام `receipt_vouchers`.
- **`modules/accounting/AccountingDashboard.tsx`**: إزالة `current_stock` غير الموجود من تحديث `products` والإبقاء على `stock`.
- **`modules/accounting/FiscalYearClosing.tsx`**: إزالة `entry_type` غير الموجود من إدراج `journal_entries`.
- **`modules/admin/DataMigrationCenter.tsx`**: تصحيح أعمدة الأصول (`current_value`, `accumulated_depreciation_account_id`, `serial_number`) وإزالة `transaction_id` من `journal_entries`.
- **`modules/inventory/ProductManager.tsx`**: إزالة `updated_at` غير الموجود من تحديث `item_categories`.
- **`modules/inventory/utils/productExcelUtils.ts`**: تصحيح `p_stock` و `p_org_id` في إدراج `products` إلى `stock` و `organization_id`.
- **`modules/manufacturing/components/ManufacturingManager.tsx`**: إزالة `start_date` غير الموجود من `work_orders`.
- **`modules/purchases/SupplierBalanceReconciliation.tsx`**: تصحيح `debit_note_date` إلى `note_date` في `debit_notes`.
- **`modules/sales/CustomerBalanceReconciliation.tsx`**: تصحيح `voucher_date` إلى `receipt_date` في `receipt_vouchers`.
- **`modules/stadium/components/MemberManager.tsx`**: إزالة `status` غير الموجود من إدراج `stadium_subscriptions`.
- **`services/offlineService.ts`**: تصحيح `reference_id` إلى `related_document_id` و `related_document_type: 'pos_order'` في `journal_entries`.

---

## 4. طريقة تحديث المرجع مستقبلاً عند تعديل قاعدة البيانات
عند إضافة أي جدول جديد أو عمود جديد في قاعدة Supabase الإنتاجية، يُرجى تشغيل الاستعلام التالي في **Supabase SQL Editor** وحفظ الناتج داخل `supabase/schema_columns.json`:

```sql
SELECT jsonb_object_agg(table_name, cols)
FROM (
  SELECT table_name, jsonb_agg(column_name ORDER BY column_name) AS cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
  GROUP BY table_name
) t;
```

---

## 5. حالة التحقق النهائية
- `npm run security-audit`: **0 مشاكل** (حرجة / عالية / متوسطة).
- `npm run schema-guard`: **ناجح 100%** أمام قاعدة الإنتاج الحية.
- `npx tsc --noEmit`: **0 أخطاء**.
- `npx vitest run tests/schema_column_guard.test.ts`: **ناجح 100%**.
- `npm run build`: **ناجح بالكامل**.
