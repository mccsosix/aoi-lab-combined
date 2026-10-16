/**
 * 05 相关性判断：解析器 + 判定口径行为契约测试
 *
 * 与 verify-repeatability-integration.mjs 的"字符串存在性断言"不同，这里真的
 * 把 correlation-v13.html 里的脚本取出来执行，喂进一个手工构造的 workbook，
 * 断言输出结构。只靠 `includes('xxx')` 是拦不住逻辑回归的。
 *
 * 覆盖两块：
 *   1) parseWorkbook 的解析行为（空点不丢数据、空行结束块、缺失计数）
 *   2) analyzeBySeat / buildGlobalPlans 的判定口径 ——
 *      「对上」= 该产品 / 该组合内**全部点位** |gap| ≤ 容差（2026-09-20 第二轮修正）；
 *      通过门槛（默认 50%）**只作用在个数层**：乘坐内对上产品数、方案对上组合数。
 *      ★ 不要把产品层改回"≥门槛比例的点位对上"：一个产品只有 3 个点时，
 *        ceil(3×50%)=2，明明有超差点也会被判成"对上"，真表因此报 8 个实际只有 4 个。
 *
 * 用桩实现代替浏览器：脚本里所有顶层语句都是 `$('id').addEventListener(...)`，
 * 所以一个"可无限链式调用"的桩元素就足以让整个脚本完成求值。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const XLSX = require('../node_modules/xlsx');

const html = fs.readFileSync(new URL('../src/correlation/correlation-v13.html', import.meta.url), 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(scriptMatch, 'correlation script block missing');
const script = scriptMatch[1];

// ── 可链式调用的 DOM 桩 ──
function stub() {
  const target = function () { return stub(); };
  return new Proxy(target, {
    get(_t, prop) {
      if (prop === Symbol.toPrimitive) return () => '';
      if (prop === 'toString') return () => '';
      if (prop === 'length') return 0;
      if (prop === 'value') return '';
      return stub();
    },
    set: () => true,
    apply: () => stub(),
    has: () => true,
  });
}
const fakeDocument = {
  getElementById: () => stub(),
  querySelector: () => stub(),
  querySelectorAll: () => [],
  createElement: () => stub(),
  addEventListener: () => {},
  body: stub(),
};

const factory = new Function(
  'echarts', 'XLSX', 'document',
  `${script}\nreturn { parseWorkbook, analyzeBySeat };`,
);
const mod = factory(stub(), XLSX, fakeDocument);
assert.equal(typeof mod.parseWorkbook, 'function', 'parseWorkbook must be exported from the legacy script');
assert.equal(typeof mod.analyzeBySeat, 'function', 'analyzeBySeat must be exported from the legacy script');

// ── 构造 workbook：1# 数据区中间挖一个空点，尾部留 3 个空行，再放一个 2# ──
// 历史实现遇到中间那个空点会直接 break，1# 只剩 3 个点，且没有任何提示。
const rows = [
  ['1#', 'QV', 'CCD', 'GAP'],
  [0, 10.000, 10.001, ''],
  [1, 10.002, 10.003, ''],
  [2, 10.004, 10.005, ''],
  [3, null, null, ''],        // ← 块中间的空点
  [4, 10.006, 10.007, ''],
  [5, 10.008, 10.009, ''],
  [null, null, null, null],
  [null, null, null, null],
  [null, null, null, null],   // ← 连续 3 空行 = 1# 数据块结束
  ['2#', 'QV', 'CCD', 'GAP'],
  [0, 11.000, 11.001, ''],
  [1, 11.002, 11.003, ''],
];
const SHEET_NAME = '<img src=x>';
const ws = XLSX.utils.aoa_to_sheet(rows);
// 显式声明范围，否则全空的行不会出现在 sheet_to_json 的结果里
ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: 3 } });
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME);

const { seats, warnings } = mod.parseWorkbook(wb);

assert.equal(seats.length, 1, 'one sheet → one seat');
assert.equal(seats[0].name, SHEET_NAME, 'sheet name must be preserved verbatim (escaping is the renderer\'s job)');
assert.equal(seats[0].products.length, 2, 'both product blocks must be parsed independently');

const p1 = seats[0].products.find(p => p.name === '1#');
const p2 = seats[0].products.find(p => p.name === '2#');
assert.ok(p1 && p2, 'products 1# and 2# must both be present');

// 核心回归点：空点之后的数据不能被丢弃。
// 约定：meas = CCD 列（测量值），qv = QV 列（标准值），二者按行一一对齐。
assert.equal(p1.meas.length, 5, `1# must keep all 5 valid points after a mid-block gap (got ${p1.meas.length})`);
assert.deepEqual(p1.meas, [10.001, 10.003, 10.005, 10.007, 10.009], '1# measurements must be the valid CCD values, in order');
assert.deepEqual(p1.qv, [10.000, 10.002, 10.004, 10.006, 10.008], '1# QV column must stay aligned with CCD');
assert.equal(p1.missing, 1, 'the single mid-block gap must be counted exactly once');
// 尾部连续空行属于"数据块结束"，不能算作缺失点
assert.equal(p2.meas.length, 2, '2# must be parsed');
assert.equal(p2.missing, 0, 'trailing blank rows must not be counted as missing points');

assert.ok(warnings.length >= 1, 'skipped points must produce a warning');
assert.ok(
  warnings.some(w => w.includes('1#') && w.includes('1')),
  `warning must name the product and the count, got: ${JSON.stringify(warnings)}`,
);

// ── 下游分析仍能跑通（顺带覆盖 buildGlobalPlans 的调用路径） ──
const result = mod.analyzeBySeat(seats, 0.01, 'linear', 0.05, 0.05);
assert.equal(result.seats[0].nProds, 2, 'analyzeBySeat must see both products');
assert.equal(typeof result.seats[0].a, 'number', 'per-seat fit must produce a scale factor');
assert.ok(result.global, 'global compensation plans must be computed');
assert.equal(result.global.total, 2, 'global plan covers (seat × product) combinations');

/* ══════════════════════════════════════════════════════════════════
   判定口径（用户 2026-09-20 两轮 + 2026-09-21 一轮明确）
   旧·旧口径：产品"0 点超差"才算对上；补偿方案"全局最大 gap ≤ 容差"——过严，几乎全判死。
   现行口径：① 样品内**全部点位** |gap| ≤ 容差才算这个样品「对上」
             ② **样品跨乘坐合并**：一个样品在它出现过的**每个乘坐**上的点位都要达标，
                取交集而不是各乘坐分别数再相加（2026-09-21 修正，见下方 CROSS 段）
             ③ 通过门槛（默认 50%）只作用在个数层：方案对上**样品数**。
                **样品层不再是"50% 点位对上"**，各乘坐也不是"过半就算过"。
   ══════════════════════════════════════════════════════════════════ */
