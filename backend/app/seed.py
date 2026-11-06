"""种子数据：角色/权限/账户/主数据"""
import json
from datetime import date, datetime

from .database import SessionLocal
from .models import (SysRole, SysPermission, SysUser, Customer, Category, Channel,
                     Operator, Url, Order, OrderUrl, DailyData, Fund, Bill, Alert,
                     SysConfig, OrderTemplate, sys_role_permission)
from .security import hash_password


def seed(db):
    # 系统配置
    if not db.query(SysConfig).filter(SysConfig.key == "alert_trigger_time").first():
        db.add(SysConfig(key="alert_trigger_time", value="00:00"))

    # 角色
    roles = {}
    for code, name in [("admin", "超级管理员"), ("operator", "运营"), ("finance", "财务"), ("readonly", "只读")]:
        r = db.query(SysRole).filter(SysRole.code == code).first()
        if not r:
            r = SysRole(code=code, name=name, is_builtin=True)
            db.add(r)
            db.flush()
        roles[code] = r

    # 权限点
    perms = []
    for code, label, module in [
        ("account:view", "查看账户", "account"), ("account:edit", "维护账户", "account"),
        ("order:view", "查看订单", "order"), ("order:edit", "编辑订单", "order"),
        ("customer:view", "查看客户", "customer"), ("customer:edit", "维护客户", "customer"),
        ("master:view", "查看主数据", "master"), ("master:edit", "维护主数据", "master"),
        ("data:view", "查看数据", "data"), ("bill:view", "查看账单", "bill"),
        ("alert:view", "查看预警", "alert"), ("alert:handle", "处理预警", "alert"),
        # 菜单级细粒度权限（每个菜单一项）
        ("dashboard:view", "工作台", "dashboard"),
        ("daily:view", "日活管理", "data"),
        ("tidabiao:view", "提单历史", "order"),
        ("wash:view", "洗名库", "data"),
        ("fund:view", "公积金", "data"),
        ("file:view", "文件管理", "data"),
        ("parts:view", "配件管理", "master"),
        ("category:view", "品类管理", "master"),
        ("channel:view", "渠道管理", "master"),
        ("operator:view", "运营商管理", "master"),
        ("template:view", "模版管理", "master"),
        ("product:view", "产品管理", "master"),
        ("config:view", "配置中心", "system"),
        ("log:view", "日志管理", "system"),
    ]:
        p = db.query(SysPermission).filter(SysPermission.code == code).first()
        if not p:
            p = SysPermission(code=code, label=label, module=module)
            db.add(p)
            db.flush()
        perms.append(p)
    # 按钮级权限（菜单 → 按钮，账户管理·角色权限勾选）
    button_perms = [
        ("order", "订单管理", [
            "create:新增提单", "edit:编辑", "copy:复制新增", "modify:改单", "stop:停单", "cancel_stop:取消停单",
            "reopen:复提", "batch_stop:批量停单", "batch_reopen:批量复提", "batch_extend:批量延期",
            "batch_group:批量修改小组", "delete:删除", "batch_delete:批量删除", "import:导入",
            "export:导出订单", "export_template:导出模版", "check_dup:订单验重", "cat_check:品类检查",
            "tidabiao:生成提单表", "confirm:提单确认",
        ]),
        ("daily", "日活管理", [
            "import:导入日活", "wash_export:导出洗名", "wash_import:导入洗名", "distribute:分发数据",
            "check:工单检查", "batch_delete:批量删除", "backfill_category:补充品类", "extract:单独抽取",
            "edit:编辑", "export:导出数据",
        ]),
        ("product", "产品销售", [
            "create:新增", "save:批量保存", "delete:删除", "import:导入",
            "export:导出Excel", "export_template:导出模版",
        ]),
        ("bill", "账单管理", [
            "generate:生成账单", "import:导入", "batch_delete:批量删除",
            "detail:详情", "edit_balance:修改余额",
        ]),
        ("customer", "客户管理", [
            "create:新增", "edit:编辑", "detail:详情", "recharge:充值",
            "edit_balance:修改余额", "save_rate:保存汇率", "save_price:保存单价", "delete:删除",
        ]),
        ("alert", "预警中心", ["handle:处理/充值", "config:触发时间配置"]),
        ("wash", "洗名库", ["import:导入", "batch_delete:批量删除"]),
        ("fund", "公积金", ["create:新增", "edit:编辑", "import:导入", "export:导出Excel", "delete:删除"]),
        ("file", "文件管理", ["upload:上传", "download:下载", "delete:删除"]),
        ("parts", "配件管理", ["create:新增URL", "edit:编辑", "delete:删除", "import:导入", "clear:清空"]),
        ("category", "品类管理", ["create:新增", "edit:编辑", "delete:删除", "import:导入"]),
        ("channel", "渠道管理", ["create:新增", "edit:编辑", "delete:删除"]),
        ("operator", "运营商管理", ["create:新增", "edit:编辑", "delete:删除"]),
        ("template", "模版管理", ["create:新增", "edit:编辑", "delete:删除", "upload:上传文件", "download:下载"]),
        ("products", "产品管理", ["create:新增", "edit:编辑", "copy:复制", "delete:删除", "price:代理售价"]),
        ("account", "账户管理", ["create:新增账户", "edit:编辑", "reset:重置密码", "delete:删除", "role_perms:角色权限", "create_role:新增角色"]),
        ("config", "配置中心", ["save:保存", "reset_alert:重置预警"]),
    ]
    for module, _mlabel, actions in button_perms:
        for a in actions:
            action, label = a.split(":", 1)
            code = f"{module}:{action}"
            p = db.query(SysPermission).filter(SysPermission.code == code).first()
            if not p:
                p = SysPermission(code=code, label=label, module=module)
                db.add(p)
                db.flush()
    db.commit()

    _backfill_role_permissions(db)
    _backfill_granular_permissions(db)
    _backfill_product_view(db)
    _backfill_dashboard_view(db)
    _backfill_button_perms(db)

    # 产品销售导入模版（配置到模版中心）
    from .routers.products import ensure_product_sale_template
    ensure_product_sale_template(db)

    # 账户
    users = [("admin", "超级管理员", "admin"), ("lemon001", "柠檬一号", "operator"), ("lemon002", "柠檬二号", "operator")]
    for username, nickname, role in users:
        if not db.query(SysUser).filter(SysUser.username == username).first():
            db.add(SysUser(username=username, nickname=nickname, role_id=roles[role].id,
                           password_hash=hash_password("123456"), must_change_pwd=True))
    db.commit()

    # 渠道
    channels = {}
    for name in ["106", "小程序", "直播间", "dpi-白", "dpi-灰", "公积金白名单", "短信回复"]:
        c = db.query(Channel).filter(Channel.name == name).first()
        if not c:
            c = Channel(name=name)
            db.add(c)
            db.flush()
        channels[name] = c

    # 运营商
    for name in ["移动", "联通", "电信", "移动+联通", "移动+电信", "联通+电信", "移动+联通+电信"]:
        if not db.query(Operator).filter(Operator.name == name).first():
            db.add(Operator(name=name))

    # 客户
    cust_map = {}
    customers = [("660002", "财神", "downstream", "t.me/caishen001", "洗名", 54.80, 100),
                 ("660003", "知南", "downstream", "t.me/zhinan003", "只分", 1126.65, 200),
                 ("660004", "沐禾", "downstream", "t.me/muhe004", "洗名", -365.46, 0),
                 ("660009", "虎啸", "downstream", "t.me/huxiao009", "洗名", -3768.96, 0),
                 ("880008", "龙哥", "downstream", "t.me/longge008", "洗名", -7284.20, 0),
                 ("110002", "新甲方", "upstream", "", "", 0, 0),
                 ("110001", "牛", "upstream", "", "", 0, 0)]
    for code, name, ctype, tg, wash, bal, warn in customers:
        c = db.query(Customer).filter(Customer.code == code).first()
        if not c:
            c = Customer(code=code, name=name, ctype=ctype, tg_id=tg, wash_mode=wash,
                         balance=bal, warn_amount=warn)
            db.add(c)
            db.flush()
        cust_map[code] = c
    db.commit()

    # 公积金示例
    if db.query(Fund).count() == 0:
        db.add(Fund(phone="13800001234", name="张**", id_card="5106**********1234", gender="男",
                    province="四川", city="内江", company="内江市公积金管理中心", company_type="事业单位",
                    base=8500, ratio="12%", monthly=2040, balance=32680.50, deposit_status="正常缴存",
                    open_date="2018-03", pay_to="2026-08", operator="移动", source_file="公积金/内江.xlsx"))
        db.add(Fund(phone="13900005678", name="李**", id_card="5101**********5678", gender="女",
                    province="四川", city="成都", company="成都某某科技", company_type="企业",
                    base=12000, ratio="12%", monthly=2880, balance=52400, deposit_status="正常缴存",
                    open_date="2019-07", pay_to="2026-08", operator="联通", source_file="公积金/成都.xlsx"))
        db.commit()

    seed_templates(db)
    backfill_order_templates(db)


