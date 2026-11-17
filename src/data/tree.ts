export interface CompanyDef {
  id: string;
  title: string;
  short: string;
  description: string;
  logo?: string;
}

export interface SupportDef {
  id: string;
  title: string;
  description: string;
  who?: string;
  toWhom?: string;
  metrics?: string;
  supports?: SupportDef[];
  /** id дополнительных корневых обещаний, которым это обещание также является поддерживающим */
  extraParentIds?: string[];
}

export interface RootDef {
  id: string;
  title: string;
  short: string;
  description: string;
  who?: string;
  toWhom?: string;
  metrics?: string;
  supports: SupportDef[];
}

export interface ValueDef {
  id: string;
  title: string;
  short: string;
  description: string;
  color: string;
  promises: RootDef[];
}

/**
 * Общее (клиентократическое) обещание компании.
 * Не является узлом дерева: отображается списком в карточке компании
 * и участвует в фильтрации по подразделениям.
 */
export interface GeneralPromiseDef {
  id: string;
  title: string;
  description: string;
  who: string;
  toWhom?: string;
  metrics?: string;
  /**
   * Поддерживающие обещания общего обещания. На дереве не отображаются
   * (buildGraph общие обещания не обходит); показываются аккордеоном
   * в карточке общего и read-only в админке. Структура цепочки та же,
   * что у корневого: вложенный массив SupportDef.
   */
  supports?: SupportDef[];
}

export interface TreeData {
  company: CompanyDef;
  values: ValueDef[];
  generalPromises?: GeneralPromiseDef[];
  customPositions?: Record<string, { x: number; y: number }>;
}

export type Tier = "company" | "value" | "root" | "support";

export const TIER_LABEL: Record<Tier, string> = {
  company: "Ядро компании",
  value: "Ценность",
  root: "Корневое обещание",
  support: "Поддерживающее обещание",
};

const GOLDEN_ANGLE = 137.508;

/**
 * Генерирует уникальный цвет для ценности на основе золотого угла.
 */
export function getValueColor(index: number): string {
  const hue = (index * GOLDEN_ANGLE) % 360;
  return `hsl(${hue.toFixed(1)}, 70%, 58%)`;
}

/**
 * Создаёт пустое дерево обещаний (для начального состояния до загрузки данных).
 */
export function createEmptyTree(): TreeData {
  return {
    company: {
      id: "company-core",
      title: "",
      short: "",
      description: "",
    },
    values: [],
    generalPromises: [],
  };
}

/**
 * Максимальная глубина дерева:
 * 0 = company, 1 = value, 2 = root, 3 = support, 4 = support 2-го уровня
 */
export const MAX_TREE_DEPTH = 7;

/**
 * Возвращает глубину узла по типу.
 * Для support-узлов глубина фиксирована — чтобы определить реальную,
 * нужно пройтись по родителям (см. хелперы в компонентах).
 */
export type NodeDepth = 0 | 1 | 2 | 3 | 4;

/**
 * Толерантная нормализация названий для сопоставления строк Excel:
 * unify типографских дефисов (U+2010..U+2015, минус) к '-',
 * неразрывных/узких пробелов к обычному, схлопывание пробелов, trim, lower.
 * Благодаря этому «профит‑тесты» (U+2011) и «профит-тесты» считаются одним названием.
 */
export function normalizeTitle(s: string): string {
  return s
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u00A0\u202F\u2007]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Рекурсивно ищет SupportDef по title во всех уровнях вложенности supports.
 * Используется при связывании цепочек из Excel без ID.
 */
export function findSupportByTitle(
  roots: RootDef[] | undefined,
  title: string
): SupportDef | null {
  if (!roots || !title) return null;
  const normalizedTitle = normalizeTitle(title);

  for (const root of roots) {
    for (const support of root.supports ?? []) {
      if (normalizeTitle(support.title) === normalizedTitle) return support;
      const found = findSupportInSupports(support.supports, title);
      if (found) return found;
    }
  }
  return null;
}

/** Рекурсивный поиск supporting внутри массива supporting (любой уровень). */
export function findSupportInSupports(
  supports: SupportDef[] | undefined,
  title: string
): SupportDef | null {
  if (!supports || !title) return null;
  const normalizedTitle = normalizeTitle(title);

  for (const support of supports) {
    if (normalizeTitle(support.title) === normalizedTitle) return support;
    const found = findSupportInSupports(support.supports, title);
    if (found) return found;
  }
  return null;
}

/** Поиск общего обещания по названию (нормализованному). */
export function findGeneralByTitle(
  generals: GeneralPromiseDef[] | undefined,
  title: string
): GeneralPromiseDef | null {
  if (!generals || !title) return null;
  const normalizedTitle = normalizeTitle(title);
  for (const g of generals) {
    if (normalizeTitle(g.title) === normalizedTitle) return g;
  }
  return null;
}

/**
 * Поиск supporting «везде»: под корневыми обещаниями ценностей И под общими
 * обещаниями (рекурсивно). Нужен, чтобы цепочки «общее → supporting → supporting»
 * находили родителя на любом уровне.
 */
export function findSupportAnywhere(
  values: ValueDef[],
  generals: GeneralPromiseDef[] | undefined,
  title: string
): SupportDef | null {
  const viaRoots = findSupportByTitle(values, title);
  if (viaRoots) return viaRoots;
  for (const g of generals ?? []) {
    const found = findSupportInSupports(g.supports, title);
    if (found) return found;
  }
  return null;
}
