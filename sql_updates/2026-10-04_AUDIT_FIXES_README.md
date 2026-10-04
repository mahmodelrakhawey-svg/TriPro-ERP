# 🔐 حزمة إصلاحات الأمان والأداء — TriPro ERP Audit Fixes
**تاريخ الإصدار:** 2026-10-04  
**الأولوية:** حرجة — يُطبَّق فوراً بالترتيب المُدوَّن أدناه  
**المُعِد:** Antigravity AI Code Review & Security Audit

---

## ترتيب التطبيق (Apply in Order)

| # | اسم الملف | الأولوية | الوقت التقديري |
|---|-----------|---------|----------------|
| 1 | `2026-10-04_fix1_revoke_anon_and_accounting_periods_rls.sql` | 🔴 حرجة | 2 دقيقة |
| 2 | `2026-10-04_fix2_balance_guard_trigger_and_immutability.sql` | 🔴 حرجة | 2 دقيقة |
| 3 | `2026-10-04_fix3_remove_hardcoded_lenza_and_clean_approve_invoice.sql` | 🔴 حرجة | 2 دقيقة |
| 4 | `2026-10-04_fix4_public_menu_rls_and_rate_limit_store.sql` | 🟠 متوسطة | 3 دقائق |
| 5 | `2026-10-04_fix5_materialized_view_trial_balance_and_audit_log.sql` | 🟠 متوسطة | 5 دقائق |
| 6 | `2026-10-04_fix6_fx_revaluation_and_year_end_closing.sql` | 🟡 وظيفي | 5 دقائق |

---

## ما تم إصلاحه

### 🔴 FIX 1 — سحب صلاحيات `anon` + إصلاح RLS لـ accounting_periods
- **المشكلة:** أي زائر غير مصادق يمكنه استدعاء `approve_invoice` و`complete_pos_sale_atomic`
- **الإصلاح:** `REVOKE EXECUTE FROM anon` على 9 دوال مالية + سياسة RLS صحيحة لـ `accounting_periods`

### 🔴 FIX 2 — Balance Guard + Invoice Immutability + Fiscal Period Lock
- **المشكلة:** قيود محاسبية غير متوازنة يمكن إدراجها — فواتير مرحّلة يمكن تعديلها — لا قفل فعلي للفترات
- **الإصلاح:** 3 Triggers قاعدة بيانات: توازن القيد، حماية الفاتورة المرحّلة، قفل الفترات المقفلة

### 🔴 FIX 3 — إزالة Hardcoded "لينزا" + تنظيف approve_invoice
- **المشكلة:** اسم شركة عميل مُشفَّر في SQL function — ينكسر عند تغيير الاسم
- **الإصلاح:** قراءة `allow_negative_stock` من `company_settings` فقط + تحديث بيانات لينزا

### 🟠 FIX 4 — إصلاح Public Menu RLS + Rate Limiting حقيقي
- **المشكلة:** QR Menu يُظهر منتجات كل المستأجرين — Rate Limiting في ذاكرة عملية فقط
- **الإصلاح:** تقييد anon بمنظمات لها QR فعلي + جدول `rate_limit_store` في DB

### 🟠 FIX 5 — Materialized View لميزان المراجعة + جدول Audit Log حقيقي
- **المشكلة:** تقارير الميزان On-the-fly تُجمّد الواجهة — سجلات المراجعة في الذاكرة فقط
- **الإصلاح:** `mv_trial_balance` + `security_audit_logs` + `log_security_event()` RPC

### 🟡 FIX 6 — FX Revaluation (IAS 21) + Year-End Closing مُؤتمَت
- **المشكلة:** ميزات مؤسسية مفقودة لمعيار IAS 21 والإقفال السنوي
- **الإصلاح:** `run_fx_revaluation()` + `run_year_end_closing()` + جدول `fx_rates`

---

## ملفات TypeScript المُعدَّلة

| الملف | التعديل |
|-------|---------|
| [`utils/securityGuards.ts`](../utils/securityGuards.ts) | `sanitizeHtml` → OWASP HTML entity encoding كامل |
| [`utils/securityUtils.ts`](../utils/securityUtils.ts) | `hashPassword` → 310,000 iterations + `persistAuditLog()` جديدة |

---

## التحقق بعد التطبيق

```sql
-- 1. التحقق من سحب صلاحيات anon
SELECT grantee, routine_name, privilege_type
FROM information_schema.routine_privileges
WHERE routine_name = 'approve_invoice'
ORDER BY grantee;
-- يجب أن يظهر authenticated فقط

-- 2. التحقق من RLS على accounting_periods
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'accounting_periods';
-- يجب أن يظهر سياسة واحدة فقط: accounting_periods_tenant_isolation

-- 3. اختبار Balance Guard
BEGIN;
INSERT INTO journal_entries (transaction_date, description, status, organization_id, is_posted)
VALUES (NOW(), 'Test', 'draft', '<your-org-id>', false);
-- ثم حاول تحديث status إلى posted دون أسطر متوازنة — يجب أن يفشل!
ROLLBACK;

-- 4. التحقق من mv_trial_balance
SELECT COUNT(*) FROM mv_trial_balance;

-- 5. التحقق من fx_rates
SELECT COUNT(*) FROM fx_rates; -- 0 في البداية
```

---

## ملاحظات مهمة

> [!WARNING]
> بعد تطبيق FIX 1: إذا كان تطبيق الموبايل أو الـ POS يستخدم `anon key` مباشرة (بدون JWT)، سيتوقف عن العمل. تأكد من تمرير JWT Token في كل الطلبات.

> [!NOTE]
> Materialized View `mv_trial_balance` تحتاج Refresh دوري. استدع `refresh_trial_balance_mv()` بعد كل جلسة ترحيل كبيرة.

> [!TIP]
> `run_year_end_closing` يتطلب أن تكون جميع الفترات الشهرية مُقفَّلة قبل تشغيله. استخدم واجهة الفترات المحاسبية لإغلاقها أولاً.
