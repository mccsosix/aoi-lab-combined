# AOI LAB

把工作里的麻烦，做成顺手的小工具。

本项目在原 AOI LAB 工具箱基础上新增了“FOV 相机与镜头选型”。首页现在包含三个工具入口，其中 FOV 工具已完成计算、推荐、资料维护和本机备份功能。

## 直接在 Windows 使用

1. 解压 `AOI-LAB本地工具.zip`。
2. 双击文件夹内的 `启动工具.bat`。
3. 浏览器会打开 `http://127.0.0.1:4173/`；关闭命令行窗口即可停止工具。

本地包不需要安装 Node.js，也不会把资料上传到服务器。相机、镜头和现场修改保存在当前浏览器的 IndexedDB 中。更换浏览器、用户账号或电脑前，请先在 FOV 页面的“导入 / 导出”中下载 JSON 备份。

## FOV 工具功能

- 组合计算：选择相机与镜头，生成可直接复制到报告的 CCD、Sensor Size、Lens、FOV、DOF、Resolution 和 Lens Resolution 七项参数。
- 报告计算：DOF 按项目约定使用镜头资料值乘以实际倍率；Lens Resolution 使用镜头像方 MTF 换算的物方半周期估算值。
- 按目标推荐：输入目标宽高，按完整覆盖、接口和像圈条件筛选组合，并支持目标旋转。
- 可调倍率：对有倍率范围的镜头自动选择可覆盖目标的倍率。
- 兼容性分层：选择相机后默认隐藏接口不匹配或像圈不足的镜头；可打开“显示不兼容镜头”复核。`2/3″`、`1″` 等标称格式用于展示，覆盖判断使用传感器实际对角线与镜头像圈毫米数。
- 设备资料库：搜索、新增、编辑、复制、停用、隐藏和恢复默认相机/镜头资料。
- 本机备份：导出 JSON，导入前预览新增项和冲突，并逐项选择保留本机或采用导入资料。

默认资料包括 1,135 台相机和 426 款镜头。镜头资料中 402 款通过自动校验，24 款保留“人工复核”标记；相机资料中 46 台缺少接口信息，会在兼容性判断中提示复核。

## 源码开发

环境要求：Node.js 22.13 或更高版本，npm 10 或更高版本。

Windows 用户可以直接双击项目根目录的 `一键启动.bat`。首次运行会自动执行 `npm install`，需要保持网络连接；依赖安装完成后，后续双击会直接启动开发服务器并打开浏览器。请保留命令行窗口，按 `Ctrl+C` 可停止服务。

也可以在命令行中启动：

```bash
npm install
npm run dev
```

常用命令：

```bash
npm run lint          # 代码检查
npm run test:unit     # 单元与组件测试
npm run validate:data # 默认资料完整性校验
npm run build         # Web 生产构建
npm test              # 完整自动化验收
npm run package:local # 生成 Windows 本地包
```

## 主要目录

```text
app/fov/                 FOV 独立路由
src/fov/components/      工作台、资料库和备份界面
src/fov/domain/          FOV、覆盖、兼容性和推荐规则
src/fov/storage/         IndexedDB 与 JSON 备份
src/fov/data/            默认相机、镜头和提取报告
local/                   本地静态入口
launcher/                Windows 双击启动器
scripts/                 数据校验和本地包构建脚本
tests/                   页面、资料与本地包验收
docs/                    字段说明与验收报告
```

视觉规范见 [FRONTEND_DESIGN_GUIDELINES.md](./FRONTEND_DESIGN_GUIDELINES.md)，数据字段见 [docs/fov-data-fields.md](./docs/fov-data-fields.md)，交付验收见 [docs/verification-report.md](./docs/verification-report.md)。

## 技术栈

- React 19 + TypeScript
- Vinext / Vite
- IndexedDB（`idb`）
- Vitest + Testing Library + Node.js Test Runner
