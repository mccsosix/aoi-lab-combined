import { describe, expect, it } from "vitest";
import cameras from "../src/fov/data/cameras.json";
import lenses from "../src/fov/data/lenses.json";

describe("FOV 默认资料", () => {
  it("包含完整三品牌相机快照", () => {
    expect(cameras).toHaveLength(1135);
    expect(Object.fromEntries(["海康机器人", "Basler", "度申 / Do3think"].map((brand) => [brand, cameras.filter((item) => item.brand === brand).length]))).toEqual({ "海康机器人": 641, Basler: 462, "度申 / Do3think": 32 });
  });

  it("包含全部镜头且兼容资料缺失时不得标记为已验证", () => {
    expect(lenses).toHaveLength(623);
    expect(Object.fromEntries(["燦銳", "視清"].map((brand) => [brand, lenses.filter((item) => item.brand === brand).length]))).toEqual({ "燦銳": 227, "視清": 396 });
    expect(lenses.filter((item) => item.recommendationStatus === "verified").length).toBe(411);
    expect(lenses.filter((item) => item.recommendationStatus === "manual-review").length).toBe(212);
    for (const lens of lenses) {
      if (!lens.mount || !lens.maxSensorDiagonalMm || !lens.magnification) expect(lens.recommendationStatus).toBe("manual-review");
    }
  });

  it("保留并新增镜头关键字段", () => {
    expect(lenses.filter((item) => item.objectSpaceResolutionUm != null).length).toBe(56);
    expect(lenses.filter((item) => item.depthOfFieldMinMm != null && item.depthOfFieldMaxMm != null).length).toBe(58);
  });

  it("保留报告所需的相机与镜头原始规格", () => {
    const camera = cameras.find((item) => item.model === "MV-CH250-90UC");
    const lens = lenses.find((item) => item.model === "DTCM110-80H-AL");
    expect(camera).toMatchObject({ sensorFormat: '1.1”', fps: 14, pixelSizeXUm: 2.5, nominalMegapixels: 25 });
    expect(lens).toMatchObject({ sensorFormat: '1"', imageMtfLpMmMin: 135, magnification: 0.208, depthOfFieldMm: 14.8, depthOfFieldAperture: "F16", depthOfFieldSymmetric: true });
    const objectSpaceLens = lenses.find((item) => item.model === "XF-10MDT044X110-1C");
    expect(objectSpaceLens).toMatchObject({ objectSpaceResolutionUm: 12, resolutionSource: "manufacturer-object-space" });
    const missingLens = lenses.find((item) => item.model === "XF-10MDT035X110-1C");
    expect(missingLens?.objectSpaceResolutionUm ?? null).toBeNull();
    expect(missingLens?.imageMtfLpMmMin ?? null).toBeNull();
  });
});
