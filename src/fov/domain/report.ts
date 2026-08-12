import type { Camera, FovResult, Lens } from "./types";

export type ReportResult = {
  cameraModel: string;
  lensModel: string;
  nominalMegapixels: number | null;
  computedMegapixels: number | null;
  sensorFormat: string | null;
  fps: number | null;
  fovWidthMm: number;
  fovHeightMm: number;
  magnification: number;
  dofSourceMm: number | null;
  dofMm: number | null;
  dofSourceMinMm: number | null;
  dofSourceMaxMm: number | null;
  dofMinMm: number | null;
  dofMaxMm: number | null;
  dofSymmetric: boolean;
  dofAperture: string | null;
  resolutionMmPerPixel: number;
  lensResolutionMm: number | null;
  lensResolutionSource: "manufacturer-object-space" | "mtf-estimate" | null;
};

export function buildReportResult(camera: Camera, lens: Lens, fov: FovResult): ReportResult {
  const dofSourceMm = lens.depthOfFieldMm && lens.depthOfFieldMm > 0 ? lens.depthOfFieldMm : null;
  const dofSourceMinMm = lens.depthOfFieldMinMm && lens.depthOfFieldMinMm > 0 ? lens.depthOfFieldMinMm : null;
  const dofSourceMaxMm = lens.depthOfFieldMaxMm && lens.depthOfFieldMaxMm > 0 ? lens.depthOfFieldMaxMm : null;
  const dofMm = dofSourceMm === null ? null : dofSourceMm * fov.magnification;
  const dofMinMm = dofSourceMinMm === null ? null : dofSourceMinMm * fov.magnification;
  const dofMaxMm = dofSourceMaxMm === null ? null : dofSourceMaxMm * fov.magnification;

  // Lens Resolution 优先级：
  // 1) 厂家直接物方解析度 objectSpaceResolutionUm（除以 1000 得到 mm）
  // 2) 仅有像方 MTF 时，按 1/(2 × MTF lp/mm × 实际倍率) 估算物方 half-pitch
  // 3) 两者都缺失：明确标记为资料未提供，绝不填 0 或猜测
  const objRes = lens.objectSpaceResolutionUm && lens.objectSpaceResolutionUm > 0 ? lens.objectSpaceResolutionUm : null;
  const mtf = lens.imageMtfLpMmMin && lens.imageMtfLpMmMin > 0 ? lens.imageMtfLpMmMin : null;
  let lensResolutionMm: number | null = null;
  let lensResolutionSource: "manufacturer-object-space" | "mtf-estimate" | null = null;
  if (objRes !== null) {
    lensResolutionMm = objRes / 1000;
    lensResolutionSource = "manufacturer-object-space";
  } else if (mtf !== null) {
    lensResolutionMm = 1 / (2 * mtf * fov.magnification);
    lensResolutionSource = "mtf-estimate";
  }

  return {
    cameraModel: camera.model,
    lensModel: lens.model,
    nominalMegapixels: camera.nominalMegapixels ?? null,
    computedMegapixels: camera.megapixels > 0 ? camera.megapixels : null,
    sensorFormat: camera.sensorFormat ?? null,
    fps: camera.fps ?? null,
    fovWidthMm: fov.widthMm,
    fovHeightMm: fov.heightMm,
    magnification: fov.magnification,
    dofSourceMm,
    dofMm,
    dofSourceMinMm,
    dofSourceMaxMm,
    dofMinMm,
    dofMaxMm,
    dofSymmetric: Boolean(lens.depthOfFieldSymmetric),
    dofAperture: lens.depthOfFieldAperture ?? null,
    resolutionMmPerPixel: fov.mmPerPixelX,
    lensResolutionMm,
    lensResolutionSource,
  };
}

const fixed = (value: number | null, digits: number) => value === null ? "—" : value.toFixed(digits);
const compact = (value: number | null) => value === null ? "—" : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
const magnification = (value: number) => new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 4 }).format(value);
const computedMp = (value: number) => new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);

export function formatReportText(result: ReportResult): string {
  const sign = result.dofSymmetric ? "±" : "";
  let dof: string;
  if (result.dofMinMm !== null && result.dofMaxMm !== null && result.dofMm === null) {
    dof = `${fixed(result.dofMinMm, 2)}–${fixed(result.dofMaxMm, 2)} mm（${fixed(result.dofSourceMinMm, 2)}–${fixed(result.dofSourceMaxMm, 2)} mm × ${magnification(result.magnification)}）`;
  } else if (result.dofMm === null) {
    dof = "—";
  } else {
    dof = `${sign}${fixed(result.dofMm, 2)} mm（${sign}${fixed(result.dofSourceMm, 2)} mm × ${magnification(result.magnification)}）`;
  }

  // Sensor Size：标称像素优先；缺失标称时显示按分辨率计算值并注明，不伪装成厂家标称。
  const mp = result.nominalMegapixels !== null
    ? `${compact(result.nominalMegapixels)}M`
    : result.computedMegapixels !== null
      ? `${computedMp(result.computedMegapixels)} MP（按分辨率计算）`
      : "—";
  const fmt = result.sensorFormat ? `（${result.sensorFormat}）` : "靶面规格待补";
  const fpsPart = result.fps !== null ? compact(result.fps) : "待补";
  const sensorParts = [mp, fmt, `/ fps=${fpsPart}`];

  // Lens Resolution：物方光学解析度，单位为 mm；与相机像素采样间距(Resolution)分开。
  const lensRes = result.lensResolutionMm === null ? "—（资料未提供）" : `${fixed(result.lensResolutionMm, 3)} mm`;

  return [
    `CCD：${result.cameraModel}`,
    `Sensor Size：${sensorParts.join("")}`,
    `Lens：${result.lensModel}`,
    `FOV：${fixed(result.fovWidthMm, 2)} × ${fixed(result.fovHeightMm, 2)} mm`,
    `DOF：${dof}`,
    `Resolution：${fixed(result.resolutionMmPerPixel, 5)} mm/pixel`,
    `Lens Resolution：${lensRes}`,
  ].join("\n");
}
