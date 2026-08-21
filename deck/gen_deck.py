#!/usr/bin/env python3
"""Generate AOI LAB vibe-coding deck.json with embedded screenshots."""
import json, base64, os, uuid, time

PROJECT = r"C:\Users\IPC\Downloads\aoi-lab-combined-workbench-v3\aoi-lab-combined"
SHOTS_DIR = os.path.join(PROJECT, "deck", "shots")
OUTPUT = os.path.join(PROJECT, "deck", "deck.json")

# ── Brand palette ──
NAVY   = "#072F50"
PAPER  = "#FFFAEA"
CYAN   = "#24D4D3"
ORANGE = "#FF9D2E"
INK    = "#08304F"
CREAM  = "#FFF9E8"
WHITE  = "#FFFFFF"

FONT = "PingFang SC, Microsoft YaHei, system-ui, sans-serif"
MONO  = "Geist Mono, Consolas, monospace"

W, H = 1280, 720
M = 96  # margin

def img_data_uri(path):
    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    return f"data:image/png;base64,{b64}"

# ── Load screenshots ──
assets = {}
names = {
    "img_home": "00_home.png",
    "img_cq":   "01_case_query.png",
    "img_sg":   "02_sheet_gen.png",
    "img_fov":  "03_fov.png",
    "img_rep":  "04_repeatability.png",
}
for key, fname in names.items():
    assets[key] = img_data_uri(os.path.join(SHOTS_DIR, fname))
print(f"Loaded {len(assets)} screenshot assets")

# ── Helpers (all include required ElementBase fields) ──
def txt(id_, x, y, w, h, html, fs=24, fw=600, color=PAPER, align="left", valign="top",
         lh=1.3, fx=None, **kw):
    e = {"id": id_, "type": "text", "x": x, "y": y, "w": w, "h": h,
         "rotation": 0, "opacity": 1,
         "html": html, "fontSize": fs, "fontFamily": FONT, "fontWeight": fw,
         "color": color, "align": align, "valign": valign, "lineHeight": lh}
    e.update(kw)
    if fx: e["fx"] = fx
    return e

def rect(id_, x, y, w, h, fill=NAVY, stroke=None, sw=0, radius=0, opacity=1, **kw):
    e = {"id": id_, "type": "shape", "shape": "rect", "x": x, "y": y, "w": w, "h": h,
         "rotation": 0, "opacity": opacity,
         "fill": fill, "stroke": stroke or "none", "strokeWidth": sw, "radius": radius}
    e.update(kw)
    return e

def img(id_, x, y, w, h, src, fit="contain", radius=8, fx=None):
    e = {"id": id_, "type": "image", "x": x, "y": y, "w": w, "h": h,
         "rotation": 0, "opacity": 1,
         "src": src, "fit": fit, "radius": radius}
    if fx: e["fx"] = fx
    return e

def slide(id_, bg, elements, notes, transition="none", name=""):
    return {"id": id_, "background": bg, "transition": transition,
            "elements": elements, "notes": notes, "name": name}

DOC_ID = str(uuid.uuid4())
NOW = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())

slides = []

# ════════════════════════════════════════════
# SLIDE 1 — COVER
# ════════════════════════════════════════════
slides.append(slide("s1", NAVY, [
    rect("s1-bg", 0, 0, W, H, fill=NAVY),
    # Subtle grid pattern via thin lines (decorative)
    rect("s1-accent-bar", 0, 180, W, 4, fill=CYAN, opacity=0.6),
    txt("s1-kicker", M, 100, W-M*2, 36, "// VIBE CODING · FIRST OUTPUT",
        fs=16, fw=400, color=CYAN, align="left"),
    txt("s1-title", M, 150, W-M*2, 90, "AOI LAB",
        fs=76, fw=800, color=WHITE, align="left"),
    txt("s1-sub", M, 250, W-M*2, 50, "用 AI 做出来的团队效率工具箱",
        fs=32, fw=500, color=PAPER, align="left"),
    txt("s1-tag", M, 320, 550, 36, "从设计规范到功能实现，一步步搭出来",
        fs=20, fw=400, color=CREAM, align="left"),
    # Homepage screenshot right side
    img("s1-shot", 640, 140, 580, 520, "asset:img_home",
        fit="contain", radius=12,
        fx={"enter": "fade-up", "order": 2}),
    # Bottom tag
    rect("s1-bottom-bar", 0, H-60, W, 60, fill="#052240"),
    txt("s1-date", M, H-42, 400, 24, "2026 · 团队内部分享",
        fs=14, fw=400, color=CREAM, align="left"),
], """开场定调：这不是一个正式产品，是我边学 Agent 边用 Vibe Coding 做出来的第一个完整项目。
关键信息：AOI LAB 是纯前端效率工具箱，4 个可用工具 + 1 个占位，一个离线 HTML 文件双击即用。
语气轻松但真诚——这是给同事看的分享，不是给投资人看的路演。
可以提到：今天主要讲三件事——为什么做、怎么做出来的、以及我关于"AI 时代技术"的一点思考。"""))

