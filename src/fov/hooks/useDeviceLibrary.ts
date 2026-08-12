"use client";

import { useCallback, useEffect, useState } from "react";
import type { Camera, Lens } from "../domain/types";
import type { DefaultDeviceData, DeviceKind, DeviceRepository } from "../storage/db";

export function useDeviceLibrary(repository: DeviceRepository, defaults: DefaultDeviceData) {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [lenses, setLenses] = useState<Lens[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [nextCameras, nextLenses] = await Promise.all([repository.listCameras(), repository.listLenses()]);
    setCameras(nextCameras.sort((a, b) => `${a.brand}${a.model}`.localeCompare(`${b.brand}${b.model}`, "zh-CN")));
    setLenses(nextLenses.sort((a, b) => `${a.brand}${a.model}`.localeCompare(`${b.brand}${b.model}`, "zh-CN")));
  }, [repository]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await repository.initializeDefaults(defaults, "2026-08-12-camera1135-lens426");
        if (active) await refresh();
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "浏览器本地资料库不可用");
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [defaults, refresh, repository]);

  const saveCamera = async (item: Camera) => { await repository.saveCamera(item); await refresh(); };
  const saveLens = async (item: Lens) => { await repository.saveLens(item); await refresh(); };
  const remove = async (kind: DeviceKind, item: Camera | Lens) => {
    if (item.source === "default") await repository.hideDefaultRecord(kind, item.id);
    else await repository.deleteUserRecord(kind, item.id);
    await refresh();
  };
  const reset = async () => { await repository.resetDefaults(); await repository.initializeDefaults(defaults, "2026-08-12-camera1135-lens426"); await refresh(); };

  return { cameras, lenses, loading, error, refresh, saveCamera, saveLens, remove, reset };
}
