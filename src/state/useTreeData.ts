import { useCallback, useEffect, useState } from "react";
import { COMPANY, VALUES, getValueColor } from "../data/tree";
import type { CompanyDef, TreeData, ValueDef } from "../data/tree";

const STORAGE_KEY = "promise-tree-data-v7";

export interface NodePatch {
  title?: string;
  short?: string;
  description?: string;
  who?: string;
  toWhom?: string;
  metrics?: string;
}

function loadFromStorage(): TreeData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as TreeData;
    data.values = data.values.map((v, i) => ({ ...v, color: getValueColor(i) }));
    return data;
  } catch {
    return null;
  }
}

function saveToStorage(data: TreeData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

function cloneTree(data: TreeData): TreeData {
  return JSON.parse(JSON.stringify(data));
}

export function useTreeData() {
  const [data, setData] = useState<TreeData>(() => {
    const stored = loadFromStorage();
    return stored ?? { company: { ...COMPANY }, values: JSON.parse(JSON.stringify(VALUES)) };
  });

  const [modified, setModified] = useState(() => loadFromStorage() !== null);

  useEffect(() => {
    saveToStorage(data);
    setModified(true);
  }, [data]);

  const updateNode = useCallback((id: string, patch: NodePatch) => {
    setData((prev) => {
      const next = cloneTree(prev);
      if (next.company.id === id) {
        if (patch.title !== undefined) next.company.title = patch.title;
        if (patch.short !== undefined) next.company.short = patch.short;
        if (patch.description !== undefined) next.company.description = patch.description;
        return next;
      }
      for (const v of next.values) {
        if (v.id === id) {
          if (patch.title !== undefined) v.title = patch.title;
          if (patch.short !== undefined) v.short = patch.short;
          if (patch.description !== undefined) v.description = patch.description;
          return next;
        }
        for (const r of v.promises) {
          if (r.id === id) {
            if (patch.title !== undefined) r.title = patch.title;
            if (patch.short !== undefined) r.short = patch.short;
            if (patch.description !== undefined) r.description = patch.description;
            if (patch.who !== undefined) r.who = patch.who || undefined;
            if (patch.toWhom !== undefined) r.toWhom = patch.toWhom || undefined;
            if (patch.metrics !== undefined) r.metrics = patch.metrics || undefined;
            return next;
          }
          for (const s of r.supports) {
            if (s.id === id) {
              if (patch.title !== undefined) s.title = patch.title;
              if (patch.description !== undefined) s.description = patch.description;
              if (patch.who !== undefined) s.who = patch.who || undefined;
              if (patch.toWhom !== undefined) s.toWhom = patch.toWhom || undefined;
              if (patch.metrics !== undefined) s.metrics = patch.metrics || undefined;
              return next;
            }
          }
        }
      }
      return next;
    });
  }, []);

  const updateCompany = useCallback((patch: Partial<CompanyDef>) => {
    setData((prev) => {
      const next = cloneTree(prev);
      if (patch.title !== undefined) next.company.title = patch.title;
      if (patch.short !== undefined) next.company.short = patch.short;
      if (patch.description !== undefined) next.company.description = patch.description;
      if (patch.logo !== undefined) next.company.logo = patch.logo;
      return next;
    });
  }, []);

  const replaceValues = useCallback((values: ValueDef[]) => {
    const valuesWithColors = values.map((v, i) => ({ ...v, color: getValueColor(i) }));
    setData((prev) => ({ ...prev, values: valuesWithColors }));
  }, []);

  const updateNodePosition = useCallback((id: string, x: number, y: number) => {
    setData((prev) => {
      const next = cloneTree(prev);
      if (!next.customPositions) next.customPositions = {};
      next.customPositions[id] = { x, y };
      return next;
    });
  }, []);

  const resetAllPositions = useCallback(() => {
    setData((prev) => {
      const next = cloneTree(prev);
      next.customPositions = undefined;
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setData({ company: { ...COMPANY }, values: JSON.parse(JSON.stringify(VALUES)) });
    setModified(false);
  }, []);

  return { data, modified, updateNode, updateCompany, replaceValues, reset, updateNodePosition, resetAllPositions };
}
