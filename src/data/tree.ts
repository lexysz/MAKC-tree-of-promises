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
export const MAX_TREE_DEPTH = 4;

/**
 * Возвращает глубину узла по типу.
 * Для support-узлов глубина фиксирована — чтобы определить реальную,
 * нужно пройтись по родителям (см. хелперы в компонентах).
 */
export type NodeDepth = 0 | 1 | 2 | 3 | 4;

/**
 * Рекурсивно ищет SupportDef по title во всех уровнях вложенности supports.
 * Используется при связывании цепочек из Excel без ID.
 */
export function findSupportByTitle(
  roots: RootDef[] | undefined,
  title: string
): SupportDef | null {
  if (!roots || !title) return null;
  const normalizedTitle = title.trim().toLowerCase();

  for (const root of roots) {
    for (const support of root.supports ?? []) {
      if (support.title.trim().toLowerCase() === normalizedTitle) return support;
      const found = findSupportInSupports(support.supports, title);
      if (found) return found;
    }
  }
  return null;
}

function findSupportInSupports(
  supports: SupportDef[] | undefined,
  title: string
): SupportDef | null {
  if (!supports || !title) return null;
  const normalizedTitle = title.trim().toLowerCase();

  for (const support of supports) {
    if (support.title.trim().toLowerCase() === normalizedTitle) return support;
    const found = findSupportInSupports(support.supports, title);
    if (found) return found;
  }
  return null;
}
