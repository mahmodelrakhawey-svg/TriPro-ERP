@echo off
cd /d "%~dp0"
node scripts/switch_db.mjs test
pause
