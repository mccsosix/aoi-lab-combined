/**
 * 05 相关性判断 · 改版后（一页到底）真浏览器端到端验证
 *
 * 与 verify-correlation-parser.mjs 的分工：
 *   parser 脚本用 DOM 桩跑算法，只证明"算得对"；
 *   这个脚本真的开一个 headless Edge/Chrome，把真表当成用户拖进来，
 *   点按钮、读回 Shadow DOM 里渲染出来的字，证明"算完还能看得对"。
 *   改的是排版 / 渲染 / 交互，回归必须跑这个，parser 测不到。
 *
 * 真表：1180M 準確性 之前.xlsx（2 乘坐 × 10 样品 × 3 点位，检测项目 舌片TPY）
 *   默认路径写死桌面案例表；换表用环境变量 AOI_CORRELATION_SAMPLE=<绝对路径>。
 *   表不存在 → SKIP（exit 0），不阻塞没有素材的机器。
 *
 * 前置：先 npm run build:offline，脚本读 offline/index.html。
 *
 * ★ 组合口径（用户 2026-09-21）：组合 = **样品**，跨乘坐合并判定。
 *   一个样品在左右两个乘坐各有一组点位，它「对上」= 两边所有点位都达标（取交集），
 *   不是"每个乘坐各自过半"、也不是把各乘坐的对上数相加。
 *   真表 1180M：左乘坐原始对 {1#/2#/8#}、右乘坐原始对 {2#/3#/8#/10#} → 交集 {2#,8#} = 2，
 *   所以结论条报的是「10 个样品原始只对上 2 个」，不是旧口径的 7/20。
 *
 * 断言：
 *   ① 结论条一句话 + 数字（10 个样品：原始 2 → 补偿后 5，门槛 ≥5），且**不出现 20/组合**字样
 *   ② 识别卡报出 2 乘坐 / 10 样品 / 60 点位 / 舌片TPY，并明说"一个样品要每个乘坐都达标"
 *   ③ ★ 照这个填 = 推荐方案「按检测项目共用」，**只有 1 行**：覆盖乘坐 = 左乘坐舌片、右乘坐舌片，
 *      b = −0.0096，a 列显示「不动」（核心口径：左右乘坐必须共用一个补偿值）
 *   ④ 对齐矩阵 = **一张表**，行 = 10 个样品、列按乘坐分段（左 3 列 + 右 3 列）+ 判定列；
 *      ★ 判定✓ 的样品数必须 = 补偿表的「对上样品」5，分乘坐数字（左 6/10、右 7/10）只是参考
 *   ⑤ 未对上清单 = 5 条，带残差诊断分类（含 cls-lost：原始对上被共用补偿推出容差），
 *      且每条都标出是哪个乘坐拖后腿
 *   ⑥ 明细 10 行（一行一个样品）默认折叠；展开后逐点表带「乘坐」列
 *   ⑦ 交互：矩阵点样品 → 弹窗（标题带两个乘坐、共用一条函数）、明细点行 → 展开逐点、导出 xlsx 不抛异常
 *   ⑧ 常显说明文字 ≤ 600 字、口径说明默认折叠；全程无 JS 异常
 * 截图落到仓库外的 ../outputs/（不属于交付物目录）。
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const repo = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const outDir = path.resolve(repo, '..', 'outputs');
const entry = path.join(repo, 'offline', 'index.html');

// 真表：默认桌面案例表（不写死用户名，跟 homedir 走），可用环境变量覆盖
const samplePath = process.env.AOI_CORRELATION_SAMPLE
  || path.join(os.homedir(), 'Desktop', '案例', '1180M 準確性 之前.xlsx');

if (!fs.existsSync(samplePath)) {
  console.log(`SKIP: 没找到真表 ${samplePath}`);
  console.log('      用 AOI_CORRELATION_SAMPLE=<绝对路径> 指定样本表后再跑。');
  process.exit(0);
}
if (!fs.existsSync(entry)) {
  console.error(`缺少 ${entry}，先跑 npm run build:offline`);
  process.exit(1);
}
const b64 = fs.readFileSync(samplePath).toString('base64');
console.log(`真实 xlsx: ${samplePath}`);

function findBrowser() {
  const cands = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ];
  return cands.find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } });
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
if (!exe) { console.log('SKIP: 没找到浏览器'); process.exit(0); }
const port = 9800 + Math.floor(Math.random() * 150);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'aoi-e2e-'));
const child = spawn(exe, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-gpu',
  '--disable-dev-shm-usage', '--mute-audio',
  '--host-resolver-rules=MAP fonts.googleapis.com 127.0.0.1:1, MAP fonts.gstatic.com 127.0.0.1:1',
  'about:blank',
], { stdio: 'ignore' });

let cdp, failed = false;
try {
  const version = await waitForDevtools(port);
  cdp = await connect(version.webSocketDebuggerUrl);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (m, p) => cdp.send(m, p, sessionId);
  await send('Page.enable'); await send('Runtime.enable');
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('页面内执行失败：' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
    return r.result.value;
  };

  await send('Page.navigate', { url: pathToFileURL(entry).href });
  await evaluate(`new Promise(res => { if (document.readyState === 'complete') return res(true);
    window.addEventListener('load', () => res(true), { once: true }); })`);

  const ready = await evaluate(`new Promise(res => {
    const t = setInterval(() => { if (document.getElementById('correlation')) { clearInterval(t); res(true); } }, 50);
    setTimeout(() => { clearInterval(t); res(false); }, 20000); })`);
  assert.ok(ready, '主页没渲染出 05 卡片');

  const out = await evaluate(`(async () => {
    const waitFor = (fn, ms) => new Promise(res => {
      const t = setInterval(() => { const v = fn(); if (v) { clearInterval(t); res(v); } }, 50);
      setTimeout(() => { clearInterval(t); res(null); }, ms);
    });
    document.getElementById('correlation').click();
    const shadow = await waitFor(() => {
      const s = document.querySelector('section.correlation-tool-host');
      if (!s) return null;
      return s.shadowRoot || s.querySelector(':scope > div')?.shadowRoot || null;
    }, 20000);
    const $ = id => shadow.getElementById(id);
    if (!$('multiAnalyzeBtn')) return { fatal: '必要控件缺失' };

    const bin = atob('${b64}');
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const file = new File([arr], '1180M 準確性 之前.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const dt = new DataTransfer();
    dt.items.add(file);
    $('excelFileInput').files = dt.files;
    $('excelFileInput').dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 900));

    const recGrid = Array.from(shadow.querySelectorAll('.rec-item')).map(e => e.textContent.replace(/\\s+/g, ' ').trim());
    const recSeat = (shadow.querySelector('.rec-seat') || {}).textContent;
    const recMerge = (shadow.querySelector('.rec-merge') || {}).textContent || null;
    const recOk = !!shadow.querySelector('.rec-ok');
    const recWarn = (shadow.querySelector('.rec-warn') || {}).textContent || null;

    $('multiTolerance').value = '0.015';
    $('multiAlignRate').value = '50';
    // 默认共用单位 = 按检测项目（跨乘坐）：左乘坐舌片 + 右乘坐舌片 共用一个补偿值
    $('multiCompGroup').value = 'item';
    $('multiAnalyzeBtn').click();
    await new Promise(r => setTimeout(r, 900));

    const txt = el => el ? el.textContent.replace(/\\s+/g, ' ').trim() : null;
    const rowsOf = el => el ? Array.from(el.querySelectorAll('tbody tr')).map(tr =>
      Array.from(tr.children).map(td => td.textContent.replace(/\\s+/g, ' ').trim()).join(' | ')) : null;

    const verdictCls = $('conclusionBar').className;
    const plan = {
      badge: txt($('planBadge')),
      head: txt(shadow.querySelector('.plan-head')),
      why: txt(shadow.querySelector('.plan-why')),
      rows: rowsOf(shadow.querySelector('.plan-table')),
      headCols: Array.from(shadow.querySelectorAll('.plan-table thead th')).map(e => e.textContent.trim()),
    };
    // 打开「其它方案」折叠
    const altSummary = shadow.querySelector('.alt-wrap > summary');
    if (altSummary) altSummary.click();
    await new Promise(r => setTimeout(r, 120));
    const alt = { open: !!shadow.querySelector('.alt-wrap[open]'), rows: rowsOf(shadow.querySelector('.alt-table')) };

    // 对齐矩阵：一张表，行 = 样品，列按乘坐分段，最后一列是「判定」
    const mtx = (() => {
      const t = shadow.querySelector('.mtx-table');
      if (!t) return null;
      const seatThs = Array.from(t.querySelectorAll('thead tr:first-child .mtx-th-seat'))
        .map(e => ({ name: e.textContent.trim(), cols: Number(e.getAttribute('colspan')) || 1 }));
      const rows = Array.from(t.querySelectorAll('tbody tr')).map(tr => {
        const lab = tr.querySelector('.mtx-lab').textContent.trim();
        const all = Array.from(tr.querySelectorAll('.mtx-cell'));
        const v = all.pop();                        // 最后一格 = 判定
        const marks = all.map(c => c.textContent.trim());
        const seats = [];
        let p = 0;
        seatThs.forEach(s => { seats.push(marks.slice(p, p + s.cols)); p += s.cols; });
        return { lab, seats, verdict: v ? v.textContent.trim() : '' };
      });
      return {
        title: txt(shadow.querySelector('.mtx-block .mtx-title')),
        note: txt(shadow.querySelector('.mtx-block .mtx-note')),
        seats: seatThs,
        rows,
        pointCells: Array.from(t.querySelectorAll('tbody .mtx-cell:not(.mtx-v)')).length,
        ok: Array.from(t.querySelectorAll('tbody .mtx-cell.mtx-ok:not(.mtx-v)')).length,
        no: Array.from(t.querySelectorAll('tbody .mtx-cell.mtx-no:not(.mtx-v)')).length,
        na: Array.from(t.querySelectorAll('tbody .mtx-cell.mtx-na')).length,
        verdictOk: t.querySelectorAll('tbody .mtx-v.mtx-ok').length,
        verdictNo: t.querySelectorAll('tbody .mtx-v.mtx-no').length,
        // 分乘坐：整乘坐都对上的样品数（只用于定位，不是答案）
        perSeat: seatThs.map((_, i) => rows.filter(r => r.seats[i].length && !r.seats[i].includes('✗')).length),
      };
    })();
    const fails = Array.from(shadow.querySelectorAll('.fail-item')).map(e => ({
      cls: e.className.replace('fail-item ', ''),
      who: txt(e.querySelector('.who')),
      seats: Array.from(e.querySelectorAll('.seatmk')).map(txt),
      text: e.textContent.replace(/\\s+/g, ' ').trim(),
    }));
    const failBadge = txt($('failBadge'));

    const prodHeads = Array.from(shadow.querySelectorAll('.prod-head')).map(txt);
    const prodMarks = Array.from(shadow.querySelectorAll('.prod-head')).map(h =>
      Array.from(h.querySelectorAll('.seatmk')).map(txt));
    const pointsVisible = Array.from(shadow.querySelectorAll('.prod-points'))
      .filter(e => e.style.display !== 'none').length;

    // 常显说明文字（排除折叠区里的内容）
    const visibleProse = [
      txt($('conclusionSub')),
      txt(shadow.querySelector('.plan-why')),
      recSeat,
      recMerge,
      mtx && mtx.note,
      recWarn || (recOk ? '结构与预期一致，无异常' : ''),
    ].filter(Boolean).join('');
    const proseLen = visibleProse.replace(/\\s+/g, '').length;
    const specLen = (txt(shadow.querySelector('.spec-body')) || '').replace(/\\s+/g, '').length;
    const specOpen = !!shadow.querySelector('.spec-note[open]');

    // 交互：点矩阵里的样品编号 → 散点图弹窗；点样品行 → 展开逐点
    const lab = shadow.querySelector('.mtx-lab');
    if (lab) lab.click();
    await new Promise(r => setTimeout(r, 300));
    const modalOpen = $('multiDetailCard').classList.contains('show');
    const modalName = txt($('multiDetailName'));
    $('multiModalClose').click();
    await new Promise(r => setTimeout(r, 120));

    const firstHead = shadow.querySelector('.prod-head');
    firstHead.click();
    await new Promise(r => setTimeout(r, 120));
    const expanded = shadow.querySelector('.prod-points').style.display !== 'none';
    // 展开后的逐点表：必须带「乘坐」列（一个样品的点位横跨左右两个乘坐）
    const firstTable = shadow.querySelector('.prod-points table');
    const pointCols = firstTable
      ? Array.from(firstTable.querySelectorAll('thead th')).map(e => e.textContent.trim()) : null;
    const pointRows = firstTable
      ? Array.from(firstTable.querySelectorAll('tbody tr'))
        .map(tr => Array.from(tr.children).map(td => td.textContent.trim()).join(' | ')).slice(0, 3)
      : null;

    // 导出 / 复制路径
    const errs = [];
    try { $('multiCopyTable').click(); } catch (e) { errs.push('multiCopyTable: ' + e.message); }
    await new Promise(r => setTimeout(r, 200));
    try {
      const o = URL.createObjectURL;
      URL.createObjectURL = () => 'blob:stub';
      $('multiExportCsv').click();
      URL.createObjectURL = o;
    } catch (e) { errs.push('multiExportCsv: ' + e.message); }
    let xlsxNote = null;
    try { $('multiExportXlsx').click(); xlsxNote = 'ok'; } catch (e) { xlsxNote = 'THREW: ' + e.message; }
    await new Promise(r => setTimeout(r, 300));

    return {
      fatal: null, recGrid, recSeat, recMerge, recOk, recWarn, verdictCls,
      verdictMain: txt($('conclusionMain')), verdictSub: txt($('conclusionSub')),
      ctaTexts: Array.from(shadow.querySelectorAll('.verdict-actions button')).map(txt),
      sectionNums: Array.from(shadow.querySelectorAll('.card > h2')).map(h => getComputedStyle(h, '::before').content),
      plan, alt, mtx, fails, failBadge, prodHeads, prodMarks, pointsVisible,
      pointCols, pointRows,
      proseLen, specLen, specOpen, modalOpen, modalName, expanded, errs, xlsxNote,
      err: $('multiErr').classList.contains('show') ? txt($('multiErr')) : null,
    };
  })()`);

  if (out.fatal) throw new Error(out.fatal);

  console.log('\n① 结论条 [' + out.verdictCls + ']');
  console.log('   ', out.verdictMain);
  console.log('   ', out.verdictSub);
  console.log('    按钮：', JSON.stringify(out.ctaTexts));
  console.log('\n② 识别卡');
  console.log('   ', JSON.stringify(out.recGrid));
  console.log('   ', (out.recSeat || '').replace(/\s+/g, ' '));
  console.log('    跨乘坐口径：', (out.recMerge || '(无)').replace(/\s+/g, ' '));
  console.log('    无异常：', out.recOk, '｜提示：', out.recWarn);
  console.log('\n③ 照这个填');
  console.log('    徽标：', out.plan.badge, '｜', out.plan.head);
  console.log('    理由：', out.plan.why);
  console.log('    列：', JSON.stringify(out.plan.headCols));
  console.log('    行：', JSON.stringify(out.plan.rows));
  console.log('    其它方案（展开=' + out.alt.open + '）：', JSON.stringify(out.alt.rows));
  console.log('\n④ 哪些没对上 徽标：', out.failBadge);
  if (out.mtx) {
    console.log('    ' + out.mtx.title);
    console.log('    列：' + out.mtx.seats.map(s => `${s.name}×${s.cols}`).join(' · ')
      + `（点位格 ${out.mtx.pointCells}：✓${out.mtx.ok} ✗${out.mtx.no} ·${out.mtx.na}）`
      + `｜判定列 ✓${out.mtx.verdictOk} ✗${out.mtx.verdictNo}`);
    out.mtx.rows.forEach(r => console.log(
      '      ' + r.lab.padEnd(4) + ' ' +
      r.seats.map(x => x.join(' ').padEnd(11)).join('| ') + ' → ' + r.verdict));
    console.log('    ' + out.mtx.note);
  }
  console.log('    未对上清单：');
  out.fails.forEach(f => console.log('      -', f.cls, '|', f.who, '|', JSON.stringify(f.seats), '|', f.text));
  console.log('\n⑤ 明细：', out.prodHeads.length, '个样品行，默认展开的逐点表', out.pointsVisible, '个');
  console.log('    样品行的乘坐小计（前 3 行）：', JSON.stringify(out.prodMarks.slice(0, 3)));
  console.log('    展开后的列：', JSON.stringify(out.pointCols));
  console.log('    展开后的头 3 行：', JSON.stringify(out.pointRows));
  console.log('\n⑥ 文字预算：常显说明', out.proseLen, '字；口径说明（折叠=' + out.specOpen + '）', out.specLen, '字');
  console.log('⑦ 交互：弹窗', out.modalOpen, JSON.stringify(out.modalName), '｜展开逐点', out.expanded, '｜导出', out.xlsxNote);
  if (out.errs.length) console.log('    导出/复制异常：', JSON.stringify(out.errs));

  // ── 断言 ──
  assert.equal(out.err, null, '分析不应报错');
  // ① 结论条 —— ★ 数字一律是**样品**口径（跨乘坐合并），不是 乘坐×样品
  assert.ok(/warn/.test(out.verdictCls), '应判「需要补偿」类别，实际 class=' + out.verdictCls);
  assert.ok(/需要补偿/.test(out.verdictMain), '结论主文案应为「需要补偿…」，实际 ' + out.verdictMain);
  assert.ok(/10 个样品/.test(out.verdictSub), '结论副文案必须按「10 个样品」计数，实际 ' + out.verdictSub);
  assert.ok(
    !/20 个组合|组合/.test(out.verdictSub),
    '★ 结论副文案不该再出现「组合」这个旧口径说法，实际 ' + out.verdictSub,
  );
  // 原始 2 = 左乘坐 {1#/2#/8#} ∩ 右乘坐 {2#/3#/8#/10#}（旧口径会报成 7/20 —— 那是两边相加）
  assert.ok(/原始只对上 2 个/.test(out.verdictSub), '★ 原始对上必须是交集 2 个，实际 ' + out.verdictSub);
  assert.ok(/对上 5 个/.test(out.verdictSub), '补偿后对上 5 个，实际 ' + out.verdictSub);
  assert.ok(/门槛 ≥5/.test(out.verdictSub), '门槛必须是 ceil(10 样品 × 50%) = 5，实际 ' + out.verdictSub);
  assert.equal(out.ctaTexts.length, 2, '结论条应有两个操作按钮');
  assert.ok(/看没对上的 5 个/.test(out.ctaTexts[1]), '按钮数字要与判定一致，实际 ' + out.ctaTexts[1]);

  // ② 识别卡
  const grid = out.recGrid.join(' ');
  assert.ok(/乘坐2/.test(grid), '识别卡应报 2 个乘坐：' + grid);
  assert.ok(/样品10/.test(grid), '★ 识别卡应报 10 个样品（去重后的样品名），不是 20：' + grid);
  assert.ok(!/样品20/.test(grid), '★ 不许把两个乘坐的样品数相加：' + grid);
  assert.ok(/点位60/.test(grid), '识别卡应报 60 个点位：' + grid);
  assert.ok(/舌片TPY/.test(grid), '识别卡应报出检测项目 舌片TPY');
  assert.ok(/左乘坐舌片 10 个样品/.test((out.recSeat || '').replace(/\s+/g, ' ')), '识别卡应逐乘坐列出结构');
  // ★ 跨乘坐口径必须在识别卡里说死：看不到这句，用户就会把"左 6/10、右 6/10"当成答案
  assert.ok(out.recMerge, '★ 识别卡必须给出「跨乘坐合并判定」的口径说明');
  assert.ok(
    /同一批样品/.test(out.recMerge) && /每个乘坐的点位全部对上/.test(out.recMerge),
    '★ 口径说明要讲清"一个样品要每个乘坐都达标"，实际 ' + out.recMerge,
  );
  assert.equal(out.recWarn, null, '真表不应有识别告警');

  // ③ 照这个填 —— ★ 核心口径：左乘坐舌片 + 右乘坐舌片 共用一个补偿值（用户 2026-09-20）
  assert.ok(/推荐/.test(out.plan.badge), '徽标应带「推荐」，实际 ' + out.plan.badge);
  assert.ok(/按检测项目共用/.test(out.plan.head), '推荐方案应为「按检测项目共用」，实际 ' + out.plan.head);
  // ★ 最关键的回归点：2 个乘坐只能有名下 1 行补偿值，不是每乘坐一行
  assert.equal(out.plan.rows.length, 1, '★ 左右乘坐共用一个补偿 → 补偿表只能 1 行，实际 ' + JSON.stringify(out.plan.rows));
  assert.ok(
    /左乘坐舌片、右乘坐舌片/.test(out.plan.rows[0]),
    '★ 「覆盖乘坐」列必须同时写出左、右两个乘坐，实际 ' + out.plan.rows[0],
  );
  assert.ok(out.plan.headCols.some(c => /覆盖乘坐/.test(c)), '★ 表头应为「覆盖乘坐」而不是「乘坐」，实际 ' + JSON.stringify(out.plan.headCols));
  assert.ok(/−0\.0096/.test(out.plan.rows[0]), '共用补偿值应为 −0.0096：' + out.plan.rows[0]);
  assert.ok(/不动/.test(out.plan.rows[0]), 'a 列应显示「不动」（只改补偿值）');
  assert.ok(/5\/10/.test(out.plan.rows[0]), '★ 补偿表的「对上样品」列要按 10 个样品计，实际 ' + out.plan.rows[0]);
  assert.ok(
    out.plan.headCols.filter(c => /对上样品/.test(c)).length === 1,
    '★ 表头应写「对上样品」而不是「对上组合」，实际 ' + JSON.stringify(out.plan.headCols),
  );
  assert.ok(!/参考版|参考源码包/.test(out.plan.why || ''), '推荐理由里不该再出现「参考版」这类内部术语');
  assert.ok(!/平移补偿值能让 19/.test(out.plan.why || ''), '★ 理由不能把「单独可覆盖」误报成「当前值覆盖」');
  assert.equal(out.alt.rows.length, 4, '其它方案表应含全部 4 个方案');

  // ④ 对齐矩阵 —— 一张表，行 = 样品，列按乘坐分段
  assert.ok(out.mtx, '应有对齐矩阵表');
  assert.equal(out.mtx.rows.length, 10, '★ 矩阵应有 10 行（一行一个样品），实际 ' + out.mtx.rows.length);
  assert.equal(out.mtx.seats.length, 2, '矩阵应按乘坐分 2 段列，实际 ' + out.mtx.seats.length);
  assert.deepEqual(out.mtx.seats.map(s => s.cols), [3, 3], '每个乘坐 3 个点位列（10 样品×3 点位）');
  assert.deepEqual(
    out.mtx.seats.map(s => s.name), ['左乘坐舌片', '右乘坐舌片'],
    '★ 列头必须按 sheet 顺序（左乘坐在左、右乘坐左右），实际 ' + JSON.stringify(out.mtx.seats.map(s => s.name)),
  );
  assert.equal(out.mtx.pointCells, 60, '矩阵共 60 个点位格（2×10×3）');
  assert.equal(out.mtx.na, 0, '这张表每个样品在两个乘坐都有点位，不该出现占位格「·」');
  assert.equal(out.mtx.ok + out.mtx.no + out.mtx.na, 60, '每个点位格要么 ✓ 要么 ✗（要么是该乘坐没有这个点位的 ·）');
  assert.equal(out.mtx.verdictOk + out.mtx.verdictNo, 10, '判定列每行一个，共 10 个');
  // ★★ 本脚本的核心回归点（用户 2026-09-21 报的错）：
  //    左 6/10 + 右 6/10 相加 = 12，但一个样品要**左右都达标**才算对上 → 判定只有 5 个。
  //    以前把 (乘坐 × 样品) 当两个组合分别数，真表就报成 13/20。
  assert.deepEqual(out.mtx.perSeat, [6, 6], '分乘坐对上 6/10 · 6/10（只用于定位拖后腿的乘坐），实际 ' + JSON.stringify(out.mtx.perSeat));
  assert.equal(out.mtx.verdictOk, 5, '★ 判定列只认交集：5 个样品在左右两个乘坐都达标');
  assert.ok(
    out.mtx.perSeat[0] + out.mtx.perSeat[1] > out.mtx.verdictOk,
    '★ 分乘坐之和（12）必须大于判定数（5）—— 相等就说明又退回"各乘坐分别数"了',
  );
  const planPassN = Number((out.plan.rows[0].match(/(\d+)\/10/) || [])[1]);
  assert.equal(out.mtx.verdictOk, planPassN, '★ 矩阵判定列的 ✓ 数必须 = 补偿表的「对上样品」数（同一口径，两处必须一致）');
  assert.ok(
    /左乘坐舌片 6\/10/.test(out.mtx.note || '') && /右乘坐舌片 6\/10/.test(out.mtx.note || ''),
    '★ 分乘坐数字要展示（供定位），实际 ' + out.mtx.note,
  );
  assert.ok(
    /判定看最右列/.test(out.mtx.note || ''),
    '★ 必须写明"判定看最右列"，否则用户会拿 6/10 当答案：' + out.mtx.note,
  );
  // 行内交叉验证：整行 ✓ 的样品必须与判定列一致（矩阵自洽）
  out.mtx.rows.forEach(r => {
    const allOk = r.seats.every(cells => cells.length > 0 && !cells.includes('✗'));
    assert.equal(
      r.verdict === '✓', allOk,
      `★ 第 ${r.lab} 行：所有乘坐点位都 ✓ 才该判 ✓（判定 ${r.verdict}，实际 ${JSON.stringify(r.seats)}）`,
    );
  });

  // ⑤ 未对上清单
  assert.equal(out.fails.length, 5, '未对上样品应为 5 个，实际 ' + out.fails.length);
  assert.ok(/5 个未对上 \/ 共 10/.test(out.failBadge), '★ 徽标应按样品计「5 个未对上 / 共 10」，实际 ' + out.failBadge);
  assert.ok(out.fails.some(f => /cls-scatter/.test(f.cls)), '应有「离散型（补偿救不了）」的分类');
  assert.equal(
    out.fails.filter(f => /cls-lost/.test(f.cls)).length, 1,
    '★ 应报出「原始能对上、被共用补偿推出容差」的样品（真表 2#：左 3/3 全对，右被推出 1 点）',
  );
  assert.ok(out.fails.some(f => /cls-offset/.test(f.cls)), '应有「可行区间不重合（同一个 b 顾不过来）」的分类');
  assert.ok(/推出了容差/.test(out.plan.why || ''), '★ 推荐理由要说明补偿的代价（有原始对上的被推出去）');
  assert.ok(out.fails.every(f => /残差跨度|未对上/.test(f.text)), '每条未对上都要带残差诊断说明');
  // ★ 每条未对上都要标出是哪个乘坐拖后腿（否则用户还得去矩阵里找）
  out.fails.forEach(f => {
    assert.ok(f.seats.length >= 1, '★ 未对上条目要标出各乘坐达标情况：' + f.text);
    assert.ok(/左乘坐舌片|右乘坐舌片/.test(f.seats.join(' ')), '★ 乘坐小计必须是真实乘坐名：' + JSON.stringify(f.seats));
  });
  assert.ok(
    out.fails.every(f => /^\u6837\u54c1 /.test(f.who || '')),
    '未对上条目应以「样品 xx#」开头，实际 ' + JSON.stringify(out.fails.map(f => f.who)),
  );

  // ⑥ 明细 —— 一行一个样品，逐点表带「乘坐」列
  assert.equal(out.prodHeads.length, 10, '★ 明细应有 10 个样品行（不是 20 个 乘坐×样品），实际 ' + out.prodHeads.length);
  assert.equal(out.pointsVisible, 0, '逐点表必须默认全部折叠');
  assert.equal(out.expanded, true, '点样品行应能展开逐点表');
  assert.ok(
    out.prodMarks.every(m => m.length === 2),
    '★ 每个样品行都要标出两个乘坐的小计，实际 ' + JSON.stringify(out.prodMarks.slice(0, 3)),
  );
  assert.ok(
    out.pointCols && out.pointCols[0] === '乘坐',
    '★ 展开后的逐点表第一列必须是「乘坐」（一个样品的点位横跨左右两个乘坐），实际 ' + JSON.stringify(out.pointCols),
  );
  assert.ok(out.pointCols.includes('本次补偿'), '逐点表要能看出每个点位用的是哪个补偿值：' + JSON.stringify(out.pointCols));
  assert.ok(
    /^左乘坐舌片 \| 1 \|/.test(out.pointRows[0]),
    '★ 逐点表应按乘坐顺序（左乘坐在前）、点# 在各自乘坐内重新编号，实际 ' + out.pointRows[0],
  );
  assert.ok(/b −0\.0096/.test(out.pointRows[0]), '★ 逐点行要标出所用补偿值（共用同一个 b），实际 ' + out.pointRows[0]);

  // ⑦ 交互
  assert.equal(out.modalOpen, true, '点矩阵样品编号应打开散点图弹窗');
  assert.ok(/样品 1#/.test(out.modalName || ''), '弹窗标题应指明样品，实际 ' + out.modalName);
  assert.ok(
    /左乘坐舌片、右乘坐舌片/.test(out.modalName || ''),
    '★ 弹窗标题要写出该样品覆盖的两个乘坐（散点图也是两边点位拼一起），实际 ' + out.modalName,
  );
  assert.ok(
    /y = x − 0\.0096/.test(out.modalName || ''),
    '★ 共用同一个补偿值时弹窗要给出具体函数，实际 ' + out.modalName,
  );
  assert.equal(out.xlsxNote, 'ok', '导出补偿后 xlsx 不应抛异常：' + out.xlsxNote);
  assert.deepEqual(out.errs, [], '复制/CSV 导出不应抛异常：' + JSON.stringify(out.errs));
  // ⑧ 文字预算
  // 分节编号由 CSS counter 生成，getComputedStyle 拿不到解析值（Chromium 返回 counter() 原文），
  // 只断言卡片数量（4 张：导入 / 照这个填 / 哪些没对上 / 明细与导出），编号在截图里人工核对。
  assert.equal(out.sectionNums.length, 4, '应有 4 张编号卡片，实际 ' + out.sectionNums.length);
  assert.ok(out.proseLen <= 600, `常显说明文字应 ≤600 字，实际 ${out.proseLen} 字`);
  assert.equal(out.specOpen, false, '口径说明应默认折叠');
  assert.ok(out.specLen > 200, '口径说明折叠区里应有完整口径（实际 ' + out.specLen + ' 字）');

  // 截图
  fs.mkdirSync(outDir, { recursive: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1200, deviceScaleFactor: 1, mobile: false });
  const getShadow = `shadow = (document.querySelector('section.correlation-tool-host').shadowRoot
      || document.querySelector('section.correlation-tool-host > div').shadowRoot);`;
  const shot = async (name, clipExpr) => {
    const clip = await evaluate(`(() => { ${getShadow} return (${clipExpr}); })()`);
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { ...clip, scale: 1 } });
    fs.writeFileSync(path.join(outDir, name), Buffer.from(r.data, 'base64'));
    console.log('截图 → outputs/' + name);
  };
  await shot('相关性判断_改版_结论与方案.png', `(() => {
    const a = shadow.querySelector('#conclusionBar').getBoundingClientRect();
    const b = shadow.querySelector('#planCard').getBoundingClientRect();
    return { x: 0, y: a.top + window.scrollY - 10, width: 1460, height: Math.min(2600, b.bottom - a.top + 30) };
  })()`);
  await shot('相关性判断_改版_哪些没对上.png', `(() => {
    const t = shadow.querySelector('#failCard').getBoundingClientRect();
    return { x: 0, y: t.top + window.scrollY - 10, width: 1460, height: Math.min(2000, t.height + 30) };
  })()`);

  console.log('\nJS 错误：', cdp.logs.length ? cdp.logs : '无');
  assert.equal(cdp.logs.length, 0, '页面不应有 JS 异常');
  console.log('\nE2E PASS');
} catch (e) {
  failed = true;
  console.error('\nE2E FAIL:', e.message);
} finally {
  try { cdp?.close(); } catch {}
  child.kill();
  process.exit(failed ? 1 : 0);
}
