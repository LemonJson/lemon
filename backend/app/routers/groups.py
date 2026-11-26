"""小组名出数上限配置路由"""
import threading
import time
from collections import defaultdict
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import GroupConfig, Order, DailyData, Alert, Customer, SysConfig
from ..pagination import paginate, ok_page

router = APIRouter(prefix="/api/groups", tags=["groups"])

# 小组日活统计缓存（daily_data 行数大，聚合慢；缓存 5 分钟，数据变化时由停单/复提/导入日活等接口主动失效）
_ACTIVE_DAILY_TTL = 300.0
_active_daily_cache = {"ts": 0.0, "total_by_g": {}, "days_by_g": {}}
_active_daily_lock = threading.Lock()


def _invalidate_group_cache():
    """停单/复提/删除订单/新增/编辑/导入日活后，清除小组日活统计缓存"""
    _active_daily_cache["ts"] = 0.0


def _user_label(user):
    return (user.nickname or user.username) if user else ""


def _non_bill_dates(db):
    """读取手动设定的非提单日（逗号分隔的日期列表）"""
    cfg = db.query(SysConfig).filter(SysConfig.key == "non_bill_dates").first()
    if not cfg or not cfg.value:
        return set()
    dates = set()
    for s in (cfg.value or "").replace("，", ",").split(","):
        s = s.strip()
        if not s:
            continue
        try:
            dates.add(datetime.strptime(s, "%Y-%m-%d").date())
        except ValueError:
            pass
    return dates


def _is_bill_date(d, non_bill):
    """判断是否提单日：非周五(4)、非周六(5)、不在手动设定的非提单日"""
    if d.weekday() in (4, 5):
        return False
    if d in non_bill:
        return False
    return True


def _days_to_next_bill(db):
    """从今天到下一个提单日的天数（所有小组共用，一次算好避免逐小组重复查 SysConfig）"""
    non_bill = _non_bill_dates(db)
    today = date.today()
    d = today
    while not _is_bill_date(d, non_bill):
        d += timedelta(days=1)
    return (d - today).days


def _should_warn(limit, total, avg, base_total=0, days=0):
    """预警：预测到下一个提单日前，累计日活会达到（计划出数+已出快照）- 每日出数量，则预警"""
    if limit <= 0 or avg <= 0:
        return False
    # 剩余可出数 = (计划出数 + 已出快照) - 当前累计
    return (limit + base_total - total) <= (days + 1) * avg


def _active_daily_totals(db):
    """各小组名「当前有效订单（未提/在执）」的日活数与去重天数（先按订单过滤 task_id 再聚合；结果缓存 30 秒）"""
    now = time.time()
    if now - _active_daily_cache["ts"] < _ACTIVE_DAILY_TTL:
        return _active_daily_cache["total_by_g"], _active_daily_cache["days_by_g"]
    with _active_daily_lock:
        # 双重检查：等待锁期间可能已有别的线程（含后台预热）填充了缓存
        if time.time() - _active_daily_cache["ts"] < _ACTIVE_DAILY_TTL:
            return _active_daily_cache["total_by_g"], _active_daily_cache["days_by_g"]
        active = db.query(Order.task_id).filter(
            Order.status.in_(("未提", "在执")), Order.deleted_at.is_(None),
            Order.task_id.isnot(None)).subquery()
        rows = db.query(DailyData.group_name, func.count(DailyData.id),
                        func.count(func.distinct(DailyData.biz_date))) \
            .join(active, DailyData.task_id == active.c.task_id) \
            .filter(DailyData.group_name.isnot(None), DailyData.group_name != "") \
            .group_by(DailyData.group_name).all()
        total_by_g = {g: int(t or 0) for g, t, _ in rows}
        days_by_g = {g: int(d or 0) for g, _, d in rows}
        _active_daily_cache["ts"] = time.time()
        _active_daily_cache["total_by_g"] = total_by_g
        _active_daily_cache["days_by_g"] = days_by_g
        return total_by_g, days_by_g


def _active_daily_range(db, group_name, start_date):
    """某小组名「当前有效订单（未提/在执）」在 start_date 之后的日活数与去重天数"""
    active = db.query(Order.task_id).filter(
        Order.status.in_(("未提", "在执")), Order.deleted_at.is_(None),
        Order.task_id.isnot(None)).subquery()
    row = db.query(func.count(DailyData.id),
                   func.count(func.distinct(DailyData.biz_date))) \
        .join(active, DailyData.task_id == active.c.task_id) \
        .filter(DailyData.group_name == group_name,
                DailyData.biz_date >= start_date).one()
    return int(row[0] or 0), int(row[1] or 0)


