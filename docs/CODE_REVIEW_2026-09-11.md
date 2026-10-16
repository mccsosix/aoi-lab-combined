# AOI LAB 代码审查报告

审查日期：2026-09-11 ｜ 范围：`aoi-lab-combined/`（主应用）＋`相关性判断器_完整源码包/`（历史交付物）
方法：全量源码通读 + `tsc -b` + 3 个自检脚本 + 数据完整性/性能实测

---

## 0. 结论摘要

项目整体**工程化程度高于同类内部工具**：TypeScript 严格模式、零后端、模块边界清晰、有集成自检脚本、离线单文件与 GH Pages 双出口。核心业务口径（6σ/T、y=ax+b 优先调 b）在代码中实现正确，与 `MEMORY.md` 记录的硬性约束一致。

实测通过：

| 检查 | 结果 |
|---|---|
| `tsc -b --force` | PASS（0 错误） |
| `verify:repeatability` | PASS |
| `verify:launcher` | PASS |
| `verify:workspace` | PASS |

主要问题集中在四类：**① 无输入上界导致的卡死/劣化**、**② 两个"隔离"工具的宿主注入机制脆弱**、**③ 静默丢数据/静默排除**、**④ 文档与构建脚本漂移**。没有发现远程代码执行、密钥泄露或网络数据外传——所有计算确实都在浏览器本地完成。

**必须先修 3 项（P0）**：xlsx 依赖版本、生成参数无上界、重复性嵌入态 `window.scrollTo` 抢滚动。
**建议尽快修 5 项（P1）**：见第 5 节。

---

## 1. 运行方式

### 1.1 命令

```bash
npm install
npm run dev              # Vite dev server，默认 5173（占用时自动顺延）
npm run build            # tsc -b && vite build → dist/
npm run build:offline    # vite-plugin-singlefile → offline/index.html（单文件，含全部数据）
npm run preview          # 预览 dist
start.bat                # Windows 一键：检查 Node/npm → 装依赖 → 占用检查 → 起 dev
start-offline.bat        # 离线版入口（双击 offline/index.html 亦可）
```

### 1.2 自检

```bash
npm run verify:repeatability   # 校验 04/05 的 Shadow DOM 集成与补丁可行性
npm run verify:launcher        # 校验 start.bat 约定
npm run verify:workspace       # 校验 5 卡工作台导航
```

> ⚠️ `scripts/verify-fov-update.mjs` 存在但**未登记进 `package.json`**，属于孤儿脚本，无法通过 npm 调用（会随 FOV 数据集更新而失效地"沉默"）。

### 1.3 部署形态（三种，互不通用）

| 形态 | 产物 | 可双击打开？ | 说明 |
|---|---|---|---|
| 开发 | dev server | — | 日常开发 |
| `dist/` | 多文件 + 哈希资源 | ❌ | `vite.config.ts` 设 `base:'/aoi-lab-combined/'`，`dist/index.html` 引用**绝对路径** `/aoi-lab-combined/assets/...`，用 `file://` 打开必然白屏；只能部署到 GH Pages 子路径 |
| `offline/` | 单文件 4.0 MB | ✅ | `base:'./'` + singlefile，双击即用 |

**实测产物新鲜度**：`dist/` 构建于 09-10 16:26、`offline/index.html` 构建于 09-10 16:25，均**新于**最新源码（`correlation-v13.html` 09-07）。AGENTS.md 中"dist/offline 可能滞后"的警告当前不成立，但该风险结构长期存在。

**离线版残留外链**：`index.html` 含 Google Fonts 的 `<link>`（Geist / Geist Mono）。无网环境会回落到系统字体（不报错），但严格意义上的"零外部请求"不成立，且内网环境可能触发 DNS 超时等待。

---

## 2. 依赖项

### 2.1 运行时（6 个，全部客户端）

