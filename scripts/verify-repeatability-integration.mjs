import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = read('src/App.tsx');
const types = read('src/types.ts');
const toolCard = read('src/components/ToolCard.tsx');
const css = read('src/index.css');

assert.ok(types.includes("'repeatability'"), 'ToolId must include repeatability');
assert.ok(types.includes("'correlation'"), 'ToolId must include correlation');
assert.ok(app.includes('index="04"'), 'homepage must include tool 04');
assert.ok(app.includes('title="重复性分析"'), 'homepage must include repeatability card');
assert.ok(app.includes('index="05"'), 'homepage must include tool 05');
assert.ok(app.includes('title="相关性判断"'), 'homepage must include correlation card');
assert.ok(!app.includes('disabled'), 'correlation card must no longer be disabled');
assert.ok(app.includes("activeTool === 'repeatability' && <RepeatabilityWorkbench onBack={handleClose} />"), 'repeatability must render inline');
assert.ok(app.includes("activeTool === 'correlation' && <CorrelationWorkbench onBack={handleClose} />"), 'correlation must render inline');
assert.ok(toolCard.includes('aria-disabled'), 'ToolCard must expose disabled semantics');
assert.ok(css.includes('.tool-card.disabled-card'), 'disabled-card styling missing');

const workbenchPath = new URL('../src/repeatability/RepeatabilityWorkbench.tsx', import.meta.url);
assert.ok(fs.existsSync(workbenchPath), 'RepeatabilityWorkbench.tsx must exist');
const workbench = fs.readFileSync(workbenchPath, 'utf8');
assert.ok(workbench.includes('attachShadow'), 'repeatability workbench must use Shadow DOM isolation');
assert.ok(!workbench.includes('<iframe'), 'repeatability integration must not use iframe');
assert.ok(workbench.includes('__AOI_REPEATABILITY_BACK__'), 'React back bridge missing');
assert.ok(workbench.includes('__AOI_REPEATABILITY_ROOT__'), 'ShadowRoot selector bridge missing');

// 04 与 05 必须共用同一套隔离机制：注入 document 代理，而不是替换旧 HTML 的源码文本。
assert.ok(workbench.includes('buildDocumentProxy'), 'repeatability must redirect element lookups through a document proxy');
assert.ok(workbench.includes('shadow.querySelector'), 'document proxy must route querySelector into the shadow root');
assert.ok(
  !workbench.includes('const $=s=>document.querySelector(s);'),
  'fragile source-string patching must not come back (breaks silently on any whitespace change)',
);
assert.ok(
  workbench.includes('new Function(') && workbench.includes(")(buildDocumentProxy(shadow))"),
  'legacy script must be booted with the document proxy injected',
);
assert.ok(workbench.includes('__AOI_EMBEDDED__'), 'workbench must set the embed flag before booting the legacy script');
assert.ok(
  workbench.includes("addEventListener('click', interceptBack, true)"),
  'back button must be intercepted in the capture phase instead of patching its source text',
);

const sourcePath = new URL('../src/repeatability/repeatability-v1.6.html', import.meta.url);
assert.ok(fs.existsSync(sourcePath), 'repeatability V1.6 source HTML must be bundled');
const source = fs.readFileSync(sourcePath, 'utf8');
assert.ok(source.includes('重复性分析 V1.6'), 'bundled repeatability source is not V1.6');
assert.ok(source.includes('data-panel="records"'), 'record-center tab must remain in bundled V1.6');

