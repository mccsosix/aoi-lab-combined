import type { Lens } from "./types";

export type LensResolutionSource = "mtf" | "diffraction" | null;

export type LensResolution = {
  valueMm: number | null;
  source: LensResolutionSource;
};

// 可见光中心波长（mm），用于衍射极限估算（白光取 0.55 µm）
const LAMBDA_MM = 0.00055;

// 解析光圈字符串（"F8"、"F9.6"、"8"）为数值 F 数
export function parseFNumber(aperture: string | null | undefined): number | null {
  if (!aperture) return null;
  const match = aperture.trim().replace(/\s/g, "").match(/^F?(\d+(?:\.\d+)?)$/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * 镜头物面分辨率 L（mm）——镜头能分辨的物面最小特征。
 *
 * 优先：像面 MTF 换算（规格书 / MTF 曲线）
 *   L = 1 / (2 · N · M)     N：像面线对数 lp/mm；M：倍率
 *   一条线对 = 一明一暗两条线，单线宽 = 线对宽的一半，故除 2。
 *
 * 补充：衍射极限估算（镜头只给了光圈 F#、没有 MTF 时）
 *   由瑞利判据 L ≈ 0.61 · λ / NA_object，远心镜头物方 NA_object ≈ M / (2·F#)，
 *   代入得 L = 1.22 · λ · F# / M。
 *   这是理论物理下限，实际分辨率受像差影响会更差，仅作参考。
 *
 * 两者都缺时返回 null（无法判定）。
 */
export function lensResolutionMm(lens: Lens, magnification: number): LensResolution {
  if (!Number.isFinite(magnification) || magnification <= 0) return { valueMm: null, source: null };

  const mtf = lens.imageMtfLpMmMin;
  if (mtf && mtf > 0) {
    return { valueMm: 1 / (2 * mtf * magnification), source: "mtf" };
  }

  const fNumber = parseFNumber(lens.aperture);
  if (fNumber) {
    return { valueMm: (1.22 * LAMBDA_MM * fNumber) / magnification, source: "diffraction" };
  }

  return { valueMm: null, source: null };
}
