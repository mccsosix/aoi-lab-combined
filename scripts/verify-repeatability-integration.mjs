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

const sourcePath = new URL('../src/repeatability/repeatability-v1.6.html', import.meta.url);
assert.ok(fs.existsSync(sourcePath), 'repeatability V1.6 source HTML must be bundled');
const source = fs.readFileSync(sourcePath, 'utf8');
assert.ok(source.includes('重复性分析 V1.6'), 'bundled repeatability source is not V1.6');
assert.ok(source.includes('data-panel="records"'), 'record-center tab must remain in bundled V1.6');

const scriptMatch = source.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(scriptMatch, 'V1.6 script block missing');
let patchedLegacy = scriptMatch[1]
  .replace(
    'const $=s=>document.querySelector(s);',
    'const $=s=>(window.__AOI_REPEATABILITY_ROOT__||document).querySelector(s);',
  )
  .replace(
    'const $$=s=>[...document.querySelectorAll(s)];',
    () => 'const $$=s=>[...(window.__AOI_REPEATABILITY_ROOT__||document).querySelectorAll(s)];',
  )
  .replace(
    /\$\('#btnBack'\)\.addEventListener\('click',\(\)=>\{if\(history\.length>1\)history\.back\(\);else toast\('独立 HTML 模式下没有上一页；整合进 AOI LAB 后此按钮返回工具箱。'\);\}\);/,
    "$('#btnBack').addEventListener('click',()=>{window.__AOI_REPEATABILITY_BACK__?.();});",
  );
assert.ok(patchedLegacy.includes('__AOI_REPEATABILITY_ROOT__'), 'legacy selectors were not redirected to the shadow root');
assert.ok(patchedLegacy.includes('__AOI_REPEATABILITY_BACK__'), 'legacy back button was not redirected to React');
assert.ok(!patchedLegacy.includes('history.back()'), 'legacy history.back must not remain after patching');
new Function(patchedLegacy); // syntax check only; browser APIs are not executed here.

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

console.log('verify-repeatability-integration: PASS');
