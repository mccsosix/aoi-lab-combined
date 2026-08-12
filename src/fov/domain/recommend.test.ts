import { describe, expect, it } from "vitest";
import { cameraFixture, lensFixture } from "../../../tests/fixtures";
import { recommendCombinations } from "./recommend";

describe("组合推荐", () => {
  it("只保留完整覆盖并按相对超出量排序", () => {
    const cameras = [
      { ...cameraFixture, id: "near", model: "NEAR", sensorWidthMm: 9.1, sensorHeightMm: 5.1 },
      { ...cameraFixture, id: "wide", model: "WIDE", sensorWidthMm: 10, sensorHeightMm: 6 },
      { ...cameraFixture, id: "short", model: "SHORT", sensorWidthMm: 9, sensorHeightMm: 4.9 },
    ];
    const lens = { ...lensFixture, magnification: 0.1 };
    const result = recommendCombinations(cameras, [lens], { widthMm: 90, heightMm: 50 });
    expect(result.items.map((item) => item.camera.id)).toEqual(["near", "wide"]);
    expect(result.exclusions.insufficientFov).toBe(1);
  });

  it("默认排除待确认组合，用户主动包含后才显示", () => {
    const reviewLens = { ...lensFixture, id: "review", mount: null, recommendationStatus: "manual-review" as const };
    expect(recommendCombinations([cameraFixture], [reviewLens], { widthMm: 10, heightMm: 10 }).items).toHaveLength(0);
    expect(recommendCombinations([cameraFixture], [reviewLens], { widthMm: 10, heightMm: 10 }, { includeReview: true }).items[0]?.compatibility.status).toBe("review");
  });
});