const mkProduct = (pname, qv, gaps) => ({
  name: pname,
  qv: [...qv],
  meas: qv.map((v, i) => v + gaps[i]),
  missing: 0,
});
const QV4 = [1, 2, 3, 4];

// 4 个产品 × 4 个点：1#/2#/4# 全部点位对上，3# 只对上 2 点（正好 50% 的点位）
// ★ 3# 是本次修正的核心回归点：旧实现按 ceil(4×50%)=2 判它"对上"，
//   于是有超差点的产品被算进"对上数"，真表因此报 8 个（实际只有 4 个）。
const halfSeat = {
  name: '半边测试',
  products: [
    mkProduct('1#', QV4, [0.001, 0.001, 0.001, 0.001]),
    mkProduct('2#', QV4, [0.001, 0.001, 0.001, 0.001]),
    mkProduct('3#', QV4, [0.001, 0.001, 0.02, 0.02]),
    mkProduct('4#', QV4, [0.001, 0.001, 0.001, 0.001]),
  ],
};
const halfSeat0 = mod.analyzeBySeat([halfSeat], 0.01, 'none', 0.05, 0.05).seats[0];
assert.equal(halfSeat0.threshold, 2, '乘坐门槛 = ceil(4 产品 × 50%) = 2（门槛只作用在个数层）');
assert.equal(halfSeat0.products[0].needAlign, 4, '产品阈值 = 全部 4 个点（不再是 ceil(4×50%)=2）');
assert.equal(halfSeat0.products[0].rawAlign, 4, '1# 4 个点全部对上');
assert.equal(halfSeat0.products[0].rawPass, true, '全部点位对上 → 该产品对上');
assert.equal(halfSeat0.products[2].rawAlign, 2, '3# 只对上 2/4 个点');
assert.equal(
  halfSeat0.products[2].rawPass,
  false,
  '★ 2/4 点对上不算该产品对上（旧"50% 点位"口径下这里是 true）',
);
assert.equal(halfSeat0.rawOkCount, 3, '1#/2#/4# 对上，3# 不对上');
assert.equal(halfSeat0.needTransform, false, '3/4 产品对上 ≥ 阈值 2 → 无需变换');

