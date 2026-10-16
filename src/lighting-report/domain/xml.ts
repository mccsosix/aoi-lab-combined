/**
 * 06 打光报告生成器 —— XML 层：占位符段落填充 + 高亮切 run
 *
 * 模板阶段已把每个可变块压成「单段 + 单 run + {{key}}」（见 build-template.mjs），
 * 所以运行时只剩纯字符串操作，不需要 DOM / 不需要 XML 解析器。
 *
 * 三件容易写错的事（都由门禁盯着）：
 *   ① `{{key}}` 必须整段独占才展开成多行；内联 token 只做文本替换
 *   ② 红色 `(新增)` 要在填充时重新切成独立 run —— 源文件是人手切的，模板压平后必须重建
 *   ③ 颜色是**覆盖**不是「没有才加」：标题条基线自带白色 solidFill，不覆盖就静默失效
 */

export const esc = (s: unknown): string =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 取某段里所有 <a:t> 的文字拼接（红色 (新增) 等被切成多 run 时，只有拼起来才是完整的行） */
export const textOf = (xml: string): string =>
  [...xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map((m) => m[1]).join("");

/** 取第一个匹配的标签（自闭合与成对两种写法都支持，按出现位置先者优先） */
export function firstTag(xml: string, tag: string): string | null {
  const paired = new RegExp(`<a:${tag}[^>]*>[\\s\\S]*?</a:${tag}>`);
  const self = new RegExp(`<a:${tag}[^>]*/>`);
  const p = paired.exec(xml);
  const s = self.exec(xml);
  if (p && s) return p.index < s.index ? p[0] : s[0];
  return (p || s)?.[0] ?? null;
}

/**
 * 把 run 的文字填充色设成 color —— 是**覆盖**，不是「没有才加」。
 * 标题条基线 rPr 自带白色 solidFill，`if (!有solidFill) 才加` 的写法会让标红静默失效。
 * 注意 rPr 里 `a:ln`（描边）也有 solidFill，先摘出来只在剩余部分替换，免得把描边填充改掉。
 */
function setRunColor(children: string, color: string): string {
  const fill = `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill>`;
  const ln = /<a:ln\b[^>]*(?:\/>|>[\s\S]*?<\/a:ln>)/.exec(children);
  const head = ln ? ln[0] : "";
  let tail = ln ? children.replace(ln[0], "") : children;
  tail = tail.replace(/<a:solidFill>\s*<a:srgbClr[^>]*\/>\s*<\/a:solidFill>/g, "");
  // DrawingML schema：solidFill 必须排在 latin/ea/cs 等字体标签之前
  const anchor = /<a:(latin|ea|cs|sym|hlinkClick|hlinkMouseOver|rtl|extLst)\b/.exec(tail);
  tail = anchor ? tail.slice(0, anchor.index) + fill + tail.slice(anchor.index) : tail + fill;
  return head + tail;
}

/** 在 rPr 上加样式：加粗走属性，颜色走 solidFill（顺序符合 DrawingML schema） */
export function applyProps(rPr: string | null, { bold, color }: { bold?: boolean; color?: string }): string | null {
  if (!rPr) return rPr;
  const paired = /^<a:rPr([^>]*)>([\s\S]*)<\/a:rPr>$/.exec(rPr);
  const selfClosed = /^<a:rPr([^>]*)\/>$/.exec(rPr);
  let attrs: string;
  let children: string;
  if (paired) {
    attrs = paired[1];
    children = paired[2];
  } else if (selfClosed) {
    attrs = selfClosed[1];
    children = "";
  } else return rPr;

  if (bold && !/\sb="/.test(attrs)) attrs += ' b="1"';
  if (color) children = setRunColor(children, color);
  return `<a:rPr${attrs}>${children}</a:rPr>`;
}

export type HighlightRule = {
  pattern: RegExp;
  props: { bold?: boolean; color?: string };
  /**
   * 从命中片段的两侧各去掉 N 个字符再输出（用于 `**强调**` 这类**标记本身不入正文**的写法）。
   * 没有这个开关的话，`**xxx**` 会把星号一起印到 PPT 上。
   */
  trim?: number;
};
export type RunSegment = { text: string; rPr: string | null };

/** 按规则把一行文本切成若干 run（未命中规则的部分保持基线 rPr） */
export function splitRuns(text: string, baseRPr: string | null, rules: HighlightRule[]): RunSegment[] {
  let segs: RunSegment[] = [{ text, rPr: baseRPr }];
  for (const rule of rules) {
    const flags = rule.pattern.flags.includes("g") ? rule.pattern.flags : rule.pattern.flags + "g";
    const next: RunSegment[] = [];
    for (const seg of segs) {
      if (seg.rPr !== baseRPr) {
        next.push(seg);
        continue;
      }
      const re = new RegExp(rule.pattern.source, flags);
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(seg.text)) !== null) {
        if (m.index > last) next.push({ text: seg.text.slice(last, m.index), rPr: baseRPr });
        const t = rule.trim ? m[0].slice(rule.trim, m[0].length - rule.trim) : m[0];
        if (t.length) next.push({ text: t, rPr: applyProps(baseRPr, rule.props) });
        last = m.index + m[0].length;
        if (m[0].length === 0) re.lastIndex += 1;
      }
      if (last < seg.text.length) next.push({ text: seg.text.slice(last), rPr: baseRPr });
    }
    segs = next;
  }
  return segs;
}

