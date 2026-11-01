#!/bin/bash
# Linux/Mac 一键恢复（Windows 请用 restore_orders.bat）
# 自动选最新 .sqlite3 备份、先备份当前库、干跑预览、确认后执行。
# 追加 --yes 可跳过确认；追加「备份文件路径」可指定备份（覆盖 --latest）。
set -euo pipefail
cd "$(dirname "$0")"

PY=python3
command -v "$PY" >/dev/null 2>&1 || PY=python

exec "$PY" restore_orders.py --latest --backup-db --only restore_list.json --apply "$@"
