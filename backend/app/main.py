"""FastAPI 入口"""
import logging
import threading
import time
from datetime import datetime, timedelta
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from .config import CORS_ORIGINS
from .database import Base, engine, SessionLocal
from .routers import auth, users, customers, orders, master, data, dashboard, ai, order_templates, templates, logs, products, trash
from .seed import seed


def _setup_file_logging():
    """日志写入文件，每天一个文件（logs/app-YYYY-MM-DD.log），保留 365 天"""
    log_dir = Path(__file__).resolve().parent.parent / "logs"
    log_dir.mkdir(exist_ok=True)
    handler = TimedRotatingFileHandler(
        str(log_dir / "app.log"),
        when="midnight",
        interval=1,
        backupCount=365,
        encoding="utf-8",
    )
    handler.suffix = "%Y-%m-%d"
    handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
    handler.setLevel(logging.INFO)

    root = logging.getLogger()
    root.setLevel(logging.INFO)
    if not any(isinstance(h, TimedRotatingFileHandler) for h in root.handlers):
        root.addHandler(handler)

    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        lg = logging.getLogger(name)
        lg.setLevel(logging.INFO)
        lg.propagate = False
        if not any(isinstance(h, TimedRotatingFileHandler) for h in lg.handlers):
            lg.addHandler(handler)


_setup_file_logging()

Base.metadata.create_all(bind=engine)


