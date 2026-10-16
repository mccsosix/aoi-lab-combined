/**
 * 06 打光报告生成器 — 模板预处理（跑一次，产物入库）
 *
 * 目标：把一份脱敏的标准打光报告 pptx 变成「一组壳 + 占位符」的模板。
 *
 * 三步归一化（2026-09-29 P2a 起）：
 *   ① 删掉 12 个空 notesSlide —— 顺便验证「删 part + 四处注销」的机制
 *   ② 页面归一化成**壳**：12 页 → 6 个壳（映射见 src/lighting-report/domain/template-layout.ts，唯一真相源）
 *        cover / requirement / station / imagePlain / imageSpecial / conclusion
 *      源报告 slide3 与 slide4 结构完全相同（16 shape、id 一一对应、图片 rId 都是 image6~9），
 *      所以只留一页工站壳；7 页影像页里只留「普通壳 + 特殊壳」两份骨架，其余删掉。
 *   ③ 影像壳**清空内容**：删掉所有 `<p:pic>` / `椭圆` / `<p:cxnSp>`，只留标题条 + 名称/说明框（+ 特殊壳的 ↓）。
 *      不清空的话，生成出来的「空白影像页」会带着本案例的缺陷照片，看起来像已经填好的图 —— 会误导人。
 *   ④ 媒体回收：只留还有 rels 引用的 `ppt/media/*`，并摘掉指向被删部件的悬空关系。
 *      不做这步模板会一直背着源报告 28 张图的体积（5.2 MB），而壳里已经一张图都不需要。
 *
 * 为什么要重写 txBody 而不是「按名字改文字」：
 *   ① 源文件 shape 名重复且简繁混杂（同一页 4 个 `文本框 43`、多个 `图片 8`）→ 必须按 cNvPr id 定位
 *   ② 源文件一句话被切成 6+ 个 run（`CCD` + `：` + ` MV-CH250-90UC` + `(` + `新增` + `)`），
 *      而且 `(新增)` 是带 solidFill FF0000 的独立 run → 直接改文字必然掉样式
 *   ⇒ 预处理阶段把每个可变块重写成「每段单 run + 占位符」，运行时就是纯字符串操作。
 *      `(新增)` 的红色改为运行时按 highlight 规则重新切 run，比源文件更可控。
 *
 * 用法：
 *   node scripts/lighting-report/build-template.mjs <源.pptx> [输出目录]
 * 产物：
 *   src/lighting-report/assets/template.pptx
 *   src/lighting-report/assets/placeholders.json
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SlideSurgery, slidePartName, slideRelsName } from '../../src/lighting-report/domain/surgery.ts';
import {
  DROPPED_SOURCE_SLIDES,
  IMAGE_SHELL_KEEP_IDS,
  REQUIRE_SHELL_KEEP_IDS,
  TEMPLATE_LAYOUT,
  TEMPLATE_SHELLS,
} from '../../src/lighting-report/domain/template-layout.ts';

const require = createRequire(import.meta.url);
const JSZip = require('jszip');

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = resolve(HERE, '../..');
const OUT_DIR = resolve(PROJECT, 'src/lighting-report/assets');

const partNo = (p) => Number(/slide(\d+)\.xml$/.exec(p)[1]);
const COVER = partNo(TEMPLATE_LAYOUT.cover);
const REQUIRE = partNo(TEMPLATE_LAYOUT.requirement);
const STATION = partNo(TEMPLATE_LAYOUT.station);
const IMG_PLAIN = partNo(TEMPLATE_LAYOUT.imagePlain);
const IMG_SPECIAL = partNo(TEMPLATE_LAYOUT.imageSpecial);

/* ------------------------------------------------------------------ *
 * 目标清单：按 (slide part, cNvPr id) 定位，不按 shape 名
 *
 * key 命名：`cover.*` / `st.*` / `img.*`
 *   `st.*`  = 工站页字段（模板只有一页工站壳，克隆页各自填各自的值）
 *   `img.*` = 影像页字段（普通壳与特殊壳**共用同一套 key**，所以两页都出现一次）
 * `keys`   = 这个 shape 的 txBody 要重写成几段（1 段填 1 个 token；多段见影像壳的「名称 + 说明」）
 * sample   = 源报告里的原值，给 UI 当「图上标注」提示用（不是默认值，绝不代填）
 * ------------------------------------------------------------------ */
