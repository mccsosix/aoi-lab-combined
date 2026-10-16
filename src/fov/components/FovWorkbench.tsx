"use client";

import { useMemo, useState } from "react";
import "../fov.css";
import cameraDefaultsJson from "../data/cameras.json";
import lensDefaultsJson from "../data/lenses.json";
import { checkCompatibility, isExplicitlyIncompatible } from "../domain/compatibility";
import { calculateFov } from "../domain/fov";
import { recommendCombinations, type Recommendation, type ResolutionStatus } from "../domain/recommend";
import type { Camera, CompatibilityResult, FovResult, Lens } from "../domain/types";
import { useDeviceLibrary } from "../hooks/useDeviceLibrary";
import { indexedDbDeviceRepository, type DefaultDeviceData, type DeviceRepository } from "../storage/db";
import { BackupModal } from "./BackupModal";
import { DeviceLibraryModal } from "./DeviceLibraryModal";
import { ReportResult } from "./ReportResult";

const bundledDefaults: DefaultDeviceData = {
  cameras: cameraDefaultsJson as Camera[],
  lenses: lensDefaultsJson as Lens[],
};
const number = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const magnificationNumber = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 4 });
const formatMicron = (valueMm: number | null) => valueMm === null ? "—" : (valueMm * 1000).toFixed(1);