def _migrate_schema():
    """幂等增量迁移（兼容 PostgreSQL / SQLite，create_all 不会给已有表加列）"""
    try:
        from sqlalchemy import inspect as sa_inspect
        insp = sa_inspect(engine)
        order_cols = {c["name"] for c in insp.get_columns("orders")}
        url_cols = {c["name"] for c in insp.get_columns("url")}
        tpl_cols = {c["name"] for c in insp.get_columns("template")}
        daily_cols = {c["name"] for c in insp.get_columns("daily_data")} if "daily_data" in insp.get_table_names() else set()
        wash_cols = {c["name"] for c in insp.get_columns("wash_name")} if "wash_name" in insp.get_table_names() else set()
        cust_cols = {c["name"] for c in insp.get_columns("customer")} if "customer" in insp.get_table_names() else set()
        th_cols = {c["name"] for c in insp.get_columns("tidabiao_history")} if "tidabiao_history" in insp.get_table_names() else set()
        cp_cols = {c["name"] for c in insp.get_columns("customer_price")} if "customer_price" in insp.get_table_names() else set()
        alert_cols = {c["name"] for c in insp.get_columns("alert")} if "alert" in insp.get_table_names() else set()
        bill_cols = {c["name"] for c in insp.get_columns("bill")} if "bill" in insp.get_table_names() else set()
        cr_cols = {c["name"] for c in insp.get_columns("customer_recharge")} if "customer_recharge" in insp.get_table_names() else set()
        sf_cols = {c["name"] for c in insp.get_columns("source_file")} if "source_file" in insp.get_table_names() else set()
        prod_cols = {c["name"] for c in insp.get_columns("product")} if "product" in insp.get_table_names() else set()
        ps_cols = {c["name"] for c in insp.get_columns("product_sale")} if "product_sale" in insp.get_table_names() else set()
        cat_cols = {c["name"] for c in insp.get_columns("category")} if "category" in insp.get_table_names() else set()
        plat_cols = {c["name"] for c in insp.get_columns("platform")} if "platform" in insp.get_table_names() else set()
        ch_cols = {c["name"] for c in insp.get_columns("channel")} if "channel" in insp.get_table_names() else set()
        op_cols = {c["name"] for c in insp.get_columns("operator")} if "operator" in insp.get_table_names() else set()
        user_cols = {c["name"] for c in insp.get_columns("sys_user")} if "sys_user" in insp.get_table_names() else set()
        with engine.begin() as conn:
            for col, ddl in [("created_by", "VARCHAR(50)"), ("updated_by", "VARCHAR(50)")]:
                if col not in user_cols:
                    conn.execute(text(f"ALTER TABLE sys_user ADD COLUMN {col} {ddl}"))
            for col, ddl in [
                ("task_id", "VARCHAR(100)"),
                ("duration", "VARCHAR(50)"),
                ("template_id", "INTEGER"),
                ("filename_rule", "VARCHAR(200)"),
                ("dist_config_json", "TEXT"),
                ("order_date", "DATE"),
                ("price", "NUMERIC(10, 4)"),
                ("secondary_agent", "VARCHAR(100)"),
                ("platform", "VARCHAR(100)"),
                ("tpl_id", "INTEGER"),
                ("group_name", "VARCHAR(100)"),
                ("export_filename", "VARCHAR(200)"),
                ("add_name", "BOOLEAN"),
                ("check_collision", "BOOLEAN"),
                ("batch_no", "VARCHAR(50)"),
                ("operator_id", "INTEGER"),
                ("dup_order_nos", "TEXT"),
                ("change_fields_json", "TEXT"),
                ("created_by", "VARCHAR(50)"),
                ("updated_by", "VARCHAR(50)"),
                ("stop_prev_order_date", "DATE"),
                ("stop_prev_end_date", "DATE"),
                ("customer_name", "VARCHAR(100)"),
                ("upstream_name", "VARCHAR(100)"),
                ("channel_name", "VARCHAR(100)"),
                ("operator_name", "VARCHAR(50)"),
                ("tpl_code", "VARCHAR(50)"),
                ("tpl_name", "VARCHAR(100)"),
                ("template_name", "VARCHAR(100)"),
            ]:
                if col not in order_cols:
                    conn.execute(text(f"ALTER TABLE orders ADD COLUMN {col} {ddl}"))
            if "name" not in url_cols:
                conn.execute(text("ALTER TABLE url ADD COLUMN name VARCHAR(200)"))
            if "platform_id" not in url_cols:
                conn.execute(text("ALTER TABLE url ADD COLUMN platform_id INTEGER"))
            if "description" not in tpl_cols:
                conn.execute(text("ALTER TABLE template ADD COLUMN description TEXT"))
            if "tpl_type" not in tpl_cols:
                conn.execute(text("ALTER TABLE template ADD COLUMN tpl_type VARCHAR(20)"))
            for col, ddl in [
                ("task_id", "VARCHAR(100)"),
                ("operator", "VARCHAR(50)"),
                ("source_file", "VARCHAR(500)"),
                ("updated_at", "TIMESTAMP"),
                ("customer", "VARCHAR(100)"),
                ("secondary_agent", "VARCHAR(100)"),
                ("channel", "VARCHAR(100)"),
                ("group_name", "VARCHAR(100)"),
                ("source_file_id", "INTEGER"),
                ("name", "VARCHAR(50)"),
                ("cat1", "VARCHAR(100)"),
                ("cat2", "VARCHAR(100)"),
                ("customer_id", "INTEGER"),
                ("upstream_id", "INTEGER"),
                ("channel_id", "INTEGER"),
                ("operator_id", "INTEGER"),
                ("price", "NUMERIC(10, 4)"),
                ("add_name", "BOOLEAN"),
                ("order_no", "VARCHAR(50)"),
                ("tpl_code", "VARCHAR(50)"),
                ("check_collision", "BOOLEAN"),
                ("status", "VARCHAR(20)"),
                ("order_date", "DATE"),
                ("end_date", "DATE"),
                ("upstream_price", "NUMERIC(10, 4)"),
            ]:
                if col not in daily_cols:
                    conn.execute(text(f"ALTER TABLE daily_data ADD COLUMN {col} {ddl}"))
            for col, ddl in [
                ("name", "VARCHAR(50)"),
                ("province", "VARCHAR(50)"),
                ("city", "VARCHAR(50)"),
                ("operator", "VARCHAR(50)"),
            ]:
                if col not in wash_cols:
                    conn.execute(text(f"ALTER TABLE wash_name ADD COLUMN {col} {ddl}"))
            for col, ddl in [
                ("start_date", "DATE"),
                ("end_date", "DATE"),
                ("bill_tpl_id", "INTEGER"),
            ]:
                if col not in cust_cols:
                    conn.execute(text(f"ALTER TABLE customer ADD COLUMN {col} {ddl}"))
            for col, ddl in [
                ("check_collision", "VARCHAR(10)"),
            ]:
                if col not in th_cols:
                    conn.execute(text(f"ALTER TABLE tidabiao_history ADD COLUMN {col} {ddl}"))
            for col, ddl in [
                ("operator_id", "INTEGER"),
            ]:
                if col not in cp_cols:
                    conn.execute(text(f"ALTER TABLE customer_price ADD COLUMN {col} {ddl}"))
            for col, ddl in [
                ("order_no", "VARCHAR(50)"),
                ("order_id", "INTEGER"),
            ]:
                if col not in alert_cols:
                    conn.execute(text(f"ALTER TABLE alert ADD COLUMN {col} {ddl}"))
            for col, ddl in [
                ("bill_type", "VARCHAR(20)"),
                ("target_name", "VARCHAR(200)"),
                ("detail_json", "TEXT"),
                ("created_by", "VARCHAR(50)"),
                ("updated_at", "TIMESTAMP"),
                ("updated_by", "VARCHAR(50)"),
            ]:
                if col not in bill_cols:
                    conn.execute(text(f"ALTER TABLE bill ADD COLUMN {col} {ddl}"))
            for col, ddl in [
                ("recharge_type", "VARCHAR(20)"),
                ("reason", "TEXT"),
                ("rate", "NUMERIC(14, 4)"),
                ("created_by", "VARCHAR(50)"),
            ]:
                if col not in cr_cols:
                    conn.execute(text(f"ALTER TABLE customer_recharge ADD COLUMN {col} {ddl}"))
            # 回填历史充值记录的汇率（amount_rmb / amount_u）
            conn.execute(text("UPDATE customer_recharge SET rate = ROUND(amount_rmb / amount_u, 4) "
                              "WHERE rate IS NULL AND amount_u IS NOT NULL AND amount_u != 0"))
            for col, ddl in [
                ("category", "VARCHAR(20)"),
            ]:
                if col not in sf_cols:
                    conn.execute(text(f"ALTER TABLE source_file ADD COLUMN {col} {ddl}"))
            for col, ddl in [
                ("category", "VARCHAR(50)"),
                ("source", "VARCHAR(20)"),
                ("purchase_price", "NUMERIC(14, 4)"),
            ]:
                if col not in prod_cols:
                    conn.execute(text(f"ALTER TABLE product ADD COLUMN {col} {ddl}"))
            if "code" not in cat_cols:
                conn.execute(text("ALTER TABLE category ADD COLUMN code VARCHAR(50)"))
            if "code" not in plat_cols:
                conn.execute(text("ALTER TABLE platform ADD COLUMN code VARCHAR(10)"))
            if "region" not in ps_cols:
                conn.execute(text("ALTER TABLE product_sale ADD COLUMN region VARCHAR(50)"))
            # 软删除（垃圾箱）时间戳
            for tbl, cols in [("orders", order_cols), ("bill", bill_cols), ("customer", cust_cols),
                              ("product", prod_cols), ("product_sale", ps_cols), ("category", cat_cols),
                              ("platform", plat_cols), ("channel", ch_cols), ("operator", op_cols)]:
                if "deleted_at" not in cols:
                    conn.execute(text(f"ALTER TABLE {tbl} ADD COLUMN deleted_at TIMESTAMP"))
            # bill.customer_id 改为可空（给「其他人」单独抽取）
            bill_customer_col = next((c for c in insp.get_columns("bill") if c["name"] == "customer_id"), None) if "bill" in insp.get_table_names() else None
            if bill_customer_col is not None and not bill_customer_col.get("nullable"):
                if engine.dialect.name == "postgresql":
                    conn.execute(text("ALTER TABLE bill ALTER COLUMN customer_id DROP NOT NULL"))
                else:
                    # SQLite：重建 bill 表使 customer_id 可空，并补全字段（detail_json/操作人/软删除等）
                    conn.execute(text("""
                        CREATE TABLE IF NOT EXISTS bill_new (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            customer_id INTEGER,
                            biz_date DATE NOT NULL,
                            purchase_qty INTEGER DEFAULT 0,
                            sales NUMERIC(14,2) DEFAULT 0,
                            balance NUMERIC(14,2) DEFAULT 0,
                            profit NUMERIC(14,2) DEFAULT 0,
                            bill_type VARCHAR(20) DEFAULT '分数据',
                            target_name VARCHAR(200),
                            detail_json TEXT,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            created_by VARCHAR(50),
                            updated_at TIMESTAMP,
                            updated_by VARCHAR(50),
                            deleted_at TIMESTAMP
                        )
                    """))
                    bill_cols = {c["name"] for c in insp.get_columns("bill")}
                    src_cols = [c for c in ["id", "customer_id", "biz_date", "purchase_qty", "sales",
                                            "balance", "profit", "bill_type", "target_name", "detail_json",
                                            "created_at", "created_by", "updated_at", "updated_by", "deleted_at"]
                                if c in bill_cols]
                    col_list = ", ".join(src_cols)
                    conn.execute(text(f"INSERT INTO bill_new ({col_list}) SELECT {col_list} FROM bill"))
                    conn.execute(text("DROP TABLE bill"))
                    conn.execute(text("ALTER TABLE bill_new RENAME TO bill"))
            # 去掉过严的唯一索引：同一任务可有多条不同 URL 的订单，重复判定交给「验重」逻辑（url+地区+运营商）
            conn.execute(text("DROP INDEX IF EXISTS uq_order_up_date_task"))
            conn.execute(text("DROP INDEX IF EXISTS uq_order_active_task"))
    except Exception as e:  # noqa
        print(f"[migrate] 跳过: {e}")


