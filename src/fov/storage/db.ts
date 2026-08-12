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

type DeviceStoreName = "cameras" | "lenses";
type StoreName = DeviceStoreName | "meta";

function storeName(kind: DeviceKind): DeviceStoreName {
  return kind === "camera" ? "cameras" : "lenses";
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB 请求失败")), { once: true });
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("IndexedDB 事务已中止")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error ?? new Error("IndexedDB 事务失败")), { once: true });
  });
}

function openDatabase(databaseName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.addEventListener("upgradeneeded", () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("cameras")) db.createObjectStore("cameras", { keyPath: "id" });
      if (!db.objectStoreNames.contains("lenses")) db.createObjectStore("lenses", { keyPath: "id" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
    });
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error ?? new Error("无法打开 IndexedDB")), { once: true });
  });
}

async function getAll<T>(db: IDBDatabase, store: StoreName): Promise<T[]> {
  const tx = db.transaction(store, "readonly");
  const done = transactionDone(tx);
  const result = await requestResult(tx.objectStore(store).getAll());
  await done;
  return result as T[];
}

async function getById<T>(db: IDBDatabase, store: DeviceStoreName, id: string): Promise<T | undefined> {
  const tx = db.transaction(store, "readonly");
  const done = transactionDone(tx);
  const result = await requestResult(tx.objectStore(store).get(id));
  await done;
  return result as T | undefined;
}

async function putValue(db: IDBDatabase, store: DeviceStoreName, value: Camera | Lens): Promise<void> {
  const tx = db.transaction(store, "readwrite");
  const done = transactionDone(tx);
  tx.objectStore(store).put(value);
  await done;
}

async function deleteValue(db: IDBDatabase, store: DeviceStoreName, id: string): Promise<void> {
  const tx = db.transaction(store, "readwrite");
  const done = transactionDone(tx);
  tx.objectStore(store).delete(id);
  await done;
}

export function createIndexedDbRepository(databaseName = "aoi-lab-fov"): DeviceRepository {
  let databasePromise: Promise<IDBDatabase> | null = null;
  const database = () => databasePromise ??= openDatabase(databaseName);

  return {
    async initializeDefaults(data, dataVersion) {
      const db = await database();
      const [existingCameras, existingLenses] = await Promise.all([
        getAll<Camera>(db, "cameras"),
        getAll<Lens>(db, "lenses"),
      ]);
      const camerasById = new Map(existingCameras.map((item) => [item.id, item]));
      const lensesById = new Map(existingLenses.map((item) => [item.id, item]));

      const tx = db.transaction(["cameras", "lenses", "meta"], "readwrite");
      const done = transactionDone(tx);
      const cameraStore = tx.objectStore("cameras");
      const lensStore = tx.objectStore("lenses");
      for (const item of data.cameras) {
        const existing = camerasById.get(item.id);
        if (!existing) cameraStore.put(item);
        else if (!existing.customized) cameraStore.put({ ...item, hidden: existing.hidden });
      }
      for (const item of data.lenses) {
        const existing = lensesById.get(item.id);
        if (!existing) lensStore.put(item);
        else if (!existing.customized) lensStore.put({ ...item, hidden: existing.hidden });
      }
      tx.objectStore("meta").put({ key: "defaultDataVersion", value: dataVersion });
      await done;
    },

    async listCameras() {
      return getAll<Camera>(await database(), "cameras");
    },

    async listLenses() {
      return getAll<Lens>(await database(), "lenses");
    },

    async saveCamera(camera) {
      await putValue(await database(), "cameras", { ...camera, customized: true, updatedAt: new Date().toISOString() });
    },

    async saveLens(lens) {
      await putValue(await database(), "lenses", { ...lens, customized: true, updatedAt: new Date().toISOString() });
    },

    async hideDefaultRecord(kind, id) {
      const db = await database();
      const store = storeName(kind);
      const existing = await getById<Camera | Lens>(db, store, id);
      if (existing) await putValue(db, store, { ...existing, hidden: true, customized: true, updatedAt: new Date().toISOString() });
    },

    async deleteUserRecord(kind, id) {
      const db = await database();
      const store = storeName(kind);
      const existing = await getById<Camera | Lens>(db, store, id);
      if (existing?.source === "user") await deleteValue(db, store, id);
    },

    async resetDefaults() {
      const db = await database();
      const tx = db.transaction(["cameras", "lenses", "meta"], "readwrite");
      const done = transactionDone(tx);
      tx.objectStore("cameras").clear();
      tx.objectStore("lenses").clear();
      tx.objectStore("meta").clear();
      await done;
    },
  };
}

export const indexedDbDeviceRepository = createIndexedDbRepository();
