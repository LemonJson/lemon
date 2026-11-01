@echo off
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo [ERROR] python not found in PATH
  exit /b 1
)

python restore_orders.py --latest --backup-db --only restore_list.json --apply %*
if errorlevel 1 exit /b 1
