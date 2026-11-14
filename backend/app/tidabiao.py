"""提单表生成：按订单的模版把订单转化为 Excel 分表"""
import io
import json
import re
import zipfile
from datetime import datetime

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from .models import Channel, Customer, Operator, OrderTemplate, Template
from .regions import CITIES, PROVINCES, normalize_region
from .utils import norm_region


def _order_type(task_id):
    t = (task_id or "").lower()
    if "xcx" in t or "小程序" in t:
        return "小程序"
    if "kz" in t or "106" in t:
        return "106"
    if "dpi" in t:
        return "dpi"
    return ""


def _operator_of(channel_name):
    n = (channel_name or "").lower()
    for isp in ("移动", "联通", "电信"):
        if isp in n:
            return isp
    return ""


def _region_mode(o):
    ident = ((o.task_id or "") + " " + (o.task_name or "")).lower()
    if _order_type(ident) == "dpi":
        if any(k in ident for k in ("移动", "联通", "电信")):
            return "地级市"
        return "国省"
    if o.city and not o.province:
        return "地级市"
    if o.province:
        return "国省"
    return ""


def _duration_mode(o):
    if o.status in ("已停", "待停"):
        return "暂停"
    return "持续"


def _duration_label(o):
    """时长：匹配模版下拉选项 一天/本周/长期"""
    d = (o.duration or "").strip()
    if d in ("一天", "本周", "长期"):
        return d
    days = None
    if d:
        try:
            days = int(float(d))
        except (ValueError, TypeError):
            days = None
    if days is None:
        if o.start_date and o.end_date:
            days = (o.end_date - o.start_date).days
        else:
            return "长期"
    if days <= 1:
        return "一天"
    if days <= 7:
        return "本周"
    return "长期"


def _region_value(o):
    if "全国" in (o.province or "") or "全国" in (o.task_name or ""):
        return ""
    if _region_mode(o) == "地级市":
        return o.city or ""
    return o.province or ""


def _split_list(v):
    return [x for x in re.split(r"[|｜,，;；]", v or "") if x.strip()]


def _city_value(o):
    """地市列内容：有选中地市则用选中地市；否则排除地市所在省的其它地市（反查省份）"""
    if o.city:
        return o.city
    excl = [normalize_region(x) for x in _split_list(o.excl_city)]
    if not excl:
        return o.city or ""
    provs = [normalize_region(x) for x in _split_list(o.province)]
    # 省份为空/全国时，从排除地市反查所在省
    if not provs or "全国" in provs:
        provs = []
        for ex in excl:
            for p, cities in CITIES.items():
                if ex in cities and p not in provs:
                    provs.append(p)
    result = []
    for p in provs:
        for c in CITIES.get(p, []):
            if c not in excl and c not in result:
                result.append(c)
    return "|".join(result)


def _province_value(o):
    """省份列内容：有选中省份(非全国)则用选中省份；全国且有排除省份则填排除省份以外的所有省份；全国则填全国"""
    if o.province and "全国" not in o.province:
        return o.province
    excl = [normalize_region(x) for x in _split_list(o.excl_province)]
    if excl:
        return "|".join(p for p in PROVINCES if p not in excl)
    return "全国" if ("全国" in (o.province or "")) else (o.province or "")