def _ensure_indexes():
    """给大表补关键索引（幂等，启动时自动创建，避免全表扫描）"""
    indexes = [
        ("idx_daily_data_phone", "daily_data", "phone"),
        ("idx_daily_data_biz_date", "daily_data", "biz_date"),
        ("idx_daily_data_task_id", "daily_data", "task_id"),
        ("idx_orders_task_id", "orders", "task_id"),
    ]
    try:
        with engine.begin() as conn:
            for name, table, col in indexes:
                conn.execute(text(f'CREATE INDEX IF NOT EXISTS "{name}" ON "{table}" ("{col}")'))
    except Exception as e:  # noqa
        print(f"[indexes] 跳过: {e}")


def _backfill_tpl_types():
    """给已有模版回填模版类型（订单/出数/账单/其他）"""
    try:
        from .models import Template
        db = SessionLocal()
        try:
            for t in db.query(Template).filter((Template.tpl_type.is_(None)) | (Template.tpl_type == "")).all():
                name = f"{t.ttype or ''} {t.code or ''}"
                if "出数" in name:
                    t.tpl_type = "出数"
                elif "账单" in name:
                    t.tpl_type = "账单"
                elif any(k in name for k in ("提单", "改单", "停单", "导入导出", "订单")):
                    t.tpl_type = "订单"
                else:
                    t.tpl_type = "其他"
            db.commit()
        finally:
            db.close()
    except Exception as e:  # noqa
        print(f"[backfill tpl_type] 跳过: {e}")


