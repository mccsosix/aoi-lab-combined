import { describe, expect, it } from "vitest";
import { cameraFixture, lensFixture } from "../../../tests/fixtures";
import { calculateFov } from "./fov";
import { buildReportResult, formatReportText } from "./report";
import type { Camera, Lens } from "./types";

describe("报告参数", () => {
  it("按实际倍率折算报告 DOF", () => {
    const lens = { ...lensFixture, depthOfFieldMm: 14.8, depthOfFieldSymmetric: true } as Lens;
    const result = buildReportResult(cameraFixture, lens, calculateFov(cameraFixture, lens));
    expect(result.dofMm).toBeCloseTo(3.0784);
    expect(result.dofSymmetric).toBe(true);
  });

  it("将像方 MTF 换算为物方 half-pitch", () => {
    const lens = { ...lensFixture, imageMtfLpMmMin: 135 } as Lens;
    const result = buildReportResult(cameraFixture, lens, calculateFov(cameraFixture, lens));
    expect(result.lensResolutionMm).toBeCloseTo(0.0178062678);
  });

  it("资料缺失时保留空值并明确标注资料未提供", () => {
    const result = buildReportResult(cameraFixture as Camera, lensFixture, calculateFov(cameraFixture, lensFixture));
    expect(result.fps).toBeNull();
    expect(result.lensResolutionMm).toBeNull();
    expect(formatReportText(result)).toContain("Lens Resolution：—（资料未提供）");
  });

  it("优先采用厂家直接物方解析度", () => {
    const lens = { ...lensFixture, objectSpaceResolutionUm: 12 } as Lens;
    const result = buildReportResult(cameraFixture, lens, calculateFov(cameraFixture, lens));
    expect(result.lensResolutionMm).toBeCloseTo(0.012);
    expect(result.lensResolutionSource).toBe("manufacturer-object-space");
    expect(formatReportText(result)).toContain("Lens Resolution：0.012 mm");
  });

  it("仅有像方 MTF 时使用 half-pitch 估算", () => {
    const lens = { ...lensFixture, imageMtfLpMmMin: 135 } as Lens;
    const result = buildReportResult(cameraFixture, lens, calculateFov(cameraFixture, lens));
    expect(result.lensResolutionMm).toBeCloseTo(0.0178062678);
    expect(result.lensResolutionSource).toBe("mtf-estimate");
  });

  it("Sensor Size 区分标称像素与按分辨率计算，缺失时注明待补", () => {
    const nominal = buildReportResult({ ...cameraFixture, nominalMegapixels: 25, sensorFormat: '1.1"', fps: 14 } as Camera, lensFixture, calculateFov(cameraFixture, lensFixture));
    expect(formatReportText(nominal)).toContain('Sensor Size：25M（1.1"）/ fps=14');

    const computed = buildReportResult({ ...cameraFixture, nominalMegapixels: null, sensorFormat: null, fps: null } as Camera, lensFixture, calculateFov(cameraFixture, lensFixture));
    const text = formatReportText(computed);
    expect(text).toContain("16.38 MP（按分辨率计算）");
    expect(text).toContain("靶面规格待补");
    expect(text).toContain("fps=待补");
  });

  it("DOF 范围按 min/max 分别乘以实际倍率", () => {
    const lens = { ...lensFixture, depthOfFieldMinMm: 0.25, depthOfFieldMaxMm: 3.6 } as Lens;
    const result = buildReportResult(cameraFixture, lens, calculateFov(cameraFixture, lens));
    expect(result.dofMm).toBeNull();
    expect(result.dofMinMm).toBeCloseTo(0.052);
    expect(result.dofMaxMm).toBeCloseTo(0.7488);
    expect(formatReportText(result)).toContain("0.05–0.75 mm（0.25–3.60 mm × 0.208）");
  });

  it("生成固定七行报告文字", () => {
    const camera = { ...cameraFixture, nominalMegapixels: 16, sensorFormat: '1"', fps: 32 } as Camera;
    const lens = { ...lensFixture, depthOfFieldMm: 7, imageMtfLpMmMin: 120 } as Lens;
    const text = formatReportText(buildReportResult(camera, lens, calculateFov(camera, lens)));
    expect(text.split("\n")).toHaveLength(7);
    expect(text).toContain("CCD：CAM-5120");
    expect(text).toContain('Sensor Size：16M（1"）/ fps=32');
    expect(text).toContain("7.00 mm × 0.208");
    expect(text).toContain("Resolution：0.01250 mm/pixel");
  });
});