def _backfill_role_permissions(db):
    """非 admin 角色默认开放除系统管理外的所有菜单查看权限（保持既有行为，管理员可再收紧）"""
    default_view = ["dashboard:view", "order:view", "customer:view", "bill:view", "alert:view",
                    "daily:view", "tidabiao:view", "wash:view", "fund:view", "file:view",
                    "parts:view", "category:view", "channel:view", "operator:view", "template:view",
                    "product:view"]
    perm_id = {p.code: p.id for p in db.query(SysPermission).all()}
    for r in db.query(SysRole).filter(SysRole.code != "admin").all():
        existing = db.query(sys_role_permission).filter(sys_role_permission.c.role_id == r.id).count()
        if existing == 0:
            for code in default_view:
                if code in perm_id:
                    db.execute(sys_role_permission.insert().values(role_id=r.id, permission_id=perm_id[code]))
    db.commit()


def _backfill_product_view(db):
    """产品销售/产品管理查看权限授予所有非 admin 角色（产品为通用业务项，不止管理员可见）"""
    p = db.query(SysPermission).filter(SysPermission.code == "product:view").first()
    if not p:
        return
    for r in db.query(SysRole).filter(SysRole.code != "admin").all():
        exists = db.query(sys_role_permission).filter(
            sys_role_permission.c.role_id == r.id,
            sys_role_permission.c.permission_id == p.id).first()
        if not exists:
            db.execute(sys_role_permission.insert().values(role_id=r.id, permission_id=p.id))
    db.commit()


