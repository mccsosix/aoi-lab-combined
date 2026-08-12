import type { Camera, Lens } from "../src/fov/domain/types";

export const cameraFixture: Camera = {
  id: "camera-test", brand: "测试相机", series: "T", model: "CAM-5120",
  enabled: true, hidden: false, resolutionWidthPx: 5120, resolutionHeightPx: 3200,
  sensorWidthMm: 13.312, sensorHeightMm: 8.312, sensorDiagonalMm: 15.697,
  lensMount: "C", megapixels: 16.384, productUrl: null, source: "user",
  customized: false, updatedAt: "2026-08-12T00:00:00.000Z",
};

export const lensFixture: Lens = {
  id: "lens-test", brand: "测试镜头", series: "T", model: "LENS-0208",
  lensType: "物方远心", enabled: true, hidden: false, magnification: 0.208,
  magnificationMin: null, magnificationMax: null, nominalMagnification: null,
  mount: "C-mount", maxSensorDiagonalMm: 16, workingDistanceMm: 110,
  depthOfFieldMm: null, recommendationStatus: "verified", sourceFiles: ["fixture.pdf"],
  notes: [], source: "user", customized: false, updatedAt: "2026-08-12T00:00:00.000Z",
};
