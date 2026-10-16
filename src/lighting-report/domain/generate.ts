/**
 * 06 打光报告生成器 —— 生成端（浏览器 / Node 同一份代码）
 *
 * 模型：模板 = 一组**壳**（每种页面一份原型），产物 = 壳的一次性拼装。
 *
 *   ① 算页序        plan.ts  → [封面, 需求, 工站1, 工站1影像…, 工站2, …, 結論]
 *   ② 删掉用不到的壳  —— 先删，让后面克隆能复用它们空出来的 part 序号
 *   ③ 逐页分配 part   —— 某个壳的**第一次**使用占壳本体，之后每次克隆一份
 *   ④ 填 token        —— 每页只填自己的 token（不再全页乱扫）
 *   ⑤ 重排 sldIdLst   —— 一次性重写成 ②③ 算出来的顺序（页序的唯一权威）
 *   ⑥ 提交包级部件    —— Content_Types / presentation.rels / app.xml 计数
 *
 * 为什么要有 ②③⑤ 这套「壳 + 计划」而不是「就着模板插页」：
 *   影像页必须跟着它所属的工站走，而工站和影像段都能增删。
 *   靠「在下标 i 插一页」维持顺序，每插一次后面全部要挪，一旦算错就会出现
 *   「影像页跑到工站页前面」——这种错在 PPT 里只能靠人肉翻页发现。
 *   改成「先算最终页序再整体重写 sldIdLst」，顺序就是那个数组本身，没有增量状态。
 *
 * 页脚页码不用管：模板的 `Page:N` 来自 layout 里的 `sldNum` **域**（2026-09-29 实测，
 * 早期方案文档写的「静态文本」是错的）。域跟着 sldIdLst 位置走，重排后自动就是对的。
 * 但这也是**克隆页必须带上 slideLayout 关系**的原因 —— 关系一丢，母版就没了，页码域跟着消失。
 *
 * 之所以不是「按 shape 名字改原 pptx 的文字」：源文件 shape 名重复且简繁混杂
 * （同一页 4 个 `文本框 43`、多个 `图片 8`），按名字定位必然改错地方 → 只能重建模板。
 *
 * P2b 追加的第四件事：**影像页贴图**。
 *   图片不能靠克隆（源报告是人手摆的），所以按坐标写 `<p:pic>`；
 *   红圈是独立 `<p:sp>` 椭圆，写在同一页的 shape 树末尾（= 压在图上）；
 *   图片字节先落成 `ppt/media/imageN.{jpeg,png}`，再在本页 rels 里挂一条 image 关系。
 *   三件事缺一件，WPS 打开就是一张空白页 —— 门禁 J 段逐条盯着。
 */
import JSZip from "jszip";
import {
  appendRelationship,
  aspectFit,
  circleBox,
  dataUrlToBytes,
  ellipseXml,
  ensureContentTypeDefault,
  extFromDataUrl,
  insertShapes,
  maxShapeId,
  mediaTarget,
  nextRelationshipId,
  pickFreeMediaName,
  picXml,
  relsNameOfPart,
  resolveSlotBoxes,
  IMAGE_MAX_BYTES,
  REL_TYPE_IMAGE,
  type PreparedMedia,
} from "./canvas.ts";
import {
  REQUIRE_BOX,
  SPEC_BOX,
  estimateTitleBarWidthPt,
  findShapeIdByToken,
  imageCaptionBox,
  imageDescBox,
  overflowingLines,
  setShapeWidthPt,
  type ImageShellKind,
} from "./layout.ts";
import { planPages, type PlannedPage } from "./plan.ts";
import { SlideSurgery, parseSlideIndex, slideRelsName, type PackageParts } from "./surgery.ts";
import { getFamily, type TemplateFamily, type TemplateLayout } from "./template-layout.ts";
import type { DeviceData, GenerateOptions, GenerateResult, ImageSlot, ReportModel } from "./types.ts";
import { fillPart, scanTokens } from "./xml.ts";

const SLIDE_PART_RE = /^ppt\/slides\/slide\d+\.xml$/;

export type GenerateInput = Uint8Array | ArrayBuffer | string;