# ════════════════════════════════════════════
# SLIDE 2 — WHY (Pain Points)
# ════════════════════════════════════════════
pains = [
    ("01", "查案子交期", "手动翻 Excel，一行行找对应物件"),
    ("02", "对样表格", "复制粘贴改数字，格式反复调"),
    ("03", "FOV 选型", "算来算去，相机镜头还是对不上"),
    ("04", "重复性分析", "6σ 手算容易错，判定靠经验拍脑袋"),
]
els2 = [rect("s2-bg", 0, 0, W, H, fill=NAVY)]
els2.append(txt("s2-title", M, 80, W-M*2, 56, "为什么做这个？",
    fs=44, fw=700, color=WHITE, align="left"))
els2.append(txt("s2-sub", M, 145, W-M*2, 28, "工作中反复遇到的小麻烦，加起来很消耗时间",
    fs=18, fw=400, color=CREAM, align="left"))
# Pain cards in 2×2 grid
cw, ch = 520, 130
gap_x, gap_y = 30, 24
sx, sy = M, 200
for i, (num, title, desc) in enumerate(pains):
    col, row = i % 2, i // 2
    cx = sx + col * (cw + gap_x)
    cy = sy + row * (ch + gap_y)
    els2.append(rect(f"s2-card-{i}", cx, cy, cw, ch, fill=PAPER, radius=6))
    els2.append(txt(f"s2-num-{i}", cx+20, cy+16, 50, 36, num,
        fs=28, fw=800, color=CYAN, align="left", fontFamily=MONO))
    els2.append(txt(f"s2-t-{i}", cx+80, cy+16, cw-100, 32, title,
        fs=22, fw=600, color=INK, align="left"))
    els2.append(txt(f"s2-d-{i}", cx+80, cy+54, cw-100, 60, desc,
        fs=15, fw=400, color=INK, align="left", lh=1.4))
els2.append(txt("s2-foot", M, H-80, W-M*2, 28,
    "每个都不难，但每天都在重复。我想：能不能用 AI 把这些事自动化？",
    fs=17, fw=400, color=ORANGE, align="center"))
slides.append(slide("s2", NAVY, els2,
    """痛点共鸣页。四个 pain point 都是团队成员日常真实经历。
讲的时候可以问："有多少人手动翻过 Excel 查交期？"——互动拉近距离。
核心信息：不是为做工具而做工具，是从真实痛点出发。
过渡到下一页：有了这些想法后，我怎么把它变成现实？答案是 Vibe Coding。"""))

# ════════════════════════════════════════════
# SLIDE 3 — VIBE CODING PROCESS
# ════════════════════════════════════════════
steps = ["说清楚需求", "AI 给出方案", "我确认 / 调整", "迭代到能用"]
els3 = [rect("s3-bg", 0, 0, W, H, fill=NAVY)]
els3.append(txt("s3-title", M, 70, W-M*2, 52, "怎么做出来的？Vibe Coding",
    fs=44, fw=700, color=WHITE, align="left"))
els3.append(txt("s3-sub", M, 132, W-M*2, 26, "不是写一堆代码，是和 AI 结对编程",
    fs=19, fw=400, color=CYAN, align="left"))
# Process steps as connected boxes
sw, sh = 240, 100
sgap = 30
start_x = (W - (4*sw + 3*sgap)) // 2
for i, step in enumerate(steps):
    sx_ = start_x + i * (sw + sgap)
    sy_ = 210
    els3.append(rect(f"s3-box-{i}", sx_, sy_, sw, sh, fill=PAPER, stroke=CYAN, sw=3, radius=8,
        fx={"enter": "slide-up", "order": i+1}))
    els3.append(txt(f"s3-step-{i}", sx_+16, sy_+16, 40, 32, f"0{i+1}",
        fs=24, fw=800, color=CYAN, fontFamily=MONO, align="left"))
    els3.append(txt(f"s3-label-{i}", sx_+60, sy_+20, sw-80, 36, step,
        fs=20, fw=600, color=INK, align="left"))
    if i < 3:
        # Arrow between boxes
        ax = sx_ + sw + 6
        ay = sy_ + sh//2 - 8
        els3.append({"id":f"s3-arrow-{i}","type":"shape","shape":"arrow","x":ax,"y":ay,"w":18,"h":16,
            "fill":CYAN,"opacity":0.7,"rotation":0,"stroke":"none","strokeWidth":0,"radius":0})