// 真表现场形状：3 个点、对上 2 个点的产品，必须判"不对上"
// （2026-09-20 真表 1180M：右乘坐只有 2#/3#/8#/10# 全部点位在容差内）
const threePtSeat = {
  name: '三点产品',
  products: [
    mkProduct('1#', [1, 2, 3], [0.001, 0.001, 0.02]),   // 2/3 点在容差内
    mkProduct('2#', [1, 2, 3], [0.001, 0.001, 0.001]),  // 全部对上
  ],
};
const t3 = mod.analyzeBySeat([threePtSeat], 0.01, 'none', 0.05, 0.05).seats[0];
assert.equal(t3.products[0].rawAlign, 2, '1# 对上 2/3 个点');
assert.equal(
  t3.products[0].rawPass,
  false,
  '★ 3 点产品只对上 2 点不能算对上（ceil(3×50%)=2 的旧口径正是真表报多的原因）',
);
assert.equal(t3.rawOkCount, 1, '只有 2# 全部点位对上');

// 门槛调到 100% 后，3/4 个产品对上就不够（要 4 个）—— 门槛真的作用在个数层
const strictSeat = mod.analyzeBySeat([halfSeat], 0.01, 'linear', 0.05, 0.05, 1).seats[0];
assert.equal(strictSeat.threshold, 4, '门槛 100% → 4 个产品全部对上才算该乘坐通过');
assert.equal(strictSeat.products[2].rawPass, false, '3# 仍因有点位超差而不算对上');
assert.equal(strictSeat.needTransform, true, '3 < 4 → 该乘坐需要变换');

// 补偿方案：不再要求"全局最大 gap ≤ 容差"，改看"对上样品数 ≥ 门槛"
// 乘坐B 里 1#/2#/3# 的 gap=0.03 远超容差 0.01（一个 b 把 3 个样品救回来，
// 但会牺牲掉乘坐B 里本来就在容差内的 4#），4# 两个乘坐都好 → 原始就对上的唯一一个
const mkPlanSeat = (name, gapBad, gapGood) => ({
  name,
  products: [
    mkProduct('1#', QV4, Array(4).fill(gapBad)),
    mkProduct('2#', QV4, Array(4).fill(gapBad)),
    mkProduct('3#', QV4, Array(4).fill(gapBad)),
    mkProduct('4#', QV4, Array(4).fill(gapGood)),
  ],
});
const planResult = mod.analyzeBySeat(
  [mkPlanSeat('乘坐A', 0.001, 0.001), mkPlanSeat('乘坐B', 0.03, 0.001)],
  0.01,
  'linear',
  0.05,
  0.05,
);
const gp = planResult.global;
assert.equal(gp.total, 4, '★ 组合维度 = 样品数（4），不是 乘坐×样品（8）');
assert.equal(gp.threshold, 2, '方案门槛 = ceil(4 样品 × 50%) = 2');
assert.equal(gp.passRaw, 1, '原始：只有 4# 在两个乘坐上都对上（1#/2#/3# 在乘坐B 超差）');
assert.equal(gp.plans.seatFix.pass, 3, '每乘坐一套 + 只改 b 时对上 3/4 个样品（1#/2#/3#）');
assert.equal(
  gp.plans.seatFix.ok,
  true,
  '3 ≥ 2 → 只改 b 就算可行（旧口径会因全局最大 gap 0.03 > 容差 0.01 判"无解"）',
);
assert.equal(gp.plans.seatFix.groups.length, 2, '★ 每个乘坐一套函数 → 2 个分组，不是按样品分');
assert.equal(
  gp.recommend,
  'seatFix',
  '没有检测项目列 → 共用单位拉回 seat，推荐 seatFix + a 不动（旧表按每乘坐一套，符合参考版规则 1）',
);
assert.equal(gp.alignRate, 0.5, '默认通过门槛 = 50%');
// ★ 补偿的代价必须在**样品层**报出来：乘坐B 的 b 取 −0.03 才救得回 1#/2#/3#，
//   代价是把原本在容差内的 4# 推出去（真表 1180M 左乘坐 1# 就是同一现象）
const lost4 = gp.plans.seatFix.detail.filter(d => d.name === '4#' && !d.ok).length;
assert.equal(lost4, 1, '★ 4# 原始能对上、却被这个补偿值推出容差（样品层要能看出来）');

