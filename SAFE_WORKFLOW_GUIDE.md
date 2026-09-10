# 🛡️ دليل العمل الآمن وتوزيع البيئات (TriPro ERP Multi-Environment & Deployment Guide)

تم تسجيل وتثبيت هذا الدليل ليكون المرجع الأساسي المعتمد في جميع عمليات التطوير والرفع دون الحاجة للتذكير المتكرر.

---

## 🏗️ 1. خريطة البيئات وقواعد البيانات:

| البيئة | المجلد المحلي | قاعدة البيانات (Supabase) | النطاق المباشر على Vercel | الغرض والاستخدام |
| :--- | :--- | :--- | :--- | :--- |
| **التطوير / حلواني لينزا** | `C:\Users\pc\Desktop\TriPro-ERP` | `jsgmrspnthtlsracbmcq.supabase.co` | [tri-pro-erp-malak.vercel.app](https://tri-pro-erp-malak.vercel.app) | بيئة التطوير النشطة، والبيئة التشغيلية لشركة حلواني لينزا |
| **الإنتاج العام (Master)** | `F:\نسخه منضبطه من البرنامج\نسخه 7 سبتمبر 2026\TriPro-Production` | `pjvphxfschfllpawfewn.supabase.co` | [tri-pro-erp.vercel.app](https://tri-pro-erp.vercel.app) | بيئة الإنتاج العامة للنظام المربوطة بمستودع GitHub الرئيسي |

---

## 🔄 2. آلية العمل والرفع التلقائي (Standard Operating Procedure):

نظراً لأن مشروعي Vercel (`tri-pro-erp` و `tri-pro-erp-malak`) مرتبطان بنفس مستودع GitHub (`mahmodelrakhawey-svg/TriPro-ERP.git`) وكل منهما يستخدم متغيرات البيئة الخاصة بقاعدته:

1. **مرحلة التطوير والاختبار:**
   - يتم التطوير وإجراء التعديلات في مجلد: `C:\Users\pc\Desktop\TriPro-ERP`.
   - يتم اختبار الميزات والتحقق من `npm run build` ومطابقة الأنواع TypeScript.
   - يتم عمل Commit محلي لحفظ التعديلات في مجلد التطوير.

2. **مرحلة المزامنة والرفع (Sync & Deploy):**
   - عند اكتمال العمل، يتم تشغيل المزامنة إلى مجلد الإنتاج:
     ```powershell
     $SourceDir = "C:\Users\pc\Desktop\TriPro-ERP"
     $TargetDir = "F:\نسخه منضبطه من البرنامج\نسخه 7 سبتمبر 2026\TriPro-Production"
     $ExcludeFiles = @(".env", ".env.*", "npm-debug.log*")
     $ExcludeDirs  = @(".git", "node_modules", ".vercel", "dist", "scratch", ".vite")
     $roboParams = @($SourceDir, $TargetDir, "/E", "/XO", "/FFT", "/XF") + $ExcludeFiles + @("/XD") + $ExcludeDirs + @("/R:1", "/W:1", "/NP")
     robocopy @roboParams
     ```
   - يتم عمل Commit ثم `git push origin main` من مجلد الإنتاج:
     ```powershell
     git -C "F:\نسخه منضبطه من البرنامج\نسخه 7 سبتمبر 2026\TriPro-Production" add .
     git -C "F:\نسخه منضبطه من البرنامج\نسخه 7 سبتمبر 2026\TriPro-Production" commit -m "وصف التحديث"
     git -C "F:\نسخه منضبطه من البرنامج\نسخه 7 سبتمبر 2026\TriPro-Production" push origin main
     ```
   - **النتيجة التلقائية:** يقوم Vercel فوراً ببناء ونشر النسخة الجديدة لكل من:
     - موقع **حلواني لينزا** (`tri-pro-erp-malak.vercel.app`).
     - موقع **الإنتاج العام** (`tri-pro-erp.vercel.app`).

3. **تحديثات قاعدة البيانات (Database Migrations):**
   - أي ملف في `sql_updates/` يتم تطبيقه على:
     - قاعدة لينزا (`jsgmrspnthtlsracbmcq`) لتفعيل الميزات لدى العميل.
     - قاعدة الإنتاج (`pjvphxfschfllpawfewn`) لضمان تزامن الجداول.