# Key message box
els3.append(rect("s3-msg", M, 360, W-M*2, 120, fill="#0A3A62", radius=10,
    fx={"enter": "fade-up", "order": 5}))
els3.append(txt("s3-msg-t", M+30, 380, W-M*2-60, 46, "人主导方向，AI 负责执行",
    fs=28, fw=700, color=WHITE, align="center"))
els3.append(txt("s3-msg-d", M+30, 430, W-M*2-60, 34,
    "我说「要什么」，AI 给「怎么做」，我来判断「对不对」",
    fs=17, fw=400, color=CREAM, align="center", lh=1.4))
els3.append(txt("s3-note", M, 510, W-M*2, 24,
    "整个过程不需要我会写 React、不需要懂 Tailwind —— 但我需要知道我要什么。",
    fs=14, fw=400, color=CREAM, align="center"))
slides.append(slide("s3", NAVY, els3,
    """核心叙事页：解释 Vibe Coding 是什么。
重点传达：
1. 这不是"让 AI 写代码然后我不管了"——人始终在主导
2. 不需要会写代码才能做这件事（降低听众门槛）
3. 迭代循环：说→做→看→改，像结对编程一样自然
过渡：在开始写代码之前，我先做了什么？——先定了设计规范。""",
    transition="slide"))

# ════════════════════════════════════════════
# SLIDE 4 — DESIGN SPECS FIRST
# ════════════════════════════════════════════
colors_data = [
    ("Navy 背景", NAVY),
    ("Paper 纸张", PAPER),
    ("Cyan 强调", CYAN),
    ("Orange 操作", ORANGE),
]
els4 = [rect("s4-bg", 0, 0, W, H, fill=NAVY)]
els4.append(txt("s4-title", M, 70, W-M*2, 52, "第一步：先定设计规范",
    fs=44, fw=700, color=WHITE, align="left"))
els4.append(txt("s4-sub", M, 130, W-M*2, 26, "不是随便堆 UI，而是先建立一套完整的视觉语言",
    fs=18, fw=400, color=CREAM, align="left"))
# Color palette row
cp_w, cp_h = 220, 110
cp_start = M
for i, (name, c) in enumerate(colors_data):
    cx = cp_start + i * (cp_w + 24)
    cy = 185
    els4.append(rect(f"s4-color-{i}", cx, cy, cp_w, cp_h, fill=c, radius=8,
        stroke=WHITE if c==NAVY else INK, sw=2, opacity=1))
    # Text on/near each color swatch
    tc = WHITE if c in (NAVY,) else INK
    els4.append(txt(f"s4-cn-{i}", cx+16, cy+cp_h-36, cp_w-32, 28, name,
        fs=15, fw=600, color=tc, align="center"))
# Rules list
rules = [
    "纯 2D 风格，实色阴影，无模糊/玻璃/渐变",
    "样式前缀按功能分组（generator-* / cq-* / fov-*）",
    "每个工具统一结构：编号 → 标题 → 输入区 → 结果区",
    "图标二维线稿，线条圆润，不引入装饰字体",
]
ry = 320
for i, rule in enumerate(rules):
    els4.append(rect(f"s4-r-dot-{i}", M, ry+i*52, 10, 10, fill=CYAN, radius=5))
    els4.append(txt(f"s4-r-{i}", M+24, ry+i*52-4, W-M*2-40, 28, rule,
        fs=17, fw=400, color=PAPER, align="left", lh=1.3))
# Quote
els4.append(rect("s4-quote", M, 545, W-M*2, 70, fill=PAPER, radius=8))
els4.append(txt("s4-qt", M+24, 558, W-M*2-48, 48,
    '"先有规矩再动手" —— 这样每个新工具看起来都像是同一个人做的',
    fs=18, fw=500, color=INK, align="center", lh=1.3))
