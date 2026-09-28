@echo off
setlocal
chcp 65001 >nul
title TriPro POS - نقطة بيع الكاشير المستقلة
cd /d "%~dp0"

echo ========================================================
echo   Starting TriPro POS (Dedicated Cashier Mode)...
echo ========================================================

taskkill /F /IM electron.exe >nul 2>&1

if not exist "dist\index.html" (
    echo Building production bundles...
    call npm run build
)

echo Starting POS Cashier...
call npm run pos:start

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ========================================================
    echo   Process stopped with code: %ERRORLEVEL%
    echo ========================================================
    pause
)
