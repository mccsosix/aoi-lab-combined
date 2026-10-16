/**
 * 06 打光报告生成器 —— 规格行 / 需求行的生成
 *
 * ⚠️ 这里是全项目最容易「悄悄长出第二份算法」的地方。
 *    FOV / mm-per-pixel 一律调用 03 的 `calculateFov`，
 *    镜头物面分辨率一律调用 03 的 `lensResolutionMm`。
 *    **不许在 06 里重写这两个公式**，否则 03 改了公式 06 会静默漂移。
 *
 * 与 03 的**唯一**口径差异（刻意保留，非疏漏）：
 *    03 报告页的 DOF 写 `标称DOF × 倍率`；
 *    打光报告的 DOF 写 `标称DOF × 折减因子`（本厂通用 40%，见源报告两处实例：
 *    slide3 14.8×0.4=5.92、slide4 19×0.4=7.6）。
 *    所以 06 **不**使用 03 的 `buildReportResult().dofMm`，只用它的几何部分。
 */
import { calculateFov } from "../../fov/domain/fov.ts";
import { lensResolutionMm } from "../../fov/domain/lens-resolution.ts";
import type { Camera, Lens } from "../../fov/domain/types.ts";
import { IMAGE_CAPTION_PREFIX } from "./template-layout.ts";
import type {
  DeviceData,
  ImageGroup,
  ImagePage,
  ImageSlot,
  RequirementSpec,
  StationSpec,
  UploadedImage,
} from "./types.ts";

/** 打光报告 DOF 折减因子默认值：本厂通用 0.4 */
export const DEFAULT_DOF_DERATE = 0.4;

const dash = (v: number | null | undefined, digits: number): string =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toFixed(digits);

/** 定小数位后抹掉尾随 0：源报告写 ±14.8mm 而不是 ±14.80mm、写 0.02 而不是 0.0200 */
export const trim = (v: number | null | undefined, digits: number): string => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const s = v.toFixed(digits);
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
};

export const findCamera = (devices: DeviceData, model: string): Camera | null =>
  devices.cameras.find((c) => c.model === model) ?? null;
export const findLens = (devices: DeviceData, model: string): Lens | null =>
  devices.lenses.find((l) => l.model === model) ?? null;

/**
 * 03 的 `calculateFov` 要求传一个 Lens —— 但它只在**没显式传倍率**时才读它。
 * 库外镜头（如源报告 CCD2 的 XF-10MDT0209X200-1C）没有 Lens 对象，
 * 又确实需要算几何，所以造一个只带倍率的占位镜头，并显式把倍率也传进去。
 */
const virtualLens = (model: string, magnification: number): Lens =>
  ({ model, magnification } as unknown as Lens);

export type SpecDerived = {
  mag: number | null;
  fovWidthMm: number | null;
  fovHeightMm: number | null;
  resolutionMmPerPixel: number | null;
  dofMm: number | null;
  dofNominalMm: number | null;
  lensResolutionMm: number | null;
  lensResolutionSource: string | null;
};

export type SpecResult = { lines: string[]; warnings: string[]; derived: SpecDerived };

/**
 * 生成【2.硬體設定】页的 10 行规格。
 * 行格式逐字符对齐源报告（`Lens ：` 有全角冒号与前后空格、FOV 用 `*`、Resolution 5 位小数）。
 */
