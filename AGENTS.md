# AGENTS.md — AOI LAB

团队效率工具箱：React 19 + TypeScript + Vite + Tailwind CSS 4。纯前端，无后端。所有功能在浏览器本地完成。

## 怎么跑
- `npm install` → `npm run dev`（默认 http://localhost:5173；被占用时 Vite 自动顺延端口）
- Windows 一键启动：`start.bat`（自动装依赖 + 启动，依赖 WorkBuddy 托管 Node 路径，已用 CRLF 行尾保存）
- 生产构建：`npm run build` → `dist/`（出口 `tsc -b && vite build`）
- 离线单文件版：`npm run build:offline` → `offline/index.html`（vite-plugin-singlefile，给无 Node/无网电脑双击即用）
- 集成自检脚本：`npm run verify:repeatability` / `verify:launcher` / `verify:workspace`（无 lint / test，以这些 + `tsc -b` 为准）

## 工具（主页 5 卡）
| 编号 | slug | 状态 |
|---|---|---|
| 01 | case-query 案件查询 | 可用 |
| 02 | sheet-generator 表格生成器 | 可用 |
| 03 | fov FOV 选型工具 | 可用 |
| 04 | repeatability 重复性分析 | 可用 |
| 05 | correlation 相关性分析 | 占位，`disabled`，底层 `src/lib/correlation.ts` 存在但未暴露前端 |

工具切换用 React `useState`，**无路由 / 无 URL**（本地打开、GitHub Pages 子路径都不会 404）。`src/types.ts` 的 `ToolId` 联合目前不含 `'correlation'`。

## 技术栈与关键依赖
- `exceljs` 生成 Excel；`xlsx` 解析上传；`jszip` 做 XLSX 的 ZIP 后处理
- 图表（折线图 lineChart）通过 `src/lib/chart-injector.ts` 向 Excel 注入 OOXML
- 重复性分析 V1.6 通过 React 宿主 + Shadow DOM 隔离运行（`src/repeatability/repeatability-v1.6.html`），避免其全局 CSS/DOM 影响其它模块
- FOV 设备资料库用浏览器 IndexedDB 本地保存

## 目录与约定
- `src/lib/`：纯逻辑 — `vpp-parser.ts`(VisionPro .vpp NRBF 解析)、`vpp-types.ts`(类型，含 tolerancePositive/Negative 不对称公差字段)、`chart-injector.ts`(图表注入)、`correlation.ts`/`repeatability.ts`(Excel 生成)、`parser.ts`(案件查询)、`utils.ts`(繁简转换)
- `src/components/`：布局（Header/Footer/ToolCard/ToolWorkbenchNav/HelpModal/Icons）+ `case-query/` + `sheet-generator/`
- `src/fov/`：FOV 工作台、设备资料库、IndexedDB 存储、默认数据 `data/`（cameras.json 1,147 台 / lenses.json 426 款）
- `src/repeatability/`：重复性分析 React 宿主 + 隔离源码
- **样式前缀规范**：按功能命名（`generator-*`、`cq-*`、`vpp-*`、`fov-*`），全局样式集中在 `src/index.css`，FOV 样式独立放 `src/fov/fov.css`
- **设计规范（强制）**：开发前先读 `SUBPAGE_DESIGN_GUIDELINES.md` 与 `FRONTEND_DESIGN_GUIDELINES.md`
  - 配色：navy #072F50 背景 / paper #FFFAEA 纸张 / cyan #24D4D3 强调 / orange #FF9D2E 操作
  - 纯 2D 风格，实色阴影，无模糊 / 玻璃 / 渐变

## 当前状态
- Git：`main` 单次初始提交，工作树干净。远端 `origin` = github.com/mccsosix/aoi-lab-combined，另有 `gh-pages`/`legacy-fullstack`/`standalone-vite`/`aoi-lab-local-completed` 等远端分支（历史/部署面，未在本地核对 live）。
- `dist/`、`offline/`、`*.tsbuildinfo`、`.playwright-mcp/`、`.claude/settings.local.json` 均已 gitignore（见 `.gitignore`）；`dist/`、`offline/` 为本地构建产物，可能滞后于源码，使用前重新构建。
- 历次合并/导入的一次性记录（根目录 `INTEGRATION_NOTES.md`、`REPEATABILITY_INTEGRATION_NOTES.md`、`docs/FOV_CAMERA_IMPORT_NOTES.md`、`docs/superpowers/` 等）已在 2026-08-14 收尾中删除，内容保留在 git 历史里，不再维护；权威文档以本文件 + README + 代码为准。

## 下一步
- 05 相关性分析仍为占位，开放前需补前端界面并决定是否把 `src/lib/correlation.ts` 接入。
- 改动 FOV 默认数据（`src/fov/data/*.json`）后需重跑 `npm run build:offline` 更新离线版。
