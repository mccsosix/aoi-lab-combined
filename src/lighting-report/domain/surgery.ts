/**
 * 06 打光报告生成器 —— 包级手术：往 pptx 里「加页 / 删页」
 *
 * 加一页 slide 不是复制一个 XML 就完事，必须同时做对四件事，漏一件 WPS/PowerPoint 就报损坏：
 *   ① `[Content_Types].xml` 加 `<Override>`（否则部件类型未知）
 *   ② `ppt/_rels/presentation.xml.rels` 加一条 slide 关系
 *   ③ `ppt/presentation.xml` 的 `p:sldIdLst` 在**正确位置**插入一条 `<p:sldId>`
 *      （sldIdLst 的顺序 = 放映顺序，插错位置页序就乱）
 *   ④ `docProps/app.xml` 的 `<Slides>` / HeadingPairs / TitlesOfParts 三个计数跟着动
 *
 * 反向删页同样四件事，都要注销干净。
 *
 * 这些函数只做**字符串手术**，不依赖 JSZip —— 调用方（build-template.mjs / generate.ts）
 * 自己负责读写 zip 部件。这样同一份实现既能在 Node 构建期用，也能在浏览器生成期用。
 */

export type PackageParts = {
  presentation: string;
  presentationRels: string;
  contentTypes: string;
  app: string | null;
};

const SLIDE_CT = "application/vnd.openxmlformats-officedocument.presentationml.slide+xml";
const SLIDE_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide";

export const slidePartName = (n: number): string => `ppt/slides/slide${n}.xml`;
export const slideRelsName = (n: number): string => `ppt/slides/_rels/slide${n}.xml.rels`;

