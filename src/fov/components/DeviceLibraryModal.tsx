"use client";

import { useMemo, useState } from "react";
import type { Camera, Lens } from "../domain/types";
import { Modal } from "./Modal";

type Props = {
  open: boolean; onClose: () => void; cameras: Camera[]; lenses: Lens[];
  onSaveCamera: (item: Camera) => Promise<void>; onSaveLens: (item: Lens) => Promise<void>;
  onRemove: (kind: "camera" | "lens", item: Camera | Lens) => Promise<void>; onReset: () => Promise<void>;
};
type EditState = { kind: "camera"; item: Camera } | { kind: "lens"; item: Lens } | null;
const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}-user-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;

function blankCamera(): Camera { return { id: id("camera"), brand: "", series: "", model: "", enabled: true, hidden: false, resolutionWidthPx: 0, resolutionHeightPx: 0, sensorWidthMm: 0, sensorHeightMm: 0, sensorDiagonalMm: 0, lensMount: null, megapixels: 0, nominalMegapixels: null, sensorFormat: null, fps: null, pixelSizeXUm: null, pixelSizeYUm: null, sensorModel: null, dataInterface: null, shutterType: null, productUrl: null, source: "user", customized: true, updatedAt: now() }; }
function blankLens(): Lens { return { id: id("lens"), brand: "", series: "", model: "", lensType: "物方远心", enabled: true, hidden: false, magnification: 0, magnificationMin: null, magnificationMax: null, nominalMagnification: null, mount: null, maxSensorDiagonalMm: null, workingDistanceMm: null, depthOfFieldMm: null, depthOfFieldSymmetric: false, depthOfFieldAperture: null, aperture: null, sensorFormat: null, imageMtfLpMmMin: null, recommendationStatus: "manual-review", sourceFiles: [], notes: [], source: "user", customized: true, updatedAt: now() }; }

