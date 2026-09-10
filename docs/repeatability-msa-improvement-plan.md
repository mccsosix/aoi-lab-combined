# 重复性分析功能改造方案（MSA 标准对齐）

> 版本：v2　日期：2026-09-07　范围：`src/repeatability/repeatability-v1.6.html`
>
> **判定口径不变（硬性要求）**：`6σ/T` 三档 `<10% 认可 / 10–20% 条件认可 / ≥20% 不认可`，这是所在组织/客户的既有标准，本方案**不改阈值**。
>
> 改造方向转向：在阈值不变的前提下，解决「判定之后没有可行动信息」这个真正让用户觉得「没用」的问题——引入 Cg/Cgk 作为行业对标参考、补样本量门槛、把诊断改成「证据链 + 精度/偏置二分」、强化 Before/After。

---

## 1. 你们的判定口径在行业里的位置（用于对标，不是要改）

| 维度 | AIAG MSA 第四版（通用） | 你们的要求 |
|---|---|---|
| 可接受 | ≤10% | <10%（一致） |
| 条件接受 | 10–30% | 10–20%（**更严**） |
| 不可接受 | >30% | ≥20%（**更严**） |

你们的 20% 就判「不认可」，比 AIAG 的 30% 严了整整一档。这是合理的（AOI 视觉量测往往用于关键尺寸，客户要求更严），但带来一个现实后果：**现场会频繁出现「不认可」，工程师需要更强的「为什么 + 怎么办」支撑，否则就会觉得工具只会判、不会帮**。这正是本轮改造的着力点。

## 2. 概念澄清：当前算的是 %Tolerance，不是 %GRR

单台 AOI 设备 + 同一零件多次重复测量，没有零件间变异、没有操作员差异，因此：
- 算不了 %GRR（缺少「总研究变异」分母）；
- 算的是 **%Tolerance**（等价 6σ/T），也就是你们判定所用的口径；
- 对应业界的是 **Type 1 Gage Study**（设备重复性），不是完整 GR&R。

→ 界面应标注「本工具是 Type 1（设备重复性）研究，不含操作员再现性」，避免被误认为做了完整 MSA。

## 3. 关键公式与行业对标（辅助参考，不改判定）

```
s   = 重复测量标准差          T = 公差带宽（USL − LSL）
Cg  = 0.2·T / (6·s)           Cgk = (0.1·T − |x̄ − xm|) / (3·s)   （需基准值 xm）
```

当前指标 `6σ/T`（记 P）与 Cg 的换算：**`Cg = 20 / P`**

| Cg | 6σ/T（你们的 P） | 对应你们的判定 |
|---|---|---|
| ≥ 2.0 | ≤ 10% | 认可 |
| 1.0 – 2.0 | 10 – 20% | 条件认可 |
| < 1.0 | > 20% | 不认可 |

> 用途：把 Cg/Cgk 显示在结果旁作「行业对标参考」，工程师对外可说「我们按 6σ/T≤10% 验收，等价 Cg≥2.0，严于业界通用的 1.33」，也理解为什么现场总是不认可。**它不参与判定。**

## 4. 改造方案（阈值不变）

### P0-1　诊断改成「证据链 + 精度/偏置二分」（核心，解决「没用」）

现在 `diagnoseItem` 的启发式规则命中「高置信度」条件苛刻，多数 Item 掉进兜底分支输出「置信度：低 + 一句废话」。改为只呈现数据本身支持的事实：

- 证据链：哪个 Run 离群（MAD 分数）、哪个 Image Group 同步漂移、哪个 Item 跨产品复现；
- 精度/偏置二分（与 MSA 的 EV/bias 分解对齐）：
  - **分散大（σ 大、极差大）** → 指向测量工具 / 图像处理 / 定位稳定性；
  - **偏置大（均值偏离公差中心）** → 指向标定 / 基准 / 基准值偏差。

这套「分散 vs 偏置」二分，比现有七条 `CAUSES` 启发式更可解释、更可信，且直接回答工程师最关心的「到底先查哪边」。

### P0-2　总览改成「决策面板」，异常列表前移（承接上轮 UX 结论）

