/**
 * 浏览器冒烟测试 —— 唯一能验证"04/05 的宿主注入真的生效"的检查。
 *
 * 为什么需要它：04/05 是两个 HTML 字符串，经 `new Function` 注入 document 代理后执行。
 * 其它 verify 脚本只能断言源码里有没有某段文本，断言不了"$ 是否真的指向 ShadowRoot"。
 * 04 的历史实现在注入失配时就是"工具一打开即抛错"，而源码断言完全拦不住。
 *
 * 零依赖：直接用 Node 22 内置的 WebSocket 讲 CDP，不需要 playwright/puppeteer。
 * 找不到 Chromium / Edge 时**跳过**（退出码 0），不会阻塞其它自检。
 *
 * 用法：
 *   node scripts/smoke-browser.mjs [网页地址]
 *   默认测 offline/index.html（需先 npm run build:offline）
 *   也可指定 http://localhost:5173（dev server）
 *   用 AOI_BROWSER=<exe 路径> 指定浏览器
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

// ───────────────────────── 找浏览器 ─────────────────────────
function findBrowser() {
  const found = [];
  if (process.env.AOI_BROWSER) found.push(process.env.AOI_BROWSER);

  const pwRoots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright'),
    path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright'),
    path.join(os.homedir(), '.cache', 'ms-playwright'),
  ].filter(Boolean);

  const variants = [
    'chrome-win64/chrome.exe', 'chrome-win/chrome.exe',
    'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
    'chrome-linux64/chrome', 'chrome-linux/chrome',
    'chrome-headless-shell-win64/chrome-headless-shell.exe',
    'chrome-headless-shell-mac/Chromium.app/Contents/MacOS/chromium-headless-shell',
    'chrome-headless-shell-linux64/chrome-headless-shell',
  ];
  const full = [];
  const shell = [];
  for (const root of pwRoots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root)) {
      if (!entry.startsWith('chromium')) continue;
      for (const v of variants) {
        const p = path.join(root, entry, v);
        if (fs.existsSync(p)) (v.includes('headless-shell') ? shell : full).push(p);
      }
    }
  }
  found.push(...full, ...shell);
  found.push(
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  );
  return found.find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } });
}

// ───────────────────────── 极简 CDP 客户端 ─────────────────────────
/** 页面日志（console + 未捕获异常），失败时打印，避免只能看到"没挂载出来"这种无信息量结论 */
const pageLog = [];
function recordPageEvent(msg) {
  if (msg.method === 'Runtime.consoleAPICalled') {
    const text = (msg.params.args ?? [])
      .map((a) => a.value ?? a.description ?? a.unserializableValue ?? '')
      .join(' ');
    pageLog.push(`[console.${msg.params.type}] ${text}`);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    pageLog.push(`[exception] ${d.exception?.description ?? d.text}`);
  } else if (msg.method === 'Log.entryAdded') {
    pageLog.push(`[log.${msg.params.entry.level}] ${msg.params.entry.text}`);
  }
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let nextId = 0;
    const pending = new Map();
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method) { recordPageEvent(msg); return; }
      const slot = msg.id !== undefined ? pending.get(msg.id) : undefined;
      if (!slot) return;
      pending.delete(msg.id);
      if (msg.error) slot.reject(new Error(`${msg.error.message} (${JSON.stringify(msg.error.data ?? '')})`));
      else slot.resolve(msg.result);
    });
    ws.addEventListener('error', () => reject(new Error('CDP WebSocket error')));
    ws.addEventListener('open', () => resolve({
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
  let lastError;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return await res.json();
    } catch (error) { lastError = error; }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`DevTools 端点未就绪：${lastError?.message ?? 'timeout'}`);
}

// ───────────────────────── 主流程 ─────────────────────────
const target = process.argv[2] || path.join(repoRoot, 'offline', 'index.html');
const targetUrl = /^https?:/.test(target) ? target : pathToFileURL(path.resolve(target)).href;

const browserExe = findBrowser();
if (!browserExe) {
  console.log('smoke-browser: SKIP（没找到 Chromium/Edge；可用 AOI_BROWSER=<exe 路径> 指定）');
  process.exit(0);
}
if (!/^https?:/.test(target) && !fs.existsSync(new URL(targetUrl))) {
  console.log(`smoke-browser: SKIP（找不到 ${target}，先跑 npm run build:offline）`);
  process.exit(0);
}

