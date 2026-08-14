"use client";

import { useState } from "react";
import type { DeviceRepository } from "../storage/db";
import { applyImport, exportBackup, previewImport, type ConflictDecision, type ImportPreview } from "../storage/backup";
import { Modal } from "./Modal";

export function BackupModal({ open, onClose, repository, onChanged }: { open: boolean; onClose: () => void; repository: DeviceRepository; onChanged: () => Promise<void> }) {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [decisions, setDecisions] = useState<Record<string, ConflictDecision>>({});
  const [message, setMessage] = useState<string | null>(null);
  const download = async () => {
    const blob = new Blob([await exportBackup(repository)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = `aoi-lab-fov-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
  };
  const readFile = async (file?: File) => { if (!file) return; setDecisions({}); setMessage(null); setPreview(await previewImport(repository, await file.text())); };
  const apply = async () => {
    if (!preview) return;
    try { await applyImport(repository, preview, decisions); await onChanged(); setMessage("导入完成，当前结果已刷新。"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "导入失败"); }
  };
  const ready = Boolean(preview?.backup && preview.invalid.length === 0 && preview.conflicts.every((item) => decisions[item.id]));
  return <Modal open={open} title="资料备份与迁移" onClose={onClose}>
    <div className="backup-section"><h3>导出本机资料</h3><p>保存相机、镜头和现场修改。更换浏览器或电脑前建议先导出。</p><button className="primary-button" type="button" onClick={download}>下载 JSON 备份</button></div>
    <div className="backup-section"><h3>导入备份</h3><label className="file-picker">选择 JSON 文件<input type="file" accept=".json,application/json" onChange={(event) => void readFile(event.target.files?.[0])} /></label></div>
    {preview && <div className="import-preview">
      <div className="preview-counts"><span>新增 {preview.added.length}</span><span>冲突 {preview.conflicts.length}</span><span>无效 {preview.invalid.length}</span></div>
      {preview.invalid.map((item) => <p className="field-error" key={item}>{item}</p>)}
      {preview.conflicts.map((entry) => <fieldset key={`${entry.kind}-${entry.id}`}><legend>{entry.local?.model}：选择保留内容</legend><label><input type="radio" name={entry.id} checked={decisions[entry.id] === "keep-local"} onChange={() => setDecisions({ ...decisions, [entry.id]: "keep-local" })} />保留本机</label><label><input type="radio" name={entry.id} checked={decisions[entry.id] === "use-import"} onChange={() => setDecisions({ ...decisions, [entry.id]: "use-import" })} />使用导入数据</label></fieldset>)}
    </div>}
    {message && <p className="inline-message" role="status">{message}</p>}
    <div className="modal-actions"><button type="button" onClick={onClose}>关闭</button><button className="primary-button" type="button" disabled={!ready} onClick={apply}>确认导入</button></div>
  </Modal>;
}
