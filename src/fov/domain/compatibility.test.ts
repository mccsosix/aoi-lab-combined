import { describe, expect, it } from "vitest";
import { cameraFixture, lensFixture } from "../../../tests/fixtures";
import { checkCompatibility, isExplicitlyIncompatible, normalizeMount } from "./compatibility";

describe("物理兼容性", () => {
  it("规范化常见 C 口写法", () => {
    expect(normalizeMount(" C-Mount ")).toBe("c");
    expect(normalizeMount("C口")).toBe("c");
  });

  it("像圈与传感器对角线相等时兼容", () => {
    expect(checkCompatibility({ ...cameraFixture, sensorDiagonalMm: 16 }, lensFixture).status).toBe("compatible");
  });

  it("接口不匹配或像圈不足时明确排除", () => {
    const result = checkCompatibility(cameraFixture, { ...lensFixture, mount: "M42x1", maxSensorDiagonalMm: 10 });
    expect(result.status).toBe("incompatible");
    expect(result.reasons).toEqual(expect.arrayContaining([expect.stringContaining("接口"), expect.stringContaining("像圈")]));
  });

  it("接口或像圈未知时要求人工确认", () => {
    expect(checkCompatibility({ ...cameraFixture, lensMount: null }, lensFixture).status).toBe("review");
    expect(checkCompatibility(cameraFixture, { ...lensFixture, maxSensorDiagonalMm: null }).status).toBe("review");
  });

  it("用实际对角线判断小传感器可被较大像圈覆盖", () => {
    expect(isExplicitlyIncompatible({ ...cameraFixture, sensorDiagonalMm: 11 }, { ...lensFixture, maxSensorDiagonalMm: 16 })).toBe(false);
    expect(isExplicitlyIncompatible({ ...cameraFixture, sensorDiagonalMm: 18.1 }, { ...lensFixture, maxSensorDiagonalMm: 16.6 })).toBe(true);
  });
});