export function DeviceLibraryModal(props: Props) {
  const [kind, setKind] = useState<"camera" | "lens">("camera");
  const [query, setQuery] = useState("");
  const [edit, setEdit] = useState<EditState>(null);
  const [error, setError] = useState<string | null>(null);
  const records = useMemo(() => (kind === "camera" ? props.cameras : props.lenses).filter((item) => !item.hidden && `${item.brand} ${item.model}`.toLowerCase().includes(query.toLowerCase())).slice(0, 120), [kind, props.cameras, props.lenses, query]);

  const save = async () => {
    if (!edit) return;
    if (!edit.item.brand.trim() || !edit.item.model.trim()) { setError("品牌和型号不能为空"); return; }
    if (edit.kind === "camera") {
      const item = edit.item;
      if ([item.resolutionWidthPx, item.resolutionHeightPx, item.sensorWidthMm, item.sensorHeightMm].some((value) => value <= 0)) { setError("分辨率和传感器宽高必须大于 0"); return; }
      const diagonal = item.sensorDiagonalMm > 0 ? item.sensorDiagonalMm : Math.hypot(item.sensorWidthMm, item.sensorHeightMm);
      await props.onSaveCamera({ ...item, sensorDiagonalMm: diagonal, megapixels: item.megapixels || item.resolutionWidthPx * item.resolutionHeightPx / 1_000_000 });
    } else {
      if (!edit.item.magnification || edit.item.magnification <= 0) { setError("倍率必须大于 0"); return; }
      const verified = Boolean(edit.item.mount && edit.item.maxSensorDiagonalMm);
      await props.onSaveLens({ ...edit.item, recommendationStatus: verified ? "verified" : "manual-review" });
    }
    setEdit(null); setError(null);
  };

  return (
    <Modal open={props.open} title="设备资料库" onClose={props.onClose} wide>
      <div className="library-toolbar">
        <div className="segmented" aria-label="设备类型">
          <button type="button" aria-pressed={kind === "camera"} onClick={() => { setKind("camera"); setEdit(null); }}>相机（{props.cameras.filter((item) => !item.hidden).length}）</button>
          <button type="button" aria-pressed={kind === "lens"} onClick={() => { setKind("lens"); setEdit(null); }}>镜头（{props.lenses.filter((item) => !item.hidden).length}）</button>
        </div>
        <input aria-label="搜索设备" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索品牌或型号" />
        <button className="primary-button" type="button" onClick={() => setEdit(kind === "camera" ? { kind, item: blankCamera() } : { kind, item: blankLens() })}>新增{kind === "camera" ? "相机" : "镜头"}</button>
      </div>
      {edit ? (
        <div className="device-editor">
          <h3>{edit.item.source === "user" ? "新增 / 编辑现场资料" : "编辑内置资料"}</h3>
          <div className="form-grid">
            <label>品牌<input value={edit.item.brand} onChange={(event) => setEdit({ ...edit, item: { ...edit.item, brand: event.target.value } } as EditState)} /></label>
            <label>型号<input value={edit.item.model} onChange={(event) => setEdit({ ...edit, item: { ...edit.item, model: event.target.value } } as EditState)} /></label>
            {edit.kind === "camera" ? <CameraFields item={edit.item} onChange={(item) => setEdit({ kind: "camera", item })} /> : <LensFields item={edit.item} onChange={(item) => setEdit({ kind: "lens", item })} />}
          </div>
          {error && <p className="field-error" role="alert">{error}</p>}
          <div className="modal-actions"><button type="button" onClick={() => { setEdit(null); setError(null); }}>取消</button><button className="primary-button" type="button" onClick={save}>保存设备</button></div>
        </div>
      ) : (
        <div className="device-list" role="list">
          {records.map((record) => <article key={record.id} role="listitem">
            <div><span>{record.brand}</span><strong>{record.model}</strong><small>{record.source === "default" ? "内置资料" : "现场新增"} · {record.enabled ? "启用" : "停用"}</small></div>
            <div className="row-actions">
              <button type="button" onClick={() => setEdit({ kind, item: record } as EditState)}>编辑</button>
              <button type="button" onClick={async () => kind === "camera" ? props.onSaveCamera({ ...(record as Camera), id: id("camera"), model: `${record.model} - 副本`, source: "user" }) : props.onSaveLens({ ...(record as Lens), id: id("lens"), model: `${record.model} - 副本`, source: "user" })}>复制</button>
              <button type="button" onClick={() => kind === "camera" ? props.onSaveCamera({ ...(record as Camera), enabled: !record.enabled }) : props.onSaveLens({ ...(record as Lens), enabled: !record.enabled })}>{record.enabled ? "停用" : "启用"}</button>
              <button className="danger-button" type="button" onClick={() => { if (window.confirm(`确认${record.source === "default" ? "隐藏" : "删除"} ${record.model}？`)) void props.onRemove(kind, record); }}>{record.source === "default" ? "隐藏" : "删除"}</button>
            </div>
          </article>)}
          {!records.length && <p className="empty-state">没有找到设备，换个关键词或新增一条。</p>}
        </div>
      )}
      {!edit && <div className="modal-actions"><button className="danger-outline" type="button" onClick={() => { if (window.confirm("恢复默认资料会清除当前浏览器中的全部现场修改，继续吗？")) void props.onReset(); }}>恢复默认资料</button><button type="button" onClick={props.onClose}>完成</button></div>}
    </Modal>
  );
}

