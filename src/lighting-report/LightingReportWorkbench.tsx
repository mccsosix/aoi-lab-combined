/**
 * 06 打光报告生成器 —— 主界面
 *
 * 四段式：项目信息 → 产品与需求 → 工站设定 → 预览与生成。
 * 左侧配置、右侧预览（规范 §4 的「参数配置 + 结果预览」模板）。
 *
 * 三条纪律：
 *   ① **不代填判据性内容** —— 结论、形态可检出性、费用一律不进这个表，
 *      工具只把「算得出来的」算出来，其余留空让人填。
 *   ② 设备与 03 共用同一个设备库（IndexedDB），在 03 里新增的相机/镜头这里选得到。
 *   ③ 生成前先本地校验；有漏填就**不出文件**，而不是给一份带 {{xxx}} 的半成品。
 */
import { useCallback, useId, useMemo, useRef, useState } from "react";
import cameraDefaultsJson from "../fov/data/cameras.json";
import lensDefaultsJson from "../fov/data/lenses.json";
import type { Camera, Lens } from "../fov/domain/types";
import { useDeviceLibrary } from "../fov/hooks/useDeviceLibrary";
import { indexedDbDeviceRepository } from "../fov/storage/db";
import { toTraditional } from "../lib/utils";
import { generateReport } from "./domain/generate";
import { REQUIRE_BOX, SPEC_BOX, estimateTitleBarWidthPt, overflowingLines } from "./domain/layout";
import { planPages, pageStats } from "./domain/plan";
import {
  DEFAULT_TEMPLATE_ID,
  TEMPLATE_FAMILIES,
  TEMPLATE_IDS,
  getFamily,
  type TemplateFamily,
} from "./domain/template-layout";
import {
  DEFAULT_DOF_DERATE,
  buildRequireLines,
  buildSpecLines,
  emptyImageGroup,
  emptyImagePage,
  emptyStation,
  emptyUploadedImage,
  findCamera,
  findLens,
  imageCaptionFor,
  parseDeviceSelection,
  trim,
} from "./domain/spec";
import type {
  DeviceData,
  ImageGroup,
  ImagePage,
  NewFlag,
  ReportModel,
  RequirementSpec,
  StationSpec,
  UploadedImage,
} from "./domain/types";
import { prepareImageFiles } from "./image-io";
import ImagePageEditor from "./ImagePageEditor";
import templateUrl from "./assets/template.pptx?url";
import "./lighting-report.css";

const DEFAULT_DATA = {
  cameras: cameraDefaultsJson as unknown as Camera[],
  lenses: lensDefaultsJson as unknown as Lens[],
};

const NEW_FLAG_LABELS: Array<{ flag: NewFlag; label: string }> = [
  { flag: "camera", label: "相机" },
  { flag: "lens", label: "镜头" },
  { flag: "light1", label: "光源1" },
  { flag: "light2", label: "光源2" },
  { flag: "items", label: "檢測項目" },
];

/** 源报告里出现过的检测项目，做成快捷标签省手打（繁体，报告正文口径） */
const ITEM_PRESETS = ["內徑", "外徑", "毛邊", "破損", "尺寸", "刮傷", "異色", "缺料"];

/** 源报告与其它评估报告里出现过的镜头类型（`選用…` 那句的尾巴） */
const LENS_KINDS = ["遠心鏡頭", "液態變焦鏡頭", "CCTV鏡頭", "显微鏡頭"];

/**
 * 【1.檢測需求】页的默认内容 —— 就是当前这个案子。
 * 为什么给默认值而不是空白：封面标题本来就默认填着本案名，需求页空着会像是「坏了」。
 * 用户说过需求页要能填（手打项目名称 / 公共条件，或者贴一张品保发的需求表），
 * 所以这里只放本案原文，随时可改。
 */
const DEFAULT_REQUIREMENT: RequirementSpec = {
  lines: ["密封圈內徑/厚度", "6.7±0.03"],
  image: null,
};

