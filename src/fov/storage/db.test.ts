import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { cameraFixture, lensFixture } from "../../../tests/fixtures";
import { createIndexedDbRepository } from "./db";

describe("IndexedDB 设备资料库", () => {
  it("升级默认资料时保留用户修改并补充新记录", async () => {
    const repository = createIndexedDbRepository(`fov-test-${crypto.randomUUID()}`);
    await repository.initializeDefaults({ cameras: [cameraFixture], lenses: [lensFixture] }, "v1");
    await repository.saveCamera({ ...cameraFixture, model: "现场修改型号", customized: true });
    await repository.initializeDefaults({ cameras: [{ ...cameraFixture, model: "官网更新型号" }, { ...cameraFixture, id: "camera-new" }], lenses: [lensFixture] }, "v2");
    expect((await repository.listCameras()).find((item) => item.id === cameraFixture.id)?.model).toBe("现场修改型号");
    expect((await repository.listCameras()).some((item) => item.id === "camera-new")).toBe(true);
  });

  it("隐藏默认记录但彻底删除用户记录", async () => {
    const repository = createIndexedDbRepository(`fov-test-${crypto.randomUUID()}`);
    await repository.initializeDefaults({ cameras: [cameraFixture], lenses: [] }, "v1");
    await repository.hideDefaultRecord("camera", cameraFixture.id);
    expect((await repository.listCameras())[0].hidden).toBe(true);
    const userCamera = { ...cameraFixture, id: "user-camera", source: "user" as const };
    await repository.saveCamera(userCamera);
    await repository.deleteUserRecord("camera", userCamera.id);
    expect((await repository.listCameras()).some((item) => item.id === userCamera.id)).toBe(false);
  });
});
