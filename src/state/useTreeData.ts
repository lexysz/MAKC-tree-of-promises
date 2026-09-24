import { useCallback, useEffect, useState } from "react";
import { createEmptyTree, getValueColor } from "../data/tree";
import type { CompanyDef, TreeData, ValueDef } from "../data/tree";
import { supabase } from "../lib/supabase";

const STORAGE_KEY = "promise-tree-data-v7";
const SAVE_DEBOUNCE_MS = 500;

export interface NodePatch {
  title?: string;
  short?: string;
  description?: string;
  who?: string;
  toWhom?: string;
  metrics?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Применяет поля из patch к целевому объекту, игнорируя undefined.
/** Поля, в которых пустая строка означает «значения нет» и хранится как undefined */
const OPTIONAL_TEXT_FIELDS = new Set(["who", "toWhom", "metrics"]);

function applyPatch<T extends object>(target: T, patch: Partial<T>): void {
  (Object.keys(patch) as Array<keyof T>).forEach((key) => {
    const value = patch[key];
    if (value === undefined) return;
    const isEmptyOptional =
      typeof value === "string" && value === "" && OPTIONAL_TEXT_FIELDS.has(key as string);
    target[key] = (isEmptyOptional ? undefined : value) as T[keyof T];
  });
}
/**
 * Восстанавливает обязательные строковые поля, если в данных оказался undefined
 * (защищает от записей, сохранённых предыдущими версиями приложения).
 */
function sanitizeTree(data: TreeData): TreeData {
  const str = (value: string | undefined, fallback = ""): string =>
    typeof value === "string" ? value : fallback;

  data.company.title = str(data.company.title);
  data.company.short = str(data.company.short);
  data.company.description = str(data.company.description);

  for (const value of data.values) {
    value.title = str(value.title);
    value.short = str(value.short);
    value.description = str(value.description);

    for (const root of value.promises) {
      root.title = str(root.title);
      root.short = str(root.short, root.title);
      root.description = str(root.description, root.title);

      for (const support of root.supports) {
        support.title = str(support.title);
        support.description = str(support.description, support.title);
      }
    }
  }

  return data;
}
/** Находит узел в дереве по ID. */
function findNode(data: TreeData, id: string) {
  if (data.company.id === id) return data.company;

  for (const value of data.values) {
    if (value.id === id) return value;
    for (const root of value.promises) {
      if (root.id === id) return root;
      for (const support of root.supports) {
        if (support.id === id) return support;
      }
    }
  }
  return null;
}

/** Пересчитывает цвета ценностей на основе их порядка. */
function reassignColors(data: TreeData): TreeData {
  return {
    ...data,
    values: data.values.map((v, i) => ({ ...v, color: getValueColor(i) })),
  };
}

// ─── Persistence ─────────────────────────────────────────────────

function loadFromStorage(): TreeData | null {
  try {
       const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return reassignColors(sanitizeTree(JSON.parse(raw) as TreeData));
  } catch {
    // localStorage недоступен или повреждён
    return null;
  }
}

function saveToStorage(data: TreeData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage переполнен или недоступен — игнорируем
  }
}

async function loadFromSupabase(): Promise<TreeData | null> {
  try {
    const { data, error } = await supabase
      .from("tree_data")
      .select("data")
      .order("id", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;
    return reassignColors(sanitizeTree((data as { data: TreeData }).data));
  } catch (error) {
    console.error("Error loading from Supabase:", error);
    return null;
  }
}

async function saveToSupabase(data: TreeData): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from("tree_data")
      .select("id")
      .limit(1);

    if (existing && existing.length > 0) {
      await supabase
        .from("tree_data")
        .update({ data, updated_at: new Date().toISOString() })
        .eq("id", existing[0].id);
    } else {
      await supabase.from("tree_data").insert({ data });
    }
  } catch (error) {
    console.error("Error saving to Supabase:", error);
  }
}

// ─── Hook ────────────────────────────────────────────────────────

export function useTreeData() {
  const [data, setData] = useState<TreeData>(
    () => loadFromStorage() ?? createEmptyTree(),
  );
  const [modified, setModified] = useState(false);
  const [loading, setLoading] = useState(true);

  // Initial load from Supabase
  useEffect(() => {
    let isMounted = true;

    (async () => {
      const supabaseData = await loadFromSupabase();
      if (isMounted && supabaseData) {
        setData(supabaseData);
        setModified(true);
      }
      if (isMounted) setLoading(false);
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  // Debounced save on data change
  useEffect(() => {
    if (loading) return;

    const timeoutId = setTimeout(() => {
      saveToSupabase(data);
      saveToStorage(data);
      setModified(true);
    }, SAVE_DEBOUNCE_MS);

    return () => clearTimeout(timeoutId);
  }, [data, loading]);

  const updateNode = useCallback((id: string, patch: NodePatch) => {
    setData((prev) => {
      const next = cloneTree(prev);
      const node = findNode(next, id);
      if (node) applyPatch(node, patch);
      return next;
    });
  }, []);

  const updateCompany = useCallback((patch: Partial<CompanyDef>) => {
    setData((prev) => {
      const next = cloneTree(prev);
      applyPatch(next.company, patch);
      return next;
    });
  }, []);

  const replaceValues = useCallback((values: ValueDef[]) => {
    setData((prev) => ({
      ...prev,
      values: values.map((v, i) => ({ ...v, color: getValueColor(i) })),
    }));
  }, []);

  const updateNodePosition = useCallback((id: string, x: number, y: number) => {
    setData((prev) => {
      const next = cloneTree(prev);
      next.customPositions ??= {};
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
    setData(createEmptyTree());
    setModified(false);
  }, []);

  return {
    data,
    modified,
    loading,
    updateNode,
    updateCompany,
    replaceValues,
    reset,
    updateNodePosition,
    resetAllPositions,
  };
}
