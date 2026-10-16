# AGENTS.md — AOI LAB

团队效率工具箱：React 19 + TypeScript + Vite + Tailwind CSS 4。纯前端，无后端。所有功能在浏览器本地完成。

## 怎么跑
- `npm install` → `npm run dev`（默认 http://localhost:5173；被占用时 Vite 自动顺延端口）
- Windows 一键启动：`start.bat`（自动装依赖 + 启动，依赖 WorkBuddy 托管 Node 路径，已用 CRLF 行尾保存）
- 生产构建：`npm run build` → `dist/`（出口 `tsc -b && vite build`）
- 离线单文件版：`npm run build:offline` → `offline/index.html`（vite-plugin-singlefile，给无 Node/无网电脑双击即用）
- 集成自检脚本：`npm run verify`（一次跑完全部，见下）或单独跑
  - `verify:repeatability` 04/05 的 Shadow DOM 集成与宿主注入
  - `verify:correlation` 05 解析器 + **判定口径**行为契约测试（喂合成 xlsx / 合成点集，断言输出与阈值生效）
  - `verify:correlation-e2e` 05 **真表全流程**端到端（零依赖 CDP，导真表 → 点分析 → 读 Shadow DOM 渲染结果 + 截图）。需先 `npm run build:offline`；样本表默认取 `~/Desktop/案例/1180M 準確性 之前.xlsx`，可用 `AOI_CORRELATION_SAMPLE=<绝对路径>` 换表；表或浏览器缺失自动 SKIP（退出码 0）。**改 05 的排版 / 渲染 / 交互必须跑这个**——它是唯一能拦住"算对了但显示错了"的检查
  - `verify:fov` FOV 默认数据集关键机型
  - `verify:launcher` / `verify:workspace` 启动器与 5 卡导航
  - `verify:lighting-report` 06 打光报告生成器门禁（**203 项断言**，源码级）：A 模板完整性（6 个壳 / manifest 与模板占位符一一对应 / 媒体回收闭合 / **需求壳与影像壳都清干净**）、B 填充保真（黄金 10 行规格 + **需求推导 4 行**逐字符比对源报告）、C 漏填不静默（token 残留 + warnings）、D 参数化（换镜头数字跟着动 / **逐工站需求推导 8 条：公差写法 / 无公差 / 整块覆盖 / 黑白 / 库外相机**）、E **工站增删克隆**（1/2/3 工站 → 包内计数闭合 / 页序 / 克隆页 rels 一致）、F **打光影像段**（工站→缺陷两层分组 / 页序 / 普通壳与特殊壳选择 / 没用到的壳删干净 / 名称行不带章节号）、G **标题条宽度自适应**（源稿实墨反向标定的口径）、H **12 页同构样例**（= 源报告，含页码非静态断言）、**J 图片·红圈·媒体·手动摆放·告警·红字规则**、**K 【1.檢測需求】页（文字展开 / 只贴图 / 等比适配居中 / 空页告警）+ 模板族注册表（默认族回退 / 族开关 imageHeader·hasConclusion / 逐工站公差）**、I LibreOffice 可打开（缺则 SKIP，页数用 pypdfium2 独立复核）。**直接 `import` `src/lighting-report/domain/*.ts`（Node 原生类型剥离），验的就是线上跑的那份代码**
  - `verify:lighting-report-e2e` 06 **真浏览器端到端**（零依赖 CDP，**69 项断言**）：开 `offline/index.html` → 进 06 → 填表 → **建缺陷组/改名/加页/切版式/填说明（含 `**红字**`）→ 用 CDP 把真图片文件塞进 `<input type=file>` → 验降采样尺寸（2400×1800→1600×1200、800×1200 不动）→ 拖图 → 拖拽画红圈** → 点"生成并下载" → **拦下真实下载** → 校验 pptx 字节（页数 / 页序 / 影像页各页不串味 / media 新增且全为 JPEG / 图片排在红圈之前 / 无 `{{` 残留 / 红色 run / Override 计数）→ 加/删工站各验一次；截图落 `../outputs/tool06-lighting-report-ui.png`。需先 `npm run build:offline`。**改 06 的 UI / 排版 / 下载路径必须跑这个**——它是唯一能拦住"算对了但生成/下载坏了"的检查
  - `verify:smoke` **真浏览器**冒烟（零依赖 CDP）——唯一能证明「04/05 的 document 代理注入真的生效」的检查。需先 `npm run build:offline`（测 `offline/index.html`）；找不到 Chromium/Edge 时自动 SKIP（退出码 0），不阻塞其它自检。不并入 `verify`，因为它是运行时检查且依赖构建产物
  - 无 lint / test，以 `npm run verify` + `tsc -b` 为准

