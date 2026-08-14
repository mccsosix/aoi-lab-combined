import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = read('src/App.tsx');
const workbench = read('src/fov/components/FovWorkbench.tsx');
const report = read('src/fov/components/ReportResult.tsx');
const css = read('src/fov/fov.css');
const cameras = JSON.parse(read('src/fov/data/cameras.json'));

assert.ok(!app.includes("if (activeTool === 'fov')"), 'FOV must not replace the whole app');
assert.ok(app.includes("onOpen={() => handleOpen('fov')}"), 'FOV card must open the FOV workbench');
assert.ok(app.includes("activeTool === 'fov' && <FovWorkbench onBack={handleClose} showBackAction={false} />"), 'FOV must render inside the shared workbench without a duplicate back action');
assert.ok(workbench.includes('className="fov-utility-bar"'), 'compact utility bar missing');
assert.ok(workbench.includes('className="usage-tips"'), 'usage tips missing');
assert.ok(report.includes('className="result-kpi-grid"'), 'KPI result grid missing');
assert.ok(report.includes('设备组合详情'), 'device detail section missing');
assert.ok(css.includes('grid-template-columns: minmax(360px, 420px) minmax(0, 1fr)'), 'manual layout must reserve 360-420px for input');
assert.ok(css.includes('@media (max-width: 1023px)'), '1024px responsive stack breakpoint missing');

const required = new Map([
  ['M3ST518M-H-O2C', { brand: '度申 / Do3think', fps: 85, w: 2448, h: 2048 }],
  ['M3ST518-H-O2C', { brand: '度申 / Do3think', fps: 85, w: 2448, h: 2048 }],
  ['M3ST1209M-H-O2C', { brand: '度申 / Do3think', fps: 33, w: 4096, h: 3072 }],
  ['M3ST1209-H-O2C', { brand: '度申 / Do3think', fps: 31.9, w: 4096, h: 3072 }],
  ['U3P2500M-H', { brand: '度申 / Do3think', fps: 17, w: 5120, h: 5120 }],
  ['U3P2500-H', { brand: '度申 / Do3think', fps: 17, w: 5120, h: 5120 }],
  ['OPT-CC2-M050-UG2-10', { brand: 'OPT', fps: 35.6, w: 2448, h: 2048 }],
  ['OPT-CC2-C050-UG2-10', { brand: 'OPT', fps: 35.6, w: 2448, h: 2048 }],
  ['OPT-CC2-M050-UG4-11', { brand: 'OPT', fps: 77.39, w: 2448, h: 2048 }],
  ['OPT-CC2-C050-UG4-11', { brand: 'OPT', fps: 77.39, w: 2448, h: 2048 }],
  ['OPT-CC2-M120-UG4-00', { brand: 'OPT', fps: 30.8, w: 4096, h: 3072 }],
  ['OPT-CC2-C120-UG4-00', { brand: 'OPT', fps: 30.8, w: 4096, h: 3072 }],
  ['OPT-CC2-M250-UG4-00', { brand: 'OPT', fps: 14.8, w: 5120, h: 5120 }],
  ['OPT-CC2-C250-UG4-00', { brand: 'OPT', fps: 14.8, w: 5120, h: 5120 }],
]);

assert.equal(cameras.length, 1147, `expected 1147 default cameras, got ${cameras.length}`);
for (const [model, expected] of required) {
  const matches = cameras.filter((item) => item.model === model);
  assert.equal(matches.length, 1, `${model} must appear exactly once`);
  const item = matches[0];
  assert.equal(item.brand, expected.brand, `${model} brand mismatch`);
  assert.equal(item.fps, expected.fps, `${model} fps mismatch`);
  assert.equal(item.resolutionWidthPx, expected.w, `${model} width mismatch`);
  assert.equal(item.resolutionHeightPx, expected.h, `${model} height mismatch`);
  assert.ok(item.sensorWidthMm > 0 && item.sensorHeightMm > 0 && item.sensorDiagonalMm > 0, `${model} physical sensor size missing`);
  assert.equal(item.lensMount, 'C-Mount', `${model} mount mismatch`);
  assert.equal(item.dataInterface, 'USB3.0', `${model} data interface mismatch`);
  assert.equal(item.shutterType, 'Global', `${model} shutter mismatch`);
}

console.log(`verify-fov-update: PASS (${cameras.length} cameras, ${required.size} spreadsheet models checked)`);
