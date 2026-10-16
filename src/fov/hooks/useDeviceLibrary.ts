"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Camera, Lens } from "../domain/types";
import type { DefaultDeviceData, DeviceKind, DeviceRepository } from "../storage/db";

/**
 * 默认数据集版本号：由数据集自身的规模 + id 摘要算出来，而不是手写常量。
 * 手写常量（旧值 "2026-08-12-camera1147-lens426"）的问题是：换了 data/*.json
 * 却忘了改字符串时，本地库就不会刷新；而字符串本身也是"传了就丢"的。
 */
function computeDefaultsVersion(defaults: DefaultDeviceData): string {
  const signature = (items: Array<{ id: string }>) => {
    let hash = 0;
    for (const item of items) {
      for (let i = 0; i < item.id.length; i++) hash = (hash * 31 + item.id.charCodeAt(i)) | 0;
    }
    return `${items.length}.${(hash >>> 0).toString(36)}`;
  };
  return `auto-${signature(defaults.cameras)}-${signature(defaults.lenses)}`;
}

export function useDeviceLibrary(repository: DeviceRepository, defaults: DefaultDeviceData) {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [lenses, setLenses] = useState<Lens[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dataVersion = useMemo(() => computeDefaultsVersion(defaults), [defaults]);

  const refresh = useCallback(async () => {
    const [nextCameras, nextLenses] = await Promise.all([repository.listCameras(), repository.listLenses()]);
    setCameras(nextCameras.sort((a, b) => `${a.brand}${a.model}`.localeCompare(`${b.brand}${b.model}`, "zh-CN")));
    setLenses(nextLenses.sort((a, b) => `${a.brand}${a.model}`.localeCompare(`${b.brand}${b.model}`, "zh-CN")));
  }, [repository]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await repository.initializeDefaults(defaults, dataVersion);
        if (active) await refresh();
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "浏览器本地资料库不可用");
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [defaults, dataVersion, refresh, repository]);

  const saveCamera = async (item: Camera) => { await repository.saveCamera(item); await refresh(); };
  const saveLens = async (item: Lens) => { await repository.saveLens(item); await refresh(); };
  const remove = async (kind: DeviceKind, item: Camera | Lens) => {
    if (item.source === "default") await repository.hideDefaultRecord(kind, item.id);
    else await repository.deleteUserRecord(kind, item.id);
    await refresh();
  };
  const reset = async () => { await repository.resetDefaults(); await repository.initializeDefaults(defaults, dataVersion); await refresh(); };

  return { cameras, lenses, loading, error, refresh, saveCamera, saveLens, remove, reset };
}
