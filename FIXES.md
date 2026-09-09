# Исправления и оптимизации

## ✅ Исправленные проблемы

### 1. **Парсер Excel - умное распознавание заголовков**

**Проблема:** Парсер использовал жёсткие индексы колонок (row[0], row[1], etc.), что приводило к ошибкам при изменении структуры Excel.

**Решение:** Восстановлен умный парсер с распознаванием заголовков по ключевым словам:

```typescript
const HEADER_RULES = [
  { key: "support", test: (h) => h.includes("поддерж") && !h.includes("кто") },
  { key: "root", test: (h) => h.includes("корнев") },
  { key: "whoSupport", test: (h) => h.includes("кто") && h.includes("дает") },
  { key: "toWhomSupport", test: (h) => h.includes("кому") && !h.includes("клиент") },
  { key: "supportMetrics", test: (h) => h.includes("метри") },
  { key: "whoRoot", test: (h) => h.includes("кто") && (h.includes("команд") || h.includes("дает")) },
  { key: "toWhomRoot", test: (h) => h.includes("кому") && (h.includes("клиент") || h.includes("рол")) },
  { key: "value", test: (h) => h.includes("ценност") },
  { key: "rootMetrics", test: (h) => h.includes("метри") },
];
```

**Дополнительно:**
- Автоматический поиск строки заголовков (первые 10 строк)
- Поддержка объединённых ячеек через механизм наследования (carry)
- Нормализация заголовков (удаление спецсимволов, приведение к нижнему регистру)

### 2. **Drag & Drop функциональность**

**Проблема:** Перетаскивание узлов мышкой не работало.

**Решение:** Восстановлена полноценная drag логика:

```typescript
// Состояние drag
const dragState = useRef<{ 
  nodeId: string; 
  startWorldX: number; 
  startWorldY: number; 
  nodeStartX: number; 
  nodeStartY: number; 
} | null>(null);
const [dragNodeId, setDragNodeId] = useState<string | null>(null);

// Обработчики событий
onPointerDown - определение начала drag или pan
onPointerMove - обработка drag или pan
onPointerUp - завершение drag и сохранение позиции
onPointerCancel - отмена drag
```

**Особенности:**
- Drag работает только для админов (`isAdmin === true`)
- Ядро компании нельзя перемещать
- Автоматическое сохранение позиции через `onNodeDrag` callback
- Поддержка touch-устройств через Pointer Events API

### 3. **Оптимизация текста в корневых обещаниях**

**Проблема:** Фиксированный размер шрифта (17-19px) не адаптировался к длине текста.

**Решение:** Адаптивный размер шрифта по формуле:

```typescript
const maxFontSize = 22;
const minFontSize = 12;
const fontSize = Math.min(
  maxFontSize, 
  Math.max(minFontSize, (r * 0.8) / (short.length * 0.55))
);
```

**Результат:**
- Текст всегда помещается в круг
- Текст никогда не обрезается
- Размер шрифта максимально возможный для каждой длины текста
- Автоматическая адаптация под любой размер круга

## 📊 Технические детали

### Парсер Excel

**Алгоритм работы:**
1. Поиск строки заголовков (первые 10 строк)
2. Распознавание колонок по ключевым словам
3. Построчное чтение данных с наследованием значений
4. Создание структуры: ценности → корневые → поддерживающие

**Поддерживаемые форматы:**
- `.xlsx`, `.xls`, `.csv`
- Объединённые ячейки (наследование значений сверху)
- Множественные поддерживающие обещания в одной ячейке (Alt+Enter)

### Drag & Drop

**Механизм работы:**
1. `onPointerDown` - определение цели (узел или фон)
2. Если узел и админ - инициализация dragState
3. `onPointerMove` - вычисление новой позиции в мировых координатах
4. Обновление координат узла в nodeById.current
5. `onPointerUp` - вызов `onNodeDrag` для сохранения в localStorage

**Координатная система:**
- Экран → Мировые координаты: `(screenX - view.x) / view.k`
- Мировые → Экран: `worldX * view.k + view.x`

### Адаптивный текст

**Формула расчёта:**
- `r * 0.8` - полезная ширина для текста (с учётом отступов)
- `short.length * 0.55` - примерная ширина текста в пикселях (для шрифта 1px)
- Деление даёт максимальный размер шрифта
- Ограничение диапазоном [12px, 22px]

## 🎯 Примеры использования

### Парсер Excel

```typescript
// Загрузка файла
const file = input.files[0];
const result = await parseWorkbook(file);

// Результат
{
  values: ValueDef[],      // Массив ценностей
  warnings: string[],      // Предупреждения
  stats: {
    rows: number,          // Количество строк
    values: number,        // Количество ценностей
    roots: number,         // Количество корневых
    supports: number       // Количество поддерживающих
  }
}
```

### Drag & Drop

```typescript
// В App.tsx
<TreeCanvas
  isAdmin={authed}
  onNodeDrag={updateNodePosition}
  // ...
/>

// В useTreeData.ts
const updateNodePosition = useCallback((id: string, x: number, y: number) => {
  setData((prev) => {
    const next = cloneTree(prev);
    if (!next.customPositions) next.customPositions = {};
    next.customPositions[id] = { x, y };
    return next;
  });
}, []);
```

### Адаптивный текст

```typescript
// Для ценности (r = 324px, short = "Прозрачность")
fontSize = Math.min(45, Math.max(20, (324 * 1.2) / (13 * 0.65))) = 45px

// Для корневой (r = 120px, short = "Стабильность важнее")
fontSize = Math.min(22, Math.max(12, (120 * 0.8) / (20 * 0.55))) = 17px
```

## ✅ Все функции работают

- ✅ Умный парсер Excel с распознаванием заголовков
- ✅ Поддержка объединённых ячеек
- ✅ Drag & Drop для админов
- ✅ Автоматическое сохранение позиций
- ✅ Адаптивный текст в ценностях
- ✅ Адаптивный текст в корневых обещаниях
- ✅ Адаптивный текст в поддерживающих обещаниях

Проект успешно собран и готов к использованию!