def _order_values(db, o):
    up = db.query(Customer).filter(Customer.id == o.upstream_id).first()
    cust = db.query(Customer).filter(Customer.id == o.customer_id).first()
    ch = db.query(Channel).filter(Channel.id == o.channel_id).first() if o.channel_id else None
    ch_name = ch.name if ch else ""
    typ = _order_type((o.task_id or "") + " " + (o.task_name or ""))
    if ch_name and "dpi" in ch_name.lower():
        typ = ch_name  # 完整渠道：dpi-白 / dpi-灰
    elif not typ and ch_name:
        nm = ch_name.lower()
        if "小程序" in nm:
            typ = "小程序"
        elif "106" in nm:
            typ = "106"
        elif "直播" in nm or "抖音" in nm:
            typ = "抖音"
    op = db.query(Operator).filter(Operator.id == o.operator_id).first() if o.operator_id else None
    urls = [u.url for u in o.urls]
    if typ == "小程序":
        name = ""
        ghid = ""
        for u in urls:
            if u.startswith("gh_"):
                ghid = u
            elif not name:
                name = u
        urls = ["|".join(x for x in (name, ghid) if x)] if (name or ghid) else urls
    # 地区字段：牛按「地市/排除地市/排除省」互斥；新按省份+排除处理
    is_niu = (up.name == "牛") if up else False
    has_city = bool((o.city or "").strip())
    has_excl_city = bool(_split_list(o.excl_city))
    has_excl_province = bool(_split_list(o.excl_province))
    province_val = norm_region(_province_value(o))
    excl_province_val = norm_region(o.excl_province)
    city_val = norm_region(_city_value(o))
    excl_city_val = norm_region(o.excl_city)
    if is_niu:
        if has_city:
            province_val = ""
            excl_province_val = ""
            excl_city_val = ""
        elif has_excl_city:
            province_val = ""
            excl_province_val = ""
            city_val = ""
        elif has_excl_province:
            province_val = ""
            city_val = ""
            excl_city_val = ""
    return {
        "party": up.name if up else "",
        "task_id": o.task_id or o.order_no or "",
        "task_name": o.task_name or "",
        "type": typ,
        "operator": op.name if op else "",
        "channel": ch_name,
        "url": urls,
        "qty": o.qty,
        "duration": "长期" if (up and up.name == "牛") else _duration_label(o),
        "duration_mode": _duration_mode(o),
        "age_min": o.age_min,
        "age_max": o.age_max,
        "pv": o.pv,
        "region": norm_region(_region_value(o)),
        "province": province_val,
        "excl_province": excl_province_val,
        "city": city_val,
        "excl_city": excl_city_val,
        "order_no": o.order_no or "",
        "order_date": o.order_date.strftime("%Y-%m-%d") if o.order_date else "",
        "start_date": o.start_date.strftime("%Y-%m-%d") if o.start_date else "",
        "end_date": o.end_date.strftime("%Y-%m-%d") if o.end_date else "",
        "price": (float(o.price) if o.price is not None else ""),
        "customer": cust.name if cust else "",
        "secondary_agent": o.secondary_agent or "",
        "platform": o.platform or "",
    }


def _col_value(col, vals, url):
    fixed = col.get("fixed")
    if fixed:
        return fixed
    src = col.get("source") or ""
    if src == "url":
        if not url:
            return ""
        if col.get("url_part") == "before":
            return url.split("｜")[0].split("|")[0]
        return url
    v = vals.get(src)
    return "" if v is None else v


def _filename(template, mmdd):
    rule = template.filename_rule or ""
    mr = json.loads(template.match_rule_json or "{}")
    typ = mr.get("type", "")
    region = "国省直辖市" if mr.get("region") == "国省" else ("地级市" if mr.get("region") == "地级市" else "")
    return (rule.replace("{MMdd}", mmdd).replace("{party}", template.party or "")
            .replace("{type}", typ).replace("{region}", region).replace("{gray}", ""))


