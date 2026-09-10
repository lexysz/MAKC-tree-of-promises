import { useCallback, useEffect, useState } from "react";
import type { CompanyDef, TreeData, ValueDef, GeneralDef } from "../data/tree";
import { COMPANY, VALUES, GENERAL_PROMISES } from "../data/tree";
import { supabase } from "../lib/supabase";

export interface NodePatch {
  title?: string;
  short?: string;
  description?: string;
  who?: string;
  toWhom?: string;
  metrics?: string;
}

function cloneTree(data: TreeData): TreeData {
  return JSON.parse(JSON.stringify(data));
}

const STORAGE_KEY = "makc-tree-of-promises-data";

function loadData(): TreeData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as TreeData;
      // Убедимся, что поле существует
      if (!parsed.generalPromises) {
        parsed.generalPromises = GENERAL_PROMISES;
      }
      return parsed;
    }
  } catch (e) {
    console.warn("Не удалось загрузить данные из localStorage:", e);
  }
  return {
    company: COMPANY,
    values: VALUES,
    generalPromises: GENERAL_PROMISES,
  };
}

function saveData(data: TreeData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("Не удалось сохранить данные в localStorage:", e);
  }
}

export function useTreeData() {
  const [data, setData] = useState<TreeData>(loadData);
  const [modified, setModified] = useState(false);
  const [loading, setLoading] = useState(true);

  // Загрузка данных из Supabase при монтировании
  useEffect(() => {
    async function fetchFromSupabase() {
      try {
        const { data: rows, error } = await supabase
          .from("tree_data")
          .select("*")
          .eq("id", "main")
          .single();

        if (!error && rows?.data) {
          const parsed = JSON.parse(rows.data) as TreeData;
          if (!parsed.generalPromises) {
            parsed.generalPromises = GENERAL_PROMISES;
          }
          setData(parsed);
        }
      } catch (e) {
        console.warn("Ошибка загрузки из Supabase:", e);
      } finally {
        setLoading(false);
      }
    }

    fetchFromSupabase();
  }, []);

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
    setModified(true);
  }, []);

  const updateCompany = useCallback((patch: Partial<CompanyDef>) => {
    setData((prev) => {
      const next = cloneTree(prev);
      next.company = { ...next.company, ...patch };
      return next;
    });
    setModified(true);
  }, []);

  const replaceValues = useCallback((values: ValueDef[]) => {
    setData((prev) => ({ ...prev, values }));
    setModified(true);
  }, []);

  // НОВОЕ: обновление общих обещаний
  const updateGeneralPromises = useCallback((promises: GeneralDef[]) => {
    setData((prev) => ({ ...prev, generalPromises: promises }));
    setModified(true);
  }, []);

  const reset = useCallback(() => {
    setData({
      company: COMPANY,
      values: VALUES,
      generalPromises: GENERAL_PROMISES,
    });
    setModified(true);
  }, []);

  const updateNodePosition = useCallback((id: string, x: number, y: number) => {
    setData((prev) => {
      const next = cloneTree(prev);
      next.customPositions = next.customPositions || {};
      next.customPositions[id] = { x, y };
      return next;
    });
    setModified(true);
  }, []);

  const resetAllPositions = useCallback(() => {
    setData((prev) => {
      const next = cloneTree(prev);
      delete next.customPositions;
      return next;
    });
    setModified(true);
  }, []);

  const save = useCallback(async () => {
    saveData(data);
    try {
      await supabase.from("tree_data").upsert({
        id: "main",
        data: JSON.stringify(data),
        updated_at: new Date().toISOString(),
      });
      setModified(false);
    } catch (e) {
      console.warn("Ошибка сохранения в Supabase:", e);
    }
  }, [data]);

  return {
    data,
    modified,
    loading,
    updateNode,
    updateCompany,
    replaceValues,
    updateGeneralPromises,
    reset,
    updateNodePosition,
    resetAllPositions,
    save,
  };
}
