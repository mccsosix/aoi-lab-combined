# AGENTS.md — AOI LAB

团队效率工具箱：React 19 + TypeScript + Vite + Tailwind CSS 4。纯前端，无后端。

## 怎么跑
- `npm install` → `npm run dev`（默认 http://localhost:5173；被占用时 Vite 自动顺延端口）
- Windows 一键启动：`start.bat`（自动装依赖 + 启动，依赖 WorkBuddy 托管 Node 路径，已用 CRLF 行尾保存）
- 生产构建：`npm run build` → `dist/`（出口 `tsc -b && vite build`）

## 技术栈与关键依赖
- `exceljs` 生成 Excel；`xlsx` 解析上传；`jszip` 做 XLSX 的 ZIP 后处理（图表注入）
- 图表（折线图 lineChart）通过 `src/lib/chart-injector.ts` 向 Excel 注入 OOXML

## 目录与约定
- `src/lib/`：纯逻辑 — `vpp-parser.ts`(VisionPro .vpp NRBF 解析)、`vpp-types.ts`(类型)、`chart-injector.ts`(图表注入)、`correlation.ts`/`repeatability.ts`(Excel 生成)、`parser.ts`(案件查询)、`utils.ts`(繁简转换)
- `src/components/sheet-generator/`：表格生成器（`SheetGeneratorTool.tsx` 主界面、`VppImportModal.tsx` 导入弹窗）
- `src/components/case-query/`：案件查询界面
- **样式前缀规范**：按功能命名（`generator-*`、`cq-*`、`vpp-*`），全局样式集中在 `src/index.css`
- **设计规范（强制）**：开发前先读 `SUBPAGE_DESIGN_GUIDELINES.md` 与 `FRONTEND_DESIGN_GUIDELINES.md`
  - 配色：navy #072F50 背景 / paper #FFFAEA 纸张 / cyan #24D4D3 强调 / orange #FF9D2E 操作
  - 纯 2D 风格，实色阴影，无模糊 / 玻璃 / 渐变

## 当前状态与下一步
- 5 处改动（见 `AOI-LAB-CHANGES.md`，已应用、未提交 git）：输入框 min 2→1 + 下载改 `showSaveFilePicker`、图表改 lineChart、相关性图表锚点定位、vpp-parser 正则 `\d+`→`\w+`、start.bat 重写
- `src/lib/vpp-types.ts` 有一处**未列入交接文档**的未提交改动（新增 `tolerancePositive`/`toleranceNegative` 字段），提交前需人工确认是否保留
- 待办：按 `AOI-LAB-CHANGES.md` 末尾验证清单实测；`correlation-test.xlsx` 为未跟踪测试样本，确认是否保留；`AOI-LAB-local-project/` 是 gitignore 的独立子仓（仅 node_modules），不在本仓范围内
