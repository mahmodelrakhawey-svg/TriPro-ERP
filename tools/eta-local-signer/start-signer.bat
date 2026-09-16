@echo off
chcp 65001 > nul
title TriPro ERP - Local ETA Digital Signer Helper (Port 8500)
color 0A

echo ====================================================================
echo            TriPro ERP - خادم التوقيع الإلكتروني المحلي
echo                    بوابة مصلحة الضرائب المصرية
echo ====================================================================
echo.
echo [1/3] التحقق من بيئة تشغيل Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [خطأ] لم يتم العثور على برنامج Node.js مثبت على هذا الجهاز!
    echo يرجى تحميل وتثبيت Node.js (LTS) من الموقع الرسمي: https://nodejs.org
    echo بعد التثبيت، أعد تشغيل هذا الملف.
    echo.
    pause
    exit /b 1
)

echo [2/3] فحص فلاشة التوقيع الإلكتروني (USB Token / Smart Card)...
echo يرجى التأكد من توصيل فلاشة التوقيع (Egypt Trust أو Misr Clearing) بمنفذ الـ USB.
echo.

echo [3/3] جاري تشغيل خادم التوقيع على المنفذ 8500...
echo للإنهاء أو الإيقاف، اضغط Ctrl + C أو أغلق هذه النافذة.
echo ====================================================================
echo.

node "%~dp0server.js"

pause
