import * as XLSX from "xlsx";
import { getValueColor, VALUES } from "../data/tree";
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
    [
      "",
      "",
      "",
      "",
      "",
      "Резервные копии каждые 6 часов",
      "Инфраструктура",
      "Клиенты",
      "RPO ≤ 6ч",
    ],
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

export async function parseWorkbook(file: File): Promise<ImportResult> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

  const warnings: string[] = [];
  const valuesMap = new Map<string, ValueDef>();
  const rootsMap = new Map<string, RootDef>();
  let stats = { rows: 0, values: 0, roots: 0, supports: 0 };

  // Умное распознавание заголовков
  type FieldKey = "whoRoot" | "toWhomRoot" | "value" | "root" | "rootMetrics" | "support" | "whoSupport" | "toWhomSupport" | "supportMetrics";
  
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

  const normHeader = (s: string) => s.toLowerCase().replace(/[^a-zа-яё0-9]/g, "");
  const cellStr = (v: unknown): string => v === null || v === undefined ? "" : String(v).replace(/\r?\n/g, " ").trim();

  // Ищем строку заголовков
  let headerIdx = -1;
  let columnMap: Partial<Record<FieldKey, number>> = {};
  
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i];
    if (!row) continue;
    
    const map: Partial<Record<FieldKey, number>> = {};
    row.forEach((cell, idx) => {
      const h = normHeader(cellStr(cell));
      if (!h) return;
      const rule = HEADER_RULES.find((r) => !(r.key in map) && r.test(h));
      if (rule) map[rule.key] = idx;
    });
    
    if (Object.keys(map).length >= 3) {
      headerIdx = i;
      columnMap = map;
      break;
    }
  }

  if (headerIdx < 0) {
    throw new Error("Не найдена строка заголовков. Проверьте названия колонок.");
  }

  // Наследование значений для объединённых ячеек
  const carry = { whoRoot: "", toWhomRoot: "", value: "", root: "", rootMetrics: "" };
  
  // Отслеживаем, в какой ценности находится каждое корневое обещание
  const rootToValue = new Map<string, string>(); // rootTitle -> valueName

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    stats.rows++;

    const get = (key: FieldKey) => {
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

    // Обновляем carry для объединённых ячеек
    if (get("whoRoot")) carry.whoRoot = whoRoot;
    if (get("toWhomRoot")) carry.toWhomRoot = toWhomRoot;
    if (get("value")) carry.value = valueName;
    if (get("root")) carry.root = rootTitle;
    if (get("rootMetrics")) carry.rootMetrics = rootMetrics;

    if (!valueName && !rootTitle && !supportTitle) {
      continue;
    }

    if (!valueName) {
      warnings.push(`Строка ${i + 1}: отсутствует ценность`);
      continue;
    }

    // Создаем или получаем ценность
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

    // Создаем или получаем корневое обещание
    let root = rootsMap.get(rootTitle);
    if (!root) {
      // Создаём новое обещание
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
      stats.roots++;
      
      // Добавляем корневое обещание в ценность
      value.promises.push(root);
      rootToValue.set(rootTitle, valueName);
    } else {
      // Обещание уже существует - проверяем, нужно ли переместить его в другую ценность
      const existingValueName = rootToValue.get(rootTitle);
      
      if (existingValueName && existingValueName !== valueName) {
        const existingValue = valuesMap.get(existingValueName);
        
        if (existingValue) {
          // Сравниваем количество обещаний в ценностях
          const existingCount = existingValue.promises.length;
          const currentCount = value.promises.length;
          
          // Если в текущей ценности меньше обещаний - перемещаем обещание
          if (currentCount < existingCount) {
            // Удаляем из старой ценности
            existingValue.promises = existingValue.promises.filter(p => p.id !== root!.id);
            
            // Добавляем в текущую ценность
            value.promises.push(root);
            rootToValue.set(rootTitle, valueName);
            
            warnings.push(`Обещание "${rootTitle}" перемещено из "${existingValueName}" (${existingCount} обещаний) в "${valueName}" (${currentCount + 1} обещаний)`);
          } else if (currentCount === existingCount) {
            // Если одинаково - оставляем как есть
            warnings.push(`Обещание "${rootTitle}" уже есть в "${existingValueName}" (${existingCount} обещаний). Оставлено там (количество равно).`);
          } else {
            // Если в текущей больше - оставляем в старой
            warnings.push(`Обещание "${rootTitle}" уже есть в "${existingValueName}" (${existingCount} обещаний). Оставлено там (в "${valueName}" больше обещаний: ${currentCount}).`);
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

  return {
    values: Array.from(valuesMap.values()),
    warnings,
    stats,
  };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[а-яё]/g, (char) => {
      const map: Record<string, string> = {
        а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh",
        з: "z", и: "i", й: "y", л: "l", м: "m", н: "n", о: "o", п: "p",
        р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch",
        ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
      };
      return map[char] || char;
    })
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}