## 工具（主页 6 卡，全部可用）
| 编号 | slug | 状态 |
|---|---|---|
| 01 | case-query 案件查询 | 可用 |
| 02 | sheet-generator 表格生成器 | 可用 |
| 03 | fov FOV 选型工具 | 可用 |
| 04 | repeatability 重复性分析 | 可用 |
| 05 | correlation 相关性判断 | 可用 |
| 06 | lighting-report 打光报告生成器 | **可用（P1 2026-09-28 / P2a·P2b 2026-09-29）**：填表 + 选型 + 建打光影像段（上传图片 / 拖拽调位 / 画红圈）→ 生成 pptx（封面 / 工站页 / 打光影像页全自动，工站与影像页都可增删）。P2c 工站环境小图 / P3 需求页与结论页 / P4 存档待做（见 `docs/LIGHTING-REPORT-GENERATOR-SPEC.md`，§12 口径 / §13 P2a / §14 P2b） |

工具切换用 React `useState`，**无路由 / 无 URL**（本地打开、GitHub Pages 子路径都不会 404）。`src/types.ts` 的 `ToolId` 联合现含全部 6 个 slug（`lighting-report` 已加入）。

## 技术栈与关键依赖
- `exceljs` 生成 Excel；`xlsx` 解析上传；`jszip` 做 XLSX 的 ZIP 后处理
  - ⚠️ `xlsx` 走 SheetJS 官方分发（`package.json` 里是 cdn.sheetjs.com 的 tarball），**不是** npm registry。npm 上的 `xlsx@0.18.5` 是停更快照且带 CVE-2023-30533 / CVE-2024-22363，不要改回去。
- `echarts` 渲染相关性判断的散点图（经 `src/correlation/` 宿主注入 Shadow DOM 隔离脚本）
- 图表（折线图 lineChart）通过 `src/lib/chart-injector.ts` 向 Excel 注入 OOXML
- 重复性分析 V1.6 通过 React 宿主 + Shadow DOM 隔离运行（`src/repeatability/repeatability-v1.6.html`），避免其全局 CSS/DOM 影响其它模块
- 相关性判断 v13 同样用 React 宿主 + Shadow DOM 隔离（`src/correlation/correlation-v13.html`），依赖（echarts/xlsx）由宿主从 npm 注入，不再走 CDN
- FOV 设备资料库用浏览器 IndexedDB 本地保存

