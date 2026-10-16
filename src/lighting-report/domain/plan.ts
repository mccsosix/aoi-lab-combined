/**
 * 06 打光报告生成器 —— 页序规划
 *
 * 产物页序（用户 2026-09-29 定稿，**不是**「所有工站页在前、影像页统一在后」）：
 *
 *   封面 → 1.檢測需求 → [ 工站1 → 工站1的影像… ] → [ 工站2 → 工站2的影像… ] → 4.結論
 *
 * 也就是说每个工站和它自己的打光影像段紧邻，影像段内再按「缺陷分组」排。
 * 这个顺序是**算出来的**，不是靠插页时的下标凑的 —— 所以工站增删、缺陷分组增删、
 * 单页增删都只是改这个数组，页序不会错乱（这正是 P2a 要解决的核心问题）。
 *
 * 每一页只声明三件事：**用哪个壳当原型**、**填哪些 token**、**标签**。
 * 「壳 → 具体 part 名」的分派（第一次用占本体、之后克隆、没人用的壳删掉）
 * 是 generate.ts 的事 —— 这里保持纯函数，便于门禁单独断言页序。
 */
import {
  MAX_IMAGES_PER_PAGE,
  SLIDE_H_PT,
  SLIDE_W_PT,
  imageContentBox,
  resolveSlotBoxes,
} from "./canvas.ts";
import { imageCaptionLines, imageTokens, reportTokens, requirementTokens, stationTokens } from "./spec.ts";
import {
  IMAGE_SECTION_PREFIX,
  SEALING_FAMILY,
  type TemplateFamily,
  type TemplateLayout,
} from "./template-layout.ts";
import type { Box, DeviceData, ImagePage, ImageSlot, ReportModel, UploadedImage } from "./types.ts";
import type { TokenValues } from "./xml.ts";

export type PlannedPage = {
  /** 模板里用来当原型的壳（part 名） */
  shell: string;
  /** 这一页要填的 token */
  tokens: TokenValues;
  /** 门禁与排障用的可读标签 */
  label: string;
  /** 属于第几个工站（0 基）；封面 / 需求 / 结论为 null */
  stationIndex: number | null;
  /** 这一页自己发出的告警（如库外镜头） */
  warnings: string[];
  /** 影像页才有：本页要贴的图片（骨架页为空数组） */
  images?: ImageSlot[];
  /** 影像页才有：决定用哪种骨架、以及自动摆放的可用区 */
  imageKind?: ImagePage["kind"];
  /** 影像页才有：是否仍在自动摆放（false = 用各 slot.box） */
  autoLayout?: boolean;
  /** 影像页才有：名称/说明框占几行（1 + 非空说明行数）—— 图片区从这一块底下开始 */
  captionLines?: number;
  /** 需求页才有：要贴的那张图（品保发的需求表 / 产品照片）；等比适配到 requireImageBox */
  requireImage?: UploadedImage | null;
  /** 需求页才有：图片内容区（来自族的约定，生成期照它适配） */
  requireImageBox?: Box;
};