def _backfill_dashboard_view(db):
    """工作台查看权限授予所有非 admin 角色（工作台为默认首页，非 admin 默认可见）"""
    p = db.query(SysPermission).filter(SysPermission.code == "dashboard:view").first()
    if not p:
        return
    for r in db.query(SysRole).filter(SysRole.code != "admin").all():
        exists = db.query(sys_role_permission).filter(
            sys_role_permission.c.role_id == r.id,
            sys_role_permission.c.permission_id == p.id).first()
        if not exists:
            db.execute(sys_role_permission.insert().values(role_id=r.id, permission_id=p.id))
    db.commit()


def _backfill_button_perms(db):
    """给非 admin 角色补发按钮权限：默认所有按钮可用，仅 delete/batch_delete/clear 归管理员"""
    admin_only_actions = {"delete", "batch_delete", "clear"}
    perm_rows = db.query(SysPermission).all()
    perm_id = {p.code: p.id for p in perm_rows}
    buttons = [p for p in perm_rows if ":" in (p.code or "") and not p.code.endswith(":view")]
    for r in db.query(SysRole).filter(SysRole.code != "admin").all():
        existing = {x[0] for x in db.query(SysPermission.code).join(
            sys_role_permission, sys_role_permission.c.permission_id == SysPermission.id
        ).filter(sys_role_permission.c.role_id == r.id).all()}
        for b in buttons:
            action = b.code.split(":")[-1]
            if action in admin_only_actions:
                continue
            if b.code not in existing:
                db.execute(sys_role_permission.insert().values(role_id=r.id, permission_id=b.id))
    db.commit()


def _backfill_granular_permissions(db):
    """把旧的粗粒度菜单权限（data:view / master:view）细化到每个菜单，兼容已有角色"""
    groups = {
        "data:view": ["daily:view", "tidabiao:view", "wash:view", "fund:view", "file:view"],
        "master:view": ["parts:view", "category:view", "channel:view", "operator:view", "template:view"],
    }
    perm_id = {p.code: p.id for p in db.query(SysPermission).all()}
    changed = False
    for r in db.query(SysRole).filter(SysRole.code != "admin").all():
        rows = db.query(SysPermission.code).join(
            sys_role_permission, sys_role_permission.c.permission_id == SysPermission.id
        ).filter(sys_role_permission.c.role_id == r.id).all()
        codes = {c[0] for c in rows}
        for old, news in groups.items():
            if old in codes:
                for code in news:
                    if code in perm_id and code not in codes:
                        db.execute(sys_role_permission.insert().values(role_id=r.id, permission_id=perm_id[code]))
                        codes.add(code)
                        changed = True
    if changed:
        db.commit()


def backfill_order_templates(db):
    """为历史订单补齐自动匹配的下发模版"""
    from .routers.orders import match_template
    from .models import Order
    changed = 0
    for o in db.query(Order).filter(Order.template_id.is_(None)).all():
        tid = match_template(db, o)
        if tid:
            o.template_id = tid
            changed += 1
    if changed:
        db.commit()
        print(f"[backfill] 已为 {changed} 条订单补全模版")


def _col(name, source="", fixed="", split_url=False, merge=True, url_part=""):
    return {"name": name, "source": source, "fixed": fixed,
            "split_url": split_url, "merge": merge, "url_part": url_part}


