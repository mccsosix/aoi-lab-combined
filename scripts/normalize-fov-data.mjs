import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
// 上游镜头资料：本次交接提供的合并后新镜头数据库（623 款，含原 426 稳定 ID + 197 新增）。
const upstreamLensFile = path.resolve(root, "up/lenses(1).json");
// 相机资料：现有标准化产物（1,135 台）保持不变；FPS/标称像素等补充依赖官方来源，不在本次脚本臆测。
const existingCameraFile = path.resolve(root, "src/fov/data/cameras.json");
const upstreamReportFile = path.resolve(root, "up/lens-extraction-report(1).json");
const updatedAt = "2026-08-12T00:00:00.000Z";

const lensSource = JSON.parse(await readFile(upstreamLensFile, "utf8"));
const cameraSource = JSON.parse(await readFile(existingCameraFile, "utf8"));

assert.ok(Array.isArray(lensSource.lenses), "新镜头文件必须包含 lenses 数组");
assert.equal(lensSource.lenses.length, 623, "新镜头总数应为 623");

const cameras = cameraSource.map((item) => ({ ...item, source: "default", customized: false, updatedAt }));

const lenses = lensSource.lenses.map((item) => {
  const magnification = item.magnification ?? item.nominal_magnification ?? null;
  const maxSensorDiagonalMm = item.supported_image_circle_mm ?? null;
  // 推荐状态以新资料本身的判定为准（已遵循：缺接口/冲突不标 verified）。
  const recommendationStatus = item.recommendation_status === "verified" ? "verified" : "manual-review";
  const depthOfFieldMm = item.depth_of_field_mm ?? null;
  const depthOfFieldMinMm = item.depth_of_field_min_mm ?? null;
  const depthOfFieldMaxMm = item.depth_of_field_max_mm ?? null;
  const objectSpaceResolutionUm = item.object_space_resolution_um ?? null;
  return {
    id: item.id,
    brand: item.brand,
    series: item.series ?? "",
    model: item.model,
    lensType: item.lens_type ?? "工业镜头",
    enabled: true,
    hidden: false,
    magnification,
    magnificationMin: item.magnification_min ?? null,
    magnificationMax: item.magnification_max ?? null,
    nominalMagnification: item.nominal_magnification ?? null,
    mount: item.mount ?? null,
    maxSensorDiagonalMm,
    workingDistanceMm: item.working_distance_mm ?? item.nominal_working_distance_mm ?? null,
    depthOfFieldMm,
    depthOfFieldMinMm,
    depthOfFieldMaxMm,
    depthOfFieldSymmetric: Boolean(item.depth_of_field_aperture),
    depthOfFieldAperture: item.depth_of_field_aperture ?? null,
    aperture: item.aperture ?? null,
    sensorFormat: item.sensor_format ?? null,
    imageMtfLpMmMin: item.image_mtf_lp_mm_min ?? null,
    objectSpaceResolutionUm,
    resolutionSource: objectSpaceResolutionUm ? "manufacturer-object-space" : (item.image_mtf_lp_mm_min ? "mtf-estimate" : null),
    dataQuality: item.data_quality ?? null,
    conflicts: item.conflicts ?? null,
    aliases: item.aliases ?? [],
    recommendationStatus,
    sourceFiles: item.source_files ?? [],
    notes: item.notes ?? [],
    source: "default",
    customized: false,
    updatedAt,
  };
});

// 全库唯一性校验
assert.equal(new Set(lenses.map((item) => item.id)).size, lenses.length, "镜头 ID 必须全库唯一");
const keys = new Set(lenses.map((item) => `${item.brand}|${item.model}`));
assert.equal(keys.size, lenses.length, "同品牌同型号不得重复");

const output = path.join(root, "src/fov/data");
await mkdir(output, { recursive: true });
await writeFile(path.join(output, "cameras.json"), `${JSON.stringify(cameras, null, 2)}\n`);
await writeFile(path.join(output, "lenses.json"), `${JSON.stringify(lenses, null, 2)}\n`);
await copyFile(upstreamReportFile, path.join(output, "lens-extraction-report.json"));

console.log(JSON.stringify({
  cameras: cameras.length,
  lenses: lenses.length,
  lensBrands: Object.fromEntries([...new Set(lenses.map((item) => item.brand))].map((brand) => [brand, lenses.filter((item) => item.brand === brand).length])),
  verifiedLenses: lenses.filter((item) => item.recommendationStatus === "verified").length,
  manualReviewLenses: lenses.filter((item) => item.recommendationStatus === "manual-review").length,
  withObjectSpaceResolution: lenses.filter((item) => item.objectSpaceResolutionUm != null).length,
  withDofRange: lenses.filter((item) => item.depthOfFieldMinMm != null && item.depthOfFieldMaxMm != null).length,
}, null, 2));