slides.append(slide("s4", NAVY, els4,
    """展示专业性：这个项目不是随意拼凑的，有完整的设计规范。
颜色系统是品牌识别的核心；规则确保一致性。
这体现了 Vibe Coding 的一个要点：即使不会写代码，
你仍然可以用自然语言定义设计规范，让 AI 遵守。
过渡：规范定好了，下面看看最终做出来的东西。""",
    transition="slide"))

# ════════════════════════════════════════════
# SLIDE 5 — TOOL OVERVIEW (homepage screenshot)
# ════════════════════════════════════════════
els5 = [rect("s5-bg", 0, 0, W, H, fill=NAVY)]
els5.append(txt("s5-title", M, 40, W-M*2, 46, "工具总览：5 个工具，一个文件",
    fs=40, fw=700, color=WHITE, align="left"))
els5.append(txt("s5-sub", M, 95, W-M*2, 22, "全部浏览器本地运行，数据不出电脑",
    fs=16, fw=400, color=CYAN, align="left"))
# Main screenshot
els5.append(img("s5-shot", M, 135, W-M*2, 520, "asset:img_home",
    fit="contain", radius=10,
    fx={"enter": "fade-up", "order": 1}))
# Tool labels overlay (positioned over screenshot area)
tools_info = [
    ("01", "案件查询", 200, 420),
    ("02", "表格生成器", 480, 420),
    ("03", "FOV 选型", 760, 420),
    ("04", "重复性分析", 200, 565),
    ("05", "相关性分析（开发中）", 480, 565),
]
slides.append(slide("s5", NAVY, els5,
    """这是真实运行的主页截图，不是 Figma mockup。
五个工具卡位清晰可见：
01 案件查询 — 上传周报快速查物件
02 表格生成器 — 一键出对样/重复性表格
03 FOV 选型 — 相机镜头视野匹配
04 重复性分析 — 导入 Excel 自动重算 6σ
05 相关性分析 — 占位，下一步
强调：这些都是能直接用的，不是概念图。
接下来两页深入展示每个工具的真实界面。""",
    transition="zoom"))

# ════════════════════════════════════════════
# SLIDE 6 — TOOLS A (Case Query + Sheet Generator)
# ════════════════════════════════════════════
iw, ih = 540, 340
els6 = [rect("s6-bg", 0, 0, W, H, fill=NAVY)]
els6.append(txt("s6-title", M, 35, W-M*2, 42, "工具深挖 A",
    fs=38, fw=700, color=WHITE, align="left"))
# Left: Case Query
els6.append(img("s6-cq", M, 95, iw, ih, "asset:img_cq", fit="contain", radius=8,
    fx={"enter": "slide-left", "order": 1}))
els6.append(txt("s6-cq-lbl", M, 95+ih+10, iw, 28, "01 案件物件查询",
    fs=17, fw=600, color=CYAN, align="center"))
els6.append(txt("s6-cq-desc", M, 95+ih+38, iw, 40,
    "上传标准周报 Excel → 快速查询案子关联物件信息",
    fs=13, fw=400, color=CREAM, align="center", lh=1.3))
# Right: Sheet Generator
rx = M + iw + 30
els6.append(img("s6-sg", rx, 95, iw, ih, "asset:img_sg", fit="contain", radius=8,
    fx={"enter": "slide-right", "order": 2}))
els6.append(txt("s6-sg-lbl", rx, 95+ih+10, iw, 28, "02 表格生成器",
    fs=17, fw=600, color=CYAN, align="center"))
els6.append(txt("s6-sg-desc", rx, 95+ih+38, iw, 40,
    "选择模板 → 设参数 → 一键生成对样及重复性数据表格",
    fs=13, fw=400, color=CREAM, align="center", lh=1.3))
# Highlight box
els6.append(rect("s6-hl", M, 535, W-M*2, 55, fill="#0A3A62", radius=6))
els6.append(txt("s6-hl-t", M+20, 548, W-M*2-40, 34,
    "亮点：表格生成器支持直接导入 Cognex VisionPro .vpp 文件（免 SDK，纯浏览器解析）",
    fs=15, fw=500, color=ORANGE, align="center"))
slides.append(slide("s6", NAVY, els6,
    """双截图并列展示前两个工具。
左边案件查询：上传区域 + 格式说明面板清晰可见。
右边表格生成器：模板选择（重复性评估/相关性评估）、参数设置、实时预览。
亮点强调 .vpp 解析能力 —— 这是技术上有意思的点。
这两个工具解决的是日常最高频的操作。
接下来看另外两个更专业的工具。""",
    transition="slide"))

