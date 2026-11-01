#!/bin/bash
# 一键恢复：从 SQLite 备份把 restore_list.json 里的订单还原为修改前的值
# 用法：
#   bash restore_orders.sh                # 自动选最新的 backups/backup_*.sqlite3
#   bash restore_orders.sh backup文件路径  # 指定备份文件
#   bash restore_orders.sh -y             # 跳过确认直接执行（干跑预览仍会先打印）
set -euo pipefail
cd "$(dirname "$0")"

DB="${DB:-data/lm.db}"
ONLY_FILE="restore_list.json"

# 解析参数
SKIP_CONFIRM=0
BACKUP=""
for a in "$@"; do
  case "$a" in
    -y|--yes) SKIP_CONFIRM=1 ;;
    -h|--help) echo "用法: bash restore_orders.sh [-y] [备份文件路径]"; exit 0 ;;
    *) BACKUP="$a" ;;
  esac
done

# 未指定备份文件时，自动选最新
if [ -z "$BACKUP" ]; then
  BACKUP=$(ls -t backups/backup_*.sqlite3 2>/dev/null | head -1 || true)
fi

echo "==================================================="
echo " 订单数据一键恢复"
echo "==================================================="

if [ -z "$BACKUP" ] || [ ! -f "$BACKUP" ]; then
  echo "[错误] 未找到备份文件。"
  echo "  请确认 backups/ 下存在 backup_*.sqlite3，或手动指定："
  echo "  bash restore_orders.sh backups/backup_YYYYMMDD_HHMMSS.sqlite3"
  exit 1
fi

if [ ! -f "$ONLY_FILE" ]; then
  echo "[错误] 未找到 $ONLY_FILE（要恢复的订单号列表）"
  exit 1
fi

if [ ! -f "$DB" ]; then
  echo "[错误] 未找到数据库 $DB"
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "[错误] 未找到 python3"
  exit 1
fi

echo "备份文件 : $BACKUP ($(du -h "$BACKUP" | cut -f1))"
echo "当前数据库: $DB ($(du -h "$DB" | cut -f1))"
echo "订单号列表: $ONLY_FILE"

# 校验备份文件非空（0 字节说明备份失效）
if [ ! -s "$BACKUP" ]; then
  echo "[错误] 备份文件为空(0字节)，备份无效，已中止。"
  exit 1
fi

echo ""
echo ">> 第 1 步：备份当前数据库"
TS=$(date +%Y%m%d_%H%M%S)
cp "$DB" "data/lm.db.bak_${TS}"
echo "   已备份到 data/lm.db.bak_${TS}"

echo ""
echo ">> 第 2 步：干跑预览（不写库）"
python3 restore_orders.py "$BACKUP" --db "$DB" --only "$ONLY_FILE"

echo ""
if [ "$SKIP_CONFIRM" = "1" ]; then
  echo ">> -y 已指定，跳过确认"
else
  read -r -p "确认执行恢复？输入 yes 继续，其它任意键取消: " ans
  if [ "$ans" != "yes" ]; then
    echo "已取消。"
    exit 0
  fi
fi

echo ""
echo ">> 第 3 步：执行恢复"
python3 restore_orders.py "$BACKUP" --db "$DB" --only "$ONLY_FILE" --apply

echo ""
echo "==================================================="
echo " 恢复完成。如需回滚：cp data/lm.db.bak_${TS} data/lm.db"
echo "==================================================="