| 包 | 声明 | 实装 | 用途 | 风险 |
|---|---|---|---|---|
| `xlsx` | ^0.18.5 | **0.18.5** | 案件查询、相关性判断解析上传的 Excel | ⚠️ **P0**：0.18.5 受 CVE-2023-30533（原型污染，<0.19.3）与 CVE-2024-22363（ReDoS，<0.20.2）影响。SheetJS 自 0.18.5 后已迁出 npm，npm 上的该包实质停更 → **必须换官方源或替代方案** |
| `exceljs` | ^4.4.0 | 4.4.0 | 生成重复性/相关性 Excel、OOXML 图表 | 低 |
| `jszip` | ^3.10.1 | 3.10.1 | 图表注入的 XLSX ZIP 后处理 | 低 |
| `echarts` | ^5.6.0 | 5.6.0 | 05 工具散点图（由宿主注入 Shadow DOM） | 低 |
| `react` / `react-dom` | ^19.2.7 | 19.2.8 | UI | 低 |

### 2.2 构建期

Vite 6.4.3、TypeScript 5.8.3、Tailwind CSS 4.1.4、`@vitejs/plugin-react` 4.6.0、`vite-plugin-singlefile` 2.3.3。

### 2.3 缺失的工具链（现状即设计选择，但值得知情）

- **无 ESLint / Prettier / 测试框架**。`tsconfig.app.json` 里 `noUnusedLocals: false`、`noUnusedParameters: false`，所以**死代码与未用变量不会被任何环节发现**。
- 质量门禁完全依赖 3 个字符串断言型 `.mjs` 脚本 —— 它们校验的是"源码里有没有这段话"，而非"功能对不对"（例如断言 `workbench.includes('attachShadow')` 只证明文本存在，不证明 Shadow DOM 真的工作）。

---

## 3. 架构与数据流

```
main.tsx → App.tsx（useState 单状态机，无路由）
  ├─ 01 CaseQueryTool      ── lib/parser.ts ── xlsx
  ├─ 02 SheetGeneratorTool ── lib/vpp-parser.ts + vpp-types.ts（VisionPro NRBF 静态解析）
  │                        ── lib/repeatability.ts / lib/correlation.ts ── exceljs
  │                        ── lib/chart-injector.ts ── jszip（手工拼 OOXML 图表）
  ├─ 03 FovWorkbench       ── fov/domain/*（纯函数）＋ fov/storage/db.ts（IndexedDB）
  ├─ 04 RepeatabilityWorkbench ── Shadow DOM + ?raw 内联 HTML + 源码字符串补丁 + new Function
  └─ 05 CorrelationWorkbench   ── Shadow DOM + ?raw 内联 HTML + document Proxy + new Function
```

**设计亮点**

- `src/lib/` 与 `src/fov/domain/` 是纯函数层，`recommend.ts`/`fov.ts`/`lens-resolution.ts` 无副作用、可单测。
- 04/05 用 `useState` 切换而非路由 → 本地打开与 GH Pages 子路径都不会 404。这是**有意的正确决策**。
- 03 的 `DeviceRepository` 接口与 IndexedDB 实现分离，`FovWorkbench` 支持 `repository`/`defaultData` 注入 → 可测性好。
- 05 用 `Proxy(document)` 把 `getElementById/querySelector/querySelectorAll` 重定向到 ShadowRoot，其余转发真实 document —— 比 04 的字符串替换方案**健壮一个量级**。

**架构代价**

- 04/05 是"HTML 字符串 → `new Function` 执行"的嵌入式 WebView 模式。两份 HTML 合计 205 KB / 3081 行**无法被 TypeScript 检查、无法被 IDE 跳转、无法被 lint**，是项目里唯一的类型盲区。
- `window.AOI`（04）与 `window.__AOI_*__`（04/05）写在全局 window 上，属于隐式全局状态。

---

## 4. 关键模块功能确认

