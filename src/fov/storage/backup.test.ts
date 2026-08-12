import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { cameraFixture, lensFixture } from "../../../tests/fixtures";
import { createIndexedDbRepository } from "./db";
import { applyImport, exportBackup, previewImport } from "./backup";

describe("JSON 备份", () => {
  it("拒绝错误版本且不改动资料库", async () => {
    const repository = createIndexedDbRepository(`fov-backup-${crypto.randomUUID()}`);
    await repository.initializeDefaults({ cameras: [cameraFixture], lenses: [] }, "v1");
    const preview = await previewImport(repository, JSON.stringify({ schemaVersion: 9, cameras: [], lenses: [] }));
    expect(preview.invalid).toContain("不支持的备份版本");
    expect(await repository.listCameras()).toHaveLength(1);
  });

  it("预览新增与冲突，并要求每个冲突都有决定", async () => {
    const repository = createIndexedDbRepository(`fov-backup-${crypto.randomUUID()}`);
    await repository.initializeDefaults({ cameras: [cameraFixture], lenses: [lensFixture] }, "v1");
    const imported = JSON.stringify({
      schemaVersion: 1, exportedAt: "2026-08-12T00:00:00.000Z", settings: {},
      cameras: [{ ...cameraFixture, model: "导入型号" }, { ...cameraFixture, id: "camera-new" }], lenses: [lensFixture],
    });
    const preview = await previewImport(repository, imported);
    expect(preview.added).toHaveLength(1);
    expect(preview.conflicts).toHaveLength(1);
    await expect(applyImport(repository, preview, {})).rejects.toThrow("请选择所有冲突的处理方式");
    await applyImport(repository, preview, { [cameraFixture.id]: "use-import" });
    expect((await repository.listCameras()).find((item) => item.id === cameraFixture.id)?.model).toBe("导入型号");
  });

  it("导出可重新解析的完整备份", async () => {
    const repository = createIndexedDbRepository(`fov-backup-${crypto.randomUUID()}`);
    await repository.initializeDefaults({ cameras: [cameraFixture], lenses: [lensFixture] }, "v1");
    const backup = JSON.parse(await exportBackup(repository));
    expect(backup).toMatchObject({ schemaVersion: 1 });
    expect(backup.cameras).toHaveLength(1);
    expect(backup.lenses).toHaveLength(1);
  });
});
