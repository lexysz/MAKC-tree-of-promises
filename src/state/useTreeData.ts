import { useEffect, useRef, useState } from "react";
import {
  loadTreeFromGitHub,
  saveTreeToGitHub,
  loadLogoFromGitHub,
} from "../lib/github";
import type { TreeData } from "../data/tree";
import { createEmptyTree } from "../data/tree";
import { pruneExtraParentIds, reassignColors, sanitizeTree } from "../data/tree";

const STORAGE_KEY = "makc-tree-data";

export type SyncStatus = "synced" | "syncing" | "error" | "offline";

function loadFromStorage(): TreeData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return pruneExtraParentIds(
      reassignColors(sanitizeTree(JSON.parse(raw) as TreeData))
    );
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

  const lastLocalSaveRef = useRef<number>(0);

  // Initial load from GitHub (background sync)
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
          setModified(true);
        }

        // Также пробуем подтянуть логотип, если он есть в GitHub
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
        if (isMounted) {
          setSyncStatus("offline");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const updateNode = (nodeId: string, updates: Partial<TreeData["values"][0]["promises"][0]>) => {
    setData((prev) => {
      const newData = JSON.parse(JSON.stringify(prev)) as TreeData;
      // Находим узел и обновляем (упрощённо — полный перебор)
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
      return newData;
    });
  };

  const updateCompany = (updates: Partial<TreeData["company"]>) => {
    setData((prev) => {
      const newData = {
        ...prev,
        company: { ...prev.company, ...updates },
      };
      saveToStorage(newData);
      setModified(true);
      return newData;
    });
  };

  const updateGeneralPromise = (id: string, updates: Partial<TreeData["generalPromises"][0]>) => {
    setData((prev) => {
      const newData = JSON.parse(JSON.stringify(prev)) as TreeData;
      const idx = newData.generalPromises.findIndex((p) => p.id === id);
      if (idx !== -1) {
        Object.assign(newData.generalPromises[idx], updates);
        saveToStorage(newData);
        setModified(true);
      }
      return newData;
    });
  };

  const replaceValues = (values: TreeData["values"], generalPromises: TreeData["generalPromises"]) => {
    setData((prev) => {
      const newData = { ...prev, values, generalPromises };
      saveToStorage(newData);
      setModified(true);
      return newData;
    });
  };

  const forceSync = async () => {
    try {
      setSyncStatus("syncing");
      lastLocalSaveRef.current = Date.now();
      await saveTreeToGitHub(data);
      setSyncStatus("synced");
      setModified(false);
    } catch (e) {
      console.error("Failed to sync to GitHub:", e);
      setSyncStatus("error");
    }
  };

  const reset = () => {
    const empty = createEmptyTree();
    setData(empty);
    saveToStorage(empty);
    setModified(true);
  };

  const updateNodePosition = (nodeId: string, x: number, y: number) => {
    setData((prev) => {
      const newData = JSON.parse(JSON.stringify(prev)) as TreeData;
      if (!newData.customPositions) newData.customPositions = {};
      newData.customPositions[nodeId] = { x, y };
      saveToStorage(newData);
      setModified(true);
      return newData;
    });
  };

  const resetAllPositions = () => {
    setData((prev) => {
      const newData = { ...prev, customPositions: {} };
      saveToStorage(newData);
      setModified(true);
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