## 目录与约定
- `src/lib/`：纯逻辑 — `vpp-parser.ts`(VisionPro .vpp NRBF 解析)、`vpp-types.ts`(类型，含 tolerancePositive/Negative 不对称公差字段)、`chart-injector.ts`(图表注入)、`correlation.ts`/`repeatability.ts`(Excel 生成)、`parser.ts`(案件查询)、`utils.ts`(繁简转换)
- `src/components/`：布局（Header/Footer/ToolCard/ToolWorkbenchNav/HelpModal/Icons）+ `case-query/` + `sheet-generator/`
- `src/fov/`：FOV 工作台、设备资料库、IndexedDB 存储、默认数据 `data/`（cameras.json 1,147 台 / lenses.json 426 款）
- `src/repeatability/`：重复性分析 React 宿主 + 隔离源码
- `src/correlation/`：相关性判断 React 宿主 + 隔离源码（`correlation-v13.html`）
- `src/lighting-report/`：**06 打光报告生成器**。`LightingReportWorkbench.tsx`（四段式 UI，打光影像段挂在工站卡内部）+ `lighting-report.css` + `assets/{template.pptx,placeholders.json}`（**模板是产物不是源文件，不要手改**）+ **`domain/`（纯逻辑，浏览器与 Node 共用同一份实现）**：`types.ts`（领域类型）、`xml.ts`（XML 填充 / run 切分 / 红字规则）、`surgery.ts`（**页面克隆/删除/重排：addSlide/removeSlides/setSlideOrder + 4 处注册闭合**）、`spec.ts`（规格行生成 + DOF 40% 折减 + 从 03 报告文本解析设备 + 影像页 token/工厂）、`layout.ts`（标题条宽度字符宽度模型 + 影像页说明框宽度）、**`plan.ts`（`planPages()` 产物页序，纯函数）**、**`template-layout.ts`（模板壳映射的唯一真相源，三处 import）**、`generate.ts`（`generateReport()` 总装：算页序 → 删用不到的壳 → 分派 part → 填 token → 贴图/画圈 → `setSlideOrder`）、**`canvas.ts`（坐标 → `<p:pic>`/椭圆 `<p:sp>` + 自动摆放 + 红圈归一化，P2b 三处复用的画布引擎）**）+ `ImagePageEditor.tsx`（单页画布与图片清单）+ `image-io.ts`（**只跑在浏览器**的上传读取与降采样）
- `scripts/`：`verify-*.mjs` 自检脚本（9 个：8 个 `verify:*` + `smoke-browser.mjs`，全部已登记进 `package.json`）
- `scripts/lighting-report/`：06 的 PPTX 管线。`build-template.mjs` = 一次性模板预处理（按 `cNvPr id` 定位 → txBody 压成「单段单 run + 占位符」→ **12 页归一化成 6 个壳**：封面/需求/工站/影像-普通/影像-特殊/結論；影像壳只留骨架 + 回收孤儿媒体 → 注销 notesSlides）；`source-images.mjs` = 从源报告读回「图片位置 + 红圈」（circle→图片归属）；`make-samples.mjs` = 产出 5 份样张到 `../outputs/`（replica 用源报告真实照片与真实坐标）。**运行时填充逻辑不在 `scripts/` 里，已整体移植进 `src/lighting-report/domain/`，不要在这里另写一份实现**
- `docs/`：`CODE_REVIEW_2026-09-11.md`（代码审查报告）、`CORRELATION_UI_REDESIGN_SPEC.md`（05 改版方案，做 05 的 UI 改动前先读它）、`LIGHTING-REPORT-GENERATOR-SPEC.md`（**06 方案 + P0/P1/P2a 结果，做 06 前必读**，§9.5 是 P1 交付地图、§12 是报告结构口径、§13 是 P2a 结果）、`repeatability-msa-improvement-plan.md`、`reference/`
- `dist/`（GH Pages 多文件产物）、`offline/`（单文件离线产物）—— 均已 gitignore，不入库
- **样式前缀规范**：按功能命名（`generator-*`、`cq-*`、`vpp-*`、`fov-*`），全局样式集中在 `src/index.css`，FOV 样式独立放 `src/fov/fov.css`
- **设计规范（强制）**：开发前先读 `SUBPAGE_DESIGN_GUIDELINES.md` 与 `FRONTEND_DESIGN_GUIDELINES.md`
  - 配色：navy #072F50 背景 / paper #FFFAEA 纸张 / cyan #24D4D3 强调 / orange #FF9D2E 操作
  - 纯 2D 风格，实色阴影，无模糊 / 玻璃 / 渐变

## 当前状态
- **05 相关性判断 UI + 功能改版已于 2026-09-20 落地**（方案见 `docs/CORRELATION_UI_REDESIGN_SPEC.md`）。`src/correlation/correlation-v13.html` 已从"说明堆叠"改成一页到底：结论条置顶 → 识别卡 → 「照这个填」补偿表 → 「哪些没对上」对齐矩阵 + 残差诊断 → 明细与导出（默认折叠）。**算法段（`parseWorkbook` / `analyzeBySeat` / `buildGlobalPlans` / `robustFit` / `bestComboB`）逐字节保留**，改版只换壳与渲染。常显说明文字从约 3300 字压到 **293 字**，完整口径移入 `.spec-note` 折叠区（442 字）。
- **2026-09-21 续改：组合口径从「乘坐 × 样品」改为「样品（跨乘坐合并）」**（见上「判定口径 ②」）。识别卡新增一句跨乘坐口径说明（`.rec-merge`），对齐矩阵从"每个乘坐一个块"改成**一张表：行 = 样品、列按乘坐分段 + 判定列**（`.mtx-table` / `.mtx-th-seat` / `.mtx-v`），明细从"每个乘坐一个块"改成**一行一个样品**（逐点表带「乘坐」列与「本次补偿」列）。真表数字随之整体变化（结论条 10 个样品 / 原始 2 / 补偿后 5，门槛 ≥5）。
  - **同日追加口径：补偿默认按「检测项目」跨乘坐共用**（`#multiCompGroup` 默认 `item`）——左右乘坐必须共用一个补偿值，理由与影响见文末「下一步」第 1 条。这是**覆盖**参考源码包交接文档 §8 规则 1 的上级口径，不要"照文档"改回默认 `seat`。
  - 术语按页面口径统一为 **乘坐 · 样品 · 检测项目 · 组合**（代码字段名 `product`/`prodHeads` 等未改，改名会牵动断言，别顺手动）。
  - 「变换类型」三档下拉已删除，改为隐式 `linear` + 高级参数展开。
  - 导出补偿后 xlsx 走宿主注入的 `XLSX`（不是 `exceljs`），结构 = 原表 + 对照 sheet。
  - 新能力：**残差诊断分流**。数学依据（严格，不是经验阈值）：`a` 固定时存在 `b` 让组合内全部点位对上 **⟺ `span(r) = max(r) − min(r) ≤ 2·tol`**，slack `= 2·tol − span`。据此分四类：`offset`（本身可补偿但可行区间与本组其它组合不重合）/ `range`（量程差型，需动 a）/ `scatter`（跨度 > 2tol 且 `aOk`，补偿救不了）/ `lost`（**原始本来能对上、被补偿值推出容差**）。诊断只加理由，**不回写判定结果**。
