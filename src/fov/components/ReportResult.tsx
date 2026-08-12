"use client";

import { useMemo, useState } from "react";
import { buildReportResult, formatReportText } from "../domain/report";
import type { Camera, CompatibilityResult, FovResult, Lens } from "../domain/types";

const fixed = (value: number | null | undefined, digits: number) => value == null ? "—" : value.toFixed(digits);
const compact = (value: number | null | undefined) => value == null ? "—" : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
const computedMp = (value: number) => new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
const magnification = (value: number) => new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 4 }).format(value);

export function ReportResult({ camera, lens, fov, compatibility }: { camera: Camera; lens: Lens; fov: FovResult; compatibility: CompatibilityResult }) {
  const report = useMemo(() => buildReportResult(camera, lens, fov), [camera, lens, fov]);
  const reportText = useMemo(() => formatReportText(report), [report]);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const dofSign = report.dofSymmetric ? "±" : "";

  const sensor = `${report.nominalMegapixels !== null
    ? `${compact(report.nominalMegapixels)}M`
    : report.computedMegapixels !== null
      ? `${computedMp(report.computedMegapixels)} MP（按分辨率计算）`
      : "—"}${report.sensorFormat ? `（${report.sensorFormat}）` : "靶面规格待补"}/ fps=${report.fps !== null ? compact(report.fps) : "待补"}`;

  const isDofRange = report.dofMinMm !== null && report.dofMaxMm !== null && report.dofMm === null;
  const dofValue = isDofRange
    ? `${fixed(report.dofMinMm, 2)}–${fixed(report.dofMaxMm, 2)} mm`
    : report.dofMm === null
      ? "—"
      : `${dofSign}${fixed(report.dofMm, 2)} mm`;
  const dofDetail = report.dofMm === null && !isDofRange
    ? undefined
    : isDofRange
      ? `${fixed(report.dofSourceMinMm, 2)}–${fixed(report.dofSourceMaxMm, 2)} mm × ${magnification(report.magnification)}`
      : `${dofSign}${fixed(report.dofSourceMm, 2)} mm × ${magnification(report.magnification)}`;

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(reportText);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return <>
    <div className="report-heading">
      <div><p className="result-label">报告参数</p><p className="report-hint">可直接复制到选型报告</p></div>
      <button type="button" className="copy-report-button" onClick={copyReport}>{copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : "复制报告参数"}</button>
    </div>
    <dl className="report-list">
      <ReportRow label="CCD" value={report.cameraModel} />
      <ReportRow label="Sensor Size" value={sensor} />
      <ReportRow label="Lens" value={report.lensModel} />
      <ReportRow label="FOV" value={`${fixed(report.fovWidthMm, 2)} × ${fixed(report.fovHeightMm, 2)} mm`} />
      <ReportRow
        label="DOF"
        value={dofValue}
        detail={dofDetail}
      />
      <ReportRow label="Resolution" value={`${fixed(report.resolutionMmPerPixel, 5)} mm/pixel`} />
      <ReportRow
        label="Lens Resolution"
        value={report.lensResolutionMm === null ? "—（资料未提供）" : `${fixed(report.lensResolutionMm, 3)} mm`}
        detail={report.lensResolutionMm === null
          ? "资料未提供，非计算失败"
          : report.lensResolutionSource === "manufacturer-object-space"
            ? "厂家物方解析度"
            : "基于像方 MTF 的物方 half-pitch 估算"}
      />
    </dl>
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
        <Detail label="像元尺寸" value={camera.pixelSizeXUm ? `${compact(camera.pixelSizeXUm)} × ${compact(camera.pixelSizeYUm ?? camera.pixelSizeXUm)} μm` : "—"} />
        <Detail label="相机接口" value={camera.lensMount ?? "—"} />
        <Detail label="镜头类型" value={lens.lensType || "—"} />
        <Detail label="工作距离" value={lens.workingDistanceMm ? `${compact(lens.workingDistanceMm)} mm` : "—"} />
        <Detail label="镜头原始 DOF" value={lens.depthOfFieldMm ? `${compact(lens.depthOfFieldMm)} mm${lens.depthOfFieldAperture ? ` @ ${lens.depthOfFieldAperture}` : ""}` : (lens.depthOfFieldMinMm != null && lens.depthOfFieldMaxMm != null ? `${compact(lens.depthOfFieldMinMm)}–${compact(lens.depthOfFieldMaxMm)} mm` : "—")} />
        <Detail label="镜头 MTF" value={lens.imageMtfLpMmMin ? `≥ ${compact(lens.imageMtfLpMmMin)} lp/mm` : "—"} />
        <Detail label="镜头物方解析度" value={lens.objectSpaceResolutionUm ? `${compact(lens.objectSpaceResolutionUm)} μm（${fixed(lens.objectSpaceResolutionUm / 1000, 3)} mm）` : "—"} />
        <Detail label="镜头像圈" value={lens.maxSensorDiagonalMm ? `${compact(lens.maxSensorDiagonalMm)} mm` : "—"} />
        <Detail label="镜头接口" value={lens.mount ?? "—"} />
      </div>
      <p className="calculation-note">DOF 按项目约定使用“镜头资料值 × 实际倍率”；Lens Resolution 优先采用厂家直接物方解析度，其次为基于镜头像方 MTF 的物方 half-pitch 估算；资料缺失时明确标注“资料未提供”，不做猜测。</p>
    </details>
  </>;
}

function ReportRow({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className="report-row"><dt>{label}</dt><dd><b>{value}</b>{detail && <span>{detail}</span>}</dd></div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><b>{value}</b></div>;
}

function Compatibility({ compatibility }: { compatibility: CompatibilityResult }) {
  const label = compatibility.status === "compatible" ? "兼容" : compatibility.status === "review" ? "待确认" : "不兼容";
  return <div className={`compatibility compatibility--${compatibility.status}`}>
    <span className={`status-badge status-badge--${compatibility.status}`}>{label}</span>
    <div>{compatibility.reasons.map((reason) => <p key={reason}>{reason}</p>)}</div>
  </div>;
}