export async function generateReport(
  template: GenerateInput,
  model: ReportModel,
  devices: DeviceData,
  options: GenerateOptions & { compressionLevel?: number } = {},
): Promise<GenerateResult> {
  if (!(model.stations ?? []).length) throw new Error("至少需要 1 个工站");

  /* 模板族：`model.templateId` 选族；`options.layout` 只给门禁做负向实验用 */
  const base = getFamily(model.templateId);
  const family: TemplateFamily = options.layout
    ? { ...base, layout: options.layout as TemplateFamily["layout"] }
    : base;
  const layout = family.layout;
  const level = options.compressionLevel ?? 6;

  const zip = await JSZip.loadAsync(template as never);
  const templateSlides = Object.keys(zip.files).filter((n) => SLIDE_PART_RE.test(n));

  /* ---- ① 页序 ---- */
  const pages = planPages(model, devices, family);
  const wantedShells = [...new Set(pages.map((p) => p.shell))];
  for (const shell of wantedShells) {
    if (!templateSlides.includes(shell)) throw new Error(`模板里找不到壳 ${shell}（模板是不是忘了重新构建？）`);
  }
  /* ---- 包级手术：一次性读出 presentation 级部件，最后统一写回 ---- */
  const parts: PackageParts = {
    presentation: await mustText(zip, "ppt/presentation.xml"),
    presentationRels: await mustText(zip, "ppt/_rels/presentation.xml.rels"),
    contentTypes: await mustText(zip, "[Content_Types].xml"),
    app: (await zip.file("docProps/app.xml")?.async("text")) ?? null,
  };
  const surgery = new SlideSurgery(parts, templateSlides.map(parseSlideIndex).filter((n): n is number => n !== null));

  const used = new Set<string>();
  const missing = new Set<string>();
  const warnings: string[] = [];
  const onMissing = (key: string) => { if (!used.has(key)) missing.add(key); };

  /* 规划期已经算出的告警（空图页 / 图超量 / 图片区被说明压扁 / 手拖出页外）必须往外带 ——
     这些是「生成了但结果不对」的主要来源，只留在 planPages 的返回值里等于白算。 */
  for (const page of pages) warnings.push(...page.warnings);

  /* ---- ② 删掉这次用不到的壳（先删 → 克隆能复用空出来的序号） ---- */
  const droppedShells = family.shells.filter((s) => templateSlides.includes(s) && !wantedShells.includes(s));
  if (droppedShells.length) {
    surgery.removeSlides(droppedShells);
    for (const part of droppedShells) {
      zip.remove(part);
      const n = parseSlideIndex(part);
      if (n !== null) zip.remove(slideRelsName(n));
    }
  }

  /* ---- ③ 预读壳本体（克隆必须以**未填充**的壳为原型，否则会带上上一页的内容） ---- */
  const shellXml = new Map<string, string>();
  const shellRels = new Map<string, string | null>();
  for (const shell of wantedShells) {
    shellXml.set(shell, await mustText(zip, shell));
    const n = parseSlideIndex(shell);
    const rels = n === null ? null : ((await zip.file(slideRelsName(n))?.async("text")) ?? null);
    // 克隆页只会得到壳的 rels —— 壳若没有 rels，克隆页就丢了 slideLayout 关系，
    // 母版（含页脚 Page:N 域）会一起消失。宁可在这里炸掉，也不要出一份「页码没了」的产物。
    if (rels === null) throw new Error(`模板的壳 ${shell} 没有 rels（slideLayout 关系会丢）—— 模板是不是被手改过？`);
    shellRels.set(shell, rels);
  }

  /* ---- ③b 媒体登记表：同一张图跨页复用只写一份 media part ---- */
  const registry: MediaRegistry = {
    byDataUrl: new Map(),
    all: [],
    usedNames: new Set(Object.keys(zip.files)),
  };

  /* ---- ④ 逐页分配 part + 填充 + 贴图 ---- */
  const boundShells = new Set<string>();
  const partOfPage: string[] = [];
  const stationParts: string[] = [];
  const imageParts: string[] = [];
  const pageRels = new Map<string, string>(); // rels 部件名 → 内容（骨架页 / 克隆页 / 贴了图的页统一在这里写）

  pages.forEach((page: PlannedPage, i: number) => {
    let part: string;
    if (!boundShells.has(page.shell)) {
      boundShells.add(page.shell);
      part = page.shell;
    } else {
      // 克隆：新增 part + rels + Content_Types + presentation.rels + sldIdLst 条目（六件事）
      const added = surgery.addSlide(i);
      part = added.part;
    }
    partOfPage.push(part);

    let xml = renderPage({
      shellXml: shellXml.get(page.shell)!,
      page,
      pageIndex: i,
      layout,
      warnings,
      options,
      onMissing,
      used,
    });

    let rels: string | null = shellRels.get(page.shell) ?? null;
    if ((page.images?.length ?? 0) > 0 && page.imageKind) {
      const built = attachImages({
        slideXml: xml,
        slots: page.images!,
        kind: page.imageKind,
        autoLayout: page.autoLayout !== false,
        captionLines: page.captionLines ?? 1,
        rels,
        registry,
        warnings,
        label: page.label,
      });
      xml = built.xml;
      rels = built.rels;
    }

    /* 需求页的图：只有一张，等比适配到内容区**居中、不裁切** ——
       需求表被裁掉一角比四周留白糟得多，看图的人会以为表就长这样。 */
    if (page.requireImage?.dataUrl && page.requireImageBox) {
      const built = attachRequirementImage({
        slideXml: xml,
        image: page.requireImage,
        area: page.requireImageBox,
        rels,
        registry,
        warnings,
        label: page.label,
      });
      xml = built.xml;
      rels = built.rels;
    }

    zip.file(part, xml);
    // 骨架页的 rels 也写回去：内容没变时是无害覆盖，变了（贴图）才必须写
    if (rels !== null) pageRels.set(relsNameOfPart(part), rels);

    if (page.shell === layout.station) stationParts.push(part);
    if (page.shell === layout.imagePlain || page.shell === layout.imageSpecial) imageParts.push(part);
  });
  for (const [relsPart, relsXml] of pageRels) zip.file(relsPart, relsXml);
  for (const media of registry.all) zip.file(media.part, media.bytes);

  /* ---- ⑤ 页序 = 那个数组本身 ---- */
  surgery.setSlideOrder(partOfPage);
  if (surgery.pages !== partOfPage.length) {
    throw new Error(`页序重排后页数不一致（${surgery.pages} ≠ ${partOfPage.length}）`);
  }

  /* ---- ⑥ 写回 presentation 级部件 ---- */
  const committed = surgery.commit();
  // 落了图片就要保证 Content_Types 认得这些扩展名（模板现有 jpeg/png，但别依赖这点 ——
  // 模板哪天换成只有 wmf 的版本，产物就会在 WPS 里报「部件类型未知」）
  let contentTypes = committed.contentTypes;
  for (const ext of new Set(registry.all.map((m) => m.ext))) {
    contentTypes = ensureContentTypeDefault(contentTypes, ext, ext === "png" ? "image/png" : "image/jpeg");
  }
  zip.file("ppt/presentation.xml", committed.presentation);
  zip.file("ppt/_rels/presentation.xml.rels", committed.presentationRels);
  zip.file("[Content_Types].xml", contentTypes);
  if (committed.app !== null) zip.file("docProps/app.xml", committed.app);

  /* ---- 漏填对账：填完后仍留在任何一页里的 token 就是没填上的 ---- */
  for (const name of Object.keys(zip.files).filter((n) => SLIDE_PART_RE.test(n))) {
    for (const t of scanTokens(await zip.file(name)!.async("text"))) missing.add(t);
  }

  const out = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level },
  });

  return {
    bytes: out,
    templateId: family.id,
    used: [...used],
    missing: [...missing].sort(),
    pages: surgery.pages,
    stationParts,
    imageParts,
    mediaParts: registry.all.map((m) => m.part),
    pageOrder: partOfPage,
    droppedShells,
    warnings,
  };
}