def _migrate_mb019_collision():
    """给 MB-019 模版在「是否加名」后插入「是否撞库」列并重建下拉框（幂等）"""
    try:
        import io as _io
        import openpyxl
        from openpyxl.utils import get_column_letter
        from openpyxl.worksheet.datavalidation import DataValidation
        from .models import Template
        db = SessionLocal()
        try:
            t = db.query(Template).filter(Template.code == "MB-019").first()
            if not t or not t.file_data:
                return
            wb = openpyxl.load_workbook(_io.BytesIO(bytes(t.file_data)))
            ws = wb.active
            headers = [ws.cell(row=1, column=c).value for c in range(1, ws.max_column + 1)]
            if any(h is not None and "是否撞库" in str(h) for h in headers):
                return
            add_name_col = next((c for c, h in enumerate(headers, 1) if h is not None and "是否加名" in str(h)), None)
            if add_name_col is None:
                return
            ws.insert_cols(add_name_col + 1)
            ws.cell(row=1, column=add_name_col + 1, value="是否撞库")
            from openpyxl.styles import Alignment
            ws.cell(row=1, column=add_name_col + 1).alignment = Alignment(horizontal="center", vertical="center")
            ws.column_dimensions[get_column_letter(add_name_col + 1)].width = 13
            # 重建下拉框（insert_cols 不会自动平移数据验证范围）
            ws.data_validations.dataValidation.clear()
            dropdowns = {
                "状态": "未提,在执,改单,待停,已停",
                "甲方": "新,牛",
                "是否加名": "是,否",
                "是否撞库": "是,否",
                "渠道": "106,小程序,直播间,dpi-白,dpi-灰,dpi-黑",
                "运营商": "移动,电信,联通",
            }
            new_headers = [ws.cell(row=1, column=c).value for c in range(1, ws.max_column + 1)]
            for c, h in enumerate(new_headers, 1):
                if not h:
                    continue
                hs = str(h).replace("\n", "").strip()
                for label, formula in dropdowns.items():
                    if hs == label:
                        dv = DataValidation(type="list", formula1=f'"{formula}"', allow_blank=True)
                        ws.add_data_validation(dv)
                        dv.add(f"{get_column_letter(c)}2:{get_column_letter(c)}1001")
                        break
            bio = _io.BytesIO()
            wb.save(bio)
            t.file_data = bio.getvalue()
            db.commit()
        finally:
            db.close()
    except Exception as e:  # noqa
        print(f"[migrate mb019 collision] 跳过: {e}")


