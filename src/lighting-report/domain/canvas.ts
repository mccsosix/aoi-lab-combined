/**
 * 06 打光报告生成器 —— 画布引擎：页面坐标(pt) → OOXML shape + 图片包部件
 *
 * 为什么单独一层：影像页版式**不能靠克隆**。源报告 7 页影像页是人手摆的、没有网格 ——
 * 同为 4 图页，图落在 (48,304)(462,171)(292,174)(26,171)；5 图页又是另一组坐标；
 * 红圈也是独立 `椭圆` shape（slide5 四个 / slide9 八个），不在图片像素里。
 * 所以「图片 + 红圈」必须在生成期按坐标写出来，能复用的只有骨架（标题条 + 名称/说明框）。
 *
 * 同一层还要服务后面两处（用户 2026-09-29 定的「一个画布引擎三处复用」）：
 *   · 工站环境小图的组件式自搭（P2c）
 *   · 【1.檢測需求】页上传截图（P3a）
 * 所以这里只认「一个矩形 + 一个图片/椭圆」，不掺任何影像页专有概念。
 *
 * 坐标一律用 **pt**（页 720×540pt，4:3）。EMU 只在最后一步乘 12700。
 */

import type { Box, CircleMark, ImagePageKind, ImageSlot } from "./types.ts";

/* ------------------------------------------------------------------ *
 * 单位与页面几何
 * ------------------------------------------------------------------ */

/** 1pt = 12700 EMU（`p:sldSz cx=9144000 cy=6858000` → 720×540pt，4:3） */
export const EMU_PER_PT = 12700;
export const SLIDE_W_PT = 720;
export const SLIDE_H_PT = 540;

export const ptToEmu = (pt: number): number => Math.round(pt * EMU_PER_PT);

/* 名称/说明文本框的几何（模板实测）：top 45.13pt、正文 16pt、行距 150% → 每行 24pt */
export const CAPTION_TOP_PT = 45.13;
export const CAPTION_LINE_PT = 24;
export const CAPTION_GAP_PT = 6;

/**
 * 图片自动摆放的可用区（源报告实测范围，单位 pt）：
 *   普通页 4 图：x 25.5→699.9、y 171.3→470.6
 *   特殊页 1 图：x 122.3→448.1、y 145.3→476.8（右侧留给 ↓ 与说明标注，所以左偏且窄）
 * `hPt` 到 `IMAGE_AREA_BOTTOM_PT` 为止，下面还留页脚的位置。
 */
export const IMAGE_AREA_BOTTOM_PT = 478;
export const IMAGE_CONTENT_BOX: Record<ImagePageKind, Box> = {
  plain: { xPt: 20, yPt: 170, wPt: 680, hPt: IMAGE_AREA_BOTTOM_PT - 170 },
  special: { xPt: 90, yPt: 145, wPt: 400, hPt: IMAGE_AREA_BOTTOM_PT - 145 },
};

/** 图与图之间的空隙；小于这个值渲染出来会糊成一团 */
export const IMAGE_GAP_PT = 10;
/** 图片区低于这个高度就没法看了（说明写太多会挤到这里） */
export const MIN_IMAGE_AREA_PT = 140;
/** 单页图片数上限 —— 再多就得分页，否则每张只剩指甲盖大 */
export const MAX_IMAGES_PER_PAGE = 12;

/* ------------------------------------------------------------------ *
 * 上传图的降采样口径（浏览器侧 image-io.ts 执行，但阈值由这里定）
 * ------------------------------------------------------------------ */

/**
 * 长边上限 1600px。为什么是这个数：影像页最大的一格是特殊页单图 ≈333pt 高，
 * 按 300dpi 打印需要 ~1390px，1600 留一点余量；同时 1600px 的 JPEG(q0.82)
 * 典型 200–400KB，一页 4 张 ≈1MB，整份报告几十 MB 以内还能走微信。
 */
export const IMAGE_MAX_PX = 1600;
export const IMAGE_JPEG_QUALITY = 0.82;
/** 降采样后的单张字节上限（超过说明转码没生效，产物会失控） */
export const IMAGE_MAX_BYTES = 1_200_000;

/**
 * 一页图片的可用区 = 固定区 ∩ 「名称/说明框底下」。
 * 说明行数可变，行数一多框就长，图片区必须跟着往下让，否则说明会压在图上。
 */
