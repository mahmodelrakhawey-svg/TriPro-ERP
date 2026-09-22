@echo off
setlocal
chcp 65001 >nul
title TriPro ERP - Web Launcher
cd /d "%~dp0"

echo ========================================================
echo   Starting TriPro ERP Web...
echo ========================================================
echo   URL: http://localhost:5173
echo ========================================================

start "" http://localhost:5173

call npm run dev
pause
