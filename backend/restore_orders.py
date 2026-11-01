#!/usr/bin/env python3
"""从 SQLite 备份文件只恢复「订单主表 orders」数据。

用法（在 backend/ 目录下运行）：
    # 干跑预览（不写库）
    python3 restore_orders.py backups/backup_20261029_120000.sqlite3 --mode restore

    # 确认后真正写入
    python3 restore_orders.py backups/backup_20261029_120000.sqlite3 --mode restore --apply

三种模式 --mode：
    restore(默认)：按 order_no 匹配，用备份值覆盖当前订单字段（把被批量修改的订单还原为修改前）
    merge        ：补回缺失订单 + 恢复软删除订单（不影响现有订单字段）
    replace      ：清空 orders 后整体用备份覆盖（会丢掉备份之后新增/修改的订单）

参数：
    backup          备份文件路径（backend/backups/backup_*.sqlite3）
    --db            当前数据库路径，默认 data/lm.db
    --only          只恢复指定订单号（文件：JSON 或每行一个订单号）
    --apply         加上才真正写库；否则只打印将执行的变更（干跑）

只恢复指定订单号示例：
    # 把上面接口返回的 JSON 存成文件（含 updated_nos 数组），再：
    python3 restore_orders.py backups/backup_xxx.sqlite3 --only restore_list.json --apply
"""
import argparse
import json
import sqlite3
import sys
from pathlib import Path


def get_columns(conn, table, schema="main"):
    rows = conn.execute(f'PRAGMA {schema}.table_info("{table}")').fetchall()
    return [r[1] for r in rows]  # r = (cid, name, type, notnull, default, pk)


def in_clause(n):
    return ",".join("?" * n)


def load_only_nos(path):
    """从文件读取要恢复的订单号列表。支持两种格式：
    - JSON：{"order_nos": [...]} 或 {"updated_nos": [...]} 或直接数组 [...]
    - 纯文本：每行一个订单号（自动忽略引号/逗号）
    """
    text = Path(path).read_text(encoding="utf-8").strip()
    nos = set()
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            for key in ("order_nos", "updated_nos", "updated", "nos"):
                arr = data.get(key)
                if isinstance(arr, list):
                    for n in arr:
                        if isinstance(n, str):
                            nos.add(n.strip())
        elif isinstance(data, list):
            for n in data:
                if isinstance(n, str):
                    nos.add(n.strip())
        if nos:
            return nos
    except (ValueError, TypeError):
        pass
    # 非 JSON（或 JSON 中没取到）时，按纯文本每行一个订单号解析
    for line in text.splitlines():
        line = line.strip().strip(",").strip('"').strip("'").strip()
        if line:
            nos.add(line)
    return nos