const TARGETS = [
  { part: COVER, id: '6146', keys: ['cover.title'], sample: '液冷入料密封圈新增AI檢測 / 評估報告', hint: '封面标题（第一行项目名，第二行常为「評估報告」）' },

  // 需求壳：只保留标题条（8194）+ 顶部文字框（8195），其余（4 张产品照 + 4 个名称标签 +
  // 一堆引线小矩形 + 一个尺寸文本框）全部清掉 —— 那是上一个案子的内容，留着会误导人。
  { part: REQUIRE, id: '8195', keys: ['req.lines'], sample: '密封圈內徑/厚度', hint: '【1.檢測需求】页文字（一行一段）；贴图走几何写入，不用 token' },

  { part: STATION, id: '10241', keys: ['st.header'], sample: '2.硬體設定-CCD1', hint: '章节标题条' },
  { part: STATION, id: '10244', keys: ['st.require'], sample: '最大值徑53.3mm，最大厚度6.7mm | 最小公差±0.08mm，公差帶=0.16 | 理想系統解析度=1/8~1/10 → 0.016~0.02mm | 選用25M Camera彩色相機 + 0.208x 遠心鏡頭可符合產品需求', hint: '需求推导（4 行，可由产品尺寸算）' },
  { part: STATION, id: '10243', keys: ['st.spec'], sample: 'CCD / Sensor Size / Lens / FOV / DOF / Resolution / Lens Resolution / 光源1 / 光源2 / 檢測項目（共 10 行）', hint: '硬件规格（10 行，前 7 行可由设备库算）' },
  { part: STATION, id: '10254', keys: ['st.mark228'], sample: '228', hint: '光路图尺寸标注 1（= 镜头工作距离）' },
  { part: STATION, id: '16', keys: ['st.mark100'], sample: '100', hint: '光路图尺寸标注 2' },
  { part: STATION, id: '11', keys: ['st.mark80'], sample: '80', hint: '光路图尺寸标注 3' },
  { part: STATION, id: '24', keys: ['st.mark30_100'], sample: '30-100', hint: '光路图尺寸标注 4' },

  // 影像壳（普通）：标题条 + 名称/说明框（源报告 slide5 是 4 图页，图与红圈在本步骤被清掉）
  { part: IMG_PLAIN, id: '4', keys: ['img.header'], sample: '3.打光影像-破損', hint: '影像页标题条 = `3.打光影像-{缺陷}`（特殊页也用基础缺陷名）' },
  { part: IMG_PLAIN, id: '12295', keys: ['img.caption', 'img.desc'], sample: '打光影像-破損 | QE提供不良樣品*4 | 紅色標示即為不良位置 | 目前破損形態較為明顯可以檢出', hint: '第 1 段＝名称行；第 2 段起＝说明行' },

  // 影像壳（特殊）：标题条 + 名称/说明框 + ↓（文本框 5 原样保留，是特殊页版式的一部分）
  { part: IMG_SPECIAL, id: '4', keys: ['img.header'], sample: '3.打光影像-破損', hint: '影像页标题条（特殊页仍是基础缺陷名）' },
  { part: IMG_SPECIAL, id: '12295', keys: ['img.caption', 'img.desc'], sample: '打光影像-破損-特殊 | 端面密封圈結構特殊，內壁有兩處弧度区域 | 正光下弧度區域發黑，相機無法清楚看清內壁，若有輕微NG無法看出', hint: '第 1 段＝名称行（特殊页通常带「-特殊」）；第 2 段起＝说明行' },
];

/* ------------------------------ 小工具 ------------------------------ */
const ATTR = (s, name) => {
  const m = new RegExp(`\\s${name}="[^"]*"`).exec(s);
  return m ? m[0] : '';
};

/** 取第一个匹配，返回匹配串（支持自闭合与成对两种写法） */
function firstTag(xml, tag) {
  const paired = new RegExp(`<a:${tag}[^>]*>[\\s\\S]*?</a:${tag}>`);
  const self = new RegExp(`<a:${tag}[^>]*/>`);
  const p = paired.exec(xml);
  const s = self.exec(xml);
  if (p && s) return p.index < s.index ? p[0] : s[0];
  return (p || s)?.[0] ?? null;
}