/* ------------------------------------------------------------------ *
 * 影像页贴图：图片 + 红圈 → shape XML + 本页 rels + 包内 media 部件
 * ------------------------------------------------------------------ */

type MediaRegistry = {
  /** dataURL → 已登记的包内部件（同一张图在多页重复出现时不重复写字节） */
  byDataUrl: Map<string, PreparedMedia>;
  all: PreparedMedia[];
  /** 已被占用的部件名（含模板原有的），用来挑空号 */
  usedNames: Set<string>;
};

/**
 * 把一个 dataURL 落成包内 media 部件（**同一张图只写一份**），并返回它 + 一条挂好的关系。
 * 影像页与需求页共用 —— 两处各写一遍必然漂（其中一处忘了 Content_Types / 忘了去重都很常见）。
 */
function useMedia(
  registry: MediaRegistry,
  dataUrl: string,
  rels: string | null,
  warnings: string[],
  label: string,
  slotIndex: number,
): { media: PreparedMedia; rId: string; rels: string } {
  let media = registry.byDataUrl.get(dataUrl);
  if (!media) {
    const ext = extFromDataUrl(dataUrl);
    const part = pickFreeMediaName(registry.usedNames, ext);
    registry.usedNames.add(part);
    const bytes = dataUrlToBytes(dataUrl);
    if (bytes.length > IMAGE_MAX_BYTES) {
      warnings.push(
        `[${label}] 第 ${slotIndex + 1} 张图 ${Math.round(bytes.length / 1024)}KB，超过单张上限 ${Math.round(IMAGE_MAX_BYTES / 1024)}KB —— 建议先压一下再上传`,
      );
    }
    media = { part, bytes, target: mediaTarget(part), ext };
    registry.byDataUrl.set(dataUrl, media);
    registry.all.push(media);
  }
  const rId = nextRelationshipId(rels ?? "");
  return { media, rId, rels: appendRelationship(rels, rId, REL_TYPE_IMAGE, media.target) };
}

