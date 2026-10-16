/**
 * 06 打光报告生成器 —— 单张影像页的「图片 + 红圈」编辑器
 *
 * 界面分上下两块，各管一件事：
 *   · 上面是**页面画布**（4:3，与 pptx 同比例）—— 只管空间：拖图、画圈、看红圈落哪儿；
 *   · 下面是**图片清单** —— 只管操作：加图、删图、清圈、看降采样后的尺寸。
 * 不把两者混在一起，是因为画布上的小按钮必然小于 44×44（子页面规范 §6），
 * 而清单里的按钮能达到；而且键盘用户也该有一条不依赖拖拽的路径。
 *
 * 坐标一律用 pt（720×540 的页面），画布上的百分比只是显示 —— 这样「界面里看到的」
 * 与「写进 pptx 的」是同一个数，不存在两套换算。
 *
 * 交互口径（与用户 2026-09-29 定的「自动摆放 + 可拖拽微调」一致）：
 *   默认自动摆放；**拖过任何一张图，整页切成手动并把当前所有位置固化**（否则后面的图会跳）；
 *   点「重新自动摆放」回到自动。新加的图在手动页里回落到自动格位，并给一行提示。
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  MAX_IMAGES_PER_PAGE,
  SLIDE_H_PT,
  SLIDE_W_PT,
  circleFromDrag,
  clampBoxToPage,
  emptyCircleMark,
  resolveSlotBoxes,
} from "./domain/canvas";
import { emptyImageSlot, imageCaptionLines } from "./domain/spec";
import type { Box, ImagePage } from "./domain/types";
import { prepareImageFiles } from "./image-io";

const pct = (v: number, total: number): string => `${(v / total) * 100}%`;

/**
 * 名称/说明里的「会标红的写法」——**与 domain/xml.ts 的 TOKEN_RULES 同一个口径**，
 * 所以画布上看到的就是导出后得到的（预览与产物同源，不各写一套）。
 *   · `**…**` → 红加粗（标记本身不显示）
 *   · 结尾的 `-特殊` → 红加粗（源报告 slide8/slide11 的实测色）
 */
function markInline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let n = 0;
  const pushPlain = (t: string) => {
    if (!t) return;
    if (t.endsWith("-特殊") && t.length > 3) {
      out.push(<span key={`${key}-a${n++}`}>{t.slice(0, -3)}</span>);
      out.push(<em key={`${key}-b${n++}`} className="lr-hl">-特殊</em>);
    } else if (t === "-特殊") {
      out.push(<em key={`${key}-b${n++}`} className="lr-hl">-特殊</em>);
    } else {
      out.push(<span key={`${key}-a${n++}`}>{t}</span>);
    }
  };
  const re = /\*\*([^*\n]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    pushPlain(text.slice(last, m.index));
    out.push(<em key={`${key}-h${n++}`} className="lr-hl">{m[1]}</em>);
    last = m.index + m[0].length;
  }
  pushPlain(text.slice(last));
  return out;
}

/** 画布上的拖拽状态。放 ref 里（不放 state）：拖动过程中每帧都要读它，用 state 会掉帧且容易读到旧值 */
type Drag =
  | { kind: "slot"; index: number; grabX: number; grabY: number }
  | { kind: "circle"; index: number; markId: string; grabX: number; grabY: number }
  | { kind: "draw"; index: number; sx: number; sy: number; x: number; y: number }
  | null;

