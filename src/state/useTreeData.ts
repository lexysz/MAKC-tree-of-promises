import { useCallback, useEffect, useRef, useState } from "react";
import { createEmptyTree, getValueColor, MAX_TREE_DEPTH } from "../data/tree";
import type { CompanyDef, TreeData, ValueDef, GeneralPromiseDef, SupportDef } from "../data/tree";
import { supabase } from "../lib/supabase";

const STORAGE_KEY = "promise-tree-data-v8";
const SAVE_DEBOUNCE_MS = 500;
/** Окно (мс), в течение которого Realtime игнорирует собственные изменения */
const OWN_UPDATE_WINDOW_MS = 3000;

export type SyncStatus = 'synced' | 'syncing' | 'error';

export interface NodePatch {
  title?: string;
  short?: string;
  description?: string;
  who?: string;
  toWhom?: string;
  metrics?: string;
}

// ─── Helpers ────────────────────────────────────────────────────

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

function cloneTree(data: TreeData): TreeData {
  return structuredClone(data);
}

/**
 * Полная нормализация дерева: гарантирует, что все обязательные поля — строки,
 * а все коллекции — массивы. Защищает от данных, испорченных старыми версиями
 * приложения или некорректным импортом.
 */
function sanitizeTree(data: TreeData): TreeData {
  const str = (value: unknown, fallback = ""): string =>
    typeof value === "string" ? value : fallback;

  /** Рекурсивно нормализует вложенные поддерживающие обещания с лимитом глубины. */
  const sanitizeSupports = (supports: unknown[], depth: number): SupportDef[] => {
    return (Array.isArray(supports) ? supports : [])
      .filter((s) => s && typeof s === "object")
      .map((support) => {
        const s = support as SupportDef;
        s.title = str(s.title);
        s.description = str(s.description, s.title);
        s.supports = depth < MAX_TREE_DEPTH
          ? sanitizeSupports(s.supports ?? [], depth + 1)
          : [];
        // Нормализация extraParentIds: оставляем только валидные строки
        if (Array.isArray(s.extraParentIds)) {
          s.extraParentIds = s.extraParentIds.filter(
            (id): id is string => typeof id === "string" && id.trim() !== ""
          );
          if (s.extraParentIds.length === 0) s.extraParentIds = undefined;
        } else {
          s.extraParentIds = undefined;
        }
        return s;
      });
  };

  if (!data || typeof data !== "object") return createEmptyTree();

  if (!data.company || typeof data.company !== "object") {
    data.company = createEmptyTree().company;
  }

  if (!Array.isArray(data.values)) data.values = [];
  if (!Array.isArray(data.generalPromises)) data.generalPromises = [];

  data.company.title = str(data.company.title);
  data.company.short = str(data.company.short);
  data.company.description = str(data.company.description);

  data.values = data.values.filter((v) => v && typeof v === "object");

  for (const value of data.values) {
    value.title = str(value.title);
    value.short = str(value.short);
    value.description = str(value.description);
    value.color = str(value.color, getValueColor(0));

    if (!Array.isArray(value.promises)) value.promises = [];
    value.promises = value.promises.filter((r) => r && typeof r === "object");

    for (const root of value.promises) {
      root.title = str(root.title);
      root.short = str(root.short, root.title);
      root.description = str(root.description, root.title);
      root.supports = sanitizeSupports(root.supports ?? [], 3);
    }
  }

  data.generalPromises = data.generalPromises.filter((p) => p && typeof p === "object");
  for (const gp of data.generalPromises) {
    gp.title = str(gp.title);
    gp.description = str(gp.description, gp.title);
    gp.who = str(gp.who);
    gp.toWhom = typeof gp.toWhom === "string" ? gp.toWhom : undefined;
    gp.metrics = typeof gp.metrics === "string" ? gp.metrics : undefined;
  }

  return data;
}

/**
 * Удаляет из extraParentIds ссылки на корни ДРУГИХ ценностей.
 * Связь поддерживающего с несколькими корневыми допустима только
 * в пределах одной ценности — иначе линии пересекают всё дерево.
 */
function pruneExtraParentIds(data: TreeData): TreeData {
  const prune = (supports: SupportDef[], validRootIds: Set<string>) => {
    for (const s of supports) {
      if (s.extraParentIds) {
        s.extraParentIds = s.extraParentIds.filter((id) => validRootIds.has(id));
        if (s.extraParentIds.length === 0) s.extraParentIds = undefined;
      }
      if (s.supports) prune(s.supports, validRootIds);
    }
  };

  for (const value of data.values) {
    const valueRootIds = new Set(value.promises.map((r) => r.id));
    for (const root of value.promises) {
      prune(root.supports ?? [], valueRootIds);
    }
  }

  return data;
}