def build_template_excel(db, template, orders, mmdd):
    cols = json.loads(template.columns_json or "[]")
    if not cols:
        return None, None
    style = json.loads(template.style_json or "{}")
    exclude = json.loads(template.match_rule_json or "{}").get("exclude_types") or []

    wb = Workbook()
    ws = wb.active
    ws.title = (template.name or "sheet")[:20]

    font_name = style.get("font", "宋体")
    font_size = style.get("font_size", 11)
    thin = Side(style="thin", color="000000")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    center = Alignment(horizontal="center", vertical="center", wrap_text=True)
    zebra = (style.get("zebra") or "FFFFFF").lstrip("#")
    zebra_fill = PatternFill(start_color=zebra, end_color=zebra, fill_type="solid")
    white_fill = PatternFill(start_color="FFFFFF", end_color="FFFFFF", fill_type="solid")

    for j, c in enumerate(cols, 1):
        cell = ws.cell(row=1, column=j, value=c.get("name", ""))
        cell.font = Font(name=font_name, size=font_size, bold=True)
        cell.alignment = center
        if style.get("border", True):
            cell.border = border
        if c.get("width"):
            ws.column_dimensions[get_column_letter(j)].width = c.get("width")
    ws.row_dimensions[1].height = style.get("row_height", 20)

    row = 2
    block_idx = 0
    for o in orders:
        vals = _order_values(db, o)
        if exclude and vals.get("type") in exclude:
            continue
        urls = vals.get("url") or []
        has_split = any(c.get("split_url") for c in cols)
        if not has_split or not urls:
            urls = [""]
        start = row
        for url in urls:
            for j, c in enumerate(cols, 1):
                cell = ws.cell(row=row, column=j, value=_col_value(c, vals, url))
                cell.font = Font(name=font_name, size=font_size)
                cell.alignment = center
                if style.get("border", True):
                    cell.border = border
            row += 1
        # 斑马纹按任务块交替
        fill = zebra_fill if (block_idx % 2 == 0 and zebra != "FFFFFF") else white_fill
        if zebra != "FFFFFF":
            for rr in range(start, row):
                for j in range(1, len(cols) + 1):
                    ws.cell(row=rr, column=j).fill = fill
        # 跨行合并（非拆行列）
        if row - start > 1:
            for j, c in enumerate(cols, 1):
                if not c.get("split_url"):
                    ws.merge_cells(start_row=start, start_column=j, end_row=row - 1, end_column=j)
        block_idx += 1

    bio = io.BytesIO()
    wb.save(bio)
    bio.seek(0)
    return _filename(template, mmdd), bio


def generate_zip(db, orders, mmdd=None):
    """按模版分组生成提单表，返回 ZIP BytesIO 与文件清单"""
    mmdd = mmdd or datetime.now().strftime("%m%d")
    groups = {}
    for o in orders:
        groups.setdefault(o.template_id, []).append(o)
    buf = io.BytesIO()
    manifest = []
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for tid, olist in groups.items():
            t = db.query(OrderTemplate).filter(OrderTemplate.id == tid).first()
            if not t:
                continue
            name, data = build_template_excel(db, t, olist, mmdd)
            if name and data:
                zf.writestr(name, data.read())
                manifest.append({"template": t.name, "file": name, "count": len(olist)})
    buf.seek(0)
    return buf, manifest


def _header_field(h):
    """把模版文件表头映射为订单值字段或固定值"""
    h = re.sub(r"\s+", "", str(h)).lower()
    if "甲方订单号" in h:
        return ("fixed", "")
    if "品牌" in h or "必填" in h:
        return ("fixed", "LM")
    if ("日活" in h and "周活" in h) or "日活|周活|月活" in h:
        return ("fixed", "日活")
    if "暂停备注" in h or "备注" in h:
        return ("fixed", "")
    if "拓展码" in h:
        return ("field", "url")
    if "手机号" in h or "号码" in h or "联系方式" in h:
        return ("field", "url")
    if "姓名" in h or "名字" in h:
        return ("field", "name")
    if "工单" in h or "任务id" in h:
        return ("field", "task_id")
    if "任务名" in h:
        return ("field", "task_name")
    if "url" in h:
        return ("field", "url")
    if "类型" in h:
        return ("field", "type")
    if "渠道" in h:
        return ("field", "channel")
    if "运营商" in h:
        return ("field", "operator")
    if "单次" in h or "持续" in h or "暂停" in h:
        return ("field", "duration_mode")
    if "数量" in h or "提取" in h:
        return ("field", "qty")
    if "时长" in h:
        return ("field", "duration")
    if "年龄" in h and "下" in h:
        return ("field", "age_min")
    if "年龄" in h and "上" in h:
        return ("field", "age_max")
    if "pv" in h or "访频" in h:
        return ("field", "pv")
    if "排除省" in h:
        return ("field", "excl_province")
    if "排除地" in h or "排除市" in h:
        return ("field", "excl_city")
    if "省份" in h or "只能到省" in h:
        return ("field", "province")
    if "地市" in h or "地级市" in h or "城市" in h:
        return ("field", "city")
    if "省" in h:
        return ("field", "province")
    if "市" in h:
        return ("field", "city")
    if "提单日" in h:
        return ("field", "order_date")
    if "开始日期" in h or "开始时间" in h:
        return ("field", "start_date")
    if "截止日期" in h or "截止时间" in h:
        return ("field", "end_date")
    if "定价" in h:
        return ("field", "price")
    if "分组" in h:
        return ("field", "tpl_code")
    if "平台名称" in h:
        return ("fixed", "LM")
    if "平台" in h:
        return ("field", "platform")
    if "一级代理" in h:
        return ("field", "customer")
    if "二级代理" in h:
        return ("field", "secondary_agent")
    if "订单号" in h or "订单编号" in h:
        return ("field", "order_no")
    if "甲方" in h:
        return ("field", "party")
    return None


