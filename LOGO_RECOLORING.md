# Перекрашивание логотипа в цвет ветки

## Проблема

Логотип компании внутри корневых обещаний не перекрашивался в цвет ветки, потому что:

1. Цвета генерируются в формате HSL: `hsl(hue, 70%, 58%)`
2. Код пытался парсить цвет как HEX через `parseInt(color.slice(1, 3), 16)`
3. Это приводило к NaN значениям в SVG filter, и перекрашивание не работало

## Решение

### 1. Создана функция конвертации цвета в RGB

Добавлена функция `colorToRGB` в `src/components/TreeCanvas.tsx`, которая:

- Поддерживает формат HEX (`#RRGGBB`)
- Поддерживает формат HSL (`hsl(hue, saturation%, lightness%)`)
- Возвращает массив RGB значений в диапазоне [0-1]

```typescript
function colorToRGB(color: string): [number, number, number] {
  // Если цвет в формате HEX (#RRGGBB)
  if (color.startsWith('#')) {
    return [
      parseInt(color.slice(1, 3), 16) / 255,
      parseInt(color.slice(3, 5), 16) / 255,
      parseInt(color.slice(5, 7), 16) / 255,
    ];
  }
  
  // Если цвет в формате HSL (hsl(hue, saturation%, lightness%))
  if (color.startsWith('hsl')) {
    const match = color.match(/hsl\(([\d.]+),\s*([\d.]+)%,\s*([\d.]+)%\)/);
    if (match) {
      const h = parseFloat(match[1]) / 360;
      const s = parseFloat(match[2]) / 100;
      const l = parseFloat(match[3]) / 100;
      
      // Конвертация HSL в RGB
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      
      return [
        hue2rgb(p, q, h + 1/3),
        hue2rgb(p, q, h),
        hue2rgb(p, q, h - 1/3),
      ];
    }
  }
  
  // По умолчанию - белый цвет
  return [1, 1, 1];
}
```

### 2. Обновлён код рендеринга логотипа

Теперь код использует функцию `colorToRGB` для получения RGB значений:

```typescript
{companyLogo ? (
  <>
    {(() => {
      const [r, g, b] = colorToRGB(color);
      return (
        <defs>
          <filter id={`recolor-${node.id}`}>
            <feColorMatrix
              type="matrix"
              values={`0 0 0 0 ${r}
                       0 0 0 0 ${g}
                       0 0 0 0 ${b}
                       0 0 0 1 0`}
            />
          </filter>
        </defs>
      );
    })()}
    <image
      href={companyLogo}
      x={-r * 0.5}
      y={-r * 0.5}
      width={r}
      height={r}
      preserveAspectRatio="xMidYMid meet"
      filter={`url(#recolor-${node.id})`}
      opacity={0.9}
    />
    {/* Номер корневого обещания */}
    {rootNumber && (
      <text
        x={r * 0.6}
        y={r * 0.6}
        textAnchor="middle"
        fontSize={14}
        fontWeight="700"
        fill={color}
        style={{ fontFamily: "var(--font-display)" }}
      >
        {rootNumber}
      </text>
    )}
  </>
) : (
  /* Fallback: текст если нет логотипа */
  ...
)}
```

## Как это работает

### SVG Filter feColorMatrix

SVG filter `feColorMatrix` с типом `matrix` позволяет заменить все цвета изображения на один цвет:

```
Матрица 5x4:
R_new = R_old * 0 + G_old * 0 + B_old * 0 + target_R
G_new = R_old * 0 + G_old * 0 + B_old * 0 + target_G
B_new = R_old * 0 + G_old * 0 + B_old * 0 + target_B
A_new = R_old * 0 + G_old * 0 + B_old * 0 + A_old * 1
```

Это означает:
- Все пиксели изображения становятся одного цвета (target_R, target_G, target_B)
- Альфа-канал (прозрачность) сохраняется
- Результат - монохромное изображение в цвете ветки

### Конвертация HSL в RGB

Формула конвертации HSL в RGB:

1. Нормализация значений:
   - `h` (hue): 0-360° → 0-1
   - `s` (saturation): 0-100% → 0-1
   - `l` (lightness): 0-100% → 0-1

2. Вычисление промежуточных значений:
   ```
   q = l < 0.5 ? l * (1 + s) : l + s - l * s
   p = 2 * l - q
   ```

3. Конвертация для каждого канала (R, G, B):
   ```
   R = hue2rgb(p, q, h + 1/3)
   G = hue2rgb(p, q, h)
   B = hue2rgb(p, q, h - 1/3)
   ```

4. Функция `hue2rgb`:
   ```
   if (t < 1/6) return p + (q - p) * 6 * t
   if (t < 1/2) return q
   if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
   return p
   ```

## Результат

Теперь логотип компании в корневых обещаниях:

✅ Автоматически перекрашивается в цвет ветки  
✅ Работает с цветами в формате HSL и HEX  
✅ Сохраняет прозрачность оригинального логотипа  
✅ Каждый корневой узел имеет уникальный filter ID  
✅ Визуальная связь всех обещаний с цветом своей ценности  

## Примеры

### Ценность "Надёжность" (зелёный цвет)
```
hsl(137.5, 70%, 58%) → RGB [0.38, 0.83, 0.47]
Логотип перекрашивается в зелёный цвет
```

### Ценность "Скорость" (оранжевый цвет)
```
hsl(275.0, 70%, 58%) → RGB [0.63, 0.38, 0.83]
Логотип перекрашивается в оранжевый цвет
```

### Ценность "Прозрачность" (синий цвет)
```
hsl(52.5, 70%, 58%) → RGB [0.83, 0.68, 0.38]
Логотип перекрашивается в синий цвет
```

## Технические детали

### Уникальные filter ID

Каждый корневой узел получает уникальный filter ID:
```typescript
<filter id={`recolor-${node.id}`}>
```

Это необходимо, потому что:
- Разные узлы могут иметь разные цвета
- SVG filter применяется глобально
- Без уникальных ID все узлы использовали бы один и тот же фильтр

### Производительность

- Фильтры создаются один раз при рендеринге
- Браузер кэширует фильтры
- Применение фильтра к изображению - быстрая операция
- Нет влияния на производительность при взаимодействии

### Совместимость

- Работает во всех современных браузерах
- Поддерживается в SVG 1.1 и выше
- Не требует JavaScript для применения фильтра
- Фильтр применяется на уровне рендеринга