def _sync_mb019_channel_dropdown():
    """MB-019 模版「渠道」下拉框动态同步当前渠道（含后加的 dpi-黑 等），每次启动执行（幂等）"""
    try:
        import io as _io
        import openpyxl
        from openpyxl.utils import get_column_letter
        from openpyxl.worksheet.datavalidation import DataValidation
        from .models import Template, Channel
        db = SessionLocal()
        try:
            t = db.query(Template).filter(Template.code == "MB-019").first()
            if not t or not t.file_data:
                return
            channels = [c.name.strip() for c in db.query(Channel).order_by(Channel.id).all()
                        if c.name and c.name.strip()]
            if not channels:
                return
            wb = openpyxl.load_workbook(_io.BytesIO(bytes(t.file_data)))
            ws = wb.active
            headers = [ws.cell(row=1, column=c).value for c in range(1, ws.max_column + 1)]
            if not any(h is not None and str(h).replace("\n", "").strip() == "渠道" for h in headers):
                return
            ch_col = next((c for c, h in enumerate(headers, 1) if h is not None and str(h).replace("\n", "").strip() == "渠道"), None)
            ch_letter = get_column_letter(ch_col)
            desired = ",".join(channels)
            # 已一致则跳过，避免无谓写库
            current = None
            for dv in ws.data_validations.dataValidation:
                sq = str(dv.sqref or "")
                if sq.startswith(ch_letter + "2:") or (":" in sq and sq.split(":")[0].rstrip("0123456789") == ch_letter):
                    current = (dv.formula1 or "").strip('"')
                    break
            if current == desired:
                return
            dropdowns = {
                "状态": "未提,在执,改单,待停,已停",
                "甲方": "新,牛",
                "加名": "是,否",
                "撞库": "是,否",
                "渠道": desired,
                "运营商": "移动,电信,联通",
            }
            ws.data_validations.dataValidation.clear()
            for c, h in enumerate(headers, 1):
                if not h:
                    continue
                hs = str(h).replace("\n", "").strip()
                for label, formula in dropdowns.items():
                    if hs == label:
                        dv = DataValidation(type="list", formula1=f'"{formula}"', allow_blank=True)
                        ws.add_data_validation(dv)
                        dv.add(f"{get_column_letter(c)}2:{get_column_letter(c)}1001")
                        break
            bio = _io.BytesIO()
            wb.save(bio)
            t.file_data = bio.getvalue()
            db.commit()
        finally:
            db.close()
    except Exception as e:  # noqa
        print(f"[sync mb019 channel dropdown] 跳过: {e}")


def _migrate_mb019_remove_cols():
    """MB-019 模版去掉「甲方订单号」「二级代理」两列，并把表头规范为简称，重建下拉框（幂等）"""
    target_headers = ["开始", "截止", "更新", "状态", "甲方", "订单号", "代理", "定价", "平台",
                      "小组", "模版", "加名", "撞库", "渠道", "运营商", "任务名", "url", "数量", "时长",
                      "下限", "上限", "pv", "省份", "排除省份", "地市", "排除地市"]
    try:
        import io as _io
        import openpyxl
        from openpyxl.utils import get_column_letter
        from openpyxl.worksheet.datavalidation import DataValidation
        from .models import Template, Channel
        db = SessionLocal()
        try:
            t = db.query(Template).filter(Template.code == "MB-019").first()
            if not t or not t.file_data:
                return
            wb = openpyxl.load_workbook(_io.BytesIO(bytes(t.file_data)))
            ws = wb.active
            headers = [ws.cell(row=1, column=c).value for c in range(1, ws.max_column + 1)]

            def _norm(h):
                return str(h).replace("\n", "").strip() if h else ""

            remove_names = {"甲方订单号", "二级代理"}
            changed = False
            for c in sorted([c for c, h in enumerate(headers, 1) if _norm(h) in remove_names], reverse=True):
                ws.delete_cols(c, 1)
                changed = True
            # 表头规范为简称
            cur = [_norm(ws.cell(row=1, column=c).value) for c in range(1, ws.max_column + 1)]
            if cur != target_headers:
                for i, name in enumerate(target_headers, 1):
                    ws.cell(row=1, column=i, value=name)
                changed = True
            if not changed:
                return
            # 删列/改表头后数据验证范围会错位，重建下拉框
            channels = [c.name.strip() for c in db.query(Channel).order_by(Channel.id).all()
                        if c.name and c.name.strip()]
            dropdowns = {
                "状态": "未提,在执,改单,待停,已停",
                "甲方": "新,牛",
                "加名": "是,否",
                "撞库": "是,否",
                "渠道": ",".join(channels) if channels else "106,小程序,直播间,dpi-白,dpi-灰,dpi-黑",
                "运营商": "移动,电信,联通",
            }
            ws.data_validations.dataValidation.clear()
            for c, h in enumerate(target_headers, 1):
                hs = _norm(h)
                for label, formula in dropdowns.items():
                    if hs == label:
                        dv = DataValidation(type="list", formula1=f'"{formula}"', allow_blank=True)
                        ws.add_data_validation(dv)
                        dv.add(f"{get_column_letter(c)}2:{get_column_letter(c)}1001")
                        break
            bio = _io.BytesIO()
            wb.save(bio)
            t.file_data = bio.getvalue()
            db.commit()
        finally:
            db.close()
    except Exception as e:  # noqa
        print(f"[migrate mb019 remove cols] 跳过: {e}")