def _cell_value(kind, key, vals):
    if kind == "fixed":
        return key
    v = vals.get(key)
    if key == "url":
        urls = v or []
        return "\n".join(urls) if isinstance(urls, list) else (v or "")
    return "" if v is None else v


def _fill_template_file(db, tpl, orders):
    """用上传的模版文件填充订单数据，返回 (filename, BytesIO)"""
    if not tpl.file_data:
        return None, None
    from openpyxl import load_workbook
    wb = load_workbook(io.BytesIO(bytes(tpl.file_data)))
    ws = wb.active
    # 读表头（第一行），建立列 → 值映射
    headers = [c.value for c in ws[1]]
    colmap = []
    for j, h in enumerate(headers, 1):
        m = _header_field(h) if h else None
        colmap.append((j, m))
    # 清空数据行（第 2 行起）
    if ws.max_row > 1:
        ws.delete_rows(2, ws.max_row - 1)
    row = 2
    for o in orders:
        vals = _order_values(db, o)
        vals["tpl_code"] = tpl.code
        for j, m in colmap:
            if not m:
                continue
            ws.cell(row=row, column=j, value=_cell_value(m[0], m[1], vals))
        row += 1
    bio = io.BytesIO()
    wb.save(bio)
    bio.seek(0)
    ext = tpl.file_type or "xlsx"
    name = tpl.name or tpl.code
    if "." not in name:
        name = f"{name}.{ext}"
    return name, bio


def generate_from_templates(db, orders, mmdd=None):
    """按「模版管理」分组，用上传的模版文件生成提单表 ZIP"""
    mmdd = mmdd or datetime.now().strftime("%m%d")
    groups = {}
    for o in orders:
        groups.setdefault(o.tpl_id, []).append(o)
    buf = io.BytesIO()
    manifest = []
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for tid, olist in groups.items():
            tpl = db.query(Template).filter(Template.id == tid).first()
            if not tpl:
                continue
            name, data = _fill_template_file(db, tpl, olist)
            if name and data:
                # 若文件名带日期占位则替换
                zf.writestr(name, data.read())
                manifest.append({"template": tpl.name, "file": name, "count": len(olist)})
    buf.seek(0)
    return buf, manifest


# ============ 新提单生成（按规则选模版） ============

_CODE_META = {
    "MB-008": ("牛", "", "提单表"),
    "MB-009": ("牛", "", "改单表"),
    "MB-010": ("牛", "", "停单表"),
    "MB-011": ("新", "106", "地市"),
    "MB-012": ("新", "106", "国省"),
    "MB-013": ("新", "dpi-白", "地市"),
    "MB-014": ("新", "dpi-白", "国省"),
    "MB-015": ("新", "dpi-灰", "地市"),
    "MB-016": ("新", "dpi-灰", "国省"),
    "MB-018": ("新", "", "停单表"),
    "MB-020": ("新", "106", "改单表-地市"),
    "MB-021": ("新", "106", "改单表-国省"),
    "MB-022": ("新", "dpi-白", "改单表-地市"),
    "MB-023": ("新", "dpi-白", "改单表-国省"),
    "MB-024": ("新", "dpi-灰", "改单表-地市"),
    "MB-025": ("新", "dpi-灰", "改单表-国省"),
}


