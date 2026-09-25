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
