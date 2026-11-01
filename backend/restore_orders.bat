@echo off
chcp 65001 >nul
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo [ERROR] python not found in PATH.
  echo Please install Python and add it to PATH, then run again.
  pause
  exit /b 1
)

echo ===== 订单数据恢复 =====
python restore_orders.py --latest --backup-db --only restore_list.json --apply %*

echo.
echo ===== done =====
pause