总览现在信息过载（判定 + 风险摘要 + 分布 + 集中位置 + 校验详情全堆一起）。收敛为：
一句话结论 + **异常按 6σ% 降序列表（主视图，直接放第一）** + 一个「下一步」按钮；分布/集中位置/校验详情折叠为次要信息。

### P1-1　补样本量门槛（保证 6σ% 这个数字可靠）

当前 `measurements.length < 2` 即有效，门槛过低。dmaic.io 明确「<10 次重复时 s 与偏倚不可靠，标准 25–50 次」：
- <5 次 → 判「数据不足」；
- 5–9 次 → 可算但挂橙色警告「样本量不足，6σ% 估计不可靠，建议 ≥25 次」。

### P1-2　引入 Cg/Cgk 行业对标参考（不参与判定）

新增 `calculateCgCgk(measurements, tolerance, refValue?)`；结果区在 6σ% 旁显示「行业对标 Cg = X.X（业界通用 ≥1.33）」。有基准值时出 Cgk；无基准值 Cgk 标「待基准值」。

### P1-3　澄清 Type 1 研究类型

界面显式说明「本工具是 Type 1（设备重复性）研究，不含操作员再现性；完整 GR&R 需另做多操作员 + 多零件的 Type 2」。

### P2-1　强化 Before/After（阈值不变时，改善体现在数值与档位跨越）

调机改善在阈值不变时表现为：6σ% 数值下降、以及**档位跨越**（如 25% → 8%）。把「改善/恶化/无明显变化」做成「变化量 + 箭头 + 是否跨档」的直观展示，一眼看到「调没调好、好了多少」。

## 5. 参考来源

1. AIAG《测量系统分析（MSA）手册》第四版 — %GRR ≤10% / 10–30% / >30%；重复性 ≤10%、再现性 ≤15%、NDC ≥5。
   - 转述：MBA智库百科 https://wiki.mbalib.com/wiki/MSA
2. Minitab 官方 — Type 1 Gage Study 的 Cg/Cgk 定义；%Study Var 与 %Tolerance 区别。
   - https://support.minitab.com/en-us/minitab/help-and-how-to/quality-and-process-improvement/measurement-system-analysis/supporting-topics/other-gage-studies-and-measures/type-1-gage-study/
   - https://support.minitab.com/en-us/minitab/help-and-how-to/quality-and-process-improvement/measurement-system-analysis/how-to/gage-study/nested-gage-r-r-study/interpret-the-results/all-statistics-and-graphs
3. Hilti MSA Study Guide — `Cg = 0.2·T/6·s`，`Cgk = (0.1·T − |x̄−xm|)/3·s`，判定 ≥1.33。
   - https://www.hilti.group/content/dam/documents/Media-Release/supplier_documents/en/Hilti_MSA-study_guide.pdf
4. 中国计量学报《核燃料棒长度自动测量系统有效性验证研究》— Cg 反映重复性，Cg ≥ 1.33 即 8s ≤ 20%T。
   - https://jlkj.nim.ac.cn/article/doi/10.3969/j.issn.2096-9015.2021.03.12
5. dmaic.io《MSA Type 1》— 重复测量 25–50 次；<10 次时 s 与偏倚不可靠；Cg/Cgk ≥1.33 为国际通行门槛。
   - https://docs.dmaic.io/en/measure/msa-typ1.html
6. iSixSigma《A Comparison of MSA Metrics》— 三种百分比分母与适用场景；<10% 优秀、10–30% 条件、>30% 不可接受。
   - https://www.isixsigma.com/tools-templates/measurement-systems-analysis-msa-gage-rr/a-comparison-of-measurement-system-analysis-metrics-part-1-of-2

---

## 6. 落地检查清单

- [ ] 判定阈值 `<10 / 10–20 / ≥20` 保持不变
- [ ] 诊断改为「证据链 + 精度/偏置二分」
- [ ] 总览改为「决策面板」，异常列表前移
- [ ] `calculateCgCgk` 实现，6σ% 旁显示行业对标 Cg（不参与判定）
- [ ] 样本量门槛：<5 判不足、5–9 警告
- [ ] 界面标注「Type 1 研究」
- [ ] Before/After 展示变化量 + 档位跨越
- [ ] 执行 `npm run verify:repeatability`、`tsc -b`、`npm run build`