export default function ImagePageEditor({
  page,
  onChange,
}: {
  page: ImagePage;
  onChange: (patch: Partial<ImagePage>) => void;
}) {
  const slots = useMemo(() => page.slots ?? [], [page.slots]);
  const autoLayout = page.autoLayout !== false;
  const captionLines = imageCaptionLines(page);
  const { boxes, box, warning } = useMemo(
    () => resolveSlotBoxes(slots, page.kind, captionLines, autoLayout),
    [slots, page.kind, captionLines, autoLayout],
  );
  /** 名称/说明在画布上的示意框宽度：两种壳不一样（模板实测），其余都按同一条几何 */
  const captionWidth = page.kind === "special" ? 577.9 : 527.4;

  const [mode, setMode] = useState<"move" | "circle">("move");
  const [draft, setDraft] = useState<{ index: number; box: Box } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<Drag>(null);

  /* 拖动/画圈的 window 监听只注册一次，读的都是 ref 里的最新值 ——
     如果挂到 state 上，每帧 commit 都会重建监听器，拖动会断。 */
  const latest = useRef({ slots, boxes, onChange });
  latest.current = { slots, boxes, onChange };

  const toPagePt = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return { x: 0, y: 0 };
    return {
      x: ((clientX - rect.left) / rect.width) * SLIDE_W_PT,
      y: ((clientY - rect.top) / rect.height) * SLIDE_H_PT,
    };
  }, []);

  /** 拖图：整页切手动，并把「还没手动过的图」按当前自动位固化，避免松手后其它图跳动 */
  const pin = useCallback((index: number, next: Box) => {
    const { slots: cur, boxes: curBoxes, onChange: emit } = latest.current;
    emit({
      slots: cur.map((s, j) => ({ ...s, box: j === index ? next : (s.box ?? curBoxes[j]) })),
      autoLayout: false,
    });
  }, []);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const p = toPagePt(e.clientX, e.clientY);

      if (d.kind === "slot") {
        const b = latest.current.boxes[d.index];
        if (!b) return;
        pin(d.index, clampBoxToPage({ ...b, xPt: p.x - d.grabX, yPt: p.y - d.grabY }, b.wPt, b.hPt));
        return;
      }
      if (d.kind === "circle") {
        const b = latest.current.boxes[d.index];
        if (!b || b.wPt === 0 || b.hPt === 0) return;
        const nx = Math.min(1, Math.max(0, (p.x - d.grabX - b.xPt) / b.wPt));
        const ny = Math.min(1, Math.max(0, (p.y - d.grabY - b.yPt) / b.hPt));
        latest.current.onChange({
          slots: latest.current.slots.map((s, j) =>
            j === d.index
              ? { ...s, circles: s.circles.map((m) => (m.id === d.markId ? { ...m, x: nx, y: ny } : m)) }
              : s,
          ),
        });
        return;
      }
      if (d.kind === "draw") {
        d.x = p.x;
        d.y = p.y;
        const b = latest.current.boxes[d.index];
        if (!b || b.wPt === 0 || b.hPt === 0) return;
        const nx = (a: number, o: number, len: number) => Math.min(1, Math.max(0, (a - o) / len));
        const x1 = nx(d.sx, b.xPt, b.wPt);
        const y1 = nx(d.sy, b.yPt, b.hPt);
        const x2 = nx(d.x, b.xPt, b.wPt);
        const y2 = nx(d.y, b.yPt, b.hPt);
        setDraft({ index: d.index, box: { xPt: Math.min(x1, x2), yPt: Math.min(y1, y2), wPt: Math.abs(x1 - x2), hPt: Math.abs(y1 - y2) } });
      }
    };

    const up = () => {
      const d = dragRef.current;
      dragRef.current = null;
      if (d?.kind === "draw") {
        const b = latest.current.boxes[d.index];
        setDraft(null);
        if (!b || b.wPt === 0 || b.hPt === 0) return;
        const norm = (a: number, o: number, len: number) => (a - o) / len;
        const made = circleFromDrag(
          { x: norm(d.sx, b.xPt, b.wPt), y: norm(d.sy, b.yPt, b.hPt) },
          { x: norm(d.x, b.xPt, b.wPt), y: norm(d.y, b.yPt, b.hPt) },
        );
        if (!made) return; // 拖得太小 = 误触，不当成画圈
        latest.current.onChange({
          slots: latest.current.slots.map((s, j) =>
            j === d.index ? { ...s, circles: [...s.circles, emptyCircleMark(made.x, made.y, made.w, made.h)] } : s,
          ),
        });
      }
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [pin, toPagePt]);

  const addFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      setError(null);
      setBusy(true);
      try {
        const { prepared, errors } = await prepareImageFiles(files);
        const room = MAX_IMAGES_PER_PAGE - slots.length;
        const take = prepared.slice(0, Math.max(0, room));
        const dropped = prepared.length - take.length;
        if (take.length) {
          latest.current.onChange({
            slots: [...latest.current.slots, ...take.map((p) => emptyImageSlot(p))],
          });
        }
        const notes = [...errors];
        if (dropped > 0) notes.push(`单页上限 ${MAX_IMAGES_PER_PAGE} 张，多余的 ${dropped} 张没加进来 —— 请另开一页`);
        setError(notes.length ? notes.join("；") : null);
      } finally {
        setBusy(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [slots.length],
  );

  const removeSlot = (index: number) => onChange({ slots: slots.filter((_, i) => i !== index) });

  const clearCircles = (index: number) =>
    onChange({ slots: slots.map((s, i) => (i === index ? { ...s, circles: [] } : s)) });

  const resetAuto = () => onChange({ slots: slots.map((s) => ({ ...s, box: undefined })), autoLayout: true });

  const pinnedCount = slots.filter((s) => s.box).length;

  return (
    <div className="lr-img-media">
      {/* ── 页面画布 ── */}
      <div className="lr-canvas-bar">
        <div className="lr-segmented lr-segmented-sm" role="group" aria-label="画布操作模式">
          <button type="button" className={mode === "move" ? "is-on" : ""} aria-pressed={mode === "move"} onClick={() => setMode("move")}>
            拖动图片
          </button>
          <button
            type="button"
            className={mode === "circle" ? "is-on" : ""}
            aria-pressed={mode === "circle"}
            disabled={!slots.length}
            title={slots.length ? "在有图的地方按下并拖出一个框，就是红圈" : "先加图"}
            onClick={() => setMode("circle")}
          >
            画红圈
          </button>
        </div>
        <span className="lr-canvas-mode">
          {mode === "move" ? "拖动图片调位置（拖过之后本页转为手动摆放）" : "在有图的地方按住拖出一个框 → 生成红圈；拖已有的圈可微调"}
        </span>
        <span className={`lr-canvas-state ${autoLayout ? "is-auto" : "is-manual"}`}>
          {autoLayout ? "自动摆放" : `手动摆放${pinnedCount ? ` · ${pinnedCount} 张已固定` : ""}`}
        </span>
      </div>

      <div className="lr-canvas" ref={canvasRef}>
        {/* 名称/说明示意（不可交互，只为了让用户知道图能占到哪儿） */}
        <div
          className="lr-canvas-caption"
          style={{ left: pct(19.8, SLIDE_W_PT), top: pct(45.13, SLIDE_H_PT), width: pct(captionWidth, SLIDE_W_PT) }}
        >
          <b>{page.caption ? markInline(page.caption, "cap") : "（名称待填）"}</b>
          {(page.desc ?? []).filter((l) => l.trim()).map((l, i) => (
            <span key={i}>{markInline(l, `d${i}`)}</span>
          ))}
        </div>

        {/* 图片可用区提示 */}
        <div
          className="lr-canvas-area"
          style={{ left: pct(box.xPt, SLIDE_W_PT), top: pct(box.yPt, SLIDE_H_PT), width: pct(box.wPt, SLIDE_W_PT), height: pct(box.hPt, SLIDE_H_PT) }}
        />

        {slots.map((slot, i) => {
          const b = boxes[i];
          if (!b) return null;
          return (
            <div
              key={slot.id}
              className={`lr-canvas-pic ${slot.box ? "is-pinned" : ""} ${mode === "circle" ? "is-draw" : ""}`}
              style={{ left: pct(b.xPt, SLIDE_W_PT), top: pct(b.yPt, SLIDE_H_PT), width: pct(b.wPt, SLIDE_W_PT), height: pct(b.hPt, SLIDE_H_PT) }}
              title={`${slot.name}　${Math.round(b.wPt)}×${Math.round(b.hPt)}pt`}
              onPointerDown={(e) => {
                e.preventDefault();
                const p = toPagePt(e.clientX, e.clientY);
                if (mode === "circle") {
                  dragRef.current = { kind: "draw", index: i, sx: p.x, sy: p.y, x: p.x, y: p.y };
                  setDraft({ index: i, box: { xPt: 0, yPt: 0, wPt: 0, hPt: 0 } });
                } else {
                  dragRef.current = { kind: "slot", index: i, grabX: p.x - b.xPt, grabY: p.y - b.yPt };
                }
              }}
            >
              <img src={slot.dataUrl} alt={slot.name} draggable={false} />
              {slot.circles.map((m) => (
                <span
                  key={m.id}
                  className="lr-canvas-circle"
                  style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, width: `${m.w * 100}%`, height: `${m.h * 100}%` }}
                  onPointerDown={(e) => {
                    if (mode !== "circle") return;
                    e.preventDefault();
                    e.stopPropagation();
                    const p = toPagePt(e.clientX, e.clientY);
                    dragRef.current = { kind: "circle", index: i, markId: m.id, grabX: p.x - (b.xPt + m.x * b.wPt), grabY: p.y - (b.yPt + m.y * b.hPt) };
                  }}
                />
              ))}
            </div>
          );
        })}

        {draft && boxes[draft.index] && (
          <span
            className="lr-canvas-draft"
            style={{
              left: `${((boxes[draft.index].xPt + draft.box.xPt * boxes[draft.index].wPt) / SLIDE_W_PT) * 100}%`,
              top: `${((boxes[draft.index].yPt + draft.box.yPt * boxes[draft.index].hPt) / SLIDE_H_PT) * 100}%`,
              width: `${draft.box.wPt * 100}%`,
              height: `${draft.box.hPt * 100}%`,
            }}
          />
        )}

        {!slots.length && (
          <p className="lr-canvas-empty">
            这一页还没有图片。
            <br />
            点下面的「＋ 加图片」选图（可多选）；加进来会按自动摆放铺好，再拖到你想要的位置。
          </p>
        )}
      </div>

      {warning && <p className="lr-alert lr-alert-warn">{warning}</p>}

      {/* ── 图片清单 ── */}
      <div className="lr-slot-tools">
        <label className={`lr-file-btn ${busy ? "is-busy" : ""}`}>
          {busy ? "正在处理图片…" : "＋ 加图片"}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            disabled={busy}
            onChange={(e) => void addFiles(Array.from(e.target.files ?? []))}
          />
        </label>
        <button
          type="button"
          className="lr-ghost"
          disabled={autoLayout && !pinnedCount}
          title="把所有图按自动网格重新铺一遍"
          onClick={resetAuto}
        >
          重新自动摆放
        </button>
        <span className="lr-slot-count">
          {slots.length} 张 · 上限 {MAX_IMAGES_PER_PAGE}
        </span>
      </div>

      {!autoLayout && (
        <p className="lr-images-note">
          本页已转手动摆放：后加进来的图会落在自动格位上，可能和已固定的图重叠 ——
          点「重新自动摆放」可全部重排。
        </p>
      )}

      {slots.length > 0 && (
        <ul className="lr-slot-list">
          {slots.map((slot, i) => (
            <li key={slot.id} className="lr-slot">
              <img className="lr-slot-thumb" src={slot.dataUrl} alt="" />
              <span className="lr-slot-name" title={slot.name}>
                {slot.name || `图片 ${i + 1}`}
              </span>
              <span className="lr-slot-meta">
                {slot.pxW}×{slot.pxH}px
                {boxes[i] ? ` · ${Math.round(boxes[i].wPt)}×${Math.round(boxes[i].hPt)}pt` : ""}
              </span>
              <span className={`lr-slot-tag ${slot.box ? "is-pinned" : ""}`}>{slot.box ? "已固定" : "自动"}</span>
              <span className="lr-slot-circles">圈 {slot.circles.length}</span>
              <div className="lr-slot-actions">
                <button type="button" disabled={!slot.circles.length} onClick={() => clearCircles(i)}>
                  清空圈
                </button>
                <button type="button" className="lr-danger" onClick={() => removeSlot(i)}>
                  删图
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {mode === "circle" && !slots.length && <p className="lr-images-note">「画红圈」要等这一页有图片之后才能用。</p>}
      {error && (
        <p className="lr-alert lr-alert-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