/** Рекурсивно ищет узел поддержки по ID во всех уровнях вложенности. */
function findSupportById(
  supports: SupportDef[] | undefined,
  id: string
): SupportDef | null {
  if (!supports) return null;
  for (const support of supports) {
    if (support.id === id) return support;
    const found = findSupportById(support.supports, id);
    if (found) return found;
  }
  return null;
}

/** Находит узел в дереве по ID (включая вложенные поддерживающие обещания). */
function findNode(data: TreeData, id: string) {
  if (data.company.id === id) return data.company;
  for (const value of data.values) {
    if (value.id === id) return value;
    for (const root of value.promises) {
      if (root.id === id) return root;
      const support = findSupportById(root.supports, id);
      if (support) return support;
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
    return pruneExtraParentIds(reassignColors(sanitizeTree(JSON.parse(raw) as TreeData)));
  } catch {
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
    return pruneExtraParentIds(
      reassignColors(sanitizeTree((data as { data: TreeData }).data))
    );
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
    throw error;
  }
}

// ─── Hook ────────────────────────────────────────────────────────

export function useTreeData() {
  const [data, setData] = useState<TreeData>(createEmptyTree());
  const [modified, setModified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');

  // Отметка времени последнего локального сохранения в Supabase.
  // Используется в Realtime-подписке, чтобы игнорировать эхо собственных изменений.
  const lastLocalSaveRef = useRef<number>(0);

  // Initial load from Supabase (primary source)
  useEffect(() => {
    let isMounted = true;

    (async () => {
      const supabaseData = await loadFromSupabase();
      if (isMounted) {
        // Supabase как основной источник, localStorage как fallback
        const sourceData = supabaseData ?? loadFromStorage() ?? createEmptyTree();
        setData(sourceData);
        setModified(true);
        setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  // ─── Realtime подписка на изменения ─────────────────────────
  useEffect(() => {
    if (loading) return;

    const channel = supabase
      .channel('tree-data-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tree_data',
        },
        async (payload) => {
          // Игнорируем эхо собственных изменений в пределах окна
          const elapsed = Date.now() - lastLocalSaveRef.current;
          if (elapsed < OWN_UPDATE_WINDOW_MS) {
            console.log('Realtime: ignoring own change (elapsed', elapsed, 'ms)');
            return;
          }

          console.log('Realtime update detected:', payload);
          const freshData = await loadFromSupabase();
          if (freshData) {
            setData(freshData);
            saveToStorage(freshData);
            setModified(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loading]);

  // Debounced save on data change
  useEffect(() => {
    if (loading) return;

    const timeoutId = setTimeout(async () => {
      setSyncStatus('syncing');
      try {
        await saveToSupabase(data);
        saveToStorage(data);
        lastLocalSaveRef.current = Date.now();
        setModified(true);
        setSyncStatus('synced');
      } catch (error) {
        console.error('Sync error:', error);
        setSyncStatus('error');
        setTimeout(() => setSyncStatus('synced'), 3000);
      }
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

  const replaceValues = useCallback(
    (values: ValueDef[], generalPromises: GeneralPromiseDef[] = []) => {
      setData((prev) => {
        const next: TreeData = {
          ...prev,
          values: (Array.isArray(values) ? values : []).map((v, i) => ({
            ...v,
            color: getValueColor(i),
          })),
          generalPromises: Array.isArray(generalPromises) ? generalPromises : [],
        };
        // Немедленно сохраняем в localStorage как резервную копию.
        // Supabase запишется через debounce или forceSync.
        saveToStorage(next);
        return next;
      });
    },
    [],
  );

  /**
   * Принудительная немедленная синхронизация (без debounce).
   * Используется, когда нельзя ждать SAVE_DEBOUNCE_MS, например,
   * сразу после импорта Excel — чтобы данные гарантированно попали в Supabase.
   */
  const forceSync = useCallback(async () => {
    setSyncStatus('syncing');
    try {
      await saveToSupabase(data);
      saveToStorage(data);
      lastLocalSaveRef.current = Date.now();
      setModified(true);
      setSyncStatus('synced');
      console.log('Force sync completed');
    } catch (error) {
      console.error('Force sync error:', error);
      setSyncStatus('error');
      setTimeout(() => setSyncStatus('synced'), 3000);
      throw error;
    }
  }, [data]);

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
    syncStatus,
    updateNode,
    updateCompany,
    replaceValues,
    forceSync,
    reset,
    updateNodePosition,
    resetAllPositions,
  };
}