// 同一个数据集，门槛调到 100% 时首选粒度必须变成不可行（阈值 = 4，只对上 3 个）
const planStrict = mod.analyzeBySeat(
  [mkPlanSeat('乘坐A', 0.001, 0.001), mkPlanSeat('乘坐B', 0.03, 0.001)],
  0.01,
  'linear',
  0.05,
  0.05,
  1,
).global;
assert.equal(planStrict.threshold, 4, '100% 门槛 → 需 4 个样品全部对上');
assert.equal(planStrict.plans.seatFix.ok, false, '只对上 3/4 个样品时"每乘坐一套 + 只改 b"不可行');
assert.equal(planStrict.recommend, null, '没有任何方案过 100% 门槛 → 不给推荐，走"排查测量系统"分支');

/* ══════════════════════════════════════════════════════════════════
   ★ 核心口径（用户 2026-09-21）：组合 = **样品**，跨乘坐合并判定
   一个样品在左右两个乘坐各有一组点位，它「对上」= **两边所有点位都达标**。
   用户给的例子：左乘坐对上 1~6、右乘坐对上 2~7
     → 只能算对上 2~6 共 **5** 个样品（取交集）
     → 不是 6+5=11，也不是"每边各自过半就算过"
   改动前把 (乘坐 × 样品) 当两个组合分别数，真表 1180M 因此报成 13/20；
   实际只有交集的样品才叫真的对上。这条断言就是防它退回去。
   ══════════════════════════════════════════════════════════════════ */
const mkTenSeat = (name, from, to) => ({
  name,
  products: Array.from({ length: 10 }, (_, i) => {
    const n = i + 1;
    const g = (n >= from && n <= to) ? 0.001 : 0.03;
    return mkProduct(`${n}#`, QV4, Array(4).fill(g));
  }),
});
const CROSS = mod.analyzeBySeat(
  [mkTenSeat('左乘坐', 1, 6), mkTenSeat('右乘坐', 2, 7)],
  0.01, 'linear', 0.05, 0.05,
).global;
assert.equal(CROSS.total, 10, '★ 组合维度 = 样品数（10），不是 乘坐×样品（20）');
assert.equal(CROSS.threshold, 5, '★ 门槛 = ceil(10 样品 × 50%) = 5');
assert.equal(
  CROSS.passRaw, 5,
  '★ 左对上 1~6、右对上 2~7 → 只算对上 2~6 共 5 个样品（不是 11，也不是每边各自过半）',
);
const CROSS_PLAN = CROSS.plans.seatFix;   // 样品级逐点/判定都在 plan.detail 上
assert.deepEqual(
  CROSS_PLAN.detail.filter(d => d.ok).map(d => d.name),
  ['2#', '3#', '4#', '5#', '6#'],
  '★ 对上的一定是交集 2#~6#',
);
assert.equal(CROSS_PLAN.detail[0].n, 8, '每个样品 2 乘坐 × 4 点 = 8 个点位一起判定，不能分开数');
assert.deepEqual(CROSS_PLAN.detail[0].seats, ['左乘坐', '右乘坐'], '样品必须报出它覆盖了哪些乘坐');
assert.deepEqual(
  CROSS_PLAN.detail[0].bySeat.map(s => `${s.seat}:${s.align}/${s.n}`),
  ['左乘坐:4/4', '右乘坐:0/4'],
  '★ 1# 在左乘坐 4/4 达标，但右乘坐 0/4 → 整体不对上（分乘坐小计只用于定位）',
);
assert.equal(
  CROSS.passRaw >= CROSS.threshold, true,
  '5 ≥ 5 → 用户这个例子里"每边过半"的表其实是真的达标，但理由必须是交集够 5 个',
);