| 模块 | 功能 | 业务口径核对 |
|---|---|---|
| `lib/parser.ts` | Excel → 记录 → 人员/案件分组 | 状态机 5 态、`worstStatus` 优先级 `overdue>in_transit>pending>arrived>cancelled` 合理 |
| `lib/vpp-parser.ts` | NRBF 二进制静态解析，三阶段（spec 块 / 脚本 / 合并） | 注释记录 v5 已修 7 项审计问题；容差取 `upper-lower` |
| `lib/repeatability.ts` | 生成重复性表，`=6*STDEV(...)/公差` | ✅ 与 `6σ/T` 口径一致 |
| `lib/correlation.ts` | 生成相关性表（QV/CCD/CCD+/GAP/R²） | 条件格式阈值可配置 |
| `lib/chart-injector.ts` | ZIP 级注入 OOXML 折线图 | 失败静默回退为无图表（合理） |
| `fov/domain/fov.ts` | FOV = 传感器/倍率；覆盖判定含旋转 | 公式正确 |
| `fov/domain/lens-resolution.ts` | `L=1/(2·N·M)`（MTF）；`L=1.22λF#/M`（衍射） | 推导正确，注释完整 |
| `repeatability-v1.6.html` | 解析/re-算 6σ/异常定位/证据链诊断/Before-After/IndexedDB 记录中心 | ✅ `classifySixSigma`: `<10 认可 / <20 条件 / ≥20 不认可` |
| `correlation-v13.html` | 按乘坐拟合 + 跨乘坐三级补偿（plan1 只改 b / plan2 调 a / plan3 单补） | ✅ 推荐顺序 `plan1→plan2→plan3` 与业务硬约束完全一致 |

业务口径**未发现偏离**。所有问题都在工程层面。

---

## 5. 问题清单

### P0 — 建议 24h 内处理

#### P0-1 生成参数无上界，可直接冻结页面
`src/components/sheet-generator/SheetGeneratorTool.tsx:267,271`

`产品个数` 只有 `min={1}` 没有 `max`，`乘坐次数` 同样无上界（而 `重复测量次数` 限 100、`测量数据行数` 限 20 —— 说明作者知道需要上界，只是漏了两处）。填 10000 产品 × 12 行 → 单 Sheet 十多万行 × ExcelJS 逐格写入，浏览器标签页直接假死直至 OOM。

**建议**：`productCount` 加 `max={50}`、`seatingCount` 加 `max={20}`，并在 `handleGenerate` 里做二次防御（`if (sheetCount * productCount > 5000) return setStatus(...)`）。

#### P0-2 进度条永远不会动，生成期间界面完全锁死
`src/components/sheet-generator/SheetGeneratorTool.tsx:154-223` + `src/lib/repeatability.ts:22-40`

`generateRepeatability` 是 async，但整个双层 for 循环在**第一个 `await`（`wb.xlsx.writeBuffer()`）之前同步跑完**。所有 `onProgress(...)` 都在同一个同步块内触发 → React 自动批处理 → 只会渲染一次最终值。结果是：进度条 0 → 100 跳变，且整个生成期主线程被占满，无任何反馈。

**建议**：在循环体内插入 `await new Promise(r => setTimeout(r, 0))`（或改用 Web Worker）；至少让 UI 有机会重绘。

#### P0-3 重复性嵌入态点击 Tab 会把整个外层页面拉到顶部
`src/repeatability/repeatability-v1.6.html:1469`

```js
function activate(name){ ... window.scrollTo({top:0,behavior:'smooth'}); }
```

独立 HTML 时代这行是对的；被 `RepeatabilityWorkbench` 嵌入后，点击 04 工具内任意 Tab 都会把**宿主 AOI LAB 页面**滚到顶，用户会突然看不到工作台。这与 05 工具的宿主隐藏策略不一致（05 没有任何滚动副作用）。

**建议**：写入 `EMBED_STYLE` 前把该行 patch 成 no-op（`prepareLegacyScript` 已有补丁机制，复用即可），并同步在 `verify-repeatability-integration.mjs` 加断言。

#### P0-4 `xlsx@0.18.5` 已知漏洞 + 已是停更的 npm 快照
见 2.1。该包直接解析**外部提供的不受信 Excel**，正是风险面。

**建议**：改从 SheetJS 官方源安装（`https://cdn.sheetjs.com/xlsx-latest/xlsx-latest.tgz`）或迁移到 `exceljs` 读取；若必须暂留，至少在 README 标注"仅处理可信来源文件"。

---

### P1 — 建议本迭代内处理