- Git：`main` 分支，截至 2026-09-11 有 12 次提交。远端 `origin` = github.com/mccsosix/aoi-lab-combined，另有 `gh-pages`/`legacy-fullstack`/`standalone-vite`/`aoi-lab-local-completed` 分支（历史/部署面，未在本地核对 live）。
- `dist/`、`offline/`、`*.tsbuildinfo`、`.playwright-mcp/`、`.claude/settings.local.json` 均已 gitignore（见 `.gitignore`）；`dist/`、`offline/` 为本地构建产物，**可能滞后于源码，使用前重新构建**（判断方法：比对 `dist/assets/` 与 `src/` 的 mtime）。
- 三个出口**互不通用**：`dist/` 因 `vite.config.ts` 设 `base:'/aoi-lab-combined/'` 而使用绝对路径，`file://` 双击必然白屏，只能部署到 GH Pages 子路径；`offline/index.html`（`base:'./'` + singlefile）才能双击即用。
- `index.html` 仍含 Google Fonts 外链，所以离线版并非严格"零外部请求"（无网时静默回落到系统字体）。
- **仓库清理（2026-10-16）**：`deck/`（3 版 bento 演示 HTML + 截图 + `gen_deck.py` + `reports/`，约 3.7 MB）、根目录 `cover.jpg` / `present_slide1_cover.png`、`src/fov/data/lens-extraction-report.json`（一次性提取报告，零引用）已从工作树移除，内容仍保留在 git 历史里。
- 历次合并/导入的一次性记录（根目录 `INTEGRATION_NOTES.md`、`REPEATABILITY_INTEGRATION_NOTES.md`、`docs/FOV_CAMERA_IMPORT_NOTES.md`、`docs/superpowers/` 等）已在 2026-08-14 收尾中删除，内容保留在 git 历史里，不再维护；权威文档以本文件 + README + 代码为准。

## 验证 04/05 这类「隔离 HTML 工具」的改动
1. `npx tsc -b` 只保宿主与 `src/lib`，**保不了 HTML 字符串里的脚本**（它们走 `new Function` 执行，不在 TS 保护范围）。
2. `npm run verify`：其中 `verify:correlation` 会把 `correlation-v13.html` 的 `<script>` 取出来用 DOM 桩执行，直接调 `parseWorkbook` / `analyzeBySeat` 断言**行为**。改了 05 的判定逻辑就往这里加断言，别只加 `includes(...)`（字符串存在性断言拦不住逻辑回归）。
3. `npm run build:offline` → `npm run verify:smoke`：唯一能证明「宿主把 document 代理注入 Shadow DOM 真的生效」的检查（需先构建，找不到浏览器会自动 SKIP）。
4. 想验「真数据跑完整流程」（导入 xlsx → 出结论 → 读渲染结果）：**直接跑 `npm run build:offline && npm run verify:correlation-e2e`**，别再从零写。它用 Edge/Chrome headless + 零依赖 CDP，`shadow.getElementById('excelFileInput')` + `DataTransfer` + `new File([...])` 注入真表（`input.files = dt.files` 在 Chromium 可用）→ 点 `multiAnalyzeBtn` → 断言结论条 / 识别卡 / 补偿表 / 对齐矩阵 / 未对上清单 / 文字预算 / 弹窗与导出，并把两张截图落到 `../outputs/`。换样本表用 `AOI_CORRELATION_SAMPLE=<绝对路径>`。骨架抄自 `scripts/smoke-browser.mjs`。