# ════════════════════════════════════════════
# SLIDE 7 — TOOLS B (FOV + Repeatability)
# ════════════════════════════════════════════
els7 = [rect("s7-bg", 0, 0, W, H, fill=NAVY)]
els7.append(txt("s7-title", M, 35, W-M*2, 42, "工具深挖 B",
    fs=38, fw=700, color=WHITE, align="left"))
# Left: FOV
els7.append(img("s7-fov", M, 95, iw, ih, "asset:img_fov", fit="contain", radius=8,
    fx={"enter": "slide-left", "order": 1}))
els7.append(txt("s7-fov-lbl", M, 95+ih+10, iw, 28, "03 FOV 选型工具",
    fs=17, fw=600, color=CYAN, align="center"))
# Big numbers for FOV
els7.append(txt("s7-fov-n1", M, 95+ih+42, iw//2-10, 32, "1,147",
    fs=28, fw=800, color=ORANGE, align="right", fontFamily=MONO,
    fx={"countUp": True}))
els7.append(txt("s7-fov-n1-l", M+iw//2+5, 95+ih+46, iw//2-15, 24, "台面阵相机",
    fs=13, fw=400, color=CREAM, align="left"))
els7.append(txt("s7-fov-n2", M+iw//2, 95+ih+72, iw//2-10, 32, "426",
    fs=28, fw=800, color=ORANGE, align="right", fontFamily=MONO,
    fx={"countUp": True}))
els7.append(txt("s7-fov-n2-l", M+iw//2*2+5, 95+ih+76, iw//2-15, 24, "款镜头",
    fs=13, fw=400, color=CREAM, align="left"))
# Right: Repeatability
els7.append(img("s7-rep", rx, 95, iw, ih, "asset:img_rep", fit="contain", radius=8,
    fx={"enter": "slide-right", "order": 2}))
els7.append(txt("s7-rep-lbl", rx, 95+ih+10, iw, 28, "04 重复性分析",
    fs=17, fw=600, color=CYAN, align="center"))
els7.append(txt("s7-rep-desc", rx, 95+ih+42, iw, 60,
    "导入 Excel → 自动重算 6σ → 三档判定\n异常定位 + Before/After 对比",
    fs=13, fw=400, color=CREAM, align="center", lh=1.4))
# Note about FOV loading state
els7.append(txt("s7-note", M, H-50, W-M*2, 22,
    "* FOV 截图显示首次加载状态（设备资料从 IndexedDB 初始化），实际使用时数据即时就绪",
    fs=12, fw=400, color=CREAM, align="center"))
slides.append(slide("s7", NAVY, els7,
    """后两个工具展示更深的专业能力。
FOV 选型：内置大量设备资料库（1147 相机 + 426 镜头），支持组合计算和按目标反向推荐。
大数字用 countUp 动效增强冲击力。
重复性分析：5 步工作流（总览→异常定位→单点诊断→Before/After→记录中心），
导入即重算，自动落到三档判定。
注：FOV 截图中"正在装入设备资料…"是 IndexedDB 首次初始化的正常状态，
实际使用时数据已缓存，秒开。
接下来从"做了什么"转到"用什么做的"—— 技术栈事实。""",
    transition="slide"))

# ════════════════════════════════════════════
# SLIDE 8 — TECH STACK (table)
# ════════════════════════════════════════════
els8 = [rect("s8-bg", 0, 0, W, H, fill=NAVY)]
els8.append(txt("s8-title", M, 50, W-M*2, 46, "技术事实",
    fs=42, fw=700, color=WHITE, align="left"))
els8.append(txt("s8-sub", M, 105, W-M*2, 22, "不是 PPT 里常见的漂亮话，都是代码里的事实",
    fs=17, fw=400, color=CYAN, align="left"))