def _dedup_channels():
    """合并重复渠道名（含首尾空格差异；保留最小 id，重定向订单/URL/客户单价引用，删除重复渠道）"""
    try:
        from .models import Channel, Order, Url, CustomerPrice
        db = SessionLocal()
        try:
            groups = {}
            for ch in db.query(Channel).order_by(Channel.id).all():
                key = (ch.name or "").strip()
                groups.setdefault(key, []).append(ch)
            for key, rows in groups.items():
                if len(rows) <= 1:
                    continue
                keep = rows[0]
                for dup in rows[1:]:
                    db.query(Order).filter(Order.channel_id == dup.id).update(
                        {"channel_id": keep.id}, synchronize_session=False)
                    db.query(Url).filter(Url.channel_id == dup.id).update(
                        {"channel_id": keep.id}, synchronize_session=False)
                    for cp in db.query(CustomerPrice).filter(CustomerPrice.channel_id == dup.id).all():
                        existing = db.query(CustomerPrice).filter(
                            CustomerPrice.customer_id == cp.customer_id,
                            CustomerPrice.channel_id == keep.id).first()
                        if existing:
                            existing.price = cp.price
                            db.delete(cp)
                        else:
                            cp.channel_id = keep.id
                    db.delete(dup)
            # 清理客户单价重复（同客户+同渠道+同运营商）
            cgroups = {}
            for cp in db.query(CustomerPrice).order_by(CustomerPrice.id).all():
                cgroups.setdefault((cp.customer_id, cp.channel_id, cp.operator_id), []).append(cp)
            for k, rows in cgroups.items():
                if len(rows) <= 1:
                    continue
                for dup in rows[:-1]:
                    db.delete(dup)
            db.commit()
        finally:
            db.close()
    except Exception as e:  # noqa
        print(f"[dedup channels] 跳过: {e}")


_migrate_schema()
_ensure_indexes()
_backfill_tpl_types()
_migrate_mb019_collision()
_migrate_mb019_remove_cols()
_sync_mb019_channel_dropdown()
_dedup_channels()

app = FastAPI(title="LM订单管理系统")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(customers.router)
app.include_router(orders.router)
app.include_router(master.router)
app.include_router(data.router)
app.include_router(dashboard.router)
app.include_router(ai.router)
app.include_router(order_templates.router)
app.include_router(templates.router)
app.include_router(logs.router)
app.include_router(products.router)
app.include_router(trash.router)


def _scheduler_loop():
    """每天按配置时间执行一次预警扫描（含停单提醒、通知、账单预警、自动消警）"""
    from .routers.data import run_alert_scan
    from .models import SysConfig
    while True:
        # 读取预警检查时间（默认 10:00）
        try:
            db = SessionLocal()
            cfg = db.query(SysConfig).filter(SysConfig.key == "stop_check_time").first()
            trigger = cfg.value if cfg and cfg.value else "10:00"
            db.close()
        except Exception:  # noqa
            trigger = "10:00"
        try:
            hh, mm = [int(x) for x in trigger.split(":")]
        except Exception:  # noqa
            hh, mm = 10, 0
        now = datetime.now()
        next_run = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
        if next_run <= now:
            next_run += timedelta(days=1)
        time.sleep((next_run - now).total_seconds())
        try:
            db = SessionLocal()
            run_alert_scan(db)
            db.close()
            print(f"[scheduler] 预警扫描完成（触发时间 {trigger}）")
        except Exception as e:  # noqa
            print(f"[scheduler] 执行异常: {e}")
        time.sleep(60)  # 防止重复触发


def _agent_order_snapshot_loop():
    """每天 23:55 快照各代理在执订单数"""
    from .routers.dashboard import snapshot_agent_orders
    while True:
        now = datetime.now()
        next_run = now.replace(hour=23, minute=55, second=0, microsecond=0)
        if next_run <= now:
            next_run += timedelta(days=1)
        time.sleep((next_run - now).total_seconds())
        try:
            db = SessionLocal()
            n = snapshot_agent_orders(db)
            db.close()
            print(f"[snapshot] 在执订单快照完成：{n} 个代理")
        except Exception as e:  # noqa
            print(f"[snapshot] 快照异常: {e}")
        time.sleep(60)  # 防止重复触发