/** 从 `ppt/slides/slide12.xml` 里取出 12 */
export function parseSlideIndex(partName: string): number | null {
  const m = /^ppt\/slides\/slide(\d+)\.xml$/.exec(partName);
  return m ? Number(m[1]) : null;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * 按包内已有部件算出「下一个可用的 slide 序号」。
 *
 * 刻意**复用空号**：模板删掉 slide4 后，第 2 个工站就落在 slide4 上，
 * 这样 1 工站 / 2 工站的文件看上去跟手工做的文件一样自然，
 * 而不是凭空冒出一个 slide13.xml 去当第 4 页。
 */
export function pickFreeSlideIndex(used: Iterable<number>, min = 1): number {
  const set = new Set(used);
  let n = min;
  while (set.has(n)) n += 1;
  return n;
}

export type AddedSlide = { part: string; rels: string; rId: string; sldId: number };

export class SlideSurgery {
  private pres: string;
  private prels: string;
  private ct: string;
  private app: string | null;
  private ridCounter: number;
  private sldIdCounter: number;
  private usedIndexes: Set<number>;
  /** 模板原有：rId → sldId。重排页序时**原样复用**，不重新发号 */
  private readonly sldIdOfRid = new Map<string, number>();
  /** 模板原来的四个部件（用来算 changed，别用计数差糊弄） */
  private readonly originals: PackageParts;
  private readonly initialCount: number;
  private currentCount: number;

  readonly addedParts: string[] = [];
  readonly removedParts: string[] = [];

  constructor(parts: PackageParts, usedSlideIndexes: Iterable<number>) {
    this.pres = parts.presentation;
    this.prels = parts.presentationRels;
    this.ct = parts.contentTypes;
    this.app = parts.app;
    this.originals = { ...parts };
    this.usedIndexes = new Set(usedSlideIndexes);

    // rId 与 sldId 都接着现有最大值往上发，避免撞号
    const ridNums = [...this.prels.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]));
    this.ridCounter = (ridNums.length ? Math.max(...ridNums) : 0) + 1;
    const sldIdNums = [...this.pres.matchAll(/<p:sldId id="(\d+)"/g)].map((m) => Number(m[1]));
    this.sldIdCounter = (sldIdNums.length ? Math.max(...sldIdNums) : 255) + 1;
    for (const m of this.pres.matchAll(/<p:sldId id="(\d+)" r:id="(rId\d+)"\s*\/>/g)) {
      this.sldIdOfRid.set(m[2], Number(m[1]));
    }
    this.initialCount = sldIdNums.length;
    this.currentCount = sldIdNums.length;
  }

  get pages(): number {
    return this.currentCount;
  }

  private takeFreeIndex(): number {
    const n = pickFreeSlideIndex(this.usedIndexes);
    this.usedIndexes.add(n);
    return n;
  }

  /**
   * 在 sldIdLst 的第 atIndex 位插入一页。
   * 返回该页的 part 名与新分配的 rId，供调用方写 `slideN.xml` 与 `_rels`。
   */
  addSlide(atIndex: number): AddedSlide {
    const n = this.takeFreeIndex();
    const part = slidePartName(n);
    const rId = `rId${this.ridCounter++}`;
    const sldId = this.sldIdCounter++;

    this.prels = this.prels.replace(
      /<\/Relationships>/,
      `<Relationship Id="${rId}" Type="${SLIDE_REL_TYPE}" Target="slides/slide${n}.xml"/></Relationships>`,
    );
    this.ct = this.ct.replace(
      /<\/Types>/,
      `<Override PartName="/${part}" ContentType="${SLIDE_CT}"/></Types>`,
    );
    this.pres = insertSldId(this.pres, `<p:sldId id="${sldId}" r:id="${rId}"/>`, atIndex);
    this.currentCount += 1;
    this.addedParts.push(part);
    // 登记 rId → sldId，这样 setSlideOrder 重排时会**复用同一个号**，
    // 而不是把刚发出去的号丢掉再发一个新的（两个都合法，但复用更好排查）
    this.sldIdOfRid.set(rId, sldId);
    return { part, rels: slideRelsName(n), rId, sldId };
  }

  /** 删页：四件套全注销。返回实际删掉的 part 名。 */
  removeSlides(partNames: string[]): string[] {
    const gone: string[] = [];
    for (const part of partNames) {
      const target = escapeRe(part.replace(/^ppt\//, ""));
      const rel = new RegExp(`<Relationship Id="(rId\\d+)"[^>]*Target="${target}"[^>]*/>`).exec(this.prels);
      this.prels = rel ? this.prels.replace(rel[0], "") : this.prels;
      this.ct = this.ct.replace(new RegExp(`<Override PartName="/${escapeRe(part)}"[^>]*/>`), "");
      if (rel) {
        this.pres = this.pres.replace(new RegExp(`<p:sldId [^>]*r:id="${rel[1]}"\\s*/>`), "");
      }
      const idx = parseSlideIndex(part);
      if (idx !== null) this.usedIndexes.delete(idx);
      this.currentCount -= 1;
      gone.push(part);
      this.removedParts.push(part);
    }
    return gone;
  }

  /**
   * 把 `p:sldIdLst` 整体重写成给定顺序 —— 页序的**唯一权威**。
   *
   * 为什么不是「插页时算下标」：影像页要跟着工站走，工站和影像段都能增删，
   * 靠「第 atIndex 位插入」去维持顺序，每插一次后面所有下标都要跟着挪，
   * 一旦算错就会出现「影像页跑到工站页前面」这种只能靠人工发现的错。
   * 改成「先算出最终页序 → 一次性重写 sldIdLst」，顺序就是那个数组，没有增量状态。
   *
   * sldId 数值原样复用模板的（只要求唯一且 ≥256，与页码无关）；
   * 克隆页的 sldId 由 addSlide 分发时已经记进 sldIdOfRid。
   */
  setSlideOrder(orderedParts: string[]): void {
    const ridOfPart = new Map<string, string>();
    for (const m of this.prels.matchAll(/<Relationship Id="(rId\d+)"[^>]*Target="([^"]+)"[^>]*\/>/g)) {
      const target = posixNormalize(`ppt/${m[2]}`);
      if (/^ppt\/slides\/slide\d+\.xml$/.test(target)) ridOfPart.set(target, m[1]);
    }
    const seen = new Set<string>();
    const entries = orderedParts.map((part) => {
      if (seen.has(part)) throw new Error(`页序里出现重复的页 ${part}`);
      seen.add(part);
      const rid = ridOfPart.get(part);
      if (!rid) throw new Error(`重排页序时找不到 ${part} 的幻灯片关系（关系已被注销？）`);
      const id = this.sldIdOfRid.get(rid) ?? this.sldIdCounter++;
      return `<p:sldId id="${id}" r:id="${rid}"/>`;
    });
    this.pres = this.pres.replace(
      /(<p:sldIdLst>)[\s\S]*?(<\/p:sldIdLst>)/,
      (_all, open: string, close: string) => `${open}${entries.join("")}${close}`,
    );
    this.currentCount = orderedParts.length;
  }

  /**
   * 写回部件。
   * `changed` 是**逐部件与原串比对**得出的 —— 不能只看页数差：
   * 「1 工站 + 1 普通 + 1 特殊」这种情况页数正好不变（6 → 6），
   * 但页序确实被重排了，只看计数会漏报。
   */
  commit(): PackageParts & { changed: Record<keyof PackageParts, boolean> } {
    const app = this.app === null ? null : adjustAppXml(this.app, this.currentCount - this.initialCount);
    const next: PackageParts = {
      presentation: this.pres,
      presentationRels: this.prels,
      contentTypes: this.ct,
      app,
    };
    return {
      ...next,
      changed: {
        presentation: next.presentation !== this.originals.presentation,
        presentationRels: next.presentationRels !== this.originals.presentationRels,
        contentTypes: next.contentTypes !== this.originals.contentTypes,
        app: next.app !== this.originals.app,
      },
    };
  }
}

