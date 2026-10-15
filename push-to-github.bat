@echo off
set "PATH=%PATH%;C:\Program Files\Git\cmd;C:\Program Files\Git\bin"
cd /d "%~dp0"

echo ========================================================
echo   TriPro ERP - Push to GitHub (origin/main)
echo ========================================================
echo.
git push -u origin main
echo.
echo ========================================================
echo   Finished. Press any key to exit.
echo ========================================================
pause