/**
 * 把一页影像的图片贴进 slide XML，并返回补好 image 关系的 rels。
 *
 * 顺序有讲究：**先所有图片、后所有红圈**（与源报告 slide5 的 spTree 顺序一致），
 * 红圈在原报告里就画在图片之上；若颠倒，圈会被图盖住 —— 这是肉眼很难发现、
 * 但导出后一定不对的一类错。
 */
function attachImages({
  slideXml,
  slots,
  kind,
  autoLayout,
  captionLines,
  rels,
  registry,
  warnings,
  label,
}: {
  slideXml: string;
  slots: ImageSlot[];
  kind: NonNullable<PlannedPage["imageKind"]>;
  autoLayout: boolean;
  captionLines: number;
  rels: string | null;
  registry: MediaRegistry;
  warnings: string[];
  label: string;
}): { xml: string; rels: string } {
  const { boxes } = resolveSlotBoxes(slots, kind, captionLines, autoLayout);
  let id = maxShapeId(slideXml);
  let nextRels = rels;
  const shapes: string[] = [];

  slots.forEach((slot, i) => {
    const used = useMedia(registry, slot.dataUrl, nextRels, warnings, label, i);
    nextRels = used.rels;
    id += 1;
    shapes.push(picXml({ id, rId: used.rId, box: boxes[i], name: `图片 ${id}`, descr: slot.name }));
  });

  slots.forEach((slot, i) => {
    for (const mark of slot.circles ?? []) {
      id += 1;
      shapes.push(ellipseXml({ id, box: circleBox(boxes[i], mark), name: `椭圆 ${id}` }));
    }
  });

  return { xml: insertShapes(slideXml, shapes), rels: nextRels ?? "" };
}

/**
 * 需求页贴图：一张，等比适配到 `area` 居中。
 * 需求页没有红圈、没有自动摆放，所以不走 attachImages —— 硬套会让"一张图"
 * 也要经过网格计算，反而多一处可能算错的地方。
 */