def _select_code(db, action, o):
    up = db.query(Customer).filter(Customer.id == o.upstream_id).first()
    party = "牛" if (up and up.name == "牛") else "新"
    ch = db.query(Channel).filter(Channel.id == o.channel_id).first()
    channel = ch.name if ch else ""

    if party == "牛":
        if action == "改单":
            return "MB-009"
        if action == "停单":
            return "MB-010"
        return "MB-008"

    if action == "停单":
        return "MB-018"

    region_city = bool((o.city or "") or (o.excl_city or ""))
    region_prov = bool((o.excl_province or "") or ((o.province or "") and not (o.excl_city or "")))

    code_map = {
        "新单": {"106": ("MB-011", "MB-012"), "dpi-白": ("MB-013", "MB-014"), "dpi-灰": ("MB-015", "MB-016")},
        "改单": {"106": ("MB-020", "MB-021"), "dpi-白": ("MB-022", "MB-023"), "dpi-灰": ("MB-024", "MB-025")},
    }
    m = code_map.get(action, {}).get(channel)
    if not m:
        return None
    city_code, prov_code = m
    if region_city:
        return city_code
    if region_prov:
        return prov_code
    return None


def _filename_for(code, mmdd):
    party, channel, suffix = _CODE_META.get(code, ("", "", ""))
    if party == "牛":
        return f"{mmdd}-LM牛-{suffix}.xlsx"
    if channel:
        return f"{mmdd}-LM新-{channel}-{suffix}.xlsx"
    return f"{mmdd}-LM新-{suffix}.xlsx"


def _cell_value_split(kind, key, vals, url):
    if kind == "fixed":
        return key
    if key == "url":
        return url
    v = vals.get(key)
    return "" if v is None else v


def _fill_uploaded_template(db, tpl, orders, action):
    from openpyxl import load_workbook
    wb = load_workbook(io.BytesIO(bytes(tpl.file_data)))
    ws = wb.active
    thin = Side(style="thin", color="000000")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    center = Alignment(horizontal="center", vertical="center", wrap_text=True)
    no_wrap = Alignment(horizontal="center", vertical="center", wrap_text=False)
    zebra_color = {"新单": "C6EFCE", "改单": "FCE4D6", "停单": "F2F2F2"}.get(action, "C6EFCE")
    zebra = PatternFill(start_color=zebra_color, end_color=zebra_color, fill_type="solid")
    changed_fill = PatternFill(start_color="FFC000", end_color="FFC000", fill_type="solid")

    if action == "停单":
        header_row = 1
        for r in range(1, min(ws.max_row, 6) + 1):
            if any(c.value is not None and str(c.value).strip() for c in ws[r]):
                header_row = r
                break
        if ws.max_row > header_row:
            ws.delete_rows(header_row + 1, ws.max_row - header_row)
        row = header_row + 1
        seq = 0
        for o in orders:
            seq += 1
            tid = (o.task_id or "").strip()
            if not tid:
                raise ValueError(f"订单「{o.task_name or o.order_no}」缺少工单号（任务ID），无法生成停单表")
            # B 列序号，C 列工单号，数据区加边框，斑马纹
            ca = ws.cell(row=row, column=2, value=seq)
            cb = ws.cell(row=row, column=3, value=tid)
            ca.alignment = center
            ca.border = border
            cb.alignment = center
            cb.border = border
            if seq % 2 == 0:
                ca.fill = zebra
                cb.fill = zebra
            row += 1
        bio = io.BytesIO()
        wb.save(bio)
        bio.seek(0)
        return bio

    header_row = 1
    headers = [c.value for c in ws[header_row]]
    if all(h is None or str(h).strip() == "" for h in headers):
        header_row = 2
        headers = [c.value for c in ws[header_row]]
    colmap = []
    for j, h in enumerate(headers, 1):
        m = _header_field(h) if h else None
        colmap.append((j, m))
    # 牛提单表(MB-008)/牛改单表(MB-009)：任务名列改用订单编号
    if tpl.code in ("MB-008", "MB-009"):
        colmap = [(j, ("field", "order_no") if m == ("field", "task_name") else m) for j, m in colmap]
    if ws.max_row > header_row:
        ws.delete_rows(header_row + 1, ws.max_row - header_row)

    row = header_row + 1
    block_idx = 0
    # 牛提单表(MB-008)/牛改单表(MB-009)：url 全部写进一个单元格换行，且无斑马纹
    multiline_url = tpl.code in ("MB-008", "MB-009")
    for o in orders:
        if action == "改单":
            tid = (o.task_id or "").strip()
            if not tid:
                raise ValueError(f"订单「{o.task_name or o.order_no}」缺少工单号（任务ID），无法生成改单表")
        vals = _order_values(db, o)
        if action == "新单" and tpl.code == "MB-008":
            vals["task_id"] = (o.task_id or "").strip()
        raw_changed = o.change_fields_json
        changed = set(json.loads(raw_changed)) if raw_changed else None  # None 表示整单改单，填充全部字段
        urls = vals.get("url") or []
        if action == "改单" and changed is not None and "url" not in changed:
            urls = []
        if multiline_url:
            urls = ["\n".join(urls)] if urls else [""]
        elif not urls:
            urls = [""]
        start = row
        for url in urls:
            for j, m in colmap:
                if not m:
                    continue
                kind, key = m
                if action == "改单" and kind == "field" and key not in ("task_id", "task_name", "order_no") and changed is not None and key not in changed:
                    value = ""
                else:
                    value = _cell_value_split(kind, key, vals, url)
                cell = ws.cell(row=row, column=j, value=value)
                cell.alignment = no_wrap if key in ("province", "city", "excl_province", "excl_city", "region") else center
                cell.border = border
                is_changed = action == "改单" and kind == "field" and key not in ("task_id", "task_name", "order_no") and (changed is None or key in changed)
                cell.fill = changed_fill if is_changed else zebra
            row += 1
        if row - start > 1:
            for j, m in colmap:
                if m and m[1] != "url":
                    ws.merge_cells(start_row=start, start_column=j, end_row=row - 1, end_column=j)
        block_idx += 1
    bio = io.BytesIO()
    wb.save(bio)
    bio.seek(0)
    return bio


