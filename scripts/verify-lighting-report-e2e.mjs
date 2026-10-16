/**
 * 06 打光报告生成器 —— 真浏览器端到端
 *
 * 契约测试（verify-lighting-report.mjs）是拿 Node 直接跑 domain 的，
 * 拦不住「渲染层 / React 受控输入 / 事件绑定 / 离线单文件里 fetch 内联 data URI」这几类问题。
 * 这个脚本把整条链路真跑一遍：离线单文件 → 进 06 → 填表 → 点生成 → **拦下真下载** → 校验 pptx 字节。
 *
 * 之所以特别要验「下载」这一步：离线单文件版把 5MB 模板内联成了 data URI，
 * `fetch(dataURI)` 能不能取到字节、Blob 下载能不能触发，只有真浏览器能回答。
 *
 * 跑法：
 *   npm run build:offline && npm run verify:lighting-report-e2e
 * 找不到浏览器 → SKIP（退出码 0）；没构建 offline/index.html → FAIL（不能被 SKIP 掩盖）。
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const JSZip = require('jszip');

/* ── 零依赖造一张真 PNG（用来测上传 → 降采样 → 贴进 pptx）──────────────
   为什么不用现成图片：要验「长边超过 1600 会被压下来、没超的不放大」，
   就得精确控制输入尺寸，而把 2400×1800 的图 base64 塞进脚本又太丑。 */
function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function makePng(w, h) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const off = y * (w * 3 + 1);
    raw[off] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      const p = off + 1 + x * 3;
      raw[p] = (x * 255 / w) | 0;
      raw[p + 1] = (y * 255 / h) | 0;
      raw[p + 2] = 128;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const repo = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const OFFLINE = path.join(repo, 'offline', 'index.html');
if (!fs.existsSync(OFFLINE)) {
  console.log('FAIL: 找不到 offline/index.html —— 先跑 `npm run build:offline`');
  process.exit(1);
}

function findBrowser() {
  return [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ].find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } });
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let nextId = 0;
    const pending = new Map();
    const logs = [];
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      if (msg.method === 'Runtime.exceptionThrown') {
        logs.push('[exception] ' + (msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text));
        return;
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        logs.push('[console.error] ' + msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
        return;
      }
      const slot = msg.id !== undefined ? pending.get(msg.id) : undefined;
      if (!slot) return;
      pending.delete(msg.id);
      if (msg.error) slot.reject(new Error(msg.error.message));
      else slot.resolve(msg.result);
    });
    ws.addEventListener('error', () => reject(new Error('CDP ws error')));
    ws.addEventListener('open', () => resolve({
      logs,
      send(method, params = {}, sessionId) {
        return new Promise((res, rej) => {
          const id = ++nextId;
          pending.set(id, { resolve: res, reject: rej });
          ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
        });
      },
      close: () => ws.close(),
    }));
  });
}

async function waitForDevtools(port, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) return await r.json(); }
    catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('DevTools 未就绪');
}

const exe = findBrowser();
if (!exe) { console.log('SKIP: 没找到 Edge / Chrome'); process.exit(0); }

const port = 9800 + Math.floor(Math.random() * 150);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'aoi-lr-e2e-'));
const downloads = fs.mkdtempSync(path.join(os.tmpdir(), 'aoi-lr-dl-'));
/** 上传用的真图片（尺寸都是刻意选的，见下面的断言） */
const pics = fs.mkdtempSync(path.join(os.tmpdir(), 'aoi-lr-img-'));
const BIG_PNG = path.join(pics, 'CCD1_2400x1800.png');
const SMALL_PNG = path.join(pics, 'CCD1_800x1200.png');
fs.writeFileSync(BIG_PNG, makePng(2400, 1800));
fs.writeFileSync(SMALL_PNG, makePng(800, 1200));
const shots = path.resolve(repo, '..', 'outputs');
fs.mkdirSync(shots, { recursive: true });