export function FovWorkbench({
  onBack,
  repository = indexedDbDeviceRepository,
  defaultData = bundledDefaults,
  showBackAction = true,
}: {
  onBack?: () => void;
  repository?: DeviceRepository;
  showBackAction?: boolean;
  defaultData?: DefaultDeviceData;
}) {
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
  const [marginMm, setMarginMm] = useState("8");
  const [allowRotate, setAllowRotate] = useState(false);
  const [includeReview, setIncludeReview] = useState(false);
  // 公差筛选默认会把"没有解析度资料"的镜头一并排除（实测 63/426）。给用户一个显式开关，
  // 而不是让它们静默消失。
  const [includeUnknownRes, setIncludeUnknownRes] = useState(false);
  const [computing, setComputing] = useState(false);
  const [toleranceEnabled, setToleranceEnabled] = useState(false);
  const [toleranceMm, setToleranceMm] = useState("");
  const [showIncompatible, setShowIncompatible] = useState(false);
  const [recommendations, setRecommendations] = useState<ReturnType<typeof recommendCombinations> | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);

  const visibleCameras = useMemo(
    () => library.cameras.filter((item) => item.enabled && !item.hidden),
    [library.cameras],
  );
  const visibleLenses = useMemo(
    () => library.lenses.filter((item) => item.enabled && !item.hidden),
    [library.lenses],
  );
  const cameraBrands = [...new Set(visibleCameras.map((item) => item.brand))];
  const lensBrands = [...new Set(visibleLenses.map((item) => item.brand))];
  const filteredCameras = visibleCameras.filter(
    (item) =>
      (!cameraBrand || item.brand === cameraBrand) &&
      `${item.brand} ${item.model}`.toLowerCase().includes(cameraQuery.toLowerCase()),
  );
  const effectiveCameraId = filteredCameras.some((item) => item.id === cameraId)
    ? cameraId
    : filteredCameras[0]?.id || "";
  const selectedCamera = library.cameras.find((item) => item.id === effectiveCameraId);
  const filteredLenses = visibleLenses.filter(
    (item) =>
      (!lensBrand || item.brand === lensBrand) &&
      `${item.brand} ${item.model}`.toLowerCase().includes(lensQuery.toLowerCase()) &&
      (showIncompatible || !selectedCamera || !isExplicitlyIncompatible(selectedCamera, item)),
  );
  const effectiveLensId = filteredLenses.some((item) => item.id === lensId)
    ? lensId
    : filteredLenses[0]?.id || "";
  const selectedLens = library.lenses.find((item) => item.id === effectiveLensId);
  const manual = useMemo<
    { fov: FovResult; compatibility: CompatibilityResult } | { error: string } | null
  >(() => {
    if (!selectedCamera || !selectedLens) return null;
    try {
      return {
        fov: calculateFov(selectedCamera, selectedLens),
        compatibility: checkCompatibility(selectedCamera, selectedLens),
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "无法计算" };
    }
  }, [selectedCamera, selectedLens]);

  const runRecommendations = async () => {
    const widthMm = Number(targetWidth);
    const heightMm = Number(targetHeight);
    if (!(widthMm > 0 && heightMm > 0)) {
      setRecommendations(null);
      return;
    }
    const margin = Number(marginMm) || 0;
    const tolerance = toleranceEnabled ? Number(toleranceMm) : null;
    const cameras = visibleCameras.filter((item) => !cameraBrand || item.brand === cameraBrand);
    const lenses = visibleLenses.filter((item) => !lensBrand || item.brand === lensBrand);
    // 全品牌时是 1147×426 ≈ 48.8 万组合同的同步枚举（实测简化内层循环就要约 190 ms，
    // 浏览器里加上 toFixed/排序约 0.3–1 s）。先渲染"计算中"，再让出主线程执行，
    // 否则点击后会有一段完全无反馈的卡死。
    setComputing(true);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    try {
      setRecommendations(
        recommendCombinations(
          cameras,
          lenses,
          { widthMm: widthMm + margin, heightMm: heightMm + margin },
          { allowRotate, includeReview, limit: 100, toleranceMm: tolerance && tolerance > 0 ? tolerance : null, includeUnknownResolution: includeUnknownRes },
        ),
      );
    } finally {
      setComputing(false);
    }
  };

  const inspect = (item: Recommendation) => {
    setCameraId(item.camera.id);
    setLensId(item.lens.id);
    setMode("manual");
  };

  const closeWorkbench = () => {
    if (onBack) onBack();
    else window.history.back();
  };

  return (
    <section className="fov-shell" aria-label="FOV 相机与镜头选型">
      <div className="fov-page">
        <div className="fov-utility-bar">
          <div className="fov-tool-brand">
            <strong>AOI LAB</strong>
            <span aria-hidden="true" />
            <b>OPTICS TOOL</b>
          </div>
          <div className="header-actions">
            <button type="button" onClick={() => setLibraryOpen(true)}>设备资料库</button>
            <button type="button" onClick={() => setBackupOpen(true)}>导入 / 导出</button>
            {showBackAction && <button type="button" className="collapse-tool-button" onClick={closeWorkbench}>收起工具 ×</button>}
          </div>
        </div>

        <header className="fov-header">
          <div className="fov-title-block">
            <p className="fov-eyebrow">// TOOL 03 / OPTICS</p>
            <h1>FOV 相机与镜头选型</h1>
            <p>组合计算视野，或输入目标尺寸后向我推荐覆盖方案。</p>
          </div>
          <div className="data-strip" role="status">
            <span><b>{library.cameras.filter((item) => !item.hidden).length}</b> 台相机</span>
            <span><b>{library.lenses.filter((item) => !item.hidden).length}</b> 款镜头</span>
            <span><i /> 本机自动保存</span>
          </div>
        </header>

        {library.error && (
          <div className="blocking-error" role="alert">本地资料库无法使用：{library.error}</div>
        )}

        <nav className="mode-tabs" aria-label="计算模式">
          <button type="button" aria-pressed={mode === "manual"} onClick={() => setMode("manual")}>组合计算</button>
          <button type="button" aria-pressed={mode === "target"} onClick={() => setMode("target")}>按目标推荐</button>
        </nav>

        {library.loading ? (
          <section className="paper-panel loading-panel">正在装入设备资料…</section>
        ) : mode === "manual" ? (
          <div className="fov-grid">
            <section className="paper-panel input-panel" aria-labelledby="manual-input-title">
              <span className="panel-index">01 / INPUT</span>
              <h2 id="manual-input-title">选择设备组合</h2>

              <DevicePicker
                label="相机"
                brands={cameraBrands}
                brand={cameraBrand}
                onBrand={setCameraBrand}
                query={cameraQuery}
                onQuery={setCameraQuery}
                items={filteredCameras}
                value={effectiveCameraId}
                onChange={setCameraId}
              />
              <DevicePicker
                label="镜头"
                brands={lensBrands}
                brand={lensBrand}
                onBrand={setLensBrand}
                query={lensQuery}
                onQuery={setLensQuery}
                items={filteredLenses}
                value={effectiveLensId}
                onChange={setLensId}
              />

              <label className="check-row lens-compat-toggle">
                <input
                  type="checkbox"
                  checked={showIncompatible}
                  onChange={(event) => setShowIncompatible(event.target.checked)}
                />
                显示不兼容镜头
              </label>

              {selectedCamera && (
                <div className="selection-note">
                  <div>
                    <span>传感器尺寸</span>
                    <b>{selectedCamera.sensorWidthMm.toFixed(2)} × {selectedCamera.sensorHeightMm.toFixed(2)} mm</b>
                  </div>
                  <div className="selection-magnification">
                    <span>当前倍率</span>
                    <b>÷ {manual && "fov" in manual ? magnificationNumber.format(manual.fov.magnification) : "—"}×</b>
                  </div>
                </div>
              )}

              <aside className="usage-tips">
                <b><span aria-hidden="true">!</span> 使用提示</b>
                <p>• 左侧选择相机与镜头，右侧将自动计算实际视野与精度。</p>
                <p>• 想按目标尺寸反向推荐？切换到「按目标推荐」标签。</p>
              </aside>
            </section>

            <section className="paper-panel result-panel" aria-labelledby="manual-result-title">
              <span className="panel-index">02 / RESULT</span>
              <h2 id="manual-result-title">实际视野与精度</h2>
              {manual && "fov" in manual && selectedCamera && selectedLens ? (
                <ReportResult
                  camera={selectedCamera}
                  lens={selectedLens}
                  fov={manual.fov}
                  compatibility={manual.compatibility}
                />
              ) : (
                <p className="empty-state">{manual && "error" in manual ? manual.error : "请选择相机和镜头。"}</p>
              )}
            </section>
          </div>
        ) : (
          <div className="target-layout">
            <section className="paper-panel target-input">
              <span className="panel-index">01 / TARGET</span>
              <h2>设定目标与拍摄余量</h2>
              <div className="dimension-grid">
                <label>
                  目标宽度（mm）
                  <span className="dimension-input">
                    <input
                      type="number"
                      min="0.001"
                      step="any"
                      value={targetWidth}
                      onChange={(event) => setTargetWidth(event.target.value)}
                    />
                    <MarginStepper value={marginMm} onChange={setMarginMm} />
                  </span>
                </label>
                <span className="dimension-times">×</span>
                <label>
                  目标高度（mm）
                  <span className="dimension-input">
                    <input
                      type="number"
                      min="0.001"
                      step="any"
                      value={targetHeight}
                      onChange={(event) => setTargetHeight(event.target.value)}
                    />
                    <MarginStepper value={marginMm} onChange={setMarginMm} />
                  </span>
                </label>
              </div>
              <div className="filter-grid">
                <label>
                  相机品牌
                  <select value={cameraBrand} onChange={(event) => setCameraBrand(event.target.value)}>
                    <option value="">全部品牌</option>
                    {cameraBrands.map((brand) => <option key={brand}>{brand}</option>)}
                  </select>
                </label>
                <label>
                  镜头品牌
                  <select value={lensBrand} onChange={(event) => setLensBrand(event.target.value)}>
                    <option value="">全部品牌</option>
                    {lensBrands.map((brand) => <option key={brand}>{brand}</option>)}
                  </select>
                </label>
              </div>
              <label className="check-row">
                <input type="checkbox" checked={allowRotate} onChange={(event) => setAllowRotate(event.target.checked)} />
                允许目标宽高互换
              </label>
              <label className="check-row">
                <input type="checkbox" checked={includeReview} onChange={(event) => setIncludeReview(event.target.checked)} />
                包含兼容性待确认组合
              </label>
              <label className="check-row">
                <input type="checkbox" checked={toleranceEnabled} onChange={(event) => setToleranceEnabled(event.target.checked)} />
                按公差带筛选解析度（可选）
              </label>
              {toleranceEnabled && (
                <>
                  <label className="check-row">
                    <input type="checkbox" checked={includeUnknownRes} onChange={(event) => setIncludeUnknownRes(event.target.checked)} />
                    包含缺少解析度资料的组合
                  </label>
                  <label className="tolerance-field">
                    <span>公差带 T（mm）</span>
                    <input
                      type="number"
                      min="0.001"
                      step="any"
                      value={toleranceMm}
                      onChange={(event) => setToleranceMm(event.target.value)}
                      placeholder="如 0.15"
                    />
                  </label>
                </>
              )}
              <button className="primary-button recommend-button" type="button" onClick={runRecommendations}>
                查找完整覆盖组合
              </button>
              <p className="formula-note">
                按「宽 + 余量」×「高 + 余量」搜索覆盖组合，避免画面刚好顶满目标边缘。
                {toleranceEnabled && " 并按 T/10 准则判定解析度。"}
              </p>
            </section>

            <section className="paper-panel recommendation-panel">
              <span className="panel-index">02 / MATCHES</span>
              <h2>完整覆盖组合</h2>
              {!recommendations ? (
                <div className="empty-state target-empty-state">
                  <b>输入目标尺寸后开始查找。</b>
                  <p>默认仅显示接口与像圈资料完整的组合。</p>
                </div>
              ) : recommendations.items.length ? (
                <>
                  <p className="match-summary">
                    找到 <b>{recommendations.totalMatches}</b> 个组合，显示最接近目标的前 {recommendations.items.length} 个。
                    {toleranceEnabled && recommendations.exclusions.insufficientResolution > 0 && (
                      <> 其中解析度不达标或无法判定的 <b>{recommendations.exclusions.insufficientResolution}</b> 个已排除。</>
                    )}
                  </p>
                  <div className="recommendation-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>相机 / 镜头</th>
                          <th>FOV（mm）</th>
                          <th>超出目标</th>
                          <th>精度</th>
                          {toleranceEnabled && <th>解析度判定</th>}
                          <th>状态</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recommendations.items.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <b>{item.camera.model}</b>
                              <span className="rec-sub">{item.lens.model} · {magnificationNumber.format(item.fov.magnification)}×</span>
                            </td>
                            <td>{number.format(item.fov.widthMm)} × {number.format(item.fov.heightMm)}</td>
                            <td>
                              +{number.format(item.widthOverMm)} / +{number.format(item.heightOverMm)}
                              <span className="rec-sub">{percent.format(item.widthOverRate * 100)}% / {percent.format(item.heightOverRate * 100)}%</span>
                            </td>
                            <td>{number.format(item.fov.umPerPixelX)} μm/px</td>
                            {toleranceEnabled && (
                              <td className="resolution-cell">
                                <div className="resolution-value">
                                  <b>{item.lensResolutionMm === null ? "—" : `${formatMicron(item.effectiveResolutionMm)} μm`}</b>
                                  <ResolutionBadge status={item.resolutionStatus} />
                                </div>
                                {item.lensResolutionMm !== null && (
                                  <span className="rec-sub">像元 {formatMicron(item.pixelMm)} μm · 镜头 {formatMicron(item.lensResolutionMm)} μm</span>
                                )}
                              </td>
                            )}
                            <td className="status-cell"><StatusBadge status={item.compatibility.status} rotated={item.rotated} /></td>
                            <td className="action-cell">
                              <button
                                type="button"
                                aria-label={`查看 ${item.camera.model} 与 ${item.lens.model}`}
                                onClick={() => inspect(item)}
                              >
                                查看
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="empty-state target-empty-state">
                  <b>没有完整覆盖且兼容的组合</b>
                  <p>
                    FOV 不足 {recommendations.exclusions.insufficientFov}；接口/像圈限制 {recommendations.exclusions.mountOrCircle}；资料缺失 {recommendations.exclusions.missingData}。
                    {toleranceEnabled && recommendations.exclusions.insufficientResolution > 0 && (
                      <> 解析度不达标 {recommendations.exclusions.insufficientResolution}；</>
                    )}
                    {toleranceEnabled && recommendations.exclusions.resolutionUnknown > 0 && (
                      <> 镜头缺解析度资料 {recommendations.exclusions.resolutionUnknown}；</>
                    )}
                  </p>
                  <p>
                    可尝试勾选“包含兼容性待确认组合”
                    {toleranceEnabled && recommendations.exclusions.resolutionUnknown > 0 && "、“包含缺少解析度资料的组合”"}
                    ，或调整目标尺寸。
                  </p>
                </div>
              )}
            </section>
          </div>
        )}

        <aside className="fov-safety-note">
          <b>数学结果 ≠ 安装保证</b>
          <span>FOV 按传感器尺寸和倍率计算；接口、像圈及现场工作距离另行判断。</span>
        </aside>
      </div>

      <DeviceLibraryModal
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        cameras={library.cameras}
        lenses={library.lenses}
        onSaveCamera={library.saveCamera}
        onSaveLens={library.saveLens}
        onRemove={library.remove}
        onReset={library.reset}
      />
      <BackupModal
        open={backupOpen}
        onClose={() => setBackupOpen(false)}
        repository={repository}
        onChanged={library.refresh}
      />
    </section>
  );
}