export function planPages(
  model: ReportModel,
  devices: DeviceData,
  family: TemplateFamily = SEALING_FAMILY,
): PlannedPage[] {
  const layout: TemplateLayout = family.layout;
  const conv = family.conventions;
  const pages: PlannedPage[] = [];

  const fixed = (shell: string, label: string): PlannedPage => ({
    shell,
    tokens: {},
    label,
    stationIndex: null,
    warnings: [],
  });

  pages.push({ shell: layout.cover, tokens: reportTokens(model), label: "封面", stationIndex: null, warnings: [] });

  /* 【1.檢測需求】页：内容可以「只贴图不写字」，但**不能两样都空** ——
     那样出来的是一页只有标题条的白页，跟「这一节漏了」没区别。
     告警放在这里（而不是 UI 的校验里）是为了让命令行生成、门禁、界面走同一条判据。 */
  const reqLines = (model.requirement?.lines ?? []).filter((l) => String(l ?? "").trim().length > 0);
  const reqWarnings: string[] = [];
  if (!reqLines.length && !model.requirement?.image) {
    reqWarnings.push(`[${conv.requirementHeader}] 这一页还空着 —— 只会有标题条；填一行文字，或贴一张需求表图`);
  }
  pages.push({
    ...fixed(layout.requirement, conv.requirementHeader),
    tokens: requirementTokens(model.requirement ?? { lines: [] }),
    requireImage: model.requirement?.image ?? null,
    requireImageBox: conv.requireImageBox,
    warnings: reqWarnings,
  });

  (model.stations ?? []).forEach((station, k) => {
    const { tokens, spec } = stationTokens(station, devices);
    pages.push({
      shell: layout.station,
      tokens,
      label: `工站${k + 1}【${station.header || "未填標題"}】`,
      stationIndex: k,
      warnings: spec.warnings,
    });

    for (const group of station.imageGroups ?? []) {
      /* 标题条文字随族不同：密封圈族是章节名 `3.打光影像-{缺陷}`，
         四合一族是**工站名**（它的影像页标题条写 `1.硬體配置-CCD1`）。 */
      const header =
        conv.imageHeader === "station" ? station.header : `${IMAGE_SECTION_PREFIX}${group.defect ?? ""}`;
      (group.pages ?? []).forEach((page, j) => {
        const label = `工站${k + 1} 影像·${group.defect || "未填缺陷"} 第 ${j + 1} 页（${page.kind === "special" ? "特殊" : "普通"}）`;
        const slots = page.slots ?? [];
        const captionLines = imageCaptionLines(page);
        pages.push({
          shell: page.kind === "special" ? layout.imageSpecial : layout.imagePlain,
          tokens: imageTokens(page, header),
          label,
          stationIndex: k,
          warnings: imageWarnings(page, label, captionLines),
          images: slots,
          imageKind: page.kind,
          autoLayout: page.autoLayout !== false,
          captionLines,
        });
      });
    }
  });

  /* 結論页按族决定 —— 实测四合一那份**根本没有結論页**（12 页全是
     封面 + 需求 + 4 个工站 + 6 页影像），硬加一页是凭空造内容。 */
  if (conv.hasConclusion) pages.push(fixed(layout.conclusion, "4.結論"));
  return pages;
}

/**
 * 影像页在**规划期**就能发现的坑（生成期只处理「已经摆好之后」的溢出）。
 * 放在这里而不是 generate.ts，是因为 UI 也需要同一条告警 —— 用户应当在点生成之前就看见。
 */
function imageWarnings(page: ImagePage, label: string, captionLines: number): string[] {
  const out: string[] = [];
  const slots = page.slots ?? [];
  const lines = captionLines;

  if (slots.length === 0) {
    out.push(`[${label}] 这一页还没有图片 —— 会出一页只有标题与说明的空白影像页`);
  }
  if (slots.length > MAX_IMAGES_PER_PAGE) {
    out.push(`[${label}] 放了 ${slots.length} 张图，超过单页上限 ${MAX_IMAGES_PER_PAGE} 张 —— 建议拆成两页`);
  }
  const { warning } = imageContentBox(page.kind, lines);
  if (warning) out.push(`[${label}] ${warning}`);

  /* ⚠️ 这里**刻意不查**「pxW 超没超 IMAGE_MAX_PX」：
     pxW 是 UI 在上传时降采样后自己填的声明值，domain 没法核实。
     真正的兜底在 generate.ts —— 它量的是写进包里的**字节数**（可核实）。
     现场真出问题时（比如用户从旧存档里带进来没降采样的图），字节那条会先响。 */

  /* 手动摆放的图如果被拖出页外，生成出来是看不见的 —— 这是最容易「生成了但少了图」的坑 */
  if (page.autoLayout === false) {
    const { boxes } = resolveSlotBoxes(slots, page.kind, lines, false);
    boxes.forEach((b, i) => {
      if (b.xPt < 0 || b.yPt < 0 || b.xPt + b.wPt > SLIDE_W_PT + 0.5 || b.yPt + b.hPt > SLIDE_H_PT + 0.5) {
        out.push(`[${label}] 第 ${i + 1} 张图有一部分在页面外，导出后会被裁掉`);
      }
    });
  }
  return out;
}

/** 页数摘要，给 UI 的状态条用（与 planPages 同源，避免界面和产物对不上） */
export function pageStats(
  pages: PlannedPage[],
  family: TemplateFamily = SEALING_FAMILY,
): {
  total: number;
  stations: number;
  images: number;
  requirementImages: number;
  perStation: number[];
} {
  const layout = family.layout;
  const isImage = (p: PlannedPage): boolean =>
    p.shell === layout.imagePlain || p.shell === layout.imageSpecial;
  const perStation: number[] = [];
  for (const p of pages) {
    if (p.stationIndex === null) continue;
    perStation[p.stationIndex] = (perStation[p.stationIndex] ?? 0) + 1;
  }
  return {
    total: pages.length,
    stations: pages.filter((p) => p.shell === layout.station).length,
    images: pages.filter(isImage).length,
    requirementImages: pages.filter((p) => p.requireImage).length,
    perStation,
  };
}
