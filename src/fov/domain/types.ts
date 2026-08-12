export type DeviceSource = "default" | "user";

export type Camera = {
  id: string;
  brand: string;
  series: string;
  model: string;
  enabled: boolean;
  hidden: boolean;
  resolutionWidthPx: number;
  resolutionHeightPx: number;
  sensorWidthMm: number;
  sensorHeightMm: number;
  sensorDiagonalMm: number;
  lensMount: string | null;
  megapixels: number;
  nominalMegapixels?: number | null;
  sensorFormat?: string | null;
  fps?: number | null;
  pixelSizeXUm?: number | null;
  pixelSizeYUm?: number | null;
  sensorModel?: string | null;
  productUrl: string | null;
  source: DeviceSource;
  customized: boolean;
  updatedAt: string;
};

export type Lens = {
  id: string;
  brand: string;
  series: string;
  model: string;
  lensType: string;
  enabled: boolean;
  hidden: boolean;
  magnification: number | null;
  magnificationMin: number | null;
  magnificationMax: number | null;
  nominalMagnification: number | null;
  mount: string | null;
  maxSensorDiagonalMm: number | null;
  workingDistanceMm: number | null;
  depthOfFieldMm: number | null;
  depthOfFieldSymmetric?: boolean | null;
  depthOfFieldAperture?: string | null;
  aperture?: string | null;
  sensorFormat?: string | null;
  imageMtfLpMmMin?: number | null;
  objectSpaceResolutionUm?: number | null;
  resolutionSource?: "manufacturer-object-space" | "mtf-estimate" | null;
  depthOfFieldMinMm?: number | null;
  depthOfFieldMaxMm?: number | null;
  dataQuality?: string | null;
  conflicts?: Record<string, string[]> | null;
  aliases?: string[];
  recommendationStatus: "verified" | "manual-review";
  sourceFiles: string[];
  notes: string[];
  source: DeviceSource;
  customized: boolean;
  updatedAt: string;
};

export type TargetFov = { widthMm: number; heightMm: number };
export type FovDimensions = { widthMm: number; heightMm: number };
export type FovResult = FovDimensions & {
  diagonalMm: number;
  mmPerPixelX: number;
  mmPerPixelY: number;
  umPerPixelX: number;
  umPerPixelY: number;
  magnification: number;
};
export type CompatibilityResult = {
  status: "compatible" | "review" | "incompatible";
  reasons: string[];
};