function DevicePicker<T extends Camera | Lens>({
  label,
  brands,
  brand,
  onBrand,
  query,
  onQuery,
  items,
  value,
  onChange,
}: {
  label: string;
  brands: string[];
  brand: string;
  onBrand: (value: string) => void;
  query: string;
  onQuery: (value: string) => void;
  items: T[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="device-picker">
      <legend>{label}</legend>
      <div className="picker-filters">
        <select aria-label={`${label}品牌`} value={brand} onChange={(event) => onBrand(event.target.value)}>
          <option value="">全部品牌</option>
          {brands.map((item) => <option key={item}>{item}</option>)}
        </select>
        <input
          aria-label={`搜索${label}`}
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="输入型号关键词"
        />
      </div>
      <select aria-label={`选择${label}`} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">请选择</option>
        {items.map((item) => <option key={item.id} value={item.id}>{item.brand} · {item.model}</option>)}
      </select>
    </fieldset>
  );
}

function StatusBadge({
  status,
  rotated,
}: {
  status: "compatible" | "review" | "incompatible";
  rotated?: boolean;
}) {
  return (
    <span className={`status-badge status-badge--${status}`}>
      {status === "compatible" ? "兼容" : status === "review" ? "待确认" : "不兼容"}
      {rotated ? " · 已旋转" : ""}
    </span>
  );
}

function ResolutionBadge({ status }: { status: ResolutionStatus }) {
  const label = status === "pass" ? "达标" : status === "fail" ? "不足" : "未知";
  return <span className={`resolution-badge resolution-badge--${status}`}>{label}</span>;
}

function MarginStepper({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const step = (delta: number) => {
    const next = (Number(value) || 0) + delta;
    onChange(String(Math.max(0, next)));
  };
  return (
    <span className="margin-stepper" aria-label="容错余量">
      <button type="button" onClick={() => step(-1)} aria-label="容错余量减 1 mm">−</button>
      <input
        type="number"
        min="0"
        step="any"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label="容错余量数值（mm）"
      />
      <button type="button" onClick={() => step(1)} aria-label="容错余量加 1 mm">+</button>
    </span>
  );
}
