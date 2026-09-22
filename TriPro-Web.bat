@echo off
setlocal
chcp 65001 >nul
title TriPro ERP - Web Launcher
cd /d "%~dp0"

echo ========================================================
echo   Starting TriPro ERP Web...
echo ========================================================
echo   URL: http://localhost:3000
echo ========================================================

call npm run dev -- --open --port 3000
pause
