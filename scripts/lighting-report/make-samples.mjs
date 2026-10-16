/**
 * 06 打光报告生成器 — 命令行生成 / 样张自检
 *
 * 这个脚本是 **thin wrapper**：真正的算法全在 src/lighting-report/domain/ 里，
 * 浏览器里的工具跑的是同一份代码（Node 直接类型剥离加载 .ts，无需编译）。
 * 所以这里的产物跟界面点「生成」出来的东西是同一个东西 —— 不存在「命令行对了、界面不对」。
 *
 * 用法：
 *   node scripts/lighting-report/make-samples.mjs                        # 跑内置样张
 *   node scripts/lighting-report/make-samples.mjs <model.json> <out.pptx> # 按 JSON 生成
 *   LIGHTING_SOURCE=<源报告.pptx> node scripts/lighting-report/make-samples.mjs
 *
 * 样张是给人看的，**每份都必须把占位符填满、且不带告警**。
 * 早期版本为了试「漏填」路径故意丢掉一个工站，结果产出一份满是 {{st.spec}} 的文件，
 * 看起来像坏掉了 —— 那个负向契约归 verify-lighting-report.mjs 管，不该出现在样张里。
 *
 * ── P2b 起：样张里的图片是真图 ────────────────────────────────────────
 * `lighting-2stations-replica` 会把**源报告的 7 页影像原样搬进来**（图片、坐标、红圈全部照搬，
 * 走 scripts/lighting-report/source-images.mjs 读回），这样用户能拿它跟原稿逐页比对。
 * 其余样张借用源报告的 1 张真图，按自动摆放铺 1–4 张，用来看网格排得对不对。
 * 找不到源报告时自动降级成「没有图片的骨架页」（会在日志里说清楚，不静默）。
 *
 * **已知与源报告的差异**（不是 bug，是这一版的边界）：
 *   · 源报告 slides 6/7/8 上的红色**箭头连接符**（`p:cxnSp`）这一版不生成 —— 只生成红圈。
 *   · 源报告 slide5 的 image12 带 `srcRect` 裁切，我们按原图整张放，所以那一格内容会略多。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { generateReport } from '../../src/lighting-report/domain/generate.ts';
import { planPages } from '../../src/lighting-report/domain/plan.ts';
import { buildSpecLines, emptyImageGroup, emptyImagePage, findLens } from '../../src/lighting-report/domain/spec.ts';
import { extractSlideImages } from './source-images.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = resolve(HERE, '../..');
const ASSETS = resolve(PROJECT, 'src/lighting-report/assets');
const OUT_DIR = resolve(PROJECT, '../outputs');

const devices = {
  cameras: JSON.parse(readFileSync(resolve(PROJECT, 'src/fov/data/cameras.json'), 'utf8')),
  lenses: JSON.parse(readFileSync(resolve(PROJECT, 'src/fov/data/lenses.json'), 'utf8')),
};
const template = readFileSync(resolve(ASSETS, 'template.pptx'));

/** 源报告：只用来给样张取材（工具本身不吃这条路径）。可用 LIGHTING_SOURCE 覆盖。 */
const SOURCE = process.env.LIGHTING_SOURCE ?? resolve(homedir(), 'Downloads/液冷入料密封圈AI檢測評估報告X4-20260724 (1).pptx');
let sourceZip = null;
if (existsSync(SOURCE)) {
  sourceZip = await JSZip.loadAsync(readFileSync(SOURCE));
} else {
  console.log(`⚠ 没找到源报告 ${SOURCE}\n  → 样张里的影像页会是「有骨架没图片」的空页（设 LIGHTING_SOURCE 可指定别处）`);
}

/**
 * 【1.檢測需求】页的内容（用户 2026-09-30 定的模型）。
 * 不再是「最大外径 / 最大厚度 / 相机像素」那几个字段 —— 需求页 = 一段可手打的文字 + 可选一张需求表图。
 * 相机像素 / 彩色 / 镜头类型搬去了**逐工站**的「需求推导」（见下面的 station 构造）。
 */
const requirement = { lines: ['密封圈內徑/厚度', '6.7±0.03'], image: null };

/** 逐工站的需求推导默认值（源报告 CCD1 / CCD2 都是这一组，只有倍率不同） */
const REQUIRE_1 = { requireLead: '最大值徑53.3mm，最大厚度6.7mm', toleranceMm: 0.08, toleranceStyle: 'pm', lensKind: '遠心鏡頭' };