## 下一步
- **06 打光报告生成器：P0 尖刺 + P1 + P2a + P2b + P2c 已交付（2026-09-30），工具可用**（方案与结果全文在 `docs/LIGHTING-REPORT-GENERATOR-SPEC.md`，**改 06 之前必读**；§9.5 是 P1 交付地图、§12 是报告结构口径、§13 是 P2a 结果、§14 是 P2b 结果、§15 是 P2c 结果）。
  - **已完成**：`src/lighting-report/domain/*.ts`（算法，浏览器与 Node 共用）+ `LightingReportWorkbench.tsx`（四段式 UI，打光影像段在工站卡内部）+ `ImagePageEditor.tsx` / `image-io.ts` + CSS；模板**归一化为 6 个壳**（89 KB，占位符 v4/15 个）；**【1.檢測需求】页可填（手打文字 / 贴需求表图）**；工站可增删（克隆）；**需求推导逐工站各填各的（公差 / 检测说明 / 镜头类型 / 彩色），相机像素按本站型号识别**；**打光影像页按 工站→缺陷 两层生成，图片上传即降采样、可拖拽调位、可拖出红圈，页序由 `planPages()` 算出**；**模板族注册表 + 顶部版式选择器**（当前只有密封圈一族）；`verify:lighting-report` **203/0**、`verify:lighting-report-e2e` **80/0**；离线单文件版已重建（含内嵌模板）。
  - 用户 2026-09-28 / 09-29 / 09-30 拍板（**都已落地**）：版式**严格复刻**；DOF 40% 是**本厂通用规则**（`DEFAULT_DOF_DERATE = 0.4`，**只加在 06 侧，不改 03 的公式**）；封面标题**两个输入框**；工站**可增删、起码 1 个**；产品尺寸/公差**「从 03 报告文本带入 + 手工填」两条路都要**；**不做 Excel 批量入口**；打光影像页分**工站→缺陷**两层、页面里的影像段**紧跟自己的工站**；影像页图片用**自动摆放 + 可拖拽微调**（P2b）；**需求页 = 一张图或手打项目名称，不是字段体系**；**相机像素/彩色搬去工站按型号识别**；**需求推导逐工站 + 可整块覆盖**；**加模板族选择器**（P2c）。
  - **路线是「模板占位符化 + 浏览器端 OOXML patch」，不要改成从零生成 pptx，也不要引入服务端 python-pptx**（会破坏 `offline/index.html` 双击即用的交付模型）。
  - **一律按 `cNvPr id` 定位 shape，绝不按 shape 名**（同一页有 4 个 `文本框 43`、多个 `图片 8`，名字简繁混杂）。
  - **模板里每个可变块已被压成「单段 + 单 run + `{{key}}`」**；填充规则是「整段文本恰好等于一个 token 就展开成 N 段，否则内联替换」。`(新增)` 与标题里的「（…）」红字**不靠模板 run 切分**，由运行时 `TOKEN_RULES` 重建（`FF0000` + `b="1"`，`solidFill` 必须在 `latin` 之前）。
  - **单一实现纪律**：填充/克隆/排版逻辑只写在 `src/lighting-report/domain/`，Node 自检脚本直接 `import` 同一份 `.ts`（Node 22 类型剥离 + 显式 `.ts` 后缀）。**不要在 `scripts/` 里另写一份 `.mjs` 实现**。
  - **页序只能由 `planPages()` 决定，不要再在插页时算下标**（P2a 之前就是靠下标凑，工站增删一多就错乱）。要改顺序就改 `plan.ts` 里 push 的次序，`setSlideOrder()` 会一次性重写 `sldIdLst`。
  - **壳映射只能改 `domain/template-layout.ts`** —— `build-template.mjs` / `generate.ts` / 门禁三处都 import 它。改完必重跑 `npm run lighting-report:build-template -- "<源报告.pptx>"`。族约定（`TemplateConventions`）**只放版式开关**，不放具体报告的字段名；加一族 = 改注册表 + 跑一遍模板预处理，UI 的 `TemplatePicker` 不用动。
  - **需求推导是逐工站的**（`spec.ts` 的 `buildRequireLines(station, cam, mag)`）：`requireLead` / `toleranceMm` + `toleranceStyle`（`pm`｜`band`）/ `inspectNote` / `lensKind` / `colorCamera` / `requireOverride`。**不要再引入「全报告一份」的全局需求对象**。
  - **相机像素 / 彩色 / 镜头类型属于工站**（按 `cameraModel` 查设备库），**不属于**【1.檢測需求】页 —— 那一页只有「文字（一行一段）+ 可选一张需求表图」（`RequirementSpec`）。
  - ✅ **页脚 `Page:N` 是 `sldNum` 域，跟着 `sldIdLst` 走，不需要回写**（P2a 实测推翻了 P0 的"静态文本"误判）。看到 `Page:N` 不要试图处理。
  - **克隆页的坑**（P1 踩过、P2a 重标定）：模板页的标题条宽度会被克隆页继承 → 长标题溢出（红字落到白底）。已用 `layout.ts` 的字符宽度模型（**CJK 0.9417em / 拉丁 0.6173em / 空格 0.30em + 内边距 14.17pt + 8pt 余量**）解决。**口径是"不裁切"，不是"等于源稿"** —— 源报告的条子是手拖的，slide3 最后一个字本来就贴着边被裁掉了。
  - **画布坐标只能由 `domain/canvas.ts` 算**（图片框 / 自动摆放 / 红圈归一化 / pt→EMU），UI 只把结果乘成百分比显示；**不要在组件里另算一套换算**（预览与产物会立刻对不上）。红圈的 `x/y/w/h` 是**图片相对归一化**坐标，所以重排图片时圈自动跟着走，不需要重算。
  - **spTree 顺序固定「先所有图片、后所有红圈」** —— 反过来圈会被图盖住，肉眼很难发现、导出后一定不对。门禁 J 段与 E2E 各断言一次。
  - **红字三条规则全在 `domain/xml.ts` 的 `TOKEN_RULES`**：标题「（…）」、名称行结尾的 `-特殊`、说明里的 `**…**`。UI 的 `markInline` 必须与它同口径（预览与产物同源），改一处就要改另一处。**`-特殊` 只属于名称行**；标题条**永远**是基础缺陷名。
  - **名称行与标题条是两个前缀**（P2b 踩过）：标题条 = `IMAGE_SECTION_PREFIX`（`3.打光影像-{缺陷}`），名称行 = `IMAGE_CAPTION_PREFIX`（`打光影像-{缺陷}`，**不带章节号**）。源报告就是这样。
  - **上传图片必须先降采样再进模型**（`image-io.ts`，长边 > 1600 才压、PNG 先铺白底再转 JPEG、同图跨页去重）。现场图 4000×3000，不压一页 4 张就 30 MB。原始文件**不入 `ReportModel`**。
  - **影像页的箭头连接符（源报告 slides 6/7/8 各 2 根 `p:cxnSp`）本版不生成** —— 样张脚本会打印"跳过 N 根箭头"。
  - 待办边界（**别顺手做**）：P2c 工站环境小图组件盘、P3a 需求页、P3b 结论页、JSON 存档。
  - **唯一没被自动化覆盖的事：WPS / PowerPoint 人工打开验收还没做** —— 交付给用户后需人工补这一步（自动化只用 LibreOffice + pypdfium2 验过"能打开 + 页数对"）。建议拿 `outputs/lighting-2stations-replica.pptx`（12 页，与源报告同构）去验。

