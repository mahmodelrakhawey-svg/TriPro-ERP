@echo off
chcp 65001 >nul
title TriPro ERP - Desktop Launcher
cd /d "%~dp0"
echo ========================================================
echo   جاري تشغيل نظام TriPro ERP...
echo ========================================================

REM 1. التأكد من تنظيف أي عمليات إلكترون عالقة في الخلفية
taskkill /F /IM electron.exe >nul 2>&1

REM 2. التحقق من وجود حزم الإنتاج
if not exist "dist\index.html" (
    echo.
    echo جاري بناء ملفات النظام لأول مرة...
    call npm run build
)

REM 3. تشغيل تطبيق سطح المكتب
echo بدء تشغيل التطبيق...
call npm run desktop:start

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ========================================================
    echo   توقف التطبيق مع رمز الخطأ: %ERRORLEVEL%
    echo ========================================================
    echo.
    echo يمكنك محاولة تشغيل النظام عبر المتصفح باستخدام TriPro-Web.bat
    pause
)