/** 【2.硬體設定】页的源报告实测值：fps 14.3（库值 14）、Lens Resolution 0.02（公式 0.0178） */
const stationWithLibraryLens = (header, over = {}) => ({
  id: header,
  header,
  cameraModel: 'MV-CH250-90UC',
  lensModel: 'DTCM110-80H-AL',
  lightSource1: 'LT-24V-120RT15-W',
  lightSource2: 'LT-24V-91PF91-W',
  inspectionItems: ['內徑', '外徑', '毛邊', '破損'],
  newFlags: ['camera', 'light1', 'light2', 'items'],
  marks: { mark228: 228, mark100: 100, mark80: 80, mark30_100: '30-100' },
  measured: { fps: 14.3, lensResolutionMmPerPixel: 0.02 },
  imageGroups: [],
  ...REQUIRE_1,
  ...over,
});

/** 源报告 CCD2：镜头 XF-10MDT0209X200-1C 不在 426 款库里 → 全部走人工填报 */
const stationWithUnknownLens = (over = {}) => ({
  id: 'ccd2',
  header: '2.硬體設定-CCD2（替換鐳射工站）',
  cameraModel: 'MV-CH250-90UC',
  lensModel: 'XF-10MDT0209X200-1C',
  lightSource1: 'LT-24V-120RT15-W',
  lightSource2: 'LT-24V-91PF91-W',
  inspectionItems: ['內徑', '外徑', '毛邊', '破損'],
  newFlags: [],
  marks: { mark228: 228, mark100: 100, mark80: 80, mark30_100: '30-100' },
  measured: {
    fps: 14.3, magnification: 0.209, fovWidthMm: 61.24, fovHeightMm: 61.24,
    resolutionMmPerPixel: 0.01196, dofNominalMm: 19, lensResolutionMmPerPixel: 0.0252,
  },
  imageGroups: [],
  ...REQUIRE_1,
  ...over,
});

/* --------------------------- 影像段构造 --------------------------- */

const page = (kind, caption, desc = []) => ({ ...emptyImagePage(caption, kind), kind, caption, desc });
const mk = (defect, pages) => ({ ...emptyImageGroup(), defect, pages });

/** 源报告某页的图 → 我们模型里的 slot（位置/红圈照搬，`autoLayout:false` 才用得上 box） */
async function slotsFromSource(slideNo) {
  if (!sourceZip) return null;
  const { slots, arrows, orphans, circles } = await extractSlideImages(sourceZip, slideNo);
  if (arrows || orphans) {
    console.log(`    （source slide${slideNo}：跳过 ${arrows} 根箭头、${orphans} 个落不到图上的圈）`);
  }
  console.log(`    （source slide${slideNo}：${slots.length} 张图 / ${circles} 个红圈）`);
  return slots.map((s, i) => ({
    id: `src${slideNo}-${i}`,
    name: s.name,
    dataUrl: s.dataUrl,
    pxW: s.pxW,
    pxH: s.pxH,
    box: s.box,
    circles: s.circles.map((c, j) => ({ id: `src${slideNo}-${i}-c${j}`, ...c })),
  }));
}

/** 借用源报告的真图做「自动摆放」演示：只要 dataUrl 与像素尺寸，不要 box / 圈 */
let FILLER = [];
if (sourceZip) {
  const got = await extractSlideImages(sourceZip, 5);
  FILLER = got.slots.map((s) => ({ name: s.name, dataUrl: s.dataUrl, pxW: s.pxW, pxH: s.pxH }));
  console.log(`素材：源报告 slide5 读回 ${FILLER.length} 张图（${got.arrows} 根箭头、${got.orphans} 个游离圈）`);
}
const filler = (n) =>
  FILLER.slice(0, n).map((s, i) => ({
    id: `f${n}-${i}`,
    ...s,
    circles: i === 0 ? [{ id: `f${n}-${i}-c0`, x: 0.42, y: 0.3, w: 0.16, h: 0.2 }] : [],
  }));

/* ------------------------------ CLI ------------------------------ */
const [modelArg, outArg] = process.argv.slice(2);
if (modelArg && outArg) {
  const model = JSON.parse(readFileSync(modelArg, 'utf8'));
  const r = await generateReport(template, model, devices);
  writeFileSync(outArg, r.bytes);
  console.log(`写出 ${outArg}　${(r.bytes.length / 1024).toFixed(0)} KB　${r.pages} 页`);
  console.log(`页序　${r.pageOrder.map((p) => p.replace('ppt/slides/', '')).join(' → ')}`);
  if (r.missing.length) console.log(`⚠ 未填占位符：${r.missing.join(', ')}`);
  r.warnings.forEach((w) => console.log(`⚠ ${w}`));
  process.exit(r.missing.length ? 1 : 0);
}