const port = 9500 + Math.floor(Math.random() * 400);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'aoi-smoke-'));
const child = spawn(browserExe, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--disable-gpu', '--disable-dev-shm-usage', '--mute-audio',
  // 离线版 index.html 里有 Google Fonts 外链；直接解析失败比等 DNS 超时快
  '--host-resolver-rules=MAP fonts.googleapis.com 127.0.0.1:1, MAP fonts.gstatic.com 127.0.0.1:1',
  'about:blank',
], { stdio: 'ignore' });

let cdp;
let sessionId;
let failed = false;
try {
  const version = await waitForDevtools(port);
  cdp = await connect(version.webSocketDebuggerUrl);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  ({ sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }));
  const send = (method, params) => cdp.send(method, params, sessionId);

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  // 关掉平滑滚动，避免滚动断言和动画赛跑
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) {
      throw new Error(`页面内执行失败：${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    }
    return r.result.value;
  };

  await send('Page.navigate', { url: targetUrl });
  await evaluate(`new Promise(res => { if (document.readyState === 'complete') return res(true);
    window.addEventListener('load', () => res(true), { once: true }); })`);

  const homeReady = await evaluate(`new Promise(res => {
    const t = setInterval(() => {
      if (document.getElementById('repeatability') && document.getElementById('correlation')) { clearInterval(t); res(true); }
    }, 50);
    setTimeout(() => { clearInterval(t); res(false); }, 20000);
  })`);
  assert.ok(homeReady, '工具箱主页没渲染出 04/05 两张卡');
  console.log('  ✓ 主页渲染，04/05 卡片就位');

  // ── 04 重复性分析：注入是否真的生效 ──
  const repeat = await evaluate(`(async () => {
    const waitFor = (fn, ms) => new Promise(res => {
      const t = setInterval(() => { const v = fn(); if (v) { clearInterval(t); res(v); } }, 50);
      setTimeout(() => { clearInterval(t); res(null); }, ms);
    });
    // 组件结构是 <section class="repeatability-tool-host"><div ref={hostRef}/></section>，
    // shadowRoot 挂在**内层 div** 上，不是 section 上；且 Shadow DOM 内容不会序列化进 outerHTML，
    // 所以只能通过 shadowRoot 属性去找，不能靠 html 字符串判断。
    const shadowOf = () => {
      const section = document.querySelector('section.repeatability-tool-host');
      if (!section) return null;
      return section.shadowRoot || section.querySelector(':scope > div')?.shadowRoot || null;
    };
    document.getElementById('repeatability').click();
    // 等到"shadowRoot 就绪"或"渲染出错误面板"为止——只等 section 出现会早于 effect 执行
    const probe = await waitFor(() => {
      const section = document.querySelector('section.repeatability-tool-host');
      if (!section) return null;
      const shadow = shadowOf();
      if (shadow) return { kind: 'ready' };
      const err = section.querySelector('.repeatability-load-error');
      return err ? { kind: 'error', text: err.textContent.trim() } : null;
    }, 20000);
    if (!probe) {
      const section = document.querySelector('section.repeatability-tool-host');
      return {
        mounted: false,
        reason: '20s 内既没等到 shadowRoot，也没出现错误面板',
        debug: {
          hostCount: document.querySelectorAll('section.repeatability-tool-host').length,
          html: section ? section.outerHTML.slice(0, 400) : 'NONE',
          childCount: section ? section.children.length : -1,
          activeToolSlot: !!document.getElementById('tool-workbench'),
        },
      };
    }
    if (probe.kind === 'error') return { mounted: false, reason: '挂载抛错', errorPanel: probe.text };
    const shadow = shadowOf();
    return {
      mounted: true,
      error: null,
      // 旧脚本用 $ / $$ 查元素。能查到 .tab / #toast，说明 document 代理确实把它路由进了 ShadowRoot。
      tabs: shadow.querySelectorAll('.tab').length,
      toastFound: !!shadow.getElementById('toast'),
      // 反向验证：这些 id 在真实 document 里是查不到的（否则说明没隔离）
      leakedToRealDocument: !!document.getElementById('toast'),
      panelActive: shadow.querySelectorAll('.panel.active').length,
    };
  })()`);

  assert.ok(repeat.mounted, `04 未挂载出 shadowRoot（${repeat.reason ?? ''}${repeat.errorPanel ? ` / 页面报错：${repeat.errorPanel}` : ''}${repeat.debug ? ` / debug=${JSON.stringify(repeat.debug)}` : ''}）`);
  assert.equal(repeat.error, null, `04 加载报错：${repeat.error}`);
  assert.ok(repeat.tabs > 0, '04 的 Tab 未渲染');
  assert.ok(repeat.toastFound, '04 的 $() 没能通过 document 代理查到 ShadowRoot 内的 #toast —— 注入失效');
  assert.equal(repeat.leakedToRealDocument, false, '04 的脚本泄漏到了真实 document');
  assert.ok(repeat.panelActive > 0, '04 没有激活任何面板');
  console.log(`  ✓ 04 挂载正常，Tab ${repeat.tabs} 个，document 代理命中 ShadowRoot`);

  // ── P0-3：点 Tab 不得把宿主页面滚到顶部 ──
  const scroll = await evaluate(`(async () => {
    const section = document.querySelector('section.repeatability-tool-host');
    const shadow = section.shadowRoot || section.querySelector(':scope > div')?.shadowRoot;
    const tabs = shadow.querySelectorAll('.tab');
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    if (maxScroll < 200) return { skipped: true, maxScroll };
    window.scrollTo(0, Math.round(maxScroll * 0.5));
    await new Promise(r => setTimeout(r, 250));
    const before = window.scrollY;
    (tabs[1] || tabs[0]).click();
    await new Promise(r => setTimeout(r, 700));
    const after = window.scrollY;
    return { skipped: false, before, after, moved: Math.abs(after - before), maxScroll };
  })()`);
  if (scroll.skipped) {
    console.log(`  · 跳过滚动检查（页面可滚动距离只有 ${scroll.maxScroll}px）`);
  } else {
    assert.ok(scroll.before > 0, '测试前置条件不成立：未能把宿主页面滚动起来');
    assert.ok(
      scroll.moved < 60,
      `点 04 的 Tab 把宿主页面滚动了 ${scroll.moved}px（${scroll.before} → ${scroll.after}），嵌入态不该抢宿主滚动`,
    );
    console.log(`  ✓ 点 04 的 Tab 未抢宿主滚动（${scroll.before} → ${scroll.after}）`);
  }

  // ── 05 相关性判断：注入 + 语法 ──
  const correlation = await evaluate(`(async () => {
    const waitFor = (fn, ms) => new Promise(res => {
      const t = setInterval(() => { const v = fn(); if (v) { clearInterval(t); res(v); } }, 50);
      setTimeout(() => { clearInterval(t); res(null); }, 20000);
    });
    // App 用 React state 切工具，没有 URL 路由；打开 04 后主页卡片已被卸载，
    // 必须先点工作台的返回按钮回到主页，才能再点 05 的卡片。
    document.querySelector('.workbench-back')?.click();
    await waitFor(() => document.getElementById('correlation'), 5000);
    document.getElementById('correlation').click();
    const probe = await waitFor(() => {
      const section = document.querySelector('section.correlation-tool-host');
      if (!section) return null;
      const shadow = section.shadowRoot || section.querySelector(':scope > div')?.shadowRoot;
      if (shadow) return { kind: 'ready' };
      const err = section.querySelector('.correlation-load-error');
      return err ? { kind: 'error', text: err.textContent.trim() } : null;
    }, 20000);
    if (!probe) return { mounted: false, reason: '20s 内既没等到 shadowRoot，也没出现错误面板' };
    if (probe.kind === 'error') return { mounted: false, reason: '挂载抛错', errorPanel: probe.text };
    const section = document.querySelector('section.correlation-tool-host');
    const shadow = section.shadowRoot || section.querySelector(':scope > div')?.shadowRoot;
    const err = shadow.querySelector('.correlation-load-error');
    return {
      mounted: true,
      error: err ? err.textContent.trim() : null,
      analyzeBtn: !!shadow.getElementById('multiAnalyzeBtn'),
      errBox: !!shadow.getElementById('multiErr'),
    };
  })()`);

  assert.ok(correlation.mounted, `05 未挂载出 shadowRoot（${correlation.reason ?? ''}${correlation.errorPanel ? ` / 页面报错：${correlation.errorPanel}` : ''}）`);
  assert.equal(correlation.error, null, `05 加载报错：${correlation.error}`);
  assert.ok(correlation.analyzeBtn, '05 的 analyze 按钮未渲染（id 查询未路由到 ShadowRoot）');
  console.log('  ✓ 05 挂载正常，id 查询命中 ShadowRoot');

  console.log('smoke-browser: PASS');
} catch (error) {
  failed = true;
  console.error('smoke-browser: FAIL —', error.message);
} finally {
  try { await cdp?.send('Browser.close'); } catch { /* ignore */ }
  cdp?.close();
  child.kill();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
}
process.exit(failed ? 1 : 0);