def _active_daily_total(db, group_name, start_date=None):
    """某小组名「当前有效订单（未提/在执）」的日活数（按统计开始日期过滤）"""
    active = db.query(Order.task_id).filter(
        Order.status.in_(("未提", "在执")), Order.deleted_at.is_(None),
        Order.task_id.isnot(None)).subquery()
    q = db.query(func.count(DailyData.id)) \
        .join(active, DailyData.task_id == active.c.task_id) \
        .filter(DailyData.group_name == group_name)
    if start_date:
        q = q.filter(DailyData.biz_date >= start_date)
    return q.scalar() or 0


def _parse_stat_start_date(value):
    """解析统计开始日期（YYYY-MM-DD），为空返回 None"""
    s = (value or "").strip()
    if not s:
        return None
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=422, detail="统计开始日期格式错误")


def _group_metrics(db, names):
    """批量计算各小组的累计日活数/日均日活量/关联订单/代理（内存聚合，避免逐行 N+1）"""
    total_by_g, days_by_g = _active_daily_totals(db)
    # 对设了统计开始日期的小组，按开始日期重新统计（覆盖）
    for cfg in db.query(GroupConfig).filter(GroupConfig.group_name.in_(names)).all():
        if cfg.stat_start_date:
            total_by_g[cfg.group_name], days_by_g[cfg.group_name] = \
                _active_daily_range(db, cfg.group_name, cfg.stat_start_date)
    orders_by_g = defaultdict(list)
    for o in db.query(Order.group_name, Order.status, Order.customer_id).filter(
            Order.group_name.isnot(None), Order.group_name != "",
            Order.status.in_(("未提", "在执")),
            Order.deleted_at.is_(None)).all():
        orders_by_g[o.group_name].append(o)
    cust_ids = {o.customer_id for orders in orders_by_g.values() for o in orders if o.customer_id}
    customers = {c.id: c for c in db.query(Customer).filter(Customer.id.in_(cust_ids)).all()} if cust_ids else {}
    result = {}
    for g in names:
        total = int(total_by_g.get(g, 0) or 0)
        days = int(days_by_g.get(g, 0) or 0)
        avg = round(total / days, 1) if days else 0
        orders = orders_by_g.get(g, [])
        status = "已停" if all(o.status == "已停" for o in orders) else "在执"
        cust = None
        for o in orders:
            if o.customer_id:
                cust = customers.get(o.customer_id)
                if cust:
                    break
        result[g] = {"total": total, "avg": avg, "order_count": len(orders), "status": status,
                     "customer_code": cust.code if cust else "", "customer_name": cust.name if cust else ""}
    return result


@router.get("")
def list_groups(db: Session = Depends(get_db), _=Depends(get_current_user),
                group_name: str = "", status: str = "", warn: str = "",
                page: int = 1, per_page: int = 10):
    q = db.query(GroupConfig).order_by(GroupConfig.id)
    if group_name:
        q = q.filter(GroupConfig.group_name.like(f"%{group_name}%"))
    all_rows = q.all()  # 小组配置数量少，全量加载后 Python 层过滤状态/预警
    metrics = _group_metrics(db, [r.group_name for r in all_rows])
    days = _days_to_next_bill(db)
    data = []
    for r in all_rows:
        m = metrics.get(r.group_name, {"total": 0, "avg": 0, "order_count": 0, "status": "在执",
                                       "customer_code": "", "customer_name": ""})
        limit = int(r.limit or 0)
        base_total = int(r.base_total or 0)
        warn_flag = _should_warn(limit, m["total"], m["avg"], base_total, days)
        if status and m["status"] != status:
            continue
        if warn == "是" and not warn_flag:
            continue
        if warn == "否" and warn_flag:
            continue
        data.append({
            "id": r.id, "group_name": r.group_name, "limit": limit,
            "daily_total": m["total"], "daily_avg": m["avg"],
            "order_count": m["order_count"], "status": m["status"], "warn": bool(warn_flag),
            "customer_code": m["customer_code"], "customer_name": m["customer_name"],
            "base_total": base_total, "total_limit": limit + base_total,
            "stat_start_date": r.stat_start_date.strftime("%Y-%m-%d") if r.stat_start_date else "",
        })
    total = len(data)
    start = (page - 1) * per_page
    return ok_page(data[start:start + per_page], total)


@router.get("/options")
def group_options(db: Session = Depends(get_db), _=Depends(get_current_user)):
    """未提/在执订单的「小组名 + 一级代理」关联列表（新增配置下拉联动用）"""
    rows = db.query(Order.group_name, Order.customer_id).filter(
        Order.status.in_(("未提", "在执")), Order.deleted_at.is_(None),
        Order.group_name.isnot(None), Order.group_name != "").distinct().all()
    cids = {r[1] for r in rows if r[1]}
    customers = {c.id: c for c in db.query(Customer).filter(Customer.id.in_(cids)).all()} if cids else {}
    total_by_g, _ = _active_daily_totals(db)
    data = []
    for g, cid in rows:
        c = customers.get(cid)
        data.append({
            "group_name": g,
            "customer_id": cid,
            "customer_code": c.code if c else "",
            "customer_name": c.name if c else "",
            "daily_total": int(total_by_g.get(g, 0) or 0),
        })
    data.sort(key=lambda x: (x["customer_code"] or "", x["group_name"]))
    return {"code": 0, "data": data, "msg": "ok"}