# Tech stack table
table_data = {
    "columns": [{"w": 1.2}, {"w": 2}, {"w": 3}],
    "header": True,
    "style": {
        "headerBg": CYAN, "headerColor": NAVY, "borderColor": "#1A4A70",
        "borderWidth": 1, "cellPadX": 14, "cellPadY": 10,
        "fontSize": 15, "fontFamily": FONT, "color": PAPER, "radius": 6
    },
    "rows": [
        {"cells": [
            {"html": "<b>前端框架</b>", "color": NAVY},
            {"html": "React 19 + TypeScript", "bold": True},
            {"html": "最新稳定版，类型安全"}]},
        {"cells": [
            {"html": "<b>构建工具</b>", "color": NAVY},
            {"html": "Vite + Tailwind CSS 4", "bold": True},
            {"html": "极速 HMR，原子化 CSS"}]},
        {"cells": [
            {"html": "<b>后端</b>", "color": NAVY},
            {"html": "<b>无后端</b>", "bold": True, "color": ORANGE},
            {"html": "全部浏览器本地完成，数据不出电脑"}]},
        {"cells": [
            {"html": "<b>本地存储</b>", "color": NAVY},
            {"html": "IndexedDB", "bold": True},
            {"html": "FOV 设备资料库本机持久化（1,147 台相机）"}]},
        {"cells": [
            {"html": "<b>隔离方案</b>", "color": NAVY},
            {"html": "Shadow DOM", "bold": True},
            {"html": "重复性分析模块独立运行，不影响其他模块"}]},
        {"cells": [
            {"html": "<b>离线分发</b>", "color": NAVY},
            {"html": "vite-plugin-singlefile", "bold": True},
            {"html": "构建为一个 HTML 文件，双击即用"}]},
    ]
}
els8.append({"id": "s8-table", "type": "table",
    "x": M, "y": 148, "w": W-M*2, "h": 430, "rotation": 0, "opacity": 1,
    **table_data})
slides.append(slide("s8", NAVY, els8,
    """技术栈一览表。每一行都是可验证的事实。
关键强调点：
- 纯前端无后端 → 数据安全，团队可放心用
- IndexedDB → 大量设备数据本地存储
- Shadow DOM → 模块隔离的工程考量
- 单文件离线分发 → 降低使用门槛
这张表的作用是建立可信度：这不是玩具项目，是有工程规范的。
过渡：技术本身并不复杂。这正是我想说的下一个观点。""",
    transition="slide"))

# ════════════════════════════════════════════
# SLIDE 9 — CORE INSIGHT (the climax)
# ════════════════════════════════════════════
els9 = [rect("s9-bg", 0, 0, W, H, fill=NAVY)]
# Big statement
els9.append(txt("s9-big", M, 120, W-M*2, 80, "AI 时代，技术不难",
    fs=64, fw=800, color=WHITE, align="center",
    fx={"enter": "fade-up", "order": 1}))
els9.append(txt("s9-big2", M, 205, W-M*2, 54, "难的是把技术用到对的地方",
    fs=36, fw=600, color=CYAN, align="center",
    fx={"enter": "fade-up", "order": 2}))
