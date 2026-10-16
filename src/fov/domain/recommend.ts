import { checkCompatibility } from "./compatibility";
import { calculateFov, checkCoverage, selectMagnificationForTarget } from "./fov";
import { lensResolutionMm, type LensResolutionSource } from "./lens-resolution";
import type { Camera, CompatibilityResult, FovResult, Lens, TargetFov } from "./types";

export type ResolutionStatus = "pass" | "fail" | "unknown";

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
  pixelMm: number;
  lensResolutionMm: number | null;
  lensResolutionSource: LensResolutionSource;
  effectiveResolutionMm: number | null;
  resolutionStatus: ResolutionStatus;
};

export type Exclusions = {
  disabled: number;
  missingData: number;
  mountOrCircle: number;
  insufficientFov: number;
  /** 有解析度资料且明确不达标（fail） */
  insufficientResolution: number;
  /** 完全没有解析度资料，无法判定（unknown）。与上者是两回事，必须分开计数 */
  resolutionUnknown: number;
};

export function recommendCombinations(
  cameras: Camera[],
  lenses: Lens[],
  target: TargetFov,
  options: {
    allowRotate?: boolean;
    includeReview?: boolean;
    limit?: number;
    toleranceMm?: number | null;
    /**
     * 是否把"缺少解析度资料、无法判定"的组合也纳入结果。
     * 默认 false，保持原有严格口径；设 true 时这些组合会带着
     * `resolutionStatus: "unknown"` 返回，由 UI 标注为待确认。
     */
    includeUnknownResolution?: boolean;
  } = {},
) {
  const exclusions: Exclusions = {
    disabled: 0, missingData: 0, mountOrCircle: 0,
    insufficientFov: 0, insufficientResolution: 0, resolutionUnknown: 0,
  };
  // 公差带 T 存在时，目标系统解析度按最严端 R = T/10 作为达标线
  const requiredR = options.toleranceMm && options.toleranceMm > 0 ? options.toleranceMm / 10 : null;
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

      const pixelMm = fov.mmPerPixelX;
      const lensResolution = lensResolutionMm(lens, fov.magnification);
      const lensResolutionMmValue = lensResolution.valueMm;
      const effectiveResolutionMm = lensResolutionMmValue === null ? pixelMm : Math.max(pixelMm, lensResolutionMmValue);
      const resolutionStatus: ResolutionStatus =
        lensResolutionMmValue === null
          ? "unknown"
          : requiredR === null
            ? "pass"
            : effectiveResolutionMm <= requiredR
              ? "pass"
              : "fail";
      // 「资料缺失」和「明确不达标」是两种不同结论：前者是不能判，后者是判了不通过。
      // 历史实现把两者都塞进 insufficientResolution 一起排除，实测会让 14.8%（63/426）
      // 的镜头被静默踢掉，用户只看到"资料缺失 N"却无法知道是哪些、也无法只看不排除。
      if (requiredR !== null && resolutionStatus !== "pass") {
        if (resolutionStatus === "unknown") {
          exclusions.resolutionUnknown++;
          if (!options.includeUnknownResolution) continue;
        } else {
          exclusions.insufficientResolution++;
          continue;
        }
      }

      const widthOverMm = fov.widthMm - coverage.usedTarget.widthMm;
      const heightOverMm = fov.heightMm - coverage.usedTarget.heightMm;
      const widthOverRate = widthOverMm / coverage.usedTarget.widthMm;
      const heightOverRate = heightOverMm / coverage.usedTarget.heightMm;
      items.push({
        id: `${camera.id}|${lens.id}`,
        camera, lens, fov, compatibility, rotated: coverage.rotated,
        score: Math.hypot(widthOverRate, heightOverRate),
        widthOverMm, heightOverMm, widthOverRate, heightOverRate,
        pixelMm,
        lensResolutionMm: lensResolutionMmValue,
        lensResolutionSource: lensResolution.source,
        effectiveResolutionMm,
        resolutionStatus,
      });
    }
  }
  items.sort((a, b) => a.score - b.score || b.camera.megapixels - a.camera.megapixels || `${a.camera.model}|${a.lens.model}`.localeCompare(`${b.camera.model}|${b.lens.model}`, "zh-CN"));
  return { items: items.slice(0, options.limit ?? 200), exclusions, totalMatches: items.length };
}
