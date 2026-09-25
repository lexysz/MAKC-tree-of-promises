import * as XLSX from "xlsx";
import { getValueColor } from "../data/tree";
import type { GeneralPromiseDef, RootDef, ValueDef } from "../data/tree";

export interface ImportResult {
  values: ValueDef[];
  generalPromises: GeneralPromiseDef[];
  warnings: string[];
  stats: {
    rows: number;
    values: number;
    roots: number;
    supports: number;
    general: number;
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

export const GENERAL_TEMPLATE_HEADERS = [
  "Общее обещание",
  "Описание",
  "Кто дает",
  "Кому",
  "Метрики",
];

export function downloadTemplate() {
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

  const generalSampleData = [
    [
      "Выплата за 24 часа после подачи документов",
      "Гарантированный срок выплаты по любому страховому случаю",
      "Урегулирование, Финансы",
      "Все клиенты",
      "95% выплат в течение 24 часов",
    ],
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...sampleData]);
  XLSX.utils.book_append_sheet(wb, ws, "Обещания");
  const wsGeneral = XLSX.utils.aoa_to_sheet([GENERAL_TEMPLATE_HEADERS, ...generalSampleData]);
  XLSX.utils.book_append_sheet(wb, wsGeneral, "Общие обещания");
  XLSX.writeFile(wb, "шаблон_обещаний.xlsx");
}

// ─── Вспомогательные функции ─────────────────────────────────────

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

function readRows(workbook: XLSX.WorkBook, sheetName: string): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1 });
}

// ─── Распознавание основного листа ───────────────────────────────

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

interface HeaderDetection {
  headerIdx: number;
  columnMap: Record<string, number>;
}

function detectMainHeader(rows: unknown[][]): HeaderDetection | null {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i];
    if (!row) continue;

    const map: Record<string, number> = {};
    row.forEach((cell, idx) => {
      const h = normHeader(cellStr(cell));
      if (!h) return;
      const rule = HEADER_RULES.find((r) => !(r.key in map) && r.test(h));
      if (rule) map[rule.key] = idx;
    });

    if (Object.keys(map).length >= 3) {
      return { headerIdx: i, columnMap: map };
    }
  }
  return null;
}

// ─── Распознавание листа общих обещаний ──────────────────────────

type GeneralFieldKey = "title" | "description" | "who" | "toWhom" | "metrics";

const GENERAL_HEADER_RULES: Array<{ key: GeneralFieldKey; test: (h: string) => boolean }> = [
  { key: "title", test: (h) => h.includes("общ") },
  { key: "description", test: (h) => h.includes("описан") },
  { key: "who", test: (h) => h.includes("кто") },
  { key: "toWhom", test: (h) => h.includes("кому") },
  { key: "metrics", test: (h) => h.includes("метри") },
];

interface GeneralHeaderDetection {
  headerIdx: number;
  columnMap: Partial<Record<GeneralFieldKey, number>>;
}

function detectGeneralHeader(rows: unknown[][]): GeneralHeaderDetection | null {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i];
    if (!row) continue;

    const map: Partial<Record<GeneralFieldKey, number>> = {};
    row.forEach((cell, idx) => {
      const h = normHeader(cellStr(cell));
      if (!h) return;
      const rule = GENERAL_HEADER_RULES.find((r) => !(r.key in map) && r.test(h));
      if (rule) map[rule.key] = idx;
    });

    // Лист считается таблицей общих обещаний, если есть колонка с заголовком
    if (map.title !== undefined) {
      return { headerIdx: i, columnMap: map };
    }
  }
  return null;
}

// ─── Основной парсинг ────────────────────────────────────────────

