import type { Camera, FovResult, Lens } from "./types";

export type ReportResult = {
  cameraModel: string;
  lensModel: string;
  nominalMegapixels: number | null;
  sensorFormat: string | null;
  fps: number | null;
  fovWidthMm: number;
  fovHeightMm: number;
  magnification: number;
  dofSourceMm: number | null;
  dofMm: number | null;
  dofSymmetric: boolean;
  dofAperture: string | null;
  resolutionMmPerPixel: number;
  lensResolutionMm: number | null;
};

export function buildReportResult(camera: Camera, lens: Lens, fov: FovResult): ReportResult {
  const dofSourceMm = lens.depthOfFieldMm && lens.depthOfFieldMm > 0 ? lens.depthOfFieldMm : null;
  const mtf = lens.imageMtfLpMmMin && lens.imageMtfLpMmMin > 0 ? lens.imageMtfLpMmMin : null;
  return {
    cameraModel: camera.model,
    lensModel: lens.model,
    nominalMegapixels: camera.nominalMegapixels ?? (camera.megapixels > 0 ? camera.megapixels : null),
    sensorFormat: camera.sensorFormat ?? null,
    fps: camera.fps ?? null,
    fovWidthMm: fov.widthMm,
    fovHeightMm: fov.heightMm,
    magnification: fov.magnification,
    dofSourceMm,
    dofMm: dofSourceMm === null ? null : dofSourceMm * fov.magnification,
    dofSymmetric: Boolean(lens.depthOfFieldSymmetric),
    dofAperture: lens.depthOfFieldAperture ?? null,
    resolutionMmPerPixel: fov.mmPerPixelX,
    lensResolutionMm: mtf === null ? null : 1 / (2 * mtf * fov.magnification),
  };
}

const fixed = (value: number | null, digits: number) => value === null ? "—" : value.toFixed(digits);
const compact = (value: number | null) => value === null ? "—" : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
const magnification = (value: number) => new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 4 }).format(value);

export function formatReportText(result: ReportResult): string {
  const sign = result.dofSymmetric ? "±" : "";
  const dof = result.dofMm === null
    ? "—"
    : `${sign}${fixed(result.dofMm, 2)} mm（${sign}${fixed(result.dofSourceMm, 2)} mm × ${magnification(result.magnification)}）`;
  const sensorParts = [
    result.nominalMegapixels === null ? "—" : `${compact(result.nominalMegapixels)}M`,
    result.sensorFormat ? `（${result.sensorFormat}）` : "",
    `/ fps=${compact(result.fps)}`,
  ];
  return [
    `CCD：${result.cameraModel}`,
    `Sensor Size：${sensorParts.join("")}`,
    `Lens：${result.lensModel}`,
    `FOV：${fixed(result.fovWidthMm, 2)} × ${fixed(result.fovHeightMm, 2)} mm`,
    `DOF：${dof}`,
    `Resolution：${fixed(result.resolutionMmPerPixel, 5)} mm/pixel`,
    `Lens Resolution：${result.lensResolutionMm === null ? "—" : `${fixed(result.lensResolutionMm, 3)} mm/pixel`}`,
  ].join("\n");
}
