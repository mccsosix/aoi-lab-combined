import type { Camera, CompatibilityResult, Lens } from "./types";

const aliases: Record<string, string> = {
  "c-mount": "c", "c mount": "c", "c口": "c", c: "c",
  "cs-mount": "cs", "cs mount": "cs", "cs口": "cs", cs: "cs",
  "m42×1": "m42x1", "m42x1": "m42x1", "m42*1": "m42x1",
  "f-mount": "f", "f mount": "f", f: "f",
};

export function normalizeMount(value: string): string {
  const key = value.trim().toLowerCase().replace(/×/g, "x");
  return aliases[key] ?? key.replace(/[\s_-]+/g, "");
}

export function checkCompatibility(camera: Camera, lens: Lens): CompatibilityResult {
  const incompatible: string[] = [];
  const review: string[] = [];
  if (!camera.lensMount || !lens.mount) review.push("相机或镜头接口资料缺失");
  else if (normalizeMount(camera.lensMount) !== normalizeMount(lens.mount)) incompatible.push(`接口不匹配：${camera.lensMount} / ${lens.mount}`);
  if (!camera.sensorDiagonalMm || !lens.maxSensorDiagonalMm) review.push("传感器对角线或镜头像圈资料缺失");
  else if (camera.sensorDiagonalMm > lens.maxSensorDiagonalMm + 1e-9) incompatible.push(`像圈不足：需要 ${camera.sensorDiagonalMm.toFixed(2)} mm，镜头支持 ${lens.maxSensorDiagonalMm.toFixed(2)} mm`);
  if (lens.recommendationStatus === "manual-review" && review.length === 0 && incompatible.length === 0) review.push("原始资料标记为需人工核对");
  if (incompatible.length) return { status: "incompatible", reasons: incompatible };
  if (review.length) return { status: "review", reasons: review };
  return { status: "compatible", reasons: ["接口匹配，像圈完整覆盖传感器"] };
}

export function isExplicitlyIncompatible(camera: Camera, lens: Lens): boolean {
  return checkCompatibility(camera, lens).status === "incompatible";
}