const child = spawn(exe, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-gpu',
  '--disable-dev-shm-usage', '--mute-audio',
  '--host-resolver-rules=MAP fonts.googleapis.com 127.0.0.1:1, MAP fonts.gstatic.com 127.0.0.1:1',
  'about:blank',
], { stdio: 'ignore' });

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? '　→ ' + extra : ''}`); }
};

let cdp;
try {
  const version = await waitForDevtools(port);
  cdp = await connect(version.webSocketDebuggerUrl);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (m, p) => cdp.send(m, p, sessionId);
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('页面内执行失败：' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
    return r.result.value;
  };

  const t0 = Date.now();
  await send('Page.navigate', { url: pathToFileURL(OFFLINE).href });
  await evaluate(`new Promise(res => { if (document.readyState === 'complete') return res(true);
    window.addEventListener('load', () => res(true), { once: true }); })`);
  const ready = await evaluate(`new Promise(res => {
    const t = setInterval(() => { if (document.getElementById('lighting-report')) { clearInterval(t); res(true); } }, 50);
    setTimeout(() => { clearInterval(t); res(false); }, 30000); })`);
  console.log(`\n── 离线单文件 ${(fs.statSync(OFFLINE).size / 1048576).toFixed(1)} MB，加载 ${((Date.now() - t0) / 1000).toFixed(1)}s ──\n`);
  ok('离线单文件能打开并渲染出 06 卡片', ready);
  if (!ready) throw new Error('主页没渲染出 06 卡片');

  // 进 06
  const mounted = await evaluate(`new Promise(res => {
    document.getElementById('lighting-report').click();
    const t = setInterval(() => { if (document.querySelector('section.lr-shell')) { clearInterval(t); res(true); } }, 50);
    setTimeout(() => { clearInterval(t); res(false); }, 15000); })`);
  ok('点卡片进入 06，工作台挂载成功', mounted);

  ok('表单渲染出工站卡与预览卡', await evaluate(`!!document.querySelector('.lr-station') && !!document.querySelector('.lr-preview-card')`));
  ok('右下默认就是 1 个工站（「起码一个」）', await evaluate(`document.querySelectorAll('.lr-station').length === 1`));
  // 设备库要等 IndexedDB 播种完（首次打开时要几秒），轮询而不是立刻断言
  const camCount = await evaluate(`new Promise(res => {
    const t = setInterval(() => {
      const m = (document.querySelector('.lr-library-state')?.textContent ?? '').match(/(\\d+)\\s*台相机/);
      if (m) { clearInterval(t); res(Number(m[1])); }
    }, 100);
    setTimeout(() => { clearInterval(t); res(0); }, 30000); })`);
  ok('设备库在浏览器里加载到了全量（>1000 台相机）', camCount > 1000, `实际 ${camCount} 台`);

  // 用 React 的受控输入写值
  const fill = await evaluate(`(() => {
    const setValue = (el, value) => {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const cam = document.querySelector('input[placeholder="MV-CH250-90UC"]');
    const lens = document.querySelector('input[placeholder="DTCM110-80H-AL"]');
    const items = document.querySelector('input[placeholder="內徑,外徑,毛邊,破損"]');
    const light1 = document.querySelector('input[placeholder="LT-24V-120RT15-W"]');
    const light2 = document.querySelector('input[placeholder="LT-24V-91PF91-W"]');
    if (!cam || !lens || !items || !light1 || !light2) return false;
    setValue(cam, 'MV-CH250-90UC');
    setValue(lens, 'DTCM110-80H-AL');
    setValue(light1, 'LT-24V-120RT15-W');
    setValue(light2, 'LT-24V-91PF91-W');
    setValue(items, '內徑,外徑,毛邊,破損');
    return true;
  })()`);
  ok('能把相机/镜头/光源/检测项目填进表单', fill);

  await evaluate(`new Promise(r => setTimeout(r, 300))`);
  const previewText = await evaluate(`[...document.querySelectorAll('.lr-lines li')].map(li => li.textContent)`);
  ok('预览里的 FOV 按 03 的设备库算出来了（61.54）', previewText.some((t) => t.includes('FOV：61.54*61.54mm')), previewText.find((t) => t.startsWith('FOV')) ?? '（无 FOV 行）');
  ok('预览里的 DOF 按 40% 折减（±5.92mm）', previewText.some((t) => t.includes('±5.92mm')), previewText.find((t) => t.startsWith('DOF')) ?? '（无 DOF 行）');
  ok('预览里的 Resolution 5 位小数（0.01202）', previewText.some((t) => t.includes('Resolution：0.01202mm/pixel')));
  ok('还没加影像时：页序 = 封面/需求/工站/結論（4 页）',
    await evaluate(`document.querySelectorAll('.lr-outline li').length === 4`),
    await evaluate(`String(document.querySelectorAll('.lr-outline li').length)`));
  ok('状态条与按钮的页数同源（都是 4）',
    await evaluate(`document.querySelector('.lr-data-strip')?.textContent?.includes('4 页')`) &&
      (await evaluate(`[...document.querySelectorAll('button')].some(b => /生成并下载（4 页）/.test(b.textContent))`)));
  ok('未点生成前没有报错条', await evaluate(`!document.querySelector('.lr-alert-error')`));

  /* ── 版式选择器 + 【1.檢測需求】页（2026-09-30 那轮反馈的落点） ── */
  ok('顶部有模板族选择器，且默认选中 sealing',
    await evaluate(`(() => {
      const btns = [...document.querySelectorAll('.lr-template .lr-segmented button')];
      return btns.length >= 1 && btns.find(b => b.getAttribute('aria-pressed') === 'true')?.textContent?.trim() === '密封圈版';
    })()`));
  ok('需求页有可填的文字框（不再是外径/厚度/相机像素那几个字段）',
    await evaluate(`!!document.querySelector('.lr-requirement textarea') &&
      !document.querySelector('input[placeholder="評估報告"]')?.closest('section')?.textContent?.includes('最大外径')`));
  ok('需求页预览卡排在工站预览之前（封面后接的就是检测需求）',
    await evaluate(`document.querySelector('.lr-preview-card .lr-preview-no')?.textContent === 'DR'`));

  const reqFill = await evaluate(`(() => {
    const el = document.querySelector('.lr-requirement textarea');
    if (!el) return false;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, '端面密封圈內徑/厚度\\n6.7±0.03\\n公差 ±0.02');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true; })()`);
  await evaluate(`new Promise(r => setTimeout(r, 250))`);
  ok('需求页文字改完后，预览卡立刻跟着变（界面看到的 = 产出的）',
    reqFill && (await evaluate(`document.querySelector('.lr-preview-card')?.textContent?.includes('公差 ±0.02')`)),
    await evaluate(`document.querySelector('.lr-preview-card')?.textContent ?? ''`));

  /* ── 工站级「需求推导」：公差在本站填，不在需求段 ── */
  ok('工站卡里有独立的需求推导块（逐工站，不是全报告一份）',
    await evaluate(`!!document.querySelector('.lr-require-block')`));
  ok('需求推导块显示「相机像素识别自本站型号」',
    await evaluate(`/25M/.test(document.querySelector('.lr-require-head')?.textContent ?? '')`),
    await evaluate(`document.querySelector('.lr-require-head')?.textContent ?? ''`));
  const reqDerived = await evaluate(`[...document.querySelectorAll('.lr-require-block .lr-derived code')].map(c => c.textContent)`);
  ok('需求推导 4 行在界面上就出来了（含公差帶与理想解析度）',
    reqDerived.some((t) => t.includes('最小公差±0.08mm，公差帶=0.16')) &&
      reqDerived.some((t) => t.includes('理想系統解析度=1/8~1/10  → 0.016~0.02mm')) &&
      reqDerived.some((t) => t.includes('選用25M Camera彩色相機 + 0.208x 遠心鏡頭')),
    reqDerived.join(' | '));

  const tolFill = await evaluate(`(() => {
    const el = document.querySelector('.lr-require-block .lr-tol-row input[type=number]');
    if (!el) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '0.15');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true; })()`);
  await evaluate(`new Promise(r => setTimeout(r, 250))`);
  ok('改本站公差 → 需求推导立刻重算（0.08 → 0.15，公差帶 0.3）',
    tolFill && (await evaluate(`[...document.querySelectorAll('.lr-require-block .lr-derived code')].some(c => c.textContent.includes('最小公差±0.15mm，公差帶=0.3'))`)),
    await evaluate(`[...document.querySelectorAll('.lr-require-block .lr-derived code')].map(c => c.textContent).join(' | ')`));

  /* ── 打光影像段：按檢測項目建组 → 改名 → 加页 → 切版式 → 填说明 ── */
  const mkGroup = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('.lr-images-head button')].find(b => /按檢測項目建组/.test(b.textContent));
    if (!btn || btn.disabled) return false; btn.click(); return true; })()`);
  await evaluate(`new Promise(r => setTimeout(r, 250))`);
  const groupsFromItems = await evaluate(`document.querySelectorAll('.lr-img-group').length`);
  ok('「按檢測項目建组」一键建出 4 组（= 上面填的 4 个檢測項目）', mkGroup && groupsFromItems === 4, `实际 ${groupsFromItems} 组`);

  // 删掉后 3 组，只留 1 组（从尾部删，下标不会漂）
  for (let i = 0; i < 3; i++) {
    await evaluate(`(() => {
      const btns = [...document.querySelectorAll('.lr-img-group-tools button')].filter(b => /组/.test(b.textContent));
      btns[btns.length - 1]?.click(); return true; })()`);
    await evaluate(`new Promise(r => setTimeout(r, 150))`);
  }
  ok('能删缺陷组，回到 1 组', await evaluate(`document.querySelectorAll('.lr-img-group').length === 1`));

  // 改名（当前是「內徑」）→ 破損
  await evaluate(`(() => {
    const el = document.querySelector('.lr-img-defect input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '破損');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true; })()`);
  await evaluate(`new Promise(r => setTimeout(r, 200))`);
  ok('标题条预览跟着缺陷名走（3.打光影像-破損）',
    (await evaluate(`document.querySelector('.lr-img-bar')?.textContent`)) === '3.打光影像-破損');

  // 加 2 页
  for (let i = 0; i < 2; i++) {
    await evaluate(`(() => {
      const btn = [...document.querySelectorAll('.lr-img-group-tools button')].find(b => /＋ 页/.test(b.textContent));
      btn?.click(); return true; })()`);
    await evaluate(`new Promise(r => setTimeout(r, 180))`);
  }
  ok('能给缺陷组加页（2 页）', await evaluate(`document.querySelectorAll('.lr-img-page').length === 2`));
  ok('新页名称默认带缺陷名（打光影像-破損，不带章节号）',
    await evaluate(`document.querySelectorAll('.lr-img-caption')[0].value === '打光影像-破損' &&
      document.querySelectorAll('.lr-img-caption')[1].value === '打光影像-破損'`),
    await evaluate(`[...document.querySelectorAll('.lr-img-caption')].map(i => i.value).join(' | ')`));

  // 第 2 页切成「特殊」→ 名称应自动补 -特殊（因为没被手改过）
  await evaluate(`(() => {
    const row = document.querySelectorAll('.lr-img-page')[1];
    const btn = [...row.querySelectorAll('.lr-segmented button')].find(b => b.textContent.trim() === '特殊');
    btn?.click(); return true; })()`);
  await evaluate(`new Promise(r => setTimeout(r, 200))`);
  ok('切「特殊」时未手改过的名称自动补 -特殊',
    (await evaluate(`document.querySelectorAll('.lr-img-caption')[1].value`)) === '打光影像-破損-特殊');
  ok('第 1 页仍是普通版式、名称没被动过',
    (await evaluate(`document.querySelectorAll('.lr-img-caption')[0].value`)) === '打光影像-破損');
  ok('名称行默认值不带章节号（只有标题条才有 3.）',
    (await evaluate(`document.querySelectorAll('.lr-img-caption')[0].value`)).indexOf('3.') === -1);

  // 给第 1 页写 2 行说明（第 2 行故意带 **…**，验红字标记整条链路）
  await evaluate(`(() => {
    const el = document.querySelectorAll('.lr-img-desc')[0];
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, '打光角度 15 度\\n**曝光 2000us**');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true; })()`);
  await evaluate(`new Promise(r => setTimeout(r, 250))`);

  ok('说明里的 **…** 在画布预览上就渲染成红字（预览与产物同源）',
    await evaluate(`document.querySelector('.lr-canvas-caption .lr-hl')?.textContent === '曝光 2000us'`),
    await evaluate(`document.querySelector('.lr-canvas-caption')?.textContent ?? ''`));

  const outline = await evaluate(`[...document.querySelectorAll('.lr-outline li')].map(li => li.textContent.trim())`);
  ok('加影像后页序变成 6 页（封面/需求/工站/影像×2/結論）', outline.length === 6, outline.join(' | '));
  ok('影像页紧跟在工站后面（不是排在最后）',
    outline[2].includes('工站') && outline[3].includes('影像') && outline[4].includes('影像') && outline[5].includes('結論'),
    outline.join(' | '));
  ok('页序里两页影像标出了缺陷名与版式',
    outline[3].includes('破損') && outline[3].includes('普通') && outline[4].includes('特殊'), outline.slice(3, 5).join(' | '));

  /* ── P2b：上传图片 → 降采样 → 自动摆放 → 拖图 → 画红圈 ──
     用 CDP 把**真文件**塞进 `<input type=file>`，等价于用户点「＋ 加图片」挑文件。
     这样才验得到 createImageBitmap → canvas 重编码 → dataURL 这条只有浏览器才有的链路。 */
  await send('DOM.enable');
  const dom = await send('DOM.getDocument', { depth: -1 });
  const inputNode = await send('DOM.querySelector', { nodeId: dom.root.nodeId, selector: '.lr-img-pages input[type="file"]' });
  ok('找得到「＋ 加图片」背后的 file input', Boolean(inputNode.nodeId));
  await send('DOM.setFileInputFiles', { files: [BIG_PNG, SMALL_PNG], nodeId: inputNode.nodeId });

  const slotsReady = await evaluate(`new Promise(res => {
    const t = setInterval(() => {
      if (document.querySelectorAll('.lr-img-pages .lr-img-page:first-child .lr-slot').length === 2) { clearInterval(t); res(true); }
    }, 100);
    setTimeout(() => { clearInterval(t); res(document.querySelectorAll('.lr-slot').length); }, 20000); })`);
  ok('两张图被读进来并加进这一页', slotsReady === true, String(slotsReady));

  const metas = await evaluate(`[...document.querySelectorAll('.lr-img-pages .lr-img-page:first-child .lr-slot-meta')].map(e => e.textContent)`);
  ok('2400×1800 的图被降到 1600×1200（长边阈值 IMAGE_MAX_PX）', metas[0]?.includes('1600×1200px'), metas[0] ?? '（无）');
  ok('800×1200 的图原样不动（不放大）', metas[1]?.includes('800×1200px'), metas[1] ?? '（无）');

  const thumbs = await evaluate(`[...document.querySelectorAll('.lr-img-pages .lr-img-page:first-child .lr-slot-thumb')].map(i => i.src.slice(0, 24))`);
  ok('上传的 PNG 已统一重编码成 JPEG（产物体积才不会失控）', thumbs.every((s) => s.startsWith('data:image/jpeg;base64,')));

  ok('画布上出现 2 张图', await evaluate(`document.querySelectorAll('.lr-img-page .lr-canvas-pic').length === 2`));
  ok('新加的图默认是「自动摆放」', await evaluate(`document.querySelector('.lr-canvas-state')?.textContent?.includes('自动摆放')`));
  ok('自动摆放的两张图互不重叠',
    await evaluate(`(() => {
      const r = [...document.querySelectorAll('.lr-img-page .lr-canvas-pic')].map(e => e.getBoundingClientRect());
      return r.every((a, i) => r.every((b, j) => i === j || a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1));
    })()`));

  /* 拖动第一张图 —— 走的是 window 上的 pointermove/pointerup（组件只注册一次监听） */
  const beforeRect = await evaluate(`(() => { const b = document.querySelectorAll('.lr-img-page .lr-canvas-pic')[0].getBoundingClientRect(); return { l: b.left, t: b.top }; })()`);
  await evaluate(`(() => {
    const pic = document.querySelectorAll('.lr-img-page .lr-canvas-pic')[0];
    const b = pic.getBoundingClientRect();
    const opt = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    pic.dispatchEvent(new PointerEvent('pointerdown', { ...opt, clientX: cx, clientY: cy }));
    window.dispatchEvent(new PointerEvent('pointermove', { ...opt, clientX: cx + 40, clientY: cy + 30 }));
    window.dispatchEvent(new PointerEvent('pointerup', { ...opt, clientX: cx + 40, clientY: cy + 30 }));
    return true; })()`);
  // React 的状态提交是异步的 —— 必须等它重渲染完再量，否则量到的是拖动前的 DOM
  await evaluate(`new Promise(r => setTimeout(r, 250))`);
  const afterRect = await evaluate(`(() => { const b = document.querySelectorAll('.lr-img-page .lr-canvas-pic')[0].getBoundingClientRect(); return { l: b.left, t: b.top }; })()`);
  const moved = { dx: Math.round(afterRect.l - beforeRect.l), dy: Math.round(afterRect.t - beforeRect.t) };
  ok('拖图真的动了（不是只改状态）', moved.dx !== 0 || moved.dy !== 0, JSON.stringify(moved));
  ok('拖过之后本页转为「手动摆放」', await evaluate(`document.querySelector('.lr-canvas-state')?.textContent?.includes('手动摆放')`));
  ok('被拖的那张标成「已固定」，另一张跟着固化（不会松手后跳回去）',
    await evaluate(`document.querySelectorAll('.lr-img-page .lr-slot-tag').length === 2 &&
      [...document.querySelectorAll('.lr-img-page .lr-slot-tag')].every(e => e.textContent.includes('已固定'))`));

  /* 切到画红圈，在一张图上拖出一个框 */
  await evaluate(`(() => {
    const btn = [...document.querySelectorAll('.lr-img-page .lr-canvas-bar button')].find(b => b.textContent.trim() === '画红圈');
    if (!btn || btn.disabled) return false; btn.click(); return true; })()`);
  await evaluate(`new Promise(r => setTimeout(r, 150))`);
  await evaluate(`(() => {
    const pic = document.querySelectorAll('.lr-img-page .lr-canvas-pic')[0];
    const b = pic.getBoundingClientRect();
    const opt = { bubbles: true, cancelable: true, pointerId: 2, pointerType: 'mouse', isPrimary: true };
    const x1 = b.left + b.width * 0.2, y1 = b.top + b.height * 0.25;
    const x2 = b.left + b.width * 0.6, y2 = b.top + b.height * 0.7;
    pic.dispatchEvent(new PointerEvent('pointerdown', { ...opt, clientX: x1, clientY: y1 }));
    window.dispatchEvent(new PointerEvent('pointermove', { ...opt, clientX: x2, clientY: y2 }));
    window.dispatchEvent(new PointerEvent('pointerup', { ...opt, clientX: x2, clientY: y2 }));
    return true; })()`);
  await evaluate(`new Promise(r => setTimeout(r, 250))`);
  ok('拖拽画出了一个红圈', await evaluate(`document.querySelectorAll('.lr-img-page .lr-canvas-circle').length === 1`));
  ok('图片清单上也记了「圈 1」',
    await evaluate(`[...document.querySelectorAll('.lr-img-page .lr-slot-circles')].some(e => e.textContent.includes('圈 1'))`));

  // 点生成 → 拦下载
  const clicked = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => /生成并下载/.test(b.textContent));
    if (!btn) return false; btn.click(); return true; })()`);
  ok('找得到「生成并下载」按钮', clicked);

  const deadline = Date.now() + 180000;
  let file = null;
  while (Date.now() < deadline) {
    const found = fs.readdirSync(downloads).filter((n) => n.endsWith('.pptx') && !n.endsWith('.crdownload'));
    if (found.length) { file = path.join(downloads, found[0]); break; }
    await new Promise((r) => setTimeout(r, 500));
  }
  ok('浏览器真的产出了 pptx 文件（内联模板的 fetch + Blob 下载都通了）', Boolean(file), file ?? '超时 180s');

  if (file) {
    const size = fs.statSync(file).size;
    /* 阈值跟着模板走：模板瘦身后（5.2MB → 89KB）产物本来就只有 120KB 上下。
       这里只要拦住「下到一个 0 字节 / 几 KB 的壳」这种情况，不必卡得那么死。 */
    const tplBytes = fs.statSync(path.join(repo, 'src/lighting-report/assets/template.pptx')).size;
    ok(`产物不是空文件（${(size / 1024).toFixed(0)} KB ≥ 模板 ${(tplBytes / 1024).toFixed(0)} KB）`,
      size > tplBytes, `${size} bytes vs 模板 ${tplBytes}`);
    const zip = await JSZip.loadAsync(fs.readFileSync(file));
    const pres = await zip.file('ppt/presentation.xml').async('text');
    const sldIds = [...pres.matchAll(/<p:sldId id="\d+" r:id="(rId\d+)"\/>/g)].map((m) => m[1]);
    const pages = sldIds.length;
    ok('产物是合法 pptx，页数 = 6（封面 + 需求 + 工站 + 影像×2 + 結論）', pages === 6, String(pages));

    // sldIdLst 顺序 → 真实 part 名（页序的唯一权威）
    const rels = await zip.file('ppt/_rels/presentation.xml.rels').async('text');
    const relMap = new Map([...rels.matchAll(/Id="(rId\d+)"[^>]*Target="slides\/(slide\d+\.xml)"/g)].map((m) => [m[1], m[2]]));
    const orderParts = sldIds.map((r) => relMap.get(r));
    const slideXml = async (n) => (orderParts[n] ? ((await zip.file(`ppt/slides/${orderParts[n]}`)?.async('text')) ?? '') : '');

    const s3 = await zip.file(`ppt/slides/${orderParts[2]}`).async('text');
    ok('第 3 页工站页已填入真实内容（无残留占位符）', !/\{\{/.test(s3));
    ok('第 3 页相机型号来自表单', s3.includes('MV-CH250-90UC'));
    ok('(新增) 红 run 已重建', (s3.match(/FF0000/g) ?? []).length >= 4);

    /* 【1.檢測需求】= 第 2 页（封面之后）：表单里填的三行真的落进了 pptx，
       而且本站公差是**改过之后**的 0.15（证明逐工站需求推导通了）。 */
    const s2 = await zip.file(`ppt/slides/${orderParts[1]}`).async('text');
    const paraText = (xml) => [...xml.matchAll(/<a:p>[\s\S]*?<\/a:p>/g)]
      .map((m) => [...m[0].matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map((z) => z[1]).join(''));
    const p2 = paraText(s2).filter((l) => l.trim());
    ok('需求页（第 2 页）写进了表单里那三行（一行一段，按顺序）',
      p2.join(' | ') === '1.檢測需求 | 端面密封圈內徑/厚度 | 6.7±0.03 | 公差 ±0.02', p2.join(' | '));
    ok('需求页不再带源报告的产品照（pic = 0）', (s2.match(/<p:pic>/g) ?? []).length === 0);
    ok('工站页的需求推导用的是**本站**公差（改过之后是 0.15，公差帶 0.3）',
      paraText(s3).some((l) => l.includes('最小公差±0.15mm，公差帶=0.3')),
      paraText(s3).filter((l) => l.includes('最小公差')).join(' | '));

    const ct = await zip.file('[Content_Types].xml').async('text');
    ok('包内 slide Override 数 = 页数', (ct.match(/PartName="\/ppt\/slides\/slide\d+\.xml"/g) ?? []).length === pages);

    const img4 = await slideXml(3);
    const img5 = await slideXml(4);
    /** 段落文字：整段的 <a:t> 拼起来（标红会把一段切成多个 run，必须拼） */
    const parasOf = (xml) => [...xml.matchAll(/<a:p>[\s\S]*?<\/a:p>/g)]
      .map((m) => [...m[0].matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map((z) => z[1]).join(''));
    /** 承载某段文字的那个 run */
    const runOf = (xml, text) => {
      const esc = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const m = [...xml.matchAll(/<a:r>([\s\S]*?)<\/a:r>/g)].find((r) =>
        new RegExp(`<a:t(?:\\s[^>]*)?>${esc}</a:t>`).test(r[1]));
      return m ? m[0] : null;
    };

    ok('第 4 张（工站后第一张）是普通影像页，标题条 = 3.打光影像-破損', img4.includes('3.打光影像-破損'));
    ok('第 4 张写进了名称与 2 行说明', img4.includes('打光影像-破損') && img4.includes('打光角度 15 度') && img4.includes('曝光 2000us'));
    ok('说明里的 **…** 导出后是红加粗、且星号没被印进 PPT',
      !img4.includes('**') && /FF0000/.test(runOf(img4, '曝光 2000us') ?? ''),
      (runOf(img4, '曝光 2000us') ?? '（没找到该 run）').slice(-80));
    const p5 = parasOf(img5);
    ok('第 5 张是特殊影像页，名称带 -特殊', p5.includes('打光影像-破損-特殊'), p5.join(' | '));
    ok('名称行结尾的 -特殊 导出后是红加粗（源报告 slide8 实测色）',
      /FF0000/.test(runOf(img5, '-特殊') ?? '') && /b="1"/.test(runOf(img5, '-特殊') ?? ''),
      (runOf(img5, '-特殊') ?? '（没找到该 run）').slice(-80));
    ok('第 5 张没有第 1 页那条说明（各页互不串味）', !img5.includes('打光角度 15 度'));
    ok('影像页没有残留占位符', !/\{\{/.test(img4) && !/\{\{/.test(img5));
    ok('两个影像页是各自克隆出来的（不是同一个 part）', orderParts[3] !== orderParts[4], `${orderParts[3]} / ${orderParts[4]}`);
    const parts = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length;
    ok('六个壳全部用到、没有多余的空壳页留下', parts === 6, `包内 ${parts} 个 slide`);

    /* ── P2b：上传的图真的进了包（字节 / 关系 / 图形）── */
    const imgRels = await zip.file(`ppt/slides/_rels/${orderParts[3]}.rels`).async('text');
    const targets = [...imgRels.matchAll(/Type="[^"]*\/image" Target="\.\.\/media\/([^"]+)"/g)].map((m) => m[1]);
    ok('第 4 张影像页的 rels 挂了 2 条 image 关系', targets.length === 2, targets.join(','));

    // 模板工站页自带 9 个媒体（光路图那几张），所以不能只数 media 总数 —— 要数「新加的」
    const tplZip = await JSZip.loadAsync(fs.readFileSync(path.join(repo, 'src/lighting-report/assets/template.pptx')));
    const tplMedia = Object.keys(tplZip.files).filter((n) => /^ppt\/media\/[^/]+$/.test(n));
    const allMedia = Object.keys(zip.files).filter((n) => /^ppt\/media\/[^/]+$/.test(n));
    const addedMedia = allMedia.filter((n) => !tplMedia.includes(n));
    ok(`上传的 2 张图是新加的 media 部件（模板原有 ${tplMedia.length} 个没被顶掉）`,
      addedMedia.length === 2, addedMedia.join(','));
    ok('新加的 media 都是 JPEG（不是把 PNG 原样塞进来）',
      addedMedia.every((n) => /\.jpe?g$/i.test(n)) && /<Default Extension="jpeg"/.test(ct),
      addedMedia.join(','));
    ok('影像页 rels 指向的就是这两张新图',
      addedMedia.every((n) => targets.includes(n.replace('ppt/media/', ''))), targets.join(','));

    ok('页里正好 2 个 `<p:pic>` 与 1 个红圈椭圆',
      (img4.match(/<p:pic>/g) ?? []).length === 2 && (img4.match(/prstGeom prst="ellipse"/g) ?? []).length === 1,
      `pic=${(img4.match(/<p:pic>/g) ?? []).length} ellipse=${(img4.match(/prstGeom prst="ellipse"/g) ?? []).length}`);
    ok('红圈是 1pt 实心红（与源报告实测一致）', /<a:ln w="12700"><a:solidFill><a:srgbClr val="FF0000"\/>/.test(img4));
    ok('红圈排在图片之后（圈画在图上，不会被图片盖住）',
      img4.lastIndexOf('<p:pic>') < img4.lastIndexOf('prstGeom prst="ellipse"'));
    ok('另一个影像页没有图（各页互不串味）', !/<p:pic>/.test(await slideXml(4)));
  }

  // 再加一个工站，验证克隆走浏览器路径
  const added = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => /添加工站/.test(b.textContent));
    if (!btn) return false; btn.click(); return true; })()`);
  await evaluate(`new Promise(r => setTimeout(r, 300))`);
  ok('能添加工站（变成 2 个）', added && (await evaluate(`document.querySelectorAll('.lr-station').length === 2`)));
  ok('增站后页数提示变成 7（新站还没影像，只多 1 页）', await evaluate(`document.querySelector('.lr-data-strip')?.textContent?.includes('7 页')`),
    await evaluate(`document.querySelector('.lr-data-strip')?.textContent ?? ''`));
  ok('新站自带一个空的打光影像区（可以立刻建组）',
    await evaluate(`document.querySelectorAll('.lr-station')[1].querySelectorAll('.lr-img-group').length === 0 &&
      !!document.querySelectorAll('.lr-station')[1].querySelector('.lr-images')`));
  ok('新站的相机/镜头是空的（不复制上一站，避免误填）',
    await evaluate(`document.querySelectorAll('.lr-station')[1].querySelector('input[placeholder="MV-CH250-90UC"]').value === ''`));

  const removed = await evaluate(`(() => {
    const cards = document.querySelectorAll('.lr-station');
    const btn = cards[cards.length - 1].querySelector('button[aria-label="删除该工站"]');
    if (!btn || btn.disabled) return false; btn.click(); return true; })()`);
  await evaluate(`new Promise(r => setTimeout(r, 300))`);
  ok('能删工站回到 1 个', removed && (await evaluate(`document.querySelectorAll('.lr-station').length === 1`)));
  ok('只剩 1 站时删除按钮被禁用（起码一个）', await evaluate(`document.querySelector('button[aria-label="删除该工站"]').disabled === true`));

  // 截图留档（先切到桌面宽度，否则截出来是窄视口下的单列版，看不出左右分栏）
  try {
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false });
    await evaluate(`new Promise(r => setTimeout(r, 300))`);
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(path.join(shots, 'tool06-lighting-report-ui.png'), Buffer.from(shot.data, 'base64'));
    await send('Emulation.clearDeviceMetricsOverride');
    console.log(`  截图 → outputs/tool06-lighting-report-ui.png`);
  } catch { /* 截图失败不影响结论 */ }

  const noise = cdp.logs.filter((l) => !/favicon/i.test(l));
  ok('全程零 JS 异常 / 零 console.error', noise.length === 0, noise.slice(0, 3).join(' | '));
} finally {
  try { cdp?.close(); } catch { /* ignore */ }
  child.kill();
  // 浏览器退出前会握着 CrashpadMetrics 之类的文件，删不掉是常态 —— 不能让它把结论吃掉
  await new Promise((r) => setTimeout(r, 600));
  try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* 临时目录留给系统清 */ }
  try { fs.rmSync(downloads, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* 同上 */ }
  try { fs.rmSync(pics, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* 同上 */ }
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}　${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
