/**
 * 06 打光报告生成器 — 门禁自检
 *
 * 这个脚本存在的理由：06 的产物是一个 ZIP 包（pptx），「算对了」和「打开是好的」
 * 是两件独立的事。改模板预处理或生成逻辑后，只有这里能拦住：
 *   · part 注销漏了一处 → WPS 报「文件已损坏」
 *   · 克隆页少注册一处（Content_Types / rels / sldIdLst / app.xml）→ 页数不对或直接打不开
 *   · 页序错乱 → 打光影像页跑到工站页前面（这种错在 PPT 里只能靠人肉翻页发现）
 *   · 影像壳没清干净 → 生成出来的「空白影像页」印着上一个案子的缺陷照片
 *   · 用不到的壳没删 → 文件里多出几页空白蓝条
 *   · run 切分写错 → 版式对了但 (新增) 不红了 / 整段串成一行
 *   · 占位符漏填 → 静默出一份带 {{xxx}} 的半成品
 *
 * ⚠️ 门禁直接 import src/lighting-report/domain/*.ts —— 浏览器里的工具跑的是**同一份代码**。
 *    Node 22 原生类型剥离 + 显式 .ts 扩展名，不需要编译、不需要 loader。
 *    这样就不存在「命令行对了、界面对不上」这种漂移。
 *
 * 用法：npm run verify:lighting-report
 */
import { createRequire } from 'node:module';
import { readFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, posix } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { generateReport } from '../src/lighting-report/domain/generate.ts';
import {
  buildSpecLines,
  buildRequireLines,
  emptyImageGroup,
  emptyImagePage,
  emptyRequirement,
  findCamera,
  findLens,
  imageTokens,
  parseDeviceSelection,
} from '../src/lighting-report/domain/spec.ts';
import { estimateTitleBarWidthPt, findShapeIdByToken, textWidthPt } from '../src/lighting-report/domain/layout.ts';
import { planPages, pageStats } from '../src/lighting-report/domain/plan.ts';
import { pickFreeSlideIndex } from '../src/lighting-report/domain/surgery.ts';
import {
  DEFAULT_TEMPLATE_ID,
  SEALING_FAMILY,
  TEMPLATE_FAMILIES,
  TEMPLATE_IDS,
  TEMPLATE_LAYOUT,
  TEMPLATE_SHELLS,
  getFamily,
} from '../src/lighting-report/domain/template-layout.ts';