#### P1-1 04 的宿主注入靠正则替换源码字符串，改一行就静默崩
`src/repeatability/RepeatabilityWorkbench.tsx:47-64`

`prepareLegacyScript` 用 `String.replace` 精确匹配 `const $=s=>document.querySelector(s);` 与 `$('#btnBack')...` 整行。只要有人调整了 `repeatability-v1.6.html` 里的空格、引号或换行，替换就**静默失败**：`$` 仍指向真实 document → Shadow DOM 里所有 `#id` 查不到 → 工具打开即抛错。

好消息是 `verify-repeatability-integration.mjs:38-53` 复刻了同样的替换并断言产物包含 `__AOI_REPEATABILITY_ROOT__`，所以在新机器上跑自检能拦住。但**运行时没有兜底**。

**建议**：把 05 的 `buildDocumentProxy` 方案移植到 04（一次性消灭全部字符串替换），或至少在 `mountLegacyPage` 里校验替换是否命中、未命中时 `throw` 出可读错误。

#### P1-2 静默丢数据：相关性解析遇到空单元格即截断后续所有测量点
`src/correlation/correlation-v13.html:505-512`

```js
if (rawM == null || rawQ == null || rawM === '' || rawQ === '') break;
```

块中间任何一个空格子，会让该产品**剩余点位全部被丢弃**，且没有任何提示。用户会看到"该产品全部达标"的假结论。对比之下 04 工具对同类情况会抛 `incomplete_measurements` 关键问题（`repeatability-v1.6.html:1177`）—— **两个工具的数据完整度标准不一致**。

**建议**：改为 `continue` 收集 + 计数，并在结果区显式提示"第 N 点缺失，已跳过"。

#### P1-3 FOV 推荐开启公差筛选时，15% 镜头被静默排除
`src/fov/domain/recommend.ts:62-70`

`resolutionStatus === 'unknown'`（镜头既无 MTF 又无光圈数据）时，只要设了公差带就会被 `insufficientResolution++` 排除。实测数据集 **63/426（14.8%）镜头无解析度资料**（如 視清 `MFA110-H16` 系列整批 `aperture: null`）。

用户看到"没有完整覆盖且兼容的组合"时，只会看到"资料缺失 N"，**无法知道是哪些镜头、也无法只排除这一条约束**。

**建议**：UI 增加"包含解析度资料缺失的组合"开关（与"包含兼容性待确认"同构），或把 unknown 单列为"待确认"而非排除。

#### P1-4 生成的重复性 Excel 会写出 `#DIV/0!`
`src/components/sheet-generator/SheetGeneratorTool.tsx:327` → `src/lib/repeatability.ts:126`

公差输入允许 `0`（`Math.max(0, parseFloat(...) || 0)`），但公式是 `=6*STDEV(...)/{tolerance}` → 公差为 0 时全列报错，且 `0.00%` 条件格式（`>0.2` 判红）也随之失效。

**建议**：公差 `min` 提到 `0.0001`，或在生成前校验并拦截。

#### P1-5 案件查询：`new RegExp(人名)` 未转义，可抛异常中断整个查询
`src/lib/parser.ts:224-227`

```js
name = name.replace(new RegExp(personName, 'g'), '');
for (const p of allPeople) name = name.replace(new RegExp(p, 'g'), '');
```

