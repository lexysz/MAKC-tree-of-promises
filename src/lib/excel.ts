import type { WorkBook } from "xlsx";
import {
  getValueColor,
  findSupportByTitle,
  findSupportAnywhere,
  findGeneralByTitle,
  normalizeTitle,
  MAX_TREE_DEPTH,
} from "../data/tree";
import type { GeneralPromiseDef, RootDef, ValueDef, SupportDef } from "../data/tree";

// xlsx попадает в отдельный чанк и грузится только при первом импорте/экспорте.
let xlsxModule: Promise<typeof import("xlsx")> | null = null;
function loadXLSX(): Promise<typeof import("xlsx")> {
  if (!xlsxModule) xlsxModule = import("xlsx");
  return xlsxModule;
}

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
    chains: number;
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

export const CHAIN_TEMPLATE_HEADERS = [
  "Родительское обещание (поддерживающее или общее)",
  "Дочернее поддерживающее обещание",
  "Кто дает",
  "Кому",
  "Метрики",
];

export async function downloadTemplate() {
  const XLSX = await loadXLSX();
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

  const chainSampleData = [
    [
      "Ежемесячный отчёт о стабильности",
      "Автоматическая генерация отчёта",
      "DevOps",
      "Команда продукта",
      "Время генерации < 5 минут",
    ],
    [
      "Выплата за 24 часа после подачи документов",
      "Автоматическая проверка комплекта документов",
      "Урегулирование",
      "Все клиенты",
      "Проверка ≤ 2 часов",
    ],
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...sampleData]);
  XLSX.utils.book_append_sheet(wb, ws, "Обещания");
  const wsGeneral = XLSX.utils.aoa_to_sheet([GENERAL_TEMPLATE_HEADERS, ...generalSampleData]);
  XLSX.utils.book_append_sheet(wb, wsGeneral, "Общие обещания");
  const wsChains = XLSX.utils.aoa_to_sheet([CHAIN_TEMPLATE_HEADERS, ...chainSampleData]);
  XLSX.utils.book_append_sheet(wb, wsChains, "Поддерживающие (цепочки)");
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

/**
 * Дописывает метрику в список: метрики хранятся одной строкой через перенос.
 * Дубликаты игнорируются.
 */
