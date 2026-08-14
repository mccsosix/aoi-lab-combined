import type { Camera, Lens } from "../domain/types";
import type { DeviceKind, DeviceRepository } from "./db";

export type FovBackup = {
  schemaVersion: 1;
  exportedAt: string;
  cameras: Camera[];
  lenses: Lens[];
  settings: Record<string, unknown>;
};

export type ImportEntry = { kind: DeviceKind; id: string; imported: Camera | Lens; local?: Camera | Lens };
export type ImportPreview = {
  backup: FovBackup | null;
  added: ImportEntry[];
  updated: ImportEntry[];
  conflicts: ImportEntry[];
  invalid: string[];
};
export type ConflictDecision = "keep-local" | "use-import";

export async function exportBackup(repository: DeviceRepository): Promise<string> {
  const backup: FovBackup = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    cameras: await repository.listCameras(),
    lenses: await repository.listLenses(),
    settings: {},
  };
  return JSON.stringify(backup, null, 2);
}

function validDevice(item: unknown): item is Camera | Lens {
  return Boolean(item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string" && typeof (item as { model?: unknown }).model === "string");
}

export async function previewImport(repository: DeviceRepository, raw: string): Promise<ImportPreview> {
  const empty: ImportPreview = { backup: null, added: [], updated: [], conflicts: [], invalid: [] };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { empty.invalid.push("JSON 文件无法解析"); return empty; }
  if (!parsed || typeof parsed !== "object" || (parsed as { schemaVersion?: unknown }).schemaVersion !== 1) { empty.invalid.push("不支持的备份版本"); return empty; }
  const backup = parsed as FovBackup;
  if (!Array.isArray(backup.cameras) || !Array.isArray(backup.lenses)) { empty.invalid.push("备份缺少相机或镜头数组"); return empty; }
  const localCameras = new Map((await repository.listCameras()).map((item) => [item.id, item]));
  const localLenses = new Map((await repository.listLenses()).map((item) => [item.id, item]));
  const preview: ImportPreview = { ...empty, backup };
  const inspect = (kind: DeviceKind, items: unknown[], local: Map<string, Camera | Lens>) => {
    for (const item of items) {
      if (!validDevice(item)) { preview.invalid.push(`${kind === "camera" ? "相机" : "镜头"}记录字段无效`); continue; }
      const current = local.get(item.id);
      const entry: ImportEntry = { kind, id: item.id, imported: item, local: current };
      if (!current) preview.added.push(entry);
      else if (JSON.stringify(current) !== JSON.stringify(item)) preview.conflicts.push(entry);
      else preview.updated.push(entry);
    }
  };
  inspect("camera", backup.cameras, localCameras);
  inspect("lens", backup.lenses, localLenses);
  return preview;
}

export async function applyImport(repository: DeviceRepository, preview: ImportPreview, decisions: Record<string, ConflictDecision>): Promise<void> {
  if (!preview.backup || preview.invalid.length) throw new Error("备份无效，未写入任何数据");
  if (preview.conflicts.some((entry) => !decisions[entry.id])) throw new Error("请选择所有冲突的处理方式");
  const writes = [
    ...preview.added,
    ...preview.conflicts.filter((entry) => decisions[entry.id] === "use-import"),
  ];
  for (const entry of writes) {
    if (entry.kind === "camera") await repository.saveCamera(entry.imported as Camera);
    else await repository.saveLens(entry.imported as Lens);
  }
}
