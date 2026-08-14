# FOV 相机数据追加说明（2026-08-12）

## 来源

本次追加基于用户提供的 `工作簿1(1).xlsx`。表格包含度申与 OPT 两组面阵相机，字段为：型号、数据接口、Sensor 光学格式、名义分辨率、像素分辨率、快门类型、fps。

## 去重结果

Excel 中度申的 `M3ST518M-H-O2C` 与 `M3ST518-H-O2C` 各重复出现一次。按型号去重后，共 14 个唯一型号：

- 度申 / Do3think：6 个
- OPT：8 个

原默认相机库已有 `M3ST1209M-H-O2C` 与 `U3P2500-H` 两个型号，因此本次实际是：

- 更新已有默认型号：2 个
- 新增默认型号：12 个
- 默认相机总数：1135 → 1147

## Excel 字段写入

以下字段直接采用工作簿内容：

- `model`
- `dataInterface = USB3.0`
- `sensorFormat`
- `nominalMegapixels`
- `resolutionWidthPx` / `resolutionHeightPx`
- `shutterType = Global`
- `fps`

相机数据库新增了两个**可选字段** `dataInterface` 与 `shutterType`。IndexedDB 的 object store/keyPath 没有改变，因此不需要数据库升级；旧记录缺少这两个字段时仍可正常读取。

## FOV 所需物理 Sensor 尺寸

现有 FOV 算法必须使用 `sensorWidthMm` / `sensorHeightMm`，但工作簿没有像元尺寸。为避免只导入型号却无法可靠计算 FOV，按相同分辨率/系列的厂商传感器规格补齐像元尺寸，再由 `分辨率 × 像元尺寸` 计算物理 Sensor 宽高：

- 2448 × 2048，度申 M3ST518：3.45 μm
- OPT 050 UG2：3.45 μm（IMX264 家族）
- OPT 050 UG4：3.4 μm（GMAX3405 家族）
- 4096 × 3072：3.4 μm（GMAX3412 / 同规格家族）
- 5120 × 5120：2.5 μm（GMAX0505 / 同规格家族）

这些补齐项仅用于构成现有 FOV 算法所需的相机物理参数；没有修改 FOV、兼容性或推荐算法。

## IndexedDB 升级行为

项目现有的 `initializeDefaults` 会在打开页面时：

1. 新默认 ID 不存在时自动新增；
2. 已存在且未被现场编辑（`customized=false`）时用新版默认资料更新，并保留 hidden 状态；
3. 已经被用户现场编辑（`customized=true`）的记录保持不动。

因此旧浏览器无需清空 IndexedDB，即可补入这批型号，同时不会覆盖现场自定义设备。