- **05 相关性判断：口径以用户 2026-09-20 的两条明确要求为准**（参考源码包 `相关性判断器_完整源码包`（v13 单文件版 + 交接文档）为底稿；用户曾明确「结合它，他的补偿思路是对的」，但下述第 1 条**覆盖**了交接文档 §8 规则 1 的表述）：
  - **① 补偿共用单位两档，页面开关 `#multiCompGroup` 切换，默认 `item`（按检测项目跨乘坐共用）**：
    - `item`（**默认**，用户 2026-09-20 追加口径）同一个检测项目**跨产品、跨乘坐**共用一个 b。**理由：一套测量程序只能填一个补偿值**——左乘坐舌片与右乘坐舌片同属检测项目 `舌片TPY`，必须共用同一个 `b`，不能各填一个。真表 1180M 上 `b = −0.0096`，对上 12/20。
    - `seat`（= 交接文档 §8 规则 1 的原始表述，与 item 并列保留）**每个乘坐一套统一函数**——该乘坐所有产品共用一套 `y = ax + b`，绝不能每个产品单独一个函数；同一乘坐内有多个检测项目时各给一个 b。现场**确实支持分乘坐设值**时才用它（真表：左 `−0.0105` / 右 `−0.0077`，对上 13/20）。
    - ⚠️ **交接文档 §8 规则 1 只规定了「同一乘坐内 10 个产品共用一套函数」（防的是"每个产品一个 b"），既没授权也没禁止跨乘坐取值不同**；跨乘坐必须一致是用户本次追加的口径，优先级更高。改这里之前先问用户，别"按文档"改回默认 seat。
    - **两档共同的底线：绝不能退化成"每个产品一个 b"**。表里**没有检测项目列**时 `item` 档不成立 → **`pref` 拉回 `seat`，且不建 `itemFix/itemFit` 两个方案**（分组会退回"每乘坐一套"，与 seat 档完全重复且标签误导）。
  - **② 展示**：默认档下补偿表要有「覆盖乘坐」列，写出这个 b 覆盖了哪几个乘坐（如 `左乘坐舌片、右乘坐舌片`）；表头在 `seat` 档下叫「乘坐」，`item` 档下叫「覆盖乘坐」。明细的逐点表每行带「本次补偿」列，直接显示这个点位用的是哪个 (a, b) —— `seat` 档下左右乘坐不同，摆出来现场才不会猜错。
  - 四个方案 = 2 共用单位 × 2（动不动 a），id 为 `seatFix / seatFit / itemFix / itemFit`（**id 名不要改**，CSV 导出与断言依赖）。推荐顺序：先按页面选的共用单位试「只改 b」→ 同档「改 a」→ 降级到另一档。**"只改 b"永远优先于"改 a"**。
  - **a（分辨率缩放）必须由 `robustFit`（Theil-Sen 初值 → 内点 OLS）如实拟合，`aTol` 只用于判断 `aOk = |a−1| ≤ aTol`，绝不限制拟合范围**（交接文档 §8.3「a 不强制 =1，最好趋近 1（拟合，不做死）」）。两个历史错误都要避免：① 夹在 `[1−aTol, 1+aTol]` 内搜 → 真表上 a 恒为边界值 0.9000，是假值；② 放开到 `[0.2, 2]` 搜 → 会挑出 a≈0.5 把点云压成常数的退化解。真表 1180M 实测 `robustFit` 给出 左 a=0.5536 / 右 a=0.5804，`aOk=false`、`compOk=false`——**如实标 ✗ 就是在告诉现场「别硬改 a，只改 b」**。
  - 选 b 用 `bestComboB`：按「组合整体对上」的区间覆盖挑，同分时取靠近**残差中位数**的 b（区间端点会让某点正好压在 ±容差边界上，判定很脆）。