export async function parseWorkbook(file: File): Promise<ImportResult> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const rows = readRows(workbook, sheetName);

  const warnings: string[] = [];
  const valuesMap = new Map<string, ValueDef>();
  const rootsMap = new Map<string, RootDef>();
  const rootToValue = new Map<string, string>();
  const stats = { rows: 0, values: 0, roots: 0, supports: 0, general: 0 };

  const headerDetection = detectMainHeader(rows);
  if (!headerDetection) {
    throw new Error("Не найдена строка заголовков. Проверьте названия колонок.");
  }
  const { headerIdx, columnMap } = headerDetection;

  // Наследование значений для объединённых ячеек
  const carry = { whoRoot: "", toWhomRoot: "", value: "", root: "", rootMetrics: "" };

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    stats.rows++;

    const get = (key: FieldKey): string => {
      const idx = columnMap[key];
      return idx !== undefined ? cellStr(row[idx]) : "";
    };

    const whoRoot = get("whoRoot") || carry.whoRoot;
    const toWhomRoot = get("toWhomRoot") || carry.toWhomRoot;
    const valueName = get("value") || carry.value;
    const rootTitle = get("root") || carry.root;
    const rootMetrics = get("rootMetrics") || carry.rootMetrics;

    const supportTitle = get("support");
    const whoSupport = get("whoSupport");
    const toWhomSupport = get("toWhomSupport");
    const supportMetrics = get("supportMetrics");

    if (get("whoRoot")) carry.whoRoot = whoRoot;
    if (get("toWhomRoot")) carry.toWhomRoot = toWhomRoot;
    if (get("value")) carry.value = valueName;
    if (get("root")) carry.root = rootTitle;
    if (get("rootMetrics")) carry.rootMetrics = rootMetrics;

    if (!valueName && !rootTitle && !supportTitle) continue;

    if (!valueName) {
      warnings.push(`Строка ${i + 1}: отсутствует ценность`);
      continue;
    }

    let value = valuesMap.get(valueName);
    if (!value) {
      value = {
        id: `v-${slugify(valueName)}`,
        title: valueName,
        short: valueName,
        description: `Ценность: ${valueName}`,
        color: getValueColor(valuesMap.size),
        promises: [],
      };
      valuesMap.set(valueName, value);
      stats.values++;
    }

    if (!rootTitle) {
      if (supportTitle) {
        warnings.push(`Строка ${i + 1}: поддерживающее без корневого`);
      }
      continue;
    }

    let root = rootsMap.get(rootTitle);
    if (!root) {
      root = {
        id: `r-${slugify(rootTitle)}`,
        title: rootTitle,
        short: rootTitle,
        description: `Обещание: ${rootTitle}`,
        who: whoRoot || undefined,
        toWhom: toWhomRoot || undefined,
        metrics: rootMetrics || undefined,
        supports: [],
      };
      rootsMap.set(rootTitle, root);
      value.promises.push(root);
      rootToValue.set(rootTitle, valueName);
      stats.roots++;
    } else {
      const existingValueName = rootToValue.get(rootTitle);
      if (existingValueName && existingValueName !== valueName) {
        const existingValue = valuesMap.get(existingValueName);
        if (existingValue) {
          const existingCount = existingValue.promises.length;
          const currentCount = value.promises.length;

          if (currentCount < existingCount) {
            existingValue.promises = existingValue.promises.filter((p) => p.id !== root!.id);
            value.promises.push(root);
            rootToValue.set(rootTitle, valueName);
            warnings.push(
              `Обещание "${rootTitle}" перемещено из "${existingValueName}" (${existingCount} обещаний) в "${valueName}" (${currentCount + 1} обещаний)`,
            );
          } else if (currentCount === existingCount) {
            warnings.push(
              `Обещание "${rootTitle}" уже есть в "${existingValueName}" (${existingCount} обещаний). Оставлено там (количество равно).`,
            );
          } else {
            warnings.push(
              `Обещание "${rootTitle}" уже есть в "${existingValueName}" (${existingCount} обещаний). Оставлено там (в "${valueName}" больше обещаний: ${currentCount}).`,
            );
          }
        }
      }
    }

    if (supportTitle) {
      root.supports.push({
        id: `s-${slugify(supportTitle)}-${root.supports.length}`,
        title: supportTitle,
        description: `Поддерживающее: ${supportTitle}`,
        who: whoSupport || undefined,
        toWhom: toWhomSupport || undefined,
        metrics: supportMetrics || undefined,
      });
      stats.supports++;
    }
  }

  // ─── Общие обещания: ищем второй лист (по имени или по заголовкам) ───

  const generalPromises: GeneralPromiseDef[] = [];

  let generalSheetName: string | null =
    workbook.SheetNames.find((n) => n !== sheetName && n.toLowerCase().includes("общ")) ?? null;
  let generalHeader: GeneralHeaderDetection | null = generalSheetName
    ? detectGeneralHeader(readRows(workbook, generalSheetName))
    : null;

  if (!generalHeader) {
    for (const name of workbook.SheetNames) {
      if (name === sheetName) continue;
      const detected = detectGeneralHeader(readRows(workbook, name));
      if (detected) {
        generalSheetName = name;
        generalHeader = detected;
        break;
      }
    }
  }

  if (generalSheetName && generalHeader) {
    const generalRows = readRows(workbook, generalSheetName);
    const { columnMap: gMap } = generalHeader;

    const getGeneral = (row: unknown[], key: GeneralFieldKey): string => {
      const idx = gMap[key];
      return idx !== undefined ? cellStr(row[idx]) : "";
    };

    for (let i = generalHeader.headerIdx + 1; i < generalRows.length; i++) {
      const row = generalRows[i];
      if (!row || row.length === 0) continue;

      const title = getGeneral(row, "title");
      if (!title) {
        if (getGeneral(row, "description") || getGeneral(row, "who")) {
          warnings.push(`Лист "${generalSheetName}", строка ${i + 1}: отсутствует название общего обещания`);
        }
        continue;
      }

      if (generalPromises.some((p) => p.title === title)) {
        warnings.push(`Лист "${generalSheetName}", строка ${i + 1}: дубликат общего обещания "${title}"`);
        continue;
      }

      generalPromises.push({
        id: `g-${slugify(title)}`,
        title,
        description: getGeneral(row, "description") || title,
        who: getGeneral(row, "who"),
        toWhom: getGeneral(row, "toWhom") || undefined,
        metrics: getGeneral(row, "metrics") || undefined,
      });
      stats.general++;
    }
  }

  return {
    values: Array.from(valuesMap.values()),
    generalPromises,
    warnings,
    stats,
  };
}