const stripFileName = (s: string) => s.replace(/[\\/:*?"<>|]/g, "_").slice(0, 40);

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

export default function LightingReportWorkbench({ onBack, showBackAction = true }: { onBack?: () => void; showBackAction?: boolean }) {
  const library = useDeviceLibrary(indexedDbDeviceRepository, DEFAULT_DATA);
  const devicesId = useId();

  const [templateId, setTemplateId] = useState<string>(DEFAULT_TEMPLATE_ID);
  const [projectTitle, setProjectTitle] = useState("液冷入料密封圈新增AI檢測");
  const [reportTitle, setReportTitle] = useState("評估報告");
  const [requirement, setRequirement] = useState<RequirementSpec>(DEFAULT_REQUIREMENT);
  const [stations, setStations] = useState<StationSpec[]>(() => [defaultStation(0)]);
  const [pasteText, setPasteText] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ name: string; pages: number; warnings: string[] } | null>(null);
  const [showAdvanced, setShowAdvanced] = useState<Record<string, boolean>>({});
  const resultRef = useRef<HTMLDivElement>(null);

  /** 设备库只在「可见且已加载」时才可用于选型 */
  const devices: DeviceData = useMemo(
    () => ({
      cameras: library.cameras.filter((c) => !c.hidden),
      lenses: library.lenses.filter((l) => !l.hidden),
    }),
    [library.cameras, library.lenses],
  );

  const patchStation = useCallback((index: number, patch: Partial<StationSpec>) => {
    setStations((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }, []);

  /** 当前选的模板族 —— 版式约定（影像页标题条取法、需求页内容区、有无結論页）都从这里来 */
  const family: TemplateFamily = useMemo(() => getFamily(templateId), [templateId]);

  /**
   * 逐工站预览。
   * ⚠️ 需求推导那 4 行是**逐工站**的（用户 2026-09-30 定）：相机像素/彩色/镜头类型/公差
   * 都取自本工站的型号与填写值，不再有一份全局需求。所以这里 stations 与 previews 同下标。
   */
  const previews = useMemo(
    () =>
      stations.map((s) => {
        const spec = buildSpecLines(s, devices);
        return {
          spec,
          require: buildRequireLines(s, findCamera(devices, s.cameraModel), spec.derived.mag),
        };
      }),
    [stations, devices],
  );

  /** 交给生成器的模型 —— 界面上所有预览、页数、页序都从这里算，保证「看到的 = 产出的」 */
  const model: ReportModel = useMemo(
    () => ({
      templateId,
      cover: [projectTitle.trim(), reportTitle.trim() || "評估報告"],
      requirement,
      stations,
    }),
    [templateId, projectTitle, reportTitle, requirement, stations],
  );

  /** 产物页序（与 generate.ts 同源）：封面 → 需求 → [工站 → 本站影像…] → 結論 */
  const plan = useMemo(() => planPages(model, devices, family), [model, devices, family]);
  const stats = useMemo(() => pageStats(plan, family), [plan, family]);
  const imageCount = useMemo(() => plan.reduce((n, p) => n + (p.images?.length ?? 0), 0), [plan]);
  const circleCount = useMemo(
    () => plan.reduce((n, p) => n + (p.images ?? []).reduce((m, s) => m + (s.circles?.length ?? 0), 0), 0),
    [plan],
  );

  const validation = useMemo(() => {
    const errs: string[] = [];
    if (!projectTitle.trim()) errs.push("封面标题不能为空");
    /* 需求页允许「只贴图不写字」，但不许整页空着 —— 空页在报告里等于这一节漏了 */
    if (!requirement.lines.some((l) => l.trim()) && !requirement.image) {
      errs.push("【1.檢測需求】页是空的：至少填一行文字，或贴一张需求表图");
    }
    stations.forEach((s, i) => {
      if (!s.header.trim()) errs.push(`工站 ${i + 1}：标题不能为空`);
      if (!s.cameraModel.trim()) errs.push(`工站 ${i + 1}：请选择或填写相机型号`);
      if (!s.lensModel.trim()) errs.push(`工站 ${i + 1}：请选择或填写镜头型号`);
      (s.imageGroups ?? []).forEach((g, gi) => {
        const pages = g.pages ?? [];
        // 有页才要求缺陷名：缺陷名决定标题条，空着会写出「3.打光影像-」这种半截标题
        if (pages.length && !g.defect.trim()) errs.push(`工站 ${i + 1} 影像组 ${gi + 1}：缺陷名不能为空`);
        pages.forEach((p, pi) => {
          if (!p.caption.trim()) errs.push(`工站 ${i + 1} 影像·${g.defect || gi + 1} 第 ${pi + 1} 页：名称不能为空`);
        });
      });
    });
    return errs;
  }, [projectTitle, requirement, stations]);

  const applyPaste = useCallback(
    (index: number) => {
      const parsed = parseDeviceSelection(pasteText, devices);
      if (!parsed.matched.length) return;
      const current = stations[index];
      const nextLens = parsed.lensModel ?? current.lensModel;
      patchStation(index, {
        cameraModel: parsed.cameraModel ?? current.cameraModel,
        lensModel: nextLens,
        measured: { ...current.measured, ...parsed.measured },
        marks: current.marks.mark228 === "" || current.marks.mark228 === undefined
          ? { ...current.marks, mark228: parsed.workingDistanceMm ?? "" }
          : current.marks,
      });
      setPasteText("");
    },
    [pasteText, devices, stations, patchStation],
  );

  const handleGenerate = useCallback(async () => {
    setError(null);
    setOutcome(null);
    if (validation.length) {
      setError(`先补完这些再生成：${validation.join("；")}`);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(templateUrl);
      if (!res.ok) throw new Error(`模板加载失败（HTTP ${res.status}）`);
      const template = new Uint8Array(await res.arrayBuffer());
      const out = await generateReport(template, model, devices);
      if (out.missing.length) {
        // 兜底：generateReport 说还有 token 没填上 → 不出半成品
        throw new Error(`以下内容没有填上，报告里会露出占位符，已取消下载：${out.missing.join(", ")}`);
      }
      const blob = new Blob([out.bytes as unknown as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      });
      const name = `打光評估報告_${stripFileName(projectTitle)}_${stamp()}.pptx`;      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
      setOutcome({ name, pages: out.pages, warnings: out.warnings });
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }, [validation, model, devices]);

  /* 告警一律从 plan 取 —— 它是「产物到底有哪几页」的唯一真相源，
     station 的库外镜头告警与影像页的图片告警都在里面（影像页的已自带 [页标签] 前缀） */
  const warnings = useMemo(
    () => plan.flatMap((p) => p.warnings.map((w) => (w.startsWith("[") ? w : `${p.label}：${w}`))),
    [plan],
  );

  return (
    <section className="lr-shell" aria-label="打光报告生成器">
      <div className="lr-page">
        <div className="lr-utility-bar">
          <div className="lr-brand">
            <strong>AOI LAB</strong>
            <span aria-hidden="true" />
            <b>REPORT TOOL</b>
          </div>
          <div className="header-actions">
            <span className="lr-library-state" role="status">
              {library.loading ? "设备库加载中…" : `${devices.cameras.length} 台相机 · ${devices.lenses.length} 款镜头`}
            </span>
            {showBackAction && (
              <button type="button" className="collapse-tool-button" onClick={onBack}>
                收起工具 ×
              </button>
            )}
          </div>
        </div>

        <header className="lr-header">
          <div className="lr-title-block">
            <p className="lr-eyebrow">{"// TOOL 06 / REPORT"}</p>
            <h1>打光报告生成器</h1>
            <p>填表直接产出标准格式的报告 pptx，版式与现有报告一致，产出后仍可在 WPS 里继续手改。</p>
          </div>
          <div className="lr-data-strip" role="status">
            <span>
              <b>{stations.length}</b> 个工站
            </span>
            <span>
              <b>{stats.images}</b> 页打光影像
            </span>
            <span>
              <b>{imageCount}</b> 张图 / <b>{circleCount}</b> 个圈
            </span>
            <span>
              <b>{stats.total}</b> 页
            </span>
            <span>
              <i aria-hidden="true" /> 本地生成，不上传
            </span>
          </div>
        </header>

        <div className="lr-body">
          <div className="lr-config">
            {/* 01 版式与封面 */}
            <section className="lr-section">
              <SectionHead
                index="01"
                title="版式与封面"
                hint="先选模板族（决定章节名、影像页标题条、有没有結論页），再填封面两行。报告正文是繁体，写进去什么样就是什么样。"
              />
              <TemplatePicker family={family} onPick={setTemplateId} />
              <div className="lr-grid-2">
                <Field label="第一行 · 项目名">
                  <input value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)} placeholder="例：液冷入料密封圈新增AI檢測" />
                </Field>
                <Field label="第二行 · 报告名">
                  <input value={reportTitle} onChange={(e) => setReportTitle(e.target.value)} placeholder="評估報告" />
                </Field>
              </div>
            </section>

            {/* 02 检测需求（封面之后那一页） */}
            <section className="lr-section">
              <SectionHead
                index="02"
                title="检测需求"
                hint="写在【1.檢測需求】页上 —— 也就是封面之后的第一页。可以手打项目名称 / 公共条件，也可以贴一张品保发的需求表截图。"
              />
              <RequirementFields
                requirement={requirement}
                onChange={setRequirement}
                imageBox={family.conventions.requireImageBox}
                headerText={family.conventions.requirementHeader}
              />
              <p className="lr-requirement-note">
                {family.conventions.requirementHeader} 页的标题条是固定的章节名，不上 token。
                相机像素 / 彩色 / 镜头类型不在这里 —— 它们属于工站，在【03 工站设定】里按型号识别。
              </p>
            </section>

            {/* 03 工站设定 */}
            <section className="lr-section">
              <SectionHead
                index="03"
                title="工站设定"
                hint="至少 1 个工站。相机 / 镜头取自 03 的设备库；库里没有的型号可以直接输入，按人工填报处理。本站页右上那几行「需求推导」逐站各填各的。"
              />

              <div className="lr-paste">
                <label htmlFor={`${devicesId}-paste`}>从 03 FOV 报告粘贴带入（可选）</label>
                <div className="lr-paste-row">
                  <textarea
                    id={`${devicesId}-paste`}
                    rows={2}
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder={"把 03 的报告文本整段贴进来即可，例：\nCCD：MV-CH250-90UC  Lens：DTCM110-80H-AL  fps=14.3"}
                  />
                  <button type="button" className="lr-ghost" disabled={!pasteText.trim()} onClick={() => applyPaste(0)}>
                    带入第 1 站
                  </button>
                </div>
              </div>

              <div className="lr-station-list">
                {stations.map((station, index) => (
                  <StationCard
                    key={station.id}
                    index={index}
                    station={station}
                    preview={previews[index]}
                    devices={devices}
                    devicesId={devicesId}
                    canRemove={stations.length > 1}
                    advanced={Boolean(showAdvanced[station.id])}
                    onToggleAdvanced={() => setShowAdvanced((p) => ({ ...p, [station.id]: !p[station.id] }))}
                    onPatch={(patch) => patchStation(index, patch)}
                    onPatchGroups={(groups) => patchStation(index, { imageGroups: groups })}
                    onPasteHere={() => applyPaste(index)}
                    onPasteText={pasteText}
                    onRemove={() => setStations((prev) => prev.filter((_, i) => i !== index))}
                    onMove={(delta) =>
                      setStations((prev) => {
                        const next = [...prev];
                        const to = index + delta;
                        if (to < 0 || to >= next.length) return prev;
                        [next[index], next[to]] = [next[to], next[index]];
                        return next;
                      })
                    }
                  />
                ))}
              </div>

              <button
                type="button"
                className="lr-add"
                onClick={() => setStations((prev) => [...prev, emptyStation(prev.length, family.conventions.stationHeaderPrefix)])}
              >
                ＋ 添加工站
              </button>
            </section>

            {/* 04 生成 */}
            <section className="lr-section">
              <SectionHead
                index="04"
                title="预览并生成"
                hint="确认右侧内容与页序后下载；生成出来的文件可以在 WPS 里继续手改。"
              />
              <div className="lr-actions">
                <button type="button" className="lr-primary" onClick={handleGenerate} disabled={busy || library.loading}>
                  {busy ? "正在生成…" : `生成并下载（${stats.total} 页）`}
                </button>
                {validation.length > 0 && <span className="lr-hint-inline">{validation.length} 项待补</span>}
              </div>
              {error && (
                <p className="lr-alert lr-alert-error" role="alert">
                  {error}
                </p>
              )}
              {outcome && (
                <div className="lr-alert lr-alert-ok" ref={resultRef} role="status">
                  <b>已生成 {outcome.pages} 页</b>
                  <span>文件名：{outcome.name}（在浏览器的下载目录里）</span>
                  {outcome.warnings.length > 0 && (
                    <details>
                      <summary>{outcome.warnings.length} 条提示</summary>
                      <ul>
                        {outcome.warnings.map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </section>
          </div>

          {/* 右侧预览 */}
          <aside className="lr-preview" aria-label="逐站预览">
            <div className="lr-preview-head">
              <h2>产物页序</h2>
              <p>
                {stats.total} 页 = 封面 + 需求 + {stats.stations} 个工站 + {stats.images} 页打光影像
                {family.conventions.hasConclusion ? " + 結論" : "（这一族没有結論页）"}
              </p>
            </div>
            <ol className="lr-outline">
              {plan.map((page, i) => (
                <li key={`${page.shell}-${i}`} className={`lr-outline-${outlineKind(page.shell, family)}`}>
                  <span className="lr-outline-no">{String(i + 1).padStart(2, "0")}</span>
                  <span className="lr-outline-label">{page.label}</span>
                  {page.images !== undefined && (
                    <span className={`lr-outline-badge ${page.images.length ? "" : "is-empty"}`}>
                      图 {page.images.length} · 圈 {page.images.reduce((n, s) => n + (s.circles?.length ?? 0), 0)}
                    </span>
                  )}
                </li>
              ))}
            </ol>

            <div className="lr-preview-head">
              <h2>需求页预览</h2>
              <p>这是生成后会写进【{family.conventions.requirementHeader}】页的内容。</p>
            </div>
            <article className="lr-preview-card">
              <header>
                <span className="lr-preview-no">DR</span>
                <b>{family.conventions.requirementHeader}</b>
                <em>{requirement.image ? "已贴图" : "无图"}</em>
              </header>
              {requirement.lines.filter((l) => l.trim()).length === 0 && !requirement.image ? (
                <p className="lr-preview-empty">这一页还空着 —— 填一行文字，或贴一张需求表。</p>
              ) : (
                <ul className="lr-lines">
                  {requirement.lines
                    .filter((l) => l.trim())
                    .map((line, i) => (
                      <li key={`${line}-${i}`}>{line}</li>
                    ))}
                  {requirement.image && <li className="is-image">［图］{requirement.image.name}</li>}
                </ul>
              )}
            </article>

            <div className="lr-preview-head">
              <h2>逐站预览</h2>
              <p>这是生成后会写进【{family.conventions.stationHeaderPrefix}CCD…】页的内容。</p>
            </div>
            {previews.map((p, index) => (
              <article className="lr-preview-card" key={stations[index].id}>
                <header>
                  <span className="lr-preview-no">{String(index + 1).padStart(2, "0")}</span>
                  <b>{stations[index].header || "（未填标题）"}</b>
                  <em>{estimateTitleBarWidthPt(stations[index].header || "").widthPt}pt 条宽</em>
                </header>
                <ul className="lr-lines">
                  {p.spec.lines.map((line) => (
                    <li key={line} className={overflowingLines([line], SPEC_BOX).length ? "is-over" : ""}>
                      {line}
                    </li>
                  ))}
                </ul>
                <ul className="lr-lines lr-lines-require">
                  {p.require.map((line) => (
                    <li key={line} className={overflowingLines([line], REQUIRE_BOX).length ? "is-over" : ""}>
                      {line}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
            {warnings.length > 0 && (
              <div className="lr-preview-warn">
                <b>需要人工确认</b>
                <ul>
                  {warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="lr-footnote">
              打光影像页的图片与红圈已能生成（点开每个影像页加图）；源报告里那几根红色**箭头连接符**还没做。
              【1.檢測需求】已可贴图或手打；【4.結論】是结构化四块，还没做 —— 目前要在 WPS 里手改。
            </p>
          </aside>
        </div>

        {/* 两个 datalist 共用一份，供所有工站的输入框引用 */}
        <datalist id={`${devicesId}-cameras`}>
          {devices.cameras.map((c) => (
            <option key={c.id} value={c.model}>
              {c.brand} · {c.nominalMegapixels ?? c.megapixels}M
            </option>
          ))}
        </datalist>
        <datalist id={`${devicesId}-lenses`}>
          {devices.lenses.map((l) => (
            <option key={l.id} value={l.model}>
              {l.brand} · {l.magnification ?? "—"}x
            </option>
          ))}
        </datalist>
        <datalist id={`${devicesId}-lens-kinds`}>
          {LENS_KINDS.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>
      </div>
    </section>
  );
}

/* ------------------------------ 子组件 ------------------------------ */

/**
 * 第 1 个工站的默认值：除了「本来就有依据的」以外一律留空。
 * 需求推导那几行按**当前案子**给一份可改的默认（跟封面标题默认填着本案名是一个道理）；
 * 之后新加的工站走 `emptyStation`，公差/前置行留空 —— 新工站的公差是未知的，不该替人猜。
 */
function defaultStation(index: number): StationSpec {
  return {
    ...emptyStation(index),
    marks: { mark228: "", mark100: "100", mark80: "80", mark30_100: "30-100" },
    requireLead: "最大值徑53.3mm，最大厚度6.7mm",
    toleranceMm: 0.08,
    toleranceStyle: "pm",
  };
}

function numText(v: number): string {
  return Number.isFinite(v) ? String(v) : "";
}

/** 页序里这一页属于哪一类（决定左侧色条）；判据用模板壳而不是标签文字，免得靠中文串猜 */
function outlineKind(shell: string, family: TemplateFamily): "fixed" | "station" | "img" {
  if (shell === family.layout.station) return "station";
  if (shell === family.layout.imagePlain || shell === family.layout.imageSpecial) return "img";
  return "fixed";
}

/**
 * 模板族选择器。
 * 之前「一套模板写死」的问题是：别的案子版式不一样（章节名、影像页标题条、有没有結論页都不同），
 * 换不了就得手改产物。现在族全在 `domain/template-layout.ts` 的注册表里，
 * 这里只是把注册表摊给用户看 —— 加一族不需要动这个文件。
 */
function TemplatePicker({ family, onPick }: { family: TemplateFamily; onPick: (id: string) => void }) {
  return (
    <div className="lr-template">
      <div className="lr-template-row">
        <span className="lr-field-label">模板族</span>
        <div className="lr-segmented" role="group" aria-label="模板族">
          {TEMPLATE_IDS.map((id) => (
            <button
              key={id}
              type="button"
              className={id === family.id ? "is-on" : ""}
              aria-pressed={id === family.id}
              onClick={() => onPick(id)}
            >
              {TEMPLATE_FAMILIES[id].name}
            </button>
          ))}
        </div>
      </div>
      <p className="lr-template-hint">{family.hint}</p>
    </div>
  );
}

/**
 * 【1.檢測需求】页的内容。
 *
 * 用户 2026-09-30 定的口径：**不是字段体系**。可以是
 *   ① 一行行手打的项目名称 / 公共条件（公差之类），或
 *   ② 一张品保发的需求表截图。
 * 所以这里只有一个多行文本框 + 一个选图按钮，没有「外径 / 厚度 / 相机像素」这类输入框
 * —— 那些是被用户点名搬走或删掉的。
 */
function RequirementFields({
  requirement,
  onChange,
  imageBox,
  headerText,
}: {
  requirement: RequirementSpec;
  onChange: (next: RequirementSpec) => void;
  imageBox: { xPt: number; yPt: number; wPt: number; hPt: number };
  headerText: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [errs, setErrs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const pick = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    setErrs([]);
    try {
      const { prepared, errors } = await prepareImageFiles(files);
      setErrs(errors);
      // 需求页只放一张：后选的覆盖前一张（多贴也放不下，不如让用户少一步「先删再加」）
      const first = prepared[0];
      if (first) onChange({ ...requirement, image: emptyUploadedImage(first) });
    } finally {
      setBusy(false);
    }
  };

  const image: UploadedImage | null = requirement.image ?? null;
  const boxText = `${imageBox.wPt}×${imageBox.hPt}pt 内容区`;

  return (
    <div className="lr-requirement">
      <Field label={`【${headerText}】页文字（一行一段）`}>
        <textarea
          rows={3}
          value={requirement.lines.join("\n")}
          onChange={(e) => onChange({ ...requirement, lines: e.target.value.split("\n") })}
          placeholder={"例：\n密封圈內徑/厚度\n6.7±0.03\n（也可以只贴图不写字）"}
        />
      </Field>

      <div className="lr-requirement-img">
        <div className="lr-requirement-img-head">
          <b>需求表截图（可选）</b>
          <span>等比适配到 {boxText}，居中不裁切</span>
        </div>
        {image ? (
          <div className="lr-requirement-thumb">
            <img src={image.dataUrl} alt={image.name} />
            <div>
              <code>{image.name}</code>
              <span>
                {image.pxW}×{image.pxH}px（已降采样）
              </span>
              <button type="button" className="lr-danger" onClick={() => onChange({ ...requirement, image: null })}>
                移除这张
              </button>
            </div>
          </div>
        ) : (
          <p className="lr-requirement-empty">还没有贴图 —— 不贴也行，前提是上面至少填一行字。</p>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            void pick(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <button type="button" className="lr-ghost" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? "处理中…" : image ? "换一张图" : "选择需求表图"}
        </button>
        {errs.length > 0 && (
          <ul className="lr-requirement-errs">
            {errs.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SectionHead({ index, title, hint }: { index: string; title: string; hint: string }) {
  return (
    <header className="lr-section-head">
      <span className="lr-section-no">{index}</span>
      <div>
        <h2>{title}</h2>
        <p>{hint}</p>
      </div>
    </header>
  );
}

function Field({ label, unit, children }: { label: string; unit?: string; children: React.ReactNode }) {
  return (
    <label className="lr-field">
      <span className="lr-field-label">
        {label}
        {unit && <em>{unit}</em>}
      </span>
      {children}
    </label>
  );
}

function StationCard({
  index,
  station,
  preview,
  devices,
  devicesId,
  canRemove,
  advanced,
  onToggleAdvanced,
  onPatch,
  onPatchGroups,
  onPasteHere,
  onPasteText,
  onRemove,
  onMove,
}: {
  index: number;
  station: StationSpec;
  preview: { spec: ReturnType<typeof buildSpecLines>; require: string[] };
  devices: DeviceData;
  devicesId: string;
  canRemove: boolean;
  advanced: boolean;
  onToggleAdvanced: () => void;
  onPatch: (patch: Partial<StationSpec>) => void;
  onPatchGroups: (groups: ImageGroup[]) => void;
  onPasteHere: () => void;
  onPasteText: string;
  onRemove: () => void;
  onMove: (delta: number) => void;
}) {
  const lens = findLens(devices, station.lensModel);
  /** 相机像素 / 彩色 都按型号在设备库里认（用户 2026-09-30 定：像素属于工站，不属于需求段） */
  const camera = findCamera(devices, station.cameraModel);
  const megapixels = camera ? (camera.nominalMegapixels ?? camera.megapixels ?? null) : null;
  const overrides = station.measured ?? {};
  const setOverride = (key: keyof typeof overrides, raw: string) => {
    const next = { ...overrides };
    if (raw.trim() === "") delete next[key];
    else next[key] = Number(raw);
    onPatch({ measured: next });
  };
  /** 覆盖整块需求推导：填了就完全不自动生成（源报告里有超出任何模板的写法） */
  const overrideLines = station.requireOverride ?? [];
  const hasOverride = overrideLines.some((l) => String(l ?? "").trim().length > 0);

  /* ── 打光影像段：缺陷分组 → 组内页 ────────────────────────────── */
  const groups = station.imageGroups ?? [];
  const imgPages = groups.reduce((n, g) => n + (g.pages?.length ?? 0), 0);

  const patchGroup = (gi: number, patch: Partial<ImageGroup>) =>
    onPatchGroups(groups.map((g, i) => (i === gi ? { ...g, ...patch } : g)));

  const patchPage = (gi: number, pi: number, patch: Partial<ImagePage>) =>
    patchGroup(gi, { pages: (groups[gi].pages ?? []).map((p, i) => (i === pi ? { ...p, ...patch } : p)) });

  const movePage = (gi: number, pi: number, delta: number) => {
    const pages = [...(groups[gi].pages ?? [])];
    const to = pi + delta;
    if (to < 0 || to >= pages.length) return;
    [pages[pi], pages[to]] = [pages[to], pages[pi]];
    patchGroup(gi, { pages });
  };

  /**
   * 改缺陷名：把「还是默认名」的页跟着改，改过名的页不动 ——
   * 判据是「当前名称 === 旧缺陷名的默认名」，所以不会覆盖用户手写的内容。
   */
  const renameDefect = (gi: number, defect: string) => {
    const old = groups[gi].defect;
    patchGroup(gi, {
      defect,
      pages: (groups[gi].pages ?? []).map((p) =>
        p.caption === imageCaptionFor(old, p.kind) ? { ...p, caption: imageCaptionFor(defect, p.kind) } : p,
      ),
    });
  };

  /** 切普通/特殊：同样只改「没被手改过」的名称（特殊页在源报告里带 -特殊 后缀） */
  const setKind = (gi: number, pi: number, kind: ImagePage["kind"]) => {
    const page = (groups[gi].pages ?? [])[pi];
    const follow = page.caption === imageCaptionFor(groups[gi].defect, page.kind);
    patchPage(gi, pi, follow ? { kind, caption: imageCaptionFor(groups[gi].defect, kind) } : { kind });
  };

  /** 按本站「檢測項目」批量建缺陷组（已存在的同名缺陷跳过） */
  const addGroupsFromItems = () => {
    const have = new Set(groups.map((g) => g.defect.trim()));
    const add = station.inspectionItems
      .map((it) => it.trim())
      .filter((it) => it && !have.has(it))
      .map((defect) => ({ ...emptyImageGroup(), defect }));
    if (add.length) onPatchGroups([...groups, ...add]);
  };

  return (
    <article className="lr-station">
      <header className="lr-station-head">
        <span className="lr-station-no">CCD{index + 1}</span>
        <input
          className="lr-station-title"
          aria-label={`工站 ${index + 1} 标题`}
          value={station.header}
          onChange={(e) => onPatch({ header: e.target.value })}
          placeholder="2.硬體設定-CCD1"
        />
        <div className="lr-station-tools">
          <button type="button" aria-label="把标题转成繁体" title="把标题转成繁体" onClick={() => onPatch({ header: toTraditional(station.header) })}>
            转繁体
          </button>
          <button type="button" aria-label="上移" disabled={index === 0} onClick={() => onMove(-1)}>
            ↑
          </button>
          <button type="button" aria-label="下移" onClick={() => onMove(1)}>
            ↓
          </button>
          <button type="button" className="lr-danger" aria-label="删除该工站" disabled={!canRemove} onClick={onRemove}>
            ✕
          </button>
        </div>
      </header>

      <div className="lr-grid-2">
        <Field label="相机型号">
          <input
            list={`${devicesId}-cameras`}
            value={station.cameraModel}
            onChange={(e) => onPatch({ cameraModel: e.target.value })}
            placeholder="MV-CH250-90UC"
          />
        </Field>
        <Field label="镜头型号">
          <input
            list={`${devicesId}-lenses`}
            value={station.lensModel}
            onChange={(e) => {
              const value = e.target.value;
              const hit = findLens(devices, value);
              const marks = station.marks.mark228 === "" || station.marks.mark228 === undefined
                ? { ...station.marks, mark228: hit?.workingDistanceMm ?? "" }
                : station.marks;
              onPatch({ lensModel: value, marks });
            }}
            placeholder="DTCM110-80H-AL"
          />
        </Field>
        <Field label="光源 1">
          <input value={station.lightSource1} onChange={(e) => onPatch({ lightSource1: e.target.value })} placeholder="LT-24V-120RT15-W" />
        </Field>
        <Field label="光源 2">
          <input value={station.lightSource2} onChange={(e) => onPatch({ lightSource2: e.target.value })} placeholder="LT-24V-91PF91-W" />
        </Field>
      </div>

      <Field label="檢測項目（逗号分隔）">
        <input
          value={station.inspectionItems.join(",")}
          onChange={(e) => onPatch({ inspectionItems: e.target.value.split(/[,，、\s]+/).filter(Boolean) })}
          placeholder="內徑,外徑,毛邊,破損"
        />
      </Field>
      <div className="lr-chips">
        {ITEM_PRESETS.map((item) => {
          const on = station.inspectionItems.includes(item);
          return (
            <button
              key={item}
              type="button"
              className={on ? "is-on" : ""}
              aria-pressed={on}
              onClick={() =>
                onPatch({
                  inspectionItems: on
                    ? station.inspectionItems.filter((x) => x !== item)
                    : [...station.inspectionItems, item],
                })
              }
            >
              {item}
            </button>
          );
        })}
      </div>

      <fieldset className="lr-flags">
        <legend>这些是本次新增（会标红）</legend>
        {NEW_FLAG_LABELS.map(({ flag, label }) => {
          const on = station.newFlags.includes(flag);
          return (
            <label key={flag} className={on ? "is-on" : ""}>
              <input
                type="checkbox"
                checked={on}
                onChange={() =>
                  onPatch({
                    newFlags: on ? station.newFlags.filter((f) => f !== flag) : [...station.newFlags, flag],
                  })
                }
              />
              {label}
            </label>
          );
        })}
      </fieldset>

      {/* 需求推导（本站页右上那块）——用户 2026-09-30 定：逐工站各填各的，不是全报告一份 */}
      <div className="lr-require-block">
        <div className="lr-require-head">
          <b>需求推导（本站）</b>
          <span>
            相机{" "}
            {camera ? (
              <>
                <b>{megapixels ?? "—"}M</b> · 库值识别自 {camera.model}
              </>
            ) : (
              <>{station.cameraModel ? "型号不在库，像素留空" : "先填相机型号"}</>
            )}
          </span>
        </div>

        {hasOverride ? (
          <Field label="整块覆盖（一行一段，填了就完全不自动生成）">
            <textarea
              rows={4}
              value={overrideLines.join("\n")}
              onChange={(e) => onPatch({ requireOverride: e.target.value.split("\n") })}
            />
          </Field>
        ) : (
          <div className="lr-grid-2">
            <Field label="前置行（自由文本，可留空）">
              <input
                value={station.requireLead ?? ""}
                onChange={(e) => onPatch({ requireLead: e.target.value })}
                placeholder="例：最大值徑53.3mm，最大厚度6.7mm"
              />
            </Field>
            <Field label="最小公差" unit="mm（留空 = 不生成公差与解析度行）">
              <div className="lr-tol-row">
                <input
                  type="number"
                  step="0.01"
                  value={station.toleranceMm === null || station.toleranceMm === undefined ? "" : String(station.toleranceMm)}
                  onChange={(e) => onPatch({ toleranceMm: e.target.value.trim() === "" ? null : Number(e.target.value) })}
                />
                <div className="lr-segmented lr-segmented-sm" role="group" aria-label="公差写法">
                  <button
                    type="button"
                    className={(station.toleranceStyle ?? "pm") === "pm" ? "is-on" : ""}
                    title="最小公差±0.08mm，公差帶=0.16"
                    onClick={() => onPatch({ toleranceStyle: "pm" })}
                  >
                    ±值
                  </button>
                  <button
                    type="button"
                    className={station.toleranceStyle === "band" ? "is-on" : ""}
                    title="最小公差帶 0.1mm"
                    onClick={() => onPatch({ toleranceStyle: "band" })}
                  >
                    公差帶
                  </button>
                </div>
              </div>
            </Field>
            <Field label="检测说明（可选，接在公差行后 / 无公差时单独成行）">
              <input
                value={station.inspectNote ?? ""}
                onChange={(e) => onPatch({ inspectNote: e.target.value })}
                placeholder="例：一次檢測1pcs，伺服控制相機左右移動拍兩次"
              />
            </Field>
            <Field label="镜头类型">
              <input
                list={`${devicesId}-lens-kinds`}
                value={station.lensKind ?? ""}
                onChange={(e) => onPatch({ lensKind: e.target.value })}
                placeholder="遠心鏡頭"
              />
            </Field>
            <Field label="相机色彩（写进「選用…」那句）">
              <div className="lr-segmented" role="group" aria-label="相机色彩">
                <button type="button" className={station.colorCamera !== false ? "is-on" : ""} onClick={() => onPatch({ colorCamera: true })}>
                  彩色
                </button>
                <button type="button" className={station.colorCamera === false ? "is-on" : ""} onClick={() => onPatch({ colorCamera: false })}>
                  黑白
                </button>
              </div>
            </Field>
          </div>
        )}

        <div className="lr-derived">
          {preview.require.length === 0 ? (
            <span className="lr-derived-empty">本站没有填出任何行 —— 填公差或前置行，或在高级里整块覆盖。</span>
          ) : (
            preview.require.map((line, i) => (
              <code key={`${line}-${i}`}>{line}</code>
            ))
          )}
        </div>
        <button
          type="button"
          className="lr-ghost lr-require-toggle"
          onClick={() => onPatch({ requireOverride: hasOverride ? [] : [preview.require[0] ?? ""] })}
        >
          {hasOverride ? "改回自动生成" : "整块覆盖（写法超出模板时用）"}
        </button>
      </div>

      <div className="lr-inline-row">
        <button type="button" className="lr-ghost" disabled={!onPasteText.trim()} onClick={onPasteHere}>
          把粘贴内容带入本站
        </button>
        <button type="button" className="lr-ghost" onClick={onToggleAdvanced}>
          {advanced ? "收起高级" : "高级：光路图标注 / 人工覆盖"}
        </button>
        {lens && <span className="lr-chip-info">库值：{trim(lens.magnification, 4)}x · DOF {trim(lens.depthOfFieldMm, 1)}mm · WD {trim(lens.workingDistanceMm, 1)}mm</span>}
      </div>

      {advanced && (
        <div className="lr-advanced">
          <div className="lr-grid-4">
            <Field label="标注 228（工作距离）">
              <input value={String(station.marks.mark228 ?? "")} onChange={(e) => onPatch({ marks: { ...station.marks, mark228: e.target.value } })} />
            </Field>
            <Field label="标注 100">
              <input value={String(station.marks.mark100 ?? "")} onChange={(e) => onPatch({ marks: { ...station.marks, mark100: e.target.value } })} />
            </Field>
            <Field label="标注 80">
              <input value={String(station.marks.mark80 ?? "")} onChange={(e) => onPatch({ marks: { ...station.marks, mark80: e.target.value } })} />
            </Field>
            <Field label="标注 30-100">
              <input value={String(station.marks.mark30_100 ?? "")} onChange={(e) => onPatch({ marks: { ...station.marks, mark30_100: e.target.value } })} />
            </Field>
          </div>
          <div className="lr-grid-4">
            <Field label="DOF 折减">
              <input
                type="number"
                step="0.05"
                value={numText(station.dofDerateFactor ?? DEFAULT_DOF_DERATE)}
                onChange={(e) => onPatch({ dofDerateFactor: Number(e.target.value) })}
              />
            </Field>
            <Field label="fps 覆盖">
              <input type="number" step="0.1" value={numText(overrides.fps ?? NaN)} onChange={(e) => setOverride("fps", e.target.value)} placeholder="留空用库值" />
            </Field>
            <Field label="倍率覆盖">
              <input type="number" step="0.001" value={numText(overrides.magnification ?? NaN)} onChange={(e) => setOverride("magnification", e.target.value)} placeholder="库外镜头必填" />
            </Field>
            <Field label="Lens Resolution 覆盖">
              <input type="number" step="0.0001" value={numText(overrides.lensResolutionMmPerPixel ?? NaN)} onChange={(e) => setOverride("lensResolutionMmPerPixel", e.target.value)} />
            </Field>
          </div>
          <p className="lr-advanced-note">
            源报告里有三处库值与报告值不一致（fps 14 vs 14.3、Lens Resolution 0.0178 vs 0.02、CCD2 镜头不在库）。
            填了覆盖值就会按报告值走，并在预览里留痕。
          </p>
        </div>
      )}

      {/* 打光影像段：紧跟在【2.硬體設定】页后面 */}
      <div className="lr-images">
        <div className="lr-images-head">
          <b>打光影像</b>
          <span>
            本站 {imgPages} 页{groups.length > 0 && ` · ${groups.length} 个缺陷组`}
          </span>
          <button
            type="button"
            className="lr-ghost"
            disabled={!station.inspectionItems.length}
            title={station.inspectionItems.length ? "按上面的檢測項目建缺陷组" : "先在上面填檢測項目"}
            onClick={addGroupsFromItems}
          >
            按檢測項目建组
          </button>
        </div>
        <p className="lr-images-note">
          排在【{station.header || "本站"}】之后。一个缺陷一组，组内一页 = 报告里的一张影像页；
          名称与说明写进页骨架，「普通 / 特殊」决定用哪种版式，每页的图片与红圈在页卡里加。
        </p>

        {groups.map((group, gi) => {
          const pages = group.pages ?? [];
          return (
            <div className="lr-img-group" key={group.id}>
              <div className="lr-img-group-head">
                <label className="lr-img-defect">
                  <span>缺陷名</span>
                  <input value={group.defect} onChange={(e) => renameDefect(gi, e.target.value)} placeholder="破損" />
                </label>
                <code className="lr-img-bar">{group.defect.trim() ? `3.打光影像-${group.defect.trim()}` : "3.打光影像-（待填）"}</code>
                <div className="lr-img-group-tools">
                  <button type="button" onClick={() => patchGroup(gi, { pages: [...pages, emptyImagePage(group.defect, "plain")] })}>
                    ＋ 页
                  </button>
                  <button type="button" className="lr-danger" onClick={() => onPatchGroups(groups.filter((_, i) => i !== gi))}>
                    ✕ 组
                  </button>
                </div>
              </div>

              {pages.length === 0 ? (
                <p className="lr-img-empty">这一组还没有页 —— 点「＋ 页」加一张。</p>
              ) : (
                <ol className="lr-img-pages">
                  {pages.map((page, pi) => (
                    <li className="lr-img-page" key={page.id}>
                      <div className="lr-img-page-row">
                        <span className="lr-img-page-no">P{pi + 1}</span>
                        <div className="lr-segmented lr-segmented-sm" role="group" aria-label={`第 ${pi + 1} 页版式`}>
                          <button type="button" className={page.kind === "plain" ? "is-on" : ""} onClick={() => setKind(gi, pi, "plain")}>
                            普通
                          </button>
                          <button type="button" className={page.kind === "special" ? "is-on" : ""} onClick={() => setKind(gi, pi, "special")}>
                            特殊
                          </button>
                        </div>
                        <input
                          className="lr-img-caption"
                          aria-label={`第 ${pi + 1} 页名称`}
                          value={page.caption}
                          onChange={(e) => patchPage(gi, pi, { caption: e.target.value })}
                          placeholder="打光影像-破損"
                        />
                        <div className="lr-img-page-tools">
                          <button type="button" aria-label="该页上移" disabled={pi === 0} onClick={() => movePage(gi, pi, -1)}>
                            ↑
                          </button>
                          <button type="button" aria-label="该页下移" disabled={pi === pages.length - 1} onClick={() => movePage(gi, pi, 1)}>
                            ↓
                          </button>
                          <button
                            type="button"
                            className="lr-danger"
                            aria-label="删除该页"
                            onClick={() => patchGroup(gi, { pages: pages.filter((_, i) => i !== pi) })}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                      <textarea
                        className="lr-img-desc"
                        rows={2}
                        value={(page.desc ?? []).join("\n")}
                        onChange={(e) => patchPage(gi, pi, { desc: e.target.value.split("\n") })}
                        placeholder="说明（一行一段；留空则这一页不写说明）"
                      />
                      <span className="lr-img-special-hint">
                        说明里用 <b>**文字**</b> 表示红字加粗（与源报告一致，星号本身不会印到 PPT）
                        {page.kind === "special" && "；特殊页：单张大图 + ↓"}
                      </span>

                      {/* 图片与红圈：与上面的「名称 / 说明」同属这一页，所以放在页卡内部 */}
                      <ImagePageEditor page={page} onChange={(patch) => patchPage(gi, pi, patch)} />
                    </li>
                  ))}
                </ol>
              )}
            </div>
          );
        })}

        <button type="button" className="lr-add lr-add-sm" onClick={() => onPatchGroups([...groups, emptyImageGroup()])}>
          ＋ 添加缺陷组
        </button>
      </div>
    </article>
  );
}