def _backup_loop():
    """每天按配置时间执行一次数据库备份（仅保留近 N 天）"""
    from .models import SysConfig
    from .backup import backup_database
    while True:
        try:
            db = SessionLocal()
            cfg = db.query(SysConfig).filter(SysConfig.key == "backup_time").first()
            trigger = cfg.value if cfg and cfg.value else "12:00"
            keep_cfg = db.query(SysConfig).filter(SysConfig.key == "backup_keep_days").first()
            keep_days = int(keep_cfg.value) if keep_cfg and (keep_cfg.value or "").strip().isdigit() else 7
            db.close()
        except Exception:  # noqa
            trigger = "12:00"
            keep_days = 7
        try:
            hh, mm = [int(x) for x in trigger.split(":")]
        except Exception:  # noqa
            hh, mm = 12, 0
        now = datetime.now()
        next_run = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
        if next_run <= now:
            next_run += timedelta(days=1)
        time.sleep((next_run - now).total_seconds())
        try:
            dest = backup_database(keep_days=keep_days)
            print(f"[backup] 数据库备份完成：{dest}")
        except Exception as e:  # noqa
            print(f"[backup] 备份异常: {e}")
        time.sleep(60)  # 防止重复触发


def _trash_cleanup_loop():
    """每天按配置时间清理垃圾箱中超过保留天数的数据"""
    from .models import SysConfig
    from .routers.trash import cleanup_expired_trash
    while True:
        try:
            db = SessionLocal()
            cfg = db.query(SysConfig).filter(SysConfig.key == "trash_cleanup_time").first()
            trigger = cfg.value if cfg and cfg.value else "03:00"
            keep_cfg = db.query(SysConfig).filter(SysConfig.key == "trash_retention_days").first()
            keep_days = int(keep_cfg.value) if keep_cfg and (keep_cfg.value or "").strip().isdigit() else 30
            db.close()
        except Exception:  # noqa
            trigger = "03:00"
            keep_days = 30
        try:
            hh, mm = [int(x) for x in trigger.split(":")]
        except Exception:  # noqa
            hh, mm = 3, 0
        now = datetime.now()
        next_run = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
        if next_run <= now:
            next_run += timedelta(days=1)
        time.sleep((next_run - now).total_seconds())
        try:
            db = SessionLocal()
            purged, skipped = cleanup_expired_trash(db, keep_days)
            db.close()
            print(f"[trash] 垃圾箱清理完成：清除 {purged} 条，跳过 {skipped} 条")
        except Exception as e:  # noqa
            print(f"[trash] 清理异常: {e}")
        time.sleep(60)  # 防止重复触发


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"code": exc.status_code, "data": None, "msg": exc.detail})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    msgs = []
    for err in exc.errors():
        loc = ".".join(str(x) for x in err.get("loc", []) if x not in ("body", "query", "path"))
        m = err.get("msg", "")
        msgs.append(f"{loc}: {m}" if loc else m)
    return JSONResponse(status_code=422, content={"code": 422, "data": None, "msg": "；".join(msgs) or "请求参数错误"})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logging.getLogger("uvicorn.error").error("未处理异常", exc_info=exc)
    return JSONResponse(status_code=500, content={"code": 500, "data": None, "msg": "服务器内部错误，详情见日志"})


def _backfill_cat_plat_codes(db):
    """给二级品类补拼音首字母编号、平台补 4 位数字编号（已有编号的跳过）"""
    from .models import Category, Platform
    from pypinyin import pinyin, Style
    # 二级品类编号
    used = set()
    for c in db.query(Category).filter(Category.level == 2).order_by(Category.id).all():
        if c.code:
            used.add(c.code)
            continue
        base = "".join((p[0] if p else "") for p in pinyin(c.name or "", style=Style.FIRST_LETTER)).lower()
        code = base or f"c{c.id}"
        n = 2
        while code in used:
            code = f"{base}{n}"
            n += 1
        c.code = code
        used.add(code)
    # 平台编号（4 位数字，全局唯一）
    plat_used = {p.code for p in db.query(Platform).filter(Platform.code.isnot(None), Platform.code != "").all()}
    for p in db.query(Platform).filter((Platform.code.is_(None)) | (Platform.code == "")).order_by(Platform.id).all():
        code = ""
        for num in range(1, 10000):
            c = f"{num:04d}"
            if c not in plat_used:
                code = c
                plat_used.add(c)
                break
        p.code = code or None
    db.commit()


