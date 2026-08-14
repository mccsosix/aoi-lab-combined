import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = read('src/App.tsx');
const css = read('src/index.css');
const repeatability = read('src/repeatability/RepeatabilityWorkbench.tsx');

assert.ok(app.includes('ToolWorkbenchNav'), 'App must use the shared tool workbench navigation bar');
assert.ok(app.includes("activeTool === null"), 'homepage content must only render in toolbox mode');
assert.ok(app.includes('id="tool-workbench"'), 'active tool mode needs a stable workbench anchor');
assert.ok(app.includes('returnFocusToTool'), 'closing a tool must restore the user to the originating card');
assert.ok(css.includes('.workbench-nav'), 'workbench navigation styling is missing');
assert.ok(css.includes('.workbench-shell'), 'workbench shell styling is missing');
assert.ok(repeatability.includes('color:var(--ink)'), 'repeatability root must explicitly restore dark text color');
assert.ok(repeatability.includes('#btnBack { display:none'), 'legacy repeatability back button must be hidden when shared navigation is present');

console.log('verify-workspace-navigation: PASS');
