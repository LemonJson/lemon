@echo off
cd /d %~dp0
echo ==========================================
echo   LM订单管理系统 - 启动
echo ==========================================
echo.

REM 检查 Python
where python >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Python。
  echo        请先安装 Python 3.9 或更高版本，
  echo        安装时务必勾选 "Add Python to PATH"。
  echo.
  pause
  exit /b 1
)

REM 首次运行：创建虚拟环境
if not exist venv (
  echo 首次运行，正在创建虚拟环境（请稍候）...
  python -m venv venv
)

REM 激活虚拟环境
call venv\Scripts\activate.bat

REM 每次启动都安装依赖（已安装的会自动跳过）
python -m pip install --upgrade pip >nul 2>&1
echo 正在检查依赖...
python -m pip install -r requirements.txt
if errorlevel 1 (
  echo.
  echo [错误] 依赖安装失败，请检查网络后重新运行 run.bat。
  pause
  exit /b 1
)

echo.
echo 服务启动中，请访问: http://127.0.0.1:8000
echo 默认账号 admin / 密码 Lemon123#
echo 按 Ctrl+C 可停止服务
echo.
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
pause
