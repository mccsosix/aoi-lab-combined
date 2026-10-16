/**
 * 06 打光报告生成器 —— 版式自适应
 *
 * 问题：工站 / 影像页标题条的宽度是**人工拖出来的**，不是算出来的。
 *   源报告 slide3「2.硬體設定-CCD1」                → 条宽 201.2pt
 *   源报告 slide4「2.硬體設定-CCD2（替換鐳射工站）」 → 条宽 382.0pt
 *   源报告 7 页影像页标题条                          → 全是 201.2pt（照抄 slide3，没按文字重拖）
 * 同一份文件里同一种条子宽度差 1.9 倍，说明作者是看着文字拖的。
 * 归一化成单工站壳后，克隆页只有壳本体的 201.2pt，标题一长就会「蓝条截断、白字掉到白底上」。
 *
 * ── 2026-09-29 标注实验（决定系数的依据） ────────────────────────────────
 * 一开始用「4a+7b=201.2/24 与 12a+7b=382.0/24」两条方程解 a、b，得到 (0.942, 0.659)。
 * 但这段几何量的 `bodyPr` 是 `wrap="none" lIns=90000 tIns=46800 rIns=90000 bIns=46800`：
 * 左右各有 90000 EMU = **7.087pt 内边距**，文字不换行、超出即被裁 —— 所以常数项不能当 0。
 * 只靠那两个样本无法把「内边距」与「拉丁字宽」分开（欠定）。于是做了受控实验：
 * 把条宽强改成 700pt（保证不裁切）再渲染，逐串量墨迹（`.workbuddy/tmp/calib*`）：
 *
 *   纯 CJK 8 字（一二三四五六七八） 墨迹 190.8pt → 23.85pt/字
 *   纯拉丁大写 8 字（CCDDBBCD）     墨迹 135.3pt → 16.9pt/字
 *   纯数字 8 字（12345678）         墨迹 115.0pt → 14.4pt/字
 *   「2.硬體設定-CCD1」             墨迹右边界 207.3pt（源稿条只有 201.2pt → **源稿本身就裁了**）
 *   「2.硬體設定-CCD2（替換鐳射工站）」墨迹右边界 381.2pt（源稿条 381.8pt → 作者按文字精确拖的）
 *
 * 实验还暴露一件事：**LibreOffice 的中文字距比 WPS 宽**（同样一句，源稿按 WPS 量是 194.1pt，
 * LibreOffice 渲染成 199pt）。而交付物是在 WPS/PowerPoint 里打开的，所以系数**以源稿两个真实条宽为准**
 * （`条宽 = lIns + rIns + 文字推进宽`，作者拖到刚好贴合，视作精确解）：
 *   4a + 7b = (201.2 − 14.17)/24 ； 12a + 7b = (382.0 − 14.17)/24
 *   ⇒ a（全角）= 0.9417em、b（拉丁）= 0.6173em
 * 再统一加 8pt 安全余量。**总体上比源稿宽 2~8%** —— 这个方向的偏差是刻意选的：
 * 源稿的条子是贴着文字边缘拖的（slide3 的末位「1」在渲染里已经被切掉），
 * 我们留余量，代价是条子略长，换来的是换个长标题绝不会截断。
 */

/** 工站页 / 影像页里承载标题的 shape —— 由 token 自身定位（不写死 id，模板换了也不会错位） */
export function findShapeIdByToken(partXml: string, token: string): string | null {
  const needle = `{{${token}}}`;
  const re = /<p:sp>[\s\S]*?<\/p:sp>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(partXml)) !== null) {
    if (!m[0].includes(needle)) continue;
    const cv = /<p:cNvPr[^>]*/.exec(m[0]);
    const id = cv && /\sid="(\d+)"/.exec(cv[0]);
    if (id) return id[1];
  }
  return null;
}

const CJK = (cp: number): boolean =>
  (cp >= 0x2e80 && cp <= 0x9fff) || // CJK 部首、假名、汉字
  (cp >= 0xf900 && cp <= 0xfaff) || // CJK 兼容汉字
  (cp >= 0xff01 && cp <= 0xff60) || // 全角 ASCII（（）、：等）
  (cp >= 0x3000 && cp <= 0x303f);   // CJK 标点（。、〈〉等）

/** 系数由源报告两个真实标题条反解，见文件头注释 */
export const CJK_EM = 0.9417;
export const LATIN_EM = 0.6173;
export const SPACE_EM = 0.3;

/** 单字符宽度（em） */
export function charEm(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0;
  if (CJK(cp)) return CJK_EM;
  if (ch === " " || ch === "\u3000") return SPACE_EM;
  return LATIN_EM;
}

