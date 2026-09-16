@echo off
title TriPro ERP - Desktop Launcher
cd /d "%~dp0"
echo ========================================================
echo   Starting TriPro ERP Desktop Application...
echo ========================================================
call npm run desktop:start
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ========================================================
    echo   Application stopped with code: %ERRORLEVEL%
    echo ========================================================
    pause
)