function appendMetric(existing: string | undefined, add: string): string {
  const parts = (existing ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
  if (parts.includes(add)) return existing ?? add;
  parts.push(add);
  return parts.join("\n");
}

function normHeader(s: string): string {
  return s.toLowerCase().replace(/[^a-zа-яё0-9]/g, "");
}

async function readRows(workbook: WorkBook, sheetName: string): Promise<unknown[][]> {
  const XLSX = await loadXLSX();
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
  { key: "support", test: (h) => h.includes("поддерж") && !h.includes("кто") && !h.includes("кому") && !h.includes("метри") },
  { key: "root", test: (h) => h.includes("корнев") && !h.includes("метри") },
  { key: "whoSupport", test: (h) => h.includes("кто") && h.includes("дает") && !h.includes("команд") },
  { key: "toWhomSupport", test: (h) => h.includes("кому") && !h.includes("клиент") },
  { key: "whoRoot", test: (h) => h.includes("кто") && (h.includes("команд") || h.includes("дает")) },
  { key: "toWhomRoot", test: (h) => h.includes("кому") && (h.includes("клиент") || h.includes("рол")) },
  { key: "value", test: (h) => h.includes("ценност") },
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

    const supportIdx = map.support;
    row.forEach((cell, idx) => {
      const h = normHeader(cellStr(cell));
      if (!h || !h.includes("метри")) return;

      if (h.includes("корнев")) {
        if (!("rootMetrics" in map)) map.rootMetrics = idx;
        return;
      }
      if (h.includes("поддерж")) {
        if (!("supportMetrics" in map)) map.supportMetrics = idx;
        return;
      }

      if (supportIdx !== undefined) {
        if (idx < supportIdx) {
          if (!("rootMetrics" in map)) map.rootMetrics = idx;
        } else if (idx > supportIdx) {
          if (!("supportMetrics" in map)) map.supportMetrics = idx;
        }
      } else if (!("rootMetrics" in map)) {
        map.rootMetrics = idx;
      } else if (!("supportMetrics" in map)) {
        map.supportMetrics = idx;
      }
    });

    // Главный лист обязан иметь ценность + корневое + поддерживающее.
    if (map.value !== undefined && map.root !== undefined && map.support !== undefined) {
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

    if (map.title !== undefined) {
      return { headerIdx: i, columnMap: map };
    }
  }
  return null;
}

// ─── Распознавание листа цепочек поддерживающих обещаний ─────────

type ChainFieldKey = "parent" | "child" | "who" | "toWhom" | "metrics";

const CHAIN_HEADER_RULES: Array<{ key: ChainFieldKey; test: (h: string) => boolean }> = [
  { key: "parent", test: (h) => h.includes("родит") },
  { key: "child", test: (h) => h.includes("дочерн") || h.includes("поддерж") },
  { key: "who", test: (h) => h.includes("кто") },
  { key: "toWhom", test: (h) => h.includes("кому") },
  { key: "metrics", test: (h) => h.includes("метри") },
];

interface ChainHeaderDetection {
  headerIdx: number;
  columnMap: Partial<Record<ChainFieldKey, number>>;
}

function detectChainHeader(rows: unknown[][]): ChainHeaderDetection | null {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i];
    if (!row) continue;

    const map: Partial<Record<ChainFieldKey, number>> = {};
    row.forEach((cell, idx) => {
      const h = normHeader(cellStr(cell));
      if (!h) return;
      const rule = CHAIN_HEADER_RULES.find((r) => !(r.key in map) && r.test(h));
      if (rule) map[rule.key] = idx;
    });

    if (map.parent !== undefined && map.child !== undefined) {
      return { headerIdx: i, columnMap: map };
    }
  }
  return null;
}

// ─── Основной парсинг ────────────────────────────────────────────

