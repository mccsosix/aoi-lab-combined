"use client";

import { useMemo, useState } from "react";
import cameraDefaultsJson from "../data/cameras.json";
import lensDefaultsJson from "../data/lenses.json";
import { checkCompatibility, isExplicitlyIncompatible } from "../domain/compatibility";
import { calculateFov } from "../domain/fov";
import { recommendCombinations, type Recommendation } from "../domain/recommend";
import type { Camera, Lens } from "../domain/types";
import { useDeviceLibrary } from "../hooks/useDeviceLibrary";
import { indexedDbDeviceRepository, type DefaultDeviceData, type DeviceRepository } from "../storage/db";
import { BackupModal } from "./BackupModal";
import { DeviceLibraryModal } from "./DeviceLibraryModal";
import { ReportResult } from "./ReportResult";

const bundledDefaults: DefaultDeviceData = { cameras: cameraDefaultsJson as Camera[], lenses: lensDefaultsJson as Lens[] };
const number = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const magnificationNumber = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 4 });

export function FovWorkbench({ repository = indexedDbDeviceRepository, defaultData = bundledDefaults }: { repository?: DeviceRepository; defaultData?: DefaultDeviceData }) {
  const library = useDeviceLibrary(repository, defaultData);
  const [mode, setMode] = useState<"manual" | "target">("manual");
  const [cameraId, setCameraId] = useState("");
  const [lensId, setLensId] = useState("");
  const [cameraQuery, setCameraQuery] = useState("");
  const [lensQuery, setLensQuery] = useState("");
  const [cameraBrand, setCameraBrand] = useState("");
  const [lensBrand, setLensBrand] = useState("");
  const [targetWidth, setTargetWidth] = useState("90");
  const [targetHeight, setTargetHeight] = useState("50");
  const [allowRotate, setAllowRotate] = useState(false);
  const [includeReview, setIncludeReview] = useState(false);
  const [showIncompatible, setShowIncompatible] = useState(false);
  const [recommendations, setRecommendations] = useState<ReturnType<typeof recommendCombinations> | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);

  const visibleCameras = useMemo(() => library.cameras.filter((item) => item.enabled && !item.hidden), [library.cameras]);
  const visibleLenses = useMemo(() => library.lenses.filter((item) => item.enabled && !item.hidden), [library.lenses]);
  const cameraBrands = [...new Set(visibleCameras.map((item) => item.brand))];
  const lensBrands = [...new Set(visibleLenses.map((item) => item.brand))];
  const filteredCameras = visibleCameras.filter((item) => (!cameraBrand || item.brand === cameraBrand) && `${item.brand} ${item.model}`.toLowerCase().includes(cameraQuery.toLowerCase()));
  const effectiveCameraId = filteredCameras.some((item) => item.id === cameraId) ? cameraId : filteredCameras[0]?.id || "";
  const selectedCamera = library.cameras.find((item) => item.id === effectiveCameraId);
  const filteredLenses = visibleLenses.filter((item) =>
    (!lensBrand || item.brand === lensBrand)
    && `${item.brand} ${item.model}`.toLowerCase().includes(lensQuery.toLowerCase())
    && (showIncompatible || !selectedCamera || !isExplicitlyIncompatible(selectedCamera, item))
  );
  const effectiveLensId = filteredLenses.some((item) => item.id === lensId) ? lensId : filteredLenses[0]?.id || "";
  const selectedLens = library.lenses.find((item) => item.id === effectiveLensId);
  const manual = useMemo(() => {
    if (!selectedCamera || !selectedLens) return null;
    try { return { fov: calculateFov(selectedCamera, selectedLens), compatibility: checkCompatibility(selectedCamera, selectedLens) }; }
    catch (error) { return { error: error instanceof Error ? error.message : "无法计算" }; }
  }, [selectedCamera, selectedLens]);

  const runRecommendations = () => {
    const widthMm = Number(targetWidth); const heightMm = Number(targetHeight);
    if (!(widthMm > 0 && heightMm > 0)) { setRecommendations(null); return; }
    const cameras = visibleCameras.filter((item) => !cameraBrand || item.brand === cameraBrand);
    const lenses = visibleLenses.filter((item) => !lensBrand || item.brand === lensBrand);
    setRecommendations(recommendCombinations(cameras, lenses, { widthMm, heightMm }, { allowRotate, includeReview, limit: 100 }));
  };
  const inspect = (item: Recommendation) => { setCameraId(item.camera.id); setLensId(item.lens.id); setMode("manual"); };

  return <main className="fov-shell">
    <div className="fov-page">
      <header className="fov-header">
        <button type="button" className="back-link" onClick={() => { window.location.href = "/"; }}>← 返回工具箱</button>
        <div><p className="fov-eyebrow">AOI LAB / TOOL 03 / OPTICS</p><h1>FOV 相机与镜头选型</h1><p>选组合算视野，或输入目标尺寸反向找完整覆盖方案。</p></div>
        <div className="header-actions"><button type="button" onClick={() => setLibraryOpen(true)}>设备资料库</button><button type="button" onClick={() => setBackupOpen(true)}>导入 / 导出</button></div>
      </header>
      <div className="data-strip" role="status"><span><b>{library.cameras.filter((item) => !item.hidden).length}</b> 台相机</span><span><b>{library.lenses.filter((item) => !item.hidden).length}</b> 款镜头</span><span><i /> 本机自动保存</span></div>
      {library.error && <div className="blocking-error" role="alert">本地资料库无法使用：{library.error}</div>}
      <nav className="mode-tabs" aria-label="计算模式"><button type="button" aria-pressed={mode === "manual"} onClick={() => setMode("manual")}>组合计算</button><button type="button" aria-pressed={mode === "target"} onClick={() => setMode("target")}>按目标推荐</button></nav>
      {library.loading ? <section className="paper-panel loading-panel">正在装入设备资料…</section> : mode === "manual" ? (
        <div className="fov-grid">
          <section className="paper-panel" aria-labelledby="manual-input-title"><span className="panel-index">01 / INPUT</span><h2 id="manual-input-title">选择设备组合</h2>
            <DevicePicker label="相机" brands={cameraBrands} brand={cameraBrand} onBrand={setCameraBrand} query={cameraQuery} onQuery={setCameraQuery} items={filteredCameras} value={effectiveCameraId} onChange={setCameraId} />
            <DevicePicker label="镜头" brands={lensBrands} brand={lensBrand} onBrand={setLensBrand} query={lensQuery} onQuery={setLensQuery} items={filteredLenses} value={effectiveLensId} onChange={setLensId} />
            <label className="check-row lens-compat-toggle"><input type="checkbox" checked={showIncompatible} onChange={(event) => setShowIncompatible(event.target.checked)} />显示不兼容镜头</label>
            {selectedCamera && selectedLens && <div className="selection-note"><b>{selectedCamera.sensorWidthMm} × {selectedCamera.sensorHeightMm} mm</b><span>÷ {manual && "fov" in manual ? magnificationNumber.format(manual.fov.magnification) : "—"}× 倍率</span></div>}
          </section>
          <section className="paper-panel result-panel" aria-labelledby="manual-result-title"><span className="panel-index">02 / RESULT</span><h2 id="manual-result-title">实际视野与精度</h2>
            {manual && "fov" in manual && selectedCamera && selectedLens
              ? <ReportResult camera={selectedCamera} lens={selectedLens} fov={manual.fov} compatibility={manual.compatibility} />
              : <p className="empty-state">{manual && "error" in manual ? manual.error : "请选择相机和镜头。"}</p>}
          </section>
        </div>
      ) : (
        <div className="target-layout">
          <section className="paper-panel target-input"><span className="panel-index">01 / TARGET</span><h2>输入必须拍全的尺寸</h2>
            <div className="dimension-grid"><label>目标宽度（mm）<input type="number" min="0.001" step="any" value={targetWidth} onChange={(event) => setTargetWidth(event.target.value)} /></label><span>×</span><label>目标高度（mm）<input type="number" min="0.001" step="any" value={targetHeight} onChange={(event) => setTargetHeight(event.target.value)} /></label></div>
            <div className="filter-grid"><label>相机品牌<select value={cameraBrand} onChange={(event) => setCameraBrand(event.target.value)}><option value="">全部品牌</option>{cameraBrands.map((brand) => <option key={brand}>{brand}</option>)}</select></label><label>镜头品牌<select value={lensBrand} onChange={(event) => setLensBrand(event.target.value)}><option value="">全部品牌</option>{lensBrands.map((brand) => <option key={brand}>{brand}</option>)}</select></label></div>
            <label className="check-row"><input type="checkbox" checked={allowRotate} onChange={(event) => setAllowRotate(event.target.checked)} />允许目标宽高互换</label><label className="check-row"><input type="checkbox" checked={includeReview} onChange={(event) => setIncludeReview(event.target.checked)} />包含兼容性待确认组合</label>
            <button className="primary-button recommend-button" type="button" onClick={runRecommendations}>查找完整覆盖组合</button><p className="formula-note">必须同时满足：FOV 宽 ≥ 目标宽，且 FOV 高 ≥ 目标高。</p>
          </section>
          <section className="paper-panel recommendation-panel"><span className="panel-index">02 / MATCHES</span><h2>完整覆盖组合</h2>
            {!recommendations ? <p className="empty-state">输入目标尺寸后开始查找。默认仅显示接口与像圈资料完整的组合。</p> : recommendations.items.length ? <>
              <p className="match-summary">找到 <b>{recommendations.totalMatches}</b> 个组合，显示最接近目标的前 {recommendations.items.length} 个。</p>
              <div className="recommendation-table-wrap"><table><thead><tr><th>相机 / 镜头</th><th>FOV（mm）</th><th>超出目标</th><th>精度</th><th>状态</th><th /></tr></thead><tbody>{recommendations.items.map((item) => <tr key={item.id}><td><b>{item.camera.model}</b><span>{item.lens.model} · {magnificationNumber.format(item.fov.magnification)}×</span></td><td>{number.format(item.fov.widthMm)} × {number.format(item.fov.heightMm)}</td><td>+{number.format(item.widthOverMm)} / +{number.format(item.heightOverMm)}<span>{percent.format(item.widthOverRate * 100)}% / {percent.format(item.heightOverRate * 100)}%</span></td><td>{number.format(item.fov.umPerPixelX)} μm/px</td><td><StatusBadge status={item.compatibility.status} rotated={item.rotated} /></td><td><button type="button" aria-label={`查看 ${item.camera.model} 与 ${item.lens.model}`} onClick={() => inspect(item)}>查看</button></td></tr>)}</tbody></table></div>
            </> : <div className="empty-state"><b>没有完整覆盖且兼容的组合</b><p>FOV 不足 {recommendations.exclusions.insufficientFov}；接口/像圈限制 {recommendations.exclusions.mountOrCircle}；资料缺失 {recommendations.exclusions.missingData}。</p><p>可尝试勾选“包含兼容性待确认组合”，或调整目标尺寸。</p></div>}
          </section>
        </div>
      )}
      <aside className="fov-safety-note"><b>数学结果 ≠ 安装保证</b><span>FOV 按传感器尺寸和倍率计算；接口、像圈及现场工作距离另行判断。</span></aside>
    </div>
    <DeviceLibraryModal open={libraryOpen} onClose={() => setLibraryOpen(false)} cameras={library.cameras} lenses={library.lenses} onSaveCamera={library.saveCamera} onSaveLens={library.saveLens} onRemove={library.remove} onReset={library.reset} />
    <BackupModal open={backupOpen} onClose={() => setBackupOpen(false)} repository={repository} onChanged={library.refresh} />
  </main>;
}