function numberValue(value: string) { return value === "" ? 0 : Number(value); }
function nullableNumber(value: string) { return value === "" ? null : Number(value); }
function CameraFields({ item, onChange }: { item: Camera; onChange: (item: Camera) => void }) {
  return <>
    <label>水平像素<input type="number" min="1" value={item.resolutionWidthPx || ""} onChange={(e) => onChange({ ...item, resolutionWidthPx: numberValue(e.target.value) })} /></label>
    <label>垂直像素<input type="number" min="1" value={item.resolutionHeightPx || ""} onChange={(e) => onChange({ ...item, resolutionHeightPx: numberValue(e.target.value) })} /></label>
    <label>传感器宽（mm）<input type="number" min="0" step="any" value={item.sensorWidthMm || ""} onChange={(e) => onChange({ ...item, sensorWidthMm: numberValue(e.target.value) })} /></label>
    <label>传感器高（mm）<input type="number" min="0" step="any" value={item.sensorHeightMm || ""} onChange={(e) => onChange({ ...item, sensorHeightMm: numberValue(e.target.value) })} /></label>
    <label>传感器对角线（mm）<input type="number" min="0" step="any" value={item.sensorDiagonalMm || ""} onChange={(e) => onChange({ ...item, sensorDiagonalMm: numberValue(e.target.value) })} /></label>
    <label>镜头接口<input value={item.lensMount ?? ""} onChange={(e) => onChange({ ...item, lensMount: e.target.value || null })} placeholder="如 C、M42x1" /></label>
    <label>名义像素（M）<input type="number" min="0" step="any" value={item.nominalMegapixels ?? ""} onChange={(e) => onChange({ ...item, nominalMegapixels: nullableNumber(e.target.value) })} /></label>
    <label>Sensor 光学格式<input value={item.sensorFormat ?? ""} onChange={(e) => onChange({ ...item, sensorFormat: e.target.value || null })} placeholder={'如 2/3"、1"、1.1"'} /></label>
    <label>帧率（fps）<input type="number" min="0" step="any" value={item.fps ?? ""} onChange={(e) => onChange({ ...item, fps: nullableNumber(e.target.value) })} /></label>
    <label>水平像元（μm）<input type="number" min="0" step="any" value={item.pixelSizeXUm ?? ""} onChange={(e) => onChange({ ...item, pixelSizeXUm: nullableNumber(e.target.value) })} /></label>
    <label>垂直像元（μm）<input type="number" min="0" step="any" value={item.pixelSizeYUm ?? ""} onChange={(e) => onChange({ ...item, pixelSizeYUm: nullableNumber(e.target.value) })} /></label>
    <label>Sensor 型号<input value={item.sensorModel ?? ""} onChange={(e) => onChange({ ...item, sensorModel: e.target.value || null })} /></label>
    <label>数据接口<input value={item.dataInterface ?? ""} onChange={(e) => onChange({ ...item, dataInterface: e.target.value || null })} placeholder="如 USB3.0、GigE" /></label>
    <label>快门类型<input value={item.shutterType ?? ""} onChange={(e) => onChange({ ...item, shutterType: e.target.value || null })} placeholder="如 Global、Rolling" /></label>
  </>;
}
function LensFields({ item, onChange }: { item: Lens; onChange: (item: Lens) => void }) {
  return <>
    <label>倍率<input type="number" min="0" step="any" value={item.magnification ?? ""} onChange={(e) => onChange({ ...item, magnification: e.target.value === "" ? null : Number(e.target.value) })} /></label>
    <label>接口<input value={item.mount ?? ""} onChange={(e) => onChange({ ...item, mount: e.target.value || null })} placeholder="如 C、M42x1" /></label>
    <label>最大像圈（mm）<input type="number" min="0" step="any" value={item.maxSensorDiagonalMm ?? ""} onChange={(e) => onChange({ ...item, maxSensorDiagonalMm: nullableNumber(e.target.value) })} /></label>
    <label>工作距离（mm）<input type="number" min="0" step="any" value={item.workingDistanceMm ?? ""} onChange={(e) => onChange({ ...item, workingDistanceMm: nullableNumber(e.target.value) })} /></label>
    <label>镜头标称靶面<input value={item.sensorFormat ?? ""} onChange={(e) => onChange({ ...item, sensorFormat: e.target.value || null })} placeholder={'如 2/3"、1"'} /></label>
    <label>镜头 MTF（lp/mm）<input type="number" min="0" step="any" value={item.imageMtfLpMmMin ?? ""} onChange={(e) => onChange({ ...item, imageMtfLpMmMin: nullableNumber(e.target.value) })} /></label>
    <label>资料 DOF（mm）<input type="number" min="0" step="any" value={item.depthOfFieldMm ?? ""} onChange={(e) => onChange({ ...item, depthOfFieldMm: nullableNumber(e.target.value) })} /></label>
    <label>DOF 光圈<input value={item.depthOfFieldAperture ?? ""} onChange={(e) => onChange({ ...item, depthOfFieldAperture: e.target.value || null })} placeholder="如 F16" /></label>
    <label>最佳光圈<input value={item.aperture ?? ""} onChange={(e) => onChange({ ...item, aperture: e.target.value || null })} placeholder="如 F8" /></label>
    <label className="check-row editor-check"><input type="checkbox" checked={Boolean(item.depthOfFieldSymmetric)} onChange={(e) => onChange({ ...item, depthOfFieldSymmetric: e.target.checked })} />DOF 为 ± 范围</label>
  </>;
}