export function buildSpecLines(station: StationSpec, devices: DeviceData): SpecResult {
  const cam = findCamera(devices, station.cameraModel);
  const lens = findLens(devices, station.lensModel);
  const warnings: string[] = [];
  const overrides = station.measured ?? {};

  const mag = station.measured?.magnification ?? lens?.magnification ?? null;
  if (!cam) warnings.push(`相机 ${station.cameraModel} 不在设备库（${devices.cameras.length} 台）→ 需人工填 FOV/Resolution`);
  if (!lens) warnings.push(`镜头 ${station.lensModel} 不在设备库（${devices.lenses.length} 款）→ 需人工填 DOF/Resolution/工作距离`);
  if (mag === null || !(Number(mag) > 0)) warnings.push("倍率未知（库外镜头）→ 需人工填倍率或直接填 FOV");

  // ① 相机
  const ccd = `${station.cameraModel}${station.newFlags?.includes("camera") ? "(新增)" : ""}`;

  // ② Sensor Size —— fps 以设备库为准；人工覆盖要留痕（源报告 14.3 vs 库值 14）
  const fps = overrides.fps ?? cam?.fps ?? null;
  if (overrides.fps !== undefined && cam && cam.fps != null && Number(cam.fps) !== Number(overrides.fps)) {
    warnings.push(`fps 人工覆盖：库值 ${cam.fps} → 报告值 ${overrides.fps}`);
  }
  const mp = cam ? (cam.nominalMegapixels ?? cam.megapixels ?? null) : null;

  // ③ 镜头
  const lensLine = `${station.lensModel}${station.newFlags?.includes("lens") ? "(新增)" : ""}`;

  // ④⑤ 视野 / 分辨率 —— 走 03 的几何实现（唯一真源）
  let fovWidthMm: number | null = overrides.fovWidthMm ?? null;
  let fovHeightMm: number | null = overrides.fovHeightMm ?? null;
  let resolutionMmPerPixel: number | null = overrides.resolutionMmPerPixel ?? null;
  if (cam && mag !== null && Number(mag) > 0 && cam.sensorWidthMm > 0 && cam.resolutionWidthPx > 0) {
    const fov = calculateFov(cam, lens ?? virtualLens(station.lensModel, Number(mag)), Number(mag));
    fovWidthMm = fov.widthMm;
    fovHeightMm = fov.heightMm;
    resolutionMmPerPixel = fov.mmPerPixelX;
  }

  // ⑥ 景深：标称 × 折减因子（本厂口径，默认 40%）
  const derate = station.dofDerateFactor ?? DEFAULT_DOF_DERATE;
  const dofNominalMm = lens?.depthOfFieldMm ?? overrides.dofNominalMm ?? null;
  const dofMm = dofNominalMm !== null && Number.isFinite(dofNominalMm) ? dofNominalMm * derate : null;

  // ⑦ 镜头物面分辨率 —— 走 03 的 lensResolutionMm（MTF 优先，缺失时回落衍射极限）
  let lensResMm: number | null = null;
  let lensResSource: string | null = null;
  if (lens && mag !== null && Number(mag) > 0) {
    const r = lensResolutionMm(lens, Number(mag));
    lensResMm = r.valueMm;
    lensResSource = r.source;
  }
  if (overrides.lensResolutionMmPerPixel !== undefined) {
    if (lensResMm !== null && Math.abs(lensResMm - overrides.lensResolutionMmPerPixel) > 1e-6) {
      warnings.push(
        `Lens Resolution 人工覆盖：公式算出 ${lensResMm.toFixed(4)} → 报告值 ${overrides.lensResolutionMmPerPixel}`,
      );
    }
    lensResMm = overrides.lensResolutionMmPerPixel;
    lensResSource = "manual";
  }
  if (lensResMm === null) warnings.push("Lens Resolution 无法计算（镜头无 MTF / 光圈数据）→ 需人工填");

  const deratePct = Math.round(derate * 100);
  const lines = [
    `CCD： ${ccd}`,
    `Sensor Size：${mp ?? "—"}M/ fps=${fps ?? "—"}`,
    `Lens ： ${lensLine}`,
    `FOV：${dash(fovWidthMm, 2)}*${dash(fovHeightMm, 2)}mm`,
    dofMm === null
      ? "DOF：—"
      : `DOF：±${trim(dofMm, 2)}mm (±${trim(dofNominalMm, 2)}mm*${deratePct}%=${trim(dofMm, 2)}mm)`,
    `Resolution：${resolutionMmPerPixel === null ? "—" : resolutionMmPerPixel.toFixed(5)}mm/pixel`,
    `Lens Resolution：${trim(lensResMm, 4)}mm/pixel`,
    `光源1： ${station.lightSource1 || "—"}${station.newFlags?.includes("light1") ? "(新增)" : ""}`,
    `光源2： ${station.lightSource2 || "—"}${station.newFlags?.includes("light2") ? "(新增)" : ""}`,
    `檢測項目：${(station.inspectionItems ?? []).filter(Boolean).join(",")}${station.newFlags?.includes("items") ? "(新增)" : ""}`,
  ];

  return {
    lines,
    warnings,
    derived: {
      mag: mag === null ? null : Number(mag),
      fovWidthMm,
      fovHeightMm,
      resolutionMmPerPixel,
      dofMm,
      dofNominalMm,
      lensResolutionMm: lensResMm,
      lensResolutionSource: lensResSource,
    },
  };
}

