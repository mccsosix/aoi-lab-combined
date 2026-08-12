# FOV 公式与数据字段

## 计算公式

固定倍率或当前有效倍率为 `M` 时：

- `FOV 宽 = 传感器宽 / M`
- `FOV 高 = 传感器高 / M`
- `水平精度 = FOV 宽 / 水平像素数`
- `垂直精度 = FOV 高 / 垂直像素数`
- `报告 DOF = 镜头资料 DOF × 实际倍率`；当镜头资料给出 `depth_of_field_min_mm` / `depth_of_field_max_mm` 范围时，分别乘以实际倍率得到 DOF 范围，不先求平均。
- `Lens Resolution` 按以下优先级：
  1. 有厂家直接物方解析度 `objectSpaceResolutionUm`：`objectSpaceResolutionUm / 1000`（单位 mm），详情注明“厂家物方解析度”。
  2. 无直接值但有像方 MTF：`1 / (2 × 镜头像方 MTF lp/mm × 实际倍率)`（物方 half-pitch 估算），详情注明“基于像方 MTF 的物方 half-pitch 估算”。
  3. 两者都缺失：主报告显示 `—（资料未提供）`，不进行任何猜测，也不显示为 `0`。

右侧报告固定输出 `CCD`、`Sensor Size`、`Lens`、`FOV`、`DOF`、`Resolution` 和 `Lens Resolution`。其中 `Lens Resolution` 是镜头光学物方解析度（单位 mm），`Resolution` 是相机像素采样间距（单位 mm/pixel），两者口径不同，需分别看待。

## Sensor Size 显示规则

- 有 `nominalMegapixels`（厂家标称像素）：显示如 `25M`。
- 仅有按分辨率计算的像素：必须标注“（按分辨率计算）”，如 `12.58 MP（按分辨率计算）`，不得伪装成厂家标称值。
- 有 `sensorFormat`：置于括号中，如 `（1.1″）`；缺失则显示 `靶面规格待补`，避免让用户误以为计算像素就是 Sensor Size。
- 有 `fps`：显示帧率；缺失显示 `fps=待补`，不显示为 `0`。

目标推荐要求宽、高两个方向同时覆盖。允许旋转时，还会用互换后的目标宽高检查一次。可调倍率镜头会在其最小、最大倍率范围内选择仍能完整覆盖目标的最大倍率，以获得更高采样精度。

## 相机字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 稳定唯一标识 |
| `brand` / `series` / `model` | string | 品牌、系列、型号 |
| `resolutionWidthPx` / `resolutionHeightPx` | number | 水平、垂直分辨率 |
| `sensorWidthMm` / `sensorHeightMm` | number | 传感器宽、高，单位 mm |
| `sensorDiagonalMm` | number | 传感器对角线，单位 mm |
| `lensMount` | string \| null | 相机接口；缺失时需人工复核 |
| `megapixels` | number | 标称百万像素 |
| `nominalMegapixels` | number \| null | 报告使用的市场标称像素数，单位 M |
| `sensorFormat` | string \| null | `2/3″`、`1″`、`1.1″` 等光学格式，仅用于资料展示 |
| `fps` | number \| null | 标称帧率 |
| `pixelSizeXUm` / `pixelSizeYUm` | number \| null | 水平、垂直像元尺寸，单位 μm |
| `sensorModel` | string \| null | Sensor 型号 |
| `productUrl` | string \| null | 产品参考地址 |
| `enabled` / `hidden` | boolean | 是否参与选择、是否隐藏 |
| `source` | `default` \| `user` | 内置或用户新增 |
| `customized` | boolean | 是否经本机修改 |
| `updatedAt` | string | ISO 更新时间 |

## 镜头字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 稳定唯一标识 |
| `brand` / `series` / `model` | string | 品牌、系列、型号 |
| `lensType` | string | 镜头类别 |
| `magnification` | number \| null | 固定倍率 |
| `magnificationMin` / `magnificationMax` | number \| null | 可调倍率范围 |
| `nominalMagnification` | number \| null | 标称或默认倍率 |
| `mount` | string \| null | 镜头接口 |
| `maxSensorDiagonalMm` | number \| null | 最大支持像面/传感器对角线 |
| `workingDistanceMm` | number \| null | 工作距离，单位 mm |
| `depthOfFieldMm` | number \| null | 景深，单位 mm |
| `depthOfFieldSymmetric` | boolean \| null | 资料中的 DOF 是否为 `±` 范围 |
| `depthOfFieldAperture` | string \| null | DOF 对应光圈 |
| `aperture` | string \| null | 最佳或标称光圈 |
| `sensorFormat` | string \| null | 镜头资料标称支持的光学靶面 |
| `imageMtfLpMmMin` | number \| null | 镜头像方 MTF 下限，单位 lp/mm |
| `objectSpaceResolutionUm` | number \| null | 厂家直接给出的物方解析度，单位 μm；优先于此计算 Lens Resolution |
| `resolutionSource` | `manufacturer-object-space` \| `mtf-estimate` \| null | Lens Resolution 来源；为空时由报告层动态判断 |
| `depthOfFieldMinMm` | number \| null | 可变光阑导致的景深下限，单位 mm |
| `depthOfFieldMaxMm` | number \| null | 可变光阑导致的景深上限，单位 mm |
| `dataQuality` | string \| null | 提取质量标记，如 `official-web-table-extracted`、`datasheet-extracted` |
| `conflicts` | Record\<string, string[]\> \| null | 多来源关键参数差异，如 `document_model` |
| `aliases` | string[] | 同型号别名 |
| `recommendationStatus` | `verified` \| `manual-review` | 推荐可信状态 |
| `sourceFiles` / `notes` | string[] | 资料来源与提取备注 |
| `enabled` / `hidden` | boolean | 是否参与选择、是否隐藏 |
| `source` / `customized` / `updatedAt` | mixed | 来源和本机修改元数据 |

## 兼容性规则

推荐默认要求接口兼容、镜头像圈覆盖相机传感器，并且镜头不是人工复核状态。组合计算的镜头下拉框只默认隐藏明确不兼容的镜头，资料缺失的镜头仍保留并标记待确认；“显示不兼容镜头”可恢复全部候选。

像圈覆盖使用 `sensorDiagonalMm <= maxSensorDiagonalMm` 判断，不按 `2/3″`、`1″` 等字符串排序。缺少接口、像圈或关键倍率资料时，组合仍可显示数学结果，但会标记“需复核”；明确接口不同或像圈不足时标记“不兼容”。FOV 计算不等同于机械安装和现场工作距离保证。
