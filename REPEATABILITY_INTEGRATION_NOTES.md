# 重复性分析整合说明

本版本在原 AOI LAB 源码基础上完成以下整合：

- 首页新增 `04 重复性分析`，点击后在当前页面下方展开，不使用 iframe，也不跳转独立页面。
- 重复性分析保留用户提供的 V1.6 原始功能：总览、异常定位、单点诊断、Before / After、记录中心、本地备份与 IndexedDB 数据。
- V1.6 通过 React 宿主 + Shadow DOM 隔离运行，避免其全局 CSS 和 DOM 选择器影响 AOI LAB 其它模块。
- `返回工作台` 已改为收起当前 04 工具，不再调用浏览器 `history.back()`。
- 首页新增 `05 相关性分析` 占位卡，显示“开发中”，不可点击；现有 `src/lib/correlation.ts` 不会被误作为已完成前端暴露。
- 新增 `npm run verify:repeatability` 集成检查脚本。

## 验证记录

已通过：

- `npm run verify:repeatability`
- `node scripts/verify-fov-update.mjs`
- `tsc -b`

当前验证容器为 Linux，而上传压缩包内 `node_modules` 为 Windows 依赖，因此 `vite build` 在本容器缺少 `@rollup/rollup-linux-x64-gnu`。交付包保留原 Windows `node_modules`，可在 Windows 上继续使用 `start.bat` 启动开发版。

## 离线单文件版

交付包不包含旧的 `dist/` 和 `offline/` 构建产物，以免打开到未包含 04/05 的旧版本。若需要新的 `offline/index.html`，请在 Windows 开发机中运行：

```bash
npm run build:offline
```