/**
 * 需求推导块（工站页右上那个文本框）—— **逐工站生成**。
 *
 * 用户 2026-09-30 定：全报告一份是错的。实测依据（源报告同一份里逐站不同）：
 *   CCD1「最小公差帶 0.1mm，一次檢測1pcs，伺服控制相機左右移動拍兩次」+ 遠心頭
 *   CCD2「最小公差帶 0.15mm…」+ 液態變焦鏡頭
 *   CCD4「檢測範圍：一次量測2pcs產品」+ CCTV鏡頭（**没有公差行**）
 *
 * 自动只覆盖最常见的那几行，形态超出的整块手写（`requireOverride`）：
 *   ① [可选] station.requireLead —— 自由前置行，如「最大值徑53.3mm，最大厚度6.7mm」
 *   ② [有公差才有] `最小公差±0.08mm，公差帶=0.16`（style='pm'）
 *                  或 `最小公差帶 0.1mm`（style='band'）；值后面可跟 inspectNote
 *   ③ [有公差才有] `理想系統解析度=1/8~1/10  → 0.016~0.02mm`
 *   ④ `選用25M Camera彩色相機 + 0.208x 遠心鏡頭可符合產品需求`
 *
 * 相机像素取自**本工站相机型号**（`cam`），不再来自全局需求段 ——
 * 这是用户明确要求搬走的一项（「应该在工站那里根据型号识别出」）。
 */
export function buildRequireLines(station: StationSpec, cam: Camera | null, magnification: number | null): string[] {
  const override = (station.requireOverride ?? []).filter((l) => String(l ?? "").trim().length > 0);
  if (override.length) return override;

  const lines: string[] = [];
  const lead = station.requireLead?.trim();
  if (lead) lines.push(lead);

  const raw = station.toleranceMm;
  const tol = raw === null || raw === undefined || !Number.isFinite(Number(raw)) ? null : Number(raw);
  if (tol !== null && tol > 0) {
    const style = station.toleranceStyle ?? "pm";
    const band = style === "band" ? tol : tol * 2;
    const note = station.inspectNote?.trim() ? `，${station.inspectNote.trim()}` : "";
    lines.push(
      style === "band"
        ? `最小公差帶 ${trim(tol, 4)}mm${note}`
        : `最小公差±${trim(tol, 4)}mm，公差帶=${trim(band, 4)}${note}`,
    );
    // 4 位小数：源报告的 0.016~0.02 就是「精确值抹掉尾随 0」；
    // 固定 2 位会在窄公差带上把 0.01 与 0.0125 都打成 0.01，出现「0.01~0.01mm」这种废话
    lines.push(`理想系統解析度=1/8~1/10  → ${trim(band / 10, 4)}~${trim(band / 8, 4)}mm`);
  } else if (station.inspectNote?.trim()) {
    // 没有公差但要写检测数量/动作说明（源报告 CCD4 那种）—— 单独成行
    lines.push(station.inspectNote.trim());
  }

  const mp = cam ? (cam.nominalMegapixels ?? cam.megapixels ?? null) : null;
  const colour = station.colorCamera === false ? "黑白" : "彩色";
  const kind = station.lensKind?.trim() || "遠心鏡頭";
  lines.push(
    `選用${mp ?? "—"}M Camera${colour}相機 + ${magnification === null ? "—" : trim(magnification, 3)}x ${kind}可符合產品需求`,
  );
  return lines;
}

/** 一页工站页的全部 token（所有工站页共用同一套 key —— 模板里只有一页工站页，克隆出来的页填各自的值） */
export function stationTokens(
  station: StationSpec,
  devices: DeviceData,
): { tokens: Record<string, string | string[]>; spec: SpecResult } {
  const spec = buildSpecLines(station, devices);
  const tokens: Record<string, string | string[]> = {
    "st.header": station.header,
    "st.spec": spec.lines,
    "st.require": buildRequireLines(station, findCamera(devices, station.cameraModel), spec.derived.mag),
    "st.mark228": String(station.marks?.mark228 ?? ""),
    "st.mark100": String(station.marks?.mark100 ?? ""),
    "st.mark80": String(station.marks?.mark80 ?? ""),
    "st.mark30_100": String(station.marks?.mark30_100 ?? ""),
  };
  return { tokens, spec };
}

/** 非工站页的 token（封面） */
export function reportTokens(model: { cover: [string, string] }): Record<string, string | string[]> {
  return { "cover.title": model.cover };
}

/**
 * 【1.檢測需求】页的 token。
 *
 * 需求页现在**只有一块可填内容**（用户 2026-09-30 定「一张图，或者手打项目名称」）：
 * 顶部这个多行文字框。图片走几何写入（`requireImageBox`），不用 token ——
 * 图片不是文本，塞进 token 机制只会把 xml.ts 的替换逻辑撑爆。
 * 空数组是合法值（= 这一页只贴图不写字），所以绝不能传 undefined/null。
 */
