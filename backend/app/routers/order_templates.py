"""下发模版库路由"""
import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import OrderTemplate, Order
from ..schemas import OrderTemplateBody

router = APIRouter(prefix="/api/order-templates", tags=["order-templates"])

SOURCE_FIELDS = [
    {"k": "party", "l": "甲方"}, {"k": "task_id", "l": "工单号"}, {"k": "task_name", "l": "任务名"},
    {"k": "type", "l": "类型"}, {"k": "operator", "l": "运营商"}, {"k": "url", "l": "URL"},
    {"k": "qty", "l": "数量"}, {"k": "duration", "l": "时长"}, {"k": "duration_mode", "l": "单次/持续/暂停"},
    {"k": "age_min", "l": "年龄下限"}, {"k": "age_max", "l": "年龄上限"}, {"k": "pv", "l": "PV"},
    {"k": "region", "l": "地区(派生)"}, {"k": "province", "l": "省份"}, {"k": "excl_province", "l": "排除省份"},
    {"k": "city", "l": "地市"}, {"k": "excl_city", "l": "排除地市"},
]


def _dump(t: OrderTemplate) -> dict:
    return {
        "id": t.id, "code": t.code, "name": t.name, "party": t.party,
        "columns": json.loads(t.columns_json or "[]"),
        "style": json.loads(t.style_json or "{}"),
        "filename_rule": t.filename_rule or "",
        "match_rule": json.loads(t.match_rule_json or "{}"),
        "status": t.status, "created_at": str(t.created_at), "updated_at": str(t.updated_at),
    }


@router.get("")
def list_templates(db: Session = Depends(get_db), _=Depends(get_current_user)):
    rows = db.query(OrderTemplate).order_by(OrderTemplate.id).all()
    return {"code": 0, "data": [_dump(t) for t in rows], "msg": "ok"}


@router.get("/fields")
def fields(_=Depends(get_current_user)):
    return {"code": 0, "data": SOURCE_FIELDS, "msg": "ok"}


@router.get("/{tid}")
def get_template(tid: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    t = db.query(OrderTemplate).filter(OrderTemplate.id == tid).first()
    if not t:
        raise HTTPException(status_code=404, detail="模版不存在")
    return {"code": 0, "data": _dump(t), "msg": "ok"}


@router.post("")
def create_template(body: OrderTemplateBody, db: Session = Depends(get_db), _=Depends(get_current_user)):
    if db.query(OrderTemplate).filter(OrderTemplate.code == body.code).first():
        raise HTTPException(status_code=409, detail="模版编码已存在")
    t = OrderTemplate(code=body.code, name=body.name, party=body.party,
                      columns_json=json.dumps(body.columns, ensure_ascii=False),
                      style_json=json.dumps(body.style, ensure_ascii=False),
                      filename_rule=body.filename_rule,
                      match_rule_json=json.dumps(body.match_rule, ensure_ascii=False),
                      status=body.status)
    db.add(t)
    db.commit()
    return {"code": 0, "data": {"id": t.id}, "msg": "已创建"}


@router.put("/{tid}")
def update_template(tid: int, body: OrderTemplateBody, db: Session = Depends(get_db), _=Depends(get_current_user)):
    t = db.query(OrderTemplate).filter(OrderTemplate.id == tid).first()
    if not t:
        raise HTTPException(status_code=404, detail="模版不存在")
    t.code = body.code
    t.name = body.name
    t.party = body.party
    t.columns_json = json.dumps(body.columns, ensure_ascii=False)
    t.style_json = json.dumps(body.style, ensure_ascii=False)
    t.filename_rule = body.filename_rule
    t.match_rule_json = json.dumps(body.match_rule, ensure_ascii=False)
    t.status = body.status
    db.commit()
    return {"code": 0, "data": None, "msg": "已保存"}


@router.delete("/{tid}")
def delete_template(tid: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    t = db.query(OrderTemplate).filter(OrderTemplate.id == tid).first()
    if not t:
        raise HTTPException(status_code=404, detail="模版不存在")
    if db.query(Order).filter(Order.template_id == tid, Order.deleted_at.is_(None)).first():
        raise HTTPException(status_code=409, detail="模版被订单引用，不可删除")
    db.delete(t)
    db.commit()
    return {"code": 0, "data": None, "msg": "已删除"}