function attachRequirementImage({
  slideXml,
  image,
  area,
  rels,
  registry,
  warnings,
  label,
}: {
  slideXml: string;
  image: { dataUrl: string; pxW: number; pxH: number; name: string };
  area: { xPt: number; yPt: number; wPt: number; hPt: number };
  rels: string | null;
  registry: MediaRegistry;
  warnings: string[];
  label: string;
}): { xml: string; rels: string } {
  const used = useMedia(registry, image.dataUrl, rels, warnings, label, 0);
  const id = maxShapeId(slideXml) + 1;
  const box = aspectFit(area, (image.pxW || 1) / (image.pxH || 1));
  const shape = picXml({ id, rId: used.rId, box, name: `图片 ${id}`, descr: image.name || "需求表" });
  return { xml: insertShapes(slideXml, [shape]), rels: used.rels };
}

/* ------------------------------------------------------------------ *
 * 单页渲染：填 token + 需要时调标题条宽度 + 溢出预警
 * ------------------------------------------------------------------ */
function renderPage({
  shellXml,
  page,
  pageIndex,
  layout,
  warnings,
  options,
  onMissing,
  used,
}: {
  shellXml: string;
  page: PlannedPage;
  pageIndex: number;
  layout: TemplateLayout;
  warnings: string[];
  options: GenerateOptions & { compressionLevel?: number };
  onMissing: (key: string) => void;
  used: Set<string>;
}): string {
  const filled = fillPart(shellXml, page.tokens, { ...options, onMissing });
  filled.used.forEach((k) => used.add(k));
  let xml = filled.xml;

  /* 标题条（工站页与影像页同款 shape）宽度是**人工拖的**，没有公式：
     源报告 slide3 201.2pt / slide4 382.0pt / 影像页 201.2pt。
     克隆出来的页只有壳本体的宽度，标题一长就「蓝条截断、红字掉到白底上」，
     所以按标题字数自适应。shape 由 token 自身定位，不写死 id。 */
  for (const token of ["st.header", "img.header"]) {
    const headerShapeId = findShapeIdByToken(shellXml, token);
    const header = page.tokens[token];
    if (headerShapeId === null || typeof header !== "string" || !header) continue;
    const bar = estimateTitleBarWidthPt(header);
    if (bar.capped) {
      warnings.push(`[第 ${pageIndex + 1} 页 · ${page.label}] 标题过长，标题条已封顶到页宽（${bar.widthPt}pt）——建议精简`);
    }
    xml = setShapeWidthPt(xml, headerShapeId, bar.widthPt);
  }

  const spec = page.tokens["st.spec"];
  if (Array.isArray(spec)) {
    for (const line of overflowingLines(spec, SPEC_BOX)) {
      warnings.push(`[${page.label}] ${SPEC_BOX.label}这行可能压到右侧光路图：${line}`);
    }
  }
  const require = page.tokens["st.require"];
  if (Array.isArray(require)) {
    for (const line of overflowingLines(require, REQUIRE_BOX)) {
      warnings.push(`[${page.label}] ${REQUIRE_BOX.label}这行可能超出文本框：${line}`);
    }
  }

  /* 影像页的文本框宽度两种壳不同（普通 527.4 / 特殊 577.9），门限必须跟着壳走 ——
     用同一个门限会把源报告本身放得下的长句误报成溢出。 */
  if (page.shell === layout.imagePlain || page.shell === layout.imageSpecial) {
    const kind: ImageShellKind = page.shell === layout.imageSpecial ? "special" : "plain";
    const caption = page.tokens["img.caption"];
    if (typeof caption === "string") {
      for (const line of overflowingLines([caption], imageCaptionBox(kind))) {
        warnings.push(`[${page.label}] 影像页名称行可能超出文本框：${line}`);
      }
    }
    const desc = page.tokens["img.desc"];
    if (Array.isArray(desc)) {
      for (const line of overflowingLines(desc, imageDescBox(kind))) {
        warnings.push(`[${page.label}] 影像页说明行可能超出文本框：${line}`);
      }
    }
  }
  return xml;
}

async function mustText(zip: JSZip, name: string): Promise<string> {
  const f = zip.file(name);
  if (!f) throw new Error(`模板缺少必需部件 ${name}`);
  return f.async("text");
}