export function requirementTokens(req: RequirementSpec): Record<string, string | string[]> {
  return { "req.lines": (req.lines ?? []).filter((l) => String(l ?? "").trim().length > 0) };
}

/**
 * 一页影像页的 token（两个影像壳共用同一套 key）。
 *
 * 三条口径，都是照源报告定的：
 *   ① **标题条文字由调用方给**（`header`）—— 因为它随模板族不同：
 *      密封圈族写 `3.打光影像-{缺陷}`（**特殊页也用基础缺陷名**，源报告 slide8 的条子
 *      写「3.打光影像-破損」，只有页内的名称行才带「-特殊」）；
 *      四合一族写的是**工站名**（`1.硬體配置-CCD1`）。这个差异由 plan.ts 按族的
 *      `conventions.imageHeader` 决定，别在这里判族。
 *   ② 名称行 = 页面自己的 caption（用户填什么就是什么）。
 *   ③ 说明行 = desc 一行一段。空数组是合法值（= 这页不写说明），
 *      所以绝不能传 undefined/null —— 那会被当作「漏填」，把 {{img.desc}} 留在 pptx 上。
 */
export function imageTokens(page: ImagePage, header: string): Record<string, string | string[]> {
  return {
    "img.header": header,
    "img.caption": page.caption ?? "",
    "img.desc": (page.desc ?? []).filter((l) => String(l).trim().length > 0),
  };
}

/**
 * 影像页「名称/说明」框占几行 = 1（名称）+ 非空说明行数。
 * 图片区从这一块底下开始，所以行数决定可用高度 —— UI 预览与产物必须用同一个数，
 * 因此只有这一处实现（`plan.ts` 与 `generate.ts` 都调它）。
 */
export function imageCaptionLines(page: ImagePage): number {
  return 1 + (page.desc ?? []).filter((l) => String(l).trim().length > 0).length;
}

/* ------------------------------------------------------------------ *
 * 「从 03 带入」：解析 03 报告页或工站规格行的文本，抽出相机/镜头/人工覆盖值
 * ------------------------------------------------------------------ */

export type ParsedDeviceSelection = {
  cameraModel?: string;
  lensModel?: string;
  measured: {
    fps?: number;
    fovWidthMm?: number;
    resolutionMmPerPixel?: number;
    lensResolutionMmPerPixel?: number;
  };
  /** 顺手认出来的光路图工作距离，可直接填 mark228 */
  workingDistanceMm?: number;
  matched: string[];
};

/**
 * 认这一行文本里出现的设备与数值。宽容地认两种来源：
 *   · 03 FOV 工具的报告文本（`CCD：xxx` / `Lens：xxx` / `FOV：61.54 × 61.54 mm` …）
 *   · 手抄的一行（`MV-CH250-90UC + DTCM110-80H-AL`）
 * 只认「设备库里有」的型号；认不出的原样留着让人工填。
 */
export function parseDeviceSelection(text: string, devices: DeviceData): ParsedDeviceSelection {
  const measured: ParsedDeviceSelection["measured"] = {};
  const matched: string[] = [];
  const src = text.replace(/\u00a0/g, " ");

  const cam = devices.cameras.find((c) => src.includes(c.model));
  const lens = devices.lenses.find((l) => src.includes(l.model));
  if (cam) matched.push(`相机 ${cam.model}`);
  if (lens) matched.push(`镜头 ${lens.model}`);

  const label = (re: RegExp): string | null => {
    const m = re.exec(src);
    return m ? m[1].trim() : null;
  };

  const fps = label(/fps\s*=\s*([\d.]+)/i);
  if (fps !== null) { measured.fps = Number(fps); matched.push(`fps=${fps}`); }

  const fovLine = label(/(?:FOV|視野|视野)\s*[:：]\s*([^\n]+)/);
  if (fovLine) {
    const nums = [...fovLine.matchAll(/([\d.]+)/g)].map((m) => Number(m[1]));
    if (nums.length) { measured.fovWidthMm = nums[0]; matched.push(`FOV=${nums[0]}`); }
  }

  const resLine = label(/(?<!Lens )Resolution\s*[:：]\s*([\d.]+)/);
  if (resLine !== null) { measured.resolutionMmPerPixel = Number(resLine); matched.push(`Resolution=${resLine}`); }

  const lensRes = label(/Lens Resolution\s*[:：]\s*([\d.]+)/);
  if (lensRes !== null) { measured.lensResolutionMmPerPixel = Number(lensRes); matched.push(`Lens Resolution=${lensRes}`); }

  return {
    cameraModel: cam?.model,
    lensModel: lens?.model,
    workingDistanceMm: lens?.workingDistanceMm ?? undefined,
    measured,
    matched,
  };
}