/* ══════════════════════════════════════════════════════════════════
   a（分辨率缩放）必须由稳健拟合如实给出，**不允许夹在容差内**（参考版 §8.3）
   历史 bug：曾在 [1−aTol, 1+aTol] 内搜 a，结果真表上 a 恒为 0.9000（边界值），
   还打了个"|a−1| ≤ aTol ✓"的勾 —— 那是被夹出来的假值。
   真数据 QV=[9,18,27,36]、CCD=[10,20,30,40] → 精确关系 y = 0.9x。
   ══════════════════════════════════════════════════════════════════ */
const slopeSeat = {
  name: '斜率乘坐',
  products: [
    { name: '1#', qv: [9, 18], meas: [10, 20], missing: 0 },
    { name: '2#', qv: [27, 36], meas: [30, 40], missing: 0 },
  ],
};
const sl = mod.analyzeBySeat([slopeSeat], 0.01, 'linear', 0.05, 0.05).seats[0];
assert.ok(Math.abs(sl.a - 0.9) < 1e-6, `a 必须拟合出真实斜率 0.9，实际 ${sl.a}（夹紧时会得到 0.95）`);
assert.equal(sl.aOk, false, 'aTol 只用于判断：|0.9−1| = 0.1 > 0.05 → 必须标 aOk=false，而不是把 a 改成 0.95');
assert.equal(sl.products[0].fitPass, true, 'y = 0.9x 下 1# 变换后全部点位对上');
const slPlan = mod.analyzeBySeat([slopeSeat], 0.01, 'linear', 0.05, 0.05).global;
assert.equal(slPlan.plans.seatFit.groups[0].a.toFixed(4), '0.9000', '方案 B（每乘坐一套 + 调 a）的 a 同样取 0.9');
assert.equal(slPlan.plans.seatFix.groups[0].a, 1, '方案 A 的 a 固定为 1（只改补偿值）');

/* ══════════════════════════════════════════════════════════════════
   补偿共用单位两档（用户 2026-09-20 明确）
   默认 = **按检测项目跨乘坐共用**：同一检测项目在所有乘坐、所有产品上只给一个 b。
     理由：现场一套测量程序只能填一个补偿值；左乘坐舌片与右乘坐舌片是同一个
     检测项目（舌片TPY），必须共用同一个 b，不能各填一个。
   另一档 = **每个乘坐一套统一函数**（参考版 §8 规则 1 的原始表述，也是老表格的兜底）：
     该乘坐所有产品共用一套 y = ax + b；同一乘坐内多个检测项目则各给一个 b。
   两档都必须守住同一条底线：**绝不能每个产品一个 b**。
   表里没有检测项目列时 item 档不成立 → 退回 seat 档，并且不建 item 两个方案。
   真实表：每个产品块左侧两列 = 检测项目名（如 舌片TPY）+ 点位序号，
   形如 [舌片TPY | 1 | offest | QV | CCD | CCD+ | GAP]，横向并排多块。
   ══════════════════════════════════════════════════════════════════ */
