import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = read('src/App.tsx');
const types = read('src/types.ts');
const toolCard = read('src/components/ToolCard.tsx');
const css = read('src/index.css');

assert.ok(types.includes("'repeatability'"), 'ToolId must include repeatability');
assert.ok(!types.includes("'correlation'"), 'correlation must not be an openable ToolId yet');
assert.ok(app.includes('index="04"'), 'homepage must include tool 04');
assert.ok(app.includes('title="重复性分析"'), 'homepage must include repeatability card');
assert.ok(app.includes('index="05"'), 'homepage must include tool 05 placeholder');
assert.ok(app.includes('title="相关性分析"'), 'homepage must include correlation placeholder');
assert.ok(app.includes('disabled'), 'correlation placeholder must be disabled');
assert.ok(app.includes("activeTool === 'repeatability' && <RepeatabilityWorkbench onBack={handleClose} />"), 'repeatability must render inline');
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

console.log('verify-repeatability-integration: PASS');
