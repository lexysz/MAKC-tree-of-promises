import * as XLSX from "xlsx";
import { getValueColor } from "../data/tree";
import type { RootDef, ValueDef } from "../data/tree";

export interface ImportResult {
  values: ValueDef[];
  warnings: string[];
  stats: {
    rows: number;
    values: number;
    roots: number;
    supports: number;
  };
}

export const TEMPLATE_HEADERS = [
  "Кто дает обещание (команда)",
  "Кому (клиент, команда, роль)",
  "ЦЕННОСТЬ",
  "Корневое обещание",
  "Метрики",
  "Поддерживающее обещание",
  "Кто дает",
  "Кому",
  "Метрики",
];

type FieldKey =
  | "whoRoot"
  | "toWhomRoot"
  | "value"
  | "root"
  | "rootMetrics"
  | "support"
  | "whoSupport"
  | "toWhomSupport"
  | "supportMetrics";

interface ColumnMap {
  whoRoot?: number;
  toWhomRoot?: number;
  value?: number;
  root?: number;
  rootMetrics?: number;
  support?: number;
  whoSupport?: number;
  toWhomSupport?: number;
  supportMetrics?: number;
}

interface CarryValues {
  whoRoot: string;
  toWhomRoot: string;
  value: string;
  root: string;
  rootMetrics: string;
}

interface RowData {
  whoRoot: string;
  toWhomRoot: string;
  valueName: string;
  rootTitle: string;
  rootMetrics: string;
  supportTitle: string;
  whoSupport: string;
  toWhomSupport: string;
  supportMetrics: string;
}

const HEADER_RULES: Array<{ key: FieldKey; test: (h: string) => boolean }> = [
  { key: "support", test: (h) => h.includes("поддерж") && !h.includes("кто") && !h.includes("кому") },
  { key: "root", test: (h) => h.includes("корнев") },
  { key: "whoSupport", test: (h) => h.includes("кто") && h.includes("дает") && !h.includes("команд") },
  { key: "toWhomSupport", test: (h) => h.includes("кому") && !h.includes("клиент") },
  { key: "supportMetrics", test: (h) => h.includes("метри") && !h.includes("корнев") },
  { key: "whoRoot", test: (h) => h.includes("кто") && (h.includes("команд") || h.includes("дает")) },
  { key: "toWhomRoot", test: (h) => h.includes("кому") && (h.includes("клиент") || h.includes("рол")) },
  { key: "value", test: (h) => h.includes("ценност") },
  { key: "rootMetrics", test: (h) => h.includes("метри") },
];

// ─── Helpers ─────────────────────────────────────────────────────

function slugify(text: string): string {
  const cyrillicMap: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh",
    з: "z", и: "i", й: "y", л: "l", м: "m", н: "n", о: "o", п: "p",
    р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch",
    ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };

  return text
    .toLowerCase()
    .replace(/[а-яё]/g, (char) => cyrillicMap[char] || char)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

function cellStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).replace(/\r?\n/g, " ").trim();
}

function normHeader(s: string): string {
  return s.toLowerCase().replace(/[^a-zа-яё0-9]/g, "");
}

// ─── Header Detection ────────────────────────────────────────────

function detectHeaders(rows: unknown[][]): { headerIdx: number; columnMap: ColumnMap } {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i];
    if (!row) continue;

    const map: Partial<ColumnMap> = {};
    row.forEach((cell, idx) => {
      const h = normHeader(cellStr(cell));
      if (!h) return;

      const rule = HEADER_RULES.find((r) => !(r.key in map) && r.test(h));
      if (rule) {
        (map as ColumnMap)[rule.key] = idx;
      }
    });

    const detectedCount = Object.keys(map).length;
    if (detectedCount >= 3) {
      return { headerIdx: i, columnMap: map as ColumnMap };
    }
  }

  throw new Error("Не найдена строка заголовков. Проверьте названия колонок.");
}

// ─── Row Processing ──────────────────────────────────────────────

function extractRowData(row: unknown[], columnMap: ColumnMap, carry: CarryValues): RowData {
  const get = (key: FieldKey): string => {
    const idx = columnMap[key];
    return idx !== undefined ? cellStr(row[idx]) : "";
  };

  const whoRoot = get("whoRoot") || carry.whoRoot;
  const toWhomRoot = get("toWhomRoot") || carry.toWhomRoot;
  const valueName = get("value") || carry.value;
  const rootTitle = get("root") || carry.root;
  const rootMetrics = get("rootMetrics") || carry.rootMetrics;

  return {
    whoRoot,
    toWhomRoot,
    valueName,
    rootTitle,
    rootMetrics,
    supportTitle: get("support"),
    whoSupport: get("whoSupport"),
    toWhomSupport: get("toWhomSupport"),
    supportMetrics: get("supportMetrics"),
  };
}

function updateCarry(carry: CarryValues, row: unknown[], columnMap: ColumnMap): void {
  const get = (key: FieldKey): string => {
    const idx = columnMap[key];
    return idx !== undefined ? cellStr(row[idx]) : "";
  };

  if (get("whoRoot")) carry.whoRoot = get("whoRoot");
  if (get("toWhomRoot")) carry.toWhomRoot = get("toWhomRoot");
  if (get("value")) carry.value = get("value");
  if (get("root")) carry.root = get("root");
  if (get("rootMetrics")) carry.rootMetrics = get("rootMetrics");
}

