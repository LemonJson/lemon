"""小组名出数上限配置路由"""
from collections import defaultdict
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import GroupConfig, Order, DailyData, Alert
from ..pagination import paginate, ok_page

router = APIRouter(prefix="/api/groups", tags=["groups"])


def _user_label(user):
    return (user.nickname or user.username) if user else ""


def _group_metrics(db, names):
    """批量计算各小组的累计日活数/日均日活量/关联订单（内存聚合，避免逐行 N+1）"""
    total_by_g = dict(db.query(DailyData.group_name, func.count(DailyData.id)).filter(
        DailyData.group_name.isnot(None), DailyData.group_name != "").group_by(DailyData.group_name).all())
    days_by_g = dict(db.query(DailyData.group_name, func.count(func.distinct(DailyData.biz_date))).filter(
        DailyData.group_name.isnot(None), DailyData.group_name != "").group_by(DailyData.group_name).all())
    orders_by_g = defaultdict(list)
    for o in db.query(Order).filter(Order.group_name.isnot(None), Order.group_name != "",
                                    Order.deleted_at.is_(None)).all():
        orders_by_g[o.group_name].append(o)
    result = {}
    for g in names:
        total = int(total_by_g.get(g, 0) or 0)
        days = int(days_by_g.get(g, 0) or 0)
        avg = round(total / days, 1) if days else 0
        orders = orders_by_g.get(g, [])
        status = "已停" if all(o.status == "已停" for o in orders) else "在执"
        result[g] = {"total": total, "avg": avg, "order_count": len(orders), "status": status}
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
    data = []
    for r in all_rows:
        m = metrics.get(r.group_name, {"total": 0, "avg": 0, "order_count": 0, "status": "在执"})
        limit = int(r.limit or 0)
        warn_flag = limit > 0 and (limit - m["total"]) <= m["avg"]
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
        })
    total = len(data)
    start = (page - 1) * per_page
    return ok_page(data[start:start + per_page], total)


@router.get("/options")
def group_options(db: Session = Depends(get_db), _=Depends(get_current_user)):
    """在执订单的小组名去重列表（新增配置下拉用）"""
    names = db.query(Order.group_name).filter(
        Order.status == "在执", Order.deleted_at.is_(None),
        Order.group_name.isnot(None), Order.group_name != "").distinct().all()
    return {"code": 0, "data": sorted([r[0] for r in names]), "msg": "ok"}


@router.post("")
def create_group(body: dict, db: Session = Depends(get_db), _=Depends(get_current_user)):
    group_name = (body.get("group_name") or "").strip()
    if not group_name:
        raise HTTPException(status_code=422, detail="小组名不能为空")
    limit = body.get("limit")
    try:
        limit = int(limit or 0)
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="出数上限格式错误")
    if limit < 0:
        raise HTTPException(status_code=422, detail="出数上限不能为负数")
    if db.query(GroupConfig).filter(GroupConfig.group_name == group_name).first():
        raise HTTPException(status_code=409, detail="该小组名已配置")
    g = GroupConfig(group_name=group_name, limit=limit)
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
            raise HTTPException(status_code=422, detail="出数上限格式错误")
        if limit < 0:
            raise HTTPException(status_code=422, detail="出数上限不能为负数")
        g.limit = limit
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
        if od > date.today():
            raise HTTPException(status_code=400, detail="更新日期不能是未来日期，请修改更新日期")
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