export async function parseWorkbook(file: File): Promise<ImportResult> {
  const XLSX = await loadXLSX();
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array" });

  // Читаем все листы один раз и выбираем их ПО СОДЕРЖИМОМУ (заголовкам).
  const sheetNames = workbook.SheetNames;
  const rowsBySheet = new Map<string, unknown[][]>();
  for (const name of sheetNames) {
    rowsBySheet.set(name, await readRows(workbook, name));
  }

  const mainSheet =
    sheetNames.find((n) => detectMainHeader(rowsBySheet.get(n)!) !== null) ?? sheetNames[0];
  const sheetName = mainSheet;
  const rows = rowsBySheet.get(sheetName)!;

  const warnings: string[] = [];
  const valuesMap = new Map<string, ValueDef>();
  const rootsMap = new Map<string, RootDef>();
  const rootToValue = new Map<string, string>();
  const supportHome = new Map<string, string>();
  const lastSupportByRoot = new Map<string, SupportDef>();
  const stats = { rows: 0, values: 0, roots: 0, supports: 0, general: 0, chains: 0 };

  const headerDetection = detectMainHeader(rows);
  if (!headerDetection) {
    throw new Error("Не найдена строка заголовков. Проверьте названия колонок.");
  }
  const { headerIdx, columnMap } = headerDetection;

  const carry = { whoRoot: "", toWhomRoot: "", value: "", root: "" };

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

    const supportTitle = get("support");
    const whoSupport = get("whoSupport");
    const toWhomSupport = get("toWhomSupport");
    const rawRootMetrics = get("rootMetrics");
    const rawSupportMetrics = get("supportMetrics");

    if (get("whoRoot")) carry.whoRoot = whoRoot;
    if (get("toWhomRoot")) carry.toWhomRoot = toWhomRoot;
    if (get("value")) carry.value = valueName;
    if (get("root")) carry.root = rootTitle;

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
        metrics: undefined,
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

    if (rawRootMetrics) {
      root.metrics = appendMetric(root.metrics, rawRootMetrics);
    }

    let currentSupport: SupportDef | null = null;

    if (supportTitle) {
      const existingSupport = findSupportByTitle(value.promises, supportTitle);

      if (existingSupport) {
        currentSupport = existingSupport;
        const homeRootId = supportHome.get(existingSupport.id);
        if (homeRootId !== root.id && !existingSupport.extraParentIds?.includes(root.id)) {
          if (!existingSupport.extraParentIds) existingSupport.extraParentIds = [];
          existingSupport.extraParentIds.push(root.id);
          warnings.push(
            `Строка ${i + 1}: поддерживающее "${supportTitle}" связано также с корневым "${rootTitle}" (в пределах ценности "${valueName}")`,
          );
        }
      } else {
        currentSupport = {
          id: `s-${slugify(supportTitle)}-${root.supports.length}`,
          title: supportTitle,
          description: `Поддерживающее: ${supportTitle}`,
          who: whoSupport || undefined,
          toWhom: toWhomSupport || undefined,
          metrics: undefined,
        };
        root.supports.push(currentSupport);
        supportHome.set(currentSupport.id, root.id);
        stats.supports++;
      }
    } else {
      currentSupport = lastSupportByRoot.get(root.id) ?? null;
    }

    if (currentSupport) {
      lastSupportByRoot.set(root.id, currentSupport);
      if (whoSupport && !currentSupport.who) currentSupport.who = whoSupport;
      if (toWhomSupport && !currentSupport.toWhom) currentSupport.toWhom = toWhomSupport;
      if (rawSupportMetrics) {
        currentSupport.metrics = appendMetric(currentSupport.metrics, rawSupportMetrics);
      }
    }
  }

  // ─── Общие обещания: лист выбираем по заголовкам ───

  const generalPromises: GeneralPromiseDef[] = [];

  const generalSheetName =
    sheetNames.find((n) => n !== sheetName && detectGeneralHeader(rowsBySheet.get(n)!) !== null) ?? null;
  const generalHeader = generalSheetName ? detectGeneralHeader(rowsBySheet.get(generalSheetName)!) : null;

  if (generalSheetName && generalHeader) {
    const generalRows = rowsBySheet.get(generalSheetName)!;
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

  // ─── Цепочки: несколько детей, слияние метрик, отложенные ссылки ───

  const chainSheetName =
    sheetNames.find(
      (n) => n !== sheetName && n !== generalSheetName && detectChainHeader(rowsBySheet.get(n)!) !== null,
    ) ?? null;
  const chainHeader = chainSheetName ? detectChainHeader(rowsBySheet.get(chainSheetName)!) : null;

  if (chainSheetName && chainHeader) {
    const chainRows = rowsBySheet.get(chainSheetName)!;
    const { columnMap: cMap } = chainHeader;

    const getChain = (row: unknown[], key: ChainFieldKey): string => {
      const idx = cMap[key];
      return idx !== undefined ? cellStr(row[idx]) : "";
    };

    const valuesArray = Array.from(valuesMap.values());

    // Глубина каждого supporting: главные/общие прямые = 1, вложенные глубже.
    const depthOf = new Map<string, number>();
    const markDepths = (supports: SupportDef[] | undefined, depth: number) => {
      for (const s of supports ?? []) {
        depthOf.set(s.id, depth);
        markDepths(s.supports, depth + 1);
      }
    };
    for (const v of valuesArray) for (const r of v.promises) markDepths(r.supports, 1);
    for (const g of generalPromises) markDepths(g.supports, 1);

    interface PendingRow {
      i: number;
      parentTitle: string;
      childTitle: string;
      who?: string;
      toWhom?: string;
      metrics?: string;
    }

    // Пытается привязать строку. false = родитель ещё не существует (отложим).
    const tryAttach = (row: PendingRow): boolean => {
      const supportMatch = findSupportAnywhere(valuesArray, generalPromises, row.parentTitle);
      const generalMatch = findGeneralByTitle(generalPromises, row.parentTitle);
      if (!supportMatch && !generalMatch) return false;

      const targets: Array<{ list: SupportDef[]; depth: number }> = [];
      if (supportMatch) {
        const parentDepth = depthOf.get(supportMatch.id) ?? 1;
        const childDepth = parentDepth + 1;
        if (childDepth > MAX_TREE_DEPTH) {
          warnings.push(
            `Лист "${chainSheetName}", строка ${row.i}: превышена максимальная глубина дерева (${MAX_TREE_DEPTH}) для "${row.childTitle}"`,
          );
          return true;
        }
        if (!supportMatch.supports) supportMatch.supports = [];
        targets.push({ list: supportMatch.supports, depth: childDepth });
      }
      if (generalMatch) {
        if (!generalMatch.supports) generalMatch.supports = [];
        targets.push({ list: generalMatch.supports, depth: 1 });
      }

      let attached = false;
      for (const t of targets) {
        const existing = t.list.find((s) => normalizeTitle(s.title) === normalizeTitle(row.childTitle));
        if (existing) {
          // Повтор ребёнка = дополнение метрик/паспорта, без предупреждения.
          if (row.metrics) existing.metrics = appendMetric(existing.metrics, row.metrics);
          if (row.who && !existing.who) existing.who = row.who;
          if (row.toWhom && !existing.toWhom) existing.toWhom = row.toWhom;
          depthOf.set(existing.id, Math.max(depthOf.get(existing.id) ?? t.depth, t.depth));
        } else {
          const child: SupportDef = {
            id: `s-${slugify(row.childTitle)}-${t.list.length}`,
            title: row.childTitle,
            description: `Поддерживающее: ${row.childTitle}`,
            who: row.who,
            toWhom: row.toWhom,
            metrics: row.metrics,
          };
          t.list.push(child);
          depthOf.set(child.id, t.depth);
          attached = true;
        }
      }
      if (attached) stats.chains++;
      return true;
    };

    const pending: PendingRow[] = [];

    for (let i = chainHeader.headerIdx + 1; i < chainRows.length; i++) {
      const row = chainRows[i];
      if (!row || row.length === 0) continue;

      const parentTitle = getChain(row, "parent");
      const childTitle = getChain(row, "child");

      if (!parentTitle || !childTitle) {
        if (parentTitle || childTitle) {
          warnings.push(
            `Лист "${chainSheetName}", строка ${i + 1}: отсутствует родительское или дочернее обещание`,
          );
        }
        continue;
      }

      const pendingRow: PendingRow = {
        i: i + 1,
        parentTitle,
        childTitle,
        who: getChain(row, "who") || undefined,
        toWhom: getChain(row, "toWhom") || undefined,
        metrics: getChain(row, "metrics") || undefined,
      };

      if (!tryAttach(pendingRow)) pending.push(pendingRow);
    }

    // Отложенные строки: родитель может создаться более поздней строкой.
    // Повторяем проходы, пока есть прогресс.
    let remaining = pending;
    let progress = true;
    while (remaining.length > 0 && progress) {
      progress = false;
      const next: PendingRow[] = [];
      for (const row of remaining) {
        if (tryAttach(row)) progress = true;
        else next.push(row);
      }
      remaining = next;
    }
    for (const row of remaining) {
      warnings.push(
        `Лист "${chainSheetName}", строка ${row.i}: не найдено родительское обещание "${row.parentTitle}"`,
      );
    }
  }

  return {
    values: Array.from(valuesMap.values()),
    generalPromises,
    warnings,
    stats,
  };
}
