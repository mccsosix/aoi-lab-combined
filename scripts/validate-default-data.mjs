import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const cameras = JSON.parse(await readFile("src/fov/data/cameras.json", "utf8"));
const lenses = JSON.parse(await readFile("src/fov/data/lenses.json", "utf8"));
const extraction = JSON.parse(await readFile("src/fov/data/lens-extraction-report.json", "utf8"));

assert.equal(cameras.length, 1135, "相机总数必须为 1,135");
const brands = Object.fromEntries(["海康机器人", "Basler", "度申 / Do3think"].map((brand) => [brand, cameras.filter((item) => item.brand === brand).length]));
assert.deepEqual(brands, { "海康机器人": 641, Basler: 462, "度申 / Do3think": 32 });
assert.equal(new Set(cameras.map((item) => item.id)).size, cameras.length, "相机 ID 必须唯一");
assert.equal(cameras.filter((item) => !(item.sensorWidthMm > 0 && item.sensorHeightMm > 0 && item.resolutionWidthPx > 0 && item.resolutionHeightPx > 0)).length, 0, "相机 FOV 字段不可缺失");

assert.equal(lenses.length, 623, "镜头总数必须为 623");
assert.equal(new Set(lenses.map((item) => item.id)).size, lenses.length, "镜头 ID 必须唯一");
const lensBrands = Object.fromEntries([...new Set(lenses.map((item) => item.brand))].map((brand) => [brand, lenses.filter((item) => item.brand === brand).length]));
assert.deepEqual(lensBrands, { "燦銳": 227, "視清": 396 }, "镜头品牌分布必须为 燦銳 227 / 視清 396");
assert.equal(lenses.filter((item) => item.recommendationStatus === "verified").length, 411, "已校验镜头必须为 411");
assert.equal(lenses.filter((item) => item.recommendationStatus === "manual-review").length, 212, "人工复核镜头必须为 212");
assert.equal(lenses.filter((item) => item.objectSpaceResolutionUm != null).length, 56, "直接物方解析度必须保留 56 条");
assert.equal(lenses.filter((item) => item.depthOfFieldMinMm != null && item.depthOfFieldMaxMm != null).length, 58, "DOF 范围字段必须保留 58 条");

// 缺关键资料的镜头必须保持待核对，不得误标为已验证
for (const lens of lenses) {
  if (!lens.mount || !lens.maxSensorDiagonalMm || !lens.magnification) {
    assert.equal(lens.recommendationStatus, "manual-review", `${lens.model} 兼容资料缺失时必须待核对`);
  }
}

// 报告相机与镜头关键规格必须保留
const reportCamera = cameras.find((item) => item.model === "MV-CH250-90UC");
const reportLens = lenses.find((item) => item.model === "DTCM110-80H-AL");
assert.deepEqual({ sensorFormat: reportCamera?.sensorFormat, fps: reportCamera?.fps, nominalMegapixels: reportCamera?.nominalMegapixels }, { sensorFormat: '1.1”', fps: 14, nominalMegapixels: 25 }, "报告相机字段必须保留");
assert.deepEqual({ mtf: reportLens?.imageMtfLpMmMin, dof: reportLens?.depthOfFieldMm, aperture: reportLens?.depthOfFieldAperture }, { mtf: 135, dof: 14.8, aperture: "F16" }, "报告镜头字段必须保留");

// 新提取报告与最终镜头 JSON 的数量、品牌、状态必须一致
const db = extraction.database_output;
assert.equal(db.lens_count, lenses.length, "提取报告镜头数必须与最终 JSON 一致");
assert.deepEqual(db.brand_counts, lensBrands, "提取报告品牌分布必须与最终 JSON 一致");
assert.deepEqual(db.status_counts, { verified: 411, "manual-review": 212 }, "提取报告状态分布必须与最终 JSON 一致");

const summary = {
  cameras: cameras.length,
  cameraBrands: brands,
  camerasMissingMount: cameras.filter((item) => !item.lensMount).length,
  lenses: lenses.length,
  lensBrands,
  verifiedLenses: lenses.filter((item) => item.recommendationStatus === "verified").length,
  manualReviewLenses: lenses.filter((item) => item.recommendationStatus === "manual-review").length,
  lensesWithObjectSpaceResolution: lenses.filter((item) => item.objectSpaceResolutionUm != null).length,
  lensesWithDofRange: lenses.filter((item) => item.depthOfFieldMinMm != null && item.depthOfFieldMaxMm != null).length,
};
console.log(JSON.stringify(summary, null, 2));