/** 一行文本的估算宽度（pt） */
export function textWidthPt(text: string, fontSizePt: number): number {
  let em = 0;
  for (const ch of text) em += charEm(ch);
  return em * fontSizePt;
}

export type TitleBarMetrics = { widthPt: number; textPt: number; capped: boolean };

export const TITLE_FONT_SIZE_PT = 24;
/** 段内左右内边距：模板实测 `lIns=90000 rIns=90000` EMU → 7.087pt × 2 */
export const TITLE_BAR_INSET_PT = 14.17;
/** 额外安全余量：源稿贴边拖、我们必须留白，否则长标题会截断 */
export const TITLE_BAR_SAFETY_PT = 8;
export const TITLE_BAR_PADDING_PT = TITLE_BAR_INSET_PT + TITLE_BAR_SAFETY_PT;
/** 页面宽 720pt（4:3）；留 4pt 余量 */
export const SLIDE_WIDTH_PT = 720;
export const MAX_TITLE_BAR_PT = SLIDE_WIDTH_PT - 4;

/** 标题条所需宽度：文字估算宽 + 内边距与余量，封顶到页宽 */
export function estimateTitleBarWidthPt(header: string, fontSizePt = TITLE_FONT_SIZE_PT): TitleBarMetrics {
  const textPt = textWidthPt(header, fontSizePt);
  const want = Math.round((textPt + TITLE_BAR_PADDING_PT) * 10) / 10;
  const widthPt = Math.min(want, MAX_TITLE_BAR_PT);
  return { widthPt, textPt, capped: want > MAX_TITLE_BAR_PT };
}

/** 把某个 shape 的 a:xfrm/a:ext 宽度改成 widthPt（只改 cx，不动 cy / 位置） */
export function setShapeWidthPt(partXml: string, shapeId: string, widthPt: number): string {
  const cx = Math.round(widthPt * 12700);
  const re = /<p:sp>[\s\S]*?<\/p:sp>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(partXml)) !== null) {
    const cv = /<p:cNvPr[^>]*/.exec(m[0]);
    if (!cv || !new RegExp(`\\sid="${shapeId}"`).test(cv[0])) continue;
    const block = m[0];
    const extRe = /<a:ext cx="\d+" cy="\d+"\/>/;
    if (!extRe.test(block)) continue;
    const patched = block.replace(extRe, (tag) => tag.replace(/cx="\d+"/, `cx="${cx}"`));
    return partXml.slice(0, m.index) + patched + partXml.slice(m.index + block.length);
  }
  return partXml;
}

/* ------------------------------------------------------------------ *
 * 文字块容量：文本块没有底色，溢出不会像标题条那样「截断」，
 * 但会压到右侧光路图上。这里只用来**给用户预警**，不自动改版式。
 * 宽度取自模板实测（门禁核对）。
 * ------------------------------------------------------------------ */
export const SPEC_BOX = { widthPt: 360.9, fontSizePt: 16, label: "硬件规格（10 行）" };
export const REQUIRE_BOX = { widthPt: 527.4, fontSizePt: 16, label: "需求推导（4 行）" };

/**
 * 影像页的「名称/说明」框。两种壳的文本框宽度**不一样**（源报告实测）：
 *   普通壳 527.4pt、特殊壳 577.9pt —— 特殊页的说明本来就是长句，作者把框拖宽了。
 * 用同一个门限会把源报告本身能放下的句子误报成溢出（replica 样张踩过），所以按壳分开。
 * 说明行还有 marL 431800 EMU ≈ 34pt 缩进 + 约 22pt 的 bullet 悬挂，可用宽度要减掉。
 */
export const IMAGE_BOX_WIDTH = { plain: 527.4, special: 577.9 } as const;

export type ImageShellKind = keyof typeof IMAGE_BOX_WIDTH;

export const imageCaptionBox = (kind: ImageShellKind) => ({
  widthPt: IMAGE_BOX_WIDTH[kind],
  fontSizePt: 16,
  label: `打光影像·名称行（${kind === "special" ? "特殊" : "普通"}壳）`,
});

export const imageDescBox = (kind: ImageShellKind) => ({
  widthPt: IMAGE_BOX_WIDTH[kind] - 34 - 22,
  fontSizePt: 16,
  label: `打光影像·说明行（${kind === "special" ? "特殊" : "普通"}壳）`,
});

/** 返回超宽的行（估算值，带 5% 余量） */
export function overflowingLines(lines: string[], box: { widthPt: number; fontSizePt: number }): string[] {
  const limit = box.widthPt * 0.95;
  return lines.filter((l) => textWidthPt(l, box.fontSizePt) > limit);
}