def _backfill_daily_group(db):
    """按任务id回填日活数据的小组（订单来源），仅补空值，幂等"""
    from sqlalchemy import or_
    from .models import DailyData, Order
    orders = {o.task_id: o.group_name for o in db.query(Order).filter(
        Order.task_id.isnot(None), Order.group_name.isnot(None), Order.group_name != "").all()}
    if not orders:
        return
    tids = db.query(DailyData.task_id).filter(
        DailyData.task_id.isnot(None), DailyData.task_id != "",
        or_(DailyData.group_name.is_(None), DailyData.group_name == "")).distinct().all()
    updated = 0
    for (tid,) in tids:
        g = orders.get(tid)
        if g:
            updated += db.query(DailyData).filter(
                DailyData.task_id == tid,
                or_(DailyData.group_name.is_(None), DailyData.group_name == "")).update(
                {"group_name": g}, synchronize_session=False)
    if updated:
        db.commit()
        print(f"[backfill] 日活小组回填 {updated} 条")


def _migrate_upstream_codes(db):
    """上游客户编号调整：990001->110001、990002->110002
    旧客户停用、外键数据迁移到新客户（幂等：旧客户已停用则跳过）"""
    from .models import (Customer, Order, Bill, CustomerRecharge, CustomerPrice,
                         ProductSale, Alert, Url)
    mapping = {"990001": "110001", "990002": "110002"}
    changed = False
    for old_code, new_code in mapping.items():
        old = db.query(Customer).filter(Customer.code == old_code).first()
        if not old or old.status == 0:
            continue
        new = db.query(Customer).filter(Customer.code == new_code).first()
        if not new:
            new = Customer(code=new_code, name=old.name, ctype=old.ctype, tg_id=old.tg_id,
                           is_accounted=old.is_accounted, warn_amount=old.warn_amount,
                           balance=old.balance, note=old.note, status=1,
                           start_date=old.start_date, end_date=old.end_date, bill_tpl_id=old.bill_tpl_id)
            db.add(new)
            db.flush()
        else:
            new.balance = old.balance
        # 迁移外键
        for model, col in [(Order, "upstream_id"), (Order, "customer_id"),
                           (Bill, "customer_id"), (CustomerRecharge, "customer_id"),
                           (CustomerPrice, "customer_id"), (ProductSale, "customer_id"),
                           (Alert, "customer_id"), (Url, "owner_id")]:
            db.query(model).filter(getattr(model, col) == old.id).update({col: new.id}, synchronize_session=False)
        # 旧客户停用、余额归零
        old.status = 0
        old.balance = 0
        changed = True
    if changed:
        db.commit()
        print("[migrate] 上游客户编号已迁移：990001->110001、990002->110002（旧客户已停用）")


@app.on_event("startup")
def on_startup():
    db = SessionLocal()
    try:
        _migrate_upstream_codes(db)
        seed(db)
        _backfill_cat_plat_codes(db)
        _backfill_daily_group(db)
        from .routers.dashboard import snapshot_agent_orders
        snapshot_agent_orders(db)
    finally:
        db.close()
    threading.Thread(target=_scheduler_loop, daemon=True).start()
    threading.Thread(target=_backup_loop, daemon=True).start()
    threading.Thread(target=_agent_order_snapshot_loop, daemon=True).start()
    threading.Thread(target=_trash_cleanup_loop, daemon=True).start()


@app.get("/healthz")
def healthz():
    return {"code": 0, "data": "ok", "msg": "ok"}


# ============ 静态文件服务（前端打包产物，SPA） ============
_FRONTEND_CANDIDATES = [
    Path(__file__).resolve().parent.parent / "static",                       # 部署包: backend/static
    Path(__file__).resolve().parent.parent.parent / "frontend" / "dist",     # 源码仓库: frontend/dist
]
FRONTEND_DIR = next((p for p in _FRONTEND_CANDIDATES if (p / "index.html").exists()), None)

if FRONTEND_DIR is not None:
    _assets = FRONTEND_DIR / "assets"
    if _assets.exists():
        app.mount("/assets", StaticFiles(directory=str(_assets)), name="assets")

    @app.get("/{filename:path}", include_in_schema=False)
    async def _spa(filename: str):
        if filename.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        root = FRONTEND_DIR.resolve()
        target = (FRONTEND_DIR / filename).resolve()
        if target.is_file() and str(target).startswith(str(root)):
            return FileResponse(str(target))
        return FileResponse(str(FRONTEND_DIR / "index.html"), headers={"Cache-Control": "no-store"})
