/**
 * 06 打光报告生成器 —— **模板族注册表**（唯一真相源）
 *
 * 一个「模板族」= 一份预处理过的模板 pptx + 它的一组壳 + 它的版式约定。
 * 为什么要有这一层：源报告不止一族版式，实测两份差得很远——
 *
 *   · 密封圈族（`液冷入料密封圈AI檢測評估報告X4`）：12 页 → 6 壳；
 *     标题条 201.2pt；章节前缀 `1.檢測需求` / `2.硬體設定-` / `3.打光影像-` / `4.結論`；
 *     工站页的光路图是**位图**（4 个 `<p:pic>`）；影像页标题条写 `3.打光影像-{缺陷}`。
 *   · 四合一族（`118B2&117BA共线四合一評估報告`）：12 页；标题条 201.3pt；
 *     前缀 `1.检测需求` / `1.硬體配置-`；光路图是**矢量图形**（无 pic）；
 *     含 **3D雷射** 这种非 CCD 工站；**没有結論页**；
 *     影像页标题条写的是**工站名**（`1.硬體配置-CCD1`），名称行才写 `打光影像`。
 *
 * 三处都读这份映射，所以只能有一份：
 *   · `scripts/lighting-report/build-template.mjs` —— 决定保留哪些原始页、删掉哪些
 *   · `domain/generate.ts` / `domain/plan.ts` —— 决定每张输出页用哪个壳当原型
 *   · `scripts/verify-lighting-report.mjs` —— 断言产物 manifest 里的 layout 与这里一致
 * 三处各自硬编码一套必然漂移。
 *
 * ⚠️ 影像页**不能靠克隆整套版式**：源报告 7 页影像页是人手摆的，没有网格 ——
 *    同是 4 图页，图片落在 (48,304)(462,171)(292,174)(26,171)；5 图页又是另一组坐标。
 *    可见的公共骨架只有「标题条 + 名称/说明框」（+ 特殊页的 ↓），
 *    图片与红圈必须由画布引擎按坐标写出来。
 *    所以壳里**只保留骨架**，图片/红圈/箭头在模板阶段就清掉 —— 留着会让人误以为那是本 case 的图。
 */

import type { Box } from "./types.ts";

export type TemplateLayout = {
  cover: string;
  requirement: string;
  station: string;
  imagePlain: string;
  imageSpecial: string;
  conclusion: string;
};

/** 模板族的版式约定 —— 生成器只认这些开关，不认具体是哪份报告 */
export type TemplateConventions = {
  /**
   * 影像页标题条取法：
   *   `section` —— `3.打光影像-{缺陷}`（密封圈族；特殊页也用基础缺陷名）
   *   `station` —— 用所属工站的标题（四合一族，标题条写 `1.硬體配置-CCD1`）
   */
  imageHeader: "section" | "station";
  /** 影像页**名称行**前缀；`station` 族留空（名称行整条由用户填） */
  imageCaptionPrefix: string;
  /** 需求页贴图的内容区（pt）。等比适配居中，不裁切 */
  requireImageBox: Box;
  /** 需求页标题条文字（固定，不开 token —— 它是章节名不是内容） */
  requirementHeader: string;
  /** 工站标题条的默认前缀，只用于 UI 给默认值 */
  stationHeaderPrefix: string;
  /** 这族模板有結論页吗（四合一那份实测没有） */
  hasConclusion: boolean;
};

export type TemplateFamily = {
  /** 稳定 id —— 存进 `ReportModel.templateId`，**定下不要改名** */
  id: string;
  name: string;
  /** 一句话说明适用范围（UI 上直接给用户看） */
  hint: string;
  layout: TemplateLayout;
  shells: string[];
  conventions: TemplateConventions;
};

/* ------------------------------------------------------------------ *
 * 族 ①：密封圈版（当前唯一已实现的族）
 * ------------------------------------------------------------------ */

/**
 * 源报告 12 页 → 6 个壳的归一化（2026-09-29 P2a）：
 *   1  封面                     → cover
 *   2  1.檢測需求               → requirement（2026-09-30 起参数化：文字 + 可选一张图）
 *   3  2.硬體設定-CCD1          → station（第 1 个工站用它，其余克隆）
 *   4  2.硬體設定-CCD2          → 删（与 slide3 结构完全相同，克隆即可）
 *   5  3.打光影像-破損（4图页）  → imagePlain（影像页-普通壳）
 *   6  3.打光影像-破損（2图页）  → 删（又一页人手摆的普通页，壳用不上）
 *   7  同 6                    → 删
 *   8  3.打光影像-破損-特殊      → imageSpecial（影像页-特殊壳：单图 + 说明 + ↓）
 *   9  3.打光影像-毛邊（5图页）  → 删
 *   10 3.打光影像-毛邊（2图页）  → 删
 *   11 3.打光影像-毛邊-特殊      → 删（与 slide8 同构）
 *   12 4.結論                  → conclusion（P3b 才会参数化）
 */