let seq = 0;
/** 局部唯一 id —— 只用于 React key 与增删定位，不进产物、不做持久化，所以不必全局唯一 */
const nextId = (prefix: string): string => `${prefix}-${(seq += 1).toString(36)}-${Date.now().toString(36)}`;

/** 新工站默认模板：空壳，所有字段留空让人填，绝不代填判据性内容 */
export function emptyStation(index: number, headerPrefix = "2.硬體設定-"): StationSpec {
  const n = index + 1;
  return {
    id: nextId(`station-${index}`),
    header: `${headerPrefix}CCD${n}`,
    cameraModel: "",
    lensModel: "",
    lightSource1: "",
    lightSource2: "",
    inspectionItems: [],
    newFlags: [],
    marks: { mark228: "", mark100: "", mark80: "", mark30_100: "" },
    measured: {},
    imageGroups: [],
    // 需求推导那几行的默认值：**全部留空**（公差未知、镜头类型未知），
    // 只有「彩色」是有依据的默认（设备库没有颜色字段，彩机是常态）
    requireLead: "",
    toleranceMm: null,
    toleranceStyle: "pm",
    inspectNote: "",
    lensKind: "",
    colorCamera: true,
    requireOverride: [],
  };
}

/**
 * 【1.檢測需求】页的初始内容。
 * 用户 2026-09-30 定：需求页内容必须能填 —— 手打项目名称，或者贴一张品保发的需求表。
 * 初始**留一条空行**，让用户一眼看到这里是可填的（而不是给个空页面让人以为坏了）。
 */
export function emptyRequirement(): RequirementSpec {
  return { lines: [""], image: null };
}

/** 需求页要贴的那张图（比 ImageSlot 少 circles/box —— 它不进自动摆放系统） */
export function emptyUploadedImage(prepared: {
  name: string;
  dataUrl: string;
  pxW: number;
  pxH: number;
}): UploadedImage {
  return { id: nextId("req-img"), ...prepared };
}

/**
 * 新的缺陷分组：缺陷名留空让人填，**不预填页** ——
 * 页数取决于这个缺陷要贴几张图，只有人知道（同「不代填判据性内容」的纪律）。
 */
export function emptyImageGroup(): ImageGroup {
  return { id: nextId("group"), defect: "", pages: [] };
}

/**
 * 台账默认值：名称行按「{族前缀}{缺陷}」给一个**可改的**默认值。
 * 密封圈族的前缀是 `打光影像-`（**不带章节号**，与源报告的名称行一致；
 * 标题条那个 `3.` 前缀由 `img.header` 自己加）。特殊页再补 `-特殊`，
 * 那三个字在源报告里是红加粗，由 xml.ts 的 TOKEN_RULES 重建。
 * `station` 型族（四合一）名称行前缀为空 —— 那里标题条已经是工站名，名称行写「打光影像」即可。
 */
export function imageCaptionFor(
  defect: string,
  kind: ImagePage["kind"] = "plain",
  prefix = IMAGE_CAPTION_PREFIX,
): string {
  const base = defect.trim() ? `${prefix}${defect.trim()}` : prefix ? prefix.replace(/-$/, "") : "打光影像";
  return kind === "special" ? `${base}-特殊` : base;
}

/** 新的影像页：名称按「{族前缀}{缺陷}」给个可改的默认值，说明留空，图片区默认自动摆放 */
export function emptyImagePage(defect: string, kind: ImagePage["kind"] = "plain", prefix = IMAGE_CAPTION_PREFIX): ImagePage {
  return {
    id: nextId("img"),
    kind,
    caption: imageCaptionFor(defect, kind, prefix),
    desc: [],
    slots: [],
    autoLayout: true,
  };
}

/**
 * 一张新上传的图片。
 * `pxW/pxH` 是**降采样之后**的像素尺寸（自动摆放按它算宽高比）；
 * 读到 0 也接受 —— aspectFit 会当 1:1 处理，总比排成 0 宽强。
 */
export function emptyImageSlot(prepared: {
  name: string;
  dataUrl: string;
  pxW: number;
  pxH: number;
}): ImageSlot {
  return {
    id: nextId("slot"),
    name: prepared.name,
    dataUrl: prepared.dataUrl,
    pxW: prepared.pxW,
    pxH: prepared.pxH,
    circles: [],
  };
}