- **05 相关性判断的判定口径（三处都不能改；改错会被 parser + E2E 双重拦住）**：
  - **① 样品层是严格的**：一个样品内**全部点位** `|gap| ≤ 容差` 才算「对上」（= 交接文档说的「完全达标」）。**不要**改成「≥门槛比例的点位对上」——一个样品只有 3 个点时 `ceil(3×50%)=2`，有点位超差也会被判成「对上」。
  - **② ★ 组合 = 样品，跨乘坐合并（用户 2026-09-21 修正，最容易改错的一条）**：同名样品（如 `1#`）在左乘坐、右乘坐各有一组点位，它们是**同一个组合**；「对上」= **它出现过的每个乘坐上的全部点位都达标**（取交集）。
    - 分母 = **去重后的样品数**（真表 10），不是 乘坐×样品（20）；门槛 = `ceil(样品数 × 门槛比例)`（10 → ≥5，= 交接文档 §8.2「≥5 个完全达标即算成功」）。
    - **绝不把各乘坐的对上数相加**。真表 1180M：左 6/10 + 右 6/10 = 12，真正达标的只有交集 **5** 个；旧口径报成 13/20 就是这个错（用户原话：「左边对上 123456、右边对上 234567，只能算对上 23456」）。
    - 数据结构：`combos` 的一支 = 一个样品，形如 `{ key, name, seats[], pts:[[CCD, QV, 项目名, 乘坐名]…] }`（**点位自带乘坐标签**）；分组键按**点位**算（`item` 档 = 项目名，`seat` 档 = `乘坐@@项目`），**不能挂在样品上**（一个样品横跨两个乘坐）。`detail`（样品级判定 + `bySeat` 小计）与 `byCombo`（样品级逐点结果，供矩阵/明细/导出/散点图复用）都挂在 **plan** 上，不是 `global` 上。
    - 分乘坐的 6/10、6/10 只作"哪个乘坐拖后腿"的定位信息展示，**判定以整样品为准**（对齐矩阵最右列 + 补偿表「对上样品」列，两处必须一致）。
  - **③ 通过门槛**（页面参数 `#multiAlignRate`，默认 50%）只作用在**个数层**：对上样品数 ≥ 门槛 → 该方案可行。
  - 回归断言分两处：`scripts/verify-correlation-parser.mjs`（DOM 桩跑算法："算得对"——含 ★「左对上 1~6、右对上 2~7 只能算 2#~6# 共 5 个」（`CROSS` 段）、「3 点样品只对上 2 点必须判不对上」「a 必须拟合出真实斜率 0.9 而非夹到 0.95/边界」「默认档 = item，labelled 表推荐 itemFix」「item 档下同一检测项目只能有 1 个 b 且 seats 报出两个乘坐」「**没有项目列时 itemFix 必须为 null，绝不退化成按 1#/2# 分组**」）；`scripts/verify-correlation-e2e.mjs`（真浏览器 + 真表："算完还看得对"——含 ★「结论条必须报 10 个样品 / 原始只对上 2 个、不许再出现『组合』字样」「补偿表只能 1 行、覆盖乘坐 = 左+右」「矩阵判定列 ✓ 数必须 = 补偿表的对上样品数」「分乘坐之和 12 必须 > 判定数 5」「未对上条目每条都要标出哪个乘坐拖后腿」）。**改 05 的排版 / 渲染 / 交互必须跑 E2E，parser 测不到渲染。**