/** 定位并切出某个 <p:sp> 块（p:sp 不嵌套） */
function findSp(xml, id) {
  const re = /<p:sp>[\s\S]*?<\/p:sp>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const cv = /<p:cNvPr[^>]*/.exec(m[0]);
    if (cv && ATTR(cv[0], 'id') === ` id="${id}"`) return m;
  }
  return null;
}

/**
 * 把一个可变文本块重写成「每段单 run + 占位符」。
 * `keys` 有 N 个就写 N 段：第 i 段继承原块**第 i 段**的 pPr 与 rPr
 * （不够就沿用最后一段的）—— 影像壳的「名称行 + 说明行」靠这个保住两种不同的段落样式
 * （名称行 Wingdings 箭头 bullet、说明行 Arial • bullet + marL 缩进）。
 */
function rewriteShapeTxBody(spXml, keys) {
  const bodyMatch = /<p:txBody>[\s\S]*?<\/p:txBody>/.exec(spXml);
  if (!bodyMatch) throw new Error('找不到 txBody');
  const old = bodyMatch[0];

  const bodyPr = /<a:bodyPr[^>]*\/>|<a:bodyPr[^>]*>[\s\S]*?<\/a:bodyPr>/.exec(old)?.[0] ?? '<a:bodyPr/>';
  const lstStyle = firstTag(old, 'lstStyle') ?? '';
  const paras = [...old.matchAll(/<a:p>[\s\S]*?<\/a:p>/g)].map((m) => m[0]);
  if (!paras.length) throw new Error('找不到段落');

  const protoOf = (i) => paras[Math.min(i, paras.length - 1)];
  const runProps = [];

  const body = keys
    .map((key, i) => {
      const p = protoOf(i);
      const pPr = firstTag(p, 'pPr') ?? '';
      const firstR = /<a:r>[\s\S]*?<\/a:r>/.exec(p)?.[0];
      if (!firstR) throw new Error(`第 ${i + 1} 段找不到 run`);
      const rPr = firstTag(firstR, 'rPr');
      if (!rPr) throw new Error(`第 ${i + 1} 段找不到 rPr，无法保证字号字体`);
      runProps.push(rPr);
      const endParaRPr = firstTag(p, 'endParaRPr');
      const endTag = endParaRPr ?? (rPr.startsWith('<a:rPr') ? rPr.replace(/^<a:rPr/, '<a:endParaRPr') : '');
      return `<a:p>${pPr}<a:r>${rPr}<a:t xml:space="preserve">{{${key}}}</a:t></a:r>${endTag}</a:p>`;
    })
    .join('');

  return { newSp: spXml.replace(old, `<p:txBody>${bodyPr}${lstStyle}${body}</p:txBody>`), runProps };
}

