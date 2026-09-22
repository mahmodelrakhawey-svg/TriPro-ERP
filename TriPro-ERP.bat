@echo off
setlocal
chcp 65001 >nul
title TriPro ERP - Desktop Launcher
cd /d "%~dp0"

echo ========================================================
echo   Starting TriPro ERP Desktop...
echo ========================================================

taskkill /F /IM electron.exe >nul 2>&1

if not exist "dist\index.html" (
    echo Building production bundles...
    call npm run build
)

echo Starting application...
call npm run desktop:start

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ========================================================
    echo   Process stopped with code: %ERRORLEVEL%
    echo ========================================================
    pause
)