/* ---------------------------- 内置样张 ---------------------------- */
const emit = async (tag, model) => {
  const plan = planPages(model, devices);
  const r = await generateReport(template, model, devices);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(resolve(OUT_DIR, `${tag}.pptx`), r.bytes);
  console.log(`  → ${tag}.pptx　${(r.bytes.length / 1024).toFixed(0)} KB　${r.pages} 页　工站页 ${r.stationParts.length} 张　影像页 ${r.imageParts.length} 张　图片 ${r.mediaParts.length} 张　token ${r.used.length} 个`);
  console.log(`    页序：${plan.map((p) => p.label).join(' → ')}`);
  console.log(`    part：${r.pageOrder.map((p) => p.replace('ppt/slides/slide', '').replace('.xml', '')).join(',')}` +
    `${r.droppedShells.length ? `　删掉的壳：${r.droppedShells.map((p) => p.replace('ppt/slides/', '')).join(',')}` : ''}`);
  if (r.missing.length) console.log(`    ⚠ 未填：${r.missing.join(', ')}`);
  for (const w of r.warnings) console.log(`    ⚠ ${w}`);
  for (const st of model.stations) {
    const spec = buildSpecLines(st, devices);
    console.log(`    [${st.header}] ${st.cameraModel || '(空)'} + ${st.lensModel || '(空)'}　影像 ${(st.imageGroups ?? []).reduce((n, g) => n + g.pages.length, 0)} 页`);
    spec.lines.forEach((l, i) => console.log(`        ${i} ${l}`));
  }
  return r;
};

console.log('── 样张 1：2 工站 + 7 页影像（对应源报告 12 页结构；图片/坐标/红圈照搬源报告） ──');

const SRC_SLIDES = { 破損: [5, 6, 7, 8], 毛邊: [9, 10, 11] };

/** 源报告 7 页影像页的原文（复刻用）。
 * ⚠️ 源报告本身有笔误，这里**原样保留**，方便用户拿样张跟原稿逐页 diff：
 *    · slide10 的名称行写的是简体「打光影像-毛边」，同组的 slide09 却是「毛邊」
 *    · slide05 的说明第一行结尾多一个空格
 *    这两处是**源稿的问题**，不是生成器的 —— 工具只忠实搬运用户填进去的文字。
 *
 * 说明里的 `**…**` 是**本工具的红字标记**（源稿是人手涂红，没有标记可搬）：
 *   slide8 的「輕微 NG 無法看出」、slide11 的「需要改善乘坐」在源文件里都是 FF0000。
 *   标记本身不会印进 PPT（见 domain/xml.ts 的 TOKEN_RULES）。 */
const SRC_IMG = {
  破損: {
    5: ['打光影像-破損', ['QE提供不良樣品*4 ', '紅色標示即為不良位置', '目前破損形態較為明顯可以檢出']],
    6: ['打光影像-破損', []],
    7: ['打光影像-破損', []],
    8: ['打光影像-破損-特殊', ['端面密封圈結構特殊，內壁有兩處弧度区域', '正光下弧度區域發黑，相機無法清楚看清內壁，若有**輕微NG無法看出**']],
  },
  毛邊: {
    9: ['打光影像-毛邊', ['QE提供不良樣品*6', '紅色標示即為不良位置', '毛邊形態很多，輕微毛邊不易看出']],
    10: ['打光影像-毛边', []],
    11: ['打光影像-毛邊-特殊', ['直通接頭密封圈外徑53.3mm,玻璃乘坐內徑55mm', '若擺放位置不對，外測毛邊易被遮擋無法看出，**需要改善乘坐**']],
  },
};

/** 复刻源报告的一个缺陷组：页序、名称、说明、图片位置、红圈全部照搬 */
const replicaGroup = async (defect) => {
  const pages = [];
  for (const slide of SRC_SLIDES[defect]) {
    const [caption, desc] = SRC_IMG[defect][slide];
    const kind = caption.endsWith('-特殊') ? 'special' : 'plain';
    const p = page(kind, caption, desc);
    const slots = await slotsFromSource(slide);
    pages.push(slots ? { ...p, slots, autoLayout: false } : p);
  }
  return mk(defect, pages);
};

await emit('lighting-2stations-replica', {
  cover: ['液冷入料密封圈新增AI檢測', '評估報告'],
  requirement,
  stations: [
    stationWithLibraryLens('2.硬體設定-CCD1', { imageGroups: [await replicaGroup('破損')] }),
    stationWithUnknownLens({ imageGroups: [await replicaGroup('毛邊')] }),
  ],
});

console.log('\n── 样张 2：1 工站 + 1 组 2 页（验「起码一个」；两个影像壳各用一次；一个 4 图一个单图） ──');
await emit('lighting-1station', {
  cover: ['液冷入料密封圈新增AI檢測', '評估報告'],
  requirement,
  stations: [
    stationWithLibraryLens('2.硬體設定-CCD1', {
      imageGroups: [
        mk('破損', [
          { ...page('plain', '打光影像-破損', ['QE提供不良樣品*4', '紅色標示即為不良位置']), slots: filler(4) },
          { ...page('special', '打光影像-破損-特殊', ['端面密封圈結構特殊，內壁有兩處弧度区域']), slots: filler(1) },
        ]),
      ],
    }),
  ],
});