const ITEM = '舌片TPY';
const TOL = 0.01;
// 每块 7 列（0-based）：0=项目名 1=点位序号 2=offest(块标签) 3=QV 4=CCD 5=CCD+ 6=GAP
function itemRows(offsets) {
  // offsets: [[1# 的 gap, 2# 的 gap], ...每行]；行 = 检测点
  const label = ['', '', '1#', 'QV', 'CCD', 'CCD+', 'GAP', '', '', '', '2#', 'QV', 'CCD', 'CCD+', 'GAP'];
  const rows = [['', '', '', '', '', '', '', '', '', '', '', '', '', '', ''], label];
  offsets.forEach(([g1, g2], i) => {
    const qv = 10 + i;
    const row = ['', i + 1, '', qv, qv + g1, qv + g1, g1, '', '', i + 1, '', qv, qv + g2, qv + g2, g2];
    if (i === 0) { row[0] = ITEM; row[8] = ITEM; }   // 项目名是纵向合并单元格 → 只有首行有值
    rows.push(row);
  });
  return rows;
}
const OFFSETS = [[-0.020, -0.019], [-0.021, -0.020], [-0.019, -0.021]];
const itemWb = XLSX.utils.book_new();
[['左乘坐舌片', OFFSETS], ['右乘坐舌片', OFFSETS]].forEach(([name, offs]) => {
  const rows = itemRows(offs);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: 14 } });
  XLSX.utils.book_append_sheet(itemWb, ws, name);
});

const parsedItems = mod.parseWorkbook(itemWb);
assert.equal(parsedItems.labelled, true, '表里有检测项目列 → labelled 标记必须为 true');
assert.equal(parsedItems.seats.length, 2, '两个 sheet → 两个乘坐');
assert.equal(parsedItems.seats[0].products.length, 2, '每块一个产品(1#/2#)');
assert.deepEqual(
  parsedItems.seats[0].products[0].items,
  [ITEM, ITEM, ITEM],
  '检测项目名必须随点带出来（合并单元格只有首行有值 → 向后继承）',
);
assert.deepEqual(parsedItems.seats[1].products[1].items, [ITEM, ITEM, ITEM], '每块都读到自己的项目名');
assert.deepEqual(parsedItems.seats[0].products[0].qv, [10, 11, 12], 'QV 列仍按原样读取');

const gi = mod.analyzeBySeat(parsedItems.seats, TOL, 'linear', 0.05, 0.05).global;
assert.equal(gi.labelled, true, 'plan 必须知道表里有没有项目列');
assert.equal(gi.total, 2, '★ 组合维度 = 样品数（1#/2#），不是 乘坐×样品（4）');
// ★ 同一个样品名在左右两个乘坐各有一组点位 → 必须合并成一个组合，点位带各自的乘坐
assert.equal(gi.combos.length, 2, '两个乘坐装的是同批样品（1#/2#）→ 只有 2 个组合');
assert.equal(gi.combos[0].pts.length, 6, '1# 在左右两个乘坐各 3 点 = 6 个点一起判定');
assert.equal(
  gi.combos[0].pts.filter(pt => pt[3] === '左乘坐舌片').length,
  3,
  '★ 点位必须自带乘坐标签（分组与判定都按点位所属乘坐算）',
);
assert.deepEqual(gi.combos[0].seats, ['左乘坐舌片', '右乘坐舌片'], '样品必须报出它覆盖的乘坐');

// ★ 默认共用单位 = 按检测项目（跨乘坐）—— 用户 2026-09-20：左右乘坐的补偿必须一致，
//   因为现场一套测量程序只能填一个补偿值（左乘坐舌片 / 右乘坐舌片 是同一个检测项目）
assert.equal(gi.groupPref, 'item', '★ 默认共用单位必须是「按检测项目共用（跨乘坐）」，不是每乘坐一套');
assert.equal(gi.recommend, 'itemFix', '★ 默认推荐必须是 item 档 + 只改 b（一套程序一个补偿）');
assert.equal(gi.plans.itemFix.groups.length, 1, '★ 同一检测项目在所有乘坐上只能有 1 个 b');
assert.equal(gi.plans.itemFix.groups[0].name, ITEM, '补偿值挂在检测项目名下');
assert.equal(gi.plans.itemFix.groups[0].n, 12, '2 乘坐 × 2 产品 × 3 点 = 12 个点共用这一个 b');
assert.deepEqual(
  gi.plans.itemFix.groups[0].seats,
  ['左乘坐舌片', '右乘坐舌片'],
  '★ 这个 b 必须报出"覆盖两个乘坐"，现场才知道左右共用的是同一个补偿值',
);
assert.equal(gi.plans.itemFix.pass, 2, '共用一个 b 时 2 个样品都对上');
// byCombo：样品级逐点结果（矩阵/明细/导出/散点图共用），每点要带乘坐与所用 a、b
const bc1 = gi.plans.itemFix.byCombo.get('1#');
assert.equal(bc1.states.length, 6, '1# 的 byCombo 里应有 6 个点');
assert.equal(bc1.states.filter(s => s.seat === '左乘坐舌片').length, 3, '★ byCombo 的逐点结果要区分乘坐');
assert.equal(bc1.ok, true, 'byCombo 的 ok 必须与 detail 的判定一致（两边都对上才算）');

