import type { Camera, FovDimensions, FovResult, Lens, TargetFov } from "./types";

export function effectiveMagnification(lens: Lens): number {
  const value = lens.magnification ?? lens.nominalMagnification;
  if (!value || value <= 0) throw new RangeError("镜头倍率必须大于 0");
  return value;
}

export function calculateFov(camera: Camera, lens: Lens, magnification = effectiveMagnification(lens)): FovResult {
  if (magnification <= 0) throw new RangeError("镜头倍率必须大于 0");
  if (camera.sensorWidthMm <= 0 || camera.sensorHeightMm <= 0) throw new RangeError("传感器尺寸必须大于 0");
  if (camera.resolutionWidthPx <= 0 || camera.resolutionHeightPx <= 0) throw new RangeError("相机分辨率必须大于 0");
  const widthMm = camera.sensorWidthMm / magnification;
  const heightMm = camera.sensorHeightMm / magnification;
  const mmPerPixelX = widthMm / camera.resolutionWidthPx;
  const mmPerPixelY = heightMm / camera.resolutionHeightPx;
  return {
    widthMm,
    heightMm,
    diagonalMm: Math.hypot(widthMm, heightMm),
    mmPerPixelX,
    mmPerPixelY,
    umPerPixelX: mmPerPixelX * 1000,
    umPerPixelY: mmPerPixelY * 1000,
    magnification,
  };
}

export function checkCoverage(fov: FovDimensions, target: TargetFov, allowRotate: boolean) {
  if (target.widthMm <= 0 || target.heightMm <= 0) throw new RangeError("目标宽高必须大于 0");
  const direct = fov.widthMm >= target.widthMm && fov.heightMm >= target.heightMm;
  if (direct) return { covered: true, rotated: false, usedTarget: target };
  const rotatedTarget = { widthMm: target.heightMm, heightMm: target.widthMm };
  const rotated = allowRotate && fov.widthMm >= rotatedTarget.widthMm && fov.heightMm >= rotatedTarget.heightMm;
  return { covered: rotated, rotated, usedTarget: rotated ? rotatedTarget : target };
}

export function selectMagnificationForTarget(camera: Camera, lens: Lens, target: TargetFov): number | null {
  if (!lens.magnificationMin || !lens.magnificationMax) return effectiveMagnification(lens);
  const tightestCovering = Math.min(camera.sensorWidthMm / target.widthMm, camera.sensorHeightMm / target.heightMm);
  if (tightestCovering < lens.magnificationMin) return null;
  return Math.min(tightestCovering, lens.magnificationMax);
}