const scriptMatch = source.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(scriptMatch, 'V1.6 script block missing');
const legacyScript = scriptMatch[1];
assert.ok(
  source.includes('__AOI_EMBEDDED__') && /const\s+EMBEDDED\s*=\s*!!window\.__AOI_EMBEDDED__/.test(legacyScript),
  'legacy script must read the host embed flag',
);
// P0-3：嵌入态下点击 Tab 不得把宿主页面滚到顶部。
const scrollCalls = legacyScript.match(/window\.scrollTo\(/g) ?? [];
const guardedScrolls = legacyScript.match(/if\(!EMBEDDED\)window\.scrollTo\(/g) ?? [];
assert.ok(scrollCalls.length > 0, 'expected the legacy script to reference window.scrollTo');
assert.equal(
  scrollCalls.length, guardedScrolls.length,
  'every window.scrollTo in the legacy script must be guarded by !EMBEDDED, otherwise clicking any tab scrolls the host page',
);
new Function('document', legacyScript); // syntax check only; browser APIs are not executed here.

const corrWorkbenchPath = new URL('../src/correlation/CorrelationWorkbench.tsx', import.meta.url);
assert.ok(fs.existsSync(corrWorkbenchPath), 'CorrelationWorkbench.tsx must exist');
const corrWorkbench = fs.readFileSync(corrWorkbenchPath, 'utf8');
assert.ok(corrWorkbench.includes('attachShadow'), 'correlation workbench must use Shadow DOM isolation');
assert.ok(!corrWorkbench.includes('<iframe'), 'correlation integration must not use iframe');
assert.ok(corrWorkbench.includes('__AOI_CORRELATION_BACK__'), 'correlation back bridge missing');
assert.ok(corrWorkbench.includes('__AOI_CORRELATION_ROOT__'), 'correlation shadow root bridge missing');
assert.ok(corrWorkbench.includes("from 'echarts'"), 'correlation must inject echarts from npm');
assert.ok(corrWorkbench.includes("from 'xlsx'"), 'correlation must inject xlsx from npm');

const corrSourcePath = new URL('../src/correlation/correlation-v13.html', import.meta.url);
assert.ok(fs.existsSync(corrSourcePath), 'correlation v13 source HTML must be bundled');
const corrSource = fs.readFileSync(corrSourcePath, 'utf8');
assert.ok(!corrSource.includes('loadCdn'), 'correlation source must not rely on CDN loader');
assert.ok(!corrSource.includes('panelSingle'), 'correlation single-product panel must be removed');
assert.ok(!corrSource.includes('main-tab-bar'), 'correlation must not keep single/multi tab bar');
assert.ok(corrSource.includes('analyzeBySeat'), 'correlation judge core logic missing');

const corrScriptMatch = corrSource.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(corrScriptMatch, 'correlation script block missing');
const corrScript = corrScriptMatch[1];

// 语法级断言：字符串存在性断言证明不了"代码还能跑"，一条语法错误就能让 05 整页打不开。
// 参数顺序必须与 CorrelationWorkbench 注入的一致。
new Function('echarts', 'XLSX', 'document', corrScript);

// P1-2：空白点位必须跳过并计数，不能截断该产品剩余的所有点位。
assert.ok(corrScript.includes('pendingGaps'), 'correlation parser must skip-and-count gaps instead of truncating');
assert.ok(corrScript.includes('已跳过'), 'skipped points must be surfaced to the user');
assert.ok(corrScript.includes('p.missing'), 'products must carry the missing-point count for rendering');

// P2-4：乘坐名 = Excel sheet 名，是不受信字符串，拼进 innerHTML 前必须转义。
assert.ok(/const\s+esc\s*=/.test(corrScript), 'correlation must define an esc() helper');
// 乘坐名出现在这些渲染入口上，每一处都必须过 esc()：识别卡的逐乘坐行、对齐矩阵的列头
assert.ok(corrScript.includes('${esc(s.name)}'), 'recognize card seat names must be escaped before innerHTML');
assert.ok(corrScript.includes('${esc(sn)}'), 'alignment-matrix seat names must be escaped before innerHTML');
// 补偿表的"乘坐 / 覆盖乘坐"列统一走 seatLabelOf()，再由 esc() 包住（item 粒度下一个补偿值
// 会覆盖多个乘坐，列里是拼接出来的名单，所以必须确认拼接结果也被转义，而不是只转义单个 seat）
assert.ok(
  corrScript.includes('const seatLabelOf ='),
  'advice table must derive its seat label through a single helper (so escaping cannot be bypassed)',
);
assert.ok(
  corrScript.includes('${esc(seatLabelOf(x))}'),
  'advice table seat / covered-seat names must be escaped before innerHTML',
);
// 兜底：覆盖乘坐名来自 sheet 名，绝不允许把拼接结果直接插进 HTML 模板
assert.ok(
  !/html \+= `[^`]*\$\{\(x\.seats \|\| \[\]\)\.join/.test(corrScript),
  'covered-seat list must never be interpolated into an HTML template without esc()',
);
// 兜底（比逐个入口更耐重构的写法）：凡是 html += 模板里插值一个"乘坐名变量"，
// 前面必须紧跟 esc(。这样以后新增渲染入口时忘了转义，这里就会红。
assert.ok(
  !/html \+= `[^`]*\$\{(?!esc\()(?:[a-zA-Z_$][\w$.]*\.)?(?:seat|seatName|sn)\b/.test(corrScript),
  'raw seat names must never be interpolated into an HTML template without esc()',
);

// P2-13：从容器出发查询，不要依赖宿主把 document 代理进 Shadow DOM。
assert.ok(
  !corrScript.includes("document.querySelectorAll('#multiResultContainer"),
  'must query from the container element instead of document',
);

console.log('verify-repeatability-integration: PASS');