export function imageContentBox(
  kind: ImagePageKind,
  captionLines = 1,
): { box: Box; warning: string | null } {
  const base = IMAGE_CONTENT_BOX[kind];
  const captionBottom = CAPTION_TOP_PT + Math.max(1, captionLines) * CAPTION_LINE_PT + CAPTION_GAP_PT;
  const bottom = base.yPt + base.hPt;
  const top = Math.min(Math.max(base.yPt, captionBottom), bottom - MIN_IMAGE_AREA_PT);
  const box: Box = { ...base, yPt: top, hPt: bottom - top };
  const warning =
    captionBottom > bottom - MIN_IMAGE_AREA_PT
      ? `说明写了 ${captionLines} 行，图片区被压到 ${Math.round(box.hPt)}pt 高（下限 ${MIN_IMAGE_AREA_PT}pt）—— 建议精简说明或改分页`
      : null;
  return { box, warning };
}

/* ------------------------------------------------------------------ *
 * 自动摆放
 * ------------------------------------------------------------------ */

/** n 张图摊成几行几列。经验规则，目的只有一个：格子尽量接近方形。 */
export function gridShape(n: number): { cols: number; rows: number } {
  const COLS = [1, 2, 3, 2, 3, 3, 3, 3, 3];
  const ROWS = [1, 1, 1, 2, 2, 2, 3, 3, 3];
  if (n <= 0) return { cols: 1, rows: 1 };
  if (n <= 9) return { cols: COLS[n - 1], rows: ROWS[n - 1] };
  return { cols: Math.ceil(n / 3), rows: 3 };
}

/** 在 box 里按宽高比等比缩放到最大并居中（contain） */
export function aspectFit(box: Box, ratioWH: number): Box {
  const ratio = Number.isFinite(ratioWH) && ratioWH > 0 ? ratioWH : 1;
  let w = box.wPt;
  let h = w / ratio;
  if (h > box.hPt) {
    h = box.hPt;
    w = h * ratio;
  }
  return {
    xPt: box.xPt + (box.wPt - w) / 2,
    yPt: box.yPt + (box.hPt - h) / 2,
    wPt: w,
    hPt: h,
  };
}

/**
 * 自动摆放：把 n 张图按行列铺进 box，每格内等比缩放居中。
 * 尺寸未知（pxW/pxH 没读到）的图按 1:1 处理 —— 宁可方形，也别排成 0 宽。
 */
export function autoLayoutImages(sizes: Array<{ pxW: number; pxH: number }>, box: Box, gapPt = IMAGE_GAP_PT): Box[] {
  const n = sizes.length;
  if (!n) return [];
  const { cols, rows } = gridShape(n);
  const cellW = (box.wPt - gapPt * (cols - 1)) / cols;
  const cellH = (box.hPt - gapPt * (rows - 1)) / rows;
  return sizes.map((s, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const cell: Box = {
      xPt: box.xPt + c * (cellW + gapPt),
      yPt: box.yPt + r * (cellH + gapPt),
      wPt: cellW,
      hPt: cellH,
    };
    return aspectFit(cell, s.pxW / s.pxH);
  });
}

/**
 * 一页里每张图的**实际**位置：
 * · 自动模式（`page.autoLayout !== false`）→ 全部由 autoLayoutImages 算；
 * · 手动模式 → 拖过的图用它自己的 `box`，没拖过的回落到自动位（新加进来的图就落回格子里）。
 * 把「手动兜底到自动」写在这里，是为了让「界面预览」与「产物」永远同一套坐标 ——
 * 两处各算一次是这类工具最容易漂的地方。
 */
export function resolveSlotBoxes(
  slots: ImageSlot[],
  kind: ImagePageKind,
  captionLines: number,
  autoLayout: boolean,
): { boxes: Box[]; autoBoxes: Box[]; box: Box; warning: string | null } {
  const { box, warning } = imageContentBox(kind, captionLines);
  const autoBoxes = autoLayoutImages(slots, box);
  const boxes = slots.map((s, i) => (autoLayout || !s.box ? autoBoxes[i] : s.box));
  return { boxes, autoBoxes, box, warning };
}

/** 红圈（相对图片的归一化框）→ 页面绝对矩形 */
export function circleBox(slotBox: Box, mark: Pick<CircleMark, "x" | "y" | "w" | "h">): Box {
  return {
    xPt: slotBox.xPt + mark.x * slotBox.wPt,
    yPt: slotBox.yPt + mark.y * slotBox.hPt,
    wPt: mark.w * slotBox.wPt,
    hPt: mark.h * slotBox.hPt,
  };
}

