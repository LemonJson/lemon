"""历史日活数据回填订单快照字段

用途：日活快照改造（修改订单不影响历史账单/日活）后，历史 daily_data 缺少快照字段
（customer_id / upstream_id / channel_id / operator_id / price / add_name / order_no /
tpl_code / check_collision），需按 task_id 关联订单回填一次。

用法（在 backend 目录下执行）：.venv/bin/python backfill_daily_snapshot.py
幂等：按 task_id 批量更新，可重复执行，结果一致。
兼容 PostgreSQL / SQLite（通过 SQLAlchemy ORM，自动适配）。
"""
from app.database import SessionLocal
from app.models import DailyData, Order, Template


def backfill():
    db = SessionLocal()
    try:
        orders = {o.task_id: o for o in db.query(Order).filter(
            Order.task_id.isnot(None), Order.deleted_at.is_(None)).all()}
        tpl_codes = {t.id: t.code for t in db.query(Template).all() if t.code}
        tids = [r[0] for r in db.query(DailyData.task_id).filter(
            DailyData.task_id.isnot(None), DailyData.task_id != "").distinct().all()]

        total_rows = 0
        matched = 0
        unmatched = 0
        for tid in tids:
            o = orders.get(tid)
            if not o:
                unmatched += 1
                continue
            matched += 1
            tpl_code = tpl_codes.get(o.tpl_id, "") if o.tpl_id else ""
            n = db.query(DailyData).filter(DailyData.task_id == tid).update({
                "customer_id": o.customer_id,
                "upstream_id": o.upstream_id,
                "channel_id": o.channel_id,
                "operator_id": o.operator_id,
                "price": o.price,
                "add_name": bool(o.add_name),
                "order_no": o.order_no or "",
                "tpl_code": tpl_code,
                "check_collision": bool(o.check_collision),
            }, synchronize_session=False)
            total_rows += n
        db.commit()
        print(f"[backfill] distinct task_id: {len(tids)}")
        print(f"[backfill] 匹配订单 task: {matched}, 未匹配: {unmatched}")
        print(f"[backfill] 回填行数: {total_rows}")
    finally:
        db.close()


if __name__ == "__main__":
    backfill()
