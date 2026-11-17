import { useEffect, useRef, useState } from "react";
import {
  loadTreeFromGitHub,
  saveTreeToGitHub,
  loadLogoFromGitHub,
} from "../lib/github";
import type { TreeData } from "../data/tree";
import { createEmptyTree } from "../data/tree";

const STORAGE_KEY = "makc-tree-data";
// Пауза после последней правки перед автосинхронизацией в GitHub.
const AUTO_SYNC_DELAY_MS = 900;

export type SyncStatus = "synced" | "syncing" | "error" | "offline";

function loadFromStorage(): TreeData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TreeData;
  } catch {
    return null;
  }
}

function saveToStorage(data: TreeData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("Failed to save to localStorage:", e);
  }
}

export function useTreeData() {
  const [data, setData] = useState<TreeData>(() => {
    const cached = loadFromStorage();
    return cached ?? createEmptyTree();
  });
  const [modified, setModified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("synced");

  // Актуальные снимки для debounce/flush-синхронизации (без stale-замыканий).
  const dataRef = useRef(data);
  const modifiedRef = useRef(modified);
  const syncTimerRef = useRef<number | null>(null);
  dataRef.current = data;
  modifiedRef.current = modified;

  const forceSync = async (): Promise<void> => {
    try {
      setSyncStatus("syncing");
      await saveTreeToGitHub(dataRef.current);
      setSyncStatus("synced");
      setModified(false);
    } catch (e) {
      console.error("Failed to sync to GitHub:", e);
      setSyncStatus("error");
    }
  };

  const scheduleSync = (): void => {
    if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = null;
      void forceSync();
    }, AUTO_SYNC_DELAY_MS);
  };

  // Initial load from GitHub (background sync): облачные позиции/правки
  // становятся источником истины для всех пользователей.
  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        setSyncStatus("syncing");
        const githubData = await loadTreeFromGitHub();
        if (!isMounted) return;

        if (githubData) {
          setData(githubData);
          saveToStorage(githubData);
          setModified(false);
        }

        const logo = await loadLogoFromGitHub();
        if (logo && isMounted) {
          setData((prev) => ({
            ...prev,
            company: { ...prev.company, logo },
          }));
        }

        setSyncStatus("synced");
      } catch (e) {
        console.error("Failed to load from GitHub:", e);
        if (isMounted) setSyncStatus("offline");
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  // Flush при закрытии/скрытии вкладки: не теряем последние drag-позиции.
  useEffect(() => {
    const flush = () => {
      if (modifiedRef.current) {
        void saveTreeToGitHub(dataRef.current, true);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current);
    };
  }, []);

  const updateNode = (nodeId: string, updates: any) => {
    setData((prev) => {
      const newData = JSON.parse(JSON.stringify(prev)) as TreeData;
      for (const value of newData.values) {
        for (const promise of value.promises) {
          if (promise.id === nodeId) {
            Object.assign(promise, updates);
            break;
          }
          if (promise.supports) {
            for (const support of promise.supports) {
              if (support.id === nodeId) {
                Object.assign(support, updates);
                break;
              }
            }
          }
        }
      }
      saveToStorage(newData);
      setModified(true);
      scheduleSync();
      return newData;
    });
  };

  const updateCompany = (updates: Partial<TreeData["company"]>) => {
    setData((prev) => {
      const newData = { ...prev, company: { ...prev.company, ...updates } };
      saveToStorage(newData);
      setModified(true);
      scheduleSync();
      return newData;
    });
  };

  const updateGeneralPromise = (id: string, updates: any) => {
    setData((prev) => {
      const newData = JSON.parse(JSON.stringify(prev)) as TreeData;
      const idx = newData.generalPromises.findIndex((p) => p.id === id);
      if (idx !== -1) {
        Object.assign(newData.generalPromises[idx], updates);
        saveToStorage(newData);
        setModified(true);
        scheduleSync();
      }
      return newData;
    });
  };

  const replaceValues = (values: TreeData["values"], generalPromises: TreeData["generalPromises"]) => {
    setData((prev) => {
      const newData = { ...prev, values, generalPromises };
      saveToStorage(newData);
      setModified(true);
      scheduleSync();
      return newData;
    });
  };

  const reset = () => {
    const empty = createEmptyTree();
    setData(empty);
    saveToStorage(empty);
    setModified(true);
    scheduleSync();
  };

  const updateNodePosition = (nodeId: string, x: number, y: number) => {
    setData((prev) => {
      const newData = JSON.parse(JSON.stringify(prev)) as TreeData;
      if (!newData.customPositions) newData.customPositions = {};
      newData.customPositions[nodeId] = { x, y };
      saveToStorage(newData);
      setModified(true);
      scheduleSync();
      return newData;
    });
  };

  const resetAllPositions = () => {
    setData((prev) => {
      const newData = { ...prev, customPositions: {} };
      saveToStorage(newData);
      setModified(true);
      scheduleSync();
      return newData;
    });
  };

  return {
    data,
    modified,
    loading,
    syncStatus,
    updateNode,
    updateCompany,
    updateGeneralPromise,
    replaceValues,
    forceSync,
    reset,
    updateNodePosition,
    resetAllPositions,
  };
}
