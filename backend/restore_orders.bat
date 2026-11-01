@echo off
cd /d "%~dp0"
chcp 65001 >nul
set PYTHONUTF8=1

where python >nul 2>nul
if errorlevel 1 goto nopython
set PYCMD=python
goto run

:nopython
where py >nul 2>nul
if errorlevel 1 goto nopython2
set PYCMD=py
goto run

:nopython2
echo [ERROR] Python not found in PATH.
echo Install Python and add it to PATH, then run again.
pause
exit /b 1

:run
echo ===== Restore orders =====
%PYCMD% restore_orders.py --latest --backup-db --only restore_list.json --apply %*
echo.
echo ===== done =====
pause