/** 全局高亮：任何行里的「(新增)」都标红加粗 */
export const DEFAULT_RULES: HighlightRule[] = [
  { pattern: /\(新增\)/g, props: { color: "FF0000", bold: true } },
  { pattern: /（新增）/g, props: { color: "FF0000", bold: true } },
];

/**
 * 按 token 追加的高亮规则。
 *
 * 工站标题里的全角括号 = 「本工站的改動說明」。源报告 slide4 的
 * 「2.硬體設定-CCD2（替換鐳射工站）」整段是**手涂的 FF0000**，模板压成单 run 后会丢色，
 * 所以这里按同一语义把括号内容标回红色。
 * 只对 header 生效 —— 规格行里的 (新增) 由 DEFAULT_RULES 管，
 * 半角括号（DOF 的 (±14.8mm*40%=5.92mm)）不受影响。
 *
 * 影像页的两条（2026-09-29 渲染复核后补，源稿实测）：
 *   · 名称行的 `-特殊` 后缀 — 源报告 slide8 的「打光影像-破損-**特殊**」里那三个字
 *     是 FF0000 + b="1"（标题条却仍是基础缺陷名，两处不一样）。属于**结构性标记**，
 *     所以按文字自动重建，用户不必手打标记。
 *   · 说明里的自由强调 — 源报告 slide8 把「輕微 NG 無法看出」手涂成红（不加粗）、
 *     slide11 把「需要改善乘坐」涂成红加粗。自由文本没法靠规则猜，于是约定
 *     `**…**` = 红加粗（与 (新增) 同语义）；**标记本身不会印到 PPT 上**（`trim: 2`）。
 */
export const TOKEN_RULES: Record<string, HighlightRule[]> = {
  "st.header": [{ pattern: /（[^）]+）/g, props: { color: "FF0000" } }],
  "img.caption": [{ pattern: /-特殊$/, props: { color: "FF0000", bold: true } }],
  "img.desc": [{ pattern: /\*\*[^*\n]+\*\*/g, props: { color: "FF0000", bold: true }, trim: 2 }],
};

export type FillOptions = {
  rules?: HighlightRule[];
  tokenRules?: Record<string, HighlightRule[]>;
  onMissing?: (key: string) => void;
};

export type FillResult = { xml: string; used: string[] };

/** 值可以是单值，也可以是「多行」（每个元素一段） */
export type TokenValues = Record<string, string | string[] | number | undefined | null>;

/**
 * 填充一页：把「整段就是一个 {{token}}」的段落按值的行数展开成 N 段；
 * 段属性（bullet / 行距 / 字号）全部从模板继承。
 * 没值的 token **原样留着** —— 宁可在 PPT 上看见 {{xxx}}，也不要静默出一份半成品。
 */
export function fillPart(partXml: string, values: TokenValues, options: FillOptions = {}): FillResult {
  const { rules = DEFAULT_RULES, tokenRules = TOKEN_RULES, onMissing } = options;
  const used = new Set<string>();

  let out = partXml.replace(/<a:p>[\s\S]*?<\/a:p>/g, (p) => {
    const token = /^\{\{([A-Za-z0-9_.]+)\}\}$/.exec(textOf(p).trim());
    if (!token) return p;
    const key = token[1];
    const value = values[key];
    if (value === undefined || value === null) {
      onMissing?.(key);
      return p;
    }
    used.add(key);
    const lines = Array.isArray(value) ? value : [value];
    const pPr = firstTag(p, "pPr") ?? "";
    const baseRPr = firstTag(p, "rPr");
    const endTag = firstTag(p, "endParaRPr") ?? "";
    const ruleSet = [...rules, ...(tokenRules[key] ?? [])];
    return lines
      .map((line) => {
        const runs = splitRuns(String(line), baseRPr, ruleSet)
          .filter((s) => s.text.length > 0)
          .map((s) => `<a:r>${s.rPr}<a:t xml:space="preserve">${esc(s.text)}</a:t></a:r>`)
          .join("");
        return `<a:p>${pPr}${runs}${endTag}</a:p>`;
      })
      .join("");
  });

  // 模板里若有内联 token（非整段），也一并替换
  out = out.replace(/\{\{([A-Za-z0-9_.]+)\}\}/g, (m, key: string) => {
    const v = values[key];
    if (v === undefined || v === null) {
      onMissing?.(key);
      return m;
    }
    used.add(key);
    return esc(Array.isArray(v) ? v.join(" ") : String(v));
  });

  return { xml: out, used: [...used] };
}

/** 扫出一页里所有 {{token}}（门禁用来对账模板与 manifest） */
export function scanTokens(xml: string): string[] {
  return [...xml.matchAll(/\{\{([A-Za-z0-9_.]+)\}\}/g)].map((m) => m[1]);
}
