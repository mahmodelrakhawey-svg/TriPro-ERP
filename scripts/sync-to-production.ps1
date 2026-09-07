# ==============================================================================
# سكريبت النقل الآمن من بيئة التطوير إلى بيئة الإنتاج (TriPro Safe Sync)
# ==============================================================================
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$SourceDir = "C:\Users\pc\Desktop\TriPro-ERP"
$TargetDir = "F:\نسخه منضبطه من البرنامج\نسخه 7 سبتمبر 2026\TriPro-Production"

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "       🛡️ أداة النقل الآمن إلى مجلد الإنتاج          " -ForegroundColor Yellow
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "المصدر (التطوير): $SourceDir"
Write-Host "الهدف (الإنتاج) : $TargetDir"
Write-Host "-----------------------------------------------------"

if (-not (Test-Path $TargetDir)) {
    Write-Host "❌ خطأ: لم يتم العثور على مجلد الإنتاج في المسار المحدد!" -ForegroundColor Red
    exit 1
}

# قائمة الملفات والمجلدات المحظور نقلها نهائياً لحماية الإنتاج
$ExcludeFiles = @(".env", ".env.*", "npm-debug.log*")
$ExcludeDirs  = @(".git", "node_modules", ".vercel", "dist", "scratch", ".vite")

Write-Host "🔒 الملفات المستثناة إجبارياً من النقل لحماية الإنتاج:" -ForegroundColor Green
Write-Host "   - ملفات البيئة (.env) [لن تتغير قاعدة بيانات الإنتاج]"
Write-Host "   - مجلد .git [للحفاظ على مستودع الإنتاج وربط Vercel]"
Write-Host "   - مجلدات node_modules و dist و .vercel"
Write-Host "-----------------------------------------------------"

$confirmation = Read-Host "هل تريد بدء نقل التعديلات الآن؟ (اكتب y للموافقة)"
if ($confirmation -ne 'y' -and $confirmation -ne 'Y') {
    Write-Host "⚠️ تم إلغاء العملية." -ForegroundColor Yellow
    exit 0
}

Write-Host "⏳ جاري نقل الملفات المعدلة فقط بأمان..." -ForegroundColor Cyan

# استخدام robocopy الاحترافي
$roboParams = @(
    $SourceDir,
    $TargetDir,
    "/E",                # نسخ المجلدات الفرعية
    "/XO",               # استبعاد الملفات الأقدم
    "/FFT",              # ضبط دقة التوقيت
    "/XF"                # استبعاد ملفات معينة
) + $ExcludeFiles + @("/XD") + $ExcludeDirs + @("/R:1", "/W:1", "/NP")

& robocopy @roboParams

Write-Host "`n✅ اكتملت عملية المزامنة بنجاح!" -ForegroundColor Green
Write-Host "💡 الخطوة التالية:" -ForegroundColor Yellow
Write-Host "   1. إذا كان هناك تعديل في قاعدة البيانات، قم بتشغيل ملف SQL الخاص به من مجلد sql_updates على قاعدة الإنتاج."
Write-Host "   2. افتح مجلد الإنتاج وتأكد من عمل التطبيق محلياً."
Write-Host "   3. نفذ git push من مجلد الإنتاج لرفع التحديث لـ Vercel."
Write-Host "=====================================================" -ForegroundColor Cyan