def seed_templates(db):
    if db.query(OrderTemplate).count() > 0:
        return

    def st(d):
        return json.dumps(d, ensure_ascii=False)

    niu_cols = [
        _col("任务ID", "task_id"), _col("任务名", "task_name"), _col("类型", "type"),
        _col("运营商", "operator"), _col("url", "url", split_url=True), _col("数量", "qty"),
        _col("时长", "duration"), _col("年龄下限", "age_min"), _col("年龄上限", "age_max"),
        _col("pv", "pv"), _col("省份", "region"), _col("排除省份", "excl_province"),
        _col("地市", "city"), _col("排除地市", "excl_city"),
    ]
    c106 = [
        _col("工单", "task_id"), _col("106拓展码", "url", split_url=True),
        _col("品牌/必填", fixed="LM"), _col("只能到省", "region"), _col("提取数量", "qty"),
        _col("日活|周活|月活", fixed="日活"), _col("单次/持续/暂停", "duration_mode"),
        _col("暂停备注提单日期", fixed=""),
    ]
    cdpi = [
        _col("工单号", "task_id"), _col("平台名称", fixed="LM"), _col("URL", "url", split_url=True),
        _col("地区", "region"), _col("数量", "qty"), _col("日活|周活|月活", fixed="日活"),
        _col("当日访频1-5", "pv"), _col("年龄下限", "age_min"), _col("年龄上限", "age_max"),
        _col("单次/持续/暂停", "duration_mode"), _col("暂停需备注提单日期", fixed=""),
    ]
    cxcx = [
        _col("工单号", "task_id"), _col("微信小程序全称", "url", split_url=True, url_part="before"),
        _col("地区", "region"), _col("数量", "qty"), _col("日活|周活|月活", fixed="日活"),
        _col("单次/持续/暂停", "duration_mode"), _col("暂停需备注提单日期", fixed=""),
    ]
    templates = [
        ("niu", "牛表", "牛", niu_cols, "{MMdd}-LM牛-提单表.xlsx",
         {"party": "牛", "exclude_types": ["106"]}, {"zebra": "DDEBF7", "border": True, "font": "宋体", "font_size": 11, "row_height": 20, "center": True}),
        ("xin-106-prov", "新甲方-106国省直辖市", "新", c106, "{MMdd}-LM新-106国省直辖市.xlsx",
         {"party": "新", "type": "106", "region": "国省"}, {"zebra": "DDEBF7", "border": True, "font": "宋体", "font_size": 11, "row_height": 20, "center": True}),
        ("xin-106-city", "新甲方-106地级市", "新", c106, "{MMdd}-LM新-106地级市.xlsx",
         {"party": "新", "type": "106", "region": "地级市"}, {"zebra": "DDEBF7", "border": True, "font": "宋体", "font_size": 11, "row_height": 20, "center": True}),
        ("xin-dpi-prov", "新甲方-dpi国省直辖市", "新", cdpi, "{MMdd}-LM新-dpi国省直辖市.xlsx",
         {"party": "新", "type": "dpi", "region": "国省"}, {"zebra": "D9D9D9", "border": True, "font": "宋体", "font_size": 11, "row_height": 20, "center": True}),
        ("xin-dpi-city", "新甲方-dpi地级市", "新", cdpi, "{MMdd}-LM新-dpi地级市.xlsx",
         {"party": "新", "type": "dpi", "region": "地级市"}, {"zebra": "D9D9D9", "border": True, "font": "宋体", "font_size": 11, "row_height": 20, "center": True}),
        ("xin-xcx-prov", "新甲方-小程序国省直辖市", "新", cxcx, "{MMdd}-LM新-小程序国省直辖市.xlsx",
         {"party": "新", "type": "小程序", "region": "国省"}, {"zebra": "D9D9D9", "border": True, "font": "宋体", "font_size": 11, "row_height": 20, "center": True}),
        ("xin-xcx-city", "新甲方-小程序地级市", "新", cxcx, "{MMdd}-LM新-小程序地级市.xlsx",
         {"party": "新", "type": "小程序", "region": "地级市"}, {"zebra": "D9D9D9", "border": True, "font": "宋体", "font_size": 11, "row_height": 20, "center": True}),
    ]
    for code, name, party, cols, fname, match, style in templates:
        db.add(OrderTemplate(code=code, name=name, party=party, columns_json=st(cols),
                             filename_rule=fname, match_rule_json=st(match), style_json=st(style)))
    db.commit()


def main():
    db = SessionLocal()
    try:
        seed(db)
        print("种子数据完成")
    finally:
        db.close()


if __name__ == "__main__":
    main()
