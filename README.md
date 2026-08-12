# AOI LAB

团队效率工具箱 — React 19 + TypeScript + Vite + Tailwind CSS 4

## 工具

| 编号 | 名称 | 功能 |
|------|------|------|
| 01 | 案件查询 | 上传 Excel，按人员+案号查询物料交期状态 |
| 02 | 表格生成器 | 生成重复性/相关性评估 Excel 表格，支持 VPP 导入 |
| 03 | FOV 选型工具 | 相机+镜头 FOV 计算、目标尺寸反向推荐、设备资料库、JSON 导入导出 |

## 快速开始

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 生产构建 → dist/
start.bat        # Windows: 自动装依赖并启动开发服务器 (依赖 WorkBuddy 托管 Node 路径)
```


## FOV 选型工具

- **组合计算**：按相机 Sensor 尺寸和镜头实际倍率计算 FOV、mm/pixel、μm/pixel。
- **按目标推荐**：输入必须完整覆盖的宽高，从可用相机/镜头中反向筛选并排序。
- **兼容性检查**：结合接口和镜头像圈资料区分“兼容 / 待确认 / 不兼容”。
- **本地设备资料库**：使用浏览器原生 IndexedDB 保存现场新增、修改、隐藏和启停状态。
- **导入 / 导出**：通过 JSON 备份本机设备资料和冲突处理。
- **默认资料**：1,135 台面阵相机（海康机器人 641 / Basler 462 / 度申 32）与 426 款镜头（燦銳 38 / 視清 388）。

## VPP 导入功能

表格生成器支持导入 Cognex VisionPro `.vpp` 文件，自动识别尺寸检测项目：

- **静态 NRBF 解析器** (`src/lib/vpp-parser.ts`)：纯浏览器端解析，无需 VisionPro SDK
  - 从 BinaryObjectString 记录提取 ToolBlock 名称
  - 从 MemberPrimitiveTyped Doubles 读取规格值 (SpecU/Spec/SpecL)
  - 从 C# 脚本解析 OutputItem 数组结构和点数
- **名称匹配**：优先 OutputItem[0] 字面量，回退 NRBF 记录名
- **公差计算**：`upper - lower`
- **折线图注入** (`src/lib/chart-injector.ts`)：ZIP 后处理方式向 Excel 注入 OOXML 折线图 (lineChart)

### 支持的文件

| 文件 | 项目数 | 状态 |
|------|--------|------|
| `118B2_CCD1.vpp` | 3 (SMTTPX / 1HJTPY / 1HJTPX) | ✅ |
| `118B2_CCD2.vpp` | 3 (1舌片TPY / 1上下弹高 / 左右弹高) | ✅ |
| `118B2_CCD3.vpp` | 10 | ✅ |
| `118B2_CCD4.vpp` | 待测试 | ⬜ |

### 架构

```
src/lib/
  vpp-types.ts          # 解析器类型定义
  vpp-parser.ts         # NRBF 静态解析器 (Phase A/B/C)
  chart-injector.ts     # XLSX 图表 ZIP 后处理注入
  correlation.ts        # 相关性 Excel 生成器
  repeatability.ts      # 重复性 Excel 生成器
  parser.ts             # 案件查询 Excel 解析器
  utils.ts              # 繁简转换

src/fov/
  components/            # FOV 工作台、报告、设备资料库、备份弹窗
  data/                  # 1,135 台相机 + 426 款镜头默认资料
  domain/                # FOV、兼容性、推荐、报告计算
  hooks/                 # 本地设备资料状态
  storage/               # 浏览器原生 IndexedDB 与 JSON 备份

src/components/
  sheet-generator/
    SheetGeneratorTool.tsx   # 表格生成器主界面
    VppImportModal.tsx       # VPP 导入确认弹窗
  case-query/
    CaseQueryTool.tsx        # 案件查询界面
  Header.tsx / Footer.tsx    # 页面布局
```

## 设计规范

详见 `SUBPAGE_DESIGN_GUIDELINES.md` 和 `FRONTEND_DESIGN_GUIDELINES.md`

- 配色：navy(#072F50) 背景, paper(#FFFAEA) 纸张, cyan(#24D4D3) 强调, orange(#FF9D2E) 操作
- 纯 2D 风格，实色阴影，无模糊/玻璃/渐变