def main():
    ap = argparse.ArgumentParser(description="从 SQLite 备份只恢复 orders 表")
    ap.add_argument("backup")
    ap.add_argument("--db", default="data/lm.db")
    ap.add_argument("--mode", choices=["restore", "merge", "replace"], default="restore")
    ap.add_argument("--only", help="只恢复指定订单号（文件：JSON 或每行一个订单号）")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    backup = Path(args.backup)
    live = Path(args.db)
    if not backup.exists():
        sys.exit(f"[错误] 备份文件不存在：{backup}")
    if not live.exists():
        sys.exit(f"[错误] 当前数据库不存在：{live}")

    lv = sqlite3.connect(str(live))
    try:
        lv.execute("ATTACH DATABASE ? AS bk", (str(backup.resolve()),))
        live_cols = get_columns(lv, "orders", "main")
        bk_cols = get_columns(lv, "orders", "bk")
        common = [c for c in bk_cols if c in live_cols and c != "id"]
        if "order_no" not in common:
            sys.exit("[错误] 备份库中没有 order_no 列，无法匹配")

        col_list = ", ".join(common)
        bk_order_nos = [r[0] for r in lv.execute("SELECT order_no FROM bk.orders")]
        live_order_nos = [r[0] for r in lv.execute("SELECT order_no FROM orders")]
        live_set = set(live_order_nos)

        if args.mode == "replace":
            print(f"[replace] 将清空当前 {len(live_order_nos)} 条订单，导入备份的 {len(bk_order_nos)} 条订单")
            if args.apply:
                lv.execute("DELETE FROM orders")
                lv.execute(
                    f"INSERT INTO orders (id, {col_list}) "
                    f"SELECT id, {col_list} FROM bk.orders"
                )
                lv.commit()
                print(f"[完成] 已用备份覆盖 orders 表，共 {len(bk_order_nos)} 条")
            else:
                print("[干跑] 未写入（加 --apply 生效）")
            return

        if args.mode == "merge":
            to_insert_nos = [n for n in bk_order_nos if n not in live_set]
            to_undelete_nos = [n for n in bk_order_nos if n in live_set]
            undelete_count = 0
            if "deleted_at" in common and to_undelete_nos:
                undelete_count = lv.execute(
                    "SELECT count(*) FROM orders "
                    f"WHERE deleted_at IS NOT NULL AND order_no IN ({in_clause(len(to_undelete_nos))})",
                    to_undelete_nos,
                ).fetchone()[0]
            print(f"[merge] 备份共 {len(bk_order_nos)} 条订单")
            print(f"  缺失待补回：{len(to_insert_nos)} 条")
            print(f"  已软删除待恢复：{undelete_count} 条")
            if to_insert_nos:
                print("  补回示例：")
                for r in lv.execute(
                    f"SELECT {col_list} FROM bk.orders "
                    f"WHERE order_no IN ({in_clause(len(to_insert_nos))})",
                    to_insert_nos,
                ).fetchmany(5):
                    print("    ", r)
            if not args.apply:
                print("[干跑] 未写入（加 --apply 生效）")
                return
            if "deleted_at" in common and to_undelete_nos:
                lv.execute(
                    "UPDATE orders SET deleted_at = NULL "
                    f"WHERE deleted_at IS NOT NULL AND order_no IN ({in_clause(len(to_undelete_nos))})",
                    to_undelete_nos,
                )
            if to_insert_nos:
                lv.execute(
                    f"INSERT INTO orders ({col_list}) "
                    f"SELECT {col_list} FROM bk.orders "
                    f"WHERE order_no IN ({in_clause(len(to_insert_nos))})",
                    to_insert_nos,
                )
            lv.commit()
            print(f"[完成] 补回 {len(to_insert_nos)} 条，恢复软删除 {undelete_count} 条")
            return

        # restore 模式：按 order_no 匹配，用备份值覆盖当前订单字段
        # 覆盖的列 = 两库公共列，去掉 id / order_no（匹配键）/ deleted_at（保留当前删除状态）
        overwrite_cols = [c for c in common if c not in ("deleted_at", "order_no")]
        matched_nos = [n for n in bk_order_nos if n in live_set]

        only = None
        if args.only:
            if not Path(args.only).exists():
                sys.exit(f"[错误] --only 文件不存在：{args.only}")
            only = load_only_nos(args.only)
            not_in_backup = sorted(n for n in only if n not in set(bk_order_nos))
            not_in_live = sorted(n for n in only if n not in live_set)
            matched_nos = [n for n in matched_nos if n in only]
            print(f"[restore] --only 指定 {len(only)} 个订单号")
            if not_in_backup:
                print(f"  ⚠ 备份中不存在（跳过，{len(not_in_backup)} 个）：{', '.join(not_in_backup[:20])}"
                      + (" ..." if len(not_in_backup) > 20 else ""))
            if not_in_live:
                print(f"  ⚠ 当前库中不存在（跳过，{len(not_in_live)} 个）：{', '.join(not_in_live[:20])}"
                      + (" ..." if len(not_in_live) > 20 else ""))

        print(f"[restore] 备份共 {len(bk_order_nos)} 条，当前共 {len(live_order_nos)} 条")
        print(f"  将按 order_no 覆盖 {len(matched_nos)} 条订单的字段为备份值")
        print(f"  覆盖字段：{', '.join(overwrite_cols)}")
        if not matched_nos:
            print("  没有可还原的订单（备份与当前 order_no 无交集）")
            return

        # 干跑：打印前 5 条「当前 → 备份」差异示例
        print("  差异示例（当前值 → 备份值）：")
        shown = 0
        for no in matched_nos:
            if shown >= 5:
                break
            cur = lv.execute(
                "SELECT * FROM orders WHERE order_no = ?", (no,)
            ).fetchone()
            old = lv.execute(
                "SELECT * FROM bk.orders WHERE order_no = ?", (no,)
            ).fetchone()
            diffs = []
            for i, c in enumerate(live_cols):
                if c in ("id", "deleted_at"):
                    continue
                v_cur = cur[i] if i < len(cur) else None
                j = bk_cols.index(c) if c in bk_cols else -1
                v_old = old[j] if old is not None and j >= 0 else None
                if str(v_cur) != str(v_old):
                    diffs.append(f"{c}: {v_cur!r} → {v_old!r}")
            if diffs:
                shown += 1
                print(f"    {no}: " + "; ".join(diffs))

        if not args.apply:
            print("[干跑] 未写入（加 --apply 生效）")
            return

        # 逐条用备份值覆盖（循环方式最稳妥，避免相关子查询关联错误）
        set_clause = ", ".join(f"{c} = ?" for c in overwrite_cols)
        sel_cols = ", ".join(overwrite_cols)
        done = 0
        for no in matched_nos:
            old = lv.execute(
                f"SELECT {sel_cols} FROM bk.orders WHERE order_no = ?", (no,)
            ).fetchone()
            if old is None:
                continue
            lv.execute(f"UPDATE orders SET {set_clause} WHERE order_no = ?", (*old, no))
            done += 1
        lv.commit()
        print(f"[完成] 已还原 {done} 条订单为备份中的值")
    finally:
        lv.close()


if __name__ == "__main__":
    main()