- **05 已知取舍（不是 bug，动之前先问用户）**：真表 1180M 上，默认方案（按检测项目共用一个 b = −0.0096）会把 **1 个**原本能对上的样品推出容差（`2#`：左乘坐 3/3 全对，右乘坐被推出 1 点 → E2E 里的 `cls-lost`）。收益是整体 2→5 个样品对上（门槛 ≥5，刚好可行），代价是牺牲 1 个原本就好的样品。切到 `seat` 档能对上 6/10（`seatFit` 7/10），代价是现场要填两个补偿值（违反"一套程序一个补偿"）。当前只在 UI 里如实提示「确认是否接受 · 或换更保守的 b」，**没有**自动给"不牺牲任何原始对上样品"的保守方案。要不要加第二个候选 b（约束 `lost=0` 前提下的最优解）是个产品决策。
- 改动 FOV 默认数据（`src/fov/data/*.json`）后需重跑 `npm run build:offline` 更新离线版。默认数据集版本号由 `useDeviceLibrary` 按数据摘要自动计算，不用手改常量。
- `src/lib/correlation.ts` 仍是表格生成器侧的「相关性评估 Excel」生成逻辑（供 02 表格生成器用），与 05 相关性判断器（读对样表做对齐判断）职责不同，勿混淆。
- 04/05 是"HTML 字符串 + `new Function`"执行的隔离脚本，**不受 TypeScript 保护**。改它们后必须跑 `npm run verify`（含 05 的语法与行为契约检查）。
- 04 与 05 现在共用同一套宿主注入方式（向 `new Function` 注入 document 代理）。**不要再回到 `String.replace` 改旧 HTML 源码文本的老路子** —— 改一行空格就会静默失败，`verify:repeatability` 里有断言拦它。
- 04/05 的 Shadow DOM **挂在 `<section class="*-tool-host">` 的内层 `<div ref={hostRef}>` 上，不是 section 上**；且 Shadow DOM 内容不会序列化进 `outerHTML`。排查"是否挂载"只能读 `host.shadowRoot`，别用 `outerHTML` 或 `section.shadowRoot` 判断（`smoke-browser.mjs` 早期就在这里踩过坑）。