def generate_tidabiao_v2(db, orders, action, mmdd=None):
    """按新规则（新单/改单/停单）选模版并生成 ZIP（每个模版一个文件）"""
    mmdd = mmdd or datetime.now().strftime("%m%d")
    groups = {}
    for o in orders:
        code = _select_code(db, action, o)
        if not code:
            continue
        groups.setdefault(code, []).append(o)

    buf = io.BytesIO()
    manifest = []
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for code, olist in groups.items():
            tpl = db.query(Template).filter(Template.code == code).first()
            if not tpl or not tpl.file_data:
                continue
            name = _filename_for(code, mmdd)
            data = _fill_uploaded_template(db, tpl, olist, action)
            if name and data:
                zf.writestr(name, data.read())
                manifest.append({"code": code, "file": name, "count": len(olist)})
    buf.seek(0)
    return buf, manifest


def generate_tidabiao_all(db, orders, mmdd=None):
    """按状态生成：未提→提单表(新单)，改单→改单表，已停→停单表；在执不生成"""
    mmdd = mmdd or datetime.now().strftime("%m%d")
    action_by_status = {"新单": "未提", "改单": "改单", "停单": "待停"}
    buf = io.BytesIO()
    manifest = []
    processed = set()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for action, status in action_by_status.items():
            groups = {}
            for o in orders:
                if o.status != status:
                    continue
                code = _select_code(db, action, o)
                if not code:
                    continue
                groups.setdefault(code, []).append(o)
            for code, olist in groups.items():
                tpl = db.query(Template).filter(Template.code == code).first()
                if not tpl or not tpl.file_data:
                    continue
                name = _filename_for(code, mmdd)
                data = _fill_uploaded_template(db, tpl, olist, action)
                if name and data:
                    zf.writestr(name, data.read())
                    manifest.append({"action": action, "code": code, "file": name, "count": len(olist)})
                    processed.update(o.id for o in olist)
    buf.seek(0)
    return buf, manifest, processed
