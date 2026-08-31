# AOI LAB — 团队效率工具箱

纯前端的团队效率工具箱：案件查询、表格生成器、FOV 选型工具、重复性分析、相关性判断。
技术栈：React 19 + TypeScript + Vite + Tailwind CSS 4。所有功能在浏览器本地完成，无需后端。

## 工具

| 编号 | 名称 | 功能 |
|------|------|------|
| 01 | 案件查询 | 上传 Excel，按人员 + 案号查询物料交期状态 |
| 02 | 表格生成器 | 生成重复性 / 相关性评估 Excel 表格，支持 Cognex VisionPro `.vpp` 导入 |
| 03 | FOV 选型工具 | 相机 + 镜头 FOV 计算、目标尺寸反向推荐、设备资料库、JSON 导入导出 |
| 04 | 重复性分析 | 导入重复性 Excel，重算 6σ、定位异常、单点诊断、Before / After、记录中心 |
| 05 | 相关性判断 | 导入对样 Excel，判断 CCD 能否用 y=ax+b 对齐 QV，批量评估多产品多乘坐 |

## 使用方式

### 方式一：离线单文件版（推荐，免安装 / 免网络 / 免 Node）

给**没装 Node.js、没网**的电脑用：

1. 在开发机运行 `npm run build:offline`，生成 `offline/index.html`（单文件，含全部数据）。
2. 把整个项目文件夹拷过去，或只拷 `offline/` 文件夹。
3. 对方双击 `start-offline.bat`（或直接双击 `offline/index.html`），浏览器打开即可用。

> 修改了 FOV 数据（`src/fov/data/*.json`）后，重新跑一次 `npm run build:offline` 即可更新离线版。

### 方式二：本地开发（需要 Node.js）

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 生产构建 → dist/
start.bat        # Windows：自动检查 Node、依赖与端口后启动
```

## 功能说明

### FOV 选型工具

- **组合计算**：按相机 Sensor 尺寸和镜头实际倍率计算 FOV、mm/pixel、μm/pixel。
- **按目标推荐**：输入必须完整覆盖的宽高，从可用相机 / 镜头中反向筛选并排序。
- **兼容性检查**：结合接口和镜头像圈资料区分「兼容 / 待确认 / 不兼容」。
- **设备资料库**：用浏览器 IndexedDB 本地保存新增、修改、隐藏、启停状态，支持 JSON 备份 / 恢复。
- **默认资料**：1,147 台面阵相机与 426 款镜头。


### 重复性分析

- 导入 `.xlsx` 重复性表格，在浏览器本地解析并重算 6σ。
- 按 `<10%`、`10–20%`、`>=20%` 显示认可、条件认可和不认可状态。
- 提供总览、异常定位、单点诊断、Before / After 和记录中心。
- 测试记录与工程经验保存在浏览器本机 IndexedDB，不上传。

### 相关性判断

- 批量比对：导入对样 `.xlsx`（每个 sheet 一个乘坐，sheet 内 1#~10# 是产品），按乘坐给统一变换函数 `y = ax + b`，每个乘坐 ≥5/10 个产品全部点位达标即算成功。
- 支持展开逐点明细、散点图查看与 CSV 导出，数据全部在浏览器本地计算，不上传。

### 表格生成器

- 生成重复性 / 相关性评估 Excel 表格。
- 支持导入 Cognex VisionPro `.vpp` 文件，自动识别尺寸检测项目——纯浏览器解析，**无需安装 VisionPro SDK**。

### 案件查询

- 上传 Excel，按人员 + 案号查询物料交期状态。

## 架构

```
src/lib/        # 纯逻辑：VPP 解析、Excel 生成、案件查询解析、繁简转换
src/fov/        # FOV 工作台、设备资料库、IndexedDB 存储
src/repeatability/ # 重复性分析 V1.6 React 宿主 + 隔离源码
src/correlation/ # 相关性判断 React 宿主 + 隔离源码
src/components/ # 表格生成器、案件查询、页面布局
```

## 设计规范

详见 `SUBPAGE_DESIGN_GUIDELINES.md` 和 `FRONTEND_DESIGN_GUIDELINES.md`

- 配色：navy(#072F50) 背景、paper(#FFFAEA) 纸张、cyan(#24D4D3) 强调、orange(#FF9D2E) 操作
- 纯 2D 风格，实色阴影，无模糊 / 玻璃 / 渐变
