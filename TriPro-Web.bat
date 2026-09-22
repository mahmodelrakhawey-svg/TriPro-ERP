@echo off
chcp 65001 >nul
title TriPro ERP - Web Launcher
cd /d "%~dp0"
echo ========================================================
echo   جاري تشغيل خادم TriPro ERP للمتصفح...
echo ========================================================
echo   الرابط: http://localhost:3000
echo ========================================================

REM فتح المتصفح تلقائياً بعد ثانيتين
start "" cmd /c "timeout /t 2 >nul & start http://localhost:3000"

REM تشغيل خادم التطوير
call npm run dev
pause