# Evidence line
els9.append(rect("s9-line", W//2-100, 275, 200, 3, fill=ORANGE, opacity=0.8))
els9.append(txt("s9-ev", M, 295, W-M*2, 28, "这个项目就是证据 ↓",
    fs=17, fw=400, color=CREAM, align="center"))
# Evidence cards
ev_cards = [
    ("我不会写 React", "但我知道工具应该长什么样"),
    ("我不懂 Tailwind", "但我能描述出配色和布局的感觉"),
    ("我没有后端经验", "但我知道数据不应该离开本机"),
]
ecw, ech = 340, 100
ecx_start = (W - 3*ecw - 2*30) // 2
for i, (challenge, solution) in enumerate(ev_cards):
    ecx = ecx_start + i * (ecw + 30)
    ecy = 340
    els9.append(rect(f"s9-ec-{i}", ecx, ecy, ecw, ech, fill=PAPER, radius=8,
        fx={"enter": "fade-up", "order": 3+i}))
    els9.append(txt(f"s9-ec-c-{i}", ecx+16, ecy+14, ecw-32, 26, challenge,
        fs=17, fw=600, color=ORANGE, align="left"))
    els9.append(txt(f"s9-ec-s-{i}", ecx+16, ecy+44, ecw-32, 36, solution,
        fs=15, fw=400, color=INK, align="left", lh=1.3))
# Bottom takeaway
els9.append(rect("s9-btm", M, 475, W-M*2, 70, fill="#0A3A62", radius=8))
els9.append(txt("s9-btm-t", M+24, 492, W-M*2-48, 42,
    "关键不是你会多少技术，而是你能不能把问题说清楚 —— 然后 AI 帮你实现它。",
    fs=18, fw=500, color=WHITE, align="center", lh=1.3))
slides.append(slide("s9", NAVY, els9,
    """全 deck 高潮页。从个人故事升到普适认知。
大字宣言："AI 时代，技术不难，难的是把技术用到对的地方"
三个证据卡片展示"我不会 X，但我知道 Y"的模式 ——
这才是 Vibe Coding 的真正含义：领域知识 > 编程技能。
讲到这里可以停顿一下，让观众消化。
过渡：具体到我个人的收获是什么？""",
    transition="fade"))

# ════════════════════════════════════════════
# SLIDE 10 — TAKEAWAYS (3 insights)
# ════════════════════════════════════════════
takeaways = [
    ("01", "迭代真的快", "想法到能用的工具以天计。上午提需求，晚上就能演示。传统开发模式下这是不可能的。", CYAN),
    ("02", "AI 是结对伙伴", "不是替代品。它负责实现细节，我负责方向判断和需求把关。好的结果来自好的对话，而不是好的 prompt。", ORANGE),
    ("03", "规范不能省", "先定设计规范再动手，反而更快。AI 遵守规范输出的代码更一致，后续维护成本更低。", PAPER),
]
els10 = [rect("s10-bg", 0, 0, W, H, fill=NAVY)]
els10.append(txt("s10-title", M, 50, W-M*2, 46, "这次 Vibe Coding 的三点收获",
    fs=40, fw=700, color=WHITE, align="left"))
tw, th = W-M*2, 155
ty = 120
for i, (num, title, desc, accent) in enumerate(takeaways):
    tcy = ty + i * (th + 18)
    els10.append(rect(f"s10-card-{i}", M, tcy, tw, th, fill=PAPER if accent!=PAPER else "#0D3E66",
        radius=10, stroke=accent, sw=3,
        fx={"enter": "slide-up", "order": i+1}))
    tc = INK if accent != PAPER else PAPER
    dc = INK if accent != PAPER else CREAM
    els10.append(txt(f"s10-n-{i}", M+24, tcy+20, 50, 36, num,
        fs=28, fw=800, color=accent, fontFamily=MONO, align="left"))
    els10.append(txt(f"s10-t-{i}", M+80, tcy+20, tw-110, 32, title,
        fs=24, fw=700, color=tc, align="left"))
    els10.append(txt(f"s10-d-{i}", M+24, tcy+62, tw-48, 76, desc,
        fs=15, fw=400, color=dc, align="left", lh=1.45))
slides.append(slide("s10", NAVY, els10,
    """真诚复盘，不吹不黑。
三点收获：
1. 迭代速度 —— 天级交付是真的。但要说明这不代表"AI 能替你做完一切"，
   而是人机协作大幅压缩了反馈循环。
2. AI 定位 —— 强调"结对伙伴"而非"替代品"。这个区分很重要，
   避免让听众觉得你在鼓吹"AI 将取代程序员"。
3. 规范价值 —— 反直觉的发现：先花时间定规范，后面反而更快。
   这对团队协作也有启发意义。
过渡：那团队怎么拿到并使用这个工具？""",
    transition="slide"))

# ════════════════════════════════════════════
# SLIDE 11 — HOW TO USE (offline distribution)
# ════════════════════════════════════════════
steps_use = [
    ("1", "开发者跑一次构建", "npm run build:offline"),
    ("2", "拷贝 offline 文件夹", "发给任何同事"),
    ("3", "双击 start-offline.bat", "浏览器自动打开，直接用"),
]
els11 = [rect("s11-bg", 0, 0, W, H, fill=NAVY)]
els11.append(txt("s11-title", M, 50, W-M*2, 46, "怎么拿到 & 怎么用",
    fs=40, fw=700, color=WHITE, align="left"))
els11.append(txt("s11-sub", M, 108, W-M*2, 20, "三步，不需要装任何东西",
    fs=17, fw=400, color=CYAN, align="left"))
stw, sth = W-M*2, 90
sty = 150
for i, (num, title, desc) in enumerate(steps_use):
    stcy = sty + i * (sth + 16)
    # Number circle
    els11.append(rect(f"s11-n-{i}", M, stcy+18, 44, 44, fill=CYAN, radius=22))
    els11.append(txt(f"s11-nn-{i}", M, stcy+25, 44, 32, num,
        fs=24, fw=800, color=NAVY, align="center", fontFamily=MONO))
    # Content
    els11.append(txt(f"s11-t-{i}", M+58, stcy+14, 350, 30, title,
        fs=20, fw=600, color=WHITE, align="left"))
    els11.append(txt(f"s11-d-{i}", M+58, stcy+46, 350, 28, desc,
        fs=15, fw=400, color=CREAM, align="left", fontFamily=MONO))
    if i < 2:
        # Connector arrow
        els11.append({"id":f"s11-arrow-{i}","type":"shape","shape":"arrow",
            "x":M+20,"y":stcy+sth+2,"w":16,"h":14,"fill":CYAN,"opacity":0.5,
            "rotation":0,"stroke":"none","strokeWidth":0,"radius":0})
# Security note
els11.append(rect("s11-sec", M, 510, W-M*2, 60, fill="#0A3A62", radius=8))
els11.append(txt("s11-sec-t", M+20, 525, W-M*2-40, 34,
    "数据全部在浏览器本地处理，不上传、不留痕、不依赖网络",
    fs=17, fw=500, color=CYAN, align="center"))
slides.append(slide("s11", NAVY, els11,
    """实操指南页 —— 团队最关心的部分。
三步走：构建 → 分发 → 使用。极低门槛。
强调安全性：数据不出本机，这对企业环境很重要。
如果现场有条件，可以实际演示双击打开的过程。
过渡：最后，我想说的是……""",

    transition="slide"))

# ════════════════════════════════════════════
# SLIDE 12 — CTA
# ════════════════════════════════════════════
els12 = [rect("s12-bg", 0, 0, W, H, fill=NAVY)]
# Decorative top bar
els12.append(rect("s12-top", 0, 0, W, 4, fill=CYAN, opacity=0.6))
els12.append(txt("s12-kicker", M, 100, W-M*2, 28, "// YOUR TURN",
    fs=16, fw=400, color=CYAN, align="center", fontFamily=MONO))
els12.append(txt("s12-title", M, 145, W-M*2, 76, "你也试试用 AI",
    fs=64, fw=800, color=WHITE, align="center",
    fx={"enter": "fade-up", "order": 1}))
els12.append(txt("s12-sub", M, 235, W-M*2, 40, "不一定要会写代码",
    fs=28, fw=500, color=CREAM, align="center",
    fx={"enter": "fade-up", "order": 2}))
els12.append(txt("s12-sub2", M, 285, W-M*2, 34, "从一个你觉得「烦」的小需求开始",
    fs=22, fw=400, color=CYAN, align="center",
    fx={"enter": "fade-up", "order": 3}))
# Action hints
hints = ["找一个重复做的事", "说清楚你要什么", "让 AI 帮你实现", "迭代到好用"]
hx_start = (W - len(hints)*260) // 2 + 30
for i, hint in enumerate(hints):
    hx = hx_start + i * 260
    els12.append(rect(f"s12-h-dot-{i}", hx, 365, 8, 8, fill=ORANGE, radius=4))
    els12.append(txt(f"s12-h-{i}", hx+16, 358, 230, 24, hint,
        fs=15, fw=400, color=PAPER, align="left"))
# Bottom
els12.append(rect("s12-btm", 0, H-70, W, 70, fill="#052240"))
els12.append(txt("s12-btm-t", M, H-48, W-M*2, 30,
    "AOI LAB · 团队效率工具箱 · 用 AI 做出来，也欢迎你用 AI 做你自己的工具",
    fs=15, fw=400, color=CREAM, align="center"))
slides.append(slide("s12", NAVY, els12,
    """温暖收尾，降低行动门槛。
核心信息：你也可以做到。不需要技术背景，从一个"烦"你的小需求开始。
四步行动提示：找重复的事 → 说清需求 → AI 实现 → 迭代。
结尾语呼应开场：AOI LAB 是我的尝试，期待看到你的。
Q&A 时间。如果有人问"怎么开始学 Agent/Vibe Coding"，可以简单分享学习路径。
谢谢大家！""",
    transition="fade"))

# ════════════════════════════════════════════
# BUILD DOCUMENT
# ════════════════════════════════════════════
doc = {
    "format": "bento/slides",
    "version": 1,
    "docId": DOC_ID,
    "title": "AOI LAB · Vibe Coding 成果分享",
    "size": {"width": W, "height": H},
    "theme": {
        "background": NAVY,
        "color": PAPER,
        "accent": CYAN,
        "fontFamily": FONT,
        "chartPalette": [CYAN, ORANGE, PAPER, CREAM, "#4ECDC4"],
    },
    "slides": slides,
    "modified": NOW,
    "assets": assets,
}

with open(OUTPUT, "w", encoding="utf-8") as f:
    json.dump(doc, f, ensure_ascii=False, indent=2)

print(f"\n✅ deck.json written: {OUTPUT}")
print(f"   docId: {DOC_ID}")
print(f"   slides: {len(slides)}")
print(f"   assets: {len(assets)} images ({sum(len(v) for v in assets.values()) // 1024}KB total)")