`personName` / `p` 来自 Excel 单元格。含 `(` `)` `[` `*` `\` 等字符时会 `SyntaxError`，异常向上冒泡到 `CaseQueryTool` 的 `useMemo` → **整个页面白屏**（React 渲染期错误无边界）。当前数据是中文人名所以没暴露，但这是纯粹靠数据巧合在运行。

**建议**：复用 `vpp-parser.ts` 里已有的 `escapeRegex()`。

---

### P2 — 可维护性 / 性能 / 卫生

| # | 位置 | 问题 | 建议 |
|---|---|---|---|
| P2-1 | `src/fov/hooks/useDeviceLibrary.ts:7,25` | `DEFAULT_DATA_VERSION` 传给了 `initializeDefaults`，但实现里**只写入不比较**（`db.ts:88-113`），每次打开 03 工具都会把 1147+426 条默认记录全量 `put` 一遍。数据版本号形同虚设 | 读 `meta.defaultDataVersion`，相等则直接 return |
| P2-2 | `src/fov/storage/db.ts:101-110` | `initializeDefaults` 只做增量 upsert，**不清理**已从 `data/*.json` 移除的旧默认记录 → 数据集更新后旧相机永久残留在用户库里 | 增加"标记-清除"：库里 `source==='default'` 且不在新数据集中的记录删除 |
| P2-3 | `src/fov/domain/recommend.ts:45-88` | 1147×426 = **488,622 组合**同步主线程枚举。实测简化内层循环 186 ms（Node/V8），浏览器加 `toFixed`/排序后预计 0.3–1 s 无响应 | 结果用 `useMemo` 缓存；或移入 Web Worker |
| P2-4 | `src/correlation/correlation-v13.html:723,858,910` | 乘坐名（=Excel sheet 名，任意字符串）**未转义**直接拼进 `innerHTML`。04 工具全程用 `esc()`，05 工具不用 → 标准不一致。构造 `sheet 名 = <img src=x onerror=...>` 的 xlsx 可触发自 XSS | 统一加 `esc()`，或全部改 `textContent` |
| P2-5 | `src/lib/vpp-parser.ts:410` | `item.upperTolerance ?? item.lowerTolerance ?? item.tolerance` 读取的三个字段，`buildItems` **从未写入**（只写 `tolerance`）→ 恒落到 `?? 0.1` 兜底值。不对称公差能力（`vpp-types.ts:40-43`）实际未接通 | 在 `buildItems` 里按 `upper-nominal` / `nominal-lower` 填充 |
| P2-6 | `src/lib/parser.ts:160,168` | `new Date(2026, m-1, d)` **硬编码年份**。2027-01-01 起所有"预计交期"会被判成逾期 | 改为 `new Date().getFullYear()`，或从数据推断年份 |
| P2-7 | `scripts/verify-fov-update.mjs` | 未登记进 `package.json`，无法通过 npm 调用；它断言的 `required` 清单与 `cameras.length===1147` 会随数据集更新而失效 | 注册为 `verify:fov`，并把硬编码计数改为"≥" |
| P2-8 | `src/lib/chart-injector.ts:111-126` | `buildSheetIndex` 用 `<sheet>` 在 `workbook.xml` 里的**出现顺序**当作 `sheet{N}.xml` 的编号，依赖 ExcelJS 的写出顺序巧合。一旦中间插入/删除工作表即错位 | 走 `workbook.xml.rels` 的 `r:id → Target` 正确解析 |
| P2-9 | `src/components/sheet-generator/SheetGeneratorTool.tsx:130,148` | VPP 导入会把 `corrDataRows` 设成总点数（可能远超 input 的 `max={20}`），受控值与 `max` 属性自相矛盾 | 加 `Math.min(20, totalPoints)` 或放开 `max` |
| P2-10 | `src/index.css` 1006 行 / 44 KB | 单文件承载全站样式，含已下线组件（如单产品面板）残留选择器，且**无任何未用样式检测**（无 lint） | 拆分 per-tool CSS（FOV 已示范 `fov.css`），或引入 PurgeCSS |
| P2-11 | 仓库 | `deck/`（3 个版本的 1.2 MB/667 KB/659 KB bento HTML + 6 张 PNG + `gen_deck.py` + `reports/`）与根目录 `cover.jpg`、`present_slide1_cover.png` 均已入库，**约 3.7 MB 非应用产物**，同一份分享 deck 存了 3 版 | 移出仓库或迁移到 `docs/` 并保留最新一版 |
| P2-12 | 全局 | `noUnusedLocals: false` + 无 lint → 死代码永不被发现（如 `vpp-parser.ts:251-257` 的 `parseDataBindings` 是空实现，`correlation.ts:50-52` 的空 catch） | 开启 `noUnusedLocals`，或引入 ESLint |
| P2-13 | `correlation-v13.html:1029-1038` | 展开/收起全部按钮用的是 `document.querySelectorAll('#multiResultContainer ...')`；在 05 里靠 Proxy 才成立，换任何宿主即失效 | 与 `renderMultiSummary` 统一用 `container.querySelectorAll` |

---

### 文档漂移（会误导下一个接手的人）

| 文件 | 漂移内容 | 实际 |
|---|---|---|
| `AGENTS.md:43` | "`main` 单次初始提交，工作树干净" | 已有 **10 次提交**，且 `gh-pages` 等 5 个远端分支 |
| `AGENTS.md:44` | "dist/、offline/ 可能滞后于源码，使用前重新构建" | 当前二者均**新于**源码（09-10 vs 09-07） |
| `AGENTS.md:10` | 只列 3 个 verify 脚本 | `scripts/` 下实有 4 个（`verify-fov-update.mjs` 未登记） |
| `AGENTS.md:31-37` | 目录清单未提及 `deck/`、`docs/reference/`、`scripts/` | 均已入库 |
| `AGENTS.md:47` "下一步" | 提到需重跑 `build:offline` | 建议补充"改了 `index.html` 外链字体 → 离线版仍有网络请求" |
| `start.bat:12` | 输出 "05 Correlation (Coming Soon)" | 05 已上线 |
| `README.md:16-24` | 只描述"离线/本地开发"两条路径 | 未提 `dist/` 绝对路径在 `file://` 下无效这一关键限制 |

---

## 6. 改进路线图（建议顺序）

**第一批（P0，1 天）**
1. `productCount`/`seatingCount` 加上界 + 生成前防御 → 消除假死。
2. 生成循环让出主线程，进度条真正生效。
3. 04 嵌入态禁掉 `window.scrollTo`。
4. `xlsx` 换官方源或迁 `exceljs` 读取。

**第二批（P1，2–3 天）**
5. 04 弃用字符串替换，统一走 05 的 document Proxy 方案（同时消灭 P1-1 与 P2-13 的宿主耦合）。
6. 相关性解析改为"跳过并计数缺失点"。
7. FOV 增加"包含资料缺失组合"开关。
8. 公差最小 0.0001；`extractCaseName` 用 `escapeRegex`。

**第三批（P2 卫生，可穿插）**
9. `initializeDefaults` 接上版本号比较 + 默认记录清理（顺带解决 03 工具打开时的无谓写入）。
10. FOV 推荐加 `useMemo` 缓存 / Worker。
11. 05 统一 `esc()`。
12. 修 `vpp-parser` 的 `upperTolerance/lowerTolerance`、`parser.ts` 硬编码年份、`chart-injector` 的 sheet 索引解析。
13. 仓库清理 `deck/`；刷新 `AGENTS.md` / `README.md` / `start.bat` 文案；把 `verify-fov-update` 登记进 npm scripts。

**长期（值得做，不急）**
14. 给 04/05 的 HTML 补**契约测试**（喂固定 xlsx，断言输出 JSON），把自检从"字符串存在性"升级为"行为正确性"。
15. 引入 ESLint（至少 `no-unused-vars` + `react-hooks/exhaustive-deps`），并把 `noUnusedLocals` 打开。
16. 评估把 04/05 的两个 HTML 逐步 TypeScript 化——目前它们是项目里唯一无法被类型系统保护的部分，也是所有"幽灵 bug"的温床。

---

## 7. 无需担心的事项（已核实）

- **无网络外传**：全链路 `FileReader` / `File.arrayBuffer()` 本地读取，无 `fetch`/`XHR` 上报。
- **无密钥泄露**：仓库内无 token / 凭据；`.gitignore` 已覆盖 `node_modules/`、`dist/`、`offline/`、`*.tsbuildinfo`、`.workbuddy/`、`.claude/settings.local.json`、`.playwright-mcp/`。
- **业务口径正确**：`6σ/T` 三档判定、`y=ax+b` 优先调 b 且 b 按项目名跨乘坐一致、plan1→plan2→plan3 推荐顺序 —— 与项目长期笔记完全一致。
- **`dist/` 与 `offline/` 不是陈旧产物**。
- **`npm run verify:*` 与 `tsc -b` 全绿**。

---

## 8. 修复记录（2026-09-11 当日）

同一日内已按本报告结论动手修复，以下条目已改完并通过 `tsc -b` + 全部源码级自检，另加一个真浏览器冒烟脚本验证 04/05 的运行时注入。

### P0

| # | 改动 | 文件 |
|---|---|---|
| P0-1 | `productCount` 加 `max=50`、`seatingCount` 加 `max=20`；新增工作量上界 `MAX_TOTAL_ROWS = 50000`，超限时**禁用生成按钮**并在预览区说明超出多少、要调哪个参数；`onChange` 全部改成 clamp（原来可以输入超过 max 的值） | `SheetGeneratorTool.tsx` |
| P0-2 | `generateRepeatability` / `generateCorrelation` 每个 Sheet 之间插入让出点（`yieldToUI`），进度回调改为"先报进度 → 让出 → 再执行同步写入"；生成前先 `await` 一次让"生成中"态渲染出来 | `lib/repeatability.ts`、`lib/correlation.ts`、`SheetGeneratorTool.tsx` |
| P0-3 | 旧 HTML 新增 `EMBEDDED` 标志（读宿主设的 `window.__AOI_EMBEDDED__`），`activate()` 里只有非嵌入态才 `window.scrollTo`；宿主在启动旧脚本前置位 | `repeatability-v1.6.html`、`RepeatabilityWorkbench.tsx` |
| P0-4 | `xlsx` 从 npm 的 0.18.5 换成 SheetJS 官方分发的 **0.20.3**（`package.json` 指向 cdn.sheetjs.com 的 tarball），两个 CVE 一并消除；已用真实 workbook 做读写往返冒烟 | `package.json` |

### P1

| # | 改动 | 文件 |
|---|---|---|
| P1-1 | 04 弃用 `String.replace` 改源码文本的老办法，改为**向 `new Function` 注入 document 代理**，与 05 同策略；旧返回按钮改由 ShadowRoot 上的**捕获阶段监听**接管，不再依赖源码字符串；替换命中与否从此不再是失败模式 | `RepeatabilityWorkbench.tsx` |
| P1-2 | 05 解析器遇空单元格由 `break`（截断该产品剩余全部点位）改为**跳过 + 计数**；连续 3 行不可用才判定数据块结束；缺失点数回传到结果区（产品行加"⚠ 已跳过 N 个空点位"标签）与文件加载提示 | `correlation-v13.html` |
| P1-3 | `Exclusions` 拆出 `resolutionUnknown`（资料缺失、无法判定）与 `insufficientResolution`（明确不达标）；新增 `includeUnknownResolution` 选项与「包含缺少解析度资料的组合」勾选框；排除提示写清数量与开启方式 | `recommend.ts`、`FovWorkbench.tsx` |
| P1-4 | 公差下限由 0 提到 `MIN_TOLERANCE = 0.0001`（表格生成器与 VPP 导入两处）；生成前另有一道防御：任一项目公差 ≤ 0 直接拦截并指名项目 | `SheetGeneratorTool.tsx`、`VppImportModal.tsx` |
| P1-5 | `escapeRegex` 提到 `lib/utils.ts` 共用（`vpp-parser` 的原实现删除、改为复用），`extractCaseName` 的人名匹配全部转义 | `utils.ts`、`vpp-parser.ts`、`parser.ts` |

### P2

| # | 改动 |
|---|---|
| P2-1 / P2-2 | `initializeDefaults` 先读 `meta.defaultDataVersion`，一致就直接返回（不再每次全量重写 1147+426 条）；版本号改由数据集摘要自动算出，不再手写常量；同时新增"标记-清除"，删除已从 `data/*.json` 移除且用户未改过的旧默认记录 |
| P2-3 | FOV 推荐加了 `computing` 态 + 计算前让出主线程，点击后立刻显示"计算中…"，不再有一段无反馈的卡死 |
| P2-4 | 05 补上 `esc()`（与 04 同一实现），`seat.name`（= Excel sheet 名，不受信）、`x.seat`、`p.name` 全部转义后再拼 innerHTML |
| P2-5 | `buildItems` 补写 `upper/nominal/lower`、`upperTolerance/lowerTolerance`、`toleranceMode`、`toleranceDisplay`、`tolerancePositive/Negative`；**同时把 `mapToMeasurementProjects` 的取值从 `upperTolerance` 改成公差带宽度** —— 前者是半个带，一旦被填充会把 6σ/T 抬高约一倍、把合格品判成不认可 |
| P2-6 | `extractDate` 去掉硬编码 2026，改为按当前年份推断并做跨年修正（早于今天半年以上判为下一年），`getStatus`/`getDaysRemaining` 传入同一个 `today` |
| P2-7 | 5 个自检脚本全部登记进 `package.json`，新增 `npm run verify` 一次跑完；`verify-fov-update` 的 `cameras.length === 1147` 改为 `>= 1147` |
| P2-8 | `buildSheetIndex` 改走 `workbook.xml.rels` 的 `r:id → Target` 解析 `sheetN.xml` 编号，关系表异常时回退到原有位置推断 |
| P2-9 | VPP 导入回填相关性行数时收敛到 `[1, 20]`，并在提示里说明被收敛过 |
| P2-13 | `setAllPoints` 改为从容器 `querySelectorAll`，不再依赖宿主把 document 代理进 Shadow DOM |

### 新增/加强的自检

- **新增 `scripts/smoke-browser.mjs`（`npm run verify:smoke`）—— 真浏览器冒烟，唯一能验证 P1-1 运行时是否真的生效的检查。** 零依赖：用 Node 22 内置 `WebSocket` 直连 CDP，不引 playwright/puppeteer。流程：起 headless Chromium → 打开 `offline/index.html` → 点 04 卡片 → 断言**宿主内层 div 真的挂出了 shadowRoot**、`.tab` 渲染出来、`#toast` 能经 document 代理查到、且**没有泄漏到真实 document**；再点 Tab 断言**宿主页面滚动位置不变**（P0-3）；点返回回主页后同样验证 05。找不到 Chromium/Edge 时自动 SKIP（退出码 0），不阻塞其它自检。
  - 它上线当天就抓到一个**测试自身的 bug**：04/05 的 shadowRoot 挂在 `<section class="*-tool-host">` 的**内层 `<div ref={hostRef}>`** 上，且 Shadow DOM 内容不会序列化进 `outerHTML` —— 最初的脚本查 `section.shadowRoot` 恒为 null，误报成"代码回归"。已修正为读内层 div 的 `shadowRoot`，并在 AGENTS.md 记下这个坑。
- **新增 `scripts/verify-correlation-parser.mjs`**：把 `correlation-v13.html` 的脚本取出来真的执行（用桩 DOM 跳过浏览器 API），喂进手工构造的 workbook —— 含**数据区中间一个空点**、尾部 3 个空行、第二个产品块、含 HTML 元字符的 sheet 名 —— 断言点位不被截断、缺失被计数、QV/CCD 对齐、下游 `analyzeBySeat` 与补偿方案仍能算出。这是本仓库第一个"断言行为"而非"断言字符串存在"的测试，P1-2 的回归由它守住。
- **`verify-repeatability-integration`** 改为断言新机制（document 代理、捕获阶段拦截、`!EMBEDDED` 守卫），并对 05 脚本做 `new Function('echarts','XLSX','document', ...)` **语法级检查** —— 写这个检查的当天就抓到过一次"注释里含未闭合结构"的破坏。

### 已知遗留（未在本轮动手）

1. **`deck/` 约 3.7 MB 非应用产物仍在版本库里**（3 版 bento HTML + 截图 + `gen_deck.py`）。清理会改变版本库内容，需你确认后我再执行。
2. **04/05 仍是类型盲区**（205 KB HTML 字符串，无 TS/lint）。本轮统一了宿主注入、补了行为契约测试和真浏览器冒烟，运行时行为已有覆盖，但静态类型层面仍未纳入。
3. `noUnusedLocals: false` + 无 ESLint 保持原样（未引入新工具链）。
4. `index.html` 的 Google Fonts 外链保持原样（离线版"零外部请求"仍不严格成立，已在 README 标注）。