// 另一档共用单位：每个乘坐一套函数 → 两个乘坐 = 两个分组（不是按样品 1#/2# 分）
assert.equal(gi.plans.seatFix.groups.length, 2, '「每个乘坐一套函数」→ 2 个分组');
assert.equal(gi.plans.seatFix.groups[0].n, 6, '每个乘坐 2 样品 × 3 点 = 6 个点共用一套函数');
assert.equal(gi.plans.seatFix.groups[0].a, 1, '方案 A 不动分辨率');
assert.equal(gi.plans.seatFix.pass, 2, '每乘坐一套函数 + 只改 b 时 2 个样品都对上');
assert.equal(gi.passRaw, 0, '原始 gap 约 0.02 > 容差 0.01，未补偿时 0 个样品对上');

// 页面开关：显式选 seat 时，推荐顺序必须先试 seat 档
const giSeat = mod.analyzeBySeat(parsedItems.seats, TOL, 'linear', 0.05, 0.05, 0.5, 'seat').global;
assert.equal(giSeat.groupPref, 'seat', 'groupPref 必须透传');
assert.deepEqual(giSeat.keys.slice(0, 2), ['seatFix', 'seatFit'], '选了 seat 时先试 seat 的两个方案');
assert.equal(giSeat.recommend, 'seatFix', '选了 seat 时推荐 seatFix');
assert.deepEqual(
  mod.analyzeBySeat(parsedItems.seats, TOL, 'linear', 0.05, 0.05, 0.5, 'item').global.keys.slice(0, 2),
  ['itemFix', 'itemFit'],
  '选了 item 时先试 item 的两个方案',
);

// 老表格没有检测项目列：「按检测项目共用」无从谈起 → 退回每乘坐一套，item 两档干脆不建
assert.equal(planResult.global.labelled, false, '没有检测项目列时必须置 labelled=false');
assert.equal(planResult.global.groupPref, 'seat', '★ 没项目列时 groupPref 必须拉回 seat（不静默按项目分组）');
assert.equal(planResult.global.plans.itemFix, null, '没项目列时不建 itemFix（分组会退回每乘坐一套，与 seatFix 重复且标签误导）');
assert.equal(planResult.global.plans.itemFit, null, '没项目列时不建 itemFit');
assert.deepEqual(planResult.global.keys, ['seatFix', 'seatFit'], 'keys 里也不应出现 item 档');
assert.equal(planResult.global.plans.seatFix.groups.length, 2, '每乘坐一套 → 2 个分组（与有无项目列无关）');

// ★ 危险回归点：任何档次、任何入参下都不许退化成"每个产品一个 b"
//   （这是用户最初报的错；曾有一版 item 档在没有项目列时退化成按 1#/2# 分组）
const bare = mod.analyzeBySeat(
  [mkPlanSeat('乘坐A', 0.001, 0.001), mkPlanSeat('乘坐B', 0.03, 0.001)],
  0.01, 'linear', 0.05, 0.05, 0.5, 'item',
).global;
assert.equal(bare.plans.itemFix, null, '★ 没有项目列时，即使用户显式要 item，也不许建出按产品分组的方案');
assert.deepEqual(
  bare.plans.seatFix.groups.map(g => g.name),
  ['（无项目列·整乘坐一套）', '（无项目列·整乘坐一套）'],
  '★ 分组名必须是"整乘坐一套"，绝不能是 1# / 2#',
);
assert.deepEqual(
  bare.plans.seatFix.groups.map(g => g.seat),
  ['乘坐A', '乘坐B'],
  '★ 分组键必须落在乘坐上',
);

console.log('verify-correlation-parser: PASS');
