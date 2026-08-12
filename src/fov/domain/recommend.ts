import { checkCompatibility } from "./compatibility";
import { calculateFov, checkCoverage, selectMagnificationForTarget } from "./fov";
import type { Camera, CompatibilityResult, FovResult, Lens, TargetFov } from "./types";

export type Recommendation = {
  id: string;
  camera: Camera;
  lens: Lens;
  fov: FovResult;
  compatibility: CompatibilityResult;
  rotated: boolean;
  score: number;
  widthOverMm: number;
  heightOverMm: number;
  widthOverRate: number;
  heightOverRate: number;
};

export type Exclusions = {
  disabled: number;
  missingData: number;
  mountOrCircle: number;
  insufficientFov: number;
};

export function recommendCombinations(
  cameras: Camera[],
  lenses: Lens[],
  target: TargetFov,
  options: { allowRotate?: boolean; includeReview?: boolean; limit?: number } = {},
) {
  const exclusions: Exclusions = { disabled: 0, missingData: 0, mountOrCircle: 0, insufficientFov: 0 };
  const items: Recommendation[] = [];
  for (const camera of cameras) {
    for (const lens of lenses) {
      if (!camera.enabled || camera.hidden || !lens.enabled || lens.hidden) { exclusions.disabled++; continue; }
      let magnification: number | null;
      try { magnification = selectMagnificationForTarget(camera, lens, target); } catch { exclusions.missingData++; continue; }
      if (!magnification) { exclusions.insufficientFov++; continue; }
      const compatibility = checkCompatibility(camera, lens);
      if (compatibility.status === "incompatible" || (compatibility.status === "review" && !options.includeReview)) { exclusions.mountOrCircle++; continue; }
      let fov: FovResult;
      try { fov = calculateFov(camera, lens, magnification); } catch { exclusions.missingData++; continue; }
      const coverage = checkCoverage(fov, target, Boolean(options.allowRotate));
      if (!coverage.covered) { exclusions.insufficientFov++; continue; }
      const widthOverMm = fov.widthMm - coverage.usedTarget.widthMm;
      const heightOverMm = fov.heightMm - coverage.usedTarget.heightMm;
      const widthOverRate = widthOverMm / coverage.usedTarget.widthMm;
      const heightOverRate = heightOverMm / coverage.usedTarget.heightMm;
      items.push({
        id: `${camera.id}|${lens.id}`,
        camera, lens, fov, compatibility, rotated: coverage.rotated,
        score: Math.hypot(widthOverRate, heightOverRate),
        widthOverMm, heightOverMm, widthOverRate, heightOverRate,
      });
    }
  }
  items.sort((a, b) => a.score - b.score || b.camera.megapixels - a.camera.megapixels || `${a.camera.model}|${a.lens.model}`.localeCompare(`${b.camera.model}|${b.lens.model}`, "zh-CN"));
  return { items: items.slice(0, options.limit ?? 200), exclusions, totalMatches: items.length };
}
