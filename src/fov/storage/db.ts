import { openDB, type IDBPDatabase } from "idb";
import type { Camera, Lens } from "../domain/types";

export type DeviceKind = "camera" | "lens";
export type DefaultDeviceData = { cameras: Camera[]; lenses: Lens[] };

export interface DeviceRepository {
  initializeDefaults(data: DefaultDeviceData, dataVersion: string): Promise<void>;
  listCameras(): Promise<Camera[]>;
  listLenses(): Promise<Lens[]>;
  saveCamera(camera: Camera): Promise<void>;
  saveLens(lens: Lens): Promise<void>;
  hideDefaultRecord(kind: DeviceKind, id: string): Promise<void>;
  deleteUserRecord(kind: DeviceKind, id: string): Promise<void>;
  resetDefaults(): Promise<void>;
}

function storeName(kind: DeviceKind) { return kind === "camera" ? "cameras" : "lenses"; }

export function createIndexedDbRepository(databaseName = "aoi-lab-fov"): DeviceRepository {
  let databasePromise: Promise<IDBPDatabase> | null = null;
  const database = () => databasePromise ??= openDB(databaseName, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("cameras")) db.createObjectStore("cameras", { keyPath: "id" });
      if (!db.objectStoreNames.contains("lenses")) db.createObjectStore("lenses", { keyPath: "id" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
    },
  });

  return {
    async initializeDefaults(data, dataVersion) {
      const db = await database();
      const tx = db.transaction(["cameras", "lenses", "meta"], "readwrite");
      const cameraStore = tx.objectStore("cameras");
      for (const item of data.cameras) {
        const existing = await cameraStore.get(item.id) as Camera | undefined;
        if (!existing) await cameraStore.put(item);
        else if (!existing.customized) await cameraStore.put({ ...item, hidden: existing.hidden });
      }
      const lensStore = tx.objectStore("lenses");
      for (const item of data.lenses) {
        const existing = await lensStore.get(item.id) as Lens | undefined;
        if (!existing) await lensStore.put(item);
        else if (!existing.customized) await lensStore.put({ ...item, hidden: existing.hidden });
      }
      await tx.objectStore("meta").put({ key: "defaultDataVersion", value: dataVersion });
      await tx.done;
    },
    async listCameras() { return (await database()).getAll("cameras") as Promise<Camera[]>; },
    async listLenses() { return (await database()).getAll("lenses") as Promise<Lens[]>; },
    async saveCamera(camera) { await (await database()).put("cameras", { ...camera, customized: true, updatedAt: new Date().toISOString() }); },
    async saveLens(lens) { await (await database()).put("lenses", { ...lens, customized: true, updatedAt: new Date().toISOString() }); },
    async hideDefaultRecord(kind, id) {
      const db = await database();
      const store = storeName(kind);
      const existing = await db.get(store, id);
      if (!existing) return;
      await db.put(store, { ...existing, hidden: true, customized: true, updatedAt: new Date().toISOString() });
    },
    async deleteUserRecord(kind, id) {
      const db = await database();
      const store = storeName(kind);
      const existing = await db.get(store, id);
      if (existing?.source === "user") await db.delete(store, id);
    },
    async resetDefaults() {
      const db = await database();
      const tx = db.transaction(["cameras", "lenses", "meta"], "readwrite");
      await Promise.all([tx.objectStore("cameras").clear(), tx.objectStore("lenses").clear(), tx.objectStore("meta").clear()]);
      await tx.done;
    },
  };
}

export const indexedDbDeviceRepository = createIndexedDbRepository();
