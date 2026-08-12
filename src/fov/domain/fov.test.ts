import { describe, expect, it } from "vitest";
import { cameraFixture, lensFixture } from "../../../tests/fixtures";
import { calculateFov, checkCoverage, selectMagnificationForTarget } from "./fov";

describe("FOV 计算", () => {
  it("使用未舍入的传感器与倍率计算视野和像素精度", () => {
    const result = calculateFov(cameraFixture, lensFixture);
    expect(result.widthMm).toBe(64);
    expect(result.heightMm).toBeCloseTo(39.96153846153846, 12);
    expect(result.mmPerPixelX).toBe(0.0125);
    expect(result.umPerPixelX).toBe(12.5);
  });

  it("宽度足够但高度不足时不算完整覆盖", () => {
    expect(checkCoverage({ widthMm: 100, heightMm: 49 }, { widthMm: 90, heightMm: 50 }, false).covered).toBe(false);
  });

  it("只有启用旋转时才允许宽高互换", () => {
    expect(checkCoverage({ widthMm: 60, heightMm: 100 }, { widthMm: 90, heightMm: 50 }, false).covered).toBe(false);
    expect(checkCoverage({ widthMm: 60, heightMm: 100 }, { widthMm: 90, heightMm: 50 }, true)).toMatchObject({ covered: true, rotated: true });
  });

  it("为可调倍率镜头选择范围内最贴近目标的倍率", () => {
    const lens = { ...lensFixture, magnification: null, magnificationMin: 0.1, magnificationMax: 0.5, nominalMagnification: 0.2 };
    expect(selectMagnificationForTarget(cameraFixture, lens, { widthMm: 40, heightMm: 25 })).toBeCloseTo(0.33248, 5);
  });
});