export const SEALING_LAYOUT: TemplateLayout = {
  cover: "ppt/slides/slide1.xml",
  requirement: "ppt/slides/slide2.xml",
  station: "ppt/slides/slide3.xml",
  imagePlain: "ppt/slides/slide5.xml",
  imageSpecial: "ppt/slides/slide8.xml",
  conclusion: "ppt/slides/slide12.xml",
};

export const SEALING_FAMILY: TemplateFamily = {
  id: "sealing",
  name: "密封圈版",
  hint: "章节为 1.檢測需求 / 2.硬體設定 / 3.打光影像 / 4.結論；工站光路图是位图。适用于密封圈这类小件。",
  layout: SEALING_LAYOUT,
  shells: Object.values(SEALING_LAYOUT),
  conventions: {
    imageHeader: "section",
    imageCaptionPrefix: "打光影像-",
    // 源报告需求页的 4 张产品照片落在 x 34.5→670.2 / y 94.7→471.5，
    // 顶上还有一行「密封圈內徑/厚度」文本框（y 45→85）。取这一块当图片区。
    requireImageBox: { xPt: 20, yPt: 92, wPt: 680, hPt: 386 },
    requirementHeader: "1.檢測需求",
    stationHeaderPrefix: "2.硬體設定-",
    hasConclusion: true,
  },
};

/* ------------------------------------------------------------------ *
 * 族的注册表
 * ------------------------------------------------------------------ */

export const TEMPLATE_FAMILIES: Record<string, TemplateFamily> = {
  [SEALING_FAMILY.id]: SEALING_FAMILY,
};

export const TEMPLATE_IDS: string[] = Object.keys(TEMPLATE_FAMILIES);
export const DEFAULT_TEMPLATE_ID = SEALING_FAMILY.id;

export function getFamily(id: string | undefined): TemplateFamily {
  const family = TEMPLATE_FAMILIES[id ?? DEFAULT_TEMPLATE_ID] ?? SEALING_FAMILY;
  return family;
}

/** 默认族 —— 现有调用点（plan/generate/门禁/样张）不传 family 时按它走 */
export const TEMPLATE_LAYOUT: TemplateLayout = SEALING_FAMILY.layout;
export const TEMPLATE_SHELLS: string[] = SEALING_FAMILY.shells;

/** 归一化时从源报告里删掉的页（密封圈族，源报告页码） */
export const DROPPED_SOURCE_SLIDES: number[] = [4, 6, 7, 9, 10, 11];

/** 影像壳里除了骨架之外要一并清掉的东西（按 cNvPr id 保留骨架） */
export const IMAGE_SHELL_KEEP_IDS: Record<"plain" | "special", string[]> = {
  // 标题条（AutoShape 107）+ 名称/说明框（文字方塊 48）
  plain: ["4", "12295"],
  // 同上 + ↓ 箭头文本框（文本框 5）
  special: ["4", "12295", "6"],
};

/**
 * 需求壳里要清掉的东西 —— 源报告的 4 张产品照片 + 5 个名称标签框。
 * 用户 2026-09-30 定：需求页内容必须能填（手打项目名称 / 贴一张品保发的需求表），
 * 不能原样带着上一个案子的照片。保留：标题条（8194）+ 顶部文字框（8195）。
 */
export const REQUIRE_SHELL_KEEP_IDS: string[] = ["8194", "8195"];

/* ------------------------------------------------------------------ *
 * 数据模型侧的常量（与具体模板无关，但同属「影像段」的约定）
 * ------------------------------------------------------------------ */

/** 影像页标题条前缀（`imageHeader: "section"` 的族用） */
export const IMAGE_SECTION_PREFIX = "3.打光影像-";

/**
 * 影像页**名称行**的默认前缀 —— 与标题条**不同**：源报告的标题条写「3.打光影像-破損」，
 * 而同一个框里的名称行只写「打光影像-破損」（没有章节号）。两个前缀分开，
 * 免得把名称行的默认值填成标题条的样子（P2b 渲染复核时抓到的）。
 */
export const IMAGE_CAPTION_PREFIX = "打光影像-";

/**
 * 一个工站后面能挂几页打光影像 —— **不设上限**。
 * 源报告是「破損×4 + 毛邊×3」共 7 页，但那不是为了分页分出来的，
 * 是作者一节一节手贴的；工具侧由「缺陷分组 × 组内页数」自然决定。
 */
