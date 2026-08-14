# AOI LAB 合并说明

## 本次合并结果

最终项目：`aoi-lab-combined`

以原 `aoi-lab-combined-main` 的 React + Vite 架构为主，保留原有：

1. 案子物件查询
2. 表格生成器 / VPP 导入

并新增：

3. FOV 选型工具

FOV 功能从 `AOI-LAB-POV` 原生迁入 `src/fov/`，没有引入 Next.js、Vinext、Cloudflare、Drizzle 或 React Router。

## FOV 已整合内容

- 组合计算 FOV
- 按目标尺寸反向推荐相机 / 镜头
- 接口、像圈兼容性判断
- 七项报告参数与复制
- 设备资料库新增 / 编辑 / 停用 / 隐藏
- 浏览器本机自动保存（IndexedDB）
- JSON 导入 / 导出与冲突处理
- 1,135 台相机默认资料
- 426 款镜头默认资料

## 页面整合方式

主页面新增 `03 / FOV 选型工具` 卡片。点击后通过 React 状态切换到全屏 FOV 工作台；“返回工具箱”直接回主页面，不使用 `/fov` URL，因此本地打开、Vite 和 GitHub Pages 子路径部署不会额外产生路由 404 问题。

主页面三张工具卡改为三列布局；平板降为两列，手机降为一列。FOV 样式独立放在 `src/fov/fov.css`，避免修改原两个功能的业务样式。

## 已执行验证

- TypeScript `tsc -b`：通过。
- FOV 核心计算 / 覆盖 / 旋转 / 兼容性 / 推荐 / 报告：12 项断言通过。
- 默认数据校验：1,135 台相机、426 款镜头，ID 唯一，FOV 必要字段完整。
- 合并源码检查：无 Next.js / Vinext / Drizzle / Cloudflare 依赖或导入。

当前执行环境无法访问 npm registry，且原压缩包自带的 `node_modules` 是 Windows 版本，因此无法在此 Linux 容器补齐 Rollup Linux 原生可选包来执行最终 `vite build`。源码没有携带 `node_modules`，在正常联网的 Windows 环境执行：

```bash
npm install
npm run build
```

即可按项目原有依赖重新安装对应平台模块。