function DevicePicker<T extends Camera | Lens>({ label, brands, brand, onBrand, query, onQuery, items, value, onChange }: { label: string; brands: string[]; brand: string; onBrand: (value: string) => void; query: string; onQuery: (value: string) => void; items: T[]; value: string; onChange: (value: string) => void }) {
  return <fieldset className="device-picker"><legend>{label}</legend><div className="picker-filters"><select aria-label={`${label}品牌`} value={brand} onChange={(event) => onBrand(event.target.value)}><option value="">全部品牌</option>{brands.map((item) => <option key={item}>{item}</option>)}</select><input aria-label={`搜索${label}`} value={query} onChange={(event) => onQuery(event.target.value)} placeholder="输入型号关键词" /></div><select aria-label={`选择${label}`} value={value} onChange={(event) => onChange(event.target.value)}><option value="">请选择</option>{items.map((item) => <option key={item.id} value={item.id}>{item.brand} · {item.model}</option>)}</select></fieldset>;
}
function StatusBadge({ status, rotated }: { status: "compatible" | "review" | "incompatible"; rotated?: boolean }) { return <span className={`status-badge status-badge--${status}`}>{status === "compatible" ? "兼容" : status === "review" ? "待确认" : "不兼容"}{rotated ? " · 已旋转" : ""}</span>; }