const require = createRequire(import.meta.url);
const JSZip = require('jszip');

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = resolve(HERE, '..');
const ASSETS = resolve(PROJECT, 'src/lighting-report/assets');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? '　→ ' + extra : ''}`); }
};
const section = (t) => console.log(`\n${t}`);

const TEMPLATE = resolve(ASSETS, 'template.pptx');
const MANIFEST = resolve(ASSETS, 'placeholders.json');

if (!existsSync(TEMPLATE) || !existsSync(MANIFEST)) {
  console.log('SKIP 模板产物不存在。先跑：\n  node scripts/lighting-report/build-template.mjs "<源报告.pptx>"');
  process.exit(0);
}

const tplBuf = readFileSync(TEMPLATE);
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const MANIFEST_KEYS = [...new Set(manifest.placeholders.map((p) => p.key))];
const devices = {
  cameras: JSON.parse(readFileSync(resolve(PROJECT, 'src/fov/data/cameras.json'), 'utf8')),
  lenses: JSON.parse(readFileSync(resolve(PROJECT, 'src/fov/data/lenses.json'), 'utf8')),
};

/** 相对 rels 的 Target 解析成包内绝对路径 */
function resolveTarget(relsName, target) {
  if (/^(https?:|file:|mailto:|#)/i.test(target)) return null;
  const base = posix.dirname(posix.dirname(relsName.replace(/\\/g, '/')));
  return posix.normalize(posix.join(base, target.replace(/^\//, '')));
}

/** 按 sldIdLst 真实顺序取出页序（part 序号数组） */
async function pageOrderOf(zip) {
  const pres = await zip.file('ppt/presentation.xml').async('text');
  const prels = await zip.file('ppt/_rels/presentation.xml.rels').async('text');
  const rid2t = {};
  for (const m of prels.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]+)"/g)) rid2t[m[1]] = m[2];
  return [...pres.matchAll(/<p:sldId id="\d+" r:id="(rId\d+)"\/>/g)].map((m) => {
    const target = rid2t[m[1]] ?? '';
    const n = /slides\/slide(\d+)\.xml$/.exec(target);
    return n ? Number(n[1]) : target;
  });
}

/** 包内一致性：部件 / Override / rels / sldId / app 计数必须闭合 */
async function packageIntegrity(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  const ct = await zip.file('[Content_Types].xml').async('text');
  const app = (await zip.file('docProps/app.xml')?.async('text')) ?? '';
  const parts = names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  const overrides = [...ct.matchAll(/PartName="\/ppt\/slides\/(slide\d+\.xml)"/g)].map((m) => `ppt/slides/${m[1]}`);
  const order = await pageOrderOf(zip);
  const appSlides = Number(/<Slides>(\d+)<\/Slides>/.exec(app)?.[1] ?? -1);
  const tof = /<TitlesOfParts><vt:vector size="(\d+)"[^>]*>([\s\S]*?)<\/vt:vector><\/TitlesOfParts>/.exec(app);
  const vecSize = Number(tof?.[1] ?? -1);
  // 只数 TitlesOfParts 向量里的条目；HeadingPairs 里那 3 个 lpstr（字体/主题/幻灯片标题）不算
  const vecItems = tof ? [...tof[2].matchAll(/<vt:lpstr>[\s\S]*?<\/vt:lpstr>/g)].length : -1;
  const titleCount = Number(/<vt:lpstr>幻灯片标题<\/vt:lpstr><\/vt:variant><vt:variant><vt:i4>(\d+)<\/vt:i4>/.exec(app)?.[1] ?? -1);

  const sldIds = [...(await zip.file('ppt/presentation.xml').async('text')).matchAll(/<p:sldId id="(\d+)"/g)].map((m) => Number(m[1]));

  let dangling = [];
  for (const n of names.filter((x) => x.endsWith('.rels'))) {
    const r = await zip.file(n).async('text');
    for (const m of r.matchAll(/<Relationship [^>]*Target="([^"]+)"[^>]*\/>/g)) {
      const t = resolveTarget(n, m[1]);
      if (t && !names.includes(t)) dangling.push(`${n} → ${m[1]}`);
    }
  }
  const noRels = parts.filter((p) => !names.includes(p.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels'));

  /** 媒体是否还被某处引用（回收后不该有孤儿，也不该有悬空） */
  const media = names.filter((n) => /^ppt\/media\//.test(n));

  return {
    zip, names, parts, overrides, order, appSlides, titleCount, vecSize, vecItems, dangling, noRels, media,
    sldIds, sldIdsUnique: new Set(sldIds).size === sldIds.length,
    sizes: { parts: parts.length, overrides: overrides.length, order: order.length },
  };
}

const partNo = (p) => Number(/slide(\d+)\.xml$/.exec(p)[1]);

/* ============================ A. 模板完整性 ============================ */
section('A. 模板完整性（归一化成 6 个壳 + part 注销闭合）');
{
  const zip = await JSZip.loadAsync(tplBuf);
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  const parts = names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));

  ok('不含 notesSlides 部件', !names.some((n) => n.startsWith('ppt/notesSlides/')));
  const ct = await zip.file('[Content_Types].xml').async('text');
  ok('[Content_Types].xml 无 notesSlides Override', !/notesSlides/.test(ct));
  const prels = await zip.file('ppt/_rels/presentation.xml.rels').async('text');
  ok('presentation.xml.rels 无 notesSlide 关系', !/notesSlide/i.test(prels));

  const order = await pageOrderOf(zip);
  ok('模板归一化成 6 页（源报告 12 页 → 6 个壳）', order.length === 6, `实际 ${order.length}`);
  ok('manifest 的 layout 与 domain/template-layout.ts 一致（唯一真相源没漂）',
    JSON.stringify(manifest.layout) === JSON.stringify(TEMPLATE_LAYOUT),
    JSON.stringify(manifest.layout));
  ok('模板页序 = layout.cover/requirement/station/imagePlain/imageSpecial/conclusion',
    order.join(',') === TEMPLATE_SHELLS.map(partNo).join(','),
    `${order.join(',')} vs ${TEMPLATE_SHELLS.map(partNo).join(',')}`);
  ok('工站壳是 ppt/slides/slide3.xml', manifest.stationPage?.part === TEMPLATE_LAYOUT.station, manifest.stationPage?.part);
  ok('工站壳在 sldIdLst 的第 2 位（封面 0、需求 1）', manifest.stationPage?.sldIdLstIndex === 2, String(manifest.stationPage?.sldIdLstIndex));

  for (const n of [4, 6, 7, 9, 10, 11]) {
    const part = `ppt/slides/slide${n}.xml`;
    ok(`被删页 ${part} 已从包内彻底消失（part / rels / Override / sldId 四处都注销）`,
      !names.includes(part) && !names.includes(`ppt/slides/_rels/slide${n}.xml.rels`) &&
      !new RegExp(`PartName="/${part.replace(/\//g, '\\/')}"`).test(ct),
      part);
  }

  const integrity = await packageIntegrity(tplBuf);
  ok('模板包内计数闭合（parts = Override = sldId = app.xml）',
    integrity.parts.length === integrity.overrides.length &&
    integrity.overrides.length === integrity.order.length &&
    integrity.order.length === integrity.appSlides,
    JSON.stringify(integrity.sizes));
  ok('模板没有悬空关系目标', integrity.dangling.length === 0, integrity.dangling.slice(0, 3).join(' | '));
  ok('模板每张 slide 都有独立 _rels', integrity.noRels.length === 0, integrity.noRels.join(','));
  ok('模板 sldId 无重复', integrity.sldIdsUnique, integrity.sldIds.join(','));

  // 占位符对账
  const perPart = new Map();
  for (const name of parts) perPart.set(name, await zip.file(name).async('text'));
  const badCount = [], stray = [];
  for (const ph of manifest.placeholders) {
    const xml = perPart.get(`ppt/slides/slide${ph.part}.xml`) ?? '';
    const hits = xml.split(`{{${ph.key}}}`).length - 1;
    if (hits !== 1) badCount.push(`${ph.key}@slide${ph.part}×${hits}`);
  }
  ok(`manifest 的 ${manifest.placeholders.length} 个占位符在模板里各出现 1 次`, badCount.length === 0, badCount.join(','));
  const known = new Set(manifest.placeholders.map((p) => p.key));
  for (const [, xml] of perPart) {
    for (const m of xml.matchAll(/\{\{([A-Za-z0-9_.]+)\}\}/g)) if (!known.has(m[1])) stray.push(m[1]);
  }
  ok('模板里没有 manifest 之外的野占位符', stray.length === 0, stray.join(','));
  ok('工站壳 token 统一用 st.* 前缀',
    manifest.placeholders.filter((p) => p.part === partNo(TEMPLATE_LAYOUT.station)).every((p) => p.key.startsWith('st.')),
    manifest.placeholders.filter((p) => p.part === partNo(TEMPLATE_LAYOUT.station)).map((p) => p.key).join(','));
  ok('影像壳 token 统一用 img.* 前缀，且两个壳共用同一套 key',
    manifest.placeholders.filter((p) => p.key.startsWith('img.')).length === 6,
    manifest.placeholders.filter((p) => p.key.startsWith('img.')).map((p) => `s${p.part}:${p.key}`).join(','));
  ok('源文件 sha256 已冻结', /^[0-9a-f]{64}$/.test(manifest.builtFromSha256 ?? ''));

  /* ---- 影像壳必须干净：源报告的图 / 红圈 / 箭头一个都不能留 ---- */
  for (const [kind, part] of [['plain', TEMPLATE_LAYOUT.imagePlain], ['special', TEMPLATE_LAYOUT.imageSpecial]]) {
    const xml = perPart.get(part) ?? '';
    const pics = (xml.match(/<p:pic>/g) ?? []).length;
    const conns = (xml.match(/<p:cxnSp>/g) ?? []).length;
    const ellipses = (xml.match(/prst="ellipse"/g) ?? []).length;
    const sps = (xml.match(/<p:sp>/g) ?? []).length;
    ok(`${kind} 影像壳清空了源报告的图片 / 红圈 / 箭头（pic=${pics} cxnSp=${conns} ellipse=${ellipses}）`,
      pics === 0 && conns === 0 && ellipses === 0, `${part}`);
    ok(`${kind} 影像壳只剩骨架 shape（${kind === 'special' ? '标题条 + 名称说明框 + ↓' : '标题条 + 名称说明框'}）`,
      sps === (kind === 'special' ? 3 : 2), `${sps} 个`);
  }

  const plainXml = perPart.get(TEMPLATE_LAYOUT.imagePlain) ?? '';
  const specialXml = perPart.get(TEMPLATE_LAYOUT.imageSpecial) ?? '';

  /* ---- 需求壳必须干净：源报告那 4 张产品照 + 4 个名称标签 + 引线矩形一个都不能留 ---- */
  {
    const xml = perPart.get(TEMPLATE_LAYOUT.requirement) ?? '';
    const pics = (xml.match(/<p:pic>/g) ?? []).length;
    const sps = (xml.match(/<p:sp>/g) ?? []).length;
    ok('需求壳清空了源报告的产品照与名称标签（pic=0，只剩标题条 + 文字框）',
      pics === 0 && sps === 2, `pic=${pics} sp=${sps}`);
    const reqParas = [...xml.matchAll(/<a:p>[\s\S]*?<\/a:p>/g)].map((m) =>
      [...m[0].matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map((z) => z[1]).join(''));
    ok('需求壳保留了「1.檢測需求」标题条原文',
      reqParas.some((l) => l.trim() === '1.檢測需求'), reqParas.join(' | '));
    ok('需求壳的文字框已占位符化（req.lines）',
      [...xml.matchAll(/<a:p>[\s\S]*?<\/a:p>/g)].some((m) => /^\{\{req\.lines\}\}$/.test(
        [...m[0].matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map((z) => z[1]).join('').trim())));
    ok('manifest 记录了需求壳清了几个 shape',
      typeof manifest.requireShell?.removedShapes === 'number' && manifest.requireShell.removedShapes > 0,
      JSON.stringify(manifest.requireShell));
    ok('需求壳 token 用 req.* 前缀',
      manifest.placeholders.filter((p) => p.part === partNo(TEMPLATE_LAYOUT.requirement)).every((p) => p.key.startsWith('req.')),
      manifest.placeholders.filter((p) => p.part === partNo(TEMPLATE_LAYOUT.requirement)).map((p) => p.key).join(','));
  }

  const parasOf = (xml) => {
    const sp = /<p:sp>[\s\S]*?<\/p:sp>/g.exec(xml)?.[0] ?? '';
    return [...xml.matchAll(/<a:p>[\s\S]*?<\/a:p>/g)].map((m) => [...m[0].matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map((z) => z[1]).join(''));
  };
  const plainParas = parasOf(plainXml);
  ok('影像壳的「名称行 + 说明行」是两段、各有自己的 token',
    plainParas.includes('{{img.caption}}') && plainParas.includes('{{img.desc}}'),
    plainParas.join(' | '));
  ok('名称行保住 Wingdings 箭头 bullet，说明行保住 Arial • + marL 缩进',
    /buFont typeface="Wingdings"/.test(plainXml) && /buChar char="•"/.test(plainXml) && /marL="431800"/.test(plainXml));
  ok('特殊壳保留 ↓ 标注（是特殊版式的一部分）', specialXml.includes('↓'));

  ok('标题 shape 能由 token 自身定位（不写死 id）',
    findShapeIdByToken(perPart.get(TEMPLATE_LAYOUT.station) ?? '', 'st.header') === '10241',
    String(findShapeIdByToken(perPart.get(TEMPLATE_LAYOUT.station) ?? '', 'st.header')));

  /* ---- 媒体回收 ---- */
  ok(`媒体已回收（留 ${manifest.media?.kept} 张，删 ${manifest.media?.removed?.length} 张）`,
    (manifest.media?.removed?.length ?? 0) > 0 && integrity.media.length === manifest.media?.kept,
    `包内实有 ${integrity.media.length}`);
  ok('模板体积已瘦下来（< 800 KB；P2a 前是 5212 KB）',
    tplBuf.length < 800 * 1024, `${(tplBuf.length / 1024).toFixed(0)} KB`);
}

/* ========================= B. 填充行为契约 ============================ */
section('B. 填充行为（真值来自源报告，逐字符比对）');

const GOLDEN_SPEC_S3 = [
  'CCD： MV-CH250-90UC(新增)',
  'Sensor Size：25M/ fps=14.3',
  'Lens ： DTCM110-80H-AL',
  'FOV：61.54*61.54mm',
  'DOF：±5.92mm (±14.8mm*40%=5.92mm)',
  'Resolution：0.01202mm/pixel',
  'Lens Resolution：0.02mm/pixel',
  '光源1： LT-24V-120RT15-W(新增)',
  '光源2： LT-24V-91PF91-W(新增)',
  '檢測項目：內徑,外徑,毛邊,破損(新增)',
];

/**
 * 【1.檢測需求】页的内容（用户 2026-09-30 定的模型：文字 + 可选一张图，不是字段体系）。
 * 相机像素 / 彩色 / 镜头类型**不在**这里 —— 那些搬到逐工站的「需求推导」去了。
 */
const requirement = { lines: ['密封圈內徑/厚度', '6.7±0.03'], image: null };

const ccd1 = () => ({
  id: 'ccd1',
  header: '2.硬體設定-CCD1',
  cameraModel: 'MV-CH250-90UC', lensModel: 'DTCM110-80H-AL',
  lightSource1: 'LT-24V-120RT15-W', lightSource2: 'LT-24V-91PF91-W',
  inspectionItems: ['內徑', '外徑', '毛邊', '破損'],
  newFlags: ['camera', 'light1', 'light2', 'items'],
  marks: { mark228: 228, mark100: 100, mark80: 80, mark30_100: '30-100' },
  measured: { fps: 14.3, lensResolutionMmPerPixel: 0.02 },
  requireLead: '最大值徑53.3mm，最大厚度6.7mm',
  toleranceMm: 0.08,
  toleranceStyle: 'pm',
  lensKind: '遠心鏡頭',
});
const ccd2 = () => ({
  id: 'ccd2',
  header: '2.硬體設定-CCD2（替換鐳射工站）',
  cameraModel: 'MV-CH250-90UC', lensModel: 'XF-10MDT0209X200-1C',
  lightSource1: 'LT-24V-120RT15-W', lightSource2: 'LT-24V-91PF91-W',
  inspectionItems: ['內徑', '外徑', '毛邊', '破損'],
  newFlags: [],
  marks: { mark228: 228, mark100: 100, mark80: 80, mark30_100: '30-100' },
  measured: {
    fps: 14.3, magnification: 0.209, fovWidthMm: 61.24, fovHeightMm: 61.24,
    resolutionMmPerPixel: 0.01196, dofNominalMm: 19, lensResolutionMmPerPixel: 0.0252,
  },
  requireLead: '最大值徑53.3mm，最大厚度6.7mm',
  toleranceMm: 0.08,
  toleranceStyle: 'pm',
  lensKind: '遠心鏡頭',
});

/** 源报告 slide3（CCD1）的需求推导 4 行 —— 逐字符真值 */
const GOLDEN_REQUIRE_S3 = [
  '最大值徑53.3mm，最大厚度6.7mm',
  '最小公差±0.08mm，公差帶=0.16',
  '理想系統解析度=1/8~1/10  → 0.016~0.02mm',
  '選用25M Camera彩色相機 + 0.208x 遠心鏡頭可符合產品需求',
];
/** 源报告 slide4（CCD2）：同 4 行，只有倍率是 0.209（库外镜头走人工填的倍率） */
const GOLDEN_REQUIRE_S4_LAST = '選用25M Camera彩色相機 + 0.209x 遠心鏡頭可符合產品需求';

/** 影像页 / 缺陷分组的小工具（与 UI 用的是同一份 helper） */
const imgPage = (kind, caption, desc = []) => ({ ...emptyImagePage(caption, kind), kind, caption, desc });
const imgGroup = (defect, pages) => ({ ...emptyImageGroup(), defect, pages });
const SRC_IMG_PLAIN = ['plain', '打光影像-破損', ['QE提供不良樣品*4 ', '紅色標示即為不良位置', '目前破損形態較為明顯可以檢出']];
const SRC_IMG_SPECIAL = ['special', '打光影像-破損-特殊', ['端面密封圈結構特殊，內壁有兩處弧度区域', '正光下弧度區域發黑，相機無法清楚看清內壁，若有**輕微NG無法看出**']];

const model2 = () => ({ cover: ['液冷入料密封圈新增AI檢測', '評估報告'], requirement, stations: [ccd1(), ccd2()] });

const r2 = await generateReport(tplBuf, model2(), devices);
{
  const zip = await JSZip.loadAsync(r2.bytes);
  const s3 = await zip.file(TEMPLATE_LAYOUT.station).async('text');
  const s2 = await zip.file(TEMPLATE_LAYOUT.requirement).async('text');

  ok('填充后无残留占位符', !/\{\{/.test(s3) && !/\{\{/.test(s2), (s3 + s2).match(/\{\{[^}]*\}\}/)?.[0]);
  ok('无未填报告', r2.missing.length === 0, r2.missing.join(','));
  ok('无影像段时，两个影像壳都被删掉（不留空白蓝条页）',
    r2.droppedShells.length === 2 && r2.imageParts.length === 0, r2.droppedShells.join(','));

  const paraText = (p) => [...p.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map((m) => m[1]).join('');
  const parasOf = (xml) => [...xml.matchAll(/<a:p>[\s\S]*?<\/a:p>/g)].map((m) => paraText(m[0]));

  /* 【1.檢測需求】页：文字按行展开成 N 段，段属性继承模板 */
  const reqParas = parasOf(s2).filter((l) => l.trim());
  ok('需求页文字按行展开成 2 段（req.lines 是数组 → 一行一段）',
    reqParas.join(' | ') === '1.檢測需求 | 密封圈內徑/厚度 | 6.7±0.03', reqParas.join(' | '));
  ok('需求页不再残留源报告的产品照与名称标签（pic=0，只剩标题条 + 文字框两段）',
    (s2.match(/<p:pic>/g) ?? []).length === 0 && reqParas.length === 3,
    `pic=${(s2.match(/<p:pic>/g) ?? []).length} paras=${reqParas.length}`);

  const paras = parasOf(s3);
  const firstAt = paras.findIndex((l) => l === GOLDEN_SPEC_S3[0]);
  const block = firstAt >= 0 ? paras.slice(firstAt, firstAt + GOLDEN_SPEC_S3.length) : [];
  const mismatchAt = GOLDEN_SPEC_S3.findIndex((g, i) => block[i] !== g);
  ok('CCD1 规格 10 行与源报告逐字符一致，且是连续 10 段（无夹行/乱序）',
    firstAt >= 0 && mismatchAt === -1,
    `起始段 ${firstAt}；第 ${mismatchAt} 行不符：「${block[mismatchAt] ?? '（缺）'}」应为「${GOLDEN_SPEC_S3[mismatchAt] ?? ''}」`);

  /* 需求推导 4 行：**逐工站**生成（用户 2026-09-30 定），CCD1 这份与源报告 slide3 逐字符一致 */
  const reqBlock = paras.slice(firstAt + GOLDEN_SPEC_S3.length, firstAt + GOLDEN_SPEC_S3.length + 4);
  const reqMismatch = GOLDEN_REQUIRE_S3.findIndex((g, i) => reqBlock[i] !== g);
  ok('CCD1 需求推导 4 行紧随 spec 之后且逐字符一致（相机像素来自本站型号）',
    firstAt >= 0 && reqMismatch === -1,
    `第 ${reqMismatch} 行不符：「${reqBlock[reqMismatch] ?? '（缺）'}」应为「${GOLDEN_REQUIRE_S3[reqMismatch] ?? ''}」`);
  ok('需求推导用的是本站相机像素（25M 识别自 MV-CH250-90UC），不是全局需求段的字段',
    reqBlock[3]?.startsWith('選用25M Camera'), reqBlock[3]);

  const redRuns = [...s3.matchAll(/<a:r>[\s\S]*?<\/a:r>/g)].map((m) => m[0]).filter((r) => /FF0000/.test(r));
  ok('红色 run 恰好 4 个且都是 (新增)',
    redRuns.length === 4 && redRuns.every((r) => /<a:t(?:\s[^>]*)?>\(新增\)<\/a:t>/.test(r)),
    redRuns.map((r) => (/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/.exec(r) ?? [, ''])[1]).join(' | '));
  ok('每个红色 run 都带 b="1"', redRuns.length > 0 && redRuns.every((r) => /\sb="1"/.test(r)));
  ok('每个红色 run 的 solidFill 排在 latin 之前（schema 顺序对）',
    redRuns.every((r) => r.indexOf('<a:solidFill>') < r.indexOf('<a:latin')));
  ok('红色 run 保留了模板原本的字号字体', redRuns.every((r) => /sz="1600"/.test(r) && /標楷體/.test(r)));

  ok('段落属性继承：spec 块仍是 • bullet', /buChar char="•"/.test(s3));
  ok('段落属性继承：require 块仍是 Wingdings 箭头 bullet', /buFont typeface="Wingdings"/.test(s3));
  ok('段落属性继承：行距 150% 仍在', /<a:lnSpc><a:spcPct val="150000"\/><\/a:lnSpc>/.test(s3));
}

/* ==================== C. 负向：漏填必须露出来 ==================== */
section('C. 负向契约（漏填不可静默）');
{
  // 只把**第 2 个**工站的 header 拿掉 —— 第 2 个工站是克隆页，
  // 所以残留的 {{st.header}} 应该出现在克隆页上，而第 1 页干干净净。
  const broken = model2();
  delete broken.stations[1].header;
  const r = await generateReport(tplBuf, broken, devices);
  const zip = await JSZip.loadAsync(r.bytes);
  const clone = await zip.file(r.stationParts[1]).async('text');
  const first = await zip.file(r.stationParts[0]).async('text');

  ok('漏填的 token 原样留在文件里（可在 PPT 上看见）', clone.includes('{{st.header}}'), r.stationParts[1]);
  ok('漏填被报告出来，且只报这一个', r.missing.join(',') === 'st.header', r.missing.join(','));
  ok('同一个 token 在别的页填好了（不是整页放弃）', !first.includes('{{'), (first.match(/\{\{[^}]*\}\}/) ?? [])[0]);
  ok('第 1 页的 header 照常填上，没被连累', first.includes('2.硬體設定-CCD1'));
}

/* ==================== D. 参数化真的生效（换镜头） ==================== */
section('D. 参数化生效（只换镜头，看数字是否跟着动）');
{
  const st = { ...ccd1(), lensModel: 'DTCM110-100-AL', measured: {} };
  const spec = buildSpecLines(st, devices);
  ok('换镜头后 FOV 变了（61.54 → 77.11）', spec.lines[3] === 'FOV：77.11*77.11mm', spec.lines[3]);
  ok('换镜头后 DOF 变了（5.92 → 9.28）', spec.lines[4] === 'DOF：±9.28mm (±23.2mm*40%=9.28mm)', spec.lines[4]);
  ok('去掉 fps 人工覆盖后回落到库值 14', spec.lines[1] === 'Sensor Size：25M/ fps=14', spec.lines[1]);
  ok('库外镜头会给出告警', buildSpecLines(ccd2(), devices).warnings.some((w) => /不在设备库/.test(w)));
  ok('fps 人工覆盖会留痕', buildSpecLines(ccd1(), devices).warnings.some((w) => /fps 人工覆盖/.test(w)));
  ok('DOF 折减因子可配（0.4 → 0.3 立刻反映）', buildSpecLines({ ...ccd1(), dofDerateFactor: 0.3 }, devices).lines[4].includes('*30%='));

  /* 需求推导那 4 行是**逐工站**的：公差 / 检测说明 / 镜头类型 / 彩色都取自本站 */
  const reqLines = (over = {}, mag = 0.208) => {
    const station = { ...ccd1(), ...over };
    return buildRequireLines(station, findCamera(devices, station.cameraModel), mag);
  };
  ok('需求行「理想系統解析度」在源案公差带下逐字符一致（0.016~0.02）',
    reqLines()[2] === '理想系統解析度=1/8~1/10  → 0.016~0.02mm', reqLines()[2]);
  ok('窄公差带下不会打出 0.01~0.01mm（自动加精度）',
    reqLines({ toleranceMm: 0.05 }, 0.122)[2] === '理想系統解析度=1/8~1/10  → 0.01~0.0125mm',
    reqLines({ toleranceMm: 0.05 }, 0.122)[2]);
  ok('公差帶用 trim（0.16 不是 0.1600）', reqLines()[1] === '最小公差±0.08mm，公差帶=0.16', reqLines()[1]);
  ok('公差写法可切「公差帶」档（四合一族那种写法）',
    reqLines({ toleranceStyle: 'band', toleranceMm: 0.1 })[1] === '最小公差帶 0.1mm',
    reqLines({ toleranceStyle: 'band', toleranceMm: 0.1 })[1]);
  ok('没有公差就不生成公差行与解析度行（只剩「選用…」一行）',
    reqLines({ toleranceMm: null, requireLead: '' }).length === 1 &&
    reqLines({ toleranceMm: null, requireLead: '' })[0].startsWith('選用'),
    reqLines({ toleranceMm: null, requireLead: '' }).join(' | '));
  ok('没有公差但有检测说明 → 说明单独成行（源报告 CCD4 那种写法）',
    reqLines({ toleranceMm: null, requireLead: '', inspectNote: '一次檢測1pcs' })[0] === '一次檢測1pcs',
    reqLines({ toleranceMm: null, requireLead: '', inspectNote: '一次檢測1pcs' }).join(' | '));
  ok('整块覆盖时完全不自动生成（源报告里有超出任何模板的写法）',
    reqLines({ requireOverride: ['檢測範圍：一次量測2pcs產品', '選用5M Camera + CCTV鏡頭可符合需求'] }).join(' | ') ===
      '檢測範圍：一次量測2pcs產品 | 選用5M Camera + CCTV鏡頭可符合需求',
    reqLines({ requireOverride: ['檢測範圍：一次量測2pcs產品', '選用5M Camera + CCTV鏡頭可符合需求'] }).join(' | '));
  ok('相机黑白/镜头类型都进「選用…」那句',
    reqLines({ colorCamera: false, lensKind: 'CCTV鏡頭' })[3] === '選用25M Camera黑白相機 + 0.208x CCTV鏡頭可符合產品需求',
    reqLines({ colorCamera: false, lensKind: 'CCTV鏡頭' })[3]);
  ok('相机型号不在库时像素留空（不瞎猜）',
    reqLines({ cameraModel: '不存在的相機' })[3] === '選用—M Camera彩色相機 + 0.208x 遠心鏡頭可符合產品需求',
    reqLines({ cameraModel: '不存在的相機' })[3]);
  ok('前置行留空时不出空行', reqLines({ requireLead: '' })[0] === '最小公差±0.08mm，公差帶=0.16', reqLines({ requireLead: '' })[0]);

  // FOV/Resolution 必须走 03 的 calculateFov —— 同口径的两个数值一起验
  const geo = buildSpecLines(ccd1(), devices).derived;
  ok('FOV 走 03 的 calculateFov（= 传感器宽 12.8 / 倍率 0.208）',
    Math.abs(geo.fovWidthMm - 12.8 / 0.208) < 1e-9, String(geo.fovWidthMm));
  ok('Resolution 走 03 的 mmPerPixelX（= FOV / 5120）',
    Math.abs(geo.resolutionMmPerPixel - (12.8 / 0.208) / 5120) < 1e-12, String(geo.resolutionMmPerPixel));

  // 从 03 带入的解析
  const parsed = parseDeviceSelection('CCD：MV-CH250-90UC\nLens：DTCM110-80H-AL\nFOV：61.54 × 61.54 mm\nResolution：0.01202 mm/pixel\nfps=14.3', devices);
  ok('能从 03 报告文本认出发相机与镜头', parsed.cameraModel === 'MV-CH250-90UC' && parsed.lensModel === 'DTCM110-80H-AL',
    JSON.stringify(parsed.matched));
  ok('能顺手认出 fps / FOV / Resolution', parsed.measured.fps === 14.3 && parsed.measured.fovWidthMm === 61.54 && parsed.measured.resolutionMmPerPixel === 0.01202,
    JSON.stringify(parsed.measured));
  ok('认不出的型号返回 undefined（留人工填，绝不瞎猜）', parseDeviceSelection('CCD：某不存在的相机', devices).cameraModel === undefined);
}

/* ==================== E. 工站数量 → 克隆 ==================== */
section('E. 工站增删（克隆页必须四件事齐全）');
{
  ok('空工站列表会被拒绝', await generateReport(tplBuf, { ...model2(), stations: [] }, devices).then(() => false, () => true));
  ok('复用空号：模板里空出来的最小序号是 4', pickFreeSlideIndex([1, 2, 3, 5, 8, 12]) === 4);

  const cases = [
    { n: 1, pages: 4, order: '1,2,3,12', parts: ['ppt/slides/slide3.xml'] },
    { n: 2, pages: 5, order: '1,2,3,4,12', parts: ['ppt/slides/slide3.xml', 'ppt/slides/slide4.xml'] },
    { n: 3, pages: 6, order: '1,2,3,4,5,12', parts: ['ppt/slides/slide3.xml', 'ppt/slides/slide4.xml', 'ppt/slides/slide5.xml'] },
  ];

  for (const c of cases) {
    const stations = Array.from({ length: c.n }, (_, i) => ({ ...ccd1(), id: `s${i}`, header: `2.硬體設定-CCD${i + 1}` }));
    const r = await generateReport(tplBuf, { ...model2(), stations }, devices);
    const integ = await packageIntegrity(r.bytes);

    ok(`${c.n} 个工站（无影像）→ ${c.pages} 页`, r.pages === c.pages, String(r.pages));
    ok(`${c.n} 个工站 → 页序 ${c.order}`, integ.order.join(',') === c.order, integ.order.join(','));
    ok(`${c.n} 个工站 → 工站页落在 ${c.parts.join(' + ')}`, r.stationParts.join(' ') === c.parts.join(' '), r.stationParts.join(' '));
    ok(`${c.n} 个工站 → 包内计数闭合（parts/Override/sldId/app 全等）`,
      integ.parts.length === c.pages && integ.overrides.length === c.pages &&
      integ.order.length === c.pages && integ.appSlides === c.pages,
      JSON.stringify({ ...integ.sizes, app: integ.appSlides }));
    ok(`${c.n} 个工站 → app.xml 的标题项向量长度一致（没写坏扩展属性）`,
      integ.vecSize === integ.vecItems && integ.titleCount === c.pages,
      `size=${integ.vecSize} 实际条目=${integ.vecItems} 标题数=${integ.titleCount}`);
    ok(`${c.n} 个工站 → 无悬空关系、每页都有 _rels、sldId 无重复`,
      integ.dangling.length === 0 && integ.noRels.length === 0 && integ.sldIdsUnique,
      [...integ.dangling, ...integ.noRels].slice(0, 2).join(' | '));

    if (c.n >= 2) {
      const zip = await JSZip.loadAsync(r.bytes);
      const first = await zip.file(c.parts[0]).async('text');
      const second = await zip.file(c.parts[1]).async('text');
      ok(`${c.n} 个工站 → 第 2 页正文与第 1 页不同（真的填了各自的号）`, first !== second);
      ok(`${c.n} 个工站 → 克隆页 rels 与壳本体 rels 一致（同 layout）`,
        (await zip.file('ppt/slides/_rels/slide3.xml.rels').async('text')) ===
        (await zip.file(c.parts[1].replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels').async('text')));
      ok(`${c.n} 个工站 → 第 2 页标题是 CCD2`, second.includes('2.硬體設定-CCD2'));
    }
  }

  // 工站顺序：交换两个工站，页面上也应跟着交换
  const swapped = await generateReport(tplBuf, { ...model2(), stations: [ccd2(), ccd1()] }, devices);
  {
    const zip = await JSZip.loadAsync(swapped.bytes);
    const first = await zip.file(TEMPLATE_LAYOUT.station).async('text');
    ok('交换工站顺序 → 第 1 张工站页变成 CCD2 的内容',
      first.includes('XF-10MDT0209X200-1C') && first.includes('2.硬體設定-CCD2'));
  }
}

/* ============ F. 打光影像段：分组 / 页序 / 壳选择 / 未用壳删除 ============ */
section('F. 打光影像段（P2a：骨架 + 工站→缺陷两层分组 + 页序）');
{
  /* 1 工站 + 破損 2 页（1 普通 + 1 特殊）→ 12 页里的最小完整形态 */
  const one = await generateReport(tplBuf, {
    ...model2(),
    stations: [{ ...ccd1(), imageGroups: [imgGroup('破損', [imgPage(...SRC_IMG_PLAIN), imgPage(...SRC_IMG_SPECIAL)])] }],
  }, devices);
  {
    const integ = await packageIntegrity(one.bytes);
    ok('1 工站 + 2 页影像 → 6 页', one.pages === 6, String(one.pages));
    ok('页序 = 封面/需求/工站/影像×2/結論', integ.order.join(',') === '1,2,3,5,8,12', integ.order.join(','));
    ok('普通页落在普通壳上、特殊页落在特殊壳上',
      one.imageParts.join(' ') === `${TEMPLATE_LAYOUT.imagePlain} ${TEMPLATE_LAYOUT.imageSpecial}`,
      one.imageParts.join(' '));
    ok('r.pageOrder 与 presentation.xml 的 sldIdLst 一致', one.pageOrder.join(',') === integ.order.map((n) => `ppt/slides/slide${n}.xml`).join(','));

    const zip = await JSZip.loadAsync(one.bytes);
    const plain = await zip.file(one.imageParts[0]).async('text');
    const special = await zip.file(one.imageParts[1]).async('text');
    const paras = (xml) => [...xml.matchAll(/<a:p>[\s\S]*?<\/a:p>/g)].map((m) => [...m[0].matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map((z) => z[1]).join(''));
    ok('普通影像页：标题条 = 3.打光影像-破損', paras(plain).includes('3.打光影像-破損'), paras(plain).join(' | '));
    ok('普通影像页：名称行 + 3 行说明逐字符一致（含源稿那个尾随空格）',
      paras(plain).includes('打光影像-破損') &&
      paras(plain).includes('QE提供不良樣品*4 ') &&
      paras(plain).includes('目前破損形態較為明顯可以檢出'),
      paras(plain).slice(-4).join(' | '));
    ok('特殊影像页：名称行带 -特殊，标题条仍是基础缺陷名',
      paras(special).includes('打光影像-破損-特殊') && paras(special).includes('3.打光影像-破損'),
      paras(special).join(' | '));
    ok('特殊影像页：2 行说明 + ↓ 都在',
      paras(special).includes('正光下弧度區域發黑，相機無法清楚看清內壁，若有輕微NG無法看出') && paras(special).includes('↓'));
    ok('两页影像页都没有残留占位符', !/\{\{/.test(plain) && !/\{\{/.test(special));

    /* 名称行与标题条是两个前缀：源报告标题条写「3.打光影像-破損」，
       同一个框里的名称行只写「打光影像-破損」。默认值不能把章节号带进名称行。 */
    ok('名称行默认值不带章节号（3. 只属于标题条）',
      emptyImagePage('破損').caption === '打光影像-破損' &&
      emptyImagePage('破損', 'special').caption === '打光影像-破損-特殊',
      `${emptyImagePage('破損').caption} / ${emptyImagePage('破損', 'special').caption}`);
    ok('标题条仍带章节号（由 plan 按族的 imageHeader 组装）',
      planPages(
        { ...model2(), stations: [{ ...ccd1(), imageGroups: [imgGroup('破損', [imgPage(...SRC_IMG_PLAIN)])] }] },
        devices,
      ).find((p) => p.imageKind)?.tokens['img.header'] === '3.打光影像-破損');
  }

  /* 说明为空数组 → 该段应该整段消失，而不是留个空段或漏填 */
  const noDesc = await generateReport(tplBuf, {
    ...model2(),
    stations: [{ ...ccd1(), imageGroups: [imgGroup('毛邊', [imgPage('plain', '打光影像-毛邊', [])])] }],
  }, devices);
  {
    const zip = await JSZip.loadAsync(noDesc.bytes);
    const xml = await zip.file(noDesc.imageParts[0]).async('text');
    const paras = [...xml.matchAll(/<a:p>[\s\S]*?<\/a:p>/g)].map((m) => [...m[0].matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map((z) => z[1]).join(''));
    ok('说明为空 → 说明段整段消失（既不留空段也不算漏填）',
      noDesc.missing.length === 0 && !paras.some((p) => p.includes('{{')), noDesc.missing.join(','));
  }

  /* 工站与自己的影像段必须紧邻；第二个工站的影像段排在它自己后面 */
  const two = await generateReport(tplBuf, {
    ...model2(),
    stations: [
      { ...ccd1(), imageGroups: [imgGroup('破損', [imgPage('plain', '打光影像-破損'), imgPage('special', '打光影像-破損-特殊')])] },
      { ...ccd2(), imageGroups: [imgGroup('毛邊', [imgPage('plain', '打光影像-毛邊'), imgPage('special', '打光影像-毛邊-特殊')])] },
    ],
  }, devices);
  {
    const integ = await packageIntegrity(two.bytes);
    const plan = planPages({
      ...model2(),
      stations: [
        { ...ccd1(), imageGroups: [imgGroup('破損', [imgPage('plain', '打光影像-破損'), imgPage('special', '打光影像-破損-特殊')])] },
        { ...ccd2(), imageGroups: [imgGroup('毛邊', [imgPage('plain', '打光影像-毛邊'), imgPage('special', '打光影像-毛邊-特殊')])] },
      ],
    }, devices);
    ok('2 工站各带 2 页影像 → 9 页', two.pages === 9, String(two.pages));
    ok('工站与自己的影像段紧邻（不是所有工站页在前、影像页统一在后）',
      integ.order.join(',') === '1,2,3,5,8,4,6,7,12', integ.order.join(','));
    ok('plan 的标签顺序与产物页序一一对应',
      plan.length === two.pages &&
      plan[2].stationIndex === 0 && plan[3].stationIndex === 0 && plan[4].stationIndex === 0 &&
      plan[5].stationIndex === 1, plan.map((p) => `${p.stationIndex}:${p.shell.replace('ppt/slides/', '')}`).join(' '));
    ok('两个工站的影像页都是克隆出来的（不是共用同一个 part）',
      new Set(two.imageParts).size === two.imageParts.length, two.imageParts.join(','));

    const zip = await JSZip.loadAsync(two.bytes);
    const txt = (p) => zip.file(p).async('text');
    ok('第 2 个工站的影像页仍是「毛邊」而不是「破損」（克隆用的是未填充的壳）',
      (await txt(two.imageParts[2])).includes('打光影像-毛邊'));
  }

  /* 只用得到一种壳时，另一种壳必须被删干净 */
  const onlySpecial = await generateReport(tplBuf, {
    ...model2(),
    stations: [{ ...ccd1(), imageGroups: [imgGroup('毛邊', [imgPage('special', '打光影像-毛邊-特殊')])] }],
  }, devices);
  {
    const integ = await packageIntegrity(onlySpecial.bytes);
    ok('只用特殊页时，普通壳被删掉', onlySpecial.droppedShells.includes(TEMPLATE_LAYOUT.imagePlain), onlySpecial.droppedShells.join(','));
    ok('只用特殊页时，特殊壳本体被复用（不额外克隆）',
      onlySpecial.imageParts.join('') === TEMPLATE_LAYOUT.imageSpecial, onlySpecial.imageParts.join(''));
    ok('删壳后包内仍闭合、无悬空关系',
      integ.parts.length === 5 && integ.overrides.length === 5 && integ.order.length === 5 && integ.dangling.length === 0,
      JSON.stringify({ ...integ.sizes, dangling: integ.dangling.length }));
  }

  /* 没有影像段的工站 = 完全不出影像页；某工站有、另一个没有，也要各归各位 */
  const mixed = await generateReport(tplBuf, {
    ...model2(),
    stations: [
      { ...ccd1(), imageGroups: [] },
      { ...ccd2(), imageGroups: [imgGroup('破損', [imgPage('plain', '打光影像-破損')])] },
    ],
  }, devices);
  {
    const integ = await packageIntegrity(mixed.bytes);
    ok('工站 1 无影像 + 工站 2 有 1 页影像 → 页序 1,2,3,4,5,12（影像在第 2 个工站之后）',
      integ.order.join(',') === '1,2,3,4,5,12', integ.order.join(','));
  }

  /* 标题条要跟着「缺陷名」长度自适应，长缺陷名不能截断 */
  const longDefect = await generateReport(tplBuf, {
    ...model2(),
    stations: [{ ...ccd1(), imageGroups: [imgGroup('異色斑點與刮傷混合', [imgPage('plain', '打光影像-異色斑點與刮傷混合')])] }],
  }, devices);
  {
    const zip = await JSZip.loadAsync(longDefect.bytes);
    const xml = await zip.file(longDefect.imageParts[0]).async('text');
    const cx = Number(/<p:cNvPr id="4"[\s\S]*?<a:ext cx="(\d+)"/.exec(xml)?.[1] ?? -1);
    ok('影像页标题条也按缺陷名长度自适应（不是照抄壳的 201.2pt）',
      Math.abs(cx / 12700 - estimateTitleBarWidthPt('3.打光影像-異色斑點與刮傷混合').widthPt) < 0.2,
      `${(cx / 12700).toFixed(1)}pt`);
  }
}

/* ==================== G. 标题条自适应宽度 ==================== */
section('G. 标题条宽度（源稿是手拖的，口径 = 不裁切）');
{
  const short = estimateTitleBarWidthPt('2.硬體設定-CCD1');
  const long = estimateTitleBarWidthPt('2.硬體設定-CCD2（替換鐳射工站）');
  const imgTitle = estimateTitleBarWidthPt('3.打光影像-破損');

  /* 源稿的两个真实条宽是唯一的权威样本（见 layout.ts 文件头的标定实验）。
     口径不是「拟合得多准」，而是：**估算值必须 ≥ 源稿字宽**，
     并且不能夸张到把版式拖变形（≤ 源稿 × 1.12）。 */
  ok('短标题估算 ≥ 源稿 201.2pt（源稿贴边拖，我们只允许更宽）', short.widthPt >= 201.2, `${short.widthPt}pt`);
  ok('短标题估算 ≤ 源稿 × 1.12（不过分夸张）', short.widthPt <= 201.2 * 1.12, `${short.widthPt}pt`);
  ok('长标题估算 ≥ 源稿 382.0pt', long.widthPt >= 382, `${long.widthPt}pt`);
  ok('长标题估算 ≤ 源稿 × 1.12', long.widthPt <= 382 * 1.12, `${long.widthPt}pt`);
  ok('影像页标题与源稿 201.2pt 相差 ≤ 12pt', Math.abs(imgTitle.widthPt - 201.2) <= 12, `${imgTitle.widthPt}pt`);

  /* 标定实验实测：条放宽到 700pt 后，这两串的墨迹右边界分别到 207.3 / 200.0pt。
     估算宽必须罩得住它们 —— 这就是「不裁切」的可执行定义。 */
  ok('估算宽罩得住源稿实测墨迹（2.硬體設定-CCD1 → 207.3pt）', short.widthPt >= 207.3, `${short.widthPt}pt`);
  ok('估算宽罩得住源稿实测墨迹（3.打光影像-破損 → 200.0pt）', imgTitle.widthPt >= 200.0, `${imgTitle.widthPt}pt`);
  ok('估算宽包含左右内边距（lIns+rIns = 14.17pt）',
    estimateTitleBarWidthPt('').widthPt >= 14.17, `${estimateTitleBarWidthPt('').widthPt}pt`);
  ok('全角按 0.9417em 计（4 个全角 = 90.4pt）', Math.abs(textWidthPt('硬體設定', 24) - 4 * 0.9417 * 24) < 1e-6, `${textWidthPt('硬體設定', 24)}pt`);
  ok('拉丁按 0.6173em 计（CCD1 = 59.3pt）', Math.abs(textWidthPt('CCD1', 24) - 4 * 0.6173 * 24) < 1e-6, `${textWidthPt('CCD1', 24)}pt`);
  ok('空格比拉丁窄（0.30em）', textWidthPt(' ', 24) < textWidthPt('i', 24));
  ok('标题越长条越宽', long.widthPt > short.widthPt);
  ok('封顶到页宽以内（720pt − 4pt）', estimateTitleBarWidthPt('一二三四五六七八九十'.repeat(12)).widthPt <= 716);
  ok('封顶时给出 capped 标记', estimateTitleBarWidthPt('一二三四五六七八九十'.repeat(12)).capped === true);

  // 真产物：标题条 cx 必须真的跟着标题长度走
  const r = await generateReport(tplBuf, model2(), devices);
  const zip = await JSZip.loadAsync(r.bytes);
  const s3 = await zip.file(TEMPLATE_LAYOUT.station).async('text');
  const s4 = await zip.file('ppt/slides/slide4.xml').async('text');
  const barCx = (xml) => Number(/<p:cNvPr id="10241"[\s\S]*?<a:ext cx="(\d+)"/.exec(xml)?.[1] ?? -1);
  ok('第 3 页（短标题）的标题条宽度已按内容改写', barCx(s3) > 0 && Math.abs(barCx(s3) / 12700 - short.widthPt) < 0.2, `${(barCx(s3) / 12700).toFixed(1)}pt`);
  ok('第 4 页（长标题）的标题条比第 3 页宽',
    barCx(s4) > barCx(s3), `${(barCx(s3) / 12700).toFixed(1)}pt vs ${(barCx(s4) / 12700).toFixed(1)}pt`);
}

/* ================= H. 全量样张（12 页 replica） ==================== */
section('H. 与源报告同构的 12 页样例（工站→缺陷 两层分组）');
{
  const model = {
    cover: ['液冷入料密封圈新增AI檢測', '評估報告'],
    requirement,
    stations: [
      { ...ccd1(), imageGroups: [imgGroup('破損', [imgPage(...SRC_IMG_PLAIN), imgPage('plain', '打光影像-破損', []), imgPage('plain', '打光影像-破損', []), imgPage(...SRC_IMG_SPECIAL)])] },
      { ...ccd2(), imageGroups: [imgGroup('毛邊', [imgPage('plain', '打光影像-毛邊', ['QE提供不良樣品*6', '紅色標示即為不良位置', '毛邊形態很多，輕微毛邊不易看出']), imgPage('plain', '打光影像-毛边', []), imgPage('special', '打光影像-毛邊-特殊', ['直通接頭密封圈外徑53.3mm,玻璃乘坐內徑55mm', '若擺放位置不對，外測毛邊易被遮擋無法看出，需要改善乘坐'])])] },
    ],
  };
  const r = await generateReport(tplBuf, model, devices);
  const integ = await packageIntegrity(r.bytes);
  ok('源报告「破損×4 + 毛邊×3」在两层分组下仍是 12 页', r.pages === 12, String(r.pages));
  ok('影像页 7 张、工站页 2 张', r.imageParts.length === 7 && r.stationParts.length === 2,
    `${r.imageParts.length} / ${r.stationParts.length}`);
  ok('包内计数闭合、无悬空关系、sldId 无重复',
    integ.parts.length === 12 && integ.overrides.length === 12 && integ.appSlides === 12 &&
    integ.dangling.length === 0 && integ.sldIdsUnique, JSON.stringify(integ.sizes));
  ok(`全部 ${MANIFEST_KEYS.length} 个 token 都被用到`, r.used.length === MANIFEST_KEYS.length, `${r.used.length}/${MANIFEST_KEYS.length}`);
  ok('生成的每页都不含残留占位符', r.missing.length === 0, r.missing.join(','));

  const zip = await JSZip.loadAsync(r.bytes);
  let residue = [];
  for (const n of integ.parts) if (/\{\{/.test(await zip.file(n).async('text'))) residue.push(n);
  ok('逐页扫描也没有残留', residue.length === 0, residue.join(','));

  /* 页码是 layout 里的 sldNum **域**，跟着 sldIdLst 走 —— 页序重排后必须自动是对的。
     这里验「没有任何一页把 Page:N 写成静态文本」，真渲染复核在 G 段之外的渲染脚本里做。 */
  let staticPage = [];
  for (const n of integ.parts) if (/Page:\s*\d/.test(await zip.file(n).async('text'))) staticPage.push(n);
  ok('页码不是静态文本（来自 layout 的 sldNum 域，重排后自动跟随）', staticPage.length === 0, staticPage.join(','));
}

/* ================= J. 图片注入：media / rels / 红圈 / 排版告警 ==================== */
section('J. 打光影像：图片字节、关系、红圈、手动摆放与告警（P2b）');
{
  /* 1×1 的合法最简图 —— domain 只当字节搬运工，不解码像素，所以体积够小就够用 */
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

  const slot = (id, dataUrl, pxW, pxH, extra = {}) =>
    ({ id, name: `shot-${id}.jpg`, dataUrl, pxW, pxH, circles: [], ...extra });
  const mark = (id, x, y, w, h) => ({ id, x, y, w, h });
  /** 带图的一页（`imgPage` 只管骨架，图要另挂） */
  const withSlots = (kind, caption, desc, slots, extra = {}) =>
    ({ ...imgPage(kind, caption, desc), slots, ...extra });
  const imgModelJ = (pages) => ({
    ...model2(),
    stations: [{ ...ccd1(), imageGroups: [imgGroup('破損', pages)] }],
  });

  const EMU = 12700;
  /** 取 `<p:pic>` / 椭圆 `p:sp` 的位置尺寸（pt）。注意 `p:sp` 含标题条与名称框，必须按几何形状过滤 */
  const boxesOf = (xml, tag, filter = null) =>
    [...xml.matchAll(new RegExp(`<p:${tag}>[\\s\\S]*?</p:${tag}>`, 'g'))]
      .filter((m) => filter === null || filter(m[0]))
      .map((m) => {
        const off = /<a:off x="(-?\d+)" y="(-?\d+)"\/>/.exec(m[0]);
        const ext = /<a:ext cx="(-?\d+)" cy="(-?\d+)"\/>/.exec(m[0]);
        return {
          xPt: Number(off[1]) / EMU, yPt: Number(off[2]) / EMU,
          wPt: Number(ext[1]) / EMU, hPt: Number(ext[2]) / EMU,
        };
      });
  const circlesOf = (xml) => boxesOf(xml, 'sp', (s) => /prstGeom prst="ellipse"/.test(s));
  const inside = (b) => b.xPt >= -0.5 && b.yPt >= -0.5 && b.xPt + b.wPt <= 720.5 && b.yPt + b.hPt <= 540.5;

  /* ---- J1. 两张图 + 一个红圈：字节、关系、几何、顺序 ---- */
  const rJ = await generateReport(tplBuf, imgModelJ([
    withSlots('plain', '打光影像-破損', ['QE提供不良樣品*4', '紅色標示即為不良位置'], [
      slot('a', PNG, 1200, 900, { circles: [mark('c1', 0.25, 0.3, 0.2, 0.15)] }),
      slot('b', JPG, 900, 1600),
    ]),
  ]), devices);
  ok('1 工站 + 1 页影像（带图）→ 5 页', rJ.pages === 5, String(rJ.pages));

  const zipJ = await JSZip.loadAsync(rJ.bytes);
  const namesJ = Object.keys(zipJ.files).filter((n) => !zipJ.files[n].dir);
  const imgPart = rJ.imageParts[0];
  const imgXml = await zipJ.file(imgPart).async('text');
  const imgRels = await zipJ.file(imgPart.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels').async('text');
  const ctJ = await zipJ.file('[Content_Types].xml').async('text');

  ok(`两张不同的图各落一个 media 部件（${rJ.mediaParts.length} 个）`, rJ.mediaParts.length === 2, rJ.mediaParts.join(','));
  ok('每个 media 部件确实写进了包里', rJ.mediaParts.every((p) => namesJ.includes(p)), rJ.mediaParts.join(','));
  ok('png / jpeg 各有 Content_Types Default（WPS 靠这个认字节）',
    /<Default Extension="png"/.test(ctJ) && /<Default Extension="jpeg"/.test(ctJ));

  const relsImgs = [...imgRels.matchAll(/Type="[^"]*\/image" Target="([^"]+)"/g)].map((m) => m[1]);
  ok('影像页 rels 挂了 2 条 image 关系', relsImgs.length === 2, relsImgs.join(','));
  ok('关系 Target 是相对 `ppt/slides/` 的 `../media/...`，且部件存在',
    relsImgs.every((t) => t.startsWith('../media/') && namesJ.includes(`ppt/${t.slice(3)}`)), relsImgs.join(','));

  const picsJ = boxesOf(imgXml, 'pic');
  const ellsJ = circlesOf(imgXml);
  ok('页里正好 2 个 `<p:pic>`', picsJ.length === 2, String(picsJ.length));
  ok('页里正好 1 个红圈（`prstGeom prst="ellipse"` 的 `p:sp`）',
    (imgXml.match(/prstGeom prst="ellipse"/g) ?? []).length === 1 && ellsJ.length === 1,
    String(ellsJ.length));
  ok('红圈的描边是 1pt 实心红（与源报告实测一致，不靠主题 lnRef）',
    /<a:ln w="12700"><a:solidFill><a:srgbClr val="FF0000"\/>/.test(imgXml));
  ok('两张图都完整落在页内', picsJ.every(inside), JSON.stringify(picsJ.map((b) => [b.xPt | 0, b.yPt | 0, b.wPt | 0, b.hPt | 0])));
  ok('两张图互不重叠（自动摆放的格子各占一块）',
    picsJ.every((a, i) => picsJ.every((b, j) => i === j ||
      a.xPt + a.wPt <= b.xPt + 0.5 || b.xPt + b.wPt <= a.xPt + 0.5 ||
      a.yPt + a.hPt <= b.yPt + 0.5 || b.yPt + b.hPt <= a.yPt + 0.5)));

  /* 圈必须画在图上：图片在前、红圈在后（源报告 slide5 就是这个次序）。
     颠倒过来圈会被图盖住 —— 这种错人眼极难发现，但导出后一定不对。 */
  ok('spTree 里图片排在红圈之前（圈画在图上，不会被盖住）',
    imgXml.lastIndexOf('<p:pic>') < imgXml.lastIndexOf('prstGeom prst="ellipse"'));

  /* 归一圈坐标 → 页面坐标：圈应该是「图片框 × 归一化值」 */
  const cBox = ellsJ[0];
  const expect = {
    xPt: picsJ[0].xPt + 0.25 * picsJ[0].wPt, yPt: picsJ[0].yPt + 0.3 * picsJ[0].hPt,
    wPt: 0.2 * picsJ[0].wPt, hPt: 0.15 * picsJ[0].hPt,
  };
  ok('红圈位置 = 图片框 × 归一化坐标（重排图片时圈自动跟着走）',
    Math.abs(cBox.xPt - expect.xPt) <= 0.5 && Math.abs(cBox.yPt - expect.yPt) <= 0.5 &&
    Math.abs(cBox.wPt - expect.wPt) <= 0.5 && Math.abs(cBox.hPt - expect.hPt) <= 0.5,
    `${JSON.stringify(Object.fromEntries(Object.entries(cBox).map(([k, v]) => [k, +v.toFixed(1)])))} vs ${JSON.stringify(Object.fromEntries(Object.entries(expect).map(([k, v]) => [k, +v.toFixed(1)])))}`);

  const integJ = await packageIntegrity(rJ.bytes);
  ok('带图的产物包内计数仍闭合、无悬空关系（media 关系没有指空）',
    integJ.dangling.length === 0 && integJ.parts.length === 5 && integJ.overrides.length === 5,
    integJ.dangling.join(' | ') || JSON.stringify(integJ.sizes));

  /* ---- J2. 同一张图跨页复用 → media 只写一份 ---- */
  const rDedup = await generateReport(tplBuf, imgModelJ([
    withSlots('plain', '打光影像-破損', [], [slot('a', PNG, 1200, 900)]),
    withSlots('plain', '打光影像-破損', [], [slot('a2', PNG, 1200, 900)]),
  ]), devices);
  ok('同一张图在 2 页各贴一次 → media 仍只有 1 份（按 dataURL 去重）',
    rDedup.mediaParts.length === 1, rDedup.mediaParts.join(','));
  {
    const z = await JSZip.loadAsync(rDedup.bytes);
    const relsOf = async (p) => (await z.file(p.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels').async('text'));
    const r1 = await relsOf(rDedup.imageParts[0]);
    const r2 = await relsOf(rDedup.imageParts[1]);
    const t1 = /Target="(\.\.\/media\/[^"]+)"/.exec(r1)?.[1];
    const t2 = /Target="(\.\.\/media\/[^"]+)"/.exec(r2)?.[1];
    ok('两页各自挂了独立的 image 关系，但指向同一个 media 部件', !!t1 && t1 === t2, `${t1} / ${t2}`);
    ok('两页是不同的 part（不是把同一页写了两遍）', rDedup.imageParts[0] !== rDedup.imageParts[1]);
  }

  /* ---- J3. 手动摆放：坐标原样落进 XML（拖拽微调的那条路） ---- */
  const manualBox = { xPt: 60, yPt: 200, wPt: 300, hPt: 150 };
  const rManual = await generateReport(tplBuf, imgModelJ([
    withSlots('plain', '打光影像-破損', [], [slot('a', PNG, 1200, 900, { box: manualBox })], { autoLayout: false }),
  ]), devices);
  {
    const z = await JSZip.loadAsync(rManual.bytes);
    const xml = await z.file(rManual.imageParts[0]).async('text');
    const b = boxesOf(xml, 'pic')[0];
    ok('拖过的图按用户坐标落位（不再套自动网格）',
      Math.abs(b.xPt - manualBox.xPt) <= 0.5 && Math.abs(b.yPt - manualBox.yPt) <= 0.5 &&
      Math.abs(b.wPt - manualBox.wPt) <= 0.5 && Math.abs(b.hPt - manualBox.hPt) <= 0.5,
      `${b.xPt.toFixed(1)},${b.yPt.toFixed(1)} ${b.wPt.toFixed(1)}×${b.hPt.toFixed(1)}`);
    /* 人工覆盖 fps / Lens Resolution 本来就会发告警（那是 B 段的事），这里只关心图片相关的 */
    ok('手动摆放本身不发图片类告警（页面内、数量合规）',
      rManual.warnings.every((w) => !/图片|页面外|压到/.test(w)),
      rManual.warnings.join(' | '));
  }

  /* ---- J4. 告警：空页 / 超量 / 拖出页外 / 说明挤图区 ---- */
  const rEmpty = await generateReport(tplBuf, imgModelJ([withSlots('plain', '打光影像-破損', [], [])]), devices);
  ok('一页没图 → 告警「还没有图片」（不静默出一页空白影像页）',
    rEmpty.warnings.some((w) => w.includes('还没有图片')), rEmpty.warnings.join(' | '));

  const many = Array.from({ length: 13 }, (_, i) => slot(`m${i}`, PNG, 800, 600));
  const rMany = await generateReport(tplBuf, imgModelJ([withSlots('plain', '打光影像-破損', [], many)]), devices);
  ok('一页放 13 张（超过上限 12）→ 告警建议分页',
    rMany.warnings.some((w) => w.includes('超过单页上限')), rMany.warnings.join(' | '));

  const rOff = await generateReport(tplBuf, imgModelJ([
    withSlots('plain', '打光影像-破損', [], [slot('a', PNG, 1200, 900, { box: { xPt: 600, yPt: 450, wPt: 300, hPt: 200 } })], { autoLayout: false }),
  ]), devices);
  ok('手动摆放被拖出页外 → 告警「会被裁掉」（最容易被忽略的一类丢图）',
    rOff.warnings.some((w) => w.includes('页面外')), rOff.warnings.join(' | '));

  const rTight = await generateReport(tplBuf, imgModelJ([
    withSlots('plain', '打光影像-破損', Array.from({ length: 12 }, (_, i) => `说明第 ${i + 1} 行`), [slot('a', PNG, 800, 600)]),
  ]), devices);
  ok('说明写太多把图片区压到下限 → 告警（不静默把图压成一条）',
    rTight.warnings.some((w) => w.includes('图片区被压到')), rTight.warnings.join(' | '));

  /* ---- J5. 红字规则（源报告实测：名称的 -特殊 后缀 + 说明里的手涂红字） ---- */
  const rRed = await generateReport(tplBuf, imgModelJ([
    withSlots('special', '打光影像-破損-特殊', ['若有**輕微NG無法看出**', '需要改善乘坐'], []),
  ]), devices);
  {
    const z = await JSZip.loadAsync(rRed.bytes);
    const xml = await z.file(rRed.imageParts[0]).async('text');
    /** 取承载某段文字的那个 run 的 rPr + 文字 */
    const runOf = (text) => {
      const esc = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const m = [...xml.matchAll(/<a:r>([\s\S]*?)<\/a:r>/g)].find((r) =>
        new RegExp(`<a:t(?:\\s[^>]*)?>${esc}</a:t>`).test(r[1]));
      return m ? m[0] : null;
    };
    const specialRun = runOf('-特殊');
    ok('名称行结尾的 -特殊 是红加粗（源报告 slide8 实测色，自动重建、不用手打标记）',
      !!specialRun && /FF0000/.test(specialRun) && /b="1"/.test(specialRun),
      (specialRun ?? '（没找到该 run）').replace(/<a:t[\s\S]*/, '').slice(-90));

    const emphRun = runOf('輕微NG無法看出');
    ok('说明里的 **…** 变成红加粗，且星号本身不印进 PPT',
      !!emphRun && /FF0000/.test(emphRun) && /b="1"/.test(emphRun) && !xml.includes('**'),
      (emphRun ?? '（没找到该 run）').slice(-90));

    const prevRun = runOf('若有');
    ok('**…** 之外的部分没被连坐染红（只有被包住的片段变红）',
      !!prevRun && !/FF0000/.test(prevRun), (prevRun ?? '（没找到该 run）').slice(-90));

    const plainRun = runOf('需要改善乘坐');
    ok('没打标记的说明行保持原色（标记是显式的，不靠猜）',
      !!plainRun && !/FF0000/.test(plainRun), (plainRun ?? '（没找到该 run）').slice(-90));
  }
}

/* ============ K. 需求页 + 模板族注册表（2026-09-30 那轮口径） ============ */
section('K. 【1.檢測需求】页与模板族注册表');
{
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const EMU = 12700;
  const picsOf = (xml) =>
    [...xml.matchAll(/<p:pic>[\s\S]*?<\/p:pic>/g)].map((m) => {
      const off = /<a:off x="(-?\d+)" y="(-?\d+)"\/>/.exec(m[0]);
      const ext = /<a:ext cx="(-?\d+)" cy="(-?\d+)"\/>/.exec(m[0]);
      return {
        xPt: Number(off[1]) / EMU, yPt: Number(off[2]) / EMU,
        wPt: Number(ext[1]) / EMU, hPt: Number(ext[2]) / EMU,
        descr: /descr="([^"]*)"/.exec(m[0])?.[1] ?? '',
      };
    });

  /* ---- K1. 需求页：只贴图不写字 ---- */
  const reqImage = { id: 'req-1', name: '需求表.png', dataUrl: PNG, pxW: 1200, pxH: 1600 };
  const rImg = await generateReport(
    tplBuf,
    { ...model2(), requirement: { lines: [], image: reqImage } },
    devices,
  );
  {
    const zip = await JSZip.loadAsync(rImg.bytes);
    const xml = await zip.file(TEMPLATE_LAYOUT.requirement).async('text');
    const rels = await zip.file(
      TEMPLATE_LAYOUT.requirement.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels',
    ).async('text');
    const pics = picsOf(xml);
    const box = SEALING_FAMILY.conventions.requireImageBox;

    ok('需求页只贴图不写字也能生成（页仍在、无残留占位符）',
      rImg.missing.length === 0 && !/\{\{/.test(xml), rImg.missing.join(','));
    ok('需求页贴了 1 张图，且 descr 带原文件名（出问题能对上号）',
      pics.length === 1 && pics[0].descr === '需求表.png', JSON.stringify(pics.map((p) => p.descr)));
    ok('需求页 rels 挂了 1 条 image 关系，Target 指向存在的 media 部件',
      /Type="[^"]*\/image" Target="\.\.\/media\/[^"]+"/.test(rels) && rImg.mediaParts.length === 1,
      `${rImg.mediaParts.join(',')}`);

    /* 等比适配：1200×1600（3:4）→ 高度吃满内容区，宽度按比例缩，水平居中。**不裁切** */
    const expectW = box.hPt * (1200 / 1600);
    ok('需求表图等比适配到族的内容区并居中（不裁切 —— 裁掉一角比留白糟得多）',
      Math.abs(pics[0].hPt - box.hPt) <= 0.5 &&
      Math.abs(pics[0].wPt - expectW) <= 0.5 &&
      Math.abs(pics[0].xPt - (box.xPt + (box.wPt - expectW) / 2)) <= 0.5 &&
      Math.abs(pics[0].yPt - box.yPt) <= 0.5,
      `${pics[0].xPt.toFixed(1)},${pics[0].yPt.toFixed(1)} ${pics[0].wPt.toFixed(1)}×${pics[0].hPt.toFixed(1)} 期望 h=${box.hPt} w=${expectW.toFixed(1)}`);
    ok('贴的图完整落在页内', pics[0].xPt >= 0 && pics[0].yPt >= 0 && pics[0].xPt + pics[0].wPt <= 720.5 && pics[0].yPt + pics[0].hPt <= 540.5);

    const integ = await packageIntegrity(rImg.bytes);
    ok('带需求表图的产物包内计数仍闭合、无悬空关系',
      integ.dangling.length === 0 && integ.parts.length === rImg.pages, integ.dangling.join(' | '));
  }

  /* ---- K2. 需求页两样都空 → 告警（不静默出一页白页） ---- */
  const rEmptyReq = await generateReport(tplBuf, { ...model2(), requirement: { lines: ['   '], image: null } }, devices);
  ok('需求页两样都空 → 告警（命令行/门禁/界面同一条判据）',
    rEmptyReq.warnings.some((w) => w.includes('还空着')), rEmptyReq.warnings.join(' | '));
  ok('需求页有文字时不告警', !r2.warnings.some((w) => w.includes('还空着')), r2.warnings.join(' | '));

  /* ---- K3. 需求页文字按行展开、空行被丢掉 ---- */
  const reqPlan = planPages({ ...model2(), requirement: { lines: ['甲', '', '乙', '  '], image: null } }, devices);
  ok('需求页 token 丢掉空行（「只贴图不写字」是合法状态，所以不能留空段）',
    JSON.stringify(reqPlan.find((p) => p.shell === TEMPLATE_LAYOUT.requirement).tokens['req.lines']) === JSON.stringify(['甲', '乙']),
    JSON.stringify(reqPlan.find((p) => p.shell === TEMPLATE_LAYOUT.requirement).tokens['req.lines']));

  /* ---- K4. 模板族注册表 ---- */
  ok('注册表里至少有 sealing 一族', TEMPLATE_IDS.includes('sealing'), TEMPLATE_IDS.join(','));
  ok('默认族 = sealing，且 TEMPLATE_LAYOUT 就是它的 layout',
    DEFAULT_TEMPLATE_ID === 'sealing' && TEMPLATE_LAYOUT === SEALING_FAMILY.layout);
  ok('未知 id 回退到默认族（不回 undefined、不炸）',
    getFamily(undefined).id === 'sealing' && getFamily('不存在的族').id === 'sealing');
  ok('manifest 的 layout 与该族注册表一致（模板与代码同一个真相源）',
    JSON.stringify(manifest.layout) === JSON.stringify(SEALING_FAMILY.layout));
  ok('生成结果带 templateId（排障时知道用的是哪族）', r2.templateId === 'sealing', r2.templateId);

  /* 族的开关真的被 plan 认：四合一那族（影像页标题条写工站名、没有結論页） */
  const stationHeaderFamily = {
    ...SEALING_FAMILY,
    id: 'fake-station-header',
    conventions: { ...SEALING_FAMILY.conventions, imageHeader: 'station', imageCaptionPrefix: '', hasConclusion: false },
  };
  const fakeModel = {
    ...model2(),
    stations: [{ ...ccd1(), imageGroups: [imgGroup('破損', [imgPage(...SRC_IMG_PLAIN)])] }],
  };
  const stationHeaderPlan = planPages(fakeModel, devices, stationHeaderFamily);
  ok('族开关 imageHeader="station" → 影像页标题条取工站名（四合一那种版式）',
    stationHeaderPlan.find((p) => p.imageKind)?.tokens['img.header'] === '2.硬體設定-CCD1',
    String(stationHeaderPlan.find((p) => p.imageKind)?.tokens['img.header']));
  ok('族开关 hasConclusion=false → 不生成結論页（实测四合一那份根本没有）',
    stationHeaderPlan.every((p) => p.shell !== TEMPLATE_LAYOUT.conclusion),
    stationHeaderPlan.map((p) => p.shell).join(','));
  ok('默认族（sealing）仍然有結論页', planPages(model2(), devices).some((p) => p.shell === TEMPLATE_LAYOUT.conclusion));

  /* ---- K5. 需求推导逐工站：两站不同公差 → 页上两套不同文字 ---- */
  const rTwo = await generateReport(
    tplBuf,
    {
      ...model2(),
      stations: [
        { ...ccd1(), toleranceMm: 0.08, requireLead: '最大值徑53.3mm，最大厚度6.7mm' },
        { ...ccd2(), toleranceMm: 0.15, requireLead: '最大值徑53.3mm，最大厚度6.7mm' },
      ],
    },
    devices,
  );
  {
    const zip = await JSZip.loadAsync(rTwo.bytes);
    const a = await zip.file(rTwo.stationParts[0]).async('text');
    const b = await zip.file(rTwo.stationParts[1]).async('text');
    ok('逐工站需求推导：第 1 站写自己的公差（0.08）',
      a.includes('最小公差±0.08mm，公差帶=0.16') && !a.includes('公差帶=0.3'), '');
    ok('逐工站需求推导：第 2 站写自己的公差（0.15，公差帶=0.3），没被第 1 站带跑',
      b.includes('最小公差±0.15mm，公差帶=0.3'), '');
    ok('两站的需求推导块不相同（证明不是「全报告一份」）',
      a.includes('公差帶=0.16') && b.includes('公差帶=0.3'));
  }
}

/* ================= I. 真 Office 打开（可选） ==================== */
section('I. Office 能否打开（可选，缺 LibreOffice 则跳过）');
{
  const soffice = [
    'C:/Program Files/LibreOffice/program/soffice.exe',
    '/usr/bin/soffice',
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  ].find((p) => existsSync(p));

  // 独立的页数仲裁：用 pypdfium2 读 LibreOffice 转出来的 PDF，
  // 而不是信我们自己写的 sldIdLst（那是同一份 XML 自己证明自己）。
  const pyCandidates = [
    process.env.AOI_PYTHON,
    'C:/Users/IPC/.workbuddy/binaries/python/envs/default/Scripts/python.exe',
    'python3', 'python',
  ].filter(Boolean);
  const py = pyCandidates.find((p) => {
    try { execFileSync(p, ['-c', 'import pypdfium2'], { stdio: 'pipe', timeout: 60000 }); return true; } catch { return false; }
  });

  const imgModel = (groups) => ({
    ...model2(),
    stations: [{ ...ccd1(), imageGroups: groups }],
  });

  if (!soffice) {
    console.log('  - 跳过：未找到 LibreOffice（源报告 → PDF 转换依赖它）');
  } else {
    const cases = [
      ['1 工站（无影像）', (await generateReport(tplBuf, { ...model2(), stations: [ccd1()] }, devices)).bytes, 4],
      ['1 工站 + 2 页影像', (await generateReport(tplBuf, imgModel([imgGroup('破損', [imgPage(...SRC_IMG_PLAIN), imgPage(...SRC_IMG_SPECIAL)])]), devices)).bytes, 6],
      ['3 工站 + 3 页影像', (await generateReport(tplBuf, {
        ...model2(),
        stations: [
          ccd1(),
          { ...ccd2(), id: 's2' },
          { ...ccd1(), id: 's3', header: '2.硬體設定-CCD3', imageGroups: [imgGroup('破損', [imgPage(...SRC_IMG_PLAIN), imgPage('plain', '打光影像-破損', []), imgPage(...SRC_IMG_SPECIAL)])] },
        ],
      }, devices)).bytes, 9],
    ];
    for (const [tag, bytes, pages] of cases) {
      const dir = mkdtempSync(resolve(tmpdir(), 'lr-verify-'));
      try {
        const out = resolve(dir, 'r.pptx');
        writeFileSync(out, bytes);
        execFileSync(soffice, ['--headless', '--convert-to', 'pdf', '--outdir', dir, out], { stdio: 'pipe', timeout: 180000 });
        const pdf = resolve(dir, 'r.pdf');
        const opened = existsSync(pdf);
        ok(`LibreOffice 能打开 ${tag} 的产物`, opened);
        if (opened && py) {
          const got = execFileSync(py, ['-c', `import pypdfium2 as p;print(len(p.PdfDocument(r'${pdf.replace(/\\/g, '/')}')))`], { encoding: 'utf8', timeout: 120000 }).trim();
          ok(`${tag} 产物页数 = ${pages}（LibreOffice + pypdfium2 独立复核）`, got === String(pages), `实际 ${got}`);
        } else if (opened) {
          console.log('  - 页数独立复核跳过：未找到可用的 pypdfium2');
        }
      } catch (e) {
        ok(`LibreOffice 能打开 ${tag} 的产物`, false, String(e.message).slice(0, 120));
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  }
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}　${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