@router.post("")
def create_group(body: dict, db: Session = Depends(get_db), _=Depends(get_current_user)):
    group_name = (body.get("group_name") or "").strip()
    if not group_name:
        raise HTTPException(status_code=422, detail="小组名不能为空")
    limit = body.get("limit")
    try:
        limit = int(limit or 0)
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="计划出数格式错误")
    if limit < 0:
        raise HTTPException(status_code=422, detail="计划出数不能为负数")
    stat_start_date = _parse_stat_start_date(body.get("stat_start_date"))
    if db.query(GroupConfig).filter(GroupConfig.group_name == group_name).first():
        raise HTTPException(status_code=409, detail="该小组名已配置")
    base_total = _active_daily_total(db, group_name, stat_start_date)
    g = GroupConfig(group_name=group_name, limit=limit, base_total=base_total,
                    stat_start_date=stat_start_date)
    db.add(g)
    db.commit()
    return {"code": 0, "data": {"id": g.id}, "msg": "已保存"}


@router.put("/{gid}")
def update_group(gid: int, body: dict, db: Session = Depends(get_db), _=Depends(get_current_user)):
    g = db.query(GroupConfig).filter(GroupConfig.id == gid).first()
    if not g:
        raise HTTPException(status_code=404, detail="小组配置不存在")
    if "group_name" in body:
        group_name = (body.get("group_name") or "").strip()
        if not group_name:
            raise HTTPException(status_code=422, detail="小组名不能为空")
        dup = db.query(GroupConfig).filter(GroupConfig.group_name == group_name, GroupConfig.id != gid).first()
        if dup:
            raise HTTPException(status_code=409, detail="该小组名已配置")
        g.group_name = group_name
    if "limit" in body:
        try:
            limit = int(body.get("limit") or 0)
        except (TypeError, ValueError):
            raise HTTPException(status_code=422, detail="计划出数格式错误")
        if limit < 0:
            raise HTTPException(status_code=422, detail="计划出数不能为负数")
        g.limit = limit
    if "stat_start_date" in body:
        g.stat_start_date = _parse_stat_start_date(body.get("stat_start_date"))
    if "group_name" in body or "limit" in body or "stat_start_date" in body:
        g.base_total = _active_daily_total(db, g.group_name, g.stat_start_date)
    db.commit()
    return {"code": 0, "data": None, "msg": "已保存"}


@router.delete("/{gid}")
def delete_group(gid: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    g = db.query(GroupConfig).filter(GroupConfig.id == gid).first()
    if not g:
        raise HTTPException(status_code=404, detail="小组配置不存在")
    db.delete(g)
    db.commit()
    return {"code": 0, "data": None, "msg": "已删除"}


@router.post("/{gid}/stop")
def stop_group(gid: int, body: dict, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """停单：该小组名下所有「在执」订单批量置为「待停」（停单原因 + 更新日期）"""
    g = db.query(GroupConfig).filter(GroupConfig.id == gid).first()
    if not g:
        raise HTTPException(status_code=404, detail="小组配置不存在")
    order_date = body.get("order_date")
    od = None
    if order_date:
        try:
            od = datetime.strptime(order_date, "%Y-%m-%d").date()
        except (TypeError, ValueError):
            raise HTTPException(status_code=422, detail="更新日期格式错误")
    reason = (body.get("reason") or "").strip()
    rows = db.query(Order).filter(Order.group_name == g.group_name,
                                  Order.status == "在执",
                                  Order.deleted_at.is_(None)).all()
    ids = [o.id for o in rows]
    for o in rows:
        o.stop_prev_order_date = o.order_date
        o.stop_prev_end_date = o.end_date
        if od:
            o.order_date = od
        o.end_date = o.order_date
        o.status = "待停"
        o.stop_date = date.today()
        o.stop_reason = reason
        o.updated_at = datetime.now()
        o.updated_by = _user_label(user)
    if ids:
        db.query(Alert).filter(Alert.type == "停单提醒", Alert.order_id.in_(ids),
                               Alert.status == "未处理").delete(synchronize_session=False)
    db.commit()
    return {"code": 0, "data": {"stopped": len(rows)},
            "msg": f"已提交停单 {len(rows)} 单（状态：待停）"}