/* ------------------------------------------------------------------ *
 * shape XML
 * ------------------------------------------------------------------ */

const n0 = (v: number): string => String(Math.round(v));

/** `<p:pic>` —— 图片本体。attrs 与源报告一致（blipFill + stretch + rect geom），不多不少 */
export function picXml(o: { id: number | string; rId: string; box: Box; name?: string; descr?: string }): string {
  const descr = o.descr ? ` descr="${attr(o.descr)}"` : "";
  return (
    `<p:pic><p:nvPicPr>` +
    `<p:cNvPr id="${o.id}" name="${attr(o.name ?? `图片 ${o.id}`)}"${descr}/>` +
    `<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/>` +
    `</p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="${o.rId}"/><a:srcRect/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr>${xfrm(o.box)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
    `</p:pic>`
  );
}

/** 源报告红圈实测描边 ≈ 1.0pt（600dpi 渲染量得 8–9px @8.33px/pt），所以显式写 12700 而不是靠主题 lnRef */
export const CIRCLE_LINE_PT = 1;
export const CIRCLE_COLOR = "FF0000";

/** `<p:sp>` 椭圆 —— 红圈。`a:noFill` + 红描边，与源报告同构 */
export function ellipseXml(o: { id: number | string; box: Box; lineWidthPt?: number; color?: string; name?: string }): string {
  const w = ptToEmu(o.lineWidthPt ?? CIRCLE_LINE_PT);
  return (
    `<p:sp><p:nvSpPr>` +
    `<p:cNvPr id="${o.id}" name="${attr(o.name ?? `椭圆 ${o.id}`)}"/>` +
    `<p:cNvSpPr/><p:nvPr/>` +
    `</p:nvSpPr>` +
    `<p:spPr>${xfrm(o.box)}<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom><a:noFill/>` +
    `<a:ln w="${w}"><a:solidFill><a:srgbClr val="${o.color ?? CIRCLE_COLOR}"/></a:solidFill></a:ln>` +
    `</p:spPr>` +
    `<p:txBody><a:bodyPr rtlCol="0" anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="ctr"/>` +
    `<a:endParaRPr lang="zh-CN" altLang="en-US"/></a:p></p:txBody>` +
    `</p:sp>`
  );
}

function xfrm(box: Box): string {
  return (
    `<a:xfrm><a:off x="${n0(ptToEmu(box.xPt))}" y="${n0(ptToEmu(box.yPt))}"/>` +
    `<a:ext cx="${n0(ptToEmu(box.wPt))}" cy="${n0(ptToEmu(box.hPt))}"/></a:xfrm>`
  );
}

const attr = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * 把新 shape 挂到 `p:spTree` 末尾（= 画在最上层，红圈才会压在图片上）。
 * 模板的 spTree 尾部没有 `p:extLst`（已核对），所以直接插在最后一个 `</p:spTree>` 前即可。
 */
export function insertShapes(slideXml: string, shapes: string[]): string {
  if (!shapes.length) return slideXml;
  const at = slideXml.lastIndexOf("</p:spTree>");
  if (at < 0) throw new Error("这一页没有 p:spTree，不能挂 shape");
  return slideXml.slice(0, at) + shapes.join("") + slideXml.slice(at);
}

/** 页内已有 shape 的最大 id —— 新 shape 从它 +1 起发号（同页内唯一即可） */
export function maxShapeId(slideXml: string): number {
  let max = 0;
  for (const m of slideXml.matchAll(/<p:cNvPr[^>]*?\sid="(\d+)"/g)) max = Math.max(max, Number(m[1]));
  return max;
}

/* ------------------------------------------------------------------ *
 * 图片包部件：media / rels / Content_Types
 * ------------------------------------------------------------------ */

const R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
export const REL_TYPE_IMAGE = `${R_NS}/image`;

export type PreparedMedia = {
  /** 包内部件名，如 ppt/media/image10.jpeg */
  part: string;
  bytes: Uint8Array;
  /** 相对于 `ppt/slides/` 的 target，如 ../media/image10.jpeg */
  target: string;
  /** 小写扩展名（决定 Content_Types 用哪个 Default） */
  ext: string;
};

/** dataURL → 字节。浏览器与 Node 都有 atob，所以 domain 不需要 Buffer / FileReader */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("图片数据不是 dataURL");
  const head = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  const bin = head.includes(";base64") ? atob(body) : decodeURIComponent(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** dataURL 的 MIME → 扩展名。只认 png / jpeg；其它一律当 jpeg（上传前已转码） */
export function extFromDataUrl(dataUrl: string): string {
  const m = /^data:image\/([a-z0-9.+-]+)/i.exec(dataUrl);
  const kind = (m?.[1] ?? "jpeg").toLowerCase();
  if (kind === "png") return "png";
  return "jpeg";
}

/**
 * 挑一个包内没被占用的 media 名 —— 与 slide 编号一样**优先复用空号**，
 * 这样产物看上去跟手工文件一样自然，而不是凭空冒出 image100。
 *
 * ⚠️ 判重按**基名**（`imageN`）而不是「基名 + 扩展名」：模板工站页的光路图带着
 * `image1.wmf`，若只看全名就会挑出 `image1.jpeg`，同一个基名两种后缀 ——
 * 虽然 OOXML 允许（是两个不同 part），但按基名索引的工具与人也容易被绕晕。
 */
export function pickFreeMediaName(existing: Iterable<string>, ext: string): string {
  const taken = new Set<string>();
  for (const part of existing) {
    const m = /^ppt\/media\/image(\d+)\.[^./]+$/.exec(part);
    if (m) taken.add(m[1]);
  }
  let n = 1;
  while (taken.has(String(n))) n += 1;
  return `ppt/media/image${n}.${ext}`;
}

/** `ppt/media/image1.jpeg` → `../media/image1.jpeg`（slide 的 rels 是相对 `ppt/slides/` 写的） */
export const mediaTarget = (part: string): string => `../${part.replace(/^ppt\//, "")}`;

/** 部件名 → rels 名：`ppt/slides/slide7.xml` → `ppt/slides/_rels/slide7.xml.rels` */
export function relsNameOfPart(part: string): string {
  const slash = part.lastIndexOf("/");
  return `${part.slice(0, slash)}/_rels/${part.slice(slash + 1)}.rels`;
}

/** 下一个可用的 rId（同部件内唯一） */
export function nextRelationshipId(relsXml: string): string {
  const nums = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]));
  return `rId${(nums.length ? Math.max(...nums) : 0) + 1}`;
}

/** 往 rels 里追加一条关系；relsXml 为空时给一份最小骨架（克隆页可能没有自己的 rels） */
export function appendRelationship(relsXml: string | null, id: string, type: string, target: string): string {
  const entry = `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`;
  if (!relsXml || !/<Relationships\b/.test(relsXml)) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${entry}</Relationships>`;
  }
  return relsXml.replace(/<\/Relationships>\s*$/, `${entry}</Relationships>`);
}

/** 保证 Content_Types 里有这个扩展名的 Default（模板现有 jpeg/png，但生成器不该依赖这点） */
export function ensureContentTypeDefault(ct: string, ext: string, mime: string): string {
  if (new RegExp(`<Default Extension="${escapeRe(ext)}"`, "i").test(ct)) return ct;
  return ct.replace(/<\/Types>\s*$/, `<Default Extension="${ext}" ContentType="${mime}"/></Types>`);
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* ------------------------------------------------------------------ *
 * 数据模型侧的小工厂（UI 与样张共用；放这里免得 spec.ts 再依赖 canvas 常量）
 * ------------------------------------------------------------------ */

let seq = 0;
const nextId = (prefix: string): string => `${prefix}_${(++seq).toString(36)}${Date.now().toString(36).slice(-4)}`;

export function emptyCircleMark(x = 0.35, y = 0.35, w = 0.3, h = 0.3): CircleMark {
  return { id: nextId("cir"), x, y, w, h };
}

/** 框选（拖拽画圈）的起止两点 → 归一化正矩形；过小的拖拽视作误触返回 null */
export function circleFromDrag(
  a: { x: number; y: number },
  b: { x: number; y: number },
  minSize = 0.04,
): Omit<CircleMark, "id"> | null {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(a.x - b.x);
  const h = Math.abs(a.y - b.y);
  if (w < minSize || h < minSize) return null;
  return { x, y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) };
}

export function clampBoxToPage(box: Box, wPt: number, hPt: number): Box {
  return {
    xPt: Math.min(Math.max(0, box.xPt), SLIDE_W_PT - wPt),
    yPt: Math.min(Math.max(0, box.yPt), SLIDE_H_PT - hPt),
    wPt,
    hPt,
  };
}