/* --------------------- 删除 notesSlide（部件注销） --------------------- */
async function stripNotes(zip) {
  const removed = [];
  for (const name of Object.keys(zip.files)) {
    if (/^ppt\/notesSlides\//.test(name)) { zip.remove(name); removed.push(name); }
  }
  if (!removed.length) return removed;

  const ctName = '[Content_Types].xml';
  let ct = await zip.file(ctName).async('text');
  ct = ct.replace(/<Override PartName="\/ppt\/notesSlides\/[^"]*"[^>]*\/>/g, '');
  zip.file(ctName, ct);

  const prName = 'ppt/_rels/presentation.xml.rels';
  let pr = await zip.file(prName).async('text');
  pr = pr.replace(/<Relationship [^>]*Target="notesSlides\/[^"]*"[^>]*\/>/g, '');
  zip.file(prName, pr);

  for (const name of Object.keys(zip.files)) {
    if (!/^ppt\/slides\/_rels\/.*\.rels$/.test(name)) continue;
    const r0 = await zip.file(name).async('text');
    const r1 = r0.replace(/<Relationship [^>]*notesSlide[^"]*"[^>]*\/>/g, '');
    if (r1 !== r0) zip.file(name, r1);
  }

  const appName = 'docProps/app.xml';
  if (zip.file(appName)) {
    const app = await zip.file(appName).async('text');
    zip.file(appName, app.replace(/<Notes>\d+<\/Notes>/, '<Notes>0</Notes>'));
  }
  return removed;
}

/* ------------------ 影像壳清空：只留骨架 shape ------------------ */
function blankImageShell(xml, keepIds) {
  let out = xml.replace(/<p:pic>[\s\S]*?<\/p:pic>/g, '');
  out = out.replace(/<p:cxnSp>[\s\S]*?<\/p:cxnSp>/g, '');
  out = out.replace(/<p:sp>[\s\S]*?<\/p:sp>/g, (block) => {
    const id = /<p:cNvPr[^>]*\sid="(\d+)"/.exec(block)?.[1];
    return id && keepIds.includes(id) ? block : '';
  });
  return out;
}

/* ---------------------- rels target 归一化 ---------------------- */
function resolveTarget(relsName, target) {
  if (/^(https?:|file:|mailto:|#)/i.test(target)) return null;
  const base = posix.dirname(posix.dirname(relsName.replace(/\\/g, '/')));
  return posix.normalize(posix.join(base, target.replace(/^\//, '')));
}

/** 摘掉「rId 在宿主部件里已经用不到」的图片关系（清空影像壳后会留下一批） */
async function stripOrphanImageRels(zip) {
  const stripped = [];
  for (const name of Object.keys(zip.files)) {
    if (!/^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(name)) continue;
    const owner = name.replace('/_rels/', '/').replace(/\.rels$/, '');
    if (!zip.file(owner)) continue;
    const xml = await zip.file(owner).async('text');
    const before = await zip.file(name).async('text');
    const after = before.replace(/<Relationship [^>]*\/>/g, (all) => {
      if (!/relationships\/image"/.test(all)) return all;
      const id = /Id="(rId\d+)"/.exec(all)?.[1];
      if (!id) return all;
      const used = xml.includes(`"${id}"`);
      if (!used) stripped.push(`${name}#${id}`);
      return used ? all : '';
    });
    if (after !== before) zip.file(name, after);
  }
  return stripped;
}

/** 媒体回收：没有任何 rels 指向的 ppt/media/* 一律删掉，并摘掉指向它们的悬空关系 */
async function collectMedia(zip) {
  const names = () => Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  const allRels = () => names().filter((n) => n.endsWith('.rels'));
  const media = () => names().filter((n) => /^ppt\/media\//.test(n));

  const referenced = new Set();
  for (const n of allRels()) {
    const r = await zip.file(n).async('text');
    for (const m of r.matchAll(/Target="([^"]+)"/g)) {
      const t = resolveTarget(n, m[1]);
      if (t) referenced.add(t);
    }
  }

  const dead = media().filter((m) => !referenced.has(m));
  const deadSet = new Set(dead);
  for (const d of dead) zip.remove(d);

  // 摘掉指向已删部件的 rel 条目（留着就是悬空关系，WPS 会报损坏）
  for (const n of allRels()) {
    const before = await zip.file(n).async('text');
    const after = before.replace(/<Relationship [^>]*Target="([^"]+)"[^>]*\/>/g, (all, t) => {
      const abs = resolveTarget(n, t);
      return abs && deadSet.has(abs) ? '' : all;
    });
    if (after !== before) zip.file(n, after);
  }
  return { dead, kept: media().length };
}

/* ------------------------------- 主流程 ------------------------------- */
const src = process.argv[2];
const outDir = process.argv[3] ? resolve(process.argv[3]) : OUT_DIR;
if (!src) {
  console.error('用法: node scripts/lighting-report/build-template.mjs <源.pptx> [输出目录]');
  process.exit(1);
}

const buf = readFileSync(src);
const zip = await JSZip.loadAsync(buf);
const originalCount = Object.keys(zip.files).filter((n) => !zip.files[n].dir).length;

/* ---- ① 占位符化 ---- */
const manifest = [];
for (const t of TARGETS) {
  const name = slidePartName(t.part);
  let xml = await zip.file(name).async('text');
  const found = findSp(xml, t.id);
  if (!found) throw new Error(`slide${t.part}: 找不到 cNvPr id=${t.id}（${t.keys.join(' / ')}）`);
  const { newSp, runProps } = rewriteShapeTxBody(found[0], t.keys);
  xml = xml.slice(0, found.index) + newSp + xml.slice(found.index + found[0].length);
  zip.file(name, xml);
  t.keys.forEach((key, i) => {
    manifest.push({
      key, part: t.part, shapeId: t.id, slideIndex: t.part - 1,
      paragraphIndex: i, mode: 'lines', hint: t.hint, sample: t.sample,
      baseRunProps: runProps[i],
    });
  });
}

/* ---- ② 影像壳清空 ---- */
const blanked = [];
for (const [part, kind] of [[IMG_PLAIN, 'plain'], [IMG_SPECIAL, 'special']]) {
  const name = slidePartName(part);
  const before = await zip.file(name).async('text');
  const after = blankImageShell(before, IMAGE_SHELL_KEEP_IDS[kind]);
  const goneShapes = (before.match(/<p:(pic|sp|cxnSp)>/g) ?? []).length - (after.match(/<p:(pic|sp|cxnSp)>/g) ?? []).length;
  zip.file(name, after);
  blanked.push({ part, kind, removedShapes: goneShapes });
}

/* ---- ②b 需求壳清空 ---- */
/* 源报告的需求页 = 标题条 + 一行文字 + 4 张产品照 + 4 个名称标签 + 一堆引线矩形 + 一个尺寸框。
   用户 2026-09-30 定「需求页要能填」—— 所以只留标题条与文字框，其余全清。
   不清的话，生成出来的每一份报告都会带着这个案子的密封圈照片。 */
const requireBefore = await zip.file(slidePartName(REQUIRE)).async('text');
const requireAfter = blankImageShell(requireBefore, REQUIRE_SHELL_KEEP_IDS);
const requireShell = {
  part: REQUIRE,
  removedShapes: (requireBefore.match(/<p:(pic|sp|cxnSp)>/g) ?? []).length - (requireAfter.match(/<p:(pic|sp|cxnSp)>/g) ?? []).length,
  keepIds: REQUIRE_SHELL_KEEP_IDS,
};
zip.file(slidePartName(REQUIRE), requireAfter);

/* ---- ③ 删备注 ---- */
const notesRemoved = await stripNotes(zip);
/* ---- ④ 归一化成 6 个壳：删掉其余页 ---- */
const slideIndexes = Object.keys(zip.files)
  .map((n) => /^ppt\/slides\/slide(\d+)\.xml$/.exec(n))
  .filter(Boolean)
  .map((m) => Number(m[1]));

const parts = {
  presentation: await zip.file('ppt/presentation.xml').async('text'),
  presentationRels: await zip.file('ppt/_rels/presentation.xml.rels').async('text'),
  contentTypes: await zip.file('[Content_Types].xml').async('text'),
  app: (await zip.file('docProps/app.xml')?.async('text')) ?? null,
};
const surgery = new SlideSurgery(parts, slideIndexes);

const keepNumbers = new Set(TEMPLATE_SHELLS.map(partNo));
const dropped = DROPPED_SOURCE_SLIDES.map(slidePartName).filter((p) => slideIndexes.includes(partNo(p)));
surgery.removeSlides(dropped);
for (const part of dropped) {
  zip.remove(part);
  zip.remove(slideRelsName(partNo(part)));
}
// 意外残页（源报告改版后多出来的页）也一并删掉：模板只能剩这 6 个壳，
// 否则生成时会随包带出去一堆没人管的固定页
const extra = slideIndexes.filter((n) => !keepNumbers.has(n) && !DROPPED_SOURCE_SLIDES.includes(n));
if (extra.length) {
  const extraParts = extra.map(slidePartName);
  surgery.removeSlides(extraParts);
  for (const part of extraParts) {
    zip.remove(part);
    zip.remove(slideRelsName(partNo(part)));
  }
}
const committed = surgery.commit();
zip.file('ppt/presentation.xml', committed.presentation);
zip.file('ppt/_rels/presentation.xml.rels', committed.presentationRels);
zip.file('[Content_Types].xml', committed.contentTypes);
if (committed.app !== null) zip.file('docProps/app.xml', committed.app);

/* ---- ⑤ 媒体回收 ---- */
const orphanRels = await stripOrphanImageRels(zip);
const media = await collectMedia(zip);

/* ---- 冻结页序：写进 manifest，门禁据此断言「壳顺序没被改动」 ---- */
const relsOf = (relId) => new RegExp(`<Relationship Id="${relId}"[^>]*Target="([^"]+)"`).exec(committed.presentationRels)?.[1];
const sldIdOrder = [...committed.presentation.matchAll(/<p:sldId [^>]*r:id="(rId\d+)"/g)].map((m) => m[1]);
const slideOrder = sldIdOrder.map((rid) => `ppt/${relsOf(rid)}`);
const ridOfPart = (part) => {
  const m = new RegExp(`<Relationship Id="(rId\\d+)"[^>]*Target="slides/slide${partNo(part)}\\.xml"`).exec(committed.presentationRels);
  return m ? m[1] : null;
};
const stationRid = ridOfPart(TEMPLATE_LAYOUT.station);

const out = await zip.generateAsync({
  type: 'nodebuffer',
  compression: 'DEFLATE',
  compressionOptions: { level: 6 },
});
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'template.pptx'), out);
writeFileSync(
  resolve(outDir, 'placeholders.json'),
  JSON.stringify(
    {
      version: 4,
      builtFrom: src.split(/[\\/]/).pop(),
      builtFromSha256: createHash('sha256').update(buf).digest('hex'),
      slideSize: { cx: 9144000, cy: 6858000 },
      notesSlidesRemoved: notesRemoved.length,
      /** 模板的壳映射（与 domain/template-layout.ts 必须一致，门禁会核对） */
      layout: { ...TEMPLATE_LAYOUT },
      shells: TEMPLATE_SHELLS,
      droppedParts: dropped,
      unexpectedParts: extra.map(slidePartName),
      /** 工站页：模板里唯一的工站壳 + 它在 sldIdLst 的 0 基下标 */
      stationPage: {
        part: TEMPLATE_LAYOUT.station,
        sldIdLstIndex: stationRid ? sldIdOrder.indexOf(stationRid) : -1,
      },
      /** 影像壳：清空了哪些东西（便于回查） */
      imageShells: blanked,
      /** 需求壳：清空了哪些东西（上一个案子的产品照 + 标签） */
      requireShell,
      media: { removed: media.dead.sort(), kept: media.kept, orphanImageRels: orphanRels.length },
      /** 模板最终页序（part 名），门禁据此断言壳顺序 */
      slideOrder,
      placeholders: manifest,
    },
    null,
    2,
  ) + '\n',
);

const kb = (n) => (n / 1024).toFixed(0) + ' KB';
console.log(`源文件        ${kb(buf.length)}（${originalCount} 个部件）`);
console.log(`模板产物      ${kb(out.length)} → ${resolve(outDir, 'template.pptx')}`);
console.log(`壳            ${TEMPLATE_SHELLS.length} 个：${TEMPLATE_SHELLS.join(', ')}`);
console.log(`占位符        ${manifest.length} 个：${manifest.map((m) => m.key).join(', ')}`);
console.log(`删掉备注页    ${notesRemoved.length} 个`);
console.log(`归一化        删掉 ${dropped.length + extra.length} 页（${dropped.join(', ')}）→ 模板 ${slideIndexes.length - dropped.length - extra.length} 页`);
console.log(`影像壳清空    ${blanked.map((b) => `slide${b.part}(-${b.removedShapes} shape)`).join(', ')}`);
console.log(`需求壳清空    slide${requireShell.part}(-${requireShell.removedShapes} shape，留 ${REQUIRE_SHELL_KEEP_IDS.join('+')})`);
console.log(`媒体回收      删 ${media.dead.length} 张，留 ${media.kept} 张；摘掉用不到的图片关系 ${orphanRels.length} 条`);
console.log(`工站壳        ${TEMPLATE_LAYOUT.station}　sldIdLst 下标 ${stationRid ? sldIdOrder.indexOf(stationRid) : -1}`);
console.log(`模板页序      ${slideOrder.join(' , ')}`);
