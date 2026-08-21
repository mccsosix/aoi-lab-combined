# AOI LAB · Vibe Coding 成果分享 deck 方案（v3）

## 目标与受众
- **受众**：AOI 团队成员（同事），已知 AOI 业务背景，需要被说服「AI 真能用来做实用的东西」并知道怎么拿到、怎么用。
- **场景**：团队内部分享 / 演示，异步阅读也可。
- **目标**：10–12 分钟讲清「为什么做（学 Agent + 解决复杂重复工作）→ vibe coding 怎么用 → 从设计规范到功能一步步做出来 → AI 时代技术不难、难的是怎么用 → 大家也可以试试」。
- **时长**：12 页，每页 45–60 秒。
- **比例**：1280×720（16:9）。
- **交付格式**：`.bento.html`（单文件，离线可开可演示）+ `deck.json` + `deck-plan.md` + 验证报告。
- **离线边界**：全部内嵌，无外链图片/字体/视频；图表用内置 charts-lite 纯 JSON。**不使用真实截图**（简洁卡片风格）。

## 一句话结论
AOI LAB 是**学习 Agent 的过程中，用 vibe coding 把工作里复杂重复的事收成工具的成果**——AI 时代技术本身不难，难的是知道怎么用，这个项目就是证据：从设计规范到功能，一步步和 AI 结对做出来。

## 叙事弧（叙事型）
封面 → 为什么做（工作中的重复 + 学 Agent 的动机）→ vibe coding 是什么（和 AI 结对）→ 设计先行（先定规范再写功能）→ 工具总览 → 三个工具深挖 → 工程事实 → 核心认知（技术不难，难的是怎么用）→ 三点收获 + 号召 → Agent 推荐 & 结尾 CTA。

## 逐页计划
| # | 任务 | 核心信息 | 视觉所有者 | bento 能力 | notes 要点 | 来源 |
|---|---|---|---|---|---|---|
| 1 | 封面 | AOI LAB · 第一次 vibe coding 的成果 | 大标题 + countUp 数字 | text + countUp + dash-march | 定调：学习 Agent 的成果 | 经验 |
| 2 | 为什么做 | 查交期/手搓Excel/FOV/6σ 都不难，加起来很烦 | 4 痛点卡 + 结论条 | text + shape | 共鸣：这些事大家都做过 | 经验 |
| 3 | vibe coding 是什么 | 说需求→AI给方案→确认/调整→跑起来迭代 | 流程路径 | path/dash-march + 节点 | 人主导方向，AI 负责实现 | 经验 |
| 4 | 设计先行 | 先定配色/纯2D/样式前缀，再写功能 | 色板 + 规则卡 | shape + text | 展示专业性：有规范 | FRONTEND_DESIGN_GUIDELINES.md |
| 5 | 工具总览 | 5 卡位 4 可用 + 1 占位 | 卡片网格 | shape + text | 每张卡一个独立工具 | README |
| 6 | 深挖：重复性分析 | 导入即重算 6σ、三档判定、Before/After | 面板 + 三档卡 | shape + text | 阈值与经验存本机 | README |
| 7 | 深挖：FOV 选型 | 相机×镜头 FOV、反向推荐、资料库 | 面板 + countUp 大数字 | text + countUp | 1,147 相机 / 426 镜头 | README |
| 8 | 深挖：生成器&查询 | VPP 免 SDK；案件查交期 | 双卡对比 | shape + text | 纯浏览器解析 VPP | README |
| 9 | 工程事实 | React19/TS/Vite/Tailwind4、无后端、IndexedDB、Shadow DOM | 表格 | table | 不是漂亮话，是代码事实 | AGENTS.md |
| 10 | 核心认知 | AI 时代技术不难，难的是怎么用；这项目就是证据 | 大字宣言 + 支撑卡 | text + shape | 全 deck 高潮 | 用户原话 |
| 11 | 收获 + 号召 | 迭代快 / AI 是结对伙伴 / 规范不能省；你也试试 | 三心得卡 + 号召条 | shape + text | 真诚复盘 + 引导尝试 | 经验 |
| 12 | Agent 推荐 & CTA | 主流 Agent：Claude Code / Codex / WorkBuddy | 3 卡 + CTA 条 | shape + text | 从哪个开始用 + 行动引导 | 经验 |

## 素材清单
- 全部文字/图形/图表内嵌，无外部媒体。
- 配色沿用项目规范：navy #072F50 / paper #FFFAEA / cyan #24D4D3 / orange #FF9D2E，纯 2D。
- 数据事实来源：README.md、AGENTS.md、FRONTEND_DESIGN_GUIDELINES.md、.workbuddy/memory/（1,147 相机、426 镜头、4 可用工具、05 占位、离线单文件分发）。
- 内置 bento shell：skill 自带 `assets/bento/Bento_Slides.bento.html`。

## 风险与 missing evidence
- 本环境具备 Playwright，构建后做浏览器 gate 视觉验收（封面、高密度页、表格页、放映翻页、无横向溢出）。
- 颜色、字号为设计主观，以浏览器实际打开为准。
- 历史版本：`AOI_LAB_vibecoding_intro.bento.html`（v1，本方案沿用其视觉风格）、`AOI_LAB_vibecoding_v2.bento.html`（带截图版，已弃用）。