console.log('\n── 样张 3：3 工站，第 3 站带 3 页影像（验克隆：工站页与影像页都要克隆；图片 4/2/1 张） ──');
await emit('lighting-3stations', {
  cover: ['液冷入料密封圈新增AI檢測', '評估報告'],
  requirement,
  stations: [
    stationWithLibraryLens('2.硬體設定-CCD1'),
    { ...stationWithLibraryLens('2.硬體設定-CCD2（替換鐳射工站）'), lensModel: 'DTCM110-100-AL', measured: {} },
    {
      ...stationWithLibraryLens('2.硬體設定-CCD3（新增側面工站）'),
      lensModel: 'DTCM110-136-AL',
      measured: {},
      marks: { mark228: findLens(devices, 'DTCM110-136-AL')?.workingDistanceMm ?? 258, mark100: 100, mark80: 80, mark30_100: '30-100' },
      imageGroups: [
        mk('破損', [
          { ...page('plain', '打光影像-破損', ['QE提供不良樣品*4', '紅色標示即為不良位置']), slots: filler(4) },
          { ...page('plain', '打光影像-破損', []), slots: filler(2) },
          { ...page('special', '打光影像-破損-特殊', ['內壁弧度區域正光下發黑']), slots: filler(1) },
        ]),
      ],
    },
  ],
});

console.log('\n── 样张 4：封面 + 换一套产品尺寸 + 全部工站设备一起换 + 长缺陷名（验标题条自适应） ──');
const DEMO_REQ = { lines: ['機箱把手密封圈內徑/外徑', '42±0.05'], image: null };
const demoStation = (header, cam, lens, items, flags, imageGroups = [], extra = {}) => ({
  id: header,
  header,
  cameraModel: cam,
  lensModel: lens,
  lightSource1: 'LT-24V-100RT15-W',
  lightSource2: 'LT-24V-80PF80-W',
  inspectionItems: items,
  newFlags: flags,
  marks: { mark228: findLens(devices, lens)?.workingDistanceMm ?? '', mark100: 100, mark80: 80, mark30_100: '30-100' },
  measured: {},
  imageGroups,
  requireLead: '最大值徑42mm，最大厚度5.2mm',
  toleranceMm: 0.05,
  toleranceStyle: 'pm',
  lensKind: '遠心鏡頭',
  ...extra,
});
await emit('lighting-demo-swap', {
  cover: ['機箱把手密封圈新增AI檢測', '評估報告'],
  requirement: DEMO_REQ,
  stations: [
    demoStation('2.硬體設定-CCD1（新案子）', 'MV-CH250-20XC-M58S-NN', 'DTCM110-136-AL', ['內徑', '外徑', '毛邊'], ['camera', 'lens', 'light1', 'light2', 'items'], [
      mk('異色斑點', [
        { ...page('plain', '打光影像-異色斑點', ['表面異色斑點分佈較散，需要逐張比對']), slots: filler(3) },
      ]),
      mk('刮傷', [
        { ...page('special', '打光影像-刮傷-特殊', ['刮傷方向與光軸平行時反光弱']), slots: filler(1) },
      ]),
    ]),
    demoStation('2.硬體設定-CCD2（背面檢測）', 'MV-CH240-10TM-C-NN', 'DTCM110-90-AL', ['破損', '尺寸'], ['camera', 'lens'], [
      mk('破損', [
        { ...page('plain', '打光影像-破損', ['背面破損以暗場觀察為主']), slots: filler(2) },
      ]),
    ]),
  ],
});

console.log('\n── 样张 5：换 CCD1 镜头 DTCM110-80H-AL → DTCM110-100-AL（验参数化；两站都填满） ──');
await emit('lighting-lens-swap', {
  cover: ['液冷入料密封圈新增AI檢測', '評估報告'],
  requirement,
  stations: [
    {
      ...stationWithLibraryLens('2.硬體設定-CCD1'),
      lensModel: 'DTCM110-100-AL',
      measured: {},
      marks: { mark228: findLens(devices, 'DTCM110-100-AL')?.workingDistanceMm ?? 258, mark100: 100, mark80: 80, mark30_100: '30-100' },
      imageGroups: [
        mk('破損', [
          { ...page('plain', '打光影像-破損', ['QE提供不良樣品*4', '紅色標示即為不良位置']), slots: filler(2) },
        ]),
      ],
    },
    stationWithUnknownLens({
      imageGroups: [mk('破損', [{ ...page('special', '打光影像-破損-特殊', ['內壁弧度區域正光下發黑']), slots: filler(1) }])],
    }),
  ],
});

console.log('\n提示：【1.檢測需求】的文字与贴图已能生成（本轮）；【4.結論】是结构化四块，还没做；箭头连接符（源报告 slides 6/7/8）本版不生成。');