/** 把 `../media/image1.png` 这类相对 target 归一到包内绝对路径 */
function posixNormalize(p: string): string {
  const parts = p.replace(/\\/g, "/").split("/");
  const out: string[] = [];
  for (const seg of parts) {
    if (seg === "." || seg === "") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return out.join("/");
}

/** 插入到 sldIdLst 的指定位置，不改变其余格式 */
function insertSldId(pres: string, entry: string, atIndex: number): string {
  return pres.replace(/(<p:sldIdLst>)([\s\S]*?)(<\/p:sldIdLst>)/, (_all, open: string, body: string, close: string) => {
    const items = [...body.matchAll(/<p:sldId [^>]*\/>/g)].map((m) => m[0]);
    const at = Math.max(0, Math.min(atIndex, items.length));
    items.splice(at, 0, entry);
    return `${open}${items.join("")}${close}`;
  });
}

/**
 * 按增量修 docProps/app.xml 的三个计数。
 *
 * app.xml 是「扩展属性」，非规范性文件 —— 错了不会打不开；
 * 但 WPS 自己写的这份是自洽的，我们改了页数就该一起改，
 * 否则「文件 → 属性 → 统计」里的页数会跟实际对不上（现场是会被问的）。
 */
export function adjustAppXml(app: string, slidesDelta: number): string {
  if (slidesDelta === 0) return app;
  const oldN = Number(/<Slides>(\d+)<\/Slides>/.exec(app)?.[1] ?? 0);
  const newN = Math.max(0, oldN + slidesDelta);
  let out = app.replace(/<Slides>\d+<\/Slides>/, `<Slides>${newN}</Slides>`);
  out = out.replace(
    /(<vt:lpstr>幻灯片标题<\/vt:lpstr><\/vt:variant><vt:variant><vt:i4>)\d+(<\/vt:i4>)/,
    `$1${newN}$2`,
  );
  const vec = /<TitlesOfParts><vt:vector size="(\d+)" baseType="lpstr">([\s\S]*?)<\/vt:vector><\/TitlesOfParts>/.exec(out);
  if (vec) {
    const ents = [...vec[2].matchAll(/<vt:lpstr>[\s\S]*?<\/vt:lpstr>/g)].map((m) => m[0]);
    if (slidesDelta > 0) {
      const proto = ents[ents.length - 1] ?? "<vt:lpstr>PowerPoint 演示文稿</vt:lpstr>";
      for (let i = 0; i < slidesDelta; i++) ents.push(proto);
    } else {
      ents.splice(Math.max(0, ents.length + slidesDelta));
    }
    out = out.replace(
      vec[0],
      `<TitlesOfParts><vt:vector size="${ents.length}" baseType="lpstr">${ents.join("")}</vt:vector></TitlesOfParts>`,
    );
  }
  return out;
}