// ─── Conflict Resolution ─────────────────────────────────────────

function resolveRootConflict(
  root: RootDef,
  oldValue: ValueDef,
  newValue: ValueDef,
  rootTitle: string,
  warnings: string[],
): void {
  const oldCount = oldValue.promises.length;
  const newCount = newValue.promises.length;

  if (newCount < oldCount) {
    // Перемещаем в новую ценность, если там меньше обещаний
    oldValue.promises = oldValue.promises.filter((p) => p.id !== root.id);
    newValue.promises.push(root);
    warnings.push(
      `Обещание "${rootTitle}" перемещено из "${oldValue.title}" (${oldCount}) в "${newValue.title}" (${newCount + 1})`
    );
  } else if (newCount === oldCount) {
    warnings.push(
      `Обещание "${rootTitle}" уже есть в "${oldValue.title}" (${oldCount}). Оставлено там (количество равно).`
    );
  } else {
    warnings.push(
      `Обещание "${rootTitle}" уже есть в "${oldValue.title}" (${oldCount}). Оставлено там (в "${newValue.title}" больше: ${newCount}).`
    );
  }
}

// ─── Main Parsing Logic ──────────────────────────────────────────

export async function parseWorkbook(file: File): Promise<ImportResult> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[][]>(sheet, { header: 1 });

  const warnings: string[] = [];
  const valuesMap = new Map<string, ValueDef>();
  const rootsMap = new Map<string, RootDef>();
  const rootToValue = new Map<string, string>();

  const stats = { rows: 0, values: 0, roots: 0, supports: 0 };

  // Detect headers
  const { headerIdx, columnMap } = detectHeaders(rows);

  // Carry values for merged cells
  const carry: CarryValues = {
    whoRoot: "",
    toWhomRoot: "",
    value: "",
    root: "",
    rootMetrics: "",
  };

  // Process data rows
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    stats.rows++;
    updateCarry(carry, row, columnMap);

    const data = extractRowData(row, columnMap, carry);

    // Skip empty rows
    if (!data.valueName && !data.rootTitle && !data.supportTitle) {
      continue;
    }

    // Validate value name
    if (!data.valueName) {
      warnings.push(`Строка ${i + 1}: отсутствует ценность`);
      continue;
    }

    // Get or create value
    let value = valuesMap.get(data.valueName);
    if (!value) {
      value = {
        id: `v-${slugify(data.valueName)}`,
        title: data.valueName,
        short: data.valueName,
        description: `Ценность: ${data.valueName}`,
        color: getValueColor(valuesMap.size),
        promises: [],
      };
      valuesMap.set(data.valueName, value);
      stats.values++;
    }

    // Validate root title
    if (!data.rootTitle) {
      if (data.supportTitle) {
        warnings.push(`Строка ${i + 1}: поддерживающее без корневого`);
      }
      continue;
    }

    // Get or create root promise
    let root = rootsMap.get(data.rootTitle);
    if (!root) {
      root = {
        id: `r-${slugify(data.rootTitle)}`,
        title: data.rootTitle,
        short: data.rootTitle,
        description: `Обещание: ${data.rootTitle}`,
        who: data.whoRoot || undefined,
        toWhom: data.toWhomRoot || undefined,
        metrics: data.rootMetrics || undefined,
        supports: [],
      };
      rootsMap.set(data.rootTitle, root);
      value.promises.push(root);
      rootToValue.set(data.rootTitle, data.valueName);
      stats.roots++;
    } else {
      // Handle conflict: root already exists in another value
      const existingValueName = rootToValue.get(data.rootTitle);
      if (existingValueName && existingValueName !== data.valueName) {
        const existingValue = valuesMap.get(existingValueName);
        if (existingValue) {
          resolveRootConflict(root, existingValue, value, data.rootTitle, warnings);
        }
      }
    }

    // Add support promise if present
    if (data.supportTitle) {
      root.supports.push({
        id: `s-${slugify(data.supportTitle)}-${root.supports.length}`,
        title: data.supportTitle,
        description: `Поддерживающее: ${data.supportTitle}`,
        who: data.whoSupport || undefined,
        toWhom: data.toWhomSupport || undefined,
        metrics: data.supportMetrics || undefined,
      });
      stats.supports++;
    }
  }

  return {
    values: Array.from(valuesMap.values()),
    warnings,
    stats,
  };
}

// ─── Template Download ───────────────────────────────────────────

export function downloadTemplate(): void {
  const sampleData = [
    [
      "Команда продукта",
      "Клиенты B2B",
      "Надёжность",
      "Стабильность важнее новых функций",
      "Аптайм ≥ 99.9%",
      "Ежемесячный отчёт о стабильности",
      "Команда продукта",
      "Клиенты",
      "Отчёт до 5 числа",
    ],
    ["", "", "", "", "", "Резервные копии каждые 6 часов", "Инфраструктура", "Клиенты", "RPO ≤ 6ч"],
    [
      "Аккаунт-команда",
      "Действующие клиенты",
      "Скорость",
      "Ответ клиенту — в течение рабочего дня",
      "Первый ответ ≤ 2 часов",
      "",
      "",
      "",
      "",
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...sampleData]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Обещания");
  XLSX.writeFile(wb, "шаблон_обещаний.xlsx");
}
