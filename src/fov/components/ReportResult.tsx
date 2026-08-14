"use client";

import { useMemo, useState } from "react";
import { buildReportResult, formatReportText } from "../domain/report";
import type { Camera, CompatibilityResult, FovResult, Lens } from "../domain/types";

const fixed = (value: number | null | undefined, digits: number) => value == null ? "—" : value.toFixed(digits);
const compact = (value: number | null | undefined) => value == null ? "—" : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
const magnification = (value: number) => new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 4 }).format(value);

export function ReportResult({
  camera,
  lens,
  fov,
  compatibility,
}: {
  camera: Camera;
  lens: Lens;
  fov: FovResult;
  compatibility: CompatibilityResult;
}) {
  const report = useMemo(() => buildReportResult(camera, lens, fov), [camera, lens, fov]);
  const reportText = useMemo(() => formatReportText(report), [report]);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const dofSign = report.dofSymmetric ? "±" : "";
  const sensorSummary = `${report.nominalMegapixels === null ? "—" : `${compact(report.nominalMegapixels)}M`}${report.sensorFormat ? ` · ${report.sensorFormat}` : ""}${report.fps === null ? "" : ` · ${compact(report.fps)} fps`}`;

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(reportText);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <>
      <div className="report-heading">
        <div>
          <p className="result-label">CORE METRICS</p>
          <p className="report-hint">核心计算结果优先展示</p>
        </div>
        <button type="button" className="copy-report-button" onClick={copyReport}>
          {copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : "复制报告参数"}
        </button>
      </div>

      <div className="result-kpi-grid" aria-label="核心计算结果">
        <Kpi label="水平视野" code="H FOV" value={fixed(report.fovWidthMm, 2)} unit="mm" />
        <Kpi label="垂直视野" code="V FOV" value={fixed(report.fovHeightMm, 2)} unit="mm" />
        <Kpi label="分辨率" code="RESOLUTION" value={fixed(report.resolutionMmPerPixel, 5)} unit="mm/px" wide />
        <Kpi
          label="景深"
          code="DOF"
          value={report.dofMm === null ? "—" : `${dofSign}${fixed(report.dofMm, 2)}`}
          unit={report.dofMm === null ? "" : "mm"}
        />
      </div>

      <section className="device-detail-section" aria-labelledby="device-detail-title">
        <h3 id="device-detail-title">设备组合详情</h3>
        <div className="device-detail-grid">
          <DetailRow label="相机（CCD）" value={report.cameraModel} />
          <DetailRow label="视野（H × V）" value={`${fixed(report.fovWidthMm, 2)} × ${fixed(report.fovHeightMm, 2)} mm`} />
          <DetailRow label="Sensor" value={sensorSummary || "—"} />
          <DetailRow label="分辨率" value={`${fixed(report.resolutionMmPerPixel, 5)} mm/pixel`} />
          <DetailRow label="像元尺寸" value={camera.pixelSizeXUm ? `${compact(camera.pixelSizeXUm)} μm` : "—"} />
          <DetailRow label="景深（DOF）" value={report.dofMm === null ? "—" : `${dofSign}${fixed(report.dofMm, 2)} mm`} />
          <DetailRow label="镜头（Lens）" value={report.lensModel} />
          <DetailRow label="镜头分辨率" value={report.lensResolutionMm === null ? "—" : `${fixed(report.lensResolutionMm, 3)} mm/pixel`} />
        </div>
      </section>

      <Compatibility compatibility={compatibility} />

      <details className="result-details">
        <summary>查看更多参数</summary>
        <div className="detail-grid">
          <Detail label="对角 FOV" value={`${fixed(fov.diagonalMm, 2)} mm`} />
          <Detail label="水平精度" value={`${fixed(fov.umPerPixelX, 2)} μm/px`} />
          <Detail label="垂直精度" value={`${fixed(fov.umPerPixelY, 2)} μm/px`} />
          <Detail label="实际倍率" value={`${magnification(fov.magnification)}×`} />
          <Detail label="相机分辨率" value={`${camera.resolutionWidthPx} × ${camera.resolutionHeightPx} px`} />
          <Detail label="传感器尺寸" value={`${fixed(camera.sensorWidthMm, 2)} × ${fixed(camera.sensorHeightMm, 2)} mm`} />
          <Detail label="Sensor 光学格式" value={camera.sensorFormat ?? "—"} />
          <Detail label="Sensor 型号" value={camera.sensorModel ?? "—"} />
          <Detail label="像元尺寸" value={camera.pixelSizeXUm ? `${compact(camera.pixelSizeXUm)} × ${compact(camera.pixelSizeYUm ?? camera.pixelSizeXUm)} μm` : "—"} />
          <Detail label="相机数据接口" value={camera.dataInterface ?? "—"} />
          <Detail label="快门类型" value={camera.shutterType ?? "—"} />
          <Detail label="帧率" value={camera.fps == null ? "—" : `${compact(camera.fps)} fps`} />
          <Detail label="相机镜头接口" value={camera.lensMount ?? "—"} />
          <Detail label="镜头类型" value={lens.lensType || "—"} />
          <Detail label="工作距离" value={lens.workingDistanceMm ? `${compact(lens.workingDistanceMm)} mm` : "—"} />
          <Detail label="镜头原始 DOF" value={lens.depthOfFieldMm ? `${compact(lens.depthOfFieldMm)} mm${lens.depthOfFieldAperture ? ` @ ${lens.depthOfFieldAperture}` : ""}` : "—"} />
          <Detail label="镜头 MTF" value={lens.imageMtfLpMmMin ? `≥ ${compact(lens.imageMtfLpMmMin)} lp/mm` : "—"} />
          <Detail label="镜头像圈" value={lens.maxSensorDiagonalMm ? `${compact(lens.maxSensorDiagonalMm)} mm` : "—"} />
          <Detail label="镜头接口" value={lens.mount ?? "—"} />
        </div>
        <p className="calculation-note">
          DOF 按项目约定使用“镜头资料值 × 实际倍率”；Lens Resolution 为基于镜头图像侧 MTF 的半周期估算值。
        </p>
      </details>
    </>
  );
}

function Kpi({
  label,
  code,
  value,
  unit,
  wide = false,
}: {
  label: string;
  code: string;
  value: string;
  unit: string;
  wide?: boolean;
}) {
  return (
    <article className={`result-kpi${wide ? " result-kpi--wide" : ""}`}>
      <div><span>{label}</span><small>{code}</small></div>
      <p><b>{value}</b>{unit && <em>{unit}</em>}</p>
    </article>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div className="device-detail-row"><span>{label}</span><b>{value}</b></div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><b>{value}</b></div>;
}

function Compatibility({ compatibility }: { compatibility: CompatibilityResult }) {
  const label = compatibility.status === "compatible" ? "兼容" : compatibility.status === "review" ? "待确认" : "不兼容";
  return (
    <div className={`compatibility compatibility--${compatibility.status}`}>
      <span className={`status-badge status-badge--${compatibility.status}`}>{label}</span>
      <div>{compatibility.reasons.map((reason) => <p key={reason}>{reason}</p>)}</div>
    </div>
  );
}
